import { useMemo, useState } from "react";
import Formulario from "../../componentes/Formulario";
import EditorProduto from "./EditorProduto";
import { api } from "../../servicos/api";
import { confirmar, solicitarTexto } from "../../servicos/dialogos";
import { formatarReais } from "../../util/dinheiro";
import { IMAGEM_PADRAO_CARDAPIO, origemImagemCardapio } from "./imagem";
import type { CategoriaCardapio, Produto } from "./tipos";
type Props = { categorias: CategoriaCardapio[]; onMudou: () => Promise<void>; setErro: (s: string) => void; setOk: (s: string) => void };
export default function ProdutosPainel({ categorias, onMudou, setErro, setOk }: Props) {
  const [categoriaEscolhida, setCategoria] = useState<number | null>(null);
  const categoria = categorias.find(c => c.id === categoriaEscolhida) ?? categorias[0];
  const [busca, setBusca] = useState("");
  const [novaCategoria, setNovaCategoria] = useState("");
  const [editor, setEditor] = useState<{ id: number | null; categoria: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const produtos = useMemo(() => (categoria?.produtos ?? []).filter(p => `${p.nome} ${p.descricao ?? ""}`.toLowerCase().includes(busca.trim().toLowerCase())), [categoria, busca]);
  async function acao(fn: () => Promise<unknown>, mensagem: string) {
    if (busy) return; setBusy(true); setErro(""); setOk("");
    try { await fn(); await onMudou(); setOk(mensagem); } catch(e) { setErro((e as Error).message); } finally { setBusy(false); }
  }
  async function criar(e: React.FormEvent) {
    e.preventDefault(); if (novaCategoria.trim().length < 2) return setErro("Informe uma categoria com pelo menos 2 caracteres.");
    await acao(async () => { await api("/categorias", { method: "POST", body: JSON.stringify({ nome: novaCategoria.trim() }) }); setNovaCategoria(""); }, "Categoria cadastrada.");
  }
  async function excluirCategoria(c: CategoriaCardapio) {
    if (!await confirmar(`Desativar a categoria ${c.nome}${c.produtos.length ? ` e seus ${c.produtos.length} produtos` : ""}? Deixarão de aparecer nas novas vendas.`, true)) return;
    await acao(() => api(`/categorias/${c.id}${c.produtos.length ? "?cascata=1" : ""}`, { method: "DELETE" }), "Categoria desativada.");
  }
  async function excluirProduto(p: Produto) {
    if (!await confirmar(`Desativar ${p.nome}? O produto deixará de aparecer nas novas vendas. Pedidos já feitos serão preservados.`, true)) return;
    await acao(() => api(`/produtos/${p.id}`, { method: "DELETE" }), "Produto desativado.");
  }
  async function mover(i: number, direcao: number) {
    const ordem = categorias.map(c => c.id); const alvo = i + direcao; if (alvo < 0 || alvo >= ordem.length) return;
    [ordem[i], ordem[alvo]] = [ordem[alvo], ordem[i]];
    await acao(() => api("/categorias/reordenar", { method: "PUT", body: JSON.stringify({ ids: ordem }) }), "Ordem atualizada.");
  }
  return <div className="catalogo-layout">
    <section className="cartao"><h2>Categorias</h2><Formulario onSubmit={criar} className="pilha"><label className="fld"><span>Nova categoria *</span><input required minLength={2} value={novaCategoria} onChange={e => setNovaCategoria(e.target.value)} placeholder="Ex.: Bebidas" /></label><button type="submit" className="btn" disabled={busy}>Cadastrar categoria</button></Formulario>
      <ul className="categorias-lista">{categorias.map((c,i) => <li key={c.id}><button type="button" className={`btn ${categoria?.id === c.id ? "selecionado" : ""}`} onClick={() => setCategoria(c.id)}>{c.nome} <span className="tag">{c.produtos.length}</span></button><div className="form-acoes compactas"><button type="button" className="btn-link" disabled={busy} onClick={async () => { const nome = await solicitarTexto("Editar nome da categoria", c.nome); if (nome !== null) await acao(() => api(`/categorias/${c.id}`, { method: "PUT", body: JSON.stringify({ nome: nome.trim() }) }), "Categoria atualizada."); }}>Editar</button><button type="button" className="btn-link texto-perigo" disabled={busy} onClick={() => void excluirCategoria(c)}>Desativar</button><button type="button" className="btn-link" aria-label={`Mover ${c.nome} para cima`} disabled={busy || i === 0} onClick={() => void mover(i,-1)}>↑</button><button type="button" className="btn-link" aria-label={`Mover ${c.nome} para baixo`} disabled={busy || i === categorias.length-1} onClick={() => void mover(i,1)}>↓</button></div></li>)}</ul>
    </section>
    <section className="cartao"><header className="entre"><h2>{categoria?.nome ?? "Produtos"}</h2><button type="button" className="btn btn-pri" disabled={!categoria || busy} onClick={() => setEditor({ id: null, categoria: categoria.id })}>Novo produto</button></header>
      <label className="fld"><span>Buscar produto nesta categoria</span><input type="search" value={busca} onChange={e => setBusca(e.target.value)} /></label>
      {!categoria ? <p>Cadastre uma categoria para começar.</p> : !produtos.length ? <p>Nenhum produto encontrado. Cadastre um produto ou altere a busca.</p> : <ul className="produtos-lista">{produtos.map(p => <li key={p.id}><img src={origemImagemCardapio(p.caminho_imagem)} onError={e => { e.currentTarget.src = IMAGEM_PADRAO_CARDAPIO; }} alt="" /><div><strong>{p.nome}</strong><p>{p.descricao}</p><small>{p.variantes.map(v => `${v.nome}: ${formatarReais(v.preco_centavos)}`).join(" · ")}</small><p className="dica">{p.exige_preparo ? "Preparo na cozinha" : "Produto de revenda"}</p></div><div className="form-acoes"><button type="button" className="btn" disabled={busy} onClick={() => setEditor({ id: p.id, categoria: categoria.id })}>Editar produto</button><button type="button" className="btn-link texto-perigo" disabled={busy} onClick={() => void excluirProduto(p)}>Desativar</button></div></li>)}</ul>}
    </section>
    {editor ? <EditorProduto key={editor.id ?? "novo"} id={editor.id} categoriaId={editor.categoria} categorias={categorias} onFechar={() => setEditor(null)} onSalvo={async () => { await onMudou(); setOk("Produto salvo com preços e escolhas."); }} /> : null}
  </div>;
}
