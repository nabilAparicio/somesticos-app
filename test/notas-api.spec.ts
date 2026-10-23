/**
 * Las notas de un proceso y su línea de tiempo
 * (`odd/tasks/crm-procesos.md`, T-8).
 *
 * Una **nota es un hecho**: fechado, anclado a la etapa donde ocurrió, con
 * autor, e inmutable (`docs/diseno.md` §3). No la escribe el sistema: la
 * escribe una persona porque quiere dejar dicho algo. El ejemplo real del
 * bufete —«el cliente quiere pago diferido por meses»— es el que se usa acá,
 * porque si los ejemplos del proyecto son `nota1` eso es lo que se va a
 * cargar.
 *
 * Las cuatro cosas que esta suite existe para fijar:
 *
 *  1. **No hay forma de editar ni de borrar una nota por la API.** Se prueba
 *     por el 405 de cada método de escritura, y además comprobando que los
 *     dos disparadores de T-2 siguen vivos contra la base.
 *  2. **La etapa a la que se ancla la decide el servidor cuando nadie la
 *     elige**, y es la *vigente*: la primera pendiente del plan. Un proceso
 *     recién abierto no tiene ninguna etapa alcanzada, y es exactamente el
 *     caso que la columna `NOT NULL` obliga a resolver.
 *  3. **Quitar del plan una etapa pendiente que tiene notas se RECHAZA**, y
 *     el rechazo dice cuántas notas lo impiden. T-7 dejó ese encargo escrito
 *     para esta tarea, que es la que crea la dependencia.
 *  4. **La línea de tiempo agrupa por etapa en el orden del plan**, no en el
 *     orden en que alguien escribió.
 *
 * Y la disciplina que T-6 y T-7 dejaron asentada: **la guarda es el conteo
 * explícito, no un `catch` del error de la base.** No se atrapa la llave
 * foránea para disfrazarla de respuesta amable. Con ese `catch`, aflojar la
 * guarda no rompería ninguna prueba y la guarda quedaría sin verificar para
 * siempre.
 */
import { env } from "cloudflare:workers";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { TENANT_UNICO_ID, nuevoId } from "../worker/db/ids";
import { manejar } from "../worker/index";
import type { ServicioDeNotas } from "../worker/notas/repositorio";
import type { ServicioDeProcesos } from "../worker/procesos/repositorio";

const DOMINIO_DE_ACCESS = "https://bufete-de-prueba.cloudflareaccess.com";
const AUD = "aud-de-la-aplicacion-del-bufete";

const EMAIL_AUTOR = "itzel@bufete.test";
const EMAIL_SOCIO = "ricardo@bufete.test";

const PLAN_DE_RESIDENCIA = [
  "Recepción y revisión de documentos",
  "Presentación ante el Servicio Nacional de Migración",
  "Entrevista y verificación domiciliaria",
  "Resolución y entrega del carné",
] as const;

/** El ejemplo real del bufete, textual. */
const PAGO_DIFERIDO = "El cliente quiere pago diferido por meses.";

interface NotaEnElCable {
  id: string;
  procesoEtapaId: string;
  texto: string;
  autorId: string;
  autorNombre: string | null;
  creadaEn: string;
}

interface TramoEnElCable {
  etapa: {
    id: string;
    nombre: string;
    orden: number;
    alcanzadaEn: string | null;
  };
  notas: NotaEnElCable[];
}

interface LineaEnElCable {
  tramos: TramoEnElCable[];
}

interface FallaEnElCable {
  campo: string;
  motivo: string;
  cuantos?: number;
}

/**
 * El tenant vecino. Existe solo para que la fuga sea expresable, y **nace de
 * cero en cada prueba** por la razón de abajo.
 */
let OTRO_TENANT_ID: string;

let autorId: string;
let socioId: string;
let usuarioAjenoId: string;
let clienteId: string;
let clienteAjenoId: string;
let areaId: string;
let tipoResidenciaId: string;
let tipoSinPlantillaId: string;
let tipoAjenoId: string;
let areaAjenaId: string;
let procesoAjenoId: string;
let etapaAjenaId: string;

function entorno(): Env {
  // Hermético: un `.dev.vars` local con `ACCESO_DEV_EMAIL` no puede decidir
  // qué identidad observa la suite.
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
  return manejar(request, entorno(), {
    correoDeDesarrollo: () => EMAIL_AUTOR,
  });
}

/** La segunda persona del bufete: la autoría tiene que distinguirlas. */
function comoSocio(request: Request): Promise<Response> {
  return manejar(request, entorno(), {
    correoDeDesarrollo: () => EMAIL_SOCIO,
  });
}

function sinIdentidad(
  request: Request,
  espias: { notas?: ServicioDeNotas; procesos?: ServicioDeProcesos },
): Promise<Response> {
  return manejar(request, entorno(), {
    correoDeDesarrollo: () => null,
    ...espias,
  });
}

async function fallasDe(respuesta: Response): Promise<FallaEnElCable[]> {
  const cuerpo = (await respuesta.json()) as {
    error?: string;
    fallas?: FallaEnElCable[];
  };
  expect(cuerpo.error).toBe("datos_invalidos");
  return cuerpo.fallas ?? [];
}

async function motivosDe(respuesta: Response): Promise<string[]> {
  return (await fallasDe(respuesta)).map((falla) => falla.motivo);
}

// --- Altas de conveniencia, cada una verificada en su propio contrapeso ----

