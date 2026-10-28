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
import {
  arancelSobreD1,
  type ServicioDeArancel,
} from "./arancel/repositorio";
import { rutasDeArancel } from "./arancel/rutas";
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
import {
  cotizacionesSobreD1,
  type ServicioDeCotizaciones,
} from "./cotizaciones/repositorio";
import { regimenDelBufete } from "./cotizaciones/impuesto";
import { rutasDeCotizaciones } from "./cotizaciones/rutas";
import {
  cuotasSobreD1,
  type ServicioDeCuotas,
} from "./cuotas/repositorio";
import { rutasDeCuotas } from "./cuotas/rutas";
import {
  almacenSobreR2,
  gastosSobreD1,
  type AlmacenDeComprobantes,
  type ServicioDeGastos,
} from "./gastos/repositorio";
import { rutasDeGastos } from "./gastos/rutas";
import { modeloDesdeEntorno, type ModeloDeLenguaje } from "./ia/modelo";
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
  plantillasSobreD1,
  type ServicioDePlantillas,
} from "./plantillas/repositorio";
import { rutasDePlantillas } from "./plantillas/rutas";
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
import { inicioSobreD1, type ServicioDelInicio } from "./inicio/repositorio";
import { rutasDelInicio } from "./inicio/rutas";

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

  /** Las cotizaciones en borrador (tajada 2, T-2). Idem. */
  cotizaciones?: ServicioDeCotizaciones;

  /**
   * El modelo de lenguaje del generador (tajada 2, T-9).
   *
   * **Es el mismo camino que usa producción**, y por eso vale como costura:
   * abajo se resuelve con `dependencias.modelo ?? modeloDesdeEntorno(env)`,
   * así que lo único que cambia entre una corrida de prueba y una desplegada
   * es quién construyó el objeto. La validación de esquema de T-8 está por
   * encima de los dos y corre igual con un modelo falso que con uno real.
   *
   * Sin esto, la única forma de probar el generador sería llamar a Anthropic
   * de verdad desde el suite, que es exactamente lo que una prueba no puede
   * hacer: cuesta plata, no es determinista y no corre sin la clave.
   *
   * T-8 declaró la interfaz y **no la cableó**, a conciencia: una
   * declaración que nadie lee no hace nada. Esta es la línea que la enchufa.
   */
  modelo?: ModeloDeLenguaje;

  /** Los gastos reales de un proceso y su saldo (tajada 2, T-10). Idem. */
  gastos?: ServicioDeGastos;

  /**
   * El almacén de los comprobantes (tajada 2, T-10).
   *
   * **Es el mismo camino que usa producción**, igual que `modelo`: abajo se
   * resuelve con `dependencias.comprobantes ?? almacenSobreR2(env)`, así que
   * lo único que cambia entre una corrida de prueba y una desplegada es quién
   * construyó el objeto.
   *
   * Sin esto, la única forma de probar los comprobantes sería escribir en un
   * R2 real desde el suite, que es exactamente lo que una prueba no puede
   * hacer: cuesta plata, no es determinista y no corre sin credenciales. Y
   * las ramas que más importan —el almacén sin configurar y el que no
   * contesta— no se podrían ejercer de ninguna otra manera.
   */
  comprobantes?: AlmacenDeComprobantes;

  /** El plan de pagos de una cotización o de un proceso (tajada 2, T-11). Idem. */
  cuotas?: ServicioDeCuotas;

  /** El arancel de honorarios y el precio del bufete (T-2). Idem. */
  arancel?: ServicioDeArancel;

  /**
   * Las plantillas de módulo y su descripción (T-2 de
   * `odd/tasks/plantillas-de-modulo.md`). Idem.
   */
  plantillas?: ServicioDePlantillas;

  /** El tablero de Inicio (`odd/tasks/inicio-tablero.md`). Idem. */
  inicio?: ServicioDelInicio;
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

  // El régimen de ITBMS del bufete (T-12), **resuelto una sola vez por
  // petición** y pasado a quien lo necesite.
  //
  // Una sola vez, y no una lectura del entorno en cada capa, por el mismo
  // motivo por el que `emitir` lee el reloj una sola vez: si las líneas, el
  // documento y la base del porcentaje resolvieran cada una por su cuenta,
  // una petición podría contestar con dos aritméticas distintas. Son el
  // mismo número o no son nada.
  //
  // **Hoy devuelve siempre `SIN_ITBMS`**, porque `ITBMS_ACTIVO` no está en
  // `wrangler.jsonc` y no debe estar hasta que la contadora del bufete
  // valide el tratamiento del impuesto (`odd/tasks/cotizaciones.md`). La
  // aritmética está construida y probada en sus dos posiciones; lo que falta
  // es una firma, no código.
  const impuesto = regimenDelBufete(env);

  const servicioDeClientes = dependencias.clientes ?? servicioSobreD1(base);

  const clientes = await rutasDeClientes(
    request,
    url,
    acceso.valor,
    TENANT_UNICO_ID,
    servicioDeClientes,
  );
  if (clientes !== null) return clientes;

  // Un solo servicio de plantillas de módulo para las **cuatro** rutas que lo
  // necesitan: la suya, la de su bitácora —que comprueba por el mismo puerto
  // que la plantilla existe en este bufete y no por una segunda copia de la
  // consulta—, desde T-3 el repositorio de cotizaciones, que le pide el rótulo
  // vigente de cada clave de módulo, y desde T-4 la ruta de cotizaciones, que
  // le pide el rótulo **y la descripción** para el prompt del generador.
  //
  // **Esta línea es la que cerró el 404 que T-1 dejó debiendo.** El `case` de
  // `modulo_plantilla` en `existeLaFila` devolvía `false` porque este puerto no
  // existía; lo que faltaba era el repositorio y este parámetro.
  //
  // Se construye **antes** que el de cotizaciones y no al lado de su ruta, y
  // ése es el único motivo por el que estas veinte líneas se mudaron en T-3:
  // `cotizacionesSobreD1` lo recibe, y si se construyera después cada petición
  // armaría dos adaptadores de plantillas sobre la misma `BaseDeDatos`.
  const servicioDePlantillas =
    dependencias.plantillas ?? plantillasSobreD1(base);

  // Un solo servicio de cotizaciones para las dos rutas que lo necesitan:
  // la suya y la de su bitácora, que comprueba por el mismo puerto que la
  // fila existe en este bufete y no por una segunda copia de la consulta.
  const servicioDeCotizaciones =
    dependencias.cotizaciones ??
    cotizacionesSobreD1(base, impuesto, servicioDePlantillas);

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

  // La bitácora es subruta de **las seis** colecciones que la exponen, y
  // las seis devuelven `null` para ella: `manejarPlano` corta en
  // `segmentos.length !== 3`, `manejarTiposProceso` solo reconoce `etapas`
  // como cuarto segmento, y clientes y procesos ya lo hacían desde T-10.
  // Por eso el orden no cambia qué contesta cada una — pero deja el reparto
  // escrito, y el día que un catálogo estrene otra subruta esto es lo
  // primero que hay que releer.
  // Un solo servicio de arancel para las dos rutas que lo necesitan: la suya
  // y la de su bitácora, que comprueba por el mismo puerto que el renglón
  // existe en este bufete y no por una segunda copia de la consulta.
  const servicioDeArancel = dependencias.arancel ?? arancelSobreD1(base);

  const bitacora = await rutasDeBitacora(
    request,
    url,
    TENANT_UNICO_ID,
    servicioDeProcesos,
    servicioDeClientes,
    servicioDeCatalogos,
    servicioDeCotizaciones,
    servicioDeArancel,
    servicioDePlantillas,
    dependencias.bitacora ?? bitacoraSobreD1(base),
  );
  if (bitacora !== null) return bitacora;

  // El arancel va **después** de la bitácora porque ésta es una subruta suya:
  // `rutasDeArancel` corta en `segmentos.length !== 3` y devuelve `null` para
  // `/bitacora`, así que el orden no cambia qué contesta cada una, pero deja
  // el reparto escrito.
  const arancel = await rutasDeArancel(
    request,
    url,
    TENANT_UNICO_ID,
    servicioDeArancel,
  );
  if (arancel !== null) return arancel;

  // Las plantillas de módulo, por lo mismo que el arancel: la bitácora es una
  // subruta suya. `rutasDePlantillas` corta en `segmentos.length !== 3` y
  // devuelve `null` para `/bitacora`, así que el orden no cambia qué contesta
  // cada una, pero deja el reparto escrito.
  const plantillas = await rutasDePlantillas(
    request,
    url,
    TENANT_UNICO_ID,
    servicioDePlantillas,
  );
  if (plantillas !== null) return plantillas;

  // Las cotizaciones van **después** de la bitácora porque ésta es una
  // subruta suya: `rutasDeCotizaciones` corta en `segmentos.length !== 3` y
  // devuelve `null` para `/bitacora`, así que el orden no cambia qué
  // contesta cada una, pero deja el reparto escrito.
  const cotizaciones = await rutasDeCotizaciones(
    request,
    url,
    acceso.valor,
    TENANT_UNICO_ID,
    servicioDeCotizaciones,
    // El mismo servicio de catálogos que las demás rutas, no una segunda
    // copia: el generador le ofrece al modelo los trámites que la pantalla
    // de catálogos administra, leídos por el mismo puerto.
    servicioDeCatalogos,
    // Y el mismo servicio de plantillas que las otras tres rutas, por el
    // mismo motivo (T-4): el generador le ofrece al modelo las plantillas que
    // la pantalla de `/catalogos/modulos` administra, con el rótulo y la
    // descripción resueltos una sola vez en `worker/plantillas/`.
    servicioDePlantillas,
    // **Se construye siempre y no cuesta nada**: `modeloDesdeEntorno` no
    // toca la red ni lee la clave, sólo resuelve el proveedor. Un
    // proveedor mal configurado produce un modelo que falla con
    // `proveedor_desconocido` en cuanto se lo usa, que es la misma
    // precedencia que eligió `autenticar`: la guarda de configuración vive
    // dentro de la operación.
    dependencias.modelo ?? modeloDesdeEntorno(env),
    impuesto,
  );
  if (cotizaciones !== null) return cotizaciones;

  // El plan de pagos es **subruta de dos colecciones a la vez**, y ésa es la
  // decisión (c) de `migrations/0010_plan_de_pagos.sql` vista desde el
  // ruteo: una cuota cuelga de una cotización o de un proceso, y de cuál
  // cuelga lo dice la dirección y nunca el cuerpo.
  //
  // Va después de cotizaciones y antes de procesos, aunque el orden no
  // cambie qué contesta cada una —`rutasDeCotizaciones` corta en
  // `segmentos.length !== 3` y `rutasDeProcesos` devuelve `null` para sus
  // subrutas—, porque deja el reparto escrito.
  //
  // Los dos puertos que recibe son **los mismos** que usan las demás rutas y
  // no copias: el de cotizaciones comprueba que existe y además da las
  // líneas de las que sale la base del porcentaje, y el de procesos
  // comprueba el trámite suelto.
  const cuotas = await rutasDeCuotas(
    request,
    url,
    TENANT_UNICO_ID,
    servicioDeCotizaciones,
    servicioDeProcesos,
    dependencias.cuotas ?? cuotasSobreD1(base),
    impuesto,
  );
  if (cuotas !== null) return cuotas;

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

  // Los gastos reales, por lo mismo que las notas: son una subruta del
  // proceso y comprueban su existencia por el mismo puerto. El almacén se
  // construye siempre y no cuesta nada —`almacenSobreR2` no toca la red, sólo
  // mira si el binding está—, y un despliegue sin bucket produce un almacén
  // que falla con `almacen_no_configurado` en cuanto se lo usa: la misma
  // precedencia que eligieron `autenticar` y `modeloDesdeEntorno`.
  const gastos = await rutasDeGastos(
    request,
    url,
    acceso.valor,
    TENANT_UNICO_ID,
    servicioDeProcesos,
    dependencias.gastos ?? gastosSobreD1(base),
    dependencias.comprobantes ?? almacenSobreR2(env),
  );
  if (gastos !== null) return gastos;

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

  // El tablero de Inicio. Va al final porque no es subruta de nadie ni
  // tiene subrutas: `/api/inicio` no lo reclama ninguna de las de arriba.
  const inicio = await rutasDelInicio(
    request,
    url,
    acceso.valor,
    TENANT_UNICO_ID,
    dependencias.inicio ?? inicioSobreD1(base),
  );
  if (inicio !== null) return inicio;

  return noEncontrado();
}

export default {
  fetch(request, env): Promise<Response> {
    return manejar(request, env);
  },
} satisfies ExportedHandler<Env>;
