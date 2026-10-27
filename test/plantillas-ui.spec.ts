/**
 * La lógica de la pantalla de módulos (T-2 de
 * `odd/tasks/plantillas-de-modulo.md`), probada sin navegador.
 *
 * Es la mitad de abajo del reparto que este proyecto usa en todas sus
 * pantallas: lo que se puede escribir como función se prueba acá, en el mismo
 * corredor que la API; lo que **solo** se puede ver dibujado vive en
 * `e2e/plantillas.spec.ts`.
 *
 * ## Qué protege, y no es que el código corra
 *
 * Protege la disciplina que la pantalla de precios estableció y que esta
 * hereda, con pruebas que se ponen rojas si alguien la deshace:
 *
 *  1. **Un valor por campo, nunca dos.** `TextoALaVista` no tiene dónde quepa
 *    el preestablecido, y hay una prueba hostil que recorre los valores del
 *    objeto para que agregarlo se vea.
 *  2. **La marca va sobre la excepción.** El `origen` es `bufete` cuando hay
 *    texto propio y `preestablecido` cuando no, y nunca al revés: «los
 *    preestablecidos son la norma hasta que se editen, no son una
 *    subcategoría».
 *  3. **Vaciar el campo manda un nulo.** Es la única forma de volver atrás, y
 *    la normalización de la pantalla tiene que coincidir con la del servidor.
 *  4. **Las palabras.** Que ninguna de ellas juzgue el texto del abogado, y
 *    que la pantalla diga —una vez— que la descripción es lo que lee el
 *    asistente, que es la razón de ser de la tajada.
 */
import { describe, expect, it } from "vitest";

import type { PlantillaDeModulo } from "../worker/contract";
import { MARCA_DE_EDITADO as MARCA_DE_PRECIOS } from "../src/pantallas/catalogos/precios";
import {
  AVISO_SIN_PLANTILLAS,
  AYUDA_DEL_VUELTA_ATRAS,
  ETIQUETA_DE_BAJA,
  EXPLICACION_DE_LA_PANTALLA,
  LEYENDA_DE_LA_MARCA,
  MARCA_DE_EDITADO,
  MARCA_EDITADA_LEIDA,
  ROTULO_DEL_ROTULO,
  ROTULO_DE_LA_DESCRIPCION,
  TITULO_DE_LA_PANTALLA,
  anclaDeLaPlantilla,
  borradorDe,
  camposQueQuedarianVacios,
  datosParaGuardar,
  descripcionALaVista,
  hayCambio,
  hayEditadas,
  rotuloALaVista,
  sePuedeGuardar,
  sinBorrador,
  type BorradorDePlantilla,
} from "../src/pantallas/catalogos/plantillas";

const ALCANCE_ID = "9f2c4a10-7b31-4d6e-8a52-0c1e5b7d9a02";

const OFICIAL = "Alcance";
const OFICIAL_DESC = "Qué trabajo asume el bufete: las gestiones concretas.";

function plantilla(parcial: Partial<PlantillaDeModulo> = {}): PlantillaDeModulo {
  const base: PlantillaDeModulo = {
    id: ALCANCE_ID,
    clave: "alcance",
    orden: 2,
    rotuloOficial: OFICIAL,
    descripcionOficial: OFICIAL_DESC,
    rotulo: null,
    descripcion: null,
    rotuloVigente: OFICIAL,
    descripcionVigente: OFICIAL_DESC,
    activo: true,
    ...parcial,
  };

  /*
   * El vigente se recalcula a partir de lo que el caso pidió, para que una
   * prueba no pueda construir una fila incoherente —texto propio con un
   * vigente que diga el preset— y pasar por accidente. En producción el
   * vigente lo resuelve el servidor; acá se imita ese invariante.
   */
  return {
    ...base,
    rotuloVigente: base.rotulo ?? base.rotuloOficial ?? "",
    descripcionVigente: base.descripcion ?? base.descripcionOficial ?? "",
  };
}

function borrador(parcial: Partial<BorradorDePlantilla> = {}): BorradorDePlantilla {
  return { rotulo: OFICIAL, descripcion: OFICIAL_DESC, ...parcial };
}

/* ==========================================================================
   Un valor por campo, nunca dos
   ========================================================================== */

