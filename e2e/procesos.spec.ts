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

/**
 * Las etapas, con el tipo escrito.
 *
 * Sin la anotación, TypeScript infiere `alcanzadaEn: string` para las dos
 * primeras y `null` para las dos últimas, y el banco de abajo —que marca
 * cumplida una pendiente cuando la pantalla avanza— deja de compilar contra
 * su propio arreglo.
 */
type EtapaEnLaBase = {
  id: string;
  nombre: string;
  orden: number;
  alcanzadaEn: string | null;
};

const ETAPAS: EtapaEnLaBase[] = [
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
  // T-15: abierto a mano. Se escribe `null` y no se omite — un campo que
  // falta llega `undefined`, y una pantalla que mirara `undefined` pasaría
  // la mitad de ausencia de estas pruebas sin haber decidido nada.
  cotizacionDeOrigen: null,
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

/* --- T-15 · el que nace de una cotización ganada ----------------------- */

const COTIZACION_ID = "9c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e62";
const CODIGO = "COT-2026-0001";

/**
 * Un cuarto proceso, éste nacido de una cotización.
 *
 * Es **uno solo entre cuatro**, y el reparto es la medición: con todas las
 * filas viniendo de una cotización, un distintivo cableado a aparecer
 * siempre pasaría igual. Lo que esta prueba tiene que poder ver es que la
 * fila directa de al lado **no** lo lleva.
 */
const DESDE_COTIZACION = {
  ...PROCESO,
  id: "7c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e63",
  clienteNombre: "Constructora del Istmo, S.A.",
  titulo: "Visa de trabajo para el personal de Constructora del Istmo",
  // Etapa propia, y no la de `PROCESO`: con las dos filas diciendo lo
  // mismo, el `getByRole("cell", …)` de la prueba del listado deja de
  // resolver a un solo elemento y falla por ambigüedad, no por el dato.
  etapaVigente: "Cita en el consulado",
  cotizacionDeOrigen: { id: COTIZACION_ID, codigo: CODIGO },
};

const DETALLE_DESDE_COTIZACION = {
  proceso: DESDE_COTIZACION,
  etapas: ETAPAS,
};

/** El mismo proceso de siempre, después de que alguien lo cierre. */
const PROCESO_TRAS_CERRAR = {
  ...PROCESO,
  estado: "cerrado",
  cerradoEn: CERRADO_EN,
};

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
/**
 * T-15 · alguien que ya no está en el bufete.
 *
 * Existe para que «válido no es lo mismo que seleccionable» se pueda
 * comprobar: un filtro que no deja afuera a nadie pasa igual estando roto.
 */
const MARIANA = {
  id: "u3",
  nombre: "Mariana",
  email: "mariana@bufete.test",
  activo: false,
};

const EQUIPO = [ITZEL, RICARDO, MARIANA];

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
  // Del más nuevo al más viejo, que es como contesta la API desde T-17. El
  // banco imita al servidor: un banco en el orden viejo haría pasar una
  // pantalla que en producción se ve al revés.
  entradas: [
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
      id: "h1",
      entidad: "proceso",
      entidadId: PROCESO_ID,
      accion: "creado",
      usuarioId: ITZEL.id,
      usuarioNombre: ITZEL.nombre,
      ocurridoEn: "2026-08-15T15:00:00.000Z",
      detalle: PROCESO.titulo,
    },
  ],
  total: 4,
};

/**
 * T-17 · una historia más larga que una página, para probar el control.
 *
 * Sesenta y cuatro hechos sobre el mismo proceso, ya en el orden en que el
 * servidor los manda: `HECHOS_LARGOS[0]` es el más nuevo. Con menos que el
 * tope por defecto no habría nada que probar — una página que entra entera
 * pasa igual sin paginación.
 */
const HECHOS_LARGOS = Array.from({ length: 64 }, (_sin_usar, i) => ({
  id: `l${String(i)}`,
  entidad: "proceso",
  entidadId: PROCESO_ID,
  accion: "etapa_alcanzada",
  usuarioId: ITZEL.id,
  usuarioNombre: ITZEL.nombre,
  ocurridoEn: new Date(
    Date.UTC(2026, 0, 1) - i * 86_400_000,
  ).toISOString(),
  detalle: `Paso ${String(64 - i)}`,
}));

const AREA_ID = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";

/**
 * T-15 · lo que el alta de un proceso necesita para dibujarse.
 *
 * Sin estos dos listados el formulario se va por su rama de error y lo que
 * se mediría sería un párrafo suelto, que es la vacuidad que T-4 descubrió.
 */
const CLIENTES = [
  {
    id: CLIENTE_ID,
    tipoClienteId: null,
    tipoClienteNombre: null,
    nombre: PROCESO.clienteNombre,
    documentoTipo: null,
    documentoNumero: null,
    representanteLegal: null,
    email: null,
    telefono: null,
    notas: null,
    creadoPor: ITZEL.id,
    creadoPorNombre: ITZEL.nombre,
    creadoEn: "2026-08-01T15:00:00.000Z",
  },
];

