/**
 * Las reglas del tablero de Inicio que se deciden sin mirar filas. Puras: ni
 * D1 ni HTTP.
 *
 * ## El calendario es el de Panamá, y no se escribe dos veces
 *
 * «Este mes» y «hoy» son los del bufete, que está en UTC−5
 * (`worker/db/momentos.ts`). Este archivo **no repite ese huso**: lo deduce de
 * `finDelDiaEnPanama`, que es la única definición. Si mañana el bufete
 * cambiara de huso, cambia allá y acá se recalcula solo.
 */

import type { AlcanceDelInicio, CuentaPorEstado } from "../contract";
import { finDelDiaEnPanama } from "../db/momentos";

const UNA_HORA = 3_600_000;

/**
 * Cuántas horas hay que **restarle** a un momento UTC para leerlo en Panamá,
 * deducidas y no escritas: el fin de un día en Panamá, menos el fin de ese
 * mismo día en UTC. Da 5.
 */
const HORAS_DETRAS_DE_UTC =
  (Date.parse(finDelDiaEnPanama("2000-01-01")) -
    Date.parse("2000-01-01T23:59:59.999Z")) /
  UNA_HORA;

/**
 * El modificador de SQLite que lleva un momento UTC al reloj de Panamá:
 * `strftime('%Y-%m', momento, '-5 hours')` es el mes de Panamá de ese
 * momento. Se pasa como parámetro y no pegado en el SQL.
 */
export const AL_RELOJ_DE_PANAMA = `-${String(HORAS_DETRAS_DE_UTC)} hours`;

/** Cuántos días hacia adelante «vence pronto» una cotización emitida. */
export const DIAS_DE_AVISO = 7;

/** `null` cuando el valor no es un alcance; ausente es «mío». */
export function leerAlcance(crudo: string | null): AlcanceDelInicio | null {
  if (crudo === null) return "mio";
  return crudo === "mio" || crudo === "bufete" ? crudo : null;
}

/** El día `AAAA-MM-DD` que cae `dias` después. Aritmética de calendario. */
export function sumarDias(dia: string, dias: number): string {
  // Mediodía para que ningún redondeo de horario cruce de día.
  const fecha = new Date(`${dia}T12:00:00.000Z`);
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return fecha.toISOString().slice(0, 10);
}

/**
 * Ganadas sobre cerradas. **Nula, y no cero, cuando no se cerró ninguna**:
 * un 0 % diría que se perdió todo, y lo que pasó es que no se decidió nada.
 */
export function tasaDeCierre(cuenta: CuentaPorEstado): number | null {
  const cerradas = cuenta.ganada + cuenta.perdida;
  return cerradas === 0 ? null : cuenta.ganada / cerradas;
}

export function cuentaVacia(): CuentaPorEstado {
  return { borrador: 0, emitida: 0, ganada: 0, perdida: 0 };
}
