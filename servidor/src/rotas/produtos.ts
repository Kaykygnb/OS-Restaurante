import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { soTipos } from "../permissoes.js";

type AtalhoMaisVendido = {
  posicao: number;
  produto_id: number;
  produto_variante_id: number;
  nome: string;
  variante_nome: string;
  preco_centavos: number;
  qtd_vendida: number;
  esgotado: boolean;
};

const cacheMaisVendidos = new Map<string, { expira: number; dados: AtalhoMaisVendido[] }>();

type VarianteInput = { nome?: string; preco_centavos?: number };

const includeVariantes = {
  produto_variantes: {
    where: { ativo: true },
    orderBy: { id: "asc" as const },
  },
  categoria: { select: { id: true, nome: true } },
};

const includeVariantesComEscolhas = {
  produto_variantes: {
    where: { ativo: true },
    orderBy: { id: "asc" as const },
    include: {
      grupos_escolhas: {
        where: { ativo: true },
        orderBy: { ordem: "asc" as const },
        include: {
          opcoes_escolha: {
            where: { ativo: true },
            orderBy: { ordem: "asc" as const },
          },
        },
      },
    },
  },
  categoria: { select: { id: true, nome: true } },
};

function normalizarVariantes(
  body: {
    variantes?: VarianteInput[];
    variante?: VarianteInput;
    preco_centavos?: number;
  }
): { nome: string; preco_centavos: number }[] | { erro: string } {
  let lista: VarianteInput[] = [];
  if (Array.isArray(body.variantes) && body.variantes.length > 0) {
    lista = body.variantes;
  } else if (body.variante) {
    lista = [body.variante];
  } else if (body.preco_centavos !== undefined) {
    lista = [{ nome: "Padrão", preco_centavos: body.preco_centavos }];
  } else {
    return { erro: "Informe ao menos uma variante com preço (variantes[])" };
  }

  const out: { nome: string; preco_centavos: number }[] = [];
  for (const [i, v] of lista.entries()) {
    const nome = v.nome?.trim() || (i === 0 ? "Padrão" : `Opção ${i + 1}`);
    const preco = v.preco_centavos;
    if (preco === undefined || !Number.isFinite(preco) || preco < 0) {
      return { erro: `Variante "${nome}" precisa de preço válido (≥ 0)` };
    }
    out.push({ nome, preco_centavos: Math.round(preco) });
  }
  return out;
}

