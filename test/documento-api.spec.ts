/**
 * La lectura del documento congelado (`odd/tasks/cotizaciones.md`, T-6).
 *
 * `GET /api/cotizaciones/{id}/documento` es la dirección que la salida
 * imprimible consume, y esta suite prueba **la única cosa que de verdad
 * decide si T-4 sirvió para algo**:
 *
 * > Lo que sale por acá es el snapshot, y no las tablas vivas.
 *
 * ## Cómo se prueba eso sin engañarse
 *
 * Una prueba que emite y después compara lo impreso contra lo que acaba de
 * sembrar **no distingue las dos fuentes**: las dos dirían lo mismo. Es la
 * segunda de las tres lecciones de prueba de esta tajada —un doble que
 * devuelve lo que se le envió no separa nada— con otra piel.
 *
 * Lo que las separa es **mover una de las dos después de emitir**. El
 * snapshot denormaliza a propósito tres textos que viven en tablas que
 * siguen vivas y editables después de la emisión:
 *
 *  - `cliente.nombre` y el resto de la ficha del cliente,
 *  - `tipo_cliente.nombre`, que viaja como `cliente.tipo`,
 *  - `tipo_proceso.nombre`, que viaja como `linea.tipoProceso`.
 *
 * Ninguna de las tres la congela I-4 —lo que `0006` vuelve inmutable es la
 * cotización y sus hijas, no el catálogo ni la ficha del cliente—, así que
 * las tres se pueden cambiar con un `UPDATE` y volver a leer. Si el
 * documento se moviera con ellas, estaría leyendo las tablas vivas.
 *
 * Y la afirmación lleva **contrapeso**: la misma prueba lee
 * `GET /api/cotizaciones/{id}`, que sí es la lectura viva, y exige que esa
 * sí haya cambiado. Sin esa mitad, un `UPDATE` que no hubiera escrito nada
 * haría pasar la prueba con el documento intacto por el motivo equivocado.
 *
 * ## No hay `beforeEach` que limpie
 *
 * Por lo mismo que en `test/emitir-api.spec.ts`: desde `0006` las hijas de
 * una emitida no se borran, que es I-4. Cada prueba trabaja con
 * identificadores nuevos sobre un almacenamiento ya aislado por archivo.
 *
 * Los totales esperados se escriben **a mano** y no salen de `totalesDe`
 * (restricción 6 de la tajada): una prueba que calcula su expectativa con
 * la función que prueba pasa aunque las dos estén mal.
 */
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { TENANT_UNICO_ID, nuevoId } from "../worker/db/ids";
import { ahoraIso } from "../worker/db/momentos";
import { manejar } from "../worker/index";

const DOMINIO_DE_ACCESS = "https://bufete-de-prueba.cloudflareaccess.com";
const AUD = "aud-de-la-aplicacion-del-bufete";

const EMAIL_AUTOR = "itzel@bufete.test";
const NOMBRE_AUTOR = "Itzel";

/** El tenant vecino. Existe solo para que la fuga sea expresable. */
const OTRO_TENANT_ID = "2c7b9e41-8a05-4f63-b2d4-1e6c09af7533";

/* Los textos del día de la emisión. Son los que el papel tiene que seguir
   diciendo cuando las filas vivas ya digan otra cosa. */
const NOMBRE_AL_EMITIR = "Constructora del Istmo, S.A.";
const TIPO_AL_EMITIR = "Persona jurídica";
const TRAMITE_AL_EMITIR = "Visa de trabajo";

/* Los textos de después. Ninguno se parece al de antes: un cambio que
   comparte prefijo con el original deja pasar una aserción floja. */
const NOMBRE_DESPUES = "Grupo Istmo Holdings, S.A. (antes Constructora)";
const TIPO_DESPUES = "Sociedad anónima";
const TRAMITE_DESPUES = "Permiso de residencia por trabajo";

let clienteId: string;
let tipoClienteId: string;
let tipoProcesoId: string;
let areaId: string;
let autorId: string;
let cotizacionAjenaId: string;

function entorno(): Env {
  // Hermético: un `.dev.vars` local no puede decidir qué identidad observa
  // la suite.
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
  return manejar(request, entorno(), { correoDeDesarrollo: () => EMAIL_AUTOR });
}

interface CotizacionEnElCable {
  id: string;
  codigo: string;
  estado: string;
  clienteNombre: string | null;
}

async function cotizacionDe(respuesta: Response): Promise<CotizacionEnElCable> {
  const cuerpo = (await respuesta.json()) as {
    cotizacion?: CotizacionEnElCable;
  };
  expect(cuerpo.cotizacion, "la respuesta no trae `cotizacion`").toBeDefined();
  return cuerpo.cotizacion as CotizacionEnElCable;
}

