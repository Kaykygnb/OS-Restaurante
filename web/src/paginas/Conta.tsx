import Formulario from "../componentes/Formulario";
import AtendimentoAcoes from "../componentes/AtendimentoAcoes";
import { lerConfigOperacao } from "../servicos/rotas";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import Ajuda from "../componentes/Ajuda";
import Avisos from "../componentes/Avisos";
import CampoAprovacao from "../componentes/CampoAprovacao";
import Modal from "../componentes/Modal";
import { lerUsuario } from "../auth/sessao";
import { useAviso } from "../hooks/useAviso";
import { api, novaChaveIdempotencia } from "../servicos/api";
import { centavosParaCampo, formatarReais, reaisParaCentavos } from "../util/dinheiro";
import { rotuloStatusConta, tituloAtendimento } from "../util/rotulos";

type Forma = { id: number; nome: string; abre_gaveta: boolean };

type ItemConta = {
  id: number;
  nome_produto: string;
  preco_centavos: number;
  quantidade: number;
  observacao: string | null;
  cancelado: boolean;
  codigo_pedido: string;
  total_centavos?: number;
  escolhas?: { nome_opcao: string; preco_extra_centavos: number; quantidade: number }[];
  adicionais?: { nome_adicional: string; preco_centavos: number; quantidade: number }[];
};

type AtendimentoConta = {
  id: number;
  status: string;
  codigo_atendimento: string;
  tipo_atendimento: string;
  cliente_nome: string | null;
  mesa: { numero: number } | null;
  desconto_centavos: number;
  acrescimo_centavos?: number;
  taxa_servico_centavos: number;
  taxa_servico_aplicada: boolean;
  taxa_entrega_centavos: number;
  pedidos?: { id: number; status: string; codigo_pedido: string; itens: Omit<ItemConta, "codigo_pedido">[] }[];
  pagamentos?: { estornado_em?: string | null; id: number; valor_centavos: number; troco_centavos?: number; forma_pagamento?: { nome: string } }[];
  totais?: { subtotal_centavos: number; total_centavos: number; pago_centavos: number; restante_centavos: number };
};

type Config = { taxa_servico_percentual?: number; limite_desconto_sem_pin_centavos?: number };

const GESTAO = new Set(["ROOT", "ADMIN", "GERENTE"]);

type Confirmacao =
  | { tipo: "pagar"; valor: number; recebido: number; chave: string }
  | { tipo: "fechar"; chave: string };

