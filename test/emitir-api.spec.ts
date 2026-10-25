/**
 * Emitir y congelar (`odd/tasks/cotizaciones.md`, T-4, unidad A).
 *
 * **Esta suite no vuelve a probar los invariantes.** I-4 e I-5 viven en
 * `migrations/0006_emitir_y_congelar.sql` y se prueban por rechazo en
 * `test/esquema-cotizaciones.spec.ts`, que es su dueño. Acá se prueba lo que
 * la base no puede sostener:
 *
 *  - **Qué guarda el snapshot**, que es la decisión entera de esta tarea. La
 *    base sólo exige que la columna esté; qué dice adentro es de
 *    `worker/cotizaciones/snapshot.ts`.
 *  - **Que el documento se baste solo**: que no haya que unir contra
 *    `cliente` ni contra `tipo_proceso` para entenderlo, que es lo que
 *    distingue un snapshot de una foto de llaves foráneas.
 *  - **La superficie de la ruta** y el orden de sus rechazos.
 *  - **La tenencia** (I-8): un UUID ajeno sigue siendo un UUID.
 *  - **El hecho en la bitácora**, que es lo único que queda del borde entre
 *    un documento editable y uno que ya salió.
 *
 * ## No hay `beforeEach` que limpie, y es una consecuencia de la tarea
 *
 * Los demás archivos de esta familia abren con un `DELETE FROM cotizacion_…`.
 * Acá no se puede: desde `0006`, las hijas de una cotización emitida **no se
 * borran**, que es justamente I-4. La suite no limpia nada; cada prueba
 * trabaja con identificadores nuevos sobre un almacenamiento que ya está
 * aislado por archivo. Que esa limpieza sea ilegal es, de paso, la prueba
 * más barata de que la guarda existe.
 *
 * Los valores esperados de los totales se escriben a mano y **no** salen de
 * `totalesDe` (restricción 6 de la tajada): una prueba que calcula su
 * expectativa con la función que prueba pasa aunque las dos estén mal.
 */
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { cotizacionesSobreD1 } from "../worker/cotizaciones/repositorio";
import { baseSobreD1 } from "../worker/db/base";
import { TENANT_UNICO_ID, nuevoId } from "../worker/db/ids";
import { ahoraIso } from "../worker/db/momentos";
import { manejar } from "../worker/index";

const DOMINIO_DE_ACCESS = "https://bufete-de-prueba.cloudflareaccess.com";
const AUD = "aud-de-la-aplicacion-del-bufete";

const EMAIL_AUTOR = "itzel@bufete.test";
const NOMBRE_AUTOR = "Itzel";

/** El tenant vecino. Existe solo para que la fuga sea expresable. */
const OTRO_TENANT_ID = "6f3d1a52-5c44-4a0e-9d17-2b8e77c0a311";

/**
 * La forma del momento canónico que toda la base exige. Se escribe acá y no
 * se importa de `worker/db/momentos.ts`: una prueba que valida con la misma
 * expresión que usó para construir el valor no valida nada.
 */
const MOMENTO_CANONICO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

interface CotizacionEnElCable {
  id: string;
  codigo: string;
  estado: string;
  clienteId: string;
  venceEn: string | null;
  moneda: string;
}

let autorId: string;
let clienteId: string;
let tipoClienteId: string;
let tipoProcesoId: string;
let areaId: string;
let cotizacionAjenaId: string;

