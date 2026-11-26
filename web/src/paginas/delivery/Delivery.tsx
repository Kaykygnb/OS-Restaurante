import { useCallback, useEffect, useMemo, useState } from "react";
import { Route, Routes, useNavigate } from "react-router-dom";
import { Carregando, ErroCarga } from "../../componentes/ui/Estados";
import Icone from "../../componentes/ui/Icone";
import { useSistema } from "../../estado/sistema-ctx";
import { api, type ApiErro } from "../../servicos/api";
import { formatarReais } from "../../util/dinheiro";
import { formatarTelefone } from "../../util/formatos";
import NovoDelivery from "./NovoDelivery";

type AtLista = {
  id: number;
  codigo_atendimento: string;
  tipo_atendimento: string;
  status: string;
  cliente_nome: string | null;
  cliente_telefone: string | null;
  cliente_endereco: string | null;
  taxa_entrega_centavos?: number | null;
  totais?: { total_centavos: number; pago_centavos: number; restante_centavos: number }; total_centavos?: number | null;
  aberto_em: string;
  fechado_em?: string | null;
  _count?: { pedidos: number };
};
type PedidoAberto = { id: number; status: string; atendimento: { id: number } };

const ENTREGAS = new Set(["ENTREGA", "RETIRADA"]);
const minutos = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
const hojeStr = () => new Date().toDateString();

export default function Delivery() {
  return (
    <Routes>
      <Route index element={<Quadro />} />
      <Route path="novo" element={<NovoDelivery />} />
    </Routes>
  );
}

type Coluna = "cozinha" | "pronto" | "saiu" | "fechado";

