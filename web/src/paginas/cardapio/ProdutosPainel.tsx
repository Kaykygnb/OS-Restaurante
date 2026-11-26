import { useMemo, useState } from "react";
import Formulario from "../../componentes/Formulario";
import Icone from "../../componentes/ui/Icone";
import EditorProduto from "./EditorProduto";
import { api } from "../../servicos/api";
import { confirmar, solicitarTexto } from "../../servicos/dialogos";
import { formatarReais } from "../../util/dinheiro";
import { IMAGEM_PADRAO_CARDAPIO, origemImagemCardapio } from "./imagem";
import type { CategoriaCardapio, Produto } from "./tipos";

type Props = {
  categorias: CategoriaCardapio[];
  onMudou: () => Promise<void>;
  setErro: (s: string) => void;
  setOk: (s: string) => void;
};

export default function ProdutosPainel({ categorias, onMudou, setErro, setOk }: Props) {
  const [categoriaEscolhida, setCategoria] = useState<number | null>(null);
  const categoria = categorias.find((c) => c.id === categoriaEscolhida) ?? categorias[0];
  const [busca, setBusca] = useState("");
  const [novaCategoria, setNovaCategoria] = useState("");
  const [editor, setEditor] = useState<{ id: number | null; categoria: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [menuCat, setMenuCat] = useState<number | null>(null);
  const produtos = useMemo(
    () =>
      (categoria?.produtos ?? []).filter((p) =>
        `${p.nome} ${p.descricao ?? ""}`.toLowerCase().includes(busca.trim().toLowerCase()),
      ),
    [categoria, busca],
  );

  async function acao(fn: () => Promise<unknown>, mensagem: string) {
    if (busy) return;
    setBusy(true);
    setErro("");
    setOk("");
    try {
      await fn();
      await onMudou();
      setOk(mensagem);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setBusy(false);
      setMenuCat(null);
    }
  }

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    if (novaCategoria.trim().length < 2) return setErro("Informe uma categoria com pelo menos 2 caracteres.");
    await acao(async () => {
      await api("/categorias", { method: "POST", body: JSON.stringify({ nome: novaCategoria.trim() }) });
      setNovaCategoria("");
    }, "Categoria cadastrada.");
  }

  async function excluirCategoria(c: CategoriaCardapio) {
    if (
      !(await confirmar(
        `Desativar a categoria ${c.nome}${c.produtos.length ? ` e seus ${c.produtos.length} produtos` : ""}? Deixarão de aparecer nas novas vendas.`,
        true,
      ))
    )
      return;
    await acao(
      () => api(`/categorias/${c.id}${c.produtos.length ? "?cascata=1" : ""}`, { method: "DELETE" }),
      "Categoria desativada.",
    );
  }

  async function excluirProduto(p: Produto) {
    if (
      !(await confirmar(
        `Desativar ${p.nome}? O produto deixará de aparecer nas novas vendas. Pedidos já feitos serão preservados.`,
        true,
      ))
    )
      return;
    await acao(() => api(`/produtos/${p.id}`, { method: "DELETE" }), "Produto desativado.");
  }

  async function mover(i: number, direcao: number) {
    const ordem = categorias.map((c) => c.id);
    const alvo = i + direcao;
    if (alvo < 0 || alvo >= ordem.length) return;
    [ordem[i], ordem[alvo]] = [ordem[alvo], ordem[i]];
    await acao(() => api("/categorias/reordenar", { method: "PUT", body: JSON.stringify({ ids: ordem }) }), "Ordem atualizada.");
  }

  async function renomear(c: CategoriaCardapio) {
    const nome = await solicitarTexto("Editar nome da categoria", c.nome);
    if (nome !== null)
      await acao(
        () => api(`/categorias/${c.id}`, { method: "PUT", body: JSON.stringify({ nome: nome.trim() }) }),
        "Categoria atualizada.",
      );
  }

  return (
    <div className="catalogo-layout">
      <section className="cartao catalogo-cats">
        <h2>Categorias</h2>
        <Formulario onSubmit={criar} className="nova-cat">
          <label className="fld">
            <span className="sr">Nova categoria</span>
            <input required minLength={2} value={novaCategoria} onChange={(e) => setNovaCategoria(e.target.value)} placeholder="Nova categoria…" />
          </label>
          <button type="submit" className="btn" disabled={busy} aria-label="Adicionar categoria">
            <Icone nome="mais" tam={18} />
          </button>
        </Formulario>
        <ul className="categorias-lista">
          {categorias.map((c, i) => {
            const ativa = categoria?.id === c.id;
            return (
              <li key={c.id} className={ativa ? "ativa" : ""}>
                <div className="cat-linha">
                  <button type="button" className="cat-btn" onClick={() => { setCategoria(c.id); setMenuCat(null); }}>
                    <span className="cat-nome">{c.nome}</span>
                    <span className="tag">{c.produtos.length}</span>
                  </button>
                  {ativa ? (
                    <div className="cat-toolbar">
                      <button type="button" className="btn btn-ic" aria-label={`Mover ${c.nome} para cima`} disabled={busy || i === 0} onClick={() => void mover(i, -1)}>
                        ↑
                      </button>
                      <button type="button" className="btn btn-ic" aria-label={`Mover ${c.nome} para baixo`} disabled={busy || i === categorias.length - 1} onClick={() => void mover(i, 1)}>
                        ↓
                      </button>
                      <button
                        type="button"
                        className="btn btn-ic"
                        aria-label={`Mais ações de ${c.nome}`}
                        aria-expanded={menuCat === c.id}
                        disabled={busy}
                        onClick={() => setMenuCat((m) => (m === c.id ? null : c.id))}
                      >
                        <Icone nome="menu" tam={18} />
                      </button>
                    </div>
                  ) : null}
                </div>
                {ativa && menuCat === c.id ? (
                  <div className="cat-menu">
                    <button type="button" className="btn-link" disabled={busy} onClick={() => void renomear(c)}>
                      Renomear
                    </button>
                    <button type="button" className="btn-link texto-perigo" disabled={busy} onClick={() => void excluirCategoria(c)}>
                      Desativar
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="cartao catalogo-prods">
        <header className="catalogo-prods-cab">
          <h2>{categoria?.nome ?? "Produtos"}</h2>
          <button
            type="button"
            className="btn btn-pri"
            disabled={!categoria || busy}
            onClick={() => setEditor({ id: null, categoria: categoria.id })}
          >
            Novo produto
          </button>
        </header>
        <label className="fld catalogo-busca">
          <span className="sr">Buscar</span>
          <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar produto…" />
        </label>
        {!categoria ? (
          <p className="muted">Cadastre uma categoria para começar.</p>
        ) : !produtos.length ? (
          <p className="muted">Nenhum produto. Crie o primeiro ou altere a busca.</p>
        ) : (
          <ul className="produtos-lista">
            {produtos.map((p) => (
              <li key={p.id}>
                <img
                  src={origemImagemCardapio(p.caminho_imagem)}
                  onError={(e) => {
                    e.currentTarget.src = IMAGEM_PADRAO_CARDAPIO;
                  }}
                  alt=""
                />
                <div className="prod-info">
                  <div className="prod-topo">
                    <strong>{p.nome}</strong>
                    <span className="tag">{p.exige_preparo ? "Cozinha" : "Revenda"}</span>
                  </div>
                  {p.descricao ? <p className="muted pequeno">{p.descricao}</p> : null}
                  <p className="prod-precos mb-0">
                    {p.variantes.map((v) => `${v.nome}: ${formatarReais(v.preco_centavos)}`).join(" · ")}
                  </p>
                </div>
                <div className="prod-acoes">
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={() => setEditor({ id: p.id, categoria: categoria.id })}
                  >
                    Editar
                  </button>
                  <button type="button" className="btn-link texto-perigo" disabled={busy} onClick={() => void excluirProduto(p)}>
                    Desativar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {editor ? (
        <EditorProduto
          key={editor.id ?? "novo"}
          id={editor.id}
          categoriaId={editor.categoria}
          categorias={categorias}
          onFechar={() => setEditor(null)}
          onSalvo={async () => {
            await onMudou();
            setOk("Produto salvo com preços e escolhas.");
          }}
        />
      ) : null}
    </div>
  );
}
