/**
 * La salida imprimible, en el navegador
 * (`odd/tasks/cotizaciones.md`, T-6).
 *
 * Tres cosas que sólo se pueden comprobar acá y en ningún otro lado:
 *
 *  1. **Que lo que se dibuja sale del documento congelado y no de las
 *     tablas vivas.** `impresion.ts` lo garantiza por tipo, pero el tipo no
 *     dice de dónde salió el objeto: eso lo decide el cableado del
 *     componente, y el cableado se ve acá.
 *  2. **Que la hoja de impresión haga lo que dice.** `emulateMedia` deja
 *     preguntarle al navegador qué se ve con `@media print` puesto, que es
 *     la única forma de afirmarlo sin mirar una hoja de papel.
 *  3. El criterio responsivo de §9 sobre la pantalla nueva.
 *
 * **Las respuestas de la API van interceptadas**, igual que en
 * `e2e/cotizaciones.spec.ts`: `vite dev` corre sin identidad de Access, así
 * que la API real contesta 403 y la pantalla se dibujaría como un aviso de
 * error.
 *
 * ## Lo que esta suite NO prueba, y dónde se prueba
 *
 * Que el documento guardado **sea** el snapshot y no una relectura de las
 * tablas vivas lo prueba `test/documento-api.spec.ts` contra una base de
 * verdad, moviendo el nombre del cliente después de emitir. Acá los dos
 * lados son dobles, así que lo que se mide es otra cosa: **cuál de los dos
 * consume la pantalla**. Por eso los dobles de esta suite dicen cosas
 * **distintas** entre sí —un doble que devolviera lo mismo en las dos
 * direcciones no separaría nada, que es la segunda lección de prueba de
 * esta tajada—.
 */
import { expect, test, type Page } from "@playwright/test";

import { medirDesborde, porQueSeSale } from "./desborde";

const EMITIDA_ID = "7b2c4d6e-1f30-4a52-9c84-5d7e0b1a3f62";
const BORRADOR_ID = "7b2c4d6e-1f30-4a52-9c84-5d7e0b1a3f63";

/* ==========================================================================
   Los dos juegos de datos, que dicen cosas distintas a propósito

   Lo congelado es de marzo; lo vivo es de hoy. Ninguna cadena de un lado
   aparece en el otro, y ninguna es prefijo de la otra: un par que comparta
   principio deja pasar una aserción floja.
   ========================================================================== */

const CLIENTE_CONGELADO = "Constructora del Istmo, S.A.";
const CLIENTE_DE_HOY = "Grupo Patria Holdings";

const PROSA_CONGELADA = "Tramitación completa de la visa de trabajo.";
const PROSA_DE_HOY = "Ya no hacemos visas, ahora hacemos sociedades.";

const CONCEPTO_CONGELADO = "Honorario profesional por la visa";
const CONCEPTO_DE_HOY = "Honorario reajustado del semestre";

const TRAMITE_CONGELADO = "Visa de trabajo";
const EMISOR = "Itzel Araúz";

/** El documento congelado que devuelve `GET /documento`. */
const DOCUMENTO = {
  version: 1,
  emitidaEn: "2026-03-18T14:03:00.000Z",
  emitidaPor: { id: "u1", nombre: EMISOR },
  cotizacion: {
    id: EMITIDA_ID,
    codigo: "COT-2026-0008",
    fecha: "2026-03-02T09:00:00.000Z",
    venceEn: "2026-04-30",
    moneda: "USD",
  },
  cliente: {
    id: "cl1",
    nombre: CLIENTE_CONGELADO,
    tipo: "Persona jurídica",
    documentoTipo: "RUC",
    documentoNumero: "155123456-2-2024",
    representanteLegal: "Ana Pérez",
    email: "contacto@istmo.test",
    telefono: "+507 6000-0000",
  },
  modulos: [
    { tipo: "alcance", rotulo: "Alcance", contenido: PROSA_CONGELADA },
    {
      tipo: "exclusiones",
      rotulo: "Exclusiones",
      contenido: "No incluye apelaciones ni recursos.",
    },
  ],
  lineas: [
    {
      clase: "honorario",
      rotulo: "Honorarios",
      concepto: CONCEPTO_CONGELADO,
      monto: 150_000,
      tipoProcesoId: "tp1",
      tipoProceso: TRAMITE_CONGELADO,
    },
    {
      clase: "gasto_estimado",
      rotulo: "Gastos estimados",
      concepto: "Tasas de migración",
      monto: 7_550,
      tipoProcesoId: null,
      tipoProceso: null,
    },
    {
      clase: "honorario",
      rotulo: "Honorarios",
      concepto: "Acompañamiento en cita",
      monto: 12_345,
      tipoProcesoId: null,
      tipoProceso: null,
    },
  ],
  /* 162 345 + 7 550 = 169 895. Van escritos y no derivados: el documento
     los trae congelados y la pantalla no suma. */
  totales: { honorarios: 162_345, gastosEstimados: 7_550, total: 169_895 },
};

