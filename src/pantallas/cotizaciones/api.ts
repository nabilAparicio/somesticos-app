/**
 * El cliente HTTP de la API de cotizaciones.
 *
 * La maquinaria —el mapeo de códigos a `Resultado` y el texto de cada
 * problema— vive en `src/api/peticiones.ts`. Acá quedan solo las rutas de
 * cotizaciones y el sujeto con el que se nombra un 404.
 *
 * **Son cuatro rutas de la cotización, una quinta de lectura, las cuatro del
 * ciclo de vida, las cinco de los módulos y las cinco de las líneas, y nada
 * más.** Lo que sigue sin existir es la salida imprimible (T-6) y la apertura
 * de procesos (T-7): una función acá que pida una ruta que no existe es un
 * 404 que la pantalla explicaría como «no es de este bufete».
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
  DatosDeLinea,
  DatosDeModulo,
  ModuloDeCotizacion,
  RespuestaDeBitacora,
  RespuestaDeCotizacion,
  RespuestaDeCotizaciones,
  RespuestaDeLineas,
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
   El ciclo de vida (T-4 y T-5)

   Los cuatro verbos de `worker/cotizaciones/rutas.ts`, con una forma que se
   repite en los cuatro: **`POST` a una subruta con verbo, sin cuerpo**.

   El cuerpo ausente no es una omisión de este archivo, es el contrato: el
   Worker no lee ninguno, y mandarlo sería ofrecerle a la pantalla un campo
   con el que imponer algo sobre escrituras que no se pueden deshacer. Lo
   único que estas direcciones reciben es a quién le pasa el hecho, y eso sale
   de la identidad que resolvió la puerta de Access (I-6).

   Por eso tampoco llevan `ESCRITURA`: esa constante pone el
   `content-type: application/json`, y declarar el tipo de un cuerpo que no
   viaja es decir algo falso en una cabecera.

   Los cuatro desenvuelven `RespuestaDeCotizacion`, igual que el alta y la
   edición. Los tres primeros devuelven **la misma cotización con su estado
   nuevo**; `duplicar` devuelve **la copia**, que es una fila distinta con
   identificador propio — es lo que deja abrirla sin leer el `location`.
   ========================================================================== */

function direccionDeVerbo(cotizacionId: string, verbo: string): string {
  return `/api/cotizaciones/${encodeURIComponent(cotizacionId)}/${verbo}`;
}

async function pedirVerbo(
  cotizacionId: string,
  verbo: "emitir" | "ganar" | "perder" | "duplicar",
): Promise<Resultado<Cotizacion>> {
  const resultado = await pedir<RespuestaDeCotizacion>(
    direccionDeVerbo(cotizacionId, verbo),
    { method: "POST" },
  );

  return resultado.estado === "ok"
    ? { estado: "ok", valor: resultado.valor.cotizacion }
    : resultado;
}

/**
 * Emitir: `borrador → emitida`, con el snapshot escrito en la misma
 * transacción. **No se deshace**, y por eso la pantalla lo confirma antes
 * (`ciclo.ts`, `confirmacionDeEmitir`).
 */
export function emitirCotizacion(
  cotizacionId: string,
): Promise<Resultado<Cotizacion>> {
  return pedirVerbo(cotizacionId, "emitir");
}

/** Ganar: `emitida → ganada`. Terminal. */
export function ganarCotizacion(
  cotizacionId: string,
): Promise<Resultado<Cotizacion>> {
  return pedirVerbo(cotizacionId, "ganar");
}

/** Perder: `emitida → perdida`. Terminal. */
export function perderCotizacion(
  cotizacionId: string,
): Promise<Resultado<Cotizacion>> {
  return pedirVerbo(cotizacionId, "perder");
}

/**
 * Duplicar: nace un borrador nuevo atado por `duplicada_de_id`, desde
 * cualquier estado, y la de arriba se queda exactamente como estaba.
 *
 * Lo que vuelve es **la copia**. El 201 trae además un `location`, y no se
 * lee: sacarle el identificador a una cabecera cuando el cuerpo ya trae la
 * fila entera es trabajo de más que además se rompe distinto.
 */
