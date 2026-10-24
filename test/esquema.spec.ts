import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { TENANT_UNICO_ID, nuevoId } from "../worker/db/ids";
import { ahoraIso } from "../worker/db/momentos";

/**
 * Pruebas del esquema: `migrations/0001_esquema_inicial.sql` y las guardas de
 * integridad que le agregó `migrations/0003_tenencia_y_unicidad.sql`.
 *
 * Una invariante se prueba demostrando que la base **rechaza** la escritura
 * inválida. Insertar una fila correcta y verla guardada no prueba nada: pasa
 * igual con la restricción borrada. Por eso casi todo lo de acá abajo es un
 * `INSERT`/`UPDATE`/`DELETE` que *debe* fallar, más una aserción de que falló.
 *
 * El contrapeso es `describe("fila válida de referencia")`: si la fila base de
 * una tabla no entrara, todas sus pruebas de rechazo pasarían por la razón
 * equivocada.
 */

type Fila = Record<string, string | number | null>;

interface Contexto {
  usuarioId: string;
  tipoClienteId: string;
  clienteId: string;
  areaId: string;
  tipoProcesoId: string;
  procesoId: string;
  etapaId: string;
}

/** Tablas que llevan `tenant_id` por I-8. `tenant` queda fuera: es el tenant. */
const TABLAS_CON_TENANT = [
  "usuario",
  "tipo_cliente",
  "cliente",
  "area",
  "tipo_proceso",
  "etapa_plantilla",
  "proceso",
  "proceso_etapa",
  "nota",
  "pendiente",
  "bitacora",
] as const;

type TablaConTenant = (typeof TABLAS_CON_TENANT)[number];

/**
 * Las ocho tablas a las que `0003_tenencia_y_unicidad.sql` les puso
 * disparador de coherencia de tenencia. Son exactamente las que tienen al
 * menos una llave foránea hacia una fila con `tenant_id`.
 */
const TABLAS_CON_COHERENCIA: ReadonlySet<string> = new Set([
  "cliente",
  "tipo_proceso",
  "etapa_plantilla",
  "proceso",
  "proceso_etapa",
  "nota",
  "pendiente",
  "bitacora",
]);

/** El `RAISE(ABORT, …)` crudo de los catorce disparadores de `0003`. */
const TENENCIA_CRUZADA = /tenencia cruzada/;

/**
 * Qué error crudo deja una fila que referencia un padre **inexistente**.
 *
 * En SQLite un `BEFORE INSERT` corre antes que la llave foránea, y las
 * condiciones de `0003` usan `IS NOT` justamente para que la subconsulta
 * vacía (NULL) cuente como incoherencia. Entonces, en las tablas con
 * disparador, el padre inexistente muere con el mensaje del disparador; en
 * las otras tres sigue muriendo con el de la llave foránea.
 *
 * Esto es una aserción de mutación, no una comodidad: si alguien cambia un
 * `IS NOT` por `<>`, el disparador deja de ver el padre inexistente, el
 * error vuelve a ser `FOREIGN KEY constraint failed` y estas pruebas mueren.
 */
function errorDePadreInexistente(tabla: string): RegExp {
  return TABLAS_CON_COHERENCIA.has(tabla)
    ? TENENCIA_CRUZADA
    : /FOREIGN KEY constraint failed/;
}

function insertar(tabla: string, fila: Fila): Promise<D1Result> {
  const columnas = Object.keys(fila);
  const sql =
    `INSERT INTO ${tabla} (${columnas.join(", ")}) ` +
    `VALUES (${columnas.map(() => "?").join(", ")})`;

  return env.DB.prepare(sql)
    .bind(...columnas.map((columna) => fila[columna]))
    .run();
}

/** La misma fila, sin una columna. Para probar qué pasa cuando falta. */
function sin(fila: Fila, columna: string): Fila {
  const copia = { ...fila };
  delete copia[columna];
  return copia;
}

/**
 * Siembra el mínimo necesario para que una fila de cualquier tabla hija tenga
 * padres reales a los que apuntar.
 *
 * El almacenamiento no se rebobina entre pruebas del mismo archivo, así que
 * esto corre una vez por prueba sobre la base que dejó la anterior. Por eso
 * el correo del usuario ya llevaba su identificador pegado desde T-2, y por
 * eso desde `0003_tenencia_y_unicidad.sql` lo llevan también los nombres de
 * catálogo: `area` y `tipo_cliente` tienen unicidad de nombre por tenant, y
 * un nombre fijo chocaría con el que sembró la prueba anterior. El choque
 * sería del andamio, no de lo que se está probando.
 */
async function sembrarContexto(): Promise<Contexto> {
  const ctx: Contexto = {
    usuarioId: nuevoId(),
    tipoClienteId: nuevoId(),
    clienteId: nuevoId(),
    areaId: nuevoId(),
    tipoProcesoId: nuevoId(),
    procesoId: nuevoId(),
    etapaId: nuevoId(),
  };
  const ahora = ahoraIso();

  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO usuario (id, tenant_id, nombre, email) VALUES (?, ?, ?, ?)",
    ).bind(ctx.usuarioId, TENANT_UNICO_ID, "Itzel", `${ctx.usuarioId}@bufete.pa`),
    env.DB.prepare(
      "INSERT INTO tipo_cliente (id, tenant_id, nombre) VALUES (?, ?, ?)",
    ).bind(ctx.tipoClienteId, TENANT_UNICO_ID, `Particular ${ctx.tipoClienteId}`),
    env.DB.prepare(
      "INSERT INTO cliente (id, tenant_id, tipo_cliente_id, nombre, telefono," +
        " creado_por, creado_en) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).bind(
      ctx.clienteId,
      TENANT_UNICO_ID,
      ctx.tipoClienteId,
      "Cliente de prueba",
      "+507 6000-0000",
      ctx.usuarioId,
      ahora,
    ),
    env.DB.prepare(
      "INSERT INTO area (id, tenant_id, nombre) VALUES (?, ?, ?)",
    ).bind(ctx.areaId, TENANT_UNICO_ID, `Migración ${ctx.areaId}`),
    env.DB.prepare(
      "INSERT INTO tipo_proceso (id, tenant_id, area_id, nombre)" +
        " VALUES (?, ?, ?, ?)",
    ).bind(
      ctx.tipoProcesoId,
      TENANT_UNICO_ID,
      ctx.areaId,
      `Visa de trabajo ${ctx.tipoProcesoId}`,
    ),
    env.DB.prepare(
      "INSERT INTO proceso (id, tenant_id, cliente_id, tipo_proceso_id," +
        " origen, titulo, estado, abierto_en) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(
      ctx.procesoId,
      TENANT_UNICO_ID,
      ctx.clienteId,
      ctx.tipoProcesoId,
      "directo",
      "Visa de trabajo de Juan Pérez",
      "abierto",
      ahora,
    ),
    env.DB.prepare(
      "INSERT INTO proceso_etapa (id, tenant_id, proceso_id, nombre, orden)" +
        " VALUES (?, ?, ?, ?, ?)",
    ).bind(
      ctx.etapaId,
      TENANT_UNICO_ID,
      ctx.procesoId,
      "Recepción de documentos",
      1,
    ),
  ]);

  return ctx;
}

