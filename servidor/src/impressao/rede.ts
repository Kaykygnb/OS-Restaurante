import net from "node:net";

const ERRO_TEMPO = "Tempo esgotado ao escrever na impressora";

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
    const prazo = setTimeout(() => falhar(new Error(ERRO_TEMPO)), timeoutMs);

    const falhar = (erro: Error) => {
      if (finalizado) return;
      finalizado = true;
      clearTimeout(prazo);
      socket.destroy();
      reject(erro);
    };

    const ok = () => {
      if (finalizado) return;
      finalizado = true;
      clearTimeout(prazo);
      socket.end();
      socket.unref();
      resolve();
    };

    socket.setTimeout(timeoutMs);
    socket.once("timeout", () => falhar(new Error(ERRO_TEMPO)));
    socket.once("error", (err) => falhar(err));

    socket.connect(porta, ip, () => {
      socket.setNoDelay(true);
      const coube = socket.write(dados, (err) => {
        if (err) return falhar(err instanceof Error ? err : new Error(String(err)));
        if (!socket.writableNeedDrain && socket.writableLength === 0) ok();
      });
      if (!coube) {
        socket.once("drain", () => {
          if (socket.writableLength === 0) ok();
        });
      }
    });
  });
}
