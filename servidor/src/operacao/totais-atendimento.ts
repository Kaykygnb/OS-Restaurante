import { prisma } from "../db.js";
import { totalAtendimentoAberto, type ItemTotavel } from "./totais.js";

export async function percentualTaxaServico() {
  const cfg = await prisma.configuracao.findFirst({ orderBy: { id: "asc" } });
  return cfg?.taxa_servico_percentual ?? 10;
}

export function pagoEfetivoCentavos(
  pagamentos: { valor_centavos: number; estornado_em?: Date | null }[]
) {
  return pagamentos
    .filter((p) => !p.estornado_em)
    .reduce((s, p) => s + p.valor_centavos, 0);
}

export async function calcularTotaisAtendimento(at: {
  desconto_centavos: number;
  acrescimo_centavos: number;
  taxa_servico_aplicada: boolean;
  taxa_entrega_centavos: number;
  pedidos: { itens: ItemTotavel[] }[];
  pagamentos: { valor_centavos: number; estornado_em?: Date | null }[];
}) {
  const pct = await percentualTaxaServico();
  const itens = at.pedidos.flatMap((p) => p.itens);
  const pago = pagoEfetivoCentavos(at.pagamentos);
  return totalAtendimentoAberto({
    itens,
    desconto_centavos: at.desconto_centavos,
    acrescimo_centavos: at.acrescimo_centavos,
    taxa_servico_aplicada: at.taxa_servico_aplicada,
    taxa_servico_percentual: pct,
    taxa_entrega_centavos: at.taxa_entrega_centavos,
    pago_centavos: pago,
  });
}
