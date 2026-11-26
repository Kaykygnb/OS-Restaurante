import bcrypt from "bcryptjs";
import { prisma } from "../db.js";
import type { TipoUsuario } from "../permissoes.js";

const APROVA = new Set<TipoUsuario>(["ROOT", "ADMIN", "GERENTE"]);

/** Valida PIN de um aprovador específico (GERENTE+ ativo). */
export async function validarPinGerente(
  pin: string | undefined | null,
  aprovadorId?: number | null
) {
  if (!pin || pin.length < 4) return null;
  if (aprovadorId == null || !Number.isFinite(Number(aprovadorId))) return null;

  const u = await prisma.usuario.findUnique({ where: { id: Number(aprovadorId) } });
  if (!u?.ativo || !u.pin_hash) return null;
  if (!APROVA.has(u.tipo_usuario as TipoUsuario)) return null;
  if (!(await bcrypt.compare(pin, u.pin_hash))) return null;
  return u;
}

export function tipoPodeAprovarSemPin(tipo: TipoUsuario) {
  return APROVA.has(tipo);
}
