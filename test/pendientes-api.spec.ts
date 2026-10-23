/**
 * Los pendientes de un proceso (`odd/tasks/crm-procesos.md`, T-9).
 *
 * Un **pendiente es algo que sigue pasando**: «falta el documento X, pero el
 * proceso inicia» (`docs/diseno.md` §6, «Notas y pendientes»). Es la razón
 * por la que el bufete quiere este sistema, dicha por el usuario con esas
 * palabras, así que son esas las que se usan acá.
 *
 * Lo que distingue un pendiente de una nota, y lo que esta suite existe para
 * fijar como tres propiedades con prueba propia:
 *
 *  1. **No bloquea el avance de etapa.** Es la otra mitad del ejemplo: «pero
 *     el proceso inicia». Un proceso con pendientes abiertos avanza.
 *  2. **Sobrevive el cambio de etapa sin que nadie lo copie.** Nace en una
 *     etapa y sigue abierto y visible cuatro etapas después, con **una sola
 *     fila** en la tabla y su etapa de nacimiento intacta.
 *  3. **No se calla.** Mientras esté abierto aparece en la lista que la
 *     cabecera del proceso cuenta.
 *
 * Y las dos decisiones que T-9 tomó, probadas como rechazo y no como prosa:
 *
 *  - **Un pendiente cerrado no se reabre.** No hay ruta `reabrir`, y cerrar
 *    uno ya cerrado contesta 409. El esquema tiene **un solo** par
 *    `cerrado_en`/`cerrado_por`: reabrir sería ponerlos en nulo, o sea
 *    borrar la firma de quien cerró. Eso es exactamente lo que el proyecto
 *    no hace con `alcanzada_en` ni con una nota.
 *  - **La etapa donde nació un pendiente no se quita del plan**, esté el
 *    pendiente abierto o cerrado. `proceso_etapa_id` es `NOT NULL` y dice
 *    «donde nació»: quitarla obligaría a dejarlo huérfano, que la base no
 *    permite, o a reanclarlo, que es falsificar dónde nació.
 *
 * La disciplina de T-6, T-7 y T-8 se mantiene: **la guarda es el conteo
 * explícito, no un `catch` del error de la base.** Al aflojarla sale
 * `FOREIGN KEY constraint failed` crudo, que es lo que no le puede llegar a
 * nadie.
 */
import { env } from "cloudflare:workers";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { TENANT_UNICO_ID, nuevoId } from "../worker/db/ids";
import { manejar } from "../worker/index";
import type { ServicioDePendientes } from "../worker/pendientes/repositorio";
import type { ServicioDeProcesos } from "../worker/procesos/repositorio";

const DOMINIO_DE_ACCESS = "https://bufete-de-prueba.cloudflareaccess.com";
const AUD = "aud-de-la-aplicacion-del-bufete";

const EMAIL_AUTORA = "itzel.pendientes@bufete.test";
const EMAIL_SOCIO = "ricardo.pendientes@bufete.test";

const PLAN_DE_RESIDENCIA = [
  "Recepción y revisión de documentos",
  "Presentación ante el Servicio Nacional de Migración",
  "Entrevista y verificación domiciliaria",
  "Resolución y entrega del carné",
] as const;

/** El ejemplo real del bufete, textual. */
const FALTA_EL_DOCUMENTO =
  "Falta el certificado de matrimonio apostillado, pero el proceso inicia.";

interface PendienteEnElCable {
  id: string;
  procesoEtapaId: string;
  procesoEtapaNombre: string | null;
  texto: string;
  autorId: string;
  autorNombre: string | null;
  responsableId: string | null;
  responsableNombre: string | null;
  creadoEn: string;
  venceEn: string | null;
  cerradoEn: string | null;
  cerradoPor: string | null;
  cerradoPorNombre: string | null;
}

interface FallaEnElCable {
  campo: string;
  motivo: string;
  cuantos?: number;
}

/** El tenant vecino. Nace de cero en cada prueba, por la razón del `beforeEach`. */
let otroTenantId: string;

let autoraId: string;
let socioId: string;
let usuarioAjenoId: string;
let clienteId: string;
let clienteAjenoId: string;
let areaId: string;
let tipoResidenciaId: string;
let tipoSinPlantillaId: string;
let areaAjenaId: string;
let tipoAjenoId: string;
let procesoAjenoId: string;
let etapaAjenaId: string;
let pendienteAjenoId: string;

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

function comoAutora(request: Request): Promise<Response> {
  return manejar(request, entorno(), {
    correoDeDesarrollo: () => EMAIL_AUTORA,
  });
}

/** La segunda persona del bufete: autor y responsable no son la misma. */
function comoSocio(request: Request): Promise<Response> {
  return manejar(request, entorno(), {
    correoDeDesarrollo: () => EMAIL_SOCIO,
  });
}

