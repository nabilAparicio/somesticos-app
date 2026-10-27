/**
 * Las rutas HTTP de las plantillas de módulo. Traduce peticiones a llamadas
 * del puerto y resultados a respuestas; no decide ninguna regla de negocio.
 *
 *   GET  /api/plantillas-modulo         el catálogo entero, en su orden
 *   POST /api/plantillas-modulo         una plantilla propia del bufete
 *   PUT  /api/plantillas-modulo/{id}    el rótulo, la descripción, la vigencia
 *
 * `plantillas-modulo` y no `plantillas` a secas, y el nombre lo eligió T-1 al
 * entrar la entidad al vocabulario: en este sistema «plantilla» ya está tomada
 * dos veces —`etapa_plantilla` y los verbos `plantilla_editada` y
 * `plantilla_guardada`, que son de las etapas de un tipo de proceso— y una
 * dirección ambigua es la que alguien lee al revés.
 *
 * ## Hay `POST` desde T-7, y no hay `DELETE` nunca
 *
 *  - **`POST` llegó con `0017`.** El alta faltaba por alcance y no por diseño:
 *    crear una plantilla necesita una `clave` derivada del rótulo, y mientras
 *    `cotizacion_modulo.tipo` estuvo cerrado por el `CHECK` de `0004` un alta
 *    habría sido ofrecerle al editor una clave que la base rechaza al guardar
 *    el primer módulo. `0017` convirtió esa columna en `plantilla_id`, una
 *    referencia a esta tabla, así que la plantilla nueva se puede usar el
 *    mismo día que nace. Las palabras del usuario al mirar la pantalla sin
 *    alta: «No veo la opción de crear un módulo, sólo editar y dar de baja.»
 *  - **`DELETE` nunca.** Una plantilla borrada deja sin rótulo los módulos de
 *    las cotizaciones vivas —y desde `0017`, con una llave foránea rota—. La
 *    salida es `activo = 0`, que llega por el `PUT`, y
 *    `modulo_plantilla_no_se_borra` lo aborta en la base.
 *
 * ## La clave no se teclea, y los dos 422 que eso trae
 *
 * El cuerpo del `POST` lleva **el rótulo y la descripción, y nada más**. La
 * clave la acuña `acunarClave` del dominio, y no hay campo para escribirla:
 * es inmutable desde que nace —`modulo_plantilla_clave_inmutable`—, así que un
 * campo para tipearla sería un campo cuyo error no se puede corregir después.
 *
 * Eso trae dos negativas que **tienen que ser 422 y no 500**, y son dos
 * problemas distintos con dos frases distintas:
 *
 *  - **El rótulo del que no sale ninguna clave** —solo signos, solo emoji—.
 *    Se decide sobre el cuerpo, sin consultar: `rotulo_sin_clave`.
 *  - **La clave que ya está tomada**, que es un hecho de la base y se cuenta
 *    antes de escribir: `clave_de_modulo_tomada`. Incluye el choque contra una
 *    plantilla **dada de baja** y contra uno de los seis presets, porque
 *    `modulo_plantilla_clave_unica` no mira `activo`.
 *
 * Los dos son 422 y no 409, al revés que los dos conflictos del `PUT`, y la
 * distinción es la que esta API ya tiene escrita: 422 dice «entendí el cuerpo
 * y **hay un dato que arreglar**», y acá lo hay —el rótulo, que es
 * precisamente el campo que la persona está escribiendo—. Los dos 409 del
 * `PUT` son lo contrario: el cuerpo está impecable y lo que no admite la
 * escritura es el estado de la fila.
 *
 * El cuerpo que pretende traer la `clave` o el preset puestos **sí** es el
 * mismo 409 `plantilla_inmutable` de la edición: ahí no hay dato que arreglar,
 * porque esas tres columnas no las escribe nadie desde acá.
 *
 * ## La baja y la reactivación van por el `PUT`, y no por una ruta propia
 *
 * Se consideraron las dos formas. La elegida es la que **los tres catálogos de
 * T-6 ya usan** —`PUT /api/areas/{id}` «incluye dar de baja», dice su
 * encabezado—, y lo que decide no es la simetría sino que la infraestructura
 * ya está construida alrededor de ella:
 *
 *  - `accionDeEdicion` en `worker/bitacora/vocabulario.ts` existe exactamente
 *    para esto: mira cómo quedó `activo` respecto de cómo estaba y elige entre
 *    `editado`, `dado_de_baja` y `reactivado`. Con rutas propias habría que
 *    emitir el verbo a mano en cada una, y el día que apareciera la tercera
 *    operación alguien lo emitiría mal.
 *  - El cuerpo del `PUT` manda el juego completo de lo editable —la decisión
 *    de T-5, `PUT` y no `PATCH`— así que `activo` ya viaja. Una ruta
 *    `/baja` al lado dejaría dos caminos para escribir la misma columna, y dos
 *    caminos es donde uno aprende algo que el otro no.
 *  - La pantalla manda una sola escritura. Con rutas separadas, cambiar el
 *    rótulo y dar de baja en el mismo gesto serían dos peticiones y dos
 *    entradas de bitácora de lo que la persona vivió como un acto.
 *
 * Lo que la forma cuesta, dicho en vez de callado: un cliente que quiera dar
 * de baja tiene que mandar también el rótulo y la descripción, porque mandar
 * el cuerpo a medias las vaciaría —vacío significa NULL, que es el preset—.
 * Eso es exactamente lo que `PUT` promete y lo que la pantalla hace, y es el
 * mismo costo que los catálogos de T-6 pagan desde entonces.
 *
 * ## Los códigos que esta capa elige, y por qué
 *
 *  - **404** para lo que es de otro bufete, igual que en todo lo demás: un 403
 *    confirmaría que ese identificador existe.
 *  - **422** para un cuerpo que no se entiende: un `rotulo` que no es texto,
 *    un `activo` que no es booleano. Es «hay un dato que arreglar».
 *  - **409 `plantilla_inmutable`** para el cuerpo que pretende escribir la
 *    `clave` o el preset. 409 y no 422 por la distinción que esta API ya usa:
 *    acá **no hay dato que arreglar**, porque esos campos no se escriben
 *    nunca. Es la misma familia que `renglon_citado`.
 *  - **409 `plantilla_sin_preset`** para el vaciado que dejaría la fila sin
 *    valor vigente, por lo mismo: la cadena vacía es un valor impecable —en
 *    cinco de las seis filas significa «volver al original»— y lo que la
 *    rechaza es que esa fila no tiene piso debajo. Es la forma de
 *    `rubro_sin_precio`.
 *  - **405** con `allow:` para el verbo que no corresponde, y es distinto en
 *    la colección —solo `GET`— que en la plantilla —solo `PUT`—.
 *
 * En el `PUT`, la existencia se comprueba **antes** de revisar el cuerpo
 * (decisión de T-5): si no, un cuerpo inválido contra un id ajeno contestaría
 * 422 o 409, y cualquiera de los dos ya confirma que el id existe.
 */