async function crearBorrador(): Promise<CotizacionEnElCable> {
  const respuesta = await comoAutor(
    conCuerpo("/api/cotizaciones", "POST", { clienteId }),
  );
  expect(respuesta.status, await respuesta.clone().text()).toBe(201);
  return cotizacionDe(respuesta);
}

async function agregarModulo(
  id: string,
  tipo: string,
  contenido: string,
): Promise<void> {
  const respuesta = await comoAutor(
    conCuerpo(`/api/cotizaciones/${id}/modulos`, "POST", { tipo, contenido }),
  );
  expect(respuesta.status, await respuesta.clone().text()).toBe(201);
}

async function agregarLinea(
  id: string,
  linea: {
    clase: string;
    concepto: string;
    monto: number;
    tipoProcesoId?: string | null;
  },
): Promise<void> {
  const respuesta = await comoAutor(
    conCuerpo(`/api/cotizaciones/${id}/lineas`, "POST", linea),
  );
  expect(respuesta.status, await respuesta.clone().text()).toBe(201);
}

function pedirDocumento(id: string, init?: RequestInit): Promise<Response> {
  return comoAutor(peticion(`/api/cotizaciones/${id}/documento`, init));
}

/** El documento, exigiendo 200. Lo que la pantalla imprimible recibe. */
async function documentoDe(id: string): Promise<Record<string, unknown>> {
  const respuesta = await pedirDocumento(id);
  expect(respuesta.status, await respuesta.clone().text()).toBe(200);

  const cuerpo = (await respuesta.json()) as {
    documento?: Record<string, unknown>;
  };
  expect(cuerpo.documento, "la respuesta no trae `documento`").toBeDefined();
  return cuerpo.documento as Record<string, unknown>;
}

/**
 * Una cotización completa y emitida: dos módulos, tres líneas y el `POST`.
 *
 * Los montos no son redondos a propósito —150 000, 7 550 y 12 345 centavos—
 * para que una suma mal escrita no dé por casualidad el número correcto.
 */
async function emitirUnaCompleta(): Promise<CotizacionEnElCable> {
  const borrador = await crearBorrador();

  await agregarModulo(borrador.id, "alcance", "Tramitación completa.");
  await agregarModulo(borrador.id, "exclusiones", "No incluye apelaciones.");

  await agregarLinea(borrador.id, {
    clase: "honorario",
    concepto: "Honorario profesional",
    monto: 150_000,
    tipoProcesoId,
  });
  await agregarLinea(borrador.id, {
    clase: "gasto_estimado",
    concepto: "Tasas de migración",
    monto: 7_550,
  });
  await agregarLinea(borrador.id, {
    clase: "honorario",
    concepto: "Acompañamiento en cita",
    monto: 12_345,
  });

  const respuesta = await comoAutor(
    peticion(`/api/cotizaciones/${borrador.id}/emitir`, { method: "POST" }),
  );
  expect(respuesta.status, await respuesta.clone().text()).toBe(200);

  return borrador;
}

