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

/**
 * T-14 · Un tercer proceso, ya terminado.
 *
 * Existe para que el filtro por estado tenga algo que esconder: un filtro
 * cuyo criterio no deja afuera ninguna fila pasa igual estando roto.
 */
const CERRADO_EN = "2026-10-05T16:00:00.000Z";

const TERMINADO = {
  ...PROCESO,
  id: "7c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e61",
  clienteNombre: "Germán Arosemena",
  titulo: "Naturalización de Germán Arosemena",
  estado: "cerrado",
  cerradoEn: CERRADO_EN,
  etapasCumplidas: 4,
  etapasTotales: 4,
  etapaVigente: null,
};

/** El mismo proceso de siempre, después de que alguien lo cierre. */
const PROCESO_TRAS_CERRAR = {
  ...PROCESO,
  estado: "cerrado",
  cerradoEn: CERRADO_EN,
};

const DETALLE = { proceso: PROCESO, etapas: ETAPAS };

/* --- T-8 · la línea de tiempo ------------------------------------------ */

const NOTA_PAGO = "El cliente quiere pago diferido por meses.";
const NOTA_ENTREGA = "Entregó el acta de matrimonio apostillada.";

/**
 * Una nota con un token largo **de verdad** sin punto de corte.
 *
 * Es la lección de T-4, y acá costó el mismo error: la primera versión era
 * `SNM-2026-RESIDENCIA-...`, y los guiones son oportunidades de corte
 * naturales, así que el navegador lo partía solo y la regla defensiva nunca
 * llegaba a actuar. Medido: con `overflow-wrap: normal` el párrafo seguía
 * midiendo 253px dentro de sus 253px. **Una regla defensiva solo está
 * probada si el contenido la fuerza a actuar.**
 *
 * Este token no tiene ni espacios ni guiones ni puntos: es lo que sale de
 * copiar un acuse de un portal público y pegarlo en una nota.
 */
const NOTA_LARGA =
  "Acuse SNM2026RESIDENCIAPERMANENTEMATRIMONIO0000984512PAREV3CONSULTAWEB";

const LINEA = {
  tramos: [
    {
      etapa: ETAPAS[0],
      notas: [
        {
          id: "n1",
          procesoEtapaId: "e1",
          texto: NOTA_PAGO,
          autorId: "u1",
          autorNombre: "Itzel",
          creadaEn: "2026-09-01T16:00:00.000Z",
        },
        {
          id: "n2",
          procesoEtapaId: "e1",
          texto: NOTA_ENTREGA,
          autorId: "u2",
          autorNombre: "Ricardo",
          creadaEn: "2026-09-03T13:20:00.000Z",
        },
      ],
    },
    {
      etapa: ETAPAS[2],
      notas: [
        {
          id: "n3",
          procesoEtapaId: "e3",
          texto: NOTA_LARGA,
          autorId: "u1",
          autorNombre: "Itzel",
          creadaEn: "2026-10-05T19:45:00.000Z",
        },
      ],
    },
  ],
};

/** Lo que el servidor contesta al anotar: la línea entera, ya reagrupada. */
const NOTA_NUEVA = "El cliente pidió que lo llamemos por la tarde.";
const LINEA_CON_LA_NUEVA = {
  tramos: [
    LINEA.tramos[0],
    {
      etapa: ETAPAS[2],
      notas: [
        ...LINEA.tramos[1].notas,
        {
          id: "n4",
          procesoEtapaId: "e3",
          texto: NOTA_NUEVA,
          autorId: "u1",
          autorNombre: "Itzel",
          creadaEn: "2026-10-22T14:00:00.000Z",
        },
      ],
    },
  ],
};

/* --- T-9 · los pendientes ---------------------------------------------- */

const ITZEL = { id: "u1", nombre: "Itzel", email: "itzel@bufete.test", activo: true };
const RICARDO = {
  id: "u2",
  nombre: "Ricardo",
  email: "ricardo@bufete.test",
  activo: true,
};
const EQUIPO = [ITZEL, RICARDO];

