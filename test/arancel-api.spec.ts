import { describe, expect, it } from "vitest";

// @ts-expect-error -- módulo de extracción en JS, sin tipos; es a propósito:
// vive en `scripts/` porque corre en Node contra el PDF, no en el Worker. Se
// importa como espacio de nombres y se desarma abajo porque la directiva de
// arriba aplica a la línea siguiente, y un `import` de nueve nombres partido
// en varias líneas la deja sin efecto.
import * as parseo from "../scripts/arancel/parseo.mjs";

const {
  camposDeLinea,
  contarArancel,
  esEncabezadoDeCategoria,
  esMontoPlano,
  extraerArancel,
  montoEnCentavos,
  numeralDeLinea,
  partirValor,
  unirFragmentos,
} = parseo;

/**
 * El parseo del arancel de honorarios, probado contra las formas **reales**
 * del Acuerdo No 49 de 2001.
 *
 * Lo que este archivo protege es que el arancel sembrado diga lo que dice el
 * papel. Y el riesgo concreto no es que la extracción falle —eso se nota— es
 * que extraiga un número **parecido**: que `B/.2.000.00` entre como dos
 * balboas en vez de dos mil, que `B/,4,000.00` se caiga por tener coma donde
 * va punto, que el monto partido en dos líneas se pierda. Nada de eso rompe
 * nada: produce una tabla de precios creíble y equivocada, que el bufete usa
 * durante meses sin mirar.
 *
 * Por eso cada caso de abajo es una cadena **copiada del volcado del PDF**,
 * no una inventada, y el valor esperado se escribe a mano en centavos. No se
 * calcula nada con la misma función que se está probando.
 *
 * Las erratas del documento se prueban como erratas: `B/.2,00.00` tiene que
 * dar B/.200.00 y no B/.2,000.00, porque la tajada manda transcribir lo que
 * dice el papel y anotar la lectura aparte, en `scripts/arancel/lecturas.md`.
 * Una prueba que esperara B/.2,000.00 estaría pidiendo la corrección
 * silenciosa que el documento de la tajada prohíbe.
 */
describe("montos del arancel, en centavos enteros", () => {
  /**
   * Las ocho formas con las que el documento escribe un balboa. Todas están
   * medidas en el volcado de `pdftotext -layout`; ninguna es hipotética.
   */
  const FORMAS: [string, string, number][] = [
    ["la corriente", "B/.500.00", 50000],
    ["coma de miles", "B/.1,500.00", 150000],
    ["punto de miles", "B/.2.000.00", 200000],
    ["punto de miles en seis cifras", "B/.250.001.00", 25000100],
    ["coma en el sigilo", "B/,2,000.00", 200000],
    ["coma en el sigilo y cinco cifras", "B/,10,000.00", 1000000],
    ["sin punto tras el sigilo", "B/350.00", 35000],
    ["separadores mezclados", "B/.2,000.000.00", 200000000],
  ];

  it.each(FORMAS)("lee %s: %s", (_forma, impreso, centavos) => {
    expect(montoEnCentavos(impreso)).toBe(centavos);
  });

  it("lee el sigilo con espacio, que el documento usa a mitad de sección", () => {
    expect(montoEnCentavos("B/. 750.00")).toBe(75000);
    expect(montoEnCentavos("B/. 10,000.00")).toBe(1000000);
  });

  /**
   * El caso que justifica que la regla sea posicional y no por separador.
   *
   * `B/.2.000.00` y `B/.2,000.00` son el mismo monto escrito distinto, y el
   * documento usa las dos grafías en páginas consecutivas: «4.
   * Naturalizaciones B/.2.000.00» y «8. Cancelaciones B/.2,000.00». Si el
   * parseo tratara el punto como decimal, el primero sería dos balboas con
   * cero centavos y la tabla diría que naturalizarse cuesta B/.2.
   */
  it("el punto de miles no se confunde con el decimal", () => {
    expect(montoEnCentavos("B/.2.000.00")).toBe(montoEnCentavos("B/.2,000.00"));
    expect(montoEnCentavos("B/.2.000.00")).not.toBe(200);
  });

  /**
   * La regla escrita como aserción: el último grupo de dos cifras son los
   * centavos, y todo separador anterior es de miles, sea punto o coma.
   */
  it("el último grupo de dos cifras son los centavos, y solo ese", () => {
    expect(montoEnCentavos("B/.0.01")).toBe(1);
    expect(montoEnCentavos("B/.5,001.00")).toBe(500100);
    expect(montoEnCentavos("B/.100,000.00")).toBe(10000000);
  });

  /**
   * Un monto sin decimales. No está en el acuerdo, pero la regla lo decide
   * sin ambigüedad y conviene que esté fijado: un grupo final de tres cifras
   * son miles, no centavos.
   */
  it("un grupo final de tres cifras son miles, no centavos", () => {
    expect(montoEnCentavos("B/.1,000")).toBe(100000);
    expect(montoEnCentavos("B/.50")).toBe(5000);
  });

  /**
   * Las erratas tipográficas del documento se leen como están impresas.
   * `B/.2,00.00` son doscientos balboas aunque sus hermanos de sección vayan
   * en miles, y `B/.200 00` lleva un espacio donde iba el punto.
   */
  it("transcribe las erratas tipográficas sin corregirlas", () => {
    expect(montoEnCentavos("B/.2,00.00")).toBe(20000);
    expect(montoEnCentavos("B/.200 00")).toBe(20000);
    expect(montoEnCentavos("B/.1,000,00")).toBe(100000);
  });

  /**
   * Lo que **no** es un monto fijo. Un valor con cualquier cosa pegada
   * después deja de ser un precio cerrado, y el precio cerrado es lo único
   * que puede entrar como `monto_oficial` sin mentir.
   */
  const NO_SON_MONTO = [
    "25%",
    "3.5%",
    "tarifa plena",
    "50% de la tarifa",
    "Según convenio",
    "B/.150.00 p/h",
    "B/.200.00 por hora",
    "B/.500.00 salvo convenio",
    "B/.250.00 más el 25%",
    "B/.300.00 a B/,3,000.00",
    "B/,2,000.00 más el 35% de lo que se obtenga o lo que convengan las partes.",
    "10% sobre el valor de la o la reclamación con un mínimo de B/.250.00",
  ];

  it.each(NO_SON_MONTO)("no es un monto fijo: %s", (valor) => {
    expect(esMontoPlano(valor)).toBe(false);
    expect(montoEnCentavos(valor)).toBeNull();
  });
});

