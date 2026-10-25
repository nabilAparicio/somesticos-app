/**
 * Los gastos reales de un proceso y sus comprobantes
 * (`odd/tasks/cotizaciones.md`, T-10). Abre R5, la rebanada del dinero.
 *
 * Las cinco cosas que esta suite existe para fijar:
 *
 *  1. **El saldo no se puede guardar.** No hay columna de saldo en
 *     `movimiento_gasto` ni en ninguna otra tabla de esta base, y hay una
 *     prueba que recorre el esquema vivo para exigirlo. I-7 no se implementa
 *     con una restricción: se implementa no declarando la columna, y una
 *     ausencia sin su aserción es una omisión que el próximo completa.
 *  2. **La resta es con enteros, y hay un caso donde eso cambia el número.**
 *     Con un anticipo de 160 238 centavos contra tres gastos que suman lo
 *     mismo, la cuenta entera da exactamente cero y la cuenta en dólares da
 *     5,68 × 10⁻¹⁴. Una pantalla que pregunta `saldo === 0` para decir «al
 *     día» diría que no lo está.
 *  3. **Las dos mecánicas del bufete salen de la misma tabla sin una rama.**
 *     El reembolso contra factura es el proceso que sólo tiene filas `gasto`;
 *     el anticipo con sobrante es el que tiene de los dos. La misma función
 *     contesta las dos, y la prueba lo mide sobre la misma función.
 *  4. **La llave del comprobante la fabrica el sistema**, y la base lo exige
 *     con un `CHECK` que compara columnas de la propia fila. Probado por
 *     rechazo: una llave elegida por quien sube no entra.
 *  5. **Nada de esto llama a la red.** El almacén de objetos se inyecta por el
 *     mismo camino que usa producción, igual que el modelo en T-8. La rama
 *     del binding ausente se ejerce con el almacén **real**, que es la única
 *     forma de medir que un despliegue sin bucket sigue sirviendo todo lo
 *     demás.
 *
 * Y la disciplina de siempre: **los invariantes se prueban por rechazo**, y
 * **las guardas se cuentan, nunca se atrapan**. No hay un solo `try/catch`
 * alrededor de un error de la base en el código bajo prueba, y por eso cada
 * guarda de la migración tiene acá su rechazo con el nombre de su
 * restricción.
 */
import { env } from "cloudflare:workers";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { MovimientoDeGasto, RespuestaDeGastos } from "../worker/contract";
import { baseSobreD1 } from "../worker/db/base";
import { TENANT_UNICO_ID, nuevoId } from "../worker/db/ids";
import { diaEnPanama, finDelDiaEnPanama, hoyEnPanama } from "../worker/db/momentos";
import {
  llaveDeComprobante,
  saldoDe,
  TIPOS_DE_MOVIMIENTO,
  TOPE_DEL_COMPROBANTE,
} from "../worker/gastos/dominio";
import {
  gastosSobreD1,
  type AlmacenDeComprobantes,
  type ComprobanteGuardado,
  type ResultadoDelAlmacen,
} from "../worker/gastos/repositorio";
import { manejar } from "../worker/index";
import type { ServicioDeProcesos } from "../worker/procesos/repositorio";
import type { ServicioDeGastos } from "../worker/gastos/repositorio";

const DOMINIO_DE_ACCESS = "https://bufete-de-prueba.cloudflareaccess.com";
const AUD = "aud-de-la-aplicacion-del-bufete";

const EMAIL_AUTOR = "itzel@gastos.test";
const EMAIL_SOCIO = "ricardo@gastos.test";

/**
 * El caso que separa la aritmética entera de la ingenua.
 *
 * Un anticipo de 1 602,38 dólares contra tres gastos de 587,95, 575,39 y
 * 439,04: la cuenta está **exactamente saldada**. En centavos enteros da
 * cero; en dólares de coma flotante da 5,684341886080802 × 10⁻¹⁴, que no es
 * cero y no se puede comparar con cero.
 *
 * Los números no son redondos a propósito: con montos redondos las dos
 * aritméticas coinciden y la prueba no mediría nada. Y están calculados
 * **aparte de la función que se prueba** —se escriben como literales y el
 * resultado esperado también—, que es la restricción 6 de la tajada: nunca
 * calcular el valor esperado con la misma función que se prueba.
 */
const ANTICIPO_QUE_SALDA = 160_238;
const GASTOS_QUE_SALDAN = [58_795, 57_539, 43_904] as const;

interface FallaEnElCable {
  campo: string;
  motivo: string;
}

/** El tenant vecino. Existe sólo para que la fuga sea expresable. */
let OTRO_TENANT_ID: string;

let autorId: string;
let socioId: string;
let usuarioAjenoId: string;
let clienteId: string;
let clienteAjenoId: string;
let areaId: string;
let tipoProcesoId: string;
let tipoAjenoId: string;
let areaAjenaId: string;
let procesoId: string;
let procesoAjenoId: string;

