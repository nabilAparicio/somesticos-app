/**
 * La pantalla de módulos de una cotización (T-2 de
 * `odd/tasks/plantillas-de-modulo.md`), en el navegador.
 *
 * ## Lo que este archivo protege, y es la disciplina heredada de `Precios.tsx`
 *
 * **Ningún módulo dibuja dos textos por campo.** El preestablecido no aparece
 * al lado del texto propio: ni abajo, ni en un color, ni como un «antes
 * decía». Es la misma corrección del usuario que fijó la forma de la pantalla
 * de precios —«así no se siente que el sistema juzga tus precios, sino que el
 * sistema sabe cuánto cuesta y te lo sugiere»— aplicada a un rótulo y a una
 * descripción. Con las dos versiones a la vista, la pantalla sería una
 * auditoría de lo que el abogado escribió.
 *
 * Y se mide **estructuralmente**: se cuentan los controles de texto que cada
 * módulo renderiza y se busca el texto preestablecido en la página entera. La
 * diferencia es lo que esta prueba vale: una «mejora» que vuelva a poner el
 * original al lado —con cualquier rótulo, en cualquier elemento, con cualquier
 * clase— se pone roja. Una prueba que comparara contra una cadena como
 * «original» pasaría en verde con la columna de vuelta y otro encabezado.
 *
 * ## Las otras cuatro cosas que solo se ven acá
 *
 *  1. Que **editar un rótulo y vaciarlo devuelve el preestablecido**, que es
 *     el criterio de aceptación 2 de la tajada. La lógica pura ya está
 *     probada; lo que esto agrega es que los campos, el botón y la respuesta
 *     del servidor estén cableados entre sí.
 *  2. Que la marca sutil aparezca **solo sobre el campo que se editó**, y no
 *     sobre el otro. Es el defecto que se encontró manejando la pantalla: el
 *     `PUT` manda el juego completo, así que editar el rótulo mandaba también
 *     la descripción y la marcaba. Con una función no se ve; con la pantalla
 *     corriendo, sí.
 *  3. Que la leyenda del asterisco se lea **antes** del primer módulo, y solo
 *     cuando hay alguna marca.
 *  4. El criterio responsivo de §9 sobre el contenido nuevo, con un
 *     `<textarea>` de varios renglones adentro de cada bloque.
 *
 * **Las respuestas de la API van interceptadas**, por lo mismo que en
 * `catalogos.spec.ts` y `precios.spec.ts`: `vite dev` corre sin identidad de
 * Access, así que la API real contesta 403 y la pantalla se dibujaría como un
 * aviso de error. Medir el layout de un párrafo suelto sería medir nada.
 */
import { expect, test, type Page } from "@playwright/test";

import { medirDesborde, porQueSeSale } from "./desborde";

/* --- Los identificadores de la muestra ---------------------------------- */

const ALCANCE_ID = "9f2c4a10-7b31-4d6e-8a52-0c1e5b7d9a02";
const SUPUESTOS_ID = "9f2c4a10-7b31-4d6e-8a52-0c1e5b7d9a04";
const NOTA_ID = "9f2c4a10-7b31-4d6e-8a52-0c1e5b7d9a06";

/**
 * El rótulo preestablecido del alcance y el que el bufete escribe encima.
 *
 * Están elegidos distintos a propósito, porque si coincidieran no se podría
 * distinguir «la pantalla muestra el propio» de «la pantalla muestra el
 * preestablecido». Es la misma precaución que `precios.spec.ts` toma con los
 * dos montos de la visa de pensionado.
 */
const OFICIAL_DEL_ALCANCE = "Alcance";
const PROPIO_DEL_ALCANCE = "Qué vamos a hacer";

/** La descripción preestablecida de los supuestos, que es la larga. */
const OFICIAL_DE_SUPUESTOS =
  "De qué depende esta propuesta: documentación que el cliente debe aportar," +
  " hechos que se dan por ciertos, y plazos de terceros fuera del control del" +
  " bufete. Si un supuesto no se cumple, el alcance y el precio cambian.";

/**
 * La nota al cliente llega **ya editada** por el bufete, y su preestablecido
 * es una cadena que no puede aparecer en ninguna parte de la pantalla.
 *
 * Es el caso que persigue la prueba del criterio: una fila con texto propio y
 * un original distinto. Si el original se cuela en algún elemento, se ve.
 */
const OFICIAL_DE_LA_NOTA = "Nota al cliente";
const PROPIO_DE_LA_NOTA = "Para usted, en corto";
const OFICIAL_DESC_DE_LA_NOTA =
  "Un mensaje breve y directo al cliente, sin jerga, sobre por qué esta" +
  " propuesta responde a lo que pidió. No repite el alcance.";
const PROPIO_DESC_DE_LA_NOTA =
  "Por qué esta propuesta contesta lo que el cliente nos pidió.";