describe("el texto a la vista es uno", () => {
  it("sin texto propio, se ve el preestablecido y la marca no corresponde", () => {
    const vista = rotuloALaVista(plantilla());

    expect(vista).toEqual({ valor: OFICIAL, origen: "preestablecido" });
  });

  it("con texto propio, se ve el propio y la marca corresponde", () => {
    const vista = rotuloALaVista(plantilla({ rotulo: "Qué vamos a hacer" }));

    expect(vista).toEqual({ valor: "Qué vamos a hacer", origen: "bufete" });
  });

  it("la descripción se resuelve igual que el rótulo, y aparte", () => {
    const solo = plantilla({ descripcion: "Lo nuestro" });

    expect(descripcionALaVista(solo).origen).toBe("bufete");
    // El rótulo de la misma fila sigue siendo el preestablecido: son dos
    // decisiones independientes, igual que los dos `CHECK` de `0016`.
    expect(rotuloALaVista(solo).origen).toBe("preestablecido");
  });

  /**
   * **La prueba hostil.** Recorre los valores del objeto y exige que el
   * preestablecido no esté en ninguno. Una «mejora» que agregara un campo con
   * el texto original —con cualquier nombre— se pone roja acá antes de llegar
   * al navegador.
   *
   * Es la misma forma que `test/precios-ui.spec.ts` usa para que no vuelva el
   * monto del acuerdo a `PrecioALaVista`.
   */
  it("el objeto de la vista no lleva el preestablecido en ningún campo", () => {
    const editada = plantilla({
      rotulo: "Qué vamos a hacer",
      descripcion: "Lo nuestro",
    });

    for (const vista of [rotuloALaVista(editada), descripcionALaVista(editada)]) {
      const valores = Object.values(vista).map(String);

      expect(
        valores,
        "la vista trae el preestablecido además del texto propio: volvió la" +
          " comparación al lado que el usuario pidió sacar de estas pantallas",
      ).not.toContain(OFICIAL);
      expect(valores).not.toContain(OFICIAL_DESC);
    }
  });

  /**
   * Un texto propio **igual** al preestablecido sigue siendo del bufete.
   *
   * Es la decisión que importa y la que una comparación de cadenas rompería:
   * adoptar el preestablecido tal cual es una decisión del bufete, igual que
   * un precio de cero es «esto no lo cobramos» y no una falta de precio.
   */
  it("un texto propio idéntico al preestablecido es del bufete", () => {
    expect(rotuloALaVista(plantilla({ rotulo: OFICIAL })).origen).toBe("bufete");
  });

  /** La marca no se dibuja si no hay ninguna fila marcada. */
  it("la leyenda solo corresponde cuando alguna plantilla está editada", () => {
    expect(hayEditadas([plantilla(), plantilla({ id: "otra" })])).toBe(false);
    expect(hayEditadas([plantilla(), plantilla({ descripcion: "X" })])).toBe(
      true,
    );
    expect(hayEditadas([])).toBe(false);
  });
});

/* ==========================================================================
   La marca es una sola para las tres pantallas
   ========================================================================== */

describe("la marca", () => {
  /**
   * El literal **se importa** y no se copia. Dos asteriscos idénticos
   * declarados en dos archivos son el par que se desincroniza el día que
   * alguien cambie uno, y la marca tiene que leerse como la misma cosa en las
   * tres pantallas que la dibujan.
   */
  it("es el mismo literal que dibuja la pantalla de precios", () => {
    expect(MARCA_DE_EDITADO).toBe(MARCA_DE_PRECIOS);
    expect(MARCA_DE_EDITADO).toBe("*");
  });

  /**
   * El nombre accesible **no** se reusa, y eso es lo contrario de un descuido:
   * el de la pantalla de precios dice «precio editado por el bufete», y acá lo
   * editado no es un precio. Un nombre accesible que nombra la cosa
   * equivocada es peor que no tener ninguno.
   */
  it("su nombre accesible no habla de un precio", () => {
    expect(MARCA_EDITADA_LEIDA).not.toContain("precio");
    expect(MARCA_EDITADA_LEIDA.length).toBeGreaterThan(0);
  });
});

/* ==========================================================================
   Vaciar el campo manda un nulo
   ========================================================================== */

