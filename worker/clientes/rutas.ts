/**
 * Las rutas HTTP de clientes. Traduce peticiones a llamadas del puerto y
 * resultados a respuestas; no decide ninguna regla de negocio.
 *
 *   GET    /api/tipos-cliente      el catálogo (`docs/diseno.md` §6)
 *   GET    /api/clientes           listado
 *   POST   /api/clientes           alta
 *   GET    /api/clientes/{id}      detalle
 *   PUT    /api/clientes/{id}      edición
 *
 * Todo esto corre **después** de la puerta de Access: la identidad llega
 * resuelta como argumento, no como algo que este archivo tenga que ir a
 * buscar. Si mañana alguien mueve el ruteo delante de la puerta, la firma no
 * compila.
 *
 * `PUT` y no `PATCH`: el formulario siempre manda el juego completo de campos
 * editables, así que la semántica real es reemplazar. Un `PATCH` obligaría a
 * distinguir "no mandé el campo" de "lo quiero vacío", que es precisamente la
 * ambigüedad que hace que vaciar un dato no funcione nunca.
 */

import type { Identidad } from "../acceso/identidad";
import type {
  DatosInvalidos,
  FallaDeValidacion,
  RespuestaDeCliente,
  RespuestaDeClientes,
  RespuestaDeTiposCliente,
} from "../contract";
import { normalizarDatos } from "./dominio";
import type { ResultadoDeEscritura, ServicioDeClientes } from "./repositorio";

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
    // 400 y no 422: 422 dice "entendí el cuerpo y no me sirve"; esto es
    // "no pude ni leerlo".
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

  const cuerpo: RespuestaDeCliente = { cliente: resultado.cliente };
  const cabeceras =
    estadoAlGuardar === 201
      ? { location: `/api/clientes/${resultado.cliente.id}`, ...SIN_CACHE }
      : { ...SIN_CACHE };

  return json(cuerpo, { status: estadoAlGuardar, headers: cabeceras });
}

/**
 * Los segmentos de la ruta, sin la barra final y sin decodificar.
 *
 * No se filtran los vacíos: `/api/clientes//editar` tiene que caer en
 * "desconocida" y no en "el cliente de identificador vacío".
 */
function segmentosDe(pathname: string): string[] {
  return pathname.replace(/\/+$/, "").split("/").slice(1);
}

/**
 * Devuelve `null` cuando la ruta no es de clientes, para que quien llama siga
 * buscando y termine en su propio 404.
 */
export async function rutasDeClientes(
  request: Request,
  url: URL,
  identidad: Identidad,
  tenantId: string,
  servicio: ServicioDeClientes,
): Promise<Response | null> {
  const segmentos = segmentosDe(url.pathname);
  if (segmentos[0] !== "api") return null;

  if (segmentos.length === 2 && segmentos[1] === "tipos-cliente") {
    if (request.method !== "GET") return metodoNoPermitido("GET");

    const cuerpo: RespuestaDeTiposCliente = {
      tipos: await servicio.listarTipos(tenantId),
    };
    return json(cuerpo);
  }

  if (segmentos[1] !== "clientes") return null;

  if (segmentos.length === 2) {
    if (request.method === "GET") {
      const cuerpo: RespuestaDeClientes = {
        clientes: await servicio.listar(tenantId),
      };
      return json(cuerpo);
    }

    if (request.method !== "POST") return metodoNoPermitido("GET, POST");

    const leido = await leerCuerpo(request);
    if (!leido.ok) return leido.respuesta;

    const normalizado = normalizarDatos(leido.valor);
    if (!normalizado.ok) return invalido(normalizado.fallas);

    return respuestaDeEscritura(
      await servicio.crear(tenantId, identidad.usuarioId, normalizado.datos),
      201,
    );
  }

  if (segmentos.length !== 3) return null;

  const id = decodificar(segmentos[2]);
  if (id === null) return noEncontrado();

  if (request.method === "GET") {
    const cliente = await servicio.obtener(tenantId, id);
    if (cliente === null) return noEncontrado();

    const cuerpo: RespuestaDeCliente = { cliente };
    return json(cuerpo);
  }

  if (request.method !== "PUT") return metodoNoPermitido("GET, PUT");

  const leido = await leerCuerpo(request);
  if (!leido.ok) return leido.respuesta;

  // El orden importa: primero se comprueba que el cliente exista **en este
  // tenant** y recién después se valida el cuerpo. Al revés, un cuerpo
  // inválido contra un identificador ajeno contestaría 422 en vez de 404 y
  // eso bastaría para saber que ese identificador no es de uno.
  if ((await servicio.obtener(tenantId, id)) === null) return noEncontrado();

  const normalizado = normalizarDatos(leido.valor);
  if (!normalizado.ok) return invalido(normalizado.fallas);

  return respuestaDeEscritura(
    await servicio.actualizar(tenantId, id, normalizado.datos),
    200,
  );
}

function decodificar(segmento: string): string | null {
  if (segmento === "") return null;
  try {
    const valor = decodeURIComponent(segmento);
    return valor === "" ? null : valor;
  } catch {
    return null;
  }
}
