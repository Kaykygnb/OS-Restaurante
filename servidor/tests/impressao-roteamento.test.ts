import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { montarHarness, type Harness } from "./helpers/harness.js";

let h: Harness;
let enfileirarProducaoPedido: typeof import("../src/operacao/producao.js").enfileirarProducaoPedido;
let enfileirarDocumentoNegocio: typeof import("../src/impressao/enfileirar-doc.js").enfileirarDocumentoNegocio;

before(async () => {
  h = await montarHarness();
  ({ enfileirarProducaoPedido } = await import("../src/operacao/producao.js"));
  ({ enfileirarDocumentoNegocio } = await import("../src/impressao/enfileirar-doc.js"));
});

after(async () => {
  if (h) await h.limpar();
});

test("nao_imprime não gera trabalho; NUNCA em PRODUCAO também não", async () => {
  const cat = await h.prisma.categoria.create({
    data: { nome: `Agua_${Date.now()}`, nao_imprime: true },
  });
  const prod = await h.prisma.produto.create({
    data: { nome: `AguaProd_${Date.now()}`, categoria_id: cat.id, exige_preparo: true },
  });
  const var_ = await h.prisma.produto_variante.create({
    data: { nome: "Padrão", preco_centavos: 500, produto_id: prod.id },
  });

  const at = await h.prisma.atendimento.create({
    data: {
      codigo_atendimento: `AT_IMP_${Date.now()}`,
      tipo_atendimento: "BALCAO",
      usuario_id: h.usuarioId,
    },
  });
  const ped = await h.prisma.pedido.create({
    data: {
      codigo_pedido: `PD_IMP_${Date.now()}`,
      atendimento_id: at.id,
      itens: {
        create: {
          nome_produto: "Água",
          preco_centavos: 500,
          quantidade: 1,
          produto_variante_id: var_.id,
        },
      },
    },
    include: {
      itens: {
        include: {
          escolhas: true,
          adicionais: true,
          produto_variante: { include: { produto: true } },
        },
      },
    },
  });

  const r1 = await enfileirarProducaoPedido({
    pedido_id: ped.id,
    codigo_pedido: ped.codigo_pedido,
    atendimento_id: at.id,
    codigo_atendimento: at.codigo_atendimento,
    tipo_atendimento: "BALCAO",
    itens: ped.itens as any,
  });
  assert.equal(r1.trabalhos.length, 0);

  await h.prisma.config_documento.update({
    where: { tipo: "PRODUCAO" },
    data: { modo: "NUNCA" },
  });
  await h.prisma.categoria.update({ where: { id: cat.id }, data: { nao_imprime: false } });

  const r2 = await enfileirarProducaoPedido({
    pedido_id: ped.id,
    codigo_pedido: ped.codigo_pedido,
    atendimento_id: at.id,
    codigo_atendimento: at.codigo_atendimento,
    tipo_atendimento: "BALCAO",
    itens: ped.itens as any,
  });
  assert.equal(r2.status, "NUNCA");
  assert.equal(r2.trabalhos.length, 0);

  await h.prisma.config_documento.update({
    where: { tipo: "PRODUCAO" },
    data: { modo: "AUTOMATICO" },
  });
});

