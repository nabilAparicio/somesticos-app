/**
 * Las pantallas de catálogo de T-6, en el navegador.
 *
 * Dos cosas que solo se pueden comprobar acá:
 *
 *  1. **El aviso de que editar la plantilla no cambia los procesos ya
 *     abiertos está en la pantalla donde se edita la plantilla.** El diseño
 *     lo pide textualmente (`docs/diseno.md` §6). Que la constante exista se
 *     afirma en `test/catalogos-ui.spec.ts`; que esté *a la vista*, acá.
 *  2. **Que reordenar mueve de verdad la etapa**, botón incluido. La función
 *     pura ya está probada; lo que esto agrega es que el botón de cada fila
 *     esté cableado al índice correcto, que es el error que una prueba de
 *     función no puede ver.
 *
 * Y, de paso, el criterio responsivo de §9 sobre el contenido nuevo.
 *
 * **Las respuestas de la API van interceptadas.** `vite dev` corre sin
 * identidad de Access, así que la API real contesta 403 y la pantalla se
 * dibujaría como un aviso de error: medir el layout de un párrafo suelto
 * sería exactamente la vacuidad que T-4 descubrió en su propia rejilla. Con
 * los datos puestos se mide la tabla de verdad, con nombres de trámite
 * largos, que es lo que desborda.
 */
import { expect, test, type Page } from "@playwright/test";

import { medirDesborde, porQueSeSale } from "./desborde";

const TIPO_ID = "0f2a9c31-7d4e-4b85-9a1c-6e3f8d2b5a40";
const AREA_MIGRACION = "a1111111-1111-4111-8111-111111111111";
const AREA_FAMILIA = "a2222222-2222-4222-8222-222222222222";

const AREAS = [
  { id: AREA_MIGRACION, nombre: "Migración y naturalización", activo: true },
  { id: AREA_FAMILIA, nombre: "Familia y sucesiones", activo: true },
  {
    id: "a3333333-3333-4333-8333-333333333333",
    nombre: "Derecho penal económico y corporativo",
    activo: false,
  },
];

const TIPOS_CLIENTE = [
  { id: "c1", nombre: "Particular", activo: true },
  { id: "c2", nombre: "Sociedad anónima panameña", activo: true },
  { id: "c3", nombre: "Fundación de interés privado", activo: false },
];

const TIPOS_PROCESO = [
  {
    id: TIPO_ID,
    areaId: AREA_MIGRACION,
    areaNombre: "Migración y naturalización",
    nombre: "Permiso de residencia permanente por matrimonio con nacional",
    descripcion:
      "Trámite ante el Servicio Nacional de Migración, con entrevista y" +
      " verificación domiciliaria.",
    activo: true,
  },
  {
    id: "0f2a9c31-7d4e-4b85-9a1c-6e3f8d2b5a41",
    areaId: AREA_MIGRACION,
    areaNombre: "Migración y naturalización",
    nombre: "Visa de pensionado o jubilado",
    descripcion: null,
    activo: true,
  },
  {
    id: "0f2a9c31-7d4e-4b85-9a1c-6e3f8d2b5a42",
    areaId: AREA_FAMILIA,
    areaNombre: "Familia y sucesiones",
    nombre: "Divorcio de mutuo acuerdo",
    descripcion: "Con convenio regulador y sin bienes en disputa.",
    activo: true,
  },
];

const ETAPAS = [
  { id: "e1", nombre: "Recepción y revisión de documentos", orden: 0 },
  { id: "e2", nombre: "Presentación ante el Servicio Nacional", orden: 1 },
  { id: "e3", nombre: "Entrevista y verificación domiciliaria", orden: 2 },
  { id: "e4", nombre: "Resolución y entrega del carné", orden: 3 },
];

/* --- T-15 · la bitácora de los catálogos -------------------------------- */

const ITZEL = { id: "u1", nombre: "Itzel" };

/**
 * Un nombre de área pegado de un expediente: sin espacios ni guiones, o sea
 * sin punto de corte. Es la lección de T-4 que volvió a morder en T-8 — un
 * token con guiones no sirve como contenido hostil porque el navegador lo
 * parte solo— y es lo que hace que la medida de §9 sobre la historia
 * desplegada mida algo.
 */
const DETALLE_HOSTIL =
  "MIGRACIONYNATURALIZACIONEXPEDIENTESNM2026RESIDENCIAPERMANENTEMATRIMONIO";