export default function Conta() {
  const { atendimentoId } = useParams();
  const id = Number(atendimentoId);
  const idValido = Number.isFinite(id) && id > 0;
  const podeGestao = GESTAO.has(lerUsuario()?.tipo ?? "");

  const [at, setAt] = useState<AtendimentoConta | null>(null);
  const [formas, setFormas] = useState<Forma[]>([]);
  const [config, setConfig] = useState<Config>({});
  const [caixaAberto, setCaixaAberto] = useState<boolean | null>(null);
  const { erro, ok, setErro, setOk } = useAviso();
  const [avisos, setAvisos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [mostrarAjustes, setMostrarAjustes] = useState(false);

  const [desconto, setDesconto] = useState("");
  const [motivoDesc, setMotivoDesc] = useState("");
  const [pin, setPin] = useState("");
  const [aprovadorId, setAprovadorId] = useState("");
  const [formaId, setFormaId] = useState("");
  const [valorPag, setValorPag] = useState("");
  const [recebido, setRecebido] = useState("");
  const [confirmacao, setConfirmacao] = useState<Confirmacao | null>(null);
  const [erroModal, setErroModal] = useState("");
  /** Não apaga o que a pessoa está digitando quando a conta recarrega. */
  const editouValor = useRef(false);
  const editouDesconto = useRef(false);

  const carregar = useCallback(async () => {
    if (!idValido) return;
    try {
      const [a, f] = await Promise.all([
        api(`/atendimentos/${id}`) as Promise<AtendimentoConta>,
        api("/formas-pagamento") as Promise<Forma[]>,
      ]);
      setAt(a);
      setFormas(f);
      if (!editouDesconto.current) setDesconto(a.desconto_centavos ? centavosParaCampo(a.desconto_centavos) : "");
      const rest = a.totais?.restante_centavos ?? 0;
      if (!editouValor.current) setValorPag(rest > 0 ? centavosParaCampo(rest) : "");
    } catch (e) {
      setErro((e as Error).message);
    }
    // Informações de apoio: se falharem, a conta continua funcionando.
    // GET /configuracoes/operacao: taxa de serviço e limite de desconto, legível por qualquer usuário logado.
    lerConfigOperacao()
      .then((c) => setConfig(c))
      .catch(() => undefined);
    api("/caixa/atual")
      .then((c) => setCaixaAberto(Boolean((c as { aberto: boolean }).aberto)))
      .catch(() => setCaixaAberto(null));
  }, [id, idValido, setErro]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga de dados da tela (fetch)
    void carregar();
  }, [carregar]);

  const itens = useMemo<ItemConta[]>(
    () => (at?.pedidos ?? []).flatMap((p) => p.itens.map((i) => ({ ...i, codigo_pedido: p.codigo_pedido }))),
    [at]
  );

  if (!idValido) return <Navigate to="/painel/mesas" replace />;

  const forma = formas.find((f) => String(f.id) === formaId);
  const restante = at?.totais?.restante_centavos ?? 0;
  const valorDigitado = reaisParaCentavos(valorPag || "");
  const recebidoDigitado = recebido ? reaisParaCentavos(recebido) : NaN;
  const trocoPrevisto =
    forma?.abre_gaveta && Number.isFinite(recebidoDigitado) && Number.isFinite(valorDigitado)
      ? Math.max(0, recebidoDigitado - valorDigitado)
      : 0;
  const percentual = config.taxa_servico_percentual ?? 10;
  const limiteSemPin = config.limite_desconto_sem_pin_centavos ?? 500;
  const descontoDigitado = reaisParaCentavos(desconto || "0");
  const precisaPin = !podeGestao && Number.isFinite(descontoDigitado) && descontoDigitado > limiteSemPin;

  async function taxa(aplicar: boolean) {
    setBusy(true);
    setErro("");
    try {
      await api(`/atendimentos/${id}/taxa-servico`, { method: "POST", body: JSON.stringify({ aplicar }) });
      setOk(aplicar ? `Taxa de serviço (${percentual}%) aplicada` : "Taxa de serviço removida");
      editouValor.current = false;
      await carregar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function salvarDesconto() {
    if (!Number.isFinite(descontoDigitado)) return setErro("Valor de desconto inválido. Use, por exemplo, 8,00");
    if (descontoDigitado > 0 && !motivoDesc.trim()) return setErro("Informe o motivo do desconto");
    if (precisaPin && (!aprovadorId || pin.length < 4)) {
      return setErro(`Desconto acima de ${formatarReais(limiteSemPin)} precisa do gerente e do PIN dele`);
    }
    setBusy(true);
    setErro("");
    try {
      await api(`/atendimentos/${id}/desconto`, {
        method: "POST",
        body: JSON.stringify({
          valor_centavos: descontoDigitado,
          motivo: motivoDesc.trim() || null,
          pin: pin || undefined,
          aprovador_id: aprovadorId ? Number(aprovadorId) : undefined,
        }),
      });
      setOk(descontoDigitado ? `Desconto de ${formatarReais(descontoDigitado)} aplicado` : "Desconto removido");
      setPin("");
      editouDesconto.current = false;
      editouValor.current = false;
      setMostrarAjustes(false);
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
    setAvisos([]);
    try {
      const r = (await api(`/atendimentos/${id}/preconta`, { method: "POST" })) as {
        impressao?: { avisos?: string[] };
      };
      setOk("Pré-conta enviada para a impressora");
      setAvisos(r.impressao?.avisos ?? []);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /** Abre a confirmação. Nada é recebido sem a pessoa conferir forma e valor. */
  function pedirPagamento(valorOverride?: number) {
    if (!formaId || !forma) return setErro("Escolha a forma de pagamento");
    const valor = valorOverride ?? valorDigitado;
    if (!Number.isFinite(valor) || valor <= 0) return setErro("Valor inválido. Use, por exemplo, 25,50");
    if (valor > restante && !forma.abre_gaveta) {
      return setErro(`Em ${forma.nome} o valor não pode passar do restante (${formatarReais(restante)})`);
    }
    if (valor > restante) return setErro(`O valor passa do restante (${formatarReais(restante)}). Para troco, use "Recebido".`);
    const rec = Number.isFinite(recebidoDigitado) ? recebidoDigitado : valor;
    if (rec < valor) return setErro("O valor recebido é menor que o valor a pagar");
    setErroModal("");
    setConfirmacao({ tipo: "pagar", valor, recebido: rec, chave: novaChaveIdempotencia() });
  }

  async function pagar(c: Extract<Confirmacao, { tipo: "pagar" }>) {
    setBusy(true);
    setErroModal("");
    try {
      await api(`/atendimentos/${id}/pagamentos`, {
        method: "POST",
        chaveIdempotencia: c.chave,
        body: JSON.stringify({
          forma_pagamento_id: Number(formaId),
          valor_centavos: c.valor,
          valor_recebido_centavos: c.recebido,
        }),
      });
      setConfirmacao(null);
      setOk(
        `Recebido ${formatarReais(c.valor)} em ${forma?.nome ?? ""}` +
          (c.recebido > c.valor ? ` · troco ${formatarReais(c.recebido - c.valor)}` : "")
      );
      setRecebido("");
      setFormaId("");
      editouValor.current = false;
      await carregar();
    } catch (err) {
      setErroModal((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function fechar(chave: string) {
    setBusy(true);
    setErroModal("");
    try {
      const r = (await api(`/atendimentos/${id}/fechar`, { method: "POST", chaveIdempotencia: chave })) as {
        impressao?: { avisos?: string[] } | null;
      };
      setConfirmacao(null);
      setOk("Conta fechada");
      setAvisos(r.impressao?.avisos ?? []);
      await carregar();
    } catch (e) {
      setErroModal((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!at) {
    return (
      <div className="cardapio">{erro ? <Avisos erro={erro} /> : <p role="status">Carregando conta…</p>}</div>
    );
  }

  const titulo = tituloAtendimento(at);
  const aberta = at.status === "ABERTO";

  return (
    <div className="cardapio conta-pagina">
      <section className="pdv-topbar">
        <div>
          <span className="cardapio-kicker">FECHAMENTO</span>
          <h2 className="titulo-com-ajuda">
            {titulo} · {at.codigo_atendimento}
            <Ajuda texto="Confira os itens, ajuste taxa e desconto, receba e feche. O caixa precisa estar aberto para receber." />
          </h2>
          <p>
            {at.cliente_nome ? `${at.cliente_nome} · ` : ""}
            <span className={`selo-status selo-${at.status.toLowerCase()}`}>{rotuloStatusConta(at.status)}</span>
          </p>
        </div>
        <div className="config-toolbar-inline">
          {aberta ? (
            <Link className="btn-sec" to={`/painel/pdv/${id}`}>
              + Itens
            </Link>
          ) : null}
          <Link className="btn-ghost" to="/painel/mesas">
            Mesas
          </Link>
        </div>
      </section>

      <Avisos erro={confirmacao ? "" : erro} ok={ok} avisos={avisos} />


      {aberta && caixaAberto === false ? (
        <p className="feedback-card config-aviso-ip" role="status">
          O caixa está fechado: dá para lançar e imprimir a pré-conta, mas não para receber.{" "}
          <Link to="/painel/caixa">
            <strong>Abrir caixa</strong>
          </Link>
        </p>
      ) : null}

      <div className="conta-layout">
        <section className="painel-bloco">
          <header className="painel-bloco-cab">
            <h2>Itens</h2>
            <span className="ajuda">{itens.filter((i) => !i.cancelado).reduce((s,i) => s + i.quantidade, 0)} unidades · {itens.filter((i) => !i.cancelado).length} produtos</span>
          </header>
          <AtendimentoAcoes atendimento={at} onAtualizar={carregar} />
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
            {at.acrescimo_centavos ? <div><span>Acréscimo</span><strong>{formatarReais(at.acrescimo_centavos)}</strong></div> : null}
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
              <strong data-testid="restante">{formatarReais(restante)}</strong>
            </div>
          </div>

          {aberta ? (
            <>
              <div className="conta-acoes-rapidas">
                <button type="button" className="btn-sec" disabled={busy} onClick={() => void preconta()}>
                  Pré-conta
                </button>
                <button
                  type="button"
                  className={`btn-sec${at.taxa_servico_aplicada ? " on-sel" : ""}`}
                  disabled={busy}
                  aria-pressed={at.taxa_servico_aplicada}
                  onClick={() => void taxa(!at.taxa_servico_aplicada)}
                >
                  {at.taxa_servico_aplicada ? `Tirar ${percentual}%` : `Serviço ${percentual}%`}
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  aria-expanded={mostrarAjustes}
                  onClick={() => setMostrarAjustes((v) => !v)}
                >
                  Desconto
                </button>
              </div>

              {mostrarAjustes ? (
                <Formulario
                  className="conta-ajustes"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void salvarDesconto();
                  }}
                >
                  <label className="campo">
                    <span>Desconto na conta (R$)</span>
                    <input
                      value={desconto}
                      onChange={(e) => {
                        editouDesconto.current = true;
                        setDesconto(e.target.value);
                      }}
                      inputMode="decimal"
                      placeholder="0,00"
                    />
                  </label>
                  <label className="campo">
                    <span>Motivo</span>
                    <input value={motivoDesc} onChange={(e) => setMotivoDesc(e.target.value)} />
                  </label>
                  {precisaPin ? (
                    <CampoAprovacao
                      aprovadorId={aprovadorId}
                      onAprovador={setAprovadorId}
                      pin={pin}
                      onPin={setPin}
                      explicacao={`Acima de ${formatarReais(limiteSemPin)} o gerente aprova com o PIN dele.`}
                    />
                  ) : null}
                  <button type="submit" className="btn-sec" disabled={busy}>
                    Aplicar desconto
                  </button>
                </Formulario>
              ) : null}

              <Formulario
                className="conta-pagar"
                onSubmit={(e) => {
                  e.preventDefault();
                  pedirPagamento();
                }}
              >
                <p className="bloco-variante-titulo" id="titulo-formas">
                  Receber pagamento
                </p>
                <div className="pdv-chips" role="radiogroup" aria-labelledby="titulo-formas">
                  {formas.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      role="radio"
                      aria-checked={String(f.id) === formaId}
                      className={`pdv-chip${String(f.id) === formaId ? " on" : ""}`}
                      onClick={() => setFormaId(String(f.id))}
                    >
                      {f.nome}
                    </button>
                  ))}
                </div>
                <div className="config-grid-2">
                  <label className="campo">
                    <span>Valor a receber (R$)</span>
                    <input
                      value={valorPag}
                      onChange={(e) => {
                        editouValor.current = true;
                        setValorPag(e.target.value);
                      }}
                      inputMode="decimal"
                      required
                    />
                  </label>
                  {forma?.abre_gaveta ? (
                    <label className="campo">
                      <span>Valor recebido (R$)</span>
                      <input
                        value={recebido}
                        onChange={(e) => setRecebido(e.target.value)}
                        placeholder={valorPag}
                        inputMode="decimal"
                      />
                    </label>
                  ) : null}
                </div>
                {trocoPrevisto > 0 ? <p className="conta-troco">Troco {formatarReais(trocoPrevisto)}</p> : null}
                <div className="conta-pagar-btns">
                  <button
                    type="button"
                    className="btn-sec"
                    disabled={busy || restante <= 0 || caixaAberto === false}
                    onClick={() => {
                      setValorPag(centavosParaCampo(restante)); editouValor.current = true;
                    }}
                  >
                    Usar saldo restante
                  </button>
                  <button type="submit" className="btn-prim" disabled={busy || restante <= 0 || caixaAberto === false}>
                    Receber pagamento
                  </button>
                </div>
                {!formaId ? <p className="ajuda">Escolha a forma de pagamento.</p> : null}
              </Formulario>

              <button
                type="button"
                className="btn-prim conta-fechar"
                disabled={busy || restante > 0}
                onClick={() => {
                  setErroModal("");
                  setConfirmacao({ tipo: "fechar", chave: novaChaveIdempotencia() });
                }}
              >
                {restante > 0 ? `Falta ${formatarReais(restante)}` : "Fechar conta"}
              </button>
            </>
          ) : (
            <div className="conta-encerrada">
              <p className="ajuda">Conta {rotuloStatusConta(at.status).toLowerCase()}: os totais estão congelados.</p>
              <Link className="btn-prim" to="/painel/mesas">
                Voltar ao mapa
              </Link>
            </div>
          )}
        </aside>
      </div>

      {confirmacao?.tipo === "pagar" ? (
        <Modal
          titulo={`Receber ${formatarReais(confirmacao.valor)} em ${forma?.nome ?? ""}?`}
          confirmar="Confirmar recebimento"
          desistir="Voltar"
          ocupado={busy}
          erro={erroModal}
          onConfirmar={() => void pagar(confirmacao)}
          onFechar={() => setConfirmacao(null)}
        >
          <dl className="resumo-confirmacao">
            <dt>Conta</dt>
            <dd>
              {titulo} · {at.codigo_atendimento}
            </dd>
            <dt>Forma</dt>
            <dd>{forma?.nome}</dd>
            <dt>Valor</dt>
            <dd>{formatarReais(confirmacao.valor)}</dd>
            {confirmacao.recebido > confirmacao.valor ? (
              <>
                <dt>Recebido</dt>
                <dd>{formatarReais(confirmacao.recebido)}</dd>
                <dt>Troco</dt>
                <dd>
                  <strong>{formatarReais(confirmacao.recebido - confirmacao.valor)}</strong>
                </dd>
              </>
            ) : null}
            <dt>Fica faltando</dt>
            <dd>{formatarReais(Math.max(0, restante - confirmacao.valor))}</dd>
          </dl>
        </Modal>
      ) : null}

      {confirmacao?.tipo === "fechar" ? (
        <Modal
          titulo="Fechar a conta?"
          confirmar="Fechar conta"
          desistir="Voltar"
          ocupado={busy}
          erro={erroModal}
          onConfirmar={() => void fechar(confirmacao.chave)}
          onFechar={() => setConfirmacao(null)}
        >
          <p className="ajuda">
            {titulo} · total {formatarReais(at.totais?.total_centavos ?? 0)}. Depois de fechar, os totais ficam
            congelados e o comprovante sai na impressora do caixa.
          </p>
        </Modal>
      ) : null}
    </div>
  );
}
