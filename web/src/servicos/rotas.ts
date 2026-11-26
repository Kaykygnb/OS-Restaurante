/**
 * Camada tipada das rotas (CONTRATOS.md). Cada função é a chamada REAL ao servidor;
 * com VITE_MOCK=1 a mesma chamada é respondida pelo mock (servicos/mock), sem mudar nada aqui.
 */
import { api, type ApiErro } from "./api";
import type {
  AplicarEntregaEntrada,
  BairroEntrega,
  CaixaAtual,
  ConexaoRede,
  Dashboard,
  ImpressoraStatus,
  ItemFilaImpressao,
  CaixaPrevia,
  ConfigOperacao,
  KdsResposta,
  CepResposta,
  Cliente,
  ClienteEntrada,
  ClienteResumo,
  ConfigEntrega,
  CotarEntrada,
  Cotacao,
  Endereco,
  EnderecoInput,
  FormaPagamento,
  GeoEntrada,
  GeoResposta,
  HistoricoCliente,
  LoginEntrada,
  LoginResposta,
  MaisVendido,
  Modulos,
  Saude,
  VendaRapidaEntrada,
  VendaRapidaResposta,
} from "./contratos";

const json = (corpo: unknown) => JSON.stringify(corpo);

// ——— Login (§11) ———
export async function entrar(dados: LoginEntrada): Promise<LoginResposta> {
  try {
    return (await api("/auth/login", { method: "POST", body: json(dados) })) as LoginResposta;
  } catch (e) {
    throw normalizarErroLogin(e as ApiErro);
  }
}

/** Login nunca diz se o usuário existe: qualquer 401/400 vira a mesma mensagem genérica. */
export function normalizarErroLogin(e: ApiErro): ApiErro {
  if (e.semConexao) return e;
  if (e.status === 429) {
    const s = Number((e.dados as { tentar_em_s?: number } | undefined)?.tentar_em_s);
    return Object.assign(new Error("Muitas tentativas."), {
      status: 429,
      codigo: "muitas_tentativas",
      dados: { tentar_em_s: Number.isFinite(s) && s > 0 ? s : 60 },
    }) as ApiErro;
  }
  if (e.status === 401 || e.status === 400 || e.status === 404) {
    return Object.assign(new Error("Usuário ou senha inválidos."), { status: 401, codigo: "credenciais_invalidas" }) as ApiErro;
  }
  return e;
}

// ——— §8 / §1 ———
/** §8. `GET /configuracoes/modulos` (qualquer usuário logado). */
export const lerModulos = () => api("/configuracoes/modulos") as Promise<Partial<Modulos>>;
export const lerCaixaAtual = () => api("/caixa/atual") as Promise<CaixaAtual>;
export const lerFormasPagamento = () => api("/formas-pagamento") as Promise<FormaPagamento[]>;
export const saude = () => api("/saude", { tempoLimiteMs: 4000 }) as Promise<Saude>;
export const lerStatusImpressoras = () => api("/impressoras/status", { tempoLimiteMs: 5000 }) as Promise<ImpressoraStatus[]>;
export const lerFilaComErro = () => api("/impressao/fila?status=ERRO") as Promise<ItemFilaImpressao[]>;
export const lerCaixaPrevia = () => api("/caixa/previa") as Promise<CaixaPrevia>;
export const lerDashboard = (p: { de?: string; ate?: string; sem_venda_dias?: number; limite?: number } = {}) => {
  const q = new URLSearchParams(Object.entries(p).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]));
  return api(`/relatorios/dashboard${q.size ? `?${q}` : ""}`) as Promise<Dashboard>;
};
export const lerConfigOperacao = () => api("/configuracoes/operacao") as Promise<ConfigOperacao>;
export const lerKds = (estacao: "cozinha" | "bar") => api(`/pedidos/cozinha?estacao=${estacao}`) as Promise<KdsResposta>;
export const lerConexaoRede = () => api("/rede/conexao", { tempoLimiteMs: 5000 }) as Promise<ConexaoRede>;

