import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { TENANT_UNICO_ID, nuevoId } from "../worker/db/ids";

/**
 * Pruebas del esquema de la plantilla de módulo:
 * `migrations/0016_una_plantilla_de_modulo_dice_para_que_sirve.sql` (T-1 de
 * `odd/tasks/plantillas-de-modulo.md`).
 *
 * El criterio es el de `test/esquema.spec.ts` y `test/esquema-cotizaciones.spec.ts`,
 * y no se negocia: una invariante se prueba demostrando que la base **rechaza**
 * la escritura inválida. Una fila válida que entra no prueba nada, porque entra
 * igual con la restricción borrada.
 *
 * Y cada rechazo lleva su **contrapeso**, por el motivo que
 * `esquema-cotizaciones.spec.ts` dejó escrito: una guarda que rechazara *todo*
 * —un `CHECK` invertido, un disparador sin `WHEN`— pasaría todas las pruebas de
 * rechazo sin que nada se pusiera rojo. Acá hay cuatro disparadores y dos
 * `CHECK`, y lo que esta tabla necesita que **siga pasando** es exactamente lo
 * que la tajada construye: escribir el rótulo y la descripción del bufete,
 * volver al preset vaciándolos, dar de baja, y reordenar.
 *
 * Las guardas se cuentan, nunca se atrapan: acá no hay un solo `try/catch` que
 * disfrace el error de un disparador o de un `CHECK`.
 */

/** Los seis presets, en el orden en que la migración los siembra. */
const PRESETS = [
  { clave: "antecedentes", rotulo: "Antecedentes", orden: 1 },
  { clave: "alcance", rotulo: "Alcance", orden: 2 },
  { clave: "exclusiones", rotulo: "Exclusiones", orden: 3 },
  { clave: "supuestos", rotulo: "Supuestos", orden: 4 },
  { clave: "clausulas", rotulo: "Cláusulas", orden: 5 },
  { clave: "nota_cliente", rotulo: "Nota al cliente", orden: 6 },
] as const;

/** El `RAISE(ABORT, …)` de la guarda de tenencia, copiada de los catorce de `0003`. */
const COLUMNA_INMUTABLE = /columna inmutable/;

/** El de las tres guardas propias de la tabla. */
const PLANTILLA_CITADA = /plantilla de módulo/;

/**
 * El segundo tenant de las pruebas de fuga. Es el mismo literal que usan
 * `test/arancel-rutas.spec.ts` y los demás: una fila del vecino es el objeto de
 * la prueba, no un UUID cualquiera.
 */
const OTRO_TENANT_ID = "0a5a6e0a-9f1e-4a6e-9f03-3b6a2a0e1d77";

interface FilaDePlantilla {
  id: string;
  tenant_id: string;
  clave: string;
  rotulo_oficial: string | null;
  descripcion_oficial: string | null;
  rotulo: string | null;
  descripcion: string | null;
  orden: number;
  activo: number;
}

function leer(id: string): Promise<FilaDePlantilla | null> {
  return env.DB.prepare("SELECT * FROM modulo_plantilla WHERE id = ?")
    .bind(id)
    .first<FilaDePlantilla>();
}

async function leerPorClave(clave: string): Promise<FilaDePlantilla> {
  const fila = await env.DB.prepare(
    "SELECT * FROM modulo_plantilla WHERE tenant_id = ? AND clave = ?",
  )
    .bind(TENANT_UNICO_ID, clave)
    .first<FilaDePlantilla>();

  if (fila === null) throw new Error(`la plantilla «${clave}» no está sembrada`);
  return fila;
}

/**
 * Una plantilla nuestra, nueva, con preset propio.
 *
 * Las pruebas que mutan trabajan sobre una de éstas y no sobre un preset
 * sembrado, por lo que `esquema-cotizaciones.spec.ts` dejó escrito: el
 * almacenamiento **no se rebobina** entre pruebas del mismo archivo, así que
 * una prueba que le escribe el rótulo a `alcance` cambiaría lo que la prueba de
 * la siembra mide. La clave lleva su identificador pegado porque
 * `(tenant_id, clave)` es único.
 */
