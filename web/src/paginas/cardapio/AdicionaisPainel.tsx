import { lerRascunhoSeguro, podeTrocarEdicao, useEdicaoPendente } from "../../hooks/useRascunho";
import Formulario from "../../componentes/Formulario";
import { confirmar } from "../../servicos/dialogos";
import { useCallback, useEffect, useState } from "react";
import Ajuda from "../../componentes/Ajuda";
import { api } from "../../servicos/api";
import { formatarReais, reaisParaCentavos } from "../../util/dinheiro";
import type { CategoriaCardapio, GrupoAdicionais, LinhaVariante } from "./tipos";
import { IMAGEM_PADRAO_CARDAPIO, origemImagemCardapio } from "./imagem";
import CampoImagem from "./CampoImagem";
import { enviarImagemCardapio } from "./imagem";

type Props = {
  categorias: CategoriaCardapio[];
  setErro: (s: string) => void;
  setOk: (s: string) => void;
};

type AdicionalItem = GrupoAdicionais["adicionais"][number];

function novaLinha(nome = "Padrão"): LinhaVariante {
  return { chave: crypto.randomUUID(), nome, preco: "0" };
}

export default function AdicionaisPainel({ categorias, setErro: reportarErro, setOk }: Props) {
  const [erroLocal, setErroLocal] = useState("");
  const setErro = useCallback((mensagem: string) => { setErroLocal(mensagem); reportarErro(mensagem); }, [reportarErro]);
  const [grupos, setGrupos] = useState<GrupoAdicionais[]>([]);
  const [grupoId, setGrupoId] = useState<number | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const r = lerRascunhoSeguro<{ nomeGrupoNovo: string; catsGrupoNovo: number[] }>("adicionais:grupo-novo");
  const [criandoGrupo, setCriandoGrupo] = useState(false);
  const [nomeGrupoNovo, setNomeGrupoNovo] = useState(r?.nomeGrupoNovo ?? "");
  const [catsGrupoNovo, setCatsGrupoNovo] = useState<number[]>(r?.catsGrupoNovo ?? []);

  const [editNomeGrupo, setEditNomeGrupo] = useState("");
  const [editCatsGrupo, setEditCatsGrupo] = useState<number[]>([]);

  const [nomeAdicional, setNomeAdicional] = useState("");
  const [qtdMax, setQtdMax] = useState("5");
  const [variantes, setVariantes] = useState<LinhaVariante[]>([novaLinha()]);
  const [arquivoImagem, setArquivoImagem] = useState<File | null>(null);
  const [caminhoImagem, setCaminhoImagem] = useState<string | null>(null);

  const [editandoAdicionalId, setEditandoAdicionalId] = useState<number | null>(null);
  const [editNomeAdic, setEditNomeAdic] = useState("");
  const [editQtdMax, setEditQtdMax] = useState("5");
  const [editVariantes, setEditVariantes] = useState<LinhaVariante[]>([]);
  const [editArquivoImagem, setEditArquivoImagem] = useState<File | null>(null);
  const [editCaminhoImagem, setEditCaminhoImagem] = useState<string | null>(null);
  const [editRemoverImagem, setEditRemoverImagem] = useState(false);

  const [exclusaoProdutoId, setExclusaoProdutoId] = useState<number | "">("");

  const marcarAdicionalSalvo = useEdicaoPendente(`adicionais:novo:${grupoId}`, { nomeAdicional, qtdMax, variantes, caminhoImagem }, !!grupoId && !carregando);
  const marcarEdicaoGrupoSalva = useEdicaoPendente(`adicionais:grupo:${grupoId}`, { editNomeGrupo, editCatsGrupo }, !!grupoId && !carregando);
  const marcarGrupoSalvo = useEdicaoPendente("adicionais:grupo-novo", { nomeGrupoNovo, catsGrupoNovo }, criandoGrupo);
  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const dados = (await api("/grupos-adicionais")) as GrupoAdicionais[];
      setGrupos(dados);
      setGrupoId((atual) => {
        if (atual && dados.some((g) => g.id === atual)) return atual;
        return dados[0]?.id ?? null;
      });
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [setErro]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga de dados da tela (fetch)
    void carregar();
  }, [carregar]);

  const selecionado = grupos.find((g) => g.id === grupoId) ?? null;

  // Ao trocar de grupo, recarrega o formulário de edição (ajuste durante o render, sem efeito).
  const idSelecionado = selecionado?.id ?? null;
  const [grupoNoForm, setGrupoNoForm] = useState<number | null | undefined>(undefined);
  if (grupoNoForm !== idSelecionado) {
    setGrupoNoForm(idSelecionado);
    const r = lerRascunhoSeguro<{ editNomeGrupo: string; editCatsGrupo: number[] }>(`adicionais:grupo:${idSelecionado}`);
    setEditNomeGrupo(r?.editNomeGrupo ?? selecionado?.nome ?? "");
    setEditCatsGrupo(r?.editCatsGrupo ?? (selecionado ? selecionado.categorias.map((c) => c.categoria_id) : []));
    const ad = lerRascunhoSeguro<{ nomeAdicional: string; qtdMax: string; variantes: LinhaVariante[]; caminhoImagem: string | null }>(`adicionais:novo:${idSelecionado}`);
    setNomeAdicional(ad?.nomeAdicional ?? ""); setQtdMax(ad?.qtdMax ?? "5"); setVariantes(ad?.variantes ?? [novaLinha()]); setCaminhoImagem(ad?.caminhoImagem ?? null); setArquivoImagem(null);
    if (selecionado) setEditandoAdicionalId(null);
  }

  const produtosDaCategoriaDoGrupo =
    selecionado?.categorias.flatMap((c) => {
      const cat = categorias.find((x) => x.id === c.categoria_id);
      return (cat?.produtos ?? []).map((p) => ({ ...p, categoria_nome: cat?.nome ?? "" }));
    }) ?? [];

  function toggleCatNovo(id: number) {
    setCatsGrupoNovo((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleCatEdit(id: number) {
    setEditCatsGrupo((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function criarGrupo(e: React.FormEvent) {
    e.preventDefault();
    if (nomeGrupoNovo.trim().length < 2) return setErro("Nome do grupo inválido");
    if (catsGrupoNovo.length === 0) return setErro("Marque ao menos uma categoria");
    setSalvando(true);
    setErro("");
    try {
      const criado = (await api("/grupos-adicionais", {
        method: "POST",
        body: JSON.stringify({ nome: nomeGrupoNovo.trim(), categoria_ids: catsGrupoNovo }),
      })) as GrupoAdicionais;
      marcarGrupoSalvo(); setNomeGrupoNovo("");
      setCatsGrupoNovo([]);
      setCriandoGrupo(false);
      setOk("Grupo de adicionais criado");
      await carregar();
      setGrupoId(criado.id);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function salvarGrupo(e: React.FormEvent) {
    e.preventDefault();
    if (!selecionado) return;
    if (editNomeGrupo.trim().length < 2) return setErro("Nome do grupo inválido");
    if (editCatsGrupo.length === 0) return setErro("Marque ao menos uma categoria");
    setSalvando(true);
    setErro("");
    try {
      await api(`/grupos-adicionais/${selecionado.id}`, {
        method: "PUT",
        body: JSON.stringify({
          nome: editNomeGrupo.trim(),
          categoria_ids: editCatsGrupo,
        }),
      });
      marcarEdicaoGrupoSalva(); setOk("Grupo atualizado");
      await carregar();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function excluirGrupo(id: number) {
    if (!(await confirmar("Excluir este grupo e seus adicionais?"))) return;
    setErro("");
    try {
      await api(`/grupos-adicionais/${id}`, { method: "DELETE" });
      setOk("Grupo excluído");
      await carregar();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  async function criarAdicional(e: React.FormEvent) {
    e.preventDefault();
    if (!selecionado) return;
    if (nomeAdicional.trim().length < 2) return setErro("Nome do adicional inválido");

    const vars: { nome: string; preco_centavos: number }[] = [];
    for (const v of variantes) {
      const centavos = reaisParaCentavos(v.preco);
      if (!v.nome.trim()) return setErro("Toda opção do adicional precisa de nome");
      if (!Number.isFinite(centavos) || centavos < 0) return setErro(`Preço inválido em "${v.nome}"`);
      vars.push({ nome: v.nome.trim(), preco_centavos: centavos });
    }

    setSalvando(true);
    setErro("");
    try {
      const criado = await api("/adicionais", {
        method: "POST",
        body: JSON.stringify({
          grupo_adicionais_id: selecionado.id,
          nome: nomeAdicional.trim(),
          qtd_max: Number(qtdMax) || 5,
          variantes: vars,
        }),
      });
      if (arquivoImagem) {
        const caminho = await enviarImagemCardapio(arquivoImagem);
        await api(`/adicionais/${(criado as AdicionalItem).id}`, {
          method: "PUT",
          body: JSON.stringify({ caminho_imagem: caminho }),
        });
      }
      marcarAdicionalSalvo(); setNomeAdicional("");
      setQtdMax("5");
      setVariantes([novaLinha()]);
      setArquivoImagem(null);
      setCaminhoImagem(null);
      setOk("Adicional criado");
      await carregar();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  function abrirEditarAdicional(a: AdicionalItem) {
    setEditandoAdicionalId(a.id);
    setEditNomeAdic(a.nome);
    setEditQtdMax(String(a.qtd_max));
    setEditCaminhoImagem(a.caminho_imagem ?? null);
    setEditArquivoImagem(null);
    setEditRemoverImagem(false);
    setEditVariantes(
      a.adicional_variantes.map((v) => ({
        chave: String(v.id),
        id: v.id,
        nome: v.nome,
        preco: (v.preco_centavos / 100).toFixed(2).replace(".", ","),
      }))
    );
  }

  async function salvarAdicional(e: React.FormEvent) {
    e.preventDefault();
    if (!editandoAdicionalId) return;
    if (editNomeAdic.trim().length < 2) return setErro("Nome do adicional inválido");

    for (const v of editVariantes) {
      const centavos = reaisParaCentavos(v.preco);
      if (!v.nome.trim()) return setErro("Toda opção precisa de nome");
      if (!Number.isFinite(centavos) || centavos < 0) return setErro(`Preço inválido em "${v.nome}"`);
    }

    setSalvando(true);
    setErro("");
    try {
      const caminho = editArquivoImagem ? await enviarImagemCardapio(editArquivoImagem) : editRemoverImagem ? null : editCaminhoImagem;
      await api(`/adicionais/${editandoAdicionalId}`, {
        method: "PUT",
        body: JSON.stringify({
          nome: editNomeAdic.trim(),
          qtd_max: Number(editQtdMax) || 5,
          caminho_imagem: caminho,
        }),
      });

      for (const v of editVariantes) {
        const centavos = reaisParaCentavos(v.preco);
        if (v.id) {
          await api(`/adicionais/${editandoAdicionalId}/variantes/${v.id}`, {
            method: "PUT",
            body: JSON.stringify({ nome: v.nome.trim(), preco_centavos: centavos }),
          });
        } else {
          await api(`/adicionais/${editandoAdicionalId}/variantes`, {
            method: "POST",
            body: JSON.stringify({ nome: v.nome.trim(), preco_centavos: centavos }),
          });
        }
      }

      setOk("Adicional atualizado");
      setEditandoAdicionalId(null);
      setEditCaminhoImagem(caminho);
      setEditArquivoImagem(null);
      setEditRemoverImagem(false);
      await carregar();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function removerOpcaoAdicional(linha: LinhaVariante) {
    if (editVariantes.length <= 1) {
      setErro("Precisa ficar pelo menos uma opção de preço");
      return;
    }
    if (editandoAdicionalId && linha.id) {
      if (!(await confirmar(`Remover a opção "${linha.nome}"?`))) return;
      setErro("");
      try {
        await api(`/adicionais/${editandoAdicionalId}/variantes/${linha.id}`, { method: "DELETE" });
        setEditVariantes((lista) => lista.filter((x) => x.chave !== linha.chave));
        setOk("Opção removida");
        await carregar();
      } catch (err) {
        setErro((err as Error).message);
      }
      return;
    }
    setEditVariantes((lista) => lista.filter((x) => x.chave !== linha.chave));
  }

  async function excluirAdicional(id: number) {
    if (!(await confirmar("Excluir este adicional?"))) return;
    setErro("");
    try {
      await api(`/adicionais/${id}`, { method: "DELETE" });
      if (editandoAdicionalId === id) setEditandoAdicionalId(null);
      setOk("Adicional excluído");
      await carregar();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  async function adicionarExclusao(e: React.FormEvent) {
    e.preventDefault();
    if (!selecionado || !exclusaoProdutoId) return;
    setErro("");
    try {
      await api(`/grupos-adicionais/${selecionado.id}/exclusoes`, {
        method: "POST",
        body: JSON.stringify({ produto_id: Number(exclusaoProdutoId) }),
      });
      setExclusaoProdutoId("");
      setOk("Produto excluído deste grupo de adicionais");
      await carregar();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  async function removerExclusao(produtoId: number) {
    if (!selecionado) return;
    setErro("");
    try {
      await api(`/grupos-adicionais/${selecionado.id}/exclusoes/${produtoId}`, { method: "DELETE" });
      setOk("Exclusão removida");
      await carregar();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  return (
    <div className="cardapio-grid-adic">
      <section className="painel-bloco painel-cats">
        <header className="painel-bloco-cab">
          <h2 className="titulo-com-ajuda">
            Grupos
            <Ajuda texto="Um grupo (ex.: Proteínas) aparece nos produtos das categorias marcadas. Use exclusões pra tirar itens específicos." />
          </h2>
          <span>{grupos.length}</span>
        </header>

        <button
          type="button"
          className="btn-prim btn-bloco"
          onClick={async () => { if (await podeTrocarEdicao()) setCriandoGrupo(v => !v); }}
        >
          {criandoGrupo ? "Cancelar" : "Novo grupo"}
        </button>

        <ul className="lista-cat" style={{ marginTop: 12 }}>
          {grupos.length === 0 && !carregando ? <li className="vazio">Nenhum grupo ainda.</li> : null}
          {grupos.map((g) => (
            <li key={g.id} className="cat-linha cat-linha-simples">
              <button
                type="button"
                className={`cat-item${g.id === grupoId ? " ativa" : ""}`}
                onClick={async () => { if (await podeTrocarEdicao()) setGrupoId(g.id); }}
              >
                <span className="cat-nome">{g.nome}</span>
                <span className="cat-qtd">{g.adicionais.length}</span>
              </button>
              <div className="cat-acoes">
                <button
                  type="button"
                  className="btn-icon btn-icon-danger"
                  aria-label={`Excluir grupo ${g.nome}`}
                  title="Excluir"
                  onClick={async () => void excluirGrupo(g.id)}
                >
                  ×
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="painel-bloco painel-lista">
        {erroLocal ? <p role="alert" className="feedback-card feedback-erro">{erroLocal}</p> : null}
        {criandoGrupo ? (
          <Formulario className="form-drawer" onSubmit={criarGrupo}>
            <h2>Novo grupo de adicionais</h2><p>As opções deste grupo aparecerão nos produtos de todas as categorias marcadas.</p>
            <label className="campo">
              <span>Nome</span>
              <input
                value={nomeGrupoNovo}
                onChange={(e) => setNomeGrupoNovo(e.target.value)}
                placeholder="Ex: Proteínas" required minLength={2}
              />
            </label>
            <div className="campo">
              <span>Categorias * — escolha ao menos uma</span>
              <div className="chips">
                {categorias.map((c) => (
                  <label key={c.id} className={`chip${catsGrupoNovo.includes(c.id) ? " on" : ""}`}>
                    <input
                      type="checkbox"
                      checked={catsGrupoNovo.includes(c.id)}
                      onChange={() => toggleCatNovo(c.id)}
                    />
                    {c.nome}
                  </label>
                ))}
              </div>
            </div>
            <button type="submit" className="btn-prim" disabled={salvando}>
              Criar
            </button>
          </Formulario>
        ) : null}

        {!selecionado ? (
          <p className="vazio">Selecione ou crie um grupo.</p>
        ) : (
          <>
            <header className="painel-bloco-cab">
              <h2>{selecionado.nome}</h2>
              <span>{selecionado.adicionais.length}</span>
            </header>

            <Formulario className="drawer-bloco form-drawer" onSubmit={salvarGrupo}>
              <p className="bloco-variante-titulo titulo-com-ajuda">
                Grupo e categorias
                <Ajuda texto="Marque as categorias em que este grupo de adicionais deve aparecer no pedido." />
              </p>
              <label className="campo">
                <span>Nome do grupo</span>
                <input value={editNomeGrupo} onChange={(e) => setEditNomeGrupo(e.target.value)} />
              </label>
              <div className="campo">
                <span className="campo-com-ajuda">
                  Categorias onde aparece
                  <Ajuda texto="Ex.: marcar Pastéis faz o grupo surgir em todo pastel daquela categoria." />
                </span>
                <div className="chips">
                  {categorias.map((c) => (
                    <label key={c.id} className={`chip${editCatsGrupo.includes(c.id) ? " on" : ""}`}>
                      <input
                        type="checkbox"
                        checked={editCatsGrupo.includes(c.id)}
                        onChange={() => toggleCatEdit(c.id)}
                      />
                      {c.nome}
                    </label>
                  ))}
                </div>
              </div>
              <button type="submit" className="btn-sec" disabled={salvando}>
                Salvar grupo
              </button>
            </Formulario>

            <Formulario className="drawer-bloco form-drawer" onSubmit={criarAdicional}>
              <p className="bloco-variante-titulo titulo-com-ajuda">
                Novo adicional
                <Ajuda texto="Item extra com preço próprio (ex.: Bacon). Pode ter várias opções de preço (50g / 100g)." />
              </p>
              <label className="campo">
                <span>Nome</span>
                <input
                  value={nomeAdicional}
                  onChange={(e) => setNomeAdicional(e.target.value)}
                  placeholder="Ex: Bacon"
                />
              </label>
              <CampoImagem
                caminho={caminhoImagem}
                onArquivo={setArquivoImagem}
                onRemover={() => setCaminhoImagem(null)}
              />
              <label className="campo">
                <span>Qtd. máxima no item</span>
                <input value={qtdMax} onChange={(e) => setQtdMax(e.target.value)} inputMode="numeric" />
              </label>
              <div className="bloco-variante">
                <div className="bloco-variante-cab">
                  <div>
                    <p className="bloco-variante-titulo">Opções de preço</p>
                    <p className="ajuda">Ex: Bacon 50g / 100g</p>
                  </div>
                  <button
                    type="button"
                    className="btn-sec"
                    onClick={async () => setVariantes((v) => [...v, novaLinha(`Opção ${v.length + 1}`)])}
                  >
                    + opção
                  </button>
                </div>
                <div className="lista-variantes-form">
                  {variantes.map((v) => (
                    <div key={v.chave} className="linha-variante">
                      <input
                        value={v.nome}
                        onChange={(e) =>
                          setVariantes((lista) =>
                            lista.map((x) => (x.chave === v.chave ? { ...x, nome: e.target.value } : x))
                          )
                        }
                        placeholder="Nome"
                      />
                      <input
                        value={v.preco}
                        onChange={(e) =>
                          setVariantes((lista) =>
                            lista.map((x) => (x.chave === v.chave ? { ...x, preco: e.target.value } : x))
                          )
                        }
                        placeholder="Preço"
                        inputMode="decimal"
                      />
                      <button
                        type="button"
                        className="btn-ghost"
                        disabled={variantes.length <= 1}
                        onClick={async () => setVariantes((lista) => lista.filter((x) => x.chave !== v.chave))}
                      >
                        Remover
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <button type="submit" className="btn-prim" disabled={salvando}>
                Adicionar
              </button>
            </Formulario>

            <ul className="lista-prod">
              {selecionado.adicionais.length === 0 ? (
                <li className="vazio">Nenhum adicional neste grupo.</li>
              ) : null}
              {selecionado.adicionais.map((a) => (
                <li key={a.id} className={`prod-item${editandoAdicionalId === a.id ? " editando" : ""}`}>
                  {editandoAdicionalId === a.id ? (
                    <Formulario className="form-drawer form-edit-adic" onSubmit={salvarAdicional}>
                      <CampoImagem
                        caminho={editCaminhoImagem}
                        onArquivo={(arquivo) => { setEditArquivoImagem(arquivo); if (arquivo) setEditRemoverImagem(false); }}
                        onRemover={() => { setEditCaminhoImagem(null); setEditRemoverImagem(true); }}
                      />
                      <label className="campo">
                        <span>Nome</span>
                        <input value={editNomeAdic} onChange={(e) => setEditNomeAdic(e.target.value)} />
                      </label>
                      <label className="campo">
                        <span>Qtd. máxima</span>
                        <input
                          value={editQtdMax}
                          onChange={(e) => setEditQtdMax(e.target.value)}
                          inputMode="numeric"
                        />
                      </label>
                      <div className="bloco-variante">
                        <div className="bloco-variante-cab">
                          <p className="bloco-variante-titulo">Opções de preço</p>
                          <button
                            type="button"
                            className="btn-sec"
                            onClick={async () =>
                              setEditVariantes((v) => [...v, novaLinha(`Opção ${v.length + 1}`)])
                            }
                          >
                            + opção
                          </button>
                        </div>
                        <div className="lista-variantes-form">
                          {editVariantes.map((v) => (
                            <div key={v.chave} className="linha-variante">
                              <input
                                value={v.nome}
                                onChange={(e) =>
                                  setEditVariantes((lista) =>
                                    lista.map((x) =>
                                      x.chave === v.chave ? { ...x, nome: e.target.value } : x
                                    )
                                  )
                                }
                              />
                              <input
                                value={v.preco}
                                onChange={(e) =>
                                  setEditVariantes((lista) =>
                                    lista.map((x) =>
                                      x.chave === v.chave ? { ...x, preco: e.target.value } : x
                                    )
                                  )
                                }
                                inputMode="decimal"
                              />
                              <button
                                type="button"
                                className="btn-ghost"
                                disabled={editVariantes.length <= 1}
                                onClick={async () => void removerOpcaoAdicional(v)}
                              >
                                Remover
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="form-acoes">
                        <button type="submit" disabled={salvando}>
                          Salvar
                        </button>
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={async () => setEditandoAdicionalId(null)}
                        >
                          Cancelar
                        </button>
                      </div>
                    </Formulario>
                  ) : (
                    <>
                      <img
                        className="prod-avatar"
                        src={origemImagemCardapio(a.caminho_imagem)}
                        alt=""
                        loading="lazy"
                        onError={(e) => { e.currentTarget.src = IMAGEM_PADRAO_CARDAPIO; }}
                      />
                      <div className="prod-info">
                        <strong>{a.nome}</strong>
                        <span className="prod-meta">
                          máx. {a.qtd_max} ·{" "}
                          {a.adicional_variantes
                            .map((v) => `${v.nome} ${formatarReais(v.preco_centavos)}`)
                            .join(" · ")}
                        </span>
                      </div>
                      <div className="prod-acoes">
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={async () => abrirEditarAdicional(a)}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={async () => void excluirAdicional(a.id)}
                        >
                          Excluir
                        </button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>

            <div className="drawer-bloco" style={{ marginTop: 16 }}>
              <p className="bloco-variante-titulo titulo-com-ajuda">
                Exceções
                <Ajuda texto="Ex.: grupo de adicionais salgados na categoria Pastéis — exclua o pastel doce pra ele não aparecer." />
              </p>
              <p className="ajuda">
                Produtos da categoria que <em>não</em> devem mostrar estes adicionais.
              </p>
              <Formulario className="form-inline" onSubmit={adicionarExclusao}>
                <select
                  value={exclusaoProdutoId}
                  onChange={(e) => setExclusaoProdutoId(e.target.value ? Number(e.target.value) : "")}
                >
                  <option value="">Escolha o produto...</option>
                  {produtosDaCategoriaDoGrupo.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome} ({p.categoria_nome})
                    </option>
                  ))}
                </select>
                <button type="submit" disabled={!exclusaoProdutoId}>Excluir do grupo</button>
              </Formulario>
              <ul className="lista-prod">
                {selecionado.produtos_excluidos.length === 0 ? (
                  <li className="vazio">Nenhuma exclusão.</li>
                ) : null}
                {selecionado.produtos_excluidos.map((ex) => (
                  <li key={ex.produto_id} className="prod-item">
                    <strong>{ex.produto.nome}</strong>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={async () => void removerExclusao(ex.produto_id)}
                    >
                      Remover exclusão
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
