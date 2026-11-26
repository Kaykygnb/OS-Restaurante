import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

/** Mesa só fica ocupada com item ativo: sem itens, encerra a conta MESA aberta. */
export async function liberarMesaSeSemItens(db: Db, atendimentoId: number) {
  const at = await db.atendimento.findUnique({
    where: { id: atendimentoId },
    select: {
      id: true,
      status: true,
      tipo_atendimento: true,
      mesa_id: true,
      observacao: true,
      pedidos: {
        select: {
          itens: { where: { cancelado: false }, select: { id: true }, take: 1 },
        },
      },
    },
  });
  if (!at || at.status !== "ABERTO" || at.tipo_atendimento !== "MESA" || !at.mesa_id) return null;
  if (at.pedidos.some((p: { itens: { id: number }[] }) => p.itens.length > 0)) return null;

  return db.atendimento.update({
    where: { id: at.id },
    data: {
      status: "CANCELADO",
      fechado_em: new Date(),
      observacao: [at.observacao, "Cancelado: sem itens na mesa"].filter(Boolean).join(" | "),
    },
  });
}
