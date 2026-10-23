/**
 * La API de procesos y su plan de trabajo (`odd/tasks/crm-procesos.md`, T-7).
 *
 * Un **proceso** es todo trabajo que hace un abogado (`docs/diseno.md` §3).
 * Nunca «caso».
 *
 * Las dos reglas que esta suite existe para fijar:
 *
 *  1. **La plantilla siembra, el proceso manda.** Al crear el proceso las
 *     etapas de `etapa_plantilla` se **copian** a `proceso_etapa`; no se
 *     referencian. Desde ese momento editar la plantilla no toca el proceso.
 *     Eso no se prueba leyendo el `POST`: se prueba **cambiando la plantilla
 *     después** y releyendo el proceso.
 *  2. **Se quita una etapa pendiente; no se quita una alcanzada.** Las notas
 *     se anclan a la etapa donde ocurrieron y son inmutables por disparador
 *     (I-6): borrar una etapa cumplida dejaría notas huérfanas o reescribiría
 *     la historia.
 *
 * Y la disciplina que T-6 dejó asentada, que acá vale doble: **la guarda es
 * el chequeo explícito, no un `catch` del error de la base**. No se atrapa ni
 * el disparador de `nota` ni la llave foránea para disfrazarlos de respuesta
 * amable. Con ese `catch`, aflojar la guarda no rompería ninguna prueba y la
 * guarda quedaría sin verificar para siempre.
 *
 * Tres clases de prueba, igual que en `catalogos-api.spec.ts`:
 *
 *  - **Rechazos**, cada uno con la petición inválida concreta y la afirmación
 *    de que no entró.
 *  - **Contrapesos que releen.** Nada se da por guardado mirando el eco del
 *    `POST`.
 *  - **Orden.** `proceso_etapa.orden` no tiene índice único (T-2), así que el
 *    orden correcto es responsabilidad de este código y de nadie más.
 */
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { TENANT_UNICO_ID, nuevoId } from "../worker/db/ids";
import { manejar } from "../worker/index";
import type { ServicioDeProcesos } from "../worker/procesos/repositorio";

const DOMINIO_DE_ACCESS = "https://bufete-de-prueba.cloudflareaccess.com";
const AUD = "aud-de-la-aplicacion-del-bufete";

const EMAIL_AUTOR = "itzel@bufete.test";

/** El tenant vecino. Existe solo para que la fuga sea expresable. */
const OTRO_TENANT_ID = "0a5a6e0a-9f1e-4a6e-9f03-3b6a2a0e1d77";

/**
 * Los nombres de etapa son **texto de cara al cliente** (`docs/diseno.md` §6,
 * «Una consecuencia futura que obliga hoy»). Los de esta suite se escriben
 * como se van a escribir de verdad, no como `etapa1`: si los ejemplos del
 * proyecto son jerga, la jerga es lo que se va a cargar.
 */
const PLAN_DE_RESIDENCIA = [
  "Recepción y revisión de documentos",
  "Presentación ante el Servicio Nacional de Migración",
  "Entrevista y verificación domiciliaria",
  "Resolución y entrega del carné",
] as const;

/**
 * Las formas en el cable se declaran acá y no se importan del contrato del
 * Worker, por la misma razón que en `catalogos-api.spec.ts`: lo que esta
 * suite vigila es el JSON que ve el navegador. Importando el tipo, renombrar
 * un campo en el servidor renombraría también la expectativa.
 */
interface ProcesoEnElCable {
  id: string;
  clienteId: string;
  clienteNombre: string | null;
  tipoProcesoId: string;
  tipoProcesoNombre: string | null;
  areaNombre: string | null;
  origen: string;
  titulo: string;
  estado: string;
  responsableId: string | null;
  responsableNombre: string | null;
  abiertoEn: string;
  cerradoEn: string | null;
  etapasCumplidas: number;
  etapasTotales: number;
  etapaVigente: string | null;
}

interface EtapaEnElCable {
  id: string;
  nombre: string;
  orden: number;
  alcanzadaEn: string | null;
}

interface DetalleEnElCable {
  proceso: ProcesoEnElCable;
  etapas: EtapaEnElCable[];
}

interface FallaEnElCable {
  campo: string;
  motivo: string;
}

let autorId: string;
let otroUsuarioId: string;
let usuarioAjenoId: string;
let clienteId: string;
let otroClienteId: string;
let clienteAjenoId: string;
let areaId: string;
let tipoResidenciaId: string;
let tipoSinPlantillaId: string;
let tipoAjenoId: string;
let procesoAjenoId: string;
let areaAjenaId: string;

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

function sinIdentidad(
  request: Request,
  procesos: ServicioDeProcesos,
): Promise<Response> {
  return manejar(request, entorno(), {
    correoDeDesarrollo: () => null,
    procesos,
  });
}

async function fallasDe(respuesta: Response): Promise<string[]> {
  const cuerpo = (await respuesta.json()) as {
    error?: string;
    fallas?: FallaEnElCable[];
  };
  expect(cuerpo.error).toBe("datos_invalidos");
  return (cuerpo.fallas ?? []).map((falla) => falla.motivo);
}

// --- Altas de conveniencia, cada una verificada en su propio contrapeso ----

async function crearProceso(
  cuerpo: Record<string, unknown>,
): Promise<ProcesoEnElCable> {
  const respuesta = await comoAutor(
    conCuerpo("/api/procesos", "POST", cuerpo),
  );
  expect(respuesta.status).toBe(201);
  return ((await respuesta.json()) as { proceso: ProcesoEnElCable }).proceso;
}

async function procesoDeResidencia(
  titulo = "Residencia permanente de Marta Quintero",
): Promise<ProcesoEnElCable> {
  return crearProceso({
    clienteId,
    tipoProcesoId: tipoResidenciaId,
    titulo,
  });
}

/** Relee el proceso por la API: la única lectura que prueba lo guardado. */
async function releer(procesoId: string): Promise<DetalleEnElCable> {
  const respuesta = await comoAutor(peticion(`/api/procesos/${procesoId}`));
  expect(respuesta.status).toBe(200);
  return (await respuesta.json()) as DetalleEnElCable;
}

async function nombresDelPlan(procesoId: string): Promise<string[]> {
  return (await releer(procesoId)).etapas.map((etapa) => etapa.nombre);
}

function guardarPlan(
  procesoId: string,
  etapas: { id?: string | null; nombre: string }[],
): Promise<Response> {
  return comoAutor(
    conCuerpo(`/api/procesos/${procesoId}/etapas`, "PUT", { etapas }),
  );
}

function avanzar(procesoId: string): Promise<Response> {
  return comoAutor(peticion(`/api/procesos/${procesoId}/avanzar`, { method: "POST" }));
}

/** El plan tal como la pantalla lo va a reenviar: los ids que ya tiene. */
function comoEnvio(
  etapas: EtapaEnElCable[],
): { id: string | null; nombre: string }[] {
  return etapas.map((etapa) => ({ id: etapa.id, nombre: etapa.nombre }));
}

async function plantillaDe(tipoId: string): Promise<string[]> {
  const respuesta = await comoAutor(
    peticion(`/api/tipos-proceso/${tipoId}/etapas`),
  );
  expect(respuesta.status).toBe(200);
  return (
    (await respuesta.json()) as { etapas: { nombre: string }[] }
  ).etapas.map((etapa) => etapa.nombre);
}

