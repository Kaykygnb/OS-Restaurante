/**
 * Regras da taxa de entrega (CONTRATOS.md §4). Quem decide é o servidor; este arquivo serve para
 * o mock de desenvolvimento e para a tela explicar de onde veio a taxa. Puro e testado.
 *
 * Ordem (da mais forte para a mais fraca):
 * 1. taxa manual no pedido;  2. bairro cadastrado;  3. faixa de distância;  4. sem coordenada → pede taxa manual.
 */
import type { BairroEntrega, Cotacao, FaixaEntrega, StatusEntrega } from "../servicos/contratos";

const R_TERRA_M = 6371000;

/** Distância em linha reta (haversine), em metros inteiros. */
export function distanciaLinhaReta(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R_TERRA_M * Math.asin(Math.sqrt(a)));
}

/** Linha reta × fator (130 = ×1,30), arredondado em metros. */
export const aplicarFator = (m: number, fator: number) => Math.round((m * fator) / 100);

/** Sem acento, minúsculo, espaços únicos — igual ao `nome_normalizado` do servidor. */
export function normalizarBairro(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export type EntradaCotacao = {
  bairro: string;
  cidade?: string;
  numero?: string;
  sem_numero?: boolean;
  lat?: number | null;
  lng?: number | null;
};
export type RegrasEntrega = {
  origem: { lat: number | null; lng: number | null };
  fator: number;
  raio_max_m: number | null;
  faixas: FaixaEntrega[];
  bairros: BairroEntrega[];
};

export function cotar(e: EntradaCotacao, r: RegrasEntrega): Cotacao {
  const avisos: string[] = [];
  if (!e.numero?.trim() && !e.sem_numero) {
    return { status: "sem_numero", avisos: ["Falta o número da casa. Se não tiver, marque “Sem número”."] };
  }
  const nb = normalizarBairro(e.bairro || "");
  const bairro = r.bairros.find(
    (b) => b.ativo && normalizarBairro(b.nome) === nb && (!e.cidade || !b.cidade || normalizarBairro(b.cidade) === normalizarBairro(e.cidade)),
  );
  let distancia_m: number | undefined;
  const temOrigem = r.origem.lat != null && r.origem.lng != null;
  const temCoord = e.lat != null && e.lng != null;
  if (temOrigem && temCoord) {
    distancia_m = aplicarFator(distanciaLinhaReta(r.origem.lat!, r.origem.lng!, e.lat!, e.lng!), r.fator);
  }
  if (bairro) {
    if (!bairro.atende) return { status: "bairro_nao_atendido", bairro_id: bairro.id, distancia_m, avisos: [`O bairro ${bairro.nome} está marcado como “não atende”.`] };
    return { status: "ok", taxa_centavos: bairro.taxa_centavos, origem_taxa: "bairro", bairro_id: bairro.id, distancia_m, avisos };
  }
  const faixas = r.faixas.filter((f) => f.ativo).sort((a, b) => a.ate_m - b.ate_m);
  if (!faixas.length && !r.bairros.length) return { status: "sem_configuracao", avisos: ["A entrega ainda não foi configurada (Configurações › Entrega)."] };
  if (!temOrigem) return { status: "sem_configuracao", avisos: ["Falta o endereço do restaurante (origem) em Configurações › Entrega."] };
  if (distancia_m == null) {
    return { status: "sem_coordenada", avisos: ["Não deu para localizar o endereço no mapa. Digite a taxa à mão."] };
  }
  if (r.raio_max_m != null && distancia_m > r.raio_max_m) {
    return { status: "fora_da_area", distancia_m, avisos: [`Fora da área de entrega (máximo ${Math.round(r.raio_max_m / 100) / 10} km).`] };
  }
  const faixa = faixas.find((f) => f.ate_m >= distancia_m);
  if (!faixa) return { status: "fora_da_area", distancia_m, avisos: ["Mais longe que a última faixa de entrega."] };
  return { status: "ok", distancia_m, taxa_centavos: faixa.taxa_centavos, origem_taxa: "faixa", faixa_id: faixa.id, avisos };
}

/** Taxa final do pedido: a manual vence tudo. */
export function taxaFinal(c: Cotacao | null, manualCentavos: number | null): { taxa: number | null; origem: "manual" | "bairro" | "faixa" | "padrao" | null } {
  if (manualCentavos != null && Number.isFinite(manualCentavos)) return { taxa: manualCentavos, origem: "manual" };
  if (c?.status === "ok" && c.taxa_centavos != null) return { taxa: c.taxa_centavos, origem: c.origem_taxa ?? null };
  return { taxa: null, origem: null };
}

/**
 * Decisão 5: taxa manual sem PIN até o limite do desconto. O PIN entra quando a taxa manual fica
 * MENOR que a calculada por mais que o limite (é um desconto na entrega). Sem taxa calculada, compara com 0 → nunca pede.
 */
export function taxaManualPrecisaPin(calculada: number | null | undefined, manual: number, limiteSemPin: number): boolean {
  if (calculada == null) return false;
  return calculada - manual > limiteSemPin;
}

/** Texto curto para cada status (a tela decide pelo status, nunca pelo texto do servidor). */
export const TEXTO_STATUS: Record<StatusEntrega, { titulo: string; tom: "ok" | "warn" | "err" }> = {
  ok: { titulo: "Entrega OK", tom: "ok" },
  fora_da_area: { titulo: "Fora da área de entrega", tom: "err" },
  sem_numero: { titulo: "Falta o número", tom: "warn" },
  sem_coordenada: { titulo: "Endereço não localizado: digite a taxa", tom: "warn" },
  bairro_nao_atendido: { titulo: "Bairro não atendido", tom: "err" },
  sem_configuracao: { titulo: "Entrega não configurada", tom: "warn" },
};

export const TEXTO_ORIGEM: Record<string, string> = {
  manual: "taxa digitada à mão",
  bairro: "bairro cadastrado",
  faixa: "faixa de distância",
  padrao: "taxa padrão",
};