function entorno(): Env {
  // Hermético: un `.dev.vars` local con `ACCESO_DEV_EMAIL` no puede decidir
  // qué identidad observa la suite. Y `COMPROBANTES` no está en
  // `wrangler.jsonc`, así que `env` llega sin el binding — que es
  // exactamente la condición del despliegue de hoy.
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

/* ==========================================================================
   El almacén falso, que es la única forma de probar esto sin llamar a R2
   ========================================================================== */

interface AlmacenEspia extends AlmacenDeComprobantes {
  /** Lo que quedó guardado, por llave. */
  readonly objetos: Map<string, { bytes: Uint8Array; tipo: string }>;
  /** Las llaves que se mandaron borrar, en orden. */
  readonly borrados: string[];
}

/**
 * Un almacén en memoria con la misma forma que el de R2.
 *
 * Se inyecta por el **mismo camino que usa producción**
 * —`dependencias.comprobantes`, igual que `dependencias.modelo` en T-8—, así
 * que lo único que cambia entre esta corrida y una desplegada es quién
 * construyó el objeto. Ninguna prueba de este archivo toca la red.
 */
function almacenEnMemoria(): AlmacenEspia {
  const objetos = new Map<string, { bytes: Uint8Array; tipo: string }>();
  const borrados: string[] = [];

  return {
    objetos,
    borrados,
    guardar(llave, cuerpo, tipoDeContenido) {
      objetos.set(llave, {
        bytes: new Uint8Array(cuerpo),
        tipo: tipoDeContenido,
      });
      return Promise.resolve({ ok: true, valor: undefined });
    },
    leer(llave) {
      const guardado = objetos.get(llave);
      const valor: ComprobanteGuardado | null =
        guardado === undefined
          ? null
          : {
              cuerpo: new Response(guardado.bytes).body as ReadableStream,
              tipoDeContenido: guardado.tipo,
            };
      return Promise.resolve({ ok: true, valor });
    },
    borrar(llave) {
      borrados.push(llave);
      objetos.delete(llave);
      return Promise.resolve({ ok: true, valor: undefined });
    },
  };
}

/** El almacén que está configurado y no contesta. */
function almacenCaido(): AlmacenDeComprobantes {
  const caido = <T>(): Promise<ResultadoDelAlmacen<T>> =>
    Promise.resolve({ ok: false, motivo: "almacen_no_disponible" });

  return { guardar: caido, leer: caido, borrar: caido };
}

/* ==========================================================================
   Las peticiones
   ========================================================================== */

let almacen: AlmacenEspia;

function comoAutor(request: Request): Promise<Response> {
  return manejar(request, entorno(), {
    correoDeDesarrollo: () => EMAIL_AUTOR,
    comprobantes: almacen,
  });
}

function comoSocio(request: Request): Promise<Response> {
  return manejar(request, entorno(), {
    correoDeDesarrollo: () => EMAIL_SOCIO,
    comprobantes: almacen,
  });
}

function conAlmacen(
  request: Request,
  sustituto: AlmacenDeComprobantes,
): Promise<Response> {
  return manejar(request, entorno(), {
    correoDeDesarrollo: () => EMAIL_AUTOR,
    comprobantes: sustituto,
  });
}

/**
 * Sin almacén sustituido: el Worker resuelve `almacenSobreR2(env)` y `env` no
 * trae el binding. Es el camino de producción de un despliegue sin bucket.
 */
function sinBindingDeAlmacen(request: Request): Promise<Response> {
  return manejar(request, entorno(), {
    correoDeDesarrollo: () => EMAIL_AUTOR,
  });
}

function sinIdentidad(
  request: Request,
  espias: { gastos?: ServicioDeGastos; procesos?: ServicioDeProcesos },
): Promise<Response> {
  return manejar(request, entorno(), {
    correoDeDesarrollo: () => null,
    comprobantes: almacen,
    ...espias,
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

function registrar(cuerpo: unknown, proceso = procesoId): Promise<Response> {
  return comoAutor(conCuerpo(`/api/procesos/${proceso}/gastos`, "POST", cuerpo));
}

async function cuentaDe(proceso = procesoId): Promise<RespuestaDeGastos> {
  const respuesta = await comoAutor(peticion(`/api/procesos/${proceso}/gastos`));
  expect(respuesta.status).toBe(200);
  return (await respuesta.json()) as RespuestaDeGastos;
}

/** Carga un movimiento por la API y devuelve su identificador. */
async function cargar(
  tipo: "gasto" | "anticipo",
  monto: number,
  concepto: string,
  fecha?: string,
): Promise<string> {
  const antes = (await cuentaDe()).movimientos.map((m) => m.id);
  const respuesta = await registrar(
    fecha === undefined
      ? { tipo, monto, concepto }
      : { tipo, monto, concepto, fecha },
  );
  expect(respuesta.status).toBe(201);

  const cuenta = (await respuesta.json()) as RespuestaDeGastos;
  const nuevo = cuenta.movimientos.find((m) => !antes.includes(m.id));
  expect(nuevo, "el alta tiene que devolver la cuenta con el movimiento nuevo")
    .toBeDefined();
  return (nuevo as MovimientoDeGasto).id;
}

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);

function subirComprobante(
  movimientoId: string,
  bytes: Uint8Array = PDF,
  tipo = "application/pdf",
  quien: (request: Request) => Promise<Response> = comoAutor,
): Promise<Response> {
  return quien(
    peticion(`/api/procesos/${procesoId}/gastos/${movimientoId}/comprobante`, {
      method: "PUT",
      headers: { "content-type": tipo },
      body: bytes,
    }),
  );
}

/* ==========================================================================
   Las inserciones crudas, para probar el esquema por rechazo
   ========================================================================== */

type Fila = Record<string, string | number | null>;

function filaValida(extra: Fila = {}): Fila {
  return {
    id: nuevoId(),
    tenant_id: TENANT_UNICO_ID,
    proceso_id: procesoId,
    fecha: finDelDiaEnPanama("2026-03-15"),
    concepto: "Timbres y tasas del Registro Público",
    monto: 12_500,
    tipo: "gasto",
    comprobante_key: null,
    usuario_id: autorId,
    registrado_en: new Date().toISOString(),
    ...extra,
  };
}

function insertar(fila: Fila): Promise<D1Result> {
  const columnas = Object.keys(fila);
  return env.DB.prepare(
    `INSERT INTO movimiento_gasto (${columnas.join(", ")})` +
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
  socioId = nuevoId();

  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO usuario (id, tenant_id, nombre, email, activo)" +
        " VALUES (?, ?, ?, ?, 1)",
    ).bind(autorId, TENANT_UNICO_ID, "Itzel", EMAIL_AUTOR),
    env.DB.prepare(
      "INSERT INTO usuario (id, tenant_id, nombre, email, activo)" +
        " VALUES (?, ?, ?, ?, 1)",
    ).bind(socioId, TENANT_UNICO_ID, "Ricardo", EMAIL_SOCIO),
  ]);
});

/**
 * Cada prueba estrena identificadores, incluido el del tenant vecino.
 *
 * No se limpia con `DELETE FROM`, por lo mismo que la suite de notas: la
 * bitácora no se puede borrar —`bitacora_no_se_borra`, sin condición— y los
 * movimientos de una prueba anterior son inalcanzables para la siguiente
 * porque cuelgan de otro proceso. Toda afirmación de conteo va acotada a su
 * proceso.
 */
beforeEach(async () => {
  OTRO_TENANT_ID = nuevoId();
  usuarioAjenoId = nuevoId();
  clienteId = nuevoId();
  clienteAjenoId = nuevoId();
  areaId = nuevoId();
  tipoProcesoId = nuevoId();
  tipoAjenoId = nuevoId();
  areaAjenaId = nuevoId();
  procesoId = nuevoId();
  procesoAjenoId = nuevoId();

  almacen = almacenEnMemoria();

  const ahora = new Date().toISOString();

  await env.DB.batch([
    env.DB.prepare("INSERT INTO tenant (id, nombre) VALUES (?, ?)").bind(
      OTRO_TENANT_ID,
      "Otro bufete",
    ),
    env.DB.prepare(
      "INSERT INTO usuario (id, tenant_id, nombre, email, activo)" +
        " VALUES (?, ?, ?, ?, 1)",
    ).bind(usuarioAjenoId, OTRO_TENANT_ID, "Ajena", `ajena-${usuarioAjenoId}@otro.test`),

    env.DB.prepare(
      "INSERT INTO cliente (id, tenant_id, nombre, telefono, creado_por," +
        " creado_en) VALUES (?, ?, ?, ?, ?, ?)",
    ).bind(clienteId, TENANT_UNICO_ID, "Marta Quintero", "+507 6000-0000", autorId, ahora),
    env.DB.prepare(
      "INSERT INTO area (id, tenant_id, nombre, activo) VALUES (?, ?, ?, 1)",
    ).bind(areaId, TENANT_UNICO_ID, `Migración ${areaId}`),
    env.DB.prepare(
      "INSERT INTO tipo_proceso (id, tenant_id, area_id, nombre, activo)" +
        " VALUES (?, ?, ?, ?, 1)",
    ).bind(tipoProcesoId, TENANT_UNICO_ID, areaId, `Residencia permanente ${tipoProcesoId}`),
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
  ]);
});

/* ==========================================================================
   I-7 · El saldo no se puede guardar
   ========================================================================== */