test("reimpressao e cancelamento usam tipos corretos quando há impressora", async () => {
  const imp = await h.prisma.impressora.create({
    data: {
      nome: `Coz_${Date.now()}`,
      tipo_conexao: "REDE",
      ip: "127.0.0.1",
      porta: 9100,
      ativo: true,
    },
  });
  await h.prisma.configuracao.updateMany({
    data: { impressora_padrao_id: imp.id, impressora_producao_id: imp.id },
  });

  const cat = await h.prisma.categoria.create({ data: { nome: `Pastel_${Date.now()}` } });
  await h.prisma.impressora_categoria.create({
    data: { impressora_id: imp.id, categoria_id: cat.id },
  });
  const prod = await h.prisma.produto.create({
    data: { nome: `PastelP_${Date.now()}`, categoria_id: cat.id, exige_preparo: true },
  });
  const var_ = await h.prisma.produto_variante.create({
    data: { nome: "P", preco_centavos: 1000, produto_id: prod.id },
  });
  const at = await h.prisma.atendimento.create({
    data: {
      codigo_atendimento: `AT_R_${Date.now()}`,
      tipo_atendimento: "MESA",
      usuario_id: h.usuarioId,
    },
  });
  const ped = await h.prisma.pedido.create({
    data: {
      codigo_pedido: `PD_R_${Date.now()}`,
      atendimento_id: at.id,
      itens: {
        create: {
          nome_produto: "Pastel",
          preco_centavos: 1000,
          quantidade: 1,
          produto_variante_id: var_.id,
        },
      },
    },
    include: {
      itens: {
        include: {
          escolhas: true,
          adicionais: true,
          produto_variante: { include: { produto: true } },
        },
      },
    },
  });

  const prodJobs = await enfileirarProducaoPedido({
    pedido_id: ped.id,
    codigo_pedido: ped.codigo_pedido,
    atendimento_id: at.id,
    codigo_atendimento: at.codigo_atendimento,
    tipo_atendimento: "MESA",
    itens: ped.itens as any,
  });
  assert.ok(prodJobs.trabalhos.length >= 1);
  const tProd = await h.prisma.trabalho_impressao.findUniqueOrThrow({
    where: { id: prodJobs.trabalhos[0]! },
  });
  assert.equal(tProd.tipo_documento, "PRODUCAO");

  const reimp = await enfileirarProducaoPedido({
    pedido_id: ped.id,
    codigo_pedido: ped.codigo_pedido,
    atendimento_id: at.id,
    codigo_atendimento: at.codigo_atendimento,
    tipo_atendimento: "MESA",
    itens: ped.itens as any,
    reimpressao: true,
    disparo: "manual",
  });
  assert.ok(reimp.trabalhos.length >= 1);
  const tRe = await h.prisma.trabalho_impressao.findUniqueOrThrow({
    where: { id: reimp.trabalhos[0]! },
  });
  assert.equal(tRe.tipo_documento, "REIMPRESSAO");

  await h.prisma.pedido_item.updateMany({
    where: { pedido_id: ped.id },
    data: { cancelado: true },
  });
  const itensCancel = await h.prisma.pedido_item.findMany({
    where: { pedido_id: ped.id },
    include: {
      escolhas: true,
      adicionais: true,
      produto_variante: { include: { produto: true } },
    },
  });
  const cancel = await enfileirarProducaoPedido({
    pedido_id: ped.id,
    codigo_pedido: ped.codigo_pedido,
    atendimento_id: at.id,
    codigo_atendimento: at.codigo_atendimento,
    tipo_atendimento: "MESA",
    itens: itensCancel as any,
    cancelamento: true,
    motivo_cancelamento: "teste",
  });
  assert.ok(cancel.trabalhos.length >= 1);
  const tCa = await h.prisma.trabalho_impressao.findUniqueOrThrow({
    where: { id: cancel.trabalhos[0]! },
  });
  assert.equal(tCa.tipo_documento, "CANCELAMENTO");
});