beforeAll(async () => {
  autorId = nuevoId();
  tipoClienteId = nuevoId();
  clienteId = nuevoId();
  areaId = nuevoId();
  tipoProcesoId = nuevoId();
  cotizacionAjenaId = nuevoId();

  const clienteAjenoId = nuevoId();
  const autorAjenoId = nuevoId();
  const tipoClienteAjenoId = nuevoId();
  const ahora = ahoraIso();

  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO usuario (id, tenant_id, nombre, email, activo)" +
        " VALUES (?, ?, ?, ?, 1)",
    ).bind(autorId, TENANT_UNICO_ID, NOMBRE_AUTOR, EMAIL_AUTOR),
    env.DB.prepare(
      "INSERT INTO tipo_cliente (id, tenant_id, nombre) VALUES (?, ?, ?)",
    ).bind(tipoClienteId, TENANT_UNICO_ID, TIPO_AL_EMITIR),
    // Con todos los campos puestos: lo que esta suite vigila es que el
    // documento se baste solo, y media ficha en nulo dejaría media
    // afirmación sin probar.
    env.DB.prepare(
      "INSERT INTO cliente (id, tenant_id, tipo_cliente_id, nombre," +
        " documento_tipo, documento_numero, representante_legal, email," +
        " telefono, notas, creado_por, creado_en)" +
        " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(
      clienteId,
      TENANT_UNICO_ID,
      tipoClienteId,
      NOMBRE_AL_EMITIR,
      "RUC",
      "155123456-2-2024",
      "Ana Pérez",
      "contacto@istmo.test",
      "+507 6000-0000",
      "Paga tarde. Llamar antes del 25.",
      autorId,
      ahora,
    ),
    env.DB.prepare(
      "INSERT INTO area (id, tenant_id, nombre) VALUES (?, ?, ?)",
    ).bind(areaId, TENANT_UNICO_ID, "Migración"),
    env.DB.prepare(
      "INSERT INTO tipo_proceso (id, tenant_id, area_id, nombre)" +
        " VALUES (?, ?, ?, ?)",
    ).bind(tipoProcesoId, TENANT_UNICO_ID, areaId, TRAMITE_AL_EMITIR),

    /* El bufete vecino, con una cotización suya ya emitida: una emitida y no
       un borrador, para que el 404 de tenencia no pueda confundirse con el
       409 de «todavía no hay documento». */
    env.DB.prepare("INSERT INTO tenant (id, nombre) VALUES (?, ?)").bind(
      OTRO_TENANT_ID,
      "Otro bufete",
    ),
    env.DB.prepare(
      "INSERT INTO usuario (id, tenant_id, nombre, email) VALUES (?, ?, ?, ?)",
    ).bind(autorAjenoId, OTRO_TENANT_ID, "Ajena", "ajena@otro-bufete.test"),
    env.DB.prepare(
      "INSERT INTO tipo_cliente (id, tenant_id, nombre) VALUES (?, ?, ?)",
    ).bind(tipoClienteAjenoId, OTRO_TENANT_ID, "Particular"),
    env.DB.prepare(
      "INSERT INTO cliente (id, tenant_id, tipo_cliente_id, nombre, telefono," +
        " creado_por, creado_en) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).bind(
      clienteAjenoId,
      OTRO_TENANT_ID,
      tipoClienteAjenoId,
      "Cliente del vecino",
      "+507 6999-9999",
      autorAjenoId,
      ahora,
    ),
    env.DB.prepare(
      "INSERT INTO cotizacion (id, tenant_id, cliente_id, codigo, estado," +
        " fecha, moneda, snapshot, creada_por, creada_en)" +
        " VALUES (?, ?, ?, ?, 'emitida', ?, 'USD', ?, ?, ?)",
    ).bind(
      cotizacionAjenaId,
      OTRO_TENANT_ID,
      clienteAjenoId,
      `COT-DEL-VECINO-${cotizacionAjenaId}`,
      ahora,
      JSON.stringify({ version: 1, secreto: "del vecino" }),
      autorAjenoId,
      ahora,
    ),
  ]);
});

/* ==========================================================================
   Lo único que no se negocia
   ========================================================================== */

