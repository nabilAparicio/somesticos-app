/**
 * Tus precios dentro de la cotización (T-2 de
 * `odd/tasks/precios-en-la-cotizacion.md`), en el navegador.
 *
 * ## Lo que este archivo protege
 *
 * Las palabras del usuario, que son el criterio de la tajada:
 *
 * > «¿Estos precios se le inyectan al agente cuando se hace la cotización
 * > asistida? … También en la vista de cotización debe poder verse, para que el
 * > usuario sepa sus propios precios en todo momento.»
 *
 * Son dos cosas y las dos sólo se pueden medir dibujadas:
 *
 *  1. **Elegir un servicio tarifado prellena concepto y monto**, y lo que se
 *     teclea encima es lo que se guarda. Esta segunda mitad es la que más fácil
 *     sería romper: un servidor o una pantalla que «corrigieran» el importe con
 *     el del catálogo convertirían una propuesta en una imposición. El monto de
 *     la prueba es **distinto** del precio del catálogo a propósito; si fueran
 *     iguales, no se podría distinguir una cosa de la otra.
 *  2. **Tus precios a la vista mientras se cotiza**, buscables, para no tener
 *     que acordarse de un número ni irse a otra pantalla a mirarlo.
 *
 * Y protege el vacío, que hoy es el caso de todo el mundo: las 453 filas del
 * acuerdo nacen con `monto` en nulo, así que en una instalación recién sembrada
 * este panel no tiene una sola fila. Una caja en blanco al lado de la
 * cotización no dice nada.
 *
 * ## La regla que no se renegocia, y se prueba estructuralmente
 *
 * **Ninguna comparación con el monto oficial. Ninguna.** No hay un «mínimo: X»,
 * no hay una segunda columna, no hay un color que signifique «por debajo». La
 * tajada anterior lo decidió sobre la pantalla de precios y acá vale igual, y
 * la forma de probarlo es la de `e2e/precios.spec.ts`: se **cuentan** las
 * cifras de dinero que cada fila del panel renderiza, en vez de buscar una
 * cadena. La diferencia es lo que la prueba vale — una «mejora» que vuelva a
 * agregar la cita, con cualquier rótulo y en cualquier celda, suma una cifra y
 * se pone roja; una prueba que comparara contra el texto «mínimo» pasaría en
 * verde con la columna de vuelta y otro encabezado.
 *
 * **Las respuestas de la API van interceptadas**, por lo mismo que en
 * `cotizaciones.spec.ts` y `precios.spec.ts`: `vite dev` corre sin identidad de
 * Access, así que la API real contesta 403 y la pantalla se dibujaría como un
 * aviso de error. Medir el layout de un párrafo suelto sería medir nada.
 */
import { expect, test, type Page } from "@playwright/test";

import { medirDesborde, porQueSeSale } from "./desborde";

/* --- Los identificadores de la muestra ---------------------------------- */

const BORRADOR_ID = "7c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e01";
const EMITIDA_ID = "7c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e02";
/** Un borrador cuyo bufete no tarifó nada: el estado vacío del panel. */
const SIN_PRECIOS_ID = "7c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e03";

const CLIENTE_ID = "3a3f1d0e-0e2c-4c1f-9a6b-2d8a1c5e7b01";

const RUBRO_ID = "c0000000-0000-4000-8000-000000000001";
const PENSIONADO_ID = "c0000000-0000-4000-8000-000000000002";
const TRABAJO_ID = "c0000000-0000-4000-8000-000000000003";
const CUANTIA_ID = "c0000000-0000-4000-8000-000000000004";

const MIGRACION = "ACTUACIONES ANTE EL SERVICIO NACIONAL DE MIGRACIÓN";
const CIVIL = "ASUNTOS DE DERECHO PROCESAL (CIVIL-COMERCIAL)";

const PENSIONADO = "Visa de pensionado o jubilado";
const CUANTIA = "Procesos de mayor cuantía";

