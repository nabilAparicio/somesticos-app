/**
 * La API de las plantillas de módulo (`odd/tasks/plantillas-de-modulo.md`,
 * T-2), contra una base de verdad: leer el catálogo que `0016` sembró y
 * escribir **solo** el rótulo, la descripción y la vigencia.
 *
 * ## Qué prueba esto que no prueban los otros dos archivos de la familia
 *
 * `plantillas-dominio.spec.ts` prueba las reglas puras y
 * `plantillas-rutas.spec.ts` la traducción a códigos de estado con el puerto
 * sustituido. Acá corre todo junto contra D1, y eso es lo único que puede
 * contestar cuatro preguntas:
 *
 *  1. **Que los seis presets estén y salgan en orden.** No se siembran acá:
 *     los siembra la migración, y eso es el hecho que se mide.
 *  2. **Que vaciar el campo devuelva el preset**, que es el criterio de
 *     aceptación 2 de la tajada. Con el puerto sustituido eso es una promesa;
 *     acá es un `COALESCE` corriendo.
 *  3. **Que cada escritura deje su entrada de bitácora**, con el verbo que
 *     corresponde. `BaseDeDatos.mutar` exige el evento para compilar, pero
 *     **cuál** verbo sale de comparar `activo` antes y después, y eso se ve
 *     solo con la fila guardada.
 *  4. **Que `/api/plantillas-modulo/{id}/bitacora` contesta.** Es la deuda
 *     que T-1 dejó anotada: su `case` en `existeLaFila` devolvía `false`
 *     porque el puerto no existía, así que la dirección daba 404 para una
 *     fila que sí existe. Esta prueba es la que dice que se cerró.
 *
 * Y una quinta que no se puede probar en ningún otro lado: que las guardas de
 * la base sigan puestas. `0016` las probó con sondas de SQL en
 * `plantillas-esquema.spec.ts`; acá se prueba el otro lado —que **la API**
 * niegue antes de llegar a ellas—, y las dos hacen falta por separado:
 *
 *  - Si solo estuviera la del disparador, la API podría aceptar el campo y
 *    morir con un 500 de SQLite crudo. Un 500 no es una negativa: es una
 *    caída, y la pantalla no puede decir nada útil sobre ella.
 *  - Si solo estuviera la de la API, borrar el disparador no pondría nada
 *    rojo, y el preset quedaría sostenido por un `if` — que es justo lo que
 *    `docs/diseno.md` §5 dice que el primer script de importación se salta.
 *
 * Las formas en el cable se declaran acá y no se importan del contrato del
 * Worker, por la misma razón que en `arancel-rutas.spec.ts` y
 * `catalogos-api.spec.ts`: lo que esta suite vigila es el JSON que ve el
 * navegador, y con el tipo importado renombrar un campo en el servidor
 * renombraría también la expectativa.
 */
import { env } from "cloudflare:workers";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { TENANT_UNICO_ID, nuevoId } from "../worker/db/ids";
import { manejar } from "../worker/index";

const DOMINIO_DE_ACCESS = "https://bufete-de-prueba.cloudflareaccess.com";
const AUD = "aud-de-la-aplicacion-del-bufete";

const EMAIL_AUTOR = "itzel@bufete.test";

/** El tenant vecino. Existe solo para que la fuga sea expresable. */
const OTRO_TENANT_ID = "7c1e4f90-2a3b-4c5d-8e6f-1a2b3c4d5e6f";

/**
 * Los seis identificadores que `0016` escribe a mano.
 *
 * Se escriben acá tal cual y no se buscan por clave, y eso es a propósito: la
 * migración los declara literales justamente para que la siembra sea
 * determinista —«el mismo id en la base local, en la de pruebas y en
 * producción»— y una prueba que los resolviera por consulta no mediría esa
 * propiedad.
 */
const ANTECEDENTES = "9f2c4a10-7b31-4d6e-8a52-0c1e5b7d9a01";
const ALCANCE = "9f2c4a10-7b31-4d6e-8a52-0c1e5b7d9a02";
const EXCLUSIONES = "9f2c4a10-7b31-4d6e-8a52-0c1e5b7d9a03";
const SUPUESTOS = "9f2c4a10-7b31-4d6e-8a52-0c1e5b7d9a04";
const CLAUSULAS = "9f2c4a10-7b31-4d6e-8a52-0c1e5b7d9a05";
const NOTA_CLIENTE = "9f2c4a10-7b31-4d6e-8a52-0c1e5b7d9a06";

const LOS_SEIS = [
  ANTECEDENTES,
  ALCANCE,
  EXCLUSIONES,
  SUPUESTOS,
  CLAUSULAS,
  NOTA_CLIENTE,
] as const;

/** El rótulo oficial de `alcance`, tal como lo escribió la migración. */
const ROTULO_OFICIAL_DEL_ALCANCE = "Alcance";

interface PlantillaEnElCable {
  id: string;
  clave: string;
  orden: number;
  rotuloOficial: string | null;
  descripcionOficial: string | null;
  rotulo: string | null;
  descripcion: string | null;
  rotuloVigente: string;
  descripcionVigente: string;
  activo: boolean;
}

interface EntradaEnElCable {
  accion: string;
  detalle: string | null;
  usuarioNombre: string | null;
}

let autorId: string;

/** La plantilla sin preset, sembrada por prueba con identificador nuevo. */
let sinPresetId: string;

