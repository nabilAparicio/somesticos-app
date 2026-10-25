/**
 * La lógica de la pantalla del generador (T-9), sin React y sin DOM.
 *
 * Lo que vive acá es lo que se puede equivocar en silencio adentro de un
 * componente y nadie vería: qué falta antes de molestar al servidor, qué
 * viaja por el cable, y **qué lee la persona cuando el modelo falla**.
 *
 * Esa última mitad es la que esta tarea podía desperdiciar. T-8 separó siete
 * motivos de falla con nombre y los cuatro que el bufete va a ver de verdad
 * —el proveedor que no está, la respuesta que no se entiende, la que se
 * cortó y la que el proveedor declinó— piden cosas distintas de quien está
 * mirando la pantalla: una se reintenta, otra se reescribe, otra se parte en
 * dos. Una pantalla que dijera «error» para las cuatro tiraría ese trabajo.
 *
 * El dibujo —que el texto llegue al `<textarea>`, que la descripción no se
 * pierda— no se prueba acá sino en `e2e/generar.spec.ts`: afirmar sobre la
 * constante en vez de sobre lo dibujado sería afirmar sobre la mitad que no
 * falla.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  MOTIVOS_DE_FALLA_DEL_MODELO,
  esMotivoDeFallaDelModelo,
  type MotivoDeFallaDelModelo,
} from "../worker/contract";
import { pedir, textoDeProblema } from "../src/api/peticiones";
import { mensajeDeFalla, mensajeDeFallaDelModelo } from "../src/mensajes";
import {
  BORRADOR_DE_GENERACION_VACIO,
  aPeticionDeGeneracion,
  validarBorradorDeGeneracion,
  type BorradorDeGeneracion,
} from "../src/pantallas/cotizaciones/generar";

const HOY = "2026-10-25";

function borrador(
  ajustes: Partial<BorradorDeGeneracion> = {},
): BorradorDeGeneracion {
  return {
    clienteId: "4a3f1d0e-0e2c-4c1f-9a6b-2d8a1c5e7b90",
    venceEn: "",
    descripcion: "Divorcio de mutuo acuerdo, hay bienes.",
    ...ajustes,
  };
}

function motivos(borradorDePrueba: BorradorDeGeneracion): string[] {
  return validarBorradorDeGeneracion(borradorDePrueba, {
    hoy: HOY,
    venceEnActual: null,
  }).map((falla) => falla.motivo);
}

describe("el borrador de la generación", () => {
  it("arranca sin cliente, sin vencimiento y sin descripción", () => {
    // Un desplegable que arranca con el primero de la lista es el que hace
    // cotizarle al cliente equivocado sin que nadie haya elegido nada, y una
    // descripción precargada es prosa genérica que alguien manda sin leer.
    expect(BORRADOR_DE_GENERACION_VACIO).toEqual({
      clienteId: "",
      venceEn: "",
      descripcion: "",
    });
  });

  it("lo que viaja es la descripción recortada", () => {
    expect(
      aPeticionDeGeneracion(borrador({ descripcion: "  Un divorcio.\n " })),
    ).toEqual({
      clienteId: "4a3f1d0e-0e2c-4c1f-9a6b-2d8a1c5e7b90",
      venceEn: null,
      descripcion: "Un divorcio.",
    });
  });

  it("un vencimiento en blanco viaja como nulo y no como cadena vacía", () => {
    expect(aPeticionDeGeneracion(borrador({ venceEn: "" })).venceEn).toBeNull();
  });
});

describe("lo que falta antes de molestar al servidor", () => {
  it("sin descripción no hay nada que generar", () => {
    expect(motivos(borrador({ descripcion: "" }))).toContain(
      "descripcion_requerida",
    );
  });

  it("una descripción de puros espacios es la misma omisión", () => {
    // Se recorta antes de comprobar, por lo mismo que el contenido de un
    // módulo: tres saltos de línea no son una descripción del encargo.
    expect(motivos(borrador({ descripcion: " \n\t " }))).toContain(
      "descripcion_requerida",
    );
  });

  it("sin cliente no hay cotización posible", () => {
    expect(motivos(borrador({ clienteId: "" }))).toContain("cliente_requerido");
  });

  it("devuelve todas las fallas y no la primera", () => {
    // Un formulario que corrige de a un error por envío es el formulario que
    // nadie usa, y acá hay dos campos que se pueden omitir a la vez.
    expect(motivos(borrador({ clienteId: "", descripcion: "" }))).toEqual(
      expect.arrayContaining(["cliente_requerido", "descripcion_requerida"]),
    );
  });

  it("un vencimiento que ya pasó se rechaza, igual que en el alta a mano", () => {
    expect(motivos(borrador({ venceEn: "2024-03-01" }))).toContain(
      "vencimiento_pasado",
    );
  });

  it("un vencimiento que no es un día del calendario se rechaza", () => {
    expect(motivos(borrador({ venceEn: "2026-02-31" }))).toContain(
      "vencimiento_invalido",
    );
  });

  it("hoy no es pasado", () => {
    // El borde que importa: una cotización que se manda y se responde el
    // mismo día es el caso corriente.
    expect(motivos(borrador({ venceEn: HOY }))).toEqual([]);
  });

  it("un borrador completo no tiene nada que decir", () => {
    expect(motivos(borrador())).toEqual([]);
  });

  it("«descripcion_requerida» tiene texto para la persona", () => {
    // El `Record` de `src/mensajes.ts` es exhaustivo, así que un motivo sin
    // texto no compila. Esto afirma que el texto además dice algo.
    expect(mensajeDeFalla("descripcion_requerida").length).toBeGreaterThan(20);
  });
});

/* ==========================================================================
   Los motivos de falla del modelo

   La mitad de T-8 que esta tarea tenía que entregar hasta la pantalla.
   ========================================================================== */

