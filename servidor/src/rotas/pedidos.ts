import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { soTipos, type TipoUsuario } from "../permissoes.js";
import { registrarAuditoria } from "../operacao/auditoria.js";
import { enfileirarProducaoPedido } from "../operacao/producao.js";
import { proximoCodigo } from "../operacao/sequencia.js";
import { comIdempotencia } from "../operacao/idempotencia.js";
import { validarPinGerente, tipoPodeAprovarSemPin } from "../operacao/pin.js";

type BodyEscolha = { opcao_escolha_id: number; quantidade?: number };
type BodyAdicional = { adicional_variante_id: number; quantidade?: number };
type BodyItem = {
  produto_variante_id: number;
  quantidade?: number;
  observacao?: string | null;
  escolhas?: BodyEscolha[];
  adicionais?: BodyAdicional[];
};

const STATUS_OK = new Set(["ENVIADO", "PREPARO", "PRONTO", "ENTREGUE"]);
const TRANSICOES: Record<string, Set<string>> = {
  ENVIADO: new Set(["PREPARO", "PRONTO", "ENTREGUE"]),
  PREPARO: new Set(["PRONTO", "ENTREGUE"]),
  PRONTO: new Set(["ENTREGUE"]),
  ENTREGUE: new Set(),
};

const includeItemFull = {
  escolhas: true,
  adicionais: true,
  produto_variante: {
    select: {
      id: true,
      produto: { select: { id: true, exige_preparo: true, categoria_id: true } },
    },
  },
} as const;

