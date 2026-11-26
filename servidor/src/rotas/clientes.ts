import type { FastifyInstance } from "fastify";
import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../db.js";
import { soTipos, type TipoUsuario } from "../permissoes.js";
import { registrarAuditoria } from "../operacao/auditoria.js";
import { ErroRegra } from "../util/erros.js";
import { soDigitos, telefoneValido } from "../util/texto.js";
import { geocodificarEndereco } from "../servicos/geocodigo.js";

type EnderecoBody = {
  apelido?: string;
  cep?: string;
  logradouro?: string;
  numero?: string;
  sem_numero?: boolean;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  referencia?: string;
  lat?: number;
  lng?: number;
};

function validarEndereco(body: EnderecoBody) {
  const logradouro = body.logradouro?.trim() ?? "";
  const bairro = body.bairro?.trim() ?? "";
  const cidade = body.cidade?.trim() ?? "";
  const uf = body.uf?.trim().toUpperCase() ?? "";
  const campos: Record<string, string> = {};
  if (!logradouro) campos.logradouro = "Informe a rua";
  if (!bairro) campos.bairro = "Informe o bairro";
  if (!cidade) campos.cidade = "Informe a cidade";
  if (uf.length !== 2) campos.uf = "UF com 2 letras";
  if (Object.keys(campos).length) {
    throw new ErroRegra(400, "endereco_invalido", "Confira o endereço.", { campos });
  }
  return { logradouro, bairro, cidade, uf };
}

async function gravarEndereco(clienteId: number, body: EnderecoBody, principal: boolean) {
  const base = validarEndereco(body);
  let lat = body.lat;
  let lng = body.lng;
  let geo_origem: "manual" | "api" | "nenhuma" = "nenhuma";
  if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
    geo_origem = "manual";
  } else {
    const geo = await geocodificarEndereco({
      logradouro: base.logradouro,
      numero: body.numero ?? null,
      bairro: base.bairro,
      cidade: base.cidade,
      uf: base.uf,
    });
    if (geo) {
      lat = geo.lat;
      lng = geo.lng;
      geo_origem = "api";
    }
  }
  const qtd = await prisma.cliente_endereco.count({ where: { cliente_id: clienteId, ativo: true } });
  return prisma.cliente_endereco.create({
    data: {
      cliente_id: clienteId,
      apelido: body.apelido?.trim() || null,
      cep: body.cep ? soDigitos(body.cep) : null,
      logradouro: base.logradouro,
      numero: body.sem_numero ? null : body.numero?.trim() || null,
      sem_numero: Boolean(body.sem_numero),
      complemento: body.complemento?.trim() || null,
      bairro: base.bairro,
      cidade: base.cidade,
      uf: base.uf,
      referencia: body.referencia?.trim() || null,
      lat: lat ?? null,
      lng: lng ?? null,
      geo_origem,
      principal: principal || qtd === 0,
    },
  });
}

