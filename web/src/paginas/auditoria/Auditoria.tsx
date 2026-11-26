import { useCallback, useEffect, useMemo, useState } from "react";
import { lerUsuario } from "../../auth/sessao";
import Dialogo from "../../componentes/ui/Dialogo";
import { Carregando, ErroCarga, Faixa, Vazio } from "../../componentes/ui/Estados";
import Icone from "../../componentes/ui/Icone";
import { useSistema } from "../../estado/sistema-ctx";
import { api, MOCK_LIGADO, type ApiErro } from "../../servicos/api";
import { GRUPOS_EVENTO, rotuloEvento, textoValor } from "../../util/auditoria";
import { formatarReais } from "../../util/dinheiro";

type Evento = {
  id: number;
  criado_em: string;
  tipo: string;
  sensivel: boolean;
  destaque?: boolean;
  usuario_id: number | null;
  usuario_nome: string;
  usuario_perfil: string;
  aprovador_nome?: string | null;
  aprovado_com_pin?: boolean;
  terminal_nome?: string | null;
  ip?: string | null;
  alvo_rotulo?: string | null;
  alvo_tipo?: string | null;
  alvo_id?: number | null;
  mesa_id?: number | null;
  atendimento_id?: number | null;
  valor_antes?: string | null;
  valor_depois?: string | null;
  valor_centavos?: number | null;
  motivo?: string | null;
  resultado?: string;
  detalhes?: string | null;
  hash: string | null;
  legado?: boolean;
};
type Resumo = { usuario_id: number; nome: string; perfil: string; cancelamentos: number; descontos_qtd: number; descontos_centavos: number; taxas_manuais: number; estornos: number; reimpressoes: number; sangrias: number; diferenca_caixa_centavos: number; logins_fora_horario: number };
type Aba = "tempo" | "alertas" | "pessoas";
type Periodo = "hoje" | "7" | "30";

const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const diaHora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
const PERFIL: Record<string, string> = { ROOT: "Suporte", ADMIN: "Dono", GERENTE: "Gerente", ATENDENTE: "Atendente", COZINHEIRO: "Cozinha", ENTREGADOR: "Entregador" };

function periodo(p: Periodo) {
  const ini = new Date();
  ini.setHours(0, 0, 0, 0);
  if (p !== "hoje") ini.setDate(ini.getDate() - (Number(p) - 1));
  return { de: ini.toISOString() };
}

/** Pranchas 19a–19e: somente leitura. Linha do tempo com detalhe, alertas e resumo por funcionário. */
export default function Auditoria() {
  const [aba, setAba] = useState<Aba>("tempo");
  const [verif, setVerif] = useState<{ ok: boolean; conferencia?: string | null; primeiro_id_quebrado?: number } | null>(null);
  const { avisar } = useSistema();
  const dono = ["ROOT", "ADMIN"].includes(lerUsuario()?.tipo ?? "");

  async function verificar() {
    try {
      setVerif(await api("/auditoria/verificar"));
    } catch (e) {
      avisar((e as ApiErro).message, "err");
    }
  }

  return (
    <div className="pilha" style={{ gap: 14 }}>
      <div className="cab-pagina">
        <div className="segmento" role="group" aria-label="Visão">
          <button type="button" aria-pressed={aba === "tempo"} onClick={() => setAba("tempo")}>
            Linha do tempo
          </button>
          <button type="button" aria-pressed={aba === "alertas"} onClick={() => setAba("alertas")}>
            Alertas
          </button>
          <button type="button" aria-pressed={aba === "pessoas"} onClick={() => setAba("pessoas")}>
            Por funcionário
          </button>
        </div>
        <span className="tag" style={{ marginLeft: "auto" }}>
          Somente leitura
        </span>
        <button type="button" className="btn" onClick={verificar}>
          <Icone nome="check" /> Conferir integridade
        </button>
      </div>
      {verif ? (
        <Faixa tom={verif.ok ? "ok" : "err"} titulo={verif.ok ? "Nenhum registro foi alterado ou apagado" : `Registro ${verif.primeiro_id_quebrado} não confere`}>
          {verif.ok ? `Código de conferência: ${verif.conferencia ?? "—"}. Anote para comparar depois.` : "Algum registro foi mexido fora do sistema. Avise o suporte."}
        </Faixa>
      ) : null}
      {aba === "tempo" ? <LinhaDoTempo dono={dono} /> : aba === "alertas" ? <Alertas /> : <PorFuncionario />}
    </div>
  );
}

