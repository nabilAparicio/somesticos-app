/**
 * Las rutas HTTP de la bitácora. Cinco, y las cinco de lectura:
 *
 *   GET /api/procesos/{id}/bitacora       qué pasó con este proceso
 *   GET /api/clientes/{id}/bitacora       quién tocó esta ficha
 *   GET /api/areas/{id}/bitacora          qué le pasó a esta área
 *   GET /api/tipos-cliente/{id}/bitacora  …y a este tipo de cliente
 *   GET /api/tipos-proceso/{id}/bitacora  …y a este tipo de proceso
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
 * Cada una cuelga de **su entidad**, no de una colección propia, por la
 * misma razón que las notas: la bitácora de una entidad no existe fuera de
 * ella, y el 404 de la entidad ajena protege la historia entera sin un
 * segundo filtro. T-10 dejó escrito acá que los catálogos registraban sus
 * hechos sin pantalla que los mostrara y que el día que la tuvieran la ruta
 * se agregaba en este archivo; T-15 es ese día, y los datos ya estaban.
 *
 * **Lo que la forma cuesta, dicho para que sea una decisión.** Si la
 * dirección cuelga de la entidad, una fila **borrada de verdad** deja sus
 * entradas en la tabla —la de `borrado` incluida— y se queda sin dirección
 * por donde pedirlas. No se arregla aflojando la comprobación de existencia:
 * contestar 200 con una lista vacía confirmaría que ese identificador existe
 * en alguna parte, que es exactamente la fuga que el 404 niega. Y la
 * política de borrado de T-6 lo vuelve raro en la práctica: una fila con
 * dependientes no se borra, se da de baja, y la dada de baja conserva su
 * dirección.
 *
 * Todo esto corre **después** de la puerta de Access.
 *
 *  - **404** para lo que es de otro tenant, igual que T-5 a T-9: un 403
 *    confirmaría que ese identificador existe.
 *  - **405** con `allow: GET` para cualquier escritura, que es donde vive,
 *    dicho en un código de estado, que una entrada no se edita ni se borra.
 */

import type { EntidadRegistrada, RespuestaDeBitacora } from "../contract";
import type { ServicioDeCatalogos } from "../catalogos/repositorio";
import type { ServicioDeClientes } from "../clientes/repositorio";
import type { ServicioDeProcesos } from "../procesos/repositorio";
import type { ServicioDeBitacora } from "./repositorio";

/**
 * Cómo se llama cada entidad del vocabulario en la barra de direcciones.
 *
 * Se escribe en este sentido —entidad a colección— y no al revés para que el
 * `satisfies` lo vuelva **exhaustivo**: agregar una entidad a
 * `EntidadRegistrada` sin decir por qué dirección se lee deja de compilar.
 * Al revés, un `Record<string, EntidadRegistrada>` aceptaría una entidad sin
 * ruta y el hueco se descubriría en producción, como un 404 que nadie
 * entiende.
 */
const COLECCION_POR_ENTIDAD = {
  proceso: "procesos",
  cliente: "clientes",
  area: "areas",
  tipo_cliente: "tipos-cliente",
  tipo_proceso: "tipos-proceso",
} as const satisfies Record<EntidadRegistrada, string>;

/**
 * El mismo mapa dado vuelta, que es como lo lee una URL. Derivado y no
 * copiado: una segunda lista a mano es la que se desincroniza.
 */
const ENTIDAD_POR_COLECCION = new Map<string, EntidadRegistrada>(
  Object.entries(COLECCION_POR_ENTIDAD).map(([entidad, coleccion]) => [
    coleccion,
    entidad as EntidadRegistrada,
  ]),
);

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

interface Puertos {
  readonly procesos: ServicioDeProcesos;
  readonly clientes: ServicioDeClientes;
  readonly catalogos: ServicioDeCatalogos;
}

/**
 * Si esa fila existe **en este tenant**.
 *
 * Es la única guarda que separa la historia del bufete de la del vecino: con
 * `false` sale un 404, y con un 404 el identificador ajeno no queda
 * confirmado. Un 403 sí lo confirmaría, y una lista vacía con 200 también.
 */
async function existeLaFila(
  entidad: EntidadRegistrada,
  tenantId: string,
  id: string,
  puertos: Puertos,
): Promise<boolean> {
  switch (entidad) {
    case "proceso":
      return (await puertos.procesos.obtener(tenantId, id)) !== null;
    case "cliente":
      return (await puertos.clientes.obtener(tenantId, id)) !== null;
    case "area":
      return (await puertos.catalogos.obtenerArea(tenantId, id)) !== null;
    case "tipo_cliente":
      return (await puertos.catalogos.obtenerTipoCliente(tenantId, id)) !== null;
    case "tipo_proceso":
      return (await puertos.catalogos.obtenerTipoProceso(tenantId, id)) !== null;
  }
}

/**
 * Devuelve `null` cuando la ruta no es de bitácora, para que quien llama
 * siga buscando y termine en su propio 404.
 *
 * Recibe los puertos de las entidades que la exponen, y solo para comprobar
 * que existen **en este tenant**: la existencia manda sobre todo lo demás,
 * decisión de T-5.
 */
export async function rutasDeBitacora(
  request: Request,
  url: URL,
  tenantId: string,
  procesos: ServicioDeProcesos,
  clientes: ServicioDeClientes,
  catalogos: ServicioDeCatalogos,
  bitacora: ServicioDeBitacora,
): Promise<Response | null> {
  const segmentos = segmentosDe(url.pathname);
  if (segmentos[0] !== "api") return null;
  if (segmentos.length !== 4) return null;
  if (segmentos[3] !== "bitacora") return null;

  const entidad = ENTIDAD_POR_COLECCION.get(segmentos[1]);
  if (entidad === undefined) return null;

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

  // Un `switch` exhaustivo y no un mapa de funciones: así una entidad nueva
  // en el vocabulario no compila hasta que alguien diga **cómo se comprueba
  // que existe**. Ése es el único lugar donde se decide si la historia de
  // una fila se puede leer, y una entidad que entrara con la comprobación
  // en blanco sería la fuga, no un descuido menor.
  //
  // Sin `try`/`catch`: la guarda se cuenta, no se atrapa. Si el puerto
  // falla, que falle visible.
  const existe = await existeLaFila(entidad, tenantId, id, {
    procesos,
    clientes,
    catalogos,
  });

  if (!existe) return noEncontrado();

  const cuerpo: RespuestaDeBitacora = {
    entradas: await bitacora.listar(tenantId, entidad, id),
  };

  return json(cuerpo);
}
