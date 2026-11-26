export type PedidoDialogo = { titulo: string; texto?: string; valor?: string; tipo: "confirmar" | "texto"; perigo?: boolean; resolver: (valor: string | boolean | null) => void };
let apresentar: ((p: PedidoDialogo) => void) | null = null;
export function registrarDialogos(fn: typeof apresentar) { apresentar = fn; }
export function confirmar(titulo: string, perigo = /^(Excluir|Desativar|Remover|Descartar|Estornar|Cancelar (conta|pedido|trabalho|linha))/i.test(titulo)): Promise<boolean> {
  return new Promise(resolve => { if (!apresentar) return resolve(false); apresentar({ titulo, tipo: "confirmar", perigo, resolver: v => resolve(v === true) }); });
}
export function solicitarTexto(titulo: string, valor = ""): Promise<string | null> {
  return new Promise(resolve => { if (!apresentar) return resolve(null); apresentar({ titulo, valor, tipo: "texto", resolver: v => resolve(typeof v === "string" ? v : null) }); });
}
