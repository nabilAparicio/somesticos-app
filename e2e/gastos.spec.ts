/**
 * La pantalla de gastos de un proceso (T-10, unidad B), en el navegador.
 *
 * Lo que solo se puede comprobar acá:
 *
 *  1. **Que el saldo dibujado sea el que mandó el servidor.** El cálculo ya
 *     está probado como función en `test/gastos-ui.spec.ts`; lo que esto
 *     agrega es que la cifra que se ve en la página sea ésa y no otra. El
 *     banco contesta un saldo que **no** coincide con la suma de los
 *     movimientos: si la pantalla sumara, se vería el otro número.
 *  2. **Que el saldo esté rotulado como informativo donde se lo mira**, y no
 *     en un comentario del código.
 *  3. **Que no poder archivar el comprobante no impida cargar un gasto.** Es
 *     un estado de componente —dos `useState` que no se tocan— y afirmarlo
 *     sobre una función sería afirmar sobre la mitad que no se rompe.
 *  4. El criterio responsivo de §9 sobre el contenido nuevo.
 *
 * **Las respuestas de la API van interceptadas.** `vite dev` corre sin
 * identidad de Access, así que la API real contesta 403 y la pantalla se
 * dibujaría como un aviso de error: medir el layout de un párrafo suelto
 * sería la vacuidad que T-4 descubrió en su propia rejilla. **Ninguna
 * prueba de este archivo llama a un R2 real**: el comprobante lo contesta el
 * mismo interceptor.
 */
import { expect, test, type Page } from "@playwright/test";

import { medirDesborde, porQueSeSale } from "./desborde";

const PROCESO_ID = "9f1e2d3c-4b5a-4968-8777-0a1b2c3d4e5f";
const CLIENTE_ID = "11111111-2222-4333-8444-555555555555";

const ETAPAS = [
  {
    id: "e1",
    nombre: "Recepción y revisión de documentos",
    orden: 0,
    alcanzadaEn: "2026-09-01T15:00:00.000Z",
  },
  { id: "e2", nombre: "Presentación ante el Registro", orden: 1, alcanzadaEn: null },
];

const PROCESO = {
  id: PROCESO_ID,
  clienteId: CLIENTE_ID,
  clienteNombre: "Inversiones y Desarrollos del Istmo, S.A.",
  tipoProcesoId: null,
  tipoProcesoNombre: "Constitución de sociedad anónima",
  areaNombre: "Corporativo",
  origen: "directo",
  titulo: "Constitución de sociedad para Inversiones del Istmo",
  estado: "abierto",
  responsableId: null,
  responsableNombre: null,
  abiertoEn: "2026-08-15T15:00:00.000Z",
  cerradoEn: null,
  etapasCumplidas: 1,
  etapasTotales: 2,
  etapaVigente: "Presentación ante el Registro",
  // Este proceso se abrió a mano. El campo va explícito y no ausente: el
  // Worker siempre escribe la clave, así que un doble que la omita produce
  // `undefined`, la guarda `!== null` lo deja pasar y la pantalla revienta
  // leyendo el código. Es lo que paso con esta suite al agregar el campo.
  cotizacionDeOrigen: null,
};

const DETALLE = { proceso: PROCESO, etapas: ETAPAS };

/**
 * Un concepto con un token largo **sin espacios ni guiones**.
 *
 * Es la lección de T-4 que ya mordió dos veces en esta tajada: un token con
 * guiones no sirve como contenido hostil porque el guion ya es un punto de
 * corte y el navegador lo parte solo. Medido allá: con `overflow-wrap:
 * normal` el párrafo seguía entrando. Esto es lo que sale de pegar el
 * número de una boleta de un portal público dentro del concepto, y es lo
 * que obliga a la regla de contención a actuar de verdad.
 */
const CONCEPTO_LARGO =
  "TimbresRPBoleta20261019000483927471PAGOENLINEACONSULTACOMPROBANTEWEB";

