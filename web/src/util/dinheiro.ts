/**
 * Dinheiro no front: tudo em centavos (inteiro). Este é o ÚNICO lugar que converte texto ↔ centavos
 * e formata R$ para a tela.
 */

/**
 * Converte o que a pessoa digitou (pt-BR) em centavos. Devolve NaN quando o texto não é um valor válido.
 * Aceita "12,50", "12", "1.250" (milhar), "1.250,00", "R$ 1.250,00" e "12.50" (ponto decimal com 1-2 casas).
 * Recusa negativos, letras e vírgula com mais de 2 casas ("1,250" é ambíguo).
 */
export function reaisParaCentavos(valor: string | number): number {
  if (typeof valor === "number") return Number.isFinite(valor) && valor >= 0 ? Math.round(valor * 100) : NaN;
  let limpo = valor.replace(/\s/g, "").replace(/\u00a0/g, "").replace(/R\$/gi, "").trim();
  if (!limpo) return NaN;
  if (!/^[\d.,]+$/.test(limpo)) return NaN;

  const temVirgula = limpo.includes(",");
  const temPonto = limpo.includes(".");

  if (temVirgula) {
    if (limpo.split(",").length > 2) return NaN;
    const [inteiro, dec = ""] = limpo.split(",");
    if (dec.length > 2) return NaN;
    if (temPonto && !/^\d{1,3}(\.\d{3})+$/.test(inteiro)) return NaN; // 1.250,00 sim; 12.5,00 não
    limpo = `${inteiro.replace(/\./g, "")}.${dec || "0"}`;
  } else if (temPonto) {
    const partes = limpo.split(".");
    if (partes.length > 2 || partes[1].length === 3) {
      // 1.250 / 1.250.000 → milhar
      if (!/^\d{1,3}(\.\d{3})+$/.test(limpo)) return NaN;
      limpo = limpo.replace(/\./g, "");
    } else if (partes[1].length > 2) {
      return NaN;
    }
    // senão: 12.5 / 12.50 → ponto decimal (teclado numérico do celular)
  }

  const n = Number(limpo);
  if (!Number.isFinite(n) || n < 0) return NaN;
  return Math.round(n * 100);
}

/** Só para a tela: "R$ 1.250,00". */
export function formatarReais(centavos: number | null | undefined): string {
  return ((centavos ?? 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/** Valor pra cupom ESC/POS: espaço normal, sem NBSP. */
export function formatarReaisCupom(centavos: number): string {
  const neg = centavos < 0;
  const abs = Math.abs(Math.round(centavos));
  const reais = Math.floor(abs / 100);
  const cents = String(abs % 100).padStart(2, "0");
  const inteiro = reais.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${neg ? "-" : ""}R$ ${inteiro},${cents}`;
}

/** Centavos para preencher um campo de texto: 1050 → "10,50". */
export function centavosParaCampo(centavos: number | null | undefined): string {
  return ((centavos ?? 0) / 100).toFixed(2).replace(".", ",");
}