/**
 * Una plantilla del bufete vecino, con **la misma clave** que una de las seis.
 *
 * Se siembra una sola vez y no por prueba, y la razón es la tabla: su índice
 * `(tenant_id, clave)` es único, así que un segundo `INSERT` con `alcance`
 * para el mismo vecino choca —medido: `UNIQUE constraint failed:
 * modulo_plantilla.tenant_id, modulo_plantilla.clave`—. Y no se puede limpiar
 * entre pruebas, porque una plantilla no se borra. Que sobreviva no molesta:
 * ninguna prueba la escribe, porque todo camino hacia ella contesta 404 — que
 * es justamente lo que se mide.
 */
const AJENA_ID = "3b9d8c71-5e2f-4a10-9c84-7d6e5f4a3b21";

function entorno(): Env {
  // Hermético: un `.dev.vars` local con `ACCESO_DEV_EMAIL` no puede decidir
  // qué identidad observa la suite.
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

function comoAutor(request: Request): Promise<Response> {
  return manejar(request, entorno(), {
    correoDeDesarrollo: () => EMAIL_AUTOR,
  });
}

async function leerCatalogo(): Promise<PlantillaEnElCable[]> {
  const respuesta = await comoAutor(peticion("/api/plantillas-modulo"));
  expect(respuesta.status).toBe(200);
  return ((await respuesta.json()) as { plantillas: PlantillaEnElCable[] })
    .plantillas;
}

/** Relee una plantilla por la API: la única lectura que prueba que se guardó. */
async function releer(id: string): Promise<PlantillaEnElCable> {
  const fila = (await leerCatalogo()).find((candidata) => candidata.id === id);

  expect(fila, `la plantilla ${id} tiene que estar en la lectura`).toBeDefined();
  return fila as PlantillaEnElCable;
}

async function guardar(
  id: string,
  cuerpo: Record<string, unknown>,
): Promise<Response> {
  return comoAutor(
    conCuerpo(`/api/plantillas-modulo/${id}`, "PUT", cuerpo),
  );
}

async function historiaDe(id: string): Promise<EntradaEnElCable[]> {
  const respuesta = await comoAutor(
    peticion(`/api/plantillas-modulo/${id}/bitacora`),
  );
  expect(respuesta.status).toBe(200);
  return ((await respuesta.json()) as { entradas: EntradaEnElCable[] })
    .entradas;
}

beforeAll(async () => {
  autorId = nuevoId();

  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO usuario (id, tenant_id, nombre, email, activo)" +
        " VALUES (?, ?, ?, ?, 1)",
    ).bind(autorId, TENANT_UNICO_ID, "Itzel", EMAIL_AUTOR),
    env.DB.prepare("INSERT INTO tenant (id, nombre) VALUES (?, ?)").bind(
      OTRO_TENANT_ID,
      "Otro bufete",
    ),
  ]);

  await env.DB.prepare(
    "INSERT INTO modulo_plantilla (id, tenant_id, clave, rotulo_oficial," +
      " descripcion_oficial, rotulo, descripcion, orden, activo)" +
      " VALUES (?, ?, 'alcance', 'Alcance', 'El del vecino', NULL, NULL, 2, 1)",
  )
    .bind(AJENA_ID, OTRO_TENANT_ID)
    .run();
});

beforeEach(async () => {
  /*
   * **Las seis filas se devuelven al estado sembrado, no se vuelven a crear.**
   *
   * El almacenamiento está aislado por archivo y no por prueba, y acá no hay
   * limpieza por borrado posible: `modulo_plantilla_no_se_borra` aborta todo
   * `DELETE`, que es justo lo que una de las pruebas de abajo comprueba. Así
   * que el aislamiento se consigue devolviendo las columnas editables a como
   * las dejó la migración —`rotulo` y `descripcion` en NULL, `activo = 1`—,
   * que es una escritura que ningún disparador prohíbe: los que hay congelan
   * el preset, la clave y el tenant, y eso es exactamente lo que esta
   * sentencia no toca.
   *
   * Las filas nuevas de cada prueba —la sin preset y la del bufete vecino— sí
   * llevan identificador y clave nuevos, que es la misma salida que
   * `arancel-rutas.spec.ts` ya usa para una tabla que no se puede vaciar.
   */
  sinPresetId = nuevoId();

  await env.DB.batch([
    /*
     * El `AND rotulo_oficial IS NOT NULL` no es un filtro de conveniencia: es
     * la condición que hace que esta sentencia sea legal. Las filas fabricadas
     * por las pruebas anteriores **no tienen preset debajo**, así que ponerles
     * `rotulo = NULL` las dejaría sin valor vigente y el `CHECK` de `0016` la
     * abortaría entera —medido: `CHECK constraint failed:
     * la_plantilla_tiene_rotulo_vigente`—. Lo que esta sentencia devuelve al
     * estado sembrado son exactamente las filas que tienen a dónde volver, que
     * son las seis de la migración.
     */
    env.DB.prepare(
      "UPDATE modulo_plantilla SET rotulo = NULL, descripcion = NULL," +
        " activo = 1 WHERE tenant_id = ?" +
        " AND rotulo_oficial IS NOT NULL AND descripcion_oficial IS NOT NULL",
    ).bind(TENANT_UNICO_ID),
    /*
     * Una plantilla **sin preset debajo**, que es lo que hoy no existe en la
     * siembra y por lo tanto no se puede probar sin fabricarla. La base la
     * admite: las dos columnas del preset son nullable a propósito, y lo que
     * los dos `CHECK` exigen no es el preset sino el **valor vigente**, que
     * acá lo dan `rotulo` y `descripcion`. Es la fila que la tajada 2 va a
     * crear de verdad.
     */
    env.DB.prepare(
      "INSERT INTO modulo_plantilla (id, tenant_id, clave, rotulo_oficial," +
        " descripcion_oficial, rotulo, descripcion, orden, activo)" +
        " VALUES (?, ?, ?, NULL, NULL, ?, ?, ?, 1)",
    ).bind(
      sinPresetId,
      TENANT_UNICO_ID,
      `propio_${sinPresetId.slice(0, 8)}`,
      "Garantías",
      "Lo que el bufete garantiza y por cuánto tiempo.",
      50,
    ),
  ]);
});

