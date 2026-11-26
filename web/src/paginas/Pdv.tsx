import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import Ajuda from "../componentes/Ajuda";
import { api } from "../servicos/api";
import { formatarReais } from "../util/dinheiro";

type Opcao = { id: number; nome: string; preco_extra_centavos: number };
type GrupoEsc = {
  id: number;
  nome: string;
  min_escolhas: number;
  max_escolhas: number;
  permite_repetir: boolean;
  opcoes: Opcao[];
};
type Variante = {
  id: number;
  nome: string;
  preco_centavos: number;
  grupos_escolhas: GrupoEsc[];
};
type AdVar = { id: number; nome: string; preco_centavos: number };
type ProdutoPdv = {
  id: number;
  nome: string;
  exige_preparo: boolean;
  variantes: Variante[];
  grupos_adicionais: {
    id: number;
    nome: string;
    adicionais: { id: number; nome: string; qtd_max: number; variantes: AdVar[] }[];
  }[];
};
type CatPdv = { id: number; nome: string; produtos: ProdutoPdv[] };

type CarrinhoLinha = {
  key: string;
  produto_variante_id: number;
  nome: string;
  preco_centavos: number;
  quantidade: number;
  observacao: string;
  escolhas: { opcao_escolha_id: number; nome: string; preco_extra_centavos: number; quantidade: number }[];
  adicionais: { adicional_variante_id: number; nome: string; preco_centavos: number; quantidade: number }[];
};

function linhaCentavos(l: CarrinhoLinha) {
  const extras =
    l.escolhas.reduce((a, e) => a + e.preco_extra_centavos * e.quantidade, 0) +
    l.adicionais.reduce((a, e) => a + e.preco_centavos * e.quantidade, 0);
  return l.quantidade * (l.preco_centavos + extras);
}

