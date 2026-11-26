import { AsyncLocalStorage } from "node:async_hooks";

export type ContextoPedido = {
  terminal: string | null;
  ip: string | null;
  userAgent: string | null;
};

export const contextoPedido = new AsyncLocalStorage<ContextoPedido>();

export function contextoAtual(): ContextoPedido {
  return contextoPedido.getStore() ?? { terminal: null, ip: null, userAgent: null };
}
