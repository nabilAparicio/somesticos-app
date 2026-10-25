/**
 * La lógica de la pantalla de gastos (T-10, unidad B), sin React y sin DOM.
 *
 * Lo que vive acá es lo que se puede equivocar en silencio dentro de un
 * componente y nadie vería: **que la pantalla no suma**, que el saldo que
 * dibuja es el que llegó, que el número está rotulado por lo que es —
 * informativo y no contable—, que las dos familias no se mezclan, y qué lee
 * la persona cuando el almacén de comprobantes no está.
 *
 * El dibujo —que el rótulo esté puesto, que el aviso se vea, que subir un
 * papel no impida registrar un gasto— se prueba en `e2e/gastos.spec.ts`:
 * afirmar sobre la constante en vez de sobre lo dibujado sería afirmar sobre
 * la mitad que no falla.
 *
 * **Ninguna prueba de este archivo llama a la red ni toca un R2 real.** El
 * `fetch` se sustituye donde hace falta ejercer el cliente HTTP.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  MovimientoDeGasto,
  SaldoDeGastos,
} from "../worker/contract";
import { pedir, pedirArchivo, textoDeProblema } from "../src/api/peticiones";
import { VACIO } from "../src/formatos";
import {
  esMotivoDeFallaDelComprobante,
  mensajeDeFallaDelComprobante,
} from "../src/mensajes";
import {
  centavosDesdeTexto as centavosDesdeTextoDeLasLineas,
  montoLegible as montoLegibleDeLasLineas,
} from "../src/pantallas/cotizaciones/lineas";
import * as deLaPantalla from "../src/pantallas/procesos/gastos";
import {
  ACEPTA_COMPROBANTE,
  AVISO_SALDO_INFORMATIVO,
  BORRADOR_DE_MOVIMIENTO_VACIO,
  ROTULO_DEL_SALDO,
  TIPOS_DE_COMPROBANTE,
  TIPOS_DE_MOVIMIENTO,
  TITULAR_AL_DIA,
  TITULAR_A_FAVOR,
  TITULAR_EN_CONTRA,
  TITULAR_ILEGIBLE,
  TOPE_DEL_COMPROBANTE,
  centavosDesdeTexto,
  familiasDeMovimientos,
  lecturaDelSaldo,
  montoLegible,
  normalizarBorradorDeMovimiento,
  validarComprobante,
  type BorradorDeMovimiento,
} from "../src/pantallas/procesos/gastos";

/* ==========================================================================
   El 502 del comprobante en el cliente HTTP

   La deuda que la unidad A dejó escrita en `worker/contract.ts`: el 502 ya
   estaba tratado, pero sólo reconocía los motivos del modelo, así que un
   `comprobante_no_disponible` caía en «respuesta inesperada: HTTP 502».
   ========================================================================== */

/** Los dos motivos del almacén, escritos a mano y no derivados de la unión. */
const MOTIVOS_DEL_ALMACEN = [
  "almacen_no_configurado",
  "almacen_no_disponible",
] as const;

/**
 * Un `fetch` que contesta lo que la prueba quiera, **sin salir a ninguna
 * parte**.
 *
 * Es el mismo recurso que `test/generar-ui.spec.ts`, y existe por el mismo
 * motivo medido allá: el mapeo del 502 a `Resultado` vive adentro de
 * `problemaDe`, que es privada, y construir el `Resultado` a mano no la
 * ejerce. Una prueba que arma el `Resultado` a mano sobrevive a que la rama
 * del 502 desaparezca.
 */
function contestando(status: number, cuerpo: unknown): void {
  vi.stubGlobal("fetch", () =>
    Promise.resolve(Response.json(cuerpo, { status })),
  );
}

