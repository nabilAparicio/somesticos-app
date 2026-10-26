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

/** El `RAISE(ABORT, …)` de las siete guardas de I-4 de `0006`. */
const CONGELADA = /cotizacion congelada/;

/** El de la guarda de I-5. */
const SNAPSHOT_INMUTABLE = /snapshot inmutable/;

/** El de la guarda de transición de `0007` (M-1). */
const CICLO_DE_VIDA = /ciclo de vida/;

/**
 * Un snapshot cualquiera. No se parsea en ninguna prueba de este archivo: lo
 * que la base exige de esa columna es que esté o no esté según el estado, no
 * qué forma tiene adentro. Quién decide la forma es
 * `worker/cotizaciones/snapshot.ts`, y lo prueba `test/emitir-api.spec.ts`.
 */
const UN_SNAPSHOT = '{"version":1,"lineas":[]}';

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
  // **Desde `0007` ésta la contesta otra guarda, y no es un retroceso.**
  // `cotizacion_duplicada_de_inmutable` no deja cambiar `duplicada_de_id` en
  // absoluto sobre un borrador, así que la cláusula de `duplicada_de_id` del
  // disparador de tenencia de `UPDATE` ya no puede evaluarse: la escritura
  // muere antes, venga de donde venga el padre. La guarda nueva es
  // estrictamente más fuerte —prohíbe también re-apuntar dentro del mismo
  // bufete, que es lo que cerraba el ciclo de la cadena— y por eso se deja
  // una sola. Lo que la prueba sigue afirmando es lo que importa: la
  // escritura **no ocurre** y la fila queda como estaba.
  //
  // La arista `duplicada_de_id` sigue cubierta donde todavía se puede
  // escribir, que es el alta: «rechaza duplicar una cotización del vecino»
  // acá arriba, y «una cotización duplicada de una inexistente muere en el
  // disparador» más abajo, que es la que cubre su operador.
  it("rechaza atar una cotización nuestra a una duplicada del vecino", async () => {
    await expect(
      env.DB.prepare("UPDATE cotizacion SET duplicada_de_id = ? WHERE id = ?")
        .bind(vecino.cotizacionId, ctx.cotizacionId)
        .run(),
    ).rejects.toThrow(COLUMNA_INMUTABLE);

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

  // Igual que su gemela de más arriba: desde `0007` el `UPDATE` de
  // `duplicada_de_id` no llega al disparador de tenencia, porque
  // `cotizacion_duplicada_de_inmutable` lo aborta antes. El operador de esa
  // cláusula queda cubierto por la prueba del **alta** con un padre
  // inexistente, que es el camino que todavía existe.
  it("atarla a una duplicada inexistente muere en el disparador", async () => {
    await expect(
      env.DB.prepare("UPDATE cotizacion SET duplicada_de_id = ? WHERE id = ?")
        .bind(nuevoId(), ctx.cotizacionId)
        .run(),
    ).rejects.toThrow(COLUMNA_INMUTABLE);
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

/* ===========================================================================
   I-4 e I-5, que son de `migrations/0006_emitir_y_congelar.sql` (T-4 A)
   ===========================================================================

   El criterio del archivo no cambia y acá pesa más que en ningún otro lado:
   **un invariante se prueba por rechazo**. Una prueba que emite una
   cotización y verifica que quedó emitida no prueba nada de I-4 — pasa igual
   con los ocho disparadores borrados.

   Lo que sí hay son contrapesos, y están nombrados como tales: sin ellos, un
   disparador escrito sin condición —que abortara toda escritura sobre una
   cotización que ya no es borrador— haría pasar todas las pruebas de rechazo
   y rompería el ciclo de vida de T-5 sin que nada se pusiera rojo. */

interface Congelada {
  id: string;
  moduloId: string;
  lineaId: string;
}

/**
 * Una cotización ya congelada, con un módulo y una línea adentro.
 *
 * Los dos hijos entran **antes** de congelarla, que es el único momento en
 * que se puede: después, los seis disparadores de M-4 los rechazan. Esa
 * secuencia es, de paso, la demostración de que el alta sigue funcionando
 * sobre un borrador.
 *
 * `estado` es un parámetro y no una constante porque la regla no habla de
 * `emitida` sino de **«ya no es borrador»**: una ganada y una perdida están
 * igual de congeladas, y si la guarda dijera `= 'emitida'` el documento se
 * volvería editable el día que el cliente acepta, que es el peor día
 * posible.
 *
 * **Desde `0007` el salto a `ganada` o a `perdida` pasa obligatoriamente por
 * `emitida`**, y este ayudante lo hace en dos escrituras en vez de una. No
 * es un rodeo: `cotizacion_el_estado_sigue_el_ciclo_de_vida` rechaza
 * `borrador → ganada`, que era justo el camino por el que se podía fabricar
 * un documento congelado sin pasar por `emitir`. Que este ayudante haya
 * tenido que cambiar es la señal más barata de que la guarda existe.
 */
async function cotizacionCongelada(
  estado: "emitida" | "ganada" | "perdida" = "emitida",
): Promise<Congelada> {
  const cotizacion = filaValida("cotizacion", ctx);
  await insertar("cotizacion", cotizacion);

  const modulo: Fila = {
    ...filaValida("cotizacion_modulo", ctx),
    cotizacion_id: cotizacion.id,
  };
  const linea: Fila = {
    ...filaValida("cotizacion_linea", ctx),
    cotizacion_id: cotizacion.id,
  };
  await insertar("cotizacion_modulo", modulo);
  await insertar("cotizacion_linea", linea);

  await env.DB.prepare(
    "UPDATE cotizacion SET estado = 'emitida', snapshot = ? WHERE id = ?",
  )
    .bind(UN_SNAPSHOT, cotizacion.id)
    .run();

  if (estado !== "emitida") {
    await env.DB.prepare("UPDATE cotizacion SET estado = ? WHERE id = ?")
      .bind(estado, cotizacion.id)
      .run();
  }

  return {
    id: String(cotizacion.id),
    moduloId: String(modulo.id),
    lineaId: String(linea.id),
  };
}

/** Un segundo cliente y un segundo usuario, los dos de este bufete. */
async function segundosDelBufete(): Promise<{
  clienteId: string;
  usuarioId: string;
}> {
  const clienteId = nuevoId();
  const usuarioId = nuevoId();
  const ahora = ahoraIso();

  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO usuario (id, tenant_id, nombre, email) VALUES (?, ?, ?, ?)",
    ).bind(usuarioId, TENANT_UNICO_ID, "Otra", `${usuarioId}@bufete.pa`),
    env.DB.prepare(
      "INSERT INTO cliente (id, tenant_id, tipo_cliente_id, nombre, telefono," +
        " creado_por, creado_en) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).bind(
      clienteId,
      TENANT_UNICO_ID,
      ctx.tipoClienteId,
      "Segundo cliente",
      "+507 6111-1111",
      ctx.usuarioId,
      ahora,
    ),
  ]);

  return { clienteId, usuarioId };
}

describe("I-4 · una cotización que ya no es borrador no se edita", () => {
  // **Una prueba por cláusula**, que es la lección 2 de T-1: la cobertura de
  // una condición con nueve `OR` no se mide por disparador sino por rama.
  // Con una sola prueba se puede borrar ocho de las nueve comparaciones y
  // todo sigue verde.
  //
  // Dos de las nueve son nullable —`vence_en` y `duplicada_de_id`— y ésas
  // van de nulo a valor **a propósito**: es la única forma en que la
  // elección de `IS NOT` sobre `<>` es observable. Con `<>`, una comparación
  // contra NULL vale NULL, el `WHEN` da falso y la escritura **pasa**.
  it.each([
    "id",
    "cliente_id",
    "codigo",
    "fecha",
    "vence_en",
    "moneda",
    "duplicada_de_id",
    "creada_por",
    "creada_en",
  ])("cambiarle %s a una emitida muere en el disparador", async (columna) => {
    const congelada = await cotizacionCongelada();
    const otros = await segundosDelBufete();
    const otraCotizacion = await segundaCotizacionNuestra(ctx);

    // Los valores son todos **legítimos y de este bufete**: con un
    // identificador inexistente saltaría primero el disparador de tenencia
    // de `0004` y la prueba estaría afirmando la guarda equivocada.
    const valores: Record<string, string> = {
      id: nuevoId(),
      cliente_id: otros.clienteId,
      codigo: `COT-${nuevoId()}`,
      fecha: "2020-03-04T05:06:07.008Z",
      vence_en: "2030-12-31T23:59:59.999Z",
      // El `CHECK` de moneda sólo admite 'USD', así que no hay segundo valor
      // legítimo. Lo que esta prueba afirma es **cuál de las dos guardas
      // contesta**: con la cláusula puesta aborta el disparador; sin ella
      // llegaría el `CHECK`, con otro mensaje.
      moneda: "PAB",
      duplicada_de_id: otraCotizacion,
      creada_por: otros.usuarioId,
      creada_en: "2019-01-02T03:04:05.006Z",
    };

    await expect(
      env.DB.prepare(`UPDATE cotizacion SET ${columna} = ? WHERE id = ?`)
        .bind(valores[columna], congelada.id)
        .run(),
    ).rejects.toThrow(CONGELADA);
  });

  it.each(["emitida", "ganada", "perdida"] as const)(
    "una %s tampoco se edita: la regla es «ya no es borrador»",
    async (estado) => {
      const congelada = await cotizacionCongelada(estado);

      await expect(
        env.DB.prepare("UPDATE cotizacion SET codigo = ? WHERE id = ?")
          .bind(`COT-${nuevoId()}`, congelada.id)
          .run(),
      ).rejects.toThrow(CONGELADA);
    },
  );

  it("contrapeso: el estado sí se mueve, que es lo que T-5 necesita", async () => {
    // Sin esto, un disparador que abortara **toda** actualización de una
    // emitida haría pasar las trece pruebas de rechazo de arriba y dejaría
    // el ciclo de vida de `docs/diseno.md` §8 sin su segunda mitad.
    const congelada = await cotizacionCongelada();

    await env.DB.prepare("UPDATE cotizacion SET estado = 'ganada' WHERE id = ?")
      .bind(congelada.id)
      .run();

    const guardada = await env.DB.prepare(
      "SELECT estado, snapshot FROM cotizacion WHERE id = ?",
    )
      .bind(congelada.id)
      .first<{ estado: string; snapshot: string | null }>();

    // Y el snapshot sigue siendo el mismo: ganar no reescribe el documento.
    expect(guardada).toEqual({ estado: "ganada", snapshot: UN_SNAPSHOT });
  });

  it("contrapeso: un borrador se sigue editando entero", async () => {
    // El otro extremo: un `WHEN` sin la condición de estado congelaría todas
    // las cotizaciones desde que nacen, y la API de T-2 dejaría de guardar.
    const fila = filaValida("cotizacion", ctx);
    await insertar("cotizacion", fila);

    await env.DB.prepare(
      "UPDATE cotizacion SET codigo = ?, vence_en = ? WHERE id = ?",
    )
      .bind(`COT-${nuevoId()}`, "2030-12-31T23:59:59.999Z", fila.id)
      .run();

    const guardada = await env.DB.prepare(
      "SELECT vence_en FROM cotizacion WHERE id = ?",
    )
      .bind(fila.id)
      .first<{ vence_en: string | null }>();

    expect(guardada?.vence_en).toBe("2030-12-31T23:59:59.999Z");
  });

  it("`tenant_id` sigue contestando con su propia guarda y no con ésta", async () => {
    // La cláusula de `tenant_id` **no está** en el `WHEN` de I-4, y esta
    // prueba es la que lo fija: `cotizacion_tenant_inmutable` de `0004` ya
    // la vuelve inmutable en todos los estados. Dos guardas para el mismo
    // hecho no son defensa en profundidad: son dos guardas que ninguna
    // prueba puede distinguir, porque neutralizar cualquiera deja a la otra
    // atrapando el caso.
    const congelada = await cotizacionCongelada();
    const vecino = await sembrarVecino();

    await expect(
      env.DB.prepare("UPDATE cotizacion SET tenant_id = ? WHERE id = ?")
        .bind(vecino.tenantId, congelada.id)
        .run(),
    ).rejects.toThrow(COLUMNA_INMUTABLE);
  });
});

describe("I-5 · el snapshot se escribe una vez y no se reescribe jamás", () => {
  it("reescribir el snapshot de una emitida muere en el disparador", async () => {
    const congelada = await cotizacionCongelada();

    await expect(
      env.DB.prepare("UPDATE cotizacion SET snapshot = ? WHERE id = ?")
        .bind('{"version":1,"lineas":[{"monto":1}]}', congelada.id)
        .run(),
    ).rejects.toThrow(SNAPSHOT_INMUTABLE);
  });

  it("descongelar —volver a borrador y vaciar el snapshot— muere también", async () => {
    // **Ésta es la prueba que hace load-bearing al `IS NOT`.** Con `<>`,
    // `NEW.snapshot <> OLD.snapshot` contra NULL vale NULL, el `WHEN` da
    // falso y el disparador no dispara; el `CHECK` de coherencia de `0004`
    // ve una fila consistente —borrador sin snapshot— y la deja pasar. La
    // cotización emitida vuelve a ser editable **habiendo perdido el
    // documento que se le mandó al cliente**, que es el peor agujero que
    // esta tarea podía dejar. Un solo carácter lo abre.
    const congelada = await cotizacionCongelada();

    await expect(
      env.DB.prepare(
        "UPDATE cotizacion SET estado = 'borrador', snapshot = NULL" +
          " WHERE id = ?",
      )
        .bind(congelada.id)
        .run(),
    ).rejects.toThrow(SNAPSHOT_INMUTABLE);

    // El contrapeso que hace a la prueba sobre la consecuencia y no sobre el
    // mensaje: la cotización quedó como estaba, no a medio descongelar.
    const guardada = await env.DB.prepare(
      "SELECT estado, snapshot FROM cotizacion WHERE id = ?",
    )
      .bind(congelada.id)
      .first<{ estado: string; snapshot: string | null }>();

    expect(guardada).toEqual({ estado: "emitida", snapshot: UN_SNAPSHOT });
  });

  it("escribirle un snapshot a un borrador que ya tenía uno muere", async () => {
    // El estado no entra en la guarda de I-5 y esto lo fija: lo que la hace
    // disparar es que **ya haya un snapshot**, venga de donde venga. Es la
    // mitad que impide que mañana alguien abra un camino de reescritura
    // pasando primero por otro estado.
    const fila: Fila = {
      ...filaValida("cotizacion", ctx),
      estado: "perdida",
      snapshot: UN_SNAPSHOT,
    };
    await insertar("cotizacion", fila);

    await expect(
      env.DB.prepare("UPDATE cotizacion SET snapshot = ? WHERE id = ?")
        .bind('{"version":1,"lineas":[]} ', fila.id)
        .run(),
    ).rejects.toThrow(SNAPSHOT_INMUTABLE);
  });

  // El contrapeso de I-5 —que la **primera** escritura del snapshot sí
  // pasa— ya está escrito más arriba, en «deja pasar la emisión que escribe
  // estado y snapshot juntos». No se repite acá: dos pruebas que afirman lo
  // mismo son una que nadie va a actualizar cuando cambie la regla.
});

describe("I-4 también cubre las tablas hijas", () => {
  // Una cotización emitida cuyos módulos o líneas se pueden cambiar no está
  // congelada: cambia el documento **sin tocar una sola columna de
  // `cotizacion`**, así que el disparador de I-4 ni se entera. Son seis
  // pruebas porque son seis disparadores, uno por par (tabla, operación), y
  // SQLite no permite escribirlo más corto.

  it("agregar un módulo a una emitida muere en el disparador", async () => {
    const congelada = await cotizacionCongelada();

    await expect(
      insertar("cotizacion_modulo", {
        ...filaValida("cotizacion_modulo", ctx),
        cotizacion_id: congelada.id,
        orden: 99,
      }),
    ).rejects.toThrow(CONGELADA);
  });

  it("editar un módulo de una emitida muere en el disparador", async () => {
    const congelada = await cotizacionCongelada();

    await expect(
      env.DB.prepare("UPDATE cotizacion_modulo SET contenido = ? WHERE id = ?")
        .bind("Otra cosa que el cliente nunca leyó.", congelada.moduloId)
        .run(),
    ).rejects.toThrow(CONGELADA);
  });

  it("quitar un módulo de una emitida muere en el disparador", async () => {
    const congelada = await cotizacionCongelada();

    await expect(
      env.DB.prepare("DELETE FROM cotizacion_modulo WHERE id = ?")
        .bind(congelada.moduloId)
        .run(),
    ).rejects.toThrow(CONGELADA);
  });

  it("agregar una línea a una emitida muere en el disparador", async () => {
    const congelada = await cotizacionCongelada();

    await expect(
      insertar("cotizacion_linea", {
        ...filaValida("cotizacion_linea", ctx),
        cotizacion_id: congelada.id,
        orden: 99,
      }),
    ).rejects.toThrow(CONGELADA);
  });

  it("editar una línea de una emitida muere en el disparador", async () => {
    const congelada = await cotizacionCongelada();

    await expect(
      env.DB.prepare("UPDATE cotizacion_linea SET monto = ? WHERE id = ?")
        .bind(1, congelada.lineaId)
        .run(),
    ).rejects.toThrow(CONGELADA);
  });

  it("quitar una línea de una emitida muere en el disparador", async () => {
    // **La más barata de todas las formas de cambiar una propuesta
    // emitida**: un `DELETE` que se lleve el honorario más caro deja una
    // cotización que el cliente aceptó cobrando menos. `0004` no tiene
    // ningún disparador de `DELETE` y acá la conclusión se invierte.
    const congelada = await cotizacionCongelada();

    await expect(
      env.DB.prepare("DELETE FROM cotizacion_linea WHERE id = ?")
        .bind(congelada.lineaId)
        .run(),
    ).rejects.toThrow(CONGELADA);
  });

  it.each(["ganada", "perdida"] as const)(
    "las hijas de una %s están igual de congeladas",
    async (estado) => {
      const congelada = await cotizacionCongelada(estado);

      await expect(
        env.DB.prepare("DELETE FROM cotizacion_linea WHERE id = ?")
          .bind(congelada.lineaId)
          .run(),
      ).rejects.toThrow(CONGELADA);
    },
  );

  it("contrapeso: las tres operaciones siguen andando sobre un borrador", async () => {
    // Sin esto, seis disparadores sin condición harían pasar las ocho
    // pruebas de rechazo de arriba y dejarían el editor de T-2 y T-3 sin
    // poder escribir una sola línea.
    const borrador = await segundaCotizacionNuestra(ctx);
    const modulo: Fila = {
      ...filaValida("cotizacion_modulo", ctx),
      cotizacion_id: borrador,
    };
    const linea: Fila = {
      ...filaValida("cotizacion_linea", ctx),
      cotizacion_id: borrador,
    };

    await insertar("cotizacion_modulo", modulo);
    await insertar("cotizacion_linea", linea);

    await env.DB.prepare("UPDATE cotizacion_modulo SET contenido = ? WHERE id = ?")
      .bind("Editado sin problema.", modulo.id)
      .run();
    await env.DB.prepare("DELETE FROM cotizacion_linea WHERE id = ?")
      .bind(linea.id)
      .run();

    const quedan = await env.DB.prepare(
      "SELECT (SELECT COUNT(*) FROM cotizacion_modulo WHERE cotizacion_id = ?)" +
        " AS modulos, (SELECT COUNT(*) FROM cotizacion_linea" +
        " WHERE cotizacion_id = ?) AS lineas",
    )
      .bind(borrador, borrador)
      .first<{ modulos: number; lineas: number }>();

    expect(quedan).toEqual({ modulos: 1, lineas: 0 });
  });

  it("mudar una línea a una emitida sigue siendo «columna inmutable»", async () => {
    // El `WHEN` de `UPDATE` mira `OLD.cotizacion_id` y **no** `NEW`, y esta
    // prueba es la que lo fija: la mudanza ya la aborta
    // `cotizacion_linea_cotizacion_inmutable` de `0004`, en todos los
    // estados y con el mensaje más exacto de los dos. Mirar `NEW` acá sería
    // la segunda guarda para el mismo hecho, y entonces ninguna de las dos
    // sería verificable.
    const congelada = await cotizacionCongelada();
    const borrador = await segundaCotizacionNuestra(ctx);
    const linea: Fila = {
      ...filaValida("cotizacion_linea", ctx),
      cotizacion_id: borrador,
    };
    await insertar("cotizacion_linea", linea);

    await expect(
      env.DB.prepare("UPDATE cotizacion_linea SET cotizacion_id = ? WHERE id = ?")
        .bind(congelada.id, linea.id)
        .run(),
    ).rejects.toThrow(COLUMNA_INMUTABLE);
  });
});

/**
 * El estado de una cotización, leído de la base.
 *
 * Toda prueba de rechazo de este bloque lo usa como contrapeso: afirmar que
 * la escritura tiró es afirmar sobre el mensaje, y lo que importa es que la
 * fila **quedó donde estaba**.
 */
async function estadoDe(id: string): Promise<string | undefined> {
  const fila = await env.DB.prepare(
    "SELECT estado FROM cotizacion WHERE id = ?",
  )
    .bind(id)
    .first<{ estado: string }>();

  return fila?.estado;
}

describe("0007 · M-1 · el estado sigue el ciclo de vida", () => {
  // `docs/diseno.md` §8:
  //
  //     borrador  ──editable──>  emitida  ──>  ganada | perdida
  //
  // Antes de `0007` la base no decía nada del orden: se midió con una sonda
  // `sqlite3` y las dieciséis combinaciones origen→destino pasaban, salvo
  // las tres que vuelven a `borrador`. Las seis de abajo son exactamente las
  // que esta guarda cierra, y van una por una porque la cobertura de un
  // `WHEN` con tres pares legales no se mide por disparador sino por celda:
  // con una sola prueba se pueden borrar dos de los tres pares y todo sigue
  // verde.
  it.each([
    ["borrador", "ganada"],
    ["borrador", "perdida"],
    ["ganada", "emitida"],
    ["ganada", "perdida"],
    ["perdida", "emitida"],
    ["perdida", "ganada"],
  ])("de %s a %s muere en el disparador", async (origen, destino) => {
    const fila: Fila = {
      ...filaValida("cotizacion", ctx),
      estado: origen,
      // La coherencia de `0004` obliga: un borrador sin snapshot, y
      // cualquier otro estado con uno.
      snapshot: origen === "borrador" ? null : UN_SNAPSHOT,
    };
    await insertar("cotizacion", fila);

    // Saliendo de un borrador hay que escribir el snapshot en la misma
    // sentencia, o el que rechaza es el `CHECK` de coherencia y esta prueba
    // pasaría sin tocar la guarda que dice probar.
    const sql =
      origen === "borrador"
        ? "UPDATE cotizacion SET estado = ?, snapshot = ? WHERE id = ?"
        : "UPDATE cotizacion SET estado = ? WHERE id = ?";
    const parametros =
      origen === "borrador"
        ? [destino, UN_SNAPSHOT, fila.id]
        : [destino, fila.id];

    await expect(
      env.DB.prepare(sql)
        .bind(...(parametros as (string | null)[]))
        .run(),
    ).rejects.toThrow(CICLO_DE_VIDA);

    expect(await estadoDe(String(fila.id))).toBe(origen);
  });

  it.each(["emitida", "ganada", "perdida"])(
    "volver a borrador desde %s lo siguen contestando las guardas de 0004 y 0006",
    async (origen) => {
      // **Ésta es la prueba del recorte `NEW.estado IS NOT 'borrador'`.**
      // Las dos guardas que cierran la descongelación son de otros archivos
      // y están argumentadas y probadas allá; si esta guarda también las
      // atrapara, serían tres para el mismo hecho y ninguna de las tres
      // podría distinguirse por mutación. Lo que se afirma acá es de quién
      // es el rechazo, no que haya rechazo.
      const fila: Fila = {
        ...filaValida("cotizacion", ctx),
        estado: origen,
        snapshot: UN_SNAPSHOT,
      };
      await insertar("cotizacion", fila);

      await expect(
        env.DB.prepare("UPDATE cotizacion SET estado = 'borrador' WHERE id = ?")
          .bind(fila.id)
          .run(),
      ).rejects.toThrow(/CHECK constraint failed: el_borrador_no_tiene_snapshot/);

      await expect(
        env.DB.prepare(
          "UPDATE cotizacion SET estado = 'borrador', snapshot = NULL" +
            " WHERE id = ?",
        )
          .bind(fila.id)
          .run(),
      ).rejects.toThrow(SNAPSHOT_INMUTABLE);

      expect(await estadoDe(String(fila.id))).toBe(origen);
    },
  );

  it("vaciar el estado nombra la columna y no el ciclo de vida", async () => {
    // Un `BEFORE UPDATE` corre **antes** que `NOT NULL`, así que sin la
    // cláusula `NEW.estado IS NOT NULL` este disparador abortaría hablando
    // del ciclo de vida cuando el defecto real es una columna sin valor.
    // Medido en las dos formas: con la cláusula llega el `NOT NULL`, sin
    // ella llega el mensaje del disparador. Es la prueba que mata esa
    // mutación.
    const fila = filaValida("cotizacion", ctx);
    await insertar("cotizacion", fila);

    await expect(
      env.DB.prepare("UPDATE cotizacion SET estado = NULL WHERE id = ?")
        .bind(fila.id)
        .run(),
    ).rejects.toThrow(/NOT NULL constraint failed: cotizacion\.estado/);
  });

  it.each([
    ["borrador", "emitida"],
    ["emitida", "ganada"],
    ["emitida", "perdida"],
  ])(
    "contrapeso: de %s a %s sí pasa, que son las tres flechas de §8",
    async (origen, destino) => {
      // Sin estos tres contrapesos, un disparador que abortara **toda**
      // transición haría pasar las seis pruebas de rechazo de arriba y
      // dejaría el sistema sin ciclo de vida.
      const fila: Fila = {
        ...filaValida("cotizacion", ctx),
        estado: origen,
        snapshot: origen === "borrador" ? null : UN_SNAPSHOT,
      };
      await insertar("cotizacion", fila);

      if (origen === "borrador") {
        await env.DB.prepare(
          "UPDATE cotizacion SET estado = ?, snapshot = ? WHERE id = ?",
        )
          .bind(destino, UN_SNAPSHOT, fila.id)
          .run();
      } else {
        await env.DB.prepare("UPDATE cotizacion SET estado = ? WHERE id = ?")
          .bind(destino, fila.id)
          .run();
      }

      expect(await estadoDe(String(fila.id))).toBe(destino);
    },
  );

  it("contrapeso: una escritura que no mueve el estado sigue pasando", async () => {
    // El `WHEN` abre con `NEW.estado IS NOT OLD.estado`, y sin esa cláusula
    // toda edición de un borrador —que lleva la fila entera, `estado`
    // incluido— caería en el disparador y la API de T-2 dejaría de guardar.
    const fila = filaValida("cotizacion", ctx);
    await insertar("cotizacion", fila);

    await env.DB.prepare(
      "UPDATE cotizacion SET vence_en = ? WHERE id = ?",
    )
      .bind("2030-12-31T23:59:59.999Z", fila.id)
      .run();

    const guardada = await env.DB.prepare(
      "SELECT estado, vence_en FROM cotizacion WHERE id = ?",
    )
      .bind(fila.id)
      .first<{ estado: string; vence_en: string | null }>();

    expect(guardada).toEqual({
      estado: "borrador",
      vence_en: "2030-12-31T23:59:59.999Z",
    });
  });
});

describe("0007 · M-2 · la procedencia se fija al nacer", () => {
  /** Una segunda y una tercera cotización de este bufete, las dos borrador. */
  async function otrasDos(): Promise<[string, string]> {
    return [
      await segundaCotizacionNuestra(ctx),
      await segundaCotizacionNuestra(ctx),
    ];
  }

  /** De quién nació, leído de la base. */
  async function procedenciaDe(id: string): Promise<string | null | undefined> {
    const fila = await env.DB.prepare(
      "SELECT duplicada_de_id FROM cotizacion WHERE id = ?",
    )
      .bind(id)
      .first<{ duplicada_de_id: string | null }>();

    return fila?.duplicada_de_id;
  }

  it("una cotización no puede declararse duplicada de sí misma", async () => {
    // El ciclo de uno. Medido antes de `0007`: entraba.
    const [a] = await otrasDos();

    await expect(
      env.DB.prepare("UPDATE cotizacion SET duplicada_de_id = ? WHERE id = ?")
        .bind(a, a)
        .run(),
    ).rejects.toThrow(COLUMNA_INMUTABLE);

    expect(await procedenciaDe(a)).toBeNull();
  });

  it("dos cotizaciones no pueden apuntarse entre sí", async () => {
    // El ciclo de dos, que es el que un `CHECK (duplicada_de_id IS NOT id)`
    // **no** habría cerrado. Medido antes de `0007`: entraba por dos
    // `UPDATE`, y un ciclo de tres por tres.
    const [a, b] = await otrasDos();

    await expect(
      env.DB.prepare("UPDATE cotizacion SET duplicada_de_id = ? WHERE id = ?")
        .bind(b, a)
        .run(),
    ).rejects.toThrow(COLUMNA_INMUTABLE);

    expect(await procedenciaDe(a)).toBeNull();
  });

  it("borrarle la procedencia a un borrador que la tenía muere también", async () => {
    // **Ésta es la prueba que hace load-bearing al `IS NOT`.**
    // `duplicada_de_id` es nullable, así que con `<>` la comparación contra
    // NULL vale NULL, el `WHEN` da falso y el `UPDATE` **pasa**: se borra de
    // dónde vino la cotización sin que nada avise.
    const [original] = await otrasDos();
    const copia: Fila = {
      ...filaValida("cotizacion", ctx),
      duplicada_de_id: original,
    };
    await insertar("cotizacion", copia);

    await expect(
      env.DB.prepare(
        "UPDATE cotizacion SET duplicada_de_id = NULL WHERE id = ?",
      )
        .bind(copia.id)
        .run(),
    ).rejects.toThrow(COLUMNA_INMUTABLE);

    expect(await procedenciaDe(String(copia.id))).toBe(original);
  });

  it("y cambiarle la procedencia por otra, igual", async () => {
    const [original, otra] = await otrasDos();
    const copia: Fila = {
      ...filaValida("cotizacion", ctx),
      duplicada_de_id: original,
    };
    await insertar("cotizacion", copia);

    await expect(
      env.DB.prepare("UPDATE cotizacion SET duplicada_de_id = ? WHERE id = ?")
        .bind(otra, copia.id)
        .run(),
    ).rejects.toThrow(COLUMNA_INMUTABLE);

    expect(await procedenciaDe(String(copia.id))).toBe(original);
  });

  it("el alta autorreferencial la sigue contestando la guarda de tenencia", async () => {
    // **Esto corrige lo que el plan daba por medido.**
    // `odd/tasks/cotizaciones.md` dice que `INSERT … id='a',
    // duplicada_de_id='a'` entra porque la llave foránea se valida después
    // de insertar la fila. La llave foránea, cierto; pero delante hay otra
    // guarda que sí lo frena, y es de `0004`: en un `BEFORE INSERT` la fila
    // todavía no existe, así que la subconsulta de tenencia devuelve NULL y
    // `NULL IS NOT NEW.tenant_id` aborta.
    //
    // De ahí sale el argumento que hace innecesario recorrer la cadena:
    // para que una fila entre apuntando a otra, la apuntada tiene que
    // existir ya. El padre es siempre más viejo que el hijo, y un orden
    // estricto no tiene ciclos **de ninguna longitud**. Con la columna
    // inmutable, el grafo sólo crece por las hojas y es un bosque.
    const id = nuevoId();
    const fila: Fila = {
      ...filaValida("cotizacion", ctx),
      id,
      duplicada_de_id: id,
    };

    await expect(insertar("cotizacion", fila)).rejects.toThrow(
      TENENCIA_CRUZADA,
    );
  });

  it("contrapeso: una copia nace atada al original y se sigue pudiendo emitir", async () => {
    // Sin esto, una guarda que rechazara toda escritura de la columna
    // —incluida la del alta— haría pasar las cuatro pruebas de rechazo de
    // arriba y la duplicación no existiría.
    const [original] = await otrasDos();
    const copia: Fila = {
      ...filaValida("cotizacion", ctx),
      duplicada_de_id: original,
    };
    await insertar("cotizacion", copia);

    expect(await procedenciaDe(String(copia.id))).toBe(original);

    await env.DB.prepare(
      "UPDATE cotizacion SET estado = 'emitida', snapshot = ? WHERE id = ?",
    )
      .bind(UN_SNAPSHOT, copia.id)
      .run();

    expect(await estadoDe(String(copia.id))).toBe("emitida");
  });

  it("sobre una congelada el rechazo es de I-4 y no de ésta", async () => {
    // El recorte `OLD.estado IS 'borrador'` parte el caso en dos mitades
    // exactas: sobre un borrador habla esta guarda, sobre cualquier otro
    // estado habla `cotizacion_emitida_no_se_edita` de `0006`, que ya
    // vigila `duplicada_de_id` entre sus nueve columnas. Sin el recorte las
    // dos atraparían lo mismo en tres de los cuatro estados y ninguna sería
    // verificable por mutación.
    const congelada = await cotizacionCongelada();
    const [otra] = await otrasDos();

    await expect(
      env.DB.prepare("UPDATE cotizacion SET duplicada_de_id = ? WHERE id = ?")
        .bind(otra, congelada.id)
        .run(),
    ).rejects.toThrow(CONGELADA);
  });
});

/* ==========================================================================
   `0008` · La arista entre las dos mitades, y I-3 (T-7)
   ========================================================================== */

/**
 * El `RAISE(ABORT, …)` de los tres disparadores de I-3, que `0008` escribió
 * y `0011` volvió a escribir contra la arista nueva. El mensaje se conserva
 * textual: el invariante no cambió, cambió el camino para comprobarlo.
 */
const I3 = /I-3/;

/** El nombre del `CHECK` de coherencia de `0011`, que es su mensaje. */
const ORIGEN_INCOHERENTE = /el_origen_y_la_cotizacion_dicen_lo_mismo/;

/**
 * Siembra una línea con tipo de proceso dentro de la cotización del
 * contexto.
 *
 * **Desde T-13 ya no hace falta para que la arista sea expresable** —el
 * proceso cuelga de la cotización, que el contexto siembra— y por eso la
 * usan muchas menos pruebas que antes. Queda para la única que sigue
 * necesitando una línea de verdad: la que mide que una línea cotizada
 * volvió a ser borrable.
 */
async function sembrarLinea(ctx: Contexto): Promise<string> {
  const id = nuevoId();
  await insertar("cotizacion_linea", {
    id,
    tenant_id: TENANT_UNICO_ID,
    cotizacion_id: ctx.cotizacionId,
    tipo_proceso_id: ctx.tipoProcesoId,
    clase: "honorario",
    concepto: "Visa de trabajo",
    monto: 150_000,
    orden: 0,
  });
  return id;
}

/** La fila mínima de `proceso`, con los valores que cada prueba retoca. */
function unProceso(ctx: Contexto, ajustes: Fila = {}): Fila {
  return {
    id: nuevoId(),
    tenant_id: TENANT_UNICO_ID,
    cliente_id: ctx.clienteId,
    tipo_proceso_id: ctx.tipoProcesoId,
    origen: "directo",
    titulo: "Un trámite",
    estado: "abierto",
    abierto_en: ahoraIso(),
    cotizacion_id: null,
    ...ajustes,
  };
}

describe("M-5 · `origen` y la cotización dicen lo mismo, o la fila miente", () => {
  it("un proceso directo sin cotización entra: es el contrapeso", async () => {
    // Sin esto, un `CHECK` invertido —que rechazara todo— pasaría las tres
    // pruebas de rechazo de abajo sin que nada avisara.
    const ctx = await sembrarContexto();

    await expect(insertar("proceso", unProceso(ctx))).resolves.toBeDefined();
  });

  it("y un proceso de cotización con su cotización también", async () => {
    const ctx = await sembrarContexto();

    await expect(
      insertar(
        "proceso",
        unProceso(ctx, {
          origen: "cotizacion",
          cotizacion_id: ctx.cotizacionId,
        }),
      ),
    ).resolves.toBeDefined();
  });

  it("rechaza `origen = 'cotizacion'` con la cotización en nulo", async () => {
    // Dice «vengo de una cotización» y no sabe de cuál.
    const ctx = await sembrarContexto();

    await expect(
      insertar("proceso", unProceso(ctx, { origen: "cotizacion" })),
    ).rejects.toThrow(ORIGEN_INCOHERENTE);
  });

  it("rechaza `origen = 'directo'` con una cotización colgada", async () => {
    // Dice «me abrieron a mano» y tiene el recibo de lo contrario.
    const ctx = await sembrarContexto();

    await expect(
      insertar(
        "proceso",
        unProceso(ctx, { origen: "directo", cotizacion_id: ctx.cotizacionId }),
      ),
    ).rejects.toThrow(ORIGEN_INCOHERENTE);
  });

  it("y también rechaza el `UPDATE` que rompe el par después", async () => {
    // El `CHECK` cubre las dos escrituras con una sola expresión, que es la
    // razón por la que esto no es un disparador: haría falta uno por
    // operación y los dos podrían separarse.
    const ctx = await sembrarContexto();
    const fila = unProceso(ctx, {
      origen: "cotizacion",
      cotizacion_id: ctx.cotizacionId,
    });
    await insertar("proceso", fila);

    await expect(
      env.DB.prepare("UPDATE proceso SET cotizacion_id = NULL WHERE id = ?")
        .bind(fila.id)
        .run(),
    ).rejects.toThrow(ORIGEN_INCOHERENTE);
  });

  it("y el `CHECK` viejo de la arista por la línea ya no existe", async () => {
    // **La mitad que demuestra que `0011` soltó la columna y no la dejó
    // conviviendo con la nueva.** Un `ADD COLUMN` no obliga a soltar nada:
    // una migración que agregara `cotizacion_id` y se olvidara el
    // `DROP COLUMN` pasaría las cinco pruebas de arriba enteras, y la tabla
    // quedaría con dos procedencias.
    //
    // Se mide sobre la DDL y no por rechazo, y es la excepción deliberada a
    // la regla del proyecto: lo que se afirma es que una restricción **no
    // está**, y una restricción que no está no rechaza nada que se pueda
    // observar. El hecho queda igual con dueño.
    const fila = await env.DB.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'proceso'",
    ).first<{ sql: string }>();

    expect(fila?.sql).toContain("el_origen_y_la_cotizacion_dicen_lo_mismo");
    expect(fila?.sql).not.toContain("el_origen_y_la_linea_dicen_lo_mismo");
  });
});

