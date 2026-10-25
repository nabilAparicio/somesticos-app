/**
 * El plan de pagos (`odd/tasks/cotizaciones.md`, T-11). Segunda tabla de R5.
 *
 * Las seis cosas que esta suite existe para fijar:
 *
 *  1. **De qué cuelga una cuota: la decisión (c).** Exactamente uno de
 *     `proceso_id` o `cotizacion_id`, probado por rechazo en las dos
 *     direcciones —con los dos puestos y sin ninguno—, y medido además en el
 *     esquema: las dos columnas son nullables, porque un `NOT NULL` en
 *     cualquiera sería la opción (a) o la (b) implementada en silencio.
 *  2. **Monto o porcentaje, exactamente uno.** Es la exclusividad que
 *     `docs/diseno.md` §6 argumenta entera: una cuota con los dos es un total
 *     ambiguo que nadie detecta hasta que las cifras no cierran.
 *  3. **Vencimiento o hito, exactamente uno**, y el hito en blanco no cuenta
 *     como hito — sin esa restricción, un `''` derrota la exclusividad.
 *  4. **El porcentaje sólo cuelga de una cotización.** Es la respuesta a
 *     «¿porcentaje de qué?», que no es la misma en los dos casos: una
 *     cotización tiene total y un proceso no tiene ninguno.
 *  5. **El total del plan no se puede guardar.** No hay columna de total en
 *     `cuota` ni en ninguna otra tabla de esta base, y hay dos pruebas
 *     distintas que lo exigen. I-7 con la tercera piel.
 *  6. **La aritmética es entera**, los porcentajes son puntos básicos, y el
 *     residuo del truncamiento es visible en vez de repartido.
 *
 * Y la disciplina de siempre: **los invariantes se prueban por rechazo**, y
 * **las guardas se cuentan, nunca se atrapan**. No hay un solo `try/catch`
 * alrededor de un error de la base en el código bajo prueba, y por eso cada
 * restricción de la migración tiene acá su rechazo con el nombre de su
 * `CONSTRAINT`.
 *
 * **Nada de esto llama a la red.**
 */
import { env } from "cloudflare:workers";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Cuota, PlanDePagos } from "../worker/contract";
import { TENANT_UNICO_ID, nuevoId } from "../worker/db/ids";
import { finDelDiaEnPanama } from "../worker/db/momentos";
import {
  importeDe,
  planDe,
  PUNTOS_BASICOS_DEL_CIEN_POR_CIENTO,
} from "../worker/cuotas/dominio";
import { manejar } from "../worker/index";

const DOMINIO_DE_ACCESS = "https://bufete-de-prueba.cloudflareaccess.com";
const AUD = "aud-de-la-aplicacion-del-bufete";

const EMAIL_AUTOR = "itzel@cuotas.test";

/**
 * El caso que separa la aritmética entera de la ingenua, y además el que deja
 * ver el residuo.
 *
 * Tres cuotas de 3333 puntos básicos —33,33 % cada una— sobre un total de
 * 100 000 centavos. Cada una da 33 330 centavos y las tres suman 99 990:
 * **faltan diez centavos**, y ese residuo es exactamente por lo que el total
 * del plan se deriva en vez de guardarse. Un total almacenado habría dicho
 * 100 000 y nadie se habría enterado hasta que las cifras no cerraran
 * delante del cliente.
 *
 * Los valores esperados se escriben como literales y **no se calculan con la
 * función que se prueba**, que es la restricción 6 de la tajada.
 */
const TERCIO_EN_PUNTOS_BASICOS = 3_333;
const BASE_DE_CIEN_MIL = 100_000;
const TERCIO_APLICADO = 33_330;
const TRES_TERCIOS_APLICADOS = 99_990;

interface FallaEnElCable {
  campo: string;
  motivo: string;
}

/** El tenant vecino. Existe sólo para que la fuga sea expresable. */
let OTRO_TENANT_ID: string;

let autorId: string;
let usuarioAjenoId: string;
let clienteId: string;
let clienteAjenoId: string;
let areaId: string;
let areaAjenaId: string;
let tipoProcesoId: string;
let tipoAjenoId: string;
let procesoId: string;
let procesoAjenoId: string;
let cotizacionId: string;
let cotizacionAjenaId: string;

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

async function fallasDe(respuesta: Response): Promise<FallaEnElCable[]> {
  const cuerpo = (await respuesta.json()) as {
    error?: string;
    fallas?: FallaEnElCable[];
  };
  expect(cuerpo.error).toBe("datos_invalidos");
  return cuerpo.fallas ?? [];
}

async function motivosDe(respuesta: Response): Promise<string[]> {
  return (await fallasDe(respuesta)).map((falla) => falla.motivo);
}

/* ==========================================================================
   Las dos direcciones del plan
   ========================================================================== */

function rutaDeCotizacion(id = cotizacionId): string {
  return `/api/cotizaciones/${id}/cuotas`;
}

function rutaDeProceso(id = procesoId): string {
  return `/api/procesos/${id}/cuotas`;
}

async function planDeLaRuta(ruta: string): Promise<PlanDePagos> {
  const respuesta = await comoAutor(peticion(ruta));
  expect(respuesta.status).toBe(200);
  return (await respuesta.json()) as PlanDePagos;
}

/** Carga una cuota por la API y devuelve su identificador. */
async function cargar(ruta: string, cuerpo: unknown): Promise<string> {
  const antes = (await planDeLaRuta(ruta)).cuotas.map((cuota) => cuota.id);
  const respuesta = await comoAutor(conCuerpo(ruta, "POST", cuerpo));
  expect(respuesta.status).toBe(201);

  const plan = (await respuesta.json()) as PlanDePagos;
  const nueva = plan.cuotas.find((cuota) => !antes.includes(cuota.id));
  expect(nueva, "el alta tiene que devolver el plan con la cuota nueva")
    .toBeDefined();
  return (nueva as Cuota).id;
}

/* ==========================================================================
   Las inserciones crudas, para probar el esquema por rechazo
   ========================================================================== */

type Fila = Record<string, string | number | null>;

/**
 * La fila de referencia: una cuota de cotización, con monto y con hito.
 *
 * El contrapeso de todas las pruebas de rechazo. Si esta fila no entrara,
 * todas ellas pasarían por la razón equivocada.
 */
function filaValida(extra: Fila = {}): Fila {
  return {
    id: nuevoId(),
    tenant_id: TENANT_UNICO_ID,
    proceso_id: null,
    cotizacion_id: cotizacionId,
    concepto: "Anticipo a la firma del poder",
    monto: 150_000,
    porcentaje: null,
    vence_en: null,
    hito: "A la firma",
    creada_en: new Date().toISOString(),
    ...extra,
  };
}

function insertar(fila: Fila): Promise<D1Result> {
  const columnas = Object.keys(fila);
  return env.DB.prepare(
    `INSERT INTO cuota (${columnas.join(", ")})` +
      ` VALUES (${columnas.map(() => "?").join(", ")})`,
  )
    .bind(...columnas.map((columna) => fila[columna]))
    .run();
}

function sinColumna(fila: Fila, columna: string): Fila {
  const recortada = { ...fila };
  delete recortada[columna];
  return recortada;
}

/* ==========================================================================
   El decorado
   ========================================================================== */

beforeAll(async () => {
  autorId = nuevoId();

  await env.DB.prepare(
    "INSERT INTO usuario (id, tenant_id, nombre, email, activo)" +
      " VALUES (?, ?, ?, ?, 1)",
  )
    .bind(autorId, TENANT_UNICO_ID, "Itzel", EMAIL_AUTOR)
    .run();
});

