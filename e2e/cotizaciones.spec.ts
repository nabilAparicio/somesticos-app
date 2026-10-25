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

/* --- Los módulos de prosa (T-2, unidad C2) ------------------------------- */

const MODULO_UNO = "7a0f0b11-1111-4111-8111-000000000001";
const MODULO_DOS = "7a0f0b11-2222-4222-8222-000000000002";
const MODULO_TRES = "7a0f0b11-3333-4333-8333-000000000003";

const TEXTO_UNO = "Vino por una visa de trabajo.";
const TEXTO_DOS = "Solicitud, seguimiento y retiro del carné.";

/**
 * El tercero lleva un token pegado, sin espacios ni guiones, por la misma
 * razón que el nombre del segundo cliente: un texto que el navegador puede
 * partir solo no es contenido hostil, y sin contenido hostil la medida de
 * §9 sobre el editor no mide nada.
 */
const TEXTO_TRES =
  "No incluye TASASYMULTASDELSERVICIONACIONALDEMIGRACIONDEPANAMAOESTE.";

/**
 * Lo que el servidor contesta al guardar, **distinto** de lo que se tecleó.
 *
 * No es un capricho del escenario: es la única forma de que la prueba de
 * edición pueda fallar por lo que dice medir. Si la respuesta repitiera el
 * texto enviado, una pantalla que redibuja lo que vino y una que conserva
 * lo que había en el campo se verían exactamente igual.
 */
const TEXTO_SEGUN_EL_SERVIDOR = "Vino por una visa, y ya tenía una negada.";

const MODULOS_DEL_BORRADOR = [
  { id: MODULO_UNO, tipo: "antecedentes", orden: 0, contenido: TEXTO_UNO },
  { id: MODULO_DOS, tipo: "alcance", orden: 1, contenido: TEXTO_DOS },
  { id: MODULO_TRES, tipo: "exclusiones", orden: 2, contenido: TEXTO_TRES },
];

/**
 * La emitida es la única cotización que dibuja módulos **en modo lectura**,
 * y lleva dos porque ese camino tiene dos cosas distintas que poner a
 * prueba. Un solo módulo no puede ser las dos a la vez, y el intento de que
 * lo fuera produjo una prueba que pasaba sin medir nada.
 *
 *  1. **El hostil**: un token pegado de cincuenta letras, sin espacios ni
 *     guiones. Sin él, las nueve medidas de ancho sobre el detalle de la
 *     emitida pasaban por encima de un párrafo corriente, que no puede
 *     empujar nada: medían el detalle, no la prosa. Es la prosa cruda el
 *     único contenido de esta pantalla que llega al layout sin un control
 *     que lo contenga.
 *  2. **El de dos renglones**: dos frases cortas separadas por un salto de
 *     línea de verdad, que es lo que `white-space: pre-wrap` conserva.
 *     **Cortas a propósito**: la primera versión de esta prueba usaba un
 *     texto largo, y a 1280px ese texto envolvía solo — así que medía dos
 *     renglones con `pre-wrap` y sin él, y sobrevivía a la mutación. Con
 *     dieciséis caracteres no hay envoltorio posible, y la única cosa que
 *     puede partirlos en dos es el salto conservado.
 */
const TEXTO_HOSTIL_DE_LA_EMITIDA =
  "Ref CONSTANCIADEANTECEDENTESPENALESDELAREPUBLICADEPANAMA.";

const TEXTO_EN_DOS_RENGLONES = "Primero.\nSegundo.";

const MODULOS_DE_LA_EMITIDA = [
  {
    id: "7a0f0b11-4444-4444-8444-000000000004",
    tipo: "nota_cliente",
    orden: 0,
    contenido: TEXTO_HOSTIL_DE_LA_EMITIDA,
  },
  {
    id: "7a0f0b11-5555-4555-8555-000000000006",
    tipo: "supuestos",
    orden: 1,
    contenido: TEXTO_EN_DOS_RENGLONES,
  },
];

