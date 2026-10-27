/**
 * Las rutas HTTP de la bitácora. Siete, y las siete de lectura:
 *
 *   GET /api/procesos/{id}/bitacora       qué pasó con este proceso
 *   GET /api/clientes/{id}/bitacora       quién tocó esta ficha
 *   GET /api/areas/{id}/bitacora          qué le pasó a esta área
 *   GET /api/tipos-cliente/{id}/bitacora  …y a este tipo de cliente
 *   GET /api/tipos-proceso/{id}/bitacora  …y a este tipo de proceso
 *   GET /api/cotizaciones/{id}/bitacora   qué le pasó a esta cotización
 *   GET /api/arancel/{id}/bitacora        quién le puso este precio
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

import {
  LIMITE_DE_BITACORA_POR_DEFECTO,
  TECHO_DEL_LIMITE_DE_BITACORA,
  type EntidadRegistrada,
  type RespuestaDeBitacora,
} from "../contract";
import type { ServicioDeArancel } from "../arancel/repositorio";
import type { ServicioDeCatalogos } from "../catalogos/repositorio";
import type { ServicioDeClientes } from "../clientes/repositorio";
import type { ServicioDeCotizaciones } from "../cotizaciones/repositorio";
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
  cotizacion: "cotizaciones",
  // El arancel de honorarios (T-2 de `odd/tasks/arancel-de-honorarios.md`).
  // La colección es `arancel` en singular porque la dirección de la tabla
  // entera es `/api/arancel`: es **un** documento con renglones, no una
  // colección de aranceles.
  arancel_renglon: "arancel",
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

/**
 * El tope de la página, leído de `?limite=` (T-17).
 *
 * Devuelve `null` cuando lo que llegó no es un tope servible, y ahí está la
 * guarda entera: **se cuenta, no se atrapa**. Un `?limite=abc` no llega a
 * SQL para que la base se queje; se mira acá y se contesta. Sin esto,
 * `?limite=100000` sería una consulta sin fondo escrita por cualquiera que
 * sepa editar la barra de direcciones.
 *
 * `/^[1-9][0-9]*$/` y no `Number.parseInt`: `parseInt` acepta `"12abc"`,
 * `" 12"`, `"0x10"` y `"1e3"`, y `Number` acepta además `"1.0"` y `" "`. Un
 * tope es un entero positivo escrito en decimal y nada más; cualquier otra
 * cosa es una dirección mal armada, no un número raro que haya que
 * interpretar.
 *
 * El techo **rechaza** en vez de recortar en silencio. Recortar le daría al
 * llamante una página más chica que la que pidió sin decírselo, y una
 * pantalla que cree tener los 100000 hechos cuando tiene 500 miente sobre lo
 * que muestra. Que el techo esté en `worker/contract.ts` es lo que deja que
 * la pantalla pida como mucho lo que el servidor sirve.
 */
function limiteDe(url: URL): number | null {
  const crudo = url.searchParams.get("limite");
  if (crudo === null) return LIMITE_DE_BITACORA_POR_DEFECTO;

  if (!/^[1-9][0-9]*$/.test(crudo)) return null;

  const limite = Number(crudo);
  return limite <= TECHO_DEL_LIMITE_DE_BITACORA ? limite : null;
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
  readonly cotizaciones: ServicioDeCotizaciones;
  readonly arancel: ServicioDeArancel;
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
    case "cotizacion":
      return (await puertos.cotizaciones.obtener(tenantId, id)) !== null;
    case "arancel_renglon":
      return (await puertos.arancel.obtener(tenantId, id)) !== null;
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
  cotizaciones: ServicioDeCotizaciones,
  arancel: ServicioDeArancel,
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

  // Antes de preguntarle nada al dominio: un tope mal escrito se contesta
  // sin leer la historia de nadie. Y con 400 y no 422, que acá es la
  // distinción que importa: el 422 de esta API lleva `fallas` con un `campo`
  // que una pantalla subraya debajo del control que lo produjo, y `limite`
  // no es un campo que nadie escriba — es parte de la dirección. Decirlo con
  // el vocabulario de los formularios obligaría además a inventar un
  // `MotivoDeFalla` que ningún formulario puede llegar a mostrar.
  const limite = limiteDe(url);
  if (limite === null) {
    return json({ error: "limite_invalido" }, { status: 400 });
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
    cotizaciones,
    arancel,
  });

  if (!existe) return noEncontrado();

  const pagina = await bitacora.listar(tenantId, entidad, id, limite);

  // Se copia campo a campo en vez de devolver la página tal cual: lo que el
  // puerto produce y lo que la API promete son dos cosas que hoy coinciden,
  // y el día que dejen de coincidir el compilador lo dice acá.
  const cuerpo: RespuestaDeBitacora = {
    entradas: pagina.entradas,
    total: pagina.total,
  };

  return json(cuerpo);
}
