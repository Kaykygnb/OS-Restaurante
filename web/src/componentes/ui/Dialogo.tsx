import { useEffect, useId, useRef, type ReactNode } from "react";
import Icone from "./Icone";

type Props = {
  titulo: string;
  sub?: ReactNode;
  children?: ReactNode;
  pe?: ReactNode;
  largo?: boolean;
  onFechar: () => void;
  /** Esc fecha (padrão). Desligue durante um envio. */
  fecharComEsc?: boolean;
};

/** Diálogo do redesenho: no PC é centralizado, no celular vira folha que sobe do rodapé. Esc e "X" fecham. */
export default function Dialogo({ titulo, sub, children, pe, largo, onFechar, fecharComEsc = true }: Props) {
  const id = useId();
  const caixa = useRef<HTMLDivElement>(null);
  const fechar = useRef(onFechar);
  useEffect(() => {
    fechar.current = onFechar;
  });

  useEffect(() => {
    const antes = document.activeElement as HTMLElement | null;
    const alvo = caixa.current?.querySelector<HTMLElement>("[data-foco], input, select, textarea, button:not(.dlg-x)");
    alvo?.focus();
    return () => antes?.focus?.();
  }, []);

  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (caixa.current?.closest(".dlg-fundo") !== Array.from(document.querySelectorAll(".dlg-fundo")).at(-1)) return;
      if (e.key === "Escape" && fecharComEsc) {
        e.stopPropagation();
        fechar.current();
      }
    }
    window.addEventListener("keydown", tecla, true);
    return () => window.removeEventListener("keydown", tecla, true);
  }, [fecharComEsc]);

  useEffect(() => {
    function teclado(e: KeyboardEvent) {
      if (document.querySelectorAll(".dlg-fundo").length && caixa.current?.closest(".dlg-fundo") !== Array.from(document.querySelectorAll(".dlg-fundo")).at(-1)) return;
      if (e.key === "Tab") {
        const focaveis = Array.from(caixa.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]') ?? []).filter(el => el.getClientRects().length);
        const primeiro = focaveis[0]; const ultimo = focaveis.at(-1);
        if (e.shiftKey && (document.activeElement === primeiro || !caixa.current?.contains(document.activeElement))) { e.preventDefault(); ultimo?.focus(); }
        else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro?.focus(); }
      }
    }
    document.addEventListener("keydown", teclado); return () => document.removeEventListener("keydown", teclado);
  }, []);

  return (
    <div className="dlg-fundo" onMouseDown={(e) => e.target === e.currentTarget && fecharComEsc && onFechar()}>
      <div ref={caixa} className={`dlg${largo ? " dlg-largo" : ""}`} role="dialog" aria-modal="true" aria-labelledby={id}>
        <div className="dlg-topo">
          <div>
            <h2 id={id}>{titulo}</h2>
            {sub ? <p>{sub}</p> : null}
          </div>
          <button type="button" className="btn btn-ic dlg-x" aria-label="Fechar" disabled={!fecharComEsc} onClick={onFechar}>
            <Icone nome="x" />
          </button>
        </div>
        <div className="dlg-corpo">{children}</div>
        {pe ? <div className="dlg-pe">{pe}</div> : null}
      </div>
    </div>
  );
}
