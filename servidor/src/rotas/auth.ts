import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { prisma } from "../db";

export async function rotasAuth(app: FastifyInstance) {
  app.post("/login", async (req, reply) => {
    const { login, senha } = req.body as { login?: string; senha?: string };
    if (!login || !senha) return reply.code(400).send({ erro: "Informe login e senha" });

    const usuario = await prisma.usuario.findUnique({ where: { login } });
    const senhaOk = usuario && usuario.ativo && (await bcrypt.compare(senha, usuario.senha_hash));
    if (!senhaOk) return reply.code(401).send({ erro: "Login ou senha inválidos" });

    const token = app.jwt.sign(
      { id: usuario.id, tipo: usuario.tipo_usuario },
      { expiresIn: "12h" }
    );
    return { token, usuario: { id: usuario.id, nome: usuario.nome, tipo: usuario.tipo_usuario } };
  });
}

// ! A mensagem de erro e igual para login ou senha inválidos para não dar dicas de qual campo esta errado