async function crearProceso(tipoProcesoId: string): Promise<string> {
  const respuesta = await comoAutor(
    conCuerpo("/api/procesos", "POST", {
      clienteId,
      tipoProcesoId,
      titulo: "Residencia permanente de Marta Quintero",
    }),
  );
  expect(respuesta.status).toBe(201);
  return ((await respuesta.json()) as { proceso: { id: string } }).proceso.id;
}

function anotar(
  procesoId: string,
  cuerpo: unknown,
  quien: (request: Request) => Promise<Response> = comoAutor,
): Promise<Response> {
  return quien(conCuerpo(`/api/procesos/${procesoId}/notas`, "POST", cuerpo));
}

/** Relee la línea de tiempo por la API: la única lectura que prueba algo. */
async function lineaDe(procesoId: string): Promise<LineaEnElCable> {
  const respuesta = await comoAutor(
    peticion(`/api/procesos/${procesoId}/notas`),
  );
  expect(respuesta.status).toBe(200);
  return (await respuesta.json()) as LineaEnElCable;
}

async function etapasDe(
  procesoId: string,
): Promise<{ id: string; nombre: string; alcanzadaEn: string | null }[]> {
  const respuesta = await comoAutor(peticion(`/api/procesos/${procesoId}`));
  expect(respuesta.status).toBe(200);
  return (
    (await respuesta.json()) as {
      etapas: { id: string; nombre: string; alcanzadaEn: string | null }[];
    }
  ).etapas;
}

function avanzar(procesoId: string): Promise<Response> {
  return comoAutor(
    peticion(`/api/procesos/${procesoId}/avanzar`, { method: "POST" }),
  );
}

function guardarPlan(
  procesoId: string,
  etapas: { id: string | null; nombre: string }[],
): Promise<Response> {
  return comoAutor(
    conCuerpo(`/api/procesos/${procesoId}/etapas`, "PUT", { etapas }),
  );
}

/**
 * Cuántas notas tiene un proceso, mirando por debajo de la API.
 *
 * Se cuenta **por proceso** y no sobre la tabla entera, que es la
 * consecuencia directa de que esta suite no pueda limpiar: ver el comentario
 * del `beforeEach`.
 */
async function cuantasNotas(procesoId: string): Promise<number> {
  const fila = await env.DB.prepare(
    "SELECT count(*) AS cuantas FROM nota WHERE proceso_id = ?",
  )
    .bind(procesoId)
    .first<{ cuantas: number }>();
  return fila?.cuantas ?? 0;
}

/**
 * **Esta suite no borra nada, y eso es un hallazgo, no una comodidad.**
 *
 * Las demás suites arrancan cada prueba con un `DELETE FROM` de sus tablas.
 * Acá no se puede, y el motivo es exactamente la regla que T-8 implementa:
 * el disparador `nota_no_se_borra` de T-2 no tiene condición, así que una
 * nota no se borra **nunca**, tampoco desde la limpieza de una prueba. Y
 * como las llaves foráneas quedaron en `NO ACTION`, con una nota viva
 * tampoco se borran su etapa, su proceso, su cliente, su autor ni su
 * tenant: es la «consecuencia buscada» que el comentario de la migración
 * anuncia, comprobada acá sin querer.
 *
 * El aislamiento se consigue al revés: **identificadores nuevos en cada
 * prueba**, incluido el del tenant vecino, y toda afirmación de conteo
 * acotada a su proceso. Lo que queda en la base de una prueba anterior es
 * inalcanzable para la siguiente, que es la misma garantía por otro camino.
 */
/**
 * Las dos personas del bufete se crean **una sola vez**: `usuario` lleva
 * `UNIQUE (tenant_id, email)` desde T-2, y sin poder borrar tampoco se
 * pueden volver a insertar con el mismo correo. No son lo que se prueba
 * acá; son quien escribe.
 */
beforeAll(async () => {
  autorId = nuevoId();
  socioId = nuevoId();

  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO usuario (id, tenant_id, nombre, email, activo)" +
        " VALUES (?, ?, ?, ?, 1)",
    ).bind(autorId, TENANT_UNICO_ID, "Itzel", EMAIL_AUTOR),
    env.DB.prepare(
      "INSERT INTO usuario (id, tenant_id, nombre, email, activo)" +
        " VALUES (?, ?, ?, ?, 1)",
    ).bind(socioId, TENANT_UNICO_ID, "Ricardo", EMAIL_SOCIO),
  ]);
});

