/**
 * El cliente HTTP de la API de cotizaciones.
 *
 * La maquinaria —el mapeo de códigos a `Resultado` y el texto de cada
 * problema— vive en `src/api/peticiones.ts`. Acá quedan solo las rutas de
 * cotizaciones y el sujeto con el que se nombra un 404.
 *
 * **Son cuatro rutas de la cotización, una quinta de lectura y las cinco de
 * los módulos, y nada más.** No hay emitir, ni ganar, ni perder, ni duplicar
 * —son de T-4 y T-5 y todavía no existen del lado del Worker—, ni líneas,
 * que son de T-3. Una función acá que pida una ruta que no existe es un 404
 * que la pantalla explicaría como «no es de este bufete».
 *
 * El listado de clientes para el desplegable del formulario **no se declara
 * de nuevo acá**: se importa de `../clientes/api`, que es donde vive. Una
 * segunda forma de pedir `/api/clientes` sería la que se queda sin el
 * `AbortSignal` el día que alguien la toque.
 */

import {
  ESCRITURA,
  pedir,
  textoDeProblema as textoDeProblemaDe,
  type Resultado,
} from "../../api/peticiones";
import {
  direccionDeBitacora,
  paginaDeBitacora,
  type PaginaDeBitacora,
} from "../../bitacora";
import { LIMITE_DE_BITACORA_POR_DEFECTO } from "../../../worker/contract";
import type {
  Cotizacion,
  DatosDeCotizacion,
  DatosDeModulo,
  ModuloDeCotizacion,
  RespuestaDeBitacora,
  RespuestaDeCotizacion,
  RespuestaDeCotizaciones,
  RespuestaDeModulos,
} from "../../../worker/contract";

export type { Resultado };

export function textoDeProblema(resultado: Resultado<unknown>): string {
  return textoDeProblemaDe(resultado, "esa cotización");
}

export async function cargarCotizaciones(
  signal: AbortSignal,
): Promise<Resultado<Cotizacion[]>> {
  const resultado = await pedir<RespuestaDeCotizaciones>("/api/cotizaciones", {
    signal,
  });

  return resultado.estado === "ok"
    ? { estado: "ok", valor: resultado.valor.cotizaciones }
    : resultado;
}

export async function cargarCotizacion(
  id: string,
  signal: AbortSignal,
): Promise<Resultado<Cotizacion>> {
  const resultado = await pedir<RespuestaDeCotizacion>(
    `/api/cotizaciones/${encodeURIComponent(id)}`,
    { signal },
  );

  return resultado.estado === "ok"
    ? { estado: "ok", valor: resultado.valor.cotizacion }
    : resultado;
}

export async function crearCotizacion(
  datos: DatosDeCotizacion,
): Promise<Resultado<Cotizacion>> {
  const resultado = await pedir<RespuestaDeCotizacion>("/api/cotizaciones", {
    method: "POST",
    ...ESCRITURA,
    body: JSON.stringify(datos),
  });

  return resultado.estado === "ok"
    ? { estado: "ok", valor: resultado.valor.cotizacion }
    : resultado;
}

/**
 * `PUT` y no `PATCH`, igual que el Worker: el formulario manda el juego
 * completo de campos editables, así que la semántica real es reemplazar.
 */
export async function actualizarCotizacion(
  id: string,
  datos: DatosDeCotizacion,
): Promise<Resultado<Cotizacion>> {
  const resultado = await pedir<RespuestaDeCotizacion>(
    `/api/cotizaciones/${encodeURIComponent(id)}`,
    { method: "PUT", ...ESCRITURA, body: JSON.stringify(datos) },
  );

  return resultado.estado === "ok"
    ? { estado: "ok", valor: resultado.valor.cotizacion }
    : resultado;
}

/* ==========================================================================
   Los módulos de prosa (T-2, unidad C)

   Las cinco rutas de `worker/cotizaciones/rutas.ts`, con una forma que se
   repite en las cuatro de escritura: **todas devuelven la lista entera**.
   No es una simplificación de este archivo sino el contrato
   (`RespuestaDeModulos`), y está así porque lo que cambió no es un módulo
   sino el documento: una respuesta parcial obligaría a la pantalla a
   recomponer el orden a mano justo después de haberlo cambiado.

   La dirección de la colección se arma una sola vez, abajo. Escribirla cinco
   veces es tener cinco lugares donde `encodeURIComponent` puede faltar.
   ========================================================================== */