describe("lo que se manda al guardar", () => {
  it("un texto escrito viaja recortado", () => {
    expect(
      datosParaGuardar(
        plantilla(),
        { rotulo: "  Qué vamos a hacer ", descripcion: " Lo nuestro " },
        true,
      ),
    ).toEqual({
      rotulo: "Qué vamos a hacer",
      descripcion: "Lo nuestro",
      activo: true,
    });
  });

  /**
   * **El defecto que se vio manejando la pantalla, fijado como prueba.**
   *
   * Cada módulo tiene dos campos y el `PUT` manda el juego completo, así que
   * editar el rótulo manda también la descripción. Si lo tecleado que coincide
   * con el preestablecido viajara como texto propio, cambiar el rótulo
   * marcaría **los dos** campos como editados: medido en el navegador, dos
   * marcas en vez de una. Y la copia dejaría de seguir al preestablecido el
   * día que una migración lo mejore.
   */
  it("el campo que nadie tocó sigue usando el preestablecido", () => {
    const datos = datosParaGuardar(
      plantilla(),
      { rotulo: "Qué vamos a hacer", descripcion: OFICIAL_DESC },
      true,
    );

    expect(datos.rotulo).toBe("Qué vamos a hacer");
    expect(
      datos.descripcion,
      "la descripción que nadie tocó viajó como texto del bufete: eso pone" +
        " una marca sobre un campo que nadie editó y congela una copia del" +
        " preestablecido",
    ).toBeNull();
  });

  /**
   * Y la regla **no** se aplica sobre un campo que el bufete ya editó:
   * reescribir ahí el mismo texto es un no-op que `hayCambio` apaga, y
   * convertirlo en nulo sería devolverlo al preestablecido sin que nadie lo
   * haya pedido.
   */
  it("reescribir lo propio sobre un campo ya editado no lo devuelve al preset", () => {
    const editada = plantilla({ rotulo: "Lo nuestro" });
    const datos = datosParaGuardar(
      editada,
      { rotulo: "Lo nuestro", descripcion: OFICIAL_DESC },
      true,
    );

    expect(datos.rotulo).toBe("Lo nuestro");
  });

  /**
   * **La regla que carga con la tajada.** Las cuatro formas de dejar un campo
   * vacío viajan como `null`, que es «uso el preestablecido». Es la misma
   * normalización que `worker/plantillas/dominio.ts` hace del otro lado, y las
   * dos existen por el reparto de siempre: ésta es la que deja que lo que se
   * manda diga lo que la pantalla decidió, y la de abajo es la que sobrevive a
   * un cliente que no sea esta pantalla.
   */
  it.each([
    ["la cadena vacía", ""],
    ["espacios", "   "],
    ["un salto de línea", "\n"],
    ["tabulaciones", "\t\t"],
  ])("%s viaja como nulo en los dos campos", (_forma, texto) => {
    expect(
      datosParaGuardar(plantilla(), { rotulo: texto, descripcion: texto }, true),
    ).toEqual({ rotulo: null, descripcion: null, activo: true });
  });

  it("la vigencia viaja tal como se la pasa", () => {
    expect(datosParaGuardar(plantilla(), borrador(), false).activo).toBe(false);
  });
});

/* ==========================================================================
   Cuándo el botón se puede apretar
   ========================================================================== */

describe("si hay algo que guardar", () => {
  /**
   * **Reenviar el preestablecido tal cual no es un cambio**, y acá esta
   * pantalla se separa de la de precios a propósito: allá hay un solo campo
   * por fila, así que escribir el valor que se ve solo puede ser deliberado;
   * acá hay dos, y el `PUT` manda los dos. El argumento completo está en
   * `propioParaGuardar`.
   */
  it("reenviar el preestablecido tal cual no es un cambio", () => {
    expect(hayCambio(plantilla(), borrador())).toBe(false);
  });

  /** Escribir algo distinto sí lo es. */
  it("escribir un texto distinto del preestablecido es un cambio", () => {
    expect(hayCambio(plantilla(), borrador({ rotulo: "Lo nuestro" }))).toBe(
      true,
    );
  });

  /** Y volver a guardar lo mismo que ya está guardado, no. */
  it("reenviar lo que ya está guardado no es un cambio", () => {
    const editada = plantilla({ rotulo: "Lo nuestro", descripcion: "Y esto" });

    expect(
      hayCambio(editada, { rotulo: "Lo nuestro", descripcion: "Y esto" }),
    ).toBe(false);
  });

  /**
   * Borrar lo que no hay no es un cambio: sería un `PUT` que no cambia nada y
   * una entrada de bitácora de algo que no pasó.
   */
  it("vaciar un campo que ya estaba en el preestablecido no es un cambio", () => {
    expect(hayCambio(plantilla(), { rotulo: "", descripcion: "" })).toBe(false);
  });

  it("vaciar un campo que sí tenía texto propio es un cambio", () => {
    const editada = plantilla({ rotulo: "Lo nuestro" });

    expect(hayCambio(editada, { rotulo: "", descripcion: "" })).toBe(true);
  });

  /** Tocar uno solo de los dos campos alcanza. */
  it("cambiar solo la descripción es un cambio", () => {
    expect(
      hayCambio(plantilla({ rotulo: "R", descripcion: "D" }), {
        rotulo: "R",
        descripcion: "Otra",
      }),
    ).toBe(true);
  });

  /**
   * El botón se apaga cuando el cambio **no se puede guardar**: lo que haría
   * es un 409. El aviso de por qué lo da la pantalla aparte.
   */
  it("un vaciado sin preestablecido debajo no se puede guardar", () => {
    const sinPiso = plantilla({
      rotuloOficial: null,
      descripcionOficial: null,
      rotulo: "Garantías",
      descripcion: "Lo que garantizamos.",
    });

    expect(hayCambio(sinPiso, { rotulo: "Garantías", descripcion: "" })).toBe(
      true,
    );
    expect(
      sePuedeGuardar(sinPiso, { rotulo: "Garantías", descripcion: "" }),
    ).toBe(false);
  });

  it("sobre las seis sembradas, vaciar lo editado siempre se puede guardar", () => {
    expect(
      sePuedeGuardar(plantilla({ rotulo: "X" }), {
        rotulo: "",
        descripcion: OFICIAL_DESC,
      }),
    ).toBe(true);
  });
});

