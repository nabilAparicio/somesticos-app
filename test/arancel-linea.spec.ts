/**
 * De dónde salió el precio de una línea (T-1 de
 * `odd/tasks/precios-en-la-cotizacion.md`).
 *
 * `cotizacion_linea.arancel_renglon_id` nace en
 * `migrations/0013_el_precio_sabe_de_donde_salio.sql` y **esta suite prueba la
 * base, con SQL directo**. No prueba ninguna ruta, y eso no es un hueco: T-1
 * no abre ningún camino de escritura para esa columna. Lo que la tarea pide es
 * que la columna exista, que quede congelada con el resto del documento y que
 * **no se pueda apuntar a un renglón sin ninguna cifra**; el prellenado en la
 * pantalla es T-2 y el camino de la IA es T-3.
 *
 * ## El invariante se relajó a propósito en `0015`, y acá se ve medido
 *
 * `0013` pedía el `monto` del bufete. T-2 bis lo corrigió:
 * `migrations/0015_un_precio_es_una_cifra.sql` pide **una cifra** —`COALESCE(
 * monto, monto_oficial)`—, porque un renglón que todavía dice lo que dice el
 * acuerdo es la norma y no una subcategoría. Lo que sigue rechazado son los 74
 * rubros y las reglas por cuantía sin ningún número, y las dos mitades tienen
 * prueba propia abajo.
 *
 * El motivo de probar contra SQL y no contra un `if` es el de `0012` y el de
 * `docs/diseno.md` §5: una regla que solo vive en el código es la que el
 * primer script de importación se salta, y esta columna va a recibir scripts
 * —la propuesta de la IA escribe líneas en lote—.
 *
 * ## Qué se afirma acá y qué vive en otro archivo
 *
 *  - **La guarda del origen del precio** y su contrapeso, que es lo nuevo.
 *  - **La convivencia con `tipo_proceso_id`**, que es la decisión de forma de
 *    la tajada: son dos trabajos distintos y ninguno reemplaza al otro.
 *  - **Quién habla cuando falla otra cosa**: un renglón del vecino y un
 *    renglón inexistente mueren en la tenencia de `0004`, no acá. Afirmarlo es
 *    lo que impide que la guarda nueva se vuelva el mensaje de todos los
 *    rechazos.
 *  - La lista exacta de disparadores de `cotizacion_linea` vive en
 *    `test/esquema-cotizaciones.spec.ts`, que es su dueña, y los dos nuevos se
 *    agregaron ahí.
 *  - Qué guarda el snapshot lo prueba `test/emitir-api.spec.ts`.
 *
 * ## No hay limpieza de la cotización emitida, y es la misma consecuencia
 *
 * Desde `0006` las hijas de una cotización emitida no se borran —I-4—, así que
 * la emitida de esta suite se siembra **una sola vez** en el `beforeAll` y sus
 * líneas se quedan donde están. Lo que se limpia entre pruebas son las líneas
 * del borrador, que es lo único que la base deja sacar.
 */
import { env } from "cloudflare:workers";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { TENANT_UNICO_ID, nuevoId } from "../worker/db/ids";
import { ahoraIso } from "../worker/db/momentos";

/** El tenant vecino. Existe solo para que la fuga sea expresable. */
const OTRO_TENANT_ID = "4b7c9d10-2e5f-4a81-9c33-7f0d5b6a1e24";

const ORIGEN_SIN_PRECIO = /origen del precio/;
const TENENCIA_CRUZADA = /tenencia cruzada/;
const COTIZACION_CONGELADA = /cotizacion congelada/;

let autorId: string;
let clienteId: string;
let tipoProcesoId: string;

/** El borrador que se escribe y se vacía en cada prueba. */
let borradorId: string;
/** La emitida, sembrada una vez: sus líneas ya no se pueden tocar. */
let emitidaId: string;
/** La línea que quedó dentro de la emitida. */
let lineaCongeladaId: string;

