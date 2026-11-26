import Formulario from "../../componentes/Formulario";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Dialogo from "../../componentes/ui/Dialogo";
import { Faixa } from "../../componentes/ui/Estados";
import type { ApiErro } from "../../servicos/api";
import type { FormaPagamento, VendaRapidaEntrada, VendaRapidaResposta } from "../../servicos/contratos";
import { vendaRapida } from "../../servicos/rotas";
import { centavosParaCampo, formatarReais, reaisParaCentavos } from "../../util/dinheiro";
import { atalhosNota, restante, troco, type PagamentoLinha } from "./carrinho";

type Props = {
  total: number;
  titulo: string;
  formas: FormaPagamento[];
  formaInicial?: number;
  montarVenda: () => Omit<VendaRapidaEntrada, "pagamentos" | "imprimir">;
  /** Gerada quando a janela abre; repetir com a mesma chave nunca cobra duas vezes. */
  chave: string;
  onConcluida: (r: VendaRapidaResposta) => void;
  onFechar: () => void;
};

const TECLA_FORMA = ["F5", "F6", "F7"];

/** Pranchas 05c/05c2/05k: cobrar num passo (forma, valor recebido, troco) ou com mais de uma forma. */
export default function Pagamento({ total, titulo, formas, formaInicial, montarVenda, chave, onConcluida, onFechar }: Props) {
  const ativas = formas.filter((f) => f.ativo !== false).sort((a, b) => a.ordem - b.ordem);
  const [formaId, setFormaId] = useState(formaInicial ?? ativas[0]?.id ?? 0);
  const [recebido, setRecebido] = useState("");
  const [misto, setMisto] = useState(false);
  const [linhas, setLinhas] = useState<PagamentoLinha[]>([]);
  const [valorLinha, setValorLinha] = useState("");
  const [impComprovante, setImpComprovante] = useState(true);
  const [impCozinha, setImpCozinha] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<{ texto: string; codigo?: string } | null>(null);
  const recebidoRef = useRef<HTMLInputElement>(null);
  const forma = ativas.find((f) => f.id === formaId);
  const ehDinheiro = !!forma?.abre_gaveta;
  const recebidoC = recebido ? reaisParaCentavos(recebido) : total;
  const faltaMisto = restante(total, linhas);

  useEffect(() => {
    if (ehDinheiro && !misto) recebidoRef.current?.focus();
  }, [ehDinheiro, misto]);

  // F5–F7 trocam a forma; Enter confirma (quando o foco não está num botão).
  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      const i = TECLA_FORMA.indexOf(e.key);
      if (i >= 0 && ativas[i]) {
        e.preventDefault();
        setFormaId(ativas[i].id);
      }
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [ativas]);

  function pagamentos(): VendaRapidaEntrada["pagamentos"] | string {
    if (misto) {
      if (faltaMisto !== 0) return faltaMisto > 0 ? `Faltam ${formatarReais(faltaMisto)} para fechar o total.` : `Passou ${formatarReais(-faltaMisto)} do total.`;
      return linhas;
    }
    if (ehDinheiro) {
      if (!Number.isFinite(recebidoC)) return "Valor recebido inválido. Use vírgula para os centavos (ex.: 70,00).";
      if (recebidoC < total) return `Recebido menor que o total. Faltam ${formatarReais(total - recebidoC)} — ou use “Pagar com mais de uma forma”.`;
      return [{ forma_pagamento_id: formaId, valor_centavos: total, valor_recebido_centavos: recebidoC }];
    }
    return [{ forma_pagamento_id: formaId, valor_centavos: total }];
  }

  async function confirmar(tentativa = 0) {
    const p = pagamentos();
    if (typeof p === "string") {
      setErro({ texto: p });
      return;
    }
    setEnviando(true);
    setErro(null);
    try {
      const r = await vendaRapida({ ...montarVenda(), pagamentos: p, imprimir: { producao: impCozinha, comprovante: impComprovante } }, chave);
      onConcluida(r);
    } catch (e) {
      const x = e as ApiErro;
      if (x.codigo === "em_processamento" && tentativa < 5) {
        setTimeout(() => confirmar(tentativa + 1), 1000);
        return;
      }
      if (x.codigo === "pagamento_diferente_do_total") {
        const d = x.dados as { total_centavos?: number; soma_centavos?: number };
        setErro({ texto: `O total no servidor é ${formatarReais(d.total_centavos)} e os pagamentos somam ${formatarReais(d.soma_centavos)}. Confira e tente de novo.`, codigo: x.codigo });
      } else if (x.semConexao) {
        setErro({ texto: "Sem resposta do PC do caixa. Toque em Confirmar de novo: a venda não é cobrada duas vezes.", codigo: "sem_conexao" });
      } else {
        setErro({ texto: x.message, codigo: x.codigo });
      }
    } finally {
      setEnviando(false);
    }
  }

  function addLinha() {
    const v = reaisParaCentavos(valorLinha || centavosParaCampo(faltaMisto));
    if (!Number.isFinite(v) || v <= 0) return setErro({ texto: "Valor inválido." });
    setLinhas([...linhas, { forma_pagamento_id: formaId, valor_centavos: v }]);
    setValorLinha("");
    setErro(null);
  }

  return (
    <Dialogo
      titulo={`Cobrar ${formatarReais(total)}`}
      sub={titulo}
      onFechar={() => { if (!enviando) onFechar(); }}
      fecharComEsc={!enviando}
      pe={
        <button type="button" className="btn btn-ok btn-g btn-bloco" disabled={enviando || typeof pagamentos() === "string" || !formaId} onClick={() => confirmar()} data-testid="confirmar-pagamento">
          {enviando ? "Confirmando…" : "Confirmar pagamento"} {!enviando ? <span className="kbd">Enter</span> : null}
        </button>
      }
    >
      <Formulario
        className="pilha"
        onSubmit={(e) => {
          e.preventDefault();
          if (misto && valorLinha) addLinha();
          else if (typeof pagamentos() !== "string" && !enviando) confirmar();
        }}
      >
        <div className="fld">
          <span>Forma de pagamento</span>
          <div className="segmento" role="group" aria-label="Forma de pagamento" style={{ flexWrap: "wrap" }}>
            {ativas.map((f, i) => (
              <button key={f.id} type="button" aria-pressed={f.id === formaId} onClick={() => setFormaId(f.id)}>
                {f.nome}
                {TECLA_FORMA[i] ? <span className="kbd" style={{ marginLeft: 6 }}>{TECLA_FORMA[i]}</span> : null}
              </button>
            ))}
          </div>
        </div>

        {!misto && ehDinheiro ? (
          <>
            <div className="linha-campos" style={{ alignItems: "end" }}>
              <label className="fld">
                <span>Valor recebido</span>
                <input ref={recebidoRef} inputMode="decimal" value={recebido} placeholder={centavosParaCampo(total)} onChange={(e) => setRecebido(e.target.value)} />
              </label>
              <div className="fld">
                <span>Atalhos de nota</span>
                <div style={{ display: "flex", gap: 6 }}>
                  {atalhosNota(total).map((v, i) => (
                    <button key={v} type="button" className="btn" style={{ flex: 1, padding: "0 8px" }} onClick={() => setRecebido(centavosParaCampo(v))}>
                      {i === 0 ? "Exato" : formatarReais(v).replace(",00", "")}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="faixa faixa-ok" style={{ alignItems: "center" }} aria-live="polite">
              <div>
                <strong>Troco</strong>
                <span className="pequeno">Devolva ao cliente</span>
              </div>
              <span className="faixa-acao valor-g" data-testid="troco">
                {formatarReais(Number.isFinite(recebidoC) ? troco(total, recebidoC) : 0)}
              </span>
            </div>
          </>
        ) : null}

        {misto ? (
          <div className="pilha">
            {linhas.map((l, i) => (
              <div key={i} className="entre cartao" style={{ padding: "8px 12px" }}>
                <span>{ativas.find((f) => f.id === l.forma_pagamento_id)?.nome}</span>
                <strong>{formatarReais(l.valor_centavos)}</strong>
                <button type="button" className="btn btn-link" onClick={() => setLinhas(linhas.filter((_, j) => j !== i))}>
                  Tirar
                </button>
              </div>
            ))}
            <div className="linha-campos" style={{ alignItems: "end" }}>
              <label className="fld">
                <span>Valor em {forma?.nome}</span>
                <input inputMode="decimal" value={valorLinha} placeholder={centavosParaCampo(Math.max(0, faltaMisto))} onChange={(e) => setValorLinha(e.target.value)} />
              </label>
              <button type="button" className="btn" onClick={addLinha} disabled={faltaMisto <= 0}>
                Adicionar pagamento
              </button>
            </div>
            <div className={`faixa ${faltaMisto === 0 ? "faixa-ok" : "faixa-warn"}`}>
              <strong>{faltaMisto === 0 ? "Total fechado" : faltaMisto > 0 ? `Faltam ${formatarReais(faltaMisto)}` : `Passou ${formatarReais(-faltaMisto)}`}</strong>
            </div>
          </div>
        ) : (
          <button type="button" className="btn btn-link" style={{ justifySelf: "start" }} onClick={() => setMisto(true)}>
            + Pagar com mais de uma forma
          </button>
        )}

        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          <label className="check">
            <input type="checkbox" checked={impComprovante} onChange={(e) => setImpComprovante(e.target.checked)} /> Imprimir comprovante
          </label>
          <label className="check">
            <input type="checkbox" checked={impCozinha} onChange={(e) => setImpCozinha(e.target.checked)} /> Mandar para a cozinha
          </label>
        </div>

        {erro ? (
          <Faixa tom="err" titulo={erro.codigo === "caixa_fechado" ? "O caixa está fechado." : undefined} acao={erro.codigo === "caixa_fechado" ? <Link className="btn" to="/painel/caixa">Abrir caixa</Link> : undefined}>
            {erro.codigo === "caixa_fechado" ? "Abra o caixa para cobrar. O carrinho fica guardado." : erro.texto}
          </Faixa>
        ) : null}
        <button type="submit" hidden />
      </Formulario>
    </Dialogo>
  );
}
