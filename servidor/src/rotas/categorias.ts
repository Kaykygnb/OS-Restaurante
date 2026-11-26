import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { soTipos } from "../permissoes.js";

const includeCount = {
  _count: { select: { produtos: { where: { ativo: true } } } },
};

export async function rotasCategorias(app: FastifyInstance) {
  const auth = { onRequest: [(app as any).autenticar] };
  const authGestao = {
    onRequest: [(app as any).autenticar, soTipos("ROOT", "ADMIN", "GERENTE")],
  };

  app.get("/categorias", auth, async (req) => {
    const todas = (req.query as { todas?: string }).todas === "1";
    return prisma.categoria.findMany({
      where: todas ? {} : { ativo: true },
      orderBy: { ordem: "asc" },
      include: includeCount,
    });
  });

  app.post("/categorias", authGestao, async (req, reply) => {
    const { nome, ordem } = req.body as { nome?: string; ordem?: number };
    if (!nome?.trim()) return reply.code(400).send({ erro: "Informe o nome" });

    const nomeLimpo = nome.trim();
    if (nomeLimpo.length < 2) {
      return reply.code(400).send({ erro: "Nome da categoria deve ter pelo menos 2 caracteres" });
    }

    const existe = await prisma.categoria.findUnique({ where: { nome: nomeLimpo } });
    if (existe?.ativo) return reply.code(409).send({ erro: "Já existe uma categoria ativa com esse nome" });
    if (existe && !existe.ativo) {
      return prisma.categoria.update({
        where: { id: existe.id },
        data: { ativo: true, ordem: ordem ?? existe.ordem },
        include: includeCount,
      });
    }

    const ultima = await prisma.categoria.findFirst({
      where: { ativo: true },
      orderBy: { ordem: "desc" },
      select: { ordem: true },
    });

    return reply.code(201).send(
      await prisma.categoria.create({
        data: { nome: nomeLimpo, ordem: ordem ?? (ultima?.ordem ?? 0) + 1 },
        include: includeCount,
      })
    );
  });

  app.put("/categorias/reordenar", authGestao, async (req, reply) => {
    const { ids } = req.body as { ids?: number[] };
    if (!Array.isArray(ids) || ids.length === 0 || ids.some((id) => !Number.isFinite(Number(id)))) {
      return reply.code(400).send({ erro: "Informe ids: number[] na ordem desejada" });
    }

    const idsNum = ids.map(Number);
    if (new Set(idsNum).size !== idsNum.length) {
      return reply.code(400).send({ erro: "ids não pode ter repetidos" });
    }

    const ativas = await prisma.categoria.findMany({
      where: { ativo: true },
      select: { id: true },
    });
    const setAtivas = new Set(ativas.map((c) => c.id));
    if (idsNum.length !== setAtivas.size || idsNum.some((id) => !setAtivas.has(id))) {
      return reply.code(400).send({
        erro: "A lista de ids deve incluir exatamente todas as categorias ativas",
      });
    }

    await prisma.$transaction(
      idsNum.map((id, index) =>
        prisma.categoria.update({
          where: { id },
          data: { ordem: index + 1 },
        })
      )
    );

    return prisma.categoria.findMany({
      where: { ativo: true },
      orderBy: { ordem: "asc" },
      include: includeCount,
    });
  });

  app.put("/categorias/:id", authGestao, async (req, reply) => {
    const id = Number((req.params as any).id);
    if (!Number.isFinite(id)) return reply.code(400).send({ erro: "ID inválido" });
    const { nome, ordem, ativo, nao_imprime } = req.body as {
      nome?: string;
      ordem?: number;
      ativo?: boolean;
      nao_imprime?: boolean;
    };

    const data: Record<string, unknown> = {};
    if (nome !== undefined) {
      const n = nome.trim();
      if (n.length < 2) return reply.code(400).send({ erro: "Nome deve ter pelo menos 2 caracteres" });
      const conflito = await prisma.categoria.findFirst({
        where: { nome: n, id: { not: id }, ativo: true },
      });
      if (conflito) return reply.code(409).send({ erro: "Já existe outra categoria com esse nome" });
      data.nome = n;
    }
    if (ordem !== undefined) data.ordem = ordem;
    if (ativo !== undefined) data.ativo = ativo;
    if (nao_imprime !== undefined) data.nao_imprime = Boolean(nao_imprime);

    try {
      return await prisma.categoria.update({
        where: { id },
        data,
        include: includeCount,
      });
    } catch {
      return reply.code(404).send({ erro: "Categoria não encontrada" });
    }
  });

  // Soft delete. Regra: se tiver produtos ativos, exige cascata=true (desativa os produtos também)
  app.delete("/categorias/:id", authGestao, async (req, reply) => {
    const id = Number((req.params as any).id);
    if (!Number.isFinite(id)) return reply.code(400).send({ erro: "ID inválido" });

    const cascata =
      (req.query as { cascata?: string }).cascata === "1" ||
      (req.body as { cascata?: boolean } | null)?.cascata === true;

    const categoria = await prisma.categoria.findUnique({
      where: { id },
      include: { _count: { select: { produtos: { where: { ativo: true } } } } },
    });
    if (!categoria) return reply.code(404).send({ erro: "Categoria não encontrada" });
    if (!categoria.ativo) return reply.code(400).send({ erro: "Categoria já está inativa" });

    const qtd = categoria._count.produtos;
    if (qtd > 0 && !cascata) {
      return reply.code(409).send({
        erro: `Categoria tem ${qtd} produto(s) ativo(s). Mova/exclua os produtos ou exclua com cascata.`,
        qtd_produtos: qtd,
        precisa_cascata: true,
      });
    }

    await prisma.$transaction(async (tx) => {
      if (qtd > 0) {
        await tx.produto.updateMany({
          where: { categoria_id: id, ativo: true },
          data: { ativo: false },
        });
      }
      await tx.categoria.update({
        where: { id },
        data: { ativo: false },
      });
    });

    return {
      id,
      ativo: false,
      produtos_desativados: qtd,
      mensagem:
        qtd > 0
          ? `Categoria e ${qtd} produto(s) desativados`
          : "Categoria desativada",
    };
  });
}
