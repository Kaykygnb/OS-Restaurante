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
 * Abre a montagem se há algo a configurar: tamanho (sem variante pré-escolhida),
 * grupo de escolhas ou adicionais. Nos mais vendidos a variante já vem definida.
 */
export function precisaOpcoes(p: ProdutoPdv, varianteId?: number): boolean {
  const v = varianteId ? p.variantes.find((x) => x.id === varianteId) : undefined;
  if (!v && p.variantes.length > 1) return true;
  const alvo = v ?? p.variantes[0];
  if (!alvo) return false;
  if (alvo.grupos_escolhas.length > 0) return true;
  if (p.grupos_adicionais.some((g) => g.adicionais.length > 0)) return true;
  return false;
}

export const temOpcoes = (p: ProdutoPdv) =>
  p.variantes.length > 1 || p.variantes.some((v) => v.grupos_escolhas.length > 0) || p.grupos_adicionais.some((g) => g.adicionais.length > 0);

export const nomeVariante = (p: ProdutoPdv, v: VariantePdv) => (p.variantes.length > 1 && v.nome !== "Padrão" ? `${p.nome} ${v.nome}` : p.nome);

export function esgotadoProduto(p: ProdutoPdv): boolean {
  return !!p.esgotado || p.variantes.every((v) => v.esgotado);
}
