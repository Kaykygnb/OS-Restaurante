import Formulario from "../../componentes/Formulario";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { lerUsuario } from "../../auth/sessao";
import CampoAprovacao from "../../componentes/CampoAprovacao";
import Dialogo from "../../componentes/ui/Dialogo";
import { Carregando, Faixa } from "../../componentes/ui/Estados";
import Icone from "../../componentes/ui/Icone";
import { useSistema } from "../../estado/sistema-ctx";
import { api, novaChaveIdempotencia, type ApiErro } from "../../servicos/api";
import type { CaixaPrevia } from "../../servicos/contratos";
import { lerCaixaPrevia } from "../../servicos/rotas";
import { formatarReais, reaisParaCentavos } from "../../util/dinheiro";
import FecharCaixa from "./FecharCaixa";

const GESTAO = ["ROOT", "ADMIN", "GERENTE"];
const avisarMudou = () => window.dispatchEvent(new Event("osr:caixa-mudou"));
const dataHora = (iso?: string) => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
const dia = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "");

/**
 * Pranchas 10a–10k. O caixa é do restaurante, não de quem está logado: trocar de usuário não fecha.
 * Fechamento cego: o operador só digita o que contou; gerente+ vê esperado e diferença.
 */
export default function CaixaTela() {
  const usuario = lerUsuario();
  const gestor = GESTAO.includes(usuario?.tipo ?? "");
  const { caixa, modulos, avisar } = useSistema();
  const [previa, setPrevia] = useState<CaixaPrevia | null>(null);
  const [mov, setMov] = useState<"SANGRIA" | "SUPRIMENTO" | null>(null);
  const [fechar, setFechar] = useState(false);

  const lerPrevia = useCallback(() => {
    if (!gestor) return;
    lerCaixaPrevia()
      .then(setPrevia)
      .catch(() => setPrevia(null));
  }, [gestor]);
  useEffect(() => {
    if (caixa?.aberto) lerPrevia();
  }, [caixa?.aberto, lerPrevia]);

  if (!caixa) return <Carregando linhas={3} rotulo="Lendo o caixa…" />;
  if (!caixa.aberto) return <AbrirCaixa usaGaveta={modulos.usa_gaveta && caixa.gaveta.disponivel} />;

  const s = caixa.sessao!;
  const totalEsperado = previa?.formas.reduce((t, f) => t + (f.esperado_centavos ?? 0), 0);

  return (
    <div className="pilha" style={{ gap: 16 }}>
      {caixa.sessao_anterior ? (
        <Faixa tom="warn" titulo={`O caixa de ${dia(s.aberto_em)} ficou aberto`}>
          Aberto por {s.usuario_abertura?.nome ?? "—"} em {dataHora(s.aberto_em)}. Feche esse caixa antes de abrir o de hoje. Trocar de usuário ou desligar o PC não fecha o caixa.
        </Faixa>
      ) : null}

      <div className="caixa-topo">
        <section className="cartao pilha">
          <div className="linha" style={{ justifyContent: "space-between" }}>
            <h2 style={{ margin: 0 }}>Caixa {caixa.sessao_anterior ? `de ${dia(s.aberto_em)}` : "de hoje"}</h2>
            <span className={`tag ponto ${caixa.sessao_anterior ? "tag-warn" : "tag-ok"}`}>Aberto</span>
          </div>
          <div className="grade-2">
            <div className="est">
              <span className="muted pequeno">Aberto por</span>
              <strong>{s.usuario_abertura?.nome ?? "—"}</strong>
            </div>
            <div className="est">
              <span className="muted pequeno">Desde</span>
              <strong>{dataHora(s.aberto_em)}</strong>
            </div>
            <div className="est">
              <span className="muted pequeno">Fundo de troco</span>
              <strong>{formatarReais(s.fundo_troco_centavos)}</strong>
            </div>
            <div className="est">
              <span className="muted pequeno">Gaveta</span>
              <strong>{modulos.usa_gaveta ? (caixa.gaveta.disponivel ? "Ligada" : "Indisponível") : "Não usa"}</strong>
            </div>
          </div>
          <div className="linha">
            {!caixa.sessao_anterior ? (
              <>
                <button type="button" className="btn" onClick={() => setMov("SUPRIMENTO")}>
                  <Icone nome="mais" /> Suprimento
                </button>
                <button type="button" className="btn" onClick={() => setMov("SANGRIA")}>
                  <Icone nome="menos" /> Sangria
                </button>
                {modulos.usa_gaveta && caixa.gaveta.disponivel ? <AbrirGaveta /> : null}
              </>
            ) : null}
            <button type="button" className="btn btn-pri btn-g" style={{ marginLeft: "auto" }} onClick={() => setFechar(true)}>
              Fechar o caixa{caixa.sessao_anterior ? ` de ${dia(s.aberto_em)}` : ""}
            </button>
          </div>
        </section>

        <aside className="cartao pilha">
          {gestor ? (
            <>
              <h3 style={{ margin: 0 }}>Composição do esperado</h3>
              {previa?.composicao ? (
                <dl className="composicao-caixa">
                  {(
                    [
                      ["Fundo de troco", previa.composicao.fundo_centavos],
                      ["Recebimentos (todas as formas)", previa.composicao.recebimentos_centavos],
                      ["Suprimentos", previa.composicao.suprimentos_centavos],
                      ["Sangrias (saída)", -previa.composicao.sangrias_centavos],
                    ] as const
                  ).map(([nome, valor]) => (
                    <div key={nome}>
                      <dt>{nome}</dt>
                      <dd>{formatarReais(valor)}</dd>
                    </div>
                  ))}
                  <div className="composicao-total">
                    <dt>Total esperado</dt>
                    <dd>
                      {formatarReais(
                        previa.composicao.fundo_centavos
                          + previa.composicao.recebimentos_centavos
                          + previa.composicao.suprimentos_centavos
                          - previa.composicao.sangrias_centavos,
                      )}
                    </dd>
                  </div>
                </dl>
              ) : null}
              {previa ? (
                <table className="tabela">
                  <tbody>
                    {previa.formas.map((f) => (
                      <tr key={f.forma_pagamento_id}>
                        <td>{f.nome}</td>
                        <td className="num">{formatarReais(f.esperado_centavos ?? 0)}</td>
                      </tr>
                    ))}
                    <tr>
                      <td>
                        <strong>Total</strong>
                      </td>
                      <td className="num">
                        <strong>{formatarReais(totalEsperado ?? 0)}</strong>
                      </td>
                    </tr>
                  </tbody>
                </table>
              ) : (
                <p className="muted pequeno">Prévia indisponível.</p>
              )}
              <p className="muted pequeno" style={{ margin: 0 }}>
                Dinheiro = fundo + pagamentos em dinheiro + suprimentos − sangrias. Cartão/Pix entram só na própria linha. O operador não vê estes valores no fechamento.
              </p>
            </>
          ) : (
            <>
              <h3 style={{ margin: 0 }}>Como fechar</h3>
              <p className="pequeno" style={{ margin: 0 }}>
                Conte o dinheiro, as vias do cartão e confira o Pix. Digite o que contou em cada forma. O sistema confere com o que foi registrado e o gerente vê a diferença.
              </p>
            </>
          )}
        </aside>
      </div>

      <p className="muted pequeno" style={{ margin: 0 }}>
        Relatórios impressos do caixa são cupom NÃO FISCAL (“NÃO É DOCUMENTO FISCAL”). <Link to="/painel/venda">Ir para a venda rápida</Link>
      </p>

      {mov ? (
        <Movimento
          tipo={mov}
          sessaoId={s.id}
          gestor={gestor}
          onFechar={() => setMov(null)}
          onFeito={(t) => {
            setMov(null);
            avisar(t, "ok");
            avisarMudou();
            lerPrevia();
          }}
        />
      ) : null}
      {fechar ? (
        <FecharCaixa
          sessaoId={s.id}
          gestor={gestor}
          onFechar={() => setFechar(false)}
          onFechado={() => {
            avisarMudou();
          }}
        />
      ) : null}
    </div>
  );
}

