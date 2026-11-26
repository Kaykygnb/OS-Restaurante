import Fastify from "fastify";
import jwt from "@fastify/jwt";
import { prisma } from "./db";
import { rotasAuth } from "./rotas/auth";
import { rotasCategorias } from "./rotas/categorias";
import { rotasProdutos } from "./rotas/produtos";
import { rotasCardapio } from "./rotas/cardapio";
import { rotasAdicionais } from "./rotas/adicionais";
import { rotasEscolhas } from "./rotas/escolhas";
import { rotasUsuarios } from "./rotas/usuarios";
import { rotasConfiguracoes } from "./rotas/configuracoes";
import { rotasImagens } from "./rotas/imagens";
import { rotasImpressoras } from "./rotas/impressoras";
import { rotasMesas } from "./rotas/mesas";
import { rotasAtendimentos } from "./rotas/atendimentos";
import { rotasPedidos } from "./rotas/pedidos";
import { rotasCaixa } from "./rotas/caixa";
import { rotasFechamento } from "./rotas/fechamento";
import { iniciarFilaImpressao } from "./impressao/fila";

const app = Fastify({ logger: true });

app.register(jwt, { secret: process.env.JWT_SECRET! });

// * Proteção de rotas para so quem tem token valido pode acessar
app.decorate("autenticar", async (req: any, reply: any) => {
  try {
    await req.jwtVerify();
  } catch {
    return reply.code(401).send({ erro: "Faça login"});
  }
})
app.register(rotasAuth);
app.register(rotasCategorias);
app.register(rotasProdutos);
app.register(rotasCardapio);
app.register(rotasAdicionais);
app.register(rotasEscolhas);
app.register(rotasUsuarios);
app.register(rotasConfiguracoes);
app.register(rotasImpressoras);
app.register(rotasMesas);
app.register(rotasAtendimentos);
app.register(rotasPedidos);
app.register(rotasCaixa);
app.register(rotasFechamento);
app.register(rotasImagens);

// * Rotas de teste 

// rota /eu retorna o usuario logado
app.get("/eu", { onRequest: [(app as any).autenticar] }, async (req: any) => {
  return { usuario: req.user };
});

app.get("/saude", async () => {
  const usuarios = await prisma.usuario.count();
  return { ok: true, usuarios };
});

app.listen({ port: 3333, host: "0.0.0.0" }).then(() => {
  iniciarFilaImpressao(2000);
  app.log.info("Fila de impressão iniciada");
}).catch((erro) => {
  app.log.error(erro);
  process.exit(1);
});