describe("el documento sale del snapshot y no de las tablas vivas", () => {
  it("las tres denormalizaciones no se mueven cuando su fila viva cambia", async () => {
    const cotizacion = await emitirUnaCompleta();

    // Lo que decía el papel el día que salió. Se lee **antes** de tocar
    // nada: sin esta mitad no hay con qué comparar después, y una prueba
    // que sólo mira el final no distingue «no cambió» de «nunca lo dijo».
    const antes = await documentoDe(cotizacion.id);
    const clienteAntes = antes.cliente as Record<string, unknown>;
    const lineasAntes = antes.lineas as Record<string, unknown>[];

    expect(clienteAntes.nombre).toBe(NOMBRE_AL_EMITIR);
    expect(clienteAntes.tipo).toBe(TIPO_AL_EMITIR);
    expect(lineasAntes[0].tipoProceso).toBe(TRAMITE_AL_EMITIR);

    // Y ahora se mueven las tres filas vivas. Ninguna de las tres la
    // congela I-4: lo que `0006` vuelve inmutable es la cotización y sus
    // hijas, no el catálogo ni la ficha del cliente.
    await env.DB.batch([
      env.DB.prepare("UPDATE cliente SET nombre = ? WHERE id = ?").bind(
        NOMBRE_DESPUES,
        clienteId,
      ),
      env.DB.prepare("UPDATE tipo_cliente SET nombre = ? WHERE id = ?").bind(
        TIPO_DESPUES,
        tipoClienteId,
      ),
      env.DB.prepare("UPDATE tipo_proceso SET nombre = ? WHERE id = ?").bind(
        TRAMITE_DESPUES,
        tipoProcesoId,
      ),
    ]);

    /*
     * El contrapeso, y no es higiene: **sin esto la prueba pasa aunque los
     * tres `UPDATE` no hayan escrito nada.**
     *
     * La lectura viva es la que tiene que haber cambiado, y es la que
     * demuestra que el cambio ocurrió de verdad. Recién entonces el
     * documento quieto significa algo: significa que lee otra fuente, y no
     * que no pasó nada.
     */
    const viva = await cotizacionDe(
      await comoAutor(peticion(`/api/cotizaciones/${cotizacion.id}`)),
    );
    expect(
      viva.clienteNombre,
      "la lectura viva no cambió: los UPDATE no escribieron y la prueba de" +
        " abajo no probaría nada",
    ).toBe(NOMBRE_DESPUES);

    // Y el papel, idéntico. Es T-6 entero.
    const despues = await documentoDe(cotizacion.id);
    const clienteDespues = despues.cliente as Record<string, unknown>;
    const lineasDespues = despues.lineas as Record<string, unknown>[];

    expect(clienteDespues.nombre).toBe(NOMBRE_AL_EMITIR);
    expect(clienteDespues.tipo).toBe(TIPO_AL_EMITIR);
    expect(lineasDespues[0].tipoProceso).toBe(TRAMITE_AL_EMITIR);

    // Y no sólo esos tres campos: el documento entero, byte por byte.
    expect(despues).toEqual(antes);
  });

  it("el documento no se mueve cuando la cotización se gana", async () => {
    // Criterio 3 de aceptación de la tajada, del lado de la ruta: el
    // snapshot de una emitida es idéntico seis meses después. `ganar`
    // reescribe `estado`, que es lo único de la fila que sigue vivo.
    const cotizacion = await emitirUnaCompleta();
    const antes = await documentoDe(cotizacion.id);

    const ganada = await comoAutor(
      peticion(`/api/cotizaciones/${cotizacion.id}/ganar`, { method: "POST" }),
    );
    expect(ganada.status, await ganada.clone().text()).toBe(200);

    expect(await documentoDe(cotizacion.id)).toEqual(antes);
  });

  it("una perdida también conserva su documento y se puede imprimir", async () => {
    // No es la misma prueba con otro verbo: lo que fija es que la
    // condición para imprimir **no es «está emitida»**. Si lo fuera, una
    // ganada y una perdida —que ya no lo están— dejarían de imprimirse, y
    // son justamente las que alguien va a buscar meses después.
    const cotizacion = await emitirUnaCompleta();

    const perdida = await comoAutor(
      peticion(`/api/cotizaciones/${cotizacion.id}/perder`, { method: "POST" }),
    );
    expect(perdida.status, await perdida.clone().text()).toBe(200);

    const documento = await documentoDe(cotizacion.id);
    expect((documento.cotizacion as Record<string, unknown>).codigo).toBe(
      cotizacion.codigo,
    );
  });

  it("la copia duplicada no hereda el documento del original", async () => {
    // Duplicar nace un borrador, y un borrador no tiene documento. Si lo
    // heredara, imprimir la copia mostraría el papel de otra cotización con
    // el código de ésta.
    const original = await emitirUnaCompleta();

    const copia = await cotizacionDe(
      await comoAutor(
        peticion(`/api/cotizaciones/${original.id}/duplicar`, {
          method: "POST",
        }),
      ),
    );

    const respuesta = await pedirDocumento(copia.id);
    expect(respuesta.status).toBe(409);
    expect(await respuesta.json()).toEqual({
      error: "cotizacion_sin_documento",
    });

    // Y el original sigue imprimiéndose: duplicar no le tocó nada.
    expect((await pedirDocumento(original.id)).status).toBe(200);
  });
});

/* ==========================================================================
   Qué contesta cuando no hay papel
   ========================================================================== */

describe("un borrador no tiene documento que entregar", () => {
  it("contesta 409 con `cotizacion_sin_documento`", async () => {
    const borrador = await crearBorrador();

    const respuesta = await pedirDocumento(borrador.id);
    expect(respuesta.status).toBe(409);
    expect(await respuesta.json()).toEqual({
      error: "cotizacion_sin_documento",
    });
  });

  it("y no es un 404, que diría que la cotización no existe", async () => {
    // El rechazo por separado, porque es la decisión de la ruta y no un
    // detalle del de arriba: con 404 la pantalla diría «no existe esa
    // cotización, o no es de este bufete» —`textoDeProblema`, palabra por
    // palabra— sobre un borrador propio que se está mirando.
    const borrador = await crearBorrador();

    expect((await pedirDocumento(borrador.id)).status).not.toBe(404);
  });

  it("el mismo borrador, ya emitido, sí lo entrega", async () => {
    // El contrapeso del 409: sin esto, una ruta rota que contestara 409
    // siempre pasaría las dos pruebas de arriba.
    const borrador = await crearBorrador();
    expect((await pedirDocumento(borrador.id)).status).toBe(409);

    await comoAutor(
      peticion(`/api/cotizaciones/${borrador.id}/emitir`, { method: "POST" }),
    );

    expect((await pedirDocumento(borrador.id)).status).toBe(200);
  });
});