/** La historia del área de Migración: tres hechos, del viejo al nuevo. */
const BITACORA_MIGRACION = {
  // Del más nuevo al más viejo, que es como contesta la API desde T-17: el
  // banco imita al servidor, no al revés.
  entradas: [
    {
      id: "h5",
      entidad: "area",
      entidadId: AREA_MIGRACION,
      accion: "editado",
      usuarioId: ITZEL.id,
      usuarioNombre: ITZEL.nombre,
      ocurridoEn: "2026-09-02T15:00:00.000Z",
      detalle: DETALLE_HOSTIL,
    },
    {
      id: "h2",
      entidad: "area",
      entidadId: AREA_MIGRACION,
      accion: "editado",
      usuarioId: ITZEL.id,
      usuarioNombre: ITZEL.nombre,
      ocurridoEn: "2026-09-01T15:00:00.000Z",
      detalle: "Migración y naturalización",
    },
    {
      id: "h1",
      entidad: "area",
      entidadId: AREA_MIGRACION,
      accion: "creado",
      usuarioId: ITZEL.id,
      usuarioNombre: ITZEL.nombre,
      ocurridoEn: "2026-08-15T15:00:00.000Z",
      detalle: "Migración",
    },
  ],
  total: 3,
};

/** La de Familia, distinta, para que abrir otra fila se note. */
const BITACORA_FAMILIA = {
  entradas: [
    {
      id: "h3",
      entidad: "area",
      entidadId: AREA_FAMILIA,
      accion: "dado_de_baja",
      usuarioId: ITZEL.id,
      usuarioNombre: ITZEL.nombre,
      ocurridoEn: "2026-09-20T15:00:00.000Z",
      detalle: "Familia y sucesiones",
    },
  ],
  total: 1,
};

/** La del tipo de proceso, que se lee en su propia pantalla. */
const BITACORA_TIPO = {
  entradas: [
    {
      id: "h4",
      entidad: "tipo_proceso",
      entidadId: TIPO_ID,
      accion: "plantilla_editada",
      usuarioId: ITZEL.id,
      usuarioNombre: ITZEL.nombre,
      ocurridoEn: "2026-10-02T15:00:00.000Z",
      detalle: "Permiso de residencia permanente por matrimonio con nacional",
    },
  ],
  total: 1,
};

/** Los anchos del criterio de §9, en los puntos donde suele quebrarse. */
const ANCHOS = [320, 360, 414, 767, 768, 1024, 1280, 1920, 2560] as const;
const ALTO = 900;

/**
 * Qué contesta cada dirección.
 *
 * Es una función y no una cadena de ternarios desde que T-15 sumó las cinco
 * direcciones de bitácora: con nueve ramas, el ternario encadenado deja de
 * leerse y el error de indentación se esconde adentro.
 */
function cuerpoDe(pathname: string): Record<string, unknown> | null {
  if (pathname === `/api/areas/${AREA_MIGRACION}/bitacora`) {
    return BITACORA_MIGRACION;
  }
  if (pathname === `/api/areas/${AREA_FAMILIA}/bitacora`) {
    return BITACORA_FAMILIA;
  }
  if (pathname === `/api/tipos-proceso/${TIPO_ID}/bitacora`) {
    return BITACORA_TIPO;
  }
  // Los tipos de cliente no tienen hechos todavía: la pantalla tiene que
  // decirlo, no rellenarlo.
  if (/^\/api\/tipos-cliente\/[^/]+\/bitacora$/.test(pathname)) {
    return { entradas: [], total: 0 };
  }

  if (pathname === "/api/areas") return { areas: AREAS };
  if (pathname === "/api/tipos-cliente") return { tipos: TIPOS_CLIENTE };
  if (pathname === "/api/tipos-proceso") return { tipos: TIPOS_PROCESO };
  if (pathname === `/api/tipos-proceso/${TIPO_ID}`) {
    return { tipo: TIPOS_PROCESO[0] };
  }
  if (pathname === `/api/tipos-proceso/${TIPO_ID}/etapas`) {
    return { etapas: ETAPAS };
  }

  return null;
}

/**
 * La API, contestada desde acá. Solo lecturas: estas pruebas miden layout y
 * cableado de botones, no escritura — eso vive en `catalogos-api.spec.ts`,
 * contra una base de verdad.
 */
