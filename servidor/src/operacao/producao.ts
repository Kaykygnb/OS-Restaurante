import { prisma } from "../db.js";
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
    produto: { exige_preparo: boolean; categoria_id: number };
  };
};

/** Agrupa itens de preparo por impressora; sem mapa → impressora da conta + aviso. */
export async function enfileirarProducaoPedido(opts: {
  pedido_id: number;
  codigo_pedido: string;
  atendimento_id: number;
  codigo_atendimento: string;
  mesa_numero?: number | null;
  tipo_atendimento: string;
  itens: ItemRoteavel[];
  cancelamento?: boolean;
}) {
  const avisos: string[] = [];
  const paraImpressao = opts.itens.filter(
    (i) => i.produto_variante.produto.exige_preparo && (opts.cancelamento ? i.cancelado : !i.cancelado)
  );
  if (!paraImpressao.length) return { trabalhos: [] as number[], avisos };

  const config = await prisma.configuracao.findFirst({ orderBy: { id: "asc" } });
  const mapa = await prisma.impressora_categoria.findMany({
    where: { impressora: { ativo: true } },
    include: { impressora: true },
  });

  const porImpressora = new Map<number, { impressora: (typeof mapa)[0]["impressora"]; itens: ItemRoteavel[] }>();

  for (const item of paraImpressao) {
    const catId = item.produto_variante.produto.categoria_id;
    const destinos = mapa.filter((m) => m.categoria_id === catId);
    if (destinos.length) {
      for (const d of destinos) {
        const bucket = porImpressora.get(d.impressora_id) ?? {
          impressora: d.impressora,
          itens: [],
        };
        bucket.itens.push(item);
        porImpressora.set(d.impressora_id, bucket);
      }
    } else if (config?.impressora_conta_id) {
      const imp =
        mapa.find((m) => m.impressora_id === config.impressora_conta_id)?.impressora ??
        (await prisma.impressora.findFirst({
          where: { id: config.impressora_conta_id, ativo: true },
        }));
      if (imp) {
        const bucket = porImpressora.get(imp.id) ?? { impressora: imp, itens: [] };
        bucket.itens.push(item);
        porImpressora.set(imp.id, bucket);
        avisos.push(
          `"${item.nome_produto}" sem impressora de categoria — enviado para impressora da conta (${imp.nome})`
        );
      } else {
        avisos.push(`"${item.nome_produto}" sem impressora de produção nem impressora da conta`);
      }
    } else {
      avisos.push(
        `"${item.nome_produto}" sem impressora de categoria e sem impressora da conta configurada`
      );
    }
  }

  const trabalhos: number[] = [];
  for (const { impressora, itens } of porImpressora.values()) {
    const payload = documentoProducao(impressora, {
      codigo_pedido: opts.codigo_pedido,
      codigo_atendimento: opts.codigo_atendimento,
      mesa: opts.mesa_numero != null ? String(opts.mesa_numero) : null,
      tipo_atendimento: opts.tipo_atendimento,
      cancelamento: opts.cancelamento,
      itens: itens.map((i) => ({
        quantidade: i.quantidade,
        nome: i.nome_produto,
        observacao: i.observacao,
        escolhas: i.escolhas.map((e) =>
          e.quantidade > 1 ? `${e.quantidade}x ${e.nome_opcao}` : e.nome_opcao
        ),
        adicionais: i.adicionais.map((a) =>
          a.quantidade > 1 ? `${a.quantidade}x ${a.nome_adicional}` : a.nome_adicional
        ),
      })),
    });
    const t = await enfileirarTrabalho({
      impressora_id: impressora.id,
      tipo_documento: "PRODUCAO",
      conteudo: payload,
      pedido_id: opts.pedido_id,
      atendimento_id: opts.atendimento_id,
    });
    trabalhos.push(t.id);
  }

  return { trabalhos, avisos: [...new Set(avisos)] };
}