/**
 * Los tres importes de esta suite, y cada uno está donde está por un motivo.
 *
 *  - `PROPIO_DEL_PENSIONADO` es lo que el bufete cobra, y es lo único que la
 *    pantalla puede mostrar.
 *  - `OFICIAL_DEL_PENSIONADO` es la cita de 2001 del mismo servicio. **Es el
 *    número que esta suite persigue**: si aparece en algún lado, volvió la
 *    comparación. Está elegido con cifras que no son prefijo ni sufijo de
 *    ninguno de los otros importes de la página, para que la búsqueda sobre el
 *    texto del documento no pueda dar un falso positivo.
 *  - `EDITADO_DEL_PENSIONADO` es lo que la persona escribe encima del
 *    prellenado, y es distinto del precio del catálogo: con los dos iguales, una
 *    pantalla que mandara el del catálogo pasaría sin que nada lo notara.
 */
const PROPIO_DEL_PENSIONADO = 40_000;
const OFICIAL_DEL_PENSIONADO = 13_755;
const EDITADO_DEL_PENSIONADO = 97_350;

const PROPIO_DE_LA_CUANTIA = 250_000;

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
        numeral: "3.a",
        concepto: PENSIONADO,
        clase: "monto",
        montoOficial: OFICIAL_DEL_PENSIONADO,
        reglaOficial: null,
        monto: PROPIO_DEL_PENSIONADO,
        activo: true,
      },
      /*
       * El servicio que el bufete **no** tarifó. No tiene que aparecer en
       * ningún lado: sin precio del bufete no hay nada que proponer, y la base
       * rechaza la línea que lo nombrara.
       */
      {
        id: TRABAJO_ID,
        orden: 12,
        categoria: MIGRACION,
        numeral: "3.b",
        concepto: "Permiso de trabajo por contrato",
        clase: "monto",
        montoOficial: 30_000,
        reglaOficial: null,
        monto: null,
        activo: true,
      },
    ],
    notas: [],
  },
  {
    /*
     * Una regla por cuantía **con** precio propio. Son 97 renglones del
     * acuerdo, y la tajada anterior decidió que el bufete puede escribirles su
     * propio monto: dejarlos afuera del panel los volvería inofrecibles.
     */
    nombre: CIVIL,
    renglones: [
      {
        id: CUANTIA_ID,
        orden: 20,
        categoria: CIVIL,
        numeral: "1",
        concepto: CUANTIA,
        clase: "regla",
        montoOficial: null,
        reglaOficial:
          "25% de lo que se obtenga, sobre una cuantía de B/.3,000.00" +
          " hasta B/.10,000.00.",
        monto: PROPIO_DE_LA_CUANTIA,
        activo: true,
      },
    ],
    notas: [],
  },
] as const;

/** El acuerdo sin un solo precio del bufete: las 453 filas de hoy. */
const CATEGORIAS_SIN_PRECIOS = CATEGORIAS.map((categoria) => ({
  ...categoria,
  renglones: categoria.renglones.map((renglon) => ({ ...renglon, monto: null })),
}));

const CLIENTES = [
  {
    id: CLIENTE_ID,
    tipoClienteId: null,
    tipoClienteNombre: null,
    nombre: "Carlos Pérez Domínguez",
    documentoTipo: "Cédula",
    documentoNumero: "8-888-8888",
    representanteLegal: null,
    email: null,
    telefono: "+507 6000-0000",
    notas: null,
    creadoPor: "u1",
    creadoPorNombre: "Itzel",
    creadoEn: "2026-09-01T14:03:00.000Z",
  },
];

function cotizacion(ajustes: Record<string, unknown>): Record<string, unknown> {
  return {
    id: BORRADOR_ID,
    codigo: "COT-2026-0101",
    estado: "borrador",
    clienteId: CLIENTE_ID,
    clienteNombre: CLIENTES[0].nombre,
    fecha: "2026-10-22T14:03:00.000Z",
    venceEn: null,
    moneda: "USD",
    duplicadaDeId: null,
    creadaPor: "u1",
    creadaPorNombre: "Itzel",
    creadaEn: "2026-10-22T14:03:00.000Z",
    ...ajustes,
  };
}

const COTIZACIONES = [
  cotizacion({}),
  cotizacion({ id: EMITIDA_ID, codigo: "COT-2026-0102", estado: "emitida" }),
  cotizacion({ id: SIN_PRECIOS_ID, codigo: "COT-2026-0103" }),
];

const LINEA_ID = "6b1f0c11-1111-4111-8111-000000000001";

