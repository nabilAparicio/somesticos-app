/**
 * El plan de pagos en pantalla (T-11, unidad B), sin navegador.
 *
 * Lo que esta suite existe para fijar:
 *
 *  1. **La pantalla no suma, no divide y no aplica porcentajes.** Los
 *     importes y el total llegan resueltos del servidor, y las pruebas de
 *     acá se lo demuestran de la única forma que vale: pasándole números que
 *     **no** son los que saldrían de calcularlos. Si alguna función
 *     calculara, saldría el otro número.
 *  2. **El residuo del truncamiento se muestra y no se arregla.** Tres
 *     cuotas del 33,33 % de mil dólares suman 999,90, y el cotejo lo dice
 *     con las dos cifras a la vista.
 *  3. **La conversión de puntos básicos**, con sus bordes, y con los valores
 *     esperados escritos aparte — nunca calculados con la función que se
 *     prueba (restricción 6 de la tajada).
 *  4. **La pantalla no ofrece lo que el servidor va a rechazar**: sin base no
 *     hay clase porcentual.
 *  5. La validación del borrador, que es la **segunda copia** de la del
 *     Worker y tiene que poder aflojarse sin matar las pruebas de aquélla.
 */
import { describe, expect, it } from "vitest";

import type { Cuota, PlanDePagos } from "../worker/contract";
import { PUNTOS_BASICOS_DEL_CIEN_POR_CIENTO } from "../worker/cuotas/dominio";
import {
  AVISO_EL_PLAN_NO_REGISTRA_COBROS,
  AYUDA_DEL_PLAN,
  BORRADOR_DE_CUOTA_VACIO,
  COMO_SE_COBRA,
  clasesDeCuotaDisponibles,
  cotejoDelPlan,
  normalizarBorradorDeCuota,
  porcentajeEditable,
  porcentajeLegible,
  puntosBasicosDesdeTexto,
  renglonesDelPlan,
  type BorradorDeCuota,
} from "../src/pantallas/cotizaciones/plan";

/* ==========================================================================
   Los valores de referencia, escritos a mano

   **Ninguno sale de la función que se prueba**, que es la restricción 6 de
   la tajada: calcular el esperado con lo que se prueba es lo que dejó
   invisible seis tajadas el defecto de las fechas.
   ========================================================================== */

/** Tres cuotas del 33,33 % de mil dólares: 333,30 cada una, 999,90 las tres. */
const TERCIO_EN_PUNTOS_BASICOS = 3_333;
const MIL_DOLARES = 100_000;
const TRES_TERCIOS = 99_990;

function cuota(parcial: Partial<Cuota>): Cuota {
  return {
    id: "c1",
    concepto: "Anticipo a la firma",
    monto: 150_000,
    porcentaje: null,
    venceEn: null,
    hito: "A la firma",
    importe: 150_000,
    creadaEn: "2026-10-25T15:00:00.000Z",
    ...parcial,
  };
}

/**
 * Un plan como el que manda el servidor: **entero**, con sus cuotas al lado
 * de su total y de su base.
 *
 * El ayudante trae una cuota por omisión a propósito. El cotejo depende de
 * si hay plan, así que un plan de referencia sin cuotas haría que cada
 * prueba del cotejo midiera, sin decirlo, el caso vacío.
 */
function plan(parcial: Partial<PlanDePagos>): PlanDePagos {
  return {
    cuotas: [cuota({})],
    total: TRES_TERCIOS,
    base: MIL_DOLARES,
    ...parcial,
  };
}

function borrador(parcial: Partial<BorradorDeCuota>): BorradorDeCuota {
  return { ...BORRADOR_DE_CUOTA_VACIO, ...parcial };
}

function motivos(resultado: ReturnType<typeof normalizarBorradorDeCuota>) {
  return resultado.ok ? [] : resultado.fallas.map((falla) => falla.motivo);
}

/* ==========================================================================
   La conversión de puntos básicos
   ========================================================================== */

