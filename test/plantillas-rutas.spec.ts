/**
 * El ruteo HTTP de las plantillas de módulo (T-2 de
 * `odd/tasks/plantillas-de-modulo.md`), con el puerto sustituido.
 *
 * ## Por qué este archivo existe teniendo `plantillas-api.spec.ts` al lado
 *
 * Aquél corre contra una base de verdad y prueba lo que una base decide: que
 * las seis filas sembradas salgan, que la escritura deje su entrada de
 * bitácora, que una fila del bufete vecino no exista. Esto prueba lo otro, que
 * es **la traducción**: qué código de estado, qué cabecera y qué cuerpo
 * corresponden a cada resultado del puerto, y qué direcciones reconoce.
 *
 * Con el puerto sustituido se pueden ejercer dos cosas que contra la base
 * cuestan una fila preparada para cada una:
 *
 *  - Que la ruta **no consulte** cuando no tiene que consultar. Un 405 sobre
 *    la colección no puede pasar por el repositorio, y con el servicio real un
 *    405 no distingue «no se consultó» de «se consultó y después se rechazó».
 *    El espía cuenta las llamadas, que es la única forma de verlo.
 *  - Que el orden de las comprobaciones del `PUT` sea el que T-5 fijó: **la
 *    existencia antes del cuerpo**. Contra la base también se puede, pero acá
 *    se ve *por qué* —el puerto registra que se le preguntó por la fila antes
 *    de que nadie mirara el JSON— y no solo que el código de estado coincide.
 *
 * La tercera es `sin_preset`: contra la base hace falta sembrar una fila con
 * el preset en nulo, y `plantillas-api.spec.ts` lo hace. Acá se prueba que el
 * resultado del puerto se convierte en el 409 correcto, que es una decisión de
 * esta capa y de ninguna otra.
 */
import { describe, expect, it } from "vitest";

import type { PlantillaDeModulo } from "../worker/contract";
import type { DatosDePlantilla } from "../worker/plantillas/dominio";
import type {
  ResultadoDePlantilla,
  ServicioDePlantillas,
} from "../worker/plantillas/repositorio";
import { rutasDePlantillas } from "../worker/plantillas/rutas";

const TENANT = "ead2d071-2ff7-4461-bf95-941c1e90d6d8";
const ALCANCE_ID = "9f2c4a10-7b31-4d6e-8a52-0c1e5b7d9a02";

function plantilla(parcial: Partial<PlantillaDeModulo> = {}): PlantillaDeModulo {
  return {
    id: ALCANCE_ID,
    clave: "alcance",
    orden: 2,
    rotuloOficial: "Alcance",
    descripcionOficial: "Qué trabajo asume el bufete.",
    rotulo: null,
    descripcion: null,
    rotuloVigente: "Alcance",
    descripcionVigente: "Qué trabajo asume el bufete.",
    activo: true,
    ...parcial,
  };
}

/**
 * El puerto, sustituido y con memoria.
 *
 * Guarda qué se le preguntó y en qué orden, que es lo que deja afirmar sobre
 * la precedencia de las comprobaciones en vez de sobre su resultado.
 */
interface Espia extends ServicioDePlantillas {
  readonly llamadas: string[];
  readonly escrito: DatosDePlantilla[];
}

