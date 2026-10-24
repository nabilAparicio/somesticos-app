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
  Cliente,
  Cotizacion,
  DatosDeCotizacion,
  FallaDeValidacion,
  MotivoDeFalla,
} from "../../../worker/contract";
import { hoyEnPanama } from "../../../worker/db/momentos";
import { ORDEN_ES } from "../../formatos";

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

/* ==========================================================================
   El desplegable de clientes

   **El defecto que esta sección existe para impedir, medido.** Al editar un
   borrador, el `clienteId` del formulario sale de la cotización guardada. Si
   la lista de clientes no trae a ese cliente, el `<select>` controlado
   queda con un valor que no corresponde a ninguna opción, y el navegador
   cae en la primera: dibuja **«Elegir cliente…»**. El estado de React, en
   cambio, sigue teniendo el identificador original, así que la validación
   previa pasa y el `PUT` sale con ese cliente. Se midió contra el navegador,
   con la lista fallando en 403 y con una lista que no lo contenía: en los
   dos casos el control decía «Elegir cliente…» y el cuerpo enviado llevaba
   `clienteId` original.

   Que el envío conserve el cliente **no es** lo que está mal: reenviar el
   que ya estaba es justo lo que un `PUT` tiene que hacer cuando nadie lo
   tocó. Lo que está mal es que el control diga que no hay ninguno elegido
   mientras sí lo hay — y peor, que quien lee «Elegir cliente…» pueda elegir
   otro creyendo que confirma, y ahí sí cambiar el cliente sin querer.

   La salida es la misma que tomó `tiposSeleccionables` en T-5 con el tipo
   de cliente dado de baja: **lo que la ficha ya tiene se ofrece siempre**,
   esté o no en el catálogo del momento. Así el control muestra la verdad en
   vez de inventar un «no elegido» que no es cierto.
   ========================================================================== */

/** Una opción del desplegable: lo único que el control necesita. */
export interface OpcionDeCliente {
  readonly id: string;
  readonly nombre: string;
}

/** El cliente que la cotización ya tiene. `null` en el alta. */
export interface ClienteDeLaCotizacion {
  readonly id: string;
  readonly nombre: string | null;
}

/**
 * Cómo se nombra al cliente que la cotización tiene y no se pudo nombrar.
 *
 * `clienteNombre` llega nulo solo si la fila cruzara la frontera del bufete,
 * que es lo que I-8 impide. Aun así el tipo lo admite, y la opción necesita
 * un texto: poner el identificador crudo sería una fila de UUID en un
 * desplegable, y dejarlo vacío sería la misma mentira que esta sección
 * arregla. Es el mismo recurso que `AUTOR_SIN_NOMBRE` en `src/bitacora.ts`:
 * decir el hueco en vez de taparlo.
 */
const CLIENTE_SIN_NOMBRE = "El cliente que la cotización ya tenía";

/**
 * Las opciones del desplegable, ordenadas por nombre.
 *
 * **El cliente que la cotización ya tiene va siempre**, aunque la lista no
 * lo traiga. Sin esa excepción el control dice «Elegir cliente…» sobre una
 * cotización que sí tiene cliente; el porqué entero está arriba.
 *
 * El orden se arma acá y no en el componente para que sea afirmable sin
 * montar un navegador, que es la regla del proyecto para todo lo que no sea
 * dibujo.
 */
export function clientesSeleccionables(
  clientes: readonly Cliente[],
  actual: ClienteDeLaCotizacion | null,
): OpcionDeCliente[] {
  const opciones: OpcionDeCliente[] = clientes.map((cliente) => ({
    id: cliente.id,
    nombre: cliente.nombre,
  }));

  if (actual !== null && !opciones.some((opcion) => opcion.id === actual.id)) {
    opciones.push({
      id: actual.id,
      nombre: actual.nombre ?? CLIENTE_SIN_NOMBRE,
    });
  }

  return opciones.sort((a, b) => ORDEN_ES.compare(a.nombre, b.nombre));
}

/**
 * El pie del desplegable cuando la lista de clientes no se pudo traer.
 *
 * Se muestra **siempre que haya problema**, y no solo cuando el desplegable
 * quedó vacío. Es la trampa que trae el arreglo de arriba: con el cliente de
 * la cotización inyectado, el desplegable ya no está vacío, así que un aviso
 * condicionado a «no hay opciones» desaparecería justo en el caso en que
 * hace falta — la lista falló y lo único ofrecible es el cliente que ya
 * estaba.
 *
 * Y cuando hay un cliente actual, la frase lo dice: sin esa media línea, un
 * desplegable con una sola opción parece un catálogo de un solo cliente.
 */
export function avisoDelDesplegable(
  problemaDeClientes: string | null,
  hayClienteActual: boolean,
): string | null {
  if (problemaDeClientes === null) return null;

  return hayClienteActual
    ? `${problemaDeClientes} Mientras tanto, lo único que se puede elegir es` +
        " el cliente que la cotización ya tenía."
    : problemaDeClientes;
}

/**
 * Los textos de las fallas viven en `src/mensajes.ts`: el vocabulario de
 * motivos es uno solo para toda la API, y tenerlo dos veces sería dos
 * lugares donde un motivo nuevo puede quedarse sin texto.
 */
export { mensajeDeFalla } from "../../mensajes";
