import { prisma } from "../db.js";
import {
  configDocumento,
  deveImprimirAgora,
  impressorasProducaoDoPedido,
  resolverDestinosProducao,
  type ImpressoraDestino,
} from "../impressao/destino.js";
import { documentoProducao } from "../impressao/documentos.js";
import { enfileirarTrabalho } from "../impressao/fila.js";

export type ItemRoteavel = {
  id: number;
  cancelado: boolean;
  quantidade: number;
  nome_produto: string;
  observacao: string | null;
  escolhas: { nome_opcao: string; quantidade: number }[];
  adicionais: { nome_adicional: string; quantidade: number }[];
  produto_variante: {
    produto: {
      exige_preparo: boolean;
      categoria_id: number;
      nao_imprime?: boolean;
      categoria?: { nome: string } | null;
    };
  };
};

export type ResultadoImpressao = {
  status: "OK" | "SEM_DESTINO" | "NUNCA" | "ERRO" | "VAZIO";
  trabalhos: number[];
  avisos: string[];
};

function mapItensCupom(itens: ItemRoteavel[]) {
  return itens.map((i) => {
    const linha: {
      quantidade: number;
      nome: string;
      observacao: string | null;
      escolhas: string[];
      adicionais: string[];
      categoria?: string;
    } = {
      quantidade: i.quantidade,
      nome: i.nome_produto,
      observacao: i.observacao,
      escolhas: i.escolhas.map((e) => (e.quantidade > 1 ? `${e.quantidade}x ${e.nome_opcao}` : e.nome_opcao)),
      adicionais: i.adicionais.map((a) => (a.quantidade > 1 ? `${a.quantidade}x ${a.nome_adicional}` : a.nome_adicional)),
    };
    const categoria = i.produto_variante.produto.categoria?.nome;
    if (categoria) linha.categoria = categoria;
    return linha;
  });
}

async function enfileirarVias(opts: {
  impressora: ImpressoraDestino;
  tipo: "PRODUCAO" | "CANCELAMENTO" | "REIMPRESSAO";
  payload: Buffer;
  vias: number;
  pedido_id: number;
  atendimento_id: number;
  documento_origem_id?: number | null;
}) {
  const ids: number[] = [];
  const n = Math.min(3, Math.max(1, opts.vias));
  for (let via = 1; via <= n; via++) {
    const t = await enfileirarTrabalho({
      impressora_id: opts.impressora.id,
      tipo_documento: opts.tipo,
      conteudo: opts.payload,
      pedido_id: opts.pedido_id,
      atendimento_id: opts.atendimento_id,
      via_numero: via,
      documento_origem_id: opts.documento_origem_id ?? null,
    });
    ids.push(t.id);
  }
  return ids;
}

