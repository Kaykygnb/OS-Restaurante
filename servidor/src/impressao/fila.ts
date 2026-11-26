import { prisma } from "../db.js";
import { publicar } from "../eventos/barramento.js";
import { imprimirRede } from "./rede.js";
import { imprimirSistema } from "./sistema.js";

function papelImpressora(status: string | null | undefined) {
  if (status === "ONLINE") return "ok";
  if (status === "ERRO") return "erro";
  return "sem_resposta";
}

function avisarImpressora(id: number, antes: string | null | undefined, depois: "ONLINE" | "ERRO") {
  if (papelImpressora(antes) !== papelImpressora(depois)) publicar("impressora.status", id);
}

const MAX_TENTATIVAS = 5;
/** Espera crescente: 2s, 10s, 30s, 1min, 5min */
const BACKOFF_MS = [2_000, 10_000, 30_000, 60_000, 300_000];

let rodando = false;
let timer: NodeJS.Timeout | null = null;

async function enviarParaImpressora(
  impressora: {
    tipo_conexao: string;
    ip: string | null;
    porta: number;
    nome_sistema: string | null;
  },
  dados: Buffer
) {
  if (impressora.tipo_conexao === "REDE") {
    if (!impressora.ip) throw new Error("Impressora de rede sem IP");
    await imprimirRede(impressora.ip, impressora.porta || 9100, dados);
    return;
  }
  if (!impressora.nome_sistema) throw new Error("Impressora de sistema sem nome_sistema");
  await imprimirSistema(impressora.nome_sistema, dados);
}

function proximaTentativaEm(tentativasAposFalha: number): Date {
  const idx = Math.min(Math.max(0, tentativasAposFalha - 1), BACKOFF_MS.length - 1);
  return new Date(Date.now() + BACKOFF_MS[idx]!);
}

/** Recupera trabalhos presos se o servidor caiu no meio da impressão. */
export async function recuperarTrabalhosPresos() {
  const r = await prisma.trabalho_impressao.updateMany({
    where: { status: "IMPRIMINDO" },
    data: { status: "PENDENTE", proxima_tentativa_em: null },
  });
  if (r.count > 0) {
    console.info(`[fila-impressao] recuperou ${r.count} trabalho(s) presos em IMPRIMINDO`);
  }
}

async function processarUm(impressoraId?: number) {
  const agora = new Date();
  const trabalho = await prisma.trabalho_impressao.findFirst({
    where: {
      ...(impressoraId ? { impressora_id: impressoraId } : {}),
      status: { in: ["PENDENTE", "ERRO"] },
      tentativas: { lt: MAX_TENTATIVAS },
      OR: [{ proxima_tentativa_em: null }, { proxima_tentativa_em: { lte: agora } }],
    },
    orderBy: { criado_em: "asc" },
    include: { impressora: true },
  });
  if (!trabalho) return false;
  if (!trabalho.impressora.ativo) {
    await prisma.trabalho_impressao.update({
      where: { id: trabalho.id },
      data: {
        status: "ERRO",
        ultimo_erro: "Impressora inativa",
        tentativas: { increment: 1 },
        proxima_tentativa_em: proximaTentativaEm(trabalho.tentativas + 1),
      },
    });
    return true;
  }

  await prisma.trabalho_impressao.update({
    where: { id: trabalho.id },
    data: { status: "IMPRIMINDO" },
  });

  try {
    const bytes = Buffer.from(trabalho.conteudo);
    // Um trabalho = uma via; retry reimprime só esta via
    await enviarParaImpressora(trabalho.impressora, bytes);

    await prisma.$transaction([
      prisma.trabalho_impressao.update({
        where: { id: trabalho.id },
        data: {
          status: "IMPRESSO",
          impresso_em: new Date(),
          ultimo_erro: null,
          tentativas: { increment: 1 },
          proxima_tentativa_em: null,
        },
      }),
      prisma.impressora.update({
        where: { id: trabalho.impressora_id },
        data: {
          ultimo_status: "ONLINE",
          ultimo_erro: null,
          testado_em: new Date(),
        },
      }),
    ]);
    avisarImpressora(trabalho.impressora_id, trabalho.impressora.ultimo_status, "ONLINE");
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao imprimir";
    const tentativas = trabalho.tentativas + 1;
    await prisma.$transaction([
      prisma.trabalho_impressao.update({
        where: { id: trabalho.id },
        data: {
          status: "ERRO",
          ultimo_erro: msg,
          tentativas,
          proxima_tentativa_em:
            tentativas < MAX_TENTATIVAS ? proximaTentativaEm(tentativas) : null,
        },
      }),
      prisma.impressora.update({
        where: { id: trabalho.impressora_id },
        data: {
          ultimo_status: "ERRO",
          ultimo_erro: msg,
          testado_em: new Date(),
        },
      }),
    ]);
    avisarImpressora(trabalho.impressora_id, trabalho.impressora.ultimo_status, "ERRO");
  }

  return true;
}

