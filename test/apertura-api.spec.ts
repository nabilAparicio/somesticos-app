/**
 * De cotización ganada a procesos (`odd/tasks/cotizaciones.md`, T-7 y T-13).
 *
 * Es donde las dos mitades del sistema se tocan, y **T-13 cambió quién
 * decide dónde**. Hasta `0010`, ganar abría un proceso por cada línea con
 * `tipo_proceso_id`, en la misma transacción: el reparto de líneas a
 * expedientes lo imponía la estructura. Ahora ganar no abre nada y el
 * bufete confirma la lista en `POST /api/cotizaciones/{id}/procesos`,
 * porque la línea es una unidad de facturación y el proceso una unidad de
 * trabajo, y constituir y registrar una sociedad pueden ser un expediente
 * o dos sin que eso se siga de cómo se cobra.
 *
 * ## Qué prueba esta suite y qué no
 *
 * **Los invariantes de la base no se prueban acá.** I-3 —el proceso nacido
 * de una cotización comparte cliente con ella—, la coherencia entre
 * `origen` y `cotizacion_id`, y la guarda que impide mudarle el cliente a
 * una cotización que ya abrió procesos viven en
 * `migrations/0011_el_proceso_cuelga_de_la_cotizacion.sql` y se prueban
 * **por rechazo** en `test/esquema-cotizaciones.spec.ts`, que es su dueño.
 *
 * Acá se prueba lo que la base no puede sostener:
 *
 *  - **Que ganar no abra nada, y que eso se mida y no se suponga.** Es la
 *    mitad de T-13 que se ve desde afuera, y la que una prueba de presencia
 *    sola no cubriría: hace falta una cotización con trámites de sobra que
 *    después de ganarse siga en cero.
 *  - **Que nazca exactamente lo que se confirmó**, con su tipo, su título y
 *    su responsable, colgado de la cotización y con el cliente de ella.
 *  - **Los cuatro rechazos, cada uno por rechazo**: la cotización que no
 *    existe, la que no está ganada, la lista vacía y las llaves que no son
 *    de este bufete.
 *  - **Que el plan se copie de la plantilla al nacer** y no quede atado a
 *    ella, que es la propiedad que la tajada 1 llama «la plantilla siembra,
 *    el proceso manda».
 *  - **Que se pueda abrir otro después**, que es el caso que el usuario
 *    pidió con todas las letras y el que la apertura automática no tenía.
 *
 * ## La propuesta no se prueba acá, y no es un olvido
 *
 * «Qué procesos sugieren las líneas de esta cotización» es una derivación
 * pura que vive en `src/pantallas/cotizaciones/ciclo.ts` y se prueba en
 * `test/ciclo-ui.spec.ts`. No hay ruta que la pida —no existe un `GET` de
 * la propuesta— así que no hay nada de ella que medir desde acá. Lo que
 * esta suite manda son listas escritas a mano, que además es lo que la
 * restricción 6 de la tajada exige: una prueba que calcula lo que espera
 * con la misma función que prueba pasa aunque las dos estén mal.
 *
 * ## Lo que la apertura deliberadamente NO tiene: guarda de «ya abrió»
 *
 * Abrir **no es una transición**, es aditivo, y no existe un juego de
 * procesos correcto del que una segunda llamada sea una repetición: el
 * bufete pidió explícitamente poder abrir otro meses después. Por eso no
 * hay idempotencia acá y hay en cambio una prueba que mide lo contrario —
 * que la segunda apertura suma y no reemplaza.
 *
 * ## No hay limpieza entre pruebas
 *
 * Desde `0006` una cotización que salió del borrador y sus hijas son
 * indelebles, y desde `0011` los procesos nacidos de ella agregan otra
 * arista: la llave foránea `proceso.cotizacion_id` deja a la cotización sin
 * poder borrarse. El almacenamiento está aislado por archivo y cada prueba
 * trabaja con identificadores nuevos.
 *
 * Los valores esperados se escriben a mano y no salen de ninguna función del
 * Worker (restricción 6 de la tajada).
 */
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { TENANT_UNICO_ID, nuevoId } from "../worker/db/ids";
import { ahoraIso } from "../worker/db/momentos";
import { manejar } from "../worker/index";

const DOMINIO_DE_ACCESS = "https://bufete-de-prueba.cloudflareaccess.com";
const AUD = "aud-de-la-aplicacion-del-bufete";

const EMAIL_AUTOR = "itzel@bufete.test";
const NOMBRE_AUTOR = "Itzel";

/** El bufete vecino, para medir el filtro de tenencia (I-8). */
const OTRO_TENANT_ID = "tenant-del-bufete-vecino";

/** Las tres etapas de la plantilla del tipo con plan. */
const PLAN_DE_VISA = [
  "Recepción de documentos",
  "Presentación ante Migración",
  "Entrega del carné",
];

/** Las dos del segundo tipo, para que un reparto cruzado se note. */
const PLAN_DE_RESIDENCIA = ["Apertura de expediente", "Resolución"];

interface CotizacionEnElCable {
  id: string;
  codigo: string;
  estado: string;
  clienteId: string;
}

/** La fila de `proceso`, leída de la base y no del cable. */
interface FilaDeProceso {
  id: string;
  tenant_id: string;
  cliente_id: string;
  tipo_proceso_id: string;
  origen: string;
  titulo: string;
  estado: string;
  responsable_id: string | null;
  cotizacion_id: string | null;
}

let autorId: string;
let clienteId: string;
/** El tipo con tres etapas de plantilla. */
let tipoVisaId: string;
/** El tipo con dos. */
let tipoResidenciaId: string;
/** Un tipo **sin** plantilla, para el proceso que nace sin plan. */
let tipoSinPlanId: string;
/** Un tipo de proceso del bufete vecino: el que la apertura tiene que negar. */
let tipoAjenoId: string;
/** Una cotización ganada del bufete vecino. Tiene que contestar 404. */
let cotizacionAjenaId: string;

function entorno(): Env {
  return {
    ...env,
    ACCESO_TEAM_DOMAIN: DOMINIO_DE_ACCESS,
    ACCESO_AUD: AUD,
    ACCESO_DEV_EMAIL: undefined,
  };
}

function peticion(ruta: string, init?: RequestInit): Request {
  return new Request(`https://cotizador.bufete.pa${ruta}`, init);
}

