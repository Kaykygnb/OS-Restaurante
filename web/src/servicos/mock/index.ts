/**
 * Mock de desenvolvimento (VITE_MOCK=1). Responde as rotas reais de hoje e as novas do CONTRATOS.md
 * com um "banco" em memória salvo no localStorage (sobrevive ao recarregar).
 *
 * Testar como humano:
 *  - logins: marta (gerente), joao e ana (atendente), beto (cozinha), ze (dono) · senha 1234 · PIN dos gerentes 1234
 *  - localStorage.mock_sem_internet = "1" → CEP e geocodificação respondem 503 sem_internet
 *  - localStorage.mock_offline = "1" → servidor "desligado" (toda chamada falha como sem conexão)
 *  - ?mock_reset=1 na URL zera o banco
 */
import { cotar, normalizarBairro, taxaManualPrecisaPin } from "../../util/entrega";
import type { BairroEntrega, PedidoItemInput, ConfigEntrega, Endereco, EnderecoInput, Modulos } from "../contratos";
import { BAIRROS_GEO, cardapioInicial, CEPS, FORMAS, ORIGEM, PIN_GERENTE, USUARIOS, type MockCategoria } from "./semente";

type Corpo = Record<string, unknown>;
type Resp = { status: number; corpo: unknown };
type Ctx = { token: string | null; terminal: string; chaveIdempotencia?: string };

type ItemMock = {
  id: number;
  nome_produto: string;
  preco_centavos: number;
  quantidade: number;
  observacao: string | null;
  cancelado: boolean;
  produto_variante_id: number;
  escolhas: { nome_opcao: string; preco_extra_centavos: number; quantidade: number }[];
  adicionais: { nome_adicional: string; preco_centavos: number; quantidade: number }[];
  exige_preparo: boolean;
};
type PedidoMock = { id: number; codigo_pedido: string; status: string; createdAt: string; itens: ItemMock[] };
type AtMock = {
  id: number;
  codigo_atendimento: string;
  numero_dia: number;
  tipo_atendimento: "MESA" | "BALCAO" | "RETIRADA" | "ENTREGA" | "VENDA_RAPIDA";
  status: "ABERTO" | "FECHADO" | "CANCELADO";
  mesa_id: number | null;
  cliente_id: number | null;
  cliente_nome: string | null;
  cliente_telefone: string | null;
  cliente_endereco: string | null;
  endereco_entrega_id: number | null;
  observacao: string | null;
  desconto_centavos: number;
  desconto_motivo: string | null;
  taxa_servico_aplicada: boolean;
  taxa_entrega_centavos: number;
  taxa_entrega_origem: string | null;
  taxa_entrega_calculada_centavos: number | null;
  entrega_distancia_m: number | null;
  aberto_em: string;
  fechado_em: string | null;
  usuario_id: number;
  pedidos: PedidoMock[];
  pagamentos: { id: number; forma_pagamento_id: number; valor_centavos: number; troco_centavos: number; criado_em: string }[];
};
type ClienteMock = {
  id: number;
  nome: string;
  telefone: string;
  telefone2: string | null;
  observacao: string | null;
  ativo: boolean;
  createdAt: string;
};
type PromoMock = {
  id: number;
  nome: string;
  tipo: string;
  percentual: number | null;
  valor_centavos: number | null;
  preco_fixo_centavos: number | null;
  leve: number | null;
  pague: number | null;
  inicio_em: string | null;
  fim_em: string | null;
  dias_semana: number;
  hora_inicio_min: number | null;
  hora_fim_min: number | null;
  tipos_atendimento: string;
  limite_por_atendimento: number | null;
  limite_total: number | null;
  usos: number;
  acumulavel: boolean;
  prioridade: number;
  inclui_extras: boolean;
  ativo: boolean;
  createdAt: string;
  updatedAt: string;
  alvos: { id: number; promocao_id: number; produto_id: number | null; produto_variante_id: number | null; categoria_id: number | null }[];
};
type EventoMock = {
  id: number;
  criado_em: string;
  tipo: string;
  sensivel: boolean;
  destaque: boolean;
  usuario_id: number | null;
  usuario_nome: string;
  usuario_perfil: string;
  aprovador_id: number | null;
  aprovador_nome: string | null;
  aprovado_com_pin: boolean;
  terminal_nome: string | null;
  ip: string | null;
  alvo_tipo: string | null;
  alvo_id: number | null;
  alvo_rotulo: string | null;
  mesa_id: number | null;
  atendimento_id: number | null;
  valor_antes: string | null;
  valor_depois: string | null;
  valor_centavos: number | null;
  motivo: string | null;
  resultado: string;
  detalhes: string | null;
  hash: string;
  hash_anterior: string;
};
type Banco = {
  seq: number;
  /** Ajustes de "Pode operar caixa" feitos na tela de Usuários (PATCH /usuarios/:id). */
  usuarios_caixa?: Record<string, boolean>;
  promocoes?: PromoMock[];
  estoque?: Record<string, { qtd: number; minimo: number | null }>;
  auditoria?: EventoMock[];
  alertas_vistos?: number[];
  movimentos?: { id: number; item_tipo: string; item_id: number; tipo: string; qtd_base: number; custo_unit_centavos: number | null; pedido_item_id: null; motivo: string | null; usuario_id: number | null; aprovador_id: null; criado_em: string }[];
  cardapio: MockCategoria[];
  mesas: { id: number; numero: number; ativo: boolean }[];
  atendimentos: AtMock[];
  clientes: ClienteMock[];
  enderecos: Endereco[];
  caixa: { id: number; fundo_troco_centavos: number; aberto_em: string; usuario_abertura_id: number; movs: { id?: number; tipo: string; valor_centavos: number; motivo: string; criado_em?: string; usuario_id?: number }[] } | null;
  caixasFechados?: { id: number; fech: unknown[]; conferencia: string }[];
  caixas_fechados: number;
  config: {
    usa_gaveta: boolean;
    estoque_nivel: 0 | 1 | 2 | 3 | 4;
    delivery: boolean;
    promocoes: boolean;
    taxa_servico_percentual: number;
    limite_desconto_sem_pin_centavos: number;
    nome_fantasia: string;
    kds_atraso_min?: number;
  };
  entrega: Omit<ConfigEntrega, "faixas">;
  faixas: ConfigEntrega["faixas"];
  bairros: BairroEntrega[];
  idem: Record<string, { hash: string; resp: Resp }>;
  tentativas: Record<string, { falhas: number; ate: number }>;
};

const CHAVE = "mock_db_v1";
const agora = () => new Date().toISOString();

function novoBanco(): Banco {
  const b: Banco = {
    seq: 1000,
    cardapio: cardapioInicial(),
    mesas: Array.from({ length: 12 }, (_, i) => ({ id: i + 1, numero: i + 1, ativo: true })),
    atendimentos: [],
    clientes: [
      { id: 1, nome: "Maria Souza", telefone: "11987654321", telefone2: null, observacao: "Interfone quebrado, ligar ao chegar", ativo: true, createdAt: agora() },
      { id: 2, nome: "Pedro Lima", telefone: "11912345678", telefone2: null, observacao: null, ativo: true, createdAt: agora() },
    ],
    enderecos: [
      { id: 1, cliente_id: 1, apelido: "Casa", cep: "01020000", logradouro: "Rua das Flores", numero: "120", complemento: "ap 32", bairro: "Centro", cidade: "São Paulo", uf: "SP", lat: ORIGEM.lat + 0.012, lng: ORIGEM.lng + 0.004, geo_origem: "api", ativo: true, principal: true },
      { id: 2, cliente_id: 1, apelido: "Trabalho", cep: "01430000", logradouro: "Avenida Brasil", numero: "2000", complemento: "sala 5", bairro: "Jardim América", cidade: "São Paulo", uf: "SP", lat: ORIGEM.lat + 0.024, lng: ORIGEM.lng - 0.03, geo_origem: "api", ativo: true, principal: false },
      { id: 3, cliente_id: 2, apelido: "Casa", cep: "", logradouro: "Rua Sem Mapa", numero: "8", complemento: "", bairro: "Vila Nova", cidade: "São Paulo", uf: "SP", geo_origem: "nenhuma", ativo: true, principal: true },
    ],
    caixa: { id: 1, fundo_troco_centavos: 15000, aberto_em: agora(), usuario_abertura_id: 3, movs: [] },
    caixas_fechados: 0,
    config: {
      usa_gaveta: false,
      estoque_nivel: 2,
      delivery: true,
      promocoes: true,
      taxa_servico_percentual: 10,
      limite_desconto_sem_pin_centavos: 500,
      nome_fantasia: "Restaurante do Zé",
    },
    entrega: {
      lat: ORIGEM.lat,
      lng: ORIGEM.lng,
      endereco_origem: "Rua do Restaurante, 10 · Centro · São Paulo/SP",
      entrega_raio_max_m: 8000,
      entrega_modo_distancia: "linha_reta",
      entrega_fator_rota: 130,
      taxa_entrega_centavos: 800,
    },
    faixas: [
      { id: 1, ate_m: 2000, taxa_centavos: 500, ordem: 1, ativo: true },
      { id: 2, ate_m: 4000, taxa_centavos: 700, ordem: 2, ativo: true },
      { id: 3, ate_m: 6000, taxa_centavos: 900, ordem: 3, ativo: true },
      { id: 4, ate_m: 8000, taxa_centavos: 1200, ordem: 4, ativo: true },
    ],
    bairros: [
      { id: 1, nome: "Jardim América", cidade: "São Paulo", taxa_centavos: 900, atende: true, ativo: true },
      { id: 2, nome: "Vila Distante", cidade: "São Paulo", taxa_centavos: 0, atende: false, ativo: true },
    ],
    idem: {},
    tentativas: {},
  };
  // Algumas vendas antigas para os "mais vendidos" e uma mesa ocupada.
  const v = (nome: string) => varPorNome(b, nome);
  const hist: [string, number][] = [
    ["Pastel de carne", 14], ["Coca-Cola lata", 12], ["Pastel de queijo", 9], ["Caipirinha", 7], ["Batata frita", 6],
    ["Açaí 300 ml", 5], ["Pastel especial", 5], ["Água sem gás", 4], ["Guaraná lata", 3],
  ];
  const fechado = criarAt(b, "VENDA_RAPIDA", null, 3);
  fechado.status = "FECHADO";
  fechado.aberto_em = new Date(Date.now() - 86400000).toISOString();
  fechado.pedidos.push({ id: b.seq++, codigo_pedido: "PD0001", status: "ENTREGUE", createdAt: fechado.aberto_em, itens: hist.map(([n, q]) => itemDe(b, v(n)!.v.id, q)) });
  const mesa3 = criarAt(b, "MESA", 3, 4);
  mesa3.pedidos.push({ id: b.seq++, codigo_pedido: "PD0002", status: "ENVIADO", createdAt: agora(), itens: [itemDe(b, v("Pastel de carne")!.v.id, 2), itemDe(b, v("Coca-Cola lata")!.v.id, 2)] });
  return b;
}

let banco: Banco | null = null;
function db(): Banco {
  if (banco) return banco;
  try {
    if (typeof location !== "undefined" && new URLSearchParams(location.search).get("mock_reset") === "1") localStorage.removeItem(CHAVE);
    const salvo = localStorage.getItem(CHAVE);
    banco = salvo ? (JSON.parse(salvo) as Banco) : novoBanco();
  } catch {
    banco = novoBanco();
  }
  return banco;
}
function salvar() {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(banco));
  } catch {
    /* sem espaço: segue só em memória */
  }
}
/** Para os testes do Vitest. */
export function zerarMock() {
  banco = novoBanco();
  salvar();
}

// codigo "" = o servidor não manda `codigo` nessa resposta (só `erro`).
const erro = (status: number, codigo: string, msg: string, extra: Corpo = {}): Resp => ({ status, corpo: codigo ? { erro: msg, codigo, ...extra } : { erro: msg, ...extra } });
const ok = (corpo: unknown, status = 200): Resp => ({ status, corpo });

