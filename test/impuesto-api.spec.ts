/**
 * El ITBMS detrás de su interruptor (`odd/tasks/cotizaciones.md`, T-12).
 *
 * La investigación del 25 de octubre de 2026 dejó una aritmética y una
 * restricción, y la restricción es la que manda:
 *
 * > `total = Σ honorarios + ITBMS(Σ honorarios) + Σ gastos estimados`
 * >
 * > Ninguna cotización emitida puede llevar un total con impuesto hasta que
 * > esto esté validado por la contadora del bufete.
 *
 * Así que lo que esta suite prueba **no es que el impuesto se calcule**. Eso
 * es la parte fácil. Lo que prueba es que **está apagado**, que encenderlo es
 * una decisión explícita, y que encenderlo **no mueve un solo documento ya
 * emitido**.
 *
 * ## Las tres afirmaciones, y por qué cada una lleva su contrapeso
 *
 * Ninguna de las tres se puede probar con una aserción de ausencia sola. La
 * tajada pagó esa lección cara: *una aserción de ausencia no mide nada sin su
 * aserción de presencia al lado*. Un «no dice ITBMS» pasa igual con la
 * aritmética sin escribir, con la ruta rota y con la pantalla en blanco.
 *
 * Por eso cada afirmación de acá se mide **sobre el mismo insumo, dos veces,
 * con el interruptor en sus dos posiciones**, y las dos lecturas tienen que
 * salir distintas:
 *
 *  1. **El valor por omisión es apagado.** `totalesDe(lineas)` sin segundo
 *     argumento no lleva impuesto; `totalesDe(lineas, CON_ITBMS)` sobre
 *     **esas mismas líneas** sí, y los dos totales difieren exactamente en el
 *     impuesto. Si el valor por omisión se diera vuelta, la primera mitad
 *     falla; si la aritmética no existiera, falla la segunda.
 *  2. **El documento congelado es un hecho histórico.** Se emite apagado, se
 *     lee el documento, se **enciende**, y se vuelve a leer: tiene que ser
 *     idéntico. Y para que eso no sea el trivial «el interruptor no hace
 *     nada», en la misma corrida encendida se emite **otra** cotización y esa
 *     sí tiene que llevar el impuesto.
 *  3. **La base del porcentaje de una cuota incluye el impuesto.** La misma
 *     cuota del 50 % sobre la misma cotización cobra dos importes distintos
 *     según la posición del interruptor.
 *
 * ## El interruptor se mueve de verdad, y por la puerta de producción
 *
 * `manejar(request, env, dependencias)` recibe el entorno entero, así que una
 * prueba enciende el impuesto poniendo `ITBMS_ACTIVO` en ese objeto — que es
 * **exactamente** lo que hace un despliegue con la variable puesta. No hay un
 * doble del régimen, no hay un módulo simulado y no hay una segunda
 * aritmética: lo que corre acá es el Worker contra D1.
 *
 * Esto es lo que las pruebas de punta a punta **no** pueden hacer, y por eso
 * el par presencia/ausencia vive acá: `playwright.config.ts` levanta un solo
 * servidor de Vite para las trescientas y pico de pruebas, así que ninguna de
 * ellas puede cambiar una variable de entorno del Worker a mitad de corrida.
 *
 * ## Los números esperados se escriben a mano
 *
 * Restricción 6 de la tajada. Ninguna expectativa de acá sale de `totalesDe`
 * ni de `itbmsDe`: una prueba que calcula lo que espera con la función que
 * prueba pasa aunque las dos estén mal.
 *
 * Y los montos no son redondos a propósito. 162 345 centavos de honorarios al
 * 7 % dan 11 364,15 centavos, que **no es un número de centavos**: es el caso
 * que obliga a decidir entre truncar y redondear, y el que deja el residuo a
 * la vista.
 */
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { TENANT_UNICO_ID, nuevoId } from "../worker/db/ids";
import { ahoraIso } from "../worker/db/momentos";
import { manejar } from "../worker/index";
import {
  CON_ITBMS,
  ROTULO_DEL_ITBMS,
  SIN_ITBMS,
  TARIFA_DEL_ITBMS_POR_CIENTO,
  itbmsDe,
  totalesDe,
} from "../worker/cotizaciones/lineas";
import {
  ENCIENDE_EL_ITBMS,
  regimenDelBufete,
} from "../worker/cotizaciones/impuesto";

