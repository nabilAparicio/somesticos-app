/**
 * El cliente HTTP de la API de clientes.
 *
 * La maquinaria —el mapeo de códigos a `Resultado` y el texto de cada
 * problema— vive en `src/api/peticiones.ts` desde T-6, cuando apareció la
 * segunda pantalla que necesitaba exactamente lo mismo. Acá quedan solo las
 * rutas de clientes y el sujeto con el que se nombra un 404.
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
  Cliente,
  DatosDeCliente,
  RespuestaDeBitacora,
  RespuestaDeCliente,
  RespuestaDeClientes,
  RespuestaDeTiposCliente,
  TipoCliente,
} from "../../../worker/contract";

export type { Resultado };

export function textoDeProblema(resultado: Resultado<unknown>): string {
  return textoDeProblemaDe(resultado, "ese cliente");
}

export async function cargarTipos(
  signal: AbortSignal,
): Promise<Resultado<TipoCliente[]>> {
  const resultado = await pedir<RespuestaDeTiposCliente>("/api/tipos-cliente", {
    signal,
  });

  return resultado.estado === "ok"
    ? { estado: "ok", valor: resultado.valor.tipos }
    : resultado;
}

export async function cargarClientes(
  signal: AbortSignal,
): Promise<Resultado<Cliente[]>> {
  const resultado = await pedir<RespuestaDeClientes>("/api/clientes", {
    signal,
  });

  return resultado.estado === "ok"
    ? { estado: "ok", valor: resultado.valor.clientes }
    : resultado;
}

export async function cargarCliente(
  id: string,
  signal: AbortSignal,
): Promise<Resultado<Cliente>> {
  const resultado = await pedir<RespuestaDeCliente>(
    `/api/clientes/${encodeURIComponent(id)}`,
    { signal },
  );

  return resultado.estado === "ok"
    ? { estado: "ok", valor: resultado.valor.cliente }
    : resultado;
}

export async function crearCliente(
  datos: DatosDeCliente,
): Promise<Resultado<Cliente>> {
  const resultado = await pedir<RespuestaDeCliente>("/api/clientes", {
    method: "POST",
    ...ESCRITURA,
    body: JSON.stringify(datos),
  });

  return resultado.estado === "ok"
    ? { estado: "ok", valor: resultado.valor.cliente }
    : resultado;
}

export async function actualizarCliente(
  id: string,
  datos: DatosDeCliente,
): Promise<Resultado<Cliente>> {
  const resultado = await pedir<RespuestaDeCliente>(
    `/api/clientes/${encodeURIComponent(id)}`,
    { method: "PUT", ...ESCRITURA, body: JSON.stringify(datos) },
  );

  return resultado.estado === "ok"
    ? { estado: "ok", valor: resultado.valor.cliente }
    : resultado;
}

/**
 * La bitácora del cliente (T-10): quién tocó esta ficha y cuándo.
 *
 * Lectura aparte de la del cliente, igual que el listado de procesos: un
 * fallo acá no puede dejar la ficha en blanco.
 *
 * **Solo trae los hechos del cliente.** Los de sus procesos viven en la
 * bitácora de cada proceso: un hecho se registra una sola vez, bajo la
 * entidad de la que es.
 */
export async function cargarBitacoraDeCliente(
  id: string,
  signal: AbortSignal,
): Promise<Resultado<PaginaDeBitacora>> {
  const ruta = `/api/clientes/${encodeURIComponent(id)}/bitacora`;

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
