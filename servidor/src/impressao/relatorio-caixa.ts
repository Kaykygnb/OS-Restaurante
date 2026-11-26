import { prisma } from "../db.js";
import { documentoRelatorioCaixa } from "./documentos.js";
import { enfileirarDocumentoNegocio } from "./enfileirar-doc.js";
import { resolverDestinoCaixa } from "./destino.js";

export async function imprimirRelatorioCaixa(opts: {
  titulo: string;
  operador: string;
  linhas: { texto: string; valor_centavos?: number }[];
  abrir_gaveta?: boolean;
  disparo?: "automatico" | "manual";
}) {
  const imp = await resolverDestinoCaixa();
  if (!imp) return { status: "SEM_DESTINO" as const, trabalhos: [] as number[], avisos: ["Sem impressora de caixa"] };
  const payload = documentoRelatorioCaixa(imp, {
    titulo: opts.titulo,
    operador: opts.operador,
    linhas: opts.linhas,
  });
  return enfileirarDocumentoNegocio({
    tipo: "RELATORIO_CAIXA",
    disparo: opts.disparo ?? "automatico",
    payload,
    abrir_gaveta: opts.abrir_gaveta ?? false,
    agora: true,
  });
}

export async function linhasFechamentoCaixa(sessaoId: number) {
  const sessao = await prisma.caixa_sessao.findUnique({
    where: { id: sessaoId },
    include: {
      pagamentos: { include: { forma_pagamento: true } },
      movimentacoes: true,
    },
  });
  if (!sessao) return [];
  const porForma = new Map<string, number>();
  for (const p of sessao.pagamentos) {
    if ((p as any).estornado_em) continue;
    const nome = p.forma_pagamento.nome;
    porForma.set(nome, (porForma.get(nome) ?? 0) + p.valor_centavos);
  }
  const linhas: { texto: string; valor_centavos?: number }[] = [
    { texto: "Fundo", valor_centavos: sessao.fundo_troco_centavos },
  ];
  for (const [nome, valor] of porForma) {
    linhas.push({ texto: nome, valor_centavos: valor });
  }
  for (const m of sessao.movimentacoes) {
    linhas.push({
      texto: `${m.tipo}: ${m.motivo}`.slice(0, 28),
      valor_centavos: m.tipo === "SANGRIA" ? -m.valor_centavos : m.valor_centavos,
    });
  }
  if (sessao.valor_esperado_centavos != null) {
    linhas.push({ texto: "Esperado", valor_centavos: sessao.valor_esperado_centavos });
  }
  if (sessao.valor_informado_centavos != null) {
    linhas.push({ texto: "Contado", valor_centavos: sessao.valor_informado_centavos });
  }
  if (sessao.diferenca_centavos != null) {
    linhas.push({ texto: "Diferenca", valor_centavos: sessao.diferenca_centavos });
  }
  return linhas;
}
