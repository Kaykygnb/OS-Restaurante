/** Monta os endereços dos QRs com o IP escolhido. */
import type { ConexaoRede } from "../servicos/contratos";

/** Sem IPv4 local o servidor manda url_web/url_app null; aí não há QR para mostrar. */
export function temUrls(c: ConexaoRede): boolean {
  return !!c.url_web && !!c.url_app && c.enderecos.length > 0;
}

export function urlWeb(c: ConexaoRede, ip: string): string {
  try {
    const u = new URL(c.url_web ?? `http://${ip}:${c.porta}/`);
    u.hostname = ip;
    u.port = String(c.porta);
    return u.toString().replace(/\/$/, "");
  } catch {
    return `http://${ip}:${c.porta}`;
  }
}

/** osrestaurante://conectar?host=…&porta=…&nome=… — troca só o host, mantém o resto que o servidor mandou. */
export function urlApp(c: ConexaoRede, ip: string): string {
  const [base, qs = ""] = (c.url_app ?? "osrestaurante://conectar").split("?");
  const p = new URLSearchParams(qs);
  p.set("host", ip);
  p.set("porta", String(c.porta));
  return `${base || "osrestaurante://conectar"}?${p.toString()}`;
}
