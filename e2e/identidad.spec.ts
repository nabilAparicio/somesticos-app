/**
 * Quién entró y cómo salir, dibujado en el armazón
 * (`odd/tasks/armazon-de-aplicacion.md`, T-3).
 *
 * El reclamo que abrió esta tarea: «no veo el usuario logueado ni una forma
 * de cerrar sesión». La identidad existía —`GET /api/yo` desde la tajada 1—
 * y se dibujaba en **una** pantalla, la portada, como una línea de
 * diagnóstico que se perdía en cuanto alguien navegaba a cualquier otra. Y
 * de salir no había nada.
 *
 * ## Por qué de punta a punta y no en `test/`
 *
 * Porque lo que esta tarea entrega es exactamente lo que una unitaria no
 * puede ver: que la identidad esté en el **armazón** y no en una pantalla.
 * Eso solo se sostiene mirando dos pantallas distintas y comprobando que la
 * franja de arriba dice lo mismo en las dos. Una unitaria sobre
 * `Esqueleto.tsx` afirmaría que el componente renderiza un nombre, que es
 * justo lo que la versión vieja también hacía —en `Inicio.tsx`— mientras el
 * defecto estaba entero.
 *
 * `cargarIdentidad` sí tiene su suite de unidad, en
 * `test/identidad-ui.spec.ts`: ahí van las ramas de `Resultado`, que no
 * necesitan navegador.
 *
 * ## Las respuestas de `/api/yo` van interceptadas, y no es higiene
 *
 * Es lo mismo que `e2e/clientes.spec.ts` dejó escrito, con un motivo propio
 * que se midió acá. Lo que `vite dev` contesta en `/api/yo` **depende de la
 * máquina**: `worker/acceso/puerta.ts` tiene la vía de desarrollo
 * `ACCESO_DEV_EMAIL`, que sale de `.dev.vars` —un archivo local,
 * `.gitignore`-ado— y que además resuelve ese correo contra la tabla
 * `usuario` de la base local de `.wrangler/`, que tampoco está en el
 * repositorio. O sea: en la máquina de quien escribió esto la puerta
 * contesta 200 con un nombre, y en una máquina sin `.dev.vars` o sin esa
 * fila contesta 403. Una prueba que afirmara sobre un nombre concreto sin
 * interceptar estaría afirmando sobre el `.dev.vars` de alguien.
 *
 * El filtro es un predicado sobre el `pathname` y no un glob de comodines
 * sobre `/api/`: ese glob también atrapa los módulos que sirve Vite en
 * desarrollo, y una respuesta JSON en lugar de un módulo deja la página en
 * blanco sin un solo error visible.
 *
 * ## Lo que esta suite **no** puede hacer, y por qué no es una omisión
 *
 * No comprueba que «Salir» cierre la sesión: `/cdn-cgi/access/logout` lo
 * atiende el borde de Cloudflare y en `vite dev` no hay borde. Lo que se
 * puede sostener acá es que el enlace exista, que apunte a esa dirección
 * **relativa al dominio de la aplicación**, y que siga ofrecido en el estado
 * en el que más falta hace: cuando la identidad no se reconoció.
 */
import { expect, test, type Page } from "@playwright/test";

const IDENTIDAD = {
  usuarioId: "6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44",
  email: "itzel@bufete.test",
  nombre: "Itzel Rodríguez",
};

/** La dirección que atiende el borde, escrita una vez. */
const SALIDA = "/cdn-cgi/access/logout";

/**
 * La puerta contesta lo que la prueba quiera.
 *
 * `status` 200 con la identidad, o 403 con el cuerpo que manda
 * `worker/acceso/rechazo.ts`. Las dos formas son las que la aplicación va a
 * ver de verdad.
 */
async function puertaContestando(
  page: Page,
  respuesta:
    | { readonly status: 200 }
    | { readonly status: 403; readonly motivo: string },
): Promise<void> {
  await page.route(
    (url) => url.pathname === "/api/yo",
    async (ruta) => {
      await ruta.fulfill({
        status: respuesta.status,
        contentType: "application/json",
        body: JSON.stringify(
          respuesta.status === 200
            ? IDENTIDAD
            : { error: "acceso_denegado", motivo: respuesta.motivo },
        ),
      });
    },
  );
}

function identidadDelArmazon(page: Page) {
  return page.locator(".esqueleto__identidad");
}

function quien(page: Page) {
  return page.locator(".esqueleto__quien");
}

function salir(page: Page) {
  return page.locator(".esqueleto__salir");
}

