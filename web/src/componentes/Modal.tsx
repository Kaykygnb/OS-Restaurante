import { useEffect, useId, useRef, type ReactNode } from "react";

type Props = {
  titulo: string;
  children?: ReactNode;
  /** Texto do botão principal. */
  confirmar: string;
  /** Texto do botão de desistir. */
  desistir?: string;
  perigo?: boolean;
  ocupado?: boolean;
  /** Erro mostrado DENTRO do modal (o fundo fica escondido atrás dele). */
  erro?: string;
  desabilitarConfirmar?: boolean;
  onConfirmar: () => void;
  onFechar: () => void;
};

/**
 * Confirmação acessível. Esc, toque fora e "Desistir" fecham sem fazer nada.
 * No celular vira uma folha que sobe do rodapé.
 */
export default function Modal({
  titulo,
  children,
  confirmar,
  desistir = "Desistir",
  perigo,
  ocupado,
  erro,
  desabilitarConfirmar,
  onConfirmar,
  onFechar,
}: Props) {
  const idTitulo = useId();
  const caixa = useRef<HTMLDivElement>(null);
  const anterior = useRef<Element | null>(null);

  useEffect(() => {
    anterior.current = document.activeElement;
    const alvo =
      caixa.current?.querySelector<HTMLElement>("[data-autofoco]") ??
      caixa.current?.querySelector<HTMLElement>("input, select, textarea, button");
    alvo?.focus();
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape" && !ocupado) onFechar();
    }
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("keydown", tecla);
      (anterior.current as HTMLElement | null)?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="modal-fundo"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !ocupado) onFechar();
      }}
    >
      <div className="modal-caixa" role="dialog" aria-modal="true" aria-labelledby={idTitulo} ref={caixa}>
        <h3 id={idTitulo}>{titulo}</h3>
        <form
          className="modal-corpo"
          onSubmit={(e) => {
            e.preventDefault();
            if (!ocupado && !desabilitarConfirmar) onConfirmar();
          }}
        >
          {children}
          {erro ? (
            <p className="feedback-card feedback-erro" role="alert">
              {erro}
            </p>
          ) : null}
          <div className="modal-acoes">
            <button type="button" className="btn-sec" disabled={ocupado} onClick={onFechar}>
              {desistir}
            </button>
            <button
              type="submit"
              className={perigo ? "btn-perigo" : "btn-prim"}
              disabled={ocupado || desabilitarConfirmar}
            >
              {ocupado ? "Aguarde…" : confirmar}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
