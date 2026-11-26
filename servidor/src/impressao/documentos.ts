import {
  montarCupomComprovante,
  montarCupomConta,
  montarCupomProducao,
  montarCupomTeste,
  montarPulseGaveta,
  type Codificacao,
  type ItemProducaoLinha,
} from "./escpos.js";

function codDe(impressora: { codificacao: string }): Codificacao {
  return (["CP860", "CP850", "CP437"].includes(impressora.codificacao)
    ? impressora.codificacao
    : "CP860") as Codificacao;
}

export function documentoTeste(impressora: {
  nome: string;
  colunas: number;
  codificacao: string;
  tem_guilhotina: boolean;
}): Buffer {
  return montarCupomTeste({
    nome: impressora.nome,
    colunas: impressora.colunas,
    codificacao: codDe(impressora),
    tem_guilhotina: impressora.tem_guilhotina,
  });
}

export function documentoGaveta(): Buffer {
  return montarPulseGaveta();
}

export function documentoProducao(
  impressora: { colunas: number; codificacao: string; tem_guilhotina: boolean },
  opts: {
    codigo_pedido: string;
    codigo_atendimento: string;
    mesa?: string | null;
    tipo_atendimento?: string;
    cancelamento?: boolean;
    itens: ItemProducaoLinha[];
  }
): Buffer {
  return montarCupomProducao({
    colunas: impressora.colunas,
    codificacao: codDe(impressora),
    tem_guilhotina: impressora.tem_guilhotina,
    ...opts,
  });
}

export function documentoConta(
  impressora: { colunas: number; codificacao: string; tem_guilhotina: boolean },
  opts: Parameters<typeof montarCupomConta>[0]
): Buffer {
  return montarCupomConta({
    ...opts,
    colunas: impressora.colunas,
    codificacao: codDe(impressora),
    tem_guilhotina: impressora.tem_guilhotina,
  });
}

export function documentoComprovante(
  impressora: { colunas: number; codificacao: string; tem_guilhotina: boolean },
  opts: Parameters<typeof montarCupomComprovante>[0]
): Buffer {
  return montarCupomComprovante({
    ...opts,
    colunas: impressora.colunas,
    codificacao: codDe(impressora),
    tem_guilhotina: impressora.tem_guilhotina,
  });
}
