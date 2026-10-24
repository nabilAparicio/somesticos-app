/**
 * Las pantallas de la cotización en borrador (T-2, unidad B), en el
 * navegador.
 *
 * Tres cosas que solo se pueden comprobar acá:
 *
 *  1. **El `min` del campo de fecha llega al atributo.** `minimoDeVencimiento`
 *     ya está probado como función; lo que esto agrega es que el componente
 *     la llame con los dos argumentos correctos —el reloj y el vencimiento
 *     guardado— y que el resultado termine en el control. Es justo el cableado
 *     que una prueba de función no puede ver, y es donde el defecto de las
 *     fechas se escondió durante seis tareas.
 *  2. **Que la pantalla no ofrezca lo que no existe.** Emitir, ganar, perder,
 *     duplicar, módulos y líneas son de otras tareas. Que no estén escritos
 *     en los componentes se ve leyendo; que no aparezcan dibujados, acá.
 *  3. El criterio responsivo de §9 sobre el contenido nuevo.
 *
 * **Las respuestas de la API van interceptadas.** `vite dev` corre sin
 * identidad de Access, así que la API real contesta 403 y la pantalla se
 * dibujaría como un aviso de error: medir el layout de un párrafo suelto
 * sería la vacuidad que T-4 descubrió en su propia rejilla.
 */
import { expect, test, type Page } from "@playwright/test";

import { medirDesborde, porQueSeSale } from "./desborde";

const BORRADOR_ID = "9c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f";
const BORRADOR_VIEJO_ID = "9c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e60";
const EMITIDA_ID = "9c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e61";

const CLIENTE_ID = "4a3f1d0e-0e2c-4c1f-9a6b-2d8a1c5e7b90";
const OTRO_CLIENTE_ID = "4a3f1d0e-0e2c-4c1f-9a6b-2d8a1c5e7b91";

/**
 * El vencimiento ya pasado de un borrador viejo.
 *
 * Es un literal y **no** se deriva del reloj, al revés que `hoyDeLaPrueba`
 * de más abajo: un día de 2024 es pasado para siempre, así que esta
 * expectativa no caduca. Lo que caduca es un literal futuro escrito a mano
 * —`2027-01-15` empieza a fallar solo el 16 de enero de 2027—, y de ésos no
 * hay ninguno en este archivo.
 */
const VENCIMIENTO_VIEJO = "2024-03-01";

const UNA_HORA = 3_600_000;

/**
 * Panamá es UTC−5 todo el año. Se escribe acá **a mano** y no se importa de
 * `worker/db/momentos.ts` a propósito: una prueba que calcula su expectativa
 * con la misma función que está probando pasa aunque las dos estén mal. Es
 * la restricción 6 de la tajada, y es la misma precaución que toma
 * `test/cotizaciones-api.spec.ts`.
 */
const CORRIMIENTO_DE_PANAMA = 5 * UNA_HORA;

/** Hoy en Panamá, derivado del reloj por un camino propio. */
function hoyDeLaPrueba(): string {
  return new Date(Date.now() - CORRIMIENTO_DE_PANAMA)
    .toISOString()
    .slice(0, 10);
}

/** El nombre del cliente que la cotización de prueba ya tiene. */
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
  {
    id: OTRO_CLIENTE_ID,
    tipoClienteId: null,
    tipoClienteNombre: null,
    /*
     * Un nombre pegado, sin espacios ni guiones, o sea sin punto de corte.
     * Es la lección de T-4: un token con guiones no sirve como contenido
     * hostil porque el navegador lo parte solo, y sin contenido hostil la
     * medida de §9 no mide nada.
     */
    nombre: "INMOBILIARIADESARROLLOSDELISTMOSOCIEDADANONIMAPANAMAOESTE",
    documentoTipo: "RUC",
    documentoNumero: "155555555-2-2015",
    representanteLegal: null,
    email: "contacto@istmo.test",
    telefono: null,
    notas: null,
    creadoPor: "u1",
    creadoPorNombre: "Itzel",
    creadoEn: "2026-09-02T14:03:00.000Z",
  },
];

