/**
 * La API de la cotización en borrador (`odd/tasks/cotizaciones.md`, T-2).
 *
 * El esquema de T-1 ya rechaza en la base casi todo lo que puede salir mal:
 * el estado fuera del catálogo, la moneda, la coherencia entre estado y
 * snapshot, el vencimiento anterior a la fecha, el código repetido dentro del
 * bufete y las aristas que cruzan tenencia. **Esta suite no vuelve a probar
 * nada de eso** —`test/esquema-cotizaciones.spec.ts` es su dueño— y tampoco
 * prueba que el código lo atrape: la disciplina del proyecto es que la guarda
 * se cuenta y nunca se atrapa, así que un `try`/`catch` alrededor de un
 * disparador sería el defecto, no la cobertura.
 *
 * Lo que sí se prueba acá son las tres cosas que la base no puede sostener:
 *
 *  - **La forma de la entrada.** Qué es un cuerpo aceptable y qué no, con la
 *    lista entera de fallas y no la primera: un formulario que corrige de a
 *    un error por envío es el formulario que nadie usa.
 *  - **El código que genera el servidor.** `COT-<año>-<correlativo>`, con el
 *    correlativo por bufete y por año. Es la pieza que no existe en la base
 *    —el índice único solo dice que no se repita, no de dónde sale— y es la
 *    que tiene dos ejes que se pueden confundir en silencio.
 *  - **La tenencia, en las cuatro rutas.** I-8 (`docs/diseno.md` §5) vive en
 *    cada consulta del repositorio, y acá hay una prueba por cada consulta
 *    nueva: el listado, el detalle, la edición y el correlativo. Un UUID
 *    ajeno sigue siendo un UUID.
 *
 * Los contrapesos releen **por la API**: un `POST` que contesta 201 y no
 * guardó nada pasa cualquier aserción hecha sobre su propio eco.
 *
 * Las identidades entran por el seam `correoDeDesarrollo`, el mismo de
 * `test/acceso.spec.ts`.
 */
import { env } from "cloudflare:workers";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  cotizacionesSobreD1,
  type ServicioDeCotizaciones,
} from "../worker/cotizaciones/repositorio";
import { baseSobreD1 } from "../worker/db/base";
import { TENANT_UNICO_ID, nuevoId } from "../worker/db/ids";
import { manejar } from "../worker/index";

const DOMINIO_DE_ACCESS = "https://bufete-de-prueba.cloudflareaccess.com";
const AUD = "aud-de-la-aplicacion-del-bufete";

const EMAIL_AUTOR = "itzel@bufete.test";
const EMAIL_AJENO = "ajena@otro-bufete.test";

/** El tenant vecino. Existe solo para que la fuga sea expresable. */
const OTRO_TENANT_ID = "0a5a6e0a-9f1e-4a6e-9f03-3b6a2a0e1d77";

/**
 * La forma de la cotización en el cable. Se declara acá, y no se importa del
 * contrato del Worker, a propósito: lo que esta prueba vigila es el JSON que
 * ve el navegador. Importando el tipo, renombrar un campo en el servidor
 * renombraría también la expectativa y el cambio de contrato pasaría mudo.
 */
interface CotizacionEnElCable {
  id: string;
  codigo: string;
  estado: string;
  clienteId: string;
  clienteNombre: string | null;
  fecha: string;
  venceEn: string | null;
  moneda: string;
  duplicadaDeId: string | null;
  creadaPor: string;
  creadaPorNombre: string | null;
  creadaEn: string;
}

interface FallaEnElCable {
  campo: string;
  motivo: string;
}

let autorId: string;
let clienteId: string;
let otroClienteId: string;
let clienteAjenoId: string;
let cotizacionAjenaId: string;
let autorAjenoId: string;

/** El año en curso, que es el que el servidor va a escribir en el código. */
function anio(): string {
  return new Date().toISOString().slice(0, 4);
}

