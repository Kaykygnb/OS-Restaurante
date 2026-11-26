import type { ReactNode } from "react";
import Icone, { type NomeIcone } from "./Icone";

/** Prancha 17: carregando, vazio e erro com "Tentar de novo". */
export function Carregando({ linhas = 4, rotulo = "Carregando…" }: { linhas?: number; rotulo?: string }) {
  return (
    <div className="pilha" role="status" aria-label={rotulo}>
      {Array.from({ length: linhas }, (_, i) => (
        <div key={i} className="esqueleto" style={{ height: 56 }} />
      ))}
    </div>
  );
}

export function Vazio({ icone = "info", titulo, children, acao }: { icone?: NomeIcone; titulo: string; children?: ReactNode; acao?: ReactNode }) {
  return (
    <div className="est">
      <Icone nome={icone} tam={36} cor="var(--ink3)" />
      <strong>{titulo}</strong>
      {children ? <div>{children}</div> : null}
      {acao}
    </div>
  );
}

export function ErroCarga({ mensagem, onTentar }: { mensagem: string; onTentar: () => void }) {
  return (
    <div className="est" role="alert">
      <Icone nome="semwifi" tam={36} cor="var(--err)" />
      <strong>Não deu para carregar</strong>
      <div>{mensagem}</div>
      <button type="button" className="btn btn-pri" onClick={onTentar}>
        Tentar de novo
      </button>
    </div>
  );
}

export function Faixa({ tom, titulo, children, acao }: { tom: "ok" | "warn" | "err" | "info"; titulo?: ReactNode; children?: ReactNode; acao?: ReactNode }) {
  const ic: NomeIcone = tom === "ok" ? "check" : tom === "info" ? "info" : "alerta";
  return (
    <div className={`faixa faixa-${tom}`} role={tom === "err" ? "alert" : "status"}>
      <Icone nome={ic} />
      <div>
        {titulo ? <strong>{titulo}</strong> : null}
        {children}
      </div>
      {acao ? <div className="faixa-acao">{acao}</div> : null}
    </div>
  );
}