/**
 * Un pendiente con un token largo **sin guiones ni espacios**.
 *
 * La lección de T-4 que volvió a morder en T-8: un token con guiones no
 * sirve como contenido hostil, porque el guion ya es un punto de corte y el
 * navegador lo parte solo. Este es lo que sale de pegar un acuse de un
 * portal público dentro de un pendiente, y vive en el bloque de arriba —que
 * T-9 estrena— para que el criterio de §9 mida contenido de verdad.
 */
const PENDIENTE_LARGO =
  "Falta acuse SNM2026APOSTILLAMATRIMONIO0000771249PAREV7CONSULTAWEBPORTAL";

/**
 * El pendiente que **nació en una etapa ya cumplida** y sigue abierto con el
 * proceso dos pasos más adelante. Es la propiedad 2 de T-9 vista desde la
 * pantalla: nadie lo copió y sigue diciendo dónde apareció.
 */
const PENDIENTE_VENCIDO = {
  id: "pend1",
  procesoEtapaId: "e1",
  procesoEtapaNombre: CUMPLIDA_1,
  texto: PENDIENTE_LARGO,
  autorId: ITZEL.id,
  autorNombre: ITZEL.nombre,
  responsableId: null,
  responsableNombre: null,
  creadoEn: "2026-09-02T15:00:00.000Z",
  // Fija y muy anterior: el criterio no puede depender de cuándo corra la
  // suite.
  venceEn: "2020-01-01",
  cerradoEn: null,
  cerradoPor: null,
  cerradoPorNombre: null,
};

const PENDIENTE_CON_DUENO = {
  ...PENDIENTE_VENCIDO,
  id: "pend2",
  procesoEtapaId: "e3",
  procesoEtapaNombre: PENDIENTE_1,
  texto: "Falta la verificación domiciliaria del Servicio Nacional.",
  responsableId: RICARDO.id,
  responsableNombre: RICARDO.nombre,
  venceEn: "2099-12-31",
};

const PENDIENTE_CERRADO = {
  ...PENDIENTE_VENCIDO,
  id: "pend3",
  texto: "Faltaba el pago de la tasa migratoria.",
  venceEn: null,
  cerradoEn: "2026-09-20T15:00:00.000Z",
  cerradoPor: RICARDO.id,
  cerradoPorNombre: RICARDO.nombre,
};

const PENDIENTES = {
  pendientes: [PENDIENTE_VENCIDO, PENDIENTE_CON_DUENO, PENDIENTE_CERRADO],
};

/** Lo que el servidor contesta al cerrar: la lista entera, ya recontada. */
const PENDIENTES_TRAS_CERRAR = {
  pendientes: [
    PENDIENTE_CON_DUENO,
    {
      ...PENDIENTE_VENCIDO,
      cerradoEn: "2026-10-22T15:00:00.000Z",
      cerradoPor: ITZEL.id,
      cerradoPorNombre: ITZEL.nombre,
    },
    PENDIENTE_CERRADO,
  ],
};

/**
 * La bitácora del proceso (T-10).
 *
 * El banco tiene que ser **hostil**, que es la lección de T-4: una regla
 * defensiva solo está probada si el contenido la fuerza a actuar. El
 * `detalle` del primer hecho es el título entero del proceso —largo y
 * entrecomillado—, y el del último es un pendiente recortado a su tope, que
 * es lo más ancho que esta lista puede llegar a dibujar. Sin eso, la
 * comprobación de que no hay scroll horizontal a 320px no mediría nada.
 */