/** Lançamento / cancelamento / reimpressão de produção. */
export async function enfileirarProducaoPedido(opts: {
  pedido_id: number;
  codigo_pedido: string;
  atendimento_id: number;
  codigo_atendimento: string;
  mesa_numero?: number | null;
  tipo_atendimento: string;
  numero_dia?: number | null;
  itens: ItemRoteavel[];
  cancelamento?: boolean;
  reimpressao?: boolean;
  disparo?: "automatico" | "manual";
  garcom_nome?: string | null;
  observacao_atendimento?: string | null;
  motivo_cancelamento?: string | null;
  cancelado_por?: string | null;
  hora_original?: Date | string | null;
}): Promise<ResultadoImpressao> {
  const avisos: string[] = [];
  const disparo = opts.disparo ?? (opts.reimpressao ? "manual" : "automatico");
  const tipoDoc = opts.cancelamento
    ? "CANCELAMENTO"
    : opts.reimpressao
      ? "REIMPRESSAO"
      : "PRODUCAO";

  const cfgDoc = await configDocumento(tipoDoc);
  if (!deveImprimirAgora(cfgDoc?.modo, disparo)) {
    return { status: "NUNCA", trabalhos: [], avisos: [`Documento ${tipoDoc} em modo ${cfgDoc?.modo ?? "NUNCA"}`] };
  }

  const paraImpressao = opts.itens.filter(
    (i) =>
      i.produto_variante.produto.exige_preparo &&
      (opts.cancelamento ? i.cancelado : !i.cancelado)
  );
  if (!paraImpressao.length) return { status: "VAZIO", trabalhos: [], avisos };

  const vias = cfgDoc?.vias ?? 1;
  const porImpressora = new Map<
    number,
    { impressora: ImpressoraDestino; itens: ItemRoteavel[]; motivo: string }
  >();

  // Cancel/reprint: preferir impressoras do job original
  if (opts.cancelamento || opts.reimpressao) {
    const originais = await impressorasProducaoDoPedido(opts.pedido_id);
    if (originais.length) {
      for (const imp of originais) {
        porImpressora.set(imp.id, { impressora: imp, itens: [...paraImpressao], motivo: "origem" });
      }
    }
  }

  if (!porImpressora.size) {
    for (const item of paraImpressao) {
      const catId = item.produto_variante.produto.categoria_id;
      const dest = await resolverDestinosProducao(catId);
      if (dest.pular) {
        avisos.push(`"${item.nome_produto}" não imprime (categoria)`);
        continue;
      }
      if (!dest.impressoras.length) {
        avisos.push(`"${item.nome_produto}" sem impressora de destino`);
        continue;
      }
      for (const imp of dest.impressoras) {
        const bucket = porImpressora.get(imp.id) ?? {
          impressora: imp,
          itens: [],
          motivo: dest.motivo,
        };
        bucket.itens.push(item);
        porImpressora.set(imp.id, bucket);
        if (dest.motivo !== "categoria") {
          avisos.push(`"${item.nome_produto}" → ${imp.nome} (${dest.motivo})`);
        }
      }
    }
  }

  if (!porImpressora.size) {
    return { status: "SEM_DESTINO", trabalhos: [], avisos: [...new Set(avisos)] };
  }

  const trabalhos: number[] = [];
  const origemJob = await prisma.trabalho_impressao.findFirst({
    where: { pedido_id: opts.pedido_id, tipo_documento: "PRODUCAO" },
    orderBy: { criado_em: "asc" },
  });

  for (const { impressora, itens } of porImpressora.values()) {
    const payload = documentoProducao(impressora, {
      codigo_pedido: opts.codigo_pedido,
      codigo_atendimento: opts.codigo_atendimento,
      mesa: opts.mesa_numero != null ? String(opts.mesa_numero) : null,
      tipo_atendimento: opts.tipo_atendimento,
      numero_dia: opts.numero_dia ?? null,
      setor: impressora.nome,
      garcom_nome: opts.garcom_nome ?? null,
      observacao_atendimento: opts.observacao_atendimento ?? null,
      cancelamento: opts.cancelamento ?? false,
      reimpressao: opts.reimpressao ?? false,
      motivo_cancelamento: opts.motivo_cancelamento ?? null,
      cancelado_por: opts.cancelado_por ?? null,
      hora_original: opts.hora_original ?? origemJob?.criado_em ?? null,
      tamanho_letra: impressora.tamanho_letra_producao,
      apita: impressora.apita,
      itens: mapItensCupom(
        [...itens].sort((a, b) =>
          (a.produto_variante.produto.categoria?.nome ?? "").localeCompare(
            b.produto_variante.produto.categoria?.nome ?? "",
            "pt-BR"
          )
        )
      ),
    });

    const ids = await enfileirarVias({
      impressora,
      tipo: tipoDoc,
      payload,
      vias,
      pedido_id: opts.pedido_id,
      atendimento_id: opts.atendimento_id,
      documento_origem_id: origemJob?.id ?? null,
    });
    trabalhos.push(...ids);
  }

  return {
    status: trabalhos.length ? "OK" : "SEM_DESTINO",
    trabalhos,
    avisos: [...new Set(avisos)],
  };
}
