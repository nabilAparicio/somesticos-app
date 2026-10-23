/**
 * Los formatos que comparten todas las pantallas.
 *
 * Nacieron dentro de la pantalla de clientes en T-5 y se mudaron acá en T-7,
 * cuando apareció la tercera pantalla que necesitaba exactamente lo mismo.
 * Tres copias de `fechaLegible` serían tres formas de escribir una fecha, y
 * la que se desincronice primero lo hace sin que nadie lo note.
 *
 * Sin DOM y sin React: son funciones de datos a texto, y adentro de un `.tsx`
 * solo se pueden probar montando un navegador para leer lo que ya era una
 * cadena.
 */

/** Lo que se muestra donde no hay dato. Un solo guion, en un solo lugar. */
export const VACIO = "—";

/**
 * Comparador con las reglas del español: `Álvarez` antes que `ávila`, y `ñ`
 * después de `n`. Con `Array.prototype.sort()` crudo las mayúsculas y los
 * acentos se van todos al final, y un listado de apellidos panameños queda
 * ordenado de una forma que nadie reconoce.
 */
export const ORDEN_ES = new Intl.Collator("es", { numeric: true });

/** Minúsculas y sin acentos, para buscar como la gente escribe. */
export function plano(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/** El momento ISO que guarda la base, en la forma que lee una persona. */
export function fechaLegible(iso: string): string {
  const momento = new Date(iso);
  if (Number.isNaN(momento.getTime())) return VACIO;

  return new Intl.DateTimeFormat("es-PA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(momento);
}

/**
 * Un **día** del calendario `AAAA-MM-DD`, en la forma que lee una persona.
 *
 * No es `fechaLegible` con otro formato, y la diferencia importa: un
 * vencimiento es un día, no un instante. `new Date("2026-11-30")` es
 * medianoche UTC, que en Panamá es el 29 a las siete de la tarde, así que
 * formatearlo con el huso local corre la fecha **un día hacia atrás**. Un
 * vencimiento mal dicho es peor que ninguno, así que se fuerza UTC a los dos
 * lados: se interpreta en UTC y se escribe en UTC.
 */
export function diaLegible(dia: string): string {
  const momento = new Date(`${dia}T00:00:00.000Z`);
  if (Number.isNaN(momento.getTime())) return VACIO;

  return new Intl.DateTimeFormat("es-PA", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(momento);
}