function direccionDeModulos(cotizacionId: string): string {
  return `/api/cotizaciones/${encodeURIComponent(cotizacionId)}/modulos`;
}

/**
 * `signal` es opcional acá y obligatorio en las demás lecturas, y la
 * diferencia tiene un motivo: ésta también se pide **a mano**, cuando el
 * servidor contesta que la lista en pantalla quedó vieja. Esa relectura la
 * dispara una persona que acaba de apretar algo y no el montaje de un
 * componente, así que no hay ningún efecto del que colgar un corte.
 */
export async function cargarModulos(
  cotizacionId: string,
  signal?: AbortSignal,
): Promise<Resultado<ModuloDeCotizacion[]>> {
  return conLaLista(
    await pedir<RespuestaDeModulos>(direccionDeModulos(cotizacionId), {
      signal,
    }),
  );
}

export async function agregarModulo(
  cotizacionId: string,
  datos: DatosDeModulo,
): Promise<Resultado<ModuloDeCotizacion[]>> {
  return conLaLista(
    await pedir<RespuestaDeModulos>(direccionDeModulos(cotizacionId), {
      method: "POST",
      ...ESCRITURA,
      body: JSON.stringify(datos),
    }),
  );
}

export async function editarModulo(
  cotizacionId: string,
  moduloId: string,
  datos: DatosDeModulo,
): Promise<Resultado<ModuloDeCotizacion[]>> {
  return conLaLista(
    await pedir<RespuestaDeModulos>(
      `${direccionDeModulos(cotizacionId)}/${encodeURIComponent(moduloId)}`,
      { method: "PUT", ...ESCRITURA, body: JSON.stringify(datos) },
    ),
  );
}

/**
 * `pedir` y no `pedirVacio`, que es lo contrario del borrado de un catálogo
 * en T-6: este `DELETE` contesta **200 con la lista**, no 204 sin cuerpo.
 * Leerlo con `pedirVacio` tiraría la respuesta y dejaría la pantalla
 * mostrando el módulo que se acaba de quitar.
 */
export async function quitarModulo(
  cotizacionId: string,
  moduloId: string,
): Promise<Resultado<ModuloDeCotizacion[]>> {
  return conLaLista(
    await pedir<RespuestaDeModulos>(
      `${direccionDeModulos(cotizacionId)}/${encodeURIComponent(moduloId)}`,
      { method: "DELETE" },
    ),
  );
}

/**
 * El reordenamiento: **la lista ordenada entera**, y el servidor asigna el
 * `orden` como posición del arreglo.
 *
 * El cuerpo es `{ orden: [...] }` y no el arreglo pelado por lo mismo que
 * explica `normalizarOrdenDeModulos`: un JSON de nivel superior que es un
 * arreglo es el que después nadie sabe versionar.
 */
export async function reordenarModulos(
  cotizacionId: string,
  orden: readonly string[],
): Promise<Resultado<ModuloDeCotizacion[]>> {
  return conLaLista(
    await pedir<RespuestaDeModulos>(direccionDeModulos(cotizacionId), {
      method: "PUT",
      ...ESCRITURA,
      body: JSON.stringify({ orden }),
    }),
  );
}

function conLaLista(
  resultado: Resultado<RespuestaDeModulos>,
): Resultado<ModuloDeCotizacion[]> {
  return resultado.estado === "ok"
    ? { estado: "ok", valor: resultado.valor.modulos }
    : resultado;
}

/**
 * La bitácora de la cotización (T-10): quién la abrió, quién la editó.
 *
 * Lectura aparte de la de la cotización, igual que en la ficha del cliente:
 * un fallo acá no puede dejar el detalle en blanco.
 */
export async function cargarBitacoraDeCotizacion(
  id: string,
  signal: AbortSignal,
): Promise<Resultado<PaginaDeBitacora>> {
  const ruta = `/api/cotizaciones/${encodeURIComponent(id)}/bitacora`;

  const resultado = await pedir<RespuestaDeBitacora>(
    direccionDeBitacora(ruta, LIMITE_DE_BITACORA_POR_DEFECTO),
    { signal },
  );

  return resultado.estado === "ok"
    ? {
        estado: "ok",
        valor: paginaDeBitacora(
          ruta,
          LIMITE_DE_BITACORA_POR_DEFECTO,
          resultado.valor,
        ),
      }
    : resultado;
}
