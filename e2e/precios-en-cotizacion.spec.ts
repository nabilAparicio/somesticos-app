/**
 * Los precios del bufete dentro de la cotización (T-2 de
 * `odd/tasks/precios-en-la-cotizacion.md`, rehecho por T-2 bis), en el
 * navegador.
 *
 * ## Lo que este archivo protege
 *
 * Las palabras del usuario en T-2 bis, que son el criterio de esta suite:
 *
 * > «Siempre debemos mostrar todos los precios, hayan sido modificados por mí o
 * > sean los preestablecidos. … El panel "Tus precios" desaparece y el dropdown
 * > que los lista pasa a tener una barra de búsqueda, y las opciones el monto al
 * > lado, y un botón que diga "listar todos". Esto abre un modal que me permite
 * > ver todos en una vista más expandida, y con un indicativo visual si es
 * > preestablecido o editado, algo sutil, una marca, un asterisco. Y aquí los
 * > distintos inputs deben tener un label: no me queda claro qué hace cada uno.»
 *
 * Son seis cosas, y las seis **sólo** se pueden medir dibujadas:
 *
 *  1. **el catálogo ofrecido son los renglones con cifra**, el preestablecido
 *     incluido, que es el error conceptual que esta corrección deshace;
 *  2. **el selector busca**, con el monto al lado de cada opción, y es
 *     **completo con el teclado**: es un campo de dinero y tiene que poder
 *     usarse sin mouse;
 *  3. **«Listar todos» abre la vista expandida**, `Escape` la cierra y el foco
 *     vuelve de donde salió;
 *  4. **la marca aparece en la vista expandida y no en el selector**;
 *  5. **los cinco controles de una línea tienen un rótulo a la vista**;
 *  6. elegir un servicio prellena concepto y monto, y **lo que se teclea encima
 *     es lo que se guarda**.
 *
 * La sexta es la que más fácil sería romper: un servidor o una pantalla que
 * «corrigieran» el importe con el del catálogo convertirían una propuesta en una
 * imposición. El monto de la prueba es **distinto** del precio del catálogo a
 * propósito; si fueran iguales, no se podría distinguir una cosa de la otra.
 *
 * ## La regla que no se renegocia, y se prueba estructuralmente
 *
 * **Una sola cifra de dinero por servicio. Ninguna comparación.** Lo que cambió
 * en T-2 bis es *cuál* es esa cifra —la del bufete si la editó, la
 * preestablecida si no— y no *cuántas*. La forma de probarlo es la de
 * `e2e/precios.spec.ts`: se **cuentan** las cifras que cada fila renderiza en
 * sus celdas de datos, en vez de buscar una cadena. La diferencia es lo que la
 * prueba vale — una «mejora» que ponga la cita de 2001 al lado del precio
 * decidido, con cualquier rótulo y en cualquier celda, suma una cifra y se pone
 * roja; una prueba que buscara la palabra «mínimo» pasaría en verde con la
 * columna de vuelta y otro encabezado.
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
/** Un borrador cuyo catálogo llega vacío: el estado sin servicios. */
const SIN_PRECIOS_ID = "7c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e03";

const CLIENTE_ID = "3a3f1d0e-0e2c-4c1f-9a6b-2d8a1c5e7b01";

const RUBRO_ID = "c0000000-0000-4000-8000-000000000001";
const PENSIONADO_ID = "c0000000-0000-4000-8000-000000000002";
const TRABAJO_ID = "c0000000-0000-4000-8000-000000000003";
const CUANTIA_ID = "c0000000-0000-4000-8000-000000000004";
const SIN_CIFRA_ID = "c0000000-0000-4000-8000-000000000005";

const MIGRACION = "ACTUACIONES ANTE EL SERVICIO NACIONAL DE MIGRACIÓN";
const CIVIL = "ASUNTOS DE DERECHO PROCESAL (CIVIL-COMERCIAL)";

const PENSIONADO = "Visa de pensionado o jubilado";
/** El servicio **preestablecido**: el bufete no le escribió su precio. */
const TRABAJO = "Permiso de trabajo por contrato";
const CUANTIA = "Procesos de mayor cuantía";
/** Una de las 97 reglas sin ningún número: no es ofrecible. */
const SIN_CIFRA = "Procesos de menor cuantía";

/** El rótulo completo del servicio que cuelga del rubro. */
const PENSIONADO_ROTULADO = `Inmigrantes · ${PENSIONADO}`;
const TRABAJO_ROTULADO = `Inmigrantes · ${TRABAJO}`;

/**
 * Los cuatro importes de esta suite, y cada uno está donde está por un motivo.
 *
 *  - `PROPIO_DEL_PENSIONADO` es lo que el bufete decidió cobrar, y es lo único
 *    que la pantalla puede mostrar de ese servicio.
 *  - `OFICIAL_DEL_PENSIONADO` es la cita de 2001 del **mismo** servicio. **Es el
 *    número que esta suite persigue**: si aparece en algún lado, volvió la
 *    comparación. Está elegido con cifras que no son prefijo ni sufijo de
 *    ninguno de los otros importes de la página, para que la búsqueda sobre el
 *    texto del documento no pueda dar un falso positivo.
 *  - `PREESTABLECIDO_DEL_TRABAJO` es la cifra de un servicio que el bufete no
 *    editó. **Acá sí tiene que verse**: es su precio, y esconderlo era el error
 *    que T-2 bis corrige.
 *  - `EDITADO_DEL_PENSIONADO` es lo que la persona escribe encima del
 *    prellenado, y es distinto del precio del catálogo: con los dos iguales, una
 *    pantalla que mandara el del catálogo pasaría sin que nada lo notara.
 */