describe("M-8 · I-3 · el proceso nacido de una cotización comparte cliente", () => {
  it("rechaza el proceso de otro cliente colgado de la cotización", async () => {
    // **El invariante de la tajada 1 que no era expresable hasta ahora.**
    // Un proceso del cliente equivocado colgado de una cotización no se
    // nota hasta que alguien factura.
    const ctx = await sembrarContexto();

    const otroCliente = nuevoId();
    await insertar("cliente", {
      id: otroCliente,
      tenant_id: TENANT_UNICO_ID,
      nombre: "Otro cliente del mismo bufete",
      creado_por: ctx.usuarioId,
      creado_en: ahoraIso(),
    });

    await expect(
      insertar(
        "proceso",
        unProceso(ctx, {
          cliente_id: otroCliente,
          origen: "cotizacion",
          cotizacion_id: ctx.cotizacionId,
        }),
      ),
    ).rejects.toThrow(I3);
  });

  it("rechaza mudar de cliente un proceso ya nacido de una cotización", async () => {
    // El disparador de `UPDATE` tiene su propio agujero: sin él, el proceso
    // nace bien y se muda después con una sentencia.
    const ctx = await sembrarContexto();
    const fila = unProceso(ctx, {
      origen: "cotizacion",
      cotizacion_id: ctx.cotizacionId,
    });
    await insertar("proceso", fila);

    const otroCliente = nuevoId();
    await insertar("cliente", {
      id: otroCliente,
      tenant_id: TENANT_UNICO_ID,
      nombre: "El cliente al que no se puede mudar",
      creado_por: ctx.usuarioId,
      creado_en: ahoraIso(),
    });

    await expect(
      env.DB.prepare("UPDATE proceso SET cliente_id = ? WHERE id = ?")
        .bind(otroCliente, fila.id)
        .run(),
    ).rejects.toThrow(I3);
  });

  it("rechaza el proceso colgado de una cotización que no existe", async () => {
    // La mitad que el `IS NOT` sostiene y `<>` no: con `<>`, la
    // subconsulta nula daría NULL, el `WHEN` daría falso y la fila entraría
    // colgada de una cotización fantasma, con el rechazo en manos de una
    // llave foránea que un `PRAGMA` apaga.
    //
    // Era uno de **dos** modos de falla hasta `0010` —la línea no existe, o
    // existe pero su cotización no—. Con un salto de menos queda uno solo,
    // y es éste. Que la guarda siga siendo la misma con la mitad de los
    // caminos es lo que hace que el `IS NOT` no se pueda relajar.
    const ctx = await sembrarContexto();

    await expect(
      insertar(
        "proceso",
        unProceso(ctx, {
          origen: "cotizacion",
          cotizacion_id: nuevoId(),
        }),
      ),
    ).rejects.toThrow(I3);
  });

  it("I-3 cierra sola la arista cruzada, sin un disparador de tenencia propio", async () => {
    // **La medición que decidió no escribir una segunda guarda.** Si el
    // proceso comparte cliente con la cotización, es *el mismo cliente*, y
    // los disparadores de tenencia de `0003` y `0004` atan los dos tenants
    // a ése. Un disparador de tenencia para la arista nueva sería la
    // segunda guarda del mismo hecho, y dos guardas que resuelven lo mismo
    // se anulan: quitar cualquiera no mataría ninguna prueba.
    //
    // Lo que esta prueba afirma es que la arista cruzada **ya está
    // cerrada**, y el mensaje dice por cuál de las dos: es el de I-3.
    //
    // **Y dentro de I-3, la cierra la comparación de clientes y no el
    // filtro de tenencia de la subconsulta.** Se midió: quitando
    // `AND q.tenant_id = NEW.tenant_id` esta prueba sigue verde, porque la
    // subconsulta sin filtro devuelve el cliente de acá y `el de acá IS NOT
    // el del vecino` aborta igual. El filtro queda escrito, pero `0011`
    // lo documenta como lo que es: defensa contra una base ya corrompida,
    // no una guarda que una mutación pueda matar.
    const ctx = await sembrarContexto();
    const vecino = await sembrarVecino();

    await expect(
      insertar("proceso", {
        id: nuevoId(),
        tenant_id: vecino.tenantId,
        cliente_id: vecino.clienteId,
        tipo_proceso_id: vecino.tipoProcesoId,
        origen: "cotizacion",
        titulo: "Un trámite del vecino",
        estado: "abierto",
        abierto_en: ahoraIso(),
        cotizacion_id: ctx.cotizacionId,
      }),
    ).rejects.toThrow(I3);
  });
});

