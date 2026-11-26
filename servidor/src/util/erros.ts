export class ErroRegra extends Error {
  status: number;
  codigo: string;
  extras?: Record<string, unknown>;

  constructor(status: number, codigo: string, erro: string, extras?: Record<string, unknown>) {
    super(erro);
    this.name = "ErroRegra";
    this.status = status;
    this.codigo = codigo;
    if (extras) this.extras = extras;
  }

  corpo() {
    return { erro: this.message, codigo: this.codigo, ...(this.extras ?? {}) };
  }
}

export function corpoErro(err: unknown, fallback = "Não foi possível concluir") {
  if (err instanceof ErroRegra) return { status: err.status, corpo: err.corpo() };
  const status = (err as { status?: number })?.status;
  const msg = err instanceof Error ? err.message : fallback;
  return {
    status: typeof status === "number" ? status : 400,
    corpo: { erro: msg, codigo: "regra" },
  };
}
