/**
 * Momentos del dominio.
 *
 * Son `TEXT` con ISO 8601 en UTC — exactamente la forma que produce
 * `Date.prototype.toISOString()`, la misma que ya devuelve el `timestamp` del
 * endpoint de salud. La base no se fía de la aplicación: cada columna de
 * momento lleva su `CHECK` con esa forma en
 * `migrations/0001_esquema_inicial.sql`.
 */

/** El instante actual, en la única forma que la base acepta. */
export function ahoraIso(): string {
  return new Date().toISOString();
}
