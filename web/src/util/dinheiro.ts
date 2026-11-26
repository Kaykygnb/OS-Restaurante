export function reaisParaCentavos(valor: string | number): number {
  if (typeof valor === "number") return Math.round(valor * 100);
  const limpo = valor.replace(/\s/g, "").replace("R$", "").replace(",", ".");
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
