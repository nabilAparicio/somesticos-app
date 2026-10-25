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

/* --- Los otros tres estados, y las dos copias (T-4 y T-5, unidad B) ----- */

const GANADA_ID = "9c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e62";
const PERDIDA_ID = "9c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e63";
/** Una que nació duplicando la emitida: es la que muestra la procedencia. */
const DUPLICADA_ID = "9c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e64";
/** La que devuelve `POST /duplicar` sobre el borrador. */
const COPIA_ID = "9c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e65";

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

/**
 * El borrador, ya emitido. Es lo que `POST /emitir` devuelve: **la misma
 * fila** —mismo identificador y mismo código— con el estado movido. Por eso
 * no entra en el listado: no es una cotización más, es la de siempre
 * después de congelarse.
 */
const BORRADOR_EMITIDO = cotizacion({ estado: "emitida" });

/**
 * Una ganada, con el contenido hostil de la emitida colgando.
 *
 * Es la que miden las nueve medidas de §9 sobre el ciclo de vida, y el
 * contenido hostil es lo que hace que midan algo: una ganada se dibuja en
 * modo lectura, así que la prosa cruda y el concepto crudo llegan al layout
 * sin un control que los contenga, y encima de eso se agrega la franja de
 * controles nueva. Con contenido corriente la medida sería la del detalle
 * pelado, que ya está medida en otro lado.
 */
const GANADA = cotizacion({
  id: GANADA_ID,
  codigo: "COT-2026-0009",
  estado: "ganada",
  clienteId: OTRO_CLIENTE_ID,
  clienteNombre: CLIENTES[1].nombre,
});

const PERDIDA = cotizacion({
  id: PERDIDA_ID,
  codigo: "COT-2026-0010",
  estado: "perdida",
});

/**
 * Nació duplicando la emitida. **Es un borrador**, que es lo único que
 * duplicar sabe parir, y eso es parte de lo que la prueba de procedencia
 * comprueba: una copia se puede editar aunque la de arriba esté congelada.
 */
const DUPLICADA = cotizacion({
  id: DUPLICADA_ID,
  codigo: "COT-2026-0011",
  estado: "borrador",
  duplicadaDeId: EMITIDA_ID,
});