export function duplicarCotizacion(
  cotizacionId: string,
): Promise<Resultado<Cotizacion>> {
  return pedirVerbo(cotizacionId, "duplicar");
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

/* ==========================================================================
   Las líneas de honorarios y gastos estimados (T-3)

   Las otras cinco rutas de `worker/cotizaciones/rutas.ts`, copia exacta en
   forma de las cinco de módulos, con **una diferencia que importa**: lo que
   devuelven no es la lista sino `RespuestaDeLineas`, que es la lista **y sus
   totales**.

   Por eso estas cinco no desenvuelven nada y las de módulos sí. El cuerpo
   entero es lo que la pantalla necesita, y sacarle la lista para dejar los
   totales afuera obligaría a la pantalla a conseguirlos por otro lado — que
   es el camino corto hacia sumarlos ella misma, que es lo único que esta
   tajada prohíbe de plano. `cuerpoDeLineas` del Worker los deriva de la
   misma lista que viaja con ellos, en la misma línea de código, así que
   mientras viajen juntos no pueden discrepar.
   ========================================================================== */

function direccionDeLineas(cotizacionId: string): string {
  return `/api/cotizaciones/${encodeURIComponent(cotizacionId)}/lineas`;
}

/**
 * `signal` es opcional por lo mismo que en `cargarModulos`: ésta también se
 * pide **a mano**, cuando el servidor contesta que la lista en pantalla
 * quedó vieja, y esa relectura la dispara una persona que acaba de apretar
 * algo y no el montaje de un componente.
 */
export function cargarLineas(
  cotizacionId: string,
  signal?: AbortSignal,
): Promise<Resultado<RespuestaDeLineas>> {
  return pedir<RespuestaDeLineas>(direccionDeLineas(cotizacionId), { signal });
}

export function agregarLinea(
  cotizacionId: string,
  datos: DatosDeLinea,
): Promise<Resultado<RespuestaDeLineas>> {
  return pedir<RespuestaDeLineas>(direccionDeLineas(cotizacionId), {
    method: "POST",
    ...ESCRITURA,
    body: JSON.stringify(datos),
  });
}

export function editarLinea(
  cotizacionId: string,
  lineaId: string,
  datos: DatosDeLinea,
): Promise<Resultado<RespuestaDeLineas>> {
  return pedir<RespuestaDeLineas>(
    `${direccionDeLineas(cotizacionId)}/${encodeURIComponent(lineaId)}`,
    { method: "PUT", ...ESCRITURA, body: JSON.stringify(datos) },
  );
}

/**
 * `pedir` y no `pedirVacio`, por lo mismo que el borrado de un módulo: este
 * `DELETE` contesta **200 con la lista y los totales**, no 204 sin cuerpo.
 * Leerlo con `pedirVacio` tiraría la respuesta y dejaría la pantalla
 * mostrando la línea que se acaba de quitar **y el total de antes**, que es
 * el peor de los dos restos.
 */
export function quitarLinea(
  cotizacionId: string,
  lineaId: string,
): Promise<Resultado<RespuestaDeLineas>> {
  return pedir<RespuestaDeLineas>(
    `${direccionDeLineas(cotizacionId)}/${encodeURIComponent(lineaId)}`,
    { method: "DELETE" },
  );
}

/**
 * El reordenamiento: **la lista ordenada entera**, y el servidor asigna el
 * `orden` como posición del arreglo.
 *
 * La lista que viaja son las líneas de las **dos** familias en un solo
 * orden, porque el índice único de `0004` es sobre `(cotizacion_id, orden)`
 * y no sabe nada de clases. Quien la arma es `ordenDeLineas`, después de que
 * `moverLinea` haya hecho el intercambio dentro de una familia.
 */
export function reordenarLineas(
  cotizacionId: string,
  orden: readonly string[],
): Promise<Resultado<RespuestaDeLineas>> {
  return pedir<RespuestaDeLineas>(direccionDeLineas(cotizacionId), {
    method: "PUT",
    ...ESCRITURA,
    body: JSON.stringify({ orden }),
  });
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