/** La cotización **viva**, que dice otra cosa que el documento. */
const COTIZACION_VIVA = {
  id: EMITIDA_ID,
  codigo: "COT-2026-0008",
  estado: "emitida",
  clienteId: "cl1",
  clienteNombre: CLIENTE_DE_HOY,
  fecha: "2026-03-02T09:00:00.000Z",
  venceEn: "2026-04-30",
  moneda: "USD",
  duplicadaDeId: null,
  creadaPor: "u1",
  creadaPorNombre: EMISOR,
  creadaEn: "2026-03-02T09:00:00.000Z",
};

const BORRADOR_VIVO = {
  ...COTIZACION_VIVA,
  id: BORRADOR_ID,
  codigo: "COT-2026-0011",
  estado: "borrador",
};

/** Los módulos **vivos**, que dicen otra cosa que los congelados. */
const MODULOS_VIVOS = {
  modulos: [
    { id: "m1", tipo: "alcance", orden: 0, contenido: PROSA_DE_HOY },
  ],
};

/** Las líneas **vivas**, con otro concepto y otros totales. */
const LINEAS_VIVAS = {
  lineas: [
    {
      id: "l1",
      clase: "honorario",
      concepto: CONCEPTO_DE_HOY,
      monto: 999_999,
      tipoProcesoId: null,
      tipoProcesoNombre: null,
      orden: 0,
    },
  ],
  totales: { honorarios: 999_999, gastosEstimados: 0, total: 999_999 },
};

const BITACORA = { entradas: [], hayMas: false };

/**
 * Interceptar toda la API, y **anotar cada pedido**.
 *
 * El registro de pedidos es lo que deja afirmar un «nunca» sin caer en la
 * primera lección de prueba de esta tajada: una aserción que reintenta
 * tolera la ventana transitoria que se quiere prohibir, y `.count()` lee un
 * instante. Un registro de peticiones, en cambio, **sólo crece**: si la
 * pantalla pidió las tablas vivas aunque sea una vez y en cualquier momento,
 * queda ahí y no se borra.
 */
async function conLaApiInterceptada(page: Page): Promise<string[]> {
  const pedidos: string[] = [];

  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    async (ruta) => {
      const url = new URL(ruta.request().url());
      pedidos.push(url.pathname);

      if (url.pathname === `/api/cotizaciones/${EMITIDA_ID}/documento`) {
        await ruta.fulfill({ status: 200, json: { documento: DOCUMENTO } });
        return;
      }

      if (url.pathname === `/api/cotizaciones/${BORRADOR_ID}/documento`) {
        await ruta.fulfill({
          status: 409,
          json: { error: "cotizacion_sin_documento" },
        });
        return;
      }

      if (url.pathname === `/api/cotizaciones/${EMITIDA_ID}`) {
        await ruta.fulfill({ status: 200, json: { cotizacion: COTIZACION_VIVA } });
        return;
      }

      if (url.pathname === `/api/cotizaciones/${BORRADOR_ID}`) {
        await ruta.fulfill({ status: 200, json: { cotizacion: BORRADOR_VIVO } });
        return;
      }

      if (url.pathname.endsWith("/modulos")) {
        await ruta.fulfill({ status: 200, json: MODULOS_VIVOS });
        return;
      }

      if (url.pathname.endsWith("/lineas")) {
        await ruta.fulfill({ status: 200, json: LINEAS_VIVAS });
        return;
      }

      if (url.pathname.endsWith("/bitacora")) {
        await ruta.fulfill({ status: 200, json: BITACORA });
        return;
      }

      await ruta.fulfill({ status: 404, json: { error: "not_found" } });
    },
  );

  return pedidos;
}

