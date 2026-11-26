export type UsuarioSessao = {
  id: number;
  nome: string;
  tipo: string;
};

export function lerToken(): string | null {
  return localStorage.getItem("token");
}

export function lerUsuario(): UsuarioSessao | null {
  const raw = localStorage.getItem("usuario");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UsuarioSessao;
  } catch {
    return null;
  }
}

export function estaLogado(): boolean {
  return Boolean(lerToken());
}

export function sair(): void {
  localStorage.removeItem("token");
  localStorage.removeItem("usuario");
}

/** Tela inicial de cada perfil: o garçom cai nas Mesas, a cozinha na fila. */
export function telaInicial(tipo?: string | null): string {
  if (tipo === "COZINHEIRO") return "/painel/pedidos?aba=cozinha";
  if (tipo === "ATENDENTE") return "/painel/mesas";
  return "/painel";
}

/** Perfis que usam mesas, contas e caixa (igual ao authOps do servidor). */
export const PERFIS_OPERACAO = ["ROOT", "ADMIN", "GERENTE", "ATENDENTE"];
export const PERFIS_GESTAO = ["ROOT", "ADMIN", "GERENTE"];