/** Una fila completa y válida por tabla, con identificadores nuevos. */
function filaValida(tabla: TablaConTenant, ctx: Contexto): Fila {
  const ahora = ahoraIso();
  const base = { id: nuevoId(), tenant_id: TENANT_UNICO_ID };

  switch (tabla) {
    case "usuario":
      return { ...base, nombre: "Usuario", email: `${base.id}@bufete.pa` };
    case "tipo_cliente":
      return { ...base, nombre: `Empresa ${base.id}` };
    case "cliente":
      return {
        ...base,
        tipo_cliente_id: ctx.tipoClienteId,
        nombre: "Otro cliente",
        creado_por: ctx.usuarioId,
        creado_en: ahora,
      };
    case "area":
      return { ...base, nombre: `Civil ${base.id}` };
    case "tipo_proceso":
      return { ...base, area_id: ctx.areaId, nombre: `Compraventa ${base.id}` };
    case "etapa_plantilla":
      return {
        ...base,
        tipo_proceso_id: ctx.tipoProcesoId,
        nombre: "Firma de contrato",
        orden: 1,
      };
    case "proceso":
      return {
        ...base,
        cliente_id: ctx.clienteId,
        tipo_proceso_id: ctx.tipoProcesoId,
        origen: "directo",
        titulo: "Compraventa de finca",
        estado: "abierto",
        abierto_en: ahora,
      };
    case "proceso_etapa":
      return {
        ...base,
        proceso_id: ctx.procesoId,
        nombre: "Presentación ante el ministerio",
        orden: 2,
      };
    case "nota":
      return {
        ...base,
        proceso_id: ctx.procesoId,
        proceso_etapa_id: ctx.etapaId,
        texto: "El cliente pidió pago diferido.",
        autor_id: ctx.usuarioId,
        creada_en: ahora,
      };
    case "pendiente":
      return {
        ...base,
        proceso_id: ctx.procesoId,
        proceso_etapa_id: ctx.etapaId,
        texto: "Falta el pasaporte apostillado.",
        autor_id: ctx.usuarioId,
        creado_en: ahora,
      };
    case "bitacora":
      return {
        ...base,
        entidad: "proceso",
        entidad_id: ctx.procesoId,
        accion: "creado",
        usuario_id: ctx.usuarioId,
        ocurrido_en: ahora,
      };
  }
}

let ctx: Contexto;

beforeEach(async () => {
  ctx = await sembrarContexto();
});

describe("semilla", () => {
  it("deja exactamente un tenant, el que referencia el código", async () => {
    const filas = await env.DB.prepare(
      "SELECT id FROM tenant",
    ).all<{ id: string }>();

    expect(filas.results.map((fila) => fila.id)).toEqual([TENANT_UNICO_ID]);
  });
});

describe("fila válida de referencia", () => {
  // Sin esto, una fila base mal armada haría pasar todas las pruebas de
  // rechazo de su tabla por el motivo equivocado.
  it.each(TABLAS_CON_TENANT)("%s acepta su fila válida", async (tabla) => {
    const fila = filaValida(tabla, ctx);
    const resultado = await insertar(tabla, fila);

    // `resolves` sola solo prueba que no tiró. Que la fila exista es otra
    // cosa, y es la que hace de contrapeso a las pruebas de rechazo.
    expect(resultado.meta.changes).toBe(1);

    const guardada = await env.DB.prepare(
      `SELECT id FROM ${tabla} WHERE id = ?`,
    )
      .bind(fila.id)
      .first<{ id: string }>();

    expect(guardada?.id).toBe(fila.id);
  });
});

describe("I-8 · toda tabla lleva tenant_id", () => {
  it.each(TABLAS_CON_TENANT)(
    "%s rechaza la misma fila sin tenant_id",
    async (tabla) => {
      const fila = sin(filaValida(tabla, ctx), "tenant_id");

      await expect(insertar(tabla, fila)).rejects.toThrow(
        new RegExp(`NOT NULL constraint failed: ${tabla}\\.tenant_id`),
      );
    },
  );

  it.each(TABLAS_CON_TENANT)(
    "%s rechaza la misma fila con un tenant_id que no existe",
    async (tabla) => {
      const fila = { ...filaValida(tabla, ctx), tenant_id: nuevoId() };

      // Un `tenant_id` inventado deja la fila incoherente con sus padres
      // reales, así que en las ocho tablas con disparador el rechazo llega
      // antes y con otro mensaje. Sigue siendo un rechazo por I-8: la fila
      // nombra un tenant que no es el de nadie.
      await expect(insertar(tabla, fila)).rejects.toThrow(
        TABLAS_CON_COHERENCIA.has(tabla)
          ? TENENCIA_CRUZADA
          : /FOREIGN KEY constraint failed/,
      );
    },
  );
});

describe("I-2 · todo proceso está ligado a un cliente", () => {
  it("rechaza un proceso sin cliente_id", async () => {
    const fila = sin(filaValida("proceso", ctx), "cliente_id");

    await expect(insertar("proceso", fila)).rejects.toThrow(
      /NOT NULL constraint failed: proceso\.cliente_id/,
    );
  });

  it("rechaza un proceso cuyo cliente_id no existe", async () => {
    const fila = { ...filaValida("proceso", ctx), cliente_id: nuevoId() };

    await expect(insertar("proceso", fila)).rejects.toThrow(
      errorDePadreInexistente("proceso"),
    );
  });

  it("rechaza borrar un cliente con procesos abiertos", async () => {
    await expect(
      env.DB.prepare("DELETE FROM cliente WHERE id = ?")
        .bind(ctx.clienteId)
        .run(),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/);
  });
});

describe("I-6 · nota, pendiente y bitácora tienen autor", () => {
  const conAutor = [
    { tabla: "nota", columna: "autor_id" },
    { tabla: "pendiente", columna: "autor_id" },
    { tabla: "bitacora", columna: "usuario_id" },
  ] as const;

  it.each(conAutor)("$tabla rechaza una fila sin $columna", async (caso) => {
    const fila = sin(filaValida(caso.tabla, ctx), caso.columna);

    await expect(insertar(caso.tabla, fila)).rejects.toThrow(
      new RegExp(`NOT NULL constraint failed: ${caso.tabla}\\.${caso.columna}`),
    );
  });

  it.each(conAutor)(
    "$tabla rechaza una fila cuyo $columna no es un usuario real",
    async (caso) => {
      const fila = { ...filaValida(caso.tabla, ctx), [caso.columna]: nuevoId() };

      await expect(insertar(caso.tabla, fila)).rejects.toThrow(
        errorDePadreInexistente(caso.tabla),
      );
    },
  );

  it("rechaza firmar con un nombre en texto en vez de un usuario_id", async () => {
    const fila = { ...filaValida("bitacora", ctx), usuario_id: "Itzel" };

    await expect(insertar("bitacora", fila)).rejects.toThrow(
      errorDePadreInexistente("bitacora"),
    );
  });
});

describe("valores cerrados con CHECK, no con ENUM", () => {
  it("rechaza un origen de proceso fuera del dominio", async () => {
    const fila = { ...filaValida("proceso", ctx), origen: "licitacion" };

    await expect(insertar("proceso", fila)).rejects.toThrow(
      /CHECK constraint failed/,
    );
  });

  it("rechaza un estado de proceso fuera del dominio", async () => {
    const fila = { ...filaValida("proceso", ctx), estado: "en_tramite" };

    await expect(insertar("proceso", fila)).rejects.toThrow(
      /CHECK constraint failed/,
    );
  });

  it("rechaza un booleano que no es 0 ni 1", async () => {
    const fila = { ...filaValida("usuario", ctx), activo: 2 };

    await expect(insertar("usuario", fila)).rejects.toThrow(
      /CHECK constraint failed/,
    );
  });
});

describe("momentos en ISO 8601 UTC", () => {
  const noSonMomentos = ["2026-10-22", "ayer", "22/10/2026", ""];

  // Los de arriba son errores evidentes y cualquier validación los ataja. Los
  // peligrosos son estos: fechas de verdad, en una forma que no es la canónica.
  // Si el `CHECK` dejara pasar una sola de estas, la columna tendría dos
  // formatos y el orden lexicográfico dejaría de coincidir con el cronológico.
  const casiMomentos = [
    "2026-10-22T13:45:00Z", // sin milisegundos
    "2026-10-22T13:45:00.000+00:00", // desfase en vez de Z
    "2026-10-22 13:45:00.000Z", // espacio en vez de T
    "2026-10-22T13:45:00.000", // sin zona
    "2026-10-22T09:45:00.000-04:00", // el mismo instante, otra zona
  ];

  it.each(noSonMomentos)(
    "rechaza %o como momento de creación de una nota",
    async (valor) => {
      const fila = { ...filaValida("nota", ctx), creada_en: valor };

      await expect(insertar("nota", fila)).rejects.toThrow(
        /CHECK constraint failed/,
      );
    },
  );

  it.each(casiMomentos)(
    "rechaza %o, que es una fecha real pero no la forma canónica",
    async (valor) => {
      const fila = { ...filaValida("nota", ctx), creada_en: valor };

      await expect(insertar("nota", fila)).rejects.toThrow(
        /CHECK constraint failed/,
      );
    },
  );

  it("acepta exactamente lo que produce toISOString()", async () => {
    const fila = {
      ...filaValida("nota", ctx),
      creada_en: new Date().toISOString(),
    };

    await expect(insertar("nota", fila)).resolves.toBeTruthy();
  });
});