function entorno(): Env {
  // Hermético, por la misma razón que en `test/acceso.spec.ts`: un
  // `.dev.vars` local no puede decidir qué identidad observa la suite.
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

async function cotizacionDe(respuesta: Response): Promise<CotizacionEnElCable> {
  const cuerpo = (await respuesta.json()) as {
    cotizacion?: CotizacionEnElCable;
  };
  expect(cuerpo.cotizacion, "la respuesta no trae `cotizacion`").toBeDefined();
  return cuerpo.cotizacion as CotizacionEnElCable;
}

/** El alta de un borrador por la ruta real. */
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

function emitir(id: string): Promise<Response> {
  return comoAutor(peticion(`/api/cotizaciones/${id}/emitir`, { method: "POST" }));
}

/**
 * El snapshot guardado, **leído de la base y no del eco de la respuesta**.
 *
 * La ruta de emisión no devuelve el snapshot a propósito —es el documento
 * entero y nadie que mire una ficha lo necesita—, así que la única forma de
 * afirmar qué se congeló es ir a buscarlo. Y es la correcta igual: una
 * respuesta que se afirma contra sí misma pasa aunque no se haya guardado
 * nada.
 */
async function snapshotDe(id: string): Promise<Record<string, unknown>> {
  const fila = await env.DB.prepare(
    "SELECT snapshot FROM cotizacion WHERE id = ?",
  )
    .bind(id)
    .first<{ snapshot: string | null }>();

  expect(fila?.snapshot, "la emitida tiene que tener snapshot").toBeTruthy();
  return JSON.parse(fila?.snapshot ?? "{}") as Record<string, unknown>;
}

/** Las acciones registradas contra la cotización, de la más vieja a la más nueva. */
async function bitacoraDe(
  id: string,
): Promise<{ accion: string; detalle: string | null }[]> {
  const { results } = await env.DB.prepare(
    "SELECT accion, detalle FROM bitacora WHERE entidad = 'cotizacion'" +
      " AND entidad_id = ? ORDER BY ocurrido_en, rowid",
  )
    .bind(id)
    .all<{ accion: string; detalle: string | null }>();

  return results;
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

  const respuesta = await emitir(borrador.id);
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
    ).bind(tipoClienteId, TENANT_UNICO_ID, "Persona jurídica"),
    // El cliente va **con todos sus campos puestos**: lo que esta suite
    // vigila es que el snapshot se baste solo, y un cliente con la mitad de
    // las columnas en nulo dejaría la mitad de esa afirmación sin probar.
    env.DB.prepare(
      "INSERT INTO cliente (id, tenant_id, tipo_cliente_id, nombre," +
        " documento_tipo, documento_numero, representante_legal, email," +
        " telefono, notas, creado_por, creado_en)" +
        " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(
      clienteId,
      TENANT_UNICO_ID,
      tipoClienteId,
      "Constructora del Istmo, S.A.",
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
    ).bind(tipoProcesoId, TENANT_UNICO_ID, areaId, "Visa de trabajo"),

    /* El bufete vecino, con una cotización suya en borrador. */
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
        " fecha, moneda, creada_por, creada_en)" +
        " VALUES (?, ?, ?, ?, 'borrador', ?, 'USD', ?, ?)",
    ).bind(
      cotizacionAjenaId,
      OTRO_TENANT_ID,
      clienteAjenoId,
      `COT-DEL-VECINO-${cotizacionAjenaId}`,
      ahora,
      autorAjenoId,
      ahora,
    ),
  ]);
});