describe("geometría de la línea del documento", () => {
  /**
   * El reparto entre concepto y valor cuando el documento nombra montos
   * dentro del concepto. El valor es el de la derecha; los de la izquierda
   * son el tramo de cuantía, y tomarlos por precio es el error que convierte
   * un tramo de B/.10,000 en un honorario de B/.10,000.
   */
  it("el valor es el de la derecha, no el primer monto de la línea", () => {
    const partido = partirValor(
      "De cuantía inferior a B/.10,000.00           10% sobre el valor",
    );

    expect(partido.concepto).toBe("De cuantía inferior a B/.10,000.00");
    expect(partido.valor).toBe("10% sobre el valor");
  });

  it("recoge los tres campos de un monto que el documento separó", () => {
    const partido = partirValor(
      "Procesos por contrabando o defraudación fiscal      B/.    1,000.00   ó",
    );

    expect(partido.concepto).toBe("Procesos por contrabando o defraudación fiscal");
    expect(partido.valor).toBe("B/. 1,000.00 ó");
  });

  /**
   * Cuando la maqueta pegó el monto al concepto con un solo espacio. Se
   * reconoce porque el monto **cierra** la línea; si la oración siguiera, el
   * monto sería parte de ella y no la columna derecha.
   */
  it("parte el monto pegado al concepto cuando cierra la línea", () => {
    const pegado = partirValor(
      "Registro de Propiedad Industrial (Marca de Fábrica, de Comercio. De B/.500.00",
    );

    expect(pegado.valor).toBe("B/.500.00");

    const enLaOracion = partirValor(
      "Para operaciones cuyo valor no sea mayor de B/.10,000.00 un horarios convencional",
    );

    expect(enLaOracion.valor).toBe("");
  });

  it("separa los campos por dos espacios y guarda su columna", () => {
    expect(camposDeLinea("  Apelación        B/.500.00")).toEqual([
      { columna: 2, texto: "Apelación" },
      { columna: 19, texto: "B/.500.00" },
    ]);
  });

  it("pega las palabras que la maqueta cortó con guion", () => {
    expect(unirFragmentos(["organización no-", "gubernamental y de"])).toBe(
      "organización no-gubernamental y de",
    );
    expect(unirFragmentos(["tales", "  como (quejas)  "])).toBe(
      "tales como (quejas)",
    );
  });
});