/** Hoy, como día `AAAA-MM-DD`. */
function hoy(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Ayer. Se calcula y no se escribe fijo: una fecha fija caduca. */
function ayer(): string {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function entorno(ajustes: Partial<Env> = {}): Env {
  // Hermético, por la misma razón que en `test/acceso.spec.ts`: un
  // `.dev.vars` local con `ACCESO_DEV_EMAIL` no puede decidir qué identidad
  // observa la suite.
  return {
    ...env,
    ACCESO_TEAM_DOMAIN: DOMINIO_DE_ACCESS,
    ACCESO_AUD: AUD,
    ACCESO_DEV_EMAIL: undefined,
    ...ajustes,
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

/** Una petición hecha por la identidad del bufete. */
function comoAutor(request: Request): Promise<Response> {
  return manejar(request, entorno(), { correoDeDesarrollo: () => EMAIL_AUTOR });
}

/** Una petición sin ninguna identidad: ni token, ni vía de desarrollo. */
function sinIdentidad(
  request: Request,
  cotizaciones?: ServicioDeCotizaciones,
): Promise<Response> {
  return manejar(request, entorno(), {
    correoDeDesarrollo: () => null,
    ...(cotizaciones === undefined ? {} : { cotizaciones }),
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

function motivos(fallas: readonly FallaEnElCable[]): string[] {
  return fallas.map((falla) => falla.motivo);
}

async function cotizacionDe(respuesta: Response): Promise<CotizacionEnElCable> {
  const cuerpo = (await respuesta.json()) as {
    cotizacion?: CotizacionEnElCable;
  };
  expect(cuerpo.cotizacion, "la respuesta no trae `cotizacion`").toBeDefined();
  return cuerpo.cotizacion as CotizacionEnElCable;
}

async function listar(): Promise<CotizacionEnElCable[]> {
  const respuesta = await comoAutor(peticion("/api/cotizaciones"));
  expect(respuesta.status).toBe(200);
  const cuerpo = (await respuesta.json()) as {
    cotizaciones?: CotizacionEnElCable[];
  };
  return cuerpo.cotizaciones ?? [];
}

/** Relee por la API, que es la única lectura que prueba que algo se guardó. */
async function releer(id: string): Promise<CotizacionEnElCable> {
  const respuesta = await comoAutor(peticion(`/api/cotizaciones/${id}`));
  expect(respuesta.status).toBe(200);
  return cotizacionDe(respuesta);
}

/** El alta mínima, que es la que casi todas las pruebas necesitan antes. */
async function crear(
  cuerpo: unknown = { clienteId },
): Promise<CotizacionEnElCable> {
  const respuesta = await comoAutor(
    conCuerpo("/api/cotizaciones", "POST", cuerpo),
  );
  expect(respuesta.status, await respuesta.clone().text()).toBe(201);
  return cotizacionDe(respuesta);
}

/**
 * La persona del bufete se crea **una sola vez**: `usuario` lleva
 * `UNIQUE (tenant_id, email)` desde T-2 y, desde T-10, con una entrada de
 * bitácora viva tampoco se puede borrar para volver a insertarla.
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
  // El almacenamiento está aislado por archivo, no por prueba. Las
  // cotizaciones se borran **antes** que los clientes: la llave foránea está
  // en `NO ACTION` y un cliente con cotización viva no se va.
  await env.DB.prepare("DELETE FROM cotizacion").run();
  await env.DB.prepare("DELETE FROM cliente").run();
  await env.DB.prepare("DELETE FROM usuario WHERE tenant_id <> ?")
    .bind(TENANT_UNICO_ID)
    .run();
  await env.DB.prepare("DELETE FROM tenant WHERE id <> ?")
    .bind(TENANT_UNICO_ID)
    .run();

  clienteId = nuevoId();
  otroClienteId = nuevoId();
  clienteAjenoId = nuevoId();
  cotizacionAjenaId = nuevoId();
  autorAjenoId = nuevoId();

  const ahora = new Date().toISOString();

  await env.DB.batch([
    env.DB.prepare("INSERT INTO tenant (id, nombre) VALUES (?, ?)").bind(
      OTRO_TENANT_ID,
      "Otro bufete",
    ),
    env.DB.prepare(
      "INSERT INTO usuario (id, tenant_id, nombre, email, activo)" +
        " VALUES (?, ?, ?, ?, 1)",
    ).bind(autorAjenoId, OTRO_TENANT_ID, "Ajena", EMAIL_AJENO),
    env.DB.prepare(
      "INSERT INTO cliente (id, tenant_id, nombre, telefono, creado_por," +
        " creado_en) VALUES (?, ?, ?, ?, ?, ?)",
    ).bind(clienteId, TENANT_UNICO_ID, "Panamá Trading", "+507 6123-4567", autorId, ahora),
    env.DB.prepare(
      "INSERT INTO cliente (id, tenant_id, nombre, telefono, creado_por," +
        " creado_en) VALUES (?, ?, ?, ?, ?, ?)",
    ).bind(otroClienteId, TENANT_UNICO_ID, "Zafiro S.A.", "+507 6000-1111", autorId, ahora),
    // El cliente del tenant vecino, y su cotización: el objeto de las pruebas
    // de fuga. El correlativo va alto a propósito — si el filtro de tenencia
    // de la consulta que lo calcula se aflojara, la primera cotización de
    // este bufete nacería numerada detrás de la del vecino.
    env.DB.prepare(
      "INSERT INTO cliente (id, tenant_id, nombre, telefono, creado_por," +
        " creado_en) VALUES (?, ?, ?, ?, ?, ?)",
    ).bind(
      clienteAjenoId,
      OTRO_TENANT_ID,
      "Cliente del vecino",
      "+507 6000-0000",
      autorAjenoId,
      ahora,
    ),
    env.DB.prepare(
      "INSERT INTO cotizacion (id, tenant_id, cliente_id, codigo, estado," +
        " fecha, moneda, creada_por, creada_en)" +
        " VALUES (?, ?, ?, ?, 'borrador', ?, 'USD', ?, ?)",
    ).bind(
      cotizacionAjenaId,
      OTRO_TENANT_ID,
      clienteAjenoId,
      `COT-${anio()}-0007`,
      ahora,
      autorAjenoId,
      ahora,
    ),
  ]);
});

// ---------------------------------------------------------------------------
// La forma de la entrada
// ---------------------------------------------------------------------------

describe("el alta rechaza lo que no es una cotización", () => {
  it("rechaza un alta sin cliente", async () => {
    const respuesta = await comoAutor(conCuerpo("/api/cotizaciones", "POST", {}));

    expect(respuesta.status).toBe(422);
    expect(motivos(await fallasDe(respuesta))).toContain("cliente_requerido");
    expect(await listar(), "no se guardó nada").toHaveLength(0);
  });

  it("rechaza un alta cuyo cliente es solo espacios", async () => {
    const respuesta = await comoAutor(
      conCuerpo("/api/cotizaciones", "POST", { clienteId: "  \t " }),
    );

    expect(respuesta.status).toBe(422);
    expect(motivos(await fallasDe(respuesta))).toContain("cliente_requerido");
    expect(await listar()).toHaveLength(0);
  });

  it("rechaza un cliente que no es texto", async () => {
    const respuesta = await comoAutor(
      conCuerpo("/api/cotizaciones", "POST", { clienteId: 7 }),
    );

    expect(respuesta.status).toBe(422);
    expect(motivos(await fallasDe(respuesta))).toContain("tipo_invalido");
  });

  it("rechaza un cliente que no es de este bufete", async () => {
    const respuesta = await comoAutor(
      conCuerpo("/api/cotizaciones", "POST", { clienteId: clienteAjenoId }),
    );

    // 422 y no 404: el que no existe es el cliente que viaja en el cuerpo, no
    // la cotización que se está pidiendo. Y «de otro bufete» se contesta
    // igual que «no existe», que es lo que impide usar el alta para sondear
    // identificadores ajenos.
    expect(respuesta.status).toBe(422);
    expect(motivos(await fallasDe(respuesta))).toContain("cliente_desconocido");
    expect(await listar(), "no se guardó nada").toHaveLength(0);
  });

  it("rechaza un vencimiento que no es un día del calendario", async () => {
    const respuesta = await comoAutor(
      conCuerpo("/api/cotizaciones", "POST", {
        clienteId,
        // Tiene la forma y no es ningún día. Es la misma trampa que T-9
        // encontró en los pendientes.
        venceEn: "2026-02-31",
      }),
    );

    expect(respuesta.status).toBe(422);
    expect(motivos(await fallasDe(respuesta))).toContain(
      "vencimiento_invalido",
    );
  });

  it("rechaza un vencimiento con forma de momento", async () => {
    // El cable lleva **días**, no instantes: lo que la persona elige en el
    // formulario es un día, y la hora la pone el servidor al final de ese
    // día. Aceptar las dos formas haría que dos clientes del API guardaran
    // vencimientos distintos para la misma intención.
    const respuesta = await comoAutor(
      conCuerpo("/api/cotizaciones", "POST", {
        clienteId,
        venceEn: "2027-01-15T00:00:00.000Z",
      }),
    );

    expect(respuesta.status).toBe(422);
    expect(motivos(await fallasDe(respuesta))).toContain(
      "vencimiento_invalido",
    );
  });

  it("rechaza un vencimiento que ya pasó", async () => {
    // Es la regla de negocio, y **no** es la misma que el `CHECK` de la base.
    // La de la base es `vence_en >= fecha` y compara momentos; ésta compara
    // el día que llegó por el cable contra hoy. En el alta coinciden por
    // casualidad —`fecha` es ahora—, y lo que esta prueba fija es cuál de
    // las dos contesta: la del dominio, con un 422 que dice qué arreglar, y
    // no la de la base con un 500 que nadie puede leer.
    const respuesta = await comoAutor(
      conCuerpo("/api/cotizaciones", "POST", {
        clienteId,
        venceEn: ayer(),
      }),
    );

    expect(respuesta.status).toBe(422);
    expect(motivos(await fallasDe(respuesta))).toContain("vencimiento_pasado");
    expect(await listar(), "no se guardó nada").toHaveLength(0);
  });

  it("acepta un vencimiento de hoy: hoy no es pasado", async () => {
    // El borde de la regla anterior, y el que de verdad importa: una
    // cotización que se manda y se responde el mismo día es el caso
    // corriente, no la excepción.
    const creada = await crear({ clienteId, venceEn: hoy() });

    expect((await releer(creada.id)).venceEn).toBe(hoy());
  });

  it("rechaza un vencimiento que no es texto", async () => {
    const respuesta = await comoAutor(
      conCuerpo("/api/cotizaciones", "POST", { clienteId, venceEn: 2027 }),
    );

    expect(respuesta.status).toBe(422);
    expect(motivos(await fallasDe(respuesta))).toContain("tipo_invalido");
  });

  it("devuelve todas las fallas juntas y no la primera", async () => {
    const respuesta = await comoAutor(
      conCuerpo("/api/cotizaciones", "POST", { venceEn: "2026-02-31" }),
    );

    expect(respuesta.status).toBe(422);
    expect(motivos(await fallasDe(respuesta)).sort()).toEqual([
      "cliente_requerido",
      "vencimiento_invalido",
    ]);
  });

  it("rechaza un cuerpo que no es un objeto", async () => {
    const respuesta = await comoAutor(
      conCuerpo("/api/cotizaciones", "POST", [{ clienteId }]),
    );

    expect(respuesta.status).toBe(422);
    expect(motivos(await fallasDe(respuesta))).toContain("tipo_invalido");
  });

  it("rechaza un cuerpo que ni siquiera es JSON", async () => {
    const respuesta = await comoAutor(
      peticion("/api/cotizaciones", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{ esto no cierra",
      }),
    );

    // 400 y no 422: 422 dice «entendí el cuerpo y no me sirve»; esto es «no
    // pude ni leerlo».
    expect(respuesta.status).toBe(400);
    expect(await respuesta.json()).toEqual({ error: "cuerpo_invalido" });
  });

  it("ignora los campos que la API no deja elegir", async () => {
    // El código, el estado, la moneda y el snapshot los pone el servidor. Un
    // cuerpo que los trae no es un error del formulario —ninguna pantalla los
    // manda—, pero tampoco los puede imponer: si entraran, el correlativo
    // dejaría de ser del servidor y un borrador podría nacer emitido.
    const cotizacion = await crear({
      clienteId,
      codigo: "COT-1999-9999",
      estado: "ganada",
      moneda: "EUR",
      snapshot: "{}",
      duplicadaDeId: cotizacionAjenaId,
    });

    expect(cotizacion.codigo).toBe(`COT-${anio()}-0001`);
    expect(cotizacion.estado).toBe("borrador");
    expect(cotizacion.moneda).toBe("USD");
    expect(cotizacion.duplicadaDeId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// El alta
// ---------------------------------------------------------------------------

describe("el alta de un borrador", () => {
  it("guarda el borrador mínimo y lo devuelve releído", async () => {
    const respuesta = await comoAutor(
      conCuerpo("/api/cotizaciones", "POST", { clienteId }),
    );

    expect(respuesta.status).toBe(201);
    const creada = await cotizacionDe(respuesta);
    expect(respuesta.headers.get("location")).toBe(
      `/api/cotizaciones/${creada.id}`,
    );

    const guardada = await releer(creada.id);
    expect(guardada.clienteId).toBe(clienteId);
    expect(guardada.clienteNombre).toBe("Panamá Trading");
    expect(guardada.estado).toBe("borrador");
    expect(guardada.moneda).toBe("USD");
    expect(guardada.venceEn).toBeNull();
    expect(guardada.duplicadaDeId).toBeNull();
    expect(guardada.creadaPor).toBe(autorId);
    expect(guardada.creadaPorNombre).toBe("Itzel");
  });

  it("nace sin snapshot, y el snapshot no viaja en el cable", async () => {
    // Un borrador no tiene documento congelado: la coherencia la sostiene el
    // `CHECK` de T-1. Y el snapshot **no es un campo de esta API** — es el
    // documento entero, y quien mira un listado no lo necesita.
    const creada = await crear();

    expect(creada).not.toHaveProperty("snapshot");

    const fila = await env.DB.prepare(
      "SELECT snapshot FROM cotizacion WHERE id = ?",
    )
      .bind(creada.id)
      .first<{ snapshot: string | null }>();

    expect(fila?.snapshot).toBeNull();
  });

  it("la fecha y la creación son momentos canónicos", async () => {
    const creada = await crear();

    expect(creada.fecha).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(creada.creadaEn).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
  });

  it("guarda el vencimiento como el día que llegó", async () => {
    const creada = await crear({ clienteId, venceEn: "2027-01-15" });

    expect((await releer(creada.id)).venceEn).toBe("2027-01-15");
  });

  it("guarda el vencimiento al final del día, no al principio", async () => {
    // No es un detalle: `CHECK (vence_en >= fecha)` compara momentos, así que
    // un vencimiento guardado a medianoche haría que «vence hoy» —el caso más
    // corriente de una cotización que se manda y se responde el mismo día—
    // muriera contra la base.
    const hoy = new Date().toISOString().slice(0, 10);
    const creada = await crear({ clienteId, venceEn: hoy });

    const fila = await env.DB.prepare(
      "SELECT vence_en FROM cotizacion WHERE id = ?",
    )
      .bind(creada.id)
      .first<{ vence_en: string }>();

    expect(fila?.vence_en).toBe(`${hoy}T23:59:59.999Z`);
  });
});

// ---------------------------------------------------------------------------
// El código lo genera el servidor
// ---------------------------------------------------------------------------

describe("el código de la cotización", () => {
  it("empieza en 0001 y lleva el año en curso", async () => {
    expect((await crear()).codigo).toBe(`COT-${anio()}-0001`);
  });

  it("avanza de a uno", async () => {
    expect((await crear()).codigo).toBe(`COT-${anio()}-0001`);
    expect((await crear()).codigo).toBe(`COT-${anio()}-0002`);
    expect((await crear()).codigo).toBe(`COT-${anio()}-0003`);
  });

  it("el correlativo es de este bufete y no del vecino", async () => {
    // El vecino ya tiene su 0007 (lo siembra el `beforeEach`). Si la consulta
    // que calcula el correlativo no filtrara por tenant, ésta nacería 0008.
    expect((await crear()).codigo).toBe(`COT-${anio()}-0001`);
  });

  it("el correlativo se reinicia cada año", async () => {
    const anioPasado = String(Number(anio()) - 1);
    const momento = `${anioPasado}-11-30T10:00:00.000Z`;

    await env.DB.prepare(
      "INSERT INTO cotizacion (id, tenant_id, cliente_id, codigo, estado," +
        " fecha, moneda, creada_por, creada_en)" +
        " VALUES (?, ?, ?, ?, 'borrador', ?, 'USD', ?, ?)",
    )
      .bind(
        nuevoId(),
        TENANT_UNICO_ID,
        clienteId,
        `COT-${anioPasado}-0042`,
        momento,
        autorId,
        momento,
      )
      .run();

    expect((await crear()).codigo).toBe(`COT-${anio()}-0001`);
  });

  it("no rellena un hueco del medio", async () => {
    // La API no borra cotizaciones —no hay `DELETE` en ninguna ruta—, así
    // que el único hueco posible viene de la consola de D1. Aun así se fija
    // el comportamiento: el correlativo sigue al **máximo** y no cuenta
    // filas, porque contarlas haría que borrar la del medio produjera un
    // código ya entregado a un cliente.
    const primera = await crear();
    await crear();
    await crear();

    await env.DB.prepare("DELETE FROM cotizacion WHERE id = ?")
      .bind(primera.id)
      .run();

    expect((await crear()).codigo).toBe(`COT-${anio()}-0004`);
  });
});

// ---------------------------------------------------------------------------
// El listado y el detalle
// ---------------------------------------------------------------------------

describe("el listado y el detalle", () => {
  it("lista las del bufete, de la más nueva a la más vieja", async () => {
    const primera = await crear();
    const segunda = await crear({ clienteId: otroClienteId });

    const listado = await listar();
    expect(listado.map((cada) => cada.id)).toEqual([segunda.id, primera.id]);
  });

  it("el listado no trae las del vecino", async () => {
    await crear();

    const listado = await listar();
    expect(listado).toHaveLength(1);
    expect(listado.map((cada) => cada.id)).not.toContain(cotizacionAjenaId);
  });

  it("contesta 404 por una cotización que no existe", async () => {
    const respuesta = await comoAutor(peticion(`/api/cotizaciones/${nuevoId()}`));
    expect(respuesta.status).toBe(404);
  });

  it("contesta 404 por la cotización del vecino", async () => {
    // Un 403 confirmaría que ese identificador existe en alguna parte.
    const respuesta = await comoAutor(
      peticion(`/api/cotizaciones/${cotizacionAjenaId}`),
    );

    expect(respuesta.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// La edición de un borrador
// ---------------------------------------------------------------------------

describe("la edición de un borrador", () => {
  it("cambia el cliente y el vencimiento, y se relee", async () => {
    const creada = await crear({ clienteId, venceEn: "2027-01-15" });

    const respuesta = await comoAutor(
      conCuerpo(`/api/cotizaciones/${creada.id}`, "PUT", {
        clienteId: otroClienteId,
        venceEn: "2027-03-01",
      }),
    );

    expect(respuesta.status).toBe(200);

    const guardada = await releer(creada.id);
    expect(guardada.clienteId).toBe(otroClienteId);
    expect(guardada.clienteNombre).toBe("Zafiro S.A.");
    expect(guardada.venceEn).toBe("2027-03-01");
  });

  it("vacía el vencimiento cuando llega nulo", async () => {
    const creada = await crear({ clienteId, venceEn: "2027-01-15" });

    const respuesta = await comoAutor(
      conCuerpo(`/api/cotizaciones/${creada.id}`, "PUT", {
        clienteId,
        venceEn: null,
      }),
    );

    expect(respuesta.status).toBe(200);
    expect((await releer(creada.id)).venceEn).toBeNull();
  });

  it("no reescribe el código, el estado, la fecha ni la autoría", async () => {
    const creada = await crear();

    await comoAutor(
      conCuerpo(`/api/cotizaciones/${creada.id}`, "PUT", {
        clienteId: otroClienteId,
      }),
    );

    const guardada = await releer(creada.id);
    expect(guardada.codigo).toBe(creada.codigo);
    expect(guardada.estado).toBe("borrador");
    expect(guardada.fecha).toBe(creada.fecha);
    expect(guardada.creadaPor).toBe(creada.creadaPor);
    expect(guardada.creadaEn).toBe(creada.creadaEn);
  });

  it("rechaza un cliente que no es de este bufete", async () => {
    const creada = await crear();

    const respuesta = await comoAutor(
      conCuerpo(`/api/cotizaciones/${creada.id}`, "PUT", {
        clienteId: clienteAjenoId,
      }),
    );

    expect(respuesta.status).toBe(422);
    expect(motivos(await fallasDe(respuesta))).toContain("cliente_desconocido");
    expect((await releer(creada.id)).clienteId).toBe(clienteId);
  });

  it("contesta 404 antes que 422 por una cotización ajena", async () => {
    // El orden importa: un cuerpo inválido contra un identificador ajeno
    // contestaría 422 en vez de 404, y eso bastaría para saber que ese
    // identificador existe.
    const respuesta = await comoAutor(
      conCuerpo(`/api/cotizaciones/${cotizacionAjenaId}`, "PUT", {}),
    );

    expect(respuesta.status).toBe(404);
  });

  it("contesta 404 por una cotización que no existe", async () => {
    const respuesta = await comoAutor(
      conCuerpo(`/api/cotizaciones/${nuevoId()}`, "PUT", { clienteId }),
    );

    expect(respuesta.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Un vencimiento que ya pasó, en la edición
// ---------------------------------------------------------------------------

describe("el vencimiento vencido de un borrador viejo", () => {
  /**
   * Un borrador abierto hace años y ya vencido, sembrado a mano.
   *
   * Es el caso que la base **no puede** atrapar y por el que la regla del
   * dominio no es una copia suya: `vence_en` es posterior a `fecha`, así que
   * `CHECK (vence_en >= fecha)` lo acepta sin decir nada, y la cotización
   * queda guardada vencida. Medido: con el `CHECK` como única guarda, este
   * `PUT` contesta 200 y escribe `2022-01-01T23:59:59.999Z`.
   */
  async function borradorVencido(): Promise<string> {
    const id = nuevoId();
    const abierto = "2021-03-01T10:00:00.000Z";

    await env.DB.prepare(
      "INSERT INTO cotizacion (id, tenant_id, cliente_id, codigo, estado," +
        " fecha, vence_en, moneda, creada_por, creada_en)" +
        " VALUES (?, ?, ?, ?, 'borrador', ?, ?, 'USD', ?, ?)",
    )
      .bind(
        id,
        TENANT_UNICO_ID,
        clienteId,
        "COT-2021-0001",
        abierto,
        "2022-01-01T23:59:59.999Z",
        autorId,
        abierto,
      )
      .run();

    return id;
  }

  it("rechaza ponerle un vencimiento nuevo que ya pasó", async () => {
    const id = await borradorVencido();

    const respuesta = await comoAutor(
      conCuerpo(`/api/cotizaciones/${id}`, "PUT", {
        clienteId,
        venceEn: ayer(),
      }),
    );

    expect(respuesta.status).toBe(422);
    expect(motivos(await fallasDe(respuesta))).toContain("vencimiento_pasado");
    expect(
      (await releer(id)).venceEn,
      "no se escribió el vencimiento pasado",
    ).toBe("2022-01-01");
  });

  it("deja reenviar el vencimiento vencido que ya tenía", async () => {
    // **La otra dirección, y la que evita un falso rechazo.** El formulario
    // manda el juego completo de campos (`PUT`, decisión de T-5), así que
    // quien abre un borrador viejo para corregirle el cliente reenvía el
    // vencimiento vencido sin tocarlo. Rechazarlo ahí bloquearía una edición
    // que no tiene nada que ver con el vencimiento, y obligaría a cambiar un
    // campo que la persona no quería cambiar.
    //
    // La regla no es «el vencimiento guardado tiene que ser futuro», es «no
    // se puede **poner** uno que ya pasó». Que un borrador viejo quede
    // vencido es un hecho, no una edición; que no se pueda emitir así es de
    // T-4, que es donde el vencimiento vuelve a importar.
    const id = await borradorVencido();

    const respuesta = await comoAutor(
      conCuerpo(`/api/cotizaciones/${id}`, "PUT", {
        clienteId: otroClienteId,
        venceEn: "2022-01-01",
      }),
    );

    expect(respuesta.status).toBe(200);

    const guardada = await releer(id);
    expect(guardada.clienteId).toBe(otroClienteId);
    expect(guardada.venceEn).toBe("2022-01-01");
  });

  it("deja vaciar el vencimiento vencido", async () => {
    const id = await borradorVencido();

    const respuesta = await comoAutor(
      conCuerpo(`/api/cotizaciones/${id}`, "PUT", {
        clienteId,
        venceEn: null,
      }),
    );

    expect(respuesta.status).toBe(200);
    expect((await releer(id)).venceEn).toBeNull();
  });

  it("deja corregirlo a un día futuro", async () => {
    const id = await borradorVencido();

    const respuesta = await comoAutor(
      conCuerpo(`/api/cotizaciones/${id}`, "PUT", {
        clienteId,
        venceEn: "2099-12-31",
      }),
    );

    expect(respuesta.status).toBe(200);
    expect((await releer(id)).venceEn).toBe("2099-12-31");
  });
});

// ---------------------------------------------------------------------------
// Lo que no es un borrador no se edita por acá
// ---------------------------------------------------------------------------

describe("una cotización que ya no es borrador", () => {
  /** La emite a mano: emitir es de T-4 y todavía no hay ruta que lo haga. */
  async function emitir(id: string): Promise<void> {
    await env.DB.prepare(
      "UPDATE cotizacion SET estado = 'emitida', snapshot = ? WHERE id = ?",
    )
      .bind('{"congelado":true}', id)
      .run();
  }

  it("contesta 409 con el estado que tiene, y no 500", async () => {
    const creada = await crear({ clienteId, venceEn: "2027-01-15" });
    await emitir(creada.id);

    const respuesta = await comoAutor(
      conCuerpo(`/api/cotizaciones/${creada.id}`, "PUT", {
        clienteId: otroClienteId,
      }),
    );

    // 409 y no 422 por lo mismo que `pendiente_ya_cerrado` en T-9: la
    // petición está bien formada y es el estado el que no la admite. Y el
    // cuerpo dice **cuál** estado, porque «ya no es borrador» sin decir en
    // qué quedó obliga a recargar para enterarse.
    expect(respuesta.status).toBe(409);
    expect(await respuesta.json()).toEqual({
      error: "cotizacion_no_es_borrador",
      estado: "emitida",
    });
  });

  it("el 409 no deja escrito nada", async () => {
    const creada = await crear({ clienteId, venceEn: "2027-01-15" });
    await emitir(creada.id);

    await comoAutor(
      conCuerpo(`/api/cotizaciones/${creada.id}`, "PUT", {
        clienteId: otroClienteId,
        venceEn: "2028-12-31",
      }),
    );

    const guardada = await releer(creada.id);
    expect(guardada.clienteId).toBe(clienteId);
    expect(guardada.venceEn).toBe("2027-01-15");
  });

  it("el rechazo es anterior a la validación del cuerpo", async () => {
    // Un cuerpo inválido sobre una emitida contesta 409 y no 422: lo que
    // bloquea es el estado, y decirle a la pantalla «arreglá el formulario»
    // la mandaría a corregir algo que no la va a dejar pasar igual.
    const creada = await crear();
    await emitir(creada.id);

    const respuesta = await comoAutor(
      conCuerpo(`/api/cotizaciones/${creada.id}`, "PUT", {}),
    );

    expect(respuesta.status).toBe(409);
  });

  it("se sigue pudiendo leer", async () => {
    const creada = await crear();
    await emitir(creada.id);

    expect((await releer(creada.id)).estado).toBe("emitida");
  });

  it("el puerto se niega igual, sin pasar por la ruta", async () => {
    // La ruta también comprueba el estado, para poder contestar 409 antes
    // que 422. Sin esta prueba, la comprobación del puerto sería una copia
    // que ningún camino alcanza y que por lo tanto ninguna prueba puede
    // matar: neutralizarla deja la suite entera en verde.
    //
    // Y no es una copia de adorno: T-4 (emitir) y T-5 (duplicar) van a
    // llamar a `actualizar` por su cuenta, y lo que les tiene que impedir
    // reescribir una emitida es esto, no la ruta que no van a usar. Se
    // prueba por donde ellos van a entrar.
    const creada = await crear();
    await emitir(creada.id);

    const puerto = cotizacionesSobreD1(
      baseSobreD1(env.DB, TENANT_UNICO_ID, autorId),
    );

    const resultado = await puerto.actualizar(TENANT_UNICO_ID, creada.id, {
      clienteId: otroClienteId,
      venceEn: null,
    });

    expect(resultado).toEqual({ estado: "no_es_borrador", actual: "emitida" });
    expect((await releer(creada.id)).clienteId).toBe(clienteId);
  });
});

// ---------------------------------------------------------------------------
// Los métodos que no existen
// ---------------------------------------------------------------------------

describe("los verbos que la colección no admite", () => {
  it("contesta 405 con `allow` en la colección", async () => {
    const respuesta = await comoAutor(
      peticion("/api/cotizaciones", { method: "DELETE" }),
    );

    expect(respuesta.status).toBe(405);
    expect(respuesta.headers.get("allow")).toBe("GET, POST");
  });

  it("contesta 405 con `allow` en una cotización", async () => {
    const creada = await crear();

    const respuesta = await comoAutor(
      peticion(`/api/cotizaciones/${creada.id}`, { method: "DELETE" }),
    );

    expect(respuesta.status).toBe(405);
    expect(respuesta.headers.get("allow")).toBe("GET, PUT");
  });

  it("una subruta que no existe cae en el 404 general", async () => {
    const creada = await crear();

    const respuesta = await comoAutor(
      peticion(`/api/cotizaciones/${creada.id}/modulos`),
    );

    expect(respuesta.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// La bitácora de la cotización
// ---------------------------------------------------------------------------

describe("la cotización deja su historia", () => {
  interface EntradaEnElCable {
    entidad: string;
    accion: string;
    detalle: string | null;
    usuarioNombre: string | null;
  }

  async function bitacoraDe(id: string): Promise<EntradaEnElCable[]> {
    const respuesta = await comoAutor(
      peticion(`/api/cotizaciones/${id}/bitacora`),
    );
    expect(respuesta.status).toBe(200);
    const cuerpo = (await respuesta.json()) as {
      entradas?: EntradaEnElCable[];
    };
    return cuerpo.entradas ?? [];
  }

  it("el alta queda registrada con el código como detalle", async () => {
    const creada = await crear();

    const entradas = await bitacoraDe(creada.id);
    expect(entradas).toHaveLength(1);
    expect(entradas[0].entidad).toBe("cotizacion");
    expect(entradas[0].accion).toBe("creado");
    expect(entradas[0].detalle).toBe(creada.codigo);
    expect(entradas[0].usuarioNombre).toBe("Itzel");
  });

  it("la edición queda registrada, y de la más nueva a la más vieja", async () => {
    const creada = await crear();

    await comoAutor(
      conCuerpo(`/api/cotizaciones/${creada.id}`, "PUT", {
        clienteId: otroClienteId,
      }),
    );

    const entradas = await bitacoraDe(creada.id);
    expect(entradas.map((cada) => cada.accion)).toEqual(["editado", "creado"]);
  });

  it("el 409 de una emitida no deja entrada", async () => {
    const creada = await crear();
    await env.DB.prepare(
      "UPDATE cotizacion SET estado = 'emitida', snapshot = '{}' WHERE id = ?",
    )
      .bind(creada.id)
      .run();

    await comoAutor(
      conCuerpo(`/api/cotizaciones/${creada.id}`, "PUT", { clienteId }),
    );

    expect((await bitacoraDe(creada.id)).map((cada) => cada.accion)).toEqual([
      "creado",
    ]);
  });

  it("contesta 404 por la bitácora de la cotización del vecino", async () => {
    const respuesta = await comoAutor(
      peticion(`/api/cotizaciones/${cotizacionAjenaId}/bitacora`),
    );

    expect(respuesta.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Sin identidad no hay dominio
// ---------------------------------------------------------------------------

describe("la puerta va antes que el dominio", () => {
  it("una petición sin identidad no llega al servicio", async () => {
    // Con el servicio real, un 403 no distingue «no se ejecutó» de «se
    // ejecutó y después se rechazó». El espía es lo único que lo distingue.
    let llamado = false;
    const espia = new Proxy(
      {},
      {
        get() {
          llamado = true;
          return () => {
            throw new Error("el dominio no se debe alcanzar sin identidad");
          };
        },
      },
    ) as ServicioDeCotizaciones;

    const respuesta = await sinIdentidad(peticion("/api/cotizaciones"), espia);

    expect(respuesta.status).toBe(403);
    expect(llamado, "el dominio se alcanzó sin identidad").toBe(false);
  });
});