describe("emitir deja la cotización congelada", () => {
  it("contesta 200 con la cotización ya emitida", async () => {
    // Contrapeso de toda la suite: si emitir no funcionara, las pruebas de
    // rechazo de abajo pasarían por el motivo equivocado.
    const borrador = await crearBorrador();
    expect(borrador.estado).toBe("borrador");

    const respuesta = await emitir(borrador.id);
    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get("cache-control")).toBe("no-store");

    const emitida = await cotizacionDe(respuesta);
    expect(emitida.id).toBe(borrador.id);
    expect(emitida.estado).toBe("emitida");
  });

  it("y la relectura por la API lo confirma", async () => {
    // El eco de un `POST` pasa cualquier aserción hecha sobre sí mismo.
    const borrador = await crearBorrador();
    await emitir(borrador.id);

    const respuesta = await comoAutor(
      peticion(`/api/cotizaciones/${borrador.id}`),
    );
    expect(respuesta.status).toBe(200);
    expect((await cotizacionDe(respuesta)).estado).toBe("emitida");
  });

  it("no devuelve el snapshot en el cuerpo", async () => {
    // Es el documento entero y nadie que mire una ficha lo necesita.
    // `SELECCION` lo deja afuera desde T-2 y esta prueba es lo que impide
    // que alguien lo agregue «porque está ahí».
    const borrador = await crearBorrador();
    const respuesta = await emitir(borrador.id);

    const cuerpo = (await respuesta.json()) as {
      cotizacion?: Record<string, unknown>;
    };
    expect(Object.keys(cuerpo.cotizacion ?? {})).not.toContain("snapshot");
  });

  it("emitir dos veces contesta 409 y dice en qué quedó", async () => {
    const borrador = await crearBorrador();
    expect((await emitir(borrador.id)).status).toBe(200);

    const segunda = await emitir(borrador.id);
    expect(segunda.status).toBe(409);
    expect(await segunda.json()).toEqual({
      error: "cotizacion_no_es_borrador",
      estado: "emitida",
    });
  });

  it("una ganada tampoco se puede emitir", async () => {
    // El 409 lleva el estado de verdad y no la etiqueta «emitida» pegada:
    // lo que la persona necesita saber es si alguien la emitió o si ya se
    // ganó. El salto a `ganada` se hace por SQL y no por la ruta de T-5, que
    // ya existe: esta suite prueba emitir, y hacerla depender de otra ruta
    // la rompería el día que aquélla cambie por un motivo que no es éste.
    const borrador = await crearBorrador();
    await emitir(borrador.id);
    await env.DB.prepare("UPDATE cotizacion SET estado = 'ganada' WHERE id = ?")
      .bind(borrador.id)
      .run();

    const respuesta = await emitir(borrador.id);
    expect(respuesta.status).toBe(409);
    expect(await respuesta.json()).toEqual({
      error: "cotizacion_no_es_borrador",
      estado: "ganada",
    });
  });
});

describe("después de emitir, el documento no se toca por ninguna ruta", () => {
  // La guarda vive en la base (I-4) y se prueba allá por rechazo. Lo que se
  // cierra acá es el otro extremo del cable: que la API conteste un 409
  // legible y no un 500 con el mensaje de un disparador.

  it("editar la cotización emitida da 409", async () => {
    const borrador = await emitirUnaCompleta();

    const respuesta = await comoAutor(
      conCuerpo(`/api/cotizaciones/${borrador.id}`, "PUT", {
        clienteId,
        venceEn: null,
      }),
    );
    expect(respuesta.status).toBe(409);
  });

  it("agregar una línea a la emitida da 409", async () => {
    const borrador = await emitirUnaCompleta();

    const respuesta = await comoAutor(
      conCuerpo(`/api/cotizaciones/${borrador.id}/lineas`, "POST", {
        clase: "honorario",
        concepto: "Honorario colado después de emitir",
        monto: 999_999,
      }),
    );
    expect(respuesta.status).toBe(409);
  });

  it("agregar un módulo a la emitida da 409", async () => {
    const borrador = await emitirUnaCompleta();

    const respuesta = await comoAutor(
      conCuerpo(`/api/cotizaciones/${borrador.id}/modulos`, "POST", {
        tipo: "clausulas",
        contenido: "Una cláusula que el cliente nunca vio.",
      }),
    );
    expect(respuesta.status).toBe(409);
  });

  it("leer sus líneas y sus módulos sigue funcionando", async () => {
    // **Leer nunca se bloquea.** Lo que el estado impide es cambiar el
    // documento, no mirarlo, y es lo que T-6 va a necesitar para
    // imprimirlo. Sin esta prueba, una guarda escrita de más en el `GET`
    // pasaría inadvertida.
    const borrador = await emitirUnaCompleta();

    const lineas = await comoAutor(
      peticion(`/api/cotizaciones/${borrador.id}/lineas`),
    );
    expect(lineas.status).toBe(200);

    const modulos = await comoAutor(
      peticion(`/api/cotizaciones/${borrador.id}/modulos`),
    );
    expect(modulos.status).toBe(200);
  });
});

