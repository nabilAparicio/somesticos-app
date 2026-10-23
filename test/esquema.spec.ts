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
  it("no crea ninguna tabla de la tajada 2", async () => {
    const deLaTajadaDos = [
      "cotizacion",
      "cotizacion_modulo",
      "cotizacion_linea",
      "cuota",
      "movimiento_gasto",
    ];

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
  // Los seis disparadores de `UPDATE`. Sin ellos la fila nace coherente y se
  // cruza después, que es el mismo agujero con un paso de más. `nota` y
  // `bitacora` no están acá a propósito: son inmutables desde T-2 y T-10, y
  // su `BEFORE UPDATE` aborta toda actualización sin condición, así que un
  // segundo disparador de `UPDATE` sería código muerto.
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

  it("rechaza mover una etapa al proceso del vecino", async () => {
    await expect(
      env.DB.prepare("UPDATE proceso_etapa SET proceso_id = ? WHERE id = ?")
        .bind(vecino.procesoId, ctx.etapaId)
        .run(),
    ).rejects.toThrow(TENENCIA_CRUZADA);
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