/**
 * Una línea ya guardada **con procedencia**, para medir el desplegable de una
 * línea que ya sabe de dónde salió su precio.
 *
 * Su monto no es el del catálogo: es una línea cuyo prellenado alguien editó, y
 * lo que la pantalla tiene que mostrar es el de la línea.
 */
const LINEAS = [
  {
    id: LINEA_ID,
    clase: "honorario",
    concepto: PENSIONADO,
    monto: 55_000,
    tipoProcesoId: null,
    tipoProcesoNombre: null,
    arancelRenglonId: PENSIONADO_ID,
    arancelConcepto: PENSIONADO,
    orden: 0,
  },
];

const TOTALES = { honorarios: 55_000, gastosEstimados: 0, total: 55_000 };

/** Los anchos del criterio responsivo de §9, en los puntos de quiebre. */
const ANCHOS = [320, 360, 414, 767, 768, 1024, 1280, 1920, 2560] as const;
const ALTO = 900;

function cuerpoDe(pathname: string): Record<string, unknown> | null {
  if (pathname === "/api/clientes") return { clientes: CLIENTES };
  if (pathname === "/api/tipos-proceso") return { tipos: [] };
  if (pathname === "/api/usuarios") return { usuarios: [] };
  if (pathname === "/api/procesos") return { procesos: [] };
  if (pathname === "/api/cotizaciones") return { cotizaciones: COTIZACIONES };

  if (/^\/api\/cotizaciones\/[^/]+\/bitacora$/.test(pathname)) {
    return { entradas: [], total: 0 };
  }
  if (/^\/api\/cotizaciones\/[^/]+\/modulos$/.test(pathname)) {
    return { modulos: [] };
  }
  if (/^\/api\/cotizaciones\/[^/]+\/cuotas$/.test(pathname)) {
    return { cuotas: [], total: 0, base: 0 };
  }

  const deLineas = /^\/api\/cotizaciones\/([^/]+)\/lineas$/.exec(pathname);
  if (deLineas !== null) {
    // La del estado vacío arranca sin líneas: lo que se mide ahí es el panel.
    return deLineas[1] === SIN_PRECIOS_ID
      ? { lineas: [], totales: { honorarios: 0, gastosEstimados: 0, total: 0 } }
      : { lineas: LINEAS, totales: TOTALES };
  }

  for (const una of COTIZACIONES) {
    if (pathname === `/api/cotizaciones/${String(una.id)}`) {
      return { cotizacion: una };
    }
  }

  return null;
}

/**
 * La API, contestada desde acá.
 *
 * El filtro es un predicado sobre el `pathname` y no un glob sobre `/api/`: ese
 * glob también atrapa los módulos que sirve Vite en desarrollo
 * —`/src/api/arancel.ts` entre ellos— y una respuesta JSON en lugar de un
 * módulo deja la página en blanco sin un solo error visible.
 *
 * `conPrecios` decide qué contesta `GET /api/arancel`: la muestra con precios
 * del bufete, o el acuerdo entero sin uno solo, que es el estado de hoy.
 */
async function conLaCotizacionCargada(
  page: Page,
  conPrecios = true,
): Promise<void> {
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    async (ruta) => {
      const url = new URL(ruta.request().url());

      if (url.pathname === "/api/arancel") {
        await ruta.fulfill({
          status: 200,
          json: {
            categorias: conPrecios ? CATEGORIAS : CATEGORIAS_SIN_PRECIOS,
          },
        });
        return;
      }

      const cuerpo = cuerpoDe(url.pathname);
      if (cuerpo === null) {
        await ruta.fulfill({ status: 404, json: { error: "not_found" } });
        return;
      }
      await ruta.fulfill({ status: 200, json: cuerpo });
    },
  );
}

/**
 * El desplegable de servicio **del formulario de alta**.
 *
 * Se busca por su rótulo completo —la palabra «opcional» incluida— y no por
 * subcadena: cada línea guardada tiene el suyo con un nombre accesible propio,
 * así que `getByLabel("Servicio tarifado")` resuelve a dos controles y
 * Playwright se niega, con razón.
 */
function servicioDelAlta(page: Page) {
  return page.getByLabel("Servicio tarifado opcional");
}

/** El panel de precios del bufete, dentro del editor de líneas. */
function panelDePrecios(page: Page) {
  return page.locator(".tus-precios");
}