function comCaixa<T extends (typeof USUARIOS)[number]>(u: T) {
  const aj = db().usuarios_caixa?.[String(u.id)];
  return { ...u, pode_operar_caixa: aj ?? u.pode_operar_caixa };
}
function usuarioDoToken(token: string | null) {
  const id = Number(token?.replace("mock-", ""));
  const u = USUARIOS.find((x) => x.id === id);
  return u ? comCaixa(u) : null;
}
const GESTAO = new Set(["ROOT", "ADMIN", "GERENTE"]);

function varPorNome(b: Banco, nome: string) {
  for (const c of b.cardapio) for (const p of c.produtos) if (p.nome === nome) return { p, v: p.variantes[0] };
  return null;
}
function varPorId(b: Banco, id: number) {
  for (const c of b.cardapio) for (const p of c.produtos) for (const v of p.variantes) if (v.id === id) return { p, v };
  return null;
}
function itemDe(b: Banco, vId: number, qtd: number, extra: { escolhas?: { opcao_escolha_id: number; quantidade: number }[]; adicionais?: { adicional_variante_id: number; quantidade: number }[]; observacao?: string | null } = {}): ItemMock {
  const pv = varPorId(b, vId);
  if (!pv) throw new Error("variante");
  const { p, v } = pv;
  const escolhas = (extra.escolhas ?? []).map((e) => {
    const op = v.grupos_escolhas.flatMap((g) => g.opcoes).find((o) => o.id === e.opcao_escolha_id);
    return { nome_opcao: op?.nome ?? "?", preco_extra_centavos: op?.preco_extra_centavos ?? 0, quantidade: e.quantidade };
  });
  const adicionais = (extra.adicionais ?? []).map((a) => {
    const ad = p.grupos_adicionais.flatMap((g) => g.adicionais).find((x) => x.variantes.some((y) => y.id === a.adicional_variante_id));
    const av = ad?.variantes.find((y) => y.id === a.adicional_variante_id);
    return { nome_adicional: ad?.nome ?? "?", preco_centavos: av?.preco_centavos ?? 0, quantidade: a.quantidade };
  });
  return {
    id: b.seq++,
    nome_produto: v.nome === "Padrão" ? p.nome : `${p.nome} ${v.nome}`,
    preco_centavos: v.preco_centavos,
    quantidade: qtd,
    observacao: extra.observacao ?? null,
    cancelado: false,
    produto_variante_id: v.id,
    escolhas,
    adicionais,
    exige_preparo: p.exige_preparo,
  };
}
const linha = (i: ItemMock) =>
  i.cancelado
    ? 0
    : i.quantidade *
      (i.preco_centavos + i.escolhas.reduce((s, e) => s + e.preco_extra_centavos * e.quantidade, 0) + i.adicionais.reduce((s, a) => s + a.preco_centavos * a.quantidade, 0));

function criarAt(b: Banco, tipo: AtMock["tipo_atendimento"], mesa_id: number | null, usuario_id: number): AtMock {
  const id = b.seq++;
  // Servidor gera numero_dia e reinicia todo dia (sai no cupom do balcão como senha).
  const hojeStr = new Date().toDateString();
  const numero_dia = b.atendimentos.filter((a) => new Date(a.aberto_em).toDateString() === hojeStr).length + 1;
  const pref = tipo === "ENTREGA" ? "D" : tipo === "MESA" ? "M" : tipo === "VENDA_RAPIDA" ? "V" : "B";
  const at: AtMock = {
    id,
    codigo_atendimento: `${pref}${String(id).padStart(4, "0")}`,
    numero_dia,
    tipo_atendimento: tipo,
    status: "ABERTO",
    mesa_id,
    cliente_id: null,
    cliente_nome: null,
    cliente_telefone: null,
    cliente_endereco: null,
    endereco_entrega_id: null,
    observacao: null,
    desconto_centavos: 0,
    desconto_motivo: null,
    taxa_servico_aplicada: false,
    taxa_entrega_centavos: 0,
    taxa_entrega_origem: null,
    taxa_entrega_calculada_centavos: null,
    entrega_distancia_m: null,
    aberto_em: agora(),
    fechado_em: null,
    usuario_id,
    pedidos: [],
    pagamentos: [],
  };
  b.atendimentos.push(at);
  return at;
}

function totaisAt(b: Banco, at: AtMock) {
  const sub = at.pedidos.flatMap((p) => p.itens).reduce((s, i) => s + linha(i), 0);
  const serv = at.taxa_servico_aplicada ? Math.round((sub - at.desconto_centavos) * b.config.taxa_servico_percentual / 100) : 0;
  const total = sub - at.desconto_centavos + serv + at.taxa_entrega_centavos;
  const pago = at.pagamentos.reduce((s, p) => s + p.valor_centavos, 0);
  return { subtotal_centavos: sub, taxa_servico_centavos: serv, total_centavos: total, pago_centavos: pago, restante_centavos: total - pago };
}

function detalheAt(b: Banco, at: AtMock) {
  const mesa = at.mesa_id ? b.mesas.find((m) => m.id === at.mesa_id) ?? null : null;
  const u = USUARIOS.find((x) => x.id === at.usuario_id);
  const t = totaisAt(b, at);
  return {
    ...at,
    dia_operacao: new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(at.aberto_em)),
    mesa: mesa ? { id: mesa.id, numero: mesa.numero } : null,
    usuario: u ? { id: u.id, nome: u.nome } : null,
    taxa_servico_centavos: t.taxa_servico_centavos,
    total_centavos: t.total_centavos,
    totais: t,
    pagamentos: at.pagamentos.map((p) => ({ ...p, forma_pagamento: FORMAS.find((f) => f.id === p.forma_pagamento_id) })),
    _count: { pedidos: at.pedidos.length },
  };
}

function caixaAtual(b: Banco) {
  const gaveta = b.config.usa_gaveta ? { disponivel: true } : { disponivel: false, motivo: "desligada" as const };
  const s = b.caixa;
  // localStorage.mock_caixa_ontem = "1" → simula caixa esquecido aberto desde ontem.
  const ontem = (() => {
    try {
      return localStorage.getItem("mock_caixa_ontem") === "1";
    } catch {
      return false;
    }
  })();
  const abertoEm = s && ontem ? new Date(Date.now() - 22 * 3600_000).toISOString() : s?.aberto_em;
  return {
    aberto: !!s,
    sessao_anterior: !!s && !!abertoEm && new Date(abertoEm).toDateString() !== new Date().toDateString(),
    tem_gaveta_disponivel: gaveta.disponivel,
    sessao: s
      ? {
          id: s.id,
          fundo_troco_centavos: s.fundo_troco_centavos,
          aberto_em: abertoEm ?? s.aberto_em,
          usuario_abertura: { id: s.usuario_abertura_id, nome: USUARIOS.find((u) => u.id === s.usuario_abertura_id)?.nome ?? "?" },
          codigo_conferencia: null,
        }
      : null,
    gaveta,
  };
}

function conferirAprovacao(a: unknown): Resp | null {
  const ap = a as { aprovador_id?: number; pin?: string } | undefined;
  if (!ap) return erro(403, "aprovacao_necessaria", "Precisa da aprovação de um gerente (PIN).");
  const u = USUARIOS.find((x) => x.id === Number(ap.aprovador_id));
  if (!u || !GESTAO.has(u.tipo) || ap.pin !== PIN_GERENTE) return erro(403, "pin_invalido", "PIN inválido.");
  return null;
}

function maisVendidos(b: Banco, limite: number) {
  const cont = new Map<number, number>();
  for (const at of b.atendimentos) {
    if (at.status === "CANCELADO") continue;
    for (const p of at.pedidos) for (const i of p.itens) if (!i.cancelado) cont.set(i.produto_variante_id, (cont.get(i.produto_variante_id) ?? 0) + i.quantidade);
  }
  const todos = b.cardapio.flatMap((c) =>
    c.produtos.flatMap((p) => p.variantes.map((v) => ({ p, v, qtd: cont.get(v.id) ?? 0 }))),
  );
  const ordem = [...todos].sort((a, c) => c.qtd - a.qtd || a.p.nome.localeCompare(c.p.nome));
  const vendidos = ordem.filter((x) => x.qtd > 0);
  const resto = todos.filter((x) => x.qtd === 0);
  return [...vendidos, ...resto].slice(0, limite).map((x, i) => ({
    posicao: i + 1,
    produto_id: x.p.id,
    produto_variante_id: x.v.id,
    nome: x.p.nome,
    variante_nome: x.v.nome,
    preco_centavos: x.v.preco_centavos,
    qtd_vendida: x.qtd,
    esgotado: !!x.v.esgotado,
  }));
}

function geo(e: { bairro?: string }) {
  if (localStorage.getItem("mock_sem_internet") === "1") return erro(503, "sem_internet", "Sem internet: siga com o cadastro manual.");
  const d = BAIRROS_GEO[normalizarBairro(e.bairro ?? "")];
  if (!d) return erro(404, "nao_localizado", "Endereço não localizado no mapa.");
  return ok({ lat: +(ORIGEM.lat + d[0]).toFixed(6), lng: +(ORIGEM.lng + d[1]).toFixed(6), fonte: "nominatim", precisao: "rua" });
}

function cotarNoBanco(b: Banco, e: EnderecoInput) {
  return cotar(
    { bairro: e.bairro, cidade: e.cidade, numero: e.numero, sem_numero: e.sem_numero, lat: e.lat, lng: e.lng },
    { origem: { lat: b.entrega.lat, lng: b.entrega.lng }, fator: b.entrega.entrega_fator_rota, raio_max_m: b.entrega.entrega_raio_max_m, faixas: b.faixas, bairros: b.bairros },
  );
}

function clienteCompleto(b: Banco, c: ClienteMock) {
  const ats = b.atendimentos.filter((a) => a.cliente_id === c.id);
  return {
    ...c,
    enderecos: b.enderecos.filter((e) => e.cliente_id === c.id && e.ativo).sort((x, y) => Number(y.principal) - Number(x.principal)),
    qtd_pedidos: ats.length,
    ultimo_pedido_em: ats.at(-1)?.aberto_em ?? null,
  };
}

function novoEndereco(b: Banco, clienteId: number, e: EnderecoInput, principal: boolean): Endereco {
  const temGeo = e.lat != null && e.lng != null;
  const end: Endereco = { ...e, id: b.seq++, cliente_id: clienteId, geo_origem: temGeo ? "api" : "nenhuma", ativo: true, principal };
  b.enderecos.push(end);
  return end;
}

type H = (m: RegExpMatchArray, corpo: Corpo, ctx: Ctx, url: URL) => Resp | Promise<Resp>;
const ROTAS: [string, RegExp, H][] = [];
const rota = (metodo: string, padrao: string, h: H) => ROTAS.push([metodo, new RegExp(`^${padrao}$`), h]);

// ——— impressoras (status no topo) ———
// localStorage.mock_impressora = "Bar" → a impressora Bar fica "sem_resposta"; "Bar:erro" → "erro".
rota("GET", "/impressoras/status", () => {
  let falha = "";
  try {
    falha = localStorage.getItem("mock_impressora") ?? "";
  } catch {
    /* ignora */
  }
  const [nomeFalha, tipoFalha] = falha.split(":");
  const desde = new Date(Date.now() - 3 * 60_000).toISOString();
  return ok(
    ["Cozinha", "Bar", "Caixa"].map((nome, i) =>
      nome === nomeFalha
        ? { id: i + 1, nome, status: tipoFalha === "erro" ? "erro" : "sem_resposta", ultimo_erro: tipoFalha === "erro" ? "Sem papel" : "Não respondeu em 192.168.0.5" + (i + 1) + ":9100", desde }
        : { id: i + 1, nome, status: "ok", ultimo_erro: null, desde: null },
    ),
  );
});
rota("GET", "/impressao/fila", (_m, _c, _ctx, url) => {
  const st = url.searchParams.get("status");
  const itens = [
    { id: 33, tipo_documento: "PRODUCAO", status: "ERRO", tentativas: 3, ultimo_erro: "sem resposta", proxima_tentativa_em: null, criado_em: new Date(Date.now() - 180_000).toISOString(), impresso_em: null, pedido_id: 12, atendimento_id: 5, impressora: { id: 2, nome: "Bar", ultimo_status: "ERRO", ultimo_erro: "sem resposta" } },
    { id: 34, tipo_documento: "COMPROVANTE", status: "IMPRESSO", tentativas: 1, ultimo_erro: null, proxima_tentativa_em: null, criado_em: new Date(Date.now() - 120_000).toISOString(), impresso_em: new Date(Date.now() - 119_000).toISOString(), pedido_id: null, atendimento_id: 6, impressora: { id: 3, nome: "Caixa", ultimo_status: "ONLINE", ultimo_erro: null } },
  ];
  return ok(st ? itens.filter((i) => i.status === st) : itens);
});

