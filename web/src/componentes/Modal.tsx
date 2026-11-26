import type { ReactNode } from "react";
import Dialogo from "./ui/Dialogo";
type Props = { titulo: string; children?: ReactNode; confirmar: string; desistir?: string; perigo?: boolean; ocupado?: boolean; erro?: string; desabilitarConfirmar?: boolean; onConfirmar: () => void; onFechar: () => void };
export default function Modal({ titulo, children, confirmar, desistir = "Voltar", perigo, ocupado, erro, desabilitarConfirmar, onConfirmar, onFechar }: Props) {
  return <Dialogo titulo={titulo} onFechar={() => { if (!ocupado) onFechar(); }} fecharComEsc={!ocupado} pe={<><button type="button" className="btn" disabled={ocupado} onClick={onFechar}>{desistir}</button><button type="button" className={`btn ${perigo ? "btn-perigo" : "btn-pri"}`} disabled={ocupado || desabilitarConfirmar} onClick={onConfirmar}>{ocupado ? "Aguarde…" : confirmar}</button></>}>
    {erro ? <p role="alert" className="feedback-card feedback-erro">{erro}</p> : null}{children}
  </Dialogo>;
}