/**
 * Qué dinero renderiza cada fila del panel.
 *
 * Es la cuenta que la regla de la tajada exige que no pase de uno. Se mira el
 * texto de la fila entera porque en el panel no hay campos: es una lista de
 * consulta, no un formulario.
 */
function dineroPorFilaDelPanel(page: Page): Promise<
  { servicio: string; cifras: string[] }[]
> {
  return page
    .locator(".tus-precios__item")
    .evaluateAll((filas) => {
      const FORMA = /\d[\d,]*\.\d{2}/g;

      return filas.map((fila) => ({
        servicio: (
          fila.querySelector(".tus-precios__servicio")?.textContent ?? ""
        ).trim(),
        cifras: (fila.textContent ?? "").match(FORMA) ?? [],
      }));
    });
}

/** El importe en centavos, dicho como la pantalla lo escribe. */
function legible(centavos: number): string {
  const enteros = Math.floor(centavos / 100);
  const resto = String(centavos % 100).padStart(2, "0");
  const miles = enteros.toLocaleString("en-US");
  return `${miles}.${resto}`;
}

test.describe("el prellenado desde tus precios", () => {
  test("elegir un servicio escribe su concepto y su monto", async ({ page }) => {
    await conLaCotizacionCargada(page);
    await page.goto(`/cotizaciones/${BORRADOR_ID}`);

    const concepto = page.getByLabel("Concepto", { exact: true });
    await expect(concepto).toBeVisible();
    await expect(
      concepto,
      "el campo de concepto arranca con algo escrito: esto es la prueba rota," +
        " no un prellenado",
    ).toHaveValue("");

    await servicioDelAlta(page)
      .selectOption({ label: `Inmigrantes · ${PENSIONADO}` });

    // El rótulo completo y no el concepto a secas: 147 de los 453 renglones del
    // acuerdo tienen un concepto que es un fragmento —«primer año»,
    // «Reconsideración»— porque su encabezado está una línea más arriba, y una
    // cotización no tiene ese encabezado.
    await expect(concepto).toHaveValue(`Inmigrantes · ${PENSIONADO}`);
    // El valor va escrito a mano y no derivado de `montoEditable`, que es la
    // función que lo produce.
    await expect(page.getByLabel("Importe USD")).toHaveValue(
      "400.00",
    );
  });

  /**
   * **La mitad que más fácil sería romper.**
   *
   * El prellenado es una propuesta: lo que se guarda es lo que quedó en el
   * campo. Una pantalla que volviera a mirar el catálogo al enviar —o un
   * servidor que lo hiciera— convertiría la propuesta en una imposición, y el
   * abogado perdería la decisión sobre su propio precio sin que nada se lo
   * dijera.
   */
  test("el monto editado encima del prellenado es el que se manda", async ({
    page,
  }) => {
    await conLaCotizacionCargada(page);

    let enviado: string | null = null;
    await page.route(
      (url) => url.pathname === `/api/cotizaciones/${BORRADOR_ID}/lineas`,
      async (ruta) => {
        if (ruta.request().method() !== "POST") {
          await ruta.fallback();
          return;
        }
        enviado = ruta.request().postData();
        await ruta.fulfill({ status: 201, json: { lineas: LINEAS, totales: TOTALES } });
      },
    );

    await page.goto(`/cotizaciones/${BORRADOR_ID}`);

    await servicioDelAlta(page)
      .selectOption({ label: `Inmigrantes · ${PENSIONADO}` });

    await page.getByLabel("Clase", { exact: true }).selectOption("honorario");
    await page
      .getByLabel("Importe USD")
      .fill(legible(EDITADO_DEL_PENSIONADO));

    await page.getByRole("button", { name: "Añadir la línea" }).click();

    await expect.poll(() => enviado).not.toBeNull();
    expect(JSON.parse(enviado ?? "{}")).toEqual({
      clase: "honorario",
      concepto: `Inmigrantes · ${PENSIONADO}`,
      monto: EDITADO_DEL_PENSIONADO,
      tipoProcesoId: null,
      arancelRenglonId: PENSIONADO_ID,
    });
  });

  test("desvincular el servicio deja el monto donde estaba", async ({ page }) => {
    await conLaCotizacionCargada(page);
    await page.goto(`/cotizaciones/${BORRADOR_ID}`);

    const servicio = servicioDelAlta(page);
    await servicio.selectOption({ label: `Inmigrantes · ${PENSIONADO}` });
    await servicio.selectOption("");

    // Lo que se quita es la procedencia, no la cifra: tirar el importe que
    // alguien ya aceptó sería perder trabajo ajeno por tocar un desplegable.
    await expect(page.getByLabel("Importe USD")).toHaveValue(
      "400.00",
    );
    await expect(page.getByLabel("Concepto", { exact: true })).toHaveValue(
      `Inmigrantes · ${PENSIONADO}`,
    );
  });

  test("una línea guardada muestra el servicio del que salió su precio", async ({
    page,
  }) => {
    await conLaCotizacionCargada(page);
    await page.goto(`/cotizaciones/${BORRADOR_ID}`);

    const suyo = page.getByLabel(
      "Servicio tarifado de la línea 1 de Honorarios",
    );
    await expect(suyo).toHaveValue(PENSIONADO_ID);

    // Y su importe es el de la línea —55.000 centavos— y no el del catálogo:
    // el prellenado se editó cuando se escribió, y lo que manda es lo guardado.
    await expect(
      page.getByLabel("Importe de la línea 1 de Honorarios, en USD"),
    ).toHaveValue("550.00");
  });
});

