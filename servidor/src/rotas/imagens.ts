import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const diretorioImagens = join(dirname(fileURLToPath(import.meta.url)), "../../uploads");
const nomeSeguro = /^[0-9a-f-]{36}\.webp$/i;

export async function rotasImagens(app: FastifyInstance) {
  app.post("/uploads", { onRequest: [(app as any).autenticar] }, async (req, reply) => {
    const body = req.body as { imagem?: string };
    const dataUrl = body?.imagem;
    const match = typeof dataUrl === "string"
      ? /^data:image\/webp;base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl)
      : null;
    if (!match) return reply.code(400).send({ erro: "Envie uma imagem WebP válida" });

    const buffer = Buffer.from(match[1]!, "base64");
    if (buffer.length < 16 || buffer.length > 500_000 || buffer.toString("ascii", 8, 12) !== "WEBP") {
      return reply.code(400).send({ erro: "A imagem precisa ser WebP e ter até 500 KB" });
    }

    await mkdir(diretorioImagens, { recursive: true });
    const nome = `${randomUUID()}.webp`;
    await writeFile(join(diretorioImagens, nome), buffer, { flag: "wx" });
    return reply.code(201).send({ caminho_imagem: `/uploads/${nome}` });
  });

  // Arquivos com nome aleatório podem ser exibidos nos cardápios sem expor caminho local.
  app.get("/uploads/:nome", async (req, reply) => {
    const { nome } = req.params as { nome: string };
    if (!nomeSeguro.test(nome)) return reply.code(404).send({ erro: "Imagem não encontrada" });
    try {
      const imagem = await readFile(join(diretorioImagens, nome));
      return reply.type("image/webp").header("Cache-Control", "public, max-age=31536000, immutable").send(imagem);
    } catch {
      return reply.code(404).send({ erro: "Imagem não encontrada" });
    }
  });
}
