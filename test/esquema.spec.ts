import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { TENANT_UNICO_ID, nuevoId } from "../worker/db/ids";
import { ahoraIso } from "../worker/db/momentos";

/**
 * Pruebas del esquema inicial (`migrations/0001_esquema_inicial.sql`).
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

function insertar(tabla: string, fila: Fila): Promise<unknown> {
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
    ).bind(ctx.tipoClienteId, TENANT_UNICO_ID, "Particular"),
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
    ).bind(ctx.areaId, TENANT_UNICO_ID, "Migración"),
    env.DB.prepare(
      "INSERT INTO tipo_proceso (id, tenant_id, area_id, nombre)" +
        " VALUES (?, ?, ?, ?)",
    ).bind(ctx.tipoProcesoId, TENANT_UNICO_ID, ctx.areaId, "Visa de trabajo"),
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
      return { ...base, nombre: "Empresa" };
    case "cliente":
      return {
        ...base,
        tipo_cliente_id: ctx.tipoClienteId,
        nombre: "Otro cliente",
        creado_por: ctx.usuarioId,
        creado_en: ahora,
      };
    case "area":
      return { ...base, nombre: "Civil" };
    case "tipo_proceso":
      return { ...base, area_id: ctx.areaId, nombre: "Compraventa" };
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
    await expect(insertar(tabla, filaValida(tabla, ctx))).resolves.toBeTruthy();
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

      await expect(insertar(tabla, fila)).rejects.toThrow(
        /FOREIGN KEY constraint failed/,
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
      /FOREIGN KEY constraint failed/,
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
        /FOREIGN KEY constraint failed/,
      );
    },
  );

  it("rechaza firmar con un nombre en texto en vez de un usuario_id", async () => {
    const fila = { ...filaValida("bitacora", ctx), usuario_id: "Itzel" };

    await expect(insertar("bitacora", fila)).rejects.toThrow(
      /FOREIGN KEY constraint failed/,
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

  it.each(noSonMomentos)(
    "rechaza %o como momento de creación de una nota",
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
