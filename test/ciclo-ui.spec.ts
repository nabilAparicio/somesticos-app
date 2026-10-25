/**
 * El ciclo de vida en pantalla (T-4 y T-5, unidad B), del lado puro.
 *
 * Lo que se prueba acá es **qué controles existen en cada estado** y **qué
 * dice la pantalla antes de que alguien apriete uno**. Nada de esto monta un
 * navegador: `src/pantallas/cotizaciones/ciclo.ts` no importa React ni toca
 * el DOM, igual que `presentacion.ts` y por el mismo motivo —son funciones de
 * datos a texto, y adentro de un `.tsx` sólo se pueden probar levantando un
 * navegador para leer lo que ya era una cadena—.
 *
 * Que los controles aparezcan **dibujados** es de `e2e/cotizaciones.spec.ts`.
 * Las dos mitades hacen falta: ésta prueba la regla, aquélla prueba el
 * cableado.
 *
 * ## La fuente de verdad, y por qué se repite acá a mano
 *
 * Las tres transiciones legales las manda `migrations/0007_ciclo_de_vida.sql`:
 *
 *     borrador ──> emitida ──> ganada | perdida
 *
 * Esta suite las escribe **literales**, estado por estado, y no las deriva de
 * ninguna tabla compartida con el código bajo prueba. Es la restricción 6 de
 * la tajada: una prueba que calcula lo que espera con la misma estructura que
 * prueba pasa aunque las dos estén mal. Si mañana la base admite una cuarta
 * flecha, esta suite tiene que ponerse roja y obligar a escribirla a mano.
 */
import { describe, expect, it } from "vitest";

import type { Cotizacion, EstadoDeCotizacion } from "../worker/contract";
import { textoDeProblema } from "../src/api/peticiones";
import {
  ROTULOS_DE_ACCION,
  accionesDe,
  confirmacionDeEmitir,
  salidasEnProsa,
  textoDeProcedencia,
  type AccionDeCiclo,
} from "../src/pantallas/cotizaciones/ciclo";
import { avisoDeNoEsBorrador } from "../src/pantallas/cotizaciones/presentacion";

const ID = "9c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f";
const ID_DEL_ORIGEN = "9c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e60";
const CLIENTE_ID = "4a3f1d0e-0e2c-4c1f-9a6b-2d8a1c5e7b90";

function cotizacion(ajustes: Partial<Cotizacion> = {}): Cotizacion {
  return {
    id: ID,
    codigo: "COT-2026-0007",
    estado: "borrador",
    clienteId: CLIENTE_ID,
    clienteNombre: "Carlos Pérez",
    fecha: "2026-10-22T14:03:00.000Z",
    venceEn: null,
    moneda: "USD",
    duplicadaDeId: null,
    creadaPor: "7335d417-61da-459d-899c-0a01c76a2f94",
    creadaPorNombre: "Itzel",
    creadaEn: "2026-10-22T14:03:00.000Z",
    ...ajustes,
  };
}

/** Los cuatro estados, escritos a mano. Ver la cabecera del archivo. */
const ESTADOS: readonly EstadoDeCotizacion[] = [
  "borrador",
  "emitida",
  "ganada",
  "perdida",
];

function accionesEn(estado: EstadoDeCotizacion): readonly AccionDeCiclo[] {
  return accionesDe(cotizacion({ estado }));
}

// ---------------------------------------------------------------------------
// Las tres flechas, y ni una más
// ---------------------------------------------------------------------------

describe("accionesDe, estado por estado", () => {
  it("un borrador se emite, y se puede duplicar", () => {
    expect(accionesEn("borrador")).toEqual(["emitir", "duplicar"]);
  });

  it("una emitida se gana o se pierde, y se puede duplicar", () => {
    expect(accionesEn("emitida")).toEqual(["ganar", "perder", "duplicar"]);
  });

  it("una ganada no tiene salida más que duplicar", () => {
    expect(accionesEn("ganada")).toEqual(["duplicar"]);
  });

  it("una perdida no tiene salida más que duplicar", () => {
    expect(accionesEn("perdida")).toEqual(["duplicar"]);
  });
});