describe("el 502 del comprobante llega a `Resultado` con su motivo", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  for (const motivo of MOTIVOS_DEL_ALMACEN) {
    it(`«${motivo}» sale del cuerpo y no se pierde`, async () => {
      contestando(502, { error: "comprobante_no_disponible", motivo });

      const resultado = await pedir(
        "/api/procesos/p1/gastos/m1/comprobante",
        { method: "PUT" },
      );

      expect(
        resultado,
        "el 502 del comprobante cayó en el camino genérico: la pantalla" +
          " diría «respuesta inesperada: HTTP 502» en vez de decir si hay" +
          " que configurar el almacén o volver a intentar",
      ).toEqual({ estado: "comprobante", motivo });
    });
  }

  it("el mismo 502 se reconoce al traer el papel, no sólo al subirlo", async () => {
    // `pedirArchivo` es una segunda puerta al mismo mapeo. Si el 502 se
    // tratara dentro de `pedir` y no en `problemaDe`, esta pasaría a caer en
    // el texto de reserva y nadie se enteraría.
    contestando(502, {
      error: "comprobante_no_disponible",
      motivo: "almacen_no_disponible",
    });

    const resultado = await pedirArchivo(
      "/api/procesos/p1/gastos/m1/comprobante",
    );

    expect(resultado).toEqual({
      estado: "comprobante",
      motivo: "almacen_no_disponible",
    });
  });

  it("un 502 con un motivo que esta versión no conoce cae en `falla`", async () => {
    // Un proxy delante del Worker, o un servidor más nuevo que esta
    // pantalla. Lo que no puede pasar es que `mensajeDeFallaDelComprobante`
    // devuelva `undefined` detrás de un tipo que promete un texto.
    contestando(502, {
      error: "comprobante_no_disponible",
      motivo: "almacen_del_futuro",
    });

    const resultado = await pedir("/api/procesos/p1/gastos/m1/comprobante", {
      method: "PUT",
    });

    expect(resultado).toEqual({
      estado: "falla",
      mensaje: "respuesta inesperada: HTTP 502",
    });
  });

  it("el 502 del generador sigue llegando como antes", async () => {
    // La aserción de presencia al lado de las de arriba: sin ella, un
    // guardián que contestara `true` para cualquier cadena pasaría las tres
    // primeras y rompería el camino del modelo sin que nada lo dijera.
    contestando(502, {
      error: "generacion_fallida",
      motivo: "respuesta_truncada",
    });

    const resultado = await pedir("/api/cotizaciones/generar", {
      method: "POST",
    });

    expect(resultado).toEqual({
      estado: "modelo",
      motivo: "respuesta_truncada",
    });
  });
});

describe("el guardián del motivo del almacén", () => {
  it("reconoce los dos motivos del vocabulario", () => {
    for (const motivo of MOTIVOS_DEL_ALMACEN) {
      expect(esMotivoDeFallaDelComprobante(motivo)).toBe(true);
    }
  });

  it("no reconoce lo que no está en el vocabulario", () => {
    expect(esMotivoDeFallaDelComprobante("almacen_del_futuro")).toBe(false);
    expect(esMotivoDeFallaDelComprobante("respuesta_truncada")).toBe(false);
    expect(esMotivoDeFallaDelComprobante(undefined)).toBe(false);
    expect(esMotivoDeFallaDelComprobante(7)).toBe(false);
  });
});

describe("lo que la persona lee cuando el almacén no está", () => {
  it("`textoDeProblema` dice el motivo y no una frase de reserva", () => {
    for (const motivo of MOTIVOS_DEL_ALMACEN) {
      const texto = textoDeProblema(
        { estado: "comprobante", motivo },
        "ese comprobante",
      );

      expect(texto).toBe(mensajeDeFallaDelComprobante(motivo));
      // La frase de reserva del mapa de 409 habla de un borrado que nadie
      // pidió. Le pasó tres veces a esta tajada; acá no pasa.
      expect(texto).not.toContain("No se pudo borrar");
      expect(texto).not.toContain("respuesta inesperada");
    }
  });

  it("las dos frases dicen que el movimiento quedó guardado", () => {
    // Es lo primero que la persona necesita saber: que el papel no se haya
    // podido archivar no borró el gasto que acaba de cargar. Sin esta
    // media frase, alguien lo vuelve a cargar creyendo que se perdió.
    for (const motivo of MOTIVOS_DEL_ALMACEN) {
      expect(mensajeDeFallaDelComprobante(motivo)).toContain(
        "movimiento quedó guardado",
      );
    }
  });

  it("cada motivo dice algo distinto del otro", () => {
    // Dos motivos que se leen igual son dos motivos que no contestan «¿y
    // ahora qué hago?»: uno se configura y el otro se reintenta.
    const textos = MOTIVOS_DEL_ALMACEN.map((motivo) =>
      mensajeDeFallaDelComprobante(motivo),
    );

    expect(new Set(textos).size).toBe(MOTIVOS_DEL_ALMACEN.length);
    expect(mensajeDeFallaDelComprobante("almacen_no_configurado")).toContain(
      "configurar",
    );
    expect(mensajeDeFallaDelComprobante("almacen_no_disponible")).toContain(
      "volver a subir",
    );
  });
});

