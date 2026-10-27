/**
 * Las reglas puras de una plantilla de módulo (T-2 de
 * `odd/tasks/plantillas-de-modulo.md`): qué se puede escribir, qué no, y qué
 * significa un campo vacío.
 *
 * Son puras —ni D1 ni HTTP— y por eso se prueban acá, aparte de la API. Lo que
 * este archivo protege no es que el código corra: es que **«vacío significa
 * NULL» esté escrito en un solo lugar y se vea**, porque esa equivalencia es
 * la que convierte «volver al preestablecido» en una operación que existe.
 *
 * Cuatro familias, y las cuatro hacen falta:
 *
 *  - **El vacío y sus disfraces.** Ausente, nulo, cadena vacía y solo espacios
 *    tienen que dar el mismo `null`. El caso que importa es el de los espacios:
 *    un `"   "` que entrara como texto pasaría el `CHECK` de la base —tres
 *    espacios no son nulos— y la hoja de la cotización dibujaría un encabezado
 *    en blanco. Ningún disparador puede atrapar eso.
 *  - **Rechazos.** El cuerpo que pretende escribir la `clave` o el preset. No
 *    alcanza con que la base lo impida: una API que contesta 200 y descarta el
 *    campo en silencio le enseña a la pantalla que la escritura funcionó.
 *  - **El vaciado sin piso debajo.** Que `camposSinPreset` encuentre el caso
 *    que los dos `CHECK` de `0016` niegan, para que salga como una negativa y
 *    no como un 500.
 *  - **La resolución del vigente.** Que sea `COALESCE` y nada más: elige cuál
 *    de los dos existe, nunca cuál es mejor.
 */
import { describe, expect, it } from "vitest";

import {
  CAMPOS_INMUTABLES,
  camposSinPreset,
  revisarPlantilla,
  valorVigente,
  type DatosDePlantilla,
} from "../worker/plantillas/dominio";

/** Un cuerpo completo y válido, para no repetir tres campos en cada caso. */
function cuerpo(parcial: Record<string, unknown> = {}): Record<string, unknown> {
  return { rotulo: "Alcance propio", descripcion: "Lo nuestro", ...parcial };
}

function datos(parcial: Partial<DatosDePlantilla> = {}): DatosDePlantilla {
  return { rotulo: "R", descripcion: "D", activo: true, ...parcial };
}

/* ==========================================================================
   «Vacío significa NULL», que es la tajada entera
   ========================================================================== */

