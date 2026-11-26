import type { Prisma } from "../generated/prisma/client.js";
import { aplicarPromocoes, type Promo } from "../dominio/promocao.js";
import { ErroRegra } from "../util/erros.js";
import { nomeAdicionalCupom } from "../util/texto.js";
import { configEstoque } from "./estoque.js";

type Db = Prisma.TransactionClient;

export type ItemEntrada = {
  produto_variante_id: number;
  quantidade?: number;
  observacao?: string | null;
  escolhas?: { opcao_escolha_id: number; quantidade?: number }[];
  adicionais?: { adicional_variante_id: number; quantidade?: number }[];
};

export type ItemPreparado = {
  nome_produto: string;
  preco_centavos: number;
  preco_original_centavos: number;
  desconto_promocao_centavos: number;
  promocao_id: number | null;
  nome_promocao: string | null;
  quantidade: number;
  observacao: string | null;
  produto_variante_id: number;
  controla_estoque: boolean;
  escolhas: {
    nome_opcao: string;
    preco_extra_centavos: number;
    quantidade: number;
    opcao_escolha_id: number;
  }[];
  adicionais: {
    nome_adicional: string;
    preco_centavos: number;
    quantidade: number;
    adicional_variante_id: number;
  }[];
};

export async function prepararItens(
  tx: Db,
  itens: ItemEntrada[],
  opts: { tipoAtendimento: string; agora: Date }
): Promise<ItemPreparado[]> {
  if (!itens.length) throw new ErroRegra(400, "sem_itens", "Informe ao menos um item.");
  const estoque = await configEstoque(tx);
  const cfg = await tx.configuracao.findFirst({ orderBy: { id: "asc" } });
  const promosDb = cfg?.modulo_promocoes
    ? await tx.promocao.findMany({ where: { ativo: true }, include: { alvos: true } })
    : [];
  const promos: Promo[] = promosDb.map((p) => ({
    ...p,
    alvos: p.alvos.map((a) => ({
      produto_id: a.produto_id,
      produto_variante_id: a.produto_variante_id,
      categoria_id: a.categoria_id,
    })),
  }));

  const base: {
    produto_id: number;
    categoria_id: number;
    variante_id: number;
    nome_produto: string;
    preco: number;
    quantidade: number;
    observacao: string | null;
    controla: boolean;
    extras: number;
    escolhas: ItemPreparado["escolhas"];
    adicionais: ItemPreparado["adicionais"];
  }[] = [];

  for (const raw of itens) {
    const varianteId = Number(raw.produto_variante_id);
    const qtd = Math.round(Number(raw.quantidade ?? 1));
    if (!Number.isFinite(varianteId)) throw new ErroRegra(400, "item_invalido", "Produto inválido.");
    if (!Number.isFinite(qtd) || qtd < 1 || qtd > 99) {
      throw new ErroRegra(400, "quantidade_invalida", "A quantidade deve ficar entre 1 e 99.");
    }
    const obs = raw.observacao?.trim() || null;
    if (obs && obs.length > 180) throw new ErroRegra(400, "observacao_longa", "A observação é longa demais.");

    const variante = await tx.produto_variante.findUnique({
      where: { id: varianteId },
      include: {
        produto: true,
        grupos_escolhas: {
          where: { ativo: true },
          include: { opcoes_escolha: { where: { ativo: true } } },
        },
      },
    });
    if (!variante || !variante.ativo || !variante.produto.ativo) {
      throw new ErroRegra(400, "item_indisponivel", "Esse produto não está disponível.");
    }
    if (estoque.nivel >= 1 && (variante.esgotado || variante.produto.esgotado)) {
      throw new ErroRegra(409, "esgotado", `${variante.produto.nome} está esgotado.`, {
        produto_variante_id: variante.id,
      });
    }

    const nome =
      variante.nome.toLowerCase() === "padrão" || variante.nome.toLowerCase() === "padrao"
        ? variante.produto.nome
        : `${variante.produto.nome} - ${variante.nome}`;

    const escolhasIn = Array.isArray(raw.escolhas) ? raw.escolhas : [];
    const conhecidas = new Set(variante.grupos_escolhas.flatMap((g) => g.opcoes_escolha.map((o) => o.id)));
    for (const escolha of escolhasIn) {
      if (!conhecidas.has(Number(escolha.opcao_escolha_id))) {
        throw new ErroRegra(400, "opcao_desconhecida", "Uma das opções não pertence a este produto.");
      }
    }
    const escolhas: ItemPreparado["escolhas"] = [];
    for (const grupo of variante.grupos_escolhas) {
      const doGrupo = escolhasIn.filter((e) => grupo.opcoes_escolha.some((o) => o.id === Number(e.opcao_escolha_id)));
      const somado = new Map<number, number>();
      for (const escolha of doGrupo) {
        const id = Number(escolha.opcao_escolha_id);
        const eq = Math.max(1, Math.round(Number(escolha.quantidade ?? 1)));
        somado.set(id, (somado.get(id) ?? 0) + eq);
      }
      let total = 0;
      for (const [id, eq] of somado) {
        const op = grupo.opcoes_escolha.find((o) => o.id === id)!;
        if (estoque.nivel >= 1 && op.esgotado) {
          throw new ErroRegra(409, "esgotado", `${op.nome} está esgotado.`);
        }
        if (!grupo.permite_repetir && eq > 1) {
          throw new ErroRegra(400, "opcao_repetida", `No grupo ${grupo.nome} não dá para repetir a opção.`);
        }
        total += eq;
        escolhas.push({
          opcao_escolha_id: op.id,
          nome_opcao: op.nome,
          preco_extra_centavos: op.preco_extra_centavos,
          quantidade: eq,
        });
      }
      if (total < grupo.min_escolhas) {
        throw new ErroRegra(400, "escolha_minima", `Em ${grupo.nome}, escolha pelo menos ${grupo.min_escolhas}.`);
      }
      if (total > grupo.max_escolhas) {
        throw new ErroRegra(400, "escolha_maxima", `Em ${grupo.nome}, o máximo é ${grupo.max_escolhas}.`);
      }
    }

    const adicionaisIn = Array.isArray(raw.adicionais) ? raw.adicionais : [];
    const somados = new Map<number, number>();
    for (const ad of adicionaisIn) {
      const id = Number(ad.adicional_variante_id);
      const q = Math.max(1, Math.round(Number(ad.quantidade ?? 1)));
      somados.set(id, (somados.get(id) ?? 0) + q);
    }
    const adicionais: ItemPreparado["adicionais"] = [];
    for (const [avId, aq] of somados) {
      const av = await tx.adicional_variante.findUnique({
        where: { id: avId },
        include: {
          adicional: {
            include: { grupo_adicionais: { include: { categorias: true, produtos_excluidos: true } } },
          },
        },
      });
      if (!av || !av.ativo || !av.adicional.ativo || !av.adicional.grupo_adicionais.ativo) {
        throw new ErroRegra(400, "adicional_indisponivel", "Um adicional não está disponível.");
      }
      if (estoque.nivel >= 1 && av.esgotado) {
        throw new ErroRegra(409, "esgotado", `${av.adicional.nome} está esgotado.`);
      }
      if (aq > av.adicional.qtd_max) {
        throw new ErroRegra(400, "adicional_maximo", `O máximo de ${av.adicional.nome} é ${av.adicional.qtd_max}.`);
      }
      const grupo = av.adicional.grupo_adicionais;
      const ligado = grupo.categorias.some((c) => c.categoria_id === variante.produto.categoria_id);
      if (!ligado || grupo.produtos_excluidos.some((e) => e.produto_id === variante.produto.id)) {
        throw new ErroRegra(400, "adicional_invalido", `${av.adicional.nome} não entra neste produto.`);
      }
      adicionais.push({
        adicional_variante_id: av.id,
        nome_adicional: nomeAdicionalCupom(av.adicional.nome, av.nome),
        preco_centavos: av.preco_centavos,
        quantidade: aq,
      });
    }

    const extras =
      escolhas.reduce((s, e) => s + e.preco_extra_centavos * e.quantidade, 0) +
      adicionais.reduce((s, a) => s + a.preco_centavos * a.quantidade, 0);

    base.push({
      produto_id: variante.produto.id,
      categoria_id: variante.produto.categoria_id,
      variante_id: variante.id,
      nome_produto: nome,
      preco: variante.preco_centavos,
      quantidade: qtd,
      observacao: obs,
      controla: variante.produto.controla_estoque,
      extras,
      escolhas,
      adicionais,
    });
  }

  const aplicadas = aplicarPromocoes(
    base.map((b) => ({
      produto_id: b.produto_id,
      produto_variante_id: b.variante_id,
      categoria_id: b.categoria_id,
      quantidade: b.quantidade,
      preco_centavos: b.preco,
      extras_centavos: b.extras,
    })),
    promos,
    opts.agora,
    opts.tipoAtendimento
  );

  const usados = new Map<number, number>();
  const prontos = base.map((b, i) => {
    const promo = aplicadas[i] ?? { desconto_centavos: 0, promocao_id: null, nome_promocao: null };
    if (promo.promocao_id) usados.set(promo.promocao_id, (usados.get(promo.promocao_id) ?? 0) + 1);
    const desconto = promo.desconto_centavos;
    const cobravel = Math.max(0, b.preco * b.quantidade - desconto);
    const unitario = b.quantidade > 0 ? Math.round(cobravel / b.quantidade) : b.preco;
    return {
      nome_produto: b.nome_produto,
      preco_centavos: unitario,
      preco_original_centavos: b.preco,
      desconto_promocao_centavos: desconto,
      promocao_id: promo.promocao_id,
      nome_promocao: promo.nome_promocao,
      quantidade: b.quantidade,
      observacao: b.observacao,
      produto_variante_id: b.variante_id,
      controla_estoque: b.controla,
      escolhas: b.escolhas,
      adicionais: b.adicionais,
    } satisfies ItemPreparado;
  });

  for (const [id, qtd] of usados) {
    const promo = promos.find((p) => p.id === id);
    if (promo?.limite_total != null && promo.usos + qtd > promo.limite_total) {
      throw new ErroRegra(409, "promocao_esgotada", `A promoção ${promo.nome} atingiu o limite.`);
    }
    await tx.promocao.update({ where: { id }, data: { usos: { increment: qtd } } });
  }
  return prontos;
}
