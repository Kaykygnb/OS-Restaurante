/**
 * Tipos das rotas novas, copiados de /workspace/os-restaurante-revisao/CONTRATOS.md (§1–10).
 * Se algo aqui não bater com o servidor, NÃO mude o tipo por conta própria: anote em web/PENDENCIAS-CONTRATO.md.
 * Dinheiro sempre em centavos inteiros; distância em metros inteiros.
 */

export type ErroApi = { erro: string; codigo: string; campos?: Record<string, string> };

export type Perfil = "ROOT" | "ADMIN" | "GERENTE" | "ATENDENTE" | "COZINHEIRO" | "ENTREGADOR";
export type Aprovacao = { aprovador_id: number; pin: string };

// ——— Login (§11) ———
export type LoginEntrada = { usuario: string; senha: string };
export type LoginResposta = { token: string; usuario: { id: number; nome: string; tipo: Perfil; pode_operar_caixa?: boolean } };
export type LoginErro =
  | { status: 401; codigo: "credenciais_invalidas"; erro: string }
  | { status: 429; codigo: "muitas_tentativas"; tentar_em_s: number };

// ——— §8 Módulos ———
export type Modulos = { estoque_nivel: 0 | 1 | 2 | 3 | 4; usa_gaveta: boolean; delivery: boolean; promocoes: boolean };

// ——— §1 Caixa e gaveta ———
export type GavetaEstado = { disponivel: boolean; motivo?: "desligada" | "sem_impressora" };
export type GavetaResultado = "aberta" | "nao_usada" | "falhou";
export type SessaoCaixa = {
  id: number;
  fundo_troco_centavos: number;
  aberto_em: string;
  usuario_abertura?: { id: number; nome: string };
  /** §10 + decisão do Kayky: código de conferência da auditoria impresso no fechamento. Só exibido. */
  codigo_conferencia?: string | null;
};
export type CaixaAtual = {
  aberto: boolean;
  sessao: SessaoCaixa | null;
  gaveta: GavetaEstado;
  /** Servidor do Fernando: a sessão aberta começou num dia anterior (fuso America/Sao_Paulo). Exige fechar antes de abrir outra. */
  sessao_anterior?: boolean;
  /** Campo antigo, mantido pelo servidor para a tela atual. */
  tem_gaveta_disponivel?: boolean;
};
/** GET /caixa/previa. esperado_centavos só vem para GERENTE+ (fechamento cego). */
export type CaixaPrevia = {
  composicao?: { fundo_centavos: number; recebimentos_centavos: number; suprimentos_centavos: number; sangrias_centavos: number };
  sessao_id: number;
  sessao_anterior: boolean;
  formas: { forma_pagamento_id: number; nome: string; esperado_centavos?: number }[];
};
/** POST /caixa/:id/fechar. Falta exige motivo + aprovação de GERENTE+ (403 aprovacao_necessaria). */
export type FecharCaixaEntrada = {
  contagem: { forma_pagamento_id: number; valor_centavos: number }[];
  motivo?: string;
  aprovacao?: Aprovacao;
};
export type FecharCaixaFormaResultado = { forma_pagamento_id: number; nome: string; contado_centavos: number; esperado_centavos?: number; diferenca_centavos?: number };

// ——— §2 Clientes ———
export type EnderecoInput = {
  apelido?: string;
  cep?: string;
  logradouro: string;
  numero?: string;
  sem_numero?: boolean;
  complemento?: string;
  bairro: string;
  cidade: string;
  uf: string;
  referencia?: string;
  lat?: number;
  lng?: number;
};
export type Endereco = EnderecoInput & {
  id: number;
  cliente_id: number;
  geo_origem: "manual" | "api" | "nenhuma";
  ativo: boolean;
  principal: boolean;
};
export type ClienteResumo = { id: number; nome: string; telefone: string; enderecos_qtd: number; ultimo_pedido_em?: string | null };
export type Cliente = {
  id: number;
  nome: string;
  telefone: string;
  telefone2?: string | null;
  observacao?: string | null;
  ativo: boolean;
  enderecos: Endereco[];
  qtd_pedidos?: number;
  ultimo_pedido_em?: string | null;
};
export type ClienteEntrada = { nome: string; telefone: string; telefone2?: string; observacao?: string; endereco?: EnderecoInput };
export type HistoricoCliente = {
  itens: { atendimento_id: number; codigo: string; tipo: string; status: string; total_centavos: number; aberto_em: string; itens_resumo: string }[];
  total_gasto_centavos: number;
  qtd_pedidos: number;
  pagina: number;
  paginas: number;
};

// ——— §3 Endereço ———
export type CepResposta = { fonte: "cache" | "viacep"; cep: string; logradouro: string; bairro: string; cidade: string; uf: string };
export type GeoEntrada = { logradouro: string; numero?: string; bairro: string; cidade: string; uf: string };
export type GeoResposta = { lat: number; lng: number; fonte: "cache" | "nominatim"; precisao: "numero" | "rua" | "bairro" };