describe("qué guarda el snapshot", () => {
  it("se basta solo: el cliente entero, sin unir contra nada", async () => {
    // El criterio de la tarea: dentro de seis años alguien lo abre para ver
    // qué se le prometió al cliente. Si para entenderlo hay que unir contra
    // `cliente` —una fila que pudo cambiar de nombre o irse—, el snapshot
    // no congeló nada.
    const borrador = await emitirUnaCompleta();
    const snapshot = await snapshotDe(borrador.id);

    expect(snapshot.cliente).toEqual({
      id: clienteId,
      nombre: "Constructora del Istmo, S.A.",
      // El **nombre** del tipo y no su identificador: `tipo_cliente` es un
      // catálogo que se edita y se da de baja.
      tipo: "Persona jurídica",
      documentoTipo: "RUC",
      documentoNumero: "155123456-2-2024",
      representanteLegal: "Ana Pérez",
      email: "contacto@istmo.test",
      telefono: "+507 6000-0000",
    });
  });

  it("y no se lleva las notas internas del cliente", async () => {
    // Son apuntes del bufete sobre esa persona —«paga tarde»—, nunca
    // estuvieron en la propuesta, y meterlas en el documento congelado las
    // volvería parte de él.
    const borrador = await emitirUnaCompleta();
    const snapshot = await snapshotDe(borrador.id);

    expect(JSON.stringify(snapshot)).not.toContain("Paga tarde");
    expect(Object.keys(snapshot.cliente as object)).not.toContain("notas");
  });

  it("guarda los módulos en su orden, con el rótulo que se leyó", async () => {
    // `tipo` **y** `rotulo`: el primero es la cadena del catálogo cerrado,
    // que un lector automático compara; el segundo es el encabezado que la
    // persona leyó, y `CATALOGO_DE_MODULOS` vive en código y se puede
    // renombrar en cualquier despliegue.
    const borrador = await emitirUnaCompleta();
    const snapshot = await snapshotDe(borrador.id);

    expect(snapshot.modulos).toEqual([
      {
        tipo: "alcance",
        rotulo: "Alcance",
        contenido: "Tramitación completa.",
      },
      {
        tipo: "exclusiones",
        rotulo: "Exclusiones",
        contenido: "No incluye apelaciones.",
      },
    ]);
  });

  it("guarda las líneas con el nombre del trámite resuelto", async () => {
    const borrador = await emitirUnaCompleta();
    const snapshot = await snapshotDe(borrador.id);

    expect(snapshot.lineas).toEqual([
      {
        clase: "honorario",
        rotulo: "Honorarios",
        concepto: "Honorario profesional",
        monto: 150_000,
        tipoProcesoId,
        // El nombre al lado de la llave, que es lo que hace que la línea se
        // entienda sin unir contra `tipo_proceso`.
        tipoProceso: "Visa de trabajo",
      },
      {
        clase: "gasto_estimado",
        rotulo: "Gastos estimados",
        concepto: "Tasas de migración",
        monto: 7_550,
        tipoProcesoId: null,
        tipoProceso: null,
      },
      {
        clase: "honorario",
        rotulo: "Honorarios",
        concepto: "Acompañamiento en cita",
        monto: 12_345,
        tipoProcesoId: null,
        tipoProceso: null,
      },
    ]);
  });

  it("guarda los totales calculados, en centavos enteros", async () => {
    // Los tres números están escritos a mano y no salen de `totalesDe`
    // (restricción 6). 150 000 + 12 345 = 162 345 de honorarios, 7 550 de
    // gasto, 169 895 de total.
    const borrador = await emitirUnaCompleta();
    const snapshot = await snapshotDe(borrador.id);

    expect(snapshot.totales).toEqual({
      honorarios: 162_345,
      gastosEstimados: 7_550,
      total: 169_895,
    });
  });

  it("guarda quién emitió y cuándo, con el nombre resuelto", async () => {
    const borrador = await emitirUnaCompleta();
    const snapshot = await snapshotDe(borrador.id);

    expect(snapshot.emitidaPor).toEqual({ id: autorId, nombre: NOMBRE_AUTOR });
    expect(snapshot.emitidaEn).toMatch(MOMENTO_CANONICO);
  });

  it("guarda la cotización misma, y lleva número de versión", async () => {
    const borrador = await emitirUnaCompleta();
    const snapshot = await snapshotDe(borrador.id);

    expect(snapshot.version).toBe(1);
    expect(snapshot.cotizacion).toEqual({
      id: borrador.id,
      codigo: borrador.codigo,
      fecha: expect.stringMatching(MOMENTO_CANONICO) as unknown,
      venceEn: null,
      moneda: "USD",
    });
  });

  it("deja afuera el estado, la tenencia y el orden, y eso es la decisión", async () => {
    // Cada ausencia tiene su motivo y los tres son distintos:
    //
    //  - `estado` es lo único de la cotización que sigue vivo después de
    //    emitir. Una copia acá adentro quedaría congelada en «emitida» para
    //    siempre, y el primero que la lea le va a creer al que miente.
    //  - `tenant_id` ya está en la fila que contiene al snapshot. Copiarlo
    //    sería crear un valor que puede contradecir a su propia fila.
    //  - El `orden` **es** la posición en el arreglo. Un número al lado
    //    sería un segundo lugar diciendo lo mismo.
    const borrador = await emitirUnaCompleta();
    const snapshot = await snapshotDe(borrador.id);

    const cotizacion = snapshot.cotizacion as Record<string, unknown>;
    expect(Object.keys(cotizacion)).not.toContain("estado");
    expect(Object.keys(cotizacion)).not.toContain("tenantId");
    expect(Object.keys(cotizacion)).not.toContain("duplicadaDeId");

    const modulos = snapshot.modulos as Record<string, unknown>[];
    const lineas = snapshot.lineas as Record<string, unknown>[];
    expect(Object.keys(modulos[0])).not.toContain("orden");
    expect(Object.keys(lineas[0])).not.toContain("orden");

    // Y tampoco el `id` de cada módulo ni el de cada línea: son direcciones
    // de filas vivas, y el snapshot existe para no depender de ellas. El
    // `tipoProcesoId` sí queda, y la diferencia está escrita en
    // `worker/cotizaciones/snapshot.ts`: ése apunta afuera, a una fila que
    // T-7 va a volver a usar.
    expect(Object.keys(modulos[0])).not.toContain("id");
    expect(Object.keys(lineas[0])).not.toContain("id");
  });

  it("una cotización sin módulos ni líneas congela un documento vacío", async () => {
    // **No hay regla que lo impida, y la ausencia es deliberada.** Ni el
    // plan de la tajada ni `docs/diseno.md` dicen que una propuesta tenga
    // que traer líneas para salir, así que inventar un 422 acá sería
    // escribir negocio desde el repositorio. Queda fijado como está para
    // que la decisión sea visible y no un descuido: si mañana el bufete
    // dice que una cotización vacía no se emite, esta prueba es la que hay
    // que cambiar.
    const borrador = await crearBorrador();
    expect((await emitir(borrador.id)).status).toBe(200);

    const snapshot = await snapshotDe(borrador.id);
    expect(snapshot.modulos).toEqual([]);
    expect(snapshot.lineas).toEqual([]);
    expect(snapshot.totales).toEqual({
      honorarios: 0,
      gastosEstimados: 0,
      total: 0,
    });
  });

  it("el snapshot es idéntico después de ganar la cotización", async () => {
    // Criterio 3 de aceptación de la tajada —«el snapshot de una emitida es
    // idéntico seis meses después»— medido sobre la transición desnuda. La
    // misma afirmación sobre la **ruta** de ganar la hace
    // `test/ciclo-api.spec.ts`, que es su dueña; acá queda la del `UPDATE`
    // pelado, que es la que sigue valiendo si mañana esa ruta cambia.
    const borrador = await emitirUnaCompleta();
    const antes = await snapshotDe(borrador.id);

    await env.DB.prepare("UPDATE cotizacion SET estado = 'ganada' WHERE id = ?")
      .bind(borrador.id)
      .run();

    expect(await snapshotDe(borrador.id)).toEqual(antes);
  });
});

