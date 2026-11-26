import { defineConfig } from "@playwright/test";

/**
 * Testes de ponta a ponta do painel, no tamanho do PC do caixa e no celular do garçom.
 * A API é simulada em cada teste (page.route), então não precisa do servidor nem de banco:
 * só o `vite` (sobe sozinho pelo webServer abaixo).
 *
 * Rodar:  npm run test:e2e
 * Usar um Chrome já instalado:  PW_CHROME=/usr/bin/google-chrome npm run test:e2e
 */
const chrome = process.env.PW_CHROME;
const porta = Number(process.env.PW_PORTA ?? 5179);

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${porta}`,
    locale: "pt-BR",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: chrome ? { executablePath: chrome } : {},
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1366, height: 768 } } },
    {
      name: "celular",
      use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
    },
  ],
  webServer: {
    command: `npx vite --port ${porta} --strictPort`,
    url: `http://localhost:${porta}/login`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