const MODULOS_POR_COTIZACION: Record<string, Record<string, unknown>[]> = {
  [BORRADOR_ID]: MODULOS_DEL_BORRADOR,
  [EMITIDA_ID]: MODULOS_DE_LA_EMITIDA,
  [BORRADOR_VIEJO_ID]: [],
};

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

  const deModulos = /^\/api\/cotizaciones\/([^/]+)\/modulos$/.exec(pathname);
  if (deModulos !== null) {
    return { modulos: MODULOS_POR_COTIZACION[deModulos[1]] ?? [] };
  }

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

    // Emitir, ganar, perder y duplicar son de T-4 y T-5; las líneas, de
    // T-3. Ni como botón ni como texto apagado: un control deshabilitado
    // promete una pantalla que no existe.
    //
    // «Módulos» salió de esta lista en la unidad C2, que es la que los
    // trajo. Lo que ocupó su lugar no es nada: la lista se achicó, porque
    // una palabra que ya se dibuja a propósito no puede seguir prohibida
    // acá sin convertir esta prueba en una que falla por tener razón.
    for (const palabra of [
      "Emitir",
      "Duplicar",
      "Ganada",
      "Perdida",
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

  /* --- El editor de módulos de prosa (unidad C2) ------------------------- */

  /** La dirección de la colección, que casi todas estas pruebas interceptan. */
  function coleccionDeModulos(url: URL): boolean {
    return url.pathname === `/api/cotizaciones/${BORRADOR_ID}/modulos`;
  }

  test("el borrador trae sus módulos en el orden del documento", async ({
    page,
  }) => {
    await conCotizacionesCargadas(page);
    await page.goto(`/cotizaciones/${BORRADOR_ID}`);

    // La espera va primero y no es adorno: `toHaveValue` sobre un `nth`
    // reintenta, pero sólo después de que el elemento exista. Leer apenas
    // vuelve el `goto` mide lo que React alcanzó a montar.
    const textos = page.locator(".modulo textarea");
    await expect(textos).toHaveCount(3);

    await expect(textos.nth(0)).toHaveValue(TEXTO_UNO);
    await expect(textos.nth(1)).toHaveValue(TEXTO_DOS);
    await expect(textos.nth(2)).toHaveValue(TEXTO_TRES);
  });

  test("el desplegable ofrece los seis tipos del catálogo y ninguno más", async ({
    page,
  }) => {
    await conCotizacionesCargadas(page);
    await page.goto(`/cotizaciones/${BORRADOR_ID}`);

    const tipo = page.getByLabel("Tipo", { exact: true });
    await expect(tipo).toBeVisible();

    /*
     * Los seis rótulos están escritos a mano y **no** importados de
     * `worker/cotizaciones/modulos.ts`, que es de donde el desplegable los
     * saca: una expectativa calculada con la misma fuente que se prueba
     * pasa aunque las dos estén mal (restricción 6). Que agregar un tipo
     * obligue a tocar esta lista es la gracia, no el costo: agregar un tipo
     * es un despliegue, y el `CHECK` de la migración también hay que
     * moverlo a mano.
     */
    await expect(tipo.locator("option")).toHaveText([
      "Elegir tipo…",
      "Antecedentes",
      "Alcance",
      "Exclusiones",
      "Supuestos",
      "Cláusulas",
      "Nota al cliente",
    ]);
  });

  test("sobre lo que ya se emitió los módulos se leen y no se tocan", async ({
    page,
  }) => {
    await conCotizacionesCargadas(page);
    await page.goto(`/cotizaciones/${EMITIDA_ID}`);

    await expect(
      page.getByRole("heading", { name: "Nota al cliente" }),
    ).toBeVisible();
    await expect(page.getByText(TEXTO_HOSTIL_DE_LA_EMITIDA)).toBeVisible();

    // Nada de controles apagados: el aviso ocupa su lugar.
    await expect(page.getByText("se pueden leer pero no cambiar")).toBeVisible();
    await expect(page.locator(".modulo textarea")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Quitar/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Agregar" })).toHaveCount(0);
  });

  test("el texto de un módulo conserva sus saltos de línea", async ({
    page,
  }) => {
    await conCotizacionesCargadas(page);
    // Ancho de sobra a propósito: a 1280px las dos mitades del texto entran
    // holgadas en un solo renglón, así que lo único que puede partirlas es
    // el salto que el texto trae. A 320px la medida no distinguiría el
    // salto conservado de un simple envoltorio.
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/cotizaciones/${EMITIDA_ID}`);

    const parrafos = page.locator(".modulo__texto");
    await expect(parrafos).toHaveCount(2);

    /*
     * Se cuentan renglones y no se afirma el `white-space` computado:
     * afirmar la declaración sería copiar la hoja de estilo dentro de la
     * prueba y pasar aunque el navegador no la aplicara. Lo que importa es
     * que la pantalla muestre el documento como se escribió — un `<p>` sin
     * `pre-wrap` colapsa el salto y dibuja un solo renglón.
     *
     * Se cuentan **posiciones verticales distintas** y no rectángulos a
     * secas: un `Range` sobre un texto con `pre-wrap` devuelve un
     * rectángulo por fragmento, y el salto de línea genera uno propio —
     * medido, da tres sobre dos renglones—. Lo que no miente es a qué
     * altura se dibujó cada pedazo.
     *
     * Tampoco se divide el alto de la caja por la interlínea: esa cuenta
     * redondeada tolera que se cuele un padding y empieza a contestar lo
     * que no se le preguntó.
     */
    const renglones = await parrafos.nth(1).evaluate((nodo) => {
      const rango = document.createRange();
      rango.selectNodeContents(nodo);

      const alturas = new Set(
        Array.from(rango.getClientRects()).map((caja) => Math.round(caja.top)),
      );
      return alturas.size;
    });

    expect(renglones).toBe(2);
  });

  test("subir un módulo manda la lista ordenada entera", async ({ page }) => {
    await conCotizacionesCargadas(page);

    let enviado: string | null = null;
    await page.route(coleccionDeModulos, async (ruta) => {
      if (ruta.request().method() !== "PUT") {
        await ruta.fallback();
        return;
      }
      enviado = ruta.request().postData();
      await ruta.fulfill({
        status: 200,
        json: {
          modulos: [
            { ...MODULOS_DEL_BORRADOR[1], orden: 0 },
            { ...MODULOS_DEL_BORRADOR[0], orden: 1 },
            MODULOS_DEL_BORRADOR[2],
          ],
        },
      });
    });

    await page.goto(`/cotizaciones/${BORRADOR_ID}`);

    const subir = page.getByRole("button", {
      name: "Subir el módulo 2: Alcance",
    });
    await expect(subir).toBeEnabled();
    await subir.click();

    // El cuerpo es la lista entera de identificadores en su posición nueva,
    // y **ninguna posición**: el `orden` lo asigna el servidor.
    await expect.poll(() => enviado).not.toBeNull();
    expect(JSON.parse(enviado ?? "{}")).toEqual({
      orden: [MODULO_DOS, MODULO_UNO, MODULO_TRES],
    });

    // Y la pantalla dibuja lo que vino, sin recomponer el orden a mano.
    const textos = page.locator(".modulo textarea");
    await expect(textos).toHaveCount(3);
    await expect(textos.nth(0)).toHaveValue(TEXTO_DOS);
  });

  test("los dos extremos no ofrecen moverse hacia afuera", async ({ page }) => {
    await conCotizacionesCargadas(page);
    await page.goto(`/cotizaciones/${BORRADOR_ID}`);

    await expect(
      page.getByRole("button", { name: "Subir el módulo 1: Antecedentes" }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Bajar el módulo 3: Exclusiones" }),
    ).toBeDisabled();

    // Los de adentro sí, que es lo que vuelve significativo lo de arriba.
    await expect(
      page.getByRole("button", { name: "Bajar el módulo 1: Antecedentes" }),
    ).toBeEnabled();
  });

  test("si la lista quedó vieja, lo dice y vuelve a leer la de verdad", async ({
    page,
  }) => {
    await conCotizacionesCargadas(page);

    // Alguien quitó el tercero desde otra pestaña entre la carga y el clic.
    let yaChoco = false;
    await page.route(coleccionDeModulos, async (ruta) => {
      if (ruta.request().method() === "PUT") {
        yaChoco = true;
        await ruta.fulfill({
          status: 422,
          json: {
            error: "datos_invalidos",
            fallas: [{ campo: "orden", motivo: "orden_incompleto" }],
          },
        });
        return;
      }

      await ruta.fulfill({
        status: 200,
        json: {
          modulos: yaChoco
            ? MODULOS_DEL_BORRADOR.slice(0, 2)
            : MODULOS_DEL_BORRADOR,
        },
      });
    });

    await page.goto(`/cotizaciones/${BORRADOR_ID}`);
    await expect(page.locator(".modulo")).toHaveCount(3);

    await page
      .getByRole("button", { name: "Subir el módulo 2: Alcance" })
      .click();

    await expect(page.getByRole("alert")).toContainText(
      "La lista no coincide con los módulos de esta cotización",
    );

    // Lo que importa no es el mensaje sino esto: la pantalla dejó de
    // mostrar un módulo que ya no existe. Sin la relectura, el aviso diría
    // «volvé a cargarla» encima de la lista vieja, y el mismo clic volvería
    // a fallar para siempre.
    await expect(page.locator(".modulo")).toHaveCount(2);
  });

  test("agregar manda el tipo y el texto recortado, y nada más", async ({
    page,
  }) => {
    await conCotizacionesCargadas(page);

    let enviado: string | null = null;
    await page.route(coleccionDeModulos, async (ruta) => {
      if (ruta.request().method() !== "POST") {
        await ruta.fallback();
        return;
      }
      enviado = ruta.request().postData();
      await ruta.fulfill({
        status: 201,
        json: {
          modulos: [
            ...MODULOS_DEL_BORRADOR,
            {
              id: "7a0f0b11-5555-4555-8555-000000000005",
              tipo: "supuestos",
              orden: 3,
              contenido: "El cliente entrega los documentos.",
            },
          ],
        },
      });
    });

    await page.goto(`/cotizaciones/${BORRADOR_ID}`);

    await page.getByLabel("Tipo", { exact: true }).selectOption("supuestos");
    await page
      .getByLabel("Texto", { exact: true })
      .fill("  El cliente entrega los documentos.\n\n");
    await page.getByRole("button", { name: "Agregar" }).click();

    await expect.poll(() => enviado).not.toBeNull();
    // Dos campos: `id` y `orden` los pone el servidor, y un `orden` que
    // llegara del cuerpo sería el camino para pedir dos módulos en la misma
    // posición.
    expect(JSON.parse(enviado ?? "{}")).toEqual({
      tipo: "supuestos",
      contenido: "El cliente entrega los documentos.",
    });

    await expect(page.locator(".modulo")).toHaveCount(4);
    // Y el formulario queda limpio para el siguiente.
    await expect(page.getByLabel("Texto", { exact: true })).toHaveValue("");
  });

  test("agregar sin tipo ni texto avisa las dos cosas antes de mandar nada", async ({
    page,
  }) => {
    await conCotizacionesCargadas(page);

    let huboAlta = false;
    await page.route(coleccionDeModulos, async (ruta) => {
      if (ruta.request().method() === "POST") huboAlta = true;
      await ruta.fallback();
    });

    await page.goto(`/cotizaciones/${BORRADOR_ID}`);
    await page.getByRole("button", { name: "Agregar" }).click();

    const alerta = page.getByRole("alert");
    await expect(alerta).toContainText("Ese no es un tipo de módulo");
    await expect(alerta).toContainText("Un módulo sin texto es un título");

    expect(huboAlta, "no se manda una petición que ya se sabe inválida").toBe(
      false,
    );
  });

  test("editar un módulo manda su tipo y su texto a su propia dirección", async ({
    page,
  }) => {
    await conCotizacionesCargadas(page);

    let enviado: string | null = null;
    await page.route(
      (url) =>
        url.pathname === `/api/cotizaciones/${BORRADOR_ID}/modulos/${MODULO_UNO}`,
      async (ruta) => {
        enviado = ruta.request().postData();
        /*
         * La respuesta trae algo **distinto** de lo que se tecleó, y ésa es
         * toda la gracia. La primera versión de esta prueba devolvía el
         * mismo texto: así no podía distinguir una pantalla que redibuja lo
         * que contestó el servidor de una que se queda con lo que había en
         * el campo, que son justamente las dos cosas que esto dice medir.
         * Una prueba que no puede fallar por su propio enunciado no prueba
         * nada.
         */
        await ruta.fulfill({
          status: 200,
          json: {
            modulos: [
              { ...MODULOS_DEL_BORRADOR[0], contenido: TEXTO_SEGUN_EL_SERVIDOR },
              MODULOS_DEL_BORRADOR[1],
              MODULOS_DEL_BORRADOR[2],
            ],
          },
        });
      },
    );

    await page.goto(`/cotizaciones/${BORRADOR_ID}`);

    const texto = page.locator(".modulo textarea").first();
    await expect(texto).toHaveValue(TEXTO_UNO);

    const guardar = page.getByRole("button", {
      name: "Guardar el módulo 1: Antecedentes",
    });
    // Sin cambios no hay botón: un «Guardar» apagado debajo de cada módulo
    // es un control muerto en la pantalla que más se mira.
    await expect(guardar).toHaveCount(0);

    await texto.fill("Vino por una visa.");
    await guardar.click();

    await expect.poll(() => enviado).not.toBeNull();
    expect(JSON.parse(enviado ?? "{}")).toEqual({
      tipo: "antecedentes",
      contenido: "Vino por una visa.",
    });

    // El campo pasa a mostrar lo que quedó guardado, no lo que se tecleó.
    await expect(texto).toHaveValue(TEXTO_SEGUN_EL_SERVIDOR);

    // Y los dos botones se van, porque ya no hay nada pendiente de guardar.
    await expect(guardar).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: "Descartar los cambios del módulo 1: Antecedentes",
      }),
    ).toHaveCount(0);
  });

  test("descartar devuelve el texto que está guardado", async ({ page }) => {
    await conCotizacionesCargadas(page);
    await page.goto(`/cotizaciones/${BORRADOR_ID}`);

    const texto = page.locator(".modulo textarea").first();
    await expect(texto).toHaveValue(TEXTO_UNO);

    await texto.fill("Algo que no se quiso escribir.");
    await page
      .getByRole("button", {
        name: "Descartar los cambios del módulo 1: Antecedentes",
      })
      .click();

    await expect(texto).toHaveValue(TEXTO_UNO);
  });

  /* --- Los caminos que no son el feliz ----------------------------------- */

  test("pasar de una cotización a otra no deja ver los módulos de la anterior", async ({
    page,
  }) => {
    /*
     * El riesgo que esto cierra no es estético: si el editor sobreviviera al
     * cambio de cotización sin reiniciarse, sus botones mandarían escrituras
     * a la cotización nueva con los identificadores de módulo de la vieja —
     * escribir en el documento equivocado.
     *
     * **Hoy no es alcanzable**, y esta prueba es la que lo fija: `App.tsx`
     * monta `DetalleDeCotizacion` con `key={ruta.id}`, así que React
     * descarta el subárbol entero al cambiar de identificador. Esa decisión
     * está escrita y razonada en `src/App.tsx`, que además explica por qué
     * se prefirió la `key` a reiniciar el estado dentro del efecto: eso
     * último es el renderizado en cascada que `react-hooks` marca.
     *
     * O sea: esto es una **precondición con prueba**, no un defecto vivo. Si
     * alguien saca esa `key`, acá se entera.
     */
    await conCotizacionesCargadas(page);

    /*
     * La lectura de módulos de la emitida se demora varios segundos a
     * propósito. El instante entre el cambio de ruta y esa respuesta es la
     * ventana donde se verían los módulos de la anterior si el editor se
     * reusara, y la ventana tiene que durar más que la medición.
     */
    await page.route(
      (url) => url.pathname === `/api/cotizaciones/${EMITIDA_ID}/modulos`,
      async (ruta) => {
        await new Promise((listo) => setTimeout(listo, 2500));
        await ruta.fulfill({
          status: 200,
          json: { modulos: MODULOS_DE_LA_EMITIDA },
        });
      },
    );

    await page.goto(`/cotizaciones/${BORRADOR_ID}`);
    await expect(page.locator(".modulo textarea")).toHaveCount(3);

    // Navegación del lado del cliente, igual que `navegarA`: el mismo
    // nombre de ruta con otro identificador, que es la condición exacta.
    await page.evaluate((destino) => {
      window.history.pushState(null, "", destino);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }, `/cotizaciones/${EMITIDA_ID}`);

    // La cabecera nueva sí llega rápido: su lectura no está demorada. Esto
    // es lo que fija el instante de la medición.
    await expect(
      page.getByRole("heading", { name: "COT-2026-0008" }),
    ).toBeVisible();

    /*
     * **`.count()` y no `toHaveCount`, y acá eso es lo correcto.** Un
     * `toHaveCount(0)` reintenta hasta cinco segundos, así que da por buena
     * una pantalla que mostró tres módulos ajenos durante dos segundos y
     * recién después los soltó — que es exactamente el estado que esta
     * prueba existe para prohibir. Una aserción que espera no puede
     * demostrar un «nunca»: hay que leer el instante.
     *
     * Medido: sin la `key` de `App.tsx` acá se leen 3 y con ella 0.
     */
    const ajenos = await page.locator(".modulo").count();
    expect(
      ajenos,
      "con la lectura nueva todavía en vuelo no puede quedar ni un módulo" +
        " de la cotización anterior en pantalla",
    ).toBe(0);

    // Y recién entonces, la lista de la emitida.
    await expect(page.locator(".modulo__texto")).toHaveCount(2);
  });

  test("una respuesta ilegible no deja los controles trabados", async ({
    page,
  }) => {
    await conCotizacionesCargadas(page);

    await page.route(
      (url) =>
        url.pathname === `/api/cotizaciones/${BORRADOR_ID}/modulos/${MODULO_DOS}`,
      async (ruta) => {
        /*
         * 200 con un cuerpo que no es JSON. `pedir` lo lee con
         * `respuesta.json()` **fuera de todo `catch`** —ése es el único
         * `await` suyo que no está cubierto—, así que la promesa **rechaza**
         * en vez de devolver un `Resultado`. Ningún `if` del editor pasa por
         * ahí.
         */
        await ruta.fulfill({
          status: 200,
          contentType: "text/html",
          body: "<html>no soy json</html>",
        });
      },
    );

    await page.goto(`/cotizaciones/${BORRADOR_ID}`);
    await page
      .getByRole("button", { name: "Quitar el módulo 2: Alcance" })
      .click();

    // Lo que no puede pasar es que la pantalla quede muerta: sin un
    // `finally`, `ocupado` se queda arriba y **todos** los controles quedan
    // apagados hasta recargar la página.
    await expect(
      page.getByRole("button", { name: "Bajar el módulo 1: Antecedentes" }),
      "una escritura que revienta no puede dejar la pantalla trabada",
    ).toBeEnabled();

    // Y se dice, en vez de tragarse el fallo.
    await expect(page.getByRole("alert")).toBeVisible();
  });

  test("mientras una escritura viaja, los controles no aceptan otra", async ({
    page,
  }) => {
    await conCotizacionesCargadas(page);

    let soltar = () => {
      /* lo reemplaza la promesa de abajo antes de usarse */
    };
    const retenida = new Promise<void>((listo) => {
      soltar = listo;
    });

    await page.route(
      (url) =>
        url.pathname === `/api/cotizaciones/${BORRADOR_ID}/modulos/${MODULO_DOS}`,
      async (ruta) => {
        await retenida;
        await ruta.fulfill({
          status: 200,
          json: {
            modulos: [MODULOS_DEL_BORRADOR[0], MODULOS_DEL_BORRADOR[2]],
          },
        });
      },
    );

    await page.goto(`/cotizaciones/${BORRADOR_ID}`);
    await page
      .getByRole("button", { name: "Quitar el módulo 2: Alcance" })
      .click();

    // Dos escrituras en vuelo sobre la misma lista son dos respuestas que
    // compiten por pisarse, y la que llegue segunda gana sin motivo.
    await expect(
      page.getByRole("button", { name: "Bajar el módulo 1: Antecedentes" }),
    ).toBeDisabled();

    soltar();

    await expect(page.locator(".modulo")).toHaveCount(2);
    await expect(
      page.getByRole("button", { name: "Bajar el módulo 1: Antecedentes" }),
    ).toBeEnabled();
  });

  test("un 409 sobre una escritura se dice y no borra lo que se escribió", async ({
    page,
  }) => {
    await conCotizacionesCargadas(page);

    await page.route(
      (url) =>
        url.pathname === `/api/cotizaciones/${BORRADOR_ID}/modulos/${MODULO_UNO}`,
      async (ruta) => {
        await ruta.fulfill({
          status: 409,
          json: { error: "cotizacion_no_es_borrador", estado: "emitida" },
        });
      },
    );

    await page.goto(`/cotizaciones/${BORRADOR_ID}`);

    const texto = page.locator(".modulo textarea").first();
    await expect(texto).toHaveValue(TEXTO_UNO);

    const escrito = "Vino por una visa de trabajo, y ya tenía una negada.";
    await texto.fill(escrito);
    await page
      .getByRole("button", { name: "Guardar el módulo 1: Antecedentes" })
      .click();

    await expect(page.getByRole("alert")).toContainText(
      "ya no es un borrador",
    );

    // Y lo que la persona escribió sigue ahí: tirar el texto porque el
    // servidor dijo que no es perder trabajo ajeno para no guardar estado.
    await expect(texto).toHaveValue(escrito);
    await expect(
      page.getByRole("button", { name: "Guardar el módulo 1: Antecedentes" }),
    ).toBeVisible();
  });

  test("si la relectura forzada falla, lo dice y ofrece volver a cargar", async ({
    page,
  }) => {
    await conCotizacionesCargadas(page);

    let fase: "inicial" | "rota" | "sana" = "inicial";
    await page.route(coleccionDeModulos, async (ruta) => {
      if (ruta.request().method() === "PUT") {
        fase = "rota";
        await ruta.fulfill({
          status: 422,
          json: {
            error: "datos_invalidos",
            fallas: [{ campo: "orden", motivo: "orden_incompleto" }],
          },
        });
        return;
      }

      if (fase === "rota") {
        fase = "sana";
        await ruta.fulfill({ status: 503, json: { error: "no_disponible" } });
        return;
      }

      await ruta.fulfill({
        status: 200,
        json: {
          modulos:
            fase === "sana"
              ? MODULOS_DEL_BORRADOR.slice(0, 2)
              : MODULOS_DEL_BORRADOR,
        },
      });
    });

    await page.goto(`/cotizaciones/${BORRADOR_ID}`);
    await expect(page.locator(".modulo")).toHaveCount(3);

    await page
      .getByRole("button", { name: "Subir el módulo 2: Alcance" })
      .click();

    /*
     * El defecto que esto cierra es el silencio: la relectura se descartaba
     * sin decir nada, así que la lista vieja se quedaba en pantalla **bajo
     * un mensaje que dice que está vieja**. Quien mira no tiene cómo saber
     * que lo que ve ya no es lo que hay guardado.
     */
    await expect(page.getByText("no se pudo volver a leer")).toBeVisible();

    const recargar = page.getByRole("button", {
      name: "Volver a cargar los módulos",
    });
    await expect(recargar).toBeVisible();

    // Y la puerta funciona: el servidor se recupera y el botón trae la
    // lista de verdad, que tiene un módulo menos.
    await recargar.click();
    await expect(page.locator(".modulo")).toHaveCount(2);
    await expect(page.getByText("no se pudo volver a leer")).toHaveCount(0);
  });

  test("quitar un módulo lo saca de la lista", async ({ page }) => {
    await conCotizacionesCargadas(page);

    let metodo: string | null = null;
    await page.route(
      (url) =>
        url.pathname === `/api/cotizaciones/${BORRADOR_ID}/modulos/${MODULO_DOS}`,
      async (ruta) => {
        metodo = ruta.request().method();
        await ruta.fulfill({
          status: 200,
          json: {
            modulos: [MODULOS_DEL_BORRADOR[0], MODULOS_DEL_BORRADOR[2]],
          },
        });
      },
    );

    await page.goto(`/cotizaciones/${BORRADOR_ID}`);
    await expect(page.locator(".modulo")).toHaveCount(3);

    await page
      .getByRole("button", { name: "Quitar el módulo 2: Alcance" })
      .click();

    await expect(page.locator(".modulo")).toHaveCount(2);
    // 200 con la lista, no 204: un `pedirVacio` acá tiraría la respuesta.
    expect(metodo).toBe("DELETE");
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

      // Y que el módulo en modo lectura esté dibujado antes de medir: es el
      // único lugar de esta pantalla donde la prosa cruda —con su token
      // pegado de cincuenta letras— llega al layout sin un control que la
      // contenga. Sin esta espera, la medida es la del detalle solo.
      await expect(page.locator(".modulo__texto")).toHaveCount(2);

      const desborde = await medirDesborde(page);
      expect(
        desborde.scrollWidth,
        porQueSeSale(ancho, desborde),
      ).toBeLessThanOrEqual(desborde.clientWidth);
    });
  }

  for (const ancho of ANCHOS) {
    test(`a ${String(ancho)}px de ancho, sobre el editor de módulos`, async ({
      page,
    }) => {
      await conCotizacionesCargadas(page);
      await page.setViewportSize({ width: ancho, height: 900 });
      await page.goto(`/cotizaciones/${BORRADOR_ID}`);

      /*
       * Lo que esta medida cubre de verdad es **la fila de controles**: el
       * desplegable de tipo y las tres flechas conviviendo en una `Fila`
       * que tiene que envolver sola en 320px.
       *
       * Lo que **no** cubre, y conviene decirlo para que nadie le pida más
       * de lo que da: el `<textarea>` no puede empujar nada, porque
       * `.campo__control` ya lo fija en `inline-size: 100%` con
       * `min-inline-size: 0`. La prosa cruda —la que sí podría empujar— se
       * dibuja sólo en el camino de lectura, y a ésa la miden las nueve
       * medidas sobre el detalle de la emitida.
       *
       * Esperar a que los tres existan antes de medir no es adorno: sin
       * eso la medida es la del detalle sin módulos.
       */
      await expect(page.locator(".modulo textarea")).toHaveCount(3);

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