const DOMINIO_DE_ACCESS = "https://bufete-de-prueba.cloudflareaccess.com";
const AUD = "aud-de-la-aplicacion-del-bufete";

const EMAIL_AUTOR = "itzel@bufete.test";
const NOMBRE_AUTOR = "Itzel";

/* ==========================================================================
   Los números, escritos a mano una sola vez

   Dos líneas de honorario y una de gasto. La suma de honorarios es impar en
   centavos a propósito: su 7 % no es un número entero de centavos.
   ========================================================================== */

const HONORARIO_MAYOR = 150_000;
const HONORARIO_MENOR = 12_345;
const GASTO = 7_550;

/** 150 000 + 12 345. */
const HONORARIOS = 162_345;

/**
 * El 7 % de 162 345 es **11 364,15 centavos**, y se cobran 11 364.
 *
 * Los 0,15 centavos que sobran no se reparten, no se redondean hacia arriba y
 * no se esconden en el total: se truncan, y el residuo queda del lado del
 * cliente. Es la misma regla que `importeDe` aplica al porcentaje de una
 * cuota, y tiene que ser la misma: si «el 7 %» y «700 puntos básicos» del
 * mismo número dieran respuestas distintas, el sistema tendría dos
 * aritméticas del dinero.
 */
const ITBMS = 11_364;

/** 162 345 + 7 550. El total de siempre, sin impuesto. */
const TOTAL_APAGADO = 169_895;

/** 162 345 + 11 364 + 7 550. El gasto estimado pasa sin gravar. */
const TOTAL_ENCENDIDO = 181_259;

/** Medio total, truncado: 50 % de 169 895 son 84 947,5 centavos. */
const MEDIA_CUOTA_APAGADA = 84_947;

/** 50 % de 181 259 son 90 629,5 centavos. */
const MEDIA_CUOTA_ENCENDIDA = 90_629;

const CINCUENTA_POR_CIENTO_EN_BP = 5_000;

let clienteId: string;
let tipoClienteId: string;
let autorId: string;

/**
 * El entorno de una petición, con el interruptor donde se lo pida.
 *
 * **`ITBMS_ACTIVO` en `undefined` por omisión**, y eso no es cosmética: la
 * suite tiene que ser hermética frente a un `.dev.vars` local, porque la
 * única cosa que de verdad prueba es qué pasa cuando la variable **no está**.
 */
