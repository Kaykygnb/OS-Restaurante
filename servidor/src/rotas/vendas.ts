import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { exigirCaixa, soTipos } from "../permissoes.js";
import { comIdempotencia } from "../operacao/idempotencia.js";
import { registrarAuditoria } from "../operacao/auditoria.js";
import { proximoCodigo } from "../operacao/sequencia.js";
import { exigirAprovacao } from "../operacao/pin.js";
import { descontoContaCentavos, subtotalItensCentavos, totalAtendimentoAberto } from "../operacao/totais.js";
import { percentualTaxaServico } from "../operacao/totais-atendimento.js";
import { ErroRegra, corpoErro } from "../util/erros.js";
import { gravarPedido, proximoNumeroDia } from "../servicos/pedido.js";
import { pulsarGaveta } from "../servicos/gaveta.js";
import { enfileirarProducaoPedido } from "../operacao/producao.js";
import { documentoComprovante } from "../impressao/documentos.js";
import { resolverDestinoCaixa } from "../impressao/destino.js";
import { enfileirarDocumentoNegocio } from "../impressao/enfileirar-doc.js";
import { formatarDinheiroEscpos } from "../impressao/escpos.js";
import { publicar } from "../eventos/barramento.js";
import type { TipoUsuario } from "../permissoes.js";
import type { ItemEntrada } from "../servicos/itens-pedido.js";