/**
 * Cada prueba estrena identificadores, incluido el del tenant vecino.
 *
 * No se limpia con `DELETE FROM`, por lo mismo que las suites de notas y de
 * gastos: la bitácora no se puede borrar —`bitacora_no_se_borra`, sin
 * condición— y las cuotas de una prueba anterior son inalcanzables para la
 * siguiente porque cuelgan de otro dueño. Toda afirmación de conteo va
 * acotada a su plan.
 */
beforeEach(async () => {
  OTRO_TENANT_ID = nuevoId();
  usuarioAjenoId = nuevoId();
  clienteId = nuevoId();
  clienteAjenoId = nuevoId();
  areaId = nuevoId();
  areaAjenaId = nuevoId();
  tipoProcesoId = nuevoId();
  tipoAjenoId = nuevoId();
  procesoId = nuevoId();
  procesoAjenoId = nuevoId();
  cotizacionId = nuevoId();
  cotizacionAjenaId = nuevoId();

  const ahora = new Date().toISOString();

  await env.DB.batch([
    env.DB.prepare("INSERT INTO tenant (id, nombre) VALUES (?, ?)").bind(
      OTRO_TENANT_ID,
      "Otro bufete",
    ),
    env.DB.prepare(
      "INSERT INTO usuario (id, tenant_id, nombre, email, activo)" +
        " VALUES (?, ?, ?, ?, 1)",
    ).bind(
      usuarioAjenoId,
      OTRO_TENANT_ID,
      "Ajena",
      `ajena-${usuarioAjenoId}@otro.test`,
    ),

    env.DB.prepare(
      "INSERT INTO cliente (id, tenant_id, nombre, telefono, creado_por," +
        " creado_en) VALUES (?, ?, ?, ?, ?, ?)",
    ).bind(
      clienteId,
      TENANT_UNICO_ID,
      "Marta Quintero",
      "+507 6000-0000",
      autorId,
      ahora,
    ),
    env.DB.prepare(
      "INSERT INTO area (id, tenant_id, nombre, activo) VALUES (?, ?, ?, 1)",
    ).bind(areaId, TENANT_UNICO_ID, `Migración ${areaId}`),
    env.DB.prepare(
      "INSERT INTO tipo_proceso (id, tenant_id, area_id, nombre, activo)" +
        " VALUES (?, ?, ?, ?, 1)",
    ).bind(
      tipoProcesoId,
      TENANT_UNICO_ID,
      areaId,
      `Residencia permanente ${tipoProcesoId}`,
    ),
    env.DB.prepare(
      "INSERT INTO proceso (id, tenant_id, cliente_id, tipo_proceso_id," +
        " origen, titulo, estado, abierto_en)" +
        " VALUES (?, ?, ?, ?, 'directo', ?, 'abierto', ?)",
    ).bind(
      procesoId,
      TENANT_UNICO_ID,
      clienteId,
      tipoProcesoId,
      "Residencia permanente de Marta Quintero",
      ahora,
    ),
    env.DB.prepare(
      "INSERT INTO cotizacion (id, tenant_id, cliente_id, codigo, estado," +
        " fecha, moneda, creada_por, creada_en)" +
        " VALUES (?, ?, ?, ?, 'borrador', ?, 'USD', ?, ?)",
    ).bind(
      cotizacionId,
      TENANT_UNICO_ID,
      clienteId,
      `COT-2026-${cotizacionId}`,
      ahora,
      autorId,
      ahora,
    ),

    // Lo del vecino: el objeto de todas las pruebas de fuga.
    env.DB.prepare(
      "INSERT INTO cliente (id, tenant_id, nombre, telefono, creado_por," +
        " creado_en) VALUES (?, ?, ?, ?, ?, ?)",
    ).bind(
      clienteAjenoId,
      OTRO_TENANT_ID,
      "Cliente del vecino",
      "+507 6999-9999",
      usuarioAjenoId,
      ahora,
    ),
    env.DB.prepare(
      "INSERT INTO area (id, tenant_id, nombre, activo) VALUES (?, ?, ?, 1)",
    ).bind(areaAjenaId, OTRO_TENANT_ID, "Área del vecino"),
    env.DB.prepare(
      "INSERT INTO tipo_proceso (id, tenant_id, area_id, nombre, activo)" +
        " VALUES (?, ?, ?, ?, 1)",
    ).bind(tipoAjenoId, OTRO_TENANT_ID, areaAjenaId, "Tipo del vecino"),
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
      `COT-2026-${cotizacionAjenaId}`,
      ahora,
      usuarioAjenoId,
      ahora,
    ),
  ]);
});

/**
 * Le pone líneas a la cotización para que tenga un total contra el que medir.
 *
 * El `orden` arranca de donde quedó la última: `0004` le puso índice único a
 * `(cotizacion_id, orden)`, así que sembrar dos veces desde cero choca. Hace
 * falta porque hay una prueba que siembra, mide, vuelve a sembrar y mide otra
 * vez — justamente para comprobar que la base del porcentaje no está
 * congelada.
 */
async function sembrarLineas(
  montos: readonly number[],
  cotizacion = cotizacionId,
  tenant = TENANT_UNICO_ID,
): Promise<void> {
  const ultimo = await env.DB.prepare(
    "SELECT COUNT(*) AS cuantas FROM cotizacion_linea WHERE cotizacion_id = ?",
  )
    .bind(cotizacion)
    .first<{ cuantas: number }>();

  const desde = ultimo?.cuantas ?? 0;

  await env.DB.batch(
    montos.map((monto, indice) =>
      env.DB.prepare(
        "INSERT INTO cotizacion_linea (id, tenant_id, cotizacion_id, clase," +
          " concepto, monto, orden) VALUES (?, ?, ?, 'honorario', ?, ?, ?)",
      ).bind(
        nuevoId(),
        tenant,
        cotizacion,
        `Honorario ${desde + indice + 1}`,
        monto,
        desde + indice,
      ),
    ),
  );
}

/* ==========================================================================
   I-7 · El total del plan no se puede guardar
   ========================================================================== */

describe("I-7 · el total del plan nunca se almacena", () => {
  /**
   * **La prueba que hace imposible y no improbable.**
   *
   * No mira `cuota`: recorre **el esquema entero**, tabla por tabla y columna
   * por columna. Una columna con el total del plan en `cotizacion` o en
   * `proceso` rompería I-7 exactamente igual que una en `cuota`, y una prueba
   * acotada a la tabla nueva no la vería.
   *
   * Es la hermana de la que T-10 escribió para el saldo, con su propia
   * expresión: lo que esta tajada prohíbe no es una palabra sino el segundo
   * número. Las dos conviven porque **no miden lo mismo**: aquélla busca
   * nombres de saldo y ésta nombres de total, y una columna
   * `cotizacion.total_del_plan` pasaría por debajo de la primera.
   */
  it("ninguna columna de ninguna tabla guarda el total de un plan", async () => {
    const tablas = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table'" +
        " AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'" +
        " ORDER BY name",
    ).all<{ name: string }>();

    // La aserción de presencia al lado de la de ausencia: sin ella, un
    // `sqlite_master` vacío haría pasar la prueba sin mirar nada.
    expect(tablas.results.length).toBeGreaterThan(5);
    expect(tablas.results.map((fila) => fila.name)).toContain("cuota");

    const prohibido = /total|suma|subtotal|importe_del|plan_/i;
    const encontradas: string[] = [];

    for (const tabla of tablas.results) {
      const columnas = await env.DB.prepare(
        `SELECT name FROM pragma_table_info('${tabla.name}')`,
      ).all<{ name: string }>();

      for (const columna of columnas.results) {
        if (prohibido.test(columna.name)) {
          encontradas.push(`${tabla.name}.${columna.name}`);
        }
      }
    }

    expect(
      encontradas,
      "I-7: el total del plan se deriva, no se guarda. Si hace falta esta" +
        " columna, lo que hay que discutir es el invariante y no la prueba",
    ).toEqual([]);
  });

  it("cuota tiene exactamente estas columnas y ninguna más", async () => {
    // La lista va exacta y no por `toContain`: una columna de más es
    // justamente la forma en que un total guardado entraría sin llamarse
    // total, y esta prueba es la que la haría notar. Mata la mutación que
    // la otra no mata —una columna `acumulado` en esta tabla— y la otra mata
    // la que ésta no —una columna `total` en `cotizacion`—.
    const columnas = await env.DB.prepare(
      "SELECT name FROM pragma_table_info('cuota')",
    ).all<{ name: string }>();

    expect(columnas.results.map((fila) => fila.name)).toEqual([
      "id",
      "tenant_id",
      "proceso_id",
      "cotizacion_id",
      "concepto",
      "monto",
      "porcentaje",
      "vence_en",
      "hito",
      "creada_en",
    ]);
  });

  it("el total que viaja es el de las cuotas que viajan con él", async () => {
    // El contrapeso de las dos de arriba: que no haya dónde guardarlo no
    // prueba que lo que se manda sea correcto. Acá se mide que el número del
    // cable es la suma de la lista del cable, sin recalcularlo con `planDe`.
    await cargar(rutaDeCotizacion(), { concepto: "Primera", monto: 120_000, hito: "A la firma" });
    await cargar(rutaDeCotizacion(), { concepto: "Segunda", monto: 80_000, hito: "A la entrega" });

    const plan = await planDeLaRuta(rutaDeCotizacion());

    expect(plan.total).toBe(200_000);
    expect(plan.cuotas.map((cuota) => cuota.importe)).toEqual([120_000, 80_000]);
  });
});

