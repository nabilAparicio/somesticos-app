/**
 * La bitácora: quién hizo qué, sobre qué, y cuándo
 * (`odd/tasks/crm-procesos.md`, T-10).
 *
 * La decisión del usuario fija la granularidad: **eventos, no cambios campo
 * por campo**. Una entrada dice «el 3 de marzo Itzel movió este proceso a
 * Demanda presentada». No hay valor anterior ni valor posterior, y eso cubre
 * el 95 % de los «¿quién hizo esto?» sin pagar hoy por lo otro.
 *
 * Las cinco cosas que esta suite existe para fijar:
 *
 *  1. **La bitácora es inmutable**, como las notas desde T-2. Los dos
 *     disparadores nuevos rechazan `UPDATE` y `DELETE` **contra la base**, no
 *     contra la aplicación: un registro de auditoría que la consola de D1
 *     puede reescribir no es un registro de auditoría.
 *  2. **El vocabulario de `accion` y de `entidad` es cerrado, y lo cierra un
 *     `CHECK`.** Es la misma razón de §5 de `docs/diseno.md`: una regla que
 *     solo vive en el código es la que el primer script de importación se
 *     salta. Sin esto, en dos años conviven `crear`, `creado`, `create` y
 *     `CREAR` y ninguna consulta sirve.
 *  3. **No hay forma de escribir una entrada a mano por la API.** Ni ruta, ni
 *     verbo, ni identificador propio. Lo mismo que una nota, por el mismo
 *     argumento y un escalón más arriba.
 *  4. **Cada mutación deja su entrada**, con el autor resuelto por nombre en
 *     lectura, su momento y su entidad. Se comprueba **releyendo**, nunca por
 *     el código de respuesta de la escritura.
 *  5. **La bitácora de una entidad sale en orden** y no se escapa del tenant.
 *
 * ## Por qué esta suite tampoco borra nada
 *
 * Es el aviso que T-8 dejó escrito para T-9 y T-10, y acá se cumple del todo:
 * el disparador `bitacora_no_se_borra` no tiene condición, así que una
 * entrada no se borra **nunca**, tampoco desde la limpieza de una prueba. Y
 * como `bitacora.usuario_id` y `bitacora.tenant_id` son llaves foráneas en
 * `NO ACTION`, **con una entrada viva tampoco se borran su autor ni su
 * tenant**.
 *
 * Lo que sí se sigue pudiendo borrar es la fila que la entrada describe:
 * `entidad_id` es texto y no una llave foránea, a propósito, porque es
 * polimórfico. Un área borrada deja su entrada de bitácora en pie, que es
 * justamente para lo que sirve.
 *
 * El aislamiento se consigue al revés: **identificadores nuevos en cada
 * prueba**, incluido el del tenant vecino, y toda afirmación acotada a su
 * entidad.
 */
import { env } from "cloudflare:workers";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { TENANT_UNICO_ID, nuevoId } from "../worker/db/ids";
import { manejar } from "../worker/index";
import type { ServicioDeBitacora } from "../worker/bitacora/repositorio";
import {
  ACCIONES_DE_BITACORA,
  ENTIDADES_REGISTRADAS,
} from "../worker/bitacora/vocabulario";

const DOMINIO_DE_ACCESS = "https://bufete-de-prueba.cloudflareaccess.com";
const AUD = "aud-de-la-aplicacion-del-bufete";

const EMAIL_AUTOR = "itzel@bufete.test";
const EMAIL_SOCIO = "ricardo@bufete.test";

const NOMBRE_AUTOR = "Itzel";
const NOMBRE_SOCIO = "Ricardo";

const PLAN_DE_RESIDENCIA = [
  "Recepción y revisión de documentos",
  "Presentación ante el Servicio Nacional de Migración",
  "Entrevista y verificación domiciliaria",
  "Resolución y entrega del carné",
] as const;

interface EntradaEnElCable {
  id: string;
  entidad: string;
  entidadId: string;
  accion: string;
  usuarioId: string;
  usuarioNombre: string | null;
  ocurridoEn: string;
  detalle: string | null;
}

interface BitacoraEnElCable {
  entradas: EntradaEnElCable[];
}

let autorId: string;
let socioId: string;

let OTRO_TENANT_ID: string;
let usuarioAjenoId: string;
let clienteId: string;
let clienteAjenoId: string;
let areaId: string;
let tipoResidenciaId: string;
let procesoAjenoId: string;
let areaAjenaId: string;
let tipoAjenoId: string;
/** T-15: el tercer catálogo del vecino, para su propia prueba de fuga. */
let tipoClienteAjenoId: string;

// Los nombres de catálogo del bufete llevan pegado su identificador porque
// `0003_tenencia_y_unicidad.sql` los hace únicos por tenant y este archivo no
// limpia entre pruebas: sin el sufijo, el `beforeEach` de la segunda prueba
// chocaría con el área que sembró la primera. El del tipo de proceso se
// guarda aparte porque una prueba lo lee como detalle de bitácora.
let nombreAreaMigracion: string;
let nombreTipoResidencia: string;

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
  espia: ServicioDeBitacora,
): Promise<Response> {
  return manejar(request, entorno(), {
    correoDeDesarrollo: () => null,
    bitacora: espia,
  });
}

// --- Lecturas -------------------------------------------------------------

/**
 * La bitácora de una entidad, leída **por debajo de la API**.
 *
 * Hace falta porque los eventos de catálogo —áreas, tipos de proceso, tipos
 * de cliente— se registran pero todavía no tienen pantalla: T-10 muestra la
 * del proceso y la del cliente, que son las dos que el bufete pide. Que no
 * se vean no es excusa para no comprobarlos: el día que se les ponga
 * pantalla, la historia tiene que estar ahí.
 */
