import { useEffect, useRef } from "react";
import { Outlet, useBlocker } from "react-router-dom";
import { podeTrocarEdicao, temEdicaoPendente } from "../hooks/useRascunho";
export default function GuardiaoEdicao() {
  const bloqueio = useBlocker(() => temEdicaoPendente());
  const perguntando = useRef(false);
  useEffect(() => {
    if (bloqueio.state !== "blocked" || perguntando.current) return;
    perguntando.current = true;
    void podeTrocarEdicao().then(sair => { if (sair) bloqueio.proceed?.(); else bloqueio.reset?.(); }).finally(() => { perguntando.current = false; });
  }, [bloqueio]);
  return <Outlet />;
}
