/**
 * El cliente HTTP del arancel de honorarios (T-2 de
 * `odd/tasks/arancel-de-honorarios.md`).
 *
 * Vive en `src/api/` y no dentro de una pantalla porque no es de ninguna: T-3
 * lo necesita en **dos** lugares distintos —la pantalla de los precios del
 * bufete y la tabla del arancel de solo lectura, que es a donde lleva el
 * enlace «de dónde sale este precio»— y la tajada siguiente lo va a necesitar
 * en una tercera, el editor de líneas de una cotización. Tres copias de estas
 * dos funciones serían tres rutas que se desincronizan.
 *
 * **Lectura y una sola escritura, y la asimetría es el archivo entero.** Se
 * lee la tabla completa; se escribe `monto`, el precio del bufete, y nada
 * más. No hay `crearRenglon` ni `borrarRenglon` porque no hay ruta, y no hay
 * ruta porque un renglón del Acuerdo No 49 de 2001 no lo da de alta nadie:
 * lo siembra `scripts/arancel/sembrar.mjs` desde la extracción del PDF
 * oficial. Y no hay `fijarMontoOficial` por el mismo motivo elevado al
 * cuadrado: eso sería una cita falsificada, y el servidor la rechaza con un
 * 409 que esta capa sabe explicar.
 */

import type {
  CategoriaDelArancel,
  RenglonDelArancel,
  RespuestaDeRenglonDelArancel,
  RespuestaDelArancel,
} from "../../worker/contract";
import {
  ESCRITURA,
  pedir,
  textoDeProblema,
  type Resultado,
} from "./peticiones";

/**
 * La tabla entera, agrupada por categoría y en el orden del documento.
 *
 * Viene agrupada **del servidor** y no se reagrupa acá: el orden de las
 * categorías es un dato del acuerdo, y una pantalla que lo reconstruya por su
 * cuenta es una pantalla que algún día lo reconstruye distinto. Una categoría
 * puede venir con `renglones` vacío, y no es un error: así se ven las dos
 * secciones que el acuerdo imprime solo como prosa —«OTROS ASUNTOS» y
 * «PROCESO DE SEPARACIONES DE BIENES…»—.
 */
export async function cargarArancel(
  signal: AbortSignal,
): Promise<Resultado<CategoriaDelArancel[]>> {
  const resultado = await pedir<RespuestaDelArancel>("/api/arancel", {
    signal,
  });

  return resultado.estado === "ok"
    ? { estado: "ok", valor: resultado.valor.categorias }
    : resultado;
}

/**
 * El precio del bufete de un renglón.
 *
 * `monto` va en **centavos enteros**, y `null` **borra** el precio propio: no
 * es lo mismo que cero. Un cero es una decisión del bufete —«esto no lo
 * cobramos»— y un nulo es la ausencia de decisión, que es lo que hace que la
 * pantalla vuelva a mostrar la sugerencia del acuerdo como valor de arranque.
 *
 * `PUT` y no `PATCH`, como en el resto de la aplicación, aunque acá mande un
 * solo campo: la semántica real es reemplazar el precio propio, y el cuerpo
 * lleva el juego completo de lo que se puede escribir — que es uno.
 */
export async function fijarMontoDelArancel(
  id: string,
  monto: number | null,
  signal: AbortSignal,
): Promise<Resultado<RenglonDelArancel>> {
  const resultado = await pedir<RespuestaDeRenglonDelArancel>(
    `/api/arancel/${encodeURIComponent(id)}`,
    { ...ESCRITURA, method: "PUT", body: JSON.stringify({ monto }), signal },
  );

  return resultado.estado === "ok"
    ? { estado: "ok", valor: resultado.valor.renglon }
    : resultado;
}

/**
 * Los dos 409 propios del arancel, dichos para quien mira la pantalla.
 *
 * ## Por qué esto está acá y no en `CONFLICTOS` de `peticiones.ts`
 *
 * El mapa `CONFLICTOS` de `src/api/peticiones.ts` es donde viven los motivos
 * de 409 de toda la aplicación, y ahí deberían estar éstos también. Lo que
 * frena la mudanza es lo que ese archivo ya tiene escrito en su propio
 * comentario: el mapa es un `Record<string, string>` **no exhaustivo**, y
 * declarar el `MotivoDeConflicto` que lo volvería exhaustivo obliga a
 * repartir de nuevo cinco motivos de la tajada 1 entre tres mapas. Es un
 * cambio del contrato del Worker y de la pantalla de procesos, no de esta
 * función.
 *
 * Lo que **no** se hizo es dejar que estos dos cayeran en el texto de reserva
 * de `textoDeProblema`, que habla de «un borrado» que nadie pidió. Esa es la
 * sin razón que esa misma tajada ya pagó tres veces —`cotizacion_no_es_borrador`,
 * `cotizacion_no_es_emitida` y `cotizacion_no_es_ganada` existieron sin frase
 * durante tres tareas—, y repetirla una cuarta no se arregla con un `TODO`.
 *
 * Todo lo que no es uno de estos dos 409 se delega a `textoDeProblema`, que
 * es la única que sabe de 403, 404, 422, 502 y red caída.
 */
export function textoDeProblemaDelArancel(
  resultado: Resultado<unknown>,
): string {
  if (resultado.estado === "conflicto") {
    if (resultado.motivo === "renglon_citado") {
      return (
        "Ese dato es la cita del Acuerdo No 49 de 2001 y no se edita: es el" +
        " registro de lo que dice el documento. Lo que el bufete decide es su" +
        " propio precio."
      );
    }

    if (resultado.motivo === "rubro_sin_precio") {
      return (
        "Ese renglón es un encabezado del acuerdo, no un servicio: agrupa a" +
        " los que vienen debajo y no lleva precio. El precio va en cada uno" +
        " de ellos."
      );
    }
  }

  return textoDeProblema(resultado, "ese renglón del arancel");
}