describe("lo que la persona lee cuando el modelo falla", () => {
  it("el vocabulario del cable y el de los textos son el mismo", () => {
    // La lista en ejecución existe para poder recorrer la unión, y la red de
    // tipos de `worker/contract.ts` impide que se desincronicen. Esto afirma
    // que la lista además no está vacía, que es lo único que la red no puede
    // decir.
    expect(MOTIVOS_DE_FALLA_DEL_MODELO.length).toBeGreaterThanOrEqual(7);
  });

  it("cada motivo dice algo, y algo distinto de los demás", () => {
    const textos = MOTIVOS_DE_FALLA_DEL_MODELO.map((motivo) =>
      mensajeDeFallaDelModelo(motivo),
    );

    for (const texto of textos) {
      expect(texto.length).toBeGreaterThan(30);
    }

    // **La aserción que vale.** Dos motivos que se leen igual son dos
    // motivos que no contestan «¿y ahora qué hago?», que es exactamente la
    // pregunta que T-8 los separó para poder contestar.
    expect(
      new Set(textos).size,
      "dos motivos del modelo dicen lo mismo: la distinción que T-8 separó" +
        " se perdió en el camino a la pantalla",
    ).toBe(MOTIVOS_DE_FALLA_DEL_MODELO.length);
  });

  /**
   * Los cuatro que el bufete va a ver de verdad, y lo que cada uno tiene que
   * dejar claro. No se afirma la frase entera —reescribirla no es un
   * defecto— sino la pieza que la hace accionable.
   */
  const ESPERADO: Record<string, string> = {
    proveedor_no_disponible: "volver a intentar",
    respuesta_ininteligible: "volver a intentar",
    respuesta_truncada: "más corta",
    respuesta_rechazada_por_el_proveedor: "declinó",
    modelo_no_configurado: "configurar",
    proveedor_desconocido: "configurar",
    salida_rechazada: "a mano",
  };

  for (const motivo of MOTIVOS_DE_FALLA_DEL_MODELO) {
    it(`«${motivo}» dice qué hacer`, () => {
      const texto = mensajeDeFallaDelModelo(motivo).toLowerCase();
      expect(texto).toContain(ESPERADO[motivo]);
    });
  }

  it("la lista de motivos no tiene repetidos", () => {
    expect(new Set(MOTIVOS_DE_FALLA_DEL_MODELO).size).toBe(
      MOTIVOS_DE_FALLA_DEL_MODELO.length,
    );
  });
});

