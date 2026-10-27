/**
 * La lógica del editor de líneas de honorarios y gastos estimados
 * (T-3, unidad B).
 *
 * Lo que se prueba acá es **lógica pura**: la conversión entre centavos y lo
 * que una persona teclea, el reparto de las líneas en sus dos familias, el
 * movimiento dentro de una familia, el borrador de cada campo con su
 * validación y la decisión de cuándo una negativa obliga a recargar. Nada de
 * esto importa React ni toca el DOM, y por eso corre en el mismo corredor que
 * la API en vez de arrastrar un navegador. Lo que sí necesita un navegador
 * —que los botones estén cableados a estas funciones, que el gasto se vea
 * rotulado como aproximado y que la pantalla muestre los totales del
 * servidor en vez de sumarlos— vive en `e2e/cotizaciones.spec.ts`.
 *
 * ## La pantalla no suma, y acá no hay ninguna suma que probar
 *
 * `totalesDe` vive en `worker/cotizaciones/lineas.ts` y la respuesta de cada
 * una de las cinco rutas ya trae los totales. **No hay un solo `+` sobre
 * dinero en `src/pantallas/cotizaciones/lineas.ts`**, y la prueba de abajo
 * que más se parece a una de aritmética —la de `familiasDeLineas`— es la que
 * demuestra lo contrario: le pasa unos totales que **no** coinciden con la
 * suma de las líneas y exige que lo que salga sean los totales, no la suma.
 * Si alguien metiera la suma en la pantalla, esa prueba muere.
 *
 * ## Ninguna expectativa se calcula con la función que se prueba
 *
 * Restricción 6 de la tajada. Los centavos esperados se escriben a mano, los
 * textos esperados también, y las listas se comparan contra arreglos
 * literales y nunca contra el resultado de `ordenDeLineas` ni de
 * `lineasOrdenadas`. La única prueba que usa las dos direcciones de la
 * conversión a la vez —la de ida y vuelta— está además cubierta por los
 * bordes de cada dirección por separado, así que relajar una de las dos mata
 * sus propias pruebas antes de llegar a la del ciclo.
 *
 * ## El catálogo se importa, no se copia
 *
 * Las clases salen de `worker/cotizaciones/lineas.ts`, que es el mismo
 * registro contra el que valida el servidor y la mitad acoplada del `CHECK`
 * de `migrations/0004_cotizaciones.sql`. Una tercera copia en `src/` sería
 * el defecto que esa migración y ese registro existen para impedir.
 */
import { describe, expect, it } from "vitest";

import type {
  CategoriaDelArancel,
  FallaDeValidacion,
  LineaDeCotizacion,
  RenglonDelArancel,
  TipoProceso,
  TotalesDeCotizacion,
} from "../worker/contract";
import { CATALOGO_DE_CLASES } from "../worker/cotizaciones/lineas";
import {
  AYUDA_DEL_SERVICIO,
  AYUDA_DE_LA_LISTA,
  BORRADOR_DE_LINEA_VACIO,
  ROTULOS_DE_LA_LINEA,
  ROTULO_DE_LISTAR_TODOS,
  SIN_SERVICIOS_OFRECIBLES,
  TITULO_DE_LA_LISTA,
  TOTALES_EN_CERO,
  moverOpcionActiva,
  sinCoincidencias,
  avisoDePrecios,
  borradorDesdeLinea,
  centavosDesdeTexto,
  enlaceALosPrecios,
  exigeRecarga,
  familiasDeLineas,
  renglonDelImpuesto,
  hayCambioEnLinea,
  hayGastoEstimado,
  lineasOrdenadas,
  montoEditable,
  montoLegible,
  importeLegible,
  moverLinea,
  normalizarBorradorDeLinea,
  ordenDeLineas,
  podarBorradoresDeLinea,
  conServicioElegido,
  prellenarDesdeServicio,
  avisoDeTramites,
  servicioDeLaLinea,
  sinServicioTarifado,
  tramiteDeLaLinea,
  tramitesSeleccionables,
  type BorradorDeLinea,
} from "../src/pantallas/cotizaciones/lineas";
import {
  LEYENDA_DE_LA_MARCA,
  MARCA_DE_EDITADO,
  rotuloDeServicio,
  serviciosOfrecibles,
  serviciosPorCategoria,
  serviciosQueCoinciden,
  textoDelServicioElegido,
} from "../src/pantallas/catalogos/precios";
import { ROTULO_DEL_ITBMS } from "../worker/cotizaciones/lineas";

const UNO = "11111111-1111-4111-8111-111111111111";
const DOS = "22222222-2222-4222-8222-222222222222";
const TRES = "33333333-3333-4333-8333-333333333333";
const CUATRO = "44444444-4444-4444-8444-444444444444";

const TRAMITE = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";

function linea(ajustes: Partial<LineaDeCotizacion> = {}): LineaDeCotizacion {
  return {
    id: UNO,
    clase: "honorario",
    concepto: "Gestión de la visa de trabajo",
    monto: 150_000,
    tipoProcesoId: null,
    tipoProcesoNombre: null,
    // Sin procedencia: el monto lo escribió una persona. El prellenado desde
    // el arancel es T-2 de `odd/tasks/precios-en-la-cotizacion.md`, y hasta
    // entonces este doble refleja lo único que el sistema produce.
    arancelRenglonId: null,
    arancelConcepto: null,
    orden: 0,
    ...ajustes,
  };
}

function borrador(ajustes: Partial<BorradorDeLinea> = {}): BorradorDeLinea {
  return { ...BORRADOR_DE_LINEA_VACIO, ...ajustes };
}

function motivos(fallas: readonly FallaDeValidacion[]): string[] {
  return fallas.map((falla) => falla.motivo);
}

/**
 * Dos honorarios y dos gastos, **entrelazados** en el `orden` global.
 *
 * Entrelazados a propósito: la pantalla muestra las dos familias separadas
 * pero el `orden` que la base guarda es uno solo para las cuatro, así que
 * una lista donde cada familia viniera en bloque dejaría pasar un reparto
 * que simplemente parte el arreglo por la mitad.
 */
function cuatroLineas(): LineaDeCotizacion[] {
  return [
    linea({ id: UNO, clase: "honorario", monto: 150_000, orden: 0 }),
    linea({ id: DOS, clase: "gasto_estimado", monto: 25_000, orden: 1 }),
    linea({ id: TRES, clase: "honorario", monto: 80_000, orden: 2 }),
    linea({ id: CUATRO, clase: "gasto_estimado", monto: 1_050, orden: 3 }),
  ];
}

// ---------------------------------------------------------------------------
// El catálogo, y que de verdad venga del Worker
// ---------------------------------------------------------------------------

describe("el catálogo de clases", () => {
  /*
   * Los dos rótulos van escritos a mano y **no** derivados del catálogo:
   * una expectativa calculada con la misma fuente que se prueba pasa aunque
   * las dos estén mal (restricción 6). Que agregar una clase obligue a
   * tocar esta lista es la gracia y no el costo: agregar una clase es un
   * despliegue, y el `CHECK` de la migración también hay que moverlo a mano.
   */
  it("tiene las dos clases, en el orden en que se muestran", () => {
    expect(CATALOGO_DE_CLASES.map((entrada) => entrada.clase)).toEqual([
      "honorario",
      "gasto_estimado",
    ]);
    expect(CATALOGO_DE_CLASES.map((entrada) => entrada.rotulo)).toEqual([
      "Honorarios",
      "Gastos estimados",
    ]);
  });

  /*
   * El rótulo del gasto es **lo único** que dice que esa cifra es
   * aproximada en el registro mismo. Si alguien lo acortara a «Gastos», la
   * pantalla seguiría dibujando una sección de dinero sin decir que va a
   * cambiar, que es justamente la promesa que el bufete no puede cumplir.
   */
  it("el rótulo del gasto dice que es estimado", () => {
    const gasto = CATALOGO_DE_CLASES.find(
      (entrada) => entrada.clase === "gasto_estimado",
    );
    expect(gasto?.rotulo).toBe("Gastos estimados");
  });
});

// ---------------------------------------------------------------------------
// La conversión centavos ↔ pantalla. El único lugar donde un monto toca una
// coma, y el único con dos direcciones que probar por los bordes.
// ---------------------------------------------------------------------------

describe("centavosDesdeTexto", () => {
  it("lee el cero", () => {
    expect(centavosDesdeTexto("0")).toEqual({ ok: true, centavos: 0 });
  });

  it("lee un centavo", () => {
    expect(centavosDesdeTexto("0.01")).toEqual({ ok: true, centavos: 1 });
  });

  it("lee un importe con dos decimales", () => {
    expect(centavosDesdeTexto("12.34")).toEqual({ ok: true, centavos: 1234 });
  });

  it("rellena el segundo decimal cuando sólo viene uno", () => {
    // «12.5» son doce dólares con cincuenta y no con cinco: el decimal que
    // falta se completa a la derecha, que es como se lee un importe.
    expect(centavosDesdeTexto("12.5")).toEqual({ ok: true, centavos: 1250 });
  });

  it("lee un importe sin decimales", () => {
    expect(centavosDesdeTexto("1234")).toEqual({
      ok: true,
      centavos: 123_400,
    });
  });

  it("acepta el separador de miles", () => {
    expect(centavosDesdeTexto("1,234.56")).toEqual({
      ok: true,
      centavos: 123_456,
    });
  });

  it("acepta varios grupos de miles", () => {
    expect(centavosDesdeTexto("1,234,567.89")).toEqual({
      ok: true,
      centavos: 123_456_789,
    });
  });

  it("recorta los espacios de los dos lados", () => {
    expect(centavosDesdeTexto("  12.34  ")).toEqual({
      ok: true,
      centavos: 1234,
    });
  });

  it("rechaza un tercer decimal", () => {
    // El borde que de verdad importa: un centavo partido no existe, y
    // aceptarlo redondeando metería una decisión aritmética en la pantalla.
    expect(centavosDesdeTexto("12.345")).toEqual({ ok: false });
  });

  it("rechaza lo vacío", () => {
    expect(centavosDesdeTexto("")).toEqual({ ok: false });
    expect(centavosDesdeTexto("   ")).toEqual({ ok: false });
  });

  it("rechaza un negativo", () => {
    expect(centavosDesdeTexto("-5")).toEqual({ ok: false });
    expect(centavosDesdeTexto("-0.01")).toEqual({ ok: false });
  });

  /*
   * La coma es **separador de miles y nunca decimal**, porque en Panamá el
   * dólar se escribe así y porque aceptar las dos cosas vuelve ambiguo
   * `1,234`: no hay forma de saber si son mil doscientos treinta y cuatro o
   * uno con veintitrés. Un rechazo dice qué arreglar; una adivinanza manda
   * al cliente un importe mil veces más grande.
   */
  it("rechaza la coma usada como decimal", () => {
    expect(centavosDesdeTexto("12,34")).toEqual({ ok: false });
  });

  it("rechaza los miles mal agrupados", () => {
    expect(centavosDesdeTexto("1,23,456")).toEqual({ ok: false });
    expect(centavosDesdeTexto("12,3456")).toEqual({ ok: false });
  });

  it("rechaza un punto sin decimales detrás", () => {
    expect(centavosDesdeTexto("12.")).toEqual({ ok: false });
  });

  it("rechaza un decimal sin entero delante", () => {
    expect(centavosDesdeTexto(".50")).toEqual({ ok: false });
  });

  it("rechaza lo que no es un número", () => {
    expect(centavosDesdeTexto("abc")).toEqual({ ok: false });
    expect(centavosDesdeTexto("1e3")).toEqual({ ok: false });
    expect(centavosDesdeTexto("$12.34")).toEqual({ ok: false });
    expect(centavosDesdeTexto("1 234.56")).toEqual({ ok: false });
  });

  /*
   * Por encima de 2^53 los enteros dejan de ser distinguibles entre sí, así
   * que un importe de ese tamaño ya no es el número que alguien escribió.
   * Es el mismo borde que `normalizarLinea` defiende en el Worker con
   * `Number.isSafeInteger`, y acá se defiende **antes** de mandarlo.
   */
  it("rechaza un importe que no cabe en un entero seguro", () => {
    expect(centavosDesdeTexto("99999999999999999.99")).toEqual({ ok: false });
  });

  it("acepta el importe más grande que todavía cabe", () => {
    // 90071992547409.91 son 9007199254740991 centavos, que es 2^53 − 1.
    expect(centavosDesdeTexto("90071992547409.91")).toEqual({
      ok: true,
      centavos: 9_007_199_254_740_991,
    });
  });

  it("acepta ceros a la izquierda", () => {
    expect(centavosDesdeTexto("007")).toEqual({ ok: true, centavos: 700 });
  });
});

