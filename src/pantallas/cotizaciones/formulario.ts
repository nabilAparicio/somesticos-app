/**
 * El borrador del formulario de cotización y sus reglas, sin React y sin DOM.
 *
 * Es la misma anatomía que `src/pantallas/clientes/formulario.ts`, con las
 * mismas tres transformaciones que se equivocan en silencio si viven dentro
 * del componente:
 *
 *  1. **cotización → borrador**: el `null` del vencimiento se vuelve un campo
 *     vacío editable;
 *  2. **borrador → petición**: lo vacío vuelve a ser `null`, no `""`;
 *  3. **borrador → fallas**: qué falta antes de molestar al servidor.
 *
 * **Esta validación no autoriza nada.** La que manda es la del Worker
 * (`worker/cotizaciones/dominio.ts`), que es la que la base y los invariantes
 * respaldan. Ésta existe para avisar antes de mandar. Son dos copias de las
 * mismas reglas a propósito, y cada una tiene sus propias pruebas: aflojar
 * una tiene que matar sus pruebas y no las de la otra.
 *
 * Y hay un cuarto derivado que no existe del lado del Worker y que sin
 * embargo no es presentación: **el `min` del campo de fecha**. Vive acá
 * porque es una regla —qué días deja elegir el control— y porque adentro de
 * un `.tsx` solo se podría probar montando un navegador para leer un
 * atributo que ya era una cadena.
 */

import type {
  Cotizacion,
  DatosDeCotizacion,
  FallaDeValidacion,
  MotivoDeFalla,
} from "../../../worker/contract";
import { hoyEnPanama } from "../../../worker/db/momentos";

export interface BorradorDeCotizacion {
  clienteId: string;
  /** Lo que escribe el `<input type="date">`: `AAAA-MM-DD` o vacío. */
  venceEn: string;
}

export type CampoDelBorrador = keyof BorradorDeCotizacion;

/**
 * El alta arranca **sin cliente elegido**.
 *
 * Un desplegable que arranca con el primero de la lista es el que hace
 * cotizarle al cliente equivocado sin que nadie haya elegido nada.
 */
export const BORRADOR_DE_COTIZACION_VACIO: BorradorDeCotizacion = {
  clienteId: "",
  venceEn: "",
};

/**
 * Lo que la validación necesita saber y no está en el borrador.
 *
 * Es la misma forma que `ContextoDeCotizacion` del Worker, y por las mismas
 * dos razones: `hoy` no se lee del reloj acá adentro —una función que lo
 * hace no se puede probar en el borde «hoy no es pasado» sin esperar a que
 * cambie el día— y `venceEnActual` es lo que distingue «poner un
 * vencimiento pasado» de «reenviar el que ya estaba».
 */
export interface ContextoDelBorrador {
  /** Hoy, como día `AAAA-MM-DD`. */
  readonly hoy: string;
  /** El vencimiento que la cotización ya tenía. `null` en el alta. */
  readonly venceEnActual: string | null;
}

function recortar(valor: string): string | null {
  const limpio = valor.trim();
  return limpio === "" ? null : limpio;
}

function falla(campo: string, motivo: MotivoDeFalla): FallaDeValidacion {
  return { campo, motivo };
}

/**
 * Un día del calendario, en la forma `AAAA-MM-DD`.
 *
 * Es la **tercera** declaración de esta comprobación: están la de
 * `worker/pendientes/dominio.ts` y la de `worker/cotizaciones/dominio.ts`,
 * que ya explicaron por qué no se importan entre sí. Ésta se declara de
 * nuevo por un motivo distinto y más duro: unificarlas pide un módulo común
 * dentro de `worker/`, y eso es un archivo que esta unidad tiene prohibido
 * tocar. Queda anotado con los tres llamadores a la vista, que es lo que el
 * módulo de cotizaciones pedía para mover la función.
 *
 * La comprobación es el viaje de ida y vuelta y no una expresión regular:
 * `2026-02-31` pasa cualquier regex y no es ningún día; `Date` lo
 * normalizaría a marzo sin decir nada.
 */
