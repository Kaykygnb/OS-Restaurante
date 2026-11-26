import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { soTipos, type TipoUsuario } from "../permissoes.js";
import { registrarAuditoria } from "../operacao/auditoria.js";
import { tipoPodeAprovarSemPin, validarPinGerente } from "../operacao/pin.js";
import { linhaItemCentavos, totalAtendimentoAberto } from "../operacao/totais.js";
import { documentoComprovante, documentoConta, documentoGaveta } from "../impressao/documentos.js";
import { enfileirarTrabalho, imprimirAgora } from "../impressao/fila.js";

async function carregarAberto(id: number) {
  return prisma.atendimento.findUnique({
    where: { id },
    include: {
      mesa: true,
      pedidos: { include: { itens: { include: { escolhas: true, adicionais: true } } } },
      pagamentos: { include: { forma_pagamento: true } },
    },
  });
}

async function exigirCaixaAberto() {
  return prisma.caixa_sessao.findFirst({ where: { fechado_em: null }, orderBy: { aberto_em: "desc" } });
}

export async function rotasFechamento(app: FastifyInstance) {
  const authOps = {
    onRequest: [(app as any).autenticar, soTipos("ROOT", "ADMIN", "GERENTE", "ATENDENTE")],
  };

  app.post("/atendimentos/:id/taxa-servico", authOps, async (req, reply) => {
    const id = Number((req.params as any).id);
    const aplicar = Boolean((req.body as any)?.aplicar);
    const at = await carregarAberto(id);
    if (!at || at.status !== "ABERTO") return reply.code(400).send({ erro: "Atendimento inválido" });

    const cfg = await prisma.configuracao.findFirst({ orderBy: { id: "asc" } });
    const pct = cfg?.taxa_servico_percentual ?? 10;
    const itens = at.pedidos.flatMap((p) => p.itens);
    const sub = itens.reduce((s, i) => s + linhaItemCentavos(i), 0);
    const valor = aplicar ? Math.round(sub * (pct / 100)) : 0;

    const up = await prisma.atendimento.update({
      where: { id },
      data: { taxa_servico_aplicada: aplicar, taxa_servico_centavos: valor },
    });
    return up;
  });

  app.post("/atendimentos/:id/desconto", authOps, async (req, reply) => {
    const id = Number((req.params as any).id);
    const body = req.body as { valor_centavos?: number; motivo?: string; pin?: string };
    const valor = Math.max(0, Math.round(Number(body.valor_centavos ?? 0)));
    const motivo = body.motivo?.trim() || null;
    const at = await carregarAberto(id);
    if (!at || at.status !== "ABERTO") return reply.code(400).send({ erro: "Atendimento inválido" });

    const cfg = await prisma.configuracao.findFirst({ orderBy: { id: "asc" } });
    const limite = cfg?.limite_desconto_sem_pin_centavos ?? 500;
    const tipo = (req.user as any).tipo as TipoUsuario;
    let aprovadorId = Number((req.user as any).id);

    if (valor > limite && !tipoPodeAprovarSemPin(tipo)) {
      const aprov = await validarPinGerente(body.pin);
      if (!aprov) return reply.code(403).send({ erro: "Desconto acima do limite exige PIN de GERENTE+" });
      aprovadorId = aprov.id;
    }

    const up = await prisma.atendimento.update({
      where: { id },
      data: {
        desconto_centavos: valor,
        desconto_motivo: motivo,
        desconto_usuario_id: valor ? aprovadorId : null,
      },
    });
    await registrarAuditoria(prisma, {
      usuario_id: Number((req.user as any).id),
      acao: "DESCONTO",
      entidade: "Atendimento",
      entidade_id: id,
      detalhes: { valor, motivo, aprovadorId },
    });
    return up;
  });

  app.post("/atendimentos/:id/acrescimo", authOps, async (req, reply) => {
    const id = Number((req.params as any).id);
    const body = req.body as { valor_centavos?: number; motivo?: string };
    const valor = Math.max(0, Math.round(Number(body.valor_centavos ?? 0)));
    const at = await carregarAberto(id);
    if (!at || at.status !== "ABERTO") return reply.code(400).send({ erro: "Atendimento inválido" });

    return prisma.atendimento.update({
      where: { id },
      data: {
        acrescimo_centavos: valor,
        acrescimo_motivo: body.motivo?.trim() || null,
        acrescimo_usuario_id: valor ? Number((req.user as any).id) : null,
      },
    });
  });

  app.post("/atendimentos/:id/preconta", authOps, async (req, reply) => {
    const id = Number((req.params as any).id);
    const at = await carregarAberto(id);
    if (!at || at.status !== "ABERTO") return reply.code(400).send({ erro: "Atendimento inválido" });

    const cfg = await prisma.configuracao.findFirst({ orderBy: { id: "asc" } });
    if (!cfg?.impressora_conta_id) {
      return reply.code(400).send({ erro: "Configure a impressora da pré-conta" });
    }
    const imp = await prisma.impressora.findUnique({ where: { id: cfg.impressora_conta_id } });
    if (!imp?.ativo) return reply.code(400).send({ erro: "Impressora da conta indisponível" });

    const itens = at.pedidos.flatMap((p) => p.itens);
    const totais = totalAtendimentoAberto({
      itens,
      desconto_centavos: at.desconto_centavos,
      acrescimo_centavos: at.acrescimo_centavos,
      taxa_servico_centavos: at.taxa_servico_centavos,
      taxa_entrega_centavos: at.taxa_entrega_centavos,
    });

    const linhas = itens
      .filter((i) => !i.cancelado)
      .map((i) => ({
        texto: `${i.quantidade}x ${i.nome_produto}`,
        valor_centavos: linhaItemCentavos(i),
      }));

    const payload = documentoConta(imp, {
      colunas: imp.colunas,
      nome_restaurante: cfg.nome_fantasia || cfg.nome_restaurante,
      codigo_atendimento: at.codigo_atendimento,
      mesa: at.mesa ? String(at.mesa.numero) : null,
      linhas,
      subtotal_centavos: totais.subtotal_centavos,
      desconto_centavos: at.desconto_centavos,
      acrescimo_centavos: at.acrescimo_centavos,
      taxa_servico_centavos: at.taxa_servico_centavos,
      taxa_entrega_centavos: at.taxa_entrega_centavos,
      total_centavos: totais.total_centavos,
    });

    try {
      const res = await imprimirAgora(imp, "CONTA", payload);
      return { ok: true, trabalho_id: res.trabalho_id, totais };
    } catch (err) {
      return reply.code(502).send({
        erro: err instanceof Error ? err.message : "Falha na pré-conta",
        totais,
      });
    }
  });

  app.post("/atendimentos/:id/pagamentos", authOps, async (req, reply) => {
    const id = Number((req.params as any).id);
    const body = req.body as {
      forma_pagamento_id?: number;
      valor_centavos?: number;
      valor_recebido_centavos?: number;
    };

    const caixa = await exigirCaixaAberto();
    if (!caixa) return reply.code(400).send({ erro: "Abra o caixa antes de receber pagamento" });

    const at = await carregarAberto(id);
    if (!at || at.status !== "ABERTO") return reply.code(400).send({ erro: "Atendimento inválido" });

    const forma = await prisma.forma_pagamento.findUnique({
      where: { id: Number(body.forma_pagamento_id) },
    });
    if (!forma?.ativo) return reply.code(400).send({ erro: "Forma de pagamento inválida" });

    const valor = Math.round(Number(body.valor_centavos));
    if (!Number.isFinite(valor) || valor <= 0) return reply.code(400).send({ erro: "Valor inválido" });

    const recebido = Math.round(Number(body.valor_recebido_centavos ?? valor));
    if (!Number.isFinite(recebido) || recebido < valor) {
      return reply.code(400).send({ erro: "Valor recebido menor que o pagamento" });
    }
    const troco = forma.abre_gaveta ? Math.max(0, recebido - valor) : 0;

    const itens = at.pedidos.flatMap((p) => p.itens);
    const pagoAntes = at.pagamentos.reduce((s, p) => s + p.valor_centavos, 0);
    const totais = totalAtendimentoAberto({
      itens,
      desconto_centavos: at.desconto_centavos,
      acrescimo_centavos: at.acrescimo_centavos,
      taxa_servico_centavos: at.taxa_servico_centavos,
      taxa_entrega_centavos: at.taxa_entrega_centavos,
      pago_centavos: pagoAntes,
    });
    if (valor > totais.restante_centavos) {
      return reply.code(400).send({
        erro: `Valor maior que o restante (${totais.restante_centavos} centavos)`,
      });
    }

    const usuario_id = Number((req.user as any).id);
    const pag = await prisma.pagamento.create({
      data: {
        atendimento_id: id,
        caixa_sessao_id: caixa.id,
        forma_pagamento_id: forma.id,
        valor_centavos: valor,
        valor_recebido_centavos: recebido,
        troco_centavos: troco,
        usuario_id,
      },
      include: { forma_pagamento: true },
    });

    if (forma.abre_gaveta) {
      const cfg = await prisma.configuracao.findFirst({ orderBy: { id: "asc" } });
      if (cfg?.impressora_caixa_id) {
        const imp = await prisma.impressora.findUnique({ where: { id: cfg.impressora_caixa_id } });
        if (imp?.ativo) {
          try {
            await imprimirAgora(imp, "COMPROVANTE", documentoGaveta());
          } catch {
            /* não bloqueia pagamento */
          }
        }
      }
    }

    await registrarAuditoria(prisma, {
      usuario_id,
      acao: "PAGAMENTO",
      entidade: "Pagamento",
      entidade_id: pag.id,
      detalhes: { valor, forma: forma.nome, troco },
    });

    return reply.code(201).send(pag);
  });

  app.post("/atendimentos/:id/fechar", authOps, async (req, reply) => {
    const id = Number((req.params as any).id);
    const at = await carregarAberto(id);
    if (!at || at.status !== "ABERTO") return reply.code(400).send({ erro: "Atendimento inválido" });

    const itens = at.pedidos.flatMap((p) => p.itens);
    const pago = at.pagamentos.reduce((s, p) => s + p.valor_centavos, 0);
    const totais = totalAtendimentoAberto({
      itens,
      desconto_centavos: at.desconto_centavos,
      acrescimo_centavos: at.acrescimo_centavos,
      taxa_servico_centavos: at.taxa_servico_centavos,
      taxa_entrega_centavos: at.taxa_entrega_centavos,
      pago_centavos: pago,
    });

    if (totais.restante_centavos > 0) {
      return reply.code(400).send({
        erro: `Ainda falta pagar ${totais.restante_centavos} centavos`,
        totais,
      });
    }

    const usuario_id = Number((req.user as any).id);
    const fechado = await prisma.atendimento.update({
      where: { id },
      data: {
        status: "FECHADO",
        fechado_em: new Date(),
        subtotal_centavos: totais.subtotal_centavos,
        total_desconto_centavos: at.desconto_centavos,
        total_acrescimo_centavos: at.acrescimo_centavos,
        total_taxa_servico_centavos: at.taxa_servico_centavos,
        total_taxa_entrega_centavos: at.taxa_entrega_centavos,
        total_centavos: totais.total_centavos,
      },
    });

    const cfg = await prisma.configuracao.findFirst({ orderBy: { id: "asc" } });
    if (cfg?.impressora_caixa_id) {
      const imp = await prisma.impressora.findUnique({ where: { id: cfg.impressora_caixa_id } });
      if (imp?.ativo) {
        const payload = documentoComprovante(imp, {
          colunas: imp.colunas,
          nome_restaurante: cfg.nome_fantasia || cfg.nome_restaurante,
          mensagem_cupom: cfg.mensagem_cupom,
          codigo_atendimento: at.codigo_atendimento,
          total_centavos: totais.total_centavos,
          pagamentos: at.pagamentos.map((p) => ({
            forma: p.forma_pagamento.nome,
            valor_centavos: p.valor_centavos,
            troco_centavos: p.troco_centavos,
          })),
        });
        try {
          await imprimirAgora(imp, "COMPROVANTE", payload);
        } catch {
          await enfileirarTrabalho({
            impressora_id: imp.id,
            tipo_documento: "COMPROVANTE",
            conteudo: payload,
            atendimento_id: id,
          });
        }
      }
    }

    await registrarAuditoria(prisma, {
      usuario_id,
      acao: "FECHAR_ATENDIMENTO",
      entidade: "Atendimento",
      entidade_id: id,
      detalhes: { total: totais.total_centavos },
    });

    return fechado;
  });
}