export async function rotasClientes(app: FastifyInstance) {
  const authOps = { onRequest: [(app as any).autenticar, soTipos("ROOT", "ADMIN", "GERENTE", "ATENDENTE")] };
  const authGestao = { onRequest: [(app as any).autenticar, soTipos("ROOT", "ADMIN", "GERENTE")] };

  app.get("/clientes", authOps, async (req) => {
    const busca = String((req.query as any)?.busca ?? "").trim();
    const limite = Math.min(50, Math.max(1, Number((req.query as any)?.limite ?? 20) || 20));
    const digitos = soDigitos(busca);
    const where = busca
      ? {
          ativo: true,
          OR: [
            { nome: { contains: busca } },
            ...(digitos ? [{ telefone: { contains: digitos } }] : []),
          ],
        }
      : { ativo: true };
    const clientes = await prisma.cliente.findMany({
      where,
      take: limite,
      orderBy: { nome: "asc" },
      include: {
        _count: { select: { enderecos: { where: { ativo: true } } } },
        atendimentos: { orderBy: { aberto_em: "desc" }, take: 1, select: { aberto_em: true } },
      },
    });
    return clientes.map((c) => ({
      id: c.id,
      nome: c.nome,
      telefone: c.telefone,
      enderecos_qtd: c._count.enderecos,
      ultimo_pedido_em: c.atendimentos[0]?.aberto_em ?? null,
    }));
  });

  app.get("/clientes/por-telefone/:telefone", authOps, async (req, reply) => {
    const telefone = soDigitos(String((req.params as any).telefone ?? ""));
    const cliente = await prisma.cliente.findFirst({
      where: { telefone, ativo: true },
      include: { enderecos: { where: { ativo: true } } },
    });
    if (!cliente) {
      return reply.code(404).send({ erro: "Cliente não encontrado", codigo: "cliente_nao_encontrado" });
    }
    return cliente;
  });

  app.get("/clientes/:id", authOps, async (req, reply) => {
    const id = Number((req.params as any).id);
    const cliente = await prisma.cliente.findUnique({
      where: { id },
      include: { enderecos: { where: { ativo: true }, orderBy: { principal: "desc" } } },
    });
    if (!cliente) return reply.code(404).send({ erro: "Cliente não encontrado", codigo: "cliente_nao_encontrado" });
    return cliente;
  });

  app.post("/clientes", authOps, async (req, reply) => {
    const body = req.body as { nome?: string; telefone?: string; telefone2?: string; observacao?: string; endereco?: EnderecoBody };
    const nome = body.nome?.trim() ?? "";
    const telefone = soDigitos(body.telefone ?? "");
    if (!nome) return reply.code(400).send({ erro: "Informe o nome", codigo: "dados_invalidos", campos: { nome: "Informe o nome" } });
    if (!telefoneValido(telefone)) {
      return reply.code(400).send({ erro: "Telefone precisa ter DDD e 10 ou 11 dígitos.", codigo: "telefone_invalido" });
    }
    try {
      const cliente = await prisma.$transaction(async (tx) => {
        const outro = await tx.cliente.findFirst({ where: { telefone, ativo: true } });
        if (outro) throw new ErroRegra(409, "telefone_em_uso", "Já existe um cliente com esse telefone.", { cliente_id: outro.id });
        return tx.cliente.create({
          data: {
            nome,
            telefone,
            telefone2: body.telefone2 ? soDigitos(body.telefone2) : null,
            observacao: body.observacao?.trim() || null,
          },
        });
      });
      if (body.endereco) await gravarEndereco(cliente.id, body.endereco, true);
      const completo = await prisma.cliente.findUnique({
        where: { id: cliente.id },
        include: { enderecos: { where: { ativo: true } } },
      });
      return reply.code(201).send(completo);
    } catch (err) {
      if (err instanceof ErroRegra) return reply.code(err.status).send(err.corpo());
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const outro = await prisma.cliente.findFirst({ where: { telefone, ativo: true } });
        return reply.code(409).send({ erro: "Já existe um cliente com esse telefone.", codigo: "telefone_em_uso", cliente_id: outro?.id });
      }
      throw err;
    }
  });

  app.patch("/clientes/:id", authOps, async (req, reply) => {
    const id = Number((req.params as any).id);
    const body = req.body as { nome?: string; telefone?: string; telefone2?: string; observacao?: string; ativo?: boolean };
    const atual = await prisma.cliente.findUnique({ where: { id } });
    if (!atual) return reply.code(404).send({ erro: "Cliente não encontrado", codigo: "cliente_nao_encontrado" });
    const tipo = (req.user as any).tipo as TipoUsuario;
    if (body.ativo === false && !["ROOT", "ADMIN", "GERENTE"].includes(tipo)) {
      return reply.code(403).send({ erro: "Só a gerência desativa cliente.", codigo: "sem_permissao" });
    }
    const data: Record<string, unknown> = {};
    if (body.nome !== undefined) data.nome = body.nome.trim();
    if (body.observacao !== undefined) data.observacao = body.observacao.trim() || null;
    if (body.telefone2 !== undefined) data.telefone2 = body.telefone2 ? soDigitos(body.telefone2) : null;
    if (body.ativo !== undefined) data.ativo = body.ativo;
    let telefoneNovo: string | null = null;
    if (body.telefone !== undefined) {
      telefoneNovo = soDigitos(body.telefone);
      if (!telefoneValido(telefoneNovo)) {
        return reply.code(400).send({ erro: "Telefone precisa ter DDD e 10 ou 11 dígitos.", codigo: "telefone_invalido" });
      }
      data.telefone = telefoneNovo;
    }
    try {
      const up = await prisma.$transaction(async (tx) => {
        if (telefoneNovo && telefoneNovo !== atual.telefone) {
          const outro = await tx.cliente.findFirst({ where: { telefone: telefoneNovo, ativo: true, NOT: { id } } });
          if (outro) throw new ErroRegra(409, "telefone_em_uso", "Já existe um cliente com esse telefone.", { cliente_id: outro.id });
        }
        return tx.cliente.update({ where: { id }, data });
      });
      const usuario_id = Number((req.user as any).id);
      if (body.ativo === false) {
        await registrarAuditoria(prisma, { usuario_id, tipo: "cliente.desativado", entidade: "Cliente", entidade_id: id, sensivel: false });
      }
      if (telefoneNovo && telefoneNovo !== atual.telefone) {
        await registrarAuditoria(prisma, {
          usuario_id,
          tipo: "cliente.telefone_alterado",
          entidade: "Cliente",
          entidade_id: id,
          valor_antes: { telefone: atual.telefone },
          valor_depois: { telefone: telefoneNovo },
        });
      }
      return up;
    } catch (err) {
      if (err instanceof ErroRegra) return reply.code(err.status).send(err.corpo());
      throw err;
    }
  });

  app.post("/clientes/:id/enderecos", authOps, async (req, reply) => {
    const id = Number((req.params as any).id);
    const cliente = await prisma.cliente.findUnique({ where: { id } });
    if (!cliente) return reply.code(404).send({ erro: "Cliente não encontrado", codigo: "cliente_nao_encontrado" });
    try {
      const endereco = await gravarEndereco(id, (req.body ?? {}) as EnderecoBody, false);
      return reply.code(201).send(endereco);
    } catch (err) {
      if (err instanceof ErroRegra) return reply.code(err.status).send(err.corpo());
      throw err;
    }
  });

  app.patch("/clientes/:id/enderecos/:eid", authOps, async (req, reply) => {
    const id = Number((req.params as any).id);
    const eid = Number((req.params as any).eid);
    const atual = await prisma.cliente_endereco.findFirst({ where: { id: eid, cliente_id: id } });
    if (!atual) return reply.code(404).send({ erro: "Endereço não encontrado", codigo: "endereco_nao_encontrado" });
    const body = (req.body ?? {}) as EnderecoBody & { ativo?: boolean; principal?: boolean };
    try {
      const base =
        body.logradouro || body.bairro || body.cidade || body.uf
          ? validarEndereco({
              logradouro: body.logradouro ?? atual.logradouro,
              bairro: body.bairro ?? atual.bairro,
              cidade: body.cidade ?? atual.cidade,
              uf: body.uf ?? atual.uf,
            })
          : null;
      const data: Record<string, unknown> = {};
      if (base) Object.assign(data, base);
      if (body.apelido !== undefined) data.apelido = body.apelido.trim() || null;
      if (body.numero !== undefined) data.numero = body.numero.trim() || null;
      if (body.sem_numero !== undefined) data.sem_numero = body.sem_numero;
      if (body.complemento !== undefined) data.complemento = body.complemento.trim() || null;
      if (body.referencia !== undefined) data.referencia = body.referencia.trim() || null;
      if (body.cep !== undefined) data.cep = body.cep ? soDigitos(body.cep) : null;
      if (body.ativo !== undefined) data.ativo = body.ativo;
      if (body.principal) {
        await prisma.cliente_endereco.updateMany({ where: { cliente_id: id }, data: { principal: false } });
        data.principal = true;
      }
      if (body.lat != null && body.lng != null) {
        data.lat = body.lat;
        data.lng = body.lng;
        data.geo_origem = "manual";
      }
      return prisma.cliente_endereco.update({ where: { id: eid }, data });
    } catch (err) {
      if (err instanceof ErroRegra) return reply.code(err.status).send(err.corpo());
      throw err;
    }
  });

  app.get("/clientes/:id/historico", authOps, async (req, reply) => {
    const id = Number((req.params as any).id);
    const pagina = Math.max(1, Number((req.query as any)?.pagina ?? 1) || 1);
    const limite = 20;
    const cliente = await prisma.cliente.findUnique({ where: { id } });
    if (!cliente) return reply.code(404).send({ erro: "Cliente não encontrado", codigo: "cliente_nao_encontrado" });
    const where = { cliente_id: id };
    const [total, itens] = await Promise.all([
      prisma.atendimento.count({ where }),
      prisma.atendimento.findMany({
        where,
        orderBy: { aberto_em: "desc" },
        skip: (pagina - 1) * limite,
        take: limite,
        include: { pedidos: { include: { itens: true } } },
      }),
    ]);
    const pagos = await prisma.atendimento.findMany({
      where: { cliente_id: id, status: "FECHADO" },
      select: { total_centavos: true },
    });
    return {
      itens: itens.map((at) => ({
        atendimento_id: at.id,
        codigo: at.codigo_atendimento,
        tipo: at.tipo_atendimento,
        status: at.status,
        total_centavos: at.total_centavos ?? 0,
        aberto_em: at.aberto_em,
        itens_resumo: at.pedidos
          .flatMap((p) => p.itens)
          .filter((i) => !i.cancelado)
          .map((i) => `${i.quantidade}x ${i.nome_produto}`)
          .join(", "),
      })),
      total_gasto_centavos: pagos.reduce((s, a) => s + (a.total_centavos ?? 0), 0),
      qtd_pedidos: total,
      pagina,
      paginas: Math.max(1, Math.ceil(total / limite)),
    };
  });
}
