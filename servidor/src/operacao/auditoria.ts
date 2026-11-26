import { createHash } from "node:crypto";
import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../db.js";
import { contextoAtual } from "../util/contexto.js";
import { publicar } from "../eventos/barramento.js";
import type { TipoUsuario } from "../permissoes.js";

type Db = Prisma.TransactionClient | typeof prisma;

const MAPA: Record<string, { tipo: string; sensivel: boolean }> = {
  DESCONTO: { tipo: "desconto.conta", sensivel: true },
  ACRESCIMO: { tipo: "acrescimo", sensivel: true },
  PAGAMENTO: { tipo: "pagamento.registrado", sensivel: false },
  FECHAR_ATENDIMENTO: { tipo: "atendimento.fechado", sensivel: false },
  ABRIR_CAIXA: { tipo: "caixa.aberto", sensivel: false },
  SANGRIA: { tipo: "caixa.sangria", sensivel: true },
  SUPRIMENTO: { tipo: "caixa.suprimento", sensivel: false },
  FECHAR_CAIXA: { tipo: "caixa.fechado", sensivel: false },
  STATUS_PEDIDO: { tipo: "pedido.status", sensivel: false },
  CANCELAR_PEDIDO: { tipo: "pedido.cancelado", sensivel: true },
  CANCELAR_ITEM: { tipo: "item.cancelado", sensivel: true },
  CANCELAR_ATENDIMENTO: { tipo: "atendimento.cancelado", sensivel: true },
  ESTORNO_PAGAMENTO: { tipo: "pagamento.estornado", sensivel: true },
  LANCAR_PEDIDO: { tipo: "pedido.enviado", sensivel: false },
  ABRIR_GAVETA: { tipo: "caixa.gaveta_sem_venda", sensivel: true },
  ABRIR_ATENDIMENTO: { tipo: "atendimento.aberto", sensivel: false },
  TRANSFERIR_MESA: { tipo: "atendimento.transferido", sensivel: false },
  JUNTAR_ATENDIMENTO: { tipo: "atendimento.juntado", sensivel: false },
  TAXA_SERVICO: { tipo: "servico.alterado", sensivel: false },
  REIMPRIMIR: { tipo: "impressao.reimpressao", sensivel: true },
};

const SENSIVEIS = new Set([
  "login.fora_do_horario",
  "pin.falhou",
  "atendimento.cancelado",
  "pedido.cancelado",
  "item.cancelado",
  "desconto.item",
  "desconto.conta",
  "cortesia",
  "servico.removido",
  "entrega.taxa_manual",
  "entrega.forcada",
  "pagamento.estornado",
  "atendimento.reaberto",
  "caixa.sangria",
  "caixa.gaveta_sem_venda",
  "caixa.fechado_com_diferenca",
  "caixa.fechado_forcado",
  "impressao.reimpressao",
  "produto.preco_alterado",
  "estoque.perda",
  "estoque.correcao",
  "estoque.nivel_alterado",
  "usuario.perfil_alterado",
  "usuario.pin_alterado",
  "usuario.desativado",
  "config.alterada",
]);

const CANCELA = ["item.cancelado", "atendimento.cancelado", "pedido.cancelado"];

export type DadosAuditoria = {
  usuario_id?: number | null;
  acao?: string;
  tipo?: string;
  entidade?: string;
  entidade_id?: number | null;
  detalhes?: unknown;
  sensivel?: boolean;
  motivo?: string | null | undefined;
  aprovador_id?: number | null;
  aprovado_com_pin?: boolean;
  atendimento_id?: number | null;
  mesa_id?: number | null;
  alvo_tipo?: string | null;
  alvo_id?: number | null;
  alvo_rotulo?: string | null;
  valor_antes?: unknown;
  valor_depois?: unknown;
  valor_centavos?: number | null;
  resultado?: "ok" | "negado";
  codigo_erro?: string | null;
  usuario_nome?: string;
  usuario_perfil?: string;
  destaque?: boolean;
};

