import type { Prisma } from "../generated/prisma/client.js";

type Tx = Prisma.TransactionClient;

/** Incrementa contador na mesma transação e devolve código tipo AT0001 / PD0001. */
export async function proximoCodigo(tx: Tx, nome: "ATENDIMENTO" | "PEDIDO", prefixo: string) {
  const atual = await tx.sequencia.findUnique({ where: { nome } });
  const proximo = (atual?.ultimo ?? 0) + 1;
  if (atual) {
    await tx.sequencia.update({ where: { nome }, data: { ultimo: proximo } });
  } else {
    await tx.sequencia.create({ data: { nome, ultimo: proximo } });
  }
  return `${prefixo}${String(proximo).padStart(4, "0")}`;
}
