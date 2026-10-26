/**
 * De cotización ganada a procesos (`odd/tasks/cotizaciones.md`, T-7).
 *
 * Es donde las dos mitades del sistema se tocan: una cotización ganada abre
 * **un proceso por cada línea que lleve `tipo_proceso_id`**, con el plan
 * sembrado desde la plantilla de ese tipo, y todo en la misma transacción en
 * que la cotización pasa a `ganada`.
 *
 * ## Qué prueba esta suite y qué no
 *
 * **Los invariantes de la base no se prueban acá.** I-3 —el proceso nacido de
 * una cotización comparte cliente con ella—, la coherencia entre `origen` y
 * `cotizacion_linea_id`, y la guarda que impide mudarle el cliente a una
 * cotización que ya abrió procesos viven en
 * `migrations/0008_procesos_desde_cotizacion.sql` y se prueban **por rechazo**
 * en `test/esquema-cotizaciones.spec.ts`, que es su dueño.
 *
 * Acá se prueba lo que la base no puede sostener:
 *
 *  - **Que el reparto sea el correcto**: una línea con tipo abre un proceso,
 *    una sin tipo no abre ninguno, y ninguna de las dos cosas es un error.
 *  - **Que ganar y abrir viajen juntos.** Si los procesos no pueden nacer, la
 *    cotización no queda ganada. Sin eso el invariante no existe: habría
 *    ganadas sin procesos y nadie se enteraría hasta que alguien las busque.
 *  - **Que el plan se copie de la plantilla al nacer** y no quede atado a
 *    ella, que es la propiedad que la tajada 1 llama «la plantilla siembra,
 *    el proceso manda».
 *  - **Que la respuesta diga cuántos procesos abrió**, incluido el cero.
 *
 * ## Lo que T-7 deliberadamente NO tiene: idempotencia propia
 *
 * `ganar` es terminal y está probado por rechazo en `test/ciclo-api.spec.ts`
 * y en `test/esquema-cotizaciones.spec.ts` que ocurre **exactamente una
 * vez**: el 409 de la ruta lo cuenta y el disparador
 * `cotizacion_el_estado_sigue_el_ciclo_de_vida` de `0007` lo aborta. Una
 * guarda propia de apertura sería la segunda del mismo hecho, y dos guardas
 * que resuelven lo mismo se anulan como garantía: quitar cualquiera de las
 * dos no mataría ninguna prueba. Lo que sí hay acá es la **medición** de esa
 * propiedad sobre las escrituras de T-7 —ganar dos veces no abre los
 * procesos dos veces—, que es un hecho distinto del que prueba T-5.
 *
 * ## No hay limpieza entre pruebas
 *
 * Desde `0006` una cotización que salió del borrador y sus hijas son
 * indelebles, y desde `0008` los procesos nacidos de una línea congelada
 * agregan otra arista: la llave foránea `proceso.cotizacion_linea_id` deja a
 * la línea sin poder borrarse. El almacenamiento está aislado por archivo y
 * cada prueba trabaja con identificadores nuevos.
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

interface LineaEnElCable {
  id: string;
  clase: string;
  concepto: string;
  monto: number;
  tipoProcesoId: string | null;
  orden: number;
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
  cotizacion_linea_id: string | null;
}

let autorId: string;
let clienteId: string;
/** El tipo con tres etapas de plantilla. */
let tipoVisaId: string;
/** El tipo con dos. */
let tipoResidenciaId: string;
/** Un tipo **sin** plantilla, para el proceso que nace sin plan. */
let tipoSinPlanId: string;

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

async function lineasDe(cotizacionId: string): Promise<LineaEnElCable[]> {
  const respuesta = await comoAutor(
    peticion(`/api/cotizaciones/${cotizacionId}/lineas`),
  );
  expect(respuesta.status, await respuesta.clone().text()).toBe(200);
  const cuerpo = (await respuesta.json()) as { lineas: LineaEnElCable[] };
  return cuerpo.lineas;
}

/** Cuántos procesos dijo la respuesta que abrió. */
async function procesosAbiertosDe(respuesta: Response): Promise<unknown> {
  const cuerpo = (await respuesta.json()) as { procesosAbiertos?: unknown };
  return cuerpo.procesosAbiertos;
}