function AbrirCaixa({ usaGaveta }: { usaGaveta: boolean }) {
  const { avisar } = useSistema();
  const [fundo, setFundo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  async function abrir(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErro("");
    try {
      await api("/caixa/abrir", { method: "POST", body: JSON.stringify({ fundo_troco_centavos: reaisParaCentavos(fundo || "0") }) });
      avisar("Caixa aberto. Já dá para receber.", "ok");
      avisarMudou();
    } catch (e2) {
      const err = e2 as ApiErro;
      setErro(err.codigo === "caixa_ja_aberto" ? "Já existe um caixa aberto. Atualize a tela e feche o caixa antigo primeiro." : err.message);
    } finally {
      setEnviando(false);
    }
  }
  return (
    <Formulario className="cartao pilha" style={{ maxWidth: 520 }} onSubmit={abrir}>
      <h2 style={{ margin: 0 }}>Abrir o caixa</h2>
      <p className="muted" style={{ margin: 0 }}>
        Sem caixa aberto ninguém recebe. O caixa fica aberto mesmo se você trocar de usuário ou desligar o PC.
      </p>
      <label className="fld">
        <span>Fundo de troco (dinheiro que já está no caixa)</span>
        <input className="entrada" inputMode="decimal" placeholder="R$ 0,00" value={fundo} onChange={(e) => setFundo(e.target.value)} data-foco />
        <span className="dica">{usaGaveta ? "A gaveta abre para você conferir." : "Sem gaveta: confira o dinheiro na mão."}</span>
      </label>
      {erro ? <Faixa tom="err">{erro}</Faixa> : null}
      <button className="btn btn-pri btn-g" disabled={enviando}>
        {enviando ? "Abrindo…" : "Abrir caixa"}
      </button>
    </Formulario>
  );
}

function AbrirGaveta() {
  const { avisar } = useSistema();
  return (
    <button
      type="button"
      className="btn"
      onClick={() =>
        api("/caixa/gaveta", { method: "POST", body: "{}" })
          .then(() => avisar("Gaveta aberta.", "ok"))
          .catch((e: ApiErro) => avisar(e.message, "err"))
      }
    >
      <Icone nome="gaveta" /> Abrir gaveta
    </button>
  );
}

function Movimento({ tipo, sessaoId, gestor, onFechar, onFeito }: { tipo: "SANGRIA" | "SUPRIMENTO"; sessaoId: number; gestor: boolean; onFechar: () => void; onFeito: (t: string) => void }) {
  const [valor, setValor] = useState("");
  const [motivo, setMotivo] = useState("");
  const [aprov, setAprov] = useState("");
  const [pin, setPin] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [chave] = useState(novaChaveIdempotencia);
  const precisaPin = tipo === "SANGRIA" && !gestor;
  async function enviar() {
    const v = reaisParaCentavos(valor || "0");
    if (v <= 0) return setErro("Digite o valor.");
    if (!motivo.trim()) return setErro("Escreva o motivo.");
    if (precisaPin && (!aprov || pin.length < 4)) return setErro("Sangria precisa do gerente e do PIN.");
    setEnviando(true);
    setErro("");
    try {
      await api(`/caixa/${sessaoId}/movimentacao`, {
        method: "POST",
        chaveIdempotencia: chave,
        body: JSON.stringify({ tipo, valor_centavos: v, motivo: motivo.trim(), ...(precisaPin ? { aprovador_id: Number(aprov), pin } : {}) }),
      });
      onFeito(`${tipo === "SANGRIA" ? "Sangria" : "Suprimento"} de ${formatarReais(v)} registrado.`);
    } catch (e) {
      setErro((e as ApiErro).message);
    } finally {
      setEnviando(false);
    }
  }
  return (
    <Dialogo
      titulo={tipo === "SANGRIA" ? "Sangria (tirar dinheiro)" : "Suprimento (pôr dinheiro)"}
      sub={tipo === "SANGRIA" ? "Ex.: levar o excesso para o cofre" : "Ex.: reforço de troco"}
      onFechar={onFechar}
      fecharComEsc={!enviando}
      pe={
        <>
          <button type="button" className="btn" onClick={onFechar}>
            Cancelar
          </button>
          <button type="button" className="btn btn-pri" disabled={enviando} onClick={enviar}>
            {enviando ? "Registrando…" : "Registrar"}
          </button>
        </>
      }
    >
      <label className="fld">
        <span>Valor</span>
        <input className="entrada" inputMode="decimal" placeholder="R$ 0,00" value={valor} onChange={(e) => setValor(e.target.value)} />
      </label>
      <label className="fld">
        <span>Motivo</span>
        <input className="entrada" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder={tipo === "SANGRIA" ? "excesso para o cofre" : "troco"} />
      </label>
      {precisaPin ? <CampoAprovacao aprovadorId={aprov} onAprovador={setAprov} pin={pin} onPin={setPin} explicacao="Sangria precisa da aprovação de um gerente." /> : null}
      {erro ? <Faixa tom="err">{erro}</Faixa> : null}
    </Dialogo>
  );
}
