// Hierarquia: ROOT > ADMIN > GERENTE > (ATENDENTE | COZINHEIRO | ENTREGADOR)
// ROOT só nasce no seed — a API não cria outro ROOT.

export type TipoUsuario =
  | "ROOT"
  | "ADMIN"
  | "GERENTE"
  | "ATENDENTE"
  | "COZINHEIRO"
  | "ENTREGADOR";

const CRIADOS_POR: Record<TipoUsuario, TipoUsuario[]> = {
  ROOT: ["ADMIN", "GERENTE", "ATENDENTE", "COZINHEIRO", "ENTREGADOR"],
  ADMIN: ["GERENTE", "ATENDENTE", "COZINHEIRO", "ENTREGADOR"],
  GERENTE: ["ATENDENTE", "COZINHEIRO", "ENTREGADOR"],
  ATENDENTE: [],
  COZINHEIRO: [],
  ENTREGADOR: [],
};

export function podeCriarTipo(quem: TipoUsuario, alvo: TipoUsuario): boolean {
  return CRIADOS_POR[quem]?.includes(alvo) ?? false;
}

/** Tipos que o usuário logado pode criar / editar / desativar / resetar senha. */
export function tiposCriaveis(quem: TipoUsuario): TipoUsuario[] {
  return [...(CRIADOS_POR[quem] ?? [])];
}

export function ehTipoUsuario(v: unknown): v is TipoUsuario {
  return (
    v === "ROOT" ||
    v === "ADMIN" ||
    v === "GERENTE" ||
    v === "ATENDENTE" ||
    v === "COZINHEIRO" ||
    v === "ENTREGADOR"
  );
}

export function padraoPodeOperarCaixa(tipo: TipoUsuario) {
  return tipo === "ROOT" || tipo === "ADMIN" || tipo === "GERENTE";
}

export function ehGestor(tipo: string | undefined) {
  return tipo === "ROOT" || tipo === "ADMIN" || tipo === "GERENTE";
}

/** Quem não tem a chave não recebe, não fecha conta, não faz venda rápida e não opera o caixa. */
export function exigirCaixa() {
  return async (req: any, reply: any) => {
    if (!req.user?.pode_operar_caixa) {
      return reply.code(403).send({
        erro: "Sem permissão para operar o caixa.",
        codigo: "sem_permissao_caixa",
      });
    }
  };
}

/** Handler Fastify: exige que o JWT tenha um dos tipos informados. Usar depois de autenticar. */
export function soTipos(...tipos: TipoUsuario[]) {
  return async (req: any, reply: any) => {
    const tipo = req.user?.tipo as TipoUsuario | undefined;
    if (!tipo || !tipos.includes(tipo)) {
      return reply.code(403).send({ erro: "Sem permissão" });
    }
  };
}
