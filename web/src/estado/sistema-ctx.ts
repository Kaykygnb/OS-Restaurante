import { createContext, useContext } from "react";
import type { CaixaAtual, ImpressoraStatus, Modulos } from "../servicos/contratos";

export type Toast = { id: number; texto: string; tom: "ok" | "err" | "info" };

export type Sistema = {
  modulos: Modulos;
  /** null = ainda não sabe. */
  caixa: CaixaAtual | null;
  conectado: boolean;
  /** null = servidor sem GET /impressoras/status (o topo não mostra nada). */
  impressoras: ImpressoraStatus[] | null;
  recarregar: () => void;
  avisar: (texto: string, tom?: Toast["tom"]) => void;
};

export const MODULOS_PADRAO: Modulos = { estoque_nivel: 0, usa_gaveta: false, delivery: true, promocoes: true };

export const SistemaCtx = createContext<Sistema>({
  modulos: MODULOS_PADRAO,
  caixa: null,
  conectado: true,
  impressoras: null,
  recarregar: () => {},
  avisar: () => {},
});

export const useSistema = () => useContext(SistemaCtx);
