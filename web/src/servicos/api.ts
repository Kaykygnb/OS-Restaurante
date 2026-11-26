export type ApiErro = Error & { status?: number; dados?: Record<string, unknown>; semConexao?: boolean };

export type OpcoesApi = RequestInit & {
  /** Tempo máximo em ms (padrão 15 s). */
  tempoLimiteMs?: number;
  /**
   * Chave contra envio repetido (cabeçalho Idempotency-Key). Gere uma por ação com
   * `novaChaveIdempotencia()` e reaproveite a mesma chave se a pessoa tentar de novo.
   */
  chaveIdempotencia?: string;
};

export const MSG_SEM_CONEXAO =
  "Sem conexão com o servidor (PC do caixa). Confira se ele está ligado e na mesma rede, e tente de novo.";
export const MSG_TEMPO_ESGOTADO =
  "O servidor demorou para responder. Confira a conexão e veja se a ação já aparece antes de tentar de novo.";

/** Gera uma chave única. Funciona também em http na rede local, onde crypto.randomUUID não existe. */
export function novaChaveIdempotencia(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === "function") {
    try {
      return c.randomUUID();
    } catch {
      /* contexto não seguro: cai no plano B */
    }
  }
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") c.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function criarErro(mensagem: string, extra: Partial<ApiErro> = {}): ApiErro {
  return Object.assign(new Error(mensagem), extra) as ApiErro;
}

let aoExpirarSessao: (() => void) | null = null;
/** O App registra o que fazer quando o servidor responde 401 (sessão expirada ou usuário desativado). */
export function registrarAoExpirarSessao(fn: (() => void) | null) {
  aoExpirarSessao = fn;
}

export async function api(caminho: string, opcoes: OpcoesApi = {}) {
  const { tempoLimiteMs = 15000, chaveIdempotencia, ...init } = opcoes;
  const token = localStorage.getItem("token");
  const controle = new AbortController();
  let estourou = false;
  const timer = setTimeout(() => {
    estourou = true;
    controle.abort();
  }, tempoLimiteMs);
  if (init.signal) {
    if (init.signal.aborted) controle.abort();
    else init.signal.addEventListener("abort", () => controle.abort(), { once: true });
  }

  let resposta: Response;
  try {
    resposta = await fetch(`/api${caminho}`, {
      ...init,
      signal: controle.signal,
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(chaveIdempotencia ? { "Idempotency-Key": chaveIdempotencia } : {}),
        ...init.headers,
      },
    });
  } catch (e) {
    if (estourou) throw criarErro(MSG_TEMPO_ESGOTADO, { semConexao: true });
    if ((e as Error)?.name === "AbortError") throw e;
    throw criarErro(MSG_SEM_CONEXAO, { semConexao: true });
  } finally {
    clearTimeout(timer);
  }

  // O proxy do Vite (e um Nginx na frente) responde 502/503/504 quando o servidor está desligado.
  if ([502, 503, 504].includes(resposta.status)) {
    throw criarErro(MSG_SEM_CONEXAO, { status: resposta.status, semConexao: true });
  }

  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    if (resposta.status === 401 && caminho !== "/login" && token) {
      aoExpirarSessao?.();
    }
    const msg =
      (dados as { erro?: string }).erro ||
      (resposta.status === 401
        ? "Sua sessão expirou. Entre de novo."
        : resposta.status === 403
          ? "Seu perfil não tem permissão para isso."
          : "Erro no servidor");
    throw criarErro(msg, { status: resposta.status, dados: dados as Record<string, unknown> });
  }
  return dados;
}