describe("I-7 · el saldo nunca se almacena", () => {
  /**
   * **La prueba que hace imposible y no improbable.**
   *
   * No mira `movimiento_gasto`: recorre **el esquema entero**, tabla por
   * tabla y columna por columna. Una columna de saldo en `proceso` o en
   * `cotizacion` rompería I-7 exactamente igual que una en
   * `movimiento_gasto`, y una prueba acotada a la tabla nueva no la vería.
   *
   * La expresión cubre también los nombres con los que alguien escribiría lo
   * mismo sin llamarlo saldo —`acumulado`, `balance`, `total_a_la_fecha`—,
   * porque lo que I-7 prohíbe no es la palabra sino el segundo número.
   */
  it("ninguna columna de ninguna tabla guarda un saldo", async () => {
    const tablas = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table'" +
        " AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'" +
        " ORDER BY name",
    ).all<{ name: string }>();

    // La aserción de presencia al lado de la de ausencia: sin ella, un
    // `sqlite_master` vacío haría pasar la prueba sin mirar nada.
    expect(tablas.results.length).toBeGreaterThan(5);

    const prohibido = /saldo|balance|acumulad|a_la_fecha/i;
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
      "I-7: el saldo se deriva, no se guarda. Si hace falta esta columna," +
        " lo que hay que discutir es el invariante y no la prueba",
    ).toEqual([]);
  });

  it("movimiento_gasto tiene exactamente estas columnas y ninguna más", async () => {
    // La lista va exacta y no por `toContain`: una columna de más es
    // justamente la forma en que un total guardado entraría sin llamarse
    // saldo, y esta prueba es la que la haría notar.
    const columnas = await env.DB.prepare(
      "SELECT name FROM pragma_table_info('movimiento_gasto')",
    ).all<{ name: string }>();

    expect(columnas.results.map((fila) => fila.name)).toEqual([
      "id",
      "tenant_id",
      "proceso_id",
      "fecha",
      "concepto",
      "monto",
      "tipo",
      "comprobante_key",
      "usuario_id",
      "registrado_en",
    ]);
  });

  it("el saldo que devuelve la API cambia con las filas, porque sale de ellas", async () => {
    // El contrapeso de las dos de arriba: que no haya dónde guardarlo sería
    // una garantía vacía si el número no se recalculara. Tres lecturas, tres
    // números, y ninguna escritura de saldo en el medio.
    expect((await cuentaDe()).saldo).toEqual({
      anticipos: 0,
      gastos: 0,
      saldo: 0,
    });

    await cargar("anticipo", 50_000, "Anticipo para gastos de trámite");
    expect((await cuentaDe()).saldo).toEqual({
      anticipos: 50_000,
      gastos: 0,
      saldo: 50_000,
    });

    await cargar("gasto", 12_500, "Timbres del Registro Público");
    expect((await cuentaDe()).saldo).toEqual({
      anticipos: 50_000,
      gastos: 12_500,
      saldo: 37_500,
    });
  });
});

/* ==========================================================================
   La aritmética, sobre la función que la hace
   ========================================================================== */

describe("saldoDe · Σ anticipos − Σ gastos", () => {
  it("una cuenta sin movimientos da cero en los tres, sin rama especial", () => {
    expect(saldoDe([])).toEqual({ anticipos: 0, gastos: 0, saldo: 0 });
  });

  it("reembolso contra factura: sólo gastos, y el saldo es lo que el cliente debe", () => {
    // La primera de las dos mecánicas del bufete. No hay anticipos: `Σ
    // anticipos` vale cero y la resta sigue siendo la misma resta.
    const cuenta = saldoDe([
      { tipo: "gasto", monto: 12_500 },
      { tipo: "gasto", monto: 7_500 },
    ]);

    expect(cuenta).toEqual({ anticipos: 0, gastos: 20_000, saldo: -20_000 });
  });

  it("anticipo con sobrante: las dos familias, y el saldo es lo que le sobra", () => {
    // La segunda mecánica, **por la misma función y sin una sola rama que
    // las distinga**. Lo que cambia es qué filas hay, no qué código corre.
    const cuenta = saldoDe([
      { tipo: "anticipo", monto: 50_000 },
      { tipo: "gasto", monto: 12_500 },
      { tipo: "gasto", monto: 7_500 },
    ]);

    expect(cuenta).toEqual({ anticipos: 50_000, gastos: 20_000, saldo: 30_000 });
  });

  /**
   * **El caso donde la aritmética ingenua da otro número.**
   *
   * Los dos caminos ingenuos que alguien escribiría se miden acá al lado del
   * bueno, y los dos dan otra cosa:
   *
   *  - sumar todo sin mirar el tipo da 320 476, que es el doble del anticipo;
   *  - hacer la misma resta en dólares da 5,68 × 10⁻¹⁴, que **no es cero** y
   *    por lo tanto no se puede comparar con cero.
   *
   * El valor esperado —cero— se escribe a mano y no se calcula con `saldoDe`,
   * que es la restricción 6 de la tajada.
   */
  it("con enteros la cuenta saldada da cero; en dólares no da cero", () => {
    const movimientos = [
      { tipo: "anticipo" as const, monto: ANTICIPO_QUE_SALDA },
      ...GASTOS_QUE_SALDAN.map((monto) => ({ tipo: "gasto" as const, monto })),
    ];

    expect(saldoDe(movimientos)).toEqual({
      anticipos: 160_238,
      gastos: 160_238,
      saldo: 0,
    });

    // La ingenua número uno: sumar todo sin mirar de qué lado cae.
    const sumaCiega = movimientos.reduce((total, m) => total + m.monto, 0);
    expect(sumaCiega).toBe(320_476);
    expect(sumaCiega).not.toBe(0);

    // La ingenua número dos: la misma resta, en unidades de moneda.
    let enDolares = 0;
    for (const m of movimientos) {
      enDolares += m.tipo === "anticipo" ? m.monto / 100 : -(m.monto / 100);
    }
    expect(enDolares).not.toBe(0);
    expect(enDolares).toBeCloseTo(0, 10);
  });

  it("el orden de los movimientos no cambia el saldo", () => {
    // Una suma de enteros es asociativa y conmutativa; una de flotantes no.
    // Que esta prueba pase es lo que dice que no se coló una división.
    const adelante = saldoDe([
      { tipo: "anticipo", monto: ANTICIPO_QUE_SALDA },
      ...GASTOS_QUE_SALDAN.map((monto) => ({ tipo: "gasto" as const, monto })),
    ]);
    const alReves = saldoDe([
      ...[...GASTOS_QUE_SALDAN]
        .reverse()
        .map((monto) => ({ tipo: "gasto" as const, monto })),
      { tipo: "anticipo", monto: ANTICIPO_QUE_SALDA },
    ]);

    expect(adelante).toEqual(alReves);
  });
});

/* ==========================================================================
   El esquema, por rechazo
   ========================================================================== */

describe("movimiento_gasto · la fila válida de referencia", () => {
  it("acepta su fila válida", async () => {
    // El contrapeso de todo lo que sigue: sin esto, las pruebas de rechazo
    // pasarían igual si la tabla rechazara todo.
    await expect(insertar(filaValida())).resolves.toBeDefined();
  });
});

describe("montos en centavos enteros", () => {
  it("rechaza un monto con parte decimal, que INTEGER por sí solo deja entrar", async () => {
    // T-1 lo midió: `INTEGER` en SQLite es **afinidad, no tipo**. Un 1500.5
    // no se puede convertir a entero sin pérdida, así que la columna lo
    // guardaría tal cual si `typeof(monto) = 'integer'` no estuviera.
    await expect(insertar(filaValida({ monto: 1500.5 }))).rejects.toThrow(
      /el_monto_del_movimiento_es_centavos_enteros_no_negativos/,
    );
  });

  it("rechaza un monto negativo: el signo lo lleva el tipo, no el número", async () => {
    await expect(insertar(filaValida({ monto: -1 }))).rejects.toThrow(
      /el_monto_del_movimiento_es_centavos_enteros_no_negativos/,
    );
  });

  it("acepta el cero, que no mueve nada y no corrompe nada", async () => {
    await expect(insertar(filaValida({ monto: 0 }))).resolves.toBeDefined();
  });
});

