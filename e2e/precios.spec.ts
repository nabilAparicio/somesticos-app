/**
 * Las dos pantallas del arancel (T-3), en el navegador.
 *
 * ## Lo que este archivo protege, y es el criterio de aceptación 4
 *
 * **En la pantalla de los precios del bufete no hay dos cifras por fila.**
 * El Acuerdo No 49 de 2001 es una tarifa mínima de hace veinticinco años, y
 * la primera versión del diseño ponía su monto al lado del del bufete, con
 * un aviso cuando el propio quedaba por debajo. El usuario lo corrigió:
 * «así no se siente que el sistema juzga tus precios, sino que el sistema
 * sabe cuánto cuesta y te lo sugiere». Esa corrección es una propiedad del
 * dibujo, y el dibujo solo se mide acá.
 *
 * Y se mide **estructuralmente**: se cuentan las cifras de dinero que cada
 * fila renderiza en sus `<td>`, no se busca una cadena. La diferencia es lo
 * que esta prueba vale: una «mejora» que vuelva a agregar la columna oficial
 * —con cualquier rótulo, en cualquier celda, con cualquier clase— suma una
 * cifra y se pone roja. Una prueba que comparara contra el texto «mínimo»
 * pasaría en verde con la columna de vuelta y otro encabezado.
 *
 * El concepto va en `<th scope="row">` y no en un `<td>`, lo que no es solo
 * semántica de tabla: es lo que deja contar el dinero de la fila sin contar
 * los importes que el acuerdo imprime **dentro** del concepto y del texto de
 * una regla —«De B/.0.01 hasta B/.3,000.00», «B/.2,000.00 más el 35%»—, que
 * son parte de la cita y tienen que verse.
 *
 * ## Las otras cuatro cosas que solo se ven acá
 *
 *  1. Que el enlace «de dónde sale este precio» **aterriza en el renglón**
 *     que corresponde, y no en el principio de una tabla de 453 filas.
 *  2. Que la nota de procedencia está **arriba** de la tabla del arancel, en
 *     el orden del documento y no en cualquier lado de la pantalla.
 *  3. Que un `rubro` —los 74 encabezados que el acuerdo imprime sin valor—
 *     **no ofrece campo de precio**. La base lo rechaza con
 *     `un_rubro_no_lleva_precio`; que la pantalla no lo pida se ve acá.
 *  4. Que editar un precio lo manda, y que borrar el campo manda un nulo y
 *     devuelve la sugerencia a la vista.
 *
 * **Las respuestas de la API van interceptadas**, por lo mismo que en
 * `catalogos.spec.ts`: `vite dev` corre sin identidad de Access, así que la
 * API real contesta 403 y la pantalla se dibujaría como un aviso de error.
 * Medir el layout de un párrafo suelto sería medir nada.
 */
import { expect, test, type Page } from "@playwright/test";

import { medirDesborde, porQueSeSale } from "./desborde";

/* --- Los identificadores de la muestra ---------------------------------- */

const RUBRO_ID = "a0000000-0000-4000-8000-000000000001";
const PENSIONADO_ID = "a0000000-0000-4000-8000-000000000002";
const TRABAJO_ID = "a0000000-0000-4000-8000-000000000003";
const CUANTIA_ID = "a0000000-0000-4000-8000-000000000004";

const MIGRACION = "ACTUACIONES ANTE EL SERVICIO NACIONAL DE MIGRACIÓN";
const CIVIL = "ASUNTOS DE DERECHO PROCESAL (CIVIL-COMERCIAL)";
const PROSA = "OTROS ASUNTOS";

/**
 * El monto del acuerdo de la fila que **sí** tiene precio propio.
 *
 * Es el número que esta suite persigue: B/.150.00 es la cita de 2001 y
 * B/.400.00 es lo que el bufete cobra hoy. Están elegidos distintos a
 * propósito, porque si coincidieran no se podría distinguir «la pantalla
 * muestra el del bufete» de «la pantalla muestra el oficial».
 */
const OFICIAL_DEL_PENSIONADO = "150.00";
const PROPIO_DEL_PENSIONADO = "400.00";

/** La sugerencia de la fila que todavía no tiene precio propio. */
const SUGERIDO_DEL_TRABAJO = "300.00";

