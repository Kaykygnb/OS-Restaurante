import type { FastifyInstance, FastifyReply } from "fastify";
import { prisma } from "../db.js";
import { soTipos, type TipoUsuario } from "../permissoes.js";
import { codigoConferencia, registrarAuditoria, verificarCadeia } from "../operacao/auditoria.js";

function filtros(query: any) {
  const where: Record<string, unknown> = {};
  if (query.usuario_id) where.usuario_id = Number(query.usuario_id);
  if (query.tipo) where.tipo = String(query.tipo);
  if (query.sensivel === "true") where.sensivel = true;
  if (query.mesa_id) where.mesa_id = Number(query.mesa_id);
  if (query.atendimento_id) where.atendimento_id = Number(query.atendimento_id);
  if (query.de || query.ate) {
    where.criado_em = {
      ...(query.de ? { gte: new Date(String(query.de)) } : {}),
      ...(query.ate ? { lte: new Date(String(query.ate)) } : {}),
    };
  }
  if (query.terminal) where.terminal_nome = String(query.terminal);
  return where;
}

function podeExportar(tipo: TipoUsuario) {
  return tipo === "ROOT" || tipo === "ADMIN";
}

export async function rotasAuditoria(app: FastifyInstance) {
  const authGestao = { onRequest: [(app as any).autenticar, soTipos("ROOT", "ADMIN", "GERENTE")] };

  app.get("/auditoria/alertas", authGestao, async (req) => {
    const visto = String((req.query as any)?.visto ?? "false");
    const usuarioId = Number((req.user as any).id);
    const eventos = await prisma.evento_auditoria.findMany({
      where: { ...filtros(req.query), OR: [{ sensivel: true }, { destaque: true }] },
      orderBy: { id: "desc" },
      take: 100,
    });
    if (visto === "false") {
      const vistos = await prisma.alerta_visto.findMany({
        where: { usuario_id: usuarioId, evento_id: { in: eventos.map((e) => e.id) } },
      });
      const ids = new Set(vistos.map((v) => v.evento_id));
      return eventos.filter((e) => !ids.has(e.id));
    }
    return eventos;
  });

  app.post("/auditoria/alertas/:evento_id/visto", authGestao, async (req, reply) => {
    const evento_id = Number((req.params as any).evento_id);
    const usuario_id = Number((req.user as any).id);
    const evento = await prisma.evento_auditoria.findUnique({ where: { id: evento_id } });
    if (!evento) return reply.code(404).send({ erro: "Evento não encontrado", codigo: "nao_encontrado" });
    await prisma.alerta_visto.upsert({
      where: { evento_id_usuario_id: { evento_id, usuario_id } },
      create: { evento_id, usuario_id },
      update: { visto_em: new Date() },
    });
    return { ok: true };
  });

  app.get("/auditoria/resumo", authGestao, async (req) => {
    const where = filtros(req.query);
    const eventos = await prisma.evento_auditoria.findMany({ where, take: 5000 });
    const mapa = new Map<number, any>();
    for (const e of eventos) {
      if (!e.usuario_id) continue;
      const item = mapa.get(e.usuario_id) ?? {
        usuario_id: e.usuario_id,
        nome: e.usuario_nome,
        perfil: e.usuario_perfil,
        cancelamentos: 0,
        descontos_qtd: 0,
        descontos_centavos: 0,
        taxas_manuais: 0,
        estornos: 0,
        reimpressoes: 0,
        sangrias: 0,
        diferenca_caixa_centavos: 0,
        logins_fora_horario: 0,
      };
      if (["item.cancelado", "atendimento.cancelado", "pedido.cancelado"].includes(e.tipo) && e.resultado === "ok") item.cancelamentos += 1;
      if (e.tipo === "desconto.conta" || e.tipo === "desconto.item") {
        item.descontos_qtd += 1;
        item.descontos_centavos += Math.abs(e.valor_centavos ?? 0);
      }
      if (e.tipo === "entrega.taxa_manual") item.taxas_manuais += 1;
      if (e.tipo === "pagamento.estornado") item.estornos += 1;
      if (e.tipo === "impressao.reimpressao") item.reimpressoes += 1;
      if (e.tipo === "caixa.sangria") item.sangrias += 1;
      if (e.tipo === "caixa.fechado_com_diferenca") item.diferenca_caixa_centavos += e.valor_centavos ?? 0;
      if (e.tipo === "login.fora_do_horario") item.logins_fora_horario += 1;
      mapa.set(e.usuario_id, item);
    }
    return [...mapa.values()];
  });

  app.get("/auditoria/verificar", authGestao, async (req) => {
    const ancora = String((req.query as any)?.ancora ?? "");
    const cadeia = await verificarCadeia();
    let ancora_ok: boolean | undefined;
    if (ancora.includes(":")) {
      const [idTexto, prefixo] = ancora.split(":");
      const evento = await prisma.evento_auditoria.findUnique({ where: { id: Number(idTexto) } });
      ancora_ok = Boolean(evento && evento.hash.startsWith(prefixo ?? ""));
    }
    await registrarAuditoria(prisma, {
      usuario_id: Number((req.user as any).id),
      tipo: "auditoria.verificada",
      detalhes: { ok: cadeia.ok, ancora: ancora || null },
    });
    return { ...cadeia, ...(ancora_ok === undefined ? {} : { ancora_ok }), conferencia: await codigoConferencia() };
  });

  app.get("/auditoria/exportar", authGestao, async (req, reply) => {
    const tipo = (req.user as any).tipo as TipoUsuario;
    if (!podeExportar(tipo)) {
      return reply.code(403).send({ erro: "Só o dono exporta a auditoria.", codigo: "exportacao_restrita" });
    }
    if (String((req.query as any)?.formato ?? "csv") === "pdf") {
      return reply.code(400).send({ erro: "O servidor não gera PDF. Use CSV ou a impressão do navegador.", codigo: "formato_invalido" });
    }
    const eventos = await prisma.evento_auditoria.findMany({ where: filtros(req.query), orderBy: { id: "asc" }, take: 20000 });
    await registrarAuditoria(prisma, {
      usuario_id: Number((req.user as any).id),
      tipo: "auditoria.exportada",
      detalhes: { formato: "csv", linhas: eventos.length },
    });
    const cabecalho = ["id", "criado_em", "tipo", "usuario_nome", "usuario_perfil", "aprovador_nome", "motivo", "valor_centavos", "resultado", "hash", "hash_anterior"];
    const linhas = eventos.map((e) =>
      [e.id, e.criado_em.toISOString(), e.tipo, e.usuario_nome, e.usuario_perfil, e.aprovador_nome ?? "", (e.motivo ?? "").replaceAll(";", ","), e.valor_centavos ?? "", e.resultado, e.hash, e.hash_anterior].join(";")
    );
    reply.header("content-type", "text/csv; charset=utf-8");
    return ["\uFEFF" + cabecalho.join(";"), ...linhas].join("\n");
  });

  app.get("/auditoria/imprimir", authGestao, async (req, reply) => {
    const eventos = await prisma.evento_auditoria.findMany({ where: filtros(req.query), orderBy: { id: "desc" }, take: 500 });
    const escapar = (valor: unknown) => String(valor ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
    const linhas = eventos
      .map(
        (e) =>
          `<tr><td>${e.id}</td><td>${e.criado_em.toISOString()}</td><td>${escapar(e.tipo)}</td><td>${escapar(e.usuario_nome)}</td><td>${escapar(e.motivo)}</td><td>${e.hash.slice(0, 8)}</td></tr>`
      )
      .join("");
    reply.type("text/html");
    return `<!doctype html><meta charset="utf-8"><title>Auditoria</title><button onclick="print()">Imprimir</button><table border="1" cellpadding="4"><tr><th>id</th><th>quando</th><th>tipo</th><th>quem</th><th>motivo</th><th>hash</th></tr>${linhas}</table>`;
  });

  app.get("/auditoria/:id", authGestao, async (req, reply) => {
    const id = Number((req.params as any).id);
    const evento = await prisma.evento_auditoria.findUnique({ where: { id } });
    if (!evento) return reply.code(404).send({ erro: "Evento não encontrado", codigo: "nao_encontrado" });
    return evento;
  });

  app.get("/auditoria", authGestao, async (req) => {
    const pagina = Math.max(1, Number((req.query as any)?.pagina ?? 1) || 1);
    const limite = Math.min(100, Math.max(1, Number((req.query as any)?.limite ?? 50) || 50));
    const where = filtros(req.query);
    const [eventos, legado] = await Promise.all([
      prisma.evento_auditoria.findMany({ where, orderBy: { id: "desc" }, take: 500 }),
      prisma.log_auditoria.findMany({ orderBy: { id: "desc" }, take: 200, include: { usuario: { select: { nome: true, tipo_usuario: true } } } }),
    ]);
    const itens = [
      ...eventos.map((e) => ({ ...e, origem: "evento" as const, legado: false })),
      ...legado.map((l) => ({
        id: l.id,
        criado_em: l.criado_em,
        tipo: l.acao,
        sensivel: false,
        usuario_id: l.usuario_id,
        usuario_nome: l.usuario.nome,
        usuario_perfil: l.usuario.tipo_usuario,
        motivo: null,
        detalhes: l.detalhes,
        hash: null,
        hash_anterior: null,
        origem: "legado" as const,
        legado: true,
        alvo_tipo: l.entidade,
        alvo_id: l.entidade_id,
      })),
    ].sort((a, b) => b.criado_em.getTime() - a.criado_em.getTime());
    const inicio = (pagina - 1) * limite;
    return { itens: itens.slice(inicio, inicio + limite), pagina, paginas: Math.max(1, Math.ceil(itens.length / limite)) };
  });
}

export function enviarCsv(reply: FastifyReply, texto: string) {
  reply.header("content-type", "text/csv; charset=utf-8");
  return texto;
}