/* ==========================================================================
   La decisión (c): exactamente uno de proceso o cotización
   ========================================================================== */

describe("la cuota cuelga de la cotización o del proceso, nunca de los dos", () => {
  it("entra la fila de referencia, colgada de una cotización", async () => {
    await expect(insertar(filaValida())).resolves.toBeDefined();
  });

  it("entra una cuota colgada de un proceso", async () => {
    await expect(
      insertar(filaValida({ cotizacion_id: null, proceso_id: procesoId })),
    ).resolves.toBeDefined();
  });

  it("rechaza la cuota que cuelga de los dos a la vez", async () => {
    await expect(
      insertar(filaValida({ proceso_id: procesoId })),
    ).rejects.toThrow(
      /la_cuota_cuelga_de_la_cotizacion_o_del_proceso_y_nunca_de_los_dos/,
    );
  });

  it("rechaza la cuota que no cuelga de nada", async () => {
    await expect(
      insertar(filaValida({ cotizacion_id: null, proceso_id: null })),
    ).rejects.toThrow(
      /la_cuota_cuelga_de_la_cotizacion_o_del_proceso_y_nunca_de_los_dos/,
    );
  });

  it("rechaza también cuando las dos columnas se omiten del INSERT", async () => {
    // Nacen nulas por omisión, así que éste es el camino por el que un
    // `INSERT` escrito a mano con columnas de menos llegaría a la fila sin
    // dueño. Es distinto del anterior: ahí los nulos son explícitos.
    const sinDuenio = sinColumna(
      sinColumna(filaValida(), "cotizacion_id"),
      "proceso_id",
    );

    await expect(insertar(sinDuenio)).rejects.toThrow(
      /la_cuota_cuelga_de_la_cotizacion_o_del_proceso_y_nunca_de_los_dos/,
    );
  });

  it("las dos columnas de padre son nullables, y eso es la decisión", async () => {
    // Un `NOT NULL` en cualquiera de las dos sería la opción (a) o la (b)
    // implementada sin decirlo, y compilaría, migraría y no se notaría. La
    // prueba hermana de `test/esquema.spec.ts`, desde el otro lado.
    const columnas = await env.DB.prepare(
      "SELECT name, \"notnull\" AS obligatoria FROM pragma_table_info('cuota')",
    ).all<{ name: string; obligatoria: number }>();

    const porNombre = new Map(
      columnas.results.map((fila) => [fila.name, fila.obligatoria]),
    );

    expect(porNombre.get("proceso_id")).toBe(0);
    expect(porNombre.get("cotizacion_id")).toBe(0);
    // La de presencia: `tenant_id` sí es obligatoria, así que si el `pragma`
    // devolviera basura esta línea lo diría.
    expect(porNombre.get("tenant_id")).toBe(1);
  });
});

/* ==========================================================================
   Tenencia e inmutabilidad
   ========================================================================== */

describe("tenencia e inmutabilidad de la cuota", () => {
  it("rechaza la cuota de una cotización de otro bufete", async () => {
    await expect(
      insertar(filaValida({ cotizacion_id: cotizacionAjenaId })),
    ).rejects.toThrow(/tenencia cruzada/);
  });

  it("rechaza la cuota de un proceso de otro bufete", async () => {
    await expect(
      insertar(
        filaValida({ cotizacion_id: null, proceso_id: procesoAjenoId }),
      ),
    ).rejects.toThrow(/tenencia cruzada/);
  });

  it("rechaza la cuota de una cotización que no existe", async () => {
    // El `IS NOT` del disparador es lo que hace que esto muera por tenencia:
    // la subconsulta no devuelve fila, vale NULL, y `NULL IS NOT <tenant>` es
    // verdadero. Con `<>` el disparador no dispararía y el rechazo quedaría
    // en manos de una llave foránea que un `PRAGMA` apaga.
    await expect(
      insertar(filaValida({ cotizacion_id: nuevoId() })),
    ).rejects.toThrow(/tenencia cruzada/);
  });

  it("la guarda de NULL del disparador es lo que deja pasar las filas buenas", async () => {
    // **Acá la guarda de NULL es la guarda, no el mensaje**, y es la
    // diferencia con `0003`, `0004` y `0009`, donde las columnas de la arista
    // son `NOT NULL`. Sin `NEW.proceso_id IS NOT NULL` delante, la
    // subconsulta sobre un `proceso_id` nulo devuelve NULL y
    // `NULL IS NOT <tenant>` abortaría **toda** cuota de cotización.
    //
    // Las dos filas de abajo son las dos mitades de esa medición: cada una
    // tiene una de las dos columnas en nulo, y las dos tienen que entrar.
    await expect(insertar(filaValida())).resolves.toBeDefined();
    await expect(
      insertar(filaValida({ cotizacion_id: null, proceso_id: procesoId })),
    ).resolves.toBeDefined();
  });

  it("una cuota no cambia de bufete", async () => {
    const fila = filaValida();
    await insertar(fila);

    await expect(
      env.DB.prepare("UPDATE cuota SET tenant_id = ? WHERE id = ?")
        .bind(OTRO_TENANT_ID, fila.id)
        .run(),
    ).rejects.toThrow(/cuota\.tenant_id no se reasigna/);
  });

  it("una cuota no se muda de cotización", async () => {
    const fila = filaValida();
    await insertar(fila);

    const otra = nuevoId();
    await env.DB.prepare(
      "INSERT INTO cotizacion (id, tenant_id, cliente_id, codigo, estado," +
        " fecha, moneda, creada_por, creada_en)" +
        " VALUES (?, ?, ?, ?, 'borrador', ?, 'USD', ?, ?)",
    )
      .bind(
        otra,
        TENANT_UNICO_ID,
        clienteId,
        `COT-2026-${otra}`,
        new Date().toISOString(),
        autorId,
        new Date().toISOString(),
      )
      .run();

    await expect(
      env.DB.prepare("UPDATE cuota SET cotizacion_id = ? WHERE id = ?")
        .bind(otra, fila.id)
        .run(),
    ).rejects.toThrow(/cuota\.cotizacion_id no se reasigna/);
  });

  it("una cuota no se muda de proceso", async () => {
    const fila = filaValida({ cotizacion_id: null, proceso_id: procesoId });
    await insertar(fila);

    const otro = nuevoId();
    await env.DB.prepare(
      "INSERT INTO proceso (id, tenant_id, cliente_id, tipo_proceso_id," +
        " origen, titulo, estado, abierto_en)" +
        " VALUES (?, ?, ?, ?, 'directo', ?, 'abierto', ?)",
    )
      .bind(
        otro,
        TENANT_UNICO_ID,
        clienteId,
        tipoProcesoId,
        "Otro trámite",
        new Date().toISOString(),
      )
      .run();

    await expect(
      env.DB.prepare("UPDATE cuota SET proceso_id = ? WHERE id = ?")
        .bind(otro, fila.id)
        .run(),
    ).rejects.toThrow(/cuota\.proceso_id no se reasigna/);
  });

  it("pero el monto y el concepto sí se corrigen", async () => {
    // El contrapeso de las tres de arriba: una inmutabilidad escrita de más
    // cerraría una edición legítima, y sin esta prueba nadie lo notaría.
    const fila = filaValida();
    await insertar(fila);

    await expect(
      env.DB.prepare("UPDATE cuota SET monto = ?, concepto = ? WHERE id = ?")
        .bind(175_000, "Anticipo corregido", fila.id)
        .run(),
    ).resolves.toBeDefined();
  });

  it("y una corrección no puede fabricar una fila ambigua", async () => {
    // Los cuatro `CHECK` se vuelven a evaluar en cada `UPDATE`. Sin esto, la
    // mutabilidad de `monto` y `porcentaje` sería la puerta de atrás por la
    // que entra la cuota con los dos.
    const fila = filaValida();
    await insertar(fila);

    await expect(
      env.DB.prepare("UPDATE cuota SET porcentaje = 5000 WHERE id = ?")
        .bind(fila.id)
        .run(),
    ).rejects.toThrow(/la_cuota_lleva_monto_o_porcentaje_y_nunca_los_dos/);
  });
});

