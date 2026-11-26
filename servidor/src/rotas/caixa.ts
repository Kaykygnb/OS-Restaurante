import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { soTipos, type TipoUsuario } from "../permissoes.js";
import { registrarAuditoria } from "../operacao/auditoria.js";
import { validarPinGerente } from "../operacao/pin.js";
import { documentoGaveta } from "../impressao/documentos.js";
import { imprimirAgora } from "../impressao/fila.js";

async function sessaoAberta() {
  return prisma.caixa_sessao.findFirst({
    where: { fechado_em: null },
    orderBy: { aberto_em: "desc" },
    include: {
      usuario_abertura: { select: { id: true, nome: true } },
      _count: { select: { pagamentos: true, movimentacoes: true } },
    },
  });
}

export async function rotasCaixa(app: FastifyInstance) {
  const authOps = {
    onRequest: [(app as any).autenticar, soTipos("ROOT", "ADMIN", "GERENTE", "ATENDENTE")],
  };
  const authGestao = {
    onRequest: [(app as any).autenticar, soTipos("ROOT", "ADMIN", "GERENTE")],
  };

  app.get("/formas-pagamento", authOps, async () => {
    return prisma.forma_pagamento.findMany({
      where: { ativo: true },
      orderBy: { ordem: "asc" },
    });
  });

  app.get("/caixa/atual", authOps, async () => {
    const s = await sessaoAberta();
    return { aberto: Boolean(s), sessao: s };
  });

  app.post("/caixa/abrir", authOps, async (req, reply) => {
    const aberta = await sessaoAberta();
    if (aberta) {
      return reply.code(409).send({
        erro: `Já existe caixa aberto desde ${aberta.aberto_em.toISOString()}`,
        sessao_id: aberta.id,
      });
    }
    const fundo = Math.max(0, Math.round(Number((req.body as any)?.fundo_troco_centavos ?? 0)));
    const usuario_id = Number((req.user as any).id);
    const sessao = await prisma.caixa_sessao.create({
      data: { usuario_abertura_id: usuario_id, fundo_troco_centavos: fundo },
      include: { usuario_abertura: { select: { id: true, nome: true } } },
    });
    await registrarAuditoria(prisma, {
      usuario_id,
      acao: "ABRIR_CAIXA",
      entidade: "Caixa_sessao",
      entidade_id: sessao.id,
      detalhes: { fundo },
    });
    return reply.code(201).send(sessao);
  });

  app.post("/caixa/:id/movimentacao", authOps, async (req, reply) => {
    const id = Number((req.params as any).id);
    const body = req.body as {
      tipo?: "SANGRIA" | "SUPRIMENTO";
      valor_centavos?: number;
      motivo?: string;
      pin?: string;
    };
    if (!Number.isFinite(id)) return reply.code(400).send({ erro: "ID inválido" });
    if (body.tipo !== "SANGRIA" && body.tipo !== "SUPRIMENTO") {
      return reply.code(400).send({ erro: "tipo inválido" });
    }
    const valor = Math.round(Number(body.valor_centavos));
    if (!Number.isFinite(valor) || valor <= 0) return reply.code(400).send({ erro: "Valor inválido" });
    const motivo = body.motivo?.trim();
    if (!motivo) return reply.code(400).send({ erro: "Informe o motivo" });

    const sessao = await prisma.caixa_sessao.findUnique({ where: { id } });
    if (!sessao || sessao.fechado_em) {
      return reply.code(400).send({ erro: "Caixa não está aberto" });
    }

    const tipoUser = (req.user as any).tipo as TipoUsuario;
    if (body.tipo === "SANGRIA" && !["ROOT", "ADMIN", "GERENTE"].includes(tipoUser)) {
      const aprov = await validarPinGerente(body.pin);
      if (!aprov) return reply.code(403).send({ erro: "Sangria exige GERENTE+ ou PIN válido" });
    }

    const usuario_id = Number((req.user as any).id);
    const mov = await prisma.movimentacao_caixa.create({
      data: {
        caixa_sessao_id: id,
        tipo: body.tipo,
        valor_centavos: valor,
        motivo,
        usuario_id,
      },
    });
    await registrarAuditoria(prisma, {
      usuario_id,
      acao: body.tipo,
      entidade: "Movimentacao_caixa",
      entidade_id: mov.id,
      detalhes: { valor, motivo, caixa_sessao_id: id },
    });
    return reply.code(201).send(mov);
  });

  app.post("/caixa/:id/fechar", authGestao, async (req, reply) => {
    const id = Number((req.params as any).id);
    const informado = Math.round(Number((req.body as any)?.valor_informado_centavos));
    if (!Number.isFinite(id) || !Number.isFinite(informado) || informado < 0) {
      return reply.code(400).send({ erro: "Informe o valor contado em caixa" });
    }
    const sessao = await prisma.caixa_sessao.findUnique({
      where: { id },
      include: { pagamentos: { include: { forma_pagamento: true } }, movimentacoes: true },
    });
    if (!sessao || sessao.fechado_em) {
      return reply.code(400).send({ erro: "Caixa não está aberto" });
    }

    const dinheiroIn = sessao.pagamentos
      .filter((p) => p.forma_pagamento.abre_gaveta)
      .reduce((s, p) => s + p.valor_centavos, 0);
    // Troco sai do caixa: valor_recebido - valor = troco; o que fica é valor (já em dinheiroIn)
    // Na prática dinheiro no gaveta ≈ fundo + valores dinheiro - sangrias + suprimentos
    // (troco já foi devolvido ao cliente a partir do valor_recebido)
    const sangrias = sessao.movimentacoes
      .filter((m) => m.tipo === "SANGRIA")
      .reduce((s, m) => s + m.valor_centavos, 0);
    const suprimentos = sessao.movimentacoes
      .filter((m) => m.tipo === "SUPRIMENTO")
      .reduce((s, m) => s + m.valor_centavos, 0);
    const esperado = sessao.fundo_troco_centavos + dinheiroIn - sangrias + suprimentos;
    const diferenca = informado - esperado;
    const usuario_id = Number((req.user as any).id);

    const fechada = await prisma.caixa_sessao.update({
      where: { id },
      data: {
        fechado_em: new Date(),
        usuario_fechamento_id: usuario_id,
        valor_esperado_centavos: esperado,
        valor_informado_centavos: informado,
        diferenca_centavos: diferenca,
      },
    });
    await registrarAuditoria(prisma, {
      usuario_id,
      acao: "FECHAR_CAIXA",
      entidade: "Caixa_sessao",
      entidade_id: id,
      detalhes: { esperado, informado, diferenca },
    });
    return fechada;
  });

  app.post("/caixa/gaveta", authOps, async (req, reply) => {
    const pin = (req.body as any)?.pin as string | undefined;
    const tipo = (req.user as any).tipo as TipoUsuario;
    if (!["ROOT", "ADMIN", "GERENTE"].includes(tipo)) {
      const ok = await validarPinGerente(pin);
      if (!ok) return reply.code(403).send({ erro: "Abrir gaveta sem venda exige GERENTE+ ou PIN" });
    }
    const cfg = await prisma.configuracao.findFirst({ orderBy: { id: "asc" } });
    if (!cfg?.impressora_caixa_id) {
      return reply.code(400).send({ erro: "Configure a impressora do caixa" });
    }
    const imp = await prisma.impressora.findUnique({ where: { id: cfg.impressora_caixa_id } });
    if (!imp || !imp.ativo) return reply.code(400).send({ erro: "Impressora do caixa indisponível" });

    try {
      await imprimirAgora(imp, "COMPROVANTE", documentoGaveta());
    } catch (err) {
      return reply.code(502).send({
        erro: err instanceof Error ? err.message : "Falha ao abrir gaveta",
      });
    }
    await registrarAuditoria(prisma, {
      usuario_id: Number((req.user as any).id),
      acao: "ABRIR_GAVETA",
      entidade: "Impressora",
      entidade_id: imp.id,
      detalhes: { sem_venda: true },
    });
    return { ok: true };
  });
}