async function entradasEnLaBase(
  entidad: string,
  entidadId: string,
): Promise<EntradaEnElCable[]> {
  const { results } = await env.DB.prepare(
    "SELECT b.id, b.entidad, b.entidad_id, b.accion, b.usuario_id," +
      " u.nombre AS usuario_nombre, b.ocurrido_en, b.detalle" +
      " FROM bitacora b" +
      " LEFT JOIN usuario u ON u.id = b.usuario_id" +
      "   AND u.tenant_id = b.tenant_id" +
      " WHERE b.tenant_id = ? AND b.entidad = ? AND b.entidad_id = ?" +
      " ORDER BY b.ocurrido_en, b.rowid",
  )
    .bind(TENANT_UNICO_ID, entidad, entidadId)
    .all<{
      id: string;
      entidad: string;
      entidad_id: string;
      accion: string;
      usuario_id: string;
      usuario_nombre: string | null;
      ocurrido_en: string;
      detalle: string | null;
    }>();

  return results.map((fila) => ({
    id: fila.id,
    entidad: fila.entidad,
    entidadId: fila.entidad_id,
    accion: fila.accion,
    usuarioId: fila.usuario_id,
    usuarioNombre: fila.usuario_nombre,
    ocurridoEn: fila.ocurrido_en,
    detalle: fila.detalle,
  }));
}

/** La bitácora de un proceso, por la API: la lectura que prueba la pantalla. */
async function bitacoraDeProceso(
  procesoId: string,
): Promise<EntradaEnElCable[]> {
  const respuesta = await comoAutor(
    peticion(`/api/procesos/${procesoId}/bitacora`),
  );
  expect(respuesta.status).toBe(200);
  return ((await respuesta.json()) as BitacoraEnElCable).entradas;
}

async function bitacoraDeCliente(id: string): Promise<EntradaEnElCable[]> {
  const respuesta = await comoAutor(peticion(`/api/clientes/${id}/bitacora`));
  expect(respuesta.status).toBe(200);
  return ((await respuesta.json()) as BitacoraEnElCable).entradas;
}

function acciones(entradas: readonly EntradaEnElCable[]): string[] {
  return entradas.map((entrada) => entrada.accion);
}

// --- Altas de conveniencia ------------------------------------------------

async function crearCliente(nombre: string): Promise<string> {
  const respuesta = await comoAutor(
    conCuerpo("/api/clientes", "POST", {
      nombre,
      telefono: "+507 6123-4567",
    }),
  );
  expect(respuesta.status).toBe(201);
  return ((await respuesta.json()) as { cliente: { id: string } }).cliente.id;
}

async function crearArea(nombre: string): Promise<string> {
  const respuesta = await comoAutor(conCuerpo("/api/areas", "POST", { nombre }));
  expect(respuesta.status).toBe(201);
  return ((await respuesta.json()) as { area: { id: string } }).area.id;
}

async function crearTipoCliente(nombre: string): Promise<string> {
  const respuesta = await comoAutor(
    conCuerpo("/api/tipos-cliente", "POST", { nombre }),
  );
  expect(respuesta.status).toBe(201);
  return ((await respuesta.json()) as { tipo: { id: string } }).tipo.id;
}

async function crearTipoProceso(nombre: string): Promise<string> {
  const respuesta = await comoAutor(
    conCuerpo("/api/tipos-proceso", "POST", { areaId, nombre }),
  );
  expect(respuesta.status).toBe(201);
  return ((await respuesta.json()) as { tipo: { id: string } }).tipo.id;
}

async function crearProceso(
  titulo = "Residencia permanente de Marta Quintero",
  quien: (request: Request) => Promise<Response> = comoAutor,
): Promise<string> {
  const respuesta = await quien(
    conCuerpo("/api/procesos", "POST", {
      clienteId,
      tipoProcesoId: tipoResidenciaId,
      titulo,
    }),
  );
  expect(respuesta.status).toBe(201);
  return ((await respuesta.json()) as { proceso: { id: string } }).proceso.id;
}

async function etapasDe(
  procesoId: string,
): Promise<{ id: string; nombre: string }[]> {
  const respuesta = await comoAutor(peticion(`/api/procesos/${procesoId}`));
  expect(respuesta.status).toBe(200);
  return ((await respuesta.json()) as {
    etapas: { id: string; nombre: string }[];
  }).etapas;
}

/**
 * Las dos personas del bufete se crean **una sola vez**: `usuario` lleva
 * `UNIQUE (tenant_id, email)` desde T-2, y con una entrada de bitácora viva
 * tampoco se pueden borrar para volver a insertarlas.
 */
beforeAll(async () => {
  autorId = nuevoId();
  socioId = nuevoId();

  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO usuario (id, tenant_id, nombre, email, activo)" +
        " VALUES (?, ?, ?, ?, 1)",
    ).bind(autorId, TENANT_UNICO_ID, NOMBRE_AUTOR, EMAIL_AUTOR),
    env.DB.prepare(
      "INSERT INTO usuario (id, tenant_id, nombre, email, activo)" +
        " VALUES (?, ?, ?, ?, 1)",
    ).bind(socioId, TENANT_UNICO_ID, NOMBRE_SOCIO, EMAIL_SOCIO),
  ]);
});

