import bcrypt from "bcryptjs";
import { prisma } from "../src/db.js";

async function garantirBaseOperacao() {
  await prisma.sequencia.upsert({
    where: { nome: "ATENDIMENTO" },
    create: { nome: "ATENDIMENTO", ultimo: 0 },
    update: {},
  });
  await prisma.sequencia.upsert({
    where: { nome: "PEDIDO" },
    create: { nome: "PEDIDO", ultimo: 0 },
    update: {},
  });

  const formas = [
    { nome: "Dinheiro", abre_gaveta: true, eh_dinheiro: true, ordem: 1 },
    { nome: "Pix", abre_gaveta: false, eh_dinheiro: false, ordem: 2 },
    { nome: "Débito", abre_gaveta: false, eh_dinheiro: false, ordem: 3 },
    { nome: "Crédito", abre_gaveta: false, eh_dinheiro: false, ordem: 4 },
    { nome: "Vale-refeição", abre_gaveta: false, eh_dinheiro: false, ordem: 5 },
  ];
  for (const f of formas) {
    await prisma.forma_pagamento.upsert({
      where: { nome: f.nome },
      create: f,
      update: { abre_gaveta: f.abre_gaveta, eh_dinheiro: f.eh_dinheiro, ordem: f.ordem, ativo: true },
    });
  }
  console.log("Sequências e formas de pagamento OK");
}

async function main() {
  const senha = process.env.SENHA_ROOT_INICIAL;
  if (!senha || senha.length < 8) {
    throw new Error("SENHA_ROOT_INICIAL inválida: informe uma senha com pelo menos 8 caracteres no .env");
  }

  const existe = await prisma.usuario.findUnique({ where: { login: "root" } });
  if (existe) {
    console.log("ROOT já existe");
  } else {
    await prisma.usuario.create({
      data: {
        nome: "root",
        login: "root",
        tipo_usuario: "ROOT",
        senha_hash: await bcrypt.hash(senha, 10),
        pode_operar_caixa: true,
      },
    });
    console.log("ROOT criado (login: root)");
  }

  await garantirBaseOperacao();
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
