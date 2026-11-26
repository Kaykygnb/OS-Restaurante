import { createHash } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../db.js";
import { canonico } from "./auditoria.js";

const DIA_MS = 24 * 60 * 60 * 1000;
const PRESO_MS = 2 * 60 * 1000;

export function lerIdempotencyKey(req: FastifyRequest): string | null {
  const raw = req.headers["idempotency-key"];
  const chave = Array.isArray(raw) ? raw[0] : raw;
  if (!chave || typeof chave !== "string") return null;
  const t = chave.trim();
  if (!t || t.length > 128) return null;
  return t;
}

export function hashPayload(corpo: unknown) {
  return createHash("sha256").update(canonico(corpo ?? null)).digest("hex");
}

function lerJson(texto: string) {
  try {
    return JSON.parse(texto);
  } catch {
    return texto;
  }
}

export async function comIdempotencia(
  req: FastifyRequest,
  reply: FastifyReply,
  rota: string,
  executar: () => Promise<{ status: number; corpo: unknown }>,
  opts?: { obrigatoria?: boolean }
) {
  const chave = lerIdempotencyKey(req);
  const usuario_id = Number((req.user as { id?: number })?.id);
  if (!chave) {
    if (opts?.obrigatoria) {
      return reply.code(400).send({
        erro: "Envie o cabeçalho Idempotency-Key.",
        codigo: "chave_idempotencia_obrigatoria",
      });
    }
    const resultado = await executar();
    return reply.code(resultado.status).send(resultado.corpo);
  }
  if (!Number.isFinite(usuario_id)) {
    return reply.code(401).send({ erro: "Faça login", codigo: "sem_sessao" });
  }

  const hash = hashPayload(req.body);
  const existente = await prisma.requisicao_idempotente.findUnique({
    where: { chave_usuario_id_rota: { chave, usuario_id, rota } },
  });
  if (existente) {
    const idade = Date.now() - existente.criado_em.getTime();
    if (idade > DIA_MS) {
      await prisma.requisicao_idempotente.delete({ where: { id: existente.id } }).catch(() => undefined);
    } else if (existente.em_andamento) {
      if (idade < PRESO_MS) {
        return reply.code(409).send({
          erro: "Essa venda ainda está sendo gravada. Tente de novo em 1 segundo.",
          codigo: "em_processamento",
        });
      }
      await prisma.requisicao_idempotente.delete({ where: { id: existente.id } }).catch(() => undefined);
    } else if (existente.hash_payload && existente.hash_payload !== hash) {
      return reply.code(422).send({
        erro: "Essa chave já foi usada com outro conteúdo.",
        codigo: "chave_reutilizada",
      });
    } else {
      return reply.code(existente.status_http).send(lerJson(existente.resposta_json));
    }
  }

  try {
    await prisma.requisicao_idempotente.create({
      data: {
        chave,
        usuario_id,
        rota,
        hash_payload: hash,
        em_andamento: true,
        status_http: 0,
        resposta_json: "null",
      },
    });
  } catch {
    return reply.code(409).send({
      erro: "Essa venda ainda está sendo gravada. Tente de novo em 1 segundo.",
      codigo: "em_processamento",
    });
  }

  try {
    const resultado = await executar();
    await prisma.requisicao_idempotente.update({
      where: { chave_usuario_id_rota: { chave, usuario_id, rota } },
      data: {
        em_andamento: false,
        status_http: resultado.status,
        resposta_json: JSON.stringify(resultado.corpo ?? null),
      },
    });
    return reply.code(resultado.status).send(resultado.corpo);
  } catch (err) {
    await prisma.requisicao_idempotente
      .delete({ where: { chave_usuario_id_rota: { chave, usuario_id, rota } } })
      .catch(() => undefined);
    throw err;
  }
}