const BITACORA = {
  entradas: [
    {
      id: "h1",
      entidad: "proceso",
      entidadId: PROCESO_ID,
      accion: "creado",
      usuarioId: ITZEL.id,
      usuarioNombre: ITZEL.nombre,
      ocurridoEn: "2026-08-15T15:00:00.000Z",
      detalle: PROCESO.titulo,
    },
    {
      id: "h2",
      entidad: "proceso",
      entidadId: PROCESO_ID,
      accion: "etapa_alcanzada",
      usuarioId: ITZEL.id,
      usuarioNombre: ITZEL.nombre,
      ocurridoEn: "2026-09-01T15:00:00.000Z",
      detalle: CUMPLIDA_1,
    },
    {
      id: "h3",
      entidad: "proceso",
      entidadId: PROCESO_ID,
      accion: "nota_agregada",
      usuarioId: RICARDO.id,
      usuarioNombre: RICARDO.nombre,
      ocurridoEn: "2026-09-18T15:30:00.000Z",
      detalle: CUMPLIDA_2,
    },
    {
      id: "h4",
      entidad: "proceso",
      entidadId: PROCESO_ID,
      accion: "pendiente_abierto",
      usuarioId: RICARDO.id,
      usuarioNombre: RICARDO.nombre,
      ocurridoEn: "2026-10-02T13:00:00.000Z",
      detalle:
        "Falta el certificado de matrimonio apostillado por el Ministerio" +
        " de Relaciones…",
    },
  ],
};

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

      // T-8: la línea de tiempo. El `POST` contesta la línea entera con la
      // nota nueva adentro, que es lo que la pantalla asienta: no inserta la
      // nota donde cree que va.
      if (url.pathname === `/api/procesos/${PROCESO_ID}/notas`) {
        const escribe = ruta.request().method() === "POST";
        await ruta.fulfill({
          status: escribe ? 201 : 200,
          json: escribe ? LINEA_CON_LA_NUEVA : LINEA,
        });
        return;
      }

      // T-9: los pendientes. El `POST` de cerrar contesta la lista entera
      // recontada, que es lo que la pantalla asienta: no tacha la fila por
      // su cuenta.
      if (
        url.pathname.startsWith(`/api/procesos/${PROCESO_ID}/pendientes`)
      ) {
        const cierra = url.pathname.endsWith("/cerrar");
        await ruta.fulfill({
          status: 200,
          json: cierra ? PENDIENTES_TRAS_CERRAR : PENDIENTES,
        });
        return;
      }

      // T-14: cerrar y reabrir. Las dos contestan el detalle entero más
      // cuántos cabos sueltos quedan, que es lo que la pantalla asienta —
      // no redibuja el estado por su cuenta.
      if (url.pathname === `/api/procesos/${PROCESO_ID}/cerrar`) {
        await ruta.fulfill({
          status: 200,
          json: {
            proceso: PROCESO_TRAS_CERRAR,
            etapas: ETAPAS,
            pendientesAbiertos: 1,
          },
        });
        return;
      }

      if (url.pathname === `/api/procesos/${PROCESO_ID}/reabrir`) {
        await ruta.fulfill({
          status: 200,
          json: { proceso: PROCESO, etapas: ETAPAS, pendientesAbiertos: 1 },
        });
        return;
      }

      // T-10: la bitácora. Solo se lee; la pantalla nunca la escribe.
      if (url.pathname === `/api/procesos/${PROCESO_ID}/bitacora`) {
        await ruta.fulfill({ status: 200, json: BITACORA });
        return;
      }

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
          ? { procesos: [PROCESO, OTRO, TERMINADO] }
          : url.pathname === `/api/procesos/${PROCESO_ID}`
            ? DETALLE
            : url.pathname === "/api/areas"
              ? { areas: AREAS }
              : url.pathname === "/api/usuarios"
                ? { usuarios: EQUIPO }
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

  // -------------------------------------------------------------------------
  // T-9 · Pendientes
  // -------------------------------------------------------------------------

  test("el bloque de pendientes abiertos va ARRIBA, contado y sin buscarlo", async ({
    page,
  }) => {
    await conProcesosCargados(page);
    await page.goto(DETALLE_URL);

    // La cuenta, que es lo que se lee de un vistazo: dos abiertos de los
    // tres que hay, y uno de ellos vencido.
    await expect(
      page.getByText("2 pendientes abiertos, 1 vencido."),
    ).toBeVisible();

    // Y arriba de verdad: antes de los datos del proceso y antes del plan.
    // Es la única parte del criterio que una prueba de datos no puede ver.
    const posicion = await page.evaluate(() => {
      const bloque = document.querySelector(".pendientes");
      const cumplido = document.querySelector("#etapas-cumplidas");
      if (bloque === null || cumplido === null) return "falta alguno";
      return (bloque.compareDocumentPosition(cumplido) &
        Node.DOCUMENT_POSITION_FOLLOWING) !==
        0
        ? "arriba"
        : "abajo";
    });
    expect(posicion).toBe("arriba");

    // Solo los abiertos en el bloque: el cerrado no compite por ese lugar.
    await expect(page.locator(".pendientes .pendiente")).toHaveCount(2);
  });

  test("un pendiente vencido se ve distinto, y lo DICE además de marcarlo", async ({
    page,
  }) => {
    await conProcesosCargados(page);
    await page.goto(DETALLE_URL);

    await expect(page.locator(".pendiente--vencido")).toHaveCount(1);
    // La marca visual acompaña una frase: un estado que solo existe como
    // color no existe para todo el mundo.
    await expect(page.locator(".pendiente--vencido")).toContainText(
      /Venció el/,
    );
    await expect(page.locator(".pendiente--vencido")).toContainText("2020");

    // Y el que vence dentro de mucho no está marcado.
    await expect(
      page.locator(".pendiente", { hasText: "verificación domiciliaria" }),
    ).not.toHaveClass(/pendiente--vencido/);
  });

  test("el autor y el responsable se ven distinto, y el sin dueño lo dice", async ({
    page,
  }) => {
    await conProcesosCargados(page);
    await page.goto(DETALLE_URL);

    const conDueno = page.locator(".pendiente", {
      hasText: "verificación domiciliaria",
    });

    // El responsable, destacado: es quien tiene que hacer algo.
    await expect(conDueno.locator(".etiqueta")).toHaveText(
      "Responsable: Ricardo",
    );
    // El autor, apagado y aparte: es contexto, no una tarea.
    await expect(conDueno.locator(".pendiente__firma")).toContainText(
      "Anotado por Itzel",
    );

    // Y el que no tiene dueño no deja el hueco en blanco.
    await expect(
      page.locator(".pendiente--vencido .etiqueta"),
    ).toHaveText("Sin responsable asignado");
  });

  test("un pendiente dice dónde NACIÓ, aunque el proceso ya esté más adelante", async ({
    page,
  }) => {
    // La propiedad 2 vista desde la pantalla: el proceso está en la tercera
    // etapa y este pendiente, abierto, sigue colgando de la primera. Nadie
    // lo copió ni lo movió.
    await conProcesosCargados(page);
    await page.goto(DETALLE_URL);

    await expect(page.locator(".pendiente--vencido")).toContainText(
      `nació en «${CUMPLIDA_1}»`,
    );
  });

  test("cerrar redibuja con lo que contestó el servidor", async ({ page }) => {
    await conProcesosCargados(page);
    await page.goto(DETALLE_URL);

    await page.locator(".pendiente--vencido").getByRole("button", {
      name: "Cerrar",
    }).click();

    // La respuesta trae la lista recontada: queda uno abierto y dos
    // cerrados, y el contador lo dice sin pedir nada más.
    await expect(page.getByText("1 pendiente abierto.")).toBeVisible();
    await expect(page.locator(".pendientes .pendiente")).toHaveCount(1);
    await expect(page.locator(".pendiente--cerrado")).toHaveCount(2);
  });

  test("no hay forma de reabrir ni de editar un pendiente desde la pantalla", async ({
    page,
  }) => {
    await conProcesosCargados(page);
    await page.goto(DETALLE_URL);

    await expect(page.getByRole("button", { name: /Reabrir/i })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("button", { name: /Editar pendiente|Borrar pendiente/i }),
    ).toHaveCount(0);

    // Un pendiente ya cerrado no ofrece ni siquiera el botón de cerrar.
    await expect(
      page.locator(".pendiente--cerrado").getByRole("button"),
    ).toHaveCount(0);

    // Y el aviso está antes de apretar, no después.
    await expect(page.getByText(/no se reabre/i)).toBeVisible();
  });

  test("el desplegable de responsable ofrece al equipo, y nombra el «sin dueño»", async ({
    page,
  }) => {
    await conProcesosCargados(page);
    await page.goto(DETALLE_URL);

    await expect(
      page.locator("#campo-responsable-pendiente option"),
    ).toHaveText(["Sin responsable asignado", "Itzel", "Ricardo"]);
  });

  test("un pendiente vacío no se manda: lo dice el navegador antes de ir", async ({
    page,
  }) => {
    await conProcesosCargados(page);
    await page.goto(DETALLE_URL);

    await page.getByRole("button", { name: "Anotar pendiente" }).click();

    await expect(page.getByText(/Sin texto no hay nada que guardar/i)).toBeVisible();
    // Y nada cambió arriba.
    await expect(page.locator(".pendientes .pendiente")).toHaveCount(2);
  });

  // -------------------------------------------------------------------------
  // T-8 · Notas y línea de tiempo
  // -------------------------------------------------------------------------

  test("la línea de tiempo agrupa las notas por etapa, en el orden del plan", async ({
    page,
  }) => {
    await conProcesosCargados(page);
    await page.goto(DETALLE_URL);

    await expect(
      page.getByRole("heading", { name: "Línea de tiempo" }),
    ).toBeVisible();

    // Los tramos, en el orden del plan y no en el de inserción.
    await expect(page.locator(".linea__etapa")).toHaveText([
      new RegExp(CUMPLIDA_1),
      new RegExp(PENDIENTE_1),
    ]);

    // Solo las etapas con notas: la línea no es una segunda copia del plan.
    await expect(page.locator(".linea__tramo")).toHaveCount(2);

    // Y las notas, bajo la etapa que les toca.
    await expect(
      page.locator(".linea__tramo").first().locator(".nota__texto"),
    ).toHaveText([NOTA_PAGO, NOTA_ENTREGA]);
  });

  test("cada nota lleva su firma: quién la escribió y cuándo", async ({
    page,
  }) => {
    await conProcesosCargados(page);
    await page.goto(DETALLE_URL);

    // Dos autores distintos en la misma etapa: la autoría es por nota, no
    // por proceso.
    await expect(page.locator(".nota__firma").first()).toContainText("Itzel");
    await expect(page.locator(".nota__firma").nth(1)).toContainText("Ricardo");

    // Y el resumen, que es lo que se lee antes de leer la línea.
    await expect(
      page.getByText("3 notas, repartidas en 2 etapas."),
    ).toBeVisible();
  });

  test("no hay forma de editar ni de borrar una nota desde la pantalla", async ({
    page,
  }) => {
    await conProcesosCargados(page);
    await page.goto(DETALLE_URL);

    // La inmutabilidad, vista desde afuera: los botones no existen.
    await expect(
      page.locator(".nota").getByRole("button"),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /Borrar nota|Editar nota/i }),
    ).toHaveCount(0);

    // Y se dice ANTES de escribir, no después.
    await expect(page.getByText(/no se edita ni se borra/i)).toBeVisible();
  });

  test("el desplegable de etapa arranca en la vigente y ofrece el plan entero", async ({
    page,
  }) => {
    await conProcesosCargados(page);
    await page.goto(DETALLE_URL);

    const etapa = page.getByLabel("Etapa en la que pasó");

    // La opción por defecto no es «ninguna»: es la vigente, nombrada.
    await expect(etapa).toHaveValue("");
    await expect(etapa.locator("option").first()).toHaveText(
      new RegExp(`Donde está el proceso hoy.*${PENDIENTE_1}`),
    );

    // Las cuatro etapas se ofrecen, cumplidas incluidas: una nota se escribe
    // a veces días después del hecho.
    await expect(etapa.locator("option")).toHaveCount(ETAPAS.length + 1);
    await expect(etapa.locator("option").nth(1)).toHaveText(
      `1. ${CUMPLIDA_1} · cumplida`,
    );
    await expect(etapa.locator("option").nth(3)).toHaveText(
      `3. ${PENDIENTE_1} · etapa vigente`,
    );
  });

  test("anotar redibuja la línea con lo que contestó el servidor", async ({
    page,
  }) => {
    await conProcesosCargados(page);
    await page.goto(DETALLE_URL);

    await page.getByLabel("Qué pasó").fill(NOTA_NUEVA);
    await page
      .getByRole("button", { name: "Anotar", exact: true })
      .click();

    await expect(page.getByText(NOTA_NUEVA)).toBeVisible();
    await expect(page.locator(".nota")).toHaveCount(4);

    // El campo queda vacío para la próxima, y solo porque se guardó.
    await expect(page.getByLabel("Qué pasó")).toHaveValue("");
  });

  test("una nota vacía no se manda: lo dice el navegador antes de ir", async ({
    page,
  }) => {
    await conProcesosCargados(page);
    await page.goto(DETALLE_URL);

    await page
      .getByRole("button", { name: "Anotar", exact: true })
      .click();

    await expect(page.getByText(/Sin texto no hay nada que guardar/i)).toBeVisible();
    await expect(page.locator(".nota")).toHaveCount(3);
  });

  /* ---------------------------------------------------------------------
     T-10 · La bitácora
     --------------------------------------------------------------------- */

  test("la bitácora cuenta la historia del proceso en frases, en orden", async ({
    page,
  }) => {
    await conProcesosCargados(page);
    await page.goto(DETALLE_URL);

    const hechos = page.locator(".bitacora__frase");
    await expect(hechos).toHaveCount(BITACORA.entradas.length);

    // La frase exacta que pidió el usuario: quién, qué y sobre qué.
    await expect(hechos.nth(1)).toHaveText(`Itzel avanzó a «${CUMPLIDA_1}».`);

    // Y el orden es el del servidor: del hecho más viejo al más nuevo.
    await expect(hechos.first()).toContainText("dio de alta");
    await expect(hechos.last()).toContainText("abrió el pendiente");
  });

  test("la bitácora dice que no hubo relleno retroactivo", async ({ page }) => {
    // Una lista que arranca el martes pasado se lee como la historia
    // completa si nadie dice que no lo es.
    await conProcesosCargados(page);
    await page.goto(DETALLE_URL);

    await expect(
      page.getByText(/lo que pasó antes no está acá/i),
    ).toBeVisible();
  });

  test("no hay forma de escribir ni de borrar un hecho desde la pantalla", async ({
    page,
  }) => {
    await conProcesosCargados(page);
    await page.goto(DETALLE_URL);

    // La bitácora la escribe el sistema al hacer otra cosa. Que no haya un
    // solo control adentro del bloque es la mitad visible de esa regla; la
    // otra mitad son los dos disparadores de la migración.
    await expect(page.locator(".bitacora").getByRole("button")).toHaveCount(0);
    await expect(
      page.locator(".bitacora").getByRole("textbox"),
    ).toHaveCount(0);
  });

  test("avanzar de etapa vuelve a pedir la bitácora", async ({ page }) => {
    // Lo que la pantalla acaba de hacer es exactamente lo que la bitácora
    // tiene que mostrar: si no se recargara, el hecho recién ocurrido sería
    // el único que no se ve.
    await conProcesosCargados(page);
    await page.goto(DETALLE_URL);

    const pedidos: string[] = [];
    page.on("request", (peticion) => {
      const ruta = new URL(peticion.url()).pathname;
      if (ruta.endsWith("/bitacora")) pedidos.push(ruta);
    });

    await page
      .getByRole("button", { name: new RegExp(`Avanzar a .${PENDIENTE_1}`) })
      .click();

    await expect.poll(() => pedidos.length).toBeGreaterThan(0);
  });

  /* -------------------------------------------------------------------
     T-14 · Cerrar y reabrir un proceso
     ------------------------------------------------------------------- */

  test("el listado esconde los terminados por defecto, y lo dice", async ({
    page,
  }) => {
    await conProcesosCargados(page);
    await page.goto("/procesos");
    await page.locator("table tbody tr").first().waitFor();

    // Por defecto se ven los dos abiertos y no el terminado: eso es lo que
    // el bufete abre a mirar.
    await expect(page.locator("table tbody tr")).toHaveCount(2);
    await expect(
      page.getByRole("rowheader", { name: /Germán Arosemena/ }),
    ).toHaveCount(0);

    // Y se dice, que es la diferencia entre filtrar y esconder.
    await expect(
      page.getByText("Hay 1 proceso cerrado que no se está mostrando."),
    ).toBeVisible();
  });

  test("el filtro de estado deja ver los terminados cuando se los pide", async ({
    page,
  }) => {
    await conProcesosCargados(page);
    await page.goto("/procesos");
    await page.locator("table tbody tr").first().waitFor();

    await page.getByLabel("Estado").selectOption("cerrados");

    await expect(page.locator("table tbody tr")).toHaveCount(1);
    // El título va en un `th scope="row"`, así que su rol es `rowheader` y
    // no `cell`; y el nombre accesible arrastra la etiqueta «Cerrado el …»
    // que el listado le pega al lado, de ahí la expresión regular.
    await expect(
      page.getByRole("rowheader", { name: /Germán Arosemena/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("rowheader", { name: /Cerrado el/ }),
    ).toBeVisible();

    await page.getByLabel("Estado").selectOption("todos");
    await expect(page.locator("table tbody tr")).toHaveCount(3);
  });

  test("el detalle dice el estado y cierra el proceso", async ({ page }) => {
    await conProcesosCargados(page);
    await page.goto(DETALLE_URL);
    await page.locator(".plantilla__etapa .campo__control").first().waitFor();

    await expect(
      page.getByRole("definition").filter({ hasText: /^Abierto$/ }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Cerrar el proceso" }).click();

    // La pantalla asienta lo que el servidor contestó, incluido el número
    // de cabos sueltos que el cierre no discutió pero sí informó.
    await expect(
      page.getByRole("button", { name: "Reabrir el proceso" }),
    ).toBeVisible();
    await expect(page.getByText(/quedó cerrado con 1 pendiente/)).toBeVisible();
  });

  test("con el proceso cerrado, avanzar y guardar el plan quedan apagados y dicho por qué", async ({
    page,
  }) => {
    await conProcesosCargados(page);
    await page.goto(DETALLE_URL);
    await page.locator(".plantilla__etapa .campo__control").first().waitFor();

    await page.getByRole("button", { name: "Cerrar el proceso" }).click();
    await page
      .getByRole("button", { name: "Reabrir el proceso" })
      .waitFor();

    // Apagados, y no apagados en silencio: el aviso nombra las tres cosas
    // que no se pueden y las dos salidas que sí.
    await expect(
      page.getByRole("button", { name: new RegExp(`Avanzar a .${PENDIENTE_1}`) }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Guardar plan" }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Anotar pendiente" }),
    ).toBeDisabled();

    // Anotar una nota sigue habilitado: la historia no se congela.
    await expect(
      page.getByRole("button", { name: "Anotar", exact: true }),
    ).toBeEnabled();
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
      // La línea de tiempo llega en su propia petición, y es la que trae el
      // token largo sin espacios. Medir antes de que esté dibujada haría que
      // el criterio pasara sin haber visto el contenido hostil, que es la
      // vacuidad que T-4 descubrió en su propia rejilla.
      await page.locator(".nota__texto").last().waitFor();
      // Y los pendientes, que desde T-9 traen el otro token hostil y están
      // en el bloque de arriba. Medir antes de que estén dibujados sería la
      // misma vacuidad por segunda vez.
      await page.locator(".pendiente__texto").first().waitFor();

      const desborde = await medirDesborde(page);

      expect(
        desborde.scrollWidth,
        porQueSeSale(ancho, desborde),
      ).toBeLessThanOrEqual(desborde.clientWidth);
    });
  }
});
