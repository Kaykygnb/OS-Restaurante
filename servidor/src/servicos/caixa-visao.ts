import { prisma } from "../db.js";
import { inicioDoDiaLocal } from "../util/horario.js";

export type LinhaForma = {
  forma_pagamento_id: number;
  nome: string;
  eh_dinheiro: boolean;
  esperado_centavos: number;
};

export function sessaoDeOutroDia(abertoEm: Date) {
  return abertoEm.getTime() < inicioDoDiaLocal().getTime();
}

export async function esperadoPorForma(sessaoId: number): Promise<LinhaForma[]> {
  const sessao = await prisma.caixa_sessao.findUnique({
    where: { id: sessaoId },
    include: { pagamentos: { include: { forma_pagamento: true } }, movimentacoes: true },
  });
  if (!sessao) return [];
  const formas = await prisma.forma_pagamento.findMany({ where: { ativo: true }, orderBy: { ordem: "asc" } });
  const sangrias = sessao.movimentacoes.filter((m) => m.tipo === "SANGRIA").reduce((s, m) => s + m.valor_centavos, 0);
  const suprimentos = sessao.movimentacoes.filter((m) => m.tipo === "SUPRIMENTO").reduce((s, m) => s + m.valor_centavos, 0);
  return formas.map((forma) => {
    const soma = sessao.pagamentos
      .filter((p) => !p.estornado_em && p.forma_pagamento_id === forma.id)
      .reduce((s, p) => s + p.valor_centavos, 0);
    const esperado = forma.eh_dinheiro ? sessao.fundo_troco_centavos + soma - sangrias + suprimentos : soma;
    return {
      forma_pagamento_id: forma.id,
      nome: forma.nome,
      eh_dinheiro: forma.eh_dinheiro,
      esperado_centavos: esperado,
    };
  });
}

export function apresentarFormas(
  linhas: (LinhaForma & { contado_centavos?: number; diferenca_centavos?: number })[],
  gestor: boolean,
  comContagem: boolean
) {
  return linhas.map((linha) => {
    if (!gestor) {
      return comContagem
        ? { forma_pagamento_id: linha.forma_pagamento_id, nome: linha.nome, contado_centavos: linha.contado_centavos ?? 0 }
        : { forma_pagamento_id: linha.forma_pagamento_id, nome: linha.nome };
    }
    return {
      forma_pagamento_id: linha.forma_pagamento_id,
      nome: linha.nome,
      esperado_centavos: linha.esperado_centavos,
      ...(comContagem
        ? { contado_centavos: linha.contado_centavos ?? 0, diferenca_centavos: linha.diferenca_centavos ?? 0 }
        : {}),
    };
  });
}

export function sessaoParaTela<T extends Record<string, unknown>>(sessao: T | null, gestor: boolean) {
  if (!sessao || gestor) return sessao;
  const copia = { ...sessao };
  delete copia.valor_esperado_centavos;
  delete copia.diferenca_centavos;
  delete copia.contagem_json;
  return copia;
}
