import { lerUsuario } from "../auth/sessao";
/** Regras puras do PDV (sem React), testadas no Vitest. */

export type Opcao = { id: number; nome: string; preco_extra_centavos: number };
export type GrupoEsc = {
  id: number;
  nome: string;
  min_escolhas: number;
  max_escolhas: number;
  permite_repetir: boolean;
  opcoes: Opcao[];
};

export type CarrinhoLinha = {
  key: string;
  produto_variante_id: number;
  nome: string;
  preco_centavos: number;
  quantidade: number;
  observacao: string;
  escolhas: { opcao_escolha_id: number; nome: string; preco_extra_centavos: number; quantidade: number }[];
  adicionais: { adicional_variante_id: number; nome: string; preco_centavos: number; quantidade: number }[];
};

export function linhaCentavos(l: CarrinhoLinha) {
  const extras =
    l.escolhas.reduce((a, e) => a + e.preco_extra_centavos * e.quantidade, 0) +
    l.adicionais.reduce((a, e) => a + e.preco_centavos * e.quantidade, 0);
  return l.quantidade * (l.preco_centavos + extras);
}

/** "escolha 1" · "escolha de 1 a 2" · "opcional · até 2". */
export function resumoGrupo(g: Pick<GrupoEsc, "min_escolhas" | "max_escolhas">) {
  const { min_escolhas: min, max_escolhas: max } = g;
  if (min <= 0) return max === 1 ? "opcional · escolha 1" : `opcional · até ${max}`;
  if (min === max) return `obrigatório · escolha ${min}`;
  return `obrigatório · escolha de ${min} a ${max}`;
}

/**
 * Toque numa opção. Devolve a nova seleção e um aviso quando o toque foi recusado
 * (antes, passar do máximo não fazia nada e o garçom não entendia).
 */
export function alternarEscolha(
  atual: Record<number, number>,
  grupo: GrupoEsc,
  opcaoId: number
): { selecao: Record<number, number>; aviso?: string } {
  const next = { ...atual };
  const qtd = next[opcaoId] ?? 0;
  const doGrupo = grupo.opcoes.reduce((s, o) => s + (next[o.id] ?? 0), 0);

  if (grupo.max_escolhas === 1 && !grupo.permite_repetir) {
    for (const op of grupo.opcoes) delete next[op.id];
    if (!qtd) next[opcaoId] = 1;
    return { selecao: next };
  }
  if (grupo.permite_repetir) {
    if (doGrupo >= grupo.max_escolhas) {
      return { selecao: atual, aviso: `"${grupo.nome}": no máximo ${grupo.max_escolhas}. Toque numa marcada para tirar.` };
    }
    next[opcaoId] = qtd + 1;
    return { selecao: next };
  }
  if (qtd) {
    delete next[opcaoId];
    return { selecao: next };
  }
  if (doGrupo >= grupo.max_escolhas) {
    return {
      selecao: atual,
      aviso: `"${grupo.nome}": no máximo ${grupo.max_escolhas}. Desmarque uma para trocar.`,
    };
  }
  next[opcaoId] = 1;
  return { selecao: next };
}

const CHAVE = (id: number) => `osr:rascunho:${lerUsuario()?.id ?? "anonimo"}:pdv-${id}`;

/** Rascunho do carrinho neste aparelho: não some se a tela apagar ou o garçom sair sem enviar. */
export function lerRascunho(atendimentoId: number): CarrinhoLinha[] {
  try {
    const raw = sessionStorage.getItem(CHAVE(atendimentoId));
    const lista = raw ? (JSON.parse(raw) as CarrinhoLinha[]) : [];
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}

export function gravarRascunho(atendimentoId: number, carrinho: CarrinhoLinha[]) {
  try {
    if (carrinho.length) sessionStorage.setItem(CHAVE(atendimentoId), JSON.stringify(carrinho));
    else sessionStorage.removeItem(CHAVE(atendimentoId));
  } catch {
    /* armazenamento cheio ou bloqueado: segue sem rascunho */
  }
}

export function apagarRascunho(atendimentoId: number) {
  try {
    sessionStorage.removeItem(CHAVE(atendimentoId));
  } catch {
    /* nada */
  }
}