/* ==========================================================================
   La cuenta en pantalla

   Todo lo de acá abajo prueba `src/pantallas/procesos/gastos.ts`, que es
   donde viven las decisiones de la pantalla. El `.tsx` no decide nada.
   ========================================================================== */

/**
 * Una cuenta inventada, con el saldo **declarado aparte de los
 * movimientos**.
 *
 * Que se puedan construir por separado no es comodidad de la prueba: es la
 * forma del contrato. El saldo lo deriva el servidor y viaja en la misma
 * respuesta, así que una prueba puede mandarlos en desacuerdo y exigir que
 * la pantalla dibuje el que llegó. Un doble que devolviera la suma de los
 * movimientos no distinguiría una pantalla que muestra de una que suma.
 */
function movimiento(
  ajustes: Partial<MovimientoDeGasto> = {},
): MovimientoDeGasto {
  return {
    id: "m1",
    fecha: "2026-10-20",
    concepto: "Timbres del Registro Público",
    monto: 58_795,
    tipo: "gasto",
    tieneComprobante: false,
    usuarioId: "u1",
    usuarioNombre: "Itzel",
    registradoEn: "2026-10-20T15:00:00.000Z",
    ...ajustes,
  };
}

function saldoDe(
  anticipos: number,
  gastos: number,
  saldo: number,
): SaldoDeGastos {
  return { anticipos, gastos, saldo };
}

/* --------------------------------------------------------------------------
   La barandilla: la pantalla no suma
   -------------------------------------------------------------------------- */

describe("la pantalla no suma", () => {
  /**
   * Los cuatro números de la unidad A, con el saldo **adrede equivocado**.
   *
   * La suma de verdad da cero; acá el servidor dice 999. Si la pantalla
   * sumara, diría cero. Es la misma prueba que `familiasDeLineas` tiene del
   * otro lado del sistema, y es la única forma de distinguir una pantalla
   * que muestra de una que calcula.
   */
  const MOVIMIENTOS = [
    movimiento({ id: "a1", tipo: "anticipo", monto: 160_238 }),
    movimiento({ id: "g1", tipo: "gasto", monto: 58_795 }),
    movimiento({ id: "g2", tipo: "gasto", monto: 57_539 }),
    movimiento({ id: "g3", tipo: "gasto", monto: 43_904 }),
  ];

  it("los subtotales de las dos familias salen del saldo que llegó", () => {
    const familias = familiasDeMovimientos(
      MOVIMIENTOS,
      saldoDe(111_111, 222_222, 999),
    );

    expect(
      familias.map((familia) => familia.subtotal),
      "un subtotal no coincide con lo que mandó el servidor: la pantalla" +
        " está sumando las filas que tiene a mano",
    ).toEqual([111_111, 222_222]);
  });

  it("el saldo que se lee es el que llegó, no la resta de los subtotales", () => {
    const lectura = lecturaDelSaldo(saldoDe(111_111, 222_222, 999));

    expect(lectura.importe).toBe(montoLegible(999));
  });

  it("el módulo no trae la función que suma", () => {
    // `saldoDe` vive en `worker/gastos/dominio.ts` y se podría importar
    // igual de barato que el vocabulario. No se importa a propósito, por el
    // mismo argumento con el que `src/pantallas/cotizaciones/lineas.ts`
    // deja `totalesDe` del otro lado: tenerla a mano es la forma más fácil
    // de que mañana alguien sume en la pantalla sin darse cuenta.
    expect(Object.keys(deLaPantalla)).not.toContain("saldoDe");
  });
});

