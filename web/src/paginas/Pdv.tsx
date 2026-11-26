import { useProtecaoEdicao } from "../hooks/useRascunho";
import Dialogo from "../componentes/ui/Dialogo";
import AtendimentoAcoes from "../componentes/AtendimentoAcoes";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import Ajuda from "../componentes/Ajuda";
import Avisos from "../componentes/Avisos";
import Modal from "../componentes/Modal";
import { useAviso } from "../hooks/useAviso";
import { api, novaChaveIdempotencia } from "../servicos/api";
import { formatarReais } from "../util/dinheiro";
import { nomeAdicional, tituloAtendimento } from "../util/rotulos";
import {
  linhaCentavos,
  lerRascunho,
  gravarRascunho,
  apagarRascunho,
  alternarEscolha,
  resumoGrupo,
  type CarrinhoLinha,
  type GrupoEsc,
} from "./pdv-regras";

type Variante = {
  esgotado?: boolean;
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
  esgotado?: boolean;
  preco_desde_centavos?: number;
  variantes: Variante[];
  grupos_adicionais: {
    id: number;
    nome: string;
    adicionais: { id: number; nome: string; qtd_max: number; variantes: AdVar[] }[];
  }[];
};
type CatPdv = { id: number; nome: string; produtos: ProdutoPdv[] };

type ItemEnviado = {
  id: number;
  nome_produto: string;
  quantidade: number;
  observacao: string | null;
  cancelado: boolean;
  preco_centavos: number;
  total_centavos?: number;
  escolhas?: { nome_opcao: string; quantidade: number; preco_extra_centavos: number }[];
  adicionais?: { nome_adicional: string; quantidade: number; preco_centavos: number }[];
};
type AtendimentoPdv = {
  id: number;
  status: string;
  codigo_atendimento: string;
  cliente_nome: string | null;
  tipo_atendimento: string;
  mesa: { numero: number } | null;
  totais?: { total_centavos: number };
  pedidos?: { id: number; codigo_pedido: string; itens: ItemEnviado[] }[];
};

function precoDesde(p: ProdutoPdv) {
  if (typeof p.preco_desde_centavos === "number") return p.preco_desde_centavos;
  return p.variantes.reduce((m, v) => Math.min(m, v.preco_centavos), Number.POSITIVE_INFINITY);
}