/** Prancha 07e: andamento dos deliveries de hoje, com o próximo passo em cada cartão. */
function Quadro() {
  const navegar = useNavigate();
  const { avisar } = useSistema();
  const [abertos, setAbertos] = useState<AtLista[] | null>(null);
  const [fechados, setFechados] = useState<AtLista[]>([]);
  const [pedidos, setPedidos] = useState<PedidoAberto[]>([]);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [ocupado, setOcupado] = useState<number | null>(null);

  const carregar = useCallback(() => {
    Promise.all([api("/atendimentos?status=ABERTO") as Promise<AtLista[]>, api("/atendimentos?status=FECHADO") as Promise<AtLista[]>, api("/pedidos?status=ABERTOS") as Promise<PedidoAberto[]>])
      .then(([a, f, p]) => {
        setErro("");
        setAbertos(a.filter((x) => ENTREGAS.has(x.tipo_atendimento)));
        setFechados(f.filter((x) => ENTREGAS.has(x.tipo_atendimento) && x.fechado_em && new Date(x.fechado_em).toDateString() === hojeStr()));
        setPedidos(p);
      })
      .catch((e: ApiErro) => setErro(e.message));
  }, []);
  useEffect(() => {
    carregar();
    const t = setInterval(carregar, 15_000);
    const f = () => carregar();
    window.addEventListener("osr:evento", f);
    return () => {
      clearInterval(t);
      window.removeEventListener("osr:evento", f);
    };
  }, [carregar]);

  const colunas = useMemo(() => {
    const r: Record<Coluna, { at: AtLista; pedidos: PedidoAberto[] }[]> = { cozinha: [], pronto: [], saiu: [], fechado: [] };
    const q = busca.trim().toLowerCase();
    const casa = (a: AtLista) => !q || [a.codigo_atendimento, a.cliente_nome, a.cliente_telefone].some((x) => x?.toLowerCase().includes(q));
    for (const at of (abertos ?? []).filter(casa)) {
      const ps = pedidos.filter((p) => p.atendimento.id === at.id);
      const temPedido = (at._count?.pedidos ?? 0) > 0;
      if (!temPedido || ps.some((p) => p.status !== "PRONTO")) r.cozinha.push({ at, pedidos: ps });
      else if (ps.length) r.pronto.push({ at, pedidos: ps });
      else r.saiu.push({ at, pedidos: ps });
    }
    r.fechado = fechados.filter(casa).map((at) => ({ at, pedidos: [] }));
    return r;
  }, [abertos, fechados, pedidos, busca]);

  async function saiu(at: AtLista, ps: PedidoAberto[]) {
    setOcupado(at.id);
    try {
      for (const p of ps.filter((x) => x.status === "PRONTO")) await api(`/pedidos/${p.id}/status`, { method: "PUT", body: JSON.stringify({ status: "ENTREGUE" }) });
      avisar(`${at.codigo_atendimento} saiu para entrega.`, "ok");
      carregar();
    } catch (e) {
      avisar((e as ApiErro).message, "err");
    } finally {
      setOcupado(null);
    }
  }

  const TITULOS: Record<Coluna, string> = { cozinha: "Na cozinha", pronto: "Pronto para sair", saiu: "Saiu · falta receber", fechado: "Fechados hoje" };

  return (
    <div className="pilha" style={{ gap: 14 }}>
      <div className="cab-pagina">
        <button type="button" className="btn btn-pri" onClick={() => navegar("novo")}>
          <Icone nome="mais" /> Novo delivery
        </button>
        <label className="fld" style={{ marginLeft: "auto", width: 280, maxWidth: "100%" }}>
          <span className="sr">Buscar</span>
          <input type="search" placeholder="Buscar cliente, telefone ou código" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </label>
      </div>
      {erro ? (
        <ErroCarga mensagem={erro} onTentar={carregar} />
      ) : !abertos ? (
        <Carregando />
      ) : (
        <div className="quadro">
          {(Object.keys(TITULOS) as Coluna[]).map((col) => (
            <section key={col} className="quadro-col" aria-label={TITULOS[col]}>
              <h3>
                {TITULOS[col]} ({colunas[col].length})
              </h3>
              {colunas[col].length === 0 ? <p className="muted pequeno">{col === "cozinha" ? "Nenhum pedido aguardando preparo. Use Novo delivery para começar." : col === "pronto" ? "Os pedidos concluídos pela cozinha aparecerão aqui." : col === "saiu" ? "Nenhuma entrega em percurso." : "As entregas finalizadas aparecerão aqui."}</p> : null}
              {colunas[col].map(({ at, pedidos: ps }) => {
                const semItens = (at._count?.pedidos ?? 0) === 0;
                return (
                  <article key={at.id} className="quadro-card">
                    <strong>
                      {at.codigo_atendimento} · {at.cliente_nome || formatarTelefone(at.cliente_telefone) || "Sem nome"}
                    </strong>
                    {at.tipo_atendimento === "RETIRADA" ? <span className="tag tag-info">Cliente busca</span> : null}
                    {at.cliente_endereco ? <span className="muted pequeno">{at.cliente_endereco}</span> : null}
                    <span className="muted pequeno">
                      {at.taxa_entrega_centavos ? `Entrega ${formatarReais(at.taxa_entrega_centavos)}` : null}
                      {` · Total ${formatarReais(at.totais?.total_centavos ?? at.total_centavos ?? 0)} · ${at.totais?.restante_centavos === 0 ? "Pago" : `Pagamento pendente ${formatarReais(at.totais?.restante_centavos ?? at.total_centavos ?? 0)}`}`}
                    </span>
                    <span className="pequeno">{col === "fechado" ? `Fechado às ${new Date(at.fechado_em!).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : `${minutos(at.aberto_em)} min desde o pedido`}</span>
                    {col === "cozinha" ? (
                      <button type="button" className="btn" onClick={() => navegar(`/painel/pdv/${at.id}`)}>
                        {semItens ? "Lançar itens" : "Ver pedido"}
                      </button>
                    ) : col === "pronto" ? (
                      <button type="button" className="btn btn-pri" disabled={ocupado === at.id} onClick={() => saiu(at, ps)}>
                        Saiu para entrega
                      </button>
                    ) : col === "saiu" ? (
                      <button type="button" className="btn btn-pri" onClick={() => navegar(`/painel/conta/${at.id}`)}>
                        Receber e fechar
                      </button>
                    ) : null}
                  </article>
                );
              })}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
