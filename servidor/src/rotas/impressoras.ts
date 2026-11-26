import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { soTipos } from "../permissoes.js";
import { documentoGaveta, documentoTeste } from "../impressao/documentos.js";
import { imprimirAgora } from "../impressao/fila.js";
import { listarImpressorasSistema } from "../impressao/sistema.js";

const includeImpressora = {
  categorias: {
    include: { categoria: { select: { id: true, nome: true } } },
  },
} as const;

function colunasDefault(largura: number) {
  return largura === 58 ? 32 : 48;
}

export async function rotasImpressoras(app: FastifyInstance) {
  const auth = {
    onRequest: [(app as any).autenticar, soTipos("ROOT", "ADMIN")],
  };

  app.get("/impressoras/sistema", auth, async () => {
    const lista = await listarImpressorasSistema();
    return {
      impressoras: lista,
      plataforma: process.platform,
      aviso:
        lista.length === 0
          ? "Nenhuma impressora encontrada no sistema. Instale/compartilhe a impressora no Windows ou use conexão REDE (IP:9100)."
          : null,
    };
  });

  app.get("/impressoras", auth, async (req) => {
    const ativos = String((req.query as any)?.ativos ?? "1");
    const where: Record<string, unknown> = {};
    if (ativos === "1") where.ativo = true;
    else if (ativos === "0") where.ativo = false;

    return prisma.impressora.findMany({
      where,
      include: includeImpressora,
      orderBy: [{ ativo: "desc" }, { nome: "asc" }],
    });
  });

  app.post("/impressoras", auth, async (req, reply) => {
    const body = req.body as {
      nome?: string;
      tipo_conexao?: "REDE" | "SISTEMA";
      ip?: string;
      porta?: number;
      nome_sistema?: string;
      largura_papel?: number;
      colunas?: number;
      codificacao?: string;
      vias?: number;
      tem_guilhotina?: boolean;
      tem_gaveta?: boolean;
      categoria_ids?: number[];
    };

    const nome = body.nome?.trim();
    if (!nome || nome.length < 2) return reply.code(400).send({ erro: "Informe o nome da impressora" });

    const tipo = body.tipo_conexao ?? "REDE";
    if (tipo !== "REDE" && tipo !== "SISTEMA") {
      return reply.code(400).send({ erro: "tipo_conexao inválido" });
    }

    const largura = body.largura_papel === 58 ? 58 : 80;
    const colunas =
      body.colunas && Number.isFinite(body.colunas) && body.colunas > 0
        ? Math.round(body.colunas)
        : colunasDefault(largura);

    if (tipo === "REDE") {
      const ip = body.ip?.trim();
      if (!ip) return reply.code(400).send({ erro: "Informe o IP da impressora" });
    } else {
      if (!body.nome_sistema?.trim()) {
        return reply.code(400).send({ erro: "Informe o nome da impressora no sistema" });
      }
    }

    const criada = await prisma.impressora.create({
      data: {
        nome,
        tipo_conexao: tipo,
        ip: tipo === "REDE" ? body.ip!.trim() : null,
        porta: body.porta && Number.isFinite(body.porta) ? Math.round(body.porta) : 9100,
        nome_sistema: tipo === "SISTEMA" ? body.nome_sistema!.trim() : null,
        largura_papel: largura,
        colunas,
        codificacao: body.codificacao?.trim() || "CP860",
        vias: body.vias && body.vias > 0 ? Math.round(body.vias) : 1,
        tem_guilhotina: body.tem_guilhotina ?? true,
        tem_gaveta: body.tem_gaveta ?? false,
        ultimo_status: "DESCONHECIDO",
      },
    });

    if (Array.isArray(body.categoria_ids) && body.categoria_ids.length) {
      const ids = body.categoria_ids.map(Number).filter((n) => Number.isFinite(n));
      if (ids.length) {
        await prisma.impressora_categoria.createMany({
          data: ids.map((categoria_id) => ({
            impressora_id: criada.id,
            categoria_id,
          })),
        });
      }
    }

    return reply.code(201).send(
      await prisma.impressora.findUnique({ where: { id: criada.id }, include: includeImpressora })
    );
  });

  app.put("/impressoras/:id", auth, async (req, reply) => {
    const id = Number((req.params as any).id);
    if (!Number.isFinite(id)) return reply.code(400).send({ erro: "ID inválido" });

    const atual = await prisma.impressora.findUnique({ where: { id } });
    if (!atual) return reply.code(404).send({ erro: "Impressora não encontrada" });

    const body = req.body as {
      nome?: string;
      tipo_conexao?: "REDE" | "SISTEMA";
      ip?: string | null;
      porta?: number;
      nome_sistema?: string | null;
      largura_papel?: number;
      colunas?: number;
      codificacao?: string;
      vias?: number;
      tem_guilhotina?: boolean;
      tem_gaveta?: boolean;
      ativo?: boolean;
    };

    const data: Record<string, unknown> = {};
    if (body.nome !== undefined) {
      const nome = body.nome.trim();
      if (nome.length < 2) return reply.code(400).send({ erro: "Nome inválido" });
      data.nome = nome;
    }
    if (body.tipo_conexao !== undefined) {
      if (body.tipo_conexao !== "REDE" && body.tipo_conexao !== "SISTEMA") {
        return reply.code(400).send({ erro: "tipo_conexao inválido" });
      }
      data.tipo_conexao = body.tipo_conexao;
    }
    if (body.ip !== undefined) data.ip = body.ip?.trim() || null;
    if (body.porta !== undefined) data.porta = Math.round(body.porta);
    if (body.nome_sistema !== undefined) data.nome_sistema = body.nome_sistema?.trim() || null;
    if (body.largura_papel !== undefined) {
      data.largura_papel = body.largura_papel === 58 ? 58 : 80;
      if (body.colunas === undefined) data.colunas = colunasDefault(data.largura_papel as number);
    }
    if (body.colunas !== undefined) data.colunas = Math.round(body.colunas);
    if (body.codificacao !== undefined) data.codificacao = body.codificacao.trim() || "CP860";
    if (body.vias !== undefined) data.vias = Math.max(1, Math.round(body.vias));
    if (body.tem_guilhotina !== undefined) data.tem_guilhotina = body.tem_guilhotina;
    if (body.tem_gaveta !== undefined) data.tem_gaveta = body.tem_gaveta;
    if (body.ativo !== undefined) {
      data.ativo = body.ativo;
      data.ultimo_status = body.ativo ? atual.ultimo_status === "INATIVA" ? "DESCONHECIDO" : atual.ultimo_status : "INATIVA";
    }

    return prisma.impressora.update({
      where: { id },
      data,
      include: includeImpressora,
    });
  });

  app.put("/impressoras/:id/categorias", auth, async (req, reply) => {
    const id = Number((req.params as any).id);
    if (!Number.isFinite(id)) return reply.code(400).send({ erro: "ID inválido" });
    const atual = await prisma.impressora.findUnique({ where: { id } });
    if (!atual) return reply.code(404).send({ erro: "Impressora não encontrada" });

    const body = req.body as { categoria_ids?: number[] };
    const ids = Array.isArray(body.categoria_ids)
      ? body.categoria_ids.map(Number).filter((n) => Number.isFinite(n))
      : [];

    await prisma.$transaction(async (tx) => {
      await tx.impressora_categoria.deleteMany({ where: { impressora_id: id } });
      if (ids.length) {
        await tx.impressora_categoria.createMany({
          data: ids.map((categoria_id) => ({ impressora_id: id, categoria_id })),
        });
      }
    });

    return prisma.impressora.findUnique({ where: { id }, include: includeImpressora });
  });

  app.delete("/impressoras/:id", auth, async (req, reply) => {
    const id = Number((req.params as any).id);
    if (!Number.isFinite(id)) return reply.code(400).send({ erro: "ID inválido" });
    const atual = await prisma.impressora.findUnique({ where: { id } });
    if (!atual) return reply.code(404).send({ erro: "Impressora não encontrada" });
    if (!atual.ativo) return reply.code(400).send({ erro: "Impressora já inativa" });

    return prisma.impressora.update({
      where: { id },
      data: { ativo: false, ultimo_status: "INATIVA" },
      include: includeImpressora,
    });
  });

  app.post("/impressoras/:id/teste", auth, async (req, reply) => {
    const id = Number((req.params as any).id);
    if (!Number.isFinite(id)) return reply.code(400).send({ erro: "ID inválido" });
    const impressora = await prisma.impressora.findUnique({ where: { id } });
    if (!impressora) return reply.code(404).send({ erro: "Impressora não encontrada" });

    const payload = documentoTeste(impressora);
    try {
      const res = await imprimirAgora(impressora, "TESTE", payload);
      return {
        ok: true,
        mensagem: "Cupom de teste enviado",
        trabalho_id: res.trabalho_id,
      };
    } catch (err) {
      // imprimirAgora já registrou o trabalho como ERRO + atualizou status da impressora
      return reply.code(502).send({
        erro: err instanceof Error ? err.message : "Falha ao imprimir teste",
      });
    }
  });

  app.post("/impressoras/:id/teste-gaveta", auth, async (req, reply) => {
    const id = Number((req.params as any).id);
    if (!Number.isFinite(id)) return reply.code(400).send({ erro: "ID inválido" });
    const impressora = await prisma.impressora.findUnique({ where: { id } });
    if (!impressora) return reply.code(404).send({ erro: "Impressora não encontrada" });
    if (!impressora.tem_gaveta) {
      return reply.code(400).send({ erro: "Esta impressora não está marcada com gaveta" });
    }

    try {
      const res = await imprimirAgora(impressora, "COMPROVANTE", documentoGaveta());
      return { ok: true, mensagem: "Pulso de gaveta enviado", trabalho_id: res.trabalho_id };
    } catch (err) {
      return reply.code(502).send({
        erro: err instanceof Error ? err.message : "Falha ao acionar gaveta",
      });
    }
  });
}
