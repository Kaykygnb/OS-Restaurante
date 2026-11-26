import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { soTipos } from "../permissoes.js";
import { ErroRegra } from "../util/erros.js";

type Opcao = { id?: number; nome: string; preco_extra_centavos: number };
type Grupo = { id?: number; nome: string; min_escolhas: number; max_escolhas: number; permite_repetir: boolean; opcoes: Opcao[] };
type Variante = { id?: number; nome: string; preco_centavos: number; grupos: Grupo[] };
type Cadastro = { nome: string; descricao?: string | null; caminho_imagem?: string | null; categoria_id: number; exige_preparo: boolean; controla_estoque?: boolean; variantes: Variante[] };
const erro = (texto: string) => { throw new ErroRegra(400, "cadastro_invalido", texto); };
function nome(valor: unknown, campo: string, minimo = 2) { if (typeof valor !== "string" || valor.trim().length < minimo) erro(`Informe ${campo} com pelo menos ${minimo} caractere(s).`); return (valor as string).trim(); }
function inteiro(valor: unknown, minimo: number, campo: string): number { if (typeof valor !== "number" || !Number.isSafeInteger(valor) || valor < minimo) erro(`${campo} inválido.`); return valor as number; }
function validar(body: Cadastro) {
  if (!body || typeof body !== "object") erro("Informe o cadastro do produto.");
  if (body.descricao != null && typeof body.descricao !== "string") erro("Descrição inválida.");
  if (body.caminho_imagem != null && typeof body.caminho_imagem !== "string") erro("Imagem inválida.");
  nome(body.nome, "o nome do produto"); inteiro(body.categoria_id, 1, "Categoria");
  if (typeof body.exige_preparo !== "boolean" || (body.controla_estoque !== undefined && typeof body.controla_estoque !== "boolean")) erro("Informe as opções de preparo e estoque.");
  if (!Array.isArray(body.variantes) || !body.variantes.length || body.variantes.length > 50) erro("Cadastre de 1 a 50 tamanhos ou apresentações.");
  const nomes = new Set<string>(); const ids = new Set<number>();
  for (const v of body.variantes) {
    if (!v || typeof v !== "object") erro("Apresentação inválida.");
    const n = nome(v.nome, "o nome da apresentação", 1).toLocaleLowerCase();
    if (nomes.has(n)) erro("As apresentações devem ter nomes diferentes."); nomes.add(n);
    if (v.id !== undefined) { inteiro(v.id, 1, "Apresentação"); if (ids.has(v.id)) erro("Apresentação repetida."); ids.add(v.id); }
    inteiro(v.preco_centavos, 0, "Preço");
    if (!Array.isArray(v.grupos) || v.grupos.length > 50) erro("Grupos de escolha inválidos.");
    const grupos = new Set<number>();
    for (const g of v.grupos) {
      if (!g || typeof g !== "object") erro("Grupo inválido.");
      nome(g.nome, "o nome do grupo"); inteiro(g.min_escolhas, 0, "Mínimo de escolhas"); inteiro(g.max_escolhas, 1, "Máximo de escolhas");
      if (g.min_escolhas > g.max_escolhas || typeof g.permite_repetir !== "boolean") erro("Confira os limites de escolha do grupo.");
      if (g.id !== undefined) { inteiro(g.id, 1, "Grupo"); if (grupos.has(g.id)) erro("Grupo repetido."); grupos.add(g.id); }
      if (!Array.isArray(g.opcoes) || !g.opcoes.length || g.opcoes.length > 100) erro("Cada grupo precisa ter de 1 a 100 opções.");
      if (!g.permite_repetir && g.min_escolhas > g.opcoes.length) erro("O mínimo de escolhas supera a quantidade de opções disponíveis.");
      const opcoes = new Set<number>();
      for (const o of g.opcoes) { if (!o || typeof o !== "object") erro("Opção inválida."); nome(o.nome, "o nome da opção", 1); inteiro(o.preco_extra_centavos, 0, "Preço adicional"); if (o.id !== undefined) { inteiro(o.id, 1, "Opção"); if (opcoes.has(o.id)) erro("Opção repetida."); opcoes.add(o.id); } }
    }
  }
}
export async function rotasCadastroProduto(app: FastifyInstance) {
  const auth = { onRequest: [(app as any).autenticar, soTipos("ROOT", "ADMIN", "GERENTE")] };
  const salvar = async (req: any, reply: any) => {
    try {
      const body = req.body as Cadastro; validar(body);
      const id = req.params.id === undefined ? undefined : inteiro(Number(req.params.id), 1, "Produto");
      const resultado = await prisma.$transaction(async tx => {
        const categoria = await tx.categoria.findFirst({ where: { id: body.categoria_id, ativo: true } });
        if (!categoria) erro("Escolha uma categoria ativa.");
        const atual = id ? await tx.produto.findUnique({ where: { id }, include: { produto_variantes: { include: { grupos_escolhas: { include: { opcoes_escolha: true } } } } } }) : null;
        if (id && !atual) throw new ErroRegra(404, "nao_encontrado", "Produto não encontrado.");
        const duplicado = await tx.produto.findFirst({ where: { nome: body.nome.trim(), categoria_id: body.categoria_id, ativo: true, ...(id ? { id: { not: id } } : {}) } });
        if (duplicado) throw new ErroRegra(409, "produto_duplicado", "Já existe um produto com esse nome na categoria.");
        const data = { nome: body.nome.trim(), descricao: body.descricao?.trim() || null, caminho_imagem: body.caminho_imagem ?? null, categoria_id: body.categoria_id, exige_preparo: body.exige_preparo, ...(body.controla_estoque !== undefined ? { controla_estoque: body.controla_estoque } : {}) };
        const produto = atual ? await tx.produto.update({ where: { id: atual.id }, data }) : await tx.produto.create({ data });
        const manter: number[] = [];
        for (const v of body.variantes) {
          const original = atual?.produto_variantes.find(x => x.id === v.id);
          if (v.id && !original) erro("Esta apresentação não pertence ao produto.");
          const dados = { nome: v.nome.trim(), preco_centavos: v.preco_centavos, ativo: true };
          const variante = original ? await tx.produto_variante.update({ where: { id: original.id }, data: dados }) : await tx.produto_variante.create({ data: { ...dados, produto_id: produto.id } });
          manter.push(variante.id); const manterGrupos: number[] = [];
          for (const [ordem, g] of v.grupos.entries()) {
            const originalG = original?.grupos_escolhas.find(x => x.id === g.id);
            if (g.id && !originalG) erro("Este grupo não pertence à apresentação.");
            const dadosG = { nome: g.nome.trim(), min_escolhas: g.min_escolhas, max_escolhas: g.max_escolhas, permite_repetir: g.permite_repetir, ordem, ativo: true };
            const grupo = originalG ? await tx.grupo_escolhas.update({ where: { id: originalG.id }, data: dadosG }) : await tx.grupo_escolhas.create({ data: { ...dadosG, produto_variante_id: variante.id } });
            manterGrupos.push(grupo.id); const manterOpcoes: number[] = [];
            for (const [ordemO, o] of g.opcoes.entries()) {
              if (o.id && !originalG?.opcoes_escolha.some(x => x.id === o.id)) erro("Esta opção não pertence ao grupo.");
              const dadosO = { nome: o.nome.trim(), preco_extra_centavos: o.preco_extra_centavos, ordem: ordemO, ativo: true };
              const opcao = o.id ? await tx.opcao_escolha.update({ where: { id: o.id }, data: dadosO }) : await tx.opcao_escolha.create({ data: { ...dadosO, grupo_escolhas_id: grupo.id } });
              manterOpcoes.push(opcao.id);
            }
            await tx.opcao_escolha.updateMany({ where: { grupo_escolhas_id: grupo.id, id: { notIn: manterOpcoes } }, data: { ativo: false } });
          }
          await tx.grupo_escolhas.updateMany({ where: { produto_variante_id: variante.id, id: { notIn: manterGrupos } }, data: { ativo: false } });
        }
        await tx.produto_variante.updateMany({ where: { produto_id: produto.id, id: { notIn: manter } }, data: { ativo: false } });
        return tx.produto.findUniqueOrThrow({ where: { id: produto.id }, include: { produto_variantes: { where: { ativo: true }, include: { grupos_escolhas: { where: { ativo: true }, include: { opcoes_escolha: { where: { ativo: true } } } } } } } });
      });
      return reply.code(id ? 200 : 201).send(resultado);
    } catch (e) { if (e instanceof ErroRegra) return reply.code(e.status).send(e.corpo()); throw e; }
  };
  app.post("/produtos/cadastro", auth, salvar);
  app.put("/produtos/:id/cadastro", auth, salvar);
}