describe("pendiente cerrado", () => {
  it("rechaza cerrar sin registrar quién cerró", async () => {
    const fila = { ...filaValida("pendiente", ctx), cerrado_en: ahoraIso() };

    await expect(insertar("pendiente", fila)).rejects.toThrow(
      /CHECK constraint failed/,
    );
  });

  it("rechaza registrar quién cerró sin registrar cuándo", async () => {
    const fila = {
      ...filaValida("pendiente", ctx),
      cerrado_por: ctx.usuarioId,
    };

    await expect(insertar("pendiente", fila)).rejects.toThrow(
      /CHECK constraint failed/,
    );
  });
});

describe("las notas son inmutables", () => {
  let notaId: string;

  beforeEach(async () => {
    const fila = filaValida("nota", ctx);
    notaId = fila.id as string;
    await insertar("nota", fila);
  });

  it("rechaza actualizar una nota", async () => {
    await expect(
      env.DB.prepare("UPDATE nota SET texto = ? WHERE id = ?")
        .bind("Texto reescrito", notaId)
        .run(),
    ).rejects.toThrow(/nota inmutable/);
  });

  it("rechaza borrar una nota", async () => {
    await expect(
      env.DB.prepare("DELETE FROM nota WHERE id = ?").bind(notaId).run(),
    ).rejects.toThrow(/nota inmutable/);
  });

  it("deja la nota intacta después de los dos intentos", async () => {
    const original = await env.DB.prepare("SELECT texto FROM nota WHERE id = ?")
      .bind(notaId)
      .first<{ texto: string }>();

    await expect(
      env.DB.prepare("UPDATE nota SET texto = ? WHERE id = ?")
        .bind("Texto reescrito", notaId)
        .run(),
    ).rejects.toThrow();
    await expect(
      env.DB.prepare("DELETE FROM nota WHERE id = ?").bind(notaId).run(),
    ).rejects.toThrow();

    const despues = await env.DB.prepare("SELECT texto FROM nota WHERE id = ?")
      .bind(notaId)
      .first<{ texto: string }>();

    expect(despues).toEqual(original);
  });
});

describe("límites de la tajada 1", () => {
  // Las tres tablas de la cotización entraron en `0004` (T-1 de la tajada 2) y
  // por eso salieron de esta lista. Las dos del dinero siguen sin existir:
  // son de R5, y mientras no estén, esta prueba es la que avisa si alguien las
  // adelanta sin sus disparadores de tenencia.
  it("no crea todavía ninguna tabla del dinero", async () => {
    const deLaTajadaDos = ["cuota", "movimiento_gasto"];

    const filas = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table'",
    ).all<{ name: string }>();
    const existentes = filas.results.map((fila) => fila.name);

    expect(existentes.filter((nombre) => deLaTajadaDos.includes(nombre))).toEqual(
      [],
    );
  });

  it("no le pone a proceso una FK hacia una tabla que no existe", async () => {
    // `cotizacion_linea_id` entra en la tajada 2, con la tabla a la que apunta.
    const filas = await env.DB.prepare(
      "SELECT name FROM pragma_table_info('proceso')",
    ).all<{ name: string }>();

    expect(filas.results.map((fila) => fila.name)).not.toContain(
      "cotizacion_linea_id",
    );
  });
});

describe("usuario · correo único dentro del bufete", () => {
  it("rechaza dos usuarios con el mismo correo en el mismo tenant", async () => {
    const correo = "repetido@bufete.test";

    await insertar("usuario", { ...filaValida("usuario", ctx), email: correo });

    await expect(
      insertar("usuario", {
        ...filaValida("usuario", ctx),
        id: nuevoId(),
        email: correo,
      }),
    ).rejects.toThrow(/UNIQUE constraint failed/);
  });
});

describe("pendiente · el cierre es todo o nada", () => {
  // Las dos mitades sueltas ya se rechazan más arriba. Falta el contrapeso:
  // que el cierre completo sí entre. Sin esta prueba, un `CHECK` que
  // rechazara *todo* cierre pasaría desapercibido.
  it("acepta un pendiente cerrado con sus dos columnas puestas", async () => {
    const momento = ahoraIso();
    const fila: Fila = {
      ...filaValida("pendiente", ctx),
      cerrado_en: momento,
      cerrado_por: ctx.usuarioId,
    };
    const id = fila.id;

    const resultado = await insertar("pendiente", fila);
    expect(resultado.meta.changes).toBe(1);

    const guardado = await env.DB.prepare(
      "SELECT cerrado_en, cerrado_por FROM pendiente WHERE id = ?",
    )
      .bind(id)
      .first<{ cerrado_en: string; cerrado_por: string }>();

    expect(guardado).toEqual({
      cerrado_en: momento,
      cerrado_por: ctx.usuarioId,
    });
  });
});

// ---------------------------------------------------------------------------
// T-12 · `migrations/0003_tenencia_y_unicidad.sql`
// ---------------------------------------------------------------------------

/**
 * El mismo contexto, pero de otro bufete. Es el objeto de todas las pruebas
 * de tenencia cruzada: una fila que mezcla filas de los dos.
 *
 * Los nombres de catálogo llevan su identificador pegado por la misma razón
 * que los de `sembrarContexto`: M-1 los hace únicos por tenant y el
 * almacenamiento no se rebobina entre pruebas.
 */
async function sembrarVecino(): Promise<Contexto & { tenantId: string }> {
  const vecino = {
    tenantId: nuevoId(),
    usuarioId: nuevoId(),
    tipoClienteId: nuevoId(),
    clienteId: nuevoId(),
    areaId: nuevoId(),
    tipoProcesoId: nuevoId(),
    procesoId: nuevoId(),
    etapaId: nuevoId(),
  };
  const ahora = ahoraIso();

  await env.DB.batch([
    env.DB.prepare("INSERT INTO tenant (id, nombre) VALUES (?, ?)").bind(
      vecino.tenantId,
      "Bufete vecino",
    ),
    env.DB.prepare(
      "INSERT INTO usuario (id, tenant_id, nombre, email) VALUES (?, ?, ?, ?)",
    ).bind(
      vecino.usuarioId,
      vecino.tenantId,
      "Ajena",
      `${vecino.usuarioId}@otro-bufete.test`,
    ),
    env.DB.prepare(
      "INSERT INTO tipo_cliente (id, tenant_id, nombre) VALUES (?, ?, ?)",
    ).bind(
      vecino.tipoClienteId,
      vecino.tenantId,
      `Particular ${vecino.tipoClienteId}`,
    ),
    env.DB.prepare(
      "INSERT INTO cliente (id, tenant_id, tipo_cliente_id, nombre, telefono," +
        " creado_por, creado_en) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).bind(
      vecino.clienteId,
      vecino.tenantId,
      vecino.tipoClienteId,
      "Cliente del vecino",
      "+507 6999-9999",
      vecino.usuarioId,
      ahora,
    ),
    env.DB.prepare(
      "INSERT INTO area (id, tenant_id, nombre) VALUES (?, ?, ?)",
    ).bind(vecino.areaId, vecino.tenantId, `Área del vecino ${vecino.areaId}`),
    env.DB.prepare(
      "INSERT INTO tipo_proceso (id, tenant_id, area_id, nombre)" +
        " VALUES (?, ?, ?, ?)",
    ).bind(
      vecino.tipoProcesoId,
      vecino.tenantId,
      vecino.areaId,
      `Tipo del vecino ${vecino.tipoProcesoId}`,
    ),
    env.DB.prepare(
      "INSERT INTO proceso (id, tenant_id, cliente_id, tipo_proceso_id," +
        " origen, titulo, estado, abierto_en) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(
      vecino.procesoId,
      vecino.tenantId,
      vecino.clienteId,
      vecino.tipoProcesoId,
      "directo",
      "Proceso del vecino",
      "abierto",
      ahora,
    ),
    env.DB.prepare(
      "INSERT INTO proceso_etapa (id, tenant_id, proceso_id, nombre, orden)" +
        " VALUES (?, ?, ?, ?, ?)",
    ).bind(vecino.etapaId, vecino.tenantId, vecino.procesoId, "Etapa ajena", 1),
  ]);

  return vecino;
}

