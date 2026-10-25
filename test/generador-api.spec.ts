/**
 * El generador de borradores desde una descripción en prosa (T-9,
 * `docs/diseno.md` §8 «La entrada»).
 *
 * ## Qué se prueba acá, y qué no probaría nada
 *
 * La barandilla de la tajada es **el modelo no suma, nunca**, y T-8 ya la
 * hizo imposible a nivel de tipos: `PropuestaDelModelo` no tiene dónde poner
 * un total. Lo que esta tarea podía romper es otra cosa —abrir una puerta
 * nueva— y es lo que estas pruebas vigilan:
 *
 *  1. **Que lo aritmético lo siga haciendo `totalesDe`** sobre las líneas ya
 *     guardadas, y que un total que el modelo mande se rechace entero antes
 *     de que exista ninguna fila.
 *  2. **Que el prompt y `tiposDeProcesoOfrecidos` no se puedan separar.** Sin
 *     esa lista ninguna línea puede traer trámite, y sin trámite T-7 no abre
 *     ningún proceso: el círculo que esa tarea cerró quedaría abierto por el
 *     lado del generador, y en silencio.
 *  3. **Que los cuatro motivos de falla lleguen distintos.** T-8 los separó;
 *     una respuesta que los aplastara en un «error» desperdiciaría ese
 *     trabajo.
 *  4. **Que la generación y la creación del borrador sean atómicas.** Si una
 *     línea no entra, no queda ninguna cotización a medias.
 *
 * ## Ninguna prueba llama a la red
 *
 * El modelo entra por `dependencias.modelo`, que es **el mismo camino que usa
 * producción**: `worker/index.ts` hace `dependencias.modelo ??
 * modeloDesdeEntorno(env)`, así que lo único que cambia entre una corrida de
 * prueba y una desplegada es quién construyó el objeto. La validación de
 * esquema está por encima de los dos y corre igual con un modelo falso que
 * con uno real — si la costura estuviera en la validación, estas pruebas no
 * probarían nada.
 *
 * El entorno se neutraliza además de forma explícita, por lo mismo que
 * `test/ia-modelo.spec.ts`: `IA_API_KEY` vive en un `.dev.vars` local sin
 * versionar, y en la máquina que la tenga puesta un olvido de inyección
 * llamaría a Anthropic de verdad.
 */
import { env } from "cloudflare:workers";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { TipoProceso } from "../worker/contract";
import type { ServicioDeCatalogos } from "../worker/catalogos/repositorio";
import { catalogosSobreD1 } from "../worker/catalogos/repositorio";
import {
  CATALOGO_DE_CLASES,
  totalesDe,
} from "../worker/cotizaciones/lineas";
import { CATALOGO_DE_MODULOS } from "../worker/cotizaciones/modulos";
import { baseSobreD1 } from "../worker/db/base";
import { TENANT_UNICO_ID, nuevoId } from "../worker/db/ids";
import { normalizarDescripcion } from "../worker/ia/generador";
import { encargoAlModelo, type TramiteOfrecido } from "../worker/ia/prompt";
import type { PropuestaDelModelo } from "../worker/ia/esquema";
import type {
  ModeloDeLenguaje,
  PeticionDeCompletado,
  ResultadoDelModelo,
} from "../worker/ia/modelo";
import { manejar } from "../worker/index";

const DOMINIO_DE_ACCESS = "https://bufete-de-prueba.cloudflareaccess.com";
const AUD = "aud-de-la-aplicacion-del-bufete";
const EMAIL_AUTOR = "itzel@bufete.test";

/** El tenant vecino. Existe sólo para que la fuga sea expresable. */
const OTRO_TENANT_ID = "1b6b7f1b-af2f-4b7f-af14-4c7b3b1f2e88";

let autorId: string;
let clienteId: string;
let areaId: string;
let tramiteVisaId: string;
let tramiteDivorcioId: string;
/**
 * Un trámite que el bufete **dejó de ofrecer**.
 *
 * Existe en la tabla, así que una línea que lo nombre pasa la llave foránea
 * y el disparador de tenencia sin despeinarse. Lo único que lo frena es que
 * el prompt no lo ofrezca, y eso es lo que estas pruebas vigilan.
 */
let tramiteDeBajaId: string;

/** La descripción que el abogado escribe. Es la entrada de toda la tarea. */
const DESCRIPCION =
  "Divorcio de mutuo acuerdo, hay bienes, el cliente pide pago diferido.";

/* ==========================================================================
   El entorno y las peticiones
   ========================================================================== */

function entorno(ajustes: Partial<Env> = {}): Env {
  return {
    ...env,
    ACCESO_TEAM_DOMAIN: DOMINIO_DE_ACCESS,
    ACCESO_AUD: AUD,
    ACCESO_DEV_EMAIL: undefined,
    // Herméticos. Sin esto, una máquina con la clave en `.dev.vars` y una
    // inyección olvidada llamaría al proveedor de verdad.
    IA_API_KEY: undefined,
    IA_MODELO: undefined,
    IA_PROVEEDOR: undefined,
    ...ajustes,
  };
}