describe("el vocabulario cerrado del tipo", () => {
  it("rechaza un tipo fuera del catálogo", async () => {
    await expect(insertar(filaValida({ tipo: "ajuste" }))).rejects.toThrow(
      /el_tipo_del_movimiento_separa_gasto_de_anticipo/,
    );
  });

  it("el CHECK de la base y la lista del código dicen lo mismo, en los dos sentidos", async () => {
    // Las dos mitades existen a propósito y hacen cosas distintas: el
    // `CHECK` sobrevive a un script de importación (§5) y la lista cierra lo
    // que la API acepta. Lo que no puede pasar es que se separen sin que
    // nadie se entere — una API que acepta un tipo que la base rechaza es un
    // 500 que nadie puede leer.
    const fila = await env.DB.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table'" +
        " AND name = 'movimiento_gasto'",
    ).first<{ sql: string }>();
    expect(fila).not.toBeNull();

    const definicion = fila?.sql ?? "";
    const clausula = /tipo\s+TEXT\s+NOT\s+NULL[\s\S]*?IN\s*\(([^)]*)\)/i.exec(
      definicion,
    );
    expect(clausula, "el CHECK de `tipo` tiene que estar").not.toBeNull();

    const enLaBase = [...(clausula?.[1] ?? "").matchAll(/'([^']*)'/g)].map(
      (coincidencia) => coincidencia[1],
    );
    expect([...enLaBase].sort()).toEqual([...TIPOS_DE_MOVIMIENTO].sort());
  });
});

describe("momentos en la forma canónica", () => {
  it("rechaza una fecha que no es un momento canónico", async () => {
    await expect(insertar(filaValida({ fecha: "2026-03-15" }))).rejects.toThrow(
      /la_fecha_del_movimiento_es_un_momento_canonico/,
    );
  });

  it("rechaza un registrado_en que no es un momento canónico", async () => {
    await expect(
      insertar(filaValida({ registrado_en: "ayer por la tarde" })),
    ).rejects.toThrow(/el_registro_del_movimiento_es_un_momento_canonico/);
  });
});

describe("la llave del comprobante la fabrica el sistema", () => {
  it("acepta exactamente la llave que fabrica llaveDeComprobante", async () => {
    // La otra mitad acoplada: el `CHECK` dice en SQL la misma forma que la
    // función dice en TypeScript. Si se separan, el sistema rechaza con un
    // 500 la llave que él mismo fabricó.
    const id = nuevoId();

    await expect(
      insertar(
        filaValida({
          id,
          comprobante_key: llaveDeComprobante(TENANT_UNICO_ID, procesoId, id),
        }),
      ),
    ).resolves.toBeDefined();
  });

  it("rechaza una llave elegida por quien sube", async () => {
    await expect(
      insertar(filaValida({ comprobante_key: "comprobantes/el-que-yo-quiera" })),
    ).rejects.toThrow(/la_llave_del_comprobante_la_fabrica_el_sistema/);
  });

  it("rechaza una llave que nombra a otro bufete", async () => {
    // El caso que importa: en un almacén de objetos no hay columna
    // `tenant_id`, así que el prefijo de la llave **es** la frontera.
    const id = nuevoId();

    await expect(
      insertar(
        filaValida({
          id,
          comprobante_key: llaveDeComprobante(OTRO_TENANT_ID, procesoId, id),
        }),
      ),
    ).rejects.toThrow(/la_llave_del_comprobante_la_fabrica_el_sistema/);
  });

  it("rechaza la llave de otro movimiento: no se puede tapar un comprobante ajeno", async () => {
    const otro = nuevoId();

    await expect(
      insertar(
        filaValida({
          comprobante_key: llaveDeComprobante(TENANT_UNICO_ID, procesoId, otro),
        }),
      ),
    ).rejects.toThrow(/la_llave_del_comprobante_la_fabrica_el_sistema/);
  });

  it("con el identificador en nulo rechaza la llave, que es lo que el IS compra", async () => {
    // En SQLite una columna `TEXT PRIMARY KEY` **admite NULL** —es el
    // comportamiento heredado de las tablas con rowid—, y con `id` nulo la
    // concatenación entera da NULL. Con `=` la comparación evaluaría a NULL,
    // el `CHECK` **pasaría** y entraría una fila con una llave que nadie
    // fabricó; con `IS`, NULL contra un texto da falso y la fila se rechaza.
    await expect(
      insertar(
        filaValida({
          id: null,
          comprobante_key: "comprobantes/la-que-yo-quiera",
        }),
      ),
    ).rejects.toThrow(/la_llave_del_comprobante_la_fabrica_el_sistema/);
  });

  it("acepta la llave nula: el papel se escanea después del monto", async () => {
    await expect(
      insertar(filaValida({ comprobante_key: null })),
    ).resolves.toBeDefined();
  });
});

describe("tenencia · ninguna fila referencia a otro bufete", () => {
  it("rechaza un movimiento nuestro sobre un proceso del vecino", async () => {
    await expect(
      insertar(filaValida({ proceso_id: procesoAjenoId })),
    ).rejects.toThrow(/tenencia cruzada: movimiento_gasto/);
  });

  it("rechaza un movimiento firmado por un usuario del vecino", async () => {
    await expect(
      insertar(filaValida({ usuario_id: usuarioAjenoId })),
    ).rejects.toThrow(/tenencia cruzada: movimiento_gasto/);
  });

  it("rechaza un proceso inexistente con el mensaje del disparador, no con el de la FK", async () => {
    // Es la aserción de mutación del `IS NOT`: con `<>`, la subconsulta vacía
    // daría NULL, el `WHEN` daría falso y el rechazo quedaría en manos de una
    // llave foránea que un `PRAGMA` apaga.
    await expect(
      insertar(filaValida({ proceso_id: nuevoId() })),
    ).rejects.toThrow(/tenencia cruzada: movimiento_gasto/);
  });

  it("rechaza un usuario inexistente con el mensaje del disparador", async () => {
    await expect(
      insertar(filaValida({ usuario_id: nuevoId() })),
    ).rejects.toThrow(/tenencia cruzada: movimiento_gasto/);
  });

  it("rechaza mudar el usuario de un movimiento a uno del vecino", async () => {
    // El disparador de `UPDATE`, que existe únicamente por esta arista:
    // `usuario_id` es la única columna mutable que cruza tablas.
    const fila = filaValida();
    await insertar(fila);

    await expect(
      env.DB.prepare("UPDATE movimiento_gasto SET usuario_id = ? WHERE id = ?")
        .bind(usuarioAjenoId, fila.id)
        .run(),
    ).rejects.toThrow(/tenencia cruzada: movimiento_gasto/);
  });

  it("no tapa el error verdadero cuando falta una columna NOT NULL", async () => {
    // En SQLite un `BEFORE INSERT` corre **antes** que `NOT NULL`, así que
    // sin la guardia de nulo el disparador diría «tenencia cruzada» cuando
    // el defecto real es una columna ausente.
    for (const columna of ["tenant_id", "proceso_id", "usuario_id"]) {
      await expect(
        insertar(sinColumna(filaValida(), columna)),
        `falta ${columna}`,
      ).rejects.toThrow(
        new RegExp(`NOT NULL constraint failed: movimiento_gasto.${columna}`),
      );
    }
  });
});

