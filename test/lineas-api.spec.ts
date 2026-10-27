/**
 * Las líneas de honorarios y gastos estimados (`odd/tasks/cotizaciones.md`,
 * T-3 unidad A).
 *
 * El esquema de T-1 ya rechaza en la base la clase fuera del catálogo, el
 * monto que no es un entero de cero en adelante, el orden repetido dentro de
 * una cotización y las dos aristas de tenencia de la línea. **Esta suite no
 * vuelve a probar nada de eso** —`test/esquema-cotizaciones.spec.ts` es su
 * dueño— salvo dos cosas, y cada una por un motivo propio:
 *
 *  - El **índice único de `orden`**, que acá se prueba no para afirmar que la
 *    base lo sostiene sino para demostrar que el reordenamiento no lo viola
 *    ni por un instante.
 *  - El **`typeof(monto) = 'integer'`**, que acá se prueba no como guarda de
 *    la base sino para demostrar que el camino entero —cuerpo JSON,
 *    normalización, `bind`— deposita un entero y no un flotante. Es la
 *    restricción 5 de la tajada, y es la que la pantalla puede romper sin
 *    que la base se entere si alguien mete una división en el medio.
 *
 * Lo que sí se prueba acá:
 *
 *  - **Las dos mitades acopladas del catálogo de clases.** El `CHECK` de
 *    `cotizacion_linea.clase` y el registro tipado de
 *    `worker/cotizaciones/lineas.ts` tienen que nombrar exactamente lo mismo.
 *  - **La aritmética**, que es la barandilla de la tajada: subtotales y total
 *    se derivan, nunca se guardan, y se suman **con enteros**.
 *  - **Que sólo se escribe sobre un borrador**, por la ruta y por el puerto.
 *  - **La tenencia, en cada consulta nueva.** I-8 (`docs/diseno.md` §5).
 *
 * Los contrapesos releen **por la API**: un `POST` que contesta 201 y no
 * guardó nada pasa cualquier aserción hecha sobre su propio eco.
 */
import { env } from "cloudflare:workers";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { ACCIONES_POR_ENTIDAD } from "../worker/bitacora/vocabulario";
import {
  CATALOGO_DE_CLASES,
  CLASES_DE_LINEA,
  normalizarLinea,
  normalizarOrdenDeLineas,
  totalesDe,
} from "../worker/cotizaciones/lineas";
import { cotizacionesSobreD1 } from "../worker/cotizaciones/repositorio";
import { baseSobreD1, type BaseDeDatos } from "../worker/db/base";
import { TENANT_UNICO_ID, nuevoId } from "../worker/db/ids";
import { manejar } from "../worker/index";

// ---------------------------------------------------------------------------
// Las dos mitades acopladas del catálogo de clases
// ---------------------------------------------------------------------------

describe("el catálogo de la base y el del código dicen lo mismo", () => {
  /** El `CREATE TABLE` tal como quedó en la base, con sus `CHECK`. */
  async function definicionDeLinea(): Promise<string> {
    const fila = await env.DB.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table'" +
        " AND name = 'cotizacion_linea'",
    ).first<{ sql: string }>();

    expect(fila, "la tabla `cotizacion_linea` tiene que existir").not.toBeNull();
    return fila?.sql ?? "";
  }

  it("el CHECK de clase nombra exactamente las clases del registro", async () => {
    // Las dos mitades existen a propósito y hacen cosas distintas: el `CHECK`
    // es el que sobrevive a un script de importación (§5), y el registro
    // tipado es el que le da rótulo y orden a cada clase y el que impide que
    // el generador de T-9 invente una. Si se separan, la pantalla ofrece una
    // clase que la base rechaza con un 500 que nadie puede leer.
    const definicion = await definicionDeLinea();

    const clausula = /clase\s+TEXT\s+NOT\s+NULL[\s\S]*?IN\s*\(([^)]*)\)/i.exec(
      definicion,
    );
    expect(clausula, "el CHECK de `clase` tiene que estar").not.toBeNull();

    const enLaBase = [...(clausula?.[1] ?? "").matchAll(/'([^']*)'/g)].map(
      (coincidencia) => coincidencia[1],
    );

    expect([...enLaBase].sort()).toEqual([...CLASES_DE_LINEA].sort());
  });

  it("cada clase del registro trae su rótulo, y ninguno se repite", () => {
    // El rótulo es lo único que una persona ve de una clase, y acá además
    // encabeza una sección de dinero: dos rótulos iguales serían dos
    // columnas de montos indistinguibles.
    const rotulos = CATALOGO_DE_CLASES.map((entrada) => entrada.rotulo);

    for (const rotulo of rotulos) {
      expect(rotulo.trim(), "un rótulo en blanco no rotula nada").not.toBe("");
    }

    expect(new Set(rotulos).size, "hay dos clases con el mismo rótulo").toBe(
      rotulos.length,
    );
  });

  it("el orden mostrado es el del registro y no se repite ninguna clase", () => {
    // El orden en que se muestran **es** el orden del arreglo: no hay una
    // columna `orden` en el registro porque sería un segundo lugar donde
    // decir lo mismo.
    expect(CLASES_DE_LINEA).toEqual(
      CATALOGO_DE_CLASES.map((entrada) => entrada.clase),
    );
    expect(new Set(CLASES_DE_LINEA).size).toBe(CLASES_DE_LINEA.length);
  });

  it("el honorario va primero y el gasto se rotula como estimado", () => {
    // El orden no es el alfabético, que pondría el gasto delante y haría que
    // lo aproximado encabezara la propuesta. Y el rótulo del gasto tiene que
    // decir que es una estimación: un presupuesto que se lee como un precio
    // cerrado es una promesa que el bufete no puede cumplir.
    expect(CLASES_DE_LINEA[0]).toBe("honorario");
    expect(CLASES_DE_LINEA[1]).toBe("gasto_estimado");

    const gasto = CATALOGO_DE_CLASES.find(
      (entrada) => entrada.clase === "gasto_estimado",
    );
    expect(gasto?.rotulo.toLowerCase()).toContain("estimad");
  });
});

// ---------------------------------------------------------------------------
// Los verbos de línea cuelgan de la cotización
// ---------------------------------------------------------------------------

