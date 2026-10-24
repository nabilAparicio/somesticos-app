/**
 * Las rutas HTTP de las cotizaciones. Traduce peticiones a llamadas del
 * puerto y resultados a respuestas; no decide ninguna regla de negocio.
 *
 *   GET    /api/cotizaciones                      listado
 *   POST   /api/cotizaciones                      alta de un borrador
 *   GET    /api/cotizaciones/{id}                 detalle
 *   PUT    /api/cotizaciones/{id}                 edición de un borrador
 *   GET    /api/cotizaciones/{id}/modulos         los módulos, en su orden
 *   POST   /api/cotizaciones/{id}/modulos         agrega uno al final
 *   PUT    /api/cotizaciones/{id}/modulos         reordena la lista entera
 *   PUT    /api/cotizaciones/{id}/modulos/{mid}   edita uno
 *   DELETE /api/cotizaciones/{id}/modulos/{mid}   lo saca
 *
 * **Y nada más.** No hay ruta de emitir —es de T-4, con su propio disparador
 * de inmutabilidad en la base— ni de líneas, que son de T-3. La cuarta parte
 * de la dirección `/api/cotizaciones/{id}/bitacora` la atiende
 * `worker/bitacora/rutas.ts`, que corre antes y para la que este archivo
 * devuelve `null`: acá sólo se reconoce `modulos` en esa posición.
 *
 * ## Por qué el reordenamiento es un `PUT` a la colección
 *
 * Es el mismo precedente que el plan de un proceso (`PUT
 * /api/procesos/{id}/etapas`): el orden es una propiedad de **la lista**, no
 * de ningún módulo, así que la dirección a la que corresponde es la de la
 * lista. La alternativa —una subruta `/modulos/orden`— mete una cadena fija
 * en la misma posición donde van los identificadores, y quien lea el ruteo
 * tiene que saber que los identificadores son UUID para convencerse de que
 * nunca van a chocar. Una ambigüedad que se resuelve con un dato que está en
 * otro archivo no es una ambigüedad resuelta.
 *
 * Y este `PUT` **sólo reordena**: no reemplaza el contenido de la colección,
 * aunque la forma del verbo lo sugiera. Agregar, editar y quitar tienen sus
 * propias rutas porque la bitácora tiene que poder decir cuál de las cuatro
 * cosas pasó. Un `PUT` que mandara la lista entera con tipos y textos
 * aplastaría las cuatro preguntas en un solo hecho.
 *
 * Todo esto corre **después** de la puerta de Access: la identidad llega
 * resuelta como argumento, no como algo que este archivo tenga que ir a
 * buscar. El autor del borrador sale de ahí y nunca del cuerpo (I-6).
 *
 * `PUT` y no `PATCH`, por el mismo criterio de T-5: el formulario manda el
 * juego completo de campos editables, así que la semántica real es
 * reemplazar. Un `PATCH` obligaría a distinguir «no mandé el vencimiento» de
 * «lo quiero vacío», que es la ambigüedad por la que vaciar un dato no
 * funciona nunca.
 *
 * Los códigos que esta capa elige, y por qué:
 *
 *  - **404** para lo que es de otro bufete, igual que T-5 a T-10: un 403
 *    confirmaría que ese identificador existe.
 *  - **422** para un cuerpo que no se acepta, incluido el cliente que no es
 *    de este bufete.
 *  - **409** para editar algo que ya no es un borrador: la petición está
 *    bien formada y es el estado el que no la admite.
 *  - **201** en el alta, con `location`, porque sí hay un recurso al que
 *    apuntar.
 */

import type { Identidad } from "../acceso/identidad";
import type {
  CotizacionNoEsBorrador,
  DatosInvalidos,
  FallaDeValidacion,
  RespuestaDeCotizacion,
  RespuestaDeCotizaciones,
  RespuestaDeModulos,
} from "../contract";
import { ahoraIso, hoyEnPanama } from "../db/momentos";
import { normalizarCotizacion } from "./dominio";
import { normalizarModulo, normalizarOrdenDeModulos } from "./modulos";
import type {
  ResultadoDeEscritura,
  ResultadoDeModulos,
  ServicioDeCotizaciones,
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
    // pude ni leerlo». Es el único `catch` de este módulo, y no tapa ninguna
    // guarda de la base: tapa un JSON mal escrito.
    return {
      ok: false,
      respuesta: json({ error: "cuerpo_invalido" }, { status: 400 }),
    };
  }
}