describe("inmutabilidad · una fila no cambia de bufete ni de proceso", () => {
  it("rechaza reasignar el tenant", async () => {
    const fila = filaValida();
    await insertar(fila);

    await expect(
      env.DB.prepare("UPDATE movimiento_gasto SET tenant_id = ? WHERE id = ?")
        .bind(OTRO_TENANT_ID, fila.id)
        .run(),
    ).rejects.toThrow(/columna inmutable: movimiento_gasto\.tenant_id/);
  });

  it("rechaza mudar el movimiento a otro proceso, que cambiaría dos cuentas", async () => {
    const otroProceso = nuevoId();
    await env.DB.prepare(
      "INSERT INTO proceso (id, tenant_id, cliente_id, tipo_proceso_id," +
        " origen, titulo, estado, abierto_en)" +
        " VALUES (?, ?, ?, ?, 'directo', ?, 'abierto', ?)",
    )
      .bind(
        otroProceso,
        TENANT_UNICO_ID,
        clienteId,
        tipoProcesoId,
        "Otro trámite de la misma clienta",
        new Date().toISOString(),
      )
      .run();

    const fila = filaValida();
    await insertar(fila);

    await expect(
      env.DB.prepare("UPDATE movimiento_gasto SET proceso_id = ? WHERE id = ?")
        .bind(otroProceso, fila.id)
        .run(),
    ).rejects.toThrow(/columna inmutable: movimiento_gasto\.proceso_id/);
  });

  it("deja corregir lo que sí es corregible", async () => {
    // El contrapeso: una inmutabilidad escrita de más cerraría la puerta a
    // corregir un monto mal tecleado, que es la edición corriente.
    const fila = filaValida();
    await insertar(fila);

    await expect(
      env.DB.prepare(
        "UPDATE movimiento_gasto SET monto = ?, concepto = ? WHERE id = ?",
      )
        .bind(9_900, "Timbres, corregido", fila.id)
        .run(),
    ).resolves.toBeDefined();
  });
});

describe("los disparadores de movimiento_gasto", () => {
  it("están los cuatro, y ninguno más", async () => {
    // La lista va exacta y no por `toContain`: un disparador de más sobre
    // esta tabla sería código muerto o una segunda guarda del mismo hecho, y
    // esta prueba es la que lo haría notar.
    const { results } = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'trigger'" +
        " AND tbl_name = 'movimiento_gasto' ORDER BY name",
    ).all<{ name: string }>();

    expect(results.map((fila) => fila.name)).toEqual([
      "movimiento_gasto_proceso_inmutable",
      "movimiento_gasto_tenant_inmutable",
      "movimiento_gasto_tenencia_coherente_al_actualizar",
      "movimiento_gasto_tenencia_coherente_al_insertar",
    ]);
  });
});

/* ==========================================================================
   I-8 · el filtro de tenencia de las consultas nuevas
   ========================================================================== */

describe("I-8 · las consultas de gastos filtran por tenant", () => {
  /**
   * **Se prueba contra el puerto y no contra la API, y no es una comodidad.**
   *
   * El tenant de una petición lo fija `worker/index.ts` con
   * `TENANT_UNICO_ID`, así que por HTTP no hay forma de pedir con otro. Lo
   * único que la API puede demostrar es que el proceso ajeno da 404, y eso lo
   * decide `procesos.obtener` **antes** de llegar a estas consultas: con el
   * filtro de tenencia de este archivo borrado, esa prueba seguiría verde.
   *
   * Entonces la única manera de medir el filtro es llamarlo con el tenant del
   * vecino, que es lo que hace esto.
   */
  function servicio(tenantId: string): ServicioDeGastos {
    return gastosSobreD1(baseSobreD1(env.DB, tenantId, autorId));
  }

  it("la cuenta de un proceso leída con el tenant del vecino viene vacía", async () => {
    await insertar(filaValida({ monto: 12_500 }));

    // La aserción de presencia al lado de la de ausencia: sin ella, esta
    // prueba pasaría igual si la fila nunca se hubiera insertado.
    const nuestra = await servicio(TENANT_UNICO_ID).cuenta(
      TENANT_UNICO_ID,
      procesoId,
    );
    expect(nuestra.movimientos).toHaveLength(1);
    expect(nuestra.saldo.gastos).toBe(12_500);

    const ajena = await servicio(OTRO_TENANT_ID).cuenta(
      OTRO_TENANT_ID,
      procesoId,
    );
    expect(ajena.movimientos).toEqual([]);
    expect(ajena.saldo).toEqual({ anticipos: 0, gastos: 0, saldo: 0 });
  });

  it("un movimiento nuestro no se obtiene con el tenant del vecino", async () => {
    const fila = filaValida();
    await insertar(fila);
    const id = fila.id as string;

    expect(
      await servicio(TENANT_UNICO_ID).obtener(TENANT_UNICO_ID, procesoId, id),
    ).not.toBeNull();

    expect(
      await servicio(OTRO_TENANT_ID).obtener(OTRO_TENANT_ID, procesoId, id),
    ).toBeNull();
  });
});

/* ==========================================================================
   La API
   ========================================================================== */

describe("la ruta no existe sin identidad, y no llega al dominio", () => {
  it("un GET sin identidad no toca el servicio de gastos", async () => {
    // Con el servicio real, un 403 no distingue «no se ejecutó» de «se
    // ejecutó y después se rechazó».
    let tocado = false;
    const espia: ServicioDeGastos = {
      cuenta: () => {
        tocado = true;
        return Promise.resolve({
          movimientos: [],
          saldo: { anticipos: 0, gastos: 0, saldo: 0 },
        });
      },
      obtener: () => Promise.resolve(null),
      registrar: () => Promise.reject(new Error("no debería llamarse")),
      adjuntarComprobante: () => Promise.reject(new Error("no debería llamarse")),
      quitar: () => Promise.reject(new Error("no debería llamarse")),
    };

    const respuesta = await sinIdentidad(
      peticion(`/api/procesos/${procesoId}/gastos`),
      { gastos: espia },
    );

    expect(respuesta.status).toBe(403);
    expect(tocado).toBe(false);
  });
});

describe("el proceso manda sobre todo lo demás", () => {
  it("404 sobre el proceso del vecino", async () => {
    const respuesta = await comoAutor(
      peticion(`/api/procesos/${procesoAjenoId}/gastos`),
    );
    expect(respuesta.status).toBe(404);
  });

  it("404 al registrar sobre el proceso del vecino, antes de mirar el cuerpo", async () => {
    const respuesta = await registrar({ tipo: "ni idea" }, procesoAjenoId);
    expect(respuesta.status).toBe(404);
  });

  it("404 sobre un movimiento que no es de este proceso", async () => {
    const respuesta = await comoAutor(
      peticion(`/api/procesos/${procesoId}/gastos/${nuevoId()}`, {
        method: "DELETE",
      }),
    );
    expect(respuesta.status).toBe(404);
  });
});

