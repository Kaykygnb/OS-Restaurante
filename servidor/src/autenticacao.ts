import type { FastifyReply, FastifyRequest } from "fastify";

type ConsultaUsuarios = {
  usuario: {
    findUnique(args: {
      where: { id: number };
      select: { id: true; ativo: true; tipo_usuario: true; pode_operar_caixa: true };
    }): PromiseLike<{ id: number; ativo: boolean; tipo_usuario: string; pode_operar_caixa: boolean } | null>;
  };
};

/** Desativação e mudança de perfil valem também para tokens já emitidos. */
export function criarAutenticador(db: ConsultaUsuarios) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.code(401).send({ erro: "Faça login" });
    }
    const claims = req.user as { id?: number; tipo?: string };
    const id = claims.id;
    if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) {
      return reply.code(401).send({ erro: "Faça login" });
    }
    const usuario = await db.usuario.findUnique({
      where: { id },
      select: { id: true, ativo: true, tipo_usuario: true, pode_operar_caixa: true },
    });
    if (!usuario?.ativo) {
      return reply.code(401).send({ erro: "Usuário indisponível. Faça login novamente" });
    }
    req.user = {
      ...claims,
      id: usuario.id,
      tipo: usuario.tipo_usuario,
      pode_operar_caixa: usuario.pode_operar_caixa,
    };
  };
}
