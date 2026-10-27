/**
 * La pantalla del plan de pagos (T-11, unidad B), en el navegador.
 *
 * Lo que solo se puede comprobar acá:
 *
 *  1. **Que los importes dibujados sean los que mandó el servidor.** La
 *     aritmética ya está probada como función en el fondo, y que esta capa
 *     no la repita en `test/plan-ui.spec.ts`; lo que esto agrega es que las
 *     cifras que se ven en la página sean ésas y no otras. **El banco
 *     contesta un plan cuyos tres números están despegados entre sí**: ni
 *     los importes salen de aplicar los porcentajes a la base, ni el total
 *     es la suma de los importes. Si la pantalla calculara, se verían otros
 *     números.
 *  2. **Que el residuo se vea donde se mira.** Las dos cifras —lo que el
 *     plan suma y lo que la cotización cobra— tienen que estar juntas y
 *     escritas, no en un comentario del código.
 *  3. **Que el plan siga abierto sobre una cotización emitida**, que es un
 *     estado de componente —un `editable` que no se pasa— y afirmarlo sobre
 *     una función sería afirmar sobre la mitad que no se rompe.
 *  4. **Que un solo campo de cifra esté dibujado a la vez**, que es lo que
 *     vuelve imposible mandar una cuota con monto y porcentaje.
 *  5. El criterio responsivo de §9 sobre el contenido nuevo.
 *
 * **Las respuestas de la API van interceptadas.** `vite dev` corre sin
 * identidad de Access, así que la API real contesta 403 y la pantalla se
 * dibujaría como un aviso de error: medir el layout de un párrafo suelto
 * sería la vacuidad que T-4 descubrió en su propia rejilla.
 */
import { expect, test, type Page } from "@playwright/test";

import { medirDesborde, porQueSeSale } from "./desborde";

const COTIZACION_ID = "7c3d9a1b-2e4f-4a56-9b88-1d2e3f4a5b6c";
const CLIENTE_ID = "11111111-2222-4333-8444-555555555555";