import type {
  DatosInvalidos,
  FallaDeValidacion,
  PlantillaInmutable,
  PlantillaSinPreset,
  RespuestaDePlantillaDeModulo,
  RespuestaDePlantillasDeModulo,
} from "../contract";
import { revisarAltaDePlantilla, revisarPlantilla } from "./dominio";
import type { ServicioDePlantillas } from "./repositorio";

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

function metodoNoPermitido(permitidos: string): Response {
  return json(
    { error: "method_not_allowed" },
    { status: 405, headers: { allow: permitidos, ...SIN_CACHE } },
  );
}

type CuerpoLeido =
  | { ok: true; valor: unknown }
  | { ok: false; respuesta: Response };

async function leerCuerpo(request: Request): Promise<CuerpoLeido> {
  try {
    return { ok: true, valor: await request.json() };
  } catch {
    // 400 y no 422: 422 dice «entendí el cuerpo y no me sirve»; esto es «no
    // pude ni leerlo».
    return {
      ok: false,
      respuesta: json({ error: "cuerpo_invalido" }, { status: 400 }),
    };
  }
}

/**
 * Los segmentos de la ruta, sin la barra final.
 *
 * No se filtran los vacíos: `/api/plantillas-modulo//x` tiene que caer en
 * «desconocida» y no en «la plantilla de identificador vacío».
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
    // `decodeURIComponent` tira con un porcentaje mal escrito ("%ZZ"), que es
    // lo que llega cuando alguien edita la barra de direcciones a mano.
    return null;
  }
}

/**
 * El 409 de los tres campos que esta ruta no escribe nunca.
 *
 * Lo comparten el `PUT` y el `POST`, y es el mismo cuerpo en los dos: la
 * negativa que `0016:436` encarga a esta familia por su nombre —«el 409 que
 * T-2 va a contestar para que la pantalla pueda explicar qué pasó, en vez de
 * que un `UPDATE` muera acá y salga como un 500 de SQLite crudo»—. No se
 * descarta el campo en silencio con un 200, que es lo que le enseñaría a la
 * pantalla que la escritura funcionó.
 *
 * En el alta dice algo más fuerte que en la edición: ahí esas tres columnas
 * existen y no se escriben; acá dos de las tres —el preset— **nacen nulas a
 * propósito**, y fabricárselas desde el cuerpo sería sembrar un piso que nadie
 * publicó.
 */
