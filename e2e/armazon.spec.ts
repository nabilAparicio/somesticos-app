/**
 * El armazón se comporta como una aplicación y no como un documento.
 *
 * Los cuatro reclamos que abrieron esta tajada —no está centrado, el lateral
 * no colapsa, el encabezado y el lateral scrollean con la página— son el
 * mismo defecto: `src/layout/Esqueleto.tsx` estaba en flujo de página de
 * punta a punta. Lo que esta suite sostiene es la forma nueva: el armazón
 * mide la ventana, el scroll se mueve hacia adentro, y el lateral es columna
 * en ancho y cajón con velo en angosto.
 *
 * ## Por qué de punta a punta y no en `test/`
 *
 * Porque **no hay nada que afirmar sin dibujar**. Lo que T-1 y T-2 cambian
 * es geometría: quién scrollea, quién se queda quieto, cuánto ancho gana el
 * contenido cuando la columna se va, si el cajón tapa o empuja. Una unitaria
 * sobre `Esqueleto.tsx` solo podría afirmar que tal clase está puesta, que
 * es exactamente la clase de prueba que pasa en verde mientras el layout
 * está roto: la clase existe y la regla CSS que la hacía funcionar no. Acá
 * se mide con `boundingBox`, `toBeVisible` y `toBeInViewport`, o sea con lo
 * que la persona ve.
 *
 * ## Los controles de hostilidad
 *
 * Tres de estas pruebas pasarían vacuamente y por eso llevan un contrapeso
 * escrito antes de la aserción que importa:
 *
 *  - el centrado se mide en una ventana **más ancha que el tope**, porque un
 *    armazón que llena la ventana está «centrado» por casualidad;
 *  - el scroll se mide en una pantalla que **de verdad desborda** la región
 *    de contenido, porque dos `boundingBox` iguales también significan «no
 *    pasó nada»;
 *  - el velo se comprueba **visible en angosto y ausente en ancho**, porque
 *    un velo que no existe nunca también «no tapa» la tabla.
 *
 * El tope del armazón se lee del documento y no se escribe acá: la fuente es
 * `--tope-armazon` en `src/estilos/tokens.css`, y una prueba con el número
 * copiado empieza a mentir el día que el token cambia.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";

import { medirDesborde, porQueSeSale } from "./desborde";

/**
 * Las dos ventanas de esta suite, una a cada lado del único punto de cambio
 * del armazón (`--umbral-lateral: 48rem`, o sea 768px).
 *
 * La ancha es deliberadamente mucho más ancha que `--tope-armazon`: es la
 * única forma de que el centrado sea observable.
 */
const ANCHA = { width: 1920, height: 900 } as const;
const ANGOSTA = { width: 390, height: 844 } as const;

/**
 * La pantalla con la que se mide el scroll: la misma que usa el criterio
 * responsivo de T-4, y por la misma razón: junta a propósito el contenido
 * que un layout mal hecho no soporta, y es alta de verdad.
 */
const BANCO = "/banco-de-pruebas";

function armazon(page: Page): Locator {
  return page.locator(".esqueleto");
}

function encabezado(page: Page): Locator {
  return page.locator(".esqueleto__encabezado");
}

function lateral(page: Page): Locator {
  return page.locator(".esqueleto__navegacion");
}

function contenido(page: Page): Locator {
  return page.locator(".esqueleto__contenido");
}

function velo(page: Page): Locator {
  return page.locator(".esqueleto__velo");
}

/**
 * El botón que alterna el lateral, pedido por su nombre accesible.
 *
 * `exact: true` no es higiene: el velo también es un botón y se llama
 * «Cerrar las secciones», así que sin la coincidencia exacta este localizador
 * devuelve los dos y la prueba falla por modo estricto en vez de medir algo.
 */
function alternar(page: Page): Locator {
  return page.getByRole("button", { name: "Secciones", exact: true });
}

/**
 * La caja de un elemento, o una falla que dice «la prueba está rota».
 *
 * `boundingBox()` devuelve `null` cuando el elemento no se dibuja, y un
 * `null` propagado adentro de una aritmética da `NaN`: la aserción falla con
 * un mensaje sobre números y no sobre el elemento que no estaba.
 */
async function cajaDe(
  elemento: Locator,
  queEs: string,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const caja = await elemento.boundingBox();
  if (caja === null) {
    throw new Error(
      `la prueba está rota: ${queEs} no tiene caja medible (no se dibujó)`,
    );
  }
  return caja;
}