describe("los verbos que no existen", () => {
  it("405 sobre la colección", async () => {
    const respuesta = await comoAutor(
      peticion(`/api/procesos/${procesoId}/gastos`, { method: "PUT" }),
    );
    expect(respuesta.status).toBe(405);
    expect(respuesta.headers.get("allow")).toBe("GET, POST");
  });

  it("405 sobre un movimiento: no se edita, y no tiene GET propio", async () => {
    const id = await cargar("gasto", 1_000, "Mensajería");

    for (const metodo of ["GET", "PUT", "PATCH"]) {
      const respuesta = await comoAutor(
        peticion(`/api/procesos/${procesoId}/gastos/${id}`, { method: metodo }),
      );
      expect(respuesta.status, metodo).toBe(405);
      expect(respuesta.headers.get("allow")).toBe("DELETE");
    }
  });

  it("405 sobre el comprobante", async () => {
    const id = await cargar("gasto", 1_000, "Mensajería");
    const respuesta = await comoAutor(
      peticion(`/api/procesos/${procesoId}/gastos/${id}/comprobante`, {
        method: "DELETE",
      }),
    );
    expect(respuesta.status).toBe(405);
    expect(respuesta.headers.get("allow")).toBe("GET, PUT");
  });

  it("una subruta inventada no es de gastos y cae en el 404 general", async () => {
    const respuesta = await comoAutor(
      peticion(`/api/procesos/${procesoId}/gastos/${nuevoId()}/inventada`),
    );
    expect(respuesta.status).toBe(404);
  });
});

describe("registrar un movimiento", () => {
  it("registra un gasto y devuelve la cuenta entera", async () => {
    const respuesta = await registrar({
      tipo: "gasto",
      monto: 12_500,
      concepto: "Timbres del Registro Público",
    });

    expect(respuesta.status).toBe(201);
    expect(respuesta.headers.get("location")).toBeNull();

    const cuenta = (await respuesta.json()) as RespuestaDeGastos;
    expect(cuenta.movimientos).toHaveLength(1);
    expect(cuenta.movimientos[0]).toMatchObject({
      tipo: "gasto",
      monto: 12_500,
      concepto: "Timbres del Registro Público",
      tieneComprobante: false,
      usuarioId: autorId,
      usuarioNombre: "Itzel",
    });
    expect(cuenta.saldo).toEqual({ anticipos: 0, gastos: 12_500, saldo: -12_500 });
  });

  it("registra un anticipo por la misma ruta y el mismo cuerpo", async () => {
    // Las dos mecánicas no tienen dos rutas ni dos formas: lo único que
    // cambia es una palabra del cuerpo.
    const respuesta = await registrar({
      tipo: "anticipo",
      monto: 50_000,
      concepto: "Anticipo para gastos de trámite",
    });

    expect(respuesta.status).toBe(201);
    const cuenta = (await respuesta.json()) as RespuestaDeGastos;
    expect(cuenta.saldo).toEqual({ anticipos: 50_000, gastos: 0, saldo: 50_000 });
  });

  it("la llave del comprobante no viaja en el cable", async () => {
    const id = await cargar("gasto", 1_000, "Mensajería");
    const respuesta = await subirComprobante(id);
    expect(respuesta.status).toBe(200);

    const texto = await respuesta.text();
    expect(texto).toContain("tieneComprobante");
    expect(texto).not.toContain("comprobantes/");
    expect(texto).not.toContain("comprobanteKey");
  });

  it("sin fecha, el movimiento es de hoy **en Panamá**", async () => {
    // T-2 A lo pagó caro con los vencimientos: desde las 19:00 locales el día
    // UTC ya es el siguiente, y el día que el servidor calcule en UTC un
    // gasto cargado de noche sería «futuro» o se guardaría con fecha de
    // mañana.
    const id = await cargar("gasto", 1_000, "Mensajería");

    const fila = await env.DB.prepare(
      "SELECT fecha FROM movimiento_gasto WHERE id = ?",
    )
      .bind(id)
      .first<{ fecha: string }>();

    const hoy = hoyEnPanama(new Date());
    expect(diaEnPanama(fila?.fecha ?? "")).toBe(hoy);

    const cuenta = await cuentaDe();
    expect(cuenta.movimientos[0].fecha).toBe(hoy);
  });

  it("acepta una fecha pasada: la factura del mes pasado se carga hoy", async () => {
    await cargar("gasto", 4_500, "Copias certificadas", "2026-01-09");
    const cuenta = await cuentaDe();
    expect(cuenta.movimientos[0].fecha).toBe("2026-01-09");
  });

  it("ordena la cuenta del movimiento más viejo al más nuevo", async () => {
    await cargar("gasto", 1_000, "Tercero en cargarse, primero en el tiempo", "2026-01-05");
    await cargar("anticipo", 90_000, "Segundo", "2026-02-10");
    await cargar("gasto", 2_000, "Último", "2026-03-20");

    const cuenta = await cuentaDe();
    expect(cuenta.movimientos.map((m) => m.fecha)).toEqual([
      "2026-01-05",
      "2026-02-10",
      "2026-03-20",
    ]);
  });
});

describe("lo que no se acepta de un movimiento", () => {
  it("un tipo ausente y uno inventado caen en el mismo motivo", async () => {
    expect(
      await motivosDe(await registrar({ monto: 100, concepto: "Algo" })),
    ).toEqual(["tipo_de_movimiento_desconocido"]);

    expect(
      await motivosDe(
        await registrar({ tipo: "ajuste", monto: 100, concepto: "Algo" }),
      ),
    ).toEqual(["tipo_de_movimiento_desconocido"]);
  });

  it("un concepto en blanco es un monto que nadie sabe por qué está", async () => {
    expect(
      await motivosDe(
        await registrar({ tipo: "gasto", monto: 100, concepto: "   " }),
      ),
    ).toEqual(["concepto_requerido"]);
  });

  it("las cuatro formas de no ser un importe caen en monto_invalido", async () => {
    for (const monto of [undefined, "2000", 1500.5, -1]) {
      expect(
        await motivosDe(
          await registrar({ tipo: "gasto", monto, concepto: "Timbres" }),
        ),
        String(monto),
      ).toEqual(["monto_invalido"]);
    }
  });

  it("una fecha que no es un día del calendario", async () => {
    expect(
      await motivosDe(
        await registrar({
          tipo: "gasto",
          monto: 100,
          concepto: "Timbres",
          fecha: "2026-02-31",
        }),
      ),
    ).toEqual(["fecha_invalida"]);
  });

  it("una fecha futura, con su motivo propio y no el de la inválida", async () => {
    const manana = new Date(Date.now() + 48 * 3_600_000)
      .toISOString()
      .slice(0, 10);

    expect(
      await motivosDe(
        await registrar({
          tipo: "gasto",
          monto: 100,
          concepto: "Timbres",
          fecha: manana,
        }),
      ),
    ).toEqual(["fecha_futura"]);
  });

  it("devuelve TODAS las fallas y no la primera", async () => {
    const motivos = await motivosDe(
      await registrar({ tipo: "ajuste", monto: -1, concepto: "", fecha: "ayer" }),
    );

    expect([...motivos].sort()).toEqual([
      "concepto_requerido",
      "fecha_invalida",
      "monto_invalido",
      "tipo_de_movimiento_desconocido",
    ]);
  });

  it("un cuerpo que no se puede ni leer es 400 y no 422", async () => {
    const respuesta = await comoAutor(
      peticion(`/api/procesos/${procesoId}/gastos`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      }),
    );
    expect(respuesta.status).toBe(400);
  });
});

