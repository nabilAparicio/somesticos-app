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
  textoDeProblema as textoDeProblemaDe,
  type Resultado,
} from "../../api/peticiones";
import type {
  DatosDeEtapa,
  DatosDeGuardadoDePlantilla,
  DatosDeNota,
  DatosDeProceso,
  DetalleDeProceso,
  LineaDeTiempo,
  PlantillaGuardada,
  Proceso,
  RespuestaDeProceso,
  RespuestaDeProcesos,
} from "../../../worker/contract";

export type { Resultado };

export function textoDeProblema(
  resultado: Resultado<unknown>,
  sujeto = "ese proceso",
): string {
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
