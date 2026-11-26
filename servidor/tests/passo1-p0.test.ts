import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { montarHarness, abrirContaComItem, type Harness } from "./helpers/harness.js";
import { encoderTexto, formatarDinheiroEscpos } from "../src/impressao/escpos.js";

let h: Harness;

before(async () => {
  h = await montarHarness();
});

after(async () => {
  if (h) await h.limpar();
});

test("ESC/POS: CP860 acentos e R$ sem interrogação", () => {
  const buf = encoderTexto("pão", "CP860");
  assert.ok(buf.length >= 3);
  assert.notEqual(buf[1], 0x3f);
  const money = formatarDinheiroEscpos(1050);
  assert.equal(money, "R$ 10,50");
  assert.ok(!money.includes("\u00a0"));
});

function auth() {
  return { authorization: `Bearer ${h.token}` };
}

test("3 pagamentos paralelos não ultrapassam o total", async () => {
  const { atendimentoId } = await abrirContaComItem(h as any, 6650);
  const body = {
    forma_pagamento_id: h.formaPixId,
    valor_centavos: 6650,
    valor_recebido_centavos: 6650,
  };
  const resultados = await Promise.all(
    [1, 2, 3].map(() =>
      h.app.inject({
        method: "POST",
        url: `/atendimentos/${atendimentoId}/pagamentos`,
        headers: { ...auth(), "content-type": "application/json" },
        payload: body,
      })
    )
  );
  const ok = resultados.filter((r) => r.statusCode === 201);
  const falha = resultados.filter((r) => r.statusCode !== 201);
  assert.equal(ok.length, 1, `esperava 1 sucesso, veio ${ok.length}`);
  assert.equal(falha.length, 2);
  const pago = await h.prisma.pagamento.count({
    where: { atendimento_id: atendimentoId, estornado_em: null },
  });
  assert.equal(pago, 1);
  const soma = await h.prisma.pagamento.aggregate({
    where: { atendimento_id: atendimentoId, estornado_em: null },
    _sum: { valor_centavos: true },
  });
  assert.ok((soma._sum.valor_centavos ?? 0) <= 6650);
});

test("3 fechar em paralelo: só um fecha", async () => {
  const { atendimentoId } = await abrirContaComItem(h as any, 1000);
  await h.prisma.pagamento.create({
    data: {
      atendimento_id: atendimentoId,
      forma_pagamento_id: h.formaPixId,
      caixa_sessao_id: (await h.prisma.caixa_sessao.findFirstOrThrow({ where: { fechado_em: null } })).id,
      valor_centavos: 1000,
      valor_recebido_centavos: 1000,
      troco_centavos: 0,
      usuario_id: h.usuarioId,
    },
  });
  const resultados = await Promise.all(
    [1, 2, 3].map(() =>
      h.app.inject({
        method: "POST",
        url: `/atendimentos/${atendimentoId}/fechar`,
        headers: auth(),
      })
    )
  );
  const ok = resultados.filter((r) => r.statusCode === 200);
  assert.equal(ok.length, 1, `esperava 1 fechar OK, veio ${ok.map((r) => r.statusCode)}`);
  const at = await h.prisma.atendimento.findUniqueOrThrow({ where: { id: atendimentoId } });
  assert.equal(at.status, "FECHADO");
});

test("2 aberturas na mesma mesa: uma 201 e outra 409", async () => {
  const mesa = await h.prisma.mesa.create({ data: { numero: 777 + Math.floor(Math.random() * 1000) } });
  const payload = { tipo_atendimento: "MESA", mesa_id: mesa.id };
  const resultados = await Promise.all(
    [1, 2].map(() =>
      h.app.inject({
        method: "POST",
        url: "/atendimentos",
        headers: { ...auth(), "content-type": "application/json" },
        payload,
      })
    )
  );
  const codes = resultados.map((r) => r.statusCode).sort();
  assert.deepEqual(codes, [201, 409]);
  const abertos = await h.prisma.atendimento.count({
    where: { mesa_id: mesa.id, status: "ABERTO" },
  });
  assert.equal(abertos, 1);
});

test("desconto maior que o subtotal é rejeitado; conta não fecha zerada", async () => {
  const { atendimentoId } = await abrirContaComItem(h as any, 1000);
  const desc = await h.app.inject({
    method: "POST",
    url: `/atendimentos/${atendimentoId}/desconto`,
    headers: { ...auth(), "content-type": "application/json" },
    payload: { valor_centavos: 999900, motivo: "teste" },
  });
  assert.equal(desc.statusCode, 400, desc.body);

  // força desconto absurdo no banco (simulando bug antigo) e tenta fechar
  await h.prisma.atendimento.update({
    where: { id: atendimentoId },
    data: { desconto_centavos: 999900 },
  });
  // API de totais limita desconto ao subtotal → restante ainda 1000; fechar deve falhar
  const fechar = await h.app.inject({
    method: "POST",
    url: `/atendimentos/${atendimentoId}/fechar`,
    headers: auth(),
  });
  assert.equal(fechar.statusCode, 400);
  const at = await h.prisma.atendimento.findUniqueOrThrow({ where: { id: atendimentoId } });
  assert.equal(at.status, "ABERTO");
});