/* ==========================================================================
   Monto o porcentaje, exactamente uno
   ========================================================================== */

describe("la cuota lleva monto o porcentaje, nunca los dos", () => {
  it("rechaza la cuota con monto y porcentaje", async () => {
    // **Es la exclusividad que `docs/diseno.md` §6 argumenta entera**: una
    // cuota con los dos es un total ambiguo que nadie detecta hasta que las
    // cifras no cierran, que es meses después y delante del cliente.
    await expect(
      insertar(filaValida({ porcentaje: 5_000 })),
    ).rejects.toThrow(/la_cuota_lleva_monto_o_porcentaje_y_nunca_los_dos/);
  });

  it("rechaza la cuota sin monto y sin porcentaje", async () => {
    await expect(
      insertar(filaValida({ monto: null })),
    ).rejects.toThrow(/la_cuota_lleva_monto_o_porcentaje_y_nunca_los_dos/);
  });

  it("entra la cuota porcentual de una cotización", async () => {
    await expect(
      insertar(filaValida({ monto: null, porcentaje: 5_000 })),
    ).resolves.toBeDefined();
  });

  it("rechaza un monto con centavos partidos, porque INTEGER es afinidad", async () => {
    // Lo que T-1 midió y dejó escrito: un `1500.5` entra tal cual en una
    // columna `INTEGER`, porque no se puede convertir sin pérdida.
    // `typeof(monto) = 'integer'` es lo único que lo impide.
    await expect(
      insertar(filaValida({ monto: 1_500.5 })),
    ).rejects.toThrow(/el_monto_de_la_cuota_es_centavos_enteros_positivos/);
  });

  it("rechaza un monto de cero", async () => {
    // **Y acá esta tabla se aparta de `movimiento_gasto` a propósito.** Un
    // movimiento de cero no mueve nada y no corrompe nada; una cuota de cero
    // es un renglón en un documento que el cliente firma, prometiendo un
    // cobro que no existe.
    await expect(
      insertar(filaValida({ monto: 0 })),
    ).rejects.toThrow(/el_monto_de_la_cuota_es_centavos_enteros_positivos/);
  });

  it("rechaza un monto negativo", async () => {
    await expect(
      insertar(filaValida({ monto: -1 })),
    ).rejects.toThrow(/el_monto_de_la_cuota_es_centavos_enteros_positivos/);
  });

  it("rechaza un porcentaje con decimales", async () => {
    // El mismo defecto de afinidad, en la otra columna: un `33.33` sería un
    // porcentaje a medio convertir a puntos básicos.
    await expect(
      insertar(filaValida({ monto: null, porcentaje: 33.33 })),
    ).rejects.toThrow(
      /el_porcentaje_de_la_cuota_es_puntos_basicos_de_uno_a_diez_mil/,
    );
  });

  it("rechaza un porcentaje de cero", async () => {
    await expect(
      insertar(filaValida({ monto: null, porcentaje: 0 })),
    ).rejects.toThrow(
      /el_porcentaje_de_la_cuota_es_puntos_basicos_de_uno_a_diez_mil/,
    );
  });

  it("rechaza un porcentaje de más del cien por ciento", async () => {
    await expect(
      insertar(filaValida({ monto: null, porcentaje: 10_001 })),
    ).rejects.toThrow(
      /el_porcentaje_de_la_cuota_es_puntos_basicos_de_uno_a_diez_mil/,
    );
  });

  it("acepta los dos bordes del rango, 1 y 10000", async () => {
    // El contrapeso de las tres de arriba: un rango escrito con `<` en vez de
    // `<=` dejaría fuera la cuota única del 100 %, que es la forma más común
    // de todas, y ninguna prueba de rechazo lo notaría.
    await expect(
      insertar(filaValida({ monto: null, porcentaje: 1 })),
    ).resolves.toBeDefined();
    await expect(
      insertar(
        filaValida({
          monto: null,
          porcentaje: PUNTOS_BASICOS_DEL_CIEN_POR_CIENTO,
        }),
      ),
    ).resolves.toBeDefined();
  });

  it("la constante del código dice lo mismo que el CHECK de la base", async () => {
    // **Las dos mitades acopladas.** El `CHECK` es el que sobrevive al primer
    // script de importación; la constante es la que cierra lo que la API
    // acepta. Si se separan, la API acepta un porcentaje que la base rechaza
    // con un 500 que nadie puede leer.
    const tabla = await env.DB.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'cuota'",
    ).first<{ sql: string }>();

    expect(tabla).not.toBeNull();
    expect((tabla as { sql: string }).sql).toContain(
      `porcentaje <= ${PUNTOS_BASICOS_DEL_CIEN_POR_CIENTO}`,
    );
  });
});

/* ==========================================================================
   Vencimiento o hito, exactamente uno
   ========================================================================== */

describe("la cuota vence en una fecha o contra un hito, nunca las dos", () => {
  it("rechaza la cuota con fecha y hito", async () => {
    await expect(
      insertar(filaValida({ vence_en: finDelDiaEnPanama("2026-06-30") })),
    ).rejects.toThrow(
      /la_cuota_vence_en_una_fecha_o_contra_un_hito_y_nunca_las_dos/,
    );
  });

  it("rechaza la cuota sin fecha y sin hito", async () => {
    await expect(insertar(filaValida({ hito: null }))).rejects.toThrow(
      /la_cuota_vence_en_una_fecha_o_contra_un_hito_y_nunca_las_dos/,
    );
  });

  it("entra la cuota que vence en una fecha", async () => {
    await expect(
      insertar(
        filaValida({ hito: null, vence_en: finDelDiaEnPanama("2026-06-30") }),
      ),
    ).resolves.toBeDefined();
  });

  it("un hito en blanco no cuenta como hito, y por eso tiene su restricción", async () => {
    // **Sin esto, la exclusividad de arriba se derrota con `''`**: una cadena
    // vacía no es nula, así que la fila pasa el `IS NOT` y queda una cuota de
    // la que no se sabe cuándo se cobra, que es exactamente lo que esa
    // exclusividad existe para impedir.
    await expect(
      insertar(filaValida({ hito: "" })),
    ).rejects.toThrow(/el_hito_de_la_cuota_no_esta_en_blanco/);
  });

  it("y tampoco cuenta un hito de puros espacios", async () => {
    await expect(
      insertar(filaValida({ hito: "   " })),
    ).rejects.toThrow(/el_hito_de_la_cuota_no_esta_en_blanco/);
  });

  it("rechaza un vencimiento que no es un momento canónico", async () => {
    await expect(
      insertar(filaValida({ hito: null, vence_en: "30 de junio" })),
    ).rejects.toThrow(/el_vencimiento_de_la_cuota_es_un_momento_canonico/);
  });

  it("rechaza una creación que no es un momento canónico", async () => {
    await expect(
      insertar(filaValida({ creada_en: "2026-06-30" })),
    ).rejects.toThrow(/la_creacion_de_la_cuota_es_un_momento_canonico/);
  });
});

