import net from "node:net";

/** Envia bytes RAW via TCP. Sucesso só depois do flush; impressora que não lê estoura o tempo. */
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
    socket.once("timeout", () => falhar(new Error("Tempo esgotado ao escrever na impressora")));
    socket.once("error", (err) => falhar(err));

    socket.connect(porta, ip, () => {
      const coube = socket.write(dados, (err) => {
        if (err) return falhar(err);
        if (socket.writableLength === 0) ok();
      });
      if (!coube) {
        socket.once("drain", () => {
          if (socket.writableLength === 0) ok();
        });
      }
    });
  });
}