/* ==========================================================================
   La superficie de la ruta
   ========================================================================== */

describe("la superficie de `/documento`", () => {
  it("un identificador que no existe es 404", async () => {
    expect((await pedirDocumento(nuevoId())).status).toBe(404);
  });

  it("la emitida del bufete vecino es 404 y no su documento (I-8)", async () => {
    // Un UUID ajeno sigue siendo un UUID. Es 404 y no 403 porque un 403
    // confirmaría que ese identificador existe.
    const respuesta = await pedirDocumento(cotizacionAjenaId);
    expect(respuesta.status).toBe(404);
    expect(await respuesta.text()).not.toContain("del vecino");
  });

  it("no admite otro método que GET", async () => {
    const cotizacion = await emitirUnaCompleta();

    for (const method of ["POST", "PUT", "DELETE"]) {
      const respuesta = await pedirDocumento(cotizacion.id, { method });
      expect(respuesta.status, `${method} tendría que ser 405`).toBe(405);
      expect(respuesta.headers.get("allow")).toBe("GET");
    }
  });

  it("el 405 no dice si la cotización existe", async () => {
    // Va antes de mirar la fila, igual que en las demás subrutas: un método
    // que esta dirección no admite no es una pregunta sobre ninguna
    // cotización.
    const respuesta = await pedirDocumento(nuevoId(), { method: "POST" });
    expect(respuesta.status).toBe(405);
  });

  it("`/documento/{algo}` cae en el 404 general", async () => {
    const cotizacion = await emitirUnaCompleta();

    const respuesta = await comoAutor(
      peticion(`/api/cotizaciones/${cotizacion.id}/documento/lo-que-sea`),
    );
    expect(respuesta.status).toBe(404);
  });

  it("no se guarda en caché", async () => {
    const cotizacion = await emitirUnaCompleta();
    const respuesta = await pedirDocumento(cotizacion.id);

    expect(respuesta.headers.get("cache-control")).toBe("no-store");
  });
});

/* ==========================================================================
   Qué entrega, exactamente
   ========================================================================== */

describe("lo que el documento trae", () => {
  it("trae los totales congelados, y la pantalla no tiene que sumar nada", async () => {
    const cotizacion = await emitirUnaCompleta();
    const documento = await documentoDe(cotizacion.id);

    // Escritos a mano y no derivados de las constantes de más arriba
    // (restricción 6): 150 000 + 12 345 = 162 345 honorarios, 7 550 de
    // gasto, 169 895 de total.
    expect(documento.totales).toEqual({
      honorarios: 162_345,
      gastosEstimados: 7_550,
      total: 169_895,
    });
  });

  it("trae los módulos y las líneas en su orden, con sus rótulos", async () => {
    const cotizacion = await emitirUnaCompleta();
    const documento = await documentoDe(cotizacion.id);

    expect(documento.modulos).toEqual([
      { tipo: "alcance", rotulo: "Alcance", contenido: "Tramitación completa." },
      {
        tipo: "exclusiones",
        rotulo: "Exclusiones",
        contenido: "No incluye apelaciones.",
      },
    ]);

    const lineas = documento.lineas as Record<string, unknown>[];
    expect(lineas.map((una) => una.concepto)).toEqual([
      "Honorario profesional",
      "Tasas de migración",
      "Acompañamiento en cita",
    ]);
    // Plural, que es como los dice `CATALOGO_DE_CLASES`. El rótulo viaja
    // congelado al lado de la clase justamente porque ese catálogo vive en
    // código y se puede renombrar en cualquier despliegue.
    expect(lineas.map((una) => una.rotulo)).toEqual([
      "Honorarios",
      "Gastos estimados",
      "Honorarios",
    ]);
  });

  it("no trae las notas internas del cliente", async () => {
    // Son apuntes del bufete sobre esa persona y nunca estuvieron en la
    // propuesta. La ruta nueva es un camino más por el que podrían salir, y
    // ésta es la prueba de que no sale por acá tampoco.
    const cotizacion = await emitirUnaCompleta();
    const respuesta = await pedirDocumento(cotizacion.id);

    expect(await respuesta.text()).not.toContain("Paga tarde");
  });

  it("trae la versión del documento, para quien lo lea en 2032", async () => {
    const cotizacion = await emitirUnaCompleta();
    const documento = await documentoDe(cotizacion.id);

    expect(documento.version).toBe(1);
  });
});
