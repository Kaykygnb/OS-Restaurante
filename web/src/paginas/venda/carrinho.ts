import { lerUsuario } from "../../auth/sessao";
/** Regras puras do carrinho da venda rápida e do pagamento. Testadas no Vitest. */
import type { PedidoItemInput } from "../../servicos/contratos";
import { linhaCentavos, type CarrinhoLinha } from "../pdv-regras";

export type { CarrinhoLinha };

/** Mesma variante + mesmas escolhas/adicionais/observação = mesma linha (soma a quantidade). */
export function assinatura(l: Omit<CarrinhoLinha, "key" | "quantidade">): string {
  const esc = l.escolhas.map((e) => `${e.opcao_escolha_id}x${e.quantidade}`).sort().join(",");
  const adi = l.adicionais.map((a) => `${a.adicional_variante_id}x${a.quantidade}`).sort().join(",");
  return `${l.produto_variante_id}|${esc}|${adi}|${l.observacao.trim()}`;
}

export function adicionar(carrinho: CarrinhoLinha[], nova: Omit<CarrinhoLinha, "key">): CarrinhoLinha[] {
  const key = assinatura(nova);
  const i = carrinho.findIndex((l) => l.key === key);
  if (i >= 0) return carrinho.map((l, j) => (j === i ? { ...l, quantidade: l.quantidade + nova.quantidade } : l));
  return [...carrinho, { ...nova, key }];
}

/** +1 / −1; a linha some quando chega a 0. */
export function mudarQuantidade(carrinho: CarrinhoLinha[], key: string, delta: number): CarrinhoLinha[] {
  return carrinho
    .map((l) => (l.key === key ? { ...l, quantidade: l.quantidade + delta } : l))
    .filter((l) => l.quantidade > 0);
}

export const qtdItens = (c: CarrinhoLinha[]) => c.reduce((s, l) => s + l.quantidade, 0);
export const subtotal = (c: CarrinhoLinha[]) => c.reduce((s, l) => s + linhaCentavos(l), 0);

export type Desconto = { tipo: "valor" | "percentual"; valor: number; motivo: string } | null;

/** Desconto em centavos: percentual (0–100) arredondado; nunca passa do subtotal. */
export function descontoCentavos(sub: number, d: Desconto): number {
  if (!d || !(d.valor > 0)) return 0;
  const bruto = d.tipo === "percentual" ? Math.round((sub * Math.min(d.valor, 100)) / 100) : Math.round(d.valor);
  return Math.min(bruto, sub);
}

export function totais(c: CarrinhoLinha[], d: Desconto = null) {
  const sub = subtotal(c);
  const desc = descontoCentavos(sub, d);
  return { itens: qtdItens(c), subtotal: sub, desconto: desc, total: sub - desc };
}

/** Troco só existe quando recebeu mais do que o valor; nunca negativo. */
export const troco = (valor: number, recebido: number) => (recebido > valor ? recebido - valor : 0);

export type PagamentoLinha = { forma_pagamento_id: number; valor_centavos: number; valor_recebido_centavos?: number };
export const restante = (total: number, pags: PagamentoLinha[]) => total - pags.reduce((s, p) => s + p.valor_centavos, 0);

/**
 * Atalhos de nota para o dinheiro: "Exato" + as próximas notas redondas (10, 20, 50, 100, 200),
 * sem repetir e só acima do valor. Ex.: 61,50 → [61,50; 70; 100].
 */
export function atalhosNota(valor: number): number[] {
  if (valor <= 0) return [];
  const out = [valor];
  for (const passo of [1000, 2000, 5000, 10000, 20000]) {
    const v = Math.ceil(valor / passo) * passo;
    if (v > valor && !out.includes(v)) out.push(v);
    if (out.length >= 4) break;
  }
  return out;
}

export function paraItensInput(c: CarrinhoLinha[]): PedidoItemInput[] {
  return c.map((l) => ({
    produto_variante_id: l.produto_variante_id,
    quantidade: l.quantidade,
    observacao: l.observacao.trim() || null,
    escolhas: l.escolhas.map((e) => ({ opcao_escolha_id: e.opcao_escolha_id, quantidade: e.quantidade })),
    adicionais: l.adicionais.map((a) => ({ adicional_variante_id: a.adicional_variante_id, quantidade: a.quantidade })),
  }));
}

/** Resumo de uma linha para mostrar embaixo do nome: "Catupiry · + bacon". */
export function resumoLinha(l: CarrinhoLinha): string {
  return [
    ...l.escolhas.map((e) => (e.quantidade > 1 ? `${e.quantidade}× ${e.nome}` : e.nome)),
    ...l.adicionais.map((a) => `+ ${a.quantidade > 1 ? `${a.quantidade}× ` : ""}${a.nome}`),
    l.observacao.trim() ? `obs.: ${l.observacao.trim()}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

// ——— Rascunho (Esc volta sem perder o carrinho) ———
const chaveRascunho = (modo: string) => `osr:rascunho:${lerUsuario()?.id ?? "anonimo"}:venda-${modo}`;
export function salvarRascunho(c: CarrinhoLinha[], cliente: string, modo = "venda") {
  const CHAVE = chaveRascunho(modo);
  try {
    if (!c.length && !cliente) sessionStorage.removeItem(CHAVE);
    else sessionStorage.setItem(CHAVE, JSON.stringify({ c, cliente }));
  } catch {
    /* sem espaço: segue sem rascunho */
  }
}
export function lerRascunho(modo = "venda"): { c: CarrinhoLinha[]; cliente: string } {
  try {
    const r = JSON.parse(sessionStorage.getItem(chaveRascunho(modo)) || "null");
    if (r && Array.isArray(r.c)) return { c: r.c, cliente: String(r.cliente ?? "") };
  } catch {
    /* rascunho estragado: ignora */
  }
  return { c: [], cliente: "" };
}