/** Un renglón `monto` con precio del bufete: el caso que la tajada habilita. */
let renglonTarifadoId: string;
/**
 * Un renglón `monto` que el bufete **todavía no editó**, y que por eso sigue
 * diciendo lo que dice el acuerdo.
 *
 * Desde `0015` es un origen **legítimo**, y es la corrección entera de T-2 bis:
 * los 282 renglones con cifra son el catálogo ofrecible, no los 7 que el bufete
 * editó. La palabra del usuario: «los preestablecidos son la norma hasta que se
 * editen, no son una subcategoría».
 */
let renglonSoloOficialId: string;
/** Una regla por cuantía **con** precio propio: `0012` lo permite a propósito. */
let reglaTarifadaId: string;
/**
 * Una de las 97 reglas por cuantía **sin ninguna cifra**: el acuerdo la imprimió
 * como un porcentaje por tramos y el bufete no le escribió un monto.
 *
 * Es el caso que `0015` **sigue** rechazando, y es el que hay que probar aparte
 * desde que `renglonSoloOficialId` pasó a estar permitido: sin esta fila, la
 * guarda relajada no tendría ningún rechazo que medir por el lado del monto.
 */
let reglaSinCifraId: string;
/** Uno de los 74 encabezados. Por su `CHECK`, no puede llevar precio nunca. */
let rubroId: string;
/** Un renglón tarifado **del bufete vecino**. */
let renglonAjenoId: string;

/** Mete un renglón del acuerdo con SQL: ninguna migración siembra filas. */
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

/**
 * Una línea de cotización, con todo lo que no se está probando por omisión.
 *
 * `monto` viaja **siempre**, también cuando la línea nombra un renglón: la
 * columna es `NOT NULL` y la tajada decidió que el monto esté siempre en la
 * fila guardada. Quién lo pone —el sistema, desde el catálogo— es T-2 y T-3;
 * acá lo pone la prueba porque no hay otro escritor todavía.
 */
function sembrarLinea(fila: {
  id: string;
  cotizacionId?: string;
  tenantId?: string;
  clase?: "honorario" | "gasto_estimado";
  concepto?: string;
  monto?: number;
  tipoProcesoId?: string | null;
  arancelRenglonId?: string | null;
  orden?: number;
}): D1PreparedStatement {
  return env.DB.prepare(
    "INSERT INTO cotizacion_linea (id, tenant_id, cotizacion_id," +
      " tipo_proceso_id, arancel_renglon_id, clase, concepto, monto, orden)" +
      " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).bind(
    fila.id,
    fila.tenantId ?? TENANT_UNICO_ID,
    fila.cotizacionId ?? borradorId,
    fila.tipoProcesoId ?? null,
    fila.arancelRenglonId ?? null,
    fila.clase ?? "honorario",
    fila.concepto ?? "Honorario profesional",
    fila.monto ?? 180_000,
    fila.orden ?? 0,
  );
}

/** El origen guardado de una línea, leído de la base y no del eco de nada. */
async function origenDe(lineaId: string): Promise<string | null> {
  const fila = await env.DB.prepare(
    "SELECT arancel_renglon_id FROM cotizacion_linea WHERE id = ?",
  )
    .bind(lineaId)
    .first<{ arancel_renglon_id: string | null }>();

  expect(fila, `la línea ${lineaId} tiene que existir`).not.toBeNull();
  return fila?.arancel_renglon_id ?? null;
}