/**
 * El cuerpo de una baja sobre una plantilla que todavía usa su preset: el
 * texto en nulo —que es «uso el preestablecido»— y `activo: false`.
 *
 * Se escribe como constante y no se construye por fila porque las seis
 * sembradas llegan igual: `rotulo` y `descripcion` en NULL. Dar de baja
 * mandando el texto propio es otro caso, y la prueba que lo mide lo arma
 * aparte.
 */
const BAJA: Record<string, unknown> = {
  rotulo: null,
  descripcion: null,
  activo: false,
};

/* ==========================================================================
   Lo que la migración sembró
   ========================================================================== */

describe("GET /api/plantillas-modulo", () => {
  /**
   * Los seis, con su clave y en el orden de lectura de una propuesta: de dónde
   * viene el encargo, qué se va a hacer, qué queda afuera, sobre qué se apoya
   * el precio, bajo qué condiciones, y el cierre dirigido al cliente. No es el
   * alfabético, y la prueba lo fija para que un `ORDER BY` cambiado se vea.
   */
  it("trae las seis plantillas sembradas, en el orden de la propuesta", async () => {
    const plantillas = await leerCatalogo();
    /*
     * Se filtra a las seis de la migración, que son las que esta prueba mide.
     * Las demás son las filas sin preset que cada prueba fabrica, y se
     * acumulan: el almacenamiento está aislado por archivo y no por prueba, y
     * una plantilla no se borra.
     */
    const delBufete = plantillas.filter((cada) =>
      (LOS_SEIS as readonly string[]).includes(cada.id),
    );

    expect(delBufete.map((cada) => cada.clave)).toEqual([
      "antecedentes",
      "alcance",
      "exclusiones",
      "supuestos",
      "clausulas",
      "nota_cliente",
    ]);
    expect(delBufete.map((cada) => cada.id)).toEqual([...LOS_SEIS]);
  });

  /**
   * Cada fila trae **los tres valores**: el propio, el preset y el vigente. Es
   * redundante a propósito, y lo que compra es que la pantalla pueda dibujar
   * la marca de editado y ofrecer el vuelta atrás sin una segunda petición por
   * fila.
   */
  it("cada plantilla trae el preset, lo propio y lo vigente", async () => {
    const alcance = await releer(ALCANCE);

    expect(alcance.rotuloOficial).toBe(ROTULO_OFICIAL_DEL_ALCANCE);
    expect(alcance.rotulo).toBeNull();
    expect(alcance.rotuloVigente).toBe(ROTULO_OFICIAL_DEL_ALCANCE);
    expect(alcance.descripcionOficial).not.toBeNull();
    expect(alcance.descripcion).toBeNull();
    expect(alcance.descripcionVigente).toBe(alcance.descripcionOficial);
  });

  /**
   * **Las seis tienen descripción vigente**, que es el criterio de aceptación
   * 4 de la tajada y la razón de ser de la migración: una plantilla sin
   * descripción es una plantilla que la IA va a usar mal.
   */
  it("ninguna plantilla llega sin descripción vigente", async () => {
    for (const plantilla of await leerCatalogo()) {
      expect(
        plantilla.descripcionVigente.trim().length,
        `«${plantilla.clave}» llegó sin descripción vigente`,
      ).toBeGreaterThan(0);
      expect(plantilla.rotuloVigente.trim().length).toBeGreaterThan(0);
    }
  });

  /**
   * I-8: lo del bufete vecino no se ve, ni siquiera cuando comparte la clave.
   * La fila ajena de `beforeEach` usa `alcance`, que es la misma clave que una
   * de las seis — así la fuga sería expresable si el `WHERE tenant_id` faltara.
   */
  it("no trae nada del bufete vecino, ni con la clave repetida", async () => {
    const plantillas = await leerCatalogo();

    expect(plantillas.map((cada) => cada.id)).not.toContain(AJENA_ID);
    expect(
      plantillas.filter((cada) => cada.clave === "alcance"),
    ).toHaveLength(1);
  });

  /**
   * Las dadas de baja **vienen igual**, con su `activo` puesto. Sin ellas no
   * habría forma de reactivar una, que es parte del alcance de la tajada.
   */
  it("una plantilla dada de baja sigue viniendo, marcada", async () => {
    expect((await guardar(CLAUSULAS, BAJA)).status).toBe(200);

    const clausulas = await releer(CLAUSULAS);
    expect(clausulas.activo).toBe(false);
  });
});


/* ==========================================================================
   Escribir el rótulo y la descripción
   ========================================================================== */