function sembrar(campos: Partial<FilaDePlantilla> = {}): Promise<D1Result> {
  const fila: FilaDePlantilla = {
    id: nuevoId(),
    tenant_id: TENANT_UNICO_ID,
    clave: `propia_${nuevoId()}`,
    rotulo_oficial: "Rótulo del preset",
    descripcion_oficial: "La descripción que la IA lee cuando el bufete no escribió la suya.",
    rotulo: null,
    descripcion: null,
    orden: 7,
    activo: 1,
    ...campos,
  };

  const columnas = Object.keys(fila) as (keyof FilaDePlantilla)[];

  return env.DB.prepare(
    `INSERT INTO modulo_plantilla (${columnas.join(", ")})` +
      ` VALUES (${columnas.map(() => "?").join(", ")})`,
  )
    .bind(...columnas.map((columna) => fila[columna]))
    .run();
}

// ---------------------------------------------------------------------------
// La siembra: los seis presets están, y son los seis que el CHECK de `0004`
// ya permite
// ---------------------------------------------------------------------------

describe("los seis presets se siembran en la migración", () => {
  it("están los seis, con su clave, su rótulo oficial y su orden", async () => {
    const { results } = await env.DB.prepare(
      "SELECT * FROM modulo_plantilla WHERE tenant_id = ? ORDER BY orden",
    )
      .bind(TENANT_UNICO_ID)
      .all<FilaDePlantilla>();

    // `toEqual` sobre la lista entera y no seis `toContain`: una fila de más
    // —un preset duplicado por una siembra corrida dos veces— tiene que
    // notarse acá y no en el desplegable de una cotización.
    expect(
      results.map((fila) => ({
        clave: fila.clave,
        rotulo: fila.rotulo_oficial,
        orden: fila.orden,
      })),
    ).toEqual(PRESETS.map((preset) => ({ ...preset })));
  });

  it("los seis traen descripción oficial, que es la razón de ser de la tajada", async () => {
    for (const preset of PRESETS) {
      const fila = await leerPorClave(preset.clave);

      expect(fila.descripcion_oficial, preset.clave).not.toBeNull();
      // No se afirma el texto entero —vive en el documento de la tajada y en la
      // migración—, pero sí que sea una descripción y no un relleno: lo que la
      // IA va a leer tiene que decir algo. El más corto de los seis pasa de 120
      // caracteres.
      expect(
        (fila.descripcion_oficial ?? "").length,
        preset.clave,
      ).toBeGreaterThan(100);
    }
  });

  it("nacen con el rótulo y la descripción del bufete en NULL: NULL es «uso el preset»", async () => {
    for (const preset of PRESETS) {
      const fila = await leerPorClave(preset.clave);

      expect(fila.rotulo, preset.clave).toBeNull();
      expect(fila.descripcion, preset.clave).toBeNull();
      expect(fila.activo, preset.clave).toBe(1);
    }
  });

  it("las seis claves son exactamente las seis que el CHECK de `0004` permite", async () => {
    // En los dos sentidos, que es la forma que `test/modulos-api.spec.ts` ya
    // usa contra este mismo `CHECK`. Importa en las dos direcciones: una clave
    // sembrada que el `CHECK` no admita sería una plantilla que el editor
    // ofrece y la base rechaza al guardar; y una del `CHECK` sin plantilla
    // sembrada es un módulo que la IA sigue sin saber para qué sirve, que es el
    // defecto que esta tajada vino a cerrar.
    const definicion = await env.DB.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'cotizacion_modulo'",
    ).first<{ sql: string }>();

    const clausula = /tipo\s+TEXT\s+NOT\s+NULL[\s\S]*?IN\s*\(([^)]*)\)/i.exec(
      definicion?.sql ?? "",
    );
    expect(clausula, "el CHECK de `tipo` tiene que estar").not.toBeNull();

    const enElCheck = [...(clausula?.[1] ?? "").matchAll(/'([^']*)'/g)].map(
      (coincidencia) => coincidencia[1],
    );

    expect([...enElCheck].sort()).toEqual(
      PRESETS.map((preset) => preset.clave as string).sort(),
    );
  });
});

// ---------------------------------------------------------------------------
// La tabla lleva sus cuatro disparadores, y nada más
// ---------------------------------------------------------------------------