// ——— §4 Entrega ———
export type StatusEntrega = "ok" | "fora_da_area" | "sem_numero" | "sem_coordenada" | "bairro_nao_atendido" | "sem_configuracao";
export type OrigemTaxa = "bairro" | "faixa" | "padrao" | "manual";
export type Cotacao = {
  status: StatusEntrega;
  distancia_m?: number;
  taxa_centavos?: number;
  origem_taxa?: Exclude<OrigemTaxa, "manual">;
  faixa_id?: number;
  bairro_id?: number;
  avisos: string[];
};
export type CotarEntrada = { endereco_id?: number; endereco?: EnderecoInput };
export type FaixaEntrega = { id: number; ate_m: number; taxa_centavos: number; ordem: number; ativo: boolean };
export type BairroEntrega = { id: number; nome: string; cidade: string; taxa_centavos: number; atende: boolean; ativo: boolean };
export type ConfigEntrega = {
  lat: number | null;
  lng: number | null;
  endereco_origem?: string | null;
  entrega_raio_max_m: number | null;
  entrega_modo_distancia: "linha_reta";
  /** 130 = ×1,30 */
  entrega_fator_rota: number;
  taxa_entrega_centavos: number;
  faixas: FaixaEntrega[];
};
export type AplicarEntregaEntrada = {
  cliente_id?: number;
  endereco_id?: number;
  endereco?: EnderecoInput;
  taxa_manual_centavos?: number;
  motivo?: string;
  aprovacao?: Aprovacao;
  forcar?: boolean;
};

// ——— §6 Venda rápida ———
export type PedidoItemInput = {
  produto_variante_id: number;
  quantidade: number;
  observacao?: string | null;
  escolhas?: { opcao_escolha_id: number; quantidade: number }[];
  adicionais?: { adicional_variante_id: number; quantidade: number }[];
};
export type VendaRapidaEntrada = {
  /* Venda rápida é o tipo VENDA_RAPIDA, mas a tela NÃO manda `tipo`: a rota já cria assim (MUDANCAS-DE-CONTRATO §1). */
  cliente_id?: number;
  cliente_nome?: string;
  itens: PedidoItemInput[];
  desconto?: { centavos?: number; percentual?: number; motivo: string; aprovacao?: Aprovacao };
  pagamentos: { forma_pagamento_id: number; valor_centavos: number; valor_recebido_centavos?: number }[];
  imprimir?: { producao?: boolean; comprovante?: boolean };
};
export type VendaRapidaResposta = {
  atendimento: { id: number; codigo_atendimento: string; numero_dia: number; total_centavos: number; status: "FECHADO" };
  pedido_id: number;
  pagamentos: { id: number; valor_centavos: number; troco_centavos: number }[];
  troco_total_centavos: number;
  impressao: { producao: "na_fila" | "nao_pedida"; comprovante: "na_fila" | "nao_pedida" };
  gaveta: GavetaResultado;
};

// ——— §7 Mais vendidos ———
export type MaisVendido = {
  posicao: number;
  produto_id: number;
  produto_variante_id: number;
  nome: string;
  variante_nome: string; // "Padrão" quando o produto só tem uma variante
  preco_centavos: number;
  qtd_vendida: number;
  esgotado: boolean;
};

// ——— Formas de pagamento (rota existente) ———
export type FormaPagamento = { id: number; nome: string; abre_gaveta: boolean; ordem: number; ativo: boolean };

// ——— Rede / conectar celulares ———
/** GET /api/saude (pública): o app Android usa para confirmar que achou o servidor certo. */
export type Saude = { app: "os-restaurante"; versao: string; nome_restaurante: string };
export type EnderecoRede = { ip: string; interface: string };
/** GET /rede/conexao (gerente+). url_web/url_app vêm montadas com o primeiro endereço; sem IPv4 local, as duas vêm null. */
export type ConexaoRede = { porta: number; enderecos: EnderecoRede[]; url_web: string | null; url_app: string | null };

// ——— Impressoras (resposta do Fernando, 26/11) ———
/** GET /impressoras/status · SSE evento `impressora.status` com o mesmo item. */
export type ImpressoraStatus = { id: number; nome: string; status: "ok" | "erro" | "sem_resposta"; ultimo_erro: string | null; desde: string | null };
/** GET /impressao/fila?status=ERRO */
export type ItemFilaImpressao = {
  id: number;
  tipo_documento: string;
  status: "PENDENTE" | "ERRO" | "IMPRESSO" | "CANCELADO";
  tentativas: number;
  ultimo_erro: string | null;
  proxima_tentativa_em: string | null;
  criado_em: string;
  impresso_em: string | null;
  pedido_id: number | null;
  atendimento_id: number | null;
  impressora: { id: number; nome: string; ultimo_status: string; ultimo_erro: string | null } | null;
};