/** Un segundo proceso nuestro, con su etapa. Para la regla padre-hijo. */
async function segundoProcesoNuestro(): Promise<{
  procesoId: string;
  etapaId: string;
}> {
  const otro = { procesoId: nuevoId(), etapaId: nuevoId() };
  const ahora = ahoraIso();

  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO proceso (id, tenant_id, cliente_id, tipo_proceso_id," +
        " origen, titulo, estado, abierto_en) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(
      otro.procesoId,
      TENANT_UNICO_ID,
      ctx.clienteId,
      ctx.tipoProcesoId,
      "directo",
      "Otro proceso del mismo bufete",
      "abierto",
      ahora,
    ),
    env.DB.prepare(
      "INSERT INTO proceso_etapa (id, tenant_id, proceso_id, nombre, orden)" +
        " VALUES (?, ?, ?, ?, ?)",
    ).bind(otro.etapaId, TENANT_UNICO_ID, otro.procesoId, "Etapa del otro", 1),
  ]);

  return otro;
}

describe("M-1 · un nombre de catálogo no se repite dentro del tenant", () => {
  it("rechaza dos áreas con el mismo nombre en el mismo tenant", async () => {
    const nombre = `Familia ${nuevoId()}`;
    await insertar("area", { ...filaValida("area", ctx), nombre });

    await expect(
      insertar("area", { ...filaValida("area", ctx), nombre }),
    ).rejects.toThrow(/UNIQUE constraint failed/);
  });

  it("rechaza dos tipos de cliente con el mismo nombre en el mismo tenant", async () => {
    const nombre = `Fundación de interés privado ${nuevoId()}`;
    await insertar("tipo_cliente", { ...filaValida("tipo_cliente", ctx), nombre });

    await expect(
      insertar("tipo_cliente", { ...filaValida("tipo_cliente", ctx), nombre }),
    ).rejects.toThrow(/UNIQUE constraint failed/);
  });

  it("rechaza dos tipos de proceso con el mismo nombre en la misma área", async () => {
    const nombre = `Traspaso ${nuevoId()}`;
    await insertar("tipo_proceso", {
      ...filaValida("tipo_proceso", ctx),
      nombre,
    });

    await expect(
      insertar("tipo_proceso", { ...filaValida("tipo_proceso", ctx), nombre }),
    ).rejects.toThrow(/UNIQUE constraint failed/);
  });

  it("rechaza el nombre repetido aunque la primera fila esté dada de baja", async () => {
    // La decisión deliberada: el índice NO es parcial. Si "Familia" fue dada
    // de baja, la respuesta correcta es reactivarla, no abrir una segunda
    // fila homónima que parta el catálogo en dos.
    const nombre = `Familia ${nuevoId()}`;
    await insertar("area", { ...filaValida("area", ctx), nombre, activo: 0 });

    await expect(
      insertar("area", { ...filaValida("area", ctx), nombre, activo: 1 }),
    ).rejects.toThrow(/UNIQUE constraint failed/);
  });

  it("deja el mismo nombre de tipo de proceso en dos áreas distintas", async () => {
    // Contrapeso: sin esto, un índice de más (sin `area_id`) pasaría
    // desapercibido. "Traspaso" en Civil y "Traspaso" en Migración son dos
    // trámites distintos y el bufete los nombra igual.
    const nombre = `Traspaso ${nuevoId()}`;
    const otraArea = filaValida("area", ctx);
    await insertar("area", otraArea);

    await insertar("tipo_proceso", {
      ...filaValida("tipo_proceso", ctx),
      nombre,
    });
    const segundo = {
      ...filaValida("tipo_proceso", ctx),
      area_id: otraArea.id,
      nombre,
    };

    const resultado = await insertar("tipo_proceso", segundo);
    expect(resultado.meta.changes).toBe(1);
  });

  it("deja el mismo nombre de área en dos tenants distintos", async () => {
    // El otro contrapeso: la unicidad es POR TENANT. Un índice sin
    // `tenant_id` le impediría al vecino tener su propia área "Familia".
    const vecino = await sembrarVecino();
    const nombre = `Familia ${nuevoId()}`;

    await insertar("area", { ...filaValida("area", ctx), nombre });
    const resultado = await insertar("area", {
      id: nuevoId(),
      tenant_id: vecino.tenantId,
      nombre,
    });

    expect(resultado.meta.changes).toBe(1);
  });

  it("no pliega mayúsculas: es el límite documentado, no una omisión", async () => {
    // `0003` decide comparación exacta y explica por qué: el `NOCASE` de
    // SQLite pliega solo ASCII, así que "Migración" y "MIGRACIÓN" seguirían
    // siendo distintas y la cobertura sería falsa. Esta prueba fija el
    // límite para que cambiarlo sea una decisión visible y no un accidente.
    const semilla = nuevoId();
    await insertar("area", {
      ...filaValida("area", ctx),
      nombre: `Familia ${semilla}`,
    });

    const resultado = await insertar("area", {
      ...filaValida("area", ctx),
      nombre: `FAMILIA ${semilla}`,
    });

    expect(resultado.meta.changes).toBe(1);
  });
});