describe("numerales, tal como los imprime el documento", () => {
  const NUMERALES: [string, string][] = [
    ["  1. Visitantes Temporales", "1"],
    ["  11 Conciliación judicial", "11"],
    ["      a) Casado con nacional panameño", "a"],
    ["         a).     Los honorarios anteriores", "a"],
    ["  d),      En caso de que los créditos", "d"],
    ["          b.1 primer año", "b.1"],
    ["        a.1.   Por la primera instancia", "a.1"],
  ];

  it.each(NUMERALES)("lee el numeral de %s", (linea, token) => {
    expect(numeralDeLinea(linea).token).toBe(token);
  });

  /**
   * Una letra sola no es un numeral. El documento tiene renglones de texto
   * corrido que empiezan con «o de advertencias…» y «y por cada prórroga…», y
   * leerlos como numerales partiría el concepto en dos.
   */
  const NO_SON_NUMERAL = [
    "    o de advertencias o de excipientes",
    "      y por cada prórroga",
    "     de Bienes muebles (leasing)",
    "                               150.00 p/h",
    "                               3.5%",
    "                               20% de los resultados",
    "                               0.0085%",
  ];

  it.each(NO_SON_NUMERAL)("no es un numeral: %s", (linea) => {
    expect(numeralDeLinea(linea)).toBeNull();
  });

  /**
   * Los encabezados de categoría. El documento no los marca de ninguna forma
   * legible por máquina: van en mayúsculas y centrados, y eso es todo.
   */
  it("distingue el encabezado de categoría del renglón en mayúsculas", () => {
    expect(esEncabezadoDeCategoria("        MINISTERIO DE COMERCIO")).toBe(true);
    expect(esEncabezadoDeCategoria("            (MIGRACIÓN)")).toBe(true);
    expect(esEncabezadoDeCategoria("  1. PROCESO EJECUTIVO")).toBe(false);
    expect(esEncabezadoDeCategoria("  5. Visa de Estudiantes   B/.400.00")).toBe(
      false,
    );
    expect(esEncabezadoDeCategoria("ARTICULO 5°. Aquellos asuntos")).toBe(false);
  });
});

/**
 * El recorrido completo, sobre un recorte del volcado real.
 *
 * El recorte reproduce las cuatro cosas que la sección de migración tiene y
 * que ninguna prueba de unidad de más arriba puede ejercer juntas: la
 * categoría partida en dos líneas (`ASUNTOS ADMINISTRATIVOS:` y
 * `(MIGRACIÓN)`), el renglón sin numerar que cuelga del anterior con monto
 * propio, el numeral de letra que hereda la medida del padre, y el monto que
 * el documento dejó en la línea de abajo.
 */
const RECORTE = [
  "ARTICULO 4°. Fijase la siguiente Tarifa Mínima de Honorarios Profesionales así:",
  "",
  "                                  ASUNTOS ADMINISTRATIVOS:",
  "",
  "                                           (MIGRACIÓN)",
  "",
  "  1. Visitantes Temporales (por persona)                                          B/.500.00",
  "",
  "      y por cada prórroga                                                         B/.300.00",
  "",
  "  3. Inmigrantes",
  "",
  "      a) Casado con nacional panameño                                             B/.800.00",
  "",
  "      b) Inversionista",
  "",
  "          b.1 primer año                                                          B/.",
  "                                                                                  1,000.00",
  "",
  "  4. Naturalizaciones                                                             B/.2.000.00",
  "",
  "PARÁGRAFO: En todo trámite se cargarán B/.200.00 por cada dependiente.",
  "",
  "                                 MINISTERIO DE COMERCIO",
  "",
  "  4. Registro de Propiedad Industrial (Marca de Fábrica, de Comercio. De B/.500.00",
  "     Servicios o Denominación Comercial, Uso de expresiones Publicitarias y",
  "     otros).",
  "",
  "  6. Autorización para operar empresas financieras                          B/.5.000.00",
  "",
  "ARTÍCULO 5°. Aquellos asuntos, materias y procesos no contemplados",
].join("\n");

