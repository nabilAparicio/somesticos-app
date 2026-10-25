/**
 * El cliente HTTP de los procesos.
 *
 * La maquinaria está en `src/api/peticiones.ts`; acá viven las rutas y el
 * sujeto con el que cada pantalla nombra un 404.
 *
 * `avanzarEtapa` tiene un estado propio: el **409** de un plan que ya no
 * tiene nada por delante. No es un error de red ni un dato mal escrito, así
 * que se distingue en vez de caer en «algo salió mal».
 */

import {
  ESCRITURA,
  pedir,
  pedirArchivo,
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
  CambioDeEstadoDeProceso,
  DatosDeEtapa,
  DatosDeGuardadoDePlantilla,
  DatosDeMovimiento,
  DatosDeNota,
  DatosDePendiente,
  DatosDeProceso,
  DetalleDeProceso,
  LineaDeTiempo,
  PendienteDeProceso,
  PlantillaGuardada,
  RespuestaDeBitacora,
  RespuestaDeGastos,
  Proceso,
  RespuestaDePendientes,
  RespuestaDeProceso,
  RespuestaDeProcesos,
} from "../../../worker/contract";

export type { Resultado };

/**
 * Los dos 409 de T-14, dichos acá y no en el mapa compartido de
 * `src/api/peticiones.ts`.
 *
 * El mapa de allá junta los conflictos que **cualquier** pantalla puede
 * recibir. Éstos no: nombran la regla del proceso cerrado, que es de este
 * dominio y de ninguno más, y la frase tiene que servir igual para las
 * cuatro operaciones que la chocan —avanzar, guardar el plan, anotar un
 * pendiente y el segundo cierre—. Una sola frase para las cuatro, porque la
 * salida de las cuatro es la misma.
 *
 * Sin esto el 409 caería en el texto de reserva, que habla de un borrado que
 * nadie pidió.
 */
const CONFLICTOS_DE_ESTADO: Record<string, string> = {
  proceso_cerrado:
    "Este proceso está cerrado, así que no avanza de etapa, no se le edita" +
    " el plan y no se le anotan pendientes nuevos. Si hay trabajo, primero" +
    " hay que reabrirlo.",
  proceso_abierto:
    "Este proceso ya estaba abierto. Hay que volver a cargarlo para ver" +
    " cómo quedó.",
};

export function textoDeProblema(
  resultado: Resultado<unknown>,
  sujeto = "ese proceso",
): string {
  if (resultado.estado === "conflicto") {
    const propio = CONFLICTOS_DE_ESTADO[resultado.motivo];
    if (propio !== undefined) return propio;
  }

  return textoDeProblemaDe(resultado, sujeto);
}

const PROCESOS = "/api/procesos";

function cuerpo(datos: unknown, method: "POST" | "PUT"): RequestInit {
  return { method, ...ESCRITURA, body: JSON.stringify(datos) };
}

export async function cargarProcesos(
  signal: AbortSignal,
  clienteId?: string,
): Promise<Resultado<Proceso[]>> {
  const ruta =
    clienteId === undefined
      ? PROCESOS
      : `${PROCESOS}?clienteId=${encodeURIComponent(clienteId)}`;

  const resultado = await pedir<RespuestaDeProcesos>(ruta, { signal });

  return resultado.estado === "ok"
    ? { estado: "ok", valor: resultado.valor.procesos }
    : resultado;
}

export function cargarProceso(
  id: string,
  signal: AbortSignal,
): Promise<Resultado<DetalleDeProceso>> {
  return pedir<DetalleDeProceso>(`${PROCESOS}/${encodeURIComponent(id)}`, {
    signal,
  });
}

export async function crearProceso(
  datos: DatosDeProceso,
): Promise<Resultado<Proceso>> {
  const resultado = await pedir<RespuestaDeProceso>(
    PROCESOS,
    cuerpo(datos, "POST"),
  );

  return resultado.estado === "ok"
    ? { estado: "ok", valor: resultado.valor.proceso }
    : resultado;
}

/**
 * Guarda el plan entero y devuelve el **detalle completo**: la escritura
 * mueve los contadores del proceso, así que la pantalla se redibuja con lo
 * que el servidor dejó guardado y no con lo que creía tener.
 */
export function guardarPlan(
  procesoId: string,
  etapas: DatosDeEtapa[],
): Promise<Resultado<DetalleDeProceso>> {
  return pedir<DetalleDeProceso>(
    `${PROCESOS}/${encodeURIComponent(procesoId)}/etapas`,
    cuerpo({ etapas }, "PUT"),
  );
}

