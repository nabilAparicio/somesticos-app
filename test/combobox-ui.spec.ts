/**
 * El combobox de la pantalla de cotización, en su parte pura (T-1 de
 * `odd/tasks/el-selector-de-cliente-busca.md`).
 *
 * ## Qué protege este archivo, y es una sola cosa
 *
 * **Que haya una sola implementación del combobox.** La pantalla de alta de
 * cotización tiene ahora dos selectores buscables —el cliente y el servicio de
 * cada línea— y el riesgo de esa tajada no es que uno de los dos funcione mal:
 * es que sean dos. Dos teclados escritos a mano se separan, y el que se separe
 * primero lo va a hacer en la flecha de un borde o en la lista vacía, que son
 * justo los casos que nadie prueba a mano.
 *
 * Lo que vive acá son las tres decisiones que el combobox toma **sin DOM**:
 * cuáles opciones coinciden con lo que se escribió, cuál queda activa al mover
 * una flecha, y qué dice el campo sobre lo que ya está elegido. Las tres son de
 * `src/pantallas/cotizaciones/combobox.ts`, las tres las usan los dos
 * selectores, y por eso se prueban una vez.
 *
 * Lo que **no** se puede probar acá —que las teclas estén cableadas a estas
 * funciones, que `aria-activedescendant` llegue al atributo, que elegir con
 * `Enter` deje el cliente elegido de verdad— vive en `e2e/cotizaciones.spec.ts`
 * y en `e2e/precios-en-cotizacion.spec.ts`.
 *
 * ## Ninguna expectativa se calcula con la función que se prueba
 *
 * Es la regla de `test/lineas-ui.spec.ts` y acá importa doble: la tentación
 * sería comparar `opcionesQueCoinciden` contra `serviciosQueCoinciden`, que es
 * la función que el selector de servicio usaba antes. Dos funciones comparadas
 * entre sí pasan aunque las dos estén mal. Así que los resultados esperados son
 * arreglos de identificadores escritos a mano.
 */
import { describe, expect, it } from "vitest";

import {
  moverOpcionActiva,
  opcionesQueCoinciden,
  rotuloDeLoElegido,
  type OpcionDelCombobox,
} from "../src/pantallas/cotizaciones/combobox";

const UNO = "11111111-1111-4111-8111-111111111111";
const DOS = "22222222-2222-4222-8222-222222222222";
const TRES = "33333333-3333-4333-8333-333333333333";

/**
 * Tres opciones con la forma que los dos selectores comparten: un
 * identificador y un rótulo.
 *
 * Los rótulos llevan tildes y mayúsculas a propósito, y uno de ellos tiene la
 * palabra buscable **en el medio** y no al principio: así se mide lo que un
 * `<select>` nativo no sabe hacer. Su teclado busca por prefijo del texto de la
 * opción, que es la razón entera por la que estos dos controles existen.
 */
const OPCIONES: readonly OpcionDelCombobox[] = [
  { id: UNO, rotulo: "Carlos Pérez Domínguez" },
  { id: DOS, rotulo: "Inmigrantes · Visa de pensionado o jubilado" },
  { id: TRES, rotulo: "INMOBILIARIA DEL ISTMO, S.A." },
];

function ids(opciones: readonly OpcionDelCombobox[]): string[] {
  return opciones.map((una) => una.id);
}

// ---------------------------------------------------------------------------
// El filtrado: qué opciones coinciden con lo que se escribió
// ---------------------------------------------------------------------------

