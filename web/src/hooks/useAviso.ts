import { useCallback, useEffect, useState } from "react";

/**
 * Mensagens de erro e sucesso da tela. Mostrar uma apaga a outra (nada de "erro + ok" juntos),
 * e o sucesso some sozinho depois de alguns segundos.
 */
export function useAviso(msSucesso = 5000) {
  const [erro, setErroBruto] = useState("");
  const [ok, setOkBruto] = useState("");

  const setErro = useCallback((m: string) => {
    setErroBruto(m);
    if (m) setOkBruto("");
  }, []);
  const setOk = useCallback((m: string) => {
    setOkBruto(m);
    if (m) setErroBruto("");
  }, []);
  const limpar = useCallback(() => {
    setErroBruto("");
    setOkBruto("");
  }, []);

  useEffect(() => {
    if (!ok) return;
    const t = setTimeout(() => setOkBruto(""), msSucesso);
    return () => clearTimeout(t);
  }, [ok, msSucesso]);

  return { erro, ok, setErro, setOk, limpar };
}
