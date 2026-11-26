import { describe, expect, it } from "vitest";
import { horaParaMin, precoComPromo, textoDias, textoRegra } from "./promocoes";

describe("promoções", () => {
  it("dias em texto", () => {
    expect(textoDias(127)).toBe("todos os dias");
    expect(textoDias(0b0111110)).toBe("seg a sex");
    expect(textoDias((1 << 6) | 1)).toBe("sáb, dom");
  });
  it("regra em texto", () => {
    expect(textoRegra({ tipo: "PERCENTUAL", percentual: 20, valor_centavos: null, preco_fixo_centavos: null, leve: null, pague: null })).toBe("20% de desconto");
    expect(textoRegra({ tipo: "LEVE_PAGUE", percentual: null, valor_centavos: null, preco_fixo_centavos: null, leve: 3, pague: 2 })).toBe("leve 3, pague 2");
  });
  it("preço com promoção", () => {
    expect(precoComPromo(1050, { tipo: "PERCENTUAL", percentual: 20, valor_centavos: null, preco_fixo_centavos: null })).toBe(840);
    expect(precoComPromo(1050, { tipo: "VALOR", percentual: null, valor_centavos: 2000, preco_fixo_centavos: null })).toBe(0);
    expect(precoComPromo(1050, { tipo: "PRECO_FIXO", percentual: null, valor_centavos: null, preco_fixo_centavos: 900 })).toBe(900);
  });
  it("hora para minutos", () => {
    expect(horaParaMin("17:30")).toBe(1050);
    expect(horaParaMin("25:00")).toBeNull();
  });
});