/* --------------------------------------------------------------------------
   El saldo, y que diga de qué lado cae
   -------------------------------------------------------------------------- */

describe("la lectura del saldo", () => {
  it("la cuenta saldada de la unidad A se lee «al día»", () => {
    // Anticipo de 160 238 contra gastos de 58 795, 57 539 y 43 904. En
    // centavos enteros la cuenta da **exactamente** cero.
    const lectura = lecturaDelSaldo(saldoDe(160_238, 160_238, 0));

    expect(lectura.titular).toBe(TITULAR_AL_DIA);
    expect(lectura.importe).toBe(montoLegible(0));
  });

  it("un saldo negativo dice que el cliente debe, y el importe va sin signo", () => {
    const lectura = lecturaDelSaldo(saldoDe(0, 160_238, -160_238));

    expect(lectura.titular).toBe(TITULAR_EN_CONTRA);
    // El signo lo lleva la frase, no el número: «−1,602.38» obliga a
    // acordarse de qué lado es el negativo, y la frase lo dice.
    expect(lectura.importe).toBe("1,602.38");
    expect(lectura.importe).not.toContain("-");
    expect(lectura.importe).not.toContain("−");
  });

  it("un saldo positivo dice que al cliente le sobra", () => {
    const lectura = lecturaDelSaldo(saldoDe(200_000, 160_238, 39_762));

    expect(lectura.titular).toBe(TITULAR_A_FAVOR);
    expect(lectura.importe).toBe("397.62");
  });

  it("los tres titulares dicen cosas distintas", () => {
    // Tres frases iguales serían tres estados que no se distinguen, que es
    // el mismo defecto que aplastar siete motivos de falla en uno.
    expect(new Set([TITULAR_AL_DIA, TITULAR_EN_CONTRA, TITULAR_A_FAVOR]).size)
      .toBe(3);
  });

  /**
   * **La medición de la unidad A, del lado de la pantalla.**
   *
   * `160238 − (58795 + 57539 + 43904)` en centavos enteros da cero exacto;
   * la misma resta hecha en dólares da `5,684341886080802e-14`. Si ese
   * número llegara —un servidor que divida por cien en el camino, una
   * pantalla futura que se tiente con sumar—, preguntar `saldo === 0` diría
   * que la cuenta **no** está al día, y preguntar `saldo > 0` diría que al
   * cliente le sobran cero coma nada.
   *
   * Lo correcto no es redondear: es decir que no se sabe. Es lo mismo que
   * hace `montoEditable` con un importe que no es un importe.
   */
  it("un saldo que no es un entero no se clasifica: se dice que no se pudo leer", () => {
    // **La forma de la resta importa, y escribirla mal costó un intento.**
    // La primera versión de esta prueba fue `160238/100 − (58795/100 +
    // 57539/100 + 43904/100)`, o sea sumar los tres gastos y restar una
    // vez: eso da **cero exacto** y la prueba no medía nada. El residuo de
    // la unidad A sale de ir restando uno por uno, que es como lo haría una
    // pantalla que acumulara mientras se teclea. Lo delató la aserción de
    // abajo, que está justamente para eso.
    let flotante = 160_238 / 100;
    for (const gasto of [58_795 / 100, 57_539 / 100, 43_904 / 100]) {
      flotante -= gasto;
    }

    // Primero, que el caso sea el que se cree que es. Sin esto, el día que
    // los coeficientes cambien la prueba mediría otra cosa.
    expect(flotante).not.toBe(0);
    expect(flotante).toBeCloseTo(0, 10);
    expect(Number.isInteger(flotante)).toBe(false);

    const lectura = lecturaDelSaldo(saldoDe(1602.38, 1602.38, flotante));

    expect(
      lectura.titular,
      "un saldo en coma flotante se clasificó igual que uno en centavos: la" +
        " pantalla va a decir «a favor» sobre 0,0000000000000568",
    ).toBe(TITULAR_ILEGIBLE);
    expect(lectura.titular).not.toBe(TITULAR_AL_DIA);
    expect(lectura.titular).not.toBe(TITULAR_A_FAVOR);
  });

  it("un saldo entero sí se clasifica", () => {
    // La aserción de presencia al lado de la de ausencia. Sin ella, una
    // guarda que devolviera siempre «no se pudo leer» pasaría la de arriba.
    expect(lecturaDelSaldo(saldoDe(0, 0, 0)).titular).not.toBe(
      TITULAR_ILEGIBLE,
    );
    expect(lecturaDelSaldo(saldoDe(0, 100, -100)).titular).not.toBe(
      TITULAR_ILEGIBLE,
    );
  });
});

