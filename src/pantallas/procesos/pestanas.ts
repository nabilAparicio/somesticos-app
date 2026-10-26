/**
 * Las cuatro pestañas del proceso: cuáles son, en qué orden y cómo se
 * llaman. Sin React y sin DOM, como `presentacion.ts` y `plan.ts`.
 *
 * **La tira se dibuja con enlaces y no con el patrón `tablist` de ARIA**, y
 * la decisión no es de gusto. `role="tablist"` / `role="tab"` /
 * `role="tabpanel"` le prometen a un lector de pantalla una cosa muy
 * concreta: que el contenido cambia **en la misma página** y que las
 * flechas del teclado recorren las pestañas. Acá cada pestaña es una
 * dirección distinta, con su entrada en el historial y su botón de atrás.
 * Prometer una cosa y hacer otra deja peor a quien confía en la promesa que
 * no prometer nada: lo que esto es, de verdad, es una navegación — un
 * `<nav>` con cuatro enlaces y `aria-current="page"` en el que está abierto.
 *
 * Lo que sí hay que sostener, y se prueba: que se llegue a las cuatro con el
 * tabulador en orden, que la abierta se distinga por algo más que el color
 * —peso y una barra, no solo tinta— y que el `<h1>` siga siendo el título
 * del proceso y no el nombre de la pestaña.
 *
 * **No es una primitiva de `src/layout/`.** Hoy hay un solo consumidor. Una
 * primitiva reusable con un consumidor es una interfaz inventada contra un
 * segundo caso que no existe todavía y que por eso no puede contradecirla;
 * el día que una segunda pantalla necesite pestañas, las dos juntas van a
 * decir qué parte era común de verdad.
 */

import type { PestanaDeProceso } from "../../ruteo";

export interface EntradaDePestana {
  readonly clave: PestanaDeProceso;
  readonly rotulo: string;
}

/**
 * El orden es el del trabajo y no el alfabético: primero lo que se hace
 * —el plan—, después lo que falta, después la plata y al final lo que ya
 * pasó. Es el mismo criterio con el que la pantalla de una sola lista ponía
 * los dos registros al final.
 */
export const PESTANAS_DEL_PROCESO: readonly EntradaDePestana[] = [
  { clave: "trabajo", rotulo: "Trabajo" },
  { clave: "pendientes", rotulo: "Pendientes" },
  { clave: "dinero", rotulo: "Dinero" },
  { clave: "historial", rotulo: "Historial" },
];
