import type { Page, Route } from "@playwright/test";
import caixaAtual from "./dados/caixa-atual.json" with { type: "json" };
import cardapioPdv from "./dados/cardapio-pdv.json" with { type: "json" };
import contaMesa10 from "./dados/conta-mesa10.json" with { type: "json" };
import contaMesa3 from "./dados/conta-mesa3.json" with { type: "json" };
import contasAbertas from "./dados/contas-abertas.json" with { type: "json" };
import formas from "./dados/formas-pagamento.json" with { type: "json" };
import mesas from "./dados/mesas.json" with { type: "json" };

export const dados = { caixaAtual, cardapioPdv, contaMesa10, contaMesa3, contasAbertas, formas, mesas };

export type Perfil = "GERENTE" | "ATENDENTE" | "COZINHEIRO";

/** Entra direto com uma sessão falsa (sem tela de login). */
export async function entrarComo(page: Page, tipo: Perfil = "GERENTE") {
  const usuario = { id: tipo === "GERENTE" ? 2 : tipo === "ATENDENTE" ? 3 : 4, nome: `Teste ${tipo}`, tipo };
  await page.addInitScript((u) => {
    localStorage.setItem("token", "token-de-teste");
    localStorage.setItem("usuario", JSON.stringify(u));
  }, usuario);
}

type Resposta = { status?: number; corpo?: unknown; atraso?: number };
type Manipulador = (route: Route, url: URL) => Resposta | Promise<Resposta> | undefined;

/**
 * Simula a API. Rotas não previstas respondem [] (GET) ou {} (outros).
 * `extra` é consultado antes do padrão: devolva undefined para cair no padrão.
 */
export async function simularApi(page: Page, extra?: Manipulador) {
  const chamadas: { metodo: string; caminho: string; corpo: unknown }[] = [];
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const caminho = url.pathname.replace(/^\/api/, "");
    chamadas.push({ metodo: req.method(), caminho: caminho + url.search, corpo: req.postDataJSON?.() ?? null });
    let r = extra ? await extra(route, url) : undefined;
    if (!r) r = padrao(req.method(), caminho, url);
    if (r.atraso) await new Promise((ok) => setTimeout(ok, r!.atraso));
    await route.fulfill({
      status: r.status ?? 200,
      contentType: "application/json",
      body: JSON.stringify(r.corpo ?? {}),
    });
  });
  return chamadas;
}

function padrao(metodo: string, caminho: string, url: URL): Resposta {
  if (metodo !== "GET") return { corpo: {} };
  if (caminho === "/mesas") return { corpo: mesas };
  if (caminho === "/atendimentos/5") return { corpo: contaMesa3 };
  if (caminho === "/atendimentos/3") return { corpo: contaMesa10 };
  if (caminho === "/atendimentos" && url.searchParams.get("status") === "ABERTO") return { corpo: contasAbertas };
  if (caminho === "/cardapio/pdv") return { corpo: cardapioPdv };
  if (caminho === "/formas-pagamento") return { corpo: formas };
  if (caminho === "/caixa/atual") return { corpo: caixaAtual };
  if (caminho === "/aprovadores") return { corpo: [{ id: 2, nome: "Marta Gerente" }] };
  return { corpo: [] };
}

/** Largura do documento não pode passar da tela (senão o celular dá "zoom out"). */
export async function semRolagemLateral(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
}
