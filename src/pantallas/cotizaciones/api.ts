/**
 * El cliente HTTP de la API de cotizaciones.
 *
 * La maquinaria —el mapeo de códigos a `Resultado` y el texto de cada
 * problema— vive en `src/api/peticiones.ts`. Acá quedan solo las rutas de
 * cotizaciones y el sujeto con el que se nombra un 404.
 *
 * **Son cuatro rutas y una quinta de lectura, y nada más.** No hay emitir,
 * ni ganar, ni perder, ni duplicar —son de T-4 y T-5 y todavía no existen
 * del lado del Worker—, ni módulos ni líneas, que son de la unidad C y de
 * T-3. Una función acá que pida una ruta que no existe es un 404 que la
 * pantalla explicaría como «no es de este bufete».
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
  RespuestaDeBitacora,
  RespuestaDeCotizacion,
  RespuestaDeCotizaciones,
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