describe("un campo vacío significa «uso el preestablecido»", () => {
  /**
   * Las cuatro formas de decir «vacío» que un cliente puede mandar. Las cuatro
   * tienen que dar el mismo `null`, porque `null` es lo único que la base
   * entiende como «volvé al preset».
   */
  const VACIOS: [string, unknown][] = [
    ["la cadena vacía", ""],
    ["solo espacios", "   "],
    ["tabulaciones y saltos de línea", "\t\n  \n"],
    ["el nulo explícito", null],
  ];

  it.each(VACIOS)("%s deja el rótulo en NULL", (_forma, valor) => {
    const revision = revisarPlantilla(cuerpo({ rotulo: valor }));

    expect(revision.estado).toBe("ok");
    if (revision.estado !== "ok") return;
    expect(revision.datos.rotulo).toBeNull();
  });

  it.each(VACIOS)("%s deja la descripción en NULL", (_forma, valor) => {
    const revision = revisarPlantilla(cuerpo({ descripcion: valor }));

    expect(revision.estado).toBe("ok");
    if (revision.estado !== "ok") return;
    expect(revision.datos.descripcion).toBeNull();
  });

  /**
   * El campo que no viene es un campo vacío, y no un caso aparte.
   *
   * `PUT` manda el juego completo de lo editable —la decisión de T-5 que esta
   * API repite en todas sus rutas— así que una ausencia es una decisión. Si
   * fuera «no tocar», habría dos formas de volver al preset y la pantalla
   * tendría que elegir una.
   */
  it("un campo ausente es un campo vacío", () => {
    const revision = revisarPlantilla({ activo: true });

    expect(revision.estado).toBe("ok");
    if (revision.estado !== "ok") return;
    expect(revision.datos).toEqual({
      rotulo: null,
      descripcion: null,
      activo: true,
    });
  });

  /**
   * El recorte, que es la otra mitad de la regla y la que no se ve.
   *
   * Un rótulo con espacios alrededor se guarda recortado: si entrara tal cual,
   * dos plantillas que la persona escribió igual quedarían distintas en la
   * base y el `detalle` de la bitácora diría «editó « Alcance »».
   */
  it("lo que no está vacío se guarda recortado", () => {
    const revision = revisarPlantilla(
      cuerpo({ rotulo: "  Nuestro alcance  ", descripcion: "\n Qué hacemos " }),
    );

    expect(revision.estado).toBe("ok");
    if (revision.estado !== "ok") return;
    expect(revision.datos.rotulo).toBe("Nuestro alcance");
    expect(revision.datos.descripcion).toBe("Qué hacemos");
  });

  /**
   * Un texto con espacios **adentro** no se toca.
   *
   * El control de hostilidad del recorte: si alguien lo escribiera como un
   * `replace(/\s+/g, "")` o un `replace(/\s+/g, " ")`, los casos de arriba
   * pasarían igual y una descripción de dos párrafos perdería su forma.
   */
  it("los espacios de adentro, y los saltos de línea, sobreviven", () => {
    const largo = "Qué trabajo asume el bufete.\n\nCon plazos cuando se pueda.";
    const revision = revisarPlantilla(cuerpo({ descripcion: largo }));

    expect(revision.estado).toBe("ok");
    if (revision.estado !== "ok") return;
    expect(revision.datos.descripcion).toBe(largo);
  });
});

/* ==========================================================================
   La vigencia
   ========================================================================== */

describe("la marca de vigencia", () => {
  it("ausente significa vigente", () => {
    const revision = revisarPlantilla(cuerpo());

    expect(revision.estado).toBe("ok");
    if (revision.estado !== "ok") return;
    expect(revision.datos.activo).toBe(true);
  });

  it("un `false` da de baja", () => {
    const revision = revisarPlantilla(cuerpo({ activo: false }));

    expect(revision.estado).toBe("ok");
    if (revision.estado !== "ok") return;
    expect(revision.datos.activo).toBe(false);
  });

  /**
   * Un `activo` que no es booleano es una falla y no un `Boolean(valor)`.
   *
   * Convertir en silencio es cómo una plantilla se da de baja sola: un
   * `"false"` como texto es `true` para `Boolean`, y un `0` es `false`.
   */
  it.each([["texto", "false"], ["número", 0], ["arreglo", []]])(
    "un `activo` que es un %s se rechaza",
    (_forma, valor) => {
      const revision = revisarPlantilla(cuerpo({ activo: valor }));

      expect(revision.estado).toBe("invalido");
      if (revision.estado !== "invalido") return;
      expect(revision.fallas).toEqual([
        { campo: "activo", motivo: "tipo_invalido" },
      ]);
    },
  );
});

/* ==========================================================================
   Lo que no se escribe nunca
   ========================================================================== */

