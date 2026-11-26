import { describe, expect, it } from "vitest";
import { datasDoPeriodo, paraCsv, rotuloMes, textoVariacao, variacao } from "./relatorios";

describe("relatórios", () => {
  it("variação contra o período anterior", () => {
    expect(variacao(1500, 1000)).toBe(50);
    expect(variacao(900, 1000)).toBe(-10);
    expect(variacao(100, 0)).toBeNull();
    expect(textoVariacao(12.5)).toBe("+12,5% vs anterior");
    expect(textoVariacao(null)).toBe("sem base anterior");
  });
  it("datas dos atalhos no fuso de Brasília", () => {
    const agora = new Date("2026-11-26T02:00:00Z"); // 25/11 23h em Brasília
    expect(datasDoPeriodo("hoje", agora)).toEqual({ de: "2026-11-25", ate: "2026-11-25" });
    expect(datasDoPeriodo("7", agora)).toEqual({ de: "2026-11-19", ate: "2026-11-25" });
    expect(datasDoPeriodo("mes", agora)).toEqual({ de: "2026-11-01", ate: "2026-11-25" });
  });
  it("rótulos e csv", () => {
    expect(rotuloMes("2026-11-01")).toBe("nov/26");
    expect(paraCsv([["a;b", 1]])).toBe('\uFEFF"a;b";1');
  });
});
