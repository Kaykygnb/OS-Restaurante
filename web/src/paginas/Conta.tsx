import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import Ajuda from "../componentes/Ajuda";
import { api } from "../servicos/api";
import { formatarReais, reaisParaCentavos } from "../util/dinheiro";

type Forma = { id: number; nome: string; abre_gaveta: boolean };

function itemLinhaCentavos(i: any) {
  if (i.cancelado) return 0;
  const extras =
    (i.escolhas ?? []).reduce((s: number, e: any) => s + e.preco_extra_centavos * e.quantidade, 0) +
    (i.adicionais ?? []).reduce((s: number, a: any) => s + a.preco_centavos * a.quantidade, 0);
  return i.quantidade * (i.preco_centavos + extras);
}

export default function Conta() {
  const { atendimentoId } = useParams();
  const id = Number(atendimentoId);
  if (!Number.isFinite(id)) return <Navigate to="/painel/mesas" replace />;

  const [at, setAt] = useState<any>(null);
  const [formas, setFormas] = useState<Forma[]>([]);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  const [mostrarAjustes, setMostrarAjustes] = useState(false);

  const [desconto, setDesconto] = useState("");
  const [motivoDesc, setMotivoDesc] = useState("");
  const [pin, setPin] = useState("");
  const [aprovadorId, setAprovadorId] = useState("");
  const [formaId, setFormaId] = useState("");
  const [valorPag, setValorPag] = useState("");
  const [recebido, setRecebido] = useState("");

  const carregar = useCallback(async () => {
    setErro("");
    try {
      const [a, f] = await Promise.all([
        api(`/atendimentos/${id}`),
        api("/formas-pagamento") as Promise<Forma[]>,
      ]);
      setAt(a);
      setFormas(f);
      // Não pré-seleciona forma: evita "Pagar restante" com um toque na forma errada
      setDesconto(a.desconto_centavos ? (a.desconto_centavos / 100).toFixed(2).replace(".", ",") : "");
      const rest = a.totais?.restante_centavos ?? 0;
      setValorPag(rest > 0 ? (rest / 100).toFixed(2).replace(".", ",") : "");
    } catch (e) {
      setErro((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const itens = useMemo(
    () => (at?.pedidos ?? []).flatMap((p: any) => p.itens.map((i: any) => ({ ...i, codigo_pedido: p.codigo_pedido }))),
    [at]
  );

  const forma = formas.find((f) => String(f.id) === formaId);
  const restante = at?.totais?.restante_centavos ?? 0;
  const trocoPrevisto =
    forma?.abre_gaveta && recebido
      ? Math.max(0, reaisParaCentavos(recebido) - reaisParaCentavos(valorPag || "0"))
      : 0;

  async function taxa(aplicar: boolean) {
    setBusy(true);
    setErro("");
    try {
      await api(`/atendimentos/${id}/taxa-servico`, {
        method: "POST",
        body: JSON.stringify({ aplicar }),
      });
      setOk(aplicar ? "Taxa de serviço aplicada" : "Taxa removida");
      await carregar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function salvarDesconto() {
    setBusy(true);
    setErro("");
    try {
      await api(`/atendimentos/${id}/desconto`, {
        method: "POST",
        body: JSON.stringify({
          valor_centavos: reaisParaCentavos(desconto || "0"),
          motivo: motivoDesc || null,
          pin: pin || undefined,
          aprovador_id: aprovadorId ? Number(aprovadorId) : undefined,
        }),
      });
      setOk("Desconto salvo");
      setPin("");
      await carregar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function preconta() {
    setBusy(true);
    setErro("");
    try {
      await api(`/atendimentos/${id}/preconta`, { method: "POST" });
      setOk("Pré-conta impressa");
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function pagar(e?: React.FormEvent, valorOverride?: number) {
    e?.preventDefault();
    if (!formaId) {
      setErro("Escolha a forma de pagamento");
      return;
    }
    const valor = valorOverride ?? reaisParaCentavos(valorPag);
    if (!Number.isFinite(valor) || valor <= 0) {
      setErro("Informe o valor");
      return;
    }
    const nomeForma = forma?.nome ?? "pagamento";
    if (
      !confirm(
        `Receber ${formatarReais(valor)} em ${nomeForma}?`
      )
    ) {
      return;
    }
    setBusy(true);
    setErro("");
    try {
      await api(`/atendimentos/${id}/pagamentos`, {
        method: "POST",
        body: JSON.stringify({
          forma_pagamento_id: Number(formaId),
          valor_centavos: valor,
          valor_recebido_centavos: recebido ? reaisParaCentavos(recebido) : valor,
        }),
      });
      setOk("Pagamento ok");
      setRecebido("");
      await carregar();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function fechar() {
    if (!confirm("Fechar a conta? Totais serão congelados.")) return;
    setBusy(true);
    setErro("");
    try {
      await api(`/atendimentos/${id}/fechar`, { method: "POST" });
      setOk("Conta fechada");
      await carregar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!at) {
    return (
      <div className="cardapio">
        {erro ? <p className="feedback-card feedback-erro">{erro}</p> : <p>Carregando conta…</p>}
      </div>
    );
  }

  const titulo = at.mesa ? `Mesa ${at.mesa.numero}` : at.tipo_atendimento;

  return (
    <div className="cardapio conta-pagina">
      <section className="pdv-topbar">
        <div>
          <span className="cardapio-kicker">FECHAMENTO</span>
          <h2 className="titulo-com-ajuda">
            {titulo} · {at.codigo_atendimento}
            <Ajuda texto="Confira itens, ajuste taxa/desconto, receba e feche. Caixa precisa estar aberto pra pagar." />
          </h2>
          <p>
            {at.cliente_nome ? `${at.cliente_nome} · ` : ""}
            {at.status}
          </p>
        </div>
        <div className="config-toolbar-inline">
          <Link className="btn-sec" to={`/painel/pdv/${id}`}>
            + Itens
          </Link>
          <Link className="btn-ghost" to="/painel/mesas">
            Mesas
          </Link>
        </div>
      </section>

      {erro ? <p className="feedback-card feedback-erro">{erro}</p> : null}
      {ok ? <p className="feedback-card feedback-ok">{ok}</p> : null}

      <div className="conta-layout">
        <section className="painel-bloco">
          <header className="painel-bloco-cab">
            <h2>Itens</h2>
            <span className="ajuda">{itens.filter((i: any) => !i.cancelado).length} ativos</span>
          </header>
          <ul className="conta-itens">
            {itens.length === 0 ? (
              <li className="lista-vazia">
                <strong>Sem itens</strong>
                <span>
                  <Link to={`/painel/pdv/${id}`}>Lançar no PDV</Link>
                </span>
              </li>
            ) : (
              itens.map((i: any) => (
                <li key={i.id} className={i.cancelado ? "cancelado" : ""}>
                  <div>
                    <strong>
                      {i.quantidade}× {i.nome_produto}
                    </strong>
                    <span>
                      {i.codigo_pedido}
                      {i.observacao ? ` · ${i.observacao}` : ""}
                      {i.cancelado ? " · CANCELADO" : ""}
                    </span>
                  </div>
                  <em>{formatarReais(itemLinhaCentavos(i))}</em>
                </li>
              ))
            )}
          </ul>

          {(at.pagamentos?.length ?? 0) > 0 ? (
            <div className="conta-pagamentos-hist">
              <p className="bloco-variante-titulo">Pagamentos</p>
              <ul>
                {at.pagamentos.map((p: any) => (
                  <li key={p.id}>
                    <span>{p.forma_pagamento?.nome ?? "—"}</span>
                    <strong>{formatarReais(p.valor_centavos)}</strong>
                    {p.troco_centavos ? <em>troco {formatarReais(p.troco_centavos)}</em> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <aside className="painel-bloco conta-painel">
          <div className="conta-totais">
            <div>
              <span>Subtotal</span>
              <strong>{formatarReais(at.totais?.subtotal_centavos ?? 0)}</strong>
            </div>
            {at.desconto_centavos ? (
              <div>
                <span>Desconto</span>
                <strong>-{formatarReais(at.desconto_centavos)}</strong>
              </div>
            ) : null}
            {at.taxa_servico_centavos ? (
              <div>
                <span>Serviço</span>
                <strong>{formatarReais(at.taxa_servico_centavos)}</strong>
              </div>
            ) : null}
            {at.taxa_entrega_centavos ? (
              <div>
                <span>Entrega</span>
                <strong>{formatarReais(at.taxa_entrega_centavos)}</strong>
              </div>
            ) : null}
            <div className="conta-total-linha">
              <span>Total</span>
              <strong>{formatarReais(at.totais?.total_centavos ?? 0)}</strong>
            </div>
            <div>
              <span>Pago</span>
              <strong>{formatarReais(at.totais?.pago_centavos ?? 0)}</strong>
            </div>
            <div className="conta-restante">
              <span>Restante</span>
              <strong>{formatarReais(restante)}</strong>
            </div>
          </div>

          {at.status === "ABERTO" ? (
            <>
              <div className="conta-acoes-rapidas">
                <button type="button" className="btn-sec" disabled={busy} onClick={() => void preconta()}>
                  Pré-conta
                </button>
                <button
                  type="button"
                  className={`btn-sec${at.taxa_servico_aplicada ? " on-sel" : ""}`}
                  disabled={busy}
                  onClick={() => void taxa(!at.taxa_servico_aplicada)}
                >
                  {at.taxa_servico_aplicada ? "Remover 10%" : "Taxa 10%"}
                </button>
                <button type="button" className="btn-ghost" onClick={() => setMostrarAjustes((v) => !v)}>
                  Desconto
                </button>
              </div>

              {mostrarAjustes ? (
                <div className="conta-ajustes">
                  <label className="campo">
                    <span>Desconto (R$)</span>
                    <input value={desconto} onChange={(e) => setDesconto(e.target.value)} />
                  </label>
                  <label className="campo">
                    <span>Motivo</span>
                    <input value={motivoDesc} onChange={(e) => setMotivoDesc(e.target.value)} />
                  </label>
                  <label className="campo">
                    <span>ID do aprovador</span>
                    <input
                      value={aprovadorId}
                      onChange={(e) => setAprovadorId(e.target.value)}
                      inputMode="numeric"
                      autoComplete="off"
                    />
                  </label>
                  <label className="campo">
                    <span>PIN gerente</span>
                    <input
                      type="password"
                      value={pin}
                      onChange={(e) => setPin(e.target.value)}
                      inputMode="numeric"
                      autoComplete="off"
                    />
                  </label>
                  <button type="button" className="btn-sec" disabled={busy} onClick={() => void salvarDesconto()}>
                    Aplicar desconto
                  </button>
                </div>
              ) : null}

              <form className="conta-pagar" onSubmit={(e) => void pagar(e)}>
                <p className="bloco-variante-titulo">Receber</p>
                <div className="pdv-chips">
                  {formas.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      className={`pdv-chip${String(f.id) === formaId ? " on" : ""}`}
                      onClick={() => setFormaId(String(f.id))}
                    >
                      {f.nome}
                    </button>
                  ))}
                </div>
                <div className="config-grid-2">
                  <label className="campo">
                    <span>Valor</span>
                    <input value={valorPag} onChange={(e) => setValorPag(e.target.value)} required />
                  </label>
                  {forma?.abre_gaveta ? (
                    <label className="campo">
                      <span>Recebido</span>
                      <input
                        value={recebido}
                        onChange={(e) => setRecebido(e.target.value)}
                        placeholder={valorPag}
                      />
                    </label>
                  ) : null}
                </div>
                {trocoPrevisto > 0 ? (
                  <p className="conta-troco">Troco {formatarReais(trocoPrevisto)}</p>
                ) : null}
                <div className="conta-pagar-btns">
                  <button
                    type="button"
                    className="btn-sec"
                    disabled={busy || restante <= 0}
                    onClick={() => void pagar(undefined, restante)}
                  >
                    Pagar restante
                  </button>
                  <button type="submit" className="btn-prim" disabled={busy || restante <= 0}>
                    Registrar
                  </button>
                </div>
                <p className="ajuda">Abra o caixa antes. Dinheiro aciona a gaveta.</p>
              </form>

              <button
                type="button"
                className="btn-prim conta-fechar"
                disabled={busy || restante > 0}
                onClick={() => void fechar()}
              >
                {restante > 0 ? `Falta ${formatarReais(restante)}` : "Fechar conta"}
              </button>
            </>
          ) : (
            <p className="ajuda">Conta {at.status.toLowerCase()} — totais congelados.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