/** Los procesos nacidos de las líneas de una cotización, por orden de línea. */
async function procesosDe(cotizacionId: string): Promise<FilaDeProceso[]> {
  const { results } = await env.DB.prepare(
    "SELECT p.* FROM proceso p" +
      " JOIN cotizacion_linea l ON l.id = p.cotizacion_linea_id" +
      " WHERE l.cotizacion_id = ? ORDER BY l.orden",
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

  const tipoClienteId = nuevoId();
  const areaId = nuevoId();
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
  ]);
});

describe("una ganada abre un proceso por cada línea con tipo de proceso", () => {
  it("abre dos procesos de cuatro líneas, y los otros dos cobros no abren nada", async () => {
    const cotizacion = await emitirConDosTramites();

    const respuesta = await ganar(cotizacion.id);
    expect(respuesta.status, await respuesta.clone().text()).toBe(200);

    const procesos = await procesosDe(cotizacion.id);
    // El conteo es la mitad del reparto; la otra mitad es **cuáles**. Con
    // solo el número, abrir dos procesos del mismo tipo pasaría igual.
    expect(procesos).toHaveLength(2);
    expect(procesos.map((fila) => fila.tipo_proceso_id)).toEqual([
      tipoVisaId,
      tipoResidenciaId,
    ]);
  });

  it("cada proceso apunta a la línea que lo abrió", async () => {
    const cotizacion = await emitirConDosTramites();
    expect((await ganar(cotizacion.id)).status).toBe(200);

    const lineas = await lineasDe(cotizacion.id);
    const conTipo = lineas.filter((linea) => linea.tipoProcesoId !== null);
    const procesos = await procesosDe(cotizacion.id);

    expect(procesos.map((fila) => fila.cotizacion_linea_id)).toEqual(
      conTipo.map((linea) => linea.id),
    );
  });

  it("el proceso nace con origen 'cotizacion', abierto y sin responsable", async () => {
    const cotizacion = await emitirConDosTramites();
    expect((await ganar(cotizacion.id)).status).toBe(200);

    for (const proceso of await procesosDe(cotizacion.id)) {
      // `origen` es lo que distingue estos procesos de los que el bufete
      // abre a mano, y es la mitad estructural de «¿de dónde salió esto?».
      expect(proceso.origen).toBe("cotizacion");
      expect(proceso.estado).toBe("abierto");
      // Nadie lo asignó todavía: ganar una cotización no reparte trabajo.
      expect(proceso.responsable_id).toBeNull();
    }
  });

  it("el proceso comparte cliente con la cotización, que es I-3", async () => {
    const cotizacion = await emitirConDosTramites();
    expect((await ganar(cotizacion.id)).status).toBe(200);

    for (const proceso of await procesosDe(cotizacion.id)) {
      expect(proceso.cliente_id).toBe(cotizacion.clienteId);
      expect(proceso.tenant_id).toBe(TENANT_UNICO_ID);
    }
  });

  it("el título del proceso es el concepto de su línea", async () => {
    const cotizacion = await emitirConDosTramites();
    expect((await ganar(cotizacion.id)).status).toBe(200);

    // Escritos a mano y no leídos de la línea: el eco de un dato contra sí
    // mismo pasa cualquier aserción.
    expect((await procesosDe(cotizacion.id)).map((fila) => fila.titulo)).toEqual(
      ["Visa de trabajo", "Permiso de residencia"],
    );
  });

  it("la respuesta dice cuántos procesos abrió", async () => {
    const cotizacion = await emitirConDosTramites();

    const respuesta = await ganar(cotizacion.id);
    expect(await procesosAbiertosDe(respuesta)).toBe(2);
  });
});

describe("una ganada sin tramites es legítima y no abre nada", () => {
  it("ninguna línea con tipo de proceso: cero procesos, y se gana igual", async () => {
    // Una consulta y un timbre son cobros que no abren trámite. Que no se
    // abra nada **no es un error**: es el caso corriente del bufete.
    const cotizacion = await emitirSinTramites();

    const respuesta = await ganar(cotizacion.id);
    expect(respuesta.status, await respuesta.clone().text()).toBe(200);

    expect(await procesosDe(cotizacion.id)).toHaveLength(0);
    expect(await estadoDe(cotizacion.id)).toBe("ganada");
  });

  it("y la respuesta lo dice con un cero, no callándose", async () => {
    // El cero explícito es lo que deja a la pantalla distinguir «no abrió
    // ninguno» de «todavía no sé». Sin él, las dos se ven igual.
    const cotizacion = await emitirSinTramites();

    const respuesta = await ganar(cotizacion.id);
    expect(await procesosAbiertosDe(respuesta)).toBe(0);
  });

  it("perder no abre ningún proceso, por muchos tipos que lleve", async () => {
    // El espejo: la única puerta hacia `proceso` desde una cotización es
    // ganar. Si la apertura colgara de `cerrar` sin mirar el destino, esta
    // prueba sería la que lo nota.
    const cotizacion = await emitirConDosTramites();

    const respuesta = await perder(cotizacion.id);
    expect(respuesta.status, await respuesta.clone().text()).toBe(200);

    expect(await procesosDe(cotizacion.id)).toHaveLength(0);
    expect(await procesosAbiertosDe(respuesta)).toBe(0);
  });
});

