import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { soTipos } from "../permissoes.js";

const includeGrupo = {
  opcoes_escolha: {
    where: { ativo: true },
    orderBy: { ordem: "asc" as const },
  },
};

async function garantirVariante(produtoId: number, varianteId: number) {
  return prisma.produto_variante.findFirst({
    where: { id: varianteId, produto_id: produtoId, ativo: true },
  });
}

export async function rotasEscolhas(app: FastifyInstance) {
  const auth = { onRequest: [(app as any).autenticar] };
  const authGestao = {
    onRequest: [(app as any).autenticar, soTipos("ROOT", "ADMIN", "GERENTE")],
  };

  app.get("/produtos/:produtoId/variantes/:varianteId/escolhas", auth, async (req, reply) => {
    const produtoId = Number((req.params as any).produtoId);
    const varianteId = Number((req.params as any).varianteId);
    if (!Number.isFinite(produtoId) || !Number.isFinite(varianteId)) {
      return reply.code(400).send({ erro: "IDs inválidos" });
    }

    const variante = await garantirVariante(produtoId, varianteId);
    if (!variante) return reply.code(404).send({ erro: "Variante não encontrada" });

    return prisma.grupo_escolhas.findMany({
      where: { produto_variante_id: varianteId, ativo: true },
      orderBy: { ordem: "asc" },
      include: includeGrupo,
    });
  });

  app.post("/produtos/:produtoId/variantes/:varianteId/escolhas", authGestao, async (req, reply) => {
    const produtoId = Number((req.params as any).produtoId);
    const varianteId = Number((req.params as any).varianteId);
    if (!Number.isFinite(produtoId) || !Number.isFinite(varianteId)) {
      return reply.code(400).send({ erro: "IDs inválidos" });
    }

    const variante = await garantirVariante(produtoId, varianteId);
    if (!variante) return reply.code(404).send({ erro: "Variante não encontrada" });

    const body = req.body as {
      nome?: string;
      min_escolhas?: number;
      max_escolhas?: number;
      permite_repetir?: boolean;
      ordem?: number;
      opcoes?: { nome?: string; preco_extra_centavos?: number }[];
    };

    const nome = body.nome?.trim();
    if (!nome || nome.length < 2) {
      return reply.code(400).send({ erro: "Informe o nome do grupo (ex: Molho, Sabores)" });
    }

    const min = body.min_escolhas ?? 0;
    const max = body.max_escolhas ?? 1;
    if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < 1) {
      return reply.code(400).send({ erro: "min/max de escolhas inválidos" });
    }
    if (min > max) {
      return reply.code(400).send({ erro: "Mínimo de escolhas não pode ser maior que o máximo" });
    }

    const opcoesCreate: { nome: string; preco_extra_centavos: number; ordem: number }[] = [];
    if (Array.isArray(body.opcoes)) {
      for (let i = 0; i < body.opcoes.length; i++) {
        const o = body.opcoes[i];
        const nomeOp = o?.nome?.trim();
        if (!nomeOp) continue;
        const preco = o.preco_extra_centavos ?? 0;
        if (!Number.isFinite(preco) || preco < 0) {
          return reply.code(400).send({ erro: `Preço extra inválido em "${nomeOp}"` });
        }
        opcoesCreate.push({
          nome: nomeOp,
          preco_extra_centavos: Math.round(preco),
          ordem: i + 1,
        });
      }
    }

    const ultima = await prisma.grupo_escolhas.findFirst({
      where: { produto_variante_id: varianteId, ativo: true },
      orderBy: { ordem: "desc" },
      select: { ordem: true },
    });

    const grupo = await prisma.grupo_escolhas.create({
      data: {
        nome,
        min_escolhas: min,
        max_escolhas: max,
        permite_repetir: body.permite_repetir ?? false,
        ordem: body.ordem ?? (ultima?.ordem ?? 0) + 1,
        produto_variante_id: varianteId,
        ...(opcoesCreate.length
          ? { opcoes_escolha: { create: opcoesCreate } }
          : {}),
      },
      include: includeGrupo,
    });

    return reply.code(201).send(grupo);
  });

  app.put("/grupos-escolhas/:id", authGestao, async (req, reply) => {
    const id = Number((req.params as any).id);
    if (!Number.isFinite(id)) return reply.code(400).send({ erro: "ID inválido" });

    const body = req.body as {
      nome?: string;
      min_escolhas?: number;
      max_escolhas?: number;
      permite_repetir?: boolean;
      ordem?: number;
      ativo?: boolean;
    };

    const atual = await prisma.grupo_escolhas.findUnique({ where: { id } });
    if (!atual) return reply.code(404).send({ erro: "Grupo não encontrado" });

    const min = body.min_escolhas ?? atual.min_escolhas;
    const max = body.max_escolhas ?? atual.max_escolhas;
    if (min > max) {
      return reply.code(400).send({ erro: "Mínimo de escolhas não pode ser maior que o máximo" });
    }

    const data: Record<string, unknown> = {};
    if (body.nome !== undefined) {
      const nome = body.nome.trim();
      if (nome.length < 2) return reply.code(400).send({ erro: "Nome inválido" });
      data.nome = nome;
    }
    if (body.min_escolhas !== undefined) data.min_escolhas = body.min_escolhas;
    if (body.max_escolhas !== undefined) data.max_escolhas = body.max_escolhas;
    if (body.permite_repetir !== undefined) data.permite_repetir = body.permite_repetir;
    if (body.ordem !== undefined) data.ordem = body.ordem;
    if (body.ativo !== undefined) data.ativo = body.ativo;

    return prisma.grupo_escolhas.update({
      where: { id },
      data,
      include: includeGrupo,
    });
  });

  app.delete("/grupos-escolhas/:id", authGestao, async (req, reply) => {
    const id = Number((req.params as any).id);
    if (!Number.isFinite(id)) return reply.code(400).send({ erro: "ID inválido" });

    const grupo = await prisma.grupo_escolhas.findUnique({ where: { id } });
    if (!grupo) return reply.code(404).send({ erro: "Grupo não encontrado" });
    if (!grupo.ativo) return reply.code(400).send({ erro: "Grupo já inativo" });

    await prisma.$transaction(async (tx) => {
      await tx.opcao_escolha.updateMany({
        where: { grupo_escolhas_id: id, ativo: true },
        data: { ativo: false },
      });
      await tx.grupo_escolhas.update({ where: { id }, data: { ativo: false } });
    });

    return { id, ativo: false };
  });

  app.post("/grupos-escolhas/:id/opcoes", authGestao, async (req, reply) => {
    const grupoId = Number((req.params as any).id);
    if (!Number.isFinite(grupoId)) return reply.code(400).send({ erro: "ID inválido" });

    const grupo = await prisma.grupo_escolhas.findUnique({ where: { id: grupoId } });
    if (!grupo || !grupo.ativo) return reply.code(404).send({ erro: "Grupo não encontrado" });

    const body = req.body as {
      nome?: string;
      preco_extra_centavos?: number;
      ordem?: number;
    };
    const nome = body.nome?.trim();
    if (!nome) return reply.code(400).send({ erro: "Informe o nome da opção" });

    const preco = body.preco_extra_centavos ?? 0;
    if (!Number.isFinite(preco) || preco < 0) {
      return reply.code(400).send({ erro: "Preço extra inválido" });
    }

    const ultima = await prisma.opcao_escolha.findFirst({
      where: { grupo_escolhas_id: grupoId, ativo: true },
      orderBy: { ordem: "desc" },
      select: { ordem: true },
    });

    return reply.code(201).send(
      await prisma.opcao_escolha.create({
        data: {
          nome,
          preco_extra_centavos: Math.round(preco),
          ordem: body.ordem ?? (ultima?.ordem ?? 0) + 1,
          grupo_escolhas_id: grupoId,
        },
      })
    );
  });

  app.put("/opcoes-escolha/:id", authGestao, async (req, reply) => {
    const id = Number((req.params as any).id);
    if (!Number.isFinite(id)) return reply.code(400).send({ erro: "ID inválido" });

    const body = req.body as {
      nome?: string;
      preco_extra_centavos?: number;
      ordem?: number;
      ativo?: boolean;
    };

    const data: Record<string, unknown> = {};
    if (body.nome !== undefined) {
      const nome = body.nome.trim();
      if (!nome) return reply.code(400).send({ erro: "Nome inválido" });
      data.nome = nome;
    }
    if (body.preco_extra_centavos !== undefined) {
      if (!Number.isFinite(body.preco_extra_centavos) || body.preco_extra_centavos < 0) {
        return reply.code(400).send({ erro: "Preço extra inválido" });
      }
      data.preco_extra_centavos = Math.round(body.preco_extra_centavos);
    }
    if (body.ordem !== undefined) data.ordem = body.ordem;
    if (body.ativo !== undefined) data.ativo = body.ativo;

    try {
      return await prisma.opcao_escolha.update({ where: { id }, data });
    } catch {
      return reply.code(404).send({ erro: "Opção não encontrada" });
    }
  });

  app.delete("/opcoes-escolha/:id", authGestao, async (req, reply) => {
    const id = Number((req.params as any).id);
    if (!Number.isFinite(id)) return reply.code(400).send({ erro: "ID inválido" });
    try {
      return await prisma.opcao_escolha.update({
        where: { id },
        data: { ativo: false },
      });
    } catch {
      return reply.code(404).send({ erro: "Opção não encontrada" });
    }
  });
}