const PROPIO_DEL_PENSIONADO = 40_000;
const OFICIAL_DEL_PENSIONADO = 13_755;
const PREESTABLECIDO_DEL_TRABAJO = 30_000;
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
       * El servicio que el bufete **no editó**, y que por eso sigue diciendo lo
       * que dice el acuerdo. En T-2 no aparecía en ningún lado; desde T-2 bis es
       * un servicio como cualquier otro, con su cifra y sin marca.
       */
      {
        id: TRABAJO_ID,
        orden: 12,
        categoria: MIGRACION,
        numeral: "3.b",
        concepto: TRABAJO,
        clase: "monto",
        montoOficial: PREESTABLECIDO_DEL_TRABAJO,
        reglaOficial: null,
        monto: null,
        activo: true,
      },
    ],
    notas: [],
  },
  {
    nombre: CIVIL,
    renglones: [
      /*
       * Una regla por cuantía **con** precio propio. Son 97 renglones del
       * acuerdo, y la tajada anterior decidió que el bufete puede escribirles su
       * propio monto: dejarlos afuera los volvería inofrecibles.
       */
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
      /* Y una **sin ninguna cifra**: el único rechazo que queda después de
         `migrations/0015_un_precio_es_una_cifra.sql`. */
      {
        id: SIN_CIFRA_ID,
        orden: 21,
        categoria: CIVIL,
        numeral: "2",
        concepto: SIN_CIFRA,
        clase: "regla",
        montoOficial: null,
        reglaOficial: "15% de lo que se obtenga, sobre la menor cuantía.",
        monto: null,
        activo: true,
      },
    ],
    notas: [],
  },
] as const;

/** El catálogo vacío: ninguna categoría, ningún renglón. */
const CATEGORIAS_VACIAS: typeof CATEGORIAS = [] as unknown as typeof CATEGORIAS;

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
 * Una línea ya guardada **con procedencia**, para medir el selector de una línea
 * que ya sabe de dónde salió su precio.
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
    // La del catálogo vacío arranca sin líneas: lo que se mide ahí es el
    // selector sin nada que ofrecer.
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
 */
