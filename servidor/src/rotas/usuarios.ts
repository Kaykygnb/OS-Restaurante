import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { prisma } from "../db.js";
import {
  ehTipoUsuario,
  padraoPodeOperarCaixa,
  podeCriarTipo,
  soTipos,
  tiposCriaveis,
  type TipoUsuario,
} from "../permissoes.js";

const SEM_SENHA = {
  id: true,
  matricula: true,
  tipo_usuario: true,
  nome: true,
  login: true,
  email: true,
  telefone: true,
  ativo: true,
  pode_operar_caixa: true,
  createdAt: true,
  updatedAt: true,
} as const;

function limparOpcional(v: string | null | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}

async function conflitoUnico(
  campos: { login?: string; email?: string | null | undefined; matricula?: string | null | undefined },
  excetoId?: number
) {
  if (campos.login) {
    const existe = await prisma.usuario.findUnique({ where: { login: campos.login } });
    if (existe && existe.id !== excetoId) return "Login já existe";
  }
  if (campos.email) {
    const existe = await prisma.usuario.findUnique({ where: { email: campos.email } });
    if (existe && existe.id !== excetoId) return "E-mail já está em uso";
  }
  if (campos.matricula) {
    const existe = await prisma.usuario.findUnique({ where: { matricula: campos.matricula } });
    if (existe && existe.id !== excetoId) return "Matrícula já está em uso";
  }
  return null;
}

