/**
 * La ficha de un cliente, en el navegador (T-16).
 *
 * Lo que solo se puede comprobar acá: **que desde la ficha de un cliente se
 * llegue a sus cotizaciones**. Hasta T-16 el detalle mostraba procesos,
 * bitácora y notas, y de las cotizaciones del cliente no había ni rastro:
 * una cotización ganada existía en el listado general y era inalcanzable
 * desde la ficha de quien la había encargado.
 *
 * El filtro corre en el navegador sobre `GET /api/cotizaciones`, que
 * devuelve cada fila con su `clienteId`. Que el filtro acierte está probado
 * como función en `test/clientes-ui.spec.ts`; lo que esto agrega es que lo
 * filtrado se dibuje, con su enlace y con su estado a la vista.
 *
 * **Las respuestas de la API van interceptadas.** `vite dev` corre sin
 * identidad de Access, así que la API real contesta 403 y la ficha se
 * dibujaría como un aviso de error.
 *
 * El filtro es un predicado sobre el `pathname` y no un glob de comodines
 * sobre `/api/`: ese glob también atrapa los módulos que sirve Vite en
 * desarrollo, y una respuesta JSON en lugar de un módulo deja la página en
 * blanco sin un solo error visible.
 */
import { expect, test, type Page } from "@playwright/test";

const CLIENTE_ID = "11111111-2222-4333-8444-555555555555";
const OTRO_CLIENTE_ID = "99999999-8888-4777-8666-555555555555";

const CLIENTE = {
  id: CLIENTE_ID,
  tipoClienteId: "t1",
  tipoClienteNombre: "Empresa",
  nombre: "Inversiones Casco Viejo, S.A.",
  documentoTipo: "RUC",
  documentoNumero: "155-2024-1",
  representanteLegal: "Ana Gómez",
  email: "ana@ejemplo.test",
  telefono: "+507 6123-4567",
  notas: null,
  creadoPor: "u1",
  creadoPorNombre: "Itzel",
  creadoEn: "2026-10-22T14:03:00.000Z",
};