function semAcento(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export default function Pdv() {
  const { atendimentoId } = useParams();
  const id = Number(atendimentoId);
  const idValido = Number.isFinite(id) && id > 0;
  const navegar = useNavigate();

  const [atendimento, setAtendimento] = useState<AtendimentoPdv | null>(null);
  const [cats, setCats] = useState<CatPdv[]>([]);
  const [catId, setCatId] = useState<number | null>(null);
  const [busca, setBusca] = useState("");
  const [produto, setProduto] = useState<ProdutoPdv | null>(null);
  const [varianteId, setVarianteId] = useState<number | null>(null);
  const [qtdItem, setQtdItem] = useState(1);
  const [escolhasSel, setEscolhasSel] = useState<Record<number, number>>({});
  const [adicionaisSel, setAdicionaisSel] = useState<Record<number, number>>({});
  const [avisoMontagem, setAvisoMontagem] = useState("");
  const [obs, setObs] = useState("");
  const [carrinho, setCarrinho] = useState<CarrinhoLinha[]>(() => (idValido ? lerRascunho(id) : []));
  const { erro, ok, setErro, setOk, limpar } = useAviso();
  const [avisos, setAvisos] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [carrinhoAberto, setCarrinhoAberto] = useState(false);
  const [confirmar, setConfirmar] = useState<null | { tipo: "limpar" } | { tipo: "sair"; para: string }>(null);
  /** Mesma chave enquanto o garçom tenta reenviar o MESMO carrinho: o servidor não duplica o pedido. */
  const chaveEnvio = useRef<string | null>(null);

  const carregar = useCallback(async () => {
    if (!idValido) return;
    try {
      const [at, card] = await Promise.all([
        api(`/atendimentos/${id}`) as Promise<AtendimentoPdv>,
        api("/cardapio/pdv") as Promise<CatPdv[]>,
      ]);
      setAtendimento(at);
      setCats(card);
      setCatId((prev) => prev ?? card[0]?.id ?? null);
    } catch (e) {
      setErro((e as Error).message);
    }
  }, [id, idValido, setErro]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga de dados da tela (fetch)
    void carregar();
  }, [carregar]);

  useEffect(() => {
    if (!idValido) return;
    gravarRascunho(id, carrinho);
    chaveEnvio.current = null;
  }, [id, idValido, carrinho]);

  const produtos = useMemo(() => {
    const q = semAcento(busca.trim());
    if (!q) return cats.find((c) => c.id === catId)?.produtos ?? [];
    // Busca no cardápio inteiro, não só na categoria aberta.
    return cats.flatMap((c) => c.produtos).filter((p) => semAcento(p.nome).includes(q));
  }, [cats, catId, busca]);

  const variante = useMemo(
    () => produto?.variantes.find((v) => v.id === varianteId) ?? produto?.variantes[0] ?? null,
    [produto, varianteId]
  );

  const liberarRascunho = useProtecaoEdicao(`pdv:${id}`, carrinho.length > 0);
  const totalCarrinho = useMemo(() => carrinho.reduce((s, l) => s + linhaCentavos(l), 0), [carrinho]);
  const qtdCarrinho = useMemo(() => carrinho.reduce((s, l) => s + l.quantidade, 0), [carrinho]);
  const produtosCarrinho = new Set(carrinho.map(l => cats.flatMap(c => c.produtos).find(p => p.variantes.some(v => v.id === l.produto_variante_id))?.id ?? l.produto_variante_id)).size;
  const contagem = `${qtdCarrinho} ${qtdCarrinho === 1 ? "unidade" : "unidades"} · ${produtosCarrinho} ${produtosCarrinho === 1 ? "produto" : "produtos"}`;
  if (!idValido) return <Navigate to="/painel/mesas" replace />;

  function abrirProduto(p: ProdutoPdv) {
    if (p.esgotado || p.variantes.every(v => v.esgotado)) return setErro("Este produto está esgotado.");
    setProduto(p);
    setVarianteId(p.variantes.find(v => !v.esgotado)?.id ?? null);
    setQtdItem(1);
    setEscolhasSel({});
    setAdicionaisSel({});
    setAvisoMontagem("");
    setObs("");
    limpar();
  }

  function tocarEscolha(grupo: GrupoEsc, opcaoId: number) {
    const r = alternarEscolha(escolhasSel, grupo, opcaoId);
    setEscolhasSel(r.selecao);
    setAvisoMontagem(r.aviso ?? "");
  }

  function mudarAdicional(varId: number, max: number, delta: 1 | -1, nome: string) {
    const novo = Math.max(0, (adicionaisSel[varId] ?? 0) + delta);
    if (novo > max) {
      setAvisoMontagem(`No máximo ${max} de ${nome} por item.`);
      return;
    }
    setAvisoMontagem("");
    const n = { ...adicionaisSel };
    if (novo === 0) delete n[varId];
    else n[varId] = novo;
    setAdicionaisSel(n);
  }

  const totalMontagem = Math.max(1, qtdItem) * ((variante?.preco_centavos ?? 0)
    + (variante?.grupos_escolhas ?? []).flatMap(g => g.opcoes).reduce((s,o) => s + o.preco_extra_centavos * (escolhasSel[o.id] ?? 0), 0)
    + (produto?.grupos_adicionais ?? []).flatMap(g => g.adicionais).flatMap(a => a.variantes).reduce((s,v) => s + v.preco_centavos * (adicionaisSel[v.id] ?? 0), 0));
  function addCarrinho() {
    if (produto?.esgotado || produto?.variantes.find(v => v.id === varianteId)?.esgotado) return setAvisoMontagem("Esta opção está esgotada.");
    if (!produto || !variante) return;
    for (const g of variante.grupos_escolhas) {
      const total = g.opcoes.reduce((s, o) => s + (escolhasSel[o.id] ?? 0), 0);
      if (total < g.min_escolhas) return setAvisoMontagem(`Escolha no mínimo ${g.min_escolhas} em "${g.nome}".`);
      if (total > g.max_escolhas) return setAvisoMontagem(`No máximo ${g.max_escolhas} em "${g.nome}".`);
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
            nome: nomeAdicional(a.nome, v.nome),
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
        key: `${Date.now()}-${variante.id}-${c.length}`,
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
    setAvisoMontagem("");
    setOk(`${Math.max(1, qtdItem)}× ${nome} no pedido`);
  }

  async function enviar() {
    if (!carrinho.length) return setErro("O pedido está vazio");
    if (!chaveEnvio.current) chaveEnvio.current = novaChaveIdempotencia();
    setEnviando(true);
    setErro("");
    setAvisos([]);
    try {
      const res = (await api(`/atendimentos/${id}/pedidos`, {
        method: "POST",
        chaveIdempotencia: chaveEnvio.current,
        tempoLimiteMs: 20000,
        body: JSON.stringify({
          itens: carrinho.map((l) => ({
            produto_variante_id: l.produto_variante_id,
            quantidade: l.quantidade,
            observacao: l.observacao || null,
            escolhas: l.escolhas.map((e) => ({ opcao_escolha_id: e.opcao_escolha_id, quantidade: e.quantidade })),
            adicionais: l.adicionais.map((a) => ({
              adicional_variante_id: a.adicional_variante_id,
              quantidade: a.quantidade,
            })),
          })),
        }),
      })) as { pedido: { codigo_pedido: string }; impressao?: { avisos?: string[] } };
      setOk(`Pedido ${res.pedido.codigo_pedido} enviado`);
      setAvisos(res.impressao?.avisos ?? []);
      liberarRascunho(); setCarrinho([]);
      apagarRascunho(id);
      chaveEnvio.current = null;
      setCarrinhoAberto(false);
      await carregar();
    } catch (e) {
      // Mantém a chave: se o pedido chegou mas a resposta se perdeu, o reenvio não duplica.
      setErro(`${(e as Error).message} O pedido continua aqui; toque em Enviar de novo.`);
    } finally {
      setEnviando(false);
    }
  }

  function sairPara(para: string) {
    navegar(para);
  }

  if (!atendimento) {
    return (
      <div className="cardapio">
        {erro ? <Avisos erro={erro} /> : <p role="status">Carregando PDV…</p>}
      </div>
    );
  }

  if (atendimento.status !== "ABERTO") {
    return (
      <div className="cardapio">
        <p className="feedback-card feedback-erro" role="alert">
          Esta conta não está mais aberta.
        </p>
        <Link className="btn-sec" to="/painel/mesas">
          Voltar às mesas
        </Link>
      </div>
    );
  }

  const tituloMesa = tituloAtendimento(atendimento);
  const ehEntrega = atendimento.tipo_atendimento === "ENTREGA" || atendimento.tipo_atendimento === "RETIRADA";
  const voltar = ehEntrega ? { para: "/painel/delivery", rotulo: "Delivery" } : { para: "/painel/mesas", rotulo: "Mesas" };

  return (
    <div className={`cardapio pdv-pagina${carrinho.length ? " com-barra-carrinho" : ""}`}>
      <section className="pdv-topbar">
        <div>
          <span className="cardapio-kicker">LANÇAMENTO</span>
          <h2 className="titulo-com-ajuda">
            {tituloMesa}
            <Ajuda texto="Toque no produto, monte o item e toque em Adicionar. Depois envie o pedido." />
          </h2>
          <p>
            {atendimento.codigo_atendimento}
            {atendimento.cliente_nome ? ` · ${atendimento.cliente_nome}` : ""}
            {" · conta já lançada "}
            {formatarReais(atendimento.totais?.total_centavos ?? 0)}
          </p>
        </div>
        <div className="config-toolbar-inline">
          <button type="button" className="btn-sec" onClick={() => sairPara(`/painel/conta/${id}`)}>
            Conta / pagar
          </button>
          <button type="button" className="btn-ghost" onClick={() => sairPara(voltar.para)}>
            {voltar.rotulo}
          </button>
        </div>
      </section>

      <Avisos erro={erro} ok={ok} avisos={avisos} />
      <AtendimentoAcoes atendimento={atendimento} onAtualizar={carregar} />

      <div className="pdv-layout">
        <section className="painel-bloco pdv-catalogo">
          <div className="pdv-catalogo-cab">
            <input
              className="pdv-busca"
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar em todo o cardápio…"
              aria-label="Buscar produto em todo o cardápio"
            />
            {!busca.trim() ? (
              <div className="abas pdv-cats" role="tablist" aria-label="Categorias">
                {cats.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    role="tab"
                    aria-selected={catId === c.id}
                    className={`aba${catId === c.id ? " on" : ""}`}
                    onClick={() => {
                      setCatId(c.id);
                      setProduto(null);
                    }}
                  >
                    {c.nome}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="pdv-produtos">
            {produtos.length === 0 ? (
              <p className="ajuda">{busca.trim() ? `Nada encontrado para "${busca.trim()}".` : "Nenhum produto nesta categoria."}</p>
            ) : (
              produtos.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`pdv-prod${produto?.id === p.id ? " ativo" : ""}`}
                  disabled={p.esgotado || p.variantes.every(v => v.esgotado)}
                  onClick={() => abrirProduto(p)}
                >
                  <strong>{p.nome}{p.esgotado || p.variantes.every(v => v.esgotado) ? " · Esgotado" : ""}</strong>
                  <span>
                    {p.variantes.length > 1 ? "a partir de " : ""}
                    {formatarReais(precoDesde(p))}
                  </span>
                  {!p.exige_preparo ? <em className="pdv-tag">pronto</em> : null}
                </button>
              ))
            )}
          </div>
          {produto && variante ? (
            <Dialogo titulo={`Montar ${produto.nome}`} onFechar={() => setProduto(null)} pe={<><strong className="montagem-total">{formatarReais(totalMontagem)}</strong><button type="button" className="btn btn-pri" onClick={addCarrinho}>Adicionar ao pedido</button></>}>
              <div className="pilha">

                {produto.variantes.length > 1 ? (
                  <div className="pdv-chips" role="radiogroup" aria-label="Tamanho / opção de preço">
                    {produto.variantes.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        disabled={v.esgotado}
                        role="radio"
                        aria-checked={variante.id === v.id}
                        className={`pdv-chip${variante.id === v.id ? " on" : ""}`}
                        onClick={() => {
                          setVarianteId(v.id);
                          setEscolhasSel({});
                          setAvisoMontagem("");
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
                      {g.nome} <small className="ajuda-inline">{resumoGrupo(g)}</small>
                    </p>
                    <div className="pdv-chips">
                      {g.opcoes.map((o) => (
                        <button
                          key={o.id}
                          type="button"
                          aria-pressed={Boolean(escolhasSel[o.id])}
                          className={`pdv-chip${escolhasSel[o.id] ? " on" : ""}`}
                          onClick={() => tocarEscolha(g, o.id)}
                        >
                          {o.nome}
                          {o.preco_extra_centavos ? <small>+{formatarReais(o.preco_extra_centavos)}</small> : null}
                          {escolhasSel[o.id] && g.permite_repetir ? <small>×{escolhasSel[o.id]}</small> : null}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}

                {produto.grupos_adicionais?.map((g) =>
                  g.adicionais.some((a) => a.variantes.length) ? (
                    <div key={g.id} className="pdv-bloco">
                      <p className="bloco-variante-titulo">
                        {g.nome} <small className="ajuda-inline">opcional</small>
                      </p>
                      <div className="pdv-adicionais">
                        {g.adicionais.flatMap((a) =>
                          a.variantes.map((v) => {
                            const nome = nomeAdicional(a.nome, v.nome);
                            const qtd = adicionaisSel[v.id] ?? 0;
                            return (
                              <div key={v.id} className={`pdv-adicional${qtd ? " on" : ""}`}>
                                <span>
                                  {nome} <small>+{formatarReais(v.preco_centavos)}</small>
                                </span>
                                <div className="pdv-qtd sm">
                                  <button
                                    type="button"
                                    className="btn-ghost"
                                    aria-label={`Tirar ${nome}`}
                                    disabled={!qtd}
                                    onClick={() => mudarAdicional(v.id, a.qtd_max, -1, nome)}
                                  >
                                    −
                                  </button>
                                  <span aria-live="polite">{qtd}</span>
                                  <button
                                    type="button"
                                    className="btn-ghost"
                                    aria-label={`Pôr ${nome}`}
                                    onClick={() => mudarAdicional(v.id, a.qtd_max, 1, nome)}
                                  >
                                    +
                                  </button>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  ) : null
                )}

                {avisoMontagem ? (
                  <p className="feedback-card feedback-erro" role="alert">
                    {avisoMontagem}
                  </p>
                ) : null}

                <div className="pdv-montagem-rodape">
                  <div className="pdv-qtd">
                    <button
                      type="button"
                      className="btn-sec"
                      aria-label="Diminuir quantidade"
                      onClick={() => setQtdItem((q) => Math.max(1, q - 1))}
                    >
                      −
                    </button>
                    <strong aria-live="polite">{qtdItem}</strong>
                    <button
                      type="button"
                      className="btn-sec"
                      aria-label="Aumentar quantidade"
                      onClick={() => setQtdItem((q) => q + 1)}
                    >
                      +
                    </button>
                  </div>
                  <input
                    className="pdv-obs"
                    value={obs}
                    onChange={(e) => setObs(e.target.value)}
                    placeholder="Observação (opcional)"
                    aria-label="Observação do item"
                  />

                </div>
              </div>
            </Dialogo>
          ) : null}
        </section>

        <aside className={`painel-bloco pdv-carrinho${carrinhoAberto ? " aberto" : ""}`} aria-label="Pedido atual">
          <header className="pdv-carrinho-cab">
            <div>
              <span className="painel-sobretitulo">NOVOS ITENS A ENVIAR</span>
              <strong>{contagem}</strong>
            </div>
            <strong className="pdv-carrinho-total">{formatarReais(totalCarrinho)}</strong>
            <button
              type="button"
              className="btn-ghost drawer-fechar so-celular"
              aria-label="Fechar pedido"
              onClick={() => setCarrinhoAberto(false)}
            >
              ×
            </button>
          </header>

          <ul className="pdv-carrinho-lista">
            {carrinho.length === 0 ? (
              <li className="lista-vazia">
                <strong>Nada no pedido</strong>
                <span>Escolha os produtos no cardápio.</span>
              </li>
            ) : (
              carrinho.map((l) => (
                <li key={l.key} className="pdv-linha">
                  <div className="pdv-linha-info">
                    <strong>{l.nome}</strong>
                    {l.escolhas.length || l.adicionais.length || l.observacao ? (
                      <span>
                        {[
                          ...l.escolhas.map((e) => e.nome),
                          ...l.adicionais.map((a) => `+ ${a.nome}${a.quantidade > 1 ? ` ×${a.quantidade}` : ""}`),
                          l.observacao ? `Obs: ${l.observacao}` : "",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    ) : null}
                    <em>{formatarReais(linhaCentavos(l))}</em>
                  </div>
                  <div className="pdv-qtd sm">
                    <button
                      type="button"
                      className="btn-ghost"
                      aria-label={`Diminuir ${l.nome}`}
                      disabled={l.quantidade <= 1}
                      onClick={() =>
                        setCarrinho((c) =>
                          c.map((x) => (x.key === l.key ? { ...x, quantidade: Math.max(1, x.quantidade - 1) } : x))
                        )
                      }
                    >
                      −
                    </button>
                    <span>{l.quantidade}</span>
                    <button
                      type="button"
                      className="btn-ghost"
                      aria-label={`Aumentar ${l.nome}`}
                      onClick={() =>
                        setCarrinho((c) => c.map((x) => (x.key === l.key ? { ...x, quantidade: x.quantidade + 1 } : x)))
                      }
                    >
                      +
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      aria-label={`Remover ${l.nome}`}
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
              onClick={() => setConfirmar({ tipo: "limpar" })}
            >
              Limpar
            </button>
            <button
              type="button"
              className="btn-prim pdv-enviar"
              disabled={enviando || !carrinho.length}
              onClick={() => void enviar()}
            >
              {enviando ? "Enviando…" : "Enviar pedido"}
            </button>
          </div>
        </aside>
      </div>

      {carrinhoAberto ? (
        <button
          type="button"
          className="folha-fundo"
          aria-label="Fechar pedido"
          onClick={() => setCarrinhoAberto(false)}
        />
      ) : null}

      {carrinho.length && !carrinhoAberto ? (
        <button type="button" className="pdv-barra-carrinho" onClick={() => setCarrinhoAberto(true)}>
          <span>
            {contagem} · {formatarReais(totalCarrinho)}
          </span>
          <strong>Ver pedido</strong>
        </button>
      ) : null}

      {confirmar?.tipo === "limpar" ? (
        <Modal
          titulo="Limpar o pedido?"
          confirmar="Limpar"
          desistir="Voltar"
          perigo
          onFechar={() => setConfirmar(null)}
          onConfirmar={() => {
            liberarRascunho(); setCarrinho([]);
            apagarRascunho(id);
            setConfirmar(null);
          }}
        >
          <p className="ajuda">Os {contagem} ainda não enviados saem do pedido.</p>
        </Modal>
      ) : null}

      {confirmar?.tipo === "sair" ? (
        <Modal
          titulo="Sair sem enviar?"
          confirmar="Sair mesmo assim"
          desistir="Ficar e enviar"
          onFechar={() => setConfirmar(null)}
          onConfirmar={() => navegar(confirmar.para)}
        >
          <p className="ajuda">
            Há {contagem} que a cozinha ainda não recebeu. Eles ficam guardados neste aparelho e voltam
            quando você abrir esta conta de novo.
          </p>
        </Modal>
      ) : null}
    </div>
  );
}