function esDiaValido(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;

  const momento = new Date(`${valor}T00:00:00.000Z`);
  if (Number.isNaN(momento.getTime())) return false;

  return momento.toISOString().slice(0, 10) === valor;
}

export function borradorDesde(cotizacion: Cotizacion): BorradorDeCotizacion {
  return {
    clienteId: cotizacion.clienteId,
    venceEn: cotizacion.venceEn ?? "",
  };
}

export function aPeticion(borrador: BorradorDeCotizacion): DatosDeCotizacion {
  return {
    clienteId: borrador.clienteId.trim(),
    venceEn: recortar(borrador.venceEn),
  };
}

/**
 * El día más temprano que el `<input type="date">` deja elegir.
 *
 * **Son dos reglas, y las dos hacen falta.**
 *
 * La primera: el día es el **de Panamá**, no el de UTC. El bufete está en
 * UTC−5, así que a partir de las 19:00 locales `new Date().toISOString()` ya
 * devuelve mañana; con ese mínimo, el control no dejaría elegir hoy mientras
 * el servidor sí lo acepta —`worker/cotizaciones/dominio.ts` compara con
 * `<` y no con `<=` justamente para que hoy sirva—. Un formulario que
 * prohíbe lo que la API permite es el peor de los dos errores: no hay
 * mensaje que leer, solo un día en gris.
 *
 * La segunda: es `min(hoy, vencimiento guardado)` y no `hoy` a secas. Un
 * borrador viejo cuyo vencimiento ya pasó se puede reeditar sin tocarle la
 * fecha, porque reenviar el vencimiento que ya estaba no es ponerle uno. Con
 * `min = hoy` el control no podría **ni mostrar su propio valor**: un
 * `<input type="date">` con un `value` por debajo de su `min` se dibuja
 * inválido, y guardar sin tocar nada se vuelve imposible.
 *
 * El reloj entra por argumento, igual que en el Worker: una función que lo
 * lee no se puede probar en el borde de las siete de la tarde sin esperar a
 * que den las siete de la tarde.
 *
 * La comparación es de texto y es exacta por construcción: `AAAA-MM-DD` es
 * de ancho fijo, y ahí el orden lexicográfico y el cronológico son el mismo.
 */
export function minimoDeVencimiento(
  ahora: Date,
  venceEnActual: string | null,
): string {
  const hoy = hoyEnPanama(ahora);

  if (venceEnActual !== null && venceEnActual < hoy) return venceEnActual;
  return hoy;
}

/**
 * Lo que falta o no se entiende, antes de mandarlo.
 *
 * Devuelve **todas** las fallas y no la primera, igual que el Worker y que
 * el alta de un cliente: un formulario que corrige de a un error por envío
 * es el formulario que nadie usa.
 */
export function validarBorrador(
  borrador: BorradorDeCotizacion,
  contexto: ContextoDelBorrador,
): FallaDeValidacion[] {
  const datos = aPeticion(borrador);
  const fallas: FallaDeValidacion[] = [];

  // El cliente es I-1. Acá «no elegido» y «elegido en blanco» son la misma
  // omisión, que es lo que el desplegable produce con su opción vacía.
  if (datos.clienteId === "") {
    fallas.push(falla("clienteId", "cliente_requerido"));
  }

  if (datos.venceEn !== null) {
    if (!esDiaValido(datos.venceEn)) {
      fallas.push(falla("venceEn", "vencimiento_invalido"));
    } else if (
      datos.venceEn !== contexto.venceEnActual &&
      datos.venceEn < contexto.hoy
    ) {
      fallas.push(falla("venceEn", "vencimiento_pasado"));
    }
  }

  return fallas;
}

/**
 * Los textos de las fallas viven en `src/mensajes.ts`: el vocabulario de
 * motivos es uno solo para toda la API, y tenerlo dos veces sería dos
 * lugares donde un motivo nuevo puede quedarse sin texto.
 */
export { mensajeDeFalla } from "../../mensajes";
