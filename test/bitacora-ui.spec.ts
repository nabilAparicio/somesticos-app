/**
 * La bitácora del lado del navegador (T-10): la frase que lee una persona.
 *
 * Misma frontera que T-5 a T-9: lo que se puede probar como función se
 * escribe como función y vive en un `.ts`, para que corra en este runner en
 * vez de exigir un navegador para comparar cadenas.
 *
 * Lo que esta suite fija:
 *
 *  1. **Cada acción del vocabulario tiene su frase.** El `Record` exhaustivo
 *     de `src/bitacora.ts` ya lo impone en `pnpm typecheck` —es el mismo
 *     truco de `src/mensajes.ts`—, y acá se comprueba además que ninguna
 *     frase quedó vacía o copiada de otra.
 *  2. **La frase dice quién, qué y sobre qué**, que es la granularidad que
 *     el usuario pidió: un evento, no un diff.
 *  3. **La ausencia de relleno retroactivo se dice**, no se disimula.
 */
import { describe, expect, it } from "vitest";

import type {
  AccionDeBitacora,
  EntradaDeBitacora,
} from "../worker/contract";
import {
  AVISO_BITACORA_SIN_RELLENO,
  VERBOS_DE_BITACORA,
  fraseDeBitacora,
  resumenDeLaBitacora,
} from "../src/bitacora";

const MOMENTO = "2026-03-03T19:30:00.000Z";

function entrada(
  parcial: Partial<EntradaDeBitacora> = {},
): EntradaDeBitacora {
  return {
    id: "b1",
    entidad: "proceso",
    entidadId: "p1",
    accion: "etapa_alcanzada",
    usuarioId: "u1",
    usuarioNombre: "Itzel",
    ocurridoEn: MOMENTO,
    detalle: "Demanda presentada",
    ...parcial,
  };
}

describe("cada acción del vocabulario tiene una frase propia", () => {
  const acciones = Object.keys(VERBOS_DE_BITACORA) as AccionDeBitacora[];

  it("hay al menos una acción por cada cosa que el bufete hace", () => {
    expect(acciones.length).toBeGreaterThanOrEqual(12);
  });

  it.each(acciones)("«%s» tiene un verbo escrito", (accion) => {
    expect(VERBOS_DE_BITACORA[accion].trim().length).toBeGreaterThan(2);
  });

  it("no hay dos acciones con el mismo verbo", () => {
    // Dos acciones que se leen igual son dos acciones que no sirven para
    // contestar «¿quién hizo esto?»: el día que convivan, la distinción que
    // el vocabulario cerrado protege se pierde en la pantalla.
    const verbos = acciones.map((accion) => VERBOS_DE_BITACORA[accion]);

    expect(new Set(verbos).size).toBe(verbos.length);
  });
});

describe("la frase dice quién, qué y sobre qué", () => {
  it("escribe el ejemplo del usuario, textualmente", () => {
    expect(fraseDeBitacora(entrada())).toBe(
      "Itzel avanzó a «Demanda presentada».",
    );
  });

  it("omite el entrecomillado cuando el hecho no tiene nombre", () => {
    expect(
      fraseDeBitacora(entrada({ accion: "plan_editado", detalle: null })),
    ).toBe("Itzel editó el plan.");
  });

  it("nombra al autor desconocido sin inventarle un nombre", () => {
    // `usuarioNombre` se resuelve en lectura y puede venir nulo si la fila
    // de `usuario` cruzó la frontera del tenant. Un hueco en blanco en un
    // registro de auditoría se lee como si no hubiera autor, y sí lo hay.
    expect(fraseDeBitacora(entrada({ usuarioNombre: null }))).toBe(
      "Alguien del bufete avanzó a «Demanda presentada».",
    );
  });

  it("escribe el alta de un cliente con su nombre", () => {
    expect(
      fraseDeBitacora(
        entrada({
          entidad: "cliente",
          accion: "creado",
          detalle: "Carlos Pérez",
        }),
      ),
    ).toBe("Itzel dio de alta «Carlos Pérez».");
  });

  it("escribe la baja de un catálogo sin confundirla con un borrado", () => {
    const baja = fraseDeBitacora(
      entrada({ entidad: "area", accion: "dado_de_baja", detalle: "Penal" }),
    );
    const borrado = fraseDeBitacora(
      entrada({ entidad: "area", accion: "borrado", detalle: "Penal" }),
    );

    expect(baja).not.toBe(borrado);
    expect(baja).toContain("dio de baja");
    expect(borrado).toContain("borró");
  });
});

describe("el resumen cuenta lo que hay y declara lo que no", () => {
  it("dice que no hay nada cuando no hay nada", () => {
    expect(resumenDeLaBitacora([])).toBe("Todavía no hay nada registrado.");
  });

  it("cuenta un solo hecho en singular", () => {
    expect(resumenDeLaBitacora([entrada()])).toBe("1 hecho registrado.");
  });

  it("cuenta varios en plural", () => {
    expect(
      resumenDeLaBitacora([entrada(), entrada({ id: "b2" })]),
    ).toBe("2 hechos registrados.");
  });

  it("el aviso dice que no hubo relleno retroactivo", () => {
    // No hay relleno de lo anterior a T-10, y eso se dice en vez de
    // disimularse: una bitácora que empieza en blanco se lee como «acá no
    // pasó nada», que es falso.
    expect(AVISO_BITACORA_SIN_RELLENO).toMatch(/antes/i);
    expect(AVISO_BITACORA_SIN_RELLENO.length).toBeGreaterThan(60);
  });
});
