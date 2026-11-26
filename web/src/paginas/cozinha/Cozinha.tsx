import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { lerUsuario } from "../../auth/sessao";
import { ErroCarga } from "../../componentes/ui/Estados";
import Icone from "../../componentes/ui/Icone";
import { useSistema } from "../../estado/sistema-ctx";
import { api, type ApiErro } from "../../servicos/api";
import type { KdsPedido, KdsResposta } from "../../servicos/contratos";
import { lerKds } from "../../servicos/rotas";

type Estacao = "cozinha" | "bar";
const CHAVE = "os.kds.estacao";

/** Cabeçalho do cartão: "Mesa 7", "Delivery D0015", "Balcão #128". */
function origemPedido(a: KdsPedido["atendimento"]): string {
  if (a.tipo_atendimento === "MESA" && a.mesa) return `Mesa ${a.mesa.numero}`;
  if (a.tipo_atendimento === "ENTREGA") return `Delivery ${a.codigo_atendimento}`;
  if (a.tipo_atendimento === "RETIRADA") return `Retirada ${a.codigo_atendimento}`;
  if (a.tipo_atendimento === "BALCAO") return a.numero_dia != null ? `Balcão #${a.numero_dia}` : `Balcão ${a.codigo_atendimento}`;
  return a.codigo_atendimento;
}

/**
 * Pranchas 09a–09c: KDS por estação (GET /pedidos/cozinha?estacao=cozinha|bar).
 * Colunas Novos → Em preparo → Prontos; atraso pelo `atrasado` do servidor (limite em kds_atraso_min).
 * A cozinha só marca Começar e Pronto; "Entregue" fica para quem atende.
 */
