/**
 * Las pantallas de proceso de T-7, en el navegador.
 *
 * Lo que solo se puede comprobar acá:
 *
 *  1. **Que el detalle separe de verdad lo cumplido de lo que falta.** El
 *     cálculo ya está probado como función en `test/procesos-ui.spec.ts`; lo
 *     que esto agrega es que las dos listas estén dibujadas, con sus
 *     encabezados, y con las etapas correctas en cada una. Es el criterio de
 *     T-7 que una prueba de datos no puede ver: «si la pantalla solo muestra
 *     la etapa actual, la tarea no cumplió su objetivo aunque los datos estén
 *     bien».
 *  2. **Que los botones del editor del plan estén cableados al índice
 *     correcto**, y que los de una etapa cumplida directamente no existan.
 *  3. El criterio responsivo de §9 sobre el contenido nuevo.
 *
 * **Las respuestas de la API van interceptadas.** `vite dev` corre sin
 * identidad de Access, así que la API real contesta 403 y la pantalla se
 * dibujaría como un aviso de error: medir el layout de un párrafo suelto
 * sería exactamente la vacuidad que T-4 descubrió en su propia rejilla.
 */
import { expect, test, type Page } from "@playwright/test";

import { medirDesborde, porQueSeSale } from "./desborde";

const PROCESO_ID = "7c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f";
const CLIENTE_ID = "11111111-2222-4333-8444-555555555555";
const TIPO_ID = "66666666-7777-4888-8999-aaaaaaaaaaaa";

const CUMPLIDA_1 = "Recepción y revisión de documentos";
const CUMPLIDA_2 = "Presentación ante el Servicio Nacional de Migración";
const PENDIENTE_1 = "Entrevista y verificación domiciliaria";
const PENDIENTE_2 = "Resolución y entrega del carné";

const ETAPAS = [
  {
    id: "e1",
    nombre: CUMPLIDA_1,
    orden: 0,
    alcanzadaEn: "2026-09-01T15:00:00.000Z",
  },
  {
    id: "e2",
    nombre: CUMPLIDA_2,
    orden: 1,
    alcanzadaEn: "2026-09-18T15:00:00.000Z",
  },
  { id: "e3", nombre: PENDIENTE_1, orden: 2, alcanzadaEn: null },
  { id: "e4", nombre: PENDIENTE_2, orden: 3, alcanzadaEn: null },
];

const PROCESO = {
  id: PROCESO_ID,
  clienteId: CLIENTE_ID,
  clienteNombre: "Marta Quintero de Villalobos",
  tipoProcesoId: TIPO_ID,
  tipoProcesoNombre:
    "Permiso de residencia permanente por matrimonio con nacional",
  areaNombre: "Migración y naturalización",
  origen: "directo",
  titulo: "Residencia permanente de Marta Quintero de Villalobos",
  estado: "abierto",
  responsableId: null,
  responsableNombre: null,
  abiertoEn: "2026-08-15T15:00:00.000Z",
  cerradoEn: null,
  etapasCumplidas: 2,
  etapasTotales: 4,
  etapaVigente: PENDIENTE_1,
};

/** Un segundo proceso, para que el listado tenga de qué desbordar. */
const OTRO = {
  ...PROCESO,
  id: "7c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e60",
  clienteNombre: "Inversiones y Desarrollos del Istmo, S.A.",
  tipoProcesoNombre: "Constitución de sociedad anónima con capital extranjero",
  titulo:
    "Constitución de sociedad anónima para Inversiones y Desarrollos del Istmo",
  etapasCumplidas: 0,
  etapasTotales: 0,
  etapaVigente: null,
};

const DETALLE = { proceso: PROCESO, etapas: ETAPAS };

const AREA_ID = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";

/** Las áreas que alimentan el destino «tipo de proceso nuevo» de T-11. */
const AREAS = [
  { id: AREA_ID, nombre: "Migración y naturalización", activo: true },
  { id: "aaaa1111-2222-4333-8444-555555555555", nombre: "Familia", activo: true },
];