// ——— dashboard (GESTAO) ———
rota("GET", "/relatorios/dashboard", (_m, _c, ctx, url) => {
  if (!GESTAO.has(usuarioDoToken(ctx.token)?.tipo ?? "")) return erro(403, "sem_permissao", "Sem permissão");
  const b = db();
  const iso = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
  const hoje = iso(new Date());
  const de = url.searchParams.get("de") ?? hoje;
  const ate = url.searchParams.get("ate") ?? hoje;
  if (de > ate) return erro(400, "periodo_invalido", "A data inicial é depois da final.");
  const somaDias = (d: string, n: number) => iso(new Date(new Date(d + "T12:00:00-03:00").getTime() + n * 86_400_000));
  // Histórico simulado (determinístico) + o que foi fechado no mock hoje.
  const totalAt = (a: AtMock) => a.pedidos.flatMap((p) => p.itens).reduce((t, i) => t + linha(i), 0) - a.desconto_centavos + a.taxa_entrega_centavos;
  const fechadosHoje = b.atendimentos.filter((a) => a.status === "FECHADO" && a.fechado_em && iso(new Date(a.fechado_em)) === hoje);
  const base = (d: string) => {
    const n = Number(d.replaceAll("-", ""));
    const dow = new Date(d + "T12:00:00-03:00").getDay();
    const fator = dow === 5 || dow === 6 ? 1.5 : dow === 1 ? 0.6 : 1;
    return { faturamento_centavos: Math.round((150_000 + (n % 7) * 9_300) * fator), atendimentos: Math.round((48 + (n % 5) * 3) * fator) };
  };
  const dia = (d: string) => {
    const f = base(d);
    if (d === hoje) {
      f.faturamento_centavos = 96_400 + fechadosHoje.reduce((t, a) => t + totalAt(a), 0);
      f.atendimentos = 31 + fechadosHoje.length;
    }
    return f;
  };
  const soma = (a: string, z: string) => {
    const r = { faturamento_centavos: 0, atendimentos: 0 };
    for (let d = a; d <= z; d = somaDias(d, 1)) {
      if (d > hoje) break;
      const f = dia(d);
      r.faturamento_centavos += f.faturamento_centavos;
      r.atendimentos += f.atendimentos;
    }
    return r;
  };
  const dias: string[] = [];
  for (let d = de; d <= ate; d = somaDias(d, 1)) dias.push(d);
  const segunda = (d: string) => {
    const dow = new Date(d + "T12:00:00-03:00").getDay();
    return somaDias(d, -(dow === 0 ? 6 : dow - 1));
  };
  const fimMes = (m: string) => {
    const [y, mm] = m.split("-").map(Number);
    return `${m}-${String(new Date(Date.UTC(y, mm, 0)).getUTCDate()).padStart(2, "0")}`;
  };
  const mesAnt = (m: string) => {
    const [y, mm] = m.split("-").map(Number);
    return mm === 1 ? `${y - 1}-12` : `${y}-${String(mm - 1).padStart(2, "0")}`;
  };
  const fat = soma(de, ate);
  const n = dias.length;
  const antDe = somaDias(de, -n);
  const antAte = somaDias(de, -1);
  const fatAnt = soma(antDe, antAte);
  const rank = [
    { produto_variante_id: 1, nome: "Pastel de carne", qtd: 48, valor_centavos: 50_400 },
    { produto_variante_id: 7, nome: "Coca-Cola lata", qtd: 41, valor_centavos: 24_600 },
    { produto_variante_id: 3, nome: "Pastel de queijo", qtd: 30, valor_centavos: 29_700 },
    { produto_variante_id: 9, nome: "Caipirinha", qtd: 14, valor_centavos: 25_200 },
  ];
  const porFunc = [
    { usuario_id: 4, nome: "Ana", cancelamentos_qtd: 3, cancelamentos_centavos: 4_500, descontos_qtd: 5, descontos_centavos: 4_200 },
    { usuario_id: 3, nome: "João", cancelamentos_qtd: 1, cancelamentos_centavos: 1_050, descontos_qtd: 2, descontos_centavos: 1_000 },
    { usuario_id: 2, nome: "Marta", cancelamentos_qtd: 0, cancelamentos_centavos: 0, descontos_qtd: 1, descontos_centavos: 3_000 },
  ];
  const ft = fat.faturamento_centavos;
  return ok({
    de,
    ate,
    fuso: "America/Sao_Paulo",
    periodo_anterior: { de: antDe, ate: antAte },
    faturamento_centavos: ft,
    faturamento_anterior_centavos: fatAnt.faturamento_centavos,
    variacao_faturamento_centavos: ft - fatAnt.faturamento_centavos,
    ticket_medio_centavos: fat.atendimentos ? Math.round(ft / fat.atendimentos) : 0,
    ticket_medio_anterior_centavos: fatAnt.atendimentos ? Math.round(fatAnt.faturamento_centavos / fatAnt.atendimentos) : 0,
    atendimentos: fat.atendimentos,
    atendimentos_anterior: fatAnt.atendimentos,
    faturamento_agregado: {
      por_dia: dias.map((d) => ({ dia: d, ...dia(d), anterior: { dia: somaDias(d, -1), ...dia(somaDias(d, -1)) } })),
      por_semana: [...new Set(dias.map(segunda))].map((i) => ({
        inicio: i,
        fim: somaDias(i, 6),
        ...soma(i, somaDias(i, 6)),
        anterior: { inicio: somaDias(i, -7), fim: somaDias(i, -1), ...soma(somaDias(i, -7), somaDias(i, -1)) },
      })),
      por_mes: [...new Set(dias.map((d) => d.slice(0, 7)))].map((m) => ({
        inicio: `${m}-01`,
        fim: fimMes(m),
        ...soma(`${m}-01`, fimMes(m)),
        anterior: { inicio: `${mesAnt(m)}-01`, fim: fimMes(mesAnt(m)), ...soma(`${mesAnt(m)}-01`, fimMes(mesAnt(m))) },
      })),
    },
    por_dia: dias.map((d) => ({ dia: d, ...dia(d) })),
    por_hora: Array.from({ length: 24 }, (_, h) => {
      const peso = h >= 11 && h <= 14 ? 0.09 : h >= 18 && h <= 22 ? 0.1 : h >= 15 && h <= 17 ? 0.02 : 0;
      return { hora: h, faturamento_centavos: Math.round(ft * peso), atendimentos: Math.round(fat.atendimentos * peso) };
    }),
    produtos_mais_vendidos_quantidade: rank,
    produtos_menos_vendidos_quantidade: [...rank].reverse(),
    produtos_mais_vendidos_valor: [...rank].sort((a, z) => z.valor_centavos - a.valor_centavos),
    produtos_menos_vendidos_valor: [...rank].sort((a, z) => a.valor_centavos - z.valor_centavos),
    produtos_sem_venda: [
      { produto_variante_id: 41, nome: "Suco de laranja", dias_sem_venda: null },
      { produto_variante_id: 40, nome: "Pastel de palmito", dias_sem_venda: 12 },
    ],
    por_tipo: [
      { tipo: "MESA", faturamento_centavos: Math.round(ft * 0.48), atendimentos: Math.round(fat.atendimentos * 0.35) },
      { tipo: "VENDA_RAPIDA", faturamento_centavos: Math.round(ft * 0.2), atendimentos: Math.round(fat.atendimentos * 0.4) },
      { tipo: "BALCAO", faturamento_centavos: Math.round(ft * 0.1), atendimentos: Math.round(fat.atendimentos * 0.1) },
      { tipo: "DELIVERY", faturamento_centavos: Math.round(ft * 0.18), atendimentos: Math.round(fat.atendimentos * 0.12) },
      { tipo: "RETIRADA", faturamento_centavos: Math.round(ft * 0.04), atendimentos: Math.round(fat.atendimentos * 0.03) },
    ],
    por_forma_pagamento: [
      { forma_pagamento_id: 1, nome: "Dinheiro", valor_centavos: Math.round(ft * 0.28), qtd: Math.round(fat.atendimentos * 0.3) },
      { forma_pagamento_id: 2, nome: "Pix", valor_centavos: Math.round(ft * 0.39), qtd: Math.round(fat.atendimentos * 0.38) },
      { forma_pagamento_id: 3, nome: "Cartão", valor_centavos: Math.round(ft * 0.33), qtd: Math.round(fat.atendimentos * 0.32) },
    ],
    por_garcom: [
      { usuario_id: 4, nome: "Ana", atendimentos: 14, faturamento_centavos: 61_200, ticket_medio_centavos: 4_371 },
      { usuario_id: 3, nome: "João", atendimentos: 8, faturamento_centavos: 37_200, ticket_medio_centavos: 4_650 },
    ],
    por_funcionario: porFunc,
    cancelamentos_por_usuario: porFunc.filter((f) => f.cancelamentos_qtd).map((f) => ({ usuario_id: f.usuario_id, nome: f.nome, qtd: f.cancelamentos_qtd, valor_centavos: f.cancelamentos_centavos })),
    descontos_por_usuario: porFunc.filter((f) => f.descontos_qtd).map((f) => ({ usuario_id: f.usuario_id, nome: f.nome, qtd: f.descontos_qtd, valor_centavos: f.descontos_centavos })),
  });
});