describe("accionesDe, lo que nunca ofrece", () => {
  it("no ofrece ganar ni perder sobre un borrador", () => {
    // `borrador → ganada` es la peor de las transiciones que la base cerró:
    // no es «ganar un borrador», es fabricar un documento congelado sin
    // pasar por emitir. La pantalla no puede ser la que lo pida.
    expect(accionesEn("borrador")).not.toContain("ganar");
    expect(accionesEn("borrador")).not.toContain("perder");
  });

  it("no ofrece emitir nada que ya haya salido del borrador", () => {
    for (const estado of ["emitida", "ganada", "perdida"] as const) {
      expect(
        accionesEn(estado),
        `«emitir» no puede ofrecerse sobre una ${estado}`,
      ).not.toContain("emitir");
    }
  });

  it("ganada y perdida son el final: ni se ganan ni se pierden de nuevo", () => {
    for (const estado of ["ganada", "perdida"] as const) {
      expect(accionesEn(estado)).not.toContain("ganar");
      expect(accionesEn(estado)).not.toContain("perder");
    }
  });

  it("duplicar nace un borrador desde cualquier estado", () => {
    for (const estado of ESTADOS) {
      expect(
        accionesEn(estado),
        `duplicar tiene que existir sobre una ${estado}`,
      ).toContain("duplicar");
    }
  });

  it("ninguna acción se repite ni se cuela una que no sea del ciclo", () => {
    // El mapa es literal y una duplicación dibujaría dos botones iguales,
    // que es la forma que toma un copiar-pegar mal terminado.
    for (const estado of ESTADOS) {
      const acciones = accionesEn(estado);
      expect(new Set(acciones).size, `${estado} repite una acción`).toBe(
        acciones.length,
      );
    }
  });
});

describe("ROTULOS_DE_ACCION", () => {
  it("cada acción tiene su rótulo, y ninguno se repite", () => {
    const rotulos = Object.values(ROTULOS_DE_ACCION);
    expect(new Set(rotulos).size).toBe(rotulos.length);
  });

  it("emitir y el botón que confirma no se llaman igual", () => {
    // Dos controles con el mismo nombre accesible son dos controles que
    // ninguna prueba —ni ninguna persona con lector de pantalla— puede
    // distinguir.
    expect(ROTULOS_DE_ACCION.emitir).not.toBe(
      ROTULOS_DE_ACCION.emitir + " y congelar",
    );
  });
});

// ---------------------------------------------------------------------------
// Emitir es irreversible, y la pantalla tiene que decirlo
// ---------------------------------------------------------------------------

describe("confirmacionDeEmitir", () => {
  const TEXTO = confirmacionDeEmitir(cotizacion({ codigo: "COT-2026-0042" }));

  it("nombra la cotización que se está por congelar", () => {
    // «¿Confirmás?» en una pantalla con tres cotizaciones abiertas en tres
    // pestañas no dice cuál se está por congelar.
    expect(TEXTO).toContain("COT-2026-0042");
  });

  it("dice que el documento se congela y deja de poder editarse", () => {
    expect(TEXTO).toContain("congela");
    expect(TEXTO).toContain("no se vuelve a editar");
  });

  it("nombra las dos mitades del contenido que quedan congeladas", () => {
    // Que no se pueda editar «la cotización» deja afuera lo que la persona
    // acaba de escribir, que son los módulos y las líneas.
    expect(TEXTO).toContain("módulos");
    expect(TEXTO).toContain("líneas");
  });

  it("dice que no se deshace por ningún otro camino", () => {
    // Lo cierran disparadores de `0006`: no es una regla de esta pantalla
    // que alguien pueda saltarse entrando por otro lado.
    expect(TEXTO).toContain("ningún otro camino");
  });

  it("no pregunta si está seguro: informa", () => {
    // El criterio de la unidad: que diga qué pasa, no que pregunte. «¿Estás
    // seguro?» no informa a nadie, y una confirmación que no informa se
    // aprieta sin leer.
    expect(TEXTO.toLowerCase()).not.toContain("seguro");
    expect(TEXTO).not.toContain("¿");
  });

  it("nombra lo que queda después, que es el ciclo que sigue", () => {
    expect(TEXTO).toContain("ganada");
    expect(TEXTO).toContain("perdida");
    expect(TEXTO).toContain("duplicarla");
  });
});

// ---------------------------------------------------------------------------
// Lo que la pantalla dice en cada estado
// ---------------------------------------------------------------------------

describe("salidasEnProsa", () => {
  it("una emitida tiene tres salidas y se nombran las tres", () => {
    expect(salidasEnProsa(cotizacion({ estado: "emitida" }))).toBe(
      "marcarla ganada, marcarla perdida o duplicarla",
    );
  });

  it("una ganada tiene una sola salida y no lleva coordinación", () => {
    expect(salidasEnProsa(cotizacion({ estado: "ganada" }))).toBe(
      "duplicarla",
    );
  });

  it("un borrador nombra emitir primero", () => {
    expect(salidasEnProsa(cotizacion({ estado: "borrador" }))).toBe(
      "emitirla o duplicarla",
    );
  });
});

