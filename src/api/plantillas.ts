/**
 * El cliente HTTP de las plantillas de módulo (T-2 de
 * `odd/tasks/plantillas-de-modulo.md`).
 *
 * Vive en `src/api/` y no dentro de la pantalla, por el mismo argumento que
 * `src/api/arancel.ts`: no es de ninguna pantalla en particular. Hoy la usa
 * `/catalogos/modulos`; T-3 la va a necesitar en el editor de módulos de una
 * cotización, en la hoja y en el detalle, porque es ahí donde el rótulo deja
 * de salir del código. Tres copias de estas dos funciones serían tres rutas
 * que se desincronizan.
 *
 * **Lectura y una sola escritura, y la asimetría es el archivo entero.** Se
 * lee el catálogo completo; se escribe el rótulo, la descripción y la
 * vigencia, y nada más. No hay `crearPlantilla` ni `borrarPlantilla` porque no
 * hay ruta, y no hay ruta por dos motivos distintos: crear está fuera del
 * alcance de la tajada —la clave tendría que derivarse del rótulo y
 * `cotizacion_modulo.tipo` sigue cerrado por el `CHECK` de `0004`— y borrar no
 * va a existir nunca, porque una plantilla borrada deja sin rótulo los módulos
 * de las cotizaciones vivas. Y no hay `fijarPreset` por el mismo motivo
 * elevado al cuadrado: eso sería borrar el piso al que se vuelve, y el
 * servidor lo rechaza con un 409 que esta capa sabe explicar.
 */

import type {
  PlantillaDeModulo,
  RespuestaDePlantillaDeModulo,
  RespuestaDePlantillasDeModulo,
} from "../../worker/contract";
import {
  ESCRITURA,
  pedir,
  textoDeProblema,
  type Resultado,
} from "./peticiones";

const PLANTILLAS = "/api/plantillas-modulo";

/**
 * El catálogo entero, en el orden sugerido.
 *
 * **Vienen también las dadas de baja**, con su `activo` puesto: sin ellas no
 * habría forma de reactivar una, que es parte del alcance de la tajada. Es la
 * misma política que los tres catálogos de T-6 — lo dado de baja se muestra
 * marcado, no escondido, porque lo que ya lo usa tiene que poder seguir
 * nombrándolo.
 *
 * Cada fila trae el valor vigente **ya resuelto por el servidor** y además el
 * preset, que es lo que deja dibujar la marca de editado y ofrecer el vuelta
 * atrás sin una segunda petición por fila.
 */
export async function cargarPlantillasDeModulo(
  signal: AbortSignal,
): Promise<Resultado<PlantillaDeModulo[]>> {
  const resultado = await pedir<RespuestaDePlantillasDeModulo>(PLANTILLAS, {
    signal,
  });

  return resultado.estado === "ok"
    ? { estado: "ok", valor: resultado.valor.plantillas }
    : resultado;
}

/**
 * Lo editable de una plantilla.
 *
 * `rotulo` y `descripcion` van en **`null` para volver al preset**, y eso es
 * la tajada entera: no es lo mismo que una cadena vacía y no hay una tercera
 * forma de decirlo. El servidor normaliza igual —vacío y en blanco también son
 * NULL, porque un rótulo de tres espacios pasaría el `CHECK` de la base y
 * dibujaría un encabezado vacío en la hoja de la cotización— y acá se manda ya
 * resuelto para que lo que viaja diga exactamente lo que la pantalla decidió.
 *
 * `activo` viaja siempre, y por eso no hay función aparte para dar de baja:
 * `PUT` manda el juego completo de lo editable, igual que en los catálogos de
 * T-6. El verbo que queda en la bitácora —`editado`, `dado_de_baja` o
 * `reactivado`— lo elige el servidor comparando contra cómo estaba la fila.
 */
export async function guardarPlantillaDeModulo(
  id: string,
  datos: {
    readonly rotulo: string | null;
    readonly descripcion: string | null;
    readonly activo: boolean;
  },
  signal: AbortSignal,
): Promise<Resultado<PlantillaDeModulo>> {
  const resultado = await pedir<RespuestaDePlantillaDeModulo>(
    `${PLANTILLAS}/${encodeURIComponent(id)}`,
    { ...ESCRITURA, method: "PUT", body: JSON.stringify(datos), signal },
  );

  return resultado.estado === "ok"
    ? { estado: "ok", valor: resultado.valor.plantilla }
    : resultado;
}

/**
 * Los dos 409 propios de las plantillas, dichos para quien mira la pantalla.
 *
 * ## Por qué esto está acá y no en `CONFLICTOS` de `peticiones.ts`
 *
 * Por lo mismo que `textoDeProblemaDelArancel`, y el argumento sigue siendo el
 * que ese archivo tiene escrito: `CONFLICTOS` es un `Record<string, string>`
 * **no exhaustivo**, y declarar el `MotivoDeConflicto` que lo volvería
 * exhaustivo obliga a repartir de nuevo cinco motivos de la tajada 1 entre
 * tres mapas. Es un cambio del contrato del Worker y de la pantalla de
 * procesos, no de esta función.
 *
 * Lo que **no** se hizo es dejar que estos dos cayeran en el texto de reserva
 * de `textoDeProblema`, que habla de «un borrado» que nadie pidió. Ésa es la
 * sin razón que la tajada 1 ya pagó tres veces, y el arancel una cuarta.
 *
 * Todo lo que no es uno de estos dos 409 se delega a `textoDeProblema`, que es
 * la única que sabe de 403, 404, 422, 502 y red caída.
 */
export function textoDeProblemaDeLasPlantillas(
  resultado: Resultado<unknown>,
): string {
  if (resultado.estado === "conflicto") {
    if (resultado.motivo === "plantilla_inmutable") {
      return (
        "Ese dato no se edita desde acá: la clave es con la que las" +
        " cotizaciones ya emitidas nombran su módulo, y el preestablecido es" +
        " el texto al que se vuelve cuando se vacía el campo. Lo que el" +
        " bufete decide es el rótulo y la descripción."
      );
    }

    if (resultado.motivo === "plantilla_sin_preset") {
      return (
        "Ese campo no se puede dejar vacío en este módulo: vaciarlo significa" +
        " «usar el preestablecido», y este módulo no tiene uno debajo. Hay" +
        " que escribir un texto."
      );
    }
  }

  return textoDeProblema(resultado, "ese módulo");
}
