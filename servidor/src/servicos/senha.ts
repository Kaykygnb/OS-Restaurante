import type { Prisma } from "../generated/prisma/client.js";

type Db = Prisma.TransactionClient;

export function diaOperacaoSP(data = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(data);
}

/** Próxima senha do balcão no dia de operação. O índice único impede repetir. */
export async function reservarSenhaBalcao(tx: Db) {
  const dia_operacao = diaOperacaoSP();
  const max = await tx.atendimento.aggregate({
    where: { tipo_atendimento: "BALCAO", dia_operacao },
    _max: { numero_dia: true },
  });
  return { dia_operacao, numero_dia: (max._max.numero_dia ?? 0) + 1 };
}