function entorno(interruptor?: string): Env {
  return {
    ...env,
    ACCESO_TEAM_DOMAIN: DOMINIO_DE_ACCESS,
    ACCESO_AUD: AUD,
    ACCESO_DEV_EMAIL: undefined,
    ITBMS_ACTIVO: interruptor,
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

/** Una petición con el impuesto apagado, que es el despliegue de hoy. */
function apagado(request: Request): Promise<Response> {
  return manejar(request, entorno(), { correoDeDesarrollo: () => EMAIL_AUTOR });
}

/** La misma petición, con la variable puesta. */
function encendido(request: Request): Promise<Response> {
  return manejar(request, entorno(ENCIENDE_EL_ITBMS), {
    correoDeDesarrollo: () => EMAIL_AUTOR,
  });
}

interface TotalesEnElCable {
  honorarios: number;
  gastosEstimados: number;
  total: number;
  itbms?: number;
}

async function crearBorrador(): Promise<string> {
  const respuesta = await apagado(
    conCuerpo("/api/cotizaciones", "POST", { clienteId }),
  );
  expect(respuesta.status, await respuesta.clone().text()).toBe(201);

  const cuerpo = (await respuesta.json()) as { cotizacion: { id: string } };
  return cuerpo.cotizacion.id;
}

async function agregarLinea(
  id: string,
  clase: string,
  concepto: string,
  monto: number,
): Promise<void> {
  const respuesta = await apagado(
    conCuerpo(`/api/cotizaciones/${id}/lineas`, "POST", {
      clase,
      concepto,
      monto,
    }),
  );
  expect(respuesta.status, await respuesta.clone().text()).toBe(201);
}

/** Un borrador con las tres líneas de arriba. No se emite. */
async function borradorConLineas(): Promise<string> {
  const id = await crearBorrador();
  await agregarLinea(id, "honorario", "Honorario profesional", HONORARIO_MAYOR);
  await agregarLinea(id, "gasto_estimado", "Tasas de migración", GASTO);
  await agregarLinea(id, "honorario", "Acompañamiento en cita", HONORARIO_MENOR);
  return id;
}

async function totalesEnElCable(
  id: string,
  llamar: (request: Request) => Promise<Response>,
): Promise<TotalesEnElCable> {
  const respuesta = await llamar(peticion(`/api/cotizaciones/${id}/lineas`));
  expect(respuesta.status, await respuesta.clone().text()).toBe(200);

  const cuerpo = (await respuesta.json()) as { totales: TotalesEnElCable };
  return cuerpo.totales;
}

async function emitir(
  id: string,
  llamar: (request: Request) => Promise<Response>,
): Promise<void> {
  const respuesta = await llamar(
    peticion(`/api/cotizaciones/${id}/emitir`, { method: "POST" }),
  );
  expect(respuesta.status, await respuesta.clone().text()).toBe(200);
}

async function documentoDe(
  id: string,
  llamar: (request: Request) => Promise<Response>,
): Promise<Record<string, unknown>> {
  const respuesta = await llamar(
    peticion(`/api/cotizaciones/${id}/documento`),
  );
  expect(respuesta.status, await respuesta.clone().text()).toBe(200);

  const cuerpo = (await respuesta.json()) as {
    documento: Record<string, unknown>;
  };
  return cuerpo.documento;
}

beforeAll(async () => {
  autorId = nuevoId();
  tipoClienteId = nuevoId();
  clienteId = nuevoId();

  const ahora = ahoraIso();

  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO usuario (id, tenant_id, nombre, email, activo)" +
        " VALUES (?, ?, ?, ?, 1)",
    ).bind(autorId, TENANT_UNICO_ID, NOMBRE_AUTOR, EMAIL_AUTOR),
    env.DB.prepare(
      "INSERT INTO tipo_cliente (id, tenant_id, nombre) VALUES (?, ?, ?)",
    ).bind(tipoClienteId, TENANT_UNICO_ID, "Persona jurídica"),
    env.DB.prepare(
      "INSERT INTO cliente (id, tenant_id, tipo_cliente_id, nombre, telefono," +
        " creado_por, creado_en) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).bind(
      clienteId,
      TENANT_UNICO_ID,
      tipoClienteId,
      "Constructora del Istmo, S.A.",
      "+507 6000-0000",
      autorId,
      ahora,
    ),
  ]);
});

/* ==========================================================================
   1. El interruptor, y que apagado sea el estado por omisión
   ========================================================================== */

