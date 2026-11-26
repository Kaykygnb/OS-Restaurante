import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { soTipos } from "../permissoes.js";
import { registrarAuditoria } from "../operacao/auditoria.js";
import { promocaoVigente, type Promo } from "../dominio/promocao.js";

const TIPOS = new Set(["PERCENTUAL", "VALOR", "PRECO_FIXO", "LEVE_PAGUE"]);

function paraPromo(p: any): Promo {
  return {
    ...p,
    alvos: (p.alvos ?? []).map((a: any) => ({
      produto_id: a.produto_id,
      produto_variante_id: a.produto_variante_id,
      categoria_id: a.categoria_id,
    })),
  };
}

export async function rotasPromocoes(app: FastifyInstance) {
  const authGestao = { onRequest: [(app as any).autenticar, soTipos("ROOT", "ADMIN", "GERENTE")] };
  const authOps = { onRequest: [(app as any).autenticar, soTipos("ROOT", "ADMIN", "GERENTE", "ATENDENTE")] };

  app.get("/promocoes", authGestao, async () => {
    return prisma.promocao.findMany({ include: { alvos: true }, orderBy: { prioridade: "desc" } });
  });

  app.get("/promocoes/vigentes", authOps, async () => {
    const agora = new Date();
    const lista = await prisma.promocao.findMany({ where: { ativo: true }, include: { alvos: true } });
    return lista
      .filter((p) => promocaoVigente(paraPromo(p), agora, "BALCAO") || promocaoVigente(paraPromo(p), agora, "MESA"))
      .map((p) => ({ id: p.id, nome: p.nome, tipo: p.tipo, percentual: p.percentual, valor_centavos: p.valor_centavos, preco_fixo_centavos: p.preco_fixo_centavos }));
  });

  app.post("/promocoes", authGestao, async (req, reply) => {
    const body = req.body as any;
    if (!body?.nome || !TIPOS.has(body.tipo)) {
      return reply.code(400).send({ erro: "Informe nome e tipo da promoção.", codigo: "dados_invalidos" });
    }
    if (body.tipo === "COMBO") {
      return reply.code(400).send({ erro: "Combo fica para uma próxima versão.", codigo: "tipo_indisponivel" });
    }
    const criada = await prisma.promocao.create({
      data: {
        nome: String(body.nome).trim(),
        tipo: body.tipo,
        percentual: body.percentual ?? null,
        valor_centavos: body.valor_centavos ?? null,
        preco_fixo_centavos: body.preco_fixo_centavos ?? null,
        leve: body.leve ?? null,
        pague: body.pague ?? null,
        inicio_em: body.inicio_em ? new Date(body.inicio_em) : null,
        fim_em: body.fim_em ? new Date(body.fim_em) : null,
        dias_semana: body.dias_semana ?? 127,
        hora_inicio_min: body.hora_inicio_min ?? null,
        hora_fim_min: body.hora_fim_min ?? null,
        tipos_atendimento: body.tipos_atendimento ?? "MESA,BALCAO,RETIRADA,ENTREGA",
        limite_por_atendimento: body.limite_por_atendimento ?? null,
        limite_total: body.limite_total ?? null,
        acumulavel: Boolean(body.acumulavel),
        prioridade: body.prioridade ?? 0,
        inclui_extras: Boolean(body.inclui_extras),
        alvos: {
          create: (body.alvos ?? []).map((a: any) => ({
            produto_id: a.produto_id ?? null,
            produto_variante_id: a.produto_variante_id ?? null,
            categoria_id: a.categoria_id ?? null,
          })),
        },
      },
      include: { alvos: true },
    });
    await prisma.configuracao.updateMany({ data: { modulo_promocoes: true } });
    await registrarAuditoria(prisma, {
      usuario_id: Number((req.user as any).id),
      tipo: "promocao.criada",
      entidade: "Promocao",
      entidade_id: criada.id,
      detalhes: { nome: criada.nome, tipo: criada.tipo },
    });
    return reply.code(201).send(criada);
  });

  app.patch("/promocoes/:id", authGestao, async (req, reply) => {
    const id = Number((req.params as any).id);
    const body = req.body as any;
    const data: Record<string, unknown> = {};
    for (const campo of ["nome", "percentual", "valor_centavos", "preco_fixo_centavos", "leve", "pague", "dias_semana", "hora_inicio_min", "hora_fim_min", "tipos_atendimento", "limite_por_atendimento", "limite_total", "acumulavel", "prioridade", "inclui_extras", "ativo"] as const) {
      if (body[campo] !== undefined) data[campo] = body[campo];
    }
    if (body.inicio_em !== undefined) data.inicio_em = body.inicio_em ? new Date(body.inicio_em) : null;
    if (body.fim_em !== undefined) data.fim_em = body.fim_em ? new Date(body.fim_em) : null;
    if (body.encerrar) {
      data.ativo = false;
      data.fim_em = new Date();
    }
    const up = await prisma.promocao.update({ where: { id }, data });
    await registrarAuditoria(prisma, {
      usuario_id: Number((req.user as any).id),
      tipo: body.encerrar ? "promocao.encerrada" : "promocao.alterada",
      entidade: "Promocao",
      entidade_id: id,
    });
    return up;
  });
}
