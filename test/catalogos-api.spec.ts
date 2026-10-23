/**
 * La API de los catálogos del bufete (`odd/tasks/crm-procesos.md`, T-6):
 * `area`, `tipo_proceso`, `etapa_plantilla` y `tipo_cliente`.
 *
 * Son datos del bufete, no configuración de desarrollador: se crean, se
 * editan y se borran desde la aplicación (`docs/diseno.md` §6, «Las
 * plantillas son del bufete, no del sistema»). `tipo_cliente` entra acá
 * porque T-5 lo dejó sin forma de poblarse: la migración no siembra filas y
 * sin pantalla el desplegable de tipo de cliente sale vacío para siempre.
 *
 * Tres clases de prueba, y las tres hacen falta:
 *
 *  - **Rechazos.** La petición inválida concreta y la afirmación de que no
 *    entra: sin nombre, con un padre de otro tenant, leyendo o editando algo
 *    ajeno, borrando lo que tiene dependientes, y sin identidad de Access.
 *  - **Contrapesos que releen.** Nada se da por guardado mirando el eco del
 *    `POST`: se vuelve a leer por la API, que es la única lectura que prueba
 *    que la fila existe.
 *  - **Orden.** Una secuencia de reordenamientos de la plantilla tiene que
 *    dejar el orden correcto Y releerse en ese orden. `orden` no lleva índice
 *    único a propósito (T-2), así que el orden correcto es responsabilidad de
 *    este código y nadie más lo está sosteniendo.
 *
 * La política de borrado que estas pruebas fijan: **se da de baja, no se
 * borra**. `DELETE` existe y funciona mientras no haya dependientes; con
 * dependientes contesta 409 diciendo qué lo impide y cuántos son, nunca un
 * 500 ni un error de SQL crudo. Dar de baja (`activo = 0`) saca la fila de lo
 * elegible sin invalidar lo ya guardado, que es la misma distinción entre
 * *válido* y *seleccionable* que estableció T-5.
 */
import { env } from "cloudflare:workers";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { ServicioDeCatalogos } from "../worker/catalogos/repositorio";
import { TENANT_UNICO_ID, nuevoId } from "../worker/db/ids";
import { manejar } from "../worker/index";

const DOMINIO_DE_ACCESS = "https://bufete-de-prueba.cloudflareaccess.com";
const AUD = "aud-de-la-aplicacion-del-bufete";

const EMAIL_AUTOR = "itzel@bufete.test";

/** El tenant vecino. Existe solo para que la fuga sea expresable. */
const OTRO_TENANT_ID = "0a5a6e0a-9f1e-4a6e-9f03-3b6a2a0e1d77";

/**
 * Las formas en el cable se declaran acá y no se importan del contrato del
 * Worker, por la misma razón que en `clientes-api.spec.ts`: lo que esta suite
 * vigila es el JSON que ve el navegador. Importando el tipo, renombrar un
 * campo en el servidor renombraría también la expectativa.
 */
interface AreaEnElCable {
  id: string;
  nombre: string;
  activo: boolean;
}

interface TipoProcesoEnElCable {
  id: string;
  areaId: string;
  areaNombre: string | null;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
}

interface EtapaEnElCable {
  id: string;
  nombre: string;
  orden: number;
}

interface FallaEnElCable {
  campo: string;
  motivo: string;
}

interface BloqueoEnElCable {
  error: string;
  entidad: string;
  dependencias: { entidad: string; cuantos: number }[];
}