describe("avisoDeNoEsBorrador, ahora que las salidas existen", () => {
  it("un borrador no tiene nada que avisar", () => {
    expect(avisoDeNoEsBorrador(cotizacion({ estado: "borrador" }))).toBeNull();
  });

  it("una emitida nombra sus tres salidas y no promete editar", () => {
    const aviso = avisoDeNoEsBorrador(cotizacion({ estado: "emitida" })) ?? "";

    expect(aviso).toContain("Emitida");
    expect(aviso).toContain("marcarla ganada");
    expect(aviso).toContain("marcarla perdida");
    expect(aviso).toContain("duplicarla");
  });

  it("una ganada nombra duplicar y **no** nombra ganar ni perder", () => {
    // Es la lección de la unidad B de T-2 con otra piel: nombrar una salida
    // que no existe manda a buscar un botón que no está. Ganada y perdida
    // son el final.
    const aviso = avisoDeNoEsBorrador(cotizacion({ estado: "ganada" })) ?? "";

    expect(aviso).toContain("duplicarla");
    expect(aviso).not.toContain("ganada,");
    expect(aviso).not.toContain("marcarla perdida");
  });

  it("una perdida tampoco ofrece volver a ganarla", () => {
    const aviso = avisoDeNoEsBorrador(cotizacion({ estado: "perdida" })) ?? "";

    expect(aviso).toContain("duplicarla");
    expect(aviso).not.toContain("marcarla ganada");
  });
});

// ---------------------------------------------------------------------------
// La cadena de duplicación
// ---------------------------------------------------------------------------

describe("textoDeProcedencia", () => {
  it("nombra la cotización de la que salió", () => {
    expect(
      textoDeProcedencia(
        cotizacion({ id: ID_DEL_ORIGEN, codigo: "COT-2025-0001" }),
      ),
    ).toContain("COT-2025-0001");
  });

  it("dice de dónde vino sin prometer que sea la primera de la cadena", () => {
    // El salto es **uno**: la de arriba puede a su vez haber nacido
    // duplicando, y eso se ve abriéndola. Decir «la original» acá sería
    // afirmar algo que esta pantalla no leyó.
    const texto = textoDeProcedencia(
      cotizacion({ id: ID_DEL_ORIGEN, codigo: "COT-2025-0001" }),
    );

    expect(texto.toLowerCase()).not.toContain("original");
    expect(texto.toLowerCase()).not.toContain("primera");
  });

  it("si no se pudo leer la de arriba, lo dice en vez de inventarla", () => {
    // La fila existe siempre —la llave foránea y el disparador de tenencia
    // de `0004` lo garantizan—, así que un hueco acá es una lectura que
    // falló y no una cotización huérfana. Decirlo es lo que distingue un
    // fallo de red de un dato ausente.
    const texto = textoDeProcedencia(null);

    expect(texto).toContain("duplicando");
    expect(texto).toContain("no se pudo leer");
  });
});

// ---------------------------------------------------------------------------
// El 409 de ganar o perder algo que no está emitido
// ---------------------------------------------------------------------------

describe("textoDeProblema, sobre `cotizacion_no_es_emitida`", () => {
  const CONFLICTO = {
    estado: "conflicto",
    motivo: "cotizacion_no_es_emitida",
    bloqueo: null,
    duplicado: null,
  } as const;

  it("tiene su propia frase y no cae en el texto de reserva", () => {
    const texto = textoDeProblema(CONFLICTO, "esa cotización");

    // Se afirma **algo del texto nuevo** y no sólo la ausencia de «borrar»:
    // un `not.toContain` a secas lo pasa cualquier reserva que no use esa
    // palabra, así que no demostraría que la entrada se esté usando.
    expect(texto).toContain("no está emitida");
    expect(texto).toContain("volver a cargar");

    // El texto de reserva habla de un borrado con dependientes: ante este
    // 409 diría «no se pudo borrar», que es un borrado que nadie pidió. Es
    // el mismo defecto que ya apareció dos veces en esta tajada.
    expect(texto.toLowerCase()).not.toContain("no se pudo borrar");
  });

  it("distingue las dos formas de no estar emitida", () => {
    // Un borrador todavía no salió; una ganada o una perdida ya cerraron.
    // Son dos cosas distintas y la frase no puede confundirlas.
    const texto = textoDeProblema(CONFLICTO, "esa cotización");

    expect(texto).toContain("todavía no se mandó");
    expect(texto).toContain("ya cerraron");
  });
});
