/**
 * Los módulos de prosa de una cotización (`odd/tasks/cotizaciones.md`, T-2 C).
 *
 * El esquema de T-1 ya rechaza en la base el tipo fuera del catálogo, el
 * orden repetido dentro de una cotización y la arista de tenencia entre el
 * módulo y su cotización. **Esta suite no vuelve a probar nada de eso**
 * —`test/esquema-cotizaciones.spec.ts` es su dueño— salvo el índice único de
 * `orden`, que acá se prueba por otra razón: no para afirmar que la base lo
 * sostiene, sino para demostrar que el reordenamiento **no lo viola ni por un
 * instante**, que es la trampa entera de esta unidad.
 *
 * Lo que sí se prueba acá:
 *
 *  - **Las dos mitades acopladas del catálogo.** El `CHECK` de
 *    `cotizacion_modulo.tipo` y el registro tipado de
 *    `worker/cotizaciones/modulos.ts` tienen que nombrar exactamente lo
 *    mismo. Es la misma prueba que `test/bitacora-api.spec.ts` ya hace con
 *    el vocabulario de la bitácora, y por el mismo motivo: si se separan, el
 *    sistema rechaza un tipo que la pantalla ofrece.
 *  - **La forma de la entrada**, con la lista entera de fallas.
 *  - **Que sólo se escribe sobre un borrador**, por la ruta y por el puerto.
 *    Las dos, porque T-4 y T-5 van a llamar al puerto directo.
 *  - **La tenencia, en cada consulta nueva.** I-8 (`docs/diseno.md` §5).
 *
 * Los contrapesos releen **por la API**: un `POST` que contesta 201 y no
 * guardó nada pasa cualquier aserción hecha sobre su propio eco.
 */
import { env } from "cloudflare:workers";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { ACCIONES_POR_ENTIDAD } from "../worker/bitacora/vocabulario";
import {
  TIPOS_DE_MODULO,
  normalizarModulo,
  normalizarOrdenDeModulos,
} from "../worker/cotizaciones/modulos";
import { cotizacionesSobreD1 } from "../worker/cotizaciones/repositorio";
import { baseSobreD1, type BaseDeDatos } from "../worker/db/base";
import { TENANT_UNICO_ID, nuevoId } from "../worker/db/ids";
import { manejar } from "../worker/index";

// ---------------------------------------------------------------------------
// Las dos mitades acopladas del catálogo
// ---------------------------------------------------------------------------

describe("el catálogo de la base y el del código dicen lo mismo", () => {
  /** El `CREATE TABLE` tal como quedó en la base, con sus `CHECK`. */
  async function definicionDeModulo(): Promise<string> {
    const fila = await env.DB.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table'" +
        " AND name = 'cotizacion_modulo'",
    ).first<{ sql: string }>();

    expect(fila, "la tabla `cotizacion_modulo` tiene que existir").not.toBeNull();
    return fila?.sql ?? "";
  }

  it("el CHECK de tipo nombra exactamente los tipos del registro", async () => {
    // Las dos mitades existen a propósito y hacen cosas distintas: el `CHECK`
    // es el que sobrevive a un script de importación (§5), y el registro
    // tipado es el que le da rótulo y orden a cada tipo y el que impide que
    // el generador de T-9 invente uno. Lo que no puede pasar es que se
    // separen sin que nadie se entere: la pantalla ofrecería un tipo que la
    // base rechaza con un 500 que nadie puede leer.
    const definicion = await definicionDeModulo();

    const clausula = /tipo\s+TEXT\s+NOT\s+NULL[\s\S]*?IN\s*\(([^)]*)\)/i.exec(
      definicion,
    );
    expect(clausula, "el CHECK de `tipo` tiene que estar").not.toBeNull();

    const enLaBase = [...(clausula?.[1] ?? "").matchAll(/'([^']*)'/g)].map(
      (coincidencia) => coincidencia[1],
    );

    expect([...enLaBase].sort()).toEqual([...TIPOS_DE_MODULO].sort());
  });

  it("no se repite ninguna clave en la lista", () => {
    // El orden en que se sugieren **es** el orden del arreglo: no hay una
    // columna `orden` en la lista porque sería un segundo lugar donde decir
    // lo mismo, y el día que los dos no coincidan gana el que alguien mire
    // primero. Una clave repetida son dos entradas indistinguibles.
    expect(new Set(TIPOS_DE_MODULO).size).toBe(TIPOS_DE_MODULO.length);
  });
});

// ---------------------------------------------------------------------------
// La red del compilador que T-3 perdió, y dónde quedó
// ---------------------------------------------------------------------------

/**
 * Las plantillas de módulo tal como las dejó `0016`.
 *
 * Se leen por SQL y no por `GET /api/plantillas-modulo`: lo que estas dos
 * pruebas enfrentan es la **fila**, no la respuesta. Pasar por la ruta metería
 * en el medio el adaptador que resuelve el rótulo vigente, y entonces una
 * prueba sobre el preset estaría mirando el `COALESCE`.
 */
async function plantillasSembradas(): Promise<
  { clave: string; rotulo_oficial: string | null }[]
> {
  const { results } = await env.DB.prepare(
    "SELECT clave, rotulo_oficial FROM modulo_plantilla ORDER BY orden, clave",
  ).all<{ clave: string; rotulo_oficial: string | null }>();

  return results;
}

describe("las claves de la lista y las de modulo_plantilla dicen lo mismo", () => {
  /*
   * **Esto es `TiposSinRotulo` mudado de lugar** (T-3 de
   * `odd/tasks/plantillas-de-modulo.md`).
   *
   * Hasta T-2 la red era un tipo: `Exclude<TipoDeModulo, …>` sobre un catálogo
   * que tenía los rótulos adentro, y lo que probaba era que ningún tipo se
   * quedara sin rótulo. Eso ya no se puede probar con un tipo, porque el
   * rótulo es una fila y el compilador no lee filas. Así que la red cambia de
   * mecanismo y **no desaparece**: lo que se compara es la lista contra las
   * claves sembradas, en los dos sentidos, que es la misma forma que la prueba
   * del `CHECK` de arriba ya usaba.
   *
   * Los dos sentidos son dos defectos distintos y por eso son dos pruebas:
   *
   *  - Una clave de la lista sin fila es un módulo que el editor ofrece y para
   *    el que no hay rótulo: la pantalla dibujaría la clave cruda.
   *  - Una fila sin clave en la lista es una plantilla que el abogado puede
   *    editar en `/catalogos/modulos` y que ningún módulo puede usar, porque
   *    el `CHECK` de `0004` la rechaza. Trabajo que no sirve de nada.
   *
   * Y la pertenencia a la unión `TipoDeModulo` sigue siendo cosa del
   * compilador, en `TiposFueraDeLaLista`: eso nunca tuvo que ver con el
   * rótulo.
   */

  it("cada clave de la lista tiene su plantilla sembrada", async () => {
    const enLaBase = (await plantillasSembradas()).map((una) => una.clave);

    for (const clave of TIPOS_DE_MODULO) {
      expect(enLaBase, `«${clave}» no tiene fila en modulo_plantilla`).toContain(
        clave,
      );
    }
  });

  it("cada plantilla sembrada tiene su clave en la lista", async () => {
    const enLaBase = (await plantillasSembradas()).map((una) => una.clave);

    for (const clave of enLaBase) {
      expect(
        [...TIPOS_DE_MODULO] as string[],
        `la plantilla «${clave}» no es una clave que un módulo pueda usar`,
      ).toContain(clave);
    }
  });

  it("el orden de la siembra es el orden sugerido de la lista", async () => {
    // `0016` sembró `orden` 0..5 en el mismo orden de lectura de una
    // propuesta, y el editor dibuja su desplegable con ese `ORDER BY`. Si los
    // dos se separan, el orden que la lista documenta deja de ser el que se
    // ve, y lo que se vería es el de la base: la lista pasaría a estar
    // mintiendo en un comentario.
    const enLaBase = (await plantillasSembradas()).map((una) => una.clave);

    expect(enLaBase).toEqual([...TIPOS_DE_MODULO]);
  });
});