/**
 * El 409 de tocar algo que ya salió del borrador.
 *
 * Lo comparten la edición de la cotización y las cuatro escrituras de
 * módulos, y está en una función y no copiado cuatro veces por lo mismo que
 * `procesoCerrado` en las rutas de proceso: de dónde se chocó contra el
 * estado no cambia qué tiene que leer quien está mirando la pantalla.
 */
function noEsBorrador(estado: CotizacionNoEsBorrador["estado"]): Response {
  const cuerpo: CotizacionNoEsBorrador = {
    error: "cotizacion_no_es_borrador",
    estado,
  };
  return json(cuerpo, { status: 409 });
}

function respuestaDeEscritura(
  resultado: ResultadoDeEscritura,
  estadoAlGuardar: 200 | 201,
): Response {
  if (resultado.estado === "no_encontrado") return noEncontrado();
  if (resultado.estado === "invalido") return invalido(resultado.fallas);

  if (resultado.estado === "no_es_borrador") {
    return noEsBorrador(resultado.actual);
  }

  const cuerpo: RespuestaDeCotizacion = { cotizacion: resultado.cotizacion };
  const cabeceras =
    estadoAlGuardar === 201
      ? { location: `/api/cotizaciones/${resultado.cotizacion.id}`, ...SIN_CACHE }
      : { ...SIN_CACHE };

  return json(cuerpo, { status: estadoAlGuardar, headers: cabeceras });
}

function respuestaDeModulos(
  resultado: ResultadoDeModulos,
  estadoAlGuardar: 200 | 201,
): Response {
  if (resultado.estado === "no_encontrado") return noEncontrado();
  if (resultado.estado === "invalido") return invalido(resultado.fallas);
  if (resultado.estado === "no_es_borrador") {
    return noEsBorrador(resultado.actual);
  }

  // Sin `location` ni en el alta: un módulo tiene dirección para editarlo y
  // para quitarlo, pero no para leerlo solo. Apuntar a una dirección que no
  // contesta `GET` sería prometer un recurso que no existe.
  const cuerpo: RespuestaDeModulos = { modulos: resultado.modulos };
  return json(cuerpo, { status: estadoAlGuardar });
}

/**
 * Los segmentos de la ruta, sin la barra final y sin decodificar.
 *
 * No se filtran los vacíos: `/api/cotizaciones//editar` tiene que caer en
 * «desconocida» y no en «la cotización de identificador vacío».
 */
function segmentosDe(pathname: string): string[] {
  return pathname.replace(/\/+$/, "").split("/").slice(1);
}

/**
 * Hoy **en Panamá**, como día `AAAA-MM-DD`.
 *
 * El reloj se lee acá y se le pasa al dominio, que es puro: una regla que
 * mira el calendario necesita saber qué día es, y una función que lo averigua
 * sola no se puede probar en el borde —«hoy no es pasado»— sin esperar a que
 * el día cambie.
 *
 * Y es el día de Panamá y no el de UTC. Con el de UTC, a partir de las 19:00
 * hora local el servidor ya cree que es mañana, y un vencimiento elegido para
 * hoy sale rechazado por pasado. El huso lo resuelve `hoyEnPanama`, en
 * `../db/momentos`, que explica por qué vive ahí.
 */