describe("la forma de la tabla", () => {
  it("lleva exactamente sus cuatro disparadores", async () => {
    // Lista exacta y no `toContain`, por el argumento de
    // `test/bitacora-api.spec.ts`: un disparador de más sobre esta tabla sería
    // la segunda guarda del mismo hecho, y neutralizar cualquiera de las dos
    // dejaría a la otra atrapando el caso sin que nada se pusiera rojo.
    const { results } = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'trigger'" +
        " AND tbl_name = 'modulo_plantilla' ORDER BY name",
    ).all<{ name: string }>();

    expect(results.map((fila) => fila.name)).toEqual([
      "modulo_plantilla_clave_inmutable",
      "modulo_plantilla_no_se_borra",
      "modulo_plantilla_preset_no_se_edita",
      "modulo_plantilla_tenant_inmutable",
    ]);
  });

  it("no lleva índice único sobre `orden`, y ésa es la decisión", async () => {
    // El mismo argumento que `0001` le aplicó a `etapa_plantilla`: reordenar
    // incrementando viola un único fila por fila y SQLite no difiere
    // restricciones. Si alguien agregara el único creyendo prolijarlo, el
    // reordenamiento de T-2 moriría en producción; esto es lo que lo nota.
    const { results } = await env.DB.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'index'" +
        " AND tbl_name = 'modulo_plantilla'",
    ).all<{ sql: string | null }>();

    for (const fila of results) {
      const sql = fila.sql ?? "";
      if (/UNIQUE/i.test(sql)) {
        expect(sql, "ningún único puede ser sobre `orden`").not.toMatch(
          /\(\s*orden\s*\)|,\s*orden\s*\)/i,
        );
      }
    }
  });

  it("`(tenant_id, clave)` es único: dos plantillas no comparten clave", async () => {
    const clave = `propia_${nuevoId()}`;
    await sembrar({ clave });

    await expect(sembrar({ clave })).rejects.toThrow(/UNIQUE/i);
  });

  it("…y el contrapeso: la misma clave en otro bufete sí entra", async () => {
    // Si el único fuera sobre `clave` sola, la prueba de arriba pasaría igual y
    // el día que exista un segundo bufete no podría tener sus propios
    // «Antecedentes». Es el mismo criterio de tenencia de I-8.
    await env.DB.prepare(
      "INSERT OR IGNORE INTO tenant (id, nombre) VALUES (?, ?)",
    )
      .bind(OTRO_TENANT_ID, "Bufete vecino")
      .run();

    const clave = `propia_${nuevoId()}`;
    await sembrar({ clave });

    const ajenaId = nuevoId();
    await sembrar({ id: ajenaId, clave, tenant_id: OTRO_TENANT_ID });

    expect((await leer(ajenaId))?.clave).toBe(clave);
  });
});

// ---------------------------------------------------------------------------
// Los dos CHECK de vigencia
// ---------------------------------------------------------------------------