const PLANTILLAS = [
  {
    id: "9f2c4a10-7b31-4d6e-8a52-0c1e5b7d9a01",
    clave: "antecedentes",
    orden: 1,
    rotuloOficial: "Antecedentes",
    descripcionOficial:
      "Qué pasó antes de la consulta: los hechos que el cliente relató.",
    rotulo: null,
    descripcion: null,
    rotuloVigente: "Antecedentes",
    descripcionVigente:
      "Qué pasó antes de la consulta: los hechos que el cliente relató.",
    activo: true,
  },
  {
    id: ALCANCE_ID,
    clave: "alcance",
    orden: 2,
    rotuloOficial: OFICIAL_DEL_ALCANCE,
    descripcionOficial:
      "Qué trabajo asume el bufete: las gestiones concretas, ante qué" +
      " entidades, y qué recibe el cliente al terminar.",
    rotulo: null,
    descripcion: null,
    rotuloVigente: OFICIAL_DEL_ALCANCE,
    descripcionVigente:
      "Qué trabajo asume el bufete: las gestiones concretas, ante qué" +
      " entidades, y qué recibe el cliente al terminar.",
    activo: true,
  },
  {
    id: SUPUESTOS_ID,
    clave: "supuestos",
    orden: 3,
    rotuloOficial: "Supuestos",
    descripcionOficial: OFICIAL_DE_SUPUESTOS,
    rotulo: null,
    descripcion: null,
    rotuloVigente: "Supuestos",
    descripcionVigente: OFICIAL_DE_SUPUESTOS,
    activo: true,
  },
  {
    id: "9f2c4a10-7b31-4d6e-8a52-0c1e5b7d9a05",
    clave: "clausulas",
    orden: 4,
    rotuloOficial: "Cláusulas",
    descripcionOficial: "Las condiciones de la contratación.",
    rotulo: null,
    descripcion: null,
    rotuloVigente: "Cláusulas",
    descripcionVigente: "Las condiciones de la contratación.",
    // Una dada de baja: se muestra marcada y no escondida, porque lo que ya la
    // usa tiene que poder seguir nombrándola — y porque sin verla no se la
    // puede reactivar.
    activo: false,
  },
  {
    id: NOTA_ID,
    clave: "nota_cliente",
    orden: 5,
    rotuloOficial: OFICIAL_DE_LA_NOTA,
    descripcionOficial: OFICIAL_DESC_DE_LA_NOTA,
    rotulo: PROPIO_DE_LA_NOTA,
    descripcion: PROPIO_DESC_DE_LA_NOTA,
    rotuloVigente: PROPIO_DE_LA_NOTA,
    descripcionVigente: PROPIO_DESC_DE_LA_NOTA,
    activo: true,
  },
] as const;

/** Los anchos del criterio responsivo de §9, en los puntos de quiebre. */
const ANCHOS = [320, 360, 414, 767, 768, 1024, 1280, 1920, 2560] as const;
const ALTO = 900;

/**
 * La API, contestada desde acá. Solo la lectura: la escritura la pone cada
 * prueba que la necesita, antes de ésta, con `page.route` y `fallback`.
 *
 * El filtro es un predicado sobre el `pathname` y no un glob sobre `/api/`:
 * ese glob también atrapa los módulos que sirve Vite en desarrollo
 * —`/src/api/plantillas.ts` entre ellos— y una respuesta JSON en lugar de un
 * módulo deja la página en blanco sin un solo error visible.
 */
async function conPlantillasCargadas(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    async (ruta) => {
      const url = new URL(ruta.request().url());

      if (url.pathname === "/api/plantillas-modulo") {
        await ruta.fulfill({ status: 200, json: { plantillas: PLANTILLAS } });
        return;
      }

      await ruta.fulfill({ status: 404, json: { error: "not_found" } });
    },
  );
}

/** El bloque de un módulo, por su encabezado. */
function modulo(page: Page, clave: string) {
  return page.locator(`[aria-labelledby="modulo-${clave}"]`);
}

function campoDeRotulo(page: Page, clave: string) {
  return page.locator(`#modulo-${clave}-rotulo`);
}

function campoDeDescripcion(page: Page, clave: string) {
  return page.locator(`#modulo-${clave}-descripcion`);
}

/**
 * La marca sutil de un módulo, localizada por su clase y no por su texto.
 *
 * Es la misma forma que `precios.spec.ts` y `precios-en-cotizacion.spec.ts`
 * usan: un asterisco no se busca por texto —aparecería en cualquier otro
 * glifo de la página— y su nombre accesible está en un `span` oculto, que es
 * exactamente lo que no se puede localizar por lo que se ve.
 */
function marcas(page: Page, clave: string) {
  return modulo(page, clave).locator(".plantilla-modulo__marca");
}

/**
 * Qué controles de texto renderiza cada módulo, y con qué valor.
 *
 * Es la cuenta que el criterio exige que no pase de dos —un rótulo y una
 * descripción—: un tercero sería el preestablecido dibujado al lado.
 */
function camposPorModulo(page: Page): Promise<
  { clave: string; encabezado: string; valores: string[] }[]
> {
  return page.locator(".plantilla-modulo").evaluateAll((bloques) =>
    bloques.map((bloque) => {
      const controles = Array.from(
        bloque.querySelectorAll("input, textarea"),
      ) as (HTMLInputElement | HTMLTextAreaElement)[];

      return {
        clave:
          bloque.querySelector(".plantilla-modulo__clave")?.textContent ?? "",
        encabezado: (bloque.querySelector("h2")?.textContent ?? "").trim(),
        valores: controles.map((control) => control.value),
      };
    }),
  );
}

/** Todo lo que la pantalla muestra: texto dibujado más valores de los campos. */
function todoLoQueSeVe(page: Page): Promise<string> {
  return page.evaluate(() => {
    const controles = Array.from(
      document.querySelectorAll("input, textarea"),
    ) as (HTMLInputElement | HTMLTextAreaElement)[];

    return `${document.body.textContent ?? ""} ${controles
      .map((control) => control.value)
      .join(" ")}`;
  });
}

