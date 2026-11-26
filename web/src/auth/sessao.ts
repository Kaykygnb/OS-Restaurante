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
