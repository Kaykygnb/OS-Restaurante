import { expect, test } from "@playwright/test";
import { dados, entrarComo, semRolagemLateral, simularApi } from "./apoio.ts";

const tile = (n: number) => `.mesa-tile:has(.mesa-num:text-is("${n}"))`;

test.describe("Login", () => {
  test("garçom cai nas Mesas e cozinheiro na fila da cozinha", async ({ page }) => {
    await simularApi(page, (_r, url) =>
      url.pathname === "/api/login"
        ? { corpo: { token: "t", usuario: { id: 4, nome: "Zé", tipo: "COZINHEIRO" } } }
        : undefined,
    );
    await page.goto("/login");
    await page.getByLabel("Login", { exact: true }).fill("ze");
    await page.getByLabel("Senha", { exact: true }).fill("qualquer-coisa");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/painel\/pedidos\?aba=cozinha/);
    await expect(page.getByRole("tab", { name: "Lançar" })).toHaveCount(0);
  });

  test("sem servidor mostra mensagem em português", async ({ page }) => {
    await page.route("**/api/**", (r) => r.abort("connectionrefused"));
    await page.goto("/login");
    await page.getByLabel("Login", { exact: true }).fill("marta");
    await page.getByLabel("Senha", { exact: true }).fill("x");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByRole("alert")).toContainText("Sem conexão com o servidor");
  });
});

test.describe("Mesas", () => {
  test("toque rápido em duas mesas mostra a última (sem conta trocada)", async ({ page }, info) => {
    test.skip(info.project.name === "celular", "no celular a folha cobre o mapa: não dá para tocar outra mesa");
    await entrarComo(page);
    // A mesa 3 responde devagar; a 10 responde rápido. O painel tem que ficar na 10.
    await simularApi(page, (_r, url) => (url.pathname === "/api/atendimentos/5" ? { atraso: 1200, corpo: dados.contaMesa3 } : undefined));
    await page.goto("/painel/mesas");
    await page.locator(tile(3)).click();
    await page.locator(tile(10)).click();
    await page.waitForTimeout(1600);
    const painel = page.getByRole("complementary", { name: "Conta da mesa" });
    await expect(painel).toContainText(/^\s*Mesa 10\s*AT0003/);
    await expect(page.locator(tile(10))).toHaveAttribute("aria-pressed", "true");
  });

  test("cancelar conta: Voltar e Esc não cancelam nada", async ({ page }) => {
    await entrarComo(page);
    const chamadas = await simularApi(page);
    await page.goto("/painel/mesas");
    await page.locator(tile(10)).click();
    await page.getByRole("button", { name: "Cancelar conta" }).click();
    const dialogo = page.getByRole("dialog");
    await expect(dialogo).toBeVisible();
    await expect(dialogo.getByRole("button", { name: "Cancelar conta" })).toBeDisabled(); // sem motivo
    await dialogo.getByRole("button", { name: "Voltar" }).click();
    await expect(dialogo).toHaveCount(0);
    await page.getByRole("button", { name: "Cancelar conta" }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(chamadas.filter((c) => c.metodo === "POST")).toHaveLength(0);
  });

  test("celular: sem rolagem lateral e conta abre como folha", async ({ page }, info) => {
    test.skip(info.project.name !== "celular", "só no celular");
    await entrarComo(page, "ATENDENTE");
    await simularApi(page);
    await page.goto("/painel/mesas");
    await page.locator(tile(3)).click();
    const folha = page.getByRole("complementary", { name: "Conta da mesa" });
    await expect(folha).toBeInViewport();
    expect(await semRolagemLateral(page)).toBe(true);
  });
});

test.describe("PDV", () => {
  test("busca procura em todo o cardápio e aviso ao sair com itens", async ({ page }) => {
    await entrarComo(page);
    await simularApi(page);
    await page.goto("/painel/pdv/5");
    await page.getByLabel("Buscar produto em todo o cardápio").fill("coca");
    await page.locator(".pdv-prod", { hasText: "Coca" }).first().click();
    await page.getByRole("button", { name: "Adicionar", exact: true }).click();
    await page.getByRole("button", { name: "Mesas", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText("Sair sem enviar?");
  });

  test("celular: barra fixa do carrinho abre o pedido", async ({ page }, info) => {
    test.skip(info.project.name !== "celular", "só no celular");
    await entrarComo(page, "ATENDENTE");
    await simularApi(page);
    await page.goto("/painel/pdv/5");
    await page.getByLabel("Buscar produto em todo o cardápio").fill("coca");
    await page.locator(".pdv-prod", { hasText: "Coca" }).first().click();
    await page.getByRole("button", { name: "Adicionar", exact: true }).click();
    const barra = page.locator(".pdv-barra-carrinho");
    await expect(barra).toBeInViewport();
    await expect(barra).toContainText("1 item(ns)");
    await barra.click();
    await expect(page.getByRole("button", { name: /Enviar pedido/ })).toBeInViewport();
    expect(await semRolagemLateral(page)).toBe(true);
  });
});

test.describe("Conta", () => {
  test("receber pede confirmação; Voltar não registra pagamento", async ({ page }) => {
    await entrarComo(page);
    const chamadas = await simularApi(page);
    await page.goto("/painel/conta/5");
    await page.getByRole("radio", { name: "Pix" }).click();
    await page.getByRole("button", { name: "Pagar restante" }).click();
    const dialogo = page.getByRole("dialog");
    await expect(dialogo).toContainText("Receber R$ 52,00 em Pix?");
    await dialogo.getByRole("button", { name: "Voltar" }).click();
    expect(chamadas.filter((c) => c.metodo === "POST")).toHaveLength(0);
    await page.getByRole("button", { name: "Pagar restante" }).click();
    await page.getByRole("button", { name: "Confirmar recebimento" }).click();
    await expect.poll(() => chamadas.filter((c) => c.metodo === "POST" && c.caminho.includes("pagamentos")).length).toBe(1);
  });

  test("valor maior que o restante é bloqueado", async ({ page }) => {
    await entrarComo(page);
    await simularApi(page);
    await page.goto("/painel/conta/5");
    await page.getByRole("radio", { name: "Pix" }).click();
    await page.getByLabel("Valor", { exact: true }).fill("999,00");
    await page.getByRole("button", { name: "Receber", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("alert")).toBeVisible();
  });
});

test.describe("Caixa", () => {
  test("fechar caixa exige o valor contado e confirmação", async ({ page }) => {
    await entrarComo(page);
    const chamadas = await simularApi(page);
    await page.goto("/painel/caixa");
    await page.getByRole("button", { name: "Fechar caixa…" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("alert")).toContainText("digite 0");
    await page.getByLabel("Dinheiro contado na gaveta (R$)").fill("150,00");
    await page.getByRole("button", { name: "Fechar caixa…" }).click();
    await expect(page.getByRole("dialog")).toContainText("Fechar o caixa?");
    await page.keyboard.press("Escape");
    expect(chamadas.filter((c) => c.metodo === "POST")).toHaveLength(0);
  });
});
