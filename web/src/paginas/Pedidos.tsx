import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Ajuda from "../componentes/Ajuda";
import Avisos from "../componentes/Avisos";
import { lerUsuario } from "../auth/sessao";
import { useAviso } from "../hooks/useAviso";
import { api } from "../servicos/api";
import { rotuloStatusPedido as rotuloStatus, rotuloTipo } from "../util/rotulos";

type Aba = "lancar" | "cozinha" | "historico";
type TipoAtendimento = "BALCAO" | "RETIRADA" | "ENTREGA" | "MESA";

type PedidoKds = {
  id: number;
  codigo_pedido: string;
  status: string;
  createdAt: string;
  atendimento: {
    id: number;
    codigo_atendimento: string;
    tipo_atendimento: string;
    status?: string;
    mesa: { numero: number } | null;
  };
  itens: {
    id: number;
    nome_produto: string;
    quantidade: number;
    observacao: string | null;
    cancelado: boolean;
    escolhas: { nome_opcao: string; quantidade: number }[];
    adicionais: { nome_adicional: string; quantidade: number }[];
  }[];
};

type ContaAberta = {
  id: number;
  codigo_atendimento: string;
  tipo_atendimento: string;
  cliente_nome: string | null;
  mesa: { id: number; numero: number } | null;
  aberto_em: string;
};

type MesaOpt = {
  id: number;
  numero: number;
  status: "LIVRE" | "OCUPADA";
};

const PROXIMO: Record<string, { label: string; status: string } | null> = {
  ENVIADO: { label: "Iniciar", status: "PREPARO" },
  PREPARO: { label: "Pronto", status: "PRONTO" },
  PRONTO: { label: "Entregar", status: "ENTREGUE" },
  ENTREGUE: null,
  CANCELADO: null,
};

function minutosDesde(iso: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
}