async function conLaCotizacionCargada(
  page: Page,
  conCatalogo = true,
): Promise<void> {
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    async (ruta) => {
      const url = new URL(ruta.request().url());

      if (url.pathname === "/api/arancel") {
        await ruta.fulfill({
          status: 200,
          json: { categorias: conCatalogo ? CATEGORIAS : CATEGORIAS_VACIAS },
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
 * El selector de servicio **del formulario de alta**, entero.
 *
 * Es el **último** de la pantalla: las filas guardadas traen el suyo y el del
 * alta va al final del documento. Se localiza por la caja y no por el campo
 * porque de acá cuelgan las tres cosas que estas pruebas tocan —el campo, su
 * lista de opciones y el botón «Listar todos»— y buscarlas en la página entera
 * resuelve a los controles de las otras líneas.
 */
function cajaDelAlta(page: Page) {
  return page.locator(".selector-de-servicio").last();
}

/** El campo del selector del alta. */
function selectorDelAlta(page: Page) {
  return cajaDelAlta(page).getByRole("combobox", {
    name: "Servicio opcional",
    exact: true,
  });
}

/**
 * La lista de opciones del selector del alta.
 *
 * **Acotada a su caja a propósito**, y conviene decir por qué: un `<option>`
 * nativo tiene el rol `option` igual que los de este combobox, así que
 * `page.getByRole("option")` sin acotar devuelve además las opciones de los
 * desplegables de clase y de trámite de cada línea —medido: quince elementos en
 * esta muestra—.
 */
function opcionesDelAlta(page: Page) {
  return cajaDelAlta(page).getByRole("option");
}

/** El botón que abre la vista expandida, el del selector del alta. */
function listarTodos(page: Page) {
  return cajaDelAlta(page).getByRole("button", { name: "Listar todos" });
}

/** La vista expandida. */
function vistaExpandida(page: Page) {
  return page.locator("dialog.lista-de-servicios");
}

/** El importe en centavos, dicho como la pantalla lo escribe. */
function legible(centavos: number): string {
  const enteros = Math.floor(centavos / 100);
  const resto = String(centavos % 100).padStart(2, "0");
  const miles = enteros.toLocaleString("en-US");
  return `${miles}.${resto}`;
}

test.describe("el catálogo ofrecido son los precios con cifra", () => {
  test("el selector ofrece el editado y el preestablecido, con su monto", async ({
    page,
  }) => {
    await conLaCotizacionCargada(page);
    await page.goto(`/cotizaciones/${BORRADOR_ID}`);

    const selector = selectorDelAlta(page);
    await expect(selector).toBeVisible();
    await selector.click();

    const opciones = opcionesDelAlta(page);
    await expect(
      opciones,
      "el selector no ofrece los tres servicios con cifra. T-2 ofrecía sólo" +
        " los que el bufete había editado, y eso es lo que esta corrección" +
        " deshace: un preestablecido es la norma hasta que se edite",
    ).toHaveCount(3);

    // El preestablecido, con su cifra a la vista: es su precio.
    await expect(opciones.filter({ hasText: TRABAJO })).toContainText(
      legible(PREESTABLECIDO_DEL_TRABAJO),
    );
    // Y el editado, con el precio que el bufete decidió.
    await expect(opciones.filter({ hasText: PENSIONADO })).toContainText(
      legible(PROPIO_DEL_PENSIONADO),
    );
  });

  test("lo que no tiene ninguna cifra no se ofrece", async ({ page }) => {
    await conLaCotizacionCargada(page);
    await page.goto(`/cotizaciones/${BORRADOR_ID}`);

    await selectorDelAlta(page).click();

    // Ni el rubro —un título que la base no deja tarifar— ni la regla por
    // cuantía sin número: de ninguno de los dos hay precio que proponer, y la
    // base rechaza la línea que los nombrara.
    await expect(
      opcionesDelAlta(page).filter({ hasText: "Inmigrantes" }).filter({
        hasNotText: PENSIONADO,
      }).filter({ hasNotText: TRABAJO }),
      "el selector ofrece un rubro del acuerdo: es un encabezado sin ningún" +
        " valor, y la base rechaza la línea que lo nombrara",
    ).toHaveCount(0);
    await expect(
      opcionesDelAlta(page).filter({ hasText: SIN_CIFRA }),
      "el selector ofrece una regla por cuantía sin ningún número: no hay" +
        " nada que prellenar con ella",
    ).toHaveCount(0);
  });

  test("con el catálogo vacío el selector lo dice y ofrece la salida", async ({
    page,
  }) => {
    await conLaCotizacionCargada(page, false);
    await page.goto(`/cotizaciones/${SIN_PRECIOS_ID}`);

    const selector = selectorDelAlta(page);
    await expect(selector).toBeVisible();
    await expect(
      selector,
      "el selector quedó usable sobre un catálogo sin un solo servicio: un" +
        " campo de búsqueda que no puede encontrar nada es un control que sobra",
    ).toBeDisabled();

    const enlace = page.getByRole("link", { name: "Ir a los precios" });
    await expect(enlace).toBeVisible();
    await expect(enlace).toHaveAttribute("href", "/catalogos/precios");
  });

  test("sobre una cotización emitida no hay selector", async ({ page }) => {
    await conLaCotizacionCargada(page);
    await page.goto(`/cotizaciones/${EMITIDA_ID}`);

    // Las líneas se leen; el selector no se dibuja. En lo que ya salió no hay
    // nada que prellenar ni nada que elegir.
    await expect(page.locator(".renglon").first()).toBeVisible();
    await expect(page.locator(".selector-de-servicio")).toHaveCount(0);
  });
});

test.describe("el selector busca, y se usa con el teclado", () => {
  test("escribir filtra las opciones", async ({ page }) => {
    await conLaCotizacionCargada(page);
    await page.goto(`/cotizaciones/${BORRADOR_ID}`);

    const selector = selectorDelAlta(page);
    await selector.click();
    await expect(opcionesDelAlta(page)).toHaveCount(3);

    await selector.fill("cuantía");
    await expect(opcionesDelAlta(page)).toHaveCount(1);
    await expect(opcionesDelAlta(page).first()).toContainText(CUANTIA);
  });

  test("buscar por el rubro encuentra lo que cuelga de él", async ({ page }) => {
    await conLaCotizacionCargada(page);
    await page.goto(`/cotizaciones/${BORRADOR_ID}`);

    const selector = selectorDelAlta(page);
    await selector.click();
    // El acuerdo imprime «3. Inmigrantes» una vez y cuelga de ahí sus letras
    // sin repetir la palabra. Buscar el rubro y no encontrarlas sería buscar en
    // la mitad del nombre del servicio.
    await selector.fill("inmigrantes");

    await expect(opcionesDelAlta(page)).toHaveCount(2);
  });

  test("una búsqueda sin resultados lo dice y no deja la lista a medias", async ({
    page,
  }) => {
    await conLaCotizacionCargada(page);
    await page.goto(`/cotizaciones/${BORRADOR_ID}`);

    const selector = selectorDelAlta(page);
    await selector.click();
    await selector.fill("sociedad anónima");

    await expect(opcionesDelAlta(page)).toHaveCount(0);
    await expect(page.locator(".selector-de-servicio__vacio")).toContainText(
      "Ningún servicio coincide",
    );
  });

  /**
   * **El camino de teclado completo, y es la prueba que este control existe
   * para merecer.**
   *
   * Un `<select>` traía el teclado de regalo. Un combobox a medias —un campo de
   * texto con una lista debajo y sin flechas— deja el control inalcanzable para
   * quien no usa mouse, **sobre un campo de dinero**. Así que se mide sin un
   * solo clic: se llega tabulando, se escribe, se baja con ↓ y se elige con
   * `Enter`.
   */
  test("se llega, se busca y se elige sin tocar el mouse", async ({ page }) => {
    await conLaCotizacionCargada(page);
    await page.goto(`/cotizaciones/${BORRADOR_ID}`);

    const selector = selectorDelAlta(page);
    await expect(selector).toBeVisible();

    // El foco se pone con el teclado sobre el campo, y de ahí en adelante no se
    // vuelve a tocar el mouse.
    await selector.focus();
    await page.keyboard.type("pensionado");

    await expect(selector).toHaveAttribute("aria-expanded", "true");
    await expect(opcionesDelAlta(page)).toHaveCount(1);

    await page.keyboard.press("ArrowDown");
    // `aria-activedescendant` es lo que anuncia la opción **sin mover el
    // foco**: el foco se queda en el campo, porque ahí se sigue escribiendo.
    const activa = await selector.getAttribute("aria-activedescendant");
    expect(
      activa,
      "la flecha no dejó ninguna opción activa: sin `aria-activedescendant`" +
        " un lector de pantalla no tiene qué anunciar, y `Enter` no sabe qué" +
        " elegir",
    ).not.toBeNull();

    await page.keyboard.press("Enter");

    // Y el prellenado llegó a los campos, igual que con el mouse.
    await expect(page.getByLabel("Concepto", { exact: true })).toHaveValue(
      PENSIONADO_ROTULADO,
    );
    await expect(page.getByLabel("Importe USD", { exact: true })).toHaveValue(
      "400.00",
    );
    await expect(selector).toHaveAttribute("aria-expanded", "false");
  });

  test("Escape cierra la lista y deshace la búsqueda", async ({ page }) => {
    await conLaCotizacionCargada(page);
    await page.goto(`/cotizaciones/${BORRADOR_ID}`);

    const selector = selectorDelAlta(page);
    await selector.focus();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(selector).toHaveValue(PENSIONADO_ROTULADO);

    // Se busca otra cosa y se abandona.
    await selector.fill("cuantía");
    await page.keyboard.press("Escape");

    await expect(selector).toHaveAttribute("aria-expanded", "false");
    await expect(
      selector,
      "el campo quedó con el texto de una búsqueda abandonada encima de un" +
        " servicio que no cambió. `Escape` en un combobox es abandonar lo que" +
        " se estaba escribiendo",
    ).toHaveValue(PENSIONADO_ROTULADO);
  });

  test("vaciar el campo desvincula el servicio y deja el monto donde estaba", async ({
    page,
  }) => {
    await conLaCotizacionCargada(page);
    await page.goto(`/cotizaciones/${BORRADOR_ID}`);

    const selector = selectorDelAlta(page);
    await selector.click();
    await opcionesDelAlta(page).filter({ hasText: PENSIONADO }).click();
    await expect(selector).toHaveValue(PENSIONADO_ROTULADO);

    await selector.fill("");
    // Salir del campo es lo que confirma el gesto, igual que en la pantalla de
    // precios: el campo vacío guarda el nulo.
    await page.getByLabel("Concepto", { exact: true }).click();

    await expect(selector).toHaveValue("");
    // Lo que se quita es la procedencia, no la cifra: tirar el importe que
    // alguien ya aceptó sería perder trabajo ajeno por haber borrado un campo.
    await expect(page.getByLabel("Importe USD", { exact: true })).toHaveValue(
      "400.00",
    );
    await expect(page.getByLabel("Concepto", { exact: true })).toHaveValue(
      PENSIONADO_ROTULADO,
    );
  });

  test("una línea guardada muestra el servicio del que salió su precio", async ({
    page,
  }) => {
    await conLaCotizacionCargada(page);
    await page.goto(`/cotizaciones/${BORRADOR_ID}`);

    const suyo = page.getByRole("combobox", {
      name: "Servicio de la línea 1 de Honorarios",
    });
    await expect(suyo).toHaveValue(PENSIONADO_ROTULADO);

    // Y su importe es el de la línea —55.000 centavos— y no el del catálogo:
    // el prellenado se editó cuando se escribió, y lo que manda es lo guardado.
    await expect(
      page.getByLabel("Importe de la línea 1 de Honorarios, en USD"),
    ).toHaveValue("550.00");
  });
});

test.describe("el prellenado es una propuesta", () => {
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

    await selectorDelAlta(page).click();
    await opcionesDelAlta(page).filter({ hasText: PENSIONADO }).click();

    // El rótulo completo y no el concepto a secas: muchos renglones del acuerdo
    // tienen un concepto que es un fragmento —«primer año»,
    // «Reconsideración»— porque su encabezado está una línea más arriba, y una
    // cotización no tiene ese encabezado.
    await expect(concepto).toHaveValue(PENSIONADO_ROTULADO);
    // El valor va escrito a mano y no derivado de `montoEditable`, que es la
    // función que lo produce.
    await expect(page.getByLabel("Importe USD", { exact: true })).toHaveValue(
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
        await ruta.fulfill({
          status: 201,
          json: { lineas: LINEAS, totales: TOTALES },
        });
      },
    );

    await page.goto(`/cotizaciones/${BORRADOR_ID}`);

    await selectorDelAlta(page).click();
    await opcionesDelAlta(page).filter({ hasText: PENSIONADO }).click();

    await page.getByLabel("Clase", { exact: true }).selectOption("honorario");
    await page
      .getByLabel("Importe USD", { exact: true })
      .fill(legible(EDITADO_DEL_PENSIONADO));

    await page.getByRole("button", { name: "Añadir la línea" }).click();

    await expect.poll(() => enviado).not.toBeNull();
    expect(JSON.parse(enviado ?? "{}")).toEqual({
      clase: "honorario",
      concepto: PENSIONADO_ROTULADO,
      monto: EDITADO_DEL_PENSIONADO,
      tipoProcesoId: null,
      arancelRenglonId: PENSIONADO_ID,
    });
  });

  /**
   * **El preestablecido prellena igual**, y es la mitad de la corrección que no
   * se ve en la lista: no alcanza con ofrecerlo, tiene que servir para lo mismo.
   * «Son la norma hasta que se editen, no son una subcategoría.»
   */
  test("un servicio preestablecido prellena igual que uno editado", async ({
    page,
  }) => {
    await conLaCotizacionCargada(page);
    await page.goto(`/cotizaciones/${BORRADOR_ID}`);

    await selectorDelAlta(page).click();
    await opcionesDelAlta(page).filter({ hasText: TRABAJO }).click();

    await expect(page.getByLabel("Concepto", { exact: true })).toHaveValue(
      TRABAJO_ROTULADO,
    );
    await expect(page.getByLabel("Importe USD", { exact: true })).toHaveValue(
      "300.00",
    );
  });
});

test.describe("«Listar todos» abre la vista expandida", () => {
  test("el botón la abre con todos los servicios, por categoría", async ({
    page,
  }) => {
    await conLaCotizacionCargada(page);
    await page.goto(`/cotizaciones/${BORRADOR_ID}`);

    await expect(vistaExpandida(page)).toHaveCount(0);

    await listarTodos(page).click();

    const vista = vistaExpandida(page);
    await expect(vista).toBeVisible();
    // Las dos categorías del acuerdo que tienen algún servicio ofrecible. La
    // categoría es lo que deja recorrer con el ojo una lista de 282 renglones.
    await expect(vista).toContainText(MIGRACION);
    await expect(vista).toContainText(CIVIL);
    await expect(vista.getByRole("button", { name: /^Elegir / })).toHaveCount(3);
  });

  test("elegir en la vista expandida prellena la línea y la cierra", async ({
    page,
  }) => {
    await conLaCotizacionCargada(page);
    await page.goto(`/cotizaciones/${BORRADOR_ID}`);

    await listarTodos(page).click();

    await vistaExpandida(page)
      .getByRole("button", { name: `Elegir ${CUANTIA}` })
      .click();

    await expect(vistaExpandida(page)).toHaveCount(0);
    await expect(page.getByLabel("Concepto", { exact: true })).toHaveValue(
      CUANTIA,
    );
    /* Sin agrupar los miles, y es a propósito: lo que va dentro del campo
       tiene que poder volver a mandarse sin tocar nada, y eso es lo que
       `montoEditable` devuelve. La coma de los miles es de `montoLegible`, que
       es la otra función y la que se usa para mostrar. */
    await expect(page.getByLabel("Importe USD", { exact: true })).toHaveValue(
      "2500.00",
    );
  });

  /**
   * **Escape cierra y el foco vuelve de donde salió**, que es la mitad del
   * overlay que no se ve y la que se rompe sin que nadie lo note.
   *
   * Un modal que se cierra dejando el foco en el `<body>` deja a quien navega
   * con teclado al principio de la página: tiene que volver a recorrerla entera
   * para llegar a donde estaba. El foco vuelve **al botón que abrió la vista**,
   * que es lo que el `<dialog>` modal hace solo y lo que un overlay tiene que
   * cumplir.
   */
  test("Escape la cierra y el foco vuelve al botón que la abrió", async ({
    page,
  }) => {
    await conLaCotizacionCargada(page);
    await page.goto(`/cotizaciones/${BORRADOR_ID}`);

    await listarTodos(page).click();
    await expect(vistaExpandida(page)).toBeVisible();

    await page.keyboard.press("Escape");

    await expect(vistaExpandida(page)).toHaveCount(0);
    await expect(
      listarTodos(page),
      "el foco no volvió al botón que abrió la vista: quien navega con teclado" +
        " queda al principio de la página y tiene que recorrerla entera para" +
        " volver",
    ).toBeFocused();
  });

  test("y el botón «Cerrar» hace lo mismo", async ({ page }) => {
    await conLaCotizacionCargada(page);
    await page.goto(`/cotizaciones/${BORRADOR_ID}`);

    await listarTodos(page).click();
    await vistaExpandida(page).getByRole("button", { name: "Cerrar" }).click();

    await expect(vistaExpandida(page)).toHaveCount(0);
    await expect(listarTodos(page)).toBeFocused();
  });

  test("el buscador de la vista expandida filtra la tabla", async ({ page }) => {
    await conLaCotizacionCargada(page);
    await page.goto(`/cotizaciones/${BORRADOR_ID}`);

    await listarTodos(page).click();

    const vista = vistaExpandida(page);
    await vista
      .getByRole("searchbox", { name: "Buscar un servicio" })
      .fill("cuantía");

    await expect(vista.getByRole("button", { name: /^Elegir / })).toHaveCount(1);
    await expect(vista).toContainText(CUANTIA);
    await expect(vista).not.toContainText(PENSIONADO);
  });

  /**
   * **Lo que queda detrás es inerte**, que es la otra mitad del overlay.
   *
   * Un velo que sólo oscurece deja el foco tabulando por debajo: se llega con el
   * teclado a controles que no se ven y que no se sabe que están ahí. El
   * `<dialog>` modal lo da el navegador, y acá se mide en vez de confiarlo —es
   * exactamente lo que se pierde si alguien cambia `showModal()` por el atributo
   * `open`, que abre el diálogo **no modal** y se parece tanto a lo correcto—.
   */
  test("con la vista abierta, lo de atrás no se puede tocar", async ({
    page,
  }) => {
    await conLaCotizacionCargada(page);
    await page.goto(`/cotizaciones/${BORRADOR_ID}`);

    await listarTodos(page).click();
    await expect(vistaExpandida(page)).toBeVisible();

    const alcanzable = await page.evaluate(() => {
      const concepto = document.getElementById("linea-nueva-concepto");
      if (concepto === null) return null;
      concepto.focus();
      return document.activeElement === concepto;
    });

    expect(
      alcanzable,
      "no se encontró el campo de concepto del alta: la prueba está rota",
    ).not.toBeNull();
    expect(
      alcanzable,
      "un campo de atrás recibió el foco con la vista expandida abierta. El" +
        " diálogo dejó de ser modal: `showModal()` se cambió por el atributo" +
        " `open`, que no trae velo, ni inercia, ni `Escape`, ni foco",
    ).toBe(false);
  });
});

test.describe("la marca sutil, y sólo en la vista expandida", () => {
  test("la vista expandida marca lo editado y explica la marca", async ({
    page,
  }) => {
    await conLaCotizacionCargada(page);
    await page.goto(`/cotizaciones/${BORRADOR_ID}`);

    await listarTodos(page).click();

    const vista = vistaExpandida(page);
    const marcas = vista.locator(".lista-de-servicios__marca");

    // Dos de los tres servicios de la muestra los editó el bufete.
    await expect(
      marcas,
      "la vista expandida no distingue lo editado de lo preestablecido. El" +
        " usuario pidió «un indicativo visual si es preestablecido o editado»",
    ).toHaveCount(2);

    // La fila del preestablecido **no** la lleva.
    await expect(
      vista
        .getByRole("row")
        .filter({ hasText: TRABAJO })
        .locator(".lista-de-servicios__marca"),
    ).toHaveCount(0);

    // Y la leyenda, porque una marca sin leyenda obliga a adivinar.
    await expect(vista).toContainText("El asterisco marca los precios");
  });

  test("la marca no aparece en el selector", async ({ page }) => {
    await conLaCotizacionCargada(page);
    await page.goto(`/cotizaciones/${BORRADOR_ID}`);

    await selectorDelAlta(page).click();
    await expect(opcionesDelAlta(page)).toHaveCount(3);

    const asteriscos = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[role="option"]')).filter((opcion) =>
        (opcion.textContent ?? "").includes("*"),
      ).length,
    );

    expect(
      asteriscos,
      "una opción del selector lleva la marca de editado. El usuario lo pidió" +
        " al revés con todas las letras: ahí son todos precios y nada más, y la" +
        " marca vive en la vista expandida con su leyenda",
    ).toBe(0);
  });

  test("la marca no es un aviso ni un color de alarma", async ({ page }) => {
    await conLaCotizacionCargada(page);
    await page.goto(`/cotizaciones/${BORRADOR_ID}`);

    await listarTodos(page).click();

    // Ningún `role="alert"` dentro de la vista: la marca dice de cuál de dos
    // orígenes salió la cifra, no si está bien.
    await expect(
      vistaExpandida(page).getByRole("alert"),
      "la vista expandida anuncia algo como una alerta. Distinguir dos" +
        " orígenes es un hecho, no una advertencia",
    ).toHaveCount(0);
  });
});