// ——— operação e KDS ———
const TRANSICOES: Record<string, string[]> = { ENVIADO: ["PREPARO", "PRONTO", "ENTREGUE"], PREPARO: ["PRONTO", "ENTREGUE"], PRONTO: ["ENTREGUE"], ENTREGUE: [] };
rota("PUT", "/pedidos/(\\d+)/status", (m, c, ctx) => {
  const b = db();
  const st = String(c.status ?? "").toUpperCase();
  const ped = b.atendimentos.flatMap((a) => a.pedidos).find((p) => p.id === Number(m[1]));
  if (!ped) return erro(404, "nao_encontrado", "Pedido não encontrado");
  if (usuarioDoToken(ctx.token)?.tipo === "COZINHEIRO" && !["PREPARO", "PRONTO"].includes(st)) return erro(403, "sem_permissao", "Cozinha só marca PREPARO ou PRONTO");
  if (!(TRANSICOES[ped.status] ?? []).includes(st)) return erro(409, "transicao_invalida", `Não dá para ir de ${ped.status} para ${st}`);
  ped.status = st;
  salvar();
  return ok({ id: ped.id, status: ped.status });
});
rota("GET", "/pedidos", (_m, _c, _ctx, url) => {
  const b = db();
  const st = (url.searchParams.get("status") ?? "ABERTOS").toUpperCase();
  const filtro = st === "ABERTOS" ? ["ENVIADO", "PREPARO", "PRONTO"] : st === "HISTORICO" ? ["ENTREGUE", "CANCELADO"] : [st];
  return ok(
    b.atendimentos.flatMap((a) =>
      a.pedidos
        .filter((p) => filtro.includes(p.status))
        .map((p) => ({ ...p, atendimento: { id: a.id, codigo_atendimento: a.codigo_atendimento, tipo_atendimento: a.tipo_atendimento, status: a.status, mesa: a.mesa_id ? { numero: b.mesas.find((m) => m.id === a.mesa_id)?.numero ?? a.mesa_id } : null } })),
    ),
  );
});
rota("GET", "/configuracoes/operacao", () => {
  const c = db().config;
  return ok({ taxa_servico_percentual: c.taxa_servico_percentual, limite_desconto_sem_pin_centavos: c.limite_desconto_sem_pin_centavos, usa_gaveta: c.usa_gaveta, kds_atraso_min: c.kds_atraso_min ?? 15 });
});
rota("GET", "/pedidos/cozinha", (_m, _c, _ctx, url) => {
  const estacao = (url.searchParams.get("estacao") ?? "").toLowerCase();
  if (estacao !== "cozinha" && estacao !== "bar") return erro(400, "estacao_invalida", "Informe estacao=cozinha ou estacao=bar.");
  const b = db();
  const agoraMs = Date.now();
  const ehBar = (nome: string) => /caipirinha|drink|chopp|cerveja|suco/i.test(nome);
  const pedidos = b.atendimentos
    .filter((a) => a.status !== "CANCELADO")
    .flatMap((a) =>
      a.pedidos
        .filter((p) => ["ENVIADO", "PREPARO", "PRONTO"].includes(p.status))
        .map((p) => {
          const min = Math.floor((agoraMs - new Date(p.createdAt).getTime()) / 60_000);
          return {
            id: p.id,
            codigo_pedido: p.codigo_pedido,
            status: p.status,
            criado_em: p.createdAt,
            minutos_decorridos: min,
            atrasado: min >= (b.config.kds_atraso_min ?? 15),
            atendimento: { id: a.id, codigo_atendimento: a.codigo_atendimento, tipo_atendimento: a.tipo_atendimento, numero_dia: a.numero_dia, mesa: a.mesa_id ? { numero: b.mesas.find((m) => m.id === a.mesa_id)?.numero ?? a.mesa_id } : null },
            itens: p.itens
              .filter((i) => i.exige_preparo && !i.cancelado && (estacao === "bar" ? ehBar(i.nome_produto) : !ehBar(i.nome_produto)))
              .map((i) => ({
                id: i.id,
                nome_produto: i.nome_produto,
                quantidade: i.quantidade,
                observacao: i.observacao,
                escolhas: i.escolhas.map((e) => ({ nome_opcao: e.nome_opcao, quantidade: e.quantidade })),
                adicionais: i.adicionais.map((x) => ({ nome_adicional: x.nome_adicional, quantidade: x.quantidade })),
              })),
          };
        }),
    )
    .filter((p) => p.itens.length > 0)
    .sort((x, y) => x.criado_em.localeCompare(y.criado_em));
  const atraso = b.config.kds_atraso_min ?? 15;
  return ok({ estacao, atraso_min: atraso, agora_servidor: new Date().toISOString(), pedidos });
});