describe("M-8 · I-3 también se rompe desde el otro lado de la arista", () => {
  it("no se le cambia el cliente a un BORRADOR que ya abrió procesos", async () => {
    // **La prueba tiene que usar un borrador, y eso no es un detalle.**
    // Sobre una emitida, una ganada o una perdida, este `UPDATE` lo mata
    // `cotizacion_emitida_no_se_edita` de `0006`, que ya vigila
    // `cliente_id` entre sus nueve columnas: la prueba pasaría con el
    // disparador de `0011` borrado y no estaría probando nada.
    //
    // El borrador es la única fila de la tabla de combinaciones donde esta
    // guarda es la única que corre. Medido quitándola: el `UPDATE` entra.
    const ctx = await sembrarContexto();
    await insertar(
      "proceso",
      unProceso(ctx, {
        origen: "cotizacion",
        cotizacion_id: ctx.cotizacionId,
      }),
    );

    const otroCliente = nuevoId();
    await insertar("cliente", {
      id: otroCliente,
      tenant_id: TENANT_UNICO_ID,
      nombre: "El cliente que se quería llevar la cotización",
      creado_por: ctx.usuarioId,
      creado_en: ahoraIso(),
    });

    await expect(
      env.DB.prepare("UPDATE cotizacion SET cliente_id = ? WHERE id = ?")
        .bind(otroCliente, ctx.cotizacionId)
        .run(),
    ).rejects.toThrow(I3);
  });

  it("y sí se le cambia mientras no haya ningún proceso colgado", async () => {
    // El contrapeso: la guarda recorta por «hay procesos que quedarían
    // desalineados» y no por «es un borrador». Sin esto, un disparador sin
    // condición pasaría las dos pruebas.
    const ctx = await sembrarContexto();

    const otroCliente = nuevoId();
    await insertar("cliente", {
      id: otroCliente,
      tenant_id: TENANT_UNICO_ID,
      nombre: "Un cliente al que sí se puede mudar",
      creado_por: ctx.usuarioId,
      creado_en: ahoraIso(),
    });

    await expect(
      env.DB.prepare("UPDATE cotizacion SET cliente_id = ? WHERE id = ?")
        .bind(otroCliente, ctx.cotizacionId)
        .run(),
    ).resolves.toBeDefined();
  });
});