function cotizacion(ajustes: Record<string, unknown>): Record<string, unknown> {
  return {
    id: COTIZACION_ID,
    codigo: "COT-2026-0021",
    estado: "borrador",
    clienteId: CLIENTE_ID,
    clienteNombre: "Inversiones y Desarrollos del Istmo, S.A.",
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
const EMITIDA = cotizacion({ estado: "emitida" });

/**
 * Un concepto con un token largo **sin espacios ni guiones**.
 *
 * Es la lección de T-4 que ya mordió tres veces en esta tajada: un token con
 * guiones no sirve como contenido hostil porque el guion ya es un punto de
 * corte y el navegador lo parte solo. Esto es lo que sale de pegar la
 * referencia de un acuerdo dentro del concepto de una cuota.
 */
const CONCEPTO_LARGO =
  "AnticipoContraSuscripcionDelPactoSocialYEntregaDeDocumentacionCompleta";

/**
 * **Los tres números del plan están despegados entre sí, y eso costó una
 * medición en T-10 B.**
 *
 * La cuota de 3333 puntos básicos declara un importe de 777,77, que **no**
 * es el 33,33 % de la base de 1 000,00 —sería 333,30—. Y el total declarado,
 * 999,90, **tampoco** es la suma de los tres importes —1 500,00 + 777,77 +
 * 250,00 daría 2 527,77—.
 *
 * La primera versión de este banco declaraba cifras coherentes entre sí.
 * Medido con la mutación que hace que la pantalla aplique el porcentaje en
 * vez de leerlo: **las pruebas pasaban igual**. Un doble que devuelve algo
 * coherente con lo que ya mandó no distingue una pantalla que muestra de una
 * que calcula.
 *
 * El total y la base **sí** guardan entre sí la relación que la prueba del
 * residuo necesita —999,90 contra 1 000,00, los diez centavos— porque eso es
 * lo que se está midiendo. Lo que está despegado es de dónde salen.
 */
const BASE = 100_000;

const CUOTAS = [
  {
    id: "q1",
    concepto: "Anticipo a la firma del poder",
    monto: 150_000,
    porcentaje: null,
    venceEn: null,
    hito: "A la firma",
    importe: 150_000,
    creadaEn: "2026-10-22T15:00:00.000Z",
  },
  {
    id: "q2",
    concepto: CONCEPTO_LARGO,
    monto: null,
    porcentaje: 3_333,
    venceEn: null,
    hito: "Contra inscripción en el Registro Público",
    // **No es el 33,33 % de la base.** Ver arriba.
    importe: 77_777,
    creadaEn: "2026-10-23T15:00:00.000Z",
  },
  {
    id: "q3",
    concepto: "Saldo al cierre del trámite",
    monto: 25_000,
    porcentaje: null,
    venceEn: "2026-06-30",
    hito: null,
    importe: 25_000,
    creadaEn: "2026-10-24T15:00:00.000Z",
  },
];

/** El plan que el banco contesta: total y base despegados de las cuotas. */
const PLAN = { cuotas: CUOTAS, total: 99_990, base: BASE };

/** Un plan que cierra exacto, para el otro lado del cotejo. */
const PLAN_EXACTO = { cuotas: CUOTAS, total: BASE, base: BASE };

/** Y uno que se pasa. */
const PLAN_EXCEDIDO = { cuotas: CUOTAS, total: 110_000, base: BASE };

/** El plan vacío: una cotización que todavía no acordó nada. */
const PLAN_VACIO = { cuotas: [], total: 0, base: BASE };

const CONCEPTO_NUEVO = "Segunda cuota contra demanda presentada";

/** Lo que el servidor contesta al agregar una cuota: el plan entero. */
const PLAN_CON_LA_NUEVA = {
  cuotas: [
    ...CUOTAS,
    {
      id: "q4",
      concepto: CONCEPTO_NUEVO,
      monto: null,
      porcentaje: 2_500,
      venceEn: null,
      hito: "Contra demanda presentada",
      // Tampoco es el 25 % de la base: ver el comentario de `PLAN`.
      importe: 11_111,
      creadaEn: "2026-10-25T15:00:00.000Z",
    },
  ],
  total: 111_101,
  base: BASE,
};

/** Y al sacar una cuota del plan. */
const PLAN_SIN_LA_PRIMERA = {
  cuotas: [CUOTAS[1], CUOTAS[2]],
  total: 22_222,
  base: BASE,
};

type Banco = {
  /** Qué contesta el plan en la primera lectura. */
  readonly plan?: unknown;
  /** En qué estado está la cotización. */
  readonly cotizacion?: Record<string, unknown>;
  /** Si el alta tiene que contestar 422, y con qué fallas. */
  readonly rechazo?: { campo: string; motivo: string }[];
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
/**
 * El catálogo de plantillas de módulo, que el editor de módulos lee desde T-3
 * (`odd/tasks/plantillas-de-modulo.md`).
 *
 * Está acá porque esta pantalla monta el editor de módulos y este banco
 * contesta la API entera desde un predicado: sin esta rama el catálogo caería
 * en el 404 de reserva, y el editor —que sin rótulos no sabe cómo se llama
 * ningún módulo— dibujaría su aviso de lectura fallida en vez de la lista.
 *
 * Los seis con su preset y activos: el estado de un bufete que no tocó nada.
 * Lo que el rótulo propio y la baja cambian se mide en
 * `e2e/cotizaciones.spec.ts`, que es el dueño de esa pantalla.
 */
const PLANTILLAS_DE_MODULO = [
  ["antecedentes", "Antecedentes"],
  ["alcance", "Alcance"],
  ["exclusiones", "Exclusiones"],
  ["supuestos", "Supuestos"],
  ["clausulas", "Cláusulas"],
  ["nota_cliente", "Nota al cliente"],
].map(([clave, rotulo], orden) => ({
  id: `p0000000-0000-4000-8000-00000000000${String(orden)}`,
  clave,
  orden,
  rotuloOficial: rotulo,
  descripcionOficial: `Para qué sirve ${String(rotulo).toLowerCase()}.`,
  rotulo: null,
  descripcion: null,
  rotuloVigente: rotulo,
  descripcionVigente: `Para qué sirve ${String(rotulo).toLowerCase()}.`,
  activo: true,
}));

async function conElPlanCargado(page: Page, banco: Banco = {}): Promise<void> {
  const cuotas = `/api/cotizaciones/${COTIZACION_ID}/cuotas`;

  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    async (ruta) => {
      const url = new URL(ruta.request().url());
      const metodo = ruta.request().method();

      if (url.pathname.startsWith(cuotas)) {
        if (metodo === "POST") {
          if (banco.rechazo !== undefined) {
            await ruta.fulfill({
              status: 422,
              json: { error: "datos_invalidos", fallas: banco.rechazo },
            });
            return;
          }
          await ruta.fulfill({ status: 201, json: PLAN_CON_LA_NUEVA });
          return;
        }
        if (metodo === "DELETE") {
          await ruta.fulfill({ status: 200, json: PLAN_SIN_LA_PRIMERA });
          return;
        }
        await ruta.fulfill({ status: 200, json: banco.plan ?? PLAN });
        return;
      }

      // El catálogo de plantillas sale antes de la cadena de abajo, en su
      // propio `if`: metido como una rama más habría que correrle la sangría a
      // las cinco que ya están, y eso convierte tres líneas en veinte.
      if (url.pathname === "/api/plantillas-modulo") {
        await ruta.fulfill({
          status: 200,
          json: { plantillas: PLANTILLAS_DE_MODULO },
        });
        return;
      }

      const cuerpo: Record<string, unknown> | null =
        url.pathname === `/api/cotizaciones/${COTIZACION_ID}`
          ? { cotizacion: banco.cotizacion ?? BORRADOR }
          : url.pathname === `/api/cotizaciones/${COTIZACION_ID}/modulos`
            ? { modulos: [] }
            : url.pathname === `/api/cotizaciones/${COTIZACION_ID}/lineas`
              ? {
                  lineas: [],
                  totales: { honorarios: 0, gastosEstimados: 0, total: 0 },
                }
              : url.pathname === `/api/cotizaciones/${COTIZACION_ID}/bitacora`
                ? { entradas: [], total: 0 }
                : url.pathname === "/api/clientes"
                  ? { clientes: [] }
                  : null;

      if (cuerpo === null) {
        await ruta.fulfill({ status: 404, json: { error: "not_found" } });
        return;
      }
      await ruta.fulfill({ status: 200, json: cuerpo });
    },
  );
}

const DETALLE_URL = `/cotizaciones/${COTIZACION_ID}`;

/** La sección del plan, para no repetir el selector en cada prueba. */
function seccion(page: Page) {
  return page.getByRole("region", { name: "Plan de pagos" });
}

/**
 * El bloque del cotejo, encontrado **por su clase y no por su rótulo**.
 *
 * Es deliberado y es la lección que T-10 B midió: con el localizador atado
 * al nombre accesible, cambiar el titular mataba nueve pruebas por el
 * localizador y ninguna por lo que afirman. Una mutación que mata por el
 * localizador no prueba la guarda que uno cree.
 *
 * Con el localizador desacoplado, la única prueba que muere al cambiar el
 * titular es la que lo afirma.
 */
function bloqueDelCotejo(page: Page) {
  return seccion(page).locator(".cotejo");
}

/** Los anchos del criterio de §9, en los puntos donde suele quebrarse. */
const ANCHOS = [320, 360, 414, 767, 768, 1024, 1280, 1920, 2560] as const;
const ALTO = 900;

test.describe("el plan de pagos de una cotización", () => {
  test("cuelga de la cotización y muestra el cronograma entero", async ({
    page,
  }) => {
    await conElPlanCargado(page);
    await page.goto(DETALLE_URL);

    const plan = seccion(page);
    await expect(plan).toBeVisible();

    // Las tres cuotas, en el orden en que el servidor las mandó.
    const renglones = plan.locator(".cuota");
    await expect(renglones).toHaveCount(3);
    await expect(renglones.first()).toContainText("Anticipo a la firma del poder");
    await expect(renglones.last()).toContainText("Saldo al cierre del trámite");
  });

  /**
   * **La prueba central de la unidad.**
   *
   * El banco declara, para la cuota del 33,33 %, un importe de 777,77 que
   * no es el 33,33 % de los 1 000,00 de base. Lo que tiene que verse en la
   * página es 777.77. Si la pantalla aplicara el porcentaje, se vería
   * 333.30.
   */
  test("dibuja el importe que mandó el servidor, no el que saldría de calcularlo", async ({
    page,
  }) => {
    await conElPlanCargado(page);
    await page.goto(DETALLE_URL);

    const porcentual = seccion(page).locator(".cuota").nth(1);

    await expect(porcentual).toContainText("777.77");
    // Y el porcentaje se escribe, porque es el dato de la cuota.
    await expect(porcentual).toContainText("33.33 %");
    // Lo que **no** puede aparecer es el resultado de aplicarlo acá.
    await expect(porcentual).not.toContainText("333.30");
  });

  /**
   * La hermana de la de arriba, un nivel más arriba: el total tampoco se
   * suma en la pantalla.
   */
  test("dibuja el total que mandó el servidor, no la suma de los importes", async ({
    page,
  }) => {
    await conElPlanCargado(page);
    await page.goto(DETALLE_URL);

    const cotejo = bloqueDelCotejo(page);

    await expect(cotejo).toContainText("999.90");
    // La suma de los tres importes del banco daría 2,527.77.
    await expect(cotejo).not.toContainText("2,527.77");
  });

  /**
   * **El residuo, donde se mira.**
   *
   * Las dos cifras juntas y el titular en palabras. Quien arma el plan tiene
   * que ver que no cierra antes de mandárselo al cliente, no descubrirlo
   * cuando no cuadre la cuenta.
   */
  test("muestra las dos cifras juntas cuando el plan no cierra", async ({
    page,
  }) => {
    await conElPlanCargado(page);
    await page.goto(DETALLE_URL);

    const cotejo = bloqueDelCotejo(page);

    await expect(cotejo).toContainText("El plan no llega al total");
    await expect(cotejo).toContainText("999.90");
    await expect(cotejo).toContainText("1,000.00");
    // Y explica de dónde puede salir el resto, que es lo que hace que la
    // diferencia sea accionable en vez de alarmante.
    await expect(cotejo).toContainText("se trunca hacia abajo");
  });

  test("y dice que cierra cuando cierra", async ({ page }) => {
    // El contrapeso de la de arriba: sin ésta, un cotejo que dijera siempre
    // «no llega» pasaría la anterior.
    await conElPlanCargado(page, { plan: PLAN_EXACTO });
    await page.goto(DETALLE_URL);

    await expect(bloqueDelCotejo(page)).toContainText(
      "El plan cubre el total exacto",
    );
  });

  test("y avisa cuando se pasa", async ({ page }) => {
    await conElPlanCargado(page, { plan: PLAN_EXCEDIDO });
    await page.goto(DETALLE_URL);

    await expect(bloqueDelCotejo(page)).toContainText("El plan se pasa del total");
  });

  test("una cotización sin plan lo dice en vez de mostrar una lista vacía", async ({
    page,
  }) => {
    await conElPlanCargado(page, { plan: PLAN_VACIO });
    await page.goto(DETALLE_URL);

    const plan = seccion(page);
    await expect(plan.locator(".cuota")).toHaveCount(0);
    await expect(plan).toContainText("todavía no tiene plan de pagos");
  });

  /**
   * **Y no dibuja el cotejo, que es lo que T-16 vino a arreglar.**
   *
   * Hasta acá, debajo de «todavía no tiene plan de pagos» aparecía el
   * recuadro entero: «El plan no llega al total · Suma del plan 0.00», con
   * el párrafo del truncamiento explicando que tres cuotas del 33,33 %
   * suman 99,99 %. Un plan vacío no es un plan que no cierra, y ese párrafo
   * le hablaba de un problema que nadie tenía.
   *
   * El localizador cuelga de `seccion(page)` y no del documento: el cotejo
   * se cuenta dentro de la sección del plan, que es donde vive.
   */
  test("una cotización sin cuotas no dibuja el cotejo", async ({ page }) => {
    await conElPlanCargado(page, { plan: PLAN_VACIO });
    await page.goto(DETALLE_URL);

    const plan = seccion(page);
    // La sección ya cargó: sin esto, el cotejo ausente podría ser la
    // pantalla que todavía dice «Consultando…».
    await expect(plan).toContainText("todavía no tiene plan de pagos");

    await expect(bloqueDelCotejo(page)).toHaveCount(0);
    await expect(plan).not.toContainText("El plan no llega al total");
    await expect(plan).not.toContainText("se trunca hacia abajo");
  });

  test("y con cuotas que no cierran sí lo dibuja", async ({ page }) => {
    // La aserción de presencia al lado de la de ausencia: sin ésta, una
    // pantalla que no dibujara nunca el cotejo pasaría la de arriba.
    await conElPlanCargado(page);
    await page.goto(DETALLE_URL);

    await expect(bloqueDelCotejo(page)).toHaveCount(1);
    await expect(bloqueDelCotejo(page)).toContainText(
      "El plan no llega al total",
    );
  });

  test("avisa que el plan no registra cobros", async ({ page }) => {
    // Es el reverso de una decisión del fondo: `cuota` no tiene `pagada_en`.
    // Sin este aviso, una lista de cuotas se lee como un estado de cuenta.
    await conElPlanCargado(page);
    await page.goto(DETALLE_URL);

    await expect(seccion(page)).toContainText(
      "Esto es lo que se va a cobrar, no lo que se cobró",
    );
  });
});

test.describe("cargar y quitar una cuota", () => {
  test("hay un solo campo de cifra dibujado a la vez", async ({ page }) => {
    // **Es lo que vuelve imposible mandar una cuota con monto y
    // porcentaje.** Un segundo campo escondido guardaría lo que alguien
    // escribió para la otra clase y lo mandaría sin que se vea.
    await conElPlanCargado(page);
    await page.goto(DETALLE_URL);

    const plan = seccion(page);
    const cifra = plan.locator("#cuota-cifra");

    // Sin clase elegida no hay campo: el borrador arranca sin nada elegido.
    await expect(cifra).toHaveCount(0);

    // El rótulo del campo sale del mismo registro que dibujó la opción, así
    // que no pueden decir cosas distintas: se afirma sobre la etiqueta de
    // `#cuota-cifra` y no sobre un texto suelto de la página.
    const rotulo = plan.locator('label[for="cuota-cifra"]');

    await plan.getByRole("radio", { name: /Un importe fijo/ }).check();
    await expect(cifra).toHaveCount(1);
    await expect(rotulo).toContainText("Importe");

    await plan.getByRole("radio", { name: /Un porcentaje del total/ }).check();
    // Sigue habiendo **uno**, no dos.
    await expect(cifra).toHaveCount(1);
    await expect(rotulo).toContainText("Porcentaje");
  });

  test("cambiar de clase vacía la cifra que se había escrito", async ({
    page,
  }) => {
    // «50» como importe no es «50» como porcentaje, y arrastrarlo es el
    // camino a cobrar cincuenta dólares donde iba la mitad del encargo.
    await conElPlanCargado(page);
    await page.goto(DETALLE_URL);

    const plan = seccion(page);
    await plan.getByRole("radio", { name: /Un importe fijo/ }).check();
    await plan.locator("#cuota-cifra").fill("50");
    await plan.getByRole("radio", { name: /Un porcentaje del total/ }).check();

    await expect(plan.locator("#cuota-cifra")).toHaveValue("");
  });

  test("el campo de cuándo cambia con el disparador", async ({ page }) => {
    await conElPlanCargado(page);
    await page.goto(DETALLE_URL);

    const plan = seccion(page);

    await expect(plan.locator("#cuota-vence")).toHaveCount(0);
    await expect(plan.locator("#cuota-hito")).toHaveCount(0);

    await plan.getByRole("radio", { name: /En una fecha/ }).check();
    await expect(plan.locator("#cuota-vence")).toHaveCount(1);
    await expect(plan.locator("#cuota-hito")).toHaveCount(0);

    await plan.getByRole("radio", { name: /Contra un hito/ }).check();
    await expect(plan.locator("#cuota-vence")).toHaveCount(0);
    await expect(plan.locator("#cuota-hito")).toHaveCount(1);
  });

  test("agregar una cuota dibuja el plan que contestó el servidor", async ({
    page,
  }) => {
    await conElPlanCargado(page);
    await page.goto(DETALLE_URL);

    const plan = seccion(page);
    await plan.locator("#cuota-concepto").fill(CONCEPTO_NUEVO);
    await plan.getByRole("radio", { name: /Un porcentaje del total/ }).check();
    await plan.locator("#cuota-cifra").fill("25");
    await plan.getByRole("radio", { name: /Contra un hito/ }).check();
    await plan.locator("#cuota-hito").fill("Contra demanda presentada");
    await plan.getByRole("button", { name: "Cargar la cuota" }).click();

    await expect(plan.locator(".cuota")).toHaveCount(4);
    // El importe de la cuota nueva es el que mandó el servidor —11 111— y no
    // el 25 % de la base, que daría 250,00.
    await expect(plan.locator(".cuota").last()).toContainText("111.11");
    await expect(plan.locator(".cuota").last()).not.toContainText("250.00");
    // Y el total también es el del servidor.
    await expect(bloqueDelCotejo(page)).toContainText("1,111.01");
  });

  test("el borrador se vacía sólo cuando el servidor guardó", async ({
    page,
  }) => {
    await conElPlanCargado(page, {
      rechazo: [{ campo: "concepto", motivo: "concepto_requerido" }],
    });
    await page.goto(DETALLE_URL);

    const plan = seccion(page);
    await plan.locator("#cuota-concepto").fill("Una cuota cualquiera");
    await plan.getByRole("radio", { name: /Un importe fijo/ }).check();
    await plan.locator("#cuota-cifra").fill("500");
    await plan.getByRole("radio", { name: /Contra un hito/ }).check();
    await plan.locator("#cuota-hito").fill("A la firma");
    await plan.getByRole("button", { name: "Cargar la cuota" }).click();

    // Tirar lo que alguien escribió porque el servidor dijo que no es perder
    // trabajo ajeno.
    await expect(plan.locator("#cuota-concepto")).toHaveValue(
      "Una cuota cualquiera",
    );
    await expect(plan).toContainText("Hay que decir qué se cobra");
  });

  test("quitar una cuota dibuja el plan sin ella y el total nuevo", async ({
    page,
  }) => {
    await conElPlanCargado(page);
    await page.goto(DETALLE_URL);

    const plan = seccion(page);
    await plan
      .getByRole("button", {
        name: "Quitar «Anticipo a la firma del poder» del plan",
      })
      .click();

    await expect(plan.locator(".cuota")).toHaveCount(2);
    await expect(bloqueDelCotejo(page)).toContainText("222.22");
  });

  test("no hay ningún control para editar una cuota", async ({ page }) => {
    // La ruta no existe: se quita y se vuelve a poner. La ausencia del botón
    // es cómo se dice eso, y el aviso lo explica para que no se lea como un
    // defecto.
    //
    // `.count()` y no una aserción que reintenta: lo que se quiere demostrar
    // es un «no hay ninguno», y una aserción que espera tolera la ventana
    // que se quiere prohibir.
    await conElPlanCargado(page);
    await page.goto(DETALLE_URL);

    const plan = seccion(page);
    await expect(plan.locator(".cuota")).toHaveCount(3);

    expect(await plan.getByRole("button", { name: /Editar/ }).count()).toBe(0);
    await expect(plan).toContainText("no se corrige");
  });
});

test.describe("el plan no se congela al emitir", () => {
  /**
   * **Es un estado de componente y por eso se mide acá.**
   *
   * `DetalleDeCotizacion` le pasa `editable` a los dos editores y **no** a
   * esta sección: las cuotas no entran al snapshot, así que agregar una no
   * toca el documento congelado — y es justo cuando una cotización se gana
   * que el plan se termina de acomodar.
   *
   * Afirmarlo sobre una función sería afirmar sobre la mitad que no se
   * rompe: lo que podría romperse es que alguien le pase `editable` por
   * simetría con los de arriba.
   */
  test("sobre una emitida, el formulario del plan sigue abierto", async ({
    page,
  }) => {
    await conElPlanCargado(page, { cotizacion: EMITIDA });
    await page.goto(DETALLE_URL);

    const plan = seccion(page);

    await expect(
      plan.getByRole("button", { name: "Cargar la cuota" }),
    ).toBeEnabled();
    await expect(
      plan.getByRole("button", {
        name: "Quitar «Anticipo a la firma del poder» del plan",
      }),
    ).toBeEnabled();
  });

  test("y el documento de arriba sí está cerrado, que es el contraste", async ({
    page,
  }) => {
    // La aserción de presencia al lado de la de ausencia: sin ésta, la de
    // arriba pasaría igual si `editable` no cerrara nada en ninguna parte.
    await conElPlanCargado(page, { cotizacion: EMITIDA });
    await page.goto(DETALLE_URL);

    await expect(page.getByText("ya no es un borrador")).toBeVisible();
  });
});

test.describe("la página no scrollea en horizontal con el plan", () => {
  for (const ancho of ANCHOS) {
    test(`a ${String(ancho)}px de ancho, con un concepto de cuota largo`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: ancho, height: ALTO });
      await conElPlanCargado(page);
      await page.goto(DETALLE_URL);
      await expect(seccion(page).locator(".cuota").first()).toBeVisible();

      const desborde = await medirDesborde(page);

      expect(
        desborde.scrollWidth,
        porQueSeSale(ancho, desborde),
      ).toBeLessThanOrEqual(desborde.clientWidth);
    });
  }
});