describe("PUT /api/plantillas-modulo/{id}", () => {
  it("escribe el rótulo y la descripción del bufete", async () => {
    const respuesta = await guardar(ALCANCE, {
      rotulo: "Qué vamos a hacer",
      descripcion: "Las gestiones concretas, ante qué entidades y con plazos.",
    });

    expect(respuesta.status).toBe(200);

    const guardada = await releer(ALCANCE);
    expect(guardada.rotulo).toBe("Qué vamos a hacer");
    expect(guardada.rotuloVigente).toBe("Qué vamos a hacer");
    // El preset **no se movió**: es el piso al que se vuelve.
    expect(guardada.rotuloOficial).toBe(ROTULO_OFICIAL_DEL_ALCANCE);
  });

  /**
   * **El criterio de aceptación 2 de la tajada, corriendo.**
   *
   * Vaciar el campo guarda un nulo, el `COALESCE` devuelve el original, y el
   * original sigue siendo el original. Las tres cosas en una prueba porque las
   * tres son la misma promesa.
   */
  it("vaciar el campo vuelve al preestablecido, y el preset sigue intacto", async () => {
    await guardar(ALCANCE, { rotulo: "Lo nuestro", descripcion: "Lo nuestro" });
    expect((await releer(ALCANCE)).rotulo).toBe("Lo nuestro");

    const vuelta = await guardar(ALCANCE, { rotulo: "", descripcion: "" });
    expect(vuelta.status).toBe(200);

    const volvio = await releer(ALCANCE);
    expect(volvio.rotulo).toBeNull();
    expect(volvio.descripcion).toBeNull();
    expect(volvio.rotuloVigente).toBe(ROTULO_OFICIAL_DEL_ALCANCE);
    expect(volvio.descripcionVigente).toBe(volvio.descripcionOficial);
  });

  /**
   * El campo con solo espacios también vuelve al preset. Es el caso que
   * ningún `CHECK` puede atrapar —tres espacios no son nulos— y por eso la
   * normalización del dominio es load-bearing y no cosmética.
   */
  it("un campo con solo espacios también vuelve al preestablecido", async () => {
    await guardar(SUPUESTOS, { rotulo: "   ", descripcion: "  \n " });

    const supuestos = await releer(SUPUESTOS);
    expect(supuestos.rotulo).toBeNull();
    expect(supuestos.rotuloVigente).toBe(supuestos.rotuloOficial);
  });

  it("una plantilla del bufete vecino no existe: 404", async () => {
    const respuesta = await guardar(AJENA_ID, { rotulo: "Mío ahora" });

    expect(respuesta.status).toBe(404);

    // Y no se tocó: la fila del vecino sigue como estaba.
    const fila = await env.DB.prepare(
      "SELECT rotulo FROM modulo_plantilla WHERE id = ?",
    )
      .bind(AJENA_ID)
      .first<{ rotulo: string | null }>();
    expect(fila?.rotulo).toBeNull();
  });
});

/* ==========================================================================
   Las dos negativas, con la base detrás
   ========================================================================== */

describe("lo que la API niega antes de que la base se queje", () => {
  it.each(["rotuloOficial", "descripcionOficial", "clave"])(
    "escribir `%s` es 409 y no un 500 de SQLite",
    async (campo) => {
      const respuesta = await guardar(ALCANCE, {
        rotulo: "Lo nuestro",
        [campo]: "falsificado",
      });

      expect(respuesta.status).toBe(409);
      await expect(respuesta.json()).resolves.toEqual({
        error: "plantilla_inmutable",
        campos: [campo],
      });

      // Y la escritura legítima del mismo cuerpo tampoco entró: la negativa es
      // de la petición entera, no de un campo.
      expect((await releer(ALCANCE)).rotulo).toBeNull();
    },
  );

  /**
   * El otro 409, sobre la fila que hoy solo existe fabricada: sin preset
   * debajo, vaciar la descripción no es volver atrás —no hay a dónde— sino
   * dejar una plantilla que la IA va a usar mal.
   */
  it("vaciar sin preestablecido debajo es 409 `plantilla_sin_preset`", async () => {
    const respuesta = await guardar(sinPresetId, {
      rotulo: "Garantías",
      descripcion: "",
    });

    expect(respuesta.status).toBe(409);
    await expect(respuesta.json()).resolves.toEqual({
      error: "plantilla_sin_preset",
      campos: ["descripcion"],
    });

    // La fila quedó como estaba: una negativa no escribe nada.
    expect((await releer(sinPresetId)).descripcion).toBe(
      "Lo que el bufete garantiza y por cuánto tiempo.",
    );
  });

  it("los dos vacíos sin preestablecido nombran los dos campos", async () => {
    const respuesta = await guardar(sinPresetId, {
      rotulo: "",
      descripcion: "",
    });

    expect(respuesta.status).toBe(409);
    await expect(respuesta.json()).resolves.toEqual({
      error: "plantilla_sin_preset",
      campos: ["descripcion", "rotulo"],
    });
  });

  /**
   * Y la **otra mitad**: escribir texto propio sobre una fila sin preset sí
   * entra. Sin esta prueba, una guarda que rechazara toda escritura sobre esa
   * fila pasaría las dos de arriba.
   */
  it("escribir texto propio sin preestablecido debajo sí entra", async () => {
    const respuesta = await guardar(sinPresetId, {
      rotulo: "Garantías del bufete",
      descripcion: "Otra cosa.",
    });

    expect(respuesta.status).toBe(200);
    expect((await releer(sinPresetId)).rotuloVigente).toBe(
      "Garantías del bufete",
    );
  });

  /**
   * La guarda de la base, por si alguien le quitara la de la API: una
   * plantilla no se borra ni con SQL directo. `plantillas-esquema.spec.ts` lo
   * prueba contra las cuatro guardas; acá se repite la que importa para esta
   * ruta, porque es la que explica que no haya `DELETE`.
   */
  it("una plantilla no se borra, ni con SQL directo", async () => {
    await expect(
      env.DB.prepare("DELETE FROM modulo_plantilla WHERE id = ?")
        .bind(ALCANCE)
        .run(),
    ).rejects.toThrow(/no se borra/);
  });
});