export default function Cozinha() {
  const [params, setParams] = useSearchParams();
  const { avisar } = useSistema();
  const tipo = lerUsuario()?.tipo;
  const ehCozinha = tipo === "COZINHEIRO";
  const estacao: Estacao = params.get("estacao") === "bar" ? "bar" : params.get("estacao") === "cozinha" ? "cozinha" : localStorage.getItem(CHAVE) === "bar" ? "bar" : "cozinha";
  const [dados, setDados] = useState<(KdsResposta & { lido_em: number }) | null>(null);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState<Set<number>>(new Set());
  const [agora, setAgora] = useState(() => Date.now());

  const carregar = useCallback(() => {
    lerKds(estacao)
      .then((d) => {
        const t = Date.now();
        setErro("");
        setAgora(t);
        setDados({ ...d, lido_em: t });
      })
      .catch((e: ApiErro) => setErro(e.message));
  }, [estacao]);

  useEffect(() => {
    carregar();
    const t = setInterval(carregar, 15_000);
    const tique = setInterval(() => setAgora(Date.now()), 30_000);
    const ev = (e: Event) => {
      const tipoEv = (e as CustomEvent<{ tipo?: string }>).detail?.tipo ?? "";
      if (tipoEv.startsWith("pedido")) carregar();
    };
    window.addEventListener("osr:evento", ev);
    return () => {
      clearInterval(t);
      clearInterval(tique);
      window.removeEventListener("osr:evento", ev);
    };
  }, [carregar]);

  function trocar(e: Estacao) {
    localStorage.setItem(CHAVE, e);
    setDados(null);
    setParams({ estacao: e });
  }

  async function mudar(p: KdsPedido, status: "PREPARO" | "PRONTO" | "ENTREGUE") {
    if (enviando.has(p.id)) return; // toque duplo não manda duas vezes
    setEnviando((s) => new Set(s).add(p.id));
    try {
      await api(`/pedidos/${p.id}/status`, { method: "PUT", body: JSON.stringify({ status }) });
      carregar();
    } catch (e) {
      avisar((e as ApiErro).message, "err");
      carregar();
    } finally {
      setEnviando((s) => {
        const n = new Set(s);
        n.delete(p.id);
        return n;
      });
    }
  }

  const passou = dados ? Math.max(0, Math.floor((agora - dados.lido_em) / 60000)) : 0;
  const pedidos = dados?.pedidos ?? [];
  const col = (st: string) => pedidos.filter((p) => p.status === st);
  const COLS: { st: string; titulo: string }[] = [
    { st: "ENVIADO", titulo: "Novos" },
    { st: "PREPARO", titulo: "Em preparo" },
    { st: "PRONTO", titulo: "Prontos" },
  ];

  return (
    <div className="pilha kds" style={{ gap: 12 }}>
      <div className="cab-pagina">
        <div className="segmento" role="group" aria-label="Estação">
          <button type="button" aria-pressed={estacao === "cozinha"} onClick={() => trocar("cozinha")}>
            Cozinha
          </button>
          <button type="button" aria-pressed={estacao === "bar"} onClick={() => trocar("bar")}>
            Bar
          </button>
        </div>
        <span className="muted pequeno so-pc" style={{ marginLeft: "auto" }}>
          Toque em Começar e depois em Pronto. {dados ? `Atraso a partir de ${dados.atraso_min} min.` : ""}
        </span>
      </div>

      {erro && !dados ? (
        <ErroCarga mensagem={erro} onTentar={carregar} />
      ) : !dados ? (
        <div className="esqueleto" style={{ height: 200 }} />
      ) : pedidos.length === 0 ? (
        <div className="est">
          <Icone nome="cozinha" tam={40} cor="var(--ink3)" />
          <strong>Nenhum pedido {estacao === "bar" ? "no bar" : "na cozinha"}</strong>
          <span className="muted">
            {dados.aviso ?? "Os pedidos novos com preparo aparecem aqui (Novos → Em preparo → Prontos)."}
          </span>
        </div>
      ) : (
        <div className="quadro kds-quadro">
          {dados.aviso ? <p className="muted pequeno" style={{ gridColumn: "1 / -1", margin: "0 0 4px" }}>{dados.aviso}</p> : null}
          {COLS.map((c) => (
            <section key={c.st} className="quadro-col" aria-label={c.titulo}>
              <h3>
                {c.titulo} ({col(c.st).length})
              </h3>
              {col(c.st).map((p) => {
                const min = p.minutos_decorridos + passou;
                const atrasado = p.atrasado || min >= dados.atraso_min;
                const ocupado = enviando.has(p.id);
                return (
                  <article key={p.id} className={`quadro-card kq-card ${atrasado && p.status !== "PRONTO" ? "atrasado" : ""}`}>
                    <div className="linha" style={{ justifyContent: "space-between" }}>
                      <strong>{origemPedido(p.atendimento)}</strong>
                      <span className={atrasado && p.status !== "PRONTO" ? "tag tag-err" : "muted pequeno"}>{min} min</span>
                    </div>
                    <span className="muted pequeno">{p.codigo_pedido}</span>
                    <ul className="kq-itens">
                      {p.itens.map((i) => (
                        <li key={i.id}>
                          <div className="kq-linha">
                            <b>{i.quantidade}×</b>
                            <span>{i.nome_produto}</span>
                          </div>
                          {i.escolhas.length || i.adicionais.length ? (
                            <div className="kq-extra">
                              {[...i.escolhas.map((e) => (e.quantidade > 1 ? `${e.quantidade}× ${e.nome_opcao}` : e.nome_opcao)), ...i.adicionais.map((a) => `+ ${a.quantidade > 1 ? `${a.quantidade}× ` : ""}${a.nome_adicional}`)].join(" · ")}
                            </div>
                          ) : null}
                          {i.observacao ? <div className="kq-obs">{i.observacao}</div> : null}
                        </li>
                      ))}
                    </ul>
                    {p.status === "ENVIADO" ? (
                      <button type="button" className="btn btn-bloco" disabled={ocupado} onClick={() => mudar(p, "PREPARO")}>
                        Começar
                      </button>
                    ) : p.status === "PREPARO" ? (
                      <button type="button" className="btn btn-ok btn-bloco" disabled={ocupado} onClick={() => mudar(p, "PRONTO")}>
                        Pronto
                      </button>
                    ) : ehCozinha ? (
                      <span className="muted pequeno">Esperando o garçom buscar</span>
                    ) : (
                      <button type="button" className="btn btn-bloco" disabled={ocupado} onClick={() => mudar(p, "ENTREGUE")}>
                        Entregue
                      </button>
                    )}
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
