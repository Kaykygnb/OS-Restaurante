export type OpcaoEscolha = {
  id: number;
  nome: string;
  preco_extra_centavos: number;
  ordem: number;
};

export type GrupoEscolhas = {
  id: number;
  nome: string;
  min_escolhas: number;
  max_escolhas: number;
  permite_repetir: boolean;
  ordem: number;
  opcoes_escolha: OpcaoEscolha[];
};

export type Variante = {
  id: number;
  nome: string;
  preco_centavos: number;
  grupos_escolhas?: GrupoEscolhas[];
};

export type Produto = {
  id: number;
  nome: string;
  descricao: string | null;
  caminho_imagem?: string | null;
  exige_preparo: boolean;
  variantes: Variante[];
  preco_desde_centavos: number | null;
};

export type CategoriaCardapio = {
  id: number;
  nome: string;
  ordem: number;
  qtd_produtos: number;
  produtos: Produto[];
};

export type LinhaVariante = { chave: string; id?: number; nome: string; preco: string };

export type GrupoAdicionais = {
  id: number;
  nome: string;
  ordem: number;
  categorias: { categoria_id: number; categoria: { id: number; nome: string } }[];
  adicionais: {
    id: number;
    nome: string;
    caminho_imagem?: string | null;
    qtd_max: number;
    adicional_variantes: Variante[];
  }[];
  produtos_excluidos: {
    produto_id: number;
    produto: { id: number; nome: string; categoria_id: number };
  }[];
};
