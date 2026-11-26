import { useProtecaoEdicao } from "../../hooks/useRascunho";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { lerUsuario, podeOperarCaixa } from "../../auth/sessao";
import Dialogo from "../../componentes/ui/Dialogo";
import { Carregando, ErroCarga, Faixa, Vazio } from "../../componentes/ui/Estados";
import Icone from "../../componentes/ui/Icone";
import { useSistema } from "../../estado/sistema-ctx";
import { api, novaChaveIdempotencia, type ApiErro } from "../../servicos/api";
import type { Aprovacao, FormaPagamento, MaisVendido, VendaRapidaResposta } from "../../servicos/contratos";
import { lerConfigOperacao, lerFormasPagamento, maisVendidos } from "../../servicos/rotas";
import { formatarReais } from "../../util/dinheiro";
import { normalizarBairro as normalizar } from "../../util/entrega";
import { linhaCentavos } from "../pdv-regras";
import { adicionar, lerRascunho, mudarQuantidade, paraItensInput, resumoLinha, salvarRascunho, totais, type CarrinhoLinha, type Desconto } from "./carrinho";
import Concluida from "./Concluida";
import DescontoVenda from "./DescontoVenda";
import OpcoesProduto from "./OpcoesProduto";
import Pagamento from "./Pagamento";
import { esgotadoProduto, nomeVariante, precisaOpcoes, temOpcoes, type CategoriaPdv, type ProdutoPdv } from "./tipos";

const MAIS = -1;
const emCampo = (el: Element | null) => !!el && (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || (el as HTMLElement).isContentEditable);

/**
 * Pranchas 05a–05l: venda rápida no balcão. Escolher → cobrar → pronto, numa tela só.
 * PC: grade + carrinho fixo à direita e atalhos de teclado. Celular: 2 colunas e barra "Ver e cobrar".
 */
type Modo = "venda" | "balcao";