test.describe("los módulos de una cotización", () => {
  test("los cinco módulos se dibujan, con sus dos campos y nada más", async ({
    page,
  }) => {
    await conPlantillasCargadas(page);
    await page.goto("/catalogos/modulos");

    // El control de hostilidad. Sin bloques, el bucle de abajo recorrería un
    // arreglo vacío y la prueba pasaría sin medir nada: eso es la prueba
    // rota, no el defecto que persigue.
    await expect(page.locator(".plantilla-modulo").first()).toBeVisible();

    const bloques = await camposPorModulo(page);

    expect(
      bloques.length,
      "no se dibujó ningún módulo: esto es la prueba rota, no una comparación" +
        " que se colara",
    ).toBe(PLANTILLAS.length);

    expect(bloques.map((bloque) => bloque.clave)).toEqual([
      "antecedentes",
      "alcance",
      "supuestos",
      "clausulas",
      "nota_cliente",
    ]);

    for (const bloque of bloques) {
      expect(
        bloque.valores.length,
        `el módulo «${bloque.clave}» dibuja ${String(bloque.valores.length)}` +
          " controles de texto y tiene que dibujar dos: el rótulo y la" +
          " descripción. Un tercero es el preestablecido puesto al lado, que" +
          " es la comparación en línea que el usuario pidió sacar de estas" +
          " pantallas",
      ).toBe(2);
    }
  });

  /**
   * **El criterio de aceptación de esta pantalla.** La nota al cliente llega
   * editada, y su rótulo y su descripción originales no pueden estar en ningún
   * elemento ni en ningún campo. Los textos propios sí tienen que estar.
   */
  test("el preestablecido de un módulo editado no aparece en ninguna parte", async ({
    page,
  }) => {
    await conPlantillasCargadas(page);
    await page.goto("/catalogos/modulos");
    await expect(page.locator(".plantilla-modulo").first()).toBeVisible();

    const todo = await todoLoQueSeVe(page);

    expect(todo).toContain(PROPIO_DE_LA_NOTA);
    expect(todo).toContain(PROPIO_DESC_DE_LA_NOTA);

    expect(
      todo.includes(OFICIAL_DESC_DE_LA_NOTA),
      "la pantalla muestra la descripción preestablecida de un módulo que ya" +
        " tiene una propia: volvió la comparación al lado",
    ).toBe(false);
    expect(
      todo.includes(OFICIAL_DE_LA_NOTA),
      `la pantalla muestra «${OFICIAL_DE_LA_NOTA}», que es el rótulo` +
        " preestablecido de un módulo que ya tiene uno propio",
    ).toBe(false);
  });

  /**
   * Ninguna palabra pone al sistema a opinar sobre un texto que escribió el
   * abogado. Es la misma medición que `precios.spec.ts` hace sobre su propio
   * vocabulario, con la lista adaptada: acá no hay acuerdo ni mínimo que
   * nombrar.
   */
  test("ninguna palabra juzga lo que el bufete escribió", async ({ page }) => {
    await conPlantillasCargadas(page);
    await page.goto("/catalogos/modulos");
    await expect(page.locator(".plantilla-modulo").first()).toBeVisible();

    const texto = (await page.locator("main").textContent())?.toLowerCase();

    expect(
      texto,
      "la pantalla no llegó a dibujarse: esto es la prueba rota",
    ).toBeTruthy();

    for (const palabra of ["sugerid", "recomendad", "revisar", "advertencia"]) {
      expect(
        texto?.includes(palabra),
        `la pantalla dice «${palabra}»: eso convierte el preestablecido en` +
          " una subcategoría y pone al sistema a opinar sobre un texto que" +
          " escribió el abogado",
      ).toBe(false);
    }
  });

  /**
   * La marca va **sobre la excepción**: el módulo editado la lleva y los que
   * están en su preestablecido no. Nunca al revés.
   */
  test("la marca está sobre lo editado y no sobre lo preestablecido", async ({
    page,
  }) => {
    await conPlantillasCargadas(page);
    await page.goto("/catalogos/modulos");
    await expect(page.locator(".plantilla-modulo").first()).toBeVisible();

    // La nota al cliente tiene el rótulo y la descripción propios: dos marcas.
    await expect(marcas(page, "nota_cliente")).toHaveCount(2);

    // Los otros están en su preestablecido, que es la norma: ninguna.
    for (const clave of ["antecedentes", "alcance", "supuestos", "clausulas"]) {
      await expect(
        marcas(page, clave),
        `el módulo «${clave}» está marcado y no lo editó nadie: la marca` +
          " quedó sobre la norma en vez de sobre la excepción",
      ).toHaveCount(0);
    }
  });

  /**
   * La leyenda del asterisco se lee **antes** del primer módulo, no al pie: un
   * pie de página explica un signo que quien lo encontró ya no tiene a la
   * vista. Es la misma lección que la pantalla de precios aprendió con sus 29
   * tablas.
   */
  test("la leyenda de la marca se lee antes del primer módulo", async ({
    page,
  }) => {
    await conPlantillasCargadas(page);
    await page.goto("/catalogos/modulos");

    const leyenda = page.locator(".plantillas__leyenda");
    await expect(leyenda).toBeVisible();

    const orden = await page.evaluate(() => {
      const nodos = Array.from(
        document.querySelectorAll(".plantillas__leyenda, .plantilla-modulo"),
      );
      return nodos.map((nodo) =>
        nodo.classList.contains("plantillas__leyenda") ? "leyenda" : "modulo",
      );
    });

    expect(orden[0]).toBe("leyenda");
  });

  /**
   * Y **no se dibuja cuando no hay ninguna marca**: una leyenda que explica un
   * signo que no aparece en ninguna parte manda a buscarlo.
   */
  test("sin ningún módulo editado, la leyenda no se dibuja", async ({
    page,
  }) => {
    await page.route(
      (url) => url.pathname.startsWith("/api/"),
      async (ruta) => {
        const url = new URL(ruta.request().url());
        if (url.pathname === "/api/plantillas-modulo") {
          await ruta.fulfill({
            status: 200,
            json: {
              plantillas: PLANTILLAS.filter((cada) => cada.rotulo === null),
            },
          });
          return;
        }
        await ruta.fulfill({ status: 404, json: { error: "not_found" } });
      },
    );
    await page.goto("/catalogos/modulos");
    await expect(page.locator(".plantilla-modulo").first()).toBeVisible();

    await expect(page.locator(".plantillas__leyenda")).toHaveCount(0);
    await expect(page.locator(".plantilla-modulo__marca")).toHaveCount(0);
  });

  /* ======================================================================
     Editar, y volver atrás
     ====================================================================== */

  /**
   * **El criterio de aceptación 2, de punta a punta.**
   *
   * Se escribe un rótulo, se guarda, aparece la marca; se vacía el campo, se
   * guarda, y vuelve el preestablecido sin marca. El servidor contesta la fila
   * releída en las dos vueltas, así que lo que se mide es que la pantalla la
   * ponga en su lugar.
   *
   * Se verificó además **a mano contra la base local**, con la API real: 0
   * marcas en la pantalla limpia, 1 marca sobre el encabezado después de
   * editar el rótulo, 0 después de vaciarlo.
   */
  test("editar un rótulo marca el módulo, y vaciarlo devuelve el preestablecido", async ({
    page,
  }) => {
    const enviados: unknown[] = [];

    /*
     * **La lectura se registra primero y la escritura después.** Playwright
     * resuelve las rutas en orden inverso al de registro, así que la última
     * gana: con el orden al revés, el predicado ancho de
     * `conPlantillasCargadas` tapa esta ruta y el `PUT` contesta 404. Es el
     * mismo reparto que `precios.spec.ts` usa, `fallback` incluido para el
     * verbo que no es el de esta ruta.
     */
    await conPlantillasCargadas(page);
    await page.route(
      (url) => url.pathname === `/api/plantillas-modulo/${ALCANCE_ID}`,
      async (ruta) => {
        if (ruta.request().method() !== "PUT") {
          await ruta.fallback();
          return;
        }

        const cuerpo = ruta.request().postDataJSON() as {
          rotulo: string | null;
          descripcion: string | null;
        };
        enviados.push(cuerpo);

        const original = PLANTILLAS[1];
        await ruta.fulfill({
          status: 200,
          json: {
            plantilla: {
              ...original,
              rotulo: cuerpo.rotulo,
              descripcion: cuerpo.descripcion,
              rotuloVigente: cuerpo.rotulo ?? original.rotuloOficial,
              descripcionVigente:
                cuerpo.descripcion ?? original.descripcionOficial,
            },
          },
        });
      },
    );
    await page.goto("/catalogos/modulos");
    await expect(page.locator(".plantilla-modulo").first()).toBeVisible();

    await expect(marcas(page, "alcance")).toHaveCount(0);

    await campoDeRotulo(page, "alcance").fill(PROPIO_DEL_ALCANCE);
    await modulo(page, "alcance")
      .getByRole("button", { name: "Guardar" })
      .click();

    // La marca aparece sobre el encabezado, que ahora dice el rótulo propio.
    await expect(marcas(page, "alcance")).toHaveCount(1);
    await expect(
      modulo(page, "alcance").getByRole("heading", { level: 2 }),
    ).toContainText(PROPIO_DEL_ALCANCE);

    /*
     * **Y la descripción, que nadie tocó, no se marcó.** Es el defecto que se
     * encontró manejando la pantalla: el `PUT` manda el juego completo, así
     * que editar el rótulo manda también la descripción, y si viajara como
     * texto propio quedarían dos campos marcados en vez de uno.
     */
    expect(enviados).toEqual([
      { rotulo: PROPIO_DEL_ALCANCE, descripcion: null, activo: true },
    ]);

    // Vaciar y guardar: vuelve el preestablecido, y la marca se va.
    await campoDeRotulo(page, "alcance").fill("");
    await modulo(page, "alcance")
      .getByRole("button", { name: "Guardar" })
      .click();

    await expect(marcas(page, "alcance")).toHaveCount(0);
    await expect(campoDeRotulo(page, "alcance")).toHaveValue(
      OFICIAL_DEL_ALCANCE,
    );
    await expect(
      modulo(page, "alcance").getByRole("heading", { level: 2 }),
    ).toContainText(OFICIAL_DEL_ALCANCE);

    expect(enviados).toHaveLength(2);
    expect(enviados[1]).toEqual({
      rotulo: null,
      descripcion: null,
      activo: true,
    });
  });

  /**
   * El botón de guardar aparece **solo sobre el módulo tocado**: con el botón
   * en los seis, la pantalla sería una columna de botones apagados.
   */
  test("el botón de guardar aparece solo sobre el módulo que se tocó", async ({
    page,
  }) => {
    await conPlantillasCargadas(page);
    await page.goto("/catalogos/modulos");
    await expect(page.locator(".plantilla-modulo").first()).toBeVisible();

    await expect(page.getByRole("button", { name: "Guardar" })).toHaveCount(0);

    await campoDeDescripcion(page, "supuestos").fill("Otra cosa.");

    await expect(page.getByRole("button", { name: "Guardar" })).toHaveCount(1);
    await expect(
      modulo(page, "supuestos").getByRole("button", { name: "Guardar" }),
    ).toBeVisible();
  });

  /**
   * Reenviar el preestablecido tal cual **no es un cambio**, así que el botón
   * está apagado. Es donde esta pantalla se separa de la de precios a
   * propósito: allá hay un campo por fila y escribir el valor que se ve solo
   * puede ser deliberado; acá hay dos y el `PUT` manda los dos.
   */
  test("tocar un campo y dejarlo igual deja el botón apagado", async ({
    page,
  }) => {
    await conPlantillasCargadas(page);
    await page.goto("/catalogos/modulos");
    await expect(page.locator(".plantilla-modulo").first()).toBeVisible();

    /*
     * Se escribe algo y se deshace a mano, en vez de reescribir el mismo texto
     * de una vez: `fill` con el valor que el campo ya tiene **no dispara el
     * `onChange` de React** —deduplica cuando el valor no cambió— así que no
     * quedaría borrador y el botón no se dibujaría en absoluto. Medido: la
     * primera versión de esta prueba fallaba con «element(s) not found», que
     * es un defecto de la prueba y no de la pantalla.
     */
    const campo = campoDeRotulo(page, "supuestos");
    await campo.fill("Supuestos, con otra cosa");
    await campo.fill("Supuestos");

    await expect(
      modulo(page, "supuestos").getByRole("button", { name: "Guardar" }),
    ).toBeDisabled();
  });

  /* ======================================================================
     La baja y la reactivación
     ====================================================================== */

  /**
   * Lo dado de baja **se muestra marcado y no escondido**, y su botón ofrece
   * reactivarlo: sin verlo no se lo puede reactivar, y lo que ya lo usa tiene
   * que poder seguir nombrándolo. Misma política que los catálogos de T-6.
   */
  test("un módulo dado de baja se ve, marcado, y ofrece reactivarse", async ({
    page,
  }) => {
    await conPlantillasCargadas(page);
    await page.goto("/catalogos/modulos");
    await expect(page.locator(".plantilla-modulo").first()).toBeVisible();

    const dadoDeBaja = modulo(page, "clausulas");

    await expect(dadoDeBaja).toBeVisible();
    await expect(dadoDeBaja.getByText("De baja")).toBeVisible();
    await expect(
      dadoDeBaja.getByRole("button", { name: "Reactivar" }),
    ).toBeVisible();

    // Y los vigentes ofrecen lo contrario.
    await expect(
      modulo(page, "alcance").getByRole("button", { name: "Dar de baja" }),
    ).toBeVisible();
  });

  /**
   * La baja viaja en el mismo `PUT` que el texto, con el texto tal como está:
   * no hay ruta aparte. Lo que esto mide es que el cuerpo no vacíe los campos
   * de paso, que es lo que pasaría si el botón mandara solo `activo`.
   */
  test("dar de baja manda el texto tal como está, no lo vacía", async ({
    page,
  }) => {
    const enviados: unknown[] = [];

    await conPlantillasCargadas(page);
    await page.route(
      (url) => url.pathname === `/api/plantillas-modulo/${NOTA_ID}`,
      async (ruta) => {
        if (ruta.request().method() !== "PUT") {
          await ruta.fallback();
          return;
        }
        const cuerpo = ruta.request().postDataJSON() as Record<string, unknown>;
        enviados.push(cuerpo);
        await ruta.fulfill({
          status: 200,
          json: { plantilla: { ...PLANTILLAS[4], activo: false } },
        });
      },
    );
    await page.goto("/catalogos/modulos");
    await expect(page.locator(".plantilla-modulo").first()).toBeVisible();

    await modulo(page, "nota_cliente")
      .getByRole("button", { name: "Dar de baja" })
      .click();

    await expect(
      modulo(page, "nota_cliente").getByText("De baja"),
    ).toBeVisible();

    expect(enviados).toEqual([
      {
        rotulo: PROPIO_DE_LA_NOTA,
        descripcion: PROPIO_DESC_DE_LA_NOTA,
        activo: false,
      },
    ]);
  });

  /* ======================================================================
     Lo que la negativa dice
     ====================================================================== */

  /**
   * El 409 de escribir el preestablecido se explica con palabras y no con un
   * «algo salió mal». Nadie puede provocarlo desde esta pantalla —no hay campo
   * que mande esos datos— así que esto mide el camino de la respuesta, que es
   * la red de abajo para un cliente con un defecto.
   */
  test("un 409 del servidor se explica en la pantalla", async ({ page }) => {
    await conPlantillasCargadas(page);
    await page.route(
      (url) => url.pathname === `/api/plantillas-modulo/${SUPUESTOS_ID}`,
      async (ruta) => {
        if (ruta.request().method() !== "PUT") {
          await ruta.fallback();
          return;
        }
        await ruta.fulfill({
          status: 409,
          json: { error: "plantilla_sin_preset", campos: ["descripcion"] },
        });
      },
    );
    await page.goto("/catalogos/modulos");
    await expect(page.locator(".plantilla-modulo").first()).toBeVisible();

    await campoDeDescripcion(page, "supuestos").fill("Otra cosa.");
    await modulo(page, "supuestos")
      .getByRole("button", { name: "Guardar" })
      .click();

    const aviso = page.getByRole("alert");
    await expect(aviso).toContainText("preestablecido");
    await expect(aviso).not.toContainText("borrar");
  });

  /* ======================================================================
     El criterio responsivo de §9
     ====================================================================== */

  for (const ancho of ANCHOS) {
    test(`a ${String(ancho)}px de ancho, sobre los módulos`, async ({
      page,
    }) => {
      await conPlantillasCargadas(page);
      await page.setViewportSize({ width: ancho, height: ALTO });
      await page.goto("/catalogos/modulos");
      await page.evaluate(() => document.fonts.ready);
      await page.locator(".plantilla-modulo").first().waitFor();

      const desborde = await medirDesborde(page);

      expect(
        desborde.scrollWidth,
        porQueSeSale(ancho, desborde),
      ).toBeLessThanOrEqual(desborde.clientWidth);
    });
  }

  /**
   * El relleno del bloque sale de una **consulta de contenedor** y no del
   * viewport (§9), y eso solo se puede comprobar midiendo: la primera versión
   * declaraba la consulta sobre `.plantilla-modulo`, que es su propio
   * contenedor, así que no se aplicaba nunca. El defecto no rompía nada
   * visible —el relleno chico se ve bien— y por eso hace falta la medición.
   */
  test("el relleno del bloque crece con el ancho del bloque, no del viewport", async ({
    page,
  }) => {
    await conPlantillasCargadas(page);

    const rellenoA = async (ancho: number) => {
      await page.setViewportSize({ width: ancho, height: ALTO });
      await page.goto("/catalogos/modulos");
      await page.locator(".plantilla-modulo").first().waitFor();
      return page.evaluate(() => {
        const cuerpo = document.querySelector(".plantilla-modulo__cuerpo");
        return cuerpo === null
          ? null
          : Number.parseFloat(getComputedStyle(cuerpo).paddingLeft);
      });
    };

    const angosto = await rellenoA(360);
    const ancho = await rellenoA(1400);

    expect(angosto).not.toBeNull();
    expect(
      ancho,
      "el relleno no cambió con el ancho del bloque: la consulta de" +
        " contenedor está declarada sobre su propio contenedor y no se aplica",
    ).toBeGreaterThan(angosto as number);
  });

  /**
   * Los doce controles nombran su módulo, y no solo su campo.
   *
   * Con el rótulo visible a secas, los doce se llamarían «Rótulo» o
   * «Descripción» y un lector de pantalla recorrería la página anunciando el
   * mismo nombre una y otra vez. El nombre accesible se compone con el rótulo
   * del campo **y** el encabezado del módulo, en ese orden.
   */
  test("cada campo nombra su módulo en su nombre accesible", async ({
    page,
  }) => {
    await conPlantillasCargadas(page);
    await page.goto("/catalogos/modulos");
    await expect(page.locator(".plantilla-modulo").first()).toBeVisible();

    await expect(
      page.getByRole("textbox", { name: `Rótulo ${OFICIAL_DEL_ALCANCE}` }),
    ).toHaveCount(1);
    await expect(
      page.getByRole("textbox", { name: "Rótulo Supuestos" }),
    ).toHaveCount(1);
  });
});

