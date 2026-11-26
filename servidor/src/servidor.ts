import { criarApp } from "./app.js";
import { prisma } from "./db.js";
import { iniciarFilaImpressao, recuperarTrabalhosPresos } from "./impressao/fila.js";
import { listarEnderecosLocais, portaConfigurada, urlsDeConexao } from "./rede/enderecos.js";

const app = await criarApp({ logger: true });

const shutdown = async () => {
  try {
    await app.close();
    await prisma.$disconnect();
  } finally {
    process.exit(0);
  }
};
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

const porta = portaConfigurada();
app
  .listen({ port: porta, host: "0.0.0.0" })
  .then(async () => {
    await recuperarTrabalhosPresos();
    iniciarFilaImpressao(2000);
    app.log.info(`Servidor escutando em 0.0.0.0:${porta}`);
    const enderecos = listarEnderecosLocais();
    if (!enderecos.length) {
      app.log.info("Nenhum IPv4 de rede local para o celular");
    }
    for (const endereco of enderecos) {
      const urls = urlsDeConexao(endereco.ip, porta, "OS Restaurante");
      app.log.info(`Painel na rede (${endereco.interface}): ${urls.url_web}`);
    }
  })
  .catch((erro) => {
    app.log.error(erro);
    process.exit(1);
  });