function conCuerpo(ruta: string, metodo: string, cuerpo: unknown): Request {
  return peticion(ruta, {
    method: metodo,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
}

function comoAutor(request: Request): Promise<Response> {
  return manejar(request, entorno(), { correoDeDesarrollo: () => EMAIL_AUTOR });
}

function emitir(id: string): Promise<Response> {
  return comoAutor(
    peticion(`/api/cotizaciones/${id}/emitir`, { method: "POST" }),
  );
}

function ganar(id: string): Promise<Response> {
  return comoAutor(
    peticion(`/api/cotizaciones/${id}/ganar`, { method: "POST" }),
  );
}

function perder(id: string): Promise<Response> {
  return comoAutor(
    peticion(`/api/cotizaciones/${id}/perder`, { method: "POST" }),
  );
}

/**
 * La ruta de T-13, con el cuerpo tal cual.
 *
 * `procesos` es `unknown` y no una lista tipada a propósito: la mitad de
 * las pruebas de rechazo mandan cuerpos que el contrato no admite —una
 * lista vacía, una fila que es un número, un `procesos` que es una cadena—
 * y un tipo estricto acá obligaría a un `as` en cada una, que es la forma
 * de tapar justo lo que se quiere medir.
 */
function abrir(cotizacionId: string, procesos: unknown): Promise<Response> {
  return comoAutor(
    conCuerpo(`/api/cotizaciones/${cotizacionId}/procesos`, "POST", {
      procesos,
    }),
  );
}

async function crearBorrador(): Promise<CotizacionEnElCable> {
  const respuesta = await comoAutor(
    conCuerpo("/api/cotizaciones", "POST", { clienteId, venceEn: null }),
  );
  expect(respuesta.status, await respuesta.clone().text()).toBe(201);
  const cuerpo = (await respuesta.json()) as {
    cotizacion: CotizacionEnElCable;
  };
  return cuerpo.cotizacion;
}

async function agregarLinea(
  cotizacionId: string,
  linea: {
    clase: string;
    concepto: string;
    monto: number;
    tipoProcesoId?: string | null;
  },
): Promise<void> {
  const respuesta = await comoAutor(
    conCuerpo(`/api/cotizaciones/${cotizacionId}/lineas`, "POST", linea),
  );
  expect(respuesta.status, await respuesta.clone().text()).toBe(201);
}

/** Los identificadores que la apertura dijo haber abierto. */
async function abiertosDe(respuesta: Response): Promise<unknown> {
  const cuerpo = (await respuesta.json()) as { abiertos?: unknown };
  return cuerpo.abiertos;
}

/** Los motivos del 422, sin el campo. */
async function motivosDe(respuesta: Response): Promise<string[]> {
  const cuerpo = (await respuesta.json()) as {
    fallas?: { campo: string; motivo: string }[];
  };
  return (cuerpo.fallas ?? []).map((falla) => falla.motivo);
}

/** Las fallas del 422 enteras, cuando lo que importa es en qué fila cayeron. */
async function fallasDe(
  respuesta: Response,
): Promise<{ campo: string; motivo: string }[]> {
  const cuerpo = (await respuesta.json()) as {
    fallas?: { campo: string; motivo: string }[];
  };
  return cuerpo.fallas ?? [];
}

/**
 * Los procesos nacidos de una cotización, en el orden en que nacieron.
 *
 * **Con T-13 el salto por la línea desapareció y el orden cambió de
 * fuente**, y eso no es cosmética: antes el `ORDER BY l.orden` leía el orden
 * de las líneas, y ahora no hay línea de la que leerlo. Se ordena por
 * `abierto_en` y, para desempatar dentro del mismo instante —dos procesos
 * abiertos en la misma petición pueden compartir el momento al
 * milisegundo—, por `rowid`, que es el orden en que las sentencias
 * entraron. Y ése es el orden de la lista que se confirmó:
 * `abrirProcesos` la recorre tal cual.
 *
 * El contrapeso de esa afirmación está en la prueba del orden, que compara
 * los títulos contra los que se mandaron **en su orden**: si esta función
 * dejara de devolver el orden de nacimiento, esa prueba se pone roja.
 */
async function procesosDe(cotizacionId: string): Promise<FilaDeProceso[]> {
  const { results } = await env.DB.prepare(
    "SELECT p.* FROM proceso p" +
      " WHERE p.cotizacion_id = ? ORDER BY p.abierto_en, p.rowid",
  )
    .bind(cotizacionId)
    .all<FilaDeProceso>();

  return results;
}

/** El plan de un proceso, en su orden. */
async function planDe(
  procesoId: string,
): Promise<{ nombre: string; orden: number; alcanzada_en: string | null }[]> {
  const { results } = await env.DB.prepare(
    "SELECT nombre, orden, alcanzada_en FROM proceso_etapa" +
      " WHERE proceso_id = ? ORDER BY orden",
  )
    .bind(procesoId)
    .all<{ nombre: string; orden: number; alcanzada_en: string | null }>();

  return results;
}

/** El estado crudo de la cotización, sin pasar por la API. */
async function estadoDe(cotizacionId: string): Promise<string | undefined> {
  const fila = await env.DB.prepare(
    "SELECT estado FROM cotizacion WHERE id = ?",
  )
    .bind(cotizacionId)
    .first<{ estado: string }>();

  return fila?.estado;
}

/** Lo registrado contra una entidad, de lo más viejo a lo más nuevo. */
async function bitacoraDe(
  entidad: string,
  entidadId: string,
): Promise<{ accion: string; detalle: string | null }[]> {
  const { results } = await env.DB.prepare(
    "SELECT accion, detalle FROM bitacora WHERE entidad = ?" +
      " AND entidad_id = ? ORDER BY ocurrido_en, rowid",
  )
    .bind(entidad, entidadId)
    .all<{ accion: string; detalle: string | null }>();

  return results;
}

/**
 * Cuántas entradas tiene la bitácora contra procesos, en todo el archivo.
 *
 * Se cuenta de golpe y no por proceso porque la prueba que la usa mide que
 * una apertura abortada **no deje ninguna**, y el identificador del proceso
 * que no nació no existe: no hay contra qué preguntar. El contrapeso es el
 * conteo de antes, tomado en la misma prueba.
 */
async function cuantasEntradasDeProceso(): Promise<number> {
  const fila = await env.DB.prepare(
    "SELECT count(*) AS n FROM bitacora WHERE entidad = 'proceso'",
  ).first<{ n: number }>();

  return fila?.n ?? 0;
}

/**
 * Una cotización emitida con el reparto que casi todas las pruebas usan:
 * dos líneas con tipo de proceso y dos sin él.
 *
 * Los montos no son redondos para que una línea perdida o duplicada no dé
 * por casualidad el mismo total.
 */
async function emitirConDosTramites(): Promise<CotizacionEnElCable> {
  const borrador = await crearBorrador();

  await agregarLinea(borrador.id, {
    clase: "honorario",
    concepto: "Visa de trabajo",
    monto: 150_000,
    tipoProcesoId: tipoVisaId,
  });
  await agregarLinea(borrador.id, {
    clase: "honorario",
    concepto: "Consulta inicial",
    monto: 12_345,
  });
  await agregarLinea(borrador.id, {
    clase: "honorario",
    concepto: "Permiso de residencia",
    monto: 220_000,
    tipoProcesoId: tipoResidenciaId,
  });
  await agregarLinea(borrador.id, {
    clase: "gasto_estimado",
    concepto: "Timbres fiscales",
    monto: 7_550,
  });

  expect((await emitir(borrador.id)).status).toBe(200);
  return borrador;
}

/** Una emitida cuyas líneas son todas cobros que no abren trámite. */
async function emitirSinTramites(): Promise<CotizacionEnElCable> {
  const borrador = await crearBorrador();

  await agregarLinea(borrador.id, {
    clase: "honorario",
    concepto: "Consulta de una hora",
    monto: 9_900,
  });
  await agregarLinea(borrador.id, {
    clase: "gasto_estimado",
    concepto: "Mensajería",
    monto: 1_250,
  });

  expect((await emitir(borrador.id)).status).toBe(200);
  return borrador;
}

beforeAll(async () => {
  autorId = nuevoId();
  clienteId = nuevoId();
  tipoVisaId = nuevoId();
  tipoResidenciaId = nuevoId();
  tipoSinPlanId = nuevoId();

  tipoAjenoId = nuevoId();
  cotizacionAjenaId = nuevoId();

  const tipoClienteId = nuevoId();
  const areaId = nuevoId();
  const autorAjenoId = nuevoId();
  const tipoClienteAjenoId = nuevoId();
  const clienteAjenoId = nuevoId();
  const areaAjenaId = nuevoId();
  const ahora = ahoraIso();

  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO usuario (id, tenant_id, nombre, email, activo)" +
        " VALUES (?, ?, ?, ?, 1)",
    ).bind(autorId, TENANT_UNICO_ID, NOMBRE_AUTOR, EMAIL_AUTOR),
    env.DB.prepare(
      "INSERT INTO tipo_cliente (id, tenant_id, nombre) VALUES (?, ?, ?)",
    ).bind(tipoClienteId, TENANT_UNICO_ID, "Persona jurídica"),
    env.DB.prepare(
      "INSERT INTO cliente (id, tenant_id, tipo_cliente_id, nombre," +
        " creado_por, creado_en) VALUES (?, ?, ?, ?, ?, ?)",
    ).bind(
      clienteId,
      TENANT_UNICO_ID,
      tipoClienteId,
      "Constructora del Istmo, S.A.",
      autorId,
      ahora,
    ),
    env.DB.prepare(
      "INSERT INTO area (id, tenant_id, nombre) VALUES (?, ?, ?)",
    ).bind(areaId, TENANT_UNICO_ID, "Migración"),
    env.DB.prepare(
      "INSERT INTO tipo_proceso (id, tenant_id, area_id, nombre)" +
        " VALUES (?, ?, ?, ?)",
    ).bind(tipoVisaId, TENANT_UNICO_ID, areaId, "Visa de trabajo"),
    env.DB.prepare(
      "INSERT INTO tipo_proceso (id, tenant_id, area_id, nombre)" +
        " VALUES (?, ?, ?, ?)",
    ).bind(tipoResidenciaId, TENANT_UNICO_ID, areaId, "Permiso de residencia"),
    env.DB.prepare(
      "INSERT INTO tipo_proceso (id, tenant_id, area_id, nombre)" +
        " VALUES (?, ?, ?, ?)",
    ).bind(tipoSinPlanId, TENANT_UNICO_ID, areaId, "Trámite sin plantilla"),

    ...PLAN_DE_VISA.map((nombre, orden) =>
      env.DB.prepare(
        "INSERT INTO etapa_plantilla (id, tenant_id, tipo_proceso_id," +
          " nombre, orden) VALUES (?, ?, ?, ?, ?)",
      ).bind(nuevoId(), TENANT_UNICO_ID, tipoVisaId, nombre, orden),
    ),
    ...PLAN_DE_RESIDENCIA.map((nombre, orden) =>
      env.DB.prepare(
        "INSERT INTO etapa_plantilla (id, tenant_id, tipo_proceso_id," +
          " nombre, orden) VALUES (?, ?, ?, ?, ?)",
      ).bind(nuevoId(), TENANT_UNICO_ID, tipoResidenciaId, nombre, orden),
    ),

    /* El bufete vecino, con un trámite suyo y una cotización suya ya
       ganada. Los dos existen para las pruebas de tenencia, y los dos
       tienen que estar en el estado que **no** permite confundir el
       rechazo con otro: la cotización va `ganada` para que el 404 por
       tenencia no se pueda leer como el 409 por estado, y el tipo de
       proceso existe de verdad para que el 422 mida el filtro de tenencia
       y no un identificador inventado. */
    env.DB.prepare("INSERT INTO tenant (id, nombre) VALUES (?, ?)").bind(
      OTRO_TENANT_ID,
      "Otro bufete",
    ),
    env.DB.prepare(
      "INSERT INTO usuario (id, tenant_id, nombre, email) VALUES (?, ?, ?, ?)",
    ).bind(autorAjenoId, OTRO_TENANT_ID, "Ajena", "ajena@otro-bufete.test"),
    env.DB.prepare(
      "INSERT INTO tipo_cliente (id, tenant_id, nombre) VALUES (?, ?, ?)",
    ).bind(tipoClienteAjenoId, OTRO_TENANT_ID, "Particular"),
    env.DB.prepare(
      "INSERT INTO cliente (id, tenant_id, tipo_cliente_id, nombre," +
        " creado_por, creado_en) VALUES (?, ?, ?, ?, ?, ?)",
    ).bind(
      clienteAjenoId,
      OTRO_TENANT_ID,
      tipoClienteAjenoId,
      "Cliente del vecino",
      autorAjenoId,
      ahora,
    ),
    env.DB.prepare(
      "INSERT INTO area (id, tenant_id, nombre) VALUES (?, ?, ?)",
    ).bind(areaAjenaId, OTRO_TENANT_ID, "Migración del vecino"),
    env.DB.prepare(
      "INSERT INTO tipo_proceso (id, tenant_id, area_id, nombre)" +
        " VALUES (?, ?, ?, ?)",
    ).bind(tipoAjenoId, OTRO_TENANT_ID, areaAjenaId, "Trámite del vecino"),
    env.DB.prepare(
      "INSERT INTO cotizacion (id, tenant_id, cliente_id, codigo, estado," +
        " fecha, moneda, snapshot, creada_por, creada_en)" +
        " VALUES (?, ?, ?, ?, 'ganada', ?, 'USD', ?, ?, ?)",
    ).bind(
      cotizacionAjenaId,
      OTRO_TENANT_ID,
      clienteAjenoId,
      `COT-DEL-VECINO-${cotizacionAjenaId}`,
      ahora,
      '{"version":1}',
      autorAjenoId,
      ahora,
    ),
  ]);
});

