/** Dados iniciais do mock (VITE_MOCK=1). Restaurante do Zé, igual às pranchas do redesenho. */

export type MockOpcao = { id: number; nome: string; preco_extra_centavos: number; ordem: number; esgotado?: boolean };
export type MockGrupoEsc = { id: number; nome: string; min_escolhas: number; max_escolhas: number; permite_repetir: boolean; ordem: number; opcoes: MockOpcao[] };
export type MockVariante = { id: number; nome: string; preco_centavos: number; grupos_escolhas: MockGrupoEsc[]; esgotado?: boolean };
export type MockAdicional = { id: number; nome: string; qtd_max: number; variantes: { id: number; nome: string; preco_centavos: number; esgotado?: boolean }[] };
export type MockProduto = {
  id: number;
  nome: string;
  descricao: string | null;
  caminho_imagem: null;
  exige_preparo: boolean;
  variantes: MockVariante[];
  grupos_adicionais: { id: number; nome: string; ordem: number; adicionais: MockAdicional[] }[];
  preco_desde_centavos: number;
};
export type MockCategoria = { id: number; nome: string; ordem: number; produtos: MockProduto[] };

let vid = 100;
function simples(id: number, nome: string, preco: number, preparo = true, extra: Partial<MockProduto> = {}): MockProduto {
  return {
    id,
    nome,
    descricao: null,
    caminho_imagem: null,
    exige_preparo: preparo,
    variantes: [{ id: vid++, nome: "Padrão", preco_centavos: preco, grupos_escolhas: [] }],
    grupos_adicionais: [],
    preco_desde_centavos: preco,
    ...extra,
  };
}

const extras = {
  id: 1,
  nome: "Extras",
  ordem: 1,
  adicionais: [
    { id: 1, nome: "Bacon", qtd_max: 5, variantes: [{ id: 1, nome: "Padrão", preco_centavos: 300 }] },
    { id: 2, nome: "Queijo extra", qtd_max: 5, variantes: [{ id: 2, nome: "Padrão", preco_centavos: 200 }] },
  ],
};

export function cardapioInicial(): MockCategoria[] {
  vid = 100;
  return [
    {
      id: 1,
      nome: "Pastéis",
      ordem: 1,
      produtos: [
        { ...simples(1, "Pastel de carne", 1050), grupos_adicionais: [extras] },
        { ...simples(2, "Pastel de queijo", 990), grupos_adicionais: [extras] },
        {
          id: 3,
          nome: "Pastel especial",
          descricao: "Carne, queijo e ovo",
          caminho_imagem: null,
          exige_preparo: true,
          variantes: [
            {
              id: 3,
              nome: "P",
              preco_centavos: 1200,
              grupos_escolhas: [
                {
                  id: 1,
                  nome: "Molho",
                  min_escolhas: 1,
                  max_escolhas: 2,
                  permite_repetir: false,
                  ordem: 1,
                  opcoes: [
                    { id: 1, nome: "Vinagrete", preco_extra_centavos: 0, ordem: 1 },
                    { id: 2, nome: "Catupiry", preco_extra_centavos: 250, ordem: 2 },
                    { id: 3, nome: "Pimenta", preco_extra_centavos: 0, ordem: 3 },
                  ],
                },
              ],
            },
            { id: 4, nome: "G", preco_centavos: 1890, grupos_escolhas: [] },
          ],
          grupos_adicionais: [extras],
          preco_desde_centavos: 1200,
        },
        simples(4, "Pastel de frango", 1050),
        simples(5, "Pastel de palmito", 1250),
      ],
    },
    {
      id: 2,
      nome: "Bebidas",
      ordem: 2,
      produtos: [
        simples(10, "Coca-Cola lata", 600, false),
        simples(11, "Guaraná lata", 600, false),
        simples(12, "Água sem gás", 400, false),
        { ...simples(13, "Suco de laranja", 900, false) },
      ],
    },
    { id: 3, nome: "Drinks", ordem: 3, produtos: [simples(20, "Caipirinha", 1800)] },
    { id: 4, nome: "Porções", ordem: 4, produtos: [simples(30, "Batata frita", 2200)] },
    { id: 5, nome: "Sobremesas", ordem: 5, produtos: [simples(40, "Açaí 300 ml", 1500)] },
  ];
}

export const USUARIOS = [
  { id: 1, nome: "Zé (dono)", usuario: "ze", senha: "1234", tipo: "ROOT", pode_operar_caixa: true },
  { id: 2, nome: "Marta", usuario: "marta", senha: "1234", tipo: "GERENTE", pode_operar_caixa: true },
  { id: 3, nome: "João", usuario: "joao", senha: "1234", tipo: "ATENDENTE", pode_operar_caixa: true },
  { id: 4, nome: "Ana", usuario: "ana", senha: "1234", tipo: "ATENDENTE", pode_operar_caixa: false },
  { id: 5, nome: "Beto", usuario: "beto", senha: "1234", tipo: "COZINHEIRO", pode_operar_caixa: false },
  { id: 6, nome: "Rafa", usuario: "rafa", senha: "1234", tipo: "ENTREGADOR", pode_operar_caixa: false },
] as const;

/** PIN de aprovação dos gerentes no mock. */
export const PIN_GERENTE = "1234";

export const FORMAS = [
  { id: 1, nome: "Dinheiro", eh_dinheiro: true, abre_gaveta: true, ordem: 1, ativo: true },
  { id: 2, nome: "Pix", eh_dinheiro: false, abre_gaveta: false, ordem: 2, ativo: true },
  { id: 3, nome: "Cartão", eh_dinheiro: false, abre_gaveta: false, ordem: 3, ativo: true },
  { id: 4, nome: "Vale-refeição", eh_dinheiro: false, abre_gaveta: false, ordem: 4, ativo: true },
];

/** Origem: "Rua do Restaurante, 10 · Centro" (Praça da Sé, SP). */
export const ORIGEM = { lat: -23.55052, lng: -46.633308 };

/** CEPs que o "ViaCEP" do mock conhece. */
export const CEPS: Record<string, { logradouro: string; bairro: string; cidade: string; uf: string }> = {
  "01310000": { logradouro: "Avenida Paulista", bairro: "Bela Vista", cidade: "São Paulo", uf: "SP" },
  "01001000": { logradouro: "Praça da Sé", bairro: "Sé", cidade: "São Paulo", uf: "SP" },
  "01020000": { logradouro: "Rua das Flores", bairro: "Centro", cidade: "São Paulo", uf: "SP" },
  "01430000": { logradouro: "Avenida Brasil", bairro: "Jardim América", cidade: "São Paulo", uf: "SP" },
  "04538133": { logradouro: "Avenida Brigadeiro Faria Lima", bairro: "Itaim Bibi", cidade: "São Paulo", uf: "SP" },
  "02000000": { logradouro: "Rua Longe Demais", bairro: "Santana Norte", cidade: "São Paulo", uf: "SP" },
};

/** "Nominatim" do mock: deslocamento (graus) a partir da origem por bairro. Bairro fora da lista = não localizado. */
export const BAIRROS_GEO: Record<string, [number, number]> = {
  centro: [0.012, 0.004],
  se: [0.002, 0.001],
  "bela vista": [0.016, -0.018],
  "jardim america": [0.024, -0.03],
  "itaim bibi": [0.035, -0.04],
  "santana norte": [-0.07, 0.01],
  liberdade: [0.008, 0.002],
};
