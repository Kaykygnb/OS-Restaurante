/** Contas do painel de relatórios (prancha 15). Puras, testadas no Vitest. */

/** Variação em % do período anterior. null quando não há base para comparar. */
export function variacao(atual: number, anterior: number): number | null {
  if (!anterior) return null;
  return Math.round(((atual - anterior) / anterior) * 1000) / 10;
}

export function textoVariacao(v: number | null): string {
  if (v == null) return "sem base anterior";
  if (v === 0) return "igual ao anterior";
  return `${v > 0 ? "+" : ""}${String(v).replace(".", ",")}% vs anterior`;
}

const iso = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);

export type AtalhoPeriodo = "hoje" | "ontem" | "7" | "mes" | "30";

/** Datas (YYYY-MM-DD, horário de Brasília) de cada atalho de período. */
export function datasDoPeriodo(p: AtalhoPeriodo, agora = new Date()): { de: string; ate: string } {
  const hoje = iso(agora);
  const menos = (n: number) => iso(new Date(new Date(`${hoje}T12:00:00-03:00`).getTime() - n * 86_400_000));
  if (p === "hoje") return { de: hoje, ate: hoje };
  if (p === "ontem") return { de: menos(1), ate: menos(1) };
  if (p === "7") return { de: menos(6), ate: hoje };
  if (p === "30") return { de: menos(29), ate: hoje };
  return { de: `${hoje.slice(0, 7)}-01`, ate: hoje };
}

/** "2026-11-26" → "26/11"; com semana "23/11–29/11"; mês "nov/26". */
export function rotuloDia(d: string) {
  return `${d.slice(8, 10)}/${d.slice(5, 7)}`;
}
export function rotuloMes(d: string) {
  const m = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"][Number(d.slice(5, 7)) - 1];
  return `${m}/${d.slice(2, 4)}`;
}

/** CSV com ; e BOM (abre direto no Excel em português). */
export function paraCsv(linhas: (string | number)[][]): string {
  const esc = (v: string | number) => {
    const t = String(v);
    return /[;"\n]/.test(t) ? `"${t.replaceAll('"', '""')}"` : t;
  };
  return "\uFEFF" + linhas.map((l) => l.map(esc).join(";")).join("\n");
}