test.describe("tus precios a la vista mientras se cotiza", () => {
  test("el panel muestra los servicios tarifados con su precio", async ({
    page,
  }) => {
    await conLaCotizacionCargada(page);
    await page.goto(`/cotizaciones/${BORRADOR_ID}`);

    const panel = panelDePrecios(page);
    await expect(panel).toBeVisible();
    await expect(panel).toContainText(PENSIONADO);
    await expect(panel).toContainText(CUANTIA);
    await expect(panel).toContainText(legible(PROPIO_DEL_PENSIONADO));
    await expect(panel).toContainText(legible(PROPIO_DE_LA_CUANTIA));
  });

  test("lo que el bufete no tarifó no aparece en el panel", async ({ page }) => {
    await conLaCotizacionCargada(page);
    await page.goto(`/cotizaciones/${BORRADOR_ID}`);

    const panel = panelDePrecios(page);
    await expect(panel).toBeVisible();

    // Ni el servicio sin precio propio ni el rubro que encabeza la categoría
    // son servicios ofrecibles: del primero no hay número que proponer, y el
    // segundo es un título que la base no deja tarifar.
    await expect(
      panel.getByText("Permiso de trabajo por contrato"),
      "el panel ofrece un servicio sin precio del bufete: no hay nada que" +
        " prellenar con él, y la base rechaza la línea que lo nombrara",
    ).toHaveCount(0);
    await expect(page.locator(".tus-precios__item")).toHaveCount(2);
  });

  test("buscar en tus precios deja sólo lo que coincide", async ({ page }) => {
    await conLaCotizacionCargada(page);
    await page.goto(`/cotizaciones/${BORRADOR_ID}`);

    await expect(page.locator(".tus-precios__item")).toHaveCount(2);

    await page
      .getByRole("searchbox", { name: "Buscar en tus precios" })
      .fill("inmigrantes");

    // Por el rubro que lo encabeza: el acuerdo imprime «3. Inmigrantes» una vez
    // y cuelga de ahí sus letras sin repetir la palabra.
    await expect(page.locator(".tus-precios__item")).toHaveCount(1);
    await expect(panelDePrecios(page)).toContainText(PENSIONADO);
    await expect(panelDePrecios(page).getByText(CUANTIA)).toHaveCount(0);
  });

  test("una búsqueda sin resultados lo dice y no deja la lista a medias", async ({
    page,
  }) => {
    await conLaCotizacionCargada(page);
    await page.goto(`/cotizaciones/${BORRADOR_ID}`);

    await page
      .getByRole("searchbox", { name: "Buscar en tus precios" })
      .fill("sociedad anónima");

    await expect(page.locator(".tus-precios__item")).toHaveCount(0);
    await expect(panelDePrecios(page)).toContainText("Ningún servicio tuyo");
  });

  /**
   * **El estado vacío, que hoy es el de todo el mundo.**
   *
   * Los 453 renglones del acuerdo nacen con `monto` en nulo, así que en una
   * instalación recién sembrada este panel no tiene una sola fila. Lo que no
   * puede pasar es que se dibuje una caja en blanco: hay que decir que nadie
   * puso precios todavía —y no que algo se rompió— y llevar a donde se ponen.
   */
  test("sin un solo precio del bufete, el panel dice qué pasa y adónde ir", async ({
    page,
  }) => {
    await conLaCotizacionCargada(page, false);
    await page.goto(`/cotizaciones/${SIN_PRECIOS_ID}`);

    const panel = panelDePrecios(page);
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("todavía no le puso precio");

    const enlace = panel.getByRole("link", { name: "Ir a tus precios" });
    await expect(
      enlace,
      "el panel vacío no ofrece ninguna salida: decir que la lista está vacía" +
        " sin decir dónde se llena es dejar a la persona buscando la pantalla",
    ).toBeVisible();
    await expect(enlace).toHaveAttribute("href", "/catalogos/precios");

    // Y no se ofrece un buscador sobre una lista vacía: un control que no puede
    // hacer nada es un control que sobra.
    await expect(
      page.getByRole("searchbox", { name: "Buscar en tus precios" }),
    ).toHaveCount(0);
    await expect(page.locator(".tus-precios__item")).toHaveCount(0);
  });

  test("sobre una cotización emitida el panel no se dibuja", async ({ page }) => {
    await conLaCotizacionCargada(page);
    await page.goto(`/cotizaciones/${EMITIDA_ID}`);

    // Las líneas se leen; el panel no. En lo que ya salió no hay nada que
    // prellenar ni nada que elegir, y un panel de consulta al lado de un
    // documento congelado es ruido sobre algo que el cliente ya tiene.
    await expect(page.locator(".renglon").first()).toBeVisible();
    await expect(panelDePrecios(page)).toHaveCount(0);
  });
});