describe("el plan se siembra de la plantilla al nacer", () => {
  it("copia las etapas de la plantilla del tipo, en orden y todas pendientes", async () => {
    const cotizacion = await emitirConDosTramites();
    expect((await ganar(cotizacion.id)).status).toBe(200);

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
    const borrador = await crearBorrador();
    await agregarLinea(borrador.id, {
      clase: "honorario",
      concepto: "Trámite nuevo",
      monto: 50_000,
      tipoProcesoId: tipoSinPlanId,
    });
    expect((await emitir(borrador.id)).status).toBe(200);
    expect((await ganar(borrador.id)).status).toBe(200);

    const [proceso] = await procesosDe(borrador.id);
    expect(proceso).toBeDefined();
    expect(await planDe(proceso.id)).toHaveLength(0);
  });
});

describe("ganar y abrir viajan juntos", () => {
  it("si los procesos no pueden nacer, la cotización NO queda ganada", async () => {
    // **La prueba que sostiene el invariante entero.** Si fueran dos
    // escrituras separadas, existiría una cotización ganada sin sus
    // procesos y nadie se enteraría hasta que alguien la busque.
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

    await env.DB.prepare(
      "CREATE TRIGGER ninguna_apertura_entra_en_esta_prueba" +
        " BEFORE INSERT ON proceso BEGIN" +
        " SELECT RAISE(ABORT, 'la apertura falla a propósito');" +
        " END",
    ).run();

    try {
      await expect(ganar(cotizacion.id)).rejects.toThrow(
        /la apertura falla a propósito/,
      );
    } finally {
      await env.DB.prepare(
        "DROP TRIGGER ninguna_apertura_entra_en_esta_prueba",
      ).run();
    }

    // Las dos mitades del invariante, medidas por separado: ni la
    // cotización se movió, ni quedó medio proceso dando vueltas.
    expect(await estadoDe(cotizacion.id)).toBe("emitida");
    expect(await procesosDe(cotizacion.id)).toHaveLength(0);
  });

  it("y el hecho tampoco quedó registrado, porque viajaba en el mismo batch", async () => {
    // La bitácora y su efecto van en la misma transacción desde
    // `worker/db/base.ts`: si la apertura revienta, el «ganó» se va con
    // ella. Una bitácora que registra lo que no pasó es tan inútil como
    // una que calla lo que pasó.
    const cotizacion = await emitirConDosTramites();

    await env.DB.prepare(
      "CREATE TRIGGER tampoco_entra_la_apertura_en_esta_prueba" +
        " BEFORE INSERT ON proceso BEGIN" +
        " SELECT RAISE(ABORT, 'la apertura falla a propósito');" +
        " END",
    ).run();

    try {
      await expect(ganar(cotizacion.id)).rejects.toThrow(
        /la apertura falla a propósito/,
      );
    } finally {
      await env.DB.prepare(
        "DROP TRIGGER tampoco_entra_la_apertura_en_esta_prueba",
      ).run();
    }

    expect(
      (await bitacoraDe("cotizacion", cotizacion.id)).map(
        (entrada) => entrada.accion,
      ),
    ).not.toContain("ganado");
  });

  it("ganar dos veces no abre los procesos dos veces", async () => {
    // T-7 **no** tiene guarda de idempotencia propia y no debe tenerla: la
    // transición ya la garantiza. Esto no es esa guarda, es su medición
    // sobre las escrituras de esta tarea.
    const cotizacion = await emitirConDosTramites();
    expect((await ganar(cotizacion.id)).status).toBe(200);

    const segunda = await ganar(cotizacion.id);
    expect(segunda.status).toBe(409);

    expect(await procesosDe(cotizacion.id)).toHaveLength(2);
  });
});