export async function rotasUsuarios(app: FastifyInstance) {
  const authGestao = {
    onRequest: [(app as any).autenticar, soTipos("ROOT", "ADMIN", "GERENTE")],
  };

  app.get("/usuarios/opcoes", authGestao, async (req) => {
    const quem = (req as any).user.tipo as TipoUsuario;
    return { tipos_criaveis: tiposCriaveis(quem) };
  });

  app.get("/usuarios", authGestao, async (req) => {
    const quem = (req as any).user.tipo as TipoUsuario;
    const ativosParam = String((req.query as any)?.ativos ?? "1");
    const where: Record<string, unknown> = {};

    if (quem !== "ROOT") {
      where.tipo_usuario = { not: "ROOT" };
    }

    if (ativosParam === "1") where.ativo = true;
    else if (ativosParam === "0") where.ativo = false;

    return prisma.usuario.findMany({
      where,
      select: SEM_SENHA,
      orderBy: [{ ativo: "desc" }, { tipo_usuario: "asc" }, { nome: "asc" }],
    });
  });

  app.post("/usuarios", authGestao, async (req, reply) => {
    const quem = (req as any).user.tipo as TipoUsuario;
    const body = req.body as {
      nome?: string;
      login?: string;
      senha?: string;
      confirmar_senha?: string;
      tipo_usuario?: TipoUsuario;
      email?: string;
      telefone?: string;
      matricula?: string;
      pode_operar_caixa?: boolean;
    };

    const nome = body.nome?.trim();
    const login = body.login?.trim();
    const senha = body.senha;
    const tipo = body.tipo_usuario;

    if (!nome || !login || !senha || !tipo) {
      return reply.code(400).send({ erro: "Informe nome, login, senha e tipo_usuario" });
    }
    if (!ehTipoUsuario(tipo) || tipo === "ROOT") {
      return reply.code(400).send({ erro: "Tipo de usuário inválido" });
    }
    if (senha.length < 8) {
      return reply.code(400).send({ erro: "Senha deve ter pelo menos 8 caracteres" });
    }
    if (body.confirmar_senha !== undefined && body.confirmar_senha !== senha) {
      return reply.code(400).send({ erro: "Senha e confirmação não conferem" });
    }
    if (!podeCriarTipo(quem, tipo)) {
      return reply.code(403).send({ erro: `Você não pode criar usuário do tipo ${tipo}` });
    }

    const email = limparOpcional(body.email);
    const matricula = limparOpcional(body.matricula);
    const conflito = await conflitoUnico({ login, email, matricula });
    if (conflito) return reply.code(409).send({ erro: conflito });

    const criado = await prisma.usuario.create({
      data: {
        nome,
        login,
        tipo_usuario: tipo,
        senha_hash: await bcrypt.hash(senha, 10),
        email,
        telefone: limparOpcional(body.telefone),
        matricula,
        pode_operar_caixa:
          (quem === "ADMIN" || quem === "ROOT") && body.pode_operar_caixa !== undefined
            ? Boolean(body.pode_operar_caixa)
            : padraoPodeOperarCaixa(tipo),
      },
      select: SEM_SENHA,
    });

    return reply.code(201).send(criado);
  });

  app.put("/usuarios/:id", authGestao, async (req, reply) => {
    const quem = (req as any).user.tipo as TipoUsuario;
    const quemId = Number((req as any).user.id);
    const id = Number((req.params as any).id);
    if (!Number.isFinite(id)) return reply.code(400).send({ erro: "ID inválido" });

    const alvo = await prisma.usuario.findUnique({ where: { id } });
    if (!alvo) return reply.code(404).send({ erro: "Usuário não encontrado" });
    if (alvo.tipo_usuario === "ROOT") {
      return reply.code(403).send({ erro: "Não é possível editar o ROOT por esta rota" });
    }
    if (!podeCriarTipo(quem, alvo.tipo_usuario as TipoUsuario)) {
      return reply.code(403).send({ erro: "Sem permissão para editar este usuário" });
    }

    const body = req.body as {
      nome?: string;
      email?: string | null;
      telefone?: string | null;
      matricula?: string | null;
      tipo_usuario?: TipoUsuario;
      ativo?: boolean;
      pode_operar_caixa?: boolean;
    };

    const data: Record<string, unknown> = {};

    if (body.nome !== undefined) {
      const nome = body.nome.trim();
      if (nome.length < 2) return reply.code(400).send({ erro: "Nome inválido" });
      data.nome = nome;
    }

    if (body.email !== undefined) data.email = limparOpcional(body.email);
    if (body.telefone !== undefined) data.telefone = limparOpcional(body.telefone);
    if (body.matricula !== undefined) data.matricula = limparOpcional(body.matricula);

    if (body.tipo_usuario !== undefined) {
      if (!ehTipoUsuario(body.tipo_usuario) || body.tipo_usuario === "ROOT") {
        return reply.code(400).send({ erro: "Tipo de usuário inválido" });
      }
      if (!podeCriarTipo(quem, body.tipo_usuario)) {
        return reply.code(403).send({ erro: `Você não pode definir o tipo ${body.tipo_usuario}` });
      }
      data.tipo_usuario = body.tipo_usuario;
    }

    if (body.pode_operar_caixa !== undefined) {
      data.pode_operar_caixa = Boolean(body.pode_operar_caixa);
    }

    if (body.ativo !== undefined) {
      if (body.ativo === false && id === quemId) {
        return reply.code(403).send({ erro: "Você não pode desativar a si mesmo" });
      }
      const tipoEfetivo =
        (data.tipo_usuario as TipoUsuario | undefined) ?? (alvo.tipo_usuario as TipoUsuario);
      if (!podeCriarTipo(quem, tipoEfetivo)) {
        return reply.code(403).send({ erro: "Sem permissão para alterar o status deste usuário" });
      }
      data.ativo = body.ativo;
    }

    const conflito = await conflitoUnico(
      {
        email: data.email as string | null | undefined,
        matricula: data.matricula as string | null | undefined,
      },
      id
    );
    if (conflito) return reply.code(409).send({ erro: conflito });

    return prisma.usuario.update({
      where: { id },
      data,
      select: SEM_SENHA,
    });
  });

  app.patch("/usuarios/:id", authGestao, async (req, reply) => {
    const quem = (req as any).user.tipo as TipoUsuario;
    const id = Number((req.params as any).id);
    if (!Number.isFinite(id)) return reply.code(400).send({ erro: "ID inválido", codigo: "id_invalido" });
    const alvo = await prisma.usuario.findUnique({ where: { id } });
    if (!alvo) return reply.code(404).send({ erro: "Usuário não encontrado", codigo: "nao_encontrado" });
    if (alvo.tipo_usuario === "ROOT") {
      return reply.code(403).send({ erro: "Não é possível editar o ROOT por esta rota", codigo: "sem_permissao" });
    }
    if (!podeCriarTipo(quem, alvo.tipo_usuario as TipoUsuario) && quem !== "ROOT") {
      return reply.code(403).send({ erro: "Sem permissão para editar este usuário", codigo: "sem_permissao" });
    }
    const body = (req.body ?? {}) as { pode_operar_caixa?: boolean };
    if (body.pode_operar_caixa === undefined) {
      return reply.code(400).send({ erro: "Nada para alterar.", codigo: "dados_invalidos" });
    }
    return prisma.usuario.update({
      where: { id },
      data: { pode_operar_caixa: Boolean(body.pode_operar_caixa) },
      select: SEM_SENHA,
    });
  });

  app.get("/aprovadores", {
    onRequest: [(app as any).autenticar, soTipos("ROOT", "ADMIN", "GERENTE", "ATENDENTE")],
  }, async () => {
    return prisma.usuario.findMany({
      where: {
        ativo: true,
        pin_hash: { not: null },
        tipo_usuario: { in: ["ROOT", "ADMIN", "GERENTE"] },
      },
      select: { id: true, nome: true },
      orderBy: { nome: "asc" },
    });
  });

  /** Define ou troca o PIN de aprovação (gestão ou o próprio usuário GERENTE+). */
  app.put("/usuarios/:id/pin", {
    onRequest: [(app as any).autenticar],
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
  }, async (req, reply) => {
    const quem = (req as any).user.tipo as TipoUsuario;
    const quemId = Number((req as any).user.id);
    const id = Number((req.params as any).id);
    if (!Number.isFinite(id)) return reply.code(400).send({ erro: "ID inválido" });

    const alvo = await prisma.usuario.findUnique({ where: { id } });
    if (!alvo) return reply.code(404).send({ erro: "Usuário não encontrado" });
    if (!alvo.ativo) return reply.code(400).send({ erro: "Usuário inativo" });

    const podeGestao = ["ROOT", "ADMIN", "GERENTE"].includes(quem) && (quem === "ROOT" || alvo.tipo_usuario !== "ROOT");
    if (id !== quemId && !podeGestao) {
      return reply.code(403).send({ erro: "Sem permissão para alterar este PIN" });
    }
    if (id !== quemId && !podeCriarTipo(quem, alvo.tipo_usuario as TipoUsuario) && quem !== "ROOT") {
      return reply.code(403).send({ erro: "Sem permissão para alterar este PIN" });
    }
    if (!["ROOT", "ADMIN", "GERENTE"].includes(alvo.tipo_usuario)) {
      return reply.code(400).send({ erro: "PIN de aprovação só para GERENTE, ADMIN ou ROOT" });
    }

    const body = req.body as { pin?: string; confirmar_pin?: string; remover?: boolean };
    if (body.remover) {
      await prisma.usuario.update({ where: { id }, data: { pin_hash: null } });
      return { id, ok: true, mensagem: "PIN removido" };
    }

    const pin = body.pin;
    if (!pin || !/^\d{4,8}$/.test(pin)) {
      return reply.code(400).send({ erro: "PIN deve ter 4 a 8 dígitos" });
    }
    if (body.confirmar_pin !== undefined && body.confirmar_pin !== pin) {
      return reply.code(400).send({ erro: "PIN e confirmação não conferem" });
    }

    await prisma.usuario.update({
      where: { id },
      data: { pin_hash: await bcrypt.hash(pin, 10) },
    });
    return { id, ok: true, mensagem: "PIN definido" };
  });

  /** Reset administrativo: define senha nova sem pedir a antiga. */
  app.put("/usuarios/:id/senha", authGestao, async (req, reply) => {
    const quem = (req as any).user.tipo as TipoUsuario;
    const quemId = Number((req as any).user.id);
    const id = Number((req.params as any).id);
    if (!Number.isFinite(id)) return reply.code(400).send({ erro: "ID inválido" });

    if (id === quemId) {
      return reply.code(403).send({
        erro: "Aqui só redefine a senha de outros usuários.",
      });
    }

    const alvo = await prisma.usuario.findUnique({ where: { id } });
    if (!alvo) return reply.code(404).send({ erro: "Usuário não encontrado" });
    if (alvo.tipo_usuario === "ROOT") {
      return reply.code(403).send({ erro: "Não é possível redefinir a senha do ROOT" });
    }
    if (!podeCriarTipo(quem, alvo.tipo_usuario as TipoUsuario)) {
      return reply.code(403).send({ erro: "Sem permissão para redefinir a senha deste usuário" });
    }

    const body = req.body as { senha?: string; confirmar_senha?: string };
    const senha = body.senha;
    if (!senha || senha.length < 8) {
      return reply.code(400).send({ erro: "Senha deve ter pelo menos 8 caracteres" });
    }
    if (body.confirmar_senha !== senha) {
      return reply.code(400).send({ erro: "Senha e confirmação não conferem" });
    }

    await prisma.usuario.update({
      where: { id },
      data: { senha_hash: await bcrypt.hash(senha, 10) },
    });

    return { id, ok: true, mensagem: "Nova senha definida" };
  });

  app.delete("/usuarios/:id", authGestao, async (req, reply) => {
    const quem = (req as any).user.tipo as TipoUsuario;
    const quemId = Number((req as any).user.id);
    const id = Number((req.params as any).id);
    if (!Number.isFinite(id)) return reply.code(400).send({ erro: "ID inválido" });

    if (id === quemId) {
      return reply.code(403).send({ erro: "Você não pode desativar a si mesmo" });
    }

    const alvo = await prisma.usuario.findUnique({ where: { id } });
    if (!alvo) return reply.code(404).send({ erro: "Usuário não encontrado" });
    if (alvo.tipo_usuario === "ROOT") {
      return reply.code(403).send({ erro: "Não é possível desativar o ROOT" });
    }
    if (!podeCriarTipo(quem, alvo.tipo_usuario as TipoUsuario)) {
      return reply.code(403).send({ erro: "Sem permissão para desativar este usuário" });
    }
    if (!alvo.ativo) {
      return reply.code(400).send({ erro: "Usuário já está inativo" });
    }

    return prisma.usuario.update({
      where: { id },
      data: { ativo: false },
      select: SEM_SENHA,
    });
  });
}
