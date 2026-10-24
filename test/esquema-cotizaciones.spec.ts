import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { TENANT_UNICO_ID, nuevoId } from "../worker/db/ids";
import { ahoraIso } from "../worker/db/momentos";

/**
 * Pruebas del esquema de la cotización: `migrations/0004_cotizaciones.sql`
 * (T-1 de `odd/tasks/cotizaciones.md`).
 *
 * El criterio es el mismo de `test/esquema.spec.ts` y no se negocia: una
 * invariante se prueba demostrando que la base **rechaza** la escritura
 * inválida. Una fila válida que entra no prueba nada, porque entra igual con
 * la restricción borrada. Por eso casi todo lo de acá abajo es un
 * `INSERT`/`UPDATE`/`DELETE` que *debe* fallar, más la aserción de que falló.
 *
 * Las excepciones son deliberadas y se llaman contrapesos: si la fila base de
 * una tabla no entrara, todas sus pruebas de rechazo pasarían por la razón
 * equivocada, y una guarda que rechazara *todo* —un `CHECK` invertido, un
 * disparador sin condición— pasaría inadvertida.
 *
 * Las guardas se cuentan, nunca se atrapan: acá no hay un solo `try/catch`
 * que disfrace el error de un disparador, una llave foránea o un índice.
 */

type Fila = Record<string, string | number | null>;

const TABLAS = ["cotizacion", "cotizacion_modulo", "cotizacion_linea"] as const;

type Tabla = (typeof TABLAS)[number];

interface Contexto {
  usuarioId: string;
  tipoClienteId: string;
  clienteId: string;
  areaId: string;
  tipoProcesoId: string;
  cotizacionId: string;
}

/** El `RAISE(ABORT, …)` de los cinco disparadores de tenencia de `0004`. */
const TENENCIA_CRUZADA = /tenencia cruzada/;

/** El de los cinco disparadores de inmutabilidad. */
const COLUMNA_INMUTABLE = /columna inmutable/;

/** Los seis tipos de módulo de prosa de `docs/diseno.md` §8. */
const TIPOS_DE_MODULO = [
  "alcance",
  "exclusiones",
  "antecedentes",
  "supuestos",
  "clausulas",
  "nota_cliente",
] as const;

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
 * Siembra el mínimo para que una cotización y sus hijas tengan padres reales.
 *
 * El almacenamiento no se rebobina entre pruebas del mismo archivo, así que
 * esto corre una vez por prueba sobre la base que dejó la anterior. De ahí
 * que los nombres de catálogo y el código de la cotización lleven su
 * identificador pegado: `area` y `tipo_cliente` tienen unicidad de nombre por
 * tenant desde `0003`, y `cotizacion` la tiene de código desde `0004`. Un
 * choque del andamio sería un rechazo que no prueba nada.
 */
async function sembrarContexto(): Promise<Contexto> {
  const ctx: Contexto = {
    usuarioId: nuevoId(),
    tipoClienteId: nuevoId(),
    clienteId: nuevoId(),
    areaId: nuevoId(),
    tipoProcesoId: nuevoId(),
    cotizacionId: nuevoId(),
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
      "INSERT INTO cotizacion (id, tenant_id, cliente_id, codigo, estado," +
        " fecha, moneda, creada_por, creada_en)" +
        " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(
      ctx.cotizacionId,
      TENANT_UNICO_ID,
      ctx.clienteId,
      `COT-${ctx.cotizacionId}`,
      "borrador",
      ahora,
      "USD",
      ctx.usuarioId,
      ahora,
    ),
  ]);

  return ctx;
}

/**
 * El mismo contexto, pero de otro bufete. Es el objeto de todas las pruebas
 * de tenencia cruzada: una fila que mezcla filas de los dos.
 */
async function sembrarVecino(): Promise<Contexto & { tenantId: string }> {
  const vecino = {
    tenantId: nuevoId(),
    usuarioId: nuevoId(),
    tipoClienteId: nuevoId(),
    clienteId: nuevoId(),
    areaId: nuevoId(),
    tipoProcesoId: nuevoId(),
    cotizacionId: nuevoId(),
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
      "INSERT INTO cotizacion (id, tenant_id, cliente_id, codigo, estado," +
        " fecha, moneda, creada_por, creada_en)" +
        " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(
      vecino.cotizacionId,
      vecino.tenantId,
      vecino.clienteId,
      `COT-${vecino.cotizacionId}`,
      "borrador",
      ahora,
      "USD",
      vecino.usuarioId,
      ahora,
    ),
  ]);

  return vecino;
}

/** Una segunda cotización nuestra. Para los índices únicos de `orden`. */
async function segundaCotizacionNuestra(ctx: Contexto): Promise<string> {
  const id = nuevoId();
  const ahora = ahoraIso();

  await insertar("cotizacion", {
    id,
    tenant_id: TENANT_UNICO_ID,
    cliente_id: ctx.clienteId,
    codigo: `COT-${id}`,
    estado: "borrador",
    fecha: ahora,
    moneda: "USD",
    creada_por: ctx.usuarioId,
    creada_en: ahora,
  });

  return id;
}