beforeEach(async () => {
  OTRO_TENANT_ID = nuevoId();
  usuarioAjenoId = nuevoId();
  clienteId = nuevoId();
  clienteAjenoId = nuevoId();
  areaId = nuevoId();
  tipoResidenciaId = nuevoId();
  tipoSinPlantillaId = nuevoId();
  tipoAjenoId = nuevoId();
  areaAjenaId = nuevoId();
  procesoAjenoId = nuevoId();
  etapaAjenaId = nuevoId();

  await env.DB.batch([
    env.DB.prepare("INSERT INTO tenant (id, nombre) VALUES (?, ?)").bind(
      OTRO_TENANT_ID,
      "Otro bufete",
    ),
    env.DB.prepare(
      "INSERT INTO usuario (id, tenant_id, nombre, email, activo)" +
        " VALUES (?, ?, ?, ?, 1)",
    ).bind(usuarioAjenoId, OTRO_TENANT_ID, "Ajena", "ajena@otro-bufete.test"),

    env.DB.prepare(
      "INSERT INTO cliente (id, tenant_id, nombre, telefono, creado_por," +
        " creado_en) VALUES (?, ?, ?, ?, ?, ?)",
    ).bind(
      clienteId,
      TENANT_UNICO_ID,
      "Marta Quintero",
      "+507 6000-0000",
      autorId,
      new Date().toISOString(),
    ),

    env.DB.prepare(
      "INSERT INTO area (id, tenant_id, nombre, activo) VALUES (?, ?, ?, 1)",
    // Los nombres de catálogo llevan pegado su identificador: desde
    // `0003_tenencia_y_unicidad.sql` son únicos por tenant y este archivo no
    // limpia entre pruebas, así que un nombre fijo chocaría con el que
    // sembró la prueba anterior. Es andamio, no la regla bajo prueba.
    ).bind(areaId, TENANT_UNICO_ID, `Migración y naturalización ${areaId}`),
    env.DB.prepare(
      "INSERT INTO tipo_proceso (id, tenant_id, area_id, nombre, activo)" +
        " VALUES (?, ?, ?, ?, 1)",
    ).bind(
      tipoResidenciaId,
      TENANT_UNICO_ID,
      areaId,
      `Residencia permanente por matrimonio con nacional ${tipoResidenciaId}`,
    ),
    env.DB.prepare(
      "INSERT INTO tipo_proceso (id, tenant_id, area_id, nombre, activo)" +
        " VALUES (?, ?, ?, ?, 1)",
    ).bind(
      tipoSinPlantillaId,
      TENANT_UNICO_ID,
      areaId,
      `Consulta puntual sin trámite ${tipoSinPlantillaId}`,
    ),

    // Lo del vecino: el objeto de todas las pruebas de fuga.
    env.DB.prepare(
      "INSERT INTO cliente (id, tenant_id, nombre, telefono, creado_por," +
        " creado_en) VALUES (?, ?, ?, ?, ?, ?)",
    ).bind(
      clienteAjenoId,
      OTRO_TENANT_ID,
      "Cliente del vecino",
      "+507 6999-9999",
      usuarioAjenoId,
      new Date().toISOString(),
    ),
    env.DB.prepare(
      "INSERT INTO area (id, tenant_id, nombre, activo) VALUES (?, ?, ?, 1)",
    ).bind(areaAjenaId, OTRO_TENANT_ID, "Área del vecino"),
    env.DB.prepare(
      "INSERT INTO tipo_proceso (id, tenant_id, area_id, nombre, activo)" +
        " VALUES (?, ?, ?, ?, 1)",
    ).bind(tipoAjenoId, OTRO_TENANT_ID, areaAjenaId, "Tipo del vecino"),
    env.DB.prepare(
      "INSERT INTO proceso (id, tenant_id, cliente_id, tipo_proceso_id," +
        " origen, titulo, estado, abierto_en)" +
        " VALUES (?, ?, ?, ?, 'directo', ?, 'abierto', ?)",
    ).bind(
      procesoAjenoId,
      OTRO_TENANT_ID,
      clienteAjenoId,
      tipoAjenoId,
      "Proceso del vecino",
      new Date().toISOString(),
    ),
    env.DB.prepare(
      "INSERT INTO proceso_etapa (id, tenant_id, proceso_id, nombre, orden)" +
        " VALUES (?, ?, ?, ?, 0)",
    ).bind(etapaAjenaId, OTRO_TENANT_ID, procesoAjenoId, "Etapa del vecino"),
  ]);

  const plantilla = await comoAutor(
    conCuerpo(`/api/tipos-proceso/${tipoResidenciaId}/etapas`, "PUT", {
      etapas: PLAN_DE_RESIDENCIA.map((nombre) => ({ nombre })),
    }),
  );
  expect(plantilla.status).toBe(200);
});

// ---------------------------------------------------------------------------
// A qué etapa se ancla una nota
// ---------------------------------------------------------------------------