function sinIdentidad(
  request: Request,
  espias: { pendientes?: ServicioDePendientes; procesos?: ServicioDeProcesos },
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
  const respuesta = await comoAutora(
    conCuerpo("/api/procesos", "POST", {
      clienteId,
      tipoProcesoId,
      titulo: "Residencia permanente de Marta Quintero",
    }),
  );
  expect(respuesta.status).toBe(201);
  return ((await respuesta.json()) as { proceso: { id: string } }).proceso.id;
}

function anotarPendiente(
  procesoId: string,
  cuerpo: unknown,
  quien: (request: Request) => Promise<Response> = comoAutora,
): Promise<Response> {
  return quien(
    conCuerpo(`/api/procesos/${procesoId}/pendientes`, "POST", cuerpo),
  );
}

function cerrar(
  procesoId: string,
  pendienteId: string,
  quien: (request: Request) => Promise<Response> = comoAutora,
): Promise<Response> {
  return quien(
    peticion(`/api/procesos/${procesoId}/pendientes/${pendienteId}/cerrar`, {
      method: "POST",
    }),
  );
}

/** Relee por la API: la única lectura que prueba algo. */
async function pendientesDe(procesoId: string): Promise<PendienteEnElCable[]> {
  const respuesta = await comoAutora(
    peticion(`/api/procesos/${procesoId}/pendientes`),
  );
  expect(respuesta.status).toBe(200);
  return ((await respuesta.json()) as { pendientes: PendienteEnElCable[] })
    .pendientes;
}

function abiertosDe(
  pendientes: readonly PendienteEnElCable[],
): PendienteEnElCable[] {
  return pendientes.filter((pendiente) => pendiente.cerradoEn === null);
}

/** Anota un pendiente y devuelve su identificador, releyendo la lista. */
async function unPendiente(
  procesoId: string,
  cuerpo: Record<string, unknown> = { texto: FALTA_EL_DOCUMENTO },
): Promise<string> {
  const respuesta = await anotarPendiente(procesoId, cuerpo);
  expect(respuesta.status).toBe(201);

  const { pendientes } = (await respuesta.json()) as {
    pendientes: PendienteEnElCable[];
  };
  const nuevo = pendientes.find(
    (pendiente) => pendiente.texto === cuerpo.texto,
  );
  expect(nuevo).toBeDefined();
  return nuevo?.id ?? "";
}

async function etapasDe(
  procesoId: string,
): Promise<{ id: string; nombre: string; alcanzadaEn: string | null }[]> {
  const respuesta = await comoAutora(peticion(`/api/procesos/${procesoId}`));
  expect(respuesta.status).toBe(200);
  return (
    (await respuesta.json()) as {
      etapas: { id: string; nombre: string; alcanzadaEn: string | null }[];
    }
  ).etapas;
}

function avanzar(procesoId: string): Promise<Response> {
  return comoAutora(
    peticion(`/api/procesos/${procesoId}/avanzar`, { method: "POST" }),
  );
}

function guardarPlan(
  procesoId: string,
  etapas: { id: string | null; nombre: string }[],
): Promise<Response> {
  return comoAutora(
    conCuerpo(`/api/procesos/${procesoId}/etapas`, "PUT", { etapas }),
  );
}

/** Cuántas filas de `pendiente` tiene el proceso, mirando por debajo de la API. */
async function cuantasFilas(procesoId: string): Promise<number> {
  const fila = await env.DB.prepare(
    "SELECT count(*) AS cuantas FROM pendiente WHERE proceso_id = ?",
  )
    .bind(procesoId)
    .first<{ cuantas: number }>();
  return fila?.cuantas ?? 0;
}

/**
 * **Esta suite no borra nada**, y es la advertencia que T-8 dejó escrita
 * para T-9: con una nota viva no se borra su etapa, ni su proceso, ni su
 * cliente, ni su autor, porque el disparador `nota_no_se_borra` no tiene
 * condición y las llaves foráneas quedaron en `NO ACTION`. Un pendiente no
 * tiene disparador, pero cuelga de las mismas filas.
 *
 * El aislamiento se consigue al revés: **identificadores nuevos en cada
 * prueba**, incluido el del tenant vecino, y toda afirmación de conteo
 * acotada a su proceso.
 */
beforeAll(async () => {
  autoraId = nuevoId();
  socioId = nuevoId();

  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO usuario (id, tenant_id, nombre, email, activo)" +
        " VALUES (?, ?, ?, ?, 1)",
    ).bind(autoraId, TENANT_UNICO_ID, "Itzel", EMAIL_AUTORA),
    env.DB.prepare(
      "INSERT INTO usuario (id, tenant_id, nombre, email, activo)" +
        " VALUES (?, ?, ?, ?, 1)",
    ).bind(socioId, TENANT_UNICO_ID, "Ricardo", EMAIL_SOCIO),
  ]);
});