describe("ganar ya no abre ningún proceso", () => {
  it("una ganada con dos líneas de trámite queda en cero procesos", async () => {
    // **La prueba que mide la mitad visible de T-13.** La cotización trae
    // dos líneas con `tipo_proceso_id` —exactamente las que hasta `0010`
    // producían dos expedientes— y después de ganarse no hay ninguno. Con
    // una cotización sin trámites esto pasaría igual sin medir nada.
    const cotizacion = await emitirConDosTramites();

    const respuesta = await ganar(cotizacion.id);
    expect(respuesta.status, await respuesta.clone().text()).toBe(200);

    expect(await procesosDe(cotizacion.id)).toHaveLength(0);
    expect(await estadoDe(cotizacion.id)).toBe("ganada");
  });

  it("y la respuesta no dice cuántos abrió, porque no abrió", async () => {
    // El conteo `procesosAbiertos` de T-7 se fue del contrato con el hecho
    // que contaba. Esto lo mide en vez de suponerlo: un campo que quedara
    // cableado a cero seguiría prometiendo una consecuencia que la ruta ya
    // no tiene.
    const cotizacion = await emitirConDosTramites();

    const respuesta = await ganar(cotizacion.id);
    const cuerpo = (await respuesta.json()) as Record<string, unknown>;

    expect(Object.keys(cuerpo)).toEqual(["cotizacion"]);
  });

  it("perder tampoco, por muchos tipos que lleve", async () => {
    // El espejo, que sobrevive a T-13 sin cambiar de pregunta: perder
    // nunca fue una puerta hacia `proceso` y sigue sin serlo.
    const cotizacion = await emitirConDosTramites();

    const respuesta = await perder(cotizacion.id);
    expect(respuesta.status, await respuesta.clone().text()).toBe(200);

    expect(await procesosDe(cotizacion.id)).toHaveLength(0);
  });
});