/** La copia que nace al duplicar el borrador. */
const COPIA = cotizacion({
  id: COPIA_ID,
  codigo: "COT-2026-0012",
  estado: "borrador",
  duplicadaDeId: BORRADOR_ID,
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

/* --- Las líneas de importe (T-3, unidad B) ------------------------------ */

const LINEA_UNO = "8b1f0c11-1111-4111-8111-000000000001";
const LINEA_DOS = "8b1f0c11-2222-4222-8222-000000000002";
const LINEA_TRES = "8b1f0c11-3333-4333-8333-000000000003";

const TRAMITE_VISA = "5e2a0d11-1111-4111-8111-000000000001";
const TRAMITE_BAJA = "5e2a0d11-2222-4222-8222-000000000002";

const TIPOS_DE_PROCESO = [
  {
    id: TRAMITE_VISA,
    areaId: "5e2a0d11-9999-4999-8999-000000000009",
    areaNombre: "Migración",
    nombre: "Visa de trabajo",
    descripcion: null,
    activo: true,
  },
  {
    id: TRAMITE_BAJA,
    areaId: "5e2a0d11-9999-4999-8999-000000000009",
    areaNombre: "Migración",
    nombre: "Permiso que ya no se tramita",
    descripcion: null,
    activo: false,
  },
];

const CONCEPTO_UNO = "Gestión de la visa de trabajo";
const CONCEPTO_DOS = "Tasa del Servicio Nacional de Migración";
const CONCEPTO_TRES = "Revisión de antecedentes";

/**
 * Las dos familias **entrelazadas** en el `orden` global: honorario, gasto,
 * honorario. Entrelazadas a propósito, porque es lo único que distingue un
 * reordenamiento que respeta la familia de uno que intercambia con el vecino
 * del arreglo — con cada familia en bloque, los dos movimientos darían la
 * misma lista.
 */
const LINEAS_DEL_BORRADOR = [
  {
    id: LINEA_UNO,
    clase: "honorario",
    concepto: CONCEPTO_UNO,
    monto: 150_000,
    tipoProcesoId: TRAMITE_VISA,
    tipoProcesoNombre: "Visa de trabajo",
    orden: 0,
  },
  {
    id: LINEA_DOS,
    clase: "gasto_estimado",
    concepto: CONCEPTO_DOS,
    monto: 25_000,
    tipoProcesoId: null,
    tipoProcesoNombre: null,
    orden: 1,
  },
  {
    id: LINEA_TRES,
    clase: "honorario",
    concepto: CONCEPTO_TRES,
    monto: 80_000,
    tipoProcesoId: null,
    tipoProcesoNombre: null,
    orden: 2,
  },
];

/**
 * **Los totales del borrador no son la suma de sus líneas, y eso es el
 * punto.**
 *
 * Sumadas darían 230.000 de honorarios, 25.000 de gastos y 255.000 de total.
 * Estos números no se parecen a ninguno de los tres. Es la misma precaución
 * que `TEXTO_SEGUN_EL_SERVIDOR` toma con la prosa, aplicada al dinero: un
 * doble de servidor que devuelve lo que la pantalla podría calcular sola no
 * distingue una pantalla que muestra lo que llegó de una que suma por su
 * cuenta. Con estos, la que sume muestra otra cosa y muere.
 *
 * La aritmética de verdad vive en `totalesDe`, del lado del Worker, y está
 * probada en `test/lineas-api.spec.ts` contra una base real.
 */
const TOTALES_DEL_BORRADOR = {
  honorarios: 777_777,
  gastosEstimados: 111_111,
  total: 888_888,
};

/**
 * El concepto hostil de la emitida: un token pegado de cincuenta letras, sin
 * espacios ni guiones.
 *
 * Es el único contenido de la sección de líneas que llega al layout sin un
 * control que lo contenga, y vive dentro de una `Fila`. Sin él, las nueve
 * medidas de §9 sobre el detalle de la emitida pasarían por encima de un
 * concepto corriente, que no puede empujar nada: medirían el detalle y no la
 * línea. Es la lección de T-4 y la de T-2 C2, por tercera vez.
 */
const CONCEPTO_HOSTIL =
  "Ref TRAMITACIONDEPERMISODERESIDENCIAPERMANENTEANTEMIGRACIONPANAMA.";

const LINEAS_DE_LA_EMITIDA = [
  {
    id: "8b1f0c11-4444-4444-8444-000000000004",
    clase: "honorario",
    concepto: CONCEPTO_HOSTIL,
    monto: 320_050,
    tipoProcesoId: TRAMITE_VISA,
    tipoProcesoNombre: "Visa de trabajo",
    orden: 0,
  },
];

/**
 * La emitida **no tiene ninguna línea de gasto**, y por eso sirve para la
 * otra mitad de la regla: su familia vacía no se dibuja, y el aviso de que
 * el total lleva una cifra aproximada adentro tampoco.
 */
const TOTALES_DE_LA_EMITIDA = {
  honorarios: 320_050,
  gastosEstimados: 0,
  total: 320_050,
};

const LINEAS_POR_COTIZACION: Record<
  string,
  { lineas: Record<string, unknown>[]; totales: Record<string, number> }
> = {
  [BORRADOR_ID]: {
    lineas: LINEAS_DEL_BORRADOR,
    totales: TOTALES_DEL_BORRADOR,
  },
  [EMITIDA_ID]: {
    lineas: LINEAS_DE_LA_EMITIDA,
    totales: TOTALES_DE_LA_EMITIDA,
  },
  // La ganada comparte el contenido hostil de la emitida: es la que miden
  // las nueve medidas del ciclo de vida, y sin contenido que pueda empujar
  // medirían el detalle pelado.
  [GANADA_ID]: {
    lineas: LINEAS_DE_LA_EMITIDA,
    totales: TOTALES_DE_LA_EMITIDA,
  },
  [BORRADOR_VIEJO_ID]: {
    lineas: [],
    totales: { honorarios: 0, gastosEstimados: 0, total: 0 },
  },
};

const MODULOS_POR_COTIZACION: Record<string, Record<string, unknown>[]> = {
  [BORRADOR_ID]: MODULOS_DEL_BORRADOR,
  [EMITIDA_ID]: MODULOS_DE_LA_EMITIDA,
  [GANADA_ID]: MODULOS_DE_LA_EMITIDA,
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

/**
 * Las del ciclo de vida, que **se abren por su dirección y no salen en el
 * listado**, y es deliberado.
 *
 * Las tres pruebas del listado —el conteo de filas, el orden y el filtro—
 * están escritas sobre esas tres cotizaciones exactas, y sumar seis más les
 * cambiaría lo que miden sin agregarles nada: ninguna de las pruebas del
 * ciclo de vida pasa por el listado. Dicho al revés: lo que este arreglo
 * separado protege es que una prueba de orden siga midiendo orden.
 */
const DEL_CICLO = [GANADA, PERDIDA, DUPLICADA, COPIA];

function cuerpoDe(pathname: string): Record<string, unknown> | null {
  if (/^\/api\/cotizaciones\/[^/]+\/bitacora$/.test(pathname)) return BITACORA;

  const deModulos = /^\/api\/cotizaciones\/([^/]+)\/modulos$/.exec(pathname);
  if (deModulos !== null) {
    return { modulos: MODULOS_POR_COTIZACION[deModulos[1]] ?? [] };
  }

  // El plan de pagos entra vacío. Estas pruebas hablan de módulos y de
  // líneas, no del plan — pero el detalle dibuja su sección igual, y una
  // sección que no pudo cargar se anuncia con `role="alert"`, como hace
  // `PanelDeGastos`. Sin esta rama el banco contestaría 404, aparecería una
  // segunda alerta en la página, y los seis `getByRole("alert")` sin acotar
  // que hay más abajo dejarían de resolver a un solo elemento.
  //
  // El arreglo va acá y no bajándole el `role` a la sección: una sección que
  // falló tiene que decirlo, y doblar el diseño para que entre en un banco de
  // pruebas es exactamente al revés.
  if (/^\/api\/cotizaciones\/[^/]+\/cuotas$/.test(pathname)) {
    return { cuotas: [], total: 0, base: 0 };
  }

  const deLineas = /^\/api\/cotizaciones\/([^/]+)\/lineas$/.exec(pathname);
  if (deLineas !== null) {
    return (
      LINEAS_POR_COTIZACION[deLineas[1]] ?? {
        lineas: [],
        totales: { honorarios: 0, gastosEstimados: 0, total: 0 },
      }
    );
  }

  // El catálogo de trámites, que el editor de líneas pide para su
  // desplegable. Es una lectura aparte y opcional: si fallara, las líneas se
  // dibujan igual.
  if (pathname === "/api/tipos-proceso") return { tipos: TIPOS_DE_PROCESO };

  if (pathname === "/api/cotizaciones") return { cotizaciones: COTIZACIONES };
  if (pathname === "/api/clientes") return { clientes: CLIENTES };

  // El detalle sirve las siete; el listado, sólo las tres de arriba. Ver
  // `DEL_CICLO`. `BORRADOR_EMITIDO` no está en ninguna de las dos listas:
  // comparte identificador con `BORRADOR`, así que por esta dirección se
  // lee el borrador, y la versión emitida la devuelve `POST /emitir` en la
  // prueba que la necesita.
  for (const cotizacion of [...COTIZACIONES, ...DEL_CICLO]) {
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

  test("el detalle de un borrador deja editarlo, emitirlo y duplicarlo", async ({
    page,
  }) => {
    await conCotizacionesCargadas(page);
    await page.goto(`/cotizaciones/${BORRADOR_ID}`);

    await expect(
      page.getByRole("heading", { name: "COT-2026-0007" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Editar" })).toBeVisible();

    /*
     * **Esta prueba cambió de contenido en T-5 sin cambiar de criterio.**
     * Prohibía los cuatro verbos porque ninguno existía todavía, ni en el
     * Worker. Lo que sigue vigente es lo de siempre: la pantalla no dibuja
     * lo que no hay. Lo que hay sobre un borrador son dos cosas, y están
     * en `accionesDe`.
     */
    await expect(
      page.getByRole("button", { name: "Emitir", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Duplicar", exact: true }),
    ).toBeVisible();
  });

  /* --- Las tres flechas, y ni una más (T-4 y T-5, unidad B) -------------- */

  /**
   * Qué controles del ciclo hay en cada estado, leídos **en el instante**.
   *
   * Es `.count()` y no `toHaveCount(0)`, y la diferencia es la lección que
   * esta tajada ya aprendió dos veces: una aserción que reintenta no puede
   * demostrar un «nunca». `toHaveCount(0)` tolera la ventana en que el
   * botón estuvo dibujado y después se fue, que es exactamente lo que acá
   * hay que prohibir — un «Marcar ganada» que parpadea sobre un borrador se
   * puede apretar.
   *
   * Y por eso se espera **primero** a que la pantalla esté dibujada: la
   * foto del instante tomada apenas vuelve el `goto` no mide la ausencia de
   * un botón, mide que React todavía no montó nada.
   */
  async function controlesDelCiclo(page: Page, id: string): Promise<string[]> {
    await page.goto(`/cotizaciones/${id}`);
    // La franja de controles vive en el encabezado, así que esperar al
    // encabezado es esperar a que el dibujo de esa franja ya haya ocurrido.
    await expect(page.locator("header h1")).toBeVisible();
    await expect(page.locator("header .boton").first()).toBeVisible();

    return page.locator("header button.boton").allInnerTexts();
  }

  test("un borrador se emite y se duplica, y no se gana ni se pierde", async ({
    page,
  }) => {
    await conCotizacionesCargadas(page);

    expect(await controlesDelCiclo(page, BORRADOR_ID)).toEqual([
      "Emitir",
      "Duplicar",
    ]);
  });

  test("una emitida se gana, se pierde y se duplica, y no se vuelve a emitir", async ({
    page,
  }) => {
    await conCotizacionesCargadas(page);

    expect(await controlesDelCiclo(page, EMITIDA_ID)).toEqual([
      "Marcar ganada",
      "Marcar perdida",
      "Duplicar",
    ]);
    // Y tampoco se edita: ése es el botón que `avisoDeNoEsBorrador` explica.
    expect(await page.getByRole("link", { name: "Editar" }).count()).toBe(0);
  });

  test("una ganada es el final: lo único que queda es duplicarla", async ({
    page,
  }) => {
    await conCotizacionesCargadas(page);

    expect(await controlesDelCiclo(page, GANADA_ID)).toEqual(["Duplicar"]);

    // Y el aviso nombra esa salida y ninguna otra: un texto que ofreciera
    // volver a ganarla mandaría a buscar un botón que no está.
    const aviso = page.getByText("ya no es un borrador");
    await expect(aviso).toContainText("duplicarla");
    await expect(aviso).not.toContainText("marcarla ganada");
  });

  test("una perdida tampoco se vuelve a ganar", async ({ page }) => {
    await conCotizacionesCargadas(page);

    expect(await controlesDelCiclo(page, PERDIDA_ID)).toEqual(["Duplicar"]);
  });

  /* --- Emitir es irreversible, y la pantalla lo dice antes --------------- */

  /**
   * Intercepta `POST /emitir` y devuelve el borrador ya emitido, anotando
   * cada llamada.
   *
   * El arreglo que devuelve es lo que permite afirmar un «todavía no se
   * mandó nada»: se lee con `.length`, que es una foto del instante, y
   * nunca con una aserción que reintente.
   */
  async function conLaEmisionInterceptada(page: Page): Promise<string[]> {
    const emisiones: string[] = [];

    // Registrada **después** de la de lectura y por eso gana: Playwright
    // atiende las rutas en orden inverso al de registro.
    await page.route(
      (url) => url.pathname === `/api/cotizaciones/${BORRADOR_ID}/emitir`,
      async (ruta) => {
        emisiones.push(ruta.request().method());
        await ruta.fulfill({ status: 200, json: { cotizacion: BORRADOR_EMITIDO } });
      },
    );

    return emisiones;
  }

  test("la confirmación dice qué pasa y nombra lo que se va a congelar", async ({
    page,
  }) => {
    await conCotizacionesCargadas(page);
    await page.goto(`/cotizaciones/${BORRADOR_ID}`);
    await page.getByRole("button", { name: "Emitir", exact: true }).click();

    const panel = page.getByRole("group", {
      name: "Emitir congela el documento",
    });
    await expect(panel).toBeVisible();

    // Qué cotización: con tres pestañas abiertas, una confirmación que no
    // nombra el código no dice cuál se está por congelar.
    await expect(panel).toContainText("COT-2026-0007");
    // Qué pasa, y sobre qué: los módulos y las líneas, que es justo lo que
    // la persona acaba de escribir.
    await expect(panel).toContainText("congela el documento");
    await expect(panel).toContainText("no se vuelve a editar");
    await expect(panel).toContainText("módulos de prosa");
    await expect(panel).toContainText("líneas de importe");

    // Y no pregunta si está seguro: informa. «¿Estás seguro?» no informa a
    // nadie, y una confirmación que no informa se aprieta sin leer.
    await expect(panel).not.toContainText("seguro");
    await expect(panel).not.toContainText("¿");
  });

  test("apretar «Emitir» no emite nada hasta que se confirma", async ({
    page,
  }) => {
    await conCotizacionesCargadas(page);
    const emisiones = await conLaEmisionInterceptada(page);

    await page.goto(`/cotizaciones/${BORRADOR_ID}`);
    await page.getByRole("button", { name: "Emitir", exact: true }).click();

    // La espera va primero y no es adorno: leer el arreglo apenas se
    // despacha el clic devuelve cero porque todavía no pasó nada, y la
    // prueba pasaría sin haber medido la confirmación.
    await expect(
      page.getByRole("button", { name: "Emitir y congelar" }),
    ).toBeVisible();

    // `.length` y no una aserción que reintente: lo que hay que demostrar
    // es un «nunca», y un `toHaveCount(0)` sobre los pedidos toleraría la
    // ventana en la que la emisión ya viajó.
    expect(
      emisiones.length,
      "la confirmación no puede haber emitido nada todavía",
    ).toBe(0);

    await page.getByRole("button", { name: "No emitir" }).click();
    await expect(
      page.getByRole("button", { name: "Emitir y congelar" }),
    ).toHaveCount(0);
    expect(emisiones.length, "«No emitir» no emite").toBe(0);

    // Y el borrador sigue siendo un borrador: el botón de editar no se fue.
    await expect(page.getByRole("link", { name: "Editar" })).toBeVisible();
  });

  test("confirmar emite, y lo que queda en pantalla ya no se edita", async ({
    page,
  }) => {
    await conCotizacionesCargadas(page);
    const emisiones = await conLaEmisionInterceptada(page);

    await page.goto(`/cotizaciones/${BORRADOR_ID}`);
    // Los módulos del borrador se editan: tres campos de texto. Es lo que
    // tiene que desaparecer, así que hay que verlo antes.
    await expect(page.locator(".modulo textarea")).toHaveCount(3);

    await page.getByRole("button", { name: "Emitir", exact: true }).click();
    await page.getByRole("button", { name: "Emitir y congelar" }).click();

    // El estado nuevo sale de la respuesta y no de una recarga: la primera
    // definición del detalle es «Estado».
    await expect(
      page.locator(".definiciones .definicion__valor").first(),
    ).toHaveText("Emitida");

    // Y los dos editores pasan a lectura **en el mismo dibujo**, sin volver
    // a pedir nada: `editable` sale del mismo estado que acaba de llegar.
    await expect(page.locator(".modulo textarea")).toHaveCount(0);
    await expect(
      page.getByText("Los módulos de esta cotización se pueden leer"),
    ).toBeVisible();
    await expect(
      page.getByText("Las líneas de esta cotización se pueden leer"),
    ).toBeVisible();

    // El panel se cerró, y los controles son los de una emitida.
    await expect(
      page.getByRole("button", { name: "Emitir y congelar" }),
    ).toHaveCount(0);
    expect(await page.locator("header button.boton").allInnerTexts()).toEqual([
      "Marcar ganada",
      "Marcar perdida",
      "Duplicar",
    ]);

    expect(emisiones).toEqual(["POST"]);
  });

  /* --- El 409 de ganar algo que ya no está emitido ----------------------- */

  test("si alguien ganó desde otra pestaña, lo dice sin hablar de borrar", async ({
    page,
  }) => {
    await conCotizacionesCargadas(page);

    /*
     * El servidor contesta el 409 del desenlace y, desde ahí, la lectura
     * devuelve la ganada: es exactamente lo que pasó del otro lado. La
     * pantalla tiene que decir qué falló **y** quedar mostrando la verdad,
     * porque reintentar contra lo que se ve volvería a fallar.
     */
    let yaGanada = false;

    await page.route(
      (url) => url.pathname.startsWith(`/api/cotizaciones/${EMITIDA_ID}`),
      async (ruta) => {
        const url = new URL(ruta.request().url());

        if (url.pathname.endsWith("/ganar")) {
          yaGanada = true;
          await ruta.fulfill({
            status: 409,
            json: { error: "cotizacion_no_es_emitida", estado: "ganada" },
          });
          return;
        }

        if (url.pathname === `/api/cotizaciones/${EMITIDA_ID}` && yaGanada) {
          await ruta.fulfill({
            status: 200,
            json: { cotizacion: { ...EMITIDA, estado: "ganada" } },
          });
          return;
        }

        await ruta.fallback();
      },
    );

    await page.goto(`/cotizaciones/${EMITIDA_ID}`);
    await page.getByRole("button", { name: "Marcar ganada" }).click();

    const alerta = page.getByRole("alert");
    await expect(alerta).toContainText("no está emitida");
    // El texto de reserva de `CONFLICTOS` habla de un borrado con
    // dependientes. Sin la entrada propia, acá se leería «no se pudo
    // borrar», que es un borrado que nadie pidió.
    await expect(alerta).not.toContainText("no se pudo borrar");

    // Y la pantalla queda mostrando en qué quedó de verdad: ya no ofrece
    // los dos desenlaces, porque ganada es el final.
    await expect(
      page.locator(".definiciones .definicion__valor").first(),
    ).toHaveText("Ganada");
    expect(await page.locator("header button.boton").allInnerTexts()).toEqual([
      "Duplicar",
    ]);
  });

  /* --- Duplicar, y la cadena ------------------------------------------- */

  test("duplicar abre la copia, que nace en borrador", async ({ page }) => {
    await conCotizacionesCargadas(page);

    await page.route(
      (url) => url.pathname === `/api/cotizaciones/${GANADA_ID}/duplicar`,
      async (ruta) => {
        await ruta.fulfill({
          status: 201,
          headers: { location: `/api/cotizaciones/${COPIA_ID}` },
          json: { cotizacion: { ...COPIA, duplicadaDeId: GANADA_ID } },
        });
      },
    );

    await page.goto(`/cotizaciones/${GANADA_ID}`);
    await page.getByRole("button", { name: "Duplicar" }).click();

    // La copia se abre, y la que se duplicó no se movió: la pantalla
    // navega al identificador nuevo, que es el que trajo el cuerpo.
    await expect(
      page.getByRole("heading", { name: "COT-2026-0012" }),
    ).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(`/cotizaciones/${COPIA_ID}`);

    // Y es un borrador: se puede editar aunque la de arriba estuviera
    // cerrada. Es lo que vuelve soportable que ganada sea el final.
    await expect(page.getByRole("link", { name: "Editar" })).toBeVisible();
  });

  test("una cotización duplicada dice de dónde salió, con enlace", async ({
    page,
  }) => {
    await conCotizacionesCargadas(page);
    await page.goto(`/cotizaciones/${DUPLICADA_ID}`);

    // El código de la de arriba no viaja con la cotización: sale de una
    // lectura aparte, igual que la bitácora. Hasta que llega, la frase dice
    // lo que sí se sabe, y no inventa un código.
    await expect(page.getByText("Nació duplicando «COT-2026-0008»")).toBeVisible();

    const enlace = page.getByRole("link", { name: "Ver de dónde salió" });
    await expect(enlace).toHaveAttribute(
      "href",
      `/cotizaciones/${EMITIDA_ID}`,
    );

    // Y se sube un salto. La cadena entera se recorre así, de a un clic:
    // es un bosque y siempre llega a una raíz (M-2 de `0007`).
    await enlace.click();
    await expect(
      page.getByRole("heading", { name: "COT-2026-0008" }),
    ).toBeVisible();
    // La emitida no nació duplicando nada, así que ahí la cadena termina.
    expect(
      await page.getByRole("link", { name: "Ver de dónde salió" }).count(),
    ).toBe(0);
  });

  test("una cotización que no nació duplicando no dice nada de procedencia", async ({
    page,
  }) => {
    await conCotizacionesCargadas(page);
    await page.goto(`/cotizaciones/${BORRADOR_ID}`);
    await expect(page.getByRole("link", { name: "Editar" })).toBeVisible();

    expect(
      await page.getByText("duplicando").count(),
      "sin procedencia no se dibuja la frase, ni vacía ni con un hueco",
    ).toBe(0);
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

    // Nada de controles apagados: el aviso ocupa su lugar. El texto se
    // nombra entero porque desde T-3 B hay dos avisos de congelado en esta
    // página —uno por editor— y «se pueden leer pero no cambiar» los
    // encuentra a los dos.
    await expect(
      page.getByText("Los módulos de esta cotización se pueden leer"),
    ).toBeVisible();
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

    /*
     * **Esta expectativa estaba rota desde `cde7871`, y no por T-3 B.** El
     * motivo `orden_incompleto` lo comparten los módulos de prosa y las
     * líneas, así que T-3 A le sacó el «de los módulos» a la frase de
     * `src/mensajes.ts` —no puede nombrar a uno de los dos— y no corrigió
     * esta prueba, que seguía afirmando el texto viejo. Se arregla acá
     * porque es el archivo donde vive el defecto.
     */
    await expect(page.getByRole("alert")).toContainText(
      "La lista no coincide con lo que tiene esta cotización",
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

  /* --- El editor de líneas de importe (T-3, unidad B) -------------------- */

  /** La dirección de la colección, que casi todas estas pruebas interceptan. */
  function coleccionDeLineas(url: URL): boolean {
    return url.pathname === `/api/cotizaciones/${BORRADOR_ID}/lineas`;
  }

  test("las dos familias se muestran separadas, cada una con su subtotal", async ({
    page,
  }) => {
    await conCotizacionesCargadas(page);
    await page.goto(`/cotizaciones/${BORRADOR_ID}`);

    // La espera va primero: `toHaveText` reintenta, pero sólo después de que
    // el elemento exista, y leer apenas vuelve el `goto` mide lo que React
    // alcanzó a montar.
    const renglones = page.locator(".renglon");
    await expect(renglones).toHaveCount(3);

    await expect(
      page.getByRole("heading", { name: "Honorarios" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Gastos estimados" }),
    ).toBeVisible();

    /*
     * Lo que de verdad separa las familias no es que haya dos encabezados
     * sino **cuál línea quedó debajo de cuál**. Las tres vienen entrelazadas
     * en el orden global —honorario, gasto, honorario—, así que una pantalla
     * que las dibujara en una sola lista daría otro orden que éste.
     */
    const honorarios = page
      .locator(".familia", { has: page.getByRole("heading", { name: "Honorarios" }) })
      .locator(".renglon__concepto, .campo--crecer input");
    await expect(honorarios).toHaveCount(2);
    await expect(honorarios.nth(0)).toHaveValue(CONCEPTO_UNO);
    await expect(honorarios.nth(1)).toHaveValue(CONCEPTO_TRES);
  });

  /**
   * **La barandilla de la tajada, medida en el navegador.**
   *
   * Los totales que el doble devuelve no son la suma de las líneas: sumadas
   * darían 2.300,00 / 250,00 / 2.550,00. Lo que tiene que estar en pantalla
   * son los números que llegaron, porque quien suma es el servidor. Una
   * pantalla que sumara por su cuenta muestra los otros tres y muere acá.
   */
  test("los subtotales y el total son los del servidor, no la suma de las líneas", async ({
    page,
  }) => {
    await conCotizacionesCargadas(page);
    await page.goto(`/cotizaciones/${BORRADOR_ID}`);

    const sumas = page.locator(".suma__importe");
    await expect(sumas).toHaveCount(3);

    // 777777, 111111 y 888888 centavos, escritos a mano y no derivados de
    // `montoLegible`, que es la función que los produce (restricción 6).
    await expect(sumas.nth(0)).toHaveText("USD 7,777.77");
    await expect(sumas.nth(1)).toHaveText("USD 1,111.11");
    await expect(sumas.nth(2)).toHaveText("USD 8,888.88");
  });

  /**
   * **El renglón del ITBMS, medido en el navegador** (T-12).
   *
   * Lo que se puede y lo que no se puede medir acá, dicho antes de medirlo:
   *
   * El **interruptor** del Worker no se puede mover desde una prueba de punta
   * a punta. `playwright.config.ts` levanta un solo servidor de Vite para
   * todas, así que `ITBMS_ACTIVO` vale lo mismo durante la corrida entera —y
   * por eso el par apagado/encendido del interruptor vive en
   * `test/impuesto-api.spec.ts`, que sí le pasa el entorno a `manejar`.
   *
   * Lo que **sí** se mide acá es la otra mitad, y es la que el navegador es
   * el único que puede contestar: dado un cuerpo que trae el impuesto y otro
   * que no, ¿la pantalla dibuja el renglón en un caso y no en el otro? Esa es
   * la regla de `renglonDelImpuesto` ejercida contra el DOM de verdad.
   *
   * Y va con su contrapeso, porque un «no dice ITBMS» solo pasaría con la
   * pantalla en blanco: en la mitad apagada se exige además que el bloque de
   * totales **sí** se haya dibujado, con sus tres cifras exactas.
   */
  test("el renglón del ITBMS sólo se dibuja cuando el cuerpo lo trae", async ({
    page,
  }) => {
    await conCotizacionesCargadas(page);
    await page.goto(`/cotizaciones/${BORRADOR_ID}`);

    /* --- Apagado: no hay renglón, y los otros tres sí están. --- */

    await expect(page.locator(".suma__importe")).toHaveCount(3);
    await expect(page.locator(".suma--total .suma__importe")).toHaveText(
      "USD 8,888.88",
    );
    await expect(
      page.locator(".suma--impuesto"),
      "la pantalla dibujó un ITBMS que el cuerpo no trae",
    ).toHaveCount(0);

    /* --- Encendido: el mismo borrador, con `itbms` en el cuerpo. ---

       Se vuelve a enrutar sólo esta dirección y se recarga. El cuerpo es el
       mismo de antes **más** la clave y con el total crecido en 54 444
       centavos, que es lo único que cambia entre las dos mitades. */
    await page.route(
      (url) => url.pathname === `/api/cotizaciones/${BORRADOR_ID}/lineas`,
      async (ruta) => {
        await ruta.fulfill({
          status: 200,
          json: {
            lineas: LINEAS_DEL_BORRADOR,
            totales: { ...TOTALES_DEL_BORRADOR, itbms: 54_444, total: 943_332 },
          },
        });
      },
    );
    await page.reload();

    await expect(page.locator(".suma--impuesto")).toHaveCount(1);
    // 54 444 centavos, escritos a mano.
    await expect(page.locator(".suma--impuesto .suma__importe")).toHaveText(
      "USD 544.44",
    );
    await expect(page.locator(".suma--total .suma__importe")).toHaveText(
      "USD 9,433.32",
    );
  });

  test("el subtotal del gasto se rotula como aproximado y el del honorario no", async ({
    page,
  }) => {
    await conCotizacionesCargadas(page);
    await page.goto(`/cotizaciones/${BORRADOR_ID}`);

    const rotulos = page.locator(".suma__rotulo");
    await expect(rotulos).toHaveCount(3);

    await expect(rotulos.nth(0)).toHaveText("Subtotal");
    await expect(rotulos.nth(1)).toHaveText("Subtotal aproximado");
    await expect(rotulos.nth(2)).toHaveText("Total");
  });

  test("el gasto estimado dice que es aproximado, y no en letra chica", async ({
    page,
  }) => {
    await conCotizacionesCargadas(page);
    await page.goto(`/cotizaciones/${BORRADOR_ID}`);

    const aviso = page.locator(".familia .aviso");
    await expect(aviso).toBeVisible();
    await expect(aviso).toContainText("aproximada y va a cambiar");

    /*
     * «Visible, no en letra chica» se mide y no se declara, y se mide
     * contra **la letra chica que esta pantalla ya tiene**: el
     * `.campo__ayuda` del campo de importe, que es `--texto-xs`. Sin esto,
     * mover el aviso a un `.campo__ayuda` o a un `.texto-apagado` lo
     * convertiría en la nota al pie que esta tarea prohíbe, y ninguna
     * aserción de texto lo notaría.
     *
     * **No se compara contra el cuerpo del documento, y está medido por
     * qué**: `.aviso` es `--texto-s` en todo el proyecto, 14px contra los
     * 16px del cuerpo. Exigirle a éste el tamaño del cuerpo sería pedirle
     * a un aviso algo que ningún otro aviso de la aplicación cumple, y la
     * forma de cumplirlo —una regla propia sólo para este— rompería la
     * uniformidad por una medida que no es la que importa. Lo que importa
     * es que esté en una caja destacada y por encima de la letra chica.
     *
     * Se espera a que el elemento exista antes de leer: `evaluate` es una
     * foto del instante y no reintenta.
     */
    const letraChica = page.locator(".campo__ayuda").first();
    await expect(letraChica).toBeVisible();

    const tamanios = {
      delAviso: await aviso.evaluate((nodo) =>
        Number.parseFloat(getComputedStyle(nodo).fontSize),
      ),
      deLaLetraChica: await letraChica.evaluate((nodo) =>
        Number.parseFloat(getComputedStyle(nodo).fontSize),
      ),
    };

    expect(tamanios.delAviso).toBeGreaterThan(tamanios.deLaLetraChica);
  });

  test("el total avisa que lleva una cifra aproximada adentro", async ({
    page,
  }) => {
    await conCotizacionesCargadas(page);
    await page.goto(`/cotizaciones/${BORRADOR_ID}`);

    await expect(page.locator(".suma--total")).toBeVisible();
    await expect(
      page.getByText("El total incluye los gastos estimados"),
    ).toBeVisible();
  });

  test("sin gastos, ni la familia vacía ni el aviso del total aparecen", async ({
    page,
  }) => {
    await conCotizacionesCargadas(page);
    await page.goto(`/cotizaciones/${EMITIDA_ID}`);

    await expect(page.locator(".renglon")).toHaveCount(1);

    await expect(
      page.getByRole("heading", { name: "Gastos estimados" }),
    ).toHaveCount(0);
    await expect(
      page.getByText("El total incluye los gastos estimados"),
    ).toHaveCount(0);
  });

  test("el desplegable ofrece las dos clases del catálogo y ninguna más", async ({
    page,
  }) => {
    await conCotizacionesCargadas(page);
    await page.goto(`/cotizaciones/${BORRADOR_ID}`);

    const clase = page.getByLabel("Clase", { exact: true });
    await expect(clase).toBeVisible();

    /*
     * Los dos rótulos están escritos a mano y **no** importados de
     * `worker/cotizaciones/lineas.ts`, que es de donde el desplegable los
     * saca: una expectativa calculada con la misma fuente que se prueba pasa
     * aunque las dos estén mal (restricción 6).
     */
    await expect(clase.locator("option")).toHaveText([
      "Elegir clase…",
      "Honorarios",
      "Gastos estimados",
    ]);
  });

  test("el desplegable de trámites no ofrece los dados de baja", async ({
    page,
  }) => {
    await conCotizacionesCargadas(page);
    await page.goto(`/cotizaciones/${BORRADOR_ID}`);

    /*
     * El nombre accesible del rótulo incluye su marca —«opcional»— porque
     * esa marca es parte del rótulo visible y no una decoración: el trámite
     * de verdad se puede dejar en blanco.
     */
    const tramite = page.getByLabel("Trámite opcional", { exact: true });
    await expect(tramite).toBeVisible();

    await expect(tramite.locator("option")).toHaveText([
      "Ninguno",
      "Visa de trabajo",
    ]);
  });

  test("agregar manda el importe en centavos enteros", async ({ page }) => {
    await conCotizacionesCargadas(page);

    let enviado: string | null = null;
    await page.route(coleccionDeLineas, async (ruta) => {
      if (ruta.request().method() !== "POST") {
        await ruta.fallback();
        return;
      }
      enviado = ruta.request().postData();
      await ruta.fulfill({
        status: 201,
        json: {
          lineas: LINEAS_DEL_BORRADOR,
          totales: TOTALES_DEL_BORRADOR,
        },
      });
    });

    await page.goto(`/cotizaciones/${BORRADOR_ID}`);
    await expect(page.locator(".renglon")).toHaveCount(3);

    await page.getByLabel("Concepto", { exact: true }).fill("  Apostilla  ");
    await page
      .getByLabel("Clase", { exact: true })
      .selectOption("gasto_estimado");
    // Con separador de miles y dos decimales: la conversión de la pantalla
    // es lo único que puede convertir esto en 123456 centavos.
    await page.getByLabel("Importe USD", { exact: true }).fill("1,234.56");
    await page
      .getByLabel("Trámite opcional", { exact: true })
      .selectOption(TRAMITE_VISA);

    await page.getByRole("button", { name: "Añadir la línea" }).click();

    await expect
      .poll(() => enviado, { message: "el alta no mandó nada" })
      .not.toBeNull();

    expect(JSON.parse(enviado ?? "null")).toEqual({
      clase: "gasto_estimado",
      concepto: "Apostilla",
      monto: 123_456,
      tipoProcesoId: TRAMITE_VISA,
    });
  });

  test("un importe con el centavo partido se avisa antes de mandar nada", async ({
    page,
  }) => {
    await conCotizacionesCargadas(page);

    let huboAlta = false;
    await page.route(coleccionDeLineas, async (ruta) => {
      if (ruta.request().method() === "POST") huboAlta = true;
      await ruta.fallback();
    });

    await page.goto(`/cotizaciones/${BORRADOR_ID}`);
    await expect(page.locator(".renglon")).toHaveCount(3);

    await page.getByLabel("Concepto", { exact: true }).fill("Apostilla");
    await page.getByLabel("Clase", { exact: true }).selectOption("honorario");
    await page.getByLabel("Importe USD", { exact: true }).fill("12.345");

    await page.getByRole("button", { name: "Añadir la línea" }).click();

    await expect(page.getByRole("alert")).toContainText(
      "sin centavos partidos",
    );

    /*
     * `.count()` y no `toHaveCount(0)` sobre el espía: lo que se afirma es
     * un **nunca**, y una aserción que reintenta tolera justamente la
     * ventana transitoria que se quiere prohibir. Acá se lee el instante
     * posterior a un punto de sincronización positivo —el aviso ya está en
     * pantalla—, que es cuando la petición ya habría salido.
     */
    expect(huboAlta, "no se manda un importe que ya se sabe inválido").toBe(
      false,
    );
  });

  test("subir un honorario saltea el gasto y manda la lista global entera", async ({
    page,
  }) => {
    await conCotizacionesCargadas(page);

    let enviado: string | null = null;
    await page.route(coleccionDeLineas, async (ruta) => {
      if (ruta.request().method() !== "PUT") {
        await ruta.fallback();
        return;
      }
      enviado = ruta.request().postData();
      await ruta.fulfill({
        status: 200,
        json: {
          lineas: [
            { ...LINEAS_DEL_BORRADOR[2], orden: 0 },
            LINEAS_DEL_BORRADOR[1],
            { ...LINEAS_DEL_BORRADOR[0], orden: 2 },
          ],
          totales: TOTALES_DEL_BORRADOR,
        },
      });
    });

    await page.goto(`/cotizaciones/${BORRADOR_ID}`);
    await expect(page.locator(".renglon")).toHaveCount(3);

    await page
      .getByRole("button", { name: "Subir la línea 2 de Honorarios" })
      .click();

    await expect
      .poll(() => enviado, { message: "no se mandó el reordenamiento" })
      .not.toBeNull();

    /*
     * El orden esperado está escrito a mano. Lo que demuestra es la regla
     * de familia: el segundo honorario se intercambia con el **primer
     * honorario**, saltándose el gasto que tiene encima. Un intercambio con
     * el vecino del arreglo habría mandado `[UNO, TRES, DOS]`, que mueve el
     * gasto de un botón que decía mover un honorario.
     */
    expect(JSON.parse(enviado ?? "null")).toEqual({
      orden: [LINEA_TRES, LINEA_DOS, LINEA_UNO],
    });
  });

  test("los bordes de cada familia no ofrecen moverse hacia afuera", async ({
    page,
  }) => {
    await conCotizacionesCargadas(page);
    await page.goto(`/cotizaciones/${BORRADOR_ID}`);
    await expect(page.locator(".renglon")).toHaveCount(3);

    await expect(
      page.getByRole("button", { name: "Subir la línea 1 de Honorarios" }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Bajar la línea 2 de Honorarios" }),
    ).toBeDisabled();

    /*
     * El gasto es el único de su familia, así que las dos flechas están
     * apagadas — **aunque en el orden global tenga una línea encima y otra
     * debajo**. Es el borde que una lista sola no tendría, y el que
     * distingue las dos implementaciones posibles del movimiento.
     */
    await expect(
      page.getByRole("button", {
        name: "Subir la línea 1 de Gastos estimados",
      }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", {
        name: "Bajar la línea 1 de Gastos estimados",
      }),
    ).toBeDisabled();

    // Y las que sí se pueden mover, se pueden: sin esto la prueba pasaría
    // con todos los botones apagados.
    await expect(
      page.getByRole("button", { name: "Subir la línea 2 de Honorarios" }),
    ).toBeEnabled();
  });

  test("editar una línea dibuja lo que devolvió el servidor", async ({
    page,
  }) => {
    await conCotizacionesCargadas(page);

    let enviado: string | null = null;
    await page.route(
      (url) =>
        url.pathname ===
        `/api/cotizaciones/${BORRADOR_ID}/lineas/${LINEA_UNO}`,
      async (ruta) => {
        enviado = ruta.request().postData();
        /*
         * La respuesta es **distinta de lo que se tecleó**, a propósito: si
         * repitiera lo enviado, una pantalla que redibuja lo que vino y una
         * que conserva lo que quedó en el campo se verían exactamente
         * igual. Es la misma precaución que `TEXTO_SEGUN_EL_SERVIDOR`.
         */
        await ruta.fulfill({
          status: 200,
          json: {
            lineas: [
              {
                ...LINEAS_DEL_BORRADOR[0],
                concepto: "Gestión, con el carné incluido",
                monto: 175_025,
              },
              LINEAS_DEL_BORRADOR[1],
              LINEAS_DEL_BORRADOR[2],
            ],
            totales: TOTALES_DEL_BORRADOR,
          },
        });
      },
    );

    await page.goto(`/cotizaciones/${BORRADOR_ID}`);
    await expect(page.locator(".renglon")).toHaveCount(3);

    const importe = page.getByLabel(
      "Importe de la línea 1 de Honorarios, en USD",
    );
    await importe.fill("1600");
    await page
      .getByRole("button", { name: "Guardar la línea 1 de Honorarios" })
      .click();

    await expect
      .poll(() => enviado, { message: "no se mandó la edición" })
      .not.toBeNull();

    expect(JSON.parse(enviado ?? "null")).toEqual({
      clase: "honorario",
      concepto: CONCEPTO_UNO,
      monto: 160_000,
      tipoProcesoId: TRAMITE_VISA,
    });

    // Y lo que queda en el campo son los 175025 centavos del servidor, no
    // los 160000 que se teclearon.
    await expect(importe).toHaveValue("1750.25");
    await expect(
      page.getByLabel("Concepto de la línea 1 de Honorarios"),
    ).toHaveValue("Gestión, con el carné incluido");
  });

  test("escribir el mismo importe de otra forma no ofrece guardar", async ({
    page,
  }) => {
    await conCotizacionesCargadas(page);
    await page.goto(`/cotizaciones/${BORRADOR_ID}`);
    await expect(page.locator(".renglon")).toHaveCount(3);

    const importe = page.getByLabel(
      "Importe de la línea 1 de Honorarios, en USD",
    );
    await expect(importe).toHaveValue("1500.00");

    // «1,500» son los mismos 150000 centavos, así que no hay nada que
    // guardar: el botón se compara en centavos y no en texto.
    await importe.fill("1,500");
    await expect(
      page.getByRole("button", { name: "Guardar la línea 1 de Honorarios" }),
    ).toHaveCount(0);

    // Y un centavo de diferencia sí lo enciende, para que la prueba no pase
    // con un botón que nunca aparece.
    await importe.fill("1500.01");
    await expect(
      page.getByRole("button", { name: "Guardar la línea 1 de Honorarios" }),
    ).toBeVisible();
  });

  test("quitar una línea la saca y deja los totales que mandó el servidor", async ({
    page,
  }) => {
    await conCotizacionesCargadas(page);

    let metodo: string | null = null;
    await page.route(
      (url) =>
        url.pathname ===
        `/api/cotizaciones/${BORRADOR_ID}/lineas/${LINEA_DOS}`,
      async (ruta) => {
        metodo = ruta.request().method();
        await ruta.fulfill({
          status: 200,
          json: {
            lineas: [LINEAS_DEL_BORRADOR[0], LINEAS_DEL_BORRADOR[2]],
            totales: { honorarios: 555_555, gastosEstimados: 0, total: 555_555 },
          },
        });
      },
    );

    await page.goto(`/cotizaciones/${BORRADOR_ID}`);
    await expect(page.locator(".renglon")).toHaveCount(3);

    await page
      .getByRole("button", { name: "Quitar la línea 1 de Gastos estimados" })
      .click();

    await expect(page.locator(".renglon")).toHaveCount(2);
    // 200 con la lista y los totales, no 204: un `pedirVacio` acá tiraría la
    // respuesta y dejaría el total viejo debajo de una lista nueva.
    expect(metodo).toBe("DELETE");

    const sumas = page.locator(".suma__importe");
    await expect(sumas.nth(2)).toHaveText("USD 5,555.55");
  });

  test("sobre lo que ya se emitió las líneas se leen y no se tocan", async ({
    page,
  }) => {
    await conCotizacionesCargadas(page);
    await page.goto(`/cotizaciones/${EMITIDA_ID}`);

    await expect(page.getByText(CONCEPTO_HOSTIL)).toBeVisible();
    // 320050 centavos, escritos a mano.
    await expect(page.locator(".renglon__importe")).toHaveText("3,200.50");
    // El trámite de la línea sigue a la vista: es lo que T-7 va a abrir.
    await expect(page.locator(".renglon__tramite")).toHaveText(
      "Visa de trabajo",
    );

    // Nada de controles apagados: el aviso ocupa su lugar.
    await expect(
      page.getByText("Las líneas de esta cotización se pueden leer"),
    ).toBeVisible();
    await expect(page.locator(".renglon input")).toHaveCount(0);
    await expect(page.locator(".renglon select")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /^Quitar la línea/ }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Añadir una línea" }),
    ).toHaveCount(0);
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

      // Y el concepto de la línea, que es el **otro** contenido crudo de
      // esta pantalla y el único que vive dentro de una `Fila`: ahí el
      // `break-word` heredado de `body` no alcanza, porque no achica el
      // tamaño mínimo-contenido del ítem flex. Sin esta espera, las nueve
      // medidas vuelven a ser las del detalle sin líneas.
      await expect(page.locator(".renglon__concepto")).toHaveCount(1);

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
    test(`a ${String(ancho)}px de ancho, sobre el editor de líneas`, async ({
      page,
    }) => {
      await conCotizacionesCargadas(page);
      await page.setViewportSize({ width: ancho, height: 900 });
      await page.goto(`/cotizaciones/${BORRADOR_ID}`);

      /*
       * Lo que esta medida cubre es **la fila de controles y la rejilla de
       * abajo**: el concepto conviviendo con las tres flechas en una `Fila`
       * que tiene que envolver sola en 320px, y los tres campos —clase,
       * importe y trámite— en una `Rejilla` que tiene que apilarse.
       *
       * Lo que **no** cubre, y conviene decirlo para que nadie le pida más
       * de lo que da: ninguno de esos controles puede empujar nada, porque
       * `.campo__control` ya los fija en `inline-size: 100%` con
       * `min-inline-size: 0`. El concepto crudo —el que sí podría empujar—
       * se dibuja sólo en el camino de lectura, y a ése lo miden las nueve
       * medidas sobre el detalle de la emitida.
       */
      await expect(page.locator(".renglon")).toHaveCount(3);

      const desborde = await medirDesborde(page);
      expect(
        desborde.scrollWidth,
        porQueSeSale(ancho, desborde),
      ).toBeLessThanOrEqual(desborde.clientWidth);
    });
  }

  for (const ancho of ANCHOS) {
    test(`a ${String(ancho)}px de ancho, sobre una ganada con su ciclo`, async ({
      page,
    }) => {
      await conCotizacionesCargadas(page);
      await page.setViewportSize({ width: ancho, height: 900 });
      await page.goto(`/cotizaciones/${GANADA_ID}`);

      /*
       * Lo que esta medida agrega a la del detalle de la emitida es **la
       * franja de controles del ciclo**, que es contenido nuevo de esta
       * unidad y vive en una `Fila` que tiene que envolver sola en 320px.
       *
       * La ganada lleva el contenido hostil de la emitida —la prosa cruda
       * con su token pegado de cincuenta letras y el concepto crudo dentro
       * de una `Fila`— porque sin él la medida sería la del detalle pelado:
       * es la lección de T-3 B, que una prueba de ancho sobre texto
       * corriente no mide contención.
       *
       * Esperar a que los tres estén dibujados no es adorno: sin eso se
       * mide una página a medio montar.
       */
      await expect(page.locator(".modulo__texto")).toHaveCount(2);
      await expect(page.locator(".renglon__concepto")).toHaveCount(1);
      await expect(page.locator("header button.boton")).toHaveCount(1);

      const desborde = await medirDesborde(page);
      expect(
        desborde.scrollWidth,
        porQueSeSale(ancho, desborde),
      ).toBeLessThanOrEqual(desborde.clientWidth);
    });
  }

  for (const ancho of ANCHOS) {
    test(`a ${String(ancho)}px de ancho, con la confirmación abierta`, async ({
      page,
    }) => {
      await conCotizacionesCargadas(page);
      await page.setViewportSize({ width: ancho, height: 900 });
      await page.goto(`/cotizaciones/${BORRADOR_ID}`);
      await page.getByRole("button", { name: "Emitir", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Emitir y congelar" }),
      ).toBeVisible();

      /*
       * Lo que esta medida cubre es **el panel de confirmación**: su cadena
       * de rellenos y bordes, y sus dos botones en una `Fila` que tiene que
       * envolver en 320px, encima de la franja de controles del encabezado.
       *
       * Lo que **no** cubre, y conviene decirlo para que nadie le pida más
       * de lo que da: el párrafo del panel no puede empujar nada, porque
       * todo lo que entra ahí es prosa con espacios más el código de la
       * cotización, que el servidor genera con la forma
       * `COT-<año>-<correlativo>`. No hay en ese bloque un solo token cuyo
       * largo dependa de lo que alguien escriba, así que no se le agregó
       * ninguna declaración de contención propia: habría sido la segunda
       * guarda del mismo hecho, y dos guardas del mismo hecho no son
       * verificables.
       */
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