function inmutable(campos: string[]): Response {
  const cuerpo: PlantillaInmutable = {
    error: "plantilla_inmutable",
    campos,
  };
  return json(cuerpo, { status: 409 });
}

/** El alta de una plantilla propia del bufete (T-7). */
async function manejarAlta(
  request: Request,
  tenantId: string,
  servicio: ServicioDePlantillas,
): Promise<Response> {
  const leido = await leerCuerpo(request);
  if (!leido.ok) return leido.respuesta;

  const revision = revisarAltaDePlantilla(leido.valor);
  if (revision.estado === "inmutable") return inmutable(revision.campos);
  if (revision.estado === "invalido") return invalido(revision.fallas);

  const resultado = await servicio.crear(tenantId, revision.datos);

  if (resultado.estado === "clave_tomada") {
    // La falla va sobre `rotulo` y no sobre una `clave` que el cuerpo no
    // trajo: el campo que se nombra tiene que ser el que la persona puede
    // corregir, y es el único que mandó.
    return invalido([{ campo: "rotulo", motivo: "clave_de_modulo_tomada" }]);
  }

  const cuerpo: RespuestaDePlantillaDeModulo = {
    plantilla: resultado.plantilla,
  };
  return json(cuerpo, {
    status: 201,
    headers: {
      location: `/api/plantillas-modulo/${resultado.plantilla.id}`,
      ...SIN_CACHE,
    },
  });
}

async function manejarPlantilla(
  request: Request,
  tenantId: string,
  id: string,
  servicio: ServicioDePlantillas,
): Promise<Response> {
  if (request.method !== "PUT") return metodoNoPermitido("PUT");

  const leido = await leerCuerpo(request);
  if (!leido.ok) return leido.respuesta;

  // Primero la existencia dentro del bufete, después el cuerpo.
  if ((await servicio.obtener(tenantId, id)) === null) return noEncontrado();

  const revision = revisarPlantilla(leido.valor);

  if (revision.estado === "inmutable") return inmutable(revision.campos);

  if (revision.estado === "invalido") return invalido(revision.fallas);

  const resultado = await servicio.guardar(tenantId, id, revision.datos);
  if (resultado.estado === "no_encontrado") return noEncontrado();

  if (resultado.estado === "sin_preset") {
    const cuerpo: PlantillaSinPreset = {
      error: "plantilla_sin_preset",
      campos: resultado.campos,
    };
    return json(cuerpo, { status: 409 });
  }

  const cuerpo: RespuestaDePlantillaDeModulo = { plantilla: resultado.plantilla };
  return json(cuerpo);
}

/**
 * Devuelve `null` cuando la ruta no es de plantillas, para que quien llama
 * siga buscando y termine en su propio 404.
 *
 * `segmentos.length === 4` devuelve `null` a propósito: ahí vive
 * `/api/plantillas-modulo/{id}/bitacora`, que es de `rutasDeBitacora`. Es el
 * mismo reparto que el arancel, los catálogos y las cotizaciones ya tenían, y
 * el orden en `worker/index.ts` no cambia qué contesta cada una — pero deja
 * escrito que esta ruta **no** se queda con su subruta.
 */
export function rutasDePlantillas(
  request: Request,
  url: URL,
  tenantId: string,
  servicio: ServicioDePlantillas,
): Promise<Response | null> {
  const segmentos = segmentosDe(url.pathname);
  if (segmentos[0] !== "api") return Promise.resolve(null);
  if (segmentos[1] !== "plantillas-modulo") return Promise.resolve(null);

  if (segmentos.length === 2) {
    if (request.method === "POST") {
      return manejarAlta(request, tenantId, servicio);
    }

    if (request.method !== "GET") {
      return Promise.resolve(metodoNoPermitido("GET, POST"));
    }

    return servicio.listar(tenantId).then((plantillas) => {
      const cuerpo: RespuestaDePlantillasDeModulo = { plantillas };
      return json(cuerpo);
    });
  }

  if (segmentos.length !== 3) return Promise.resolve(null);

  const id = decodificar(segmentos[2]);
  if (id === null) return Promise.resolve(noEncontrado());

  return manejarPlantilla(request, tenantId, id, servicio);
}