describe("abrir los procesos que el bufete confirmó", () => {
  it("nacen exactamente los de la lista, con su título y su tipo", async () => {
    const cotizacion = await emitirConDosTramites();
    expect((await ganar(cotizacion.id)).status).toBe(200);

    // La lista va escrita a mano y **no sale de las líneas**: es el punto
    // de la tarea. La cotización tiene dos líneas con trámite y acá se
    // abre uno solo, con un título que ninguna línea dice — que es
    // exactamente «fusionar dos en uno» visto desde la API.
    const respuesta = await abrir(cotizacion.id, [
      {
        tipoProcesoId: tipoVisaId,
        titulo: "Constitución y registro de la sociedad",
      },
    ]);
    expect(respuesta.status, await respuesta.clone().text()).toBe(201);

    const procesos = await procesosDe(cotizacion.id);
    expect(procesos).toHaveLength(1);
    expect(procesos[0].tipo_proceso_id).toBe(tipoVisaId);
    expect(procesos[0].titulo).toBe("Constitución y registro de la sociedad");
  });

  it("la respuesta trae los identificadores de lo que nació, en orden", async () => {
    const cotizacion = await emitirConDosTramites();
    expect((await ganar(cotizacion.id)).status).toBe(200);

    const respuesta = await abrir(cotizacion.id, [
      { tipoProcesoId: tipoVisaId, titulo: "Primero" },
      { tipoProcesoId: tipoResidenciaId, titulo: "Segundo" },
    ]);
    expect(respuesta.status).toBe(201);

    // Contra las filas y no contra sí misma: que la respuesta traiga dos
    // cadenas lo pasa cualquier arreglo de dos cadenas.
    const procesos = await procesosDe(cotizacion.id);
    expect(await abiertosDe(respuesta)).toEqual(
      procesos.map((fila) => fila.id),
    );
    // Y el orden es el de la lista que se mandó, no el alfabético ni el de
    // ninguna tabla. Los títulos están escritos a mano acá arriba.
    expect(procesos.map((fila) => fila.titulo)).toEqual(["Primero", "Segundo"]);
  });

  it("no lleva `location`, porque nacieron dos y la cabecera lleva una", async () => {
    const cotizacion = await emitirConDosTramites();
    expect((await ganar(cotizacion.id)).status).toBe(200);

    const respuesta = await abrir(cotizacion.id, [
      { tipoProcesoId: tipoVisaId, titulo: "Uno" },
      { tipoProcesoId: tipoResidenciaId, titulo: "Otro" },
    ]);

    expect(respuesta.status).toBe(201);
    expect(respuesta.headers.get("location")).toBeNull();
  });

  it("el proceso nace con origen 'cotizacion', abierto y apuntado a ella", async () => {
    const cotizacion = await emitirConDosTramites();
    expect((await ganar(cotizacion.id)).status).toBe(200);
    expect(
      (
        await abrir(cotizacion.id, [
          { tipoProcesoId: tipoVisaId, titulo: "Visa de trabajo" },
          { tipoProcesoId: tipoResidenciaId, titulo: "Permiso de residencia" },
        ])
      ).status,
    ).toBe(201);

    const procesos = await procesosDe(cotizacion.id);
    expect(procesos).toHaveLength(2);

    for (const proceso of procesos) {
      // `origen` es lo que distingue estos procesos de los que el bufete
      // abre a mano, y lo deriva el servidor de que haya una cotización
      // detrás: el cuerpo no tiene dónde pedirlo.
      expect(proceso.origen).toBe("cotizacion");
      expect(proceso.estado).toBe("abierto");
      // Todos a la **misma** cotización: con la arista vieja habrían sido
      // dos valores distintos, uno por línea.
      expect(proceso.cotizacion_id).toBe(cotizacion.id);
    }
  });

  it("el proceso comparte cliente con la cotización, que es I-3", async () => {
    const cotizacion = await emitirConDosTramites();
    expect((await ganar(cotizacion.id)).status).toBe(200);
    expect(
      (
        await abrir(cotizacion.id, [
          { tipoProcesoId: tipoVisaId, titulo: "Visa de trabajo" },
        ])
      ).status,
    ).toBe(201);

    for (const proceso of await procesosDe(cotizacion.id)) {
      expect(proceso.cliente_id).toBe(cotizacion.clienteId);
      expect(proceso.tenant_id).toBe(TENANT_UNICO_ID);
    }
  });

  it("el cliente sale de la cotización aunque el cuerpo mande otro", async () => {
    // **I-3 no se negocia desde afuera, y esto lo mide.** El cuerpo lleva
    // un `clienteId` que el contrato no declara; el normalizador lo
    // descarta y el repositorio pone el de la cotización. Sin eso, lo que
    // habría acá es un 500 del disparador de `0011` —o peor, un proceso
    // del cliente equivocado si alguna vez ese disparador se cayera.
    const otroCliente = nuevoId();
    await env.DB.prepare(
      "INSERT INTO cliente (id, tenant_id, nombre, creado_por, creado_en)" +
        " VALUES (?, ?, ?, ?, ?)",
    )
      .bind(
        otroCliente,
        TENANT_UNICO_ID,
        "Cliente que no es el de la cotización",
        autorId,
        ahoraIso(),
      )
      .run();

    const cotizacion = await emitirConDosTramites();
    expect((await ganar(cotizacion.id)).status).toBe(200);

    const respuesta = await abrir(cotizacion.id, [
      {
        tipoProcesoId: tipoVisaId,
        titulo: "Con un cliente colado en el cuerpo",
        clienteId: otroCliente,
      },
    ]);
    expect(respuesta.status, await respuesta.clone().text()).toBe(201);

    const [proceso] = await procesosDe(cotizacion.id);
    expect(proceso.cliente_id).toBe(cotizacion.clienteId);
    expect(proceso.cliente_id).not.toBe(otroCliente);
  });

  it("el responsable entra cuando viene, y queda nulo cuando no", async () => {
    // Las dos direcciones juntas: una aserción de ausencia no mide nada
    // sin su aserción de presencia al lado. Un `responsableId` cableado a
    // nulo pasaría sola la mitad que dice que sin responsable queda nulo.
    const cotizacion = await emitirConDosTramites();
    expect((await ganar(cotizacion.id)).status).toBe(200);

    expect(
      (
        await abrir(cotizacion.id, [
          {
            tipoProcesoId: tipoVisaId,
            titulo: "Con responsable",
            responsableId: autorId,
          },
          { tipoProcesoId: tipoResidenciaId, titulo: "Sin responsable" },
        ])
      ).status,
    ).toBe(201);

    const procesos = await procesosDe(cotizacion.id);
    expect(procesos.map((fila) => fila.responsable_id)).toEqual([
      autorId,
      null,
    ]);
  });

  it("se puede abrir otro después, que es lo que el bufete pidió", async () => {
    // **El caso que la apertura automática no tenía**, en palabras del
    // usuario: «¿qué sucede si como bufete no había visto este tipo de
    // caso y en este momento quiero crear este nuevo tipo de proceso?».
    // La segunda apertura **suma** y no reemplaza, y no hay guarda de
    // idempotencia que lo impida porque no habría un juego correcto del
    // que ésta fuera una repetición.
    const cotizacion = await emitirConDosTramites();
    expect((await ganar(cotizacion.id)).status).toBe(200);

    expect(
      (
        await abrir(cotizacion.id, [
          { tipoProcesoId: tipoVisaId, titulo: "El que se cotizó" },
        ])
      ).status,
    ).toBe(201);
    expect(
      (
        await abrir(cotizacion.id, [
          { tipoProcesoId: tipoSinPlanId, titulo: "El que apareció después" },
        ])
      ).status,
    ).toBe(201);

    expect((await procesosDe(cotizacion.id)).map((fila) => fila.titulo)).toEqual(
      ["El que se cotizó", "El que apareció después"],
    );
  });

  it("no hace falta que la línea lleve trámite: la lista manda", async () => {
    // Es el defecto que destapó T-13 —`COT-2026-0007`, nueve líneas y
    // ninguna con trámite porque el catálogo no tenía «divorcio»— y acá
    // muere: una cotización sin una sola línea de trámite abre el proceso
    // que el bufete decida.
    const cotizacion = await emitirSinTramites();
    expect((await ganar(cotizacion.id)).status).toBe(200);

    expect(
      (
        await abrir(cotizacion.id, [
          { tipoProcesoId: tipoVisaId, titulo: "El trámite que faltaba" },
        ])
      ).status,
    ).toBe(201);

    expect((await procesosDe(cotizacion.id)).map((fila) => fila.titulo)).toEqual(
      ["El trámite que faltaba"],
    );
  });
});

