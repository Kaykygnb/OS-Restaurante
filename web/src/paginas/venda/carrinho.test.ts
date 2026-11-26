import { describe, expect, it } from "vitest";
import { adicionar, atalhosNota, descontoCentavos, mudarQuantidade, paraItensInput, restante, totais, troco, type CarrinhoLinha } from "./carrinho";

const pastel = { produto_variante_id: 1, nome: "Pastel de carne", preco_centavos: 1050, quantidade: 1, observacao: "", escolhas: [], adicionais: [] };
const especial = {
  produto_variante_id: 2,
  nome: "Pastel especial",
  preco_centavos: 1200,
  quantidade: 1,
  observacao: "",
  escolhas: [{ opcao_escolha_id: 2, nome: "Catupiry", preco_extra_centavos: 250, quantidade: 1 }],
  adicionais: [{ adicional_variante_id: 1, nome: "Bacon", preco_centavos: 300, quantidade: 1 }],
};

describe("carrinho", () => {
  it("mesmo item soma quantidade; com adicionais diferentes vira outra linha", () => {
    let c: CarrinhoLinha[] = [];
    c = adicionar(c, pastel);
    c = adicionar(c, pastel);
    c = adicionar(c, especial);
    expect(c).toHaveLength(2);
    expect(c[0].quantidade).toBe(2);
  });
  it("total inclui escolhas e adicionais; −1 até zero remove", () => {
    let c = adicionar(adicionar([], pastel), especial);
    expect(totais(c).total).toBe(1050 + 1200 + 250 + 300);
    c = mudarQuantidade(c, c[0].key, -1);
    expect(c).toHaveLength(1);
  });
  it("desconto em % e em R$ nunca passa do subtotal", () => {
    expect(descontoCentavos(6150, { tipo: "percentual", valor: 10, motivo: "x" })).toBe(615);
    expect(descontoCentavos(1000, { tipo: "valor", valor: 5000, motivo: "x" })).toBe(1000);
    expect(descontoCentavos(1000, null)).toBe(0);
  });
  it("troco e restante", () => {
    expect(troco(6150, 7000)).toBe(850);
    expect(troco(6150, 6000)).toBe(0);
    expect(restante(6150, [{ forma_pagamento_id: 2, valor_centavos: 4000 }])).toBe(2150);
  });
  it("atalhos de nota: exato + notas redondas acima", () => {
    expect(atalhosNota(6150)).toEqual([6150, 7000, 8000, 10000]);
    expect(atalhosNota(2000)).toEqual([2000, 5000, 10000, 20000]);
    expect(atalhosNota(0)).toEqual([]);
  });
  it("vira o payload do contrato", () => {
    const [l] = paraItensInput(adicionar([], especial));
    expect(l).toEqual({
      produto_variante_id: 2,
      quantidade: 1,
      observacao: null,
      escolhas: [{ opcao_escolha_id: 2, quantidade: 1 }],
      adicionais: [{ adicional_variante_id: 1, quantidade: 1 }],
    });
  });
});
