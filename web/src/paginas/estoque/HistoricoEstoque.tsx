import Formulario from "../../componentes/Formulario";
import { confirmar } from "../../servicos/dialogos";
import { useEffect, useState } from "react";
import { api } from "../../servicos/api";
type Movimento = { id: number; item_id: number; tipo: string; qtd_base: number; motivo: string | null; criado_em: string };
type Conferencia = { ok: boolean; diferencas: { item_tipo: string; item_id: number; cache: number; movimentos: number }[] };
export default function HistoricoEstoque() {
  const [produtos, setProdutos] = useState<{produto_variante_id: number; nome: string; variante_nome: string}[]>([]);
  const [item, setItem] = useState("");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [lista, setLista] = useState<Movimento[] | null>(null);
  const [resultado, setResultado] = useState<Conferencia | null>(null);
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { api("/estoque/itens").then(r => setProdutos(r as typeof produtos)).catch(e => setErro((e as Error).message)); }, []);

  async function buscar() {
    if (de && ate && ate < de) return setErro("A data final deve ser igual ou posterior à inicial.");
    const q = new URLSearchParams();
    if (item) q.set("item", item);
    if (de) q.set("de", new Date(`${de}T00:00:00`).toISOString());
    if (ate) q.set("ate", new Date(`${ate}T23:59:59.999`).toISOString());
    setBusy(true); setErro("");
    try { setLista(await api(`/estoque/movimentos?${q}`) as Movimento[]); }
    catch(e) { setErro((e as Error).message); } finally { setBusy(false); }
  }
  async function conferir() {
    if (!(await confirmar("Conferir os saldos e corrigir divergências com base nos movimentos registrados?"))) return;
    setBusy(true); setErro(""); setResultado(null);
    try { setResultado(await api("/estoque/verificar") as Conferencia); window.dispatchEvent(new Event("osr:estoque-mudou")); }
    catch(e) { setErro((e as Error).message); } finally { setBusy(false); }
  }
  return <details className="painel-bloco"><summary>Histórico e conferência de estoque</summary>
    <Formulario onSubmit={e => { e.preventDefault(); void buscar(); }}>
      <div className="config-grid-2">
        <label className="campo"><span>Produto e apresentação</span><select value={item} onChange={e => setItem(e.target.value)}><option value="">Todos os produtos</option>{produtos.map(p => <option key={p.produto_variante_id} value={p.produto_variante_id}>{p.nome} · {p.variante_nome}</option>)}</select></label>
        <label className="campo"><span>De</span><input type="date" value={de} onChange={e => setDe(e.target.value)} /></label>
        <label className="campo"><span>Até</span><input type="date" value={ate} onChange={e => setAte(e.target.value)} /></label>
      </div><button type="submit" className="btn" disabled={busy}>Consultar movimentos</button>
    </Formulario>
    {erro ? <p role="alert">{erro}</p> : null}
    {lista ? <><p>Últimos {lista.length} movimentos (máximo 200).</p><ul>{lista.map(m => <li key={m.id}>{new Date(m.criado_em).toLocaleString("pt-BR")} · {produtos.find(p => p.produto_variante_id === m.item_id)?.nome ?? `Produto #${m.item_id}`} · {m.tipo} · {m.qtd_base > 0 ? "+" : ""}{m.qtd_base} · {m.motivo}</li>)}</ul></> : null}
    <h3>Conferência de saldos</h3><p>Compara o saldo com a soma dos movimentos e corrige as divergências encontradas.</p>
    <button type="button" className="btn" disabled={busy} onClick={async () => void conferir()}>Conferir e corrigir saldos</button>
    {resultado ? <div role="status"><p>{resultado.ok ? "Saldos conferidos: nenhuma divergência." : `${resultado.diferencas.length} divergência(s) corrigida(s).`}</p><ul>{resultado.diferencas.map(d => <li key={`${d.item_tipo}:${d.item_id}`}>Item #{d.item_id}: {d.cache} → {d.movimentos}</li>)}</ul></div> : null}
  </details>;
}