/* ==========================================================================
   El porcentaje sólo cuelga de una cotización
   ========================================================================== */

describe("un porcentaje sin cotización no tiene de qué ser porcentaje", () => {
  it("rechaza la cuota porcentual colgada de un proceso", async () => {
    // **La respuesta a «¿porcentaje de qué?», puesta en la base.** No es la
    // misma en los dos casos: una cotización tiene un total que `totalesDe`
    // deriva de sus líneas; un proceso no tiene ninguno —tiene gastos reales,
    // que son plata de terceros— y uno suelto no tiene absolutamente ningún
    // número del que ser porcentaje.
    await expect(
      insertar(
        filaValida({
          cotizacion_id: null,
          proceso_id: procesoId,
          monto: null,
          porcentaje: 5_000,
        }),
      ),
    ).rejects.toThrow(
      /un_porcentaje_sin_cotizacion_no_tiene_de_que_ser_porcentaje/,
    );
  });

  it("pero la cuota de monto de un proceso entra sin problema", async () => {
    // El contrapeso: lo que está prohibido es el porcentaje, no el plan del
    // trámite suelto. Sin esta prueba, un `CHECK` escrito de más que
    // prohibiera toda cuota de proceso pasaría inadvertido.
    await expect(
      insertar(filaValida({ cotizacion_id: null, proceso_id: procesoId })),
    ).resolves.toBeDefined();
  });
});

/* ==========================================================================
   La aritmética
   ========================================================================== */

describe("importeDe · qué cobra una cuota", () => {
  it("una cuota de monto cobra su monto", () => {
    expect(importeDe({ monto: 150_000, porcentaje: null }, 999_999)).toBe(
      150_000,
    );
  });

  it("una cuota de monto cobra su monto aunque no haya base", () => {
    // Es el caso del plan de un proceso: no hay base y no hace falta.
    expect(importeDe({ monto: 150_000, porcentaje: null }, null)).toBe(150_000);
  });

  it("una cuota porcentual cobra su parte de la base", () => {
    // El 50 % de 1 000 dólares. Valores literales y no calculados con la
    // función que se prueba.
    expect(importeDe({ monto: null, porcentaje: 5_000 }, 100_000)).toBe(50_000);
  });

  it("una cuota porcentual sin base no se puede saber, y no es cero", () => {
    // **No se anula con el `CHECK` de la base**, y la diferencia se ve acá:
    // aquél decide qué filas pueden existir y rechaza la escritura; esto
    // decide qué se lee de una fila que entró igual por un script de
    // importación. Y devuelve `null` y no `0`, porque «no se puede saber» no
    // es «no cobra nada».
    expect(importeDe({ monto: null, porcentaje: 5_000 }, null)).toBeNull();
  });

  it("trunca hacia abajo, y el residuo no se reparte", () => {
    // Un tercio en puntos básicos sobre cien mil centavos. El valor esperado
    // se escribe aparte.
    expect(
      importeDe({ monto: null, porcentaje: TERCIO_EN_PUNTOS_BASICOS }, BASE_DE_CIEN_MIL),
    ).toBe(TERCIO_APLICADO);
  });

  it("la cuenta es entera, y hay un caso donde eso cambia el número", () => {
    // 7,77 % de 1 234,56 dólares. En centavos enteros da 9 592; la misma
    // cuenta hecha en dólares con coma flotante da 95,92559999999999 ×
    // 100 = 9592,559999999999, y `Math.round` de eso daría 9593.
    //
    // No es una diferencia teórica: un centavo de más por cuota, en un plan
    // de doce cuotas, son doce centavos que no cierran contra el total.
    const enteros = importeDe({ monto: null, porcentaje: 777 }, 123_456);
    const ingenuo = Math.round((123_456 / 100) * (777 / 10_000) * 100);

    expect(enteros).toBe(9_592);
    expect(ingenuo).toBe(9_593);
    expect(enteros).not.toBe(ingenuo);
  });
});

describe("planDe · el plan entero", () => {
  function cuota(parcial: Partial<Cuota>): Cuota {
    return {
      id: nuevoId(),
      concepto: "Una cuota",
      monto: null,
      porcentaje: null,
      venceEn: null,
      hito: "A la firma",
      importe: null,
      creadaEn: "2026-06-30T23:59:59.999Z",
      ...parcial,
    };
  }

  it("un plan vacío suma cero, y no es un caso especial", () => {
    expect(planDe([], 100_000)).toEqual({ cuotas: [], total: 0, base: 100_000 });
  });

  it("suma los importes aplicados", () => {
    const plan = planDe(
      [cuota({ monto: 120_000 }), cuota({ porcentaje: 5_000 })],
      100_000,
    );

    expect(plan.cuotas.map((cada) => cada.importe)).toEqual([120_000, 50_000]);
    expect(plan.total).toBe(170_000);
  });

  it("el residuo del truncamiento queda a la vista en vez de repartido", () => {
    // **Tres cuotas de 33,33 % sobre cien mil centavos suman 99 990.**
    // Faltan diez centavos, y eso es exactamente por lo que el total se
    // deriva en vez de guardarse: con `total` al lado de `base`, un plan que
    // no cierra se ve. Un total almacenado habría dicho 100 000.
    const tercios = [
      cuota({ porcentaje: TERCIO_EN_PUNTOS_BASICOS }),
      cuota({ porcentaje: TERCIO_EN_PUNTOS_BASICOS }),
      cuota({ porcentaje: TERCIO_EN_PUNTOS_BASICOS }),
    ];

    const plan = planDe(tercios, BASE_DE_CIEN_MIL);

    expect(plan.total).toBe(TRES_TERCIOS_APLICADOS);
    expect(plan.base).toBe(BASE_DE_CIEN_MIL);
    expect(plan.total).not.toBe(BASE_DE_CIEN_MIL);
  });

  it("una cuota sin importe no suma, y tampoco suma como cero", () => {
    const plan = planDe(
      [cuota({ monto: 120_000 }), cuota({ porcentaje: 5_000 })],
      null,
    );

    expect(plan.cuotas.map((cada) => cada.importe)).toEqual([120_000, null]);
    expect(plan.total).toBe(120_000);
    expect(plan.base).toBeNull();
  });
});

/* ==========================================================================
   La API del plan de una cotización
   ========================================================================== */

