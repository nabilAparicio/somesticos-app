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
 *   GET    /api/cotizaciones/{id}/lineas          las líneas y lo que suman
 *   POST   /api/cotizaciones/{id}/lineas          agrega una al final
 *   PUT    /api/cotizaciones/{id}/lineas          reordena la lista entera
 *   PUT    /api/cotizaciones/{id}/lineas/{lid}    edita una
 *   DELETE /api/cotizaciones/{id}/lineas/{lid}    la saca
 *   POST   /api/cotizaciones/{id}/emitir          la congela para siempre
 *   POST   /api/cotizaciones/{id}/ganar           el cliente aceptó
 *   POST   /api/cotizaciones/{id}/perder          el cliente no aceptó
 *   POST   /api/cotizaciones/{id}/duplicar        nace un borrador nuevo
 *
 * **Y nada más.** La salida imprimible es T-6 y la apertura de procesos
 * desde una ganada es T-7; las dos siguen cayendo en el 404 general. La
 * cuarta parte de la dirección `/api/cotizaciones/{id}/bitacora` la atiende
 * `worker/bitacora/rutas.ts`, que corre antes y para la que este archivo
 * devuelve `null`: acá sólo se reconocen `modulos`, `lineas` y los cuatro
 * verbos del ciclo de vida en esa posición.
 *
 * ## Cuatro verbos y no un `PUT` con el estado en el cuerpo
 *
 * El argumento que sigue a continuación para `emitir` vale igual para los
 * otros tres, y la segunda alternativa que descarta —`PUT
 * /api/cotizaciones/{id}/estado`— lo anticipaba con todas las letras:
 * aplastaría cuatro hechos distintos en un solo `PUT`. Son cuatro porque la
 * bitácora tiene que poder decir cuál de los cuatro pasó, y porque tres de
 * ellos no se parecen entre sí más que en la dirección: emitir congela un
 * documento, ganar y perder cierran un ciclo que no se reabre, y duplicar
 * **crea una fila nueva** y contesta 201.
 *
 * ## Por qué emitir es un `POST` a una subruta con verbo
 *
 * Rompe con el resto del archivo —`modulos` y `lineas` son colecciones— y es
 * deliberado. Las dos alternativas y por qué no:
 *
 *  - **`PUT /api/cotizaciones/{id}` con `estado` en el cuerpo.** Convertiría
 *    el único hecho irreversible del sistema en un campo más del formulario
 *    de edición, y abriría la puerta a mandar `estado` junto con
 *    `clienteId`. `DatosDeCotizacion` tiene dos campos justamente para que
 *    no exista ese camino.
 *  - **`PUT /api/cotizaciones/{id}/estado`.** Sugiere que el estado se
 *    escribe, y lo que pasa acá es mucho más que escribirlo: se arma y se
 *    congela un documento. Además obligaría a T-5 a meter `ganada`,
 *    `perdida` y la duplicación por la misma dirección, aplastando cuatro
 *    hechos distintos en un solo `PUT` — exactamente lo que este archivo ya
 *    evitó con el reordenamiento de módulos.
 *
 * `POST` y no `PUT` porque no es idempotente ni se le parece: la segunda vez
 * contesta 409, y tiene que contestarlo.
 *
 * ## Las líneas tienen la misma forma que los módulos, y una diferencia
 *
 * Las cinco rutas de `lineas` son la copia de las cinco de `modulos`, con el
 * mismo orden de rechazos y la misma decisión de qué verbo va en cada
 * dirección. La diferencia está en el cuerpo: la respuesta de líneas trae
 * **los totales derivados**, y los deriva esta capa con `totalesDe`, una
 * sola vez y en un solo sitio. La pantalla no suma; el repositorio tampoco
 * —devuelve filas—. Dos sumas en dos sitios son dos resultados el día que
 * una cambie.
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
  CotizacionNoEsEmitida,
  DatosInvalidos,
  FallaDeValidacion,
  LineaDeCotizacion,
  RespuestaDeCotizacion,
  RespuestaDeCotizaciones,
  RespuestaDeLineas,
  RespuestaDeModulos,
} from "../contract";
import { ahoraIso, hoyEnPanama } from "../db/momentos";
import { normalizarCotizacion } from "./dominio";
import {
  normalizarLinea,
  normalizarOrdenDeLineas,
  totalesDe,
} from "./lineas";
import { normalizarModulo, normalizarOrdenDeModulos } from "./modulos";
import type {
  ResultadoDeCierre,
  ResultadoDeDuplicacion,
  ResultadoDeEmision,
  ResultadoDeEscritura,
  ResultadoDeLineas,
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
 * El cuerpo de las líneas: la lista, y lo que suma.
 *
 * **Es el único sitio donde se llama a `totalesDe`.** Lo usan por igual el
 * `GET` y las cuatro escrituras, así que la lista y sus totales no pueden
 * salir desincronizados de ninguna dirección: los totales se derivan
 * siempre de la lista que viaja con ellos, en la misma línea de código.
 */
function cuerpoDeLineas(lineas: LineaDeCotizacion[]): RespuestaDeLineas {
  return { lineas, totales: totalesDe(lineas) };
}

function respuestaDeLineas(
  resultado: ResultadoDeLineas,
  estadoAlGuardar: 200 | 201,
): Response {
  if (resultado.estado === "no_encontrado") return noEncontrado();
  if (resultado.estado === "invalido") return invalido(resultado.fallas);
  if (resultado.estado === "no_es_borrador") {
    return noEsBorrador(resultado.actual);
  }

  // Sin `location` ni en el alta, por lo mismo que con un módulo: una línea
  // tiene dirección para editarla y para quitarla, pero no para leerla sola.
  return json(cuerpoDeLineas(resultado.lineas), { status: estadoAlGuardar });
}

/**
 * La respuesta de emitir.
 *
 * **200 y no 201**, aunque haya nacido un documento: el snapshot no tiene
 * dirección propia y no hay nada a lo que apuntar con un `location`. Lo que
 * cambió es la cotización que ya existía, y es la que vuelve.
 *
 * Y no devuelve el snapshot. Es el documento entero, nadie que esté mirando
 * la ficha lo necesita, y `SELECCION` lo deja afuera a propósito desde T-2.
 * Lo que la pantalla necesita saber es que el estado cambió.
 */
function respuestaDeEmision(resultado: ResultadoDeEmision): Response {
  if (resultado.estado === "no_encontrado") return noEncontrado();
  if (resultado.estado === "no_es_borrador") {
    return noEsBorrador(resultado.actual);
  }

  const cuerpo: RespuestaDeCotizacion = { cotizacion: resultado.cotizacion };
  return json(cuerpo);
}

/**
 * El 409 de ganar o perder algo que no está emitido.
 *
 * Es el espejo de `noEsBorrador` y son **dos funciones y no una
 * parametrizada**, por lo mismo que son dos tipos en el contrato: el motivo
 * que viaja es distinto porque lo que la pantalla tiene que poder decir es
 * distinto. Una sola función con el estado esperado como argumento le
 * ahorraría cuatro líneas a este archivo y le pasaría la distinción a quien
 * lea la respuesta.
 */
function noEsEmitida(estado: CotizacionNoEsEmitida["estado"]): Response {
  const cuerpo: CotizacionNoEsEmitida = {
    error: "cotizacion_no_es_emitida",
    estado,
  };
  return json(cuerpo, { status: 409 });
}

/**
 * La respuesta de ganar y de perder.
 *
 * **200 y no 201**, por lo mismo que emitir: no nace ningún recurso con
 * dirección propia. Lo que cambió es la cotización que ya existía, y es la
 * que vuelve, con su estado nuevo adentro.
 */
function respuestaDeCierre(resultado: ResultadoDeCierre): Response {
  if (resultado.estado === "no_encontrado") return noEncontrado();
  if (resultado.estado === "no_es_emitida") {
    return noEsEmitida(resultado.actual);
  }

  const cuerpo: RespuestaDeCotizacion = { cotizacion: resultado.cotizacion };
  return json(cuerpo);
}

/**
 * La respuesta de duplicar.
 *
 * **201 con `location`, al revés que las otras tres del ciclo de vida**, y
 * la diferencia es real y no de gusto: acá sí nació una fila, tiene
 * dirección propia y esa dirección contesta `GET`. Es exactamente el mismo
 * criterio que el alta de un borrador, que es lo que esto es.
 *
 * El cuerpo trae **la copia** y no la original. Lo que la pantalla va a
 * hacer después de duplicar es abrir la copia para editarla; devolver la
 * original la obligaría a sacar el identificador del `location`.
 */
function respuestaDeDuplicacion(resultado: ResultadoDeDuplicacion): Response {
  if (resultado.estado === "no_encontrado") return noEncontrado();

  const cuerpo: RespuestaDeCotizacion = { cotizacion: resultado.cotizacion };
  return json(cuerpo, {
    status: 201,
    headers: {
      location: `/api/cotizaciones/${resultado.cotizacion.id}`,
      ...SIN_CACHE,
    },
  });
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
 * Las cinco rutas de las líneas de honorarios y gastos estimados.
 *
 * **Es la gemela de `rutasDeModulos`**, con el mismo orden de rechazos —404
 * antes que todo, 409 antes que 422, 422 al final— y por los mismos motivos,
 * que aquella función argumenta entera. Se mantienen separadas y no
 * fusionadas en una genérica porque lo único que comparten es ese preámbulo:
 * las dos normalizaciones son distintas, los cuatro métodos del puerto son
 * distintos y el cuerpo de la respuesta también —el de líneas lleva los
 * totales—. Una función parametrizada por cuatro llamadas y dos
 * normalizadores sería más difícil de leer que las dos, y el día que una de
 * las dos familias necesite algo propio habría que volver a partirla.
 *
 * **Leer nunca se bloquea.** El `GET` contesta igual sobre una emitida, con
 * sus totales: lo que el estado impide es cambiar el documento, no mirarlo.
 * Y es justamente lo que T-6 va a necesitar para imprimirlo.
 */
async function rutasDeLineas(
  request: Request,
  segmentos: string[],
  tenantId: string,
  cotizacionId: string,
  servicio: ServicioDeCotizaciones,
  unaLinea: boolean,
): Promise<Response> {
  const permitidos = unaLinea ? "PUT, DELETE" : "GET, POST, PUT";
  const metodo = request.method;

  const reconocido = unaLinea
    ? metodo === "PUT" || metodo === "DELETE"
    : metodo === "GET" || metodo === "POST" || metodo === "PUT";

  // El 405 va **antes** de mirar si la cotización existe: un verbo que esta
  // dirección no tiene no es una pregunta sobre ninguna cotización, así que
  // contestarlo no dice si existe.
  if (!reconocido) {
    return json(
      { error: "method_not_allowed" },
      { status: 405, headers: { allow: permitidos, ...SIN_CACHE } },
    );
  }

  const cotizacion = await servicio.obtener(tenantId, cotizacionId);
  if (cotizacion === null) return noEncontrado();

  if (metodo === "GET") {
    return json(
      cuerpoDeLineas(await servicio.listarLineas(tenantId, cotizacionId)),
    );
  }

  if (cotizacion.estado !== "borrador") {
    return noEsBorrador(cotizacion.estado);
  }

  if (unaLinea) {
    const lineaId = decodificar(segmentos[4]);
    if (lineaId === null) return noEncontrado();

    if (metodo === "DELETE") {
      return respuestaDeLineas(
        await servicio.quitarLinea(tenantId, cotizacionId, lineaId),
        200,
      );
    }

    const leido = await leerCuerpo(request);
    if (!leido.ok) return leido.respuesta;

    const normalizado = normalizarLinea(leido.valor);
    if (!normalizado.ok) return invalido(normalizado.fallas);

    return respuestaDeLineas(
      await servicio.editarLinea(
        tenantId,
        cotizacionId,
        lineaId,
        normalizado.datos,
      ),
      200,
    );
  }

  const leido = await leerCuerpo(request);
  if (!leido.ok) return leido.respuesta;

  if (metodo === "PUT") {
    const normalizado = normalizarOrdenDeLineas(leido.valor);
    if (!normalizado.ok) return invalido(normalizado.fallas);

    return respuestaDeLineas(
      await servicio.reordenarLineas(tenantId, cotizacionId, normalizado.orden),
      200,
    );
  }

  const normalizado = normalizarLinea(leido.valor);
  if (!normalizado.ok) return invalido(normalizado.fallas);

  return respuestaDeLineas(
    await servicio.agregarLinea(tenantId, cotizacionId, normalizado.datos),
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

  // Cuatro segmentos con `modulos` o `lineas` al final es la colección;
  // cinco es una fila concreta. La bitácora es el otro cuarto segmento y la
  // atiende su propio módulo, que corre antes. Lo que no esté acá —la
  // salida imprimible de T-6, los procesos de T-7— tiene que caer en el 404
  // general y no acá.
  const esDeModulos = segmentos[3] === "modulos";
  const coleccionDeModulos = segmentos.length === 4 && esDeModulos;
  const unModulo = segmentos.length === 5 && esDeModulos;

  const esDeLineas = segmentos[3] === "lineas";
  const coleccionDeLineas = segmentos.length === 4 && esDeLineas;
  const unaLinea = segmentos.length === 5 && esDeLineas;

  // Los cuatro verbos del ciclo de vida son los cuartos segmentos que no
  // nombran una colección: no hay `/emitir/{algo}` ni `/ganar/{algo}`, así
  // que cinco segmentos con cualquiera de ellos en el cuarto caen en el 404
  // general y no acá. Por eso la comprobación de longitud va en el `const`
  // y no adentro de cada rama.
  const VERBOS = ["emitir", "ganar", "perder", "duplicar"] as const;
  type Verbo = (typeof VERBOS)[number];

  const verbo: Verbo | null =
    segmentos.length === 4 &&
    (VERBOS as readonly string[]).includes(segmentos[3])
      ? (segmentos[3] as Verbo)
      : null;

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

  if (coleccionDeLineas || unaLinea) {
    const cotizacionId = decodificar(segmentos[2]);
    if (cotizacionId === null) return noEncontrado();

    return rutasDeLineas(
      request,
      segmentos,
      tenantId,
      cotizacionId,
      servicio,
      unaLinea,
    );
  }

  if (verbo !== null) {
    // El 405 va **antes** de mirar si la cotización existe, igual que en las
    // rutas de módulos y de líneas: un verbo que esta dirección no tiene no
    // es una pregunta sobre ninguna cotización, así que contestarlo no dice
    // si existe.
    if (request.method !== "POST") return metodoNoPermitido("POST");

    const cotizacionId = decodificar(segmentos[2]);
    if (cotizacionId === null) return noEncontrado();

    // **Ninguno de los cuatro lee el cuerpo, y eso es la decisión.** Un
    // `normalizar` acá sería un campo que el cuerpo podría imponer sobre
    // las escrituras del sistema que no se pueden deshacer. Lo único que
    // estas direcciones reciben es a quién le pasa el hecho, y eso sale de
    // la identidad que resolvió la puerta de Access (I-6).
    if (verbo === "emitir") {
      return respuestaDeEmision(
        await servicio.emitir(tenantId, identidad.usuarioId, cotizacionId),
      );
    }

    if (verbo === "duplicar") {
      return respuestaDeDuplicacion(
        await servicio.duplicar(tenantId, identidad.usuarioId, cotizacionId),
      );
    }

    // Ganar y perder no reciben la identidad: no congelan a nadie adentro
    // de un documento, y el autor del hecho lo pone `mutar` por su cuenta
    // desde la misma puerta. Pasárselo sería un argumento que el puerto no
    // usaría y que mañana alguien escribiría en una columna.
    return respuestaDeCierre(
      verbo === "ganar"
        ? await servicio.ganar(tenantId, cotizacionId)
        : await servicio.perder(tenantId, cotizacionId),
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
