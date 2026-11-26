import { describe, expect, it } from "vitest";
import { temUrls, urlApp, urlWeb } from "./conexao";

const c = {
  porta: 3333,
  enderecos: [
    { ip: "192.168.0.10", interface: "Wi-Fi" },
    { ip: "10.0.0.5", interface: "Ethernet" },
  ],
  url_web: "http://192.168.0.10:3333/",
  url_app: "osrestaurante://conectar?host=192.168.0.10&porta=3333&nome=Pastelaria%20do%20Z%C3%A9",
};

describe("conexao", () => {
  it("monta a url web com o IP escolhido", () => {
    expect(urlWeb(c, "10.0.0.5")).toBe("http://10.0.0.5:3333");
  });
  it("troca só o host no link do app e mantém o nome", () => {
    const u = urlApp(c, "10.0.0.5");
    expect(u.startsWith("osrestaurante://conectar?")).toBe(true);
    const p = new URLSearchParams(u.split("?")[1]);
    expect(p.get("host")).toBe("10.0.0.5");
    expect(p.get("porta")).toBe("3333");
    expect(p.get("nome")).toBe("Pastelaria do Zé");
  });
  it("sem IPv4 local (urls null) não há QR", () => {
    expect(temUrls(c)).toBe(true);
    expect(temUrls({ porta: 3333, enderecos: [], url_web: null, url_app: null })).toBe(false);
  });
});