describe("el interruptor del ITBMS", () => {
  /*
   * **Ésta es la prueba de la tarea**, y está escrita para que no se pueda
   * satisfacer por accidente.
   *
   * La forma floja sería `expect(totalesDe(lineas)).not.toHaveProperty("itbms")`.
   * Pasa con el impuesto sin implementar, pasa con `totalesDe` devolviendo un
   * objeto vacío y pasa con el archivo del impuesto borrado. No mide nada.
   *
   * La de abajo mide, porque afirma **las dos posiciones sobre las mismas
   * líneas** y exige que den objetos distintos:
   *
   *  - si el valor por omisión se diera vuelta, `apagado` traería `itbms` y
   *    un total de 181 259, y la primera mitad falla;
   *  - si la aritmética no existiera, `encendido` no traería `itbms` y la
   *    segunda mitad falla.
   *
   * Ninguna de las dos mitades puede satisfacer a la otra: los dos totales
   * difieren exactamente en el impuesto.
   */
  it("el valor por omisión de `totalesDe` es sin impuesto, y el explícito sí lo lleva", () => {
    const lineas = [
      { clase: "honorario", monto: HONORARIO_MAYOR },
      { clase: "gasto_estimado", monto: GASTO },
      { clase: "honorario", monto: HONORARIO_MENOR },
    ] as const;

    expect(
      totalesDe(lineas),
      "sin segundo argumento, `totalesDe` cobró un impuesto que nadie encendió",
    ).toEqual({
      honorarios: HONORARIOS,
      gastosEstimados: GASTO,
      total: TOTAL_APAGADO,
    });

    expect(
      totalesDe(lineas, CON_ITBMS),
      "con el régimen encendido, `totalesDe` no cobró el impuesto",
    ).toEqual({
      honorarios: HONORARIOS,
      gastosEstimados: GASTO,
      itbms: ITBMS,
      total: TOTAL_ENCENDIDO,
    });
  });

  /*
   * `SIN_ITBMS` no es sólo el valor por omisión: es un valor que se puede
   * pasar a mano, y tiene que dar exactamente lo mismo. Si no lo diera, el
   * argumento por omisión sería un tercer camino.
   */
  it("pasar `SIN_ITBMS` a mano da lo mismo que no pasar nada", () => {
    const lineas = [{ clase: "honorario", monto: HONORARIO_MAYOR }] as const;

    expect(totalesDe(lineas, SIN_ITBMS)).toEqual(totalesDe(lineas));
    expect(totalesDe(lineas, SIN_ITBMS)).not.toEqual(
      totalesDe(lineas, CON_ITBMS),
    );
  });

  /*
   * Qué enciende la variable y qué no.
   *
   * **Sólo la cadena `si`.** Un interruptor que adivina intenciones es el que
   * se enciende solo: `"true"` es el hábito de otro lenguaje, `"1"` el de
   * otro, `"SI"` un dedo en mayúsculas y `" si "` un espacio que nadie ve en
   * un panel de variables. Las cuatro dejan el impuesto apagado, porque el
   * estado seguro es apagado y porque de las cinco cadenas sólo una fue
   * tecleada por alguien que sabía lo que hacía.
   *
   * La tabla lleva su caso encendido adentro: sin él, una función que
   * devolviera siempre `SIN_ITBMS` pasaría entera.
   */
  it.each([
    { valor: undefined, grava: false, por: "la variable no está" },
    { valor: "si", grava: true, por: "es la cadena exacta" },
    { valor: "", grava: false, por: "está vacía" },
    { valor: "true", grava: false, por: "no es `si`" },
    { valor: "1", grava: false, por: "no es `si`" },
    { valor: "SI", grava: false, por: "no es `si`, y mayúsculas no es `si`" },
    { valor: " si ", grava: false, por: "trae espacios y no es `si`" },
    { valor: "no", grava: false, por: "no es `si`" },
  ])("`ITBMS_ACTIVO = $valor` grava $grava porque $por", ({ valor, grava }) => {
    expect(regimenDelBufete({ ITBMS_ACTIVO: valor })).toEqual({ grava });
  });

  /*
   * Las dos mitades acopladas de siempre: la tarifa y el rótulo que la
   * persona lee. Si se separaran, el papel diría «ITBMS (7 %)» sobre una
   * cuenta hecha al 10 %, y la cifra equivocada es la que el cliente firma.
   */
  it("el rótulo nombra la misma tarifa con la que se hace la cuenta", () => {
    expect(TARIFA_DEL_ITBMS_POR_CIENTO).toBe(7);
    expect(ROTULO_DEL_ITBMS).toContain("7");

    // Y que la tarifa del rótulo sea la de la cuenta: 100 centavos al 7 % son
    // 7, escrito a mano.
    expect(itbmsDe(100)).toBe(7);
  });
});

/* ==========================================================================
   2. La aritmética: trunca, y el residuo se ve
   ========================================================================== */

