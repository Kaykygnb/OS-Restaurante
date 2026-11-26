import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { prisma } from "../db.js";

export async function rotasAuth(app: FastifyInstance) {
  app.post(
    "/login",
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "1 minute",
          errorResponseBuilder: () => ({
            statusCode: 429,
            error: "Too Many Requests",
            message: "Muitas tentativas de login. Aguarde um minuto.",
            erro: "Muitas tentativas de login. Aguarde um minuto.",
          }),
        },
      },
    },
    async (req, reply) => {
      const { login, senha } = (req.body ?? {}) as { login?: unknown; senha?: unknown };
      if (
        typeof login !== "string" ||
        typeof senha !== "string" ||
        !login.trim() ||
        !senha
      ) {
        return reply.code(400).send({ erro: "Informe login e senha" });
      }

      const usuario = await prisma.usuario.findUnique({ where: { login } });
      const senhaOk = usuario && usuario.ativo && (await bcrypt.compare(senha, usuario.senha_hash));
      if (!senhaOk) return reply.code(401).send({ erro: "Login ou senha inválidos" });

      const token = app.jwt.sign(
        { id: usuario.id, tipo: usuario.tipo_usuario },
        { expiresIn: "12h" }
      );
      return {
        token,
        usuario: { id: usuario.id, nome: usuario.nome, tipo: usuario.tipo_usuario },
      };
    }
  );
}
