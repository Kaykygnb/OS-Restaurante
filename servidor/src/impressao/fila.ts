import { prisma } from "../db.js";
import { imprimirRede } from "./rede.js";
import { imprimirSistema } from "./sistema.js";

const MAX_TENTATIVAS = 5;
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

async function processarUm() {
  const trabalho = await prisma.trabalho_impressao.findFirst({
    where: {
      status: { in: ["PENDENTE", "ERRO"] },
      tentativas: { lt: MAX_TENTATIVAS },
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
    // vias: reenvia o mesmo payload N vezes
    const vias = Math.max(1, trabalho.impressora.vias || 1);
    for (let i = 0; i < vias; i++) {
      await enviarParaImpressora(trabalho.impressora, bytes);
    }

    await prisma.$transaction([
      prisma.trabalho_impressao.update({
        where: { id: trabalho.id },
        data: {
          status: "IMPRESSO",
          impresso_em: new Date(),
          ultimo_erro: null,
          tentativas: { increment: 1 },
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
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao imprimir";
    await prisma.$transaction([
      prisma.trabalho_impressao.update({
        where: { id: trabalho.id },
        data: {
          status: "ERRO",
          ultimo_erro: msg,
          tentativas: { increment: 1 },
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
  }

  return true;
}

async function tick() {
  if (rodando) return;
  rodando = true;
  try {
    // processa até 3 por ciclo
    for (let i = 0; i < 3; i++) {
      const houve = await processarUm();
      if (!houve) break;
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
  tipo_documento: "PRODUCAO" | "CONTA" | "COMPROVANTE" | "TESTE";
  conteudo: Buffer;
  pedido_id?: number | null;
  atendimento_id?: number | null;
}) {
  return prisma.trabalho_impressao.create({
    data: {
      impressora_id: opts.impressora_id,
      tipo_documento: opts.tipo_documento,
      conteudo: new Uint8Array(opts.conteudo),
      pedido_id: opts.pedido_id ?? null,
      atendimento_id: opts.atendimento_id ?? null,
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
  tipo: "TESTE" | "COMPROVANTE" | "CONTA" | "PRODUCAO",
  conteudo: Buffer
) {
  if (!impressora.ativo) throw new Error("Impressora inativa");

  const trabalho = await enfileirarTrabalho({
    impressora_id: impressora.id,
    tipo_documento: tipo,
    conteudo,
  });

  try {
    const vias = Math.max(1, impressora.vias || 1);
    for (let i = 0; i < vias; i++) {
      await enviarParaImpressora(impressora, conteudo);
    }
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
    return { trabalho_id: trabalho.id, ok: true as const };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao imprimir";
    await prisma.$transaction([
      prisma.trabalho_impressao.update({
        where: { id: trabalho.id },
        data: { status: "ERRO", tentativas: 1, ultimo_erro: msg },
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
    throw new Error(msg);
  }
}
