import { expect, test } from "@playwright/test";
import { ehCelular, entrar } from "./apoio.ts";

test("login: senha errada avisa sem dizer se o usuário existe", async ({ page }) => {
  await page.goto("/login?mock_reset=1");
  await page.fill("input[name=usuario]", "ze");
  await page.fill("input[name=senha]", "errada");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText(/Usuário ou senha inválidos/)).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("venda rápida: cobra em dinheiro e mostra o troco", async ({ page }) => {
  await entrar(page, "ze");
  await page.goto("/painel/venda");
  await page.getByText("Coca-Cola lata").first().click();
  if (ehCelular(page)) await page.getByRole("button", { name: "Ver e cobrar" }).click();
  await page.locator("[data-testid=cobrar]:visible").click();
  await page.getByRole("dialog").locator("input").first().fill("10");
  await page.getByTestId("confirmar-pagamento").click();
  await expect(page.getByText(/Venda #\d+ concluída/)).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("4,00");
});

test("mesa: abre uma mesa livre e envia o pedido", async ({ page }) => {
  await entrar(page, "joao");
  await page.goto("/painel/mesas");
  await page.getByText("Mesa 1", { exact: true }).click();
  await expect(page.getByText("Mesa 1 aberta. Lance os itens.")).toBeVisible();
  await page.getByRole("tab", { name: "Bebidas" }).click();
  await page.getByText("Coca-Cola lata").first().click();
  await page.getByRole("button", { name: "Adicionar", exact: true }).click();
  if (ehCelular(page)) await page.getByText("Ver pedido").click();
  await page.locator("button:visible", { hasText: "Enviar pedido" }).first().click();
  await expect(page.getByText(/enviado/i).first()).toBeVisible();
});

test("caixa: atendente fecha às cegas, gerente vê o esperado", async ({ browser }, info) => {
  const opcoes = { baseURL: info.project.use.baseURL, viewport: info.project.use.viewport, isMobile: info.project.use.isMobile, hasTouch: info.project.use.hasTouch };
  const ctxA = await browser.newContext(opcoes);
  const a = await ctxA.newPage();
  await entrar(a, "joao");
  await a.goto("/painel/caixa");
  await a.getByRole("button", { name: "Fechar o caixa" }).click();
  await expect(a.getByText(/Fechamento cego/)).toBeVisible();
  await expect(a.getByRole("dialog")).not.toContainText("Esperado");
  await ctxA.close();

  const ctxG = await browser.newContext(opcoes);
  const g = await ctxG.newPage();
  await entrar(g, "marta");
  await g.goto("/painel/caixa");
  await g.getByRole("button", { name: "Fechar o caixa" }).click();
  await expect(g.getByRole("dialog")).toContainText("Esperado");
  await ctxG.close();
});

test("sem permissão de caixa: Ana não vê Venda rápida nem Caixa", async ({ page }) => {
  await entrar(page, "ana");
  if (!ehCelular(page)) {
    const menu = page.locator("nav").first();
    await expect(menu).toContainText("Mesas");
    await expect(menu).not.toContainText("Venda rápida");
    await expect(menu).not.toContainText("Caixa");
  }
  await page.goto("/painel/caixa");
  await expect(page.getByText(/Só quem opera o caixa/)).toBeVisible();
});

test("cozinha: cozinheiro vê as colunas do KDS por estação", async ({ page }) => {
  await entrar(page, "beto");
  await expect(page).toHaveURL(/\/painel\/pedidos/);
  for (const c of ["Novos", "Em preparo", "Prontos"]) await expect(page.getByRole("region", { name: c })).toBeVisible();
  const novos = page.getByRole("region", { name: "Novos" });
  await expect(novos.getByRole("article")).toHaveCount(1);
  await novos.getByRole("button", { name: "Começar" }).click();
  await expect(page.getByRole("region", { name: "Em preparo" }).getByRole("article")).toHaveCount(1);
  await page.getByRole("button", { name: "Bar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Bar", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("relatórios: faturamento contra o anterior e cancelamentos por funcionário", async ({ page }) => {
  await entrar(page, "ze");
  await page.goto("/painel/relatorios");
  await expect(page.getByText("Vendido", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/vs anterior/).first()).toBeVisible();
  await expect(page.getByText("Cancelamentos e descontos por funcionário")).toBeVisible();
  await page.getByRole("button", { name: "Quantidade" }).click();
  await page.getByRole("button", { name: "Semana" }).click();
  await expect(page.getByText(/\blucro\b/i)).toHaveCount(1); // só o aviso "sem lucro nem margem"
  await page.getByRole("button", { name: "Escolher…" }).click();
  await page.locator("input[type=date]").first().fill("2099-01-01");
  await expect(page.getByText("A data inicial é depois da final.")).toBeVisible();
});

test("conectar celulares: QR com o endereço do PC", async ({ page }) => {
  await entrar(page, "ze");
  await page.goto("/painel/conectar");
  await expect(page.getByText("http://192.168.0.15:3333")).toBeVisible();
});