/* --------------------------------------------------------------------------
   El rótulo que dice qué es este número
   -------------------------------------------------------------------------- */

describe("el saldo está rotulado por lo que es", () => {
  it("el rótulo del número lleva la palabra «informativo»", () => {
    // **Va en el rótulo del número y no sólo en un aviso aparte.** Es el
    // criterio de T-3 B con el gasto estimado: la marca viaja pegada a la
    // cifra, así que sobrevive a que alguien recorte la pantalla, la
    // imprima o la fotocopie sin el párrafo de al lado.
    expect(ROTULO_DEL_SALDO.toLowerCase()).toContain("informativo");
  });

  it("la lectura del saldo lleva ese rótulo adentro, y no uno suyo", () => {
    // Dos textos que dicen lo mismo son dos textos que mañana dicen cosas
    // distintas. El rótulo es uno solo y la lectura lo usa.
    expect(lecturaDelSaldo(saldoDe(0, 0, 0)).rotulo).toBe(ROTULO_DEL_SALDO);
  });

  it("el aviso dice qué NO es, y nombra lo que queda fuera", () => {
    const aviso = AVISO_SALDO_INFORMATIVO.toLowerCase();

    // No alcanza con decir «informativo»: la palabra sola no dice contra
    // qué. Lo que la persona tiene que entender es que esto no reemplaza la
    // contabilidad, que es lo que `docs/diseno.md` §2 deja fuera.
    expect(aviso).toContain("contab");
    expect(AVISO_SALDO_INFORMATIVO.length).toBeGreaterThan(80);
  });

  it("el aviso y el rótulo no son el mismo texto", () => {
    // Si fueran el mismo, dibujar los dos sería decir dos veces lo mismo y
    // ninguno de los dos sería verificable por separado.
    expect(AVISO_SALDO_INFORMATIVO).not.toBe(ROTULO_DEL_SALDO);
  });
});

/* --------------------------------------------------------------------------
   Las dos familias
   -------------------------------------------------------------------------- */