/**
 * La API, contestada desde acá.
 *
 * El filtro es un predicado sobre el `pathname` y no un glob de comodines
 * sobre `/api/`: ese glob también atrapa los módulos que sirve Vite en
 * desarrollo —`/src/api/peticiones.ts` entre ellos—, y una respuesta JSON en
 * lugar de un módulo deja la página en blanco sin un solo error visible. Es
 * la trampa que costó las 25 fallas iniciales de T-6.
 */
async function conProcesosCargados(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    async (ruta) => {
      const url = new URL(ruta.request().url());

      // T-11: guardar como plantilla es una escritura. Se contesta con el
      // tipo y la plantilla ya guardada, que es lo que la pantalla asienta.
      if (url.pathname === `/api/procesos/${PROCESO_ID}/plantilla`) {
        await ruta.fulfill({
          status: 200,
          json: {
            tipo: {
              id: TIPO_ID,
              areaId: AREA_ID,
              areaNombre: "Migración y naturalización",
              nombre: PROCESO.tipoProcesoNombre,
              descripcion: null,
              activo: true,
            },
            etapas: ETAPAS.map((etapa, orden) => ({
              id: `p${String(orden)}`,
              nombre: etapa.nombre,
              orden,
            })),
          },
        });
        return;
      }

      const cuerpo: Record<string, unknown> | null =
        url.pathname === "/api/procesos"
          ? { procesos: [PROCESO, OTRO] }
          : url.pathname === `/api/procesos/${PROCESO_ID}`
            ? DETALLE
            : url.pathname === "/api/areas"
              ? { areas: AREAS }
              : null;

      if (cuerpo === null) {
        await ruta.fulfill({ status: 404, json: { error: "not_found" } });
        return;
      }
      await ruta.fulfill({ status: 200, json: cuerpo });
    },
  );
}

const DETALLE_URL = `/procesos/${PROCESO_ID}`;

/** Los nombres del editor del plan, en el orden en que están dibujados. */
function planDibujado(page: Page): Promise<string[]> {
  return page
    .locator(".plantilla__etapa .campo__control")
    .evaluateAll((nodos) =>
      nodos.map((nodo) => (nodo as HTMLInputElement).value),
    );
}

/** Los anchos del criterio de §9, en los puntos donde suele quebrarse. */
const ANCHOS = [320, 360, 414, 767, 768, 1024, 1280, 1920, 2560] as const;
const ALTO = 900;

