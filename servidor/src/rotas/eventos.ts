import type { FastifyInstance } from "fastify";
import { assinar } from "../eventos/barramento.js";
import type { TipoUsuario } from "../permissoes.js";

export async function rotasEventos(app: FastifyInstance) {
  app.get("/eventos", async (req, reply) => {
    const q = (req.query as { token?: string }).token;
    if (q && !req.headers.authorization) req.headers.authorization = `Bearer ${q}`;
    try {
      await req.jwtVerify();
    } catch {
      return reply.code(401).send({ erro: "Faça login", codigo: "sem_sessao" });
    }
    const tipo = (req.user as { tipo?: TipoUsuario }).tipo ?? "ATENDENTE";
    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    const enviar = (evento: { tipo: string; id: number; versao: number; server_time: string }) => {
      raw.write(`id: ${evento.versao}\ndata: ${JSON.stringify(evento)}\n\n`);
    };
    enviar({ tipo: "conectado", id: 0, versao: 0, server_time: new Date().toISOString() });
    const cancelar = assinar(enviar, [tipo]);
    const batida = setInterval(() => {
      raw.write(`: ping ${new Date().toISOString()}\n\n`);
    }, 15_000);
    req.raw.on("close", () => {
      clearInterval(batida);
      cancelar();
    });
  });
}