function espia(opciones: {
  readonly fila?: PlantillaDeModulo | null;
  readonly resultado?: ResultadoDePlantilla;
} = {}): Espia {
  const llamadas: string[] = [];
  const escrito: DatosDePlantilla[] = [];
  const fila = opciones.fila === undefined ? plantilla() : opciones.fila;

  return {
    llamadas,
    escrito,
    listar(tenantId) {
      llamadas.push(`listar(${tenantId})`);
      return Promise.resolve(fila === null ? [] : [fila]);
    },
    obtener(tenantId, id) {
      llamadas.push(`obtener(${tenantId}, ${id})`);
      return Promise.resolve(fila);
    },
    guardar(tenantId, id, datos) {
      llamadas.push(`guardar(${tenantId}, ${id})`);
      escrito.push(datos);
      return Promise.resolve(
        opciones.resultado ?? { estado: "guardado", plantilla: plantilla() },
      );
    },
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

function responder(
  request: Request,
  servicio: ServicioDePlantillas,
): Promise<Response | null> {
  return rutasDePlantillas(
    request,
    new URL(request.url),
    TENANT,
    servicio,
  );
}

/* ==========================================================================
   Qué direcciones son de esta ruta y cuáles no
   ========================================================================== */

describe("qué direcciones reconoce", () => {
  /**
   * `null` y no un 404: quien llama tiene que seguir buscando y terminar en su
   * propio 404. Un 404 desde acá apagaría el resto del ruteo.
   */
  it.each([
    "/api/areas",
    "/api/plantillas",
    "/api/plantillas-modulos",
    "/plantillas-modulo",
    "/api",
  ])("`%s` no es de esta ruta", async (ruta) => {
    expect(await responder(peticion(ruta), espia())).toBeNull();
  });

  /**
   * La subruta de bitácora **no se la queda esta ruta**, y es el reparto que
   * `worker/index.ts` deja escrito. Si la atrapara, la historia de una
   * plantilla contestaría 405 en vez de leerse.
   */
  it("`/api/plantillas-modulo/{id}/bitacora` es de la bitácora, no de acá", async () => {
    const respuesta = await responder(
      peticion(`/api/plantillas-modulo/${ALCANCE_ID}/bitacora`),
      espia(),
    );

    expect(respuesta).toBeNull();
  });

  /**
   * Los segmentos vacíos no se filtran: `/api/plantillas-modulo//x` tiene que
   * ser una dirección desconocida y no «la plantilla de identificador vacío».
   */
  it("un segmento vacío no es un identificador", async () => {
    expect(
      await responder(peticion("/api/plantillas-modulo//x"), espia()),
    ).toBeNull();
  });

  /**
   * `%20` decodifica a un espacio, que **no** es vacío: el identificador llega
   * tal cual al puerto, que es quien decide si existe. Lo contrario —recortar
   * acá— sería que esta capa opinara sobre la forma de un identificador, y
   * entonces un `uuid` con un espacio pegado por un copiado mal hecho
   * contestaría 404 por dos motivos distintos sin poder distinguirlos.
   */
  it("un espacio escapado es un identificador, y llega al puerto", async () => {
    const puerto = espia();
    await responder(
      conCuerpo("/api/plantillas-modulo/%20", "PUT", { rotulo: "A" }),
      puerto,
    );

    expect(puerto.llamadas[0]).toBe(`obtener(${TENANT},  )`);
  });

  it("un porcentaje mal escrito contesta 404 sin consultar", async () => {
    const puerto = espia();
    const respuesta = await responder(
      conCuerpo("/api/plantillas-modulo/%ZZ", "PUT", { rotulo: "A" }),
      puerto,
    );

    expect(respuesta?.status).toBe(404);
    expect(puerto.llamadas).toEqual([]);
  });

  it("la barra final no cambia la dirección", async () => {
    const respuesta = await responder(
      peticion("/api/plantillas-modulo/"),
      espia(),
    );

    expect(respuesta?.status).toBe(200);
  });
});

/* ==========================================================================
   Los verbos
   ========================================================================== */

describe("los verbos que cada dirección admite", () => {
  it("la colección se lee, y nada más", async () => {
    const respuesta = await responder(
      peticion("/api/plantillas-modulo"),
      espia(),
    );

    expect(respuesta?.status).toBe(200);
    await expect(respuesta?.json()).resolves.toEqual({
      plantillas: [plantilla()],
    });
  });

  /**
   * **No hay `POST` ni `DELETE`**, y las dos ausencias son decisiones
   * distintas: crear está fuera del alcance de la tajada, y borrar no va a
   * existir nunca porque una plantilla borrada deja sin rótulo los módulos de
   * las cotizaciones vivas. Las dos se dicen con el mismo 405, y el `allow`
   * dice qué sí.
   */
  it.each(["POST", "DELETE", "PUT", "PATCH"])(
    "un %s sobre la colección es 405 con `allow: GET`",
    async (metodo) => {
      const puerto = espia();
      const respuesta = await responder(
        peticion("/api/plantillas-modulo", { method: metodo }),
        puerto,
      );

      expect(respuesta?.status).toBe(405);
      expect(respuesta?.headers.get("allow")).toBe("GET");
      // Y no consultó: un 405 que pasara por el repositorio sería una lectura
      // que nadie pidió.
      expect(puerto.llamadas).toEqual([]);
    },
  );

  it.each(["GET", "POST", "DELETE", "PATCH"])(
    "un %s sobre una plantilla es 405 con `allow: PUT`",
    async (metodo) => {
      const puerto = espia();
      // `GET` no admite cuerpo en el constructor de `Request`, y los otros tres
      // no lo necesitan: lo que se mide es el verbo.
      const respuesta = await responder(
        peticion(`/api/plantillas-modulo/${ALCANCE_ID}`, { method: metodo }),
        puerto,
      );

      expect(respuesta?.status).toBe(405);
      expect(respuesta?.headers.get("allow")).toBe("PUT");
      expect(puerto.llamadas).toEqual([]);
    },
  );

  /** Ninguna respuesta de esta ruta se puede guardar en caché. */
  it("todas las respuestas van sin caché", async () => {
    const lista = await responder(peticion("/api/plantillas-modulo"), espia());
    const escritura = await responder(
      conCuerpo(`/api/plantillas-modulo/${ALCANCE_ID}`, "PUT", { rotulo: "A" }),
      espia(),
    );
    const negado = await responder(
      peticion("/api/plantillas-modulo", { method: "POST" }),
      espia(),
    );

    expect(lista?.headers.get("cache-control")).toBe("no-store");
    expect(escritura?.headers.get("cache-control")).toBe("no-store");
    expect(negado?.headers.get("cache-control")).toBe("no-store");
  });
});

/* ==========================================================================
   El orden de las comprobaciones del `PUT`
   ========================================================================== */

describe("la existencia manda sobre el cuerpo", () => {
  /**
   * La decisión de T-5, y no es estética: si el cuerpo se revisara primero, un
   * cuerpo inválido contra un identificador ajeno contestaría 422 o 409, y
   * cualquiera de los dos ya confirma que ese identificador existe.
   */
  it("una plantilla de otro bufete contesta 404 aunque el cuerpo esté mal", async () => {
    const puerto = espia({ fila: null });
    const respuesta = await responder(
      conCuerpo(`/api/plantillas-modulo/${ALCANCE_ID}`, "PUT", {
        rotuloOficial: "falsificado",
        activo: "ni booleano",
      }),
      puerto,
    );

    expect(respuesta?.status).toBe(404);
    expect(puerto.llamadas).toEqual([`obtener(${TENANT}, ${ALCANCE_ID})`]);
  });

  it("se pregunta por la fila antes de mirar el JSON", async () => {
    const puerto = espia();
    await responder(
      conCuerpo(`/api/plantillas-modulo/${ALCANCE_ID}`, "PUT", { rotulo: "A" }),
      puerto,
    );

    expect(puerto.llamadas).toEqual([
      `obtener(${TENANT}, ${ALCANCE_ID})`,
      `guardar(${TENANT}, ${ALCANCE_ID})`,
    ]);
  });

  /**
   * 400 y no 422: 422 dice «entendí el cuerpo y no me sirve», y esto es «no
   * pude ni leerlo». Va **antes** de la existencia porque no hay nada que
   * confirmar: un cuerpo que no es JSON no nombra ningún identificador.
   */
  it("un cuerpo que no es JSON contesta 400", async () => {
    const puerto = espia();
    const respuesta = await responder(
      peticion(`/api/plantillas-modulo/${ALCANCE_ID}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: "{ esto no es json",
      }),
      puerto,
    );

    expect(respuesta?.status).toBe(400);
    await expect(respuesta?.json()).resolves.toEqual({
      error: "cuerpo_invalido",
    });
    expect(puerto.llamadas).toEqual([]);
  });
});

/* ==========================================================================
   Los dos 409, y por qué no son 422
   ========================================================================== */

describe("los dos conflictos de esta ruta", () => {
  /**
   * El 409 que `0016:436` encarga a esta tarea por su nombre: «el 409 que T-2
   * va a contestar para que la pantalla pueda explicar qué pasó, en vez de que
   * un `UPDATE` muera acá y salga como un 500 de SQLite crudo».
   */
  it("escribir el preestablecido es 409 `plantilla_inmutable`, y no se escribe nada", async () => {
    const puerto = espia();
    const respuesta = await responder(
      conCuerpo(`/api/plantillas-modulo/${ALCANCE_ID}`, "PUT", {
        rotulo: "Lo nuestro",
        rotuloOficial: "Falsificado",
      }),
      puerto,
    );

    expect(respuesta?.status).toBe(409);
    await expect(respuesta?.json()).resolves.toEqual({
      error: "plantilla_inmutable",
      campos: ["rotuloOficial"],
    });
    // Y no se descartó el campo en silencio con un 200, que es lo que le
    // enseñaría a la pantalla que la escritura funcionó.
    expect(puerto.escrito).toEqual([]);
  });

  it("escribir la clave es el mismo 409, nombrándola", async () => {
    const respuesta = await responder(
      conCuerpo(`/api/plantillas-modulo/${ALCANCE_ID}`, "PUT", {
        clave: "alcance_nuevo",
      }),
      espia(),
    );

    expect(respuesta?.status).toBe(409);
    await expect(respuesta?.json()).resolves.toEqual({
      error: "plantilla_inmutable",
      campos: ["clave"],
    });
  });

  /**
   * El otro 409, y **no es el mismo motivo**: `plantilla_inmutable` dice «ese
   * campo no se escribe nunca»; esto dice lo contrario —ese campo sí se
   * escribe, y lo que no se puede es dejarlo vacío porque debajo no hay
   * preestablecido—. Aplastarlos en uno dejaría a la pantalla diciéndole a
   * alguien que no puede editar su propia descripción.
   */
  it("vaciar sin preestablecido debajo es 409 `plantilla_sin_preset`", async () => {
    const puerto = espia({
      fila: plantilla({ descripcionOficial: null, descripcion: "Lo nuestro" }),
      resultado: { estado: "sin_preset", campos: ["descripcion"] },
    });

    const respuesta = await responder(
      conCuerpo(`/api/plantillas-modulo/${ALCANCE_ID}`, "PUT", {
        rotulo: "Alcance",
        descripcion: "",
      }),
      puerto,
    );

    expect(respuesta?.status).toBe(409);
    await expect(respuesta?.json()).resolves.toEqual({
      error: "plantilla_sin_preset",
      campos: ["descripcion"],
    });
  });

  /** Los dos motivos son cadenas distintas, que es lo que la pantalla lee. */
  it("los dos 409 no comparten motivo", async () => {
    const inmutable = await responder(
      conCuerpo(`/api/plantillas-modulo/${ALCANCE_ID}`, "PUT", { clave: "x" }),
      espia(),
    );
    const sinPreset = await responder(
      conCuerpo(`/api/plantillas-modulo/${ALCANCE_ID}`, "PUT", { rotulo: "" }),
      espia({ resultado: { estado: "sin_preset", campos: ["rotulo"] } }),
    );

    const uno = (await inmutable?.json()) as { error: string };
    const otro = (await sinPreset?.json()) as { error: string };

    expect(uno.error).not.toBe(otro.error);
  });

  /**
   * Una carrera perdida: la fila existía cuando se comprobó y ya no cuando se
   * escribió. Contesta 404, que es lo mismo que contestaría si nunca hubiera
   * existido — porque desde el punto de vista de quien pidió, no existe.
   */
  it("una fila que desaparece entre la comprobación y la escritura es 404", async () => {
    const respuesta = await responder(
      conCuerpo(`/api/plantillas-modulo/${ALCANCE_ID}`, "PUT", { rotulo: "A" }),
      espia({ resultado: { estado: "no_encontrado" } }),
    );

    expect(respuesta?.status).toBe(404);
  });
});

/* ==========================================================================
   Qué llega al puerto
   ========================================================================== */

describe("qué le llega al puerto", () => {
  /**
   * La regla que carga con la tajada, vista desde el cable: un campo vacío
   * llega al repositorio como `null`, que es «uso el preestablecido».
   */
  it("un campo vacío llega al puerto como nulo", async () => {
    const puerto = espia();
    await responder(
      conCuerpo(`/api/plantillas-modulo/${ALCANCE_ID}`, "PUT", {
        rotulo: "   ",
        descripcion: "",
      }),
      puerto,
    );

    expect(puerto.escrito).toEqual([
      { rotulo: null, descripcion: null, activo: true },
    ]);
  });

  /**
   * La baja llega por el mismo `PUT`, con el texto puesto. No hay ruta aparte,
   * y el argumento está en el encabezado de `worker/plantillas/rutas.ts`: la
   * infraestructura de `accionDeEdicion` ya existe para esto, y dos caminos
   * para escribir la misma columna son dos que pueden discrepar.
   */
  it("la baja viaja en el mismo cuerpo que el texto", async () => {
    const puerto = espia();
    await responder(
      conCuerpo(`/api/plantillas-modulo/${ALCANCE_ID}`, "PUT", {
        rotulo: "Alcance",
        descripcion: "Qué hacemos",
        activo: false,
      }),
      puerto,
    );

    expect(puerto.escrito).toEqual([
      { rotulo: "Alcance", descripcion: "Qué hacemos", activo: false },
    ]);
  });

  it("un `activo` que no es booleano es 422 y no llega al puerto", async () => {
    const puerto = espia();
    const respuesta = await responder(
      conCuerpo(`/api/plantillas-modulo/${ALCANCE_ID}`, "PUT", {
        activo: "si",
      }),
      puerto,
    );

    expect(respuesta?.status).toBe(422);
    await expect(respuesta?.json()).resolves.toEqual({
      error: "datos_invalidos",
      fallas: [{ campo: "activo", motivo: "tipo_invalido" }],
    });
    expect(puerto.escrito).toEqual([]);
  });

  /** La plantilla releída es lo que vuelve: la pantalla no adivina nada. */
  it("la respuesta trae la plantilla releída", async () => {
    const guardada = plantilla({
      rotulo: "Nuestro alcance",
      rotuloVigente: "Nuestro alcance",
    });
    const respuesta = await responder(
      conCuerpo(`/api/plantillas-modulo/${ALCANCE_ID}`, "PUT", {
        rotulo: "Nuestro alcance",
      }),
      espia({ resultado: { estado: "guardado", plantilla: guardada } }),
    );

    expect(respuesta?.status).toBe(200);
    await expect(respuesta?.json()).resolves.toEqual({ plantilla: guardada });
  });
});
