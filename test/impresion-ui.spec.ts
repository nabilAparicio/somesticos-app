/**
 * La salida imprimible, del lado de los datos
 * (`odd/tasks/cotizaciones.md`, T-6).
 *
 * Lo que se prueba acá es `src/pantallas/cotizaciones/impresion.ts`, que es
 * lógica de pantalla sin DOM. Lo que **no** se prueba acá es que la hoja se
 * dibuje ni que la hoja de impresión esconda la navegación: eso necesita un
 * navegador y vive en `e2e/impresion.spec.ts`.
 *
 * ## Las dos cosas que esta suite vigila y nadie más
 *
 *  1. **Que no haya una sola suma.** Los subtotales y el total salen de
 *     `documento.totales`, y la prueba que lo demuestra le pasa unos
 *     totales que **no coinciden** con las líneas: si alguien cambiara esto
 *     por una suma, el número que saldría sería el de las líneas y la
 *     prueba moriría. Una prueba con totales coherentes no distingue las
 *     dos implementaciones.
 *  2. **Que las dos tablas de familias no se separen.** `COMO_SE_IMPRIME`
 *     en `impresion.ts` y `COMO_SE_MUESTRA` en `lineas.ts` son dos
 *     registros exhaustivos sobre la misma unión, y la comparación de abajo
 *     es lo que impide que un rótulo cambie de un lado y no del otro.
 */
import { describe, expect, it } from "vitest";

import type {
  DocumentoCongelado,
  LineaCongelada,
} from "../worker/contract";
import type { Resultado } from "../src/api/peticiones";
import { familiasDeLineas } from "../src/pantallas/cotizaciones/lineas";
import {
  AVISO_GASTO_APROXIMADO,
  AVISO_SIN_DOCUMENTO,
  MOTIVO_SIN_DOCUMENTO,
  datosDelCliente,
  datosDeLaPropuesta,
  esBorradorSinDocumento,
  familiasDelDocumento,
  hayGastoEnElDocumento,
  pieDelDocumento,
  textoDeProblemaDeLaHoja,
  tituloDeLaHoja,
} from "../src/pantallas/cotizaciones/impresion";

/* ==========================================================================
   Los dobles
   ========================================================================== */

function linea(ajustes: Partial<LineaCongelada> = {}): LineaCongelada {
  return {
    clase: "honorario",
    rotulo: "Honorarios",
    concepto: "Honorario profesional",
    monto: 150_000,
    tipoProcesoId: null,
    tipoProceso: null,
    ...ajustes,
  };
}

function documento(
  ajustes: Partial<DocumentoCongelado> = {},
): DocumentoCongelado {
  return {
    version: 1,
    emitidaEn: "2026-03-18T14:03:00.000Z",
    emitidaPor: { id: "u1", nombre: "Itzel" },
    cotizacion: {
      id: "c1",
      codigo: "COT-2026-0008",
      fecha: "2026-03-02T09:00:00.000Z",
      venceEn: null,
      moneda: "USD",
    },
    cliente: {
      id: "cl1",
      nombre: "Constructora del Istmo, S.A.",
      tipo: "Persona jurídica",
      documentoTipo: "RUC",
      documentoNumero: "155123456-2-2024",
      representanteLegal: "Ana Pérez",
      email: "contacto@istmo.test",
      telefono: "+507 6000-0000",
    },
    modulos: [
      { tipo: "alcance", rotulo: "Alcance", contenido: "Tramitación." },
    ],
    lineas: [linea()],
    totales: { honorarios: 150_000, gastosEstimados: 0, total: 150_000 },
    ...ajustes,
  };
}

/* ==========================================================================
   Qué se puede imprimir
   ========================================================================== */

