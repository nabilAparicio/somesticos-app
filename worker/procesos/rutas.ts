/**
 * Las rutas HTTP de procesos. Traduce peticiones a llamadas del puerto y
 * resultados a respuestas; no decide ninguna regla de negocio.
 *
 *   GET    /api/procesos                   listado global
 *   GET    /api/procesos?clienteId={id}    listado de un cliente
 *   POST   /api/procesos                   alta (`origen = directo`)
 *   GET    /api/procesos/{id}              detalle: el proceso y su plan
 *   PUT    /api/procesos/{id}/etapas       el plan entero, ordenado
 *   POST   /api/procesos/{id}/avanzar      marca alcanzada la próxima pendiente
 *   POST   /api/procesos/{id}/plantilla    guarda el plan como plantilla (T-11)
 *
 * `plantilla` cuelga del **proceso** y no de `/api/tipos-proceso`, porque lo
 * que identifica la operación es de dónde sale el plan: el tipo de destino
 * se deduce del proceso, o se crea. Es un `POST` y no un `PUT` por lo mismo
 * que el alta: puede terminar creando una fila nueva, y entonces contesta
 * 201 con su `location`.
 *
 * **No hay `GET /api/procesos/{id}/etapas`**: el detalle ya trae el plan, y
 * una segunda lectura del mismo dato sería una segunda forma de quedar
 * desincronizada con los contadores que el detalle calcula.
 *
 * **No hay `DELETE`.** Borrar un proceso no está en T-7, y las notas y los
 * pendientes que van a colgar de él son inmutables (I-6), así que la política
 * de borrado necesita una decisión que esta tarea no tiene por qué tomar.
 *
 * El `PUT` del plan y el `POST` de avanzar **devuelven el detalle completo**,
 * no solo las etapas: las dos operaciones mueven los contadores del proceso
 * —cuántas cumplidas, cuál es la próxima— y devolver media respuesta obliga a
 * la pantalla a pedir la otra mitad o a recalcularla por su cuenta.
 *
 * Todo esto corre **después** de la puerta de Access.
 *
 * Los códigos que esta capa elige, y por qué:
 *
 *  - **404** para lo que es de otro tenant, igual que T-5 y T-6: un 403
 *    confirmaría que ese identificador existe.
 *  - **422** para un cuerpo que no se acepta, incluida la etapa alcanzada que
 *    alguien intenta quitar o mover. Es una falla de datos con su motivo, y
 *    el motivo es lo que la pantalla convierte en una frase.
 *  - **409** para avanzar un plan que ya no tiene nada por delante: la
 *    petición está bien formada y el estado es el que no la admite.
 *
 * En el `PUT`, la existencia se comprueba **antes** de validar el cuerpo
 * (decisión de T-5): si no, un cuerpo inválido contra un id ajeno contestaría
 * 422, y ese 422 ya confirma que el id existe.
 */

import type { ServicioDeCatalogos } from "../catalogos/repositorio";
import type { BaseDeDatos } from "../db/base";
import type {
  DatosInvalidos,
  DetalleDeProceso,
  FallaDeValidacion,
  PlantillaGuardada,
  RespuestaDeProceso,
  RespuestaDeProcesos,
  SinEtapasPendientes,
} from "../contract";
import {
  normalizarEtapas,
  normalizarGuardadoDePlantilla,
  normalizarProceso,
} from "./dominio";
import { guardarPlanComoPlantilla } from "./plantilla";
import type { ResultadoDeEscritura, ServicioDeProcesos } from "./repositorio";

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
 * No se filtran los vacíos: `/api/procesos//avanzar` tiene que caer en
 * «desconocida» y no en «el proceso de identificador vacío».
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

function detalle(valor: DetalleDeProceso, init?: ResponseInit): Response {
  return json(valor, init);
}

function respuestaDeEscritura(resultado: ResultadoDeEscritura): Response {
  if (resultado.estado === "no_encontrado") return noEncontrado();
  if (resultado.estado === "invalido") return invalido(resultado.fallas);

  return detalle(resultado.detalle);
}

async function manejarColeccion(
  request: Request,
  url: URL,
  tenantId: string,
  servicio: ServicioDeProcesos,
): Promise<Response> {
  if (request.method === "GET") {
    // Un `clienteId` vacío es «sin filtro», no «el cliente de identificador
    // vacío»: `?clienteId=` es lo que manda un formulario que no eligió nada.
    const crudo = url.searchParams.get("clienteId");
    const clienteId = crudo === null || crudo.trim() === "" ? null : crudo;

    const cuerpo: RespuestaDeProcesos = {
      procesos: await servicio.listar(tenantId, clienteId),
    };
    return json(cuerpo);
  }

  if (request.method !== "POST") return metodoNoPermitido("GET, POST");

  const leido = await leerCuerpo(request);
  if (!leido.ok) return leido.respuesta;

  const normalizado = normalizarProceso(leido.valor);
  if (!normalizado.ok) return invalido(normalizado.fallas);

  const resultado = await servicio.crear(tenantId, normalizado.datos);
  if (resultado.estado === "no_encontrado") return noEncontrado();
  if (resultado.estado === "invalido") return invalido(resultado.fallas);

  // El alta contesta 201 con el `proceso` solo —no el detalle— porque lo que
  // la pantalla hace a continuación es navegar al detalle, que lo vuelve a
  // pedir entero.
  const cuerpo: RespuestaDeProceso = { proceso: resultado.detalle.proceso };
  return json(cuerpo, {
    status: 201,
    headers: {
      location: `/api/procesos/${resultado.detalle.proceso.id}`,
      ...SIN_CACHE,
    },
  });
}