const ANTICIPO = {
  id: "a1",
  fecha: "2026-10-18",
  concepto: "Depósito inicial del cliente",
  monto: 160_238,
  tipo: "anticipo",
  tieneComprobante: true,
  usuarioId: "u1",
  usuarioNombre: "Itzel",
  registradoEn: "2026-10-18T15:00:00.000Z",
};

const GASTO_LARGO = {
  id: "g1",
  fecha: "2026-10-19",
  concepto: CONCEPTO_LARGO,
  monto: 58_795,
  tipo: "gasto",
  tieneComprobante: false,
  usuarioId: "u1",
  usuarioNombre: "Itzel",
  registradoEn: "2026-10-19T15:00:00.000Z",
};

const GASTO_MENSAJERIA = {
  id: "g2",
  fecha: "2026-10-20",
  concepto: "Mensajería al Registro Público de Panamá",
  monto: 57_539,
  tipo: "gasto",
  tieneComprobante: false,
  usuarioId: "u2",
  usuarioNombre: "Ricardo",
  registradoEn: "2026-10-20T15:00:00.000Z",
};

const MOVIMIENTOS = [ANTICIPO, GASTO_LARGO, GASTO_MENSAJERIA];

/**
 * **El saldo que el banco contesta no es la suma de los movimientos de
 * arriba.**
 *
 * **Los tres números son independientes entre sí, y eso costó una
 * medición.** La suma de los movimientos da 1 602,38 de anticipos contra
 * 1 163,34 de gastos; el banco declara 5 000,00 y 1 234,56; y el saldo que
 * declara **tampoco** es la resta de esos dos —5 000,00 − 1 234,56 daría
 * 3 765,44 y acá dice 3 111,11—.
 *
 * La primera versión declaraba `saldo: 376_544`, o sea la resta exacta de
 * sus propios subtotales. Medido: con una mutación que hace que la pantalla
 * derive el saldo en vez de leerlo, **las veinticuatro pruebas de este
 * archivo pasaban igual**. Un doble que devuelve algo coherente con lo que
 * ya mandó no distingue una pantalla que muestra de una que calcula — es la
 * misma lección que esta tajada pagó con los dobles que devuelven lo que se
 * les envía, con otra piel.
 */
const SALDO_DECLARADO = { anticipos: 500_000, gastos: 123_456, saldo: 311_111 };

const CUENTA = { movimientos: MOVIMIENTOS, saldo: SALDO_DECLARADO };

/** La cuenta saldada de la unidad A: cero exacto en centavos enteros. */
const CUENTA_AL_DIA = {
  movimientos: MOVIMIENTOS,
  saldo: { anticipos: 160_238, gastos: 160_238, saldo: 0 },
};

/** La cuenta con el cliente debiendo: sólo gastos, sin ningún anticipo. */
const CUENTA_EN_CONTRA = {
  movimientos: [GASTO_LARGO, GASTO_MENSAJERIA],
  saldo: { anticipos: 0, gastos: 116_334, saldo: -116_334 },
};

/** Lo que el servidor contesta al cargar un gasto nuevo: la cuenta entera. */
const CONCEPTO_NUEVO = "Tasa de inscripción del pacto social";

const CUENTA_CON_EL_NUEVO = {
  movimientos: [
    ...MOVIMIENTOS,
    {
      id: "g3",
      fecha: "2026-10-25",
      concepto: CONCEPTO_NUEVO,
      monto: 43_904,
      tipo: "gasto",
      tieneComprobante: false,
      usuarioId: "u1",
      usuarioNombre: "Itzel",
      registradoEn: "2026-10-25T15:00:00.000Z",
    },
  ],
  // Tampoco es la resta de sus subtotales: ver `SALDO_DECLARADO`.
  saldo: { anticipos: 500_000, gastos: 167_360, saldo: 300_000 },
};

