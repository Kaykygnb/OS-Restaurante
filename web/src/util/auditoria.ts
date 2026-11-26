/** Rótulos da auditoria (prancha 19). O servidor manda `tipo` técnico; a tela mostra em português. */
export const ROTULO_EVENTO: Record<string, string> = {
  "atendimento.aberto": "Abriu conta",
  "atendimento.cancelado": "Cancelou conta",
  "atendimento.fechado": "Fechou conta",
  "atendimento.juntado": "Juntou contas",
  "atendimento.transferido": "Trocou de mesa",
  "auditoria.exportada": "Exportou a auditoria",
  "auditoria.verificada": "Conferiu a integridade",
  "caixa.aberto": "Abriu caixa",
  "caixa.fechado": "Fechou caixa",
  "caixa.fechado_com_diferenca": "Fechou caixa com diferença",
  "caixa.gaveta_falhou": "Gaveta não abriu",
  "caixa.gaveta_sem_venda": "Abriu gaveta sem venda",
  "caixa.sangria": "Sangria",
  "caixa.suprimento": "Suprimento",
  "cliente.desativado": "Desativou cliente",
  "cliente.telefone_alterado": "Mudou telefone de cliente",
  "config.alterada": "Mudou configuração",
  "desconto.conta": "Desconto na conta",
  "desconto.item": "Desconto no item",
  "entrega.forcada": "Forçou entrega",
  "entrega.taxa_manual": "Taxa de entrega manual",
  "estoque.entrada": "Entrada no estoque",
  "estoque.perda": "Perda no estoque",
  "estoque.correcao": "Correção de estoque",
  "estoque.esgotados_resetados": "Esgotados voltaram",
  "impressao.reimpressao": "Reimprimiu",
  "item.cancelado": "Cancelou item",
  "login.ok": "Entrou no sistema",
  "login.saiu": "Saiu do sistema",
  "login.falhou": "Login errado",
  "login.fora_do_horario": "Entrou fora do horário",
  "pagamento.estornado": "Estornou pagamento",
  "pagamento.registrado": "Recebeu pagamento",
  "pedido.cancelado": "Cancelou pedido",
  "pedido.enviado": "Enviou pedido",
  "pedido.status": "Mudou status do pedido",
  "pin.falhou": "PIN errado",
  "promocao.criada": "Criou promoção",
  "promocao.encerrada": "Encerrou promoção",
  "promocao.alterada": "Mudou promoção",
  "servico.alterado": "Mudou taxa de serviço",
  "venda_rapida.concluida": "Venda rápida",
};

export const rotuloEvento = (tipo: string) => ROTULO_EVENTO[tipo] ?? tipo;

/** Filtros da tela: grupos de tipos que o dono procura mais. */
export const GRUPOS_EVENTO: { rotulo: string; tipos: string[] }[] = [
  { rotulo: "Cancelamentos", tipos: ["item.cancelado", "pedido.cancelado", "atendimento.cancelado"] },
  { rotulo: "Descontos", tipos: ["desconto.conta", "desconto.item"] },
  { rotulo: "Caixa", tipos: ["caixa.aberto", "caixa.fechado", "caixa.fechado_com_diferenca", "caixa.sangria", "caixa.suprimento", "caixa.gaveta_sem_venda"] },
  { rotulo: "Entrega", tipos: ["entrega.taxa_manual", "entrega.forcada"] },
  { rotulo: "Estornos e reimpressões", tipos: ["pagamento.estornado", "impressao.reimpressao"] },
  { rotulo: "Acesso", tipos: ["login.falhou", "login.fora_do_horario", "pin.falhou"] },
];

/** "R$ 15,00" a partir de valor_antes/valor_depois (texto livre do servidor ou JSON). */
export function textoValor(v: string | null | undefined): string {
  if (v == null || v === "") return "—";
  try {
    const o = JSON.parse(v) as unknown;
    if (o && typeof o === "object") return Object.entries(o as Record<string, unknown>).map(([k, x]) => `${k}: ${String(x)}`).join(" · ");
    return String(o);
  } catch {
    return v;
  }
}
