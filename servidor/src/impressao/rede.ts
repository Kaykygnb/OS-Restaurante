import net from "node:net";

/** Envia bytes RAW via TCP (porta padrão ESC/POS 9100). */
export function imprimirRede(
  ip: string,
  porta: number,
  dados: Buffer,
  timeoutMs = 8000
): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let finalizado = false;

    const falhar = (erro: Error) => {
      if (finalizado) return;
      finalizado = true;
      socket.destroy();
      reject(erro);
    };

    const ok = () => {
      if (finalizado) return;
      finalizado = true;
      socket.end();
      resolve();
    };

    socket.setTimeout(timeoutMs);
    socket.once("timeout", () => falhar(new Error("Timeout ao conectar/imprimir na impressora")));
    socket.once("error", (err) => falhar(err));

    socket.connect(porta, ip, () => {
      socket.write(dados, (err) => {
        if (err) return falhar(err);
        // dá um tempo curto pra impressora engolir o buffer
        setTimeout(ok, 120);
      });
    });
  });
}
