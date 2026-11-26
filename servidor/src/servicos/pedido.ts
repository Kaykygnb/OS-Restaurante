import type { Prisma } from "../generated/prisma/client.js";
import { proximoCodigo } from "../operacao/sequencia.js";
import { ErroRegra } from "../util/erros.js";
import { baixarVenda } from "./estoque.js";
import { prepararItens, type ItemEntrada } from "./itens-pedido.js";

type Db = Prisma.TransactionClient;

const includeItem = {
  escolhas: true,
  adicionais: true,
  produto_variante: {
    select: {
      id: true,
      produto: {
        select: {
          id: true,
          exige_preparo: true,
          categoria_id: true,
          controla_estoque: true,
          categoria: { select: { id: true, nome: true, nao_imprime: true } },
        },
      },
    },
  },
} as const;

export async function gravarPedido(
  tx: Db,
  opts: {
    atendimentoId: number;
    usuarioId: number;
    itens: ItemEntrada[];
    tipoAtendimento: string;
    agora?: Date;
  }
) {
  const at = await tx.atendimento.findUnique({ where: { id: opts.atendimentoId } });
  if (!at || at.status !== "ABERTO") {
    throw new ErroRegra(409, "atendimento_fechado", "Essa conta não está aberta.");
  }
  const preparados = await prepararItens(tx, opts.itens, {
    tipoAtendimento: opts.tipoAtendimento,
    agora: opts.agora ?? new Date(),
  });
  const codigo = await proximoCodigo(tx, "PEDIDO", "PD");
  const pedido = await tx.pedido.create({
    data: {
      codigo_pedido: codigo,
      atendimento_id: opts.atendimentoId,
      itens: {
        create: preparados.map((i) => ({
          nome_produto: i.nome_produto,
          preco_centavos: i.preco_centavos,
          preco_original_centavos: i.preco_original_centavos,
          desconto_promocao_centavos: i.desconto_promocao_centavos,
          promocao_id: i.promocao_id,
          nome_promocao: i.nome_promocao,
          quantidade: i.quantidade,
          observacao: i.observacao,
          produto_variante_id: i.produto_variante_id,
          escolhas: { create: i.escolhas },
          adicionais: { create: i.adicionais },
        })),
      },
    },
    include: { itens: { include: includeItem } },
  });
  await baixarVenda(
    tx,
    pedido.itens.map((item) => ({
      pedido_item_id: item.id,
      produto_variante_id: item.produto_variante_id,
      quantidade: item.quantidade,
      controla_estoque: item.produto_variante.produto.controla_estoque,
      nome: item.nome_produto,
    })),
    opts.usuarioId
  );
  return pedido;
}

export async function proximoNumeroDia(tx: Db, caixaId: number) {
  const max = await tx.atendimento.aggregate({
    where: { caixa_sessao_id: caixaId },
    _max: { numero_dia: true },
  });
  return (max._max.numero_dia ?? 0) + 1;
}