function cotizacion(ajustes: Record<string, unknown>): Record<string, unknown> {
  return {
    id: "7c3d9a1b-2e4f-4a56-9b88-1d2e3f4a5b6c",
    codigo: "COT-2026-0001",
    estado: "ganada",
    clienteId: CLIENTE_ID,
    clienteNombre: CLIENTE.nombre,
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

/** La ganada del cliente: la que el bufete va a buscar desde la ficha. */
const GANADA = cotizacion({});

/** Un borrador del mismo cliente: un estado no se lee igual que el otro. */
const BORRADOR = cotizacion({
  id: "1d2e3f4a-5b6c-4a56-9b88-7c3d9a1b2e4f",
  codigo: "COT-2026-0007",
  estado: "borrador",
  venceEn: "2026-12-31",
});

/** Y una de otro cliente, que **no** tiene que aparecer en esta ficha. */
const AJENA = cotizacion({
  id: "5b6c1d2e-3f4a-4a56-9b88-9a1b2e4f7c3d",
  codigo: "COT-2026-0099",
  clienteId: OTRO_CLIENTE_ID,
  clienteNombre: "Otro bufete del istmo, S.A.",
});

type Banco = {
  /** Qué contesta el listado general de cotizaciones. */
  readonly cotizaciones?: readonly Record<string, unknown>[];
  /** Si el listado de cotizaciones tiene que fallar. */
  readonly falla?: boolean;
};

async function conLaFichaCargada(page: Page, banco: Banco = {}): Promise<void> {
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    async (ruta) => {
      const url = new URL(ruta.request().url());

      if (url.pathname === "/api/cotizaciones") {
        if (banco.falla === true) {
          await ruta.fulfill({ status: 500, json: { error: "interno" } });
          return;
        }
        await ruta.fulfill({
          status: 200,
          json: { cotizaciones: banco.cotizaciones ?? [GANADA, BORRADOR, AJENA] },
        });
        return;
      }

      // La bitácora primero: su ruta empieza con la de la ficha.
      const cuerpo: Record<string, unknown> | null =
        url.pathname === `/api/clientes/${CLIENTE_ID}/bitacora`
          ? { entradas: [], total: 0 }
          : url.pathname === `/api/clientes/${CLIENTE_ID}`
            ? { cliente: CLIENTE }
            : url.pathname === "/api/procesos"
              ? { procesos: [] }
              : null;

      if (cuerpo === null) {
        await ruta.fulfill({ status: 404, json: { error: "not_found" } });
        return;
      }
      await ruta.fulfill({ status: 200, json: cuerpo });
    },
  );
}

const FICHA_URL = `/clientes/${CLIENTE_ID}`;

/**
 * La sección de cotizaciones, **con `exact`**.
 *
 * Sin él, el nombre «Cotizaciones» también resuelve la región de la tabla
 * —que se llama «Cotizaciones de Inversiones Casco Viejo, S.A.»— porque los
 * localizadores de Playwright buscan por subcadena, y dos coincidencias son
 * una violación del modo estricto. Es la misma trampa que ya tenía la
 * sección de procesos, que nadie había pisado porque ninguna prueba de
 * punta a punta abría esta ficha.
 */
function seccion(page: Page) {
  return page.getByRole("region", { name: "Cotizaciones", exact: true });
}

test.describe("las cotizaciones del cliente en su ficha", () => {
  test("lista las del cliente, con enlace y con su estado", async ({
    page,
  }) => {
    await conLaFichaCargada(page);
    await page.goto(FICHA_URL);

    const cotizaciones = seccion(page);
    await expect(cotizaciones).toBeVisible();

    // La ganada, que es la que el bufete viene a buscar, y su enlace.
    const enlace = cotizaciones.getByRole("link", { name: "COT-2026-0001" });
    await expect(enlace).toHaveAttribute(
      "href",
      `/cotizaciones/${String(GANADA.id)}`,
    );

    // Y el estado de cada una, que es lo que distingue un borrador de una
    // ganada sin abrirlas. Las etiquetas se cuentan **dentro de la
    // sección**: sobre el documento entero también entraría la marca de
    // «pendiente» de la navegación del esqueleto.
    await expect(cotizaciones).toContainText("Ganada");
    await expect(cotizaciones).toContainText("Borrador");
    await expect(cotizaciones.locator(".etiqueta")).toHaveCount(2);
  });

  test("y deja afuera las de otros clientes", async ({ page }) => {
    // El contrapeso de la de arriba: una sección que dibujara el listado
    // entero pasaría todas las afirmaciones de presencia.
    await conLaFichaCargada(page);
    await page.goto(FICHA_URL);

    const cotizaciones = seccion(page);
    await expect(cotizaciones).toContainText("COT-2026-0001");
    await expect(cotizaciones).not.toContainText("COT-2026-0099");
  });

  test("un cliente sin cotizaciones lo dice en vez de mostrar una tabla vacía", async ({
    page,
  }) => {
    await conLaFichaCargada(page, { cotizaciones: [AJENA] });
    await page.goto(FICHA_URL);

    const cotizaciones = seccion(page);
    await expect(cotizaciones).toContainText(
      "todavía no tiene ninguna cotización",
    );
    await expect(cotizaciones.getByRole("link")).toHaveCount(0);
  });

  test("si el listado falla, la ficha no se queda en blanco", async ({
    page,
  }) => {
    // Es la misma razón por la que los procesos y la bitácora se piden
    // aparte: un fallo de una lectura no puede llevarse la ficha entera.
    await conLaFichaCargada(page, { falla: true });
    await page.goto(FICHA_URL);

    await expect(
      page.getByRole("heading", { name: "Inversiones Casco Viejo, S.A." }),
    ).toBeVisible();
    await expect(seccion(page)).toBeVisible();
  });
});