beforeAll(async () => {
  autorId = nuevoId();
  clienteId = nuevoId();
  tipoProcesoId = nuevoId();
  emitidaId = nuevoId();
  lineaCongeladaId = nuevoId();

  const tipoClienteId = nuevoId();
  const areaId = nuevoId();
  const autorAjenoId = nuevoId();
  const ahora = ahoraIso();

  renglonTarifadoId = nuevoId();
  renglonSoloOficialId = nuevoId();
  reglaTarifadaId = nuevoId();
  reglaSinCifraId = nuevoId();
  rubroId = nuevoId();
  renglonAjenoId = nuevoId();

  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO usuario (id, tenant_id, nombre, email, activo)" +
        " VALUES (?, ?, ?, ?, 1)",
    ).bind(autorId, TENANT_UNICO_ID, "Itzel", "itzel@bufete.test"),
    env.DB.prepare(
      "INSERT INTO tipo_cliente (id, tenant_id, nombre) VALUES (?, ?, ?)",
    ).bind(tipoClienteId, TENANT_UNICO_ID, "Persona jurídica"),
    env.DB.prepare(
      "INSERT INTO cliente (id, tenant_id, tipo_cliente_id, nombre," +
        " telefono, creado_por, creado_en) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).bind(
      clienteId,
      TENANT_UNICO_ID,
      tipoClienteId,
      "Constructora del Istmo, S.A.",
      "+507 6000-0000",
      autorId,
      ahora,
    ),
    env.DB.prepare(
      "INSERT INTO area (id, tenant_id, nombre) VALUES (?, ?, ?)",
    ).bind(areaId, TENANT_UNICO_ID, "Migración"),
    env.DB.prepare(
      "INSERT INTO tipo_proceso (id, tenant_id, area_id, nombre)" +
        " VALUES (?, ?, ?, ?)",
    ).bind(tipoProcesoId, TENANT_UNICO_ID, areaId, "Visa de trabajo"),

    /* El bufete vecino, con su propio renglón tarifado. */
    env.DB.prepare("INSERT INTO tenant (id, nombre) VALUES (?, ?)").bind(
      OTRO_TENANT_ID,
      "Otro bufete",
    ),
    env.DB.prepare(
      "INSERT INTO usuario (id, tenant_id, nombre, email) VALUES (?, ?, ?, ?)",
    ).bind(autorAjenoId, OTRO_TENANT_ID, "Ajena", "ajena@otro-bufete.test"),

    /* Los cuatro renglones de este bufete y el del vecino. Los `orden` son
       fijos porque el almacenamiento está aislado por archivo y este bloque
       corre una sola vez: `(tenant_id, orden)` es único, y el del vecino no
       choca con los de acá porque la unicidad es por bufete. */
    sembrarRenglon({
      id: renglonTarifadoId,
      orden: 1,
      categoria: "ASUNTOS ADMINISTRATIVOS (MIGRACIÓN)",
      numeral: "1",
      concepto: "Visitantes Temporales (por persona)",
      clase: "monto",
      montoOficial: 50_000,
      monto: 180_000,
    }),
    sembrarRenglon({
      id: renglonSoloOficialId,
      orden: 2,
      categoria: "ASUNTOS ADMINISTRATIVOS (MIGRACIÓN)",
      numeral: "2",
      concepto: "y por cada prórroga",
      clase: "monto",
      montoOficial: 25_000,
    }),
    /* La regla **sin `monto_oficial`**, y eso es lo que la vuelve útil acá: su
       única cifra es la que el bufete escribió, así que vaciársela la deja sin
       ninguna. Es la fila con la que se mide que la guarda de `0014` sigue
       acotada al cambio después de que `0015` la relajara. */
    sembrarRenglon({
      id: reglaTarifadaId,
      orden: 3,
      categoria: "ESTUDIOS DE TÍTULOS",
      numeral: "2.e",
      concepto: "Para operaciones cuyo valor sea mayor de B/.100,000.00",
      clase: "regla",
      reglaOficial:
        "un honorario convencional mayor de B/.1,000.00 sin que exceda del" +
        " 0.0085%",
      monto: 250_000,
    }),
    sembrarRenglon({
      id: reglaSinCifraId,
      orden: 5,
      categoria: "ASUNTOS DE DERECHO PROCESAL (CIVIL-COMERCIAL)",
      numeral: "1",
      concepto: "Procesos de mayor cuantía",
      clase: "regla",
      reglaOficial: "25% de lo que se obtenga, sobre la menor cuantía",
    }),
    sembrarRenglon({
      id: rubroId,
      orden: 4,
      categoria: "ASUNTOS ADMINISTRATIVOS (MIGRACIÓN)",
      numeral: "3",
      concepto: "Inmigrantes",
      clase: "rubro",
    }),
    sembrarRenglon({
      id: renglonAjenoId,
      tenantId: OTRO_TENANT_ID,
      orden: 1,
      categoria: "CATEGORÍA DEL VECINO",
      numeral: "1",
      concepto: "Algo del otro bufete",
      clase: "monto",
      montoOficial: 11_100,
      monto: 99_900,
    }),

    /* La emitida nace borrador, recibe su línea y después se congela: es la
       única secuencia que la base deja, y es la que el sistema usa. */
    env.DB.prepare(
      "INSERT INTO cotizacion (id, tenant_id, cliente_id, codigo, estado," +
        " fecha, moneda, creada_por, creada_en)" +
        " VALUES (?, ?, ?, ?, 'borrador', ?, 'USD', ?, ?)",
    ).bind(
      emitidaId,
      TENANT_UNICO_ID,
      clienteId,
      `COT-CONGELADA-${emitidaId}`,
      ahora,
      autorId,
      ahora,
    ),
  ]);

  await sembrarLinea({
    id: lineaCongeladaId,
    cotizacionId: emitidaId,
    concepto: "Honorario que ya salió",
  }).run();

  await env.DB.prepare(
    "UPDATE cotizacion SET estado = 'emitida', snapshot = ? WHERE id = ?",
  )
    .bind('{"version":1,"lineas":[]}', emitidaId)
    .run();
});

