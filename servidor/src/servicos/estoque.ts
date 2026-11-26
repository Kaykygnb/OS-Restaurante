import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../db.js";
import { ErroRegra } from "../util/erros.js";

type Db = Prisma.TransactionClient | typeof prisma;

export async function configEstoque(db: Db) {
  const cfg = await db.configuracao.findFirst({ orderBy: { id: "asc" } });
  return {
    nivel: cfg?.estoque_nivel ?? 0,
    permiteNegativo: cfg?.estoque_permite_negativo ?? false,
    resetDia: cfg?.estoque_reset_esgotados_dia ?? true,
  };
}

async function saldoDe(db: Db, itemId: number) {
  const saldo = await db.saldo_estoque.findUnique({
    where: { item_tipo_item_id: { item_tipo: "produto_variante", item_id: itemId } },
  });
  return saldo?.qtd_base ?? 0;
}

async function gravarSaldo(db: Db, itemId: number, qtd: number) {
  await db.saldo_estoque.upsert({
    where: { item_tipo_item_id: { item_tipo: "produto_variante", item_id: itemId } },
    create: { item_tipo: "produto_variante", item_id: itemId, qtd_base: qtd },
    update: { qtd_base: qtd },
  });
}

export async function baixarVenda(
  db: Db,
  itens: {
    pedido_item_id: number;
    produto_variante_id: number;
    quantidade: number;
    controla_estoque: boolean;
    nome: string;
  }[],
  usuarioId: number
) {
  const cfg = await configEstoque(db);
  if (cfg.nivel < 2) return;
  const faltas: { produto_variante_id: number; nome: string; saldo_base: number; pedido_base: number }[] = [];
  const planos: { item: (typeof itens)[number]; saldo: number }[] = [];
  for (const item of itens) {
    if (!item.controla_estoque) continue;
    const saldo = await saldoDe(db, item.produto_variante_id);
    if (!cfg.permiteNegativo && saldo < item.quantidade) {
      faltas.push({
        produto_variante_id: item.produto_variante_id,
        nome: item.nome,
        saldo_base: saldo,
        pedido_base: item.quantidade,
      });
    }
    planos.push({ item, saldo });
  }
  if (faltas.length) {
    throw new ErroRegra(409, "sem_estoque", "Não há saldo para concluir a venda.", { itens: faltas });
  }
  for (const { item, saldo } of planos) {
    const novo = saldo - item.quantidade;
    await db.movimento_estoque.create({
      data: {
        item_tipo: "produto_variante",
        item_id: item.produto_variante_id,
        tipo: "VENDA",
        qtd_base: -item.quantidade,
        pedido_item_id: item.pedido_item_id,
        usuario_id: usuarioId,
      },
    });
    await gravarSaldo(db, item.produto_variante_id, novo);
    if (novo <= 0 && !cfg.permiteNegativo) {
      await db.produto_variante.update({
        where: { id: item.produto_variante_id },
        data: { esgotado: true, esgotado_em: new Date(), esgotado_origem: "saldo", esgotado_por_id: usuarioId },
      });
    }
  }
}

export async function estornarItem(db: Db, pedidoItemId: number, usuarioId: number) {
  const cfg = await configEstoque(db);
  if (cfg.nivel < 2) return;
  const vendas = await db.movimento_estoque.findMany({
    where: { pedido_item_id: pedidoItemId, tipo: "VENDA" },
  });
  for (const venda of vendas) {
    const saldo = await saldoDe(db, venda.item_id);
    const devolve = Math.abs(venda.qtd_base);
    const novo = saldo + devolve;
    await db.movimento_estoque.create({
      data: {
        item_tipo: venda.item_tipo,
        item_id: venda.item_id,
        tipo: "ESTORNO_VENDA",
        qtd_base: devolve,
        pedido_item_id: pedidoItemId,
        usuario_id: usuarioId,
      },
    });
    await gravarSaldo(db, venda.item_id, novo);
    if (novo > 0) {
      await db.produto_variante.updateMany({
        where: { id: venda.item_id, esgotado_origem: "saldo" },
        data: { esgotado: false, esgotado_em: null, esgotado_origem: null, esgotado_por_id: null },
      });
    }
  }
}

export async function resetarEsgotados(db: Db) {
  const limpo = { esgotado: false, esgotado_em: null, esgotado_origem: null, esgotado_por_id: null };
  await db.produto.updateMany({ where: { esgotado: true }, data: limpo });
  await db.produto_variante.updateMany({ where: { esgotado: true }, data: limpo });
  await db.adicional_variante.updateMany({ where: { esgotado: true }, data: limpo });
  await db.opcao_escolha.updateMany({ where: { esgotado: true }, data: limpo });
}

export async function lancarMovimento(
  db: Db,
  opts: {
    tipo: "ENTRADA" | "PERDA" | "CORRECAO";
    item_id: number;
    qtd_base: number;
    motivo?: string | null;
    custo_unit_centavos?: number | null;
    usuario_id: number;
    aprovador_id?: number | null;
  }
) {
  const cfg = await configEstoque(db);
  if (cfg.nivel < 2) {
    throw new ErroRegra(409, "estoque_desligado", "O controle de quantidade está desligado.");
  }
  const variante = await db.produto_variante.findUnique({
    where: { id: opts.item_id },
    include: { produto: true },
  });
  if (!variante?.produto.controla_estoque) {
    throw new ErroRegra(400, "item_sem_controle", "Esse produto não controla estoque.");
  }
  let delta = opts.qtd_base;
  if (opts.tipo === "ENTRADA") delta = Math.abs(delta);
  if (opts.tipo === "PERDA") delta = -Math.abs(delta);
  const saldo = await saldoDe(db, opts.item_id);
  const novo = saldo + delta;
  if (novo < 0 && !cfg.permiteNegativo && opts.tipo !== "CORRECAO") {
    throw new ErroRegra(409, "sem_estoque", "O saldo ficaria negativo.", {
      itens: [{ produto_variante_id: opts.item_id, nome: variante.produto.nome, saldo_base: saldo, pedido_base: Math.abs(delta) }],
    });
  }
  const mov = await db.movimento_estoque.create({
    data: {
      item_tipo: "produto_variante",
      item_id: opts.item_id,
      tipo: opts.tipo,
      qtd_base: delta,
      motivo: opts.motivo ?? null,
      custo_unit_centavos: opts.custo_unit_centavos ?? null,
      usuario_id: opts.usuario_id,
      aprovador_id: opts.aprovador_id ?? null,
    },
  });
  await gravarSaldo(db, opts.item_id, novo);
  if (novo <= 0 && !cfg.permiteNegativo) {
    await db.produto_variante.update({
      where: { id: opts.item_id },
      data: { esgotado: true, esgotado_em: new Date(), esgotado_origem: "saldo", esgotado_por_id: opts.usuario_id },
    });
  } else if (novo > 0) {
    await db.produto_variante.updateMany({
      where: { id: opts.item_id, esgotado_origem: "saldo" },
      data: { esgotado: false, esgotado_em: null, esgotado_origem: null, esgotado_por_id: null },
    });
  }
  return mov;
}
