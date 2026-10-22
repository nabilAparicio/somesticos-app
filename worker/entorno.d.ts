/**
 * Declaraciones del entorno que `wrangler types` no puede generar.
 *
 * `wrangler types` sale de `wrangler.jsonc`, así que conoce `ACCESO_TEAM_DOMAIN`
 * y `ACCESO_AUD`. No conoce lo de acá abajo, que son dos cosas distintas:
 *
 * - `import.meta.env`: lo inyecta Vite en tiempo de compilación. No es una
 *   variable de entorno del Worker; es una constante que el empaquetador
 *   sustituye antes de desplegar.
 * - `ACCESO_DEV_EMAIL`: solo existe cuando `vite dev` carga un `.dev.vars` o
 *   `.env` local. Nunca está en un despliegue, porque esos archivos no se
 *   suben. Por eso es opcional: el código tiene que seguir funcionando sin él.
 */

interface ImportMeta {
  /**
   * `true` en `vite dev` y en las pruebas; **`false` literal** en el bundle
   * que produce `vite build`, donde el empaquetador elimina la rama muerta.
   */
  readonly env: { readonly DEV: boolean; readonly MODE: string };
}

interface Env {
  ACCESO_DEV_EMAIL?: string;
}

declare namespace Cloudflare {
  interface Env {
    ACCESO_DEV_EMAIL?: string;
  }
}
