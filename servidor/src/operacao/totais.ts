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

/** Taxa de serviço sempre recalculada do subtotal atual quando aplicada. */
export function taxaServicoCentavos(subtotal: number, aplicada: boolean, percentual: number): number {
  if (!aplicada) return 0;
  const pct = Math.max(0, percentual);
  return Math.round(subtotal * (pct / 100));
}

export function totalAtendimentoAberto(opts: {
  itens: ItemTotavel[];
  desconto_centavos: number;
  acrescimo_centavos: number;
  /** Preferir flag + percentual; taxa_servico_centavos só como fallback legado. */
  taxa_servico_aplicada?: boolean;
  taxa_servico_percentual?: number;
  taxa_servico_centavos?: number;
  taxa_entrega_centavos: number;
  pago_centavos?: number;
}) {
  const subtotal = subtotalItensCentavos(opts.itens);
  const desconto = Math.min(Math.max(0, opts.desconto_centavos), subtotal);
  const taxa =
    opts.taxa_servico_aplicada !== undefined
      ? taxaServicoCentavos(subtotal, opts.taxa_servico_aplicada, opts.taxa_servico_percentual ?? 10)
      : Math.max(0, opts.taxa_servico_centavos ?? 0);

  const total = Math.max(
    0,
    subtotal -
      desconto +
      Math.max(0, opts.acrescimo_centavos) +
      taxa +
      Math.max(0, opts.taxa_entrega_centavos)
  );
  const pago = Math.max(0, opts.pago_centavos ?? 0);
  return {
    subtotal_centavos: subtotal,
    desconto_centavos: desconto,
    taxa_servico_centavos: taxa,
    total_centavos: total,
    pago_centavos: pago,
    restante_centavos: Math.max(0, total - pago),
  };
}
