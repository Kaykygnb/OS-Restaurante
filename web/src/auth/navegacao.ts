/** Menu por perfil (prancha 01-mapa). O servidor continua sendo quem bloqueia; aqui é só para não mostrar o que a pessoa não usa. */
import type { NomeIcone } from "../componentes/ui/Icone";
import type { Modulos } from "../servicos/contratos";

export type ItemNav = {
  to: string;
  rotulo: string;
  icone: NomeIcone;
  atalho?: "F2" | "F3" | "F4" | "F8";
  perfis: string[];
  modulo?: (m: Modulos) => boolean;
  /** Só para quem tem "Pode operar caixa". */
  caixa?: boolean;
};

const GESTAO = ["ROOT", "ADMIN", "GERENTE"];
const OPS = [...GESTAO, "ATENDENTE"];
const CFG = ["ROOT", "ADMIN"];

export const ITENS_NAV: ItemNav[] = [
  { to: "/painel", rotulo: "Início", icone: "inicio", perfis: [...OPS, "ENTREGADOR"] },
  { to: "/painel/venda", rotulo: "Venda rápida", icone: "venda", atalho: "F2", perfis: OPS, caixa: true },
  { to: "/painel/mesas", rotulo: "Mesas", icone: "mesas", atalho: "F3", perfis: OPS },
  { to: "/painel/balcao", rotulo: "Balcão", icone: "cardapio", perfis: OPS },
  { to: "/painel/delivery", rotulo: "Delivery", icone: "delivery", atalho: "F4", perfis: OPS, modulo: (m) => m.delivery },
  { to: "/painel/comandas", rotulo: "Pedidos", icone: "lupa", perfis: OPS },
  { to: "/painel/pedidos", rotulo: "Cozinha e bar", icone: "cozinha", perfis: [...GESTAO, "COZINHEIRO"] },
  { to: "/painel/caixa", rotulo: "Caixa", icone: "caixa", atalho: "F8", perfis: OPS, caixa: true },
  { to: "/painel/clientes", rotulo: "Clientes", icone: "clientes", perfis: OPS },
  { to: "/painel/cardapio", rotulo: "Cardápio", icone: "cardapio", perfis: GESTAO },
  { to: "/painel/promocoes", rotulo: "Promoções", icone: "promo", perfis: GESTAO },
  { to: "/painel/estoque", rotulo: "Estoque", icone: "estoque", perfis: GESTAO },
  { to: "/painel/impressao", rotulo: "Fila de impressão", icone: "impressora", perfis: OPS },
  { to: "/painel/cadastro-mesas", rotulo: "Cadastro de mesas", icone: "mesas", perfis: GESTAO },
  { to: "/painel/relatorios", rotulo: "Relatórios", icone: "relatorio", perfis: GESTAO },
  { to: "/painel/auditoria", rotulo: "Auditoria", icone: "auditoria", perfis: GESTAO },
  { to: "/painel/usuarios", rotulo: "Usuários", icone: "usuarios", perfis: GESTAO },
  { to: "/painel/conectar", rotulo: "Conectar celulares", icone: "qr", perfis: GESTAO },
  { to: "/painel/configuracoes", rotulo: "Configurações", icone: "config", perfis: CFG },
  { to: "/painel/aparelho", rotulo: "Este aparelho", icone: "aparelho", perfis: [...OPS, "COZINHEIRO", "ENTREGADOR"] },
];

export function itensDoPerfil(tipo: string | undefined, m: Modulos, podeCaixa = false): ItemNav[] {
  return ITENS_NAV.filter((i) => i.perfis.includes(tipo ?? "") && (!i.modulo || i.modulo(m)) && (!i.caixa || podeCaixa));
}

/** Celular: 4 botões fixos + "Mais" (o resto vai numa folha). */
export function barraInferior(itens: ItemNav[]): { fixos: ItemNav[]; mais: ItemNav[] } {
  const prefer = ["/painel", "/painel/comandas", "/painel/mesas", "/painel/venda", "/painel/balcao", "/painel/delivery", "/painel/pedidos"];
  const fixos = prefer.map((p) => itens.find((i) => i.to === p)).filter((i): i is ItemNav => !!i).slice(0, 4);
  return { fixos, mais: itens.filter((i) => !fixos.includes(i)) };
}

/** Título e caminho do topo de cada tela. */
export function tituloDaRota(pathname: string): { titulo: string; caminho?: string } {
  const exato: Record<string, { titulo: string; caminho?: string }> = {
    "/painel/cadastro-mesas": { titulo: "Cadastro de mesas" },
    "/painel/impressao": { titulo: "Fila de impressão" },
    "/painel": { titulo: "Início", caminho: "Resumo de hoje" },
    "/painel/venda": { titulo: "Venda rápida", caminho: "Escolhe, cobra e pronto · digite o nome ou o número do atalho" },
    "/painel/balcao": { titulo: "Balcão", caminho: "Pedido para levar · vai para a cozinha · paga agora ou na retirada" },
    "/painel/mesas": { titulo: "Mesas", caminho: "Toque numa mesa livre para abrir, ou numa ocupada para ver a conta" },
    "/painel/delivery": { titulo: "Delivery", caminho: "Pedidos de entrega de hoje" },
    "/painel/delivery/novo": { titulo: "Delivery › Novo pedido", caminho: "Comece pelo telefone do cliente" },
    "/painel/comandas": { titulo: "Pedidos", caminho: "Panorama de mesa, balcão e delivery · buscar e filtrar" },
    "/painel/clientes": { titulo: "Clientes", caminho: "Busque por nome ou telefone" },
    "/painel/caixa": { titulo: "Caixa", caminho: "Abrir, sangria, suprimento e fechar" },
    "/painel/pedidos": { titulo: "Cozinha e bar", caminho: "Pedidos para preparar, por estação" },
    "/painel/cardapio": { titulo: "Cardápio", caminho: "Produtos, preços e adicionais" },
    "/painel/usuarios": { titulo: "Usuários", caminho: "Equipe, perfis e PIN" },
    "/painel/configuracoes": { titulo: "Configurações" },
    "/painel/configuracoes/entrega": { titulo: "Configurações › Entrega", caminho: "Origem, raio, faixas por km e bairros" },
    "/painel/conectar": { titulo: "Conectar celulares", caminho: "QR para o navegador e para o app Android" },
    "/painel/aparelho": { titulo: "Este aparelho", caminho: "Nome usado na auditoria" },
    "/painel/promocoes": { titulo: "Promoções" },
    "/painel/estoque": { titulo: "Estoque" },
    "/painel/relatorios": { titulo: "Relatórios" },
    "/painel/auditoria": { titulo: "Auditoria" },
  };
  if (exato[pathname]) return exato[pathname];
  if (pathname.startsWith("/painel/clientes/")) return { titulo: "Clientes › Ficha" };
  if (pathname.startsWith("/painel/conta/")) return { titulo: "Mesas › Conta", caminho: "Receber, desconto e fechar" };
  if (pathname.startsWith("/painel/pdv/")) return { titulo: "Lançar itens", caminho: "Monte o pedido e envie para a cozinha" };
  if (pathname.startsWith("/painel/delivery/")) return { titulo: "Delivery › Pedido" };
  return { titulo: "OS Restaurante" };
}
