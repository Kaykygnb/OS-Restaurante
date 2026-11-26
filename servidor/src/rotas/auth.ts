import type { FastifyInstance } from "fastify";
import { entrar } from "../servicos/login.js";

async function login(app: FastifyInstance, req: any, reply: any) {
  const body = (req.body ?? {}) as { usuario?: unknown; login?: unknown; senha?: unknown };
  const usuario = typeof body.usuario === "string" ? body.usuario : typeof body.login === "string" ? body.login : "";
  const senha = typeof body.senha === "string" ? body.senha : "";
  if (!usuario.trim() || !senha) {
    return reply.code(400).send({
      erro: "Informe usuário e senha.",
      codigo: "dados_invalidos",
      campos: {
        ...(usuario.trim() ? {} : { usuario: "Informe o usuário" }),
        ...(senha ? {} : { senha: "Informe a senha" }),
      },
    });
  }
  const resultado = await entrar(app, usuario, senha);
  return reply.code(resultado.status).send(resultado.corpo);
}

export async function rotasAuth(app: FastifyInstance) {
  app.post("/auth/login", async (req, reply) => login(app, req, reply));
  app.post("/login", async (req, reply) => login(app, req, reply));
}
