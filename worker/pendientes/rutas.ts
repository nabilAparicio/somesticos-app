/**
 * Las rutas HTTP de los pendientes de un proceso. Traduce peticiones a
 * llamadas del puerto y resultados a respuestas; no decide ninguna regla de
 * negocio.
 *
 *   GET  /api/procesos/{id}/pendientes                 los del proceso
 *   POST /api/procesos/{id}/pendientes                 anota un cabo suelto
 *   POST /api/procesos/{id}/pendientes/{pid}/cerrar    lo cierra, firmado
 *
 * **Y nada más. No hay `PUT`, ni `PATCH`, ni `DELETE`, ni `reabrir`.** Un
 * pendiente se abre y se cierra, y el cierre es de una sola dirección: es la
 * decisión de T-9, y vive acá como la **ausencia del camino**, igual que la
 * inmutabilidad de una nota en T-8. `/pendientes/{pid}/reabrir` no es
 * ninguna ruta, así que cae en el 404 general; los métodos de escritura
 * sobre la colección contestan 405.
 *
 * `cerrar` es un `POST` a una subruta y no un `PATCH` al pendiente por lo
 * mismo que `avanzar` en T-7: es una transición de estado de una sola
 * dirección, no una edición. Darle al pendiente una dirección propia con
 * verbos de edición sería estrenar la superficie sobre la que mañana alguien
 * cuelga un `DELETE`.
 *
 * Cuelgan del **proceso** y no de `/api/pendientes` porque un pendiente no
 * existe fuera de su proceso, y el 404 del proceso ajeno protege la lista
 * entera sin un segundo filtro.
 *
 * Todo esto corre **después** de la puerta de Access: la identidad llega
 * resuelta como argumento. El autor y quien cierra salen de ahí y nunca del
 * cuerpo (I-6).
 *
 * Los códigos que esta capa elige, y por qué:
 *
 *  - **404** para un proceso —o un pendiente— de otro tenant, igual que T-5,
 *    T-6, T-7 y T-8: un 403 confirmaría que ese identificador existe.
 *  - **422** para un cuerpo que no se acepta, incluido el proceso que
 *    todavía no tiene plan del que colgar el pendiente.
 *  - **409** para cerrar algo que ya estaba cerrado: la petición está bien
 *    formada y el estado es el que no la admite, igual que el avance de un
 *    plan sin pendientes en T-7.
 *  - **201** en el alta y **200** en el cierre, los dos con la lista entera
 *    en el cuerpo. Sin `location`: un pendiente no tiene dirección propia, y
 *    fabricar una sería prometer un `GET` que no existe.
 */

import type {
  DatosInvalidos,
  FallaDeValidacion,
  PendienteYaCerrado,
  RespuestaDePendientes,
} from "../contract";
import type { Identidad } from "../acceso/identidad";
import type { ServicioDeProcesos } from "../procesos/repositorio";
import { normalizarPendiente } from "./dominio";
import type {
  ResultadoDePendiente,
  ServicioDePendientes,
} from "./repositorio";

const SIN_CACHE = { "cache-control": "no-store" } as const;

function json(cuerpo: unknown, init?: ResponseInit): Response {
  const respuesta = Response.json(cuerpo, init);
  respuesta.headers.set("cache-control", "no-store");
  return respuesta;
}

function invalido(fallas: FallaDeValidacion[]): Response {
  const cuerpo: DatosInvalidos = { error: "datos_invalidos", fallas };
  return json(cuerpo, { status: 422 });
}

function noEncontrado(): Response {
  return json({ error: "not_found" }, { status: 404 });
}

/**
 * Los segmentos de la ruta, sin la barra final.
 *
 * No se filtran los vacíos: `/api/procesos//pendientes` tiene que caer en
 * «desconocida» y no en «los pendientes del proceso de identificador vacío».
 */
function segmentosDe(pathname: string): string[] {
  return pathname.replace(/\/+$/, "").split("/").slice(1);
}

function decodificar(segmento: string): string | null {
  if (segmento === "") return null;
  try {
    const valor = decodeURIComponent(segmento);
    return valor === "" ? null : valor;
  } catch {
    // `decodeURIComponent` tira con un porcentaje mal escrito ("%ZZ"), que
    // es lo que llega cuando alguien edita la barra de direcciones a mano.
    return null;
  }
}