const TIPOS_PROCESO = [
  {
    id: TIPO_ID,
    areaId: AREA_ID,
    areaNombre: "Migración y naturalización",
    nombre: PROCESO.tipoProcesoNombre,
    descripcion: null,
    activo: true,
  },
];

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
  /*
   * T-2 · El plan que el banco guarda de verdad.
   *
   * Hasta T-1 ni `PUT /etapas` ni `POST /avanzar` estaban contestados: los
   * dos caían en el 404 del final, así que ninguna prueba podía mirar
   * **qué pasa después de guardar**. La secuencia que demuestra T-2
   * —reordenar, que «Avanzar» se niegue, guardar, y que entonces sí deje—
   * necesita que el banco recuerde, porque el conflicto es justamente
   * entre lo que la pantalla tiene y lo que el servidor guardó.
   *
   * Es por `page`, o sea por prueba: dos pruebas no se pisan el plan.
   */
  let enLaBase: EtapaEnLaBase[] = ETAPAS.map((etapa) => ({ ...etapa }));

  /** El detalle tal como lo contestaría el worker con ese plan. */
  function detalleEnLaBase() {
    const pendiente = enLaBase.find((etapa) => etapa.alcanzadaEn === null);

    return {
      proceso: {
        ...PROCESO,
        etapasCumplidas: enLaBase.filter((e) => e.alcanzadaEn !== null).length,
        etapasTotales: enLaBase.length,
        etapaVigente: pendiente?.nombre ?? null,
      },
      etapas: enLaBase,
    };
  }

  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    async (ruta) => {
      const url = new URL(ruta.request().url());

      /* T-7 · Guardar el plan reemplaza el plan entero, y el orden es la
         posición en el arreglo: eso es lo que hace que avanzar dependa de
         lo guardado y no de lo que hay en pantalla. Lo cumplido se conserva
         por `id`, porque `alcanzadaEn` no viaja en la petición. */
      if (url.pathname === `/api/procesos/${PROCESO_ID}/etapas`) {
        const cuerpo = ruta.request().postDataJSON() as {
          etapas: { id: string | null; nombre: string }[];
        };

        enLaBase = cuerpo.etapas.map((paso, orden) => ({
          id: paso.id ?? `nueva-${String(orden)}`,
          nombre: paso.nombre,
          orden,
          alcanzadaEn:
            enLaBase.find((vieja) => vieja.id === paso.id)?.alcanzadaEn ?? null,
        }));

        await ruta.fulfill({ status: 200, json: detalleEnLaBase() });
        return;
      }

      /* T-7 · Avanzar marca cumplida **la próxima pendiente del plan
         guardado**. Que el banco lo haga así es lo que deja medir el
         defecto que T-2 cierra: con el borrador reordenado y sin guardar,
         la etapa que se marcaría no es la que se está mirando. */
      if (url.pathname === `/api/procesos/${PROCESO_ID}/avanzar`) {
        const proxima = enLaBase.find((etapa) => etapa.alcanzadaEn === null);

        if (proxima === undefined) {
          await ruta.fulfill({
            status: 409,
            json: { error: "sin_etapas_pendientes" },
          });
          return;
        }

        enLaBase = enLaBase.map((etapa) =>
          etapa.id === proxima.id
            ? { ...etapa, alcanzadaEn: "2026-10-26T15:00:00.000Z" }
            : etapa,
        );

        await ruta.fulfill({ status: 200, json: detalleEnLaBase() });
        return;
      }

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
            etapas: enLaBase,
            pendientesAbiertos: 1,
          },
        });
        return;
      }

      if (url.pathname === `/api/procesos/${PROCESO_ID}/reabrir`) {
        await ruta.fulfill({
          status: 200,
          json: { proceso: PROCESO, etapas: enLaBase, pendientesAbiertos: 1 },
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
          ? { procesos: [PROCESO, OTRO, TERMINADO, DESDE_COTIZACION] }
          : url.pathname === `/api/procesos/${PROCESO_ID}`
            ? detalleEnLaBase()
            : url.pathname === `/api/procesos/${DESDE_COTIZACION.id}`
              ? DETALLE_DESDE_COTIZACION
            : url.pathname === "/api/areas"
              ? { areas: AREAS }
              : url.pathname === "/api/usuarios"
                ? { usuarios: EQUIPO }
                : url.pathname === "/api/clientes"
                  ? { clientes: CLIENTES }
                  : url.pathname === "/api/tipos-proceso"
                    ? { tipos: TIPOS_PROCESO }
                    : null;

      if (cuerpo === null) {
        await ruta.fulfill({ status: 404, json: { error: "not_found" } });
        return;
      }
      await ruta.fulfill({ status: 200, json: cuerpo });
    },
  );
}

/**
 * Las cuatro direcciones del detalle.
 *
 * El detalle dejó de ser una página y pasó a ser cuatro, cada una con su
 * dirección: la pestaña vive en la URL y no en estado local, así que se
 * puede abrir en frío, compartir y volver con el botón de atrás.
 * «Trabajo» es la de por defecto y por eso no lleva segmento — y
 * `/procesos/{id}/trabajo`, que sería la segunda dirección de la misma
 * pantalla, no existe.
 *
 * Las pruebas que antes entraban al detalle y buscaban una sección que hoy
 * vive en otra pestaña **cambiaron de camino, no se borraron**.
 */