function cotizacion(ajustes: Record<string, unknown>): Record<string, unknown> {
  return {
    id: BORRADOR_ID,
    codigo: "COT-2026-0007",
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

const BORRADOR = cotizacion({});

const BORRADOR_VIEJO = cotizacion({
  id: BORRADOR_VIEJO_ID,
  codigo: "COT-2024-0001",
  fecha: "2024-02-01T14:03:00.000Z",
  creadaEn: "2024-02-01T14:03:00.000Z",
  venceEn: VENCIMIENTO_VIEJO,
});

const EMITIDA = cotizacion({
  id: EMITIDA_ID,
  codigo: "COT-2026-0008",
  estado: "emitida",
  clienteId: OTRO_CLIENTE_ID,
  clienteNombre: CLIENTES[1].nombre,
});

const BITACORA = {
  entradas: [
    {
      id: "h1",
      entidad: "cotizacion",
      entidadId: BORRADOR_ID,
      accion: "creado",
      usuarioId: "u1",
      usuarioNombre: "Itzel",
      ocurridoEn: "2026-10-22T14:03:00.000Z",
      detalle: "COT-2026-0007",
    },
  ],
  total: 1,
};

const COTIZACIONES = [BORRADOR, BORRADOR_VIEJO, EMITIDA];

function cuerpoDe(pathname: string): Record<string, unknown> | null {
  if (/^\/api\/cotizaciones\/[^/]+\/bitacora$/.test(pathname)) return BITACORA;

  if (pathname === "/api/cotizaciones") return { cotizaciones: COTIZACIONES };
  if (pathname === "/api/clientes") return { clientes: CLIENTES };

  for (const cotizacion of COTIZACIONES) {
    if (pathname === `/api/cotizaciones/${String(cotizacion.id)}`) {
      return { cotizacion };
    }
  }

  return null;
}

/**
 * La API, contestada desde acá. Solo lecturas: estas pruebas miden layout y
 * cableado, no escritura — eso vive en `test/cotizaciones-api.spec.ts`,
 * contra una base de verdad.
 *
 * El filtro es un predicado sobre el `pathname` y no un glob de dos
 * asteriscos sobre «api»: ese glob también atrapa los módulos que sirve Vite
 * en desarrollo —`/src/api/peticiones.ts` entre ellos—, y una respuesta JSON
 * en lugar de un módulo deja la página en blanco sin un solo error visible.
 */
async function conCotizacionesCargadas(page: Page): Promise<void> {
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

const ANCHOS = [320, 360, 414, 767, 768, 1024, 1280, 1920, 2560] as const;

test.describe("las cotizaciones del bufete", () => {
  test("el listado trae las filas, con el código como encabezado de fila", async ({
    page,
  }) => {
    await conCotizacionesCargadas(page);
    await page.goto("/cotizaciones");

    // El código va en un `<th scope="row">`, que es `rowheader` y **no**
    // `cell`: un `getByRole("cell")` acá no encontraría nada y la aserción
    // pasaría sin probar nada.
    await expect(
      page.getByRole("rowheader", { name: "COT-2026-0007" }),
    ).toBeVisible();
    await expect(
      page.getByRole("rowheader", { name: "COT-2026-0008" }),
    ).toBeVisible();

    // El estado se muestra. Lo que no hay es con qué cambiarlo.
    await expect(page.getByText("Emitida").first()).toBeVisible();

    // `toHaveCount` y no `.count()`: el segundo es una foto del instante y
    // no reintenta, así que mide lo que haya montado React hasta ahí.
    await expect(
      page.locator("table tbody tr"),
      "la tabla tiene que traer las tres filas",
    ).toHaveCount(3);
  });

  test("la más nueva va primero", async ({ page }) => {
    await conCotizacionesCargadas(page);
    await page.goto("/cotizaciones");

    // La espera va primero y no es adorno: `allInnerTexts` no reintenta, así
    // que leer apenas vuelve el `goto` devuelve lo que React alcanzó a
    // montar —a veces nada, a veces media tabla— y la falla se lee como un
    // orden equivocado cuando en realidad es una lectura temprana.
    const filas = page.locator("table tbody th[scope='row']");
    await expect(filas).toHaveCount(3);

    const codigos = await filas.allInnerTexts();

    // El borrador de 2024 llega primero en la respuesta y tiene que quedar
    // último: el orden lo pone la pantalla, no el arreglo que llegó.
    expect(codigos).toEqual([
      "COT-2026-0008",
      "COT-2026-0007",
      "COT-2024-0001",
    ]);
  });

  test("el buscador filtra por cliente, acentos aparte", async ({ page }) => {
    await conCotizacionesCargadas(page);
    await page.goto("/cotizaciones");

    await page.getByLabel("Buscar").fill("perez");

    await expect(page.locator("table tbody tr")).toHaveCount(2);
    await expect(
      page.getByRole("rowheader", { name: "COT-2026-0008" }),
    ).toBeHidden();
  });

  test("el detalle de un borrador deja editarlo y no ofrece nada más", async ({
    page,
  }) => {
    await conCotizacionesCargadas(page);
    await page.goto(`/cotizaciones/${BORRADOR_ID}`);

    await expect(
      page.getByRole("heading", { name: "COT-2026-0007" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Editar" })).toBeVisible();

    // Emitir, ganar, perder y duplicar son de T-4 y T-5; los módulos y las
    // líneas, de la unidad C y de T-3. Ni como botón ni como texto apagado:
    // un control deshabilitado promete una pantalla que no existe.
    for (const palabra of [
      "Emitir",
      "Duplicar",
      "Ganada",
      "Perdida",
      "Módulos",
      "Líneas",
      "Total",
    ]) {
      await expect(
        page.getByText(palabra, { exact: false }),
        `«${palabra}» no es de esta tarea y no puede estar dibujado`,
      ).toHaveCount(0);
    }
  });

  test("el detalle de lo que ya se emitió dice por qué no hay botón de editar", async ({
    page,
  }) => {
    await conCotizacionesCargadas(page);
    await page.goto(`/cotizaciones/${EMITIDA_ID}`);

    await expect(page.getByRole("link", { name: "Editar" })).toHaveCount(0);
    // Un botón que falta sin explicación se lee como un defecto de la
    // pantalla.
    await expect(page.getByText("ya no es un borrador")).toBeVisible();
  });

  test("la bitácora de la cotización se lee en el detalle", async ({
    page,
  }) => {
    await conCotizacionesCargadas(page);
    await page.goto(`/cotizaciones/${BORRADOR_ID}`);

    await expect(
      page.getByText("Itzel dio de alta «COT-2026-0007»."),
    ).toBeVisible();
  });

  /* --- El `min` del campo de fecha, sus dos mitades ---------------------- */

  test("en el alta, el mínimo del campo de fecha es hoy en Panamá", async ({
    page,
  }) => {
    await conCotizacionesCargadas(page);
    await page.goto("/cotizaciones/nuevo");

    const campo = page.getByLabel("Vence el");
    await expect(campo).toBeVisible();

    // Con el día de UTC esto sería mañana a partir de las siete de la tarde
    // hora local, y el control no dejaría elegir hoy mientras el servidor sí
    // lo acepta.
    await expect(campo).toHaveAttribute("min", hoyDeLaPrueba());
  });

  test("editando un borrador vencido, el mínimo baja hasta su propio valor", async ({
    page,
  }) => {
    await conCotizacionesCargadas(page);
    await page.goto(`/cotizaciones/${BORRADOR_VIEJO_ID}/editar`);

    const campo = page.getByLabel("Vence el");

    // Con `min = hoy` el control no podría ni mostrar su propio valor: un
    // `<input type="date">` con un `value` por debajo de su `min` se dibuja
    // inválido, y guardar sin tocar la fecha se vuelve imposible.
    await expect(campo).toHaveValue(VENCIMIENTO_VIEJO);
    await expect(campo).toHaveAttribute("min", VENCIMIENTO_VIEJO);
    await expect(campo).toBeEnabled();
  });

  /* --- El 409 de la carrera perdida -------------------------------------- */

  test("si alguien emite mientras el formulario está abierto, lo dice sin hablar de borrar", async ({
    page,
  }) => {
    await conCotizacionesCargadas(page);

    // Registrada **después** de la de lectura y por eso gana: Playwright
    // atiende las rutas en orden inverso al de registro.
    await page.route(
      (url) => url.pathname === `/api/cotizaciones/${BORRADOR_ID}`,
      async (ruta) => {
        if (ruta.request().method() !== "PUT") {
          await ruta.fallback();
          return;
        }
        await ruta.fulfill({
          status: 409,
          json: { error: "cotizacion_no_es_borrador", estado: "emitida" },
        });
      },
    );

    await page.goto(`/cotizaciones/${BORRADOR_ID}/editar`);
    await page.getByRole("button", { name: "Guardar" }).click();

    const alerta = page.getByRole("alert");
    await expect(alerta).toContainText("ya no es un borrador");
    // El texto de reserva de `CONFLICTOS` habla de un borrado con
    // dependientes. Sin la entrada propia, acá se leería «no se pudo
    // borrar», que es un borrado que nadie pidió.
    await expect(alerta).not.toContainText("borrar");
  });

  test("si la lista de clientes no carga, el control muestra el cliente que se va a guardar", async ({
    page,
  }) => {
    /*
     * El defecto medido antes de arreglarlo: el `<select>` controlado con un
     * valor que no corresponde a ninguna opción cae en la primera y dibuja
     * «Elegir cliente…», mientras el `PUT` sale con el `clienteId` original.
     * La persona lee «no hay ninguno elegido» sobre una cotización que sí
     * tiene cliente — y si elige otro creyendo que confirma, lo cambia.
     *
     * Lo que esta prueba fija es la coincidencia entre las dos puntas: lo
     * que el control dice y lo que el cuerpo lleva.
     */
    await conCotizacionesCargadas(page);

    await page.route(
      (url) => url.pathname === "/api/clientes",
      async (ruta) => {
        await ruta.fulfill({
          status: 403,
          json: { error: "acceso_denegado", motivo: "sin_token" },
        });
      },
    );

    let enviado: string | null = null;
    await page.route(
      (url) => url.pathname === `/api/cotizaciones/${BORRADOR_ID}`,
      async (ruta) => {
        if (ruta.request().method() !== "PUT") {
          await ruta.fallback();
          return;
        }
        enviado = ruta.request().postData();
        await ruta.fulfill({ status: 200, json: { cotizacion: BORRADOR } });
      },
    );

    await page.goto(`/cotizaciones/${BORRADOR_ID}/editar`);

    const cliente = page.locator("#campo-clienteId");
    await expect(cliente).toBeVisible();

    // Lo que se lee en el control, que es la opción seleccionada y no el
    // `value`: el defecto consistía justamente en que las dos cosas se
    // separaran.
    const visible = await cliente.evaluate((nodo) => {
      const control = nodo as HTMLSelectElement;
      return control.selectedIndex < 0
        ? "(ninguna)"
        : control.options[control.selectedIndex].text;
    });
    expect(visible).toBe(NOMBRE_DEL_CLIENTE);

    // Y que la lista no cargó se dice, en vez de dejar un desplegable de un
    // solo cliente que parece el catálogo entero.
    await expect(page.getByText("la cotización ya tenía")).toBeVisible();

    await page.getByRole("button", { name: "Guardar" }).click();
    await expect.poll(() => enviado).not.toBeNull();
    expect(JSON.parse(enviado ?? "{}")).toMatchObject({
      clienteId: CLIENTE_ID,
    });
  });

  test("el alta sin cliente avisa antes de mandar nada", async ({ page }) => {
    await conCotizacionesCargadas(page);

    let huboAlta = false;
    await page.route(
      (url) => url.pathname === "/api/cotizaciones",
      async (ruta) => {
        if (ruta.request().method() === "POST") huboAlta = true;
        await ruta.fallback();
      },
    );

    await page.goto("/cotizaciones/nuevo");
    await page.getByRole("button", { name: "Guardar" }).click();

    await expect(page.getByRole("alert")).toContainText(
      "Hay que elegir el cliente.",
    );
    expect(huboAlta, "no se manda una petición que ya se sabe inválida").toBe(
      false,
    );
  });

  /* --- El criterio responsivo de §9 -------------------------------------- */

  for (const ancho of ANCHOS) {
    test(`a ${String(ancho)}px de ancho, sobre el listado`, async ({ page }) => {
      await conCotizacionesCargadas(page);
      await page.setViewportSize({ width: ancho, height: 900 });
      await page.goto("/cotizaciones");
      await expect(
        page.getByRole("rowheader", { name: "COT-2026-0007" }),
      ).toBeVisible();

      const desborde = await medirDesborde(page);
      expect(
        desborde.scrollWidth,
        porQueSeSale(ancho, desborde),
      ).toBeLessThanOrEqual(desborde.clientWidth);
    });
  }

  for (const ancho of ANCHOS) {
    test(`a ${String(ancho)}px de ancho, sobre el detalle`, async ({ page }) => {
      await conCotizacionesCargadas(page);
      await page.setViewportSize({ width: ancho, height: 900 });
      await page.goto(`/cotizaciones/${EMITIDA_ID}`);
      await expect(
        page.getByRole("heading", { name: "COT-2026-0008" }),
      ).toBeVisible();

      const desborde = await medirDesborde(page);
      expect(
        desborde.scrollWidth,
        porQueSeSale(ancho, desborde),
      ).toBeLessThanOrEqual(desborde.clientWidth);
    });
  }

  for (const ancho of ANCHOS) {
    test(`a ${String(ancho)}px de ancho, sobre el formulario`, async ({
      page,
    }) => {
      await conCotizacionesCargadas(page);
      await page.setViewportSize({ width: ancho, height: 900 });
      await page.goto("/cotizaciones/nuevo");
      await expect(page.getByLabel("Vence el")).toBeVisible();

      const desborde = await medirDesborde(page);
      expect(
        desborde.scrollWidth,
        porQueSeSale(ancho, desborde),
      ).toBeLessThanOrEqual(desborde.clientWidth);
    });
  }
});
