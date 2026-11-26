import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { soTipos, type TipoUsuario } from "../permissoes.js";
import { registrarAuditoria } from "../operacao/auditoria.js";
import { exigirAprovacao } from "../operacao/pin.js";
import { cotarEntrega } from "../dominio/cotacao.js";
import { normalizarNome } from "../util/texto.js";
import { ErroRegra } from "../util/erros.js";
import { formatarDinheiroEscpos } from "../impressao/escpos.js";
import { publicar } from "../eventos/barramento.js";

async function dadosCotacao() {
  const [cfg, faixas, bairros] = await Promise.all([
    prisma.configuracao.findFirst({ orderBy: { id: "asc" } }),
    prisma.faixa_entrega.findMany({ where: { ativo: true }, orderBy: { ate_m: "asc" } }),
    prisma.bairro_entrega.findMany({ where: { ativo: true } }),
  ]);
  return { cfg, faixas, bairros };
}

function cotarCom(dados: Awaited<ReturnType<typeof dadosCotacao>>, endereco: {
  numero?: string | null;
  sem_numero?: boolean;
  bairro?: string | null;
  cidade?: string | null;
  lat?: number | null;
  lng?: number | null;
}) {
  return cotarEntrega({
    endereco,
    origemLat: dados.cfg?.lat ?? null,
    origemLng: dados.cfg?.lng ?? null,
    raioMaxM: dados.cfg?.entrega_raio_max_m ?? null,
    fator: dados.cfg?.entrega_fator_rota ?? 130,
    taxaPadrao: dados.cfg?.taxa_entrega_centavos ?? 0,
    faixas: dados.faixas,
    bairros: dados.bairros.map((b) => ({ ...b, nome_normalizado: b.nome_normalizado })),
  });
}