describe("las dos familias se leen distinto", () => {
  const MOVIMIENTOS = [
    movimiento({ id: "g1", tipo: "gasto", concepto: "Timbres" }),
    movimiento({ id: "a1", tipo: "anticipo", concepto: "Depósito inicial" }),
    movimiento({ id: "g2", tipo: "gasto", concepto: "Mensajería" }),
  ];

  it("primero lo que entró y después lo que salió", () => {
    // Es el orden de `TIPOS_DE_MOVIMIENTO`, que lo fija el vocabulario del
    // Worker y no esta pantalla.
    expect(
      familiasDeMovimientos(MOVIMIENTOS, saldoDe(0, 0, 0)).map((f) => f.tipo),
    ).toEqual([...TIPOS_DE_MOVIMIENTO]);
  });

  it("cada movimiento cae en su familia y en ninguna otra", () => {
    const familias = familiasDeMovimientos(MOVIMIENTOS, saldoDe(0, 0, 0));

    expect(familias[0].movimientos.map((m) => m.id)).toEqual(["a1"]);
    expect(familias[1].movimientos.map((m) => m.id)).toEqual(["g1", "g2"]);
  });

  it("los dos rótulos dicen de dónde salió la plata, y no son el mismo", () => {
    const familias = familiasDeMovimientos([], saldoDe(0, 0, 0));
    const rotulos = familias.map((f) => f.rotulo);

    expect(new Set(rotulos).size).toBe(2);
    for (const rotulo of rotulos) {
      expect(rotulo.length).toBeGreaterThan(5);
    }
  });

  it("las dos familias se dibujan aunque estén vacías", () => {
    // Una familia que aparece recién con su primer movimiento esconde la
    // mitad de la cuenta: nadie encuentra dónde anotar el primer anticipo.
    expect(familiasDeMovimientos([], saldoDe(0, 0, 0))).toHaveLength(2);
  });

  it("un subtotal que no es un importe se dice como hueco, no como cifra", () => {
    const familias = familiasDeMovimientos([], saldoDe(1602.38, -1, 0));

    expect(familias[0].subtotalLegible).toBe(VACIO);
    expect(familias[1].subtotalLegible).toBe(VACIO);
  });
});

/* --------------------------------------------------------------------------
   El borrador del movimiento
   -------------------------------------------------------------------------- */

describe("el borrador de un movimiento", () => {
  function borrador(
    ajustes: Partial<BorradorDeMovimiento> = {},
  ): BorradorDeMovimiento {
    return {
      tipo: "gasto",
      concepto: "Timbres del Registro Público",
      monto: "587.95",
      fecha: "",
      ...ajustes,
    };
  }

  function motivos(suyo: BorradorDeMovimiento): string[] {
    const salida = normalizarBorradorDeMovimiento(suyo, { hoy: "2026-10-25" });
    return salida.ok ? [] : salida.fallas.map((falla) => falla.motivo);
  }

  it("arranca sin tipo, sin concepto, sin monto y sin fecha", () => {
    // Un desplegable que arranca en «gasto» hace cargar un gasto donde
    // alguien quería anotar un anticipo, que es el lado equivocado del
    // saldo; y un monto preescrito en «0.00» se manda sin pensarlo.
    expect(BORRADOR_DE_MOVIMIENTO_VACIO).toEqual({
      tipo: "",
      concepto: "",
      monto: "",
      fecha: "",
    });
  });

  it("sin tipo no se sabe de qué lado del saldo cae", () => {
    expect(motivos(borrador({ tipo: "" }))).toContain(
      "tipo_de_movimiento_desconocido",
    );
  });

  it("un tipo inventado cae en el mismo motivo", () => {
    expect(motivos(borrador({ tipo: "ajuste" }))).toContain(
      "tipo_de_movimiento_desconocido",
    );
  });

  it("sin concepto, el monto no dice por qué se movió", () => {
    expect(motivos(borrador({ concepto: "   " }))).toContain(
      "concepto_requerido",
    );
  });

  it("un monto que no es un importe se rechaza antes de mandarlo", () => {
    expect(motivos(borrador({ monto: "1.234" }))).toContain("monto_invalido");
    expect(motivos(borrador({ monto: "" }))).toContain("monto_invalido");
    expect(motivos(borrador({ monto: "-5" }))).toContain("monto_invalido");
  });

  it("devuelve todas las fallas y no la primera", () => {
    expect(motivos(borrador({ tipo: "", concepto: "", monto: "x" }))).toEqual(
      expect.arrayContaining([
        "tipo_de_movimiento_desconocido",
        "concepto_requerido",
        "monto_invalido",
      ]),
    );
  });

  it("una fecha en blanco viaja como el día de hoy", () => {
    const salida = normalizarBorradorDeMovimiento(borrador({ fecha: "" }), {
      hoy: "2026-10-25",
    });

    expect(salida.ok && salida.datos.fecha).toBe("2026-10-25");
  });

  it("una fecha que no es un día del calendario se rechaza", () => {
    expect(motivos(borrador({ fecha: "2026-02-31" }))).toContain(
      "fecha_invalida",
    );
  });

  it("una fecha del futuro se rechaza con su propio motivo", () => {
    // Es motivo aparte y no `fecha_invalida` porque la corrección es otra:
    // una pide un día que exista y la otra pide decir cuándo pasó.
    expect(motivos(borrador({ fecha: "2026-12-01" }))).toContain(
      "fecha_futura",
    );
  });

  it("hoy no es futuro", () => {
    // El borde que importa: cargar hoy lo que pasó hoy es el caso corriente.
    expect(motivos(borrador({ fecha: "2026-10-25" }))).toEqual([]);
  });

  it("lo que viaja lleva el concepto recortado y el monto en centavos", () => {
    const salida = normalizarBorradorDeMovimiento(
      borrador({ concepto: "  Timbres  ", monto: "1,602.38" }),
      { hoy: "2026-10-25" },
    );

    expect(salida.ok && salida.datos).toEqual({
      tipo: "gasto",
      concepto: "Timbres",
      monto: 160_238,
      fecha: "2026-10-25",
    });
  });

  it("el saldo no viaja, y no hay dónde ponerlo", () => {
    const salida = normalizarBorradorDeMovimiento(borrador(), {
      hoy: "2026-10-25",
    });

    expect(salida.ok && Object.keys(salida.datos).sort()).toEqual([
      "concepto",
      "fecha",
      "monto",
      "tipo",
    ]);
  });
});