test.describe("quién entró, en el armazón", () => {
  /**
   * El control de hostilidad, y va primero por lo mismo que en
   * `e2e/navegacion.spec.ts`: «el nombre no se dibuja» y «el selector no
   * encuentra la franja» se parecen en la salida y significan lo contrario.
   */
  test("la franja de identidad se dibuja", async ({ page }) => {
    await puertaContestando(page, { status: 200 });
    await page.goto("/");

    await expect(
      identidadDelArmazon(page),
      "el selector `.esqueleto__identidad` no encontró nada: esto es la" +
        " prueba rota, no una identidad que falta",
    ).toBeVisible();
  });

  test("el nombre de quien entró se ve en más de una pantalla", async ({
    page,
  }) => {
    /*
     * **La prueba de que es armazón y no pantalla.** La portada ya mostraba
     * un nombre antes de T-3; lo que no había era un nombre que sobreviviera
     * a navegar. Dos pantallas distintas, y ninguna de las dos es la
     * portada en el segundo caso.
     */
    await puertaContestando(page, { status: 200 });

    await page.goto("/");
    await expect(quien(page)).toContainText("Itzel Rodríguez");

    await page.goto("/procesos");
    await expect(
      quien(page),
      "la identidad se perdió al navegar: sigue viviendo en una pantalla y" +
        " no en el armazón",
    ).toContainText("Itzel Rodríguez");

    await page.goto("/cotizaciones");
    await expect(quien(page)).toContainText("Itzel Rodríguez");
  });

  test("el correo está en el título y además leíble para un lector de pantalla", async ({
    page,
  }) => {
    /*
     * Un `title` solo aparece al pasar el mouse por encima: no hay mouse en
     * un teléfono, no hay mouse navegando con teclado, y los lectores de
     * pantalla no lo anuncian de forma confiable. Así que el correo viaja
     * **dos** veces: en el `title`, para quien pasa el mouse, y en el texto
     * del elemento recortado con `.oculto-visualmente`, que es lo que
     * cualquier lector de pantalla sí lee.
     */
    await puertaContestando(page, { status: 200 });
    await page.goto("/");

    await expect(quien(page)).toHaveAttribute("title", "itzel@bufete.test");

    await expect(
      quien(page),
      "el correo está solo en el `title`: para un lector de pantalla y para" +
        " un teléfono, no está",
    ).toContainText("itzel@bufete.test");
  });

  test("«Salir» es un enlace a /cdn-cgi/access/logout del propio dominio", async ({
    page,
  }) => {
    /*
     * El `href` se lee con `getAttribute` y no con la propiedad `href`, que
     * el navegador devuelve ya absolutizada: lo que esta prueba sostiene es
     * que lo escrito sea **relativo**, que es lo que hace que la cookie que
     * se borre sea la del dominio de la aplicación.
     */
    await puertaContestando(page, { status: 200 });
    await page.goto("/");

    const enlace = salir(page);
    await expect(enlace).toBeVisible();
    await expect(enlace).toHaveText("Salir");
    await expect(
      enlace,
      "«Salir» dejó de ser un enlace relativo al dominio de la aplicación:" +
        " alguien lo convirtió en un `fetch`, en un botón o en la dirección" +
        " del team",
    ).toHaveAttribute("href", SALIDA);
  });

  test("sin identidad reconocida lo dice, y «Salir» sigue ofrecido", async ({
    page,
  }) => {
    /*
     * El estado que `wrangler.jsonc` hace probable hoy: `ACCESO_TEAM_DOMAIN`
     * y `ACCESO_AUD` siguen con los valores de ejemplo, así que la puerta
     * falla cerrada. Quedarse en blanco acá sería esconder un despliegue a
     * medias, y «Salir» es justamente cómo alguien se recupera de una sesión
     * mala: es el estado en el que más falta hace, no el único en el que
     * sobra.
     */
    await puertaContestando(page, {
      status: 403,
      motivo: "acceso_no_configurado",
    });
    await page.goto("/");

    await expect(
      quien(page),
      "la puerta no reconoció la sesión y el armazón no dice nada: un" +
        " despliegue a medias queda invisible",
    ).toContainText("Sin identidad reconocida");

    await expect(
      quien(page),
      "el motivo de la puerta se perdió: «mal configurada» y «no estás dado" +
        " de alta» se ven igual",
    ).toContainText("acceso_no_configurado");

    await expect(
      salir(page),
      "sin identidad no se ofrece salir, que es exactamente cómo alguien se" +
        " saca una sesión mala de encima",
    ).toHaveAttribute("href", SALIDA);
  });

  test("el correo aprobado por Access sin fila en `usuario` también se dice", async ({
    page,
  }) => {
    // El otro 403, y el motivo es lo único que lo distingue del de arriba.
    await puertaContestando(page, {
      status: 403,
      motivo: "usuario_desconocido",
    });
    await page.goto("/");

    await expect(quien(page)).toContainText("usuario_desconocido");
    await expect(salir(page)).toBeVisible();
  });

  test("mientras la identidad carga, la franja ya ocupa su lugar", async ({
    page,
  }) => {
    /*
     * El defecto que esta prueba busca es un parpadeo: con la franja vacía
     * hasta que la respuesta llegue, el encabezado cambia de alto cuando el
     * nombre aparece y el contenido entero salta. Así que se retiene la
     * respuesta de la puerta y se mide el encabezado **antes** y **después**.
     *
     * Se compara el alto y no el ancho a propósito: el ancho del rótulo
     * cambia —«Identificando…» no mide lo que mide un nombre— y eso no mueve
     * nada de la página. Lo que mueve el contenido es el alto, que es lo que
     * crece cuando la franja envuelve a un renglón nuevo.
     */
    let soltar = () => {
      /* lo reemplaza la promesa de abajo */
    };
    const retenida = new Promise<void>((resolver) => {
      soltar = resolver;
    });

    await page.route(
      (url) => url.pathname === "/api/yo",
      async (ruta) => {
        await retenida;
        await ruta.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(IDENTIDAD),
        });
      },
    );

    await page.goto("/");

    const encabezado = page.locator(".esqueleto__encabezado");
    await expect(
      quien(page),
      "la franja de identidad no dice nada mientras carga: el encabezado" +
        " tiene un hueco vacío y después salta",
    ).not.toBeEmpty();

    const antes = await encabezado.boundingBox();
    soltar();
    await expect(quien(page)).toContainText("Itzel Rodríguez");
    const despues = await encabezado.boundingBox();

    expect(antes, "no se pudo medir el encabezado antes").not.toBeNull();
    expect(despues, "no se pudo medir el encabezado después").not.toBeNull();
    expect(
      Math.abs((despues?.height ?? 0) - (antes?.height ?? 0)),
      "el encabezado cambió de alto cuando llegó la identidad: eso es el" +
        " salto que la franja reservada existe para evitar",
    ).toBeLessThanOrEqual(1);
  });

  test("el armazón no agrega ningún `header button.boton`", async ({
    page,
  }) => {
    /*
     * El invariante que T-2 pagó midiendo: `e2e/cotizaciones.spec.ts` cuenta
     * `header button.boton` para saber qué acciones ofrece el estado de una
     * cotización, y con la clase `.boton` puesta en el control del armazón
     * se caían quince de esas pruebas. T-3 agrega dos elementos más a la
     * misma franja, y esto es la red para que no vuelva a pasar: la
     * identidad no es una acción de pantalla y «Salir» es un enlace, no un
     * botón.
     */
    await puertaContestando(page, { status: 200 });
    await page.goto("/");

    await expect(identidadDelArmazon(page)).toBeVisible();
    await expect(
      page.locator(".esqueleto__encabezado button.boton"),
      "el armazón puso un `button.boton` en el encabezado: las pruebas que" +
        " cuentan la barra de acciones de una cotización lo van a contar" +
        " como una acción de la pantalla",
    ).toHaveCount(0);
    await expect(
      page.locator(".esqueleto__encabezado .boton"),
      "el armazón puso la clase `.boton` en el encabezado:" +
        " `header .boton` de cotizaciones.spec.ts apunta a la barra de" +
        " acciones de la pantalla y ahora resuelve a dos elementos",
    ).toHaveCount(0);
  });
});

