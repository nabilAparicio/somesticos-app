import { defineConfig, devices } from "@playwright/test";

/**
 * Puerto propio y `--strictPort`: si el 5173 del `pnpm dev` de alguien está
 * levantado, la prueba no debe engancharse a un servidor con otro código.
 */
const PUERTO = 5174;
const BASE = `http://127.0.0.1:${String(PUERTO)}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // El servidor de Vite con el plugin de Cloudflare: la misma pila que
    // sirve la SPA en producción, para que la prueba no mida otro layout.
    command: `pnpm exec vite --host 127.0.0.1 --port ${String(PUERTO)} --strictPort`,
    url: BASE,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
