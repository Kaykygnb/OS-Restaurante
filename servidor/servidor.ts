import Fastify from "fastify";
import { prisma } from "./db";

const app = Fastify({ logger: true });

app.register(jwt, { secret: process.env.JWT_SEGREDO! });
app.register(rotasAuth); // Registra as rotas de autenticação
app.get("/saude", async () => {
  const usuarios = await prisma.usuario.count();
  return { ok: true, usuarios };
});

app.listen({ port: 3333, host: "0.0.0.0" }); // faz o servidor aceitar conecções externas de outros computadores na rede