describe("M-2 y M-3 · ninguna fila referencia a otro bufete", () => {
  let vecino: Contexto & { tenantId: string };

  beforeEach(async () => {
    vecino = await sembrarVecino();
  });

  it("rechaza un cliente con el tipo de cliente del vecino", async () => {
    await expect(
      insertar("cliente", {
        ...filaValida("cliente", ctx),
        tipo_cliente_id: vecino.tipoClienteId,
      }),
    ).rejects.toThrow(TENENCIA_CRUZADA);
  });

  it("rechaza un cliente creado por un usuario del vecino", async () => {
    await expect(
      insertar("cliente", {
        ...filaValida("cliente", ctx),
        creado_por: vecino.usuarioId,
      }),
    ).rejects.toThrow(TENENCIA_CRUZADA);
  });

  it("rechaza un tipo de proceso colgado de un área del vecino", async () => {
    await expect(
      insertar("tipo_proceso", {
        ...filaValida("tipo_proceso", ctx),
        area_id: vecino.areaId,
      }),
    ).rejects.toThrow(TENENCIA_CRUZADA);
  });

  // M-2.
  it("rechaza una etapa de plantilla colgada de un tipo del vecino", async () => {
    await expect(
      insertar("etapa_plantilla", {
        ...filaValida("etapa_plantilla", ctx),
        tipo_proceso_id: vecino.tipoProcesoId,
      }),
    ).rejects.toThrow(TENENCIA_CRUZADA);
  });

  // M-3, y es exactamente la fila que `test/procesos-api.spec.ts` tenía que
  // insertar a mano para poder ejercitar su prueba: nuestro `tenant_id` con
  // el `tipo_proceso_id` del vecino. Hasta esta migración entraba.
  it("rechaza un proceso nuestro con el tipo de proceso del vecino", async () => {
    await expect(
      insertar("proceso", {
        ...filaValida("proceso", ctx),
        tipo_proceso_id: vecino.tipoProcesoId,
      }),
    ).rejects.toThrow(TENENCIA_CRUZADA);
  });

  it("rechaza un proceso nuestro con el cliente del vecino", async () => {
    await expect(
      insertar("proceso", {
        ...filaValida("proceso", ctx),
        cliente_id: vecino.clienteId,
      }),
    ).rejects.toThrow(TENENCIA_CRUZADA);
  });

  it("rechaza un proceso a cargo de un responsable del vecino", async () => {
    await expect(
      insertar("proceso", {
        ...filaValida("proceso", ctx),
        responsable_id: vecino.usuarioId,
      }),
    ).rejects.toThrow(TENENCIA_CRUZADA);
  });

  it("rechaza una etapa colgada de un proceso del vecino", async () => {
    await expect(
      insertar("proceso_etapa", {
        ...filaValida("proceso_etapa", ctx),
        proceso_id: vecino.procesoId,
      }),
    ).rejects.toThrow(TENENCIA_CRUZADA);
  });

  it("rechaza una nota nuestra sobre un proceso del vecino", async () => {
    await expect(
      insertar("nota", {
        ...filaValida("nota", ctx),
        proceso_id: vecino.procesoId,
        proceso_etapa_id: vecino.etapaId,
      }),
    ).rejects.toThrow(TENENCIA_CRUZADA);
  });

  it("rechaza una nota firmada por un usuario del vecino", async () => {
    await expect(
      insertar("nota", { ...filaValida("nota", ctx), autor_id: vecino.usuarioId }),
    ).rejects.toThrow(TENENCIA_CRUZADA);
  });

  it("rechaza un pendiente nuestro sobre un proceso del vecino", async () => {
    await expect(
      insertar("pendiente", {
        ...filaValida("pendiente", ctx),
        proceso_id: vecino.procesoId,
        proceso_etapa_id: vecino.etapaId,
      }),
    ).rejects.toThrow(TENENCIA_CRUZADA);
  });

  it("rechaza un pendiente firmado por un usuario del vecino", async () => {
    await expect(
      insertar("pendiente", {
        ...filaValida("pendiente", ctx),
        autor_id: vecino.usuarioId,
      }),
    ).rejects.toThrow(TENENCIA_CRUZADA);
  });

  it("rechaza un pendiente a cargo de un responsable del vecino", async () => {
    await expect(
      insertar("pendiente", {
        ...filaValida("pendiente", ctx),
        responsable_id: vecino.usuarioId,
      }),
    ).rejects.toThrow(TENENCIA_CRUZADA);
  });

  it("rechaza un pendiente cerrado por un usuario del vecino", async () => {
    await expect(
      insertar("pendiente", {
        ...filaValida("pendiente", ctx),
        cerrado_en: ahoraIso(),
        cerrado_por: vecino.usuarioId,
      }),
    ).rejects.toThrow(TENENCIA_CRUZADA);
  });

  it("rechaza una entrada de bitácora firmada por un usuario del vecino", async () => {
    await expect(
      insertar("bitacora", {
        ...filaValida("bitacora", ctx),
        usuario_id: vecino.usuarioId,
      }),
    ).rejects.toThrow(TENENCIA_CRUZADA);
  });
});

describe("M-2 y M-3 · la incoherencia tampoco se alcanza actualizando", () => {
  // Los cinco disparadores de `UPDATE` de la familia de tenencia. Sin ellos
  // la fila nace coherente y se cruza después, que es el mismo agujero con
  // un paso de más. `nota` y `bitacora` no están acá a propósito: son
  // inmutables desde T-2 y T-10, y su `BEFORE UPDATE` aborta toda
  // actualización sin condición, así que un segundo disparador de `UPDATE`
  // sería código muerto. `proceso_etapa` dejó de estar por lo mismo, y lo
  // explica la prueba de abajo.
  let vecino: Contexto & { tenantId: string };

  beforeEach(async () => {
    vecino = await sembrarVecino();
  });

  it("rechaza mover un cliente al tipo de cliente del vecino", async () => {
    await expect(
      env.DB.prepare("UPDATE cliente SET tipo_cliente_id = ? WHERE id = ?")
        .bind(vecino.tipoClienteId, ctx.clienteId)
        .run(),
    ).rejects.toThrow(TENENCIA_CRUZADA);
  });

  it("rechaza mover un tipo de proceso a un área del vecino", async () => {
    await expect(
      env.DB.prepare("UPDATE tipo_proceso SET area_id = ? WHERE id = ?")
        .bind(vecino.areaId, ctx.tipoProcesoId)
        .run(),
    ).rejects.toThrow(TENENCIA_CRUZADA);
  });

  it("rechaza mover una etapa de plantilla al tipo del vecino", async () => {
    const etapa = filaValida("etapa_plantilla", ctx);
    await insertar("etapa_plantilla", etapa);

    await expect(
      env.DB.prepare("UPDATE etapa_plantilla SET tipo_proceso_id = ? WHERE id = ?")
        .bind(vecino.tipoProcesoId, etapa.id)
        .run(),
    ).rejects.toThrow(TENENCIA_CRUZADA);
  });

  it("rechaza mover un proceso al tipo de proceso del vecino", async () => {
    await expect(
      env.DB.prepare("UPDATE proceso SET tipo_proceso_id = ? WHERE id = ?")
        .bind(vecino.tipoProcesoId, ctx.procesoId)
        .run(),
    ).rejects.toThrow(TENENCIA_CRUZADA);
  });

  // La que cambió de guarda en T-13, y vale la pena decir por qué.
  //
  // Hasta T-12 la ataja `proceso_etapa_tenencia_coherente_al_actualizar`.
  // T-13 volvió inmutables las dos únicas columnas que ese disparador
  // miraba, así que su condición no puede dar verdadero nunca y la
  // migración lo quita en vez de dejarlo de adorno. Lo que ataja la
  // escritura ahora es más fuerte y más exacto: la etapa no se muda de
  // proceso, sea el del vecino o uno nuestro —y era el caso «uno nuestro»
  // el que pasaba limpio, porque ahí no hay ninguna tenencia cruzada que
  // denunciar. La prueba del caso propio está en «H-1 · una etapa no se
  // muda de proceso».
  it("rechaza mover una etapa al proceso del vecino", async () => {
    await expect(
      env.DB.prepare("UPDATE proceso_etapa SET proceso_id = ? WHERE id = ?")
        .bind(vecino.procesoId, ctx.etapaId)
        .run(),
    ).rejects.toThrow(/columna inmutable: proceso_etapa\.proceso_id/);
  });

  it("rechaza cerrar un pendiente con un usuario del vecino", async () => {
    const pendiente = filaValida("pendiente", ctx);
    await insertar("pendiente", pendiente);

    await expect(
      env.DB.prepare(
        "UPDATE pendiente SET cerrado_en = ?, cerrado_por = ? WHERE id = ?",
      )
        .bind(ahoraIso(), vecino.usuarioId, pendiente.id)
        .run(),
    ).rejects.toThrow(TENENCIA_CRUZADA);
  });
});

describe("la etapa de una nota o un pendiente es de su mismo proceso", () => {
  // La regla que T-2 señaló y T-9 confirmó, y que es más fuerte que la de
  // tenencia: las dos filas son del mismo bufete y aun así la referencia es
  // incoherente. Sin esta guarda, una nota del proceso A cuelga de una etapa
  // del proceso B y, siendo inmutable, nunca se puede mover.
  it("rechaza una nota cuya etapa es de otro proceso del mismo bufete", async () => {
    const otro = await segundoProcesoNuestro();

    await expect(
      insertar("nota", {
        ...filaValida("nota", ctx),
        proceso_id: ctx.procesoId,
        proceso_etapa_id: otro.etapaId,
      }),
    ).rejects.toThrow(TENENCIA_CRUZADA);
  });

  it("rechaza un pendiente cuya etapa es de otro proceso del mismo bufete", async () => {
    const otro = await segundoProcesoNuestro();

    await expect(
      insertar("pendiente", {
        ...filaValida("pendiente", ctx),
        proceso_id: ctx.procesoId,
        proceso_etapa_id: otro.etapaId,
      }),
    ).rejects.toThrow(TENENCIA_CRUZADA);
  });

  it("rechaza mover un pendiente a una etapa de otro proceso", async () => {
    const otro = await segundoProcesoNuestro();
    const pendiente = filaValida("pendiente", ctx);
    await insertar("pendiente", pendiente);

    await expect(
      env.DB.prepare("UPDATE pendiente SET proceso_etapa_id = ? WHERE id = ?")
        .bind(otro.etapaId, pendiente.id)
        .run(),
    ).rejects.toThrow(TENENCIA_CRUZADA);
  });
});