async function manejarPlan(
  request: Request,
  tenantId: string,
  procesoId: string,
  servicio: ServicioDeProcesos,
): Promise<Response> {
  if (request.method !== "PUT") return metodoNoPermitido("PUT");

  const leido = await leerCuerpo(request);
  if (!leido.ok) return leido.respuesta;

  // La existencia del proceso manda sobre la validación del cuerpo, igual
  // que en todo lo demás: un 422 contra un proceso ajeno confirmaría que ese
  // identificador existe.
  if ((await servicio.obtener(tenantId, procesoId)) === null) {
    return noEncontrado();
  }

  // El envío lleva id y nombre, y nada más. `alcanzadaEn` **no se lee**:
  // aunque venga en el JSON, el avance es de una sola dirección y no hay
  // forma de desandarlo por esta vía.
  const normalizado = normalizarEtapas(leido.valor);
  if (!normalizado.ok) return invalido(normalizado.fallas);

  return respuestaDeEscritura(
    await servicio.reemplazarEtapas(tenantId, procesoId, normalizado.datos),
  );
}

async function manejarAvance(
  request: Request,
  tenantId: string,
  procesoId: string,
  servicio: ServicioDeProcesos,
): Promise<Response> {
  if (request.method !== "POST") return metodoNoPermitido("POST");

  const resultado = await servicio.avanzar(tenantId, procesoId);

  if (resultado.estado === "no_encontrado") return noEncontrado();
  if (resultado.estado === "sin_pendientes") {
    const cuerpo: SinEtapasPendientes = { error: "sin_etapas_pendientes" };
    return json(cuerpo, { status: 409 });
  }

  return detalle(resultado.detalle);
}

/**
 * T-11: el plan del proceso, copiado a una plantilla.
 *
 * El 201 se reserva para el destino que **creó** un tipo de proceso, con su
 * `location` apuntando al catálogo: es una fila nueva que la pantalla de
 * catálogos ya sabe mostrar. Actualizar una plantilla existente es un 200,
 * porque no nació nada.
 */
async function manejarGuardadoDePlantilla(
  request: Request,
  tenantId: string,
  procesoId: string,
  procesos: ServicioDeProcesos,
  catalogos: ServicioDeCatalogos,
  base: BaseDeDatos,
): Promise<Response> {
  if (request.method !== "POST") return metodoNoPermitido("POST");

  const leido = await leerCuerpo(request);
  if (!leido.ok) return leido.respuesta;

  // La existencia del proceso manda sobre la validación del cuerpo: un 422
  // contra un proceso ajeno confirmaría que ese identificador existe.
  if ((await procesos.obtener(tenantId, procesoId)) === null) {
    return noEncontrado();
  }

  const normalizado = normalizarGuardadoDePlantilla(leido.valor);
  if (!normalizado.ok) return invalido(normalizado.fallas);

  const resultado = await guardarPlanComoPlantilla(
    tenantId,
    procesoId,
    normalizado.datos,
    procesos,
    catalogos,
    base,
  );
  if (resultado.estado === "no_encontrado") return noEncontrado();
  if (resultado.estado === "invalido") return invalido(resultado.fallas);

  const cuerpo: PlantillaGuardada = {
    tipo: resultado.tipo,
    etapas: resultado.etapas,
  };

  return resultado.creado
    ? json(cuerpo, {
        status: 201,
        headers: {
          location: `/api/tipos-proceso/${resultado.tipo.id}`,
          ...SIN_CACHE,
        },
      })
    : json(cuerpo);
}

/**
 * Devuelve `null` cuando la ruta no es de procesos, para que quien llama siga
 * buscando y termine en su propio 404.
 *
 * Recibe **dos** puertos desde T-11: guardar el plan como plantilla lee de
 * procesos y escribe en catálogos, y la escritura es la misma
 * `reemplazarEtapas` que usa la pantalla de catálogos.
 */
export async function rutasDeProcesos(
  request: Request,
  url: URL,
  tenantId: string,
  servicio: ServicioDeProcesos,
  catalogos: ServicioDeCatalogos,
  base: BaseDeDatos,
): Promise<Response | null> {
  const segmentos = segmentosDe(url.pathname);
  if (segmentos[0] !== "api") return null;
  if (segmentos[1] !== "procesos") return null;

  if (segmentos.length === 2) {
    return manejarColeccion(request, url, tenantId, servicio);
  }

  if (segmentos.length < 3 || segmentos.length > 4) return null;

  const id = decodificar(segmentos[2]);
  if (id === null) return noEncontrado();

  if (segmentos.length === 4) {
    if (segmentos[3] === "etapas") {
      return manejarPlan(request, tenantId, id, servicio);
    }
    if (segmentos[3] === "avanzar") {
      return manejarAvance(request, tenantId, id, servicio);
    }
    if (segmentos[3] === "plantilla") {
      return manejarGuardadoDePlantilla(
        request,
        tenantId,
        id,
        servicio,
        catalogos,
        base,
      );
    }
    return null;
  }

  if (request.method !== "GET") return metodoNoPermitido("GET");

  const encontrado = await servicio.obtener(tenantId, id);
  if (encontrado === null) return noEncontrado();

  return detalle(encontrado);
}