/** `--tope-armazon` en píxeles, leído del documento vivo. */
async function topeDelArmazon(page: Page): Promise<number> {
  return page.evaluate(() => {
    const raiz = getComputedStyle(document.documentElement);
    const enRem = Number.parseFloat(
      raiz.getPropertyValue("--tope-armazon").trim(),
    );
    return enRem * Number.parseFloat(raiz.fontSize);
  });
}

test.describe("el armazón centrado y quieto (T-1)", () => {
  test("en un monitor ancho el armazón queda centrado y no pegado a un borde", async ({
    page,
  }) => {
    await page.setViewportSize(ANCHA);
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);

    const tope = await topeDelArmazon(page);

    // Los dos contrapesos. Sin el primero, un token que no llegó al
    // documento dejaría la prueba midiendo el ancho de la ventana; sin el
    // segundo, la medición se haría en una ventana donde el armazón llena
    // todo y los dos huecos valen cero por razones que no son el centrado.
    expect(
      tope,
      "`--tope-armazon` no llegó al documento: esto es la prueba rota, no un" +
        " armazón descentrado",
    ).toBeGreaterThan(0);
    expect(
      ANCHA.width,
      "la ventana de esta prueba tiene que ser bastante más ancha que" +
        " `--tope-armazon` o el centrado no es observable",
    ).toBeGreaterThan(tope + 200);

    const caja = await cajaDe(armazon(page), "el armazón");
    const izquierda = caja.x;
    const derecha = ANCHA.width - (caja.x + caja.width);

    expect(
      izquierda,
      "el armazón está pegado al borde izquierdo: el tope vive en el" +
        " contenido y no en el armazón, que es el defecto de T-1",
    ).toBeGreaterThan(50);
    expect(
      derecha,
      "el armazón llega hasta el borde derecho: no tiene tope",
    ).toBeGreaterThan(50);
    expect(
      Math.abs(izquierda - derecha),
      `el armazón no está centrado: ${String(Math.round(izquierda))}px de un` +
        ` lado y ${String(Math.round(derecha))}px del otro`,
    ).toBeLessThanOrEqual(2);
  });

  test("el encabezado y el lateral no se mueven cuando el contenido scrollea", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 700 });
    await page.goto(BANCO);
    await page.evaluate(() => document.fonts.ready);
    await page.locator(".tabla-contenedor").first().waitFor();

    const region = contenido(page);

    // El contrapeso: con una pantalla que entra en la ventana, los dos pares
    // de `boundingBox` de abajo son iguales porque no se scrolleó nada, y la
    // prueba pasaría con el armazón scrolleando como documento.
    const alcance = await region.evaluate((nodo) => ({
      scrollHeight: nodo.scrollHeight,
      clientHeight: nodo.clientHeight,
    }));
    expect(
      alcance.scrollHeight - alcance.clientHeight,
      "el banco de pruebas tiene que desbordar la región de contenido o acá" +
        " no hay scroll que medir: esto es la prueba rota",
    ).toBeGreaterThan(200);

    const encabezadoAntes = await cajaDe(encabezado(page), "el encabezado");
    const lateralAntes = await cajaDe(lateral(page), "el lateral");

    await region.evaluate((nodo) => {
      nodo.scrollTo({ top: nodo.scrollHeight });
    });

    const desplazado = await region.evaluate((nodo) => nodo.scrollTop);
    expect(
      desplazado,
      "la región de contenido no scrolleó: `overflow-y` no llegó a ella",
    ).toBeGreaterThan(200);
    expect(
      await page.evaluate(() => window.scrollY),
      "scrolleó la página entera y no la región de contenido: el armazón" +
        " sigue en flujo de documento",
    ).toBe(0);

    const encabezadoDespues = await cajaDe(encabezado(page), "el encabezado");
    const lateralDespues = await cajaDe(lateral(page), "el lateral");

    expect(
      Math.abs(encabezadoDespues.y - encabezadoAntes.y),
      "el encabezado se movió con el scroll del contenido",
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(lateralDespues.y - lateralAntes.y),
      "el lateral se movió con el scroll del contenido",
    ).toBeLessThanOrEqual(1);
  });
});

