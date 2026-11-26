import { api } from "../../servicos/api";

export const IMAGEM_PADRAO_CARDAPIO = "/imagem-produto-padrao.svg";

export function origemImagemCardapio(caminho?: string | null) {
  if (!caminho) return IMAGEM_PADRAO_CARDAPIO;
  if (caminho.startsWith("/uploads/")) return `/api${caminho}`;
  return caminho;
}

export async function enviarImagemCardapio(arquivo: File): Promise<string> {
  if (!arquivo.type.startsWith("image/")) throw new Error("Escolha um arquivo de imagem");
  if (arquivo.size > 10 * 1024 * 1024) throw new Error("A imagem original deve ter até 10 MB");

  const bitmap = await createImageBitmap(arquivo);
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 640;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível preparar a imagem neste navegador");
  const escala = Math.max(640 / bitmap.width, 640 / bitmap.height);
  const largura = bitmap.width * escala;
  const altura = bitmap.height * escala;
  ctx.drawImage(bitmap, (640 - largura) / 2, (640 - altura) / 2, largura, altura);
  bitmap.close();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((imagem) => imagem ? resolve(imagem) : reject(new Error("Falha ao preparar a imagem")), "image/webp", 0.82);
  });
  if (blob.size > 500_000) throw new Error("Não foi possível comprimir a imagem para até 500 KB");
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result));
    leitor.onerror = () => reject(new Error("Falha ao ler a imagem"));
    leitor.readAsDataURL(blob);
  });
  const resposta = await api("/uploads", { method: "POST", body: JSON.stringify({ imagem: dataUrl }) }) as { caminho_imagem: string };
  return resposta.caminho_imagem;
}