export default function Pedidos() {
  const navegar = useNavigate();
  const [params, setParams] = useSearchParams();
  const ehCozinha = lerUsuario()?.tipo === "COZINHEIRO";
  const abaUrl = params.get("aba");
  // A cozinha abre direto na fila; o cozinheiro nem vê "Lançar" (o servidor não deixa ele abrir conta).
  const aba: Aba = ehCozinha
    ? abaUrl === "historico"
      ? "historico"
      : "cozinha"
    : abaUrl === "cozinha" || abaUrl === "historico"
      ? abaUrl
      : "lancar";
  const setAba = (a: Aba) => setParams(a === "lancar" ? {} : { aba: a }, { replace: true });
  const [avancando, setAvancando] = useState<Set<number>>(new Set());
  const [lista, setLista] = useState<PedidoKds[]>([]);
  const [historico, setHistorico] = useState<PedidoKds[]>([]);
  const [contas, setContas] = useState<ContaAberta[]>([]);
  const [mesasLivres, setMesasLivres] = useState<MesaOpt[]>([]);
  const { erro, ok, setErro, setOk } = useAviso();
  const [carregando, setCarregando] = useState(true);
  const [agora, setAgora] = useState(() => Date.now());

  const [tipoNovo, setTipoNovo] = useState<TipoAtendimento>("BALCAO");
  const [mesaId, setMesaId] = useState("");
  const [clienteNome, setClienteNome] = useState("");
  const [clienteTel, setClienteTel] = useState("");
  const [clienteEnd, setClienteEnd] = useState("");
  const [obs, setObs] = useState("");
  const [abrindo, setAbrindo] = useState(false);

  const carregarCozinha = useCallback(async (silencioso = false) => {
    if (!silencioso) setCarregando(true);
    setErro("");
    try {
      setLista((await api("/pedidos?status=ABERTOS")) as PedidoKds[]);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [setErro]);

  const carregarHistorico = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      setHistorico((await api("/pedidos?status=HISTORICO")) as PedidoKds[]);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [setErro]);

  const carregarContas = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const [c, m] = await Promise.all([
        api("/atendimentos?status=ABERTO") as Promise<ContaAberta[]>,
        api("/mesas") as Promise<MesaOpt[]>,
      ]);
      setContas(c);
      setMesasLivres(m.filter((x) => x.status === "LIVRE"));
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [setErro]);

  useEffect(() => {
    if (aba === "cozinha") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- carga de dados da tela (fetch)
      void carregarCozinha();
      const t = setInterval(() => void carregarCozinha(true), 6000);
      const clock = setInterval(() => setAgora(Date.now()), 30000);
      return () => {
        clearInterval(t);
        clearInterval(clock);
      };
    }
    if (aba === "historico") void carregarHistorico();
    if (aba === "lancar") void carregarContas();
  }, [aba, carregarCozinha, carregarHistorico, carregarContas]);

  async function avancar(p: PedidoKds) {
    const prox = PROXIMO[p.status];
    if (!prox || avancando.has(p.id)) return; // trava contra toque duplo
    setAvancando((s) => new Set(s).add(p.id));
    setErro("");
    try {
      await api(`/pedidos/${p.id}/status`, {
        method: "PUT",
        body: JSON.stringify({ status: prox.status }),
      });
      setOk(`${p.codigo_pedido}: ${rotuloStatus(prox.status).toLowerCase()}`);
      await carregarCozinha(true);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setAvancando((s) => {
        const n = new Set(s);
        n.delete(p.id);
        return n;
      });
    }
  }

  async function abrirELancar(e: React.FormEvent) {
    e.preventDefault();
    setAbrindo(true);
    setErro("");
    try {
      const criado = (await api("/atendimentos", {
        method: "POST",
        body: JSON.stringify({
          tipo_atendimento: tipoNovo,
          mesa_id: tipoNovo === "MESA" ? Number(mesaId) || null : null,
          cliente_nome: clienteNome.trim() || null,
          cliente_telefone: clienteTel.trim() || null,
          cliente_endereco: clienteEnd.trim() || null,
          observacao: obs.trim() || null,
        }),
      })) as { id: number; codigo_atendimento: string };
      setOk(`Conta ${criado.codigo_atendimento} aberta`);
      navegar(`/painel/pdv/${criado.id}`);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setAbrindo(false);
    }
  }

  const colunas = [
    { key: "ENVIADO", titulo: "Fila", classe: "kds-enviado" },
    { key: "PREPARO", titulo: "Preparo", classe: "kds-preparo" },
    { key: "PRONTO", titulo: "Prontos", classe: "kds-pronto" },
  ] as const;

  void agora;

  return (
    <div className="cardapio pedidos-pagina">
      <section className="pdv-topbar">
        <div>
          <span className="cardapio-kicker">OPERAÇÃO</span>
          <h2 className="titulo-com-ajuda">
            Pedidos
            <Ajuda texto="Aqui você lança em qualquer tipo de conta (balcão, retirada, entrega ou mesa), vê a cozinha e o histórico. Mesas no menu é só o mapa do salão." />
          </h2>
          <p>
            {aba === "lancar"
              ? "Abrir conta e lançar itens — não precisa ser mesa"
              : aba === "cozinha"
                ? `${lista.length} em aberto · auto-atualiza`
                : `${historico.length} no histórico recente`}
          </p>
        </div>
        <button
          type="button"
          className="btn-sec"
          disabled={carregando}
          onClick={() => {
            if (aba === "cozinha") void carregarCozinha();
            else if (aba === "historico") void carregarHistorico();
            else void carregarContas();
          }}
        >
          {carregando ? "…" : "Atualizar"}
        </button>
      </section>

      <div className="abas" role="tablist" aria-label="Pedidos">
        {!ehCozinha ? (
          <button
            type="button"
            role="tab"
            aria-selected={aba === "lancar"}
            className={`aba${aba === "lancar" ? " on" : ""}`}
            onClick={() => setAba("lancar")}
          >
            Lançar
          </button>
        ) : null}
        <button
          type="button"
          role="tab"
          aria-selected={aba === "cozinha"}
          className={`aba${aba === "cozinha" ? " on" : ""}`}
          onClick={() => setAba("cozinha")}
        >
          Cozinha
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={aba === "historico"}
          className={`aba${aba === "historico" ? " on" : ""}`}
          onClick={() => setAba("historico")}
        >
          Histórico
        </button>
      </div>

      <Avisos erro={erro} ok={ok} />

      {aba === "lancar" ? (
        <div className="lancar-layout">
          <section className="painel-bloco">
            <header className="painel-bloco-cab">
              <div>
                <h2>Nova conta</h2>
                <p className="ajuda" style={{ margin: 0 }}>
                  Balcão, retirada, entrega ou mesa — depois cai no PDV.
                </p>
              </div>
            </header>
            <form className="form-drawer" onSubmit={abrirELancar}>
              <div className="pdv-chips" style={{ marginBottom: 12 }}>
                {(
                  [
                    ["BALCAO", "Balcão"],
                    ["RETIRADA", "Retirada"],
                    ["ENTREGA", "Entrega"],
                    ["MESA", "Mesa"],
                  ] as const
                ).map(([v, rotulo]) => (
                  <button
                    key={v}
                    type="button"
                    className={`pdv-chip${tipoNovo === v ? " on" : ""}`}
                    onClick={() => setTipoNovo(v)}
                  >
                    {rotulo}
                  </button>
                ))}
              </div>

              {tipoNovo === "MESA" ? (
                <label className="campo">
                  <span>Mesa livre</span>
                  <select value={mesaId} onChange={(e) => setMesaId(e.target.value)} required>
                    <option value="">— selecione —</option>
                    {mesasLivres.map((m) => (
                      <option key={m.id} value={m.id}>
                        Mesa {m.numero}
                      </option>
                    ))}
                  </select>
                  {!mesasLivres.length ? (
                    <span className="ajuda">
                      Nenhuma mesa livre. Cadastre no{" "}
                      <Link to="/painel/mesas">mapa do salão</Link>.
                    </span>
                  ) : null}
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

              <div className="form-acoes">
                <button type="submit" className="btn-prim" disabled={abrindo}>
                  {abrindo ? "Abrindo…" : "Abrir e lançar itens"}
                </button>
              </div>
            </form>
          </section>

          <section className="painel-bloco">
            <header className="painel-bloco-cab">
              <div>
                <h2>Contas abertas</h2>
                <p className="ajuda" style={{ margin: 0 }}>
                  Continuar lançando numa conta que já existe.
                </p>
              </div>
            </header>
            {contas.length === 0 ? (
              <div className="lista-vazia" style={{ padding: 20 }}>
                <strong>Nenhuma conta aberta</strong>
                <span>Abra uma à esquerda (balcão, retirada, entrega ou mesa).</span>
              </div>
            ) : (
              <ul className="lista-prod">
                {contas.map((c) => (
                  <li key={c.id} className="prod-item">
                    <div className="prod-info">
                      <strong>
                        {c.mesa ? `Mesa ${c.mesa.numero}` : rotuloTipo(c.tipo_atendimento)} ·{" "}
                        {c.codigo_atendimento}
                      </strong>
                      <span className="prod-meta">
                        {c.cliente_nome ? `${c.cliente_nome} · ` : ""}
                        {new Date(c.aberto_em).toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <div className="prod-acoes">
                      <Link className="btn-prim" to={`/painel/pdv/${c.id}`}>
                        Lançar
                      </Link>
                      <Link className="btn-ghost" to={`/painel/conta/${c.id}`}>
                        Pagar
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : null}

      {aba === "historico" ? (
        <section className="painel-bloco">
          <header className="painel-bloco-cab">
            <div>
              <h2>Histórico recente</h2>
              <p className="ajuda" style={{ margin: 0 }}>
                Pedidos entregues ou cancelados.
              </p>
            </div>
          </header>
          {historico.length === 0 ? (
            <div className="lista-vazia" style={{ padding: 24 }}>
              <strong>Sem histórico ainda</strong>
              <span>Quando a cozinha marcar entregue, aparece aqui.</span>
            </div>
          ) : (
            <ul className="hist-lista">
              {historico.map((p) => (
                <li key={p.id} className="hist-item">
                  <div className="hist-topo">
                    <div>
                      <strong>
                        {p.codigo_pedido}
                        {p.atendimento.mesa ? ` · Mesa ${p.atendimento.mesa.numero}` : ""}
                      </strong>
                      <span>
                        {p.atendimento.codigo_atendimento} · {rotuloTipo(p.atendimento.tipo_atendimento)} ·{" "}
                        {new Date(p.createdAt).toLocaleString("pt-BR")}
                      </span>
                    </div>
                    <em className={`hist-badge status-${p.status.toLowerCase()}`}>
                      {rotuloStatus(p.status)}
                    </em>
                  </div>
                  <ul className="kds-itens">
                    {p.itens.map((i) => (
                      <li key={i.id} className={i.cancelado ? "cancelado" : ""}>
                        <strong>
                          {i.quantidade}× {i.nome_produto}
                        </strong>
                        {i.cancelado ? <em> cancelado</em> : null}
                      </li>
                    ))}
                  </ul>
                  <div className="hist-acoes">
                    <Link className="btn-ghost" to={`/painel/conta/${p.atendimento.id}`}>
                      Ver conta
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {aba === "cozinha" ? (
        <div className="kds-grid">
          {colunas.map((col) => {
            const pedidos = lista.filter((p) => p.status === col.key);
            return (
              <section key={col.key} className={`painel-bloco kds-col ${col.classe}`}>
                <header className="kds-col-cab">
                  <h2>{col.titulo}</h2>
                  <span>{pedidos.length}</span>
                </header>
                {pedidos.length === 0 ? (
                  <p className="kds-vazio">Vazio</p>
                ) : (
                  <ul className="kds-lista">
                    {pedidos.map((p) => {
                      const mins = minutosDesde(p.createdAt);
                      const ativos = p.itens.filter((i) => !i.cancelado);
                      return (
                        <li key={p.id} className={`kds-card${mins >= 15 ? " atrasado" : ""}`}>
                          <div className="kds-card-topo">
                            <div>
                              <strong className="kds-codigo">
                                {p.atendimento.mesa
                                  ? `Mesa ${p.atendimento.mesa.numero}`
                                  : rotuloTipo(p.atendimento.tipo_atendimento)}
                              </strong>
                              <span>
                                {p.codigo_pedido} · {mins} min
                              </span>
                            </div>
                          </div>
                          <ul className="kds-itens">
                            {ativos.map((i) => (
                              <li key={i.id}>
                                <strong>
                                  {i.quantidade}× {i.nome_produto}
                                </strong>
                                {i.escolhas.length || i.adicionais.length ? (
                                  <span>
                                    {[
                                      ...i.escolhas.map((e) =>
                                        e.quantidade > 1
                                          ? `${e.quantidade}x ${e.nome_opcao}`
                                          : e.nome_opcao
                                      ),
                                      ...i.adicionais.map((a) =>
                                        a.quantidade > 1
                                          ? `${a.quantidade}x ${a.nome_adicional}`
                                          : a.nome_adicional
                                      ),
                                    ].join(", ")}
                                  </span>
                                ) : null}
                                {i.observacao ? (
                                  <span className="kds-obs">Obs: {i.observacao}</span>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                          {PROXIMO[p.status] ? (
                            <button
                              type="button"
                              className="kds-btn"
                              disabled={avancando.has(p.id)}
                              onClick={() => void avancar(p)}
                            >
                              {avancando.has(p.id) ? "…" : PROXIMO[p.status]!.label}
                            </button>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
