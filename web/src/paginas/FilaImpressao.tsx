import { confirmar } from "../servicos/dialogos";
import { useCallback, useEffect, useState } from "react";
import { api } from "../servicos/api";
import { lerUsuario } from "../auth/sessao";
import { Link } from "react-router-dom";
const rotulo = (s: string) => ({ PENDENTE: "Pendente", IMPRIMINDO: "Imprimindo", ERRO: "Falhou", IMPRESSO: "Impresso", CANCELADO: "Cancelado", PEDIDO: "Pedido", CONTA: "Pré-conta", FECHAMENTO_CAIXA: "Fechamento de caixa" }[s] ?? s.replaceAll("_", " ").toLocaleLowerCase("pt-BR"));
type Trabalho = { id: number; tipo_documento: string; status: string; tentativas: number; ultimo_erro: string | null; criado_em: string; atendimento_id: number | null; impressora: { nome: string } | null };
export default function FilaImpressao() {
  const [lista, setLista] = useState<Trabalho[]>([]);
  const [status, setStatus] = useState("");
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  const gestor = ["ROOT", "ADMIN", "GERENTE"].includes(lerUsuario()?.tipo ?? "");
  const carregar = useCallback(async () => {
    try { setLista(await api(`/impressao/fila${status ? `?status=${status}` : ""}`) as Trabalho[]); setErro(""); }
    catch(e) { setErro((e as Error).message); }
  }, [status]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca inicial da fila
    void carregar();
  }, [carregar]);
  async function acao(id: number, tipo: "cancelar" | "reimprimir") {
    if (!(await confirmar(`${tipo === "cancelar" ? "Cancelar trabalho" : "Enviar nova via"} #${id}?`))) return;
    setBusy(true); setErro(""); setOk("");
    try { await api(`/impressao/${id}/${tipo}`, { method: "POST", body: "{}" }); await carregar(); setOk(tipo === "cancelar" ? "Trabalho cancelado." : "Nova via enfileirada."); }
    catch(e) { setErro((e as Error).message); } finally { setBusy(false); }
  }
  return <section className="painel-bloco"><h2>Fila de impressão</h2>
    <label className="campo"><span>Status</span><select value={status} onChange={e => setStatus(e.target.value)}><option value="">Todos</option>{["PENDENTE", "IMPRIMINDO", "ERRO", "IMPRESSO", "CANCELADO"].map(s => <option key={s} value={s}>{rotulo(s)}</option>)}</select></label>
    <button type="button" className="btn" disabled={busy} onClick={async () => void carregar()}>Atualizar fila</button>
    {erro ? <p role="alert">{erro}</p> : null}{ok ? <p role="status">{ok}</p> : null}
    <p>Últimos 100 trabalhos. A reimpressão cria uma nova via.</p>
    {!lista.length ? <p>Nenhum trabalho neste filtro.</p> : <div className="tabela-wrap"><table className="tabela"><thead><tr><th>Documento</th><th>Atendimento</th><th>Impressora</th><th>Situação</th><th>Ações</th></tr></thead><tbody>{lista.map(t => <tr key={t.id}>
      <td><strong>{rotulo(t.tipo_documento)} #{t.id}</strong><br/><small>{new Date(t.criado_em).toLocaleString("pt-BR")}</small></td>
      <td>{t.atendimento_id ? <Link to={`/painel/pdv/${t.atendimento_id}`}>Atendimento #{t.atendimento_id}</Link> : "—"}</td>
      <td>{t.impressora?.nome ?? "Sem impressora"}</td><td>{rotulo(t.status)} · {t.tentativas} tentativa(s){t.ultimo_erro ? <p role="status">{t.ultimo_erro}</p> : null}</td>
      <td><div className="form-acoes"><button type="button" className="btn" disabled={busy} onClick={() => void acao(t.id, "reimprimir")}>Reimprimir</button>
      {gestor && !["IMPRESSO", "CANCELADO", "IMPRIMINDO"].includes(t.status) ? <button type="button" className="btn btn-perigo" disabled={busy} onClick={() => void acao(t.id, "cancelar")}>Cancelar trabalho</button> : null}</div></td>
    </tr>)}</tbody></table></div>}

  </section>;
}