export function canonico(valor: unknown): string {
  if (valor === undefined) return "null";
  if (valor === null || typeof valor !== "object") return JSON.stringify(valor);
  if (valor instanceof Date) return JSON.stringify(valor.toISOString());
  if (Array.isArray(valor)) return `[${valor.map((v) => canonico(v)).join(",")}]`;
  const obj = valor as Record<string, unknown>;
  const chaves = Object.keys(obj).sort();
  return `{${chaves.map((k) => `${JSON.stringify(k)}:${canonico(obj[k])}`).join(",")}}`;
}

export function payloadDoEvento(e: {
  criado_em: Date;
  tipo: string;
  sensivel: boolean;
  destaque: boolean;
  usuario_id: number | null;
  usuario_nome: string;
  usuario_perfil: string;
  aprovador_id: number | null;
  aprovador_nome: string | null;
  aprovado_com_pin: boolean;
  terminal_nome: string | null;
  ip: string | null;
  user_agent: string | null;
  alvo_tipo: string | null;
  alvo_id: number | null;
  alvo_rotulo: string | null;
  mesa_id: number | null;
  atendimento_id: number | null;
  valor_antes: string | null;
  valor_depois: string | null;
  valor_centavos: number | null;
  motivo: string | null;
  resultado: string;
  codigo_erro: string | null;
  detalhes: string | null;
}) {
  return {
    criado_em: e.criado_em.toISOString(),
    tipo: e.tipo,
    sensivel: e.sensivel,
    destaque: e.destaque,
    usuario_id: e.usuario_id,
    usuario_nome: e.usuario_nome,
    usuario_perfil: e.usuario_perfil,
    aprovador_id: e.aprovador_id,
    aprovador_nome: e.aprovador_nome,
    aprovado_com_pin: e.aprovado_com_pin,
    terminal_nome: e.terminal_nome,
    ip: e.ip,
    user_agent: e.user_agent,
    alvo_tipo: e.alvo_tipo,
    alvo_id: e.alvo_id,
    alvo_rotulo: e.alvo_rotulo,
    mesa_id: e.mesa_id,
    atendimento_id: e.atendimento_id,
    valor_antes: e.valor_antes,
    valor_depois: e.valor_depois,
    valor_centavos: e.valor_centavos,
    motivo: e.motivo,
    resultado: e.resultado,
    codigo_erro: e.codigo_erro,
    detalhes: e.detalhes,
  };
}

export function hashEvento(hashAnterior: string, payload: unknown) {
  return createHash("sha256").update(hashAnterior + canonico(payload)).digest("hex");
}

function jsonOuNull(valor: unknown) {
  if (valor === undefined || valor === null) return null;
  return typeof valor === "string" ? valor : JSON.stringify(valor);
}

function ehConflito(err: unknown) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

