import Fastify from "fastify";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import { criarAutenticador } from "./autenticacao.js";
import { prisma } from "./db.js";
import { rotasAuth } from "./rotas/auth.js";
import { rotasCategorias } from "./rotas/categorias.js";
import { rotasProdutos } from "./rotas/produtos.js";
import { rotasCardapio } from "./rotas/cardapio.js";
import { rotasAdicionais } from "./rotas/adicionais.js";
import { rotasEscolhas } from "./rotas/escolhas.js";
import { rotasUsuarios } from "./rotas/usuarios.js";
import { rotasConfiguracoes } from "./rotas/configuracoes.js";
import { rotasImagens } from "./rotas/imagens.js";
import { rotasImpressoras } from "./rotas/impressoras.js";
import { rotasMesas } from "./rotas/mesas.js";
import { rotasAtendimentos } from "./rotas/atendimentos.js";
import { rotasPedidos } from "./rotas/pedidos.js";
import { rotasCaixa } from "./rotas/caixa.js";
import { rotasFechamento } from "./rotas/fechamento.js";
import { aplicarPragmasSqlite } from "./db.js";

export async function criarApp(opts?: { logger?: boolean }) {
  await aplicarPragmasSqlite();

  const app = Fastify({ logger: opts?.logger ?? false });

  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET não definido");

  await app.register(jwt, { secret });
  await app.register(rateLimit, {
    global: false,
    max: 1000,
    timeWindow: "1 minute",
  });

  app.decorate("autenticar", criarAutenticador(prisma));
  await app.register(rotasAuth);
  await app.register(rotasCategorias);
  await app.register(rotasProdutos);
  await app.register(rotasCardapio);
  await app.register(rotasAdicionais);
  await app.register(rotasEscolhas);
  await app.register(rotasUsuarios);
  await app.register(rotasConfiguracoes);
  await app.register(rotasImpressoras);
  await app.register(rotasMesas);
  await app.register(rotasAtendimentos);
  await app.register(rotasPedidos);
  await app.register(rotasCaixa);
  await app.register(rotasFechamento);
  await app.register(rotasImagens);

  app.get("/eu", { onRequest: [(app as any).autenticar] }, async (req: any) => {
    return { usuario: req.user };
  });

  app.get("/saude", async () => {
    const usuarios = await prisma.usuario.count();
    return { ok: true, usuarios };
  });

  return app;
}
