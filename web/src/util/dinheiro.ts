/** Converte texto em reais (pt-BR) para centavos. Aceita "12,50", "1.250,00", "1.250". */
export function reaisParaCentavos(valor: string | number): number {
  if (typeof valor === "number") return Math.round(valor * 100);
  let limpo = valor.replace(/\s/g, "").replace(/R\$/gi, "").trim();
  if (!limpo) return NaN;

  const temVirgula = limpo.includes(",");
  const temPonto = limpo.includes(".");

  if (temVirgula && temPonto) {
    // 1.250,00 → milhar ponto, decimal vírgula
    limpo = limpo.replace(/\./g, "").replace(",", ".");
  } else if (temVirgula) {
    // 12,50 → decimal vírgula
    limpo = limpo.replace(",", ".");
  } else if (temPonto) {
    const partes = limpo.split(".");
    if (partes.length > 2) {
      // 1.250.000
      limpo = limpo.replace(/\./g, "");
    } else {
      const dec = partes[1] ?? "";
      // 1.250 → milhar (3 dígitos); 12.5 / 12.50 → decimal
      if (dec.length === 3) limpo = partes[0] + partes[1];
      else limpo = limpo; // decimal com ponto
    }
  }

  const n = Number(limpo);
  if (!Number.isFinite(n)) return NaN;
  return Math.round(n * 100);
}

export function formatarReais(centavos: number | null | undefined): string {
  if (centavos === null || centavos === undefined) return "—";
  return (centavos / 100).toLocaleString("pt-BR", {
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

export function centavosParaCampo(centavos: number): string {
  return (centavos / 100).toFixed(2).replace(".", ",");
}