test.describe("los procesos del bufete", () => {
  test("el listado muestra el avance y, sobre todo, lo que viene", async ({
    page,
  }) => {
    await conProcesosCargados(page);
    await page.goto("/procesos");

    await expect(page.getByRole("heading", { name: "Procesos" })).toBeVisible();

    // La columna que justifica la pantalla.
    await expect(
      page.getByRole("columnheader", { name: "Lo que viene" }),
    ).toBeVisible();
    await expect(page.getByRole("cell", { name: PENDIENTE_1 })).toBeVisible();

    // Un proceso sin plan no se confunde con uno terminado.
    await expect(
      page.getByRole("cell", { name: "Sin plan todavía" }),
    ).toBeVisible();

    const filas = await page.locator("table tbody tr").count();
    expect(filas, "el listado tiene que traer filas").toBe(2);
  });

  test("el detalle separa lo cumplido de lo que falta, en dos listas", async ({
    page,
  }) => {
    await conProcesosCargados(page);
    await page.goto(DETALLE_URL);

    // El criterio de T-7: dos secciones, no una lista con la etapa actual.
    const cumplido = page.getByRole("heading", { name: "Cumplido" });
    const falta = page.getByRole("heading", { name: "Lo que falta" });
    await expect(cumplido).toBeVisible();
    await expect(falta).toBeVisible();

    // Y cada etapa en la lista que le toca, no solo en pantalla.
    const listaCumplida = page.locator(".plan--cumplido .plan__nombre");
    const listaPendiente = page.locator(".plan--pendiente .plan__nombre");

    await expect(listaCumplida).toHaveText([CUMPLIDA_1, CUMPLIDA_2]);
    await expect(listaPendiente).toHaveText([PENDIENTE_1, PENDIENTE_2]);

    // Lo cumplido lleva su fecha: es el registro, no una marca de color.
    await expect(page.locator(".plan__paso--cumplido .etiqueta")).toHaveCount(
      2,
    );
  });

  test("el botón de avanzar nombra la próxima etapa y avisa que no se deshace", async ({
    page,
  }) => {
    await conProcesosCargados(page);
    await page.goto(DETALLE_URL);

    await expect(
      page.getByRole("button", { name: `Avanzar a «${PENDIENTE_1}»` }),
    ).toBeEnabled();

    await expect(page.getByText(/No se puede deshacer/i)).toBeVisible();
  });

  test("una etapa cumplida no ofrece quitar ni mover; una pendiente sí", async ({
    page,
  }) => {
    await conProcesosCargados(page);
    await page.goto(DETALLE_URL);

    await expect(page.locator(".plantilla__etapa")).toHaveCount(ETAPAS.length);

    // La guarda, vista desde afuera: los botones de una cumplida no existen.
    await expect(
      page.getByRole("button", { name: `Quitar ${CUMPLIDA_1}` }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: `Subir ${CUMPLIDA_2}` }),
    ).toHaveCount(0);
    await expect(page.locator(".plantilla__etapa--cumplida")).toHaveCount(2);

    // Las pendientes sí.
    await expect(
      page.getByRole("button", { name: `Quitar ${PENDIENTE_1}` }),
    ).toBeVisible();

    // Y subir la PRIMERA pendiente está deshabilitado, porque arriba hay una
    // cumplida: sin esa guarda el paso se metería delante de algo que pasó.
    await expect(
      page.getByRole("button", { name: `Subir ${PENDIENTE_1}` }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: `Bajar ${PENDIENTE_2}` }),
    ).toBeDisabled();
  });

  test("reordenar dos pendientes las mueve y deja las cumplidas donde están", async ({
    page,
  }) => {
    await conProcesosCargados(page);
    await page.goto(DETALLE_URL);

    await expect(await planDibujado(page)).toEqual(
      ETAPAS.map((e) => e.nombre),
    );

    await page.getByRole("button", { name: `Subir ${PENDIENTE_2}` }).click();

    await expect
      .poll(() => planDibujado(page))
      .toEqual([CUMPLIDA_1, CUMPLIDA_2, PENDIENTE_2, PENDIENTE_1]);

    await expect(page.getByText("Hay cambios sin guardar")).toBeVisible();
  });

  test("quitar una pendiente la saca del plan y no toca lo cumplido", async ({
    page,
  }) => {
    await conProcesosCargados(page);
    await page.goto(DETALLE_URL);

    await page.getByRole("button", { name: `Quitar ${PENDIENTE_1}` }).click();

    await expect
      .poll(() => planDibujado(page))
      .toEqual([CUMPLIDA_1, CUMPLIDA_2, PENDIENTE_2]);
  });

  test("agregar un paso lo pone al final, detrás de todo lo cumplido", async ({
    page,
  }) => {
    await conProcesosCargados(page);
    await page.goto(DETALLE_URL);

    await page
      .getByLabel("Etapa nueva")
      .fill("Apostilla del acta de matrimonio");
    await page.getByRole("button", { name: "Agregar etapa" }).click();

    await expect
      .poll(() => planDibujado(page))
      .toEqual([
        CUMPLIDA_1,
        CUMPLIDA_2,
        PENDIENTE_1,
        PENDIENTE_2,
        "Apostilla del acta de matrimonio",
      ]);
  });

  test("el detalle dice que el plan es del proceso y no de la plantilla", async ({
    page,
  }) => {
    await conProcesosCargados(page);
    await page.goto(DETALLE_URL);

    // La contracara del aviso de T-6, en la pantalla contraria.
    await expect(
      page.getByText(/cambiarlo no toca la plantilla/i),
    ).toBeVisible();

    // Y la regla de §6 que obliga desde hoy: los nombres los lee el cliente.
    await expect(
      page.getByText(/los va a leer el cliente/i),
    ).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // T-11 · Guardar el plan como plantilla
  // -------------------------------------------------------------------------

  test("ofrece guardar el plan como plantilla, con el aviso de que no sincroniza nada", async ({
    page,
  }) => {
    await conProcesosCargados(page);
    await page.goto(DETALLE_URL);

    await expect(
      page.getByRole("heading", { name: "Guardar como plantilla" }),
    ).toBeVisible();

    // El aviso que no puede faltar, y en el momento de confirmar: acaba de
    // ajustar un plan y lo está «guardando», así que es natural creer que
    // eso lo sincroniza todo.
    await expect(
      page.getByText(/no cambia los procesos ya abiertos/i),
    ).toBeVisible();
    await expect(page.getByText(/ni siquiera éste/i)).toBeVisible();

    await expect(
      page.getByRole("button", { name: "Guardar como plantilla" }),
    ).toBeEnabled();
  });

  test("el destino por defecto actualiza la plantilla del tipo, sin pedir nada más", async ({
    page,
  }) => {
    await conProcesosCargados(page);
    await page.goto(DETALLE_URL);

    await expect(
      page.getByRole("radio", { name: /Actualizar la plantilla/ }),
    ).toBeChecked();

    // Los campos del tipo nuevo no están: no se piden hasta que hacen falta.
    await expect(page.getByLabel("Área del tipo nuevo")).toHaveCount(0);
    await expect(page.getByLabel("Nombre del tipo nuevo")).toHaveCount(0);
  });

  test("elegir «un tipo de proceso nuevo» pide el área y el nombre, y avisa que no reasigna", async ({
    page,
  }) => {
    await conProcesosCargados(page);
    await page.goto(DETALLE_URL);

    await page
      .getByRole("radio", { name: /Crear un tipo de proceso nuevo/ })
      .check();

    await expect(page.getByLabel("Área del tipo nuevo")).toBeVisible();
    await expect(page.getByLabel("Nombre del tipo nuevo")).toBeVisible();

    // El área se ofrece desde el catálogo, no se escribe a mano.
    await expect(
      page.getByLabel("Área del tipo nuevo").locator("option"),
    ).toHaveCount(AREAS.length + 1);

    // La decisión de T-11, dicha en la pantalla.
    await expect(
      page.getByText(/sigue siendo del tipo que ya tenía/i),
    ).toBeVisible();
  });

  test("guardar la plantilla confirma en pantalla y no toca el plan dibujado", async ({
    page,
  }) => {
    await conProcesosCargados(page);
    await page.goto(DETALLE_URL);

    await page
      .getByRole("button", { name: "Guardar como plantilla" })
      .click();

    await expect(page.getByText(/La plantilla quedó guardada/i)).toBeVisible();

    // Y el plan del proceso sigue exactamente igual: es la propiedad que la
    // pantalla promete.
    await expect(await planDibujado(page)).toEqual(ETAPAS.map((e) => e.nombre));
  });

  for (const ancho of ANCHOS) {
    test(`a ${String(ancho)}px de ancho, sobre el listado de procesos`, async ({
      page,
    }) => {
      await conProcesosCargados(page);
      await page.setViewportSize({ width: ancho, height: ALTO });
      await page.goto("/procesos");
      await page.evaluate(() => document.fonts.ready);
      await page.locator("table tbody tr").first().waitFor();

      const desborde = await medirDesborde(page);

      expect(
        desborde.scrollWidth,
        porQueSeSale(ancho, desborde),
      ).toBeLessThanOrEqual(desborde.clientWidth);
    });
  }

  for (const ancho of ANCHOS) {
    test(`a ${String(ancho)}px de ancho, sobre el detalle de un proceso`, async ({
      page,
    }) => {
      await conProcesosCargados(page);
      await page.setViewportSize({ width: ancho, height: ALTO });
      await page.goto(DETALLE_URL);
      await page.evaluate(() => document.fonts.ready);
      await page.locator(".plantilla__etapa .campo__control").first().waitFor();

      const desborde = await medirDesborde(page);

      expect(
        desborde.scrollWidth,
        porQueSeSale(ancho, desborde),
      ).toBeLessThanOrEqual(desborde.clientWidth);
    });
  }
});