test.describe("ninguna comparación con el monto del acuerdo", () => {
  /**
   * **La cuenta estructural, y es la que no se puede engañar con otro rótulo.**
   *
   * Se cuentan las cifras de dinero que cada fila de la vista expandida
   * renderiza **en sus `<td>`**. El concepto va en `<th scope="row">`, y eso no
   * es semántica por gusto: la cita del acuerdo trae importes adentro —«De
   * B/.0.01 hasta B/.3,000.00», «B/.2,000.00 más el 35%»— que tienen que verse y
   * no son el precio de la fila.
   */
  test("ninguna fila de la vista expandida dibuja dos cifras", async ({
    page,
  }) => {
    await conLaCotizacionCargada(page);
    await page.goto(`/cotizaciones/${BORRADOR_ID}`);

    await listarTodos(page).click();
    await expect(vistaExpandida(page)).toBeVisible();

    const filas = await page
      .locator("dialog.lista-de-servicios .lista-de-servicios__fila")
      .evaluateAll((todas) => {
        const FORMA = /\d[\d,]*\.\d{2}/g;

        return todas.map((fila) => ({
          servicio: (
            fila.querySelector("th")?.textContent ?? ""
          ).trim(),
          cifras: Array.from(fila.querySelectorAll("td"))
            .flatMap((celda) => (celda.textContent ?? "").match(FORMA) ?? []),
        }));
      });

    // El control de hostilidad. Sin filas, el bucle recorrería un arreglo vacío
    // y la prueba pasaría sin medir nada: eso es la prueba rota, no el defecto
    // que persigue.
    expect(
      filas.length,
      "la vista expandida no dibujó ninguna fila: esto es la prueba rota, no" +
        " una comparación que se colara",
    ).toBe(3);

    for (const fila of filas) {
      expect(
        fila.cifras.length,
        `la fila «${fila.servicio}» dibuja ${String(fila.cifras.length)}` +
          ` cifras de dinero (${fila.cifras.join(", ")}) y tiene que dibujar` +
          " una sola: su precio. Dos cifras es la comparación con el Acuerdo" +
          " No 49 de 2001 que el usuario pidió sacar del sistema",
      ).toBe(1);
    }
  });

  test("ninguna opción del selector dibuja dos cifras", async ({ page }) => {
    await conLaCotizacionCargada(page);
    await page.goto(`/cotizaciones/${BORRADOR_ID}`);

    await selectorDelAlta(page).click();
    await expect(opcionesDelAlta(page)).toHaveCount(3);

    const opciones = await page
      .locator('[role="option"]')
      .evaluateAll((todas) => {
        const FORMA = /\d[\d,]*\.\d{2}/g;

        return todas.map((opcion) => ({
          nombre: (
            opcion.querySelector(".selector-de-servicio__nombre")
              ?.textContent ?? ""
          ).trim(),
          cifras: (
            opcion.querySelector(".selector-de-servicio__importe")
              ?.textContent ?? ""
          ).match(FORMA) ?? [],
        }));
      });

    for (const opcion of opciones) {
      expect(
        opcion.cifras.length,
        `la opción «${opcion.nombre}» dibuja ${String(
          opcion.cifras.length,
        )} cifras de dinero y tiene que dibujar una sola: su precio`,
      ).toBe(1);
    }
  });

  /**
   * **El número que esta suite persigue.**
   *
   * Lo que T-2 prohibía —que el monto del acuerdo apareciera— dejó de ser la
   * regla: en un servicio sin editar, la cifra del acuerdo **es** el precio, y
   * esconderla era el error. Lo que sigue prohibido es que aparezca **al lado**
   * del precio que el bufete decidió, y eso se persigue sobre el servicio
   * editado, donde los dos números son distintos a propósito.
   */
  test("la cita de 2001 de un servicio editado no aparece en ninguna parte", async ({
    page,
  }) => {
    await conLaCotizacionCargada(page);
    await page.goto(`/cotizaciones/${BORRADOR_ID}`);

    await listarTodos(page).click();
    await expect(vistaExpandida(page)).toBeVisible();

    const todo = await page.evaluate(() => {
      const campos = Array.from(document.querySelectorAll("input")).map(
        (campo) => (campo as HTMLInputElement).value,
      );
      return `${document.body.textContent ?? ""} ${campos.join(" ")}`;
    });

    // El precio del bufete tiene que estar; la cita de 2001 del mismo
    // servicio, no. Y la cifra del preestablecido también tiene que estar: es
    // su precio.
    expect(todo).toContain(legible(PROPIO_DEL_PENSIONADO));
    expect(todo).toContain(legible(PREESTABLECIDO_DEL_TRABAJO));
    expect(
      todo.includes(legible(OFICIAL_DEL_PENSIONADO)),
      `la pantalla muestra ${legible(OFICIAL_DEL_PENSIONADO)}, que es el monto` +
        " del Acuerdo No 49 de 2001 de un servicio que el bufete ya editó." +
        " Volvió la cita al lado del precio propio",
    ).toBe(false);
  });

  test("ningún texto de la cotización mide el precio del bufete", async ({
    page,
  }) => {
    await conLaCotizacionCargada(page);
    await page.goto(`/cotizaciones/${BORRADOR_ID}`);

    await listarTodos(page).click();
    await expect(vistaExpandida(page)).toBeVisible();

    const texto = (await vistaExpandida(page).textContent())?.toLowerCase();
    expect(texto, "la vista no llegó a dibujarse: esto es la prueba rota")
      .toBeTruthy();

    // «sugerido» entra en la lista: es la palabra que el usuario sacó del
    // vocabulario de la cotización —«son la norma hasta que se editen, no son
    // una subcategoría»—.
    for (const palabra of [
      "mínim",
      "oficial",
      "debajo",
      "acuerdo",
      "arancel",
      "sugerid",
    ]) {
      expect(
        texto?.includes(palabra),
        `la vista expandida dice «${palabra}»: eso vuelve a poner la vara con` +
          " la que el sistema mide una decisión que ya tomó el abogado, o" +
          " convierte el preestablecido en una subcategoría. El lugar de esas" +
          " palabras es la tabla del arancel",
      ).toBe(false);
    }
  });
});

