/**
 * El tablero de Inicio (`odd/tasks/inicio-tablero.md`, T-1).
 *
 * `GET /api/inicio` contesta la pregunta con la que alguien abre la
 * aplicación: **qué me espera a mí**, y cómo se movieron las cotizaciones
 * este mes. Lo que esta suite fija:
 *
 *  1. **Mis pendientes son los míos y los abiertos.** Solo donde soy
 *     responsable, solo los que nadie cerró, y solo de procesos abiertos: un
 *     trámite terminado no le debe trabajo a nadie.
 *  2. **Mis cotizaciones por atender** son mis borradores y mis emitidas que
 *     vencen dentro de siete días o ya vencieron.
 *  3. **Los cuatro estados se cuentan por separado** y con el momento que
 *     corresponde a cada uno: el borrador por `creada_en`, y emitida, ganada
 *     y perdida por la entrada de bitácora de su transición. No se agrega
 *     ninguna entidad ni verbo: la bitácora ya es el registro de esos hechos.
 *  4. **El mes es el de Panamá.** Un borrador abierto a las 23:59 del último
 *     día del mes, hora local, es del mes que termina aunque en UTC ya sea el
 *     siguiente.
 *  5. **El alcance cambia quién cuenta, no quién soy.** «Mías» filtra por
 *     `creada_por`; «del bufete» cuenta a todos, y nunca a otro bufete.
 *
 * **Sin plata en ningún lado**, decisión del usuario: la respuesta no tiene
 * un solo monto, y la prueba de forma lo verifica.
 *
 * ## Por qué los conteos del bufete se miden como diferencia
 *
 * La base de esta suite es compartida entre pruebas y nadie borra nada (la
 * bitácora no se puede borrar). Las cuentas «mías» son exactas porque cada
 * prueba nace con una persona nueva; las del bufete se miden como **lo que
 * cambió** entre dos lecturas, que es lo único que no depende de lo que
 * otras pruebas hayan dejado.
 */
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { TENANT_UNICO_ID, nuevoId } from "../worker/db/ids";
import { hoyEnPanama } from "../worker/db/momentos";
import type { ServicioDelInicio } from "../worker/inicio/repositorio";
import { manejar } from "../worker/index";

const DOMINIO_DE_ACCESS = "https://bufete-de-prueba.cloudflareaccess.com";
const AUD = "aud-de-la-aplicacion-del-bufete";

interface CuentaEnElCable {
  borrador: number;
  emitida: number;
  ganada: number;
  perdida: number;
}

interface MesEnElCable extends CuentaEnElCable {
  mes: string;
}

interface InicioEnElCable {
  alcance: string;
  hoy: string;
  misPendientes: {
    id: string;
    texto: string;
    venceEn: string | null;
    procesoId: string;
    procesoTitulo: string;
    clienteNombre: string | null;
  }[];
  misCotizaciones: {
    id: string;
    codigo: string;
    clienteNombre: string | null;
    estado: string;
    venceEn: string | null;
  }[];
  mes: MesEnElCable & { tasaDeCierre: number | null };
}

let yoId: string;
let emailMio: string;
let colegaId: string;
let clienteId: string;
let procesoId: string;
let etapaId: string;
let otroTenantId: string;
let usuarioAjenoId: string;
let clienteAjenoId: string;

/** Un momento con mucho margen hacia atrás: no cae en ningún mes contado. */
const HACE_MUCHO = "2020-01-15T15:00:00.000Z";

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

function comoYo(request: Request): Promise<Response> {
  return manejar(request, entorno(), { correoDeDesarrollo: () => emailMio });
}

async function inicio(alcance?: string): Promise<InicioEnElCable> {
  const consulta = alcance === undefined ? "" : `?alcance=${alcance}`;
  const respuesta = await comoYo(peticion(`/api/inicio${consulta}`));
  expect(respuesta.status).toBe(200);
  return (await respuesta.json()) as InicioEnElCable;
}

