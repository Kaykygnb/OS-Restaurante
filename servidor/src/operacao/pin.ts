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

export async function exigirAprovacao(opts: {
  tipo: TipoUsuario;
  usuarioId: number;
  pin?: string | null | undefined;
  aprovadorId?: number | null | undefined;
  acimaDoLimite: boolean;
  acao: string;
}) {
  if (!opts.acimaDoLimite || tipoPodeAprovarSemPin(opts.tipo)) {
    return { aprovadorId: opts.usuarioId, comPin: false };
  }
  const aprov = await validarPinGerente(opts.pin, opts.aprovadorId);
  if (!aprov) {
    const { registrarNegado } = await import("./auditoria.js");
    await registrarNegado({
      tipo: "pin.falhou",
      sensivel: true,
      usuario_id: opts.usuarioId,
      aprovador_id: opts.aprovadorId ?? null,
      codigo_erro: "pin_invalido",
      motivo: opts.acao,
    });
    return null;
  }
  return { aprovadorId: aprov.id, comPin: true };
}
