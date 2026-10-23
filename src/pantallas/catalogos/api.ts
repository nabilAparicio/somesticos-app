/**
 * El cliente HTTP de los catálogos del bufete.
 *
 * La maquinaria está en `src/api/peticiones.ts`; acá viven las rutas y el
 * sujeto con el que cada pantalla nombra un 404.
 *
 * El `DELETE` usa `pedirVacio` porque contesta 204 sin cuerpo, y puede volver
 * con `conflicto`: eso no es un error de red ni un dato mal escrito, es la
 * política de borrado de T-6 diciendo que esa fila tiene dependientes y que
 * lo que corresponde es darla de baja.
 */

import {
  ESCRITURA,
  pedir,
  pedirVacio,
  textoDeProblema as textoDeProblemaDe,
  type Resultado,
} from "../../api/peticiones";
import type {
  Area,
  DatosDeCatalogo,
  DatosDeEtapa,
  DatosDeTipoProceso,
  EtapaPlantilla,
  RespuestaDeArea,
  RespuestaDeAreas,
  RespuestaDeEtapas,
  RespuestaDeTipoCliente,
  RespuestaDeTipoProceso,
  RespuestaDeTiposCliente,
  RespuestaDeTiposProceso,
  TipoCliente,
  TipoProceso,
} from "../../../worker/contract";

export type { Resultado };

export function textoDeProblema(
  resultado: Resultado<unknown>,
  sujeto = "eso",
): string {
  return textoDeProblemaDe(resultado, sujeto);
}

const AREAS = "/api/areas";
const TIPOS_CLIENTE = "/api/tipos-cliente";
const TIPOS_PROCESO = "/api/tipos-proceso";

function cuerpo(datos: unknown, method: "POST" | "PUT"): RequestInit {
  return { method, ...ESCRITURA, body: JSON.stringify(datos) };
}

// ---------------------------------------------------------------------------
// Áreas
// ---------------------------------------------------------------------------

export async function cargarAreas(
  signal: AbortSignal,
): Promise<Resultado<Area[]>> {
  const resultado = await pedir<RespuestaDeAreas>(AREAS, { signal });

  return resultado.estado === "ok"
    ? { estado: "ok", valor: resultado.valor.areas }
    : resultado;
}

export async function guardarArea(
  id: string | null,
  datos: DatosDeCatalogo,
): Promise<Resultado<Area>> {
  const resultado =
    id === null
      ? await pedir<RespuestaDeArea>(AREAS, cuerpo(datos, "POST"))
      : await pedir<RespuestaDeArea>(
          `${AREAS}/${encodeURIComponent(id)}`,
          cuerpo(datos, "PUT"),
        );

  return resultado.estado === "ok"
    ? { estado: "ok", valor: resultado.valor.area }
    : resultado;
}

export function borrarArea(id: string): Promise<Resultado<null>> {
  return pedirVacio(`${AREAS}/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

// ---------------------------------------------------------------------------
// Tipos de cliente — el catálogo que T-5 dejó sin forma de poblar
// ---------------------------------------------------------------------------

export async function cargarTiposCliente(
  signal: AbortSignal,
): Promise<Resultado<TipoCliente[]>> {
  const resultado = await pedir<RespuestaDeTiposCliente>(TIPOS_CLIENTE, {
    signal,
  });

  return resultado.estado === "ok"
    ? { estado: "ok", valor: resultado.valor.tipos }
    : resultado;
}

export async function guardarTipoCliente(
  id: string | null,
  datos: DatosDeCatalogo,
): Promise<Resultado<TipoCliente>> {
  const resultado =
    id === null
      ? await pedir<RespuestaDeTipoCliente>(
          TIPOS_CLIENTE,
          cuerpo(datos, "POST"),
        )
      : await pedir<RespuestaDeTipoCliente>(
          `${TIPOS_CLIENTE}/${encodeURIComponent(id)}`,
          cuerpo(datos, "PUT"),
        );

  return resultado.estado === "ok"
    ? { estado: "ok", valor: resultado.valor.tipo }
    : resultado;
}

export function borrarTipoCliente(id: string): Promise<Resultado<null>> {
  return pedirVacio(`${TIPOS_CLIENTE}/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

// ---------------------------------------------------------------------------
// Tipos de proceso y su plantilla
// ---------------------------------------------------------------------------

export async function cargarTiposProceso(
  signal: AbortSignal,
): Promise<Resultado<TipoProceso[]>> {
  const resultado = await pedir<RespuestaDeTiposProceso>(TIPOS_PROCESO, {
    signal,
  });

  return resultado.estado === "ok"
    ? { estado: "ok", valor: resultado.valor.tipos }
    : resultado;
}

export async function cargarTipoProceso(
  id: string,
  signal: AbortSignal,
): Promise<Resultado<TipoProceso>> {
  const resultado = await pedir<RespuestaDeTipoProceso>(
    `${TIPOS_PROCESO}/${encodeURIComponent(id)}`,
    { signal },
  );

  return resultado.estado === "ok"
    ? { estado: "ok", valor: resultado.valor.tipo }
    : resultado;
}

export async function guardarTipoProceso(
  id: string | null,
  datos: DatosDeTipoProceso,
): Promise<Resultado<TipoProceso>> {
  const resultado =
    id === null
      ? await pedir<RespuestaDeTipoProceso>(
          TIPOS_PROCESO,
          cuerpo(datos, "POST"),
        )
      : await pedir<RespuestaDeTipoProceso>(
          `${TIPOS_PROCESO}/${encodeURIComponent(id)}`,
          cuerpo(datos, "PUT"),
        );

  return resultado.estado === "ok"
    ? { estado: "ok", valor: resultado.valor.tipo }
    : resultado;
}

export function borrarTipoProceso(id: string): Promise<Resultado<null>> {
  return pedirVacio(`${TIPOS_PROCESO}/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function cargarEtapas(
  tipoProcesoId: string,
  signal: AbortSignal,
): Promise<Resultado<EtapaPlantilla[]>> {
  const resultado = await pedir<RespuestaDeEtapas>(
    `${TIPOS_PROCESO}/${encodeURIComponent(tipoProcesoId)}/etapas`,
    { signal },
  );

  return resultado.estado === "ok"
    ? { estado: "ok", valor: resultado.valor.etapas }
    : resultado;
}

export async function guardarEtapas(
  tipoProcesoId: string,
  etapas: DatosDeEtapa[],
): Promise<Resultado<EtapaPlantilla[]>> {
  const resultado = await pedir<RespuestaDeEtapas>(
    `${TIPOS_PROCESO}/${encodeURIComponent(tipoProcesoId)}/etapas`,
    cuerpo({ etapas }, "PUT"),
  );

  return resultado.estado === "ok"
    ? { estado: "ok", valor: resultado.valor.etapas }
    : resultado;
}
