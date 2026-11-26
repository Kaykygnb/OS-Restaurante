/** Formatadores de tela (pt-BR). Puros, testados no Vitest. */

export const soDigitos = (t: string | null | undefined) => (t ?? "").replace(/\D/g, "");

/** "11987654321" → "(11) 98765-4321"; "1133334444" → "(11) 3333-4444". Parcial enquanto digita. */
export function formatarTelefone(t: string | null | undefined): string {
  const d = soDigitos(t).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  const ddd = d.slice(0, 2);
  const resto = d.slice(2);
  if (resto.length <= 4) return `(${ddd}) ${resto}`;
  const corte = d.length === 11 ? 5 : 4;
  return `(${ddd}) ${resto.slice(0, corte)}-${resto.slice(corte)}`;
}

/** Telefone com DDD: 10 (fixo) ou 11 (celular) dígitos. */
export const telefoneValido = (t: string) => {
  const n = soDigitos(t).length;
  return n === 10 || n === 11;
};

/** "01310000" → "01310-000". */
export function formatarCep(c: string | null | undefined): string {
  const d = soDigitos(c).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

/** 850 → "850 m"; 3240 → "3,2 km"; 12000 → "12 km". */
export function formatarDistancia(m: number | null | undefined): string {
  if (m == null || !Number.isFinite(m)) return "—";
  if (m < 1000) return `${Math.round(m)} m`;
  const km = m / 1000;
  return `${km.toLocaleString("pt-BR", { maximumFractionDigits: km >= 10 ? 0 : 1 })} km`;
}

/** 130 → "1,30". */
export const formatarFator = (f: number) => (f / 100).toFixed(2).replace(".", ",");

/** Hora local de um instante UTC do servidor: "14:05". */
export function formatarHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** "26/11 14:05". */
export function formatarDataHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} ${formatarHora(iso)}`;
}

/** Endereço numa linha: "Rua das Flores, 120 · ap 32 · Centro". */
export function enderecoEmLinha(e: {
  logradouro?: string;
  numero?: string | null;
  sem_numero?: boolean;
  complemento?: string | null;
  bairro?: string;
}): string {
  const num = e.sem_numero ? "s/n" : e.numero || "";
  const rua = [e.logradouro, num].filter(Boolean).join(", ");
  return [rua, e.complemento, e.bairro].filter(Boolean).join(" · ");
}

/** Iniciais para o avatar: "Maria Souza" → "M". */
export const inicial = (nome: string | null | undefined) => (nome?.trim()?.[0] ?? "?").toUpperCase();
