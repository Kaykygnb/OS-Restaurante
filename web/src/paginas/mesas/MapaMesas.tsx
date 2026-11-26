import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { lerUsuario, podeOperarCaixa } from "../../auth/sessao";
import CampoAprovacao from "../../componentes/CampoAprovacao";
import Dialogo from "../../componentes/ui/Dialogo";
import { Carregando, ErroCarga, Vazio } from "../../componentes/ui/Estados";
import Icone from "../../componentes/ui/Icone";
import { useSistema } from "../../estado/sistema-ctx";
import { api, type ApiErro } from "../../servicos/api";
import { formatarReais } from "../../util/dinheiro";

type Mesa = {
  id: number;
  numero: number;
  ativo: boolean;
  status: string;
  atendimento_aberto: {
    id: number;
    codigo_atendimento: string;
    cliente_nome: string | null;
    aberto_em: string;
    total_centavos?: number | null;
    com_itens?: boolean;
  } | null;
};
const estaOcupada = (m: Mesa) => m.status === "OCUPADA";
type Item = { id: number; nome_produto: string; quantidade: number; preco_centavos: number; cancelado: boolean; total_centavos?: number; escolhas?: { preco_extra_centavos: number; quantidade: number }[]; adicionais?: { nome_adicional: string; preco_centavos: number; quantidade: number }[] };
type Detalhe = {
  id: number;
  codigo_atendimento: string;
  aberto_em: string;
  usuario?: { nome: string } | null;
  mesa: { numero: number } | null;
  pedidos: { itens: Item[] }[];
  taxa_servico_aplicada?: boolean;
  totais?: { subtotal_centavos: number; taxa_servico_centavos?: number; total_centavos: number; pago_centavos: number; restante_centavos: number };
};
type Filtro = "todas" | "ocupadas" | "livres";