// ——— Dashboard (GET /relatorios/dashboard, GESTAO) — nomes lidos do servidor em cf274e9 ———
export type ProdutoRanking = { produto_variante_id: number; nome: string; qtd: number; valor_centavos: number };
export type PorFuncionario = { usuario_id: number; nome: string; cancelamentos_qtd: number; cancelamentos_centavos: number; descontos_qtd: number; descontos_centavos: number };
export type Fatia = { faturamento_centavos: number; atendimentos: number };
export type FaturamentoAgregado = {
  por_dia: (Fatia & { dia: string; anterior: Fatia & { dia: string } })[];
  por_semana: (Fatia & { inicio: string; fim: string; anterior: Fatia & { inicio: string; fim: string } })[];
  por_mes: (Fatia & { inicio: string; fim: string; anterior: Fatia & { inicio: string; fim: string } })[];
};
export type Dashboard = {
  de: string;
  ate: string;
  fuso: string;
  periodo_anterior: { de: string; ate: string };
  faturamento_centavos: number;
  faturamento_anterior_centavos: number;
  variacao_faturamento_centavos: number;
  ticket_medio_centavos: number;
  ticket_medio_anterior_centavos: number;
  atendimentos: number;
  atendimentos_anterior: number;
  /** Dia, semana e mês, cada um com o período anterior. */
  faturamento_agregado: FaturamentoAgregado;
  por_dia: (Fatia & { dia: string })[];
  por_hora: (Fatia & { hora: number })[];
  produtos_mais_vendidos_quantidade: ProdutoRanking[];
  produtos_menos_vendidos_quantidade: ProdutoRanking[];
  produtos_mais_vendidos_valor: ProdutoRanking[];
  produtos_menos_vendidos_valor: ProdutoRanking[];
  produtos_sem_venda: { produto_variante_id: number; nome: string; dias_sem_venda: number | null }[];
  /** ENTREGA aparece como DELIVERY; pode vir RETIRADA. */
  por_tipo: (Fatia & { tipo: "MESA" | "BALCAO" | "DELIVERY" | "RETIRADA" | "VENDA_RAPIDA" })[];
  por_forma_pagamento: { forma_pagamento_id: number; nome: string; valor_centavos: number; qtd: number }[];
  por_garcom: { usuario_id: number; nome: string; atendimentos: number; faturamento_centavos: number; ticket_medio_centavos: number }[];
  /** Cancelamentos e descontos juntos por funcionário (quantidade e valor). */
  por_funcionario: PorFuncionario[];
  cancelamentos_por_usuario: { usuario_id: number; nome: string; qtd: number; valor_centavos: number }[];
  descontos_por_usuario: { usuario_id: number; nome: string; qtd: number; valor_centavos: number }[];
};

// ——— Operação (GET /configuracoes/operacao, ROOT/ADMIN/GERENTE/ATENDENTE) ———
export type ConfigOperacao = { taxa_servico_percentual: number; limite_desconto_sem_pin_centavos: number; usa_gaveta: boolean; kds_atraso_min: number };

// ——— KDS por estação (GET /pedidos/cozinha?estacao=cozinha|bar) ———
export type KdsItem = { id: number; nome_produto: string; quantidade: number; observacao: string | null; escolhas: { nome_opcao: string; quantidade: number }[]; adicionais: { nome_adicional: string; quantidade: number }[] };
export type KdsPedido = {
  id: number;
  codigo_pedido: string;
  status: "ENVIADO" | "PREPARO" | "PRONTO";
  criado_em: string;
  minutos_decorridos: number;
  atrasado: boolean;
  atendimento: { id: number; codigo_atendimento: string; tipo_atendimento: string; numero_dia: number | null; mesa: { numero: number } | null };
  itens: KdsItem[];
};
export type KdsResposta = { estacao: "cozinha" | "bar"; atraso_min: number; agora_servidor: string; pedidos: KdsPedido[] };

/** 409 ao abrir mesa ocupada: devolve a conta que já está aberta. */
export type ErroMesaOcupada = { erro: string; codigo: "mesa_ocupada"; atendimento_id: number | null; codigo_atendimento: string | null };

/** Gravação transacional; IDs omitidos criam registros, IDs existentes são preservados. */
export type ProdutoCadastro = {
  nome: string; descricao?: string | null; caminho_imagem?: string | null; categoria_id: number;
  exige_preparo: boolean; controla_estoque?: boolean;
  variantes: { id?: number; nome: string; preco_centavos: number; grupos: {
    id?: number; nome: string; min_escolhas: number; max_escolhas: number; permite_repetir: boolean;
    opcoes: { id?: number; nome: string; preco_extra_centavos: number }[];
  }[] }[];
};