describe("el plan de una cotización, por la API", () => {
  it("una cotización sin plan devuelve un plan vacío, no un 404", async () => {
    const plan = await planDeLaRuta(rutaDeCotizacion());

    expect(plan.cuotas).toEqual([]);
    expect(plan.total).toBe(0);
  });

  it("la base que viaja es el total de las líneas de la cotización", async () => {
    await sembrarLineas([70_000, 30_000]);

    expect((await planDeLaRuta(rutaDeCotizacion())).base).toBe(100_000);
  });

  it("agrega una cuota de monto y devuelve el plan entero con 201", async () => {
    const respuesta = await comoAutor(
      conCuerpo(rutaDeCotizacion(), "POST", {
        concepto: "Anticipo a la firma",
        monto: 150_000,
        hito: "A la firma",
      }),
    );

    expect(respuesta.status).toBe(201);
    // Sin `location`: una cuota no tiene `GET` propio, y fabricar una
    // dirección sería prometer uno que no existe.
    expect(respuesta.headers.get("location")).toBeNull();

    const plan = (await respuesta.json()) as PlanDePagos;
    expect(plan.cuotas).toHaveLength(1);
    expect(plan.cuotas[0].concepto).toBe("Anticipo a la firma");
    expect(plan.cuotas[0].monto).toBe(150_000);
    expect(plan.cuotas[0].porcentaje).toBeNull();
    expect(plan.cuotas[0].hito).toBe("A la firma");
    expect(plan.cuotas[0].venceEn).toBeNull();
    expect(plan.total).toBe(150_000);
  });

  it("agrega una cuota porcentual y el servidor aplica el porcentaje", async () => {
    await sembrarLineas([200_000]);

    const respuesta = await comoAutor(
      conCuerpo(rutaDeCotizacion(), "POST", {
        concepto: "Mitad contra sentencia",
        porcentaje: 5_000,
        hito: "Contra sentencia",
      }),
    );

    expect(respuesta.status).toBe(201);

    const plan = (await respuesta.json()) as PlanDePagos;
    expect(plan.cuotas[0].porcentaje).toBe(5_000);
    expect(plan.cuotas[0].monto).toBeNull();
    // **El importe lo aplica el servidor.** La pantalla recibe el número ya
    // resuelto y no lo recalcula: ver el encabezado de `worker/cuotas/dominio.ts`.
    expect(plan.cuotas[0].importe).toBe(100_000);
    expect(plan.total).toBe(100_000);
  });

  it("el importe de una cuota porcentual sigue a las líneas de la cotización", async () => {
    await sembrarLineas([100_000]);
    await cargar(rutaDeCotizacion(), {
      concepto: "La mitad",
      porcentaje: 5_000,
      hito: "A la firma",
    });

    expect((await planDeLaRuta(rutaDeCotizacion())).cuotas[0].importe).toBe(
      50_000,
    );

    // **La base no se congela al cargar la cuota**, y ésta es la prueba que
    // lo mide: una base guardada sería un total almacenado con otro nombre.
    await sembrarLineas([100_000]);

    const despues = await planDeLaRuta(rutaDeCotizacion());
    expect(despues.base).toBe(200_000);
    expect(despues.cuotas[0].importe).toBe(100_000);
  });

  it("guarda el vencimiento como el fin del día en Panamá y lo devuelve al día que es", async () => {
    await cargar(rutaDeCotizacion(), {
      concepto: "El saldo",
      monto: 50_000,
      venceEn: "2026-06-30",
    });

    const plan = await planDeLaRuta(rutaDeCotizacion());
    expect(plan.cuotas[0].venceEn).toBe("2026-06-30");
    expect(plan.cuotas[0].hito).toBeNull();

    // Y lo que de verdad quedó en la columna: el último instante de ese día
    // en Panamá, no la medianoche UTC.
    const fila = await env.DB.prepare(
      "SELECT vence_en FROM cuota WHERE id = ?",
    )
      .bind(plan.cuotas[0].id)
      .first<{ vence_en: string }>();

    expect(fila?.vence_en).toBe(finDelDiaEnPanama("2026-06-30"));
  });

  it("acepta un vencimiento en el pasado, porque un plan viejo se carga hoy", async () => {
    // Al revés que una cotización, que no puede vencer antes de existir. La
    // primera cuota de un encargo que empezó el mes pasado venció antes de
    // que nadie la escribiera, y rechazarla obligaría a mentir con la fecha.
    const respuesta = await comoAutor(
      conCuerpo(rutaDeCotizacion(), "POST", {
        concepto: "La primera, ya vencida",
        monto: 50_000,
        venceEn: "2020-01-15",
      }),
    );

    expect(respuesta.status).toBe(201);
  });

  it("el cronograma se lee en el orden en que se escribió", async () => {
    // **Y no por vencimiento**, que es lo que parecería natural: la mitad de
    // las cuotas de un plan va contra hito y no tiene fecha, así que ordenar
    // por `vence_en` mandaría al final justamente a la primera.
    await cargar(rutaDeCotizacion(), { concepto: "A la firma", monto: 50_000, hito: "A la firma" });
    await cargar(rutaDeCotizacion(), { concepto: "Al mes", monto: 50_000, venceEn: "2026-01-31" });
    await cargar(rutaDeCotizacion(), { concepto: "Al cierre", monto: 50_000, hito: "Al cierre" });

    expect(
      (await planDeLaRuta(rutaDeCotizacion())).cuotas.map((c) => c.concepto),
    ).toEqual(["A la firma", "Al mes", "Al cierre"]);
  });

  it("quita una cuota y devuelve el plan sin ella", async () => {
    const primera = await cargar(rutaDeCotizacion(), {
      concepto: "Primera",
      monto: 60_000,
      hito: "A la firma",
    });
    await cargar(rutaDeCotizacion(), {
      concepto: "Segunda",
      monto: 40_000,
      hito: "Al cierre",
    });

    const respuesta = await comoAutor(
      peticion(`${rutaDeCotizacion()}/${primera}`, { method: "DELETE" }),
    );

    expect(respuesta.status).toBe(200);

    const plan = (await respuesta.json()) as PlanDePagos;
    expect(plan.cuotas.map((cuota) => cuota.concepto)).toEqual(["Segunda"]);
    expect(plan.total).toBe(40_000);
  });

  it("el plan no se congela al emitir la cotización", async () => {
    // **Es una decisión y no un olvido.** Los módulos y las líneas sí se
    // congelan (I-4 e I-5); las cuotas no entran al snapshot, así que
    // agregar una no toca el documento congelado. Y es justo cuando una
    // cotización se gana que el plan se termina de acomodar: cerrar la
    // escritura al emitir dejaría imposible de cargar el plan del caso
    // mayoritario.
    await env.DB.prepare(
      "UPDATE cotizacion SET estado = 'emitida', snapshot = ? WHERE id = ?",
    )
      .bind("{}", cotizacionId)
      .run();

    const respuesta = await comoAutor(
      conCuerpo(rutaDeCotizacion(), "POST", {
        concepto: "El plan que se acordó después",
        monto: 150_000,
        hito: "A la firma",
      }),
    );

    expect(respuesta.status).toBe(201);
  });
});

/* ==========================================================================
   La API del plan de un proceso
   ========================================================================== */