const DETALLE_URL = `/procesos/${PROCESO_ID}`;
const PENDIENTES_URL = `${DETALLE_URL}/pendientes`;
const DINERO_URL = `${DETALLE_URL}/dinero`;
const HISTORIAL_URL = `${DETALLE_URL}/historial`;

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

    // Tres y no dos desde T-15: el banco sirve cuatro procesos y el filtro
    // arranca en «abiertos», así que queda afuera el cerrado y entra el que
    // nace de una cotización.
    const filas = await page.locator("table tbody tr").count();
    expect(filas, "el listado tiene que traer filas").toBe(3);
  });

  /**
   * **T-2 · Una sola lista, que es el cambio que el usuario pidió.**
   *
   * Hasta T-1 las mismas filas de `proceso_etapa` se dibujaban tres veces
   * —«Cumplido», «Lo que falta» y «Plan de trabajo»—, y eso es lo que
   * hacía de la pantalla «una gran lista grande» donde cuesta ver y
   * configurar. Esta prueba mide las dos mitades del cambio: que la lista
   * sea **una**, y que no se haya perdido nada al fundirlas.
   */
  test("el plan es UNA lista en orden, con el estado de cada paso al lado", async ({
    page,
  }) => {
    await conProcesosCargados(page);
    await page.goto(DETALLE_URL);

    await expect(
      page.getByRole("heading", { name: "Plan de trabajo", exact: true }),
    ).toBeVisible();

    // Los cuatro pasos, cumplidos y pendientes, en el orden del plan y en
    // una sola lista. Es lo contrario de lo que había: ni dos listas, ni
    // los cumplidos separados de los que faltan.
    await expect(await planDibujado(page)).toEqual([
      CUMPLIDA_1,
      CUMPLIDA_2,
      PENDIENTE_1,
      PENDIENTE_2,
    ]);
    expect(
      await page.locator(".plantilla").count(),
      "las tres listas de antes son una sola",
    ).toBe(1);

    // Y los encabezados de las dos secciones que se fundieron ya no están.
    // `.count()` y no `toHaveCount(0)`: el segundo reintenta, así que no
    // puede probar un «nunca» — y acá ya está comprobado que la pantalla
    // está dibujada.
    for (const ido of ["Cumplido", "Lo que falta"]) {
      expect(
        await page.getByRole("heading", { name: ido, exact: true }).count(),
        `«${ido}» era una sección propia y dejó de serlo`,
      ).toBe(0);
    }

    // Lo cumplido se distingue **sin depender del color**: lleva su rótulo
    // con la fecha, que es información y no decoración, y no ofrece los
    // gestos que sobre el registro no se permiten.
    const cumplidos = page.locator(".plantilla__etapa--cumplida");
    await expect(cumplidos).toHaveCount(2);
    await expect(cumplidos.locator(".etiqueta")).toHaveText([
      /^Cumplida el .*2026/,
      /^Cumplida el .*2026/,
    ]);
  });

  test("el botón de avanzar nombra la próxima etapa y avisa que no se deshace", async ({
    page,
  }) => {
    await conProcesosCargados(page);
    await page.goto(DETALLE_URL);

    await expect(
      page.getByRole("button", { name: `Avanzar a «${PENDIENTE_1}»` }),
    ).toBeEnabled();

    // El aviso se busca **dentro de la sección donde está el botón**, y no
    // en la página entera. Suelto, era una prueba de que la frase existe en
    // algún lado: habría pasado con la advertencia al final de todo, que es
    // donde nadie la lee justo antes de apretar. Y con el detalle partido
    // en pestañas, también habría pasado con el botón en una pestaña y el
    // aviso en otra.
    //
    // La región cambió de nombre con T-2 —«Lo que falta» se fundió en «Plan
    // de trabajo»—, así que el ancla se mudó con el botón. Lo que no se
    // aflojó es la exigencia: sigue siendo una región y no la página.
    await expect(
      page
        .getByRole("region", { name: "Plan de trabajo", exact: true })
        .getByText(/No se puede deshacer/i),
    ).toBeVisible();
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

    // `expect.poll` y no `await planDibujado(page)` suelto, que es lo que
    // había: `evaluateAll` **no reintenta**, así que leía el DOM en el
    // instante en que terminaba el `goto`, antes de que React montara el
    // plan, y devolvía el arreglo vacío. Pasaba sola y fallaba bajo carga
    // paralela, que es la peor forma de fallar: una prueba intermitente que
    // afirma sobre la pantalla equivocada. Es el mismo defecto que el
    // encabezado de `e2e/navegacion.spec.ts` documenta con todas las letras,
    // y el mismo arreglo que usan las cuatro aserciones de abajo.
    await expect.poll(() => planDibujado(page)).toEqual(
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

  /**
   * **La secuencia que demuestra T-2.**
   *
   * `POST /avanzar` marca cumplida la próxima pendiente **del plan
   * guardado**, o sea que depende del orden que hay en la base. El editor
   * trabaja sobre un borrador. Con las dos cosas en la misma lista, la
   * secuencia «reordeno, no guardo, avanzo» hacía que el servidor firmara
   * como cumplida la etapa que estaba antes en esa posición: no un renglón
   * mal dibujado, sino un hecho falso con fecha y sin deshacer.
   *
   * Los tres actos van en una sola prueba a propósito: lo que hay que
   * demostrar no es que el botón se apague, es que se apague **y vuelva**
   * cuando la razón desaparece. Una guarda que no vuelve es una pared.
   */
  test("reordenar sin guardar niega avanzar, y guardar lo devuelve", async ({
    page,
  }) => {
    await conProcesosCargados(page);
    await page.goto(DETALLE_URL);

    // Acto 1: con todo guardado, se puede, y el botón nombra la etapa.
    await expect(
      page.getByRole("button", { name: `Avanzar a «${PENDIENTE_1}»` }),
    ).toBeEnabled();

    // Acto 2: se reordena y no se guarda.
    await page.getByRole("button", { name: `Subir ${PENDIENTE_2}` }).click();
    await expect
      .poll(() => planDibujado(page))
      .toEqual([CUMPLIDA_1, CUMPLIDA_2, PENDIENTE_2, PENDIENTE_1]);

    // El botón se niega **y dice por qué**. Sigue nombrando la etapa del
    // plan guardado, que es la que el servidor marcaría: si dijera la
    // primera del borrador estaría prometiendo algo que no va a pasar.
    const negado = page.getByRole("button", {
      name: `Avanzar a «${PENDIENTE_1}»`,
    });
    await expect(negado).toBeDisabled();
    await expect(
      page.getByText(/tiene cambios que todavía no se guardaron/i),
    ).toBeVisible();

    // Acto 3: se guarda, y recién entonces el botón vuelve — ahora
    // nombrando la etapa que de verdad quedó primera en la base.
    await page.getByRole("button", { name: "Guardar plan" }).click();

    await expect(
      page.getByRole("button", { name: `Avanzar a «${PENDIENTE_2}»` }),
    ).toBeEnabled();
    expect(
      await page
        .getByText(/tiene cambios que todavía no se guardaron/i)
        .count(),
      "guardado el plan, el motivo ya no tiene nada que explicar",
    ).toBe(0);

    // Y avanzar marca cumplida **la que se movió**, no la que estaba antes
    // en esa posición. Es el hecho que la guarda existe para no falsear.
    await page
      .getByRole("button", { name: `Avanzar a «${PENDIENTE_2}»` })
      .click();

    const cumplidos = page.locator(".plantilla__etapa--cumplida");
    await expect(cumplidos).toHaveCount(3);
    await expect(
      cumplidos.nth(2).locator(".campo__control"),
    ).toHaveValue(PENDIENTE_2);
  });

  test("agregar un paso en el medio del plan y guardarlo", async ({ page }) => {
    await conProcesosCargados(page);
    await page.goto(DETALLE_URL);

    const NUEVO = "Apostilla del acta de matrimonio";

    // Entra al final, que es el único lugar donde no se mete delante de
    // algo que ya pasó, y de ahí se sube hasta donde va.
    await page.getByLabel("Etapa nueva").fill(NUEVO);
    await page.getByRole("button", { name: "Agregar etapa" }).click();
    await page.getByRole("button", { name: `Subir ${NUEVO}` }).click();

    await expect
      .poll(() => planDibujado(page))
      .toEqual([CUMPLIDA_1, CUMPLIDA_2, PENDIENTE_1, NUEVO, PENDIENTE_2]);

    await page.getByRole("button", { name: "Guardar plan" }).click();
    await expect(page.getByText("Hay cambios sin guardar")).toHaveCount(0);

    // Y quedó guardado de verdad, no sólo dibujado: se recarga la pantalla
    // y el paso sigue en el medio. Sin la recarga, esto pasaría igual con
    // un `PUT` que el servidor hubiera ignorado.
    await page.reload();
    await expect
      .poll(() => planDibujado(page))
      .toEqual([CUMPLIDA_1, CUMPLIDA_2, PENDIENTE_1, NUEVO, PENDIENTE_2]);
  });

  test("cerrar el proceso no se lleva puesto el plan a medio editar", async ({
    page,
  }) => {
    // La regla de T-8 y T-9: un borrador se vacía **sólo si el servidor lo
    // guardó**. Cerrar contesta el detalle entero, pero no guarda una sola
    // de estas etapas, así que no puede tirar lo que alguien escribió.
    await conProcesosCargados(page);
    await page.goto(DETALLE_URL);

    const renglon = page.locator(".plantilla__etapa .campo__control").nth(2);
    await renglon.fill("Entrevista en el consulado");
    await expect(page.getByText("Hay cambios sin guardar")).toBeVisible();

    await page.getByRole("button", { name: "Cerrar el proceso" }).click();
    await page.getByRole("button", { name: "Reabrir el proceso" }).waitFor();

    await expect(renglon).toHaveValue("Entrevista en el consulado");
    await expect(page.getByText("Hay cambios sin guardar")).toBeVisible();
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

  /**
   * **La medición que decide si el rediseño respetó el diseño.**
   *
   * `docs/diseno.md` §6: «los pendientes abiertos viven arriba del proceso,
   * contados y a la vista». Con el cuerpo repartido en pestañas, «a la
   * vista» quiere decir una cosa muy concreta y comprobable: que no exista
   * ninguna pestaña desde la que haya que apretar algo para enterarse de
   * cuántos cabos sueltos hay y en qué etapa va el trámite. Por eso esto
   * recorre las cuatro y no se conforma con la primera.
   */
  test("la cuenta y la etapa vigente se ven desde las CUATRO pestañas, sin apretar nada", async ({
    page,
  }) => {
    await conProcesosCargados(page);

    for (const direccion of [
      DETALLE_URL,
      PENDIENTES_URL,
      DINERO_URL,
      HISTORIAL_URL,
    ]) {
      await page.goto(direccion);

      // La cuenta, que es lo que se lee de un vistazo: dos abiertos de los
      // tres que hay, y uno de ellos vencido.
      await expect(
        page.getByText("2 pendientes abiertos, 1 vencido."),
      ).toBeVisible();

      // Y la etapa vigente, que es la otra mitad de lo que la cabecera
      // existe para no esconder.
      await expect(
        page.getByRole("definition").filter({ hasText: PENDIENTE_1 }),
      ).toBeVisible();

      // Arriba de verdad: antes de la tira de pestañas, no debajo de ella.
      // Es la parte del criterio que una prueba de datos no puede ver.
      const posicion = await page.evaluate(() => {
        const cuenta = document.querySelector('[role="status"]');
        const tira = document.querySelector(".pestanas");
        if (cuenta === null || tira === null) return "falta alguno";
        return (cuenta.compareDocumentPosition(tira) &
          Node.DOCUMENT_POSITION_FOLLOWING) !==
          0
          ? "arriba"
          : "abajo";
      });
      expect(posicion, `en ${direccion}`).toBe("arriba");
    }
  });

  test("la pestaña de pendientes lleva el detalle, y solo el de los abiertos", async ({
    page,
  }) => {
    await conProcesosCargados(page);
    await page.goto(PENDIENTES_URL);

    // Solo los abiertos en el bloque: el cerrado no compite por ese lugar.
    await expect(page.locator(".pendientes .pendiente")).toHaveCount(2);
  });

  test("sin ninguno abierto, el bloque dice qué pasa en vez de quedar vacío", async ({
    page,
  }) => {
    // La cuenta que llenaba este bloque se fue a la cabecera, así que sobre
    // un proceso sin cabos sueltos quedaba un recuadro con borde y nada
    // adentro. Un bloque mudo obliga a preguntarse si no hay pendientes o
    // si no se cargaron, que es la duda que este bloque existe para no
    // tener (`docs/diseno.md` §6).
    await conProcesosCargados(page);
    await page.route(
      `**/api/procesos/${PROCESO_ID}/pendientes`,
      async (ruta) => {
        await ruta.fulfill({ status: 200, json: { pendientes: [] } });
      },
    );
    await page.goto(PENDIENTES_URL);

    const bloque = page.locator(".pendientes");
    await expect(bloque).toContainText("Ninguno abierto");
    // Y dice la salida, como el resto de los vacíos de esta pantalla.
    await expect(bloque).toContainText("se anota acá abajo");
  });

  test("un pendiente vencido se ve distinto, y lo DICE además de marcarlo", async ({
    page,
  }) => {
    await conProcesosCargados(page);
    await page.goto(PENDIENTES_URL);

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
    await page.goto(PENDIENTES_URL);

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
    await page.goto(PENDIENTES_URL);

    await expect(page.locator(".pendiente--vencido")).toContainText(
      `nació en «${CUMPLIDA_1}»`,
    );
  });

  test("cerrar redibuja con lo que contestó el servidor", async ({ page }) => {
    await conProcesosCargados(page);
    await page.goto(PENDIENTES_URL);

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
    await page.goto(PENDIENTES_URL);

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
    await page.goto(PENDIENTES_URL);

    await expect(
      page.locator("#campo-responsable-pendiente option"),
    ).toHaveText(["Sin responsable asignado", "Itzel", "Ricardo"]);
  });

  /* --- T-15 · el responsable del proceso, en el alta ------------------- */

  test("el alta ofrece el equipo como responsable y no a quien está dado de baja", async ({
    page,
  }) => {
    await conProcesosCargados(page);
    await page.goto("/procesos/nuevo");

    // Mariana está en `/api/usuarios` y no está acá: «válido» y
    // «seleccionable» son cosas distintas desde T-5. La opción vacía se
    // **nombra**: un proceso sin responsable es legítimo, y el que no tiene
    // dueño es el que se pierde, así que se elige a sabiendas.
    await expect(page.locator("#campo-responsableId option")).toHaveText([
      "Sin responsable asignado",
      "Itzel",
      "Ricardo",
    ]);
  });

  test("el responsable elegido viaja en el alta", async ({ page }) => {
    await conProcesosCargados(page);

    let enviado: unknown = null;
    await page.route(
      (url) => url.pathname === "/api/procesos",
      async (ruta) => {
        if (ruta.request().method() !== "POST") {
          await ruta.fallback();
          return;
        }
        enviado = ruta.request().postDataJSON();
        await ruta.fulfill({ status: 201, json: { proceso: PROCESO } });
      },
    );

    await page.goto("/procesos/nuevo");
    await page.selectOption("#campo-clienteId", CLIENTE_ID);
    await page.selectOption("#campo-tipoProcesoId", TIPO_ID);
    await page.selectOption("#campo-responsableId", RICARDO.id);
    await page.getByRole("button", { name: "Abrir proceso" }).click();

    await expect.poll(() => enviado).not.toBeNull();
    expect(enviado).toMatchObject({ responsableId: RICARDO.id });
  });

  test("sin elegir responsable, el proceso se abre igual y viaja en nulo", async ({
    page,
  }) => {
    // El campo es opcional, y el esquema dice lo mismo: `responsable_id` es
    // nullable. Un trámite se abre antes de decidir quién lo lleva, y
    // obligar a elegir fabricaría una asignación falsa.
    await conProcesosCargados(page);

    let enviado: unknown = null;
    await page.route(
      (url) => url.pathname === "/api/procesos",
      async (ruta) => {
        if (ruta.request().method() !== "POST") {
          await ruta.fallback();
          return;
        }
        enviado = ruta.request().postDataJSON();
        await ruta.fulfill({ status: 201, json: { proceso: PROCESO } });
      },
    );

    await page.goto("/procesos/nuevo");
    await page.selectOption("#campo-clienteId", CLIENTE_ID);
    await page.selectOption("#campo-tipoProcesoId", TIPO_ID);
    await page.getByRole("button", { name: "Abrir proceso" }).click();

    await expect.poll(() => enviado).not.toBeNull();
    expect(enviado).toMatchObject({ responsableId: null });
  });

  test("un pendiente vacío no se manda: lo dice el navegador antes de ir", async ({
    page,
  }) => {
    await conProcesosCargados(page);
    await page.goto(PENDIENTES_URL);

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
    await page.goto(HISTORIAL_URL);

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
    await page.goto(HISTORIAL_URL);

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
    await page.goto(HISTORIAL_URL);

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
    await page.goto(HISTORIAL_URL);

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
    await page.goto(HISTORIAL_URL);

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
    await page.goto(HISTORIAL_URL);

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
    await page.goto(HISTORIAL_URL);

    const hechos = page.locator(".bitacora__frase");
    await expect(hechos).toHaveCount(BITACORA.entradas.length);

    // La frase exacta que pidió el usuario: quién, qué y sobre qué.
    await expect(hechos.nth(2)).toHaveText(`Itzel avanzó a «${CUMPLIDA_1}».`);

    // Y el orden es el del servidor: del hecho más nuevo al más viejo
    // (T-17). Lo último es lo primero que se ve al aterrizar; el alta, que
    // es arqueología en un proceso largo, queda al fondo.
    await expect(hechos.first()).toContainText("abrió el pendiente");
    await expect(hechos.last()).toContainText("dio de alta");
  });

  /* ---------------------------------------------------------------------
     T-17 · La bitácora llega por páginas
     --------------------------------------------------------------------- */

  /**
   * Contesta la bitácora recortada al `?limite` que pida la pantalla.
   *
   * Se registra **después** de `conProcesosCargados`, y en Playwright la
   * última ruta registrada es la que atiende: así este banco pisa al de
   * arriba solo para esta dirección.
   */
  async function conHistoriaLarga(page: Page): Promise<void> {
    await page.route(
      (url) => url.pathname === `/api/procesos/${PROCESO_ID}/bitacora`,
      async (ruta) => {
        const limite = Number(
          new URL(ruta.request().url()).searchParams.get("limite") ?? "0",
        );

        await ruta.fulfill({
          status: 200,
          json: {
            entradas: HECHOS_LARGOS.slice(0, limite),
            total: HECHOS_LARGOS.length,
          },
        });
      },
    );
  }

  test("la bitácora larga llega cortada, y el resumen cuenta el total", async ({
    page,
  }) => {
    // Lo que se dibuja son veinte; lo que hay son sesenta y cuatro. El
    // resumen tiene que hablar del total: contar la lista recibida diría
    // «20 hechos registrados» de un proceso que tiene sesenta y cuatro.
    await conProcesosCargados(page);
    await conHistoriaLarga(page);
    await page.goto(HISTORIAL_URL);

    await expect(page.locator(".bitacora__frase")).toHaveCount(20);
    await expect(
      page.getByText("64 hechos registrados; se muestran los 20 más recientes."),
    ).toBeVisible();

    // Y los veinte son los más recientes, no los veinte primeros.
    await expect(page.locator(".bitacora__frase").first()).toContainText(
      "«Paso 64»",
    );
  });

  test("el control de abajo dice cuántos trae y los trae", async ({ page }) => {
    await conProcesosCargados(page);
    await conHistoriaLarga(page);
    await page.goto(HISTORIAL_URL);

    const pedidos: string[] = [];
    page.on("request", (peticion) => {
      const url = new URL(peticion.url());
      if (url.pathname.endsWith("/bitacora")) pedidos.push(url.search);
    });

    // «Ver más» a secas no informa: el rótulo lleva el número.
    const control = page.getByRole("button", {
      name: "Ver 20 hechos más antiguos",
    });
    await expect(control).toBeVisible();

    await control.click();

    await expect(page.locator(".bitacora__frase")).toHaveCount(40);

    // La última petición pidió cuarenta, que es lo que el rótulo prometía.
    // Se mira la última y no la lista entera: la primera página también se
    // pide por esta dirección, y en desarrollo React la pide dos veces.
    await expect.poll(() => pedidos.at(-1)).toBe("?limite=40");
    expect(
      pedidos.every((consulta) => consulta.startsWith("?limite=")),
      "ninguna petición de bitácora sale sin tope",
    ).toBe(true);
    await expect(
      page.getByText("64 hechos registrados; se muestran los 40 más recientes."),
    ).toBeVisible();

    // Lo más reciente sigue arriba: traer lo viejo no da vuelta la lista.
    await expect(page.locator(".bitacora__frase").first()).toContainText(
      "«Paso 64»",
    );
  });

  test("el control promete solo lo que falta, y desaparece al terminar", async ({
    page,
  }) => {
    await conProcesosCargados(page);
    await conHistoriaLarga(page);
    await page.goto(HISTORIAL_URL);

    await page
      .getByRole("button", { name: "Ver 20 hechos más antiguos" })
      .click();
    await expect(page.locator(".bitacora__frase")).toHaveCount(40);

    await page
      .getByRole("button", { name: "Ver 20 hechos más antiguos" })
      .click();
    await expect(page.locator(".bitacora__frase")).toHaveCount(60);

    // Quedan cuatro: el rótulo no puede seguir prometiendo veinte.
    await page
      .getByRole("button", { name: "Ver 4 hechos más antiguos" })
      .click();

    await expect(page.locator(".bitacora__frase")).toHaveCount(64);
    await expect(page.getByText("64 hechos registrados.")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /hechos? más antiguos?/ }),
    ).toHaveCount(0);
  });

  test("la bitácora dice que no hubo relleno retroactivo", async ({ page }) => {
    // Una lista que arranca el martes pasado se lee como la historia
    // completa si nadie dice que no lo es.
    await conProcesosCargados(page);
    await page.goto(HISTORIAL_URL);

    // Dentro de la bitácora, no en la página. Suelta, la afirmación sólo
    // decía que la frase estaba escrita en alguna parte: habría pasado con
    // la advertencia en la línea de tiempo de al lado, que es el otro
    // registro y el que **sí** está completo.
    await expect(
      page
        .getByRole("region", { name: "Bitácora" })
        .getByText(/lo que pasó antes no está acá/i),
    ).toBeVisible();
  });

  test("no hay forma de escribir ni de borrar un hecho desde la pantalla", async ({
    page,
  }) => {
    await conProcesosCargados(page);
    await page.goto(HISTORIAL_URL);

    // La bitácora la escribe el sistema al hacer otra cosa. Que no haya un
    // solo control adentro de la lista es la mitad visible de esa regla; la
    // otra mitad son los dos disparadores de la migración. `.bitacora` es el
    // `<ol>` de los hechos: el control de «ver más viejos» que T-17 agregó
    // vive **fuera**, que es donde tiene que estar —no es un hecho de la
    // historia— y por eso esta cuenta sigue siendo cero.
    await expect(page.locator(".bitacora").getByRole("button")).toHaveCount(0);
    await expect(
      page.locator(".bitacora").getByRole("textbox"),
    ).toHaveCount(0);
  });

  test("avanzar de etapa vuelve a pedir la bitácora", async ({ page }) => {
    // Lo que la pantalla acaba de hacer es exactamente lo que la bitácora
    // tiene que mostrar: si no se recargara, el hecho recién ocurrido sería
    // el único que no se ve.
    //
    // Y se mide **desde la pestaña de trabajo**, que es donde está el botón
    // de avanzar, aunque la bitácora se dibuje en la de historial: el sello
    // que dispara la recarga vive en el armador y no en el panel que la
    // lee. Si viviera adentro del panel, nada de lo que pasa en las otras
    // tres pestañas llegaría nunca a la bitácora.
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

    // Por defecto se ven los abiertos y no el terminado: eso es lo que el
    // bufete abre a mirar. Tres desde T-15, que agregó al banco un cuarto
    // proceso —abierto— nacido de una cotización.
    await expect(page.locator("table tbody tr")).toHaveCount(3);
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
    await expect(page.locator("table tbody tr")).toHaveCount(4);
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

    // Las otras dos reglas viven en otras pestañas, y se llega a ellas por
    // la tira: cambiar de pestaña **no vuelve a montar la pantalla**, así
    // que el cierre que se acaba de hacer sigue en pie sin que el servidor
    // —que en estas pruebas contesta siempre «abierto»— lo vuelva a decir.
    // Si la `key` de la pantalla incluyera la pestaña, esto fallaría acá.
    await page.getByRole("link", { name: "Pendientes", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Anotar pendiente" }),
    ).toBeDisabled();

    // Anotar una nota sigue habilitado: la historia no se congela.
    await page.getByRole("link", { name: "Historial", exact: true }).click();
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

  /*
   * El detalle dejó de ser una página, así que el criterio de §9 deja de
   * medirse en una.
   *
   * El bucle de antes esperaba las tres clases de contenido hostil en la
   * misma pantalla —el editor del plan, el token largo de una nota y el de
   * un pendiente—. Repartidas en pestañas, esa espera no se cumpliría
   * nunca en ninguna, así que cada pestaña se mide **donde vive su
   * contenido hostil**, en los mismos nueve anchos. Medir una sola y dar
   * las otras por buenas sería dejar sin cubrir justo lo que se movió.
   *
   * «Dinero» no está acá: su panel es `PanelDeGastos`, que tiene sus
   * propias nueve medidas en `e2e/gastos.spec.ts`. Repetirlas sería una
   * segunda cuenta del mismo contenido.
   */
  const PESTANAS_MEDIDAS = [
    {
      nombre: "en la pestaña de trabajo",
      direccion: DETALLE_URL,
      hostil: ".plantilla__etapa .campo__control",
    },
    {
      // Desde T-9 los pendientes traen un token sin espacios, y el bloque
      // va arriba del todo.
      nombre: "en la pestaña de pendientes",
      direccion: PENDIENTES_URL,
      hostil: ".pendiente__texto",
    },
    {
      // La línea de tiempo llega en su propia petición y es la que trae el
      // token largo sin espacios. Medir antes de que esté dibujada haría
      // que el criterio pasara sin haber visto el contenido hostil, que es
      // la vacuidad que T-4 descubrió en su propia rejilla.
      nombre: "en la pestaña de historial",
      direccion: HISTORIAL_URL,
      hostil: ".nota__texto",
    },
  ] as const;

  for (const pestana of PESTANAS_MEDIDAS) {
    for (const ancho of ANCHOS) {
      test(`a ${String(ancho)}px de ancho, ${pestana.nombre}`, async ({
        page,
      }) => {
        await conProcesosCargados(page);
        await page.setViewportSize({ width: ancho, height: ALTO });
        await page.goto(pestana.direccion);
        await page.evaluate(() => document.fonts.ready);
        await page.locator(pestana.hostil).first().waitFor();

        const desborde = await medirDesborde(page);

        expect(
          desborde.scrollWidth,
          porQueSeSale(ancho, desborde),
        ).toBeLessThanOrEqual(desborde.clientWidth);
      });
    }
  }

  // T-17 · el control de «ver más viejos» es contenido nuevo, y el rótulo
  // lleva un número adentro: a 320px es exactamente la clase de cosa que se
  // sale del ancho sin que nadie la mire. Va en su propio bucle y en los
  // tres anchos donde esto se quiebra, para no quitarle al de arriba el
  // contenido hostil de la línea de tiempo, que es lo que ése mide.
  for (const ancho of [320, 768, 2560] as const) {
    test(`a ${String(ancho)}px de ancho, con el control de la bitácora`, async ({
      page,
    }) => {
      await conProcesosCargados(page);
      await conHistoriaLarga(page);
      await page.setViewportSize({ width: ancho, height: ALTO });
      await page.goto(HISTORIAL_URL);
      await page.evaluate(() => document.fonts.ready);
      await page
        .getByRole("button", { name: "Ver 20 hechos más antiguos" })
        .waitFor();

      const desborde = await medirDesborde(page);

      expect(
        desborde.scrollWidth,
        porQueSeSale(ancho, desborde),
      ).toBeLessThanOrEqual(desborde.clientWidth);
    });
  }
});

/* ==========================================================================
   Las cuatro pestañas del proceso

   Lo que `test/procesos-ui.spec.ts` ya prueba sin navegador es **qué
   dirección corresponde a qué pestaña**. Lo que sólo se puede comprobar
   acá es que esas direcciones estén cableadas a la pantalla: que cada una
   se abra en frío, que el botón de atrás funcione porque la pestaña es una
   entrada del historial y no un estado escondido, que la abierta se
   distinga de las otras tres, y que la tira sea alcanzable con el teclado.
   ========================================================================== */

/** Un encabezado que sólo existe en una de las cuatro pestañas. */
const MARCAS = [
  { pestana: "Trabajo", direccion: DETALLE_URL, marca: "Plan de trabajo" },
  {
    pestana: "Pendientes",
    direccion: PENDIENTES_URL,
    marca: "Anotar un pendiente",
  },
  { pestana: "Dinero", direccion: DINERO_URL, marca: "Gastos y anticipos" },
  {
    pestana: "Historial",
    direccion: HISTORIAL_URL,
    marca: "Línea de tiempo",
  },
] as const;

test.describe("las pestañas del proceso", () => {
  test("cada pestaña se abre por su dirección, en frío, y trae lo suyo", async ({
    page,
  }) => {
    await conProcesosCargados(page);

    for (const abierta of MARCAS) {
      await page.goto(abierta.direccion);

      await expect(
        page.getByRole("heading", { name: abierta.marca, exact: true }),
      ).toBeVisible();

      // Y **sólo** lo suyo. La cuenta se toma con `.count()` y no con
      // `toHaveCount(0)`: el segundo reintenta hasta que se cumpla, así que
      // sobre una pantalla que todavía no dibujó nada da cero y pasa. Acá
      // el cero recién tiene sentido después de que la marca de arriba esté
      // visible, que es la prueba de que la pestaña ya está dibujada.
      for (const otra of MARCAS) {
        if (otra.pestana === abierta.pestana) continue;

        const cuantas = await page
          .getByRole("heading", { name: otra.marca, exact: true })
          .count();
        expect(cuantas, `«${otra.marca}» en ${abierta.direccion}`).toBe(0);
      }
    }
  });

  test("el h1 sigue siendo el título del proceso, no el de la pestaña", async ({
    page,
  }) => {
    await conProcesosCargados(page);

    for (const abierta of MARCAS) {
      await page.goto(abierta.direccion);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        PROCESO.titulo,
      );
    }
  });

  test("el botón de atrás vuelve a la pestaña anterior", async ({ page }) => {
    // Es la razón por la que la pestaña vive en la URL y no en un `useState`:
    // con estado local esto no tendría ni siquiera adónde volver.
    await conProcesosCargados(page);
    await page.goto(DETALLE_URL);

    await page.getByRole("link", { name: "Pendientes", exact: true }).click();
    await expect(page).toHaveURL(PENDIENTES_URL);

    await page.getByRole("link", { name: "Dinero", exact: true }).click();
    await expect(page).toHaveURL(DINERO_URL);

    await page.goBack();
    await expect(page).toHaveURL(PENDIENTES_URL);
    await expect(
      page.getByRole("heading", { name: "Anotar un pendiente", exact: true }),
    ).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(DETALLE_URL);
    await expect(
      page.getByRole("heading", { name: "Plan de trabajo", exact: true }),
    ).toBeVisible();
  });

  test("la abierta se distingue, y no sólo por el color", async ({ page }) => {
    await conProcesosCargados(page);
    await page.goto(PENDIENTES_URL);

    const tira = page.locator(".pestanas");
    const abierta = tira.getByRole("link", {
      name: "Pendientes",
      exact: true,
    });
    const cerrada = tira.getByRole("link", { name: "Dinero", exact: true });

    await expect(abierta).toHaveAttribute("aria-current", "page");
    expect(await cerrada.getAttribute("aria-current")).toBeNull();

    // Y la diferencia se ve sin distinguir tonos: la abierta pesa más y
    // lleva una barra debajo. Un estado que sólo existe como color no
    // existe para todo el mundo.
    const pesos = await Promise.all(
      [abierta, cerrada].map((enlace) =>
        enlace.evaluate((nodo) => ({
          peso: getComputedStyle(nodo).fontWeight,
          barra: getComputedStyle(nodo).borderBottomColor,
        })),
      ),
    );

    expect(Number(pesos[0].peso)).toBeGreaterThan(Number(pesos[1].peso));
    expect(pesos[0].barra).not.toBe(pesos[1].barra);
  });

  test("las cuatro se alcanzan con el tabulador, en su orden", async ({
    page,
  }) => {
    await conProcesosCargados(page);
    await page.goto(DETALLE_URL);

    const tira = page.locator(".pestanas");
    await tira.getByRole("link", { name: "Trabajo", exact: true }).focus();

    for (const siguiente of ["Pendientes", "Dinero", "Historial"]) {
      await page.keyboard.press("Tab");
      await expect(
        tira.getByRole("link", { name: siguiente, exact: true }),
      ).toBeFocused();
    }
  });

  /**
   * La tira **no** usa el patrón `tablist` de ARIA, y es a propósito.
   *
   * `role="tab"` le promete a un lector de pantalla que el contenido
   * cambia en la misma página y que las flechas recorren las pestañas.
   * Acá cada pestaña es una dirección con su historial, así que esa
   * promesa sería falsa — y una promesa falsa deja peor a quien confía en
   * ella que no prometer nada. Lo que hay es una navegación de enlaces.
   */
  test("no promete el patrón `tablist`, que no cumpliría", async ({ page }) => {
    await conProcesosCargados(page);
    await page.goto(DETALLE_URL);

    // Primero, que la tira esté dibujada: sin esto las cuentas de abajo
    // serían cero sobre una pantalla vacía.
    await expect(
      page.locator(".pestanas").getByRole("link"),
    ).toHaveCount(4);

    for (const rol of ["tablist", "tab", "tabpanel"] as const) {
      expect(await page.locator(`[role="${rol}"]`).count(), rol).toBe(0);
    }

    await expect(
      page.getByRole("navigation", { name: "Partes del proceso" }),
    ).toBeVisible();
  });

  /**
   * **T-2 · La tira pesa lo que vale.**
   *
   * Es el eje de navegación de la pantalla, y en T-1 quedó en texto del
   * tamaño del cuerpo con un subrayado fino, perdida entre bloques que
   * pesaban más. Las tres medidas de abajo son las tres declaraciones que
   * se agregaron, una por una: si alguien borra cualquiera, muere su
   * aserción y no las otras dos.
   *
   * Se mide sobre una pestaña **cerrada** a propósito: el realce de la
   * abierta ya tiene su prueba, y medirlo acá escondería que las cerradas
   * siguieran siendo letra chica.
   */
  test("la tira pesa más que el texto corriente de la página", async ({
    page,
  }) => {
    await conProcesosCargados(page);
    await page.goto(DETALLE_URL);

    const cerrada = page
      .locator(".pestanas")
      .getByRole("link", { name: "Dinero", exact: true });
    await expect(cerrada).toBeVisible();

    const rotulo = await cerrada.evaluate((nodo) => {
      const estilo = getComputedStyle(nodo);
      return {
        tamano: Number.parseFloat(estilo.fontSize),
        peso: Number(estilo.fontWeight),
        barra: Number.parseFloat(estilo.borderBottomWidth),
      };
    });
    const cuerpo = await page.evaluate(() =>
      Number.parseFloat(getComputedStyle(document.body).fontSize),
    );

    expect(rotulo.tamano, "una pestaña no puede ser más chica que un párrafo")
      .toBeGreaterThan(cuerpo);
    expect(rotulo.peso, "ni pesar lo mismo que el texto corrido")
      .toBeGreaterThan(400);
    expect(rotulo.barra, "la barra tiene que tener cuerpo, no ser un pelo")
      .toBeGreaterThanOrEqual(3);
  });

  /**
   * **T-2 · «Estado del proceso» deja de ser una sección huérfana.**
   *
   * T-1 la dejó como una `<section>` con su propio `<h2>` **debajo** de la
   * tira. Medido con datos reales en una pantalla de 2000px: las pestañas
   * aparecían recién a un tercio de la altura, detrás de un encabezado de
   * segundo nivel que pesaba más que la navegación que tenía encima.
   *
   * Lo que se mide acá no es que el `<h2>` se haya borrado —eso pasaría
   * con el botón borrado también— sino las tres cosas juntas: que la
   * acción siga estando, que esté **arriba** de la tira, y que no haya
   * ningún encabezado de sección por encima de la navegación.
   */
  test("cerrar el proceso es una acción de la cabecera, no una sección", async ({
    page,
  }) => {
    await conProcesosCargados(page);
    await page.goto(DETALLE_URL);

    const cerrar = page.getByRole("button", { name: "Cerrar el proceso" });
    await expect(cerrar).toBeVisible();

    // La advertencia sigue disponible y **atada al botón**, no sólo puesta
    // cerca: sin la sección que los envolvía, la cercanía era lo único que
    // los unía, y eso es la flojedad que T-1 arregló en otras dos pruebas.
    await expect(cerrar).toHaveAccessibleDescription(
      /se puede deshacer reabriendo/i,
    );

    const tira = await page.locator(".pestanas").boundingBox();
    const boton = await cerrar.boundingBox();
    expect(tira).not.toBeNull();
    expect(boton).not.toBeNull();
    expect(
      boton?.y,
      "la acción del expediente entero va antes que la navegación",
    ).toBeLessThan(tira?.y ?? 0);

    // Y ningún encabezado de sección por encima de la tira: un `<h2>`
    // arriba de la navegación grita más fuerte que ella.
    for (const encabezado of await page.locator("h2").all()) {
      const caja = await encabezado.boundingBox();
      expect(
        caja?.y ?? Number.POSITIVE_INFINITY,
        `«${(await encabezado.textContent()) ?? ""}» quedó arriba de la tira`,
      ).toBeGreaterThan(tira?.y ?? 0);
    }

    // La sección ya no existe, ni como encabezado ni como región. `.count()`
    // y no `toHaveCount(0)`: el segundo reintenta, y acá la pantalla ya se
    // comprobó dibujada.
    expect(
      await page.getByRole("heading", { name: "Estado del proceso" }).count(),
    ).toBe(0);
    expect(
      await page.getByRole("region", { name: "Estado del proceso" }).count(),
    ).toBe(0);
  });

  test("una tercera parte inventada no dibuja una pantalla en blanco", async ({
    page,
  }) => {
    await conProcesosCargados(page);
    await page.goto(`${DETALLE_URL}/gastos`);

    await expect(
      page.getByRole("heading", { name: "Esa página no existe" }),
    ).toBeVisible();
  });
});

/* ==========================================================================
   T-15 · De dónde viene cada proceso, dibujado

   Lo que las funciones ya prueban en `test/procesos-ui.spec.ts` es **qué
   texto sale**. Lo que sólo se puede comprobar acá es que ese texto esté
   puesto, que el enlace apunte a donde dice, y —sobre todo— que sobre un
   proceso directo **no exista ningún control**: ni apagado, ni escondido.

   Las dos direcciones van juntas en cada caso. Una prueba que sólo
   afirmara la ausencia pasaría con el distintivo borrado de la pantalla.
   ========================================================================== */

test.describe("de dónde viene cada proceso", () => {
  test("el listado distingue el que nace de una cotización del que no", async ({
    page,
  }) => {
    await conProcesosCargados(page);
    await page.goto("/procesos");

    /*
     * Los dos conteos van **acotados a la tabla**, y la primera versión de
     * esta prueba no lo estaba: falló contando 2 de `.etiqueta--tenue`
     * sobre una tabla donde no había ninguna. Eran las dos de la
     * navegación del esqueleto, que marca «pendiente» las secciones que
     * todavía no existen y está dibujada en todas las páginas.
     *
     * Es la lección de la tajada otra vez, y del lado del que la escribe:
     * un conteo de clases sobre el documento entero mide todo lo que
     * comparte la clase, esté o no en la sección que la prueba cree estar
     * mirando.
     */
    const tabla = page.locator("table");

    // La presencia. El distintivo lleva el código, así que nombra **cuál**.
    const distintivos = tabla.locator(".etiqueta--origen");
    await expect(distintivos).toHaveCount(1);
    await expect(distintivos).toHaveText(`De ${CODIGO}`);

    // Y la ausencia, medida sobre la misma tabla: tres filas visibles y un
    // solo distintivo quiere decir que las otras dos no lo llevan.
    await expect(page.locator("table tbody tr")).toHaveCount(3);

    // La clase es propia y no `etiqueta--tenue`, que es la del proceso
    // cerrado: con la clase compartida, este conteo mezclaría las dos
    // cosas y dejaría de medir ésta. Con el filtro en «abiertos» no hay
    // ningún cerrado en la tabla, así que el cero es el de verdad.
    expect(await tabla.locator(".etiqueta--tenue").count()).toBe(0);
  });

  test("el buscador encuentra el proceso por el código de su cotización", async ({
    page,
  }) => {
    await conProcesosCargados(page);
    await page.goto("/procesos");

    await page.getByLabel("Buscar").fill(CODIGO);

    await expect(page.locator("table tbody tr")).toHaveCount(1);
    await expect(
      page.getByRole("rowheader", { name: DESDE_COTIZACION.titulo }),
    ).toBeVisible();
  });

  test("el detalle del que nace de una cotización ofrece el enlace a ella", async ({
    page,
  }) => {
    await conProcesosCargados(page);
    await page.goto(`/procesos/${DESDE_COTIZACION.id}`);

    await expect(
      page.getByText(`Este proceso nace de la cotización «${CODIGO}».`),
    ).toBeVisible();

    const enlace = page.getByRole("link", { name: "Ver la cotización" });
    await expect(enlace).toBeVisible();
    await expect(enlace).toHaveAttribute(
      "href",
      `/cotizaciones/${COTIZACION_ID}`,
    );
  });

  test("el detalle del abierto a mano no ofrece ninguno, ni apagado", async ({
    page,
  }) => {
    await conProcesosCargados(page);
    await page.goto(DETALLE_URL);

    // Se espera a que la pantalla esté dibujada antes de contar: un cero
    // leído sobre una página a medio montar es un cero que no prueba nada.
    // El ancla era «Cumplido», que T-2 fundió en la lista única.
    await expect(
      page.getByRole("heading", { name: "Plan de trabajo", exact: true }),
    ).toBeVisible();

    // `.count()` y no `toHaveCount(0)`: una aserción que reintenta no puede
    // demostrar un «nunca». Es la misma lección que `controlesDelCiclo` de
    // `e2e/cotizaciones.spec.ts`.
    expect(
      await page.getByRole("link", { name: "Ver la cotización" }).count(),
      "un proceso directo no tiene cotización que mostrar",
    ).toBe(0);
    expect(
      await page.getByRole("button", { name: "Ver la cotización" }).count(),
      "y tampoco un botón apagado, que es la misma promesa",
    ).toBe(0);
    expect(await page.locator("main .etiqueta--origen").count()).toBe(0);

    // La presencia al lado de la ausencia, en la misma pantalla: el enlace
    // al cliente sí está, así que lo que falta es la cotización y no el
    // renglón entero.
    await expect(
      page.getByRole("link", { name: "Ver el cliente" }),
    ).toBeVisible();
  });
});