let autorId: string;
let areaMigracionId: string;
let areaAjenaId: string;
let tipoAjenoId: string;
let tipoClienteAjenoId: string;

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
  catalogos: ServicioDeCatalogos,
): Promise<Response> {
  return manejar(request, entorno(), {
    correoDeDesarrollo: () => null,
    catalogos,
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

async function crearArea(nombre: string): Promise<AreaEnElCable> {
  const respuesta = await comoAutor(
    conCuerpo("/api/areas", "POST", { nombre }),
  );
  expect(respuesta.status).toBe(201);
  return ((await respuesta.json()) as { area: AreaEnElCable }).area;
}

async function crearTipoProceso(
  areaId: string,
  nombre: string,
): Promise<TipoProcesoEnElCable> {
  const respuesta = await comoAutor(
    conCuerpo("/api/tipos-proceso", "POST", { areaId, nombre }),
  );
  expect(respuesta.status).toBe(201);
  return ((await respuesta.json()) as { tipo: TipoProcesoEnElCable }).tipo;
}

async function crearTipoCliente(nombre: string): Promise<AreaEnElCable> {
  const respuesta = await comoAutor(
    conCuerpo("/api/tipos-cliente", "POST", { nombre }),
  );
  expect(respuesta.status).toBe(201);
  return ((await respuesta.json()) as { tipo: AreaEnElCable }).tipo;
}

/** Relee la plantilla por la API: la única lectura que prueba el orden. */
async function releerEtapas(tipoId: string): Promise<EtapaEnElCable[]> {
  const respuesta = await comoAutor(
    peticion(`/api/tipos-proceso/${tipoId}/etapas`),
  );
  expect(respuesta.status).toBe(200);
  return ((await respuesta.json()) as { etapas: EtapaEnElCable[] }).etapas;
}

async function guardarEtapas(
  tipoId: string,
  etapas: { id?: string | null; nombre: string }[],
): Promise<Response> {
  return comoAutor(
    conCuerpo(`/api/tipos-proceso/${tipoId}/etapas`, "PUT", { etapas }),
  );
}

/**
 * La persona del bufete se crea **una sola vez**: desde T-10, con una
 * entrada de bitácora viva su fila no se puede borrar, y el índice
 * `UNIQUE (tenant_id, email)` de T-2 impediría volver a insertarla.
 */
beforeAll(async () => {
  autorId = nuevoId();

  await env.DB.prepare(
    "INSERT INTO usuario (id, tenant_id, nombre, email, activo)" +
      " VALUES (?, ?, ?, ?, 1)",
  )
    .bind(autorId, TENANT_UNICO_ID, "Itzel", EMAIL_AUTOR)
    .run();
});

beforeEach(async () => {
  // El almacenamiento está aislado por archivo, no por prueba.
  await env.DB.prepare("DELETE FROM proceso_etapa").run();
  await env.DB.prepare("DELETE FROM proceso").run();
  await env.DB.prepare("DELETE FROM etapa_plantilla").run();
  await env.DB.prepare("DELETE FROM tipo_proceso").run();
  await env.DB.prepare("DELETE FROM area").run();
  await env.DB.prepare("DELETE FROM cliente").run();
  await env.DB.prepare("DELETE FROM tipo_cliente").run();
  // **Las personas del bufete NO se borran.** Desde T-10 toda escritura deja
  // una entrada de `bitacora`, `bitacora.usuario_id` es una llave foránea en
  // `NO ACTION` (I-6) y una entrada no se borra nunca por sus disparadores,
  // así que con una entrada viva su autor tampoco se borra. Es la misma
  // consecuencia que T-8 descubrió con `nota`, ahora sobre todo lo demás.
  //
  // Se borran solo las del tenant vecino, que no escriben nada por la API.
  // Las dos del bufete se crean una vez en el `beforeAll`.
  await env.DB.prepare("DELETE FROM usuario WHERE tenant_id <> ?")
    .bind(TENANT_UNICO_ID)
    .run();
  await env.DB.prepare("DELETE FROM tenant WHERE id <> ?")
    .bind(TENANT_UNICO_ID)
    .run();

  areaMigracionId = nuevoId();
  areaAjenaId = nuevoId();
  tipoAjenoId = nuevoId();
  tipoClienteAjenoId = nuevoId();
  const autorAjenoId = nuevoId();

  await env.DB.batch([
    env.DB.prepare("INSERT INTO tenant (id, nombre) VALUES (?, ?)").bind(
      OTRO_TENANT_ID,
      "Otro bufete",
    ),
    env.DB.prepare(
      "INSERT INTO usuario (id, tenant_id, nombre, email, activo)" +
        " VALUES (?, ?, ?, ?, 1)",
    ).bind(autorAjenoId, OTRO_TENANT_ID, "Ajena", "ajena@otro-bufete.test"),
    env.DB.prepare(
      "INSERT INTO area (id, tenant_id, nombre, activo) VALUES (?, ?, ?, 1)",
    ).bind(areaMigracionId, TENANT_UNICO_ID, "Migración"),

    // Lo del vecino: el objeto de todas las pruebas de fuga.
    env.DB.prepare(
      "INSERT INTO area (id, tenant_id, nombre, activo) VALUES (?, ?, ?, 1)",
    ).bind(areaAjenaId, OTRO_TENANT_ID, "Área del vecino"),
    env.DB.prepare(
      "INSERT INTO tipo_proceso (id, tenant_id, area_id, nombre, activo)" +
        " VALUES (?, ?, ?, ?, 1)",
    ).bind(tipoAjenoId, OTRO_TENANT_ID, areaAjenaId, "Tipo del vecino"),
    env.DB.prepare(
      "INSERT INTO etapa_plantilla (id, tenant_id, tipo_proceso_id, nombre," +
        " orden) VALUES (?, ?, ?, ?, 0)",
    ).bind(nuevoId(), OTRO_TENANT_ID, tipoAjenoId, "Etapa del vecino"),
    env.DB.prepare(
      "INSERT INTO tipo_cliente (id, tenant_id, nombre, activo)" +
        " VALUES (?, ?, ?, 1)",
    ).bind(tipoClienteAjenoId, OTRO_TENANT_ID, "Tipo de cliente del vecino"),
  ]);
});

// ---------------------------------------------------------------------------
// Rechazos: el nombre
// ---------------------------------------------------------------------------

describe("ninguno de los cuatro catálogos entra sin nombre", () => {
  it("rechaza un área sin nombre", async () => {
    const respuesta = await comoAutor(conCuerpo("/api/areas", "POST", {}));

    expect(respuesta.status).toBe(422);
    expect(await fallasDe(respuesta)).toContain("nombre_requerido");

    const listado = await comoAutor(peticion("/api/areas"));
    const cuerpo = (await listado.json()) as { areas: AreaEnElCable[] };
    expect(cuerpo.areas.map((a) => a.nombre), "no se guardó nada").toEqual([
      "Migración",
    ]);
  });

  it("rechaza un área cuyo nombre es solo espacios", async () => {
    const respuesta = await comoAutor(
      conCuerpo("/api/areas", "POST", { nombre: "  \t " }),
    );

    expect(respuesta.status).toBe(422);
    expect(await fallasDe(respuesta)).toContain("nombre_requerido");
  });

  it("rechaza un tipo de proceso sin nombre", async () => {
    const respuesta = await comoAutor(
      conCuerpo("/api/tipos-proceso", "POST", { areaId: areaMigracionId }),
    );

    expect(respuesta.status).toBe(422);
    expect(await fallasDe(respuesta)).toContain("nombre_requerido");
  });

  it("rechaza un tipo de cliente sin nombre", async () => {
    const respuesta = await comoAutor(
      conCuerpo("/api/tipos-cliente", "POST", { nombre: "   " }),
    );

    expect(respuesta.status).toBe(422);
    expect(await fallasDe(respuesta)).toContain("nombre_requerido");
  });

  it("rechaza una plantilla con una etapa sin nombre", async () => {
    const tipo = await crearTipoProceso(areaMigracionId, "Visa de trabajo");
    expect(await guardarEtapas(tipo.id, [{ nombre: "Recepción" }])).toHaveProperty(
      "status",
      200,
    );

    const respuesta = await guardarEtapas(tipo.id, [
      { nombre: "Recepción" },
      { nombre: "   " },
    ]);

    expect(respuesta.status).toBe(422);
    expect(await fallasDe(respuesta)).toContain("nombre_requerido");

    // Y la plantilla anterior sigue entera: un rechazo parcial que hubiera
    // borrado las etapas viejas sería peor que el error.
    expect((await releerEtapas(tipo.id)).map((e) => e.nombre)).toEqual([
      "Recepción",
    ]);
  });

  it("rechaza un nombre que no es texto", async () => {
    const respuesta = await comoAutor(
      conCuerpo("/api/areas", "POST", { nombre: { nombre: "Familia" } }),
    );

    expect(respuesta.status).toBe(422);
    expect(await fallasDe(respuesta)).toContain("tipo_invalido");
  });

  it("rechaza un cuerpo que no es JSON", async () => {
    const respuesta = await comoAutor(
      peticion("/api/areas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{ esto no es json",
      }),
    );

    expect(respuesta.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Rechazos: el padre
// ---------------------------------------------------------------------------

describe("un tipo de proceso cuelga de un área real de este tenant", () => {
  it("rechaza un tipo de proceso sin área", async () => {
    const respuesta = await comoAutor(
      conCuerpo("/api/tipos-proceso", "POST", { nombre: "Visa de trabajo" }),
    );

    expect(respuesta.status).toBe(422);
    expect(await fallasDe(respuesta)).toContain("area_requerida");
  });

  it("rechaza un tipo de proceso con un `area_id` que no existe", async () => {
    const respuesta = await comoAutor(
      conCuerpo("/api/tipos-proceso", "POST", {
        areaId: nuevoId(),
        nombre: "Visa de trabajo",
      }),
    );

    expect(respuesta.status).toBe(422);
    expect(await fallasDe(respuesta)).toContain("area_desconocida");
  });

  it("rechaza un tipo de proceso con un área que existe, pero en otro tenant", async () => {
    // El `area_id` existe en la tabla: lo que falla es I-8. Sin el filtro por
    // `tenant_id` en la consulta del área, esto pasaría.
    const respuesta = await comoAutor(
      conCuerpo("/api/tipos-proceso", "POST", {
        areaId: areaAjenaId,
        nombre: "Visa de trabajo",
      }),
    );

    expect(respuesta.status).toBe(422);
    expect(await fallasDe(respuesta)).toContain("area_desconocida");

    const cuenta = await env.DB.prepare(
      "SELECT count(*) AS n FROM tipo_proceso WHERE tenant_id = ?",
    )
      .bind(TENANT_UNICO_ID)
      .first<{ n: number }>();
    expect(cuenta?.n, "no se guardó nada").toBe(0);
  });

  it("rechaza mover un tipo de proceso a un área de otro tenant", async () => {
    const tipo = await crearTipoProceso(areaMigracionId, "Visa de trabajo");

    const respuesta = await comoAutor(
      conCuerpo(`/api/tipos-proceso/${tipo.id}`, "PUT", {
        areaId: areaAjenaId,
        nombre: "Visa de trabajo",
      }),
    );

    expect(respuesta.status).toBe(422);
    expect(await fallasDe(respuesta)).toContain("area_desconocida");

    const releido = await comoAutor(peticion(`/api/tipos-proceso/${tipo.id}`));
    const cuerpo = (await releido.json()) as { tipo: TipoProcesoEnElCable };
    expect(cuerpo.tipo.areaId).toBe(areaMigracionId);
  });

  it("rechaza colgar una plantilla de un tipo de proceso de otro tenant", async () => {
    const respuesta = await guardarEtapas(tipoAjenoId, [
      { nombre: "Etapa infiltrada" },
    ]);

    // 404 y no 403: un 403 confirmaría que ese identificador existe.
    expect(respuesta.status).toBe(404);

    // Y la plantilla del vecino sigue intacta. Sin esta relectura, un
    // `DELETE`+`INSERT` sin filtro de tenencia que además contestara 404
    // pasaría la aserción de arriba.
    const { results } = await env.DB.prepare(
      "SELECT nombre FROM etapa_plantilla WHERE tipo_proceso_id = ?" +
        " ORDER BY orden",
    )
      .bind(tipoAjenoId)
      .all<{ nombre: string }>();
    expect(results.map((f) => f.nombre)).toEqual(["Etapa del vecino"]);
  });

  it("rechaza una etapa cuyo id pertenece a la plantilla de otro tipo", async () => {
    const unTipo = await crearTipoProceso(areaMigracionId, "Visa de trabajo");
    const otroTipo = await crearTipoProceso(
      areaMigracionId,
      "Visa de pensionado",
    );

    expect(await guardarEtapas(unTipo.id, [{ nombre: "Recepción" }])).toHaveProperty(
      "status",
      200,
    );
    const ajena = (await releerEtapas(unTipo.id))[0];

    const respuesta = await guardarEtapas(otroTipo.id, [
      { id: ajena.id, nombre: "Robada" },
    ]);

    expect(respuesta.status).toBe(422);
    expect(await fallasDe(respuesta)).toContain("etapa_desconocida");

    // La etapa original no cambió de dueño ni de nombre.
    expect((await releerEtapas(unTipo.id)).map((e) => e.nombre)).toEqual([
      "Recepción",
    ]);
    expect(await releerEtapas(otroTipo.id)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Rechazos: la tenencia
// ---------------------------------------------------------------------------

describe("la tenencia no se cruza en ninguno de los cuatro", () => {
  it("rechaza LEER un área de otro tenant", async () => {
    const respuesta = await comoAutor(peticion(`/api/areas/${areaAjenaId}`));

    expect(respuesta.status).toBe(404);
    expect(await respuesta.text()).not.toContain("Área del vecino");
  });

  it("rechaza EDITAR un área de otro tenant", async () => {
    const respuesta = await comoAutor(
      conCuerpo(`/api/areas/${areaAjenaId}`, "PUT", {
        nombre: "Secuestrada",
        activo: false,
      }),
    );

    expect(respuesta.status).toBe(404);

    const fila = await env.DB.prepare(
      "SELECT nombre, activo FROM area WHERE id = ?",
    )
      .bind(areaAjenaId)
      .first<{ nombre: string; activo: number }>();
    expect(fila?.nombre).toBe("Área del vecino");
    expect(fila?.activo).toBe(1);
  });

  it("rechaza LEER y EDITAR un tipo de proceso de otro tenant", async () => {
    const lectura = await comoAutor(
      peticion(`/api/tipos-proceso/${tipoAjenoId}`),
    );
    expect(lectura.status).toBe(404);
    expect(await lectura.text()).not.toContain("Tipo del vecino");

    const edicion = await comoAutor(
      conCuerpo(`/api/tipos-proceso/${tipoAjenoId}`, "PUT", {
        areaId: areaMigracionId,
        nombre: "Secuestrado",
      }),
    );
    expect(edicion.status).toBe(404);

    const fila = await env.DB.prepare(
      "SELECT nombre, area_id FROM tipo_proceso WHERE id = ?",
    )
      .bind(tipoAjenoId)
      .first<{ nombre: string; area_id: string }>();
    expect(fila?.nombre).toBe("Tipo del vecino");
    expect(fila?.area_id).toBe(areaAjenaId);
  });

  it("rechaza LEER la plantilla de un tipo de proceso de otro tenant", async () => {
    const respuesta = await comoAutor(
      peticion(`/api/tipos-proceso/${tipoAjenoId}/etapas`),
    );

    expect(respuesta.status).toBe(404);
    expect(await respuesta.text()).not.toContain("Etapa del vecino");
  });

  it("rechaza LEER y EDITAR un tipo de cliente de otro tenant", async () => {
    const lectura = await comoAutor(
      peticion(`/api/tipos-cliente/${tipoClienteAjenoId}`),
    );
    expect(lectura.status).toBe(404);
    expect(await lectura.text()).not.toContain("Tipo de cliente del vecino");

    const edicion = await comoAutor(
      conCuerpo(`/api/tipos-cliente/${tipoClienteAjenoId}`, "PUT", {
        nombre: "Secuestrado",
      }),
    );
    expect(edicion.status).toBe(404);

    const fila = await env.DB.prepare(
      "SELECT nombre FROM tipo_cliente WHERE id = ?",
    )
      .bind(tipoClienteAjenoId)
      .first<{ nombre: string }>();
    expect(fila?.nombre).toBe("Tipo de cliente del vecino");
  });

  it("rechaza BORRAR cualquiera de los cuatro si es de otro tenant", async () => {
    const respuestas = await Promise.all([
      comoAutor(peticion(`/api/areas/${areaAjenaId}`, { method: "DELETE" })),
      comoAutor(
        peticion(`/api/tipos-proceso/${tipoAjenoId}`, { method: "DELETE" }),
      ),
      comoAutor(
        peticion(`/api/tipos-cliente/${tipoClienteAjenoId}`, {
          method: "DELETE",
        }),
      ),
    ]);

    expect(respuestas.map((r) => r.status)).toEqual([404, 404, 404]);

    const cuenta = await env.DB.prepare(
      "SELECT (SELECT count(*) FROM area WHERE tenant_id = ?1)" +
        " + (SELECT count(*) FROM tipo_proceso WHERE tenant_id = ?1)" +
        " + (SELECT count(*) FROM tipo_cliente WHERE tenant_id = ?1) AS n",
    )
      .bind(OTRO_TENANT_ID)
      .first<{ n: number }>();
    expect(cuenta?.n, "se borró algo del vecino").toBe(3);
  });

  it("ningún listado muestra filas de otro tenant", async () => {
    await crearTipoProceso(areaMigracionId, "Visa de trabajo");
    await crearTipoCliente("Empresa");

    const areas = (await (
      await comoAutor(peticion("/api/areas"))
    ).json()) as { areas: AreaEnElCable[] };
    const tipos = (await (
      await comoAutor(peticion("/api/tipos-proceso"))
    ).json()) as { tipos: TipoProcesoEnElCable[] };
    const tiposCliente = (await (
      await comoAutor(peticion("/api/tipos-cliente"))
    ).json()) as { tipos: AreaEnElCable[] };

    expect(areas.areas.map((a) => a.nombre)).toEqual(["Migración"]);
    expect(tipos.tipos.map((t) => t.nombre)).toEqual(["Visa de trabajo"]);
    expect(tiposCliente.tipos.map((t) => t.nombre)).toEqual(["Empresa"]);
  });
});

// ---------------------------------------------------------------------------
// Rechazos: el borrado con dependientes
// ---------------------------------------------------------------------------

async function bloqueoDe(respuesta: Response): Promise<BloqueoEnElCable> {
  const cuerpo = (await respuesta.json()) as BloqueoEnElCable;
  expect(cuerpo.error).toBe("tiene_dependientes");
  return cuerpo;
}

describe("borrar un catálogo con dependientes se rechaza con una respuesta clara", () => {
  it("rechaza borrar un área que tiene tipos de proceso dentro", async () => {
    await crearTipoProceso(areaMigracionId, "Visa de trabajo");
    await crearTipoProceso(areaMigracionId, "Visa de pensionado");

    const respuesta = await comoAutor(
      peticion(`/api/areas/${areaMigracionId}`, { method: "DELETE" }),
    );

    // 409 y no 500: el choque contra la llave foránea no puede salir como un
    // error de SQL crudo. La respuesta dice qué lo impide y cuántos son.
    expect(respuesta.status).toBe(409);
    const bloqueo = await bloqueoDe(respuesta);
    expect(bloqueo.entidad).toBe("area");
    expect(bloqueo.dependencias).toEqual([
      { entidad: "tipo_proceso", cuantos: 2 },
    ]);

    // Y el área sigue ahí.
    const releida = await comoAutor(peticion(`/api/areas/${areaMigracionId}`));
    expect(releida.status).toBe(200);
  });

  it("rechaza borrar un tipo de proceso que tiene plantilla", async () => {
    const tipo = await crearTipoProceso(areaMigracionId, "Visa de trabajo");
    expect(
      await guardarEtapas(tipo.id, [
        { nombre: "Recepción" },
        { nombre: "Presentación" },
        { nombre: "Resolución" },
      ]),
    ).toHaveProperty("status", 200);

    const respuesta = await comoAutor(
      peticion(`/api/tipos-proceso/${tipo.id}`, { method: "DELETE" }),
    );

    expect(respuesta.status).toBe(409);
    const bloqueo = await bloqueoDe(respuesta);
    expect(bloqueo.entidad).toBe("tipo_proceso");
    expect(bloqueo.dependencias).toEqual([
      { entidad: "etapa_plantilla", cuantos: 3 },
    ]);

    expect(
      (await comoAutor(peticion(`/api/tipos-proceso/${tipo.id}`))).status,
    ).toBe(200);
  });

  it("rechaza borrar un tipo de proceso que tiene procesos abiertos", async () => {
    const tipo = await crearTipoProceso(areaMigracionId, "Visa de trabajo");
    const clienteId = nuevoId();

    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO cliente (id, tenant_id, nombre, telefono, creado_por," +
          " creado_en) VALUES (?, ?, ?, ?, ?, ?)",
      ).bind(
        clienteId,
        TENANT_UNICO_ID,
        "Carlos Pérez",
        "+507 6123-4567",
        autorId,
        new Date().toISOString(),
      ),
      env.DB.prepare(
        "INSERT INTO proceso (id, tenant_id, cliente_id, tipo_proceso_id," +
          " origen, titulo, abierto_en) VALUES (?, ?, ?, ?, 'directo', ?, ?)",
      ).bind(
        nuevoId(),
        TENANT_UNICO_ID,
        clienteId,
        tipo.id,
        "Visa de Carlos",
        new Date().toISOString(),
      ),
    ]);

    const respuesta = await comoAutor(
      peticion(`/api/tipos-proceso/${tipo.id}`, { method: "DELETE" }),
    );

    expect(respuesta.status).toBe(409);
    expect((await bloqueoDe(respuesta)).dependencias).toEqual([
      { entidad: "proceso", cuantos: 1 },
    ]);
  });

  it("rechaza borrar un tipo de cliente que tiene clientes", async () => {
    const tipo = await crearTipoCliente("Empresa");

    await env.DB.prepare(
      "INSERT INTO cliente (id, tenant_id, tipo_cliente_id, nombre," +
        " telefono, creado_por, creado_en) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(
        nuevoId(),
        TENANT_UNICO_ID,
        tipo.id,
        "Inversiones del Istmo, S.A.",
        "+507 300-1122",
        autorId,
        new Date().toISOString(),
      )
      .run();

    const respuesta = await comoAutor(
      peticion(`/api/tipos-cliente/${tipo.id}`, { method: "DELETE" }),
    );

    expect(respuesta.status).toBe(409);
    const bloqueo = await bloqueoDe(respuesta);
    expect(bloqueo.entidad).toBe("tipo_cliente");
    expect(bloqueo.dependencias).toEqual([{ entidad: "cliente", cuantos: 1 }]);
  });

  it("un dependiente de otro tenant no bloquea nada", async () => {
    // El contrapeso del conteo: si la consulta de dependientes no filtrara
    // por tenant, el tipo de proceso del vecino —que cuelga de SU área—
    // bloquearía el borrado de un área nuestra que está vacía.
    const area = await crearArea("Penal");

    const respuesta = await comoAutor(
      peticion(`/api/areas/${area.id}`, { method: "DELETE" }),
    );

    expect(respuesta.status).toBe(204);
    expect((await comoAutor(peticion(`/api/areas/${area.id}`))).status).toBe(
      404,
    );
  });
});

// ---------------------------------------------------------------------------
// Rechazos: sin identidad de Access
// ---------------------------------------------------------------------------

describe("sin identidad de Access no se llega al dominio", () => {
  /**
   * Un servicio que no sabe hacer nada salvo delatar que lo llamaron.
   *
   * Afirmar solo el 403 no probaría el enunciado: un manejador que creara el
   * área y **después** devolviera 403 pasaría esa aserción.
   */
  function servicioEspia(): { servicio: ServicioDeCatalogos; usos: string[] } {
    const usos: string[] = [];
    const registrar = (metodo: string) => () => {
      usos.push(metodo);
      throw new Error(`el dominio no debió ejecutarse: ${metodo}`);
    };

    const metodos = [
      "listarAreas",
      "obtenerArea",
      "crearArea",
      "actualizarArea",
      "borrarArea",
      "listarTiposProceso",
      "obtenerTipoProceso",
      "crearTipoProceso",
      "actualizarTipoProceso",
      "borrarTipoProceso",
      "listarEtapas",
      "reemplazarEtapas",
      "listarTiposCliente",
      "obtenerTipoCliente",
      "crearTipoCliente",
      "actualizarTipoCliente",
      "borrarTipoCliente",
    ] as const;

    const servicio = Object.fromEntries(
      metodos.map((metodo) => [metodo, registrar(metodo)]),
    ) as unknown as ServicioDeCatalogos;

    return { usos, servicio };
  }

  it("ninguna ruta de catálogo pasa sin identidad, y el dominio no se toca", async () => {
    const { servicio, usos } = servicioEspia();
    const id = nuevoId();

    const respuestas = await Promise.all([
      sinIdentidad(peticion("/api/areas"), servicio),
      sinIdentidad(conCuerpo("/api/areas", "POST", { nombre: "x" }), servicio),
      sinIdentidad(peticion(`/api/areas/${id}`), servicio),
      sinIdentidad(
        conCuerpo(`/api/areas/${id}`, "PUT", { nombre: "x" }),
        servicio,
      ),
      sinIdentidad(peticion(`/api/areas/${id}`, { method: "DELETE" }), servicio),
      sinIdentidad(peticion("/api/tipos-proceso"), servicio),
      sinIdentidad(
        conCuerpo("/api/tipos-proceso", "POST", { nombre: "x" }),
        servicio,
      ),
      sinIdentidad(peticion(`/api/tipos-proceso/${id}`), servicio),
      sinIdentidad(
        conCuerpo(`/api/tipos-proceso/${id}`, "PUT", { nombre: "x" }),
        servicio,
      ),
      sinIdentidad(
        peticion(`/api/tipos-proceso/${id}`, { method: "DELETE" }),
        servicio,
      ),
      sinIdentidad(peticion(`/api/tipos-proceso/${id}/etapas`), servicio),
      sinIdentidad(
        conCuerpo(`/api/tipos-proceso/${id}/etapas`, "PUT", { etapas: [] }),
        servicio,
      ),
      sinIdentidad(peticion("/api/tipos-cliente"), servicio),
      sinIdentidad(
        conCuerpo("/api/tipos-cliente", "POST", { nombre: "x" }),
        servicio,
      ),
      sinIdentidad(peticion(`/api/tipos-cliente/${id}`), servicio),
      sinIdentidad(
        conCuerpo(`/api/tipos-cliente/${id}`, "PUT", { nombre: "x" }),
        servicio,
      ),
      sinIdentidad(
        peticion(`/api/tipos-cliente/${id}`, { method: "DELETE" }),
        servicio,
      ),
    ]);

    expect(respuestas.map((r) => r.status)).toEqual(
      respuestas.map(() => 403),
    );
    expect(usos, "el dominio se ejecutó sin identidad").toEqual([]);

    // Y tampoco por otra vía: no se escribió nada.
    const cuenta = await env.DB.prepare(
      "SELECT count(*) AS n FROM area WHERE tenant_id = ?",
    )
      .bind(TENANT_UNICO_ID)
      .first<{ n: number }>();
    expect(cuenta?.n).toBe(1);
  });
});

describe("los métodos no permitidos se rechazan", () => {
  it("rechaza DELETE sobre una colección", async () => {
    const respuesta = await comoAutor(
      peticion("/api/areas", { method: "DELETE" }),
    );

    expect(respuesta.status).toBe(405);
    expect(respuesta.headers.get("allow")).toBe("GET, POST");
  });

  it("rechaza POST sobre un elemento", async () => {
    const respuesta = await comoAutor(
      conCuerpo(`/api/areas/${areaMigracionId}`, "POST", { nombre: "x" }),
    );

    expect(respuesta.status).toBe(405);
    expect(respuesta.headers.get("allow")).toBe("GET, PUT, DELETE");
  });

  it("rechaza POST sobre la plantilla", async () => {
    const tipo = await crearTipoProceso(areaMigracionId, "Visa de trabajo");
    const respuesta = await comoAutor(
      conCuerpo(`/api/tipos-proceso/${tipo.id}/etapas`, "POST", {
        etapas: [],
      }),
    );

    expect(respuesta.status).toBe(405);
    expect(respuesta.headers.get("allow")).toBe("GET, PUT");
  });
});

// ---------------------------------------------------------------------------
// Contrapesos: lo que SÍ entra, verificado releyendo
// ---------------------------------------------------------------------------

describe("el alta y la edición de áreas", () => {
  it("crea un área y la relee por la API", async () => {
    const respuesta = await comoAutor(
      conCuerpo("/api/areas", "POST", { nombre: "  Familia  " }),
    );

    expect(respuesta.status).toBe(201);
    const creada = ((await respuesta.json()) as { area: AreaEnElCable }).area;
    expect(respuesta.headers.get("location")).toBe(`/api/areas/${creada.id}`);

    const releida = await comoAutor(peticion(`/api/areas/${creada.id}`));
    expect(releida.status).toBe(200);
    const cuerpo = (await releida.json()) as { area: AreaEnElCable };

    // Recortada, y vigente por defecto: un catálogo recién creado se puede
    // elegir sin un segundo paso.
    expect(cuerpo.area).toEqual({
      id: creada.id,
      nombre: "Familia",
      activo: true,
    });
  });

  it("renombra un área y lo relee", async () => {
    const area = await crearArea("Migracion");

    const respuesta = await comoAutor(
      conCuerpo(`/api/areas/${area.id}`, "PUT", {
        nombre: "Migración",
        activo: true,
      }),
    );
    expect(respuesta.status).toBe(200);

    const releida = (await (
      await comoAutor(peticion(`/api/areas/${area.id}`))
    ).json()) as { area: AreaEnElCable };
    expect(releida.area.nombre).toBe("Migración");
  });

  it("lista las cuatro ramas del derecho ordenadas por nombre", async () => {
    // Las del diseño §6: familia, migración, civil, penal. «Migración» ya
    // existe desde el `beforeEach`.
    await crearArea("Penal");
    await crearArea("Civil");
    await crearArea("Familia");

    const cuerpo = (await (
      await comoAutor(peticion("/api/areas"))
    ).json()) as { areas: AreaEnElCable[] };

    expect(cuerpo.areas.map((a) => a.nombre)).toEqual([
      "Civil",
      "Familia",
      "Migración",
      "Penal",
    ]);
  });

  it("borra un área vacía, y después ya no está", async () => {
    const area = await crearArea("Penal");

    const respuesta = await comoAutor(
      peticion(`/api/areas/${area.id}`, { method: "DELETE" }),
    );
    expect(respuesta.status).toBe(204);

    expect((await comoAutor(peticion(`/api/areas/${area.id}`))).status).toBe(
      404,
    );
  });

  it("rechaza borrar un área que no existe", async () => {
    const respuesta = await comoAutor(
      peticion(`/api/areas/${nuevoId()}`, { method: "DELETE" }),
    );

    expect(respuesta.status).toBe(404);
  });
});

describe("dar de baja no es borrar", () => {
  it("un área dada de baja sigue siendo legible y sigue en el listado, marcada", async () => {
    const area = await crearArea("Penal");

    const respuesta = await comoAutor(
      conCuerpo(`/api/areas/${area.id}`, "PUT", {
        nombre: "Penal",
        activo: false,
      }),
    );
    expect(respuesta.status).toBe(200);

    const releida = (await (
      await comoAutor(peticion(`/api/areas/${area.id}`))
    ).json()) as { area: AreaEnElCable };
    expect(releida.area.activo).toBe(false);

    // Viaja marcada, no omitida: lo ya guardado contra ella tiene que poder
    // seguir nombrándola. Qué se puede *elegir* lo decide la pantalla.
    const listado = (await (
      await comoAutor(peticion("/api/areas"))
    ).json()) as { areas: AreaEnElCable[] };
    expect(listado.areas.find((a) => a.id === area.id)?.activo).toBe(false);
  });

  it("un tipo de proceso dado de baja sigue sirviendo de padre de su plantilla", async () => {
    // La distinción válido/seleccionable de T-5, aplicada acá: dar de baja un
    // tipo no puede romper la edición de lo que ya cuelga de él.
    const tipo = await crearTipoProceso(areaMigracionId, "Visa de trabajo");
    expect(await guardarEtapas(tipo.id, [{ nombre: "Recepción" }])).toHaveProperty(
      "status",
      200,
    );

    expect(
      (
        await comoAutor(
          conCuerpo(`/api/tipos-proceso/${tipo.id}`, "PUT", {
            areaId: areaMigracionId,
            nombre: "Visa de trabajo",
            activo: false,
          }),
        )
      ).status,
    ).toBe(200);

    const respuesta = await guardarEtapas(tipo.id, [
      { nombre: "Recepción" },
      { nombre: "Presentación" },
    ]);
    expect(respuesta.status).toBe(200);
    expect((await releerEtapas(tipo.id)).map((e) => e.nombre)).toEqual([
      "Recepción",
      "Presentación",
    ]);
  });

  it("un tipo de proceso puede colgar de un área dada de baja", async () => {
    // Lo mismo del lado del padre: dar de baja un área no puede hacer que
    // editar el nombre de uno de sus tipos falle con un error incomprensible.
    const tipo = await crearTipoProceso(areaMigracionId, "Visa de trabajo");

    await comoAutor(
      conCuerpo(`/api/areas/${areaMigracionId}`, "PUT", {
        nombre: "Migración",
        activo: false,
      }),
    );

    const respuesta = await comoAutor(
      conCuerpo(`/api/tipos-proceso/${tipo.id}`, "PUT", {
        areaId: areaMigracionId,
        nombre: "Visa de trabajo (acelerada)",
      }),
    );

    expect(respuesta.status).toBe(200);
  });
});

describe("el catálogo de tipos de cliente, que T-5 dejó sin forma de poblar", () => {
  it("se puede poblar desde la API, y el desplegable deja de salir vacío", async () => {
    // El agujero concreto: en una instalación limpia `tipo_cliente` no tiene
    // filas, y `GET /api/tipos-cliente` —el que alimenta el desplegable del
    // formulario de cliente— devuelve una lista vacía para siempre.
    const antes = (await (
      await comoAutor(peticion("/api/tipos-cliente"))
    ).json()) as { tipos: AreaEnElCable[] };
    expect(antes.tipos).toEqual([]);

    const particular = await crearTipoCliente("Particular");
    await crearTipoCliente("Empresa");

    const despues = (await (
      await comoAutor(peticion("/api/tipos-cliente"))
    ).json()) as { tipos: AreaEnElCable[] };
    expect(despues.tipos.map((t) => t.nombre)).toEqual([
      "Empresa",
      "Particular",
    ]);

    // Y sirve de verdad: un cliente se da de alta con ese tipo.
    const cliente = await comoAutor(
      conCuerpo("/api/clientes", "POST", {
        nombre: "Carlos Pérez",
        telefono: "+507 6123-4567",
        tipoClienteId: particular.id,
      }),
    );
    expect(cliente.status).toBe(201);
    const creado = (await cliente.json()) as {
      cliente: { id: string; tipoClienteNombre: string | null };
    };
    expect(creado.cliente.tipoClienteNombre).toBe("Particular");
  });

  it("un tipo de cliente dado de baja sigue siendo válido para lo ya guardado", async () => {
    const tipo = await crearTipoCliente("Asociación");

    const cliente = await comoAutor(
      conCuerpo("/api/clientes", "POST", {
        nombre: "Asociación de Vecinos",
        telefono: "+507 200-0000",
        tipoClienteId: tipo.id,
      }),
    );
    expect(cliente.status).toBe(201);
    const clienteId = (
      (await cliente.json()) as { cliente: { id: string } }
    ).cliente.id;

    await comoAutor(
      conCuerpo(`/api/tipos-cliente/${tipo.id}`, "PUT", {
        nombre: "Asociación",
        activo: false,
      }),
    );

    // Editar un teléfono no puede fallar porque el tipo dejó de ofrecerse.
    const edicion = await comoAutor(
      conCuerpo(`/api/clientes/${clienteId}`, "PUT", {
        nombre: "Asociación de Vecinos",
        telefono: "+507 200-1111",
        tipoClienteId: tipo.id,
      }),
    );
    expect(edicion.status).toBe(200);
  });
});

describe("el alta y la edición de tipos de proceso", () => {
  it("crea un tipo granular dentro de su área y lo relee con el nombre del área", async () => {
    // La granularidad es del diseño §6: una visa de trabajo y una de
    // pensionado son tipos distintos, no variantes de uno.
    const trabajo = await crearTipoProceso(areaMigracionId, "Visa de trabajo");
    const pensionado = await crearTipoProceso(
      areaMigracionId,
      "Visa de pensionado",
    );

    const releido = (await (
      await comoAutor(peticion(`/api/tipos-proceso/${trabajo.id}`))
    ).json()) as { tipo: TipoProcesoEnElCable };

    expect(releido.tipo).toEqual({
      id: trabajo.id,
      areaId: areaMigracionId,
      areaNombre: "Migración",
      nombre: "Visa de trabajo",
      descripcion: null,
      activo: true,
    });
    expect(pensionado.id).not.toBe(trabajo.id);
  });

  it("guarda y vacía la descripción", async () => {
    const tipo = await crearTipoProceso(areaMigracionId, "Visa de trabajo");

    await comoAutor(
      conCuerpo(`/api/tipos-proceso/${tipo.id}`, "PUT", {
        areaId: areaMigracionId,
        nombre: "Visa de trabajo",
        descripcion: "  Permiso laboral por contrato.  ",
      }),
    );
    const conTexto = (await (
      await comoAutor(peticion(`/api/tipos-proceso/${tipo.id}`))
    ).json()) as { tipo: TipoProcesoEnElCable };
    expect(conTexto.tipo.descripcion).toBe("Permiso laboral por contrato.");

    // Lo vacío vuelve a ser `null`, no `""`: un `""` guardado es una
    // descripción que existe y está en blanco.
    await comoAutor(
      conCuerpo(`/api/tipos-proceso/${tipo.id}`, "PUT", {
        areaId: areaMigracionId,
        nombre: "Visa de trabajo",
        descripcion: "   ",
      }),
    );
    const vaciada = (await (
      await comoAutor(peticion(`/api/tipos-proceso/${tipo.id}`))
    ).json()) as { tipo: TipoProcesoEnElCable };
    expect(vaciada.tipo.descripcion).toBeNull();
  });

  it("lista los tipos ordenados por área y después por nombre", async () => {
    const familia = await crearArea("Familia");
    await crearTipoProceso(areaMigracionId, "Visa de trabajo");
    await crearTipoProceso(areaMigracionId, "Residencia permanente");
    await crearTipoProceso(familia.id, "Divorcio de mutuo acuerdo");

    const cuerpo = (await (
      await comoAutor(peticion("/api/tipos-proceso"))
    ).json()) as { tipos: TipoProcesoEnElCable[] };

    expect(cuerpo.tipos.map((t) => `${t.areaNombre ?? "?"} · ${t.nombre}`)).toEqual([
      "Familia · Divorcio de mutuo acuerdo",
      "Migración · Residencia permanente",
      "Migración · Visa de trabajo",
    ]);
  });

  it("borra un tipo de proceso sin plantilla ni procesos", async () => {
    const tipo = await crearTipoProceso(areaMigracionId, "Visa de trabajo");

    expect(
      (
        await comoAutor(
          peticion(`/api/tipos-proceso/${tipo.id}`, { method: "DELETE" }),
        )
      ).status,
    ).toBe(204);
    expect(
      (await comoAutor(peticion(`/api/tipos-proceso/${tipo.id}`))).status,
    ).toBe(404);
  });

  it("vaciar la plantilla desbloquea el borrado del tipo", async () => {
    // El camino de salida que la política de borrado tiene que dejar abierto:
    // el 409 no puede ser una pared sin puerta.
    const tipo = await crearTipoProceso(areaMigracionId, "Visa de trabajo");
    await guardarEtapas(tipo.id, [{ nombre: "Recepción" }]);

    expect(
      (
        await comoAutor(
          peticion(`/api/tipos-proceso/${tipo.id}`, { method: "DELETE" }),
        )
      ).status,
    ).toBe(409);

    expect(await guardarEtapas(tipo.id, [])).toHaveProperty("status", 200);
    expect(await releerEtapas(tipo.id)).toEqual([]);

    expect(
      (
        await comoAutor(
          peticion(`/api/tipos-proceso/${tipo.id}`, { method: "DELETE" }),
        )
      ).status,
    ).toBe(204);
  });
});

// ---------------------------------------------------------------------------
// La plantilla ordenada
// ---------------------------------------------------------------------------

describe("la plantilla de etapas, ordenada", () => {
  let tipoId: string;

  beforeEach(async () => {
    tipoId = (await crearTipoProceso(areaMigracionId, "Visa de trabajo")).id;
  });

  it("guarda la plantilla en el orden en que llega y la relee en ese orden", async () => {
    const respuesta = await guardarEtapas(tipoId, [
      { nombre: "Recepción de documentos" },
      { nombre: "Presentación ante Migración" },
      { nombre: "Resolución" },
      { nombre: "Entrega del carné" },
    ]);
    expect(respuesta.status).toBe(200);

    const etapas = await releerEtapas(tipoId);
    expect(etapas.map((e) => e.nombre)).toEqual([
      "Recepción de documentos",
      "Presentación ante Migración",
      "Resolución",
      "Entrega del carné",
    ]);
    expect(etapas.map((e) => e.orden)).toEqual([0, 1, 2, 3]);
  });

  it("una secuencia de reordenamientos deja el orden correcto, releído", async () => {
    // El punto exacto que T-2 dejó sin índice único: el orden lo sostiene
    // este código y nadie más. Tres reordenamientos encadenados, cada uno
    // partiendo del estado releído del anterior.
    await guardarEtapas(tipoId, [
      { nombre: "A" },
      { nombre: "B" },
      { nombre: "C" },
      { nombre: "D" },
    ]);

    const inicial = await releerEtapas(tipoId);
    const porNombre = new Map(inicial.map((e) => [e.nombre, e.id]));
    const conIds = (nombres: string[]) =>
      nombres.map((nombre) => ({ id: porNombre.get(nombre) ?? null, nombre }));

    // 1. La última pasa al frente.
    expect(await guardarEtapas(tipoId, conIds(["D", "A", "B", "C"]))).toHaveProperty(
      "status",
      200,
    );
    expect((await releerEtapas(tipoId)).map((e) => e.nombre)).toEqual([
      "D",
      "A",
      "B",
      "C",
    ]);

    // 2. Se intercambian dos del medio.
    expect(await guardarEtapas(tipoId, conIds(["D", "B", "A", "C"]))).toHaveProperty(
      "status",
      200,
    );
    expect((await releerEtapas(tipoId)).map((e) => e.nombre)).toEqual([
      "D",
      "B",
      "A",
      "C",
    ]);

    // 3. Se invierte entera.
    expect(await guardarEtapas(tipoId, conIds(["C", "A", "B", "D"]))).toHaveProperty(
      "status",
      200,
    );

    const final = await releerEtapas(tipoId);
    expect(final.map((e) => e.nombre)).toEqual(["C", "A", "B", "D"]);
    // El orden releído es contiguo desde cero: si cada reordenamiento dejara
    // huecos o repeticiones, el `ORDER BY orden` acabaría siendo arbitrario.
    expect(final.map((e) => e.orden)).toEqual([0, 1, 2, 3]);
    // Y son las mismas cuatro filas: reordenar no es recrear.
    expect(new Set(final.map((e) => e.id))).toEqual(
      new Set(inicial.map((e) => e.id)),
    );
  });

  it("agrega una etapa en el medio sin tocar las demás", async () => {
    await guardarEtapas(tipoId, [{ nombre: "Recepción" }, { nombre: "Resolución" }]);
    const antes = await releerEtapas(tipoId);

    await guardarEtapas(tipoId, [
      { id: antes[0].id, nombre: "Recepción" },
      { nombre: "Presentación" },
      { id: antes[1].id, nombre: "Resolución" },
    ]);

    const despues = await releerEtapas(tipoId);
    expect(despues.map((e) => e.nombre)).toEqual([
      "Recepción",
      "Presentación",
      "Resolución",
    ]);
    expect(despues[0].id).toBe(antes[0].id);
    expect(despues[2].id).toBe(antes[1].id);
  });

  it("quita una etapa y renumera el resto", async () => {
    await guardarEtapas(tipoId, [
      { nombre: "A" },
      { nombre: "B" },
      { nombre: "C" },
    ]);
    const antes = await releerEtapas(tipoId);

    await guardarEtapas(tipoId, [
      { id: antes[0].id, nombre: "A" },
      { id: antes[2].id, nombre: "C" },
    ]);

    const despues = await releerEtapas(tipoId);
    expect(despues.map((e) => e.nombre)).toEqual(["A", "C"]);
    expect(despues.map((e) => e.orden)).toEqual([0, 1]);

    const borrada = await env.DB.prepare(
      "SELECT count(*) AS n FROM etapa_plantilla WHERE id = ?",
    )
      .bind(antes[1].id)
      .first<{ n: number }>();
    expect(borrada?.n, "la etapa quitada sigue en la base").toBe(0);
  });

  it("renombra una etapa conservando su identidad", async () => {
    await guardarEtapas(tipoId, [{ nombre: "Recepcion" }]);
    const antes = await releerEtapas(tipoId);

    await guardarEtapas(tipoId, [
      { id: antes[0].id, nombre: "Recepción de documentos" },
    ]);

    const despues = await releerEtapas(tipoId);
    expect(despues).toEqual([
      { id: antes[0].id, nombre: "Recepción de documentos", orden: 0 },
    ]);
  });

  it("recorta los nombres de etapa", async () => {
    await guardarEtapas(tipoId, [{ nombre: "  Entrega del carné  " }]);

    expect((await releerEtapas(tipoId))[0].nombre).toBe("Entrega del carné");
  });

  it("dos tipos de proceso tienen plantillas independientes", async () => {
    // El motivo por el que la granularidad del catálogo existe: una visa de
    // pensionado y una de trabajo no tienen los mismos pasos (§6).
    const pensionado = await crearTipoProceso(
      areaMigracionId,
      "Visa de pensionado",
    );

    await guardarEtapas(tipoId, [{ nombre: "Contrato laboral" }]);
    await guardarEtapas(pensionado.id, [{ nombre: "Carta de pensión" }]);

    expect((await releerEtapas(tipoId)).map((e) => e.nombre)).toEqual([
      "Contrato laboral",
    ]);
    expect((await releerEtapas(pensionado.id)).map((e) => e.nombre)).toEqual([
      "Carta de pensión",
    ]);
  });

  it("rechaza la plantilla de un tipo de proceso que no existe", async () => {
    const respuesta = await guardarEtapas(nuevoId(), [{ nombre: "x" }]);

    expect(respuesta.status).toBe(404);
  });

  it("rechaza una plantilla que repite la misma etapa", async () => {
    // Las dos escrituras caerían sobre la misma fila: la última ganaría y el
    // plan releído tendría un paso menos del que se pidió.
    await guardarEtapas(tipoId, [{ nombre: "Recepción" }]);
    const existente = (await releerEtapas(tipoId))[0];

    const respuesta = await guardarEtapas(tipoId, [
      { id: existente.id, nombre: "Recepción" },
      { id: existente.id, nombre: "Resolución" },
    ]);

    expect(respuesta.status).toBe(422);
    expect(await fallasDe(respuesta)).toContain("etapa_desconocida");
    expect((await releerEtapas(tipoId)).map((e) => e.nombre)).toEqual([
      "Recepción",
    ]);
  });

  it("rechaza un cuerpo cuyas etapas no son una lista", async () => {
    const respuesta = await comoAutor(
      conCuerpo(`/api/tipos-proceso/${tipoId}/etapas`, "PUT", {
        etapas: "Recepción",
      }),
    );

    expect(respuesta.status).toBe(422);
    expect(await fallasDe(respuesta)).toContain("tipo_invalido");
  });
});
