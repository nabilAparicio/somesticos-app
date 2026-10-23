/**
 * El cliente HTTP que comparten todas las pantallas.
 *
 * Todo lo que puede pasar está en `Resultado`, y ninguna rama tira: una
 * pantalla que distingue «no existe» de «no entraste» de «se cayó la red» es
 * la diferencia entre un mensaje útil y un «algo salió mal».
 *
 * Nació dentro de la pantalla de clientes en T-5 y se mudó acá en T-6, cuando
 * apareció la segunda pantalla que necesitaba exactamente lo mismo más un
 * estado: el **409** del borrado bloqueado. Dos copias de este archivo serían
 * dos lugares donde un código de estado nuevo se trata distinto.
 *
 * `sin_acceso` cubre 403 y 503 juntos **para la pantalla**, que no puede
 * hacer nada distinto con uno y con otro, pero conserva el motivo que manda
 * la puerta: en local, sin token de Access, es lo que se va a ver siempre, y
 * saber que dice `sin_token` evita media hora de búsqueda.
 */

import type {
  AccesoDenegado,
  BorradoBloqueado,
  DatosInvalidos,
  FallaDeValidacion,
} from "../../worker/contract";

export type Resultado<T> =
  | { estado: "ok"; valor: T }
  | { estado: "invalido"; fallas: FallaDeValidacion[] }
  /** 409: el borrado chocó con dependientes. Solo lo usan los catálogos. */
  | { estado: "conflicto"; bloqueo: BorradoBloqueado }
  | { estado: "no_encontrado" }
  | { estado: "sin_acceso"; motivo: string }
  | { estado: "falla"; mensaje: string };

type Problema = Exclude<Resultado<never>, { estado: "ok" }>;

export const ESCRITURA = {
  headers: { "content-type": "application/json" },
} as const;

async function cuerpoJson(respuesta: Response): Promise<unknown> {
  try {
    return await respuesta.json();
  } catch {
    return null;
  }
}

/** El problema que trae la respuesta, o `null` si no hay ninguno. */
async function problemaDe(respuesta: Response): Promise<Problema | null> {
  if (respuesta.status === 403 || respuesta.status === 503) {
    const cuerpo = (await cuerpoJson(respuesta)) as AccesoDenegado | null;
    return { estado: "sin_acceso", motivo: cuerpo?.motivo ?? "desconocido" };
  }

  if (respuesta.status === 404) return { estado: "no_encontrado" };

  if (respuesta.status === 409) {
    const cuerpo = (await cuerpoJson(respuesta)) as BorradoBloqueado | null;
    return {
      estado: "conflicto",
      bloqueo: cuerpo ?? {
        error: "tiene_dependientes",
        entidad: "area",
        dependencias: [],
      },
    };
  }

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

  return null;
}

async function llamar(
  ruta: string,
  init: RequestInit | undefined,
): Promise<Response | Problema> {
  try {
    return await fetch(ruta, init);
  } catch (error: unknown) {
    return {
      estado: "falla",
      mensaje: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function pedir<T>(
  ruta: string,
  init?: RequestInit,
): Promise<Resultado<T>> {
  const respuesta = await llamar(ruta, init);
  if (!(respuesta instanceof Response)) return respuesta;

  const problema = await problemaDe(respuesta);
  if (problema !== null) return problema;

  return { estado: "ok", valor: (await respuesta.json()) as T };
}

/**
 * Para el `DELETE`, que contesta 204 sin cuerpo. Leerlo con `pedir` sería
 * pedirle a `respuesta.json()` que interprete una respuesta vacía.
 */
export async function pedirVacio(
  ruta: string,
  init?: RequestInit,
): Promise<Resultado<null>> {
  const respuesta = await llamar(ruta, init);
  if (!(respuesta instanceof Response)) return respuesta;

  const problema = await problemaDe(respuesta);
  if (problema !== null) return problema;

  return { estado: "ok", valor: null };
}

/**
 * El problema, dicho para quien está mirando la pantalla.
 *
 * `sujeto` es cómo se nombra lo que se estaba buscando («ese cliente», «esa
 * área»): el mismo 404 no se explica igual en dos pantallas distintas.
 *
 * El caso `sin_acceso` es el que más se va a ver mientras Access no esté
 * configurado (ver los pasos de tablero pendientes en el plan), así que dice
 * qué hacer y no solo qué pasó.
 */
export function textoDeProblema(
  resultado: Resultado<unknown>,
  sujeto: string,
): string {
  switch (resultado.estado) {
    case "ok":
      return "";
    case "no_encontrado":
      return `No existe ${sujeto}, o no es de este bufete.`;
    case "sin_acceso":
      return (
        "La puerta de acceso no reconoció la sesión" +
        ` (${resultado.motivo}). Hay que entrar por Cloudflare Access.`
      );
    case "invalido":
      return "Los datos enviados no se aceptaron.";
    case "conflicto":
      return "No se pudo borrar: hay datos que dependen de esto.";
    case "falla":
      return `No se pudo consultar: ${resultado.mensaje}`;
  }
}