// ——— acesso ———
rota("GET", "/saude", () => ok({ app: "os-restaurante", versao: "0.9.0-mock", nome_restaurante: "Pastelaria do Zé" }));
// Dois endereços para testar o seletor. Trocar o IP do Wi-Fi: localStorage os.mock.ip = "192.168.0.23".
rota("GET", "/rede/conexao", (_m, _c, ctx) => {
  if (!GESTAO.has(usuarioDoToken(ctx.token)?.tipo ?? "")) return erro(403, "", "Sem permissão");
  let wifi = "192.168.0.15";
  try {
    wifi = localStorage.getItem("os.mock.ip") || wifi;
  } catch {
    /* ignora */
  }
  const porta = 3333;
  const nome = "Pastelaria do Zé";
  // localStorage os.mock.sem_rede = "1" → PC sem IPv4 local (url_web/url_app null, como no servidor).
  let semRede = false;
  try {
    semRede = localStorage.getItem("os.mock.sem_rede") === "1";
  } catch {
    /* ignora */
  }
  if (semRede) return ok({ porta, enderecos: [], url_web: null, url_app: null });
  return ok({
    porta,
    enderecos: [
      { ip: wifi, interface: "Wi-Fi" },
      { ip: "10.0.0.8", interface: "Ethernet" },
    ],
    url_web: `http://${wifi}:${porta}/`,
    url_app: `osrestaurante://conectar?host=${wifi}&porta=${porta}&nome=${encodeURIComponent(nome)}`,
  });
});
rota("POST", "/(?:auth/)?login", (_m, c) => {
  const b = db();
  const nome = String(c.usuario ?? c.login ?? "").trim().toLowerCase();
  const t = b.tentativas[nome] ?? { falhas: 0, ate: 0 };
  if (t.ate > Date.now()) return erro(429, "muitas_tentativas", "Muitas tentativas. Aguarde para tentar de novo.", { tentar_em_s: Math.ceil((t.ate - Date.now()) / 1000) });
  const u = USUARIOS.find((x) => x.usuario === nome && x.senha === c.senha);
  if (!u) {
    t.falhas += 1;
    if (t.falhas >= 5) {
      t.ate = Date.now() + 60000;
      t.falhas = 0;
    }
    b.tentativas[nome] = t;
    salvar();
    return erro(401, "credenciais_invalidas", "Usuário ou senha inválidos");
  }
  delete b.tentativas[nome];
  salvar();
  return ok({ token: `mock-${u.id}`, usuario: { id: u.id, nome: u.nome, tipo: u.tipo, pode_operar_caixa: comCaixa(u).pode_operar_caixa } });
});
rota("GET", "/auth/me", (_m, _c, ctx) => {
  const u = usuarioDoToken(ctx.token);
  return u ? ok({ id: u.id, nome: u.nome, tipo: u.tipo, pode_operar_caixa: comCaixa(u).pode_operar_caixa, ativo: true }) : erro(401, "", "Usuário indisponível. Faça login novamente");
});
// ——— usuários (só leitura + "Pode operar caixa"; criar/editar fica para o servidor real) ———
const ORDEM_TIPO = ["ROOT", "ADMIN", "GERENTE", "ATENDENTE", "COZINHEIRO", "ENTREGADOR"];
const CRIAVEIS: Record<string, string[]> = { ROOT: ["ADMIN", "GERENTE", "ATENDENTE", "COZINHEIRO", "ENTREGADOR"], ADMIN: ["GERENTE", "ATENDENTE", "COZINHEIRO", "ENTREGADOR"], GERENTE: ["ATENDENTE", "COZINHEIRO", "ENTREGADOR"] };
const usuarioPublico = (u: (typeof USUARIOS)[number]) => ({ id: u.id, matricula: null, tipo_usuario: u.tipo, nome: u.nome, login: u.usuario, email: null, telefone: null, ativo: true, pode_operar_caixa: comCaixa(u).pode_operar_caixa, createdAt: "2026-01-01T12:00:00.000Z", updatedAt: "2026-01-01T12:00:00.000Z" });
rota("GET", "/usuarios/opcoes", (_m, _c, ctx) => {
  const t = usuarioDoToken(ctx.token)?.tipo ?? "";
  if (!GESTAO.has(t)) return erro(403, "sem_permissao", "Sem permissão");
  return ok({ tipos_criaveis: CRIAVEIS[t] ?? [] });
});
rota("GET", "/usuarios", (_m, _c, ctx, url) => {
  const t = usuarioDoToken(ctx.token)?.tipo ?? "";
  if (!GESTAO.has(t)) return erro(403, "sem_permissao", "Sem permissão");
  if (url.searchParams.get("ativos") === "0") return ok([]);
  return ok(USUARIOS.filter((u) => t === "ROOT" || u.tipo !== "ROOT").sort((a, z) => ORDEM_TIPO.indexOf(a.tipo) - ORDEM_TIPO.indexOf(z.tipo) || a.nome.localeCompare(z.nome)).map(usuarioPublico));
});
rota("PATCH", "/usuarios/(\\d+)", (m, c, ctx) => {
  const quem = usuarioDoToken(ctx.token)?.tipo ?? "";
  if (!GESTAO.has(quem)) return erro(403, "sem_permissao", "Sem permissão");
  const alvo = USUARIOS.find((u) => u.id === Number(m[1]));
  if (!alvo) return erro(404, "nao_encontrado", "Usuário não encontrado");
  if (alvo.tipo === "ROOT") return erro(403, "sem_permissao", "Não é possível editar o ROOT por esta rota");
  if (quem !== "ROOT" && !(CRIAVEIS[quem] ?? []).includes(alvo.tipo)) return erro(403, "sem_permissao", "Sem permissão para editar este usuário");
  if (c.pode_operar_caixa === undefined) return erro(400, "dados_invalidos", "Nada para alterar.");
  const b = db();
  b.usuarios_caixa = { ...(b.usuarios_caixa ?? {}), [String(alvo.id)]: Boolean(c.pode_operar_caixa) };
  salvar();
  return ok(usuarioPublico(alvo));
});
// ——— promoções ———
function promosDe(b: Banco): PromoMock[] {
  if (!b.promocoes) {
    const base = { percentual: null, valor_centavos: null, preco_fixo_centavos: null, leve: null, pague: null, inicio_em: null, fim_em: null, limite_por_atendimento: null, limite_total: null, acumulavel: false, prioridade: 0, inclui_extras: false, ativo: true, createdAt: agora(), updatedAt: agora() };
    const fimMes = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59).toISOString();
    b.promocoes = [
      { ...base, id: 1, nome: "Happy hour pastéis", tipo: "PERCENTUAL", percentual: 20, dias_semana: 0b0111110, hora_inicio_min: 17 * 60, hora_fim_min: 19 * 60, tipos_atendimento: "MESA,BALCAO,RETIRADA,ENTREGA", usos: 134, fim_em: fimMes, alvos: [{ id: 1, promocao_id: 1, produto_id: null, produto_variante_id: null, categoria_id: b.cardapio.find((c) => c.nome.startsWith("Past"))?.id ?? 2 }] },
      { ...base, id: 2, nome: "Leve 3 pague 2 refrigerante", tipo: "LEVE_PAGUE", leve: 3, pague: 2, dias_semana: 127, hora_inicio_min: null, hora_fim_min: null, tipos_atendimento: "MESA,BALCAO,RETIRADA,ENTREGA,VENDA_RAPIDA", usos: 41, alvos: [] },
    ];
  }
  return b.promocoes;
}
rota("GET", "/promocoes", (_m, _c, ctx) => {
  if (!GESTAO.has(usuarioDoToken(ctx.token)?.tipo ?? "")) return erro(403, "sem_permissao", "Sem permissão");
  return ok([...promosDe(db())].sort((a, z) => z.prioridade - a.prioridade));
});
rota("POST", "/promocoes", (_m, c, ctx) => {
  if (!GESTAO.has(usuarioDoToken(ctx.token)?.tipo ?? "")) return erro(403, "sem_permissao", "Sem permissão");
  if (!c.nome || !["PERCENTUAL", "VALOR", "PRECO_FIXO", "LEVE_PAGUE"].includes(String(c.tipo))) return erro(400, "dados_invalidos", "Informe nome e tipo da promoção.");
  const b = db();
  const lista = promosDe(b);
  const id = b.seq++;
  const n = (k: string) => (c[k] == null ? null : Number(c[k]));
  const p: PromoMock = {
    id,
    nome: String(c.nome).trim(),
    tipo: String(c.tipo),
    percentual: n("percentual"),
    valor_centavos: n("valor_centavos"),
    preco_fixo_centavos: n("preco_fixo_centavos"),
    leve: n("leve"),
    pague: n("pague"),
    inicio_em: (c.inicio_em as string) ?? null,
    fim_em: (c.fim_em as string) ?? null,
    dias_semana: n("dias_semana") ?? 127,
    hora_inicio_min: n("hora_inicio_min"),
    hora_fim_min: n("hora_fim_min"),
    tipos_atendimento: (c.tipos_atendimento as string) ?? "MESA,BALCAO,RETIRADA,ENTREGA",
    limite_por_atendimento: n("limite_por_atendimento"),
    limite_total: n("limite_total"),
    usos: 0,
    acumulavel: Boolean(c.acumulavel),
    prioridade: n("prioridade") ?? 0,
    inclui_extras: Boolean(c.inclui_extras),
    ativo: true,
    createdAt: agora(),
    updatedAt: agora(),
    alvos: ((c.alvos as { produto_id?: number; produto_variante_id?: number; categoria_id?: number }[]) ?? []).map((a, i) => ({ id: id * 10 + i, promocao_id: id, produto_id: a.produto_id ?? null, produto_variante_id: a.produto_variante_id ?? null, categoria_id: a.categoria_id ?? null })),
  };
  lista.push(p);
  salvar();
  return ok(p, 201);
});
rota("PATCH", "/promocoes/(\\d+)", (m, c, ctx) => {
  if (!GESTAO.has(usuarioDoToken(ctx.token)?.tipo ?? "")) return erro(403, "sem_permissao", "Sem permissão");
  const p = promosDe(db()).find((x) => x.id === Number(m[1]));
  if (!p) return erro(404, "nao_encontrado", "Promoção não encontrada");
  const { encerrar, ...resto } = c as Record<string, unknown>;
  Object.assign(p, resto, { updatedAt: agora() });
  if (encerrar) {
    p.ativo = false;
    p.fim_em = agora();
  }
  salvar();
  return ok(p);
});
// ——— estoque (nível 1: esgotados; nível 2: quantidade das bebidas) ———
rota("PATCH", "/produtos/(\\d+)", (m, c, ctx) => {
  if (!["ROOT", "ADMIN", "GERENTE", "ATENDENTE", "COZINHEIRO"].includes(usuarioDoToken(ctx.token)?.tipo ?? "")) return erro(403, "sem_permissao", "Sem permissão");
  const b = db();
  const prod = b.cardapio.flatMap((x) => x.produtos).find((x) => x.id === Number(m[1]));
  if (!prod) return erro(404, "nao_encontrado", "Produto não encontrado");
  if (typeof c.esgotado !== "boolean") return erro(400, "dados_invalidos", "Nada para alterar.");
  for (const v of prod.variantes) v.esgotado = c.esgotado;
  salvar();
  return ok({ id: prod.id, nome: prod.nome, esgotado: c.esgotado });
});
function estoqueDe(b: Banco) {
  if (!b.estoque) {
    const bebidas = b.cardapio.find((x) => x.nome === "Bebidas")?.produtos ?? [];
    const ini: Record<string, [number, number | null]> = { "Coca-Cola lata": [6, 24], "Guaraná lata": [40, 24], "Água sem gás": [0, 12], "Suco de laranja": [15, null] };
    b.estoque = {};
    for (const p of bebidas) {
      const [q, mn] = ini[p.nome] ?? [10, null];
      b.estoque[String(p.variantes[0].id)] = { qtd: q, minimo: mn };
    }
  }
  return b.estoque;
}
rota("GET", "/estoque/itens", (_m, _c, ctx, url) => {
  if (!GESTAO.has(usuarioDoToken(ctx.token)?.tipo ?? "")) return erro(403, "sem_permissao", "Sem permissão");
  const b = db();
  if (b.config.estoque_nivel < 2) return erro(409, "estoque_desligado", "O controle de quantidade está desligado.");
  const est = estoqueDe(b);
  let itens = Object.entries(est).map(([vid, e]) => {
    const x = varPorId(b, Number(vid))!;
    return { produto_variante_id: Number(vid), nome: x.p.nome, variante_nome: x.v.nome, unidade_base: "un", qtd_base: e.qtd, minimo_base: e.minimo, esgotado: !!x.v.esgotado };
  });
  const sit = url.searchParams.get("situacao");
  if (sit === "zerado") itens = itens.filter((i) => i.qtd_base <= 0);
  if (sit === "abaixo_minimo") itens = itens.filter((i) => i.minimo_base != null && i.qtd_base <= i.minimo_base);
  return ok(itens);
});
rota("GET", "/estoque/movimentos", (_m, _c, _ctx, url) => {
  const item = Number(url.searchParams.get("item"));
  return ok((db().movimentos ?? []).filter((x) => !item || x.item_id === item).slice().reverse());
});
rota("POST", "/estoque/movimentos", (_m, c, ctx) => {
  const u = usuarioDoToken(ctx.token);
  if (!GESTAO.has(u?.tipo ?? "")) return erro(403, "sem_permissao", "Sem permissão");
  const tipo = String(c.tipo);
  if (!["ENTRADA", "PERDA", "CORRECAO"].includes(tipo)) return erro(400, "tipo_invalido", "Tipo de movimento inválido. Entrada por nota fica para o nível 4.");
  if (tipo !== "ENTRADA" && !String(c.motivo ?? "").trim()) return erro(400, "motivo_obrigatorio", "Informe o motivo.");
  const qtd = Math.round(Number(c.qtd_base));
  if (!Number.isFinite(qtd) || qtd === 0) return erro(400, "quantidade_invalida", "Informe a quantidade.");
  const b = db();
  const est = estoqueDe(b);
  const e = est[String(c.item_id)];
  if (!e) return erro(404, "item_nao_encontrado", "Item sem controle de estoque.");
  const delta = tipo === "ENTRADA" ? Math.abs(qtd) : tipo === "PERDA" ? -Math.abs(qtd) : qtd;
  e.qtd += delta;
  const x = varPorId(b, Number(c.item_id));
  if (x) x.v.esgotado = e.qtd <= 0;
  const mov = { id: b.seq++, item_tipo: "produto_variante", item_id: Number(c.item_id), tipo, qtd_base: delta, custo_unit_centavos: (c.custo_unit_centavos as number) ?? null, pedido_item_id: null, motivo: (c.motivo as string) ?? null, usuario_id: u?.id ?? null, aprovador_id: null, criado_em: agora() };
  b.movimentos = [...(b.movimentos ?? []), mov];
  salvar();
  return ok(mov, 201);
});
// ——— auditoria (somente leitura; o mock só tem uma amostra do dia) ———
function eventosDe(b: Banco): EventoMock[] {
  if (!b.auditoria) {
    const hoje = new Date();
    const em = (h: number, m: number) => new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), h, m).toISOString();
    const base = { sensivel: false, destaque: false, aprovador_id: null, aprovador_nome: null, aprovado_com_pin: false, terminal_nome: "Caixa", ip: "192.168.0.10", alvo_tipo: null, alvo_id: null, alvo_rotulo: null, mesa_id: null, atendimento_id: null, valor_antes: null, valor_depois: null, valor_centavos: null, motivo: null, resultado: "ok", detalhes: null };
    const ana = { usuario_id: 4, usuario_nome: "Ana", usuario_perfil: "ATENDENTE" };
    const joao = { usuario_id: 3, usuario_nome: "João", usuario_perfil: "ATENDENTE" };
    const marta = { usuario_id: 2, usuario_nome: "Marta", usuario_perfil: "GERENTE" };
    const aprov = { aprovador_id: 2, aprovador_nome: "Marta", aprovado_com_pin: true };
    const lista: Omit<EventoMock, "id" | "hash" | "hash_anterior">[] = [
      { ...base, ...joao, criado_em: em(8, 2), tipo: "caixa.aberto", valor_centavos: 15000, alvo_rotulo: "Caixa do dia" },
      { ...base, ...joao, ...aprov, criado_em: em(14, 10), tipo: "caixa.sangria", sensivel: true, valor_centavos: 20000, motivo: "excesso na gaveta" },
      { ...base, ...ana, criado_em: em(19, 30), tipo: "atendimento.aberto", terminal_nome: "Celular Ana", mesa_id: 4, alvo_rotulo: "Mesa 4" },
      { ...base, ...marta, criado_em: em(19, 31), tipo: "config.alterada", valor_antes: "R$ 14,00", valor_depois: "R$ 15,00", alvo_rotulo: "Preço do Pastel especial G" },
      { ...base, ...joao, ...aprov, criado_em: em(19, 58), tipo: "entrega.taxa_manual", sensivel: true, valor_antes: "R$ 7,00", valor_depois: "R$ 15,00", motivo: "chuva", alvo_rotulo: "Delivery D0015" },
      { ...base, ...ana, ...aprov, criado_em: em(20, 20), tipo: "desconto.conta", sensivel: true, terminal_nome: "Celular Ana", valor_centavos: 1000, valor_antes: "R$ 72,00", valor_depois: "R$ 62,00", motivo: "aniversário", mesa_id: 4, alvo_rotulo: "Mesa 4 · AT0231" },
      { ...base, ...joao, criado_em: em(20, 33), tipo: "impressao.reimpressao", alvo_rotulo: "Balcão #128 · 2ª via" },
      { ...base, ...ana, ...aprov, criado_em: em(20, 41), tipo: "item.cancelado", sensivel: true, terminal_nome: "Celular Ana", valor_centavos: 1500, valor_antes: "R$ 15,00 (1 un)", valor_depois: "R$ 0,00 (cancelado)", motivo: "Saiu errado", mesa_id: 4, alvo_rotulo: "Mesa 4 · Açaí 300 ml" },
      { ...base, usuario_id: null, usuario_nome: "?", usuario_perfil: "", criado_em: em(3, 12), tipo: "login.falhou", destaque: true, terminal_nome: null, detalhes: '{"login":"paulo"}', resultado: "negado" },
    ];
    let ant = "0".repeat(64);
    b.auditoria = lista
      .sort((x, y) => x.criado_em.localeCompare(y.criado_em))
      .map((e, i) => {
        const hash = (Math.abs([...`${ant}${e.tipo}${i}`].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 7)).toString(16) + "a1b2c3d4e5f6").padEnd(64, "0").slice(0, 64);
        const ev = { ...e, id: 18430 + i, hash, hash_anterior: ant };
        ant = hash;
        return ev;
      });
  }
  return b.auditoria;
}
function filtrarEventos(lista: EventoMock[], q: URLSearchParams) {
  return lista.filter(
    (e) =>
      (!q.get("usuario_id") || e.usuario_id === Number(q.get("usuario_id"))) &&
      (!q.get("tipo") || q.get("tipo")!.split(",").includes(e.tipo)) &&
      (q.get("sensivel") !== "true" || e.sensivel) &&
      (!q.get("mesa_id") || e.mesa_id === Number(q.get("mesa_id"))) &&
      (!q.get("de") || e.criado_em >= new Date(q.get("de")!).toISOString()) &&
      (!q.get("ate") || e.criado_em <= new Date(q.get("ate")!).toISOString()),
  );
}
const soGestao = (ctx: Ctx) => (GESTAO.has(usuarioDoToken(ctx.token)?.tipo ?? "") ? null : erro(403, "sem_permissao", "Sem permissão"));
rota("GET", "/auditoria", (_m, _c, ctx, url) => {
  const neg = soGestao(ctx);
  if (neg) return neg;
  const lim = Math.min(100, Number(url.searchParams.get("limite") ?? 50));
  const pag = Math.max(1, Number(url.searchParams.get("pagina") ?? 1));
  const itens = filtrarEventos(eventosDe(db()), url.searchParams)
    .slice()
    .reverse()
    .map((e) => ({ ...e, origem: "evento", legado: false }));
  return ok({ itens: itens.slice((pag - 1) * lim, pag * lim), pagina: pag, paginas: Math.max(1, Math.ceil(itens.length / lim)) });
});
rota("GET", "/auditoria/alertas", (_m, _c, ctx, url) => {
  const neg = soGestao(ctx);
  if (neg) return neg;
  const b = db();
  const vistos = new Set(b.alertas_vistos ?? []);
  const todos = eventosDe(b).filter((e) => e.sensivel || e.destaque).slice().reverse();
  return ok(url.searchParams.get("visto") === "true" ? todos : todos.filter((e) => !vistos.has(e.id)));
});
rota("POST", "/auditoria/alertas/(\\d+)/visto", (m, _c, ctx) => {
  const neg = soGestao(ctx);
  if (neg) return neg;
  const b = db();
  b.alertas_vistos = [...new Set([...(b.alertas_vistos ?? []), Number(m[1])])];
  salvar();
  return ok({ ok: true });
});
rota("GET", "/auditoria/resumo", (_m, _c, ctx, url) => {
  const neg = soGestao(ctx);
  if (neg) return neg;
  const mapa = new Map<number, Record<string, number | string>>();
  for (const e of filtrarEventos(eventosDe(db()), url.searchParams)) {
    if (!e.usuario_id) continue;
    const it = mapa.get(e.usuario_id) ?? { usuario_id: e.usuario_id, nome: e.usuario_nome, perfil: e.usuario_perfil, cancelamentos: 0, descontos_qtd: 0, descontos_centavos: 0, taxas_manuais: 0, estornos: 0, reimpressoes: 0, sangrias: 0, diferenca_caixa_centavos: 0, logins_fora_horario: 0 };
    const inc = (k: string, v = 1) => (it[k] = Number(it[k]) + v);
    if (["item.cancelado", "atendimento.cancelado", "pedido.cancelado"].includes(e.tipo)) inc("cancelamentos");
    if (e.tipo === "desconto.conta" || e.tipo === "desconto.item") {
      inc("descontos_qtd");
      inc("descontos_centavos", Math.abs(e.valor_centavos ?? 0));
    }
    if (e.tipo === "entrega.taxa_manual") inc("taxas_manuais");
    if (e.tipo === "pagamento.estornado") inc("estornos");
    if (e.tipo === "impressao.reimpressao") inc("reimpressoes");
    if (e.tipo === "caixa.sangria") inc("sangrias");
    mapa.set(e.usuario_id, it);
  }
  return ok([...mapa.values()]);
});
rota("GET", "/auditoria/verificar", (_m, _c, ctx) => {
  const neg = soGestao(ctx);
  if (neg) return neg;
  const ev = eventosDe(db());
  const ult = ev[ev.length - 1];
  return ok({ ok: true, conferencia: ult ? `${ult.id}:${ult.hash.slice(0, 8)}` : null });
});
rota("GET", "/auditoria/exportar", (_m, _c, ctx, url) => {
  if (!["ROOT", "ADMIN"].includes(usuarioDoToken(ctx.token)?.tipo ?? "")) return erro(403, "exportacao_restrita", "Só o dono exporta a auditoria.");
  const cab = ["id", "criado_em", "tipo", "usuario_nome", "usuario_perfil", "aprovador_nome", "motivo", "valor_centavos", "resultado", "hash", "hash_anterior"];
  const linhas = filtrarEventos(eventosDe(db()), url.searchParams).map((e) => [e.id, e.criado_em, e.tipo, e.usuario_nome, e.usuario_perfil, e.aprovador_nome ?? "", (e.motivo ?? "").replaceAll(";", ","), e.valor_centavos ?? "", e.resultado, e.hash, e.hash_anterior].join(";"));
  return ok("\uFEFF" + [cab.join(";"), ...linhas].join("\n"));
});
rota("GET", "/aprovadores", () => ok(USUARIOS.filter((u) => GESTAO.has(u.tipo)).map((u) => ({ id: u.id, nome: u.nome }))));