export default function Pdv() {
  const { atendimentoId } = useParams();
  const id = Number(atendimentoId);
  if (!Number.isFinite(id)) return <Navigate to="/painel/mesas" replace />;

  const [atendimento, setAtendimento] = useState<any>(null);
  const [cats, setCats] = useState<CatPdv[]>([]);
  const [catId, setCatId] = useState<number | null>(null);
  const [busca, setBusca] = useState("");
  const [produto, setProduto] = useState<ProdutoPdv | null>(null);
  const [varianteId, setVarianteId] = useState<number | null>(null);
  const [qtdItem, setQtdItem] = useState(1);
  const [escolhasSel, setEscolhasSel] = useState<Record<number, number>>({});
  const [adicionaisSel, setAdicionaisSel] = useState<Record<number, number>>({});
  const [obs, setObs] = useState("");
  const [carrinho, setCarrinho] = useState<CarrinhoLinha[]>([]);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const [avisos, setAvisos] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);

  const carregar = useCallback(async () => {
    setErro("");
    try {
      const [at, card] = await Promise.all([
        api(`/atendimentos/${id}`),
        api("/cardapio/pdv") as Promise<CatPdv[]>,
      ]);
      setAtendimento(at);
      setCats(card);
      setCatId((prev) => prev ?? card[0]?.id ?? null);
    } catch (e) {
      setErro((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const produtos = useMemo(() => {
    const lista = cats.find((c) => c.id === catId)?.produtos ?? [];
    const q = busca.trim().toLowerCase();
    if (!q) return lista;
    return lista.filter((p) => p.nome.toLowerCase().includes(q));
  }, [cats, catId, busca]);

  const variante = useMemo(
    () => produto?.variantes.find((v) => v.id === varianteId) ?? produto?.variantes[0] ?? null,
    [produto, varianteId]
  );

  const totalCarrinho = useMemo(() => carrinho.reduce((s, l) => s + linhaCentavos(l), 0), [carrinho]);

  function abrirProduto(p: ProdutoPdv) {
    setProduto(p);
    setVarianteId(p.variantes[0]?.id ?? null);
    setQtdItem(1);
    setEscolhasSel({});
    setAdicionaisSel({});
    setObs("");
    setErro("");
  }

  function toggleEscolha(grupo: GrupoEsc, opcaoId: number) {
    setEscolhasSel((prev) => {
      const next = { ...prev };
      const atual = next[opcaoId] ?? 0;
      if (grupo.permite_repetir) {
        next[opcaoId] = atual + 1;
        return next;
      }
      if (grupo.max_escolhas === 1) {
        for (const op of grupo.opcoes) delete next[op.id];
        next[opcaoId] = 1;
        return next;
      }
      if (atual) {
        delete next[opcaoId];
        return next;
      }
      const doGrupo = grupo.opcoes.reduce((s, o) => s + (next[o.id] ?? 0), 0);
      if (doGrupo >= grupo.max_escolhas) return prev;
      next[opcaoId] = 1;
      return next;
    });
  }

  function addCarrinho() {
    if (!produto || !variante) return;
    for (const g of variante.grupos_escolhas) {
      const total = g.opcoes.reduce((s, o) => s + (escolhasSel[o.id] ?? 0), 0);
      if (total < g.min_escolhas) return setErro(`Escolha no mínimo ${g.min_escolhas} em "${g.nome}"`);
      if (total > g.max_escolhas) return setErro(`No máximo ${g.max_escolhas} em "${g.nome}"`);
    }

    const escolhas = variante.grupos_escolhas.flatMap((g) =>
      g.opcoes
        .filter((o) => (escolhasSel[o.id] ?? 0) > 0)
        .map((o) => ({
          opcao_escolha_id: o.id,
          nome: o.nome,
          preco_extra_centavos: o.preco_extra_centavos,
          quantidade: escolhasSel[o.id]!,
        }))
    );
    const adicionais = (produto.grupos_adicionais ?? []).flatMap((g) =>
      g.adicionais.flatMap((a) =>
        a.variantes
          .filter((v) => (adicionaisSel[v.id] ?? 0) > 0)
          .map((v) => ({
            adicional_variante_id: v.id,
            nome: v.nome,
            preco_centavos: v.preco_centavos,
            quantidade: adicionaisSel[v.id]!,
          }))
      )
    );
    const nome =
      variante.nome.toLowerCase() === "padrão" || variante.nome.toLowerCase() === "padrao"
        ? produto.nome
        : `${produto.nome} - ${variante.nome}`;

    setCarrinho((c) => [
      ...c,
      {
        key: `${Date.now()}-${variante.id}`,
        produto_variante_id: variante.id,
        nome,
        preco_centavos: variante.preco_centavos,
        quantidade: Math.max(1, qtdItem),
        observacao: obs.trim(),
        escolhas,
        adicionais,
      },
    ]);
    setProduto(null);
    setErro("");
    setOk("Adicionado ao pedido");
  }

  async function enviar() {
    if (!carrinho.length) return setErro("Carrinho vazio");
    setEnviando(true);
    setErro("");
    setAvisos([]);
    try {
      const res = (await api(`/atendimentos/${id}/pedidos`, {
        method: "POST",
        body: JSON.stringify({
          itens: carrinho.map((l) => ({
            produto_variante_id: l.produto_variante_id,
            quantidade: l.quantidade,
            observacao: l.observacao || null,
            escolhas: l.escolhas.map((e) => ({
              opcao_escolha_id: e.opcao_escolha_id,
              quantidade: e.quantidade,
            })),
            adicionais: l.adicionais.map((a) => ({
              adicional_variante_id: a.adicional_variante_id,
              quantidade: a.quantidade,
            })),
          })),
        }),
      })) as { pedido: { codigo_pedido: string }; impressao?: { avisos?: string[] } };
      setOk(`Pedido ${res.pedido.codigo_pedido} enviado à cozinha`);
      setAvisos(res.impressao?.avisos ?? []);
      setCarrinho([]);
      await carregar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  if (!atendimento) {
    return (
      <div className="cardapio">
        {erro ? <p className="feedback-card feedback-erro">{erro}</p> : <p>Carregando PDV…</p>}
      </div>
    );
  }

  if (atendimento.status !== "ABERTO") {
    return (
      <div className="cardapio">
        <p className="feedback-card feedback-erro">Atendimento não está aberto.</p>
        <Link to="/painel/mesas">Voltar às mesas</Link>
      </div>
    );
  }

  const tituloMesa = atendimento.mesa
    ? `Mesa ${atendimento.mesa.numero}`
    : atendimento.tipo_atendimento;

  return (
    <div className="cardapio pdv-pagina">
      <section className="pdv-topbar">
        <div>
          <span className="cardapio-kicker">LANÇAMENTO</span>
          <h2 className="titulo-com-ajuda">
            {tituloMesa}
            <Ajuda texto="Toque no produto, monte o item e envie. O carrinho fica sempre à direita." />
          </h2>
          <p>
            {atendimento.codigo_atendimento}
            {atendimento.cliente_nome ? ` · ${atendimento.cliente_nome}` : ""}
            {" · conta "}
            {formatarReais(atendimento.totais?.total_centavos ?? 0)}
          </p>
        </div>
        <div className="config-toolbar-inline">
          <Link className="btn-sec" to={`/painel/conta/${id}`}>
            Conta / pagar
          </Link>
          <Link className="btn-ghost" to="/painel/mesas">
            Mesas
          </Link>
        </div>
      </section>

      {erro ? <p className="feedback-card feedback-erro">{erro}</p> : null}
      {ok ? <p className="feedback-card feedback-ok">{ok}</p> : null}
      {avisos.map((a) => (
        <p key={a} className="feedback-card config-aviso-ip">
          {a}
        </p>
      ))}

      <div className="pdv-layout">
        <section className="painel-bloco pdv-catalogo">
          <div className="pdv-catalogo-cab">
            <input
              className="pdv-busca"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar produto…"
            />
            <div className="abas pdv-cats">
              {cats.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`aba${catId === c.id ? " on" : ""}`}
                  onClick={() => {
                    setCatId(c.id);
                    setProduto(null);
                    setBusca("");
                  }}
                >
                  {c.nome}
                </button>
              ))}
            </div>
          </div>

          <div className="pdv-produtos">
            {produtos.length === 0 ? (
              <p className="ajuda">Nenhum produto nesta categoria.</p>
            ) : (
              produtos.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`pdv-prod${produto?.id === p.id ? " ativo" : ""}`}
                  onClick={() => abrirProduto(p)}
                >
                  <strong>{p.nome}</strong>
                  <span>{formatarReais(p.variantes[0]?.preco_centavos ?? 0)}</span>
                  {!p.exige_preparo ? <em className="pdv-tag">pronto</em> : null}
                </button>
              ))
            )}
          </div>

          {produto && variante ? (
            <div className="pdv-montagem">
              <div className="form-produto-titulo">
                <div>
                  <span className="painel-sobretitulo">MONTAR</span>
                  <strong>{produto.nome}</strong>
                </div>
                <button type="button" className="btn-ghost drawer-fechar" onClick={() => setProduto(null)}>
                  ×
                </button>
              </div>

              {produto.variantes.length > 1 ? (
                <div className="pdv-chips">
                  {produto.variantes.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      className={`pdv-chip${variante.id === v.id ? " on" : ""}`}
                      onClick={() => {
                        setVarianteId(v.id);
                        setEscolhasSel({});
                      }}
                    >
                      {v.nome}
                      <small>{formatarReais(v.preco_centavos)}</small>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="ajuda">{formatarReais(variante.preco_centavos)}</p>
              )}

              {variante.grupos_escolhas.map((g) => (
                <div key={g.id} className="pdv-bloco">
                  <p className="bloco-variante-titulo">
                    {g.nome}{" "}
                    <small className="ajuda-inline">
                      {g.min_escolhas > 0 ? `obrigatório · até ${g.max_escolhas}` : `até ${g.max_escolhas}`}
                    </small>
                  </p>
                  <div className="pdv-chips">
                    {g.opcoes.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        className={`pdv-chip${escolhasSel[o.id] ? " on" : ""}`}
                        onClick={() => toggleEscolha(g, o.id)}
                      >
                        {o.nome}
                        {o.preco_extra_centavos ? (
                          <small>+{formatarReais(o.preco_extra_centavos)}</small>
                        ) : null}
                        {escolhasSel[o.id] && g.permite_repetir ? (
                          <small>×{escolhasSel[o.id]}</small>
                        ) : null}
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              {produto.grupos_adicionais?.map((g) =>
                g.adicionais.some((a) => a.variantes.length) ? (
                  <div key={g.id} className="pdv-bloco">
                    <p className="bloco-variante-titulo">{g.nome}</p>
                    <div className="pdv-chips">
                      {g.adicionais.flatMap((a) =>
                        a.variantes.map((v) => (
                          <button
                            key={v.id}
                            type="button"
                            className={`pdv-chip${adicionaisSel[v.id] ? " on" : ""}`}
                            onClick={() =>
                              setAdicionaisSel((prev) => {
                                const cur = prev[v.id] ?? 0;
                                if (cur >= a.qtd_max) {
                                  const n = { ...prev };
                                  delete n[v.id];
                                  return n;
                                }
                                return { ...prev, [v.id]: cur + 1 };
                              })
                            }
                          >
                            {v.nome}
                            <small>{formatarReais(v.preco_centavos)}</small>
                            {adicionaisSel[v.id] ? <small>×{adicionaisSel[v.id]}</small> : null}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                ) : null
              )}

              <div className="pdv-montagem-rodape">
                <div className="pdv-qtd">
                  <button type="button" className="btn-sec" onClick={() => setQtdItem((q) => Math.max(1, q - 1))}>
                    −
                  </button>
                  <strong>{qtdItem}</strong>
                  <button type="button" className="btn-sec" onClick={() => setQtdItem((q) => q + 1)}>
                    +
                  </button>
                </div>
                <input
                  className="pdv-obs"
                  value={obs}
                  onChange={(e) => setObs(e.target.value)}
                  placeholder="Observação (opcional)"
                />
                <button type="button" className="btn-prim" onClick={addCarrinho}>
                  Adicionar
                </button>
              </div>
            </div>
          ) : null}
        </section>

        <aside className="painel-bloco pdv-carrinho">
          <header className="pdv-carrinho-cab">
            <div>
              <span className="painel-sobretitulo">PEDIDO ATUAL</span>
              <strong>{carrinho.length} item(ns)</strong>
            </div>
            <strong className="pdv-carrinho-total">{formatarReais(totalCarrinho)}</strong>
          </header>

          <ul className="pdv-carrinho-lista">
            {carrinho.length === 0 ? (
              <li className="lista-vazia">
                <strong>Nada no pedido</strong>
                <span>Escolha produtos à esquerda.</span>
              </li>
            ) : (
              carrinho.map((l) => (
                <li key={l.key} className="pdv-linha">
                  <div className="pdv-linha-info">
                    <strong>{l.nome}</strong>
                    {(l.escolhas.length || l.adicionais.length || l.observacao) && (
                      <span>
                        {[
                          ...l.escolhas.map((e) => e.nome),
                          ...l.adicionais.map((a) => a.nome),
                          l.observacao ? `Obs: ${l.observacao}` : "",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    )}
                    <em>{formatarReais(linhaCentavos(l))}</em>
                  </div>
                  <div className="pdv-qtd sm">
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() =>
                        setCarrinho((c) =>
                          c
                            .map((x) =>
                              x.key === l.key ? { ...x, quantidade: Math.max(1, x.quantidade - 1) } : x
                            )
                            .filter((x) => x.quantidade > 0)
                        )
                      }
                    >
                      −
                    </button>
                    <span>{l.quantidade}</span>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() =>
                        setCarrinho((c) =>
                          c.map((x) => (x.key === l.key ? { ...x, quantidade: x.quantidade + 1 } : x))
                        )
                      }
                    >
                      +
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      aria-label="Remover"
                      onClick={() => setCarrinho((c) => c.filter((x) => x.key !== l.key))}
                    >
                      ×
                    </button>
                  </div>
                </li>
              ))
            )}
          </ul>

          <div className="pdv-carrinho-acoes">
            <button
              type="button"
              className="btn-ghost"
              disabled={!carrinho.length || enviando}
              onClick={() => setCarrinho([])}
            >
              Limpar
            </button>
            <button
              type="button"
              className="btn-prim pdv-enviar"
              disabled={enviando || !carrinho.length}
              onClick={() => void enviar()}
            >
              {enviando ? "Enviando…" : "Enviar pra cozinha"}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