describe("la aritmética del ITBMS", () => {
  /*
   * El caso que decide entre truncar y redondear.
   *
   * 162 345 al 7 % son 11 364,15 centavos. Redondear daría 11 364 también
   * —0,15 baja—, así que ese número **no distingue las dos reglas** y no
   * sirve solo. El que las distingue es uno cuya parte decimal pase de la
   * mitad: 150 007 al 7 % son 10 500,49; 150 008 son 10 500,56, que
   * redondeando sería 10 501 y truncando es 10 500.
   */
  it("trunca hacia abajo, y el centavo que sobra no se cobra", () => {
    // 150 008 × 7 = 1 050 056. Exacto: 10 500,56 centavos.
    expect(itbmsDe(150_008)).toBe(10_500);

    // 150 007 × 7 = 1 050 049. Exacto: 10 500,49 centavos.
    expect(itbmsDe(150_007)).toBe(10_500);

    // Y uno que cae justo, para que la prueba no diga sólo «siempre baja».
    expect(itbmsDe(150_000)).toBe(10_500);
  });

  /*
   * Lo que el truncamiento le hace al total, dicho con los dos números
   * pegados: el impuesto exacto de 162 345 es 11 364,15 y se cobran 11 364.
   * El total no se ajusta para que cierre con la cuenta exacta — un número
   * que no cierra **se muestra**, que es la lección que T-11 dejó escrita con
   * el residuo del plan de pagos.
   */
  it("el total encendido es la suma de los tres truncados, y no se ajusta", () => {
    const lineas = [
      { clase: "honorario", monto: HONORARIOS },
      { clase: "gasto_estimado", monto: GASTO },
    ] as const;

    const totales = totalesDe(lineas, CON_ITBMS);

    expect(totales.itbms).toBe(ITBMS);
    expect(totales.total).toBe(TOTAL_ENCENDIDO);

    // El impuesto exacto sería 11 364,15. Si el total se hubiera ajustado
    // hacia arriba para cerrar, sería 181 260.
    expect(totales.total).not.toBe(181_260);
  });

  /*
   * **El gasto estimado pasa sin gravar**, que es el punto 3 de la
   * investigación y el que más necesita a la contadora.
   *
   * Medido por la diferencia y no por la ausencia: las mismas dos líneas, una
   * de honorario y otra de gasto, con los montos **intercambiados**. Si el
   * impuesto cayera sobre el total, las dos lecturas darían lo mismo.
   */
  it("el ITBMS cae sólo sobre los honorarios y nunca sobre los gastos", () => {
    const masHonorarios = totalesDe(
      [
        { clase: "honorario", monto: 100_000 },
        { clase: "gasto_estimado", monto: 20_000 },
      ] as const,
      CON_ITBMS,
    );
    const masGastos = totalesDe(
      [
        { clase: "honorario", monto: 20_000 },
        { clase: "gasto_estimado", monto: 100_000 },
      ] as const,
      CON_ITBMS,
    );

    // 100 000 al 7 % son 7 000; 20 000 al 7 % son 1 400. Escritos a mano.
    expect(masHonorarios.itbms).toBe(7_000);
    expect(masGastos.itbms).toBe(1_400);

    // Los dos subtotales suman lo mismo —120 000—, y los totales no.
    expect(masHonorarios.total).toBe(127_000);
    expect(masGastos.total).toBe(121_400);
  });

  /*
   * Una cotización sin honorarios **con el impuesto encendido** lleva su
   * renglón en cero, y eso no es lo mismo que no llevarlo.
   *
   * La ausencia de la clave significa **una sola cosa**: el bufete no factura
   * ITBMS. Si un cero también se escribiera como ausencia, la ausencia pasaría
   * a significar dos cosas y la pantalla no podría distinguir «no te cobramos
   * impuesto» de «todavía no lo facturamos».
   */
  it("sin honorarios y encendido, el impuesto es cero y la clave está igual", () => {
    const totales = totalesDe(
      [{ clase: "gasto_estimado", monto: GASTO }] as const,
      CON_ITBMS,
    );

    expect(totales).toEqual({
      honorarios: 0,
      gastosEstimados: GASTO,
      itbms: 0,
      total: GASTO,
    });
    expect(totales).toHaveProperty("itbms");
  });
});

/* ==========================================================================
   3. Por el cable: el Worker contra D1
   ========================================================================== */

describe("el impuesto por la ruta de las líneas", () => {
  it("apagado no manda la clave, y encendido manda el impuesto y el total crecido", async () => {
    const id = await borradorConLineas();

    const sinImpuesto = await totalesEnElCable(id, apagado);
    const conImpuesto = await totalesEnElCable(id, encendido);

    expect(
      sinImpuesto,
      "el despliegue de hoy mandó un impuesto que la contadora no validó",
    ).toEqual({
      honorarios: HONORARIOS,
      gastosEstimados: GASTO,
      total: TOTAL_APAGADO,
    });

    expect(
      conImpuesto,
      "con `ITBMS_ACTIVO` puesta, la ruta no cobró el impuesto",
    ).toEqual({
      honorarios: HONORARIOS,
      gastosEstimados: GASTO,
      itbms: ITBMS,
      total: TOTAL_ENCENDIDO,
    });
  });

  /*
   * La variable mal escrita no enciende nada **por el cable tampoco**, y el
   * par está adentro: la misma cotización con `"true"` y con `"si"`.
   */
  it("una variable mal escrita deja la ruta apagada", async () => {
    const id = await borradorConLineas();

    const conTrue = await totalesEnElCable(id, (request) =>
      manejar(request, entorno("true"), {
        correoDeDesarrollo: () => EMAIL_AUTOR,
      }),
    );
    const conSi = await totalesEnElCable(id, encendido);

    expect(conTrue.total).toBe(TOTAL_APAGADO);
    expect(conTrue).not.toHaveProperty("itbms");

    expect(conSi.total).toBe(TOTAL_ENCENDIDO);
    expect(conSi.itbms).toBe(ITBMS);
  });
});