describe("puntosBasicosDesdeTexto · de lo que se teclea a la unidad que se guarda", () => {
  it("lee un porcentaje con dos decimales", () => {
    expect(puntosBasicosDesdeTexto("33.33")).toEqual({
      ok: true,
      puntosBasicos: 3_333,
    });
  });

  it("lee un porcentaje redondo", () => {
    expect(puntosBasicosDesdeTexto("50")).toEqual({
      ok: true,
      puntosBasicos: 5_000,
    });
  });

  it("completa el decimal que falta por la derecha", () => {
    // «33.3» es treinta y tres con treinta, no con tres: el decimal que falta
    // es el de la derecha. Es el mismo borde que `centavosDesdeTexto`
    // defiende con `padEnd`, y acá se vuelve a medir porque esta función lo
    // hereda y heredarlo sin probarlo sería suponerlo.
    expect(puntosBasicosDesdeTexto("33.3")).toEqual({
      ok: true,
      puntosBasicos: 3_330,
    });
  });

  it("acepta el borde de abajo: un punto básico", () => {
    expect(puntosBasicosDesdeTexto("0.01")).toEqual({
      ok: true,
      puntosBasicos: 1,
    });
  });

  it("acepta el borde de arriba: el cien por ciento", () => {
    expect(puntosBasicosDesdeTexto("100")).toEqual({
      ok: true,
      puntosBasicos: PUNTOS_BASICOS_DEL_CIEN_POR_CIENTO,
    });
  });

  it("rechaza el cero, que no cobra nada", () => {
    expect(puntosBasicosDesdeTexto("0")).toEqual({ ok: false });
    expect(puntosBasicosDesdeTexto("0.00")).toEqual({ ok: false });
  });

  it("rechaza pasarse del cien por ciento, aunque sea por un punto básico", () => {
    expect(puntosBasicosDesdeTexto("100.01")).toEqual({ ok: false });
  });

  it("rechaza un tercer decimal, que la unidad no admite", () => {
    expect(puntosBasicosDesdeTexto("33.333")).toEqual({ ok: false });
  });

  it("rechaza lo que no es un número, y lo vacío", () => {
    expect(puntosBasicosDesdeTexto("")).toEqual({ ok: false });
    expect(puntosBasicosDesdeTexto("la mitad")).toEqual({ ok: false });
    expect(puntosBasicosDesdeTexto("-50")).toEqual({ ok: false });
  });

  it("un separador de miles queda fuera por el rango, sin una guarda propia", () => {
    // `"1,000"` parsea como 100000 puntos básicos y lo rechaza el tope. Una
    // guarda propia contra la coma sería la segunda que resuelve lo mismo, y
    // esta prueba es la que deja escrito que no hace falta.
    expect(puntosBasicosDesdeTexto("1,000")).toEqual({ ok: false });
  });

  it("la coma como decimal no se lee, y eso es deliberado", () => {
    // El punto es el separador decimal de toda esta aplicación —lo dicen las
    // ayudas de los tres formularios de dinero— y aceptar además la coma
    // haría que «1,5» fuera ambiguo contra «1,500».
    expect(puntosBasicosDesdeTexto("33,33")).toEqual({ ok: false });
  });
});

