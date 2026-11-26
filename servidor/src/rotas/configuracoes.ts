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
  impressora_conta_id?: number | null;
  impressora_caixa_id?: number | null;
};

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
    "impressora_conta_id",
    "impressora_caixa_id",
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
  // ROOT e ADMIN gerenciam os dados do restaurante
  const auth = {
    onRequest: [(app as any).autenticar, soTipos("ROOT", "ADMIN")],
  };

  // Ler (singleton). Sem registro ainda → configurado: false (front monta formulário vazio)
  app.get("/configuracoes", auth, async () => {
    const config = await prisma.configuracao.findFirst({ orderBy: { id: "asc" } });
    if (!config) return { configurado: false as const };
    return { configurado: true as const, ...config };
  });

  // Criar ou atualizar (ROOT pode deixar pronto; ADMIN configura depois)
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

    if (body.impressora_conta_id !== undefined) {
      const err = await validarImpressoraId(body.impressora_conta_id, "Impressora da pré-conta");
      if (err) return reply.code(400).send({ erro: err });
      data.impressora_conta_id = body.impressora_conta_id;
    }
    if (body.impressora_caixa_id !== undefined) {
      const err = await validarImpressoraId(body.impressora_caixa_id, "Impressora do caixa");
      if (err) return reply.code(400).send({ erro: err });
      data.impressora_caixa_id = body.impressora_caixa_id;
    }

    const existente = await prisma.configuracao.findFirst({ orderBy: { id: "asc" } });

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
