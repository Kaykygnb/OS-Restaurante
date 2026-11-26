import { useEffect, useState, useMemo } from "react";
import { IMAGEM_PADRAO_CARDAPIO, origemImagemCardapio } from "./imagem";

type Props = {
  caminho?: string | null;
  titulo?: string;
  vazio?: string;
  onArquivo: (arquivo: File | null) => void;
  onRemover: () => void;
};

export default function CampoImagem({ caminho, onArquivo, onRemover, titulo = "Imagem do item", vazio = "Sem foto: será usada a imagem padrão do cardápio." }: Props) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  // Prévia derivada do arquivo (sem setState em efeito); o efeito só libera a URL antiga.
  const preview = useMemo(() => (arquivo ? URL.createObjectURL(arquivo) : ""), [arquivo]);
  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  return (
    <div className="campo-imagem">
      <img
        src={preview || origemImagemCardapio(caminho)}
        alt={`Prévia: ${titulo}`}
        onError={(e) => { e.currentTarget.src = IMAGEM_PADRAO_CARDAPIO; }}
      />
      <div>
        <strong>{titulo}</strong>
        <span>Quadrada, 640 × 640 px. JPG, PNG ou WebP; até 10 MB.</span>
        <label className="btn-sec campo-imagem-escolher">
          Escolher imagem
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            onChange={(e) => {
              const selecionado = e.target.files?.[0] ?? null;
              setArquivo(selecionado);
              onArquivo(selecionado);
              e.currentTarget.value = "";
            }}
          />
        </label>
        {(caminho || arquivo) ? (
          <button type="button" className="btn-ghost" onClick={() => { setArquivo(null); onArquivo(null); onRemover(); }}>
            Remover imagem
          </button>
        ) : <span>{vazio}</span>}
      </div>
    </div>
  );
}
