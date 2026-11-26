import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { soTipos } from "../permissoes.js";

export async function rotasMesas(app: FastifyInstance) {
  const authOps = {
    onRequest: [(app as any).autenticar, soTipos("ROOT", "ADMIN", "GERENTE", "ATENDENTE")],
  };
  const authGestao = {
    onRequest: [(app as any).autenticar, soTipos("ROOT", "ADMIN", "GERENTE")],
  };

  app.get("/mesas", authOps, async (req) => {
    const todas = String((req.query as any)?.todas ?? "0") === "1";
    const mesas = await prisma.mesa.findMany({
      ...(todas ? {} : { where: { ativo: true } }),
      orderBy: { numero: "asc" },
      include: {
        atendimentos: {
          where: { status: "ABERTO" },
          take: 1,
          orderBy: { aberto_em: "desc" },
          select: {
            id: true,
            codigo_atendimento: true,
            cliente_nome: true,
            tipo_atendimento: true,
            aberto_em: true,
          },
        },
      },
    });

    return mesas.map((m) => {
      const aberto = m.atendimentos[0] ?? null;
      return {
        id: m.id,
        numero: m.numero,
        ativo: m.ativo,
        status: aberto ? "OCUPADA" : "LIVRE",
        atendimento_aberto: aberto,
      };
    });
  });

  app.post("/mesas", authGestao, async (req, reply) => {
    const body = req.body as { numero?: number; quantidade?: number };
    // Criar uma mesa ou um lote sequencial
    if (body.quantidade && Number.isFinite(body.quantidade) && body.quantidade > 1) {
      const qtd = Math.min(50, Math.round(body.quantidade));
      const existentes = await prisma.mesa.findMany({ select: { numero: true } });
      const usados = new Set(existentes.map((e) => e.numero));
      let n = 1;
      const criar: number[] = [];
      while (criar.length < qtd) {
        if (!usados.has(n)) criar.push(n);
        n++;
      }
      await prisma.mesa.createMany({ data: criar.map((numero) => ({ numero })) });
      return prisma.mesa.findMany({ where: { numero: { in: criar } }, orderBy: { numero: "asc" } });
    }

    const numero = Number(body.numero);
    if (!Number.isFinite(numero) || numero < 1) {
      return reply.code(400).send({ erro: "Informe o número da mesa (≥ 1)" });
    }
    const existe = await prisma.mesa.findUnique({ where: { numero } });
    if (existe?.ativo) return reply.code(409).send({ erro: "Já existe mesa com esse número" });
    if (existe && !existe.ativo) {
      return prisma.mesa.update({ where: { id: existe.id }, data: { ativo: true } });
    }
    return reply.code(201).send(await prisma.mesa.create({ data: { numero } }));
  });

  app.put("/mesas/:id", authGestao, async (req, reply) => {
    const id = Number((req.params as any).id);
    if (!Number.isFinite(id)) return reply.code(400).send({ erro: "ID inválido" });
    const atual = await prisma.mesa.findUnique({ where: { id } });
    if (!atual) return reply.code(404).send({ erro: "Mesa não encontrada" });

    const body = req.body as { numero?: number; ativo?: boolean };
    const data: Record<string, unknown> = {};
    if (body.numero !== undefined) {
      const numero = Number(body.numero);
      if (!Number.isFinite(numero) || numero < 1) {
        return reply.code(400).send({ erro: "Número inválido" });
      }
      const conflito = await prisma.mesa.findFirst({
        where: { numero, id: { not: id } },
      });
      if (conflito) return reply.code(409).send({ erro: "Já existe mesa com esse número" });
      data.numero = numero;
    }
    if (body.ativo !== undefined) data.ativo = body.ativo;

    return prisma.mesa.update({ where: { id }, data });
  });

  app.delete("/mesas/:id", authGestao, async (req, reply) => {
    const id = Number((req.params as any).id);
    if (!Number.isFinite(id)) return reply.code(400).send({ erro: "ID inválido" });
    const atual = await prisma.mesa.findUnique({
      where: { id },
      include: { atendimentos: { where: { status: "ABERTO" }, take: 1 } },
    });
    if (!atual) return reply.code(404).send({ erro: "Mesa não encontrada" });
    if (atual.atendimentos.length) {
      return reply.code(400).send({ erro: "Mesa com atendimento aberto — feche ou transfira antes" });
    }
    return prisma.mesa.update({ where: { id }, data: { ativo: false } });
  });
}
