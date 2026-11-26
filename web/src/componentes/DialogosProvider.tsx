import { useEffect, useRef, useState, type ReactNode } from "react";
import Dialogo from "./ui/Dialogo";
import { registrarDialogos, type PedidoDialogo } from "../servicos/dialogos";
export default function DialogosProvider({ children }: { children: ReactNode }) {
  const [pedido, setPedido] = useState<PedidoDialogo | null>(null);
  const [valor, setValor] = useState("");
  const fila = useRef<PedidoDialogo[]>([]);
  const atual = useRef<PedidoDialogo | null>(null);
  useEffect(() => {
    registrarDialogos(p => { if (atual.current) fila.current.push(p); else { atual.current = p; setValor(p.valor ?? ""); setPedido(p); } });
    return () => { registrarDialogos(null); atual.current?.resolver(null); fila.current.forEach(p => p.resolver(null)); fila.current = []; atual.current = null; };
  }, []);
  function concluir(resultado: string | boolean | null) {
    atual.current?.resolver(resultado);
    const prox = fila.current.shift() ?? null; atual.current = prox; setValor(prox?.valor ?? ""); setPedido(prox);
  }
  const acao = pedido?.perigo ? pedido.titulo.match(/^(Excluir|Desativar|Remover|Descartar|Estornar|Cancelar)/i)?.[0] ?? "Confirmar ação" : "Confirmar ação";
  return <>{children}{pedido ? <Dialogo titulo={pedido.titulo} onFechar={() => concluir(null)} pe={<>
    <button type="button" className="btn" onClick={() => concluir(null)}>Cancelar</button>
    <button type="button" className={`btn ${pedido.perigo ? "btn-perigo" : "btn-pri"}`} onClick={() => concluir(pedido.tipo === "texto" ? valor : true)}>{pedido.tipo === "texto" ? "Salvar alteração" : acao}</button>
  </>}>
    {pedido.tipo === "texto" ? <label className="fld"><span>{pedido.titulo}</span><input value={valor} onChange={e => setValor(e.target.value)} /></label> : <p>Confira a ação acima antes de continuar.</p>}
  </Dialogo> : null}</>;
}