test.describe("el lateral en ancho: columna que se saca y se devuelve (T-2)", () => {
  test("arranca abierto y el botón lo dice", async ({ page }) => {
    await page.setViewportSize(ANCHA);
    await page.goto("/");

    await expect(
      lateral(page),
      "en ancho el lateral tiene que arrancar abierto: hay lugar para los dos",
    ).toBeVisible();
    await expect(alternar(page)).toHaveAttribute("aria-expanded", "true");
  });

  test("el botón saca la columna y el contenido gana el ancho", async ({
    page,
  }) => {
    await page.setViewportSize(ANCHA);
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);

    const boton = alternar(page);
    const anchoCon = (await cajaDe(contenido(page), "la región de contenido"))
      .width;

    await boton.click();

    await expect(
      lateral(page),
      "el botón no sacó el lateral de la pantalla",
    ).not.toBeVisible();
    await expect(boton).toHaveAttribute("aria-expanded", "false");

    const anchoSin = (await cajaDe(contenido(page), "la región de contenido"))
      .width;
    expect(
      anchoSin,
      `sacar el lateral no le dio ancho al contenido (${String(
        Math.round(anchoCon),
      )}px antes, ${String(Math.round(anchoSin))}px después): la columna se` +
        " escondió pero la pista del grid sigue ocupando su lugar",
    ).toBeGreaterThan(anchoCon + 100);
  });

  test("y el botón lo devuelve", async ({ page }) => {
    // La vuelta. Un colapso de ida nada más deja la aplicación sin menú y es
    // peor que no colapsar.
    await page.setViewportSize(ANCHA);
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);

    const boton = alternar(page);
    const anchoOriginal = (
      await cajaDe(contenido(page), "la región de contenido")
    ).width;

    await boton.click();
    await expect(lateral(page)).not.toBeVisible();
    await boton.click();

    await expect(
      lateral(page),
      "el botón no devolvió el lateral",
    ).toBeVisible();
    await expect(boton).toHaveAttribute("aria-expanded", "true");
    expect(
      (await cajaDe(contenido(page), "la región de contenido")).width,
      "el lateral volvió pero el contenido no devolvió el ancho",
    ).toBeCloseTo(anchoOriginal, 0);
  });

  test("en ancho no hay velo: nadie tapa la tabla que se está leyendo", async ({
    page,
  }) => {
    await page.setViewportSize(ANCHA);
    await page.goto("/");

    await expect(
      velo(page),
      "en ancho el velo no tiene que verse ni con el lateral abierto",
    ).toBeHidden();

    await alternar(page).click();
    await expect(
      velo(page),
      "en ancho el velo no tiene que verse ni con el lateral cerrado",
    ).toBeHidden();
  });

  test("en ancho el contenido nunca queda inerte", async ({ page }) => {
    await page.setViewportSize(ANCHA);
    await page.goto("/");

    expect(
      await contenido(page).evaluate((nodo) => (nodo as HTMLElement).inert),
      "en ancho el lateral es una columna y no un modal: dejar el contenido" +
        " inerte sería una aplicación que no se puede usar",
    ).toBe(false);
  });
});