describe("qué campos quedarían sin texto", () => {
  const SIN_PISO = { rotuloOficial: null, descripcionOficial: null };

  it("con preestablecido debajo, ninguno", () => {
    expect(
      camposQueQuedarianVacios(plantilla(), { rotulo: "", descripcion: "" }),
    ).toEqual([]);
  });

  it("sin preestablecido, los nombra en orden alfabético", () => {
    const sinPiso = plantilla({ ...SIN_PISO, rotulo: "R", descripcion: "D" });

    expect(
      camposQueQuedarianVacios(sinPiso, { rotulo: "", descripcion: "" }),
    ).toEqual(["descripcion", "rotulo"]);
  });

  it("el preestablecido de un campo no habilita vaciar el otro", () => {
    const medioPiso = plantilla({
      rotuloOficial: OFICIAL,
      descripcionOficial: null,
      descripcion: "D",
    });

    expect(
      camposQueQuedarianVacios(medioPiso, { rotulo: "", descripcion: "" }),
    ).toEqual(["descripcion"]);
  });
});

/* ==========================================================================
   Los borradores
   ========================================================================== */

describe("el borrador de un módulo", () => {
  /**
   * Arranca con el **valor vigente** y no vacío, y es la mitad de la promesa:
   * el campo de un módulo sin texto propio muestra el preestablecido, así que
   * escribir encima parte de algo.
   */
  it("sin borrador puesto, arranca de lo que se ve", () => {
    expect(borradorDe({}, plantilla())).toEqual({
      rotulo: OFICIAL,
      descripcion: OFICIAL_DESC,
    });
  });

  it("con borrador puesto, gana el borrador", () => {
    const puesto = { [ALCANCE_ID]: { rotulo: "A medias", descripcion: "" } };

    expect(borradorDe(puesto, plantilla())).toEqual({
      rotulo: "A medias",
      descripcion: "",
    });
  });

  /**
   * Tirar el borrador después de guardar tiene consecuencia visible —hace
   * desaparecer el botón y deja a la vista lo que contestó el servidor— y por
   * eso es una función con prueba y no un `delete` adentro del componente.
   */
  it("se tira el de uno sin tocar los de los otros", () => {
    const antes = {
      a: { rotulo: "A", descripcion: "a" },
      b: { rotulo: "B", descripcion: "b" },
    };

    const despues = sinBorrador(antes, "a");

    expect(despues).toEqual({ b: { rotulo: "B", descripcion: "b" } });
    // El original no se mutó: es estado de React.
    expect(antes).toHaveProperty("a");
  });

  it("tirar uno que no está no rompe nada", () => {
    expect(sinBorrador({ a: { rotulo: "A", descripcion: "a" } }, "z")).toEqual({
      a: { rotulo: "A", descripcion: "a" },
    });
  });
});

/* ==========================================================================
   Las palabras
   ========================================================================== */

