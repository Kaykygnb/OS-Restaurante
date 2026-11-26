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
import { rotasClientes } from "./rotas/clientes.js";
import { rotasEnderecos } from "./rotas/enderecos.js";
import { rotasEntrega } from "./rotas/entrega.js";
import { rotasVendas } from "./rotas/vendas.js";
import { rotasEstoque } from "./rotas/estoque.js";
import { rotasPromocoes } from "./rotas/promocoes.js";
import { rotasAuditoria } from "./rotas/auditoria.js";
import { rotasImpressaoFila } from "./rotas/impressao-fila.js";
import { rotasEventos } from "./rotas/eventos.js";
import { rotasRede } from "./rotas/rede.js";
import { rotasRelatorios } from "./rotas/relatorios.js";
import { aplicarPragmasSqlite } from "./db.js";
import { contextoPedido } from "./util/contexto.js";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";

const versao = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version as string;
const distPadrao = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web/dist");

const TIPOS_ARQUIVO: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

async function saude() {
  const cfg = await prisma.configuracao.findFirst({ orderBy: { id: "asc" } });
  return {
    app: "os-restaurante",
    versao,
    nome_restaurante: cfg?.nome_fantasia || cfg?.nome_restaurante || "",
  };
}

async function registrarApi(app: FastifyInstance) {
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
  await app.register(rotasClientes);
  await app.register(rotasEnderecos);
  await app.register(rotasEntrega);
  await app.register(rotasVendas);
  await app.register(rotasEstoque);
  await app.register(rotasPromocoes);
  await app.register(rotasAuditoria);
  await app.register(rotasImpressaoFila);
  await app.register(rotasEventos);
  await app.register(rotasRede);
  await app.register(rotasRelatorios);
  app.get("/eu", { onRequest: [(app as any).autenticar] }, async (req: any) => ({ usuario: req.user }));
  app.get("/saude", saude);
}

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
  app.addHook("onRequest", async (req) => {
    const bruto = req.headers["x-terminal"];
    const texto = Array.isArray(bruto) ? bruto[0] : bruto;
    const agente = req.headers["user-agent"];
    contextoPedido.enterWith({
      terminal: texto?.trim().slice(0, 80) || null,
      ip: req.ip ?? null,
      userAgent: typeof agente === "string" ? agente.slice(0, 200) : null,
    });
  });

  await registrarApi(app);
  await app.register(
    async (escopo) => {
      await registrarApi(escopo);
      escopo.setNotFoundHandler((_req, reply) => {
        reply.code(404).send({ erro: "Não encontrado", codigo: "nao_encontrado" });
      });
    },
    { prefix: "/api" }
  );

  app.setNotFoundHandler((req, reply) => {
    if (req.method !== "GET" || req.url.split("?")[0]?.startsWith("/api")) {
      return reply.code(404).send({ erro: "Não encontrado", codigo: "nao_encontrado" });
    }
    const pasta = path.resolve(process.env.WEB_DIST || distPadrao);
    const urlPath = decodeURIComponent(req.url.split("?")[0] || "/");
    const relativo = urlPath.replace(/^\/+/, "");
    const arquivo = path.resolve(pasta, relativo);
    const dentro = arquivo === pasta || arquivo.startsWith(pasta + path.sep);
    if (dentro && existsSync(arquivo) && statSync(arquivo).isFile()) {
      const tipo = TIPOS_ARQUIVO[path.extname(arquivo)] || "application/octet-stream";
      return reply.type(tipo).send(createReadStream(arquivo));
    }
    const index = path.join(pasta, "index.html");
    if (!path.extname(urlPath) && existsSync(index)) {
      return reply.type("text/html; charset=utf-8").send(createReadStream(index));
    }
    return reply.code(404).send({ erro: "Não encontrado", codigo: "nao_encontrado" });
  });

  return app;
}