/** La hoja, esperada hasta que el documento está dibujado. */
async function abrirLaHoja(page: Page, id = EMITIDA_ID): Promise<void> {
  await page.goto(`/cotizaciones/${id}/hoja`);

  // El ancla positiva. Sin esperar a que el documento exista, todo lo que
  // sigue mediría una pantalla a medio montar: el «nunca» de más abajo
  // pasaría porque todavía no se dibujó nada, que es la forma más cara de
  // que una prueba mienta.
  await expect(
    page.getByRole("article", { name: "Documento de la cotización" }),
    "la hoja no llegó a dibujarse: esto es la prueba rota, no un defecto",
  ).toBeVisible();
}

/* ==========================================================================
   Lo único que no se negocia
   ========================================================================== */

test.describe("la hoja imprime el documento congelado", () => {
  test("muestra lo que se congeló y no lo que dicen las tablas vivas", async ({
    page,
  }) => {
    await conLaApiInterceptada(page);
    await abrirLaHoja(page);

    const hoja = page.getByRole("article", {
      name: "Documento de la cotización",
    });

    // Lo congelado, que es lo que el cliente leyó en marzo.
    await expect(hoja).toContainText(CLIENTE_CONGELADO);
    await expect(hoja).toContainText(PROSA_CONGELADA);
    await expect(hoja).toContainText(CONCEPTO_CONGELADO);
    await expect(hoja).toContainText(TRAMITE_CONGELADO);

    /*
     * Y lo vivo, **nunca**. Con `.count()` y no con `toHaveCount(0)`: la
     * segunda reintenta, y una aserción que reintenta tolera justamente la
     * ventana transitoria que se quiere prohibir. Acá ya se esperó al ancla
     * positiva, así que este conteo lee el instante en que la hoja está
     * entera.
     */
    for (const vivo of [CLIENTE_DE_HOY, PROSA_DE_HOY, CONCEPTO_DE_HOY]) {
      expect(
        await page.getByText(vivo, { exact: false }).count(),
        `«${vivo}» es de las tablas vivas y la hoja lo está dibujando`,
      ).toBe(0);
    }
  });

  test("ni siquiera le pregunta a las tablas vivas", async ({ page }) => {
    /*
     * La forma fuerte de la prueba de arriba.
     *
     * Aquélla mide lo que se dibuja; ésta mide lo que se pide. Una hoja que
     * leyera `/modulos` y `/lineas` «por si acaso» y dibujara igual el
     * documento pasaría la primera y fallaría ésta, y con razón: tener los
     * datos vivos a mano adentro del componente es la antesala de dibujar
     * uno de ellos.
     *
     * El registro de peticiones **sólo crece**, así que esto no es una foto
     * del instante: es todo lo que pasó desde el `goto`.
     */
    const pedidos = await conLaApiInterceptada(page);
    await abrirLaHoja(page);

    /*
     * Las direcciones **distintas**, y no la cuenta de pedidos.
     *
     * `main.tsx` monta la aplicación dentro de `StrictMode`, y en
     * desarrollo eso monta, desmonta y vuelve a montar cada componente:
     * el efecto corre dos veces y el documento se pide dos veces. Es de la
     * compilación de desarrollo y no del componente —en producción el
     * doble montaje no existe—, así que contar pedidos mediría a React.
     *
     * Lo que esta prueba afirma no es cuántas veces se pidió sino **qué**
     * se pidió, y de eso el conjunto no pierde nada: una lectura a
     * `/modulos` aparecería igual aunque ocurriera una sola vez.
     */
    const deEstaCotizacion = [
      ...new Set(
        pedidos.filter((ruta) =>
          ruta.startsWith(`/api/cotizaciones/${EMITIDA_ID}`),
        ),
      ),
    ];

    expect(
      deEstaCotizacion,
      "la hoja pidió algo más que el documento congelado",
    ).toEqual([`/api/cotizaciones/${EMITIDA_ID}/documento`]);
  });

  test("tampoco le pregunta al catálogo de plantillas cómo se llama un módulo", async ({
    page,
  }) => {
    /*
     * **La prueba de T-3 sobre la hoja** (`odd/tasks/plantillas-de-modulo.md`).
     *
     * Desde T-3 el rótulo de un módulo sale de `modulo_plantilla`, que el
     * abogado edita cuando quiera, y el editor de la cotización lo pide por
     * `GET /api/plantillas-modulo`. La hoja **no**, y la ausencia de ese
     * pedido es toda la diferencia entre lo vivo y lo emitido: el encabezado
     * que el cliente leyó está adentro del documento congelado, y preguntarle
     * al catálogo de hoy sería imprimir el nombre de hoy sobre el papel de
     * marzo.
     *
     * Va aparte de la prueba de arriba y no como una línea más: aquélla filtra
     * por el prefijo de esta cotización, así que una lectura del catálogo
     * —que cuelga de otra dirección— le pasaría por al lado sin que nada se
     * ponga rojo.
     */
    const pedidos = await conLaApiInterceptada(page);
    await abrirLaHoja(page);

    expect(
      pedidos.filter((ruta) => ruta.startsWith("/api/plantillas-modulo")),
      "la hoja fue a buscar el rótulo de hoy en vez de usar el congelado",
    ).toEqual([]);
  });

  test("los totales son los del documento y no los de las líneas vivas", async ({
    page,
  }) => {
    // Los dos juegos difieren: el documento dice 169 895 centavos y las
    // líneas vivas dicen 999 999. Si la hoja sumara, o si leyera la otra
    // dirección, el número sería otro.
    await conLaApiInterceptada(page);
    await abrirLaHoja(page);

    const hoja = page.getByRole("article", {
      name: "Documento de la cotización",
    });

    await expect(hoja).toContainText("1,698.95");
    expect(await page.getByText("9,999.99").count()).toBe(0);
  });

  /**
   * **El ITBMS en el papel** (T-12), y lo que esta prueba puede afirmar.
   *
   * El interruptor del Worker no se mueve desde acá —un solo servidor de Vite
   * para la corrida entera—, así que lo que se mide es la regla de la hoja:
   * un documento congelado **con** `itbms` dibuja su renglón, y uno **sin**
   * la clave no dibuja ninguno. Las dos mitades, sobre el mismo documento.
   *
   * Que el documento emitido sin impuesto siga sin impuesto cuando el
   * interruptor se enciende está medido donde se puede medir de verdad:
   * `test/impuesto-api.spec.ts`, contra D1 y moviendo el entorno entre las
   * dos lecturas.
   */
  test("el ITBMS se imprime sólo si el documento congelado lo trae", async ({
    page,
  }) => {
    await conLaApiInterceptada(page);
    await abrirLaHoja(page);

    const hoja = page.getByRole("article", {
      name: "Documento de la cotización",
    });

    /* --- Sin la clave: ningún renglón, y el total sí está. --- */

    await expect(
      page.locator(".hoja__impuesto"),
      "el papel imprimió un ITBMS que el documento no congeló",
    ).toHaveCount(0);
    await expect(hoja).toContainText("1,698.95");

    /* --- Con la clave: el mismo documento más el impuesto. ---

       11 364 centavos sobre 162 345 de honorarios, y el total pasa de
       169 895 a 181 259. Escritos a mano. */
    await page.route(
      (url) =>
        url.pathname === `/api/cotizaciones/${EMITIDA_ID}/documento`,
      async (ruta) => {
        await ruta.fulfill({
          status: 200,
          json: {
            documento: {
              ...DOCUMENTO,
              totales: {
                ...DOCUMENTO.totales,
                itbms: 11_364,
                total: 181_259,
              },
            },
          },
        });
      },
    );
    await page.reload();

    const impuesto = page.locator(".hoja__impuesto");
    await expect(impuesto).toHaveCount(1);
    await expect(impuesto).toContainText("ITBMS");
    await expect(impuesto.locator(".hoja__importe")).toHaveText("USD 113.64");
    await expect(
      page.locator(".hoja__total .hoja__importe"),
    ).toHaveText("USD 1,812.59");
  });

  test("el título de la pestaña lleva el código, que nombra el PDF", async ({
    page,
  }) => {
    await conLaApiInterceptada(page);
    await abrirLaHoja(page);

    await expect(page).toHaveTitle(/COT-2026-0008/);
  });

  test("el gasto va rotulado como aproximado", async ({ page }) => {
    // Un presupuesto de gasto que se lee como un precio cerrado es una
    // promesa que el bufete no puede cumplir.
    await conLaApiInterceptada(page);
    await abrirLaHoja(page);

    const hoja = page.getByRole("article", {
      name: "Documento de la cotización",
    });

    await expect(hoja).toContainText("Subtotal aproximado");
    await expect(hoja).toContainText("aproximada");
  });
});

