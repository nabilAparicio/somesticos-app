/**
 * La lógica de las dos pantallas del arancel (T-3), sin React y sin DOM.
 *
 * Son dos pantallas y un solo módulo de lógica —`src/pantallas/catalogos/
 * precios.ts`— porque las dos deciden lo mismo sobre los mismos datos: qué
 * renglón acepta un precio, qué renglón coincide con lo que alguien buscó, y
 * cómo se deletrea el ancla que lleva de una a la otra. Dos copias de esa
 * última serían un enlace que apunta a un identificador que nadie escribe.
 *
 * ## Lo que esta suite protege, y es el corazón de la tajada
 *
 * `precioALaVista` devuelve **un** precio, nunca dos. El Acuerdo No 49 de
 * 2001 es un mínimo de hace veinticinco años, y la primera versión del
 * diseño ponía las dos cifras lado a lado con un aviso cuando la del bufete
 * quedaba por debajo. El usuario lo corrigió con todas las letras: «así no se
 * siente que el sistema juzga tus precios, sino que el sistema sabe cuánto
 * cuesta y te lo sugiere». De esa corrección sale la forma del tipo de
 * retorno: un solo `centavos`, un `origen` que dice de quién es, y **ningún
 * campo donde quepa el monto oficial**. La prueba hostil de abajo lo afirma
 * sobre los valores del objeto y no sobre su forma declarada, para que
 * agregarle el oficial como campo nuevo se ponga roja en vez de compilar.
 *
 * Lo que necesita un navegador —que la pantalla dibuje un solo importe por
 * fila, que el enlace aterrice en el renglón correcto, que la nota de
 * procedencia esté arriba de la tabla del arancel— vive en
 * `e2e/precios.spec.ts`. Acá no hay DOM que mirar.
 *
 * ## Ninguna expectativa se calcula con la función que se prueba
 *
 * Los centavos esperados se escriben a mano y los textos también. La
 * conversión centavos ↔ texto **no se reimplementa**: sale de
 * `src/pantallas/cotizaciones/lineas.ts`, que ya la tiene probada por los dos
 * lados en `test/lineas-ui.spec.ts`. Una segunda conversión de dinero en este
 * proyecto sería la que se desincroniza sin que nadie lo note.
 */
import { describe, expect, it } from "vitest";

import type {
  CategoriaDelArancel,
  NotaDelArancel,
  RenglonDelArancel,
} from "../worker/contract";
import {
  AYUDA_DEL_PRECIO_PROPIO,
  MARCA_SUGERIDO,
  NOTA_DE_PROCEDENCIA,
  ROTULO_DE_PROCEDENCIA,
  TITULO_DE_PROCEDENCIA,
  anclaDelRenglon,
  categoriasFiltradas,
  cuantasFilas,
  cuantosRenglones,
  enlaceAlRenglonDelArancel,
  gruposDePrecios,
  hayCambioDePrecio,
  llevaPrecio,
  montoParaGuardar,
  precioALaVista,
  sinBorrador,
} from "../src/pantallas/catalogos/precios";
import { enlaceDe, resolverRuta } from "../src/ruteo";

const MIGRACION = "ACTUACIONES ANTE EL SERVICIO NACIONAL DE MIGRACIÓN";
const CIVIL = "ASUNTOS DE DERECHO PROCESAL (CIVIL-COMERCIAL)";

function renglon(ajustes: Partial<RenglonDelArancel> = {}): RenglonDelArancel {
  return {
    id: "a1111111-1111-4111-8111-111111111111",
    orden: 1,
    categoria: MIGRACION,
    numeral: "1",
    concepto: "Visa de pensionado o jubilado",
    clase: "monto",
    montoOficial: 15000,
    reglaOficial: null,
    monto: null,
    activo: true,
    ...ajustes,
  };
}

function nota(ajustes: Partial<NotaDelArancel> = {}): NotaDelArancel {
  return {
    id: "n1111111-1111-4111-8111-111111111111",
    orden: 1,
    categoria: MIGRACION,
    texto: "En todo trámite se cargarán B/.200.00 por cada dependiente.",
    ...ajustes,
  };
}

function categoria(
  nombre: string,
  renglones: readonly RenglonDelArancel[],
  notas: readonly NotaDelArancel[] = [],
): CategoriaDelArancel {
  return { nombre, renglones: [...renglones], notas: [...notas] };
}