const CATEGORIAS = [
  {
    nombre: MIGRACION,
    renglones: [
      {
        id: RUBRO_ID,
        orden: 10,
        categoria: MIGRACION,
        numeral: "3",
        concepto: "Inmigrantes",
        clase: "rubro",
        montoOficial: null,
        reglaOficial: null,
        monto: null,
        activo: true,
      },
      {
        id: PENSIONADO_ID,
        orden: 11,
        categoria: MIGRACION,
        numeral: "a",
        concepto: "Visa de pensionado o jubilado",
        clase: "monto",
        montoOficial: 15000,
        reglaOficial: null,
        monto: 40000,
        activo: true,
      },
      {
        id: TRABAJO_ID,
        orden: 12,
        categoria: MIGRACION,
        numeral: "b",
        concepto: "Permiso de trabajo por contrato",
        clase: "monto",
        montoOficial: 30000,
        reglaOficial: null,
        monto: null,
        activo: true,
      },
    ],
    notas: [
      {
        id: "n0000000-0000-4000-8000-000000000001",
        orden: 1,
        categoria: MIGRACION,
        texto:
          "PARÁGRAFO: En todo trámite se cargarán B/.200.00 por cada" +
          " dependiente que acompañe al solicitante.",
      },
    ],
  },
  {
    nombre: CIVIL,
    renglones: [
      {
        id: CUANTIA_ID,
        orden: 20,
        categoria: CIVIL,
        numeral: "1",
        concepto: "Procesos de mayor cuantía",
        clase: "regla",
        montoOficial: null,
        reglaOficial:
          "25% de lo que se obtenga, sobre una cuantía de B/.3,000.00" +
          " hasta B/.10,000.00.",
        monto: null,
        activo: true,
      },
    ],
    notas: [],
  },
  /*
   * Una de las dos secciones que el acuerdo imprime **solo como prosa**. Se
   * ve en la tabla del arancel —es parte del documento— y no se ve en la
   * pantalla de precios, porque no hay nada que tarifar en ella.
   */
  {
    nombre: PROSA,
    renglones: [],
    notas: [
      {
        id: "n0000000-0000-4000-8000-000000000002",
        orden: 2,
        categoria: PROSA,
        texto:
          "Todo asunto no comprendido en la enumeración anterior se cobrará" +
          " a razón de B/.150.00 la hora.",
      },
    ],
  },
] as const;

/** Los anchos del criterio responsivo de §9, en los puntos de quiebre. */
const ANCHOS = [320, 360, 414, 767, 768, 1024, 1280, 1920, 2560] as const;
const ALTO = 900;

/**
 * La API, contestada desde acá. Solo la lectura: la escritura la pone cada
 * prueba que la necesita, antes de ésta, con `page.route` y `fallback`.
 *
 * El filtro es un predicado sobre el `pathname` y no un glob sobre
 * `/api/`: ese glob también atrapa los módulos que sirve Vite en desarrollo
 * —`/src/api/arancel.ts` entre ellos— y una respuesta JSON en lugar de un
 * módulo deja la página en blanco sin un solo error visible.
 */
async function conArancelCargado(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    async (ruta) => {
      const url = new URL(ruta.request().url());

      if (url.pathname === "/api/arancel") {
        await ruta.fulfill({ status: 200, json: { categorias: CATEGORIAS } });
        return;
      }

      await ruta.fulfill({ status: 404, json: { error: "not_found" } });
    },
  );
}

/**
 * Qué dinero renderiza cada fila **fuera** de la celda del concepto.
 *
 * `<th scope="row">` lleva el concepto y el texto de la regla, que son la
 * cita del acuerdo y traen importes adentro. Lo que se cuenta son los `<td>`:
 * su texto y el valor de sus campos. Ésa es la cuenta que el criterio de
 * aceptación 4 exige que no pase de uno.
 */
function dineroPorFila(page: Page): Promise<
  { concepto: string; cifras: string[]; campos: number }[]
> {
  return page.locator("table tbody tr").evaluateAll((filas) => {
    const FORMA = /\d[\d,]*\.\d{2}/g;

    return filas.map((fila) => {
      const celdas = Array.from(fila.querySelectorAll("td"));
      const campos = Array.from(fila.querySelectorAll("td input"));

      const textos = celdas
        .map((celda) => celda.textContent ?? "")
        .concat(campos.map((campo) => (campo as HTMLInputElement).value));

      return {
        concepto: (fila.querySelector("th")?.textContent ?? "").trim(),
        cifras: textos.flatMap((texto) => texto.match(FORMA) ?? []),
        campos: campos.length,
      };
    });
  });
}

/** El campo de precio de una fila, buscado por su rótulo accesible. */
function campoDePrecio(page: Page, concepto: string) {
  return page.getByRole("textbox", { name: `Precio de ${concepto}` });
}

