import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { soTipos } from "../permissoes.js";

type BodyConfig = {
  nome_restaurante?: string;
  nome_fantasia?: string | null;
  cnpj?: string | null;
  inscricao_estadual?: string | null;
  telefone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  caminho_logo?: string | null;
  mensagem_cupom?: string | null;
  taxa_entrega_centavos?: number;
  impressora_padrao_id?: number | null;
  impressora_producao_id?: number | null;
  impressora_conta_id?: number | null;
  impressora_caixa_id?: number | null;
  usa_tela_cozinha?: boolean;
};

const TIPOS_DOC = [
  "PRODUCAO",
  "CANCELAMENTO",
  "REIMPRESSAO",
  "CONTA",
  "COMPROVANTE",
  "RELATORIO_CAIXA",
] as const;

function camposEditaveis(body: BodyConfig) {
  const data: Record<string, unknown> = {};
  const keys: (keyof BodyConfig)[] = [
    "nome_restaurante",
    "nome_fantasia",
    "cnpj",
    "inscricao_estadual",
    "telefone",
    "whatsapp",
    "email",
    "cep",
    "logradouro",
    "numero",
    "complemento",
    "bairro",
    "cidade",
    "uf",
    "caminho_logo",
    "mensagem_cupom",
    "taxa_entrega_centavos",
    "impressora_padrao_id",
    "impressora_producao_id",
    "impressora_conta_id",
    "impressora_caixa_id",
    "usa_tela_cozinha",
  ];
  for (const key of keys) {
    if (body[key] !== undefined) data[key] = body[key];
  }
  return data;
}

async function validarImpressoraId(id: number | null | undefined, label: string) {
  if (id === null || id === undefined) return null;
  if (!Number.isFinite(id)) return `${label} inválida`;
  const imp = await prisma.impressora.findUnique({ where: { id } });
  if (!imp || !imp.ativo) return `${label} não encontrada ou inativa`;
  return null;
}

export async function rotasConfiguracoes(app: FastifyInstance) {
  const auth = {
    onRequest: [(app as any).autenticar, soTipos("ROOT", "ADMIN")],
  };

  app.get("/configuracoes", auth, async () => {
    const config = await prisma.configuracao.findFirst({ orderBy: { id: "asc" } });
    if (!config) return { configurado: false as const };
    return { configurado: true as const, ...config };
  });

  app.get("/config-documentos", auth, async () => {
    return prisma.config_documento.findMany({ orderBy: { tipo: "asc" } });
  });

  app.put("/config-documentos/:tipo", auth, async (req, reply) => {
    const tipo = String((req.params as any).tipo ?? "").toUpperCase();
    if (!TIPOS_DOC.includes(tipo as any)) {
      return reply.code(400).send({ erro: "Tipo de documento inválido" });
    }
    const body = req.body as { modo?: string; vias?: number; abre_gaveta?: boolean };
    const data: Record<string, unknown> = {};
    if (body.modo !== undefined) {
      if (!["AUTOMATICO", "MANUAL", "NUNCA"].includes(body.modo)) {
        return reply.code(400).send({ erro: "modo inválido" });
      }
      data.modo = body.modo;
    }
    if (body.vias !== undefined) {
      const v = Math.round(Number(body.vias));
      if (!Number.isFinite(v) || v < 1 || v > 3) {
        return reply.code(400).send({ erro: "vias deve ser 1 a 3" });
      }
      data.vias = v;
    }
    if (body.abre_gaveta !== undefined) {
      if (!["COMPROVANTE", "RELATORIO_CAIXA"].includes(tipo) && body.abre_gaveta) {
        return reply.code(400).send({ erro: "Este documento não abre gaveta" });
      }
      data.abre_gaveta = Boolean(body.abre_gaveta);
    }
    const up = await prisma.config_documento.upsert({
      where: { tipo: tipo as any },
      create: {
        tipo: tipo as any,
        modo: (data.modo as any) ?? "AUTOMATICO",
        vias: (data.vias as number) ?? 1,
        abre_gaveta: (data.abre_gaveta as boolean) ?? false,
      },
      update: data,
    });
    return up;
  });

  app.put("/configuracoes", auth, async (req, reply) => {
    const body = req.body as BodyConfig;
    const data = camposEditaveis(body);

    if (body.taxa_entrega_centavos !== undefined) {
      if (!Number.isFinite(body.taxa_entrega_centavos) || body.taxa_entrega_centavos < 0) {
        return reply.code(400).send({ erro: "Taxa de entrega inválida" });
      }
      data.taxa_entrega_centavos = Math.round(body.taxa_entrega_centavos);
    }

    if (typeof body.uf === "string" && body.uf.trim()) {
      const uf = body.uf.trim().toUpperCase();
      if (uf.length !== 2) return reply.code(400).send({ erro: "UF deve ter 2 letras (ex: MG)" });
      data.uf = uf;
    }

    for (const [campo, label] of [
      ["impressora_padrao_id", "Impressora padrão"],
      ["impressora_producao_id", "Impressora de produção"],
      ["impressora_conta_id", "Impressora da pré-conta"],
      ["impressora_caixa_id", "Impressora do caixa"],
    ] as const) {
      if (body[campo] !== undefined) {
        const err = await validarImpressoraId(body[campo], label);
        if (err) return reply.code(400).send({ erro: err });
        data[campo] = body[campo];
      }
    }

    const qtdAtivas = await prisma.impressora.count({ where: { ativo: true } });
    const existente = await prisma.configuracao.findFirst({ orderBy: { id: "asc" } });
    const padraoFinal =
      body.impressora_padrao_id !== undefined
        ? body.impressora_padrao_id
        : existente?.impressora_padrao_id ?? null;
    if (qtdAtivas > 0 && !padraoFinal) {
      return reply.code(400).send({
        erro: "Com impressoras cadastradas, informe a impressora padrão da loja",
      });
    }

    if (!existente) {
      const nome = body.nome_restaurante?.trim();
      if (!nome) {
        return reply.code(400).send({ erro: "Informe o nome do restaurante na primeira configuração" });
      }
      const criado = await prisma.configuracao.create({
        data: { ...data, nome_restaurante: nome },
      });
      return { configurado: true as const, ...criado };
    }

    if (body.nome_restaurante !== undefined && !body.nome_restaurante.trim()) {
      return reply.code(400).send({ erro: "Nome do restaurante não pode ser vazio" });
    }
    if (typeof body.nome_restaurante === "string") {
      data.nome_restaurante = body.nome_restaurante.trim();
    }

    const atualizado = await prisma.configuracao.update({
      where: { id: existente.id },
      data,
    });
    return { configurado: true as const, ...atualizado };
  });
}
