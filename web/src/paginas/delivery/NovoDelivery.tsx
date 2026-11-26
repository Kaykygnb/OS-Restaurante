import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { lerUsuario } from "../../auth/sessao";
import CampoAprovacao from "../../componentes/CampoAprovacao";
import { Faixa } from "../../componentes/ui/Estados";
import Icone from "../../componentes/ui/Icone";
import { useSistema } from "../../estado/sistema-ctx";
import { api, type ApiErro } from "../../servicos/api";
import type { Cliente, Cotacao, EnderecoInput } from "../../servicos/contratos";
import { aplicarEntrega, clientePorTelefone, cotarEntrega, criarEndereco, lerCliente, lerConfigOperacao } from "../../servicos/rotas";
import { formatarReais, reaisParaCentavos } from "../../util/dinheiro";
import { TEXTO_ORIGEM, TEXTO_STATUS, taxaManualPrecisaPin } from "../../util/entrega";
import { enderecoEmLinha, formatarDistancia, formatarTelefone, inicial, soDigitos, telefoneValido } from "../../util/formatos";
import { NovoCliente } from "../clientes/Clientes";
import { ENDERECO_VAZIO, errosEndereco, limparEndereco } from "../clientes/endereco";
import FormEndereco from "../clientes/FormEndereco";

const GESTAO = ["ROOT", "ADMIN", "GERENTE"];

/**
 * Pranchas 07a–07d: começa pelo telefone. Cliente achado → escolhe o endereço → o servidor calcula a taxa.
 * Depois cria o atendimento ENTREGA e segue para lançar os itens (mesma tela de pedido das mesas).
 */
