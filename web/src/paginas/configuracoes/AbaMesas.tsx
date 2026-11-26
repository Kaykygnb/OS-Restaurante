import Formulario from "../../componentes/Formulario";
import { confirmar, solicitarTexto } from "../../servicos/dialogos";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../servicos/api";

type Mesa = { id: number; numero: number; ativo: boolean; status: string };

export default function AbaMesas() {
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [quantidade, setQuantidade] = useState("5");
  const [numero, setNumero] = useState("1");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const carregar = useCallback(async () => {
    try {
      const dados = await api("/mesas?todas=1") as Mesa[]; setMesas(dados);
      let proximo = 1; while (dados.some(m => m.numero === proximo && m.ativo)) proximo++; setNumero(String(proximo));
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga de dados da tela (fetch)
    void carregar();
  }, [carregar]);

  async function cadastrar(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(numero);
    if (!Number.isSafeInteger(n) || n < 1) return setErro("Informe um número inteiro maior que zero.");
    setSalvando(true);
    setErro("");
    setOk("");
    try {
      await api("/mesas", { method: "POST", body: JSON.stringify({ numero: n }) });
      setOk(`Mesa ${n} cadastrada.`);
      setNumero(String(n + 1));
      await carregar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function executar(url: string, method: string, body?: object) {
    if (salvando) return;
    setSalvando(true); setErro(""); setOk("");
    try {
      await api(url, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
      setOk("Mesas atualizadas."); await carregar();
    } catch (e) { setErro((e as Error).message); } finally { setSalvando(false); }
  }
  return <section className="painel-bloco">
    <h2>Cadastro de mesas</h2>
    <p>Cadastre o número de cada mesa para exibi-la no salão. Cadastrar um número inativo reativa a mesa.</p>
    {erro ? <p role="alert" className="feedback-card feedback-erro">{erro}</p> : null}
    {ok ? <p role="status" className="feedback-card feedback-ok">{ok}</p> : null}
    <Formulario onSubmit={cadastrar}>
      <label className="campo">
        <span>Número da mesa</span>
        <input type="number" min="1" step="1" required value={numero} onChange={(e) => setNumero(e.target.value)} />
      </label>
      <div className="form-acoes">
        <button type="submit" disabled={salvando || carregando}>{salvando ? "Cadastrando…" : "Cadastrar mesa"}</button>
        <Link to="/painel/mesas" className="btn">Ver mesas no salão</Link>
      </div>
    </Formulario>
    <Formulario onSubmit={e => { e.preventDefault(); const n = Number(quantidade); if (Number.isInteger(n) && n >= 2 && n <= 50) void executar("/mesas", "POST", { quantidade: n }); }}>
      <label className="campo"><span>Quantidade de novas mesas (2–50)</span><input type="number" min="2" max="50" required value={quantidade} onChange={e => setQuantidade(e.target.value)} /></label>
      <button type="submit" className="btn" disabled={salvando || carregando}>Cadastrar em lote</button>
      <p className="ajuda">Usa os próximos números disponíveis, sem repetir mesas existentes.</p>
    </Formulario>
    {carregando ? <p role="status">Carregando mesas…</p> : mesas.length ? <div className="tabela-wrap"><table className="tabela tabela-cartoes" role="table"><thead><tr><th>Número</th><th>Situação</th><th>Ações</th></tr></thead><tbody>
      {mesas.map((m) => <tr key={m.id}><td data-label="Mesa">{m.numero}</td><td data-label="Situação">{!m.ativo ? "Inativa" : m.status === "OCUPADA" ? "Ocupada" : "Livre"}{m.ativo && m.status === "OCUPADA" ? <small> · Encerre ou transfira a conta para desativar.</small> : null}</td><td data-label="Ações"><div className="form-acoes">
        <button type="button" className="btn" disabled={salvando} onClick={async () => { const n = (await solicitarTexto("Novo número da mesa", String(m.numero))); if (n === null) return; const valor = Number(n); if (!Number.isSafeInteger(valor) || valor < 1) return setErro("Número inválido."); void executar(`/mesas/${m.id}`, "PUT", { numero: valor }); }}>Renumerar</button>
        <button type="button" className="btn" disabled={salvando || (m.ativo && m.status === "OCUPADA")} onClick={async () => { if (!m.ativo || (await confirmar(`Desativar mesa ${m.numero}?`, true))) void executar(`/mesas/${m.id}`, m.ativo ? "DELETE" : "PUT", m.ativo ? undefined : { ativo: true }); }}>{m.ativo ? "Desativar" : "Reativar"}</button>
      </div></td></tr>)}
    </tbody></table></div> : <p>Nenhuma mesa cadastrada.</p>}
  </section>;
}
