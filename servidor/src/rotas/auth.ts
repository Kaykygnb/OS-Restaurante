import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
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

  app.get("/auth/me", { onRequest: [(app as any).autenticar] }, async (req, reply) => {
    const id = Number((req.user as { id?: number }).id);
    const usuario = await prisma.usuario.findUnique({
      where: { id },
      select: { id: true, nome: true, tipo_usuario: true, pode_operar_caixa: true, ativo: true },
    });
    if (!usuario?.ativo) {
      return reply.code(401).send({ erro: "Usuário indisponível. Faça login novamente", codigo: "sessao_encerrada" });
    }
    return {
      id: usuario.id,
      nome: usuario.nome,
      tipo: usuario.tipo_usuario,
      pode_operar_caixa: usuario.pode_operar_caixa,
      ativo: true,
    };
  });
}
