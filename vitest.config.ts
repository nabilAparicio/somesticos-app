import path from "node:path";
import { fileURLToPath } from "node:url";

import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

const raiz = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    cloudflareTest(async () => {
      // Las migraciones se leen en Node (acá) y se aplican dentro del runtime
      // de Workers (en el setup file), que es el reparto que pide la receta de
      // D1: `readD1Migrations()` toca el disco, `applyD1Migrations()` toca la
      // base. El puente entre los dos es este binding de solo-pruebas.
      const migraciones = await readD1Migrations(path.join(raiz, "migrations"));

      return {
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          bindings: { TEST_MIGRATIONS: migraciones },
        },
      };
    }),
  ],
  test: {
    include: ["test/**/*.spec.ts"],
    setupFiles: ["./test/aplicar-migraciones.ts"],
  },
});
