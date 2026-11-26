import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Carregando, ErroCarga } from "../../componentes/ui/Estados";
import Icone from "../../componentes/ui/Icone";
import { api, type ApiErro } from "../../servicos/api";
import { formatarReais } from "../../util/dinheiro";
import { formatarTelefone } from "../../util/formatos";
import { rotuloStatusConta, rotuloTipo, tituloAtendimento } from "../../util/rotulos";

type Canal = "TODOS" | "MESA" | "BALCAO" | "DELIVERY";
type Visao = "ABERTO" | "FECHADO" | "TODOS";

type ItemResumo = {
  nome_produto: string;
  quantidade: number;
  cancelado?: boolean;
  observacao?: string | null;
  escolhas?: { nome_opcao: string }[];
  adicionais?: { nome_adicional: string; quantidade: number }[];
};

type AtLista = {
  id: number;
  codigo_atendimento: string;
  tipo_atendimento: string;
  status: string;
  cliente_nome: string | null;
  cliente_telefone: string | null;
  cliente_endereco: string | null;
  aberto_em: string;
  fechado_em?: string | null;
  mesa?: { numero: number } | null;
  totais?: { total_centavos: number; pago_centavos: number; restante_centavos: number };
  total_centavos?: number | null;
  _count?: { pedidos: number };
  pedidos?: { id: number; status: string; itens: ItemResumo[] }[];
};

const DELIVERY = new Set(["ENTREGA", "RETIRADA"]);

function itensAtivos(at: AtLista): ItemResumo[] {
  return (at.pedidos ?? []).flatMap((p) => (p.itens ?? []).filter((i) => !i.cancelado));
}

/** Panorama só lista comanda com produto (mesa aberta vazia fica só no mapa). */
function temProdutos(at: AtLista) {
  if (itensAtivos(at).length > 0) return true;
  if ((at._count?.pedidos ?? 0) > 0 && (at.totais?.total_centavos ?? at.total_centavos ?? 0) > 0) return true;
  return false;
}

/** Agrupa iguais: "2× Pastel de Carne · 1× Coca" — extras entram só na busca. */
function resumoProdutos(itens: ItemResumo[]): { texto: string; qtd: number; busca: string } {
  const mapa = new Map<string, number>();
  const termos: string[] = [];
  for (const i of itens) {
    mapa.set(i.nome_produto, (mapa.get(i.nome_produto) ?? 0) + i.quantidade);
    termos.push(i.nome_produto);
    for (const e of i.escolhas ?? []) termos.push(e.nome_opcao);
    for (const a of i.adicionais ?? []) termos.push(a.nome_adicional);
    if (i.observacao) termos.push(i.observacao);
  }
  const partes = [...mapa.entries()].map(([nome, q]) => (q > 1 ? `${q}× ${nome}` : nome));
  const qtd = [...mapa.values()].reduce((s, n) => s + n, 0);
  return { texto: partes.join(" · "), qtd, busca: termos.join(" ") };
}

function canalDe(tipo: string): Canal {
  if (tipo === "MESA") return "MESA";
  if (tipo === "BALCAO" || tipo === "VENDA_RAPIDA") return "BALCAO";
  if (DELIVERY.has(tipo)) return "DELIVERY";
  return "TODOS";
}

function noCanal(tipo: string, canal: Canal) {
  if (canal === "TODOS") return true;
  return canalDe(tipo) === canal;
}

function hojeStr() {
  return new Date().toDateString();
}

function minutos(iso: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
}