describe("porcentajeEditable y porcentajeLegible · de la unidad que se guarda a la pantalla", () => {
  it("escribe los decimales que dicen algo", () => {
    expect(porcentajeEditable(3_333)).toBe("33.33");
  });

  it("no escribe los ceros que no dicen nada", () => {
    // **Acá se separa de `montoEditable`**, que devolvería «50.00». Un
    // importe siempre lleva sus dos decimales porque vive en una columna que
    // se compara; un porcentaje vive pegado a su cuota.
    expect(porcentajeEditable(5_000)).toBe("50");
  });

  it("conserva el decimal del medio", () => {
    expect(porcentajeEditable(3_330)).toBe("33.3");
  });

  it("escribe el uno por ciento y el mínimo", () => {
    expect(porcentajeEditable(100)).toBe("1");
    expect(porcentajeEditable(1)).toBe("0.01");
  });

  it("da la vuelta completa con la conversión de ida", () => {
    // La prueba de ida y vuelta: lo que se escribe tiene que poder volver a
    // leerse sin tocar nada. Los valores van escritos a mano en los dos
    // lados, así que esto no es una tautología sobre una sola función.
    const casos: readonly [number, string][] = [
      [1, "0.01"],
      [100, "1"],
      [3_330, "33.3"],
      [3_333, "33.33"],
      [5_000, "50"],
      [10_000, "100"],
    ];

    for (const [puntosBasicos, escrito] of casos) {
      expect(porcentajeEditable(puntosBasicos)).toBe(escrito);
      expect(puntosBasicosDesdeTexto(escrito)).toEqual({
        ok: true,
        puntosBasicos,
      });
    }
  });

  it("un valor que no es un porcentaje devuelve el hueco y no un número inventado", () => {
    expect(porcentajeEditable(0)).toBe("—");
    expect(porcentajeEditable(10_001)).toBe("—");
    expect(porcentajeEditable(33.33)).toBe("—");
    expect(porcentajeEditable(Number.NaN)).toBe("—");
  });

  it("el legible le pone el signo, y sobre un hueco no le pone nada", () => {
    expect(porcentajeLegible(3_333)).toBe("33.33 %");
    expect(porcentajeLegible(10_000)).toBe("100 %");
    expect(porcentajeLegible(0)).toBe("—");
  });
});

/* ==========================================================================
   El cotejo: el residuo, a la vista
   ========================================================================== */