export async function rotasVendas(app: FastifyInstance) {
  const authOps = {
    onRequest: [(app as any).autenticar, soTipos("ROOT", "ADMIN", "GERENTE", "ATENDENTE"), exigirCaixa()],
  };

  app.post("/vendas/rapida", authOps, async (req, reply) => {
    return comIdempotencia(req, reply, "POST /vendas/rapida", async () => {
      try {
        const body = req.body as {
          itens?: ItemEntrada[];
          desconto?: { centavos?: number; percentual?: number; motivo?: string; aprovacao?: { aprovador_id?: number; pin?: string } };
          pagamentos?: { forma_pagamento_id: number; valor_centavos: number; valor_recebido_centavos?: number }[];
          imprimir?: { producao?: boolean; comprovante?: boolean };
        };
        if (!body.itens?.length) throw new ErroRegra(400, "sem_itens", "Informe ao menos um item.");
        if (!body.pagamentos?.length) throw new ErroRegra(400, "sem_pagamento", "Informe o pagamento.");

        const usuarioId = Number((req.user as any).id);
        const tipo = (req.user as any).tipo as TipoUsuario;
        const caixa = await prisma.caixa_sessao.findFirst({ where: { aberta: true } });
        if (!caixa) throw new ErroRegra(409, "caixa_fechado", "Abra o caixa antes de vender.");
        const cfgAntes = await prisma.configuracao.findFirst({ orderBy: { id: "asc" } });
        const limite = cfgAntes?.limite_desconto_sem_pin_centavos ?? 500;
        const tetoPct = cfgAntes?.limite_desconto_atendente_percentual ?? 10;
        let aprovadorDesconto = usuarioId;
        let descontoComPin = false;
        if (body.desconto && ((body.desconto.centavos ?? 0) > 0 || (body.desconto.percentual ?? 0) > 0)) {
          if (!body.desconto.motivo?.trim()) throw new ErroRegra(400, "motivo_obrigatorio", "Informe o motivo do desconto.");
          const acima =
            tipo === "ATENDENTE" &&
            ((body.desconto.centavos ?? 0) > limite || (body.desconto.percentual ?? 0) > tetoPct);
          const aprov = await exigirAprovacao({
            tipo,
            usuarioId,
            pin: body.desconto.aprovacao?.pin ?? null,
            aprovadorId: body.desconto.aprovacao?.aprovador_id ?? null,
            acimaDoLimite: acima,
            acao: "desconto.conta",
          });
          if (!aprov) {
            throw new ErroRegra(403, "pin_invalido", `Desconto acima de ${formatarDinheiroEscpos(limite)} precisa do PIN de um gerente.`);
          }
          aprovadorDesconto = aprov.aprovadorId;
          descontoComPin = aprov.comPin;
        }

        const resultado = await prisma.$transaction(async (tx) => {
          const codigo = await proximoCodigo(tx, "ATENDIMENTO", "AT");
          const numero = await proximoNumeroDia(tx, caixa.id);
          const at = await tx.atendimento.create({
            data: {
              codigo_atendimento: codigo,
              tipo_atendimento: "VENDA_RAPIDA",
              usuario_id: usuarioId,
              caixa_sessao_id: caixa.id,
              numero_dia: numero,
            },
          });
          const pedido = await gravarPedido(tx, {
            atendimentoId: at.id,
            usuarioId,
            itens: body.itens!,
            tipoAtendimento: "VENDA_RAPIDA",
          });
          const cfg = await tx.configuracao.findFirst({ orderBy: { id: "asc" } });
          const itens = pedido.itens;
          const subtotal = subtotalItensCentavos(itens);
          let desconto = 0;
          let descontoTipo = "VALOR";
          let descontoPct = 0;
          const aprovadorId = aprovadorDesconto;
          const comPin = descontoComPin;
          if (body.desconto && ((body.desconto.centavos ?? 0) > 0 || (body.desconto.percentual ?? 0) > 0)) {
            descontoTipo = body.desconto.percentual ? "PERCENTUAL" : "VALOR";
            descontoPct = Math.round(body.desconto.percentual ?? 0);
            desconto = descontoContaCentavos({
              subtotal,
              desconto_centavos: Math.round(body.desconto.centavos ?? 0),
              desconto_tipo: descontoTipo,
              desconto_percentual: descontoPct,
            });
          }
          const pct = cfg?.taxa_servico_percentual ?? (await percentualTaxaServico());
          const totais = totalAtendimentoAberto({
            itens,
            desconto_centavos: desconto,
            desconto_tipo: descontoTipo,
            desconto_percentual: descontoPct,
            acrescimo_centavos: 0,
            taxa_servico_aplicada: false,
            taxa_servico_percentual: pct,
            taxa_entrega_centavos: 0,
            tipo_atendimento: "BALCAO",
          });
          if (totais.total_centavos === 0) {
            throw new ErroRegra(409, "cortesia_obrigatoria", "Conta zerada só fecha como cortesia aprovada.");
          }
          const formas = await tx.forma_pagamento.findMany({ where: { ativo: true } });
          let soma = 0;
          const pags: { id: number; valor_centavos: number; troco_centavos: number }[] = [];
          let houveDinheiro = false;
          for (const p of body.pagamentos!) {
            const forma = formas.find((f) => f.id === Number(p.forma_pagamento_id));
            if (!forma) throw new ErroRegra(400, "forma_invalida", "Forma de pagamento inválida.");
            const valor = Math.round(Number(p.valor_centavos));
            const recebido = Math.round(Number(p.valor_recebido_centavos ?? valor));
            if (valor <= 0) throw new ErroRegra(400, "valor_invalido", "Valor de pagamento inválido.");
            if (!forma.eh_dinheiro && recebido !== valor) {
              throw new ErroRegra(400, "recebido_invalido", "Nesta forma o valor recebido tem que ser igual ao pagamento.");
            }
            if (forma.eh_dinheiro && recebido < valor) {
              throw new ErroRegra(400, "recebido_invalido", "O valor recebido é menor que o pagamento.");
            }
            const troco = forma.eh_dinheiro ? recebido - valor : 0;
            if (forma.eh_dinheiro) houveDinheiro = true;
            soma += valor;
            const gravado = await tx.pagamento.create({
              data: {
                atendimento_id: at.id,
                caixa_sessao_id: caixa.id,
                forma_pagamento_id: forma.id,
                valor_centavos: valor,
                valor_recebido_centavos: recebido,
                troco_centavos: troco,
                usuario_id: usuarioId,
              },
            });
            pags.push({ id: gravado.id, valor_centavos: valor, troco_centavos: troco });
          }
          if (soma !== totais.total_centavos) {
            throw new ErroRegra(400, "pagamento_diferente_do_total", "A soma dos pagamentos não fecha a conta.", {
              total_centavos: totais.total_centavos,
              soma_centavos: soma,
            });
          }
          await tx.atendimento.update({
            where: { id: at.id },
            data: {
              status: "FECHADO",
              fechado_em: new Date(),
              desconto_centavos: desconto,
              desconto_tipo: descontoTipo,
              desconto_percentual: descontoPct,
              desconto_motivo: body.desconto?.motivo?.trim() || null,
              desconto_usuario_id: desconto ? aprovadorId : null,
              desconto_aprovador_id: comPin ? aprovadorId : null,
              subtotal_centavos: totais.subtotal_centavos,
              total_desconto_centavos: totais.desconto_centavos,
              total_centavos: totais.total_centavos,
              total_taxa_servico_centavos: 0,
              total_taxa_entrega_centavos: 0,
            },
          });
          return { at, pedido, totais, pags, houveDinheiro, numero };
        });

        const imprimirProd = body.imprimir?.producao !== false;
        const imprimirComp = body.imprimir?.comprovante !== false;
        let producao: "na_fila" | "nao_pedida" = "nao_pedida";
        let comprovante: "na_fila" | "nao_pedida" = "nao_pedida";
        if (imprimirProd) {
          try {
            await enfileirarProducaoPedido({
              pedido_id: resultado.pedido.id,
              codigo_pedido: resultado.pedido.codigo_pedido,
              atendimento_id: resultado.at.id,
              codigo_atendimento: resultado.at.codigo_atendimento,
              tipo_atendimento: "BALCAO",
              itens: resultado.pedido.itens as any,
            });
            producao = "na_fila";
          } catch {
            producao = "na_fila";
          }
        }
        if (imprimirComp) {
          const imp = await resolverDestinoCaixa();
          const cfg = await prisma.configuracao.findFirst({ orderBy: { id: "asc" } });
          if (imp) {
            const payload = documentoComprovante(imp, {
              colunas: imp.colunas,
              nome_restaurante: cfg?.nome_fantasia || cfg?.nome_restaurante || "Comprovante",
              codigo_atendimento: resultado.at.codigo_atendimento,
              total_centavos: resultado.totais.total_centavos,
              pagamentos: resultado.pags.map((p) => ({ forma: "Pagamento", valor_centavos: p.valor_centavos, troco_centavos: p.troco_centavos })),
              linhas: resultado.pedido.itens.map((i) => ({ texto: `${i.quantidade}x ${i.nome_produto}`, valor_centavos: i.preco_centavos * i.quantidade })),
              desconto_centavos: resultado.totais.desconto_centavos,
            });
            await enfileirarDocumentoNegocio({
              tipo: "COMPROVANTE",
              disparo: "automatico",
              payload,
              atendimento_id: resultado.at.id,
              agora: true,
              abrir_gaveta: false,
            });
            comprovante = "na_fila";
          }
        }
        const gaveta = resultado.houveDinheiro ? await pulsarGaveta() : "nao_usada";
        if (gaveta === "falhou") {
          await registrarAuditoria(prisma, { usuario_id: usuarioId, tipo: "caixa.gaveta_falhou", detalhes: { venda_rapida: true } });
        }
        await registrarAuditoria(prisma, {
          usuario_id: usuarioId,
          tipo: "venda_rapida.concluida",
          atendimento_id: resultado.at.id,
          valor_centavos: resultado.totais.total_centavos,
          detalhes: { pedido_id: resultado.pedido.id },
        });
        publicar("pedido.criado", resultado.pedido.id);
        publicar("caixa.atualizado", caixa.id);
        return {
          status: 201,
          corpo: {
            atendimento: {
              id: resultado.at.id,
              codigo_atendimento: resultado.at.codigo_atendimento,
              numero_dia: resultado.numero,
              total_centavos: resultado.totais.total_centavos,
              status: "FECHADO" as const,
            },
            pedido_id: resultado.pedido.id,
            pagamentos: resultado.pags,
            troco_total_centavos: resultado.pags.reduce((s, p) => s + p.troco_centavos, 0),
            impressao: { producao, comprovante },
            gaveta,
          },
        };
      } catch (err) {
        const e = corpoErro(err);
        return e;
      }
    }, { obrigatoria: true });
  });
}