describe("una nota se ancla a la etapa vigente cuando nadie elige otra", () => {
  it("un proceso recién abierto ancla en su PRIMERA etapa, que está pendiente", async () => {
    // El caso que la columna `NOT NULL` obliga a resolver: no hay ninguna
    // etapa alcanzada todavía, y la nota igual tiene que colgar de algo.
    const procesoId = await crearProceso(tipoResidenciaId);
    const etapas = await etapasDe(procesoId);
    expect(etapas.every((etapa) => etapa.alcanzadaEn === null)).toBe(true);

    const respuesta = await anotar(procesoId, { texto: PAGO_DIFERIDO });
    expect(respuesta.status).toBe(201);

    const { tramos } = await lineaDe(procesoId);
    expect(tramos).toHaveLength(1);
    expect(tramos[0].etapa.id).toBe(etapas[0].id);
    expect(tramos[0].etapa.nombre).toBe(PLAN_DE_RESIDENCIA[0]);
  });

  it("un proceso que ya avanzó ancla en la PRÓXIMA PENDIENTE, no en la última cumplida", async () => {
    const procesoId = await crearProceso(tipoResidenciaId);
    expect((await avanzar(procesoId)).status).toBe(200);
    expect((await avanzar(procesoId)).status).toBe(200);

    const etapas = await etapasDe(procesoId);
    expect(etapas[0].alcanzadaEn).not.toBeNull();
    expect(etapas[1].alcanzadaEn).not.toBeNull();
    expect(etapas[2].alcanzadaEn).toBeNull();

    await anotar(procesoId, { texto: PAGO_DIFERIDO });

    const { tramos } = await lineaDe(procesoId);
    expect(tramos.map((tramo) => tramo.etapa.nombre)).toEqual([
      PLAN_DE_RESIDENCIA[2],
    ]);
  });

  it("un proceso con todo cumplido ancla en la ÚLTIMA alcanzada", async () => {
    // Sin pendientes no hay «vigente», y la nota sigue teniendo que colgar de
    // algo. La última cumplida es donde el trabajo está parado.
    const procesoId = await crearProceso(tipoResidenciaId);
    for (const etapa of PLAN_DE_RESIDENCIA) {
      expect((await avanzar(procesoId)).status, `avanzar a «${etapa}»`).toBe(
        200,
      );
    }

    await anotar(procesoId, { texto: "Entregado el carné en mano." });

    const { tramos } = await lineaDe(procesoId);
    expect(tramos.map((tramo) => tramo.etapa.nombre)).toEqual([
      PLAN_DE_RESIDENCIA[3],
    ]);
  });

  it("quien escribe puede elegir otra etapa del MISMO proceso", async () => {
    // Una nota es el registro de un hecho, y el hecho pudo pasar antes de
    // que alguien se sentara a escribirlo. Como la nota es inmutable, el
    // momento de escribirla es la única oportunidad de anclarla bien.
    const procesoId = await crearProceso(tipoResidenciaId);
    expect((await avanzar(procesoId)).status).toBe(200);
    expect((await avanzar(procesoId)).status).toBe(200);
    const etapas = await etapasDe(procesoId);

    const respuesta = await anotar(procesoId, {
      texto: "Esto salió en la primera reunión; lo anoto recién hoy.",
      procesoEtapaId: etapas[0].id,
    });
    expect(respuesta.status).toBe(201);

    const { tramos } = await lineaDe(procesoId);
    expect(tramos.map((tramo) => tramo.etapa.id)).toEqual([etapas[0].id]);
  });
});

// ---------------------------------------------------------------------------
// Contrapesos: lo que queda guardado, releído
// ---------------------------------------------------------------------------

describe("la nota queda con su texto, su autor, su etapa y su momento", () => {
  it("se relee entera, con el autor resuelto por NOMBRE en lectura", async () => {
    const procesoId = await crearProceso(tipoResidenciaId);
    const antes = Date.now();
    await anotar(procesoId, { texto: PAGO_DIFERIDO });
    const despues = Date.now();

    const { tramos } = await lineaDe(procesoId);
    const [nota] = tramos[0].notas;

    expect(nota.texto).toBe(PAGO_DIFERIDO);
    expect(nota.autorId).toBe(autorId);
    // Lo que se guarda es la llave; el nombre se resuelve al leer
    // (`docs/diseno.md` §6, «Autoría»).
    expect(nota.autorNombre).toBe("Itzel");
    expect(nota.procesoEtapaId).toBe(tramos[0].etapa.id);

    const momento = new Date(nota.creadaEn).getTime();
    expect(Number.isNaN(momento)).toBe(false);
    expect(momento).toBeGreaterThanOrEqual(antes - 1000);
    expect(momento).toBeLessThanOrEqual(despues + 1000);
    expect(new Date(momento).toISOString()).toBe(nota.creadaEn);
  });

  it("el autor es quien entró, no lo que diga el cuerpo", async () => {
    const procesoId = await crearProceso(tipoResidenciaId);
    await anotar(
      procesoId,
      { texto: "La escribe Ricardo.", autorId, autorNombre: "Itzel" },
      comoSocio,
    );

    const { tramos } = await lineaDe(procesoId);
    expect(tramos[0].notas[0].autorId).toBe(socioId);
    expect(tramos[0].notas[0].autorNombre).toBe("Ricardo");
  });

  it("conserva los saltos de línea del texto tal como se escribieron", async () => {
    const procesoId = await crearProceso(tipoResidenciaId);
    const texto = "Pide pago diferido:\n- 3 cuotas\n- la primera a la firma";
    await anotar(procesoId, { texto });

    const { tramos } = await lineaDe(procesoId);
    expect(tramos[0].notas[0].texto).toBe(texto);
  });

  it("recorta los espacios de los bordes pero no el contenido", async () => {
    const procesoId = await crearProceso(tipoResidenciaId);
    await anotar(procesoId, { texto: `   ${PAGO_DIFERIDO}\n\n  ` });

    const { tramos } = await lineaDe(procesoId);
    expect(tramos[0].notas[0].texto).toBe(PAGO_DIFERIDO);
  });
});

// ---------------------------------------------------------------------------
// La línea de tiempo
// ---------------------------------------------------------------------------