export async function rotasEntrega(app: FastifyInstance) {
  const authOps = { onRequest: [(app as any).autenticar, soTipos("ROOT", "ADMIN", "GERENTE", "ATENDENTE")] };
  const authCfg = { onRequest: [(app as any).autenticar, soTipos("ROOT", "ADMIN")] };

  app.get("/entrega/config", authCfg, async () => {
    const dados = await dadosCotacao();
    return {
      lat: dados.cfg?.lat ?? null,
      lng: dados.cfg?.lng ?? null,
      entrega_raio_max_m: dados.cfg?.entrega_raio_max_m ?? null,
      entrega_modo_distancia: dados.cfg?.entrega_modo_distancia ?? "linha_reta",
      entrega_fator_rota: dados.cfg?.entrega_fator_rota ?? 130,
      taxa_entrega_centavos: dados.cfg?.taxa_entrega_centavos ?? 0,
      faixas: dados.faixas,
    };
  });

  app.put("/entrega/config", authCfg, async (req, reply) => {
    const body = req.body as {
      lat?: number | null;
      lng?: number | null;
      entrega_raio_max_m?: number | null;
      entrega_fator_rota?: number;
      faixas?: { ate_m: number; taxa_centavos: number }[];
    };
    const cfg = await prisma.configuracao.findFirst({ orderBy: { id: "asc" } });
    if (!cfg) return reply.code(400).send({ erro: "Configure o restaurante antes.", codigo: "sem_configuracao" });
    const fator = body.entrega_fator_rota ?? cfg.entrega_fator_rota;
    if (!Number.isFinite(fator) || fator < 100 || fator > 300) {
      return reply.code(400).send({ erro: "O fator da rota fica entre 100 e 300.", codigo: "fator_invalido" });
    }
    await prisma.configuracao.update({
      where: { id: cfg.id },
      data: {
        lat: body.lat === undefined ? cfg.lat : body.lat,
        lng: body.lng === undefined ? cfg.lng : body.lng,
        entrega_raio_max_m: body.entrega_raio_max_m === undefined ? cfg.entrega_raio_max_m : body.entrega_raio_max_m,
        entrega_fator_rota: Math.round(fator),
        entrega_modo_distancia: "linha_reta",
      },
    });
    if (Array.isArray(body.faixas)) {
      await prisma.faixa_entrega.updateMany({ data: { ativo: false } });
      for (const [i, faixa] of body.faixas.entries()) {
        await prisma.faixa_entrega.create({
          data: { ate_m: Math.round(faixa.ate_m), taxa_centavos: Math.round(faixa.taxa_centavos), ordem: i, ativo: true },
        });
      }
    }
    await registrarAuditoria(prisma, {
      usuario_id: Number((req.user as any).id),
      tipo: "config.alterada",
      sensivel: true,
      entidade: "Configuracao",
      entidade_id: cfg.id,
      detalhes: { entrega: true },
    });
    return { ok: true };
  });

  app.get("/entrega/bairros", authCfg, async () => {
    return prisma.bairro_entrega.findMany({ where: { ativo: true }, orderBy: { nome: "asc" } });
  });

  app.post("/entrega/bairros", authCfg, async (req, reply) => {
    const body = req.body as { nome?: string; cidade?: string; taxa_centavos?: number; atende?: boolean };
    const nome = body.nome?.trim() ?? "";
    const cidade = body.cidade?.trim() ?? "";
    if (!nome || !cidade) return reply.code(400).send({ erro: "Informe nome e cidade.", codigo: "dados_invalidos" });
    const criado = await prisma.bairro_entrega.create({
      data: {
        nome,
        nome_normalizado: normalizarNome(nome),
        cidade,
        taxa_centavos: Math.max(0, Math.round(Number(body.taxa_centavos ?? 0))),
        atende: body.atende !== false,
      },
    });
    await registrarAuditoria(prisma, {
      usuario_id: Number((req.user as any).id),
      tipo: "config.alterada",
      sensivel: true,
      entidade: "Bairro_entrega",
      entidade_id: criado.id,
    });
    return reply.code(201).send(criado);
  });

  app.patch("/entrega/bairros/:id", authCfg, async (req, reply) => {
    const id = Number((req.params as any).id);
    const body = req.body as { nome?: string; taxa_centavos?: number; atende?: boolean; ativo?: boolean };
    const data: Record<string, unknown> = {};
    if (body.nome) {
      data.nome = body.nome.trim();
      data.nome_normalizado = normalizarNome(body.nome);
    }
    if (body.taxa_centavos !== undefined) data.taxa_centavos = Math.max(0, Math.round(body.taxa_centavos));
    if (body.atende !== undefined) data.atende = body.atende;
    if (body.ativo !== undefined) data.ativo = body.ativo;
    const up = await prisma.bairro_entrega.update({ where: { id }, data });
    await registrarAuditoria(prisma, {
      usuario_id: Number((req.user as any).id),
      tipo: "config.alterada",
      sensivel: true,
      entidade: "Bairro_entrega",
      entidade_id: id,
    });
    return up;
  });

  app.post("/entrega/cotar", authOps, async (req, reply) => {
    const body = req.body as { endereco_id?: number; endereco?: Record<string, unknown> };
    const dados = await dadosCotacao();
    let endereco = body.endereco as any;
    if (body.endereco_id) {
      endereco = await prisma.cliente_endereco.findUnique({ where: { id: Number(body.endereco_id) } });
      if (!endereco) return reply.code(404).send({ erro: "Endereço não encontrado", codigo: "endereco_nao_encontrado" });
    }
    if (!endereco) return reply.code(400).send({ erro: "Informe o endereço.", codigo: "endereco_invalido" });
    return cotarCom(dados, endereco);
  });

  app.put("/atendimentos/:id/entrega", authOps, async (req, reply) => {
    const id = Number((req.params as any).id);
    const body = req.body as {
      cliente_id?: number;
      endereco_id?: number;
      endereco?: Record<string, unknown>;
      taxa_manual_centavos?: number;
      motivo?: string;
      forcar?: boolean;
      aprovacao?: { aprovador_id?: number; pin?: string };
      pin?: string;
      aprovador_id?: number;
    };
    const at = await prisma.atendimento.findUnique({ where: { id } });
    if (!at || at.status !== "ABERTO") {
      return reply.code(400).send({ erro: "Conta não está aberta.", codigo: "atendimento_fechado" });
    }
    const dados = await dadosCotacao();
    let endereco = body.endereco as any;
    let enderecoId = body.endereco_id ?? null;
    if (body.endereco_id) {
      endereco = await prisma.cliente_endereco.findUnique({ where: { id: Number(body.endereco_id) } });
      if (!endereco) return reply.code(404).send({ erro: "Endereço não encontrado", codigo: "endereco_nao_encontrado" });
    }
    if (!endereco) return reply.code(400).send({ erro: "Informe o endereço.", codigo: "endereco_invalido" });
    const cotacao = cotarCom(dados, endereco);
    const tipo = (req.user as any).tipo as TipoUsuario;
    const usuarioId = Number((req.user as any).id);
    if (cotacao.status !== "ok" && !body.forcar) {
      return reply.code(409).send({ erro: cotacao.avisos[0] ?? "Entrega não confirmada.", codigo: cotacao.status, ...cotacao });
    }
    if (cotacao.status !== "ok" && body.forcar) {
      if (!body.motivo?.trim()) {
        return reply.code(400).send({ erro: "Informe o motivo para forçar a entrega.", codigo: "motivo_obrigatorio" });
      }
      const aprov = await exigirAprovacao({
        tipo,
        usuarioId,
        pin: body.aprovacao?.pin ?? body.pin ?? null,
        aprovadorId: body.aprovacao?.aprovador_id ?? body.aprovador_id ?? null,
        acimaDoLimite: !["ROOT", "ADMIN", "GERENTE"].includes(tipo),
        acao: "entrega.forcada",
      });
      if (!aprov) {
        return reply.code(403).send({ erro: "Para forçar a entrega, peça o PIN de um gerente.", codigo: "pin_invalido" });
      }
    }
    let taxa = cotacao.taxa_centavos ?? 0;
    let origem: string | null = cotacao.origem_taxa ?? null;
    if (body.taxa_manual_centavos != null) {
      if (!body.motivo?.trim()) {
        return reply.code(400).send({ erro: "Taxa manual precisa de motivo.", codigo: "motivo_obrigatorio" });
      }
      const manual = Math.max(0, Math.round(body.taxa_manual_centavos));
      const calculada = cotacao.taxa_centavos ?? 0;
      const limite = dados.cfg?.limite_desconto_sem_pin_centavos ?? 500;
      const diff = Math.abs(manual - calculada);
      const aprov = await exigirAprovacao({
        tipo,
        usuarioId,
        pin: body.aprovacao?.pin ?? body.pin ?? null,
        aprovadorId: body.aprovacao?.aprovador_id ?? body.aprovador_id ?? null,
        acimaDoLimite: tipo === "ATENDENTE" && diff > limite,
        acao: "entrega.taxa_manual",
      });
      if (!aprov) {
        return reply.code(403).send({
          erro: `A diferença passa de ${formatarDinheiroEscpos(limite)}. Peça o PIN de um gerente.`,
          codigo: "pin_invalido",
        });
      }
      taxa = manual;
      origem = "manual";
      await registrarAuditoria(prisma, {
        usuario_id: usuarioId,
        tipo: "entrega.taxa_manual",
        sensivel: true,
        atendimento_id: id,
        aprovador_id: aprov.aprovadorId,
        aprovado_com_pin: aprov.comPin,
        motivo: body.motivo.trim(),
        valor_antes: { taxa_centavos: calculada, origem: cotacao.origem_taxa ?? null },
        valor_depois: { taxa_centavos: manual },
        valor_centavos: manual - calculada,
      });
    }
    if (cotacao.status !== "ok" && body.forcar) {
      await registrarAuditoria(prisma, {
        usuario_id: usuarioId,
        tipo: "entrega.forcada",
        sensivel: true,
        atendimento_id: id,
        motivo: body.motivo?.trim() ?? null,
        detalhes: { status: cotacao.status },
      });
    }
    const texto = [endereco.logradouro, endereco.numero, endereco.bairro, endereco.cidade, endereco.uf]
      .filter(Boolean)
      .join(", ");
    let clienteNome = at.cliente_nome;
    let clienteTel = at.cliente_telefone;
    if (body.cliente_id) {
      const cliente = await prisma.cliente.findUnique({ where: { id: body.cliente_id } });
      if (cliente) {
        clienteNome = cliente.nome;
        clienteTel = cliente.telefone;
      }
    }
    const up = await prisma.atendimento.update({
      where: { id },
      data: {
        tipo_atendimento: at.tipo_atendimento === "MESA" ? at.tipo_atendimento : "ENTREGA",
        cliente_id: body.cliente_id ?? at.cliente_id,
        endereco_entrega_id: enderecoId,
        cliente_nome: clienteNome,
        cliente_telefone: clienteTel,
        cliente_endereco: texto,
        taxa_entrega_centavos: taxa,
        taxa_entrega_origem: origem,
        taxa_entrega_calculada_centavos: cotacao.taxa_centavos ?? null,
        entrega_distancia_m: cotacao.distancia_m ?? null,
      },
    });
    publicar("atendimento.atualizado", id);
    return { atendimento: up, cotacao: { ...cotacao, taxa_centavos: taxa, origem_taxa: origem } };
  });
}