function LinhaDoTempo({ dono }: { dono: boolean }) {
  const { avisar } = useSistema();
  const [pessoas, setPessoas] = useState<{ id: number; nome: string }[]>([]);
  const [pessoa, setPessoa] = useState("");
  const [per, setPer] = useState<Periodo>("hoje");
  const [grupo, setGrupo] = useState("");
  const [soSens, setSoSens] = useState(false);
  const [lista, setLista] = useState<Evento[] | null>(null);
  const [paginas, setPaginas] = useState(1);
  const [pagina, setPagina] = useState(1);
  const [erro, setErro] = useState("");
  const [sel, setSel] = useState<Evento | null>(null);

  useEffect(() => {
    (api("/usuarios?ativos=todos") as Promise<{ id: number; nome: string }[]>).then(setPessoas).catch(() => setPessoas([]));
  }, []);

  const query = useMemo(() => {
    const q = new URLSearchParams({ ...periodo(per), limite: "50", pagina: String(pagina) });
    if (pessoa) q.set("usuario_id", pessoa);
    if (soSens) q.set("sensivel", "true");
    return q;
  }, [per, pessoa, soSens, pagina]);

  const carregar = useCallback(() => {
    (api(`/auditoria?${query}`) as Promise<{ itens: Evento[]; paginas: number }>)
      .then((r) => {
        setErro("");
        setLista(r.itens);
        setPaginas(r.paginas);
      })
      .catch((e: ApiErro) => setErro(e.message));
  }, [query]);
  useEffect(carregar, [carregar]);

  // O servidor filtra um tipo por vez; o grupo (ex.: "Cancelamentos") é filtrado aqui.
  const tipos = GRUPOS_EVENTO.find((g) => g.rotulo === grupo)?.tipos;
  const mostrados = (lista ?? []).filter((e) => !tipos || tipos.includes(e.tipo));

  async function exportar() {
    try {
      const q = new URLSearchParams(query);
      q.delete("pagina");
      q.delete("limite");
      let texto: string;
      if (MOCK_LIGADO) texto = (await api(`/auditoria/exportar?${q}`)) as string;
      else {
        const r = await fetch(`/api/auditoria/exportar?${q}`, { headers: { Authorization: `Bearer ${localStorage.getItem("token") ?? ""}` } });
        if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { erro?: string }).erro ?? "Não deu para exportar.");
        texto = await r.text();
      }
      const url = URL.createObjectURL(new Blob([texto], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `auditoria-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      avisar("Planilha baixada (abre no Excel). A exportação também fica registrada.", "ok");
    } catch (e) {
      avisar((e as Error).message, "err");
    }
  }

  return (
    <div className="pilha" style={{ gap: 12 }}>
      <div className="linha-campos">
        <label className="fld">
          <span>Pessoa</span>
          <select value={pessoa} onChange={(e) => { setPessoa(e.target.value); setPagina(1); }}>
            <option value="">Todas</option>
            {pessoas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="fld">
          <span>Período</span>
          <select value={per} onChange={(e) => { setPer(e.target.value as Periodo); setPagina(1); }}>
            <option value="hoje">Hoje</option>
            <option value="7">Últimos 7 dias</option>
            <option value="30">Últimos 30 dias</option>
          </select>
        </label>
        <label className="fld">
          <span>Tipo de ação</span>
          <select value={grupo} onChange={(e) => setGrupo(e.target.value)}>
            <option value="">Todas</option>
            {GRUPOS_EVENTO.map((g) => (
              <option key={g.rotulo} value={g.rotulo}>
                {g.rotulo}
              </option>
            ))}
          </select>
        </label>
        <div className="fld">
          <span>&nbsp;</span>
          <label className="check">
            <input type="checkbox" checked={soSens} onChange={(e) => { setSoSens(e.target.checked); setPagina(1); }} /> Só ações sensíveis
          </label>
        </div>
        {dono ? (
          <div className="fld">
            <span>&nbsp;</span>
            <button type="button" className="btn" onClick={exportar}>
              Exportar planilha
            </button>
          </div>
        ) : null}
      </div>

      {erro ? (
        <ErroCarga mensagem={erro} onTentar={carregar} />
      ) : !lista ? (
        <Carregando />
      ) : mostrados.length === 0 ? (
        <Vazio icone="auditoria" titulo="Nada registrado nesse filtro">
          Troque o período ou a pessoa.
        </Vazio>
      ) : (
        <div className="lista">
          {mostrados.map((e) => (
            <button key={`${e.legado ? "l" : "e"}${e.id}`} type="button" className={`item-lista ${sel?.id === e.id ? "cartao-sel" : ""}`} onClick={() => setSel(e)}>
              <span className="num" style={{ width: 48 }}>
                {per === "hoje" ? hora(e.criado_em) : new Date(e.criado_em).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
              </span>
              <span className="ponto-ev" style={{ background: e.sensivel || e.destaque ? "var(--err)" : "var(--ink3)" }} aria-hidden />
              <span style={{ flex: 1, minWidth: 0 }}>
                <strong>
                  {e.usuario_nome || "?"} · {rotuloEvento(e.tipo)}
                </strong>
                <br />
                <span className="sub">
                  {[e.alvo_rotulo, e.valor_antes && e.valor_depois ? `${textoValor(e.valor_antes)} → ${textoValor(e.valor_depois)}` : e.valor_centavos ? formatarReais(e.valor_centavos) : null, e.motivo].filter(Boolean).join(" · ") || "—"}
                </span>
              </span>
              {e.aprovador_nome ? <span className="tag so-pc">aprovado: {e.aprovador_nome}{e.aprovado_com_pin ? " (PIN)" : ""}</span> : null}
            </button>
          ))}
        </div>
      )}
      {paginas > 1 ? (
        <div className="linha" style={{ justifyContent: "center" }}>
          <button type="button" className="btn" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>
            Anteriores
          </button>
          <span className="muted pequeno">
            Página {pagina} de {paginas}
          </span>
          <button type="button" className="btn" disabled={pagina >= paginas} onClick={() => setPagina(pagina + 1)}>
            Mais antigos
          </button>
        </div>
      ) : null}
      {sel ? <Detalhe e={sel} onFechar={() => setSel(null)} /> : null}
    </div>
  );
}

function Detalhe({ e, onFechar }: { e: Evento; onFechar: () => void }) {
  const linhas: [string, string | null | undefined][] = [
    ["Quem", `${e.usuario_nome || "?"}${e.usuario_perfil ? ` (${PERFIL[e.usuario_perfil] ?? e.usuario_perfil})` : ""}`],
    ["Quando", diaHora(e.criado_em)],
    ["Aparelho", [e.terminal_nome, e.ip].filter(Boolean).join(" · ") || null],
    ["Onde", e.alvo_rotulo],
    ["Antes", e.valor_antes ? textoValor(e.valor_antes) : null],
    ["Depois", e.valor_depois ? textoValor(e.valor_depois) : null],
    ["Valor", e.valor_centavos != null ? formatarReais(e.valor_centavos) : null],
    ["Motivo", e.motivo],
    ["Aprovado por", e.aprovador_nome ? `${e.aprovador_nome}${e.aprovado_com_pin ? ", com PIN" : ""}` : null],
    ["Resultado", e.resultado && e.resultado !== "ok" ? e.resultado : null],
    ["Detalhes", e.detalhes ? textoValor(e.detalhes) : null],
  ];
  return (
    <Dialogo titulo={rotuloEvento(e.tipo)} sub={e.sensivel ? "Ação sensível" : undefined} onFechar={onFechar}>
      <table className="tabela">
        <tbody>
          {linhas
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <tr key={k}>
                <th style={{ width: 130 }}>{k}</th>
                <td>{v}</td>
              </tr>
            ))}
        </tbody>
      </table>
      <p className="muted pequeno">
        {e.legado ? `Registro antigo nº ${e.id} (antes do selo de integridade).` : `Evento nº ${e.id} · selo ${e.hash?.slice(0, 8) ?? "—"}…`} Não pode ser editado nem apagado.
      </p>
    </Dialogo>
  );
}

function Alertas() {
  const { avisar } = useSistema();
  const [lista, setLista] = useState<Evento[] | null>(null);
  const [erro, setErro] = useState("");
  const [todos, setTodos] = useState(false);
  const carregar = useCallback(() => {
    (api(`/auditoria/alertas?visto=${todos ? "true" : "false"}`) as Promise<Evento[]>)
      .then((l) => {
        setErro("");
        setLista(l);
      })
      .catch((e: ApiErro) => setErro(e.message));
  }, [todos]);
  useEffect(carregar, [carregar]);

  async function visto(e: Evento) {
    try {
      await api(`/auditoria/alertas/${e.id}/visto`, { method: "POST" });
      carregar();
    } catch (x) {
      avisar((x as ApiErro).message, "err");
    }
  }

  if (erro) return <ErroCarga mensagem={erro} onTentar={carregar} />;
  if (!lista) return <Carregando />;
  return (
    <div className="pilha" style={{ gap: 10 }}>
      <label className="check">
        <input type="checkbox" checked={todos} onChange={(e) => setTodos(e.target.checked)} /> Mostrar também os que já vi
      </label>
      {lista.length === 0 ? (
        <Vazio icone="check" titulo="Nenhum alerta novo">
          Cancelamentos, descontos, sangrias e logins estranhos aparecem aqui.
        </Vazio>
      ) : (
        lista.map((e) => (
          <div key={e.id} className="cartao linha" style={{ justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <span style={{ minWidth: 0, flex: 1 }}>
              <strong>
                {rotuloEvento(e.tipo)} · {e.usuario_nome || "?"}
              </strong>
              <br />
              <span className="muted pequeno">
                {diaHora(e.criado_em)}
                {e.alvo_rotulo ? ` · ${e.alvo_rotulo}` : ""}
                {e.valor_centavos ? ` · ${formatarReais(e.valor_centavos)}` : ""}
                {e.motivo ? ` · “${e.motivo}”` : ""}
              </span>
            </span>
            {!todos ? (
              <button type="button" className="btn" onClick={() => visto(e)}>
                Já vi
              </button>
            ) : null}
          </div>
        ))
      )}
    </div>
  );
}

function PorFuncionario() {
  const [per, setPer] = useState<Periodo>("7");
  const [lista, setLista] = useState<Resumo[] | null>(null);
  const [erro, setErro] = useState("");
  const carregar = useCallback(() => {
    (api(`/auditoria/resumo?${new URLSearchParams(periodo(per))}`) as Promise<Resumo[]>)
      .then((l) => {
        setErro("");
        setLista(l);
      })
      .catch((e: ApiErro) => setErro(e.message));
  }, [per]);
  useEffect(carregar, [carregar]);

  if (erro) return <ErroCarga mensagem={erro} onTentar={carregar} />;
  return (
    <div className="pilha" style={{ gap: 10 }}>
      <label className="fld" style={{ maxWidth: 240 }}>
        <span>Período</span>
        <select value={per} onChange={(e) => setPer(e.target.value as Periodo)}>
          <option value="hoje">Hoje</option>
          <option value="7">Últimos 7 dias</option>
          <option value="30">Últimos 30 dias</option>
        </select>
      </label>
      {!lista ? (
        <Carregando />
      ) : lista.length === 0 ? (
        <Vazio icone="usuarios" titulo="Nada no período" />
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="tabela">
            <thead>
              <tr>
                <th>Pessoa</th>
                <th className="num">Cancelamentos</th>
                <th className="num">Descontos</th>
                <th className="num">Taxas manuais</th>
                <th className="num">Estornos</th>
                <th className="num">Reimpressões</th>
                <th className="num">Sangrias</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((r) => (
                <tr key={r.usuario_id}>
                  <td>
                    {r.nome} <span className="muted pequeno">{PERFIL[r.perfil] ?? r.perfil}</span>
                  </td>
                  <td className="num">{r.cancelamentos}</td>
                  <td className="num">
                    {r.descontos_qtd} {r.descontos_centavos ? <span className="muted pequeno">({formatarReais(r.descontos_centavos)})</span> : null}
                  </td>
                  <td className="num">{r.taxas_manuais}</td>
                  <td className="num">{r.estornos}</td>
                  <td className="num">{r.reimpressoes}</td>
                  <td className="num">{r.sangrias}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted pequeno" style={{ margin: 0 }}>
        Números altos não são prova de nada: servem para saber onde olhar. Clique na linha do tempo para ver cada caso.
      </p>
    </div>
  );
}
