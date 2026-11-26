import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { soTipos } from "../permissoes.js";
import { listarEnderecosLocais, portaConfigurada, urlsDeConexao } from "../rede/enderecos.js";

export async function rotasRede(app: FastifyInstance) {
  const authGestao = {
    onRequest: [(app as any).autenticar, soTipos("ROOT", "ADMIN", "GERENTE")],
  };

  app.get("/rede/conexao", authGestao, async () => {
    const cfg = await prisma.configuracao.findFirst({ orderBy: { id: "asc" } });
    const nome = cfg?.nome_fantasia || cfg?.nome_restaurante || "OS Restaurante";
    const porta = portaConfigurada();
    const enderecos = listarEnderecosLocais();
    const principal = enderecos[0];
    const urls = principal ? urlsDeConexao(principal.ip, porta, nome) : { url_web: null, url_app: null };
    return { porta, enderecos, ...urls };
  });
}
