/**
 * La lógica de la línea de tiempo y del alta de notas (T-8), sin React y sin
 * DOM.
 *
 * Misma frontera que T-5, T-6 y T-7: lo que se puede probar como función se
 * escribe como función y vive en un `.ts`, para que corra en este runner en
 * vez de exigir un navegador para comparar cadenas. Lo que queda en el
 * `.tsx` es el dibujo.
 *
 * **Ésta es la segunda copia de las reglas de la nota**, declarada como tal.
 * La que manda vive en `worker/notas/dominio.ts` y en su repositorio; ésta
 * avisa antes de mandar. Cada copia tiene sus propias pruebas, para que
 * aflojar una mate las suyas y no las de la otra.
 */
import { describe, expect, it } from "vitest";

import type { EtapaDeProceso, TramoDeLineaDeTiempo } from "../worker/contract";
import {
  AVISO_NOTA_INMUTABLE,
  BORRADOR_DE_NOTA_VACIO,
  aPeticionDeNota,
  etapaVigenteDe,
  opcionesDeEtapa,
  resumenDeLaLinea,
  totalDeNotas,
  validarNota,
} from "../src/pantallas/procesos/notas";

const MOMENTO = "2026-10-20T14:30:00.000Z";

const NOMBRES = [
  "Recepción y revisión de documentos",
  "Presentación ante el Servicio Nacional de Migración",
  "Entrevista y verificación domiciliaria",
  "Resolución y entrega del carné",
] as const;

/** Un plan con `cumplidas` etapas alcanzadas, en orden. */
function plan(cumplidas: number): EtapaDeProceso[] {
  return NOMBRES.map((nombre, orden) => ({
    id: `e${String(orden)}`,
    nombre,
    orden,
    alcanzadaEn: orden < cumplidas ? MOMENTO : null,
  }));
}

function tramo(
  etapa: EtapaDeProceso,
  textos: string[],
): TramoDeLineaDeTiempo {
  return {
    etapa,
    notas: textos.map((texto, indice) => ({
      id: `${etapa.id}-n${String(indice)}`,
      procesoEtapaId: etapa.id,
      texto,
      autorId: "autor",
      autorNombre: "Itzel",
      creadaEn: MOMENTO,
    })),
  };
}

describe("la etapa vigente es la que una nota toma por defecto", () => {
  it("un proceso recién abierto apunta a su primera etapa", () => {
    // El caso que obliga a decidir: no hay ninguna alcanzada todavía y
    // `nota.proceso_etapa_id` es `NOT NULL`.
    expect(etapaVigenteDe(plan(0))?.nombre).toBe(NOMBRES[0]);
  });

  it("un proceso a medio camino apunta a la próxima pendiente", () => {
    expect(etapaVigenteDe(plan(2))?.nombre).toBe(NOMBRES[2]);
  });

  it("un proceso con todo cumplido apunta a la última alcanzada", () => {
    expect(etapaVigenteDe(plan(4))?.nombre).toBe(NOMBRES[3]);
  });

  it("un proceso sin plan no tiene ninguna", () => {
    expect(etapaVigenteDe([])).toBeNull();
  });

  it("no se fía del orden en que llegó el arreglo", () => {
    const desordenado = [...plan(1)].reverse();
    expect(etapaVigenteDe(desordenado)?.nombre).toBe(NOMBRES[1]);
  });
});

describe("el desplegable de etapas", () => {
  it("ofrece el plan entero en orden, numerado y con su estado", () => {
    expect(opcionesDeEtapa(plan(2))).toEqual([
      { id: "e0", etiqueta: `1. ${NOMBRES[0]} · cumplida` },
      { id: "e1", etiqueta: `2. ${NOMBRES[1]} · cumplida` },
      { id: "e2", etiqueta: `3. ${NOMBRES[2]} · etapa vigente` },
      { id: "e3", etiqueta: `4. ${NOMBRES[3]} · pendiente` },
    ]);
  });

  it("marca como vigente la última cumplida cuando no queda nada pendiente", () => {
    const opciones = opcionesDeEtapa(plan(4));
    expect(opciones[3].etiqueta).toBe(`4. ${NOMBRES[3]} · etapa vigente`);
    expect(opciones[2].etiqueta).toBe(`3. ${NOMBRES[2]} · cumplida`);
  });

  it("un proceso sin plan no ofrece ninguna", () => {
    expect(opcionesDeEtapa([])).toEqual([]);
  });
});

