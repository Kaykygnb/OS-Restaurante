import { useCallback, useEffect, useState } from "react";
import Ajuda from "../componentes/Ajuda";
import Avisos from "../componentes/Avisos";
import CampoAprovacao from "../componentes/CampoAprovacao";
import Modal from "../componentes/Modal";
import { lerUsuario } from "../auth/sessao";
import { useAviso } from "../hooks/useAviso";
import { api, novaChaveIdempotencia } from "../servicos/api";
import { formatarReais, reaisParaCentavos } from "../util/dinheiro";
import { rotuloMovimentacao } from "../util/rotulos";

const GESTAO = new Set(["ROOT", "ADMIN", "GERENTE"]);

type SessaoCaixa = {
  id: number;
  aberto_em: string;
  fundo_troco_centavos: number;
  usuario_abertura?: { nome: string };
  _count?: { pagamentos?: number; movimentacoes?: number };
};

type Acao =
  | { tipo: "mov"; chave: string; valor: number }
  | { tipo: "fechar"; valor: number; contasAbertas: number };

export default function Caixa() {
  const podeGestao = GESTAO.has(lerUsuario()?.tipo ?? "");

  const [carregando, setCarregando] = useState(true);
  const [sessao, setSessao] = useState<SessaoCaixa | null>(null);
  const [aberto, setAberto] = useState(false);
  const [temGaveta, setTemGaveta] = useState(false);
  const [fundo, setFundo] = useState("");
  const [movTipo, setMovTipo] = useState<"SANGRIA" | "SUPRIMENTO">("SUPRIMENTO");
  const [movValor, setMovValor] = useState("");
  const [movMotivo, setMovMotivo] = useState("");
  // PIN e aprovador separados: o da sangria não vaza para a gaveta.
  const [pinMov, setPinMov] = useState("");
  const [aprovMov, setAprovMov] = useState("");
  const [pinGaveta, setPinGaveta] = useState("");
  const [aprovGaveta, setAprovGaveta] = useState("");
  const [mostrarGaveta, setMostrarGaveta] = useState(false);
  const [contado, setContado] = useState("");
  const { erro, ok, setErro, setOk } = useAviso(8000);
  const [busy, setBusy] = useState(false);
  const [acao, setAcao] = useState<Acao | null>(null);
  const [erroModal, setErroModal] = useState("");

  const carregar = useCallback(async () => {
    try {
      const r = (await api("/caixa/atual")) as {
        aberto: boolean;
        sessao: SessaoCaixa | null;
        tem_gaveta_disponivel?: boolean;
      };
      setAberto(r.aberto);
      setSessao(r.sessao);
      setTemGaveta(Boolean(r.tem_gaveta_disponivel));
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [setErro]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga de dados da tela (fetch)
    void carregar();
  }, [carregar]);

  async function abrir() {
    const valor = reaisParaCentavos(fundo || "0");
    if (!Number.isFinite(valor)) return setErro("Fundo de troco inválido. Use, por exemplo, 150,00");
    setBusy(true);
    setErro("");
    try {
      await api("/caixa/abrir", { method: "POST", body: JSON.stringify({ fundo_troco_centavos: valor }) });
      setOk(`Caixa aberto com fundo de ${formatarReais(valor)}`);
      await carregar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function pedirMovimentacao(e: React.FormEvent) {
    e.preventDefault();
    const valor = reaisParaCentavos(movValor);
    if (!Number.isFinite(valor) || valor <= 0) return setErro("Valor inválido. Use, por exemplo, 50,00");
    if (!movMotivo.trim()) return setErro("Informe o motivo");
    if (movTipo === "SANGRIA" && !podeGestao && (!aprovMov || pinMov.length < 4)) {
      return setErro("Sangria precisa do gerente e do PIN dele");
    }
    setErroModal("");
    setAcao({ tipo: "mov", chave: novaChaveIdempotencia(), valor });
  }

  async function movimentar(chave: string, valor: number) {
    if (!sessao) return;
    setBusy(true);
    setErroModal("");
    try {
      await api(`/caixa/${sessao.id}/movimentacao`, {
        method: "POST",
        chaveIdempotencia: chave,
        body: JSON.stringify({
          tipo: movTipo,
          valor_centavos: valor,
          motivo: movMotivo.trim(),
          pin: pinMov || undefined,
          aprovador_id: aprovMov ? Number(aprovMov) : undefined,
        }),
      });
      setAcao(null);
      setOk(`${rotuloMovimentacao(movTipo)}: ${formatarReais(valor)}`);
      setMovValor("");
      setMovMotivo("");
      setPinMov("");
      await carregar();
    } catch (err) {
      setErroModal((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function pedirFechamento() {
    if (!contado.trim()) {
      return setErro("Conte o dinheiro da gaveta e informe o valor (digite 0 se não houver dinheiro)");
    }
    const valor = reaisParaCentavos(contado);
    if (!Number.isFinite(valor)) return setErro("Valor contado inválido. Use, por exemplo, 1.457,83");
    let contasAbertas = 0;
    try {
      contasAbertas = ((await api("/atendimentos?status=ABERTO")) as unknown[]).length;
    } catch {
      /* segue sem o aviso */
    }
    setErroModal("");
    setAcao({ tipo: "fechar", valor, contasAbertas });
  }

  async function fechar(valor: number) {
    if (!sessao) return;
    setBusy(true);
    setErroModal("");
    try {
      const r = (await api(`/caixa/${sessao.id}/fechar`, {
        method: "POST",
        body: JSON.stringify({ valor_informado_centavos: valor }),
      })) as { diferenca_centavos?: number };
      setAcao(null);
      setContado("");
      const dif = r.diferenca_centavos ?? 0;
      setOk(
        dif === 0
          ? "Caixa fechado sem diferença"
          : `Caixa fechado · diferença de ${formatarReais(dif)} (${dif > 0 ? "sobrou" : "faltou"})`
      );
      await carregar();
    } catch (e) {
      setErroModal((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function gaveta() {
    if (!podeGestao && (!aprovGaveta || pinGaveta.length < 4)) {
      return setErro("Abrir a gaveta sem venda precisa do gerente e do PIN dele");
    }
    setBusy(true);
    setErro("");
    try {
      await api("/caixa/gaveta", {
        method: "POST",
        body: JSON.stringify({
          pin: pinGaveta || undefined,
          aprovador_id: aprovGaveta ? Number(aprovGaveta) : undefined,
        }),
      });
      setOk("Gaveta aberta");
      setPinGaveta("");
      setMostrarGaveta(false);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cardapio config-pagina">
      <section className="cardapio-hero">
        <div className="cardapio-hero-copy">
          <span className="cardapio-kicker">CAIXA</span>
          <h2 className="titulo-com-ajuda">
            Sessão de caixa
            <Ajuda texto="Abra o caixa antes de receber. Sangria precisa de gerente ou do PIN dele. Ao fechar, conte o dinheiro da gaveta." />
          </h2>
          <p role="status">{carregando ? "Carregando…" : aberto ? "Caixa aberto" : "Caixa fechado"}</p>
        </div>
        <button type="button" className="btn-sec" onClick={() => void carregar()}>
          Atualizar
        </button>
      </section>

      <Avisos erro={acao ? "" : erro} ok={ok} />

      {carregando ? null : !aberto || !sessao ? (
        <form
          className="painel-bloco config-form"
          onSubmit={(e) => {
            e.preventDefault();
            void abrir();
          }}
        >
          <div className="drawer-bloco">
            <label className="campo">
              <span>Fundo de troco (R$)</span>
              <input value={fundo} onChange={(e) => setFundo(e.target.value)} inputMode="decimal" placeholder="0,00" />
            </label>
            <button type="submit" className="btn-prim" disabled={busy}>
              {busy ? "Abrindo…" : "Abrir caixa"}
            </button>
          </div>
        </form>
      ) : (
        <div className="painel-bloco config-form">
          <div className="drawer-bloco">
            <p>
              Aberto em {new Date(sessao.aberto_em).toLocaleString("pt-BR")} por {sessao.usuario_abertura?.nome}
            </p>
            <p className="ajuda">
              Fundo {formatarReais(sessao.fundo_troco_centavos)} · {sessao._count?.pagamentos ?? 0} pagamentos ·{" "}
              {sessao._count?.movimentacoes ?? 0} movimentações
            </p>
          </div>

          <form className="drawer-bloco" onSubmit={pedirMovimentacao}>
            <p className="bloco-variante-titulo">Sangria / suprimento</p>
            <div className="config-grid-2">
              <label className="campo">
                <span>Tipo</span>
                <select value={movTipo} onChange={(e) => setMovTipo(e.target.value as "SANGRIA" | "SUPRIMENTO")}>
                  <option value="SUPRIMENTO">Suprimento (pôr dinheiro)</option>
                  <option value="SANGRIA">Sangria (tirar dinheiro)</option>
                </select>
              </label>
              <label className="campo">
                <span>Valor</span>
                <input value={movValor} onChange={(e) => setMovValor(e.target.value)} inputMode="decimal" required />
              </label>
              <label className="campo config-span-2">
                <span>Motivo</span>
                <input value={movMotivo} onChange={(e) => setMovMotivo(e.target.value)} required />
              </label>
            </div>
            {movTipo === "SANGRIA" && !podeGestao ? (
              <CampoAprovacao aprovadorId={aprovMov} onAprovador={setAprovMov} pin={pinMov} onPin={setPinMov} />
            ) : null}
            <button type="submit" className="btn-sec" disabled={busy}>
              Registrar
            </button>
          </form>

          {temGaveta ? (
            <div className="drawer-bloco">
              {podeGestao ? (
                <button type="button" className="btn-sec" disabled={busy} onClick={() => void gaveta()}>
                  Abrir gaveta (sem venda)
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn-sec"
                    aria-expanded={mostrarGaveta}
                    onClick={() => setMostrarGaveta((v) => !v)}
                  >
                    Abrir gaveta (sem venda)
                  </button>
                  {mostrarGaveta ? (
                    <>
                      <CampoAprovacao
                        aprovadorId={aprovGaveta}
                        onAprovador={setAprovGaveta}
                        pin={pinGaveta}
                        onPin={setPinGaveta}
                      />
                      <button type="button" className="btn-prim" disabled={busy} onClick={() => void gaveta()}>
                        Abrir gaveta
                      </button>
                    </>
                  ) : null}
                </>
              )}
            </div>
          ) : null}

          {podeGestao ? (
            <form
              className="drawer-bloco"
              onSubmit={(e) => {
                e.preventDefault();
                void pedirFechamento();
              }}
            >
              <p className="bloco-variante-titulo">Fechar caixa</p>
              <label className="campo">
                <span>Dinheiro contado na gaveta (R$)</span>
                <input
                  value={contado}
                  onChange={(e) => setContado(e.target.value)}
                  inputMode="decimal"
                  placeholder="Ex.: 1.457,83"
                />
              </label>
              <button type="submit" className="btn-prim" disabled={busy}>
                Fechar caixa…
              </button>
            </form>
          ) : null}
        </div>
      )}

      {acao?.tipo === "mov" ? (
        <Modal
          titulo={`${movTipo === "SANGRIA" ? "Tirar" : "Pôr"} ${formatarReais(acao.valor)} ${movTipo === "SANGRIA" ? "da" : "na"} gaveta?`}
          confirmar={movTipo === "SANGRIA" ? "Registrar sangria" : "Registrar suprimento"}
          desistir="Voltar"
          ocupado={busy}
          erro={erroModal}
          onConfirmar={() => void movimentar(acao.chave, acao.valor)}
          onFechar={() => setAcao(null)}
        >
          <p className="ajuda">Motivo: {movMotivo}. A gaveta abre e sai um comprovante na impressora do caixa.</p>
        </Modal>
      ) : null}

      {acao?.tipo === "fechar" ? (
        <Modal
          titulo="Fechar o caixa?"
          confirmar="Fechar caixa"
          desistir="Voltar"
          perigo={acao.contasAbertas > 0}
          ocupado={busy}
          erro={erroModal}
          onConfirmar={() => void fechar(acao.valor)}
          onFechar={() => setAcao(null)}
        >
          <p className="ajuda">
            Dinheiro contado: <strong>{formatarReais(acao.valor)}</strong>. O sistema compara com o esperado e imprime o
            relatório. Depois de fechar não dá para receber até abrir outro caixa.
          </p>
          {acao.contasAbertas > 0 ? (
            <p className="feedback-card feedback-erro" role="alert">
              Ainda há {acao.contasAbertas} conta(s) aberta(s). Feche ou cancele antes, senão elas ficam sem caixa.
            </p>
          ) : null}
        </Modal>
      ) : null}
    </div>
  );
}
