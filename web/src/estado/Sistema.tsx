import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ApiErro } from "../servicos/api";
import { podeOperarCaixa } from "../auth/sessao";
import { MOCK_LIGADO } from "../servicos/api";
import type { CaixaAtual, ImpressoraStatus, Modulos } from "../servicos/contratos";
import { lerCaixaAtual, lerModulos, lerStatusImpressoras } from "../servicos/rotas";
import { MODULOS_PADRAO, SistemaCtx, type Toast } from "./sistema-ctx";

/**
 * Estado global da operação: módulos ligados (§8), caixa aberto/gaveta (§1) e conexão com o PC do caixa.
 * Atualiza a cada 20 s e quando a janela volta a ter foco.
 */
export default function SistemaProvider({ children }: { children: ReactNode }) {
  const [modulos, setModulos] = useState<Modulos>(MODULOS_PADRAO);
  const [caixa, setCaixa] = useState<CaixaAtual | null>(null);
  const [conectado, setConectado] = useState(true);
  const [impressoras, setImpressoras] = useState<ImpressoraStatus[] | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const recarregar = useCallback(() => {
    lerModulos()
      .then((m) => {
        setModulos({ ...MODULOS_PADRAO, ...m });
        setConectado(true);
      })
      .catch((e: ApiErro) => {
        if (e.semConexao) setConectado(false);
        // 404: servidor ainda sem §8 → segue com o padrão (anotado em PENDENCIAS-CONTRATO.md).
      });
    // Sem "Pode operar caixa" o servidor responde 403 em /caixa/*: nem pergunta.
    if (!podeOperarCaixa()) return;
    lerCaixaAtual()
      .then((c) => {
        // Servidor antigo não manda `gaveta`: traduz o `tem_gaveta_disponivel`.
        const antigo = c as CaixaAtual & { tem_gaveta_disponivel?: boolean };
        setCaixa({ ...c, gaveta: c.gaveta ?? { disponivel: !!antigo.tem_gaveta_disponivel, motivo: antigo.tem_gaveta_disponivel ? undefined : "desligada" } });
        setConectado(true);
      })
      .catch((e: ApiErro) => {
        if (e.semConexao) setConectado(false);
      });
  }, []);

  const lerImpressoras = useCallback(() => {
    lerStatusImpressoras()
      .then((l) => setImpressoras(Array.isArray(l) ? l : null))
      .catch((e: ApiErro) => {
        if (e.status === 404 || e.status === 403) setImpressoras(null);
      });
  }, []);

  useEffect(() => {
    lerImpressoras();
    const t = setInterval(lerImpressoras, 30000);
    // SSE: o servidor avisa `impressora.status` e o topo relê na hora. Sem SSE (mock), fica só o intervalo.
    let es: EventSource | null = null;
    const token = localStorage.getItem("token");
    if (!MOCK_LIGADO && token && typeof EventSource !== "undefined") {
      es = new EventSource(`/api/eventos?token=${encodeURIComponent(token)}`);
      es.onmessage = (ev) => {
        try {
          const d = JSON.parse(ev.data) as { tipo?: string };
          if (d.tipo === "impressora.status") lerImpressoras();
          if (d.tipo?.startsWith("caixa.")) recarregar();
          // Telas (KDS, delivery) escutam "osr:evento" para reler na hora.
          window.dispatchEvent(new CustomEvent("osr:evento", { detail: d }));
        } catch {
          /* ping ou texto: ignora */
        }
      };
    }
    return () => {
      clearInterval(t);
      es?.close();
    };
  }, [lerImpressoras, recarregar]);

  useEffect(() => {
    recarregar();
    const t = setInterval(recarregar, 20000);
    window.addEventListener("focus", recarregar);
    window.addEventListener("osr:caixa-mudou", recarregar);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", recarregar);
      window.removeEventListener("osr:caixa-mudou", recarregar);
    };
  }, [recarregar]);

  const avisar = useCallback((texto: string, tom: Toast["tom"] = "info") => {
    const id = ++seq.current;
    setToasts((t) => [...t.slice(-2), { id, texto, tom }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tom === "err" ? 7000 : 4000);
  }, []);

  const valor = useMemo(() => ({ modulos, caixa, conectado, impressoras, recarregar, avisar }), [modulos, caixa, conectado, impressoras, recarregar, avisar]);

  return (
    <SistemaCtx.Provider value={valor}>
      {children}
      <div className="toast-pilha" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tom}`} role={t.tom === "err" ? "alert" : "status"}>
            {t.texto}
          </div>
        ))}
      </div>
    </SistemaCtx.Provider>
  );
}