/** Los conceptos dibujados, en el orden en que salieron. */
function conceptos(grupos: readonly { filas: readonly { renglon: RenglonDelArancel }[] }[]): string[] {
  return grupos.flatMap((grupo) =>
    grupo.filas.map((fila) => fila.renglon.concepto),
  );
}

// ---------------------------------------------------------------------------
// El precio a la vista: uno, nunca dos
// ---------------------------------------------------------------------------

describe("el precio a la vista", () => {
  it("es el del bufete cuando el bufete lo decidió", () => {
    expect(precioALaVista(renglon({ monto: 40000, montoOficial: 15000 }))).toEqual(
      { centavos: 40000, origen: "bufete", texto: "400.00" },
    );
  });

  it("es la sugerencia del acuerdo cuando todavía no hay precio propio", () => {
    // Ni un campo vacío ni un cero: el sistema sabe cuánto cuesta y lo dice.
    expect(precioALaVista(renglon({ monto: null, montoOficial: 15000 }))).toEqual(
      { centavos: 15000, origen: "sugerido", texto: "150.00" },
    );
  });

  it("un cero del bufete es una decisión y no una ausencia", () => {
    // «Esto no lo cobramos» es un precio. Si el cero cayera en la rama del
    // nulo, la pantalla le volvería a poner encima la sugerencia del acuerdo
    // y la decisión del bufete desaparecería de la vista.
    expect(precioALaVista(renglon({ monto: 0, montoOficial: 15000 }))).toEqual({
      centavos: 0,
      origen: "bufete",
      texto: "0.00",
    });
  });

  it("una regla sin precio propio no tiene nada que sugerir", () => {
    expect(
      precioALaVista(
        renglon({
          clase: "regla",
          montoOficial: null,
          reglaOficial: "25% de la cuantía de menor cuantía.",
          monto: null,
        }),
      ),
    ).toEqual({ centavos: null, origen: "sin_precio", texto: "" });
  });

  it("una regla con precio propio muestra el del bufete", () => {
    expect(
      precioALaVista(
        renglon({
          clase: "regla",
          montoOficial: null,
          reglaOficial: "25% de la cuantía de menor cuantía.",
          monto: 125000,
        }),
      ),
    ).toEqual({ centavos: 125000, origen: "bufete", texto: "1250.00" });
  });

  it("un rubro no tiene precio de ninguna clase", () => {
    expect(
      precioALaVista(
        renglon({ clase: "rubro", concepto: "Inmigrantes", montoOficial: null }),
      ),
    ).toEqual({ centavos: null, origen: "sin_precio", texto: "" });
  });

  it("no deja pasar el monto oficial junto al del bufete", () => {
    // El criterio de aceptación 4, afirmado sobre los **valores** y no sobre
    // la forma declarada: un campo nuevo con el oficial adentro compilaría
    // sin chistar y esta prueba lo atrapa igual.
    const precio = precioALaVista(renglon({ monto: 40000, montoOficial: 15000 }));

    expect(
      Object.values(precio),
      "el precio a la vista trae el monto oficial además del del bufete: eso" +
        " es la comparación en línea que el usuario pidió sacar",
    ).not.toContain(15000);
    expect(Object.values(precio)).not.toContain("150.00");
  });
});

// ---------------------------------------------------------------------------
// Qué renglones aceptan un precio
// ---------------------------------------------------------------------------