beforeEach(async () => {
  // **No hay limpieza, y es más barato que limpiar.** Cada prueba trabaja
  // sobre un borrador nuevo, así que las líneas de la anterior cuelgan de otra
  // cotización y no estorban: `cotizacion_linea_orden_unico` es por
  // cotización. Es la misma salida que `test/arancel-rutas.spec.ts` usa para
  // los renglones, que tampoco se pueden borrar.
  borradorId = nuevoId();
  const ahora = ahoraIso();

  await env.DB.prepare(
    "INSERT INTO cotizacion (id, tenant_id, cliente_id, codigo, estado," +
      " fecha, moneda, creada_por, creada_en)" +
      " VALUES (?, ?, ?, ?, 'borrador', ?, 'USD', ?, ?)",
  )
    .bind(
      borradorId,
      TENANT_UNICO_ID,
      clienteId,
      `COT-${borradorId}`,
      ahora,
      autorId,
      ahora,
    )
    .run();
});

// ---------------------------------------------------------------------------
// La columna existe, y dice de dónde salió el precio
// ---------------------------------------------------------------------------

describe("la línea sabe de dónde salió su precio", () => {
  it("una línea puede nombrar el renglón tarifado del que salió", async () => {
    const lineaId = nuevoId();

    await sembrarLinea({
      id: lineaId,
      arancelRenglonId: renglonTarifadoId,
      monto: 180_000,
    }).run();

    expect(await origenDe(lineaId)).toBe(renglonTarifadoId);
  });

  it("y el renglón puede ser una regla por cuantía con precio propio", async () => {
    // `0012` decidió a propósito que un `regla` **sí** lleve monto del bufete:
    // prohibirlo dejaría 97 servicios sin forma de tener precio propio. Esta
    // prueba es la que impide que la guarda de acá se escriba como
    // «`clase` tiene que ser `monto`», que sería más fácil y estaría mal.
    const lineaId = nuevoId();

    await sembrarLinea({
      id: lineaId,
      arancelRenglonId: reglaTarifadaId,
      concepto: "Estudio de título",
      monto: 250_000,
    }).run();

    expect(await origenDe(lineaId)).toBe(reglaTarifadaId);
  });

  it("una línea con monto libre no nombra ningún renglón, y eso no es una falla", async () => {
    // La columna es nullable y el caso corriente es éste: un gasto de
    // mensajería, una consulta, cualquier cobro que no corresponde a un
    // servicio tarifado. **Es también el guardián de la regresión**: si la
    // guarda nueva se escribiera sin la condición de nulo, toda línea pasaría
    // a necesitar un renglón.
    const lineaId = nuevoId();

    await sembrarLinea({
      id: lineaId,
      clase: "gasto_estimado",
      concepto: "Mensajería",
      monto: 1_500,
    }).run();

    expect(await origenDe(lineaId)).toBeNull();
  });

  it("el trámite y el origen del precio conviven: son dos trabajos distintos", async () => {
    // La decisión de forma de la tajada, afirmada contra la base.
    // `tipo_proceso_id` dice qué proceso se abre si la cotización se gana
    // (T-7); `arancel_renglon_id` dice de dónde salió el precio. Una línea
    // lleva los dos, y ninguno reemplaza al otro.
    const lineaId = nuevoId();

    await sembrarLinea({
      id: lineaId,
      tipoProcesoId,
      arancelRenglonId: renglonTarifadoId,
    }).run();

    const fila = await env.DB.prepare(
      "SELECT tipo_proceso_id, arancel_renglon_id FROM cotizacion_linea" +
        " WHERE id = ?",
    )
      .bind(lineaId)
      .first<{
        tipo_proceso_id: string | null;
        arancel_renglon_id: string | null;
      }>();

    expect(fila).toEqual({
      tipo_proceso_id: tipoProcesoId,
      arancel_renglon_id: renglonTarifadoId,
    });
  });

  it("la columna declara su llave foránea hacia arancel_renglon (id)", async () => {
    // Por qué no alcanza con los rechazos de más abajo: el disparador de
    // tenencia llega antes que la llave foránea, así que un identificador
    // inventado muere con el mensaje del disparador y ninguna prueba
    // distinguiría la ausencia de la llave. `PRAGMA foreign_key_list` lee la
    // declaración del esquema, que es lo único que no se puede falsear.
    const { results } = await env.DB.prepare(
      "PRAGMA foreign_key_list(cotizacion_linea)",
    ).all<{ table: string; from: string; to: string }>();

    expect(
      results.map(({ table, from, to }) => ({ table, from, to })),
    ).toContainEqual({
      table: "arancel_renglon",
      from: "arancel_renglon_id",
      to: "id",
    });
  });
});

