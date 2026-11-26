export type UsuarioSessao = {
  id: number;
  nome: string;
  tipo: string;
  /** Permissão por usuário (decisão do grupo, 26/11): recebe, abre/fecha caixa e usa a venda rápida. */
  pode_operar_caixa?: boolean;
};

/**
 * Quem pode receber e operar o caixa. Enquanto o servidor não manda `pode_operar_caixa`
 * (PENDENCIAS-CONTRATO.md), gerente para cima pode e os outros não.
 */
export function podeOperarCaixa(u: UsuarioSessao | null = lerUsuario()): boolean {
  if (!u) return false;
  if (typeof u.pode_operar_caixa === "boolean") return u.pode_operar_caixa;
  return ["ROOT", "ADMIN", "GERENTE"].includes(u.tipo);
}

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
  window.dispatchEvent(new Event("osr:sessao-finalizada"));
  for (const key of Object.keys(sessionStorage)) if (key.startsWith("osr:rascunho:")) sessionStorage.removeItem(key);
  localStorage.removeItem("token");
  localStorage.removeItem("usuario");
}

/** Tela inicial de cada perfil: a cozinha cai direto na fila; os outros no Início do perfil (03a–03c). */
export function telaInicial(tipo?: string | null): string {
  if (tipo === "COZINHEIRO") return "/painel/pedidos";
  return "/painel";
}

/** Perfis que usam mesas, contas e caixa (igual ao authOps do servidor). */
export const PERFIS_OPERACAO = ["ROOT", "ADMIN", "GERENTE", "ATENDENTE"];
export const PERFIS_GESTAO = ["ROOT", "ADMIN", "GERENTE"];