describe("el guardián del motivo que llega por el cable", () => {
  it("reconoce los motivos del vocabulario", () => {
    for (const motivo of MOTIVOS_DE_FALLA_DEL_MODELO) {
      expect(esMotivoDeFallaDelModelo(motivo)).toBe(true);
    }
  });

  it("no reconoce lo que no está en el vocabulario", () => {
    // Un servidor más nuevo que esta pantalla, o un cuerpo que no es el que
    // creemos. No se inventa un texto: cae en el camino de reserva.
    expect(esMotivoDeFallaDelModelo("motivo_del_futuro")).toBe(false);
    expect(esMotivoDeFallaDelModelo(undefined)).toBe(false);
    expect(esMotivoDeFallaDelModelo(7)).toBe(false);
  });
});

/* ==========================================================================
   El cliente HTTP compartido
   ========================================================================== */

/**
 * Un `fetch` que contesta lo que la prueba quiera, **sin salir a ninguna
 * parte**.
 *
 * Existe porque el mapeo de 502 a `Resultado` vive adentro de `problemaDe`,
 * que es privada, y construir el `Resultado` a mano no la ejerce. Se midió:
 * con una mutación que desactiva esa rama, las pruebas que arman el
 * `Resultado` a mano pasan todas y lo que se cae son catorce de punta a
 * punta. O sea que la distinción que T-8 separó viajaba sin red del lado de
 * la unidad.
 */
function contestando(status: number, cuerpo: unknown): () => void {
  vi.stubGlobal(
    "fetch",
    () => Promise.resolve(Response.json(cuerpo, { status })),
  );

  return () => {
    vi.unstubAllGlobals();
  };
}

describe("el 502 llega a `Resultado` con su motivo", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  for (const motivo of MOTIVOS_DE_FALLA_DEL_MODELO) {
    it(`«${motivo}» sale del cuerpo y no se pierde`, async () => {
      contestando(502, { error: "generacion_fallida", motivo });

      const resultado = await pedir("/api/cotizaciones/generar", {
        method: "POST",
      });

      expect(
        resultado,
        "el 502 cayó en el camino genérico: la pantalla diría «respuesta" +
          " inesperada: HTTP 502» para los siete motivos",
      ).toEqual({ estado: "modelo", motivo });
    });
  }

  it("un 502 sin motivo conocido cae en `falla`, sin inventar nada", async () => {
    // Un proxy delante del Worker, o un servidor más nuevo que esta
    // pantalla. Lo que no puede pasar es que `mensajeDeFallaDelModelo`
    // devuelva `undefined` detrás de un tipo que promete un texto.
    contestando(502, { error: "otra_cosa", motivo: "motivo_del_futuro" });

    const resultado = await pedir("/api/cotizaciones/generar", {
      method: "POST",
    });

    expect(resultado).toEqual({
      estado: "falla",
      mensaje: "respuesta inesperada: HTTP 502",
    });
  });

  it("un 502 sin cuerpo tampoco inventa un motivo", async () => {
    vi.stubGlobal(
      "fetch",
      () => Promise.resolve(new Response("", { status: 502 })),
    );

    const resultado = await pedir("/api/cotizaciones/generar", {
      method: "POST",
    });

    expect(resultado).toEqual({
      estado: "falla",
      mensaje: "respuesta inesperada: HTTP 502",
    });
  });
});

describe("el 502 del generador en `Resultado`", () => {
  it("`textoDeProblema` dice el motivo del modelo y no una frase de reserva", () => {
    for (const motivo of MOTIVOS_DE_FALLA_DEL_MODELO) {
      const texto = textoDeProblema(
        { estado: "modelo", motivo: motivo as MotivoDeFallaDelModelo },
        "esa cotización",
      );

      expect(texto).toBe(mensajeDeFallaDelModelo(motivo));
      // La frase de reserva del mapa de 409 habla de un borrado que nadie
      // pidió. Le pasó tres veces a esta tajada; acá no pasa.
      expect(texto).not.toContain("No se pudo borrar");
    }
  });

  it("no se lee como una falla de red", () => {
    const texto = textoDeProblema(
      { estado: "modelo", motivo: "respuesta_truncada" },
      "esa cotización",
    );

    expect(texto).not.toContain("No se pudo consultar");
  });
});