async function conCatalogoCargado(page: Page): Promise<void> {
  // El filtro es un predicado sobre el `pathname` y no el glob `**/api/**`:
  // ese glob también atrapa los módulos que sirve Vite en desarrollo
  // —`/src/api/peticiones.ts` entre ellos—, y una respuesta JSON en lugar de
  // un módulo deja la página en blanco sin un solo error visible.
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    async (ruta) => {
      const url = new URL(ruta.request().url());
      const cuerpo = cuerpoDe(url.pathname);

      if (cuerpo === null) {
        await ruta.fulfill({ status: 404, json: { error: "not_found" } });
        return;
      }
      await ruta.fulfill({ status: 200, json: cuerpo });
    },
  );
}

const EDICION = `/catalogos/tipos-proceso/${TIPO_ID}`;

/**
 * Los nombres de etapa, en el orden en que están dibujados.
 *
 * `toHaveValues` no sirve acá: es para un `<select multiple>`, no para una
 * lista de `<input>`. Lo que importa de esta prueba es justamente el orden,
 * así que se leen los valores y se compara el arreglo entero.
 */
function etapasDibujadas(page: Page): Promise<string[]> {
  return page
    .locator(".plantilla__etapa .campo__control")
    .evaluateAll((nodos) =>
      nodos.map((nodo) => (nodo as HTMLInputElement).value),
    );
}

