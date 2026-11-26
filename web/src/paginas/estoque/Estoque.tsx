import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { lerUsuario } from "../../auth/sessao";
import Dialogo from "../../componentes/ui/Dialogo";
import { Carregando, ErroCarga, Faixa, Vazio } from "../../componentes/ui/Estados";
import Icone from "../../componentes/ui/Icone";
import { useSistema } from "../../estado/sistema-ctx";
import { api, type ApiErro } from "../../servicos/api";
import { reaisParaCentavos } from "../../util/dinheiro";

type ItemEstoque = { produto_variante_id: number; nome: string; variante_nome: string; unidade_base: string; qtd_base: number; minimo_base: number | null; esgotado: boolean };
type Cat = { id: number; nome: string; produtos: { id: number; nome: string; esgotado?: boolean; variantes: { id: number; esgotado?: boolean }[] }[] };
type Mov = "ENTRADA" | "PERDA" | "CORRECAO";

const GESTAO = ["ROOT", "ADMIN", "GERENTE"];
const situacao = (i: ItemEstoque) => (i.qtd_base <= 0 ? { t: "Esgotado", c: "tag-err" } : i.minimo_base != null && i.qtd_base <= i.minimo_base ? { t: "Abaixo do mínimo", c: "tag-warn" } : { t: "OK", c: "tag-ok" });
const nomeItem = (i: ItemEstoque) => (i.variante_nome && i.variante_nome !== "Padrão" ? `${i.nome} ${i.variante_nome}` : i.nome);

/**
 * Pranchas 18a–18g. O nível vem de /configuracoes/modulos (estoque_nivel):
 * 0 desligado · 1 só “esgotado” · 2 quantidade dos itens de revenda. Níveis 3–4 (insumos, nota, lotes) ainda não existem no servidor.
 */
export default function Estoque() {
  const { modulos } = useSistema();
  const nivel = modulos.estoque_nivel ?? 0;
  const [escolha, setAba] = useState<"esgotados" | "quantidade" | null>(null);
  const aba = escolha ?? (nivel >= 2 ? "quantidade" : "esgotados");
  const admin = ["ROOT", "ADMIN"].includes(lerUsuario()?.tipo ?? "");

  if (nivel === 0) {
    return (
      <Vazio icone="estoque" titulo="O controle de estoque está desligado" acao={admin ? <Link className="btn btn-pri" to="/painel/configuracoes">Abrir Configurações</Link> : undefined}>
        Escolha o nível em Configurações: 1 marca só o que acabou; 2 conta a quantidade das bebidas e itens de revenda.
      </Vazio>
    );
  }
  return (
    <div className="pilha" style={{ gap: 14 }}>
      <div className="cab-pagina">
        <div className="segmento" role="group" aria-label="Visão">
          <button type="button" aria-pressed={aba === "esgotados"} onClick={() => setAba("esgotados")}>
            Esgotados agora
          </button>
          {nivel >= 2 ? (
            <button type="button" aria-pressed={aba === "quantidade"} onClick={() => setAba("quantidade")}>
              Quantidade
            </button>
          ) : null}
        </div>
        <span className="tag tag-info" style={{ marginLeft: "auto" }}>
          Nível {Math.min(nivel, 2)}
        </span>
      </div>
      {aba === "esgotados" ? <Esgotados /> : <Quantidade />}
    </div>
  );
}