/** Y al adjuntarle el papel a uno que no lo tenía. */
const CUENTA_CON_PAPEL = {
  movimientos: [
    ANTICIPO,
    { ...GASTO_LARGO, tieneComprobante: true },
    GASTO_MENSAJERIA,
  ],
  saldo: SALDO_DECLARADO,
};

/** Y al sacar un movimiento de la cuenta. */
const CUENTA_SIN_LA_MENSAJERIA = {
  movimientos: [ANTICIPO, GASTO_LARGO],
  // Tampoco es la resta de sus subtotales: ver `SALDO_DECLARADO`.
  saldo: { anticipos: 500_000, gastos: 65_917, saldo: 422_222 },
};

/**
 * El `Buffer` de Node, tomado del global y tipado a mano.
 *
 * **Las dos alternativas se probaron y las dos fallan.** `e2e` viaja con
 * `tsconfig.app.json`, cuyos `types` son los del navegador, así que:
 *
 *  - nombrar `Buffer` directamente rompe el `typecheck` con TS2591;
 *  - y agregarle `"node"` a ese proyecto para una prueba le metería
 *    `process` y `Buffer` a todo `src/`, que es justo lo que esa lista
 *    enumerada existe para impedir.
 *
 * Usar un `Uint8Array` de `TextEncoder` **compila y no corre**: medido, con
 * `fileChooser.setFiles: InvalidCharacterError: Failed to execute 'atob'`.
 * Playwright serializa el archivo a base64 con `buffer.toString("base64")`,
 * y sobre un `Uint8Array` eso devuelve «37,80,68,70…», que no es base64.
 * Una conversión que el compilador acepta no es una conversión que el
 * runtime acepte.
 *
 * Esto es lo que queda: el global de verdad, con el pedacito de su forma
 * que esta prueba usa. Corre en Node, que es donde corre Playwright.
 */
const { Buffer } = globalThis as unknown as {
  Buffer: { from(texto: string): Uint8Array };
};

const PAPEL = Buffer.from("%PDF-1.4 un comprobante de prueba");

type Banco = {
  /** Qué contesta la cuenta en la primera lectura. */
  readonly cuenta?: unknown;
  /** Si el almacén de comprobantes está caído, y con qué motivo. */
  readonly almacen?: "almacen_no_configurado" | "almacen_no_disponible";
};

/**
 * La API, contestada desde acá.
 *
 * El filtro es un predicado sobre el `pathname` y no un glob de comodines
 * sobre `/api/`: ese glob también atrapa los módulos que sirve Vite en
 * desarrollo, y una respuesta JSON en lugar de un módulo deja la página en
 * blanco sin un solo error visible. Es la trampa que costó las 25 fallas
 * iniciales de T-6.
 */
