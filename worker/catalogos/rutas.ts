/**
 * Las rutas HTTP de los catálogos. Traduce peticiones a llamadas del puerto y
 * resultados a respuestas; no decide ninguna regla de negocio.
 *
 *   GET    /api/areas                            listado
 *   POST   /api/areas                            alta
 *   GET    /api/areas/{id}                       detalle
 *   PUT    /api/areas/{id}                       edición (incluye dar de baja)
 *   DELETE /api/areas/{id}                       borrado, si no tiene hijos
 *
 *   …lo mismo para `/api/tipos-cliente` y `/api/tipos-proceso`, y además:
 *
 *   GET    /api/tipos-proceso/{id}/etapas        el plan por defecto
 *   PUT    /api/tipos-proceso/{id}/etapas        la plantilla entera, ordenada
 *
 * `GET /api/tipos-cliente` lo estrenó T-5 para alimentar el desplegable del
 * formulario de cliente, y se muda acá entero con la misma forma: el catálogo
 * pasa a tener un solo dueño, y ahora ese dueño también sabe escribirlo.
 *
 * `PUT` y no `PATCH`, como en T-5: el formulario manda siempre el juego
 * completo de campos, así que la semántica real es reemplazar. Para la
 * plantilla eso vale doble — mandar la lista entera hace que agregar, quitar,
 * renombrar y reordenar sean una sola escritura en vez de cuatro caminos con
 * cuatro formas de dejarla a medias.
 *
 * Los códigos que esta capa elige, y por qué:
 *
 *  - **404** para lo que es de otro tenant, igual que T-5: un 403 confirmaría
 *    que ese identificador existe.
 *  - **422** para un cuerpo que no se acepta.
 *  - **409** para el borrado que choca con dependientes, con el detalle de
 *    qué lo impide y cuántos son. Esa es la política de borrado de T-6: lo
 *    normal para un catálogo no es borrar, es dar de baja.
 *  - **409** también para el alta o el renombre cuyo nombre ya está tomado
 *    dentro del tenant (T-12), diciendo además si la fila que lo ocupa está
 *    vigente o dada de baja, porque la salida no es la misma. Hasta `0003`
 *    esto era un 500; el que lo evita es el repositorio, que **consulta
 *    antes de escribir** en vez de atrapar el error del índice.
 *
 * En el `PUT`, la existencia se comprueba **antes** de validar el cuerpo
 * (decisión de T-5): si no, un cuerpo inválido contra un id ajeno contestaría
 * 422, y ese 422 ya confirma que el id existe.
 */

