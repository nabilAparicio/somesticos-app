/**
 * El criterio de T-4: la página no scrollea en horizontal en ningún ancho
 * entre 320px y 2560px.
 *
 * La trampa de este criterio es que **una página vacía nunca scrollea**. Si
 * esta prueba recorriera viewports sobre una pantalla con un título y dos
 * párrafos, pasaría siempre y no probaría nada. Por eso corre sobre
 * `/banco-de-pruebas`, la ruta que junta a propósito el contenido que rompe
 * un layout mal hecho: una tabla de nueve columnas, una URL sin puntos de
 * corte y una rejilla de tarjetas.
 *
 * Y por eso el primer `test` de este archivo no mira el layout: verifica que
 * el banco de pruebas **siga siendo hostil**. El día que alguien le acorte el
 * texto a la tabla "para que se vea mejor", el criterio se vuelve vacuo sin
 * que nadie se entere; esa prueba es la que avisa.
 */
import { expect, test } from "@playwright/test";

import { medirDesborde } from "./desborde";

const BANCO = "/banco-de-pruebas";

/**
 * Los extremos del criterio (320 y 2560) y, en el medio, los anchos donde un
 * layout suele quebrarse: el celular más angosto que todavía se usa, los
 * celulares corrientes, la tableta en vertical y en horizontal, el portátil,
 * y los dos saltos a escritorio grande. Se incluyen también 1px por debajo y
 * por encima del único punto de cambio del armazón (48rem = 768px), que es
 * donde la navegación pasa de apilada a columna lateral: un cambio de layout
 * sin prueba a ambos lados del umbral es un cambio sin probar.
 */
const ANCHOS = [
  320, 360, 390, 414, 480, 600, 767, 768, 769, 834, 1024, 1180, 1280, 1440,
  1600, 1920, 2560,
] as const;

const ALTO = 900;

