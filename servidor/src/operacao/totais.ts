/** Calcula totais de um atendimento a partir dos itens (ignora cancelados). */

export type ItemTotavel = {
  cancelado: boolean;
  quantidade: number;
  preco_centavos: number;
  escolhas?: { preco_extra_centavos: number; quantidade: number }[];
  adicionais?: { preco_centavos: number; quantidade: number }[];
};

export function linhaItemCentavos(item: ItemTotavel): number {
  if (item.cancelado) return 0;
  const extrasEscolhas = (item.escolhas ?? []).reduce(
    (s, e) => s + e.preco_extra_centavos * e.quantidade,
    0
  );
  const extrasAd = (item.adicionais ?? []).reduce(
    (s, a) => s + a.preco_centavos * a.quantidade,
    0
  );
  return item.quantidade * (item.preco_centavos + extrasEscolhas + extrasAd);
}

export function subtotalItensCentavos(itens: ItemTotavel[]): number {
  return itens.reduce((s, i) => s + linhaItemCentavos(i), 0);
}

export function totalAtendimentoAberto(opts: {
  itens: ItemTotavel[];
  desconto_centavos: number;
  acrescimo_centavos: number;
  taxa_servico_centavos: number;
  taxa_entrega_centavos: number;
  pago_centavos?: number;
}) {
  const subtotal = subtotalItensCentavos(opts.itens);
  const total = Math.max(
    0,
    subtotal -
      Math.max(0, opts.desconto_centavos) +
      Math.max(0, opts.acrescimo_centavos) +
      Math.max(0, opts.taxa_servico_centavos) +
      Math.max(0, opts.taxa_entrega_centavos)
  );
  const pago = Math.max(0, opts.pago_centavos ?? 0);
  return {
    subtotal_centavos: subtotal,
    total_centavos: total,
    pago_centavos: pago,
    restante_centavos: Math.max(0, total - pago),
  };
}