describe("la llave foránea de `0011` vuelve indeleble a la cotización que abrió un trámite", () => {
  // **Esta prueba cambió de dueño, no de intención.** Hasta `0010` la
  // indeleble era la línea, porque de ella colgaba el proceso. T-13 sube la
  // arista un nivel y con ella la guarda, y subirla la mejora: lo que ahora
  // no se puede borrar mientras haya trabajo colgando es el documento que el
  // cliente firmó, que es lo que de verdad no debe desaparecer.
  it("no se borra una cotización con un proceso colgado", async () => {
    const ctx = await sembrarContexto();
    await insertar(
      "proceso",
      unProceso(ctx, {
        origen: "cotizacion",
        cotizacion_id: ctx.cotizacionId,
      }),
    );

    await expect(
      env.DB.prepare("DELETE FROM cotizacion WHERE id = ?")
        .bind(ctx.cotizacionId)
        .run(),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/);
  });

  it("y la línea que lo cotizó vuelve a borrarse, que es lo que `0008` había roto sin querer", async () => {
    // **El efecto lateral que T-13 deshizo, dicho en una prueba.** La llave
    // foránea de `0008` volvía indeleble a cualquier línea con trámite
    // abierto, y eso no era una regla que alguien hubiera querido: era una
    // consecuencia de que el proceso colgara de la línea. Borrar una línea
    // de un borrador —corregir un concepto, partir un honorario en dos— es
    // exactamente lo que un borrador tiene que admitir.
    //
    // Lo que sigue protegido es lo que `0006` protege de verdad: las líneas
    // de una cotización que salió del borrador, y eso lo prueban las siete
    // guardas de I-4 más arriba. Esta prueba vive en un borrador por el
    // mismo motivo que la de M-8: sobre cualquier otro estado la mataría
    // `cotizacion_linea_no_sale_de_una_congelada` y no mediría nada.
    const ctx = await sembrarContexto();
    const lineaId = await sembrarLinea(ctx);
    await insertar(
      "proceso",
      unProceso(ctx, {
        origen: "cotizacion",
        cotizacion_id: ctx.cotizacionId,
      }),
    );

    await expect(
      env.DB.prepare("DELETE FROM cotizacion_linea WHERE id = ?")
        .bind(lineaId)
        .run(),
    ).resolves.toBeDefined();
  });
});

