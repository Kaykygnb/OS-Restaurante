import {
  montarCupomComprovante,
  montarCupomConta,
  montarCupomProducao,
  montarCupomRelatorioCaixa,
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
  impressora: {
    colunas: number;
    codificacao: string;
    tem_guilhotina: boolean;
    tamanho_letra_producao?: string;
    apita?: boolean;
    nome?: string;
  },
  opts: {
    codigo_pedido: string;
    codigo_atendimento: string;
    mesa?: string | null;
    tipo_atendimento?: string;
    numero_dia?: number | null;
    setor?: string | null;
    garcom_nome?: string | null;
    observacao_atendimento?: string | null;
    cancelamento?: boolean;
    reimpressao?: boolean;
    motivo_cancelamento?: string | null;
    cancelado_por?: string | null;
    hora_original?: Date | string | null;
    tamanho_letra?: string;
    apita?: boolean;
    itens: ItemProducaoLinha[];
  }
): Buffer {
  return montarCupomProducao({
    colunas: impressora.colunas,
    codificacao: codDe(impressora),
    tem_guilhotina: impressora.tem_guilhotina,
    codigo_pedido: opts.codigo_pedido,
    codigo_atendimento: opts.codigo_atendimento,
    mesa: opts.mesa ?? null,
    tipo_atendimento: opts.tipo_atendimento ?? "",
    numero_dia: opts.numero_dia ?? null,
    setor: opts.setor ?? impressora.nome ?? null,
    garcom_nome: opts.garcom_nome ?? null,
    observacao_atendimento: opts.observacao_atendimento ?? null,
    cancelamento: opts.cancelamento ?? false,
    reimpressao: opts.reimpressao ?? false,
    motivo_cancelamento: opts.motivo_cancelamento ?? null,
    cancelado_por: opts.cancelado_por ?? null,
    hora_original: opts.hora_original ?? null,
    tamanho_letra: opts.tamanho_letra ?? impressora.tamanho_letra_producao ?? "GRANDE",
    apita: opts.apita ?? impressora.apita ?? false,
    itens: opts.itens,
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

export function documentoRelatorioCaixa(
  impressora: { colunas: number; codificacao: string; tem_guilhotina: boolean },
  opts: {
    titulo: string;
    operador: string;
    linhas: { texto: string; valor_centavos?: number }[];
  }
): Buffer {
  return montarCupomRelatorioCaixa({
    colunas: impressora.colunas,
    codificacao: codDe(impressora),
    tem_guilhotina: impressora.tem_guilhotina,
    ...opts,
  });
}