// ——— §2 Clientes ———
const soDigitos = (t: string) => t.replace(/\D/g, "");
export const buscarClientes = (busca: string, limite = 20) =>
  api(`/clientes?busca=${encodeURIComponent(busca)}&limite=${limite}`) as Promise<ClienteResumo[]>;
export const clientePorTelefone = (tel: string) => api(`/clientes/por-telefone/${soDigitos(tel)}`) as Promise<Cliente>;
export const lerCliente = (id: number) => api(`/clientes/${id}`) as Promise<Cliente>;
export const criarCliente = (dados: ClienteEntrada) =>
  api("/clientes", { method: "POST", body: json({ ...dados, telefone: soDigitos(dados.telefone) }) }) as Promise<Cliente>;
export const editarCliente = (id: number, dados: Partial<ClienteEntrada> & { ativo?: boolean }) =>
  api(`/clientes/${id}`, {
    method: "PATCH",
    body: json(dados.telefone ? { ...dados, telefone: soDigitos(dados.telefone) } : dados),
  }) as Promise<Cliente>;
export const criarEndereco = (clienteId: number, e: EnderecoInput) =>
  api(`/clientes/${clienteId}/enderecos`, { method: "POST", body: json(e) }) as Promise<Endereco>;
export const editarEndereco = (clienteId: number, id: number, e: Partial<EnderecoInput> & { ativo?: boolean; principal?: boolean }) =>
  api(`/clientes/${clienteId}/enderecos/${id}`, { method: "PATCH", body: json(e) }) as Promise<Endereco>;
export const historicoCliente = (id: number, pagina = 1) =>
  api(`/clientes/${id}/historico?pagina=${pagina}`) as Promise<HistoricoCliente>;

// ——— §3 Endereço ———
export const buscarCep = (cep: string) => api(`/enderecos/cep/${soDigitos(cep)}`, { tempoLimiteMs: 6000 }) as Promise<CepResposta>;
export const geocodificar = (e: GeoEntrada) =>
  api("/enderecos/geocodificar", { method: "POST", body: json(e), tempoLimiteMs: 8000 }) as Promise<GeoResposta>;

// ——— §4 Entrega ———
export const cotarEntrega = (e: CotarEntrada) => api("/entrega/cotar", { method: "POST", body: json(e) }) as Promise<Cotacao>;
export const aplicarEntrega = (atendimentoId: number, e: AplicarEntregaEntrada) =>
  api(`/atendimentos/${atendimentoId}/entrega`, { method: "PUT", body: json(e) });
export const lerConfigEntrega = () => api("/entrega/config") as Promise<ConfigEntrega>;
export const salvarConfigEntrega = (c: Omit<ConfigEntrega, "faixas"> & { faixas: Omit<ConfigEntrega["faixas"][number], "id">[] }) =>
  api("/entrega/config", { method: "PUT", body: json(c) }) as Promise<ConfigEntrega>;
export const listarBairros = () => api("/entrega/bairros") as Promise<BairroEntrega[]>;
export const criarBairro = (b: Omit<BairroEntrega, "id" | "ativo">) =>
  api("/entrega/bairros", { method: "POST", body: json(b) }) as Promise<BairroEntrega>;
export const editarBairro = (id: number, b: Partial<BairroEntrega>) =>
  api(`/entrega/bairros/${id}`, { method: "PATCH", body: json(b) }) as Promise<BairroEntrega>;

// ——— §6 / §7 Venda rápida ———
export const vendaRapida = (dados: VendaRapidaEntrada, chave: string) =>
  api("/vendas/rapida", { method: "POST", body: json(dados), chaveIdempotencia: chave }) as Promise<VendaRapidaResposta>;
export const maisVendidos = (limite = 9, dias = 30) =>
  api(`/produtos/mais-vendidos?limite=${limite}&dias=${dias}`) as Promise<MaisVendido[]>;