describe("qué renglones aceptan un precio", () => {
  it("el de monto fijo y el de regla sí; el rubro no", () => {
    expect(llevaPrecio(renglon({ clase: "monto" }))).toBe(true);
    expect(llevaPrecio(renglon({ clase: "regla" }))).toBe(true);
    expect(
      llevaPrecio(renglon({ clase: "rubro" })),
      "ofrecerle un campo de monto a un encabezado del acuerdo es ofrecerle" +
        " escribir un dato que no significa nada, y la base lo rechaza con" +
        " `un_rubro_no_lleva_precio`",
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Los grupos de la pantalla de precios
// ---------------------------------------------------------------------------

describe("los grupos de la pantalla de precios", () => {
  const INMIGRANTES = renglon({
    id: "r-rubro",
    orden: 10,
    numeral: "3",
    concepto: "Inmigrantes",
    clase: "rubro",
    montoOficial: null,
  });
  const PENSIONADO = renglon({
    id: "r-pensionado",
    orden: 11,
    numeral: "a",
    concepto: "Visa de pensionado o jubilado",
    montoOficial: 15000,
  });
  const TRABAJO = renglon({
    id: "r-trabajo",
    orden: 12,
    numeral: "b",
    concepto: "Permiso de trabajo",
    montoOficial: 30000,
  });
  const CUANTIA = renglon({
    id: "r-cuantia",
    orden: 20,
    categoria: CIVIL,
    numeral: "1",
    concepto: "Procesos de mayor cuantía",
    clase: "regla",
    montoOficial: null,
    reglaOficial: "25% de lo que se obtenga.",
  });

  const TABLA = [
    categoria(MIGRACION, [INMIGRANTES, PENSIONADO, TRABAJO]),
    categoria(CIVIL, [CUANTIA]),
  ];

  it("respeta el orden de las categorías que mandó el servidor", () => {
    // El orden de las categorías es un dato del acuerdo y se agrupa en el
    // servidor. Reordenarlo acá sería una segunda versión del documento.
    expect(gruposDePrecios(TABLA, "").map((grupo) => grupo.categoria)).toEqual([
      MIGRACION,
      CIVIL,
    ]);
  });

  it("deja pasar el rubro como fila, marcado como que no lleva precio", () => {
    const [migracion] = gruposDePrecios(TABLA, "");

    expect(migracion.filas.map((fila) => fila.llevaPrecio)).toEqual([
      false,
      true,
      true,
    ]);
  });

  it("descarta las categorías que el acuerdo imprime solo como prosa", () => {
    // «OTROS ASUNTOS» y «PROCESO DE SEPARACIONES DE BIENES…» llegan con
    // `renglones: []`. En la tabla del arancel tienen que verse —son parte
    // del documento—; en la pantalla de precios no hay nada que tarifar.
    const conProsa = [...TABLA, categoria("OTROS ASUNTOS", [], [nota()])];

    expect(gruposDePrecios(conProsa, "").map((grupo) => grupo.categoria)).toEqual(
      [MIGRACION, CIVIL],
    );
  });

  it("busca por concepto sin importar acentos ni mayúsculas", () => {
    expect(conceptos(gruposDePrecios(TABLA, "CUANTIA"))).toEqual([
      "Procesos de mayor cuantía",
    ]);
  });

  it("conserva el rubro que encabeza a una fila que sobrevivió", () => {
    const grupos = gruposDePrecios(TABLA, "pensionado");

    expect(conceptos(grupos)).toEqual([
      "Inmigrantes",
      "Visa de pensionado o jubilado",
    ]);
  });

  it("descarta el rubro cuando ninguna de sus filas sobrevivió", () => {
    // Un encabezado solo no dice nada: es un título sin lo que titulaba.
    expect(conceptos(gruposDePrecios(TABLA, "cuantía"))).toEqual([
      "Procesos de mayor cuantía",
    ]);
  });

  it("el texto del rubro también encuentra a sus hijos", () => {
    // «Inmigrantes» es parte del nombre del servicio en el documento: el
    // numeral 3 encabeza a sus letras y el acuerdo no lo repite en cada una.
    expect(conceptos(gruposDePrecios(TABLA, "inmigrantes"))).toEqual([
      "Inmigrantes",
      "Visa de pensionado o jubilado",
      "Permiso de trabajo",
    ]);
  });

  it("no inventa filas cuando nada coincide", () => {
    expect(gruposDePrecios(TABLA, "hipoteca naval")).toEqual([]);
  });

  it("cuenta las filas visibles y los renglones de la tabla entera", () => {
    expect(cuantosRenglones(TABLA)).toBe(4);
    expect(cuantasFilas(gruposDePrecios(TABLA, ""))).toBe(4);
    expect(cuantasFilas(gruposDePrecios(TABLA, "pensionado"))).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Las categorías de la tabla del arancel
// ---------------------------------------------------------------------------

describe("las categorías de la tabla del arancel", () => {
  const RENGLON = renglon({ id: "r-uno", concepto: "Visa de pensionado" });
  const PROSA = categoria("OTROS ASUNTOS", [], [nota({ id: "n-prosa" })]);
  const TABLA = [categoria(MIGRACION, [RENGLON], [nota()]), PROSA];

  it("sin consulta devuelve el documento entero, prosa incluida", () => {
    expect(categoriasFiltradas(TABLA, "")).toEqual(TABLA);
  });

  it("con consulta conserva las notas de la categoría que sobrevive", () => {
    const [migracion] = categoriasFiltradas(TABLA, "pensionado");

    expect(migracion.renglones.map((fila) => fila.id)).toEqual(["r-uno"]);
    expect(migracion.notas).toHaveLength(1);
  });

  it("con consulta se cae la categoría de pura prosa", () => {
    // No tiene renglones que coincidan con nada, así que dejarla sería dejar
    // un encabezado suelto en medio de un resultado de búsqueda.
    expect(
      categoriasFiltradas(TABLA, "pensionado").map((cat) => cat.nombre),
    ).toEqual([MIGRACION]);
  });
});

// ---------------------------------------------------------------------------
// El enlace de una pantalla a la otra
// ---------------------------------------------------------------------------

describe("el enlace al renglón del arancel", () => {
  const ID = "a1111111-1111-4111-8111-111111111111";

  it("deletrea el ancla una sola vez, y es la misma de las dos puntas", () => {
    // Una función y no dos literales: el `id` del `<tr>` de la tabla del
    // arancel y el fragmento del `href` de la pantalla de precios salen de
    // acá, así que no hay lugar donde puedan discrepar.
    expect(anclaDelRenglon(ID)).toBe(`renglon-${ID}`);
  });

  it("cuelga el ancla de la ruta que arma el ruteo, no de un literal", () => {
    expect(enlaceAlRenglonDelArancel(ID)).toBe(
      `${enlaceDe({ nombre: "arancel" })}#${anclaDelRenglon(ID)}`,
    );
  });
});

describe("el ruteo de las dos pantallas del arancel", () => {
  it("resuelve las dos direcciones", () => {
    expect(resolverRuta("/catalogos/precios")).toEqual({ nombre: "precios" });
    expect(resolverRuta("/catalogos/arancel")).toEqual({ nombre: "arancel" });
  });

  it("ida y vuelta", () => {
    for (const ruta of [{ nombre: "precios" }, { nombre: "arancel" }] as const) {
      expect(resolverRuta(enlaceDe(ruta))).toEqual(ruta);
    }
  });

  it("no inventa un tercer segmento que no existe", () => {
    for (const ruta of [
      "/catalogos/precios/nuevo",
      "/catalogos/arancel/algo",
      "/catalogos/precios/",
    ]) {
      // La barra final sí se tolera —la quita `segmentosDe`—, así que esa va
      // aparte: lo que no existe es un tercer segmento con contenido.
      const resuelta = resolverRuta(ruta);
      if (ruta.endsWith("/")) {
        expect(resuelta).toEqual({ nombre: "precios" });
        continue;
      }
      expect(resuelta, ruta).toEqual({ nombre: "desconocida", ruta });
    }
  });
});

// ---------------------------------------------------------------------------
// El precio que se escribe
// ---------------------------------------------------------------------------

describe("el precio que el bufete escribe", () => {
  it("convierte lo tecleado a centavos enteros", () => {
    expect(montoParaGuardar("400.00")).toEqual({ ok: true, monto: 40000 });
    expect(montoParaGuardar("1,500.75")).toEqual({ ok: true, monto: 150075 });
    expect(montoParaGuardar("0")).toEqual({ ok: true, monto: 0 });
  });

  it("el campo vacío borra el precio propio y devuelve la sugerencia", () => {
    // Nulo no es cero: cero es «esto no lo cobramos» y nulo es «todavía no
    // lo decidimos». `fijarMontoDelArancel` manda uno u otro según esto.
    expect(montoParaGuardar("")).toEqual({ ok: true, monto: null });
    expect(montoParaGuardar("   ")).toEqual({ ok: true, monto: null });
  });

  it("rechaza lo que no es un importe", () => {
    for (const texto of ["abc", "4.5.6", "-100", "100.5.0"]) {
      expect(montoParaGuardar(texto), texto).toEqual({ ok: false });
    }
  });

  it("hay cambio cuando lo tecleado difiere de lo que el bufete guardó", () => {
    const guardado = renglon({ monto: 40000, montoOficial: 15000 });

    expect(hayCambioDePrecio(guardado, "400.00")).toBe(false);
    expect(hayCambioDePrecio(guardado, "450.00")).toBe(true);
    expect(hayCambioDePrecio(guardado, "")).toBe(true);
  });

  it("adoptar la sugerencia es un cambio, porque es una decisión", () => {
    // El renglón no tiene precio propio y el campo muestra la sugerencia.
    // Guardar eso convierte una referencia en una decisión del bufete, y
    // por eso el botón tiene que poder apretarse.
    const sinDecidir = renglon({ monto: null, montoOficial: 15000 });

    expect(hayCambioDePrecio(sinDecidir, "150.00")).toBe(true);
    expect(
      hayCambioDePrecio(sinDecidir, ""),
      "borrar lo que no hay no es un cambio: sería un `PUT` que no cambia" +
        " nada y un asiento de bitácora que no pasó",
    ).toBe(false);
  });

  it("lo que no se puede convertir no es un cambio que se pueda guardar", () => {
    expect(hayCambioDePrecio(renglon({ monto: 40000 }), "cuatrocientos")).toBe(
      false,
    );
  });
});

describe("el borrador que se tira al guardar", () => {
  it("saca el del renglón guardado y deja los demás intactos", () => {
    // Tirarlo es lo que hace desaparecer el botón de guardar y lo que deja a
    // la vista el valor que contestó el servidor en vez del texto viejo.
    expect(sinBorrador({ uno: "100.00", dos: "200.00" }, "uno")).toEqual({
      dos: "200.00",
    });
  });

  it("no toca el mapa que recibe, que es estado de React", () => {
    const antes = { uno: "100.00" };

    expect(sinBorrador(antes, "uno")).toEqual({});
    expect(antes).toEqual({ uno: "100.00" });
  });

  it("un identificador que no está no cambia nada", () => {
    expect(sinBorrador({ uno: "100.00" }, "tres")).toEqual({ uno: "100.00" });
  });
});

// ---------------------------------------------------------------------------
// Los textos, que son la mitad de la corrección del usuario
// ---------------------------------------------------------------------------

/** Las palabras con las que un precio se mide contra otro. */
const PALABRAS_DE_COMPARACION = [
  "mínim",
  "oficial",
  "debajo",
  "acuerdo",
  "arancel",
  "ley",
];

describe("los textos de la pantalla de precios", () => {
  it("la marca del valor sugerido es una palabra y no una advertencia", () => {
    expect(MARCA_SUGERIDO).toBe("sugerido");
  });

  it("ninguno de sus textos mide el precio del bufete contra nada", () => {
    // El criterio de aceptación 4 del lado de las palabras. En la pantalla
    // de precios no hay comparación: ni «mínimo», ni «oficial», ni el
    // acuerdo nombrado encima de una decisión que ya tomó el abogado.
    for (const texto of [MARCA_SUGERIDO, AYUDA_DEL_PRECIO_PROPIO]) {
      for (const palabra of PALABRAS_DE_COMPARACION) {
        expect(
          texto.toLowerCase().includes(palabra),
          `«${texto}» dice «${palabra}»: eso es la auditoría que el usuario` +
            " pidió sacar de esta pantalla",
        ).toBe(false);
      }
    }
  });

  it("el rótulo del enlace ofrece en vez de advertir", () => {
    expect(ROTULO_DE_PROCEDENCIA).toBe("de dónde sale este precio");
  });
});

describe("la nota de procedencia", () => {
  it("vive en la tabla del arancel y dice de dónde salen los valores", () => {
    const entera = NOTA_DE_PROCEDENCIA.join(" ");

    expect(TITULO_DE_PROCEDENCIA.length).toBeGreaterThan(0);
    expect(entera).toContain("Acuerdo No 49");
    expect(entera).toContain("24 de abril de 2001");
    expect(entera).toContain("Sala Cuarta de Negocios Generales");
    expect(entera).toContain("Corte Suprema de Justicia");
  });

  it("dice que es un mínimo y que el precio del bufete es suyo", () => {
    const entera = NOTA_DE_PROCEDENCIA.join(" ").toLowerCase();

    expect(
      entera,
      "la nota no dice que la tarifa es un mínimo: sin eso, un número de" +
        " 2001 se lee como el precio de hoy",
    ).toContain("mínim");
    expect(entera).toContain("bufete");
  });
});
