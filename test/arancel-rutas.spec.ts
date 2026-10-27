/**
 * La API del arancel de honorarios (`odd/tasks/arancel-de-honorarios.md`,
 * T-2): leer la tabla del Acuerdo No 49 de 2001 y escribir **solo** el precio
 * del bufete.
 *
 * El criterio de aceptación 2 de la tajada dice «el monto oficial no se puede
 * editar, ni por la API», y ese «ni por la API» es la mitad que este archivo
 * prueba. La otra mitad —el disparador de
 * `migrations/0012_arancel_de_honorarios.sql`— se prueba acá abajo también,
 * **con SQL directo**, y las dos pruebas hacen falta por separado:
 *
 *  - Si solo estuviera la del disparador, la API podría aceptar el campo y
 *    morir con un 500 de SQLite crudo. Un 500 no es una negativa: es una
 *    caída, y la pantalla no puede decir nada útil sobre ella.
 *  - Si solo estuviera la de la API, borrar el disparador no pondría nada
 *    rojo, y la cita quedaría sostenida por un `if` — que es justo lo que
 *    `docs/diseno.md` §5 dice que el primer script de importación se salta.
 *
 * Las formas en el cable se declaran acá y no se importan del contrato del
 * Worker, por la misma razón que en `catalogos-api.spec.ts`: lo que esta
 * suite vigila es el JSON que ve el navegador, y con el tipo importado
 * renombrar un campo en el servidor renombraría también la expectativa.
 *
 * La tabla **no se siembra en la migración**: la siembra es
 * `scripts/arancel/sembrar.mjs`, que corre en Node contra `arancel.json`. Así
 * que estas pruebas insertan sus propios renglones con SQL, que es además lo
 * que las deja decir «un rubro» o «un renglón con regla» sin depender de que
 * el acuerdo real tenga uno en tal posición.
 */
import { env } from "cloudflare:workers";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { TENANT_UNICO_ID, nuevoId } from "../worker/db/ids";
import { manejar } from "../worker/index";

const DOMINIO_DE_ACCESS = "https://bufete-de-prueba.cloudflareaccess.com";
const AUD = "aud-de-la-aplicacion-del-bufete";

const EMAIL_AUTOR = "itzel@bufete.test";

/** El tenant vecino. Existe solo para que la fuga sea expresable. */
const OTRO_TENANT_ID = "0a5a6e0a-9f1e-4a6e-9f03-3b6a2a0e1d77";

interface RenglonEnElCable {
  id: string;
  orden: number;
  categoria: string;
  numeral: string;
  concepto: string;
  clase: string;
  montoOficial: number | null;
  reglaOficial: string | null;
  monto: number | null;
  activo: boolean;
}

interface NotaEnElCable {
  id: string;
  orden: number;
  categoria: string;
  texto: string;
}

interface CategoriaEnElCable {
  nombre: string;
  renglones: RenglonEnElCable[];
  notas: NotaEnElCable[];
}

let autorId: string;

let renglonConMontoId: string;
let renglonConReglaId: string;
let rubroId: string;
let renglonAjenoId: string;

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

/** Mete un renglón del acuerdo con SQL: la migración no siembra nada. */
function sembrarRenglon(fila: {
  id: string;
  tenantId?: string;
  orden: number;
  categoria: string;
  numeral: string;
  concepto: string;
  clase: "monto" | "regla" | "rubro";
  montoOficial?: number | null;
  reglaOficial?: string | null;
  monto?: number | null;
}): D1PreparedStatement {
  return env.DB.prepare(
    "INSERT INTO arancel_renglon (id, tenant_id, orden, categoria, numeral," +
      " concepto, clase, monto_oficial, regla_oficial, monto, activo)" +
      " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)",
  ).bind(
    fila.id,
    fila.tenantId ?? TENANT_UNICO_ID,
    fila.orden,
    fila.categoria,
    fila.numeral,
    fila.concepto,
    fila.clase,
    fila.montoOficial ?? null,
    fila.reglaOficial ?? null,
    fila.monto ?? null,
  );
}