describe("el recorrido del documento", () => {
  const { registros, notas, sinClasificar } = extraerArancel(RECORTE);

  it("no deja ninguna línea sin atribuir", () => {
    expect(sinClasificar).toEqual([]);
  });

  it("une la categoría partida en dos líneas", () => {
    expect(registros[0].categoria).toBe("ASUNTOS ADMINISTRATIVOS (MIGRACIÓN)");
  });

  it("numera el orden del documento, para poder pintarlo como el papel", () => {
    expect(registros.map((r: { orden: number }) => r.orden)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
  });

  it("da de alta el renglón que el documento no numeró, con su propio monto", () => {
    expect(registros[1]).toMatchObject({
      numeral: "1",
      concepto: "y por cada prórroga",
      montoOficial: 30000,
    });
  });

  it("compone el numeral de letra con la medida de su padre", () => {
    expect(registros[2]).toMatchObject({ numeral: "3", clase: "rubro" });
    expect(registros[3]).toMatchObject({
      numeral: "3.a",
      concepto: "Casado con nacional panameño",
      montoOficial: 80000,
    });
  });

  it("recoge el monto que el documento dejó en la línea siguiente", () => {
    expect(registros[5]).toMatchObject({
      numeral: "b.1",
      concepto: "primer año",
      montoOficial: 100000,
      reglaOficial: null,
    });
  });

  it("lee el punto de miles del renglón de naturalizaciones", () => {
    expect(registros[6]).toMatchObject({
      numeral: "4",
      concepto: "Naturalizaciones",
      montoOficial: 200000,
    });
  });

  it("une el concepto que la maqueta partió al pegarlo al monto", () => {
    expect(registros[7]).toMatchObject({
      categoria: "MINISTERIO DE COMERCIO",
      numeral: "4",
      concepto:
        "Registro de Propiedad Industrial (Marca de Fábrica, de Comercio. De " +
        "Servicios o Denominación Comercial, Uso de expresiones Publicitarias y otros).",
      montoOficial: 50000,
    });
  });

  /**
   * El parágrafo es una provisión del acuerdo, no un renglón de tarifa. Se
   * guarda aparte: si entrara como renglón inflaría el conteo de control con
   * una fila que el documento no cotiza.
   */
  it("guarda los parágrafos aparte, sin inventarles un renglón", () => {
    expect(notas.map((n: { texto: string }) => n.texto)).toContain(
      "PARÁGRAFO: En todo trámite se cargarán B/.200.00 por cada dependiente.",
    );
    expect(
      registros.filter((r: { concepto: string }) =>
        r.concepto.startsWith("PARÁGRAFO"),
      ),
    ).toEqual([]);
  });

  it("cuenta por clase y por categoría, que es el control contra el papel", () => {
    expect(contarArancel(registros)).toMatchObject({
      total: 9,
      conMonto: 7,
      conRegla: 0,
      rubros: 2,
      categorias: 2,
    });
  });

  /**
   * Fuera del ARTICULO 4 no hay tarifa, y si el PDF cambiara de forma —otra
   * versión, otro `pdftotext`— la extracción tiene que caerse en vez de
   * devolver una lista corta que se ve sana.
   */
  it("se cae si el volcado no trae el artículo que delimita la tarifa", () => {
    expect(() => extraerArancel("un texto cualquiera")).toThrow(/ARTICULO 4/);
  });
});

/**
 * Una regla con porcentaje se guarda como texto y **sin** monto, y el texto
 * va verbatim, con la errata incluida.
 *
 * El renglón de abajo es el e) de ESTUDIOS DE TÍTULOS, que es la errata que
 * la tajada nombra: el 0.0085% de B/.250,000 son B/.21, por debajo de su
 * propio piso de mil. La lectura —que casi seguro es 0.85%— está anotada en
 * `scripts/arancel/lecturas.md`, y acá se afirma lo contrario de corregirla:
 * que el texto almacenado dice `0.0085%`, tal como está impreso.
 */
describe("las reglas por cuantía no se convierten en monto", () => {
  const ESTUDIOS = [
    "ARTICULO 4°. Fijase la siguiente Tarifa Mínima así:",
    "                                    ESTUDIOS DE TÍTULOS",
    "  e) Para operaciones cuyo valor sea mayor de B/.100,000.00 sin pasar de B/250,000.00 un",
    "     honorario convencional mayor de B/.1,000.00 sin que exceda del 0.0085%.",
    "",
    "  2. PROCESO ORDINARIO",
    "     1.    De menor cuantía                                                25%",
    "ARTÍCULO 5°. Aquellos asuntos",
  ].join("\n");

  const { registros } = extraerArancel(ESTUDIOS);

  it("guarda la regla en texto, sin monto, y con la errata tal cual", () => {
    expect(registros[0]).toMatchObject({
      categoria: "ESTUDIOS DE TÍTULOS",
      clase: "regla",
      montoOficial: null,
    });
    expect(registros[0].reglaOficial).toContain("0.0085%");
    expect(registros[0].reglaOficial).toContain("B/.1,000.00");
    expect(registros[0].reglaOficial).not.toContain("0.85%");
  });

  it("el porcentaje suelto también es regla y no monto", () => {
    expect(registros[2]).toMatchObject({
      clase: "regla",
      concepto: "De menor cuantía",
      montoOficial: null,
      reglaOficial: "25%",
    });
  });
});