describe("la validación del navegador avisa antes de mandar", () => {
  it("acepta una nota con texto sobre un plan con etapas", () => {
    expect(
      validarNota(
        { ...BORRADOR_DE_NOTA_VACIO, texto: "El cliente quiere pago diferido." },
        plan(1),
      ),
    ).toEqual([]);
  });

  it("rechaza una nota vacía", () => {
    expect(validarNota(BORRADOR_DE_NOTA_VACIO, plan(1))).toEqual([
      { campo: "texto", motivo: "texto_requerido" },
    ]);
  });

  it("rechaza una nota en blanco", () => {
    expect(
      validarNota({ ...BORRADOR_DE_NOTA_VACIO, texto: "  \n\t " }, plan(1)),
    ).toEqual([{ campo: "texto", motivo: "texto_requerido" }]);
  });

  it("rechaza anotar en un proceso sin plan", () => {
    expect(
      validarNota({ ...BORRADOR_DE_NOTA_VACIO, texto: "Algo" }, []),
    ).toEqual([{ campo: "procesoEtapaId", motivo: "proceso_sin_etapas" }]);
  });

  it("rechaza una etapa que no es de este plan", () => {
    expect(
      validarNota(
        { texto: "Algo", procesoEtapaId: "la-de-otro-proceso" },
        plan(1),
      ),
    ).toEqual([{ campo: "procesoEtapaId", motivo: "etapa_de_otro_proceso" }]);
  });

  it("acepta una etapa que sí es de este plan", () => {
    expect(
      validarNota({ texto: "Algo", procesoEtapaId: "e2" }, plan(1)),
    ).toEqual([]);
  });
});

describe("lo que se manda al servidor", () => {
  it("recorta el texto y deja la etapa en nulo cuando nadie eligió", () => {
    expect(
      aPeticionDeNota({ texto: "  Pago diferido.  ", procesoEtapaId: "" }),
    ).toEqual({ texto: "Pago diferido.", procesoEtapaId: null });
  });

  it("manda la etapa elegida cuando quien escribe la eligió", () => {
    expect(aPeticionDeNota({ texto: "Pago diferido.", procesoEtapaId: "e1" })).toEqual(
      { texto: "Pago diferido.", procesoEtapaId: "e1" },
    );
  });

  it("conserva los saltos de línea de adentro", () => {
    const texto = "Pide:\n- tres cuotas\n- la primera a la firma";
    expect(aPeticionDeNota({ texto, procesoEtapaId: "" }).texto).toBe(texto);
  });
});

describe("el resumen de la línea de tiempo", () => {
  const etapas = plan(2);

  it("dice que no hay nada cuando no hay nada", () => {
    expect(resumenDeLaLinea([])).toBe(
      "Todavía no hay ninguna nota en este proceso.",
    );
  });

  it("cuenta una sola nota en singular", () => {
    expect(resumenDeLaLinea([tramo(etapas[0], ["Una"])])).toBe(
      "1 nota, anclada a 1 etapa del plan.",
    );
  });

  it("dice cuándo están todas en la misma etapa", () => {
    expect(resumenDeLaLinea([tramo(etapas[0], ["Una", "Otra"])])).toBe(
      "2 notas, todas en la misma etapa.",
    );
  });

  it("reparte la cuenta entre etapas", () => {
    expect(
      resumenDeLaLinea([
        tramo(etapas[0], ["Una", "Otra"]),
        tramo(etapas[2], ["Tercera"]),
      ]),
    ).toBe("3 notas, repartidas en 2 etapas.");
  });

  it("totalDeNotas suma los tramos y no los cuenta como uno", () => {
    expect(
      totalDeNotas([
        tramo(etapas[0], ["Una", "Otra"]),
        tramo(etapas[2], ["Tercera"]),
      ]),
    ).toBe(3);
  });
});

describe("el aviso de que una nota no se deshace", () => {
  it("dice las dos cosas que no se pueden hacer, y la que sí", () => {
    // Está en una constante exportada y no enterrado en el `.tsx` para que
    // su contenido se pueda afirmar acá. Decir solo la prohibición dejaría a
    // alguien sin saber qué hacer cuando el dato cambia, así que el aviso
    // también trae la salida.
    expect(AVISO_NOTA_INMUTABLE).toMatch(/no se edita ni se borra/);
    expect(AVISO_NOTA_INMUTABLE).toMatch(/se anota de nuevo/);
  });
});