// --- El calendario de Panamá, escrito acá a mano a propósito ----------------
//
// La suite no le pide al código bajo prueba que le diga dónde empieza el mes:
// lo escribe con la regla de negocio —Panamá es UTC−5 todo el año— para que
// un error en esa cuenta no se pueda esconder detrás de sí mismo.

function hoy(): string {
  return hoyEnPanama(new Date());
}

function mesDe(dia: string): string {
  return dia.slice(0, 7);
}

function sumarDias(dia: string, dias: number): string {
  const fecha = new Date(`${dia}T12:00:00.000Z`);
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return fecha.toISOString().slice(0, 10);
}

/** La medianoche del día 1 en Panamá, en UTC: las 05:00 de ese día. */
function inicioDelMes(mes: string): string {
  return `${mes}-01T05:00:00.000Z`;
}

/** Un milisegundo antes: las 23:59:59.999 del último día del mes anterior. */
function justoAntesDelMes(mes: string): string {
  return `${mes}-01T04:59:59.999Z`;
}

/** El vencimiento como lo guarda el repositorio: el fin del día en Panamá. */
function finDelDia(dia: string): string {
  return `${sumarDias(dia, 1)}T04:59:59.999Z`;
}

// --- Altas directas en la base ---------------------------------------------

interface Cotizar {
  estado: "borrador" | "emitida" | "ganada" | "perdida";
  creadaPor?: string;
  creadaEn?: string;
  venceDia?: string | null;
  tenantId?: string;
  cliente?: string;
}

async function cotizacion(datos: Cotizar): Promise<string> {
  const id = nuevoId();
  const creadaEn = datos.creadaEn ?? HACE_MUCHO;
  await env.DB.prepare(
    "INSERT INTO cotizacion (id, tenant_id, cliente_id, codigo, estado," +
      " fecha, vence_en, moneda, snapshot, creada_por, creada_en)" +
      " VALUES (?, ?, ?, ?, ?, ?, ?, 'USD', ?, ?, ?)",
  )
    .bind(
      id,
      datos.tenantId ?? TENANT_UNICO_ID,
      datos.cliente ?? clienteId,
      `COT-INICIO-${id}`,
      datos.estado,
      // `fecha` acompaña a la creación: el `CHECK` exige que la vigencia no
      // termine antes de empezar, y un vencimiento ya pasado tiene que
      // poder existir.
      creadaEn,
      datos.venceDia === undefined || datos.venceDia === null
        ? null
        : finDelDia(datos.venceDia),
      datos.estado === "borrador" ? null : "{}",
      datos.creadaPor ?? yoId,
      creadaEn,
    )
    .run();
  return id;
}

async function transicion(
  cotizacionId: string,
  accion: "emitido" | "ganado" | "perdido",
  ocurridoEn: string,
  quien: string = yoId,
  tenantId: string = TENANT_UNICO_ID,
): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO bitacora (id, tenant_id, entidad, entidad_id, accion," +
      " usuario_id, ocurrido_en) VALUES (?, ?, 'cotizacion', ?, ?, ?, ?)",
  )
    .bind(nuevoId(), tenantId, cotizacionId, accion, quien, ocurridoEn)
    .run();
}

async function pendiente(datos: {
  texto: string;
  responsable: string | null;
  venceDia?: string | null;
  cerrado?: boolean;
  enProceso?: string;
  enEtapa?: string;
}): Promise<string> {
  const id = nuevoId();
  const cerradoEn = datos.cerrado === true ? new Date().toISOString() : null;
  await env.DB.prepare(
    "INSERT INTO pendiente (id, tenant_id, proceso_id, proceso_etapa_id," +
      " texto, autor_id, responsable_id, creado_en, vence_en, cerrado_en," +
      " cerrado_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(
      id,
      TENANT_UNICO_ID,
      datos.enProceso ?? procesoId,
      datos.enEtapa ?? etapaId,
      datos.texto,
      colegaId,
      datos.responsable,
      new Date().toISOString(),
      datos.venceDia === undefined || datos.venceDia === null
        ? null
        : `${datos.venceDia}T23:59:59.999Z`,
      cerradoEn,
      cerradoEn === null ? null : colegaId,
    )
    .run();
  return id;
}

