/** Calcula totais de um atendimento a partir dos itens (ignora cancelados). */

export type ItemTotavel = {
  cancelado: boolean;
  quantidade: number;
  preco_centavos: number;
  preco_original_centavos?: number | null;
  desconto_promocao_centavos?: number | null;
  desconto_manual_centavos?: number | null;
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
  const unitario = item.preco_original_centavos ?? item.preco_centavos;
  const bruto = item.quantidade * (unitario + extrasEscolhas + extrasAd);
  const promo = Math.max(0, item.desconto_promocao_centavos ?? 0);
  const manual = Math.max(0, item.desconto_manual_centavos ?? 0);
  return Math.max(0, bruto - promo - manual);
}

export function subtotalItensCentavos(itens: ItemTotavel[]): number {
  return itens.reduce((s, i) => s + linhaItemCentavos(i), 0);
}

/** Taxa de serviço sobre o subtotal já líquido (depois do desconto da conta). */
export function taxaServicoCentavos(subtotalLiquido: number, aplicada: boolean, percentual: number): number {
  if (!aplicada) return 0;
  const pct = Math.max(0, percentual);
  return Math.round(Math.max(0, subtotalLiquido) * (pct / 100));
}

export function descontoContaCentavos(opts: {
  subtotal: number;
  desconto_centavos: number;
  desconto_tipo?: string | null;
  desconto_percentual?: number | null;
}) {
  if (opts.desconto_tipo === "PERCENTUAL") {
    const pct = Math.max(0, opts.desconto_percentual ?? 0);
    return Math.min(opts.subtotal, Math.round(opts.subtotal * (pct / 100)));
  }
  return Math.min(opts.subtotal, Math.max(0, opts.desconto_centavos));
}

export function totalAtendimentoAberto(opts: {
  itens: ItemTotavel[];
  desconto_centavos: number;
  desconto_tipo?: string | null;
  desconto_percentual?: number | null;
  acrescimo_centavos: number;
  /** Preferir flag + percentual; taxa_servico_centavos só como fallback legado. */
  taxa_servico_aplicada?: boolean;
  taxa_servico_percentual?: number;
  taxa_servico_centavos?: number;
  taxa_entrega_centavos: number;
  tipo_atendimento?: string | null;
  pago_centavos?: number;
}) {
  const subtotal = subtotalItensCentavos(opts.itens);
  const desconto = descontoContaCentavos({
    subtotal,
    desconto_centavos: opts.desconto_centavos,
    desconto_tipo: opts.desconto_tipo ?? null,
    desconto_percentual: opts.desconto_percentual ?? null,
  });
  const liquido = subtotal - desconto;
  const mesa = opts.tipo_atendimento == null || opts.tipo_atendimento === "MESA";
  const taxa =
    opts.taxa_servico_aplicada !== undefined
      ? mesa
        ? taxaServicoCentavos(liquido, opts.taxa_servico_aplicada, opts.taxa_servico_percentual ?? 10)
        : 0
      : Math.max(0, opts.taxa_servico_centavos ?? 0);

  const total = Math.max(
    0,
    liquido + Math.max(0, opts.acrescimo_centavos) + taxa + Math.max(0, opts.taxa_entrega_centavos)
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
