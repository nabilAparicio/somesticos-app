/**
 * El cliente HTTP de la API de clientes.
 *
 * Todo lo que puede pasar está en `Resultado`, y ninguna rama tira: una
 * pantalla que distingue "no existe" de "no entraste" de "se cayó la red" es
 * la diferencia entre un mensaje útil y un "algo salió mal".
 *
 * `sin_acceso` cubre 403 y 503 juntos **para la pantalla**, que no puede
 * hacer nada distinto con uno y con otro, pero conserva el motivo que manda
 * la puerta: en local, sin token de Access, es lo que se va a ver siempre, y
 * saber que dice `sin_token` evita media hora de búsqueda.
 */

import type {
  AccesoDenegado,
  Cliente,
  DatosDeCliente,
  DatosInvalidos,
  RespuestaDeCliente,
  RespuestaDeClientes,
  RespuestaDeTiposCliente,
  TipoCliente,
} from "../../../worker/contract";

export type Resultado<T> =
  | { estado: "ok"; valor: T }
  | { estado: "invalido"; fallas: DatosInvalidos["fallas"] }
  | { estado: "no_encontrado" }
  | { estado: "sin_acceso"; motivo: string }
  | { estado: "falla"; mensaje: string };

async function cuerpoJson(respuesta: Response): Promise<unknown> {
  try {
    return await respuesta.json();
  } catch {
    return null;
  }
}

async function pedir<T>(
  ruta: string,
  init?: RequestInit,
): Promise<Resultado<T>> {
  let respuesta: Response;

  try {
    respuesta = await fetch(ruta, init);
  } catch (error: unknown) {
    return {
      estado: "falla",
      mensaje: error instanceof Error ? error.message : String(error),
    };
  }

  if (respuesta.status === 403 || respuesta.status === 503) {
    const cuerpo = (await cuerpoJson(respuesta)) as AccesoDenegado | null;
    return { estado: "sin_acceso", motivo: cuerpo?.motivo ?? "desconocido" };
  }

  if (respuesta.status === 404) return { estado: "no_encontrado" };

  if (respuesta.status === 422) {
    const cuerpo = (await cuerpoJson(respuesta)) as DatosInvalidos | null;
    return { estado: "invalido", fallas: cuerpo?.fallas ?? [] };
  }

  if (!respuesta.ok) {
    return {
      estado: "falla",
      mensaje: `respuesta inesperada: HTTP ${String(respuesta.status)}`,
    };
  }

  return { estado: "ok", valor: (await respuesta.json()) as T };
}

const ESCRITURA = {
  headers: { "content-type": "application/json" },
} as const;

/**
 * El problema, dicho para quien está mirando la pantalla.
 *
 * El caso `sin_acceso` es el que más se va a ver mientras Access no esté
 * configurado (ver los pasos de tablero pendientes en el plan), así que dice
 * qué hacer y no solo qué pasó.
 */
export function textoDeProblema(resultado: Resultado<unknown>): string {
  switch (resultado.estado) {
    case "ok":
      return "";
    case "no_encontrado":
      return "No existe ese cliente, o no es de este bufete.";
    case "sin_acceso":
      return (
        "La puerta de acceso no reconoció la sesión" +
        ` (${resultado.motivo}). Hay que entrar por Cloudflare Access.`
      );
    case "invalido":
      return "Los datos enviados no se aceptaron.";
    case "falla":
      return `No se pudo consultar: ${resultado.mensaje}`;
  }
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