function sembrarNota(fila: {
  id: string;
  orden: number;
  categoria: string;
  texto: string;
}): D1PreparedStatement {
  return env.DB.prepare(
    "INSERT INTO arancel_nota (id, tenant_id, orden, categoria, texto)" +
      " VALUES (?, ?, ?, ?, ?)",
  ).bind(fila.id, TENANT_UNICO_ID, fila.orden, fila.categoria, fila.texto);
}

async function leerArancel(): Promise<CategoriaEnElCable[]> {
  const respuesta = await comoAutor(peticion("/api/arancel"));
  expect(respuesta.status).toBe(200);
  return ((await respuesta.json()) as { categorias: CategoriaEnElCable[] })
    .categorias;
}

/** Relee un renglón por la API: la única lectura que prueba que se guardó. */
async function releer(id: string): Promise<RenglonEnElCable> {
  const categorias = await leerArancel();
  const todos = categorias.flatMap((categoria) => categoria.renglones);
  const fila = todos.find((candidato) => candidato.id === id);

  expect(fila, `el renglón ${id} tiene que estar en la lectura`).toBeDefined();
  return fila as RenglonEnElCable;
}

/**
 * La persona del bufete y el bufete vecino se crean **una sola vez**.
 *
 * Y el vecino no se puede borrar después, que es la consecuencia de la tabla
 * que esta tarea agrega: un `arancel_renglon` suyo apunta a su `tenant` por
 * llave foránea en `NO ACTION`, y el disparador
 * `arancel_renglon_no_se_borra` aborta todo `DELETE` sobre el renglón. O sea
 * que con un renglón sembrado, su bufete tampoco se borra. Es la misma
 * consecuencia que T-10 descubrió con `bitacora` y T-8 con `nota`, ahora
 * sobre el arancel.
 */
beforeAll(async () => {
  autorId = nuevoId();

  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO usuario (id, tenant_id, nombre, email, activo)" +
        " VALUES (?, ?, ?, ?, 1)",
    ).bind(autorId, TENANT_UNICO_ID, "Itzel", EMAIL_AUTOR),
    env.DB.prepare("INSERT INTO tenant (id, nombre) VALUES (?, ?)").bind(
      OTRO_TENANT_ID,
      "Otro bufete",
    ),
  ]);
});

beforeEach(async () => {
  // El almacenamiento está aislado por archivo, no por prueba, y acá no hay
  // limpieza posible: los renglones del arancel **no se borran con `DELETE`**
  // —el disparador lo aborta, y eso es justo lo que una de las pruebas de
  // abajo comprueba—. Así que el aislamiento se consigue con identificadores
  // y órdenes nuevos en cada prueba, que es la misma salida que
  // `esquema.spec.ts` ya usa para `bitacora` y `nota`.
  renglonConMontoId = nuevoId();
  renglonConReglaId = nuevoId();
  rubroId = nuevoId();
  renglonAjenoId = nuevoId();

  // Los órdenes salen de un contador propio por prueba: `(tenant_id, orden)`
  // es único y el almacenamiento no se rebobina entre pruebas del archivo.
  const base = await siguienteOrden();

  await env.DB.batch([
    sembrarRenglon({
      id: rubroId,
      orden: base,
      categoria: "ASUNTOS ADMINISTRATIVOS (MIGRACIÓN)",
      numeral: "3",
      concepto: "Inmigrantes",
      clase: "rubro",
    }),
    sembrarRenglon({
      id: renglonConMontoId,
      orden: base + 1,
      categoria: "ASUNTOS ADMINISTRATIVOS (MIGRACIÓN)",
      numeral: "1",
      concepto: "Visitantes Temporales (por persona)",
      clase: "monto",
      montoOficial: 50000,
    }),
    sembrarRenglon({
      id: renglonConReglaId,
      orden: base + 2,
      categoria: "ESTUDIOS DE TÍTULOS",
      numeral: "2.e",
      concepto: "Para operaciones cuyo valor sea mayor de B/.100,000.00",
      clase: "regla",
      reglaOficial:
        "un honorario convencional mayor de B/.1,000.00 sin que exceda del" +
        " 0.0085%",
    }),
    sembrarRenglon({
      id: renglonAjenoId,
      tenantId: OTRO_TENANT_ID,
      orden: base + 3,
      categoria: "CATEGORÍA DEL VECINO",
      numeral: "1",
      concepto: "Algo del otro bufete",
      clase: "monto",
      montoOficial: 11100,
    }),
  ]);
});

