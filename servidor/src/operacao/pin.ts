import bcrypt from "bcryptjs";
import { prisma } from "../db.js";
import type { TipoUsuario } from "../permissoes.js";

const APROVA = new Set<TipoUsuario>(["ROOT", "ADMIN", "GERENTE"]);

/** Valida PIN de um GERENTE+ ativo. Devolve o usuário aprovador ou null. */
export async function validarPinGerente(pin: string | undefined | null) {
  if (!pin || pin.length < 4) return null;
  const candidatos = await prisma.usuario.findMany({
    where: {
      ativo: true,
      pin_hash: { not: null },
      tipo_usuario: { in: ["ROOT", "ADMIN", "GERENTE"] },
    },
  });
  for (const u of candidatos) {
    if (u.pin_hash && (await bcrypt.compare(pin, u.pin_hash))) return u;
  }
  return null;
}

export function tipoPodeAprovarSemPin(tipo: TipoUsuario) {
  return APROVA.has(tipo);
}