test.describe("los precios del bufete", () => {
  test("ninguna fila dibuja dos cifras de dinero", async ({ page }) => {
    await conArancelCargado(page);
    await page.goto("/catalogos/precios");

    // El control de hostilidad. Sin filas, el bucle de abajo recorrería un
    // arreglo vacío y la prueba pasaría sin medir nada: eso es la prueba
    // rota, no el defecto que persigue.
    await expect(page.locator("table tbody tr").first()).toBeVisible();

    const filas = await dineroPorFila(page);

    expect(
      filas.length,
      "no se dibujó ninguna fila de precios: esto es la prueba rota, no una" +
        " comparación que se colara",
    ).toBe(4);

    for (const fila of filas) {
      expect(
        fila.cifras.length,
        `la fila «${fila.concepto}» dibuja ${String(fila.cifras.length)}` +
          ` cifras de dinero (${fila.cifras.join(", ")}) y tiene que dibujar` +
          " una sola: la del bufete. Dos cifras es la comparación en línea" +
          " que el usuario pidió sacar de esta pantalla",
      ).toBeLessThanOrEqual(1);
    }
  });

  test("el monto del acuerdo no aparece en ninguna parte de la pantalla", async ({
    page,
  }) => {
    await conArancelCargado(page);
    await page.goto("/catalogos/precios");
    await expect(page.locator("table tbody tr").first()).toBeVisible();

    const todo = await page.evaluate(() => {
      const campos = Array.from(document.querySelectorAll("input")).map(
        (campo) => (campo as HTMLInputElement).value,
      );
      return `${document.body.textContent ?? ""} ${campos.join(" ")}`;
    });

    // La visa de pensionado tiene precio propio —B/.400.00— y su cita del
    // acuerdo es B/.150.00. El propio tiene que estar; la cita, no.
    expect(todo).toContain(PROPIO_DEL_PENSIONADO);
    expect(
      todo.includes(OFICIAL_DEL_PENSIONADO),
      `la pantalla muestra ${OFICIAL_DEL_PENSIONADO}, que es el monto del` +
        " acuerdo de un servicio que ya tiene precio propio. Volvió la" +
        " columna oficial, o volvió el «mínimo: X» al lado del precio",
    ).toBe(false);
  });

  test("no aparece ninguna palabra que mida el precio del bufete", async ({
    page,
  }) => {
    await conArancelCargado(page);
    await page.goto("/catalogos/precios");
    await expect(page.locator("table tbody tr").first()).toBeVisible();

    const texto = (await page.locator("body").textContent())?.toLowerCase();

    expect(
      texto,
      "la pantalla no llegó a dibujarse: esto es la prueba rota",
    ).toBeTruthy();

    for (const palabra of ["mínim", "oficial", "debajo", "acuerdo", "arancel"]) {
      expect(
        texto?.includes(palabra),
        `la pantalla de precios dice «${palabra}»: eso vuelve a poner la vara` +
          " con la que el sistema mide una decisión que ya tomó el abogado." +
          " El lugar de esas palabras es la tabla del arancel",
      ).toBe(false);
    }
  });

  test("un rubro del acuerdo no ofrece ningún campo de precio", async ({
    page,
  }) => {
    await conArancelCargado(page);
    await page.goto("/catalogos/precios");
    await expect(page.locator("table tbody tr").first()).toBeVisible();

    const filas = await dineroPorFila(page);
    const rubro = filas.find((fila) => fila.concepto.includes("Inmigrantes"));

    expect(
      rubro,
      "no se encontró la fila del rubro «Inmigrantes»: esto es la prueba rota",
    ).toBeTruthy();
    expect(
      rubro?.campos,
      "el encabezado «3. Inmigrantes» tiene campo de precio. El acuerdo lo" +
        " imprime sin valor porque solo agrupa a sus hijos, y la base lo" +
        " rechaza con `un_rubro_no_lleva_precio`",
    ).toBe(0);
    expect(rubro?.cifras).toEqual([]);
  });

  test("el servicio sin precio propio arranca con la sugerencia, marcada", async ({
    page,
  }) => {
    await conArancelCargado(page);
    await page.goto("/catalogos/precios");

    // Ni vacío ni cero: el sistema sabe cuánto cuesta y lo dice.
    await expect(
      campoDePrecio(page, "Permiso de trabajo por contrato"),
    ).toHaveValue(SUGERIDO_DEL_TRABAJO);

    const fila = page.locator("table tbody tr", {
      hasText: "Permiso de trabajo por contrato",
    });
    await expect(fila.getByText("sugerido")).toBeVisible();

    // Y la fila que sí tiene precio decidido no lleva la marca.
    const decidida = page.locator("table tbody tr", {
      hasText: "Visa de pensionado o jubilado",
    });
    await expect(campoDePrecio(page, "Visa de pensionado o jubilado")).toHaveValue(
      PROPIO_DEL_PENSIONADO,
    );
    await expect(decidida.getByText("sugerido")).toHaveCount(0);
  });

  test("buscar por concepto deja solo lo que coincide", async ({ page }) => {
    await conArancelCargado(page);
    await page.goto("/catalogos/precios");
    await expect(page.locator("table tbody tr")).toHaveCount(4);

    await page.getByRole("searchbox", { name: "Buscar" }).fill("trabajo");

    // El rubro que la encabeza viene con ella: un servicio sin su encabezado
    // pierde la mitad de su nombre en el documento.
    await expect(page.locator("table tbody tr")).toHaveCount(2);
    await expect(
      page.getByText("Permiso de trabajo por contrato"),
    ).toBeVisible();
    await expect(
      page.getByText("Visa de pensionado o jubilado"),
    ).toHaveCount(0);
  });

  test("editar un precio lo manda y la pantalla se queda con lo que volvió", async ({
    page,
  }) => {
    await conArancelCargado(page);

    let enviado: string | null = null;
    await page.route(
      (url) => url.pathname === `/api/arancel/${TRABAJO_ID}`,
      async (ruta) => {
        if (ruta.request().method() !== "PUT") {
          await ruta.fallback();
          return;
        }
        enviado = ruta.request().postData();
        await ruta.fulfill({
          status: 200,
          json: {
            renglon: {
              ...CATEGORIAS[0].renglones[2],
              monto: 52000,
            },
          },
        });
      },
    );

    await page.goto("/catalogos/precios");

    const campo = campoDePrecio(page, "Permiso de trabajo por contrato");
    await campo.fill("520.00");

    const guardar = page.getByRole("button", {
      name: "Guardar el precio de Permiso de trabajo por contrato",
    });
    await expect(guardar).toBeEnabled();
    await guardar.click();

    await expect.poll(() => enviado).not.toBeNull();
    expect(JSON.parse(enviado ?? "{}")).toEqual({ monto: 52000 });

    // Lo que se dibuja es lo que contestó el servidor, y la marca de
    // sugerencia se cae porque ya hay una decisión del bufete.
    await expect(campo).toHaveValue("520.00");
    const fila = page.locator("table tbody tr", {
      hasText: "Permiso de trabajo por contrato",
    });
    await expect(fila.getByText("sugerido")).toHaveCount(0);
  });

  test("borrar el campo manda un nulo y devuelve la sugerencia", async ({
    page,
  }) => {
    await conArancelCargado(page);

    let enviado: string | null = null;
    await page.route(
      (url) => url.pathname === `/api/arancel/${PENSIONADO_ID}`,
      async (ruta) => {
        if (ruta.request().method() !== "PUT") {
          await ruta.fallback();
          return;
        }
        enviado = ruta.request().postData();
        await ruta.fulfill({
          status: 200,
          json: {
            renglon: { ...CATEGORIAS[0].renglones[1], monto: null },
          },
        });
      },
    );

    await page.goto("/catalogos/precios");

    const campo = campoDePrecio(page, "Visa de pensionado o jubilado");
    await campo.fill("");

    await page
      .getByRole("button", {
        name: "Guardar el precio de Visa de pensionado o jubilado",
      })
      .click();

    await expect.poll(() => enviado).not.toBeNull();
    // Nulo, no cero. Cero es «esto no lo cobramos» y nulo es «todavía no lo
    // decidimos», que es lo que hace volver la sugerencia a la vista.
    expect(JSON.parse(enviado ?? "{}")).toEqual({ monto: null });

    await expect(campo).toHaveValue(OFICIAL_DEL_PENSIONADO);
    const fila = page.locator("table tbody tr", {
      hasText: "Visa de pensionado o jubilado",
    });
    await expect(fila.getByText("sugerido")).toBeVisible();
  });

  test("el enlace lleva al renglón que corresponde en la tabla del arancel", async ({
    page,
  }) => {
    await conArancelCargado(page);
    await page.goto("/catalogos/precios");

    const fila = page.locator("table tbody tr", {
      hasText: "Procesos de mayor cuantía",
    });
    await fila.getByRole("link", { name: "de dónde sale este precio" }).click();

    await expect(page).toHaveURL(
      new RegExp(`/catalogos/arancel#renglon-${CUANTIA_ID}$`),
    );

    const renglon = page.locator(`#renglon-${CUANTIA_ID}`);
    await expect(
      renglon,
      "el enlace llegó a la tabla del arancel y el renglón que lo motivó no" +
        " está dibujado: el ancla no coincide con ningún `id`",
    ).toBeVisible();
    await expect(
      renglon,
      "el renglón existe pero quedó fuera de la vista: aterrizar en el" +
        " principio de una tabla de 453 filas es no aterrizar",
    ).toBeInViewport();

    // Y queda señalado. Llegar a la fila correcta sin saber cuál es, en una
    // tabla de 453, es llegar a ninguna: el salto mueve la página y lo único
    // que dice dónde cayó es la marca.
    await expect(
      renglon,
      "el renglón al que llevó el enlace no quedó marcado: el salto movió la" +
        " página y nada dice en qué fila cayó",
    ).toHaveClass(/arancel__renglon--señalado/);
  });
});