beforeEach(async () => {
  // El almacenamiento está aislado por archivo, no por prueba.
  await env.DB.prepare("DELETE FROM proceso_etapa").run();
  await env.DB.prepare("DELETE FROM proceso").run();
  await env.DB.prepare("DELETE FROM etapa_plantilla").run();
  await env.DB.prepare("DELETE FROM tipo_proceso").run();
  await env.DB.prepare("DELETE FROM area").run();
  await env.DB.prepare("DELETE FROM cliente").run();
  await env.DB.prepare("DELETE FROM tipo_cliente").run();
  await env.DB.prepare("DELETE FROM usuario").run();
  await env.DB.prepare("DELETE FROM tenant WHERE id <> ?")
    .bind(TENANT_UNICO_ID)
    .run();

  autorId = nuevoId();
  otroUsuarioId = nuevoId();
  usuarioAjenoId = nuevoId();
  clienteId = nuevoId();
  otroClienteId = nuevoId();
  clienteAjenoId = nuevoId();
  areaId = nuevoId();
  tipoResidenciaId = nuevoId();
  tipoSinPlantillaId = nuevoId();
  tipoAjenoId = nuevoId();
  procesoAjenoId = nuevoId();

  areaAjenaId = nuevoId();

  await env.DB.batch([
    env.DB.prepare("INSERT INTO tenant (id, nombre) VALUES (?, ?)").bind(
      OTRO_TENANT_ID,
      "Otro bufete",
    ),
    env.DB.prepare(
      "INSERT INTO usuario (id, tenant_id, nombre, email, activo)" +
        " VALUES (?, ?, ?, ?, 1)",
    ).bind(autorId, TENANT_UNICO_ID, "Itzel", EMAIL_AUTOR),
    env.DB.prepare(
      "INSERT INTO usuario (id, tenant_id, nombre, email, activo)" +
        " VALUES (?, ?, ?, ?, 1)",
    ).bind(otroUsuarioId, TENANT_UNICO_ID, "Ricardo", "ricardo@bufete.test"),
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
      "INSERT INTO cliente (id, tenant_id, nombre, telefono, creado_por," +
        " creado_en) VALUES (?, ?, ?, ?, ?, ?)",
    ).bind(
      otroClienteId,
      TENANT_UNICO_ID,
      "Inversiones del Istmo, S.A.",
      "+507 6000-0001",
      autorId,
      new Date().toISOString(),
    ),

    env.DB.prepare(
      "INSERT INTO area (id, tenant_id, nombre, activo) VALUES (?, ?, ?, 1)",
    ).bind(areaId, TENANT_UNICO_ID, "Migración y naturalización"),
    env.DB.prepare(
      "INSERT INTO tipo_proceso (id, tenant_id, area_id, nombre, activo)" +
        " VALUES (?, ?, ?, ?, 1)",
    ).bind(
      tipoResidenciaId,
      TENANT_UNICO_ID,
      areaId,
      "Residencia permanente por matrimonio con nacional",
    ),
    env.DB.prepare(
      "INSERT INTO tipo_proceso (id, tenant_id, area_id, nombre, activo)" +
        " VALUES (?, ?, ?, ?, 1)",
    ).bind(
      tipoSinPlantillaId,
      TENANT_UNICO_ID,
      areaId,
      "Consulta puntual sin trámite",
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
    ).bind(nuevoId(), OTRO_TENANT_ID, procesoAjenoId, "Etapa del vecino"),
  ]);

  // La plantilla del tipo con plan. Se carga por la API de T-6 a propósito:
  // así la prueba de «cambiar la plantilla no toca el proceso» usa el mismo
  // camino que usaría una persona.
  const plantilla = await comoAutor(
    conCuerpo(`/api/tipos-proceso/${tipoResidenciaId}/etapas`, "PUT", {
      etapas: PLAN_DE_RESIDENCIA.map((nombre) => ({ nombre })),
    }),
  );
  expect(plantilla.status).toBe(200);
});

// ---------------------------------------------------------------------------
// La regla 1: la plantilla siembra, el proceso manda
// ---------------------------------------------------------------------------

describe("la plantilla siembra el plan y después el proceso manda", () => {
  it("copia las etapas de la plantilla, en orden y todas pendientes", async () => {
    const proceso = await procesoDeResidencia();

    const detalle = await releer(proceso.id);
    expect(detalle.etapas.map((e) => e.nombre)).toEqual([
      ...PLAN_DE_RESIDENCIA,
    ]);
    expect(detalle.etapas.map((e) => e.orden)).toEqual([0, 1, 2, 3]);
    expect(
      detalle.etapas.every((e) => e.alcanzadaEn === null),
      "un proceso recién abierto no tiene nada cumplido",
    ).toBe(true);

    // Copiadas, no referenciadas: ningún identificador de `proceso_etapa`
    // coincide con uno de `etapa_plantilla`.
    const plantilla = await comoAutor(
      peticion(`/api/tipos-proceso/${tipoResidenciaId}/etapas`),
    );
    const idsDePlantilla = new Set(
      ((await plantilla.json()) as { etapas: { id: string }[] }).etapas.map(
        (e) => e.id,
      ),
    );
    for (const etapa of detalle.etapas) {
      expect(idsDePlantilla.has(etapa.id), "la etapa se referenció").toBe(
        false,
      );
    }
  });

  it("CRITERIO: cambiar la plantilla no altera un proceso ya abierto", async () => {
    const proceso = await procesoDeResidencia();

    // La plantilla se reescribe entera: se renombra un paso, se agrega otro y
    // se borran los dos últimos. Si el proceso referenciara, esto lo movería.
    const reescrita = await comoAutor(
      conCuerpo(`/api/tipos-proceso/${tipoResidenciaId}/etapas`, "PUT", {
        etapas: [
          { nombre: "Primera reunión y poder" },
          { nombre: "Recepción y revisión de documentos" },
        ],
      }),
    );
    expect(reescrita.status).toBe(200);
    expect(await plantillaDe(tipoResidenciaId)).toEqual([
      "Primera reunión y poder",
      "Recepción y revisión de documentos",
    ]);

    // Y el proceso, releído, quedó exactamente igual.
    expect(await nombresDelPlan(proceso.id)).toEqual([...PLAN_DE_RESIDENCIA]);
  });

  it("CRITERIO: un proceso con plantilla aplicada admite pasos nuevos sin tocar la plantilla", async () => {
    const proceso = await procesoDeResidencia();
    const detalle = await releer(proceso.id);

    const respuesta = await guardarPlan(proceso.id, [
      ...comoEnvio(detalle.etapas),
      { nombre: "Apostilla del acta de matrimonio" },
    ]);
    expect(respuesta.status).toBe(200);

    expect(await nombresDelPlan(proceso.id)).toEqual([
      ...PLAN_DE_RESIDENCIA,
      "Apostilla del acta de matrimonio",
    ]);

    // La plantilla no se movió.
    expect(await plantillaDe(tipoResidenciaId)).toEqual([
      ...PLAN_DE_RESIDENCIA,
    ]);
  });

  it("dos procesos del mismo tipo tienen planes independientes", async () => {
    const uno = await procesoDeResidencia("Residencia de Marta");
    const otro = await crearProceso({
      clienteId: otroClienteId,
      tipoProcesoId: tipoResidenciaId,
      titulo: "Residencia de un socio de Inversiones del Istmo",
    });

    const detalle = await releer(uno.id);
    expect(
      await guardarPlan(uno.id, [
        ...comoEnvio(detalle.etapas),
        { nombre: "Trámite de apostilla en el exterior" },
      ]),
    ).toHaveProperty("status", 200);

    expect(await nombresDelPlan(otro.id)).toEqual([...PLAN_DE_RESIDENCIA]);
  });

  it("un tipo sin plantilla abre un proceso sin pasos, y se le pueden agregar", async () => {
    const proceso = await crearProceso({
      clienteId,
      tipoProcesoId: tipoSinPlantillaId,
      titulo: "Consulta sobre régimen de visitas",
    });

    expect(await nombresDelPlan(proceso.id)).toEqual([]);

    expect(
      await guardarPlan(proceso.id, [{ nombre: "Reunión de consulta" }]),
    ).toHaveProperty("status", 200);
    expect(await nombresDelPlan(proceso.id)).toEqual(["Reunión de consulta"]);
  });
});

// ---------------------------------------------------------------------------
// La regla 2: no se quita una etapa alcanzada
// ---------------------------------------------------------------------------

