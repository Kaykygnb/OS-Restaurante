import { lerRascunhoSeguro, podeTrocarEdicao, useEdicaoPendente } from "../../hooks/useRascunho";
import { confirmar } from "../../servicos/dialogos";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { lerUsuario } from "../../auth/sessao";
import Dialogo from "../../componentes/ui/Dialogo";
import { Carregando, ErroCarga, Faixa, Vazio } from "../../componentes/ui/Estados";
import Icone from "../../componentes/ui/Icone";
import { useSistema } from "../../estado/sistema-ctx";
import type { ApiErro } from "../../servicos/api";
import type { Cliente, ClienteResumo, EnderecoInput, HistoricoCliente } from "../../servicos/contratos";
import { buscarClientes, criarCliente, criarEndereco, editarCliente, editarEndereco, historicoCliente, lerCliente } from "../../servicos/rotas";
import { formatarReais } from "../../util/dinheiro";
import { enderecoEmLinha, formatarDataHora, formatarTelefone, inicial, soDigitos, telefoneValido } from "../../util/formatos";
import { rotuloTipo } from "../../util/rotulos";
import { ENDERECO_VAZIO, errosEndereco, limparEndereco } from "./endereco";
import FormEndereco from "./FormEndereco";

const GESTAO = ["ROOT", "ADMIN", "GERENTE"];
const dataCurta = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—");

