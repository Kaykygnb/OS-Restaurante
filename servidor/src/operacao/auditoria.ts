import type { Prisma } from "../generated/prisma/client.js";

type Tx = Prisma.TransactionClient | typeof import("../db.js").prisma;

export async function registrarAuditoria(
  db: Tx,
  opts: {
    usuario_id: number;
    acao: string;
    entidade: string;
    entidade_id?: number | null;
    detalhes?: unknown;
  }
) {
  return db.log_auditoria.create({
    data: {
      usuario_id: opts.usuario_id,
      acao: opts.acao,
      entidade: opts.entidade,
      entidade_id: opts.entidade_id ?? null,
      detalhes:
        opts.detalhes === undefined
          ? null
          : typeof opts.detalhes === "string"
            ? opts.detalhes
            : JSON.stringify(opts.detalhes),
    },
  });
}
