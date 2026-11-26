import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { soTipos, type TipoUsuario } from "../permissoes.js";
import { registrarAuditoria } from "../operacao/auditoria.js";
import { enfileirarProducaoPedido } from "../operacao/producao.js";
import { proximoCodigo } from "../operacao/sequencia.js";

type BodyEscolha = { opcao_escolha_id: number; quantidade?: number };
type BodyAdicional = { adicional_variante_id: number; quantidade?: number };
type BodyItem = {
  produto_variante_id: number;
  quantidade?: number;
  observacao?: string | null;
  escolhas?: BodyEscolha[];
  adicionais?: BodyAdicional[];
};

const STATUS_OK = new Set(["ENVIADO", "PREPARO", "PRONTO", "ENTREGUE", "CANCELADO"]);

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

    const body = req.body as { itens?: BodyItem[] };
    if (!Array.isArray(body.itens) || !body.itens.length) {
      return reply.code(400).send({ erro: "Informe ao menos um item" });
    }

    const at = await prisma.atendimento.findUnique({
      where: { id: atendimento_id },
      include: { mesa: true },
    });
    if (!at) return reply.code(404).send({ erro: "Atendimento não encontrado" });
    if (at.status !== "ABERTO") return reply.code(400).send({ erro: "Atendimento não está aberto" });

    const usuario_id = Number((req.user as any).id);

    try {
      const resultado = await prisma.$transaction(async (tx) => {
        const codigo = await proximoCodigo(tx, "PEDIDO", "PD");
        const itensData: {
          nome_produto: string;
          preco_centavos: number;
          quantidade: number;
          observacao: string | null;
          produto_variante_id: number;
          escolhas: { nome_opcao: string; preco_extra_centavos: number; quantidade: number; opcao_escolha_id: number }[];
          adicionais: { nome_adicional: string; preco_centavos: number; quantidade: number; adicional_variante_id: number }[];
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

          // Valida escolhas por grupo
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
          for (const a of adicionaisIn) {
            const avId = Number(a.adicional_variante_id);
            const aq = Math.max(1, Math.round(Number(a.quantidade ?? 1)));
            const av = await tx.adicional_variante.findUnique({
              where: { id: avId },
              include: { adicional: true },
            });
            if (!av || !av.ativo || !av.adicional.ativo) {
              throw new Error("Adicional indisponível");
            }
            if (aq > av.adicional.qtd_max) {
              throw new Error(`"${av.nome}" máximo ${av.adicional.qtd_max}`);
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

        const pedido = await tx.pedido.create({
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

        return pedido;
      });

      const impressao = await enfileirarProducaoPedido({
        pedido_id: resultado.id,
        codigo_pedido: resultado.codigo_pedido,
        atendimento_id,
        codigo_atendimento: at.codigo_atendimento,
        mesa_numero: at.mesa?.numero ?? null,
        tipo_atendimento: at.tipo_atendimento,
        itens: resultado.itens as any,
      });

      await registrarAuditoria(prisma, {
        usuario_id,
        acao: "LANCAR_PEDIDO",
        entidade: "Pedido",
        entidade_id: resultado.id,
        detalhes: { codigo: resultado.codigo_pedido, itens: resultado.itens.length },
      });

      return reply.code(201).send({
        pedido: resultado,
        impressao: {
          trabalhos: impressao.trabalhos,
          avisos: impressao.avisos,
        },
      });
    } catch (err) {
      return reply.code(400).send({
        erro: err instanceof Error ? err.message : "Falha ao lançar pedido",
      });
    }
  });

  app.put("/pedidos/:id/status", authCozinha, async (req, reply) => {
    const id = Number((req.params as any).id);
    const status = String((req.body as any)?.status ?? "").toUpperCase();
    if (!Number.isFinite(id) || !STATUS_OK.has(status)) {
      return reply.code(400).send({ erro: "Status inválido" });
    }

    const pedido = await prisma.pedido.findUnique({ where: { id } });
    if (!pedido) return reply.code(404).send({ erro: "Pedido não encontrado" });

    const tipo = (req.user as any).tipo as TipoUsuario;
    if (tipo === "COZINHEIRO" && !["PREPARO", "PRONTO"].includes(status)) {
      return reply.code(403).send({ erro: "Cozinha só marca PREPARO ou PRONTO" });
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

    return atualizado;
  });

  app.post("/pedido-itens/:id/cancelar", authOps, async (req, reply) => {
    const id = Number((req.params as any).id);
    const motivo = String((req.body as any)?.motivo ?? "").trim();
    if (!Number.isFinite(id)) return reply.code(400).send({ erro: "ID inválido" });
    if (!motivo) return reply.code(400).send({ erro: "Informe o motivo" });

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
    if (!item) return reply.code(404).send({ erro: "Item não encontrado" });
    if (item.cancelado) return reply.code(400).send({ erro: "Item já cancelado" });
    if (item.pedido.atendimento.status !== "ABERTO") {
      return reply.code(400).send({ erro: "Atendimento não está aberto" });
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

    const impressao = await enfileirarProducaoPedido({
      pedido_id: item.pedido_id,
      codigo_pedido: item.pedido.codigo_pedido,
      atendimento_id: item.pedido.atendimento_id,
      codigo_atendimento: item.pedido.atendimento.codigo_atendimento,
      mesa_numero: item.pedido.atendimento.mesa?.numero ?? null,
      tipo_atendimento: item.pedido.atendimento.tipo_atendimento,
      itens: [atualizado as any],
      cancelamento: true,
    });

    await registrarAuditoria(prisma, {
      usuario_id,
      acao: "CANCELAR_ITEM",
      entidade: "Pedido_item",
      entidade_id: id,
      detalhes: { motivo, nome: item.nome_produto },
    });

    return { item: atualizado, impressao };
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
    });
    return { ok: true, impressao };
  });
}