// ——— configurações e módulos ———
rota("GET", "/configuracoes/modulos", () => {
  const c = db().config;
  return ok({ estoque_nivel: c.estoque_nivel, usa_gaveta: c.usa_gaveta, delivery: c.delivery, promocoes: c.promocoes } satisfies Modulos);
});
rota("GET", "/configuracoes", (_m, _c, ctx) => {
  if (!["ROOT", "ADMIN"].includes(usuarioDoToken(ctx.token)?.tipo ?? "")) return erro(403, "", "Sem permissão");
  const b = db();
  return ok({ configurado: true, id: 1, nome_restaurante: b.config.nome_fantasia, ...b.config, kds_atraso_min: b.config.kds_atraso_min ?? 15, taxa_entrega_centavos: b.entrega.taxa_entrega_centavos });
});
rota("PATCH", "/configuracoes", (_m, c) => {
  const b = db();
  Object.assign(b.config, c);
  salvar();
  return ok(b.config);
});
rota("PUT", "/configuracoes", (_m, c) => {
  const b = db();
  Object.assign(b.config, c);
  salvar();
  return ok(b.config);
});

// ——— cardápio ———
rota("GET", "/cardapio/pdv", () => ok(db().cardapio));
rota("GET", "/formas-pagamento", () => ok(FORMAS));
rota("GET", "/produtos/mais-vendidos", (_m, _c, _x, url) => ok(maisVendidos(db(), Number(url.searchParams.get("limite") ?? 9))));

// ——— mesas e atendimentos (rotas de hoje) ———
rota("GET", "/mesas", () => {
  const b = db();
  return ok(
    b.mesas.map((m) => {
      const at = b.atendimentos.find((a) => a.mesa_id === m.id && a.status === "ABERTO");
      return {
        ...m,
        status: at ? "OCUPADA" : "LIVRE",
        atendimento_aberto: at
          ? { id: at.id, codigo_atendimento: at.codigo_atendimento, cliente_nome: at.cliente_nome, tipo_atendimento: at.tipo_atendimento, aberto_em: at.aberto_em, total_centavos: totaisAt(b, at).total_centavos }
          : null,
      };
    }),
  );
});
rota("GET", "/atendimentos", (_m, _c, _x, url) => {
  const b = db();
  const st = url.searchParams.get("status");
  const tipo = url.searchParams.get("tipo");
  return ok(
    b.atendimentos
      .filter((a) => (!st || a.status === st) && (!tipo || a.tipo_atendimento === tipo))
      .map((a) => detalheAt(b, a))
      .reverse(),
  );
});
rota("GET", "/atendimentos/(\\d+)", (m) => {
  const b = db();
  const at = b.atendimentos.find((a) => a.id === Number(m[1]));
  return at ? ok(detalheAt(b, at)) : erro(404, "nao_encontrado", "Conta não encontrada");
});
rota("POST", "/atendimentos", (_m, c, ctx) => {
  const b = db();
  const u = usuarioDoToken(ctx.token);
  const tipo = String(c.tipo_atendimento ?? "").toUpperCase() as AtMock["tipo_atendimento"];
  if (!["MESA", "BALCAO", "RETIRADA", "ENTREGA"].includes(tipo)) return erro(400, "tipo_invalido", "tipo_atendimento inválido");
  const mesaId = tipo === "MESA" ? Number(c.mesa_id) : null;
  if (tipo === "MESA" && b.atendimentos.some((a) => a.mesa_id === mesaId && a.status === "ABERTO")) {
    const ja = b.atendimentos.find((a) => a.mesa_id === mesaId && a.status === "ABERTO")!;
    return erro(409, "mesa_ocupada", `Mesa ${b.mesas.find((x) => x.id === mesaId)?.numero ?? mesaId} já tem atendimento aberto`, { atendimento_id: ja.id, codigo_atendimento: ja.codigo_atendimento });
  }
  const at = criarAt(b, tipo, mesaId, u?.id ?? 0);
  at.cliente_nome = (c.cliente_nome as string) ?? null;
  at.cliente_telefone = (c.cliente_telefone as string) ?? null;
  at.cliente_id = (c.cliente_id as number) ?? null;
  salvar();
  return ok(detalheAt(b, at), 201);
});
rota("POST", "/atendimentos/(\\d+)/pedidos", (m, c) => {
  const b = db();
  const at = b.atendimentos.find((a) => a.id === Number(m[1]));
  if (!at || at.status !== "ABERTO") return erro(409, "conta_fechada", "Conta não está aberta");
  const itens = (c.itens as PedidoItemInput[]) ?? [];
  if (!itens.length) return erro(400, "sem_itens", "Pedido sem itens");
  const ped: PedidoMock = { id: b.seq++, codigo_pedido: `PD${String(b.seq).padStart(4, "0")}`, status: "ENVIADO", createdAt: agora(), itens: itens.map((i) => itemDe(b, i.produto_variante_id, i.quantidade ?? 1, i)) };
  at.pedidos.push(ped);
  salvar();
  // Como no servidor: { pedido, impressao }.
  return ok({ pedido: { ...ped, atendimento_id: at.id, itens: ped.itens.map((i) => ({ ...i, valor_linha_centavos: linha(i) })) }, impressao: { producao: "na_fila" } }, 201);
});
rota("POST", "/atendimentos/(\\d+)/taxa-servico", (m, c) => {
  const b = db();
  const at = b.atendimentos.find((a) => a.id === Number(m[1]))!;
  at.taxa_servico_aplicada = !!c.aplicar;
  salvar();
  return ok(detalheAt(b, at));
});
rota("POST", "/atendimentos/(\\d+)/desconto", (m, c, ctx) => {
  const b = db();
  const at = b.atendimentos.find((a) => a.id === Number(m[1]))!;
  const v = Number(c.desconto_centavos ?? c.valor_centavos ?? 0);
  const u = usuarioDoToken(ctx.token);
  if (v > b.config.limite_desconto_sem_pin_centavos && !GESTAO.has(u?.tipo ?? "")) {
    const e = conferirAprovacao(c.aprovacao ?? (c.aprovador_id ? { aprovador_id: c.aprovador_id, pin: c.pin } : undefined));
    if (e) return e;
  }
  at.desconto_centavos = v;
  at.desconto_motivo = (c.motivo as string) ?? null;
  salvar();
  return ok(detalheAt(b, at));
});
rota("POST", "/atendimentos/(\\d+)/preconta", () => ok({ impressao: "na_fila" }));
const semCaixa = (ctx: Ctx) => (usuarioDoToken(ctx.token)?.pode_operar_caixa ? null : erro(403, "sem_permissao_caixa", "Sem permissão para operar o caixa."));
rota("POST", "/atendimentos/(\\d+)/pagamentos", (m, c, ctx) => {
  const negado = semCaixa(ctx);
  if (negado) return negado;
  const b = db();
  if (!b.caixa) return erro(409, "caixa_fechado", "Abra o caixa para receber.");
  const at = b.atendimentos.find((a) => a.id === Number(m[1]))!;
  const valor = Number(c.valor_centavos);
  const recebido = Number(c.valor_recebido_centavos ?? valor);
  const forma = FORMAS.find((f) => f.id === Number(c.forma_pagamento_id));
  if (!forma) return erro(400, "forma_invalida", "Forma de pagamento inválida");
  const pg = { id: b.seq++, forma_pagamento_id: forma.id, valor_centavos: valor, troco_centavos: forma.abre_gaveta ? Math.max(0, recebido - valor) : 0, criado_em: agora() };
  at.pagamentos.push(pg);
  salvar();
  return ok({ ...pg, gaveta: b.config.usa_gaveta && forma.abre_gaveta ? "aberta" : "nao_usada" }, 201);
});
rota("POST", "/atendimentos/(\\d+)/fechar", (m) => {
  const b = db();
  const at = b.atendimentos.find((a) => a.id === Number(m[1]))!;
  const t = totaisAt(b, at);
  if (t.restante_centavos > 0) return erro(409, "falta_pagamento", `Ainda falta receber ${(t.restante_centavos / 100).toFixed(2).replace(".", ",")}`);
  at.status = "FECHADO";
  at.fechado_em = agora();
  salvar();
  return ok({ ...detalheAt(b, at), impressao: { comprovante: "na_fila" } });
});
rota("POST", "/atendimentos/(\\d+)/cancelar", (m) => {
  const b = db();
  const at = b.atendimentos.find((a) => a.id === Number(m[1]))!;
  at.status = "CANCELADO";
  salvar();
  return ok(detalheAt(b, at));
});
rota("POST", "/atendimentos/(\\d+)/juntar", (m, c) => {
  const b = db();
  const origem = b.atendimentos.find((a) => a.id === Number(m[1]));
  const destino = b.atendimentos.find((a) => a.id === Number(c.destino_id));
  if (!origem || !destino) return erro(404, "nao_encontrado", "Conta não encontrada");
  destino.pedidos.push(...origem.pedidos);
  origem.pedidos = [];
  origem.status = "CANCELADO";
  salvar();
  return ok(detalheAt(b, destino));
});
rota("POST", "/atendimentos/(\\d+)/transferir", (m, c) => {
  const b = db();
  const at = b.atendimentos.find((a) => a.id === Number(m[1]))!;
  at.mesa_id = Number(c.mesa_id);
  salvar();
  return ok(detalheAt(b, at));
});

