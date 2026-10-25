/**
 * Ganar, perder y duplicar: el resto del ciclo de vida
 * (`odd/tasks/cotizaciones.md`, T-5, unidad A).
 *
 * **Esta suite no vuelve a probar los invariantes de la base.** Las dos
 * guardas de `migrations/0007_ciclo_de_vida.sql` —que las transiciones son
 * las tres de `docs/diseno.md` §8, y que `duplicada_de_id` se fija al
 * nacer— se prueban por rechazo en `test/esquema-cotizaciones.spec.ts`, que
 * es su dueño. Acá se prueba lo que la base no puede sostener:
 *
 *  - **Que la API cuente el estado antes de escribir** y conteste 409 en
 *    vez de dejar que el disparador aborte con un 500. Las guardas se
 *    cuentan, nunca se atrapan: no hay un solo `try/catch` en el camino, y
 *    la prueba de eso es que ninguna de estas respuestas es un 500.
 *  - **Que ganar y perder sean el final**, que es la decisión de negocio de
 *    esta tarea y no una consecuencia técnica.
 *  - **Qué copia duplicar y qué no**, que es la decisión entera de la otra
 *    mitad.
 *  - **Que la original no se toque**, que es lo que hace tolerable a I-4.
 *  - **La superficie de las tres rutas** y el orden de sus rechazos.
 *  - **La tenencia** (I-8): un UUID ajeno sigue siendo un UUID.
 *  - **Los hechos en la bitácora**, que es lo único que queda del momento
 *    en que una propuesta se cerró.
 *
 * ## No hay `beforeEach` que limpie, por la misma razón que en T-4
 *
 * Desde `0006` una cotización que salió del borrador y sus hijas son
 * indelebles, y esta suite siembra emitidas, ganadas y perdidas a montones.
 * El almacenamiento está aislado por archivo y cada prueba trabaja con
 * identificadores nuevos; no se borra nada, porque no se puede. Es la misma
 * decisión que `test/emitir-api.spec.ts` dejó escrita.
 *
 * Los valores esperados —montos, órdenes, textos— se escriben a mano y no
 * salen de ninguna función del Worker (restricción 6 de la tajada).
 */
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { cotizacionesSobreD1 } from "../worker/cotizaciones/repositorio";
import type { BaseDeDatos } from "../worker/db/base";
import { baseSobreD1 } from "../worker/db/base";
import { TENANT_UNICO_ID, nuevoId } from "../worker/db/ids";
import { ahoraIso } from "../worker/db/momentos";
import { manejar } from "../worker/index";

const DOMINIO_DE_ACCESS = "https://bufete-de-prueba.cloudflareaccess.com";
const AUD = "aud-de-la-aplicacion-del-bufete";

const EMAIL_AUTOR = "itzel@bufete.test";
const NOMBRE_AUTOR = "Itzel";

/** El tenant vecino. Existe solo para que la fuga sea expresable. */
const OTRO_TENANT_ID = "2c7b9e10-4d33-4f58-8a21-b6e0f4c9d775";

interface CotizacionEnElCable {
  id: string;
  codigo: string;
  estado: string;
  clienteId: string;
  venceEn: string | null;
  moneda: string;
  duplicadaDeId: string | null;
  creadaPor: string;
}

interface ModuloEnElCable {
  id: string;
  tipo: string;
  orden: number;
  contenido: string;
}

interface LineaEnElCable {
  id: string;
  clase: string;
  concepto: string;
  monto: number;
  tipoProcesoId: string | null;
  tipoProcesoNombre: string | null;
  orden: number;
}

let autorId: string;
let clienteId: string;
let tipoProcesoId: string;
let cotizacionAjenaId: string;