export async function rotasPedidos(app: FastifyInstance) {
  const authOps = {
    onRequest: [(app as any).autenticar, soTipos("ROOT", "ADMIN", "GERENTE", "ATENDENTE")],
  };
  const authCozinha = {
    onRequest: [
      (app as any).autenticar,
      soTipos("ROOT", "ADMIN", "GERENTE", "ATENDENTE", "COZINHEIRO"),
    ],
  };

  app.get("/pedidos", authCozinha, async (req) => {
    const status = String((req.query as any)?.status ?? "ABERTOS").toUpperCase();
    const where: Record<string, unknown> = {};
    let orderBy: Record<string, "asc" | "desc"> = { createdAt: "asc" };
    let take = 100;

    if (status === "ABERTOS") {
      where.status = { in: ["ENVIADO", "PREPARO", "PRONTO"] };
    } else if (status === "HISTORICO") {
      where.status = { in: ["ENTREGUE", "CANCELADO"] };
      orderBy = { createdAt: "desc" };
      take = 80;
    } else if (STATUS_OK.has(status)) {
      where.status = status;
      if (status === "ENTREGUE" || status === "CANCELADO") {
        orderBy = { createdAt: "desc" };
      }
    }

    return prisma.pedido.findMany({
      where,
      orderBy,
      take,
      include: {
        atendimento: {
          select: {
            id: true,
            codigo_atendimento: true,
            tipo_atendimento: true,
            status: true,
            mesa: { select: { numero: true } },
          },
        },
        itens: {
          include: {
            escolhas: true,
            adicionais: true,
          },
        },
      },
    });
  });

  app.post("/atendimentos/:id/pedidos", authOps, async (req, reply) => {
    const atendimento_id = Number((req.params as any).id);
    if (!Number.isFinite(atendimento_id)) return reply.code(400).send({ erro: "ID inválido" });
    const rota = `POST /atendimentos/${atendimento_id}/pedidos`;

    return comIdempotencia(req, reply, rota, async () => {
      const body = req.body as { itens?: BodyItem[] };
      if (!Array.isArray(body.itens) || !body.itens.length) {
        return { status: 400, corpo: { erro: "Informe ao menos um item" } };
      }

      const at = await prisma.atendimento.findUnique({
        where: { id: atendimento_id },
        include: { mesa: true },
      });
      if (!at) return { status: 404, corpo: { erro: "Atendimento não encontrado" } };
      if (at.status !== "ABERTO") {
        return { status: 400, corpo: { erro: "Atendimento não está aberto" } };
      }

      const usuario_id = Number((req.user as any).id);

      let resultado;
      try {
        resultado = await prisma.$transaction(async (tx) => {
          const atTx = await tx.atendimento.findUnique({ where: { id: atendimento_id } });
          if (!atTx || atTx.status !== "ABERTO") {
            throw new Error("Atendimento não está aberto");
          }

          const codigo = await proximoCodigo(tx, "PEDIDO", "PD");
          const itensData: {
            nome_produto: string;
            preco_centavos: number;
            quantidade: number;
            observacao: string | null;
            produto_variante_id: number;
            escolhas: {
              nome_opcao: string;
              preco_extra_centavos: number;
              quantidade: number;
              opcao_escolha_id: number;
            }[];
            adicionais: {
              nome_adicional: string;
              preco_centavos: number;
              quantidade: number;
              adicional_variante_id: number;
            }[];
          }[] = [];

          for (const raw of body.itens!) {
            const variante_id = Number(raw.produto_variante_id);
            const qtd = Math.max(1, Math.round(Number(raw.quantidade ?? 1)));
            if (!Number.isFinite(variante_id)) throw new Error("produto_variante_id inválido");

            const variante = await tx.produto_variante.findUnique({
              where: { id: variante_id },
              include: {
                produto: true,
                grupos_escolhas: {
                  where: { ativo: true },
                  include: { opcoes_escolha: { where: { ativo: true } } },
                },
              },
            });
            if (!variante || !variante.ativo || !variante.produto.ativo) {
              throw new Error("Variante indisponível");
            }

            const nome_produto =
              variante.nome.toLowerCase() === "padrão" || variante.nome.toLowerCase() === "padrao"
                ? variante.produto.nome
                : `${variante.produto.nome} - ${variante.nome}`;

            const escolhasIn = Array.isArray(raw.escolhas) ? raw.escolhas : [];
            const escolhasOut: (typeof itensData)[0]["escolhas"] = [];
            for (const g of variante.grupos_escolhas) {
              const doGrupo = escolhasIn.filter((e) =>
                g.opcoes_escolha.some((o) => o.id === Number(e.opcao_escolha_id))
              );
              let total = 0;
              for (const e of doGrupo) {
                const op = g.opcoes_escolha.find((o) => o.id === Number(e.opcao_escolha_id))!;
                const eq = Math.max(1, Math.round(Number(e.quantidade ?? 1)));
                if (!g.permite_repetir && eq > 1) {
                  throw new Error(`Grupo "${g.nome}" não permite repetir`);
                }
                total += eq;
                escolhasOut.push({
                  opcao_escolha_id: op.id,
                  nome_opcao: op.nome,
                  preco_extra_centavos: op.preco_extra_centavos,
                  quantidade: eq,
                });
              }
              if (total < g.min_escolhas) {
                throw new Error(`Grupo "${g.nome}": mínimo ${g.min_escolhas}`);
              }
              if (total > g.max_escolhas) {
                throw new Error(`Grupo "${g.nome}": máximo ${g.max_escolhas}`);
              }
            }

            const adicionaisIn = Array.isArray(raw.adicionais) ? raw.adicionais : [];
            const adicionaisOut: (typeof itensData)[0]["adicionais"] = [];
            const catId = variante.produto.categoria_id;
            const produtoId = variante.produto.id;

            for (const a of adicionaisIn) {
              const avId = Number(a.adicional_variante_id);
              const aq = Math.max(1, Math.round(Number(a.quantidade ?? 1)));
              const av = await tx.adicional_variante.findUnique({
                where: { id: avId },
                include: {
                  adicional: {
                    include: {
                      grupo_adicionais: {
                        include: {
                          categorias: true,
                          produtos_excluidos: true,
                        },
                      },
                    },
                  },
                },
              });
              if (!av || !av.ativo || !av.adicional.ativo) {
                throw new Error("Adicional indisponível");
              }
              if (aq > av.adicional.qtd_max) {
                throw new Error(`"${av.nome}" máximo ${av.adicional.qtd_max}`);
              }
              const grupo = av.adicional.grupo_adicionais;
              const ligado = grupo.categorias.some((c) => c.categoria_id === catId);
              if (!ligado) {
                throw new Error(`Adicional "${av.adicional.nome}" não pertence à categoria do produto`);
              }
              const excluido = grupo.produtos_excluidos.some((e) => e.produto_id === produtoId);
              if (excluido) {
                throw new Error(`Adicional "${av.adicional.nome}" não é permitido neste produto`);
              }
              adicionaisOut.push({
                adicional_variante_id: av.id,
                nome_adicional: av.nome,
                preco_centavos: av.preco_centavos,
                quantidade: aq,
              });
            }

            itensData.push({
              nome_produto,
              preco_centavos: variante.preco_centavos,
              quantidade: qtd,
              observacao: raw.observacao?.trim() || null,
              produto_variante_id: variante.id,
              escolhas: escolhasOut,
              adicionais: adicionaisOut,
            });
          }

          return tx.pedido.create({
            data: {
              codigo_pedido: codigo,
              atendimento_id,
              itens: {
                create: itensData.map((i) => ({
                  nome_produto: i.nome_produto,
                  preco_centavos: i.preco_centavos,
                  quantidade: i.quantidade,
                  observacao: i.observacao,
                  produto_variante_id: i.produto_variante_id,
                  escolhas: { create: i.escolhas },
                  adicionais: { create: i.adicionais },
                })),
              },
            },
            include: {
              itens: { include: includeItemFull },
            },
          });
        });
      } catch (err) {
        return {
          status: 400,
          corpo: { erro: err instanceof Error ? err.message : "Falha ao lançar pedido" },
        };
      }

      // Pedido já gravado: nunca 400 daqui pra baixo (evita reenvio duplicado)
      let impressao: Awaited<ReturnType<typeof enfileirarProducaoPedido>> = {
        status: "VAZIO",
        trabalhos: [],
        avisos: [],
      };
      try {
        const garcom = await prisma.usuario.findUnique({
          where: { id: usuario_id },
          select: { nome: true },
        });
        impressao = await enfileirarProducaoPedido({
          pedido_id: resultado.id,
          codigo_pedido: resultado.codigo_pedido,
          atendimento_id,
          codigo_atendimento: at.codigo_atendimento,
          mesa_numero: at.mesa?.numero ?? null,
          tipo_atendimento: at.tipo_atendimento,
          itens: resultado.itens as any,
          disparo: "automatico",
          garcom_nome: garcom?.nome ?? null,
          observacao_atendimento: at.observacao,
        });
      } catch (err) {
        impressao = {
          status: "ERRO",
          trabalhos: [],
          avisos: [err instanceof Error ? err.message : "Falha ao enfileirar impressão"],
        };
      }

      try {
        await registrarAuditoria(prisma, {
          usuario_id,
          acao: "LANCAR_PEDIDO",
          entidade: "Pedido",
          entidade_id: resultado.id,
          detalhes: { codigo: resultado.codigo_pedido, itens: resultado.itens.length },
        });
      } catch {
        /* auditoria não bloqueia */
      }

      return {
        status: 201,
        corpo: {
          pedido: resultado,
          impressao,
        },
      };
    });
  });

  app.put("/pedidos/:id/status", authCozinha, async (req, reply) => {
    const id = Number((req.params as any).id);
    const status = String((req.body as any)?.status ?? "").toUpperCase();
    if (!Number.isFinite(id) || !STATUS_OK.has(status)) {
      return reply.code(400).send({
        erro: status === "CANCELADO"
          ? "Use POST /pedidos/:id/cancelar para cancelar o pedido"
          : "Status inválido",
      });
    }

    const rota = `PUT /pedidos/${id}/status`;
    return comIdempotencia(req, reply, rota, async () => {
      const pedido = await prisma.pedido.findUnique({ where: { id } });
      if (!pedido) return { status: 404, corpo: { erro: "Pedido não encontrado" } };

      const tipo = (req.user as any).tipo as TipoUsuario;
      if (tipo === "COZINHEIRO" && !["PREPARO", "PRONTO"].includes(status)) {
        return { status: 403, corpo: { erro: "Cozinha só marca PREPARO ou PRONTO" } };
      }

      const permitidos = TRANSICOES[pedido.status] ?? new Set();
      if (!permitidos.has(status)) {
        return {
          status: 400,
          corpo: { erro: `Não dá para mudar de ${pedido.status} para ${status}` },
        };
      }

      const atualizado = await prisma.pedido.update({
        where: { id },
        data: { status: status as any },
        include: {
          atendimento: {
            select: {
              codigo_atendimento: true,
              mesa: { select: { numero: true } },
              tipo_atendimento: true,
            },
          },
          itens: { include: { escolhas: true, adicionais: true } },
        },
      });

      await registrarAuditoria(prisma, {
        usuario_id: Number((req.user as any).id),
        acao: "STATUS_PEDIDO",
        entidade: "Pedido",
        entidade_id: id,
        detalhes: { de: pedido.status, para: status },
      });

      return { status: 200, corpo: atualizado };
    });
  });

  app.post("/pedidos/:id/cancelar", authOps, async (req, reply) => {
    const id = Number((req.params as any).id);
    const body = req.body as { motivo?: string; pin?: string; aprovador_id?: number };
    const motivo = body.motivo?.trim();
    if (!Number.isFinite(id)) return reply.code(400).send({ erro: "ID inválido" });
    if (!motivo) return reply.code(400).send({ erro: "Informe o motivo" });

    const rota = `POST /pedidos/${id}/cancelar`;
    return comIdempotencia(req, reply, rota, async () => {
      const tipo = (req.user as any).tipo as TipoUsuario;
      let aprovadorId = Number((req.user as any).id);
      if (!tipoPodeAprovarSemPin(tipo)) {
        const aprov = await validarPinGerente(body.pin, body.aprovador_id);
        if (!aprov) {
          return {
            status: 403,
            corpo: { erro: "Cancelar pedido exige PIN de GERENTE+ (aprovador_id e pin)" },
          };
        }
        aprovadorId = aprov.id;
      }

      const usuario_id = Number((req.user as any).id);
      try {
        const { pedido, itens } = await prisma.$transaction(async (tx) => {
          const ped = await tx.pedido.findUnique({
            where: { id },
            include: {
              atendimento: { include: { mesa: true } },
              itens: { include: includeItemFull },
            },
          });
          if (!ped) throw Object.assign(new Error("Pedido não encontrado"), { status: 404 });
          if (ped.status === "CANCELADO") {
            throw Object.assign(new Error("Pedido já cancelado"), { status: 400 });
          }
          if (ped.atendimento.status !== "ABERTO") {
            throw Object.assign(new Error("Atendimento não está aberto"), { status: 400 });
          }

          await tx.pedido.update({
            where: { id },
            data: { status: "CANCELADO" },
          });

          const agora = new Date();
          await tx.pedido_item.updateMany({
            where: { pedido_id: id, cancelado: false },
            data: {
              cancelado: true,
              cancelado_em: agora,
              cancelado_motivo: motivo,
              cancelado_usuario_id: usuario_id,
            },
          });

          const itensUp = await tx.pedido_item.findMany({
            where: { pedido_id: id },
            include: includeItemFull,
          });
          return { pedido: ped, itens: itensUp };
        });

        let impressao: Awaited<ReturnType<typeof enfileirarProducaoPedido>> = {
          status: "VAZIO",
          trabalhos: [],
          avisos: [],
        };
        try {
          const quem = await prisma.usuario.findUnique({
            where: { id: usuario_id },
            select: { nome: true },
          });
          impressao = await enfileirarProducaoPedido({
            pedido_id: id,
            codigo_pedido: pedido.codigo_pedido,
            atendimento_id: pedido.atendimento_id,
            codigo_atendimento: pedido.atendimento.codigo_atendimento,
            mesa_numero: pedido.atendimento.mesa?.numero ?? null,
            tipo_atendimento: pedido.atendimento.tipo_atendimento,
            itens: itens as any,
            cancelamento: true,
            motivo_cancelamento: motivo,
            cancelado_por: quem?.nome ?? null,
            observacao_atendimento: pedido.atendimento.observacao,
          });
        } catch (err) {
          impressao = {
            status: "ERRO",
            trabalhos: [],
            avisos: [err instanceof Error ? err.message : "Falha ao imprimir cancelamento"],
          };
        }

        await registrarAuditoria(prisma, {
          usuario_id,
          acao: "CANCELAR_PEDIDO",
          entidade: "Pedido",
          entidade_id: id,
          detalhes: { motivo, aprovadorId },
        });

        return {
          status: 200,
          corpo: { ok: true, pedido_id: id, impressao, aprovador_id: aprovadorId },
        };
      } catch (err: any) {
        return {
          status: err?.status ?? 400,
          corpo: { erro: err instanceof Error ? err.message : "Falha ao cancelar" },
        };
      }
    });
  });

  app.post("/pedido-itens/:id/cancelar", authOps, async (req, reply) => {
    const id = Number((req.params as any).id);
    const motivo = String((req.body as any)?.motivo ?? "").trim();
    if (!Number.isFinite(id)) return reply.code(400).send({ erro: "ID inválido" });
    if (!motivo) return reply.code(400).send({ erro: "Informe o motivo" });

    return comIdempotencia(req, reply, `POST /pedido-itens/${id}/cancelar`, async () => {
      const item = await prisma.pedido_item.findUnique({
        where: { id },
        include: {
          ...includeItemFull,
          pedido: {
            include: {
              atendimento: { include: { mesa: true } },
            },
          },
        },
      });
      if (!item) return { status: 404, corpo: { erro: "Item não encontrado" } };
      if (item.cancelado) return { status: 400, corpo: { erro: "Item já cancelado" } };
      if (item.pedido.atendimento.status !== "ABERTO") {
        return { status: 400, corpo: { erro: "Atendimento não está aberto" } };
      }

      const usuario_id = Number((req.user as any).id);
      const atualizado = await prisma.pedido_item.update({
        where: { id },
        data: {
          cancelado: true,
          cancelado_em: new Date(),
          cancelado_motivo: motivo,
          cancelado_usuario_id: usuario_id,
        },
        include: includeItemFull,
      });

      let impressao: Awaited<ReturnType<typeof enfileirarProducaoPedido>> = {
        status: "VAZIO",
        trabalhos: [],
        avisos: [],
      };
      try {
        const quem = await prisma.usuario.findUnique({
          where: { id: usuario_id },
          select: { nome: true },
        });
        impressao = await enfileirarProducaoPedido({
          pedido_id: item.pedido_id,
          codigo_pedido: item.pedido.codigo_pedido,
          atendimento_id: item.pedido.atendimento_id,
          codigo_atendimento: item.pedido.atendimento.codigo_atendimento,
          mesa_numero: item.pedido.atendimento.mesa?.numero ?? null,
          tipo_atendimento: item.pedido.atendimento.tipo_atendimento,
          itens: [atualizado as any],
          cancelamento: true,
          motivo_cancelamento: motivo,
          cancelado_por: quem?.nome ?? null,
        });
      } catch (err) {
        impressao = {
          status: "ERRO",
          trabalhos: [],
          avisos: [err instanceof Error ? err.message : "Falha ao imprimir cancelamento"],
        };
      }

      await registrarAuditoria(prisma, {
        usuario_id,
        acao: "CANCELAR_ITEM",
        entidade: "Pedido_item",
        entidade_id: id,
        detalhes: { motivo, nome: item.nome_produto },
      });

      return { status: 200, corpo: { item: atualizado, impressao } };
    });
  });

  app.post("/pedidos/:id/reimprimir-producao", authOps, async (req, reply) => {
    const id = Number((req.params as any).id);
    if (!Number.isFinite(id)) return reply.code(400).send({ erro: "ID inválido" });
    const pedido = await prisma.pedido.findUnique({
      where: { id },
      include: {
        itens: { include: includeItemFull },
        atendimento: { include: { mesa: true } },
      },
    });
    if (!pedido) return reply.code(404).send({ erro: "Pedido não encontrado" });

    const impressao = await enfileirarProducaoPedido({
      pedido_id: pedido.id,
      codigo_pedido: pedido.codigo_pedido,
      atendimento_id: pedido.atendimento_id,
      codigo_atendimento: pedido.atendimento.codigo_atendimento,
      mesa_numero: pedido.atendimento.mesa?.numero ?? null,
      tipo_atendimento: pedido.atendimento.tipo_atendimento,
      itens: pedido.itens as any,
      reimpressao: true,
      disparo: "manual",
      observacao_atendimento: pedido.atendimento.observacao,
      hora_original: pedido.createdAt,
    });
    await registrarAuditoria(prisma, {
      usuario_id: Number((req.user as any).id),
      acao: "REIMPRIMIR_PRODUCAO",
      entidade: "Pedido",
      entidade_id: id,
      detalhes: { trabalhos: impressao.trabalhos },
    });
    return { ok: true, impressao };
  });
}
