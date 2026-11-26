import { useState } from "react";
import CampoAprovacao from "./CampoAprovacao";
import Dialogo from "./ui/Dialogo";
import { lerUsuario, podeOperarCaixa } from "../auth/sessao";
import { api, novaChaveIdempotencia } from "../servicos/api";
import { formatarReais, reaisParaCentavos } from "../util/dinheiro";

type Dados = {
  id: number; status: string; cliente_nome?: string | null; cliente_telefone?: string | null;
  cliente_endereco?: string | null; observacao?: string | null; acrescimo_centavos?: number;
  pedidos?: { id: number; codigo_pedido: string; status?: string; itens: { id: number; nome_produto: string; quantidade: number; cancelado: boolean; preco_centavos?: number; total_centavos?: number; escolhas?: { nome_opcao?: string; preco_extra_centavos: number; quantidade: number }[]; adicionais?: { nome_adicional?: string; preco_centavos: number; quantidade: number }[] }[] }[];
  pagamentos?: { id: number; valor_centavos: number; estornado_em?: string | null; estorno_motivo?: string | null; forma_pagamento?: { nome: string } }[];
};
type Linha = NonNullable<Dados["pedidos"]>[number]["itens"][number];
function totalLinha(i: Linha) { return i.cancelado ? 0 : i.total_centavos ?? i.quantidade * ((i.preco_centavos ?? 0) + (i.escolhas ?? []).reduce((s,x) => s+x.quantidade*x.preco_extra_centavos,0) + (i.adicionais ?? []).reduce((s,x) => s+x.quantidade*x.preco_centavos,0)); }
type Acao = { titulo: string; url: string; tipo: "cancelar" | "estornar" | "reimprimir" | "editar" | "acrescimo"; chave: string };