function entorno(): Env {
  // Hermético, por la misma razón que en `test/acceso.spec.ts`: un
  // `.dev.vars` local no puede decidir qué identidad observa la suite.
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

async function cotizacionDe(respuesta: Response): Promise<CotizacionEnElCable> {
  const cuerpo = (await respuesta.json()) as {
    cotizacion?: CotizacionEnElCable;
  };
  expect(cuerpo.cotizacion, "la respuesta no trae `cotizacion`").toBeDefined();
  return cuerpo.cotizacion as CotizacionEnElCable;
}

/* --- Los cuatro verbos, por la ruta real --- */

function emitir(id: string): Promise<Response> {
  return comoAutor(peticion(`/api/cotizaciones/${id}/emitir`, { method: "POST" }));
}

function ganar(id: string): Promise<Response> {
  return comoAutor(peticion(`/api/cotizaciones/${id}/ganar`, { method: "POST" }));
}

function perder(id: string): Promise<Response> {
  return comoAutor(peticion(`/api/cotizaciones/${id}/perder`, { method: "POST" }));
}

function duplicar(id: string): Promise<Response> {
  return comoAutor(
    peticion(`/api/cotizaciones/${id}/duplicar`, { method: "POST" }),
  );
}

async function crearBorrador(
  venceEn: string | null = null,
): Promise<CotizacionEnElCable> {
  const respuesta = await comoAutor(
    conCuerpo("/api/cotizaciones", "POST", { clienteId, venceEn }),
  );
  expect(respuesta.status, await respuesta.clone().text()).toBe(201);
  return cotizacionDe(respuesta);
}

async function agregarModulo(
  id: string,
  tipo: string,
  contenido: string,
): Promise<void> {
  const respuesta = await comoAutor(
    conCuerpo(`/api/cotizaciones/${id}/modulos`, "POST", { tipo, contenido }),
  );
  expect(respuesta.status, await respuesta.clone().text()).toBe(201);
}

async function agregarLinea(
  id: string,
  linea: {
    clase: string;
    concepto: string;
    monto: number;
    tipoProcesoId?: string | null;
  },
): Promise<void> {
  const respuesta = await comoAutor(
    conCuerpo(`/api/cotizaciones/${id}/lineas`, "POST", linea),
  );
  expect(respuesta.status, await respuesta.clone().text()).toBe(201);
}

async function modulosDe(id: string): Promise<ModuloEnElCable[]> {
  const respuesta = await comoAutor(peticion(`/api/cotizaciones/${id}/modulos`));
  expect(respuesta.status, await respuesta.clone().text()).toBe(200);
  const cuerpo = (await respuesta.json()) as { modulos: ModuloEnElCable[] };
  return cuerpo.modulos;
}

async function lineasDe(id: string): Promise<LineaEnElCable[]> {
  const respuesta = await comoAutor(peticion(`/api/cotizaciones/${id}/lineas`));
  expect(respuesta.status, await respuesta.clone().text()).toBe(200);
  const cuerpo = (await respuesta.json()) as { lineas: LineaEnElCable[] };
  return cuerpo.lineas;
}

/**
 * La fila entera de `cotizacion`, **leída de la base y no del cable**.
 *
 * `SELECCION` deja `snapshot` y `tenant_id` afuera a propósito, así que una
 * aserción hecha contra la respuesta de la API no podría ver si alguna de
 * esas dos se movió. Es justo lo que hace falta para afirmar que duplicar
 * no tocó la original.
 */
async function filaDe(id: string): Promise<Record<string, unknown> | null> {
  return env.DB.prepare("SELECT * FROM cotizacion WHERE id = ?")
    .bind(id)
    .first<Record<string, unknown>>();
}

/** Las acciones registradas contra una cotización, de la más vieja a la más nueva. */
async function bitacoraDe(
  id: string,
): Promise<{ accion: string; detalle: string | null }[]> {
  const { results } = await env.DB.prepare(
    "SELECT accion, detalle FROM bitacora WHERE entidad = 'cotizacion'" +
      " AND entidad_id = ? ORDER BY ocurrido_en, rowid",
  )
    .bind(id)
    .all<{ accion: string; detalle: string | null }>();

  return results;
}

/**
 * Una cotización completa y emitida: dos módulos, tres líneas y el `POST`.
 *
 * Los montos no son redondos a propósito —150 000, 7 550 y 12 345 centavos—
 * para que una copia que pierda o duplique una línea no dé por casualidad el
 * mismo total.
 */
async function emitirUnaCompleta(): Promise<CotizacionEnElCable> {
  const borrador = await poblarUnBorrador();

  const respuesta = await emitir(borrador.id);
  expect(respuesta.status, await respuesta.clone().text()).toBe(200);

  return borrador;
}

/** El mismo contenido, sin emitir. */
async function poblarUnBorrador(
  venceEn: string | null = null,
): Promise<CotizacionEnElCable> {
  const borrador = await crearBorrador(venceEn);

  await agregarModulo(borrador.id, "alcance", "Tramitación completa.");
  await agregarModulo(borrador.id, "exclusiones", "No incluye apelaciones.");

  await agregarLinea(borrador.id, {
    clase: "honorario",
    concepto: "Honorario profesional",
    monto: 150_000,
    tipoProcesoId,
  });
  await agregarLinea(borrador.id, {
    clase: "gasto_estimado",
    concepto: "Tasas de migración",
    monto: 7_550,
  });
  await agregarLinea(borrador.id, {
    clase: "honorario",
    concepto: "Acompañamiento en cita",
    monto: 12_345,
  });

  return borrador;
}

/** Una emitida que además ya se ganó. */
async function unaGanada(): Promise<CotizacionEnElCable> {
  const cotizacion = await emitirUnaCompleta();
  expect((await ganar(cotizacion.id)).status).toBe(200);
  return cotizacion;
}

/** Una emitida que además ya se perdió. */
async function unaPerdida(): Promise<CotizacionEnElCable> {
  const cotizacion = await emitirUnaCompleta();
  expect((await perder(cotizacion.id)).status).toBe(200);
  return cotizacion;
}

beforeAll(async () => {
  autorId = nuevoId();
  clienteId = nuevoId();
  tipoProcesoId = nuevoId();
  cotizacionAjenaId = nuevoId();

  const tipoClienteId = nuevoId();
  const areaId = nuevoId();
  const clienteAjenoId = nuevoId();
  const autorAjenoId = nuevoId();
  const tipoClienteAjenoId = nuevoId();
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
      "INSERT INTO cliente (id, tenant_id, tipo_cliente_id, nombre, email," +
        " creado_por, creado_en) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).bind(
      clienteId,
      TENANT_UNICO_ID,
      tipoClienteId,
      "Constructora del Istmo, S.A.",
      "contacto@istmo.test",
      autorId,
      ahora,
    ),
    env.DB.prepare(
      "INSERT INTO area (id, tenant_id, nombre) VALUES (?, ?, ?)",
    ).bind(areaId, TENANT_UNICO_ID, "Migración"),
    env.DB.prepare(
      "INSERT INTO tipo_proceso (id, tenant_id, area_id, nombre)" +
        " VALUES (?, ?, ?, ?)",
    ).bind(tipoProcesoId, TENANT_UNICO_ID, areaId, "Visa de trabajo"),

    /* El bufete vecino, con una cotización suya emitida. */
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
      "INSERT INTO cliente (id, tenant_id, tipo_cliente_id, nombre, telefono," +
        " creado_por, creado_en) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).bind(
      clienteAjenoId,
      OTRO_TENANT_ID,
      tipoClienteAjenoId,
      "Cliente del vecino",
      "+507 6999-9999",
      autorAjenoId,
      ahora,
    ),
    // **Emitida y no borrador**, a propósito: así el 404 por tenencia no se
    // puede confundir con un 409 por estado. Si la ruta filtrara mal, esta
    // fila contestaría 200 y no 404.
    env.DB.prepare(
      "INSERT INTO cotizacion (id, tenant_id, cliente_id, codigo, estado," +
        " fecha, moneda, snapshot, creada_por, creada_en)" +
        " VALUES (?, ?, ?, ?, 'emitida', ?, 'USD', ?, ?, ?)",
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

describe("ganar y perder cierran una emitida", () => {
  it.each([
    ["ganar", ganar, "ganada"],
    ["perder", perder, "perdida"],
  ] as const)(
    "%s contesta 200 con la cotización ya %s",
    async (_verbo, llamar, esperado) => {
      // Contrapeso de todo el bloque: si ganar y perder no funcionaran, las
      // pruebas de rechazo de abajo pasarían por el motivo equivocado.
      const cotizacion = await emitirUnaCompleta();

      const respuesta = await llamar(cotizacion.id);
      expect(respuesta.status, await respuesta.clone().text()).toBe(200);
      expect(respuesta.headers.get("cache-control")).toBe("no-store");

      expect((await cotizacionDe(respuesta)).estado).toBe(esperado);

      // El eco de un `POST` pasa cualquier aserción hecha sobre sí mismo.
      const releida = await comoAutor(
        peticion(`/api/cotizaciones/${cotizacion.id}`),
      );
      expect((await cotizacionDe(releida)).estado).toBe(esperado);
    },
  );

  it("ganar no toca el snapshot ni una coma", async () => {
    // Criterio 3 de aceptación de la tajada: «el snapshot de una emitida es
    // idéntico seis meses después». Acá se mide por la ruta de verdad y no
    // por un `UPDATE` de prueba, que es lo que T-4 sólo podía hacer.
    const cotizacion = await emitirUnaCompleta();
    const antes = await filaDe(cotizacion.id);

    expect((await ganar(cotizacion.id)).status).toBe(200);

    const despues = await filaDe(cotizacion.id);
    expect(despues?.snapshot).toBe(antes?.snapshot);
    // Y lo único que se movió es el estado: la fila entera comparada
    // columna por columna, con `estado` repuesto al valor viejo.
    expect({ ...despues, estado: antes?.estado }).toEqual(antes);
  });
});

describe("ganada y perdida son el final del ciclo", () => {
  // **La decisión de negocio de esta tarea**, probada por rechazo. Una
  // cotización que el cliente aceptó y que después se cae no es una
  // cotización perdida: es un encargo que se cerró, y eso vive en
  // `proceso`. Para volver a cotizar se duplica.
  //
  // Son cuatro y no una: el desenlace cruzado en los dos sentidos y la
  // repetición del mismo, que son las cuatro aristas que salen de una
  // cerrada. Con una sola prueba se podrían borrar tres de los pares
  // legales del `WHEN` del disparador —y las tres ramas del puerto— sin que
  // nada se pusiera rojo.
  it("una ganada no se puede perder", async () => {
    const cotizacion = await unaGanada();

    const respuesta = await perder(cotizacion.id);
    expect(respuesta.status).toBe(409);
    expect(await respuesta.json()).toEqual({
      error: "cotizacion_no_es_emitida",
      estado: "ganada",
    });

    expect((await filaDe(cotizacion.id))?.estado).toBe("ganada");
  });

  it("una perdida no se puede ganar", async () => {
    const cotizacion = await unaPerdida();

    const respuesta = await ganar(cotizacion.id);
    expect(respuesta.status).toBe(409);
    expect(await respuesta.json()).toEqual({
      error: "cotizacion_no_es_emitida",
      estado: "perdida",
    });

    expect((await filaDe(cotizacion.id))?.estado).toBe("perdida");
  });

  it("ganar dos veces contesta 409 y dice en qué quedó", async () => {
    const cotizacion = await unaGanada();

    const respuesta = await ganar(cotizacion.id);
    expect(respuesta.status).toBe(409);
    expect(await respuesta.json()).toEqual({
      error: "cotizacion_no_es_emitida",
      estado: "ganada",
    });
  });

  it("perder dos veces también", async () => {
    const cotizacion = await unaPerdida();

    const respuesta = await perder(cotizacion.id);
    expect(respuesta.status).toBe(409);
    expect(await respuesta.json()).toEqual({
      error: "cotizacion_no_es_emitida",
      estado: "perdida",
    });
  });

  it("una cerrada tampoco se puede volver a emitir", async () => {
    // El otro extremo del mismo cierre, y lo contesta la ruta de T-4 con su
    // propio motivo: desde allá lo que falla es que ya no es borrador.
    const cotizacion = await unaGanada();

    const respuesta = await emitir(cotizacion.id);
    expect(respuesta.status).toBe(409);
    expect(await respuesta.json()).toEqual({
      error: "cotizacion_no_es_borrador",
      estado: "ganada",
    });
  });
});

describe("un borrador no se gana ni se pierde", () => {
  // Ganar un borrador sería declarar aceptado un documento que nadie vio, y
  // fabricar el desenlace de una propuesta que no salió. Es el espejo
  // exacto de I-4: allá no se edita lo que ya salió, acá no se cierra lo
  // que todavía no sale.
  it.each([
    ["ganar", ganar],
    ["perder", perder],
  ] as const)("%s un borrador contesta 409 con el estado", async (_v, llamar) => {
    const borrador = await poblarUnBorrador();

    const respuesta = await llamar(borrador.id);
    expect(respuesta.status).toBe(409);
    expect(await respuesta.json()).toEqual({
      error: "cotizacion_no_es_emitida",
      estado: "borrador",
    });

    expect((await filaDe(borrador.id))?.estado).toBe("borrador");
  });

  it("y el borrador sigue siendo editable después del rechazo", async () => {
    // El contrapeso que distingue «se negó» de «se rompió»: un 409 que
    // además hubiera dejado la fila a medio mover se vería acá.
    const borrador = await poblarUnBorrador();
    expect((await ganar(borrador.id)).status).toBe(409);

    await agregarModulo(borrador.id, "supuestos", "El cliente aporta copias.");
    expect(await modulosDe(borrador.id)).toHaveLength(3);
  });
});

describe("duplicar copia el contenido y no toca la original", () => {
  it("contesta 201 con la copia, su location y su código nuevo", async () => {
    const original = await emitirUnaCompleta();

    const respuesta = await duplicar(original.id);
    expect(respuesta.status, await respuesta.clone().text()).toBe(201);

    const copia = await cotizacionDe(respuesta);
    expect(copia.id).not.toBe(original.id);
    expect(copia.estado).toBe("borrador");
    expect(copia.duplicadaDeId).toBe(original.id);
    expect(copia.clienteId).toBe(original.clienteId);
    expect(copia.codigo).not.toBe(original.codigo);
    expect(respuesta.headers.get("location")).toBe(
      `/api/cotizaciones/${copia.id}`,
    );
    expect(respuesta.headers.get("cache-control")).toBe("no-store");
  });

  it("la copia no nace con snapshot", async () => {
    // El `CHECK` de coherencia de `0004` ya lo exige —un borrador no tiene
    // snapshot—, pero lo que esta prueba fija es que la copia **no es** el
    // documento congelado del original con otro identificador: es una
    // propuesta nueva que todavía no salió.
    const original = await emitirUnaCompleta();
    const copia = await cotizacionDe(await duplicar(original.id));

    expect((await filaDe(copia.id))?.snapshot).toBeNull();
    expect((await filaDe(original.id))?.snapshot).not.toBeNull();
  });

  it("copia los dos módulos con su tipo, su orden y su texto", async () => {
    // **Ésta es la prueba de que la copia es una copia.** Los valores están
    // escritos a mano y no salen de leer el original: comparar la copia
    // contra el original pasaría igual si las dos listas estuvieran vacías.
    const original = await emitirUnaCompleta();
    const copia = await cotizacionDe(await duplicar(original.id));

    const modulos = await modulosDe(copia.id);
    expect(
      modulos.map(({ tipo, orden, contenido }) => ({ tipo, orden, contenido })),
    ).toEqual([
      { tipo: "alcance", orden: 0, contenido: "Tramitación completa." },
      { tipo: "exclusiones", orden: 1, contenido: "No incluye apelaciones." },
    ]);

    // Y son filas nuevas, no las del original recolgadas: si lo fueran, el
    // original se habría quedado sin módulos, que es la peor forma de
    // «copiar».
    const originales = await modulosDe(original.id);
    expect(originales).toHaveLength(2);
    for (const modulo of modulos) {
      expect(originales.map((cada) => cada.id)).not.toContain(modulo.id);
    }
  });

  it("copia las tres líneas con su clase, concepto, monto y trámite", async () => {
    const original = await emitirUnaCompleta();
    const copia = await cotizacionDe(await duplicar(original.id));

    const lineas = await lineasDe(copia.id);
    expect(
      lineas.map(({ clase, concepto, monto, tipoProcesoId: tp, orden }) => ({
        clase,
        concepto,
        monto,
        tipoProcesoId: tp,
        orden,
      })),
    ).toEqual([
      {
        clase: "honorario",
        concepto: "Honorario profesional",
        monto: 150_000,
        tipoProcesoId,
        orden: 0,
      },
      {
        clase: "gasto_estimado",
        concepto: "Tasas de migración",
        monto: 7_550,
        tipoProcesoId: null,
        orden: 1,
      },
      {
        clase: "honorario",
        concepto: "Acompañamiento en cita",
        monto: 12_345,
        tipoProcesoId: null,
        orden: 2,
      },
    ]);

    const originales = await lineasDe(original.id);
    expect(originales).toHaveLength(3);
    for (const linea of lineas) {
      expect(originales.map((cada) => cada.id)).not.toContain(linea.id);
    }
  });

  it("y los totales de la copia son los del original, sin recalcular mal", async () => {
    // Los tres montos sumados a mano: 150 000 + 12 345 de honorarios,
    // 7 550 de gasto estimado, 169 895 en total. No sale de `totalesDe`
    // (restricción 6 de la tajada), y una copia a la que le faltara o le
    // sobrara una línea daría otro número.
    const original = await emitirUnaCompleta();
    const copia = await cotizacionDe(await duplicar(original.id));

    const respuesta = await comoAutor(
      peticion(`/api/cotizaciones/${copia.id}/lineas`),
    );
    const cuerpo = (await respuesta.json()) as { totales: unknown };

    expect(cuerpo.totales).toEqual({
      honorarios: 162_345,
      gastosEstimados: 7_550,
      total: 169_895,
    });
  });

  it("la original no cambia ni una columna", async () => {
    // **La historia no se reescribe** (`docs/diseno.md` §8). Se compara la
    // fila entera leída de la base —`snapshot` y `tenant_id` incluidos, que
    // el cable no devuelve— contra la foto de antes.
    const original = await emitirUnaCompleta();
    const antes = await filaDe(original.id);
    const modulosAntes = await modulosDe(original.id);
    const lineasAntes = await lineasDe(original.id);
    const bitacoraAntes = await bitacoraDe(original.id);

    expect((await duplicar(original.id)).status).toBe(201);

    expect(await filaDe(original.id)).toEqual(antes);
    expect(await modulosDe(original.id)).toEqual(modulosAntes);
    expect(await lineasDe(original.id)).toEqual(lineasAntes);
    // Y tampoco le aparece un hecho nuevo: duplicar se registra contra la
    // copia, que es donde el hecho **es** el nacimiento.
    expect(await bitacoraDe(original.id)).toEqual(bitacoraAntes);
  });

  it("la copia no hereda el vencimiento del original", async () => {
    // El vencimiento es la ventana de validez de *esa* oferta, atada a
    // *esa* fecha. Y hay un motivo que lo decide sin opinión: con el
    // vencimiento copiado, `CHECK (vence_en >= fecha)` abortaría la
    // duplicación de cualquier cotización vencida, que es el caso más
    // corriente de todos.
    const original = await poblarUnBorrador("2030-12-31");
    expect(original.venceEn).toBe("2030-12-31");

    const copia = await cotizacionDe(await duplicar(original.id));
    expect(copia.venceEn).toBeNull();
  });

  it("se puede duplicar una cotización ya vencida", async () => {
    // El caso que el párrafo de arriba argumenta, medido. La fila se
    // envejece por SQL, y hay que mover **las dos** columnas: con sólo el
    // vencimiento en el pasado salta
    // `la_vigencia_no_termina_antes_de_empezar`, que es el mismo `CHECK`
    // que abortaría la copia. Por la ruta de alta no se puede sembrar esto:
    // el dominio rechaza un vencimiento pasado con `vencimiento_pasado`,
    // que es otra regla y de otra capa.
    const original = await poblarUnBorrador();
    await env.DB.prepare(
      "UPDATE cotizacion SET fecha = ?, vence_en = ? WHERE id = ?",
    )
      .bind(
        "2020-01-01T00:00:00.000Z",
        "2020-01-31T23:59:59.999Z",
        original.id,
      )
      .run();

    const respuesta = await duplicar(original.id);
    expect(respuesta.status, await respuesta.clone().text()).toBe(201);
    expect((await cotizacionDe(respuesta)).venceEn).toBeNull();
  });

  it("la copia es un borrador de verdad: se edita y se emite", async () => {
    // El contrapeso que hace a la duplicación útil. Sin esto, una copia que
    // naciera en cualquier otro estado pasaría todas las pruebas de arriba
    // y no serviría para lo único que duplicar existe: cambiar algo de un
    // documento que ya salió.
    const original = await emitirUnaCompleta();
    const copia = await cotizacionDe(await duplicar(original.id));

    await agregarLinea(copia.id, {
      clase: "honorario",
      concepto: "Honorario revisado",
      monto: 99_900,
    });
    expect(await lineasDe(copia.id)).toHaveLength(4);

    expect((await emitir(copia.id)).status).toBe(200);
  });

  it("duplicar una copia apunta a la copia y no al abuelo", async () => {
    // La cadena es de un salto por fila. Y como `0007` volvió inmutable a
    // `duplicada_de_id`, el grafo entero sólo crece por las hojas: subir por
    // la cadena buscando el original termina siempre.
    const abuelo = await emitirUnaCompleta();
    const madre = await cotizacionDe(await duplicar(abuelo.id));
    const nieta = await cotizacionDe(await duplicar(madre.id));

    expect(madre.duplicadaDeId).toBe(abuelo.id);
    expect(nieta.duplicadaDeId).toBe(madre.id);
    expect(nieta.duplicadaDeId).not.toBe(abuelo.id);
  });

  it.each(["borrador", "ganada", "perdida"] as const)(
    "una cotización %s también se duplica",
    async (estado) => {
      // Duplicar no tiene precondición de estado, y esto lo fija. El caso de
      // §8 —«si hay que cambiar algo después de emitida, se duplica»— es el
      // más corriente, no el único: volver a cotizarle a quien dijo que no
      // es el segundo.
      const original =
        estado === "borrador"
          ? await poblarUnBorrador()
          : estado === "ganada"
            ? await unaGanada()
            : await unaPerdida();

      const respuesta = await duplicar(original.id);
      expect(respuesta.status, await respuesta.clone().text()).toBe(201);

      const copia = await cotizacionDe(respuesta);
      expect(copia.estado).toBe("borrador");
      expect(copia.duplicadaDeId).toBe(original.id);
      expect(await lineasDe(copia.id)).toHaveLength(3);
    },
  );

  it("duplicar una sin módulos ni líneas deja una copia vacía, no un error", async () => {
    const original = await crearBorrador();

    const copia = await cotizacionDe(await duplicar(original.id));
    expect(await modulosDe(copia.id)).toEqual([]);
    expect(await lineasDe(copia.id)).toEqual([]);
    expect(copia.duplicadaDeId).toBe(original.id);
  });
});

describe("los hechos quedan en la bitácora", () => {
  /**
   * El registro completo de una cotización armada con `poblarUnBorrador` y
   * emitida, hasta antes del desenlace.
   *
   * Se escribe entero y no se filtra por los verbos del ciclo de vida: lo
   * que una lista completa afirma y una filtrada no es que el desenlace
   * **no escribió nada más**. Una copia de los módulos colada en el `batch`
   * equivocado se vería acá.
   */
  function registroHastaLaEmision(
    codigo: string,
  ): { accion: string; detalle: string | null }[] {
    return [
      { accion: "creado", detalle: codigo },
      { accion: "modulo_agregado", detalle: "Alcance" },
      { accion: "modulo_agregado", detalle: "Exclusiones" },
      { accion: "linea_agregada", detalle: "Honorario profesional" },
      { accion: "linea_agregada", detalle: "Tasas de migración" },
      { accion: "linea_agregada", detalle: "Acompañamiento en cita" },
      { accion: "emitido", detalle: codigo },
    ];
  }

  it("ganar registra «ganado» con el código, y una sola vez", async () => {
    const cotizacion = await emitirUnaCompleta();
    await ganar(cotizacion.id);
    // El segundo intento no escribe: muere en el 409 antes de llegar a
    // `mutar`. Si escribiera, acá habría dos «ganado».
    await ganar(cotizacion.id);

    expect(await bitacoraDe(cotizacion.id)).toEqual([
      ...registroHastaLaEmision(cotizacion.codigo),
      { accion: "ganado", detalle: cotizacion.codigo },
    ]);
  });

  it("perder registra «perdido» con el código", async () => {
    const cotizacion = await emitirUnaCompleta();
    await perder(cotizacion.id);

    expect(await bitacoraDe(cotizacion.id)).toEqual([
      ...registroHastaLaEmision(cotizacion.codigo),
      { accion: "perdido", detalle: cotizacion.codigo },
    ]);
  });

  it("duplicar registra «duplicado» contra la copia, con el código del original", async () => {
    // El registro de la copia abre con el hecho que **es** su nacimiento, y
    // dice de dónde vino. Por eso no lleva además un `creado`: serían dos
    // hechos para el mismo nacimiento.
    const original = await emitirUnaCompleta();
    const copia = await cotizacionDe(await duplicar(original.id));

    expect(await bitacoraDe(copia.id)).toEqual([
      { accion: "duplicado", detalle: original.codigo },
    ]);
  });

  it("el hecho de ganar no se registra contra ninguna otra entidad", async () => {
    const cotizacion = await emitirUnaCompleta();
    await ganar(cotizacion.id);

    const { results } = await env.DB.prepare(
      "SELECT entidad FROM bitacora WHERE accion = 'ganado'" +
        " AND entidad_id = ?",
    )
      .bind(cotizacion.id)
      .all<{ entidad: string }>();

    expect(results.map((fila) => fila.entidad)).toEqual(["cotizacion"]);
  });

  it("la copia y el original quedan con registros separados", async () => {
    const original = await emitirUnaCompleta();
    const copia = await cotizacionDe(await duplicar(original.id));

    const deLaCopia = await bitacoraDe(copia.id);
    const delOriginal = await bitacoraDe(original.id);

    // **La copia no hereda el registro del original.** Son cinco hechos de
    // contenido allá —dos módulos y tres líneas— y acá ninguno: lo que se
    // copió son filas, no historia. La copia tiene un solo renglón y es su
    // nacimiento.
    expect(deLaCopia.map((cada) => cada.accion)).toEqual(["duplicado"]);
    expect(delOriginal.map((cada) => cada.accion)).toEqual(
      registroHastaLaEmision(original.codigo).map((cada) => cada.accion),
    );
  });
});

// ---------------------------------------------------------------------------
// La carrera, provocada a mano
// ---------------------------------------------------------------------------

/**
 * Una `BaseDeDatos` que deja colar una escritura ajena **justo antes** de
 * delegar en la real. Es el mismo arnés de `test/modulos-api.spec.ts`, y por
 * el mismo motivo: vuelve determinista la ventana que hay entre que el
 * repositorio leyó el estado y escribió.
 */
function baseConIntruso(
  real: BaseDeDatos,
  intruso: () => Promise<unknown>,
): BaseDeDatos {
  return {
    lectura: real.lectura,
    async mutar(evento, ...sentencias) {
      await intruso();
      return real.mutar(evento, ...sentencias);
    },
  };
}

function servicioConIntruso(intruso: () => Promise<unknown>) {
  return cotizacionesSobreD1(
    baseConIntruso(baseSobreD1(env.DB, TENANT_UNICO_ID, autorId), intruso),
  );
}

describe("perder la carrera contra el otro desenlace", () => {
  it("ganar una que se perdió en el medio contesta 409 con el estado de verdad", async () => {
    // **Ésta es la prueba de la cláusula `AND estado = 'emitida'` del
    // `UPDATE`.** Sin ella la sentencia escribiría `'ganada'` sobre una fila
    // que ya es `'perdida'`, y entonces no contestaría 409: abortaría en
    // `cotizacion_el_estado_sigue_el_ciclo_de_vida` y el error saldría tal
    // cual, como un 500. Medido quitándola: la prueba muere.
    //
    // Y es la demostración de que la guarda se **cuenta** y no se atrapa: no
    // hay `try`/`catch` en el camino, así que la única forma de que esto sea
    // un 409 y no un 500 es no haber escrito.
    const cotizacion = await emitirUnaCompleta();

    const resultado = await servicioConIntruso(() =>
      env.DB.prepare("UPDATE cotizacion SET estado = 'perdida' WHERE id = ?")
        .bind(cotizacion.id)
        .run(),
    ).ganar(TENANT_UNICO_ID, cotizacion.id);

    expect(resultado).toEqual({ estado: "no_es_emitida", actual: "perdida" });

    // El contrapeso sobre la consecuencia y no sobre el mensaje: el
    // desenlace que quedó es el del intruso, no una mezcla de los dos.
    expect((await filaDe(cotizacion.id))?.estado).toBe("perdida");
  });

  it("la que pierde la carrera tampoco abre los procesos (T-7)", async () => {
    // **Una premisa del plan de T-7 resultó falsa, y ésta es la prueba que
    // la corrige.** El plan decía que T-7 no necesitaba idempotencia propia
    // porque «la transición ya la garantiza». La transición garantiza que
    // el **estado** se escribe una sola vez —lo prueba la hermana de
    // arriba—, pero las aperturas no colgaban de ella: un `UPDATE` que
    // cambia cero filas no es un error, así que la petición perdedora
    // escribía sus procesos igual y la cotización terminaba con los
    // trámites abiertos dos veces.
    //
    // Lo que lo cierra es que cada `INSERT` de apertura lleve la misma
    // precondición que el `UPDATE` —`estado = 'emitida'`— evaluada dentro
    // de la transacción, y que las aperturas vayan **antes** del `UPDATE`,
    // porque después la condición ya sería cierta por obra nuestra.
    //
    // Medido quitando la condición: esta prueba muere con un proceso
    // abierto de más. No es una guarda que ninguna prueba pueda matar.
    const cotizacion = await emitirUnaCompleta();

    const resultado = await servicioConIntruso(() =>
      env.DB.prepare("UPDATE cotizacion SET estado = 'ganada' WHERE id = ?")
        .bind(cotizacion.id)
        .run(),
    ).ganar(TENANT_UNICO_ID, cotizacion.id);

    expect(resultado).toEqual({ estado: "no_es_emitida", actual: "ganada" });

    // El desenlace que quedó es el del intruso, y los procesos que quedaron
    // son los suyos: ninguno, porque el intruso escribió el estado a mano.
    const abiertos = await env.DB.prepare(
      "SELECT count(*) AS n FROM proceso p" +
        " JOIN cotizacion_linea l ON l.id = p.cotizacion_linea_id" +
        " WHERE l.cotizacion_id = ?",
    )
      .bind(cotizacion.id)
      .first<{ n: number }>();

    expect(abiertos?.n).toBe(0);
  });

  it("el puerto se niega igual sin pasar por la ruta", async () => {
    // La comprobación de estado vive en el puerto y no sólo en el ruteo, y
    // esto es lo que la mantiene viva: sin esta prueba, borrar las tres
    // líneas del puerto no pondría nada en rojo, porque la ruta las repite.
    // Es la misma red que `test/modulos-api.spec.ts` dejó puesta para T-4 y
    // T-5, y ésta es la tarea que la usaba.
    const borrador = await poblarUnBorrador();
    const servicio = cotizacionesSobreD1(
      baseSobreD1(env.DB, TENANT_UNICO_ID, autorId),
    );

    expect(await servicio.ganar(TENANT_UNICO_ID, borrador.id)).toEqual({
      estado: "no_es_emitida",
      actual: "borrador",
    });
    expect(await servicio.perder(TENANT_UNICO_ID, borrador.id)).toEqual({
      estado: "no_es_emitida",
      actual: "borrador",
    });
  });
});

describe("la superficie de las tres rutas", () => {
  const VERBOS = ["ganar", "perder", "duplicar"] as const;

  it.each(VERBOS)("%s sobre una cotización inexistente contesta 404", async (verbo) => {
    const respuesta = await comoAutor(
      peticion(`/api/cotizaciones/${nuevoId()}/${verbo}`, { method: "POST" }),
    );

    expect(respuesta.status).toBe(404);
    expect(await respuesta.json()).toEqual({ error: "not_found" });
  });

  it.each(VERBOS)(
    "%s sobre una cotización del vecino contesta 404 y no 403",
    async (verbo) => {
      // I-8. Un 403 confirmaría que ese identificador existe, que es
      // exactamente lo que no se puede filtrar. La fila ajena está
      // **emitida**, así que un 409 acá también sería una fuga: diría que
      // la fila se pudo leer.
      const respuesta = await comoAutor(
        peticion(`/api/cotizaciones/${cotizacionAjenaId}/${verbo}`, {
          method: "POST",
        }),
      );

      expect(respuesta.status).toBe(404);
      expect(await respuesta.json()).toEqual({ error: "not_found" });
    },
  );

  it.each(VERBOS)("la del vecino sigue intacta después del 404 de %s", async (verbo) => {
    const antes = await filaDe(cotizacionAjenaId);
    await comoAutor(
      peticion(`/api/cotizaciones/${cotizacionAjenaId}/${verbo}`, {
        method: "POST",
      }),
    );

    expect(await filaDe(cotizacionAjenaId)).toEqual(antes);
  });

  it.each(VERBOS)("%s sólo acepta POST", async (verbo) => {
    const cotizacion = await emitirUnaCompleta();

    for (const metodo of ["GET", "PUT", "DELETE"]) {
      const respuesta = await comoAutor(
        peticion(`/api/cotizaciones/${cotizacion.id}/${verbo}`, { method: metodo }),
      );

      expect(respuesta.status, `${metodo} ${verbo}`).toBe(405);
      expect(respuesta.headers.get("allow")).toBe("POST");
    }
  });

  it.each(VERBOS)("el 405 de %s se contesta sin mirar si la cotización existe", async (verbo) => {
    // El mismo criterio que las rutas de módulos y de líneas: un verbo que
    // esta dirección no tiene no es una pregunta sobre ninguna cotización,
    // así que contestarlo no dice si existe. Con el 404 primero, un `GET`
    // contra un identificador ajeno contestaría distinto que contra uno
    // nuestro.
    const respuesta = await comoAutor(
      peticion(`/api/cotizaciones/${nuevoId()}/${verbo}`, { method: "GET" }),
    );

    expect(respuesta.status).toBe(405);
  });

  it.each(VERBOS)("%s no tiene subrutas", async (verbo) => {
    const cotizacion = await emitirUnaCompleta();

    const respuesta = await comoAutor(
      peticion(`/api/cotizaciones/${cotizacion.id}/${verbo}/algo`, {
        method: "POST",
      }),
    );

    expect(respuesta.status).toBe(404);
  });

  it.each(VERBOS)("%s ignora el cuerpo que le manden", async (verbo) => {
    // Ninguno de los tres lee el cuerpo, y esto lo fija: un campo que
    // llegara a tener efecto sería una forma de imponer desde afuera algo
    // que la API decide. El `estado` de abajo es el que más daño haría.
    const cotizacion = await emitirUnaCompleta();

    const respuesta = await comoAutor(
      conCuerpo(`/api/cotizaciones/${cotizacion.id}/${verbo}`, "POST", {
        estado: "borrador",
        codigo: "COT-IMPUESTO-0001",
        duplicadaDeId: cotizacion.id,
        snapshot: null,
      }),
    );

    expect([200, 201]).toContain(respuesta.status);

    // La original conserva su código y su estado: nada del cuerpo entró.
    const fila = await filaDe(cotizacion.id);
    expect(fila?.codigo).toBe(cotizacion.codigo);
    expect(fila?.estado).toBe(verbo === "duplicar" ? "emitida" : verbo === "ganar" ? "ganada" : "perdida");
  });

  it("un cuerpo que ni siquiera es JSON tampoco molesta", async () => {
    const cotizacion = await emitirUnaCompleta();

    const respuesta = await comoAutor(
      peticion(`/api/cotizaciones/${cotizacion.id}/ganar`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{esto no es json",
      }),
    );

    expect(respuesta.status).toBe(200);
  });
});
