import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { soTipos, type TipoUsuario } from "../permissoes.js";
import { registrarAuditoria } from "../operacao/auditoria.js";
import { proximoCodigo } from "../operacao/sequencia.js";
import { totalAtendimentoAberto } from "../operacao/totais.js";

const TIPOS = new Set(["BALCAO", "RETIRADA", "ENTREGA", "MESA"]);

const includeDetalhe = {
  mesa: { select: { id: true, numero: true } },
  usuario: { select: { id: true, nome: true } },
  pedidos: {
    orderBy: { createdAt: "asc" as const },
    include: {
      itens: {
        include: {
          escolhas: true,
          adicionais: true,
          produto_variante: {
            select: {
              id: true,
              produto: { select: { id: true, exige_preparo: true, categoria_id: true } },
            },
          },
        },
      },
    },
  },
  pagamentos: {
    orderBy: { criado_em: "asc" as const },
    include: {
      forma_pagamento: { select: { id: true, nome: true, abre_gaveta: true } },
      usuario: { select: { id: true, nome: true } },
    },
  },
};

function montarResposta(at: any) {
  const itens = at.pedidos.flatMap((p: any) => p.itens);
  const pago = (at.pagamentos as any[]).reduce((s, p) => s + p.valor_centavos, 0);
  const totais =
    at.status === "FECHADO" && at.total_centavos != null
      ? {
          subtotal_centavos: at.subtotal_centavos,
          total_centavos: at.total_centavos,
          pago_centavos: pago,
          restante_centavos: Math.max(0, (at.total_centavos as number) - pago),
          congelado: true,
        }
      : {
          ...totalAtendimentoAberto({
            itens,
            desconto_centavos: at.desconto_centavos,
            acrescimo_centavos: at.acrescimo_centavos,
            taxa_servico_centavos: at.taxa_servico_centavos,
            taxa_entrega_centavos: at.taxa_entrega_centavos,
            pago_centavos: pago,
          }),
          congelado: false,
        };

  return { ...at, totais };
}