test.describe("ninguna comparación con el monto oficial", () => {
  test("ninguna fila del panel dibuja dos cifras de dinero", async ({ page }) => {
    await conLaCotizacionCargada(page);
    await page.goto(`/cotizaciones/${BORRADOR_ID}`);

    // El control de hostilidad. Sin filas, el bucle de abajo recorrería un
    // arreglo vacío y la prueba pasaría sin medir nada: eso es la prueba rota,
    // no el defecto que persigue.
    await expect(page.locator(".tus-precios__item").first()).toBeVisible();

    const filas = await dineroPorFilaDelPanel(page);

    expect(
      filas.length,
      "el panel no dibujó ninguna fila: esto es la prueba rota, no una" +
        " comparación que se colara",
    ).toBe(2);

    for (const fila of filas) {
      expect(
        fila.cifras.length,
        `la fila «${fila.servicio}» dibuja ${String(fila.cifras.length)}` +
          ` cifras de dinero (${fila.cifras.join(", ")}) y tiene que dibujar` +
          " una sola: la del bufete. Dos cifras es la comparación con el" +
          " Acuerdo No 49 de 2001 que el usuario pidió sacar del sistema",
      ).toBe(1);
    }
  });

  test("el monto del acuerdo no aparece en ninguna parte de la pantalla", async ({
    page,
  }) => {
    await conLaCotizacionCargada(page);
    await page.goto(`/cotizaciones/${BORRADOR_ID}`);
    await expect(page.locator(".tus-precios__item").first()).toBeVisible();

    const todo = await page.evaluate(() => {
      const campos = Array.from(document.querySelectorAll("input")).map(
        (campo) => (campo as HTMLInputElement).value,
      );
      const opciones = Array.from(document.querySelectorAll("option")).map(
        (opcion) => opcion.textContent ?? "",
      );
      return `${document.body.textContent ?? ""} ${campos.join(
        " ",
      )} ${opciones.join(" ")}`;
    });

    // El precio del bufete tiene que estar; la cita de 2001, no.
    expect(todo).toContain(legible(PROPIO_DEL_PENSIONADO));
    expect(
      todo.includes(legible(OFICIAL_DEL_PENSIONADO)),
      `la pantalla muestra ${legible(OFICIAL_DEL_PENSIONADO)}, que es el monto` +
        " del Acuerdo No 49 de 2001 de un servicio que ya tiene precio del" +
        " bufete. Volvió la cita al lado del precio propio, o el panel empezó" +
        " a traerla",
    ).toBe(false);
  });

  test("el panel no dice ninguna palabra que mida el precio del bufete", async ({
    page,
  }) => {
    await conLaCotizacionCargada(page);
    await page.goto(`/cotizaciones/${BORRADOR_ID}`);

    const panel = panelDePrecios(page);
    await expect(panel).toBeVisible();

    const texto = (await panel.textContent())?.toLowerCase();
    expect(
      texto,
      "el panel no llegó a dibujarse: esto es la prueba rota",
    ).toBeTruthy();

    for (const palabra of ["mínim", "oficial", "debajo", "acuerdo", "arancel"]) {
      expect(
        texto?.includes(palabra),
        `el panel dice «${palabra}»: eso vuelve a poner la vara con la que el` +
          " sistema mide una decisión que ya tomó el abogado. El lugar de esas" +
          " palabras es la tabla del arancel",
      ).toBe(false);
    }
  });
});