/* ==========================================================================
   El alta de un módulo (T-7)

   Las palabras del usuario al mirar esta pantalla sin alta: «No veo la opción
   de crear un módulo, sólo editar y dar de baja.»

   Lo que **solo se ve acá** son cuatro cosas, y la primera es la queja:

    1. **Que el formulario esté a la vista sin abrir nada.** Es una afirmación
       sobre el dibujo y no sobre una función: un desplegable cerrado tiene los
       mismos campos en el DOM.
    2. Que el bloque del alta **no sea un módulo más**: la cuenta de controles
       por módulo es la guarda que protege «un valor por campo», y un
       formulario con la clase de los módulos la falsearía.
    3. Que el módulo creado aparezca **al final**, con su clave y **sin marca**.
    4. Que los dos 422 se lean **debajo del campo del que hablan**.
   ========================================================================== */

/** Lo que el servidor devuelve al crear «Observaciones del cliente». */
const CREADA = {
  id: "11111111-2222-3333-4444-555555555555",
  clave: "observaciones_del_cliente",
  orden: 7,
  rotuloOficial: null,
  descripcionOficial: null,
  rotulo: "Observaciones del cliente",
  descripcion: "Lo que el cliente dijo y conviene dejar escrito.",
  rotuloVigente: "Observaciones del cliente",
  descripcionVigente: "Lo que el cliente dijo y conviene dejar escrito.",
  activo: true,
};

