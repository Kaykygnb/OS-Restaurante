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
      if (e.key === "Escape" && fecharComEsc) {
        e.stopPropagation();
        fechar.current();
      }
    }
    window.addEventListener("keydown", tecla, true);
    return () => window.removeEventListener("keydown", tecla, true);
  }, [fecharComEsc]);

  return (
    <div className="dlg-fundo" onMouseDown={(e) => e.target === e.currentTarget && fecharComEsc && onFechar()}>
      <div ref={caixa} className={`dlg${largo ? " dlg-largo" : ""}`} role="dialog" aria-modal="true" aria-labelledby={id}>
        <div className="dlg-topo">
          <div>
            <h2 id={id}>{titulo}</h2>
            {sub ? <p>{sub}</p> : null}
          </div>
          <button type="button" className="btn btn-ic dlg-x" aria-label="Fechar" onClick={onFechar}>
            <Icone nome="x" />
          </button>
        </div>
        <div className="dlg-corpo">{children}</div>
        {pe ? <div className="dlg-pe">{pe}</div> : null}
      </div>
    </div>
  );
}
