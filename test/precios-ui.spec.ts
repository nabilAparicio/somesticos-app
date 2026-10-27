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
  LEYENDA_DE_LA_MARCA,
  MARCA_DE_EDITADO,
  MARCA_DE_EDITADO_LEIDA,
  NOTA_DE_PROCEDENCIA,
  ROTULO_DE_PROCEDENCIA,
  SERVICIO_SIN_NOMBRE,
  TITULO_DE_PROCEDENCIA,
  anclaDelRenglon,
  categoriasFiltradas,
  cuantasFilas,
  cuantosRenglones,
  enlaceAlRenglonDelArancel,
  gruposDePrecios,
  hayCambioDePrecio,
  hayPrecioDelBufete,
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

  it("es el preestablecido cuando todavía no hay precio propio", () => {
    // Ni un campo vacío ni un cero: el sistema sabe cuánto cuesta y lo dice.
    //
    // El `origen` se llama `preestablecido` y no `sugerido`, y es la palabra
    // del usuario: «los preestablecidos son eso, preestablecidos: son la norma
    // hasta que se editen, no son una subcategoría». Es un dato interno y
    // podría llamarse de cualquier forma, pero una sola pantalla de este
    // sistema con dos vocabularios es como empezó la inconsistencia.
    expect(precioALaVista(renglon({ monto: null, montoOficial: 15000 }))).toEqual(
      { centavos: 15000, origen: "preestablecido", texto: "150.00" },
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

  /**
   * **Si hay alguna fila marcada**, que es lo que decide si la leyenda se
   * dibuja.
   *
   * Es la misma regla que la vista expandida de la cotización aplica con
   * `hayAlgunEditado`: una leyenda que explica un signo que no aparece en
   * ninguna parte manda a buscarlo por una tabla de 453 filas.
   *
   * Se mide sobre los grupos **filtrados** y no sobre el catálogo entero, y
   * eso es la decisión: lo que importa es si hay una marca a la vista.
   */
  describe("si hay algún precio del bufete entre lo que se ve", () => {
    const EDITADO = renglon({
      id: "r-editado",
      orden: 11,
      concepto: "Visa de pensionado o jubilado",
      montoOficial: 15000,
      monto: 40000,
    });
    const CON_UNO = [categoria(MIGRACION, [INMIGRANTES, EDITADO, TRABAJO])];

    it("con una fila editada, sí", () => {
      expect(hayPrecioDelBufete(gruposDePrecios(CON_UNO, ""))).toBe(true);
    });

    it("con todas preestablecidas, no", () => {
      expect(hayPrecioDelBufete(gruposDePrecios(TABLA, ""))).toBe(false);
    });

    it("una búsqueda que deja afuera la fila editada apaga la leyenda", () => {
      expect(hayPrecioDelBufete(gruposDePrecios(CON_UNO, "trabajo"))).toBe(
        false,
      );
    });

    it("sin grupos, no", () => {
      expect(hayPrecioDelBufete([])).toBe(false);
    });
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

/**
 * Los textos de este módulo que alguna de las dos pantallas dibuja.
 *
 * Están juntos para poder recorrerlos: una regla de vocabulario que se afirma
 * sobre una constante a la vez deja afuera la próxima que alguien agregue.
 */
const TEXTOS_A_LA_VISTA: readonly string[] = [
  AYUDA_DEL_PRECIO_PROPIO,
  ROTULO_DE_PROCEDENCIA,
  TITULO_DE_PROCEDENCIA,
  ...NOTA_DE_PROCEDENCIA,
  MARCA_DE_EDITADO,
  LEYENDA_DE_LA_MARCA,
  MARCA_DE_EDITADO_LEIDA,
  SERVICIO_SIN_NOMBRE,
];

describe("la marca es la misma en las dos pantallas", () => {
  /**
   * **Se marca la excepción y nunca la norma**, y ésta es la prueba de esa
   * polaridad.
   *
   * Hasta esta corrección la pantalla de precios escribía «sugerido» al lado
   * del renglón que el bufete **no** había editado, y la vista expandida de la
   * cotización marcaba con un asterisco el que **sí**. Dos convenciones para la
   * misma pregunta, y con el signo al revés. La que queda es la segunda, por la
   * frase del usuario: «los preestablecidos son eso, preestablecidos: son la
   * norma hasta que se editen, no son una subcategoría». Una palabra encima del
   * valor por defecto convierte la norma en un estado menor.
   */
  it("es un asterisco, con su nombre leído y su leyenda", () => {
    expect(MARCA_DE_EDITADO).toBe("*");
    expect(MARCA_DE_EDITADO_LEIDA.toLowerCase()).toContain("editado");
    expect(MARCA_DE_EDITADO_LEIDA.toLowerCase()).toContain("bufete");
    expect(LEYENDA_DE_LA_MARCA.toLowerCase()).toContain("editó");
    expect(LEYENDA_DE_LA_MARCA.toLowerCase()).toContain("preestablecidos");
  });

  it("la leyenda sirve en las dos pantallas y no nombra ninguna de las dos", () => {
    // El mismo literal lo dibujan `/catalogos/precios` y la vista expandida de
    // la cotización. Si nombrara la línea de una cotización, la pantalla de
    // precios estaría explicando su marca con algo que ahí no existe, y la
    // salida sería un segundo literal: o sea, volver a tener dos.
    const plano = LEYENDA_DE_LA_MARCA.toLowerCase();

    for (const palabra of ["línea", "cotización", "fila", "tabla"]) {
      expect(
        plano.includes(palabra),
        `la leyenda dice «${palabra}»: es un texto de las dos pantallas y` +
          " nombrar la mecánica de una lo vuelve falso en la otra",
      ).toBe(false);
    }
  });

  it("la palabra «sugerido» no está en el vocabulario de ninguna de las dos", () => {
    // La misma forma que la prueba que T-2 bis dejó sobre el flujo de la
    // cotización, ahora sobre el módulo que alimenta a las dos pantallas.
    //
    // Lo prohibido es **la palabra como marca**: el participio con el que se
    // rotulaba el valor por defecto. El verbo no: «el sistema sabe cuánto
    // cuesta y te lo sugiere» es la frase con la que el usuario describió lo
    // que la aplicación hace, y vive en la nota de procedencia de la tabla del
    // arancel, que es el lugar donde alguien fue a preguntar.
    for (const texto of TEXTOS_A_LA_VISTA) {
      expect(
        texto.toLowerCase().includes("sugerid"),
        `«${texto}» dice «sugerido». Esa palabra encima del valor por` +
          " defecto lo convierte en una subcategoría, que es justo lo que el" +
          " usuario corrigió: son la norma hasta que se editen",
      ).toBe(false);
    }
  });

  it("el origen del precio tampoco la dice", () => {
    // El `origen` no se dibuja, pero es el vocabulario con el que se piensa la
    // pantalla: dejarlo en «sugerido» es dejar puesta la idea de la que salió
    // la palabra.
    const precios = [
      precioALaVista(renglon({ monto: 40000 })),
      precioALaVista(renglon({ monto: null, montoOficial: 15000 })),
      precioALaVista(renglon({ clase: "rubro", montoOficial: null })),
    ];

    for (const precio of precios) {
      expect(precio.origen).not.toContain("sugerid");
    }
  });
});

describe("los textos de la pantalla de precios", () => {
  it("ninguno de sus textos mide el precio del bufete contra nada", () => {
    // El criterio de aceptación 4 del lado de las palabras. En la pantalla
    // de precios no hay comparación: ni «mínimo», ni «oficial», ni el
    // acuerdo nombrado encima de una decisión que ya tomó el abogado.
    //
    // La leyenda de la marca entra a la lista: es texto nuevo de esta pantalla
    // y dice de cuál de dos orígenes salió una cifra, que es un hecho. En
    // cuanto dijera cuál de las dos es mayor sería la vara de vuelta.
    for (const texto of [
      AYUDA_DEL_PRECIO_PROPIO,
      LEYENDA_DE_LA_MARCA,
      MARCA_DE_EDITADO_LEIDA,
    ]) {
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
