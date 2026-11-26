import { podeTrocarEdicao } from "../hooks/useRascunho";
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga de dados da tela (fetch)
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

  const setErroLimpo = useCallback((msg: string) => {
    setOk("");
    setErro(msg);
  }, []);

  const setOkLimpo = useCallback((msg: string) => {
    setErro("");
    setOk(msg);
  }, []);

  return (
    <div className="cardapio pilha-lg">
      <div className="cardapio-toolbar">
        <p className="cardapio-resumo-linha mb-0">
          <span>
            {resumo.produtos} produtos · {resumo.categorias} categorias · {resumo.variantes} preços
            {carregando ? " · atualizando…" : ""}
          </span>
          <Ajuda texto="Opcionais = escolha no próprio item (ex.: molho). Adicionais = extras da categoria (ex.: bacon)." />
        </p>
        <button type="button" className="btn" onClick={() => void carregar()} disabled={carregando}>
          {carregando ? "Atualizando…" : "Atualizar"}
        </button>
      </div>

      <nav className="segmento cardapio-segmento" aria-label="Seções do cardápio">
        <button
          type="button"
          aria-pressed={aba === "produtos"}
          onClick={async () => {
            if (await podeTrocarEdicao()) setAba("produtos");
          }}
        >
          Produtos ({resumo.produtos})
        </button>
        <button
          type="button"
          aria-pressed={aba === "adicionais"}
          onClick={async () => {
            if (await podeTrocarEdicao()) setAba("adicionais");
          }}
        >
          Adicionais da categoria
        </button>
      </nav>

      {erro ? (
        <p className="feedback-card feedback-erro" role="alert">
          {erro}
        </p>
      ) : null}
      {ok ? (
        <p className="feedback-card feedback-ok" role="status">
          {ok}
        </p>
      ) : null}

      {aba === "produtos" ? (
        <ProdutosPainel categorias={categorias} onMudou={carregar} setErro={setErroLimpo} setOk={setOkLimpo} />
      ) : (
        <AdicionaisPainel categorias={categorias} setErro={setErroLimpo} setOk={setOkLimpo} />
      )}
    </div>
  );
}
