import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { ehGestor, exigirCaixa, soTipos, type TipoUsuario } from "../permissoes.js";
import { registrarAuditoria } from "../operacao/auditoria.js";
import { validarPinGerente } from "../operacao/pin.js";
import { formatarDinheiroEscpos } from "../impressao/escpos.js";
import { imprimirRelatorioCaixa, linhasFechamentoCaixa } from "../impressao/relatorio-caixa.js";
import { estadoGaveta, pulsarGaveta } from "../servicos/gaveta.js";
import { configEstoque, resetarEsgotados } from "../servicos/estoque.js";
import { inicioDoDiaLocal } from "../util/horario.js";
import { ErroRegra } from "../util/erros.js";
import { publicar } from "../eventos/barramento.js";
import { apresentarFormas, esperadoPorForma, sessaoDeOutroDia, sessaoParaTela } from "../servicos/caixa-visao.js";

async function sessaoAberta() {
  return prisma.caixa_sessao.findFirst({
    where: { aberta: true },
    orderBy: { aberto_em: "desc" },
    include: {
      usuario_abertura: { select: { id: true, nome: true } },
      _count: { select: { pagamentos: true, movimentacoes: true } },
    },
  });
}

export async function rotasCaixa(app: FastifyInstance) {
  const authOps = {
    onRequest: [(app as any).autenticar, soTipos("ROOT", "ADMIN", "GERENTE", "ATENDENTE")],
  };
  const authCaixa = {
    onRequest: [(app as any).autenticar, soTipos("ROOT", "ADMIN", "GERENTE", "ATENDENTE"), exigirCaixa()],
  };
  const authGestao = {
    onRequest: [(app as any).autenticar, soTipos("ROOT", "ADMIN", "GERENTE"), exigirCaixa()],
  };

  app.get("/formas-pagamento", authOps, async () => {
    return prisma.forma_pagamento.findMany({
      where: { ativo: true },
      orderBy: { ordem: "asc" },
    });
  });

  app.get("/caixa/atual", authCaixa, async (req) => {
    const s = await sessaoAberta();
    const gaveta = await estadoGaveta();
    const gestor = ehGestor((req.user as any).tipo);
    return {
      aberto: Boolean(s),
      sessao: sessaoParaTela(s as any, gestor),
      sessao_anterior: Boolean(s && sessaoDeOutroDia(s.aberto_em)),
      gaveta: { disponivel: gaveta.disponivel, ...(gaveta.disponivel ? {} : { motivo: gaveta.motivo }) },
      tem_gaveta_disponivel: gaveta.disponivel,
    };
  });

  app.get("/caixa/previa", authCaixa, async (req, reply) => {
    const s = await sessaoAberta();
    if (!s) return reply.code(409).send({ erro: "O caixa está fechado.", codigo: "caixa_fechado" });
    const gestor = ehGestor((req.user as any).tipo);
    const formas = apresentarFormas(await esperadoPorForma(s.id), gestor, false);
    const movimentos = gestor ? await prisma.movimentacao_caixa.findMany({ where: { caixa_sessao_id: s.id } }) : [];
    const pagamentos = gestor ? await prisma.pagamento.aggregate({ where: { caixa_sessao_id: s.id, estornado_em: null }, _sum: { valor_centavos: true } }) : null;
    const composicao = gestor ? { fundo_centavos: s.fundo_troco_centavos, recebimentos_centavos: pagamentos?._sum.valor_centavos ?? 0, suprimentos_centavos: movimentos.filter(m => m.tipo === "SUPRIMENTO").reduce((t,m) => t+m.valor_centavos,0), sangrias_centavos: movimentos.filter(m => m.tipo === "SANGRIA").reduce((t,m) => t+m.valor_centavos,0) } : undefined;
    return {
      sessao_id: s.id,
      sessao_anterior: sessaoDeOutroDia(s.aberto_em),
      formas,
      ...(composicao ? { composicao } : {}),
    };
  });

  app.post("/caixa/abrir", authCaixa, async (req, reply) => {
    const aberta = await sessaoAberta();
    if (aberta) {
      return reply.code(409).send({
        erro: "Já existe um caixa aberto. Feche a sessão anterior antes de abrir outra.",
        codigo: "caixa_ja_aberto",
        sessao_id: aberta.id,
        sessao_anterior: sessaoDeOutroDia(aberta.aberto_em),
      });
    }
    const fundo = Math.max(0, Math.round(Number((req.body as any)?.fundo_troco_centavos ?? 0)));
    const usuario_id = Number((req.user as any).id);
    let sessao;
    try {
      sessao = await prisma.$transaction(async (tx) => {
        const ja = await tx.caixa_sessao.findFirst({ where: { aberta: true } });
        if (ja) throw new ErroRegra(409, "caixa_ja_aberto", "Já existe um caixa aberto.");
        const criada = await tx.caixa_sessao.create({
          data: { usuario_abertura_id: usuario_id, fundo_troco_centavos: fundo, aberta: true },
          include: { usuario_abertura: { select: { id: true, nome: true } } },
        });
        const est = await configEstoque(tx);
        if (est.nivel >= 1 && est.resetDia) {
          const inicio = inicioDoDiaLocal();
          const anteriorHoje = await tx.caixa_sessao.count({
            where: { aberto_em: { gte: inicio }, id: { not: criada.id } },
          });
          if (anteriorHoje === 0) {
            await resetarEsgotados(tx);
            await registrarAuditoria(tx, {
              usuario_id,
              tipo: "estoque.esgotados_resetados",
              entidade: "Caixa_sessao",
              entidade_id: criada.id,
            });
          }
        }
        await registrarAuditoria(tx, {
          usuario_id,
          acao: "ABRIR_CAIXA",
          entidade: "Caixa_sessao",
          entidade_id: criada.id,
          detalhes: { fundo },
        });
        return criada;
      });
    } catch (err) {
      if (err instanceof ErroRegra) return reply.code(err.status).send(err.corpo());
      return reply.code(409).send({ erro: "Já existe um caixa aberto.", codigo: "caixa_ja_aberto" });
    }
    const impressao = await imprimirRelatorioCaixa({
      titulo: "ABERTURA DE CAIXA",
      operador: sessao.usuario_abertura.nome,
      linhas: [{ texto: "Fundo de troco", valor_centavos: fundo }],
    });
    publicar("caixa.aberto", sessao.id);
    const gaveta = "nao_usada" as const;
    return reply.code(201).send({ ...sessao, impressao, gaveta });
  });

  app.post("/caixa/:id/movimentacao", authCaixa, async (req, reply) => {
    const id = Number((req.params as any).id);
    const body = req.body as {
      tipo?: "SANGRIA" | "SUPRIMENTO";
      valor_centavos?: number;
      motivo?: string;
      pin?: string;
    };
    if (!Number.isFinite(id)) return reply.code(400).send({ erro: "ID inválido" });
    if (body.tipo !== "SANGRIA" && body.tipo !== "SUPRIMENTO") {
      return reply.code(400).send({ erro: "tipo inválido" });
    }
    const valor = Math.round(Number(body.valor_centavos));
    if (!Number.isFinite(valor) || valor <= 0) return reply.code(400).send({ erro: "Valor inválido" });
    const motivo = body.motivo?.trim();
    if (!motivo) return reply.code(400).send({ erro: "Informe o motivo" });

    const sessao = await prisma.caixa_sessao.findUnique({ where: { id } });
    if (!sessao?.aberta) {
      return reply.code(400).send({ erro: "Caixa não está aberto" });
    }

    const tipoUser = (req.user as any).tipo as TipoUsuario;
    let aprovadorId: number | null = null;
    if (body.tipo === "SANGRIA" && !["ROOT", "ADMIN", "GERENTE"].includes(tipoUser)) {
      const aprov = await validarPinGerente(body.pin, (body as any).aprovador_id);
      if (!aprov) {
        return reply.code(403).send({
          erro: `Sangria de ${formatarDinheiroEscpos(valor)} precisa do PIN de um gerente.`,
          codigo: "pin_invalido",
        });
      }
      aprovadorId = aprov.id;
    }

    const usuario_id = Number((req.user as any).id);
    const tipoMov = body.tipo;
    const { comIdempotencia } = await import("../operacao/idempotencia.js");
    return comIdempotencia(req, reply, `POST /caixa/${id}/movimentacoes`, async () => {
      const mov = await prisma.movimentacao_caixa.create({
        data: {
          caixa_sessao_id: id,
          tipo: tipoMov,
          valor_centavos: valor,
          motivo,
          usuario_id,
        },
      });
      await registrarAuditoria(prisma, {
        usuario_id,
        acao: tipoMov,
        entidade: "Movimentacao_caixa",
        entidade_id: mov.id,
        detalhes: { valor, motivo, caixa_sessao_id: id, aprovadorId },
      });
      const operador = await prisma.usuario.findUnique({
        where: { id: usuario_id },
        select: { nome: true },
      });
      const impressao = await imprimirRelatorioCaixa({
        titulo: tipoMov,
        operador: operador?.nome || "—",
        linhas: [
          { texto: motivo.slice(0, 32) },
          { texto: "Valor", valor_centavos: valor },
        ],
        abrir_gaveta: false,
      });
      const gaveta = await pulsarGaveta();
      if (gaveta === "falhou") {
        await registrarAuditoria(prisma, {
          usuario_id,
          tipo: "caixa.gaveta_falhou",
          detalhes: { operacao: tipoMov },
        });
      }
      publicar("caixa.atualizado", id);
      return { status: 201, corpo: { ...mov, impressao, gaveta } };
    });
  });

  app.post("/caixa/:id/fechar", authCaixa, async (req, reply) => {
    const id = Number((req.params as any).id);
    const body = (req.body ?? {}) as {
      valor_informado_centavos?: number;
      contagem?: { forma_pagamento_id?: number; valor_centavos?: number }[];
      forcar?: boolean;
      motivo?: string;
      aprovacao?: { aprovador_id?: number; pin?: string };
    };
    if (!Number.isFinite(id)) {
      return reply.code(400).send({ erro: "Caixa inválido.", codigo: "valor_invalido" });
    }
    const gestor = ehGestor((req.user as any).tipo);
    const abertas = await prisma.atendimento.findMany({
      where: { status: "ABERTO" },
      select: { id: true, codigo_atendimento: true, mesa: { select: { numero: true } } },
    });
    if (abertas.length && !body.forcar) {
      return reply.code(409).send({
        erro: "Ainda há contas abertas. Feche as contas ou confirme com motivo.",
        codigo: "contas_abertas",
        contas: abertas,
      });
    }
    if (abertas.length && body.forcar && !body.motivo?.trim()) {
      return reply.code(400).send({ erro: "Informe o motivo para fechar com contas abertas.", codigo: "motivo_obrigatorio" });
    }
    const sessao = await prisma.caixa_sessao.findUnique({
      where: { id },
      include: { pagamentos: { include: { forma_pagamento: true } }, movimentacoes: true },
    });
    if (!sessao || !sessao.aberta) {
      return reply.code(400).send({ erro: "Caixa não está aberto.", codigo: "caixa_fechado" });
    }

    const base = await esperadoPorForma(id);
    const contados = new Map<number, number>();
    if (Array.isArray(body.contagem)) {
      for (const item of body.contagem) {
        const formaId = Number(item.forma_pagamento_id);
        const valor = Math.round(Number(item.valor_centavos));
        if (!Number.isFinite(formaId) || !Number.isFinite(valor) || valor < 0) {
          return reply.code(400).send({ erro: "Informe o valor contado de cada forma.", codigo: "valor_invalido" });
        }
        contados.set(formaId, valor);
      }
    } else if (Number.isFinite(Number(body.valor_informado_centavos)) && Number(body.valor_informado_centavos) >= 0) {
      const dinheiro = base.find((f) => f.eh_dinheiro);
      if (dinheiro) contados.set(dinheiro.forma_pagamento_id, Math.round(Number(body.valor_informado_centavos)));
      for (const forma of base) {
        if (!forma.eh_dinheiro) contados.set(forma.forma_pagamento_id, forma.esperado_centavos);
      }
    } else {
      return reply.code(400).send({ erro: "Informe o valor contado de cada forma.", codigo: "valor_invalido" });
    }
    const fechamento = base.map((forma) => {
      const contado = contados.get(forma.forma_pagamento_id) ?? 0;
      return { ...forma, contado_centavos: contado, diferenca_centavos: contado - forma.esperado_centavos };
    });
    const esperado = fechamento.reduce((s, f) => s + f.esperado_centavos, 0);
    const informado = fechamento.reduce((s, f) => s + f.contado_centavos, 0);
    const diferenca = informado - esperado;
    const falta = fechamento.some((f) => f.diferenca_centavos < 0);
    const usuario_id = Number((req.user as any).id);
    let aprovadorId: number | null = null;
    if (falta) {
      if (!body.motivo?.trim()) {
        return reply.code(400).send({ erro: "A falta no caixa precisa de um motivo.", codigo: "motivo_obrigatorio" });
      }
      const aprov = await validarPinGerente(body.aprovacao?.pin, body.aprovacao?.aprovador_id);
      if (!aprov || !ehGestor(aprov.tipo_usuario)) {
        return reply.code(403).send({
          erro: "A falta no caixa precisa da aprovação de um gerente.",
          codigo: "aprovacao_necessaria",
        });
      }
      aprovadorId = aprov.id;
    }
    const cfg = await prisma.configuracao.findFirst({ orderBy: { id: "asc" } });
    const limiteDif = cfg?.alerta_dif_caixa_centavos ?? 1000;
    const tipoEvento = abertas.length
      ? "caixa.fechado_forcado"
      : falta || Math.abs(diferenca) > limiteDif
        ? "caixa.fechado_com_diferenca"
        : "caixa.fechado";

    const trava = await prisma.caixa_sessao.updateMany({
      where: { id, aberta: true },
      data: {
        aberta: false,
        fechado_em: new Date(),
        usuario_fechamento_id: usuario_id,
        valor_esperado_centavos: esperado,
        valor_informado_centavos: informado,
        diferenca_centavos: diferenca,
        contagem_json: JSON.stringify(fechamento),
      },
    });
    if (trava.count !== 1) {
      return reply.code(409).send({ erro: "O caixa já foi fechado.", codigo: "caixa_ja_fechado" });
    }
    const evento = await registrarAuditoria(prisma, {
      usuario_id,
      tipo: tipoEvento,
      sensivel: tipoEvento !== "caixa.fechado",
      entidade: "Caixa_sessao",
      entidade_id: id,
      valor_centavos: diferenca,
      motivo: body.motivo?.trim() || null,
      aprovador_id: aprovadorId,
      aprovado_com_pin: Boolean(aprovadorId),
      detalhes: { esperado, informado, diferenca, formas: fechamento, contas_abertas: abertas.length },
    });
    const operador = await prisma.usuario.findUnique({ where: { id: usuario_id }, select: { nome: true } });
    const linhas: { texto: string; valor_centavos?: number }[] = fechamento.flatMap((forma) => [
      { texto: forma.nome, valor_centavos: forma.contado_centavos },
      { texto: `Esp ${forma.nome}`.slice(0, 24), valor_centavos: forma.esperado_centavos },
      { texto: "Diferença", valor_centavos: forma.diferenca_centavos },
    ]);
    const conferencia = `${evento.id}:${evento.hash.slice(0, 8)}`;
    linhas.push({ texto: `Conferência ${conferencia}` });
    let impressao: unknown = { status: "falhou" };
    try {
      impressao = await imprimirRelatorioCaixa({
        titulo: "FECHAMENTO DE CAIXA",
        operador: operador?.nome || "—",
        linhas,
      });
    } catch {
      impressao = { status: "falhou", aviso: "O fechamento vale. Dá para reimprimir." };
    }
    const fechada = await prisma.caixa_sessao.findUnique({ where: { id } });
    publicar("caixa.fechado", id);
    return {
      ...sessaoParaTela(fechada as any, gestor),
      formas: apresentarFormas(fechamento, gestor, true),
      impressao,
      gaveta: "nao_usada" as const,
      conferencia,
      pode_reimprimir: true,
    };
  });

  app.post("/caixa/:id/reimprimir", authCaixa, async (req, reply) => {
    const id = Number((req.params as any).id);
    const sessao = await prisma.caixa_sessao.findUnique({ where: { id } });
    if (!sessao?.fechado_em) return reply.code(400).send({ erro: "Esse caixa não está fechado.", codigo: "caixa_aberto" });
    const formas = sessao.contagem_json ? JSON.parse(sessao.contagem_json) : await esperadoPorForma(id);
    const operador = await prisma.usuario.findUnique({
      where: { id: Number((req.user as any).id) },
      select: { nome: true },
    });
    const linhas: { texto: string; valor_centavos?: number }[] = (formas as { nome: string; contado_centavos?: number; esperado_centavos: number; diferenca_centavos?: number }[]).flatMap(
      (forma) => [
        { texto: forma.nome, valor_centavos: forma.contado_centavos ?? forma.esperado_centavos },
        { texto: "Diferença", valor_centavos: forma.diferenca_centavos ?? 0 },
      ]
    );
    const ultimo = await prisma.evento_auditoria.findFirst({
      where: { alvo_id: id, tipo: { in: ["caixa.fechado", "caixa.fechado_com_diferenca", "caixa.fechado_forcado"] } },
      orderBy: { id: "desc" },
    });
    if (ultimo) linhas.push({ texto: `Conferência ${ultimo.id}:${ultimo.hash.slice(0, 8)}` });
    try {
      const impressao = await imprimirRelatorioCaixa({
        titulo: "FECHAMENTO DE CAIXA",
        operador: operador?.nome || "—",
        linhas,
      });
      return { ok: true, impressao };
    } catch {
      return reply.code(201).send({ ok: false, impressao: { status: "falhou" } });
    }
  });

  app.post("/caixa/gaveta", authCaixa, async (req, reply) => {
    const pin = (req.body as any)?.pin as string | undefined;
    const tipo = (req.user as any).tipo as TipoUsuario;
    const estado = await estadoGaveta();
    if (!estado.disponivel) {
      const codigo = estado.motivo === "desligada" ? "gaveta_nao_usada" : "sem_impressora";
      const erro = estado.motivo === "desligada" ? "A gaveta está desligada." : "Nenhuma impressora do caixa tem gaveta.";
      return reply.code(estado.motivo === "desligada" ? 409 : 400).send({ erro, codigo });
    }
    let aprovadorId: number | null = null;
    if (!["ROOT", "ADMIN", "GERENTE"].includes(tipo)) {
      const ok = await validarPinGerente(pin, (req.body as any)?.aprovador_id);
      if (!ok) {
        await registrarAuditoria(prisma, {
          usuario_id: Number((req.user as any).id),
          tipo: "pin.falhou",
          sensivel: true,
          resultado: "negado",
          codigo_erro: "pin_invalido",
          motivo: "caixa.gaveta_sem_venda",
        });
        return reply.code(403).send({ erro: "Para abrir a gaveta, peça o PIN de um gerente.", codigo: "pin_invalido" });
      }
      aprovadorId = ok.id;
    }
    const pulso = await pulsarGaveta();
    await registrarAuditoria(prisma, {
      usuario_id: Number((req.user as any).id),
      tipo: pulso === "falhou" ? "caixa.gaveta_falhou" : "caixa.gaveta_sem_venda",
      sensivel: true,
      aprovador_id: aprovadorId,
      aprovado_com_pin: Boolean(aprovadorId),
      detalhes: { sem_venda: true },
    });
    if (pulso === "falhou") {
      return reply.code(201).send({ ok: false, gaveta: pulso });
    }
    return { ok: true, gaveta: pulso };
  });
}
