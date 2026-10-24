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
  NombreDuplicado,
} from "../../worker/contract";
import { mensajeDeNombreDuplicado } from "../mensajes";

export type Resultado<T> =
  | { estado: "ok"; valor: T }
  | { estado: "invalido"; fallas: FallaDeValidacion[] }
  /**
   * 409: la petición está bien formada y el estado es el que no la admite.
   *
   * Hay varios, y por eso viaja `motivo`: el borrado de un catálogo que
   * chocó con dependientes (`tiene_dependientes`, T-6), el avance de un
   * proceso que ya no tiene etapas por delante (`sin_etapas_pendientes`,
   * T-7) y el nombre de catálogo ya tomado dentro del bufete
   * (`nombre_duplicado` y `nombre_duplicado_de_baja`, T-12) y la edición de
   * una cotización que ya salió del borrador (`cotizacion_no_es_borrador`,
   * tajada 2).
   *
   * Los dos detalles son nulos salvo en el 409 que los trae. Son campos
   * distintos y no uno solo porque son formas distintas: unificarlos en un
   * `detalle: unknown` obligaría a cada pantalla a adivinar cuál le tocó, y
   * la adivinanza se resuelve mal el día que aparezca el tercero.
   */
  | {
      estado: "conflicto";
      motivo: string;
      bloqueo: BorradoBloqueado | null;
      duplicado: NombreDuplicado | null;
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
      duplicado:
        motivo === "nombre_duplicado" || motivo === "nombre_duplicado_de_baja"
          ? (cuerpo as NombreDuplicado)
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
 * Los 409 que esta API sabe contestar **con el motivo a secas**, dichos para
 * quien mira la pantalla.
 *
 * Los dos que faltan son los que traen un detalle y arman la frase con él:
 * el borrado bloqueado de T-6, cuya frase necesita además el nombre de la
 * fila que la pantalla está mirando y por eso se compone allá; y el nombre
 * duplicado de T-12, que trae el suyo y se resuelve más abajo.
 *
 * ## Por qué sigue siendo `Record<string, string>` y no un `satisfies`
 *
 * Un `as const satisfies Record<MotivoDeConflicto, string>` —lo que
 * `COLECCION_POR_ENTIDAD` hace en `worker/bitacora/rutas.ts`— lo volvería
 * exhaustivo y un 409 nuevo no compilaría hasta tener texto, que es
 * exactamente lo que faltó acá: `cotizacion_no_es_borrador` existía desde
 * T-2 A y caía en el texto de reserva, que habla de un borrado que nadie
 * pidió.
 *
 * **Lo que lo frena es que ese tipo no existe.** Los ocho `error` de
 * `worker/contract.ts` no tienen hoy una unión que los junte, y el `Record`
 * exhaustivo tendría que excluir además los tres que no se resuelven acá
 * —`tiene_dependientes` y los dos de nombre duplicado— más los dos que la
 * pantalla de procesos atiende en su propio mapa (`proceso_cerrado` y
 * `proceso_abierto`). O sea: declarar un `MotivoDeConflicto` en el contrato
 * del Worker y repartir de nuevo cinco motivos de la tajada 1 entre tres
 * mapas. Es un cambio del contrato y de las pantallas de procesos, no de
 * este archivo, y por eso queda anotado y no hecho.
 */
const CONFLICTOS: Record<string, string> = {
  sin_etapas_pendientes: "Este proceso ya no tiene etapas por delante.",
  pendiente_ya_cerrado:
    "Ese pendiente ya estaba cerrado, y un pendiente cerrado no se vuelve a" +
    " cerrar ni se reabre. Hay que volver a cargar el proceso para ver quién" +
    " lo cerró.",
  /*
   * La carrera perdida de la edición: alguien emitió, ganó o perdió esta
   * cotización mientras el formulario estaba abierto. El estado en el que
   * quedó **viaja en el cuerpo del 409** y no llega hasta acá —`Resultado`
   * conserva el motivo y dos detalles, y éste no es ninguno de los dos—, así
   * que la frase no lo puede nombrar y por eso manda a recargar. La pantalla
   * que sí lo sabe es la de edición, que lee el estado antes de dibujar el
   * formulario y lo dice con todas las letras (`avisoDeNoEsBorrador`); esto
   * es la red de abajo, para el instante entre esa lectura y el envío.
   */
  cotizacion_no_es_borrador:
    "Esta cotización ya no es un borrador, y lo que salió del borrador no se" +
    " edita: su contenido es el registro de lo que se mandó. Hay que volver" +
    " a cargarla para ver en qué estado quedó y quién la movió.",
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
      // El nombre duplicado se resuelve acá y no en cada pantalla, al revés
      // que el borrado bloqueado: su frase se arma entera con lo que trae la
      // respuesta, así que no necesita nada del componente. Dejárselo a cada
      // llamador sería repetir la misma rama en dos archivos y descubrir el
      // día que aparezca el tercero que a ese se le olvidó — y lo que se
      // vería entonces es el texto de reserva, que habla de un borrado que
      // nadie pidió.
      if (resultado.duplicado !== null) {
        return mensajeDeNombreDuplicado(resultado.duplicado);
      }

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
