import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { soTipos } from "../permissoes.js";
import { registrarAuditoria } from "../operacao/auditoria.js";
import { exigirAprovacao } from "../operacao/pin.js";
import { configEstoque, lancarMovimento } from "../servicos/estoque.js";
import { ErroRegra } from "../util/erros.js";
import type { TipoUsuario } from "../permissoes.js";

export async function rotasEstoque(app: FastifyInstance) {
  const authGestao = { onRequest: [(app as any).autenticar, soTipos("ROOT", "ADMIN", "GERENTE")] };

  app.get("/estoque/itens", authGestao, async (req, reply) => {
    const cfg = await configEstoque(prisma);
    if (cfg.nivel < 2) return reply.code(409).send({ erro: "O controle de quantidade está desligado.", codigo: "estoque_desligado" });
    const situacao = String((req.query as any)?.situacao ?? "");
    const variantes = await prisma.produto_variante.findMany({
      where: { ativo: true, produto: { controla_estoque: true, ativo: true } },
      include: { produto: { select: { nome: true, unidade_base: true } } },
    });
    const saldos = await prisma.saldo_estoque.findMany({ where: { item_tipo: "produto_variante" } });
    const minimos = await prisma.estoque_minimo.findMany({ where: { item_tipo: "produto_variante" } });
    const mapa = new Map(saldos.map((s) => [s.item_id, s.qtd_base]));
    const mins = new Map(minimos.map((m) => [m.item_id, m.minimo_base]));
    let itens = variantes.map((v) => ({
      produto_variante_id: v.id,
      nome: v.produto.nome,
      variante_nome: v.nome,
      unidade_base: v.produto.unidade_base,
      qtd_base: mapa.get(v.id) ?? 0,
      minimo_base: mins.get(v.id) ?? null,
      esgotado: v.esgotado,
    }));
    if (situacao === "zerado") itens = itens.filter((i) => i.qtd_base <= 0);
    if (situacao === "abaixo_minimo") itens = itens.filter((i) => i.minimo_base != null && i.qtd_base <= i.minimo_base);
    return itens;
  });

  app.get("/estoque/movimentos", authGestao, async (req) => {
    const item = Number((req.query as any)?.item);
    const de = (req.query as any)?.de ? new Date(String((req.query as any).de)) : undefined;
    const ate = (req.query as any)?.ate ? new Date(String((req.query as any).ate)) : undefined;
    return prisma.movimento_estoque.findMany({
      where: {
        ...(Number.isFinite(item) && item > 0 ? { item_id: item } : {}),
        ...(de || ate ? { criado_em: { ...(de ? { gte: de } : {}), ...(ate ? { lte: ate } : {}) } } : {}),
      },
      orderBy: { criado_em: "desc" },
      take: 200,
    });
  });

  app.post("/estoque/movimentos", authGestao, async (req, reply) => {
    const body = req.body as {
      tipo?: string;
      item_id?: number;
      qtd_base?: number;
      motivo?: string;
      custo_unit_centavos?: number;
      aprovacao?: { aprovador_id?: number; pin?: string };
    };
    if (body.tipo !== "ENTRADA" && body.tipo !== "PERDA" && body.tipo !== "CORRECAO") {
      return reply.code(400).send({ erro: "Tipo de movimento inválido. Entrada por nota fica para o nível 4.", codigo: "tipo_invalido" });
    }
    if ((body.tipo === "PERDA" || body.tipo === "CORRECAO") && !body.motivo?.trim()) {
      return reply.code(400).send({ erro: "Informe o motivo.", codigo: "motivo_obrigatorio" });
    }
    const qtd = Math.round(Number(body.qtd_base));
    if (!Number.isFinite(qtd) || qtd === 0) {
      return reply.code(400).send({ erro: "Informe a quantidade.", codigo: "quantidade_invalida" });
    }
    const tipo = (req.user as any).tipo as TipoUsuario;
    const usuarioId = Number((req.user as any).id);
    const sensivel = body.tipo !== "ENTRADA";
    if (sensivel) {
      const aprov = await exigirAprovacao({
        tipo,
        usuarioId,
        pin: body.aprovacao?.pin ?? null,
        aprovadorId: body.aprovacao?.aprovador_id ?? null,
        acimaDoLimite: tipo === "ATENDENTE",
        acao: `estoque.${body.tipo.toLowerCase()}`,
      });
      if (!aprov && tipo === "ATENDENTE") {
        return reply.code(403).send({ erro: "Peça o PIN de um gerente.", codigo: "pin_invalido" });
      }
    }
    try {
      const mov = await prisma.$transaction((tx) =>
        lancarMovimento(tx, {
          tipo: body.tipo as "ENTRADA" | "PERDA" | "CORRECAO",
          item_id: Number(body.item_id),
          qtd_base: qtd,
          motivo: body.motivo?.trim() || null,
          custo_unit_centavos: body.custo_unit_centavos ?? null,
          usuario_id: usuarioId,
        })
      );
      const mapa = { ENTRADA: "estoque.entrada", PERDA: "estoque.perda", CORRECAO: "estoque.correcao" } as const;
      await registrarAuditoria(prisma, {
        usuario_id: usuarioId,
        tipo: mapa[body.tipo],
        sensivel,
        entidade: "Produto_variante",
        entidade_id: Number(body.item_id),
        motivo: body.motivo?.trim() ?? null,
        valor_centavos: body.custo_unit_centavos ?? null,
        detalhes: { qtd_base: mov.qtd_base },
      });
      return reply.code(201).send(mov);
    } catch (err) {
      if (err instanceof ErroRegra) return reply.code(err.status).send(err.corpo());
      throw err;
    }
  });

  app.get("/estoque/verificar", authGestao, async () => {
    const movimentos = await prisma.movimento_estoque.groupBy({
      by: ["item_tipo", "item_id"],
      _sum: { qtd_base: true },
    });
    const saldos = await prisma.saldo_estoque.findMany();
    const cache = new Map(saldos.map((s) => [`${s.item_tipo}:${s.item_id}`, s.qtd_base]));
    const diferencas: { item_tipo: string; item_id: number; cache: number; movimentos: number }[] = [];
    for (const mov of movimentos) {
      const chave = `${mov.item_tipo}:${mov.item_id}`;
      const soma = mov._sum.qtd_base ?? 0;
      const atual = cache.get(chave) ?? 0;
      if (atual !== soma) {
        diferencas.push({ item_tipo: mov.item_tipo, item_id: mov.item_id, cache: atual, movimentos: soma });
        await prisma.saldo_estoque.upsert({
          where: { item_tipo_item_id: { item_tipo: mov.item_tipo, item_id: mov.item_id } },
          create: { item_tipo: mov.item_tipo, item_id: mov.item_id, qtd_base: soma },
          update: { qtd_base: soma },
        });
      }
    }
    return { ok: diferencas.length === 0, diferencas };
  });
}