/** Un proceso más del mismo cliente, con su única etapa. */
async function otroProceso(
  titulo: string,
  estado: "abierto" | "cerrado",
): Promise<{ procesoId: string; etapaId: string }> {
  const nuevoProceso = nuevoId();
  const nuevaEtapa = nuevoId();
  const ahora = new Date().toISOString();
  const tipo = await env.DB.prepare(
    "SELECT tipo_proceso_id FROM proceso WHERE id = ?",
  )
    .bind(procesoId)
    .first<{ tipo_proceso_id: string }>();

  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO proceso (id, tenant_id, cliente_id, tipo_proceso_id," +
        " origen, titulo, estado, responsable_id, abierto_en, cerrado_en)" +
        " VALUES (?, ?, ?, ?, 'directo', ?, ?, ?, ?, ?)",
    ).bind(
      nuevoProceso,
      TENANT_UNICO_ID,
      clienteId,
      tipo?.tipo_proceso_id ?? "",
      titulo,
      estado,
      yoId,
      ahora,
      estado === "cerrado" ? ahora : null,
    ),
    env.DB.prepare(
      "INSERT INTO proceso_etapa (id, tenant_id, proceso_id, nombre, orden)" +
        " VALUES (?, ?, ?, 'Única etapa', 0)",
    ).bind(nuevaEtapa, TENANT_UNICO_ID, nuevoProceso),
  ]);

  return { procesoId: nuevoProceso, etapaId: nuevaEtapa };
}

function restar(
  despues: CuentaEnElCable,
  antes: CuentaEnElCable,
): CuentaEnElCable {
  return {
    borrador: despues.borrador - antes.borrador,
    emitida: despues.emitida - antes.emitida,
    ganada: despues.ganada - antes.ganada,
    perdida: despues.perdida - antes.perdida,
  };
}

function cuentaDe(mes: MesEnElCable): CuentaEnElCable {
  return {
    borrador: mes.borrador,
    emitida: mes.emitida,
    ganada: mes.ganada,
    perdida: mes.perdida,
  };
}

/**
 * Cada prueba nace con su propia persona, su colega, un cliente y un
 * proceso abierto, y con un bufete vecino entero. Identificadores nuevos
 * siempre: nada se borra.
 */