describe("cotejoDelPlan · el plan contra el total de la cotización", () => {
  it("dice que cierra cuando las dos cifras son la misma", () => {
    const cotejo = cotejoDelPlan(plan({ total: MIL_DOLARES, base: MIL_DOLARES }));

    expect(cotejo?.estado).toBe("exacto");
    expect(cotejo?.sumaLegible).toBe("1,000.00");
    expect(cotejo?.baseLegible).toBe("1,000.00");
  });

  /**
   * **El caso de los diez centavos, que es el que el bufete va a ver.**
   *
   * Tres cuotas del 33,33 % de mil dólares suman 999,90. El cotejo lo dice
   * con las dos cifras escritas, y su explicación nombra el truncamiento
   * para que quien arma el plan entienda de dónde salió el resto.
   *
   * Lo que **no** hace es repartirlo ni redondear para que cuadre: la suma
   * que se dibuja es la que llegó.
   */
  it("muestra el residuo con las dos cifras, y no lo redondea", () => {
    const cotejo = cotejoDelPlan(plan({}));

    expect(cotejo?.estado).toBe("incompleto");
    expect(cotejo?.sumaLegible).toBe("999.90");
    expect(cotejo?.baseLegible).toBe("1,000.00");
    // Y la explicación nombra el truncamiento: sin eso, «no cierra» manda a
    // buscar una cuota que falta cuando lo que falta es un centavo.
    expect(cotejo?.explicacion).toContain("33,33 %");
    expect(cotejo?.explicacion).toContain("trunca");
  });

  it("y dice que el sistema no reparte ese resto solo", () => {
    // La otra mitad: un sistema que redondea en silencio para que cuadre es
    // un sistema en el que nadie sabe cuánto va a pagar el cliente.
    expect(cotejoDelPlan(plan({}))?.explicacion).toContain("no reparte");
  });

  it("avisa cuando el plan se pasa del total", () => {
    const cotejo = cotejoDelPlan(plan({ total: 110_000, base: MIL_DOLARES }));

    expect(cotejo?.estado).toBe("excedido");
    expect(cotejo?.sumaLegible).toBe("1,100.00");
    expect(cotejo?.baseLegible).toBe("1,000.00");
  });

  it("sin base no hay cotejo, y la suma viaja igual", () => {
    const cotejo = cotejoDelPlan(plan({ total: 90_000, base: null }));

    expect(cotejo?.estado).toBe("sin_base");
    expect(cotejo?.sumaLegible).toBe("900.00");
    expect(cotejo?.baseLegible).toBeNull();
  });

  /* ------------------------------------------------------------------
     El plan que no existe todavía

     **Un plan vacío no es un plan que no cierra.** Hasta T-16 el cotejo se
     armaba igual sobre un borrador sin ninguna cuota: contra una cotización
     de mil dólares, la suma de cero daba «El plan no llega al total», con el
     párrafo del truncamiento de los porcentajes explicando un resto que
     nadie había producido. Era un aviso de desajuste sobre un acuerdo que
     no se había empezado a escribir.

     Las dos pruebas van juntas y ninguna sirve sola: la de ausencia la
     pasaría un cotejo que no se dibujara nunca, y es la de presencia la que
     lo impide.
     ------------------------------------------------------------------ */

  it("un plan sin ninguna cuota no tiene cotejo, porque no hay plan que cotejar", () => {
    expect(cotejoDelPlan(plan({ cuotas: [], total: 0 }))).toBeNull();
  });

  it("pero un plan con cuotas que no cierran sí lo tiene", () => {
    // La aserción de presencia al lado de la de ausencia: sin ésta, «no
    // devolver nunca un cotejo» pasaría la de arriba.
    const cotejo = cotejoDelPlan(plan({}));

    expect(cotejo).not.toBeNull();
    expect(cotejo?.estado).toBe("incompleto");
  });

  it("sin cuotas tampoco hay cotejo cuando no hay base contra la que comparar", () => {
    // El plan de un trámite suelto, todavía sin acordar: la ausencia de base
    // no es lo que decide, la ausencia de cuotas sí.
    expect(cotejoDelPlan(plan({ cuotas: [], total: 0, base: null }))).toBeNull();
  });

  it("y lo que decide es que no haya cuotas, no que la suma dé cero", () => {
    // La guarda se escribe sobre `cuotas`, no sobre `total`. Un plan con una
    // cuota de importe cero contra una cotización sin líneas **sí** es un
    // plan, y cierra exacto.
    const cotejo = cotejoDelPlan(
      plan({ cuotas: [cuota({ monto: 0, importe: 0 })], total: 0, base: 0 }),
    );

    expect(cotejo).not.toBeNull();
    expect(cotejo?.estado).toBe("exacto");
  });

  it("no clasifica lo que no es un importe en centavos enteros", () => {
    // La misma guarda que `lecturaDelSaldo` y por el mismo motivo: la
    // comparación es exacta **porque los dos son enteros**. Con un flotante
    // en el medio, dos cifras que valen lo mismo compararían distinto.
    expect(cotejoDelPlan(plan({ total: 1_000.5 }))?.estado).toBe("ilegible");
    expect(cotejoDelPlan(plan({ base: 1_000.5 }))?.estado).toBe("ilegible");
    expect(cotejoDelPlan(plan({ total: Number.NaN }))?.estado).toBe("ilegible");
  });

  /**
   * **La prueba que demuestra que la pantalla no resta.**
   *
   * Si `cotejoDelPlan` calculara la diferencia, la escribiría en alguna
   * parte de lo que devuelve. Ninguno de los tres textos contiene la cifra
   * que faltaría —«0.10»— y eso no es una ausencia cosmética: es la decisión
   * de que esta capa compara y no resta, para que no haya ningún número de
   * dinero que la pantalla haya inventado.
   *
   * La aserción de presencia al lado: las dos cifras que **sí** tienen que
   * aparecer, aparecen.
   */
  it("no escribe ninguna cifra que no haya llegado del servidor", () => {
    const cotejo = cotejoDelPlan(plan({}));
    const todo = `${String(cotejo?.titular)} ${String(
      cotejo?.sumaLegible,
    )} ${String(cotejo?.baseLegible)} ${String(cotejo?.explicacion)}`;

    expect(todo).toContain("999.90");
    expect(todo).toContain("1,000.00");
    expect(todo).not.toContain("0.10");
  });
});

/* ==========================================================================
   El cronograma: la pantalla muestra, no calcula
   ========================================================================== */

