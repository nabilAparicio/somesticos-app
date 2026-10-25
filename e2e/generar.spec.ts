/**
 * La pantalla del generador (T-9), en el navegador.
 *
 * Cuatro cosas que sólo se pueden comprobar acá:
 *
 *  1. **Que lo que el abogado escribió no se pierda.** Es el requisito más
 *     fácil de romper y el más caro: una descripción de cinco renglones que
 *     desaparece porque el proveedor tuvo un mal minuto es la razón por la
 *     que nadie vuelve a usar la pantalla. Una prueba de función no lo puede
 *     ver, porque lo que se pierde es el estado de un componente.
 *  2. **Que los cuatro motivos de falla lleguen distintos hasta el texto
 *     dibujado.** `test/generar-ui.spec.ts` afirma que los textos existen y
 *     son distintos; esto afirma que el que corresponde es el que aparece.
 *  3. **Que lo generado se abra para editar.** El borrador que sale no es un
 *     documento terminado: se cae en el detalle, con sus módulos y sus
 *     líneas modificables.
 *  4. El criterio responsivo de §9 sobre la pantalla nueva, con contenido
 *     hostil de verdad — la lección de T-3 B: una medida de ancho sobre
 *     texto corriente no mide contención, porque el navegador lo parte solo.
 *
 * **Las respuestas de la API van interceptadas.** `vite dev` corre sin
 * identidad de Access, así que la API real contesta 403 y la pantalla se
 * dibujaría como un aviso de error: medir el layout de un párrafo suelto
 * sería la vacuidad que T-4 descubrió en su propia rejilla. Y ninguna de
 * estas pruebas llama al modelo: no hay proveedor detrás de `vite dev`.
 */
import { expect, test, type Page } from "@playwright/test";

import { medirDesborde, porQueSeSale } from "./desborde";

const CLIENTE_ID = "4a3f1d0e-0e2c-4c1f-9a6b-2d8a1c5e7b90";
const GENERADA_ID = "9c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e70";

const NOMBRE_DEL_CLIENTE = "Carlos Pérez Domínguez";