describe("el hecho queda en la bitácora", () => {
  it("emitir registra «emitido» con el código, y una sola vez", async () => {
    const borrador = await crearBorrador();
    await emitir(borrador.id);

    expect(await bitacoraDe(borrador.id)).toEqual([
      { accion: "creado", detalle: borrador.codigo },
      { accion: "emitido", detalle: borrador.codigo },
    ]);
  });

  it("el hecho no se registra contra ninguna otra entidad", async () => {
    // «Un hecho, una entidad»: emitir es un hecho de la cotización, no del
    // cliente. Duplicarlo haría que la ficha de un cliente con treinta
    // cotizaciones contestara «¿quién tocó esta ficha?» con treinta hechos
    // que no son de la ficha.
    const borrador = await crearBorrador();
    await emitir(borrador.id);

    const { results } = await env.DB.prepare(
      "SELECT entidad FROM bitacora WHERE accion = 'emitido'" +
        " AND entidad_id = ?",
    )
      .bind(borrador.id)
      .all<{ entidad: string }>();

    expect(results.map((fila) => fila.entidad)).toEqual(["cotizacion"]);
  });

  it("el 409 de la segunda emisión no agrega un hecho de más", async () => {
    // Lo que sí queda es el residuo conocido de la carrera perdida, que
    // vive una capa más abajo: acá el 409 se decide **contando** el estado
    // antes de llamar a `mutar`, así que no llega a escribirse nada.
    const borrador = await crearBorrador();
    await emitir(borrador.id);
    await emitir(borrador.id);

    const emitidos = (await bitacoraDe(borrador.id)).filter(
      (hecho) => hecho.accion === "emitido",
    );
    expect(emitidos).toHaveLength(1);
  });
});

