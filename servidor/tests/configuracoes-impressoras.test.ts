import { test } from "node:test";
import assert from "node:assert/strict";
import { montarHarness } from "./helpers/harness.js";

test("primeiro cadastro salva destinos e encaminha pré-conta e caixa", async () => {
  const h = await montarHarness();
  try {
    await h.prisma.configuracao.deleteMany();
    const padrao = await h.prisma.impressora.create({ data: { nome: "Padrão", tipo_conexao: "REDE", ip: "127.0.0.1" } });
    const conta = await h.prisma.impressora.create({ data: { nome: "Conta", tipo_conexao: "REDE", ip: "127.0.0.1" } });
    const headers = { authorization: `Bearer ${h.token}` };
    const resposta = await h.app.inject({ method: "PUT", url: "/api/configuracoes", headers, payload: {
      nome_restaurante: "Restaurante Teste",
      impressora_padrao_id: padrao.id,
      impressora_producao_id: null,
      impressora_conta_id: conta.id,
      impressora_caixa_id: padrao.id,
      usa_tela_cozinha: true,
    } });
    assert.equal(resposta.statusCode, 200, resposta.body);
    assert.equal(resposta.json().configurado, true);
    const leitura = await h.app.inject({ method: "GET", url: "/api/configuracoes", headers });
    assert.equal(leitura.json().impressora_padrao_id, padrao.id);
    assert.equal(leitura.json().impressora_conta_id, conta.id);
    const { resolverDestinoPreconta, resolverDestinoCaixa } = await import("../src/impressao/destino.js");
    assert.equal((await resolverDestinoPreconta())?.id, conta.id);
    assert.equal((await resolverDestinoCaixa())?.id, padrao.id);
  } finally {
    await h.limpar();
  }
});