describe("una etapa alcanzada no se quita", () => {
  it("CRITERIO: quitar una etapa ya alcanzada se RECHAZA", async () => {
    const proceso = await procesoDeResidencia();
    expect(await avanzar(proceso.id)).toHaveProperty("status", 200);

    const detalle = await releer(proceso.id);
    expect(detalle.etapas[0].alcanzadaEn).not.toBeNull();

    // La petición inválida concreta: el plan sin su primera etapa, que está
    // alcanzada.
    const respuesta = await guardarPlan(
      proceso.id,
      comoEnvio(detalle.etapas).slice(1),
    );

    expect(respuesta.status).toBe(422);
    expect(await fallasDe(respuesta)).toContain("etapa_alcanzada_no_se_quita");

    // Y, releyendo, el plan quedó entero.
    expect(await nombresDelPlan(proceso.id)).toEqual([...PLAN_DE_RESIDENCIA]);
  });

  it("rechaza quitar una alcanzada aunque se quite también una pendiente", async () => {
    const proceso = await procesoDeResidencia();
    expect(await avanzar(proceso.id)).toHaveProperty("status", 200);
    expect(await avanzar(proceso.id)).toHaveProperty("status", 200);

    const detalle = await releer(proceso.id);
    const respuesta = await guardarPlan(proceso.id, [
      comoEnvio(detalle.etapas)[0],
      comoEnvio(detalle.etapas)[3],
    ]);

    expect(respuesta.status).toBe(422);
    expect(await fallasDe(respuesta)).toContain("etapa_alcanzada_no_se_quita");
    expect(await nombresDelPlan(proceso.id)).toEqual([...PLAN_DE_RESIDENCIA]);
  });

  it("rechaza mover una alcanzada detrás de una pendiente", async () => {
    const proceso = await procesoDeResidencia();
    expect(await avanzar(proceso.id)).toHaveProperty("status", 200);

    const detalle = await releer(proceso.id);
    const envio = comoEnvio(detalle.etapas);
    const respuesta = await guardarPlan(proceso.id, [
      envio[1],
      envio[0],
      envio[2],
      envio[3],
    ]);

    expect(respuesta.status).toBe(422);
    expect(await fallasDe(respuesta)).toContain("etapa_alcanzada_no_se_mueve");
    expect(await nombresDelPlan(proceso.id)).toEqual([...PLAN_DE_RESIDENCIA]);
  });

  it("rechaza insertar un paso nuevo antes de una alcanzada", async () => {
    const proceso = await procesoDeResidencia();
    expect(await avanzar(proceso.id)).toHaveProperty("status", 200);

    const detalle = await releer(proceso.id);
    const respuesta = await guardarPlan(proceso.id, [
      { nombre: "Primera reunión y poder" },
      ...comoEnvio(detalle.etapas),
    ]);

    expect(respuesta.status).toBe(422);
    expect(await fallasDe(respuesta)).toContain("etapa_alcanzada_no_se_mueve");
    expect(await nombresDelPlan(proceso.id)).toEqual([...PLAN_DE_RESIDENCIA]);
  });

  /*
   * El contrapeso de la guarda. Sin él, una guarda que rechazara TODO envío
   * con etapas alcanzadas pasaría las cuatro pruebas de arriba y dejaría el
   * plan congelado para siempre apenas se avanza una vez — que es justo lo
   * contrario de lo que pide el diseño.
   */
  it("sí deja reordenar, agregar y quitar entre las PENDIENTES", async () => {
    const proceso = await procesoDeResidencia();
    expect(await avanzar(proceso.id)).toHaveProperty("status", 200);

    const detalle = await releer(proceso.id);
    const envio = comoEnvio(detalle.etapas);

    // Se conserva la alcanzada al frente, se invierten dos pendientes, se
    // quita la última y se agrega una nueva.
    const respuesta = await guardarPlan(proceso.id, [
      envio[0],
      envio[2],
      envio[1],
      { nombre: "Apostilla del acta de matrimonio" },
    ]);
    expect(respuesta.status).toBe(200);

    expect(await nombresDelPlan(proceso.id)).toEqual([
      PLAN_DE_RESIDENCIA[0],
      PLAN_DE_RESIDENCIA[2],
      PLAN_DE_RESIDENCIA[1],
      "Apostilla del acta de matrimonio",
    ]);

    // Y la alcanzada sigue alcanzada: reordenar lo de atrás no borra lo que
    // ya pasó.
    const despues = await releer(proceso.id);
    expect(despues.etapas[0].alcanzadaEn).toBe(detalle.etapas[0].alcanzadaEn);
    expect(despues.etapas.slice(1).every((e) => e.alcanzadaEn === null)).toBe(
      true,
    );
  });

  it("sí deja corregir el nombre de una alcanzada, que es texto de cara al cliente", async () => {
    const proceso = await procesoDeResidencia();
    expect(await avanzar(proceso.id)).toHaveProperty("status", 200);

    const detalle = await releer(proceso.id);
    const envio = comoEnvio(detalle.etapas);
    envio[0] = { id: envio[0].id, nombre: "Recepción y revisión de papelería" };

    expect(await guardarPlan(proceso.id, envio)).toHaveProperty("status", 200);

    const despues = await releer(proceso.id);
    expect(despues.etapas[0].nombre).toBe(
      "Recepción y revisión de papelería",
    );
    expect(
      despues.etapas[0].alcanzadaEn,
      "corregir el texto no rehace el hecho",
    ).toBe(detalle.etapas[0].alcanzadaEn);
  });
});

// ---------------------------------------------------------------------------
// Avanzar de etapa
// ---------------------------------------------------------------------------

describe("avanzar de etapa", () => {
  it("marca la primera pendiente y deja las demás pendientes", async () => {
    const proceso = await procesoDeResidencia();

    const respuesta = await avanzar(proceso.id);
    expect(respuesta.status).toBe(200);

    const detalle = await releer(proceso.id);
    expect(detalle.etapas[0].alcanzadaEn).not.toBeNull();
    expect(detalle.etapas.slice(1).map((e) => e.alcanzadaEn)).toEqual([
      null,
      null,
      null,
    ]);

    // El momento que guarda la base tiene la forma exacta de `toISOString`:
    // el `CHECK` de la migración lo exige, y acá se afirma de vuelta.
    const alcanzada = detalle.etapas[0].alcanzadaEn ?? "";
    expect(new Date(alcanzada).toISOString()).toBe(alcanzada);
  });

  it("avanza una por una, en el orden del plan", async () => {
    const proceso = await procesoDeResidencia();

    for (let paso = 1; paso <= 4; paso += 1) {
      expect(await avanzar(proceso.id)).toHaveProperty("status", 200);

      const detalle = await releer(proceso.id);
      expect(
        detalle.etapas.filter((e) => e.alcanzadaEn !== null).map((e) => e.nombre),
      ).toEqual(PLAN_DE_RESIDENCIA.slice(0, paso));
      expect(detalle.proceso.etapasCumplidas).toBe(paso);
    }
  });

  it("rechaza avanzar cuando ya no queda nada pendiente", async () => {
    const proceso = await procesoDeResidencia();
    for (let paso = 0; paso < 4; paso += 1) {
      expect(await avanzar(proceso.id)).toHaveProperty("status", 200);
    }

    const respuesta = await avanzar(proceso.id);
    expect(respuesta.status).toBe(409);
    expect((await respuesta.json()) as { error: string }).toHaveProperty(
      "error",
      "sin_etapas_pendientes",
    );
  });

  it("rechaza avanzar un proceso sin plan", async () => {
    const proceso = await crearProceso({
      clienteId,
      tipoProcesoId: tipoSinPlantillaId,
      titulo: "Consulta sobre régimen de visitas",
    });

    expect(await avanzar(proceso.id)).toHaveProperty("status", 409);
  });

  /*
   * El avance es de una sola dirección: no hay forma de desandar una etapa.
   * Es la decisión de T-7, coherente con que una alcanzada no se borre. Lo
   * que esta prueba fija es que no exista una puerta trasera: ni un `PUT` del
   * plan ni ninguna otra ruta puede devolver `alcanzadaEn` a nulo.
   */
  it("no hay forma de desandar: el plan reenviado no borra lo alcanzado", async () => {
    const proceso = await procesoDeResidencia();
    expect(await avanzar(proceso.id)).toHaveProperty("status", 200);

    const detalle = await releer(proceso.id);
    const marca = detalle.etapas[0].alcanzadaEn;

    // Un envío que intenta decir «esta etapa no está alcanzada» mandando el
    // campo. El servidor no lo lee: el plan solo lleva id y nombre.
    const respuesta = await comoAutor(
      conCuerpo(`/api/procesos/${proceso.id}/etapas`, "PUT", {
        etapas: detalle.etapas.map((etapa) => ({
          id: etapa.id,
          nombre: etapa.nombre,
          alcanzadaEn: null,
        })),
      }),
    );
    expect(respuesta.status).toBe(200);

    expect((await releer(proceso.id)).etapas[0].alcanzadaEn).toBe(marca);
  });
});

