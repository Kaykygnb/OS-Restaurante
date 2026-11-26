import { expect, type Page } from "@playwright/test";

/** Usuários do mock (senha 1234). */
export type Usuario = "ze" | "marta" | "joao" | "ana" | "beto";

/** Entra pela tela de login, com o mock zerado. */
export async function entrar(page: Page, usuario: Usuario, senha = "1234") {
  await page.goto("/login?mock_reset=1");
  await page.fill("input[name=usuario]", usuario);
  await page.fill("input[name=senha]", senha);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/painel/);
}

export const ehCelular = (page: Page) => (page.viewportSize()?.width ?? 1366) < 700;
