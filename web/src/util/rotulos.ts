/** Textos que aparecem na tela no lugar dos valores internos do servidor. */

const TIPO_ATENDIMENTO: Record<string, string> = {
  MESA: "Mesa",
  BALCAO: "Balcão",
  RETIRADA: "Retirada",
  ENTREGA: "Entrega",
  VENDA_RAPIDA: "Venda rápida",
};

const STATUS_ATENDIMENTO: Record<string, string> = {
  ABERTO: "Aberta",
  FECHADO: "Fechada",
  CANCELADO: "Cancelada",
};

const STATUS_PEDIDO: Record<string, string> = {
  ENVIADO: "Na fila",
  PREPARO: "Em preparo",
  PRONTO: "Pronto",
  ENTREGUE: "Entregue",
  CANCELADO: "Cancelado",
};

const PERFIL: Record<string, string> = {
  ROOT: "Suporte",
  ADMIN: "Administrador",
  GERENTE: "Gerente",
  ATENDENTE: "Atendente",
  COZINHEIRO: "Cozinha",
  ENTREGADOR: "Entregador",
};

const DOCUMENTO: Record<string, string> = {
  CANCELAMENTO: "Cancelamento",
  COMPROVANTE: "Comprovante de pagamento",
  CONTA: "Pré-conta",
  PRODUCAO: "Produção (cozinha/bar)",
  REIMPRESSAO: "Reimpressão",
  RELATORIO_CAIXA: "Relatório de caixa",
};

const MOVIMENTACAO: Record<string, string> = {
  SANGRIA: "Sangria registrada",
  SUPRIMENTO: "Suprimento registrado",
};

export const rotuloTipo = (t?: string | null) => (t ? (TIPO_ATENDIMENTO[t] ?? t) : "");
export const rotuloStatusConta = (s?: string | null) => (s ? (STATUS_ATENDIMENTO[s] ?? s) : "");
export const rotuloStatusPedido = (s?: string | null) => (s ? (STATUS_PEDIDO[s] ?? s) : "");
export const rotuloPerfil = (t?: string | null) => (t ? (PERFIL[t] ?? t) : "");
export const rotuloDocumento = (t?: string | null) => (t ? (DOCUMENTO[t] ?? t) : "");
export const rotuloMovimentacao = (t?: string | null) => (t ? (MOVIMENTACAO[t] ?? t) : "");

/** "Mesa 5" quando tem mesa; senão o tipo ("Balcão", "Entrega"…). */
export function tituloAtendimento(at: { mesa?: { numero: number } | null; tipo_atendimento?: string } | null) {
  if (!at) return "";
  return at.mesa ? `Mesa ${at.mesa.numero}` : rotuloTipo(at.tipo_atendimento);
}

/** Nome do adicional para o chip: "Bacon" (variante Padrão) ou "Bacon · Duplo". */
export function nomeAdicional(adicional: string, variante: string) {
  const v = variante.trim().toLowerCase();
  if (!v || v === "padrão" || v === "padrao" || v === adicional.trim().toLowerCase()) return adicional;
  return `${adicional} · ${variante}`;
}