/** Una fila completa y válida por tabla, con identificadores nuevos. */
function filaValida(tabla: Tabla, ctx: Contexto): Fila {
  const ahora = ahoraIso();
  const base = { id: nuevoId(), tenant_id: TENANT_UNICO_ID };

  switch (tabla) {
    case "cotizacion":
      return {
        ...base,
        cliente_id: ctx.clienteId,
        codigo: `COT-${base.id}`,
        estado: "borrador",
        fecha: ahora,
        vence_en: null,
        moneda: "USD",
        snapshot: null,
        duplicada_de_id: null,
        creada_por: ctx.usuarioId,
        creada_en: ahora,
      };
    case "cotizacion_modulo":
      return {
        ...base,
        cotizacion_id: ctx.cotizacionId,
        tipo: "alcance",
        orden: 1,
        contenido: "Tramitación completa de la visa de trabajo.",
      };
    case "cotizacion_linea":
      return {
        ...base,
        cotizacion_id: ctx.cotizacionId,
        tipo_proceso_id: ctx.tipoProcesoId,
        clase: "honorario",
        concepto: "Honorario profesional",
        monto: 150_000,
        orden: 1,
      };
  }
}

let ctx: Contexto;

beforeEach(async () => {
  ctx = await sembrarContexto();
});

describe("fila válida de referencia", () => {
  // Sin esto, una fila base mal armada haría pasar todas las pruebas de
  // rechazo de su tabla por el motivo equivocado.
  it.each(TABLAS)("%s acepta su fila válida", async (tabla) => {
    const fila = filaValida(tabla, ctx);
    const resultado = await insertar(tabla, fila);

    expect(resultado.meta.changes).toBe(1);

    const guardada = await env.DB.prepare(
      `SELECT id FROM ${tabla} WHERE id = ?`,
    )
      .bind(fila.id)
      .first<{ id: string }>();

    expect(guardada?.id).toBe(fila.id);
  });
});

describe("I-1 · toda cotización está ligada a un cliente", () => {
  // El invariante vive en la base y no en la aplicación, que es el criterio
  // de `docs/diseno.md` §5: una regla que vive sólo en el código es la que el
  // primer script de importación se salta.
  it("rechaza una cotización sin cliente_id", async () => {
    const fila = sin(filaValida("cotizacion", ctx), "cliente_id");

    await expect(insertar("cotizacion", fila)).rejects.toThrow(
      /NOT NULL constraint failed: cotizacion\.cliente_id/,
    );
  });

  it("rechaza una cotización con cliente_id en nulo explícito", async () => {
    const fila = { ...filaValida("cotizacion", ctx), cliente_id: null };

    await expect(insertar("cotizacion", fila)).rejects.toThrow(
      /NOT NULL constraint failed: cotizacion\.cliente_id/,
    );
  });

  it("rechaza borrar un cliente que tiene cotizaciones", async () => {
    await expect(
      env.DB.prepare("DELETE FROM cliente WHERE id = ?")
        .bind(ctx.clienteId)
        .run(),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/);
  });
});