async function montarLinha(db: Db, opts: DadosAuditoria) {
  const mapa = opts.acao ? MAPA[opts.acao] : undefined;
  const tipo = opts.tipo ?? mapa?.tipo ?? (opts.acao ? opts.acao.toLowerCase() : "acao");
  const sensivel = opts.sensivel ?? mapa?.sensivel ?? SENSIVEIS.has(tipo);
  let usuario_nome = opts.usuario_nome ?? "";
  let usuario_perfil = opts.usuario_perfil ?? "";
  if (opts.usuario_id && !opts.usuario_nome) {
    const u = await db.usuario.findUnique({
      where: { id: opts.usuario_id },
      select: { nome: true, tipo_usuario: true },
    });
    usuario_nome = u?.nome ?? "";
    usuario_perfil = u?.tipo_usuario ?? "";
  }
  let aprovador_nome: string | null = null;
  if (opts.aprovador_id) {
    const a = await db.usuario.findUnique({ where: { id: opts.aprovador_id }, select: { nome: true } });
    aprovador_nome = a?.nome ?? null;
  }
  const ctx = contextoAtual();
  let destaque = opts.destaque ?? false;
  if (!destaque && opts.usuario_id && CANCELA.includes(tipo) && (opts.resultado ?? "ok") === "ok") {
    const cfg = await db.configuracao.findFirst({ orderBy: { id: "asc" } });
    const limite = cfg?.alerta_cancelamentos ?? 3;
    const janela = cfg?.alerta_cancelamentos_min ?? 60;
    const desde = new Date(Date.now() - janela * 60_000);
    const qtd = await db.evento_auditoria.count({
      where: {
        usuario_id: opts.usuario_id,
        tipo: { in: CANCELA },
        resultado: "ok",
        criado_em: { gte: desde },
      },
    });
    destaque = qtd + 1 >= limite;
  }
  return {
    tipo,
    sensivel,
    destaque,
    usuario_id: opts.usuario_id ?? null,
    usuario_nome,
    usuario_perfil,
    aprovador_id: opts.aprovador_id ?? null,
    aprovador_nome,
    aprovado_com_pin: Boolean(opts.aprovado_com_pin),
    terminal_nome: ctx.terminal,
    ip: ctx.ip,
    user_agent: ctx.userAgent,
    alvo_tipo: opts.alvo_tipo ?? opts.entidade ?? null,
    alvo_id: opts.alvo_id ?? opts.entidade_id ?? null,
    alvo_rotulo: opts.alvo_rotulo ?? null,
    mesa_id: opts.mesa_id ?? null,
    atendimento_id: opts.atendimento_id ?? null,
    valor_antes: jsonOuNull(opts.valor_antes),
    valor_depois: jsonOuNull(opts.valor_depois),
    valor_centavos: opts.valor_centavos ?? null,
    motivo: opts.motivo ?? null,
    resultado: opts.resultado ?? "ok",
    codigo_erro: opts.codigo_erro ?? null,
    detalhes: jsonOuNull(opts.detalhes),
  };
}

async function inserir(db: Db, linha: Awaited<ReturnType<typeof montarLinha>>) {
  const ultimo = await db.evento_auditoria.findFirst({
    orderBy: { id: "desc" },
    select: { hash: true },
  });
  const hash_anterior = ultimo?.hash ?? "0";
  const criado_em = new Date();
  const base = { ...linha, criado_em };
  const hash = hashEvento(hash_anterior, payloadDoEvento(base));
  return db.evento_auditoria.create({ data: { ...base, hash_anterior, hash } });
}

async function gravar(db: Db, opts: DadosAuditoria) {
  const linha = await montarLinha(db, opts);
  const evento = await inserir(db, linha);
  if (evento.sensivel || evento.destaque) {
    const gestao: TipoUsuario[] = ["ROOT", "ADMIN", "GERENTE"];
    publicar("auditoria.alerta", evento.id, gestao);
  }
  return evento;
}

export async function registrarAuditoria(db: Db, opts: DadosAuditoria) {
  if (db !== prisma) return gravar(db, opts);
  let ultimoErro: unknown;
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    try {
      return await prisma.$transaction((tx) => gravar(tx, opts));
    } catch (err) {
      ultimoErro = err;
      if (!ehConflito(err)) throw err;
    }
  }
  throw ultimoErro;
}

/** Tentativa negada: transação própria, depois que a ação foi desfeita. */
export async function registrarNegado(opts: DadosAuditoria) {
  return registrarAuditoria(prisma, { ...opts, resultado: "negado" });
}

export async function verificarCadeia(ateId?: number) {
  const eventos = await prisma.evento_auditoria.findMany({ orderBy: { id: "asc" } });
  let anterior = "0";
  for (const evento of eventos) {
    if (ateId != null && evento.id > ateId) break;
    const hash = hashEvento(anterior, payloadDoEvento(evento));
    if (evento.hash_anterior !== anterior || evento.hash !== hash) {
      return { ok: false as const, primeiro_id_quebrado: evento.id };
    }
    anterior = evento.hash;
  }
  return { ok: true as const };
}

export async function codigoConferencia() {
  const ultimo = await prisma.evento_auditoria.findFirst({ orderBy: { id: "desc" } });
  if (!ultimo) return null;
  return `${ultimo.id}:${ultimo.hash.slice(0, 8)}`;
}