beforeEach(async () => {
  OTRO_TENANT_ID = nuevoId();
  usuarioAjenoId = nuevoId();
  clienteId = nuevoId();
  clienteAjenoId = nuevoId();
  areaId = nuevoId();
  tipoResidenciaId = nuevoId();
  procesoAjenoId = nuevoId();
  areaAjenaId = nuevoId();
  tipoAjenoId = nuevoId();
  tipoClienteAjenoId = nuevoId();
  nombreAreaMigracion = `Migración y naturalización ${areaId}`;
  nombreTipoResidencia =
    `Residencia permanente por matrimonio con nacional ${tipoResidenciaId}`;

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
    ).bind(areaId, TENANT_UNICO_ID, nombreAreaMigracion),
    env.DB.prepare(
      "INSERT INTO tipo_proceso (id, tenant_id, area_id, nombre, activo)" +
        " VALUES (?, ?, ?, ?, 1)",
    ).bind(
      tipoResidenciaId,
      TENANT_UNICO_ID,
      areaId,
      nombreTipoResidencia,
    ),
    ...PLAN_DE_RESIDENCIA.map((nombre, orden) =>
      env.DB.prepare(
        "INSERT INTO etapa_plantilla (id, tenant_id, tipo_proceso_id," +
          " nombre, orden) VALUES (?, ?, ?, ?, ?)",
      ).bind(nuevoId(), TENANT_UNICO_ID, tipoResidenciaId, nombre, orden),
    ),

    // Lo del vecino: el objeto de las pruebas de fuga.
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
    // Su área y su tipo propios. Hasta T-12 este proceso colgaba del
    // `tipo_proceso` NUESTRO, que es exactamente la fila cruzada que M-3
    // ahora hace inexpresable: el andamio estaba mal, no la guarda.
    env.DB.prepare(
      "INSERT INTO area (id, tenant_id, nombre, activo) VALUES (?, ?, ?, 1)",
    ).bind(areaAjenaId, OTRO_TENANT_ID, "Área del vecino"),
    env.DB.prepare(
      "INSERT INTO tipo_proceso (id, tenant_id, area_id, nombre, activo)" +
        " VALUES (?, ?, ?, ?, 1)",
    ).bind(tipoAjenoId, OTRO_TENANT_ID, areaAjenaId, "Tipo del vecino"),
    env.DB.prepare(
      "INSERT INTO tipo_cliente (id, tenant_id, nombre, activo)" +
        " VALUES (?, ?, ?, 1)",
    ).bind(tipoClienteAjenoId, OTRO_TENANT_ID, "Tipo de cliente del vecino"),
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
  ]);
});

// ---------------------------------------------------------------------------
// La bitácora es inmutable: los dos disparadores
// ---------------------------------------------------------------------------

describe("una entrada de bitácora no se reescribe ni se borra", () => {
  /** Una entrada real, puesta por una mutación real. */
  async function unaEntrada(): Promise<EntradaEnElCable> {
    const id = await crearCliente("Carlos Pérez");
    const entradas = await entradasEnLaBase("cliente", id);
    expect(entradas).toHaveLength(1);
    return entradas[0];
  }

  it("rechaza un UPDATE directo contra la tabla", async () => {
    const entrada = await unaEntrada();

    await expect(
      env.DB.prepare("UPDATE bitacora SET accion = 'editado' WHERE id = ?")
        .bind(entrada.id)
        .run(),
    ).rejects.toThrow(/inmutable/i);

    const despues = await entradasEnLaBase("cliente", entrada.entidadId);
    expect(despues[0].accion, "la entrada quedó como estaba").toBe("creado");
  });

  it("rechaza un UPDATE que ni siquiera cambia nada", async () => {
    // El disparador no tiene condición a propósito: «reescribir con el mismo
    // valor» sigue siendo reescribir, y una excepción ahí sería la grieta
    // por la que mañana entra un `SET detalle = detalle, usuario_id = …`.
    const entrada = await unaEntrada();

    await expect(
      env.DB.prepare("UPDATE bitacora SET detalle = detalle WHERE id = ?")
        .bind(entrada.id)
        .run(),
    ).rejects.toThrow(/inmutable/i);
  });

  it("rechaza un DELETE directo contra la tabla", async () => {
    const entrada = await unaEntrada();

    await expect(
      env.DB.prepare("DELETE FROM bitacora WHERE id = ?")
        .bind(entrada.id)
        .run(),
    ).rejects.toThrow(/inmutable/i);

    expect(await entradasEnLaBase("cliente", entrada.entidadId)).toHaveLength(
      1,
    );
  });

  it("rechaza un DELETE masivo sin WHERE", async () => {
    await unaEntrada();

    await expect(
      env.DB.prepare("DELETE FROM bitacora").run(),
    ).rejects.toThrow(/inmutable/i);
  });

  it("no impide borrar la fila que la entrada describe", async () => {
    // `entidad_id` es TEXT y no una llave foránea, a propósito: es
    // polimórfico. Un área borrada deja su entrada en pie, que es
    // exactamente para lo que existe un registro de auditoría.
    const id = await crearArea("Área efímera");

    const borrado = await comoAutor(
      peticion(`/api/areas/${id}`, { method: "DELETE" }),
    );
    expect(borrado.status).toBe(204);

    expect(acciones(await entradasEnLaBase("area", id))).toEqual([
      "creado",
      "borrado",
    ]);
  });
});

// ---------------------------------------------------------------------------
// El vocabulario cerrado
// ---------------------------------------------------------------------------

describe("el vocabulario de la bitácora lo cierra la base", () => {
  function insertar(
    entidad: string,
    accion: string,
  ): Promise<D1Result> {
    return env.DB.prepare(
      "INSERT INTO bitacora (id, tenant_id, entidad, entidad_id, accion," +
        " usuario_id, ocurrido_en) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(
        nuevoId(),
        TENANT_UNICO_ID,
        entidad,
        nuevoId(),
        accion,
        autorId,
        new Date().toISOString(),
      )
      .run();
  }

  // Las cuatro formas en que el mismo evento se escribiría distinto si nadie
  // cerrara el vocabulario. En dos años conviven las cuatro y ninguna
  // consulta sirve.
  const fueraDelVocabulario = [
    "crear",
    "create",
    "CREADO",
    "Creado",
    "",
    "cliente_creado",
  ];

  it.each(fueraDelVocabulario)(
    "rechaza la acción «%s»",
    async (accion) => {
      await expect(insertar("cliente", accion)).rejects.toThrow(
        /CHECK constraint failed/i,
      );
    },
  );

  it.each(["proceso_etapa", "Cliente", "nota", ""])(
    "rechaza la entidad «%s»",
    async (entidad) => {
      await expect(insertar(entidad, "creado")).rejects.toThrow(
        /CHECK constraint failed/i,
      );
    },
  );

  it("deja entrar una acción del vocabulario", async () => {
    // El contrapeso: sin él, un `CHECK` que rechazara *todo* pasaría
    // desapercibido y las pruebas de arriba seguirían en verde.
    const resultado = await insertar("cliente", "creado");

    expect(resultado.meta.changes).toBe(1);
  });

  it("rechaza un momento que no es la forma canónica", async () => {
    // La misma ida y vuelta de T-2: el `CHECK` nuevo de `accion` no puede
    // haberse llevado puesto el de `ocurrido_en` al reconstruir la tabla.
    await expect(
      env.DB.prepare(
        "INSERT INTO bitacora (id, tenant_id, entidad, entidad_id, accion," +
          " usuario_id, ocurrido_en) VALUES (?, ?, 'cliente', ?, 'creado'," +
          " ?, '2026-03-03')",
      )
        .bind(nuevoId(), TENANT_UNICO_ID, nuevoId(), autorId)
        .run(),
    ).rejects.toThrow(/CHECK constraint failed/i);
  });

  it("sigue exigiendo un autor que exista", async () => {
    // I-6 (`docs/diseno.md` §5): toda entrada de bitácora tiene autor, y el
    // autor es una llave foránea real, no un nombre en texto.
    //
    // Desde `0003_tenencia_y_unicidad.sql` el rechazo llega un paso antes y
    // con otro mensaje: su `BEFORE INSERT` corre antes que la llave foránea
    // y compara con `IS NOT`, así que el autor inexistente —subconsulta
    // vacía, o sea NULL— le cuenta como tenencia incoherente. La llave
    // foránea sigue puesta detrás; lo que cambió es quién llega primero.
    await expect(
      env.DB.prepare(
        "INSERT INTO bitacora (id, tenant_id, entidad, entidad_id, accion," +
          " usuario_id, ocurrido_en) VALUES (?, ?, 'cliente', ?, 'creado'," +
          " ?, ?)",
      )
        .bind(
          nuevoId(),
          TENANT_UNICO_ID,
          nuevoId(),
          nuevoId(),
          new Date().toISOString(),
        )
        .run(),
    ).rejects.toThrow(/tenencia cruzada: bitacora/);
  });
});