/** El campo del rótulo del alta, que se llama «Rótulo» y nada más. */
function campoDelAlta(page: Page) {
  return page.locator("#modulo-nuevo-rotulo");
}

function campoDeDescripcionDelAlta(page: Page) {
  return page.locator("#modulo-nuevo-descripcion");
}

function botonDeAlta(page: Page) {
  return page
    .locator(".plantillas__alta")
    .getByRole("button", { name: "Agregar" });
}

/**
 * Contesta el `POST` del alta con lo que `responder` decida.
 *
 * Se registra **después** de `conPlantillasCargadas`, por lo mismo que las
 * pruebas del `PUT`: Playwright resuelve las rutas en orden inverso al de
 * registro, y el predicado ancho de la lectura taparía esta ruta. El
 * `fallback` deja pasar el `GET` de la colección, que es la misma dirección.
 */
async function conElAltaContestada(
  page: Page,
  responder: (cuerpo: { rotulo: string; descripcion: string }) => {
    status: number;
    json: unknown;
  },
): Promise<void> {
  await page.route(
    (url) => url.pathname === "/api/plantillas-modulo",
    async (ruta) => {
      if (ruta.request().method() !== "POST") {
        await ruta.fallback();
        return;
      }

      const cuerpo = ruta.request().postDataJSON() as {
        rotulo: string;
        descripcion: string;
      };
      await ruta.fulfill(responder(cuerpo));
    },
  );
}