/** Pranchas 08a–08e: lista com busca por nome ou telefone, ficha com endereços e histórico. */
export default function Clientes() {
  const [params, setParams] = useSearchParams();
  const [busca, setBusca] = useState("");
  const [lista, setLista] = useState<ClienteResumo[] | null>(null);
  const [erro, setErro] = useState("");
  const [novo, setNovo] = useState(false);
  const fichaId = Number(params.get("ficha")) || null;

  const carregar = useCallback(
    (q: string) => {
      setErro("");
      buscarClientes(q, 50)
        .then(setLista)
        .catch((e: ApiErro) => setErro(e.message));
    },
    [],
  );
  useEffect(() => {
    const t = setTimeout(() => carregar(busca), busca ? 250 : 0);
    return () => clearTimeout(t);
  }, [busca, carregar]);

  const abrirFicha = (id: number | null) => setParams(id ? { ficha: String(id) } : {});

  return (
    <div className="pilha" style={{ gap: 14 }}>
      <div className="cab-pagina">
        <label className="fld" style={{ flex: 1, maxWidth: 420 }}>
          <span className="sr">Buscar cliente</span>
          <input type="search" placeholder="Buscar por nome ou telefone" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </label>
        <button type="button" className="btn btn-pri" onClick={async () => setNovo(true)}>
          <Icone nome="mais" /> Novo cliente
        </button>
      </div>

      {erro ? (
        <ErroCarga mensagem={erro} onTentar={() => carregar(busca)} />
      ) : !lista ? (
        <Carregando />
      ) : lista.length === 0 ? (
        <Vazio icone="clientes" titulo={busca ? "Nenhum cliente encontrado" : "Nenhum cliente ainda"} acao={<button type="button" className="btn btn-pri" onClick={async () => setNovo(true)}>Cadastrar cliente</button>}>
          {busca ? "Confira o nome ou o número, ou cadastre um novo." : "Os clientes aparecem aqui quando você cadastra ou faz um delivery."}
        </Vazio>
      ) : (
        <>
          <table className="tabela so-pc">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Telefone</th>
                <th className="num">Endereços</th>
                <th>Último pedido</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((c) => (
                <tr key={c.id} className="clicavel" onClick={async () => abrirFicha(c.id)}>
                  <td>
                    <button type="button" className="btn-link" onClick={async () => abrirFicha(c.id)}>
                      {c.nome}
                    </button>
                  </td>
                  <td>{formatarTelefone(c.telefone)}</td>
                  <td className="num">{c.enderecos_qtd}</td>
                  <td>{dataCurta(c.ultimo_pedido_em)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="lista so-celular">
            {lista.map((c) => (
              <button key={c.id} type="button" className="item-lista" onClick={async () => abrirFicha(c.id)}>
                <span className="avatar">{inicial(c.nome)}</span>
                <span style={{ flex: 1, textAlign: "left" }}>
                  <strong>{c.nome}</strong>
                  <br />
                  <span className="muted pequeno">
                    {formatarTelefone(c.telefone)} · {c.enderecos_qtd} endereço{c.enderecos_qtd === 1 ? "" : "s"}
                  </span>
                </span>
                <span className="muted pequeno">{dataCurta(c.ultimo_pedido_em)}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {novo ? (
        <NovoCliente
          telefoneInicial={soDigitos(busca).length >= 10 ? soDigitos(busca) : ""}
          onFechar={() => setNovo(false)}
          onCriado={(c) => {
            setNovo(false);
            carregar(busca);
            abrirFicha(c.id);
          }}
          onAbrirExistente={(id) => {
            setNovo(false);
            abrirFicha(id);
          }}
        />
      ) : null}
      {fichaId ? <Ficha id={fichaId} onFechar={() => abrirFicha(null)} onMudou={() => carregar(busca)} /> : null}
    </div>
  );
}

export function NovoCliente({
  telefoneInicial = "",
  enderecoInicial = false,
  onFechar,
  onCriado,
  onAbrirExistente,
}: {
  telefoneInicial?: string;
  enderecoInicial?: boolean;
  onFechar: () => void;
  onCriado: (c: Cliente) => void;
  onAbrirExistente: (id: number) => void;
}) {
  const r = lerRascunhoSeguro<{ nome: string; tel: string; obs: string; comEndereco: boolean; end: EnderecoInput }>("cliente:novo");
  const [nome, setNome] = useState(r?.nome ?? "");
  const [tel, setTel] = useState(r?.tel ?? telefoneInicial);
  const [obs, setObs] = useState(r?.obs ?? "");
  const [comEndereco, setComEndereco] = useState(r?.comEndereco ?? enderecoInicial);
  const [end, setEnd] = useState<EnderecoInput>(r?.end ?? ENDERECO_VAZIO);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const [repetido, setRepetido] = useState<number | null>(null);
  const [enviando, setEnviando] = useState(false);

  const marcarSalvo = useEdicaoPendente("cliente:novo", { nome, tel, obs, comEndereco, end });
  const fechar = async () => { if (await podeTrocarEdicao()) onFechar(); };
  async function salvar() {
    const e: Record<string, string> = {};
    if (!nome.trim()) e.nome = "Informe o nome";
    if (!telefoneValido(tel)) e.telefone = "Telefone com DDD: 10 ou 11 números";
    const ee = comEndereco ? errosEndereco(end) : {};
    setErros({ ...e, ...ee });
    if (Object.keys(e).length || Object.keys(ee).length) return;
    setEnviando(true);
    setMsg("");
    setRepetido(null);
    try {
      const c = await criarCliente({ nome: nome.trim(), telefone: soDigitos(tel), observacao: obs.trim() || undefined, endereco: comEndereco ? limparEndereco(end) : undefined });
      marcarSalvo(); onCriado(c);
    } catch (x) {
      const err = x as ApiErro;
      if (err.codigo === "telefone_em_uso") {
        setRepetido(Number(err.dados?.cliente_id) || null);
        setMsg("Já existe um cliente com esse telefone.");
      } else setMsg(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialogo
      titulo="Novo cliente"
      largo
      onFechar={() => void fechar()}
      fecharComEsc={!enviando}
      pe={
        <>
          <button type="button" className="btn" onClick={() => void fechar()}>
            Cancelar
          </button>
          <button type="button" className="btn btn-pri" disabled={enviando} onClick={salvar}>
            {enviando ? "Salvando…" : "Salvar cliente"}
          </button>
        </>
      }
    >
      <div className="pilha" style={{ gap: 12 }}>
        {msg ? (
          <Faixa
            tom="err"
            titulo={msg}
            acao={
              repetido ? (
                <button type="button" className="btn" onClick={async () => onAbrirExistente(repetido)}>
                  Abrir a ficha desse cliente
                </button>
              ) : undefined
            }
          />
        ) : null}
        <div className="linha-campos">
          <label className="fld">
            <span>Nome</span>
            <input autoComplete="off" value={nome} onChange={(e) => setNome(e.target.value)} aria-invalid={!!erros.nome} data-foco />
            {erros.nome ? <span className="msg-erro">{erros.nome}</span> : null}
          </label>
          <label className="fld">
            <span>Telefone (com DDD)</span>
            <input inputMode="tel" placeholder="(11) 98765-4321" value={formatarTelefone(tel)} onChange={(e) => setTel(soDigitos(e.target.value).slice(0, 11))} aria-invalid={!!erros.telefone} />
            {erros.telefone ? <span className="msg-erro">{erros.telefone}</span> : null}
          </label>
        </div>
        <label className="fld">
          <span>Observação (opcional)</span>
          <input placeholder="Ex.: interfone quebrado, ligar ao chegar" value={obs} onChange={(e) => setObs(e.target.value)} />
        </label>
        <label className="check">
          <input type="checkbox" checked={comEndereco} onChange={(e) => setComEndereco(e.target.checked)} /> Cadastrar endereço agora
        </label>
        {comEndereco ? <FormEndereco valor={end} onMudar={setEnd} erros={erros} /> : null}
      </div>
    </Dialogo>
  );
}

function Ficha({ id, onFechar, onMudou }: { id: number; onFechar: () => void; onMudou: () => void }) {
  const navegar = useNavigate();
  const { avisar } = useSistema();
  const gestor = GESTAO.includes(lerUsuario()?.tipo ?? "");
  const [c, setC] = useState<Cliente | null>(null);
  const [hist, setHist] = useState<HistoricoCliente | null>(null);
  const [erro, setErro] = useState("");
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState({ nome: "", telefone: "", observacao: "" });
  const [novoEnd, setNovoEnd] = useState<EnderecoInput | null>(null);
  const [errosEnd, setErrosEnd] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(() => {
    Promise.all([lerCliente(id), historicoCliente(id)])
      .then(([cli, h]) => {
        setErro("");
        setC(cli);
        setHist(h);
        setForm({ nome: cli.nome, telefone: cli.telefone, observacao: cli.observacao ?? "" });
      })
      .catch((e: ApiErro) => setErro(e.message));
  }, [id]);
  useEffect(carregar, [carregar]);

  async function acao(f: () => Promise<unknown>, ok: string) {
    setOcupado(true);
    try {
      await f();
      avisar(ok, "ok");
      carregar();
      onMudou();
      return true;
    } catch (e) {
      avisar((e as ApiErro).message, "err");
      return false;
    } finally {
      setOcupado(false);
    }
  }

  async function salvarDados() {
    if (!form.nome.trim()) return avisar("Informe o nome.", "err");
    if (!telefoneValido(form.telefone)) return avisar("Telefone com DDD: 10 ou 11 números.", "err");
    if (await acao(() => editarCliente(id, { nome: form.nome.trim(), telefone: soDigitos(form.telefone), observacao: form.observacao }), "Dados salvos.")) setEditando(false);
  }
  async function salvarEndereco() {
    if (!novoEnd) return;
    const e = errosEndereco(novoEnd);
    setErrosEnd(e);
    if (Object.keys(e).length) return;
    if (await acao(() => criarEndereco(id, limparEndereco(novoEnd)), "Endereço salvo.")) setNovoEnd(null);
  }

  return (
    <Dialogo
      titulo={c ? c.nome : "Cliente"}
      sub={c ? formatarTelefone(c.telefone) : undefined}
      largo
      onFechar={onFechar}
      pe={
        <>
          {gestor && c?.ativo ? (
            <button
              type="button"
              className="btn btn-perigo"
              disabled={ocupado}
              onClick={async () => {
                if ((await confirmar(`Desativar ${c.nome}? Ele some da busca, mas o histórico fica guardado.`))) void acao(() => editarCliente(id, { ativo: false }), "Cliente desativado.").then((ok) => ok && onFechar());
              }}
            >
              Desativar
            </button>
          ) : null}
          <span style={{ flex: 1 }} />
          <button type="button" className="btn btn-pri" onClick={async () => navegar(`/painel/delivery/novo?cliente=${id}`)}>
            <Icone nome="delivery" /> Novo delivery
          </button>
        </>
      }
    >
      {erro ? (
        <ErroCarga mensagem={erro} onTentar={carregar} />
      ) : !c || !hist ? (
        <Carregando linhas={3} />
      ) : (
        <div className="pilha" style={{ gap: 16 }}>
          <section className="cartao pilha" style={{ gap: 10 }}>
            <div className="linha" style={{ justifyContent: "space-between" }}>
              <h3 style={{ margin: 0 }}>Dados</h3>
              {!editando ? (
                <button type="button" className="btn-link" onClick={async () => setEditando(true)}>
                  <Icone nome="lapis" tam={16} /> Editar
                </button>
              ) : null}
            </div>
            {editando ? (
              <>
                <div className="linha-campos">
                  <label className="fld">
                    <span>Nome</span>
                    <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
                  </label>
                  <label className="fld">
                    <span>Telefone</span>
                    <input inputMode="tel" value={formatarTelefone(form.telefone)} onChange={(e) => setForm({ ...form, telefone: soDigitos(e.target.value).slice(0, 11) })} />
                  </label>
                </div>
                <label className="fld">
                  <span>Observação</span>
                  <input value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} />
                </label>
                <div className="linha">
                  <button type="button" className="btn" onClick={async () => setEditando(false)}>
                    Cancelar
                  </button>
                  <button type="button" className="btn btn-pri" disabled={ocupado} onClick={salvarDados}>
                    Salvar
                  </button>
                </div>
              </>
            ) : (
              <div className="grade-3">
                <div>
                  <span className="muted pequeno">Pedidos</span>
                  <br />
                  <strong>{hist.qtd_pedidos}</strong>
                </div>
                <div>
                  <span className="muted pequeno">Total gasto</span>
                  <br />
                  <strong>{formatarReais(hist.total_gasto_centavos)}</strong>
                </div>
                <div>
                  <span className="muted pequeno">Observação</span>
                  <br />
                  <span>{c.observacao || "—"}</span>
                </div>
              </div>
            )}
          </section>

          <section className="pilha" style={{ gap: 8 }}>
            <div className="linha" style={{ justifyContent: "space-between" }}>
              <h3 style={{ margin: 0 }}>Endereços</h3>
              {!novoEnd ? (
                <button type="button" className="btn-link" onClick={async () => setNovoEnd(ENDERECO_VAZIO)}>
                  <Icone nome="mais" tam={16} /> Novo endereço
                </button>
              ) : null}
            </div>
            {c.enderecos.length === 0 && !novoEnd ? <p className="muted">Nenhum endereço cadastrado.</p> : null}
            {c.enderecos.map((e) => (
              <div key={e.id} className="cartao linha" style={{ justifyContent: "space-between", padding: 12 }}>
                <span>
                  {e.principal ? <span className="tag tag-info" style={{ marginRight: 8 }}>Principal</span> : null}
                  {enderecoEmLinha(e)}
                  {e.referencia ? <span className="muted pequeno"> · {e.referencia}</span> : null}
                </span>
                <span className="linha">
                  {!e.principal ? (
                    <button type="button" className="btn-link" disabled={ocupado} onClick={async () => void acao(() => editarEndereco(id, e.id, { principal: true }), "Endereço principal trocado.")}>
                      Tornar principal
                    </button>
                  ) : null}
                  <button type="button" className="btn-link" disabled={ocupado} onClick={async () => (await confirmar("Remover este endereço?")) && void acao(() => editarEndereco(id, e.id, { ativo: false }), "Endereço removido.")}>
                    Remover
                  </button>
                </span>
              </div>
            ))}
            {novoEnd ? (
              <div className="cartao pilha">
                <FormEndereco valor={novoEnd} onMudar={setNovoEnd} erros={errosEnd} />
                <div className="linha">
                  <button type="button" className="btn" onClick={async () => setNovoEnd(null)}>
                    Cancelar
                  </button>
                  <button type="button" className="btn btn-pri" disabled={ocupado} onClick={salvarEndereco}>
                    Salvar endereço
                  </button>
                </div>
              </div>
            ) : null}
          </section>

          <section className="pilha" style={{ gap: 8 }}>
            <h3 style={{ margin: 0 }}>Últimos pedidos</h3>
            {hist.itens.length === 0 ? (
              <p className="muted">Ainda não fez pedidos.</p>
            ) : (
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Quando</th>
                    <th>Pedido</th>
                    <th className="so-pc">Itens</th>
                    <th className="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {hist.itens.slice(0, 10).map((h) => (
                    <tr key={h.atendimento_id}>
                      <td>{formatarDataHora(h.aberto_em)}</td>
                      <td>
                        {h.codigo} <span className="muted pequeno">· {rotuloTipo(h.tipo)}</span>
                        {h.status === "CANCELADO" ? <span className="tag tag-err" style={{ marginLeft: 6 }}>Cancelado</span> : h.status === "ABERTO" ? <span className="tag tag-warn" style={{ marginLeft: 6 }}>Aberto</span> : null}
                      </td>
                      <td className="so-pc muted">{h.itens_resumo || "—"}</td>
                      <td className="num">{formatarReais(h.total_centavos)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      )}
    </Dialogo>
  );
}