// ---------------------------------------------------------------------------
// El origen de un precio tiene una cifra
// ---------------------------------------------------------------------------

describe("un precio sale de un renglón que tiene una cifra", () => {
  it("un rubro nunca es el origen de un precio", async () => {
    // Los 74 encabezados del acuerdo no llevan valor —`un_rubro_no_lleva_`
    // `precio` en `0012` lo prohíbe en su tabla y la siembra tampoco les pone
    // `monto_oficial`—, así que una línea que dijera que su precio salió de un
    // título estaría citando una fila sin ninguna cifra.
    await expect(
      sembrarLinea({ id: nuevoId(), arancelRenglonId: rubroId }).run(),
    ).rejects.toThrow(ORIGEN_SIN_PRECIO);
  });

  it("una regla por cuantía sin ninguna cifra tampoco", async () => {
    // Las 97 reglas que el acuerdo imprimió como un porcentaje por tramos y a
    // las que el bufete no les escribió un monto. **Es el rechazo que queda
    // después de `0015`**: no hay número que proponer, ni propio ni citado, así
    // que no hay de dónde salir un precio.
    await expect(
      sembrarLinea({ id: nuevoId(), arancelRenglonId: reglaSinCifraId }).run(),
    ).rejects.toThrow(ORIGEN_SIN_PRECIO);
  });

  /**
   * **La relajación deliberada de `0015`, y la corrección de T-2 bis.**
   *
   * `0013` exigía `monto` —el precio que el bufete editó—, y eso dejaba afuera
   * los 275 renglones que todavía dicen lo que dice el acuerdo. Las palabras del
   * usuario, que son el criterio: «los preestablecidos son eso, preestablecidos:
   * siempre pueden ser editables, pero son la norma hasta que se editen, no son
   * una subcategoría».
   *
   * Así que lo que la guarda exige es **una cifra** —`COALESCE(monto,
   * monto_oficial)`— y no la del bufete. Esta prueba es la que se pone roja si
   * alguien devuelve el invariante a su forma anterior.
   */
  it("un renglón que todavía dice lo que dice el acuerdo sí es un origen", async () => {
    const lineaId = nuevoId();

    await sembrarLinea({
      id: lineaId,
      arancelRenglonId: renglonSoloOficialId,
      concepto: "y por cada prórroga",
      monto: 25_000,
    }).run();

    expect(
      await origenDe(lineaId),
      "la base rechazó un renglón con la cifra del acuerdo. Un preestablecido" +
        " es la norma hasta que se edite: la guarda pide una cifra, no la del" +
        " bufete",
    ).toBe(renglonSoloOficialId);
  });

  it("y tampoco por un UPDATE que mueva el origen después", async () => {
    // La mitad que el `INSERT` no cubre: `arancel_renglon_id` es mutable
    // mientras la cotización sea borrador —cambiar de qué servicio salió un
    // precio es una edición legítima—, así que sin el disparador de `UPDATE`
    // la guarda se saltaría en dos escrituras.
    const lineaId = nuevoId();
    await sembrarLinea({
      id: lineaId,
      arancelRenglonId: renglonTarifadoId,
    }).run();

    await expect(
      env.DB.prepare(
        "UPDATE cotizacion_linea SET arancel_renglon_id = ? WHERE id = ?",
      )
        .bind(reglaSinCifraId, lineaId)
        .run(),
    ).rejects.toThrow(ORIGEN_SIN_PRECIO);

    // Y la línea quedó como estaba: el `BEFORE UPDATE` aborta antes de
    // escribir, no a medio camino.
    expect(await origenDe(lineaId)).toBe(renglonTarifadoId);
  });

  it("y el UPDATE hacia un renglón con sólo la cifra del acuerdo pasa", async () => {
    // El contrapeso de la relajación, por el lado del `UPDATE`: las dos mitades
    // del disparador se escribieron por separado, así que relajar una y olvidar
    // la otra es un camino real. Sin esta prueba, un `UPDATE` que mirara sólo
    // `monto` quedaría verde con el `INSERT` arreglado.
    const lineaId = nuevoId();
    await sembrarLinea({
      id: lineaId,
      arancelRenglonId: renglonTarifadoId,
    }).run();

    await env.DB.prepare(
      "UPDATE cotizacion_linea SET arancel_renglon_id = ? WHERE id = ?",
    )
      .bind(renglonSoloOficialId, lineaId)
      .run();

    expect(await origenDe(lineaId)).toBe(renglonSoloOficialId);
  });

  it("el contrapeso: el UPDATE a otro renglón tarifado pasa", async () => {
    // Sin esto, un disparador que abortara **toda** actualización de la
    // columna dejaría verdes las tres pruebas de arriba y rompería T-2 el día
    // que el editor permita cambiar de servicio.
    const lineaId = nuevoId();
    await sembrarLinea({
      id: lineaId,
      arancelRenglonId: renglonTarifadoId,
    }).run();

    await env.DB.prepare(
      "UPDATE cotizacion_linea SET arancel_renglon_id = ? WHERE id = ?",
    )
      .bind(reglaTarifadaId, lineaId)
      .run();

    expect(await origenDe(lineaId)).toBe(reglaTarifadaId);
  });

  it("dejar un servicio sin cifra no congela la línea que ya salió de él", async () => {
    // El defecto que `0014` corrige, encontrado probando la base a mano y no
    // por ninguna de las pruebas de arriba.
    //
    // La guarda de `0013` miraba el estado de la fila después de **cualquier**
    // escritura, no el cambio. Y como el bufete puede dejar de tarifar un
    // servicio cuando quiera, la secuencia era alcanzable: la línea apunta a
    // un renglón tarifado, alguien vacía ese precio en la pantalla de precios,
    // y desde entonces la línea no aceptaba ninguna escritura más —ni
    // corregirle una falta de ortografía al concepto, que no tiene nada que
    // ver con el precio—. Un borrador congelado por algo que pasó en otra
    // pantalla, y sin forma de salir: la pantalla que causa el bloqueo no es
    // la que falla.
    //
    // El invariante real es sobre el **acto de tomar el precio**, no sobre la
    // fila para siempre. Que el bufete deje de tarifar ese servicio mañana no
    // vuelve falso que ayer el precio salió de ahí; es el mismo razonamiento
    // por el que `snapshot.ts` congela el monto en vez de volver a buscarlo.
    //
    // ## Por qué la fila de esta prueba es la regla y no el renglón tarifado
    //
    // Desde `0015` la guarda pregunta por `COALESCE(monto, monto_oficial)`, así
    // que vaciarle el `monto` a un renglón que conserva la cita de 2001 **ya no
    // lo deja sin cifra** y la guarda no llegaría a dispararse: la prueba
    // quedaría verde sin medir nada. `reglaTarifadaId` no tiene `monto_oficial`
    // —es una de las 97 que el acuerdo imprimió como porcentaje—, así que su
    // única cifra es la que el bufete escribió y vaciarla la deja en cero
    // cifras. Es la forma de seguir midiendo lo mismo que `0014` midió.
    const lineaId = nuevoId();
    await sembrarLinea({
      id: lineaId,
      arancelRenglonId: reglaTarifadaId,
      concepto: "Estudio de título",
      monto: 250_000,
    }).run();

    // El bufete borra el precio que le había escrito a esa regla. Es legítimo y
    // no se impide, y la fila queda sin ninguna cifra.
    await env.DB.prepare(
      "UPDATE arancel_renglon SET monto = NULL WHERE id = ?",
    )
      .bind(reglaTarifadaId)
      .run();

    // Y la línea sigue siendo una línea: se le puede escribir cualquier otra
    // columna. Sin el `IS NOT OLD...` de `0014`, esto muere.
    await env.DB.prepare(
      "UPDATE cotizacion_linea SET concepto = ? WHERE id = ?",
    )
      .bind("corregida una falta de ortografía", lineaId)
      .run();

    // La procedencia no se perdió: sigue diciendo de dónde salió el precio.
    expect(await origenDe(lineaId)).toBe(reglaTarifadaId);

    // Y el contrapeso, para que esta prueba no afloje la guarda entera:
    // **mover** el origen hacia ese renglón ahora sin cifra se sigue
    // rechazando, que es el invariante que `0013` quería, que `0014` acotó al
    // cambio y que `0015` relajó sin tirar.
    // `orden: 1` y no el 0 por defecto: es la segunda línea de este mismo
    // borrador y `cotizacion_linea_orden_unico` es por cotización.
    const otraLinea = nuevoId();
    await sembrarLinea({ id: otraLinea, orden: 1 }).run();
    await expect(
      env.DB.prepare(
        "UPDATE cotizacion_linea SET arancel_renglon_id = ? WHERE id = ?",
      )
        .bind(reglaTarifadaId, otraLinea)
        .run(),
    ).rejects.toThrow(ORIGEN_SIN_PRECIO);

    // El `beforeEach` sólo abre un borrador nuevo: no vuelve a sembrar los
    // renglones, y `reglaTarifadaId` lo comparten las pruebas de arriba. Sin
    // devolverle el precio acá, esta prueba las rompe y el error aparece lejos
    // de su causa.
    await env.DB.prepare("UPDATE arancel_renglon SET monto = ? WHERE id = ?")
      .bind(250_000, reglaTarifadaId)
      .run();
  });

  it("el otro contrapeso: quitarle el origen a una línea pasa", async () => {
    // Volver a un monto libre es legítimo —el usuario borra el servicio y
    // escribe su cifra—, y con `<>` en vez de `IS NOT`, o con la condición de
    // nulo mal puesta, este camino moriría.
    const lineaId = nuevoId();
    await sembrarLinea({
      id: lineaId,
      arancelRenglonId: renglonTarifadoId,
    }).run();

    await env.DB.prepare(
      "UPDATE cotizacion_linea SET arancel_renglon_id = NULL WHERE id = ?",
    )
      .bind(lineaId)
      .run();

    expect(await origenDe(lineaId)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Quién habla cuando lo que falla es otra cosa
// ---------------------------------------------------------------------------

describe("la guarda nueva no habla por las que ya estaban", () => {
  it("el renglón del vecino muere en la tenencia, no en el origen del precio", async () => {
    // El renglón ajeno **sí tiene precio**, así que si este rechazo dijera
    // «origen del precio» la guarda nueva estaría contestando una pregunta
    // que no es la suya. `0004` ya tiene la respuesta correcta, y `0013` le
    // agregó esta arista.
    await expect(
      sembrarLinea({ id: nuevoId(), arancelRenglonId: renglonAjenoId }).run(),
    ).rejects.toThrow(TENENCIA_CRUZADA);
  });

  it("y tampoco se llega ahí por un UPDATE", async () => {
    const lineaId = nuevoId();
    await sembrarLinea({
      id: lineaId,
      arancelRenglonId: renglonTarifadoId,
    }).run();

    await expect(
      env.DB.prepare(
        "UPDATE cotizacion_linea SET arancel_renglon_id = ? WHERE id = ?",
      )
        .bind(renglonAjenoId, lineaId)
        .run(),
    ).rejects.toThrow(TENENCIA_CRUZADA);
  });

  it("un renglón que no existe también muere en la tenencia", async () => {
    // Es la consecuencia del `IS NOT` de `0004`: sin fila padre la subconsulta
    // vale NULL, y NULL contra un `tenant_id` real es verdadero. Queda
    // afirmado para que se vea que la guarda del origen **no** se queda con
    // este caso: escrita con `NOT EXISTS` en vez de `EXISTS`, un identificador
    // inventado habría salido como «origen del precio» y el defecto real
    // —una llave que no apunta a nada— se habría escondido detrás.
    await expect(
      sembrarLinea({ id: nuevoId(), arancelRenglonId: nuevoId() }).run(),
    ).rejects.toThrow(TENENCIA_CRUZADA);
  });
});

// ---------------------------------------------------------------------------
// El origen se congela con el resto del documento
// ---------------------------------------------------------------------------

describe("el origen del precio queda congelado con la cotización", () => {
  it("no se le pone el origen a una línea de una cotización emitida", async () => {
    // I-4, de `0006`: una emitida no se edita. La columna nueva no abre una
    // puerta lateral, y eso hay que afirmarlo —no se deduce de que la columna
    // sea nueva, porque `cotizacion_linea_no_cambia_en_una_congelada` es un
    // disparador de `UPDATE` que alguien podría condicionar a una lista de
    // columnas el día que le estorbe.
    await expect(
      env.DB.prepare(
        "UPDATE cotizacion_linea SET arancel_renglon_id = ? WHERE id = ?",
      )
        .bind(renglonTarifadoId, lineaCongeladaId)
        .run(),
    ).rejects.toThrow(COTIZACION_CONGELADA);

    expect(await origenDe(lineaCongeladaId)).toBeNull();
  });

  it("ni entra una línea nueva con origen en una cotización emitida", async () => {
    await expect(
      sembrarLinea({
        id: nuevoId(),
        cotizacionId: emitidaId,
        arancelRenglonId: renglonTarifadoId,
        orden: 1,
      }).run(),
    ).rejects.toThrow(COTIZACION_CONGELADA);
  });
});