const CLIENTES = [
  {
    id: CLIENTE_ID,
    tipoClienteId: null,
    tipoClienteNombre: null,
    nombre: NOMBRE_DEL_CLIENTE,
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

/**
 * Lo que el abogado escribe, con un token pegado adentro.
 *
 * El token sin espacios ni guiones es lo que hace que las medidas de §9
 * midan algo: es la lección de T-3 B y de T-4. Un párrafo corriente lo parte
 * el navegador solo, así que no puede empujar nada y la medida pasa sin
 * tocar la contención que dice vigilar.
 *
 * Y es también lo que hace creíble la prueba de que no se pierde: si
 * sobrevive un token de setenta caracteres, sobrevive cualquier cosa.
 */
const DESCRIPCION =
  "Divorcio de mutuo acuerdo, hay bienes, el cliente pide pago diferido." +
  " Referencia DIVORCIODEMUTUOACUERDOCONPARTICIONDEBIENESGANANCIALESPANAMAOESTE.";

/**
 * La cotización que el generador devuelve. **No es un eco de lo que se
 * envió**: su código y su identificador los puso el servidor, y nada de lo
 * que se tecleó aparece acá. Es la lección de esta tajada — un doble que
 * devuelve lo que se le mandó no distingue una pantalla que dibuja la
 * respuesta de una que conserva lo tecleado.
 */
const GENERADA = {
  id: GENERADA_ID,
  codigo: "COT-2026-0042",
  estado: "borrador",
  clienteId: CLIENTE_ID,
  clienteNombre: NOMBRE_DEL_CLIENTE,
  fecha: "2026-10-25T14:03:00.000Z",
  venceEn: null,
  moneda: "USD",
  duplicadaDeId: null,
  creadaPor: "u1",
  creadaPorNombre: "Itzel",
  creadaEn: "2026-10-25T14:03:00.000Z",
};

const MODULOS_GENERADOS = [
  {
    id: "7a0f0b11-9111-4111-8111-000000000011",
    tipo: "antecedentes",
    orden: 0,
    contenido: "El cliente vino por un divorcio de mutuo acuerdo.",
  },
  {
    id: "7a0f0b11-9222-4222-8222-000000000012",
    tipo: "alcance",
    orden: 1,
    contenido: "Redacción del convenio y presentación.",
  },
];

const LINEAS_GENERADAS = [
  {
    id: "8b1f0c11-9111-4111-8111-000000000011",
    clase: "honorario",
    concepto: "Honorarios del divorcio",
    monto: 150_000,
    tipoProcesoId: null,
    tipoProcesoNombre: null,
    orden: 0,
  },
  {
    id: "8b1f0c11-9222-4222-8222-000000000012",
    clase: "gasto_estimado",
    concepto: "Timbres y copias",
    monto: 2_550,
    tipoProcesoId: null,
    tipoProcesoNombre: null,
    orden: 1,
  },
];

const TOTALES_GENERADOS = {
  honorarios: 150_000,
  gastosEstimados: 2_550,
  total: 152_550,
};

/**
 * Las lecturas que la pantalla del generador y el detalle al que cae
 * necesitan. Sólo lecturas: la escritura la contesta cada prueba, porque es
 * lo único que cambia entre ellas.
 */
function lecturaDe(pathname: string): Record<string, unknown> | null {
  if (pathname === "/api/clientes") return { clientes: CLIENTES };
  if (pathname === "/api/tipos-proceso") return { tipos: [] };
  if (pathname === "/api/cotizaciones") return { cotizaciones: [] };
  if (pathname === `/api/cotizaciones/${GENERADA_ID}`) {
    return { cotizacion: GENERADA };
  }
  if (pathname === `/api/cotizaciones/${GENERADA_ID}/modulos`) {
    return { modulos: MODULOS_GENERADOS };
  }
  if (pathname === `/api/cotizaciones/${GENERADA_ID}/lineas`) {
    return { lineas: LINEAS_GENERADAS, totales: TOTALES_GENERADOS };
  }
  if (/^\/api\/cotizaciones\/[^/]+\/bitacora$/.test(pathname)) {
    return { entradas: [], total: 0 };
  }

  return null;
}

type RespuestaDeGeneracion =
  | { readonly ok: true }
  | { readonly ok: false; readonly motivo: string };

/**
 * La API, contestada desde acá.
 *
 * El filtro es un predicado sobre el `pathname` y no un glob de dos
 * asteriscos sobre «api»: ese glob también atrapa los módulos que sirve Vite
 * en desarrollo, y una respuesta JSON en lugar de un módulo deja la página
 * en blanco sin un solo error visible.
 */
async function conLaApi(
  page: Page,
  generacion: RespuestaDeGeneracion,
): Promise<void> {
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    async (ruta) => {
      const url = new URL(ruta.request().url());

      if (url.pathname === "/api/cotizaciones/generar") {
        if (generacion.ok) {
          await ruta.fulfill({ status: 201, json: { cotizacion: GENERADA } });
          return;
        }

        await ruta.fulfill({
          status: 502,
          json: { error: "generacion_fallida", motivo: generacion.motivo },
        });
        return;
      }

      const cuerpo = lecturaDe(url.pathname);
      if (cuerpo === null) {
        await ruta.fulfill({ status: 404, json: { error: "not_found" } });
        return;
      }

      await ruta.fulfill({ status: 200, json: cuerpo });
    },
  );
}

/** Rellena los dos campos y aprieta. Lo hacen casi todas las pruebas. */
async function describirYGenerar(page: Page): Promise<void> {
  await page.goto("/cotizaciones/generar");

  await page.getByLabel("Cliente").selectOption(CLIENTE_ID);
  await page.getByLabel("Descripción del encargo").fill(DESCRIPCION);
  await page.getByRole("button", { name: "Generar el borrador" }).click();
}

const ANCHOS = [320, 360, 414, 767, 768, 1024, 1280, 1920, 2560] as const;

test.describe("generar un borrador desde una descripción", () => {
  test("la pantalla pide el cliente y la prosa, y nada más", async ({
    page,
  }) => {
    await conLaApi(page, { ok: true });
    await page.goto("/cotizaciones/generar");

    await expect(
      page.getByRole("heading", { name: "Generar una cotización" }),
    ).toBeVisible();

    await expect(page.getByLabel("Cliente")).toBeVisible();
    await expect(page.getByLabel("Descripción del encargo")).toBeVisible();

    // **No hay campos de módulos, de líneas ni de montos.** Lo que sale es
    // un borrador que después se edita; ofrecer acá lo que el detalle ya
    // ofrece sería una segunda pantalla de edición.
    await expect(page.getByLabel("Concepto")).toHaveCount(0);
    await expect(page.getByLabel("Importe")).toHaveCount(0);
  });

  test("se llega desde el listado de cotizaciones", async ({ page }) => {
    await conLaApi(page, { ok: true });
    await page.goto("/cotizaciones");

    await page
      .getByRole("link", { name: "Generar desde una descripción" })
      .click();

    await expect(
      page.getByRole("heading", { name: "Generar una cotización" }),
    ).toBeVisible();
  });

  test("lo que sale es un borrador abierto para editar", async ({ page }) => {
    await conLaApi(page, { ok: true });
    await describirYGenerar(page);

    // Cae en el detalle de la cotización nueva, no en una pantalla de
    // resultado propia: lo generado es un borrador como cualquier otro.
    await expect(page).toHaveURL(new RegExp(`/cotizaciones/${GENERADA_ID}$`));
    await expect(
      page.getByRole("heading", { name: "COT-2026-0042" }),
    ).toBeVisible();

    // Y se ve que es un borrador.
    await expect(page.getByText("Borrador").first()).toBeVisible();

    // **Y todo lo generado está dentro de un control editable.**
    // Se busca el control por su rótulo y se afirma su `value`, en vez de
    // buscar el texto suelto, y la diferencia es justo lo que esta prueba
    // mide: `getByText` encontraría el texto igual si estuviera dibujado en
    // modo lectura —que es como se ve una emitida— y entonces pasaría sin
    // haber comprobado nada de lo que dice comprobar.
    await expect(
      page.getByLabel("Texto del módulo 1: Antecedentes"),
      "la prosa generada no está en un control: salió en modo lectura",
    ).toHaveValue("El cliente vino por un divorcio de mutuo acuerdo.");
    await expect(
      page.getByLabel("Concepto de la línea 1 de Honorarios"),
      "la línea generada no está en un control: salió en modo lectura",
    ).toHaveValue("Honorarios del divorcio");

    // Y el total lo muestra el sistema, sumado de las líneas que viajaron
    // con él: la pantalla no suma nada.
    await expect(page.getByText("1,525.50").first()).toBeVisible();
  });

  test("no se puede generar sin descripción, y no sale ningún pedido", async ({
    page,
  }) => {
    await conLaApi(page, { ok: true });

    const pedidos: string[] = [];
    page.on("request", (peticion) => {
      if (new URL(peticion.url()).pathname === "/api/cotizaciones/generar") {
        pedidos.push(peticion.url());
      }
    });

    await page.goto("/cotizaciones/generar");
    await page.getByLabel("Cliente").selectOption(CLIENTE_ID);
    await page.getByRole("button", { name: "Generar el borrador" }).click();

    await expect(
      page.getByText(
        "Sin una descripción del encargo no hay nada que generar.",
      ),
    ).toBeVisible();

    // `.count()` y no `toHaveCount`: para un «nunca» hace falta la foto del
    // instante. `toHaveCount(0)` tolera justamente la ventana que se quiere
    // prohibir.
    expect(pedidos.length).toBe(0);
    await expect(page).toHaveURL(/\/cotizaciones\/generar$/);
  });
});

/* ==========================================================================
   Cuando el modelo falla
   ========================================================================== */

/**
 * Los cuatro motivos que el bufete va a ver de verdad, con la pieza de su
 * frase que los distingue. La frase entera no se afirma —reescribirla no es
 * un defecto—; lo que se afirma es que **no son la misma**.
 */
const MOTIVOS = [
  { motivo: "proveedor_no_disponible", dice: "no contestó" },
  { motivo: "respuesta_ininteligible", dice: "no se entendió" },
  { motivo: "respuesta_truncada", dice: "se cortó" },
  { motivo: "respuesta_rechazada_por_el_proveedor", dice: "declinó" },
] as const;

test.describe("cuando el modelo falla, la descripción no se pierde", () => {
  for (const { motivo, dice } of MOTIVOS) {
    test(`«${motivo}»: su mensaje y la prosa intacta`, async ({ page }) => {
      await conLaApi(page, { ok: false, motivo });
      await describirYGenerar(page);

      // El motivo correcto, y no un «algo salió mal» para los cuatro.
      await expect(page.getByText(dice)).toBeVisible();

      // **Lo que el abogado escribió sigue ahí, carácter por carácter.**
      await expect(
        page.getByLabel("Descripción del encargo"),
        "la descripción se perdió: nadie vuelve a escribir cinco renglones",
      ).toHaveValue(DESCRIPCION);

      // Y el cliente elegido también: volver a elegirlo es la otra mitad
      // del trabajo que se perdería.
      await expect(page.getByLabel("Cliente")).toHaveValue(CLIENTE_ID);

      // No navegó a ningún lado: no hay borrador al que ir.
      await expect(page).toHaveURL(/\/cotizaciones\/generar$/);
    });
  }

  test("se puede volver a intentar sin reescribir nada", async ({ page }) => {
    await conLaApi(page, { ok: false, motivo: "proveedor_no_disponible" });
    await describirYGenerar(page);

    await expect(page.getByText("no contestó")).toBeVisible();

    // El botón vuelve a quedar disponible: una pantalla que se bloquea
    // después de una falla del proveedor obliga a recargar y ahí sí se
    // pierde todo.
    await expect(
      page.getByRole("button", { name: "Generar el borrador" }),
    ).toBeEnabled();
  });
});

/* ==========================================================================
   El criterio responsivo de §9
   ========================================================================== */

test.describe("la página no scrollea en horizontal", () => {
  for (const ancho of ANCHOS) {
    test(`a ${String(ancho)}px, sobre el generador con la prosa escrita`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: ancho, height: 900 });
      // La falla deja en pantalla el token pegado **y** el aviso de error,
      // que es el estado con más contenido que esta pantalla sabe tener.
      await conLaApi(page, { ok: false, motivo: "respuesta_truncada" });
      await describirYGenerar(page);

      await expect(page.getByText("se cortó")).toBeVisible();

      const desborde = await medirDesborde(page);
      expect(desborde.scrollWidth, porQueSeSale(ancho, desborde)).toBeLessThanOrEqual(
        desborde.clientWidth,
      );
    });
  }
});