describe("el padre inexistente también dispara, que es para lo que está IS NOT", () => {
  // La trampa que `0001` documenta para los `CHECK` de fecha y que `0003`
  // repite: si la fila padre no existe, la subconsulta vale NULL. Con `<>`
  // la comparación evalúa a NULL, el `WHEN` da falso y el disparador NO
  // dispara; con `IS NOT` sí. Estas tres pruebas son las que mueren si
  // alguien cambia el operador, y son la única forma de verlo, porque la
  // llave foránea rechazaría la fila igual — con otro mensaje.
  it("una etapa de plantilla con un tipo inexistente muere en el disparador", async () => {
    await expect(
      insertar("etapa_plantilla", {
        ...filaValida("etapa_plantilla", ctx),
        tipo_proceso_id: nuevoId(),
      }),
    ).rejects.toThrow(TENENCIA_CRUZADA);
  });

  it("un proceso con un tipo de proceso inexistente muere en el disparador", async () => {
    await expect(
      insertar("proceso", {
        ...filaValida("proceso", ctx),
        tipo_proceso_id: nuevoId(),
      }),
    ).rejects.toThrow(TENENCIA_CRUZADA);
  });

  it("una nota con una etapa inexistente muere en el disparador", async () => {
    await expect(
      insertar("nota", {
        ...filaValida("nota", ctx),
        proceso_etapa_id: nuevoId(),
      }),
    ).rejects.toThrow(TENENCIA_CRUZADA);
  });
});

// ---------------------------------------------------------------------------
// T-13 · lo que la revisión de T-12 dejó abierto
// ---------------------------------------------------------------------------

/** El `RAISE(ABORT, …)` de los diez disparadores de inmutabilidad de `0003`. */
const COLUMNA_INMUTABLE = /columna inmutable/;

/**
 * Las nueve tablas cuyo `tenant_id` es inmutable por disparador propio.
 *
 * `nota` y `bitacora` no están, y no por olvido: `nota_no_se_actualiza`
 * (`0001`) y `bitacora_no_se_actualiza` (`0002`) son `BEFORE UPDATE` sin
 * condición y abortan **toda** actualización, así que un disparador de
 * inmutabilidad ahí sería código muerto por construcción. Las dos pruebas
 * del final de este describe lo verifican en vez de suponerlo.
 */
const TABLAS_CON_TENANT_INMUTABLE = [
  "usuario",
  "tipo_cliente",
  "cliente",
  "area",
  "tipo_proceso",
  "etapa_plantilla",
  "proceso",
  "proceso_etapa",
  "pendiente",
] as const;

type TablaConTenantInmutable = (typeof TABLAS_CON_TENANT_INMUTABLE)[number];

/**
 * Qué más hay que reescribir para que la mudanza al bufete vecino sea
 * **coherente**, es decir, para que ningún disparador de tenencia tenga nada
 * que objetar.
 *
 * Esto es el corazón de H-1 y la razón de que la prueba no se conforme con
 * `SET tenant_id = …` a secas: una mudanza incoherente la rechazarían los
 * dos disparadores a la vez y el mensaje dependería de cuál corre primero,
 * que en SQLite no está definido. Al repuntar también los padres, la fila
 * queda impecable dentro del bufete vecino, **los catorce disparadores de
 * tenencia callan**, y lo único que puede abortar es la inmutabilidad. Es
 * además el ataque real: nadie roba una fila dejándola rota.
 */
const MUDANZA_COHERENTE: Record<
  TablaConTenantInmutable,
  (vecino: Contexto & { tenantId: string }) => Record<string, string>
> = {
  usuario: () => ({}),
  tipo_cliente: () => ({}),
  area: () => ({}),
  cliente: (vecino) => ({
    tipo_cliente_id: vecino.tipoClienteId,
    creado_por: vecino.usuarioId,
  }),
  tipo_proceso: (vecino) => ({ area_id: vecino.areaId }),
  etapa_plantilla: (vecino) => ({ tipo_proceso_id: vecino.tipoProcesoId }),
  proceso: (vecino) => ({
    cliente_id: vecino.clienteId,
    tipo_proceso_id: vecino.tipoProcesoId,
  }),
  proceso_etapa: (vecino) => ({ proceso_id: vecino.procesoId }),
  pendiente: (vecino) => ({
    proceso_id: vecino.procesoId,
    proceso_etapa_id: vecino.etapaId,
    autor_id: vecino.usuarioId,
  }),
};

describe("H-1 · una fila no cambia de bufete", () => {
  // La clase entera que la revisión de T-12 destapó: los disparadores de
  // tenencia viven en la escritura del HIJO, así que mutar el padre —o
  // mudar la fila completa— los derrota a todos sin que ninguno se entere.
  let vecino: Contexto & { tenantId: string };

  beforeEach(async () => {
    vecino = await sembrarVecino();
  });

  it.each(TABLAS_CON_TENANT_INMUTABLE)(
    "%s rechaza mudarse al bufete vecino, aun con todos sus padres repuntados",
    async (tabla) => {
      const fila = filaValida(tabla, ctx);
      await insertar(tabla, fila);

      const columnas: Record<string, string> = {
        tenant_id: vecino.tenantId,
        ...MUDANZA_COHERENTE[tabla](vecino),
      };
      const asignaciones = Object.keys(columnas)
        .map((columna) => `${columna} = ?`)
        .join(", ");

      await expect(
        env.DB.prepare(`UPDATE ${tabla} SET ${asignaciones} WHERE id = ?`)
          .bind(...Object.values(columnas), fila.id)
          .run(),
      ).rejects.toThrow(COLUMNA_INMUTABLE);

      // Y no se movió a medias: la fila sigue siendo nuestra.
      const guardada = await env.DB.prepare(
        `SELECT tenant_id FROM ${tabla} WHERE id = ?`,
      )
        .bind(fila.id)
        .first<{ tenant_id: string }>();

      expect(guardada?.tenant_id).toBe(TENANT_UNICO_ID);
    },
  );

  // El caso que ningún disparador de `tipo_proceso` puede ver, porque la
  // escritura no es sobre `tipo_proceso`: se mueve el área y sus tipos
  // quedan todos colgados de otro bufete, en silencio.
  it("mover un área al vecino cruzaría todos sus tipos, y ninguno se entera", async () => {
    const tipo = filaValida("tipo_proceso", ctx);
    await insertar("tipo_proceso", tipo);

    await expect(
      env.DB.prepare("UPDATE area SET tenant_id = ? WHERE id = ?")
        .bind(vecino.tenantId, ctx.areaId)
        .run(),
    ).rejects.toThrow(COLUMNA_INMUTABLE);

    // El contrapeso que hace a la prueba sobre la consecuencia y no sobre
    // el mensaje: el tipo sigue compartiendo bufete con su área.
    const arista = await env.DB.prepare(
      "SELECT a.tenant_id AS tenant_del_area, t.tenant_id AS tenant_del_tipo" +
        " FROM tipo_proceso t JOIN area a ON a.id = t.area_id WHERE t.id = ?",
    )
      .bind(tipo.id)
      .first<{ tenant_del_area: string; tenant_del_tipo: string }>();

    expect(arista?.tenant_del_area).toBe(arista?.tenant_del_tipo);
  });

  // Las dos tablas sin disparador de inmutabilidad: se verifica que la
  // escritura muere igual, con el mensaje de quien sí la cubre.
  it("una nota tampoco se muda, y la ataja su propia inmutabilidad", async () => {
    const nota = filaValida("nota", ctx);
    await insertar("nota", nota);

    await expect(
      env.DB.prepare("UPDATE nota SET tenant_id = ? WHERE id = ?")
        .bind(vecino.tenantId, nota.id)
        .run(),
    ).rejects.toThrow(/nota inmutable/);
  });

  it("una entrada de bitácora tampoco, y la ataja la suya", async () => {
    const entrada = filaValida("bitacora", ctx);
    await insertar("bitacora", entrada);

    await expect(
      env.DB.prepare("UPDATE bitacora SET tenant_id = ? WHERE id = ?")
        .bind(vecino.tenantId, entrada.id)
        .run(),
    ).rejects.toThrow(/bitacora inmutable/);
  });
});