test.describe("la portada ya no repite la identidad", () => {
  test("la línea de diagnóstico de Inicio se fue", async ({ page }) => {
    /*
     * Con la identidad permanente en el armazón, la línea «Entró …» de la
     * portada decía dos veces lo mismo en la misma pantalla y peor: sin
     * correo, sin salida y sin sobrevivir a navegar.
     *
     * Se cuenta sobre `main` y no sobre la página entera, porque la página
     * entera incluye el encabezado, que es justamente donde la identidad
     * ahora **sí** tiene que estar. Una prueba que contara la página no
     * podría distinguir «se fue de la portada» de «se fue del todo».
     */
    await puertaContestando(page, { status: 200 });
    await page.goto("/");

    const contenido = page.locator(".esqueleto__contenido");
    await expect(
      contenido.getByRole("heading", { name: "Procesos del bufete" }),
      "la portada no llegó a dibujarse: esto es la prueba rota, no una" +
        " línea duplicada que se fue",
    ).toBeVisible();

    await expect(
      contenido,
      "la portada sigue diciendo quién entró: con la identidad en el" +
        " armazón, eso es decir dos veces lo mismo en la misma pantalla",
    ).not.toContainText("Entró");
    await expect(contenido).not.toContainText("Itzel Rodríguez");
    await expect(contenido).not.toContainText("Sin identidad reconocida");
  });
});
