import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./estilos/global.css";
// Redesenho: base neutra (fonte do sistema, 1 cor de ação). Vem depois para valer sobre o global.
import "./estilos/ui.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// PWA: o service worker só registra em contexto seguro (localhost ou HTTPS).
// Na rede local por http://IP o navegador não deixa; o "Adicionar à tela inicial" continua funcionando
// pelo manifest (Android) e pelo apple-touch-icon (iPhone), só sem a cópia para ficar sem rede.
if (import.meta.env.PROD && "serviceWorker" in navigator && window.isSecureContext) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}