describe("los cuatro rechazos de la apertura, uno por uno", () => {
  it("404 sobre una cotización que no existe", async () => {
    const respuesta = await abrir(nuevoId(), [
      { tipoProcesoId: tipoVisaId, titulo: "No tiene dónde colgar" },
    ]);

    expect(respuesta.status).toBe(404);
  });

  it("404 sobre la cotización del bufete vecino, y no 403", async () => {
    // Un 403 confirmaría que ese identificador existe (I-8). Es la misma
    // decisión que toman las demás rutas de esta API.
    const respuesta = await abrir(cotizacionAjenaId, [
      { tipoProcesoId: tipoVisaId, titulo: "Del vecino" },
    ]);

    expect(respuesta.status).toBe(404);
    expect(await procesosDe(cotizacionAjenaId)).toHaveLength(0);
  });

  for (const [nombre, preparar, esperado] of [
    ["un borrador", crearBorrador, "borrador"],
    ["una emitida", emitirConDosTramites, "emitida"],
    [
      "una perdida",
      async () => {
        const cotizacion = await emitirConDosTramites();
        expect((await perder(cotizacion.id)).status).toBe(200);
        return cotizacion;
      },
      "perdida",
    ],
  ] as const) {
    it(`409 sobre ${nombre}, diciendo en qué estado quedó`, async () => {
      // Los tres son «no está ganada» y los tres mandan a hacer algo
      // distinto, por eso el estado viaja en el cuerpo. Un 409 que no lo
      // dijera obligaría a recargar para enterarse.
      const cotizacion = await preparar();

      const respuesta = await abrir(cotizacion.id, [
        { tipoProcesoId: tipoVisaId, titulo: "Todavía no" },
      ]);

      expect(respuesta.status, await respuesta.clone().text()).toBe(409);
      expect(await respuesta.json()).toEqual({
        error: "cotizacion_no_es_ganada",
        estado: esperado,
      });

      // El contrapeso sobre la consecuencia y no sobre el mensaje: no
      // nació nada.
      expect(await procesosDe(cotizacion.id)).toHaveLength(0);
    });
  }

  it("el 409 va antes que el 422: no se corrige una lista que no va a entrar", async () => {
    // El orden de los rechazos es lo único que la capa de rutas decide
    // acá, y sin esta prueba se podría invertir sin que nada se ponga
    // rojo. La lista está vacía —un 422 seguro— sobre una emitida.
    const cotizacion = await emitirConDosTramites();

    const respuesta = await abrir(cotizacion.id, []);

    expect(respuesta.status).toBe(409);
  });

  it("el 404 va antes que el 422, que es lo que no confirma la existencia", async () => {
    const respuesta = await abrir(cotizacionAjenaId, []);

    expect(respuesta.status).toBe(404);
  });

  it("422 con la lista vacía: no nacería nada y un 201 lo diría al revés", async () => {
    const cotizacion = await emitirConDosTramites();
    expect((await ganar(cotizacion.id)).status).toBe(200);

    const respuesta = await abrir(cotizacion.id, []);

    expect(respuesta.status, await respuesta.clone().text()).toBe(422);
    expect(await motivosDe(respuesta)).toEqual(["sin_procesos_que_abrir"]);
  });

  it("422 cuando `procesos` no es una lista", async () => {
    const cotizacion = await emitirConDosTramites();
    expect((await ganar(cotizacion.id)).status).toBe(200);

    const respuesta = await abrir(cotizacion.id, "dos procesos, por favor");

    expect(respuesta.status).toBe(422);
    expect(await motivosDe(respuesta)).toEqual(["tipo_invalido"]);
  });

  it("422 por el tipo de proceso que falta, diciendo en qué fila", async () => {
    const cotizacion = await emitirConDosTramites();
    expect((await ganar(cotizacion.id)).status).toBe(200);

    const respuesta = await abrir(cotizacion.id, [
      { tipoProcesoId: tipoVisaId, titulo: "Ésta está bien" },
      { titulo: "A ésta le falta el tipo" },
    ]);

    expect(respuesta.status).toBe(422);
    // La posición delante del campo: con la lista entera en pantalla,
    // «falta el tipo» sin decir en cuál de las dos filas obliga a mirarlas
    // una por una. Y es la **segunda**, no la primera.
    expect(await fallasDe(respuesta)).toEqual([
      { campo: "proceso-1.tipoProcesoId", motivo: "tipo_proceso_requerido" },
    ]);
    expect(await procesosDe(cotizacion.id)).toHaveLength(0);
  });

  it("422 por el título vacío, que es lo que distingue dos del mismo tipo", async () => {
    const cotizacion = await emitirConDosTramites();
    expect((await ganar(cotizacion.id)).status).toBe(200);

    const respuesta = await abrir(cotizacion.id, [
      { tipoProcesoId: tipoVisaId, titulo: "   " },
    ]);

    expect(respuesta.status).toBe(422);
    expect(await fallasDe(respuesta)).toEqual([
      { campo: "proceso-0.titulo", motivo: "titulo_requerido" },
    ]);
  });

  it("422 por una fila que no es un objeto", async () => {
    const cotizacion = await emitirConDosTramites();
    expect((await ganar(cotizacion.id)).status).toBe(200);

    const respuesta = await abrir(cotizacion.id, [42]);

    expect(respuesta.status).toBe(422);
    expect(await fallasDe(respuesta)).toEqual([
      { campo: "proceso-0", motivo: "tipo_invalido" },
    ]);
  });

  it("422 por un tipo de proceso que no es de este bufete", async () => {
    // Es el mismo criterio que el alta a mano, y sale de la misma función:
    // una fila de otro tenant es, desde acá, una fila que no existe.
    const cotizacion = await emitirConDosTramites();
    expect((await ganar(cotizacion.id)).status).toBe(200);

    const respuesta = await abrir(cotizacion.id, [
      { tipoProcesoId: tipoAjenoId, titulo: "Con el trámite del vecino" },
    ]);

    expect(respuesta.status, await respuesta.clone().text()).toBe(422);
    expect(await fallasDe(respuesta)).toEqual([
      {
        campo: "proceso-0.tipoProcesoId",
        motivo: "tipo_proceso_desconocido",
      },
    ]);
    expect(await procesosDe(cotizacion.id)).toHaveLength(0);
  });

  it("422 por un responsable que no existe", async () => {
    const cotizacion = await emitirConDosTramites();
    expect((await ganar(cotizacion.id)).status).toBe(200);

    const respuesta = await abrir(cotizacion.id, [
      {
        tipoProcesoId: tipoVisaId,
        titulo: "Con alguien que no está en el bufete",
        responsableId: nuevoId(),
      },
    ]);

    expect(respuesta.status).toBe(422);
    expect(await fallasDe(respuesta)).toEqual([
      { campo: "proceso-0.responsableId", motivo: "responsable_desconocido" },
    ]);
  });

  it("una llave mala en la última fila no deja nacer las de arriba", async () => {
    // **Las llaves de todas las filas se validan antes de escribir una
    // sola.** Sin eso, un rechazo a medias dejaría abierto el primer
    // proceso y negaría el segundo, y quien mira la pantalla no tendría
    // cómo saber cuál. Es la prueba que muere si la validación se mueve
    // adentro del bucle que escribe.
    const cotizacion = await emitirConDosTramites();
    expect((await ganar(cotizacion.id)).status).toBe(200);

    const respuesta = await abrir(cotizacion.id, [
      { tipoProcesoId: tipoVisaId, titulo: "La buena, que va primera" },
      { tipoProcesoId: tipoAjenoId, titulo: "La mala, que va después" },
    ]);

    expect(respuesta.status).toBe(422);
    expect(await procesosDe(cotizacion.id)).toHaveLength(0);
  });

  it("la ruta no contesta GET: la propuesta no se pide, se deriva", async () => {
    // No hay `GET /api/cotizaciones/{id}/procesos`, y la ausencia es una
    // decisión: la propuesta se deriva en la pantalla sobre las líneas que
    // ya tiene. El 405 va **antes** de mirar si la cotización existe, así
    // que contestarlo no dice si existe.
    const respuesta = await comoAutor(
      peticion(`/api/cotizaciones/${nuevoId()}/procesos`),
    );

    expect(respuesta.status).toBe(405);
    expect(respuesta.headers.get("allow")).toBe("POST");
  });

  it("`/procesos/{algo}` cae en el 404 general y no en esta ruta", async () => {
    // La dirección de un proceso es `/api/procesos/{id}` y no ésta. Dos
    // direcciones para el mismo recurso serían dos respuestas el día que
    // una cambie.
    const cotizacion = await emitirConDosTramites();

    const respuesta = await comoAutor(
      peticion(`/api/cotizaciones/${cotizacion.id}/procesos/${nuevoId()}`, {
        method: "POST",
      }),
    );

    expect(respuesta.status).toBe(404);
  });
});