export default function VendaRapida({ modo = "venda" }: { modo?: Modo }) {
  const balcao = modo === "balcao";
  const navegar = useNavigate();
  const podeCaixa = podeOperarCaixa();
  const { caixa, avisar, recarregar } = useSistema();
  const gestao = ["ROOT", "ADMIN", "GERENTE"].includes(lerUsuario()?.tipo ?? "");
  const [cardapio, setCardapio] = useState<CategoriaPdv[] | null>(null);
  const [top, setTop] = useState<MaisVendido[]>([]);
  const [formas, setFormas] = useState<FormaPagamento[]>([]);
  const [limiteSemPin, setLimiteSemPin] = useState(500);
  const [erroCarga, setErroCarga] = useState("");
  const [aba, setAba] = useState<number>(MAIS);
  const [busca, setBusca] = useState("");
  const [carrinho, setCarrinho] = useState<CarrinhoLinha[]>(() => lerRascunho(modo).c);
  const [cliente, setCliente] = useState(() => lerRascunho(modo).cliente);
  const [desconto, setDesconto] = useState<Desconto>(null);
  const [aprovDesc, setAprovDesc] = useState<Aprovacao | undefined>();
  const [opcoes, setOpcoes] = useState<{ produto: ProdutoPdv; trocar?: CarrinhoLinha } | null>(null);
  const [pagar, setPagar] = useState<{ forma?: number; chave: string } | null>(null);
  const [verDesconto, setVerDesconto] = useState(false);
  const [verCarrinho, setVerCarrinho] = useState(false);
  const [confirmarLimpar, setConfirmarLimpar] = useState(false);
  const [feito, setFeito] = useState<VendaRapidaResposta | null>(null);
  const [posBalcao, setPosBalcao] = useState<{ id: number; senha: string } | null>(null);
  const buscaRef = useRef<HTMLInputElement>(null);
  const chave = useRef<{ hash: string; valor: string }>({ hash: "", valor: "" });

  const carregar = useCallback(() => {
    Promise.all([api("/cardapio/pdv") as Promise<CategoriaPdv[]>, lerFormasPagamento()])
      .then(([c, f]) => {
        setCardapio(c);
        setFormas(f);
        setErroCarga("");
      })
      .catch((e: ApiErro) => setErroCarga(e.message));
    maisVendidos(9, 30)
      .then(setTop)
      .catch(() => setTop([])); // sem a rota (§7), a aba mostra a ordem do cardápio
    lerConfigOperacao()
      .then((c) => setLimiteSemPin(c.limite_desconto_sem_pin_centavos ?? 500))
      .catch(() => {});
  }, []);
  useEffect(carregar, [carregar]);

  useEffect(() => salvarRascunho(carrinho, cliente, modo), [carrinho, cliente, modo]);
  const [enviando, setEnviando] = useState(false);
  const [agoraBalcao, setAgoraBalcao] = useState(() => Date.now());
  const [abertosBalcao, setAbertosBalcao] = useState<{ id: number; codigo_atendimento: string; numero_dia?: number; cliente_nome: string | null; aberto_em: string; total_centavos?: number; totais?: { total_centavos: number }; pedidos?: { status: string }[] }[] | null>(null);

  const produtos = useMemo(() => (cardapio ?? []).flatMap((c) => c.produtos), [cardapio]);
  const porVariante = useMemo(() => {
    const m = new Map<number, ProdutoPdv>();
    for (const p of produtos) for (const v of p.variantes) m.set(v.id, p);
    return m;
  }, [produtos]);

  /** Atalhos 1–9: os mais vendidos (§7); sem a rota, os primeiros do cardápio. */
  const atalhos = useMemo(() => {
    const doServidor = top.filter(t => t.qtd_vendida > 0).map((t) => ({ produto: porVariante.get(t.produto_variante_id), varianteId: t.produto_variante_id, esgotado: t.esgotado })).filter((x) => x.produto);
    if (doServidor.length) return doServidor.slice(0, 9) as { produto: ProdutoPdv; varianteId: number; esgotado: boolean }[];
    return produtos.slice(0, 9).map((p) => ({ produto: p, varianteId: p.variantes[0].id, esgotado: esgotadoProduto(p) }));
  }, [top, porVariante, produtos]);

  const visiveis = useMemo(() => {
    const q = normalizar(busca);
    if (q) return produtos.filter((p) => normalizar(p.nome).includes(q)).map((p) => ({ produto: p, varianteId: p.variantes[0].id, esgotado: esgotadoProduto(p) }));
    if (aba === MAIS) return atalhos;
    return (cardapio?.find((c) => c.id === aba)?.produtos ?? []).map((p) => ({ produto: p, varianteId: p.variantes[0].id, esgotado: esgotadoProduto(p) }));
  }, [busca, aba, produtos, atalhos, cardapio]);

  const t = totais(carrinho, desconto);
  const produtosCarrinho = new Set(carrinho.map(l => porVariante.get(l.produto_variante_id)?.id ?? l.produto_variante_id)).size;
  const contagem = `${t.itens} ${t.itens === 1 ? "unidade" : "unidades"} · ${produtosCarrinho} ${produtosCarrinho === 1 ? "produto" : "produtos"}`;
  const qtdPorProduto = useMemo(() => {
    const m = new Map<number, number>();
    for (const l of carrinho) {
      m.set(l.produto_variante_id, (m.get(l.produto_variante_id) ?? 0) + l.quantidade);
    }
    return m;
  }, [carrinho]);
  const caixaFechado = !balcao && caixa ? !caixa.aberto : false;
  useProtecaoEdicao(`venda:${modo}`, carrinho.length > 0 || !!cliente.trim());
  const dialogoAberto = !!(opcoes || pagar || verDesconto || feito || confirmarLimpar || verCarrinho || abertosBalcao);

  const tocar = useCallback(
    (p: ProdutoPdv, varianteId: number, esgotado: boolean) => {
      if (esgotado) {
        avisar(`${p.nome} está esgotado.`, "err");
        return;
      }
      if (precisaOpcoes(p, aba === MAIS && !busca ? varianteId : undefined)) {
        setOpcoes({ produto: p });
        return;
      }
      const v = p.variantes.find((x) => x.id === varianteId) ?? p.variantes[0];
      setCarrinho((c) => adicionar(c, { produto_variante_id: v.id, nome: nomeVariante(p, v), preco_centavos: v.preco_centavos, quantidade: 1, observacao: "", escolhas: [], adicionais: [] }));
    },
    [avisar, aba, busca],
  );

  function limpar() {
    setCarrinho([]);
    setCliente("");
    setDesconto(null);
    setAprovDesc(undefined);
    setConfirmarLimpar(false);
  }

  /** Balcão: cria o atendimento BALCAO com o nome/senha e manda os itens para a cozinha. */
  async function enviarBalcao() {
    if (!carrinho.length) {
      avisar("Adicione pelo menos um item.", "err");
      return;
    }
    if (enviando) return;
    setEnviando(true);
    try {
      const at = (await api("/atendimentos", { method: "POST", body: JSON.stringify({ tipo_atendimento: "BALCAO", cliente_nome: cliente.trim() || null }) })) as { id: number; codigo_atendimento: string; numero_dia?: number };
      await api(`/atendimentos/${at.id}/pedidos`, { method: "POST", body: JSON.stringify({ itens: paraItensInput(carrinho) }), chaveIdempotencia: novaChaveIdempotencia() });
      const senha = cliente.trim() || `senha ${at.numero_dia ?? at.codigo_atendimento}`;
      limpar();
      setVerCarrinho(false);
      if (podeCaixa) {
        avisar(`Pedido de ${senha} enviado para a cozinha.`, "ok");
        setPosBalcao({ id: at.id, senha });
      } else {
        avisar(`Pedido de ${senha} enviado para a cozinha. Pagamento no caixa, na retirada.`, "ok");
      }
    } catch (e) {
      avisar((e as Error).message, "err");
    } finally {
      setEnviando(false);
    }
  }

  function abrirAbertos() {
    api("/atendimentos?status=ABERTO&tipo=BALCAO")
      .then((r: NonNullable<typeof abertosBalcao>) => { setAgoraBalcao(Date.now()); setAbertosBalcao((Array.isArray(r) ? r : []).filter((a) => (a as { tipo_atendimento?: string }).tipo_atendimento !== "MESA")); })
      .catch((e: ApiErro) => avisar(e.message, "err"));
  }

  function abrirPagamento(forma?: number) {
    if (balcao) {
      void enviarBalcao();
      return;
    }
    if (!carrinho.length) {
      avisar("Adicione pelo menos um item.", "err");
      return;
    }
    if (caixaFechado) {
      avisar("O caixa está fechado. Abra o caixa para cobrar.", "err");
      return;
    }
    const hash = JSON.stringify([carrinho, desconto, cliente]);
    if (chave.current.hash !== hash) chave.current = { hash, valor: novaChaveIdempotencia() };
    setVerCarrinho(false);
    setPagar({ forma, chave: chave.current.valor });
  }

  // Teclado do PDV (PC): F1 busca · 1–9 atalho · + / − última linha · F5–F7 forma · F9 cobrar · Esc limpar.
  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (dialogoAberto || e.ctrlKey || e.altKey || e.metaKey) return;
      const campo = emCampo(document.activeElement);
      if (e.key === "F1") {
        e.preventDefault();
        buscaRef.current?.focus();
        buscaRef.current?.select();
      } else if (e.key === "F9") {
        e.preventDefault();
        abrirPagamento();
      } else if (["F5", "F6", "F7"].includes(e.key) && !balcao) {
        e.preventDefault();
        const f = formas.filter((x) => x.ativo !== false).sort((a, b) => a.ordem - b.ordem)[Number(e.key[1]) - 5];
        abrirPagamento(f?.id);
      } else if (e.key === "Escape") {
        if (busca) setBusca("");
        else if (carrinho.length) setConfirmarLimpar(true);
      } else if (!campo && /^[1-9]$/.test(e.key)) {
        const a = atalhos[Number(e.key) - 1];
        if (a) tocar(a.produto, a.varianteId, a.esgotado);
      } else if (!campo && (e.key === "+" || e.key === "-") && carrinho.length) {
        const ultima = carrinho[carrinho.length - 1];
        setCarrinho((c) => mudarQuantidade(c, ultima.key, e.key === "+" ? 1 : -1));
      }
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  });

  if (erroCarga) return <ErroCarga mensagem={erroCarga} onTentar={carregar} />;
  if (!cardapio) return <Carregando linhas={6} rotulo="Carregando o cardápio" />;

  const blocoCarrinho = (
    <>
      <label className="fld">
        <span className="sr">Cliente (opcional)</span>
        <input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder={balcao ? "Nome do cliente ou número de retirada" : "Cliente (opcional): nome"} maxLength={60} />
      </label>
      <div className="venda-linhas" aria-label="Itens da venda">
        {carrinho.length === 0 ? (
          <p className="muted" style={{ textAlign: "center", padding: "24px 8px" }}>
            Toque num produto para adicionar.
          </p>
        ) : (
          carrinho.map((l) => (
            <div key={l.key} className="venda-linha">
              <button type="button" className="btn btn-ic" aria-label={`Menos ${l.nome}`} onClick={() => setCarrinho((c) => mudarQuantidade(c, l.key, -1))}>
                <Icone nome="menos" />
              </button>
              <strong className="venda-qtd">{l.quantidade}</strong>
              <button type="button" className="btn btn-ic" aria-label={`Mais ${l.nome}`} onClick={() => setCarrinho((c) => mudarQuantidade(c, l.key, 1))}>
                <Icone nome="mais" />
              </button>
              <span className="venda-nome">
                {l.nome}
                {resumoLinha(l) ? <small>{resumoLinha(l)}</small> : null}
                {porVariante.get(l.produto_variante_id) && temOpcoes(porVariante.get(l.produto_variante_id)!) ? (
                  <button type="button" className="btn btn-link venda-opcoes" onClick={() => setOpcoes({ produto: porVariante.get(l.produto_variante_id)!, trocar: l })}>
                    Opções
                  </button>
                ) : null}
              </span>
              <span className="num">{formatarReais(linhaCentavos(l))}</span>
            </div>
          ))
        )}
      </div>
      {carrinho.length && !balcao ? (
        <button type="button" className="btn btn-link" style={{ justifySelf: "start" }} onClick={() => setVerDesconto(true)}>
          {desconto ? "Mudar desconto" : "Desconto na venda"}
        </button>
      ) : null}
      <div className="venda-totais">
        <div className="entre muted">
          <span>{contagem}</span>
          <span className="num">{formatarReais(t.subtotal)}</span>
        </div>
        {t.desconto ? (
          <div className="entre" style={{ color: "var(--ok)" }}>
            <span>Desconto ({desconto?.motivo})</span>
            <span className="num">− {formatarReais(t.desconto)}</span>
          </div>
        ) : null}
        <div className="entre venda-total">
          <span>Total</span>
          <span className="num" data-testid="total-venda">
            {formatarReais(t.total)}
          </span>
        </div>
      </div>
      {balcao ? null : <div className="venda-formas">
        {formas
          .filter((f) => f.ativo !== false)
          .sort((a, b) => a.ordem - b.ordem)
          .slice(0, 3)
          .map((f, i) => (
            <button key={f.id} type="button" className="btn" disabled={!carrinho.length || caixaFechado} onClick={() => abrirPagamento(f.id)}>
              <Icone nome={f.abre_gaveta ? "dinheiro" : /pix/i.test(f.nome) ? "pix" : "cartao"} /> {f.nome} <span className="kbd">F{5 + i}</span>
            </button>
          ))}
      </div>}
      <button type="button" className="btn btn-pri btn-g btn-bloco" disabled={!carrinho.length || caixaFechado || enviando} onClick={() => abrirPagamento()} data-testid="cobrar">
        {balcao ? (enviando ? "Enviando…" : "Enviar para a cozinha") : `Cobrar ${formatarReais(t.total)}`} <span className="kbd">F9</span>
      </button>
    </>
  );

  return (
    <div className="venda">
      <section className="venda-produtos">
        {balcao ? (
          <div className="entre">
            <span className="muted pequeno">Pedido para levar: vai para a cozinha com o nome ou a senha. {podeCaixa ? "Cobre agora ou na retirada." : "O pagamento é no caixa, na retirada."}</span>
            <button type="button" className="btn" onClick={abrirAbertos}>
              Pedidos abertos
            </button>
          </div>
        ) : null}
        {caixaFechado ? (
          <Faixa tom="warn" titulo="O caixa está fechado." acao={<Link className="btn" to="/painel/caixa">Abrir caixa</Link>}>
            Dá para montar a venda, mas só cobra com o caixa aberto.
          </Faixa>
        ) : null}
        <label className="venda-busca">
          <Icone nome="lupa" cor="var(--ink3)" />
          <span className="sr">Buscar produto</span>
          <input
            ref={buscaRef}
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && visiveis[0]) {
                e.preventDefault();
                tocar(visiveis[0].produto, visiveis[0].varianteId, visiveis[0].esgotado);
                setBusca("");
              }
            }}
            placeholder="Buscar produto (F1)"
            autoComplete="off"
          />
        </label>
        <div className="pilulas" role="group" aria-label="Categorias">
          <button type="button" aria-pressed={aba === MAIS && !busca} onClick={() => (setAba(MAIS), setBusca(""))}>
            {top.some(t => t.qtd_vendida > 0) ? "Mais vendidos" : "Produtos"}
          </button>
          {cardapio.map((c) => (
            <button key={c.id} type="button" aria-pressed={aba === c.id && !busca} onClick={() => (setAba(c.id), setBusca(""))}>
              {c.nome}
            </button>
          ))}
        </div>
        {visiveis.length === 0 ? (
          <Vazio icone="lupa" titulo={`Nada encontrado para “${busca}”`} acao={<button className="btn" type="button" onClick={() => setBusca("")}>Limpar busca</button>}>
            Confira a escrita ou procure pela categoria.
          </Vazio>
        ) : (
          <div className="venda-grade">
            {visiveis.map(({ produto: p, varianteId, esgotado }, i) => {
              const q = qtdPorProduto.get(varianteId);
              const v = p.variantes.find((x) => x.id === varianteId) ?? p.variantes[0];
              const atalho = aba === MAIS && !busca ? i + 1 : null;
              return (
                <button key={`${p.id}-${varianteId}`} type="button" className={`venda-prod${esgotado ? " esgotado" : ""}`} onClick={() => tocar(p, varianteId, esgotado)} aria-label={`${nomeVariante(p, v)}, ${formatarReais(v.preco_centavos)}${esgotado ? ", esgotado" : ""}${q ? `, ${q} no carrinho` : ""}`}>
                  <span className="venda-prod-nome">{p.variantes.length > 1 && aba === MAIS ? nomeVariante(p, v) : p.nome}</span>
                  {atalho ? <span className="venda-atalho">{atalho}</span> : null}
                  {q ? <span className="venda-badge">{q}</span> : null}
                  <span className="venda-prod-preco">{esgotado ? <span style={{ color: "var(--err)" }}>Esgotado</span> : p.variantes.length > 1 && aba !== MAIS ? `a partir de ${formatarReais(p.preco_desde_centavos)}` : formatarReais(v.preco_centavos)}</span>
                </button>
              );
            })}
          </div>
        )}
        <p className="venda-teclas muted pequeno" aria-hidden>
          <span className="kbd">F1</span> buscar · <span className="kbd">1–9</span> adicionar · <span className="kbd">+</span> <span className="kbd">−</span> quantidade · <span className="kbd">F5–F7</span> forma · <span className="kbd">F9</span> {balcao ? "enviar pedido" : "cobrar"} · <span className="kbd">Esc</span> limpar
        </p>
      </section>

      <aside className="venda-carrinho cartao" aria-label="Venda">
        <div className="entre">
          <h2 style={{ margin: 0 }}>{balcao ? "Pedido balcão" : "Venda rápida"}</h2>
          <button type="button" className="btn btn-link" disabled={!carrinho.length} onClick={() => setConfirmarLimpar(true)}>
            Limpar <span className="kbd">Esc</span>
          </button>
        </div>
        {blocoCarrinho}
      </aside>

      <div className="venda-barra-cel">
        <div>
          <div className="muted pequeno">{contagem}</div>
          <strong style={{ fontSize: 20 }}>{formatarReais(t.total)}</strong>
        </div>
        <button type="button" className="btn btn-pri btn-g" disabled={!carrinho.length} onClick={() => setVerCarrinho(true)}>
          {balcao ? "Ver e enviar" : "Ver e cobrar"}
        </button>
      </div>

      {verCarrinho ? (
        <Dialogo titulo={balcao ? "Pedido balcão" : "Venda rápida"} sub={contagem} onFechar={() => setVerCarrinho(false)}>
          <div className="pilha">{blocoCarrinho}</div>
          {carrinho.length ? (
            <button type="button" className="btn btn-perigo" onClick={() => setConfirmarLimpar(true)}>
              Limpar venda
            </button>
          ) : null}
        </Dialogo>
      ) : null}
      {opcoes ? (
        <OpcoesProduto
          produto={opcoes.produto}
          inicial={opcoes.trocar}
          onFechar={() => setOpcoes(null)}
          onAdicionar={(l) => {
            const velha = opcoes.trocar;
            setCarrinho((c) => adicionar(velha ? c.filter((x) => x.key !== velha.key) : c, l));
            setOpcoes(null);
          }}
        />
      ) : null}
      {verDesconto ? (
        <DescontoVenda
          subtotal={t.subtotal}
          limiteSemPin={limiteSemPin}
          gestao={gestao}
          atual={desconto}
          onFechar={() => setVerDesconto(false)}
          onAplicar={(d, ap) => {
            setDesconto(d);
            setAprovDesc(ap);
            setVerDesconto(false);
          }}
        />
      ) : null}
      {confirmarLimpar ? (
        <Dialogo
          titulo="Limpar a venda?"
          sub="Os itens saem do carrinho. Nada foi cobrado."
          onFechar={() => setConfirmarLimpar(false)}
          pe={
            <>
              <button type="button" className="btn" onClick={() => setConfirmarLimpar(false)}>
                Voltar
              </button>
              <button type="button" className="btn btn-perigo" onClick={limpar} data-foco>
                Limpar
              </button>
            </>
          }
        />
      ) : null}
      {pagar ? (
        <Pagamento
          total={t.total}
          titulo={`Venda rápida · ${t.itens} itens${cliente ? ` · ${cliente}` : ""}`}
          formas={formas}
          formaInicial={pagar.forma}
          chave={pagar.chave}
          montarVenda={() => ({
            ...(cliente.trim() ? { cliente_nome: cliente.trim() } : {}),
            itens: paraItensInput(carrinho),
            ...(desconto
              ? {
                  desconto: {
                    ...(desconto.tipo === "percentual" ? { percentual: desconto.valor } : { centavos: t.desconto }),
                    motivo: desconto.motivo,
                    ...(aprovDesc ? { aprovacao: aprovDesc } : {}),
                  },
                }
              : {}),
          })}
          onFechar={() => setPagar(null)}
          onConcluida={(r) => {
            setPagar(null);
            setFeito(r);
            limpar();
            chave.current = { hash: "", valor: "" };
            recarregar();
            maisVendidos(9, 30).then(setTop).catch(() => {});
          }}
        />
      ) : null}
      {posBalcao ? (
        <Dialogo
          titulo={`Pedido de ${posBalcao.senha} na cozinha`}
          sub="Cobrar agora ou deixar para a retirada?"
          onFechar={() => setPosBalcao(null)}
          pe={
            <>
              <button type="button" className="btn" onClick={() => setPosBalcao(null)} data-foco>
                Pagar na retirada
              </button>
              <button type="button" className="btn btn-pri" onClick={() => navegar(`/painel/conta/${posBalcao.id}`)}>
                Cobrar agora
              </button>
            </>
          }
        />
      ) : null}
      {abertosBalcao ? (
        <Dialogo titulo="Pedidos de balcão abertos" sub="Esperando retirada ou pagamento" onFechar={() => setAbertosBalcao(null)}>
          {abertosBalcao.length === 0 ? (
            <Vazio titulo="Nenhum pedido aberto" />
          ) : (
            <div className="lista">
              {abertosBalcao.map((a) => (
                <div key={a.id} className="item-lista" style={{ cursor: "default" }}>
                  <div>
                    <strong>{a.cliente_nome || `Senha ${a.numero_dia ?? a.codigo_atendimento}`}</strong>
                    <div className="sub">{a.codigo_atendimento} · {Math.max(0, Math.floor((agoraBalcao - new Date(a.aberto_em).getTime()) / 60000))} min · {a.pedidos?.some(p => p.status === "EM_PREPARO") ? "Em preparo" : a.pedidos?.some(p => p.status === "RECEBIDO") ? "Aguardando preparo" : "Pronto / sem preparo"}</div>
                  </div>
                  <div className="dir">
                    <strong>{formatarReais(a.totais?.total_centavos ?? a.total_centavos ?? 0)}</strong><button type="button" className="btn" onClick={() => navegar(`/painel/pdv/${a.id}`)}>Continuar pedido</button>
                    {podeCaixa ? (
                      <button type="button" className="btn btn-pri" style={{ marginLeft: 8 }} onClick={() => navegar(`/painel/conta/${a.id}`)}>
                        Receber
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Dialogo>
      ) : null}
      {feito ? (
        <Concluida
          r={feito}
          onNova={() => {
            setFeito(null);
            setTimeout(() => buscaRef.current?.focus(), 0);
          }}
        />
      ) : null}
    </div>
  );
}
