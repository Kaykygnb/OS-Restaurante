/** Regras de texto das promoções (prancha 12). Puras, testadas no Vitest. */
import { formatarReais } from "./dinheiro";

export type TipoPromo = "PERCENTUAL" | "VALOR" | "PRECO_FIXO" | "LEVE_PAGUE";
export type PromoRegra = {
  tipo: string;
  percentual: number | null;
  valor_centavos: number | null;
  preco_fixo_centavos: number | null;
  leve: number | null;
  pague: number | null;
  dias_semana: number;
  hora_inicio_min: number | null;
  hora_fim_min: number | null;
  inicio_em: string | null;
  fim_em: string | null;
};

/** Bits do servidor: domingo = 1 << 0 … sábado = 1 << 6. */
export const DIAS = [
  { bit: 1 << 1, curto: "Seg" },
  { bit: 1 << 2, curto: "Ter" },
  { bit: 1 << 3, curto: "Qua" },
  { bit: 1 << 4, curto: "Qui" },
  { bit: 1 << 5, curto: "Sex" },
  { bit: 1 << 6, curto: "Sáb" },
  { bit: 1 << 0, curto: "Dom" },
];

export function textoDias(mask: number): string {
  if ((mask & 127) === 127) return "todos os dias";
  if (mask === 0) return "nenhum dia";
  const sel = DIAS.filter((d) => mask & d.bit);
  // Sequência contínua (na ordem seg→dom) vira "seg a sex".
  const idx = sel.map((d) => DIAS.indexOf(d));
  const continua = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
  if (sel.length >= 3 && continua) return `${sel[0].curto.toLowerCase()} a ${sel[sel.length - 1].curto.toLowerCase()}`;
  return sel.map((d) => d.curto.toLowerCase()).join(", ");
}

export const minParaHora = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
export function horaParaMin(h: string): number | null {
  const r = /^(\d{1,2}):(\d{2})$/.exec(h.trim());
  if (!r) return null;
  const v = Number(r[1]) * 60 + Number(r[2]);
  return v >= 0 && v < 24 * 60 ? v : null;
}

export function textoRegra(p: Pick<PromoRegra, "tipo" | "percentual" | "valor_centavos" | "preco_fixo_centavos" | "leve" | "pague">): string {
  switch (p.tipo) {
    case "PERCENTUAL":
      return `${p.percentual ?? 0}% de desconto`;
    case "VALOR":
      return `${formatarReais(p.valor_centavos ?? 0)} a menos`;
    case "PRECO_FIXO":
      return `sai por ${formatarReais(p.preco_fixo_centavos ?? 0)}`;
    case "LEVE_PAGUE":
      return `leve ${p.leve ?? 0}, pague ${p.pague ?? 0}`;
    default:
      return p.tipo;
  }
}

const dataCurta = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });

export function textoQuando(p: Pick<PromoRegra, "dias_semana" | "hora_inicio_min" | "hora_fim_min" | "inicio_em" | "fim_em">): string {
  const partes = [`Vale ${textoDias(p.dias_semana)}`];
  if (p.hora_inicio_min != null && p.hora_fim_min != null) partes.push(`das ${minParaHora(p.hora_inicio_min).replace(":00", "h")} às ${minParaHora(p.hora_fim_min).replace(":00", "h")}`);
  if (p.inicio_em && p.fim_em) partes.push(`de ${dataCurta(p.inicio_em)} a ${dataCurta(p.fim_em)}`);
  else if (p.fim_em) partes.push(`até ${dataCurta(p.fim_em)}`);
  else if (p.inicio_em) partes.push(`a partir de ${dataCurta(p.inicio_em)}`);
  return partes.join(", ");
}

/** Preço de 1 unidade com a promoção (para a prévia). Leve/pague não muda o unitário. */
export function precoComPromo(preco: number, p: Pick<PromoRegra, "tipo" | "percentual" | "valor_centavos" | "preco_fixo_centavos">): number {
  if (p.tipo === "PERCENTUAL") return Math.max(0, Math.round(preco * (1 - (p.percentual ?? 0) / 100)));
  if (p.tipo === "VALOR") return Math.max(0, preco - (p.valor_centavos ?? 0));
  if (p.tipo === "PRECO_FIXO") return Math.min(preco, p.preco_fixo_centavos ?? preco);
  return preco;
}
