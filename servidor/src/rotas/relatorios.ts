import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { soTipos } from "../permissoes.js";
import { linhaItemCentavos } from "../operacao/totais.js";

const FUSO = "America/Sao_Paulo";

function diaCivil(data: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(data);
}

function horaCivil(data: Date) {
  const hora = new Intl.DateTimeFormat("en-GB", {
    timeZone: FUSO,
    hour: "2-digit",
    hourCycle: "h23",
  }).format(data);
  return Number(hora);
}

function inicioCivil(iso: string) {
  const [ano, mes, dia] = iso.split("-").map(Number);
  const meio = new Date(Date.UTC(ano ?? 1970, (mes ?? 1) - 1, dia ?? 1, 15, 0, 0));
  const texto = diaCivil(meio);
  const [a, m, d] = texto.split("-").map(Number);
  const probe = new Date(Date.UTC(a!, (m ?? 1) - 1, d!, 3, 0, 0));
  const partes = new Intl.DateTimeFormat("en-GB", {
    timeZone: FUSO,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(probe);
  const h = Number(partes.find((p) => p.type === "hour")?.value ?? "0");
  const min = Number(partes.find((p) => p.type === "minute")?.value ?? "0");
  return new Date(probe.getTime() - (h * 60 + min) * 60_000);
}

function somarDias(iso: string, dias: number) {
  const inicio = inicioCivil(iso);
  return diaCivil(new Date(inicio.getTime() + dias * 86_400_000 + 3_600_000));
}

function tipoRelatorio(tipo: string) {
  if (tipo === "ENTREGA") return "DELIVERY";
  return tipo;
}

function valorItem(item: {
  cancelado: boolean;
  quantidade: number;
  preco_centavos: number;
  preco_original_centavos?: number | null;
  desconto_promocao_centavos?: number | null;
  desconto_manual_centavos?: number | null;
  escolhas?: { preco_extra_centavos: number; quantidade: number }[];
  adicionais?: { preco_centavos: number; quantidade: number }[];
}) {
  return linhaItemCentavos({ ...item, cancelado: false });
}

export async function rotasRelatorios(app: FastifyInstance) {
  const authGestao = {
    onRequest: [(app as any).autenticar, soTipos("ROOT", "ADMIN", "GERENTE")],
  };

  app.get("/relatorios/dashboard", authGestao, async (req, reply) => {
    const query = req.query as { de?: string; ate?: string; sem_venda_dias?: string; limite?: string };
    const hoje = diaCivil(new Date());
    const de = query.de && /^\d{4}-\d{2}-\d{2}$/.test(query.de) ? query.de : hoje;
    const ate = query.ate && /^\d{4}-\d{2}-\d{2}$/.test(query.ate) ? query.ate : de;
    if (de > ate) {
      return reply.code(400).send({ erro: "A data inicial é depois da final.", codigo: "periodo_invalido" });
    }
    const inicio = inicioCivil(de);
    const fim = inicioCivil(somarDias(ate, 1));
    const duracao = fim.getTime() - inicio.getTime();
    const inicioAnterior = new Date(inicio.getTime() - duracao);
    const limite = Math.min(50, Math.max(1, Number(query.limite ?? 10) || 10));
    const semVendaDias = Math.max(1, Number(query.sem_venda_dias ?? 30) || 30);

    const incluir = {
      usuario: { select: { id: true, nome: true } },
      pedidos: { include: { itens: { include: { escolhas: true, adicionais: true, produto_variante: { select: { id: true, nome: true, produto: { select: { nome: true } } } } } } } },
      pagamentos: { include: { forma_pagamento: true } },
    } as const;

    const [atual, anterior] = await Promise.all([
      prisma.atendimento.findMany({
        where: { status: "FECHADO", fechado_em: { gte: inicio, lt: fim } },
        include: incluir,
      }),
      prisma.atendimento.findMany({
        where: { status: "FECHADO", fechado_em: { gte: inicioAnterior, lt: inicio } },
        select: { total_centavos: true, id: true },
      }),
    ]);

    const faturamento = (lista: { total_centavos: number | null }[]) =>
      lista.reduce((s, at) => s + (at.total_centavos ?? 0), 0);
    const fat = faturamento(atual);
    const fatAnt = faturamento(anterior);
    const qtd = atual.length;
    const qtdAnt = anterior.length;

    const porDia = new Map<string, { faturamento_centavos: number; atendimentos: number }>();
    for (let cursor = inicio.getTime(); cursor < fim.getTime(); cursor += 86_400_000) {
      porDia.set(diaCivil(new Date(cursor + 3_600_000)), { faturamento_centavos: 0, atendimentos: 0 });
    }
    const porHora = Array.from({ length: 24 }, (_, hora) => ({ hora, faturamento_centavos: 0, atendimentos: 0 }));
    const porTipo = new Map<string, { faturamento_centavos: number; atendimentos: number }>();
    const porForma = new Map<number, { nome: string; valor_centavos: number; qtd: number }>();
    const porGarcom = new Map<number, { nome: string; atendimentos: number; faturamento_centavos: number }>();
    const descontos = new Map<number, { nome: string; qtd: number; valor_centavos: number }>();
    const produtos = new Map<number, { nome: string; qtd: number; valor_centavos: number }>();

    for (const at of atual) {
      const total = at.total_centavos ?? 0;
      const quando = at.fechado_em ?? at.aberto_em;
      const dia = diaCivil(quando);
      const bucketDia = porDia.get(dia) ?? { faturamento_centavos: 0, atendimentos: 0 };
      bucketDia.faturamento_centavos += total;
      bucketDia.atendimentos += 1;
      porDia.set(dia, bucketDia);
      const hora = porHora[horaCivil(quando)];
      if (hora) {
        hora.faturamento_centavos += total;
        hora.atendimentos += 1;
      }
      const tipo = tipoRelatorio(at.tipo_atendimento);
      const bucketTipo = porTipo.get(tipo) ?? { faturamento_centavos: 0, atendimentos: 0 };
      bucketTipo.faturamento_centavos += total;
      bucketTipo.atendimentos += 1;
      porTipo.set(tipo, bucketTipo);
      const garcom = porGarcom.get(at.usuario_id) ?? { nome: at.usuario.nome, atendimentos: 0, faturamento_centavos: 0 };
      garcom.atendimentos += 1;
      garcom.faturamento_centavos += total;
      porGarcom.set(at.usuario_id, garcom);
      if ((at.total_desconto_centavos ?? at.desconto_centavos) > 0 && at.desconto_usuario_id) {
        const desc = descontos.get(at.desconto_usuario_id) ?? { nome: "", qtd: 0, valor_centavos: 0 };
        desc.qtd += 1;
        desc.valor_centavos += at.total_desconto_centavos ?? at.desconto_centavos;
        descontos.set(at.desconto_usuario_id, desc);
      }
      for (const pag of at.pagamentos) {
        if (pag.estornado_em) continue;
        const forma = porForma.get(pag.forma_pagamento_id) ?? { nome: pag.forma_pagamento.nome, valor_centavos: 0, qtd: 0 };
        forma.valor_centavos += pag.valor_centavos;
        forma.qtd += 1;
        porForma.set(pag.forma_pagamento_id, forma);
      }
      for (const pedido of at.pedidos) {
        for (const item of pedido.itens) {
          if (item.cancelado) continue;
          const nome =
            item.produto_variante.nome.toLowerCase() === "padrão"
              ? item.produto_variante.produto.nome
              : `${item.produto_variante.produto.nome} - ${item.produto_variante.nome}`;
          const atualProd = produtos.get(item.produto_variante_id) ?? { nome, qtd: 0, valor_centavos: 0 };
          atualProd.qtd += item.quantidade;
          atualProd.valor_centavos += valorItem(item);
          produtos.set(item.produto_variante_id, atualProd);
          if (item.desconto_manual_centavos > 0 && item.desconto_usuario_id) {
            const desc = descontos.get(item.desconto_usuario_id) ?? { nome: "", qtd: 0, valor_centavos: 0 };
            desc.qtd += 1;
            desc.valor_centavos += item.desconto_manual_centavos;
            descontos.set(item.desconto_usuario_id, desc);
          }
        }
      }
    }

    const cancelados = await prisma.pedido_item.findMany({
      where: { cancelado: true, cancelado_em: { gte: inicio, lt: fim } },
      include: {
        escolhas: true,
        adicionais: true,
        cancelado_usuario: { select: { id: true, nome: true } },
      },
    });
    const cancelamentos = new Map<number, { nome: string; qtd: number; valor_centavos: number }>();
    for (const item of cancelados) {
      const id = item.cancelado_usuario_id ?? 0;
      const nome = item.cancelado_usuario?.nome ?? "Sem usuário";
      const bucket = cancelamentos.get(id) ?? { nome, qtd: 0, valor_centavos: 0 };
      bucket.qtd += item.quantidade;
      bucket.valor_centavos += valorItem(item);
      cancelamentos.set(id, bucket);
    }

    const nomes = await prisma.usuario.findMany({
      where: { id: { in: [...descontos.keys()] } },
      select: { id: true, nome: true },
    });
    for (const usuario of nomes) {
      const desc = descontos.get(usuario.id);
      if (desc && !desc.nome) desc.nome = usuario.nome;
    }

    const ranking = [...produtos.entries()].map(([produto_variante_id, info]) => ({ produto_variante_id, ...info }));
    const porQtd = [...ranking].sort((a, b) => b.qtd - a.qtd || a.nome.localeCompare(b.nome, "pt-BR"));
    const porValor = [...ranking].sort((a, b) => b.valor_centavos - a.valor_centavos || a.nome.localeCompare(b.nome, "pt-BR"));

    const desde = new Date(Date.now() - semVendaDias * 86_400_000);
    const [variantes, ultimas] = await Promise.all([
      prisma.produto_variante.findMany({
        where: { ativo: true, produto: { ativo: true } },
        select: { id: true, nome: true, produto: { select: { nome: true } } },
      }),
      prisma.pedido_item.groupBy({
        by: ["produto_variante_id"],
        where: { cancelado: false, pedido: { atendimento: { status: "FECHADO" } } },
        _max: { createdAt: true },
      }),
    ]);
    const ultimaPorVariante = new Map(ultimas.map((u) => [u.produto_variante_id, u._max.createdAt]));
    const semVenda = variantes
      .map((variante) => {
        const ultima = ultimaPorVariante.get(variante.id) ?? null;
        if (ultima && ultima >= desde) return null;
        const nome = variante.nome.toLowerCase() === "padrão" ? variante.produto.nome : `${variante.produto.nome} - ${variante.nome}`;
        const dias = ultima ? Math.floor((Date.now() - ultima.getTime()) / 86_400_000) : null;
        return { produto_variante_id: variante.id, nome, dias_sem_venda: dias };
      })
      .filter((item): item is { produto_variante_id: number; nome: string; dias_sem_venda: number | null } => item != null)
      .sort((a, b) => (b.dias_sem_venda ?? 99999) - (a.dias_sem_venda ?? 99999));

    const [anoRel, mesRel] = de.split("-").map(Number);
    const mesPrev = mesRel === 1 ? 12 : (mesRel ?? 1) - 1;
    const anoPrev = mesRel === 1 ? (anoRel ?? 2026) - 1 : (anoRel ?? 2026);
    const inicioLargo = inicioCivil(`${anoPrev}-${String(mesPrev).padStart(2, "0")}-01`);
    const largos = await prisma.atendimento.findMany({
      where: { status: "FECHADO", fechado_em: { gte: inicioLargo, lt: fim } },
      select: { fechado_em: true, total_centavos: true },
    });
    const porDiaLargo = new Map<string, { faturamento_centavos: number; atendimentos: number }>();
    for (const conta of largos) {
      if (!conta.fechado_em) continue;
      const dia = diaCivil(conta.fechado_em);
      const bucket = porDiaLargo.get(dia) ?? { faturamento_centavos: 0, atendimentos: 0 };
      bucket.faturamento_centavos += conta.total_centavos ?? 0;
      bucket.atendimentos += 1;
      porDiaLargo.set(dia, bucket);
    }
    const vazio = () => ({ faturamento_centavos: 0, atendimentos: 0 });
    const somarDiasChave = (dias: string[]) =>
      dias.reduce((acc, dia) => {
        const bucket = porDiaLargo.get(dia);
        acc.faturamento_centavos += bucket?.faturamento_centavos ?? 0;
        acc.atendimentos += bucket?.atendimentos ?? 0;
        return acc;
      }, vazio());
    const diasIntervalo = (inicioIso: string, fimIso: string) => {
      const dias: string[] = [];
      let cursor = inicioIso;
      while (cursor <= fimIso) {
        dias.push(cursor);
        cursor = somarDias(cursor, 1);
      }
      return dias;
    };
    const semanaDe = (iso: string) => {
      const base = inicioCivil(iso);
      const nome = new Intl.DateTimeFormat("en-US", { timeZone: FUSO, weekday: "short" }).format(
        new Date(base.getTime() + 3_600_000)
      );
      const idx: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
      const diaSem = idx[nome] ?? 0;
      const delta = diaSem === 0 ? 6 : diaSem - 1;
      return somarDias(iso, -delta);
    };
    const por_dia_comparado = diasIntervalo(de, ate).map((dia) => {
      const anterior = somarDias(dia, -1);
      return { dia, ... (porDiaLargo.get(dia) ?? vazio()), anterior: { dia: anterior, ...(porDiaLargo.get(anterior) ?? vazio()) } };
    });
    const semanas = new Set(diasIntervalo(de, ate).map(semanaDe));
    const por_semana = [...semanas].map((inicioSemana) => {
      const fimSemana = somarDias(inicioSemana, 6);
      const inicioAnt = somarDias(inicioSemana, -7);
      return {
        inicio: inicioSemana,
        fim: fimSemana,
        ...somarDiasChave(diasIntervalo(inicioSemana, fimSemana)),
        anterior: { inicio: inicioAnt, fim: somarDias(inicioAnt, 6), ...somarDiasChave(diasIntervalo(inicioAnt, somarDias(inicioAnt, 6))) },
      };
    });
    const meses = new Set(diasIntervalo(de, ate).map((dia) => dia.slice(0, 7)));
    const por_mes = [...meses].map((mes) => {
      const [anoM, mesM] = mes.split("-").map(Number);
      const inicioMes = `${mes}-01`;
      const ultimo = new Date(Date.UTC(anoM ?? 2026, mesM ?? 1, 0)).getUTCDate();
      const fimMes = `${mes}-${String(ultimo).padStart(2, "0")}`;
      const mesAnteriorNum = mesM === 1 ? 12 : (mesM ?? 1) - 1;
      const anoAnteriorNum = mesM === 1 ? (anoM ?? 2026) - 1 : anoM ?? 2026;
      const mesAntTxt = `${anoAnteriorNum}-${String(mesAnteriorNum).padStart(2, "0")}`;
      const ultimoAnt = new Date(Date.UTC(anoAnteriorNum, mesAnteriorNum, 0)).getUTCDate();
      return {
        inicio: inicioMes,
        fim: fimMes,
        ...somarDiasChave(diasIntervalo(inicioMes, fimMes)),
        anterior: {
          inicio: `${mesAntTxt}-01`,
          fim: `${mesAntTxt}-${String(ultimoAnt).padStart(2, "0")}`,
          ...somarDiasChave(diasIntervalo(`${mesAntTxt}-01`, `${mesAntTxt}-${String(ultimoAnt).padStart(2, "0")}`)),
        },
      };
    });
    const funcionarios = new Map<number, { nome: string; cancelamentos_qtd: number; cancelamentos_centavos: number; descontos_qtd: number; descontos_centavos: number }>();
    for (const [usuario_id, info] of cancelamentos) {
      if (!usuario_id) continue;
      const atualFun = funcionarios.get(usuario_id) ?? { nome: info.nome, cancelamentos_qtd: 0, cancelamentos_centavos: 0, descontos_qtd: 0, descontos_centavos: 0 };
      atualFun.cancelamentos_qtd += info.qtd;
      atualFun.cancelamentos_centavos += info.valor_centavos;
      if (info.nome) atualFun.nome = info.nome;
      funcionarios.set(usuario_id, atualFun);
    }
    for (const [usuario_id, info] of descontos) {
      if (!usuario_id) continue;
      const atualFun = funcionarios.get(usuario_id) ?? { nome: info.nome, cancelamentos_qtd: 0, cancelamentos_centavos: 0, descontos_qtd: 0, descontos_centavos: 0 };
      atualFun.descontos_qtd += info.qtd;
      atualFun.descontos_centavos += info.valor_centavos;
      if (!atualFun.nome) atualFun.nome = info.nome;
      funcionarios.set(usuario_id, atualFun);
    }

    return {
      de,
      ate,
      fuso: FUSO,
      periodo_anterior: { de: diaCivil(inicioAnterior), ate: diaCivil(new Date(inicio.getTime() - 3_600_000)) },
      faturamento_centavos: fat,
      faturamento_anterior_centavos: fatAnt,
      variacao_faturamento_centavos: fat - fatAnt,
      ticket_medio_centavos: qtd ? Math.round(fat / qtd) : 0,
      ticket_medio_anterior_centavos: qtdAnt ? Math.round(fatAnt / qtdAnt) : 0,
      atendimentos: qtd,
      atendimentos_anterior: qtdAnt,
      por_dia: [...porDia.entries()].map(([dia, info]) => ({ dia, ...info })),
      por_hora: porHora,
      produtos_mais_vendidos_quantidade: porQtd.slice(0, limite),
      produtos_menos_vendidos_quantidade: [...porQtd].reverse().slice(0, limite),
      produtos_mais_vendidos_valor: porValor.slice(0, limite),
      produtos_menos_vendidos_valor: [...porValor].reverse().slice(0, limite),
      produtos_sem_venda: semVenda,
      por_tipo: [...porTipo.entries()].map(([tipo, info]) => ({ tipo, ...info })),
      por_forma_pagamento: [...porForma.entries()].map(([forma_pagamento_id, info]) => ({ forma_pagamento_id, ...info })),
      por_garcom: [...porGarcom.entries()].map(([usuario_id, info]) => ({
        usuario_id,
        nome: info.nome,
        atendimentos: info.atendimentos,
        faturamento_centavos: info.faturamento_centavos,
        ticket_medio_centavos: info.atendimentos ? Math.round(info.faturamento_centavos / info.atendimentos) : 0,
      })),
      cancelamentos_por_usuario: [...cancelamentos.entries()].map(([usuario_id, info]) => ({ usuario_id, ...info })),
      descontos_por_usuario: [...descontos.entries()].map(([usuario_id, info]) => ({ usuario_id, ...info })),
      faturamento_agregado: { por_dia: por_dia_comparado, por_semana, por_mes },
      por_funcionario: [...funcionarios.entries()].map(([usuario_id, info]) => ({ usuario_id, ...info })),
    };
  });
}
