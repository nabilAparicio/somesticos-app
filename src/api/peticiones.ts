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
  /**
   * 409: la petición está bien formada y el estado es el que no la admite.
   *
   * Hay dos, y por eso viaja `motivo`: el borrado de un catálogo que chocó
   * con dependientes (`tiene_dependientes`, T-6) y el avance de un proceso
   * que ya no tiene etapas por delante (`sin_etapas_pendientes`, T-7).
   * `bloqueo` solo trae algo en el primer caso; inventarle un valor al
   * segundo sería ofrecerle a la pantalla un detalle que no existe.
   */
  | {
      estado: "conflicto";
      motivo: string;
      bloqueo: BorradoBloqueado | null;
    }
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
    const cuerpo = (await cuerpoJson(respuesta)) as
      | { error?: string }
      | null;
    const motivo = cuerpo?.error ?? "conflicto";

    return {
      estado: "conflicto",
      motivo,
      bloqueo:
        motivo === "tiene_dependientes"
          ? (cuerpo as BorradoBloqueado)
          : null,
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
 * Los 409 que esta API sabe contestar, dichos para quien mira la pantalla.
 *
 * El que falta —el borrado bloqueado de T-6— no está acá porque su frase
 * sale del `bloqueo` que viaja con él, no del motivo a secas: es el que cae
 * en el texto de reserva.
 */
const CONFLICTOS: Record<string, string> = {
  sin_etapas_pendientes: "Este proceso ya no tiene etapas por delante.",
  pendiente_ya_cerrado:
    "Ese pendiente ya estaba cerrado, y un pendiente cerrado no se vuelve a" +
    " cerrar ni se reabre. Hay que volver a cargar el proceso para ver quién" +
    " lo cerró.",
};

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
      // Tres motivos ya, así que un mapa en vez de un ternario anidado: el
      // ternario de tres ramas es donde el día que aparezca el cuarto
      // alguien lo cuelga de la rama equivocada.
      return (
        CONFLICTOS[resultado.motivo] ??
        "No se pudo borrar: hay datos que dependen de esto."
      );
    case "falla":
      return `No se pudo consultar: ${resultado.mensaje}`;
  }
}
