import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";

/** Árvore pronta pra tela de cardápio: categorias → produtos → variantes */
export async function rotasCardapio(app: FastifyInstance) {
  const auth = { onRequest: [(app as any).autenticar] };

  app.get("/cardapio", auth, async () => {
    const categorias = await prisma.categoria.findMany({
      where: { ativo: true },
      orderBy: { ordem: "asc" },
      include: {
        produtos: {
          where: { ativo: true },
          orderBy: { nome: "asc" },
          include: {
            produto_variantes: {
              where: { ativo: true },
              orderBy: { id: "asc" },
              select: {
                id: true,
                nome: true,
                preco_centavos: true,
                caminho_imagem: true,
                grupos_escolhas: {
                  where: { ativo: true },
                  orderBy: { ordem: "asc" },
                  select: {
                    id: true,
                    nome: true,
                    min_escolhas: true,
                    max_escolhas: true,
                    permite_repetir: true,
                    ordem: true,
                    opcoes_escolha: {
                      where: { ativo: true },
                      orderBy: { ordem: "asc" },
                      select: {
                        id: true,
                        nome: true,
                        preco_extra_centavos: true,
                        ordem: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        _count: { select: { produtos: { where: { ativo: true } } } },
      },
    });

    return categorias.map((c) => ({
      id: c.id,
      nome: c.nome,
      ordem: c.ordem,
      qtd_produtos: c._count.produtos,
      produtos: c.produtos.map((p) => ({
        id: p.id,
        nome: p.nome,
        descricao: p.descricao,
        caminho_imagem: p.caminho_imagem,
        exige_preparo: p.exige_preparo,
        variantes: p.produto_variantes,
        preco_desde_centavos: (p.produto_variantes.length ? Math.min(...p.produto_variantes.map(v => v.preco_centavos)) : null),
      })),
    }));
  });

  /** Cardápio pro PDV: inclui adicionais da categoria menos exclusões do produto. */
  app.get("/cardapio/pdv", auth, async () => {
    const categorias = await prisma.categoria.findMany({
      where: { ativo: true },
      orderBy: { ordem: "asc" },
      include: {
        grupos_adicionais: {
          include: {
            grupo_adicionais: {
              include: {
                adicionais: {
                  where: { ativo: true },
                  orderBy: { ordem: "asc" },
                  include: {
                    adicional_variantes: {
                      where: { ativo: true },
                      orderBy: { id: "asc" },
                      select: { id: true, nome: true, preco_centavos: true },
                    },
                  },
                },
                produtos_excluidos: { select: { produto_id: true } },
              },
            },
          },
        },
        produtos: {
          where: { ativo: true },
          orderBy: { nome: "asc" },
          include: {
            produto_variantes: {
              where: { ativo: true },
              orderBy: { id: "asc" },
              include: {
                grupos_escolhas: {
                  where: { ativo: true },
                  orderBy: { ordem: "asc" },
                  include: {
                    opcoes_escolha: {
                      where: { ativo: true },
                      orderBy: { ordem: "asc" },
                      select: {
                        id: true,
                        nome: true,
                        preco_extra_centavos: true,
                        ordem: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    return categorias.map((c) => ({
      id: c.id,
      nome: c.nome,
      ordem: c.ordem,
      produtos: c.produtos.map((p) => {
        const gruposAd = c.grupos_adicionais
          .map((lig) => lig.grupo_adicionais)
          .filter((g) => g.ativo)
          .filter((g) => !g.produtos_excluidos.some((ex) => ex.produto_id === p.id))
          .sort((a, b) => a.ordem - b.ordem)
          .map((g) => ({
            id: g.id,
            nome: g.nome,
            ordem: g.ordem,
            adicionais: g.adicionais.map((a) => ({
              id: a.id,
              nome: a.nome,
              qtd_max: a.qtd_max,
              variantes: a.adicional_variantes,
            })),
          }));

        return {
          id: p.id,
          nome: p.nome,
          descricao: p.descricao,
          caminho_imagem: p.caminho_imagem,
          exige_preparo: p.exige_preparo,
          esgotado: p.esgotado,
          variantes: p.produto_variantes.map((v) => ({
            id: v.id,
            nome: v.nome,
            preco_centavos: v.preco_centavos,
            esgotado: v.esgotado,
            grupos_escolhas: v.grupos_escolhas.map((g) => ({
              id: g.id,
              nome: g.nome,
              min_escolhas: g.min_escolhas,
              max_escolhas: g.max_escolhas,
              permite_repetir: g.permite_repetir,
              ordem: g.ordem,
              opcoes: g.opcoes_escolha,
            })),
          })),
          grupos_adicionais: gruposAd,
          preco_desde_centavos: (p.produto_variantes.length ? Math.min(...p.produto_variantes.map(v => v.preco_centavos)) : null),
        };
      }),
    }));
  });
}
