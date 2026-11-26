type Props = {
  texto: string;
  /** Alinha o balão à esquerda do ícone (útil perto da borda direita). */
  alinhar?: "esquerda" | "direita";
};

/** Ícone “i” com dica ao passar o mouse / focar — ajuda sem poluir a tela. */
export default function Ajuda({ texto, alinhar = "esquerda" }: Props) {
  return (
    <span className={`ajuda-tip ajuda-tip-${alinhar}`}>
      <button
        type="button"
        className="ajuda-tip-btn"
        aria-label={`Ajuda: ${texto}`}
        onClick={(e) => e.stopPropagation()}
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