export default function AtendimentoAcoes({ atendimento, onAtualizar }: { atendimento: Dados; onAtualizar: () => void | Promise<void> }) {
  const [acao, setAcao] = useState<Acao | null>(null);
  const [motivo, setMotivo] = useState("");
  const [valor, setValor] = useState("");
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [endereco, setEndereco] = useState("");
  const [obs, setObs] = useState("");
  const [pin, setPin] = useState("");
  const [aprovador, setAprovador] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const usuario = lerUsuario();
  const gestor = ["ROOT", "ADMIN", "GERENTE"].includes(usuario?.tipo ?? "");
  const aberta = atendimento.status === "ABERTO";
  function abrir(tipo: Acao["tipo"], titulo: string, url: string) {
    setErro(""); setOk(""); setMotivo(""); setPin(""); setAprovador("");
    setNome(atendimento.cliente_nome ?? ""); setTelefone(atendimento.cliente_telefone ?? "");
    setEndereco(atendimento.cliente_endereco ?? ""); setObs(atendimento.observacao ?? "");
    setValor(((atendimento.acrescimo_centavos ?? 0) / 100).toFixed(2).replace(".", ","));
    setAcao({ tipo, titulo, url, chave: novaChaveIdempotencia() });
  }
  async function confirmar() {
    if (!acao || busy) return;
    const sensivel = acao.tipo === "cancelar" || acao.tipo === "estornar";
    if (sensivel && !motivo.trim()) return setErro("Informe o motivo.");
    if (sensivel && !gestor && (!pin || !aprovador)) return setErro("Informe a aprovação do gerente.");
    const centavos = reaisParaCentavos(valor);
    if (acao.tipo === "acrescimo" && (!Number.isFinite(centavos) || centavos < 0 || (centavos > 0 && !motivo.trim()))) return setErro("Informe um valor válido e o motivo. Use zero para remover.");
    const body = acao.tipo === "editar" ? { cliente_nome: nome, cliente_telefone: telefone, cliente_endereco: endereco, observacao: obs }
      : acao.tipo === "acrescimo" ? { valor_centavos: centavos, motivo }
      : { motivo, pin: pin || undefined, aprovador_id: aprovador ? Number(aprovador) : undefined };
    setBusy(true); setErro("");
    try {
      const res = await api(acao.url, { method: acao.tipo === "editar" ? "PUT" : "POST", body: JSON.stringify(body), chaveIdempotencia: acao.chave }) as { impressao?: { avisos?: string[] } };
      setOk(res.impressao?.avisos?.length ? res.impressao.avisos.join(" · ") : `${acao.titulo}: concluído.`);
      setAcao(null); setPin(""); await onAtualizar();
    } catch (e) { setErro((e as Error).message); } finally { setBusy(false); }
  }
  return <section className="gerenciar-atendimento" style={{ marginBlock: 12 }}>
    <h3>Pedidos e dados do atendimento</h3>
    {ok ? <p role="status">{ok}</p> : null}
    {!acao && erro ? <p role="alert">{erro}</p> : null}
    {aberta ? <div className="form-acoes">
      <button type="button" className="btn" onClick={() => abrir("editar", "Editar atendimento", `/atendimentos/${atendimento.id}`)}>Editar cliente e observações</button>
      <button type="button" className="btn" onClick={() => abrir("acrescimo", "Ajustar acréscimo", `/atendimentos/${atendimento.id}/acrescimo`)}>Acréscimo na conta</button>
    </div> : null}
    {atendimento.pedidos?.map(p => <section key={p.id} className="cartao">
      <strong>{p.codigo_pedido}</strong> {p.status === "CANCELADO" ? "Cancelado" : <>
        <button type="button" className="btn" onClick={() => abrir("reimprimir", `Reimprimir ${p.codigo_pedido}`, `/pedidos/${p.id}/reimprimir-producao`)}>Reimprimir produção</button>
        {aberta ? <button type="button" className="btn texto-perigo" onClick={() => abrir("cancelar", `Cancelar pedido ${p.codigo_pedido} — ${formatarReais(p.itens.reduce((s,i) => s + totalLinha(i),0))}`, `/pedidos/${p.id}/cancelar`)}>Cancelar pedido</button> : null}
      </>}
      <ul>{p.itens.map(i => <li key={i.id}>{i.quantidade} × {i.nome_produto} · {formatarReais(totalLinha(i))} {(i.escolhas ?? []).map(e => e.nome_opcao).filter(Boolean).join(", ")} {(i.adicionais ?? []).map(e => e.nome_adicional).filter(Boolean).join(", ")} {i.cancelado ? "— cancelado" : aberta ? <button type="button" className="btn-link" onClick={() => abrir("cancelar", `Cancelar ${i.quantidade} unidades — ${formatarReais(totalLinha(i))}: ${i.nome_produto}`, `/pedido-itens/${i.id}/cancelar`)}>Cancelar linha inteira</button> : null}</li>)}</ul>
    </section>)}
    {podeOperarCaixa(usuario) && atendimento.pagamentos?.length ? <section><h3>Pagamentos</h3>{atendimento.pagamentos.map(p => <p key={p.id}>
      {p.forma_pagamento?.nome} · {formatarReais(p.valor_centavos)} {p.estornado_em ? `— estornado · ${p.estorno_motivo ?? "Motivo registrado na auditoria"}` : aberta ? <button type="button" className="btn" onClick={() => abrir("estornar", `Estornar ${formatarReais(p.valor_centavos)}`, `/pagamentos/${p.id}/estornar`)}>Estornar</button> : null}
    </p>)}</section> : null}
    {acao ? <Dialogo titulo={acao.titulo} onFechar={() => { if (!busy) setAcao(null); }} fecharComEsc={!busy} pe={<button type="button" className={`btn ${acao.tipo === "cancelar" || acao.tipo === "estornar" ? "btn-perigo" : "btn-pri"}`} disabled={busy || ((acao.tipo === "cancelar" || acao.tipo === "estornar") && !motivo.trim())} onClick={confirmar}>{busy ? "Salvando…" : acao.tipo === "cancelar" ? "Cancelar os itens indicados" : acao.tipo === "estornar" ? "Estornar pagamento" : acao.tipo === "reimprimir" ? "Enviar nova via" : "Salvar alteração"}</button>}>
      {erro ? <p role="alert">{erro}</p> : null}
      {acao.tipo === "editar" ? <div className="pilha">
        <label className="campo"><span>Nome do cliente</span><input value={nome} onChange={e => setNome(e.target.value)} /></label>
        <label className="campo"><span>Telefone</span><input value={telefone} onChange={e => setTelefone(e.target.value)} /></label>
        <label className="campo"><span>Endereço</span><input value={endereco} onChange={e => setEndereco(e.target.value)} /></label>
        <label className="campo"><span>Observações do atendimento</span><textarea value={obs} onChange={e => setObs(e.target.value)} /></label>
      </div> : acao.tipo === "reimprimir" ? <p>Enviar uma nova via à produção?</p> : <>
        {acao.tipo === "acrescimo" ? <label className="campo"><span>Acréscimo (R$; zero remove)</span><input inputMode="decimal" value={valor} onChange={e => setValor(e.target.value)} /></label> : null}
        <p>{acao.tipo === "cancelar" ? "A linha inteira será retirada da conta. Confira a quantidade e o valor acima." : acao.tipo === "estornar" ? "O pagamento será marcado como estornado e voltará a compor o saldo a receber." : "Use zero para remover o acréscimo."}</p>
        <label className="campo"><span>Motivo *</span><textarea value={motivo} onChange={e => setMotivo(e.target.value)} /></label>
        {!gestor && acao.tipo !== "acrescimo" ? <CampoAprovacao aprovadorId={aprovador} onAprovador={setAprovador} pin={pin} onPin={setPin} /> : null}
      </>}
    </Dialogo> : null}
  </section>;
}