export async function rotasAtendimentos(app: FastifyInstance) {
  const authOps = {
    onRequest: [(app as any).autenticar, soTipos("ROOT", "ADMIN", "GERENTE", "ATENDENTE")],
  };
  const authGestao = {
    onRequest: [(app as any).autenticar, soTipos("ROOT", "ADMIN", "GERENTE")],
  };

  app.get("/atendimentos", authOps, async (req) => {
    const status = String((req.query as any)?.status ?? "ABERTO").toUpperCase();
    const where: Record<string, unknown> = {};
    if (status !== "TODOS") where.status = status;

    const lista = await prisma.atendimento.findMany({
      where,
      orderBy: { aberto_em: "desc" },
      include: {
        mesa: { select: { id: true, numero: true } },
        usuario: { select: { id: true, nome: true } },
        _count: { select: { pedidos: true } },
      },
      take: 200,
    });
    return lista;
  });

  app.get("/atendimentos/:id", authOps, async (req, reply) => {
    const id = Number((req.params as any).id);
    if (!Number.isFinite(id)) return reply.code(400).send({ erro: "ID inválido" });
    const at = await prisma.atendimento.findUnique({ where: { id }, include: includeDetalhe });
    if (!at) return reply.code(404).send({ erro: "Atendimento não encontrado" });
    return montarResposta(at);
  });

  app.post("/atendimentos", authOps, async (req, reply) => {
    const body = req.body as {
      tipo_atendimento?: string;
      mesa_id?: number | null;
      cliente_nome?: string | null;
      cliente_telefone?: string | null;
      cliente_endereco?: string | null;
      observacao?: string | null;
    };

    const tipo = body.tipo_atendimento?.toUpperCase();
    if (!tipo || !TIPOS.has(tipo)) {
      return reply.code(400).send({ erro: "tipo_atendimento inválido" });
    }

    const usuario_id = Number((req.user as any).id);
    let mesa_id: number | null = body.mesa_id != null ? Number(body.mesa_id) : null;
    let taxa_entrega = 0;

    if (tipo === "MESA") {
      if (!mesa_id || !Number.isFinite(mesa_id)) {
        return reply.code(400).send({ erro: "Informe a mesa" });
      }
      const mesa = await prisma.mesa.findUnique({ where: { id: mesa_id } });
      if (!mesa || !mesa.ativo) return reply.code(404).send({ erro: "Mesa não encontrada" });
      const ocupada = await prisma.atendimento.findFirst({
        where: { mesa_id, status: "ABERTO" },
      });
      if (ocupada) {
        return reply.code(409).send({
          erro: `Mesa ${mesa.numero} já tem atendimento aberto (${ocupada.codigo_atendimento})`,
        });
      }
    } else {
      mesa_id = null;
    }

    if (tipo === "ENTREGA") {
      const cfg = await prisma.configuracao.findFirst({ orderBy: { id: "asc" } });
      taxa_entrega = cfg?.taxa_entrega_centavos ?? 0;
      if (!body.cliente_telefone?.trim() && !body.cliente_nome?.trim()) {
        return reply.code(400).send({ erro: "Informe nome ou telefone do cliente na entrega" });
      }
    }

    const criado = await prisma.$transaction(async (tx) => {
      const codigo = await proximoCodigo(tx, "ATENDIMENTO", "AT");
      return tx.atendimento.create({
        data: {
          codigo_atendimento: codigo,
          tipo_atendimento: tipo as any,
          usuario_id,
          mesa_id,
          cliente_nome: body.cliente_nome?.trim() || null,
          cliente_telefone: body.cliente_telefone?.trim() || null,
          cliente_endereco: body.cliente_endereco?.trim() || null,
          observacao: body.observacao?.trim() || null,
          taxa_entrega_centavos: taxa_entrega,
        },
        include: includeDetalhe,
      });
    });

    await registrarAuditoria(prisma, {
      usuario_id,
      acao: "ABRIR_ATENDIMENTO",
      entidade: "Atendimento",
      entidade_id: criado.id,
      detalhes: { codigo: criado.codigo_atendimento, tipo, mesa_id },
    });

    return reply.code(201).send(montarResposta(criado));
  });

  app.put("/atendimentos/:id", authOps, async (req, reply) => {
    const id = Number((req.params as any).id);
    if (!Number.isFinite(id)) return reply.code(400).send({ erro: "ID inválido" });
    const atual = await prisma.atendimento.findUnique({ where: { id } });
    if (!atual) return reply.code(404).send({ erro: "Atendimento não encontrado" });
    if (atual.status !== "ABERTO") {
      return reply.code(400).send({ erro: "Só é possível editar atendimento aberto" });
    }

    const body = req.body as {
      cliente_nome?: string | null;
      cliente_telefone?: string | null;
      cliente_endereco?: string | null;
      observacao?: string | null;
    };

    const data: Record<string, unknown> = {};
    if (body.cliente_nome !== undefined) data.cliente_nome = body.cliente_nome?.trim() || null;
    if (body.cliente_telefone !== undefined) {
      data.cliente_telefone = body.cliente_telefone?.trim() || null;
    }
    if (body.cliente_endereco !== undefined) {
      data.cliente_endereco = body.cliente_endereco?.trim() || null;
    }
    if (body.observacao !== undefined) data.observacao = body.observacao?.trim() || null;

    const atualizado = await prisma.atendimento.update({
      where: { id },
      data,
      include: includeDetalhe,
    });
    return montarResposta(atualizado);
  });

  app.post("/atendimentos/:id/transferir", authOps, async (req, reply) => {
    const id = Number((req.params as any).id);
    const body = req.body as { mesa_id?: number };
    const mesa_id = Number(body.mesa_id);
    if (!Number.isFinite(id) || !Number.isFinite(mesa_id)) {
      return reply.code(400).send({ erro: "Informe atendimento e mesa destino" });
    }

    const at = await prisma.atendimento.findUnique({ where: { id } });
    if (!at) return reply.code(404).send({ erro: "Atendimento não encontrado" });
    if (at.status !== "ABERTO") return reply.code(400).send({ erro: "Atendimento não está aberto" });
    if (at.tipo_atendimento !== "MESA") {
      return reply.code(400).send({ erro: "Só atendimentos de mesa podem transferir" });
    }

    const mesa = await prisma.mesa.findUnique({ where: { id: mesa_id } });
    if (!mesa || !mesa.ativo) return reply.code(404).send({ erro: "Mesa destino não encontrada" });
    if (at.mesa_id === mesa_id) {
      return reply.code(400).send({ erro: "Atendimento já está nesta mesa" });
    }

    const ocupada = await prisma.atendimento.findFirst({
      where: { mesa_id, status: "ABERTO", id: { not: id } },
    });
    if (ocupada) {
      return reply.code(409).send({
        erro: `Mesa ${mesa.numero} ocupada (${ocupada.codigo_atendimento})`,
      });
    }

    const usuario_id = Number((req.user as any).id);
    const atualizado = await prisma.$transaction(async (tx) => {
      const up = await tx.atendimento.update({
        where: { id },
        data: { mesa_id },
        include: includeDetalhe,
      });
      await registrarAuditoria(tx, {
        usuario_id,
        acao: "TRANSFERIR_MESA",
        entidade: "Atendimento",
        entidade_id: id,
        detalhes: { de: at.mesa_id, para: mesa_id },
      });
      return up;
    });

    return montarResposta(atualizado);
  });

  app.post("/atendimentos/:id/juntar", authGestao, async (req, reply) => {
    const origem_id = Number((req.params as any).id);
    const destino_id = Number((req.body as any)?.destino_id);
    if (!Number.isFinite(origem_id) || !Number.isFinite(destino_id)) {
      return reply.code(400).send({ erro: "Informe origem e destino_id" });
    }
    if (origem_id === destino_id) {
      return reply.code(400).send({ erro: "Origem e destino devem ser diferentes" });
    }

    const [origem, destino] = await Promise.all([
      prisma.atendimento.findUnique({ where: { id: origem_id }, include: { pagamentos: true } }),
      prisma.atendimento.findUnique({ where: { id: destino_id } }),
    ]);
    if (!origem || !destino) return reply.code(404).send({ erro: "Atendimento não encontrado" });
    if (origem.status !== "ABERTO" || destino.status !== "ABERTO") {
      return reply.code(400).send({ erro: "Os dois atendimentos precisam estar abertos" });
    }
    if (origem.pagamentos.length) {
      return reply.code(400).send({ erro: "Origem já tem pagamentos — não é possível juntar" });
    }

    const usuario_id = Number((req.user as any).id);
    const resultado = await prisma.$transaction(async (tx) => {
      await tx.pedido.updateMany({
        where: { atendimento_id: origem_id },
        data: { atendimento_id: destino_id },
      });
      await tx.trabalho_impressao.updateMany({
        where: { atendimento_id: origem_id },
        data: { atendimento_id: destino_id },
      });

      // Soma ajustes simples na destino
      await tx.atendimento.update({
        where: { id: destino_id },
        data: {
          desconto_centavos: destino.desconto_centavos + origem.desconto_centavos,
          acrescimo_centavos: destino.acrescimo_centavos + origem.acrescimo_centavos,
          taxa_entrega_centavos: destino.taxa_entrega_centavos + origem.taxa_entrega_centavos,
          observacao: [destino.observacao, origem.observacao, `Juntado ${origem.codigo_atendimento}`]
            .filter(Boolean)
            .join(" | "),
        },
      });

      await tx.atendimento.update({
        where: { id: origem_id },
        data: {
          status: "CANCELADO",
          fechado_em: new Date(),
          mesa_id: null,
          observacao: [origem.observacao, `Juntado em ${destino.codigo_atendimento}`]
            .filter(Boolean)
            .join(" | "),
        },
      });

      await registrarAuditoria(tx, {
        usuario_id,
        acao: "JUNTAR_ATENDIMENTO",
        entidade: "Atendimento",
        entidade_id: destino_id,
        detalhes: {
          origem_id,
          origem_codigo: origem.codigo_atendimento,
          destino_codigo: destino.codigo_atendimento,
        },
      });

      return tx.atendimento.findUnique({ where: { id: destino_id }, include: includeDetalhe });
    });

    return montarResposta(resultado);
  });

  app.post("/atendimentos/:id/cancelar", authOps, async (req, reply) => {
    const id = Number((req.params as any).id);
    if (!Number.isFinite(id)) return reply.code(400).send({ erro: "ID inválido" });
    const motivo = String((req.body as any)?.motivo ?? "").trim();

    const at = await prisma.atendimento.findUnique({
      where: { id },
      include: { pagamentos: true, pedidos: { select: { id: true } } },
    });
    if (!at) return reply.code(404).send({ erro: "Atendimento não encontrado" });
    if (at.status !== "ABERTO") return reply.code(400).send({ erro: "Atendimento não está aberto" });
    if (at.pagamentos.length) {
      return reply.code(400).send({ erro: "Há pagamentos — não cancele; use o fluxo de estorno depois" });
    }

    const tipo = (req.user as any).tipo as TipoUsuario;
    if (at.pedidos.length && !["ROOT", "ADMIN", "GERENTE"].includes(tipo)) {
      return reply.code(403).send({ erro: "Atendimento com pedidos: só GERENTE+ cancela" });
    }
    if (!motivo && at.pedidos.length) {
      return reply.code(400).send({ erro: "Informe o motivo do cancelamento" });
    }

    const usuario_id = Number((req.user as any).id);
    const atualizado = await prisma.$transaction(async (tx) => {
      const up = await tx.atendimento.update({
        where: { id },
        data: {
          status: "CANCELADO",
          fechado_em: new Date(),
          observacao: [at.observacao, motivo ? `Cancelado: ${motivo}` : "Cancelado"]
            .filter(Boolean)
            .join(" | "),
        },
        include: includeDetalhe,
      });
      await registrarAuditoria(tx, {
        usuario_id,
        acao: "CANCELAR_ATENDIMENTO",
        entidade: "Atendimento",
        entidade_id: id,
        detalhes: { motivo, codigo: at.codigo_atendimento },
      });
      return up;
    });

    return montarResposta(atualizado);
  });
}
