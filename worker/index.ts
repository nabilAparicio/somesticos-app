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
import { TENANT_UNICO_ID } from "./db/ids";
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

  // El servicio se construye recién acá, después de la puerta: antes no hay a
  // nombre de quién consultar nada.
  const clientes = await rutasDeClientes(
    request,
    url,
    acceso.valor,
    TENANT_UNICO_ID,
    dependencias.clientes ?? servicioSobreD1(env.DB),
  );
  if (clientes !== null) return clientes;

  // Un solo servicio de catálogos para las dos rutas: desde T-11, guardar el
  // plan de un proceso como plantilla escribe por el mismo puerto que la
  // pantalla de catálogos, y no por una segunda copia.
  const servicioDeCatalogos = dependencias.catalogos ?? catalogosSobreD1(env.DB);

  const catalogos = await rutasDeCatalogos(
    request,
    url,
    TENANT_UNICO_ID,
    servicioDeCatalogos,
  );
  if (catalogos !== null) return catalogos;

  const procesos = await rutasDeProcesos(
    request,
    url,
    TENANT_UNICO_ID,
    dependencias.procesos ?? procesosSobreD1(env.DB),
    servicioDeCatalogos,
  );
  if (procesos !== null) return procesos;

  return noEncontrado();
}

export default {
  fetch(request, env): Promise<Response> {
    return manejar(request, env);
  },
} satisfies ExportedHandler<Env>;
