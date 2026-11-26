import { defineConfig } from "@playwright/test";

/**
 * Testes de ponta a ponta do painel, no tamanho do PC do caixa e no celular do garçom.
 * Roda contra o mock do front (`vite --mode mock`, VITE_MOCK=1): não precisa do servidor nem de banco.
 * Cada teste entra com `?mock_reset=1`, então começa do mesmo estado (caixa aberto, mesa 3 ocupada).
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
    { name: "tablet", use: { viewport: { width: 820, height: 1180 }, hasTouch: true } },
    { name: "desktop", use: { viewport: { width: 1366, height: 768 } } },
    {
      name: "celular",
      use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
    },
  ],
  webServer: {
    command: `npx vite --mode mock --port ${porta} --strictPort`,
    url: `http://localhost:${porta}/login`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