function hora(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** Panorama de comandas: mesa, balcão e delivery com busca e filtros. */
export default function PedidosPanorama() {
  const navegar = useNavigate();
  const [abertos, setAbertos] = useState<AtLista[] | null>(null);
  const [fechados, setFechados] = useState<AtLista[]>([]);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [canal, setCanal] = useState<Canal>("TODOS");
  const [visao, setVisao] = useState<Visao>("ABERTO");

  const carregar = useCallback(() => {
    Promise.all([
      api("/atendimentos?status=ABERTO") as Promise<AtLista[]>,
      api("/atendimentos?status=FECHADO") as Promise<AtLista[]>,
    ])
      .then(([a, f]) => {
        setErro("");
        setAbertos((Array.isArray(a) ? a : []).filter(temProdutos));
        setFechados(
          (Array.isArray(f) ? f : []).filter(
            (x) => temProdutos(x) && x.fechado_em && new Date(x.fechado_em).toDateString() === hojeStr(),
          ),
        );
      })
      .catch((e: ApiErro) => setErro(e.message));
  }, []);

  useEffect(() => {
    carregar();
    const t = setInterval(carregar, 15_000);
    const onEvt = () => carregar();
    window.addEventListener("osr:evento", onEvt);
    return () => {
      clearInterval(t);
      window.removeEventListener("osr:evento", onEvt);
    };
  }, [carregar]);

  const contagens = useMemo(() => {
    const base = abertos ?? [];
    return {
      todos: base.length,
      mesa: base.filter((a) => a.tipo_atendimento === "MESA").length,
      balcao: base.filter((a) => a.tipo_atendimento === "BALCAO" || a.tipo_atendimento === "VENDA_RAPIDA").length,
      delivery: base.filter((a) => DELIVERY.has(a.tipo_atendimento)).length,
      fechados: fechados.length,
    };
  }, [abertos, fechados]);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const casa = (a: AtLista) => {
      if (!q) return true;
      const produtos = resumoProdutos(itensAtivos(a));
      return [
        a.codigo_atendimento,
        a.cliente_nome,
        a.cliente_telefone,
        a.cliente_endereco,
        a.mesa ? `mesa ${a.mesa.numero}` : "",
        rotuloTipo(a.tipo_atendimento),
        tituloAtendimento(a),
        produtos.texto,
        produtos.busca,
      ].some((x) => x?.toLowerCase().includes(q));
    };

    const fonte =
      visao === "ABERTO" ? (abertos ?? []) : visao === "FECHADO" ? fechados : [...(abertos ?? []), ...fechados];

    return fonte
      .filter((a) => noCanal(a.tipo_atendimento, canal) && casa(a))
      .sort((a, b) => new Date(b.aberto_em).getTime() - new Date(a.aberto_em).getTime());
  }, [abertos, fechados, busca, canal, visao]);

  function abrir(at: AtLista) {
    if (at.status !== "ABERTO") {
      navegar(`/painel/conta/${at.id}`);
      return;
    }
    navegar(`/painel/pdv/${at.id}`);
  }

  function receber(at: AtLista) {
    navegar(`/painel/conta/${at.id}`);
  }

  return (
    <div className="pedidos-panorama pilha-lg">
      <div className="cab-pagina">
        <div className="pedidos-lancar" role="group" aria-label="Lançar novo">
          <button type="button" className="btn btn-pri" onClick={() => navegar("/painel/mesas")}>
            <Icone nome="mais" /> Nova mesa
          </button>
          <button type="button" className="btn" onClick={() => navegar("/painel/balcao")}>
            <Icone nome="mais" /> Novo balcão
          </button>
          <button type="button" className="btn" onClick={() => navegar("/painel/delivery/novo")}>
            <Icone nome="mais" /> Novo delivery
          </button>
        </div>
        <label className="fld pedidos-busca">
          <span className="sr">Buscar</span>
          <input
            type="search"
            placeholder="Código, cliente, produto, telefone ou mesa…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </label>
        <button type="button" className="btn" onClick={carregar} disabled={!abertos}>
          Atualizar
        </button>
      </div>

      <div className="pedidos-filtros">
        <nav className="segmento" aria-label="Canal">
          {(
            [
              ["TODOS", `Todos (${contagens.todos})`],
              ["MESA", `Mesas (${contagens.mesa})`],
              ["BALCAO", `Balcão (${contagens.balcao})`],
              ["DELIVERY", `Delivery (${contagens.delivery})`],
            ] as const
          ).map(([id, rotulo]) => (
            <button key={id} type="button" aria-pressed={canal === id} onClick={() => setCanal(id)}>
              {rotulo}
            </button>
          ))}
        </nav>
        <nav className="segmento pedidos-visao" aria-label="Status">
          {(
            [
              ["ABERTO", "Abertos"],
              ["FECHADO", `Fechados hoje (${contagens.fechados})`],
              ["TODOS", "Todos"],
            ] as const
          ).map(([id, rotulo]) => (
            <button key={id} type="button" aria-pressed={visao === id} onClick={() => setVisao(id)}>
              {rotulo}
            </button>
          ))}
        </nav>
      </div>

      {erro ? <ErroCarga mensagem={erro} onTentar={carregar} /> : null}
      {!abertos && !erro ? <Carregando /> : null}

      {abertos ? (
        <section className="cartao pedidos-lista-wrap" aria-label="Lista de pedidos">
          {lista.length === 0 ? (
            <p className="vazio">
              {busca.trim()
                ? "Nenhum pedido bate com a busca."
                : visao === "FECHADO"
                  ? "Nenhum pedido fechado hoje neste filtro."
                  : "Nenhum pedido aberto. Use Mesa, Balcão ou Delivery para lançar."}
            </p>
          ) : (
            <ul className="pedidos-lista">
              {lista.map((at) => {
                const total = at.totais?.total_centavos ?? at.total_centavos ?? 0;
                const restante = at.totais?.restante_centavos ?? total;
                const pago = at.totais?.pago_centavos ?? 0;
                const itens = itensAtivos(at);
                const produtos = resumoProdutos(itens);
                const semItens = itens.length === 0;
                const aberto = at.status === "ABERTO";
                const canalTag = canalDe(at.tipo_atendimento);
                return (
                  <li key={at.id} className={!aberto ? "fechado" : undefined}>
                    <div className="pedidos-item-main">
                      <div className="pedidos-item-topo">
                        <strong>
                          {at.mesa
                            ? `Mesa ${at.mesa.numero}`
                            : at.cliente_nome?.trim() || at.codigo_atendimento}
                        </strong>
                        <span className={`tag${canalTag === "MESA" ? " tag-info" : canalTag === "DELIVERY" ? " tag-ok" : ""}`}>
                          {at.tipo_atendimento === "RETIRADA" ? "Retirada" : rotuloTipo(at.tipo_atendimento)}
                        </span>
                        {!aberto ? <span className="tag">{rotuloStatusConta(at.status)}</span> : null}
                        {produtos.qtd > 0 ? (
                          <span className="tag">{produtos.qtd} {produtos.qtd === 1 ? "item" : "itens"}</span>
                        ) : null}
                      </div>
                      <p className="pedidos-item-meta">
                        <span>{at.codigo_atendimento}</span>
                        {at.mesa && at.cliente_nome ? <span>· {at.cliente_nome}</span> : null}
                        {at.cliente_telefone ? <span>· {formatarTelefone(at.cliente_telefone)}</span> : null}
                      </p>
                      {produtos.texto ? (
                        <p className="pedidos-item-produtos" title={produtos.texto}>
                          {produtos.texto}
                        </p>
                      ) : (
                        <p className="pedidos-item-produtos muted">Sem produtos lançados</p>
                      )}
                      {at.cliente_endereco ? <p className="muted pequeno">{at.cliente_endereco}</p> : null}
                      <p className="pedidos-item-valores">
                        <span>{formatarReais(total)}</span>
                        {aberto ? (
                          <span className="muted">
                            {semItens
                              ? "Sem itens"
                              : restante === 0
                                ? "Pago"
                                : pago > 0
                                  ? `Falta ${formatarReais(restante)}`
                                  : "A pagar"}
                          </span>
                        ) : (
                          <span className="muted">
                            Fechado {at.fechado_em ? `às ${hora(at.fechado_em)}` : ""}
                          </span>
                        )}
                        {aberto ? <span className="muted">{minutos(at.aberto_em)} min</span> : null}
                      </p>
                    </div>
                    <div className="pedidos-item-acoes">
                      {aberto ? (
                        <>
                          <button type="button" className="btn" onClick={() => abrir(at)}>
                            {semItens ? "Lançar" : "Ver / lançar"}
                          </button>
                          {!semItens ? (
                            <button type="button" className="btn btn-pri" onClick={() => receber(at)}>
                              Conta
                            </button>
                          ) : null}
                        </>
                      ) : (
                        <button type="button" className="btn" onClick={() => receber(at)}>
                          Ver conta
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
