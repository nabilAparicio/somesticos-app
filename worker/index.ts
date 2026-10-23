/**
 * Entry Worker. Serves the API; everything else falls through to the SPA
 * assets (see `assets.run_worker_first` in wrangler.jsonc).
 *
 * `/api/health` es público a propósito: un endpoint de salud detrás de
 * autenticación no sirve para monitorear, y no revela nada que importe. Todo
 * lo demás bajo `/api/` exige una identidad resuelta contra `usuario`,
 * **incluidas las rutas que no existen**: si el 404 saliera antes de la
 * puerta, cualquiera podría enumerar la API sin entrar.
 */
import { autenticar, type DependenciasDeAcceso } from "./acceso/puerta";
import type { Rechazo } from "./acceso/rechazo";
import {
  bitacoraSobreD1,
  type ServicioDeBitacora,
} from "./bitacora/repositorio";
import { rutasDeBitacora } from "./bitacora/rutas";
import {
  catalogosSobreD1,
  type ServicioDeCatalogos,
} from "./catalogos/repositorio";
import { rutasDeCatalogos } from "./catalogos/rutas";
import { rutasDeClientes } from "./clientes/rutas";
import {
  servicioSobreD1,
  type ServicioDeClientes,
} from "./clientes/repositorio";
import type {
  AccesoDenegado,
  HealthReport,
  IdentidadActual,
} from "./contract";
import { baseSobreD1 } from "./db/base";
import { TENANT_UNICO_ID } from "./db/ids";
import { notasSobreD1, type ServicioDeNotas } from "./notas/repositorio";
import { rutasDeNotas } from "./notas/rutas";
import {
  pendientesSobreD1,
  type ServicioDePendientes,
} from "./pendientes/repositorio";
import { rutasDePendientes } from "./pendientes/rutas";
import {
  usuariosSobreD1,
  type ServicioDeUsuarios,
} from "./usuarios/repositorio";
import { rutasDeUsuarios } from "./usuarios/rutas";
import {
  procesosSobreD1,
  type ServicioDeProcesos,
} from "./procesos/repositorio";
import { rutasDeProcesos } from "./procesos/rutas";

export interface DependenciasDelManejador extends DependenciasDeAcceso {
  /**
   * El dominio de clientes. Se puede sustituir para probar que una petición
   * sin identidad **no llega hasta él**: con el servicio real, un 403 no
   * distingue "no se ejecutó" de "se ejecutó y después se rechazó".
   */
  clientes?: ServicioDeClientes;

  /** Los catálogos del bufete (T-6). Se sustituye por la misma razón. */
  catalogos?: ServicioDeCatalogos;

  /** Los procesos y su plan de trabajo (T-7). Idem. */
  procesos?: ServicioDeProcesos;

  /** Las notas y su línea de tiempo (T-8). Idem. */
  notas?: ServicioDeNotas;

  /** Los pendientes del proceso (T-9). Idem. */
  pendientes?: ServicioDePendientes;

  /** Las personas del bufete (T-9). Idem. */
  usuarios?: ServicioDeUsuarios;

  /** La bitácora (T-10). Solo se lee; escribirla es de `BaseDeDatos`. */
  bitacora?: ServicioDeBitacora;
}

async function checkD1(db: D1Database): Promise<HealthReport["d1"]> {
  try {
    const row = await db.prepare("SELECT 1 AS ok").first<{ ok: number }>();
    return row?.ok === 1 ? "ok" : "error";
  } catch {
    return "error";
  }
}

async function health(env: Env): Promise<Response> {
  const d1 = await checkD1(env.DB);
  const report: HealthReport = {
    status: d1 === "ok" ? "ok" : "degraded",
    d1,
    timestamp: new Date().toISOString(),
  };

  return Response.json(report, {
    status: report.status === "ok" ? 200 : 503,
    headers: { "cache-control": "no-store" },
  });
}

function noEncontrado(): Response {
  return Response.json({ error: "not_found" }, { status: 404 });
}

function metodoNoPermitido(permitidos: string): Response {
  return Response.json(
    { error: "method_not_allowed" },
    { status: 405, headers: { allow: permitidos } },
  );
}

function respuestaDeRechazo(rechazo: Rechazo): Response {
  const cuerpo: AccesoDenegado = {
    error: "acceso_denegado",
    motivo: rechazo.motivo,
  };

  return Response.json(cuerpo, {
    status: rechazo.estado,
    headers: { "cache-control": "no-store" },
  });
}

/**
 * El manejador real. Toma sus dependencias explícitas para que las pruebas
 * puedan sustituir el origen de las claves públicas —y solo eso— sin tocar la
 * verificación ni el ruteo.
 */