describe("renglonesDelPlan · el cronograma, listo para dibujar", () => {
  /**
   * **La prueba central de la unidad.**
   *
   * El `importe` que se le pasa **no es** el porcentaje aplicado a ninguna
   * base: la cuota dice 33,33 % y su importe declarado es 777,77. Si esta
   * función aplicara el porcentaje, saldría otro número.
   *
   * Es la lección que T-10 B pagó con el saldo: un doble coherente consigo
   * mismo no distingue una pantalla que muestra de una que calcula. Acá los
   * números están despegados a propósito.
   */
  it("escribe el importe que llegó, y no el que saldría de aplicar el porcentaje", () => {
    const renglones = renglonesDelPlan([
      cuota({
        monto: null,
        porcentaje: TERCIO_EN_PUNTOS_BASICOS,
        importe: 77_777,
      }),
    ]);

    expect(renglones[0].importeLegible).toBe("777.77");
    // Y el porcentaje se escribe igual, porque es el dato de la cuota: lo
    // que no se hace es derivar el importe de él.
    expect(renglones[0].comoSeCobra).toBe("33.33 % del total");
  });

  it("una cuota de importe fijo escribe su monto", () => {
    const renglones = renglonesDelPlan([
      cuota({ monto: 150_000, importe: 150_000 }),
    ]);

    expect(renglones[0].importeLegible).toBe("1,500.00");
    expect(renglones[0].comoSeCobra).toBe(
      COMO_SE_COBRA.monto_fijo.rotuloDelCampo,
    );
  });

  it("una cuota sin importe dice que no se sabe, y no cero", () => {
    // El servidor lo manda nulo en un solo caso —un porcentaje sin base— que
    // el `CHECK` hace imposible por la API pero que un script de importación
    // podría meter. «No se puede saber» no es «no cobra nada».
    const renglones = renglonesDelPlan([
      cuota({ monto: null, porcentaje: 5_000, importe: null }),
    ]);

    expect(renglones[0].importeLegible).toBe("—");
    expect(renglones[0].importeLegible).not.toBe("0.00");
  });

  it("dice cuándo se cobra, según cuál de los dos disparadores trajo", () => {
    const [porFecha, porHito] = renglonesDelPlan([
      cuota({ id: "c1", venceEn: "2026-06-30", hito: null }),
      cuota({ id: "c2", venceEn: null, hito: "Contra sentencia" }),
    ]);

    expect(porFecha.rotuloDelCuando).toBe("Vence");
    expect(porFecha.cuando).toContain("2026");
    expect(porHito.rotuloDelCuando).toBe("Contra hito");
    expect(porHito.cuando).toBe("Contra sentencia");
  });

  it("conserva el orden en que el servidor las mandó", () => {
    // El orden **es** el dato: es el orden en que el abogado dictó el plan.
    // Reordenar acá sería contar el cronograma al revés de como lo cuenta el
    // servidor.
    const renglones = renglonesDelPlan([
      cuota({ id: "c1", concepto: "A la firma", venceEn: null, hito: "Firma" }),
      cuota({ id: "c2", concepto: "Al mes", venceEn: "2026-01-31", hito: null }),
      cuota({ id: "c3", concepto: "Al cierre", venceEn: null, hito: "Cierre" }),
    ]);

    expect(renglones.map((uno) => uno.concepto)).toEqual([
      "A la firma",
      "Al mes",
      "Al cierre",
    ]);
  });

  it("un plan vacío no tiene renglones, y no es un caso especial", () => {
    expect(renglonesDelPlan([])).toEqual([]);
  });
});

/* ==========================================================================
   Lo que la pantalla ofrece
   ========================================================================== */

describe("clasesDeCuotaDisponibles · la pantalla no ofrece lo que el servidor rechaza", () => {
  it("con una cotización detrás, las dos clases", () => {
    expect(clasesDeCuotaDisponibles(MIL_DOLARES)).toEqual([
      "monto_fijo",
      "porcentaje",
    ]);
  });

  it("sin base, el porcentaje no se ofrece", () => {
    // **Es la lección de la unidad B de T-2**: un control que existe es una
    // promesa. Un proceso suelto no tiene total del que ser porcentaje, y la
    // base lo rechaza con
    // `un_porcentaje_sin_cotizacion_no_tiene_de_que_ser_porcentaje`.
    //
    // Hoy el único llamador es la pantalla de la cotización, donde la base
    // siempre es un número, así que este caso **no tiene pantalla pero sí
    // tiene prueba**: es la forma de que la decisión no se pierda hasta que
    // el plan cuelgue también de un proceso.
    expect(clasesDeCuotaDisponibles(null)).toEqual(["monto_fijo"]);
  });

  it("una cotización sin líneas sigue teniendo base, aunque sea cero", () => {
    // Cero **no** es «sin base»: una cotización sin líneas tiene un total, y
    // es cero. Confundir los dos escondería el porcentaje justo en el
    // borrador que todavía no tiene líneas, que es cuando el plan se arma.
    expect(clasesDeCuotaDisponibles(0)).toEqual(["monto_fijo", "porcentaje"]);
  });
});