describe("la bitácora de la apertura", () => {
  it("registra un solo hecho: que la cotización se ganó", async () => {
    const cotizacion = await emitirConDosTramites();
    expect((await ganar(cotizacion.id)).status).toBe(200);

    const registradas = (await bitacoraDe("cotizacion", cotizacion.id)).map(
      (entrada) => entrada.accion,
    );

    // Uno, y no uno por proceso: el hecho es la decisión, y la decisión se
    // tomó una vez. `creado`, `editado` y los de línea son del armado del
    // borrador; `emitido` y `ganado` son el ciclo de vida.
    expect(registradas.filter((accion) => accion === "ganado")).toHaveLength(1);
    expect(registradas.at(-1)).toBe("ganado");
  });

  it("el proceso recién nacido no tiene bitácora propia, y es deliberado", async () => {
    // **Lo que esta prueba fija no es una carencia, es una decisión.**
    //
    // `mutar` admite un evento por transacción, y ganar y abrir van en la
    // misma. Una entrada por proceso repetiría la misma decisión tantas
    // veces como líneas tenga la cotización.
    //
    // La procedencia no se pierde: cambia de lugar. «¿De dónde salió este
    // proceso?» lo contestan `origen` y `cotizacion_linea_id`, que son
    // estructura y no narración; «¿quién lo abrió?» lo contesta la bitácora
    // de la cotización, que es donde ocurrió la decisión.
    const cotizacion = await emitirConDosTramites();
    expect((await ganar(cotizacion.id)).status).toBe(200);

    for (const proceso of await procesosDe(cotizacion.id)) {
      expect(await bitacoraDe("proceso", proceso.id)).toEqual([]);
      // Y acá está la respuesta que la pantalla tendrá que leer el día que
      // dibuje ese registro en blanco.
      expect(proceso.origen).toBe("cotizacion");
      expect(proceso.cotizacion_linea_id).not.toBeNull();
    }
  });
});

/* ==========================================================================
   T-15 · La procedencia, en el cable

   El fondo de T-7 dejó la procedencia **guardada** —`origen` y
   `cotizacion_linea_id`, con el `CHECK` de `0008` obligándolos a decir lo
   mismo— y el comentario de `worker/contract.ts` dejó anotado que no
   viajaba: «el día que haya una pantalla que quiera enlazar el proceso con
   la cotización que lo abrió, el campo que le falta es ése».

   Esa pantalla es ésta, y lo que viaja **no es** `cotizacionLineaId`. A
   ninguna pantalla le sirve la línea: lo que una persona quiere abrir es la
   cotización, y lo que quiere leer es su código. Viaja entonces el par ya
   resuelto, con el mismo criterio que el resto del contrato —`clienteId`
   con `clienteNombre`, `tipoProcesoId` con `tipoProcesoNombre`—: **cada
   identificador con su texto al lado**, porque un id sin su texto obliga a
   una segunda lectura para dibujar un renglón.

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
    const cotizacion = await emitirConDosTramites();
    expect((await ganar(cotizacion.id)).status).toBe(200);

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

  it("lo que viaja es la cotización, no la línea que lo abrió", async () => {
    // Es la decisión de forma, afirmada: `cotizacion_linea_id` es lo que la
    // tabla guarda, y es justo lo que ninguna pantalla puede usar. Sin esta
    // prueba, resolver mal el salto de línea a cotización —devolver el id
    // de la línea con el código correcto al lado— pasaría inadvertido.
    const cotizacion = await emitirConDosTramites();
    expect((await ganar(cotizacion.id)).status).toBe(200);

    const nacidos = await procesosDe(cotizacion.id);
    const lineas = nacidos.map((fila) => fila.cotizacion_linea_id);
    expect(lineas.filter((id) => id !== null)).toHaveLength(2);

    const enElCable = await procesosEnElCable();
    for (const fila of nacidos) {
      const suyo = enElCable.find((proceso) => proceso.id === fila.id);
      expect(suyo?.cotizacionDeOrigen?.id).toBe(cotizacion.id);
      expect(lineas).not.toContain(suyo?.cotizacionDeOrigen?.id);
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
    const cotizacion = await emitirConDosTramites();
    expect((await ganar(cotizacion.id)).status).toBe(200);

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
    // Un `JOIN` mal atado —por cliente, por tenant, o sin el `ON` de la
    // línea— devolvería **una** cotización para todos los procesos, y con
    // una sola cotización en la base eso pasaría igual.
    const una = await emitirConDosTramites();
    const otra = await emitirConDosTramites();
    expect((await ganar(una.id)).status).toBe(200);
    expect((await ganar(otra.id)).status).toBe(200);

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