describe("el plan de un proceso suelto, por la API", () => {
  it("agrega una cuota de monto", async () => {
    const respuesta = await comoAutor(
      conCuerpo(rutaDeProceso(), "POST", {
        concepto: "Honorarios del trámite",
        monto: 90_000,
        hito: "A la entrega",
      }),
    );

    expect(respuesta.status).toBe(201);
    expect(((await respuesta.json()) as PlanDePagos).total).toBe(90_000);
  });

  it("el plan de un proceso viaja sin base, y ése es el nulo honesto", async () => {
    await cargar(rutaDeProceso(), {
      concepto: "Honorarios",
      monto: 90_000,
      hito: "A la entrega",
    });

    expect((await planDeLaRuta(rutaDeProceso())).base).toBeNull();
  });

  it("rechaza una cuota porcentual con porcentaje_sin_cotizacion", async () => {
    // **La mitad amable del cuarto `CHECK`.** El 422 llega antes de la base y
    // dice qué hacer en su lugar; el `CHECK` sigue ahí para el script de
    // importación. Las dos guardas existen y no resuelven lo mismo.
    const respuesta = await comoAutor(
      conCuerpo(rutaDeProceso(), "POST", {
        concepto: "La mitad de nada",
        porcentaje: 5_000,
        hito: "A la firma",
      }),
    );

    expect(respuesta.status).toBe(422);
    expect(await motivosDe(respuesta)).toContain("porcentaje_sin_cotizacion");
  });

  it("quita una cuota del plan de un proceso", async () => {
    const id = await cargar(rutaDeProceso(), {
      concepto: "Honorarios",
      monto: 90_000,
      hito: "A la entrega",
    });

    const respuesta = await comoAutor(
      peticion(`${rutaDeProceso()}/${id}`, { method: "DELETE" }),
    );

    expect(respuesta.status).toBe(200);
    expect(((await respuesta.json()) as PlanDePagos).cuotas).toEqual([]);
  });

  it("los dos planes son distintos: una cuota de un lado no aparece del otro", async () => {
    await cargar(rutaDeCotizacion(), {
      concepto: "De la cotización",
      monto: 10_000,
      hito: "A la firma",
    });
    await cargar(rutaDeProceso(), {
      concepto: "Del proceso",
      monto: 20_000,
      hito: "A la firma",
    });

    expect(
      (await planDeLaRuta(rutaDeCotizacion())).cuotas.map((c) => c.concepto),
    ).toEqual(["De la cotización"]);
    expect(
      (await planDeLaRuta(rutaDeProceso())).cuotas.map((c) => c.concepto),
    ).toEqual(["Del proceso"]);
  });
});

/* ==========================================================================
   I-8 · El filtro de tenant
   ========================================================================== */

describe("I-8 · ninguna consulta se escribe sin filtrar por tenant", () => {
  it("el plan de una cotización del vecino es un 404", async () => {
    const respuesta = await comoAutor(peticion(rutaDeCotizacion(cotizacionAjenaId)));
    expect(respuesta.status).toBe(404);
  });

  it("el plan de un proceso del vecino es un 404", async () => {
    const respuesta = await comoAutor(peticion(rutaDeProceso(procesoAjenoId)));
    expect(respuesta.status).toBe(404);
  });

  it("no se puede agregar una cuota al plan del vecino", async () => {
    const respuesta = await comoAutor(
      conCuerpo(rutaDeCotizacion(cotizacionAjenaId), "POST", {
        concepto: "Una cuota ajena",
        monto: 10_000,
        hito: "A la firma",
      }),
    );

    expect(respuesta.status).toBe(404);

    // La aserción de presencia al lado de la de ausencia: sin ella, esta
    // prueba pasaría igual si la ruta devolviera 404 para todo.
    const propia = await comoAutor(
      conCuerpo(rutaDeCotizacion(), "POST", {
        concepto: "Una cuota propia",
        monto: 10_000,
        hito: "A la firma",
      }),
    );
    expect(propia.status).toBe(201);
  });

  it("la cuota del vecino no se lee desde el plan propio", async () => {
    // El caso que mide el filtro de la **consulta** y no el del dueño: una
    // cuota del vecino colgada de su propia cotización, y un plan propio que
    // no la ve.
    await insertar(
      filaValida({ tenant_id: OTRO_TENANT_ID, cotizacion_id: cotizacionAjenaId }),
    );
    await cargar(rutaDeCotizacion(), {
      concepto: "La propia",
      monto: 10_000,
      hito: "A la firma",
    });

    const plan = await planDeLaRuta(rutaDeCotizacion());
    expect(plan.cuotas.map((cuota) => cuota.concepto)).toEqual(["La propia"]);
  });

  /**
   * **El filtro de `tenant_id` de las consultas no se puede medir, y esto es
   * la medición de por qué.**
   *
   * Se intentó con la mutación correcta —sacarle `tenant_id = ?` a
   * `leerCuotas` y a `obtener` en `worker/cuotas/repositorio.ts`— y las
   * noventa pruebas siguieron verdes las dos veces. Antes de concluir que
   * faltaba cobertura, se revisó si la mutación era la correcta, que es la
   * lección que esta tajada ya pagó: **lo era**, y lo que pasa es que la fila
   * que haría visible la diferencia **no puede existir**.
   *
   * Esta prueba lo demuestra: una cuota con el `cotizacion_id` de este bufete
   * y el `tenant_id` del vecino muere en
   * `cuota_tenencia_coherente_al_insertar`. Y como `cotizacion.id` es clave
   * primaria, no hay dos cotizaciones con el mismo identificador en bufetes
   * distintos, así que filtrar por el dueño ya acota a un solo tenant.
   *
   * O sea: **el filtro de tenant y el disparador de tenencia resuelven lo
   * mismo por caminos distintos**, que es exactamente la forma en que dos
   * guardas se anulan como garantía. No se quita, y conviene decir por qué:
   * I-8 (`docs/diseno.md` §5) es una regla de escritura de consultas de este
   * proyecto entero —«ninguna consulta se escribe sin filtrar por
   * `tenant_id`, ni siquiera las que buscan por llave primaria»—, y escribir
   * una consulta distinta según si el disparador de al lado la cubre sería
   * peor que cualquiera de las dos opciones. Lo que sí se hace es dejar
   * escrito cuál de las dos es la que de verdad guarda.
   *
   * Lo que **sí** se mide, y mata su mutación, es el filtro por la columna
   * del dueño: ver la prueba de abajo.
   */
  it("la fila que haría visible el filtro de tenant no puede existir", async () => {
    await expect(
      insertar({
        id: nuevoId(),
        tenant_id: OTRO_TENANT_ID,
        proceso_id: null,
        cotizacion_id: cotizacionId,
        concepto: "La cuota imposible",
        monto: 10_000,
        porcentaje: null,
        vence_en: null,
        hito: "A la firma",
        creada_en: new Date().toISOString(),
      }),
    ).rejects.toThrow(/tenencia cruzada/);

    // La aserción de presencia al lado de la de ausencia: la misma fila con
    // el tenant que le corresponde sí entra, así que lo que la rechazó fue la
    // tenencia y no otra cosa.
    await expect(insertar(filaValida())).resolves.toBeDefined();
  });

  it("una cuota de otro plan del mismo bufete tampoco se borra desde acá", async () => {
    // El 404 no es sólo entre bufetes: una cuota que existe y es de este
    // tenant, pero cuelga de otro dueño, no se puede tocar desde esta
    // dirección. Es lo que `obtener` filtra con la columna del dueño.
    const delProceso = await cargar(rutaDeProceso(), {
      concepto: "Del proceso",
      monto: 20_000,
      hito: "A la firma",
    });

    const respuesta = await comoAutor(
      peticion(`${rutaDeCotizacion()}/${delProceso}`, { method: "DELETE" }),
    );

    expect(respuesta.status).toBe(404);

    // Y sigue estando donde estaba.
    expect((await planDeLaRuta(rutaDeProceso())).cuotas).toHaveLength(1);
  });
});

/* ==========================================================================
   Lo que la API rechaza
   ========================================================================== */