function respuestaDeEscritura(
  resultado: ResultadoDePendiente,
  estadoDeExito: number,
): Response {
  if (resultado.estado === "no_encontrado") return noEncontrado();
  if (resultado.estado === "invalido") return invalido(resultado.fallas);
  if (resultado.estado === "ya_cerrado") {
    const cuerpo: PendienteYaCerrado = { error: "pendiente_ya_cerrado" };
    return json(cuerpo, { status: 409 });
  }

  const cuerpo: RespuestaDePendientes = { pendientes: resultado.pendientes };
  return json(cuerpo, { status: estadoDeExito });
}

/**
 * Devuelve `null` cuando la ruta no es de pendientes, para que quien llama
 * siga buscando y termine en su propio 404.
 *
 * Recibe **dos** puertos: el de procesos solo para comprobar que el proceso
 * existe en este tenant —la existencia manda sobre la validación del cuerpo,
 * decisión de T-5— y el de pendientes para lo demás.
 */
export async function rutasDePendientes(
  request: Request,
  url: URL,
  identidad: Identidad,
  tenantId: string,
  procesos: ServicioDeProcesos,
  pendientes: ServicioDePendientes,
): Promise<Response | null> {
  const segmentos = segmentosDe(url.pathname);
  if (segmentos[0] !== "api") return null;
  if (segmentos[1] !== "procesos") return null;
  if (segmentos[3] !== "pendientes") return null;

  // Cuatro segmentos es la colección; seis es una acción sobre uno. Cinco
  // —`/pendientes/{pid}` a secas— no es ninguna ruta: un pendiente no tiene
  // dirección propia, y por eso no hay dónde colgar un `PUT` ni un `DELETE`.
  const esColeccion = segmentos.length === 4;
  const esAccion = segmentos.length === 6;
  if (!esColeccion && !esAccion) return null;
  if (esAccion && segmentos[5] !== "cerrar") return null;

  const procesoId = decodificar(segmentos[2]);
  if (procesoId === null) return noEncontrado();

  if (esColeccion && request.method !== "GET" && request.method !== "POST") {
    // Acá vive, dicho en un código de estado, que un pendiente no se edita
    // ni se borra en bloque. No es un `catch` ni una validación: es que el
    // verbo no existe.
    return json(
      { error: "method_not_allowed" },
      { status: 405, headers: { allow: "GET, POST", ...SIN_CACHE } },
    );
  }

  if (esAccion && request.method !== "POST") {
    return json(
      { error: "method_not_allowed" },
      { status: 405, headers: { allow: "POST", ...SIN_CACHE } },
    );
  }

  if ((await procesos.obtener(tenantId, procesoId)) === null) {
    return noEncontrado();
  }

  if (esAccion) {
    const pendienteId = decodificar(segmentos[4]);
    if (pendienteId === null) return noEncontrado();

    // Quien cierra sale de la identidad de Access, nunca del cuerpo: el
    // `CHECK` del esquema exige `cerrado_por` junto con `cerrado_en`, y una
    // firma que el cliente pudiera elegir no es una firma.
    return respuestaDeEscritura(
      await pendientes.cerrar(
        tenantId,
        procesoId,
        pendienteId,
        identidad.usuarioId,
      ),
      200,
    );
  }

  if (request.method === "GET") {
    const cuerpo: RespuestaDePendientes = {
      pendientes: await pendientes.listar(tenantId, procesoId),
    };
    return json(cuerpo);
  }

  let leido: unknown;
  try {
    leido = await request.json();
  } catch {
    // 400 y no 422: 422 dice «entendí el cuerpo y no me sirve»; esto es «no
    // pude ni leerlo».
    return json({ error: "cuerpo_invalido" }, { status: 400 });
  }

  const normalizado = normalizarPendiente(leido);
  if (!normalizado.ok) return invalido(normalizado.fallas);

  // El autor sale de la identidad de Access, nunca del cuerpo (I-6).
  return respuestaDeEscritura(
    await pendientes.crear(
      tenantId,
      procesoId,
      identidad.usuarioId,
      normalizado.datos,
    ),
    201,
  );
}