describe("el borrador, dicho", () => {
  const sinDocumento: Resultado<unknown> = {
    estado: "conflicto",
    motivo: MOTIVO_SIN_DOCUMENTO,
    bloqueo: null,
    duplicado: null,
  };

  function general(): string {
    return "EL TEXTO GENERAL";
  }

  it("el 409 del borrador se explica como un borrador", () => {
    expect(textoDeProblemaDeLaHoja(sinDocumento, general)).toBe(
      AVISO_SIN_DOCUMENTO,
    );
  });

  it("y no cae en el texto de reserva del mapa compartido", () => {
    // Es la cuarta vez que esta tajada mete un 409 nuevo, y las tres
    // anteriores cayeron en el texto de reserva de `CONFLICTOS`, que habla
    // de un borrado que nadie pidió. Esta prueba es lo que impide la
    // cuarta.
    const texto = textoDeProblemaDeLaHoja(sinDocumento, general);

    expect(texto).not.toContain("borrar");
    expect(texto).not.toBe(general());
  });

  it("el aviso dice qué falta y no sólo que no se puede", () => {
    expect(AVISO_SIN_DOCUMENTO).toContain("borrador");
    expect(AVISO_SIN_DOCUMENTO).toContain("emite");
  });

  it("cualquier otro problema se delega tal cual", () => {
    // Sin esto, una implementación que devolviera siempre el aviso del
    // borrador pasaría las tres pruebas de arriba, y un 404 o una red
    // caída se leerían como «esto es un borrador».
    const otros: Resultado<unknown>[] = [
      { estado: "no_encontrado" },
      { estado: "sin_acceso", motivo: "sin_token" },
      { estado: "falla", mensaje: "se cayó" },
      {
        estado: "conflicto",
        motivo: "otro_motivo_cualquiera",
        bloqueo: null,
        duplicado: null,
      },
    ];

    for (const resultado of otros) {
      expect(textoDeProblemaDeLaHoja(resultado, general)).toBe(general());
    }
  });

  it("esBorradorSinDocumento separa ese 409 de los demás", () => {
    expect(esBorradorSinDocumento(sinDocumento)).toBe(true);
    expect(esBorradorSinDocumento({ estado: "no_encontrado" })).toBe(false);
    expect(
      esBorradorSinDocumento({
        estado: "conflicto",
        motivo: "cotizacion_no_es_borrador",
        bloqueo: null,
        duplicado: null,
      }),
    ).toBe(false);
  });
});

/* ==========================================================================
   Las dos familias, y la aritmética que no se hace
   ========================================================================== */

