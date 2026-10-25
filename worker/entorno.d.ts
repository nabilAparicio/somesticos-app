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
 * - Las tres de la costura con el modelo (T-8). Están acá y no en
 *   `wrangler.jsonc` por dos motivos distintos, y conviene no confundirlos:
 *   `IA_API_KEY` es **un secreto** y lo que va en `wrangler.jsonc` se
 *   despliega en claro, así que su sitio es `wrangler secret put IA_API_KEY`
 *   —y `.dev.vars` en local—; `IA_MODELO` e `IA_PROVEEDOR` no son secretas y
 *   **podrían** ir en `vars`, pero hoy no hacen falta porque el código trae el
 *   valor por defecto de cada una (`claude-opus-5` y `anthropic`,
 *   `docs/diseno.md` §8). Declararlas acá es lo que permite fijarlas por
 *   despliegue sin tocar el código el día que haga falta.
 *
 *   **Las tres son opcionales, y eso es la decisión de qué pasa cuando
 *   faltan**: sin `IA_API_KEY` la costura no explota con un error ilegible ni
 *   llama a la red — devuelve `modelo_no_configurado`, que es el equivalente
 *   de `acceso_no_configurado` en la puerta. Un despliegue sin clave sigue
 *   sirviendo todo lo demás.
 * - `COMPROBANTES`: el bucket de R2 donde viven los papeles de los gastos
 *   reales (T-10). **No es una variable, es un binding**, y está acá por un
 *   motivo distinto de los de arriba: `wrangler.jsonc` todavía no lo declara,
 *   porque crear el bucket es una operación sobre la cuenta de Cloudflare y
 *   esa decisión es del usuario, no de una tarea. El nombre propuesto es
 *   `COMPROBANTES`, y el día que entre en `r2_buckets` esta declaración se
 *   borra: `wrangler types` la va a generar sola, y dejarla duplicada sería
 *   el segundo lugar donde decir lo mismo.
 *
 *   **Es opcional, y eso es la decisión de qué pasa cuando falta**: sin el
 *   binding, `almacenSobreR2` devuelve un almacén que falla cerrado con
 *   `almacen_no_configurado` en cuanto se lo usa —el equivalente exacto de
 *   `modelo_no_configurado` y de `acceso_no_configurado`—, y todo lo demás
 *   sigue funcionando: se registran gastos y anticipos, y se lee el saldo. Lo
 *   único que no se puede en un despliegue así es adjuntar el papel.
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
  /** Secreto. `wrangler secret put IA_API_KEY`. Nunca en un archivo. */
  IA_API_KEY?: string;
  /** Sin esto, `MODELO_POR_DEFECTO` de `worker/ia/anthropic.ts`. */
  IA_MODELO?: string;
  /** Sin esto, `PROVEEDOR_POR_DEFECTO` de `worker/ia/modelo.ts`. */
  IA_PROVEEDOR?: string;
  /** Sin esto, `almacen_no_configurado`. Ver arriba. */
  COMPROBANTES?: R2Bucket;
}

declare namespace Cloudflare {
  interface Env {
    ACCESO_DEV_EMAIL?: string;
    IA_API_KEY?: string;
    IA_MODELO?: string;
    IA_PROVEEDOR?: string;
    COMPROBANTES?: R2Bucket;
  }
}