test.describe("la página no scrollea en horizontal", () => {
  test("el banco de pruebas sigue siendo contenido hostil", async ({
    page,
  }) => {
    await page.goto(BANCO);

    // Una tabla ancha de verdad: con menos columnas, o con celdas cortas,
    // cabría a 320px y el criterio dejaría de medir algo.
    const columnas = await page.locator("table thead th").count();
    expect(columnas, "la tabla del banco necesita muchas columnas").toBeGreaterThanOrEqual(9);

    const celdaMasLarga = await page
      .locator("table tbody tr")
      .first()
      .evaluate((fila) =>
        Math.max(
          ...Array.from(fila.children, (celda) =>
            (celda.textContent ?? "").trim().length,
          ),
        ),
      );
    expect(
      celdaMasLarga,
      "las celdas tienen que llevar texto de dominio largo",
    ).toBeGreaterThanOrEqual(60);

    // Una palabra sin puntos de corte: lo que desborda un contenedor al que
    // le falta `overflow-wrap`.
    const tokenMasLargo = await page.evaluate(() =>
      Math.max(
        ...(document.body.innerText.split(/\s+/).map((t) => t.length) || [0]),
      ),
    );
    expect(
      tokenMasLargo,
      "hace falta una URL o palabra larga sin espacios",
    ).toBeGreaterThanOrEqual(60);

    // Suficientes tarjetas para que la rejilla tenga algo que reacomodar.
    const tarjetas = await page.locator(".rejilla .tarjeta").count();
    expect(tarjetas, "la rejilla necesita varias tarjetas").toBeGreaterThanOrEqual(9);

    // Y al menos una rejilla cuyo mínimo de columna sea MAYOR que la columna
    // de contenido a 320px. Sin ella, quitarle el `min(…, 100%)` a `.rejilla`
    // no rompe ninguna prueba: se comprobó por mutación y pasaba igual,
    // porque 18rem todavía entraban. Un mínimo que no entra es lo que hace
    // que esa regla sea verificable.
    const minimoMasGrande = await page.evaluate(() =>
      Math.max(
        ...Array.from(document.querySelectorAll<HTMLElement>(".rejilla"), (r) =>
          Number.parseFloat(
            r.style.getPropertyValue("--rejilla-minimo").replace("rem", ""),
          ),
        ).filter((n) => !Number.isNaN(n)),
        0,
      ),
    );
    expect(
      minimoMasGrande,
      "hace falta una rejilla con un mínimo de columna que no entre a 320px",
    ).toBeGreaterThanOrEqual(22);
  });

  for (const ancho of ANCHOS) {
    test(`a ${String(ancho)}px de ancho, sobre el banco de pruebas`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: ancho, height: ALTO });
      await page.goto(BANCO);
      // Las fuentes cambian las métricas del texto; medir antes de que
      // carguen mide otro layout.
      await page.evaluate(() => document.fonts.ready);

      const { scrollWidth, clientWidth, culpables } = await medirDesborde(page);

      expect(
        scrollWidth,
        `el documento se sale a ${String(ancho)}px. Se salen del ancho: ` +
          (culpables.length > 0 ? culpables.join(" | ") : "(ninguno medible)"),
      ).toBeLessThanOrEqual(clientWidth);
    });
  }

  for (const ancho of [320, 768, 2560] as const) {
    test(`a ${String(ancho)}px de ancho, sobre el inicio`, async ({ page }) => {
      await page.setViewportSize({ width: ancho, height: ALTO });
      await page.goto("/");
      await page.evaluate(() => document.fonts.ready);

      const { scrollWidth, clientWidth, culpables } = await medirDesborde(page);

      expect(
        scrollWidth,
        `el documento se sale a ${String(ancho)}px. Se salen del ancho: ` +
          (culpables.length > 0 ? culpables.join(" | ") : "(ninguno medible)"),
      ).toBeLessThanOrEqual(clientWidth);
    });
  }

  /*
   * El formulario de cliente (T-5) es el contenido nuevo con más riesgo
   * responsivo del sistema, y por una razón concreta: un `<input>` trae un
   * ancho intrínseco propio —el viejo `size=20`, unos 170px— que no sale de
   * ninguna hoja de estilos. En una rejilla angosta eso es un ancho fijo
   * encubierto, que es exactamente lo que §9 prohíbe.
   *
   * Corre sin identidad de Access, que es lo que hay en `vite dev`: el
   * catálogo de tipos contesta 403 y el formulario **igual se dibuja**, que
   * es el comportamiento buscado (el tipo es opcional; un campo prescindible
   * no puede bloquear el alta). Por eso la primera prueba verifica que lo
   * que se está midiendo sea el formulario de verdad y no una página de
   * error: una pantalla con un solo párrafo nunca desborda, y medirla sería
   * la misma vacuidad que T-4 encontró en su propia rejilla.
   */
  const ALTA = "/clientes/nuevo";

  test("la pantalla de alta se dibuja aunque la API no conteste", async ({
    page,
  }) => {
    await page.goto(ALTA);

    const controles = page.locator(
      "form .campo__control:visible, form input, form select, form textarea",
    );
    await expect(controles.first()).toBeVisible();
    expect(
      await page.locator("form input, form select, form textarea").count(),
      "el formulario de alta tiene que traer todos sus campos",
    ).toBeGreaterThanOrEqual(8);

    // Y el campo obligatorio está rotulado como tal: el criterio de T-5 es
    // que con nombre y un contacto alcance, y eso se tiene que poder leer.
    await expect(page.getByLabel(/Nombre/)).toBeVisible();
  });

  for (const ancho of ANCHOS) {
    test(`a ${String(ancho)}px de ancho, sobre el alta de cliente`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: ancho, height: ALTO });
      await page.goto(ALTA);
      await page.evaluate(() => document.fonts.ready);
      await page.locator("form .campo__control").first().waitFor();

      const { scrollWidth, clientWidth, culpables } = await medirDesborde(page);

      expect(
        scrollWidth,
        `el documento se sale a ${String(ancho)}px. Se salen del ancho: ` +
          (culpables.length > 0 ? culpables.join(" | ") : "(ninguno medible)"),
      ).toBeLessThanOrEqual(clientWidth);
    });
  }

  for (const ancho of [320, 768, 2560] as const) {
    test(`a ${String(ancho)}px de ancho, sobre el listado de clientes`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: ancho, height: ALTO });
      await page.goto("/clientes");
      await page.evaluate(() => document.fonts.ready);
      await page.getByRole("heading", { name: "Clientes" }).waitFor();

      const { scrollWidth, clientWidth, culpables } = await medirDesborde(page);

      expect(
        scrollWidth,
        `el documento se sale a ${String(ancho)}px. Se salen del ancho: ` +
          (culpables.length > 0 ? culpables.join(" | ") : "(ninguno medible)"),
      ).toBeLessThanOrEqual(clientWidth);
    });
  }

  test("la tabla scrollea dentro de su contenedor, no en la página", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: ALTO });
    await page.goto(BANCO);
    await page.evaluate(() => document.fonts.ready);

    // La otra mitad de §9: que la página no scrollee es la mitad buena solo
    // si la tabla sigue siendo alcanzable. Una tabla "arreglada" con
    // `overflow: hidden` también pasaría el criterio y escondería datos.
    const contenedor = page.locator(".tabla-contenedor").first();
    const medidas = await contenedor.evaluate((nodo) => ({
      scrollWidth: nodo.scrollWidth,
      clientWidth: nodo.clientWidth,
      overflowX: getComputedStyle(nodo).overflowX,
    }));

    expect(medidas.scrollWidth).toBeGreaterThan(medidas.clientWidth);
    expect(medidas.overflowX).toBe("auto");
  });
});
