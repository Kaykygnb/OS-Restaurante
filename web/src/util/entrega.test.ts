import { describe, expect, it } from "vitest";
import type { BairroEntrega, FaixaEntrega } from "../servicos/contratos";
import { aplicarFator, cotar, distanciaLinhaReta, normalizarBairro, taxaFinal, taxaManualPrecisaPin, type RegrasEntrega } from "./entrega";

const faixas: FaixaEntrega[] = [
  { id: 1, ate_m: 2000, taxa_centavos: 500, ordem: 1, ativo: true },
  { id: 2, ate_m: 4000, taxa_centavos: 700, ordem: 2, ativo: true },
  { id: 3, ate_m: 7000, taxa_centavos: 1000, ordem: 3, ativo: true },
];
const bairros: BairroEntrega[] = [
  { id: 10, nome: "Jardim América", cidade: "São Paulo", taxa_centavos: 900, atende: true, ativo: true },
  { id: 11, nome: "Vila Distante", cidade: "São Paulo", taxa_centavos: 0, atende: false, ativo: true },
];
const origem = { lat: -23.55052, lng: -46.633308 };
const regras: RegrasEntrega = { origem, fator: 130, raio_max_m: 7000, faixas, bairros };
// ~2,5 km ao norte → ×1,30 ≈ 3,25 km
const perto = { lat: -23.52804, lng: -46.633308 };

describe("distância", () => {
  it("haversine ~1 km por 0,009 grau de latitude", () => {
    const d = distanciaLinhaReta(0, 0, 0.009, 0);
    expect(d).toBeGreaterThan(990);
    expect(d).toBeLessThan(1010);
  });
  it("fator 1,30 arredonda em metros", () => expect(aplicarFator(2500, 130)).toBe(3250));
  it("bairro normalizado sem acento", () => expect(normalizarBairro("  Jardim  AMÉRICA ")).toBe("jardim america"));
});

describe("ordem de quem define a taxa", () => {
  it("faixa de distância (linha reta × fator)", () => {
    const c = cotar({ bairro: "Centro", numero: "10", ...perto }, regras);
    expect(c.status).toBe("ok");
    expect(c.origem_taxa).toBe("faixa");
    expect(c.taxa_centavos).toBe(700);
    expect(c.distancia_m).toBeGreaterThan(3000);
  });
  it("bairro cadastrado vence a faixa", () => {
    const c = cotar({ bairro: "jardim america", cidade: "Sao Paulo", numero: "5", ...perto }, regras);
    expect(c).toMatchObject({ status: "ok", origem_taxa: "bairro", taxa_centavos: 900, bairro_id: 10 });
  });
  it("bairro 'não atende' bloqueia", () => {
    expect(cotar({ bairro: "Vila Distante", numero: "1", ...perto }, regras).status).toBe("bairro_nao_atendido");
  });
  it("manual vence tudo", () => {
    const c = cotar({ bairro: "Jardim América", numero: "5", ...perto }, regras);
    expect(taxaFinal(c, 300)).toEqual({ taxa: 300, origem: "manual" });
    expect(taxaFinal(c, null)).toEqual({ taxa: 900, origem: "bairro" });
  });
  it("sem coordenada pede taxa manual (sem taxa padrão)", () => {
    const c = cotar({ bairro: "Centro", numero: "1" }, regras);
    expect(c.status).toBe("sem_coordenada");
    expect(taxaFinal(c, null)).toEqual({ taxa: null, origem: null });
  });
  it("sem número bloqueia, a menos que marque 'sem número'", () => {
    expect(cotar({ bairro: "Centro", ...perto }, regras).status).toBe("sem_numero");
    expect(cotar({ bairro: "Centro", sem_numero: true, ...perto }, regras).status).toBe("ok");
  });
  it("acima do raio máximo é fora da área", () => {
    const longe = { lat: origem.lat + 0.07, lng: origem.lng };
    expect(cotar({ bairro: "Longe", numero: "1", ...longe }, regras).status).toBe("fora_da_area");
  });
  it("sem faixas e sem bairros: sem configuração", () => {
    expect(cotar({ bairro: "X", numero: "1", ...perto }, { ...regras, faixas: [], bairros: [] }).status).toBe("sem_configuracao");
  });
});

describe("taxa manual e PIN (limite do desconto)", () => {
  it("baixar até o limite não pede PIN; acima pede", () => {
    expect(taxaManualPrecisaPin(1000, 500, 500)).toBe(false);
    expect(taxaManualPrecisaPin(1000, 499, 500)).toBe(true);
  });
  it("aumentar a taxa nunca pede PIN; sem taxa calculada também não", () => {
    expect(taxaManualPrecisaPin(700, 1500, 500)).toBe(false);
    expect(taxaManualPrecisaPin(null, 0, 500)).toBe(false);
  });
});
