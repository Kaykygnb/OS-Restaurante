import { distanciaComFator, distanciaMetros } from "./geo.js";
import { normalizarNome } from "../util/texto.js";

export type EnderecoCotar = {
  numero?: string | null;
  sem_numero?: boolean;
  bairro?: string | null;
  cidade?: string | null;
  lat?: number | null;
  lng?: number | null;
};

export type FaixaCotar = { id: number; ate_m: number; taxa_centavos: number; ativo: boolean };
export type BairroCotar = {
  id: number;
  nome_normalizado: string;
  cidade: string;
  taxa_centavos: number;
  atende: boolean;
  ativo: boolean;
};

export type ResultadoCotacao = {
  status:
    | "ok"
    | "fora_da_area"
    | "sem_numero"
    | "sem_coordenada"
    | "bairro_nao_atendido"
    | "sem_configuracao";
  distancia_m?: number;
  taxa_centavos?: number;
  origem_taxa?: "bairro" | "faixa" | "padrao";
  faixa_id?: number;
  bairro_id?: number;
  avisos: string[];
};

export function cotarEntrega(opts: {
  endereco: EnderecoCotar;
  origemLat: number | null;
  origemLng: number | null;
  raioMaxM: number | null;
  fator: number;
  taxaPadrao: number;
  faixas: FaixaCotar[];
  bairros: BairroCotar[];
}): ResultadoCotacao {
  const avisos: string[] = [];
  const numero = opts.endereco.numero?.trim() ?? "";
  if (!numero && !opts.endereco.sem_numero) {
    return {
      status: "sem_numero",
      avisos: ["Informe o número ou marque o endereço como sem número."],
    };
  }

  const bairroNome = normalizarNome(opts.endereco.bairro ?? "");
  const cidade = normalizarNome(opts.endereco.cidade ?? "");
  const bairro = opts.bairros.find((b) => {
    if (!b.ativo) return false;
    if (b.nome_normalizado !== bairroNome) return false;
    if (cidade && normalizarNome(b.cidade) !== cidade) return false;
    return true;
  });

  if (bairro && !bairro.atende) {
    return {
      status: "bairro_nao_atendido",
      bairro_id: bairro.id,
      avisos: ["Esse bairro está marcado como não atendido."],
    };
  }

  if (bairro) {
    return {
      status: "ok",
      taxa_centavos: bairro.taxa_centavos,
      origem_taxa: "bairro",
      bairro_id: bairro.id,
      avisos,
    };
  }

  const lat = opts.endereco.lat;
  const lng = opts.endereco.lng;
  const temDestino = lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng);
  const temOrigem =
    opts.origemLat != null &&
    opts.origemLng != null &&
    Number.isFinite(opts.origemLat) &&
    Number.isFinite(opts.origemLng);

  if (!temDestino || !temOrigem) {
    return {
      status: "sem_coordenada",
      avisos: ["Sem coordenadas: informe a taxa de entrega manualmente."],
    };
  }

  const faixas = opts.faixas.filter((f) => f.ativo).sort((a, b) => a.ate_m - b.ate_m || a.id - b.id);
  if (!faixas.length && opts.raioMaxM == null) {
    return {
      status: "sem_configuracao",
      avisos: ["Configure as faixas de entrega ou o raio máximo."],
    };
  }

  const reta = distanciaMetros(opts.origemLat!, opts.origemLng!, lat!, lng!);
  const distancia_m = distanciaComFator(reta, opts.fator);
  if (opts.raioMaxM != null && distancia_m > opts.raioMaxM) {
    return {
      status: "fora_da_area",
      distancia_m,
      avisos: ["O endereço fica fora da área de entrega."],
    };
  }

  const faixa = faixas.find((f) => f.ate_m >= distancia_m);
  if (faixa) {
    return {
      status: "ok",
      distancia_m,
      taxa_centavos: faixa.taxa_centavos,
      origem_taxa: "faixa",
      faixa_id: faixa.id,
      avisos,
    };
  }

  if (faixas.length) {
    return {
      status: "fora_da_area",
      distancia_m,
      avisos: ["A distância passa da última faixa de entrega."],
    };
  }

  return {
    status: "ok",
    distancia_m,
    taxa_centavos: Math.max(0, opts.taxaPadrao),
    origem_taxa: "padrao",
    avisos,
  };
}