// ——— §1 caixa ———
rota("GET", "/caixa/atual", () => ok(caixaAtual(db())));
rota("POST", "/caixa/abrir", (_m, c, ctx) => {
  const b = db();
  if (b.caixa) return erro(409, "caixa_ja_aberto", "Já existe um caixa aberto");
  b.caixa = { id: b.seq++, fundo_troco_centavos: Number(c.fundo_troco_centavos ?? 0), aberto_em: agora(), usuario_abertura_id: usuarioDoToken(ctx.token)?.id ?? 0, movs: [] };
  // §9: os esgotados voltam ao abrir o primeiro caixa do dia.
  for (const cat of b.cardapio) for (const p of cat.produtos) for (const v of p.variantes) v.esgotado = false;
  salvar();
  return ok({ ...caixaAtual(b), gaveta: b.config.usa_gaveta ? "aberta" : "nao_usada" }, 201);
});
const ehGestorCtx = (ctx: Ctx) => GESTAO.has(usuarioDoToken(ctx.token)?.tipo ?? "");
function esperadoPorForma(b: Banco) {
  const s = b.caixa!;
  const desde = new Date(s.aberto_em).getTime() - 1;
  const pags = b.atendimentos.flatMap((a) => a.pagamentos).filter((p) => new Date(p.criado_em).getTime() >= desde);
  const sangria = s.movs.filter((m) => m.tipo === "SANGRIA").reduce((t, m) => t + m.valor_centavos, 0);
  const supr = s.movs.filter((m) => m.tipo === "SUPRIMENTO").reduce((t, m) => t + m.valor_centavos, 0);
  return FORMAS.filter((f) => f.ativo).map((f) => {
    const soma = pags.filter((p) => p.forma_pagamento_id === f.id).reduce((t, p) => t + p.valor_centavos, 0);
    return { forma_pagamento_id: f.id, nome: f.nome, eh_dinheiro: f.eh_dinheiro, esperado_centavos: f.eh_dinheiro ? s.fundo_troco_centavos + soma - sangria + supr : soma };
  });
}
rota("GET", "/caixa/previa", (_m, _c, ctx) => {
  const b = db();
  if (!b.caixa) return erro(409, "caixa_fechado", "O caixa está fechado.");
  const g = ehGestorCtx(ctx);
  const c = caixaAtual(b);
  return ok({
    sessao_id: b.caixa.id,
    sessao_anterior: c.sessao_anterior,
    formas: esperadoPorForma(b).map((f) => (g ? { forma_pagamento_id: f.forma_pagamento_id, nome: f.nome, esperado_centavos: f.esperado_centavos } : { forma_pagamento_id: f.forma_pagamento_id, nome: f.nome })),
  });
});
rota("POST", "/caixa/(\\d+)/movimentacao", (m, c, ctx) => {
  const b = db();
  if (!b.caixa || b.caixa.id !== Number(m[1])) return erro(400, "caixa_fechado", "Caixa não está aberto");
  const valor = Math.round(Number(c.valor_centavos));
  if (!(valor > 0)) return erro(400, "valor_invalido", "Valor inválido");
  if (!String(c.motivo ?? "").trim()) return erro(400, "motivo_obrigatorio", "Informe o motivo");
  if (c.tipo === "SANGRIA" && !ehGestorCtx(ctx)) {
    const neg = conferirAprovacao({ aprovador_id: c.aprovador_id, pin: c.pin });
    if (neg) return erro(403, "aprovacao_necessaria", "Sangria exige gerente ou PIN válido.");
  }
  const mov = { id: b.seq++, tipo: String(c.tipo), valor_centavos: valor, motivo: String(c.motivo), criado_em: agora(), usuario_id: usuarioDoToken(ctx.token)?.id ?? 0 };
  b.caixa.movs.push(mov);
  salvar();
  return ok({ ...mov, impressao: { status: "na_fila" }, gaveta: b.config.usa_gaveta ? "aberta" : "nao_usada" }, 201);
});
rota("POST", "/caixa/(\\d+)/fechar", (m, c, ctx) => {
  const b = db();
  if (!b.caixa || b.caixa.id !== Number(m[1])) return erro(400, "caixa_fechado", "Caixa não está aberto.");
  const abertas = b.atendimentos.filter((a) => a.status === "ABERTO");
  if (abertas.length && !c.forcar)
    return erro(409, "contas_abertas", "Ainda há contas abertas. Feche as contas ou confirme com motivo.", {
      contas: abertas.map((a) => ({ id: a.id, codigo_atendimento: a.codigo_atendimento, mesa: a.mesa_id ? { numero: b.mesas.find((x) => x.id === a.mesa_id)?.numero } : null })),
    });
  if (abertas.length && c.forcar && !String(c.motivo ?? "").trim()) return erro(400, "motivo_obrigatorio", "Informe o motivo para fechar com contas abertas.");
  const contagem = (c.contagem as { forma_pagamento_id: number; valor_centavos: number }[] | undefined) ?? [];
  if (!Array.isArray(contagem) || contagem.some((x) => !(Number(x.valor_centavos) >= 0))) return erro(400, "valor_invalido", "Informe o valor contado de cada forma.");
  const fech = esperadoPorForma(b).map((f) => {
    const contado = Math.round(Number(contagem.find((x) => Number(x.forma_pagamento_id) === f.forma_pagamento_id)?.valor_centavos ?? 0));
    return { ...f, contado_centavos: contado, diferenca_centavos: contado - f.esperado_centavos };
  });
  const falta = fech.some((f) => f.diferenca_centavos < 0);
  if (falta) {
    if (!String(c.motivo ?? "").trim()) return erro(400, "motivo_obrigatorio", "A falta no caixa precisa de um motivo.");
    const ap = c.aprovacao as { aprovador_id?: number; pin?: string } | undefined;
    const u = USUARIOS.find((x) => x.id === Number(ap?.aprovador_id));
    if (!u || !GESTAO.has(u.tipo) || ap?.pin !== PIN_GERENTE) return erro(403, "aprovacao_necessaria", "A falta no caixa precisa da aprovação de um gerente.");
  }
  const g = ehGestorCtx(ctx);
  const id = b.caixa.id;
  const conferencia = `${b.seq + 18000}:${Math.random().toString(16).slice(2, 10)}`;
  const sessao = { ...caixaAtual(b).sessao!, fechado_em: agora(), aberta: false, codigo_conferencia: conferencia };
  b.caixasFechados = [...(b.caixasFechados ?? []), { id, fech, conferencia }];
  b.caixa = null;
  salvar();
  return ok({
    ...sessao,
    formas: fech.map((f) => (g ? { forma_pagamento_id: f.forma_pagamento_id, nome: f.nome, esperado_centavos: f.esperado_centavos, contado_centavos: f.contado_centavos, diferenca_centavos: f.diferenca_centavos } : { forma_pagamento_id: f.forma_pagamento_id, nome: f.nome, contado_centavos: f.contado_centavos })),
    impressao: { status: "na_fila" },
    gaveta: "nao_usada",
    conferencia,
    pode_reimprimir: true,
  });
});
rota("POST", "/caixa/(\\d+)/reimprimir", (m) => {
  const f = (db().caixasFechados ?? []).find((x) => x.id === Number(m[1]));
  return f ? ok({ impressao: { status: "na_fila" }, conferencia: f.conferencia }) : erro(400, "caixa_aberto", "Esse caixa não está fechado.");
});
rota("POST", "/caixa/gaveta", () => (db().config.usa_gaveta ? ok({ gaveta: "aberta" }) : erro(409, "gaveta_nao_usada", "Gaveta desligada nas configurações")));

// ——— §2 clientes ———
rota("GET", "/clientes", (_m, _c, _x, url) => {
  const b = db();
  const q = (url.searchParams.get("busca") ?? "").trim();
  const dig = q.replace(/\D/g, "");
  const nq = normalizarBairro(q);
  const lim = Number(url.searchParams.get("limite") ?? 20);
  return ok(
    b.clientes
      .filter((c) => c.ativo && (!q || (dig && c.telefone.includes(dig)) || normalizarBairro(c.nome).includes(nq)))
      .slice(0, lim)
      .map((c) => {
        const full = clienteCompleto(b, c);
        return { id: c.id, nome: c.nome, telefone: c.telefone, enderecos_qtd: full.enderecos.length, ultimo_pedido_em: full.ultimo_pedido_em };
      }),
  );
});
rota("GET", "/clientes/por-telefone/(\\d+)", (m) => {
  const b = db();
  const c = b.clientes.find((x) => x.ativo && x.telefone === m[1]);
  return c ? ok(clienteCompleto(b, c)) : erro(404, "cliente_nao_encontrado", "Cliente não encontrado");
});
rota("GET", "/clientes/(\\d+)", (m) => {
  const b = db();
  const c = b.clientes.find((x) => x.id === Number(m[1]));
  return c ? ok(clienteCompleto(b, c)) : erro(404, "cliente_nao_encontrado", "Cliente não encontrado");
});
function validarTelefone(b: Banco, tel: string, ignorar?: number): Resp | null {
  if (tel.length < 10 || tel.length > 11) return erro(400, "telefone_invalido", "Telefone precisa de DDD + número (10 ou 11 dígitos)", { campos: { telefone: "DDD + número" } });
  const dono = b.clientes.find((x) => x.ativo && x.telefone === tel && x.id !== ignorar);
  if (dono) return erro(409, "telefone_em_uso", `Telefone já cadastrado para ${dono.nome}`, { cliente_id: dono.id });
  return null;
}
rota("POST", "/clientes", (_m, c) => {
  const b = db();
  const tel = String(c.telefone ?? "").replace(/\D/g, "");
  if (!String(c.nome ?? "").trim()) return erro(400, "nome_obrigatorio", "Informe o nome", { campos: { nome: "Obrigatório" } });
  const e = validarTelefone(b, tel);
  if (e) return e;
  const cli: ClienteMock = { id: b.seq++, nome: String(c.nome).trim(), telefone: tel, telefone2: (c.telefone2 as string) || null, observacao: (c.observacao as string) || null, ativo: true, createdAt: agora() };
  b.clientes.push(cli);
  if (c.endereco) novoEndereco(b, cli.id, c.endereco as EnderecoInput, true);
  salvar();
  return ok(clienteCompleto(b, cli), 201);
});
rota("PATCH", "/clientes/(\\d+)", (m, c, ctx) => {
  const b = db();
  const cli = b.clientes.find((x) => x.id === Number(m[1]));
  if (!cli) return erro(404, "cliente_nao_encontrado", "Cliente não encontrado");
  if (c.ativo === false && !GESTAO.has(usuarioDoToken(ctx.token)?.tipo ?? "")) return erro(403, "sem_permissao", "Só gerente desativa cliente");
  if (c.telefone != null) {
    const tel = String(c.telefone).replace(/\D/g, "");
    const e = validarTelefone(b, tel, cli.id);
    if (e) return e;
    cli.telefone = tel;
  }
  for (const k of ["nome", "telefone2", "observacao", "ativo"] as const) if (k in c) (cli as Record<string, unknown>)[k] = c[k];
  salvar();
  return ok(clienteCompleto(b, cli));
});
rota("POST", "/clientes/(\\d+)/enderecos", (m, c) => {
  const b = db();
  const id = Number(m[1]);
  const primeiro = !b.enderecos.some((e) => e.cliente_id === id && e.ativo);
  const end = novoEndereco(b, id, c as unknown as EnderecoInput, primeiro);
  salvar();
  return ok(end, 201);
});
rota("PATCH", "/clientes/(\\d+)/enderecos/(\\d+)", (m, c) => {
  const b = db();
  const end = b.enderecos.find((e) => e.id === Number(m[2]) && e.cliente_id === Number(m[1]));
  if (!end) return erro(404, "endereco_nao_encontrado", "Endereço não encontrado");
  if (c.principal) for (const e of b.enderecos) if (e.cliente_id === end.cliente_id) e.principal = false;
  Object.assign(end, c);
  if ("lat" in c || "lng" in c) end.geo_origem = end.lat != null && end.lng != null ? "manual" : "nenhuma";
  salvar();
  return ok(end);
});
rota("GET", "/clientes/(\\d+)/historico", (m) => {
  const b = db();
  const ats = b.atendimentos.filter((a) => a.cliente_id === Number(m[1])).reverse();
  const itens = ats.map((a) => ({
    atendimento_id: a.id,
    codigo: a.codigo_atendimento,
    tipo: a.tipo_atendimento,
    status: a.status,
    total_centavos: totaisAt(b, a).total_centavos,
    aberto_em: a.aberto_em,
    itens_resumo: a.pedidos.flatMap((p) => p.itens).map((i) => `${i.quantidade}× ${i.nome_produto}`).join(", "),
  }));
  return ok({ itens, total_gasto_centavos: itens.filter((i) => i.status === "FECHADO").reduce((s, i) => s + i.total_centavos, 0), qtd_pedidos: itens.length, pagina: 1, paginas: 1 });
});