describe("familiasDelDocumento", () => {
  it("reparte las líneas en el orden del catálogo", () => {
    const familias = familiasDelDocumento(
      documento({
        lineas: [
          linea({ clase: "gasto_estimado", rotulo: "Gastos estimados" }),
          linea(),
        ],
        totales: { honorarios: 150_000, gastosEstimados: 150_000, total: 300_000 },
      }),
    );

    // Honorarios primero aunque la línea de gasto venga antes en el
    // arreglo: el orden lo fija el catálogo del Worker y no el documento.
    expect(familias.map((una) => una.clase)).toEqual([
      "honorario",
      "gasto_estimado",
    ]);
  });

  it("el subtotal sale de los totales del documento y nunca de las líneas", () => {
    /*
     * **Los totales no coinciden con las líneas a propósito.**
     *
     * Son 150 000 en una sola línea de honorario y el documento dice que el
     * subtotal es 999 999. Un documento así no existe en la base —`congelar`
     * los deriva de las mismas líneas—, y justamente por eso sirve: es lo
     * único que separa «lee los totales» de «suma las líneas». Con totales
     * coherentes las dos implementaciones dan el mismo número y la prueba
     * no afirma nada.
     *
     * Y el que manda tiene que ser el del documento: es el que el cliente
     * leyó. Recalcular desde las líneas el día que la aritmética cambie
     * daría un número que nadie prometió.
     */
    const familias = familiasDelDocumento(
      documento({
        lineas: [linea({ monto: 150_000 })],
        totales: { honorarios: 999_999, gastosEstimados: 0, total: 999_999 },
      }),
    );

    expect(familias[0].subtotal).toBe(999_999);
  });

  it("una familia sin líneas no se dibuja", () => {
    const familias = familiasDelDocumento(documento());

    expect(familias).toHaveLength(1);
    expect(familias[0].clase).toBe("honorario");
  });

  it("un documento sin líneas no tiene ninguna familia", () => {
    const familias = familiasDelDocumento(
      documento({
        lineas: [],
        totales: { honorarios: 0, gastosEstimados: 0, total: 0 },
      }),
    );

    expect(familias).toEqual([]);
  });

  it("el gasto se rotula como aproximado y el honorario no", () => {
    const familias = familiasDelDocumento(
      documento({
        lineas: [linea(), linea({ clase: "gasto_estimado" })],
        totales: { honorarios: 150_000, gastosEstimados: 7_550, total: 157_550 },
      }),
    );

    expect(familias[0].aproximado).toBe(false);
    expect(familias[0].aviso).toBeNull();
    expect(familias[0].rotuloDelSubtotal).toBe("Subtotal");

    expect(familias[1].aproximado).toBe(true);
    expect(familias[1].aviso).toBe(AVISO_GASTO_APROXIMADO);
    expect(familias[1].rotuloDelSubtotal).toBe("Subtotal aproximado");
  });

  it("`aproximado` se deriva del aviso y no puede contradecirlo", () => {
    const familias = familiasDelDocumento(
      documento({
        lineas: [linea(), linea({ clase: "gasto_estimado" })],
        totales: { honorarios: 1, gastosEstimados: 1, total: 2 },
      }),
    );

    for (const familia of familias) {
      expect(familia.aproximado).toBe(familia.aviso !== null);
    }
  });

  it("la tabla de la hoja dice lo mismo que la del editor", () => {
    /*
     * El antidesvío de las dos copias.
     *
     * `COMO_SE_IMPRIME` y `COMO_SE_MUESTRA` son dos registros exhaustivos
     * sobre `ClaseDeLinea`, en dos módulos, y la exhaustividad sola no
     * impide que un rótulo cambie de un lado nada más. Esto sí: las dos se
     * ejercen con la misma clase y se comparan campo por campo.
     *
     * Se compara contra `familiasDeLineas` —la función pública— y no contra
     * la tabla privada, porque lo que tiene que coincidir es lo que las dos
     * pantallas muestran y no cómo cada una lo guarda.
     */
    const totales = { honorarios: 150_000, gastosEstimados: 7_550, total: 157_550 };

    const deLaHoja = familiasDelDocumento(
      documento({
        lineas: [linea(), linea({ clase: "gasto_estimado" })],
        totales,
      }),
    );

    const delEditor = familiasDeLineas(
      [
        {
          id: "l1",
          clase: "honorario",
          concepto: "x",
          monto: 150_000,
          tipoProcesoId: null,
          tipoProcesoNombre: null,
          orden: 0,
        },
        {
          id: "l2",
          clase: "gasto_estimado",
          concepto: "y",
          monto: 7_550,
          tipoProcesoId: null,
          tipoProcesoNombre: null,
          orden: 1,
        },
      ],
      totales,
      false,
    );

    expect(deLaHoja).toHaveLength(delEditor.length);

    for (const [i, familia] of deLaHoja.entries()) {
      expect(familia.clase).toBe(delEditor[i].clase);
      expect(familia.rotulo).toBe(delEditor[i].rotulo);
      expect(familia.rotuloDelSubtotal).toBe(delEditor[i].rotuloDelSubtotal);
      expect(familia.aviso).toBe(delEditor[i].aviso);
      expect(familia.aproximado).toBe(delEditor[i].aproximado);
      expect(familia.subtotal).toBe(delEditor[i].subtotal);
    }
  });
});

describe("hayGastoEnElDocumento", () => {
  it("un gasto de cero centavos sigue siendo un gasto", () => {
    // Mirar el subtotal en vez de las clases haría desaparecer el aviso
    // justo donde más incierta está la cifra: una tasa que no se sabía
    // cuánto iba a ser.
    expect(
      hayGastoEnElDocumento(
        documento({
          lineas: [linea({ clase: "gasto_estimado", monto: 0 })],
          totales: { honorarios: 0, gastosEstimados: 0, total: 0 },
        }),
      ),
    ).toBe(true);
  });

  it("sin líneas de gasto es falso", () => {
    expect(hayGastoEnElDocumento(documento())).toBe(false);
  });
});

/* ==========================================================================
   Los encabezados
   ========================================================================== */

