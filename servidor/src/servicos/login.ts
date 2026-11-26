import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { registrarAuditoria } from "../operacao/auditoria.js";
import { dentroDoHorario, partesLocais } from "../util/horario.js";
import { contextoAtual } from "../util/contexto.js";

const JANELA_MS = 15 * 60 * 1000;
const BLOQUEIO_MS = 60 * 1000;
const MAX_FALHAS = 5;

async function falhasRecentes(usuario: string, ip: string | null) {
  return prisma.evento_auditoria.findMany({
    where: {
      tipo: "login.falhou",
      criado_em: { gte: new Date(Date.now() - JANELA_MS) },
      OR: [{ usuario_nome: usuario }, ...(ip ? [{ ip }] : [])],
    },
    orderBy: { criado_em: "desc" },
    take: MAX_FALHAS,
  });
}

export async function entrar(app: FastifyInstance, usuario: string, senha: string) {
  const nome = usuario.trim();
  const ctx = contextoAtual();
  const falhas = await falhasRecentes(nome, ctx.ip);
  if (falhas.length >= MAX_FALHAS) {
    const ultima = falhas[0]?.criado_em.getTime() ?? Date.now();
    const resta = ultima + BLOQUEIO_MS - Date.now();
    if (resta > 0) {
      return {
        status: 429,
        corpo: {
          erro: "Muitas tentativas. Aguarde para tentar de novo.",
          codigo: "muitas_tentativas",
          tentar_em_s: Math.max(1, Math.ceil(resta / 1000)),
        },
      };
    }
  }

  const cadastrado = await prisma.usuario.findUnique({ where: { login: nome } });
  const senhaOk = cadastrado?.ativo ? await bcrypt.compare(senha, cadastrado.senha_hash) : false;
  if (!senhaOk || !cadastrado) {
    await registrarAuditoria(prisma, {
      tipo: "login.falhou",
      usuario_id: cadastrado?.id ?? null,
      usuario_nome: nome,
      usuario_perfil: cadastrado?.tipo_usuario ?? "",
      codigo_erro: "credenciais_invalidas",
      resultado: "negado",
    });
    return {
      status: 401,
      corpo: { erro: "Usuário ou senha inválidos", codigo: "credenciais_invalidas" },
    };
  }

  const cfg = await prisma.configuracao.findFirst({ orderBy: { id: "asc" } });
  const { minutoDia } = partesLocais(new Date());
  const inicio = cfg?.horario_inicio_min ?? 420;
  const fim = cfg?.horario_fim_min ?? 1440;
  const fora = !dentroDoHorario(minutoDia, inicio, fim);
  await registrarAuditoria(prisma, {
    tipo: fora ? "login.fora_do_horario" : "login.ok",
    sensivel: fora,
    usuario_id: cadastrado.id,
    usuario_nome: cadastrado.nome,
    usuario_perfil: cadastrado.tipo_usuario,
  });

  const token = app.jwt.sign({ id: cadastrado.id, tipo: cadastrado.tipo_usuario }, { expiresIn: "12h" });
  return {
    status: 200,
    corpo: {
      token,
      usuario: { id: cadastrado.id, nome: cadastrado.nome, tipo: cadastrado.tipo_usuario },
    },
  };
}