/** Nível 1 (prancha 18c): tocar para marcar ou desmarcar o que acabou. Volta tudo a “disponível” ao abrir o caixa do dia. */
function Esgotados() {
  const { avisar } = useSistema();
  const [cats, setCats] = useState<Cat[] | null>(null);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [ocupado, setOcupado] = useState<number | null>(null);
  const carregar = useCallback(() => {
    (api("/cardapio/pdv") as Promise<Cat[]>)
      .then((c) => {
        setErro("");
        setCats(c);
      })
      .catch((e: ApiErro) => setErro(e.message));
  }, []);
  useEffect(carregar, [carregar]);

  const produtos = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (cats ?? [])
      .flatMap((c) => c.produtos.map((p) => ({ ...p, categoria: c.nome, esg: !!p.esgotado || (p.variantes.length > 0 && p.variantes.every((v) => v.esgotado)) })))
      .filter((p) => !q || p.nome.toLowerCase().includes(q))
      .sort((a, z) => Number(z.esg) - Number(a.esg) || a.nome.localeCompare(z.nome));
  }, [cats, busca]);

  async function trocar(id: number, nome: string, esgotado: boolean) {
    setOcupado(id);
    try {
      await api(`/produtos/${id}`, { method: "PATCH", body: JSON.stringify({ esgotado }) });
      avisar(esgotado ? `${nome} marcado como esgotado.` : `${nome} voltou ao cardápio.`, "ok");
      carregar();
    } catch (e) {
      avisar((e as ApiErro).message, "err");
    } finally {
      setOcupado(null);
    }
  }

  if (erro) return <ErroCarga mensagem={erro} onTentar={carregar} />;
  if (!cats) return <Carregando />;
  return (
    <div className="pilha" style={{ gap: 10, maxWidth: 720 }}>
      <label className="fld">
        <span className="sr">Buscar produto</span>
        <input type="search" placeholder="Buscar produto" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </label>
      <p className="muted pequeno" style={{ margin: 0 }}>
        Produto esgotado fica cinza no PDV e não deixa vender. Tudo volta a “disponível” quando o caixa do dia é aberto.
      </p>
      <div className="lista">
        {produtos.map((p) => (
          <label key={p.id} className={`item-lista ${p.esg ? "item-esgotado" : ""}`}>
            <span style={{ flex: 1 }}>
              <strong>{p.nome}</strong>
              <br />
              <span className="sub">{p.categoria}</span>
            </span>
            <span className={p.esg ? "tag tag-err" : "muted pequeno"}>{p.esg ? "Esgotado" : "Disponível"}</span>
            <input type="checkbox" role="switch" className="chave" aria-label={`${p.nome} esgotado`} checked={p.esg} disabled={ocupado === p.id} onChange={(e) => trocar(p.id, p.nome, e.target.checked)} />
          </label>
        ))}
      </div>
    </div>
  );
}

