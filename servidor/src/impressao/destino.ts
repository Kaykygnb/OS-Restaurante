import { prisma } from "../db.js";

export type TipoDocNegocio =
  | "PRODUCAO"
  | "CANCELAMENTO"
  | "REIMPRESSAO"
  | "CONTA"
  | "COMPROVANTE"
  | "RELATORIO_CAIXA";

export type ImpressoraDestino = {
  id: number;
  nome: string;
  tipo_conexao: string;
  ip: string | null;
  porta: number;
  nome_sistema: string | null;
  colunas: number;
  codificacao: string;
  vias: number;
  tem_guilhotina: boolean;
  tem_gaveta: boolean;
  apita: boolean;
  tamanho_letra_producao: string;
  ativo: boolean;
};

async function carregarConfig() {
  return prisma.configuracao.findFirst({ orderBy: { id: "asc" } });
}

async function impressoraAtiva(id: number | null | undefined): Promise<ImpressoraDestino | null> {
  if (id == null || !Number.isFinite(id)) return null;
  const imp = await prisma.impressora.findFirst({ where: { id, ativo: true } });
  return imp as ImpressoraDestino | null;
}

export async function configDocumento(tipo: TipoDocNegocio) {
  return prisma.config_documento.findUnique({ where: { tipo } });
}

/** Produção: categoria → produção padrão → padrão loja. */
export async function resolverDestinoProducao(categoriaId: number): Promise<{
  impressora: ImpressoraDestino | null;
  motivo: string;
  pular: boolean;
}> {
  const cat = await prisma.categoria.findUnique({ where: { id: categoriaId } });
  if (!cat) return { impressora: null, motivo: "categoria inexistente", pular: true };
  if (cat.nao_imprime) return { impressora: null, motivo: "categoria nao_imprime", pular: true };

  const ligacoes = await prisma.impressora_categoria.findMany({
    where: { categoria_id: categoriaId, impressora: { ativo: true } },
    include: { impressora: true },
  });
  if (ligacoes.length) {
    return {
      impressora: ligacoes[0]!.impressora as ImpressoraDestino,
      motivo: "categoria",
      pular: false,
    };
  }

  const cfg = await carregarConfig();
  const prod = await impressoraAtiva(cfg?.impressora_producao_id);
  if (prod) return { impressora: prod, motivo: "producao_padrao", pular: false };

  const padrao = await impressoraAtiva(cfg?.impressora_padrao_id);
  if (padrao) return { impressora: padrao, motivo: "padrao_loja", pular: false };

  return { impressora: null, motivo: "sem_destino", pular: false };
}

/** Todas as impressoras ligadas à categoria (multi-setor); senão fallback único. */
export async function resolverDestinosProducao(categoriaId: number): Promise<{
  impressoras: ImpressoraDestino[];
  motivo: string;
  pular: boolean;
}> {
  const cat = await prisma.categoria.findUnique({ where: { id: categoriaId } });
  if (!cat) return { impressoras: [], motivo: "categoria inexistente", pular: true };
  if (cat.nao_imprime) return { impressoras: [], motivo: "categoria nao_imprime", pular: true };

  const ligacoes = await prisma.impressora_categoria.findMany({
    where: { categoria_id: categoriaId, impressora: { ativo: true } },
    include: { impressora: true },
  });
  if (ligacoes.length) {
    return {
      impressoras: ligacoes.map((l) => l.impressora as ImpressoraDestino),
      motivo: "categoria",
      pular: false,
    };
  }

  const um = await resolverDestinoProducao(categoriaId);
  return {
    impressoras: um.impressora ? [um.impressora] : [],
    motivo: um.motivo,
    pular: um.pular,
  };
}

export async function resolverDestinoPreconta(): Promise<ImpressoraDestino | null> {
  const cfg = await carregarConfig();
  return (
    (await impressoraAtiva(cfg?.impressora_conta_id)) ??
    (await impressoraAtiva(cfg?.impressora_caixa_id)) ??
    (await impressoraAtiva(cfg?.impressora_padrao_id))
  );
}

export async function resolverDestinoCaixa(): Promise<ImpressoraDestino | null> {
  const cfg = await carregarConfig();
  return (
    (await impressoraAtiva(cfg?.impressora_caixa_id)) ??
    (await impressoraAtiva(cfg?.impressora_padrao_id))
  );
}

/** Preferir impressoras que já imprimiram PRODUCAO deste pedido. */
export async function impressorasProducaoDoPedido(pedidoId: number): Promise<ImpressoraDestino[]> {
  const jobs = await prisma.trabalho_impressao.findMany({
    where: {
      pedido_id: pedidoId,
      tipo_documento: "PRODUCAO",
    },
    include: { impressora: true },
    orderBy: { criado_em: "asc" },
  });
  const map = new Map<number, ImpressoraDestino>();
  for (const j of jobs) {
    if (j.impressora.ativo) map.set(j.impressora_id, j.impressora as ImpressoraDestino);
  }
  return [...map.values()];
}

export function deveImprimirAgora(
  modo: string | undefined | null,
  disparo: "automatico" | "manual"
): boolean {
  if (!modo || modo === "NUNCA") return false;
  if (modo === "MANUAL") return disparo === "manual";
  return true; // AUTOMATICO
}
