import type { D1Migration } from "cloudflare:test";

/**
 * `TEST_MIGRATIONS` no sale de `wrangler.jsonc`: lo inyecta `vitest.config.ts`
 * como binding de solo-pruebas, así que `wrangler types` no lo conoce y hay
 * que declararlo acá para que el setup file lo vea tipado.
 */
declare global {
  namespace Cloudflare {
    interface Env {
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}