describe("toda plantilla tiene rótulo vigente y descripción vigente", () => {
  it("rechaza una plantilla sin ningún rótulo", async () => {
    await expect(
      sembrar({ rotulo_oficial: null, rotulo: null }),
    ).rejects.toThrow(/la_plantilla_tiene_rotulo_vigente|CHECK/i);
  });

  it("rechaza una plantilla sin ninguna descripción", async () => {
    // Acá está la tajada entera: una plantilla sin descripción es una plantilla
    // que la IA va a usar mal, que es el defecto que vinimos a arreglar.
    await expect(
      sembrar({ descripcion_oficial: null, descripcion: null }),
    ).rejects.toThrow(/la_plantilla_tiene_descripcion_vigente|CHECK/i);
  });

  it("acepta una plantilla sin preset si el bufete puso los dos campos", async () => {
    // El contrapeso de los dos `CHECK`, y lo que hace que sean `COALESCE` y no
    // `NOT NULL` sobre las columnas oficiales: lo que la base exige es que haya
    // **un** rótulo y **una** descripción vigentes, no de qué columna salen. Es
    // la misma forma que `0015` le dio al precio.
    const id = nuevoId();
    await sembrar({
      id,
      rotulo_oficial: null,
      descripcion_oficial: null,
      rotulo: "Resumen ejecutivo",
      descripcion: "Un párrafo de apertura que diga de qué se trata la propuesta.",
    });

    const fila = await leer(id);
    expect(fila?.rotulo).toBe("Resumen ejecutivo");
    expect(fila?.rotulo_oficial).toBeNull();
  });

  it("…y el revés: vaciar el campo del bufete sigue dejando rótulo vigente", async () => {
    const id = nuevoId();
    await sembrar({ id, rotulo: "Lo del bufete", descripcion: "La del bufete." });

    await env.DB.prepare(
      "UPDATE modulo_plantilla SET rotulo = NULL, descripcion = NULL WHERE id = ?",
    )
      .bind(id)
      .run();

    const fila = await leer(id);
    expect(fila?.rotulo).toBeNull();
    expect(fila?.rotulo_oficial).toBe("Rótulo del preset");
  });

  it("rechaza vaciar el campo del bufete cuando no hay preset debajo", async () => {
    // El caso que hace que el `CHECK` valga algo en un `UPDATE` y no sólo en el
    // `INSERT`: una plantilla creada por el bufete, sin preset, no puede
    // «volver al preset» porque no tiene ninguno. El de T-2 tendrá que
    // contestarlo con un 422 antes de llegar acá; esto es la red de abajo.
    const id = nuevoId();
    await sembrar({
      id,
      rotulo_oficial: null,
      descripcion_oficial: null,
      rotulo: "Sin preset",
      descripcion: "Una descripción escrita por el bufete, sin preset debajo.",
    });

    await expect(
      env.DB.prepare("UPDATE modulo_plantilla SET rotulo = NULL WHERE id = ?")
        .bind(id)
        .run(),
    ).rejects.toThrow(/la_plantilla_tiene_rotulo_vigente|CHECK/i);

    await expect(
      env.DB.prepare(
        "UPDATE modulo_plantilla SET descripcion = NULL WHERE id = ?",
      )
        .bind(id)
        .run(),
    ).rejects.toThrow(/la_plantilla_tiene_descripcion_vigente|CHECK/i);
  });

  it("`activo` sólo acepta 0 y 1", async () => {
    await expect(sembrar({ activo: 2 })).rejects.toThrow(/CHECK/i);
  });
});

// ---------------------------------------------------------------------------
// Las cuatro guardas, probadas con SQL
// ---------------------------------------------------------------------------