async function conLaCuentaCargada(page: Page, banco: Banco = {}): Promise<void> {
  const gastos = `/api/procesos/${PROCESO_ID}/gastos`;

  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    async (ruta) => {
      const url = new URL(ruta.request().url());
      const metodo = ruta.request().method();

      if (url.pathname.endsWith("/comprobante")) {
        if (banco.almacen !== undefined) {
          await ruta.fulfill({
            status: 502,
            json: {
              error: "comprobante_no_disponible",
              motivo: banco.almacen,
            },
          });
          return;
        }

        if (metodo === "GET") {
          await ruta.fulfill({
            status: 200,
            contentType: "application/pdf",
            headers: { "content-disposition": "attachment" },
            body: PAPEL,
          });
          return;
        }

        await ruta.fulfill({ status: 200, json: CUENTA_CON_PAPEL });
        return;
      }

      if (url.pathname.startsWith(gastos)) {
        if (metodo === "POST") {
          await ruta.fulfill({ status: 201, json: CUENTA_CON_EL_NUEVO });
          return;
        }
        if (metodo === "DELETE") {
          await ruta.fulfill({ status: 200, json: CUENTA_SIN_LA_MENSAJERIA });
          return;
        }
        await ruta.fulfill({ status: 200, json: banco.cuenta ?? CUENTA });
        return;
      }

      const cuerpo: Record<string, unknown> | null =
        url.pathname === `/api/procesos/${PROCESO_ID}`
          ? DETALLE
          : url.pathname === `/api/procesos/${PROCESO_ID}/notas`
            ? { tramos: [] }
            : url.pathname === `/api/procesos/${PROCESO_ID}/pendientes`
              ? { pendientes: [] }
              : url.pathname === `/api/procesos/${PROCESO_ID}/bitacora`
                ? { entradas: [], total: 0 }
                : url.pathname === "/api/usuarios"
                  ? { usuarios: [] }
                  : url.pathname === "/api/areas"
                    ? { areas: [] }
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

/** La sección de gastos, para no repetir el selector en cada prueba. */
function panel(page: Page) {
  return page.getByRole("region", { name: "Gastos y anticipos" });
}

/**
 * El bloque del saldo, encontrado **por su clase y no por su rótulo**.
 *
 * Es deliberado y se midió. La primera versión lo buscaba por el nombre
 * accesible —`getByRole("region", { name: /Saldo informativo/ })`—, y
 * entonces cambiar el rótulo mataba nueve pruebas: las cuatro del saldo y
 * las cinco responsivas, todas porque el localizador dejaba de resolver y
 * ninguna porque afirmara nada sobre el rótulo. Una mutación que mata por
 * el localizador no prueba la guarda que uno cree, que es la lección que
 * T-8 dejó escrita.
 *
 * Con el localizador desacoplado, la única prueba que muere al borrar la
 * palabra «informativo» es la que la afirma.
 */
function bloqueDelSaldo(page: Page) {
  return panel(page).locator(".saldo");
}

/**
 * Cuenta las peticiones al comprobante que **de verdad salieron**.
 *
 * El escucha se registra antes del clic que podría dispararlas, que es la
 * mitad que T-2 B encontró rota en la tajada 1: un `page.on("request")`
 * registrado después del disparo puede no ver nada y hacer pasar una prueba
 * que no midió. Y lo que se lee después es `subidas.length` sobre un arreglo
 * —el instante— y no una aserción que reintenta: lo que se quiere demostrar
 * es un «nunca salió», y una aserción que espera tolera justamente la
 * ventana que se quiere prohibir.
 */
function contandoSubidas(page: Page): string[] {
  const subidas: string[] = [];
  page.on("request", (peticion) => {
    if (peticion.url().includes("/comprobante")) subidas.push(peticion.url());
  });
  return subidas;
}

/** Los anchos del criterio de §9, en los puntos donde suele quebrarse. */
const ANCHOS = [320, 360, 414, 767, 768, 1024, 1280, 1920, 2560] as const;
const ALTO = 900;

test.describe("los gastos reales de un proceso", () => {
  test("el panel cuelga del proceso y muestra las dos familias", async ({
    page,
  }) => {
    await conLaCuentaCargada(page);
    await page.goto(DETALLE_URL);

    const gastos = panel(page);
    await expect(gastos).toBeVisible();

    // Las dos familias se leen distinto y se dibujan las dos: el gasto es
    // plata que salió y el anticipo plata que entró.
    await expect(
      gastos.getByRole("heading", { name: "Lo que el cliente adelantó" }),
    ).toBeVisible();
    await expect(
      gastos.getByRole("heading", { name: "Lo que se gastó en el trámite" }),
    ).toBeVisible();

    // Y cada movimiento está en la suya. El anticipo no aparece entre los
    // gastos, que es el error que haría leer al revés el signo del saldo.
    const familiaDeGastos = gastos.getByRole("region", {
      name: "Lo que se gastó en el trámite",
    });
    await expect(familiaDeGastos).toContainText(
      "Mensajería al Registro Público de Panamá",
    );
    await expect(familiaDeGastos).not.toContainText(
      "Depósito inicial del cliente",
    );
  });

  test("el saldo que se ve es el del servidor, no la suma de las filas", async ({
    page,
  }) => {
    await conLaCuentaCargada(page);
    await page.goto(DETALLE_URL);

    const gastos = panel(page);
    const saldo = bloqueDelSaldo(page);

    // Lo que el banco declaró, que no es la suma de los movimientos ni la
    // resta de los subtotales.
    await expect(saldo).toContainText("3,111.11");
    await expect(saldo).toContainText("A favor del cliente");

    // Lo que daría sumar las filas que están en pantalla: 1 602,38 de
    // anticipos contra 1 163,34 de gastos, o sea 439,04 a favor.
    await expect(
      saldo,
      "la pantalla dibujó la resta de los movimientos en vez del saldo que" +
        " mandó el servidor: está sumando las filas",
    ).not.toContainText("439.04");

    // Y lo que daría restar los subtotales que el servidor mandó: 3 765,44.
    // Es la otra forma de calcular, y la que una pantalla «prolija» elige
    // primero porque los dos números ya los tiene a mano.
    await expect(
      saldo,
      "la pantalla restó los subtotales en vez de leer el saldo: es la" +
        " segunda aritmética que I-7 existe para no tener",
    ).not.toContainText("3,765.44");

    // Los dos subtotales salen del mismo sitio, y tampoco coinciden con las
    // filas. Es la misma aserción en los otros dos números del cuerpo.
    await expect(gastos).toContainText("5,000.00");
    await expect(gastos).toContainText("1,234.56");
  });

  test("la cuenta saldada de la unidad A se lee «al día»", async ({ page }) => {
    // En centavos enteros la cuenta da **cero exacto**. La misma cuenta
    // hecha en dólares daría 5,68 × 10⁻¹⁴, y una pantalla que preguntara
    // `saldo === 0` sobre ese número diría que no está al día.
    await conLaCuentaCargada(page, { cuenta: CUENTA_AL_DIA });
    await page.goto(DETALLE_URL);

    const saldo = bloqueDelSaldo(page);

    await expect(saldo).toContainText("La cuenta está al día");
    await expect(saldo).not.toContainText("A favor del cliente");
    await expect(saldo).not.toContainText("El cliente debe");
  });

  test("sin anticipos el saldo dice que el cliente debe, y sin signo", async ({
    page,
  }) => {
    // Es la mecánica de reembolso contra factura: sólo filas `gasto`, y el
    // saldo queda negativo. Sale de las mismas filas sin una sola rama.
    await conLaCuentaCargada(page, { cuenta: CUENTA_EN_CONTRA });
    await page.goto(DETALLE_URL);

    const saldo = bloqueDelSaldo(page);

    await expect(saldo).toContainText("El cliente debe");
    await expect(saldo).toContainText("1,163.34");
    // El signo lo lleva la frase y no el número: un «−1,163.34» obliga a
    // acordarse de qué lado es el negativo.
    await expect(saldo).not.toContainText("-1,163.34");
    await expect(saldo).not.toContainText("−1,163.34");
  });

  test("el saldo está rotulado como informativo donde se lo mira", async ({
    page,
  }) => {
    await conLaCuentaCargada(page);
    await page.goto(DETALLE_URL);

    const gastos = panel(page);

    // **El rótulo, pegado a la cifra.** Es lo que sobrevive a que alguien
    // recorte la pantalla, la imprima o la fotocopie sin el párrafo de al
    // lado, y es el criterio que T-3 B fijó con el gasto estimado.
    await expect(
      gastos.getByRole("heading", { name: "Saldo informativo" }),
    ).toBeVisible();

    // **Y el aviso, que dice contra qué.** La palabra sola no distingue
    // «aproximado» de «no es el estado de cuenta del bufete».
    await expect(gastos).toContainText("no es contabilidad");
    await expect(gastos).toContainText("conciliación bancaria");

    // La marca **no es un color**: lo que la lleva es texto. Sin esta
    // aserción, alguien podría cambiar el rótulo por un borde de color y
    // las dos de arriba seguirían pasando si el texto quedara escondido.
    const titulo = gastos.getByRole("heading", { name: "Saldo informativo" });
    await expect(titulo).toHaveText("Saldo informativo");
  });

  test("cargar un movimiento asienta lo que contestó el servidor", async ({
    page,
  }) => {
    await conLaCuentaCargada(page);
    await page.goto(DETALLE_URL);

    const gastos = panel(page);
    await gastos.getByLabel("Concepto").fill(CONCEPTO_NUEVO);
    await gastos.getByLabel("Qué pasó").selectOption("gasto");
    await gastos.getByLabel("Importe").fill("439.04");
    await gastos.getByRole("button", { name: "Cargar el movimiento" }).click();

    // La lista y el saldo se reemplazan **juntos**, con lo que vino.
    await expect(gastos).toContainText(CONCEPTO_NUEVO);
    await expect(gastos).toContainText("3,000.00");
    await expect(gastos).not.toContainText("3,326.40");

    // Y el borrador se vacía sólo porque el servidor lo guardó.
    await expect(gastos.getByLabel("Concepto")).toHaveValue("");
  });

  test("un movimiento sin tipo no sale, y se dice por qué", async ({
    page,
  }) => {
    await conLaCuentaCargada(page);
    await page.goto(DETALLE_URL);

    const gastos = panel(page);
    await gastos.getByLabel("Concepto").fill("Algo");
    await gastos.getByLabel("Importe").fill("10.00");
    await gastos.getByRole("button", { name: "Cargar el movimiento" }).click();

    await expect(gastos).toContainText(
      "Hay que decir si es un gasto que pagó el bufete o un anticipo",
    );
    // Y lo que se escribió no se pierde: una validación previa no es motivo
    // para tirar el trabajo de nadie.
    await expect(gastos.getByLabel("Concepto")).toHaveValue("Algo");
  });

  test("sacar un movimiento deja el saldo que mandó el servidor", async ({
    page,
  }) => {
    await conLaCuentaCargada(page);
    await page.goto(DETALLE_URL);

    const gastos = panel(page);
    await gastos
      .getByRole("button", {
        name: /Quitar «Mensajería al Registro Público de Panamá»/,
      })
      .click();

    await expect(gastos).not.toContainText(
      "Mensajería al Registro Público de Panamá",
    );
    await expect(gastos).toContainText("4,222.22");
    await expect(gastos).not.toContainText("4,340.83");
  });
});

test.describe("el comprobante", () => {
  test("adjuntar un papel marca el movimiento como que lo tiene", async ({
    page,
  }) => {
    await conLaCuentaCargada(page);
    await page.goto(DETALLE_URL);

    const gastos = panel(page);
    const fila = gastos.locator(".movimiento", { hasText: CONCEPTO_LARGO });
    await expect(fila).toContainText("Sin comprobante");

    // **La aserción de presencia del contador.** Sin ella, el «nunca salió»
    // de la prueba de abajo pasaría igual con un escucha que no engancha
    // nada, que es el mismo modo de falla que un `toHaveCount(0)` sobre un
    // selector que no encuentra.
    const subidas = contandoSubidas(page);

    const eleccion = page.waitForEvent("filechooser");
    await fila
      .getByRole("button", { name: /Adjuntar el comprobante/ })
      .click();
    await (
      await eleccion
    ).setFiles({
      name: "boleta.pdf",
      mimeType: "application/pdf",
      buffer: PAPEL,
    });

    await expect(fila).toContainText("Con comprobante");
    // Y aparece la forma de verlo, que antes no estaba.
    await expect(
      fila.getByRole("button", { name: /Ver el comprobante/ }),
    ).toBeVisible();

    expect(
      subidas.length,
      "el contador de subidas no enganchó nada sobre una subida que sí" +
        " ocurrió: el «nunca salió» de la prueba siguiente no mediría nada",
    ).toBeGreaterThan(0);
  });

  test("un archivo que no es comprobante se rechaza sin subirlo", async ({
    page,
  }) => {
    await conLaCuentaCargada(page);
    await page.goto(DETALLE_URL);

    const gastos = panel(page);
    const fila = gastos.locator(".movimiento", { hasText: CONCEPTO_LARGO });

    const subidas = contandoSubidas(page);

    const eleccion = page.waitForEvent("filechooser");
    await fila
      .getByRole("button", { name: /Adjuntar el comprobante/ })
      .click();
    await (
      await eleccion
    ).setFiles({
      name: "pagina.html",
      mimeType: "text/html",
      buffer: Buffer.from("<p>no soy un comprobante</p>"),
    });

    // **El conteo va primero, y eso se midió.** Con el texto adelante, dos
    // mutaciones distintas —quitar la validación entera, y avisar pero
    // subir igual— morían las dos en la aserción del texto y el conteo no
    // llegaba a evaluarse nunca: una aserción inalcanzable no mide nada.
    // Con este orden, cada mutación tiene su propia aserción que la mata.
    expect(
      subidas.length,
      "el archivo que no es comprobante viajó igual: la validación previa no" +
        " está cortando nada",
    ).toBe(0);

    await expect(gastos).toContainText("Eso no se puede guardar como comprobante");
    // Y la fila sigue sin papel: la aserción de presencia al lado de la de
    // ausencia.
    await expect(fila).toContainText("Sin comprobante");
  });

  test("ver el comprobante lo descarga con un nombre que se lee", async ({
    page,
  }) => {
    await conLaCuentaCargada(page);
    await page.goto(DETALLE_URL);

    const fila = panel(page).locator(".movimiento", {
      hasText: "Depósito inicial del cliente",
    });

    const bajada = page.waitForEvent("download");
    await fila.getByRole("button", { name: /Ver el comprobante/ }).click();

    // El nombre lo pone la pantalla porque la llave no viaja: sin esto el
    // navegador guardaría un archivo llamado como un UUID.
    expect((await bajada).suggestedFilename()).toContain("comprobante");
  });
});

/* ==========================================================================
   Sin binding de R2

   La regla que la unidad A dejó escrita: sin el almacén configurado,
   registrar y leer el saldo andan y **sólo** el comprobante contesta 502.
   ========================================================================== */

test.describe("cuando no hay dónde archivar el papel", () => {
  test("se dice qué pasó y qué hacer, sin hablar de un bucket", async ({
    page,
  }) => {
    await conLaCuentaCargada(page, { almacen: "almacen_no_configurado" });
    await page.goto(DETALLE_URL);

    const gastos = panel(page);
    const fila = gastos.locator(".movimiento", { hasText: CONCEPTO_LARGO });

    const eleccion = page.waitForEvent("filechooser");
    await fila
      .getByRole("button", { name: /Adjuntar el comprobante/ })
      .click();
    await (
      await eleccion
    ).setFiles({
      name: "boleta.pdf",
      mimeType: "application/pdf",
      buffer: PAPEL,
    });

    // El texto del motivo, no el de reserva. Es la deuda que la unidad A
    // dejó declarada en `src/api/peticiones.ts`.
    await expect(gastos).toContainText("todavía no tiene dónde archivar");
    await expect(
      gastos,
      "el 502 del comprobante cayó en el camino genérico de `peticiones.ts`",
    ).not.toContainText("respuesta inesperada");
    // Ninguna frase nombra un binding, una variable de entorno ni un
    // bucket: quien lee esto es un abogado.
    await expect(gastos).not.toContainText("COMPROBANTES");
    await expect(gastos).not.toContainText("R2");
  });

  test("y aun así se puede cargar un gasto", async ({ page }) => {
    // **La regla de la unidad A, en pantalla.** Que no se pueda adjuntar un
    // comprobante no puede impedir registrar un gasto: son dos estados
    // separados a propósito, y uno solo compartido haría que una negativa
    // del almacén apagara el formulario.
    await conLaCuentaCargada(page, { almacen: "almacen_no_disponible" });
    await page.goto(DETALLE_URL);

    const gastos = panel(page);
    const fila = gastos.locator(".movimiento", { hasText: CONCEPTO_LARGO });

    const eleccion = page.waitForEvent("filechooser");
    await fila
      .getByRole("button", { name: /Adjuntar el comprobante/ })
      .click();
    await (
      await eleccion
    ).setFiles({
      name: "boleta.pdf",
      mimeType: "application/pdf",
      buffer: PAPEL,
    });
    await expect(gastos).toContainText("no se pudo archivar");

    // Con el aviso del almacén en pantalla, el formulario sigue vivo.
    const boton = gastos.getByRole("button", {
      name: "Cargar el movimiento",
    });
    await expect(
      boton,
      "el fallo del almacén apagó el botón de registrar: un gasto no se" +
        " puede dejar de cargar porque falte un bucket",
    ).toBeEnabled();

    await gastos.getByLabel("Concepto").fill(CONCEPTO_NUEVO);
    await gastos.getByLabel("Qué pasó").selectOption("gasto");
    await gastos.getByLabel("Importe").fill("439.04");
    await boton.click();

    await expect(gastos).toContainText(CONCEPTO_NUEVO);
    await expect(gastos).toContainText("3,000.00");
    await expect(gastos).not.toContainText("3,326.40");
  });

  test("traer un papel que no se puede traer también lo dice", async ({
    page,
  }) => {
    await conLaCuentaCargada(page, { almacen: "almacen_no_disponible" });
    await page.goto(DETALLE_URL);

    const gastos = panel(page);
    await gastos
      .locator(".movimiento", { hasText: "Depósito inicial del cliente" })
      .getByRole("button", { name: /Ver el comprobante/ })
      .click();

    await expect(gastos).toContainText("volver a subir el papel");
    await expect(gastos).not.toContainText("respuesta inesperada");
  });
});

/* ==========================================================================
   El criterio responsivo de §9
   ========================================================================== */

test.describe("la pantalla de gastos no scrollea en horizontal", () => {
  test("el banco de esta suite sigue siendo contenido hostil", async ({
    page,
  }) => {
    // El día que alguien le acorte el concepto «para que se vea mejor», el
    // criterio de abajo se vuelve vacuo sin que nadie se entere. Esta
    // prueba es la que avisa, igual que la primera de
    // `sin-scroll-horizontal.spec.ts`.
    await conLaCuentaCargada(page);
    await page.goto(DETALLE_URL);
    await expect(panel(page)).toContainText(CONCEPTO_LARGO);

    expect(
      CONCEPTO_LARGO.length,
      "hace falta un token largo de verdad en un concepto",
    ).toBeGreaterThanOrEqual(60);
    expect(
      /[\s\-_.]/.test(CONCEPTO_LARGO),
      "el token no puede tener espacios, guiones ni puntos: son puntos de" +
        " corte y el navegador lo partiría solo, así que la regla de" +
        " contención nunca llegaría a actuar",
    ).toBe(false);
  });

  for (const ancho of ANCHOS) {
    test(`a ${String(ancho)}px de ancho, sobre la cuenta del proceso`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: ancho, height: ALTO });
      await conLaCuentaCargada(page);
      await page.goto(DETALLE_URL);
      await page.evaluate(() => document.fonts.ready);
      // Se espera a que la cuenta esté dibujada, **sin pasar por el texto
      // del rótulo**: si no, cambiar el rótulo rompería las nueve medidas
      // de §9 por un motivo que no tiene nada que ver con el layout.
      await bloqueDelSaldo(page).waitFor();
      await panel(page).locator(".movimiento").first().waitFor();

      const desborde = await medirDesborde(page);

      expect(
        desborde.scrollWidth,
        porQueSeSale(ancho, desborde),
      ).toBeLessThanOrEqual(desborde.clientWidth);
    });
  }
});