/** El orden más alto ya usado, más uno. */
async function siguienteOrden(): Promise<number> {
  const fila = await env.DB.prepare(
    "SELECT coalesce(max(orden), 0) AS tope FROM arancel_renglon",
  ).first<{ tope: number }>();

  return (fila?.tope ?? 0) + 1;
}

// ---------------------------------------------------------------------------
// Leer
// ---------------------------------------------------------------------------

describe("GET /api/arancel", () => {
  it("devuelve los renglones agrupados por categoría y en el orden del documento", async () => {
    const categorias = await leerArancel();
    const nombres = categorias.map((categoria) => categoria.nombre);

    expect(nombres).toContain("ASUNTOS ADMINISTRATIVOS (MIGRACIÓN)");
    expect(nombres).toContain("ESTUDIOS DE TÍTULOS");

    const migracion = categorias.find(
      (categoria) => categoria.nombre === "ASUNTOS ADMINISTRATIVOS (MIGRACIÓN)",
    );
    // El rubro se sembró con el orden más bajo: la lectura respeta el orden
    // del documento y no el del numeral, que en el acuerdo se repite.
    expect(migracion?.renglones.map((fila) => fila.id).slice(0, 2)).toEqual([
      rubroId,
      renglonConMontoId,
    ]);
  });

  it("trae el monto oficial, la regla y el monto del bufete", async () => {
    const fila = await releer(renglonConMontoId);

    expect(fila).toMatchObject({
      numeral: "1",
      concepto: "Visitantes Temporales (por persona)",
      clase: "monto",
      montoOficial: 50000,
      reglaOficial: null,
      monto: null,
      activo: true,
    });

    const regla = await releer(renglonConReglaId);
    expect(regla.montoOficial).toBeNull();
    expect(regla.reglaOficial).toContain("0.0085%");
  });

  it("trae las notas de cada categoría", async () => {
    const notaId = nuevoId();
    const orden = await siguienteNotaOrden();

    await sembrarNota({
      id: notaId,
      orden,
      categoria: "ASUNTOS ADMINISTRATIVOS (MIGRACIÓN)",
      texto: "PARÁGRAFO: En todo trámite se cargarán B/.200.00 por cada dependiente.",
    }).run();

    const categorias = await leerArancel();
    const migracion = categorias.find(
      (categoria) => categoria.nombre === "ASUNTOS ADMINISTRATIVOS (MIGRACIÓN)",
    );

    expect(migracion?.notas.map((cada) => cada.id)).toContain(notaId);
  });

  it("una sección que es solo prosa aparece con sus notas y sin renglones", async () => {
    // «OTROS ASUNTOS» y «PROCESO DE SEPARACIONES DE BIENES…» no tienen ni un
    // renglón en el acuerdo: son una frase. Si la lectura arrancara de los
    // renglones, desaparecerían de la tabla sin que nadie lo note.
    const notaId = nuevoId();
    const orden = await siguienteNotaOrden();

    await sembrarNota({
      id: notaId,
      orden,
      categoria: "OTROS ASUNTOS",
      texto:
        "en lo no señalado en la tarifa anterior, los Abogados cobrarán sus" +
        " servicios a razón de B/.150.00 por hora de gestión o actuación.",
    }).run();

    const categorias = await leerArancel();
    const otros = categorias.find(
      (categoria) => categoria.nombre === "OTROS ASUNTOS",
    );

    expect(otros, "«OTROS ASUNTOS» tiene que sobrevivir").toBeDefined();
    expect(otros?.renglones).toEqual([]);
    expect(otros?.notas.map((cada) => cada.id)).toEqual([notaId]);
  });

  it("no deja ver un renglón del bufete vecino", async () => {
    const categorias = await leerArancel();
    const todos = categorias.flatMap((categoria) => categoria.renglones);

    expect(todos.map((fila) => fila.id)).not.toContain(renglonAjenoId);
    expect(categorias.map((categoria) => categoria.nombre)).not.toContain(
      "CATEGORÍA DEL VECINO",
    );
  });

  it("contesta sin caché", async () => {
    const respuesta = await comoAutor(peticion("/api/arancel"));

    expect(respuesta.headers.get("cache-control")).toBe("no-store");
  });

  it("un verbo que no es GET contesta 405 diciendo cuál sirve", async () => {
    const respuesta = await comoAutor(
      conCuerpo("/api/arancel", "POST", { monto: 1 }),
    );

    expect(respuesta.status).toBe(405);
    expect(respuesta.headers.get("allow")).toBe("GET");
  });

  it("sin identidad de Access no se llega a la tabla", async () => {
    const respuesta = await manejar(peticion("/api/arancel"), entorno(), {
      correoDeDesarrollo: () => null,
    });

    expect(respuesta.status).toBe(403);
  });
});

