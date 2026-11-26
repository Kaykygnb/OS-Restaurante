import { prisma } from "../db.js";
import { documentoGaveta } from "../impressao/documentos.js";
import { imprimirAgora } from "../impressao/fila.js";
import { resolverDestinoCaixa } from "../impressao/destino.js";

export async function estadoGaveta() {
  const cfg = await prisma.configuracao.findFirst({ orderBy: { id: "asc" } });
  if (!cfg?.usa_gaveta) return { disponivel: false as const, motivo: "desligada" as const };
  const imp = await resolverDestinoCaixa();
  if (!imp?.tem_gaveta) return { disponivel: false as const, motivo: "sem_impressora" as const };
  return { disponivel: true as const, impressora: imp };
}

export async function pulsarGaveta(): Promise<"aberta" | "nao_usada" | "falhou"> {
  const estado = await estadoGaveta();
  if (!estado.disponivel) return "nao_usada";
  try {
    await imprimirAgora(estado.impressora, "COMPROVANTE", documentoGaveta());
    return "aberta";
  } catch {
    return "falhou";
  }
}