describe("H-1 · una etapa no se muda de proceso", () => {
  // El ejemplo exacto de la revisión: `proceso_etapa_tenencia_coherente_al_
  // actualizar` solo comparaba `tenant_id`, así que mover la etapa a otro
  // proceso DEL MISMO BUFETE pasaba limpio y arrastraba con ella las notas,
  // que son inmutables y por lo tanto irrecuperables.
  it("rechaza mover una etapa a otro proceso del mismo bufete", async () => {
    const otro = await segundoProcesoNuestro();
    const nota = filaValida("nota", ctx);
    await insertar("nota", nota);

    await expect(
      env.DB.prepare("UPDATE proceso_etapa SET proceso_id = ? WHERE id = ?")
        .bind(otro.procesoId, ctx.etapaId)
        .run(),
    ).rejects.toThrow(/columna inmutable: proceso_etapa\.proceso_id/);

    // El daño que la mudanza habría hecho, medido donde se habría visto: la
    // nota sigue hablando del proceso del que habla su etapa.
    const linea = await env.DB.prepare(
      "SELECT n.proceso_id AS de_la_nota, e.proceso_id AS de_la_etapa" +
        " FROM nota n JOIN proceso_etapa e ON e.id = n.proceso_etapa_id" +
        " WHERE n.id = ?",
    )
      .bind(nota.id)
      .first<{ de_la_nota: string; de_la_etapa: string }>();

    expect(linea?.de_la_nota).toBe(linea?.de_la_etapa);
    expect(linea?.de_la_etapa).toBe(ctx.procesoId);
  });
});

// ---------------------------------------------------------------------------
// M-5 · el cierre de un proceso no se dice a medias (T-15)
// ---------------------------------------------------------------------------

/** El `RAISE(ABORT, …)` de los dos disparadores de coherencia de cierre. */
const CIERRE_INCOHERENTE = /cierre incoherente/;

/** Un proceso nuestro, cerrado como corresponde: con su estado y su fecha. */
async function procesoCerradoCoherente(): Promise<Fila> {
  const fila: Fila = {
    ...filaValida("proceso", ctx),
    estado: "cerrado",
    cerrado_en: ahoraIso(),
  };
  await insertar("proceso", fila);
  return fila;
}

describe("M-5 · el estado de un proceso y su fecha de cierre dicen lo mismo", () => {
  // `pendiente` tiene esta regla desde T-2 —`CHECK ((cerrado_en IS NULL) =
  // (cerrado_por IS NULL))`— y `proceso` no la tenía: hasta T-14 la
  // coherencia la sostenían las dos transiciones del worker, que escriben
  // las dos columnas juntas. Una regla que vive solo en el código es
  // exactamente la que `docs/diseno.md` §5 señala como la que el primer
  // script de importación se salta.

  it("rechaza un proceso que nace cerrado sin fecha de cierre", async () => {
    await expect(
      insertar("proceso", { ...filaValida("proceso", ctx), estado: "cerrado" }),
    ).rejects.toThrow(CIERRE_INCOHERENTE);
  });

  it("rechaza un proceso que nace abierto con una fecha de cierre colgada", async () => {
    await expect(
      insertar("proceso", {
        ...filaValida("proceso", ctx),
        estado: "abierto",
        cerrado_en: ahoraIso(),
      }),
    ).rejects.toThrow(CIERRE_INCOHERENTE);
  });

  it("rechaza cerrar un proceso sin escribir cuándo se cerró", async () => {
    const fila = filaValida("proceso", ctx);
    await insertar("proceso", fila);

    await expect(
      env.DB.prepare("UPDATE proceso SET estado = 'cerrado' WHERE id = ?")
        .bind(fila.id)
        .run(),
    ).rejects.toThrow(CIERRE_INCOHERENTE);

    // El contrapeso: el proceso sigue abierto y sin fecha, no a medio cerrar.
    const guardado = await env.DB.prepare(
      "SELECT estado, cerrado_en FROM proceso WHERE id = ?",
    )
      .bind(fila.id)
      .first<{ estado: string; cerrado_en: string | null }>();

    expect(guardado).toEqual({ estado: "abierto", cerrado_en: null });
  });

  it("rechaza reabrir un proceso dejándole la fecha de cierre puesta", async () => {
    const fila = await procesoCerradoCoherente();

    await expect(
      env.DB.prepare("UPDATE proceso SET estado = 'abierto' WHERE id = ?")
        .bind(fila.id)
        .run(),
    ).rejects.toThrow(CIERRE_INCOHERENTE);
  });

  it("rechaza borrar la fecha dejando el proceso cerrado", async () => {
    const fila = await procesoCerradoCoherente();

    await expect(
      env.DB.prepare("UPDATE proceso SET cerrado_en = NULL WHERE id = ?")
        .bind(fila.id)
        .run(),
    ).rejects.toThrow(CIERRE_INCOHERENTE);
  });

  // Ésta es la prueba que distingue `IS NOT` de `<>`, y la única que puede
  // hacerlo: los dos lados de la comparación son booleanos, así que con un
  // `estado` legítimo las dos formas se comportan igual. Con `estado` nulo,
  // `NEW.estado = 'cerrado'` vale NULL; `<>` daría NULL, el `WHEN` sería
  // falso y el disparador no dispararía. Con `IS NOT` dispara.
  //
  // Y acá el disparador llegando antes que `NOT NULL` no tapa ningún error
  // real: `estado` tiene `DEFAULT 'abierto'`, así que la columna **ausente**
  // nunca produce NULL. Sólo lo produce un NULL escrito a mano, que no es
  // una omisión sino una fila deliberadamente incoherente — justo lo que
  // esta guarda viene a rechazar. Por eso, a diferencia de los disparadores
  // de tenencia, este no lleva guardia de NULL delante.
  it("un estado nulo tampoco se escurre por la comparación", async () => {
    await expect(
      insertar("proceso", { ...filaValida("proceso", ctx), estado: null }),
    ).rejects.toThrow(CIERRE_INCOHERENTE);
  });

  // El contrapeso de todo el bloque: las dos transiciones que el worker
  // escribe desde T-14 siguen pasando. Sin esto, un disparador que abortara
  // todo haría pasar las cinco pruebas de rechazo de arriba.
  it("deja pasar las dos transiciones coherentes que el worker escribe", async () => {
    const fila = filaValida("proceso", ctx);
    await insertar("proceso", fila);
    const momento = ahoraIso();

    await env.DB.prepare(
      "UPDATE proceso SET estado = 'cerrado', cerrado_en = ? WHERE id = ?",
    )
      .bind(momento, fila.id)
      .run();

    const cerrado = await env.DB.prepare(
      "SELECT estado, cerrado_en FROM proceso WHERE id = ?",
    )
      .bind(fila.id)
      .first<{ estado: string; cerrado_en: string | null }>();

    expect(cerrado).toEqual({ estado: "cerrado", cerrado_en: momento });

    await env.DB.prepare(
      "UPDATE proceso SET estado = 'abierto', cerrado_en = NULL WHERE id = ?",
    )
      .bind(fila.id)
      .run();

    const reabierto = await env.DB.prepare(
      "SELECT estado, cerrado_en FROM proceso WHERE id = ?",
    )
      .bind(fila.id)
      .first<{ estado: string; cerrado_en: string | null }>();

    expect(reabierto).toEqual({ estado: "abierto", cerrado_en: null });
  });
});

describe("H-4b · la llave foránea de tenant_id está declarada, no solo vigilada", () => {
  // Por qué no alcanza con «rechaza la misma fila con un tenant_id que no
  // existe»: desde `0003` el disparador de tenencia llega antes que la
  // llave foránea en las ocho tablas que lo llevan, así que esa prueba dejó
  // de poder distinguir la ausencia de la llave. `PRAGMA foreign_key_list`
  // lee la declaración del esquema y no depende de qué guarda aborta
  // primero, que es exactamente lo que se quería probar.
  //
  // Se recorren las once tablas con `tenant_id` y no solo las ocho: la
  // declaración es la misma regla para todas, y las tres restantes salen
  // gratis.
  it.each(TABLAS_CON_TENANT)(
    "%s declara tenant_id como llave foránea hacia tenant (id)",
    async (tabla) => {
      const { results } = await env.DB.prepare(
        `PRAGMA foreign_key_list(${tabla})`,
      ).all<{ table: string; from: string; to: string }>();

      expect(
        results.map(({ table, from, to }) => ({ table, from, to })),
      ).toContainEqual({ table: "tenant", from: "tenant_id", to: "id" });
    },
  );
});