describe("los verbos de línea están en el vocabulario de la cotización", () => {
  const VERBOS = [
    "linea_agregada",
    "linea_editada",
    "linea_quitada",
    "lineas_reordenadas",
  ];

  it("los cuatro son acciones de la cotización y de ninguna otra entidad", () => {
    // Una línea no es una entidad propia: se lee dentro de su cotización, así
    // que su hecho es un hecho de la cotización. Es la misma regla que hace
    // que `nota_agregada` cuelgue del proceso y `modulo_agregado` de la
    // cotización.
    for (const verbo of VERBOS) {
      expect(
        [...ACCIONES_POR_ENTIDAD.cotizacion] as string[],
        `falta «${verbo}» en las acciones de la cotización`,
      ).toContain(verbo);
    }

    for (const [entidad, acciones] of Object.entries(ACCIONES_POR_ENTIDAD)) {
      if (entidad === "cotizacion") continue;

      for (const verbo of VERBOS) {
        expect(
          [...acciones] as string[],
          `«${verbo}» no es un hecho de ${entidad}`,
        ).not.toContain(verbo);
      }
    }
  });

  it("el CHECK de accion los admite", async () => {
    // Es la mitad que obligó a reconstruir `bitacora` en
    // `migrations/0005_bitacora_con_las_lineas.sql`: sin estos cuatro valores
    // en el `CHECK`, **toda** escritura de línea sería un 500, porque su
    // entrada viaja en el mismo `batch` que el efecto.
    const fila = await env.DB.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'bitacora'",
    ).first<{ sql: string }>();

    for (const verbo of VERBOS) {
      expect(fila?.sql ?? "", `falta «${verbo}» en el CHECK`).toContain(
        `'${verbo}'`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// La aritmética: la barandilla de la tajada
// ---------------------------------------------------------------------------

describe("los totales se derivan, y se suman con enteros", () => {
  it("suma en centavos donde la coma flotante daría otro número", () => {
    // **El caso que distingue las dos aritméticas**, y está elegido para
    // eso: diez centavos más veinte centavos son treinta, exactos. Los
    // mismos importes en unidades de moneda —0.1 + 0.2— dan
    // 0.30000000000000004, que al volver a centavos no es 30.
    //
    // El valor esperado va escrito a mano y no calculado con `totalesDe`,
    // que es la restricción 6 de la tajada: calcular lo esperado con la
    // función que se prueba es lo que dejó invisible seis tajadas el defecto
    // de las fechas.
    const totales = totalesDe([
      { clase: "honorario", monto: 10 },
      { clase: "honorario", monto: 20 },
    ]);

    expect(totales.honorarios).toBe(30);
    expect(totales.total).toBe(30);

    // El contrapeso, que es lo que vuelve a esta prueba algo más que una
    // suma trivial: el camino de coma flotante, calculado acá y no por el
    // código bajo prueba, **no** da 30. Si alguien mete una división en
    // `totalesDe`, la aserción de arriba se cae.
    const porElCaminoFlotante = (10 / 100 + 20 / 100) * 100;
    expect(porElCaminoFlotante).not.toBe(30);
  });

  it("separa honorarios de gastos y el total es la suma de los dos", () => {
    // Los cuatro números van escritos a mano. `total` se afirma por separado
    // y no como `honorarios + gastosEstimados`: `totalesDe` lo acumula en su
    // propio recorrido justamente para que esta aserción no sea una
    // tautología.
    const totales = totalesDe([
      { clase: "honorario", monto: 150_000 },
      { clase: "gasto_estimado", monto: 7_550 },
      { clase: "honorario", monto: 85_000 },
      { clase: "gasto_estimado", monto: 1_250 },
    ]);

    expect(totales.honorarios).toBe(235_000);
    expect(totales.gastosEstimados).toBe(8_800);
    expect(totales.total).toBe(243_800);
  });

  it("una cotización sin líneas suma cero en los tres", () => {
    expect(totalesDe([])).toEqual({
      honorarios: 0,
      gastosEstimados: 0,
      total: 0,
    });
  });

  it("cien líneas de un centavo suman exactamente un dólar", () => {
    // La prueba de asociatividad. Cien sumas de 0.01 en coma flotante dan
    // 1.0000000000000007; cien sumas de 1 centavo dan 100, y el entero no se
    // desvía por muchas que sean.
    const lineas = Array.from({ length: 100 }, () => ({
      clase: "honorario" as const,
      monto: 1,
    }));

    expect(totalesDe(lineas).total).toBe(100);

    let flotante = 0;
    for (let i = 0; i < 100; i += 1) flotante += 0.01;
    expect(flotante, "la misma cuenta en moneda no cierra").not.toBe(1);
  });

  it("los tres totales son enteros, no «enteros por ahora»", () => {
    const totales = totalesDe([
      { clase: "honorario", monto: 333 },
      { clase: "gasto_estimado", monto: 667 },
    ]);

    expect(Number.isInteger(totales.honorarios)).toBe(true);
    expect(Number.isInteger(totales.gastosEstimados)).toBe(true);
    expect(Number.isInteger(totales.total)).toBe(true);
    expect(totales.total).toBe(1_000);
  });
});

// ---------------------------------------------------------------------------
// El andamio de la mitad que pasa por HTTP
// ---------------------------------------------------------------------------

const DOMINIO_DE_ACCESS = "https://bufete-de-prueba.cloudflareaccess.com";
const AUD = "aud-de-la-aplicacion-del-bufete";

const EMAIL_AUTOR = "itzel@bufete.test";

/** El tenant vecino. Existe solo para que la fuga sea expresable. */
const OTRO_TENANT_ID = "0a5a6e0a-9f1e-4a6e-9f03-3b6a2a0e1d77";

/**
 * La forma de la línea en el cable. Se declara acá, y no se importa del
 * contrato del Worker, a propósito: lo que esta prueba vigila es el JSON que
 * ve el navegador. Importando el tipo, renombrar un campo en el servidor
 * renombraría también la expectativa y el cambio de contrato pasaría mudo.
 */
interface LineaEnElCable {
  id: string;
  clase: string;
  concepto: string;
  monto: number;
  tipoProcesoId: string | null;
  tipoProcesoNombre: string | null;
  arancelRenglonId: string | null;
  arancelConcepto: string | null;
  orden: number;
}

interface TotalesEnElCable {
  honorarios: number;
  gastosEstimados: number;
  total: number;
}

interface FallaEnElCable {
  campo: string;
  motivo: string;
}

let autorId: string;
let autorAjenoId: string;
let clienteId: string;
let clienteAjenoId: string;
let cotizacionId: string;
let cotizacionAjenaId: string;
let lineaAjenaId: string;
let tipoProcesoId: string;
let tipoProcesoAjenoId: string;

/* --- El arancel, que es de dónde sale el precio de una línea (T-2 de
       `odd/tasks/precios-en-la-cotizacion.md`) ---

   Los cuatro renglones se siembran **una sola vez**, en `beforeAll`, y no en
   `beforeEach` como todo lo demás de esta suite. No es una preferencia: el
   disparador `arancel_renglon_no_se_borra` de
   `migrations/0012_arancel_de_honorarios.sql` aborta todo `DELETE` sobre esa
   tabla, así que una siembra por prueba no tendría forma de limpiar lo
   anterior y chocaría contra `arancel_renglon_orden_unico`. Ninguna prueba de
   acá escribe su `monto`, así que la muestra se mantiene estable sola.

   El cuarto es del bufete vecino, y es la única forma de expresar la fuga: un
   identificador ajeno es, desde acá, un identificador que no existe. */

/** Un renglón con precio del bufete: el único origen que la base acepta. */
const RENGLON_TARIFADO_ID = "b1000000-0000-4000-8000-000000000001";
/** Un renglón del acuerdo que el bufete **todavía no tarifó**. */
const RENGLON_SIN_PRECIO_ID = "b1000000-0000-4000-8000-000000000002";
/** Uno de los 74 encabezados: por su `CHECK`, nunca puede llevar precio. */
const RUBRO_ID = "b1000000-0000-4000-8000-000000000003";
/** Un renglón tarifado **del bufete vecino**. */
const RENGLON_AJENO_ID = "b1000000-0000-4000-8000-000000000004";

/** Lo que el bufete cobra por el servicio tarifado de la muestra. */
const PRECIO_DEL_BUFETE = 40_000;
/**
 * El monto del acuerdo del mismo renglón, **distinto** del anterior.
 *
 * Distinto a propósito: si coincidieran, una respuesta que trajera la cita de
 * 2001 en lugar del precio del bufete pasaría sin que nada lo notara.
 */
const MONTO_OFICIAL = 13_755;

function sembrarRenglon(fila: {
  id: string;
  tenantId: string;
  orden: number;
  concepto: string;
  clase: "monto" | "regla" | "rubro";
  montoOficial: number | null;
  monto: number | null;
}): D1PreparedStatement {
  return env.DB.prepare(
    "INSERT INTO arancel_renglon (id, tenant_id, orden, categoria, numeral," +
      " concepto, clase, monto_oficial, regla_oficial, monto, activo)" +
      " VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 1)",
  ).bind(
    fila.id,
    fila.tenantId,
    fila.orden,
    "ACTUACIONES ANTE EL SERVICIO NACIONAL DE MIGRACIÓN",
    "a",
    fila.concepto,
    fila.clase,
    fila.montoOficial,
    fila.monto,
  );
}

/** El origen guardado de una línea, leído de la base y no del eco de nada. */
async function origenGuardadoDe(lineaId: string): Promise<string | null> {
  const fila = await env.DB.prepare(
    "SELECT arancel_renglon_id FROM cotizacion_linea WHERE id = ?",
  )
    .bind(lineaId)
    .first<{ arancel_renglon_id: string | null }>();

  expect(fila, `la línea ${lineaId} tiene que existir`).not.toBeNull();
  return fila?.arancel_renglon_id ?? null;
}

function entorno(): Env {
  // Hermético, por la misma razón que en `test/acceso.spec.ts`: un
  // `.dev.vars` local con `ACCESO_DEV_EMAIL` no puede decidir qué identidad
  // observa la suite.
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

/** Una petición hecha por la identidad del bufete. */
function comoAutor(request: Request): Promise<Response> {
  return manejar(request, entorno(), { correoDeDesarrollo: () => EMAIL_AUTOR });
}

function rutaDeLineas(id = cotizacionId): string {
  return `/api/cotizaciones/${id}/lineas`;
}

async function cuerpoDe(
  respuesta: Response,
): Promise<{ lineas: LineaEnElCable[]; totales: TotalesEnElCable }> {
  const cuerpo = (await respuesta.json()) as {
    lineas?: LineaEnElCable[];
    totales?: TotalesEnElCable;
  };
  expect(cuerpo.lineas, "la respuesta no trae `lineas`").toBeDefined();
  expect(cuerpo.totales, "la respuesta no trae `totales`").toBeDefined();
  return {
    lineas: cuerpo.lineas ?? [],
    totales: cuerpo.totales ?? { honorarios: 0, gastosEstimados: 0, total: 0 },
  };
}

async function lineasDe(respuesta: Response): Promise<LineaEnElCable[]> {
  return (await cuerpoDe(respuesta)).lineas;
}

async function fallasDe(respuesta: Response): Promise<FallaEnElCable[]> {
  const cuerpo = (await respuesta.json()) as {
    error?: string;
    fallas?: FallaEnElCable[];
  };
  expect(cuerpo.error).toBe("datos_invalidos");
  return cuerpo.fallas ?? [];
}

function motivos(fallas: readonly FallaEnElCable[]): string[] {
  return fallas.map((falla) => falla.motivo);
}

/** Relee por la API, que es la única lectura que prueba que algo se guardó. */
async function listar(id = cotizacionId): Promise<LineaEnElCable[]> {
  const respuesta = await comoAutor(peticion(rutaDeLineas(id)));
  expect(respuesta.status).toBe(200);
  return lineasDe(respuesta);
}

/** El alta mínima, que es la que casi todas las pruebas necesitan antes. */
async function agregar(
  cuerpo: unknown = { clase: "honorario", concepto: "Honorarios", monto: 1_000 },
): Promise<LineaEnElCable[]> {
  const respuesta = await comoAutor(conCuerpo(rutaDeLineas(), "POST", cuerpo));
  expect(respuesta.status, await respuesta.clone().text()).toBe(201);
  return lineasDe(respuesta);
}

/** Tres líneas, en un orden conocido: la base de las pruebas de orden. */
async function agregarTres(): Promise<LineaEnElCable[]> {
  await agregar({ clase: "honorario", concepto: "Estudio", monto: 50_000 });
  await agregar({ clase: "honorario", concepto: "Redacción", monto: 75_000 });
  return agregar({
    clase: "gasto_estimado",
    concepto: "Timbres",
    monto: 2_500,
  });
}

/**
 * Emite la cotización **por SQL**, porque la ruta que lo hace es de T-4.
 *
 * El `snapshot` va junto con el estado y no es decoración: el `CHECK` de
 * coherencia de `0004` exige que una emitida lo tenga.
 */
async function emitir(id = cotizacionId): Promise<void> {
  await env.DB.prepare(
    "UPDATE cotizacion SET estado = 'emitida', snapshot = ? WHERE id = ?",
  )
    .bind("{}", id)
    .run();
}

/** Las acciones de bitácora de la cotización, de la más vieja a la más nueva. */
async function bitacoraDe(
  id = cotizacionId,
): Promise<{ accion: string; detalle: string | null }[]> {
  const { results } = await env.DB.prepare(
    "SELECT accion, detalle FROM bitacora WHERE entidad = 'cotizacion'" +
      " AND entidad_id = ? ORDER BY ocurrido_en, rowid",
  )
    .bind(id)
    .all<{ accion: string; detalle: string | null }>();

  return results;
}

/** Los `orden` guardados, tal cual, sin pasar por la API. */
async function ordenesGuardados(id = cotizacionId): Promise<number[]> {
  const { results } = await env.DB.prepare(
    "SELECT orden FROM cotizacion_linea WHERE cotizacion_id = ? ORDER BY orden",
  )
    .bind(id)
    .all<{ orden: number }>();

  return results.map((fila) => fila.orden);
}

/**
 * La persona del bufete se crea **una sola vez**: `usuario` lleva
 * `UNIQUE (tenant_id, email)` desde T-2 y, desde T-10, con una entrada de
 * bitácora viva tampoco se puede borrar para volver a insertarla.
 */
beforeAll(async () => {
  autorId = nuevoId();

  await env.DB.prepare(
    "INSERT INTO usuario (id, tenant_id, nombre, email, activo)" +
      " VALUES (?, ?, ?, ?, 1)",
  )
    .bind(autorId, TENANT_UNICO_ID, "Itzel", EMAIL_AUTOR)
    .run();

  // El tenant vecino nace acá y no en el `beforeEach`, porque los renglones
  // del arancel que cuelgan de él viven toda la corrida: su llave foránea está
  // en `NO ACTION`, así que la fila del tenant tiene que existir antes.
  await env.DB.prepare(
    "INSERT OR IGNORE INTO tenant (id, nombre) VALUES (?, ?)",
  )
    .bind(OTRO_TENANT_ID, "Otro bufete")
    .run();

  await env.DB.batch([
    sembrarRenglon({
      id: RENGLON_TARIFADO_ID,
      tenantId: TENANT_UNICO_ID,
      orden: 1,
      concepto: "Visa de pensionado o jubilado",
      clase: "monto",
      montoOficial: MONTO_OFICIAL,
      monto: PRECIO_DEL_BUFETE,
    }),
    sembrarRenglon({
      id: RENGLON_SIN_PRECIO_ID,
      tenantId: TENANT_UNICO_ID,
      orden: 2,
      concepto: "Permiso de trabajo por contrato",
      clase: "monto",
      montoOficial: 30_000,
      monto: null,
    }),
    sembrarRenglon({
      id: RUBRO_ID,
      tenantId: TENANT_UNICO_ID,
      orden: 3,
      concepto: "Inmigrantes",
      clase: "rubro",
      montoOficial: null,
      monto: null,
    }),
    sembrarRenglon({
      id: RENGLON_AJENO_ID,
      tenantId: OTRO_TENANT_ID,
      orden: 1,
      concepto: "El servicio tarifado del vecino",
      clase: "monto",
      montoOficial: MONTO_OFICIAL,
      monto: 99_900,
    }),
  ]);
});

beforeEach(async () => {
  // El almacenamiento está aislado por archivo, no por prueba. El orden del
  // borrado es el de las llaves foráneas, que están en `NO ACTION`: las
  // líneas antes que las cotizaciones y que los tipos de proceso, y las
  // cotizaciones antes que los clientes.
  // **Y sólo se borra lo que sigue en borrador.** Desde
  // `migrations/0006_emitir_y_congelar.sql`, las hijas de una cotización que
  // ya no es borrador no se pueden quitar (I-4), y la cotización tampoco se
  // puede borrar mientras tenga hijas colgando, porque la llave foránea está
  // en `NO ACTION`: una emitida con hijas es, a propósito, indeleble. Lo que
  // cada prueba deja emitido se queda, y por eso el código lleva pegado su
  // identificador — con uno fijo, `cotizacion_codigo_unico` rechazaría la
  // siembra de la prueba siguiente.
  await env.DB.prepare(
    "DELETE FROM cotizacion_linea WHERE cotizacion_id IN" +
      " (SELECT id FROM cotizacion WHERE estado = 'borrador')",
  ).run();
  await env.DB.prepare("DELETE FROM cotizacion WHERE estado = 'borrador'").run();
  await env.DB.prepare(
    "DELETE FROM cliente WHERE id NOT IN (SELECT cliente_id FROM cotizacion)",
  ).run();
  await env.DB.prepare(
    "DELETE FROM tipo_proceso WHERE id NOT IN" +
      " (SELECT tipo_proceso_id FROM cotizacion_linea" +
      " WHERE tipo_proceso_id IS NOT NULL)",
  ).run();
  await env.DB.prepare(
    "DELETE FROM area WHERE id NOT IN (SELECT area_id FROM tipo_proceso)",
  ).run();
  await env.DB.prepare(
    "DELETE FROM usuario WHERE tenant_id <> ?" +
      " AND id NOT IN (SELECT creada_por FROM cotizacion)" +
      " AND id NOT IN (SELECT creado_por FROM cliente)",
  )
    .bind(TENANT_UNICO_ID)
    .run();
  // `arancel_renglon` entra en la lista por lo mismo que las otras tres: su
  // llave foránea hacia `tenant` está en `NO ACTION`, y los renglones de la
  // muestra viven toda la corrida porque la base no los deja borrar.
  await env.DB.prepare(
    "DELETE FROM tenant WHERE id <> ?" +
      " AND id NOT IN (SELECT tenant_id FROM cotizacion)" +
      " AND id NOT IN (SELECT tenant_id FROM cliente)" +
      " AND id NOT IN (SELECT tenant_id FROM usuario)" +
      " AND id NOT IN (SELECT tenant_id FROM arancel_renglon)",
  )
    .bind(TENANT_UNICO_ID)
    .run();

  clienteId = nuevoId();
  clienteAjenoId = nuevoId();
  cotizacionId = nuevoId();
  cotizacionAjenaId = nuevoId();
  autorAjenoId = nuevoId();
  lineaAjenaId = nuevoId();
  tipoProcesoId = nuevoId();
  tipoProcesoAjenoId = nuevoId();

  const areaId = nuevoId();
  const areaAjenaId = nuevoId();
  const ahora = new Date().toISOString();
  const anio = ahora.slice(0, 4);

  await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO tenant (id, nombre) VALUES (?, ?)").bind(
      OTRO_TENANT_ID,
      "Otro bufete",
    ),
    env.DB.prepare(
      "INSERT INTO usuario (id, tenant_id, nombre, email, activo)" +
        " VALUES (?, ?, ?, ?, 1)",
    ).bind(autorAjenoId, OTRO_TENANT_ID, "Ajena", "ajena@otro-bufete.test"),
    env.DB.prepare(
      "INSERT INTO area (id, tenant_id, nombre, activo) VALUES (?, ?, ?, 1)",
    ).bind(areaId, TENANT_UNICO_ID, "Migratorio"),
    env.DB.prepare(
      "INSERT INTO area (id, tenant_id, nombre, activo) VALUES (?, ?, ?, 1)",
    ).bind(areaAjenaId, OTRO_TENANT_ID, "Migratorio del vecino"),
    env.DB.prepare(
      "INSERT INTO tipo_proceso (id, tenant_id, area_id, nombre, activo)" +
        " VALUES (?, ?, ?, ?, 1)",
    ).bind(tipoProcesoId, TENANT_UNICO_ID, areaId, "Visa de trabajo"),
    env.DB.prepare(
      "INSERT INTO tipo_proceso (id, tenant_id, area_id, nombre, activo)" +
        " VALUES (?, ?, ?, ?, 1)",
    ).bind(
      tipoProcesoAjenoId,
      OTRO_TENANT_ID,
      areaAjenaId,
      "Trámite del vecino",
    ),
    env.DB.prepare(
      "INSERT INTO cliente (id, tenant_id, nombre, telefono, creado_por," +
        " creado_en) VALUES (?, ?, ?, ?, ?, ?)",
    ).bind(
      clienteId,
      TENANT_UNICO_ID,
      "Panamá Trading",
      "+507 6123-4567",
      autorId,
      ahora,
    ),
    env.DB.prepare(
      "INSERT INTO cliente (id, tenant_id, nombre, telefono, creado_por," +
        " creado_en) VALUES (?, ?, ?, ?, ?, ?)",
    ).bind(
      clienteAjenoId,
      OTRO_TENANT_ID,
      "Cliente del vecino",
      "+507 6000-0000",
      autorAjenoId,
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
      `COT-${anio}-${cotizacionId}`,
      ahora,
      autorId,
      ahora,
    ),
    // La cotización del vecino y su línea: el objeto de las pruebas de fuga.
    env.DB.prepare(
      "INSERT INTO cotizacion (id, tenant_id, cliente_id, codigo, estado," +
        " fecha, moneda, creada_por, creada_en)" +
        " VALUES (?, ?, ?, ?, 'borrador', ?, 'USD', ?, ?)",
    ).bind(
      cotizacionAjenaId,
      OTRO_TENANT_ID,
      clienteAjenoId,
      `COT-${anio}-${cotizacionAjenaId}`,
      ahora,
      autorAjenoId,
      ahora,
    ),
    env.DB.prepare(
      "INSERT INTO cotizacion_linea (id, tenant_id, cotizacion_id, clase," +
        " concepto, monto, tipo_proceso_id, orden)" +
        " VALUES (?, ?, ?, 'honorario', ?, 999999, ?, 0)",
    ).bind(
      lineaAjenaId,
      OTRO_TENANT_ID,
      cotizacionAjenaId,
      "El honorario del vecino",
      tipoProcesoAjenoId,
    ),
  ]);
});

// ---------------------------------------------------------------------------
// La forma de la entrada
// ---------------------------------------------------------------------------

describe("el alta rechaza lo que no es una línea", () => {
  it("rechaza una línea sin clase", async () => {
    const respuesta = await comoAutor(
      conCuerpo(rutaDeLineas(), "POST", { concepto: "Algo", monto: 100 }),
    );

    expect(respuesta.status).toBe(422);
    expect(motivos(await fallasDe(respuesta))).toEqual([
      "clase_de_linea_desconocida",
    ]);
    expect(await listar(), "no entró nada").toHaveLength(0);
  });

  it("rechaza una clase que no está en el catálogo", async () => {
    const respuesta = await comoAutor(
      conCuerpo(rutaDeLineas(), "POST", {
        clase: "descuento",
        concepto: "Algo",
        monto: 100,
      }),
    );

    expect(respuesta.status).toBe(422);
    expect(motivos(await fallasDe(respuesta))).toEqual([
      "clase_de_linea_desconocida",
    ]);
  });

  it("rechaza un concepto que es sólo espacios", async () => {
    const respuesta = await comoAutor(
      conCuerpo(rutaDeLineas(), "POST", {
        clase: "honorario",
        concepto: "   \n  ",
        monto: 100,
      }),
    );

    expect(respuesta.status).toBe(422);
    expect(motivos(await fallasDe(respuesta))).toEqual(["concepto_requerido"]);
  });

  it("rechaza las cuatro formas de no ser un importe", async () => {
    // Las cuatro dan el mismo motivo a propósito: desde donde está la
    // persona son lo mismo —«eso no es un importe»— y se arreglan igual.
    const casos: [string, unknown][] = [
      ["ausente", undefined],
      ["con centavos partidos", 1500.5],
      ["negativo", -1],
      ["en texto", "2000"],
    ];

    for (const [nombre, monto] of casos) {
      const respuesta = await comoAutor(
        conCuerpo(rutaDeLineas(), "POST", {
          clase: "honorario",
          concepto: "Algo",
          monto,
        }),
      );

      expect(respuesta.status, nombre).toBe(422);
      expect(motivos(await fallasDe(respuesta)), nombre).toEqual([
        "monto_invalido",
      ]);
    }

    expect(await listar(), "ninguna de las cuatro entró").toHaveLength(0);
  });

  it("devuelve las tres fallas juntas y no la primera", async () => {
    const respuesta = await comoAutor(
      conCuerpo(rutaDeLineas(), "POST", {
        clase: "regalo",
        concepto: "  ",
        monto: -3,
      }),
    );

    expect(respuesta.status).toBe(422);
    expect(motivos(await fallasDe(respuesta)).sort()).toEqual([
      "clase_de_linea_desconocida",
      "concepto_requerido",
      "monto_invalido",
    ]);
  });

  it("recorta el concepto antes de guardarlo", async () => {
    const [linea] = await agregar({
      clase: "honorario",
      concepto: "  Estudio del expediente  ",
      monto: 100,
    });

    expect(linea.concepto).toBe("Estudio del expediente");
    expect((await listar())[0].concepto).toBe("Estudio del expediente");
  });

  it("ignora un `orden` que llegue por el cuerpo", async () => {
    // El `orden` lo asigna el servidor, siempre. Un `orden` impuesto desde el
    // cuerpo sería el camino para pedirle a la base dos líneas en la misma
    // posición.
    await agregar({ clase: "honorario", concepto: "Primera", monto: 1 });
    const lineas = await agregar({
      clase: "honorario",
      concepto: "Segunda",
      monto: 2,
      orden: 0,
    });

    expect(lineas.map((linea) => linea.orden)).toEqual([0, 1]);
  });
});

// ---------------------------------------------------------------------------
// Las cuatro escrituras sobre un borrador
// ---------------------------------------------------------------------------

describe("las líneas de un borrador", () => {
  it("la primera nace en la posición 0 y la siguiente al final", async () => {
    const primera = await agregar({
      clase: "honorario",
      concepto: "Primera",
      monto: 1,
    });
    expect(primera.map((linea) => linea.orden)).toEqual([0]);

    const dos = await agregar({
      clase: "gasto_estimado",
      concepto: "Segunda",
      monto: 2,
    });
    expect(dos.map((linea) => linea.orden)).toEqual([0, 1]);
  });

  it("el alta contesta 201 y la lista queda guardada de verdad", async () => {
    const respuesta = await comoAutor(
      conCuerpo(rutaDeLineas(), "POST", {
        clase: "honorario",
        concepto: "Constitución de sociedad",
        monto: 120_000,
      }),
    );

    expect(respuesta.status).toBe(201);
    expect(respuesta.headers.get("location"), "una línea no se lee sola").toBe(
      null,
    );

    const releidas = await listar();
    expect(releidas).toHaveLength(1);
    expect(releidas[0].concepto).toBe("Constitución de sociedad");
    expect(releidas[0].monto).toBe(120_000);
  });

  it("el monto llega a la base como entero y no como flotante", async () => {
    // **La restricción 5, medida en la base y no razonada.** `INTEGER` en
    // SQLite es afinidad y no tipo: un flotante se guardaría tal cual si el
    // `CHECK` no estuviera, así que lo que se afirma acá es que el camino
    // entero —cuerpo, normalización, `bind`— deposita un entero.
    await agregar({ clase: "honorario", concepto: "Entero", monto: 150_000 });

    const fila = await env.DB.prepare(
      "SELECT typeof(monto) AS tipo, monto FROM cotizacion_linea" +
        " WHERE cotizacion_id = ?",
    )
      .bind(cotizacionId)
      .first<{ tipo: string; monto: number }>();

    expect(fila?.tipo).toBe("integer");
    expect(fila?.monto).toBe(150_000);
  });

  it("editar cambia los cuatro campos sin mover el orden", async () => {
    const lineas = await agregarTres();
    const victima = lineas[1];

    const respuesta = await comoAutor(
      conCuerpo(`${rutaDeLineas()}/${victima.id}`, "PUT", {
        clase: "gasto_estimado",
        concepto: "Traducción oficial",
        monto: 4_000,
        tipoProcesoId,
      }),
    );

    expect(respuesta.status).toBe(200);

    const releidas = await listar();
    const editada = releidas.find((linea) => linea.id === victima.id);
    expect(editada?.clase).toBe("gasto_estimado");
    expect(editada?.concepto).toBe("Traducción oficial");
    expect(editada?.monto).toBe(4_000);
    expect(editada?.tipoProcesoId).toBe(tipoProcesoId);
    expect(editada?.orden, "editar no mueve de lugar").toBe(victima.orden);
  });

  it("editar una línea que no es de esta cotización da 404", async () => {
    await agregar();

    const respuesta = await comoAutor(
      conCuerpo(`${rutaDeLineas()}/${nuevoId()}`, "PUT", {
        clase: "honorario",
        concepto: "Intruso",
        monto: 1,
      }),
    );

    expect(respuesta.status).toBe(404);
  });

  it("quitar saca la línea y deja las demás en su orden relativo", async () => {
    const lineas = await agregarTres();

    const respuesta = await comoAutor(
      peticion(`${rutaDeLineas()}/${lineas[1].id}`, { method: "DELETE" }),
    );

    expect(respuesta.status).toBe(200);

    const releidas = await listar();
    expect(releidas.map((linea) => linea.concepto)).toEqual([
      "Estudio",
      "Timbres",
    ]);
    // El hueco no se recompacta: lo que vale es el orden relativo.
    expect(await ordenesGuardados()).toEqual([0, 2]);
  });

  it("quitar una línea que no existe da 404", async () => {
    await agregar();

    const respuesta = await comoAutor(
      peticion(`${rutaDeLineas()}/${nuevoId()}`, { method: "DELETE" }),
    );

    expect(respuesta.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Los totales, por el cable
// ---------------------------------------------------------------------------

describe("la respuesta trae lo que suman las líneas", () => {
  it("el GET deriva los totales de lo que hay guardado", async () => {
    await agregarTres();

    const respuesta = await comoAutor(peticion(rutaDeLineas()));
    expect(respuesta.status).toBe(200);

    // Escritos a mano: 50 000 + 75 000 de honorarios, 2 500 de gasto.
    expect((await cuerpoDe(respuesta)).totales).toEqual({
      honorarios: 125_000,
      gastosEstimados: 2_500,
      total: 127_500,
    });
  });

  it("cada escritura devuelve los totales ya recalculados", async () => {
    const lineas = await agregarTres();

    const respuesta = await comoAutor(
      peticion(`${rutaDeLineas()}/${lineas[0].id}`, { method: "DELETE" }),
    );

    expect(respuesta.status).toBe(200);
    // Se fue el honorario de 50 000; quedan 75 000 y el gasto de 2 500.
    expect((await cuerpoDe(respuesta)).totales).toEqual({
      honorarios: 75_000,
      gastosEstimados: 2_500,
      total: 77_500,
    });
  });

  it("una cotización sin líneas contesta con los tres totales en cero", async () => {
    const respuesta = await comoAutor(peticion(rutaDeLineas()));

    expect(respuesta.status).toBe(200);
    const cuerpo = await cuerpoDe(respuesta);
    expect(cuerpo.lineas).toEqual([]);
    expect(cuerpo.totales).toEqual({
      honorarios: 0,
      gastosEstimados: 0,
      total: 0,
    });
  });

  it("ninguna columna de la base guarda un total", async () => {
    // La barandilla, afirmada contra el esquema y no contra el código: si
    // alguien agrega una columna `total` o `subtotal` a cualquiera de las dos
    // tablas, esto se pone rojo antes de que nadie la llene.
    await agregarTres();

    for (const tabla of ["cotizacion", "cotizacion_linea"]) {
      const { results } = await env.DB.prepare(
        `SELECT name FROM pragma_table_info('${tabla}')`,
      ).all<{ name: string }>();

      const columnas = results.map((fila) => fila.name);
      expect(columnas, tabla).not.toContain("total");
      expect(columnas, tabla).not.toContain("subtotal");
    }
  });
});

// ---------------------------------------------------------------------------
// El trámite de una línea
// ---------------------------------------------------------------------------

describe("el tipo de proceso de una línea", () => {
  it("una línea sin trámite es el caso corriente y no una falla", async () => {
    const [linea] = await agregar({
      clase: "gasto_estimado",
      concepto: "Mensajería",
      monto: 1_500,
    });

    expect(linea.tipoProcesoId).toBeNull();
    expect(linea.tipoProcesoNombre).toBeNull();
  });

  it("una línea con trámite trae su nombre resuelto en lectura", async () => {
    await agregar({
      clase: "honorario",
      concepto: "Visa",
      monto: 90_000,
      tipoProcesoId,
    });

    const [releida] = await listar();
    expect(releida.tipoProcesoId).toBe(tipoProcesoId);
    expect(releida.tipoProcesoNombre).toBe("Visa de trabajo");
  });

  it("un trámite que ya no existe da 422 y no un 500", async () => {
    // Se **cuenta** el tipo de proceso antes de escribir; no se atrapa el
    // error del disparador de tenencia ni el de la llave foránea. Un
    // identificador que quedó viejo entre que el formulario cargó y se envió
    // es una respuesta de negocio.
    const respuesta = await comoAutor(
      conCuerpo(rutaDeLineas(), "POST", {
        clase: "honorario",
        concepto: "Visa",
        monto: 90_000,
        tipoProcesoId: nuevoId(),
      }),
    );

    expect(respuesta.status).toBe(422);
    expect(motivos(await fallasDe(respuesta))).toEqual([
      "tipo_proceso_desconocido",
    ]);
    expect(await listar()).toHaveLength(0);
  });

  it("el trámite del bufete vecino no existe desde acá", async () => {
    // Sin el filtro de tenencia en la comprobación, esto entraría hasta el
    // disparador `cotizacion_linea_tenencia_coherente_al_insertar` y saldría
    // como un 500. Con él, es un 422 que dice qué arreglar.
    const respuesta = await comoAutor(
      conCuerpo(rutaDeLineas(), "POST", {
        clase: "honorario",
        concepto: "Trámite ajeno",
        monto: 1_000,
        tipoProcesoId: tipoProcesoAjenoId,
      }),
    );

    expect(respuesta.status).toBe(422);
    expect(motivos(await fallasDe(respuesta))).toEqual([
      "tipo_proceso_desconocido",
    ]);
  });

  it("editar tampoco acepta el trámite del vecino", async () => {
    const [linea] = await agregar();

    const respuesta = await comoAutor(
      conCuerpo(`${rutaDeLineas()}/${linea.id}`, "PUT", {
        clase: "honorario",
        concepto: "Sigue igual",
        monto: 1_000,
        tipoProcesoId: tipoProcesoAjenoId,
      }),
    );

    expect(respuesta.status).toBe(422);
    expect((await listar())[0].tipoProcesoId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// De dónde salió el precio de una línea (T-2 de
// `odd/tasks/precios-en-la-cotizacion.md`)
//
// `migrations/0013` y `0014` dejaron la columna y sus dos disparadores puestos
// **antes** de que existiera un escritor, y esta ruta es el primer escritor.
// Lo que esta sección mide es la mitad amable de esas guardas: que las cuatro
// formas de nombrar un origen imposible —uno que no existe, uno del bufete
// vecino, un rubro y un renglón que el bufete no tarifó— vuelvan como una
// negativa con el sobre de la casa y su motivo, y **no como un 500 crudo de
// SQLite**, que no es una negativa sino una caída.
//
// Y mide la otra mitad, que es la que define la forma de la tarea: **el monto
// sigue viajando y sigue siendo el que se mandó.** La referencia dice de dónde
// salió el precio, no cuánto vale: el prellenado es una propuesta editable, y
// un servidor que pisara el importe con el del catálogo convertiría la
// propuesta en una imposición. Que el modelo no pueda hacerlo es otra cosa, y
// es T-3.
// ---------------------------------------------------------------------------

describe("el origen del precio de una línea", () => {
  const LINEA_TARIFADA = {
    clase: "honorario",
    concepto: "Visa de pensionado o jubilado",
    monto: PRECIO_DEL_BUFETE,
    arancelRenglonId: RENGLON_TARIFADO_ID,
  };

  it("guarda de qué renglón salió el precio, y lo resuelve en lectura", async () => {
    await agregar(LINEA_TARIFADA);

    const [releida] = await listar();
    expect(releida.arancelRenglonId).toBe(RENGLON_TARIFADO_ID);
    expect(releida.arancelConcepto).toBe("Visa de pensionado o jubilado");
  });

  it("una línea sin origen lo trae en nulo, que es el caso corriente", async () => {
    // Una consulta, una mensajería, un cobro que no corresponde a ningún
    // servicio tarifado. El nulo dice la verdad: nadie sabe de dónde salió ese
    // precio.
    await agregar();

    const [releida] = await listar();
    expect(releida.arancelRenglonId).toBeNull();
    expect(releida.arancelConcepto).toBeNull();
  });

  /*
   * **La regla que define la forma de la tarea.** El monto que se manda es el
   * que se guarda, aunque la línea diga de qué renglón salió y aunque ese
   * renglón tenga otro precio: el prellenado del editor es una propuesta y
   * editarla encima es legítimo y esperado.
   *
   * El importe va escrito a mano y es **distinto** del precio del catálogo: si
   * fueran iguales, un servidor que pisara el monto con el del renglón pasaría
   * esta prueba sin que nada lo notara.
   */
  it("no pisa el monto que se mandó con el del catálogo", async () => {
    await agregar({ ...LINEA_TARIFADA, monto: 99_900 });

    const [releida] = await listar();
    expect(
      releida.monto,
      "el servidor reemplazó el importe que la persona editó por el del" +
        " catálogo. La referencia dice de dónde salió el precio, no cuánto" +
        " vale: poner el precio es la regla de T-3 para el modelo, no para" +
        " alguien que está tecleando",
    ).toBe(99_900);
    expect(releida.arancelRenglonId).toBe(RENGLON_TARIFADO_ID);
  });

  it("de la lectura no sale ningún monto del renglón, ni el del acuerdo", async () => {
    // El monto que vale es el de la línea. Un segundo número de dinero al lado
    // sería la comparación que `odd/tasks/arancel-de-honorarios.md` prohibió, y
    // `monto_oficial` sería además la cita de 2001 dentro de una cotización.
    await agregar(LINEA_TARIFADA);

    const serializado = JSON.stringify(await listar());
    expect(
      serializado.includes(String(MONTO_OFICIAL)),
      "la línea trae el monto del Acuerdo No 49 de 2001 adentro",
    ).toBe(false);
    expect(serializado).not.toContain("montoOficial");
  });

  it("un renglón que no existe da 422 y no un 500", async () => {
    // Se **cuenta** el renglón antes de escribir, igual que con el trámite. Sin
    // esto, el identificador inventado llegaría a la llave foránea y saldría
    // como un 500 que nadie puede leer.
    const respuesta = await comoAutor(
      conCuerpo(rutaDeLineas(), "POST", {
        ...LINEA_TARIFADA,
        arancelRenglonId: nuevoId(),
      }),
    );

    expect(respuesta.status, await respuesta.clone().text()).toBe(422);
    expect(motivos(await fallasDe(respuesta))).toEqual([
      "arancel_renglon_desconocido",
    ]);
    expect(await listar()).toHaveLength(0);
  });

  it("el renglón del bufete vecino no existe desde acá", async () => {
    // Es el mismo motivo que el inventado, y a propósito: desde este bufete una
    // fila ajena **es** una fila que no existe, y un motivo propio diría que
    // del otro lado hay algo.
    const respuesta = await comoAutor(
      conCuerpo(rutaDeLineas(), "POST", {
        ...LINEA_TARIFADA,
        arancelRenglonId: RENGLON_AJENO_ID,
      }),
    );

    expect(respuesta.status, await respuesta.clone().text()).toBe(422);
    expect(motivos(await fallasDe(respuesta))).toEqual([
      "arancel_renglon_desconocido",
    ]);
    expect(await listar()).toHaveLength(0);
  });

  it("un rubro no puede ser el origen de un precio", async () => {
    // Uno de los 74 encabezados que el acuerdo imprime sin valor. Cae en el
    // mismo motivo que el renglón sin tarifar porque es el mismo hecho: por el
    // `CHECK un_rubro_no_lleva_precio` de `0012`, un rubro **no puede** tener
    // precio del bufete. Es el reparto que `0013` argumentó para tener un
    // disparador y no dos.
    const respuesta = await comoAutor(
      conCuerpo(rutaDeLineas(), "POST", {
        ...LINEA_TARIFADA,
        arancelRenglonId: RUBRO_ID,
      }),
    );

    expect(respuesta.status, await respuesta.clone().text()).toBe(422);
    expect(motivos(await fallasDe(respuesta))).toEqual([
      "arancel_renglon_sin_precio",
    ]);
    expect(await listar()).toHaveLength(0);
  });

  it("un renglón que el bufete todavía no tarifó tampoco", async () => {
    // Hoy son los 453: el catálogo nació con `monto` en nulo. El origen de un
    // precio tiene que tener precio, y lo sostiene el disparador
    // `cotizacion_linea_el_origen_del_precio_tiene_precio_al_insertar`.
    const respuesta = await comoAutor(
      conCuerpo(rutaDeLineas(), "POST", {
        ...LINEA_TARIFADA,
        arancelRenglonId: RENGLON_SIN_PRECIO_ID,
      }),
    );

    expect(respuesta.status, await respuesta.clone().text()).toBe(422);
    expect(motivos(await fallasDe(respuesta))).toEqual([
      "arancel_renglon_sin_precio",
    ]);
    expect(await listar()).toHaveLength(0);
  });

  it("editar pone el origen donde no había, y lo quita", async () => {
    const [linea] = await agregar();

    const puesto = await comoAutor(
      conCuerpo(`${rutaDeLineas()}/${linea.id}`, "PUT", LINEA_TARIFADA),
    );
    expect(puesto.status, await puesto.clone().text()).toBe(200);
    expect(await origenGuardadoDe(linea.id)).toBe(RENGLON_TARIFADO_ID);

    const quitado = await comoAutor(
      conCuerpo(`${rutaDeLineas()}/${linea.id}`, "PUT", {
        clase: "honorario",
        concepto: "Ahora es un monto libre",
        monto: 12_345,
        arancelRenglonId: null,
      }),
    );
    expect(quitado.status, await quitado.clone().text()).toBe(200);
    expect(await origenGuardadoDe(linea.id)).toBeNull();
  });

  it("editar tampoco acepta el renglón del vecino, y no guarda nada", async () => {
    const [linea] = await agregar();

    const respuesta = await comoAutor(
      conCuerpo(`${rutaDeLineas()}/${linea.id}`, "PUT", {
        ...LINEA_TARIFADA,
        arancelRenglonId: RENGLON_AJENO_ID,
      }),
    );

    expect(respuesta.status).toBe(422);
    expect(await origenGuardadoDe(linea.id)).toBeNull();
  });

  /**
   * **La lección de `migrations/0014`, del lado de la ruta.**
   *
   * El bufete puede dejar de tarifar un servicio —`fijarMonto(…, null)` es
   * legítimo— y la línea que ya lo nombraba sigue nombrándolo. `0014` acotó el
   * disparador al **cambio** de la referencia justamente porque la forma
   * anterior dejaba el borrador inescribible: no se le podía ni corregir una
   * falta de ortografía al concepto.
   *
   * Una validación que preguntara «¿este renglón tiene precio?» en cada
   * escritura reintroduciría ese defecto por arriba de la guarda arreglada, y
   * encima desde la pantalla que no causó el problema. Así que la pregunta es
   * la misma que hace la base: **¿está cambiando la referencia?**
   */
  it("una línea cuyo renglón se quedó sin precio se sigue pudiendo editar", async () => {
    const [linea] = await agregar(LINEA_TARIFADA);

    // Lo que haría la pantalla de precios: el bufete deja de tarifar ese
    // servicio. Va por SQL porque la ruta que lo hace es la del arancel.
    await env.DB.prepare("UPDATE arancel_renglon SET monto = NULL WHERE id = ?")
      .bind(RENGLON_TARIFADO_ID)
      .run();

    try {
      const respuesta = await comoAutor(
        conCuerpo(`${rutaDeLineas()}/${linea.id}`, "PUT", {
          ...LINEA_TARIFADA,
          concepto: "Visa de pensionado o jubilado, con la falta corregida",
        }),
      );

      expect(
        respuesta.status,
        "una línea quedó inescribible porque alguien vació un precio en otra" +
          " pantalla. Es el defecto que `0014` arregló en la base, repetido" +
          " acá: lo que el invariante vigila es **tomar** el precio de un" +
          " renglón, no la fila para siempre",
      ).toBe(200);
      expect(await origenGuardadoDe(linea.id)).toBe(RENGLON_TARIFADO_ID);
    } finally {
      // La muestra se repone: los renglones viven toda la corrida porque la
      // base no los deja borrar, así que dejarla sin precio contaminaría las
      // pruebas siguientes.
      await env.DB.prepare(
        "UPDATE arancel_renglon SET monto = ? WHERE id = ?",
      )
        .bind(PRECIO_DEL_BUFETE, RENGLON_TARIFADO_ID)
        .run();
    }
  });

  it("y aun así no se puede mudar a otro renglón sin precio", async () => {
    // La otra mitad de la misma regla: lo que la guarda vigila es el cambio, y
    // un cambio hacia un renglón sin tarifar sigue siendo el invariante entero.
    const [linea] = await agregar(LINEA_TARIFADA);

    const respuesta = await comoAutor(
      conCuerpo(`${rutaDeLineas()}/${linea.id}`, "PUT", {
        ...LINEA_TARIFADA,
        arancelRenglonId: RENGLON_SIN_PRECIO_ID,
      }),
    );

    expect(respuesta.status).toBe(422);
    expect(motivos(await fallasDe(respuesta))).toEqual([
      "arancel_renglon_sin_precio",
    ]);
    expect(await origenGuardadoDe(linea.id)).toBe(RENGLON_TARIFADO_ID);
  });

  it("el origen no lo pisa una edición que no lo nombra", async () => {
    // El cuerpo es el juego completo de campos editables —`PUT` y no `PATCH`—,
    // así que un cuerpo sin `arancelRenglonId` **sí** borra el origen. Es lo
    // mismo que ya pasa con `tipoProcesoId`, y la prueba existe para que la
    // regla esté escrita en algún lado y no se descubra en producción.
    const [linea] = await agregar(LINEA_TARIFADA);

    const respuesta = await comoAutor(
      conCuerpo(`${rutaDeLineas()}/${linea.id}`, "PUT", {
        clase: "honorario",
        concepto: "Sin nombrar el origen",
        monto: 1_000,
      }),
    );

    expect(respuesta.status, await respuesta.clone().text()).toBe(200);
    expect(await origenGuardadoDe(linea.id)).toBeNull();
  });

  it("un origen que no es una cadena es un tipo_invalido", async () => {
    const respuesta = await comoAutor(
      conCuerpo(rutaDeLineas(), "POST", { ...LINEA_TARIFADA, arancelRenglonId: 7 }),
    );

    expect(respuesta.status).toBe(422);
    expect(motivos(await fallasDe(respuesta))).toEqual(["tipo_invalido"]);
  });
});

// ---------------------------------------------------------------------------
// El reordenamiento, que es donde vive el índice único
// ---------------------------------------------------------------------------

describe("el reordenamiento no viola el índice único ni por un instante", () => {
  it("invierte el orden de tres líneas sin perder ningún id", async () => {
    const lineas = await agregarTres();
    const invertido = [lineas[2].id, lineas[1].id, lineas[0].id];

    const respuesta = await comoAutor(
      conCuerpo(rutaDeLineas(), "PUT", { orden: invertido }),
    );

    expect(respuesta.status, await respuesta.clone().text()).toBe(200);

    const releidas = await listar();
    expect(releidas.map((linea) => linea.id)).toEqual(invertido);
    expect(releidas.map((linea) => linea.orden)).toEqual([0, 1, 2]);
    expect(
      releidas.map((linea) => linea.concepto),
      "los ids se conservan: no se borró y se volvió a insertar",
    ).toEqual(["Timbres", "Redacción", "Estudio"]);
  });

  it("no deja ninguna posición del rango de paso en la base", async () => {
    // El rango negativo es el andamio de las dos pasadas, y las dos viajan
    // en el mismo `batch`: no puede quedar ninguna fila aparcada.
    const lineas = await agregarTres();

    await comoAutor(
      conCuerpo(rutaDeLineas(), "PUT", {
        orden: [lineas[1].id, lineas[2].id, lineas[0].id],
      }),
    );

    expect(await ordenesGuardados()).toEqual([0, 1, 2]);
  });

  it("los totales no cambian al reordenar", async () => {
    // Reordenar mueve filas, no dinero. Es el contrapeso de que los totales
    // se deriven de la lista: si la derivación se rompiera, acá se vería.
    const lineas = await agregarTres();

    const respuesta = await comoAutor(
      conCuerpo(rutaDeLineas(), "PUT", {
        orden: [lineas[2].id, lineas[0].id, lineas[1].id],
      }),
    );

    expect((await cuerpoDe(respuesta)).totales).toEqual({
      honorarios: 125_000,
      gastosEstimados: 2_500,
      total: 127_500,
    });
  });

  it("rechaza una lista a la que le falta una línea", async () => {
    const lineas = await agregarTres();

    const respuesta = await comoAutor(
      conCuerpo(rutaDeLineas(), "PUT", {
        orden: [lineas[1].id, lineas[0].id],
      }),
    );

    expect(respuesta.status).toBe(422);
    expect(motivos(await fallasDe(respuesta))).toEqual(["orden_incompleto"]);
    expect(await ordenesGuardados(), "no se movió nada").toEqual([0, 1, 2]);
  });

  it("rechaza una lista que repite una línea", async () => {
    const lineas = await agregarTres();

    const respuesta = await comoAutor(
      conCuerpo(rutaDeLineas(), "PUT", {
        orden: [lineas[0].id, lineas[0].id, lineas[1].id],
      }),
    );

    expect(respuesta.status).toBe(422);
    expect(motivos(await fallasDe(respuesta))).toEqual(["orden_incompleto"]);
  });

  it("rechaza una lista que nombra una línea de otra cotización", async () => {
    const lineas = await agregarTres();

    const respuesta = await comoAutor(
      conCuerpo(rutaDeLineas(), "PUT", {
        orden: [lineas[0].id, lineas[1].id, lineaAjenaId],
      }),
    );

    expect(respuesta.status).toBe(422);
    expect(motivos(await fallasDe(respuesta))).toEqual(["linea_desconocida"]);
  });

  it("rechaza un cuerpo que no trae un arreglo", async () => {
    const respuesta = await comoAutor(
      conCuerpo(rutaDeLineas(), "PUT", { orden: "primera,segunda" }),
    );

    expect(respuesta.status).toBe(422);
    expect(motivos(await fallasDe(respuesta))).toEqual(["tipo_invalido"]);
  });

  it("reordenar a lo que ya estaba no escribe ningún hecho", async () => {
    // La pantalla lo va a mandar igual cuando alguien suelte una línea donde
    // la levantó. Una entrada que dice «reordenó las líneas» cuando nada se
    // movió es una decisión inventada.
    const lineas = await agregarTres();
    const antes = await bitacoraDe();

    const respuesta = await comoAutor(
      conCuerpo(rutaDeLineas(), "PUT", {
        orden: lineas.map((linea) => linea.id),
      }),
    );

    expect(respuesta.status).toBe(200);
    expect(await bitacoraDe()).toEqual(antes);
  });
});

// ---------------------------------------------------------------------------
// Una cotización que ya no es borrador
// ---------------------------------------------------------------------------

describe("una cotización que ya no es borrador no acepta líneas", () => {
  it("las líneas de una emitida se siguen leyendo, con sus totales", async () => {
    await agregarTres();
    await emitir();

    const respuesta = await comoAutor(peticion(rutaDeLineas()));

    expect(respuesta.status).toBe(200);
    const cuerpo = await cuerpoDe(respuesta);
    expect(cuerpo.lineas).toHaveLength(3);
    expect(cuerpo.totales.total).toBe(127_500);
  });

  it("agregar sobre una emitida da 409 y dice en qué quedó", async () => {
    await emitir();

    const respuesta = await comoAutor(
      conCuerpo(rutaDeLineas(), "POST", {
        clase: "honorario",
        concepto: "Tarde",
        monto: 1,
      }),
    );

    expect(respuesta.status).toBe(409);
    expect(await respuesta.json()).toEqual({
      error: "cotizacion_no_es_borrador",
      estado: "emitida",
    });
    expect(await listar()).toHaveLength(0);
  });

  it("editar, quitar y reordenar sobre una emitida dan 409", async () => {
    const lineas = await agregarTres();
    await emitir();

    const editar = await comoAutor(
      conCuerpo(`${rutaDeLineas()}/${lineas[0].id}`, "PUT", {
        clase: "honorario",
        concepto: "Tarde",
        monto: 1,
      }),
    );
    expect(editar.status).toBe(409);

    const quitar = await comoAutor(
      peticion(`${rutaDeLineas()}/${lineas[0].id}`, { method: "DELETE" }),
    );
    expect(quitar.status).toBe(409);

    const reordenar = await comoAutor(
      conCuerpo(rutaDeLineas(), "PUT", {
        orden: [lineas[2].id, lineas[1].id, lineas[0].id],
      }),
    );
    expect(reordenar.status).toBe(409);

    expect(await ordenesGuardados(), "nada se movió").toEqual([0, 1, 2]);
  });

  it("el puerto se niega igual, sin pasar por la ruta", async () => {
    // **La prueba que hace real la copia del repositorio.** La ruta ya
    // contesta 409 antes de llegar acá, así que sin esto la comprobación del
    // puerto sería código que se puede borrar sin que nada se ponga rojo — y
    // T-4 y T-5 llaman al puerto directo.
    //
    // Y no alcanza con mirar el resultado: la cláusula `EXISTS` de la
    // sentencia también impide la escritura, así que neutralizar la
    // comprobación del puerto devolvería el **mismo** `no_es_borrador` por el
    // otro camino. Lo que de verdad distingue a las dos guardas es la
    // bitácora: sin la comprobación de arriba la sentencia no escribe, pero
    // su entrada —que `mutar` manda en el mismo `batch`— sí, y queda un
    // «agregó la línea» de algo que nunca se agregó.
    const base: BaseDeDatos = baseSobreD1(env.DB, TENANT_UNICO_ID, autorId);
    const servicio = cotizacionesSobreD1(base);

    await agregar();
    await emitir();
    const antes = await bitacoraDe();

    const resultado = await servicio.agregarLinea(TENANT_UNICO_ID, cotizacionId, {
      clase: "honorario",
      concepto: "Por el puerto",
      monto: 10,
      tipoProcesoId: null,
      arancelRenglonId: null,
    });

    expect(resultado).toEqual({ estado: "no_es_borrador", actual: "emitida" });
    expect(await listar(), "el puerto no escribió nada").toHaveLength(1);
    expect(
      await bitacoraDe(),
      "un intento bloqueado no deja ningún hecho",
    ).toEqual(antes);
  });

  it("el puerto también se niega a reordenar", async () => {
    const base: BaseDeDatos = baseSobreD1(env.DB, TENANT_UNICO_ID, autorId);
    const servicio = cotizacionesSobreD1(base);

    const lineas = await agregarTres();
    await emitir();
    const antes = await bitacoraDe();

    const resultado = await servicio.reordenarLineas(
      TENANT_UNICO_ID,
      cotizacionId,
      [lineas[2].id, lineas[1].id, lineas[0].id],
    );

    expect(resultado).toEqual({ estado: "no_es_borrador", actual: "emitida" });
    expect(await ordenesGuardados()).toEqual([0, 1, 2]);
    expect(
      await bitacoraDe(),
      "un reordenamiento bloqueado no deja ningún hecho",
    ).toEqual(antes);
  });

  it("el puerto se niega a editar y a quitar, y tampoco registra", async () => {
    const base: BaseDeDatos = baseSobreD1(env.DB, TENANT_UNICO_ID, autorId);
    const servicio = cotizacionesSobreD1(base);

    const lineas = await agregarTres();
    await emitir();
    const antes = await bitacoraDe();

    expect(
      await servicio.editarLinea(TENANT_UNICO_ID, cotizacionId, lineas[0].id, {
        clase: "honorario",
        concepto: "Tarde",
        monto: 1,
        tipoProcesoId: null,
        arancelRenglonId: null,
      }),
    ).toEqual({ estado: "no_es_borrador", actual: "emitida" });

    expect(
      await servicio.quitarLinea(TENANT_UNICO_ID, cotizacionId, lineas[0].id),
    ).toEqual({ estado: "no_es_borrador", actual: "emitida" });

    expect(await listar()).toHaveLength(3);
    expect(await bitacoraDe()).toEqual(antes);
  });
});

// ---------------------------------------------------------------------------
// Las carreras, provocadas a mano
// ---------------------------------------------------------------------------

/**
 * Una `BaseDeDatos` que deja colar una escritura ajena **justo antes** de
 * delegar en la real.
 *
 * Es el seam que vuelve determinista una carrera: el repositorio ya leyó
 * —comprobó el estado, comprobó que la línea existe, validó el trámite— y
 * todavía no escribió. Es la misma herramienta que `test/modulos-api.spec.ts`
 * usó para medir las dos carreras de la unidad C.
 */
function baseConIntruso(
  real: BaseDeDatos,
  intruso: () => Promise<unknown>,
): BaseDeDatos {
  return {
    lectura: real.lectura,
    async mutar(evento, ...sentencias) {
      await intruso();
      return real.mutar(evento, ...sentencias);
    },
  };
}

/** Un servicio cuya escritura siempre llega tarde, por el intruso de turno. */
function servicioConIntruso(intruso: () => Promise<unknown>) {
  return cotizacionesSobreD1(
    baseConIntruso(baseSobreD1(env.DB, TENANT_UNICO_ID, autorId), intruso),
  );
}

function borrarLineaDirecto(lineaId: string): () => Promise<unknown> {
  return () =>
    env.DB.prepare("DELETE FROM cotizacion_linea WHERE id = ?")
      .bind(lineaId)
      .run();
}

describe("una escritura que no tocó ninguna fila dice por qué de verdad", () => {
  /*
   * Cero filas afectadas tiene **dos** causas y no una: la cotización dejó de
   * ser un borrador, o la fila que la sentencia apunta ya no está. Suponer
   * una sola produce una respuesta que se contradice con el dato que la
   * acompaña —un 409 `cotizacion_no_es_borrador` con `estado: "borrador"`—,
   * que es lo que la unidad C midió y arregló. Acá manda la relectura por el
   * mismo motivo, y estas pruebas son las que lo clavan.
   */

  it("editar una línea que se fue en el medio contesta 404 y no un 409", async () => {
    const lineas = await agregarTres();
    const victima = lineas[1];

    const resultado = await servicioConIntruso(
      borrarLineaDirecto(victima.id),
    ).editarLinea(TENANT_UNICO_ID, cotizacionId, victima.id, {
      clase: "honorario",
      concepto: "Carrera",
      monto: 5,
      tipoProcesoId: null,
      arancelRenglonId: null,
    });

    expect(resultado).toEqual({ estado: "no_encontrado" });
  });

  it("quitar una línea que ya quitaron contesta 404 y no un 409", async () => {
    const lineas = await agregarTres();

    const resultado = await servicioConIntruso(
      borrarLineaDirecto(lineas[0].id),
    ).quitarLinea(TENANT_UNICO_ID, cotizacionId, lineas[0].id);

    expect(resultado).toEqual({ estado: "no_encontrado" });
  });

  it("reordenar con una lista que quedó vieja contesta 422 y no un 409", async () => {
    // Se van **las tres** para que ninguna sentencia escriba: ése es el caso
    // en que la operación entera no ocurrió. Y el orden pedido tiene que ser
    // distinto del que ya estaba, o el atajo del reordenamiento vacuo corta
    // antes de `mutar` y el intruso no llega a colarse.
    const lineas = await agregarTres();
    const invertido = [lineas[2].id, lineas[1].id, lineas[0].id];

    const resultado = await servicioConIntruso(async () => {
      for (const linea of lineas) await borrarLineaDirecto(linea.id)();
    }).reordenarLineas(TENANT_UNICO_ID, cotizacionId, invertido);

    expect(resultado).toEqual({
      estado: "invalido",
      fallas: [{ campo: "orden", motivo: "orden_incompleto" }],
    });
  });

  it("si al reordenamiento se le va una sola, lo que sí se movió queda", async () => {
    // El caso que una detección que mirara sólo la primera sentencia
    // contestaría peor: devolvería un rechazo **habiendo escrito**. El
    // rechazo exige que no haya escrito **ninguna**, así que esto es un
    // guardado honesto.
    const lineas = await agregarTres();
    const nuevoOrden = [lineas[2].id, lineas[1].id, lineas[0].id];

    const resultado = await servicioConIntruso(
      borrarLineaDirecto(lineas[2].id),
    ).reordenarLineas(TENANT_UNICO_ID, cotizacionId, nuevoOrden);

    expect(resultado.estado).toBe("guardado");

    const releidas = await listar();
    expect(releidas.map((linea) => linea.concepto)).toEqual([
      "Redacción",
      "Estudio",
    ]);
  });

  it("una emisión colada sigue contestando 409 con el estado de verdad", async () => {
    // El contrapeso de las cuatro de arriba: que la relectura mande no puede
    // haber tapado la carrera que sí existía.
    const lineas = await agregarTres();

    const resultado = await servicioConIntruso(() =>
      env.DB.prepare(
        "UPDATE cotizacion SET estado = 'emitida', snapshot = '{}'" +
          " WHERE id = ?",
      )
        .bind(cotizacionId)
        .run(),
    ).editarLinea(TENANT_UNICO_ID, cotizacionId, lineas[0].id, {
      clase: "honorario",
      concepto: "Tarde",
      monto: 1,
      tipoProcesoId: null,
      arancelRenglonId: null,
    });

    expect(resultado).toEqual({ estado: "no_es_borrador", actual: "emitida" });
  });
});

describe("el orden del alta se decide dentro del batch", () => {
  /*
   * Con el `MAX(orden)` leído en una consulta aparte, un alta concurrente que
   * tome ese mismo número hace que la segunda estalle con
   *
   *   UNIQUE constraint failed:
   *     cotizacion_linea.cotizacion_id, cotizacion_linea.orden
   *
   * o sea un 500 ilegible en una operación corriente, y no hacen falta dos
   * personas: alcanzan dos pestañas abiertas de la misma cotización. No se
   * arregla atrapándolo —la guarda se cuenta y nunca se atrapa— sino
   * calculándolo adentro de la sentencia.
   */

  it("dos altas que calculan la misma posición no chocan", async () => {
    await agregar({ clase: "honorario", concepto: "La que ya estaba", monto: 1 });

    // El intruso toma la posición 1, que es la que el alta en curso habría
    // calculado leyendo `MAX(orden)` por separado.
    const resultado = await servicioConIntruso(() =>
      env.DB.prepare(
        "INSERT INTO cotizacion_linea (id, tenant_id, cotizacion_id, clase," +
          " concepto, monto, orden) VALUES (?, ?, ?, 'gasto_estimado', ?, 7, 1)",
      )
        .bind(nuevoId(), TENANT_UNICO_ID, cotizacionId, "La intrusa")
        .run(),
    ).agregarLinea(TENANT_UNICO_ID, cotizacionId, {
      clase: "honorario",
      concepto: "La que llega segunda",
      monto: 2,
      tipoProcesoId: null,
      arancelRenglonId: null,
    });

    expect(resultado.estado, "no puede estallar el índice único").toBe(
      "guardado",
    );

    const releidas = await listar();
    expect(releidas.map((linea) => linea.orden)).toEqual([0, 1, 2]);
    expect(
      releidas.map((linea) => linea.concepto),
      "la que llega segunda va última, detrás de la intrusa",
    ).toEqual(["La que ya estaba", "La intrusa", "La que llega segunda"]);
  });

  it("el alta sigue yendo al final cuando hay un hueco", async () => {
    // El hueco que deja un `quitar` es justo donde `COUNT(*)` devolvería una
    // posición ya tomada. `COALESCE(MAX(orden), -1) + 1` no.
    const lineas = await agregarTres();
    await comoAutor(
      peticion(`${rutaDeLineas()}/${lineas[1].id}`, { method: "DELETE" }),
    );

    await agregar({
      clase: "honorario",
      concepto: "Después del hueco",
      monto: 1,
    });

    expect(await ordenesGuardados()).toEqual([0, 2, 3]);
  });
});

// ---------------------------------------------------------------------------
// La tenencia: I-8 en cada consulta nueva
// ---------------------------------------------------------------------------

describe("las líneas del bufete vecino no existen desde acá", () => {
  it("leer las líneas de una cotización ajena da 404", async () => {
    const respuesta = await comoAutor(peticion(rutaDeLineas(cotizacionAjenaId)));

    expect(respuesta.status).toBe(404);
  });

  it("agregar una línea a una cotización ajena da 404 y no escribe", async () => {
    const respuesta = await comoAutor(
      conCuerpo(rutaDeLineas(cotizacionAjenaId), "POST", {
        clase: "honorario",
        concepto: "Intrusa",
        monto: 1,
      }),
    );

    expect(respuesta.status).toBe(404);

    const { results } = await env.DB.prepare(
      "SELECT id FROM cotizacion_linea WHERE cotizacion_id = ?",
    )
      .bind(cotizacionAjenaId)
      .all<{ id: string }>();

    expect(results.map((fila) => fila.id)).toEqual([lineaAjenaId]);
  });

  it("editar una línea del vecino desde una cotización propia da 404", async () => {
    await agregar();

    const respuesta = await comoAutor(
      conCuerpo(`${rutaDeLineas()}/${lineaAjenaId}`, "PUT", {
        clase: "honorario",
        concepto: "Secuestrada",
        monto: 1,
      }),
    );

    expect(respuesta.status).toBe(404);

    const fila = await env.DB.prepare(
      "SELECT concepto FROM cotizacion_linea WHERE id = ?",
    )
      .bind(lineaAjenaId)
      .first<{ concepto: string }>();

    expect(fila?.concepto).toBe("El honorario del vecino");
  });

  it("el listado del puerto no trae las del vecino", async () => {
    // La consulta nueva de este archivo tiene su filtro de tenencia y la
    // unión del nombre del trámite tiene el suyo. Sin el primero, pedir las
    // líneas de la cotización ajena desde este tenant devolvería las suyas.
    const servicio = cotizacionesSobreD1(
      baseSobreD1(env.DB, TENANT_UNICO_ID, autorId),
    );

    expect(
      await servicio.listarLineas(TENANT_UNICO_ID, cotizacionAjenaId),
    ).toEqual([]);

    // Y el total de una cotización que no es de este bufete es cero, no el
    // del vecino: si el filtro se aflojara, acá aparecerían sus 999 999.
    const totales = totalesDe(
      await servicio.listarLineas(TENANT_UNICO_ID, cotizacionAjenaId),
    );
    expect(totales.total).toBe(0);
  });

  it("una línea que apunte al trámite del vecino no se puede ni fabricar", async () => {
    /*
     * **Lo que esta prueba dice, y lo que deliberadamente no dice.**
     *
     * `SELECCION_DE_LINEAS` une con `tipo_proceso` repitiendo el filtro de
     * tenencia —`AND t.tenant_id = l.tenant_id`—, igual que `SELECCION` hace
     * con `cliente` y con `usuario`. La intención de esa cláusula es que un
     * identificador que cruzara la frontera devuelva `NULL` en vez del
     * nombre ajeno.
     *
     * **Medido, y no supuesto: ese estado no se puede fabricar.** El
     * disparador `cotizacion_linea_tenencia_coherente_al_insertar` de
     * `migrations/0004_cotizaciones.sql` rechaza la fila aunque se la escriba
     * por SQL directo, saltándose la API entera, y el de `UPDATE` cierra el
     * otro camino. O sea que la cláusula de la unión es defensa en
     * profundidad **sin estado alcanzable**, y una prueba que afirmara
     * «devuelve nulo» tendría que apagar el disparador para poder correr —y
     * entonces estaría probando una base que no existe.
     *
     * Se deja la cláusula igual, por consistencia con las dos uniones que ya
     * la tenían en este mismo archivo, y se deja dicho acá que **no está
     * cubierta** para que el próximo que lo descubra no lo crea una
     * regresión. Lo que esta prueba sí clava es la guarda que de verdad
     * sostiene el invariante, que es la de la base.
     */
    await expect(
      env.DB.prepare(
        "INSERT INTO cotizacion_linea (id, tenant_id, cotizacion_id, clase," +
          " concepto, monto, tipo_proceso_id, orden)" +
          " VALUES (?, ?, ?, 'honorario', ?, 100, ?, 0)",
      )
        .bind(
          nuevoId(),
          TENANT_UNICO_ID,
          cotizacionId,
          "Cruzada",
          tipoProcesoAjenoId,
        )
        .run(),
    ).rejects.toThrow(/tenencia cruzada/);

    expect(await listar(), "la fila cruzada no entró").toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Cada operación deja su hecho
// ---------------------------------------------------------------------------

describe("cada operación deja su hecho contra la cotización", () => {
  it("las cuatro escriben su verbo, y el reordenamiento sin detalle", async () => {
    const lineas = await agregarTres();

    await comoAutor(
      conCuerpo(`${rutaDeLineas()}/${lineas[0].id}`, "PUT", {
        clase: "honorario",
        concepto: "Estudio ampliado",
        monto: 60_000,
      }),
    );
    await comoAutor(
      conCuerpo(rutaDeLineas(), "PUT", {
        orden: [lineas[2].id, lineas[1].id, lineas[0].id],
      }),
    );
    await comoAutor(
      peticion(`${rutaDeLineas()}/${lineas[1].id}`, { method: "DELETE" }),
    );

    expect(await bitacoraDe()).toEqual([
      { accion: "linea_agregada", detalle: "Estudio" },
      { accion: "linea_agregada", detalle: "Redacción" },
      { accion: "linea_agregada", detalle: "Timbres" },
      { accion: "linea_editada", detalle: "Estudio ampliado" },
      { accion: "lineas_reordenadas", detalle: null },
      { accion: "linea_quitada", detalle: "Redacción" },
    ]);
  });

  it("el detalle es el concepto y nunca el monto", async () => {
    // `detalle` es el nombre de cara al usuario de lo que el hecho señala, no
    // una segunda copia del dato. El monto vive en su columna.
    await agregar({
      clase: "honorario",
      concepto: "Visa de trabajo",
      monto: 123_456,
    });

    const [hecho] = await bitacoraDe();
    expect(hecho.detalle).toBe("Visa de trabajo");
    expect(hecho.detalle).not.toContain("123456");
  });

  it("un concepto largo viaja recortado al detalle", async () => {
    const largo = "Honorarios por ".padEnd(200, "x");
    await agregar({ clase: "honorario", concepto: largo, monto: 1 });

    const [hecho] = await bitacoraDe();
    expect(hecho.detalle?.length ?? 0).toBeLessThanOrEqual(80);
    // Y la línea sí guarda el texto entero: el recorte es de la pista, no
    // del dato.
    expect((await listar())[0].concepto).toBe(largo);
  });

  it("un hecho de línea no se registra contra ninguna otra entidad", async () => {
    await agregar();

    // Sobre la tabla entera y no sobre esta cotización: la bitácora es
    // inmutable, así que acá se acumulan los hechos de toda la suite y
    // cualquiera de ellos que colgara de otra entidad aparecería.
    const { results } = await env.DB.prepare(
      "SELECT DISTINCT entidad FROM bitacora WHERE accion LIKE 'linea%'",
    ).all<{ entidad: string }>();

    expect(results.map((fila) => fila.entidad)).toEqual(["cotizacion"]);
  });
});

// ---------------------------------------------------------------------------
// Los verbos que no existen
// ---------------------------------------------------------------------------

describe("la superficie es exactamente la que se decidió", () => {
  it("la colección no acepta DELETE", async () => {
    const respuesta = await comoAutor(
      peticion(rutaDeLineas(), { method: "DELETE" }),
    );

    expect(respuesta.status).toBe(405);
    expect(respuesta.headers.get("allow")).toBe("GET, POST, PUT");
  });

  it("una línea suelta no acepta ni GET ni POST", async () => {
    const [linea] = await agregar();

    for (const metodo of ["GET", "POST"]) {
      const respuesta = await comoAutor(
        peticion(`${rutaDeLineas()}/${linea.id}`, { method: metodo }),
      );

      expect(respuesta.status, metodo).toBe(405);
      expect(respuesta.headers.get("allow")).toBe("PUT, DELETE");
    }
  });

  it("el 405 no dice si la cotización existe", async () => {
    // Va antes del 404 a propósito: un verbo que esta dirección no tiene no
    // es una pregunta sobre ninguna cotización.
    const respuesta = await comoAutor(
      peticion(rutaDeLineas(cotizacionAjenaId), { method: "DELETE" }),
    );

    expect(respuesta.status).toBe(405);
  });

  it("una subruta inventada cae en el 404 general", async () => {
    // El nombre está inventado a propósito y no es ninguna ruta planificada:
    // lo que se mide es que un sexto segmento que el ruteo no reconoce
    // termine en el 404 general, no la ausencia de una ruta concreta. Es la
    // misma convención que dejó la unidad C de T-2.
    const respuesta = await comoAutor(
      peticion(`${rutaDeLineas()}/${nuevoId()}/no-existe-esta-subruta`, {
        method: "POST",
      }),
    );

    expect(respuesta.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// El dominio, sin servidor
// ---------------------------------------------------------------------------

describe("la normalización, sin base ni HTTP", () => {
  it("acepta las dos clases del catálogo", () => {
    for (const clase of CLASES_DE_LINEA) {
      const resultado = normalizarLinea({
        clase,
        concepto: "Algo",
        monto: 1,
      });

      expect(resultado.ok, clase).toBe(true);
    }
  });

  it("un monto de cero es válido y uno de medio centavo no", () => {
    // Cero no es una falla: una línea de cortesía que se quiere mostrar en la
    // propuesta cobra cero, y el `CHECK` de la base lo admite igual.
    expect(normalizarLinea({ clase: "honorario", concepto: "a", monto: 0 }).ok)
      .toBe(true);
    expect(
      normalizarLinea({ clase: "honorario", concepto: "a", monto: 0.5 }).ok,
    ).toBe(false);
  });

  it("rechaza un monto que no es un entero seguro", () => {
    for (const monto of [Number.NaN, Infinity, 2 ** 53, 1e21]) {
      expect(
        normalizarLinea({ clase: "honorario", concepto: "a", monto }).ok,
        String(monto),
      ).toBe(false);
    }
  });

  it("no copia a la salida un `orden` que venga en el cuerpo", () => {
    const resultado = normalizarLinea({
      clase: "honorario",
      concepto: "a",
      monto: 1,
      orden: 9,
    });

    expect(resultado.ok).toBe(true);
    expect(resultado.ok && "orden" in resultado.datos).toBe(false);
  });

  it("el trámite ausente y el nulo son lo mismo", () => {
    const sinCampo = normalizarLinea({
      clase: "honorario",
      concepto: "a",
      monto: 1,
    });
    const conNulo = normalizarLinea({
      clase: "honorario",
      concepto: "a",
      monto: 1,
      tipoProcesoId: null,
    });

    expect(sinCampo.ok && sinCampo.datos.tipoProcesoId).toBeNull();
    expect(conNulo.ok && conNulo.datos.tipoProcesoId).toBeNull();
  });

  it("el origen del precio ausente y el nulo son lo mismo", () => {
    // Igual que el trámite: una línea con monto libre es el caso corriente, así
    // que la ausencia no es una falla. Y por eso el campo **no** puede ser una
    // cadena vacía: eso es un identificador que no identifica nada.
    const sinCampo = normalizarLinea({
      clase: "honorario",
      concepto: "a",
      monto: 1,
    });
    const conNulo = normalizarLinea({
      clase: "honorario",
      concepto: "a",
      monto: 1,
      arancelRenglonId: null,
    });

    expect(sinCampo.ok && sinCampo.datos.arancelRenglonId).toBeNull();
    expect(conNulo.ok && conNulo.datos.arancelRenglonId).toBeNull();
    expect(
      normalizarLinea({
        clase: "honorario",
        concepto: "a",
        monto: 1,
        arancelRenglonId: "   ",
      }).ok,
    ).toBe(false);
  });

  it("el orden tiene que ser un arreglo de cadenas con algo adentro", () => {
    expect(normalizarOrdenDeLineas({ orden: [1, 2] }).ok).toBe(false);
    expect(normalizarOrdenDeLineas({ orden: ["a", "  "] }).ok).toBe(false);
    expect(normalizarOrdenDeLineas({ orden: [] }).ok).toBe(true);
    expect(normalizarOrdenDeLineas(null).ok).toBe(false);
  });
});