beforeEach(async () => {
  yoId = nuevoId();
  emailMio = `yo-${yoId}@bufete.test`;
  colegaId = nuevoId();
  clienteId = nuevoId();
  procesoId = nuevoId();
  etapaId = nuevoId();
  otroTenantId = nuevoId();
  usuarioAjenoId = nuevoId();
  clienteAjenoId = nuevoId();
  const areaId = nuevoId();
  const tipoId = nuevoId();
  const ahora = new Date().toISOString();

  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO usuario (id, tenant_id, nombre, email, activo)" +
        " VALUES (?, ?, ?, ?, 1)",
    ).bind(yoId, TENANT_UNICO_ID, "Itzel", emailMio),
    env.DB.prepare(
      "INSERT INTO usuario (id, tenant_id, nombre, email, activo)" +
        " VALUES (?, ?, ?, ?, 1)",
    ).bind(colegaId, TENANT_UNICO_ID, "Ricardo", `colega-${colegaId}@bufete.test`),
    env.DB.prepare(
      "INSERT INTO cliente (id, tenant_id, nombre, telefono, creado_por," +
        " creado_en) VALUES (?, ?, ?, ?, ?, ?)",
    ).bind(clienteId, TENANT_UNICO_ID, "Marta Quintero", "+507 6000-0000", yoId, ahora),
    env.DB.prepare(
      "INSERT INTO area (id, tenant_id, nombre, activo) VALUES (?, ?, ?, 1)",
    ).bind(areaId, TENANT_UNICO_ID, `Migración ${areaId}`),
    env.DB.prepare(
      "INSERT INTO tipo_proceso (id, tenant_id, area_id, nombre, activo)" +
        " VALUES (?, ?, ?, ?, 1)",
    ).bind(tipoId, TENANT_UNICO_ID, areaId, `Residencia ${tipoId}`),
    env.DB.prepare(
      "INSERT INTO proceso (id, tenant_id, cliente_id, tipo_proceso_id," +
        " origen, titulo, estado, responsable_id, abierto_en)" +
        " VALUES (?, ?, ?, ?, 'directo', ?, 'abierto', ?, ?)",
    ).bind(
      procesoId,
      TENANT_UNICO_ID,
      clienteId,
      tipoId,
      "Residencia permanente de Marta Quintero",
      yoId,
      ahora,
    ),
    env.DB.prepare(
      "INSERT INTO proceso_etapa (id, tenant_id, proceso_id, nombre, orden)" +
        " VALUES (?, ?, ?, 'Recepción de documentos', 0)",
    ).bind(etapaId, TENANT_UNICO_ID, procesoId),

    env.DB.prepare("INSERT INTO tenant (id, nombre) VALUES (?, ?)").bind(
      otroTenantId,
      "Otro bufete",
    ),
    env.DB.prepare(
      "INSERT INTO usuario (id, tenant_id, nombre, email, activo)" +
        " VALUES (?, ?, ?, ?, 1)",
    ).bind(
      usuarioAjenoId,
      otroTenantId,
      "Abogada del vecino",
      `ajena-${usuarioAjenoId}@otro-bufete.test`,
    ),
    env.DB.prepare(
      "INSERT INTO cliente (id, tenant_id, nombre, telefono, creado_por," +
        " creado_en) VALUES (?, ?, ?, ?, ?, ?)",
    ).bind(
      clienteAjenoId,
      otroTenantId,
      "Cliente del vecino",
      "+507 6999-9999",
      usuarioAjenoId,
      ahora,
    ),
  ]);
});

// ---------------------------------------------------------------------------
// La puerta y la forma
// ---------------------------------------------------------------------------

describe("la ruta del inicio", () => {
  it("sin identidad no llega al servicio", async () => {
    let llamadas = 0;
    const espia: ServicioDelInicio = {
      resumen() {
        llamadas += 1;
        return Promise.reject(new Error("no debía llegar"));
      },
    };

    const respuesta = await manejar(peticion("/api/inicio"), entorno(), {
      correoDeDesarrollo: () => null,
      inicio: espia,
    });

    expect(respuesta.status).toBe(403);
    expect(llamadas).toBe(0);
  });

  it("solo se lee", async () => {
    const respuesta = await comoYo(
      peticion("/api/inicio", { method: "POST" }),
    );
    expect(respuesta.status).toBe(405);
    expect(respuesta.headers.get("allow")).toBe("GET");
  });

  it("un alcance que no existe es 422, no un silencioso «mío»", async () => {
    const respuesta = await comoYo(peticion("/api/inicio?alcance=todos"));
    expect(respuesta.status).toBe(422);
    const cuerpo = (await respuesta.json()) as {
      error: string;
      fallas: { campo: string; motivo: string }[];
    };
    expect(cuerpo.error).toBe("datos_invalidos");
    expect(cuerpo.fallas).toEqual([
      { campo: "alcance", motivo: "tipo_invalido" },
    ]);
  });

  it("sin alcance es «mío», y no se guarda en ningún caché", async () => {
    const respuesta = await comoYo(peticion("/api/inicio"));
    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get("cache-control")).toBe("no-store");
    const cuerpo = (await respuesta.json()) as InicioEnElCable;
    expect(cuerpo.alcance).toBe("mio");
    expect(cuerpo.hoy).toBe(hoy());
  });

  it("no lleva plata: ni un monto, ni una moneda", async () => {
    const id = await cotizacion({ estado: "borrador", creadaEn: new Date().toISOString() });
    const cuerpo = await inicio("mio");
    expect(cuerpo.misCotizaciones.map((c) => c.id)).toContain(id);

    const texto = JSON.stringify(cuerpo).toLowerCase();
    for (const palabra of ["monto", "total", "moneda", "usd", "precio", "honorario"]) {
      expect(texto, `la respuesta habla de «${palabra}»`).not.toContain(palabra);
    }
  });
});