describe("la clave y el preestablecido no se escriben por esta ruta", () => {
  /**
   * La lista, exacta y no por contención.
   *
   * Exacta a propósito, igual que `CAMPOS_CITADOS` en el arancel: agregar una
   * columna congelada por disparador obliga a decidir si la API también la
   * defiende, y una comparación por contención dejaría pasar esa decisión sin
   * tomarla.
   */
  it("son exactamente tres, y en orden alfabético", () => {
    expect([...CAMPOS_INMUTABLES]).toEqual([
      "clave",
      "descripcionOficial",
      "rotuloOficial",
    ]);
  });

  it.each([...CAMPOS_INMUTABLES])("un cuerpo con `%s` se rechaza", (campo) => {
    const revision = revisarPlantilla(cuerpo({ [campo]: "lo que sea" }));

    expect(revision.estado).toBe("inmutable");
    if (revision.estado !== "inmutable") return;
    expect(revision.campos).toEqual([campo]);
  });

  /**
   * El nulo es igual de inadmisible que un valor, y acá es **el peor de los
   * dos**: borrar un `rotulo_oficial` es borrar el piso al que se vuelve, que
   * es el agujero que `0016` describe como «el peor que esta tarea podía
   * dejar». Se mira si la clave vino, no si trae algo que valga.
   */
  it.each([...CAMPOS_INMUTABLES])(
    "un cuerpo con `%s` en nulo también se rechaza",
    (campo) => {
      const revision = revisarPlantilla(cuerpo({ [campo]: null }));

      expect(revision.estado).toBe("inmutable");
      if (revision.estado !== "inmutable") return;
      expect(revision.campos).toEqual([campo]);
    },
  );

  /** Varios a la vez salen en orden alfabético, no en el del JSON. */
  it("varios campos inmutables salen en orden determinista", () => {
    const revision = revisarPlantilla({
      rotuloOficial: "A",
      clave: "otra",
      descripcionOficial: "B",
    });

    expect(revision.estado).toBe("inmutable");
    if (revision.estado !== "inmutable") return;
    expect(revision.campos).toEqual([
      "clave",
      "descripcionOficial",
      "rotuloOficial",
    ]);
  });

  /**
   * **Lo inmutable manda sobre lo inválido.**
   *
   * Es la misma precedencia que el arancel eligió —«la cita manda sobre el
   * importe»— y por el mismo motivo: si contestara por el `activo`, quien lo
   * mandó arreglaría ese campo y volvería a intentar creyendo que así entra el
   * otro.
   */
  it("un cuerpo con un campo inmutable y otro inválido contesta por el inmutable", () => {
    const revision = revisarPlantilla({
      rotuloOficial: "A",
      activo: "no soy booleano",
    });

    expect(revision.estado).toBe("inmutable");
  });

  /**
   * `id` y `orden` **no** están en la lista, y las dos ausencias tienen motivo
   * distinto: `id` viaja en la dirección y adentro del cuerpo es ruido de un
   * cliente que mandó la fila entera; `orden` es editable por diseño —`0016`
   * no le puso disparador, justamente para que reordenar sea posible— y lo que
   * pasa es que esta tarea todavía no abre esa operación.
   */
  it("un cuerpo con `id` o `orden` no se rechaza por inmutable", () => {
    const conId = revisarPlantilla(cuerpo({ id: "otro-uuid" }));
    const conOrden = revisarPlantilla(cuerpo({ orden: 3 }));

    expect(conId.estado).toBe("ok");
    expect(conOrden.estado).toBe("ok");
  });
});

/* ==========================================================================
   Lo que no es texto
   ========================================================================== */

describe("lo que no es texto no se convierte en silencio", () => {
  it.each([
    ["número", 7],
    ["booleano", true],
    ["objeto", { toString: "nada" }],
    ["arreglo", ["Alcance"]],
  ])("un rótulo que es un %s se rechaza", (_forma, valor) => {
    const revision = revisarPlantilla(cuerpo({ rotulo: valor }));

    expect(revision.estado).toBe("invalido");
    if (revision.estado !== "invalido") return;
    expect(revision.fallas).toContainEqual({
      campo: "rotulo",
      motivo: "tipo_invalido",
    });
  });

  it("una descripción que no es texto se rechaza, y nombra su campo", () => {
    const revision = revisarPlantilla(cuerpo({ descripcion: 42 }));

    expect(revision.estado).toBe("invalido");
    if (revision.estado !== "invalido") return;
    expect(revision.fallas).toEqual([
      { campo: "descripcion", motivo: "tipo_invalido" },
    ]);
  });

  it("los dos campos mal mandados producen las dos fallas", () => {
    const revision = revisarPlantilla({ rotulo: 1, descripcion: 2 });

    expect(revision.estado).toBe("invalido");
    if (revision.estado !== "invalido") return;
    expect(revision.fallas).toHaveLength(2);
  });

  it.each([
    ["un arreglo", []],
    ["un número", 3],
    ["una cadena", "Alcance"],
    ["el nulo", null],
  ])("un cuerpo que es %s se rechaza entero", (_forma, valor) => {
    const revision = revisarPlantilla(valor);

    expect(revision.estado).toBe("invalido");
  });
});

