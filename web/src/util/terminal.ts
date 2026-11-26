/** "Nome deste aparelho" (Configurações › Este aparelho). Vai no cabeçalho X-Terminal para a auditoria. */
const CHAVE = "terminal_nome";

export function lerNomeAparelho(): string {
  try {
    return localStorage.getItem(CHAVE)?.trim() ?? "";
  } catch {
    return "";
  }
}

export function salvarNomeAparelho(nome: string): void {
  const limpo = nome.trim().slice(0, 40);
  if (limpo) localStorage.setItem(CHAVE, limpo);
  else localStorage.removeItem(CHAVE);
}

/** Cabeçalhos HTTP só aceitam ISO-8859-1: troca acentos fora dessa faixa e tira quebras de linha. */
export function nomeParaCabecalho(nome: string): string {
  return nome
    .replace(/[\r\n]/g, " ")
    .replace(/[^\x20-\x7e\u00a0-\u00ff]/g, "?")
    .trim();
}