describe("los disparadores de 0004, 0006, 0007 y 0011 están todos y no hay ninguno de más", () => {
  // La lista va exacta y no por `toContain` a propósito. Un disparador de
  // más sería código muerto —`cotizacion_modulo` no lleva el de `UPDATE` de
  // tenencia porque sus dos únicas columnas comparables son inmutables,
  // igual que `proceso_etapa` en `0003`— y ésta es la prueba que lo haría
  // notar.
  const esperados: Record<string, string[]> = {
    cotizacion: [
      "cotizacion_tenencia_coherente_al_insertar",
      "cotizacion_tenencia_coherente_al_actualizar",
      "cotizacion_tenant_inmutable",
      /* `0006`: I-4 y I-5. */
      "cotizacion_emitida_no_se_edita",
      "cotizacion_snapshot_se_escribe_una_sola_vez",
      /* `0007`: el ciclo de vida y la cadena de duplicación. */
      "cotizacion_el_estado_sigue_el_ciclo_de_vida",
      "cotizacion_duplicada_de_inmutable",
      /* `0011`: la otra mitad de I-3, la que se rompe desde este lado.
         Lo escribió `0008` por la línea y `0011` lo reescribió directo,
         con el mismo nombre: el invariante no cambió. */
      "cotizacion_no_se_lleva_el_cliente_de_sus_procesos",
    ],
    cotizacion_modulo: [
      "cotizacion_modulo_tenencia_coherente_al_insertar",
      "cotizacion_modulo_tenant_inmutable",
      "cotizacion_modulo_cotizacion_inmutable",
      /* `0006`: I-4 en la tabla hija, una por operación. */
      "cotizacion_modulo_no_entra_en_una_congelada",
      "cotizacion_modulo_no_cambia_en_una_congelada",
      "cotizacion_modulo_no_sale_de_una_congelada",
    ],
    cotizacion_linea: [
      "cotizacion_linea_tenencia_coherente_al_insertar",
      "cotizacion_linea_tenencia_coherente_al_actualizar",
      "cotizacion_linea_tenant_inmutable",
      "cotizacion_linea_cotizacion_inmutable",
      "cotizacion_linea_no_entra_en_una_congelada",
      "cotizacion_linea_no_cambia_en_una_congelada",
      "cotizacion_linea_no_sale_de_una_congelada",
    ],
    /**
     * `proceso` entra en esta lista desde T-7, aunque sus cinco primeros
     * disparadores los escribió `0003` y no ninguna migración de esta
     * tajada.
     *
     * El motivo es el que `0005` dejó documentado al pagar una
     * reconstrucción: un `DROP TABLE` se lleva en silencio todo lo que
     * cuelga de la tabla, incluidos los disparadores que escribió otro
     * archivo. Ni `0008` ni `0011` reconstruyen `proceso`, y ésta es la
     * prueba que lo afirma.
     *
     * **Con `0011` la prueba vale más que antes, y conviene decir por qué.**
     * `0008` sólo agregaba; `0011` **borra tres disparadores y los vuelve a
     * escribir**, porque los tres nombraban la columna vieja y mientras la
     * nombraran el `DROP COLUMN` se negaba. Un archivo que borra y recrea
     * tiene una forma de fallar que uno que sólo agrega no tiene: dejar
     * caído lo que borró. Los cinco de `0003` siguen acá sin que `0011`
     * tenga que saber cómo estaban escritos, que es justamente lo que la
     * reconstrucción habría cobrado.
     */
    proceso: [
      /* `0003`: tenencia, inmutabilidad del tenant y coherencia de cierre. */
      "proceso_tenencia_coherente_al_insertar",
      "proceso_tenencia_coherente_al_actualizar",
      "proceso_tenant_inmutable",
      "proceso_cierre_coherente_al_insertar",
      "proceso_cierre_coherente_al_actualizar",
      /* `0011`: I-3, una por operación, reescritos contra la cotización. */
      "proceso_comparte_cliente_con_su_cotizacion_al_insertar",
      "proceso_comparte_cliente_con_su_cotizacion_al_actualizar",
    ],
  };

  it.each([...TABLAS, "proceso"] as const)(
    "%s lleva exactamente sus disparadores",
    async (tabla) => {
      const { results } = await env.DB.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'trigger'" +
          " AND tbl_name = ? ORDER BY name",
      )
        .bind(tabla)
        .all<{ name: string }>();

      expect(results.map((fila) => fila.name)).toEqual(
        [...esperados[tabla]].sort(),
      );
    },
  );
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

describe("lo que 0006 declara está todo en la base", () => {
  // La misma mitad verificable que la de `0004`, para la migración que trae
  // I-4 e I-5: un `CREATE TRIGGER` que quedó adentro de un comentario, o un
  // punto y coma de menos, se ve acá y no en producción.
  //
  // Son trece declaraciones: la tabla intermedia de la reconstrucción de
  // `bitacora`, el índice y los tres disparadores que esa reconstrucción
  // recrea, y los ocho de la congelación. El `ALTER TABLE … RENAME` no
  // cuenta como declaración y por eso `bitacora_nueva` no existe al final;
  // se la excluye por nombre en vez de con una expresión regular más floja,
  // para que la exclusión sea una decisión visible.
  const MIGRACION = "0006_emitir_y_congelar.sql";

  /** La tabla de paso, que termina renombrada y por eso no se busca. */
  const RENOMBRADA = "bitacora_nueva";

  function objetosQueCrea(): { clase: string; nombre: string }[] {
    const migracion = env.TEST_MIGRATIONS.find(
      (candidata) => candidata.name === MIGRACION,
    );
    if (migracion === undefined) {
      throw new Error(`${MIGRACION} no está en TEST_MIGRATIONS`);
    }

    return migracion.queries.flatMap((consulta) => {
      // Los comentarios se descartan antes de buscar: el encabezado nombra
      // `CREATE TRIGGER` en prosa varias veces.
      const sql = consulta.replace(/^\s*--.*$/gm, "");
      const hallazgo =
        /CREATE\s+TABLE\s+(\w+)/i.exec(sql) ??
        /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(\w+)/i.exec(sql) ??
        /CREATE\s+TRIGGER\s+(\w+)/i.exec(sql);

      return hallazgo === null
        ? []
        : [
            {
              clase: hallazgo[0].split(/\s+/)[1].toUpperCase(),
              nombre: hallazgo[1],
            },
          ];
    });
  }

  it("declara los once disparadores y el índice que recrea", () => {
    // El contrapeso de siempre: si la expresión regular dejara de encontrar
    // nada, la prueba de abajo pasaría comparando dos listas vacías.
    const declarados = objetosQueCrea();

    expect(
      declarados.filter((objeto) => objeto.clase === "TRIGGER"),
    ).toHaveLength(11);
    expect(declarados.filter((objeto) => objeto.clase === "INDEX")).toHaveLength(
      1,
    );
  });

  it("y todos ellos existen en la base", async () => {
    const nombres = objetosQueCrea()
      .map((objeto) => objeto.nombre)
      .filter((nombre) => nombre !== RENOMBRADA);

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

describe("lo que 0007 declara está todo en la base", () => {
  // La misma mitad verificable que las de `0004` y `0006`, para la migración
  // que trae el ciclo de vida y la inmutabilidad de la procedencia. Son dos
  // declaraciones y ninguna tabla: un `CREATE TRIGGER` que quedara adentro
  // de un comentario —el encabezado de `0007` nombra varios en prosa— o un
  // punto y coma de menos se ven acá y no en producción.
  const MIGRACION = "0007_ciclo_de_vida.sql";

  function disparadoresQueCrea(): string[] {
    const migracion = env.TEST_MIGRATIONS.find(
      (candidata) => candidata.name === MIGRACION,
    );
    if (migracion === undefined) {
      throw new Error(`${MIGRACION} no está en TEST_MIGRATIONS`);
    }

    return migracion.queries.flatMap((consulta) => {
      const sql = consulta.replace(/^\s*--.*$/gm, "");
      const hallazgo = /CREATE\s+TRIGGER\s+(\w+)/i.exec(sql);
      return hallazgo === null ? [] : [hallazgo[1]];
    });
  }

  it("declara exactamente dos disparadores y ninguna tabla ni índice", () => {
    // El contrapeso de siempre: si la expresión regular dejara de encontrar
    // nada, la prueba de abajo pasaría comparando dos listas vacías. Y el
    // segundo `expect` fija la decisión de que esta migración **no**
    // reconstruye `bitacora`: los tres verbos del ciclo de vida ya llegaron
    // con `0006`, que se los llevó justamente para que no hubiera una
    // tercera copia de esa tabla.
    expect(disparadoresQueCrea()).toHaveLength(2);

    const migracion = env.TEST_MIGRATIONS.find(
      (candidata) => candidata.name === MIGRACION,
    );
    const sinComentarios = (migracion?.queries ?? [])
      .map((consulta) => consulta.replace(/^\s*--.*$/gm, ""))
      .join("\n");

    expect(sinComentarios).not.toMatch(/CREATE\s+TABLE/i);
    expect(sinComentarios).not.toMatch(/CREATE\s+(?:UNIQUE\s+)?INDEX/i);
  });

  it("y los dos existen en la base", async () => {
    const nombres = disparadoresQueCrea();

    const { results } = await env.DB.prepare(
      `SELECT name FROM sqlite_master WHERE type = 'trigger'` +
        ` AND name IN (${nombres.map(() => "?").join(", ")})`,
    )
      .bind(...nombres)
      .all<{ name: string }>();

    expect(results.map((fila) => fila.name).sort()).toEqual([...nombres].sort());
  });
});

describe("lo que 0011 declara está todo en la base", () => {
  // **Este bloque era el de `0008` y cambió de migración, no de pregunta.**
  // De lo que `0008` declaraba no sobrevive nada en el esquema: su índice
  // `proceso_cotizacion_linea` lo borra `0011`, y sus tres disparadores los
  // borra y los vuelve a escribir contra la arista nueva. Seguir afirmando
  // que «lo que `0008` declara está en la base» sería afirmar algo falso;
  // lo que corresponde es correr el bloque a la migración que ahora es
  // dueña de esos objetos, y agregarle la mitad que `0008` no necesitaba:
  // que lo viejo **no** esté.
  //
  // La mitad heredada es la misma que la de `0004`, `0006` y `0007`: un
  // `CREATE TRIGGER` que quedara adentro de un comentario —el encabezado de
  // `0011` habla de disparadores en prosa— o un punto y coma de menos se ven
  // acá y no en producción.
  const MIGRACION = "0011_el_proceso_cuelga_de_la_cotizacion.sql";

  /**
   * Las dos tablas de andamio, que el propio archivo borra: la de la
   * verificación previa y la que guarda el enlace resuelto mientras la
   * columna vieja desaparece y la nueva nace.
   *
   * Se excluyen por nombre y no con una expresión regular más floja, para
   * que la exclusión sea una decisión visible — es el mismo criterio con el
   * que el bloque de `0006` excluye `bitacora_nueva`.
   */
  const EFIMERAS = ["verificacion_previa_enlace", "enlace_de_procesos"];

  function sinComentarios(): string[] {
    const migracion = env.TEST_MIGRATIONS.find(
      (candidata) => candidata.name === MIGRACION,
    );
    if (migracion === undefined) {
      throw new Error(`${MIGRACION} no está en TEST_MIGRATIONS`);
    }

    return migracion.queries.map((consulta) =>
      consulta.replace(/^\s*--.*$/gm, ""),
    );
  }

  function objetosQueCrea(): { clase: string; nombre: string }[] {
    return sinComentarios().flatMap((sql) => {
      const hallazgo =
        /CREATE\s+TABLE\s+(\w+)/i.exec(sql) ??
        /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(\w+)/i.exec(sql) ??
        /CREATE\s+TRIGGER\s+(\w+)/i.exec(sql);

      return hallazgo === null
        ? []
        : [
            {
              clase: hallazgo[0].split(/\s+/)[1].toUpperCase(),
              nombre: hallazgo[1],
            },
          ];
    });
  }

  it("declara tres disparadores, un índice y las dos tablas de andamio", () => {
    // El contrapeso de siempre: si la expresión regular dejara de encontrar
    // nada, las pruebas de abajo pasarían comparando listas vacías.
    const declarados = objetosQueCrea();

    expect(declarados.filter((objeto) => objeto.clase === "TRIGGER")).toHaveLength(3);
    expect(declarados.filter((objeto) => objeto.clase === "INDEX")).toHaveLength(1);
    expect(
      declarados
        .filter((objeto) => objeto.clase === "TABLE")
        .map((objeto) => objeto.nombre)
        .sort(),
    ).toEqual([...EFIMERAS].sort());
  });

  it("y todos los permanentes existen en la base", async () => {
    const nombres = objetosQueCrea()
      .map((objeto) => objeto.nombre)
      .filter((nombre) => !EFIMERAS.includes(nombre));

    const { results } = await env.DB.prepare(
      `SELECT name FROM sqlite_master WHERE name IN (${nombres
        .map(() => "?")
        .join(", ")})`,
    )
      .bind(...nombres)
      .all<{ name: string }>();

    expect(results.map((fila) => fila.name).sort()).toEqual([...nombres].sort());
  });

  it("las dos tablas de andamio se borran a sí mismas y no quedan en el esquema", async () => {
    // La mitad que se puede afirmar sin desarmar la migración. Si un `DROP`
    // se perdiera, quedaría una tabla de andamio viva en producción, que es
    // la clase de resto que nadie se anima a borrar seis meses después.
    const declarado = sinComentarios().join("\n");

    for (const efimera of EFIMERAS) {
      expect(declarado).toMatch(new RegExp(`DROP\\s+TABLE\\s+${efimera}`, "i"));

      const fila = await env.DB.prepare(
        "SELECT name FROM sqlite_master WHERE name = ?",
      )
        .bind(efimera)
        .first<{ name: string }>();

      expect(fila).toBeNull();
    }
  });

  it("y la restricción de la verificación previa va nombrada, porque el nombre es el mensaje", async () => {
    // **Por qué `0011` lleva verificación previa, y acá no es ceremonia.**
    // La regla que T-1 dejó escrita —hace falta cuando la guarda cae sobre
    // filas que ya podían existir— se cumple, pero lo que la vuelve
    // imprescindible es propio de esta migración: el relleno de M-2 resuelve
    // la cotización con un `JOIN`, y un `JOIN` que no encuentra nada no
    // grita, devuelve nada.
    //
    // Un proceso colgado de una línea huérfana no traería fila, M-3 lo
    // bajaría a `directo` como a todos y M-6 no lo encontraría para
    // devolverlo: terminaría la migración **diciendo que lo abrieron a
    // mano**, sin error y sin forma de reconstruirlo, porque la columna que
    // sabía de dónde venía ya no existe. Medido sobre la base local con un
    // proceso apuntado a una línea inexistente: con M-0 la migración aborta
    // nombrando la restricción; sin M-0 entra con salida 0 y el proceso
    // queda `directo`.
    //
    // El nombre no es cosmética. `0008` midió que un `CHECK` que aborta lo
    // hace con «CHECK constraint failed» a secas, sin nombrar la
    // restricción; la tabla temporal existe para que el operador lea qué
    // pasó.
    //
    // **Esta guarda no se puede probar por rechazo acá, y hay que decirlo
    // en vez de fingir que sí.** La base de esta suite se migra vacía, así
    // que no existe la fila vieja que M-0 vigila, y la llave foránea de
    // `0008` impedía fabricarla sin apagar un `PRAGMA`. Lo que se afirma es
    // lo verificable desde adentro: que la verificación esté escrita y que
    // busque lo que tiene que buscar. La consulta se afirma además de la
    // restricción porque sin eso bastaría con vaciar el `INSERT` para que
    // la prueba siguiera verde con la guarda muerta.
    const declarado = sinComentarios().join("\n");

    expect(declarado).toMatch(
      /CONSTRAINT\s+hay_procesos_colgados_de_una_linea_que_no_lleva_a_ninguna_cotizacion/,
    );
    expect(declarado).toMatch(/EXISTS\s+\(SELECT 1 FROM proceso p/);
    expect(declarado).toMatch(
      /NOT EXISTS\s+\(SELECT 1 FROM cotizacion_linea l/,
    );
  });

  it("y suelta lo que `0008` había puesto: la columna, su índice y su `CHECK`", async () => {
    // **La mitad nueva, y la que de verdad distingue esta migración de una
    // que sólo agregara.** `ADD COLUMN` no obliga a soltar nada: sin el
    // `DROP COLUMN`, `proceso` quedaría con dos procedencias y la vieja sin
    // `CHECK` que la ate a `origen`, porque el viejo se va con la columna.
    //
    // Y el índice es el hecho que decidía si había que reconstruir la
    // tabla: mientras `proceso_cotizacion_linea` existiera, el `DROP COLUMN`
    // se negaba. Que no esté es la prueba de que la secuencia corrió entera
    // y en orden.
    const declarado = sinComentarios().join("\n");

    expect(declarado).toMatch(/DROP\s+INDEX\s+proceso_cotizacion_linea/i);
    expect(declarado).toMatch(
      /ALTER\s+TABLE\s+proceso\s+DROP\s+COLUMN\s+cotizacion_linea_id/i,
    );

    const { results } = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE name IN" +
        " ('proceso_cotizacion_linea', 'proceso_cotizacion')",
    ).all<{ name: string }>();

    // El contrapeso al lado de la ausencia: sin afirmar que el índice nuevo
    // sí está, una base sin ninguno de los dos pasaría la mitad de arriba.
    expect(results.map((fila) => fila.name)).toEqual(["proceso_cotizacion"]);
  });
});