/* ==========================================================================
   4. El documento congelado no se mueve. Nunca.
   ========================================================================== */

describe("el snapshot de una emitida", () => {
  /*
   * **La prueba que el comentario de `snapshot.ts` anticipaba.**
   *
   * Ese archivo dice, desde T-4, que los totales entran al documento
   * congelado porque *«si mañana `totalesDe` cambia —el ITBMS de T-12—,
   * recalcular desde las líneas congeladas daría un número que nadie le
   * prometió a nadie»*. T-12 es ese mañana.
   *
   * ## Cómo está hecha para que no se pueda engañar
   *
   * Una prueba que emitiera apagada y leyera dos veces apagada no distingue
   * nada: las dos lecturas saldrían iguales con el impuesto implementado y
   * sin implementar. **El interruptor tiene que moverse entre las dos
   * lecturas**, y acá se mueve.
   *
   * Y aun así faltaría la mitad de presencia, porque un interruptor que no
   * hiciera absolutamente nada también haría pasar las dos lecturas iguales.
   * Por eso la misma corrida encendida emite **una segunda cotización, con
   * las mismas líneas**, y ésa sí tiene que llevar el impuesto congelado
   * adentro. Las dos mitades juntas dicen lo único que importa: el
   * interruptor funciona, y el papel de ayer no se enteró.
   */
  it("no cambia al encender el impuesto, y la que se emite después sí lo lleva", async () => {
    const vieja = await borradorConLineas();
    await emitir(vieja, apagado);

    const antes = await documentoDe(vieja, apagado);
    expect(antes.totales).toEqual({
      honorarios: HONORARIOS,
      gastosEstimados: GASTO,
      total: TOTAL_APAGADO,
    });

    /* --- Acá se enciende el impuesto. Nada más cambia. --- */

    const despues = await documentoDe(vieja, encendido);

    expect(
      despues,
      "encender el ITBMS movió un documento que el cliente ya tiene",
    ).toEqual(antes);
    expect(despues.totales).not.toHaveProperty("itbms");

    /* --- Y la mitad de presencia: el interruptor sí hace algo. --- */

    const nueva = await borradorConLineas();
    await emitir(nueva, encendido);

    const recien = await documentoDe(nueva, encendido);
    expect(
      recien.totales,
      "con el impuesto encendido, la emisión no congeló el ITBMS",
    ).toEqual({
      honorarios: HONORARIOS,
      gastosEstimados: GASTO,
      itbms: ITBMS,
      total: TOTAL_ENCENDIDO,
    });
  });

  /*
   * El otro sentido del mismo hecho, y el que importa el día que la contadora
   * diga que no: una emitida **con** el impuesto tampoco se descongela si el
   * interruptor se vuelve a apagar. El documento es un hecho histórico en las
   * dos direcciones, no una preferencia que se relee.
   */
  it("una emitida con impuesto lo conserva aunque el interruptor se apague", async () => {
    const id = await borradorConLineas();
    await emitir(id, encendido);

    const conElInterruptorPuesto = await documentoDe(id, encendido);
    expect(conElInterruptorPuesto.totales).toEqual({
      honorarios: HONORARIOS,
      gastosEstimados: GASTO,
      itbms: ITBMS,
      total: TOTAL_ENCENDIDO,
    });

    const conElInterruptorQuitado = await documentoDe(id, apagado);
    expect(
      conElInterruptorQuitado,
      "apagar el ITBMS borró el impuesto de un documento ya emitido",
    ).toEqual(conElInterruptorPuesto);
  });
});

/* ==========================================================================
   5. La base del porcentaje de una cuota
   ========================================================================== */