describe("el plan se siembra de la plantilla al nacer", () => {
  it("copia las etapas de la plantilla del tipo, en orden y todas pendientes", async () => {
    const cotizacion = await emitirConDosTramites();
    expect((await ganar(cotizacion.id)).status).toBe(200);
    expect(
      (
        await abrir(cotizacion.id, [
          { tipoProcesoId: tipoVisaId, titulo: "Visa de trabajo" },
          { tipoProcesoId: tipoResidenciaId, titulo: "Permiso de residencia" },
        ])
      ).status,
    ).toBe(201);

    const [visa, residencia] = await procesosDe(cotizacion.id);

    const plan = await planDe(visa.id);
    expect(plan.map((etapa) => etapa.nombre)).toEqual(PLAN_DE_VISA);
    expect(plan.map((etapa) => etapa.orden)).toEqual([0, 1, 2]);
    // Un proceso recién abierto no tiene nada cumplido, ni su primer paso.
    expect(plan.every((etapa) => etapa.alcanzada_en === null)).toBe(true);

    // Cada proceso recibe **su** plantilla y no la del otro: con una sola
    // lectura mal filtrada, los dos planes saldrían iguales o mezclados.
    expect((await planDe(residencia.id)).map((etapa) => etapa.nombre)).toEqual(
      PLAN_DE_RESIDENCIA,
    );
  });

  it("cambiar la plantilla después no reescribe el plan ya sembrado", async () => {
    // «La plantilla siembra, el proceso manda» (`docs/diseno.md` §6). Es la
    // propiedad que hace que un trámite en curso no cambie de plan porque
    // alguien editó un molde, y la razón por la que el plan se **copia**.
    const cotizacion = await emitirConDosTramites();
    expect((await ganar(cotizacion.id)).status).toBe(200);
    expect(
      (
        await abrir(cotizacion.id, [
          { tipoProcesoId: tipoVisaId, titulo: "Visa de trabajo" },
        ])
      ).status,
    ).toBe(201);

    const [visa] = await procesosDe(cotizacion.id);

    await env.DB.prepare(
      "UPDATE etapa_plantilla SET nombre = ? WHERE tipo_proceso_id = ?" +
        " AND orden = 0",
    )
      .bind("Otra cosa completamente distinta", tipoVisaId)
      .run();

    expect((await planDe(visa.id)).map((etapa) => etapa.nombre)).toEqual(
      PLAN_DE_VISA,
    );

    // Se deja como estaba: el almacenamiento no se rebobina entre pruebas
    // del mismo archivo.
    await env.DB.prepare(
      "UPDATE etapa_plantilla SET nombre = ? WHERE tipo_proceso_id = ?" +
        " AND orden = 0",
    )
      .bind(PLAN_DE_VISA[0], tipoVisaId)
      .run();
  });

  it("un tipo sin plantilla abre el proceso igual, con el plan vacío", async () => {
    // Mismo criterio que el alta a mano de la tajada 1: la plantilla es un
    // atajo, no un requisito. Un proceso sin pasos es uno al que todavía
    // hay que armarle el plan, no un error.
    const cotizacion = await emitirSinTramites();
    expect((await ganar(cotizacion.id)).status).toBe(200);
    expect(
      (
        await abrir(cotizacion.id, [
          { tipoProcesoId: tipoSinPlanId, titulo: "Trámite nuevo" },
        ])
      ).status,
    ).toBe(201);

    const [proceso] = await procesosDe(cotizacion.id);
    expect(proceso).toBeDefined();
    expect(await planDe(proceso.id)).toHaveLength(0);
  });
});

