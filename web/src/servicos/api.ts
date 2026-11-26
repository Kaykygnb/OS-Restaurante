export type ApiErro = Error & { status?: number; dados?: Record<string, unknown> };

export async function api(caminho: string, opcoes: RequestInit = {}) {
  const token = localStorage.getItem("token");
  const resposta = await fetch(`/api${caminho}`, {
    ...opcoes,
    headers: {
      ...(opcoes.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opcoes.headers,
    },
  });
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    const erro = new Error((dados as { erro?: string }).erro || "Erro no servidor") as ApiErro;
    erro.status = resposta.status;
    erro.dados = dados as Record<string, unknown>;
    throw erro;
  }
  return dados;
}