/**
 * Marca alcanzada la próxima etapa pendiente.
 *
 * **No hay vuelta atrás**: el avance es de una sola dirección, decidido así
 * en T-7 porque una etapa alcanzada tampoco se borra (`docs/diseno.md` §6).
 * La pantalla lo dice antes de que alguien apriete.
 */
export function avanzarEtapa(
  procesoId: string,
): Promise<Resultado<DetalleDeProceso>> {
  return pedir<DetalleDeProceso>(
    `${PROCESOS}/${encodeURIComponent(procesoId)}/avanzar`,
    { method: "POST" },
  );
}

/**
 * Guarda el plan de este proceso como plantilla (T-11).
 *
 * **No manda las etapas.** El plan ya está guardado en el servidor, que es
 * quien lo lee: mandarlo de vuelta dejaría que esta pantalla decidiera qué
 * se copia. Lo único que viaja es el destino.
 *
 * La respuesta trae el tipo de destino con su plantilla recién escrita, y
 * **no un detalle de proceso**: esta escritura no toca ningún proceso, así
 * que no hay nada del proceso que redibujar.
 */
export function guardarComoPlantilla(
  procesoId: string,
  datos: DatosDeGuardadoDePlantilla,
): Promise<Resultado<PlantillaGuardada>> {
  return pedir<PlantillaGuardada>(
    `${PROCESOS}/${encodeURIComponent(procesoId)}/plantilla`,
    cuerpo(datos, "POST"),
  );
}

/* ==========================================================================
   Cerrar y reabrir el proceso (T-14)
   ========================================================================== */

/**
 * Cierra el proceso.
 *
 * **No pregunta si hay cabos sueltos: los cuenta y los informa.** El bufete
 * cierra casos con cabos sueltos y el sistema no está para discutirle; lo
 * que no puede es dejar que pase inadvertido, así que la respuesta trae
 * `pendientesAbiertos` y la pantalla lo dice.
 *
 * Igual que avanzar y que guardar el plan, contesta el detalle entero: el
 * cambio mueve lo que la cabecera muestra.
 */
export function cerrarProceso(
  procesoId: string,
): Promise<Resultado<CambioDeEstadoDeProceso>> {
  return pedir<CambioDeEstadoDeProceso>(
    `${PROCESOS}/${encodeURIComponent(procesoId)}/cerrar`,
    { method: "POST" },
  );
}

/**
 * Lo devuelve a estar en curso.
 *
 * A diferencia de `cerrarPendiente`, **esto sí existe**, y la asimetría es
 * deliberada: cerrar un pendiente deja una firma de quién lo cerró, y
 * reabrirlo la borraría. Cerrar un proceso solo escribe una fecha, y esa
 * fecha queda en la bitácora cuando la fila la pierde. Reabrir no borra
 * ninguna firma: la bitácora es inmutable y guarda las dos transiciones.
 */
export function reabrirProceso(
  procesoId: string,
): Promise<Resultado<CambioDeEstadoDeProceso>> {
  return pedir<CambioDeEstadoDeProceso>(
    `${PROCESOS}/${encodeURIComponent(procesoId)}/reabrir`,
    { method: "POST" },
  );
}

/* ==========================================================================
   Notas y línea de tiempo (T-8)
   ========================================================================== */

/**
 * La línea de tiempo del proceso: sus notas agrupadas por etapa.
 *
 * Es una segunda petición y no un campo del detalle a propósito: la línea
 * crece sin techo mientras el proceso corre, y el detalle lo pide todo el
 * mundo —el listado navega ahí— mientras que la línea se lee en la pantalla
 * del proceso y nada más.
 */
export function cargarLineaDeTiempo(
  procesoId: string,
  signal: AbortSignal,
): Promise<Resultado<LineaDeTiempo>> {
  return pedir<LineaDeTiempo>(
    `${PROCESOS}/${encodeURIComponent(procesoId)}/notas`,
    { signal },
  );
}

/**
 * Anota un hecho en el proceso.
 *
 * **No hay `editarNota` ni `borrarNota`, y no es un olvido**: una nota es
 * inmutable (`docs/diseno.md` §3 y §5, I-6). No existe la función porque no
 * existe la ruta, y no existe la ruta porque la base lo rechazaría igual con
 * los dos disparadores de T-2.
 *
 * La respuesta trae **la línea entera**, ya reagrupada: la pantalla asienta
 * lo que el servidor dejó guardado en vez de insertar la nota donde cree
 * que va, igual que el `PUT` del plan en T-7.
 */