describe("la bitácora del gasto", () => {
  async function verbosDelProceso(): Promise<string[]> {
    const { results } = await env.DB.prepare(
      "SELECT accion FROM bitacora WHERE entidad = 'proceso'" +
        " AND entidad_id = ? ORDER BY ocurrido_en, rowid",
    )
      .bind(procesoId)
      .all<{ accion: string }>();
    return results.map((fila) => fila.accion);
  }

  it("el gasto y el anticipo dejan verbos distintos", async () => {
    await cargar("gasto", 1_000, "Mensajería");
    await cargar("anticipo", 50_000, "Anticipo de la clienta");

    expect(await verbosDelProceso()).toEqual([
      "gasto_registrado",
      "anticipo_registrado",
    ]);
  });

  it("el detalle lleva el concepto y nunca el monto", async () => {
    await cargar("gasto", 123_456, "Timbres del Registro Público");

    const fila = await env.DB.prepare(
      "SELECT detalle FROM bitacora WHERE entidad_id = ?" +
        " AND accion = 'gasto_registrado'",
    )
      .bind(procesoId)
      .first<{ detalle: string }>();

    expect(fila?.detalle).toBe("Timbres del Registro Público");
    expect(fila?.detalle).not.toContain("123456");
    expect(fila?.detalle).not.toContain("1234.56");
  });

  it("quitar y adjuntar dejan su propio verbo", async () => {
    const gasto = await cargar("gasto", 1_000, "Mensajería");
    await subirComprobante(gasto);
    await comoAutor(
      peticion(`/api/procesos/${procesoId}/gastos/${gasto}`, {
        method: "DELETE",
      }),
    );

    const anticipo = await cargar("anticipo", 2_000, "Anticipo");
    await comoAutor(
      peticion(`/api/procesos/${procesoId}/gastos/${anticipo}`, {
        method: "DELETE",
      }),
    );

    expect(await verbosDelProceso()).toEqual([
      "gasto_registrado",
      "comprobante_adjuntado",
      "gasto_quitado",
      "anticipo_registrado",
      "anticipo_quitado",
    ]);
  });

  it("firma quien entró, y no quien aparezca en el cuerpo", async () => {
    await comoSocio(
      conCuerpo(`/api/procesos/${procesoId}/gastos`, "POST", {
        tipo: "gasto",
        monto: 1_000,
        concepto: "Mensajería",
        usuarioId: autorId,
      }),
    );

    const fila = await env.DB.prepare(
      "SELECT usuario_id FROM bitacora WHERE entidad_id = ?" +
        " AND accion = 'gasto_registrado'",
    )
      .bind(procesoId)
      .first<{ usuario_id: string }>();

    expect(fila?.usuario_id).toBe(socioId);
  });
});

/* ==========================================================================
   El comprobante
   ========================================================================== */

describe("el comprobante", () => {
  it("se guarda en la llave que fabrica el servidor, no en la que pida nadie", async () => {
    const id = await cargar("gasto", 12_500, "Timbres");

    const respuesta = await subirComprobante(id);
    expect(respuesta.status).toBe(200);

    const esperada = llaveDeComprobante(TENANT_UNICO_ID, procesoId, id);
    expect([...almacen.objetos.keys()]).toEqual([esperada]);

    const fila = await env.DB.prepare(
      "SELECT comprobante_key FROM movimiento_gasto WHERE id = ?",
    )
      .bind(id)
      .first<{ comprobante_key: string | null }>();
    expect(fila?.comprobante_key).toBe(esperada);

    const cuenta = (await respuesta.json()) as RespuestaDeGastos;
    expect(cuenta.movimientos[0].tieneComprobante).toBe(true);
  });

  it("se puede traer de vuelta, y se sirve como descarga", async () => {
    const id = await cargar("gasto", 12_500, "Timbres");
    await subirComprobante(id);

    const respuesta = await comoAutor(
      peticion(`/api/procesos/${procesoId}/gastos/${id}/comprobante`),
    );

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get("content-type")).toBe("application/pdf");
    expect(respuesta.headers.get("content-disposition")).toBe("attachment");
    expect(new Uint8Array(await respuesta.arrayBuffer())).toEqual(PDF);
  });

  it("404 cuando el movimiento todavía no tiene papel", async () => {
    const id = await cargar("gasto", 12_500, "Timbres");
    const respuesta = await comoAutor(
      peticion(`/api/procesos/${procesoId}/gastos/${id}/comprobante`),
    );
    expect(respuesta.status).toBe(404);
  });

  /**
   * **La corrección no puede dejar un huérfano, y esto es lo que lo mide.**
   *
   * La llave se deriva de la fila y la fila no cambió, así que el papel nuevo
   * se escribe encima del viejo: un solo objeto antes y después. Con una
   * llave aleatoria, acá habría dos y el primero sería basura que nadie
   * encuentra.
   */
  it("reemplazar el papel escribe sobre el mismo objeto: no quedan huérfanos", async () => {
    const id = await cargar("gasto", 12_500, "Timbres");
    await subirComprobante(id);

    const corregido = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x32]);
    const respuesta = await subirComprobante(id, corregido);
    expect(respuesta.status).toBe(200);

    expect(almacen.objetos.size).toBe(1);
    const llave = llaveDeComprobante(TENANT_UNICO_ID, procesoId, id);
    expect(almacen.objetos.get(llave)?.bytes).toEqual(corregido);

    // Y el borrado tampoco tuvo que correr: no hay nada que borrar.
    expect(almacen.borrados).toEqual([]);
  });

  it("rechaza lo que no es un PDF ni una imagen", async () => {
    const id = await cargar("gasto", 12_500, "Timbres");

    const respuesta = await subirComprobante(
      id,
      new Uint8Array([0x3c, 0x68, 0x74, 0x6d, 0x6c, 0x3e]),
      "text/html",
    );

    expect(respuesta.status).toBe(422);
    expect(await motivosDe(respuesta)).toEqual(["comprobante_no_admitido"]);
    expect(almacen.objetos.size).toBe(0);
  });

  it("acepta una imagen con parámetros en el content-type", async () => {
    const id = await cargar("gasto", 12_500, "Timbres");
    const respuesta = await subirComprobante(
      id,
      new Uint8Array([0xff, 0xd8, 0xff]),
      "image/jpeg; charset=binary",
    );

    expect(respuesta.status).toBe(200);
    const llave = llaveDeComprobante(TENANT_UNICO_ID, procesoId, id);
    expect(almacen.objetos.get(llave)?.tipo).toBe("image/jpeg");
  });

  it("rechaza un cuerpo vacío con el mismo motivo", async () => {
    const id = await cargar("gasto", 12_500, "Timbres");
    const respuesta = await subirComprobante(id, new Uint8Array([]));

    expect(respuesta.status).toBe(422);
    expect(await motivosDe(respuesta)).toEqual(["comprobante_no_admitido"]);
  });

  it("rechaza lo que pasa del tope, y no lo guarda", async () => {
    const id = await cargar("gasto", 12_500, "Timbres");
    const grande = new Uint8Array(TOPE_DEL_COMPROBANTE + 1);
    grande[0] = 0x25;

    const respuesta = await subirComprobante(id, grande);

    expect(respuesta.status).toBe(422);
    expect(await motivosDe(respuesta)).toEqual(["comprobante_demasiado_grande"]);
    expect(almacen.objetos.size).toBe(0);
  });

  it("404 al subir sobre un movimiento del vecino", async () => {
    const respuesta = await subirComprobante(nuevoId());
    expect(respuesta.status).toBe(404);
    expect(almacen.objetos.size).toBe(0);
  });
});