describe("montoEditable", () => {
  it("escribe el cero con sus dos decimales", () => {
    expect(montoEditable(0)).toBe("0.00");
  });

  it("escribe un centavo", () => {
    expect(montoEditable(1)).toBe("0.01");
  });

  it("escribe los centavos de dos cifras sin perder el cero de adelante", () => {
    expect(montoEditable(5)).toBe("0.05");
    expect(montoEditable(150_005)).toBe("1500.05");
  });

  it("no agrupa los miles: es lo que vuelve al campo de texto", () => {
    // El campo editable no lleva separador para que lo que se lee ahí sea
    // exactamente lo que se puede volver a mandar sin tocar nada.
    expect(montoEditable(123_456_789)).toBe("1234567.89");
  });

  it("dice el hueco cuando el valor no es un importe", () => {
    expect(montoEditable(-1)).toBe("—");
    expect(montoEditable(1.5)).toBe("—");
    expect(montoEditable(Number.NaN)).toBe("—");
  });
});

describe("montoLegible", () => {
  it("agrupa los miles con coma y separa los centavos con punto", () => {
    expect(montoLegible(123_456_789)).toBe("1,234,567.89");
  });

  it("no agrupa lo que no llega a mil", () => {
    expect(montoLegible(99_999)).toBe("999.99");
  });

  it("agrupa a partir del primer millar", () => {
    expect(montoLegible(100_000)).toBe("1,000.00");
  });

  it("escribe el cero completo", () => {
    expect(montoLegible(0)).toBe("0.00");
  });

  it("dice el hueco cuando el valor no es un importe", () => {
    expect(montoLegible(-1)).toBe("—");
  });
});

describe("importeLegible", () => {
  it("antepone la moneda de la cotización", () => {
    expect(importeLegible(123_456, "USD")).toBe("USD 1,234.56");
  });

  it("no inventa una moneda sobre un hueco", () => {
    expect(importeLegible(-1, "USD")).toBe("—");
  });
});

describe("la conversión de ida y vuelta", () => {
  /*
   * Esta es la única prueba que usa las dos direcciones juntas, y por eso
   * no es la que sostiene ninguna de las dos: los bordes de cada una están
   * escritos a mano más arriba. Lo que agrega es que el texto que la
   * pantalla pone en el campo sea texto que la pantalla sepa volver a leer
   * —si no, editar una línea sin tocarla la volvería inválida—.
   */
  for (const centavos of [0, 1, 99, 100, 1234, 123_456_789]) {
    it(`${String(centavos)} centavos vuelven a ser los mismos`, () => {
      const texto = montoEditable(centavos);
      expect(centavosDesdeTexto(texto)).toEqual({ ok: true, centavos });
    });
  }
});

// ---------------------------------------------------------------------------
// El renglón del ITBMS (T-12)
// ---------------------------------------------------------------------------