/* ==========================================================================
   El vaciado que no tiene piso debajo
   ========================================================================== */

describe("vaciar un campo que no tiene preestablecido", () => {
  const CON_PRESET = { rotuloOficial: "Alcance", descripcionOficial: "Qué…" };
  const SIN_PRESET = { rotuloOficial: null, descripcionOficial: null };

  /**
   * El caso de las seis filas sembradas: tienen preset en las dos columnas,
   * así que vaciarlas es siempre posible. Es el control de que esta guarda no
   * rechaza lo que la tajada vino a permitir.
   */
  it("con preestablecido debajo, vaciar los dos campos se permite", () => {
    expect(
      camposSinPreset(CON_PRESET, datos({ rotulo: null, descripcion: null })),
    ).toEqual([]);
  });

  it("sin preestablecido, vaciar la descripción se rechaza", () => {
    expect(
      camposSinPreset(SIN_PRESET, datos({ rotulo: "R", descripcion: null })),
    ).toEqual(["descripcion"]);
  });

  it("sin preestablecido, vaciar el rótulo se rechaza", () => {
    expect(
      camposSinPreset(SIN_PRESET, datos({ rotulo: null, descripcion: "D" })),
    ).toEqual(["rotulo"]);
  });

  /** Los dos a la vez, en orden alfabético y no en el de las columnas. */
  it("los dos vacíos sin preestablecido salen los dos, en orden", () => {
    expect(
      camposSinPreset(SIN_PRESET, datos({ rotulo: null, descripcion: null })),
    ).toEqual(["descripcion", "rotulo"]);
  });

  /**
   * Escribir un texto propio sobre una plantilla sin preset **sí** se permite,
   * y ahí está la mitad que importa: lo que se prohíbe es dejarla sin valor
   * vigente, no editarla.
   */
  it("escribir texto propio sin preestablecido debajo se permite", () => {
    expect(
      camposSinPreset(SIN_PRESET, datos({ rotulo: "R", descripcion: "D" })),
    ).toEqual([]);
  });

  /**
   * El preset de un lado no tapa la falta del otro. Es la prueba de que son
   * dos hechos y no uno, que es exactamente por lo que `0016` escribió dos
   * `CHECK` separados en vez de uno.
   */
  it("un preestablecido de rótulo no habilita vaciar la descripción", () => {
    expect(
      camposSinPreset(
        { rotuloOficial: "Alcance", descripcionOficial: null },
        datos({ rotulo: null, descripcion: null }),
      ),
    ).toEqual(["descripcion"]);
  });
});

/* ==========================================================================
   El valor vigente
   ========================================================================== */

describe("el valor vigente es un COALESCE y nada más", () => {
  it("con texto propio, gana el propio", () => {
    expect(valorVigente("Nuestro alcance", "Alcance")).toBe("Nuestro alcance");
  });

  it("sin texto propio, queda el preestablecido", () => {
    expect(valorVigente(null, "Alcance")).toBe("Alcance");
  });

  it("sin ninguno de los dos, no hay valor vigente", () => {
    expect(valorVigente(null, null)).toBeNull();
  });

  /**
   * **No hay operador de orden entre los dos**, y por eso una cadena vacía
   * propia no deja pasar el preset: si `valorVigente` usara `||` en vez de
   * `??`, un rótulo propio de cadena vacía devolvería el preestablecido y la
   * plantilla se vería sin editar aunque lo estuviera.
   *
   * No puede llegar un `""` desde la ruta —`revisarPlantilla` lo convierte en
   * nulo— pero sí desde un `UPDATE` a mano, y entonces la pantalla mentiría
   * sobre el origen. El `COALESCE` de la base se comporta igual: elige cuál de
   * los dos **existe**, no cuál es mejor.
   */
  it("una cadena vacía propia es un valor, no una ausencia", () => {
    expect(valorVigente("", "Alcance")).toBe("");
  });
});
