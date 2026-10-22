/**
 * Identificadores del dominio.
 *
 * Son `TEXT` con UUID v4. SQLite no tiene `gen_random_uuid()`, así que la
 * llave no puede nacer en un `DEFAULT`: se genera en código y viaja dentro
 * del `INSERT`. Que el helper viva acá y no en cada caso de uso es lo que
 * impide que mañana convivan tres formas distintas de inventar una llave.
 */

/** Un identificador nuevo para cualquier fila del dominio. */
export function nuevoId(): string {
  return crypto.randomUUID();
}

/**
 * El único tenant que existe hoy (`docs/diseno.md` §7: columna sí, maquinaria
 * no). Lo siembra `migrations/0001_esquema_inicial.sql` con este mismo valor;
 * el Worker y las pruebas lo referencian por la constante en vez de repetir el
 * literal, para que el día que haya provisioning real haya un solo lugar que
 * dejar de usar.
 */
export const TENANT_UNICO_ID = "ead2d071-2ff7-4461-bf95-941c1e90d6d8";