describe("el almacén que no está", () => {
  /**
   * El despliegue de hoy: `wrangler.jsonc` no declara el bucket, así que
   * `env.COMPROBANTES` viene indefinido y el camino que corre es el **real**,
   * `almacenSobreR2`. No hay sustituto en esta prueba, a propósito: lo que se
   * mide es que un despliegue a medias falle cerrado y diga qué pasa.
   */
  it("contesta 502 con almacen_no_configurado, sin tocar la red", async () => {
    const id = await cargar("gasto", 12_500, "Timbres");

    const respuesta = await sinBindingDeAlmacen(
      peticion(`/api/procesos/${procesoId}/gastos/${id}/comprobante`, {
        method: "PUT",
        headers: { "content-type": "application/pdf" },
        body: PDF,
      }),
    );

    expect(respuesta.status).toBe(502);
    expect(await respuesta.json()).toEqual({
      error: "comprobante_no_disponible",
      motivo: "almacen_no_configurado",
    });
  });

  it("todo lo demás sigue funcionando sin el binding", async () => {
    // Es la mitad que importa de la decisión: un despliegue sin bucket sirve
    // la cuenta entera y acepta movimientos. Lo único que no se puede es
    // adjuntar el papel.
    const alta = await sinBindingDeAlmacen(
      conCuerpo(`/api/procesos/${procesoId}/gastos`, "POST", {
        tipo: "gasto",
        monto: 12_500,
        concepto: "Timbres",
      }),
    );
    expect(alta.status).toBe(201);

    const lectura = await sinBindingDeAlmacen(
      peticion(`/api/procesos/${procesoId}/gastos`),
    );
    expect(lectura.status).toBe(200);
    expect(((await lectura.json()) as RespuestaDeGastos).saldo.saldo).toBe(
      -12_500,
    );
  });

  it("la fila no promete un papel que no se guardó", async () => {
    // La regla de orden: el objeto se escribe **antes** que la fila que lo
    // nombra. Si el almacén falla, la fila queda sin llave.
    const id = await cargar("gasto", 12_500, "Timbres");

    const respuesta = await conAlmacen(
      peticion(`/api/procesos/${procesoId}/gastos/${id}/comprobante`, {
        method: "PUT",
        headers: { "content-type": "application/pdf" },
        body: PDF,
      }),
      almacenCaido(),
    );

    expect(respuesta.status).toBe(502);
    expect(await respuesta.json()).toEqual({
      error: "comprobante_no_disponible",
      motivo: "almacen_no_disponible",
    });

    const fila = await env.DB.prepare(
      "SELECT comprobante_key FROM movimiento_gasto WHERE id = ?",
    )
      .bind(id)
      .first<{ comprobante_key: string | null }>();
    expect(fila?.comprobante_key).toBeNull();

    // Y la cuenta lo dice igual: nada de papel.
    expect((await cuentaDe()).movimientos[0].tieneComprobante).toBe(false);
  });

  it("un comprobante que el almacén no puede traer es 502 y no un 200 vacío", async () => {
    const id = await cargar("gasto", 12_500, "Timbres");
    await subirComprobante(id);

    const respuesta = await conAlmacen(
      peticion(`/api/procesos/${procesoId}/gastos/${id}/comprobante`),
      almacenCaido(),
    );
    expect(respuesta.status).toBe(502);
  });
});

describe("quitar un movimiento", () => {
  it("lo saca de la cuenta y devuelve el saldo nuevo", async () => {
    await cargar("anticipo", 50_000, "Anticipo");
    const gasto = await cargar("gasto", 12_500, "Timbres");

    const respuesta = await comoAutor(
      peticion(`/api/procesos/${procesoId}/gastos/${gasto}`, {
        method: "DELETE",
      }),
    );

    expect(respuesta.status).toBe(200);
    const cuenta = (await respuesta.json()) as RespuestaDeGastos;
    expect(cuenta.movimientos).toHaveLength(1);
    expect(cuenta.saldo).toEqual({ anticipos: 50_000, gastos: 0, saldo: 50_000 });
  });

  it("se lleva el papel con él: no queda objeto huérfano", async () => {
    const id = await cargar("gasto", 12_500, "Timbres");
    await subirComprobante(id);
    const llave = llaveDeComprobante(TENANT_UNICO_ID, procesoId, id);
    expect(almacen.objetos.has(llave)).toBe(true);

    const respuesta = await comoAutor(
      peticion(`/api/procesos/${procesoId}/gastos/${id}`, { method: "DELETE" }),
    );

    expect(respuesta.status).toBe(200);
    expect(almacen.borrados).toEqual([llave]);
    expect(almacen.objetos.has(llave)).toBe(false);
  });

  it("no manda a borrar nada cuando no había papel", async () => {
    const id = await cargar("gasto", 12_500, "Timbres");
    await comoAutor(
      peticion(`/api/procesos/${procesoId}/gastos/${id}`, { method: "DELETE" }),
    );
    expect(almacen.borrados).toEqual([]);
  });

  /**
   * **La única asimetría del archivo, y está decidida a la vista.**
   *
   * La fila se borra antes que el objeto. Si el borrado del objeto falla, el
   * movimiento ya salió de la cuenta —que es lo que la persona pidió y lo que
   * cambió el saldo— y lo que queda es basura que un barrido puede encontrar,
   * porque la llave es deducible de la fila que había. Un 502 ahí diría «no
   * se pudo» sobre una operación que sí se hizo.
   */
  /**
   * **La otra mitad de la regla de orden, y la que no se puede medir por la
   * API sola.**
   *
   * Que la fila se borre **antes** que el objeto sólo se nota cuando el
   * borrado de la fila falla: con ese orden el papel sigue ahí, y con el
   * contrario quedaría una fila viva apuntando a un objeto que ya no está —la
   * fila que miente—. D1 no falla a pedido, así que la única forma de ejercer
   * ese camino es un puerto que rechace, que es lo que hace esta prueba.
   *
   * Medido: sin ella, invertir las dos líneas de `quitar` no mata ninguna
   * prueba. Con ella, muere.
   */
  it("si la fila no se puede borrar, el papel no se toca", async () => {
    const id = nuevoId();
    const espia: ServicioDeGastos = {
      cuenta: () =>
        Promise.resolve({
          movimientos: [],
          saldo: { anticipos: 0, gastos: 0, saldo: 0 },
        }),
      obtener: () =>
        Promise.resolve({
          id,
          tipo: "gasto",
          concepto: "Timbres",
          comprobanteKey: llaveDeComprobante(TENANT_UNICO_ID, procesoId, id),
        }),
      registrar: () => Promise.reject(new Error("no debería llamarse")),
      adjuntarComprobante: () => Promise.reject(new Error("no debería llamarse")),
      quitar: () => Promise.reject(new Error("D1 se cayó a mitad del borrado")),
    };

    await expect(
      manejar(peticion(`/api/procesos/${procesoId}/gastos/${id}`, {
        method: "DELETE",
      }), entorno(), {
        correoDeDesarrollo: () => EMAIL_AUTOR,
        comprobantes: almacen,
        gastos: espia,
      }),
    ).rejects.toThrow(/D1 se cayó/);

    expect(almacen.borrados).toEqual([]);
  });

  it("si el almacén falla al borrar, el movimiento igual sale de la cuenta", async () => {
    const id = await cargar("gasto", 12_500, "Timbres");
    await subirComprobante(id);

    const respuesta = await conAlmacen(
      peticion(`/api/procesos/${procesoId}/gastos/${id}`, { method: "DELETE" }),
      almacenCaido(),
    );

    expect(respuesta.status).toBe(200);
    expect(((await respuesta.json()) as RespuestaDeGastos).movimientos).toEqual(
      [],
    );

    const fila = await env.DB.prepare(
      "SELECT count(*) AS cuantos FROM movimiento_gasto WHERE id = ?",
    )
      .bind(id)
      .first<{ cuantos: number }>();
    expect(fila?.cuantos).toBe(0);
  });
});