export async function manejar(
  request: Request,
  env: Env,
  dependencias: DependenciasDelManejador = {},
): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === "/api/health") {
    if (request.method !== "GET") return metodoNoPermitido("GET");
    return health(env);
  }

  const acceso = await autenticar(request, env, dependencias);
  if (!acceso.ok) return respuestaDeRechazo(acceso.rechazo);

  if (url.pathname === "/api/yo") {
    if (request.method !== "GET") return metodoNoPermitido("GET");

    const identidad: IdentidadActual = acceso.valor;
    return Response.json(identidad, {
      headers: { "cache-control": "no-store" },
    });
  }

  // **El único punto del sistema donde se envuelve `env.DB`.**
  //
  // De acá para adentro nadie tiene un `D1Database`: los adaptadores reciben
  // `BaseDeDatos`, que sabe leer y sabe `mutar(evento, …)`, y nada más. Esa
  // es la forma en que T-10 hace que olvidarse de registrar no sea un
  // descuido posible sino un error de compilación (ver `worker/db/base.ts`).
  //
  // Se construye recién acá, **después de la puerta**, por dos razones que
  // son la misma: antes no hay a nombre de quién consultar nada, y antes no
  // hay a nombre de quién firmar nada. El autor y el tenant quedan atados a
  // la base de esta petición, así que ningún adaptador puede firmar por otro
  // (I-6) ni escribir en otro bufete (I-8).
  const base = baseSobreD1(env.DB, TENANT_UNICO_ID, acceso.valor.usuarioId);

  const servicioDeClientes = dependencias.clientes ?? servicioSobreD1(base);

  const clientes = await rutasDeClientes(
    request,
    url,
    acceso.valor,
    TENANT_UNICO_ID,
    servicioDeClientes,
  );
  if (clientes !== null) return clientes;

  // Un solo servicio de catálogos para las dos rutas: desde T-11, guardar el
  // plan de un proceso como plantilla escribe por el mismo puerto que la
  // pantalla de catálogos, y no por una segunda copia.
  const servicioDeCatalogos = dependencias.catalogos ?? catalogosSobreD1(base);

  const catalogos = await rutasDeCatalogos(
    request,
    url,
    TENANT_UNICO_ID,
    servicioDeCatalogos,
  );
  if (catalogos !== null) return catalogos;

  // Un solo servicio de procesos para las dos rutas: las notas cuelgan del
  // proceso y comprueban su existencia por el mismo puerto, no por una
  // segunda copia de la consulta.
  const servicioDeProcesos = dependencias.procesos ?? procesosSobreD1(base);

  // La bitácora va **antes** que las notas, los pendientes y los procesos:
  // `/api/{procesos|clientes}/{id}/bitacora` es subruta de las dos
  // colecciones, y las dos devuelven `null` para ella, así que el orden no
  // cambia qué contesta cada una — pero deja el reparto escrito.
  const bitacora = await rutasDeBitacora(
    request,
    url,
    TENANT_UNICO_ID,
    servicioDeProcesos,
    servicioDeClientes,
    dependencias.bitacora ?? bitacoraSobreD1(base),
  );
  if (bitacora !== null) return bitacora;

  // Las notas van **antes** que los procesos porque son una subruta suya:
  // `rutasDeProcesos` devuelve `null` para `/notas`, así que el orden no
  // cambia qué contesta cada una, pero sí deja el reparto escrito.
  const notas = await rutasDeNotas(
    request,
    url,
    acceso.valor,
    TENANT_UNICO_ID,
    servicioDeProcesos,
    dependencias.notas ?? notasSobreD1(base),
  );
  if (notas !== null) return notas;

  // Los pendientes, por lo mismo que las notas: son una subruta del proceso
  // y comprueban su existencia por el mismo puerto.
  const pendientes = await rutasDePendientes(
    request,
    url,
    acceso.valor,
    TENANT_UNICO_ID,
    servicioDeProcesos,
    dependencias.pendientes ?? pendientesSobreD1(base),
  );
  if (pendientes !== null) return pendientes;

  // Las personas del bufete (T-9). Solo se leen: quién entra lo deciden
  // Access y la fila en `usuario`, no esta API.
  const usuarios = await rutasDeUsuarios(
    request,
    url,
    TENANT_UNICO_ID,
    dependencias.usuarios ?? usuariosSobreD1(base),
  );
  if (usuarios !== null) return usuarios;

  const procesos = await rutasDeProcesos(
    request,
    url,
    TENANT_UNICO_ID,
    servicioDeProcesos,
    servicioDeCatalogos,
    base,
  );
  if (procesos !== null) return procesos;

  return noEncontrado();
}

export default {
  fetch(request, env): Promise<Response> {
    return manejar(request, env);
  },
} satisfies ExportedHandler<Env>;