test.describe("agregar un módulo", () => {
  /**
   * **La queja del usuario, contestada y medida.** El formulario está a la
   * vista sin abrir nada: sus dos campos son visibles y el botón existe.
   */
  test("el formulario está a la vista sin abrir nada", async ({ page }) => {
    await conPlantillasCargadas(page);
    await page.goto("/catalogos/modulos");
    await expect(page.locator(".plantilla-modulo").first()).toBeVisible();

    await expect(
      page.getByRole("heading", { level: 2, name: "Agregar un módulo" }),
    ).toBeVisible();
    await expect(campoDelAlta(page)).toBeVisible();
    await expect(campoDeDescripcionDelAlta(page)).toBeVisible();
    await expect(botonDeAlta(page)).toBeVisible();
  });

  /**
   * **Va al final de la lista, y no arriba.** A esta pantalla se entra a leer
   * y a corregir los módulos que ya están: el alta primero empujaría abajo lo
   * que se vino a buscar. Y es además donde el módulo nuevo va a aparecer,
   * porque nace con `orden = MAX(orden) + 1`.
   */
  test("el formulario va después del último módulo", async ({ page }) => {
    await conPlantillasCargadas(page);
    await page.goto("/catalogos/modulos");
    await expect(page.locator(".plantilla-modulo").first()).toBeVisible();

    const posiciones = await page.evaluate(() => {
      const ultimo = [...document.querySelectorAll(".plantilla-modulo")].pop();
      const alta = document.querySelector(".plantillas__alta");

      return ultimo === undefined || alta === null
        ? null
        : {
            modulo: ultimo.getBoundingClientRect().top,
            alta: alta.getBoundingClientRect().top,
          };
    });

    expect(posiciones).not.toBeNull();
    expect(
      (posiciones as { modulo: number; alta: number }).alta,
      "el formulario del alta quedó arriba de la lista: empuja abajo el" +
        " catálogo que es lo que se vino a leer",
    ).toBeGreaterThan((posiciones as { modulo: number }).modulo);
  });

  /**
   * **Y no es un módulo más.** La cuenta de controles por `.plantilla-modulo`
   * es la guarda de «un valor por campo»: si el formulario llevara esa clase,
   * la pantalla tendría un sexto bloque con dos campos vacíos y esa cuenta
   * dejaría de significar nada.
   */
  test("el bloque del alta no cuenta como un módulo", async ({ page }) => {
    await conPlantillasCargadas(page);
    await page.goto("/catalogos/modulos");
    await expect(page.locator(".plantilla-modulo").first()).toBeVisible();

    await expect(page.locator(".plantilla-modulo")).toHaveCount(
      PLANTILLAS.length,
    );
    await expect(page.locator(".plantillas__alta")).toHaveCount(1);
  });

  /**
   * El botón apagado hasta que los dos campos tengan algo. Es la mitad que
   * dice «la descripción es obligatoria» **antes** de que alguien falle, junto
   * con el párrafo de arriba.
   */
  test("el botón está apagado hasta que los dos campos tienen texto", async ({
    page,
  }) => {
    await conPlantillasCargadas(page);
    await page.goto("/catalogos/modulos");
    await expect(page.locator(".plantilla-modulo").first()).toBeVisible();

    await expect(botonDeAlta(page)).toBeDisabled();

    await campoDelAlta(page).fill("Observaciones del cliente");
    await expect(
      botonDeAlta(page),
      "el botón se prendió con la descripción vacía: el 422 del servidor va a" +
        " ser la primera noticia de que es obligatoria",
    ).toBeDisabled();

    await campoDeDescripcionDelAlta(page).fill("Lo que el cliente dijo.");
    await expect(botonDeAlta(page)).toBeEnabled();

    // Y sólo espacios no alcanza, que es la normalización del servidor.
    await campoDeDescripcionDelAlta(page).fill("   ");
    await expect(botonDeAlta(page)).toBeDisabled();
  });

  /**
   * **El alta completa, de punta a punta sobre el dibujo**: el cuerpo que
   * viaja no lleva clave, el módulo aparece al final con la clave que el
   * servidor acuñó, **sin marca de editado** y con su distintivo de que no
   * tiene preestablecido debajo.
   */
  test("el módulo creado aparece al final, con su clave y sin marca", async ({
    page,
  }) => {
    const enviados: unknown[] = [];

    await conPlantillasCargadas(page);
    await conElAltaContestada(page, (cuerpo) => {
      enviados.push(cuerpo);
      return { status: 201, json: { plantilla: CREADA } };
    });
    await page.goto("/catalogos/modulos");
    await expect(page.locator(".plantilla-modulo").first()).toBeVisible();

    await campoDelAlta(page).fill("  Observaciones del cliente  ");
    await campoDeDescripcionDelAlta(page).fill(
      "Lo que el cliente dijo y conviene dejar escrito.",
    );
    await botonDeAlta(page).click();

    // El cuerpo va recortado y **sin clave**: la acuña el servidor.
    expect(enviados).toEqual([
      {
        rotulo: "Observaciones del cliente",
        descripcion: "Lo que el cliente dijo y conviene dejar escrito.",
      },
    ]);

    const nuevo = modulo(page, CREADA.clave);
    await expect(nuevo).toBeVisible();
    await expect(nuevo.getByRole("heading", { level: 2 })).toContainText(
      "Observaciones del cliente",
    );

    /*
     * **Sin marca**, y es la decisión que la tarea tenía que tomar: el
     * asterisco dice «el bufete escribió esto encima del preestablecido», y
     * acá no hay nada debajo. Marcarlo sería afirmar una excepción sobre algo
     * que no tiene norma.
     */
    await expect(
      marcas(page, CREADA.clave),
      "el módulo que el bufete creó salió marcado como editado: no editó" +
        " nada, lo escribió entero",
    ).toHaveCount(0);

    // Y lleva su distintivo, que es lo que avisa que no se puede vaciar.
    await expect(nuevo).toContainText("Sin preestablecido");

    // Al final de la lista, que es donde su `orden` lo pone.
    const claves = await page
      .locator(".plantilla-modulo__clave")
      .allInnerTexts();
    expect(claves[claves.length - 1]).toBe(CREADA.clave);

    // El formulario quedó limpio: el botón se apaga solo.
    await expect(campoDelAlta(page)).toHaveValue("");
    await expect(botonDeAlta(page)).toBeDisabled();
  });

  /**
   * **El módulo creado se puede vaciar, y la pantalla lo impide antes de
   * mandar.** Es el aviso que T-2 escribió sin poder ejercerlo: las seis
   * sembradas tienen preestablecido en las dos columnas.
   */
  test("vaciar un campo del módulo creado avisa en vez de mandar", async ({
    page,
  }) => {
    await conPlantillasCargadas(page);
    await conElAltaContestada(page, () => ({
      status: 201,
      json: { plantilla: CREADA },
    }));
    await page.goto("/catalogos/modulos");
    await expect(page.locator(".plantilla-modulo").first()).toBeVisible();

    await campoDelAlta(page).fill("Observaciones del cliente");
    await campoDeDescripcionDelAlta(page).fill("Lo que el cliente dijo.");
    await botonDeAlta(page).click();
    await expect(modulo(page, CREADA.clave)).toBeVisible();

    await campoDeDescripcion(page, CREADA.clave).fill("");

    const nuevo = modulo(page, CREADA.clave);
    await expect(nuevo.getByRole("alert")).toContainText("preestablecido");
    await expect(
      nuevo.getByRole("button", { name: "Guardar" }),
    ).toBeDisabled();
  });

  /* ---- Los dos 422, debajo del campo del que hablan -------------------- */

  /**
   * El choque de claves. La frase manda a mirar la lista —donde está el
   * módulo que choca, dado de baja o no— y va **debajo del rótulo**, que es el
   * campo que la persona puede cambiar.
   */
  test("un rótulo cuya clave ya existe se explica debajo del rótulo", async ({
    page,
  }) => {
    await conPlantillasCargadas(page);
    await conElAltaContestada(page, () => ({
      status: 422,
      json: {
        error: "datos_invalidos",
        fallas: [{ campo: "rotulo", motivo: "clave_de_modulo_tomada" }],
      },
    }));
    await page.goto("/catalogos/modulos");
    await expect(page.locator(".plantilla-modulo").first()).toBeVisible();

    await campoDelAlta(page).fill("¡Alcance!");
    await campoDeDescripcionDelAlta(page).fill("Otra cosa.");
    await botonDeAlta(page).click();

    const aviso = page.locator(".plantillas__alta").getByRole("alert");
    await expect(aviso).toContainText("identificador");
    await expect(aviso).toContainText("dado de baja");
    // Y el campo queda marcado como inválido, para quien no ve el aviso.
    await expect(campoDelAlta(page)).toHaveAttribute("aria-invalid", "true");
    // Lo tecleado sigue ahí: un rechazo que borra el formulario es un rechazo
    // que hace escribirlo de nuevo.
    await expect(campoDelAlta(page)).toHaveValue("¡Alcance!");
  });

  /**
   * Y el otro, que **no dice lo mismo**: de ese rótulo no sale ningún
   * identificador. Son dos problemas con dos salidas distintas —uno pide otro
   * rótulo, el otro pide uno con letras— y aplastarlos dejaría a la pantalla
   * mandando a cambiar un nombre que no choca con nada.
   */
  test("un rótulo del que no sale ninguna clave dice otra cosa", async ({
    page,
  }) => {
    await conPlantillasCargadas(page);
    await conElAltaContestada(page, () => ({
      status: 422,
      json: {
        error: "datos_invalidos",
        fallas: [{ campo: "rotulo", motivo: "rotulo_sin_clave" }],
      },
    }));
    await page.goto("/catalogos/modulos");
    await expect(page.locator(".plantilla-modulo").first()).toBeVisible();

    await campoDelAlta(page).fill("«»");
    await campoDeDescripcionDelAlta(page).fill("Otra cosa.");
    await botonDeAlta(page).click();

    const aviso = page.locator(".plantillas__alta").getByRole("alert");
    await expect(aviso).toContainText("letra");
    await expect(
      aviso,
      "los dos 422 dicen lo mismo: la persona va a cambiar el nombre cuando" +
        " el problema es que no escribió ninguna letra",
    ).not.toContainText("ya existe");
  });

  /* ---- El criterio responsivo de §9 sobre el formulario nuevo ---------- */

  for (const ancho of ANCHOS) {
    test(`a ${String(ancho)}px de ancho, sobre el alta`, async ({ page }) => {
      await conPlantillasCargadas(page);
      await page.setViewportSize({ width: ancho, height: ALTO });
      await page.goto("/catalogos/modulos");
      await page.evaluate(() => document.fonts.ready);
      await page.locator(".plantillas__alta").waitFor();

      const desborde = await medirDesborde(page);

      expect(
        desborde.scrollWidth,
        porQueSeSale(ancho, desborde),
      ).toBeLessThanOrEqual(desborde.clientWidth);
    });
  }
});