// ---------------------------------------------------------------------------
// H-2 · la migración no supone una base que ya cumple
// ---------------------------------------------------------------------------
//
// `CREATE UNIQUE INDEX` sí aborta sobre datos duplicados, pero los
// disparadores **no revisan nada de lo ya escrito**: una fila cruzada
// preexistente quedaría viva e inmodificable, y nadie se enteraría. Por eso
// `0003` abre con una verificación previa que la hace fallar entera.
//
// Estas pruebas la ejercitan de la única forma que la prueba de verdad:
// desarmando `0003` sobre la base de este archivo, ensuciándola con la fila
// que la regla prohíbe, y pidiéndole al corredor real de migraciones que la
// vuelva a aplicar. El `batch` de `applyD1Migrations` es una transacción de
// D1, así que un fallo deja la base exactamente como estaba —eso también se
// afirma— y el `finally` la reconstruye para las pruebas que sigan.

const MIGRACION_0003 = "0003_tenencia_y_unicidad.sql";

interface ObjetoDelEsquema {
  clase: "INDEX" | "TRIGGER";
  nombre: string;
}

/**
 * Los índices y disparadores que `0003` crea, leídos **de la migración
 * misma** y no de una lista copiada a mano. Un objeto nuevo en la migración
 * entra solo; una lista paralela se habría desincronizado al primer cambio.
 */
function objetosQueCrea0003(): ObjetoDelEsquema[] {
  const migracion = env.TEST_MIGRATIONS.find(
    (candidata) => candidata.name === MIGRACION_0003,
  );
  if (migracion === undefined) {
    throw new Error(`${MIGRACION_0003} no está en TEST_MIGRATIONS`);
  }

  return migracion.queries.flatMap((consulta): ObjetoDelEsquema[] => {
    // Los comentarios se descartan antes de buscar: el encabezado de `0003`
    // menciona `CREATE UNIQUE INDEX` y `CREATE TRIGGER` en prosa.
    const sql = consulta.replace(/^\s*--.*$/gm, "");
    const indice = /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(\w+)/i.exec(sql);
    if (indice !== null) return [{ clase: "INDEX" as const, nombre: indice[1] }];
    const disparador = /CREATE\s+TRIGGER\s+(\w+)/i.exec(sql);
    if (disparador !== null) {
      return [{ clase: "TRIGGER" as const, nombre: disparador[1] }];
    }
    return [];
  });
}

/** Cuántos de esos objetos existen hoy en el esquema. */
async function objetosDe0003Vivos(): Promise<number> {
  const nombres = objetosQueCrea0003().map((objeto) => objeto.nombre);
  const fila = await env.DB.prepare(
    `SELECT count(*) AS n FROM sqlite_master WHERE name IN (${nombres
      .map(() => "?")
      .join(", ")})`,
  )
    .bind(...nombres)
    .first<{ n: number }>();

  return fila?.n ?? 0;
}

/** Deja la base como estaba antes de `0003`, contabilidad incluida. */
async function deshacer0003(): Promise<void> {
  await env.DB.batch([
    ...objetosQueCrea0003().map((objeto) =>
      env.DB.prepare(`DROP ${objeto.clase} ${objeto.nombre}`),
    ),
    env.DB.prepare("DELETE FROM d1_migrations WHERE name = ?").bind(
      MIGRACION_0003,
    ),
  ]);
}

/** El corredor real de migraciones. Con `0003` pendiente, aplica `0003`. */
function aplicar0003(): Promise<void> {
  return applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
}

describe("H-2 · la verificación previa detiene la migración sobre una base sucia", () => {
  it("se detiene si ya hay nombres de catálogo repetidos", async () => {
    await deshacer0003();
    const nombre = `Familia ${nuevoId()}`;
    const primera: Fila = { ...filaValida("area", ctx), nombre };
    const segunda: Fila = { ...filaValida("area", ctx), nombre };

    try {
      await insertar("area", primera);
      await insertar("area", segunda);

      await expect(aplicar0003()).rejects.toThrow(
        /la_base_ya_tiene_nombres_de_catalogo_repetidos/,
      );

      // Y se detuvo antes de crear nada: ni medio esquema puesto.
      expect(await objetosDe0003Vivos()).toBe(0);
    } finally {
      await env.DB.batch([
        env.DB.prepare("DELETE FROM area WHERE id = ?").bind(primera.id),
        env.DB.prepare("DELETE FROM area WHERE id = ?").bind(segunda.id),
      ]);
      await aplicar0003();
    }

    // Sobre la base ya limpia la misma migración entra sin chistar, que es
    // la otra mitad de la afirmación: la verificación no estorba.
    expect(await objetosDe0003Vivos()).toBe(objetosQueCrea0003().length);
  });

  it("se detiene si ya hay una fila que referencia a otro bufete", async () => {
    const vecino = await sembrarVecino();
    await deshacer0003();
    const cruzado: Fila = {
      ...filaValida("tipo_proceso", ctx),
      area_id: vecino.areaId,
    };

    try {
      await insertar("tipo_proceso", cruzado);

      await expect(aplicar0003()).rejects.toThrow(
        /la_base_ya_tiene_filas_que_referencian_a_otro_bufete/,
      );

      expect(await objetosDe0003Vivos()).toBe(0);
    } finally {
      await env.DB.prepare("DELETE FROM tipo_proceso WHERE id = ?")
        .bind(cruzado.id)
        .run();
      await aplicar0003();
    }

    expect(await objetosDe0003Vivos()).toBe(objetosQueCrea0003().length);
  });

  it("se detiene si ya hay un pendiente colgado de la etapa de otro proceso", async () => {
    const otro = await segundoProcesoNuestro();
    await deshacer0003();
    const descolgado: Fila = {
      ...filaValida("pendiente", ctx),
      proceso_id: ctx.procesoId,
      proceso_etapa_id: otro.etapaId,
    };

    try {
      await insertar("pendiente", descolgado);

      await expect(aplicar0003()).rejects.toThrow(
        /la_base_ya_tiene_hijos_colgados_de_la_etapa_de_otro_proceso/,
      );

      expect(await objetosDe0003Vivos()).toBe(0);
    } finally {
      await env.DB.prepare("DELETE FROM pendiente WHERE id = ?")
        .bind(descolgado.id)
        .run();
      await aplicar0003();
    }

    expect(await objetosDe0003Vivos()).toBe(objetosQueCrea0003().length);
  });

  // La cuarta familia, agregada con M-5 (T-15). Un proceso que ya estuviera
  // marcado como cerrado sin su fecha sobreviviría a la migración y quedaría
  // mintiendo: dice «cerrado» y no sabe decir cuándo. Peor, cualquier
  // `UPDATE` suyo que no arregle la incoherencia de paso moriría contra el
  // disparador nuevo, y nadie entendería por qué.
  it("se detiene si ya hay un proceso cerrado sin fecha de cierre", async () => {
    await deshacer0003();
    const aMedias: Fila = {
      ...filaValida("proceso", ctx),
      estado: "cerrado",
    };

    try {
      await insertar("proceso", aMedias);

      await expect(aplicar0003()).rejects.toThrow(
        /la_base_ya_tiene_procesos_con_el_cierre_incoherente/,
      );

      expect(await objetosDe0003Vivos()).toBe(0);
    } finally {
      await env.DB.prepare("DELETE FROM proceso WHERE id = ?")
        .bind(aMedias.id)
        .run();
      await aplicar0003();
    }

    expect(await objetosDe0003Vivos()).toBe(objetosQueCrea0003().length);
  });
});
