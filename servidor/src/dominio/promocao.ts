import { partesLocais } from "../util/horario.js";

export type AlvoPromo = {
  produto_id: number | null;
  produto_variante_id: number | null;
  categoria_id: number | null;
};

export type Promo = {
  id: number;
  nome: string;
  tipo: string;
  percentual: number | null;
  valor_centavos: number | null;
  preco_fixo_centavos: number | null;
  leve: number | null;
  pague: number | null;
  inicio_em: Date | null;
  fim_em: Date | null;
  dias_semana: number;
  hora_inicio_min: number | null;
  hora_fim_min: number | null;
  tipos_atendimento: string;
  limite_por_atendimento: number | null;
  limite_total: number | null;
  usos: number;
  acumulavel: boolean;
  prioridade: number;
  inclui_extras: boolean;
  ativo: boolean;
  alvos: AlvoPromo[];
};

export type LinhaPromo = {
  produto_id: number;
  produto_variante_id: number;
  categoria_id: number;
  quantidade: number;
  preco_centavos: number;
  extras_centavos: number;
};

export type PromoAplicada = {
  desconto_centavos: number;
  promocao_id: number | null;
  nome_promocao: string | null;
};

function casaAlvo(linha: LinhaPromo, alvo: AlvoPromo) {
  if (alvo.produto_variante_id != null) return alvo.produto_variante_id === linha.produto_variante_id;
  if (alvo.produto_id != null) return alvo.produto_id === linha.produto_id;
  if (alvo.categoria_id != null) return alvo.categoria_id === linha.categoria_id;
  return false;
}

export function promocaoVigente(p: Promo, agora: Date, tipoAtendimento: string) {
  if (!p.ativo) return false;
  if (p.inicio_em && agora < p.inicio_em) return false;
  if (p.fim_em && agora > p.fim_em) return false;
  if (p.limite_total != null && p.usos >= p.limite_total) return false;
  const tipos = p.tipos_atendimento.split(",").map((t) => t.trim()).filter(Boolean);
  const listaAntiga = ["MESA", "BALCAO", "RETIRADA", "ENTREGA"].every((t) => tipos.includes(t));
  const valeNaVendaRapida = tipoAtendimento === "VENDA_RAPIDA" && listaAntiga && !tipos.includes("VENDA_RAPIDA");
  if (tipos.length && !tipos.includes(tipoAtendimento) && !valeNaVendaRapida) return false;
  const { minutoDia, diaSemana } = partesLocais(agora);
  if ((p.dias_semana & (1 << diaSemana)) === 0) return false;
  if (p.hora_inicio_min != null && p.hora_fim_min != null) {
    const ini = p.hora_inicio_min;
    const fim = p.hora_fim_min;
    const dentro = ini <= fim ? minutoDia >= ini && minutoDia < fim : minutoDia >= ini || minutoDia < fim;
    if (!dentro) return false;
  }
  return true;
}

function baseLinha(linha: LinhaPromo, incluiExtras: boolean) {
  const extras = incluiExtras ? linha.extras_centavos * linha.quantidade : 0;
  return linha.preco_centavos * linha.quantidade + extras;
}

function descontoSimples(p: Promo, linha: LinhaPromo) {
  const qtd = p.limite_por_atendimento != null ? Math.min(linha.quantidade, p.limite_por_atendimento) : linha.quantidade;
  if (qtd <= 0) return 0;
  const parcial = { ...linha, quantidade: qtd };
  const base = baseLinha(parcial, p.inclui_extras);
  if (p.tipo === "PERCENTUAL") {
    const pct = Math.max(0, p.percentual ?? 0);
    return Math.min(base, Math.round(base * (pct / 100)));
  }
  if (p.tipo === "VALOR") {
    return Math.min(base, Math.max(0, p.valor_centavos ?? 0) * qtd);
  }
  if (p.tipo === "PRECO_FIXO") {
    const fixo = Math.max(0, p.preco_fixo_centavos ?? linha.preco_centavos);
    return Math.min(base, Math.max(0, linha.preco_centavos - fixo) * qtd);
  }
  return 0;
}

function descontoLevePague(p: Promo, linhas: LinhaPromo[]) {
  const leve = p.leve ?? 0;
  const pague = p.pague ?? 0;
  const vetor = linhas.map(() => 0);
  if (leve <= 1 || pague < 0 || pague >= leve) return vetor;
  const unidades: { linha: number; preco: number }[] = [];
  linhas.forEach((linha, i) => {
    if (!p.alvos.some((a) => casaAlvo(linha, a))) return;
    const limite = p.limite_por_atendimento ?? linha.quantidade;
    const qtd = Math.min(linha.quantidade, limite);
    for (let n = 0; n < qtd; n++) unidades.push({ linha: i, preco: linha.preco_centavos });
  });
  unidades.sort((a, b) => a.preco - b.preco);
  const grupos = Math.floor(unidades.length / leve);
  const gratis = grupos * (leve - pague);
  for (let i = 0; i < gratis; i++) {
    const u = unidades[i];
    if (!u) break;
    vetor[u.linha] = (vetor[u.linha] ?? 0) + u.preco;
  }
  return vetor;
}

export function aplicarPromocoes(linhas: LinhaPromo[], promos: Promo[], agora: Date, tipoAtendimento: string): PromoAplicada[] {
  const vigentes = promos.filter((p) => promocaoVigente(p, agora, tipoAtendimento) && p.alvos.length);
  const porPromo = vigentes.map((p) => {
    if (p.tipo === "LEVE_PAGUE") return descontoLevePague(p, linhas);
    return linhas.map((linha) => (p.alvos.some((a) => casaAlvo(linha, a)) ? descontoSimples(p, linha) : 0));
  });

  return linhas.map((linha, i) => {
    const teto = linha.preco_centavos * linha.quantidade + linha.extras_centavos * linha.quantidade;
    let melhorNao = 0;
    let promoNao: Promo | null = null;
    let somaAcum = 0;
    let maiorAcum = 0;
    let promoAcum: Promo | null = null;
    for (let pi = 0; pi < vigentes.length; pi++) {
      const p = vigentes[pi]!;
      const d = Math.min(teto, porPromo[pi]?.[i] ?? 0);
      if (d <= 0) continue;
      if (p.acumulavel) {
        somaAcum += d;
        if (d > maiorAcum) {
          maiorAcum = d;
          promoAcum = p;
        }
      } else if (d > melhorNao || (d === melhorNao && p.prioridade > (promoNao?.prioridade ?? -1))) {
        melhorNao = d;
        promoNao = p;
      }
    }
    somaAcum = Math.min(teto, somaAcum);
    if (somaAcum > melhorNao && promoAcum) {
      return { desconto_centavos: somaAcum, promocao_id: promoAcum.id, nome_promocao: promoAcum.nome };
    }
    if (melhorNao > 0 && promoNao) {
      return { desconto_centavos: melhorNao, promocao_id: promoNao.id, nome_promocao: promoNao.nome };
    }
    return { desconto_centavos: 0, promocao_id: null, nome_promocao: null };
  });
}