describe("renglonDelImpuesto", () => {
  /*
   * **El par que decide la pantalla**, y las dos mitades están en la misma
   * prueba a propósito.
   *
   * Un «no hay renglón» solo no mide nada: pasaría con la función devolviendo
   * `null` siempre, con el campo mal leído y con el archivo sin escribir. La
   * mitad de presencia es la que lo ancla — y las dos entradas se diferencian
   * **sólo** en la clave `itbms`, así que ninguna puede satisfacer a la otra.
   */
  it("no hay renglón sin la clave, y sí lo hay con ella", () => {
    const apagado: TotalesDeCotizacion = {
      honorarios: 162_345,
      gastosEstimados: 7_550,
      total: 169_895,
    };

    expect(
      renglonDelImpuesto(apagado),
      "la pantalla dibujó un ITBMS que el bufete no factura",
    ).toBeNull();

    const encendido: TotalesDeCotizacion = {
      honorarios: 162_345,
      gastosEstimados: 7_550,
      itbms: 11_364,
      total: 181_259,
    };

    expect(renglonDelImpuesto(encendido)).toEqual({
      rotulo: ROTULO_DEL_ITBMS,
      importe: 11_364,
    });
  });

  /*
   * **Cero no es ausencia**, que es la decisión entera de T-12 vista desde la
   * pantalla.
   *
   * Con el impuesto encendido y sin honorarios, el renglón va igual y dice
   * 0,00: ahí el cero es verdad. Si esta función escondiera los ceros, la
   * ausencia pasaría a significar dos cosas —«no te cobramos impuesto» y «el
   * bufete todavía no lo factura»— y el cliente no podría distinguirlas.
   */
  it("un impuesto de cero sí tiene renglón, porque cero no es ausencia", () => {
    const soloGastos: TotalesDeCotizacion = {
      honorarios: 0,
      gastosEstimados: 7_550,
      itbms: 0,
      total: 7_550,
    };

    expect(renglonDelImpuesto(soloGastos)).toEqual({
      rotulo: ROTULO_DEL_ITBMS,
      importe: 0,
    });
  });

  /*
   * **No calcula.** Se le pasa un impuesto que no es el 7 % de esos
   * honorarios y tiene que salir el que llegó, igual que `familiasDeLineas`
   * con los subtotales. Es la barandilla de siempre: si alguien metiera el
   * cálculo en la pantalla, habría dos aritméticas del impuesto y esta prueba
   * es la que muere.
   */
  it("muestra el impuesto que llegó y no el que correspondería", () => {
    const incoherente: TotalesDeCotizacion = {
      honorarios: 100_000,
      gastosEstimados: 0,
      // El 7 % de 100 000 son 7 000. Esto no lo es, a propósito.
      itbms: 1,
      total: 100_001,
    };

    expect(renglonDelImpuesto(incoherente)?.importe).toBe(1);
  });

  /** El rótulo sale del Worker y no se escribe otra vez acá. */
  it("el rótulo nombra el impuesto y su tarifa", () => {
    const totales: TotalesDeCotizacion = {
      honorarios: 0,
      gastosEstimados: 0,
      itbms: 0,
      total: 0,
    };

    expect(renglonDelImpuesto(totales)?.rotulo).toContain("ITBMS");
    expect(renglonDelImpuesto(totales)?.rotulo).toContain("7");
  });

  /** `TOTALES_EN_CERO`, que es lo que la pantalla usa antes de la primera
   *  respuesta, tampoco dibuja impuesto. Sin esto, un renglón de ITBMS
   *  aparecería durante la carga y desaparecería al llegar la respuesta. */
  it("los totales de arranque no traen impuesto", () => {
    expect(renglonDelImpuesto(TOTALES_EN_CERO)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Las dos familias
// ---------------------------------------------------------------------------

describe("familiasDeLineas", () => {
  /*
   * **La prueba de la barandilla.** Los totales que se le pasan no son la
   * suma de las líneas: la suma daría 230.000 en honorarios y 26.050 en
   * gastos. Lo que tiene que salir son los números que llegaron, porque
   * quien suma es el servidor. Si alguien metiera la suma en la pantalla,
   * esta prueba es la que muere.
   */
  it("muestra los subtotales que llegaron y no la suma de las líneas", () => {
    const delServidor: TotalesDeCotizacion = {
      honorarios: 777_777,
      gastosEstimados: 111_111,
      total: 888_888,
    };

    const familias = familiasDeLineas(cuatroLineas(), delServidor, true);

    expect(familias.map((familia) => familia.subtotal)).toEqual([
      777_777, 111_111,
    ]);
  });

  it("reparte cada línea en su familia, en el orden del catálogo", () => {
    const familias = familiasDeLineas(cuatroLineas(), TOTALES_EN_CERO, true);

    expect(familias.map((familia) => familia.clase)).toEqual([
      "honorario",
      "gasto_estimado",
    ]);
    expect(familias[0].lineas.map((una) => una.id)).toEqual([UNO, TRES]);
    expect(familias[1].lineas.map((una) => una.id)).toEqual([DOS, CUATRO]);
  });

  it("rotula cada familia con el rótulo del catálogo", () => {
    const familias = familiasDeLineas([], TOTALES_EN_CERO, true);

    expect(familias.map((familia) => familia.rotulo)).toEqual([
      "Honorarios",
      "Gastos estimados",
    ]);
  });

  /*
   * La marca que la pantalla usa para poner el aviso de que esa cifra va a
   * cambiar. Está acá y no en el `.tsx` para que se pueda afirmar sin montar
   * un navegador, y es `clase === "gasto_estimado"` y no una columna del
   * catálogo por lo que explica `worker/cotizaciones/lineas.ts`: una bandera
   * paralela es la que mañana dice otra cosa que el rótulo.
   */
  it("marca como aproximada la familia del gasto y sólo ésa", () => {
    const familias = familiasDeLineas([], TOTALES_EN_CERO, true);

    expect(familias.map((familia) => familia.aproximado)).toEqual([
      false,
      true,
    ]);
  });

  it("el subtotal del gasto se rotula como aproximado", () => {
    const familias = familiasDeLineas([], TOTALES_EN_CERO, true);

    expect(familias.map((familia) => familia.rotuloDelSubtotal)).toEqual([
      "Subtotal",
      "Subtotal aproximado",
    ]);
  });

  it("sobre un borrador muestra las dos familias aunque estén vacías", () => {
    // Vacías y todas, porque es donde se agregan: una familia que no se
    // dibuja hasta tener su primera línea esconde la mitad del documento.
    const familias = familiasDeLineas([], TOTALES_EN_CERO, true);
    expect(familias).toHaveLength(2);
  });

  it("sobre lo que ya salió del borrador calla la familia sin líneas", () => {
    // Acá no hay nada que agregar, así que una sección vacía con su
    // subtotal en cero es ruido sobre un documento que el cliente ya tiene.
    const soloHonorarios = [linea({ id: UNO, clase: "honorario" })];
    const familias = familiasDeLineas(
      soloHonorarios,
      TOTALES_EN_CERO,
      false,
    );

    expect(familias.map((familia) => familia.clase)).toEqual(["honorario"]);
  });

  it("no toca el arreglo que recibe, que puede ser estado de React", () => {
    const original = cuatroLineas();
    familiasDeLineas(original, TOTALES_EN_CERO, true);

    expect(original.map((una) => una.id)).toEqual([UNO, DOS, TRES, CUATRO]);
  });
});

describe("hayGastoEstimado", () => {
  it("lo dice cuando hay al menos una línea de gasto", () => {
    expect(hayGastoEstimado(cuatroLineas())).toBe(true);
  });

  it("lo niega cuando sólo hay honorarios", () => {
    expect(hayGastoEstimado([linea({ clase: "honorario" })])).toBe(false);
  });

  /*
   * Se mira la **clase de las líneas** y no el subtotal: un gasto de cero
   * centavos —una tasa que todavía no se sabe cuánto es— sigue siendo un
   * gasto, y el total que lo incluye sigue llevando una cifra aproximada
   * adentro. Con el subtotal, el aviso desaparecería justo en el caso donde
   * más incierta está la cifra.
   */
  it("lo dice aunque el gasto sea de cero", () => {
    expect(hayGastoEstimado([linea({ clase: "gasto_estimado", monto: 0 })])).toBe(
      true,
    );
  });

  it("lo niega sobre una lista vacía", () => {
    expect(hayGastoEstimado([])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// El orden de la lista y el movimiento dentro de una familia
// ---------------------------------------------------------------------------

describe("lineasOrdenadas", () => {
  it("ordena por `orden` aunque la respuesta venga mezclada", () => {
    const mezcladas = [
      linea({ id: TRES, orden: 2 }),
      linea({ id: UNO, orden: 0 }),
      linea({ id: DOS, orden: 1 }),
    ];

    expect(lineasOrdenadas(mezcladas).map((una) => una.id)).toEqual([
      UNO,
      DOS,
      TRES,
    ]);
  });

  it("respeta el orden relativo cuando los números tienen huecos", () => {
    const conHuecos = [linea({ id: DOS, orden: 7 }), linea({ id: UNO, orden: 3 })];

    expect(lineasOrdenadas(conHuecos).map((una) => una.id)).toEqual([UNO, DOS]);
  });

  it("no toca el arreglo que recibe, que puede ser estado de React", () => {
    const original = [linea({ id: DOS, orden: 1 }), linea({ id: UNO, orden: 0 })];
    lineasOrdenadas(original);

    expect(original.map((una) => una.id)).toEqual([DOS, UNO]);
  });
});

describe("moverLinea", () => {
  /*
   * **La diferencia con `moverModulo`, y por qué no se pudo copiar.** Los
   * módulos se dibujan en una sola lista, así que mover es intercambiar con
   * el vecino del arreglo. Las líneas se dibujan en dos, pero el `orden` que
   * la base guarda es uno solo para las dos familias: subir un honorario
   * tiene que intercambiarlo con el honorario anterior **saltándose los
   * gastos que haya en el medio**, o el movimiento visible no sería el que
   * se manda.
   */
  it("sube un honorario por encima del honorario anterior, salteando el gasto", () => {
    const movidas = moverLinea(cuatroLineas(), TRES, -1);

    expect(movidas.map((una) => una.id)).toEqual([TRES, DOS, UNO, CUATRO]);
  });

  it("baja un gasto por debajo del gasto siguiente", () => {
    const movidas = moverLinea(cuatroLineas(), DOS, 1);

    expect(movidas.map((una) => una.id)).toEqual([UNO, CUATRO, TRES, DOS]);
  });

  it("no mueve la primera de su familia hacia arriba", () => {
    expect(moverLinea(cuatroLineas(), UNO, -1).map((una) => una.id)).toEqual([
      UNO,
      DOS,
      TRES,
      CUATRO,
    ]);
  });

  it("no mueve la última de su familia hacia abajo", () => {
    expect(moverLinea(cuatroLineas(), CUATRO, 1).map((una) => una.id)).toEqual([
      UNO,
      DOS,
      TRES,
      CUATRO,
    ]);
  });

  /*
   * **Las dos de arriba no prueban el borde de la familia, y está medido.**
   * En `cuatroLineas` el primer honorario es también el primero del arreglo
   * y el último gasto es también el último, así que un movimiento que
   * intercambiara con el vecino del arreglo —la copia literal de
   * `moverModulo`— se negaría igual y las dos pasarían. Se midió mutando
   * `vecinaDeLaFamilia` a `desde + direccion`: sobrevivieron.
   *
   * Las dos de acá abajo usan listas donde el borde de la familia **no**
   * es el borde del arreglo, que es la única forma de que la medida
   * distinga los dos movimientos.
   */
  it("no sube el primer honorario aunque tenga un gasto encima", () => {
    const conGastoPrimero = [
      linea({ id: UNO, clase: "gasto_estimado", orden: 0 }),
      linea({ id: DOS, clase: "honorario", orden: 1 }),
      linea({ id: TRES, clase: "honorario", orden: 2 }),
    ];

    expect(moverLinea(conGastoPrimero, DOS, -1).map((una) => una.id)).toEqual([
      UNO,
      DOS,
      TRES,
    ]);
  });

  it("no baja el último honorario aunque tenga un gasto debajo", () => {
    const conGastoUltimo = [
      linea({ id: UNO, clase: "honorario", orden: 0 }),
      linea({ id: DOS, clase: "honorario", orden: 1 }),
      linea({ id: TRES, clase: "gasto_estimado", orden: 2 }),
    ];

    expect(moverLinea(conGastoUltimo, DOS, 1).map((una) => una.id)).toEqual([
      UNO,
      DOS,
      TRES,
    ]);
  });

  /*
   * El gasto DOS está en la posición 1 del arreglo, con el honorario TRES
   * debajo. Si el movimiento intercambiara con el vecino del arreglo en vez
   * de con el vecino de la familia, bajarlo lo pondría en la posición 2 y
   * el honorario subiría — dos familias movidas de un botón que decía mover
   * una. Es la prueba que hace fallar la copia literal de `moverModulo`.
   */
  it("mover dentro de una familia no cambia el orden relativo de la otra", () => {
    const movidas = moverLinea(cuatroLineas(), DOS, 1);
    const honorarios = movidas
      .filter((una) => una.clase === "honorario")
      .map((una) => una.id);

    expect(honorarios).toEqual([UNO, TRES]);
  });

  it("se niega sobre un identificador que no está en la lista", () => {
    const ajena = "99999999-9999-4999-8999-999999999999";

    expect(moverLinea(cuatroLineas(), ajena, -1).map((una) => una.id)).toEqual([
      UNO,
      DOS,
      TRES,
      CUATRO,
    ]);
  });

  it("no toca el arreglo que recibe, que puede ser estado de React", () => {
    const original = cuatroLineas();
    moverLinea(original, TRES, -1);

    expect(original.map((una) => una.id)).toEqual([UNO, DOS, TRES, CUATRO]);
  });
});

describe("ordenDeLineas", () => {
  it("lee la posición del arreglo y nunca el campo `orden`", () => {
    // El movimiento ya ocurrió en el arreglo y todavía no en la base, así
    // que el `orden` que cada línea trae es el viejo. Mandar ése sería
    // mandar la lista sin mover.
    const movidas = [
      linea({ id: DOS, orden: 1 }),
      linea({ id: UNO, orden: 0 }),
    ];

    expect(ordenDeLineas(movidas)).toEqual([DOS, UNO]);
  });

  it("de una lista vacía sale una lista vacía", () => {
    expect(ordenDeLineas([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// El borrador de cada línea
// ---------------------------------------------------------------------------

describe("BORRADOR_DE_LINEA_VACIO", () => {
  it("arranca sin clase elegida", () => {
    // Un desplegable que arranca en «Honorarios» es el que hace guardar un
    // honorario donde alguien quería anotar una tasa de migración.
    expect(BORRADOR_DE_LINEA_VACIO.clase).toBe("");
  });

  it("arranca sin monto escrito", () => {
    // Y no en «0.00»: un cero preescrito es un importe que alguien puede
    // mandar sin haberlo pensado.
    expect(BORRADOR_DE_LINEA_VACIO.monto).toBe("");
  });

  it("arranca sin trámite", () => {
    expect(BORRADOR_DE_LINEA_VACIO.tipoProcesoId).toBe("");
  });
});

describe("borradorDesdeLinea", () => {
  it("pone el monto guardado en la unidad que la persona lee", () => {
    expect(borradorDesdeLinea(linea({ monto: 150_000 })).monto).toBe("1500.00");
  });

  it("trae la clase, el concepto y el trámite", () => {
    const partida = borradorDesdeLinea(
      linea({
        clase: "gasto_estimado",
        concepto: "Tasa de migración",
        tipoProcesoId: TRAMITE,
      }),
    );

    expect(partida.clase).toBe("gasto_estimado");
    expect(partida.concepto).toBe("Tasa de migración");
    expect(partida.tipoProcesoId).toBe(TRAMITE);
  });

  it("convierte el trámite ausente en el valor vacío del desplegable", () => {
    expect(borradorDesdeLinea(linea({ tipoProcesoId: null })).tipoProcesoId).toBe(
      "",
    );
  });
});

describe("normalizarBorradorDeLinea", () => {
  it("convierte el monto tecleado a centavos enteros", () => {
    const normalizado = normalizarBorradorDeLinea(
      borrador({ clase: "honorario", concepto: "Gestión", monto: "1,500.00" }),
    );

    expect(normalizado).toEqual({
      ok: true,
      datos: {
        clase: "honorario",
        concepto: "Gestión",
        monto: 150_000,
        tipoProcesoId: null,
        arancelRenglonId: null,
      },
    });
  });

  it("recorta el concepto", () => {
    const normalizado = normalizarBorradorDeLinea(
      borrador({ clase: "honorario", concepto: "  Gestión  ", monto: "1" }),
    );

    expect(normalizado.ok && normalizado.datos.concepto).toBe("Gestión");
  });

  it("manda el trámite elegido", () => {
    const normalizado = normalizarBorradorDeLinea(
      borrador({
        clase: "honorario",
        concepto: "Gestión",
        monto: "1",
        tipoProcesoId: TRAMITE,
      }),
    );

    expect(normalizado.ok && normalizado.datos.tipoProcesoId).toBe(TRAMITE);
  });

  it("convierte el desplegable vacío en trámite ausente y no en cadena vacía", () => {
    // Una cadena vacía viajaría como `tipoProcesoId: ""`, y el Worker la
    // rechaza con `tipo_invalido`: lo que quiere decir «ninguno» es `null`.
    const normalizado = normalizarBorradorDeLinea(
      borrador({ clase: "honorario", concepto: "Gestión", monto: "1" }),
    );

    expect(normalizado.ok && normalizado.datos.tipoProcesoId).toBeNull();
  });

  it("acepta un monto de cero", () => {
    // Una tasa que todavía no se sabe cuánto es se anota en cero, y el
    // `CHECK` de la base la admite: `monto >= 0`.
    const normalizado = normalizarBorradorDeLinea(
      borrador({ clase: "gasto_estimado", concepto: "Tasa", monto: "0" }),
    );

    expect(normalizado.ok && normalizado.datos.monto).toBe(0);
  });

  it("junta todas las fallas y no sólo la primera", () => {
    const normalizado = normalizarBorradorDeLinea(BORRADOR_DE_LINEA_VACIO);

    expect(normalizado.ok).toBe(false);
    expect(!normalizado.ok && motivos(normalizado.fallas).sort()).toEqual(
      ["clase_de_linea_desconocida", "concepto_requerido", "monto_invalido"].sort(),
    );
  });

  it("rechaza una clase inventada", () => {
    const normalizado = normalizarBorradorDeLinea(
      borrador({ clase: "descuento", concepto: "Gestión", monto: "1" }),
    );

    expect(!normalizado.ok && motivos(normalizado.fallas)).toEqual([
      "clase_de_linea_desconocida",
    ]);
  });

  it("rechaza un concepto de puros espacios", () => {
    const normalizado = normalizarBorradorDeLinea(
      borrador({ clase: "honorario", concepto: "   ", monto: "1" }),
    );

    expect(!normalizado.ok && motivos(normalizado.fallas)).toEqual([
      "concepto_requerido",
    ]);
  });

  it("rechaza un monto con el centavo partido", () => {
    const normalizado = normalizarBorradorDeLinea(
      borrador({ clase: "honorario", concepto: "Gestión", monto: "12.345" }),
    );

    expect(!normalizado.ok && motivos(normalizado.fallas)).toEqual([
      "monto_invalido",
    ]);
  });

  it("nombra el campo de cada falla, para que el formulario sepa cuál es", () => {
    const normalizado = normalizarBorradorDeLinea(BORRADOR_DE_LINEA_VACIO);

    expect(!normalizado.ok && normalizado.fallas.map((una) => una.campo).sort()).toEqual(
      ["clase", "concepto", "monto"].sort(),
    );
  });
});

describe("hayCambioEnLinea", () => {
  it("lo niega cuando el borrador dice exactamente lo guardado", () => {
    const guardada = linea({ monto: 150_000, concepto: "Gestión" });

    expect(hayCambioEnLinea(guardada, borradorDesdeLinea(guardada))).toBe(false);
  });

  it("lo niega cuando sólo sobran espacios en el concepto", () => {
    // Apoyar la barra espaciadora no puede encender un «Guardar» sobre una
    // petición que no cambiaría una sola letra: se guarda recortado.
    const guardada = linea({ concepto: "Gestión" });

    expect(
      hayCambioEnLinea(guardada, {
        ...borradorDesdeLinea(guardada),
        concepto: "  Gestión  ",
      }),
    ).toBe(false);
  });

  it("lo dice cuando cambia la clase", () => {
    const guardada = linea({ clase: "honorario" });

    expect(
      hayCambioEnLinea(guardada, {
        ...borradorDesdeLinea(guardada),
        clase: "gasto_estimado",
      }),
    ).toBe(true);
  });

  it("lo dice cuando cambia el monto", () => {
    const guardada = linea({ monto: 150_000 });

    expect(
      hayCambioEnLinea(guardada, {
        ...borradorDesdeLinea(guardada),
        monto: "1500.01",
      }),
    ).toBe(true);
  });

  /*
   * **El monto se compara en centavos y no como texto.** «1500» y «1500.00»
   * son el mismo importe escrito de dos formas, y un «Guardar» encendido
   * sobre eso manda una petición que no cambia nada — y, peor, deja a quien
   * mira creyendo que tiene trabajo sin guardar.
   */
  it("lo niega cuando el mismo importe está escrito de otra forma", () => {
    const guardada = linea({ monto: 150_000 });

    expect(
      hayCambioEnLinea(guardada, {
        ...borradorDesdeLinea(guardada),
        monto: "1,500",
      }),
    ).toBe(false);
  });

  /*
   * Un monto que no se puede leer **sí** es un cambio: lo que hay en el
   * campo no es lo guardado, y el botón tiene que aparecer para que el
   * intento de guardar sea el que explique por qué no se puede. Esconderlo
   * dejaría a la persona mirando un campo con un error y sin nada que
   * apretar.
   */
  it("lo dice cuando el monto tecleado no es un importe", () => {
    const guardada = linea({ monto: 150_000 });

    expect(
      hayCambioEnLinea(guardada, {
        ...borradorDesdeLinea(guardada),
        monto: "mil quinientos",
      }),
    ).toBe(true);
  });

  it("lo dice cuando se elige un trámite donde no había", () => {
    const guardada = linea({ tipoProcesoId: null });

    expect(
      hayCambioEnLinea(guardada, {
        ...borradorDesdeLinea(guardada),
        tipoProcesoId: TRAMITE,
      }),
    ).toBe(true);
  });

  it("lo niega cuando el trámite sigue sin elegirse", () => {
    const guardada = linea({ tipoProcesoId: null });

    expect(hayCambioEnLinea(guardada, borradorDesdeLinea(guardada))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Los borradores abiertos y la relectura
// ---------------------------------------------------------------------------

describe("podarBorradoresDeLinea", () => {
  it("tira el borrador de una línea que ya no está", () => {
    const abiertos = {
      [UNO]: borrador({ concepto: "A medio escribir" }),
      [DOS]: borrador({ concepto: "También" }),
    };

    expect(
      Object.keys(podarBorradoresDeLinea(abiertos, [linea({ id: UNO })])),
    ).toEqual([UNO]);
  });

  it("conserva el de las que siguen, aunque se haya reordenado", () => {
    // Reordenar no toca lo que nadie escribió: perder el texto de otra
    // línea por haber apretado una flecha sería pérdida de trabajo ajeno.
    const abiertos = { [DOS]: borrador({ concepto: "A medio escribir" }) };
    const vivas = [linea({ id: DOS }), linea({ id: UNO })];

    expect(podarBorradoresDeLinea(abiertos, vivas)[DOS].concepto).toBe(
      "A medio escribir",
    );
  });

  it("no toca el objeto que recibe", () => {
    const abiertos = { [UNO]: borrador({ concepto: "Uno" }) };
    podarBorradoresDeLinea(abiertos, []);

    expect(Object.keys(abiertos)).toEqual([UNO]);
  });
});

describe("exigeRecarga", () => {
  it("lo pide cuando el orden mandado no son las líneas de la cotización", () => {
    expect(exigeRecarga([{ campo: "orden", motivo: "orden_incompleto" }])).toBe(
      true,
    );
  });

  it("lo pide cuando una línea ya no es de acá", () => {
    expect(exigeRecarga([{ campo: "id", motivo: "linea_desconocida" }])).toBe(
      true,
    );
  });

  /*
   * Lo que se puede arreglar escribiendo **no** obliga a recargar: tirar lo
   * que alguien tiene a medio escribir para releer una lista que no cambió
   * es perder trabajo para no ganar nada.
   */
  it("no lo pide por un monto mal escrito", () => {
    expect(exigeRecarga([{ campo: "monto", motivo: "monto_invalido" }])).toBe(
      false,
    );
  });

  it("no lo pide por un concepto en blanco", () => {
    expect(
      exigeRecarga([{ campo: "concepto", motivo: "concepto_requerido" }]),
    ).toBe(false);
  });

  it("no lo pide sobre una lista de fallas vacía", () => {
    expect(exigeRecarga([])).toBe(false);
  });

  it("lo pide si una sola de varias fallas lo exige", () => {
    expect(
      exigeRecarga([
        { campo: "concepto", motivo: "concepto_requerido" },
        { campo: "id", motivo: "linea_desconocida" },
      ]),
    ).toBe(true);
  });
});

describe("TOTALES_EN_CERO", () => {
  it("es el cero en los tres, para antes de la primera respuesta", () => {
    expect(TOTALES_EN_CERO).toEqual({
      honorarios: 0,
      gastosEstimados: 0,
      total: 0,
    });
  });
});

// ---------------------------------------------------------------------------
// El desplegable de trámites
// ---------------------------------------------------------------------------

const MIGRACION = "bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb";
const SOCIEDAD = "cccccccc-1111-4111-8111-cccccccccccc";

function tipoProceso(ajustes: Partial<TipoProceso> = {}): TipoProceso {
  return {
    id: MIGRACION,
    areaId: "dddddddd-1111-4111-8111-dddddddddddd",
    areaNombre: "Migración",
    nombre: "Visa de trabajo",
    descripcion: null,
    activo: true,
    ...ajustes,
  };
}

describe("tramiteDeLaLinea", () => {
  it("no devuelve ninguno cuando la línea no lleva trámite", () => {
    expect(tramiteDeLaLinea(linea({ tipoProcesoId: null }))).toBeNull();
  });

  it("devuelve el identificador y el nombre resuelto", () => {
    const suya = linea({
      tipoProcesoId: MIGRACION,
      tipoProcesoNombre: "Visa de trabajo",
    });

    expect(tramiteDeLaLinea(suya)).toEqual({
      id: MIGRACION,
      nombre: "Visa de trabajo",
    });
  });

  it("conserva el hueco cuando el nombre no se pudo resolver", () => {
    const suya = linea({ tipoProcesoId: MIGRACION, tipoProcesoNombre: null });

    expect(tramiteDeLaLinea(suya)).toEqual({ id: MIGRACION, nombre: null });
  });
});

describe("tramitesSeleccionables", () => {
  it("ofrece los activos del catálogo, ordenados por nombre", () => {
    const catalogo = [
      tipoProceso({ id: SOCIEDAD, nombre: "Sociedad anónima" }),
      tipoProceso({ id: MIGRACION, nombre: "Visa de trabajo" }),
    ];

    expect(tramitesSeleccionables(catalogo, null).map((una) => una.nombre)).toEqual([
      "Sociedad anónima",
      "Visa de trabajo",
    ]);
  });

  /*
   * Dar de baja un tipo de proceso es decir que no se abren más, así que no
   * se ofrece para una línea nueva. Lo que **sí** sigue existiendo es la
   * línea vieja que ya apunta a uno, y de eso se ocupa la regla de abajo.
   */
  it("no ofrece los dados de baja", () => {
    const catalogo = [
      tipoProceso({ id: MIGRACION, nombre: "Visa de trabajo", activo: true }),
      tipoProceso({ id: SOCIEDAD, nombre: "Sociedad anónima", activo: false }),
    ];

    expect(tramitesSeleccionables(catalogo, null).map((una) => una.id)).toEqual([
      MIGRACION,
    ]);
  });

  /*
   * El defecto que esta función existe para impedir: con un `<select>`
   * controlado cuyo valor no corresponde a ninguna opción, el navegador cae
   * en la primera —«Ninguno»— mientras el estado conserva el identificador.
   * Quien mira lee «Ninguno» sobre una línea que sí tiene trámite.
   */
  it("ofrece el trámite que la línea ya tiene aunque el catálogo no lo traiga", () => {
    const opciones = tramitesSeleccionables([], {
      id: SOCIEDAD,
      nombre: "Sociedad anónima",
    });

    expect(opciones).toEqual([{ id: SOCIEDAD, nombre: "Sociedad anónima" }]);
  });

  it("ofrece el trámite que la línea ya tiene aunque esté dado de baja", () => {
    const catalogo = [
      tipoProceso({ id: SOCIEDAD, nombre: "Sociedad anónima", activo: false }),
    ];

    const opciones = tramitesSeleccionables(catalogo, {
      id: SOCIEDAD,
      nombre: "Sociedad anónima",
    });

    expect(opciones.map((una) => una.id)).toEqual([SOCIEDAD]);
  });

  it("no lo duplica cuando el catálogo sí lo trae", () => {
    const catalogo = [tipoProceso({ id: MIGRACION, nombre: "Visa de trabajo" })];

    const opciones = tramitesSeleccionables(catalogo, {
      id: MIGRACION,
      nombre: "Visa de trabajo",
    });

    expect(opciones).toHaveLength(1);
  });

  it("dice el hueco cuando el trámite de la línea no se pudo nombrar", () => {
    const opciones = tramitesSeleccionables([], { id: SOCIEDAD, nombre: null });

    expect(opciones[0].nombre).toBe("El trámite que la línea ya tenía");
  });
});

describe("avisoDeTramites", () => {
  it("calla cuando el catálogo cargó", () => {
    expect(avisoDeTramites(null)).toBeNull();
  });

  /*
   * Se muestra **siempre que haya problema**, y no sólo cuando el
   * desplegable quedó vacío: con el trámite de la línea inyectado ya no está
   * vacío, así que un aviso condicionado a «no hay opciones» desaparecería
   * justo en el caso en que hace falta.
   */
  it("dice que la línea se puede escribir igual, porque el trámite es opcional", () => {
    const aviso = avisoDeTramites("No se pudo leer el catálogo.");

    expect(aviso).toContain("No se pudo leer el catálogo.");
    expect(aviso).toContain("El trámite es opcional");
  });
});

// ---------------------------------------------------------------------------
// Los precios del bufete, dentro de la cotización (T-2 de
// `odd/tasks/precios-en-la-cotizacion.md`, corregido por T-2 bis)
//
// Lo que se prueba acá es la lógica pura: **qué servicios son ofrecibles**, qué
// produce el prellenado, qué produce desvincular, qué encuentra el buscador, qué
// texto muestra el selector sobre un servicio ya elegido, cómo se agrupa la
// vista expandida y qué opción queda activa al mover una flecha. El dibujo —el
// combobox, su teclado, el modal, los rótulos a la vista y que ninguna fila
// muestre dos cifras— vive en `e2e/precios-en-cotizacion.spec.ts`.
//
// `serviciosOfrecibles`, `rotuloDeServicio`, `serviciosQueCoinciden`,
// `serviciosPorCategoria` y `textoDelServicioElegido` viven en
// `src/pantallas/catalogos/precios.ts` y se prueban desde acá, y no desde
// `test/precios-ui.spec.ts`, por una razón de pertenencia: lo que contestan es
// una pregunta de **esta** pantalla —qué servicios se le pueden ofrecer a una
// línea— y están escritas sobre el buscador que aquella pantalla ya tenía.
//
// ## La corrección que esta sección sostiene
//
// T-2 ofrecía sólo los renglones con precio propio. El usuario: «los
// preestablecidos son eso, preestablecidos: siempre pueden ser editables, pero
// **son la norma hasta que se editen, no son una subcategoría**». Así que lo
// ofrecible son los renglones **con una cifra**, y la fila del acuerdo sin
// editar entra con su cifra puesta. Sigue habiendo **una sola** cifra por
// servicio, y eso es lo que las pruebas hostiles de abajo persiguen.
// ---------------------------------------------------------------------------

const MIGRACION_DEL_ACUERDO =
  "ACTUACIONES ANTE EL SERVICIO NACIONAL DE MIGRACIÓN";
const CIVIL_DEL_ACUERDO = "ASUNTOS DE DERECHO PROCESAL (CIVIL-COMERCIAL)";
const PROSA_DEL_ACUERDO = "OTROS ASUNTOS";

const RUBRO_INMIGRANTES = "a1111111-1111-4111-8111-a11111111111";
const RENGLON_PENSIONADO = "a2222222-2222-4222-8222-a22222222222";
const RENGLON_TRABAJO = "a3333333-3333-4333-8333-a33333333333";
const RENGLON_CUANTIA = "a4444444-4444-4444-8444-a44444444444";
/** Una de las 97 reglas por cuantía **sin ningún número**: no es ofrecible. */
const RENGLON_SIN_CIFRA = "a8888888-8888-4888-8888-a88888888888";

/**
 * El monto del acuerdo de la visa de pensionado, **distinto** del que el
 * bufete cobra.
 *
 * Distinto a propósito: es lo que deja distinguir «el servicio lleva el precio
 * del bufete» de «el servicio lleva la cita de 2001», y es el número que la
 * prueba hostil de más abajo persigue dentro del objeto.
 */
const OFICIAL_DEL_PENSIONADO = 13_755;
const PROPIO_DEL_PENSIONADO = 40_000;
const PROPIO_DE_LA_CUANTIA = 250_000;

function renglon(ajustes: Partial<RenglonDelArancel>): RenglonDelArancel {
  return {
    id: RENGLON_PENSIONADO,
    orden: 1,
    categoria: MIGRACION_DEL_ACUERDO,
    numeral: "3.a",
    concepto: "Visa de pensionado o jubilado",
    clase: "monto",
    montoOficial: OFICIAL_DEL_PENSIONADO,
    reglaOficial: null,
    monto: PROPIO_DEL_PENSIONADO,
    activo: true,
    ...ajustes,
  };
}

/**
 * El catálogo de la muestra, con **una de cada cosa que el acuerdo imprime**:
 * un rubro que encabeza, un renglón tarifado debajo de él, un renglón que el
 * bufete todavía no tarifó, una regla por cuantía **con** precio propio y una
 * categoría de pura prosa.
 *
 * Los cuatro casos hacen falta: sin el rubro no se puede medir que un
 * encabezado nunca es un servicio, sin el renglón sin precio no se puede medir
 * que el panel ofrece lo tarifado y nada más, y sin la regla con precio se
 * perderían los 97 servicios que el acuerdo tarifa por tramos y que el bufete
 * sí puede tarifar.
 */
function catalogoDelAcuerdo(): CategoriaDelArancel[] {
  return [
    {
      nombre: MIGRACION_DEL_ACUERDO,
      renglones: [
        renglon({
          id: RUBRO_INMIGRANTES,
          orden: 1,
          numeral: "3",
          concepto: "Inmigrantes",
          clase: "rubro",
          montoOficial: null,
          monto: null,
        }),
        renglon({ id: RENGLON_PENSIONADO, orden: 2 }),
        renglon({
          id: RENGLON_TRABAJO,
          orden: 3,
          numeral: "3.b",
          concepto: "Permiso de trabajo por contrato",
          montoOficial: 30_000,
          monto: null,
        }),
      ],
      notas: [],
    },
    {
      nombre: CIVIL_DEL_ACUERDO,
      renglones: [
        renglon({
          id: RENGLON_CUANTIA,
          orden: 4,
          categoria: CIVIL_DEL_ACUERDO,
          numeral: "1",
          concepto: "Procesos de mayor cuantía",
          clase: "regla",
          montoOficial: null,
          reglaOficial: "25% de lo que se obtenga, sobre la menor cuantía.",
          monto: PROPIO_DE_LA_CUANTIA,
        }),
        /*
         * La quinta cosa que el acuerdo imprime, y la que T-2 bis obliga a
         * tener en la muestra: una regla por cuantía **sin ningún número**. Sin
         * ella no habría forma de medir que el filtro sigue rechazando algo
         * desde que el preestablecido pasó a ser ofrecible.
         */
        renglon({
          id: RENGLON_SIN_CIFRA,
          orden: 5,
          categoria: CIVIL_DEL_ACUERDO,
          numeral: "2",
          concepto: "Procesos de menor cuantía",
          clase: "regla",
          montoOficial: null,
          reglaOficial: "15% de lo que se obtenga, sobre la menor cuantía.",
          monto: null,
        }),
      ],
      notas: [],
    },
    { nombre: PROSA_DEL_ACUERDO, renglones: [], notas: [] },
  ];
}

describe("serviciosOfrecibles", () => {
  /*
   * **La corrección de T-2 bis, medida.** El catálogo ofrecible son los
   * renglones con una cifra: el que el bufete editó, el que todavía dice lo que
   * dice el acuerdo y la regla por cuantía a la que el bufete le escribió un
   * monto. Quedan afuera el rubro y la regla sin número.
   */
  it("trae los servicios con cifra, en el orden del documento", () => {
    expect(
      serviciosOfrecibles(catalogoDelAcuerdo()).map((servicio) => servicio.id),
    ).toEqual([RENGLON_PENSIONADO, RENGLON_TRABAJO, RENGLON_CUANTIA]);
  });

  /**
   * **El renglón que T-2 dejaba afuera, y que es la mitad del defecto que esta
   * corrección arregla.**
   *
   * Son 275 de 453 en la base de desarrollo: todo lo que el bufete no editó.
   * La pantalla de precios ya los muestra con su cifra como el valor del campo;
   * la cotización los trataba como si no existieran. Dos criterios distintos
   * para la misma pregunta en dos pantallas del mismo sistema.
   */
  it("un renglón sin precio propio entra, con la cifra del acuerdo", () => {
    const trabajo = serviciosOfrecibles(catalogoDelAcuerdo()).find(
      (servicio) => servicio.id === RENGLON_TRABAJO,
    );

    expect(
      trabajo,
      "el servicio que todavía dice lo que dice el acuerdo quedó afuera del" +
        " catálogo ofrecible. Un preestablecido es la norma hasta que se edite," +
        " no una subcategoría",
    ).toBeDefined();
    expect(trabajo?.monto).toBe(30_000);
  });

  it("un rubro nunca es un servicio, ni cuando encabeza uno ofrecible", () => {
    // Los 74 encabezados que el acuerdo imprime sin valor. No tienen `monto`
    // —el `CHECK un_rubro_no_lleva_precio` de `0012` lo prohíbe— ni
    // `montoOficial` —el acuerdo no les imprime ninguno—, así que el filtro de
    // la cifra ya los deja afuera; esta prueba lo exige en vez de confiarlo.
    const ids = serviciosOfrecibles(catalogoDelAcuerdo()).map(
      (servicio) => servicio.id,
    );

    expect(ids).not.toContain(RUBRO_INMIGRANTES);
  });

  it("una regla por cuantía sin ninguna cifra tampoco es un servicio", () => {
    // Son 97, y es el único rechazo que queda por el lado del número. De un
    // renglón sin cifra no hay nada que prellenar, y la base rechaza la línea
    // que lo nombrara —`0015` relajó la guarda, no la quitó—.
    const ids = serviciosOfrecibles(catalogoDelAcuerdo()).map(
      (servicio) => servicio.id,
    );

    expect(ids).not.toContain(RENGLON_SIN_CIFRA);
  });

  it("una regla por cuantía con precio propio sí es un servicio", () => {
    // La tajada anterior decidió que el bufete puede escribirle su propio monto
    // al lado del texto de la regla; dejarlas afuera de acá las volvería
    // inofrecibles en una cotización.
    const cuantia = serviciosOfrecibles(catalogoDelAcuerdo()).find(
      (servicio) => servicio.id === RENGLON_CUANTIA,
    );

    expect(cuantia?.monto).toBe(PROPIO_DE_LA_CUANTIA);
  });

  /*
   * **`editado` dice de cuál de los dos orígenes salió la cifra, y nada más.**
   * Es lo que la marca sutil del modal dibuja, y es la palabra del usuario:
   * «un indicativo visual si es preestablecido o editado».
   */
  it("dice cuáles cifras escribió el bufete y cuáles son preestablecidas", () => {
    const porId = new Map(
      serviciosOfrecibles(catalogoDelAcuerdo()).map((servicio) => [
        servicio.id,
        servicio.editado,
      ]),
    );

    expect(porId.get(RENGLON_PENSIONADO)).toBe(true);
    expect(porId.get(RENGLON_CUANTIA)).toBe(true);
    expect(porId.get(RENGLON_TRABAJO)).toBe(false);
  });

  it("no le atribuye el rubro a un hermano de nivel superior", () => {
    const migracion = catalogoDelAcuerdo()[0];
    const hermano = renglon({
      id: "a5555555-5555-4555-8555-a55555555555",
      orden: 4,
      numeral: "4",
      concepto: "Naturalizaciones",
      monto: 420_000,
    });

    const servicios = serviciosOfrecibles([
      { ...migracion, renglones: [...migracion.renglones, hermano] },
    ]);
    const naturalizaciones = servicios.find(
      (servicio) => servicio.concepto === "Naturalizaciones",
    );

    expect(
      naturalizaciones?.rubro,
      "«Naturalizaciones» quedó colgada del rubro que la precede en el" +
        " documento sin ser su hija: su numeral no extiende el del rubro." +
        " Un rótulo que miente manda a cotizar otro servicio",
    ).toBeNull();
  });

  it("le atribuye el rubro cuando el numeral lo demuestra", () => {
    // Las dos formas que el acuerdo usa: extender el numeral del rubro —`3` →
    // `3.a`— y extender su último tramo, porque las letras reinician bajo cada
    // padre: `3.b` → `b.1`.
    const nieto = renglon({
      id: "a6666666-6666-4666-8666-a66666666666",
      orden: 5,
      numeral: "b.1",
      concepto: "primer año",
      monto: 250_000,
    });

    const servicios = serviciosOfrecibles([
      {
        nombre: MIGRACION_DEL_ACUERDO,
        renglones: [
          renglon({
            id: RUBRO_INMIGRANTES,
            numeral: "3.b",
            concepto: "Inversionista",
            clase: "rubro",
            montoOficial: null,
            monto: null,
          }),
          nieto,
        ],
        notas: [],
      },
    ]);

    expect(servicios[0].rubro).toBe("Inversionista");
  });

  it("lleva el rubro que lo encabeza, y nulo cuando no hay ninguno", () => {
    const servicios = serviciosOfrecibles(catalogoDelAcuerdo());

    expect(servicios[0].rubro).toBe("Inmigrantes");
    expect(servicios[2].rubro).toBeNull();
  });

  /*
   * **La prueba hostil, rehecha por T-2 bis y con los mismos dientes.**
   *
   * Lo que T-2 perseguía —que el monto del acuerdo no apareciera nunca— dejó de
   * ser la regla: en un renglón sin editar, la cifra del acuerdo **es** el
   * precio, y ocultarla era el defecto. Lo que sigue prohibido es que un
   * servicio lleve **dos** números: la cita de 2001 **al lado** del precio que
   * el bufete decidió es la comparación que
   * `odd/tasks/arancel-de-honorarios.md` sacó del sistema.
   *
   * Así que se persigue el monto del acuerdo del servicio **que el bufete
   * editó**, donde los dos números son distintos a propósito. Si alguien agrega
   * la cita al objeto con cualquier nombre de campo, aparece y esto se pone
   * rojo.
   */
  it("un servicio editado no carga además el monto del acuerdo", () => {
    const editado = serviciosOfrecibles(catalogoDelAcuerdo()).find(
      (servicio) => servicio.id === RENGLON_PENSIONADO,
    );
    const serializado = JSON.stringify(editado);

    expect(
      serializado.includes(String(OFICIAL_DEL_PENSIONADO)),
      "el servicio lleva adentro el monto del Acuerdo No 49 de 2001 **además**" +
        " del precio del bufete. Un servicio tiene una sola cifra: el segundo" +
        " número abre la comparación que la tajada anterior prohibió",
    ).toBe(false);
    expect(serializado.includes(String(PROPIO_DEL_PENSIONADO))).toBe(true);
  });

  it("ningún servicio lleva más de una cifra de dinero", () => {
    /*
     * El ataque estructural, y es el que no se puede engañar con otro nombre de
     * campo: se cuentan los valores numéricos de cada servicio. Son dos —`monto`
     * y nada más— porque `editado` es un booleano y lo demás son cadenas. Un
     * tercer número en el objeto es, por definición, una segunda cifra.
     */
    for (const servicio of serviciosOfrecibles(catalogoDelAcuerdo())) {
      const numeros = Object.values(servicio).filter(
        (valor) => typeof valor === "number",
      );

      expect(
        numeros,
        `el servicio «${servicio.rotulo}» lleva ${String(
          numeros.length,
        )} números adentro y tiene que llevar uno: su precio. Dos cifras de` +
          " dinero sobre el mismo servicio sólo se pueden leer como la" +
          " comparación que el usuario pidió sacar",
      ).toEqual([servicio.monto]);
    }
  });
});

describe("rotuloDeServicio", () => {
  it("antepone el rubro, porque el acuerdo no repite la palabra en cada hijo", () => {
    // «a) Visa de pensionado» cuelga de «3. Inmigrantes» y el documento no
    // vuelve a escribir la palabra. En un desplegable, el concepto solo pierde
    // la mitad del nombre del servicio.
    const [pensionado] = serviciosOfrecibles(catalogoDelAcuerdo());

    expect(pensionado.rotulo).toBe(
      "Inmigrantes · Visa de pensionado o jubilado",
    );
  });

  it("es el concepto a secas cuando el servicio no cuelga de ningún rubro", () => {
    // El tercero: entre medio quedó «Permiso de trabajo por contrato», que
    // T-2 bis hizo ofrecible con su cifra preestablecida.
    const cuantia = serviciosOfrecibles(catalogoDelAcuerdo())[2];

    expect(cuantia.rotulo).toBe("Procesos de mayor cuantía");
    // Y la función que lo arma, ejercida por su cuenta: es la única definición
    // de cómo se escribe un nombre completo, y la usa el constructor.
    expect(
      rotuloDeServicio({ concepto: "primer año", rubro: "Inversionista" }),
    ).toBe("Inversionista · primer año");
    expect(rotuloDeServicio({ concepto: "Suelto", rubro: null })).toBe("Suelto");
  });
});

describe("serviciosQueCoinciden", () => {
  const SERVICIOS = serviciosOfrecibles(catalogoDelAcuerdo());

  it("con la consulta vacía devuelve todos", () => {
    expect(serviciosQueCoinciden(SERVICIOS, "").map((uno) => uno.id)).toEqual([
      RENGLON_PENSIONADO,
      RENGLON_TRABAJO,
      RENGLON_CUANTIA,
    ]);
  });

  it("busca también por el rubro que encabeza al servicio", () => {
    // Es la regla que la pantalla de precios ya tenía: buscar «inmigrantes» y
    // no encontrar la visa de pensionado sería buscar en la mitad del nombre.
    expect(
      serviciosQueCoinciden(SERVICIOS, "inmigrantes").map((uno) => uno.id),
    ).toEqual([RENGLON_PENSIONADO, RENGLON_TRABAJO]);
  });

  it("no le importan los acentos ni las mayúsculas", () => {
    expect(
      serviciosQueCoinciden(SERVICIOS, "CUANTIA").map((uno) => uno.id),
    ).toEqual([RENGLON_CUANTIA]);
  });

  it("devuelve la lista vacía cuando nada coincide", () => {
    expect(serviciosQueCoinciden(SERVICIOS, "sociedad anónima")).toEqual([]);
  });
});

describe("el prellenado desde un servicio del catálogo", () => {
  const PENSIONADO = serviciosOfrecibles(catalogoDelAcuerdo())[0];

  /*
   * El valor esperado del monto va **escrito a mano** y no sacado de
   * `montoEditable`, que es la función que lo produce (restricción 6).
   */
  it("pone el concepto, el monto y de dónde salió", () => {
    expect(prellenarDesdeServicio(BORRADOR_DE_LINEA_VACIO, PENSIONADO)).toEqual({
      clase: "",
      concepto: "Inmigrantes · Visa de pensionado o jubilado",
      monto: "400.00",
      tipoProcesoId: "",
      arancelRenglonId: RENGLON_PENSIONADO,
    });
  });

  /**
   * **El concepto propuesto es el rótulo completo, y eso se midió a mano.**
   *
   * La primera versión proponía el concepto del renglón a secas. El navegador
   * lo desmintió en la primera prueba: el servicio «primer año» —que en el
   * acuerdo cuelga del rubro «Inversionista»— prellenaba una línea de
   * cotización que decía «primer año», que es la definición misma de
   * `concepto_requerido`: un monto que el cliente no sabe por qué paga.
   *
   * Y no es un borde: **147 de los 453 renglones cuelgan de un rubro**, y entre
   * ellos están «Reconsideración», «Apelación», «Persona Natural»,
   * «Elaboración» y «Revisión».
   */
  it("el concepto propuesto no es un fragmento cuando el servicio cuelga de un rubro", () => {
    const fragmento = serviciosOfrecibles([
      {
        nombre: MIGRACION_DEL_ACUERDO,
        renglones: [
          renglon({
            id: RUBRO_INMIGRANTES,
            numeral: "3.b",
            concepto: "Inversionista",
            clase: "rubro",
            montoOficial: null,
            monto: null,
          }),
          renglon({
            id: "a7777777-7777-4777-8777-a77777777777",
            numeral: "b.1",
            concepto: "primer año",
            monto: 250_000,
          }),
        ],
        notas: [],
      },
    ])[0];

    const prellenado = prellenarDesdeServicio(
      BORRADOR_DE_LINEA_VACIO,
      fragmento,
    );

    expect(
      prellenado.concepto,
      "el prellenado dejó «primer año» como concepto de una línea de" +
        " cotización. El documento lo imprime así porque su encabezado está una" +
        " línea más arriba; una cotización no tiene ese encabezado",
    ).toBe("Inversionista · primer año");
  });

  /*
   * **No toca la clase ni el trámite**, y es deliberado: de qué lado del
   * documento cae la línea —honorario o gasto de terceros— y qué proceso abre
   * si la cotización se gana son dos decisiones que el arancel no contesta. El
   * acuerdo tarifa servicios, no decide quién cobra.
   */
  it("no toca la clase ni el trámite que ya estaban elegidos", () => {
    const empezado = borrador({ clase: "honorario", tipoProcesoId: TRAMITE });
    const prellenado = prellenarDesdeServicio(empezado, PENSIONADO);

    expect(prellenado.clase).toBe("honorario");
    expect(prellenado.tipoProcesoId).toBe(TRAMITE);
  });

  /*
   * **Sí pisa lo que había escrito**, y conviene decir por qué: elegir un
   * servicio del catálogo es pedirle al sistema lo que sabe de ese servicio.
   * Un prellenado que respetara el texto viejo dejaría una línea cuyo concepto
   * dice una cosa y cuya procedencia dice otra, que es exactamente el dato que
   * la columna existe para que no pase.
   */
  it("reemplaza el concepto y el monto que ya había", () => {
    const escrito = borrador({ concepto: "Lo que escribí antes", monto: "12.50" });
    const prellenado = prellenarDesdeServicio(escrito, PENSIONADO);

    expect(prellenado.concepto).toBe("Inmigrantes · Visa de pensionado o jubilado");
    expect(prellenado.monto).toBe("400.00");
  });

  it("no muta el borrador que recibe", () => {
    const empezado = borrador({ concepto: "Lo mío" });
    prellenarDesdeServicio(empezado, PENSIONADO);

    expect(empezado.concepto).toBe("Lo mío");
    expect(empezado.arancelRenglonId).toBe("");
  });
});

describe("conServicioElegido", () => {
  const SERVICIOS = serviciosOfrecibles(catalogoDelAcuerdo());

  it("el hueco del desplegable desvincula y deja el monto donde estaba", () => {
    const prellenado = borrador({
      concepto: "Visa de pensionado o jubilado",
      monto: "400.00",
      arancelRenglonId: RENGLON_PENSIONADO,
    });

    const quedo = conServicioElegido(prellenado, "", SERVICIOS);
    expect(quedo.arancelRenglonId).toBe("");
    expect(quedo.monto).toBe("400.00");
  });

  it("un servicio del catálogo prellena concepto y monto", () => {
    const quedo = conServicioElegido(
      BORRADOR_DE_LINEA_VACIO,
      RENGLON_PENSIONADO,
      SERVICIOS,
    );

    expect(quedo.concepto).toBe("Inmigrantes · Visa de pensionado o jubilado");
    expect(quedo.monto).toBe("400.00");
    expect(quedo.arancelRenglonId).toBe(RENGLON_PENSIONADO);
  });

  /*
   * **La tercera rama, y es la que no se ve venir.**
   * `serviciosSeleccionables` ofrece el servicio que la línea ya tenía aunque
   * el bufete haya dejado de tarifarlo. Volver a elegir esa opción tiene que
   * conservar la procedencia: sin esta rama caería en «no lo encontré» y
   * borraría el dato que la línea sí tiene. Y no se prellena nada, porque de un
   * servicio sin precio del bufete no hay número que proponer.
   */
  it("un servicio que el catálogo ya no trae se vincula sin prellenar", () => {
    const guardado = borrador({
      concepto: "Visa de pensionado o jubilado",
      monto: "400.00",
      arancelRenglonId: RENGLON_PENSIONADO,
    });

    const quedo = conServicioElegido(guardado, RENGLON_PENSIONADO, []);

    expect(
      quedo.arancelRenglonId,
      "volver a elegir el servicio que la línea ya tenía borró su" +
        " procedencia. El desplegable lo ofrece justamente porque el bufete" +
        " pudo dejar de tarifarlo",
    ).toBe(RENGLON_PENSIONADO);
    expect(quedo.concepto).toBe("Visa de pensionado o jubilado");
    expect(quedo.monto).toBe("400.00");
  });
});

describe("sinServicioTarifado", () => {
  /*
   * Desvincular el servicio **no borra el monto**, y es la decisión que esta
   * función existe para sostener: lo que se quita es la procedencia, no la
   * cifra. La base admite el nulo en `arancel_renglon_id` justamente porque una
   * línea con monto libre es el caso corriente, y tirar el importe que alguien
   * ya aceptó sería perder trabajo ajeno por haber tocado un desplegable.
   */
  it("quita la procedencia y deja el concepto y el monto donde estaban", () => {
    const prellenado = borrador({
      clase: "honorario",
      concepto: "Visa de pensionado o jubilado",
      monto: "400.00",
      arancelRenglonId: RENGLON_PENSIONADO,
    });

    expect(sinServicioTarifado(prellenado)).toEqual({
      clase: "honorario",
      concepto: "Visa de pensionado o jubilado",
      monto: "400.00",
      tipoProcesoId: "",
      arancelRenglonId: "",
    });
  });

  it("no muta el borrador que recibe", () => {
    const prellenado = borrador({ arancelRenglonId: RENGLON_PENSIONADO });
    sinServicioTarifado(prellenado);

    expect(prellenado.arancelRenglonId).toBe(RENGLON_PENSIONADO);
  });
});

describe("el borrador lleva de dónde salió el precio", () => {
  it("el alta arranca sin procedencia", () => {
    expect(BORRADOR_DE_LINEA_VACIO.arancelRenglonId).toBe("");
  });

  it("una línea guardada abre su borrador con la procedencia que tenía", () => {
    const guardada = linea({
      arancelRenglonId: RENGLON_PENSIONADO,
      arancelConcepto: "Visa de pensionado o jubilado",
    });

    expect(borradorDesdeLinea(guardada).arancelRenglonId).toBe(
      RENGLON_PENSIONADO,
    );
  });

  it("una línea sin procedencia abre su borrador con la cadena vacía", () => {
    expect(borradorDesdeLinea(linea()).arancelRenglonId).toBe("");
  });

  /*
   * La traducción del `""` del desplegable al `null` del contrato. Mandar la
   * cadena vacía sería un `tipo_invalido` del Worker por un campo que la
   * persona dejó deliberadamente en blanco.
   */
  it("la normalización traduce el hueco del desplegable a nulo", () => {
    const resultado = normalizarBorradorDeLinea(
      borrador({ clase: "honorario", concepto: "Consulta", monto: "50.00" }),
    );

    expect(resultado.ok && resultado.datos.arancelRenglonId).toBeNull();
  });

  it("la normalización pasa el identificador elegido tal cual", () => {
    const resultado = normalizarBorradorDeLinea(
      borrador({
        clase: "honorario",
        concepto: "Visa de pensionado o jubilado",
        monto: "400.00",
        arancelRenglonId: RENGLON_PENSIONADO,
      }),
    );

    expect(resultado.ok && resultado.datos.arancelRenglonId).toBe(
      RENGLON_PENSIONADO,
    );
  });

  /*
   * **El monto editado viaja tal como quedó**, y es la mitad de la tarea que
   * más fácil sería romper: el prellenado es una propuesta y no una
   * restricción, así que la normalización no vuelve a mirar el catálogo. Que el
   * servidor tampoco lo haga se mide en `test/lineas-api.spec.ts`.
   */
  it("el monto editado encima del prellenado es el que se manda", () => {
    const resultado = normalizarBorradorDeLinea(
      borrador({
        clase: "honorario",
        concepto: "Visa de pensionado o jubilado",
        monto: "999.00",
        arancelRenglonId: RENGLON_PENSIONADO,
      }),
    );

    expect(resultado.ok && resultado.datos.monto).toBe(99_900);
    expect(resultado.ok && resultado.datos.arancelRenglonId).toBe(
      RENGLON_PENSIONADO,
    );
  });

  it("hayCambioEnLinea lo dice cuando se elige un servicio donde no había", () => {
    const guardada = linea({ arancelRenglonId: null });

    expect(
      hayCambioEnLinea(guardada, {
        ...borradorDesdeLinea(guardada),
        arancelRenglonId: RENGLON_PENSIONADO,
      }),
    ).toBe(true);
  });

  it("hayCambioEnLinea lo dice cuando se desvincula el que había", () => {
    const guardada = linea({ arancelRenglonId: RENGLON_PENSIONADO });

    expect(
      hayCambioEnLinea(guardada, {
        ...borradorDesdeLinea(guardada),
        arancelRenglonId: "",
      }),
    ).toBe(true);
  });

  it("hayCambioEnLinea lo niega cuando la procedencia es la misma", () => {
    const guardada = linea({ arancelRenglonId: RENGLON_PENSIONADO });

    expect(hayCambioEnLinea(guardada, borradorDesdeLinea(guardada))).toBe(false);
  });
});

describe("servicioDeLaLinea", () => {
  it("no devuelve ninguno cuando la línea no sabe de dónde salió su precio", () => {
    expect(servicioDeLaLinea(linea({ arancelRenglonId: null }))).toBeNull();
  });

  it("devuelve el identificador y el concepto resuelto en lectura", () => {
    const suya = linea({
      arancelRenglonId: RENGLON_PENSIONADO,
      arancelConcepto: "Visa de pensionado o jubilado",
    });

    expect(servicioDeLaLinea(suya)).toEqual({
      id: RENGLON_PENSIONADO,
      concepto: "Visa de pensionado o jubilado",
    });
  });

  it("conserva el hueco cuando el concepto no se pudo resolver", () => {
    const suya = linea({
      arancelRenglonId: RENGLON_PENSIONADO,
      arancelConcepto: null,
    });

    expect(servicioDeLaLinea(suya)).toEqual({
      id: RENGLON_PENSIONADO,
      concepto: null,
    });
  });
});

describe("textoDelServicioElegido", () => {
  const SERVICIOS = serviciosOfrecibles(catalogoDelAcuerdo());

  /*
   * Esta función reemplaza a `serviciosSeleccionables`, que inyectaba en el
   * `<select>` el servicio que la línea ya tenía aunque el catálogo no lo
   * trajera. Esa inyección existía por un defecto que es exclusivo del
   * `<select>`: con un valor que no corresponde a ninguna opción, el navegador
   * cae en la primera —«Ninguno»— mientras el estado conserva el identificador,
   * así que quien mira lee que la línea no tiene procedencia y, si toca el
   * control creyendo que confirma, la borra.
   *
   * Un combobox no tiene ese defecto: lo que se ve es el texto del campo, y el
   * texto lo decide esta función. Las pruebas de abajo son las mismas tres
   * situaciones que medía aquélla.
   */
  it("sin servicio elegido el campo está vacío, y es un buscador", () => {
    expect(textoDelServicioElegido(SERVICIOS, "", null)).toBe("");
  });

  it("con un servicio del catálogo muestra su rótulo completo", () => {
    expect(
      textoDelServicioElegido(SERVICIOS, RENGLON_PENSIONADO, null),
    ).toBe("Inmigrantes · Visa de pensionado o jubilado");
  });

  /*
   * **El caso alcanzable sin que nadie se equivoque**: el bufete puede
   * borrarle el precio a una regla por cuantía que una línea ya nombra, y desde
   * entonces ese servicio no está en el catálogo ofrecible. Lo que la línea sí
   * tiene es el concepto que la lectura resolvió.
   */
  it("con un servicio fuera del catálogo muestra lo que la lectura resolvió", () => {
    expect(
      textoDelServicioElegido(
        SERVICIOS,
        RENGLON_SIN_CIFRA,
        "Procesos de menor cuantía",
      ),
      "el campo quedó vacío sobre una línea que sí tiene procedencia. Decir" +
        " que no hay servicio elegido cuando hay uno es la mentira que el" +
        " selector existe para no cometer",
    ).toBe("Procesos de menor cuantía");
  });

  it("y la frase de reserva cuando ni el concepto se pudo resolver", () => {
    // `arancelConcepto` llega nulo si la fila apuntada cruzara la frontera del
    // tenant. Un UUID dentro del campo sería peor que una frase.
    expect(textoDelServicioElegido(SERVICIOS, RENGLON_SIN_CIFRA, null)).toBe(
      "El servicio que la línea ya tenía",
    );
  });
});

describe("serviciosPorCategoria", () => {
  const SERVICIOS = serviciosOfrecibles(catalogoDelAcuerdo());

  /*
   * La vista expandida agrupa por categoría porque con 282 renglones es lo que
   * deja recorrer la lista con el ojo. En el selector no va: ahí lo que hay es
   * una lista corta de resultados.
   */
  it("agrupa por categoría, en el orden en que llegaron", () => {
    expect(
      serviciosPorCategoria(SERVICIOS).map((grupo) => grupo.categoria),
    ).toEqual([MIGRACION_DEL_ACUERDO, CIVIL_DEL_ACUERDO]);
  });

  it("deja cada servicio en su grupo, sin reordenar nada", () => {
    const grupos = serviciosPorCategoria(SERVICIOS);

    expect(grupos[0].servicios.map((uno) => uno.id)).toEqual([
      RENGLON_PENSIONADO,
      RENGLON_TRABAJO,
    ]);
    expect(grupos[1].servicios.map((uno) => uno.id)).toEqual([RENGLON_CUANTIA]);
  });

  it("una categoría sin ningún servicio ofrecible no sale", () => {
    // Las dos categorías de pura prosa del acuerdo —«OTROS ASUNTOS» y
    // «PROCESO DE SEPARACIONES…»— no tienen renglones, así que un encabezado
    // suelto en la vista expandida sería un título sin nada debajo.
    expect(
      serviciosPorCategoria(SERVICIOS).map((grupo) => grupo.categoria),
    ).not.toContain(PROSA_DEL_ACUERDO);
  });

  it("de una lista vacía sale una lista vacía", () => {
    expect(serviciosPorCategoria([])).toEqual([]);
  });

  it("no junta dos tramos separados de la misma categoría en un grupo", () => {
    /*
     * El acuerdo no intercala categorías, así que esto es la conducta sobre un
     * dato que no debería llegar — y se afirma porque la implementación compara
     * contra el **último** grupo y no busca en todos, que es lo que la mantiene
     * en una pasada. Si algún día llegaran intercaladas, salen dos grupos con
     * el mismo nombre y no uno con el orden del documento roto.
     */
    const intercalado = serviciosPorCategoria([
      SERVICIOS[0],
      SERVICIOS[2],
      SERVICIOS[1],
    ]);

    expect(intercalado.map((grupo) => grupo.categoria)).toEqual([
      MIGRACION_DEL_ACUERDO,
      CIVIL_DEL_ACUERDO,
      MIGRACION_DEL_ACUERDO,
    ]);
  });
});

describe("moverOpcionActiva", () => {
  /*
   * El teclado del combobox, que es lo que un `<select>` regalaba y acá hay que
   * escribir. Los bordes son los que se equivocan solos.
   */
  it("desde ninguna activa, bajar lleva a la primera", () => {
    expect(moverOpcionActiva(-1, 3, 1)).toBe(0);
  });

  it("desde ninguna activa, subir lleva a la última", () => {
    // Es lo que hace que abrir la lista y apretar ↑ sirva para algo.
    expect(moverOpcionActiva(-1, 3, -1)).toBe(2);
  });

  it("avanza y retrocede de a una", () => {
    expect(moverOpcionActiva(0, 3, 1)).toBe(1);
    expect(moverOpcionActiva(2, 3, -1)).toBe(1);
  });

  it("da la vuelta en los dos extremos", () => {
    // Una lista que se traba en la última opción obliga a contar cuántas veces
    // hay que subir para volver al principio.
    expect(moverOpcionActiva(2, 3, 1)).toBe(0);
    expect(moverOpcionActiva(0, 3, -1)).toBe(2);
  });

  it("sin opciones no hay ninguna activa", () => {
    // El caso de una búsqueda sin resultados. Sin esto, `Enter` elegiría la
    // opción número cero de una lista vacía.
    expect(moverOpcionActiva(-1, 0, 1)).toBe(-1);
    expect(moverOpcionActiva(0, 0, -1)).toBe(-1);
  });

  it("una activa que quedó fuera de rango vuelve al borde", () => {
    // Pasa de verdad: se teclea una letra más y la lista se acorta sin que la
    // activa se mueva. Sin esta rama el índice se quedaría apuntando a una
    // opción que ya no existe.
    expect(moverOpcionActiva(7, 2, 1)).toBe(0);
    expect(moverOpcionActiva(7, 2, -1)).toBe(1);
  });
});

describe("los textos del selector y de la vista expandida", () => {
  it("la ayuda del selector dice que el monto se edita encima", () => {
    expect(AYUDA_DEL_SERVICIO.toLowerCase()).toContain("edita");
  });

  it("la ayuda del selector dice cómo desvincular", () => {
    // Vaciar el campo es el gesto, y sin decirlo nadie lo encuentra: es el
    // mismo recurso que la pantalla de precios usa para borrar un precio
    // propio, y allá también está dicho con un párrafo.
    expect(AYUDA_DEL_SERVICIO.toLowerCase()).toContain("vaciá el campo");
  });

  it("el botón dice las palabras del usuario", () => {
    expect(ROTULO_DE_LISTAR_TODOS).toBe("Listar todos");
  });

  it("el catálogo vacío dice qué pasó y adónde ir", () => {
    expect(SIN_SERVICIOS_OFRECIBLES.toLowerCase()).toContain("vacío");
    expect(SIN_SERVICIOS_OFRECIBLES).toContain("precios");
  });

  it("el enlace a la pantalla de precios sale del resolvedor de rutas", () => {
    // Escrito a mano y no derivado de `enlaceDe`, que es la función que lo
    // produce: una expectativa calculada con la misma fuente pasa aunque las
    // dos estén mal (restricción 6).
    expect(enlaceALosPrecios()).toBe("/catalogos/precios");
  });

  it("la búsqueda sin resultados nombra lo que se buscó", () => {
    expect(sinCoincidencias("sociedad")).toBe(
      "Ningún servicio coincide con «sociedad».",
    );
  });

  /*
   * Es el gemelo de `avisoDeTramites`, y por el mismo argumento: el selector es
   * una ayuda para no tener que acordarse de un número, así que un fallo suyo no
   * puede impedir cotizar. La frase lo dice con todas las letras, y el aviso
   * **no es de error** — el dibujo lo sostiene con un tono neutro.
   */
  it("un fallo del catálogo dice que se puede cotizar igual", () => {
    expect(avisoDePrecios(null)).toBeNull();

    const aviso = avisoDePrecios("No se pudo leer el catálogo.");
    expect(aviso).toContain("No se pudo leer el catálogo.");
    expect(aviso?.toLowerCase()).toContain("a mano");
  });

  /**
   * **Ninguna palabra que mida el precio del bufete, y acá es una prueba de
   * texto y no de dibujo.**
   *
   * Es la regla de `odd/tasks/arancel-de-honorarios.md` sostenida sobre el
   * vocabulario nuevo: la leyenda de la marca tiene que explicar **dos
   * orígenes** sin nombrar el acuerdo, ningún mínimo y nada que haya que
   * revisar. Y la palabra «sugerido» sale del vocabulario de la cotización, que
   * es la corrección del usuario: un preestablecido no es una subcategoría.
   */
  it("ningún texto de la cotización mide un precio contra otro", () => {
    const textos = [
      AYUDA_DEL_SERVICIO,
      AYUDA_DE_LA_LISTA,
      LEYENDA_DE_LA_MARCA,
      SIN_SERVICIOS_OFRECIBLES,
      TITULO_DE_LA_LISTA,
      ROTULO_DE_LISTAR_TODOS,
      ...Object.values(ROTULOS_DE_LA_LINEA),
    ];

    for (const texto of textos) {
      const plano = texto.toLowerCase();

      for (const palabra of [
        "mínim",
        "minim",
        "oficial",
        "debajo",
        "acuerdo",
        "arancel",
        "sugerid",
      ]) {
        expect(
          plano.includes(palabra),
          `el texto «${texto}» dice «${palabra}». Eso vuelve a poner la vara` +
            " con la que el sistema mide una decisión que ya tomó el abogado," +
            " o convierte el preestablecido en una subcategoría. El lugar de" +
            " esas palabras es la tabla del arancel",
        ).toBe(false);
      }
    }
  });

  it("la leyenda explica la marca con las dos palabras del usuario", () => {
    expect(MARCA_DE_EDITADO).toBe("*");
    expect(LEYENDA_DE_LA_MARCA.toLowerCase()).toContain("editó");
    expect(LEYENDA_DE_LA_MARCA.toLowerCase()).toContain("preestablecidos");
  });

  it("los cinco controles de una línea tienen rótulo", () => {
    // La corrección del usuario: «los distintos inputs deben tener un label: no
    // me queda claro qué hace cada uno». Son cinco y ninguno puede faltar.
    expect(Object.keys(ROTULOS_DE_LA_LINEA)).toEqual([
      "concepto",
      "clase",
      "monto",
      "tramite",
      "servicio",
    ]);

    for (const rotulo of Object.values(ROTULOS_DE_LA_LINEA)) {
      expect(rotulo.trim()).not.toBe("");
    }
  });
});
