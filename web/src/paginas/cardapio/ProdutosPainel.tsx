import { useEffect, useMemo, useState } from "react";
import Ajuda from "../../componentes/Ajuda";
import { api, type ApiErro } from "../../servicos/api";
import { formatarReais, reaisParaCentavos } from "../../util/dinheiro";
import EscolhasBloco from "./EscolhasBloco";
import { IMAGEM_PADRAO_CARDAPIO, origemImagemCardapio } from "./imagem";
import CampoImagem from "./CampoImagem";
import { enviarImagemCardapio } from "./imagem";
import type { CategoriaCardapio, LinhaVariante, Produto, Variante } from "./tipos";

type Props = {
  categorias: CategoriaCardapio[];
  onMudou: () => Promise<void>;
  setErro: (s: string) => void;
  setOk: (s: string) => void;
};

function novaLinha(nome = "Padrão"): LinhaVariante {
  return { chave: crypto.randomUUID(), nome, preco: "" };
}

export default function ProdutosPainel({ categorias, onMudou, setErro, setOk }: Props) {
  const [categoriaId, setCategoriaId] = useState<number | null>(
    categorias.find((categoria) => categoria.produtos.length > 0)?.id ?? categorias[0]?.id ?? null
  );
  const [busca, setBusca] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    setCategoriaId((atual) => {
      if (atual && categorias.some((c) => c.id === atual)) return atual;
      // Na primeira carga, priorize uma categoria que já tenha itens. Assim a
      // tela não parece vazia quando o catálogo está preenchido em outra seção.
      return categorias.find((categoria) => categoria.produtos.length > 0)?.id ?? categorias[0]?.id ?? null;
    });
  }, [categorias]);

  const [novaCategoria, setNovaCategoria] = useState("");
  const [editandoCatId, setEditandoCatId] = useState<number | null>(null);
  const [nomeCatEdit, setNomeCatEdit] = useState("");
  const [arrastandoId, setArrastandoId] = useState<number | null>(null);
  const [sobreId, setSobreId] = useState<number | null>(null);

  const [modo, setModo] = useState<"criar" | "editar" | null>(null);
  const [produtoId, setProdutoId] = useState<number | null>(null);
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [caminhoImagem, setCaminhoImagem] = useState<string | null>(null);
  const [arquivoImagem, setArquivoImagem] = useState<File | null>(null);
  const [removerImagem, setRemoverImagem] = useState(false);
  const [exigePreparo, setExigePreparo] = useState(true);
  const [catForm, setCatForm] = useState<number | "">("");
  const [variantes, setVariantes] = useState<LinhaVariante[]>([novaLinha()]);
  const [variantesDetalhe, setVariantesDetalhe] = useState<Variante[]>([]);

  const selecionada = useMemo(
    () => categorias.find((c) => c.id === categoriaId) ?? null,
    [categorias, categoriaId]
  );

  const produtos = useMemo(() => {
    const lista = selecionada?.produtos ?? [];
    const q = busca.trim().toLowerCase();
    if (!q) return lista;
    return lista.filter(
      (p) => p.nome.toLowerCase().includes(q) || (p.descricao ?? "").toLowerCase().includes(q)
    );
  }, [selecionada, busca]);

  function limparForm() {
    setModo(null);
    setProdutoId(null);
    setNome("");
    setDescricao("");
    setCaminhoImagem(null);
    setArquivoImagem(null);
    setRemoverImagem(false);
    setExigePreparo(true);
    setCatForm(categoriaId ?? "");
    setVariantes([novaLinha()]);
    setVariantesDetalhe([]);
  }

  function abrirCriar() {
    if (!selecionada) return;
    setModo("criar");
    setProdutoId(null);
    setNome("");
    setDescricao("");
    setCaminhoImagem(null);
    setArquivoImagem(null);
    setRemoverImagem(false);
    setExigePreparo(true);
    setCatForm(selecionada.id);
    setVariantes([novaLinha()]);
    setVariantesDetalhe([]);
  }

  async function abrirEditar(p: Produto) {
    setModo("editar");
    setProdutoId(p.id);
    setNome(p.nome);
    setDescricao(p.descricao ?? "");
    setCaminhoImagem(p.caminho_imagem ?? null);
    setArquivoImagem(null);
    setRemoverImagem(false);
    setExigePreparo(p.exige_preparo);
    setCatForm(selecionada?.id ?? "");
    setVariantes(
      p.variantes.map((v) => ({
        chave: String(v.id),
        id: v.id,
        nome: v.nome,
        preco: (v.preco_centavos / 100).toFixed(2).replace(".", ","),
      }))
    );
    setVariantesDetalhe(p.variantes);
    try {
      const detalhe = (await api(`/produtos/${p.id}`)) as {
        produto_variantes?: Variante[];
        exige_preparo?: boolean;
        caminho_imagem?: string | null;
        categoria?: { id: number };
      };
      const vars = detalhe.produto_variantes ?? [];
      setVariantesDetalhe(vars);
      setVariantes(
        vars.map((v) => ({
          chave: String(v.id),
          id: v.id,
          nome: v.nome,
          preco: (v.preco_centavos / 100).toFixed(2).replace(".", ","),
        }))
      );
      if (detalhe.exige_preparo !== undefined) setExigePreparo(detalhe.exige_preparo);
      if (detalhe.caminho_imagem !== undefined) setCaminhoImagem(detalhe.caminho_imagem);
      if (detalhe.categoria?.id) setCatForm(detalhe.categoria.id);
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  async function criarCategoria(e: React.FormEvent) {
    e.preventDefault();
    if (novaCategoria.trim().length < 2) return;
    setSalvando(true);
    setErro("");
    try {
      await api("/categorias", { method: "POST", body: JSON.stringify({ nome: novaCategoria.trim() }) });
      setNovaCategoria("");
      setOk("Categoria criada");
      await onMudou();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function salvarCat(e: React.FormEvent) {
    e.preventDefault();
    if (editandoCatId === null) return;
    setSalvando(true);
    setErro("");
    try {
      await api(`/categorias/${editandoCatId}`, {
        method: "PUT",
        body: JSON.stringify({ nome: nomeCatEdit.trim() }),
      });
      setEditandoCatId(null);
      setOk("Categoria atualizada");
      await onMudou();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function excluirCategoria(id: number, cascata = false) {
    const cat = categorias.find((c) => c.id === id);
    if (!cascata && !confirm(`Excluir categoria "${cat?.nome}"?`)) return;
    setErro("");
    try {
      const res = (await api(`/categorias/${id}${cascata ? "?cascata=1" : ""}`, {
        method: "DELETE",
        body: cascata ? JSON.stringify({ cascata: true }) : undefined,
      })) as { mensagem?: string };
      setOk(res.mensagem ?? "Categoria excluída");
      if (categoriaId === id) setCategoriaId(null);
      limparForm();
      await onMudou();
    } catch (err) {
      const apiErr = err as ApiErro;
      if (apiErr.status === 409 && apiErr.dados?.precisa_cascata) {
        const qtd = Number(apiErr.dados.qtd_produtos ?? 0);
        if (confirm(`${apiErr.message}\n\nDesativar também os ${qtd} produto(s)?`)) {
          await excluirCategoria(id, true);
        }
        return;
      }
      setErro(apiErr.message);
    }
  }

  async function persistirOrdem(lista: CategoriaCardapio[]) {
    try {
      await api("/categorias/reordenar", {
        method: "PUT",
        body: JSON.stringify({ ids: lista.map((c) => c.id) }),
      });
      setOk("Ordem salva");
      await onMudou();
    } catch (err) {
      setErro((err as Error).message);
      await onMudou();
    }
  }

  function onDrop(idAlvo: number) {
    if (arrastandoId === null || arrastandoId === idAlvo) {
      setArrastandoId(null);
      setSobreId(null);
      return;
    }
    const origem = categorias.findIndex((c) => c.id === arrastandoId);
    const destino = categorias.findIndex((c) => c.id === idAlvo);
    if (origem < 0 || destino < 0) return;
    const copia = [...categorias];
    const [item] = copia.splice(origem, 1);
    if (!item) return;
    copia.splice(destino, 0, item);
    setArrastandoId(null);
    setSobreId(null);
    void persistirOrdem(copia);
  }

  function atualizarVariante(chave: string, patch: Partial<LinhaVariante>) {
    setVariantes((lista) => lista.map((v) => (v.chave === chave ? { ...v, ...patch } : v)));
  }

  function addVariante() {
    setVariantes((lista) => [...lista, novaLinha(`Opção ${lista.length + 1}`)]);
  }

  async function removerLinhaVariante(linha: LinhaVariante) {
    if (variantes.length <= 1) {
      setErro("Precisa ficar pelo menos uma opção de preço");
      return;
    }
    if (modo === "editar" && linha.id && produtoId) {
      if (!confirm(`Remover a opção "${linha.nome}"?`)) return;
      setErro("");
      try {
        await api(`/produtos/${produtoId}/variantes/${linha.id}`, { method: "DELETE" });
        setVariantes((lista) => lista.filter((v) => v.chave !== linha.chave));
        setVariantesDetalhe((lista) => lista.filter((v) => v.id !== linha.id));
        setOk("Opção removida");
        await onMudou();
      } catch (err) {
        setErro((err as Error).message);
      }
      return;
    }
    setVariantes((lista) => lista.filter((v) => v.chave !== linha.chave));
  }

  async function salvarProduto(e: React.FormEvent) {
    e.preventDefault();
    const catId = Number(catForm);
    if (nome.trim().length < 2) return setErro("Informe o nome do produto");
    if (!Number.isFinite(catId)) return setErro("Escolha a categoria");

    const variantesPayload: { id?: number; nome: string; preco_centavos: number }[] = [];
    for (const v of variantes) {
      const centavos = reaisParaCentavos(v.preco);
      if (!v.nome.trim()) return setErro("Toda opção precisa de um nome (ex: Padrão, Grande)");
      if (!Number.isFinite(centavos) || centavos < 0) {
        return setErro(`Preço inválido em "${v.nome}"`);
      }
      variantesPayload.push({
        id: v.id,
        nome: v.nome.trim(),
        preco_centavos: centavos,
      });
    }

    setSalvando(true);
    setErro("");
    try {
      if (modo === "criar") {
        const criado = (await api("/produtos", {
          method: "POST",
          body: JSON.stringify({
            nome: nome.trim(),
            descricao: descricao.trim() || undefined,
            categoria_id: catId,
            exige_preparo: exigePreparo,
            variantes: variantesPayload.map(({ nome: n, preco_centavos }) => ({
              nome: n,
              preco_centavos,
            })),
          }),
        })) as { id: number; produto_variantes?: Variante[] };
        setOk("Produto criado — agora você pode definir o que o cliente escolhe");
        setCategoriaId(catId);
        await onMudou();
        setModo("editar");
        setProdutoId(criado.id);
        const vars = criado.produto_variantes ?? [];
        setVariantesDetalhe(vars);
        setVariantes(
          vars.map((v) => ({
            chave: String(v.id),
            id: v.id,
            nome: v.nome,
            preco: (v.preco_centavos / 100).toFixed(2).replace(".", ","),
          }))
        );
        if (arquivoImagem) {
          const caminho = await enviarImagemCardapio(arquivoImagem);
          await api(`/produtos/${criado.id}`, {
            method: "PUT",
            body: JSON.stringify({ caminho_imagem: caminho }),
          });
          setCaminhoImagem(caminho);
          setArquivoImagem(null);
        }
        setRemoverImagem(false);
      } else if (modo === "editar" && produtoId) {
        const caminho = arquivoImagem ? await enviarImagemCardapio(arquivoImagem) : removerImagem ? null : caminhoImagem;
        await api(`/produtos/${produtoId}`, {
          method: "PUT",
          body: JSON.stringify({
            nome: nome.trim(),
            descricao: descricao.trim() || null,
            categoria_id: catId,
            exige_preparo: exigePreparo,
            caminho_imagem: caminho,
          }),
        });

        for (const v of variantesPayload) {
          if (v.id) {
            await api(`/produtos/${produtoId}/variantes/${v.id}`, {
              method: "PUT",
              body: JSON.stringify({ nome: v.nome, preco_centavos: v.preco_centavos }),
            });
          } else {
            await api(`/produtos/${produtoId}/variantes`, {
              method: "POST",
              body: JSON.stringify({ nome: v.nome, preco_centavos: v.preco_centavos }),
            });
          }
        }
        setOk("Produto atualizado");
        setCaminhoImagem(caminho);
        setArquivoImagem(null);
        setRemoverImagem(false);
        setCategoriaId(catId);
        await onMudou();
        const detalhe = (await api(`/produtos/${produtoId}`)) as {
          produto_variantes?: Variante[];
        };
        const vars = detalhe.produto_variantes ?? [];
        setVariantesDetalhe(vars);
        setVariantes(
          vars.map((v) => ({
            chave: String(v.id),
            id: v.id,
            nome: v.nome,
            preco: (v.preco_centavos / 100).toFixed(2).replace(".", ","),
          }))
        );
      }
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function excluirProduto(p: Produto) {
    if (!confirm(`Excluir "${p.nome}" do cardápio?`)) return;
    setErro("");
    try {
      await api(`/produtos/${p.id}`, { method: "DELETE" });
      if (produtoId === p.id) limparForm();
      setOk("Produto excluído");
      await onMudou();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  const painelAberto = modo !== null;

  // A tela divide o trabalho em três partes: navegar por categoria, localizar
  // um item e editar seus detalhes sem sair do contexto da lista.
  return (
    <div className={`cardapio-grid-3${painelAberto ? " com-painel" : ""}`}>
      <section className="painel-bloco painel-cats">
        <header className="painel-bloco-cab">
          <div>
            <h2 className="titulo-com-ajuda">
              Categorias
              <Ajuda texto="Arraste pelo :: para reordenar. Cada categoria agrupa produtos na tela do pedido." />
            </h2>
            <p>Separe os itens por seção</p>
          </div>
          <span className="cab-contagem">{categorias.length}</span>
        </header>

        <form className="form-inline" onSubmit={criarCategoria}>
          <input
            placeholder="Ex.: Pastéis"
            aria-label="Nome da nova categoria"
            value={novaCategoria}
            onChange={(e) => setNovaCategoria(e.target.value)}
          />
          <button type="submit" aria-label="Criar categoria" disabled={salvando || novaCategoria.trim().length < 2}>
            +
          </button>
        </form>

        <ul className="lista-cat">
          {categorias.length === 0 ? <li className="vazio">Crie a primeira categoria.</li> : null}
          {categorias.map((c) => (
            <li
              key={c.id}
              className={[
                "cat-linha",
                arrastandoId === c.id ? "arrastando" : "",
                sobreId === c.id ? "drop-alvo" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              draggable={editandoCatId !== c.id}
              onDragStart={() => setArrastandoId(c.id)}
              onDragOver={(e) => {
                e.preventDefault();
                if (arrastandoId && arrastandoId !== c.id) setSobreId(c.id);
              }}
              onDrop={() => onDrop(c.id)}
              onDragEnd={() => {
                setArrastandoId(null);
                setSobreId(null);
              }}
            >
              <span className="cat-handle" aria-hidden>
                ::
              </span>
              {editandoCatId === c.id ? (
                <form className="cat-edit" onSubmit={salvarCat}>
                  <input value={nomeCatEdit} onChange={(e) => setNomeCatEdit(e.target.value)} autoFocus />
                  <button type="submit">OK</button>
                  <button type="button" className="btn-ghost" onClick={() => setEditandoCatId(null)}>
                    Cancelar
                  </button>
                </form>
              ) : (
                <>
                  <button
                    type="button"
                    className={`cat-item${c.id === categoriaId ? " ativa" : ""}`}
                    onClick={() => {
                      setCategoriaId(c.id);
                      if (modo === "criar") setCatForm(c.id);
                    }}
                  >
                    <span className="cat-nome">{c.nome}</span>
                    <span className="cat-qtd">{c.qtd_produtos}</span>
                  </button>
                  <div className="cat-acoes">
                    <button
                      type="button"
                      className="btn-icon"
                      aria-label={`Editar categoria ${c.nome}`}
                      title="Editar"
                      onClick={() => {
                        setEditandoCatId(c.id);
                        setNomeCatEdit(c.nome);
                      }}
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      className="btn-icon btn-icon-danger"
                      aria-label={`Excluir categoria ${c.nome}`}
                      title="Excluir"
                      onClick={() => void excluirCategoria(c.id)}
                    >
                      ×
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="painel-bloco painel-lista">
        <header className="painel-bloco-cab">
          <div>
            <p className="painel-sobretitulo">ITENS DA CATEGORIA</p>
            <h2>{selecionada ? selecionada.nome : "Produtos"}</h2>
          </div>
          <span className="cab-contagem">{produtos.length} {produtos.length === 1 ? "item" : "itens"}</span>
        </header>

        {!selecionada ? (
          <p className="vazio">Selecione uma categoria.</p>
        ) : (
          <>
            <div className="prod-toolbar">
              <label className="busca-wrap">
                <span aria-hidden="true">⌕</span>
                <input
                className="busca-prod"
                placeholder="Buscar produto..."
                aria-label="Buscar produtos por nome ou descrição"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                />
              </label>
              <button type="button" className="btn-prim" onClick={abrirCriar}>
                Novo produto
              </button>
            </div>

            <ul className="lista-prod">
              {produtos.length === 0 ? (
                <li className="lista-vazia">
                  <span className="vazio-icone" aria-hidden="true">☷</span>
                  <strong>{busca ? "Nenhum resultado" : "Essa categoria ainda está vazia"}</strong>
                  <span>{busca ? "Tente outro nome ou descrição." : "Cadastre o primeiro produto para montar seu cardápio."}</span>
                </li>
              ) : null}
              {produtos.map((p) => {
                const precoMin = p.variantes.length
                  ? Math.min(...p.variantes.map((v) => v.preco_centavos))
                  : p.preco_desde_centavos;
                return (
                  <li key={p.id} className={`prod-item${produtoId === p.id ? " editando" : ""}`}>
                    <img
                      className="prod-avatar"
                      src={origemImagemCardapio(p.caminho_imagem)}
                      alt=""
                      loading="lazy"
                      onError={(e) => { e.currentTarget.src = IMAGEM_PADRAO_CARDAPIO; }}
                    />
                    <button
                      type="button"
                      className="prod-info prod-info-btn"
                      onClick={() => void abrirEditar(p)}
                    >
                      <strong>{p.nome}</strong>
                      {p.descricao ? <span className="prod-desc">{p.descricao}</span> : null}
                      <span className="prod-chips">
                        {p.variantes.map((v) => (
                          <span key={v.id} className="chip-opcao">
                            {v.nome}
                          </span>
                        ))}
                      </span>
                      <span className="prod-badges">
                        <span className={`prod-badge${p.exige_preparo ? " preparo" : " revenda"}`}>{p.exige_preparo ? "Preparado na cozinha" : "Produto de revenda"}</span>
                        <span className="prod-badge neutro">{p.variantes.length} {p.variantes.length === 1 ? "preço" : "preços"}</span>
                        {p.variantes.some((v) => (v.grupos_escolhas?.length ?? 0) > 0) ? (
                          <span className="prod-badge opcionais">Com opcionais</span>
                        ) : null}
                      </span>
                    </button>
                    <div className="prod-lado">
                      <span className="preco-legenda">A partir de</span>
                      <strong className="prod-preco">{formatarReais(precoMin)}</strong>
                      <div className="prod-acoes">
                        <button type="button" className="btn-ghost prod-edit-btn" onClick={() => void abrirEditar(p)}>
                          Editar
                        </button>
                        <button type="button" className="btn-ghost" onClick={() => void excluirProduto(p)}>
                          Excluir
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      {painelAberto ? (
        <aside className="painel-bloco painel-drawer">
          <form className="form-drawer" onSubmit={salvarProduto}>
            <div className="form-produto-titulo">
              <div>
                <span className="painel-sobretitulo">{modo === "criar" ? "NOVO ITEM" : "CONFIGURAÇÃO DO ITEM"}</span>
                <strong>{modo === "criar" ? "Novo produto" : "Editar produto"}</strong>
              </div>
              <button type="button" className="btn-ghost drawer-fechar" onClick={limparForm} aria-label="Fechar edição">
                ×
              </button>
            </div>

            <div className="drawer-bloco">
              <p className="bloco-variante-titulo">Dados do produto</p>
              <label className="campo">
                <span>Nome</span>
                <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Pastel" required />
              </label>
              <CampoImagem
                caminho={caminhoImagem}
                onArquivo={(arquivo) => { setArquivoImagem(arquivo); if (arquivo) setRemoverImagem(false); }}
                onRemover={() => { setCaminhoImagem(null); setRemoverImagem(true); }}
              />
              <label className="campo">
                <span>Descrição (opcional)</span>
                <input
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Ex: Carne moída temperada"
                />
              </label>
              <label className="campo">
                <span>Categoria</span>
                <select
                  value={catForm}
                  onChange={(e) => setCatForm(e.target.value ? Number(e.target.value) : "")}
                >
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label className="check-linha">
                <input
                  type="checkbox"
                  checked={exigePreparo}
                  onChange={(e) => setExigePreparo(e.target.checked)}
                />
                <span className="campo-com-ajuda">
                  Vai para a cozinha
                  <Ajuda texto="Marcado: item vai pra fila da cozinha. Desmarcado: produto de revenda (ex.: refrigerante)." />
                </span>
              </label>
            </div>

            <div className="drawer-bloco bloco-variante">
              <div className="bloco-variante-cab">
                <div>
                  <p className="bloco-variante-titulo titulo-com-ajuda">
                    Opções de preço
                    <Ajuda texto="O produto em si não tem preço. Cada linha é uma opção (Padrão, P, M, G) com seu valor." />
                  </p>
                  <p className="ajuda">Padrão, Pequeno, Grande… cada linha com seu preço.</p>
                </div>
                <button type="button" className="btn-sec" onClick={addVariante}>
                  + outra opção
                </button>
              </div>
              <div className="lista-variantes-form">
                {variantes.map((v) => (
                  <div key={v.chave} className="linha-variante">
                    <input
                      value={v.nome}
                      onChange={(e) => atualizarVariante(v.chave, { nome: e.target.value })}
                      placeholder="Nome (Padrão)"
                    />
                    <input
                      value={v.preco}
                      onChange={(e) => atualizarVariante(v.chave, { preco: e.target.value })}
                      placeholder="Preço R$"
                      inputMode="decimal"
                    />
                    <button
                      type="button"
                      className="btn-ghost"
                      disabled={variantes.length <= 1}
                      onClick={() => void removerLinhaVariante(v)}
                    >
                      Remover
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="form-acoes">
              <button type="submit" disabled={salvando}>
                {salvando ? "Salvando..." : modo === "criar" ? "Criar produto" : "Salvar"}
              </button>
              {modo === "editar" && produtoId ? (
                <button
                  type="button"
                  className="btn-perigo"
                  onClick={() => {
                    const p = selecionada?.produtos.find((x) => x.id === produtoId);
                    if (p) void excluirProduto(p);
                  }}
                >
                  Excluir produto
                </button>
              ) : null}
            </div>
          </form>

          {modo === "editar" && produtoId ? (
            <EscolhasBloco
              produtoId={produtoId}
              variantes={variantesDetalhe}
              setErro={setErro}
              setOk={setOk}
              onMudou={onMudou}
            />
          ) : (
            <div className="bloco-escolhas bloco-escolhas-bloqueado">
              <p className="bloco-variante-titulo">Opcionais do item</p>
              <p className="ajuda">
                Depois de criar, você monta os grupos (massa, molho, sabores…). Adicionais tipo bacon
                ficam na aba Adicionais.
              </p>
            </div>
          )}
        </aside>
      ) : null}
    </div>
  );
}