describe("cada proceso y su plan viajan juntos", () => {
  it("si el proceso no puede nacer, su plan tampoco queda dando vueltas", async () => {
    // **Lo que esta prueba sostiene cambió de objeto con T-13, y conviene
    // decirlo.** Hasta `0010` medía que ganar y abrir fueran una sola
    // transacción: una cotización ganada sin sus procesos habría sido un
    // invariante roto que nadie nota. Ese par ya no existe —ganar no abre—
    // y el par que queda es el de adentro: un proceso guardado sin su plan
    // se ve bien y está vacío, que es peor que ninguno.
    //
    // El fallo se fabrica con un disparador que aborta todo `INSERT` sobre
    // `proceso`. Es la única forma de que la apertura falle sin tocar el
    // código que se está probando: con las filas que el sistema sabe
    // producir, esa escritura siempre entra.
    //
    // No hay `try/catch` que disfrace nada, y esta prueba lo mide: el
    // error del disparador **sale crudo** de `manejar` en vez de volverse
    // una respuesta amable. Las guardas se cuentan, nunca se atrapan.
    const cotizacion = await emitirConDosTramites();
    expect((await ganar(cotizacion.id)).status).toBe(200);

    await env.DB.prepare(
      "CREATE TRIGGER ninguna_apertura_entra_en_esta_prueba" +
        " BEFORE INSERT ON proceso BEGIN" +
        " SELECT RAISE(ABORT, 'la apertura falla a propósito');" +
        " END",
    ).run();

    try {
      await expect(
        abrir(cotizacion.id, [
          { tipoProcesoId: tipoVisaId, titulo: "No va a entrar" },
        ]),
      ).rejects.toThrow(/la apertura falla a propósito/);
    } finally {
      await env.DB.prepare(
        "DROP TRIGGER ninguna_apertura_entra_en_esta_prueba",
      ).run();
    }

    expect(await procesosDe(cotizacion.id)).toHaveLength(0);
    expect(
      await env.DB.prepare(
        "SELECT count(*) AS n FROM proceso_etapa e" +
          " WHERE NOT EXISTS (SELECT 1 FROM proceso p WHERE p.id = e.proceso_id)",
      ).first<{ n: number }>(),
    ).toEqual({ n: 0 });
  });

  it("y el hecho tampoco quedó registrado, porque viajaba en el mismo batch", async () => {
    // La bitácora y su efecto van en la misma transacción desde
    // `worker/db/base.ts`: si la apertura revienta, el «creó» se va con
    // ella. Una bitácora que registra lo que no pasó es tan inútil como
    // una que calla lo que pasó.
    const cotizacion = await emitirConDosTramites();
    expect((await ganar(cotizacion.id)).status).toBe(200);

    const antes = await cuantasEntradasDeProceso();

    await env.DB.prepare(
      "CREATE TRIGGER tampoco_entra_la_apertura_en_esta_prueba" +
        " BEFORE INSERT ON proceso BEGIN" +
        " SELECT RAISE(ABORT, 'la apertura falla a propósito');" +
        " END",
    ).run();

    try {
      await expect(
        abrir(cotizacion.id, [
          { tipoProcesoId: tipoVisaId, titulo: "Tampoco va a entrar" },
        ]),
      ).rejects.toThrow(/la apertura falla a propósito/);
    } finally {
      await env.DB.prepare(
        "DROP TRIGGER tampoco_entra_la_apertura_en_esta_prueba",
      ).run();
    }

    expect(await cuantasEntradasDeProceso()).toBe(antes);
  });
});

describe("la bitácora de la apertura", () => {
  it("cada proceso nace con su propia entrada, y no con ninguna", async () => {
    // **Esta prueba cambió de respuesta con T-13 y la de antes era una
    // carencia admitida.** T-7 dejaba a los procesos recién nacidos sin
    // bitácora propia, con el argumento de que `mutar` admite un evento
    // por transacción y que una entrada por proceso habría repetido la
    // misma decisión —ganar— tantas veces como líneas tuviera la
    // cotización.
    //
    // Con T-13 la decisión dejó de ser una: **cada fila de la lista es una
    // elección propia**, con su tipo, su título y su responsable. Por eso
    // ahora cada proceso entra en su propia transacción y cada uno deja su
    // «creó», igual que el alta a mano. Lo que se paga es la atomicidad
    // entre procesos, y está argumentado en `abrirProcesos`.
    const cotizacion = await emitirConDosTramites();
    expect((await ganar(cotizacion.id)).status).toBe(200);
    expect(
      (
        await abrir(cotizacion.id, [
          { tipoProcesoId: tipoVisaId, titulo: "El primero" },
          { tipoProcesoId: tipoResidenciaId, titulo: "El segundo" },
        ])
      ).status,
    ).toBe(201);

    const procesos = await procesosDe(cotizacion.id);
    expect(procesos).toHaveLength(2);

    // El detalle es el título, escrito a mano arriba: una entrada que
    // dijera «creó un proceso» sin decir cuál no contesta «¿quién hizo
    // esto?».
    expect(await bitacoraDe("proceso", procesos[0].id)).toEqual([
      { accion: "creado", detalle: "El primero" },
    ]);
    expect(await bitacoraDe("proceso", procesos[1].id)).toEqual([
      { accion: "creado", detalle: "El segundo" },
    ]);
  });

  it("y la cotización no registra nada nuevo: el hecho es del proceso", async () => {
    // Un hecho, una entidad. Duplicar la apertura bajo la cotización haría
    // que el mismo día apareciera dos veces y que nadie supiera cuál es el
    // original. Lo último registrado contra la cotización sigue siendo su
    // desenlace.
    const cotizacion = await emitirConDosTramites();
    expect((await ganar(cotizacion.id)).status).toBe(200);
    expect(
      (
        await abrir(cotizacion.id, [
          { tipoProcesoId: tipoVisaId, titulo: "Uno cualquiera" },
        ])
      ).status,
    ).toBe(201);

    const registradas = (await bitacoraDe("cotizacion", cotizacion.id)).map(
      (entrada) => entrada.accion,
    );

    expect(registradas.filter((accion) => accion === "ganado")).toHaveLength(1);
    expect(registradas.at(-1)).toBe("ganado");
  });
});

/* ==========================================================================
   T-15 · La procedencia, en el cable

   El fondo de T-7 dejó la procedencia **guardada** —`origen` y la columna
   de procedencia, con el `CHECK` de la migración obligándolos a decir lo
   mismo— y el comentario de `worker/contract.ts` dejó anotado que no
   viajaba: «el día que haya una pantalla que quiera enlazar el proceso con
   la cotización que lo abrió, el campo que le falta es ése».

   Esa pantalla es ésta, y lo que viaja es la cotización resuelta con su
   código al lado, con el mismo criterio que el resto del contrato
   —`clienteId` con `clienteNombre`, `tipoProcesoId` con
   `tipoProcesoNombre`—: **cada identificador con su texto al lado**, porque
   un id sin su texto obliga a una segunda lectura para dibujar un renglón.

   **T-13 le dio la razón a esa decisión por un camino que nadie previó.**
   El argumento de T-15 para no mandar el identificador de la línea era que
   a ninguna pantalla le sirve una línea; el de T-13 es que el proceso no
   debería colgar de una, y los dos llegaron al mismo lugar desde lados
   distintos. Cuando dos razones independientes piden el mismo corte, el
   corte suele estar bien puesto. Hoy la tabla ya guarda la cotización, así
   que lo que viaja y lo que se guarda coinciden.

   Van juntos en un objeto y no sueltos en dos campos nullables, y la
   diferencia se mide: dos nullables admiten cuatro combinaciones en el
   cable de las cuales sólo dos son legales, y la pantalla tendría que
   elegir a cuál de los dos creerle. Con el objeto, «hay cotización» y «hay
   código» son el mismo hecho y no pueden contradecirse.

   Las dos direcciones se afirman juntas, acá y en todas las suites de esta
   tarea: una aserción de ausencia no mide nada sin su aserción de
   presencia al lado. Un `cotizacionDeOrigen` cableado a `null` pasaría
   sola la mitad que dice que un proceso directo no la trae.
   ========================================================================== */