import type {
  Area,
  BorradoBloqueado,
  DatosDeCatalogo,
  DatosInvalidos,
  EntidadDeCatalogo,
  FallaDeValidacion,
  NombreDuplicado,
  RespuestaDeArea,
  RespuestaDeAreas,
  RespuestaDeEtapas,
  RespuestaDeTipoCliente,
  RespuestaDeTipoProceso,
  RespuestaDeTiposCliente,
  RespuestaDeTiposProceso,
  TipoCliente,
} from "../contract";
import {
  normalizarCatalogo,
  normalizarEtapas,
  normalizarTipoProceso,
} from "./dominio";
import type {
  NombreTomado,
  ResultadoDeBorrado,
  ResultadoDeEscritura,
  ServicioDeCatalogos,
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
 * No se filtran los vacíos: `/api/areas//x` tiene que caer en «desconocida»
 * y no en «el área de identificador vacío».
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
 * El 409 del nombre tomado.
 *
 * Cuál de los dos motivos corresponde se decide acá y no en el repositorio,
 * por lo mismo que el 409 del borrado: el repositorio informa el hecho —hay
 * una fila con ese nombre, y está vigente o está de baja— y esta capa elige
 * la palabra del cable. Es la única traducción que hace, y es la que decide
 * qué va a poder decirle la pantalla a quien está esperando.
 *
 * Se exporta porque hay **dos** rutas que crean un tipo de proceso: ésta y
 * `POST /api/procesos/{id}/plantilla` con destino «nuevo» (T-11). Una
 * segunda copia de esta traducción es una segunda copia de la decisión de
 * qué motivo corresponde a qué estado, y el día que una aprenda algo la
 * otra no se entera — el mismo argumento por el que `EntidadDeCatalogo` se
 * nombra una sola vez en el contrato.
 */
export function nombreYaTomado(
  existente: NombreTomado,
  entidad: EntidadDeCatalogo,
): Response {
  const cuerpo: NombreDuplicado = {
    error: existente.activo ? "nombre_duplicado" : "nombre_duplicado_de_baja",
    entidad,
    nombre: existente.nombre,
  };
  return json(cuerpo, { status: 409 });
}

function respuestaDeBorrado(
  resultado: ResultadoDeBorrado,
  entidad: BorradoBloqueado["entidad"],
): Response {
  if (resultado.estado === "no_encontrado") return noEncontrado();

  if (resultado.estado === "bloqueado") {
    const cuerpo: BorradoBloqueado = {
      error: "tiene_dependientes",
      entidad,
      dependencias: resultado.dependencias,
    };
    return json(cuerpo, { status: 409 });
  }

  // 204 y sin cuerpo: de lo borrado no queda nada que devolver.
  return new Response(null, { status: 204, headers: { ...SIN_CACHE } });
}

// ---------------------------------------------------------------------------
// `area` y `tipo_cliente`: dos catálogos planos con las mismas reglas
// ---------------------------------------------------------------------------

/**
 * Lo único en que se diferencian los dos catálogos planos: cómo se llaman en
 * la URL y en el JSON, y qué les cuelga. Todo lo demás —los cinco verbos, los
 * códigos, el orden de las comprobaciones— es el mismo código, una vez.
 */
interface CatalogoPlano<T extends { id: string }> {
  readonly entidad: BorradoBloqueado["entidad"];
  readonly prefijo: string;
  envolverLista(filas: T[]): unknown;
  envolverUna(fila: T): unknown;
  listar(tenantId: string): Promise<T[]>;
  obtener(tenantId: string, id: string): Promise<T | null>;
  crear(
    tenantId: string,
    datos: DatosDeCatalogo,
  ): Promise<ResultadoDeEscritura<T>>;
  actualizar(
    tenantId: string,
    id: string,
    datos: DatosDeCatalogo,
  ): Promise<ResultadoDeEscritura<T>>;
  borrar(tenantId: string, id: string): Promise<ResultadoDeBorrado>;
}

function catalogoDeAreas(servicio: ServicioDeCatalogos): CatalogoPlano<Area> {
  return {
    entidad: "area",
    prefijo: "/api/areas",
    envolverLista: (areas) => ({ areas }) satisfies RespuestaDeAreas,
    envolverUna: (area) => ({ area }) satisfies RespuestaDeArea,
    listar: (tenantId) => servicio.listarAreas(tenantId),
    obtener: (tenantId, id) => servicio.obtenerArea(tenantId, id),
    crear: (tenantId, datos) => servicio.crearArea(tenantId, datos),
    actualizar: (tenantId, id, datos) =>
      servicio.actualizarArea(tenantId, id, datos),
    borrar: (tenantId, id) => servicio.borrarArea(tenantId, id),
  };
}

function catalogoDeTiposCliente(
  servicio: ServicioDeCatalogos,
): CatalogoPlano<TipoCliente> {
  return {
    entidad: "tipo_cliente",
    prefijo: "/api/tipos-cliente",
    envolverLista: (tipos) => ({ tipos }) satisfies RespuestaDeTiposCliente,
    envolverUna: (tipo) => ({ tipo }) satisfies RespuestaDeTipoCliente,
    listar: (tenantId) => servicio.listarTiposCliente(tenantId),
    obtener: (tenantId, id) => servicio.obtenerTipoCliente(tenantId, id),
    crear: (tenantId, datos) => servicio.crearTipoCliente(tenantId, datos),
    actualizar: (tenantId, id, datos) =>
      servicio.actualizarTipoCliente(tenantId, id, datos),
    borrar: (tenantId, id) => servicio.borrarTipoCliente(tenantId, id),
  };
}

async function manejarPlano<T extends { id: string }>(
  request: Request,
  segmentos: string[],
  tenantId: string,
  plano: CatalogoPlano<T>,
): Promise<Response | null> {
  if (segmentos.length === 2) {
    if (request.method === "GET") {
      return json(plano.envolverLista(await plano.listar(tenantId)));
    }
    if (request.method !== "POST") return metodoNoPermitido("GET, POST");

    const leido = await leerCuerpo(request);
    if (!leido.ok) return leido.respuesta;

    const normalizado = normalizarCatalogo(leido.valor);
    if (!normalizado.ok) return invalido(normalizado.fallas);

    const resultado = await plano.crear(tenantId, normalizado.datos);
    if (resultado.estado === "no_encontrado") return noEncontrado();
    if (resultado.estado === "invalido") return invalido(resultado.fallas);
    if (resultado.estado === "duplicado") {
      return nombreYaTomado(resultado.existente, plano.entidad);
    }

    return json(plano.envolverUna(resultado.fila), {
      status: 201,
      headers: {
        location: `${plano.prefijo}/${resultado.fila.id}`,
        ...SIN_CACHE,
      },
    });
  }

  if (segmentos.length !== 3) return null;

  const id = decodificar(segmentos[2]);
  if (id === null) return noEncontrado();

  if (request.method === "GET") {
    const fila = await plano.obtener(tenantId, id);
    if (fila === null) return noEncontrado();

    return json(plano.envolverUna(fila));
  }

  if (request.method === "DELETE") {
    return respuestaDeBorrado(await plano.borrar(tenantId, id), plano.entidad);
  }

  if (request.method !== "PUT") return metodoNoPermitido("GET, PUT, DELETE");

  const leido = await leerCuerpo(request);
  if (!leido.ok) return leido.respuesta;

  // Primero la existencia dentro del tenant, después el cuerpo.
  if ((await plano.obtener(tenantId, id)) === null) return noEncontrado();

  const normalizado = normalizarCatalogo(leido.valor);
  if (!normalizado.ok) return invalido(normalizado.fallas);

  const resultado = await plano.actualizar(tenantId, id, normalizado.datos);
  if (resultado.estado === "no_encontrado") return noEncontrado();
  if (resultado.estado === "invalido") return invalido(resultado.fallas);
  if (resultado.estado === "duplicado") {
    return nombreYaTomado(resultado.existente, plano.entidad);
  }

  return json(plano.envolverUna(resultado.fila));
}

// ---------------------------------------------------------------------------
// `tipo_proceso` y su plantilla
// ---------------------------------------------------------------------------

async function manejarTiposProceso(
  request: Request,
  segmentos: string[],
  tenantId: string,
  servicio: ServicioDeCatalogos,
): Promise<Response | null> {
  if (segmentos.length === 2) {
    if (request.method === "GET") {
      const cuerpo: RespuestaDeTiposProceso = {
        tipos: await servicio.listarTiposProceso(tenantId),
      };
      return json(cuerpo);
    }
    if (request.method !== "POST") return metodoNoPermitido("GET, POST");

    const leido = await leerCuerpo(request);
    if (!leido.ok) return leido.respuesta;

    const normalizado = normalizarTipoProceso(leido.valor);
    if (!normalizado.ok) return invalido(normalizado.fallas);

    const resultado = await servicio.crearTipoProceso(
      tenantId,
      normalizado.datos,
    );
    if (resultado.estado === "no_encontrado") return noEncontrado();
    if (resultado.estado === "invalido") return invalido(resultado.fallas);
    if (resultado.estado === "duplicado") {
      return nombreYaTomado(resultado.existente, "tipo_proceso");
    }

    const cuerpo: RespuestaDeTipoProceso = { tipo: resultado.fila };
    return json(cuerpo, {
      status: 201,
      headers: {
        location: `/api/tipos-proceso/${resultado.fila.id}`,
        ...SIN_CACHE,
      },
    });
  }

  if (segmentos.length < 3 || segmentos.length > 4) return null;

  const id = decodificar(segmentos[2]);
  if (id === null) return noEncontrado();

  if (segmentos.length === 4) {
    if (segmentos[3] !== "etapas") return null;
    return manejarEtapas(request, tenantId, id, servicio);
  }

  if (request.method === "GET") {
    const tipo = await servicio.obtenerTipoProceso(tenantId, id);
    if (tipo === null) return noEncontrado();

    const cuerpo: RespuestaDeTipoProceso = { tipo };
    return json(cuerpo);
  }

  if (request.method === "DELETE") {
    return respuestaDeBorrado(
      await servicio.borrarTipoProceso(tenantId, id),
      "tipo_proceso",
    );
  }

  if (request.method !== "PUT") return metodoNoPermitido("GET, PUT, DELETE");

  const leido = await leerCuerpo(request);
  if (!leido.ok) return leido.respuesta;

  if ((await servicio.obtenerTipoProceso(tenantId, id)) === null) {
    return noEncontrado();
  }

  const normalizado = normalizarTipoProceso(leido.valor);
  if (!normalizado.ok) return invalido(normalizado.fallas);

  const resultado = await servicio.actualizarTipoProceso(
    tenantId,
    id,
    normalizado.datos,
  );
  if (resultado.estado === "no_encontrado") return noEncontrado();
  if (resultado.estado === "invalido") return invalido(resultado.fallas);
  if (resultado.estado === "duplicado") {
    return nombreYaTomado(resultado.existente, "tipo_proceso");
  }

  const cuerpo: RespuestaDeTipoProceso = { tipo: resultado.fila };
  return json(cuerpo);
}

async function manejarEtapas(
  request: Request,
  tenantId: string,
  tipoProcesoId: string,
  servicio: ServicioDeCatalogos,
): Promise<Response> {
  if (request.method === "GET") {
    const etapas = await servicio.listarEtapas(tenantId, tipoProcesoId);
    if (etapas === null) return noEncontrado();

    const cuerpo: RespuestaDeEtapas = { etapas };
    return json(cuerpo);
  }

  if (request.method !== "PUT") return metodoNoPermitido("GET, PUT");

  const leido = await leerCuerpo(request);
  if (!leido.ok) return leido.respuesta;

  // La existencia del tipo de proceso manda sobre la validación del cuerpo,
  // igual que en todo lo demás: un 422 contra un tipo ajeno confirmaría que
  // ese identificador existe.
  if ((await servicio.obtenerTipoProceso(tenantId, tipoProcesoId)) === null) {
    return noEncontrado();
  }

  const normalizado = normalizarEtapas(leido.valor);
  if (!normalizado.ok) return invalido(normalizado.fallas);

  const resultado = await servicio.reemplazarEtapas(
    tenantId,
    tipoProcesoId,
    normalizado.datos,
  );
  if (resultado.estado === "no_encontrado") return noEncontrado();
  if (resultado.estado === "invalido") return invalido(resultado.fallas);

  const cuerpo: RespuestaDeEtapas = { etapas: resultado.etapas };
  return json(cuerpo);
}

/**
 * Devuelve `null` cuando la ruta no es de catálogos, para que quien llama
 * siga buscando y termine en su propio 404.
 */
export function rutasDeCatalogos(
  request: Request,
  url: URL,
  tenantId: string,
  servicio: ServicioDeCatalogos,
): Promise<Response | null> {
  const segmentos = segmentosDe(url.pathname);
  if (segmentos[0] !== "api") return Promise.resolve(null);

  switch (segmentos[1]) {
    case "areas":
      return manejarPlano(request, segmentos, tenantId, catalogoDeAreas(servicio));
    case "tipos-cliente":
      return manejarPlano(
        request,
        segmentos,
        tenantId,
        catalogoDeTiposCliente(servicio),
      );
    case "tipos-proceso":
      return manejarTiposProceso(request, segmentos, tenantId, servicio);
    default:
      return Promise.resolve(null);
  }
}