async function tick() {
  if (rodando) return;
  rodando = true;
  try {
    const impressoras = await prisma.impressora.findMany({
      where: { ativo: true },
      select: { id: true },
    });
    for (const impressora of impressoras) {
      await processarUm(impressora.id);
    }
  } catch (err) {
    console.error("[fila-impressao]", err);
  } finally {
    rodando = false;
  }
}

export function iniciarFilaImpressao(intervaloMs = 2000) {
  if (timer) return;
  void tick();
  timer = setInterval(() => void tick(), intervaloMs);
  if (typeof timer.unref === "function") timer.unref();
}

export async function enfileirarTrabalho(opts: {
  impressora_id: number;
  tipo_documento:
    | "PRODUCAO"
    | "CANCELAMENTO"
    | "REIMPRESSAO"
    | "CONTA"
    | "COMPROVANTE"
    | "RELATORIO_CAIXA"
    | "TESTE";
  conteudo: Buffer;
  pedido_id?: number | null;
  atendimento_id?: number | null;
  via_numero?: number;
  documento_origem_id?: number | null;
}) {
  return prisma.trabalho_impressao.create({
    data: {
      impressora_id: opts.impressora_id,
      tipo_documento: opts.tipo_documento,
      conteudo: new Uint8Array(opts.conteudo),
      pedido_id: opts.pedido_id ?? null,
      atendimento_id: opts.atendimento_id ?? null,
      via_numero: opts.via_numero ?? 1,
      documento_origem_id: opts.documento_origem_id ?? null,
      status: "PENDENTE",
    },
  });
}

/** Imprime na hora (teste) e ainda registra o trabalho. */
export async function imprimirAgora(
  impressora: {
    id: number;
    tipo_conexao: string;
    ip: string | null;
    porta: number;
    nome_sistema: string | null;
    vias: number;
    ativo: boolean;
  },
  tipo:
    | "TESTE"
    | "COMPROVANTE"
    | "CONTA"
    | "PRODUCAO"
    | "CANCELAMENTO"
    | "REIMPRESSAO"
    | "RELATORIO_CAIXA",
  conteudo: Buffer
) {
  if (!impressora.ativo) throw new Error("Impressora inativa");
  const antes = await prisma.impressora.findUnique({
    where: { id: impressora.id },
    select: { ultimo_status: true },
  });

  const trabalho = await enfileirarTrabalho({
    impressora_id: impressora.id,
    tipo_documento: tipo,
    conteudo,
  });

  try {
    await enviarParaImpressora(impressora, conteudo);
    await prisma.$transaction([
      prisma.trabalho_impressao.update({
        where: { id: trabalho.id },
        data: {
          status: "IMPRESSO",
          impresso_em: new Date(),
          tentativas: 1,
          ultimo_erro: null,
        },
      }),
      prisma.impressora.update({
        where: { id: impressora.id },
        data: {
          ultimo_status: "ONLINE",
          ultimo_erro: null,
          testado_em: new Date(),
        },
      }),
    ]);
    avisarImpressora(impressora.id, antes?.ultimo_status, "ONLINE");
    return { trabalho_id: trabalho.id, ok: true as const };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao imprimir";
    await prisma.$transaction([
      prisma.trabalho_impressao.update({
        where: { id: trabalho.id },
        data: {
          status: "ERRO",
          tentativas: 1,
          ultimo_erro: msg,
          proxima_tentativa_em: proximaTentativaEm(1),
        },
      }),
      prisma.impressora.update({
        where: { id: impressora.id },
        data: {
          ultimo_status: "ERRO",
          ultimo_erro: msg,
          testado_em: new Date(),
        },
      }),
    ]);
    avisarImpressora(impressora.id, antes?.ultimo_status, "ERRO");
    throw new Error(msg);
  }
}