/** El proceso tal como lo entrega la API, no como está en la tabla. */
interface ProcesoEnElCable {
  id: string;
  titulo: string;
  origen: string;
  cotizacionDeOrigen: { id: string; codigo: string } | null;
}

async function procesosEnElCable(): Promise<ProcesoEnElCable[]> {
  const respuesta = await comoAutor(peticion("/api/procesos"));
  expect(respuesta.status, await respuesta.clone().text()).toBe(200);
  const cuerpo = (await respuesta.json()) as { procesos: ProcesoEnElCable[] };
  return cuerpo.procesos;
}

async function procesoEnElCable(id: string): Promise<ProcesoEnElCable> {
  const respuesta = await comoAutor(peticion(`/api/procesos/${id}`));
  expect(respuesta.status, await respuesta.clone().text()).toBe(200);
  const cuerpo = (await respuesta.json()) as { proceso: ProcesoEnElCable };
  return cuerpo.proceso;
}

/**
 * Una cotización ganada con dos procesos ya abiertos.
 *
 * Los abre por la ruta de T-13 y con títulos escritos a mano, que es como
 * nace cualquier proceso de cotización desde esta tarea. Existe porque las
 * cinco pruebas de abajo necesitan lo mismo y, sin ella, cada una repetiría
 * el `ganar` + `abrir` — y la que se olvidara de la segunda mitad pasaría
 * vacía, recorriendo una lista sin filas.
 */
async function ganadaConDosProcesos(): Promise<CotizacionEnElCable> {
  const cotizacion = await emitirConDosTramites();
  expect((await ganar(cotizacion.id)).status).toBe(200);

  const respuesta = await abrir(cotizacion.id, [
    { tipoProcesoId: tipoVisaId, titulo: "Visa de trabajo" },
    { tipoProcesoId: tipoResidenciaId, titulo: "Permiso de residencia" },
  ]);
  expect(respuesta.status, await respuesta.clone().text()).toBe(201);

  return cotizacion;
}

/** Un proceso abierto a mano: el que **no** tiene cotización de dónde nacer. */
async function abrirProcesoDirecto(titulo: string): Promise<ProcesoEnElCable> {
  const respuesta = await comoAutor(
    conCuerpo("/api/procesos", "POST", {
      clienteId,
      tipoProcesoId: tipoVisaId,
      titulo,
    }),
  );
  expect(respuesta.status, await respuesta.clone().text()).toBe(201);
  return ((await respuesta.json()) as { proceso: ProcesoEnElCable }).proceso;
}

describe("de dónde viene cada proceso, dicho en el cable", () => {
  it("el nacido de una cotización viaja con esa cotización y su código", async () => {
    const cotizacion = await ganadaConDosProcesos();

    const nacidos = await procesosDe(cotizacion.id);
    expect(nacidos).toHaveLength(2);

    const enElCable = await procesosEnElCable();
    const mios = nacidos.map((fila) => {
      const suyo = enElCable.find((proceso) => proceso.id === fila.id);
      expect(suyo, "el proceso nacido tiene que estar en el listado").toBeDefined();
      return suyo as ProcesoEnElCable;
    });

    for (const proceso of mios) {
      expect(proceso.origen).toBe("cotizacion");
      expect(proceso.cotizacionDeOrigen).toEqual({
        id: cotizacion.id,
        codigo: cotizacion.codigo,
      });
    }
  });

  it("lo que viaja es lo que la tabla guarda, y no otro identificador de la fila", async () => {
    // **Esta prueba perdió la mitad de su objeto con T-13, y hay que
    // decirlo en vez de dejarla fingiendo que mide lo de antes.** Lo que
    // vigilaba era el salto de línea a cotización: resolverlo mal
    // —devolver el id de la línea con el código correcto al lado— pasaba
    // inadvertido. Ese salto ya no existe, y con él se fue ese modo de
    // falla.
    //
    // Lo que queda sigue valiendo y es lo que la prueba afirma ahora: el
    // identificador del cable es **el de la columna**, no cualquier otro
    // identificador que la misma fila tiene a mano. Devolver `p.id` o
    // `p.cliente_id` con el código correcto al lado es el error que sigue
    // siendo posible, y acá muere.
    const cotizacion = await ganadaConDosProcesos();

    const nacidos = await procesosDe(cotizacion.id);
    expect(nacidos).toHaveLength(2);

    const enElCable = await procesosEnElCable();
    for (const fila of nacidos) {
      const suyo = enElCable.find((proceso) => proceso.id === fila.id);
      expect(suyo?.cotizacionDeOrigen?.id).toBe(fila.cotizacion_id);
      expect(suyo?.cotizacionDeOrigen?.id).not.toBe(fila.id);
      expect(suyo?.cotizacionDeOrigen?.id).not.toBe(fila.cliente_id);
    }
  });

  it("el abierto a mano viaja sin cotización ninguna", async () => {
    const directo = await abrirProcesoDirecto(
      "Visa de trabajo abierta a mano, sin cotización detrás",
    );

    expect(directo.origen).toBe("directo");
    expect(directo.cotizacionDeOrigen).toBeNull();

    const enElListado = (await procesosEnElCable()).find(
      (proceso) => proceso.id === directo.id,
    );
    expect(enElListado?.cotizacionDeOrigen).toBeNull();
  });

  it("el detalle dice lo mismo que el listado, en las dos direcciones", async () => {
    // El listado y el detalle salen de la misma `SELECCION`, y esta prueba
    // es la que lo sostiene: el día que alguien resuelva la procedencia en
    // una sola de las dos consultas, la pantalla de detalle y la de listado
    // dirían cosas distintas del mismo proceso.
    const cotizacion = await ganadaConDosProcesos();

    const [nacido] = await procesosDe(cotizacion.id);
    const directo = await abrirProcesoDirecto(
      "Residencia abierta a mano para cotejar el detalle",
    );

    expect((await procesoEnElCable(nacido.id)).cotizacionDeOrigen).toEqual({
      id: cotizacion.id,
      codigo: cotizacion.codigo,
    });
    expect((await procesoEnElCable(directo.id)).cotizacionDeOrigen).toBeNull();
  });

  it("dos cotizaciones ganadas no se mezclan la procedencia", async () => {
    // Un `JOIN` mal atado —por cliente o por tenant— devolvería **una**
    // cotización para todos los procesos, y con una sola cotización en la
    // base eso pasaría igual. Por eso son dos, y por eso las dos tienen
    // procesos de verdad: los `for` de abajo sobre listas vacías pasarían
    // sin medir nada.
    const una = await ganadaConDosProcesos();
    const otra = await ganadaConDosProcesos();

    expect(await procesosDe(una.id)).toHaveLength(2);
    expect(await procesosDe(otra.id)).toHaveLength(2);

    const enElCable = await procesosEnElCable();
    const codigoDe = (id: string) =>
      enElCable.find((proceso) => proceso.id === id)?.cotizacionDeOrigen
        ?.codigo;

    for (const fila of await procesosDe(una.id)) {
      expect(codigoDe(fila.id)).toBe(una.codigo);
    }
    for (const fila of await procesosDe(otra.id)) {
      expect(codigoDe(fila.id)).toBe(otra.codigo);
    }
    expect(una.codigo).not.toBe(otra.codigo);
  });
});
