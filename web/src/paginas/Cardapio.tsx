import { useCallback, useEffect, useMemo, useState } from "react";
import Ajuda from "../componentes/Ajuda";
import { api } from "../servicos/api";
import AdicionaisPainel from "./cardapio/AdicionaisPainel";
import ProdutosPainel from "./cardapio/ProdutosPainel";
import type { CategoriaCardapio } from "./cardapio/tipos";

type Aba = "produtos" | "adicionais";

export default function Cardapio() {
  const [aba, setAba] = useState<Aba>("produtos");
  const [categorias, setCategorias] = useState<CategoriaCardapio[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");

  // A API já entrega a árvore completa. Mantemos essa resposta como fonte única
  // para o resumo e para a lista, evitando contagens que divergem da tela.
  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const dados = (await api("/cardapio")) as CategoriaCardapio[];
      setCategorias(dados);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const resumo = useMemo(() => {
    const produtos = categorias.flatMap((categoria) => categoria.produtos);
    return {
      categorias: categorias.length,
      produtos: produtos.length,
      variantes: produtos.reduce((total, produto) => total + produto.variantes.length, 0),
    };
  }, [categorias]);

  function setErroLimpo(msg: string) {
    setOk("");
    setErro(msg);
  }

  function setOkLimpo(msg: string) {
    setErro("");
    setOk(msg);
  }

  return (
    <div className="cardapio">
      <section className="cardapio-hero" aria-labelledby="cardapio-titulo">
        <div className="cardapio-hero-copy">
          <span className="cardapio-kicker">GESTÃO DO RESTAURANTE</span>
          <h2 id="cardapio-titulo">Seu cardápio, em ordem.</h2>
          <p>
            Produto e preços aqui; opcionais (molho, sabores) no editar do item. Adicionais (bacon,
            queijo…) na outra aba, por categoria.
            <Ajuda
              texto="Opcionais = o que o cliente escolhe no próprio item (ex.: molho do macarrão). Adicionais = extras da categoria (ex.: bacon em pastéis)."
            />
          </p>
        </div>
        <button type="button" className="btn-sec cardapio-atualizar" onClick={() => void carregar()} disabled={carregando}>
          <span aria-hidden="true">↻</span>
          {carregando ? "Atualizando" : "Atualizar dados"}
        </button>
      </section>

      {/* Os indicadores ajudam a entender o tamanho do catálogo antes de entrar na edição. */}
      <section className="cardapio-resumo" aria-label="Resumo do cardápio">
        <article className="resumo-card resumo-card-destaque">
          <span className="resumo-icone" aria-hidden="true">☷</span>
          <div><strong>{resumo.produtos}</strong><span>Produtos ativos</span></div>
        </article>
        <article className="resumo-card">
          <span className="resumo-icone" aria-hidden="true">▤</span>
          <div><strong>{resumo.categorias}</strong><span>Categorias</span></div>
        </article>
        <article className="resumo-card">
          <span className="resumo-icone" aria-hidden="true">◈</span>
          <div><strong>{resumo.variantes}</strong><span>Opções de preço</span></div>
        </article>
        <div className="resumo-nota">
          <span className="status-ponto" aria-hidden="true" />
          <span>{carregando ? "Sincronizando catálogo" : "Catálogo sincronizado"}</span>
        </div>
      </section>

      <nav className="cardapio-tabs" aria-label="Seções do cardápio">
        <button type="button" className={`cardapio-tab${aba === "produtos" ? " ativa" : ""}`} onClick={() => setAba("produtos")} aria-current={aba === "produtos" ? "page" : undefined}>
          <span className="titulo-com-ajuda">
            Produtos
            <Ajuda texto="Cadastre o item, as opções de preço (P/M/G) e, depois de salvar, os opcionais do pedido." />
          </span>
          <span className="tab-contagem">{resumo.produtos}</span>
        </button>
        <button type="button" className={`cardapio-tab${aba === "adicionais" ? " ativa" : ""}`} onClick={() => setAba("adicionais")} aria-current={aba === "adicionais" ? "page" : undefined}>
          <span className="titulo-com-ajuda">
            Adicionais
            <Ajuda
              alinhar="direita"
              texto="Grupos ligados a categorias. Ex.: grupo Proteínas na categoria Pastéis aparece em todos os pastéis, menos os que você excluir."
            />
          </span>
          <span className="tab-subtitulo">Grupos e complementos</span>
        </button>
      </nav>

      {erro ? <p className="feedback-card feedback-erro" role="alert">{erro}</p> : null}
      {ok ? <p className="feedback-card feedback-ok" role="status">{ok}</p> : null}

      {/* Cada aba mantém seu próprio fluxo de trabalho: cadastro de itens ou configuração de complementos. */}
      {aba === "produtos" ? (
        <ProdutosPainel categorias={categorias} onMudou={carregar} setErro={setErroLimpo} setOk={setOkLimpo} />
      ) : (
        <AdicionaisPainel categorias={categorias} setErro={setErroLimpo} setOk={setOkLimpo} />
      )}
    </div>
  );
}
