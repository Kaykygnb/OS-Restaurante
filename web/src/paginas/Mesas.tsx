import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Ajuda from "../componentes/Ajuda";
import { lerUsuario } from "../auth/sessao";
import { api } from "../servicos/api";
import { formatarReais } from "../util/dinheiro";

type TipoAtendimento = "MESA" | "BALCAO" | "RETIRADA" | "ENTREGA";

type Mesa = {
  id: number;
  numero: number;
  ativo: boolean;
  status: "LIVRE" | "OCUPADA";
  atendimento_aberto: {
    id: number;
    codigo_atendimento: string;
    cliente_nome: string | null;
    tipo_atendimento: TipoAtendimento;
    aberto_em: string;
  } | null;
};

type AtendimentoResumo = {
  id: number;
  codigo_atendimento: string;
  tipo_atendimento: TipoAtendimento;
  status: string;
  cliente_nome: string | null;
  mesa: { id: number; numero: number } | null;
  aberto_em: string;
};

const GESTAO = new Set(["ROOT", "ADMIN", "GERENTE"]);

export default function Mesas() {
  const sessao = lerUsuario();
  const podeGestao = GESTAO.has(sessao?.tipo ?? "");

  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [abertos, setAbertos] = useState<AtendimentoResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");

  const [painel, setPainel] = useState<"abrir" | "detalhe" | "gestao" | null>(null);
  const [mesaFoco, setMesaFoco] = useState<Mesa | null>(null);
  const [detalheId, setDetalheId] = useState<number | null>(null);
  const [detalhe, setDetalhe] = useState<any>(null);

  const [tipoNovo, setTipoNovo] = useState<TipoAtendimento>("MESA");
  const [clienteNome, setClienteNome] = useState("");
  const [clienteTel, setClienteTel] = useState("");
  const [clienteEnd, setClienteEnd] = useState("");
  const [obs, setObs] = useState("");
  const [salvando, setSalvando] = useState(false);

  const [qtdMesas, setQtdMesas] = useState("10");
  const [numMesa, setNumMesa] = useState("");
  const [mesaTransferir, setMesaTransferir] = useState("");
  const [destinoJuntar, setDestinoJuntar] = useState("");

  const livres = useMemo(() => mesas.filter((m) => m.status === "LIVRE"), [mesas]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const [m, a] = await Promise.all([
        api("/mesas") as Promise<Mesa[]>,
        api("/atendimentos?status=ABERTO") as Promise<AtendimentoResumo[]>,
      ]);
      setMesas(m);
      setAbertos(a);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function abrirDetalhe(id: number) {
    setErro("");
    setOk("");
    setDetalheId(id);
    setPainel("detalhe");
    try {
      const d = await api(`/atendimentos/${id}`);
      setDetalhe(d);
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  function abrirNovaNaMesa(mesa: Mesa) {
    setMesaFoco(mesa);
    setTipoNovo("MESA");
    setClienteNome("");
    setClienteTel("");
    setClienteEnd("");
    setObs("");
    setPainel("abrir");
    setDetalhe(null);
    setDetalheId(null);
    setErro("");
    setOk("");
  }

  function abrirNovaGeral(tipo: TipoAtendimento = "BALCAO") {
    setMesaFoco(null);
    setTipoNovo(tipo);
    setClienteNome("");
    setClienteTel("");
    setClienteEnd("");
    setObs("");
    setPainel("abrir");
    setDetalhe(null);
    setDetalheId(null);
  }

  async function criarAtendimento(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro("");
    try {
      const criado = (await api("/atendimentos", {
        method: "POST",
        body: JSON.stringify({
          tipo_atendimento: tipoNovo,
          mesa_id:
            tipoNovo === "MESA" ? mesaFoco?.id ?? (Number(mesaTransferir) || null) : null,
          cliente_nome: clienteNome.trim() || null,
          cliente_telefone: clienteTel.trim() || null,
          cliente_endereco: clienteEnd.trim() || null,
          observacao: obs.trim() || null,
        }),
      })) as { id: number; codigo_atendimento: string };
      setOk(`Conta ${criado.codigo_atendimento} aberta`);
      await carregar();
      await abrirDetalhe(criado.id);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function transferir() {
    if (!detalheId) return;
    const mesa_id = Number(mesaTransferir);
    if (!mesa_id) return setErro("Escolha a mesa destino");
    setSalvando(true);
    setErro("");
    try {
      await api(`/atendimentos/${detalheId}/transferir`, {
        method: "POST",
        body: JSON.stringify({ mesa_id }),
      });
      setOk("Mesa transferida");
      await carregar();
      await abrirDetalhe(detalheId);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function juntar() {
    if (!detalheId) return;
    const origem_id = Number(destinoJuntar);
    if (!origem_id) return setErro("Escolha a conta que será juntada nesta");
    if (!confirm("Juntar a outra conta nesta? A origem será cancelada e os pedidos vêm pra cá.")) return;
    setSalvando(true);
    setErro("");
    try {
      const dest = (await api(`/atendimentos/${origem_id}/juntar`, {
        method: "POST",
        body: JSON.stringify({ destino_id: detalheId }),
      })) as { id: number };
      setOk("Contas juntadas");
      await carregar();
      await abrirDetalhe(dest.id);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function cancelarConta() {
    if (!detalheId) return;
    const motivo = prompt("Motivo do cancelamento (opcional se sem pedidos):") ?? "";
    setSalvando(true);
    setErro("");
    try {
      await api(`/atendimentos/${detalheId}/cancelar`, {
        method: "POST",
        body: JSON.stringify({ motivo }),
      });
      setOk("Atendimento cancelado");
      setPainel(null);
      setDetalhe(null);
      await carregar();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function criarMesasLote(e: React.FormEvent) {
    e.preventDefault();
    const quantidade = Number(qtdMesas);
    if (!quantidade || quantidade < 1) return setErro("Quantidade inválida");
    setSalvando(true);
    setErro("");
    try {
      await api("/mesas", { method: "POST", body: JSON.stringify({ quantidade }) });
      setOk(`${quantidade} mesa(s) criadas`);
      await carregar();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function criarMesaUna(e: React.FormEvent) {
    e.preventDefault();
    const numero = Number(numMesa);
    if (!numero) return setErro("Informe o número");
    setSalvando(true);
    setErro("");
    try {
      await api("/mesas", { method: "POST", body: JSON.stringify({ numero }) });
      setOk(`Mesa ${numero} criada`);
      setNumMesa("");
      await carregar();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  const painelAberto = painel !== null;

  return (
    <div className="cardapio mesas-pagina">
      <section className="cardapio-hero" aria-labelledby="mesas-titulo">
        <div className="cardapio-hero-copy">
          <span className="cardapio-kicker">SALÃO</span>
          <h2 id="mesas-titulo" className="titulo-com-ajuda">
            Mapa de mesas
            <Ajuda texto="Só o salão: mesas livres/ocupadas, transferir e juntar. Pra lançar balcão/retirada/entrega use Pedidos → Lançar." />
          </h2>
          <p>
            {mesas.filter((m) => m.status === "OCUPADA").length} ocupada(s) · {livres.length} livre(s)
          </p>
        </div>
        <div className="config-toolbar-inline">
          <Link className="btn-prim" to="/painel/pedidos">
            Lançar pedido
          </Link>
          <button type="button" className="btn-sec" onClick={() => void carregar()} disabled={carregando}>
            {carregando ? "…" : "Atualizar"}
          </button>
          {podeGestao ? (
            <button type="button" className="btn-sec" onClick={() => setPainel("gestao")}>
              Gerir mesas
            </button>
          ) : null}
        </div>
      </section>

      {erro ? <p className="feedback-card feedback-erro" role="alert">{erro}</p> : null}
      {ok ? <p className="feedback-card feedback-ok" role="status">{ok}</p> : null}

      <div className={`cardapio-grid-3${painelAberto ? " com-painel" : ""}`}>
        <section className="painel-bloco painel-lista" style={{ gridColumn: painelAberto ? undefined : "1 / -1" }}>
          <header className="painel-bloco-cab">
            <div>
              <h2>Mapa</h2>
              <p className="ajuda" style={{ margin: 0 }}>
                Clique numa mesa livre para abrir · ocupada para ver a conta
              </p>
            </div>
          </header>

          {mesas.length === 0 && !carregando ? (
            <div className="lista-vazia" style={{ padding: 24 }}>
              <strong>Nenhuma mesa cadastrada</strong>
              <span>{podeGestao ? "Use Gerir mesas para criar o salão." : "Peça ao gerente para cadastrar as mesas."}</span>
            </div>
          ) : (
            <div className="mesas-grid">
              {mesas.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`mesa-tile ${m.status === "OCUPADA" ? "ocupada" : "livre"}`}
                  onClick={() => {
                    if (m.status === "OCUPADA" && m.atendimento_aberto) {
                      void abrirDetalhe(m.atendimento_aberto.id);
                    } else {
                      abrirNovaNaMesa(m);
                    }
                  }}
                >
                  <span className="mesa-num">{m.numero}</span>
                  <span className="mesa-st">{m.status === "OCUPADA" ? "Ocupada" : "Livre"}</span>
                  {m.atendimento_aberto ? (
                    <>
                      <span className="mesa-cod">{m.atendimento_aberto.codigo_atendimento}</span>
                      {m.atendimento_aberto.cliente_nome ? (
                        <span className="mesa-cli">{m.atendimento_aberto.cliente_nome}</span>
                      ) : null}
                    </>
                  ) : (
                    <span className="mesa-cod">Abrir</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {abertos.some((a) => a.tipo_atendimento !== "MESA") ? (
            <div style={{ marginTop: 20 }}>
              <h3 className="bloco-variante-titulo">Outras contas abertas</h3>
              <ul className="lista-prod">
                {abertos
                  .filter((a) => a.tipo_atendimento !== "MESA")
                  .map((a) => (
                    <li key={a.id} className="prod-item">
                      <button type="button" className="prod-info prod-info-btn" onClick={() => void abrirDetalhe(a.id)}>
                        <strong>{a.codigo_atendimento}</strong>
                        <span className="prod-meta">
                          {a.tipo_atendimento}
                          {a.cliente_nome ? ` · ${a.cliente_nome}` : ""}
                        </span>
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}
        </section>

        {painel === "abrir" ? (
          <aside className="painel-bloco painel-drawer">
            <form className="form-drawer" onSubmit={criarAtendimento}>
              <div className="form-produto-titulo">
                <div>
                  <span className="painel-sobretitulo">NOVA CONTA</span>
                  <strong>
                    {tipoNovo === "MESA" && mesaFoco ? `Mesa ${mesaFoco.numero}` : "Abrir atendimento"}
                  </strong>
                </div>
                <button type="button" className="btn-ghost drawer-fechar" onClick={() => setPainel(null)}>
                  ×
                </button>
              </div>

              <div className="drawer-bloco">
                <label className="campo">
                  <span>Tipo</span>
                  <select
                    value={tipoNovo}
                    onChange={(e) => setTipoNovo(e.target.value as TipoAtendimento)}
                    disabled={Boolean(mesaFoco)}
                  >
                    <option value="MESA">Mesa</option>
                    <option value="BALCAO">Balcão</option>
                    <option value="RETIRADA">Retirada</option>
                    <option value="ENTREGA">Entrega</option>
                  </select>
                </label>

                {tipoNovo === "MESA" && !mesaFoco ? (
                  <label className="campo">
                    <span>Mesa</span>
                    <select value={mesaTransferir} onChange={(e) => setMesaTransferir(e.target.value)} required>
                      <option value="">— selecione —</option>
                      {livres.map((m) => (
                        <option key={m.id} value={m.id}>
                          Mesa {m.numero}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                <label className="campo">
                  <span>Nome do cliente</span>
                  <input value={clienteNome} onChange={(e) => setClienteNome(e.target.value)} />
                </label>
                {tipoNovo === "ENTREGA" ? (
                  <>
                    <label className="campo">
                      <span>Telefone</span>
                      <input value={clienteTel} onChange={(e) => setClienteTel(e.target.value)} />
                    </label>
                    <label className="campo">
                      <span>Endereço</span>
                      <input value={clienteEnd} onChange={(e) => setClienteEnd(e.target.value)} />
                    </label>
                  </>
                ) : null}
                <label className="campo">
                  <span>Observação</span>
                  <input value={obs} onChange={(e) => setObs(e.target.value)} />
                </label>
              </div>

              <div className="form-acoes">
                <button type="submit" disabled={salvando}>
                  {salvando ? "Abrindo…" : "Abrir conta"}
                </button>
              </div>
            </form>
          </aside>
        ) : null}

        {painel === "detalhe" && detalhe ? (
          <aside className="painel-bloco painel-drawer">
            <div className="form-drawer">
              <div className="form-produto-titulo">
                <div>
                  <span className="painel-sobretitulo">{detalhe.tipo_atendimento}</span>
                  <strong>{detalhe.codigo_atendimento}</strong>
                </div>
                <button type="button" className="btn-ghost drawer-fechar" onClick={() => setPainel(null)}>
                  ×
                </button>
              </div>

              <div className="drawer-bloco">
                <p className="ajuda" style={{ margin: 0 }}>
                  {detalhe.mesa ? `Mesa ${detalhe.mesa.numero}` : "Sem mesa"}
                  {detalhe.cliente_nome ? ` · ${detalhe.cliente_nome}` : ""}
                  {detalhe.cliente_telefone ? ` · ${detalhe.cliente_telefone}` : ""}
                </p>
                <div className="mesa-detalhe-totais">
                  <div>
                    <span>Total</span>
                    <strong>{formatarReais(detalhe.totais?.total_centavos ?? 0)}</strong>
                  </div>
                  <div>
                    <span>Restante</span>
                    <strong>{formatarReais(detalhe.totais?.restante_centavos ?? 0)}</strong>
                  </div>
                  <div>
                    <span>Pedidos</span>
                    <strong>{detalhe.pedidos?.length ?? 0}</strong>
                  </div>
                </div>
                <div className="mesa-detalhe-acoes">
                  <Link className="btn-prim" to={`/painel/pdv/${detalhe.id}`}>
                    Lançar itens
                  </Link>
                  <Link className="btn-sec" to={`/painel/conta/${detalhe.id}`}>
                    Conta / pagar
                  </Link>
                </div>
              </div>

              {detalhe.tipo_atendimento === "MESA" ? (
                <div className="drawer-bloco">
                  <p className="bloco-variante-titulo">Transferir mesa</p>
                  <div className="config-toolbar-inline">
                    <select value={mesaTransferir} onChange={(e) => setMesaTransferir(e.target.value)}>
                      <option value="">Mesa livre…</option>
                      {livres.map((m) => (
                        <option key={m.id} value={m.id}>
                          Mesa {m.numero}
                        </option>
                      ))}
                    </select>
                    <button type="button" className="btn-sec" disabled={salvando} onClick={() => void transferir()}>
                      Transferir
                    </button>
                  </div>
                </div>
              ) : null}

              {podeGestao ? (
                <div className="drawer-bloco">
                  <p className="bloco-variante-titulo">Juntar outra conta nesta</p>
                  <div className="config-toolbar-inline">
                    <select value={destinoJuntar} onChange={(e) => setDestinoJuntar(e.target.value)}>
                      <option value="">Conta a trazer…</option>
                      {abertos
                        .filter((a) => a.id !== detalhe.id)
                        .map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.codigo_atendimento}
                            {a.mesa ? ` · Mesa ${a.mesa.numero}` : ` · ${a.tipo_atendimento}`}
                          </option>
                        ))}
                    </select>
                    <button type="button" className="btn-sec" disabled={salvando} onClick={() => void juntar()}>
                      Juntar aqui
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="form-acoes">
                <button type="button" className="btn-ghost" disabled={salvando} onClick={() => void cancelarConta()}>
                  Cancelar conta
                </button>
              </div>
            </div>
          </aside>
        ) : null}

        {painel === "gestao" && podeGestao ? (
          <aside className="painel-bloco painel-drawer">
            <div className="form-drawer">
              <div className="form-produto-titulo">
                <div>
                  <span className="painel-sobretitulo">GESTÃO</span>
                  <strong>Mesas do salão</strong>
                </div>
                <button type="button" className="btn-ghost drawer-fechar" onClick={() => setPainel(null)}>
                  ×
                </button>
              </div>
              <form className="drawer-bloco" onSubmit={criarMesasLote}>
                <label className="campo">
                  <span>Criar em lote (próximos números livres)</span>
                  <input value={qtdMesas} onChange={(e) => setQtdMesas(e.target.value)} inputMode="numeric" />
                </label>
                <button type="submit" className="btn-sec" disabled={salvando}>
                  Criar lote
                </button>
              </form>
              <form className="drawer-bloco" onSubmit={criarMesaUna}>
                <label className="campo">
                  <span>Criar mesa com número</span>
                  <input value={numMesa} onChange={(e) => setNumMesa(e.target.value)} inputMode="numeric" />
                </label>
                <button type="submit" className="btn-sec" disabled={salvando}>
                  Criar mesa
                </button>
              </form>
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