describe("la línea de tiempo agrupa por etapa en el orden del plan", () => {
  it("devuelve los tramos en orden de plan, no en orden de inserción", async () => {
    const procesoId = await crearProceso(tipoResidenciaId);
    const etapas = await etapasDe(procesoId);

    // Se escriben al revés a propósito: primero la última etapa del plan.
    await anotar(procesoId, {
      texto: "Carné entregado.",
      procesoEtapaId: etapas[3].id,
    });
    await anotar(procesoId, {
      texto: PAGO_DIFERIDO,
      procesoEtapaId: etapas[0].id,
    });
    await anotar(procesoId, {
      texto: "Falta el certificado de matrimonio apostillado.",
      procesoEtapaId: etapas[2].id,
    });

    const { tramos } = await lineaDe(procesoId);
    expect(tramos.map((tramo) => tramo.etapa.orden)).toEqual([0, 2, 3]);
    expect(tramos.map((tramo) => tramo.etapa.nombre)).toEqual([
      PLAN_DE_RESIDENCIA[0],
      PLAN_DE_RESIDENCIA[2],
      PLAN_DE_RESIDENCIA[3],
    ]);
  });

  it("solo trae las etapas que tienen notas: no es una segunda copia del plan", async () => {
    const procesoId = await crearProceso(tipoResidenciaId);
    await anotar(procesoId, { texto: PAGO_DIFERIDO });

    const { tramos } = await lineaDe(procesoId);
    expect(tramos).toHaveLength(1);
  });

  it("dentro de una etapa, las notas van en el orden en que se escribieron", async () => {
    const procesoId = await crearProceso(tipoResidenciaId);
    await anotar(procesoId, { texto: "Primera." });
    await anotar(procesoId, { texto: "Segunda." });
    await anotar(procesoId, { texto: "Tercera." });

    const { tramos } = await lineaDe(procesoId);
    expect(tramos[0].notas.map((nota) => nota.texto)).toEqual([
      "Primera.",
      "Segunda.",
      "Tercera.",
    ]);
  });

  it("un proceso sin notas devuelve una línea vacía, no un 404", async () => {
    const procesoId = await crearProceso(tipoResidenciaId);
    const { tramos } = await lineaDe(procesoId);
    expect(tramos).toEqual([]);
  });

  it("no mezcla las notas de otro proceso del mismo cliente", async () => {
    const uno = await crearProceso(tipoResidenciaId);
    const otro = await crearProceso(tipoResidenciaId);

    await anotar(uno, { texto: "Esto es del primero." });
    await anotar(otro, { texto: "Esto es del segundo." });

    expect((await lineaDe(uno)).tramos[0].notas.map((n) => n.texto)).toEqual([
      "Esto es del primero.",
    ]);
    expect((await lineaDe(otro)).tramos[0].notas.map((n) => n.texto)).toEqual([
      "Esto es del segundo.",
    ]);
  });

  it("la respuesta del alta ya trae la línea completa", async () => {
    // La pantalla asienta lo que el servidor dejó guardado en vez de
    // recalcularlo, igual que el `PUT` del plan en T-7.
    const procesoId = await crearProceso(tipoResidenciaId);
    const respuesta = await anotar(procesoId, { texto: PAGO_DIFERIDO });
    expect(respuesta.status).toBe(201);

    const cuerpo = (await respuesta.json()) as LineaEnElCable;
    expect(cuerpo.tramos[0].notas[0].texto).toBe(PAGO_DIFERIDO);
    expect(cuerpo).toEqual(await lineaDe(procesoId));
  });
});

// ---------------------------------------------------------------------------
// Rechazos
// ---------------------------------------------------------------------------

