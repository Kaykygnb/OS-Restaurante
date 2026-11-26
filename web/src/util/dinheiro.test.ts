import { describe, expect, it } from "vitest";
import { centavosParaCampo, formatarReais, formatarReaisCupom, reaisParaCentavos } from "./dinheiro";

describe("reaisParaCentavos", () => {
  it.each([
    ["12,50", 1250],
    ["12", 1200],
    ["0,5", 50],
    ["1.250", 125000],
    ["1.250,00", 125000],
    ["R$ 1.250,00", 125000],
    ["R$\u00a010,50", 1050],
    ["1.250.000", 125000000],
    ["12.50", 1250],
    ["12.5", 1250],
    [" 7,5 ", 750],
    ["0", 0],
  ])("%s → %i centavos", (texto, esperado) => {
    expect(reaisParaCentavos(texto)).toBe(esperado);
  });

  it.each(["", "abc", "-5", "1,250", "12,5,0", "1.25,00", "12.345.6", "10 reais"])(
    "%s é inválido (NaN)",
    (texto) => {
      expect(reaisParaCentavos(texto)).toBeNaN();
    }
  );

  it("o erro antigo não volta: 1.250 nunca vira R$ 12,50", () => {
    expect(reaisParaCentavos("1.250")).not.toBe(1250);
  });

  it("aceita número", () => {
    expect(reaisParaCentavos(10.5)).toBe(1050);
    expect(reaisParaCentavos(-1)).toBeNaN();
  });
});

describe("formatação", () => {
  it("formatarReais usa o padrão brasileiro", () => {
    expect(formatarReais(125000).replace(/\u00a0/g, " ")).toBe("R$ 1.250,00");
    expect(formatarReais(null).replace(/\u00a0/g, " ")).toBe("R$ 0,00");
  });

  it("formatarReaisCupom sem NBSP", () => {
    const s = formatarReaisCupom(1050);
    expect(s).toBe("R$ 10,50");
    expect(s.includes("\u00a0")).toBe(false);
    expect(formatarReaisCupom(-125000)).toBe("-R$ 1.250,00");
  });

  it("centavosParaCampo e volta", () => {
    expect(centavosParaCampo(1050)).toBe("10,50");
    expect(reaisParaCentavos(centavosParaCampo(123456))).toBe(123456);
  });
});
