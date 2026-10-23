/**
 * Las rutas HTTP de la bitácora. Dos, y las dos de lectura:
 *
 *   GET /api/procesos/{id}/bitacora   qué pasó con este proceso
 *   GET /api/clientes/{id}/bitacora   quién tocó esta ficha
 *
 * **Y nada más.** No hay `POST`, ni `PUT`, ni `PATCH`, ni `DELETE`, ni
 * `/api/bitacora`, ni dirección propia de una entrada. Es la misma forma que
 * T-8 le dio a las notas y por un argumento más fuerte: una entrada de
 * bitácora no la escribe una persona, la escribe el sistema al hacer otra
 * cosa. Un `POST` acá sería una segunda forma de registrar un hecho —la
 * primera es `BaseDeDatos.mutar`— y, peor, una forma de registrar un hecho
 * que no pasó.
 *
 * La inmutabilidad acá es **la ausencia del camino**; en la base son los dos
 * disparadores de `migrations/0002_bitacora_inmutable.sql`. Las dos cosas
 * hacen falta: sin la ruta, la consola de D1 seguiría pudiendo reescribir; y
 * sin los disparadores, la próxima ruta que alguien agregue podría.
 *
 * Cuelgan del **proceso** y del **cliente**, no de una colección propia, por
 * la misma razón que las notas: la bitácora de una entidad no existe fuera
 * de ella, y el 404 de la entidad ajena protege la historia entera sin un
 * segundo filtro. Las entidades de catálogo —áreas, tipos— registran sus
 * hechos pero todavía no tienen pantalla; el día que la tengan, la ruta se
 * agrega acá y los datos ya están.
 *
 * Todo esto corre **después** de la puerta de Access.
 *
 *  - **404** para lo que es de otro tenant, igual que T-5 a T-9: un 403
 *    confirmaría que ese identificador existe.
 *  - **405** con `allow: GET` para cualquier escritura, que es donde vive,
 *    dicho en un código de estado, que una entrada no se edita ni se borra.
 */

import type { EntidadRegistrada, RespuestaDeBitacora } from "../contract";
import type { ServicioDeClientes } from "../clientes/repositorio";
import type { ServicioDeProcesos } from "../procesos/repositorio";
import type { ServicioDeBitacora } from "./repositorio";

const SIN_CACHE = { "cache-control": "no-store" } as const;

function json(cuerpo: unknown, init?: ResponseInit): Response {
  const respuesta = Response.json(cuerpo, init);
  respuesta.headers.set("cache-control", "no-store");
  return respuesta;
}

function noEncontrado(): Response {
  return json({ error: "not_found" }, { status: 404 });
}

/**
 * Los segmentos de la ruta, sin la barra final.
 *
 * No se filtran los vacíos: `/api/procesos//bitacora` tiene que caer en
 * «desconocida» y no en «la bitácora del proceso de identificador vacío».
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

/**
 * Devuelve `null` cuando la ruta no es de bitácora, para que quien llama
 * siga buscando y termine en su propio 404.
 *
 * Recibe los dos puertos de las entidades que la exponen, y solo para
 * comprobar que existen **en este tenant**: la existencia manda sobre todo
 * lo demás, decisión de T-5.
 */
export async function rutasDeBitacora(
  request: Request,
  url: URL,
  tenantId: string,
  procesos: ServicioDeProcesos,
  clientes: ServicioDeClientes,
  bitacora: ServicioDeBitacora,
): Promise<Response | null> {
  const segmentos = segmentosDe(url.pathname);
  if (segmentos[0] !== "api") return null;
  if (segmentos.length !== 4) return null;
  if (segmentos[3] !== "bitacora") return null;

  const entidad: EntidadRegistrada | null =
    segmentos[1] === "procesos"
      ? "proceso"
      : segmentos[1] === "clientes"
        ? "cliente"
        : null;
  if (entidad === null) return null;

  const id = decodificar(segmentos[2]);
  if (id === null) return noEncontrado();

  if (request.method !== "GET") {
    // Acá vive, dicho en un código de estado, que una entrada de bitácora no
    // se escribe a mano, no se edita y no se borra. No es una validación ni
    // un `catch`: es que el verbo no existe.
    return json(
      { error: "method_not_allowed" },
      { status: 405, headers: { allow: "GET", ...SIN_CACHE } },
    );
  }

  const existe =
    entidad === "proceso"
      ? (await procesos.obtener(tenantId, id)) !== null
      : (await clientes.obtener(tenantId, id)) !== null;

  if (!existe) return noEncontrado();

  const cuerpo: RespuestaDeBitacora = {
    entradas: await bitacora.listar(tenantId, entidad, id),
  };

  return json(cuerpo);
}