test.describe("la tabla del arancel", () => {
  test("la nota de procedencia está arriba de la tabla", async ({ page }) => {
    await conArancelCargado(page);
    await page.goto("/catalogos/arancel");

    const nota = page.locator(".procedencia");
    await expect(nota).toBeVisible();

    const texto = (await nota.textContent()) ?? "";
    expect(texto).toContain("Acuerdo No 49");
    expect(texto).toContain("24 de abril de 2001");
    expect(texto).toContain("Sala Cuarta de Negocios Generales");
    expect(texto.toLowerCase()).toContain("mínim");

    // «Arriba» es una posición en el documento, no una casualidad del
    // dibujo: acá se afirma el orden y no la coordenada, porque la
    // coordenada cambia con el ancho y el orden no.
    const antes = await page.evaluate(() => {
      const nota = document.querySelector(".procedencia");
      const tabla = document.querySelector("table");
      if (nota === null || tabla === null) return null;
      return Boolean(
        nota.compareDocumentPosition(tabla) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      );
    });

    expect(
      antes,
      "la nota de procedencia o la tabla no existen: esto es la prueba rota",
    ).not.toBeNull();
    expect(
      antes,
      "la nota de procedencia quedó debajo de la tabla. Es el lugar donde" +
        " alguien fue a preguntar de dónde sale un número, así que es donde" +
        " la respuesta sirve",
    ).toBe(true);
  });

  test("trae el documento entero, prosa incluida, y no deja editar nada", async ({
    page,
  }) => {
    await conArancelCargado(page);
    await page.goto("/catalogos/arancel");

    // Las tres categorías, la de pura prosa entre ellas.
    for (const nombre of [MIGRACION, CIVIL, PROSA]) {
      await expect(page.getByRole("heading", { name: nombre })).toBeVisible();
    }

    // Y el parágrafo de la categoría, que cambia el precio de todas sus
    // filas y no de una.
    await expect(
      page.getByText("por cada dependiente", { exact: false }),
    ).toBeVisible();

    // De solo lectura: ni un campo ni un botón de guardar en toda la tabla.
    await expect(page.locator("table input")).toHaveCount(0);
    await expect(page.locator("table button")).toHaveCount(0);
  });

  test("muestra el monto del acuerdo, que es lo que acá se vino a ver", async ({
    page,
  }) => {
    await conArancelCargado(page);
    await page.goto("/catalogos/arancel");

    const fila = page.locator(`#renglon-${PENSIONADO_ID}`);
    await expect(fila).toContainText(OFICIAL_DEL_PENSIONADO);

    // Y acá tampoco está el precio del bufete: esta pantalla es la cita.
    await expect(fila).not.toContainText(PROPIO_DEL_PENSIONADO);
  });
});

test.describe("el criterio responsivo de §9 sobre las dos pantallas", () => {
  for (const direccion of ["/catalogos/precios", "/catalogos/arancel"]) {
    test(`${direccion} no hace scrollear el documento en horizontal`, async ({
      page,
    }) => {
      await conArancelCargado(page);

      for (const ancho of ANCHOS) {
        await page.setViewportSize({ width: ancho, height: ALTO });
        await page.goto(direccion);
        await expect(page.locator("table tbody tr").first()).toBeVisible();

        const desborde = await medirDesborde(page);
        expect(
          desborde.scrollWidth,
          porQueSeSale(ancho, desborde),
        ).toBeLessThanOrEqual(desborde.clientWidth);
      }
    });
  }
});
