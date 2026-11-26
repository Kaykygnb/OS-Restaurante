import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import bcrypt from "bcryptjs";
import { montarHarness, abrirContaComItem, type Harness } from "./helpers/harness.js";
import { totalAtendimentoAberto } from "../src/operacao/totais.js";
import { montarCupomProducao, encoderTexto } from "../src/impressao/escpos.js";
import { quebrarColunas } from "../src/util/texto.js";
import { assinar, publicar } from "../src/eventos/barramento.js";
import { portaConfigurada } from "../src/rede/enderecos.js";
import { nomeAdicionalCupom } from "../src/util/texto.js";
import { enfileirarTrabalho, processarFilaImpressao } from "../src/impressao/fila.js";

let h: Harness;

before(async () => {
  h = await montarHarness();
});

after(async () => {
  if (h) await h.limpar();
});

function auth(token = h.token) {
  return { authorization: `Bearer ${token}`, "content-type": "application/json" };
}

test("S5 adicional Padrão vira o nome do adicional", () => {
  assert.equal(nomeAdicionalCupom("Bacon", "Padrão"), "Bacon");
  assert.equal(nomeAdicionalCupom("Bacon", "50g"), "Bacon 50g");
});

test("S8 impressora que aceita e não lê volta o trabalho para a fila", async () => {
  const sockets = new Set<net.Socket>();
  const server = net.createServer((sock) => {
    sockets.add(sock);
    sock.pause();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const porta = (server.address() as net.AddressInfo).port;
  const anterior = process.env.IMPRESSAO_TIMEOUT_MS;
  process.env.IMPRESSAO_TIMEOUT_MS = "500";
  try {
    const imp = await h.prisma.impressora.create({
      data: { nome: `Trava_${Date.now()}`, tipo_conexao: "REDE", ip: "127.0.0.1", porta, ativo: true },
    });
    const job = await enfileirarTrabalho({
      impressora_id: imp.id,
      tipo_documento: "PRODUCAO",
      conteudo: Buffer.alloc(4 * 1024 * 1024, 0x1b),
    });
    await processarFilaImpressao();
    const atual = await h.prisma.trabalho_impressao.findUniqueOrThrow({ where: { id: job.id } });
    assert.equal(atual.status, "ERRO");
    assert.match(atual.ultimo_erro ?? "", /Tempo esgotado ao escrever na impressora/);
    assert.ok(atual.proxima_tentativa_em);
    assert.equal(atual.impresso_em, null);
    const impressora = await h.prisma.impressora.findUniqueOrThrow({ where: { id: imp.id } });
    assert.equal(impressora.ultimo_status, "ERRO");
  } finally {
    if (anterior === undefined) delete process.env.IMPRESSAO_TIMEOUT_MS;
    else process.env.IMPRESSAO_TIMEOUT_MS = anterior;
    for (const sock of sockets) sock.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("S2 taxa de serviço incide sobre o subtotal depois do desconto", () => {
  const totais = totalAtendimentoAberto({
    itens: [{ cancelado: false, quantidade: 1, preco_centavos: 10530 }],
    desconto_centavos: 800,
    acrescimo_centavos: 0,
    taxa_servico_aplicada: true,
    taxa_servico_percentual: 10,
    taxa_entrega_centavos: 0,
    tipo_atendimento: "MESA",
  });
  assert.equal(totais.taxa_servico_centavos, 973);
});

test("S11 cupom translitera travessão, quebra por palavra e mostra a senha", () => {
  const bytes = encoderTexto("–—…", "CP860");
  assert.equal(bytes.includes(0x3f), false);
  const linhas = quebrarColunas("impressao termica do balcao", 16);
  assert.ok(linhas.every((l) => l.length <= 16));
  assert.equal(linhas.some((l) => l.endsWith("impres") && l.length < 16), false);
  const cupom = montarCupomProducao({
    colunas: 32,
    codigo_pedido: "PD1",
    codigo_atendimento: "AT1",
    numero_dia: 7,
    garcom_nome: "Zé",
    tipo_atendimento: "BALCAO",
    itens: [{ nome: "Pastel", quantidade: 1 }],
  });
  assert.ok(cupom.includes(Buffer.from("SENHA 7")));
  assert.ok(cupom.includes(Buffer.from("NÃO É DOCUMENTO FISCAL")) || cupom.includes(encoderTexto("NÃO É DOCUMENTO FISCAL", "CP860")));
});

test("S13 KDS separa cozinha e bar e marca atraso", async () => {
  const cozinha = await h.prisma.categoria.create({ data: { nome: `Cozinha_${Date.now()}` } });
  const bar = await h.prisma.categoria.create({ data: { nome: `Bar_${Date.now()}` } });
  const impCozinha = await h.prisma.impressora.create({
    data: { nome: "Cozinha", estacao: "cozinha", tipo_conexao: "REDE", ip: "127.0.0.1", ativo: true },
  });
  const impBar = await h.prisma.impressora.create({
    data: { nome: "Bar", estacao: "bar", tipo_conexao: "REDE", ip: "127.0.0.1", ativo: true },
  });
  await h.prisma.impressora_categoria.createMany({
    data: [
      { impressora_id: impCozinha.id, categoria_id: cozinha.id },
      { impressora_id: impBar.id, categoria_id: bar.id },
    ],
  });
  const pastel = await h.prisma.produto.create({
    data: { nome: "Pastel", categoria_id: cozinha.id, exige_preparo: true },
  });
  const drink = await h.prisma.produto.create({
    data: { nome: "Caipirinha", categoria_id: bar.id, exige_preparo: true },
  });
  const coca = await h.prisma.produto.create({
    data: { nome: "Coca", categoria_id: cozinha.id, exige_preparo: false },
  });
  const vPastel = await h.prisma.produto_variante.create({ data: { nome: "Padrão", preco_centavos: 1000, produto_id: pastel.id } });
  const vDrink = await h.prisma.produto_variante.create({ data: { nome: "Padrão", preco_centavos: 1500, produto_id: drink.id } });
  const vCoca = await h.prisma.produto_variante.create({ data: { nome: "Padrão", preco_centavos: 500, produto_id: coca.id } });
  const at = await h.prisma.atendimento.create({
    data: { codigo_atendimento: `ATK_${Date.now()}`, tipo_atendimento: "MESA", usuario_id: h.usuarioId },
  });
  const criado = new Date(Date.now() - 20 * 60_000);
  await h.prisma.pedido.create({
    data: {
      codigo_pedido: `PDK_${Date.now()}`,
      atendimento_id: at.id,
      createdAt: criado,
      itens: {
        create: [
          { nome_produto: "Pastel", preco_centavos: 1000, quantidade: 1, produto_variante_id: vPastel.id },
          { nome_produto: "Caipirinha", preco_centavos: 1500, quantidade: 1, produto_variante_id: vDrink.id },
          { nome_produto: "Coca", preco_centavos: 500, quantidade: 1, produto_variante_id: vCoca.id },
        ],
      },
    },
  });
  const coz = await h.app.inject({ method: "GET", url: "/pedidos/cozinha?estacao=cozinha", headers: auth() });
  assert.equal(coz.statusCode, 200, coz.body);
  const corpo = coz.json();
  assert.equal(corpo.estacao, "cozinha");
  assert.equal(corpo.atraso_min, 15);
  assert.equal(corpo.pedidos.length, 1);
  assert.deepEqual(corpo.pedidos[0].itens.map((i: { nome_produto: string }) => i.nome_produto), ["Pastel"]);
  assert.equal(corpo.pedidos[0].atrasado, true);
  const barResp = await h.app.inject({ method: "GET", url: "/pedidos/cozinha?estacao=bar", headers: auth() });
  assert.deepEqual(barResp.json().pedidos[0].itens.map((i: { nome_produto: string }) => i.nome_produto), ["Caipirinha"]);
});

test("duas contas na mesma mesa respondem 409 com o atendimento aberto", async () => {
  const mesa = await h.prisma.mesa.create({ data: { numero: 5000 + Math.floor(Math.random() * 1000) } });
  const primeira = await h.app.inject({
    method: "POST",
    url: "/atendimentos",
    headers: auth(),
    payload: { tipo_atendimento: "MESA", mesa_id: mesa.id },
  });
  assert.equal(primeira.statusCode, 201, primeira.body);
  const segunda = await h.app.inject({
    method: "POST",
    url: "/atendimentos",
    headers: auth(),
    payload: { tipo_atendimento: "MESA", mesa_id: mesa.id },
  });
  assert.equal(segunda.statusCode, 409);
  const erro = segunda.json();
  assert.equal(erro.codigo, "mesa_ocupada");
  assert.equal(erro.atendimento_id, primeira.json().id);
  const mesaParalela = await h.prisma.mesa.create({ data: { numero: 7000 + Math.floor(Math.random() * 1000) } });
  const paralelas = await Promise.all(
    [1, 2].map(() =>
      h.app.inject({
        method: "POST",
        url: "/atendimentos",
        headers: auth(),
        payload: { tipo_atendimento: "MESA", mesa_id: mesaParalela.id },
      })
    )
  );
  assert.equal(paralelas.filter((r) => r.statusCode === 201).length, 1);
  assert.equal(paralelas.filter((r) => r.statusCode === 409).length, 1);
  assert.equal(paralelas.find((r) => r.statusCode === 409)!.json().codigo, "mesa_ocupada");
});

test("senhas de balcão não se repetem no dia e saem na resposta", async () => {
  const respostas = await Promise.all(
    [1, 2, 3].map((n) =>
      h.app.inject({
        method: "POST",
        url: "/atendimentos",
        headers: auth(),
        payload: { tipo_atendimento: "BALCAO", cliente_nome: `Cliente ${n}` },
      })
    )
  );
  assert.ok(respostas.every((r) => r.statusCode === 201), respostas.map((r) => r.body).join("\n"));
  const numeros = respostas.map((r) => r.json().numero_dia as number).sort((a, b) => a - b);
  assert.equal(new Set(numeros).size, 3);
  assert.equal(numeros[2]! - numeros[0]!, 2);
});

test("desconto que zera a conta não fecha sem cortesia", async () => {
  const { atendimentoId } = await abrirContaComItem(h, 1000);
  const desc = await h.app.inject({
    method: "POST",
    url: `/atendimentos/${atendimentoId}/desconto`,
    headers: auth(),
    payload: { valor_centavos: 1000, motivo: "zerar" },
  });
  assert.equal(desc.statusCode, 200, desc.body);
  const fechar = await h.app.inject({
    method: "POST",
    url: `/atendimentos/${atendimentoId}/fechar`,
    headers: auth(),
    payload: {},
  });
  assert.equal(fechar.statusCode, 409, fechar.body);
  assert.equal(fechar.json().codigo, "cortesia_obrigatoria");
  const at = await h.prisma.atendimento.findUniqueOrThrow({ where: { id: atendimentoId } });
  assert.equal(at.status, "ABERTO");
});

test("cancelar pela rota de status não tira o item da conta", async () => {
  const { atendimentoId, pedidoId } = await abrirContaComItem(h, 1500);
  const status = await h.app.inject({
    method: "PUT",
    url: `/pedidos/${pedidoId}/status`,
    headers: auth(),
    payload: { status: "CANCELADO" },
  });
  assert.equal(status.statusCode, 400);
  const item = await h.prisma.pedido_item.findFirstOrThrow({ where: { pedido_id: pedidoId } });
  assert.equal(item.cancelado, false);
  const at = await h.prisma.atendimento.findUniqueOrThrow({ where: { id: atendimentoId } });
  assert.equal(at.status, "ABERTO");
});

test("PIN gravado e usuário desativado perde o acesso na hora", async () => {
  const pin = await h.app.inject({
    method: "PUT",
    url: `/usuarios/${h.usuarioId}/pin`,
    headers: auth(),
    payload: { pin: "4321" },
  });
  assert.equal(pin.statusCode, 200, pin.body);
  const salvo = await h.prisma.usuario.findUniqueOrThrow({ where: { id: h.usuarioId } });
  assert.ok(salvo.pin_hash);
  assert.notEqual(salvo.pin_hash, "4321");
  const aprovadores = await h.app.inject({ method: "GET", url: "/aprovadores", headers: auth() });
  assert.equal(aprovadores.statusCode, 200);
  assert.ok(aprovadores.json().some((a: { id: number }) => a.id === h.usuarioId));

  const senha = await bcrypt.hash("OutraSenha1", 4);
  const garcom = await h.prisma.usuario.create({
    data: { nome: "Some", login: `some_${Date.now()}`, tipo_usuario: "ATENDENTE", senha_hash: senha, pode_operar_caixa: true },
  });
  const login = await h.app.inject({
    method: "POST",
    url: "/auth/login",
    headers: { "content-type": "application/json" },
    payload: { usuario: garcom.login, senha: "OutraSenha1" },
  });
  assert.equal(login.json().usuario.pode_operar_caixa, true);
  const token = login.json().token as string;
  await h.prisma.usuario.update({ where: { id: garcom.id }, data: { ativo: false } });
  const eu = await h.app.inject({ method: "GET", url: "/auth/me", headers: { authorization: `Bearer ${token}` } });
  assert.equal(eu.statusCode, 401);
});

test("login e /auth/me trazem pode_operar_caixa e o PATCH da gerência altera", async () => {
  const eu = await h.app.inject({ method: "GET", url: "/auth/me", headers: auth() });
  assert.equal(eu.statusCode, 200);
  assert.equal(typeof eu.json().pode_operar_caixa, "boolean");
  const senha = await bcrypt.hash("Gerente123", 4);
  const gerente = await h.prisma.usuario.create({
    data: { nome: "Ger", login: `ger_${Date.now()}`, tipo_usuario: "GERENTE", senha_hash: senha, pode_operar_caixa: true },
  });
  const alvo = await h.prisma.usuario.create({
    data: { nome: "Alvo", login: `alvo_${Date.now()}`, tipo_usuario: "ATENDENTE", senha_hash: senha, pode_operar_caixa: false },
  });
  const login = await h.app.inject({
    method: "POST",
    url: "/auth/login",
    headers: { "content-type": "application/json" },
    payload: { usuario: gerente.login, senha: "Gerente123" },
  });
  const patch = await h.app.inject({
    method: "PATCH",
    url: `/usuarios/${alvo.id}`,
    headers: auth(login.json().token),
    payload: { pode_operar_caixa: true },
  });
  assert.equal(patch.statusCode, 200, patch.body);
  assert.equal(patch.json().pode_operar_caixa, true);
});

test("S1 fechar caixa com conta aberta pede confirmação", async () => {
  await h.prisma.atendimento.create({
    data: { codigo_atendimento: `ATAB_${Date.now()}`, tipo_atendimento: "MESA", usuario_id: h.usuarioId, status: "ABERTO" },
  });
  const sessao = await h.prisma.caixa_sessao.findFirstOrThrow({ where: { aberta: true } });
  const fechou = await h.app.inject({
    method: "POST",
    url: `/caixa/${sessao.id}/fechar`,
    headers: auth(),
    payload: { contagem: [{ forma_pagamento_id: h.formaDinheiroId, valor_centavos: 0 }] },
  });
  assert.equal(fechou.statusCode, 409);
  assert.equal(fechou.json().codigo, "contas_abertas");
});

test("fila ERRO, status da impressora e a mesma porta da web", async () => {
  const imp = await h.prisma.impressora.create({
    data: { nome: `Fila_${Date.now()}`, tipo_conexao: "REDE", ip: "127.0.0.1", ultimo_status: "ERRO", ultimo_erro: "sem papel", ativo: true },
  });
  await h.prisma.trabalho_impressao.create({
    data: { impressora_id: imp.id, tipo_documento: "PRODUCAO", conteudo: Buffer.from("x"), status: "ERRO", ultimo_erro: "sem papel" },
  });
  await h.prisma.trabalho_impressao.create({
    data: { impressora_id: imp.id, tipo_documento: "PRODUCAO", conteudo: Buffer.from("y"), status: "PENDENTE" },
  });
  const fila = await h.app.inject({ method: "GET", url: "/impressao/fila?status=ERRO", headers: auth() });
  assert.equal(fila.statusCode, 200);
  assert.ok(fila.json().every((t: { status: string }) => t.status === "ERRO"));
  const status = await h.app.inject({ method: "GET", url: "/impressoras/status", headers: auth() });
  const achada = status.json().find((i: { id: number }) => i.id === imp.id);
  assert.equal(achada.status, "erro");
  assert.equal(achada.ultimo_erro, "sem papel");
  assert.equal(typeof achada.desde, "string");

  const recebidos: { tipo: string; id: number }[] = [];
  const parar = assinar((ev) => recebidos.push(ev), ["GERENTE"]);
  publicar("impressora.status", imp.id, ["GERENTE", "ADMIN", "ROOT"]);
  parar();
  assert.equal(recebidos[0]?.tipo, "impressora.status");
  assert.equal(recebidos[0]?.id, imp.id);

  assert.equal(portaConfigurada(), Number(process.env.PORT || 3333));
  const dir = await mkdtemp(path.join(tmpdir(), "os-web-"));
  await writeFile(path.join(dir, "index.html"), "<!doctype html><title>pdv</title>");
  process.env.WEB_DIST = dir;
  const pagina = await h.app.inject({ method: "GET", url: "/painel/balcao" });
  const saude = await h.app.inject({ method: "GET", url: "/api/saude" });
  assert.equal(pagina.statusCode, 200);
  assert.match(pagina.body, /pdv/);
  assert.equal(saude.statusCode, 200);
  await rm(dir, { recursive: true, force: true });
});

test("mais-vendidos não cai em /produtos/:id e módulos são leitura autenticada", async () => {
  const mais = await h.app.inject({ method: "GET", url: "/produtos/mais-vendidos?limite=9&dias=30", headers: auth() });
  assert.equal(mais.statusCode, 200, mais.body);
  const lista = mais.json();
  assert.ok(Array.isArray(lista));
  assert.ok(lista.length >= 1);
  assert.equal(lista[0].posicao, 1);
  assert.equal(typeof lista[0].produto_variante_id, "number");
  assert.equal(typeof lista[0].qtd_vendida, "number");

  const senha = await bcrypt.hash("Cozinha123", 4);
  const cozinha = await h.prisma.usuario.create({
    data: { nome: "Cozinha", login: `coz_${Date.now()}`, tipo_usuario: "COZINHEIRO", senha_hash: senha },
  });
  const login = await h.app.inject({
    method: "POST",
    url: "/auth/login",
    headers: { "content-type": "application/json" },
    payload: { usuario: cozinha.login, senha: "Cozinha123" },
  });
  assert.equal(typeof login.json().usuario.pode_operar_caixa, "boolean");
  const token = login.json().token as string;
  const modulos = await h.app.inject({
    method: "GET",
    url: "/configuracoes/modulos",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(modulos.statusCode, 200, modulos.body);
  assert.deepEqual(Object.keys(modulos.json()).sort(), ["delivery", "estoque_nivel", "promocoes", "usa_gaveta"]);
  const config = await h.app.inject({
    method: "GET",
    url: "/configuracoes",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(config.statusCode, 403);
  const eu = await h.app.inject({ method: "GET", url: "/auth/me", headers: { authorization: `Bearer ${token}` } });
  assert.equal(eu.statusCode, 200, eu.body);
  const impressoras = await h.app.inject({
    method: "GET",
    url: "/impressoras/status",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(impressoras.statusCode, 200);
  assert.ok(Array.isArray(impressoras.json()));
});

test("S4 operação expõe taxa e limite", async () => {
  const res = await h.app.inject({ method: "GET", url: "/configuracoes/operacao", headers: auth() });
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(typeof res.json().taxa_servico_percentual, "number");
  assert.equal(typeof res.json().limite_desconto_sem_pin_centavos, "number");
});

async function atendenteComCaixa() {
  const senha = await bcrypt.hash("Atendente1", 4);
  const pin = await bcrypt.hash("4321", 4);
  const atendente = await h.prisma.usuario.create({
    data: {
      nome: "Atendente",
      login: `at_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      tipo_usuario: "ATENDENTE",
      senha_hash: senha,
      pode_operar_caixa: true,
    },
  });
  const gerente = await h.prisma.usuario.create({
    data: {
      nome: "Gerente PIN",
      login: `gp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      tipo_usuario: "GERENTE",
      senha_hash: senha,
      pin_hash: pin,
      pode_operar_caixa: true,
    },
  });
  const token = h.app.jwt.sign({ id: atendente.id, tipo: "ATENDENTE" }, { expiresIn: "1h" });
  return { token, gerenteId: gerente.id };
}

test("S6 mensagens de sangria, estorno e cancelamento falam em R$", async () => {
  const { token } = await atendenteComCaixa();
  const sessao = await h.prisma.caixa_sessao.findFirstOrThrow({ where: { aberta: true } });
  const sangria = await h.app.inject({
    method: "POST",
    url: `/caixa/${sessao.id}/movimentacao`,
    headers: auth(token),
    payload: { tipo: "SANGRIA", valor_centavos: 2000, motivo: "troco" },
  });
  assert.equal(sangria.statusCode, 403, sangria.body);
  assert.equal(sangria.json().erro, "Sangria de R$ 20,00 precisa do PIN de um gerente.");
  assert.equal(sangria.json().erro.includes("centavos"), false);
  assert.equal(sangria.json().erro.includes("aprovador_id"), false);

  const conta = await abrirContaComItem(h, 6650);
  const pagamento = await h.app.inject({
    method: "POST",
    url: `/atendimentos/${conta.atendimentoId}/pagamentos`,
    headers: auth(token),
    payload: { forma_pagamento_id: h.formaPixId, valor_centavos: 1050 },
  });
  assert.equal(pagamento.statusCode, 201, pagamento.body);
  const estorno = await h.app.inject({
    method: "POST",
    url: `/pagamentos/${pagamento.json().id}/estornar`,
    headers: auth(token),
    payload: { motivo: "cliente desistiu" },
  });
  assert.equal(estorno.statusCode, 403, estorno.body);
  assert.equal(estorno.json().erro, "O estorno de R$ 10,50 precisa do PIN de um gerente.");
  assert.equal(estorno.json().erro.includes("centavos"), false);
  assert.equal(estorno.json().erro.includes("aprovador_id"), false);

  const item = await h.prisma.pedido_item.findFirstOrThrow({ where: { pedido_id: conta.pedidoId } });
  const cancelar = await h.app.inject({
    method: "POST",
    url: `/pedido-itens/${item.id}/cancelar`,
    headers: auth(token),
    payload: { motivo: "erro de lançamento" },
  });
  assert.equal(cancelar.statusCode, 403, cancelar.body);
  assert.equal(cancelar.json().erro, "Cancelar o item de R$ 66,50 precisa do PIN de um gerente.");
  assert.equal(cancelar.json().erro.includes("centavos"), false);
  assert.equal(cancelar.json().erro.includes("aprovador_id"), false);
});

test("S10 cancelar conta e item exige PIN e aceita o do gerente", async () => {
  const { token, gerenteId } = await atendenteComCaixa();
  const conta = await abrirContaComItem(h, 6650);
  const semPin = await h.app.inject({
    method: "POST",
    url: `/atendimentos/${conta.atendimentoId}/cancelar`,
    headers: auth(token),
    payload: { motivo: "cliente foi embora" },
  });
  assert.equal(semPin.statusCode, 403, semPin.body);
  assert.equal(semPin.json().codigo, "pin_invalido");
  assert.equal(semPin.json().erro, "Cancelar esta conta de R$ 66,50 precisa do PIN de um gerente.");
  const ainda = await h.prisma.atendimento.findUniqueOrThrow({ where: { id: conta.atendimentoId } });
  assert.equal(ainda.status, "ABERTO");

  const comPin = await h.app.inject({
    method: "POST",
    url: `/atendimentos/${conta.atendimentoId}/cancelar`,
    headers: auth(token),
    payload: { motivo: "cliente foi embora", pin: "4321", aprovador_id: gerenteId },
  });
  assert.equal(comPin.statusCode, 200, comPin.body);
  const fechada = await h.prisma.atendimento.findUniqueOrThrow({ where: { id: conta.atendimentoId } });
  assert.equal(fechada.status, "CANCELADO");

  const outra = await abrirContaComItem(h, 6650);
  const item = await h.prisma.pedido_item.findFirstOrThrow({ where: { pedido_id: outra.pedidoId } });
  const itemSem = await h.app.inject({
    method: "POST",
    url: `/pedido-itens/${item.id}/cancelar`,
    headers: auth(token),
    payload: { motivo: "saiu errado" },
  });
  assert.equal(itemSem.statusCode, 403, itemSem.body);
  assert.equal(itemSem.json().codigo, "pin_invalido");
  const vivo = await h.prisma.pedido_item.findUniqueOrThrow({ where: { id: item.id } });
  assert.equal(vivo.cancelado, false);

  const itemCom = await h.app.inject({
    method: "POST",
    url: `/pedido-itens/${item.id}/cancelar`,
    headers: auth(token),
    payload: { motivo: "saiu errado", pin: "4321", aprovador_id: gerenteId },
  });
  assert.equal(itemCom.statusCode, 200, itemCom.body);
  assert.equal(itemCom.json().item.cancelado, true);
});

test("falha de impressão no pedido responde 201 sem duplicar e deixa o job em ERRO", async () => {
  const cat = await h.prisma.categoria.create({ data: { nome: `Falha_${Date.now()}` } });
  const imp = await h.prisma.impressora.create({
    data: { nome: "Impressora caída", tipo_conexao: "REDE", ip: "127.0.0.1", porta: 1, ativo: true },
  });
  await h.prisma.impressora_categoria.create({ data: { impressora_id: imp.id, categoria_id: cat.id } });
  const prod = await h.prisma.produto.create({
    data: { nome: `Item_${Date.now()}`, categoria_id: cat.id, exige_preparo: true },
  });
  const variante = await h.prisma.produto_variante.create({
    data: { nome: "Padrão", preco_centavos: 1500, produto_id: prod.id },
  });
  const at = await h.prisma.atendimento.create({
    data: { codigo_atendimento: `ATF_${Date.now()}`, tipo_atendimento: "BALCAO", usuario_id: h.usuarioId },
  });
  const antes = await h.prisma.pedido.count();
  const res = await h.app.inject({
    method: "POST",
    url: `/atendimentos/${at.id}/pedidos`,
    headers: auth(),
    payload: { itens: [{ produto_variante_id: variante.id, quantidade: 1 }] },
  });
  assert.equal(res.statusCode, 201, res.body);
  assert.equal(await h.prisma.pedido.count(), antes + 1);
  const pedidoId = res.json().pedido.id as number;
  const jobs = await h.prisma.trabalho_impressao.findMany({ where: { pedido_id: pedidoId } });
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0]?.status, "ERRO");
  assert.ok(jobs[0]?.proxima_tentativa_em);
  const deNovo = await h.prisma.pedido.count({ where: { atendimento_id: at.id } });
  assert.equal(deNovo, 1);
});

test("dashboard agrega dia, semana e mês e o funcionário, sem lucro", async () => {
  const res = await h.app.inject({
    method: "GET",
    url: "/relatorios/dashboard?de=2026-11-01&ate=2026-11-02",
    headers: auth(),
  });
  const corpo = res.json();
  assert.ok(Array.isArray(corpo.faturamento_agregado.por_dia));
  assert.ok(Array.isArray(corpo.faturamento_agregado.por_semana));
  assert.ok(Array.isArray(corpo.faturamento_agregado.por_mes));
  assert.ok(corpo.faturamento_agregado.por_dia[0].anterior);
  assert.ok(Array.isArray(corpo.por_funcionario));
  assert.equal("lucro_centavos" in corpo, false);
  assert.equal("margem" in corpo, false);
});
