import { test, expect } from "@playwright/test";
import { entrar } from "./apoio.ts";
test.beforeEach(async ({ page }) => { page.on("dialog", async d => { await d.dismiss(); throw new Error(`Diálogo nativo: ${d.message()}`); }); });
async function semOverflow(page: import("@playwright/test").Page) { expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true); }
test("produto: valida, retoma rascunho, salva dois preços com escolhas e edita", async ({ page }) => {
  await entrar(page,"ze"); await page.goto("/painel/cardapio"); await page.getByRole("button",{name:"Novo produto",exact:true}).click();
  let dlg=page.getByRole("dialog"); await dlg.getByRole("button",{name:"Continuar",exact:true}).click(); await expect(dlg.getByRole("alert")).toBeVisible();
  await dlg.getByLabel("Nome do produto").fill("Pastel E2E"); await dlg.getByRole("button",{name:"Continuar",exact:true}).click();
  await dlg.locator(".linha-preco").getByLabel("Nome",{exact:false}).fill("Individual"); await dlg.getByLabel("Preço (R$)",{exact:false}).first().fill("15,50");
  await dlg.getByRole("button",{name:"Adicionar apresentação"}).click(); await dlg.locator(".linha-preco").getByLabel("Nome",{exact:false}).nth(1).fill("Duplo"); await dlg.getByLabel("Preço (R$)",{exact:false}).nth(1).fill("25,00");
  await dlg.getByRole("button",{name:"Continuar",exact:true}).click(); await dlg.getByRole("button",{name:"Adicionar grupo de escolhas"}).click();
  await dlg.getByLabel("Nome do grupo").fill("Molho"); await dlg.getByLabel(/^Opção/).fill("Pimenta"); await semOverflow(page);
  await page.keyboard.press("Tab"); expect(await dlg.evaluate(el => el.contains(document.activeElement))).toBe(true);
  await dlg.getByRole("button",{name:"Fechar",exact:true}).last().click(); await page.getByRole("dialog").last().getByRole("button",{name:"Confirmar ação"}).click();
  await page.getByRole("button",{name:"Novo produto",exact:true}).click(); dlg=page.getByRole("dialog"); await expect(dlg.getByLabel("Nome do produto")).toHaveValue("Pastel E2E");
  await dlg.getByRole("button",{name:/Revisão/}).click(); await expect(dlg).toContainText("Individual"); await expect(dlg).toContainText("Duplo");
  await page.evaluate(() => localStorage.setItem("mock_offline","1")); await dlg.getByRole("button",{name:"Salvar produto",exact:true}).click(); await expect(dlg.getByRole("alert")).toContainText("rascunho");
  await page.evaluate(() => localStorage.removeItem("mock_offline")); await dlg.getByRole("button",{name:"Salvar produto",exact:true}).click(); await expect(page.getByRole("dialog")).toHaveCount(0); await expect(page.getByText("Pastel E2E",{exact:true})).toBeVisible();
  const linha=page.locator(".produtos-lista > li",{hasText:"Pastel E2E"}); await linha.getByRole("button",{name:"Editar",exact:true}).click(); await expect(page.getByRole("dialog").getByLabel("Nome do produto")).toHaveValue("Pastel E2E");
});
test("usuário: perfil inicial e senha divergente com retorno visível", async ({page}) => {
  await entrar(page,"ze"); await page.goto("/painel/usuarios"); await page.getByRole("button",{name:/Novo usuário/}).click(); await semOverflow(page);
  await expect(page.getByLabel("Perfil de acesso")).toHaveValue("ATENDENTE");
  const editor = page.locator(".painel-drawer"); await editor.getByLabel("Nome", {exact:false}).first().fill("Equipe E2E"); await editor.getByLabel("Login",{exact:true}).fill("equipe_e2e");
  await editor.getByLabel("Senha",{exact:true}).fill("SenhaTeste123"); await editor.getByLabel("Confirmar senha",{exact:true}).fill("Diferente123"); await editor.getByRole("button",{name:"Criar usuário",exact:true}).click(); await expect(editor.getByRole("alert").first()).toContainText("não conferem");
  expect(await page.evaluate(() => Object.keys(sessionStorage).filter(k=>k.startsWith("osr:rascunho")).map(k=>sessionStorage.getItem(k)).join("").includes("SenhaTeste123"))).toBe(false);
  await editor.getByLabel("Confirmar senha",{exact:true}).fill("SenhaTeste123"); await editor.getByRole("button",{name:"Criar usuário",exact:true}).click(); await expect(page.getByText("Equipe E2E",{exact:true})).toBeVisible();
});
test("configuração reflete aba na URL e protege edição",async ({page}) => {
  await entrar(page,"ze"); await page.goto("/painel/configuracoes?aba=operacao"); await expect(page.getByRole("heading",{name:"Estoque",exact:true})).toBeVisible(); await semOverflow(page);
  await page.getByLabel("Taxa de serviço",{exact:false}).fill("12"); await page.getByRole("button",{name:"Entrega",exact:true}).click(); await expect(page.getByRole("dialog")).toBeVisible(); await page.getByRole("dialog").getByRole("button",{name:"Cancelar",exact:true}).click(); await expect(page).toHaveURL(/aba=operacao/);
});

test("divisão incompleta não confirma; valor restante apenas compõe a divisão",async ({page}) => {
  await entrar(page,"ze"); await page.goto("/painel/venda"); await page.getByText("Coca-Cola lata",{exact:true}).first().click();
  if ((page.viewportSize()?.width ?? 1366)<700) await page.getByRole("button",{name:"Ver e cobrar"}).click();
  await page.locator("[data-testid=cobrar]:visible").click(); const dlg=page.getByRole("dialog"); await dlg.getByRole("button",{name:/Pagar com mais de uma forma/}).click();
  const confirmar=page.getByTestId("confirmar-pagamento"); await expect(confirmar).toBeDisabled(); await dlg.getByLabel(/Valor em/).fill("2,00"); await dlg.getByRole("button",{name:"Adicionar pagamento",exact:true}).click(); await expect(confirmar).toBeDisabled(); await expect(dlg).toContainText("Faltam");
  await dlg.getByLabel(/Valor em/).fill("4,00"); await dlg.getByRole("button",{name:"Adicionar pagamento",exact:true}).click(); await expect(confirmar).toBeEnabled(); await confirmar.click(); await expect(page.getByText(/Venda #\d+ concluída/)).toBeVisible();
});

test("adicionais: erro de categoria fica visível no editor amplo",async ({page}) => {
 await entrar(page,"ze"); await page.goto("/painel/cardapio"); await page.getByRole("button",{name:/Adicionais da categoria/}).click(); await page.getByRole("button",{name:"Novo grupo",exact:true}).click();
 const form=page.locator("form",{has:page.getByRole("heading",{name:"Novo grupo de adicionais"})}); await form.getByLabel("Nome",{exact:true}).fill("Proteínas"); await form.getByRole("button",{name:"Criar",exact:true}).click(); await expect(page.locator(".catalogo-prods").getByRole("alert")).toContainText("categoria"); await semOverflow(page);
});
