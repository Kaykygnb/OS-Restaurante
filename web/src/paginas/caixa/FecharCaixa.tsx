import { useEffect, useState } from "react";
import CampoAprovacao from "../../componentes/CampoAprovacao";
import Dialogo from "../../componentes/ui/Dialogo";
import { Carregando, Faixa } from "../../componentes/ui/Estados";
import Icone from "../../componentes/ui/Icone";
import { api, type ApiErro } from "../../servicos/api";
import type { CaixaPrevia, FecharCaixaFormaResultado } from "../../servicos/contratos";
import { lerCaixaPrevia } from "../../servicos/rotas";
import { formatarReais, reaisParaCentavos } from "../../util/dinheiro";

type Resultado = { conferencia?: string; codigo_conferencia?: string; formas: FecharCaixaFormaResultado[]; impressao?: { status?: string; aviso?: string } };
type ContaAberta = { id: number; codigo_atendimento: string; mesa?: { numero: number } | null };
type Etapa = "contar" | "contas" | "aprovar" | "feito";

const classeDif = (d: number) => (d < 0 ? "dif-neg" : d > 0 ? "dif-pos" : "dif-zero");
const sinal = (d: number) => (d > 0 ? "+ " : d < 0 ? "− " : "") + formatarReais(Math.abs(d));

/**
 * Fechamento cego (pranchas 10i–10k). O operador digita o contado por forma e não vê o esperado.
 * Falta → motivo + PIN de gerente (o servidor responde motivo_obrigatorio/aprovacao_necessaria).
 * Contas abertas → lista e pede motivo para forçar. Sempre imprime com código de conferência.
 */