// ---------------------------------------------------------------------------
// No hay forma de escribir una entrada por la API
// ---------------------------------------------------------------------------

describe("la API no deja escribir, editar ni borrar una entrada", () => {
  const escrituras = ["POST", "PUT", "PATCH", "DELETE"] as const;

  it.each(escrituras)("contesta 405 a un %s sobre la de un proceso", async (
    metodo,
  ) => {
    const procesoId = await crearProceso();

    const respuesta = await comoAutor(
      peticion(`/api/procesos/${procesoId}/bitacora`, { method: metodo }),
    );

    expect(respuesta.status).toBe(405);
    expect(respuesta.headers.get("allow")).toBe("GET");
  });

  it.each(escrituras)("contesta 405 a un %s sobre la de un cliente", async (
    metodo,
  ) => {
    const respuesta = await comoAutor(
      peticion(`/api/clientes/${clienteId}/bitacora`, { method: metodo }),
    );

    expect(respuesta.status).toBe(405);
    expect(respuesta.headers.get("allow")).toBe("GET");
  });

  it.each(["GET", "POST", "PUT", "DELETE"])(
    "no existe /api/bitacora para %s",
    async (metodo) => {
      // Una entrada no tiene dirección propia, igual que una nota: darle una
      // sería estrenar la superficie sobre la que mañana alguien cuelga un
      // `DELETE`.
      const respuesta = await comoAutor(
        peticion("/api/bitacora", { method: metodo }),
      );

      expect(respuesta.status).toBe(404);
    },
  );

  it("no existe la dirección de una entrada suelta", async () => {
    const procesoId = await crearProceso();
    const entradas = await bitacoraDeProceso(procesoId);
    expect(entradas.length).toBeGreaterThan(0);

    const respuesta = await comoAutor(
      peticion(`/api/procesos/${procesoId}/bitacora/${entradas[0].id}`),
    );

    expect(respuesta.status).toBe(404);
  });

  it("un POST a la bitácora no agrega ninguna entrada", async () => {
    const procesoId = await crearProceso();
    const antes = (await bitacoraDeProceso(procesoId)).length;

    await comoAutor(
      conCuerpo(`/api/procesos/${procesoId}/bitacora`, "POST", {
        entidad: "proceso",
        entidadId: procesoId,
        accion: "creado",
      }),
    );

    expect(await bitacoraDeProceso(procesoId)).toHaveLength(antes);
  });
});

// ---------------------------------------------------------------------------
// Tenencia e identidad
// ---------------------------------------------------------------------------