describe("opcionesQueCoinciden", () => {
  it("sin consulta devuelve la lista entera", () => {
    // Es el caso de abrir el control para cambiar lo que ya está puesto: una
    // lista filtrada por el nombre de lo elegido dejaría una sola opción —la
    // que ya está— justo cuando se abre para elegir otra.
    expect(ids(opcionesQueCoinciden(OPCIONES, ""))).toEqual([UNO, DOS, TRES]);
  });

  it("una consulta de solo espacios también devuelve la lista entera", () => {
    // Apoyar la barra espaciadora no es buscar nada.
    expect(ids(opcionesQueCoinciden(OPCIONES, "   "))).toEqual([
      UNO,
      DOS,
      TRES,
    ]);
  });

  it("devuelve una copia y no el arreglo que llegó", () => {
    // Es estado de React: devolver el mismo arreglo invita a ordenarlo o
    // recortarlo en el lugar, y eso es el cambio que no vuelve a renderizar.
    const salida = opcionesQueCoinciden(OPCIONES, "");
    expect(salida).not.toBe(OPCIONES);
  });

  it("encuentra lo que está en el medio del rótulo, y no solo al principio", () => {
    // **La razón de ser de los dos comboboxes.** El teclado de un `<select>`
    // nativo busca por prefijo, así que escribir «pensionado» no encuentra
    // «Inmigrantes · Visa de pensionado o jubilado».
    expect(
      ids(opcionesQueCoinciden(OPCIONES, "pensionado")),
      "el filtro no encontró una palabra que está en el medio del rótulo: eso" +
        " es lo que ya hacía el `<select>` nativo, y es el defecto que estos" +
        " controles vinieron a arreglar",
    ).toEqual([DOS]);
  });

  it("ignora las tildes y las mayúsculas en los dos lados", () => {
    // Quien busca a Carlos Pérez escribe «perez». Y quien busca la sociedad
    // escribe «inmobiliaria», no el rótulo en mayúsculas del documento.
    expect(ids(opcionesQueCoinciden(OPCIONES, "perez"))).toEqual([UNO]);
    expect(ids(opcionesQueCoinciden(OPCIONES, "PÉREZ"))).toEqual([UNO]);
    expect(ids(opcionesQueCoinciden(OPCIONES, "inmobiliaria"))).toEqual([TRES]);
  });

  it("recorta la consulta antes de comparar", () => {
    // Un espacio pegado al final es lo que deja el teclado de un móvil, y no
    // tiene por qué vaciar la lista.
    expect(ids(opcionesQueCoinciden(OPCIONES, "  perez  "))).toEqual([UNO]);
  });

  it("puede encontrar más de una", () => {
    // «inm» está en «Inmigrantes» y en «INMOBILIARIA», y en ninguna de las dos
    // la palabra entera es la misma: lo que coincide es el prefijo de dos
    // rótulos distintos, que es el caso corriente de una búsqueda a medio
    // escribir.
    expect(ids(opcionesQueCoinciden(OPCIONES, "inm"))).toEqual([DOS, TRES]);
  });

  it("sin coincidencias devuelve la lista vacía", () => {
    // Y no la lista entera: una búsqueda sin resultados que muestra todo es
    // una búsqueda que miente sobre lo que encontró.
    expect(opcionesQueCoinciden(OPCIONES, "sociedad fiduciaria")).toEqual([]);
  });

  it("conserva el orden en que llegaron las opciones", () => {
    // Ni alfabético ni por relevancia: el orden lo decide quien arma la lista
    // —el orden del acuerdo para los servicios, el alfabético de
    // `clientesSeleccionables` para los clientes— y el filtro no lo recompone.
    expect(ids(opcionesQueCoinciden(OPCIONES, "o"))).toEqual([UNO, DOS, TRES]);
  });
});

// ---------------------------------------------------------------------------
// La aritmética de la opción activa
// ---------------------------------------------------------------------------

describe("moverOpcionActiva", () => {
  it("desde ninguna activa, bajar lleva a la primera", () => {
    // Es lo que hace que abrir la lista y apretar ↓ sirva para algo.
    expect(moverOpcionActiva(-1, 3, 1)).toBe(0);
  });

  it("desde ninguna activa, subir lleva a la última", () => {
    expect(moverOpcionActiva(-1, 3, -1)).toBe(2);
  });

  it("se mueve de a una en el medio de la lista", () => {
    expect(moverOpcionActiva(0, 3, 1)).toBe(1);
    expect(moverOpcionActiva(2, 3, -1)).toBe(1);
  });

  it("da la vuelta en los dos extremos", () => {
    // Una lista que se traba en la última opción obliga a contar cuántas
    // veces hay que subir.
    expect(moverOpcionActiva(2, 3, 1)).toBe(0);
    expect(moverOpcionActiva(0, 3, -1)).toBe(2);
  });

  it("sin opciones no hay activa", () => {
    // Es el caso de una búsqueda sin resultados, y sin esto `Enter` elegiría
    // la opción número cero de una lista vacía.
    expect(moverOpcionActiva(-1, 0, 1)).toBe(-1);
    expect(moverOpcionActiva(0, 0, -1)).toBe(-1);
  });

  it("una activa que quedó fuera de rango se trata como ninguna", () => {
    // Pasa de verdad: la lista se encoge al escribir una letra más mientras
    // la activa era la última. Sin esta rama, el índice viejo apuntaría a una
    // opción que ya no está.
    expect(moverOpcionActiva(7, 2, 1)).toBe(0);
    expect(moverOpcionActiva(7, 2, -1)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Qué dice el campo sobre lo que ya está elegido
// ---------------------------------------------------------------------------

describe("rotuloDeLoElegido", () => {
  it("sin nada elegido, el campo está vacío y es un buscador", () => {
    expect(rotuloDeLoElegido(OPCIONES, "")).toBe("");
  });

  it("con algo elegido, el campo dice su rótulo", () => {
    // **Es la mitad del defecto que el `<select>` tenía.** Un `<select>`
    // controlado cuyo valor no corresponde a ninguna opción cae en la primera
    // y dibuja «Elegir cliente…» sobre una cotización que sí tiene cliente.
    // En un combobox lo que se ve es el texto del campo, y lo escribe esto.
    expect(rotuloDeLoElegido(OPCIONES, DOS)).toBe(
      "Inmigrantes · Visa de pensionado o jubilado",
    );
  });

  it("un identificador que la lista no trae deja el campo vacío", () => {
    // La dirección segura para quien no tenga de dónde sacar el nombre: no
    // inventar un texto. Quien sí lo tiene —el selector de servicio, con el
    // concepto que la lectura resolvió de la línea— pasa su propio texto en
    // vez de llamar a esta función.
    expect(
      rotuloDeLoElegido(OPCIONES, "44444444-4444-4444-8444-444444444444"),
    ).toBe("");
  });
});
