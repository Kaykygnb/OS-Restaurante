import { describe, expect, it } from "vitest";
import { enderecoEmLinha, formatarCep, formatarDistancia, formatarFator, formatarTelefone, telefoneValido } from "./formatos";
import { nomeParaCabecalho } from "./terminal";

describe("formatos", () => {
  it("telefone celular, fixo e parcial", () => {
    expect(formatarTelefone("11987654321")).toBe("(11) 98765-4321");
    expect(formatarTelefone("1133334444")).toBe("(11) 3333-4444");
    expect(formatarTelefone("119")).toBe("(11) 9");
    expect(formatarTelefone("")).toBe("");
    expect(formatarTelefone("(11) 98765-4321 ramal")).toBe("(11) 98765-4321");
  });
  it("telefone válido só com DDD (10 ou 11 dígitos)", () => {
    expect(telefoneValido("(11) 98765-4321")).toBe(true);
    expect(telefoneValido("987654321")).toBe(false);
    expect(telefoneValido("119876543210")).toBe(false);
  });
  it("CEP", () => {
    expect(formatarCep("01310000")).toBe("01310-000");
    expect(formatarCep("0131")).toBe("0131");
  });
  it("distância em m e km com vírgula", () => {
    expect(formatarDistancia(850)).toBe("850 m");
    expect(formatarDistancia(3240)).toBe("3,2 km");
    expect(formatarDistancia(12400)).toBe("12 km");
    expect(formatarDistancia(undefined)).toBe("—");
  });
  it("fator", () => expect(formatarFator(130)).toBe("1,30"));
  it("endereço numa linha com s/n", () => {
    expect(enderecoEmLinha({ logradouro: "Rua A", numero: "120", complemento: "ap 32", bairro: "Centro" })).toBe("Rua A, 120 · ap 32 · Centro");
    expect(enderecoEmLinha({ logradouro: "Rua B", sem_numero: true, bairro: "Jardim" })).toBe("Rua B, s/n · Jardim");
  });
  it("nome do aparelho vira cabeçalho seguro", () => {
    expect(nomeParaCabecalho("Caixa 1\n")).toBe("Caixa 1");
    expect(nomeParaCabecalho("Celular do Zé")).toBe("Celular do Zé");
    expect(nomeParaCabecalho("Caixa 🍔")).toBe("Caixa ??");
  });
});