// ---------------------------------------------------------------------------
// 1 · Mis pendientes
// ---------------------------------------------------------------------------

describe("mis pendientes", () => {
  it("son los abiertos de procesos abiertos donde soy responsable", async () => {
    const mio = await pendiente({ texto: "Falta el pasaporte", responsable: yoId, venceDia: hoy() });
    await pendiente({ texto: "Del colega", responsable: colegaId });
    await pendiente({ texto: "Sin responsable", responsable: null });
    await pendiente({ texto: "Ya cerrado", responsable: yoId, cerrado: true });

    const cerrado = await otroProceso("Proceso terminado", "cerrado");
    await pendiente({
      texto: "De un proceso cerrado",
      responsable: yoId,
      enProceso: cerrado.procesoId,
      enEtapa: cerrado.etapaId,
    });

    const { misPendientes } = await inicio();

    expect(misPendientes).toEqual([
      {
        id: mio,
        texto: "Falta el pasaporte",
        venceEn: hoy(),
        procesoId,
        procesoTitulo: "Residencia permanente de Marta Quintero",
        clienteNombre: "Marta Quintero",
      },
    ]);
  });

  it("el que vence antes va arriba y los sin fecha al final", async () => {
    await pendiente({ texto: "Sin fecha", responsable: yoId });
    await pendiente({ texto: "En tres días", responsable: yoId, venceDia: sumarDias(hoy(), 3) });
    await pendiente({ texto: "Vencido", responsable: yoId, venceDia: sumarDias(hoy(), -2) });
    await pendiente({ texto: "Hoy", responsable: yoId, venceDia: hoy() });

    const { misPendientes } = await inicio();

    expect(misPendientes.map((p) => p.texto)).toEqual([
      "Vencido",
      "Hoy",
      "En tres días",
      "Sin fecha",
    ]);
  });

  it("no cambian con el alcance: el bufete no le pasa sus pendientes a nadie", async () => {
    await pendiente({ texto: "Del colega", responsable: colegaId });
    await pendiente({ texto: "Mío", responsable: yoId });

    const { misPendientes } = await inicio("bufete");
    expect(misPendientes.map((p) => p.texto)).toEqual(["Mío"]);
  });
});

// ---------------------------------------------------------------------------
// 2 · Mis cotizaciones por atender
// ---------------------------------------------------------------------------

describe("mis cotizaciones por atender", () => {
  it("son mis borradores y mis emitidas que vencen en siete días o ya vencieron", async () => {
    const borrador = await cotizacion({ estado: "borrador" });
    const vencida = await cotizacion({ estado: "emitida", venceDia: sumarDias(hoy(), -3) });
    const enSiete = await cotizacion({ estado: "emitida", venceDia: sumarDias(hoy(), 7) });
    await cotizacion({ estado: "emitida", venceDia: sumarDias(hoy(), 8) });
    await cotizacion({ estado: "emitida", venceDia: null });
    await cotizacion({ estado: "ganada", venceDia: sumarDias(hoy(), 1) });
    await cotizacion({ estado: "perdida", venceDia: sumarDias(hoy(), 1) });
    await cotizacion({ estado: "borrador", creadaPor: colegaId });
    await cotizacion({ estado: "emitida", creadaPor: colegaId, venceDia: hoy() });

    const { misCotizaciones } = await inicio("bufete");

    // Primero lo que vence, por fecha; el borrador sin vencimiento al final.
    expect(misCotizaciones.map((c) => c.id)).toEqual([vencida, enSiete, borrador]);
    expect(misCotizaciones[0]).toEqual({
      id: vencida,
      codigo: `COT-INICIO-${vencida}`,
      clienteNombre: "Marta Quintero",
      estado: "emitida",
      venceEn: sumarDias(hoy(), -3),
    });
  });
});