/* ==========================================================================
   La bitácora: la entrada de cada escritura, y la dirección que T-1 debía
   ========================================================================== */

describe("la bitácora de una plantilla", () => {
  /**
   * **La deuda de T-1, cerrada.**
   *
   * Su `case` de `modulo_plantilla` en `existeLaFila` devolvía `false` porque
   * el puerto que comprueba la fila no existía todavía, así que esta dirección
   * contestaba 404 para una fila que sí existe. Lo que faltaba era el
   * repositorio y su parámetro en `worker/index.ts`.
   */
  it("la dirección contesta 200 para una fila que existe", async () => {
    const respuesta = await comoAutor(
      peticion(`/api/plantillas-modulo/${ALCANCE}/bitacora`),
    );

    expect(respuesta.status).toBe(200);
    const cuerpo = (await respuesta.json()) as {
      entradas: EntradaEnElCable[];
      total: number;
    };
    expect(cuerpo).toHaveProperty("entradas");
    expect(cuerpo).toHaveProperty("total");
  });

  /** Y sigue contestando 404 para lo que es de otro bufete. */
  it("la historia de una plantilla ajena es 404, no una lista vacía", async () => {
    const respuesta = await comoAutor(
      peticion(`/api/plantillas-modulo/${AJENA_ID}/bitacora`),
    );

    expect(respuesta.status).toBe(404);
  });

  it("un identificador que no existe también es 404", async () => {
    const respuesta = await comoAutor(
      peticion(`/api/plantillas-modulo/${nuevoId()}/bitacora`),
    );

    expect(respuesta.status).toBe(404);
  });

  /** Una entrada no se escribe a mano: el verbo no existe. */
  it("la dirección no admite escrituras", async () => {
    const respuesta = await comoAutor(
      peticion(`/api/plantillas-modulo/${ALCANCE}/bitacora`, {
        method: "POST",
      }),
    );

    expect(respuesta.status).toBe(405);
    expect(respuesta.headers.get("allow")).toBe("GET");
  });

  /**
   * Editar deja `editado`, con el rótulo **vigente nuevo** en el detalle. Es
   * el nombre con el que la plantilla se va a llamar de ahí en adelante, que
   * es el que alguien va a buscar en la historia.
   */
  it("editar deja una entrada `editado` con el rótulo nuevo", async () => {
    await guardar(NOTA_CLIENTE, {
      rotulo: "Mensaje para el cliente",
      descripcion: "Un párrafo breve.",
    });

    const historia = await historiaDe(NOTA_CLIENTE);
    expect(historia[0]?.accion).toBe("editado");
    expect(historia[0]?.detalle).toBe("Mensaje para el cliente");
    expect(historia[0]?.usuarioNombre).toBe("Itzel");
  });

  /**
   * Vaciar también deja `editado`, y el detalle lleva **el preset**: es el
   * rótulo con el que la plantilla quedó. Si el detalle llevara el valor
   * anterior, la historia diría que se editó un nombre que ya no existe.
   */
  it("vaciar el rótulo deja el preestablecido en el detalle", async () => {
    await guardar(EXCLUSIONES, { rotulo: "Lo nuestro", descripcion: "X" });
    await guardar(EXCLUSIONES, { rotulo: "", descripcion: "X" });

    const historia = await historiaDe(EXCLUSIONES);
    expect(historia[0]?.accion).toBe("editado");
    expect(historia[0]?.detalle).toBe("Exclusiones");
  });

  /**
   * **La baja y la reactivación son hechos propios**, y no `editado` con otro
   * nombre: dejar de ofrecer un módulo es un hecho del bufete, y esconderlo
   * dentro de «editó» lo volvería invisible justo cuando alguien pregunta por
   * qué desapareció de un desplegable. El verbo lo elige `accionDeEdicion`
   * comparando contra la fila guardada, así que esto es lo único que puede
   * probarlo.
   */
  it("dar de baja y reactivar dejan sus propios verbos", async () => {
    expect((await guardar(CLAUSULAS, BAJA)).status).toBe(200);
    expect(
      (
        await guardar(CLAUSULAS, {
          rotulo: null,
          descripcion: null,
          activo: true,
        })
      ).status,
    ).toBe(200);

    const historia = await historiaDe(CLAUSULAS);
    // La página viene de lo más nuevo a lo más viejo.
    expect(historia.slice(0, 2).map((cada) => cada.accion)).toEqual([
      "reactivado",
      "dado_de_baja",
    ]);
  });

  /**
   * Y **las seis sembradas no tienen `creado`**, aunque el verbo exista desde
   * T-7: las escribió la migración, que no pasa por `mutar`. No es un hueco de
   * la bitácora sino lo que de verdad pasó — nadie las dio de alta—, y es el
   * contraste de la prueba del alta de más abajo, que sí deja su entrada.
   */
  it("ninguna plantilla sembrada tiene una entrada `creado`", async () => {
    for (const id of LOS_SEIS) {
      const historia = await historiaDe(id);
      expect(
        historia.map((cada) => cada.accion),
        `la plantilla ${id} tiene un verbo que esta tajada no emite`,
      ).not.toContain("creado");
    }
  });

  /**
   * Una negativa no deja entrada. La bitácora registra hechos, y un 409 no es
   * un hecho: es una escritura que no pasó.
   */
  it("un 409 no deja ninguna entrada", async () => {
    const antes = (await historiaDe(ANTECEDENTES)).length;

    expect(
      (await guardar(ANTECEDENTES, { clave: "otra" })).status,
    ).toBe(409);

    expect((await historiaDe(ANTECEDENTES)).length).toBe(antes);
  });
});