describe("la superficie de la ruta es exactamente la que se decidió", () => {
  it.each(["GET", "PUT", "DELETE", "PATCH"])(
    "%s sobre /emitir contesta 405 y nombra el verbo que sí",
    async (metodo) => {
      const borrador = await crearBorrador();
      const respuesta = await comoAutor(
        peticion(`/api/cotizaciones/${borrador.id}/emitir`, { method: metodo }),
      );

      expect(respuesta.status).toBe(405);
      expect(respuesta.headers.get("allow")).toBe("POST");
    },
  );

  it("el 405 llega sin decir si la cotización existe", async () => {
    // Igual que en módulos y en líneas: un verbo que esta dirección no
    // tiene no es una pregunta sobre ninguna cotización, así que
    // contestarlo no puede filtrar que ese identificador existe.
    const respuesta = await comoAutor(
      peticion(`/api/cotizaciones/${nuevoId()}/emitir`, { method: "GET" }),
    );

    expect(respuesta.status).toBe(405);
  });

  it("una subruta debajo de /emitir cae en el 404 general", async () => {
    const borrador = await crearBorrador();
    const respuesta = await comoAutor(
      peticion(`/api/cotizaciones/${borrador.id}/emitir/ya`, { method: "POST" }),
    );

    expect(respuesta.status).toBe(404);
  });

  it("emitir no lee el cuerpo: un JSON roto no cambia nada", async () => {
    // Emitir no lleva cuerpo. Si lo leyera, un JSON mal escrito contestaría
    // 400 y habría una forma de influir desde afuera sobre la única
    // escritura del sistema que no se puede deshacer.
    const borrador = await crearBorrador();
    const respuesta = await comoAutor(
      peticion(`/api/cotizaciones/${borrador.id}/emitir`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{ esto no es json",
      }),
    );

    expect(respuesta.status).toBe(200);
  });
});