// ---------------------------------------------------------------------------
// Los verbos de los módulos cuelgan de la cotización
// ---------------------------------------------------------------------------

describe("los verbos de módulo están en el vocabulario de la cotización", () => {
  const VERBOS = [
    "modulo_agregado",
    "modulo_editado",
    "modulo_quitado",
    "modulos_reordenados",
  ];

  it("los cuatro son acciones de la cotización y de ninguna otra entidad", () => {
    // Un módulo no es una entidad propia: se lee dentro de su cotización, así
    // que su hecho es un hecho de la cotización. Es la misma regla que hace
    // que `nota_agregada` cuelgue del proceso.
    for (const verbo of VERBOS) {
      expect(
        [...ACCIONES_POR_ENTIDAD.cotizacion] as string[],
        `falta «${verbo}» en las acciones de la cotización`,
      ).toContain(verbo);
    }

    for (const [entidad, acciones] of Object.entries(ACCIONES_POR_ENTIDAD)) {
      if (entidad === "cotizacion") continue;

      for (const verbo of VERBOS) {
        expect(
          [...acciones] as string[],
          `«${verbo}» no es un hecho de ${entidad}`,
        ).not.toContain(verbo);
      }
    }
  });

  it("el CHECK de accion los admite", async () => {
    const fila = await env.DB.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'bitacora'",
    ).first<{ sql: string }>();

    for (const verbo of VERBOS) {
      expect(fila?.sql ?? "", `falta «${verbo}» en el CHECK`).toContain(
        `'${verbo}'`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// El andamio de la mitad que pasa por HTTP
// ---------------------------------------------------------------------------

const DOMINIO_DE_ACCESS = "https://bufete-de-prueba.cloudflareaccess.com";
const AUD = "aud-de-la-aplicacion-del-bufete";

const EMAIL_AUTOR = "itzel@bufete.test";

/** El tenant vecino. Existe solo para que la fuga sea expresable. */
const OTRO_TENANT_ID = "0a5a6e0a-9f1e-4a6e-9f03-3b6a2a0e1d77";

/**
 * La forma del módulo en el cable. Se declara acá, y no se importa del
 * contrato del Worker, a propósito: lo que esta prueba vigila es el JSON que
 * ve el navegador. Importando el tipo, renombrar un campo en el servidor
 * renombraría también la expectativa y el cambio de contrato pasaría mudo.
 */
interface ModuloEnElCable {
  id: string;
  tipo: string;
  orden: number;
  contenido: string;
}

interface FallaEnElCable {
  campo: string;
  motivo: string;
}

let autorId: string;
let autorAjenoId: string;
let clienteId: string;
let clienteAjenoId: string;
let cotizacionId: string;
let cotizacionAjenaId: string;
let moduloAjenoId: string;

function entorno(): Env {
  // Hermético, por la misma razón que en `test/acceso.spec.ts`: un
  // `.dev.vars` local con `ACCESO_DEV_EMAIL` no puede decidir qué identidad
  // observa la suite.
  return {
    ...env,
    ACCESO_TEAM_DOMAIN: DOMINIO_DE_ACCESS,
    ACCESO_AUD: AUD,
    ACCESO_DEV_EMAIL: undefined,
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

/** Una petición hecha por la identidad del bufete. */
function comoAutor(request: Request): Promise<Response> {
  return manejar(request, entorno(), { correoDeDesarrollo: () => EMAIL_AUTOR });
}

function rutaDeModulos(id = cotizacionId): string {
  return `/api/cotizaciones/${id}/modulos`;
}

async function modulosDe(respuesta: Response): Promise<ModuloEnElCable[]> {
  const cuerpo = (await respuesta.json()) as { modulos?: ModuloEnElCable[] };
  expect(cuerpo.modulos, "la respuesta no trae `modulos`").toBeDefined();
  return cuerpo.modulos ?? [];
}

async function fallasDe(respuesta: Response): Promise<FallaEnElCable[]> {
  const cuerpo = (await respuesta.json()) as {
    error?: string;
    fallas?: FallaEnElCable[];
  };
  expect(cuerpo.error).toBe("datos_invalidos");
  return cuerpo.fallas ?? [];
}

function motivos(fallas: readonly FallaEnElCable[]): string[] {
  return fallas.map((falla) => falla.motivo);
}

/** Relee por la API, que es la única lectura que prueba que algo se guardó. */
async function listar(id = cotizacionId): Promise<ModuloEnElCable[]> {
  const respuesta = await comoAutor(peticion(rutaDeModulos(id)));
  expect(respuesta.status).toBe(200);
  return modulosDe(respuesta);
}

/** El alta mínima, que es la que casi todas las pruebas necesitan antes. */
async function agregar(
  cuerpo: unknown = { tipo: "alcance", contenido: "Lo que se hace." },
): Promise<ModuloEnElCable[]> {
  const respuesta = await comoAutor(
    conCuerpo(rutaDeModulos(), "POST", cuerpo),
  );
  expect(respuesta.status, await respuesta.clone().text()).toBe(201);
  return modulosDe(respuesta);
}

/** Tres módulos, en un orden conocido: la base de las pruebas de orden. */
async function agregarTres(): Promise<ModuloEnElCable[]> {
  await agregar({ tipo: "antecedentes", contenido: "De dónde viene." });
  await agregar({ tipo: "alcance", contenido: "Qué se hace." });
  return agregar({ tipo: "exclusiones", contenido: "Qué no." });
}

/**
 * Emite la cotización **por SQL**, porque la ruta que lo hace es de T-4.
 *
 * El `snapshot` va junto con el estado y no es decoración: el `CHECK` de
 * coherencia de `0004` exige que una emitida lo tenga. Escribir sólo el
 * estado abortaría acá, y la prueba del 409 pasaría por el motivo
 * equivocado.
 */
async function emitir(id = cotizacionId): Promise<void> {
  await env.DB.prepare(
    "UPDATE cotizacion SET estado = 'emitida', snapshot = ? WHERE id = ?",
  )
    .bind("{}", id)
    .run();
}

/** Las acciones de bitácora de la cotización, de la más vieja a la más nueva. */
async function bitacoraDe(
  id = cotizacionId,
): Promise<{ accion: string; detalle: string | null }[]> {
  const { results } = await env.DB.prepare(
    "SELECT accion, detalle FROM bitacora WHERE entidad = 'cotizacion'" +
      " AND entidad_id = ? ORDER BY ocurrido_en, rowid",
  )
    .bind(id)
    .all<{ accion: string; detalle: string | null }>();

  return results;
}

/** Los `orden` guardados, tal cual, sin pasar por la API. */
async function ordenesGuardados(id = cotizacionId): Promise<number[]> {
  const { results } = await env.DB.prepare(
    "SELECT orden FROM cotizacion_modulo WHERE cotizacion_id = ? ORDER BY orden",
  )
    .bind(id)
    .all<{ orden: number }>();

  return results.map((fila) => fila.orden);
}

/**
 * La persona del bufete se crea **una sola vez**: `usuario` lleva
 * `UNIQUE (tenant_id, email)` desde T-2 y, desde T-10, con una entrada de
 * bitácora viva tampoco se puede borrar para volver a insertarla.
 */
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
  // El almacenamiento está aislado por archivo, no por prueba. El orden del
  // borrado es el de las llaves foráneas, que están en `NO ACTION`: los
  // módulos antes que las cotizaciones, y éstas antes que los clientes.
  // **Y sólo se borra lo que sigue en borrador.** Desde
  // `migrations/0006_emitir_y_congelar.sql`, las hijas de una cotización que
  // ya no es borrador no se pueden quitar (I-4), y la cotización tampoco se
  // puede borrar mientras tenga hijas colgando, porque la llave foránea está
  // en `NO ACTION`: una emitida con hijas es, a propósito, indeleble. Lo que
  // cada prueba deja emitido se queda, y por eso el código lleva pegado su
  // identificador — con uno fijo, `cotizacion_codigo_unico` rechazaría la
  // siembra de la prueba siguiente.
  await env.DB.prepare(
    "DELETE FROM cotizacion_modulo WHERE cotizacion_id IN" +
      " (SELECT id FROM cotizacion WHERE estado = 'borrador')",
  ).run();
  await env.DB.prepare("DELETE FROM cotizacion WHERE estado = 'borrador'").run();
  await env.DB.prepare(
    "DELETE FROM cliente WHERE id NOT IN (SELECT cliente_id FROM cotizacion)",
  ).run();
  await env.DB.prepare(
    "DELETE FROM usuario WHERE tenant_id <> ?" +
      " AND id NOT IN (SELECT creada_por FROM cotizacion)" +
      " AND id NOT IN (SELECT creado_por FROM cliente)",
  )
    .bind(TENANT_UNICO_ID)
    .run();
  await env.DB.prepare(
    "DELETE FROM tenant WHERE id <> ?" +
      " AND id NOT IN (SELECT tenant_id FROM cotizacion)" +
      " AND id NOT IN (SELECT tenant_id FROM cliente)" +
      " AND id NOT IN (SELECT tenant_id FROM usuario)",
  )
    .bind(TENANT_UNICO_ID)
    .run();

  clienteId = nuevoId();
  clienteAjenoId = nuevoId();
  cotizacionId = nuevoId();
  cotizacionAjenaId = nuevoId();
  autorAjenoId = nuevoId();
  moduloAjenoId = nuevoId();

  const ahora = new Date().toISOString();
  const anio = ahora.slice(0, 4);

  await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO tenant (id, nombre) VALUES (?, ?)").bind(
      OTRO_TENANT_ID,
      "Otro bufete",
    ),
    env.DB.prepare(
      "INSERT INTO usuario (id, tenant_id, nombre, email, activo)" +
        " VALUES (?, ?, ?, ?, 1)",
    ).bind(autorAjenoId, OTRO_TENANT_ID, "Ajena", "ajena@otro-bufete.test"),
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
      "INSERT INTO cliente (id, tenant_id, nombre, telefono, creado_por," +
        " creado_en) VALUES (?, ?, ?, ?, ?, ?)",
    ).bind(
      clienteAjenoId,
      OTRO_TENANT_ID,
      "Cliente del vecino",
      "+507 6000-0000",
      autorAjenoId,
      ahora,
    ),
    env.DB.prepare(
      "INSERT INTO cotizacion (id, tenant_id, cliente_id, codigo, estado," +
        " fecha, moneda, creada_por, creada_en)" +
        " VALUES (?, ?, ?, ?, 'borrador', ?, 'USD', ?, ?)",
    ).bind(
      cotizacionId,
      TENANT_UNICO_ID,
      clienteId,
      `COT-${anio}-${cotizacionId}`,
      ahora,
      autorId,
      ahora,
    ),
    // La cotización del vecino y su módulo: el objeto de las pruebas de fuga.
    env.DB.prepare(
      "INSERT INTO cotizacion (id, tenant_id, cliente_id, codigo, estado," +
        " fecha, moneda, creada_por, creada_en)" +
        " VALUES (?, ?, ?, ?, 'borrador', ?, 'USD', ?, ?)",
    ).bind(
      cotizacionAjenaId,
      OTRO_TENANT_ID,
      clienteAjenoId,
      `COT-${anio}-${cotizacionAjenaId}`,
      ahora,
      autorAjenoId,
      ahora,
    ),
    env.DB.prepare(
      "INSERT INTO cotizacion_modulo (id, tenant_id, cotizacion_id, tipo," +
        " orden, contenido) VALUES (?, ?, ?, 'alcance', 0, ?)",
    ).bind(
      moduloAjenoId,
      OTRO_TENANT_ID,
      cotizacionAjenaId,
      "El alcance del vecino.",
    ),
  ]);
});

// ---------------------------------------------------------------------------
// La forma de la entrada
// ---------------------------------------------------------------------------

describe("el alta rechaza lo que no es un módulo", () => {
  it("rechaza un módulo sin tipo", async () => {
    const respuesta = await comoAutor(
      conCuerpo(rutaDeModulos(), "POST", { contenido: "Algo." }),
    );

    expect(respuesta.status).toBe(422);
    expect(motivos(await fallasDe(respuesta))).toContain(
      "tipo_de_modulo_desconocido",
    );
    expect(await listar(), "no se guardó nada").toHaveLength(0);
  });

  it("rechaza un tipo que no está en el catálogo", async () => {
    // Es la barandilla de §8 vista desde el cable: el generador de T-9 no
    // puede inventar un tipo, y esta ruta es por dónde lo intentaría.
    const respuesta = await comoAutor(
      conCuerpo(rutaDeModulos(), "POST", {
        tipo: "garantias",
        contenido: "Algo.",
      }),
    );

    expect(respuesta.status).toBe(422);
    expect(motivos(await fallasDe(respuesta))).toContain(
      "tipo_de_modulo_desconocido",
    );
  });

  it("rechaza un contenido que es sólo espacios", async () => {
    const respuesta = await comoAutor(
      conCuerpo(rutaDeModulos(), "POST", {
        tipo: "alcance",
        contenido: "  \n\t ",
      }),
    );

    expect(respuesta.status).toBe(422);
    expect(motivos(await fallasDe(respuesta))).toContain("contenido_requerido");
  });

  it("devuelve las dos fallas juntas y no la primera", async () => {
    const respuesta = await comoAutor(
      conCuerpo(rutaDeModulos(), "POST", {}),
    );

    expect(respuesta.status).toBe(422);
    expect(motivos(await fallasDe(respuesta)).sort()).toEqual([
      "contenido_requerido",
      "tipo_de_modulo_desconocido",
    ]);
  });

  it("recorta el contenido antes de guardarlo", async () => {
    const [modulo] = await agregar({
      tipo: "alcance",
      contenido: "  Constitución de la sociedad.  ",
    });

    expect(modulo.contenido).toBe("Constitución de la sociedad.");
  });

  it("ignora un `orden` que llegue por el cuerpo", async () => {
    // El `orden` lo asigna el servidor, siempre. Si el cuerpo pudiera
    // imponerlo, dos módulos en la misma posición despertarían el índice
    // único con un 500 que nadie puede leer.
    await agregar({ tipo: "antecedentes", contenido: "Primero." });
    const modulos = await agregar({
      tipo: "alcance",
      contenido: "Segundo.",
      orden: 0,
    });

    expect(modulos.map((modulo) => modulo.orden)).toEqual([0, 1]);
    expect(modulos[1].contenido).toBe("Segundo.");
  });
});

// ---------------------------------------------------------------------------
// Agregar, editar y quitar
// ---------------------------------------------------------------------------

describe("los módulos de un borrador", () => {
  it("el primero nace en la posición 0 y el siguiente al final", async () => {
    const modulos = await agregarTres();

    expect(modulos.map((modulo) => modulo.orden)).toEqual([0, 1, 2]);
    expect(modulos.map((modulo) => modulo.tipo)).toEqual([
      "antecedentes",
      "alcance",
      "exclusiones",
    ]);
  });

  it("el alta contesta 201 y la lista queda guardada de verdad", async () => {
    const respuesta = await comoAutor(
      conCuerpo(rutaDeModulos(), "POST", {
        tipo: "clausulas",
        contenido: "Jurisdicción de Panamá.",
      }),
    );

    expect(respuesta.status).toBe(201);

    const releidos = await listar();
    expect(releidos).toHaveLength(1);
    expect(releidos[0].contenido).toBe("Jurisdicción de Panamá.");
  });

  it("editar cambia el tipo y el texto sin mover el orden", async () => {
    const modulos = await agregarTres();
    const delMedio = modulos[1];

    const respuesta = await comoAutor(
      conCuerpo(`${rutaDeModulos()}/${delMedio.id}`, "PUT", {
        tipo: "supuestos",
        contenido: "Sobre qué se apoya el precio.",
      }),
    );

    expect(respuesta.status).toBe(200);

    const releidos = await listar();
    expect(releidos[1].id, "la edición no puede cambiar el id").toBe(
      delMedio.id,
    );
    expect(releidos[1].tipo).toBe("supuestos");
    expect(releidos[1].orden).toBe(1);
    expect(releidos.map((modulo) => modulo.tipo)).toEqual([
      "antecedentes",
      "supuestos",
      "exclusiones",
    ]);
  });

  it("editar un módulo que no es de esta cotización da 404", async () => {
    await agregar();

    const respuesta = await comoAutor(
      conCuerpo(`${rutaDeModulos()}/${nuevoId()}`, "PUT", {
        tipo: "alcance",
        contenido: "Nada.",
      }),
    );

    expect(respuesta.status).toBe(404);
  });

  it("quitar saca el módulo y deja los demás en su orden relativo", async () => {
    const modulos = await agregarTres();

    const respuesta = await comoAutor(
      peticion(`${rutaDeModulos()}/${modulos[1].id}`, { method: "DELETE" }),
    );

    expect(respuesta.status).toBe(200);

    const releidos = await listar();
    expect(releidos.map((modulo) => modulo.tipo)).toEqual([
      "antecedentes",
      "exclusiones",
    ]);
  });

  it("quitar un módulo que no existe da 404", async () => {
    await agregar();

    const respuesta = await comoAutor(
      peticion(`${rutaDeModulos()}/${nuevoId()}`, { method: "DELETE" }),
    );

    expect(respuesta.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// El reordenamiento, que es donde está el índice único
// ---------------------------------------------------------------------------

describe("el reordenamiento no viola el índice único ni por un instante", () => {
  it("invierte el orden de tres módulos sin perder ningún id", async () => {
    // Es la prueba central de la unidad. Con una sola pasada de `UPDATE … SET
    // orden = ?`, la primera sentencia le pondría 2 a un módulo cuando el 2
    // todavía lo tiene otro: `cotizacion_modulo_orden_unico` aborta el
    // `batch` entero y esto sería un 500. Que conteste 200 es lo que
    // demuestra que el tramo pasa por un rango disjunto antes de aterrizar.
    const modulos = await agregarTres();
    const invertido = [modulos[2].id, modulos[1].id, modulos[0].id];

    const respuesta = await comoAutor(
      conCuerpo(rutaDeModulos(), "PUT", { orden: invertido }),
    );

    expect(respuesta.status, await respuesta.clone().text()).toBe(200);

    const releidos = await listar();
    expect(releidos.map((modulo) => modulo.id)).toEqual(invertido);
    expect(
      releidos.map((modulo) => modulo.tipo),
      "los ids sobreviven, así que el contenido viaja con ellos",
    ).toEqual(["exclusiones", "alcance", "antecedentes"]);
  });

  it("no deja ninguna posición del rango de paso en la base", async () => {
    // El rango de paso es negativo, y eso es lo que lo hace disjunto de todo
    // orden definitivo, que siempre es la posición en el arreglo. Si la
    // segunda pasada no corriera —o corriera a medias— quedarían órdenes
    // negativos guardados y la lista se leería al revés sin que nada fallara.
    const modulos = await agregarTres();

    await comoAutor(
      conCuerpo(rutaDeModulos(), "PUT", {
        orden: [modulos[1].id, modulos[2].id, modulos[0].id],
      }),
    );

    expect(await ordenesGuardados()).toEqual([0, 1, 2]);
  });

  it("rechaza una lista a la que le falta un módulo", async () => {
    const modulos = await agregarTres();

    const respuesta = await comoAutor(
      conCuerpo(rutaDeModulos(), "PUT", {
        orden: [modulos[1].id, modulos[0].id],
      }),
    );

    expect(respuesta.status).toBe(422);
    expect(motivos(await fallasDe(respuesta))).toContain("orden_incompleto");
    expect(
      (await listar()).map((modulo) => modulo.id),
      "una lista rechazada no mueve nada",
    ).toEqual(modulos.map((modulo) => modulo.id));
  });

  it("rechaza una lista que repite un módulo", async () => {
    const modulos = await agregarTres();

    const respuesta = await comoAutor(
      conCuerpo(rutaDeModulos(), "PUT", {
        orden: [modulos[0].id, modulos[0].id, modulos[1].id],
      }),
    );

    expect(respuesta.status).toBe(422);
    expect(motivos(await fallasDe(respuesta))).toContain("orden_incompleto");
  });

  it("rechaza una lista que nombra un módulo de otra cotización", async () => {
    const modulos = await agregarTres();

    const respuesta = await comoAutor(
      conCuerpo(rutaDeModulos(), "PUT", {
        orden: [moduloAjenoId, modulos[0].id, modulos[1].id],
      }),
    );

    expect(respuesta.status).toBe(422);
    expect(motivos(await fallasDe(respuesta))).toContain("modulo_desconocido");
  });

  it("rechaza un cuerpo que no trae un arreglo", async () => {
    await agregar();

    const respuesta = await comoAutor(
      conCuerpo(rutaDeModulos(), "PUT", { orden: "primero" }),
    );

    expect(respuesta.status).toBe(422);
    expect(motivos(await fallasDe(respuesta))).toContain("tipo_invalido");
  });

  it("reordenar a lo que ya estaba no escribe ningún hecho", async () => {
    // Un `PUT` que no mueve nada no es un hecho, y la pantalla lo va a mandar
    // igual cuando alguien arrastre un módulo y lo suelte donde estaba. Una
    // entrada de bitácora ahí sería una decisión inventada.
    const modulos = await agregarTres();
    const antes = await bitacoraDe();

    const respuesta = await comoAutor(
      conCuerpo(rutaDeModulos(), "PUT", {
        orden: modulos.map((modulo) => modulo.id),
      }),
    );

    expect(respuesta.status).toBe(200);
    expect(await bitacoraDe()).toEqual(antes);
  });
});

// ---------------------------------------------------------------------------
// Sólo sobre un borrador
// ---------------------------------------------------------------------------

describe("una cotización que ya no es borrador no acepta módulos", () => {
  it("los módulos de una emitida se siguen pudiendo leer", async () => {
    // Leer nunca se bloquea: lo que no se puede es cambiar el documento que
    // ya salió. Un 409 en el `GET` escondería la cotización emitida de su
    // propia pantalla.
    await agregar();
    await emitir();

    const respuesta = await comoAutor(peticion(rutaDeModulos()));

    expect(respuesta.status).toBe(200);
    expect(await modulosDe(respuesta)).toHaveLength(1);
  });

  it("agregar sobre una emitida da 409 y dice en qué quedó", async () => {
    await emitir();

    const respuesta = await comoAutor(
      conCuerpo(rutaDeModulos(), "POST", {
        tipo: "alcance",
        contenido: "Tarde.",
      }),
    );

    expect(respuesta.status).toBe(409);
    expect(await respuesta.json()).toEqual({
      error: "cotizacion_no_es_borrador",
      estado: "emitida",
    });
    expect(await listar(), "no se escribió nada").toHaveLength(0);
  });

  it("editar un módulo de una emitida da 409", async () => {
    const [modulo] = await agregar();
    await emitir();

    const respuesta = await comoAutor(
      conCuerpo(`${rutaDeModulos()}/${modulo.id}`, "PUT", {
        tipo: "supuestos",
        contenido: "Tarde.",
      }),
    );

    expect(respuesta.status).toBe(409);
    expect((await listar())[0].tipo, "no se tocó").toBe("alcance");
  });

  it("quitar un módulo de una emitida da 409", async () => {
    const [modulo] = await agregar();
    await emitir();

    const respuesta = await comoAutor(
      peticion(`${rutaDeModulos()}/${modulo.id}`, { method: "DELETE" }),
    );

    expect(respuesta.status).toBe(409);
    expect(await listar(), "el módulo sigue ahí").toHaveLength(1);
  });

  it("reordenar los módulos de una emitida da 409", async () => {
    const modulos = await agregarTres();
    await emitir();

    const respuesta = await comoAutor(
      conCuerpo(rutaDeModulos(), "PUT", {
        orden: [modulos[2].id, modulos[1].id, modulos[0].id],
      }),
    );

    expect(respuesta.status).toBe(409);
    expect((await listar()).map((modulo) => modulo.id)).toEqual(
      modulos.map((modulo) => modulo.id),
    );
  });

  it("el puerto se niega igual, sin pasar por la ruta", async () => {
    // **La prueba que hace real la copia del repositorio.** La ruta ya
    // contesta 409 antes de llegar acá, así que sin esta prueba la
    // comprobación del repositorio sería código que se puede borrar sin que
    // nada se ponga rojo — y T-4 y T-5 llaman al puerto directo, sin ruta
    // delante. Es la lección que la unidad A dejó escrita.
    //
    // Y no alcanza con mirar el resultado, que es lo que se midió mutando:
    // la cláusula `EXISTS` de la sentencia también impide la escritura, así
    // que neutralizar la comprobación del puerto devolvería el **mismo**
    // `no_es_borrador` por el otro camino y la prueba pasaría igual. Lo que
    // de verdad distingue a las dos guardas es la bitácora: sin la
    // comprobación de arriba la sentencia no escribe, pero su entrada —que
    // `mutar` manda en el mismo `batch`— sí, y queda un «agregó el módulo»
    // de algo que nunca se agregó. Por eso la aserción que importa acá es la
    // de abajo y no la del resultado.
    const base: BaseDeDatos = baseSobreD1(env.DB, TENANT_UNICO_ID, autorId);
    const servicio = cotizacionesSobreD1(base);

    await agregar();
    await emitir();
    const antes = await bitacoraDe();

    const resultado = await servicio.agregarModulo(
      TENANT_UNICO_ID,
      cotizacionId,
      { tipo: "clausulas", contenido: "Por el puerto." },
    );

    expect(resultado).toEqual({ estado: "no_es_borrador", actual: "emitida" });
    expect(await listar(), "el puerto no escribió nada").toHaveLength(1);
    expect(
      await bitacoraDe(),
      "un intento bloqueado no deja ningún hecho",
    ).toEqual(antes);
  });

  it("el puerto también se niega a reordenar", async () => {
    const base: BaseDeDatos = baseSobreD1(env.DB, TENANT_UNICO_ID, autorId);
    const servicio = cotizacionesSobreD1(base);

    const modulos = await agregarTres();
    await emitir();
    const antes = await bitacoraDe();

    const resultado = await servicio.reordenarModulos(
      TENANT_UNICO_ID,
      cotizacionId,
      [modulos[2].id, modulos[1].id, modulos[0].id],
    );

    expect(resultado).toEqual({ estado: "no_es_borrador", actual: "emitida" });
    expect(await ordenesGuardados()).toEqual([0, 1, 2]);
    expect(
      await bitacoraDe(),
      "un reordenamiento bloqueado no deja ningún hecho",
    ).toEqual(antes);
  });
});

// ---------------------------------------------------------------------------
// Las dos carreras, provocadas a mano
// ---------------------------------------------------------------------------

/**
 * Una `BaseDeDatos` que deja colar una escritura ajena **justo antes** de
 * delegar en la real.
 *
 * Es el seam que vuelve determinista una carrera: el repositorio ya leyó
 * —comprobó el estado, comprobó que el módulo existe, calculó el orden— y
 * todavía no escribió. Es exactamente la ventana que otra petición
 * aprovecha, y acá se abre a voluntad en vez de esperar a que la suerte la
 * abra en producción.
 */
function baseConIntruso(
  real: BaseDeDatos,
  intruso: () => Promise<unknown>,
): BaseDeDatos {
  return {
    lectura: real.lectura,
    async mutar(evento, ...sentencias) {
      await intruso();
      return real.mutar(evento, ...sentencias);
    },
  };
}

/** Un servicio cuya escritura siempre llega tarde, por el intruso de turno. */
function servicioConIntruso(intruso: () => Promise<unknown>) {
  return cotizacionesSobreD1(
    baseConIntruso(baseSobreD1(env.DB, TENANT_UNICO_ID, autorId), intruso),
  );
}

function borrarModuloDirecto(moduloId: string): () => Promise<unknown> {
  return () =>
    env.DB.prepare("DELETE FROM cotizacion_modulo WHERE id = ?")
      .bind(moduloId)
      .run();
}

describe("una escritura que no tocó ninguna fila dice por qué de verdad", () => {
  /*
   * **Lo que se midió antes de arreglar nada**, con este mismo arnés, y que
   * es el defecto que estas cuatro pruebas clavan:
   *
   *   editar con un quitar colado  → { estado: "no_es_borrador",
   *                                    actual: "borrador" }
   *   quitar con un quitar colado  → { estado: "no_es_borrador",
   *                                    actual: "borrador" }
   *   reordenar, se va el primero  → { estado: "no_es_borrador",
   *                                    actual: "borrador" }
   *                                  y los órdenes guardados eran [1, 2]
   *
   * Las tres se contradicen solas: la ruta contesta
   * `409 cotizacion_no_es_borrador` con `estado: "borrador"`, o sea que el
   * mensaje dice una cosa y el dato que lo acompaña dice la contraria. La
   * tercera además **mintió habiendo escrito**: el `batch` se aplicó para
   * los dos módulos que seguían vivos y la respuesta igual fue un rechazo.
   *
   * La causa era suponer que cero filas afectadas sólo puede venir de una
   * emisión. Hay otro camino: el módulo que la sentencia apunta ya no está.
   * Ahora **manda la relectura**, que es el único testigo de en qué quedó la
   * cotización de verdad.
   */

  it("editar un módulo que se fue en el medio contesta 404 y no un 409", async () => {
    const modulos = await agregarTres();
    const victima = modulos[1];

    const resultado = await servicioConIntruso(
      borrarModuloDirecto(victima.id),
    ).editarModulo(TENANT_UNICO_ID, cotizacionId, victima.id, {
      tipo: "supuestos",
      contenido: "Carrera.",
    });

    // 404 y no un motivo nuevo: la cotización sigue siendo un borrador y el
    // módulo no está. Eso es exactamente lo que ya contesta pedir un módulo
    // que no existe, y lo único que cambia es cuándo nos enteramos.
    expect(resultado).toEqual({ estado: "no_encontrado" });
  });

  it("quitar un módulo que ya quitaron contesta 404 y no un 409", async () => {
    const modulos = await agregarTres();
    const victima = modulos[0];

    const resultado = await servicioConIntruso(
      borrarModuloDirecto(victima.id),
    ).quitarModulo(TENANT_UNICO_ID, cotizacionId, victima.id);

    expect(resultado).toEqual({ estado: "no_encontrado" });
  });

  it("reordenar con una lista que quedó vieja contesta 422 y no un 409", async () => {
    // Acá no sirve el 404: la dirección es la de la colección, y la
    // cotización sí existe. Lo que quedó viejo es la lista que mandó la
    // pantalla, que es literalmente lo que `orden_incompleto` dice.
    //
    // Se van **los tres** para que ninguna sentencia escriba: ése es el caso
    // en que la operación entera no ocurrió.
    //
    // Y el orden pedido tiene que ser distinto del que ya estaba, o el
    // atajo del reordenamiento vacuo corta antes de `mutar` y el intruso no
    // llega a colarse.
    const modulos = await agregarTres();
    const invertido = [modulos[2].id, modulos[1].id, modulos[0].id];

    const resultado = await servicioConIntruso(async () => {
      for (const modulo of modulos) {
        await borrarModuloDirecto(modulo.id)();
      }
    }).reordenarModulos(TENANT_UNICO_ID, cotizacionId, invertido);

    expect(resultado).toEqual({
      estado: "invalido",
      fallas: [{ campo: "orden", motivo: "orden_incompleto" }],
    });
  });

  it("si al reordenamiento se le va uno solo, lo que sí se movió queda", async () => {
    // El caso que la detección vieja contestaba peor: miraba sólo la primera
    // sentencia, así que si el que desaparecía era el primero de la lista
    // nueva devolvía un rechazo **habiendo escrito**. Ahora el rechazo exige
    // que no haya escrito **ninguna**, y este caso es un guardado honesto:
    // los que sobrevivieron se movieron, y la lista que vuelve lo dice.
    const modulos = await agregarTres();
    const nuevoOrden = [modulos[2].id, modulos[1].id, modulos[0].id];

    const resultado = await servicioConIntruso(
      borrarModuloDirecto(modulos[2].id),
    ).reordenarModulos(TENANT_UNICO_ID, cotizacionId, nuevoOrden);

    expect(resultado.estado).toBe("guardado");

    // El hueco en `orden` es el que deja el módulo que se fue, y es el mismo
    // hueco que deja un `quitar`: lo que vale es el orden relativo.
    const releidos = await listar();
    expect(releidos.map((modulo) => modulo.tipo)).toEqual([
      "alcance",
      "antecedentes",
    ]);
  });

  it("una emisión colada sigue contestando 409 con el estado de verdad", async () => {
    // El contrapeso de las cuatro de arriba: que la relectura mande no puede
    // haber tapado la carrera que sí existía. Acá el intruso emite, la
    // relectura ve `emitida`, y el 409 vuelve con el estado correcto.
    const modulos = await agregarTres();

    const resultado = await servicioConIntruso(() =>
      env.DB.prepare(
        "UPDATE cotizacion SET estado = 'emitida', snapshot = '{}'" +
          " WHERE id = ?",
      )
        .bind(cotizacionId)
        .run(),
    ).editarModulo(TENANT_UNICO_ID, cotizacionId, modulos[0].id, {
      tipo: "supuestos",
      contenido: "Tarde.",
    });

    expect(resultado).toEqual({ estado: "no_es_borrador", actual: "emitida" });
  });
});

describe("el orden del alta se decide dentro del batch", () => {
  /*
   * **Lo que se midió antes de arreglar nada:** con el `MAX(orden)` leído en
   * una consulta aparte, un alta concurrente que toma ese mismo número hace
   * que la segunda estalle con
   *
   *   Error: D1_ERROR: UNIQUE constraint failed:
   *     cotizacion_modulo.cotizacion_id, cotizacion_modulo.orden
   *
   * o sea un 500 ilegible en una operación corriente. Y no hace falta que
   * sean dos personas: alcanzan dos pestañas abiertas de la misma
   * cotización.
   *
   * No se arregla atrapándolo —la guarda se cuenta y nunca se atrapa, y un
   * `catch` con reintento escondería que el generador del orden tiene un
   * defecto— sino moviendo el cálculo adentro de la sentencia, que es donde
   * el reordenamiento ya lo tenía. Verificado contra D1 antes de escribirlo:
   * un `INSERT … SELECT` con una subconsulta que lee la misma tabla se
   * aplica y devuelve `changes: 1`.
   */

  it("dos altas que calculan la misma posición no chocan", async () => {
    await agregar({ tipo: "antecedentes", contenido: "El que ya estaba." });

    // El intruso toma la posición 1, que es la que el alta en curso habría
    // calculado leyendo `MAX(orden)` por separado.
    const resultado = await servicioConIntruso(() =>
      env.DB.prepare(
        "INSERT INTO cotizacion_modulo (id, tenant_id, cotizacion_id," +
          " tipo, orden, contenido) VALUES (?, ?, ?, 'clausulas', 1, ?)",
      )
        .bind(nuevoId(), TENANT_UNICO_ID, cotizacionId, "El intruso.")
        .run(),
    ).agregarModulo(TENANT_UNICO_ID, cotizacionId, {
      tipo: "alcance",
      contenido: "El que llega segundo.",
    });

    expect(resultado.estado, "no puede estallar el índice único").toBe(
      "guardado",
    );

    const releidos = await listar();
    expect(releidos.map((modulo) => modulo.orden)).toEqual([0, 1, 2]);
    expect(
      releidos.map((modulo) => modulo.contenido),
      "el que llega segundo va último, detrás del intruso",
    ).toEqual(["El que ya estaba.", "El intruso.", "El que llega segundo."]);
  });

  it("el alta sigue yendo al final cuando hay un hueco", async () => {
    // El hueco que deja un `quitar` es justo donde `COUNT(*)` devolvería una
    // posición ya tomada. `COALESCE(MAX(orden), -1) + 1` no.
    const modulos = await agregarTres();
    await comoAutor(
      peticion(`${rutaDeModulos()}/${modulos[1].id}`, { method: "DELETE" }),
    );

    await agregar({ tipo: "clausulas", contenido: "Después del hueco." });

    expect(await ordenesGuardados()).toEqual([0, 2, 3]);
  });
});

// ---------------------------------------------------------------------------
// La tenencia: I-8 en cada consulta nueva
// ---------------------------------------------------------------------------

describe("los módulos del bufete vecino no existen desde acá", () => {
  it("leer los módulos de una cotización ajena da 404", async () => {
    const respuesta = await comoAutor(
      peticion(rutaDeModulos(cotizacionAjenaId)),
    );

    expect(respuesta.status).toBe(404);
  });

  it("agregar un módulo a una cotización ajena da 404", async () => {
    const respuesta = await comoAutor(
      conCuerpo(rutaDeModulos(cotizacionAjenaId), "POST", {
        tipo: "alcance",
        contenido: "Intruso.",
      }),
    );

    expect(respuesta.status).toBe(404);

    const { results } = await env.DB.prepare(
      "SELECT id FROM cotizacion_modulo WHERE cotizacion_id = ?",
    )
      .bind(cotizacionAjenaId)
      .all();
    expect(results, "no se escribió en la cotización del vecino").toHaveLength(
      1,
    );
  });

  it("editar un módulo del vecino desde una cotización propia da 404", async () => {
    // El módulo existe, pero no es de esta cotización ni de este bufete. Un
    // 403 confirmaría que ese identificador existe.
    await agregar();

    const respuesta = await comoAutor(
      conCuerpo(`${rutaDeModulos()}/${moduloAjenoId}`, "PUT", {
        tipo: "alcance",
        contenido: "Secuestrado.",
      }),
    );

    expect(respuesta.status).toBe(404);

    const fila = await env.DB.prepare(
      "SELECT contenido FROM cotizacion_modulo WHERE id = ?",
    )
      .bind(moduloAjenoId)
      .first<{ contenido: string }>();
    expect(fila?.contenido).toBe("El alcance del vecino.");
  });

  it("el listado del puerto no trae los del vecino", async () => {
    // Directo contra el puerto, con el tenant del vecino como argumento: si
    // la consulta no filtrara por `tenant_id`, la cotización ajena traería
    // sus módulos desde este tenant.
    const base: BaseDeDatos = baseSobreD1(env.DB, TENANT_UNICO_ID, autorId);
    const servicio = cotizacionesSobreD1(base);

    expect(
      await servicio.listarModulos(TENANT_UNICO_ID, cotizacionAjenaId),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Lo que queda escrito en la bitácora
// ---------------------------------------------------------------------------

describe("cada operación deja su hecho contra la cotización", () => {
  it("las cuatro escriben su verbo, y el reordenamiento sin detalle", async () => {
    const modulos = await agregarTres();

    await comoAutor(
      conCuerpo(`${rutaDeModulos()}/${modulos[0].id}`, "PUT", {
        tipo: "supuestos",
        contenido: "Cambiado.",
      }),
    );
    await comoAutor(
      peticion(`${rutaDeModulos()}/${modulos[2].id}`, { method: "DELETE" }),
    );
    await comoAutor(
      conCuerpo(rutaDeModulos(), "PUT", {
        orden: [modulos[1].id, modulos[0].id],
      }),
    );

    expect(await bitacoraDe()).toEqual([
      { accion: "modulo_agregado", detalle: "Antecedentes" },
      { accion: "modulo_agregado", detalle: "Alcance" },
      { accion: "modulo_agregado", detalle: "Exclusiones" },
      // El rótulo es el del tipo **nuevo**: es lo que quedó escrito, y la
      // bitácora guarda hechos, no diffs.
      { accion: "modulo_editado", detalle: "Supuestos" },
      { accion: "modulo_quitado", detalle: "Exclusiones" },
      { accion: "modulos_reordenados", detalle: null },
    ]);
  });

  it("el detalle es el rótulo que el bufete puso, no el de la siembra", async () => {
    /*
     * **La prueba de T-3 sobre la bitácora.** Lo que distingue «el rótulo sale
     * de la base» de «el rótulo sale del código» no se puede ver con los
     * presets puestos: hasta T-4 el código tenía una copia letra por letra de
     * los seis `rotulo_oficial`, así que las tres escrituras de módulo
     * contestaban igual por los dos caminos. Lo único que los separa es
     * renombrar una plantilla y mirar qué quedó escrito — y sigue siendo lo
     * único, ahora que la copia en código no existe: un `detalle` que
     * resolviera el rótulo por su cuenta pasaría cualquier prueba hecha sobre
     * los presets.
     *
     * El `finally` devuelve la fila a NULL, que es «uso el preset»: esta tabla
     * la siembra la migración y el `beforeEach` no la toca, así que una
     * prueba que deje el rótulo cambiado se lo deja cambiado a las demás.
     */
    const PROPIO = "Qué vamos a hacer";

    await env.DB.prepare(
      "UPDATE modulo_plantilla SET rotulo = ? WHERE tenant_id = ? AND clave = ?",
    )
      .bind(PROPIO, TENANT_UNICO_ID, "alcance")
      .run();

    try {
      const modulos = await agregar({
        tipo: "alcance",
        contenido: "Lo que se hace.",
      });

      await comoAutor(
        peticion(`${rutaDeModulos()}/${modulos[0].id}`, { method: "DELETE" }),
      );

      expect(await bitacoraDe()).toEqual([
        { accion: "modulo_agregado", detalle: PROPIO },
        { accion: "modulo_quitado", detalle: PROPIO },
      ]);

      // Y la aserción que de verdad clava la tajada: lo escrito **no** es el
      // preset. Sin ella, un `detalle` que siguiera saliendo de una copia en
      // código pasaría la de arriba el día que alguien escribiera «Qué vamos a
      // hacer» también ahí.
      expect(
        (await bitacoraDe()).map((hecho) => hecho.detalle),
      ).not.toContain("Alcance");
    } finally {
      await env.DB.prepare(
        "UPDATE modulo_plantilla SET rotulo = NULL" +
          " WHERE tenant_id = ? AND clave = ?",
      )
        .bind(TENANT_UNICO_ID, "alcance")
        .run();
    }
  });

  it("un hecho de módulo no se registra contra ninguna otra entidad", async () => {
    await agregar();

    // Sobre la tabla entera y no sobre esta cotización: la bitácora es
    // inmutable, así que acá se acumulan los hechos de toda la suite y
    // cualquiera de ellos que colgara de otra entidad aparecería.
    const { results } = await env.DB.prepare(
      "SELECT DISTINCT entidad FROM bitacora WHERE accion LIKE 'modulo%'",
    ).all<{ entidad: string }>();

    expect(results.map((fila) => fila.entidad)).toEqual(["cotizacion"]);
  });
});

// ---------------------------------------------------------------------------
// Los verbos que no existen
// ---------------------------------------------------------------------------

describe("la superficie es exactamente la que se decidió", () => {
  it("la colección no acepta DELETE", async () => {
    const respuesta = await comoAutor(
      peticion(rutaDeModulos(), { method: "DELETE" }),
    );

    expect(respuesta.status).toBe(405);
    expect(respuesta.headers.get("allow")).toBe("GET, POST, PUT");
  });

  it("un módulo suelto no acepta ni GET ni POST", async () => {
    const [modulo] = await agregar();

    for (const metodo of ["GET", "POST"]) {
      const respuesta = await comoAutor(
        peticion(`${rutaDeModulos()}/${modulo.id}`, { method: metodo }),
      );

      expect(respuesta.status, metodo).toBe(405);
      expect(respuesta.headers.get("allow")).toBe("PUT, DELETE");
    }
  });

  it("una subruta inventada cae en el 404 general", async () => {
    // El nombre está inventado a propósito y no es ninguna ruta planificada
    // —decía `duplicar`, que es el verbo de T-5—: lo que se mide es que un
    // sexto segmento que el ruteo no reconoce termine en el 404 general, no
    // la ausencia de una ruta concreta. Nombrar una que está en el plan
    // convierte esta prueba en una bomba que estalla el día que esa ruta se
    // construya, con un rojo que no señala ningún defecto.
    //
    // Es el mismo segmento que usa `test/cotizaciones-api.spec.ts` para su
    // 404 general, y a propósito: el criterio es uno solo.
    const respuesta = await comoAutor(
      peticion(`${rutaDeModulos()}/${nuevoId()}/no-existe-esta-subruta`, {
        method: "POST",
      }),
    );

    expect(respuesta.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// El dominio, sin servidor
// ---------------------------------------------------------------------------

describe("la normalización, sin base ni HTTP", () => {
  it("acepta los seis tipos del catálogo", () => {
    for (const tipo of TIPOS_DE_MODULO) {
      const resultado = normalizarModulo({ tipo, contenido: "Algo." });

      expect(resultado.ok, tipo).toBe(true);
    }
  });

  it("el orden tiene que ser un arreglo de cadenas con algo adentro", () => {
    expect(normalizarOrdenDeModulos({ orden: [1, 2] }).ok).toBe(false);
    expect(normalizarOrdenDeModulos({ orden: ["a", "  "] }).ok).toBe(false);
    expect(normalizarOrdenDeModulos({ orden: [] }).ok).toBe(true);
    expect(normalizarOrdenDeModulos(null).ok).toBe(false);
  });
});
