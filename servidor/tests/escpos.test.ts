import { test } from "node:test";
import assert from "node:assert/strict";
import { encoderTexto, formatarDinheiroEscpos, montarCupomProducao, montarCupomTeste } from "../src/impressao/escpos.js";

test("CP860: ã tem byte conhecido (não vira ?)", () => {
  const b = encoderTexto("ã", "CP860");
  assert.equal(b.length, 1);
  assert.notEqual(b[0], 0x3f);
});

test("formatarDinheiroEscpos sem NBSP", () => {
  assert.equal(formatarDinheiroEscpos(1050), "R$ 10,50");
});

test("ESC/POS: tamanho e corte usam comandos aceitos pelo emulador", () => {
  const teste = montarCupomTeste({ colunas: 48, codificacao: "CP850", tem_guilhotina: true });
  const producao = montarCupomProducao({
    colunas: 48,
    codificacao: "CP850",
    tem_guilhotina: true,
    codigo_pedido: "PD_TESTE",
    codigo_atendimento: "AT_TESTE",
    itens: [{ nome: "Pastel", quantidade: 1 }],
  });

  assert.ok(producao.includes(Buffer.from([0x1b, 0x21]))); // ESC ! tamanho
  for (const cupom of [teste, producao]) {
    assert.ok(cupom.includes(Buffer.from([0x1b, 0x6d]))); // ESC m corte
    assert.equal(cupom.includes(Buffer.from([0x1d, 0x21])), false); // GS ! não suportado pelo emulador
    assert.equal(cupom.includes(Buffer.from([0x1d, 0x56])), false); // GS V não suportado pelo emulador
  }
});