describe("las cotizaciones del bufete vecino no existen desde acá", () => {
  it("emitir una cotización ajena da 404", async () => {
    const respuesta = await emitir(cotizacionAjenaId);
    expect(respuesta.status).toBe(404);
  });

  it("y no la emitió: sigue siendo un borrador del vecino", async () => {
    // El contrapeso que hace a la prueba sobre la consecuencia: un 404 que
    // llegara **después** de escribir sería el peor de los dos resultados.
    await emitir(cotizacionAjenaId);

    const fila = await env.DB.prepare(
      "SELECT estado, snapshot FROM cotizacion WHERE id = ?",
    )
      .bind(cotizacionAjenaId)
      .first<{ estado: string; snapshot: string | null }>();

    expect(fila).toEqual({ estado: "borrador", snapshot: null });
  });

  it("emitir algo que no existe da 404", async () => {
    expect((await emitir(nuevoId())).status).toBe(404);
  });

  it("el puerto se niega igual, sin pasar por la ruta", async () => {
    // T-5 va a llamar al puerto directo, sin ruta delante. Una regla que
    // sólo estuviera en el ruteo sería una regla que esa tarea se salta sin
    // enterarse — es el mismo argumento con el que `borradorParaEscribir`
    // vive en el repositorio.
    const servicio = cotizacionesSobreD1(
      baseSobreD1(env.DB, TENANT_UNICO_ID, autorId),
    );

    expect(
      await servicio.emitir(TENANT_UNICO_ID, autorId, cotizacionAjenaId),
    ).toEqual({ estado: "no_encontrado" });
  });

  it("el puerto también se niega a emitir dos veces", async () => {
    const servicio = cotizacionesSobreD1(
      baseSobreD1(env.DB, TENANT_UNICO_ID, autorId),
    );
    const borrador = await crearBorrador();

    const primera = await servicio.emitir(TENANT_UNICO_ID, autorId, borrador.id);
    expect(primera.estado).toBe("emitida");

    expect(
      await servicio.emitir(TENANT_UNICO_ID, autorId, borrador.id),
    ).toEqual({ estado: "no_es_borrador", actual: "emitida" });
  });
});

describe("quien emite queda firmado adentro del documento", () => {
  it("el emisor sale de la identidad y nunca del cuerpo (I-6)", async () => {
    // El `emisorId` del puerto es el que llega de la puerta de Access. Acá
    // se llama al puerto con **otra** persona del bufete para demostrar que
    // es ese argumento —y no el autor del borrador, ni nada del cuerpo— lo
    // que termina en `emitidaPor`.
    const otroId = nuevoId();
    await env.DB.prepare(
      "INSERT INTO usuario (id, tenant_id, nombre, email) VALUES (?, ?, ?, ?)",
    )
      .bind(otroId, TENANT_UNICO_ID, "Rosa", `${otroId}@bufete.test`)
      .run();

    const borrador = await crearBorrador();
    const servicio = cotizacionesSobreD1(
      baseSobreD1(env.DB, TENANT_UNICO_ID, otroId),
    );
    await servicio.emitir(TENANT_UNICO_ID, otroId, borrador.id);

    const snapshot = await snapshotDe(borrador.id);
    expect(snapshot.emitidaPor).toEqual({ id: otroId, nombre: "Rosa" });

    // Y el borrador lo había abierto Itzel: el snapshot distingue las dos
    // autorías porque son dos hechos distintos.
    const fila = await env.DB.prepare(
      "SELECT creada_por FROM cotizacion WHERE id = ?",
    )
      .bind(borrador.id)
      .first<{ creada_por: string }>();
    expect(fila?.creada_por).toBe(autorId);
  });
});
