import { useCallback, useEffect, useState } from "react";
import Ajuda from "../componentes/Ajuda";
import { lerUsuario } from "../auth/sessao";
import { api } from "../servicos/api";
import { formatarReais, reaisParaCentavos } from "../util/dinheiro";

const GESTAO = new Set(["ROOT", "ADMIN", "GERENTE"]);

export default function Caixa() {
  const sessaoUser = lerUsuario();
  const podeGestao = GESTAO.has(sessaoUser?.tipo ?? "");

  const [sessao, setSessao] = useState<any>(null);
  const [aberto, setAberto] = useState(false);
  const [temGaveta, setTemGaveta] = useState(false);
  const [fundo, setFundo] = useState("0");
  const [movTipo, setMovTipo] = useState<"SANGRIA" | "SUPRIMENTO">("SUPRIMENTO");
  const [movValor, setMovValor] = useState("");
  const [movMotivo, setMovMotivo] = useState("");
  const [pin, setPin] = useState("");
  const [contado, setContado] = useState("");
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  const carregar = useCallback(async () => {
    setErro("");
    try {
      const r = (await api("/caixa/atual")) as {
        aberto: boolean;
        sessao: any;
        tem_gaveta_disponivel?: boolean;
      };
      setAberto(r.aberto);
      setSessao(r.sessao);
      setTemGaveta(Boolean(r.tem_gaveta_disponivel));
    } catch (e) {
      setErro((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function abrir() {
    setBusy(true);
    setErro("");
    try {
      await api("/caixa/abrir", {
        method: "POST",
        body: JSON.stringify({ fundo_troco_centavos: reaisParaCentavos(fundo || "0") }),
      });
      setOk("Caixa aberto");
      await carregar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function movimentar(e: React.FormEvent) {
    e.preventDefault();
    if (!sessao) return;
    setBusy(true);
    setErro("");
    try {
      await api(`/caixa/${sessao.id}/movimentacao`, {
        method: "POST",
        body: JSON.stringify({
          tipo: movTipo,
          valor_centavos: reaisParaCentavos(movValor),
          motivo: movMotivo,
          pin: pin || undefined,
        }),
      });
      setOk(`${movTipo} registrada`);
      setMovValor("");
      setMovMotivo("");
      setPin("");
      await carregar();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function fechar() {
    if (!sessao) return;
    setBusy(true);
    setErro("");
    try {
      const r = await api(`/caixa/${sessao.id}/fechar`, {
        method: "POST",
        body: JSON.stringify({ valor_informado_centavos: reaisParaCentavos(contado || "0") }),
      });
      setOk(
        `Caixa fechado · diferença ${formatarReais((r as any).diferenca_centavos ?? 0)}`
      );
      await carregar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function gaveta() {
    setBusy(true);
    setErro("");
    try {
      await api("/caixa/gaveta", { method: "POST", body: JSON.stringify({ pin: pin || undefined }) });
      setOk("Gaveta acionada");
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
            <Ajuda texto="Abra o caixa antes de receber. Sangria exige gerente ou PIN. Ao fechar, informe o valor contado." />
          </h2>
          <p>{aberto ? "Caixa aberto" : "Nenhum caixa aberto"}</p>
        </div>
        <button type="button" className="btn-sec" onClick={() => void carregar()}>
          Atualizar
        </button>
      </section>

      {erro ? <p className="feedback-card feedback-erro">{erro}</p> : null}
      {ok ? <p className="feedback-card feedback-ok">{ok}</p> : null}

      {!aberto ? (
        <div className="painel-bloco config-form">
          <div className="drawer-bloco">
            <label className="campo">
              <span>Fundo de troco (R$)</span>
              <input value={fundo} onChange={(e) => setFundo(e.target.value)} inputMode="decimal" />
            </label>
            <button type="button" className="btn-prim" disabled={busy} onClick={() => void abrir()}>
              Abrir caixa
            </button>
          </div>
        </div>
      ) : (
        <div className="painel-bloco config-form">
          <div className="drawer-bloco">
            <p>
              Aberto em {new Date(sessao.aberto_em).toLocaleString("pt-BR")} por{" "}
              {sessao.usuario_abertura?.nome}
            </p>
            <p className="ajuda">
              Fundo {formatarReais(sessao.fundo_troco_centavos)} · {sessao._count?.pagamentos ?? 0}{" "}
              pagamentos · {sessao._count?.movimentacoes ?? 0} movimentações
            </p>
          </div>

          <form className="drawer-bloco" onSubmit={movimentar}>
            <p className="bloco-variante-titulo">Sangria / suprimento</p>
            <div className="config-grid-2">
              <label className="campo">
                <span>Tipo</span>
                <select value={movTipo} onChange={(e) => setMovTipo(e.target.value as any)}>
                  <option value="SUPRIMENTO">Suprimento</option>
                  <option value="SANGRIA">Sangria</option>
                </select>
              </label>
              <label className="campo">
                <span>Valor</span>
                <input value={movValor} onChange={(e) => setMovValor(e.target.value)} required />
              </label>
              <label className="campo config-span-2">
                <span>Motivo</span>
                <input value={movMotivo} onChange={(e) => setMovMotivo(e.target.value)} required />
              </label>
              {!podeGestao ? (
                <label className="campo">
                  <span>PIN gerente (sangria)</span>
                  <input value={pin} onChange={(e) => setPin(e.target.value)} type="password" />
                </label>
              ) : null}
            </div>
            <button type="submit" className="btn-sec" disabled={busy}>
              Registrar
            </button>
          </form>

          {temGaveta ? (
            <div className="drawer-bloco">
              <button type="button" className="btn-sec" disabled={busy} onClick={() => void gaveta()}>
                Abrir gaveta (sem venda)
              </button>
              {!podeGestao ? (
                <label className="campo" style={{ marginTop: 8 }}>
                  <span>PIN (se precisar)</span>
                  <input value={pin} onChange={(e) => setPin(e.target.value)} type="password" />
                </label>
              ) : null}
            </div>
          ) : null}

          {podeGestao ? (
            <div className="drawer-bloco">
              <p className="bloco-variante-titulo">Fechar caixa</p>
              <label className="campo">
                <span>Valor contado (dinheiro)</span>
                <input value={contado} onChange={(e) => setContado(e.target.value)} />
              </label>
              <button type="button" className="btn-prim" disabled={busy} onClick={() => void fechar()}>
                Fechar sessão
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