describe("I-8 · las tres tablas llevan tenant_id", () => {
  it.each(TABLAS)("%s rechaza la misma fila sin tenant_id", async (tabla) => {
    const fila = sin(filaValida(tabla, ctx), "tenant_id");

    await expect(insertar(tabla, fila)).rejects.toThrow(
      new RegExp(`NOT NULL constraint failed: ${tabla}\\.tenant_id`),
    );
  });

  // Por qué no alcanza con la de arriba: el disparador de tenencia llega
  // antes que la llave foránea, así que un `tenant_id` inventado muere con
  // el mensaje del disparador y esa prueba no distinguiría la ausencia de la
  // llave. `PRAGMA foreign_key_list` lee la declaración del esquema.
  it.each(TABLAS)(
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

  it.each(TABLAS)(
    "%s rechaza la misma fila con un tenant_id que no existe",
    async (tabla) => {
      const fila = { ...filaValida(tabla, ctx), tenant_id: nuevoId() };

      await expect(insertar(tabla, fila)).rejects.toThrow(TENENCIA_CRUZADA);
    },
  );
});

describe("vocabularios cerrados con CHECK, no con ENUM", () => {
  it("rechaza un estado de cotización fuera del dominio", async () => {
    const fila = { ...filaValida("cotizacion", ctx), estado: "archivada" };

    await expect(insertar("cotizacion", fila)).rejects.toThrow(
      /CHECK constraint failed: el_estado_de_la_cotizacion/,
    );
  });

  it.each(["borrador", "emitida", "ganada", "perdida"])(
    "acepta el estado %s, que es del dominio",
    async (estado) => {
      // Contrapeso: un `CHECK` invertido rechazaría los cuatro y la prueba de
      // arriba seguiría verde.
      const fila = {
        ...filaValida("cotizacion", ctx),
        estado,
        snapshot: estado === "borrador" ? null : "{}",
      };

      await expect(insertar("cotizacion", fila)).resolves.toBeTruthy();
    },
  );

  // Vocabulario cerrado a una sola moneda a propósito: agregar una es un
  // despliegue, el mismo criterio que el catálogo de módulos.
  it("rechaza una moneda fuera del dominio", async () => {
    const fila = { ...filaValida("cotizacion", ctx), moneda: "PAB" };

    await expect(insertar("cotizacion", fila)).rejects.toThrow(
      /CHECK constraint failed: la_moneda_de_la_cotizacion/,
    );
  });

  it("rechaza un tipo de módulo fuera del dominio", async () => {
    const fila = { ...filaValida("cotizacion_modulo", ctx), tipo: "conclusiones" };

    await expect(insertar("cotizacion_modulo", fila)).rejects.toThrow(
      /CHECK constraint failed: el_tipo_de_modulo/,
    );
  });

  it.each(TIPOS_DE_MODULO)(
    "acepta el tipo de módulo %s, que es de los seis de §8",
    async (tipo) => {
      const fila = {
        ...filaValida("cotizacion_modulo", ctx),
        tipo,
        orden: TIPOS_DE_MODULO.indexOf(tipo) + 1,
      };

      await expect(insertar("cotizacion_modulo", fila)).resolves.toBeTruthy();
    },
  );

  it("rechaza una clase de línea fuera del dominio", async () => {
    const fila = { ...filaValida("cotizacion_linea", ctx), clase: "impuesto" };

    await expect(insertar("cotizacion_linea", fila)).rejects.toThrow(
      /CHECK constraint failed: la_clase_de_la_linea/,
    );
  });

  it.each(["honorario", "gasto_estimado"])(
    "acepta la clase %s, que separa las dos familias",
    async (clase) => {
      const fila = {
        ...filaValida("cotizacion_linea", ctx),
        clase,
        orden: clase === "honorario" ? 1 : 2,
      };

      await expect(insertar("cotizacion_linea", fila)).resolves.toBeTruthy();
    },
  );
});

describe("momentos en ISO 8601 UTC", () => {
  const noSonMomentos = ["2026-10-24", "ayer", "24/10/2026", ""];

  // Los peligrosos son éstos: fechas de verdad en una forma que no es la
  // canónica. Si el `CHECK` dejara pasar una sola, la columna tendría dos
  // formatos y el orden lexicográfico dejaría de coincidir con el
  // cronológico — y de ese orden depende el `CHECK` de vigencia de más abajo.
  const casiMomentos = [
    "2026-10-24T13:45:00Z",
    "2026-10-24T13:45:00.000+00:00",
    "2026-10-24 13:45:00.000Z",
    "2026-10-24T13:45:00.000",
    "2026-10-24T09:45:00.000-04:00",
  ];

  const columnas = ["fecha", "vence_en", "creada_en"] as const;

  it.each(
    columnas.flatMap((columna) =>
      [...noSonMomentos, ...casiMomentos].map((valor) => ({ columna, valor })),
    ),
  )("rechaza $valor en cotizacion.$columna", async ({ columna, valor }) => {
    const fila = { ...filaValida("cotizacion", ctx), [columna]: valor };

    await expect(insertar("cotizacion", fila)).rejects.toThrow(
      /CHECK constraint failed/,
    );
  });

  it("acepta exactamente lo que produce toISOString()", async () => {
    const momento = new Date().toISOString();
    const fila = {
      ...filaValida("cotizacion", ctx),
      fecha: momento,
      vence_en: momento,
      creada_en: momento,
    };

    await expect(insertar("cotizacion", fila)).resolves.toBeTruthy();
  });
});

describe("la vigencia no termina antes de empezar", () => {
  it("rechaza un vence_en anterior a la fecha", async () => {
    const fila = {
      ...filaValida("cotizacion", ctx),
      fecha: "2026-10-24T00:00:00.000Z",
      vence_en: "2026-10-23T23:59:59.999Z",
    };

    await expect(insertar("cotizacion", fila)).rejects.toThrow(
      /CHECK constraint failed: la_vigencia_no_termina_antes_de_empezar/,
    );
  });

  it("rechaza mover la fecha más allá del vencimiento ya escrito", async () => {
    const fila: Fila = {
      ...filaValida("cotizacion", ctx),
      fecha: "2026-10-01T00:00:00.000Z",
      vence_en: "2026-10-15T00:00:00.000Z",
    };
    await insertar("cotizacion", fila);

    await expect(
      env.DB.prepare("UPDATE cotizacion SET fecha = ? WHERE id = ?")
        .bind("2026-10-20T00:00:00.000Z", fila.id)
        .run(),
    ).rejects.toThrow(/CHECK constraint failed: la_vigencia_no_termina_antes_de_empezar/);
  });

  it("acepta una cotización que no vence", async () => {
    // Contrapeso: `vence_en` es nullable a propósito y un `CHECK` sin la
    // guarda de NULL dejaría fuera el caso mayoritario.
    const fila = { ...filaValida("cotizacion", ctx), vence_en: null };

    await expect(insertar("cotizacion", fila)).resolves.toBeTruthy();
  });

  it("acepta un vencimiento el mismo día que la fecha", async () => {
    const momento = ahoraIso();
    const fila = {
      ...filaValida("cotizacion", ctx),
      fecha: momento,
      vence_en: momento,
    };

    await expect(insertar("cotizacion", fila)).resolves.toBeTruthy();
  });
});

describe("el borrador no tiene snapshot y la emitida sí", () => {
  // Las dos direcciones de la misma regla. I-5 —que el snapshot no se
  // reescriba— e I-4 —que una emitida no se edite— son de T-4 y no están acá:
  // esto sólo exige que el estado y el snapshot digan lo mismo.
  it("rechaza un borrador que ya trae snapshot", async () => {
    const fila = {
      ...filaValida("cotizacion", ctx),
      estado: "borrador",
      snapshot: '{"lineas":[]}',
    };

    await expect(insertar("cotizacion", fila)).rejects.toThrow(
      /CHECK constraint failed: el_borrador_no_tiene_snapshot/,
    );
  });

  it.each(["emitida", "ganada", "perdida"])(
    "rechaza una cotización %s sin snapshot",
    async (estado) => {
      const fila = { ...filaValida("cotizacion", ctx), estado, snapshot: null };

      await expect(insertar("cotizacion", fila)).rejects.toThrow(
        /CHECK constraint failed: el_borrador_no_tiene_snapshot/,
      );
    },
  );

  it("rechaza emitir sin escribir el snapshot en la misma escritura", async () => {
    const fila = filaValida("cotizacion", ctx);
    await insertar("cotizacion", fila);

    await expect(
      env.DB.prepare("UPDATE cotizacion SET estado = 'emitida' WHERE id = ?")
        .bind(fila.id)
        .run(),
    ).rejects.toThrow(/CHECK constraint failed: el_borrador_no_tiene_snapshot/);

    // El contrapeso que hace a la prueba sobre la consecuencia y no sobre el
    // mensaje: la cotización sigue siendo un borrador, no quedó a medio
    // emitir.
    const guardada = await env.DB.prepare(
      "SELECT estado, snapshot FROM cotizacion WHERE id = ?",
    )
      .bind(fila.id)
      .first<{ estado: string; snapshot: string | null }>();

    expect(guardada).toEqual({ estado: "borrador", snapshot: null });
  });

  it("rechaza volver a borrador dejándole el snapshot puesto", async () => {
    const fila: Fila = {
      ...filaValida("cotizacion", ctx),
      estado: "emitida",
      snapshot: '{"lineas":[]}',
    };
    await insertar("cotizacion", fila);

    await expect(
      env.DB.prepare("UPDATE cotizacion SET estado = 'borrador' WHERE id = ?")
        .bind(fila.id)
        .run(),
    ).rejects.toThrow(/CHECK constraint failed: el_borrador_no_tiene_snapshot/);
  });

  it("deja pasar la emisión que escribe estado y snapshot juntos", async () => {
    // Contrapeso: un `CHECK` que rechazara toda emisión haría pasar las
    // cinco pruebas de rechazo de arriba.
    const fila = filaValida("cotizacion", ctx);
    await insertar("cotizacion", fila);
    const snapshot = '{"lineas":[{"concepto":"Honorario","monto":150000}]}';

    await env.DB.prepare(
      "UPDATE cotizacion SET estado = 'emitida', snapshot = ? WHERE id = ?",
    )
      .bind(snapshot, fila.id)
      .run();

    const guardada = await env.DB.prepare(
      "SELECT estado, snapshot FROM cotizacion WHERE id = ?",
    )
      .bind(fila.id)
      .first<{ estado: string; snapshot: string | null }>();

    expect(guardada).toEqual({ estado: "emitida", snapshot });
  });
});

describe("el código de una cotización no se repite dentro del bufete", () => {
  it("rechaza dos cotizaciones con el mismo código en el mismo tenant", async () => {
    const codigo = `COT-2026-${nuevoId()}`;
    await insertar("cotizacion", { ...filaValida("cotizacion", ctx), codigo });

    await expect(
      insertar("cotizacion", { ...filaValida("cotizacion", ctx), codigo }),
    ).rejects.toThrow(/UNIQUE constraint failed/);
  });

  it("deja al bufete vecino usar el mismo código", async () => {
    // Sin el `tenant_id` en la llave, el índice le impediría al vecino tener
    // su propia numeración.
    const vecino = await sembrarVecino();
    const codigo = `COT-2026-${nuevoId()}`;
    const ahora = ahoraIso();

    await insertar("cotizacion", { ...filaValida("cotizacion", ctx), codigo });

    await expect(
      insertar("cotizacion", {
        id: nuevoId(),
        tenant_id: vecino.tenantId,
        cliente_id: vecino.clienteId,
        codigo,
        estado: "borrador",
        fecha: ahora,
        moneda: "USD",
        creada_por: vecino.usuarioId,
        creada_en: ahora,
      }),
    ).resolves.toBeTruthy();
  });

  it("compara exacto: dos códigos que sólo difieren en mayúsculas conviven", async () => {
    // La decisión de M-1 en `0003`, por el mismo motivo: el `NOCASE` de
    // SQLite pliega sólo ASCII, así que sería media cobertura disfrazada de
    // cobertura entera. Esta prueba fija el criterio en vez de dejarlo
    // implícito.
    const base = `cot-2026-${nuevoId()}`;
    await insertar("cotizacion", {
      ...filaValida("cotizacion", ctx),
      codigo: base,
    });

    await expect(
      insertar("cotizacion", {
        ...filaValida("cotizacion", ctx),
        codigo: base.toUpperCase(),
      }),
    ).resolves.toBeTruthy();
  });
});

describe("el orden es único dentro de cada cotización", () => {
  const hijas = [
    { tabla: "cotizacion_modulo", segunda: { tipo: "exclusiones" } },
    { tabla: "cotizacion_linea", segunda: { clase: "gasto_estimado" } },
  ] as const;

  it.each(hijas)(
    "$tabla rechaza dos filas con el mismo orden en la misma cotización",
    async ({ tabla, segunda }) => {
      await insertar(tabla, { ...filaValida(tabla, ctx), orden: 3 });

      await expect(
        insertar(tabla, { ...filaValida(tabla, ctx), ...segunda, orden: 3 }),
      ).rejects.toThrow(/UNIQUE constraint failed/);
    },
  );

  it.each(hijas)(
    "$tabla acepta el mismo orden en otra cotización",
    async ({ tabla }) => {
      // Contrapeso: sin `cotizacion_id` en la llave, el índice haría único el
      // orden en todo el bufete y la segunda cotización no podría empezar
      // por uno.
      const otra = await segundaCotizacionNuestra(ctx);
      await insertar(tabla, { ...filaValida(tabla, ctx), orden: 3 });

      await expect(
        insertar(tabla, {
          ...filaValida(tabla, ctx),
          cotizacion_id: otra,
          orden: 3,
        }),
      ).resolves.toBeTruthy();
    },
  );
});

describe("los montos son centavos enteros y nunca negativos", () => {
  it("rechaza un monto negativo", async () => {
    const fila = { ...filaValida("cotizacion_linea", ctx), monto: -1 };

    await expect(insertar("cotizacion_linea", fila)).rejects.toThrow(
      /CHECK constraint failed: el_monto_es_centavos_enteros/,
    );
  });

  // La trampa de SQLite: `INTEGER` es afinidad, no tipo. Un 15.5 no se puede
  // convertir sin pérdida, así que la columna lo guarda **como real** y la
  // declaración no impide nada. Sólo `typeof` lo impide.
  it("rechaza un monto con coma flotante", async () => {
    const fila = { ...filaValida("cotizacion_linea", ctx), monto: 1500.5 };

    await expect(insertar("cotizacion_linea", fila)).rejects.toThrow(
      /CHECK constraint failed: el_monto_es_centavos_enteros/,
    );
  });

  it("acepta un monto de cero", async () => {
    // Contrapeso del `>= 0`: una línea sin costo es legítima —una cortesía,
    // un trámite incluido— y un `> 0` la dejaría fuera.
    const fila = { ...filaValida("cotizacion_linea", ctx), monto: 0 };

    await expect(insertar("cotizacion_linea", fila)).resolves.toBeTruthy();
  });

  it("guarda el monto como entero y lo devuelve igual", async () => {
    const fila: Fila = {
      ...filaValida("cotizacion_linea", ctx),
      monto: 1_234_567,
    };
    await insertar("cotizacion_linea", fila);

    const guardada = await env.DB.prepare(
      "SELECT monto, typeof(monto) AS tipo FROM cotizacion_linea WHERE id = ?",
    )
      .bind(fila.id)
      .first<{ monto: number; tipo: string }>();

    expect(guardada).toEqual({ monto: 1_234_567, tipo: "integer" });
  });
});

describe("la aritmética no se guarda, se deriva", () => {
  // T-3 deriva subtotales y total. Esta prueba fija hoy que no hay dónde
  // guardarlos, que es lo que impide que mañana alguien los persista y los
  // deje desincronizados de sus líneas.
  it.each(["cotizacion", "cotizacion_linea"])(
    "%s no tiene columna de subtotal ni de total",
    async (tabla) => {
      const { results } = await env.DB.prepare(
        `SELECT name FROM pragma_table_info('${tabla}')`,
      ).all<{ name: string }>();
      const columnas = results.map((fila) => fila.name);

      expect(columnas).not.toContain("subtotal");
      expect(columnas).not.toContain("total");
    },
  );
});

describe("ninguna fila de la cotización referencia a otro bufete", () => {
  let vecino: Contexto & { tenantId: string };

  beforeEach(async () => {
    vecino = await sembrarVecino();
  });

  it("rechaza una cotización para el cliente del vecino", async () => {
    await expect(
      insertar("cotizacion", {
        ...filaValida("cotizacion", ctx),
        cliente_id: vecino.clienteId,
      }),
    ).rejects.toThrow(TENENCIA_CRUZADA);
  });

  it("rechaza una cotización creada por un usuario del vecino", async () => {
    await expect(
      insertar("cotizacion", {
        ...filaValida("cotizacion", ctx),
        creada_por: vecino.usuarioId,
      }),
    ).rejects.toThrow(TENENCIA_CRUZADA);
  });

  it("rechaza duplicar una cotización del vecino", async () => {
    await expect(
      insertar("cotizacion", {
        ...filaValida("cotizacion", ctx),
        duplicada_de_id: vecino.cotizacionId,
      }),
    ).rejects.toThrow(TENENCIA_CRUZADA);
  });

  it("rechaza mover una cotización al cliente del vecino", async () => {
    await expect(
      env.DB.prepare("UPDATE cotizacion SET cliente_id = ? WHERE id = ?")
        .bind(vecino.clienteId, ctx.cotizacionId)
        .run(),
    ).rejects.toThrow(TENENCIA_CRUZADA);
  });

  // Las tres cláusulas del disparador de `UPDATE` de `cotizacion` necesitan
  // una prueba cada una. Las dos de abajo las agregó la auditoría cláusula por
  // cláusula: hasta entonces sólo `cliente_id` tenía quien la matara, y las
  // otras dos se podían borrar sin que nada se enterara. Las pruebas de
  // inventario no sirven de red: cuentan disparadores, no cláusulas, y un
  // disparador con la mitad de las suyas vacías las sigue pasando.
  it("rechaza atar una cotización nuestra a una duplicada del vecino", async () => {
    await expect(
      env.DB.prepare("UPDATE cotizacion SET duplicada_de_id = ? WHERE id = ?")
        .bind(vecino.cotizacionId, ctx.cotizacionId)
        .run(),
    ).rejects.toThrow(TENENCIA_CRUZADA);

    // El contrapeso: la cotización sigue sin duplicar a nadie, no quedó atada
    // a medias al bufete de al lado.
    const guardada = await env.DB.prepare(
      "SELECT duplicada_de_id FROM cotizacion WHERE id = ?",
    )
      .bind(ctx.cotizacionId)
      .first<{ duplicada_de_id: string | null }>();

    expect(guardada?.duplicada_de_id).toBeNull();
  });

  it("rechaza reasignarle la autoría a un usuario del vecino", async () => {
    await expect(
      env.DB.prepare("UPDATE cotizacion SET creada_por = ? WHERE id = ?")
        .bind(vecino.usuarioId, ctx.cotizacionId)
        .run(),
    ).rejects.toThrow(TENENCIA_CRUZADA);
  });

  it("rechaza un módulo colgado de una cotización del vecino", async () => {
    await expect(
      insertar("cotizacion_modulo", {
        ...filaValida("cotizacion_modulo", ctx),
        cotizacion_id: vecino.cotizacionId,
      }),
    ).rejects.toThrow(TENENCIA_CRUZADA);
  });

  it("rechaza una línea colgada de una cotización del vecino", async () => {
    await expect(
      insertar("cotizacion_linea", {
        ...filaValida("cotizacion_linea", ctx),
        cotizacion_id: vecino.cotizacionId,
      }),
    ).rejects.toThrow(TENENCIA_CRUZADA);
  });

  it("rechaza una línea atada a un tipo de proceso del vecino", async () => {
    await expect(
      insertar("cotizacion_linea", {
        ...filaValida("cotizacion_linea", ctx),
        tipo_proceso_id: vecino.tipoProcesoId,
      }),
    ).rejects.toThrow(TENENCIA_CRUZADA);
  });

  it("rechaza mover una línea al tipo de proceso del vecino", async () => {
    const linea = filaValida("cotizacion_linea", ctx);
    await insertar("cotizacion_linea", linea);

    await expect(
      env.DB.prepare("UPDATE cotizacion_linea SET tipo_proceso_id = ? WHERE id = ?")
        .bind(vecino.tipoProcesoId, linea.id)
        .run(),
    ).rejects.toThrow(TENENCIA_CRUZADA);
  });
});

describe("el padre inexistente también dispara, que es para lo que está IS NOT", () => {
  // Si la fila padre no existe, la subconsulta vale NULL. Con `<>` la
  // comparación evalúa a NULL, el `WHEN` da falso y el disparador NO dispara;
  // con `IS NOT` sí. Estas pruebas son las que mueren si alguien cambia el
  // operador, y son la única forma de verlo: la llave foránea rechazaría la
  // fila igual, pero con otro mensaje.
  //
  // Va una por **cláusula**, no una por disparador. La auditoría mostró que
  // con tres pruebas sólo tres de las once cláusulas de entonces tenían
  // cubierto su operador: en las otras ocho se podía escribir `<>` y las 109
  // pruebas seguían verdes. `IS NOT` y nunca `<>` es la restricción 3 de la
  // tajada, la que ya mordió cuatro veces, y no se cubre por tabla sino por
  // arista. Hoy las cláusulas son diez y las diez están cubiertas acá.
  it("una cotización para un cliente inexistente muere en el disparador", async () => {
    await expect(
      insertar("cotizacion", {
        ...filaValida("cotizacion", ctx),
        cliente_id: nuevoId(),
      }),
    ).rejects.toThrow(TENENCIA_CRUZADA);
  });

  it("una cotización duplicada de una inexistente muere en el disparador", async () => {
    await expect(
      insertar("cotizacion", {
        ...filaValida("cotizacion", ctx),
        duplicada_de_id: nuevoId(),
      }),
    ).rejects.toThrow(TENENCIA_CRUZADA);
  });

  it("una cotización creada por un usuario inexistente muere en el disparador", async () => {
    await expect(
      insertar("cotizacion", {
        ...filaValida("cotizacion", ctx),
        creada_por: nuevoId(),
      }),
    ).rejects.toThrow(TENENCIA_CRUZADA);
  });

  it("mover una cotización a un cliente inexistente muere en el disparador", async () => {
    await expect(
      env.DB.prepare("UPDATE cotizacion SET cliente_id = ? WHERE id = ?")
        .bind(nuevoId(), ctx.cotizacionId)
        .run(),
    ).rejects.toThrow(TENENCIA_CRUZADA);
  });

  it("atarla a una duplicada inexistente muere en el disparador", async () => {
    await expect(
      env.DB.prepare("UPDATE cotizacion SET duplicada_de_id = ? WHERE id = ?")
        .bind(nuevoId(), ctx.cotizacionId)
        .run(),
    ).rejects.toThrow(TENENCIA_CRUZADA);
  });

  it("reasignarle la autoría a un usuario inexistente muere en el disparador", async () => {
    await expect(
      env.DB.prepare("UPDATE cotizacion SET creada_por = ? WHERE id = ?")
        .bind(nuevoId(), ctx.cotizacionId)
        .run(),
    ).rejects.toThrow(TENENCIA_CRUZADA);
  });

  it("un módulo de una cotización inexistente muere en el disparador", async () => {
    await expect(
      insertar("cotizacion_modulo", {
        ...filaValida("cotizacion_modulo", ctx),
        cotizacion_id: nuevoId(),
      }),
    ).rejects.toThrow(TENENCIA_CRUZADA);
  });

  it("una línea de una cotización inexistente muere en el disparador", async () => {
    await expect(
      insertar("cotizacion_linea", {
        ...filaValida("cotizacion_linea", ctx),
        cotizacion_id: nuevoId(),
      }),
    ).rejects.toThrow(TENENCIA_CRUZADA);
  });

  it("una línea con un tipo de proceso inexistente muere en el disparador", async () => {
    await expect(
      insertar("cotizacion_linea", {
        ...filaValida("cotizacion_linea", ctx),
        tipo_proceso_id: nuevoId(),
      }),
    ).rejects.toThrow(TENENCIA_CRUZADA);
  });

  it("mover una línea a un tipo de proceso inexistente muere en el disparador", async () => {
    const linea = filaValida("cotizacion_linea", ctx);
    await insertar("cotizacion_linea", linea);

    await expect(
      env.DB.prepare("UPDATE cotizacion_linea SET tipo_proceso_id = ? WHERE id = ?")
        .bind(nuevoId(), linea.id)
        .run(),
    ).rejects.toThrow(TENENCIA_CRUZADA);
  });

  // Falta una arista en esta lista y su ausencia es la conclusión, no el
  // hueco: `cotizacion_linea.cotizacion_id` **ya no existe** en el `WHEN` del
  // disparador de `UPDATE`. La auditoría la encontró inalcanzable —para
  // volverla verdadera hay que cambiar `cotizacion_id` o `tenant_id`, y las
  // dos son inmutables—, y la migración la quitó por el mismo criterio con
  // el que `cotizacion_modulo` no tiene disparador de `UPDATE` y con el que
  // T-13 se lo quitó a `proceso_etapa` en `0003`.
  //
  // Queda escrito por qué no se la cubrió con una prueba en vez de borrarla:
  // la única posible afirmaría `columna inmutable` sobre una escritura que
  // dos disparadores quieren abortar a la vez, y el orden de disparo entre
  // disparadores del mismo evento **no está definido en SQLite**. Sería una
  // prueba que pasa hoy y se rompe sola el día que cambie el motor, y que
  // además no probaría la cláusula sino cuál de los dos llegó primero.
  //
  // Lo que sí está probado es la consecuencia, en «un módulo y una línea no
  // se mudan de cotización»: la línea no se muda, y muere con el mensaje
  // exacto de la guarda que de verdad la cubre.
});

describe("las columnas nullable siguen siendo nullable", () => {
  // El contrapeso de la guardia de NULL de cada condición: sin ella, toda
  // columna nullable pasaría a ser obligatoria porque la subconsulta vacía
  // daría `IS NOT` verdadero.
  it("acepta una cotización que no duplica a ninguna", async () => {
    const fila = { ...filaValida("cotizacion", ctx), duplicada_de_id: null };

    await expect(insertar("cotizacion", fila)).resolves.toBeTruthy();
  });

  it("acepta una línea que no abre ningún proceso", async () => {
    const fila = { ...filaValida("cotizacion_linea", ctx), tipo_proceso_id: null };

    await expect(insertar("cotizacion_linea", fila)).resolves.toBeTruthy();
  });

  it("acepta duplicar una cotización nuestra", async () => {
    const fila = {
      ...filaValida("cotizacion", ctx),
      duplicada_de_id: ctx.cotizacionId,
    };

    await expect(insertar("cotizacion", fila)).resolves.toBeTruthy();
  });
});

describe("una fila de la cotización no cambia de bufete", () => {
  let vecino: Contexto & { tenantId: string };

  beforeEach(async () => {
    vecino = await sembrarVecino();
  });

  // La mudanza se hace **coherente** —se repuntan también los padres— a
  // propósito: una incoherente la rechazarían dos disparadores a la vez y el
  // mensaje dependería de cuál corre primero, que en SQLite no está
  // definido. Así la fila queda impecable dentro del bufete vecino, los
  // disparadores de tenencia callan, y lo único que puede abortar es la
  // inmutabilidad. Es además el ataque real: nadie roba una fila dejándola
  // rota.
  it("cotizacion rechaza mudarse, aun con todos sus padres repuntados", async () => {
    const fila = filaValida("cotizacion", ctx);
    await insertar("cotizacion", fila);

    await expect(
      env.DB.prepare(
        "UPDATE cotizacion SET tenant_id = ?, cliente_id = ?, creada_por = ?" +
          " WHERE id = ?",
      )
        .bind(vecino.tenantId, vecino.clienteId, vecino.usuarioId, fila.id)
        .run(),
    ).rejects.toThrow(COLUMNA_INMUTABLE);

    const guardada = await env.DB.prepare(
      "SELECT tenant_id FROM cotizacion WHERE id = ?",
    )
      .bind(fila.id)
      .first<{ tenant_id: string }>();

    expect(guardada?.tenant_id).toBe(TENANT_UNICO_ID);
  });

  it.each(["cotizacion_modulo", "cotizacion_linea"] as const)(
    "%s rechaza mudarse, aun con su cotización repuntada",
    async (tabla) => {
      const fila = filaValida(tabla, ctx);
      await insertar(tabla, fila);

      await expect(
        env.DB.prepare(
          `UPDATE ${tabla} SET tenant_id = ?, cotizacion_id = ? WHERE id = ?`,
        )
          .bind(vecino.tenantId, vecino.cotizacionId, fila.id)
          .run(),
      ).rejects.toThrow(COLUMNA_INMUTABLE);

      const guardada = await env.DB.prepare(
        `SELECT tenant_id FROM ${tabla} WHERE id = ?`,
      )
        .bind(fila.id)
        .first<{ tenant_id: string }>();

      expect(guardada?.tenant_id).toBe(TENANT_UNICO_ID);
    },
  );
});

describe("un módulo y una línea no se mudan de cotización", () => {
  // El mismo caso que `proceso_etapa_proceso_inmutable` cerró en `0003`, y
  // acá es más grave: la guarda de I-4 —una emitida no se edita— vive en la
  // escritura de `cotizacion`. Recolgar un hijo cambia el contenido de una
  // cotización **sin escribir una sola columna suya**, así que ese disparador
  // ni se entera. El daño, además, no tiene vuelta: el snapshot ya se mandó
  // al cliente.
  it.each(["cotizacion_modulo", "cotizacion_linea"] as const)(
    "%s rechaza mudarse a otra cotización del mismo bufete",
    async (tabla) => {
      const otra = await segundaCotizacionNuestra(ctx);
      const fila = filaValida(tabla, ctx);
      await insertar(tabla, fila);

      await expect(
        env.DB.prepare(`UPDATE ${tabla} SET cotizacion_id = ? WHERE id = ?`)
          .bind(otra, fila.id)
          .run(),
      ).rejects.toThrow(
        new RegExp(`columna inmutable: ${tabla}\\.cotizacion_id`),
      );

      // El daño medido donde se habría visto: la cotización de la que
      // cuelga sigue siendo la suya.
      const guardada = await env.DB.prepare(
        `SELECT cotizacion_id FROM ${tabla} WHERE id = ?`,
      )
        .bind(fila.id)
        .first<{ cotizacion_id: string }>();

      expect(guardada?.cotizacion_id).toBe(ctx.cotizacionId);
    },
  );

  it.each(["cotizacion_modulo", "cotizacion_linea"] as const)(
    "%s sí se reordena dentro de su cotización",
    async (tabla) => {
      // Contrapeso: una inmutabilidad escrita de más —sobre `orden`, o sobre
      // la fila entera— dejaría a T-2 y T-3 sin poder reordenar, y las dos
      // pruebas de arriba seguirían verdes.
      const fila = filaValida(tabla, ctx);
      await insertar(tabla, fila);

      await env.DB.prepare(`UPDATE ${tabla} SET orden = ? WHERE id = ?`)
        .bind(7, fila.id)
        .run();

      const guardada = await env.DB.prepare(
        `SELECT orden FROM ${tabla} WHERE id = ?`,
      )
        .bind(fila.id)
        .first<{ orden: number }>();

      expect(guardada?.orden).toBe(7);
    },
  );
});

describe("los disparadores de 0004 están todos y no hay ninguno de más", () => {
  // La lista va exacta y no por `toContain` a propósito. Un disparador de
  // más sería código muerto —`cotizacion_modulo` no lleva el de `UPDATE`
  // porque sus dos únicas columnas comparables son inmutables, igual que
  // `proceso_etapa` en `0003`— y ésta es la prueba que lo haría notar.
  const esperados: Record<string, string[]> = {
    cotizacion: [
      "cotizacion_tenencia_coherente_al_insertar",
      "cotizacion_tenencia_coherente_al_actualizar",
      "cotizacion_tenant_inmutable",
    ],
    cotizacion_modulo: [
      "cotizacion_modulo_tenencia_coherente_al_insertar",
      "cotizacion_modulo_tenant_inmutable",
      "cotizacion_modulo_cotizacion_inmutable",
    ],
    cotizacion_linea: [
      "cotizacion_linea_tenencia_coherente_al_insertar",
      "cotizacion_linea_tenencia_coherente_al_actualizar",
      "cotizacion_linea_tenant_inmutable",
      "cotizacion_linea_cotizacion_inmutable",
    ],
  };

  it.each(TABLAS)("%s lleva exactamente sus disparadores", async (tabla) => {
    const { results } = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'trigger'" +
        " AND tbl_name = ? ORDER BY name",
    )
      .bind(tabla)
      .all<{ name: string }>();

    expect(results.map((fila) => fila.name)).toEqual(
      [...esperados[tabla]].sort(),
    );
  });
});