test.describe("el criterio responsivo de §9 con el panel puesto", () => {
  test("el detalle con tus precios no scrollea en horizontal", async ({
    page,
  }) => {
    await conLaCotizacionCargada(page);

    for (const ancho of ANCHOS) {
      await page.setViewportSize({ width: ancho, height: ALTO });
      await page.goto(`/cotizaciones/${BORRADOR_ID}`);
      await expect(page.locator(".tus-precios__item").first()).toBeVisible();

      const desborde = await medirDesborde(page);
      expect(
        desborde.scrollWidth,
        porQueSeSale(ancho, desborde),
      ).toBeLessThanOrEqual(desborde.clientWidth);
    }
  });

  /**
   * «Al lado» se mide, no se declara.
   *
   * Y se mide como **posición relativa dentro del hueco de la sección**, no
   * como una coordenada: lo que decide si el panel cabe al costado es el ancho
   * real que la sección tiene, que no es el de la ventana. A 2560px de ventana
   * la columna de contenido es de sobra ancha y el panel tiene que estar a la
   * derecha de las líneas; a 360px no hay lado, y entonces queda debajo.
   */
  test("en un hueco ancho el panel va al lado, y en uno angosto debajo", async ({
    page,
  }) => {
    await conLaCotizacionCargada(page);

    await page.setViewportSize({ width: 1920, height: ALTO });
    await page.goto(`/cotizaciones/${BORRADOR_ID}`);
    await expect(panelDePrecios(page)).toBeVisible();

    const ancho = await page.evaluate(() => {
      const lineas = document
        .querySelector(".lineas-con-precios__lineas")
        ?.getBoundingClientRect();
      const panel = document.querySelector(".tus-precios")?.getBoundingClientRect();
      if (lineas === undefined || panel === undefined) return null;
      return { alLado: panel.left >= lineas.right - 1 };
    });

    expect(ancho, "no se encontró el panel o la columna: la prueba está rota")
      .not.toBeNull();
    expect(
      ancho?.alLado,
      "a 1920px el panel quedó debajo de las líneas en vez de al lado. El" +
        " usuario pidió ver sus precios mientras arma la cotización, no" +
        " después de recorrerla entera",
    ).toBe(true);

    await page.setViewportSize({ width: 360, height: ALTO });
    await page.goto(`/cotizaciones/${BORRADOR_ID}`);
    await expect(panelDePrecios(page)).toBeVisible();

    const angosto = await page.evaluate(() => {
      const lineas = document
        .querySelector(".lineas-con-precios__lineas")
        ?.getBoundingClientRect();
      const panel = document.querySelector(".tus-precios")?.getBoundingClientRect();
      if (lineas === undefined || panel === undefined) return null;
      return { debajo: panel.top >= lineas.bottom - 1 };
    });

    expect(angosto, "no se encontró el panel o la columna: la prueba está rota")
      .not.toBeNull();
    expect(
      angosto?.debajo,
      "a 360px el panel no quedó debajo de las líneas: dos pistas en un hueco" +
        " de trescientos sesenta píxeles son dos columnas que no se pueden" +
        " leer",
    ).toBe(true);
  });
});
