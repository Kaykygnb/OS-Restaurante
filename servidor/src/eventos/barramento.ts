import type { TipoUsuario } from "../permissoes.js";

export type EventoSse = {
  tipo: string;
  id: number;
  versao: number;
  server_time: string;
};

type Ouvinte = {
  perfis: TipoUsuario[] | null;
  enviar: (evento: EventoSse) => void;
};

const ouvintes = new Set<Ouvinte>();
let versao = 0;

export function publicar(tipo: string, id: number, perfis?: TipoUsuario[]) {
  versao += 1;
  const evento: EventoSse = {
    tipo,
    id,
    versao,
    server_time: new Date().toISOString(),
  };
  for (const ouvinte of ouvintes) {
    if (perfis && ouvinte.perfis && !ouvinte.perfis.some((p) => perfis.includes(p))) continue;
    try {
      ouvinte.enviar(evento);
    } catch {
      ouvintes.delete(ouvinte);
    }
  }
  return evento;
}

export function assinar(enviar: (evento: EventoSse) => void, perfis: TipoUsuario[] | null) {
  const ouvinte: Ouvinte = { enviar, perfis };
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

export function versaoAtual() {
  return versao;
}