test.describe("los cinco controles de una línea tienen rótulo a la vista", () => {
  /**
   * **La corrección del usuario, medida en el dibujo y no en el árbol de
   * accesibilidad.**
   *
   * > «Y aquí los distintos inputs deben tener un label: no me queda claro qué
   * > hace cada uno.»
   *
   * Los `aria-label` que ya existían **no** alcanzan, y por eso esta prueba no
   * los mira: una persona que ve una fila de cuatro desplegables no recibe nada
   * de un atributo. Lo que se mide es que cada control tenga un `<label>` que lo
   * nombre **y que ese rótulo esté visible**.
   */
  test("cada control de una línea guardada tiene su rótulo visible", async ({
    page,
  }) => {
    await conLaCotizacionCargada(page);
    await page.goto(`/cotizaciones/${BORRADOR_ID}`);

    await expect(page.locator(".renglon form").first()).toBeVisible();

    const rotulos = await page
      .locator(".renglon form")
      .first()
      .evaluate((fila) => {
        const controles = Array.from(
          fila.querySelectorAll("input, select"),
        ) as HTMLInputElement[];

        return controles.map((control) => {
          const etiqueta =
            control.labels === null || control.labels.length === 0
              ? null
              : control.labels[0];
          const caja = etiqueta?.getBoundingClientRect();

          return {
            nombre: control.getAttribute("aria-label") ?? control.id,
            rotulo: etiqueta?.textContent?.trim() ?? null,
            visible:
              caja !== undefined && caja.width > 0 && caja.height > 0,
          };
        });
      });

    expect(
      rotulos.length,
      "no se encontraron los cinco controles de la línea: la prueba está rota",
    ).toBe(5);

    for (const control of rotulos) {
      expect(
        control.rotulo,
        `el control «${control.nombre}» no tiene ningún rótulo a la vista. Una` +
          " fila de cuatro desplegables sin rótulo no se entiende, y un" +
          " `aria-label` no se lo dice a quien mira",
      ).toBeTruthy();
      expect(
        control.visible,
        `el rótulo del control «${control.nombre}» existe pero no se ve`,
      ).toBe(true);
    }

    // Y los rótulos son los cinco que el registro declara, en el orden en que
    // se piensa la línea.
    expect(rotulos.map((control) => control.rotulo)).toEqual([
      "Concepto",
      "Clase",
      "Importe USD",
      "Trámite opcional",
      "Servicio opcional",
    ]);
  });
});

