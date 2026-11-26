import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { soTipos } from "../permissoes.js";

const includeGrupo = {
  categorias: { include: { categoria: { select: { id: true, nome: true } } } },
  adicionais: {
    where: { ativo: true },
    orderBy: { ordem: "asc" as const },
    include: {
      adicional_variantes: {
        where: { ativo: true },
        orderBy: { id: "asc" as const },
      },
    },
  },
  produtos_excluidos: {
    include: { produto: { select: { id: true, nome: true, categoria_id: true } } },
  },
};

export async function rotasAdicionais(app: FastifyInstance) {
  const auth = { onRequest: [(app as any).autenticar] };
  const authGestao = {
    onRequest: [(app as any).autenticar, soTipos("ROOT", "ADMIN", "GERENTE")],
  };

  // ——— Grupos ———

  app.get("/grupos-adicionais", auth, async () => {
    return prisma.grupo_adicionais.findMany({
      where: { ativo: true },
      orderBy: { ordem: "asc" },
      include: includeGrupo,
    });
  });

  app.post("/grupos-adicionais", authGestao, async (req, reply) => {
    const body = req.body as { nome?: string; ordem?: number; categoria_ids?: number[] };
    const nome = body.nome?.trim();
    if (!nome || nome.length < 2) {
      return reply.code(400).send({ erro: "Informe o nome do grupo (mín. 2 caracteres)" });
    }

    const ultima = await prisma.grupo_adicionais.findFirst({
      where: { ativo: true },
      orderBy: { ordem: "desc" },
      select: { ordem: true },
    });

    const categoriaIds = Array.isArray(body.categoria_ids)
      ? body.categoria_ids.map(Number).filter((id) => Number.isFinite(id))
      : [];

    if (categoriaIds.length > 0) {
      const cats = await prisma.categoria.findMany({
        where: { id: { in: categoriaIds }, ativo: true },
      });
      if (cats.length !== categoriaIds.length) {
        return reply.code(400).send({ erro: "Uma ou mais categorias são inválidas" });
      }
    }

    const grupo = await prisma.grupo_adicionais.create({
      data: {
        nome,
        ordem: body.ordem ?? (ultima?.ordem ?? 0) + 1,
        categorias: {
          create: categoriaIds.map((categoria_id) => ({ categoria_id })),
        },
      },
      include: includeGrupo,
    });

    return reply.code(201).send(grupo);
  });

  app.put("/grupos-adicionais/:id", authGestao, async (req, reply) => {
    const id = Number((req.params as any).id);
    if (!Number.isFinite(id)) return reply.code(400).send({ erro: "ID inválido" });

    const body = req.body as { nome?: string; ordem?: number; categoria_ids?: number[]; ativo?: boolean };
    const data: Record<string, unknown> = {};
    if (body.nome !== undefined) {
      const nome = body.nome.trim();
      if (nome.length < 2) return reply.code(400).send({ erro: "Nome inválido" });
      data.nome = nome;
    }
    if (body.ordem !== undefined) data.ordem = body.ordem;
    if (body.ativo !== undefined) data.ativo = body.ativo;

    const grupo = await prisma.grupo_adicionais.findUnique({ where: { id } });
    if (!grupo) return reply.code(404).send({ erro: "Grupo não encontrado" });

    if (Array.isArray(body.categoria_ids)) {
      const categoriaIds = body.categoria_ids.map(Number).filter((x) => Number.isFinite(x));
      await prisma.$transaction(async (tx) => {
        await tx.grupo_adicionais.update({ where: { id }, data });
        await tx.grupo_adicionais_categoria.deleteMany({ where: { grupo_adicionais_id: id } });
        if (categoriaIds.length) {
          await tx.grupo_adicionais_categoria.createMany({
            data: categoriaIds.map((categoria_id) => ({
              grupo_adicionais_id: id,
              categoria_id,
            })),
          });
        }
      });
    } else {
      await prisma.grupo_adicionais.update({ where: { id }, data });
    }

    return prisma.grupo_adicionais.findUnique({ where: { id }, include: includeGrupo });
  });

  app.delete("/grupos-adicionais/:id", authGestao, async (req, reply) => {
    const id = Number((req.params as any).id);
    if (!Number.isFinite(id)) return reply.code(400).send({ erro: "ID inválido" });
    const grupo = await prisma.grupo_adicionais.findUnique({ where: { id } });
    if (!grupo) return reply.code(404).send({ erro: "Grupo não encontrado" });
    if (!grupo.ativo) return reply.code(400).send({ erro: "Grupo já inativo" });

    await prisma.$transaction(async (tx) => {
      await tx.adicional.updateMany({
        where: { grupo_adicionais_id: id, ativo: true },
        data: { ativo: false },
      });
      await tx.grupo_adicionais.update({ where: { id }, data: { ativo: false } });
    });

    return { id, ativo: false, mensagem: "Grupo e adicionais desativados" };
  });

  // Excluir produto de um grupo (exceção)
  app.post("/grupos-adicionais/:id/exclusoes", authGestao, async (req, reply) => {
    const grupoId = Number((req.params as any).id);
    const { produto_id } = req.body as { produto_id?: number };
    const produtoId = Number(produto_id);
    if (!Number.isFinite(grupoId) || !Number.isFinite(produtoId)) {
      return reply.code(400).send({ erro: "Informe produto_id" });
    }

    const grupo = await prisma.grupo_adicionais.findUnique({
      where: { id: grupoId },
      include: { categorias: true },
    });
    if (!grupo || !grupo.ativo) return reply.code(404).send({ erro: "Grupo não encontrado" });

    const produto = await prisma.produto.findUnique({ where: { id: produtoId } });
    if (!produto || !produto.ativo) return reply.code(404).send({ erro: "Produto não encontrado" });

    const cats = new Set(grupo.categorias.map((c) => c.categoria_id));
    if (!cats.has(produto.categoria_id)) {
      return reply.code(400).send({
        erro: "Só dá pra excluir produto que está em uma categoria ligada a este grupo",
      });
    }

    const exclusao = await prisma.grupo_adicionais_produto_exclusao.upsert({
      where: {
        grupo_adicionais_id_produto_id: {
          grupo_adicionais_id: grupoId,
          produto_id: produtoId,
        },
      },
      create: { grupo_adicionais_id: grupoId, produto_id: produtoId },
      update: {},
    });

    return reply.code(201).send(exclusao);
  });

  app.delete("/grupos-adicionais/:id/exclusoes/:produtoId", authGestao, async (req, reply) => {
    const grupoId = Number((req.params as any).id);
    const produtoId = Number((req.params as any).produtoId);
    if (!Number.isFinite(grupoId) || !Number.isFinite(produtoId)) {
      return reply.code(400).send({ erro: "IDs inválidos" });
    }

    try {
      await prisma.grupo_adicionais_produto_exclusao.delete({
        where: {
          grupo_adicionais_id_produto_id: {
            grupo_adicionais_id: grupoId,
            produto_id: produtoId,
          },
        },
      });
      return { ok: true };
    } catch {
      return reply.code(404).send({ erro: "Exclusão não encontrada" });
    }
  });

  // ——— Adicionais ———

  app.post("/adicionais", authGestao, async (req, reply) => {
    const body = req.body as {
      grupo_adicionais_id?: number;
      nome?: string;
      qtd_max?: number;
      ordem?: number;
      variantes?: { nome?: string; preco_centavos?: number }[];
    };

    const nome = body.nome?.trim();
    const grupoId = Number(body.grupo_adicionais_id);
    if (!nome || nome.length < 2) return reply.code(400).send({ erro: "Informe o nome do adicional" });
    if (!Number.isFinite(grupoId)) return reply.code(400).send({ erro: "Informe o grupo" });

    const grupo = await prisma.grupo_adicionais.findUnique({ where: { id: grupoId } });
    if (!grupo || !grupo.ativo) return reply.code(400).send({ erro: "Grupo inválido" });

    const variantesIn = Array.isArray(body.variantes) && body.variantes.length > 0
      ? body.variantes
      : [{ nome: "Padrão", preco_centavos: 0 }];

    const variantes: { nome: string; preco_centavos: number }[] = [];
    for (const [i, v] of variantesIn.entries()) {
      const vn = v.nome?.trim() || (i === 0 ? "Padrão" : `Opção ${i + 1}`);
      const preco = v.preco_centavos;
      if (preco === undefined || !Number.isFinite(preco) || preco < 0) {
        return reply.code(400).send({ erro: `Variante "${vn}" precisa de preço válido` });
      }
      variantes.push({ nome: vn, preco_centavos: Math.round(preco) });
    }

    const adicional = await prisma.adicional.create({
      data: {
        nome,
        grupo_adicionais_id: grupoId,
        qtd_max: body.qtd_max ?? 5,
        ordem: body.ordem ?? 0,
        adicional_variantes: { create: variantes },
      },
      include: {
        adicional_variantes: { where: { ativo: true }, orderBy: { id: "asc" } },
      },
    });

    return reply.code(201).send(adicional);
  });

  app.put("/adicionais/:id", authGestao, async (req, reply) => {
    const id = Number((req.params as any).id);
    if (!Number.isFinite(id)) return reply.code(400).send({ erro: "ID inválido" });
    const body = req.body as { nome?: string; caminho_imagem?: string | null; qtd_max?: number; ordem?: number; ativo?: boolean };

    const data: Record<string, unknown> = {};
    if (body.nome !== undefined) {
      const nome = body.nome.trim();
      if (nome.length < 2) return reply.code(400).send({ erro: "Nome inválido" });
      data.nome = nome;
    }
    if (body.caminho_imagem !== undefined) data.caminho_imagem = body.caminho_imagem;
    if (body.qtd_max !== undefined) {
      if (!Number.isFinite(body.qtd_max) || body.qtd_max < 1) {
        return reply.code(400).send({ erro: "qtd_max deve ser ≥ 1" });
      }
      data.qtd_max = body.qtd_max;
    }
    if (body.ordem !== undefined) data.ordem = body.ordem;
    if (body.ativo !== undefined) data.ativo = body.ativo;

    try {
      return await prisma.adicional.update({
        where: { id },
        data,
        include: {
          adicional_variantes: { where: { ativo: true }, orderBy: { id: "asc" } },
        },
      });
    } catch {
      return reply.code(404).send({ erro: "Adicional não encontrado" });
    }
  });

  app.delete("/adicionais/:id", authGestao, async (req, reply) => {
    const id = Number((req.params as any).id);
    if (!Number.isFinite(id)) return reply.code(400).send({ erro: "ID inválido" });
    try {
      await prisma.$transaction(async (tx) => {
        await tx.adicional_variante.updateMany({
          where: { adicional_id: id, ativo: true },
          data: { ativo: false },
        });
        await tx.adicional.update({ where: { id }, data: { ativo: false } });
      });
      return { id, ativo: false };
    } catch {
      return reply.code(404).send({ erro: "Adicional não encontrado" });
    }
  });

  app.post("/adicionais/:id/variantes", authGestao, async (req, reply) => {
    const adicionalId = Number((req.params as any).id);
    const body = req.body as { nome?: string; preco_centavos?: number };
    const nome = body.nome?.trim();
    if (!Number.isFinite(adicionalId)) return reply.code(400).send({ erro: "ID inválido" });
    if (!nome) return reply.code(400).send({ erro: "Informe o nome" });
    if (body.preco_centavos === undefined || !Number.isFinite(body.preco_centavos) || body.preco_centavos < 0) {
      return reply.code(400).send({ erro: "Preço inválido" });
    }

    const adicional = await prisma.adicional.findUnique({ where: { id: adicionalId } });
    if (!adicional || !adicional.ativo) return reply.code(404).send({ erro: "Adicional não encontrado" });

    return reply.code(201).send(
      await prisma.adicional_variante.create({
        data: {
          adicional_id: adicionalId,
          nome,
          preco_centavos: Math.round(body.preco_centavos),
        },
      })
    );
  });

  app.put("/adicionais/:adicionalId/variantes/:varianteId", authGestao, async (req, reply) => {
    const adicionalId = Number((req.params as any).adicionalId);
    const varianteId = Number((req.params as any).varianteId);
    const body = req.body as { nome?: string; preco_centavos?: number; ativo?: boolean };

    const variante = await prisma.adicional_variante.findFirst({
      where: { id: varianteId, adicional_id: adicionalId },
    });
    if (!variante) return reply.code(404).send({ erro: "Variante não encontrada" });

    const data: Record<string, unknown> = {};
    if (body.nome !== undefined) {
      const nome = body.nome.trim();
      if (!nome) return reply.code(400).send({ erro: "Nome inválido" });
      data.nome = nome;
    }
    if (body.preco_centavos !== undefined) {
      if (!Number.isFinite(body.preco_centavos) || body.preco_centavos < 0) {
        return reply.code(400).send({ erro: "Preço inválido" });
      }
      data.preco_centavos = Math.round(body.preco_centavos);
    }
    if (body.ativo !== undefined) data.ativo = body.ativo;

    return prisma.adicional_variante.update({ where: { id: varianteId }, data });
  });

  app.delete("/adicionais/:adicionalId/variantes/:varianteId", authGestao, async (req, reply) => {
    const adicionalId = Number((req.params as any).adicionalId);
    const varianteId = Number((req.params as any).varianteId);

    const ativas = await prisma.adicional_variante.count({
      where: { adicional_id: adicionalId, ativo: true },
    });
    if (ativas <= 1) {
      return reply.code(409).send({ erro: "Todo adicional precisa de pelo menos uma variante ativa" });
    }

    try {
      return await prisma.adicional_variante.update({
        where: { id: varianteId },
        data: { ativo: false },
      });
    } catch {
      return reply.code(404).send({ erro: "Variante não encontrada" });
    }
  });
}