/* ==========================================================================
   La hoja de impresión
   ========================================================================== */

test.describe("la hoja de impresión", () => {
  test("con `@media print` la navegación desaparece y el documento queda", async ({
    page,
  }) => {
    await conLaApiInterceptada(page);
    await abrirLaHoja(page);

    const navegacion = page.locator(".esqueleto__navegacion");
    const hoja = page.getByRole("article", {
      name: "Documento de la cotización",
    });

    // El contrapeso va **primero**: en pantalla el menú se ve. Sin esta
    // mitad, una hoja de estilos que escondiera la navegación siempre
    // pasaría la aserción de abajo sin que nadie lo note, y la aplicación
    // quedaría sin menú.
    await expect(navegacion).toBeVisible();

    await page.emulateMedia({ media: "print" });

    await expect(navegacion).toBeHidden();
    await expect(hoja).toBeVisible();
  });

  test("los controles tampoco se imprimen", async ({ page }) => {
    await conLaApiInterceptada(page);
    await abrirLaHoja(page);

    const controles = page.getByRole("button", { name: "Imprimir" });
    await expect(controles).toBeVisible();

    await page.emulateMedia({ media: "print" });
    await expect(controles).toBeHidden();
  });

  test("y vuelven cuando se deja de imprimir", async ({ page }) => {
    // La vuelta: una regla escrita fuera del `@media print` escondería los
    // controles para siempre y dejaría la pantalla sin forma de imprimir.
    await conLaApiInterceptada(page);
    await abrirLaHoja(page);

    await page.emulateMedia({ media: "print" });
    await page.emulateMedia({ media: "screen" });

    await expect(page.getByRole("button", { name: "Imprimir" })).toBeVisible();
    await expect(page.locator(".esqueleto__navegacion")).toBeVisible();
  });

  test("una línea de importe no se parte entre dos páginas", async ({
    page,
  }) => {
    /*
     * Lo que sí se puede medir de la paginación.
     *
     * `emulateMedia` emula la **consulta de medios**, no la paginación: no
     * hay páginas que contar ni saltos que observar. Lo que sí queda
     * observable es el estilo calculado que los produce, y es el que
     * importa — una fila de importe partida al medio deja el concepto en
     * una hoja y la cifra en la siguiente.
     *
     * Se lee el valor calculado y no el texto de la hoja de estilos: una
     * regla escrita en el archivo pero anulada por otra más específica no
     * llega al elemento, y comparar cadenas de CSS no se enteraría.
     */
    await conLaApiInterceptada(page);
    await abrirLaHoja(page);
    await page.emulateMedia({ media: "print" });

    const corte = await page
      .locator(".hoja__linea")
      .first()
      .evaluate((nodo) => getComputedStyle(nodo).breakInside);

    expect(corte).toBe("avoid");
  });

  test("el documento no se imprime sobre un fondo de color", async ({
    page,
  }) => {
    /*
     * Lo que se puede medir de «colores que sobrevivan al blanco y negro».
     *
     * No se puede medir que el papel se lea bien: eso es tinta. Lo que sí
     * se mide es la causa más común de que no se lea — un fondo de color
     * que la impresora o bien no imprime (y deja el texto claro sobre
     * blanco) o bien convierte a un gris que se come el texto. Bajo
     * `@media print` el cuerpo de la hoja va sin fondo.
     */
    await conLaApiInterceptada(page);
    await abrirLaHoja(page);
    await page.emulateMedia({ media: "print" });

    const fondo = await page
      .getByRole("article", { name: "Documento de la cotización" })
      .evaluate((nodo) => getComputedStyle(nodo).backgroundColor);

    // `rgba(0, 0, 0, 0)` es transparente; blanco puro también sirve.
    expect(["rgba(0, 0, 0, 0)", "rgb(255, 255, 255)"]).toContain(fondo);
  });

  test("la marca de lo aproximado es texto y no sólo un color", async ({
    page,
  }) => {
    // Lo que de verdad protege al documento en blanco y negro: que ninguna
    // distinción dependa del color. El gasto se distingue por lo que dice,
    // no por cómo se ve.
    await conLaApiInterceptada(page);
    await abrirLaHoja(page);
    await page.emulateMedia({ media: "print" });

    const hoja = page.getByRole("article", {
      name: "Documento de la cotización",
    });

    await expect(hoja).toContainText("Gastos estimados");
    await expect(hoja).toContainText("Subtotal aproximado");
  });
});

