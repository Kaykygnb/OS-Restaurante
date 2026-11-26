import { useEffect, useRef, useState } from "react";

type Props = {
  texto: string;
  /** Alinha o balão à esquerda do ícone (útil perto da borda direita). */
  alinhar?: "esquerda" | "direita";
};

/** Ícone “i” com dica. Abre ao tocar (iPhone não dá foco a botão no toque) e fecha ao tocar fora. */
export default function Ajuda({ texto, alinhar = "esquerda" }: Props) {
  const [aberta, setAberta] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!aberta) return;
    const fora = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberta(false);
    };
    document.addEventListener("pointerdown", fora);
    return () => document.removeEventListener("pointerdown", fora);
  }, [aberta]);
  return (
    <span ref={ref} className={`ajuda-tip ajuda-tip-${alinhar}${aberta ? " aberta" : ""}`}>
      <button
        type="button"
        className="ajuda-tip-btn"
        aria-label={`Ajuda: ${texto}`}
        aria-expanded={aberta}
        onClick={(e) => {
          e.stopPropagation();
          setAberta((v) => !v);
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        i
      </button>
      <span className="ajuda-tip-bubble" role="tooltip">
        {texto}
      </span>
    </span>
  );
}
