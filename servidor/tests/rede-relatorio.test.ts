import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { montarHarness, type Harness } from "./helpers/harness.js";
import { ehIpv4Local } from "../src/rede/enderecos.js";

let h: Harness;

before(async () => {
  h = await montarHarness();
});

after(async () => {
  if (h) await h.limpar();
});

test("IPv4 local ignora loopback e aceita rede privada", () => {
  assert.equal(ehIpv4Local("127.0.0.1"), false);
  assert.equal(ehIpv4Local("169.254.1.1"), false);
  assert.equal(ehIpv4Local("8.8.8.8"), false);
  assert.equal(ehIpv4Local("192.168.0.12"), true);
  assert.equal(ehIpv4Local("10.1.2.3"), true);
  assert.equal(ehIpv4Local("172.16.0.4"), true);
  assert.equal(ehIpv4Local("172.32.0.4"), false);
});

test("GET /api/saude não expõe nada além do app", async () => {
  const res = await h.app.inject({ method: "GET", url: "/api/saude" });
  assert.equal(res.statusCode, 200);
  const corpo = res.json();
  assert.deepEqual(Object.keys(corpo).sort(), ["app", "nome_restaurante", "versao"]);
  assert.equal(corpo.app, "os-restaurante");
  assert.equal(corpo.nome_restaurante, "Teste");
  assert.equal(typeof corpo.versao, "string");
});

test("conexão da rede é da gerência e monta as URLs", async () => {
  const bloqueado = await h.app.inject({ method: "GET", url: "/rede/conexao" });
  assert.equal(bloqueado.statusCode, 401);

  const ok = await h.app.inject({
    method: "GET",
    url: "/rede/conexao",
    headers: { authorization: `Bearer ${h.token}` },
  });
  assert.equal(ok.statusCode, 200, ok.body);
  const corpo = ok.json();
  assert.equal(typeof corpo.porta, "number");
  assert.ok(Array.isArray(corpo.enderecos));
  for (const endereco of corpo.enderecos) {
    assert.equal(ehIpv4Local(endereco.ip), true);
    assert.equal(/docker|veth|virbr|vmnet/i.test(endereco.interface), false);
  }
  if (corpo.enderecos.length) {
    assert.match(corpo.url_web, /^http:\/\/[^/]+:\d+\/$/);
    assert.match(corpo.url_app, /^osrestaurante:\/\/conectar\?/);
  }
});

test("dashboard vazio compara o período e não conta cancelado", async () => {
  const res = await h.app.inject({
    method: "GET",
    url: "/relatorios/dashboard?de=2026-11-01&ate=2026-11-02",
    headers: { authorization: `Bearer ${h.token}` },
  });
  assert.equal(res.statusCode, 200, res.body);
  const corpo = res.json();
  assert.equal(corpo.fuso, "America/Sao_Paulo");
  assert.equal(corpo.faturamento_centavos, 0);
  assert.equal(corpo.atendimentos, 0);
  assert.equal(corpo.ticket_medio_centavos, 0);
  assert.equal(corpo.por_hora.length, 24);
  assert.equal(corpo.periodo_anterior.de < corpo.de, true);

  const fechado = new Date("2026-11-01T15:00:00.000Z");
  const at = await h.prisma.atendimento.create({
    data: {
      codigo_atendimento: `AT_DASH_${Date.now()}`,
      tipo_atendimento: "ENTREGA",
      status: "FECHADO",
      usuario_id: h.usuarioId,
      total_centavos: 1000,
      fechado_em: fechado,
    },
  });
  await h.prisma.pagamento.create({
    data: {
      atendimento_id: at.id,
      forma_pagamento_id: h.formaPixId,
      caixa_sessao_id: (await h.prisma.caixa_sessao.findFirstOrThrow()).id,
      valor_centavos: 1000,
      valor_recebido_centavos: 1000,
      usuario_id: h.usuarioId,
      criado_em: fechado,
    },
  });
  const cancelado = await h.prisma.atendimento.create({
    data: {
      codigo_atendimento: `AT_CAN_${Date.now()}`,
      tipo_atendimento: "MESA",
      status: "CANCELADO",
      usuario_id: h.usuarioId,
      total_centavos: 9000,
      fechado_em: fechado,
    },
  });
  await h.prisma.pagamento.create({
    data: {
      atendimento_id: at.id,
      forma_pagamento_id: h.formaDinheiroId,
      caixa_sessao_id: (await h.prisma.caixa_sessao.findFirstOrThrow()).id,
      valor_centavos: 500,
      valor_recebido_centavos: 500,
      usuario_id: h.usuarioId,
      estornado_em: fechado,
    },
  });
  void cancelado;

  const depois = await h.app.inject({
    method: "GET",
    url: "/relatorios/dashboard?de=2026-11-01&ate=2026-11-01",
    headers: { authorization: `Bearer ${h.token}` },
  });
  const dash = depois.json();
  assert.equal(dash.faturamento_centavos, 1000);
  assert.equal(dash.atendimentos, 1);
  assert.equal(dash.por_tipo.some((t: { tipo: string }) => t.tipo === "DELIVERY"), true);
  assert.equal(dash.por_forma_pagamento.length, 1);
  assert.equal(dash.por_garcom[0].ticket_medio_centavos, 1000);
});

test("atendente sem caixa não vende rápido e o caixa aberto sobrevive a outro login", async () => {
  const senha = await bcrypt.hash("SenhaTeste1!", 4);
  const atendente = await h.prisma.usuario.create({
    data: {
      nome: "Garçom",
      login: `garcom_${Date.now()}`,
      tipo_usuario: "ATENDENTE",
      senha_hash: senha,
      pode_operar_caixa: false,
    },
  });
  const login = await h.app.inject({
    method: "POST",
    url: "/auth/login",
    headers: { "content-type": "application/json" },
    payload: { usuario: atendente.login, senha: "SenhaTeste1!" },
  });
  assert.equal(login.statusCode, 200, login.body);
  const token = login.json().token as string;
  const venda = await h.app.inject({
    method: "POST",
    url: "/vendas/rapida",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "idempotency-key": `vr-${Date.now()}` },
    payload: { itens: [{ produto_variante_id: h.varianteId, quantidade: 1 }], pagamentos: [] },
  });
  assert.equal(venda.statusCode, 403);
  assert.equal(venda.json().codigo, "sem_permissao_caixa");

  const caixa = await h.app.inject({
    method: "GET",
    url: "/caixa/atual",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(caixa.json().aberto, true);
  assert.equal("valor_esperado_centavos" in (caixa.json().sessao ?? {}), false);
});
