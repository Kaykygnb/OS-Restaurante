import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const prismaCli = path.join(raiz, "node_modules/prisma/build/index.js");

export type Harness = {
  app: Awaited<ReturnType<typeof import("../../src/app.js").criarApp>>;
  prisma: typeof import("../../src/db.js").prisma;
  token: string;
  usuarioId: number;
  mesaId: number;
  formaPixId: number;
  formaDinheiroId: number;
  varianteId: number;
  limpar: () => Promise<void>;
};

/** Sobe API + SQLite temporário com seed mínimo pra testes de concorrência/dinheiro. */
export async function montarHarness(): Promise<Harness> {
  const dir = await mkdtemp(path.join(tmpdir(), "os-rest-test-"));
  const dbPath = path.join(dir, "test.db").replace(/\\/g, "/");
  process.env.DATABASE_URL = `file:${dbPath}`;
  process.env.JWT_SECRET = process.env.JWT_SECRET || "segredo-teste-passo1";

  execFileSync(process.execPath, [prismaCli, "migrate", "deploy"], {
    cwd: raiz,
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
    stdio: "pipe",
  });

  const { prisma } = await import("../../src/db.js");
  await prisma.$connect();
  const { aplicarPragmasSqlite } = await import("../../src/db.js");
  await aplicarPragmasSqlite();

  const senha_hash = await bcrypt.hash("SenhaTeste1!", 4);
  const usuario = await prisma.usuario.create({
    data: {
      nome: "Admin Teste",
      login: `admin_${Date.now()}`,
      tipo_usuario: "ADMIN",
      senha_hash,
      pin_hash: await bcrypt.hash("1234", 4),
      pode_operar_caixa: true,
    },
  });

  await prisma.configuracao.create({
    data: {
      nome_restaurante: "Teste",
      taxa_servico_percentual: 10,
      limite_desconto_sem_pin_centavos: 500,
    },
  });

  await prisma.sequencia.createMany({
    data: [
      { nome: "ATENDIMENTO", ultimo: 0 },
      { nome: "PEDIDO", ultimo: 0 },
    ],
  });

  const mesa = await prisma.mesa.create({ data: { numero: 99 } });
  const pix = await prisma.forma_pagamento.create({
    data: { nome: `Pix_${Date.now()}`, abre_gaveta: false, eh_dinheiro: false, ordem: 1 },
  });
  const din = await prisma.forma_pagamento.create({
    data: { nome: `Din_${Date.now()}`, abre_gaveta: true, eh_dinheiro: true, ordem: 2 },
  });

  await prisma.caixa_sessao.create({
    data: { usuario_abertura_id: usuario.id, fundo_troco_centavos: 0, aberta: true },
  });

  const cat = await prisma.categoria.create({ data: { nome: `Cat_${Date.now()}` } });
  const prod = await prisma.produto.create({
    data: { nome: `Prod_${Date.now()}`, categoria_id: cat.id },
  });
  const variante = await prisma.produto_variante.create({
    data: { nome: "Padrão", preco_centavos: 6650, produto_id: prod.id },
  });

  const { criarApp } = await import("../../src/app.js");
  const app = await criarApp({ logger: false });
  await app.ready();

  const token = app.jwt.sign({ id: usuario.id, tipo: "ADMIN" }, { expiresIn: "1h" });

  return {
    app,
    prisma,
    token,
    usuarioId: usuario.id,
    mesaId: mesa.id,
    formaPixId: pix.id,
    formaDinheiroId: din.id,
    varianteId: variante.id,
    limpar: async () => {
      await app.close();
      await prisma.$disconnect();
      await rm(dir, { recursive: true, force: true });
    },
  };
}

export async function abrirContaComItem(h: Harness, totalCentavos = 6650) {
  const at = await h.prisma.atendimento.create({
    data: {
      codigo_atendimento: `AT_T_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      tipo_atendimento: "MESA",
      mesa_id: null,
      usuario_id: h.usuarioId,
    },
  });

  let varianteId = h.varianteId;
  if (totalCentavos !== 6650) {
    const v = await h.prisma.produto_variante.create({
      data: {
        nome: `V_${totalCentavos}`,
        preco_centavos: totalCentavos,
        produto_id: (await h.prisma.produto.findFirstOrThrow()).id,
      },
    });
    varianteId = v.id;
  }

  const ped = await h.prisma.pedido.create({
    data: {
      codigo_pedido: `PD_T_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      atendimento_id: at.id,
      itens: {
        create: {
          nome_produto: "Item teste",
          preco_centavos: totalCentavos,
          quantidade: 1,
          produto_variante_id: varianteId,
        },
      },
    },
  });
  return { atendimentoId: at.id, pedidoId: ped.id };
}