/* ==========================================================================
   El borrador
   ========================================================================== */

test.describe("un borrador no tiene hoja", () => {
  test("la hoja de un borrador explica qué falta, y no dibuja un documento", async ({
    page,
  }) => {
    await conLaApiInterceptada(page);
    await page.goto(`/cotizaciones/${BORRADOR_ID}/hoja`);

    await expect(page.getByText("todavía no tiene documento")).toBeVisible();

    // Y no hay documento dibujado. El conteo lee el instante, después de
    // que el aviso ya está: sin el ancla de arriba esto pasaría por una
    // pantalla todavía vacía.
    expect(
      await page
        .getByRole("article", { name: "Documento de la cotización" })
        .count(),
    ).toBe(0);
  });

  test("y no se lee como «esa cotización no existe»", async ({ page }) => {
    // El 409 trae su propio motivo justamente para esto: con un 404 el
    // texto compartido diría «No existe esa cotización, o no es de este
    // bufete» sobre un borrador propio que se está mirando.
    await conLaApiInterceptada(page);
    await page.goto(`/cotizaciones/${BORRADOR_ID}/hoja`);

    await expect(page.getByText("todavía no tiene documento")).toBeVisible();
    expect(await page.getByText("no es de este bufete").count()).toBe(0);
    expect(await page.getByText("hay datos que dependen").count()).toBe(0);
  });

  test("el detalle de un borrador no ofrece la hoja", async ({ page }) => {
    // Un control que existe es una promesa: un enlace a imprimir sobre un
    // borrador lleva a un aviso, que es la lección de la unidad B de T-2.
    await conLaApiInterceptada(page);
    await page.goto(`/cotizaciones/${BORRADOR_ID}`);

    await expect(
      page.getByRole("heading", { name: "COT-2026-0011" }),
    ).toBeVisible();

    expect(await page.getByRole("link", { name: /hoja/i }).count()).toBe(0);
  });

  test("el detalle de una emitida sí la ofrece", async ({ page }) => {
    // El contrapeso: sin esto, un detalle que nunca dibujara el enlace
    // pasaría la prueba de arriba y la hoja quedaría inalcanzable salvo
    // escribiendo la URL.
    await conLaApiInterceptada(page);
    await page.goto(`/cotizaciones/${EMITIDA_ID}`);

    const enlace = page.getByRole("link", { name: "Ver la hoja" });
    await expect(enlace).toBeVisible();

    await enlace.click();
    await expect(
      page.getByRole("article", { name: "Documento de la cotización" }),
    ).toBeVisible();
  });
});

/* ==========================================================================
   El criterio responsivo de §9
   ========================================================================== */

const ANCHOS = [320, 360, 414, 767, 768, 1024, 1280, 1920, 2560] as const;

test.describe("la hoja no scrollea en horizontal", () => {
  for (const ancho of ANCHOS) {
    test(`a ${String(ancho)}px de ancho`, async ({ page }) => {
      await conLaApiInterceptada(page);
      await page.setViewportSize({ width: ancho, height: 900 });
      await abrirLaHoja(page);

      const desborde = await medirDesborde(page);
      expect(desborde.scrollWidth, porQueSeSale(ancho, desborde)).toBeLessThanOrEqual(
        desborde.clientWidth,
      );
    });
  }
});