describe("la base del porcentaje de una cuota", () => {
  /*
   * **Incluye el ITBMS, y conviene dejar escrito por qué.**
   *
   * Una cuota no reparte los honorarios del bufete: reparte **lo que el
   * cliente debe**, que es el número grande del papel. Si la base excluyera el
   * impuesto, un plan del 100 % sumaría menos que la factura y la última cuota
   * no cerraría nunca — el cliente pagaría el plan entero y seguiría debiendo
   * el ITBMS.
   *
   * Y hay un segundo argumento, que es el que lo decide: T-11 midió que
   * «¿porcentaje de qué?» tiene **dos** respuestas y no una —cuelga de
   * cotización, hay base; cuelga de proceso, no hay—. Partir la base en
   * «con impuesto» y «sin impuesto» le daría una tercera, y la tercera
   * respuesta a una pregunta que ya costó una restricción de base de datos es
   * la que nadie se acuerda de mirar.
   *
   * Es la clase de cosa que nadie nota hasta que un cliente reclama, así que
   * acá queda medida: la misma cuota del 50 % sobre la misma cotización cobra
   * dos importes distintos según la posición del interruptor.
   */
  it("la misma cuota del 50 % cobra más con el impuesto encendido", async () => {
    const id = await borradorConLineas();

    const alta = await apagado(
      conCuerpo(`/api/cotizaciones/${id}/cuotas`, "POST", {
        concepto: "A la firma",
        porcentaje: CINCUENTA_POR_CIENTO_EN_BP,
        hito: "Firma del contrato",
      }),
    );
    expect(alta.status, await alta.clone().text()).toBe(201);

    async function planCon(
      llamar: (request: Request) => Promise<Response>,
    ): Promise<{ base: number | null; cuotas: { importe: number | null }[] }> {
      const respuesta = await llamar(peticion(`/api/cotizaciones/${id}/cuotas`));
      expect(respuesta.status, await respuesta.clone().text()).toBe(200);
      return (await respuesta.json()) as {
        base: number | null;
        cuotas: { importe: number | null }[];
      };
    }

    const sinImpuesto = await planCon(apagado);
    expect(sinImpuesto.base).toBe(TOTAL_APAGADO);
    expect(sinImpuesto.cuotas[0]?.importe).toBe(MEDIA_CUOTA_APAGADA);

    const conImpuesto = await planCon(encendido);
    expect(
      conImpuesto.base,
      "la base del porcentaje se quedó sin el impuesto que el cliente sí debe",
    ).toBe(TOTAL_ENCENDIDO);
    expect(conImpuesto.cuotas[0]?.importe).toBe(MEDIA_CUOTA_ENCENDIDA);
  });

  /*
   * Y el plan de un **proceso** no tiene base en ninguna de las dos
   * posiciones: un proceso suelto no tiene total del que ser porcentaje, y el
   * impuesto no se lo inventa. Sin esto, «la base incluye el ITBMS» podría
   * leerse como que ahora todo tiene base.
   */
  it("el plan de un proceso sigue sin base con el impuesto encendido", async () => {
    const areaId = nuevoId();
    const tipoProcesoId = nuevoId();
    const procesoId = nuevoId();
    const ahora = ahoraIso();

    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO area (id, tenant_id, nombre) VALUES (?, ?, ?)",
      ).bind(areaId, TENANT_UNICO_ID, "Migración del impuesto"),
      env.DB.prepare(
        "INSERT INTO tipo_proceso (id, tenant_id, area_id, nombre)" +
          " VALUES (?, ?, ?, ?)",
      ).bind(tipoProcesoId, TENANT_UNICO_ID, areaId, "Visa de trabajo"),
      env.DB.prepare(
        "INSERT INTO proceso (id, tenant_id, cliente_id, tipo_proceso_id," +
          " origen, titulo, estado, abierto_en)" +
          " VALUES (?, ?, ?, ?, 'directo', ?, 'abierto', ?)",
      ).bind(
        procesoId,
        TENANT_UNICO_ID,
        clienteId,
        tipoProcesoId,
        "Trámite suelto, sin cotización",
        ahora,
      ),
    ]);

    const respuesta = await encendido(
      peticion(`/api/procesos/${procesoId}/cuotas`),
    );
    expect(respuesta.status, await respuesta.clone().text()).toBe(200);

    const plan = (await respuesta.json()) as { base: number | null };
    expect(plan.base).toBeNull();
  });
});