describe("la base sostiene el preset, no la buena intención", () => {
  let plantillaId: string;

  beforeEach(async () => {
    plantillaId = nuevoId();
    await sembrar({ id: plantillaId });
  });

  it.each([
    ["rotulo_oficial", "Otro rótulo"],
    ["descripcion_oficial", "Otra descripción, suficientemente larga para pasar."],
  ])("aborta un UPDATE de `%s`", async (columna, valor) => {
    // El preset es el piso al que se vuelve. Si se puede editar, «volver al
    // preset» no significa nada: el criterio de aceptación 2 de la tajada pide
    // que vaciar el campo devuelva **el original**.
    await expect(
      env.DB.prepare(
        `UPDATE modulo_plantilla SET ${columna} = ? WHERE id = ?`,
      )
        .bind(valor, plantillaId)
        .run(),
    ).rejects.toThrow(PLANTILLA_CITADA);
  });

  it.each([["rotulo_oficial"], ["descripcion_oficial"]])(
    "aborta un UPDATE que pone `%s` en NULL",
    async (columna) => {
      // El caso que `<>` dejaría pasar: las dos columnas son nullable, así que
      // con `<>` la comparación daría NULL, el `WHEN` daría falso y **la
      // escritura pasaría**, borrando el piso al que se vuelve sin un solo
      // error. Es el mismo agujero de un carácter que `0012` midió para
      // `monto_oficial`.
      const id = nuevoId();
      await sembrar({
        id,
        rotulo: "Lo del bufete",
        descripcion: "La descripción del bufete, que sostiene la vigencia.",
      });

      await expect(
        env.DB.prepare(
          `UPDATE modulo_plantilla SET ${columna} = NULL WHERE id = ?`,
        )
          .bind(id)
          .run(),
      ).rejects.toThrow(PLANTILLA_CITADA);
    },
  );

  it("aborta un UPDATE que le pone preset a una plantilla que no lo tenía", async () => {
    // El otro lado del mismo agujero: con `<>`, escribir un `rotulo_oficial`
    // donde había nulo también pasaría, y una plantilla del bufete se
    // convertiría en un preset de la nada.
    const id = nuevoId();
    await sembrar({
      id,
      rotulo_oficial: null,
      descripcion_oficial: null,
      rotulo: "Sin preset",
      descripcion: "Una descripción escrita por el bufete, sin preset debajo.",
    });

    await expect(
      env.DB.prepare(
        "UPDATE modulo_plantilla SET rotulo_oficial = ? WHERE id = ?",
      )
        .bind("Preset inventado", id)
        .run(),
    ).rejects.toThrow(PLANTILLA_CITADA);
  });

  it("aborta un UPDATE de `clave`", async () => {
    // La clave es lo que el snapshot congela y lo que la IA copia tal cual.
    // Cambiarla deja las cotizaciones emitidas apuntando a un nombre que ya no
    // existe y al modelo copiando una clave que el editor no ofrece.
    await expect(
      env.DB.prepare("UPDATE modulo_plantilla SET clave = ? WHERE id = ?")
        .bind("otra_clave", plantillaId)
        .run(),
    ).rejects.toThrow(PLANTILLA_CITADA);
  });

  it("aborta el DELETE de una plantilla", async () => {
    // Una plantilla borrada deja huérfanos los módulos de las cotizaciones
    // vivas. La salida es `activo = 0`, y el mensaje la dice.
    await expect(
      env.DB.prepare("DELETE FROM modulo_plantilla WHERE id = ?")
        .bind(plantillaId)
        .run(),
    ).rejects.toThrow(PLANTILLA_CITADA);
  });

  it("no reasigna una plantilla a otro bufete", async () => {
    await env.DB.prepare(
      "INSERT OR IGNORE INTO tenant (id, nombre) VALUES (?, ?)",
    )
      .bind(OTRO_TENANT_ID, "Bufete vecino")
      .run();

    await expect(
      env.DB.prepare("UPDATE modulo_plantilla SET tenant_id = ? WHERE id = ?")
        .bind(OTRO_TENANT_ID, plantillaId)
        .run(),
    ).rejects.toThrow(COLUMNA_INMUTABLE);
  });

  // -------------------------------------------------------------------------
  // Los contrapesos: lo que la tajada construye tiene que seguir pasando
  // -------------------------------------------------------------------------

  it("deja pasar el UPDATE del rótulo y la descripción del bufete", async () => {
    // Sin este contrapeso, las siete pruebas de rechazo de arriba pasarían con
    // un disparador sin `WHEN` —que abortaría toda actualización— y la tajada
    // entera no funcionaría: editar el rótulo y la descripción **es** la
    // tajada.
    await env.DB.prepare(
      "UPDATE modulo_plantilla SET rotulo = ?, descripcion = ? WHERE id = ?",
    )
      .bind("Alcance del encargo", "Lo que el bufete asume, dicho a su manera.", plantillaId)
      .run();

    const fila = await leer(plantillaId);
    expect(fila?.rotulo).toBe("Alcance del encargo");
    expect(fila?.descripcion).toBe("Lo que el bufete asume, dicho a su manera.");
    expect(fila?.rotulo_oficial).toBe("Rótulo del preset");
  });

  it("deja pasar el UPDATE de `activo`: una plantilla se retira, no se borra", async () => {
    await env.DB.prepare("UPDATE modulo_plantilla SET activo = 0 WHERE id = ?")
      .bind(plantillaId)
      .run();

    expect((await leer(plantillaId))?.activo).toBe(0);

    await env.DB.prepare("UPDATE modulo_plantilla SET activo = 1 WHERE id = ?")
      .bind(plantillaId)
      .run();

    expect((await leer(plantillaId))?.activo).toBe(1);
  });

  it("deja pasar el UPDATE de `orden`, incluso incrementando todo el tramo", async () => {
    // El contrapeso del índice único ausente: esto es la escritura que el único
    // haría imposible, y es la que T-2 necesita para reordenar.
    const antes = await env.DB.prepare(
      "SELECT clave, orden FROM modulo_plantilla WHERE tenant_id = ? ORDER BY orden",
    )
      .bind(TENANT_UNICO_ID)
      .all<{ clave: string; orden: number }>();

    await env.DB.prepare(
      "UPDATE modulo_plantilla SET orden = orden + 1 WHERE tenant_id = ?",
    )
      .bind(TENANT_UNICO_ID)
      .run();

    const despues = await env.DB.prepare(
      "SELECT clave, orden FROM modulo_plantilla WHERE tenant_id = ? ORDER BY orden",
    )
      .bind(TENANT_UNICO_ID)
      .all<{ clave: string; orden: number }>();

    expect(despues.results.map((fila) => fila.clave)).toEqual(
      antes.results.map((fila) => fila.clave),
    );
    expect(despues.results.map((fila) => fila.orden)).toEqual(
      antes.results.map((fila) => fila.orden + 1),
    );

    // Se devuelve, porque el almacenamiento no se rebobina entre pruebas.
    await env.DB.prepare(
      "UPDATE modulo_plantilla SET orden = orden - 1 WHERE tenant_id = ?",
    )
      .bind(TENANT_UNICO_ID)
      .run();
  });

  it("deja pasar el UPDATE que reescribe el preset con el mismo valor", async () => {
    // `IS NOT` y no `<>` también significa esto: la guarda prohíbe un valor
    // **distinto**, no una escritura. Una siembra futura o una migración pueden
    // pasar la fila entera, igual que `0012` dejó escrito para el arancel.
    await env.DB.prepare(
      "UPDATE modulo_plantilla SET rotulo_oficial = ?, descripcion_oficial = ?," +
        " clave = clave WHERE id = ?",
    )
      .bind(
        "Rótulo del preset",
        "La descripción que la IA lee cuando el bufete no escribió la suya.",
        plantillaId,
      )
      .run();

    expect((await leer(plantillaId))?.rotulo_oficial).toBe("Rótulo del preset");
  });
});