/* --------------------------------------------------------------------------
   El comprobante, antes de subirlo
   -------------------------------------------------------------------------- */

describe("qué se admite como comprobante", () => {
  it("un PDF y las dos imágenes pasan", () => {
    for (const tipo of TIPOS_DE_COMPROBANTE) {
      expect(validarComprobante({ type: tipo, size: 1024 })).toBeNull();
    }
  });

  it("otra cosa se rechaza sin gastar la subida", () => {
    expect(
      validarComprobante({ type: "text/html", size: 1024 })?.motivo,
    ).toBe("comprobante_no_admitido");
  });

  it("un archivo vacío cae en el mismo motivo que uno que no es comprobante", () => {
    expect(
      validarComprobante({ type: "application/pdf", size: 0 })?.motivo,
    ).toBe("comprobante_no_admitido");
  });

  it("uno que pasa del tope tiene su propio motivo", () => {
    // La corrección es otra: ahí hay que elegir otro archivo, acá hay que
    // achicar el que se tiene.
    expect(
      validarComprobante({
        type: "application/pdf",
        size: TOPE_DEL_COMPROBANTE + 1,
      })?.motivo,
    ).toBe("comprobante_demasiado_grande");
  });

  it("justo en el tope todavía pasa", () => {
    expect(
      validarComprobante({
        type: "application/pdf",
        size: TOPE_DEL_COMPROBANTE,
      }),
    ).toBeNull();
  });

  it("el `accept` del control sale de la misma lista que valida", () => {
    // Si se escribieran aparte, el control ofrecería un tipo que el
    // servidor rechaza con un 422 que llega después de subir el archivo.
    expect(ACEPTA_COMPROBANTE.split(",")).toEqual([...TIPOS_DE_COMPROBANTE]);
  });
});

/* --------------------------------------------------------------------------
   Lo que no se vuelve a escribir
   -------------------------------------------------------------------------- */

describe("la conversión de dinero es la única del proyecto", () => {
  it("`montoLegible` es la misma función que usan las líneas", () => {
    // Una segunda conversión centavos ↔ pantalla sería el defecto que
    // `src/pantallas/cotizaciones/lineas.ts` existe para no tener: dos
    // formas de escribir un importe, y la que se desincronice primero lo
    // hace sin que nadie lo note.
    expect(montoLegible).toBe(montoLegibleDeLasLineas);
    expect(centavosDesdeTexto).toBe(centavosDesdeTextoDeLasLineas);
  });
});