beforeEach(async () => {
  otroTenantId = nuevoId();
  usuarioAjenoId = nuevoId();
  clienteId = nuevoId();
  clienteAjenoId = nuevoId();
  areaId = nuevoId();
  tipoResidenciaId = nuevoId();
  tipoSinPlantillaId = nuevoId();
  areaAjenaId = nuevoId();
  tipoAjenoId = nuevoId();
  procesoAjenoId = nuevoId();
  etapaAjenaId = nuevoId();
  pendienteAjenoId = nuevoId();

  await env.DB.batch([
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
      clienteId,
      TENANT_UNICO_ID,
      "Marta Quintero",
      "+507 6000-0000",
      autoraId,
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
      otroTenantId,
      "Cliente del vecino",
      "+507 6999-9999",
      usuarioAjenoId,
      new Date().toISOString(),
    ),
    env.DB.prepare(
      "INSERT INTO area (id, tenant_id, nombre, activo) VALUES (?, ?, ?, 1)",
    ).bind(areaAjenaId, otroTenantId, "Área del vecino"),
    env.DB.prepare(
      "INSERT INTO tipo_proceso (id, tenant_id, area_id, nombre, activo)" +
        " VALUES (?, ?, ?, ?, 1)",
    ).bind(tipoAjenoId, otroTenantId, areaAjenaId, "Tipo del vecino"),
    env.DB.prepare(
      "INSERT INTO proceso (id, tenant_id, cliente_id, tipo_proceso_id," +
        " origen, titulo, estado, abierto_en)" +
        " VALUES (?, ?, ?, ?, 'directo', ?, 'abierto', ?)",
    ).bind(
      procesoAjenoId,
      otroTenantId,
      clienteAjenoId,
      tipoAjenoId,
      "Proceso del vecino",
      new Date().toISOString(),
    ),
    env.DB.prepare(
      "INSERT INTO proceso_etapa (id, tenant_id, proceso_id, nombre, orden)" +
        " VALUES (?, ?, ?, ?, 0)",
    ).bind(etapaAjenaId, otroTenantId, procesoAjenoId, "Etapa del vecino"),
    env.DB.prepare(
      "INSERT INTO pendiente (id, tenant_id, proceso_id, proceso_etapa_id," +
        " texto, autor_id, creado_en) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).bind(
      pendienteAjenoId,
      otroTenantId,
      procesoAjenoId,
      etapaAjenaId,
      "Falta el poder del vecino",
      usuarioAjenoId,
      new Date().toISOString(),
    ),
  ]);

  const plantilla = await comoAutora(
    conCuerpo(`/api/tipos-proceso/${tipoResidenciaId}/etapas`, "PUT", {
      etapas: PLAN_DE_RESIDENCIA.map((nombre) => ({ nombre })),
    }),
  );
  expect(plantilla.status).toBe(200);
});

// ---------------------------------------------------------------------------
// Las tres propiedades que definen un pendiente
// ---------------------------------------------------------------------------

describe("PROPIEDAD 1 · un pendiente abierto NO bloquea el avance de etapa", () => {
  it("«falta el documento X, PERO EL PROCESO INICIA»", async () => {
    // Es la mitad del ejemplo del usuario, y la mitad que un sistema mal
    // hecho rompe: la lista de cabos sueltos no es una lista de requisitos.
    const procesoId = await crearProceso(tipoResidenciaId);
    await unPendiente(procesoId);

    const avance = await avanzar(procesoId);
    expect(avance.status).toBe(200);

    const etapas = await etapasDe(procesoId);
    expect(etapas[0].alcanzadaEn).not.toBeNull();

    // Y el pendiente sigue abierto: avanzar no lo resuelve ni lo cierra.
    expect(abiertosDe(await pendientesDe(procesoId))).toHaveLength(1);
  });

  it("tampoco bloquea cuando hay varios y ninguno está cerrado", async () => {
    const procesoId = await crearProceso(tipoResidenciaId);
    await unPendiente(procesoId, { texto: "Falta el apostillado" });
    await unPendiente(procesoId, { texto: "Falta la traducción oficial" });
    await unPendiente(procesoId, { texto: "Falta el pago de la tasa" });

    expect((await avanzar(procesoId)).status).toBe(200);
    expect((await avanzar(procesoId)).status).toBe(200);

    const etapas = await etapasDe(procesoId);
    expect(etapas.filter((etapa) => etapa.alcanzadaEn !== null)).toHaveLength(
      2,
    );
    expect(abiertosDe(await pendientesDe(procesoId))).toHaveLength(3);
  });
});