test.describe("el lateral en angosto: cajón con velo (T-2)", () => {
  test("arranca cerrado", async ({ page }) => {
    await page.setViewportSize(ANGOSTA);
    await page.goto("/");

    await expect(
      lateral(page),
      "en angosto el cajón tiene que arrancar cerrado: ocupa toda la pantalla",
    ).not.toBeInViewport();
    await expect(velo(page)).toBeHidden();
    await expect(alternar(page)).toHaveAttribute("aria-expanded", "false");
  });

  test("el menú sigue en el DOM con el cajón cerrado", async ({ page }) => {
    /*
     * El invariante de `e2e/navegacion.spec.ts` visto desde acá: ese archivo
     * lee `.navegacion__lista a.navegacion__item` con `toBeAttached()` para
     * sostener que toda pantalla es alcanzable desde el menú. Un cajón
     * «cerrado» renderizado condicionalmente mataría sus tres pruebas en
     * cualquier ventana angosta, y lo haría diciendo «falta una sección».
     * Se esconde con `transform`, que es lo que el documento de la tajada
     * decidió, y esta prueba es la que lo ancla.
     */
    await page.setViewportSize(ANGOSTA);
    await page.goto("/");

    const anclas = page.locator(".navegacion__lista a.navegacion__item");
    await expect(anclas.first()).toBeAttached();
    expect(
      await anclas.count(),
      "el menú no está en el DOM con el cajón cerrado: se renderizó" +
        " condicionalmente",
    ).toBeGreaterThanOrEqual(4);
  });

  test("el botón abre el cajón encima del contenido, con velo", async ({
    page,
  }) => {
    await page.setViewportSize(ANGOSTA);
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);

    const anchoAntes = (await cajaDe(contenido(page), "la región de contenido"))
      .width;

    await alternar(page).click();

    await expect(lateral(page)).toBeInViewport({ ratio: 0.9 });
    await expect(
      velo(page),
      "el cajón se abrió sin velo: un cajón sobre el contenido sin velo deja" +
        " la pantalla de abajo pareciendo usable",
    ).toBeVisible();
    await expect(alternar(page)).toHaveAttribute("aria-expanded", "true");

    expect(
      (await cajaDe(contenido(page), "la región de contenido")).width,
      "el cajón empujó el contenido en vez de taparlo: en angosto no hay" +
        " ancho para las dos cosas",
    ).toBeCloseTo(anchoAntes, 0);
  });

  test("con el cajón abierto el contenido queda inerte", async ({ page }) => {
    // Un velo que solo oscurece deja el foco tabulando por debajo: se llega
    // con el teclado a controles que no se ven. `inert` es la mitad que
    // convierte el velo en overlay de verdad.
    await page.setViewportSize(ANGOSTA);
    await page.goto("/");

    expect(
      await contenido(page).evaluate((nodo) => (nodo as HTMLElement).inert),
      "el contenido arrancó inerte con el cajón cerrado",
    ).toBe(false);

    await alternar(page).click();
    await expect(velo(page)).toBeVisible();

    expect(
      await contenido(page).evaluate((nodo) => (nodo as HTMLElement).inert),
      "con el cajón abierto el contenido tiene que quedar inerte: sin eso el" +
        " teclado entra por debajo del velo",
    ).toBe(true);
  });

  test("el velo cierra el cajón", async ({ page }) => {
    await page.setViewportSize(ANGOSTA);
    await page.goto("/");

    await alternar(page).click();
    await expect(velo(page)).toBeVisible();

    await velo(page).click();

    await expect(
      lateral(page),
      "el velo no cerró el cajón: tocar afuera es la forma más corta de salir",
    ).not.toBeInViewport();
    await expect(velo(page)).toBeHidden();
    await expect(alternar(page)).toHaveAttribute("aria-expanded", "false");
  });

  test("`Escape` cierra el cajón", async ({ page }) => {
    await page.setViewportSize(ANGOSTA);
    await page.goto("/");

    await alternar(page).click();
    await expect(velo(page)).toBeVisible();

    await page.keyboard.press("Escape");

    await expect(
      lateral(page),
      "`Escape` no cerró el cajón: es lo que cierra cualquier cosa modal",
    ).not.toBeInViewport();
    await expect(alternar(page)).toHaveAttribute("aria-expanded", "false");
  });

  test("el botón cierra el cajón que abrió", async ({ page }) => {
    await page.setViewportSize(ANGOSTA);
    await page.goto("/");

    const boton = alternar(page);

    await boton.click();
    await expect(velo(page)).toBeVisible();

    await boton.click();

    await expect(
      lateral(page),
      "el botón abre y no cierra: el encabezado queda fuera del velo" +
        " justamente para que pueda cerrar lo que abrió",
    ).not.toBeInViewport();
    await expect(boton).toHaveAttribute("aria-expanded", "false");
  });
});

test.describe("y nada de esto trae scroll horizontal", () => {
  /*
   * El criterio de T-4 sobre lo que T-2 agrega. No se redefine la medición:
   * `medirDesborde` de `e2e/desborde.ts` ya es **la** definición de «la
   * página no scrollea en horizontal», y una segunda copia acá sería una
   * segunda definición que se relaja sola.
   *
   * Lo que acá se agrega son los estados que `sin-scroll-horizontal.spec.ts`
   * no puede ver, porque son estados y no anchos: el cajón abierto, que es
   * un elemento de 80% del ancho dibujado encima, y el lateral colapsado en
   * ancho, que cambia las pistas del grid.
   */
  for (const ancho of [320, 390, 767] as const) {
    test(`con el cajón abierto a ${String(ancho)}px de ancho`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: ancho, height: 844 });
      await page.goto(BANCO);
      await page.evaluate(() => document.fonts.ready);

      await alternar(page).click();
      await expect(velo(page)).toBeVisible();

      const desborde = await medirDesborde(page);
      expect(
        desborde.scrollWidth,
        porQueSeSale(ancho, desborde),
      ).toBeLessThanOrEqual(desborde.clientWidth);
    });
  }

  for (const ancho of [1440, 2560] as const) {
    test(`con el lateral colapsado a ${String(ancho)}px de ancho`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: ancho, height: 900 });
      await page.goto(BANCO);
      await page.evaluate(() => document.fonts.ready);

      await alternar(page).click();
      await expect(lateral(page)).not.toBeVisible();

      const desborde = await medirDesborde(page);
      expect(
        desborde.scrollWidth,
        porQueSeSale(ancho, desborde),
      ).toBeLessThanOrEqual(desborde.clientWidth);
    });
  }
});