export default function FecharCaixa({ sessaoId, gestor, onFechar, onFechado }: { sessaoId: number; gestor: boolean; onFechar: () => void; onFechado: () => void }) {
  const [previa, setPrevia] = useState<CaixaPrevia | null>(null);
  const [erroCarga, setErroCarga] = useState("");
  const [valores, setValores] = useState<Record<number, string>>({});
  const [etapa, setEtapa] = useState<Etapa>("contar");
  const [contas, setContas] = useState<ContaAberta[]>([]);
  const [forcar, setForcar] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [aprov, setAprov] = useState("");
  const [pin, setPin] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [res, setRes] = useState<Resultado | null>(null);

  useEffect(() => {
    lerCaixaPrevia()
      .then(setPrevia)
      .catch((e: ApiErro) => setErroCarga(e.message));
  }, []);

  const contado = (id: number) => reaisParaCentavos(valores[id] || "0");
  const faltaAlgum = previa?.formas.some((f) => valores[f.forma_pagamento_id] === undefined || valores[f.forma_pagamento_id] === "");

  async function enviar(extra: { aprovacao?: boolean } = {}) {
    if (!previa) return;
    if (faltaAlgum) return setErro("Digite o valor de todas as formas (0 se não tiver nada).");
    if ((etapa === "aprovar" || etapa === "contas") && !motivo.trim()) return setErro("Escreva o motivo.");
    if (extra.aprovacao && (!aprov || pin.length < 4)) return setErro("Escolha o gerente e digite o PIN.");
    setEnviando(true);
    setErro("");
    try {
      const r = (await api(`/caixa/${sessaoId}/fechar`, {
        method: "POST",
        body: JSON.stringify({
          contagem: previa.formas.map((f) => ({ forma_pagamento_id: f.forma_pagamento_id, valor_centavos: contado(f.forma_pagamento_id) })),
          ...(forcar ? { forcar: true } : {}),
          ...(motivo.trim() ? { motivo: motivo.trim() } : {}),
          ...(extra.aprovacao ? { aprovacao: { aprovador_id: Number(aprov), pin } } : {}),
        }),
      })) as Resultado;
      setRes(r);
      setEtapa("feito");
    } catch (e) {
      const err = e as ApiErro;
      if (err.codigo === "contas_abertas") {
        setContas(((err.dados as { contas?: ContaAberta[] })?.contas ?? []) as ContaAberta[]);
        setForcar(true);
        setEtapa("contas");
      } else if (err.codigo === "motivo_obrigatorio" || err.codigo === "aprovacao_necessaria") {
        if (etapa === "aprovar") setErro(err.codigo === "aprovacao_necessaria" ? "PIN inválido ou o aprovador não é gerente." : err.message);
        setEtapa("aprovar");
      } else setErro(err.message);
    } finally {
      setEnviando(false);
    }
  }

  async function reimprimir() {
    try {
      await api(`/caixa/${sessaoId}/reimprimir`, { method: "POST", body: "{}" });
      setErro("");
      setRes((r) => (r ? { ...r, impressao: { status: "na_fila" } } : r));
    } catch (e) {
      setErro((e as ApiErro).message);
    }
  }

  if (etapa === "feito" && res) {
    const codigo = res.conferencia ?? res.codigo_conferencia ?? "—";
    const comEsperado = res.formas.some((f) => f.esperado_centavos != null);
    // Só avisa o resto do app ao sair: o caixa fechado troca a tela para "Abrir o caixa".
    const concluir = () => {
      onFechar();
      onFechado();
    };
    return (
      <Dialogo
        titulo="Caixa fechado"
        sub="O relatório foi para a impressora (NÃO É DOCUMENTO FISCAL)."
        onFechar={concluir}
        largo={comEsperado}
        pe={
          <>
            <button type="button" className="btn" onClick={reimprimir}>
              <Icone nome="reimprimir" /> Reimprimir
            </button>
            <button type="button" className="btn btn-pri" onClick={concluir}>
              Concluir
            </button>
          </>
        }
      >
        <div className="est">
          <span className="muted pequeno">Código de conferência</span>
          <span className="codigo-conf">{codigo}</span>
        </div>
        {res.impressao?.status === "falhou" ? <Faixa tom="warn">A impressão falhou, mas o fechamento vale. Use “Reimprimir”.</Faixa> : null}
        <table className="tabela">
          <thead>
            <tr>
              <th>Forma</th>
              {comEsperado ? <th className="num">Esperado</th> : null}
              <th className="num">Informado</th>
              {comEsperado ? <th className="num">Diferença</th> : null}
            </tr>
          </thead>
          <tbody>
            {res.formas.map((f) => (
              <tr key={f.forma_pagamento_id}>
                <td>{f.nome}</td>
                {comEsperado ? <td className="num">{formatarReais(f.esperado_centavos ?? 0)}</td> : null}
                <td className="num">{formatarReais(f.contado_centavos)}</td>
                {comEsperado ? <td className={`num ${classeDif(f.diferenca_centavos ?? 0)}`}>{sinal(f.diferenca_centavos ?? 0)}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
        {!comEsperado ? <p className="muted pequeno" style={{ margin: 0 }}>O gerente confere o esperado e a diferença.</p> : null}
        {erro ? <Faixa tom="err">{erro}</Faixa> : null}
      </Dialogo>
    );
  }

  return (
    <Dialogo
      titulo="Fechar o caixa"
      sub={gestor ? "Digite o que contou. Você vê o esperado e a diferença." : "Conte e digite o que tem em cada forma. O sistema confere depois."}
      largo={gestor}
      onFechar={onFechar}
      fecharComEsc={!enviando}
      pe={
        <>
          <button type="button" className="btn" onClick={onFechar}>
            Cancelar
          </button>
          <button type="button" className="btn btn-pri" disabled={enviando || !previa} onClick={() => enviar({ aprovacao: etapa === "aprovar" })}>
            {enviando ? "Fechando…" : etapa === "aprovar" ? "Aprovar e fechar" : etapa === "contas" ? "Fechar mesmo assim" : "Confirmar e imprimir"}
          </button>
        </>
      }
    >
      {erroCarga ? <Faixa tom="err">{erroCarga}</Faixa> : null}
      {!previa && !erroCarga ? <Carregando linhas={4} /> : null}
      {previa ? (
        <div>
          {gestor ? (
            <div className="contagem-linha gestor muted pequeno" style={{ paddingTop: 0 }}>
              <span>Forma</span>
              <span className="num so-gestor-pc">Esperado</span>
              <span className="num">Contado</span>
              <span className="num so-gestor-pc">Diferença</span>
            </div>
          ) : null}
          {previa.formas.map((f) => {
            const dif = contado(f.forma_pagamento_id) - (f.esperado_centavos ?? 0);
            const digitado = (valores[f.forma_pagamento_id] ?? "") !== "";
            return (
              <div key={f.forma_pagamento_id} className={`contagem-linha${gestor ? " gestor" : ""}`}>
                <label htmlFor={`cont-${f.forma_pagamento_id}`}>
                  <strong>{f.nome}</strong>
                </label>
                {gestor ? <span className="num so-gestor-pc">{formatarReais(f.esperado_centavos ?? 0)}</span> : null}
                <input
                  id={`cont-${f.forma_pagamento_id}`}
                  className="entrada"
                  inputMode="decimal"
                  placeholder="R$ 0,00"
                  disabled={etapa !== "contar"}
                  value={valores[f.forma_pagamento_id] ?? ""}
                  onChange={(e) => setValores((v) => ({ ...v, [f.forma_pagamento_id]: e.target.value }))}
                />
                {gestor ? <span className={`num so-gestor-pc ${digitado ? classeDif(dif) : "muted"}`}>{digitado ? sinal(dif) : "—"}</span> : null}
              </div>
            );
          })}
          {!gestor ? (
            <p className="onde-fica" style={{ marginTop: 12 }}>
              <strong>Fechamento cego:</strong> você não vê o valor esperado nem a diferença. Ao confirmar, o fechamento é impresso com um código de conferência.
            </p>
          ) : null}
        </div>
      ) : null}

      {etapa === "contas" ? (
        <div className="pilha">
          <Faixa tom="warn" titulo={`Ainda há ${contas.length} conta(s) aberta(s)`}>
            {contas.map((c) => (c.mesa?.numero ? `Mesa ${c.mesa.numero}` : c.codigo_atendimento)).join(", ")}. Feche as contas antes ou escreva o motivo para fechar o caixa mesmo assim.
          </Faixa>
          <label className="fld">
            <span>Motivo</span>
            <input className="entrada" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="ex.: mesa 7 vai pagar amanhã" />
          </label>
        </div>
      ) : null}

      {etapa === "aprovar" ? (
        <div className="pilha">
          <Faixa tom="warn" titulo="A contagem não bateu com o registrado">
            {gestor ? "Há falta em pelo menos uma forma." : "Chame um gerente para conferir."} Para fechar com falta, o gerente digita o PIN e vocês escrevem o motivo. Fica registrado na auditoria.
          </Faixa>
          <label className="fld">
            <span>Motivo (obrigatório)</span>
            <input className="entrada" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="ex.: troco errado na mesa 7" />
          </label>
          <CampoAprovacao aprovadorId={aprov} onAprovador={setAprov} pin={pin} onPin={setPin} />
          <button type="button" className="btn btn-link" onClick={() => setEtapa("contar")}>
            Voltar e contar de novo
          </button>
        </div>
      ) : null}

      {erro ? <Faixa tom="err">{erro}</Faixa> : null}
    </Dialogo>
  );
}