describe("PROPIEDAD 2 · un pendiente SOBREVIVE el cambio de etapa sin que nadie lo copie", () => {
  it("abierto en la etapa 1, sigue abierto y visible en la etapa 4", async () => {
    // El criterio textual de T-9. Lo que lo hace cierto es que la lectura
    // de pendientes filtra por PROCESO y no por etapa: al agregarle un
    // filtro de etapa a la consulta —la mutación obvia, copiada de cómo la
    // línea de tiempo agrupa las notas— esta prueba muere.
    const procesoId = await crearProceso(tipoResidenciaId);
    const etapasIniciales = await etapasDe(procesoId);
    const etapaDeNacimiento = etapasIniciales[0];

    const pendienteId = await unPendiente(procesoId);

    const nacido = (await pendientesDe(procesoId)).find(
      (pendiente) => pendiente.id === pendienteId,
    );
    expect(nacido?.procesoEtapaId).toBe(etapaDeNacimiento.id);

    // Tres avances: el proceso llega a la cuarta etapa.
    expect((await avanzar(procesoId)).status).toBe(200);
    expect((await avanzar(procesoId)).status).toBe(200);
    expect((await avanzar(procesoId)).status).toBe(200);

    const etapas = await etapasDe(procesoId);
    expect(etapas.filter((etapa) => etapa.alcanzadaEn !== null)).toHaveLength(
      3,
    );
    expect(etapas[3].alcanzadaEn).toBeNull();

    const despues = await pendientesDe(procesoId);
    const sobreviviente = despues.find(
      (pendiente) => pendiente.id === pendienteId,
    );

    expect(sobreviviente?.cerradoEn).toBeNull();
    expect(sobreviviente?.texto).toBe(FALTA_EL_DOCUMENTO);
    // Y sigue diciendo dónde NACIÓ, que no es donde está el proceso hoy.
    expect(sobreviviente?.procesoEtapaId).toBe(etapaDeNacimiento.id);
    expect(sobreviviente?.procesoEtapaNombre).toBe(PLAN_DE_RESIDENCIA[0]);
  });

  it("NADIE lo copia: hay una sola fila en la tabla después de tres avances", async () => {
    // «No se copia de etapa en etapa: sobrevive solo» (`docs/diseno.md` §6).
    // Sin esta aserción, una implementación que duplicara el pendiente en
    // cada etapa pasaría la prueba de arriba y rompería el modelo.
    const procesoId = await crearProceso(tipoResidenciaId);
    await unPendiente(procesoId);

    expect(await cuantasFilas(procesoId)).toBe(1);

    await avanzar(procesoId);
    await avanzar(procesoId);
    await avanzar(procesoId);

    expect(await cuantasFilas(procesoId)).toBe(1);
    expect(await pendientesDe(procesoId)).toHaveLength(1);
  });

  it("sobrevive también a que le REORDENEN y le AGREGUEN pasos al plan", async () => {
    const procesoId = await crearProceso(tipoResidenciaId);
    const pendienteId = await unPendiente(procesoId);
    const etapas = await etapasDe(procesoId);

    // Un plan reordenado entre pendientes, con un paso nuevo al final.
    const guardado = await guardarPlan(procesoId, [
      { id: etapas[0].id, nombre: etapas[0].nombre },
      { id: etapas[2].id, nombre: etapas[2].nombre },
      { id: etapas[1].id, nombre: etapas[1].nombre },
      { id: etapas[3].id, nombre: etapas[3].nombre },
      { id: null, nombre: "Seguimiento posterior a la entrega" },
    ]);
    expect(guardado.status).toBe(200);

    const despues = await pendientesDe(procesoId);
    expect(despues.find((pendiente) => pendiente.id === pendienteId)?.cerradoEn)
      .toBeNull();
    expect(await cuantasFilas(procesoId)).toBe(1);
  });
});