test("fallback: sem categoria usa produção padrão depois padrão loja", async () => {
  const impProd = await h.prisma.impressora.create({
    data: {
      nome: `ProdPad_${Date.now()}`,
      tipo_conexao: "REDE",
      ip: "127.0.0.1",
      porta: 9100,
      ativo: true,
    },
  });
  const impPadrao = await h.prisma.impressora.create({
    data: {
      nome: `Padrao_${Date.now()}`,
      tipo_conexao: "REDE",
      ip: "127.0.0.1",
      porta: 9100,
      ativo: true,
    },
  });
  await h.prisma.configuracao.updateMany({
    data: {
      impressora_padrao_id: impPadrao.id,
      impressora_producao_id: null,
    },
  });

  const cat = await h.prisma.categoria.create({ data: { nome: `SemLig_${Date.now()}` } });
  const prod = await h.prisma.produto.create({
    data: { nome: `ItemF_${Date.now()}`, categoria_id: cat.id, exige_preparo: true },
  });
  const var_ = await h.prisma.produto_variante.create({
    data: { nome: "P", preco_centavos: 800, produto_id: prod.id },
  });
  const at = await h.prisma.atendimento.create({
    data: {
      codigo_atendimento: `AT_F_${Date.now()}`,
      tipo_atendimento: "BALCAO",
      usuario_id: h.usuarioId,
    },
  });
  const ped = await h.prisma.pedido.create({
    data: {
      codigo_pedido: `PD_F_${Date.now()}`,
      atendimento_id: at.id,
      itens: {
        create: {
          nome_produto: "ItemF",
          preco_centavos: 800,
          quantidade: 1,
          produto_variante_id: var_.id,
        },
      },
    },
    include: {
      itens: {
        include: {
          escolhas: true,
          adicionais: true,
          produto_variante: { include: { produto: true } },
        },
      },
    },
  });

  const rPadrao = await enfileirarProducaoPedido({
    pedido_id: ped.id,
    codigo_pedido: ped.codigo_pedido,
    atendimento_id: at.id,
    codigo_atendimento: at.codigo_atendimento,
    tipo_atendimento: "BALCAO",
    itens: ped.itens as any,
  });
  assert.ok(rPadrao.trabalhos.length >= 1);
  const t1 = await h.prisma.trabalho_impressao.findUniqueOrThrow({
    where: { id: rPadrao.trabalhos[0]! },
  });
  assert.equal(t1.impressora_id, impPadrao.id);

  await h.prisma.configuracao.updateMany({
    data: { impressora_producao_id: impProd.id },
  });
  const rProd = await enfileirarProducaoPedido({
    pedido_id: ped.id,
    codigo_pedido: ped.codigo_pedido,
    atendimento_id: at.id,
    codigo_atendimento: at.codigo_atendimento,
    tipo_atendimento: "BALCAO",
    itens: ped.itens as any,
  });
  assert.ok(rProd.trabalhos.length >= 1);
  const t2 = await h.prisma.trabalho_impressao.findUniqueOrThrow({
    where: { id: rProd.trabalhos[0]! },
  });
  assert.equal(t2.impressora_id, impProd.id);
});

test("comprovante: gaveta só se dinheiro + config + tem_gaveta", async () => {
  const { Buffer } = await import("node:buffer");

  const imp = await h.prisma.impressora.create({
    data: {
      nome: `CaixaG_${Date.now()}`,
      tipo_conexao: "REDE",
      ip: "127.0.0.1",
      porta: 9100,
      ativo: true,
      tem_gaveta: false,
    },
  });
  await h.prisma.configuracao.updateMany({
    data: { impressora_caixa_id: imp.id, impressora_padrao_id: imp.id },
  });
  await h.prisma.config_documento.update({
    where: { tipo: "COMPROVANTE" },
    data: { abre_gaveta: true, modo: "AUTOMATICO" },
  });

  const payload = Buffer.from("COMPROVANTE_TESTE");
  const antes = await h.prisma.trabalho_impressao.count({
    where: { impressora_id: imp.id },
  });
  await enfileirarDocumentoNegocio({
    tipo: "COMPROVANTE",
    disparo: "automatico",
    payload,
    abrir_gaveta: true,
  });
  const depoisSem = await h.prisma.trabalho_impressao.count({
    where: { impressora_id: imp.id },
  });
  assert.equal(depoisSem - antes, 1);

  await h.prisma.impressora.update({
    where: { id: imp.id },
    data: { tem_gaveta: true },
  });
  await enfileirarDocumentoNegocio({
    tipo: "COMPROVANTE",
    disparo: "automatico",
    payload,
    abrir_gaveta: true,
  });
  const depoisCom = await h.prisma.trabalho_impressao.count({
    where: { impressora_id: imp.id },
  });
  assert.equal(depoisCom - depoisSem, 2);
});
