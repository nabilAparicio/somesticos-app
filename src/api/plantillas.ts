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
 * **Lectura, el alta y una sola edición.** Se lee el catálogo completo; se
 * crea una plantilla propia con su rótulo y su descripción; se edita el
 * rótulo, la descripción y la vigencia, y nada más.
 *
 * `crearPlantillaDeModulo` llegó en T-7, cuando `0017` quitó el techo que lo
 * impedía: mientras `cotizacion_modulo.tipo` estuvo cerrado por el `CHECK` de
 * `0004`, una plantilla nueva era una plantilla que esta pantalla ofrecía y la
 * base rechazaba al guardar el primer módulo de la cotización.
 *
 * Lo que sigue sin existir son dos, por dos motivos distintos:
 *
 *  - **`borrarPlantilla` nunca**, porque una plantilla borrada deja sin rótulo
 *    los módulos de las cotizaciones vivas — y desde `0017`, con una llave
 *    foránea rota. La salida es `activo = 0`, que viaja en el `PUT`.
 *  - **`fijarPreset` tampoco**, por el mismo motivo elevado al cuadrado: eso
 *    sería borrar el piso al que se vuelve, y el servidor lo rechaza con un
 *    409 que esta capa sabe explicar.
 */

import type {
  DatosDeAltaDePlantilla,
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
 * Una plantilla propia del bufete (T-7).
 *
 * **El cuerpo no lleva clave, y no es un olvido**: la acuña el servidor a
 * partir del rótulo. Esta capa no la calcula ni la previsualiza, y eso es una
 * decisión y no una falta: la acuñación es una regla del sistema que vive en
 * `worker/plantillas/dominio.ts`, y una segunda copia acá tendría que coincidir
 * **carácter por carácter** con la del servidor o la pantalla estaría
 * prometiendo un identificador que no es el que va a quedar. Una validación
 * duplicada puede ser más laxa que la del servidor sin mentir; una acuñación
 * duplicada no puede diferir en nada.
 *
 * Lo que la pantalla muestra en su lugar es la clave **ya acuñada** de cada
 * módulo, debajo de su rótulo, que es donde la persona la ve en cuanto el
 * módulo existe.
 *
 * Los dos textos van **recortados y no vacíos**: el servidor rechaza los dos
 * vacíos con un 422 propio, y la pantalla lo dice antes con `validarAlta`.
 */
export async function crearPlantillaDeModulo(
  datos: DatosDeAltaDePlantilla,
  signal: AbortSignal,
): Promise<Resultado<PlantillaDeModulo>> {
  const resultado = await pedir<RespuestaDePlantillaDeModulo>(PLANTILLAS, {
    ...ESCRITURA,
    method: "POST",
    body: JSON.stringify(datos),
    signal,
  });

  return resultado.estado === "ok"
    ? { estado: "ok", valor: resultado.valor.plantilla }
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
