/**
 * Las rutas HTTP de las cotizaciones. Traduce peticiones a llamadas del
 * puerto y resultados a respuestas; no decide ninguna regla de negocio.
 *
 *   GET    /api/cotizaciones           listado
 *   POST   /api/cotizaciones           alta de un borrador
 *   GET    /api/cotizaciones/{id}      detalle
 *   PUT    /api/cotizaciones/{id}      edición de un borrador
 *
 * **Y nada más por ahora.** No hay ruta de emitir —es de T-4, con su propio
 * disparador de inmutabilidad en la base— ni de módulos ni de líneas. La
 * cuarta parte de la dirección (`/api/cotizaciones/{id}/bitacora`) la atiende
 * `worker/bitacora/rutas.ts`, que corre antes y para la que este archivo
 * devuelve `null`: acá se corta en `segmentos.length !== 3`.
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
} from "../contract";
import { ahoraIso } from "../db/momentos";
import { normalizarCotizacion } from "./dominio";
import type {
  ResultadoDeEscritura,
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

function respuestaDeEscritura(
  resultado: ResultadoDeEscritura,
  estadoAlGuardar: 200 | 201,
): Response {
  if (resultado.estado === "no_encontrado") return noEncontrado();
  if (resultado.estado === "invalido") return invalido(resultado.fallas);

  if (resultado.estado === "no_es_borrador") {
    const cuerpo: CotizacionNoEsBorrador = {
      error: "cotizacion_no_es_borrador",
      estado: resultado.actual,
    };
    return json(cuerpo, { status: 409 });
  }

  const cuerpo: RespuestaDeCotizacion = { cotizacion: resultado.cotizacion };
  const cabeceras =
    estadoAlGuardar === 201
      ? { location: `/api/cotizaciones/${resultado.cotizacion.id}`, ...SIN_CACHE }
      : { ...SIN_CACHE };

  return json(cuerpo, { status: estadoAlGuardar, headers: cabeceras });
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
 * Hoy, como día `AAAA-MM-DD`.
 *
 * El reloj se lee acá y se le pasa al dominio, que es puro: una regla que
 * mira el calendario necesita saber qué día es, y una función que lo averigua
 * sola no se puede probar en el borde —«hoy no es pasado»— sin esperar a que
 * el día cambie.
 */
function hoy(): string {
  return ahoraIso().slice(0, 10);
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

  // Tres segmentos y no más: la bitácora es el cuarto y la atiende su propio
  // módulo, que corre antes. Todo lo demás —módulos, líneas, emitir— todavía
  // no existe y tiene que caer en el 404 general y no acá.
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