// ---------------------------------------------------------------------------
// Rechazos del alta
// ---------------------------------------------------------------------------

describe("el alta de un proceso rechaza lo que no se puede guardar", () => {
  async function sinGuardarNada(respuesta: Response, motivo: string) {
    expect(respuesta.status).toBe(422);
    expect(await fallasDe(respuesta)).toContain(motivo);

    const listado = await comoAutor(peticion("/api/procesos"));
    const cuerpo = (await listado.json()) as { procesos: ProcesoEnElCable[] };
    expect(cuerpo.procesos, "no se guardó nada").toEqual([]);
  }

  it("rechaza un proceso sin cliente (I-2)", async () => {
    await sinGuardarNada(
      await comoAutor(
        conCuerpo("/api/procesos", "POST", {
          tipoProcesoId: tipoResidenciaId,
          titulo: "Residencia permanente",
        }),
      ),
      "cliente_requerido",
    );
  });

  it("rechaza un proceso con un cliente de otro tenant", async () => {
    await sinGuardarNada(
      await comoAutor(
        conCuerpo("/api/procesos", "POST", {
          clienteId: clienteAjenoId,
          tipoProcesoId: tipoResidenciaId,
          titulo: "Residencia permanente",
        }),
      ),
      "cliente_desconocido",
    );
  });

  it("rechaza un proceso con un cliente inexistente", async () => {
    await sinGuardarNada(
      await comoAutor(
        conCuerpo("/api/procesos", "POST", {
          clienteId: nuevoId(),
          tipoProcesoId: tipoResidenciaId,
          titulo: "Residencia permanente",
        }),
      ),
      "cliente_desconocido",
    );
  });

  it("rechaza un proceso sin tipo de proceso", async () => {
    await sinGuardarNada(
      await comoAutor(
        conCuerpo("/api/procesos", "POST", {
          clienteId,
          titulo: "Residencia permanente",
        }),
      ),
      "tipo_proceso_requerido",
    );
  });

  it("rechaza un proceso con un tipo inexistente", async () => {
    await sinGuardarNada(
      await comoAutor(
        conCuerpo("/api/procesos", "POST", {
          clienteId,
          tipoProcesoId: nuevoId(),
          titulo: "Residencia permanente",
        }),
      ),
      "tipo_proceso_desconocido",
    );
  });

  it("rechaza un proceso con un tipo de otro tenant", async () => {
    await sinGuardarNada(
      await comoAutor(
        conCuerpo("/api/procesos", "POST", {
          clienteId,
          tipoProcesoId: tipoAjenoId,
          titulo: "Residencia permanente",
        }),
      ),
      "tipo_proceso_desconocido",
    );
  });

  it("rechaza un proceso sin título", async () => {
    await sinGuardarNada(
      await comoAutor(
        conCuerpo("/api/procesos", "POST", {
          clienteId,
          tipoProcesoId: tipoResidenciaId,
          titulo: "   ",
        }),
      ),
      "titulo_requerido",
    );
  });

  it("rechaza un responsable de otro tenant", async () => {
    await sinGuardarNada(
      await comoAutor(
        conCuerpo("/api/procesos", "POST", {
          clienteId,
          tipoProcesoId: tipoResidenciaId,
          titulo: "Residencia permanente",
          responsableId: usuarioAjenoId,
        }),
      ),
      "responsable_desconocido",
    );
  });

  it("rechaza un cuerpo que no es un objeto", async () => {
    const respuesta = await comoAutor(
      conCuerpo("/api/procesos", "POST", ["no", "soy", "un", "proceso"]),
    );
    expect(respuesta.status).toBe(422);
  });

  it("rechaza un cuerpo que ni siquiera es JSON", async () => {
    const respuesta = await comoAutor(
      peticion("/api/procesos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      }),
    );
    expect(respuesta.status).toBe(400);
  });

  it("guarda un responsable del propio tenant, y se relee con su nombre", async () => {
    const proceso = await crearProceso({
      clienteId,
      tipoProcesoId: tipoResidenciaId,
      titulo: "Residencia permanente de Marta Quintero",
      responsableId: otroUsuarioId,
    });

    const detalle = await releer(proceso.id);
    expect(detalle.proceso.responsableId).toBe(otroUsuarioId);
    expect(detalle.proceso.responsableNombre).toBe("Ricardo");
  });

  it("el origen es siempre `directo` en esta tajada", async () => {
    // `cotizacion` no está implementado: la tabla a la que apuntaría
    // `cotizacion_linea_id` no existe todavía (tajada 2). Que el cliente lo
    // pida no lo cambia.
    const proceso = await crearProceso({
      clienteId,
      tipoProcesoId: tipoResidenciaId,
      titulo: "Residencia permanente de Marta Quintero",
      origen: "cotizacion",
    });

    expect(proceso.origen).toBe("directo");
    expect((await releer(proceso.id)).proceso.origen).toBe("directo");
  });
});

// ---------------------------------------------------------------------------
// Rechazos del plan
// ---------------------------------------------------------------------------

describe("el plan rechaza lo que no se puede guardar", () => {
  it("rechaza un paso sin nombre", async () => {
    const proceso = await procesoDeResidencia();
    const detalle = await releer(proceso.id);

    const respuesta = await guardarPlan(proceso.id, [
      ...comoEnvio(detalle.etapas),
      { nombre: "   " },
    ]);

    expect(respuesta.status).toBe(422);
    expect(await fallasDe(respuesta)).toContain("nombre_requerido");
    expect(await nombresDelPlan(proceso.id)).toEqual([...PLAN_DE_RESIDENCIA]);
  });

  it("rechaza un id de etapa que no es de este proceso", async () => {
    const proceso = await procesoDeResidencia();
    const otro = await crearProceso({
      clienteId: otroClienteId,
      tipoProcesoId: tipoResidenciaId,
      titulo: "Residencia de un socio",
    });
    const ajena = (await releer(otro.id)).etapas[0];
    const detalle = await releer(proceso.id);

    const respuesta = await guardarPlan(proceso.id, [
      ...comoEnvio(detalle.etapas),
      { id: ajena.id, nombre: ajena.nombre },
    ]);

    expect(respuesta.status).toBe(422);
    expect(await fallasDe(respuesta)).toContain("etapa_desconocida");

    // Y la etapa del otro proceso quedó donde estaba.
    expect(await nombresDelPlan(otro.id)).toEqual([...PLAN_DE_RESIDENCIA]);
  });

  it("rechaza la misma etapa dos veces en el mismo envío", async () => {
    const proceso = await procesoDeResidencia();
    const detalle = await releer(proceso.id);
    const envio = comoEnvio(detalle.etapas);

    const respuesta = await guardarPlan(proceso.id, [...envio, envio[3]]);

    expect(respuesta.status).toBe(422);
    expect(await fallasDe(respuesta)).toContain("etapa_desconocida");
  });

  it("rechaza un cuerpo sin la lista de etapas", async () => {
    const proceso = await procesoDeResidencia();

    const respuesta = await comoAutor(
      conCuerpo(`/api/procesos/${proceso.id}/etapas`, "PUT", { pasos: [] }),
    );

    expect(respuesta.status).toBe(422);
    expect(await fallasDe(respuesta)).toContain("tipo_invalido");
  });

  it("deja vaciar el plan de un proceso sin nada alcanzado", async () => {
    // El contrapeso de la guarda de arriba: un plan vacío es válido mientras
    // no haya nada cumplido que se estuviera borrando.
    const proceso = await procesoDeResidencia();

    expect(await guardarPlan(proceso.id, [])).toHaveProperty("status", 200);
    expect(await nombresDelPlan(proceso.id)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Tenencia: lo del vecino no se lee, no se escribe y no se cuenta
// ---------------------------------------------------------------------------

describe("un proceso de otro tenant no existe desde acá", () => {
  it("no se lee", async () => {
    expect(
      await comoAutor(peticion(`/api/procesos/${procesoAjenoId}`)),
    ).toHaveProperty("status", 404);
  });

  it("no se le edita el plan", async () => {
    const respuesta = await guardarPlan(procesoAjenoId, [
      { nombre: "Etapa metida desde afuera" },
    ]);
    expect(respuesta.status).toBe(404);

    // Y el plan del vecino sigue intacto. Se mira la base directamente
    // porque por la API ese proceso no existe.
    const { results } = await env.DB.prepare(
      "SELECT nombre FROM proceso_etapa WHERE proceso_id = ? ORDER BY orden",
    )
      .bind(procesoAjenoId)
      .all<{ nombre: string }>();
    expect(results.map((f) => f.nombre)).toEqual(["Etapa del vecino"]);
  });

  it("no se le avanza la etapa", async () => {
    expect(await avanzar(procesoAjenoId)).toHaveProperty("status", 404);

    const fila = await env.DB.prepare(
      "SELECT count(*) AS n FROM proceso_etapa" +
        " WHERE proceso_id = ? AND alcanzada_en IS NOT NULL",
    )
      .bind(procesoAjenoId)
      .first<{ n: number }>();
    expect(fila?.n).toBe(0);
  });

  it("no aparece en el listado", async () => {
    await procesoDeResidencia();

    const respuesta = await comoAutor(peticion("/api/procesos"));
    const cuerpo = (await respuesta.json()) as {
      procesos: ProcesoEnElCable[];
    };

    expect(cuerpo.procesos.map((p) => p.titulo)).toEqual([
      "Residencia permanente de Marta Quintero",
    ]);
  });

  it("un identificador mal escrito en la URL es un 404, no un 500", async () => {
    expect(await comoAutor(peticion("/api/procesos/%ZZ"))).toHaveProperty(
      "status",
      404,
    );
  });
});

// ---------------------------------------------------------------------------
// Listado
// ---------------------------------------------------------------------------

describe("el listado", () => {
  it("trae lo que la pantalla muestra sin pedir el detalle de cada uno", async () => {
    const proceso = await procesoDeResidencia();
    expect(await avanzar(proceso.id)).toHaveProperty("status", 200);

    const respuesta = await comoAutor(peticion("/api/procesos"));
    expect(respuesta.status).toBe(200);
    const [fila] = (
      (await respuesta.json()) as { procesos: ProcesoEnElCable[] }
    ).procesos;

    expect(fila.clienteNombre).toBe("Marta Quintero");
    expect(fila.tipoProcesoNombre).toBe(
      "Residencia permanente por matrimonio con nacional",
    );
    expect(fila.areaNombre).toBe("Migración y naturalización");
    expect(fila.estado).toBe("abierto");
    expect(fila.etapasCumplidas).toBe(1);
    expect(fila.etapasTotales).toBe(4);
    // «Lo que viene» es la mitad del valor: el listado nombra la próxima
    // pendiente, no la última cumplida.
    expect(fila.etapaVigente).toBe(PLAN_DE_RESIDENCIA[1]);
  });

  it("filtra por cliente", async () => {
    await procesoDeResidencia("Residencia de Marta");
    await crearProceso({
      clienteId: otroClienteId,
      tipoProcesoId: tipoResidenciaId,
      titulo: "Residencia de un socio",
    });

    const respuesta = await comoAutor(
      peticion(`/api/procesos?clienteId=${clienteId}`),
    );
    expect(respuesta.status).toBe(200);
    const cuerpo = (await respuesta.json()) as {
      procesos: ProcesoEnElCable[];
    };

    expect(cuerpo.procesos.map((p) => p.titulo)).toEqual([
      "Residencia de Marta",
    ]);
  });

  it("un cliente de otro tenant no filtra nada ajeno hacia adentro", async () => {
    await procesoDeResidencia();

    const respuesta = await comoAutor(
      peticion(`/api/procesos?clienteId=${clienteAjenoId}`),
    );
    expect(respuesta.status).toBe(200);
    const cuerpo = (await respuesta.json()) as {
      procesos: ProcesoEnElCable[];
    };

    expect(cuerpo.procesos).toEqual([]);
  });

  it("un proceso sin plan muestra que no tiene próxima etapa", async () => {
    const proceso = await crearProceso({
      clienteId,
      tipoProcesoId: tipoSinPlantillaId,
      titulo: "Consulta sobre régimen de visitas",
    });

    const detalle = await releer(proceso.id);
    expect(detalle.proceso.etapasTotales).toBe(0);
    expect(detalle.proceso.etapaVigente).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// La puerta de Access
// ---------------------------------------------------------------------------

describe("la puerta de Access", () => {
  function servicioEspia() {
    const usos: string[] = [];
    const registrar = (metodo: string) => () => {
      usos.push(metodo);
      return Promise.reject(new Error(`no se debió llamar a ${metodo}`));
    };

    const metodos = [
      "listar",
      "obtener",
      "crear",
      "reemplazarEtapas",
      "avanzar",
    ] as const;

    const servicio = Object.fromEntries(
      metodos.map((metodo) => [metodo, registrar(metodo)]),
    ) as unknown as ServicioDeProcesos;

    return { usos, servicio };
  }

  it("ninguna ruta de procesos pasa sin identidad, y el dominio no se toca", async () => {
    const { servicio, usos } = servicioEspia();
    const id = nuevoId();

    const respuestas = await Promise.all([
      sinIdentidad(peticion("/api/procesos"), servicio),
      sinIdentidad(peticion(`/api/procesos?clienteId=${id}`), servicio),
      sinIdentidad(
        conCuerpo("/api/procesos", "POST", {
          clienteId: id,
          tipoProcesoId: id,
          titulo: "x",
        }),
        servicio,
      ),
      sinIdentidad(peticion(`/api/procesos/${id}`), servicio),
      sinIdentidad(
        conCuerpo(`/api/procesos/${id}/etapas`, "PUT", { etapas: [] }),
        servicio,
      ),
      sinIdentidad(
        peticion(`/api/procesos/${id}/avanzar`, { method: "POST" }),
        servicio,
      ),
    ]);

    expect(respuestas.map((r) => r.status)).toEqual(respuestas.map(() => 403));
    expect(usos, "el dominio se ejecutó sin identidad").toEqual([]);

    // Y tampoco por otra vía: no se escribió nada.
    const cuenta = await env.DB.prepare(
      "SELECT count(*) AS n FROM proceso WHERE tenant_id = ?",
    )
      .bind(TENANT_UNICO_ID)
      .first<{ n: number }>();
    expect(cuenta?.n).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Métodos
// ---------------------------------------------------------------------------

describe("los métodos no permitidos se rechazan", () => {
  it("rechaza DELETE sobre la colección", async () => {
    const respuesta = await comoAutor(
      peticion("/api/procesos", { method: "DELETE" }),
    );

    expect(respuesta.status).toBe(405);
    expect(respuesta.headers.get("allow")).toBe("GET, POST");
  });

  it("rechaza DELETE sobre un proceso: en esta tajada no se borran", async () => {
    const proceso = await procesoDeResidencia();

    const respuesta = await comoAutor(
      peticion(`/api/procesos/${proceso.id}`, { method: "DELETE" }),
    );

    expect(respuesta.status).toBe(405);
    expect(respuesta.headers.get("allow")).toBe("GET");
  });

  it("rechaza GET sobre avanzar", async () => {
    const proceso = await procesoDeResidencia();

    const respuesta = await comoAutor(
      peticion(`/api/procesos/${proceso.id}/avanzar`),
    );

    expect(respuesta.status).toBe(405);
    expect(respuesta.headers.get("allow")).toBe("POST");
  });

  it("rechaza GET sobre el plan: el detalle ya lo trae", async () => {
    const proceso = await procesoDeResidencia();

    const respuesta = await comoAutor(
      peticion(`/api/procesos/${proceso.id}/etapas`),
    );

    expect(respuesta.status).toBe(405);
    expect(respuesta.headers.get("allow")).toBe("PUT");
  });
});

// ---------------------------------------------------------------------------
// T-11 · Guardar el plan de un proceso como plantilla
//
// El camino que el diseño señala como el más usado para crear una plantilla:
// se abre un proceso, se le acomodan los pasos sobre la marcha, y cuando
// queda bien se guarda (`docs/diseno.md` §6, «Etapas: plantilla y plan de
// trabajo»).
//
// Las tres propiedades que esta sección existe para fijar:
//
//  1. **Se copian TODAS las etapas, en su orden actual.** Cumplidas y
//     pendientes por igual: una plantilla es un plan, y en un plan no hay
//     nada «ya hecho». `alcanzada_en` no viaja porque la tabla de plantilla
//     no tiene esa columna, y una prueba vigila que no la tenga.
//  2. **Guardar la plantilla no toca ningún proceso abierto**, ni siquiera
//     el de origen. Es la misma propiedad de siempre, pero éste es el punto
//     donde más gente va a suponer lo contrario.
//  3. **Un tipo nuevo no reasigna el proceso de origen.** La decisión de
//     T-11, probada por relectura: el proceso sigue apuntando a su tipo
//     viejo.
// ---------------------------------------------------------------------------

interface TipoEnElCable {
  id: string;
  areaId: string;
  areaNombre: string | null;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
}

interface PlantillaGuardadaEnElCable {
  tipo: TipoEnElCable;
  etapas: { id: string; nombre: string; orden: number }[];
}

function guardarComoPlantilla(
  procesoId: string,
  cuerpo: unknown,
): Promise<Response> {
  return comoAutor(
    conCuerpo(`/api/procesos/${procesoId}/plantilla`, "POST", cuerpo),
  );
}

/** La plantilla releída por la API de T-6, con su orden. */
async function plantillaCompletaDe(
  tipoId: string,
): Promise<{ nombre: string; orden: number }[]> {
  const respuesta = await comoAutor(
    peticion(`/api/tipos-proceso/${tipoId}/etapas`),
  );
  expect(respuesta.status).toBe(200);
  return (
    (await respuesta.json()) as {
      etapas: { nombre: string; orden: number }[];
    }
  ).etapas.map((etapa) => ({ nombre: etapa.nombre, orden: etapa.orden }));
}

async function cuantosTipos(tenantId: string): Promise<number> {
  const fila = await env.DB.prepare(
    "SELECT count(*) AS n FROM tipo_proceso WHERE tenant_id = ?",
  )
    .bind(tenantId)
    .first<{ n: number }>();
  return fila?.n ?? 0;
}

async function cuantasEtapasDePlantilla(tipoId: string): Promise<number> {
  const fila = await env.DB.prepare(
    "SELECT count(*) AS n FROM etapa_plantilla WHERE tipo_proceso_id = ?",
  )
    .bind(tipoId)
    .first<{ n: number }>();
  return fila?.n ?? 0;
}

describe("guardar el plan de un proceso como plantilla rechaza lo que no puede guardar", () => {
  it("rechaza guardar desde un proceso de OTRO TENANT", async () => {
    const respuesta = await guardarComoPlantilla(procesoAjenoId, {
      destino: "actualizar",
    });

    expect(respuesta.status).toBe(404);
    // Y no escribió: la plantilla del vecino sigue vacía.
    expect(await cuantasEtapasDePlantilla(tipoAjenoId)).toBe(0);
  });

  it("rechaza actualizar la plantilla de un TIPO DE PROCESO de otro tenant", async () => {
    // Una fila cruzada a mano: la llave foránea de `proceso.tipo_proceso_id`
    // no lleva el tenant, así que esto es expresable en la base y tiene que
    // ser inexpresable por la API. Sin el filtro de tenencia en el destino,
    // guardar acá escribiría en la plantilla del bufete vecino.
    const procesoCruzadoId = nuevoId();
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO proceso (id, tenant_id, cliente_id, tipo_proceso_id," +
          " origen, titulo, estado, abierto_en)" +
          " VALUES (?, ?, ?, ?, 'directo', ?, 'abierto', ?)",
      ).bind(
        procesoCruzadoId,
        TENANT_UNICO_ID,
        clienteId,
        tipoAjenoId,
        "Proceso con el tipo del vecino",
        new Date().toISOString(),
      ),
      env.DB.prepare(
        "INSERT INTO proceso_etapa (id, tenant_id, proceso_id, nombre, orden)" +
          " VALUES (?, ?, ?, ?, 0)",
      ).bind(nuevoId(), TENANT_UNICO_ID, procesoCruzadoId, "Un paso nuestro"),
    ]);

    const respuesta = await guardarComoPlantilla(procesoCruzadoId, {
      destino: "actualizar",
    });

    expect(respuesta.status).toBe(404);
    expect(await cuantasEtapasDePlantilla(tipoAjenoId)).toBe(0);
  });

  it("rechaza crear un tipo nuevo SIN NOMBRE", async () => {
    const proceso = await procesoDeResidencia();

    const respuesta = await guardarComoPlantilla(proceso.id, {
      destino: "nuevo",
      areaId,
      nombre: "   ",
    });

    expect(respuesta.status).toBe(422);
    expect(await fallasDe(respuesta)).toContain("nombre_requerido");
    // Y no se creó nada: siguen los dos tipos de la preparación.
    expect(await cuantosTipos(TENANT_UNICO_ID)).toBe(2);
  });

  it("rechaza crear un tipo nuevo SIN ÁREA", async () => {
    const proceso = await procesoDeResidencia();

    const respuesta = await guardarComoPlantilla(proceso.id, {
      destino: "nuevo",
      nombre: "Residencia por matrimonio, versión corta",
    });

    expect(respuesta.status).toBe(422);
    expect(await fallasDe(respuesta)).toContain("area_requerida");
    expect(await cuantosTipos(TENANT_UNICO_ID)).toBe(2);
  });

  it("rechaza crear un tipo nuevo en un ÁREA DE OTRO TENANT", async () => {
    const proceso = await procesoDeResidencia();

    const respuesta = await guardarComoPlantilla(proceso.id, {
      destino: "nuevo",
      areaId: areaAjenaId,
      nombre: "Residencia por matrimonio, versión corta",
    });

    expect(respuesta.status).toBe(422);
    expect(await fallasDe(respuesta)).toContain("area_desconocida");
    expect(await cuantosTipos(TENANT_UNICO_ID)).toBe(2);
    expect(await cuantosTipos(OTRO_TENANT_ID)).toBe(1);
  });

  it("rechaza crear un tipo nuevo en un ÁREA INEXISTENTE", async () => {
    const proceso = await procesoDeResidencia();

    const respuesta = await guardarComoPlantilla(proceso.id, {
      destino: "nuevo",
      areaId: nuevoId(),
      nombre: "Residencia por matrimonio, versión corta",
    });

    expect(respuesta.status).toBe(422);
    expect(await fallasDe(respuesta)).toContain("area_desconocida");
    expect(await cuantosTipos(TENANT_UNICO_ID)).toBe(2);
  });

  it("rechaza guardar desde un proceso SIN ETAPAS: no hay plan que guardar", async () => {
    const proceso = await crearProceso({
      clienteId,
      tipoProcesoId: tipoSinPlantillaId,
      titulo: "Consulta de una hora sobre un contrato",
    });
    expect((await releer(proceso.id)).etapas).toEqual([]);

    const respuesta = await guardarComoPlantilla(proceso.id, {
      destino: "actualizar",
    });

    expect(respuesta.status).toBe(422);
    expect(await fallasDe(respuesta)).toContain("plan_vacio");
    expect(await cuantasEtapasDePlantilla(tipoSinPlantillaId)).toBe(0);
  });

  it("rechaza un plan vacío también cuando el destino es un tipo nuevo", async () => {
    const proceso = await crearProceso({
      clienteId,
      tipoProcesoId: tipoSinPlantillaId,
      titulo: "Consulta de una hora sobre un contrato",
    });

    const respuesta = await guardarComoPlantilla(proceso.id, {
      destino: "nuevo",
      areaId,
      nombre: "Consulta sin trámite",
    });

    expect(respuesta.status).toBe(422);
    expect(await fallasDe(respuesta)).toContain("plan_vacio");
    // El tipo nuevo tampoco se creó: el plan vacío se comprueba antes.
    expect(await cuantosTipos(TENANT_UNICO_ID)).toBe(2);
  });

  it("rechaza un destino que no es ninguno de los dos", async () => {
    const proceso = await procesoDeResidencia();

    const respuesta = await guardarComoPlantilla(proceso.id, {
      destino: "sincronizar-todo",
    });

    expect(respuesta.status).toBe(422);
    expect(await fallasDe(respuesta)).toContain("destino_invalido");
  });

  it("rechaza un cuerpo sin destino", async () => {
    const proceso = await procesoDeResidencia();

    const respuesta = await guardarComoPlantilla(proceso.id, {});

    expect(respuesta.status).toBe(422);
    expect(await fallasDe(respuesta)).toContain("destino_invalido");
  });

  it("rechaza un cuerpo que ni siquiera es JSON", async () => {
    const proceso = await procesoDeResidencia();

    const respuesta = await comoAutor(
      peticion(`/api/procesos/${proceso.id}/plantilla`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      }),
    );

    expect(respuesta.status).toBe(400);
  });

  it("rechaza GET sobre la plantilla de un proceso: guardar es una escritura", async () => {
    const proceso = await procesoDeResidencia();

    const respuesta = await comoAutor(
      peticion(`/api/procesos/${proceso.id}/plantilla`),
    );

    expect(respuesta.status).toBe(405);
    expect(respuesta.headers.get("allow")).toBe("POST");
  });

  it("no pasa sin identidad de Access, y el dominio no se toca", async () => {
    const usos: string[] = [];
    const registrar = (metodo: string) => () => {
      usos.push(metodo);
      return Promise.reject(new Error(`no se debió llamar a ${metodo}`));
    };

    const procesos = Object.fromEntries(
      ["listar", "obtener", "crear", "reemplazarEtapas", "avanzar"].map(
        (metodo) => [metodo, registrar(metodo)],
      ),
    ) as unknown as ServicioDeProcesos;

    const respuesta = await manejar(
      conCuerpo(`/api/procesos/${nuevoId()}/plantilla`, "POST", {
        destino: "nuevo",
        areaId,
        nombre: "Lo que sea",
      }),
      entorno(),
      { correoDeDesarrollo: () => null, procesos },
    );

    expect(respuesta.status).toBe(403);
    expect(usos, "el dominio se ejecutó sin identidad").toEqual([]);
    expect(await cuantosTipos(TENANT_UNICO_ID)).toBe(2);
  });
});

describe("la plantilla queda con los pasos del plan, en el mismo orden", () => {
  it("copia el plan ajustado a mano sobre la plantilla del tipo", async () => {
    const proceso = await procesoDeResidencia();

    // El plan se ajusta a mano, que es de donde sale el valor de esta
    // función: se quita un paso, se agrega otro, y se reordena.
    const actual = (await releer(proceso.id)).etapas;
    const ajustado = [
      { id: actual[0].id, nombre: actual[0].nombre },
      { id: actual[2].id, nombre: actual[2].nombre },
      { id: actual[1].id, nombre: "Presentación ante Migración, con cita" },
      { id: null, nombre: "Apostilla del acta de matrimonio" },
    ];
    expect((await guardarPlan(proceso.id, ajustado)).status).toBe(200);

    const respuesta = await guardarComoPlantilla(proceso.id, {
      destino: "actualizar",
    });
    expect(respuesta.status).toBe(200);

    expect(await plantillaCompletaDe(tipoResidenciaId)).toEqual([
      { nombre: PLAN_DE_RESIDENCIA[0], orden: 0 },
      { nombre: PLAN_DE_RESIDENCIA[2], orden: 1 },
      { nombre: "Presentación ante Migración, con cita", orden: 2 },
      { nombre: "Apostilla del acta de matrimonio", orden: 3 },
    ]);
  });

  it("copia TAMBIÉN las etapas cumplidas: una plantilla es un plan entero", async () => {
    const proceso = await procesoDeResidencia();
    expect((await avanzar(proceso.id)).status).toBe(200);
    expect((await avanzar(proceso.id)).status).toBe(200);

    // Dos cumplidas y dos pendientes, y la plantilla tiene que llevarse las
    // cuatro: en un plan no hay nada «ya hecho».
    const antes = (await releer(proceso.id)).etapas;
    expect(antes.filter((e) => e.alcanzadaEn !== null)).toHaveLength(2);

    expect(
      (await guardarComoPlantilla(proceso.id, { destino: "actualizar" }))
        .status,
    ).toBe(200);

    expect(
      (await plantillaCompletaDe(tipoResidenciaId)).map((e) => e.nombre),
    ).toEqual([...PLAN_DE_RESIDENCIA]);
  });

  it("reemplaza la plantilla: no acumula los pasos viejos", async () => {
    const proceso = await procesoDeResidencia();
    const actual = (await releer(proceso.id)).etapas;

    // El plan se recorta a dos pasos. La plantilla tenía cuatro.
    expect(
      (
        await guardarPlan(
          proceso.id,
          actual.slice(0, 2).map((e) => ({ id: e.id, nombre: e.nombre })),
        )
      ).status,
    ).toBe(200);

    expect(
      (await guardarComoPlantilla(proceso.id, { destino: "actualizar" }))
        .status,
    ).toBe(200);

    expect(await plantillaDe(tipoResidenciaId)).toEqual([
      PLAN_DE_RESIDENCIA[0],
      PLAN_DE_RESIDENCIA[1],
    ]);
  });

  it("la respuesta trae el tipo y la plantilla ya guardada", async () => {
    const proceso = await procesoDeResidencia();

    const respuesta = await guardarComoPlantilla(proceso.id, {
      destino: "actualizar",
    });
    expect(respuesta.status).toBe(200);

    const cuerpo = (await respuesta.json()) as PlantillaGuardadaEnElCable;
    expect(cuerpo.tipo.id).toBe(tipoResidenciaId);
    expect(cuerpo.etapas.map((e) => e.nombre)).toEqual([
      ...PLAN_DE_RESIDENCIA,
    ]);
    expect(cuerpo.etapas.map((e) => e.orden)).toEqual([0, 1, 2, 3]);
  });

  it("`alcanzada_en` no se copia: la tabla de plantilla no tiene esa columna", async () => {
    const proceso = await procesoDeResidencia();
    expect((await avanzar(proceso.id)).status).toBe(200);
    expect(
      (await guardarComoPlantilla(proceso.id, { destino: "actualizar" }))
        .status,
    ).toBe(200);

    const { results } = await env.DB.prepare(
      "SELECT name FROM pragma_table_info('etapa_plantilla')",
    ).all<{ name: string }>();

    expect(results.map((fila) => fila.name)).toEqual([
      "id",
      "tenant_id",
      "tipo_proceso_id",
      "nombre",
      "orden",
    ]);
  });

  it("las etapas de la plantilla son filas nuevas, no las del proceso", async () => {
    const proceso = await procesoDeResidencia();
    const delProceso = (await releer(proceso.id)).etapas.map((e) => e.id);

    const respuesta = await guardarComoPlantilla(proceso.id, {
      destino: "actualizar",
    });
    const cuerpo = (await respuesta.json()) as PlantillaGuardadaEnElCable;

    for (const etapa of cuerpo.etapas) {
      expect(delProceso).not.toContain(etapa.id);
    }
  });
});

describe("CRITERIO: guardar la plantilla no modifica ningún proceso abierto", () => {
  it("el proceso de ORIGEN no cambió, ni su plan ni su tipo", async () => {
    const proceso = await procesoDeResidencia();
    expect((await avanzar(proceso.id)).status).toBe(200);

    const antes = await releer(proceso.id);

    expect(
      (await guardarComoPlantilla(proceso.id, { destino: "actualizar" }))
        .status,
    ).toBe(200);

    const despues = await releer(proceso.id);
    expect(despues.etapas).toEqual(antes.etapas);
    expect(despues.proceso.tipoProcesoId).toBe(antes.proceso.tipoProcesoId);
    expect(despues.proceso.etapasCumplidas).toBe(1);
    expect(despues.proceso.etapaVigente).toBe(PLAN_DE_RESIDENCIA[1]);
  });

  it("NINGÚN otro proceso abierto del mismo tipo cambió", async () => {
    const origen = await procesoDeResidencia("Residencia de Marta Quintero");
    const vecino = await crearProceso({
      clienteId: otroClienteId,
      tipoProcesoId: tipoResidenciaId,
      titulo: "Residencia del socio de Inversiones del Istmo",
    });

    const vecinoAntes = await releer(vecino.id);

    // El plan del origen se cambia de arriba abajo y después se guarda.
    expect(
      (
        await guardarPlan(origen.id, [
          { id: null, nombre: "Un plan completamente distinto" },
          { id: null, nombre: "Con dos pasos y nada más" },
        ])
      ).status,
    ).toBe(200);
    expect(
      (await guardarComoPlantilla(origen.id, { destino: "actualizar" }))
        .status,
    ).toBe(200);

    const vecinoDespues = await releer(vecino.id);
    expect(vecinoDespues.etapas).toEqual(vecinoAntes.etapas);
    expect(await nombresDelPlan(vecino.id)).toEqual([...PLAN_DE_RESIDENCIA]);
  });

  it("un proceso abierto DESPUÉS sí nace con la plantilla nueva", async () => {
    const origen = await procesoDeResidencia();
    expect(
      (
        await guardarPlan(origen.id, [
          { id: null, nombre: "Un plan completamente distinto" },
          { id: null, nombre: "Con dos pasos y nada más" },
        ])
      ).status,
    ).toBe(200);
    expect(
      (await guardarComoPlantilla(origen.id, { destino: "actualizar" }))
        .status,
    ).toBe(200);

    const nuevo = await crearProceso({
      clienteId: otroClienteId,
      tipoProcesoId: tipoResidenciaId,
      titulo: "Residencia abierta después de guardar la plantilla",
    });

    expect(await nombresDelPlan(nuevo.id)).toEqual([
      "Un plan completamente distinto",
      "Con dos pasos y nada más",
    ]);
  });
});

describe("guardar el plan como un TIPO DE PROCESO NUEVO", () => {
  it("crea el tipo en el área pedida, vigente, con el plan como plantilla", async () => {
    const proceso = await procesoDeResidencia();
    expect((await avanzar(proceso.id)).status).toBe(200);

    const respuesta = await guardarComoPlantilla(proceso.id, {
      destino: "nuevo",
      areaId,
      nombre: "Residencia permanente por matrimonio, trámite acelerado",
      descripcion: "La variante con cita previa en Migración.",
    });

    expect(respuesta.status).toBe(201);
    const cuerpo = (await respuesta.json()) as PlantillaGuardadaEnElCable;
    expect(respuesta.headers.get("location")).toBe(
      `/api/tipos-proceso/${cuerpo.tipo.id}`,
    );

    expect(cuerpo.tipo.areaId).toBe(areaId);
    expect(cuerpo.tipo.nombre).toBe(
      "Residencia permanente por matrimonio, trámite acelerado",
    );
    expect(cuerpo.tipo.descripcion).toBe(
      "La variante con cita previa en Migración.",
    );
    expect(cuerpo.tipo.activo).toBe(true);
    expect(cuerpo.tipo.id).not.toBe(tipoResidenciaId);

    // Releído por la API de catálogos, que es la prueba de que quedó escrito.
    expect(
      (await plantillaCompletaDe(cuerpo.tipo.id)).map((e) => e.nombre),
    ).toEqual([...PLAN_DE_RESIDENCIA]);
  });

  it("DECISIÓN DE T-11: el proceso de origen sigue apuntando a su tipo viejo", async () => {
    const proceso = await procesoDeResidencia();
    const antes = await releer(proceso.id);

    const respuesta = await guardarComoPlantilla(proceso.id, {
      destino: "nuevo",
      areaId,
      nombre: "Residencia permanente por matrimonio, trámite acelerado",
    });
    expect(respuesta.status).toBe(201);
    const creado = (await respuesta.json()) as PlantillaGuardadaEnElCable;

    const despues = await releer(proceso.id);
    expect(despues.proceso.tipoProcesoId).toBe(tipoResidenciaId);
    expect(despues.proceso.tipoProcesoId).not.toBe(creado.tipo.id);
    expect(despues.etapas).toEqual(antes.etapas);
  });

  it("no toca la plantilla del tipo viejo", async () => {
    const proceso = await procesoDeResidencia();
    const actual = (await releer(proceso.id)).etapas;
    expect(
      (
        await guardarPlan(
          proceso.id,
          actual.slice(0, 1).map((e) => ({ id: e.id, nombre: e.nombre })),
        )
      ).status,
    ).toBe(200);

    expect(
      (
        await guardarComoPlantilla(proceso.id, {
          destino: "nuevo",
          areaId,
          nombre: "Residencia express",
        })
      ).status,
    ).toBe(201);

    expect(await plantillaDe(tipoResidenciaId)).toEqual([
      ...PLAN_DE_RESIDENCIA,
    ]);
  });

  it("el tipo nuevo aparece en el catálogo y sirve para abrir un proceso", async () => {
    const proceso = await procesoDeResidencia();
    const respuesta = await guardarComoPlantilla(proceso.id, {
      destino: "nuevo",
      areaId,
      nombre: "Residencia permanente, variante acelerada",
    });
    const creado = (await respuesta.json()) as PlantillaGuardadaEnElCable;

    const listado = await comoAutor(peticion("/api/tipos-proceso"));
    const tipos = ((await listado.json()) as { tipos: TipoEnElCable[] }).tipos;
    expect(tipos.map((t) => t.id)).toContain(creado.tipo.id);

    const abierto = await crearProceso({
      clienteId: otroClienteId,
      tipoProcesoId: creado.tipo.id,
      titulo: "Residencia acelerada de un cliente nuevo",
    });
    expect(await nombresDelPlan(abierto.id)).toEqual([...PLAN_DE_RESIDENCIA]);
  });

  it("recorta el nombre y la descripción del tipo nuevo", async () => {
    const proceso = await procesoDeResidencia();

    const respuesta = await guardarComoPlantilla(proceso.id, {
      destino: "nuevo",
      areaId,
      nombre: "  Residencia express  ",
      descripcion: "   ",
    });

    expect(respuesta.status).toBe(201);
    const cuerpo = (await respuesta.json()) as PlantillaGuardadaEnElCable;
    expect(cuerpo.tipo.nombre).toBe("Residencia express");
    expect(cuerpo.tipo.descripcion).toBeNull();
  });
});
