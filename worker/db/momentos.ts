/**
 * Momentos del dominio, y el día del bufete.
 *
 * Son `TEXT` con ISO 8601 en UTC — exactamente la forma que produce
 * `Date.prototype.toISOString()`, la misma que ya devuelve el `timestamp` del
 * endpoint de salud. La base no se fía de la aplicación: cada columna de
 * momento lleva su `CHECK` con esa forma en
 * `migrations/0001_esquema_inicial.sql`.
 *
 * ## Este archivo lo importan los dos lados, y por eso no tiene nada adentro
 *
 * Lo usan el Worker y también `src/`, que es la única forma de que la zona
 * horaria del bufete esté escrita una sola vez. Eso le impone una regla:
 * **no importa nada y no puede importar nada**. Ni `D1Database`, ni un tipo
 * del runtime de Workers, ni un módulo que los arrastre. Un `import` acá se
 * lo lleva el bundle del navegador.
 *
 * Es la misma condición que ya cumple `worker/contract.ts`, que es el otro
 * archivo del Worker que `src/` importa, y por el mismo motivo: la flecha
 * del proyecto va `src/` → `worker/`, nunca al revés, y solo la cruzan los
 * módulos que no saben que existe un servidor.
 */

/** El instante actual, en la única forma que la base acepta. */
export function ahoraIso(): string {
  return new Date().toISOString();
}

/* ==========================================================================
   El día, en Panamá

   **El bufete no está en UTC, y la diferencia es visible todos los días a
   partir de las siete de la tarde.** Panamá es UTC−5 todo el año, sin
   horario de verano, así que la conversión es una resta y no una tabla de
   husos.

   Tres cosas se rompen si esto se ignora, y las tres las vive una persona:

    - **El día de hoy.** Desde las 19:00 locales el día UTC ya es el
      siguiente, así que quien elige la fecha de hoy en el calendario recibe
      un `vencimiento_pasado` por una cotización que vence hoy.
    - **El final del día.** Un vencimiento «hasta el 15» guardado como
      `2027-01-15T23:59:59.999Z` se muere a las 18:59 hora local, con la
      oficina abierta.
    - **Lo vencido en la pantalla.** Un pendiente que vence hoy aparecería
      vencido a las siete de la tarde, que es cuando todavía se resuelve.

   ## Por qué vive acá y no en cada módulo que lo necesita

   Lo necesitan el dominio de las cotizaciones (`worker/`) y la pantalla de
   los pendientes (`src/`). Dos copias de la zona horaria de un bufete que
   está en un solo lugar son una que se arregla y otra que no, seis meses
   después. Y no se puede resolver importando una de la otra: el Worker **no
   puede depender de `src/`**, porque eso daría vuelta la flecha del proyecto
   y metería código de navegador en el bundle del servidor. Con la flecha
   prohibida en un sentido, el único lugar que los dos pueden importar es un
   módulo del Worker sin dependencias, que es éste.

   ## Las dos conversiones son una sola, dada vuelta

   `finDelDiaEnPanama` y `diaEnPanama` tienen que componerse a la identidad.
   Si una usa el huso y la otra recorta el momento UTC con un `slice(0, 10)`,
   un vencimiento guardado el 15 se lee el 16 — el error no se nota al
   escribir, se nota al mirar el detalle. Van juntas y pegadas por eso.
   ========================================================================== */

/** Panamá es UTC−5 todo el año. No hay horario de verano que consultar. */
const HORAS_DE_PANAMA = -5;

const UNA_HORA = 3_600_000;

/** El día de hoy en Panamá, como `AAAA-MM-DD`. */
export function hoyEnPanama(ahora: Date): string {
  return new Date(ahora.getTime() + HORAS_DE_PANAMA * UNA_HORA)
    .toISOString()
    .slice(0, 10);
}

/**
 * El último instante de ese día **en Panamá**, como momento UTC canónico.
 *
 * El 15 de enero termina en Panamá a las 23:59:59.999 locales, que en UTC
 * son las 04:59:59.999 del 16. Que el momento caiga en el día siguiente es
 * correcto y es justamente lo que `diaEnPanama` deshace.
 */
export function finDelDiaEnPanama(dia: string): string {
  const local = new Date(`${dia}T23:59:59.999Z`);
  return new Date(local.getTime() - HORAS_DE_PANAMA * UNA_HORA).toISOString();
}

/**
 * El día **de Panamá** al que pertenece ese momento. La vuelta exacta de
 * `finDelDiaEnPanama`.
 *
 * Vale también para los momentos guardados antes de que esto existiera: un
 * `T23:59:59.999Z` menos cinco horas da `T18:59:59.999Z`, que es el mismo
 * día. Ninguna fila vieja cambia de significado al leerse con esta función,
 * así que no hace falta migrar datos.
 */
export function diaEnPanama(momento: string): string {
  return hoyEnPanama(new Date(momento));
}