/* ==========================================================================
   El alta (T-7)

   Las palabras del usuario, mirando la pantalla de la tajada 1: «No veo la
   opción de crear un módulo, sólo editar y dar de baja.»

   Lo que **solo se puede probar contra la base** es casi todo lo de esta
   sección: que la clave acuñada entre al único de `(tenant_id, clave)`, que el
   choque contra una fila **dada de baja** rebote igual —porque ese índice no
   mira `activo`—, que el `orden` salga de un `MAX`, que la fila nazca con el
   preset en NULL y que la entrada de bitácora diga `creado` sin que ninguna
   migración lo haya agregado.
   ========================================================================== */

/** Un rótulo distinto por prueba: una plantilla creada no se puede borrar. */
function rotuloUnico(que: string): string {
  return `${que} ${nuevoId().slice(0, 8)}`;
}

async function crear(cuerpo: Record<string, unknown>): Promise<Response> {
  return comoAutor(conCuerpo("/api/plantillas-modulo", "POST", cuerpo));
}

describe("POST /api/plantillas-modulo", () => {
  /**
   * El caso que el usuario pidió por su nombre, de punta a punta contra la
   * base: dos campos entran, una fila sale, y la clave la acuñó el servidor.
   */
  it("crea la plantilla con la clave acuñada del rótulo", async () => {
    const respuesta = await crear({
      rotulo: "Observaciones del cliente",
      descripcion: "Lo que el cliente dijo y conviene dejar escrito.",
    });

    expect(respuesta.status).toBe(201);

    const { plantilla } = (await respuesta.json()) as {
      plantilla: PlantillaEnElCable;
    };

    expect(plantilla.clave).toBe("observaciones_del_cliente");
    expect(respuesta.headers.get("location")).toBe(
      `/api/plantillas-modulo/${plantilla.id}`,
    );

    /*
     * **Nace del bufete y sin piso debajo**, que es lo que la distingue de las
     * seis: el preset en NULL, el texto propio puesto, y el vigente resuelto
     * por el `COALESCE` sobre el único de los dos que existe.
     */
    expect(plantilla.rotuloOficial).toBeNull();
    expect(plantilla.descripcionOficial).toBeNull();
    expect(plantilla.rotulo).toBe("Observaciones del cliente");
    expect(plantilla.rotuloVigente).toBe("Observaciones del cliente");
    expect(plantilla.descripcionVigente).toBe(
      "Lo que el cliente dijo y conviene dejar escrito.",
    );
    // Nace vigente: una plantilla que hay que reactivar para usarla es un alta
    // a medias.
    expect(plantilla.activo).toBe(true);

    // Y está en la lectura, que es la única prueba de que se guardó.
    expect((await releer(plantilla.id)).clave).toBe(
      "observaciones_del_cliente",
    );
  });

  /**
   * **Última, y no primera ni en el medio.** `orden = MAX(orden) + 1` sobre
   * todo el bufete, así que la plantilla nueva aparece donde estaba el
   * formulario que la creó. Se mide contra el máximo real de la tabla y no
   * contra 7, porque las pruebas de este archivo fabrican filas con `orden`
   * 50 y el número exacto depende de cuántas corrieron antes.
   */
  it("nace última en el orden del catálogo", async () => {
    const maximo = Math.max(
      ...(await leerCatalogo()).map((cada) => cada.orden),
    );

    const respuesta = await crear({
      rotulo: rotuloUnico("Garantías"),
      descripcion: "Lo que el bufete garantiza y por cuánto tiempo.",
    });

    const { plantilla } = (await respuesta.json()) as {
      plantilla: PlantillaEnElCable;
    };

    expect(plantilla.orden).toBe(maximo + 1);

    // Y la lectura la devuelve al final, que es la consecuencia visible.
    const catalogo = await leerCatalogo();
    expect(catalogo[catalogo.length - 1]?.id).toBe(plantilla.id);
  });

  /**
   * **El verbo que T-7 estrena, y sin migración.** `creado` ya estaba en el
   * `CHECK` de `accion` desde `0012:132` y `modulo_plantilla` en el de
   * `entidad` desde `0016`, así que lo único que faltaba era la ruta que lo
   * emitiera. Esto lo mide contra la base: si el `CHECK` no lo admitiera, el
   * `INSERT` de la bitácora abortaría la transacción entera y el alta sería un
   * 500.
   */
  it("deja su entrada de bitácora con el verbo `creado`", async () => {
    const rotulo = rotuloUnico("Acta de entrega");
    const respuesta = await crear({
      rotulo,
      descripcion: "Qué se entrega al cerrar el encargo.",
    });

    const { plantilla } = (await respuesta.json()) as {
      plantilla: PlantillaEnElCable;
    };

    const historia = await historiaDe(plantilla.id);

    expect(historia).toHaveLength(1);
    expect(historia[0]?.accion).toBe("creado");
    // El `detalle` es el rótulo, que acá **es** el vigente: no hay preset que
    // resolver con un `COALESCE`.
    expect(historia[0]?.detalle).toBe(rotulo);
    expect(historia[0]?.usuarioNombre).toBe("Itzel");
  });

  /* ---- Los dos 422, contra la base ------------------------------------- */

  /**
   * **El choque contra uno de los seis presets.** «Alcance» acuña `alcance`,
   * que ya está tomada por la fila que sembró `0016`. Lo que esto mide es que
   * la negativa sea un 422 con su motivo y **no** el `UNIQUE constraint
   * failed` del índice envuelto en un 500.
   */
  it("un rótulo que acuña la clave de un preset es 422", async () => {
    const respuesta = await crear({
      rotulo: "Alcance",
      descripcion: "Otra cosa.",
    });

    expect(respuesta.status).toBe(422);
    await expect(respuesta.json()).resolves.toEqual({
      error: "datos_invalidos",
      fallas: [{ campo: "rotulo", motivo: "clave_de_modulo_tomada" }],
    });
  });

  /**
   * **Y dos rótulos distintos chocan igual**, que es la mitad que un único
   * sobre el rótulo no habría atrapado: «¡Alcance!» no es «Alcance» y las dos
   * acuñan `alcance`. Lo que choca es el identificador, no el nombre.
   */
  it("dos rótulos distintos que acuñan la misma clave chocan", async () => {
    const respuesta = await crear({
      rotulo: "  ¡Alcance!  ",
      descripcion: "Otra cosa.",
    });

    expect(respuesta.status).toBe(422);
    await expect(respuesta.json()).resolves.toMatchObject({
      fallas: [{ motivo: "clave_de_modulo_tomada" }],
    });
  });

  /**
   * **El choque contra una plantilla dada de baja**, y es el caso que una
   * consulta descuidada deja pasar: `modulo_plantilla_clave_unica` **no mira
   * `activo`**, así que una clave retirada sigue tomada —y tiene que seguir
   * tomada, porque los módulos de las cotizaciones vivas la referencian por
   * llave foránea desde `0017`—.
   *
   * Si la comprobación filtrara por `activo`, esto pasaría la guarda y moriría
   * en el índice: un 500 en vez de una negativa.
   */
  it("una clave de una plantilla dada de baja sigue tomada", async () => {
    const rotulo = rotuloUnico("Retirada");
    const primera = await crear({ rotulo, descripcion: "La primera." });
    expect(primera.status).toBe(201);

    const { plantilla } = (await primera.json()) as {
      plantilla: PlantillaEnElCable;
    };

    // Se retira mandando su propio texto, porque el `PUT` manda el juego
    // completo y acá vaciarlo dejaría la fila sin valor vigente.
    expect(
      (
        await guardar(plantilla.id, {
          rotulo: plantilla.rotulo,
          descripcion: plantilla.descripcion,
          activo: false,
        })
      ).status,
    ).toBe(200);
    expect((await releer(plantilla.id)).activo).toBe(false);

    const segunda = await crear({ rotulo, descripcion: "La segunda." });

    expect(segunda.status).toBe(422);
    await expect(segunda.json()).resolves.toMatchObject({
      fallas: [{ motivo: "clave_de_modulo_tomada" }],
    });
  });

  /**
   * **El otro de los dos**, y es un problema distinto con otro motivo: de un
   * rótulo de solo signos no sale ningún identificador. Sin esta negativa, la
   * clave llegaría vacía al `INSERT` y lo que saldría sería el `NOT NULL` de la
   * columna convertido en un 500.
   */
  it("un rótulo que no acuña nada es 422 con su propio motivo", async () => {
    const respuesta = await crear({ rotulo: "«»", descripcion: "Algo." });

    expect(respuesta.status).toBe(422);
    await expect(respuesta.json()).resolves.toEqual({
      error: "datos_invalidos",
      fallas: [{ campo: "rotulo", motivo: "rotulo_sin_clave" }],
    });
  });

  /** Y los dos motivos son distintos, que es lo que la tarea pedía decidir. */
  it("los dos 422 no dicen lo mismo", async () => {
    const sinClave = await crear({ rotulo: "---", descripcion: "Algo." });
    const tomada = await crear({ rotulo: "Supuestos", descripcion: "Algo." });

    const unoSinClave = (await sinClave.json()) as {
      fallas: { motivo: string }[];
    };
    const unoTomado = (await tomada.json()) as {
      fallas: { motivo: string }[];
    };

    expect(unoSinClave.fallas[0]?.motivo).not.toBe(
      unoTomado.fallas[0]?.motivo,
    );
  });

  /* ---- La descripción obligatoria -------------------------------------- */

  /**
   * **La asimetría que es la tarea, medida contra la base.** Un preset editado
   * se puede vaciar porque `descripcion_oficial` lo cubre; una plantilla nueva
   * no tiene nada debajo, así que el `CHECK
   * la_plantilla_tiene_descripcion_vigente` rechazaría la fila. Esto mide que
   * la API niegue **antes** de llegar a ese `CHECK`, porque un
   * `SQLITE_CONSTRAINT_CHECK` convertido en 500 no es una negativa.
   */
  it("sin descripción no hay alta, y no escribe nada", async () => {
    const cuantas = (await leerCatalogo()).length;

    const respuesta = await crear({ rotulo: rotuloUnico("Sin descripción") });

    expect(respuesta.status).toBe(422);
    await expect(respuesta.json()).resolves.toEqual({
      error: "datos_invalidos",
      fallas: [
        { campo: "descripcion", motivo: "descripcion_de_modulo_requerida" },
      ],
    });
    expect((await leerCatalogo()).length).toBe(cuantas);
  });

  it("una descripción en blanco es lo mismo que ninguna", async () => {
    const respuesta = await crear({
      rotulo: rotuloUnico("En blanco"),
      descripcion: "   ",
    });

    expect(respuesta.status).toBe(422);
  });

  /* ---- Lo que el alta no escribe --------------------------------------- */

  /**
   * El cuerpo que trae el preset puesto es el mismo 409 de la edición, y acá
   * dice algo más fuerte: esas dos columnas **nacen nulas a propósito**, y
   * fabricárselas desde el cuerpo sería sembrar un piso que nadie publicó.
   */
  it("no se puede sembrar su propio preestablecido", async () => {
    const respuesta = await crear({
      rotulo: rotuloUnico("Con preset"),
      descripcion: "Algo.",
      rotuloOficial: "El mío",
    });

    expect(respuesta.status).toBe(409);
    await expect(respuesta.json()).resolves.toEqual({
      error: "plantilla_inmutable",
      campos: ["rotuloOficial"],
    });
  });

  /* ---- Lo que se puede hacer con ella después -------------------------- */

  /**
   * **El 409 que T-2 construyó sin poder ejercerlo.** Las seis sembradas
   * tienen preset en las dos columnas, así que `plantilla_sin_preset` era un
   * contrato honesto sobre una fila que no existía. Esta tarea la hace existir,
   * y esto es la prueba que lo mide: vaciar la descripción de una plantilla
   * propia no es volver atrás —no hay a dónde— sino dejar una plantilla que la
   * IA va a usar mal.
   */
  it("vaciar un campo de una plantilla propia es el 409 sin preset", async () => {
    const respuesta = await crear({
      rotulo: rotuloUnico("Sin piso"),
      descripcion: "La que se va a intentar vaciar.",
    });

    const { plantilla } = (await respuesta.json()) as {
      plantilla: PlantillaEnElCable;
    };

    const vaciada = await guardar(plantilla.id, {
      rotulo: plantilla.rotulo,
      descripcion: "",
      activo: true,
    });

    expect(vaciada.status).toBe(409);
    await expect(vaciada.json()).resolves.toEqual({
      error: "plantilla_sin_preset",
      campos: ["descripcion"],
    });
    // Y la fila quedó como estaba: una negativa no escribe.
    expect((await releer(plantilla.id)).descripcionVigente).toBe(
      "La que se va a intentar vaciar.",
    );
  });

  /** Y editarla sí se puede: lo único que no admite es quedar en blanco. */
  it("una plantilla propia se edita como cualquier otra", async () => {
    const respuesta = await crear({
      rotulo: rotuloUnico("Corregible"),
      descripcion: "La primera descripción.",
    });

    const { plantilla } = (await respuesta.json()) as {
      plantilla: PlantillaEnElCable;
    };

    expect(
      (
        await guardar(plantilla.id, {
          rotulo: plantilla.rotulo,
          descripcion: "La corregida.",
          activo: true,
        })
      ).status,
    ).toBe(200);

    expect((await releer(plantilla.id)).descripcionVigente).toBe(
      "La corregida.",
    );
    // La clave no cambió, aunque el rótulo se pudiera corregir: es lo que la
    // separación clave/rótulo compra.
    expect((await historiaDe(plantilla.id)).map((cada) => cada.accion)).toEqual(
      ["editado", "creado"],
    );
  });

  /**
   * Una plantilla del bufete vecino **no estorba**: su clave `alcance` ya
   * existe para él, y crear `alcance` para este bufete rebotaría contra la
   * propia y no contra la suya. Lo que esto mide es que la comprobación filtre
   * por `tenant_id` (I-8), y se mide al revés: una clave que **solo** el
   * vecino tiene se puede crear acá.
   */
  it("una clave que solo tiene el bufete vecino está libre", async () => {
    await env.DB.prepare(
      "INSERT INTO modulo_plantilla (id, tenant_id, clave, rotulo_oficial," +
        " descripcion_oficial, rotulo, descripcion, orden, activo)" +
        " VALUES (?, ?, 'solo_del_vecino', NULL, NULL, ?, ?, 90, 1)",
    )
      .bind(nuevoId(), OTRO_TENANT_ID, "Solo del vecino", "La del vecino.")
      .run();

    const respuesta = await crear({
      rotulo: "Solo del vecino",
      descripcion: "La nuestra, con la misma clave.",
    });

    expect(respuesta.status).toBe(201);
    const { plantilla } = (await respuesta.json()) as {
      plantilla: PlantillaEnElCable;
    };
    expect(plantilla.clave).toBe("solo_del_vecino");
  });

  it.each(["PATCH", "DELETE"])(
    "un %s sobre la colección sigue siendo 405",
    async (metodo) => {
      const respuesta = await comoAutor(
        peticion("/api/plantillas-modulo", { method: metodo }),
      );

      expect(respuesta.status).toBe(405);
      expect(respuesta.headers.get("allow")).toBe("GET, POST");
    },
  );
});