// ——— §3 endereço ———
rota("GET", "/enderecos/cep/(\\d+)", (m) => {
  if (localStorage.getItem("mock_sem_internet") === "1") return erro(503, "sem_internet", "Sem internet: siga com o cadastro manual.");
  const d = CEPS[m[1]];
  return d ? ok({ fonte: "viacep", cep: m[1], ...d }) : erro(404, "cep_nao_encontrado", "CEP não encontrado");
});
rota("POST", "/enderecos/geocodificar", (_m, c) => geo(c as { bairro?: string }));

// ——— §4 entrega ———
rota("POST", "/entrega/cotar", (_m, c) => {
  const b = db();
  const e = c.endereco_id ? b.enderecos.find((x) => x.id === Number(c.endereco_id)) : (c.endereco as EnderecoInput | undefined);
  if (!e) return erro(400, "endereco_obrigatorio", "Informe o endereço");
  return ok(cotarNoBanco(b, e));
});
rota("PUT", "/atendimentos/(\\d+)/entrega", (m, c, ctx) => {
  const b = db();
  const at = b.atendimentos.find((a) => a.id === Number(m[1]));
  if (!at) return erro(404, "nao_encontrado", "Conta não encontrada");
  let end = c.endereco_id ? b.enderecos.find((x) => x.id === Number(c.endereco_id)) : undefined;
  if (!end && c.endereco && c.cliente_id) end = novoEndereco(b, Number(c.cliente_id), c.endereco as EnderecoInput, false);
  const e = end ?? (c.endereco as EnderecoInput | undefined);
  if (!e) return erro(400, "endereco_obrigatorio", "Informe o endereço");
  const cot = cotarNoBanco(b, e);
  const manual = c.taxa_manual_centavos != null ? Number(c.taxa_manual_centavos) : null;
  const u = usuarioDoToken(ctx.token);
  if (manual != null) {
    if (!String(c.motivo ?? "").trim()) return erro(400, "motivo_obrigatorio", "Diga o motivo da taxa digitada", { campos: { motivo: "Obrigatório" } });
    if (!GESTAO.has(u?.tipo ?? "") && taxaManualPrecisaPin(cot.taxa_centavos, manual, b.config.limite_desconto_sem_pin_centavos)) {
      const er = conferirAprovacao(c.aprovacao);
      if (er) return er;
    }
  } else if (cot.status !== "ok") {
    if (!c.forcar) return erro(409, cot.status, cot.avisos[0] ?? "Entrega não confirmada", { status: cot.status });
  }
  at.cliente_id = (c.cliente_id as number) ?? at.cliente_id;
  at.endereco_entrega_id = end?.id ?? null;
  at.cliente_endereco = [e.logradouro, e.sem_numero ? "s/n" : e.numero, e.complemento, e.bairro].filter(Boolean).join(", ");
  at.entrega_distancia_m = cot.distancia_m ?? null;
  at.taxa_entrega_calculada_centavos = cot.taxa_centavos ?? null;
  at.taxa_entrega_centavos = manual ?? cot.taxa_centavos ?? 0;
  at.taxa_entrega_origem = manual != null ? "manual" : cot.origem_taxa ?? null;
  salvar();
  return ok(detalheAt(b, at));
});
rota("GET", "/entrega/config", () => {
  const b = db();
  return ok({ ...b.entrega, faixas: b.faixas });
});
rota("PUT", "/entrega/config", (_m, c) => {
  const b = db();
  const { faixas, ...resto } = c as unknown as ConfigEntrega;
  Object.assign(b.entrega, resto);
  if (Array.isArray(faixas)) b.faixas = faixas.map((f, i) => ({ ...f, id: i + 1, ordem: i + 1, ativo: f.ativo ?? true }));
  salvar();
  return ok({ ...b.entrega, faixas: b.faixas });
});
rota("GET", "/entrega/bairros", () => ok(db().bairros.filter((x) => x.ativo)));
rota("POST", "/entrega/bairros", (_m, c) => {
  const b = db();
  const nb = { id: b.seq++, nome: String(c.nome), cidade: String(c.cidade ?? ""), taxa_centavos: Number(c.taxa_centavos ?? 0), atende: c.atende !== false, ativo: true };
  if (b.bairros.some((x) => x.ativo && normalizarBairro(x.nome) === normalizarBairro(nb.nome))) return erro(409, "bairro_repetido", "Esse bairro já está cadastrado");
  b.bairros.push(nb);
  salvar();
  return ok(nb, 201);
});
rota("PATCH", "/entrega/bairros/(\\d+)", (m, c) => {
  const b = db();
  const x = b.bairros.find((y) => y.id === Number(m[1]));
  if (!x) return erro(404, "nao_encontrado", "Bairro não encontrado");
  Object.assign(x, c);
  salvar();
  return ok(x);
});

// ——— §6 venda rápida ———
rota("POST", "/vendas/rapida", (_m, c, ctx) => {
  const b = db();
  if (!ctx.chaveIdempotencia) return erro(400, "idempotency_key_obrigatoria", "Falta o cabeçalho Idempotency-Key");
  const negado = semCaixa(ctx);
  if (negado) return negado;
  const hash = JSON.stringify(c);
  const visto = b.idem[ctx.chaveIdempotencia];
  if (visto) return visto.hash === hash ? visto.resp : erro(422, "chave_reutilizada", "Chave reutilizada com outro pedido");
  if (!b.caixa) return erro(409, "caixa_fechado", "Abra o caixa para vender.");
  const itens = (c.itens as PedidoItemInput[]) ?? [];
  if (!itens.length) return erro(400, "sem_itens", "Venda sem itens");
  for (const i of itens) if (varPorId(b, i.produto_variante_id)?.v.esgotado) return erro(409, "sem_estoque", "Item esgotado", { itens: [{ produto_variante_id: i.produto_variante_id }] });
  const u = usuarioDoToken(ctx.token);
  const at = criarAt(b, "VENDA_RAPIDA", null, u?.id ?? 0);
  at.cliente_nome = (c.cliente_nome as string) || null;
  at.cliente_id = (c.cliente_id as number) ?? null;
  const ped: PedidoMock = { id: b.seq++, codigo_pedido: `PD${b.seq}`, status: "ENVIADO", createdAt: agora(), itens: itens.map((i) => itemDe(b, i.produto_variante_id, i.quantidade, i)) };
  at.pedidos.push(ped);
  const sub = ped.itens.reduce((s, i) => s + linha(i), 0);
  const d = c.desconto as { centavos?: number; percentual?: number; motivo?: string; aprovacao?: unknown } | undefined;
  if (d) {
    const dc = d.percentual ? Math.round((sub * d.percentual) / 100) : Number(d.centavos ?? 0);
    if (dc > b.config.limite_desconto_sem_pin_centavos && !GESTAO.has(u?.tipo ?? "")) {
      const er = conferirAprovacao(d.aprovacao);
      if (er) {
        b.atendimentos = b.atendimentos.filter((a) => a.id !== at.id);
        return er;
      }
    }
    at.desconto_centavos = Math.min(dc, sub);
    at.desconto_motivo = d.motivo ?? null;
  }
  const total = sub - at.desconto_centavos;
  const pags = (c.pagamentos as { forma_pagamento_id: number; valor_centavos: number; valor_recebido_centavos?: number }[]) ?? [];
  const soma = pags.reduce((s, p) => s + p.valor_centavos, 0);
  if (soma !== total) {
    b.atendimentos = b.atendimentos.filter((a) => a.id !== at.id);
    return erro(400, "pagamento_diferente_do_total", "A soma dos pagamentos não bate com o total", { total_centavos: total, soma_centavos: soma });
  }
  at.pagamentos = pags.map((p) => {
    const f = FORMAS.find((x) => x.id === p.forma_pagamento_id);
    return { id: b.seq++, forma_pagamento_id: p.forma_pagamento_id, valor_centavos: p.valor_centavos, troco_centavos: f?.abre_gaveta ? Math.max(0, (p.valor_recebido_centavos ?? p.valor_centavos) - p.valor_centavos) : 0, criado_em: agora() };
  });
  at.status = "FECHADO";
  at.fechado_em = agora();
  const imp = (c.imprimir as { producao?: boolean; comprovante?: boolean }) ?? {};
  const usaDinheiro = at.pagamentos.some((p) => FORMAS.find((f) => f.id === p.forma_pagamento_id)?.abre_gaveta);
  const resp = ok(
    {
      atendimento: { id: at.id, codigo_atendimento: at.codigo_atendimento, numero_dia: at.numero_dia, total_centavos: total, status: "FECHADO" },
      pedido_id: ped.id,
      pagamentos: at.pagamentos.map((p) => ({ id: p.id, valor_centavos: p.valor_centavos, troco_centavos: p.troco_centavos })),
      troco_total_centavos: at.pagamentos.reduce((s, p) => s + p.troco_centavos, 0),
      impressao: { producao: imp.producao === false ? "nao_pedida" : "na_fila", comprovante: imp.comprovante === false ? "nao_pedida" : "na_fila" },
      gaveta: b.config.usa_gaveta && usaDinheiro ? "aberta" : "nao_usada",
    },
    201,
  );
  b.idem[ctx.chaveIdempotencia] = { hash, resp };
  salvar();
  return resp;
});

/** Responde uma chamada como se fosse o servidor. */
export async function responderMock(caminho: string, init: RequestInit, ctx: Ctx): Promise<Resp> {
  const lento = Number(localStorage.getItem("mock_atraso_ms") ?? 120);
  await new Promise((r) => setTimeout(r, lento));
  if (localStorage.getItem("mock_offline") === "1") {
    throw Object.assign(new Error("Sem conexão com o servidor (PC do caixa). Confira se ele está ligado e na mesma rede, e tente de novo."), { semConexao: true });
  }
  const url = new URL(caminho, "http://mock.local");
  // Como no servidor: toda rota existe também com o prefixo /api.
  url.pathname = url.pathname.replace(/^\/api(?=\/)/, "");
  const metodo = (init.method ?? "GET").toUpperCase();
  const corpo = typeof init.body === "string" && init.body ? (JSON.parse(init.body) as Corpo) : {};
  const publico = url.pathname === "/auth/login" || url.pathname === "/login" || url.pathname === "/saude";
  if (!publico && !usuarioDoToken(ctx.token)) return erro(401, "", "Faça login");
  // FORMATOS-FRONT: qualquer rota /caixa/* exige pode_operar_caixa.
  if (url.pathname.startsWith("/caixa")) {
    const negado = semCaixa(ctx);
    if (negado) return negado;
  }
  for (const [m, re, h] of ROTAS) {
    if (m !== metodo) continue;
    const achou = url.pathname.match(re);
    if (achou) {
      try {
        const r = await h(achou, corpo, ctx, url);
        // Cópia: a tela nunca pode segurar o objeto vivo do banco do mock (como no servidor real, cada resposta é nova).
        return { ...r, corpo: r.corpo === undefined ? r.corpo : JSON.parse(JSON.stringify(r.corpo)) };
      } catch (e) {
        return erro(500, "erro_mock", `Erro no mock: ${(e as Error).message}`);
      }
    }
  }
  if (metodo === "GET") return ok([]);
  return erro(404, "rota_nao_existe_no_mock", `O mock ainda não responde ${metodo} ${url.pathname}`);
}