/** Nível 2 (prancha 18e): saldo, mínimo e situação; entrada rápida e perda (com motivo). */
function Quantidade() {
  const { avisar } = useSistema();
  const gestor = GESTAO.includes(lerUsuario()?.tipo ?? "");
  const [itens, setItens] = useState<ItemEstoque[] | null>(null);
  const [erro, setErro] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "abaixo" | "zerados">("todos");
  const [mov, setMov] = useState<{ tipo: Mov; item?: ItemEstoque } | null>(null);
  const carregar = useCallback(() => {
    (api("/estoque/itens") as Promise<ItemEstoque[]>)
      .then((i) => {
        setErro("");
        setItens(i);
      })
      .catch((e: ApiErro) => setErro(e.message));
  }, []);
  useEffect(carregar, [carregar]);

  if (erro) return <ErroCarga mensagem={erro} onTentar={carregar} />;
  if (!itens) return <Carregando />;
  const abaixo = itens.filter((i) => i.qtd_base > 0 && i.minimo_base != null && i.qtd_base <= i.minimo_base);
  const zerados = itens.filter((i) => i.qtd_base <= 0);
  const mostrados = filtro === "abaixo" ? abaixo : filtro === "zerados" ? zerados : itens;

  return (
    <div className="pilha" style={{ gap: 12 }}>
      <div className="cab-pagina">
        <div className="pilulas" role="group" aria-label="Filtrar">
          <button type="button" aria-pressed={filtro === "todos"} onClick={() => setFiltro("todos")}>
            Todos ({itens.length})
          </button>
          <button type="button" aria-pressed={filtro === "abaixo"} onClick={() => setFiltro("abaixo")}>
            Abaixo do mínimo ({abaixo.length})
          </button>
          <button type="button" aria-pressed={filtro === "zerados"} onClick={() => setFiltro("zerados")}>
            Zerados ({zerados.length})
          </button>
        </div>
        {gestor ? (
          <button type="button" className="btn btn-pri" style={{ marginLeft: "auto" }} onClick={() => setMov({ tipo: "ENTRADA" })}>
            <Icone nome="mais" /> Entrada rápida
          </button>
        ) : null}
      </div>
      {itens.length === 0 ? (
        <Vazio icone="estoque" titulo="Nenhum produto com controle de quantidade">
          No Cardápio, marque “Controla estoque” nas bebidas e itens de revenda.
        </Vazio>
      ) : (
        <table className="tabela">
          <thead>
            <tr>
              <th>Produto</th>
              <th className="num">Saldo</th>
              <th className="num so-pc">Mínimo</th>
              <th>Situação</th>
              {gestor ? <th /> : null}
            </tr>
          </thead>
          <tbody>
            {mostrados.map((i) => {
              const s = situacao(i);
              return (
                <tr key={i.produto_variante_id}>
                  <td>{nomeItem(i)}</td>
                  <td className="num">
                    {i.qtd_base} {i.unidade_base}
                  </td>
                  <td className="num so-pc">{i.minimo_base != null ? `${i.minimo_base} ${i.unidade_base}` : "—"}</td>
                  <td>
                    <span className={`tag ${s.c}`}>{s.t}</span>
                  </td>
                  {gestor ? (
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <button type="button" className="btn-link" onClick={() => setMov({ tipo: "ENTRADA", item: i })}>
                        Entrada
                      </button>
                      <button type="button" className="btn-link" onClick={() => setMov({ tipo: "PERDA", item: i })}>
                        Perda
                      </button>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <p className="muted pequeno" style={{ margin: 0 }}>
        Cada venda baixa 1 unidade. Com saldo 0 o produto vira “esgotado” no PDV.
      </p>
      {mov ? (
        <Movimento
          tipo={mov.tipo}
          itens={itens}
          inicial={mov.item}
          onFechar={() => setMov(null)}
          onFeito={(txt) => {
            setMov(null);
            avisar(txt, "ok");
            carregar();
          }}
        />
      ) : null}
    </div>
  );
}

function Movimento({ tipo, itens, inicial, onFechar, onFeito }: { tipo: Mov; itens: ItemEstoque[]; inicial?: ItemEstoque; onFechar: () => void; onFeito: (t: string) => void }) {
  const [itemId, setItemId] = useState(inicial ? String(inicial.produto_variante_id) : "");
  const [qtd, setQtd] = useState("");
  const [custo, setCusto] = useState("");
  const [motivo, setMotivo] = useState("");
  const [msg, setMsg] = useState("");
  const [enviando, setEnviando] = useState(false);
  const item = itens.find((i) => String(i.produto_variante_id) === itemId);
  const n = Number(qtd);

  async function salvar() {
    if (!item) return setMsg("Escolha o produto.");
    if (!Number.isInteger(n) || n <= 0) return setMsg("Quantidade inteira maior que zero.");
    if (tipo !== "ENTRADA" && !motivo.trim()) return setMsg("Diga o motivo (ex.: quebrou, venceu).");
    setEnviando(true);
    setMsg("");
    try {
      await api("/estoque/movimentos", {
        method: "POST",
        body: JSON.stringify({ tipo, item_id: item.produto_variante_id, qtd_base: n, motivo: motivo.trim() || undefined, custo_unit_centavos: custo ? reaisParaCentavos(custo) : undefined }),
      });
      onFeito(tipo === "ENTRADA" ? `Entrada de ${n} ${item.unidade_base} em ${nomeItem(item)}.` : `Perda de ${n} ${item.unidade_base} registrada.`);
    } catch (e) {
      setMsg((e as ApiErro).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialogo
      titulo={tipo === "ENTRADA" ? "Entrada de mercadoria" : "Registrar perda"}
      sub={tipo === "ENTRADA" ? "Some ao saldo o que chegou." : "Tira do saldo o que quebrou, venceu ou sumiu. Fica na auditoria."}
      onFechar={onFechar}
      fecharComEsc={!enviando}
      pe={
        <>
          <button type="button" className="btn" onClick={onFechar}>
            Cancelar
          </button>
          <button type="button" className={`btn ${tipo === "ENTRADA" ? "btn-pri" : "btn-perigo"}`} disabled={enviando} onClick={salvar}>
            {enviando ? "Salvando…" : tipo === "ENTRADA" ? "Dar entrada" : "Registrar perda"}
          </button>
        </>
      }
    >
      <div className="pilha" style={{ gap: 12 }}>
        {msg ? <Faixa tom="err" titulo={msg} /> : null}
        <label className="fld">
          <span>Produto</span>
          <select value={itemId} onChange={(e) => setItemId(e.target.value)}>
            <option value="">Escolha…</option>
            {itens.map((i) => (
              <option key={i.produto_variante_id} value={i.produto_variante_id}>
                {nomeItem(i)} (saldo {i.qtd_base})
              </option>
            ))}
          </select>
        </label>
        <div className="linha-campos">
          <label className="fld">
            <span>Quantidade ({item?.unidade_base ?? "un"})</span>
            <input data-foco inputMode="numeric" value={qtd} onChange={(e) => setQtd(e.target.value.replace(/\D/g, ""))} />
          </label>
          {tipo === "ENTRADA" ? (
            <label className="fld">
              <span>Custo por unidade (opcional)</span>
              <input inputMode="decimal" placeholder="0,00" value={custo} onChange={(e) => setCusto(e.target.value)} />
            </label>
          ) : null}
        </div>
        <label className="fld">
          <span>Motivo {tipo === "ENTRADA" ? "(opcional)" : ""}</span>
          <input placeholder={tipo === "ENTRADA" ? "Ex.: compra no atacado" : "Ex.: 2 latas amassadas"} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </label>
        {item && n > 0 ? (
          <p className="muted pequeno" style={{ margin: 0 }}>
            Saldo de {nomeItem(item)}: {item.qtd_base} → {tipo === "ENTRADA" ? item.qtd_base + n : item.qtd_base - n} {item.unidade_base}
          </p>
        ) : null}
      </div>
    </Dialogo>
  );
}