const minutos = (iso: string) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
const tempo = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`);
function linhaItem(i: Item) {
  if (i.cancelado) return 0;
  if (typeof i.total_centavos === "number") return i.total_centavos;
  const ex = (i.escolhas ?? []).reduce((s, e) => s + e.preco_extra_centavos * e.quantidade, 0) + (i.adicionais ?? []).reduce((s, a) => s + a.preco_centavos * a.quantidade, 0);
  return i.quantidade * (i.preco_centavos + ex);
}

/**
 * Pranchas 04a–04e: mapa de mesas com estado escrito (não só cor), painel da conta sempre visível no PC
 * e "Receber conta" como ação principal. No celular a conta abre numa folha.
 */
export default function MapaMesas() {
  const navegar = useNavigate();
  const { avisar } = useSistema();
  const gestao = ["ROOT", "ADMIN", "GERENTE"].includes(lerUsuario()?.tipo ?? "");
  const [mesas, setMesas] = useState<Mesa[] | null>(null);
  const [erro, setErro] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState<number | null>(null);
  const [det, setDet] = useState<Detalhe | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [mesaOcupada, setMesaOcupada] = useState<{ numero: number; mesaId: number; atendimentoId: number; codigo: string } | null>(null);
  const [modal, setModal] = useState<null | "transferir" | "juntar" | "cancelar" | "detalhe-cel">(null);
  const [alvo, setAlvo] = useState("");
  const [motivo, setMotivo] = useState("");
  const [aprovador, setAprovador] = useState("");
  const [pin, setPin] = useState("");
  const [erroModal, setErroModal] = useState("");
  const pedido = useRef(0);
  const [cel, setCel] = useState(() => window.matchMedia("(max-width: 699px)").matches);
  useEffect(() => {
    const consulta = window.matchMedia("(max-width: 699px)");
    const atualizar = (e: MediaQueryListEvent) => setCel(e.matches);
    consulta.addEventListener("change", atualizar);
    return () => consulta.removeEventListener("change", atualizar);
  }, []);

  const carregar = useCallback(() => {
    api("/mesas")
      .then((m: Mesa[]) => {
        setMesas(m.filter((x) => x.ativo !== false).sort((a, b) => a.numero - b.numero));
        setErro("");
      })
      .catch((e: ApiErro) => setErro(e.message));
  }, []);
  useEffect(() => {
    carregar();
    const t = setInterval(carregar, 15000);
    return () => clearInterval(t);
  }, [carregar]);

  const abrirDetalhe = useCallback((atId: number) => {
    const n = ++pedido.current; // só a resposta do último toque vale
    api(`/atendimentos/${atId}`)
      .then((d: Detalhe) => n === pedido.current && setDet(d))
      .catch((e: ApiErro) => n === pedido.current && avisar(e.message, "err"));
  }, [avisar]);

  const mesaSel = mesas?.find((m) => m.id === sel) ?? null;
  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (mesas ?? []).filter((m) => {
      if (filtro === "ocupadas" && !estaOcupada(m)) return false;
      if (filtro === "livres" && estaOcupada(m)) return false;
      if (!q) return true;
      return String(m.numero) === q.replace(/\D/g, "") || (m.atendimento_aberto?.cliente_nome ?? "").toLowerCase().includes(q);
    });
  }, [mesas, filtro, busca]);
  const ocupadas = (mesas ?? []).filter(estaOcupada);
  // Destino de transferência: sem conta aberta (mesmo vazia), senão o índice único bloqueia.
  const livresTransferir = (mesas ?? []).filter((m) => !m.atendimento_aberto);

  async function tocar(m: Mesa) {
    if (estaOcupada(m) && m.atendimento_aberto) {
      setSel(m.id);
      setDet(null);
      abrirDetalhe(m.atendimento_aberto.id);
      if (cel) setModal("detalhe-cel");
      return;
    }
    if (ocupado) return;
    setOcupado(true);
    try {
      // Conta só “ocupa” a mesa depois do 1º item; ao voltar sem itens o GET /mesas libera.
      const at = (await api("/atendimentos", { method: "POST", body: JSON.stringify({ tipo_atendimento: "MESA", mesa_id: m.id }) })) as { id: number };
      avisar(`Mesa ${m.numero} aberta. Lance os itens.`, "ok");
      navegar(`/painel/pdv/${at.id}`);
    } catch (e) {
      const err = e as ApiErro;
      if (err.codigo === "mesa_ocupada" && err.dados?.atendimento_id) {
        setMesaOcupada({ numero: m.numero, mesaId: m.id, atendimentoId: Number(err.dados.atendimento_id), codigo: String(err.dados.codigo_atendimento ?? "") });
      } else {
        avisar(err.message, "err");
      }
      carregar();
    } finally {
      setOcupado(false);
    }
  }

  async function acaoModal() {
    if (!det) return;
    setErroModal("");
    setOcupado(true);
    try {
      if (modal === "transferir") {
        if (!alvo) throw new Error("Escolha a mesa livre de destino.");
        await api(`/atendimentos/${det.id}/transferir`, { method: "POST", body: JSON.stringify({ mesa_id: Number(alvo) }) });
        avisar(`Conta passada para a mesa ${mesas?.find((m) => m.id === Number(alvo))?.numero}.`, "ok");
        setSel(Number(alvo));
      } else if (modal === "juntar") {
        if (!alvo) throw new Error("Escolha a mesa que vai entrar nesta conta.");
        await api(`/atendimentos/${alvo}/juntar`, { method: "POST", body: JSON.stringify({ destino_id: det.id }) });
        avisar("Contas juntadas.", "ok");
      } else if (modal === "cancelar") {
        if (!motivo.trim()) throw new Error("Diga o motivo do cancelamento.");
        if (!gestao && (!aprovador || pin.length < 4)) throw new Error("Escolha o gerente e digite o PIN.");
        await api(`/atendimentos/${det.id}/cancelar`, {
          method: "POST",
          body: JSON.stringify({ motivo: motivo.trim(), ...(gestao ? {} : { aprovacao: { aprovador_id: Number(aprovador), pin } }) }),
        });
        avisar(`Conta ${det.codigo_atendimento} cancelada.`, "ok");
        setSel(null);
        setDet(null);
      }
      setModal(null);
      setAlvo("");
      setMotivo("");
      setPin("");
      carregar();
      if (modal !== "cancelar") abrirDetalhe(det.id);
    } catch (e) {
      setErroModal((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  async function preConta() {
    if (!det) return;
    try {
      await api(`/atendimentos/${det.id}/preconta`, { method: "POST" });
      avisar("Pré-conta enviada para a impressora (NÃO É DOCUMENTO FISCAL).", "ok");
    } catch (e) {
      avisar((e as Error).message, "err");
    }
  }

  if (erro && !mesas) return <ErroCarga mensagem={erro} onTentar={carregar} />;
  if (!mesas) return <Carregando linhas={4} rotulo="Carregando mesas" />;
  if (!mesas.length)
    return (
      <div className="cartao">
        <Vazio icone="mesas" titulo="Nenhuma mesa cadastrada" acao={gestao ? <button type="button" className="btn" onClick={() => navegar("/painel/cadastro-mesas")}>Cadastrar mesas</button> : undefined}>
          {gestao ? "Cadastre as mesas em Configurações › Mesas." : "Peça ao gerente para cadastrar as mesas."}
        </Vazio>
      </div>
    );

  const painel = det ? (
    <div className="pilha" data-testid="painel-conta">
      <div>
        <div className="entre">
          <h2 className="mesa-titulo">Mesa {det.mesa?.numero ?? mesaSel?.numero}</h2>
          <span className="tag tag-info">{det.codigo_atendimento}</span>
        </div>
        <span className="muted pequeno">
          Aberta há {tempo(minutos(det.aberto_em))}
          {det.usuario?.nome ? ` por ${det.usuario.nome}` : ""}
        </span>
      </div>
      <div className="pilha gap-6 scroll-lista">
        {det.pedidos.flatMap((p) => p.itens).filter((i) => !i.cancelado).length === 0 ? (
          <p className="muted">Nenhum item lançado ainda.</p>
        ) : (
          det.pedidos
            .flatMap((p) => p.itens)
            .filter((i) => !i.cancelado)
            .map((i) => (
              <div key={i.id} className="entre pequeno">
                <span>
                  {i.quantidade}× {i.nome_produto}
                  {i.adicionais?.length ? ` + ${i.adicionais.map((a) => a.nome_adicional.toLowerCase()).join(", ")}` : ""}
                </span>
                <span className="num">{formatarReais(linhaItem(i))}</span>
              </div>
            ))
        )}
      </div>
      {det.totais ? (
        <div className="pilha gap-6 borda-topo">
          <div className="entre muted pequeno">
            <span>Subtotal</span>
            <span className="num">{formatarReais(det.totais.subtotal_centavos)}</span>
          </div>
          {det.totais.taxa_servico_centavos ? (
            <div className="entre muted pequeno">
              <span>Serviço</span>
              <span className="num">{formatarReais(det.totais.taxa_servico_centavos)}</span>
            </div>
          ) : null}
          {det.totais.pago_centavos ? (
            <div className="entre pequeno texto-ok">
              <span>Já pago</span>
              <span className="num">{formatarReais(det.totais.pago_centavos)}</span>
            </div>
          ) : null}
          <div className="entre totais-finais">
            <span>Total</span>
            <span className="num">{formatarReais(det.totais.total_centavos)}</span>
          </div>
        </div>
      ) : null}
      {podeOperarCaixa() ? (
        <button type="button" className="btn btn-pri btn-g btn-bloco" onClick={() => navegar(`/painel/conta/${det.id}`)}>
          Receber conta
        </button>
      ) : (
        <p className="onde-fica mb-0">
          Para receber, imprima a pré-conta e chame quem está no caixa.
        </p>
      )}
      <div className="grade-2 gap-8">
        <button type="button" className="btn" onClick={() => navegar(`/painel/pdv/${det.id}`)}>
          Lançar itens
        </button>
        <button type="button" className="btn" onClick={preConta}>
          Imprimir pré-conta
        </button>
        <button type="button" className="btn" onClick={() => (setAlvo(""), setErroModal(""), setModal("transferir"))}>
          Transferir
        </button>
        <button type="button" className="btn" disabled={ocupadas.length < 2} onClick={() => (setAlvo(""), setErroModal(""), setModal("juntar"))}>
          Juntar mesas
        </button>
      </div>
      <button type="button" className="btn btn-link texto-perigo" onClick={() => (setMotivo(""), setErroModal(""), setModal("cancelar"))}>
        Cancelar conta {gestao ? "" : "(pede PIN do gerente)"}
      </button>
    </div>
  ) : sel ? (
    <Carregando linhas={3} rotulo="Carregando a conta" />
  ) : (
    <Vazio icone="mesas" titulo="Toque numa mesa">
      Ocupada = tem item. Livre abre o PDV para lançar.
    </Vazio>
  );

  return (
    <div className="mesas">
      <div className="mesas-esq">
        <div className="cab-pagina" style={{ marginBottom: 0 }}>
          <div className="segmento" role="group" aria-label="Filtrar mesas">
            <button type="button" aria-pressed={filtro === "todas"} onClick={() => setFiltro("todas")}>
              Todas ({mesas.length})
            </button>
            <button type="button" aria-pressed={filtro === "ocupadas"} onClick={() => setFiltro("ocupadas")}>
              Ocupadas ({ocupadas.length})
            </button>
            <button type="button" aria-pressed={filtro === "livres"} onClick={() => setFiltro("livres")}>
              Livres ({mesas.length - ocupadas.length})
            </button>
          </div>
          <label className="venda-busca acoes" style={{ minWidth: 220, minHeight: 44 }}>
            <Icone nome="lupa" cor="var(--ink3)" />
            <span className="sr">Buscar mesa ou cliente</span>
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar mesa ou cliente" style={{ minHeight: 42 }} />
          </label>
          {gestao ? <button type="button" className="btn" onClick={() => navegar("/painel/cadastro-mesas")}>Gerenciar mesas</button> : null}
        </div>
        {lista.length === 0 ? (
          <Vazio icone="lupa" titulo="Nenhuma mesa neste filtro" />
        ) : (
          <div className="mesas-grade">
            {lista.map((m) => {
              const at = m.atendimento_aberto;
              const ocup = estaOcupada(m);
              return (
                <button
                  key={m.id}
                  type="button"
                  className={`mesa${ocup ? " ocupada" : ""}${m.id === sel ? " sel" : ""}`}
                  onClick={() => tocar(m)}
                  disabled={ocupado && !at}
                  aria-label={`Mesa ${m.numero}, ${ocup ? `ocupada há ${tempo(minutos(at!.aberto_em))}` : "livre, tocar para abrir"}`}
                >
                  <strong>Mesa {m.numero}</strong>
                  {ocup && at?.total_centavos != null ? <span className="mesa-valor">{formatarReais(at.total_centavos)}</span> : null}
                  {ocup && at?.cliente_nome ? <span className="pequeno">{at.cliente_nome}</span> : null}
                  <span className="mesa-estado">{ocup ? `Ocupada · ${tempo(minutos(at!.aberto_em))}` : "Livre · tocar para abrir"}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      {!cel ? <aside className="cartao mesas-painel">{painel}</aside> : null}

      {modal === "detalhe-cel" ? (
        <Dialogo titulo={`Mesa ${mesaSel?.numero ?? ""}`} onFechar={() => setModal(null)}>
          {painel}
        </Dialogo>
      ) : null}
      {mesaOcupada ? (
        <Dialogo
          titulo={`A mesa ${mesaOcupada.numero} já tem uma conta aberta`}
          sub="Outra pessoa abriu esta mesa agora há pouco. Para não ficar com duas contas na mesma mesa, use a conta que já existe."
          onFechar={() => setMesaOcupada(null)}
          pe={
            <>
              <button type="button" className="btn" onClick={() => setMesaOcupada(null)}>
                Voltar
              </button>
              <button
                type="button"
                className="btn btn-pri"
                onClick={() => {
                  const x = mesaOcupada;
                  setMesaOcupada(null);
                  navegar(`/painel/pdv/${x.atendimentoId}`);
                }}
              >
                Abrir a conta {mesaOcupada.codigo}
              </button>
            </>
          }
        >
          <p className="muted">Os itens que você lançar vão para a conta {mesaOcupada.codigo}, da mesa {mesaOcupada.numero}.</p>
        </Dialogo>
      ) : null}
      {modal && modal !== "detalhe-cel" ? (
        <Dialogo
          titulo={modal === "transferir" ? "Transferir para outra mesa" : modal === "juntar" ? `Juntar outra mesa na mesa ${det?.mesa?.numero}` : `Cancelar a conta ${det?.codigo_atendimento}`}
          sub={modal === "cancelar" ? "Os itens saem da conta e a cozinha é avisada. Fica na auditoria." : modal === "transferir" ? `A conta da mesa ${mesaSel?.numero ?? ""} será transferida para o destino escolhido. A mesa de origem ficará livre.` : modal === "juntar" ? `Os pedidos e valores da mesa escolhida entrarão na conta da mesa ${mesaSel?.numero ?? ""}. A mesa de origem ficará livre.` : undefined}
          onFechar={() => setModal(null)}
          fecharComEsc={!ocupado}
          pe={
            <>
              <button type="button" className="btn" onClick={() => setModal(null)}>
                Voltar
              </button>
              <button type="button" className={`btn ${modal === "cancelar" ? "btn-perigo" : "btn-pri"}`} disabled={ocupado || (modal === "cancelar" ? !motivo.trim() : !alvo)} onClick={acaoModal}>
                {modal === "transferir" ? "Transferir" : modal === "juntar" ? "Juntar" : "Cancelar conta"}
              </button>
            </>
          }
        >
          {modal === "transferir" ? (
            <label className="fld">
              <span>Mesa livre de destino</span>
              <select value={alvo} onChange={(e) => setAlvo(e.target.value)} data-foco>
                <option value="">Escolha…</option>
                {livresTransferir.map((m) => (
                  <option key={m.id} value={m.id}>
                    Mesa {m.numero}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {modal === "juntar" ? (
            <label className="fld">
              <span>Mesa que vai entrar nesta conta</span>
              <select value={alvo} onChange={(e) => setAlvo(e.target.value)} data-foco>
                <option value="">Escolha…</option>
                {ocupadas
                  .filter((m) => m.atendimento_aberto!.id !== det?.id)
                  .map((m) => (
                    <option key={m.id} value={m.atendimento_aberto!.id}>
                      Mesa {m.numero} · {m.atendimento_aberto!.codigo_atendimento}
                    </option>
                  ))}
              </select>
            </label>
          ) : null}
          {modal !== "cancelar" && alvo ? <p className="feedback-card">{modal === "transferir" ? `Origem: mesa ${det?.mesa?.numero ?? ""} · ${formatarReais(det?.totais?.total_centavos ?? 0)}. Destino: mesa ${mesas.find(m => m.id === Number(alvo))?.numero}. A mesa de origem ficará livre.` : `A conta da mesa ${mesas.find(m => m.atendimento_aberto?.id === Number(alvo))?.numero} (${formatarReais(mesas.find(m => m.atendimento_aberto?.id === Number(alvo))?.atendimento_aberto?.total_centavos ?? 0)}) será incorporada à mesa ${det?.mesa?.numero}. Total combinado: ${formatarReais((det?.totais?.total_centavos ?? 0) + (mesas.find(m => m.atendimento_aberto?.id === Number(alvo))?.atendimento_aberto?.total_centavos ?? 0))}. A mesa incorporada ficará livre.`}</p> : null}
          {modal === "cancelar" ? (
            <>
              <label className="fld">
                <span>Motivo</span>
                <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: cliente desistiu" data-foco />
              </label>
              {!gestao ? <CampoAprovacao aprovadorId={aprovador} onAprovador={setAprovador} pin={pin} onPin={setPin} explicacao="Cancelar conta precisa de um gerente." /> : null}
            </>
          ) : null}
          {erroModal ? (
            <p role="alert" style={{ color: "var(--err)", margin: 0 }}>
              {erroModal}
            </p>
          ) : null}
        </Dialogo>
      ) : null}
    </div>
  );
}