/** El orden más alto ya usado en las notas, más uno. */
async function siguienteNotaOrden(): Promise<number> {
  const fila = await env.DB.prepare(
    "SELECT coalesce(max(orden), 0) AS tope FROM arancel_nota",
  ).first<{ tope: number }>();

  return (fila?.tope ?? 0) + 1;
}

// ---------------------------------------------------------------------------
// Escribir el precio del bufete
// ---------------------------------------------------------------------------

describe("PUT /api/arancel/{id}", () => {
  it("guarda el monto del bufete y lo deja releer", async () => {
    const respuesta = await comoAutor(
      conCuerpo(`/api/arancel/${renglonConMontoId}`, "PUT", { monto: 250000 }),
    );
    expect(respuesta.status).toBe(200);

    const eco = ((await respuesta.json()) as { renglon: RenglonEnElCable })
      .renglon;
    expect(eco.monto).toBe(250000);

    // Nada se da por guardado mirando el eco del `PUT`.
    expect((await releer(renglonConMontoId)).monto).toBe(250000);
  });

  it("deja el monto oficial intacto", async () => {
    await comoAutor(
      conCuerpo(`/api/arancel/${renglonConMontoId}`, "PUT", { monto: 250000 }),
    );

    expect((await releer(renglonConMontoId)).montoOficial).toBe(50000);
  });

  it("un renglón con regla también acepta el monto del bufete", async () => {
    const respuesta = await comoAutor(
      conCuerpo(`/api/arancel/${renglonConReglaId}`, "PUT", { monto: 300000 }),
    );

    expect(respuesta.status).toBe(200);
    expect((await releer(renglonConReglaId)).monto).toBe(300000);
  });

  it("borra el precio propio con un nulo y vuelve a la sugerencia", async () => {
    await comoAutor(
      conCuerpo(`/api/arancel/${renglonConMontoId}`, "PUT", { monto: 250000 }),
    );

    const respuesta = await comoAutor(
      conCuerpo(`/api/arancel/${renglonConMontoId}`, "PUT", { monto: null }),
    );

    expect(respuesta.status).toBe(200);
    expect((await releer(renglonConMontoId)).monto).toBeNull();
  });

  it("registra la edición en la bitácora del renglón", async () => {
    await comoAutor(
      conCuerpo(`/api/arancel/${renglonConMontoId}`, "PUT", { monto: 250000 }),
    );

    const fila = await env.DB.prepare(
      "SELECT accion, usuario_id FROM bitacora" +
        " WHERE entidad = 'arancel_renglon' AND entidad_id = ?",
    )
      .bind(renglonConMontoId)
      .first<{ accion: string; usuario_id: string }>();

    expect(fila?.accion).toBe("editado");
    expect(fila?.usuario_id).toBe(autorId);
  });

  // -------------------------------------------------------------------------
  // La negativa que el criterio de aceptación 2 pide
  // -------------------------------------------------------------------------

  it("se niega a escribir `montoOficial`, y lo dice", async () => {
    const respuesta = await comoAutor(
      conCuerpo(`/api/arancel/${renglonConMontoId}`, "PUT", {
        monto: 250000,
        montoOficial: 1,
      }),
    );

    expect(respuesta.status).toBe(409);

    const cuerpo = (await respuesta.json()) as {
      error: string;
      campos: string[];
    };
    expect(cuerpo.error).toBe("renglon_citado");
    expect(cuerpo.campos).toEqual(["montoOficial"]);

    // Y no escribió **nada**: ni el monto oficial ni el del bufete. Una
    // negativa parcial sería peor que ninguna.
    const fila = await releer(renglonConMontoId);
    expect(fila.montoOficial).toBe(50000);
    expect(fila.monto).toBeNull();
  });

  it.each([
    ["categoria", "OTRA COSA"],
    ["clase", "rubro"],
    ["concepto", "otro concepto"],
    ["numeral", "99"],
    ["orden", 1],
    ["reglaOficial", "otra regla"],
  ])("se niega a escribir `%s`", async (campo, valor) => {
    const respuesta = await comoAutor(
      conCuerpo(`/api/arancel/${renglonConMontoId}`, "PUT", {
        monto: 1000,
        [campo]: valor,
      }),
    );

    expect(respuesta.status).toBe(409);
    expect((await respuesta.json()) as { error: string }).toMatchObject({
      error: "renglon_citado",
      campos: [campo],
    });
  });

  it("se niega a ponerle precio a un rubro", async () => {
    const respuesta = await comoAutor(
      conCuerpo(`/api/arancel/${rubroId}`, "PUT", { monto: 1000 }),
    );

    expect(respuesta.status).toBe(409);
    expect((await respuesta.json()) as { error: string }).toMatchObject({
      error: "rubro_sin_precio",
    });
  });

  it("un rubro sí acepta el nulo: borrar lo que no hay no es un conflicto", async () => {
    const respuesta = await comoAutor(
      conCuerpo(`/api/arancel/${rubroId}`, "PUT", { monto: null }),
    );

    expect(respuesta.status).toBe(200);
    expect((await releer(rubroId)).monto).toBeNull();
  });

  it("un monto que no es un importe contesta 422", async () => {
    const respuesta = await comoAutor(
      conCuerpo(`/api/arancel/${renglonConMontoId}`, "PUT", { monto: 1500.5 }),
    );

    expect(respuesta.status).toBe(422);

    const cuerpo = (await respuesta.json()) as {
      error: string;
      fallas: { campo: string; motivo: string }[];
    };
    expect(cuerpo.error).toBe("datos_invalidos");
    expect(cuerpo.fallas.map((falla) => falla.motivo)).toEqual([
      "monto_invalido",
    ]);
  });

  it("un cuerpo que no se puede leer contesta 400", async () => {
    const respuesta = await comoAutor(
      peticion(`/api/arancel/${renglonConMontoId}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: "{no es json",
      }),
    );

    expect(respuesta.status).toBe(400);
  });

  it("un renglón del bufete vecino es, desde acá, un renglón que no existe", async () => {
    const respuesta = await comoAutor(
      conCuerpo(`/api/arancel/${renglonAjenoId}`, "PUT", { monto: 1000 }),
    );

    expect(respuesta.status).toBe(404);

    // Y no lo tocó.
    const fila = await env.DB.prepare(
      "SELECT monto FROM arancel_renglon WHERE id = ?",
    )
      .bind(renglonAjenoId)
      .first<{ monto: number | null }>();
    expect(fila?.monto).toBeNull();
  });

  it("un identificador que no existe contesta 404", async () => {
    const respuesta = await comoAutor(
      conCuerpo(`/api/arancel/${nuevoId()}`, "PUT", { monto: 1000 }),
    );

    expect(respuesta.status).toBe(404);
  });

  it("la existencia manda sobre la validación del cuerpo", async () => {
    // Un 422 contra un identificador ajeno ya confirmaría que ese
    // identificador existe. Misma decisión que T-5 y T-6.
    const respuesta = await comoAutor(
      conCuerpo(`/api/arancel/${renglonAjenoId}`, "PUT", { monto: -1 }),
    );

    expect(respuesta.status).toBe(404);
  });

  it("un verbo que no es PUT contesta 405 diciendo cuál sirve", async () => {
    const respuesta = await comoAutor(
      peticion(`/api/arancel/${renglonConMontoId}`, { method: "DELETE" }),
    );

    expect(respuesta.status).toBe(405);
    expect(respuesta.headers.get("allow")).toBe("PUT");
  });

  it("sin identidad de Access no se escribe nada", async () => {
    const respuesta = await manejar(
      conCuerpo(`/api/arancel/${renglonConMontoId}`, "PUT", { monto: 999 }),
      entorno(),
      { correoDeDesarrollo: () => null },
    );

    expect(respuesta.status).toBe(403);
    expect((await releer(renglonConMontoId)).monto).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// La red de abajo: el disparador, probado con SQL
// ---------------------------------------------------------------------------

describe("la base sostiene la cita, no la buena intención", () => {
  it.each([
    ["monto_oficial", 1],
    ["regla_oficial", "otra regla"],
    ["categoria", "OTRA COSA"],
    ["numeral", "99"],
    ["concepto", "otro concepto"],
    ["clase", "rubro"],
  ])("aborta un UPDATE de `%s`", async (columna, valor) => {
    await expect(
      env.DB.prepare(
        `UPDATE arancel_renglon SET ${columna} = ? WHERE id = ?`,
      )
        .bind(valor, renglonConMontoId)
        .run(),
    ).rejects.toThrow(/arancel citado/);
  });

  it("aborta un UPDATE de `orden`", async () => {
    // Va aparte porque el valor tiene que ser un orden libre: si chocara con
    // el índice único, el rechazo vendría del índice y no del disparador, y
    // la prueba pasaría por la razón equivocada.
    const libre = await siguienteOrden();

    await expect(
      env.DB.prepare("UPDATE arancel_renglon SET orden = ? WHERE id = ?")
        .bind(libre, renglonConMontoId)
        .run(),
    ).rejects.toThrow(/arancel citado/);
  });

  it("deja pasar el UPDATE del monto del bufete", async () => {
    // El contrapeso: si el disparador abortara toda actualización, las seis
    // pruebas de arriba pasarían con una guarda que además rompería la API.
    await env.DB.prepare("UPDATE arancel_renglon SET monto = ? WHERE id = ?")
      .bind(777700, renglonConMontoId)
      .run();

    const fila = await env.DB.prepare(
      "SELECT monto FROM arancel_renglon WHERE id = ?",
    )
      .bind(renglonConMontoId)
      .first<{ monto: number }>();

    expect(fila?.monto).toBe(777700);
  });

  it("deja pasar el UPDATE de `activo`: un renglón se desactiva, no se borra", async () => {
    await env.DB.prepare("UPDATE arancel_renglon SET activo = 0 WHERE id = ?")
      .bind(renglonConMontoId)
      .run();

    const fila = await env.DB.prepare(
      "SELECT activo FROM arancel_renglon WHERE id = ?",
    )
      .bind(renglonConMontoId)
      .first<{ activo: number }>();

    expect(fila?.activo).toBe(0);
  });

  it("aborta el DELETE de un renglón", async () => {
    await expect(
      env.DB.prepare("DELETE FROM arancel_renglon WHERE id = ?")
        .bind(renglonConMontoId)
        .run(),
    ).rejects.toThrow(/no se borra/);
  });

  it("no reasigna un renglón a otro bufete", async () => {
    await expect(
      env.DB.prepare("UPDATE arancel_renglon SET tenant_id = ? WHERE id = ?")
        .bind(OTRO_TENANT_ID, renglonConMontoId)
        .run(),
    ).rejects.toThrow(/columna inmutable/);
  });

  it("una nota del acuerdo no se actualiza ni se borra", async () => {
    const notaId = nuevoId();
    await sembrarNota({
      id: notaId,
      orden: await siguienteNotaOrden(),
      categoria: "OTROS ASUNTOS",
      texto: "a razón de B/.150.00 por hora de gestión o actuación.",
    }).run();

    await expect(
      env.DB.prepare("UPDATE arancel_nota SET texto = ? WHERE id = ?")
        .bind("otra cosa", notaId)
        .run(),
    ).rejects.toThrow(/arancel citado/);

    await expect(
      env.DB.prepare("DELETE FROM arancel_nota WHERE id = ?")
        .bind(notaId)
        .run(),
    ).rejects.toThrow(/arancel citado/);
  });

  it("un rubro no entra con precio del bufete", async () => {
    await expect(
      sembrarRenglon({
        id: nuevoId(),
        orden: await siguienteOrden(),
        categoria: "ASUNTOS ADMINISTRATIVOS (MIGRACIÓN)",
        numeral: "3",
        concepto: "Inmigrantes",
        clase: "rubro",
        monto: 1000,
      }).run(),
    ).rejects.toThrow(/un_rubro_no_lleva_precio/);
  });

  it("un monto con centavos partidos no entra, ni el oficial ni el del bufete", async () => {
    // `INTEGER` en SQLite es una **afinidad**, no un tipo: 1500.5 no se puede
    // convertir sin pérdida, así que la columna lo guardaría como real si no
    // fuera por el `typeof`.
    await expect(
      sembrarRenglon({
        id: nuevoId(),
        orden: await siguienteOrden(),
        categoria: "C",
        numeral: "1",
        concepto: "x",
        clase: "monto",
        montoOficial: 1500.5,
      }).run(),
    ).rejects.toThrow(/el_monto_oficial_es_centavos_enteros_no_negativos/);

    await expect(
      sembrarRenglon({
        id: nuevoId(),
        orden: await siguienteOrden(),
        categoria: "C",
        numeral: "1",
        concepto: "x",
        clase: "monto",
        montoOficial: 1000,
        monto: 1500.5,
      }).run(),
    ).rejects.toThrow(/el_monto_del_bufete_es_centavos_enteros_no_negativos/);
  });

  it("dos renglones no comparten `orden` dentro del bufete", async () => {
    const orden = await siguienteOrden();
    const fila = {
      orden,
      categoria: "C",
      numeral: "1",
      concepto: "x",
      clase: "monto" as const,
      montoOficial: 1000,
    };

    await sembrarRenglon({ id: nuevoId(), ...fila }).run();

    await expect(
      sembrarRenglon({ id: nuevoId(), ...fila }).run(),
    ).rejects.toThrow(/UNIQUE constraint failed/);
  });

  it("dos renglones SÍ comparten numeral dentro de una categoría", async () => {
    // Medido sobre `scripts/arancel/arancel.json`: **44 renglones en 15
    // grupos** comparten numeral con otro de su misma categoría. Un `UNIQUE`
    // sobre el numeral haría fallar la siembra y, peor, haría *parecer* que
    // el acuerdo está mal numerado cuando el que está mal es nuestro
    // supuesto. Esta prueba es la que mata ese índice si alguien lo agrega.
    const primero = await siguienteOrden();

    await env.DB.batch([
      sembrarRenglon({
        id: nuevoId(),
        orden: primero,
        categoria: "ACTUACIONES EN NEGOCIOS CRIMINALES",
        numeral: "5",
        concepto: "DEFENSA EN NEGOCIOS CRIMINALES",
        clase: "rubro",
      }),
      sembrarRenglon({
        id: nuevoId(),
        orden: primero + 1,
        categoria: "ACTUACIONES EN NEGOCIOS CRIMINALES",
        numeral: "5",
        concepto: "QUERELLAS Y ACCIONES PENALES DE LAS VÍCTIMAS DEL DELITO",
        clase: "rubro",
      }),
    ]);

    const fila = await env.DB.prepare(
      "SELECT count(*) AS n FROM arancel_renglon" +
        " WHERE tenant_id = ? AND categoria = ? AND numeral = '5'",
    )
      .bind(TENANT_UNICO_ID, "ACTUACIONES EN NEGOCIOS CRIMINALES")
      .first<{ n: number }>();

    expect(fila?.n).toBe(2);
  });
});