describe("el alta de una nota rechaza lo que no se puede guardar", () => {
  it("rechaza una nota con el texto vacío", async () => {
    const procesoId = await crearProceso(tipoResidenciaId);
    const respuesta = await anotar(procesoId, { texto: "" });

    expect(respuesta.status).toBe(422);
    expect(await motivosDe(respuesta)).toContain("texto_requerido");
    expect(await cuantasNotas(procesoId)).toBe(0);
  });

  it("rechaza una nota con el texto en blanco", async () => {
    const procesoId = await crearProceso(tipoResidenciaId);
    const respuesta = await anotar(procesoId, { texto: "   \n\t  " });

    expect(respuesta.status).toBe(422);
    expect(await motivosDe(respuesta)).toContain("texto_requerido");
    expect(await cuantasNotas(procesoId)).toBe(0);
  });

  it("rechaza una nota sin campo de texto", async () => {
    const procesoId = await crearProceso(tipoResidenciaId);
    const respuesta = await anotar(procesoId, {});

    expect(respuesta.status).toBe(422);
    expect(await motivosDe(respuesta)).toContain("texto_requerido");
  });

  it("rechaza un texto que no es texto", async () => {
    const procesoId = await crearProceso(tipoResidenciaId);
    const respuesta = await anotar(procesoId, { texto: 42 });

    expect(respuesta.status).toBe(422);
    expect(await motivosDe(respuesta)).toContain("tipo_invalido");
    expect(await cuantasNotas(procesoId)).toBe(0);
  });

  it("rechaza un cuerpo que no es un objeto", async () => {
    const procesoId = await crearProceso(tipoResidenciaId);
    const respuesta = await anotar(procesoId, ["una nota"]);

    expect(respuesta.status).toBe(422);
    expect(await cuantasNotas(procesoId)).toBe(0);
  });

  it("rechaza un cuerpo que ni siquiera es JSON", async () => {
    const procesoId = await crearProceso(tipoResidenciaId);
    const respuesta = await comoAutor(
      peticion(`/api/procesos/${procesoId}/notas`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{ esto no es json",
      }),
    );

    expect(respuesta.status).toBe(400);
    expect(await cuantasNotas(procesoId)).toBe(0);
  });

  it("rechaza anotar en un proceso de OTRO TENANT, y no escribe nada", async () => {
    const respuesta = await anotar(procesoAjenoId, { texto: PAGO_DIFERIDO });

    expect(respuesta.status).toBe(404);
    expect(await cuantasNotas(procesoAjenoId)).toBe(0);
  });

  it("rechaza leer la línea de tiempo de un proceso de OTRO TENANT", async () => {
    const respuesta = await comoAutor(
      peticion(`/api/procesos/${procesoAjenoId}/notas`),
    );
    expect(respuesta.status).toBe(404);
  });

  it("rechaza anotar en un proceso inexistente", async () => {
    const respuesta = await anotar(nuevoId(), { texto: PAGO_DIFERIDO });
    expect(respuesta.status).toBe(404);
  });

  it("rechaza una etapa que pertenece a OTRO PROCESO", async () => {
    const uno = await crearProceso(tipoResidenciaId);
    const otro = await crearProceso(tipoResidenciaId);
    const ajenas = await etapasDe(otro);

    const respuesta = await anotar(uno, {
      texto: PAGO_DIFERIDO,
      procesoEtapaId: ajenas[0].id,
    });

    expect(respuesta.status).toBe(422);
    expect(await motivosDe(respuesta)).toEqual(["etapa_de_otro_proceso"]);
    expect(await cuantasNotas(uno)).toBe(0);
  });

  it("rechaza una etapa de un proceso de OTRO TENANT", async () => {
    const procesoId = await crearProceso(tipoResidenciaId);

    const respuesta = await anotar(procesoId, {
      texto: PAGO_DIFERIDO,
      procesoEtapaId: etapaAjenaId,
    });

    expect(respuesta.status).toBe(422);
    expect(await motivosDe(respuesta)).toEqual(["etapa_de_otro_proceso"]);
    expect(await cuantasNotas(procesoId)).toBe(0);
  });

  it("rechaza una etapa inexistente", async () => {
    const procesoId = await crearProceso(tipoResidenciaId);

    const respuesta = await anotar(procesoId, {
      texto: PAGO_DIFERIDO,
      procesoEtapaId: nuevoId(),
    });

    expect(respuesta.status).toBe(422);
    expect(await motivosDe(respuesta)).toEqual(["etapa_de_otro_proceso"]);
  });

  it("rechaza anotar en un proceso SIN PLAN: no hay etapa de dónde colgar", async () => {
    // `nota.proceso_etapa_id` es `NOT NULL` y el servidor no inventa etapas.
    // Decirlo con su motivo es mejor que reventar contra la restricción.
    const procesoId = await crearProceso(tipoSinPlantillaId);
    expect(await etapasDe(procesoId)).toEqual([]);

    const respuesta = await anotar(procesoId, { texto: PAGO_DIFERIDO });

    expect(respuesta.status).toBe(422);
    expect(await motivosDe(respuesta)).toEqual(["proceso_sin_etapas"]);
    expect(await cuantasNotas(procesoId)).toBe(0);
  });

  it("deja anotar en cuanto el proceso sin plan recibe su primer paso", async () => {
    // El contrapeso del rechazo de arriba: no es una pared sin puerta.
    const procesoId = await crearProceso(tipoSinPlantillaId);
    expect(
      (
        await guardarPlan(procesoId, [
          { id: null, nombre: "Consulta y respuesta" },
        ])
      ).status,
    ).toBe(200);

    expect((await anotar(procesoId, { texto: PAGO_DIFERIDO })).status).toBe(
      201,
    );
    expect((await lineaDe(procesoId)).tramos).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Una nota no se edita ni se borra
// ---------------------------------------------------------------------------

describe("no existe forma de editar ni de borrar una nota por la API", () => {
  it("rechaza PUT sobre las notas de un proceso", async () => {
    const procesoId = await crearProceso(tipoResidenciaId);
    const respuesta = await comoAutor(
      conCuerpo(`/api/procesos/${procesoId}/notas`, "PUT", {
        texto: "Reescrita",
      }),
    );

    expect(respuesta.status).toBe(405);
    expect(respuesta.headers.get("allow")).toBe("GET, POST");
  });

  it("rechaza PATCH sobre las notas de un proceso", async () => {
    const procesoId = await crearProceso(tipoResidenciaId);
    const respuesta = await comoAutor(
      conCuerpo(`/api/procesos/${procesoId}/notas`, "PATCH", {
        texto: "Reescrita",
      }),
    );

    expect(respuesta.status).toBe(405);
    expect(respuesta.headers.get("allow")).toBe("GET, POST");
  });

  it("rechaza DELETE sobre las notas de un proceso", async () => {
    const procesoId = await crearProceso(tipoResidenciaId);
    const respuesta = await comoAutor(
      peticion(`/api/procesos/${procesoId}/notas`, { method: "DELETE" }),
    );

    expect(respuesta.status).toBe(405);
    expect(respuesta.headers.get("allow")).toBe("GET, POST");
  });

  it("una nota no tiene dirección propia: no hay nada que editar ni borrar", async () => {
    const procesoId = await crearProceso(tipoResidenciaId);
    await anotar(procesoId, { texto: PAGO_DIFERIDO });
    const { tramos } = await lineaDe(procesoId);
    const notaId = tramos[0].notas[0].id;

    for (const metodo of ["GET", "PUT", "DELETE"]) {
      const respuesta = await comoAutor(
        peticion(`/api/procesos/${procesoId}/notas/${notaId}`, {
          method: metodo,
        }),
      );
      expect(respuesta.status, `${metodo} sobre una nota suelta`).toBe(404);
    }

    expect(await cuantasNotas(procesoId)).toBe(1);
  });

  it("los dos disparadores de T-2 siguen vivos contra la base", async () => {
    // La API no ofrece el camino; esto comprueba que tampoco lo ofrece la
    // consola de D1, que es de donde vendría el reescrito de verdad.
    const procesoId = await crearProceso(tipoResidenciaId);
    await anotar(procesoId, { texto: PAGO_DIFERIDO });
    const { tramos } = await lineaDe(procesoId);
    const notaId = tramos[0].notas[0].id;

    await expect(
      env.DB.prepare("UPDATE nota SET texto = ? WHERE id = ?")
        .bind("Texto reescrito", notaId)
        .run(),
    ).rejects.toThrow(/nota inmutable/);

    await expect(
      env.DB.prepare("DELETE FROM nota WHERE id = ?").bind(notaId).run(),
    ).rejects.toThrow(/nota inmutable/);

    // Y después de los dos intentos la nota sigue igual.
    const despues = await lineaDe(procesoId);
    expect(despues.tramos[0].notas[0].texto).toBe(PAGO_DIFERIDO);
  });
});

// ---------------------------------------------------------------------------
// El encargo que T-7 dejó escrito: quitar una etapa pendiente con notas
// ---------------------------------------------------------------------------

describe("una etapa pendiente CON NOTAS no se quita del plan", () => {
  async function conUnaNotaEnLaTercera(): Promise<{
    procesoId: string;
    etapas: { id: string; nombre: string; alcanzadaEn: string | null }[];
  }> {
    const procesoId = await crearProceso(tipoResidenciaId);
    const etapas = await etapasDe(procesoId);
    const respuesta = await anotar(procesoId, {
      texto: "Falta el certificado de matrimonio apostillado.",
      procesoEtapaId: etapas[2].id,
    });
    expect(respuesta.status).toBe(201);
    return { procesoId, etapas };
  }

  it("CRITERIO: quitarla se RECHAZA, y el rechazo dice cuántas notas lo impiden", async () => {
    const { procesoId, etapas } = await conUnaNotaEnLaTercera();

    const respuesta = await guardarPlan(
      procesoId,
      etapas
        .filter((etapa) => etapa.id !== etapas[2].id)
        .map((etapa) => ({ id: etapa.id, nombre: etapa.nombre })),
    );

    expect(respuesta.status).toBe(422);
    const fallas = await fallasDe(respuesta);
    expect(fallas).toEqual([
      {
        campo: "etapa-2",
        motivo: "etapa_con_notas_no_se_quita",
        cuantos: 1,
      },
    ]);
  });

  it("la etapa sigue en el plan y la nota sigue colgando de ella", async () => {
    const { procesoId, etapas } = await conUnaNotaEnLaTercera();

    await guardarPlan(
      procesoId,
      etapas
        .filter((etapa) => etapa.id !== etapas[2].id)
        .map((etapa) => ({ id: etapa.id, nombre: etapa.nombre })),
    );

    expect((await etapasDe(procesoId)).map((etapa) => etapa.id)).toEqual(
      etapas.map((etapa) => etapa.id),
    );
    const { tramos } = await lineaDe(procesoId);
    expect(tramos[0].etapa.id).toBe(etapas[2].id);
    expect(tramos[0].notas).toHaveLength(1);
  });

  it("cuenta TODAS las notas de esa etapa, no solo la primera", async () => {
    const { procesoId, etapas } = await conUnaNotaEnLaTercera();
    await anotar(procesoId, {
      texto: "El cliente consiguió la apostilla.",
      procesoEtapaId: etapas[2].id,
    });
    await anotar(procesoId, {
      texto: "Quedó pendiente la traducción oficial.",
      procesoEtapaId: etapas[2].id,
    });

    const respuesta = await guardarPlan(
      procesoId,
      etapas
        .filter((etapa) => etapa.id !== etapas[2].id)
        .map((etapa) => ({ id: etapa.id, nombre: etapa.nombre })),
    );

    expect(respuesta.status).toBe(422);
    expect((await fallasDe(respuesta))[0].cuantos).toBe(3);
  });

  it("nombra solo la etapa con notas cuando se quitan varias de golpe", async () => {
    const { procesoId, etapas } = await conUnaNotaEnLaTercera();

    // Se quitan la tercera (con nota) y la cuarta (limpia).
    const respuesta = await guardarPlan(
      procesoId,
      etapas
        .slice(0, 2)
        .map((etapa) => ({ id: etapa.id, nombre: etapa.nombre })),
    );

    expect(respuesta.status).toBe(422);
    const fallas = await fallasDe(respuesta);
    expect(fallas.map((falla) => falla.campo)).toEqual(["etapa-2"]);
  });

  it("el rechazo es la guarda y NO el error de la llave foránea", async () => {
    // Si esto saliera de un `catch` del error de la base, el cuerpo traería
    // otra cosa y el 500 estaría a un refactor de distancia. La guarda cuenta
    // antes de escribir, así que la respuesta es un 422 con su motivo.
    const { procesoId, etapas } = await conUnaNotaEnLaTercera();

    const respuesta = await guardarPlan(
      procesoId,
      etapas
        .filter((etapa) => etapa.id !== etapas[2].id)
        .map((etapa) => ({ id: etapa.id, nombre: etapa.nombre })),
    );

    expect(respuesta.status).toBe(422);
    const texto = await respuesta.text();
    expect(texto).not.toMatch(/FOREIGN KEY/i);
    expect(texto).not.toMatch(/SQLITE/i);
  });

  it("sí deja quitar una etapa pendiente SIN notas", async () => {
    // El contrapeso: la guarda no es una pared que bloquea todo borrado.
    const { procesoId, etapas } = await conUnaNotaEnLaTercera();

    const respuesta = await guardarPlan(
      procesoId,
      etapas
        .filter((etapa) => etapa.id !== etapas[3].id)
        .map((etapa) => ({ id: etapa.id, nombre: etapa.nombre })),
    );

    expect(respuesta.status).toBe(200);
    expect((await etapasDe(procesoId)).map((etapa) => etapa.nombre)).toEqual([
      PLAN_DE_RESIDENCIA[0],
      PLAN_DE_RESIDENCIA[1],
      PLAN_DE_RESIDENCIA[2],
    ]);
  });

  it("sí deja renombrar y reordenar la etapa con notas", async () => {
    // Lo que la guarda protege es que la etapa exista, no su redacción ni su
    // lugar entre las pendientes.
    const { procesoId, etapas } = await conUnaNotaEnLaTercera();

    const respuesta = await guardarPlan(procesoId, [
      { id: etapas[0].id, nombre: etapas[0].nombre },
      { id: etapas[1].id, nombre: etapas[1].nombre },
      { id: etapas[3].id, nombre: etapas[3].nombre },
      { id: etapas[2].id, nombre: "Entrevista y verificación en el domicilio" },
    ]);

    expect(respuesta.status).toBe(200);
    const ahora = await etapasDe(procesoId);
    expect(ahora[3].id).toBe(etapas[2].id);
    expect(ahora[3].nombre).toBe("Entrevista y verificación en el domicilio");
    expect((await lineaDe(procesoId)).tramos[0].notas).toHaveLength(1);
  });

  it("una etapa con notas de OTRO proceso sí se puede quitar", async () => {
    // El conteo filtra por proceso y por tenant: la nota del vecino no
    // bloquea el plan de nadie.
    const uno = await crearProceso(tipoResidenciaId);
    const otro = await crearProceso(tipoResidenciaId);
    const deOtro = await etapasDe(otro);
    await anotar(otro, {
      texto: PAGO_DIFERIDO,
      procesoEtapaId: deOtro[2].id,
    });

    const etapas = await etapasDe(uno);
    const respuesta = await guardarPlan(
      uno,
      etapas
        .filter((etapa) => etapa.id !== etapas[2].id)
        .map((etapa) => ({ id: etapa.id, nombre: etapa.nombre })),
    );

    expect(respuesta.status).toBe(200);
    expect((await etapasDe(uno)).map((etapa) => etapa.nombre)).toEqual([
      PLAN_DE_RESIDENCIA[0],
      PLAN_DE_RESIDENCIA[1],
      PLAN_DE_RESIDENCIA[3],
    ]);
  });
});

// ---------------------------------------------------------------------------
// La puerta de Access
// ---------------------------------------------------------------------------

describe("la puerta de Access", () => {
  function espias(): {
    notas: ServicioDeNotas;
    procesos: ServicioDeProcesos;
    tocado: () => boolean;
  } {
    let tocado = false;
    const marcar = (): never => {
      tocado = true;
      throw new Error("el dominio no se puede tocar sin identidad");
    };

    return {
      tocado: () => tocado,
      notas: {
        lineaDeTiempo: marcar,
        crear: marcar,
      } as unknown as ServicioDeNotas,
      procesos: {
        listar: marcar,
        obtener: marcar,
        crear: marcar,
        reemplazarEtapas: marcar,
        avanzar: marcar,
      } as unknown as ServicioDeProcesos,
    };
  }

  it("ninguna ruta de notas pasa sin identidad, y el dominio no se toca", async () => {
    const procesoId = nuevoId();
    const rutas: Request[] = [
      peticion(`/api/procesos/${procesoId}/notas`),
      conCuerpo(`/api/procesos/${procesoId}/notas`, "POST", {
        texto: PAGO_DIFERIDO,
      }),
      peticion(`/api/procesos/${procesoId}/notas`, { method: "DELETE" }),
      peticion(`/api/procesos/${procesoId}/notas/${nuevoId()}`, {
        method: "DELETE",
      }),
    ];

    for (const request of rutas) {
      const vigilado = espias();
      const respuesta = await sinIdentidad(request, {
        notas: vigilado.notas,
        procesos: vigilado.procesos,
      });

      expect(respuesta.status, `${request.method} ${request.url}`).toBe(403);
      expect(vigilado.tocado(), `${request.method} ${request.url}`).toBe(false);

      const cuerpo = (await respuesta.json()) as { error?: string };
      expect(cuerpo.error).toBe("acceso_denegado");
    }

    expect(await cuantasNotas(procesoId)).toBe(0);
  });

  it("las respuestas de notas no se guardan en caché", async () => {
    const procesoId = await crearProceso(tipoResidenciaId);
    const alta = await anotar(procesoId, { texto: PAGO_DIFERIDO });
    const lectura = await comoAutor(
      peticion(`/api/procesos/${procesoId}/notas`),
    );

    expect(alta.headers.get("cache-control")).toBe("no-store");
    expect(lectura.headers.get("cache-control")).toBe("no-store");
  });
});