describe("M-0 · la migración y sus guardas llegan juntas o no llegan", () => {
  // `0003` abre con una verificación previa porque pone disparadores sobre
  // tablas que nacieron en `0001` y podían llegar con filas cruzadas. `0004`
  // no la lleva, y no por olvido: las tres tablas **nacen en el mismo archivo
  // que sus disparadores**, y el archivo viaja como un `batch` —que en D1 es
  // una transacción— tanto por `applyD1Migrations` como por `wrangler d1
  // migrations apply`. No existe el instante en que una fila pueda entrar sin
  // disparador.
  //
  // Esta prueba es la mitad verificable de ese argumento: todo lo que `0004`
  // declara está puesto. Un disparador escrito y no creado —un punto y coma
  // de menos, un `CREATE` que quedó dentro de un comentario— se vería acá.
  const MIGRACION = "0004_cotizaciones.sql";

  function objetosQueCrea(): { clase: string; nombre: string }[] {
    const migracion = env.TEST_MIGRATIONS.find(
      (candidata) => candidata.name === MIGRACION,
    );
    if (migracion === undefined) {
      throw new Error(`${MIGRACION} no está en TEST_MIGRATIONS`);
    }

    return migracion.queries.flatMap((consulta) => {
      // Los comentarios se descartan antes de buscar: el encabezado menciona
      // `CREATE TRIGGER` y `CREATE UNIQUE INDEX` en prosa.
      const sql = consulta.replace(/^\s*--.*$/gm, "");
      const hallazgo =
        /CREATE\s+TABLE\s+(\w+)/i.exec(sql) ??
        /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(\w+)/i.exec(sql) ??
        /CREATE\s+TRIGGER\s+(\w+)/i.exec(sql);

      return hallazgo === null
        ? []
        : [{ clase: hallazgo[0].split(/\s+/)[1].toUpperCase(), nombre: hallazgo[1] }];
    });
  }

  it("declara las tres tablas, sus índices y sus diez disparadores", async () => {
    const declarados = objetosQueCrea();

    // Que la lectura de la migración no esté vacía: si la expresión regular
    // dejara de encontrar nada, la prueba de abajo pasaría trivialmente.
    expect(declarados.filter((objeto) => objeto.clase === "TABLE")).toHaveLength(3);
    expect(declarados.filter((objeto) => objeto.clase === "TRIGGER")).toHaveLength(10);
  });

  it("y todos ellos existen en la base", async () => {
    const nombres = objetosQueCrea().map((objeto) => objeto.nombre);
    const { results } = await env.DB.prepare(
      `SELECT name FROM sqlite_master WHERE name IN (${nombres
        .map(() => "?")
        .join(", ")})`,
    )
      .bind(...nombres)
      .all<{ name: string }>();

    expect(results.map((fila) => fila.name).sort()).toEqual([...nombres].sort());
  });
});