function hoy(): string {
  return hoyEnPanama(new Date(ahoraIso()));
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
 * Las cinco rutas de los módulos de prosa.
 *
 * **El orden de los tres rechazos es el mismo que el del `PUT` de la
 * cotización, y por los mismos motivos:** 404 antes que todo —un cuerpo
 * inválido contra un identificador ajeno contestaría 422 y eso bastaría para
 * saber que existe—, 409 antes que 422 —lo que bloquea es el estado, no el
 * formulario— y 422 al final, que es el único que la persona puede resolver
 * escribiendo.
 *
 * La regla en sí —una cotización que ya no es borrador no se toca— vive en
 * el puerto, que vuelve a negarse aunque esta comprobación no existiera.
 * Está escrita dos veces a propósito: acá para elegir el orden de los
 * rechazos, y allá porque T-4 y T-5 van a llamar al puerto sin ruta delante.
 *
 * **Leer nunca se bloquea.** El `GET` de la colección contesta igual sobre
 * una emitida: lo que el estado impide es cambiar el documento, no mirarlo.
 */
async function rutasDeModulos(
  request: Request,
  segmentos: string[],
  tenantId: string,
  cotizacionId: string,
  servicio: ServicioDeCotizaciones,
  unModulo: boolean,
): Promise<Response> {
  const permitidos = unModulo ? "PUT, DELETE" : "GET, POST, PUT";
  const metodo = request.method;

  const reconocido = unModulo
    ? metodo === "PUT" || metodo === "DELETE"
    : metodo === "GET" || metodo === "POST" || metodo === "PUT";

  // El 405 va **antes** de mirar si la cotización existe, al revés que el
  // 404 de los demás rechazos: un verbo que esta dirección no tiene no es
  // una pregunta sobre ninguna cotización, así que contestarlo no dice si
  // existe. Lo que sí diría es llegar hasta el dominio para rechazarlo.
  if (!reconocido) {
    return json(
      { error: "method_not_allowed" },
      { status: 405, headers: { allow: permitidos, ...SIN_CACHE } },
    );
  }

  const cotizacion = await servicio.obtener(tenantId, cotizacionId);
  if (cotizacion === null) return noEncontrado();

  if (metodo === "GET") {
    const cuerpo: RespuestaDeModulos = {
      modulos: await servicio.listarModulos(tenantId, cotizacionId),
    };
    return json(cuerpo);
  }

  if (cotizacion.estado !== "borrador") {
    return noEsBorrador(cotizacion.estado);
  }

  if (unModulo) {
    const moduloId = decodificar(segmentos[4]);
    if (moduloId === null) return noEncontrado();

    if (metodo === "DELETE") {
      return respuestaDeModulos(
        await servicio.quitarModulo(tenantId, cotizacionId, moduloId),
        200,
      );
    }

    const leido = await leerCuerpo(request);
    if (!leido.ok) return leido.respuesta;

    const normalizado = normalizarModulo(leido.valor);
    if (!normalizado.ok) return invalido(normalizado.fallas);

    return respuestaDeModulos(
      await servicio.editarModulo(
        tenantId,
        cotizacionId,
        moduloId,
        normalizado.datos,
      ),
      200,
    );
  }

  const leido = await leerCuerpo(request);
  if (!leido.ok) return leido.respuesta;

  if (metodo === "PUT") {
    const normalizado = normalizarOrdenDeModulos(leido.valor);
    if (!normalizado.ok) return invalido(normalizado.fallas);

    return respuestaDeModulos(
      await servicio.reordenarModulos(
        tenantId,
        cotizacionId,
        normalizado.orden,
      ),
      200,
    );
  }

  const normalizado = normalizarModulo(leido.valor);
  if (!normalizado.ok) return invalido(normalizado.fallas);

  return respuestaDeModulos(
    await servicio.agregarModulo(tenantId, cotizacionId, normalizado.datos),
    201,
  );
}

/**
 * Devuelve `null` cuando la ruta no es de cotizaciones, para que quien llama
 * siga buscando y termine en su propio 404.
 */
export async function rutasDeCotizaciones(
  request: Request,
  url: URL,
  identidad: Identidad,
  tenantId: string,
  servicio: ServicioDeCotizaciones,
): Promise<Response | null> {
  const segmentos = segmentosDe(url.pathname);
  if (segmentos[0] !== "api") return null;
  if (segmentos[1] !== "cotizaciones") return null;

  if (segmentos.length === 2) {
    if (request.method === "GET") {
      const cuerpo: RespuestaDeCotizaciones = {
        cotizaciones: await servicio.listar(tenantId),
      };
      return json(cuerpo);
    }

    if (request.method !== "POST") return metodoNoPermitido("GET, POST");

    const leido = await leerCuerpo(request);
    if (!leido.ok) return leido.respuesta;

    // En el alta no hay vencimiento previo que reenviar: cualquier día
    // pasado es uno que se está poniendo ahora.
    const normalizado = normalizarCotizacion(leido.valor, {
      hoy: hoy(),
      venceEnActual: null,
    });
    if (!normalizado.ok) return invalido(normalizado.fallas);

    return respuestaDeEscritura(
      await servicio.crear(tenantId, identidad.usuarioId, normalizado.datos),
      201,
    );
  }

  // Cuatro segmentos con `modulos` al final es la colección; cinco es un
  // módulo concreto. La bitácora es el otro cuarto segmento y la atiende su
  // propio módulo, que corre antes. Todo lo demás —líneas, emitir— todavía
  // no existe y tiene que caer en el 404 general y no acá.
  const esDeModulos = segmentos[3] === "modulos";
  const coleccionDeModulos = segmentos.length === 4 && esDeModulos;
  const unModulo = segmentos.length === 5 && esDeModulos;

  if (coleccionDeModulos || unModulo) {
    const cotizacionId = decodificar(segmentos[2]);
    if (cotizacionId === null) return noEncontrado();

    return rutasDeModulos(
      request,
      segmentos,
      tenantId,
      cotizacionId,
      servicio,
      unModulo,
    );
  }

  if (segmentos.length !== 3) return null;

  const id = decodificar(segmentos[2]);
  if (id === null) return noEncontrado();

  if (request.method === "GET") {
    const cotizacion = await servicio.obtener(tenantId, id);
    if (cotizacion === null) return noEncontrado();

    const cuerpo: RespuestaDeCotizacion = { cotizacion };
    return json(cuerpo);
  }

  if (request.method !== "PUT") return metodoNoPermitido("GET, PUT");

  const leido = await leerCuerpo(request);
  if (!leido.ok) return leido.respuesta;

  // **El orden de los tres rechazos, que es lo único que esta capa decide
  // acá.** La regla en sí —una cotización que ya no es borrador no se
  // edita— vive en el puerto, que vuelve a negarse aunque esta comprobación
  // no existiera; lo que se decide acá es cuál de los tres se contesta
  // cuando valen varios a la vez:
  //
  //  1. **404 antes que todo.** Un cuerpo inválido contra un identificador
  //     ajeno contestaría 422 en vez de 404, y eso bastaría para saber que
  //     ese identificador existe. Es la misma decisión de T-5.
  //  2. **409 antes que 422.** Lo que bloquea es el estado, no el
  //     formulario: decirle a la pantalla «arreglá estos campos» la mandaría
  //     a corregir algo que no la va a dejar pasar igual.
  //  3. **422 al final**, que es el único de los tres que la persona puede
  //     resolver escribiendo.
  const actual = await servicio.obtener(tenantId, id);
  if (actual === null) return noEncontrado();

  if (actual.estado !== "borrador") {
    const cuerpo: CotizacionNoEsBorrador = {
      error: "cotizacion_no_es_borrador",
      estado: actual.estado,
    };
    return json(cuerpo, { status: 409 });
  }

  // El vencimiento que la cotización ya tenía viaja al dominio, y es lo que
  // distingue «poner uno pasado» de «reenviar el que estaba». La fila ya se
  // leyó arriba para el 404, así que no cuesta una consulta más.
  const normalizado = normalizarCotizacion(leido.valor, {
    hoy: hoy(),
    venceEnActual: actual.venceEn,
  });
  if (!normalizado.ok) return invalido(normalizado.fallas);

  return respuestaDeEscritura(
    await servicio.actualizar(tenantId, id, normalizado.datos),
    200,
  );
}