describe("la bitácora no se lee desde afuera", () => {
  function espia(): ServicioDeBitacora & { llamado: boolean } {
    const registro = {
      llamado: false,
      listar: (): Promise<never[]> => {
        registro.llamado = true;
        return Promise.resolve([]);
      },
    };
    return registro as unknown as ServicioDeBitacora & { llamado: boolean };
  }

  it("contesta 403 sin identidad de Access, sobre un proceso", async () => {
    const vigilante = espia();

    const respuesta = await sinIdentidad(
      peticion(`/api/procesos/${nuevoId()}/bitacora`),
      vigilante,
    );

    expect(respuesta.status).toBe(403);
    expect(vigilante.llamado, "no llegó al dominio").toBe(false);
  });

  it("contesta 403 sin identidad de Access, sobre un cliente", async () => {
    const vigilante = espia();

    const respuesta = await sinIdentidad(
      peticion(`/api/clientes/${clienteId}/bitacora`),
      vigilante,
    );

    expect(respuesta.status).toBe(403);
    expect(vigilante.llamado, "no llegó al dominio").toBe(false);
  });

  it("contesta 404 para el proceso de otro tenant", async () => {
    const respuesta = await comoAutor(
      peticion(`/api/procesos/${procesoAjenoId}/bitacora`),
    );

    expect(respuesta.status).toBe(404);
  });

  it("contesta 404 para el cliente de otro tenant", async () => {
    const respuesta = await comoAutor(
      peticion(`/api/clientes/${clienteAjenoId}/bitacora`),
    );

    expect(respuesta.status).toBe(404);
  });

  it("contesta 404 para un proceso que no existe", async () => {
    const respuesta = await comoAutor(
      peticion(`/api/procesos/${nuevoId()}/bitacora`),
    );

    expect(respuesta.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Contrapesos: cada mutación deja su entrada
// ---------------------------------------------------------------------------

describe("el alta y la edición de un cliente quedan registradas", () => {
  it("registra el alta con su autor, su momento y su entidad", async () => {
    const antes = Date.now() - 1000;
    const id = await crearCliente("Carlos Pérez");

    const entradas = await bitacoraDeCliente(id);

    expect(entradas).toHaveLength(1);
    expect(entradas[0].entidad).toBe("cliente");
    expect(entradas[0].entidadId).toBe(id);
    expect(entradas[0].accion).toBe("creado");
    expect(entradas[0].usuarioId).toBe(autorId);
    expect(entradas[0].usuarioNombre, "el nombre se resuelve en lectura").toBe(
      NOMBRE_AUTOR,
    );
    expect(entradas[0].detalle).toBe("Carlos Pérez");

    const momento = new Date(entradas[0].ocurridoEn);
    expect(momento.toISOString()).toBe(entradas[0].ocurridoEn);
    expect(momento.getTime()).toBeGreaterThanOrEqual(antes);
  });

  it("registra la edición debajo del alta, en orden", async () => {
    const id = await crearCliente("Carlos Pérez");

    const edicion = await comoSocio(
      conCuerpo(`/api/clientes/${id}`, "PUT", {
        nombre: "Carlos Pérez Rodríguez",
        telefono: "+507 6123-4567",
      }),
    );
    expect(edicion.status).toBe(200);

    const entradas = await bitacoraDeCliente(id);

    expect(acciones(entradas)).toEqual(["creado", "editado"]);
    expect(entradas.map((e) => e.usuarioNombre)).toEqual([
      NOMBRE_AUTOR,
      NOMBRE_SOCIO,
    ]);
    expect(entradas[1].detalle).toBe("Carlos Pérez Rodríguez");
  });

  it("no registra nada cuando el alta se rechaza", async () => {
    // Un rechazo no es un hecho del sistema: la bitácora cuenta lo que pasó,
    // no lo que alguien intentó.
    const respuesta = await comoAutor(
      conCuerpo("/api/clientes", "POST", { nombre: "Sin contacto" }),
    );
    expect(respuesta.status).toBe(422);

    const { results } = await env.DB.prepare(
      "SELECT count(*) AS cuantas FROM bitacora" +
        " WHERE tenant_id = ? AND entidad = 'cliente' AND detalle = ?",
    )
      .bind(TENANT_UNICO_ID, "Sin contacto")
      .all<{ cuantas: number }>();

    expect(results[0].cuantas).toBe(0);
  });
});

describe("los catálogos registran sus cuatro movimientos", () => {
  it("registra el alta, la edición, la baja y el borrado de un área", async () => {
    const id = await crearArea("Familia");

    await comoAutor(
      conCuerpo(`/api/areas/${id}`, "PUT", { nombre: "Familia y sucesiones", activo: true }),
    );
    await comoAutor(
      conCuerpo(`/api/areas/${id}`, "PUT", { nombre: "Familia y sucesiones", activo: false }),
    );
    await comoAutor(
      conCuerpo(`/api/areas/${id}`, "PUT", { nombre: "Familia y sucesiones", activo: true }),
    );
    await comoAutor(peticion(`/api/areas/${id}`, { method: "DELETE" }));

    expect(acciones(await entradasEnLaBase("area", id))).toEqual([
      "creado",
      "editado",
      "dado_de_baja",
      "reactivado",
      "borrado",
    ]);
  });

  it("registra lo mismo para un tipo de cliente", async () => {
    const id = await crearTipoCliente("Fundación de interés privado");

    await comoAutor(
      conCuerpo(`/api/tipos-cliente/${id}`, "PUT", {
        nombre: "Fundación de interés privado",
        activo: false,
      }),
    );

    expect(acciones(await entradasEnLaBase("tipo_cliente", id))).toEqual([
      "creado",
      "dado_de_baja",
    ]);
  });

  it("registra lo mismo para un tipo de proceso", async () => {
    const id = await crearTipoProceso("Visa de pensionado");

    await comoAutor(
      conCuerpo(`/api/tipos-proceso/${id}`, "PUT", {
        areaId,
        nombre: "Visa de pensionado rentista",
        descripcion: null,
        activo: true,
      }),
    );

    const entradas = await entradasEnLaBase("tipo_proceso", id);
    expect(acciones(entradas)).toEqual(["creado", "editado"]);
    expect(entradas[1].detalle).toBe("Visa de pensionado rentista");
  });

  it("registra el guardado de la plantilla de un tipo de proceso", async () => {
    const id = await crearTipoProceso("Visa de trabajo");

    const respuesta = await comoSocio(
      conCuerpo(`/api/tipos-proceso/${id}/etapas`, "PUT", {
        etapas: [{ id: null, nombre: "Recepción de documentos" }],
      }),
    );
    expect(respuesta.status).toBe(200);

    const entradas = await entradasEnLaBase("tipo_proceso", id);
    expect(acciones(entradas)).toEqual(["creado", "plantilla_editada"]);
    expect(entradas[1].usuarioNombre).toBe(NOMBRE_SOCIO);
  });
});

// ---------------------------------------------------------------------------
// T-15 · los catálogos estrenan su dirección de lectura
// ---------------------------------------------------------------------------
//
// Hasta acá los hechos de `area`, `tipo_cliente` y `tipo_proceso` se
// comprobaban leyendo la tabla (`entradasEnLaBase`), porque la ruta solo
// conocía el proceso y el cliente. Ahora las tres tienen dirección, y lo que
// importa es que la estrenen con las mismas guardas que las dos viejas: el
// 404 del vecino, el 404 de lo que no existe, el 405 de toda escritura y el
// 403 de antes de la puerta. Una entidad nueva con la lectura abierta y la
// guarda a medias es una fuga, no una pantalla.

const CATALOGOS = [
  { coleccion: "areas", entidad: "area" },
  { coleccion: "tipos-cliente", entidad: "tipo_cliente" },
  { coleccion: "tipos-proceso", entidad: "tipo_proceso" },
] as const;

type ColeccionDeCatalogo = (typeof CATALOGOS)[number]["coleccion"];

/** La fila del vecino de esa colección: el objeto de la prueba de fuga. */
function ajenaDe(coleccion: ColeccionDeCatalogo): string {
  switch (coleccion) {
    case "areas":
      return areaAjenaId;
    case "tipos-cliente":
      return tipoClienteAjenoId;
    case "tipos-proceso":
      return tipoAjenoId;
  }
}

/** Un alta nuestra en esa colección, por la API, con su entrada de alta. */
function crearEnCatalogo(
  coleccion: ColeccionDeCatalogo,
  nombre: string,
): Promise<string> {
  switch (coleccion) {
    case "areas":
      return crearArea(nombre);
    case "tipos-cliente":
      return crearTipoCliente(nombre);
    case "tipos-proceso":
      return crearTipoProceso(nombre);
  }
}

/** La edición que deja la segunda entrada. */
function editarEnCatalogo(
  coleccion: ColeccionDeCatalogo,
  id: string,
  nombre: string,
): Promise<Response> {
  const cuerpo =
    coleccion === "tipos-proceso"
      ? { areaId, nombre, descripcion: null, activo: true }
      : { nombre, activo: true };

  return comoAutor(conCuerpo(`/api/${coleccion}/${id}`, "PUT", cuerpo));
}

describe("la bitácora de los catálogos se lee por su entidad", () => {
  // El contrapeso de todo el bloque: sin esto, las cuatro pruebas de
  // rechazo de abajo pasarían igual con la ruta devolviendo 404 siempre.
  it.each(CATALOGOS)(
    "$coleccion contesta por la API lo mismo que quedó en la tabla",
    async ({ coleccion, entidad }) => {
      const nombre = `Catálogo ${nuevoId()}`;
      const id = await crearEnCatalogo(coleccion, nombre);
      const otroNombre = `${nombre} corregido`;
      expect((await editarEnCatalogo(coleccion, id, otroNombre)).status).toBe(
        200,
      );

      const respuesta = await comoAutor(
        peticion(`/api/${coleccion}/${id}/bitacora`),
      );
      expect(respuesta.status).toBe(200);

      const entradas = ((await respuesta.json()) as BitacoraEnElCable)
        .entradas;

      expect(acciones(entradas)).toEqual(["creado", "editado"]);
      expect(entradas.map((entrada) => entrada.entidad)).toEqual([
        entidad,
        entidad,
      ]);
      expect(entradas[1].detalle).toBe(otroNombre);
      expect(entradas[1].usuarioNombre).toBe(NOMBRE_AUTOR);

      // Y es exactamente lo que hay en la tabla: la ruta no filtra ni
      // reordena nada por su cuenta.
      expect(entradas).toEqual(await entradasEnLaBase(entidad, id));
    },
  );

  // La prueba que de verdad protege la historia. Una lista vacía con 200
  // sería una fuga: confirmaría que ese identificador existe en alguna
  // parte, que es justo lo que el 404 de T-5 en adelante niega.
  it.each(CATALOGOS)(
    "contesta 404 para la fila de $coleccion del vecino, y no una lista vacía",
    async ({ coleccion }) => {
      const respuesta = await comoAutor(
        peticion(`/api/${coleccion}/${ajenaDe(coleccion)}/bitacora`),
      );

      expect(respuesta.status).toBe(404);
    },
  );

  it.each(CATALOGOS)(
    "contesta 404 para una fila de $coleccion que no existe",
    async ({ coleccion }) => {
      const respuesta = await comoAutor(
        peticion(`/api/${coleccion}/${nuevoId()}/bitacora`),
      );

      expect(respuesta.status).toBe(404);
    },
  );

  // El vecino tampoco se entera por el verbo: un 405 antes del 404 diría
  // «esa dirección existe» sin preguntarle a nadie de quién es la fila.
  it.each(CATALOGOS)(
    "contesta 405 con allow GET a toda escritura sobre la de $coleccion",
    async ({ coleccion }) => {
      const id = await crearEnCatalogo(coleccion, `Catálogo ${nuevoId()}`);

      for (const metodo of ["POST", "PUT", "PATCH", "DELETE"]) {
        const respuesta = await comoAutor(
          peticion(`/api/${coleccion}/${id}/bitacora`, { method: metodo }),
        );

        expect(respuesta.status, metodo).toBe(405);
        expect(respuesta.headers.get("allow"), metodo).toBe("GET");
      }
    },
  );

  it.each(CATALOGOS)(
    "contesta 403 sin identidad de Access sobre la de $coleccion",
    async ({ coleccion }) => {
      const registro = {
        llamado: false,
        listar: (): Promise<never[]> => {
          registro.llamado = true;
          return Promise.resolve([]);
        },
      };
      const vigilante = registro as unknown as ServicioDeBitacora;

      const respuesta = await sinIdentidad(
        peticion(`/api/${coleccion}/${nuevoId()}/bitacora`),
        vigilante,
      );

      expect(respuesta.status).toBe(403);
      expect(registro.llamado, "no llegó al dominio").toBe(false);
    },
  );

  // Lo que la dirección **no** alcanza, dicho acá para que sea una decisión
  // y no una sorpresa: la dirección cuelga de la entidad, así que una fila
  // borrada de verdad deja sus entradas en la tabla —incluida la de
  // `borrado`— y ya no tiene por dónde pedirse. Es el mismo trato que la
  // bitácora del proceso y la del cliente, y la política de T-6 lo hace
  // raro en la práctica: lo normal es dar de baja, que sí conserva la fila.
  it("una fila dada de baja conserva su dirección; una borrada la pierde", async () => {
    const deBaja = await crearArea(`Dada de baja ${nuevoId()}`);
    expect(
      (
        await comoAutor(
          conCuerpo(`/api/areas/${deBaja}`, "PUT", {
            nombre: `Dada de baja ${deBaja}`,
            activo: false,
          }),
        )
      ).status,
    ).toBe(200);

    const viva = await comoAutor(peticion(`/api/areas/${deBaja}/bitacora`));
    expect(viva.status).toBe(200);
    expect(
      acciones(((await viva.json()) as BitacoraEnElCable).entradas),
    ).toEqual(["creado", "dado_de_baja"]);

    const borrada = await crearArea(`Borrada ${nuevoId()}`);
    expect(
      (await comoAutor(peticion(`/api/areas/${borrada}`, { method: "DELETE" })))
        .status,
    ).toBe(204);

    expect(
      (await comoAutor(peticion(`/api/areas/${borrada}/bitacora`))).status,
    ).toBe(404);

    // Pero los hechos siguen ahí: lo que se perdió es la dirección, no la
    // historia. Esa es la mitad de para qué existe un registro de auditoría.
    expect(acciones(await entradasEnLaBase("area", borrada))).toEqual([
      "creado",
      "borrado",
    ]);
  });
});

describe("el proceso registra su vida entera", () => {
  it("registra el alta con el título como detalle", async () => {
    const procesoId = await crearProceso();

    const entradas = await bitacoraDeProceso(procesoId);

    expect(acciones(entradas)).toEqual(["creado"]);
    expect(entradas[0].entidad).toBe("proceso");
    expect(entradas[0].entidadId).toBe(procesoId);
    expect(entradas[0].detalle).toBe(
      "Residencia permanente de Marta Quintero",
    );
  });

  it("registra el avance de etapa diciendo a cuál", async () => {
    // El ejemplo textual del usuario: «el 3 de marzo Itzel movió este
    // proceso a Demanda presentada».
    const procesoId = await crearProceso();

    const avance = await comoSocio(
      peticion(`/api/procesos/${procesoId}/avanzar`, { method: "POST" }),
    );
    expect(avance.status).toBe(200);

    const entradas = await bitacoraDeProceso(procesoId);

    expect(acciones(entradas)).toEqual(["creado", "etapa_alcanzada"]);
    expect(entradas[1].usuarioNombre).toBe(NOMBRE_SOCIO);
    expect(entradas[1].detalle).toBe(PLAN_DE_RESIDENCIA[0]);
  });

  it("no registra un avance que no avanzó nada", async () => {
    const procesoId = await crearProceso();

    for (const paso of PLAN_DE_RESIDENCIA) {
      expect(paso.length).toBeGreaterThan(0);
      await comoAutor(
        peticion(`/api/procesos/${procesoId}/avanzar`, { method: "POST" }),
      );
    }

    const choque = await comoAutor(
      peticion(`/api/procesos/${procesoId}/avanzar`, { method: "POST" }),
    );
    expect(choque.status).toBe(409);

    expect(acciones(await bitacoraDeProceso(procesoId))).toEqual([
      "creado",
      "etapa_alcanzada",
      "etapa_alcanzada",
      "etapa_alcanzada",
      "etapa_alcanzada",
    ]);
  });

  it("registra la edición del plan", async () => {
    const procesoId = await crearProceso();
    const etapas = await etapasDe(procesoId);

    const respuesta = await comoAutor(
      conCuerpo(`/api/procesos/${procesoId}/etapas`, "PUT", {
        etapas: [
          ...etapas.map((etapa) => ({ id: etapa.id, nombre: etapa.nombre })),
          { id: null, nombre: "Apostilla del acta de matrimonio" },
        ],
      }),
    );
    expect(respuesta.status).toBe(200);

    expect(acciones(await bitacoraDeProceso(procesoId))).toEqual([
      "creado",
      "plan_editado",
    ]);
  });

  it("registra el guardado del plan como plantilla", async () => {
    const procesoId = await crearProceso();

    const respuesta = await comoSocio(
      conCuerpo(`/api/procesos/${procesoId}/plantilla`, "POST", {
        destino: "actualizar",
      }),
    );
    expect(respuesta.status).toBe(200);

    const entradas = await bitacoraDeProceso(procesoId);
    expect(acciones(entradas)).toEqual(["creado", "plantilla_guardada"]);
    expect(entradas[1].usuarioNombre).toBe(NOMBRE_SOCIO);
    expect(entradas[1].detalle).toBe(nombreTipoResidencia);

    // Y la plantilla del tipo de destino también lo registra: son dos
    // hechos distintos sobre dos entidades distintas, no una entrada
    // duplicada.
    expect(
      acciones(await entradasEnLaBase("tipo_proceso", tipoResidenciaId)),
    ).toEqual(["plantilla_editada"]);
  });

  it("registra la nota diciendo en qué etapa quedó anclada", async () => {
    const procesoId = await crearProceso();

    const respuesta = await comoAutor(
      conCuerpo(`/api/procesos/${procesoId}/notas`, "POST", {
        texto: "El cliente quiere pago diferido por meses.",
      }),
    );
    expect(respuesta.status).toBe(201);

    const entradas = await bitacoraDeProceso(procesoId);
    expect(acciones(entradas)).toEqual(["creado", "nota_agregada"]);
    expect(entradas[1].detalle).toBe(PLAN_DE_RESIDENCIA[0]);
  });

  it("registra la apertura y el cierre de un pendiente", async () => {
    const procesoId = await crearProceso();

    const alta = await comoAutor(
      conCuerpo(`/api/procesos/${procesoId}/pendientes`, "POST", {
        texto: "Falta el certificado de matrimonio apostillado.",
      }),
    );
    expect(alta.status).toBe(201);

    const pendienteId = (
      (await alta.json()) as { pendientes: { id: string }[] }
    ).pendientes[0].id;

    const cierre = await comoSocio(
      peticion(
        `/api/procesos/${procesoId}/pendientes/${pendienteId}/cerrar`,
        { method: "POST" },
      ),
    );
    expect(cierre.status).toBe(200);

    const entradas = await bitacoraDeProceso(procesoId);
    expect(acciones(entradas)).toEqual([
      "creado",
      "pendiente_abierto",
      "pendiente_cerrado",
    ]);
    expect(entradas[1].usuarioNombre).toBe(NOMBRE_AUTOR);
    expect(entradas[2].usuarioNombre).toBe(NOMBRE_SOCIO);
    expect(entradas[1].detalle).toBe(
      "Falta el certificado de matrimonio apostillado.",
    );
  });
});

describe("la bitácora sale en orden y acotada a su entidad", () => {
  it("devuelve los hechos del proceso del más viejo al más nuevo", async () => {
    const procesoId = await crearProceso();

    await comoAutor(
      peticion(`/api/procesos/${procesoId}/avanzar`, { method: "POST" }),
    );
    await comoAutor(
      conCuerpo(`/api/procesos/${procesoId}/notas`, "POST", {
        texto: "Entrevista agendada para el 3 de marzo.",
      }),
    );
    await comoAutor(
      peticion(`/api/procesos/${procesoId}/avanzar`, { method: "POST" }),
    );

    const entradas = await bitacoraDeProceso(procesoId);

    expect(acciones(entradas)).toEqual([
      "creado",
      "etapa_alcanzada",
      "nota_agregada",
      "etapa_alcanzada",
    ]);

    const momentos = entradas.map((entrada) => entrada.ocurridoEn);
    expect([...momentos].sort()).toEqual(momentos);
  });

  it("no mezcla dos procesos", async () => {
    const uno = await crearProceso("Residencia de Marta");
    const otro = await crearProceso("Naturalización de Marta");

    await comoAutor(
      peticion(`/api/procesos/${otro}/avanzar`, { method: "POST" }),
    );

    expect(acciones(await bitacoraDeProceso(uno))).toEqual(["creado"]);
    expect(acciones(await bitacoraDeProceso(otro))).toEqual([
      "creado",
      "etapa_alcanzada",
    ]);
  });

  it("la del cliente no trae los hechos de sus procesos", async () => {
    // Un evento, una entidad. El proceso que nace de un cliente es un hecho
    // **del proceso**: duplicarlo bajo el cliente haría que el 3 de marzo
    // apareciera dos veces y que nadie supiera cuál es el original.
    const nuevoCliente = await crearCliente("Inversiones del Istmo, S.A.");

    const respuesta = await comoAutor(
      conCuerpo("/api/procesos", "POST", {
        clienteId: nuevoCliente,
        tipoProcesoId: tipoResidenciaId,
        titulo: "Constitución de sociedad",
      }),
    );
    expect(respuesta.status).toBe(201);

    expect(acciones(await bitacoraDeCliente(nuevoCliente))).toEqual([
      "creado",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Que las dos mitades del vocabulario no se separen
// ---------------------------------------------------------------------------

describe("el vocabulario de la base y el del código dicen lo mismo", () => {
  /** El `CREATE TABLE` tal como quedó en la base, con sus `CHECK`. */
  async function definicionDeBitacora(): Promise<string> {
    const fila = await env.DB.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'bitacora'",
    ).first<{ sql: string }>();

    expect(fila, "la tabla `bitacora` tiene que existir").not.toBeNull();
    return fila?.sql ?? "";
  }

  it("el CHECK de accion nombra exactamente las acciones del código", async () => {
    // Las dos mitades existen a propósito y hacen cosas distintas: el
    // `CHECK` es el que sobrevive a un script de importación (§5), y la
    // unión de TypeScript es la que impide escribir una acción inventada
    // desde el único camino de escritura. Lo que no puede pasar es que se
    // separen sin que nadie se entere.
    const definicion = await definicionDeBitacora();

    for (const accion of ACCIONES_DE_BITACORA) {
      expect(definicion, `falta «${accion}» en el CHECK`).toContain(
        `'${accion}'`,
      );
    }

    // Y al revés: ninguna cadena entrecomillada del `CHECK` de `accion` que
    // no esté en el código.
    const clausula = /accion\s+TEXT\s+NOT\s+NULL[\s\S]*?IN\s*\(([^)]*)\)/i.exec(
      definicion,
    );
    expect(clausula, "el CHECK de `accion` tiene que estar").not.toBeNull();

    const enLaBase = [...(clausula?.[1] ?? "").matchAll(/'([^']*)'/g)].map(
      (coincidencia) => coincidencia[1],
    );
    expect([...enLaBase].sort()).toEqual([...ACCIONES_DE_BITACORA].sort());
  });

  it("el CHECK de entidad nombra exactamente las entidades del código", async () => {
    const definicion = await definicionDeBitacora();

    const clausula = /entidad\s+TEXT\s+NOT\s+NULL[\s\S]*?IN\s*\(([^)]*)\)/i.exec(
      definicion,
    );
    expect(clausula, "el CHECK de `entidad` tiene que estar").not.toBeNull();

    const enLaBase = [...(clausula?.[1] ?? "").matchAll(/'([^']*)'/g)].map(
      (coincidencia) => coincidencia[1],
    );
    expect([...enLaBase].sort()).toEqual([...ENTIDADES_REGISTRADAS].sort());
  });

  it("los disparadores de la bitácora siguen todos en la base", async () => {
    // Los dos de inmutabilidad son de T-10; el de tenencia lo agregó T-12.
    // La lista va exacta y no por `toContain` a propósito: un disparador de
    // `UPDATE` de más sobre esta tabla sería código muerto —el de
    // inmutabilidad aborta toda actualización sin condición y corre
    // primero—, y esta prueba es la que lo haría notar.
    const { results } = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'trigger'" +
        " AND tbl_name = 'bitacora' ORDER BY name",
    ).all<{ name: string }>();

    expect(results.map((fila) => fila.name)).toEqual([
      "bitacora_no_se_actualiza",
      "bitacora_no_se_borra",
      "bitacora_tenencia_coherente_al_insertar",
    ]);
  });

  it("el índice que contesta «¿qué pasó con esto?» sigue puesto", async () => {
    // `(entidad, entidad_id, ocurrido_en)` es la consulta de las dos
    // pantallas. Reconstruir la tabla para meterle los `CHECK` es
    // exactamente el momento en que un índice se pierde en silencio.
    const fila = await env.DB.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'index'" +
        " AND name = 'bitacora_entidad'",
    ).first<{ sql: string }>();

    expect(fila?.sql).toMatch(/entidad.*entidad_id.*ocurrido_en/s);
  });
});