export async function rotasProdutos(app: FastifyInstance) {
  const auth = { onRequest: [(app as any).autenticar] };
  const authGestao = {
    onRequest: [(app as any).autenticar, soTipos("ROOT", "ADMIN", "GERENTE")],
  };

  const authOps = {
    onRequest: [(app as any).autenticar, soTipos("ROOT", "ADMIN", "GERENTE", "ATENDENTE")],
  };

  app.get("/produtos/mais-vendidos", authOps, async (req) => {
    const limite = Math.min(50, Math.max(1, Number((req.query as { limite?: string }).limite ?? 9) || 9));
    const dias = Math.min(365, Math.max(1, Number((req.query as { dias?: string }).dias ?? 30) || 30));
    const chave = `${limite}:${dias}`;
    const guardado = cacheMaisVendidos.get(chave);
    if (guardado && guardado.expira > Date.now()) return guardado.dados;

    const desde = new Date(Date.now() - dias * 86_400_000);
    const vendidos = await prisma.pedido_item.groupBy({
      by: ["produto_variante_id"],
      where: {
        cancelado: false,
        createdAt: { gte: desde },
        pedido: { atendimento: { status: { not: "CANCELADO" } } },
        produto_variante: { ativo: true, produto: { ativo: true } },
      },
      _sum: { quantidade: true },
    });
    const ids = vendidos.map((v) => v.produto_variante_id);
    const variantes = ids.length
      ? await prisma.produto_variante.findMany({
          where: { id: { in: ids }, ativo: true, produto: { ativo: true } },
          include: { produto: { select: { id: true, nome: true, esgotado: true } } },
        })
      : [];
    const porId = new Map(variantes.map((v) => [v.id, v]));
    const ranking = vendidos
      .map((v) => {
        const variante = porId.get(v.produto_variante_id);
        if (!variante) return null;
        return {
          produto_id: variante.produto.id,
          produto_variante_id: variante.id,
          nome: variante.produto.nome,
          variante_nome: variante.nome,
          preco_centavos: variante.preco_centavos,
          qtd_vendida: v._sum.quantidade ?? 0,
          esgotado: variante.esgotado || variante.produto.esgotado,
        };
      })
      .filter((item): item is Omit<AtalhoMaisVendido, "posicao"> => item != null)
      .sort((a, b) => b.qtd_vendida - a.qtd_vendida || a.nome.localeCompare(b.nome, "pt-BR") || a.variante_nome.localeCompare(b.variante_nome, "pt-BR"));

    if (ranking.length < limite) {
      const usados = new Set(ranking.map((item) => item.produto_variante_id));
      const complemento = await prisma.produto_variante.findMany({
        where: { ativo: true, produto: { ativo: true }, id: { notIn: [...usados] } },
        include: { produto: { select: { id: true, nome: true, esgotado: true } } },
        orderBy: [{ produto_id: "asc" }, { id: "asc" }],
        take: limite - ranking.length,
      });
      for (const variante of complemento) {
        ranking.push({
          produto_id: variante.produto.id,
          produto_variante_id: variante.id,
          nome: variante.produto.nome,
          variante_nome: variante.nome,
          preco_centavos: variante.preco_centavos,
          qtd_vendida: 0,
          esgotado: variante.esgotado || variante.produto.esgotado,
        });
      }
    }

    const dados = ranking.slice(0, limite).map((item, i) => ({ posicao: i + 1, ...item }));
    cacheMaisVendidos.set(chave, { expira: Date.now() + 10 * 60_000, dados });
    return dados;
  });

  app.get("/produtos", auth, async (req) => {
    const q = req.query as { categoria_id?: string; todos?: string };
    const categoriaId = q.categoria_id ? Number(q.categoria_id) : undefined;
    const soAtivos = q.todos !== "1";

    return prisma.produto.findMany({
      where: {
        ...(soAtivos ? { ativo: true } : {}),
        ...(categoriaId && Number.isFinite(categoriaId) ? { categoria_id: categoriaId } : {}),
      },
      include: includeVariantes,
      orderBy: { nome: "asc" },
    });
  });

  app.get("/produtos/:id", auth, async (req, reply) => {
    const bruto = String((req.params as { id?: string }).id ?? "");
    if (!/^\d+$/.test(bruto)) {
      return reply.code(404).send({ erro: "Produto não encontrado", codigo: "nao_encontrado" });
    }
    const id = Number(bruto);

    const produto = await prisma.produto.findUnique({
      where: { id },
      include: {
        ...includeVariantesComEscolhas,
        grupos_adicionais_exclusoes: true,
      },
    });
    if (!produto) return reply.code(404).send({ erro: "Produto não encontrado" });
    return produto;
  });

  // Cria produto + 1..N variantes (preço só na variante)
  app.post("/produtos", authGestao, async (req, reply) => {
    const body = req.body as {
      nome?: string;
      descricao?: string;
      categoria_id?: number;
      exige_preparo?: boolean;
      controla_estoque?: boolean;
      variantes?: VarianteInput[];
      variante?: VarianteInput;
      preco_centavos?: number;
    };

    const nome = body.nome?.trim();
    const categoriaId = Number(body.categoria_id);
    if (!nome || nome.length < 2) {
      return reply.code(400).send({ erro: "Nome do produto deve ter pelo menos 2 caracteres" });
    }
    if (!Number.isFinite(categoriaId)) return reply.code(400).send({ erro: "Informe a categoria" });

    const categoria = await prisma.categoria.findUnique({ where: { id: categoriaId } });
    if (!categoria || !categoria.ativo) {
      return reply.code(400).send({ erro: "Categoria inválida ou inativa" });
    }

    const duplicado = await prisma.produto.findFirst({
      where: { categoria_id: categoriaId, nome: { equals: nome }, ativo: true },
    });
    if (duplicado) {
      return reply.code(409).send({ erro: "Já existe um produto ativo com esse nome nesta categoria" });
    }

    const variantes = normalizarVariantes(body);
    if ("erro" in variantes) return reply.code(400).send({ erro: variantes.erro });

    const produto = await prisma.produto.create({
      data: {
        nome,
        descricao: body.descricao?.trim() || null,
        categoria_id: categoriaId,
        exige_preparo: body.exige_preparo ?? true,
        controla_estoque: body.controla_estoque ?? false,
        produto_variantes: { create: variantes },
      },
      include: includeVariantes,
    });

    return reply.code(201).send(produto);
  });

  // Edita só dados do produto (sem preço)
  app.patch("/produtos/:id", authGestao, async (req, reply) => {
    const id = Number((req.params as any).id);
    const body = req.body as { esgotado?: boolean };
    if (!Number.isSafeInteger(id) || typeof body.esgotado !== "boolean") return reply.code(400).send({ erro: "Informe produto e estado de esgotado válidos" });
    const atual = await prisma.produto.findUnique({ where: { id } });
    if (!atual) return reply.code(404).send({ erro: "Produto não encontrado" });
    const produto = await prisma.produto.update({ where: { id }, data: {
      esgotado: body.esgotado,
      esgotado_em: body.esgotado ? new Date() : null,
      esgotado_por_id: body.esgotado ? Number((req.user as any).id) : null,
      esgotado_origem: body.esgotado ? "manual" : null,
    } });
    return produto;
  });

  app.put("/produtos/:id", authGestao, async (req, reply) => {
    const id = Number((req.params as any).id);
    if (!Number.isFinite(id)) return reply.code(400).send({ erro: "ID inválido" });

    const body = req.body as {
      nome?: string;
      descricao?: string | null;
      categoria_id?: number;
      exige_preparo?: boolean;
      controla_estoque?: boolean;
      caminho_imagem?: string | null;
      ativo?: boolean;
    };

    const atual = await prisma.produto.findUnique({ where: { id } });
    if (!atual) return reply.code(404).send({ erro: "Produto não encontrado" });

    const data: Record<string, unknown> = {};
    if (body.nome !== undefined) {
      const nome = body.nome.trim();
      if (nome.length < 2) return reply.code(400).send({ erro: "Nome deve ter pelo menos 2 caracteres" });
      const categoriaAlvo = body.categoria_id ?? atual.categoria_id;
      const duplicado = await prisma.produto.findFirst({
        where: {
          id: { not: id },
          categoria_id: categoriaAlvo,
          nome: { equals: nome },
          ativo: true,
        },
      });
      if (duplicado) {
        return reply.code(409).send({ erro: "Já existe um produto ativo com esse nome nesta categoria" });
      }
      data.nome = nome;
    }
    if (body.descricao !== undefined) data.descricao = body.descricao?.trim() || null;
    if (body.exige_preparo !== undefined) data.exige_preparo = body.exige_preparo;
    if (body.controla_estoque !== undefined) data.controla_estoque = body.controla_estoque;
    if (body.caminho_imagem !== undefined) data.caminho_imagem = body.caminho_imagem;
    if (body.ativo !== undefined) data.ativo = body.ativo;

    if (body.categoria_id !== undefined) {
      const categoriaId = Number(body.categoria_id);
      if (!Number.isFinite(categoriaId)) return reply.code(400).send({ erro: "categoria_id inválido" });
      const categoria = await prisma.categoria.findUnique({ where: { id: categoriaId } });
      if (!categoria || !categoria.ativo) {
        return reply.code(400).send({ erro: "Categoria inválida ou inativa" });
      }
      data.categoria_id = categoriaId;
    }

    return prisma.produto.update({ where: { id }, data, include: includeVariantes });
  });

  app.delete("/produtos/:id", authGestao, async (req, reply) => {
    const id = Number((req.params as any).id);
    if (!Number.isFinite(id)) return reply.code(400).send({ erro: "ID inválido" });
    const produto = await prisma.produto.findUnique({
      where: { id },
      include: { produto_variantes: { select: { id: true } } },
    });
    if (!produto) return reply.code(404).send({ erro: "Produto não encontrado" });
    if (!produto.ativo) return reply.code(400).send({ erro: "Produto já está inativo" });

    const varianteIds = produto.produto_variantes.map((v) => v.id);

    await prisma.$transaction(async (tx) => {
      if (varianteIds.length) {
        const grupos = await tx.grupo_escolhas.findMany({
          where: { produto_variante_id: { in: varianteIds }, ativo: true },
          select: { id: true },
        });
        const grupoIds = grupos.map((g) => g.id);
        if (grupoIds.length) {
          await tx.opcao_escolha.updateMany({
            where: { grupo_escolhas_id: { in: grupoIds }, ativo: true },
            data: { ativo: false },
          });
          await tx.grupo_escolhas.updateMany({
            where: { id: { in: grupoIds } },
            data: { ativo: false },
          });
        }
        await tx.produto_variante.updateMany({
          where: { produto_id: id, ativo: true },
          data: { ativo: false },
        });
      }
      await tx.produto.update({ where: { id }, data: { ativo: false } });
    });

    return { id, ativo: false, mensagem: "Produto desativado" };
  });

  // ——— Variantes ———

  app.post("/produtos/:id/variantes", authGestao, async (req, reply) => {
    const produtoId = Number((req.params as any).id);
    if (!Number.isFinite(produtoId)) return reply.code(400).send({ erro: "ID inválido" });

    const produto = await prisma.produto.findUnique({ where: { id: produtoId } });
    if (!produto || !produto.ativo) return reply.code(404).send({ erro: "Produto não encontrado" });

    const body = req.body as VarianteInput;
    const nome = body.nome?.trim();
    if (!nome) return reply.code(400).send({ erro: "Informe o nome da variante" });
    if (body.preco_centavos === undefined || !Number.isFinite(body.preco_centavos) || body.preco_centavos < 0) {
      return reply.code(400).send({ erro: "Informe um preço válido" });
    }

    const criada = await prisma.produto_variante.create({
      data: {
        produto_id: produtoId,
        nome,
        preco_centavos: Math.round(body.preco_centavos),
      },
    });
    return reply.code(201).send(criada);
  });

  app.put("/produtos/:produtoId/variantes/:varianteId", authGestao, async (req, reply) => {
    const produtoId = Number((req.params as any).produtoId);
    const varianteId = Number((req.params as any).varianteId);
    if (!Number.isFinite(produtoId) || !Number.isFinite(varianteId)) {
      return reply.code(400).send({ erro: "IDs inválidos" });
    }

    const variante = await prisma.produto_variante.findFirst({
      where: { id: varianteId, produto_id: produtoId },
    });
    if (!variante) return reply.code(404).send({ erro: "Variante não encontrada" });

    const body = req.body as { nome?: string; preco_centavos?: number; ativo?: boolean };
    const data: Record<string, unknown> = {};
    if (body.nome !== undefined) {
      const nome = body.nome.trim();
      if (!nome) return reply.code(400).send({ erro: "Nome da variante não pode ser vazio" });
      data.nome = nome;
    }
    if (body.preco_centavos !== undefined) {
      if (!Number.isFinite(body.preco_centavos) || body.preco_centavos < 0) {
        return reply.code(400).send({ erro: "Preço inválido" });
      }
      data.preco_centavos = Math.round(body.preco_centavos);
    }
    if (body.ativo !== undefined) data.ativo = body.ativo;

    return prisma.produto_variante.update({ where: { id: varianteId }, data });
  });

  // Soft-delete variante — não pode ficar sem nenhuma ativa
  app.delete("/produtos/:produtoId/variantes/:varianteId", authGestao, async (req, reply) => {
    const produtoId = Number((req.params as any).produtoId);
    const varianteId = Number((req.params as any).varianteId);
    if (!Number.isFinite(produtoId) || !Number.isFinite(varianteId)) {
      return reply.code(400).send({ erro: "IDs inválidos" });
    }

    const ativas = await prisma.produto_variante.count({
      where: { produto_id: produtoId, ativo: true },
    });
    if (ativas <= 1) {
      return reply.code(409).send({
        erro: "Todo produto precisa de pelo menos uma variante ativa",
      });
    }

    const variante = await prisma.produto_variante.findFirst({
      where: { id: varianteId, produto_id: produtoId, ativo: true },
    });
    if (!variante) return reply.code(404).send({ erro: "Variante não encontrada" });

    return prisma.produto_variante.update({
      where: { id: varianteId },
      data: { ativo: false },
    });
  });
}