export default function NovoDelivery() {
  const navegar = useNavigate();
  const [params] = useSearchParams();
  const { avisar } = useSistema();
  const gestor = GESTAO.includes(lerUsuario()?.tipo ?? "");
  const [passo, setPasso] = useState<1 | 2>(1);
  const [tel, setTel] = useState("");
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [naoAchou, setNaoAchou] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [cadastrar, setCadastrar] = useState(false);
  const [endId, setEndId] = useState<number | null>(null);
  const [novoEnd, setNovoEnd] = useState<EnderecoInput | null>(null);
  const [errosEnd, setErrosEnd] = useState<Record<string, string>>({});
  const [cot, setCot] = useState<Cotacao | null>(null);
  const [cotando, setCotando] = useState(false);
  const [manual, setManual] = useState<string | null>(null);
  const [forcar, setForcar] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [aprovador, setAprovador] = useState("");
  const [pin, setPin] = useState("");
  const [limite, setLimite] = useState(500);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [atId, setAtId] = useState<number | null>(null);

  useEffect(() => {
    lerConfigOperacao()
      .then((c) => setLimite(c.limite_desconto_sem_pin_centavos))
      .catch(() => {});
    const id = Number(params.get("cliente"));
    if (id) lerCliente(id).then(escolherCliente).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function escolherCliente(c: Cliente) {
    setCliente(c);
    setTel(c.telefone);
    setNaoAchou(false);
    const principal = c.enderecos.find((e) => e.principal) ?? c.enderecos[0];
    setPasso(2);
    if (principal) void escolherEndereco(principal.id);
    else setNovoEnd(ENDERECO_VAZIO);
  }

  async function procurar(t = tel) {
    if (!telefoneValido(t)) return;
    setBuscando(true);
    setNaoAchou(false);
    setCliente(null);
    try {
      escolherCliente(await clientePorTelefone(t));
    } catch (e) {
      if ((e as ApiErro).codigo === "cliente_nao_encontrado" || (e as ApiErro).status === 404) setNaoAchou(true);
      else avisar((e as ApiErro).message, "err");
    } finally {
      setBuscando(false);
    }
  }

  async function escolherEndereco(id: number) {
    setEndId(id);
    setNovoEnd(null);
    setCot(null);
    setManual(null);
    setForcar(false);
    setCotando(true);
    try {
      setCot(await cotarEntrega({ endereco_id: id }));
    } catch (e) {
      setErro((e as ApiErro).message);
    } finally {
      setCotando(false);
    }
  }

  async function salvarNovoEndereco() {
    if (!cliente || !novoEnd) return;
    const e = errosEndereco(novoEnd);
    setErrosEnd(e);
    if (Object.keys(e).length) return;
    try {
      const end = await criarEndereco(cliente.id, limparEndereco(novoEnd));
      const c = await lerCliente(cliente.id);
      setCliente(c);
      void escolherEndereco(end.id);
    } catch (x) {
      avisar((x as ApiErro).message, "err");
    }
  }

  const manualCent = manual != null && manual.trim() !== "" ? reaisParaCentavos(manual) : null;
  const precisaPinTaxa = !gestor && manualCent != null && taxaManualPrecisaPin(cot?.taxa_centavos, manualCent, limite);
  const precisaPinForcar = !gestor && forcar;
  const precisaPin = precisaPinTaxa || precisaPinForcar;
  const statusOk = cot?.status === "ok";
  const taxa = manualCent ?? (statusOk ? cot?.taxa_centavos ?? 0 : null);
  const podeSeguir = !!cliente && !!endId && !cotando && (statusOk || manualCent != null || forcar) && (manualCent == null && !forcar ? true : motivo.trim().length > 0) && (!precisaPin || (aprovador && pin.length >= 4));

  async function confirmar() {
    if (!cliente || !endId) return;
    setEnviando(true);
    setErro("");
    try {
      let id = atId;
      if (!id) {
        const at = (await api("/atendimentos", { method: "POST", body: JSON.stringify({ tipo_atendimento: "ENTREGA", cliente_nome: cliente.nome, cliente_telefone: cliente.telefone, cliente_id: cliente.id }) })) as { id: number };
        id = at.id;
        setAtId(id);
      }
      await aplicarEntrega(id, {
        cliente_id: cliente.id,
        endereco_id: endId,
        ...(manualCent != null ? { taxa_manual_centavos: manualCent } : {}),
        ...(manualCent != null || forcar ? { motivo: motivo.trim() } : {}),
        ...(forcar && manualCent == null ? { forcar: true } : {}),
        ...(precisaPin ? { aprovacao: { aprovador_id: Number(aprovador), pin } } : {}),
      });
      avisar("Delivery criado. Agora lance os itens.", "ok");
      navegar(`/painel/pdv/${id}`);
    } catch (e) {
      const err = e as ApiErro;
      setErro(err.codigo === "pin_invalido" ? "PIN do gerente não confere. Confira e tente de novo." : err.message);
    } finally {
      setEnviando(false);
    }
  }

  const st = cot ? TEXTO_STATUS[cot.status] : null;

  return (
    <div className="pilha" style={{ gap: 14, maxWidth: 820 }}>
      <nav className="passos" aria-label="Etapas">
        <button type="button" aria-current={passo === 1 ? "step" : undefined} className={passo > 1 ? "feito" : ""} onClick={() => setPasso(1)}>
          1 Cliente
        </button>
        <button type="button" aria-current={passo === 2 ? "step" : undefined} disabled={!cliente}>
          2 Endereço e taxa
        </button>
        <button type="button" disabled>
          3 Itens
        </button>
        <button type="button" disabled>
          4 Pagamento
        </button>
      </nav>

      {passo === 1 ? (
        <section className="cartao pilha">
          <label className="fld" style={{ maxWidth: 360 }}>
            <span>Telefone do cliente</span>
            <input
              inputMode="tel"
              autoFocus
              placeholder="(11) 98765-4321"
              value={formatarTelefone(tel)}
              onChange={(e) => {
                const v = soDigitos(e.target.value).slice(0, 11);
                setTel(v);
                setNaoAchou(false);
                if (v.length === 11) void procurar(v);
              }}
              onKeyDown={(e) => e.key === "Enter" && void procurar()}
            />
            <span className="dica">{buscando ? "Procurando…" : "Com DDD. Ao completar o número, a busca é automática."}</span>
          </label>
          <div className="linha">
            <button type="button" className="btn btn-pri" disabled={!telefoneValido(tel) || buscando} onClick={() => procurar()}>
              <Icone nome="lupa" /> Procurar
            </button>
          </div>
          {naoAchou ? (
            <Faixa
              tom="info"
              titulo="Cliente novo"
              acao={
                <button type="button" className="btn btn-pri" onClick={() => setCadastrar(true)}>
                  Cadastrar cliente
                </button>
              }
            >
              Nenhum cliente com {formatarTelefone(tel)}. Cadastre nome e endereço para seguir.
            </Faixa>
          ) : null}
        </section>
      ) : cliente ? (
        <>
          <section className="cartao linha" style={{ gap: 12 }}>
            <span className="avatar">{inicial(cliente.nome)}</span>
            <span style={{ flex: 1 }}>
              <strong>{cliente.nome}</strong>
              <br />
              <span className="muted pequeno">{formatarTelefone(cliente.telefone)}</span>
              {cliente.observacao ? (
                <>
                  <br />
                  <span className="pequeno" style={{ color: "var(--warn)" }}>
                    Obs.: {cliente.observacao}
                  </span>
                </>
              ) : null}
            </span>
            <button type="button" className="btn-link" onClick={() => { setPasso(1); setCliente(null); setCot(null); setEndId(null); }}>
              Trocar
            </button>
          </section>

          <section className="pilha" style={{ gap: 8 }}>
            <div className="linha" style={{ justifyContent: "space-between" }}>
              <h3 style={{ margin: 0 }}>Endereço de entrega</h3>
              {!novoEnd ? (
                <button type="button" className="btn-link" onClick={() => { setNovoEnd(ENDERECO_VAZIO); setEndId(null); setCot(null); }}>
                  <Icone nome="mais" tam={16} /> Novo endereço
                </button>
              ) : null}
            </div>
            {cliente.enderecos.map((e) => (
              <label key={e.id} className={`cartao radio-cartao ${endId === e.id ? "cartao-sel" : ""}`}>
                <input type="radio" name="end" checked={endId === e.id} onChange={() => escolherEndereco(e.id)} />
                <span>
                  {e.apelido ? <strong>{e.apelido} · </strong> : null}
                  {enderecoEmLinha(e)}
                  {e.principal ? <span className="tag tag-info" style={{ marginLeft: 8 }}>Principal</span> : null}
                </span>
              </label>
            ))}
            {novoEnd ? (
              <div className="cartao pilha">
                <FormEndereco valor={novoEnd} onMudar={setNovoEnd} erros={errosEnd} />
                <div className="linha">
                  {cliente.enderecos.length ? (
                    <button type="button" className="btn" onClick={() => setNovoEnd(null)}>
                      Cancelar
                    </button>
                  ) : null}
                  <button type="button" className="btn btn-pri" onClick={salvarNovoEndereco}>
                    Salvar e calcular a taxa
                  </button>
                </div>
              </div>
            ) : null}
          </section>

          {cotando ? <Faixa tom="info" titulo="Calculando a taxa…" /> : null}
          {cot && st ? (
            <section className="pilha" style={{ gap: 10 }}>
              <Faixa tom={st.tom} titulo={statusOk ? `${st.titulo} · Taxa ${formatarReais(cot.taxa_centavos ?? 0)}` : st.titulo}>
                {cot.distancia_m != null ? `${formatarDistancia(cot.distancia_m)} · ` : ""}
                {statusOk && cot.origem_taxa ? `Origem da taxa: ${TEXTO_ORIGEM[cot.origem_taxa]}. ` : ""}
                {cot.avisos.join(" ")}
              </Faixa>
              <div className="linha">
                {manual == null ? (
                  <button type="button" className="btn" onClick={() => setManual("")}>
                    {statusOk ? "Trocar taxa (pede motivo)" : "Digitar a taxa"}
                  </button>
                ) : null}
                {!statusOk && manual == null ? (
                  <label className="check">
                    <input type="checkbox" checked={forcar} onChange={(e) => setForcar(e.target.checked)} /> Entregar mesmo assim
                  </label>
                ) : null}
              </div>
              {manual != null ? (
                <div className="linha-campos">
                  <label className="fld">
                    <span>Taxa de entrega (R$)</span>
                    <input inputMode="decimal" placeholder="0,00" value={manual} onChange={(e) => setManual(e.target.value)} />
                    <button type="button" className="btn-link" style={{ justifySelf: "start" }} onClick={() => setManual(null)}>
                      Voltar para a taxa calculada
                    </button>
                  </label>
                </div>
              ) : null}
              {manual != null || forcar ? (
                <label className="fld">
                  <span>Motivo</span>
                  <input placeholder={forcar ? "Ex.: cliente conhecido, entregador combinou" : "Ex.: cliente perto, combinado por telefone"} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
                </label>
              ) : null}
              {precisaPin ? (
                <CampoAprovacao
                  aprovadorId={aprovador}
                  onAprovador={setAprovador}
                  pin={pin}
                  onPin={setPin}
                  explicacao={forcar ? "Entregar fora da regra precisa de um gerente." : `A taxa ficou mais de ${formatarReais(limite)} abaixo da calculada: precisa de um gerente.`}
                />
              ) : null}
            </section>
          ) : null}

          {erro ? <Faixa tom="err" titulo={erro} /> : null}

          <div className="linha" style={{ justifyContent: "space-between" }}>
            <button type="button" className="btn" onClick={() => navegar("/painel/delivery")}>
              Voltar
            </button>
            <button type="button" className="btn btn-pri btn-g" disabled={!podeSeguir || enviando} onClick={confirmar}>
              {enviando ? "Criando…" : `Próximo: itens${taxa != null ? ` · entrega ${formatarReais(taxa)}` : ""}`}
            </button>
          </div>
        </>
      ) : null}

      {cadastrar ? (
        <NovoCliente
          telefoneInicial={tel}
          onFechar={() => setCadastrar(false)}
          onCriado={(c) => {
            setCadastrar(false);
            escolherCliente(c);
          }}
          onAbrirExistente={(id) => {
            setCadastrar(false);
            lerCliente(id).then(escolherCliente).catch(() => {});
          }}
        />
      ) : null}
    </div>
  );
}