describe("los textos de la sección", () => {
  it("el aviso dice que el plan no registra cobros", () => {
    // Es el reverso de una decisión de la unidad A: `cuota` no tiene
    // `pagada_en`. Una lista de cuotas sin esta aclaración se lee como un
    // estado de cuenta, y alguien la va a mirar para saber qué le falta
    // cobrar.
    expect(AVISO_EL_PLAN_NO_REGISTRA_COBROS).toContain("no lo que se cobró");
  });

  it("la ayuda explica que es un cronograma y no una modalidad", () => {
    expect(AYUDA_DEL_PLAN).toContain("cronograma");
    expect(AYUDA_DEL_PLAN).toContain("50/50");
  });
});

/* ==========================================================================
   El borrador
   ========================================================================== */

describe("normalizarBorradorDeCuota · la segunda copia de las reglas del Worker", () => {
  it("arma una cuota de importe fijo contra un hito", () => {
    const resultado = normalizarBorradorDeCuota(
      borrador({
        concepto: "Anticipo a la firma",
        clase: "monto_fijo",
        cifra: "1500.00",
        disparador: "hito",
        hito: "A la firma",
      }),
    );

    expect(resultado).toEqual({
      ok: true,
      datos: {
        concepto: "Anticipo a la firma",
        monto: 150_000,
        porcentaje: null,
        venceEn: null,
        hito: "A la firma",
      },
    });
  });

  it("arma una cuota porcentual contra una fecha", () => {
    const resultado = normalizarBorradorDeCuota(
      borrador({
        concepto: "El saldo",
        clase: "porcentaje",
        cifra: "33.33",
        disparador: "fecha",
        venceEn: "2026-06-30",
      }),
    );

    expect(resultado).toEqual({
      ok: true,
      datos: {
        concepto: "El saldo",
        monto: null,
        porcentaje: 3_333,
        venceEn: "2026-06-30",
        hito: null,
      },
    });
  });

  /**
   * **Las dos exclusividades salen estructuralmente y no de una guarda.**
   *
   * El borrador tiene un solo campo de cifra y un disparador que elige cuál
   * de los dos campos de «cuándo» se llena, así que una cuota con monto
   * **y** porcentaje, o con fecha **y** hito, no se puede ni construir desde
   * acá. Estas dos pruebas lo miden sobre lo que sale: siempre exactamente
   * uno de cada par es nulo.
   */
  it("de cada par de exclusividad sale exactamente uno, siempre", () => {
    const casos: readonly BorradorDeCuota[] = [
      borrador({
        concepto: "a",
        clase: "monto_fijo",
        cifra: "10",
        disparador: "hito",
        hito: "x",
      }),
      borrador({
        concepto: "b",
        clase: "porcentaje",
        cifra: "10",
        disparador: "fecha",
        venceEn: "2026-06-30",
      }),
    ];

    for (const caso of casos) {
      const resultado = normalizarBorradorDeCuota(caso);
      expect(resultado.ok).toBe(true);
      if (!resultado.ok) continue;

      expect(resultado.datos.monto === null).toBe(
        resultado.datos.porcentaje !== null,
      );
      expect(resultado.datos.venceEn === null).toBe(
        resultado.datos.hito !== null,
      );
    }
  });

  it("sin clase elegida, pide elegir una de las dos formas de cobrar", () => {
    expect(
      motivos(
        normalizarBorradorDeCuota(
          borrador({ concepto: "a", disparador: "hito", hito: "x" }),
        ),
      ),
    ).toContain("monto_o_porcentaje");
  });

  it("sin disparador elegido, pide decir cuándo se cobra", () => {
    expect(
      motivos(
        normalizarBorradorDeCuota(
          borrador({ concepto: "a", clase: "monto_fijo", cifra: "10" }),
        ),
      ),
    ).toContain("vencimiento_o_hito");
  });

  it("un hito en blanco cuenta como ausente", () => {
    // La base lo rechaza con `el_hito_de_la_cuota_no_esta_en_blanco` porque
    // un `''` derrotaría la exclusividad. Acá se contesta antes, con el
    // motivo que dice que falta elegir cuándo.
    expect(
      motivos(
        normalizarBorradorDeCuota(
          borrador({
            concepto: "a",
            clase: "monto_fijo",
            cifra: "10",
            disparador: "hito",
            hito: "   ",
          }),
        ),
      ),
    ).toContain("vencimiento_o_hito");
  });

  it("un importe de cero no cobra nada, y se rechaza", () => {
    // **Al revés que un movimiento de gasto**, que admite cero. Una cuota es
    // una obligación que el cliente lee y firma, y un renglón de cero
    // promete un cobro que no existe.
    expect(
      motivos(
        normalizarBorradorDeCuota(
          borrador({
            concepto: "a",
            clase: "monto_fijo",
            cifra: "0",
            disparador: "hito",
            hito: "x",
          }),
        ),
      ),
    ).toContain("monto_invalido");
  });

  it("un porcentaje fuera de rango se rechaza con su propio motivo", () => {
    // `porcentaje_invalido` y no `monto_invalido`: la frase de uno debajo
    // del campo del otro manda a corregir algo que nadie tocó.
    expect(
      motivos(
        normalizarBorradorDeCuota(
          borrador({
            concepto: "a",
            clase: "porcentaje",
            cifra: "150",
            disparador: "hito",
            hito: "x",
          }),
        ),
      ),
    ).toEqual(["porcentaje_invalido"]);
  });

  it("una fecha que no es un día del calendario se rechaza", () => {
    expect(
      motivos(
        normalizarBorradorDeCuota(
          borrador({
            concepto: "a",
            clase: "monto_fijo",
            cifra: "10",
            disparador: "fecha",
            venceEn: "2026-02-31",
          }),
        ),
      ),
    ).toContain("vencimiento_invalido");
  });

  it("una fecha en el pasado se acepta, porque un plan viejo se carga hoy", () => {
    // Al revés que el vencimiento de una cotización y que la fecha de un
    // gasto. La primera cuota de un encargo que empezó el mes pasado venció
    // antes de que nadie la escribiera.
    const resultado = normalizarBorradorDeCuota(
      borrador({
        concepto: "La primera, ya vencida",
        clase: "monto_fijo",
        cifra: "500",
        disparador: "fecha",
        venceEn: "2020-01-15",
      }),
    );

    expect(resultado.ok).toBe(true);
  });

  it("sin concepto no hay cuota", () => {
    expect(
      motivos(
        normalizarBorradorDeCuota(
          borrador({
            concepto: "   ",
            clase: "monto_fijo",
            cifra: "10",
            disparador: "hito",
            hito: "x",
          }),
        ),
      ),
    ).toContain("concepto_requerido");
  });

  it("devuelve todas las fallas y no la primera", () => {
    const todas = motivos(normalizarBorradorDeCuota(BORRADOR_DE_CUOTA_VACIO));

    expect(todas).toContain("concepto_requerido");
    expect(todas).toContain("monto_o_porcentaje");
    expect(todas).toContain("vencimiento_o_hito");
  });

  it("el borrador vacío no trae nada elegido", () => {
    // Una clase preseleccionada es la que hace cargar una cifra cerrada
    // donde alguien quería un porcentaje, y «50» se ve igual en los dos
    // casos.
    expect(BORRADOR_DE_CUOTA_VACIO.clase).toBe("");
    expect(BORRADOR_DE_CUOTA_VACIO.disparador).toBe("");
  });
});