describe("lo que el alta de una cuota no acepta", () => {
  async function rechazo(cuerpo: unknown): Promise<string[]> {
    const respuesta = await comoAutor(conCuerpo(rutaDeCotizacion(), "POST", cuerpo));
    expect(respuesta.status).toBe(422);
    return motivosDe(respuesta);
  }

  it("una cuota con monto y porcentaje", async () => {
    expect(
      await rechazo({
        concepto: "Ambigua",
        monto: 10_000,
        porcentaje: 5_000,
        hito: "A la firma",
      }),
    ).toContain("monto_o_porcentaje");
  });

  it("una cuota sin monto y sin porcentaje", async () => {
    expect(
      await rechazo({ concepto: "Sin importe", hito: "A la firma" }),
    ).toContain("monto_o_porcentaje");
  });

  it("una cuota con vencimiento y hito", async () => {
    expect(
      await rechazo({
        concepto: "Dos disparadores",
        monto: 10_000,
        venceEn: "2026-06-30",
        hito: "A la firma",
      }),
    ).toContain("vencimiento_o_hito");
  });

  it("una cuota sin vencimiento y sin hito", async () => {
    expect(await rechazo({ concepto: "Sin cuándo", monto: 10_000 })).toContain(
      "vencimiento_o_hito",
    );
  });

  it("un hito de puros espacios cuenta como ausente", async () => {
    expect(
      await rechazo({ concepto: "En blanco", monto: 10_000, hito: "   " }),
    ).toContain("vencimiento_o_hito");
  });

  it("una cuota sin concepto", async () => {
    expect(
      await rechazo({ concepto: "  ", monto: 10_000, hito: "A la firma" }),
    ).toContain("concepto_requerido");
  });

  it("un monto de cero", async () => {
    expect(
      await rechazo({ concepto: "Nada", monto: 0, hito: "A la firma" }),
    ).toContain("monto_invalido");
  });

  it("un monto que no es entero", async () => {
    expect(
      await rechazo({ concepto: "Partido", monto: 1_500.5, hito: "A la firma" }),
    ).toContain("monto_invalido");
  });

  it("un monto que llega como texto", async () => {
    // Una cadena que el servidor parsea es el camino por el que mañana entra
    // `"2.000,50"` y sale cualquier cosa.
    expect(
      await rechazo({ concepto: "Texto", monto: "1500", hito: "A la firma" }),
    ).toContain("monto_invalido");
  });

  it("un porcentaje de más del cien por ciento", async () => {
    expect(
      await rechazo({ concepto: "Demasiado", porcentaje: 10_001, hito: "A la firma" }),
    ).toContain("porcentaje_invalido");
  });

  it("un porcentaje con decimales, que es uno a medio convertir", async () => {
    expect(
      await rechazo({ concepto: "A medias", porcentaje: 33.33, hito: "A la firma" }),
    ).toContain("porcentaje_invalido");
  });

  it("un vencimiento que no es un día del calendario", async () => {
    expect(
      await rechazo({ concepto: "Imposible", monto: 10_000, venceEn: "2026-02-31" }),
    ).toContain("vencimiento_invalido");
  });

  it("devuelve todas las fallas y no la primera", async () => {
    // Un formulario que corrige de a un error por envío es el formulario que
    // nadie usa.
    const motivos = await rechazo({ concepto: "", monto: 0, porcentaje: 0 });

    expect(motivos).toContain("concepto_requerido");
    expect(motivos).toContain("monto_invalido");
    expect(motivos).toContain("porcentaje_invalido");
    expect(motivos).toContain("monto_o_porcentaje");
    expect(motivos).toContain("vencimiento_o_hito");
  });

  it("un cuerpo que no es JSON es 400 y no 422", async () => {
    const respuesta = await comoAutor(
      peticion(rutaDeCotizacion(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      }),
    );

    expect(respuesta.status).toBe(400);
  });

  it("una cuota que no existe no se puede borrar", async () => {
    const respuesta = await comoAutor(
      peticion(`${rutaDeCotizacion()}/${nuevoId()}`, { method: "DELETE" }),
    );

    expect(respuesta.status).toBe(404);
  });

  it("no hay PUT sobre una cuota, y el 405 lo dice", async () => {
    const id = await cargar(rutaDeCotizacion(), {
      concepto: "Una cuota",
      monto: 10_000,
      hito: "A la firma",
    });

    const respuesta = await comoAutor(
      conCuerpo(`${rutaDeCotizacion()}/${id}`, "PUT", { monto: 20_000 }),
    );

    expect(respuesta.status).toBe(405);
    expect(respuesta.headers.get("allow")).toBe("DELETE");
  });

  it("no hay DELETE sobre la colección", async () => {
    const respuesta = await comoAutor(
      peticion(rutaDeCotizacion(), { method: "DELETE" }),
    );

    expect(respuesta.status).toBe(405);
    expect(respuesta.headers.get("allow")).toBe("GET, POST");
  });
});

/* ==========================================================================
   La bitácora
   ========================================================================== */

describe("los dos verbos del plan, atribuidos a quien lleva la cuota", () => {
  interface Entrada {
    entidad: string;
    entidad_id: string;
    accion: string;
    detalle: string | null;
  }

  async function entradasDe(entidadId: string): Promise<Entrada[]> {
    const { results } = await env.DB.prepare(
      "SELECT entidad, entidad_id, accion, detalle FROM bitacora" +
        " WHERE entidad_id = ? ORDER BY ocurrido_en, rowid",
    )
      .bind(entidadId)
      .all<Entrada>();

    return results;
  }

  it("agregar una cuota de cotización se registra contra la cotización", async () => {
    await cargar(rutaDeCotizacion(), {
      concepto: "Anticipo a la firma del poder",
      monto: 150_000,
      hito: "A la firma",
    });

    expect(await entradasDe(cotizacionId)).toEqual([
      {
        entidad: "cotizacion",
        entidad_id: cotizacionId,
        accion: "cuota_agregada",
        detalle: "Anticipo a la firma del poder",
      },
    ]);
  });

  it("agregar una cuota de proceso se registra contra el proceso", async () => {
    // **La otra mitad de la decisión (c) en la bitácora**, y la razón por la
    // que `0009` no podía traer estos verbos: hasta que no se supo de qué
    // cuelga una cuota, no había entidad a la que atribuirlos.
    await cargar(rutaDeProceso(), {
      concepto: "Honorarios del trámite",
      monto: 90_000,
      hito: "A la entrega",
    });

    expect(await entradasDe(procesoId)).toEqual([
      {
        entidad: "proceso",
        entidad_id: procesoId,
        accion: "cuota_agregada",
        detalle: "Honorarios del trámite",
      },
    ]);
  });

  it("quitar una cuota se registra con su concepto, leído antes de borrarla", async () => {
    const id = await cargar(rutaDeCotizacion(), {
      concepto: "La que se va",
      monto: 10_000,
      hito: "A la firma",
    });

    await comoAutor(peticion(`${rutaDeCotizacion()}/${id}`, { method: "DELETE" }));

    expect((await entradasDe(cotizacionId)).map((e) => [e.accion, e.detalle])).toEqual([
      ["cuota_agregada", "La que se va"],
      ["cuota_quitada", "La que se va"],
    ]);
  });

  it("el detalle lleva el concepto y nunca el importe", async () => {
    // `detalle` es el nombre de cara al usuario de lo que el hecho señala, no
    // una segunda copia del dato: el importe vive en su columna, y copiarlo
    // acá sería guardar un diff disfrazado de pista en la única tabla que no
    // se puede corregir.
    await cargar(rutaDeCotizacion(), {
      concepto: "Segundo pago",
      monto: 123_456,
      hito: "Al cierre",
    });

    const detalle = (await entradasDe(cotizacionId))[0].detalle;
    expect(detalle).toBe("Segundo pago");
    expect(detalle).not.toContain("123456");
    expect(detalle).not.toContain("1234.56");
  });

  it("el vocabulario de la base acepta los dos verbos nuevos", async () => {
    // La mitad acoplada: el `CHECK` de `accion` y la unión de TypeScript
    // tienen que decir lo mismo. `test/bitacora-api.spec.ts` compara las dos
    // listas enteras; esto mide el camino concreto de estos dos verbos, que
    // es lo que fallaría con un `CHECK` que se hubiera quedado en `0009`.
    const tabla = await env.DB.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'bitacora'",
    ).first<{ sql: string }>();

    expect((tabla as { sql: string }).sql).toContain("'cuota_agregada'");
    expect((tabla as { sql: string }).sql).toContain("'cuota_quitada'");
  });
});
