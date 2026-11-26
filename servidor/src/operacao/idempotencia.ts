import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../db.js";

export function lerIdempotencyKey(req: FastifyRequest): string | null {
  const raw = req.headers["idempotency-key"];
  const chave = Array.isArray(raw) ? raw[0] : raw;
  if (!chave || typeof chave !== "string") return null;
  const t = chave.trim();
  if (!t || t.length > 128) return null;
  return t;
}

export async function buscarRespostaIdempotente(opts: {
  chave: string;
  usuario_id: number;
  rota: string;
}) {
  return prisma.requisicao_idempotente.findUnique({
    where: {
      chave_usuario_id_rota: {
        chave: opts.chave,
        usuario_id: opts.usuario_id,
        rota: opts.rota,
      },
    },
  });
}

export async function gravarRespostaIdempotente(opts: {
  chave: string;
  usuario_id: number;
  rota: string;
  status_http: number;
  corpo: unknown;
}) {
  try {
    await prisma.requisicao_idempotente.create({
      data: {
        chave: opts.chave,
        usuario_id: opts.usuario_id,
        rota: opts.rota,
        status_http: opts.status_http,
        resposta_json: JSON.stringify(opts.corpo ?? null),
      },
    });
  } catch {
    /* corrida: a primeira ganhou */
  }
}

export async function comIdempotencia(
  req: FastifyRequest,
  reply: FastifyReply,
  rota: string,
  executar: () => Promise<{ status: number; corpo: unknown }>
) {
  const chave = lerIdempotencyKey(req);
  const usuario_id = Number((req.user as any)?.id);

  if (chave && Number.isFinite(usuario_id)) {
    const existente = await buscarRespostaIdempotente({ chave, usuario_id, rota });
    if (existente) {
      let corpo: unknown = null;
      try {
        corpo = JSON.parse(existente.resposta_json);
      } catch {
        corpo = existente.resposta_json;
      }
      return reply.code(existente.status_http).send(corpo);
    }
  }

  const resultado = await executar();

  if (chave && Number.isFinite(usuario_id)) {
    await gravarRespostaIdempotente({
      chave,
      usuario_id,
      rota,
      status_http: resultado.status,
      corpo: resultado.corpo,
    });
  }

  return reply.code(resultado.status).send(resultado.corpo);
}
