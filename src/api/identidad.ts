/**
 * El cliente HTTP de «quién entró» (T-3 de
 * `odd/tasks/armazon-de-aplicacion.md`).
 *
 * ## Por qué vive en `src/api/` y no adentro de una pantalla
 *
 * Porque la identidad **no es de ninguna pantalla: es del armazón**. Lo que
 * la consume es la franja de arriba, que está en toda pantalla y no cambia
 * al navegar, así que un cliente colgado de una pantalla sería un cliente
 * colgado del lugar equivocado por construcción. Es la misma razón por la
 * que `src/api/usuarios.ts` no vive dentro de la pantalla de procesos.
 *
 * Y había además un defecto concreto que cerrar. Hasta T-3 esto no existía:
 * `src/pantallas/Inicio.tsx` hacía `fetch("/api/yo")` **a mano**, por fuera
 * del cliente de `src/api/peticiones.ts`, y eso le costaba las dos cosas que
 * ese cliente ya hace:
 *
 *  - **el 403 y el 503 con su motivo.** `pedir` los junta en
 *    `{ estado: "sin_acceso", motivo }` y conserva lo que dijo la puerta
 *    —`acceso_no_configurado`, `sin_token`, `usuario_desconocido`,
 *    `usuario_inactivo`—. El `fetch` a mano comparaba contra 200 y aplastaba
 *    las cuatro en la misma nada, que es la que no sirve para ninguna: una
 *    pide arreglar `wrangler.jsonc`, otra entrar por Access, y otra dar de
 *    alta a alguien en la tabla `usuario`;
 *  - **el error de transporte que no tira.** Todo lo que puede pasar vuelve
 *    como `Resultado`, incluido el aborto del desmontaje.
 *
 * ## Por qué no desenvuelve ningún sobre
 *
 * `cargarUsuarios` es el molde de este archivo y ahí sí hay uno:
 * `/api/usuarios` contesta `{ usuarios: [...] }` y el cliente devuelve la
 * lista. `/api/yo` contesta la identidad **pelada** (`worker/index.ts`), así
 * que acá el valor del `Resultado` ya es lo que el armazón necesita y no hay
 * nada que sacar de adentro de nada. Queda dicho porque la ausencia de la
 * línea de mapeo, al lado de un molde que la tiene, parece un olvido.
 *
 * ## Solo lectura, y tampoco hay nada para escribir
 *
 * No hay `cerrarSesion` ni la va a haber. La sesión es de Cloudflare Access
 * (`docs/diseno.md` §7 y §9) y se cierra en el borde, con un enlace a
 * `/cdn-cgi/access/logout`: no hay sesión nuestra que cerrar, así que no hay
 * ruta en el Worker ni función acá. El enlace vive en
 * `src/layout/Esqueleto.tsx`, con su motivo escrito al lado.
 */

import type { IdentidadActual } from "../../worker/contract";
import { pedir, type Resultado } from "./peticiones";

export async function cargarIdentidad(
  signal: AbortSignal,
): Promise<Resultado<IdentidadActual>> {
  return pedir<IdentidadActual>("/api/yo", { signal });
}