export function anotar(
  procesoId: string,
  datos: DatosDeNota,
): Promise<Resultado<LineaDeTiempo>> {
  return pedir<LineaDeTiempo>(
    `${PROCESOS}/${encodeURIComponent(procesoId)}/notas`,
    cuerpo(datos, "POST"),
  );
}

/* ==========================================================================
   Pendientes (T-9)
   ========================================================================== */

/**
 * Los pendientes del proceso, abiertos y cerrados en una sola lista.
 *
 * Es una segunda petición y no un campo del detalle, por lo mismo que la
 * línea de tiempo: el detalle lo pide todo el mundo —el listado navega
 * ahí— y esto se lee en la pantalla del proceso.
 */
export function cargarPendientes(
  procesoId: string,
  signal: AbortSignal,
): Promise<Resultado<PendienteDeProceso[]>> {
  return listaDePendientes(
    pedir<RespuestaDePendientes>(
      `${PROCESOS}/${encodeURIComponent(procesoId)}/pendientes`,
      { signal },
    ),
  );
}

/**
 * Anota un cabo suelto en el proceso.
 *
 * La respuesta trae **la lista entera**, ya reordenada: la pantalla asienta
 * lo que el servidor dejó guardado en vez de insertar el pendiente donde
 * cree que va, igual que el alta de una nota en T-8.
 */
export function anotarPendiente(
  procesoId: string,
  datos: DatosDePendiente,
): Promise<Resultado<PendienteDeProceso[]>> {
  return listaDePendientes(
    pedir<RespuestaDePendientes>(
      `${PROCESOS}/${encodeURIComponent(procesoId)}/pendientes`,
      cuerpo(datos, "POST"),
    ),
  );
}

/**
 * Cierra un pendiente, firmado con quien está mirando la pantalla.
 *
 * **No hay `reabrirPendiente`, y no es un olvido**: cerrar es de una sola
 * dirección (decisión de T-9). No existe la función porque no existe la
 * ruta, y no existe la ruta porque reabrir sería borrar la firma de quien
 * cerró. Si el cierre estuvo mal, lo que corresponde es anotar un pendiente
 * nuevo que diga qué falta ahora.
 *
 * Quien cierra **no viaja en el cuerpo**: sale de la identidad de Access.
 * Una firma que el cliente pudiera elegir no es una firma.
 */
export function cerrarPendiente(
  procesoId: string,
  pendienteId: string,
): Promise<Resultado<PendienteDeProceso[]>> {
  return listaDePendientes(
    pedir<RespuestaDePendientes>(
      `${PROCESOS}/${encodeURIComponent(procesoId)}/pendientes/` +
        `${encodeURIComponent(pendienteId)}/cerrar`,
      { method: "POST" },
    ),
  );
}

/** Desenvuelve `{ pendientes }` sin repetir la rama tres veces. */
async function listaDePendientes(
  promesa: Promise<Resultado<RespuestaDePendientes>>,
): Promise<Resultado<PendienteDeProceso[]>> {
  const resultado = await promesa;

  return resultado.estado === "ok"
    ? { estado: "ok", valor: resultado.valor.pendientes }
    : resultado;
}

/**
 * La bitácora del proceso (T-10).
 *
 * Es una lectura aparte del detalle, a propósito: son dos preguntas
 * distintas —«¿en qué va?» y «¿quién hizo qué?»— y un fallo de la segunda
 * no puede dejar la pantalla del proceso en blanco. Misma decisión que T-7
 * tomó para el listado de procesos dentro de la ficha del cliente.
 *
 * No hay escritura. No existe: una entrada de bitácora la pone el sistema
 * al hacer otra cosa, nunca una pantalla.
 */
