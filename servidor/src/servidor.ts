import { criarApp } from "./app.js";
import { prisma } from "./db.js";
import { iniciarFilaImpressao, recuperarTrabalhosPresos } from "./impressao/fila.js";

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

app
  .listen({ port: 3333, host: "0.0.0.0" })
  .then(async () => {
    await recuperarTrabalhosPresos();
    iniciarFilaImpressao(2000);
    app.log.info("Fila de impressão iniciada");
  })
  .catch((erro) => {
    app.log.error(erro);
    process.exit(1);
  });
