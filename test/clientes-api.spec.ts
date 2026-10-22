/**
 * La API de clientes (`odd/tasks/crm-procesos.md`, T-5).
 *
 * La vara de este proyecto es el rechazo, y acá tiene un motivo de producto
 * además del de higiene: el criterio de T-5 es que **un prospecto entre con un
 * nombre y un teléfono y nada más**. Una suite que solo demuestra que el alta
 * completa funciona no distingue este formulario del formulario rígido que el
 * invariante I-1/I-2 convierte en un bloqueo para cotizar.
 *
 * Entonces acá hay dos clases de prueba, y las dos hacen falta:
 *
 *  - **Rechazos**: la petición inválida concreta y la afirmación de que no
 *    entra. Incluye las dos formas de fuga de tenencia (leer y editar un
 *    cliente ajeno) y la petición sin identidad, que ni siquiera debe llegar
 *    al dominio.
 *  - **Contrapesos que releen**: el alta mínima y el alta completa se
 *    verifican **volviendo a leer la fila por la API**, no mirando la
 *    respuesta del `POST`. Un `POST` que contesta 201 y no guardó nada pasa
 *    cualquier aserción hecha sobre su propio eco.
 *
 * Las identidades entran por el seam `correoDeDesarrollo`, que es el mismo que
 * usa `test/acceso.spec.ts`: la verificación del JWT ya está probada ahí y
 * repetirla acá no agregaría nada. Lo que sí se prueba acá es que **sin
 * identidad no hay dominio**.
 */
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import type { ServicioDeClientes } from "../worker/clientes/repositorio";
import { TENANT_UNICO_ID, nuevoId } from "../worker/db/ids";
import { manejar } from "../worker/index";

const DOMINIO_DE_ACCESS = "https://bufete-de-prueba.cloudflareaccess.com";
const AUD = "aud-de-la-aplicacion-del-bufete";

const EMAIL_AUTOR = "itzel@bufete.test";
const EMAIL_AJENO = "ajena@otro-bufete.test";

/** El tenant vecino. Existe solo para que la fuga sea expresable. */
const OTRO_TENANT_ID = "0a5a6e0a-9f1e-4a6e-9f03-3b6a2a0e1d77";

/**
 * La forma del cliente en el cable. Se declara acá, y no se importa del
 * contrato del Worker, a propósito: lo que esta prueba vigila es el JSON que
 * ve el navegador. Importando el tipo, renombrar un campo en el servidor
 * renombraría también la expectativa y el cambio de contrato pasaría mudo.
 */
interface ClienteEnElCable {
  id: string;
  tipoClienteId: string | null;
  tipoClienteNombre: string | null;
  nombre: string;
  documentoTipo: string | null;
  documentoNumero: string | null;
  representanteLegal: string | null;
  email: string | null;
  telefono: string | null;
  notas: string | null;
  creadoPor: string;
  creadoPorNombre: string | null;
  creadoEn: string;
}

interface FallaEnElCable {
  campo: string;
  motivo: string;
}

let autorId: string;
let tipoEmpresaId: string;
let clienteAjenoId: string;

