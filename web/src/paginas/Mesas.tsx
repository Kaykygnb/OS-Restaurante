import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Ajuda from "../componentes/Ajuda";
import Avisos from "../componentes/Avisos";
import Modal from "../componentes/Modal";
import { lerUsuario } from "../auth/sessao";
import { useAviso } from "../hooks/useAviso";
import { api } from "../servicos/api";
import { formatarReais } from "../util/dinheiro";
import { rotuloTipo, tituloAtendimento } from "../util/rotulos";

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

type Detalhe = {
  id: number;
  codigo_atendimento: string;
  tipo_atendimento: TipoAtendimento;
  mesa: { id: number; numero: number } | null;
  cliente_nome: string | null;
  cliente_telefone: string | null;
  pedidos?: unknown[];
  totais?: { total_centavos: number; restante_centavos: number };
};

const GESTAO = new Set(["ROOT", "ADMIN", "GERENTE"]);
const ATUALIZAR_A_CADA_MS = 15000;

export default function Mesas() {
  const sessao = lerUsuario();
  const podeGestao = GESTAO.has(sessao?.tipo ?? "");

  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [abertos, setAbertos] = useState<AtendimentoResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const { erro, ok, setErro, setOk, limpar } = useAviso();

  const [painel, setPainel] = useState<"abrir" | "detalhe" | "gestao" | null>(null);
  const [mesaFoco, setMesaFoco] = useState<Mesa | null>(null);
  const [detalheId, setDetalheId] = useState<number | null>(null);
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null);
  /** Só a resposta do último toque vale: evita mostrar a conta da mesa anterior. */
  const pedidoDetalhe = useRef(0);

  const [modal, setModal] = useState<"cancelar" | "juntar" | null>(null);
  const [motivoCancel, setMotivoCancel] = useState("");
  const [erroModal, setErroModal] = useState("");

  const [tipoNovo, setTipoNovo] = useState<TipoAtendimento>("MESA");
  const [mesaNovaId, setMesaNovaId] = useState("");
  const [clienteNome, setClienteNome] = useState("");
  const [clienteTel, setClienteTel] = useState("");
  const [clienteEnd, setClienteEnd] = useState("");
  const [obs, setObs] = useState("");
  const [salvando, setSalvando] = useState(false);

  const [qtdMesas, setQtdMesas] = useState("10");
  const [numMesa, setNumMesa] = useState("");
  const [mesaTransferir, setMesaTransferir] = useState("");
  const [origemJuntar, setOrigemJuntar] = useState("");

  const livres = useMemo(() => mesas.filter((m) => m.status === "LIVRE"), [mesas]);

  const carregar = useCallback(
    async (silencioso = false) => {
      if (!silencioso) setCarregando(true);
      try {
        const [m, a] = await Promise.all([
          api("/mesas") as Promise<Mesa[]>,
          api("/atendimentos?status=ABERTO") as Promise<AtendimentoResumo[]>,
        ]);
        setMesas(m);
        setAbertos(a);
      } catch (e) {
        if (!silencioso) setErro((e as Error).message);
      } finally {
        if (!silencioso) setCarregando(false);
      }
    },
    [setErro]
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial da tela
    void carregar();
  }, [carregar]);

  // O mapa se atualiza sozinho enquanto ninguém está mexendo num painel.
  useEffect(() => {
    if (painel) return;
    const t = setInterval(() => void carregar(true), ATUALIZAR_A_CADA_MS);
    return () => clearInterval(t);
  }, [painel, carregar]);

  async function abrirDetalhe(id: number, manterAviso = false) {
    const minha = ++pedidoDetalhe.current;
    if (!manterAviso) limpar();
    setDetalhe(null);
    setMesaTransferir("");
    setOrigemJuntar("");
    setDetalheId(id);
    setPainel("detalhe");
    try {
      const d = (await api(`/atendimentos/${id}`)) as Detalhe;
      if (minha === pedidoDetalhe.current) setDetalhe(d);
    } catch (e) {
      if (minha === pedidoDetalhe.current) setErro((e as Error).message);
    }
  }

  function abrirNovaNaMesa(mesa: Mesa) {
    pedidoDetalhe.current++;
    setMesaFoco(mesa);
    setTipoNovo("MESA");
    setMesaNovaId("");
    setClienteNome("");
    setClienteTel("");
    setClienteEnd("");
    setObs("");
    setPainel("abrir");
    setDetalhe(null);
    setDetalheId(null);
    limpar();
  }

  function fecharPainel() {
    pedidoDetalhe.current++;
    setPainel(null);
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
          mesa_id: tipoNovo === "MESA" ? (mesaFoco?.id ?? (Number(mesaNovaId) || null)) : null,
          cliente_nome: clienteNome.trim() || null,
          cliente_telefone: clienteTel.trim() || null,
          cliente_endereco: clienteEnd.trim() || null,
          observacao: obs.trim() || null,
        }),
      })) as { id: number; codigo_atendimento: string };
      setOk(`Conta ${criado.codigo_atendimento} aberta`);
      await carregar(true);
      await abrirDetalhe(criado.id, true);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function transferir() {
    if (!detalheId) return;
    const mesa_id = Number(mesaTransferir);
    if (!mesa_id) return setErro("Escolha a mesa de destino");
    setSalvando(true);
    setErro("");
    try {
      await api(`/atendimentos/${detalheId}/transferir`, {
        method: "POST",
        body: JSON.stringify({ mesa_id }),
      });
      const destino = mesas.find((m) => m.id === mesa_id);
      setOk(`Conta transferida para a mesa ${destino?.numero ?? ""}`.trim());
      await carregar(true);
      await abrirDetalhe(detalheId, true);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function juntar() {
    if (!detalheId) return;
    const origem_id = Number(origemJuntar);
    setSalvando(true);
    setErroModal("");
    try {
      const dest = (await api(`/atendimentos/${origem_id}/juntar`, {
        method: "POST",
        body: JSON.stringify({ destino_id: detalheId }),
      })) as { id: number };
      setModal(null);
      setOk("Contas juntadas");
      await carregar(true);
      await abrirDetalhe(dest.id, true);
    } catch (err) {
      setErroModal((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function confirmarCancelarConta() {
    if (!detalheId) return;
    setSalvando(true);
    setErroModal("");
    try {
      await api(`/atendimentos/${detalheId}/cancelar`, {
        method: "POST",
        body: JSON.stringify({ motivo: motivoCancel.trim() }),
      });
      setModal(null);
      setMotivoCancel("");
      setOk(`Conta ${detalhe?.codigo_atendimento ?? ""} cancelada`);
      fecharPainel();
      setDetalhe(null);
      await carregar(true);
    } catch (err) {
      setErroModal((err as Error).message);
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
      await carregar(true);
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
      await carregar(true);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  const painelAberto = painel !== null;
  const qtdPedidos = detalhe?.pedidos?.length ?? 0;
  const atendenteSemPermissao = !podeGestao && qtdPedidos > 0;
  const precisaMotivo = qtdPedidos > 0;

  return (
    <div className="cardapio mesas-pagina">
      <section className="cardapio-hero" aria-labelledby="mesas-titulo">
        <div className="cardapio-hero-copy">
          <span className="cardapio-kicker">SALÃO</span>
          <h2 id="mesas-titulo" className="titulo-com-ajuda">
            Mapa de mesas
            <Ajuda texto="Toque numa mesa livre para abrir a conta, ou numa ocupada para lançar itens e receber. Balcão, retirada e entrega ficam em Pedidos → Lançar." />
          </h2>
          <p>
            {mesas.filter((m) => m.status === "OCUPADA").length} ocupada(s) · {livres.length} livre(s)
          </p>
        </div>
        <div className="config-toolbar-inline">
          <Link className="btn-prim" to="/painel/pedidos">
            Balcão / entrega
          </Link>
          <button type="button" className="btn-sec" onClick={() => void carregar()} disabled={carregando}>
            {carregando ? "Atualizando…" : "Atualizar"}
          </button>
          {podeGestao ? (
            <button type="button" className="btn-sec" onClick={() => setPainel("gestao")}>
              Gerir mesas
            </button>
          ) : null}
        </div>
      </section>

      <Avisos erro={modal ? "" : erro} ok={ok} />

      <div className={`cardapio-grid-3${painelAberto ? " com-painel" : ""}`}>
        <section className="painel-bloco painel-lista" style={{ gridColumn: painelAberto ? undefined : "1 / -1" }}>
          <header className="painel-bloco-cab">
            <div>
              <h2>Mapa</h2>
              <p className="ajuda" style={{ margin: 0 }}>
                Toque numa mesa livre para abrir · ocupada para ver a conta
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
              {mesas.map((m) => {
                const selecionada =
                  (painel === "detalhe" && m.atendimento_aberto?.id === detalheId) ||
                  (painel === "abrir" && mesaFoco?.id === m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    className={`mesa-tile ${m.status === "OCUPADA" ? "ocupada" : "livre"}${selecionada ? " selecionada" : ""}`}
                    aria-label={`Mesa ${m.numero}, ${m.status === "OCUPADA" ? "ocupada" : "livre"}`}
                    aria-pressed={selecionada}
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
                );
              })}
            </div>
          )}

          {abertos.some((a) => a.tipo_atendimento !== "MESA") ? (
            <div style={{ marginTop: 20 }}>
              <h3 className="bloco-variante-titulo">Balcão, retirada e entrega abertos</h3>
              <ul className="lista-prod">
                {abertos
                  .filter((a) => a.tipo_atendimento !== "MESA")
                  .map((a) => (
                    <li key={a.id} className="prod-item">
                      <button type="button" className="prod-info prod-info-btn" onClick={() => void abrirDetalhe(a.id)}>
                        <strong>{a.codigo_atendimento}</strong>
                        <span className="prod-meta">
                          {rotuloTipo(a.tipo_atendimento)}
                          {a.cliente_nome ? ` · ${a.cliente_nome}` : ""}
                        </span>
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}
        </section>

        {painelAberto ? (
          <button type="button" className="folha-fundo" aria-label="Fechar painel" onClick={fecharPainel} />
        ) : null}

        {painel === "abrir" ? (
          <aside className="painel-bloco painel-drawer folha" aria-label="Abrir conta">
            <form className="form-drawer" onSubmit={criarAtendimento}>
              <div className="form-produto-titulo">
                <div>
                  <span className="painel-sobretitulo">NOVA CONTA</span>
                  <strong>{tipoNovo === "MESA" && mesaFoco ? `Mesa ${mesaFoco.numero}` : "Abrir atendimento"}</strong>
                </div>
                <button type="button" className="btn-ghost drawer-fechar" aria-label="Fechar" onClick={fecharPainel}>
                  ×
                </button>
              </div>

              <div className="drawer-bloco">
                {!mesaFoco ? (
                  <label className="campo">
                    <span>Tipo</span>
                    <select value={tipoNovo} onChange={(e) => setTipoNovo(e.target.value as TipoAtendimento)}>
                      <option value="MESA">Mesa</option>
                      <option value="BALCAO">Balcão</option>
                      <option value="RETIRADA">Retirada</option>
                      <option value="ENTREGA">Entrega</option>
                    </select>
                  </label>
                ) : null}

                {tipoNovo === "MESA" && !mesaFoco ? (
                  <label className="campo">
                    <span>Mesa</span>
                    <select value={mesaNovaId} onChange={(e) => setMesaNovaId(e.target.value)} required>
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
                  <span>Nome do cliente (opcional)</span>
                  <input value={clienteNome} onChange={(e) => setClienteNome(e.target.value)} autoComplete="off" />
                </label>
                {tipoNovo === "ENTREGA" ? (
                  <>
                    <label className="campo">
                      <span>Telefone</span>
                      <input value={clienteTel} onChange={(e) => setClienteTel(e.target.value)} inputMode="tel" />
                    </label>
                    <label className="campo">
                      <span>Endereço</span>
                      <input value={clienteEnd} onChange={(e) => setClienteEnd(e.target.value)} />
                    </label>
                  </>
                ) : null}
                <label className="campo">
                  <span>Observação (opcional)</span>
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

        {painel === "detalhe" ? (
          <aside className="painel-bloco painel-drawer folha" aria-label="Conta da mesa" aria-busy={!detalhe}>
            {!detalhe ? (
              <div className="form-drawer">
                <div className="form-produto-titulo">
                  <div>
                    <span className="painel-sobretitulo">CONTA</span>
                    <strong>Carregando…</strong>
                  </div>
                  <button type="button" className="btn-ghost drawer-fechar" aria-label="Fechar" onClick={fecharPainel}>
                    ×
                  </button>
                </div>
                <p className="ajuda">Buscando a conta no servidor…</p>
              </div>
            ) : (
              <div className="form-drawer">
                <div className="form-produto-titulo">
                  <div>
                    <span className="painel-sobretitulo">{tituloAtendimento(detalhe)}</span>
                    <strong>{detalhe.codigo_atendimento}</strong>
                  </div>
                  <button type="button" className="btn-ghost drawer-fechar" aria-label="Fechar" onClick={fecharPainel}>
                    ×
                  </button>
                </div>

                <div className="drawer-bloco">
                  <p className="ajuda" style={{ margin: 0 }}>
                    {detalhe.mesa ? `Mesa ${detalhe.mesa.numero}` : rotuloTipo(detalhe.tipo_atendimento)}
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
                      <strong>{qtdPedidos}</strong>
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
                    <p className="bloco-variante-titulo">Transferir para outra mesa</p>
                    <div className="config-toolbar-inline">
                      <select
                        aria-label="Mesa de destino"
                        value={mesaTransferir}
                        onChange={(e) => setMesaTransferir(e.target.value)}
                      >
                        <option value="">Mesa livre…</option>
                        {livres.map((m) => (
                          <option key={m.id} value={m.id}>
                            Mesa {m.numero}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="btn-sec"
                        disabled={salvando || !mesaTransferir}
                        onClick={() => void transferir()}
                      >
                        Transferir
                      </button>
                    </div>
                  </div>
                ) : null}

                {podeGestao ? (
                  <div className="drawer-bloco">
                    <p className="bloco-variante-titulo">Juntar outra conta nesta</p>
                    <div className="config-toolbar-inline">
                      <select
                        aria-label="Conta a trazer"
                        value={origemJuntar}
                        onChange={(e) => setOrigemJuntar(e.target.value)}
                      >
                        <option value="">Conta a trazer…</option>
                        {abertos
                          .filter((a) => a.id !== detalhe.id)
                          .map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.codigo_atendimento} · {tituloAtendimento(a)}
                              {a.cliente_nome ? ` · ${a.cliente_nome}` : ""}
                            </option>
                          ))}
                      </select>
                      <button
                        type="button"
                        className="btn-sec"
                        disabled={salvando || !origemJuntar}
                        onClick={() => {
                          setErroModal("");
                          setModal("juntar");
                        }}
                      >
                        Juntar aqui
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="form-acoes">
                  <button
                    type="button"
                    className="btn-ghost btn-texto-perigo"
                    disabled={salvando}
                    onClick={() => {
                      setMotivoCancel("");
                      setErroModal("");
                      setModal("cancelar");
                    }}
                  >
                    Cancelar conta
                  </button>
                </div>
              </div>
            )}
          </aside>
        ) : null}

        {modal === "cancelar" && detalhe ? (
          <Modal
            titulo={`Cancelar a conta ${detalhe.codigo_atendimento}?`}
            confirmar="Cancelar conta"
            desistir="Voltar"
            perigo
            ocupado={salvando}
            erro={erroModal}
            desabilitarConfirmar={atendenteSemPermissao || (precisaMotivo && motivoCancel.trim().length < 3)}
            onConfirmar={() => void confirmarCancelarConta()}
            onFechar={() => setModal(null)}
          >
            {atendenteSemPermissao ? (
              <p className="ajuda">
                Esta conta já tem pedidos. Só um gerente pode cancelar: chame o gerente para fazer pelo aparelho
                dele. Para tirar um item, use Conta / pagar.
              </p>
            ) : (
              <>
                <p className="ajuda">
                  {tituloAtendimento(detalhe)} · {qtdPedidos} pedido(s) ·{" "}
                  {formatarReais(detalhe.totais?.total_centavos ?? 0)}. Isso encerra o atendimento e não tem volta.
                </p>
                <label className="campo">
                  <span>{precisaMotivo ? "Motivo (obrigatório)" : "Motivo (opcional)"}</span>
                  <input
                    data-autofoco
                    value={motivoCancel}
                    onChange={(e) => setMotivoCancel(e.target.value)}
                    placeholder="Ex.: cliente desistiu antes do preparo"
                  />
                </label>
              </>
            )}
          </Modal>
        ) : null}

        {modal === "juntar" && detalhe ? (
          <Modal
            titulo="Juntar as contas?"
            confirmar="Juntar"
            desistir="Voltar"
            ocupado={salvando}
            erro={erroModal}
            onConfirmar={() => void juntar()}
            onFechar={() => setModal(null)}
          >
            <p className="ajuda">
              Os pedidos de{" "}
              <strong>{abertos.find((a) => String(a.id) === origemJuntar)?.codigo_atendimento ?? "outra conta"}</strong>{" "}
              vêm para <strong>{detalhe.codigo_atendimento}</strong> ({tituloAtendimento(detalhe)}). A conta de origem
              é encerrada.
            </p>
          </Modal>
        ) : null}

        {painel === "gestao" && podeGestao ? (
          <aside className="painel-bloco painel-drawer folha" aria-label="Gerir mesas">
            <div className="form-drawer">
              <div className="form-produto-titulo">
                <div>
                  <span className="painel-sobretitulo">GESTÃO</span>
                  <strong>Mesas do salão</strong>
                </div>
                <button type="button" className="btn-ghost drawer-fechar" aria-label="Fechar" onClick={fecharPainel}>
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