// ---------------------------------------------------------------------------
// 3, 4 y 5 · El mes y el alcance
// ---------------------------------------------------------------------------

describe("el mes cuenta los cuatro estados por separado", () => {
  it("borrador por su creación; emitida, ganada y perdida por su transición", async () => {
    const mes = mesDe(hoy());
    const ahora = new Date().toISOString();

    await cotizacion({ estado: "borrador", creadaEn: ahora });
    const a = await cotizacion({ estado: "ganada" });
    const b = await cotizacion({ estado: "perdida" });
    const c = await cotizacion({ estado: "emitida" });
    await transicion(c, "emitido", ahora);
    await transicion(a, "emitido", inicioDelMes(mes));
    await transicion(a, "ganado", ahora);
    await transicion(b, "perdido", ahora);

    const cuerpo = await inicio("mio");

    expect(cuerpo.mes).toEqual({
      mes,
      borrador: 1,
      emitida: 2,
      ganada: 1,
      perdida: 1,
      tasaDeCierre: 0.5,
    });
  });

  it("el mes es el de Panamá: las 23:59 del último día son del mes que termina", async () => {
    const mes = mesDe(hoy());

    await cotizacion({ estado: "borrador", creadaEn: inicioDelMes(mes) });
    await cotizacion({ estado: "borrador", creadaEn: justoAntesDelMes(mes) });
    const ganada = await cotizacion({ estado: "ganada" });
    await transicion(ganada, "ganado", justoAntesDelMes(mes));

    const cuerpo = await inicio("mio");

    // Leídos en UTC, los dos de las 04:59Z caerían en este mes.
    expect(cuerpo.mes).toEqual({
      mes,
      borrador: 1,
      emitida: 0,
      ganada: 0,
      perdida: 0,
      tasaDeCierre: null,
    });
  });

  it("sin ganadas ni perdidas no hay tasa de cierre: es nula, no cero", async () => {
    const ahora = new Date().toISOString();
    const emitida = await cotizacion({ estado: "emitida" });
    await transicion(emitida, "emitido", ahora);

    const cuerpo = await inicio("mio");

    expect(cuerpo.mes.emitida).toBe(1);
    expect(cuerpo.mes.tasaDeCierre).toBeNull();
  });
});

describe("el alcance", () => {
  it("«mías» cuenta lo que yo creé; «del bufete» suma al colega y nunca al vecino", async () => {
    const ahora = new Date().toISOString();
    const antes = await inicio("bufete");

    // Mía.
    await cotizacion({ estado: "borrador", creadaEn: ahora });
    // Del colega, ganada este mes aunque la haya cerrado yo: cuenta para
    // quien la creó, no para quien firmó la transición.
    const delColega = await cotizacion({ estado: "ganada", creadaPor: colegaId });
    await transicion(delColega, "ganado", ahora, yoId);
    // Del vecino: no cuenta en ningún alcance.
    const ajena = await cotizacion({
      estado: "perdida",
      tenantId: otroTenantId,
      cliente: clienteAjenoId,
      creadaPor: usuarioAjenoId,
    });
    await transicion(ajena, "perdido", ahora, usuarioAjenoId, otroTenantId);
    await cotizacion({
      estado: "borrador",
      tenantId: otroTenantId,
      cliente: clienteAjenoId,
      creadaPor: usuarioAjenoId,
      creadaEn: ahora,
    });

    const mio = await inicio("mio");
    const bufete = await inicio("bufete");

    expect(cuentaDe(mio.mes)).toEqual({ borrador: 1, emitida: 0, ganada: 0, perdida: 0 });

    expect(restar(cuentaDe(bufete.mes), cuentaDe(antes.mes))).toEqual({
      borrador: 1,
      emitida: 0,
      ganada: 1,
      perdida: 0,
    });
  });
});