// ---------------------------------------------------------------------------
// La bitácora, reconstruida por séptima vez
// ---------------------------------------------------------------------------

describe("la bitácora admite la entidad nueva", () => {
  it("acepta un hecho de `modulo_plantilla`", async () => {
    // El contrapeso del `CHECK` ampliado: que la entidad esté en la lista no
    // prueba que la fila entre. La prueba que compara el `CHECK` con
    // `ENTIDADES_REGISTRADAS` está en `test/bitacora-api.spec.ts` y mira la
    // definición; ésta mira una escritura.
    const usuarioId = nuevoId();
    await env.DB.prepare(
      "INSERT INTO usuario (id, tenant_id, nombre, email) VALUES (?, ?, ?, ?)",
    )
      .bind(usuarioId, TENANT_UNICO_ID, "Itzel", `${usuarioId}@bufete.pa`)
      .run();

    const plantilla = await leerPorClave("alcance");
    const entradaId = nuevoId();

    await env.DB.prepare(
      "INSERT INTO bitacora (id, tenant_id, entidad, entidad_id, accion," +
        " usuario_id, ocurrido_en, detalle) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(
        entradaId,
        TENANT_UNICO_ID,
        "modulo_plantilla",
        plantilla.id,
        "editado",
        usuarioId,
        new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1Z"),
        "Alcance",
      )
      .run();

    const fila = await env.DB.prepare(
      "SELECT entidad, accion FROM bitacora WHERE id = ?",
    )
      .bind(entradaId)
      .first<{ entidad: string; accion: string }>();

    expect(fila?.entidad).toBe("modulo_plantilla");
    expect(fila?.accion).toBe("editado");
  });

  it("sigue rechazando una entidad que no está en el vocabulario", async () => {
    // El contrapeso al revés: si la reconstrucción hubiera perdido el `CHECK`,
    // la prueba de arriba pasaría igual.
    const usuarioId = nuevoId();
    await env.DB.prepare(
      "INSERT INTO usuario (id, tenant_id, nombre, email) VALUES (?, ?, ?, ?)",
    )
      .bind(usuarioId, TENANT_UNICO_ID, "Itzel", `${usuarioId}@bufete.pa`)
      .run();

    await expect(
      env.DB.prepare(
        "INSERT INTO bitacora (id, tenant_id, entidad, entidad_id, accion," +
          " usuario_id, ocurrido_en) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
        .bind(
          nuevoId(),
          TENANT_UNICO_ID,
          "modulo_plantilla_inventada",
          nuevoId(),
          "editado",
          usuarioId,
          new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1Z"),
        )
        .run(),
    ).rejects.toThrow(/CHECK/i);
  });

  it("no agrega ningún verbo: `creado` ya estaba y los tres de la entidad también", async () => {
    const definicion = await env.DB.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'bitacora'",
    ).first<{ sql: string }>();

    for (const verbo of ["editado", "dado_de_baja", "reactivado"]) {
      expect(definicion?.sql ?? "", verbo).toContain(`'${verbo}'`);
    }
  });
});
