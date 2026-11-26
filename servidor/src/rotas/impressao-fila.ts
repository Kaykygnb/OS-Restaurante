import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { soTipos } from "../permissoes.js";
import { registrarAuditoria } from "../operacao/auditoria.js";
import { publicar } from "../eventos/barramento.js";

export async function rotasImpressaoFila(app: FastifyInstance) {
  const authOps = {
    onRequest: [(app as any).autenticar, soTipos("ROOT", "ADMIN", "GERENTE", "ATENDENTE", "COZINHEIRO")],
  };

  app.get("/impressoras/status", authOps, async () => {
    const impressoras = await prisma.impressora.findMany({
      where: { ativo: true },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, ultimo_status: true, ultimo_erro: true, testado_em: true, updatedAt: true },
    });
    return impressoras.map((imp) => ({
      id: imp.id,
      nome: imp.nome,
      status: imp.ultimo_status === "ONLINE" ? "ok" : imp.ultimo_status === "ERRO" ? "erro" : "sem_resposta",
      ultimo_erro: imp.ultimo_erro,
      desde: (imp.testado_em ?? imp.updatedAt).toISOString(),
    }));
  });

  app.get("/impressao/fila", authOps, async (req) => {
    const status = String((req.query as any)?.status ?? "").toUpperCase();
    const trabalhos = await prisma.trabalho_impressao.findMany({
      where: status ? { status: status as any } : {},
      orderBy: { criado_em: "desc" },
      take: 100,
      include: { impressora: { select: { id: true, nome: true, ultimo_status: true, ultimo_erro: true } } },
    });
    return trabalhos.map((t) => ({
      id: t.id,
      tipo_documento: t.tipo_documento,
      status: t.status,
      tentativas: t.tentativas,
      ultimo_erro: t.ultimo_erro,
      proxima_tentativa_em: t.proxima_tentativa_em,
      criado_em: t.criado_em,
      impresso_em: t.impresso_em,
      pedido_id: t.pedido_id,
      atendimento_id: t.atendimento_id,
      impressora: t.impressora,
    }));
  });

  app.post("/impressao/:id/reimprimir", authOps, async (req, reply) => {
    const id = Number((req.params as any).id);
    const origem = await prisma.trabalho_impressao.findUnique({ where: { id } });
    if (!origem) return reply.code(404).send({ erro: "Trabalho não encontrado", codigo: "nao_encontrado" });
    const novo = await prisma.trabalho_impressao.create({
      data: {
        impressora_id: origem.impressora_id,
        tipo_documento: "REIMPRESSAO",
        conteudo: origem.conteudo,
        pedido_id: origem.pedido_id,
        atendimento_id: origem.atendimento_id,
        documento_origem_id: origem.id,
        status: "PENDENTE",
        tentativas: 0,
      },
    });
    await registrarAuditoria(prisma, {
      usuario_id: Number((req.user as any).id),
      tipo: "impressao.reimpressao",
      sensivel: true,
      entidade: "Trabalho_impressao",
      entidade_id: novo.id,
      atendimento_id: origem.atendimento_id,
      detalhes: { origem_id: origem.id, documento: origem.tipo_documento },
    });
    publicar("impressao.trabalho", novo.id);
    return reply.code(201).send({ id: novo.id, status: novo.status });
  });

  app.post("/impressao/:id/cancelar", authOps, async (req, reply) => {
    const id = Number((req.params as any).id);
    const tipo = (req.user as any).tipo as string;
    if (!["ROOT", "ADMIN", "GERENTE"].includes(tipo)) {
      return reply.code(403).send({ erro: "Só a gerência cancela um trabalho.", codigo: "sem_permissao" });
    }
    const atual = await prisma.trabalho_impressao.findUnique({ where: { id } });
    if (!atual) return reply.code(404).send({ erro: "Trabalho não encontrado", codigo: "nao_encontrado" });
    if (atual.status === "IMPRESSO") {
      return reply.code(409).send({ erro: "Esse cupom já foi impresso.", codigo: "ja_impresso" });
    }
    const up = await prisma.trabalho_impressao.update({
      where: { id },
      data: { status: "CANCELADO" },
    });
    publicar("impressao.trabalho", id);
    return { id: up.id, status: up.status };
  });
}