test.describe("el criterio responsivo de §9 con el selector puesto", () => {
  test("el detalle con el selector no scrollea en horizontal", async ({
    page,
  }) => {
    await conLaCotizacionCargada(page);

    for (const ancho of ANCHOS) {
      await page.setViewportSize({ width: ancho, height: ALTO });
      await page.goto(`/cotizaciones/${BORRADOR_ID}`);
      await expect(selectorDelAlta(page)).toBeVisible();

      const desborde = await medirDesborde(page);
      expect(
        desborde.scrollWidth,
        porQueSeSale(ancho, desborde),
      ).toBeLessThanOrEqual(desborde.clientWidth);
    }
  });

  test("tampoco scrollea con la lista de opciones abierta", async ({ page }) => {
    await conLaCotizacionCargada(page);

    // La lista flota con `position: absolute`, que es justamente la forma de
    // desbordar sin que ninguna de las pruebas de arriba lo note.
    for (const ancho of [320, 768, 1920] as const) {
      await page.setViewportSize({ width: ancho, height: ALTO });
      await page.goto(`/cotizaciones/${BORRADOR_ID}`);
      await selectorDelAlta(page).click();
      await expect(opcionesDelAlta(page).first()).toBeVisible();

      const desborde = await medirDesborde(page);
      expect(
        desborde.scrollWidth,
        porQueSeSale(ancho, desborde),
      ).toBeLessThanOrEqual(desborde.clientWidth);
    }
  });

  test("tampoco con la vista expandida abierta", async ({ page }) => {
    await conLaCotizacionCargada(page);

    for (const ancho of [320, 768, 1920] as const) {
      await page.setViewportSize({ width: ancho, height: ALTO });
      await page.goto(`/cotizaciones/${BORRADOR_ID}`);
      await listarTodos(page).click();
      await expect(vistaExpandida(page)).toBeVisible();

      const desborde = await medirDesborde(page);
      expect(
        desborde.scrollWidth,
        porQueSeSale(ancho, desborde),
      ).toBeLessThanOrEqual(desborde.clientWidth);
    }
  });

  /**
   * En un hueco angosto, los cinco controles van **en una sola columna**.
   *
   * Y se mide como posición relativa dentro del hueco de la sección, no como una
   * coordenada: lo que decide cuántas pistas entran es el ancho real que la
   * sección tiene, no el de la ventana.
   */
  test("en un hueco angosto los controles se apilan en una columna", async ({
    page,
  }) => {
    await conLaCotizacionCargada(page);

    await page.setViewportSize({ width: 360, height: ALTO });
    await page.goto(`/cotizaciones/${BORRADOR_ID}`);
    await expect(selectorDelAlta(page)).toBeVisible();

    const pistas = await page.evaluate(() => {
      const rejilla = document.querySelector(".seccion-de-lineas .rejilla");
      if (rejilla === null) return null;
      return window
        .getComputedStyle(rejilla)
        .gridTemplateColumns.split(" ")
        .filter((pista) => pista !== "").length;
    });

    expect(pistas, "no se encontró ninguna rejilla: la prueba está rota")
      .not.toBeNull();
    expect(
      pistas,
      "a 360px los controles de una línea quedaron en dos columnas. Con los" +
        " rótulos puestos, dos pistas de doscientos píxeles son dos columnas de" +
        " cuatro renglones cada una",
    ).toBe(1);
  });
});