function peticion(ruta: string, init?: RequestInit): Request {
  return new Request(`https://cotizador.bufete.pa${ruta}`, init);
}

function conCuerpo(ruta: string, metodo: string, cuerpo: unknown): Request {
  return peticion(ruta, {
    method: metodo,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
}

/* ==========================================================================
   El doble del modelo

   **No devuelve lo que se le envió.** Es la lección de esta tajada: un doble
   que hace de eco no distingue una pantalla que redibuja la respuesta de una
   que conserva lo tecleado, y acá no distinguiría un generador que usa lo
   que el modelo propuso de uno que copia la descripción.
   ========================================================================== */

interface ModeloFalso {
  readonly modelo: ModeloDeLenguaje;
  readonly peticiones: PeticionDeCompletado[];
}

function modeloQueDevuelve(
  resultado: ResultadoDelModelo<PropuestaDelModelo>,
): ModeloFalso {
  const peticiones: PeticionDeCompletado[] = [];

  return {
    peticiones,
    modelo: {
      proponer(peticionAlModelo) {
        peticiones.push(peticionAlModelo);
        return Promise.resolve(resultado);
      },
    },
  };
}

/**
 * Un modelo que escribe el texto que la prueba quiera, y deja que la
 * validación de T-8 lo juzgue.
 *
 * Es el camino que importa para la barandilla: el texto pasa por
 * `validarTextoDePropuesta` igual que con un proveedor real, porque la
 * costura que se sustituye está **debajo** de la validación y no encima.
 */
function modeloQueEscribe(
  texto: string,
  tramitesOfrecidos?: readonly string[],
): ModeloFalso {
  const peticiones: PeticionDeCompletado[] = [];

  return {
    peticiones,
    modelo: {
      async proponer(peticionAlModelo) {
        peticiones.push(peticionAlModelo);

        const { validarTextoDePropuesta } = await import(
          "../worker/ia/esquema"
        );
        const validacion = validarTextoDePropuesta(texto, {
          tiposDeProceso:
            tramitesOfrecidos ?? peticionAlModelo.tiposDeProcesoOfrecidos,
        });

        if (!validacion.ok) {
          return {
            ok: false,
            falla: {
              motivo: "salida_rechazada",
              detalle: `la salida del modelo no pasó el esquema (${String(validacion.rechazos.length)})`,
              rechazos: validacion.rechazos,
            },
          };
        }

        return { ok: true, valor: validacion.propuesta };
      },
    },
  };
}

function comoAutor(
  request: Request,
  dependencias: Parameters<typeof manejar>[2] = {},
): Promise<Response> {
  return manejar(request, entorno(), {
    correoDeDesarrollo: () => EMAIL_AUTOR,
    ...dependencias,
  });
}

/* ==========================================================================
   Las formas que viajan por el cable

   Se declaran acá y no se importan del contrato, por lo mismo que en
   `test/cotizaciones-api.spec.ts`: lo que esta prueba vigila es el JSON que
   ve el navegador, y con el tipo importado renombrar un campo en el servidor
   renombraría también la expectativa.
   ========================================================================== */

interface CotizacionEnElCable {
  id: string;
  codigo: string;
  estado: string;
  clienteId: string;
  fecha: string;
  venceEn: string | null;
}

interface ModuloEnElCable {
  id: string;
  tipo: string;
  orden: number;
  contenido: string;
}

interface LineaEnElCable {
  id: string;
  clase: string;
  concepto: string;
  monto: number;
  tipoProcesoId: string | null;
  orden: number;
}

interface TotalesEnElCable {
  honorarios: number;
  gastosEstimados: number;
  total: number;
}

async function cotizacionDe(respuesta: Response): Promise<CotizacionEnElCable> {
  const cuerpo = (await respuesta.json()) as {
    cotizacion?: CotizacionEnElCable;
  };
  expect(cuerpo.cotizacion, "la respuesta no trae `cotizacion`").toBeDefined();
  return cuerpo.cotizacion as CotizacionEnElCable;
}

/** Relee por la API, que es la única lectura que prueba que algo se guardó. */
async function modulosDe(id: string): Promise<ModuloEnElCable[]> {
  const respuesta = await comoAutor(
    peticion(`/api/cotizaciones/${id}/modulos`),
  );
  expect(respuesta.status).toBe(200);
  const cuerpo = (await respuesta.json()) as { modulos?: ModuloEnElCable[] };
  return cuerpo.modulos ?? [];
}

async function lineasDe(
  id: string,
): Promise<{ lineas: LineaEnElCable[]; totales: TotalesEnElCable }> {
  const respuesta = await comoAutor(peticion(`/api/cotizaciones/${id}/lineas`));
  expect(respuesta.status).toBe(200);
  return (await respuesta.json()) as {
    lineas: LineaEnElCable[];
    totales: TotalesEnElCable;
  };
}

async function cuantasCotizaciones(): Promise<number> {
  const respuesta = await comoAutor(peticion("/api/cotizaciones"));
  expect(respuesta.status).toBe(200);
  const cuerpo = (await respuesta.json()) as {
    cotizaciones?: CotizacionEnElCable[];
  };
  return (cuerpo.cotizaciones ?? []).length;
}

async function generar(
  cuerpo: unknown,
  dependencias: Parameters<typeof manejar>[2] = {},
): Promise<Response> {
  return comoAutor(
    conCuerpo("/api/cotizaciones/generar", "POST", cuerpo),
    dependencias,
  );
}

/* ==========================================================================
   La siembra
   ========================================================================== */

beforeAll(async () => {
  autorId = nuevoId();

  await env.DB.prepare(
    "INSERT INTO usuario (id, tenant_id, nombre, email, activo)" +
      " VALUES (?, ?, ?, ?, 1)",
  )
    .bind(autorId, TENANT_UNICO_ID, "Itzel", EMAIL_AUTOR)
    .run();
});

beforeEach(async () => {
  // El almacenamiento está aislado por archivo, no por prueba, y el orden
  // importa: las llaves foráneas están en `NO ACTION`, así que lo que cuelga
  // de una cotización se va antes que ella, y los trámites después de las
  // líneas que los apuntan.
  await env.DB.prepare("DELETE FROM cotizacion_linea").run();
  await env.DB.prepare("DELETE FROM cotizacion_modulo").run();
  await env.DB.prepare("DELETE FROM cotizacion").run();
  await env.DB.prepare("DELETE FROM cliente").run();
  await env.DB.prepare("DELETE FROM tipo_proceso").run();
  await env.DB.prepare("DELETE FROM area").run();
  await env.DB.prepare("DELETE FROM tenant WHERE id <> ?")
    .bind(TENANT_UNICO_ID)
    .run();

  clienteId = nuevoId();
  areaId = nuevoId();
  tramiteVisaId = nuevoId();
  tramiteDivorcioId = nuevoId();
  tramiteDeBajaId = nuevoId();

  const ahora = new Date().toISOString();

  await env.DB.batch([
    env.DB.prepare("INSERT INTO tenant (id, nombre) VALUES (?, ?)").bind(
      OTRO_TENANT_ID,
      "Otro bufete",
    ),
    env.DB.prepare(
      "INSERT INTO cliente (id, tenant_id, nombre, telefono, creado_por," +
        " creado_en) VALUES (?, ?, ?, ?, ?, ?)",
    ).bind(
      clienteId,
      TENANT_UNICO_ID,
      "Panamá Trading",
      "+507 6123-4567",
      autorId,
      ahora,
    ),
    env.DB.prepare(
      "INSERT INTO area (id, tenant_id, nombre, activo) VALUES (?, ?, ?, 1)",
    ).bind(areaId, TENANT_UNICO_ID, "Familia"),
    env.DB.prepare(
      "INSERT INTO tipo_proceso (id, tenant_id, area_id, nombre, activo)" +
        " VALUES (?, ?, ?, ?, 1)",
    ).bind(tramiteVisaId, TENANT_UNICO_ID, areaId, "Visa de trabajo"),
    env.DB.prepare(
      "INSERT INTO tipo_proceso (id, tenant_id, area_id, nombre, activo)" +
        " VALUES (?, ?, ?, ?, 1)",
    ).bind(
      tramiteDivorcioId,
      TENANT_UNICO_ID,
      areaId,
      "Divorcio de mutuo acuerdo",
    ),
    // El que el bufete dio de baja. Está en **todas** las corridas y no sólo
    // en las pruebas que lo nombran: así la aserción de
    // `tiposDeProcesoOfrecidos` de más abajo pasa a significar «exactamente
    // los vigentes» en vez de «los dos que sembré».
    env.DB.prepare(
      "INSERT INTO tipo_proceso (id, tenant_id, area_id, nombre, activo)" +
        " VALUES (?, ?, ?, ?, 0)",
    ).bind(
      tramiteDeBajaId,
      TENANT_UNICO_ID,
      areaId,
      "Permiso que ya no se tramita",
    ),
  ]);
});

/* ==========================================================================
   El prompt
   ========================================================================== */

function tramites(): TramiteOfrecido[] {
  return [
    { id: tramiteVisaId, nombre: "Visa de trabajo", area: "Migración" },
    { id: tramiteDivorcioId, nombre: "Divorcio de mutuo acuerdo", area: null },
  ];
}

describe("el prompt del generador", () => {
  it("nombra los seis tipos de módulo, y los saca del catálogo", () => {
    const { instrucciones } = encargoAlModelo(tramites());

    for (const entrada of CATALOGO_DE_MODULOS) {
      expect(
        instrucciones,
        `el prompt no ofrece el tipo de módulo «${entrada.tipo}», así que el` +
          " modelo no lo puede proponer y la pantalla sí lo ofrece",
      ).toContain(entrada.tipo);
    }
  });

  it("nombra las dos clases de línea, y las saca del catálogo", () => {
    const { instrucciones } = encargoAlModelo(tramites());

    for (const entrada of CATALOGO_DE_CLASES) {
      expect(instrucciones).toContain(entrada.clase);
    }
  });

  it("pide JSON pelado, sin cercas", () => {
    const { instrucciones } = encargoAlModelo(tramites());

    // El esquema rechaza un bloque con cercas a propósito, y no lo
    // desenvuelve: esa tolerancia convertiría un defecto del prompt en una
    // rareza intermitente. Así que el prompt tiene que decirlo.
    expect(instrucciones.toLowerCase()).toContain("```");
  });

  it("le prohíbe sumar, con todas las letras", () => {
    const { instrucciones } = encargoAlModelo(tramites());

    expect(instrucciones.toLowerCase()).toContain("total");
  });

  /**
   * **La que vigila el círculo de T-7.** Lo ofrecido en el prompt y lo
   * declarado como ofrecido salen del mismo arreglo, en la misma llamada: no
   * hay forma de que uno diga una cosa y el otro otra.
   */
  it("declara como ofrecidos exactamente los trámites que puso en el texto", () => {
    const encargo = encargoAlModelo(tramites());

    expect(encargo.tiposDeProcesoOfrecidos).toEqual([
      tramiteVisaId,
      tramiteDivorcioId,
    ]);

    for (const tramite of tramites()) {
      expect(encargo.instrucciones).toContain(tramite.id);
      expect(encargo.instrucciones).toContain(tramite.nombre);
    }
  });

  it("sin trámites en el catálogo, no ofrece ninguno", () => {
    const encargo = encargoAlModelo([]);

    expect(encargo.tiposDeProcesoOfrecidos).toEqual([]);
    // Falla cerrada: sin catálogo declarado, ninguna línea puede traer
    // trámite. Es la misma precedencia que `acceso_no_configurado`.
    expect(encargo.instrucciones).toContain("ningún trámite");
  });
});

/* ==========================================================================
   La descripción
   ========================================================================== */

describe("la descripción del encargo", () => {
  it("una descripción en blanco se rechaza, y no llega al modelo", async () => {
    const falso = modeloQueDevuelve({
      ok: true,
      valor: { modulos: [], lineas: [] },
    });

    const normalizada = normalizarDescripcion({ descripcion: "   \n  " });
    expect(normalizada.ok).toBe(false);

    const respuesta = await generar(
      { clienteId, descripcion: "   \n  " },
      { modelo: falso.modelo },
    );

    expect(respuesta.status).toBe(422);
    const cuerpo = (await respuesta.json()) as {
      error?: string;
      fallas?: { campo: string; motivo: string }[];
    };
    expect(cuerpo.error).toBe("datos_invalidos");
    expect(cuerpo.fallas?.map((falla) => falla.motivo)).toContain(
      "descripcion_requerida",
    );

    // **Y no se llamó al modelo.** Falla cerrada antes de gastar una corrida:
    // lo que no se puede hacer no se intenta, igual que
    // `modelo_no_configurado` antes del transporte.
    expect(falso.peticiones).toHaveLength(0);
    expect(await cuantasCotizaciones()).toBe(0);
  });

  it("la descripción se recorta, y lo que queda es lo que viaja", async () => {
    const falso = modeloQueDevuelve({
      ok: true,
      valor: {
        modulos: [{ tipo: "alcance", contenido: "Lo que se va a hacer." }],
        lineas: [],
      },
    });

    const respuesta = await generar(
      { clienteId, descripcion: `  ${DESCRIPCION}  ` },
      { modelo: falso.modelo },
    );

    expect(respuesta.status).toBe(201);
    expect(falso.peticiones).toHaveLength(1);
    expect(falso.peticiones[0].entrada).toBe(DESCRIPCION);
  });
});

/* ==========================================================================
   El borrador que sale
   ========================================================================== */

const PROPUESTA_COMPLETA = JSON.stringify({
  modulos: [
    { tipo: "antecedentes", contenido: "Vino por un divorcio." },
    { tipo: "alcance", contenido: "Redacción y presentación del convenio." },
    { tipo: "exclusiones", contenido: "No incluye la partición de bienes." },
  ],
  lineas: [
    {
      clase: "honorario",
      concepto: "Honorarios del divorcio de mutuo acuerdo",
      monto: 150_000,
      tipoProcesoId: null,
    },
    {
      clase: "gasto_estimado",
      concepto: "Timbres y copias",
      monto: 2_550,
      tipoProcesoId: null,
    },
  ],
});

describe("generar un borrador desde una descripción", () => {
  it("nace un borrador con su código, sus módulos y sus líneas", async () => {
    const falso = modeloQueEscribe(PROPUESTA_COMPLETA);

    const respuesta = await generar(
      { clienteId, descripcion: DESCRIPCION },
      { modelo: falso.modelo },
    );

    expect(respuesta.status, await respuesta.clone().text()).toBe(201);
    expect(respuesta.headers.get("location")).not.toBeNull();

    const cotizacion = await cotizacionDe(respuesta);

    // Un borrador, como cualquier otro: después se edita a mano.
    expect(cotizacion.estado).toBe("borrador");
    expect(cotizacion.clienteId).toBe(clienteId);
    // El código lo pone el servidor y no el modelo.
    expect(cotizacion.codigo).toBe(
      `COT-${cotizacion.fecha.slice(0, 4)}-0001`,
    );

    const modulos = await modulosDe(cotizacion.id);
    expect(modulos.map((modulo) => modulo.tipo)).toEqual([
      "antecedentes",
      "alcance",
      "exclusiones",
    ]);
    // El orden lo asigna el servidor como posición de la lista, nunca un
    // número del modelo: `DatosDeModulo` ni siquiera tiene dónde traerlo.
    expect(modulos.map((modulo) => modulo.orden)).toEqual([0, 1, 2]);

    const { lineas } = await lineasDe(cotizacion.id);
    expect(lineas.map((linea) => linea.concepto)).toEqual([
      "Honorarios del divorcio de mutuo acuerdo",
      "Timbres y copias",
    ]);
    expect(lineas.map((linea) => linea.orden)).toEqual([0, 1]);
  });

  /**
   * **La aritmética, del lado del sistema.** El valor esperado no se calcula
   * con `totalesDe` sobre la respuesta —eso sería probar la función con la
   * función, que es la restricción 6 de la tajada— sino con los centavos que
   * la propuesta trae, sumados a mano acá.
   */
  it("los totales los calcula el sistema sobre las líneas guardadas", async () => {
    const falso = modeloQueEscribe(PROPUESTA_COMPLETA);

    const respuesta = await generar(
      { clienteId, descripcion: DESCRIPCION },
      { modelo: falso.modelo },
    );
    const cotizacion = await cotizacionDe(respuesta);

    const { totales } = await lineasDe(cotizacion.id);

    expect(totales).toEqual({
      honorarios: 150_000,
      gastosEstimados: 2_550,
      total: 152_550,
    });
  });

  /**
   * **La mitad que cierra el círculo de T-7.** Sin
   * `tiposDeProcesoOfrecidos`, el esquema rechaza todo trámite y ninguna
   * línea generada puede abrir un proceso al ganarse la cotización.
   */
  it("una línea puede traer un trámite del catálogo del bufete", async () => {
    const falso = modeloQueEscribe(
      JSON.stringify({
        modulos: [{ tipo: "alcance", contenido: "El divorcio entero." }],
        lineas: [
          {
            clase: "honorario",
            concepto: "Divorcio de mutuo acuerdo",
            monto: 120_000,
            tipoProcesoId: tramiteDivorcioId,
          },
        ],
      }),
    );

    const respuesta = await generar(
      { clienteId, descripcion: DESCRIPCION },
      { modelo: falso.modelo },
    );

    expect(respuesta.status, await respuesta.clone().text()).toBe(201);
    const cotizacion = await cotizacionDe(respuesta);

    const { lineas } = await lineasDe(cotizacion.id);
    expect(
      lineas[0].tipoProcesoId,
      "la línea perdió su trámite: al ganarse, esta cotización no abriría" +
        " ningún proceso y nadie se enteraría",
    ).toBe(tramiteDivorcioId);
  });

  it("el prompt le ofrece al modelo los trámites de este bufete", async () => {
    const falso = modeloQueEscribe(PROPUESTA_COMPLETA);

    await generar(
      { clienteId, descripcion: DESCRIPCION },
      { modelo: falso.modelo },
    );

    expect(falso.peticiones).toHaveLength(1);
    const enviada = falso.peticiones[0];

    // **Exactamente** los dos vigentes, y no «al menos»: el bufete tiene
    // sembrado además uno dado de baja, así que esta igualdad también dice
    // que el inactivo no se coló.
    expect([...(enviada.tiposDeProcesoOfrecidos ?? [])].sort()).toEqual(
      [tramiteVisaId, tramiteDivorcioId].sort(),
    );
    expect(enviada.instrucciones).toContain("Divorcio de mutuo acuerdo");
  });

  it("el vencimiento, si viene, es el del borrador", async () => {
    const falso = modeloQueEscribe(PROPUESTA_COMPLETA);
    const manana = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const respuesta = await generar(
      { clienteId, descripcion: DESCRIPCION, venceEn: manana },
      { modelo: falso.modelo },
    );

    expect(respuesta.status).toBe(201);
    expect((await cotizacionDe(respuesta)).venceEn).toBe(manana);
  });
});

/* ==========================================================================
   El trámite dado de baja

   Dar de baja un tipo de proceso es decir que **no se abren más**. Ofrecerlo
   en el prompt es la misma clase de defecto que ofrecerlo en un desplegable,
   que es lo que la unidad B de T-2 ya había cerrado del otro lado
   (`tramitesSeleccionables`, probada en `test/lineas-ui.spec.ts`), y acá
   cuesta más caro: nadie lo ve. El modelo lo pondría en una línea, la línea
   pasaría la llave foránea y el disparador de tenencia porque la fila
   existe, y al ganarse la cotización **T-7 abriría un proceso de un tipo que
   el bufete dejó de tramitar**, sin que nada lo frene.

   Se afirma en los dos caminos —el texto y la lista declarada— y eso no es
   una guarda contada dos veces: salen del mismo arreglo, pero por caminos
   distintos. El texto lo arma `comoSeOfrece` y la lista la arma un `map`
   sobre los ids, así que un filtro que se aplicara a uno y no al otro
   pasaría la mitad de estas pruebas. El filtro es uno solo y está antes de
   los dos, que es justamente lo que estas dos aserciones juntas comprueban.
   ========================================================================== */

describe("un trámite dado de baja no se ofrece", () => {
  it("no aparece en el texto del prompt, ni por id ni por nombre", async () => {
    const falso = modeloQueEscribe(PROPUESTA_COMPLETA);

    await generar(
      { clienteId, descripcion: DESCRIPCION },
      { modelo: falso.modelo },
    );

    const { instrucciones } = falso.peticiones[0];

    expect(
      instrucciones,
      "el prompt nombra un trámite que el bufete dejó de tramitar: el modelo" +
        " lo va a usar, y al ganarse la cotización se abriría un proceso de" +
        " un tipo que ya no se usa",
    ).not.toContain(tramiteDeBajaId);
    expect(instrucciones).not.toContain("Permiso que ya no se tramita");

    // El control de hostilidad, y no es ceremonia: un prompt que no nombra
    // **ningún** trámite pasaría las dos aserciones de arriba sin medir el
    // filtro. Lo que hay que comprobar es que el vigente sí está.
    expect(
      instrucciones,
      "el prompt no nombra ningún trámite: esto es la prueba rota, no el" +
        " filtro funcionando",
    ).toContain(tramiteVisaId);
  });

  it("no entra en `tiposDeProcesoOfrecidos`", async () => {
    const falso = modeloQueEscribe(PROPUESTA_COMPLETA);

    await generar(
      { clienteId, descripcion: DESCRIPCION },
      { modelo: falso.modelo },
    );

    const ofrecidos = falso.peticiones[0].tiposDeProcesoOfrecidos ?? [];

    expect(ofrecidos).not.toContain(tramiteDeBajaId);
    // El mismo control de hostilidad: una lista vacía no prueba el filtro.
    expect(ofrecidos).toContain(tramiteVisaId);
  });

  /**
   * El cierre del círculo, por rechazo.
   *
   * Las dos de arriba miden lo que sale hacia el modelo. Ésta mide lo que
   * pasa cuando el modelo lo nombra igual —porque lo inventó, o porque lo
   * vio en una corrida anterior—: el esquema de T-8 lo rechaza por no estar
   * ofrecido, y **no queda ninguna fila**. Es la mitad que hace que el
   * filtro no dependa de que el modelo obedezca.
   */
  it("y si el modelo lo nombra igual, la propuesta se descarta entera", async () => {
    const falso = modeloQueEscribe(
      JSON.stringify({
        modulos: [{ tipo: "alcance", contenido: "El trámite de siempre." }],
        lineas: [
          {
            clase: "honorario",
            concepto: "Permiso que ya no se tramita",
            monto: 90_000,
            tipoProcesoId: tramiteDeBajaId,
          },
        ],
      }),
    );

    const respuesta = await generar(
      { clienteId, descripcion: DESCRIPCION },
      { modelo: falso.modelo },
    );

    expect(respuesta.status).toBe(502);
    const cuerpo = (await respuesta.json()) as { motivo?: string };
    expect(cuerpo.motivo).toBe("salida_rechazada");

    expect(
      await cuantasCotizaciones(),
      "quedó una cotización con una línea que abriría un proceso de un tipo" +
        " dado de baja",
    ).toBe(0);
  });
});

/* ==========================================================================
   Lo que el modelo no puede hacer
   ========================================================================== */

describe("la barandilla: el modelo no suma", () => {
  /**
   * **La prueba de la barandilla.** El modelo devuelve un total, como haría
   * cualquier modelo al que no se lo hayan prohibido bien, y la propuesta
   * entera se rechaza: no hay rama que «ignore el campo de más», porque un
   * campo ignorado en silencio es exactamente un campo del que nadie se
   * entera.
   */
  it("un total devuelto por el modelo tira abajo la propuesta entera", async () => {
    const falso = modeloQueEscribe(
      JSON.stringify({
        modulos: [{ tipo: "alcance", contenido: "El divorcio entero." }],
        lineas: [
          {
            clase: "honorario",
            concepto: "Honorarios",
            monto: 150_000,
            tipoProcesoId: null,
          },
        ],
        total: 150_000,
      }),
    );

    const respuesta = await generar(
      { clienteId, descripcion: DESCRIPCION },
      { modelo: falso.modelo },
    );

    expect(respuesta.status).toBe(502);
    const cuerpo = (await respuesta.json()) as {
      error?: string;
      motivo?: string;
    };
    expect(cuerpo.error).toBe("generacion_fallida");
    expect(cuerpo.motivo).toBe("salida_rechazada");

    // Y no quedó nada: el total no entró porque no entró la propuesta.
    expect(await cuantasCotizaciones()).toBe(0);
  });

  it("un subtotal por línea tampoco entra", async () => {
    const falso = modeloQueEscribe(
      JSON.stringify({
        modulos: [{ tipo: "alcance", contenido: "El divorcio entero." }],
        lineas: [
          {
            clase: "honorario",
            concepto: "Honorarios",
            monto: 150_000,
            tipoProcesoId: null,
            subtotal: 150_000,
          },
        ],
      }),
    );

    const respuesta = await generar(
      { clienteId, descripcion: DESCRIPCION },
      { modelo: falso.modelo },
    );

    expect(respuesta.status).toBe(502);
    expect(await cuantasCotizaciones()).toBe(0);
  });

  it("un tipo de módulo inventado tira abajo la propuesta entera", async () => {
    const falso = modeloQueEscribe(
      JSON.stringify({
        modulos: [
          { tipo: "resumen_ejecutivo", contenido: "Lo que el modelo quiso." },
        ],
        lineas: [],
      }),
    );

    const respuesta = await generar(
      { clienteId, descripcion: DESCRIPCION },
      { modelo: falso.modelo },
    );

    expect(respuesta.status).toBe(502);
    expect(await cuantasCotizaciones()).toBe(0);
  });

  /**
   * El trámite que el bufete no ofreció. Es el caso que
   * `tiposDeProcesoOfrecidos` existe para cerrar: un identificador que el
   * modelo compuso solo es la definición de un dato inventado, y no hay
   * catálogo en código que lo pueda cerrar porque la tabla es de este
   * bufete.
   */
  it("un trámite que no está en el catálogo del bufete no entra", async () => {
    const inventado = nuevoId();
    const falso = modeloQueEscribe(
      JSON.stringify({
        modulos: [{ tipo: "alcance", contenido: "El divorcio entero." }],
        lineas: [
          {
            clase: "honorario",
            concepto: "Honorarios",
            monto: 150_000,
            tipoProcesoId: inventado,
          },
        ],
      }),
    );

    const respuesta = await generar(
      { clienteId, descripcion: DESCRIPCION },
      { modelo: falso.modelo },
    );

    expect(respuesta.status).toBe(502);
    expect(await cuantasCotizaciones()).toBe(0);
  });

  it("una propuesta vacía no abre un borrador en blanco", async () => {
    const falso = modeloQueEscribe(JSON.stringify({ modulos: [], lineas: [] }));

    const respuesta = await generar(
      { clienteId, descripcion: DESCRIPCION },
      { modelo: falso.modelo },
    );

    expect(respuesta.status).toBe(502);
    expect(await cuantasCotizaciones()).toBe(0);
  });

  it("un bloque con cercas se rechaza: no se desenvuelve nada", async () => {
    const falso = modeloQueEscribe(
      "```json\n" + PROPUESTA_COMPLETA + "\n```",
    );

    const respuesta = await generar(
      { clienteId, descripcion: DESCRIPCION },
      { modelo: falso.modelo },
    );

    expect(respuesta.status).toBe(502);
    const cuerpo = (await respuesta.json()) as { motivo?: string };
    expect(cuerpo.motivo).toBe("salida_rechazada");
    expect(await cuantasCotizaciones()).toBe(0);
  });
});

/* ==========================================================================
   Los motivos de falla, uno por uno

   T-8 distingue siete motivos y cuatro de ellos son los que el bufete va a
   ver de verdad. Que la distinción llegue hasta la pantalla es la mitad del
   trabajo de T-8 que esta tarea podía desperdiciar.
   ========================================================================== */

const MOTIVOS = [
  "proveedor_no_disponible",
  "respuesta_ininteligible",
  "respuesta_truncada",
  "respuesta_rechazada_por_el_proveedor",
  "modelo_no_configurado",
  "proveedor_desconocido",
] as const;

describe("cuando el modelo falla", () => {
  for (const motivo of MOTIVOS) {
    it(`«${motivo}» llega entero a quien llamó, y no queda nada escrito`, async () => {
      const falso = modeloQueDevuelve({
        ok: false,
        falla: { motivo, detalle: "para el operador, no para el cliente" },
      });

      const respuesta = await generar(
        { clienteId, descripcion: DESCRIPCION },
        { modelo: falso.modelo },
      );

      expect(respuesta.status).toBe(502);
      const cuerpo = (await respuesta.json()) as {
        error?: string;
        motivo?: string;
        detalle?: string;
      };

      expect(cuerpo.error).toBe("generacion_fallida");
      expect(
        cuerpo.motivo,
        "los cuatro motivos aplastados en uno desperdician el trabajo de T-8",
      ).toBe(motivo);

      // El detalle es para el operador y **no viaja**: puede nombrar la
      // configuración del despliegue, y quien mira la pantalla no tiene nada
      // que hacer con eso.
      expect(cuerpo.detalle).toBeUndefined();

      expect(await cuantasCotizaciones()).toBe(0);
    });
  }

  it("los seis motivos son distintos entre sí", () => {
    // Si dos motivos colapsaran en el mismo valor, el bucle de arriba
    // pasaría igual y no estaría midiendo seis cosas sino menos.
    expect(new Set(MOTIVOS).size).toBe(MOTIVOS.length);
  });
});

/* ==========================================================================
   La atomicidad
   ========================================================================== */

/**
 * Un catálogo que ofrece un trámite que **no existe en la base**.
 *
 * Es la única forma de provocar que una línea no entre con una propuesta que
 * el esquema sí acepta: el identificador está entre los ofrecidos, así que
 * `validarPropuesta` lo deja pasar, y lo frena el disparador de tenencia de
 * `migrations/0004_cotizaciones.sql` cuando el `INSERT` llega a la base.
 *
 * No se atrapa, y por eso la prueba espera que la petición se levante: la
 * guarda se cuenta y nunca se atrapa (restricción 2 de la tajada). Lo que se
 * afirma después es lo que importa: **no quedó media cotización**.
 */
function catalogoQueMiente(fantasma: string): ServicioDeCatalogos {
  const real = catalogosSobreD1(
    baseSobreD1(env.DB, TENANT_UNICO_ID, "no-se-usa"),
  );

  const inventado: TipoProceso = {
    id: fantasma,
    areaId: "ninguna",
    areaNombre: null,
    nombre: "Trámite que no existe",
    descripcion: null,
    activo: true,
  };

  return {
    ...real,
    listarTiposProceso: () => Promise.resolve([inventado]),
  };
}

describe("la generación y el alta son una sola transacción", () => {
  it("si una línea no entra, no queda ninguna cotización", async () => {
    const fantasma = nuevoId();
    const falso = modeloQueEscribe(
      JSON.stringify({
        modulos: [{ tipo: "alcance", contenido: "El divorcio entero." }],
        lineas: [
          {
            clase: "honorario",
            concepto: "Honorarios",
            monto: 150_000,
            tipoProcesoId: fantasma,
          },
        ],
      }),
    );

    await expect(
      generar(
        { clienteId, descripcion: DESCRIPCION },
        { modelo: falso.modelo, catalogos: catalogoQueMiente(fantasma) },
      ),
      "la guarda de la base se cuenta y nunca se atrapa: tiene que salir",
    ).rejects.toThrow();

    expect(
      await cuantasCotizaciones(),
      "quedó una cotización sin sus líneas: el alta y el contenido no" +
        " viajaron en la misma transacción",
    ).toBe(0);
  });

  it("un cliente que no es de este bufete no escribe nada", async () => {
    const falso = modeloQueEscribe(PROPUESTA_COMPLETA);

    const respuesta = await generar(
      { clienteId: nuevoId(), descripcion: DESCRIPCION },
      { modelo: falso.modelo },
    );

    expect(respuesta.status).toBe(422);
    expect(await cuantasCotizaciones()).toBe(0);
  });
});

/* ==========================================================================
   El ruteo
   ========================================================================== */

describe("la dirección del generador", () => {
  it("sólo contesta POST", async () => {
    const respuesta = await comoAutor(peticion("/api/cotizaciones/generar"));

    expect(respuesta.status).toBe(405);
    expect(respuesta.headers.get("allow")).toBe("POST");
  });

  it("sin identidad no llega al modelo", async () => {
    const falso = modeloQueDevuelve({
      ok: true,
      valor: { modulos: [], lineas: [] },
    });

    const respuesta = await manejar(
      conCuerpo("/api/cotizaciones/generar", "POST", {
        clienteId,
        descripcion: DESCRIPCION,
      }),
      entorno(),
      { correoDeDesarrollo: () => null, modelo: falso.modelo },
    );

    expect(respuesta.status).toBe(403);
    expect(falso.peticiones).toHaveLength(0);
  });

  it("«generar» no se confunde con el detalle de una cotización", async () => {
    // El `GET` de la colección sigue funcionando, y `generar` no es un
    // identificador: con `POST` no cae en el `PUT` de la edición ni al revés.
    const respuesta = await comoAutor(
      conCuerpo("/api/cotizaciones/generar", "PUT", { clienteId }),
    );

    expect(respuesta.status).toBe(405);
  });
});

/* ==========================================================================
   Un contrapeso sobre la suma

   `totalesDe` es la única aritmética del sistema, y esta prueba la ejerce
   sobre los mismos centavos que la propuesta llevaba, para que una
   discrepancia entre lo que el generador guardó y lo que la suma da salga
   acá y no en una cotización emitida.
   ========================================================================== */

describe("la suma del sistema y la del generador son la misma", () => {
  it("los totales de la respuesta coinciden con `totalesDe` sobre lo guardado", async () => {
    const falso = modeloQueEscribe(PROPUESTA_COMPLETA);

    const respuesta = await generar(
      { clienteId, descripcion: DESCRIPCION },
      { modelo: falso.modelo },
    );
    const cotizacion = await cotizacionDe(respuesta);

    const { lineas, totales } = await lineasDe(cotizacion.id);

    expect(
      totales,
      "los totales que viajan no son los de las líneas que viajan con ellos",
    ).toEqual(
      totalesDe(
        lineas.map((linea) => ({
          clase: linea.clase as "honorario" | "gasto_estimado",
          monto: linea.monto,
        })),
      ),
    );
  });
});
