/**
 * Los formatos compartidos de `src/formatos.ts`, probados contra **cadenas
 * literales**.
 *
 * Este archivo nace de un defecto que las pruebas de pantalla no podían ver,
 * y la forma de las aserciones de acá es la lección:
 *
 *  - `test/pendientes-ui.spec.ts` afirmaba `toContain("30")` para el 30 de
 *    noviembre. Eso se cumple igual con `11/30/2026` que con `30/11/2026`:
 *    probaba que el día no se hubiera corrido, nunca el **orden** de los
 *    campos.
 *  - `test/procesos-ui.spec.ts` comparaba contra `fechaLegible(CERRADO_EN)`,
 *    o sea calculaba el valor esperado con la misma función bajo prueba.
 *    Una aserción así concuerda consigo misma pase lo que pase.
 *
 * Mientras tanto, `dateStyle: "medium"` en `es-PA` escribía el 2 de julio
 * como `07/02/2026`, que en Panamá se lee **7 de febrero**. En un plazo
 * procesal eso no es cosmética.
 *
 * Por eso acá no se calcula nada: se escribe a mano la cadena que tiene que
 * salir. Y las fechas elegidas son las que **no se pueden confundir**: `2
 * jul` y `07/02` no se parecen en nada.
 */
import { describe, expect, it } from "vitest";

import {
  ORDEN_ES,
  VACIO,
  diaLegible,
  fechaLegible,
  plano,
} from "../src/formatos";

/**
 * Los doce meses, con un día que no puede pasar por número de mes. El 25 no
 * existe como mes, así que si en la posición del día apareciera un número de
 * dos cifras ≤ 12 sería el mes disfrazado.
 */
const UN_DIA_DE_CADA_MES = [
  { dia: "2026-01-25", legible: "25 ene 2026" },
  { dia: "2026-02-25", legible: "25 feb 2026" },
  { dia: "2026-03-25", legible: "25 mar 2026" },
  { dia: "2026-04-25", legible: "25 abr 2026" },
  { dia: "2026-05-25", legible: "25 may 2026" },
  { dia: "2026-06-25", legible: "25 jun 2026" },
  { dia: "2026-07-25", legible: "25 jul 2026" },
  { dia: "2026-08-25", legible: "25 ago 2026" },
  { dia: "2026-09-25", legible: "25 sept 2026" },
  { dia: "2026-10-25", legible: "25 oct 2026" },
  { dia: "2026-11-25", legible: "25 nov 2026" },
  { dia: "2026-12-25", legible: "25 dic 2026" },
] as const;

describe("un día del calendario no se puede leer al revés", () => {
  it("el 2 de julio se escribe «2 jul 2026», y nunca «07/02/2026»", () => {
    // La cadena está escrita a mano, no calculada con `diaLegible`. Es el
    // punto entero de esta prueba: con el valor esperado calculado, la
    // aserción concuerda con el defecto en vez de delatarlo.
    expect(diaLegible("2026-07-02")).toBe("2 jul 2026");
  });

  it("el 4 de marzo no se puede confundir con el 3 de abril", () => {
    // `03/04/2026` es la forma que un panameño lee como 3 de abril. Con el
    // mes en letras la ambigüedad no existe: no hay forma de leer «4 mar».
    expect(diaLegible("2026-03-04")).toBe("4 mar 2026");
  });

  it("ningún mes aparece como número: los doce van en letras", () => {
    // Por rechazo: lo que se afirma es que **no** queda ni un día escrito
    // con el mes en cifras. Afirmar que doce fechas salen bien dejaría
    // pasar la decimotercera; afirmar que ninguna sale en cifras, no.
    const enCifras = UN_DIA_DE_CADA_MES.filter(({ dia }) =>
      /\d\s*\/\s*\d/.test(diaLegible(dia)),
    );

    expect(enCifras.map(({ dia }) => dia)).toEqual([]);
  });

  it("cada uno de los doce meses se escribe con su nombre", () => {
    expect(UN_DIA_DE_CADA_MES.map(({ dia }) => diaLegible(dia))).toEqual(
      UN_DIA_DE_CADA_MES.map(({ legible }) => legible),
    );
  });

  it("un día que no se entiende no inventa nada", () => {
    expect(diaLegible("mañana")).toBe(VACIO);
  });
});

describe("un instante tampoco se puede leer al revés", () => {
  /**
   * Mediodía UTC: en cualquier huso de América el día del calendario sigue
   * siendo el 2 de julio, así que la parte de fecha es la misma corra donde
   * corra. La hora sí depende del huso, y por eso va con un patrón en vez de
   * una cifra: lo que esta prueba vigila es el **orden de la fecha**, no el
   * reloj de la máquina que la corre.
   */
  const DOS_DE_JULIO = "2026-07-02T12:00:00.000Z";

  it("empieza por «2 jul 2026», con la hora detrás", () => {
    expect(fechaLegible(DOS_DE_JULIO)).toMatch(
      /^2 jul 2026, \d{1,2}:\d{2} [ap]\. m\.$/,
    );
  });

  it("no escribe la fecha en cifras separadas por barras", () => {
    // Por rechazo, y con el caso concreto nombrado: `07/02/2026` es
    // exactamente lo que salía antes, y lo que un panameño lee como 7 de
    // febrero.
    const legible = fechaLegible(DOS_DE_JULIO);

    expect(legible).not.toContain("07/02");
    expect(legible).not.toMatch(/\d\s*\/\s*\d/);
  });

  it("un instante que no se entiende no inventa nada", () => {
    expect(fechaLegible("ayer")).toBe(VACIO);
  });
});

describe("el colador del español sigue siendo el de Panamá", () => {
  // El defecto de la fecha se arregló cambiando el patrón y **no** el
  // locale. Estas dos aserciones son la guarda de esa decisión: si alguien
  // mueve `es-PA` a otra cosa para arreglar un formato, acá se entera de lo
  // que se lleva puesto de paso.
  it("ordena los apellidos con las reglas del español", () => {
    expect(["ñandú", "Álvarez", "nota", "ávila"].sort(ORDEN_ES.compare)).toEqual(
      ["Álvarez", "ávila", "nota", "ñandú"],
    );
  });

  it("aplana acentos y mayúsculas para buscar como la gente escribe", () => {
    expect(plano("Migración Y NATURALIZACIÓN")).toBe("migracion y naturalizacion");
  });
});