function entorno(ajustes: Partial<Env> = {}): Env {
  // Hermético, por la misma razón que en `test/acceso.spec.ts`: un
  // `.dev.vars` local con `ACCESO_DEV_EMAIL` no puede decidir qué identidad
  // observa la suite.
  return {
    ...env,
    ACCESO_TEAM_DOMAIN: DOMINIO_DE_ACCESS,
    ACCESO_AUD: AUD,
    ACCESO_DEV_EMAIL: undefined,
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

/** Una petición hecha por la identidad del bufete. */
function comoAutor(request: Request, email = EMAIL_AUTOR): Promise<Response> {
  return manejar(request, entorno(), { correoDeDesarrollo: () => email });
}

/** Una petición sin ninguna identidad: ni token, ni vía de desarrollo. */
function sinIdentidad(
  request: Request,
  clientes?: ServicioDeClientes,
): Promise<Response> {
  return manejar(request, entorno(), {
    correoDeDesarrollo: () => null,
    ...(clientes === undefined ? {} : { clientes }),
  });
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

async function clienteDe(respuesta: Response): Promise<ClienteEnElCable> {
  const cuerpo = (await respuesta.json()) as { cliente?: ClienteEnElCable };
  expect(cuerpo.cliente, "la respuesta no trae `cliente`").toBeDefined();
  return cuerpo.cliente as ClienteEnElCable;
}

/** Relee por la API, que es la única lectura que prueba que algo se guardó. */
async function releer(id: string): Promise<ClienteEnElCable> {
  const respuesta = await comoAutor(peticion(`/api/clientes/${id}`));
  expect(respuesta.status).toBe(200);
  return clienteDe(respuesta);
}

beforeEach(async () => {
  // El almacenamiento está aislado por archivo, no por prueba.
  await env.DB.prepare("DELETE FROM cliente").run();
  await env.DB.prepare("DELETE FROM tipo_cliente").run();
  await env.DB.prepare("DELETE FROM usuario").run();
  await env.DB.prepare("DELETE FROM tenant WHERE id <> ?")
    .bind(TENANT_UNICO_ID)
    .run();

  autorId = nuevoId();
  tipoEmpresaId = nuevoId();
  clienteAjenoId = nuevoId();
  const autorAjenoId = nuevoId();

  await env.DB.batch([
    env.DB.prepare("INSERT INTO tenant (id, nombre) VALUES (?, ?)").bind(
      OTRO_TENANT_ID,
      "Otro bufete",
    ),
    env.DB.prepare(
      "INSERT INTO usuario (id, tenant_id, nombre, email, activo)" +
        " VALUES (?, ?, ?, ?, 1)",
    ).bind(autorId, TENANT_UNICO_ID, "Itzel", EMAIL_AUTOR),
    env.DB.prepare(
      "INSERT INTO usuario (id, tenant_id, nombre, email, activo)" +
        " VALUES (?, ?, ?, ?, 1)",
    ).bind(autorAjenoId, OTRO_TENANT_ID, "Ajena", EMAIL_AJENO),
    env.DB.prepare(
      "INSERT INTO tipo_cliente (id, tenant_id, nombre, activo)" +
        " VALUES (?, ?, ?, 1)",
    ).bind(tipoEmpresaId, TENANT_UNICO_ID, "Empresa"),
    // El cliente del tenant vecino: el objeto de las dos pruebas de fuga.
    env.DB.prepare(
      "INSERT INTO cliente (id, tenant_id, nombre, telefono, creado_por," +
        " creado_en) VALUES (?, ?, ?, ?, ?, ?)",
    ).bind(
      clienteAjenoId,
      OTRO_TENANT_ID,
      "Cliente del vecino",
      "+507 6000-0000",
      autorAjenoId,
      new Date().toISOString(),
    ),
  ]);
});

// ---------------------------------------------------------------------------
// Rechazos
// ---------------------------------------------------------------------------

describe("el alta rechaza lo que no es un cliente", () => {
  it("rechaza un alta sin nombre", async () => {
    const respuesta = await comoAutor(
      conCuerpo("/api/clientes", "POST", { telefono: "+507 6123-4567" }),
    );

    expect(respuesta.status).toBe(422);
    expect(motivos(await fallasDe(respuesta))).toContain("nombre_requerido");

    const listado = await comoAutor(peticion("/api/clientes"));
    const cuerpo = (await listado.json()) as { clientes: ClienteEnElCable[] };
    expect(cuerpo.clientes, "no se guardó nada").toHaveLength(0);
  });

  it("rechaza un alta cuyo nombre es solo espacios", async () => {
    const respuesta = await comoAutor(
      conCuerpo("/api/clientes", "POST", {
        nombre: "   \t ",
        telefono: "+507 6123-4567",
      }),
    );

    expect(respuesta.status).toBe(422);
    expect(motivos(await fallasDe(respuesta))).toContain("nombre_requerido");
  });

  it("rechaza un alta con nombre pero sin ningún medio de contacto", async () => {
    const respuesta = await comoAutor(
      conCuerpo("/api/clientes", "POST", { nombre: "Carlos Pérez" }),
    );

    expect(respuesta.status).toBe(422);
    expect(motivos(await fallasDe(respuesta))).toContain("contacto_requerido");
  });

  it("rechaza un alta cuyos dos contactos vienen vacíos", async () => {
    // La forma que manda el formulario cuando el usuario no escribió nada:
    // los campos existen y están en blanco. Un contacto en blanco no es un
    // contacto.
    const respuesta = await comoAutor(
      conCuerpo("/api/clientes", "POST", {
        nombre: "Carlos Pérez",
        email: "  ",
        telefono: "",
      }),
    );

    expect(respuesta.status).toBe(422);
    expect(motivos(await fallasDe(respuesta))).toContain("contacto_requerido");
  });

  it("rechaza un alta con un `tipo_cliente_id` que no existe", async () => {
    const respuesta = await comoAutor(
      conCuerpo("/api/clientes", "POST", {
        nombre: "Carlos Pérez",
        telefono: "+507 6123-4567",
        tipoClienteId: nuevoId(),
      }),
    );

    expect(respuesta.status).toBe(422);
    expect(motivos(await fallasDe(respuesta))).toContain(
      "tipo_cliente_desconocido",
    );
  });

  it("rechaza un alta con un tipo que existe, pero en otro tenant", async () => {
    // El `tipo_cliente_id` existe en la tabla: lo que falla es I-8. Sin el
    // filtro por `tenant_id` en la consulta del catálogo, esto pasaría.
    const tipoAjenoId = nuevoId();
    await env.DB.prepare(
      "INSERT INTO tipo_cliente (id, tenant_id, nombre, activo)" +
        " VALUES (?, ?, ?, 1)",
    )
      .bind(tipoAjenoId, OTRO_TENANT_ID, "Fundación")
      .run();

    const respuesta = await comoAutor(
      conCuerpo("/api/clientes", "POST", {
        nombre: "Carlos Pérez",
        telefono: "+507 6123-4567",
        tipoClienteId: tipoAjenoId,
      }),
    );

    expect(respuesta.status).toBe(422);
    expect(motivos(await fallasDe(respuesta))).toContain(
      "tipo_cliente_desconocido",
    );
  });

  it("rechaza un correo que no es un correo", async () => {
    const respuesta = await comoAutor(
      conCuerpo("/api/clientes", "POST", {
        nombre: "Carlos Pérez",
        email: "no tengo",
      }),
    );

    expect(respuesta.status).toBe(422);
    expect(motivos(await fallasDe(respuesta))).toContain("correo_invalido");
  });

  it("rechaza un teléfono sin un solo dígito", async () => {
    // El modo real de falla no es un formato exótico, es alguien escribiendo
    // "no sé" en el campo y quedándose con un cliente sin forma de contacto.
    const respuesta = await comoAutor(
      conCuerpo("/api/clientes", "POST", {
        nombre: "Carlos Pérez",
        telefono: "no sé",
      }),
    );

    expect(respuesta.status).toBe(422);
    expect(motivos(await fallasDe(respuesta))).toContain("telefono_invalido");
  });

  it("rechaza un documento con tipo y sin número", async () => {
    const respuesta = await comoAutor(
      conCuerpo("/api/clientes", "POST", {
        nombre: "Inversiones del Istmo, S.A.",
        telefono: "+507 300-0000",
        documentoTipo: "RUC",
      }),
    );

    expect(respuesta.status).toBe(422);
    expect(motivos(await fallasDe(respuesta))).toContain(
      "documento_incompleto",
    );
  });

  it("rechaza un documento con número y sin tipo", async () => {
    const respuesta = await comoAutor(
      conCuerpo("/api/clientes", "POST", {
        nombre: "Inversiones del Istmo, S.A.",
        telefono: "+507 300-0000",
        documentoNumero: "155712345-2-2024",
      }),
    );

    expect(respuesta.status).toBe(422);
    expect(motivos(await fallasDe(respuesta))).toContain(
      "documento_incompleto",
    );
  });

  it("rechaza un campo que no es texto", async () => {
    const respuesta = await comoAutor(
      conCuerpo("/api/clientes", "POST", {
        nombre: { nombre: "Carlos" },
        telefono: "+507 6123-4567",
      }),
    );

    expect(respuesta.status).toBe(422);
    expect(motivos(await fallasDe(respuesta))).toContain("tipo_invalido");
  });

  it("rechaza un cuerpo que no es JSON", async () => {
    const respuesta = await comoAutor(
      peticion("/api/clientes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{ esto no es json",
      }),
    );

    expect(respuesta.status).toBe(400);
  });
});

describe("la tenencia no se cruza", () => {
  it("rechaza la LECTURA de un cliente de otro tenant", async () => {
    const respuesta = await comoAutor(
      peticion(`/api/clientes/${clienteAjenoId}`),
    );

    // 404 y no 403: un 403 confirmaría que ese identificador existe, que es
    // justo lo que no se quiere contar.
    expect(respuesta.status).toBe(404);
    expect(await respuesta.text()).not.toContain("Cliente del vecino");
  });

  it("rechaza la EDICIÓN de un cliente de otro tenant", async () => {
    const respuesta = await comoAutor(
      conCuerpo(`/api/clientes/${clienteAjenoId}`, "PUT", {
        nombre: "Secuestrado",
        telefono: "+507 6999-9999",
      }),
    );

    expect(respuesta.status).toBe(404);

    // Y la fila sigue intacta. Sin esta relectura, un `UPDATE` sin filtro de
    // tenencia que además contestara 404 pasaría la aserción de arriba.
    const fila = await env.DB.prepare(
      "SELECT nombre, telefono FROM cliente WHERE id = ?",
    )
      .bind(clienteAjenoId)
      .first<{ nombre: string; telefono: string }>();

    expect(fila?.nombre).toBe("Cliente del vecino");
    expect(fila?.telefono).toBe("+507 6000-0000");
  });

  it("el listado no muestra clientes de otro tenant", async () => {
    const creado = await comoAutor(
      conCuerpo("/api/clientes", "POST", {
        nombre: "Carlos Pérez",
        telefono: "+507 6123-4567",
      }),
    );
    expect(creado.status).toBe(201);

    const respuesta = await comoAutor(peticion("/api/clientes"));
    const cuerpo = (await respuesta.json()) as { clientes: ClienteEnElCable[] };

    expect(cuerpo.clientes.map((c) => c.nombre)).toEqual(["Carlos Pérez"]);
  });

  it("el catálogo de tipos no muestra los de otro tenant", async () => {
    await env.DB.prepare(
      "INSERT INTO tipo_cliente (id, tenant_id, nombre, activo)" +
        " VALUES (?, ?, ?, 1)",
    )
      .bind(nuevoId(), OTRO_TENANT_ID, "Fundación del vecino")
      .run();

    const respuesta = await comoAutor(peticion("/api/tipos-cliente"));
    const cuerpo = (await respuesta.json()) as {
      tipos: { nombre: string }[];
    };

    expect(cuerpo.tipos.map((t) => t.nombre)).toEqual(["Empresa"]);
  });
});

describe("sin identidad de Access no se llega al dominio", () => {
  /**
   * Un servicio que no sabe hacer nada salvo delatar que lo llamaron.
   *
   * Afirmar solo el 403 no probaría el enunciado: un manejador que creara el
   * cliente y **después** devolviera 403 pasaría esa aserción. Lo que lo
   * prueba es que ninguno de estos métodos se ejecute.
   */
  function servicioEspia(): { servicio: ServicioDeClientes; usos: string[] } {
    const usos: string[] = [];
    const registrar = (metodo: string) => () => {
      usos.push(metodo);
      throw new Error(`el dominio no debió ejecutarse: ${metodo}`);
    };

    return {
      usos,
      servicio: {
        listarTipos: registrar("listarTipos"),
        listar: registrar("listar"),
        obtener: registrar("obtener"),
        crear: registrar("crear"),
        actualizar: registrar("actualizar"),
      } as unknown as ServicioDeClientes,
    };
  }

  it("un alta sin identidad se rechaza y el dominio no se toca", async () => {
    const { servicio, usos } = servicioEspia();

    const respuesta = await sinIdentidad(
      conCuerpo("/api/clientes", "POST", {
        nombre: "Carlos Pérez",
        telefono: "+507 6123-4567",
      }),
      servicio,
    );

    expect(respuesta.status).toBe(403);
    expect(usos, "el dominio se ejecutó sin identidad").toEqual([]);

    // Y tampoco por otra vía: la tabla sigue vacía.
    const cuenta = await env.DB.prepare(
      "SELECT count(*) AS n FROM cliente WHERE tenant_id = ?",
    )
      .bind(TENANT_UNICO_ID)
      .first<{ n: number }>();
    expect(cuenta?.n).toBe(0);
  });

  it("el listado, el detalle y la edición tampoco pasan sin identidad", async () => {
    const { servicio, usos } = servicioEspia();
    const id = nuevoId();

    const respuestas = await Promise.all([
      sinIdentidad(peticion("/api/clientes"), servicio),
      sinIdentidad(peticion(`/api/clientes/${id}`), servicio),
      sinIdentidad(peticion("/api/tipos-cliente"), servicio),
      sinIdentidad(
        conCuerpo(`/api/clientes/${id}`, "PUT", { nombre: "x" }),
        servicio,
      ),
    ]);

    expect(respuestas.map((r) => r.status)).toEqual([403, 403, 403, 403]);
    expect(usos).toEqual([]);
  });

  it("una identidad que Access aprobaría pero no está en `usuario` tampoco entra", async () => {
    const { servicio, usos } = servicioEspia();

    const respuesta = await manejar(
      conCuerpo("/api/clientes", "POST", {
        nombre: "Carlos Pérez",
        telefono: "+507 6123-4567",
      }),
      entorno(),
      { correoDeDesarrollo: () => "nadie@gmail.test", clientes: servicio },
    );

    expect(respuesta.status).toBe(403);
    expect(usos).toEqual([]);
  });

  it("una identidad de otro tenant no ve nada de este", async () => {
    // El usuario ajeno existe y está activo, pero `resolverUsuario` filtra por
    // `TENANT_UNICO_ID`, así que no resuelve.
    const respuesta = await comoAutor(peticion("/api/clientes"), EMAIL_AJENO);

    expect(respuesta.status).toBe(403);
  });
});

describe("los métodos no permitidos se rechazan", () => {
  it("rechaza DELETE sobre un cliente", async () => {
    const respuesta = await comoAutor(
      peticion(`/api/clientes/${nuevoId()}`, { method: "DELETE" }),
    );

    expect(respuesta.status).toBe(405);
    expect(respuesta.headers.get("allow")).toBe("GET, PUT");
  });

  it("rechaza PUT sobre la colección", async () => {
    const respuesta = await comoAutor(
      conCuerpo("/api/clientes", "PUT", { nombre: "x" }),
    );

    expect(respuesta.status).toBe(405);
    expect(respuesta.headers.get("allow")).toBe("GET, POST");
  });
});

// ---------------------------------------------------------------------------
// Contrapesos: lo que SÍ entra, verificado releyendo
// ---------------------------------------------------------------------------

describe("el alta mínima — el criterio de T-5", () => {
  it("da de alta un prospecto con nombre y teléfono, y nada más", async () => {
    const respuesta = await comoAutor(
      conCuerpo("/api/clientes", "POST", {
        nombre: "Carlos Pérez",
        telefono: "+507 6123-4567",
      }),
    );

    expect(respuesta.status).toBe(201);
    const creado = await clienteDe(respuesta);
    expect(respuesta.headers.get("location")).toBe(
      `/api/clientes/${creado.id}`,
    );

    // La relectura, que es lo que prueba que se guardó.
    const releido = await releer(creado.id);

    expect(releido.nombre).toBe("Carlos Pérez");
    expect(releido.telefono).toBe("+507 6123-4567");
    expect(releido.email).toBeNull();
    expect(releido.tipoClienteId).toBeNull();
    expect(releido.documentoTipo).toBeNull();
    expect(releido.documentoNumero).toBeNull();
    expect(releido.representanteLegal).toBeNull();
    expect(releido.notas).toBeNull();

    // Autoría: `usuario_id`, nunca el nombre en texto (§6, "Autoría"). El
    // nombre se resuelve en lectura.
    expect(releido.creadoPor).toBe(autorId);
    expect(releido.creadoPorNombre).toBe("Itzel");

    // Y el momento es la forma exacta que la base acepta.
    expect(releido.creadoEn).toBe(new Date(releido.creadoEn).toISOString());
    expect(Date.now() - Date.parse(releido.creadoEn)).toBeLessThan(10_000);
  });

  it("da de alta un prospecto con nombre y correo, y nada más", async () => {
    // La otra mitad de «cualquiera de los dos alcanza». Sin esta prueba, una
    // regla que exigiera teléfono siempre pasaría la de arriba.
    const respuesta = await comoAutor(
      conCuerpo("/api/clientes", "POST", {
        nombre: "Ana Gómez",
        email: "ana@ejemplo.test",
      }),
    );

    expect(respuesta.status).toBe(201);
    const releido = await releer((await clienteDe(respuesta)).id);

    expect(releido.email).toBe("ana@ejemplo.test");
    expect(releido.telefono).toBeNull();
  });

  it("el prospecto recién dado de alta aparece en el listado", async () => {
    await comoAutor(
      conCuerpo("/api/clientes", "POST", {
        nombre: "Carlos Pérez",
        telefono: "+507 6123-4567",
      }),
    );

    const respuesta = await comoAutor(peticion("/api/clientes"));
    const cuerpo = (await respuesta.json()) as { clientes: ClienteEnElCable[] };

    expect(cuerpo.clientes).toHaveLength(1);
    expect(cuerpo.clientes[0].nombre).toBe("Carlos Pérez");
    expect(cuerpo.clientes[0].telefono).toBe("+507 6123-4567");
  });
});

describe("el alta completa conserva todos los campos", () => {
  const COMPLETO = {
    nombre: "Inversiones del Istmo, S.A.",
    documentoTipo: "RUC",
    documentoNumero: "155712345-2-2024 DV 33",
    representanteLegal: "María Candanedo",
    email: "contacto@istmo.test",
    telefono: "+507 300-1122",
    notas: "Llegó por recomendación de la notaría quinta. Pide factura.",
  };

  it("guarda y relee los siete campos más el tipo", async () => {
    const respuesta = await comoAutor(
      conCuerpo("/api/clientes", "POST", {
        ...COMPLETO,
        tipoClienteId: tipoEmpresaId,
      }),
    );

    expect(respuesta.status).toBe(201);
    const releido = await releer((await clienteDe(respuesta)).id);

    expect(releido.nombre).toBe(COMPLETO.nombre);
    expect(releido.documentoTipo).toBe(COMPLETO.documentoTipo);
    expect(releido.documentoNumero).toBe(COMPLETO.documentoNumero);
    expect(releido.representanteLegal).toBe(COMPLETO.representanteLegal);
    expect(releido.email).toBe(COMPLETO.email);
    expect(releido.telefono).toBe(COMPLETO.telefono);
    expect(releido.notas).toBe(COMPLETO.notas);
    expect(releido.tipoClienteId).toBe(tipoEmpresaId);
    // El nombre del tipo se resuelve en lectura, igual que el del autor.
    expect(releido.tipoClienteNombre).toBe("Empresa");
  });

  it("guarda el correo en minúsculas, como la puerta de acceso", async () => {
    const respuesta = await comoAutor(
      conCuerpo("/api/clientes", "POST", {
        nombre: "Ana Gómez",
        email: "  Ana.Gomez@Ejemplo.TEST  ",
      }),
    );

    expect(respuesta.status).toBe(201);
    const releido = await releer((await clienteDe(respuesta)).id);

    expect(releido.email).toBe("ana.gomez@ejemplo.test");
  });

  it("recorta los espacios de alrededor de cada campo", async () => {
    const respuesta = await comoAutor(
      conCuerpo("/api/clientes", "POST", {
        nombre: "  Carlos Pérez  ",
        telefono: "  +507 6123-4567 ",
      }),
    );

    const releido = await releer((await clienteDe(respuesta)).id);

    expect(releido.nombre).toBe("Carlos Pérez");
    expect(releido.telefono).toBe("+507 6123-4567");
  });
});

describe("la edición", () => {
  async function altaMinima(): Promise<string> {
    const respuesta = await comoAutor(
      conCuerpo("/api/clientes", "POST", {
        nombre: "Carlos Pérez",
        telefono: "+507 6123-4567",
      }),
    );
    expect(respuesta.status).toBe(201);
    return (await clienteDe(respuesta)).id;
  }

  it("completa un prospecto que empezó con lo mínimo", async () => {
    // El recorrido que da sentido al alta mínima: alguien llamó, se anotó el
    // nombre y el teléfono, y después se supo el resto.
    const id = await altaMinima();

    const respuesta = await comoAutor(
      conCuerpo(`/api/clientes/${id}`, "PUT", {
        nombre: "Carlos Pérez Vega",
        telefono: "+507 6123-4567",
        email: "carlos@ejemplo.test",
        tipoClienteId: tipoEmpresaId,
        documentoTipo: "Cédula",
        documentoNumero: "8-888-8888",
        notas: "Visa de pensionado.",
      }),
    );

    expect(respuesta.status).toBe(200);
    const releido = await releer(id);

    expect(releido.nombre).toBe("Carlos Pérez Vega");
    expect(releido.email).toBe("carlos@ejemplo.test");
    expect(releido.documentoNumero).toBe("8-888-8888");
    expect(releido.tipoClienteNombre).toBe("Empresa");
  });

  it("no reescribe la autoría ni el momento del alta", async () => {
    const id = await altaMinima();
    const antes = await releer(id);

    await comoAutor(
      conCuerpo(`/api/clientes/${id}`, "PUT", {
        nombre: "Carlos Pérez Vega",
        telefono: "+507 6123-4567",
      }),
    );

    const despues = await releer(id);
    expect(despues.creadoPor).toBe(antes.creadoPor);
    expect(despues.creadoEn).toBe(antes.creadoEn);
  });

  it("deja vaciar un campo opcional", async () => {
    const id = await altaMinima();

    await comoAutor(
      conCuerpo(`/api/clientes/${id}`, "PUT", {
        nombre: "Carlos Pérez",
        telefono: "+507 6123-4567",
        notas: "algo",
      }),
    );
    expect((await releer(id)).notas).toBe("algo");

    await comoAutor(
      conCuerpo(`/api/clientes/${id}`, "PUT", {
        nombre: "Carlos Pérez",
        telefono: "+507 6123-4567",
        notas: "",
      }),
    );
    expect((await releer(id)).notas).toBeNull();
  });

  it("rechaza una edición que deja al cliente sin ningún contacto", async () => {
    // La regla vale igual en la edición: si valiera solo en el alta, el mismo
    // cliente podría quedar incontactable un minuto después de crearse.
    const id = await altaMinima();

    const respuesta = await comoAutor(
      conCuerpo(`/api/clientes/${id}`, "PUT", {
        nombre: "Carlos Pérez",
        telefono: "",
        email: "",
      }),
    );

    expect(respuesta.status).toBe(422);
    expect(motivos(await fallasDe(respuesta))).toContain("contacto_requerido");
    expect((await releer(id)).telefono).toBe("+507 6123-4567");
  });

  it("rechaza la edición de un cliente que no existe", async () => {
    const respuesta = await comoAutor(
      conCuerpo(`/api/clientes/${nuevoId()}`, "PUT", {
        nombre: "Carlos Pérez",
        telefono: "+507 6123-4567",
      }),
    );

    expect(respuesta.status).toBe(404);
  });

  it("rechaza la lectura de un cliente que no existe", async () => {
    const respuesta = await comoAutor(peticion(`/api/clientes/${nuevoId()}`));

    expect(respuesta.status).toBe(404);
  });
});

describe("el catálogo de tipos de cliente", () => {
  it("devuelve los tipos del tenant con su marca de activo", async () => {
    const inactivoId = nuevoId();
    await env.DB.prepare(
      "INSERT INTO tipo_cliente (id, tenant_id, nombre, activo)" +
        " VALUES (?, ?, ?, 0)",
    )
      .bind(inactivoId, TENANT_UNICO_ID, "Asociación")
      .run();

    const respuesta = await comoAutor(peticion("/api/tipos-cliente"));
    expect(respuesta.status).toBe(200);

    const cuerpo = (await respuesta.json()) as {
      tipos: { id: string; nombre: string; activo: boolean }[];
    };

    // Ordenados por nombre, y el inactivo viaja marcado en vez de omitido:
    // un cliente viejo puede tener un tipo que ya no se ofrece, y la pantalla
    // de edición necesita poder nombrarlo.
    expect(cuerpo.tipos).toEqual([
      { id: inactivoId, nombre: "Asociación", activo: false },
      { id: tipoEmpresaId, nombre: "Empresa", activo: true },
    ]);
  });
});