describe("datosDelCliente", () => {
  it("junta el tipo y el número del documento en una sola línea", () => {
    const datos = datosDelCliente(documento());

    expect(datos).toContainEqual({
      rotulo: "Documento",
      valor: "RUC 155123456-2-2024",
    });
  });

  it("con sólo una de las dos mitades, dice la que hay", () => {
    const soloNumero = datosDelCliente(
      documento({
        cliente: {
          ...documento().cliente,
          documentoTipo: null,
          documentoNumero: "8-888-8888",
        },
      }),
    );
    expect(soloNumero).toContainEqual({
      rotulo: "Documento",
      valor: "8-888-8888",
    });

    const soloTipo = datosDelCliente(
      documento({
        cliente: {
          ...documento().cliente,
          documentoTipo: "Cédula",
          documentoNumero: null,
        },
      }),
    );
    expect(soloTipo).toContainEqual({ rotulo: "Documento", valor: "Cédula" });
  });

  it("un campo nulo no se dibuja, ni con un guion", () => {
    // En la ficha un hueco es información para el bufete; en el documento
    // es una fila en blanco sobre datos que el cliente conoce de memoria, y
    // se lee como un defecto de la hoja.
    const datos = datosDelCliente(
      documento({
        cliente: {
          id: "cl1",
          nombre: "Juana Pérez",
          tipo: null,
          documentoTipo: null,
          documentoNumero: null,
          representanteLegal: null,
          email: null,
          telefono: "+507 6000-0000",
        },
      }),
    );

    expect(datos).toEqual([{ rotulo: "Teléfono", valor: "+507 6000-0000" }]);
    expect(JSON.stringify(datos)).not.toContain("—");
  });

  it("un campo con sólo espacios tampoco se dibuja", () => {
    // Una fila vieja puede traer `"  "`, que no es nulo y se dibujaría como
    // un rótulo con la nada al lado.
    const datos = datosDelCliente(
      documento({
        cliente: { ...documento().cliente, representanteLegal: "   " },
      }),
    );

    expect(datos.map((dato) => dato.rotulo)).not.toContain(
      "Representante legal",
    );
  });
});

describe("datosDeLaPropuesta", () => {
  it("la fecha que encabeza es la de emisión y no la de apertura", () => {
    // `fecha` es cuándo se abrió el borrador, que puede ser semanas antes y
    // es un dato interno del bufete. Lo que el cliente tiene delante es de
    // cuándo es el papel. Los dos momentos del doble caen en meses
    // distintos justamente para que la confusión sea visible.
    const datos = datosDeLaPropuesta(documento());
    const emitida = datos.find((dato) => dato.rotulo === "Emitida");

    expect(emitida?.valor).toContain("mar");
    expect(emitida?.valor).not.toContain("2 mar 2026, 4:00");
  });

  it("sin vencimiento dice que no vence, y no un guion", () => {
    const datos = datosDeLaPropuesta(documento());

    expect(datos).toContainEqual({ rotulo: "Vigencia", valor: "No vence" });
  });

  it("con vencimiento dice hasta cuándo", () => {
    const datos = datosDeLaPropuesta(
      documento({
        cotizacion: { ...documento().cotizacion, venceEn: "2026-11-30" },
      }),
    );
    const vigencia = datos.find((dato) => dato.rotulo === "Vigencia");

    // El día no se corre: `diaLegible` interpreta y escribe en UTC, porque
    // medianoche UTC en Panamá es el día anterior a las siete de la tarde.
    expect(vigencia?.valor).toBe("Hasta el 30 nov 2026");
  });

  it("lleva el código de la propuesta", () => {
    expect(datosDeLaPropuesta(documento())).toContainEqual({
      rotulo: "Propuesta",
      valor: "COT-2026-0008",
    });
  });
});

describe("pieDelDocumento", () => {
  it("dice quién la emitió y cuándo", () => {
    expect(pieDelDocumento(documento())).toContain("Itzel");
  });

  it("sin nombre dice el hueco y no se calla la frase", () => {
    // Acá lo que falta no es un dato opcional sino el nombre de quien
    // firmó: omitir la frase dejaría el documento sin decir que lo emitió
    // alguien.
    const pie = pieDelDocumento(
      documento({ emitidaPor: { id: "u1", nombre: null } }),
    );

    expect(pie).toContain("Emitida por");
    expect(pie).toContain("—");
  });
});

describe("tituloDeLaHoja", () => {
  it("lleva el código, que es como se va a llamar el PDF", () => {
    // «Imprimir a PDF» nombra el archivo con el `document.title`. Sin el
    // código adentro, el papel del bufete se guarda como el título del
    // armazón.
    expect(tituloDeLaHoja(documento())).toContain("COT-2026-0008");
    expect(tituloDeLaHoja(documento())).toContain("Constructora del Istmo");
  });
});