test.describe("los catálogos del bufete", () => {
  test("la pantalla de catálogos muestra las dos listas con sus datos", async ({
    page,
  }) => {
    // El control de hostilidad: si esto dejara de traer filas, las medidas de
    // más abajo pasarían siempre sin medir nada.
    await conCatalogoCargado(page);
    await page.goto("/catalogos");

    await expect(page.getByRole("heading", { name: "Áreas" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Tipos de cliente" }),
    ).toBeVisible();

    // Los nombres van en `<th scope="row">`, que es `rowheader` y no `cell`.
    await expect(
      page.getByRole("rowheader", { name: "Migración y naturalización" }),
    ).toBeVisible();
    await expect(
      page.getByRole("rowheader", { name: "Sociedad anónima panameña" }),
    ).toBeVisible();

    // Lo dado de baja se muestra marcado, no escondido: lo que ya lo usa
    // tiene que poder seguir nombrándolo.
    await expect(page.getByText("De baja").first()).toBeVisible();

    const filas = await page.locator("table tbody tr").count();
    expect(filas, "las dos tablas tienen que traer filas").toBeGreaterThanOrEqual(
      6,
    );
  });

  test("un nombre ya usado se rechaza en la pantalla diciendo qué hacer", async ({
    page,
  }) => {
    await conCatalogoCargado(page);

    // Registrada **después** de la de lectura y por eso gana: Playwright
    // atiende las rutas en orden inverso al de registro. Lo que no es el
    // alta se devuelve con `fallback` a la de arriba, que es la que trae las
    // filas de la tabla.
    await page.route(
      (url) => url.pathname === "/api/areas",
      async (ruta) => {
        if (ruta.request().method() !== "POST") {
          await ruta.fallback();
          return;
        }
        await ruta.fulfill({
          status: 409,
          json: {
            error: "nombre_duplicado_de_baja",
            entidad: "area",
            nombre: "Derecho penal económico y corporativo",
          },
        });
      },
    );

    await page.goto("/catalogos");

    const areas = page.getByRole("region", { name: "Áreas" });
    await areas
      .getByLabel("Nombre del área nueva")
      .fill("Derecho penal económico y corporativo");
    await areas.getByRole("button", { name: "Agregar" }).click();

    // Que el 409 llegue hasta el ojo es lo único que esta prueba agrega: la
    // frase ya está probada como función en `test/catalogos-ui.spec.ts`, y
    // el código de estado en `test/catalogos-api.spec.ts`. Lo que falta
    // comprobar es el cable entre los dos.
    //
    // Se lee del `role="alert"` y no de la página entera: la fila dada de
    // baja ya tiene un botón «Reactivar» a la vista, así que buscar esa
    // palabra suelta pasaría sin que el aviso existiera.
    const aviso = page.getByRole("alert");
    await expect(aviso).toContainText("Derecho penal económico y corporativo");
    await expect(aviso).toContainText(/dada de baja/i);
    await expect(aviso).toContainText(/reactivar/i);
  });

  test("la edición de un tipo dice, ahí mismo, que la plantilla no es retroactiva", async ({
    page,
  }) => {
    await conCatalogoCargado(page);
    await page.goto(EDICION);

    const plantilla = page.getByRole("heading", {
      name: "Plantilla de etapas",
    });
    await expect(plantilla).toBeVisible();

    // El criterio de T-6: el aviso vive en la pantalla donde se edita la
    // plantilla, no en un manual.
    const aviso = page.getByText(/no cambia los procesos ya abiertos/i);
    await expect(aviso).toBeVisible();
    await expect(page.getByText(/se copian al crear cada proceso/i)).toBeVisible();
  });

  /* --- T-15 · la bitácora de los catálogos ---------------------------- */

  test("la historia de un área no se pide hasta que alguien la abre", async ({
    page,
  }) => {
    // Lo diferido no es optimización prematura: sin esto, pintar una tabla
    // de treinta áreas serían treinta peticiones de bitácora al entrar.
    const pedidas: string[] = [];
    page.on("request", (peticion) => {
      const ruta = new URL(peticion.url()).pathname;
      if (ruta.endsWith("/bitacora")) pedidas.push(ruta);
    });

    await conCatalogoCargado(page);
    await page.goto("/catalogos");
    await expect(
      page.getByRole("rowheader", { name: "Migración y naturalización" }),
    ).toBeVisible();

    expect(pedidas, "la lista no pide ninguna bitácora al pintarse").toEqual(
      [],
    );

    await page
      .getByRole("button", { name: "Historia de Migración y naturalización" })
      .click();

    await expect
      .poll(() => pedidas)
      .toEqual([`/api/areas/${AREA_MIGRACION}/bitacora`]);
  });

  test("al abrir la historia de un área se leen sus hechos, en frases", async ({
    page,
  }) => {
    await conCatalogoCargado(page);
    await page.goto("/catalogos");

    await page
      .getByRole("button", { name: "Historia de Migración y naturalización" })
      .click();

    const hechos = page.locator(".bitacora__frase");
    await expect(hechos).toHaveCount(3);

    // Lo último arriba (T-17): la auditoría se lee empezando por el final.
    await expect(hechos.nth(1)).toContainText(
      "Itzel editó «Migración y naturalización»",
    );
    await expect(hechos.last()).toContainText("Itzel dio de alta «Migración»");

    // El aviso que no puede faltar: la bitácora empieza el día que se
    // encendió y eso se dice, no se disimula.
    await expect(
      page.getByText("La bitácora empieza el día que se encendió", {
        exact: false,
      }),
    ).toBeVisible();
  });

  test("abrir la historia de otra fila cierra la anterior", async ({
    page,
  }) => {
    await conCatalogoCargado(page);
    await page.goto("/catalogos");

    const migracion = page.getByRole("button", {
      name: "Historia de Migración y naturalización",
    });
    const familia = page.getByRole("button", {
      name: "Historia de Familia y sucesiones",
    });

    await migracion.click();
    await expect(migracion).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator(".bitacora__frase")).toHaveCount(3);

    await familia.click();
    await expect(migracion).toHaveAttribute("aria-expanded", "false");
    await expect(familia).toHaveAttribute("aria-expanded", "true");

    const hechos = page.locator(".bitacora__frase");
    await expect(hechos).toHaveCount(1);
    await expect(hechos.first()).toContainText(
      "Itzel dio de baja «Familia y sucesiones»",
    );
  });

  test("un tipo de cliente sin hechos lo dice, y no rellena nada", async ({
    page,
  }) => {
    await conCatalogoCargado(page);
    await page.goto("/catalogos");

    await page
      .getByRole("button", { name: "Historia de Particular" })
      .click();

    await expect(page.getByText("Todavía no hay nada registrado.")).toBeVisible();
    await expect(page.locator(".bitacora__frase")).toHaveCount(0);
  });

  test("la pantalla de un tipo de proceso muestra su bitácora", async ({
    page,
  }) => {
    // Acá no hace falta desplegable: el tipo tiene pantalla propia, así que
    // la bitácora va montada como en el detalle del cliente y del proceso.
    await conCatalogoCargado(page);
    await page.goto(EDICION);

    const hechos = page.locator(".bitacora__frase");
    await expect(hechos).toHaveCount(1);
    await expect(hechos.first()).toContainText(
      "Itzel guardó la plantilla «Permiso de residencia permanente",
    );
  });

  test("el botón de subir mueve la etapa un lugar y deja las demás", async ({
    page,
  }) => {
    await conCatalogoCargado(page);
    await page.goto(EDICION);

    await expect(
      page.locator(".plantilla__etapa .campo__control"),
    ).toHaveCount(ETAPAS.length);
    await expect(await etapasDibujadas(page)).toEqual(
      ETAPAS.map((e) => e.nombre),
    );

    await page
      .getByRole("button", { name: `Subir ${ETAPAS[2].nombre}` })
      .click();

    await expect
      .poll(() => etapasDibujadas(page))
      .toEqual([
        ETAPAS[0].nombre,
        ETAPAS[2].nombre,
        ETAPAS[1].nombre,
        ETAPAS[3].nombre,
      ]);

    // Y subir la primera no hace nada, porque el botón está deshabilitado:
    // sin esa guarda el índice -1 saca la etapa de la lista.
    await expect(
      page.getByRole("button", { name: `Subir ${ETAPAS[0].nombre}` }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: `Bajar ${ETAPAS[3].nombre}` }),
    ).toBeDisabled();
  });

  test("quitar una etapa la saca de la lista y no toca las otras", async ({
    page,
  }) => {
    await conCatalogoCargado(page);
    await page.goto(EDICION);

    await page
      .getByRole("button", { name: `Quitar ${ETAPAS[1].nombre}` })
      .click();

    await expect
      .poll(() => etapasDibujadas(page))
      .toEqual([ETAPAS[0].nombre, ETAPAS[2].nombre, ETAPAS[3].nombre]);
  });

  for (const ancho of ANCHOS) {
    test(`a ${String(ancho)}px de ancho, sobre los catálogos`, async ({
      page,
    }) => {
      await conCatalogoCargado(page);
      await page.setViewportSize({ width: ancho, height: ALTO });
      await page.goto("/catalogos");
      await page.evaluate(() => document.fonts.ready);
      await page.locator("table tbody tr").first().waitFor();

      // Con la historia desplegada, que es el contenido nuevo de T-15 y el
      // que trae el token sin punto de corte. Medir con la fila cerrada
      // sería medir la tabla de T-6 otra vez y dar por buena una pantalla
      // que nunca se vio: la vacuidad que T-4 descubrió en su rejilla.
      await page
        .getByRole("button", { name: "Historia de Migración y naturalización" })
        .click();
      await page.locator(".bitacora__frase").last().waitFor();

      const desborde = await medirDesborde(page);

      expect(
        desborde.scrollWidth,
        porQueSeSale(ancho, desborde),
      ).toBeLessThanOrEqual(desborde.clientWidth);
    });
  }

  for (const ancho of ANCHOS) {
    test(`a ${String(ancho)}px de ancho, sobre la edición de un tipo`, async ({
      page,
    }) => {
      await conCatalogoCargado(page);
      await page.setViewportSize({ width: ancho, height: ALTO });
      await page.goto(EDICION);
      await page.evaluate(() => document.fonts.ready);
      await page.locator(".plantilla__etapa .campo__control").first().waitFor();
      // La bitácora llega en su propia petición: medir antes de que esté
      // dibujada sería medir la pantalla sin lo que T-15 le agregó.
      await page.locator(".bitacora__frase").first().waitFor();

      const desborde = await medirDesborde(page);

      expect(
        desborde.scrollWidth,
        porQueSeSale(ancho, desborde),
      ).toBeLessThanOrEqual(desborde.clientWidth);
    });
  }

  for (const ancho of [320, 768, 2560] as const) {
    test(`a ${String(ancho)}px de ancho, sobre los tipos de proceso`, async ({
      page,
    }) => {
      await conCatalogoCargado(page);
      await page.setViewportSize({ width: ancho, height: ALTO });
      await page.goto("/catalogos/tipos-proceso");
      await page.evaluate(() => document.fonts.ready);
      await page.locator("table tbody tr").first().waitFor();

      const desborde = await medirDesborde(page);

      expect(
        desborde.scrollWidth,
        porQueSeSale(ancho, desborde),
      ).toBeLessThanOrEqual(desborde.clientWidth);
    });
  }
});