describe("PROPIEDAD 3 · mientras está abierto no se calla", () => {
  it("un pendiente abierto viaja en la lista que la cabecera cuenta", async () => {
    const procesoId = await crearProceso(tipoResidenciaId);
    await unPendiente(procesoId);

    expect(abiertosDe(await pendientesDe(procesoId))).toHaveLength(1);
  });

  it("deja de contar RECIÉN cuando alguien lo cierra", async () => {
    const procesoId = await crearProceso(tipoResidenciaId);
    const pendienteId = await unPendiente(procesoId);

    expect((await cerrar(procesoId, pendienteId)).status).toBe(200);

    const pendientes = await pendientesDe(procesoId);
    expect(abiertosDe(pendientes)).toHaveLength(0);
    // Pero no desaparece: el cabo suelto que se resolvió sigue siendo parte
    // de la historia del proceso.
    expect(pendientes).toHaveLength(1);
  });

  it("los abiertos vienen primero, y el que vence antes arriba", async () => {
    const procesoId = await crearProceso(tipoResidenciaId);
    const cerrado = await unPendiente(procesoId, { texto: "Ya resuelto" });
    expect((await cerrar(procesoId, cerrado)).status).toBe(200);

    await unPendiente(procesoId, { texto: "Sin fecha" });
    await unPendiente(procesoId, {
      texto: "Vence tarde",
      venceEn: "2026-12-31",
    });
    await unPendiente(procesoId, {
      texto: "Vence pronto",
      venceEn: "2026-11-02",
    });

    expect((await pendientesDe(procesoId)).map((p) => p.texto)).toEqual([
      "Vence pronto",
      "Vence tarde",
      "Sin fecha",
      "Ya resuelto",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Autor y responsable: dos personas distintas
// ---------------------------------------------------------------------------

describe("un pendiente lleva autor y responsable, y no son la misma persona", () => {
  it("el autor sale de la identidad de Access, y el responsable del cuerpo", async () => {
    const procesoId = await crearProceso(tipoResidenciaId);

    const respuesta = await anotarPendiente(procesoId, {
      texto: FALTA_EL_DOCUMENTO,
      responsableId: socioId,
    });
    expect(respuesta.status).toBe(201);

    const [pendiente] = await pendientesDe(procesoId);
    expect(pendiente.autorId).toBe(autoraId);
    expect(pendiente.autorNombre).toBe("Itzel");
    expect(pendiente.responsableId).toBe(socioId);
    expect(pendiente.responsableNombre).toBe("Ricardo");
    expect(pendiente.autorId).not.toBe(pendiente.responsableId);
  });

  it("el autor NO se puede mandar en el cuerpo (I-6)", async () => {
    const procesoId = await crearProceso(tipoResidenciaId);

    const respuesta = await anotarPendiente(
      procesoId,
      { texto: FALTA_EL_DOCUMENTO, autorId: socioId, creadoEn: "2020-01-01" },
      comoAutora,
    );
    expect(respuesta.status).toBe(201);

    const [pendiente] = await pendientesDe(procesoId);
    expect(pendiente.autorId).toBe(autoraId);
    expect(new Date(pendiente.creadoEn).getFullYear()).toBeGreaterThan(2020);
  });

  it("el responsable puede ser la misma persona que lo anotó", async () => {
    // «Lo vi yo y lo persigo yo» es el caso corriente, no una anomalía.
    const procesoId = await crearProceso(tipoResidenciaId);
    await anotarPendiente(procesoId, {
      texto: FALTA_EL_DOCUMENTO,
      responsableId: autoraId,
    });

    const [pendiente] = await pendientesDe(procesoId);
    expect(pendiente.responsableId).toBe(autoraId);
  });

  it("un pendiente SIN responsable se acepta y viaja en nulo", async () => {
    // El esquema lo deja nulo a propósito y §5 no lo lista como invariante:
    // exigirlo en la aplicación sería una regla sin respaldo en la base, que
    // es justo lo que `docs/diseno.md` §5 critica. Lo que sí hace T-9 es
    // mostrarlo distinto: un pendiente que nadie tiene es el que se pierde.
    const procesoId = await crearProceso(tipoResidenciaId);
    await unPendiente(procesoId);

    const [pendiente] = await pendientesDe(procesoId);
    expect(pendiente.responsableId).toBeNull();
    expect(pendiente.responsableNombre).toBeNull();
  });
});

describe("cerrar un pendiente registra quién y cuándo", () => {
  it("lo firma quien cerró, que puede no ser quien lo anotó", async () => {
    const procesoId = await crearProceso(tipoResidenciaId);
    const pendienteId = await unPendiente(procesoId);

    const antes = new Date().toISOString();
    expect((await cerrar(procesoId, pendienteId, comoSocio)).status).toBe(200);

    const [pendiente] = await pendientesDe(procesoId);
    expect(pendiente.cerradoPor).toBe(socioId);
    expect(pendiente.cerradoPorNombre).toBe("Ricardo");
    expect(pendiente.cerradoEn).not.toBeNull();
    // ISO en UTC ordena como texto, que es justo por qué el esquema lo
    // guarda así.
    expect((pendiente.cerradoEn ?? "") >= antes).toBe(true);
    // El `CHECK` del esquema exige que los dos vayan juntos.
    expect(pendiente.cerradoPor === null).toBe(pendiente.cerradoEn === null);
  });

  it("la respuesta de cerrar ya trae la lista releída", async () => {
    const procesoId = await crearProceso(tipoResidenciaId);
    const pendienteId = await unPendiente(procesoId);

    const respuesta = await cerrar(procesoId, pendienteId);
    const { pendientes } = (await respuesta.json()) as {
      pendientes: PendienteEnElCable[];
    };

    expect(pendientes[0].cerradoEn).not.toBeNull();
    // Y coincide con lo que contesta un `GET` aparte: no es una respuesta
    // optimista armada en memoria.
    expect(pendientes).toEqual(await pendientesDe(procesoId));
  });
});

// ---------------------------------------------------------------------------
// Decisión de T-9 (a): un pendiente cerrado NO se reabre
// ---------------------------------------------------------------------------

describe("un pendiente cerrado no se reabre", () => {
  it("cerrar uno ya cerrado contesta 409 y no reescribe la firma", async () => {
    const procesoId = await crearProceso(tipoResidenciaId);
    const pendienteId = await unPendiente(procesoId);

    expect((await cerrar(procesoId, pendienteId, comoAutora)).status).toBe(200);
    const [primero] = await pendientesDe(procesoId);

    const segunda = await cerrar(procesoId, pendienteId, comoSocio);
    expect(segunda.status).toBe(409);
    expect((await segunda.json()) as { error: string }).toEqual({
      error: "pendiente_ya_cerrado",
    });

    // Lo importante no es el código: es que el segundo intento no haya
    // puesto a Ricardo como quien cerró lo que cerró Itzel.
    const [despues] = await pendientesDe(procesoId);
    expect(despues.cerradoPor).toBe(primero.cerradoPor);
    expect(despues.cerradoEn).toBe(primero.cerradoEn);
  });

  it("no existe la ruta `reabrir`: la decisión es la AUSENCIA del camino", async () => {
    const procesoId = await crearProceso(tipoResidenciaId);
    const pendienteId = await unPendiente(procesoId);
    await cerrar(procesoId, pendienteId);

    const respuesta = await comoAutora(
      peticion(
        `/api/procesos/${procesoId}/pendientes/${pendienteId}/reabrir`,
        { method: "POST" },
      ),
    );
    expect(respuesta.status).toBe(404);
  });

  it("un pendiente no tiene dirección propia que se pueda editar ni borrar", async () => {
    const procesoId = await crearProceso(tipoResidenciaId);
    const pendienteId = await unPendiente(procesoId);

    for (const metodo of ["GET", "PUT", "PATCH", "DELETE"]) {
      const respuesta = await comoAutora(
        peticion(`/api/procesos/${procesoId}/pendientes/${pendienteId}`, {
          method: metodo,
        }),
      );
      expect(respuesta.status).toBe(404);
    }
  });

  it("la colección solo admite leer y anotar", async () => {
    const procesoId = await crearProceso(tipoResidenciaId);

    for (const metodo of ["PUT", "PATCH", "DELETE"]) {
      const respuesta = await comoAutora(
        peticion(`/api/procesos/${procesoId}/pendientes`, { method: metodo }),
      );
      expect(respuesta.status).toBe(405);
      expect(respuesta.headers.get("allow")).toBe("GET, POST");
    }
  });
});

// ---------------------------------------------------------------------------
// Decisión de T-9 (b): la etapa donde nació un pendiente no se quita
// ---------------------------------------------------------------------------

describe("no se quita del plan la etapa donde nació un pendiente", () => {
  it("rechaza con 422 y dice CUÁNTOS lo impiden, sin tocar el plan", async () => {
    const procesoId = await crearProceso(tipoResidenciaId);
    await unPendiente(procesoId, { texto: "Falta el apostillado" });
    await unPendiente(procesoId, { texto: "Falta la traducción" });

    const etapas = await etapasDe(procesoId);
    // La etapa 1 es donde nacieron los dos: se intenta sacarla del plan.
    const respuesta = await guardarPlan(
      procesoId,
      etapas.slice(1).map((etapa) => ({ id: etapa.id, nombre: etapa.nombre })),
    );

    expect(respuesta.status).toBe(422);
    const fallas = await fallasDe(respuesta);
    expect(fallas).toHaveLength(1);
    expect(fallas[0].motivo).toBe("etapa_con_pendientes_no_se_quita");
    expect(fallas[0].cuantos).toBe(2);

    // El plan quedó entero: el rechazo es antes de escribir, no un rollback.
    expect(await etapasDe(procesoId)).toHaveLength(4);
  });

  it("también lo rechaza cuando el pendiente ya está CERRADO", async () => {
    // Acá está la decisión, y es deliberada: lo que impide quitar la etapa
    // no es que el pendiente esté abierto, sino que `proceso_etapa_id` dice
    // DÓNDE NACIÓ y eso es un hecho. Un pendiente cerrado sigue siendo el
    // registro de un cabo suelto que existió en ese paso del plan.
    const procesoId = await crearProceso(tipoResidenciaId);
    const pendienteId = await unPendiente(procesoId);
    expect((await cerrar(procesoId, pendienteId)).status).toBe(200);

    const etapas = await etapasDe(procesoId);
    const respuesta = await guardarPlan(
      procesoId,
      etapas.slice(1).map((etapa) => ({ id: etapa.id, nombre: etapa.nombre })),
    );

    expect(respuesta.status).toBe(422);
    expect(await motivosDe(respuesta)).toEqual([
      "etapa_con_pendientes_no_se_quita",
    ]);
  });

  it("CONTRAPESO: una etapa pendiente sin pendientes sí se quita", async () => {
    // Sin esto, una guarda que congelara el plan entero pasaría por correcta.
    const procesoId = await crearProceso(tipoResidenciaId);
    await unPendiente(procesoId);

    const etapas = await etapasDe(procesoId);
    const respuesta = await guardarPlan(
      procesoId,
      etapas
        .filter((etapa) => etapa.id !== etapas[2].id)
        .map((etapa) => ({ id: etapa.id, nombre: etapa.nombre })),
    );

    expect(respuesta.status).toBe(200);
    expect(await etapasDe(procesoId)).toHaveLength(3);
  });

  it("CONTRAPESO: renombrar la etapa donde nació sí se permite", async () => {
    // Los nombres de etapa son texto de cara al cliente (`docs/diseno.md`
    // §6): corregir una errata no borra dónde nació nada.
    const procesoId = await crearProceso(tipoResidenciaId);
    await unPendiente(procesoId);

    const etapas = await etapasDe(procesoId);
    const respuesta = await guardarPlan(
      procesoId,
      etapas.map((etapa, indice) => ({
        id: etapa.id,
        nombre: indice === 0 ? "Recepción y revisión de documentos" : etapa.nombre,
      })),
    );

    expect(respuesta.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Rechazos
// ---------------------------------------------------------------------------

describe("rechazos del alta", () => {
  it("rechaza un pendiente sin texto", async () => {
    const procesoId = await crearProceso(tipoResidenciaId);
    const respuesta = await anotarPendiente(procesoId, {});

    expect(respuesta.status).toBe(422);
    expect(await motivosDe(respuesta)).toEqual(["texto_requerido"]);
    expect(await cuantasFilas(procesoId)).toBe(0);
  });

  it("rechaza un pendiente con el texto en blanco", async () => {
    const procesoId = await crearProceso(tipoResidenciaId);
    const respuesta = await anotarPendiente(procesoId, { texto: "  \n\t " });

    expect(respuesta.status).toBe(422);
    expect(await motivosDe(respuesta)).toEqual(["texto_requerido"]);
    expect(await cuantasFilas(procesoId)).toBe(0);
  });

  it("rechaza un responsable que no existe", async () => {
    const procesoId = await crearProceso(tipoResidenciaId);
    const respuesta = await anotarPendiente(procesoId, {
      texto: FALTA_EL_DOCUMENTO,
      responsableId: nuevoId(),
    });

    expect(respuesta.status).toBe(422);
    expect(await motivosDe(respuesta)).toEqual(["responsable_desconocido"]);
    expect(await cuantasFilas(procesoId)).toBe(0);
  });

  it("rechaza un responsable del bufete VECINO", async () => {
    // Un UUID ajeno sigue siendo un UUID: lo que lo rechaza es el filtro de
    // tenencia de la consulta, no la forma del identificador.
    const procesoId = await crearProceso(tipoResidenciaId);
    const respuesta = await anotarPendiente(procesoId, {
      texto: FALTA_EL_DOCUMENTO,
      responsableId: usuarioAjenoId,
    });

    expect(respuesta.status).toBe(422);
    expect(await motivosDe(respuesta)).toEqual(["responsable_desconocido"]);
    expect(await cuantasFilas(procesoId)).toBe(0);
  });

  it("rechaza un vencimiento que no es una fecha", async () => {
    const procesoId = await crearProceso(tipoResidenciaId);

    for (const venceEn of ["mañana", "2026-13-01", "2026-02-31", "31/12/2026"]) {
      const respuesta = await anotarPendiente(procesoId, {
        texto: FALTA_EL_DOCUMENTO,
        venceEn,
      });
      expect(respuesta.status).toBe(422);
      expect(await motivosDe(respuesta)).toEqual(["vencimiento_invalido"]);
    }

    expect(await cuantasFilas(procesoId)).toBe(0);
  });

  it("rechaza anotar en un proceso que todavía no tiene plan", async () => {
    // `pendiente.proceso_etapa_id` es `NOT NULL`: no hay de dónde colgarlo.
    // El servidor no inventa una etapa, igual que en T-8.
    const procesoId = await crearProceso(tipoSinPlantillaId);
    expect(await etapasDe(procesoId)).toHaveLength(0);

    const respuesta = await anotarPendiente(procesoId, {
      texto: FALTA_EL_DOCUMENTO,
    });

    expect(respuesta.status).toBe(422);
    expect(await motivosDe(respuesta)).toEqual(["proceso_sin_etapas"]);
  });

  it("rechaza un cuerpo que no se puede leer", async () => {
    const procesoId = await crearProceso(tipoResidenciaId);
    const respuesta = await comoAutora(
      peticion(`/api/procesos/${procesoId}/pendientes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{no es json",
      }),
    );

    expect(respuesta.status).toBe(400);
  });
});

describe("rechazos por tenencia", () => {
  it("anotar en un proceso del bufete vecino contesta 404", async () => {
    // 404 y no 403, igual que T-5, T-6, T-7 y T-8: un 403 confirmaría que
    // ese identificador existe.
    const respuesta = await anotarPendiente(procesoAjenoId, {
      texto: FALTA_EL_DOCUMENTO,
    });

    expect(respuesta.status).toBe(404);
    expect(await cuantasFilas(procesoAjenoId)).toBe(1);
  });

  it("leer los pendientes de un proceso ajeno contesta 404", async () => {
    const respuesta = await comoAutora(
      peticion(`/api/procesos/${procesoAjenoId}/pendientes`),
    );

    expect(respuesta.status).toBe(404);
  });

  it("la existencia del proceso manda sobre la validación del cuerpo", async () => {
    // Si no, un cuerpo inválido contra un id ajeno contestaría 422, y ese
    // 422 ya confirma que el id existe. Decisión de T-5.
    const respuesta = await anotarPendiente(procesoAjenoId, { texto: "" });
    expect(respuesta.status).toBe(404);
  });

  it("cerrar un pendiente del bufete vecino contesta 404", async () => {
    const respuesta = await cerrar(procesoAjenoId, pendienteAjenoId);

    expect(respuesta.status).toBe(404);

    const fila = await env.DB.prepare(
      "SELECT cerrado_en FROM pendiente WHERE id = ?",
    )
      .bind(pendienteAjenoId)
      .first<{ cerrado_en: string | null }>();
    expect(fila?.cerrado_en).toBeNull();
  });

  it("cerrar un pendiente ajeno desde un proceso PROPIO contesta 404", async () => {
    // El identificador del pendiente existe; lo que no existe es su
    // pertenencia a este proceso. La consulta filtra por los tres.
    const procesoId = await crearProceso(tipoResidenciaId);
    const respuesta = await cerrar(procesoId, pendienteAjenoId);

    expect(respuesta.status).toBe(404);
  });

  it("cerrar un pendiente que no existe contesta 404", async () => {
    const procesoId = await crearProceso(tipoResidenciaId);
    expect((await cerrar(procesoId, nuevoId())).status).toBe(404);
  });
});

describe("la puerta de Access protege todas las rutas de pendientes", () => {
  function espia(): { servicio: ServicioDePendientes; tocado: () => boolean } {
    let tocado = false;
    const marcar = () => {
      tocado = true;
    };

    return {
      tocado: () => tocado,
      servicio: {
        listar: () => {
          marcar();
          return Promise.resolve([]);
        },
        crear: () => {
          marcar();
          return Promise.resolve({ estado: "no_encontrado" as const });
        },
        cerrar: () => {
          marcar();
          return Promise.resolve({ estado: "no_encontrado" as const });
        },
      },
    };
  }

  it.each([
    ["GET", "/pendientes", undefined],
    ["POST", "/pendientes", { texto: FALTA_EL_DOCUMENTO }],
    ["POST", "/pendientes/cualquiera/cerrar", undefined],
  ])("%s %s no llega al dominio", async (metodo, cola, cuerpo) => {
    const { servicio, tocado } = espia();
    const procesos: ServicioDeProcesos = {
      listar: () => Promise.resolve([]),
      obtener: () => Promise.resolve(null),
      crear: () => Promise.resolve({ estado: "no_encontrado" }),
      reemplazarEtapas: () => Promise.resolve({ estado: "no_encontrado" }),
      avanzar: () => Promise.resolve({ estado: "no_encontrado" }),
    };

    const ruta = `/api/procesos/${nuevoId()}${cola}`;
    const request =
      cuerpo === undefined
        ? peticion(ruta, { method: metodo })
        : conCuerpo(ruta, metodo, cuerpo);

    const respuesta = await sinIdentidad(request, {
      pendientes: servicio,
      procesos,
    });

    expect(respuesta.status).toBe(403);
    expect(tocado()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// El vencimiento
// ---------------------------------------------------------------------------

describe("el vencimiento es una fecha, y vuelve siendo la misma fecha", () => {
  it("guarda y relee `venceEn` sin corrimiento de un día", async () => {
    // `pendiente.vence_en` es un instante con `CHECK` en el esquema, y lo
    // que el bufete pone es un DÍA. La conversión es del repositorio, así
    // que lo único que se puede probar de verdad es el ida y vuelta.
    const procesoId = await crearProceso(tipoResidenciaId);
    await anotarPendiente(procesoId, {
      texto: FALTA_EL_DOCUMENTO,
      venceEn: "2026-11-30",
    });

    const [pendiente] = await pendientesDe(procesoId);
    expect(pendiente.venceEn).toBe("2026-11-30");
  });

  it("un pendiente sin vencimiento viaja en nulo", async () => {
    const procesoId = await crearProceso(tipoResidenciaId);
    await unPendiente(procesoId);

    expect((await pendientesDe(procesoId))[0].venceEn).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Lo que un pendiente NO es
// ---------------------------------------------------------------------------

describe("un pendiente no es una nota", () => {
  it("no aparece en la línea de tiempo, ni la nota en los pendientes", async () => {
    // Son dos objetos distintos y la diferencia es la razón de ser de esta
    // parte del sistema (`docs/diseno.md` §6).
    const procesoId = await crearProceso(tipoResidenciaId);
    await unPendiente(procesoId);

    const nota = await comoAutora(
      conCuerpo(`/api/procesos/${procesoId}/notas`, "POST", {
        texto: "El cliente quiere pago diferido por meses.",
      }),
    );
    expect(nota.status).toBe(201);

    const linea = (await nota.json()) as {
      tramos: { notas: { texto: string }[] }[];
    };
    const textos = linea.tramos.flatMap((tramo) =>
      tramo.notas.map((suya) => suya.texto),
    );
    expect(textos).not.toContain(FALTA_EL_DOCUMENTO);

    const pendientes = await pendientesDe(procesoId);
    expect(pendientes.map((p) => p.texto)).toEqual([FALTA_EL_DOCUMENTO]);
  });
});
