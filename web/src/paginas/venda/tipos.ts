/** Formato de GET /cardapio/pdv (rota de hoje). */
import type { GrupoEsc } from "../pdv-regras";

export type AdicionalPdv = { id: number; nome: string; qtd_max: number; variantes: { id: number; nome: string; preco_centavos: number; esgotado?: boolean }[] };
export type VariantePdv = { id: number; nome: string; preco_centavos: number; grupos_escolhas: GrupoEsc[]; esgotado?: boolean };
export type ProdutoPdv = {
  id: number;
  nome: string;
  descricao: string | null;
  variantes: VariantePdv[];
  grupos_adicionais: { id: number; nome: string; adicionais: AdicionalPdv[] }[];
  preco_desde_centavos: number;
  esgotado?: boolean;
};
export type CategoriaPdv = { id: number; nome: string; produtos: ProdutoPdv[] };

/**
 * Toque rápido: só abre a janela quando a pessoa PRECISA decidir (tamanho ou escolha obrigatória).
 * Adicional é opcional: entra direto e dá para mudar depois em "Opções" na linha do carrinho.
 * `varianteId` vem do atalho dos mais vendidos (já diz o tamanho).
 */
export function precisaOpcoes(p: ProdutoPdv, varianteId?: number): boolean {
  const v = varianteId ? p.variantes.find((x) => x.id === varianteId) : undefined;
  if (!v && p.variantes.length > 1) return true;
  const alvo = v ?? p.variantes[0];
  return alvo.grupos_escolhas.some((g) => g.min_escolhas > 0);
}

export const temOpcoes = (p: ProdutoPdv) =>
  p.variantes.length > 1 || p.variantes.some((v) => v.grupos_escolhas.length > 0) || p.grupos_adicionais.some((g) => g.adicionais.length > 0);

export const nomeVariante = (p: ProdutoPdv, v: VariantePdv) => (p.variantes.length > 1 && v.nome !== "Padrão" ? `${p.nome} ${v.nome}` : p.nome);

export function esgotadoProduto(p: ProdutoPdv): boolean {
  return !!p.esgotado || p.variantes.every((v) => v.esgotado);
}
