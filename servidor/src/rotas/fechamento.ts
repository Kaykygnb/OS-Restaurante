import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { soTipos, type TipoUsuario } from "../permissoes.js";
import { registrarAuditoria } from "../operacao/auditoria.js";
import { tipoPodeAprovarSemPin, validarPinGerente } from "../operacao/pin.js";
import {
  linhaItemCentavos,
  subtotalItensCentavos,
  totalAtendimentoAberto,
} from "../operacao/totais.js";
import { calcularTotaisAtendimento, percentualTaxaServico } from "../operacao/totais-atendimento.js";
import { comIdempotencia } from "../operacao/idempotencia.js";
import { documentoComprovante, documentoConta } from "../impressao/documentos.js";
import { resolverDestinoCaixa, resolverDestinoPreconta } from "../impressao/destino.js";
import { enfileirarDocumentoNegocio } from "../impressao/enfileirar-doc.js";
import { configDocumento } from "../impressao/destino.js";
import { documentoGaveta } from "../impressao/documentos.js";
import { imprimirAgora } from "../impressao/fila.js";

const includeAberto = {
  mesa: true,
  pedidos: { include: { itens: { include: { escolhas: true, adicionais: true } } } },
  pagamentos: { include: { forma_pagamento: true } },
} as const;

async function carregarAberto(id: number) {
  return prisma.atendimento.findUnique({
    where: { id },
    include: includeAberto,
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

    const pct = await percentualTaxaServico();
    const itens = at.pedidos.flatMap((p) => p.itens);
    const sub = subtotalItensCentavos(itens);
    const valor = aplicar ? Math.round(sub * (pct / 100)) : 0;

    // Guarda flag; centavos só snapshot auxiliar (totais sempre recalculam)
    return prisma.atendimento.update({
      where: { id },
      data: { taxa_servico_aplicada: aplicar, taxa_servico_centavos: valor },
    });
  });

  app.post("/atendimentos/:id/desconto", {
    ...authOps,
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
  }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const body = req.body as {
      valor_centavos?: number;
      motivo?: string;
      pin?: string;
      aprovador_id?: number;
    };
    const valorPedido = Math.max(0, Math.round(Number(body.valor_centavos ?? 0)));
    const motivo = body.motivo?.trim() || null;
    const at = await carregarAberto(id);
    if (!at || at.status !== "ABERTO") return reply.code(400).send({ erro: "Atendimento inválido" });

    const itens = at.pedidos.flatMap((p) => p.itens);
    const subtotal = subtotalItensCentavos(itens);
    if (valorPedido > subtotal) {
      return reply.code(400).send({
        erro: `Desconto não pode passar do subtotal (${subtotal} centavos)`,
      });
    }
    const valor = valorPedido;

    const cfg = await prisma.configuracao.findFirst({ orderBy: { id: "asc" } });
    const limite = cfg?.limite_desconto_sem_pin_centavos ?? 500;
    const tipo = (req.user as any).tipo as TipoUsuario;
    let aprovadorId = Number((req.user as any).id);

    if (valor > limite && !tipoPodeAprovarSemPin(tipo)) {
      const aprov = await validarPinGerente(body.pin, body.aprovador_id);
      if (!aprov) {
        return reply.code(403).send({
          erro: "Desconto acima do limite exige PIN de um GERENTE+ (informe aprovador_id e pin)",
        });
      }
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

    const imp = await resolverDestinoPreconta();
    if (!imp) {
      return reply.code(400).send({ erro: "Configure impressora da conta, caixa ou padrão da loja" });
    }
    const cfg = await prisma.configuracao.findFirst({ orderBy: { id: "asc" } });
    const totais = await calcularTotaisAtendimento(at);
    const itens = at.pedidos.flatMap((p) => p.itens);
    const linhas = itens
      .filter((i) => !i.cancelado)
      .map((i) => ({
        texto: `${i.quantidade}x ${i.nome_produto}`,
        valor_centavos: linhaItemCentavos(i),
      }));

    const payload = documentoConta(imp, {
      colunas: imp.colunas,
      nome_restaurante: cfg?.nome_fantasia || cfg?.nome_restaurante || "PRE-CONTA",
      codigo_atendimento: at.codigo_atendimento,
      mesa: at.mesa ? String(at.mesa.numero) : null,
      linhas,
      subtotal_centavos: totais.subtotal_centavos,
      desconto_centavos: totais.desconto_centavos,
      acrescimo_centavos: at.acrescimo_centavos,
      taxa_servico_centavos: totais.taxa_servico_centavos,
      taxa_entrega_centavos: at.taxa_entrega_centavos,
      total_centavos: totais.total_centavos,
    });

    const impressao = await enfileirarDocumentoNegocio({
      tipo: "CONTA",
      disparo: "manual",
      payload,
      atendimento_id: id,
      agora: true,
    });
    if (impressao.status === "NUNCA" || impressao.status === "SEM_DESTINO") {
      return reply.code(400).send({ erro: impressao.avisos[0] || "Pré-conta não impressa", totais, impressao });
    }
    return { ok: true, totais, impressao };
  });

  app.post("/atendimentos/:id/pagamentos", authOps, async (req, reply) => {
    const id = Number((req.params as any).id);
    const rota = `POST /atendimentos/${id}/pagamentos`;
    return comIdempotencia(req, reply, rota, async () => {
      const body = req.body as {
        forma_pagamento_id?: number;
        valor_centavos?: number;
        valor_recebido_centavos?: number;
      };

      const caixa = await exigirCaixaAberto();
      if (!caixa) {
        return { status: 400, corpo: { erro: "Abra o caixa antes de receber pagamento" } };
      }

      const forma = await prisma.forma_pagamento.findUnique({
        where: { id: Number(body.forma_pagamento_id) },
      });
      if (!forma?.ativo) {
        return { status: 400, corpo: { erro: "Forma de pagamento inválida" } };
      }

      const valor = Math.round(Number(body.valor_centavos));
      if (!Number.isFinite(valor) || valor <= 0) {
        return { status: 400, corpo: { erro: "Valor inválido" } };
      }

      const recebido = Math.round(Number(body.valor_recebido_centavos ?? valor));
      if (!Number.isFinite(recebido) || recebido < valor) {
        return { status: 400, corpo: { erro: "Valor recebido menor que o pagamento" } };
      }
      if (!forma.abre_gaveta && recebido !== valor) {
        return { status: 400, corpo: { erro: "Nesta forma o recebido deve ser igual ao valor" } };
      }
      const troco = forma.abre_gaveta ? Math.max(0, recebido - valor) : 0;
      const usuario_id = Number((req.user as any).id);

      try {
        const pag = await prisma.$transaction(async (tx) => {
          // Trava a linha do atendimento (SQLite serializa writers)
          const lock = await tx.atendimento.updateMany({
            where: { id, status: "ABERTO" },
            data: { updatedAt: new Date() },
          });
          if (lock.count !== 1) {
            throw Object.assign(new Error("Atendimento inválido"), { status: 400 });
          }

          const at = await tx.atendimento.findUniqueOrThrow({
            where: { id },
            include: includeAberto,
          });

          const cfg = await tx.configuracao.findFirst({ orderBy: { id: "asc" } });
          const pct = cfg?.taxa_servico_percentual ?? 10;
          const itens = at.pedidos.flatMap((p) => p.itens);
          const pagoAntes = at.pagamentos
            .filter((p) => !p.estornado_em)
            .reduce((s, p) => s + p.valor_centavos, 0);
          const totais = totalAtendimentoAberto({
            itens,
            desconto_centavos: at.desconto_centavos,
            acrescimo_centavos: at.acrescimo_centavos,
            taxa_servico_aplicada: at.taxa_servico_aplicada,
            taxa_servico_percentual: pct,
            taxa_entrega_centavos: at.taxa_entrega_centavos,
            pago_centavos: pagoAntes,
          });
          if (valor > totais.restante_centavos) {
            throw Object.assign(
              new Error(`Valor maior que o restante (${totais.restante_centavos} centavos)`),
              { status: 400 }
            );
          }

          return tx.pagamento.create({
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
        });

        if (forma.abre_gaveta) {
          const cfgDoc = await configDocumento("COMPROVANTE");
          const imp = await resolverDestinoCaixa();
          if (cfgDoc?.abre_gaveta && imp?.tem_gaveta) {
            try {
              await imprimirAgora(imp, "COMPROVANTE", documentoGaveta());
            } catch {
              /* não bloqueia pagamento */
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

        return { status: 201, corpo: pag };
      } catch (err: any) {
        return {
          status: err?.status ?? 400,
          corpo: { erro: err instanceof Error ? err.message : "Falha no pagamento" },
        };
      }
    });
  });

  app.post("/pagamentos/:id/estornar", {
    ...authOps,
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
  }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const body = req.body as { motivo?: string; pin?: string; aprovador_id?: number };
    const motivo = body.motivo?.trim();
    if (!motivo) return reply.code(400).send({ erro: "Informe o motivo do estorno" });

    const tipo = (req.user as any).tipo as TipoUsuario;
    let aprovadorId = Number((req.user as any).id);
    if (!tipoPodeAprovarSemPin(tipo)) {
      const aprov = await validarPinGerente(body.pin, body.aprovador_id);
      if (!aprov) {
        return reply.code(403).send({ erro: "Estorno exige PIN de GERENTE+ (aprovador_id e pin)" });
      }
      aprovadorId = aprov.id;
    }

    const usuario_id = Number((req.user as any).id);
    try {
      const pag = await prisma.$transaction(async (tx) => {
        const atual = await tx.pagamento.findUnique({
          where: { id },
          include: { atendimento: true },
        });
        if (!atual) throw Object.assign(new Error("Pagamento não encontrado"), { status: 404 });
        if (atual.estornado_em) throw Object.assign(new Error("Pagamento já estornado"), { status: 400 });
        if (atual.atendimento.status !== "ABERTO") {
          throw Object.assign(new Error("Só dá para estornar em conta aberta"), { status: 400 });
        }
        return tx.pagamento.update({
          where: { id },
          data: {
            estornado_em: new Date(),
            estorno_motivo: motivo,
            estorno_usuario_id: usuario_id,
            estorno_aprovador_id: aprovadorId,
          },
          include: { forma_pagamento: true },
        });
      });

      await registrarAuditoria(prisma, {
        usuario_id,
        acao: "ESTORNO_PAGAMENTO",
        entidade: "Pagamento",
        entidade_id: id,
        detalhes: { motivo, aprovadorId, valor: pag.valor_centavos },
      });
      return pag;
    } catch (err: any) {
      return reply.code(err?.status ?? 400).send({
        erro: err instanceof Error ? err.message : "Falha no estorno",
      });
    }
  });

  app.post("/atendimentos/:id/fechar", authOps, async (req, reply) => {
    const id = Number((req.params as any).id);
    const rota = `POST /atendimentos/${id}/fechar`;
    return comIdempotencia(req, reply, rota, async () => {
      const usuario_id = Number((req.user as any).id);
      try {
        const { fechado, totais, at, pagamentos } = await prisma.$transaction(async (tx) => {
          const atTx = await tx.atendimento.findUnique({
            where: { id },
            include: includeAberto,
          });
          if (!atTx || atTx.status !== "ABERTO") {
            throw Object.assign(new Error("Atendimento inválido"), { status: 400 });
          }

          const cfg = await tx.configuracao.findFirst({ orderBy: { id: "asc" } });
          const pct = cfg?.taxa_servico_percentual ?? 10;
          const itens = atTx.pedidos.flatMap((p) => p.itens);
          const subtotal = subtotalItensCentavos(itens);
          if (atTx.desconto_centavos > subtotal) {
            throw Object.assign(
              new Error(
                `Desconto inválido (${atTx.desconto_centavos} centavos) maior que o subtotal (${subtotal}). Ajuste o desconto antes de fechar.`
              ),
              { status: 400 }
            );
          }
          const pago = atTx.pagamentos
            .filter((p) => !p.estornado_em)
            .reduce((s, p) => s + p.valor_centavos, 0);
          const totaisTx = totalAtendimentoAberto({
            itens,
            desconto_centavos: atTx.desconto_centavos,
            acrescimo_centavos: atTx.acrescimo_centavos,
            taxa_servico_aplicada: atTx.taxa_servico_aplicada,
            taxa_servico_percentual: pct,
            taxa_entrega_centavos: atTx.taxa_entrega_centavos,
            pago_centavos: pago,
          });

          if (totaisTx.restante_centavos > 0) {
            throw Object.assign(
              new Error(`Ainda falta pagar ${totaisTx.restante_centavos} centavos`),
              { status: 400, totais: totaisTx }
            );
          }

          const result = await tx.atendimento.updateMany({
            where: { id, status: "ABERTO" },
            data: {
              status: "FECHADO",
              fechado_em: new Date(),
              subtotal_centavos: totaisTx.subtotal_centavos,
              total_desconto_centavos: totaisTx.desconto_centavos,
              total_acrescimo_centavos: atTx.acrescimo_centavos,
              total_taxa_servico_centavos: totaisTx.taxa_servico_centavos,
              total_taxa_entrega_centavos: atTx.taxa_entrega_centavos,
              total_centavos: totaisTx.total_centavos,
              taxa_servico_centavos: totaisTx.taxa_servico_centavos,
            },
          });
          if (result.count !== 1) {
            throw Object.assign(new Error("Conta já foi fechada"), { status: 409 });
          }

          const fechadoTx = await tx.atendimento.findUniqueOrThrow({ where: { id } });
          return {
            fechado: fechadoTx,
            totais: totaisTx,
            at: atTx,
            pagamentos: atTx.pagamentos.filter((p) => !p.estornado_em),
          };
        });

        const cfg = await prisma.configuracao.findFirst({ orderBy: { id: "asc" } });
        const imp = await resolverDestinoCaixa();
        let impressao = null;
        if (imp) {
          const houveDinheiro = pagamentos.some((p) => p.forma_pagamento.abre_gaveta);
          const payload = documentoComprovante(imp, {
            colunas: imp.colunas,
            nome_restaurante: cfg?.nome_fantasia || cfg?.nome_restaurante || "COMPROVANTE",
            mensagem_cupom: cfg?.mensagem_cupom ?? null,
            codigo_atendimento: at.codigo_atendimento,
            total_centavos: totais.total_centavos,
            pagamentos: pagamentos.map((p) => ({
              forma: p.forma_pagamento.nome,
              valor_centavos: p.valor_centavos,
              troco_centavos: p.troco_centavos,
              valor_recebido_centavos: p.valor_recebido_centavos,
            })),
            cliente_nome: at.cliente_nome,
            cliente_telefone: at.cliente_telefone,
            cliente_endereco: at.cliente_endereco,
            observacao: at.observacao,
          });
          impressao = await enfileirarDocumentoNegocio({
            tipo: "COMPROVANTE",
            disparo: "automatico",
            payload,
            atendimento_id: id,
            agora: true,
            abrir_gaveta: houveDinheiro,
          });
        }

        await registrarAuditoria(prisma, {
          usuario_id,
          acao: "FECHAR_ATENDIMENTO",
          entidade: "Atendimento",
          entidade_id: id,
          detalhes: { total: totais.total_centavos },
        });

        return { status: 200, corpo: { ...fechado, impressao } };
      } catch (err: any) {
        return {
          status: err?.status ?? 400,
          corpo: {
            erro: err instanceof Error ? err.message : "Falha ao fechar",
            ...(err?.totais ? { totais: err.totais } : {}),
          },
        };
      }
    });
  });
}