export async function cargarBitacoraDeProceso(
  id: string,
  signal: AbortSignal,
): Promise<Resultado<PaginaDeBitacora>> {
  const ruta = `${PROCESOS}/${encodeURIComponent(id)}/bitacora`;

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

/* ==========================================================================
   Gastos reales y comprobantes (tajada 2, T-10)

   Cinco rutas y **ninguna que lea el saldo por separado**: las cuatro que
   contestan JSON devuelven la cuenta entera —movimientos y saldo— en el
   mismo cuerpo, porque son el mismo hecho mirado de dos maneras. Pedirlos
   por separado abriría la ventana en la que la pantalla muestra una lista y
   un total que no le corresponde.

   La pantalla **no suma**: lo que estas funciones traen es lo que se dibuja.
   La resta vive en `worker/gastos/dominio.ts` y corre en el servidor (I-7).
   ========================================================================== */

/** La dirección de la cuenta de un proceso. Los movimientos cuelgan de ahí. */
function gastosDe(procesoId: string): string {
  return `${PROCESOS}/${encodeURIComponent(procesoId)}/gastos`;
}

/** La del papel de un movimiento. La llave del objeto no aparece acá. */
function comprobanteDe(procesoId: string, movimientoId: string): string {
  return `${gastosDe(procesoId)}/${encodeURIComponent(movimientoId)}/comprobante`;
}

/**
 * La cuenta del proceso: sus movimientos y lo que suman.
 *
 * Es una petición aparte del detalle, por lo mismo que la línea de tiempo y
 * los pendientes: un fallo acá no puede dejar la pantalla del proceso en
 * blanco, y la cuenta crece mientras el trámite corre.
 */
export function cargarGastos(
  procesoId: string,
  signal: AbortSignal,
): Promise<Resultado<RespuestaDeGastos>> {
  return pedir<RespuestaDeGastos>(gastosDe(procesoId), { signal });
}

/**
 * Registra un gasto o un anticipo.
 *
 * **Una sola función para los dos**, y no es ahorro de código: la mecánica
 * de cobro no es un dato sino qué filas existen (`docs/diseno.md` §6), así
 * que dos funciones serían dos caminos para escribir la misma fila con el
 * `tipo` distinto. El tipo viaja adentro de `datos`.
 *
 * Quién lo registró **no viaja**: sale de la identidad de Access (I-6).
 * El saldo tampoco, y no hay dónde ponerlo: `DatosDeMovimiento` no lo tiene.
 */
export function registrarMovimiento(
  procesoId: string,
  datos: DatosDeMovimiento,
): Promise<Resultado<RespuestaDeGastos>> {
  return pedir<RespuestaDeGastos>(gastosDe(procesoId), cuerpo(datos, "POST"));
}

/**
 * Saca un movimiento de la cuenta, y su papel del almacén.
 *
 * **No hay `editarMovimiento`, y no es un olvido**: la ruta no existe
 * (decisión de la unidad A). Corregir un monto es sacarlo y volver a
 * cargarlo, que para una cuenta de cinco movimientos es la misma operación
 * con más clics y sin ninguna regla nueva que escribir.
 *
 * Contesta la cuenta entera y no 204: el saldo que la pantalla tiene que
 * dibujar es el de los movimientos que quedaron, y recalcularlo acá sería
 * la segunda aritmética que esta tajada prohíbe.
 */
export function quitarMovimiento(
  procesoId: string,
  movimientoId: string,
): Promise<Resultado<RespuestaDeGastos>> {
  return pedir<RespuestaDeGastos>(
    `${gastosDe(procesoId)}/${encodeURIComponent(movimientoId)}`,
    { method: "DELETE" },
  );
}

/**
 * Sube el papel, o reemplaza el que estaba.
 *
 * **La llave no viaja**: la fabrica el servidor con el tenant, el proceso y
 * el movimiento, que son tres identificadores que el cliente no controla
 * (ver `llaveDeComprobante`). Lo único que se manda es el archivo, con su
 * tipo en el encabezado — que es lo que el servidor mira para aceptarlo, y
 * por eso se pone explícito en vez de dejar que lo deduzca del `Blob`.
 *
 * Contesta la cuenta entera porque adjuntar cambia lo que la lista dibuja:
 * ese movimiento pasa a tener papel.
 *
 * **Un `PUT` y no un `POST`**, y reemplazar no deja huérfano: la llave se
 * deriva de la fila y la fila no cambió, así que el objeto nuevo se escribe
 * encima del viejo.
 */
export function subirComprobante(
  procesoId: string,
  movimientoId: string,
  archivo: File,
): Promise<Resultado<RespuestaDeGastos>> {
  return pedir<RespuestaDeGastos>(comprobanteDe(procesoId, movimientoId), {
    method: "PUT",
    headers: { "content-type": archivo.type },
    body: archivo,
  });
}

/**
 * Trae el papel.
 *
 * Va por `pedirArchivo` y no por un `<a href>` por el 502 del almacén: un
 * enlace que navega a esta ruta deja al navegador mostrando el JSON del
 * error en una pestaña, que es la forma más clara de no decir nada. Está
 * explicado entero en `src/api/peticiones.ts`.
 *
 * El 404 de un movimiento sin papel llega como `no_encontrado`, igual que
 * el de un movimiento que no existe: desde donde está quien mira, las dos
 * son «acá no hay papel», y el servidor las junta a propósito.
 */
export function traerComprobante(
  procesoId: string,
  movimientoId: string,
): Promise<Resultado<Blob>> {
  return pedirArchivo(comprobanteDe(procesoId, movimientoId));
}