describe("lo que la pantalla dice", () => {
  /**
   * **La razón de ser de la tajada, dicha una vez.** Sin esto, la descripción
   * se lee como una nota interna y se escribe como tal; con esto, quien la
   * escribe sabe para quién.
   */
  it("la explicación dice que la descripción es lo que lee el asistente", () => {
    expect(EXPLICACION_DE_LA_PANTALLA.toLowerCase()).toContain("asistente");
    expect(EXPLICACION_DE_LA_PANTALLA.toLowerCase()).toContain("descripción");
  });

  /** Y dice que ya vienen configurados: un campo lleno no es un olvido. */
  it("la explicación dice que los seis ya vienen configurados", () => {
    expect(EXPLICACION_DE_LA_PANTALLA.toLowerCase()).toContain("configurados");
  });

  /** La forma de volver atrás, dicha una vez y arriba. */
  it("se explica que vaciar un campo vuelve al preestablecido", () => {
    const ayuda = AYUDA_DEL_VUELTA_ATRAS.toLowerCase();

    expect(ayuda).toContain("vaciar");
    expect(ayuda).toContain("preestablecido");
  });

  /**
   * La leyenda explica el asterisco **sin juzgar**: dice de dónde salió el
   * texto, no si está bien. Y nombra las dos palabras del usuario.
   */
  it("la leyenda dice qué significa la marca, y nada más", () => {
    const leyenda = LEYENDA_DE_LA_MARCA.toLowerCase();

    expect(leyenda).toContain("editó");
    expect(leyenda).toContain("preestablecido");
  });

  /**
   * **Ninguna palabra mide el texto del abogado.** Es la misma prueba que
   * `precios-ui.spec.ts` hace sobre el vocabulario de aquella pantalla, con la
   * lista adaptada: acá no hay acuerdo ni mínimo que nombrar, y lo que no
   * puede aparecer es cualquier cosa que sugiera que el texto propio está bajo
   * revisión.
   *
   * «sugerido» entra en la lista por la corrección de polaridad que el usuario
   * pidió: los preestablecidos «son la norma hasta que se editen, no son una
   * subcategoría», y la palabra se fue del vocabulario de estas pantallas.
   */
  it("ninguna palabra juzga lo que el bufete escribió", () => {
    const todo = [
      TITULO_DE_LA_PANTALLA,
      EXPLICACION_DE_LA_PANTALLA,
      LEYENDA_DE_LA_MARCA,
      AYUDA_DEL_VUELTA_ATRAS,
      ROTULO_DEL_ROTULO,
      ROTULO_DE_LA_DESCRIPCION,
      MARCA_EDITADA_LEIDA,
      ETIQUETA_DE_BAJA,
      AVISO_SIN_PLANTILLAS,
    ]
      .join(" ")
      .toLowerCase();

    for (const palabra of [
      "sugerid",
      "recomendad",
      "correcto",
      "incorrecto",
      "revisar",
      "advertencia",
      "error en",
    ]) {
      expect(
        todo.includes(palabra),
        `la pantalla dice «${palabra}»: eso pone al sistema a opinar sobre un` +
          " texto que escribió el abogado, que es lo contrario de lo que esta" +
          " pantalla hace",
      ).toBe(false);
    }
  });

  /**
   * Los rótulos de los campos **dicen lo que el campo es**, sin párrafo que se
   * disculpe por el formulario. Es la regla de la casa que
   * `src/pantallas/clientes/FormularioDeCliente.tsx` dejó escrita.
   */
  it("los rótulos de los campos son cortos y no explican el formulario", () => {
    expect(ROTULO_DEL_ROTULO).toBe("Rótulo");
    expect(ROTULO_DE_LA_DESCRIPCION).toBe("Descripción");
  });

  /** El distintivo de baja es el mismo literal que usan los catálogos de T-6. */
  it("lo dado de baja se dice igual que en los demás catálogos", () => {
    expect(ETIQUETA_DE_BAJA).toBe("De baja");
  });
});

/* ==========================================================================
   El ancla
   ========================================================================== */

describe("el ancla de cada módulo", () => {
  /**
   * Una función y no una plantilla de texto repetida en cinco atributos: cinco
   * literales son cinco lugares donde el prefijo puede discrepar y el
   * `aria-labelledby` apunte a nada.
   */
  it("lleva prefijo, para no chocar con otro `id` de la página", () => {
    expect(anclaDeLaPlantilla("alcance")).toBe("modulo-alcance");
  });

  it("dos claves distintas dan dos anclas distintas", () => {
    expect(anclaDeLaPlantilla("alcance")).not.toBe(
      anclaDeLaPlantilla("exclusiones"),
    );
  });
});
