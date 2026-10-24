/**
 * La lógica de las pantallas de la cotización en borrador (T-2, unidad B).
 *
 * Lo que se prueba acá es **lógica pura**: la resolución de las rutas nuevas,
 * el borrador del formulario con su validación, el mínimo del campo de fecha
 * y los derivados de presentación. Por eso ninguno de esos módulos importa
 * React ni toca el DOM, y por eso esta suite corre en el mismo corredor que
 * la del Worker en vez de arrastrar un navegador.
 *
 * La validación del formulario es **la segunda copia** de las reglas de
 * `worker/cotizaciones/dominio.ts`, igual que la del cliente en T-5. La que
 * manda es la del Worker, probada en `cotizaciones-api.spec.ts`; ésta existe
 * para avisar antes de mandar. Las dos se prueban por separado a propósito:
 * aflojar una tiene que matar sus propias pruebas y no las de la otra.
 *
 * ## Las fechas de esta suite son literales, y eso acá es correcto
 *
 * `test/cotizaciones-api.spec.ts` tiene que derivar sus días del reloj —con
 * `enDias`— porque sus peticiones pasan por un servidor que mira el
 * calendario de verdad, y un `2027-01-15` escrito a mano empieza a fallar
 * solo el 16 de enero de 2027. Acá no pasa eso: **ninguna de estas funciones
 * lee el reloj**. El día de hoy, o el momento del que sale, entra siempre
 * como argumento, así que un literal describe un escenario fijo que no
 * caduca nunca.
 *
 * Y las expectativas se escriben a mano y **nunca se calculan con la función
 * bajo prueba** —ni con `hoyEnPanama`, que es la que `minimoDeVencimiento`
 * usa por dentro—: una prueba que computa lo que espera con la misma función
 * que prueba pasa aunque las dos estén mal.
 */
import { describe, expect, it } from "vitest";

import type { Cliente, Cotizacion } from "../worker/contract";
import { textoDeProblema } from "../src/api/peticiones";
import {
  BORRADOR_DE_COTIZACION_VACIO,
  aPeticion,
  avisoDelDesplegable,
  borradorDesde,
  clientesSeleccionables,
  minimoDeVencimiento,
  validarBorrador,
  type BorradorDeCotizacion,
} from "../src/pantallas/cotizaciones/formulario";
import {
  avisoDeNoEsBorrador,
  clienteDe,
  estaVencida,
  estadoLegible,
  filtrarCotizaciones,
  ordenarCotizaciones,
  vencimientoDe,
} from "../src/pantallas/cotizaciones/presentacion";
import { enlaceDe, resolverRuta } from "../src/ruteo";

const ID = "9c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f";
const CLIENTE_ID = "4a3f1d0e-0e2c-4c1f-9a6b-2d8a1c5e7b90";

function cotizacion(ajustes: Partial<Cotizacion> = {}): Cotizacion {
  return {
    id: ID,
    codigo: "COT-2026-0007",
    estado: "borrador",
    clienteId: CLIENTE_ID,
    clienteNombre: "Carlos Pérez",
    fecha: "2026-10-22T14:03:00.000Z",
    venceEn: null,
    moneda: "USD",
    duplicadaDeId: null,
    creadaPor: "7335d417-61da-459d-899c-0a01c76a2f94",
    creadaPorNombre: "Itzel",
    creadaEn: "2026-10-22T14:03:00.000Z",
    ...ajustes,
  };
}

function borrador(
  ajustes: Partial<BorradorDeCotizacion> = {},
): BorradorDeCotizacion {
  return { ...BORRADOR_DE_COTIZACION_VACIO, ...ajustes };
}

function motivos(fallas: readonly { motivo: string }[]): string[] {
  return fallas.map((falla) => falla.motivo);
}

// ---------------------------------------------------------------------------
// Ruteo
// ---------------------------------------------------------------------------

describe("resolverRuta, sobre las cotizaciones", () => {
  it("resuelve las cuatro pantallas", () => {
    expect(resolverRuta("/cotizaciones")).toEqual({ nombre: "cotizaciones" });
    expect(resolverRuta("/cotizaciones/nuevo")).toEqual({
      nombre: "cotizacion-nueva",
    });
    expect(resolverRuta(`/cotizaciones/${ID}`)).toEqual({
      nombre: "cotizacion",
      id: ID,
    });
    expect(resolverRuta(`/cotizaciones/${ID}/editar`)).toEqual({
      nombre: "cotizacion-edicion",
      id: ID,
    });
  });

  it("no confunde `/cotizaciones/nuevo` con una cotización llamada «nuevo»", () => {
    // El error clásico del ruteo a mano: el segmento literal cae en la rama
    // del parámetro y la pantalla de alta no se alcanza nunca.
    expect(resolverRuta("/cotizaciones/nuevo")).not.toMatchObject({
      nombre: "cotizacion",
    });
  });

  it("tolera la barra final, que es lo que pega la gente", () => {
    expect(resolverRuta("/cotizaciones/")).toEqual({ nombre: "cotizaciones" });
    expect(resolverRuta(`/cotizaciones/${ID}/`)).toEqual({
      nombre: "cotizacion",
      id: ID,
    });
  });

  it("decodifica el identificador que viene percent-encoded", () => {
    expect(resolverRuta("/cotizaciones/a%20b")).toEqual({
      nombre: "cotizacion",
      id: "a b",
    });
  });

  it("no inventa una ruta para lo que no conoce", () => {
    // Un id vacío no es un id: `/cotizaciones//editar` no es «la cotización
    // de identificador vacío».
    expect(resolverRuta("/cotizaciones//editar")).toMatchObject({
      nombre: "desconocida",
    });
    expect(resolverRuta(`/cotizaciones/${ID}/emitir`)).toMatchObject({
      nombre: "desconocida",
    });
    expect(resolverRuta(`/cotizaciones/${ID}/x/y`)).toMatchObject({
      nombre: "desconocida",
    });
    // Los módulos y las líneas son de la unidad C y de T-3: hoy no existen,
    // y una ruta que resolviera a una pantalla en blanco sería peor que un
    // «esa página no existe».
    expect(resolverRuta(`/cotizaciones/${ID}/modulos`)).toMatchObject({
      nombre: "desconocida",
    });
  });

  it("vuelve de la ruta al enlace sin perder el identificador", () => {
    const rutas = [
      "/cotizaciones",
      "/cotizaciones/nuevo",
      `/cotizaciones/${ID}`,
      `/cotizaciones/${ID}/editar`,
    ];

    for (const ruta of rutas) {
      expect(enlaceDe(resolverRuta(ruta))).toBe(ruta);
    }
  });

  it("escapa el identificador al armar el enlace", () => {
    expect(enlaceDe({ nombre: "cotizacion", id: "a b" })).toBe(
      "/cotizaciones/a%20b",
    );
  });
});

// ---------------------------------------------------------------------------
// El mínimo del campo de fecha
// ---------------------------------------------------------------------------

describe("minimoDeVencimiento", () => {
  /**
   * Las 02:00 UTC del 25 son las 21:00 del **24** en Panamá. Es el borde que
   * importa: desde las 19:00 locales el día UTC ya es el siguiente.
   */
  const NOCHE_DEL_24 = new Date("2026-10-25T02:00:00.000Z");

  it("la primera mitad: sin vencimiento guardado, el mínimo es hoy en Panamá", () => {
    // El literal es el día **de Panamá**, escrito a mano. Con el día de UTC
    // esto diría `2026-10-25`, y el control no dejaría elegir hoy mientras
    // el servidor sí lo acepta: ése es justo el defecto que esta prueba
    // existe para atrapar.
    expect(minimoDeVencimiento(NOCHE_DEL_24, null)).toBe("2026-10-24");
  });

  it("la primera mitad, de día: el mínimo sigue siendo hoy", () => {
    // A mediodía UTC los dos husos coinciden, así que esta prueba no
    // distingue Panamá de UTC. Está para que la de arriba no sea la única
    // que toca la rama «sin vencimiento guardado».
    expect(
      minimoDeVencimiento(new Date("2026-10-24T12:00:00.000Z"), null),
    ).toBe("2026-10-24");
  });

  it("la segunda mitad: con un vencimiento guardado ya pasado, el mínimo es ése", () => {
    // Un borrador viejo cuyo vencimiento ya pasó es legítimo reeditarlo sin
    // tocarle la fecha —el servidor lo permite a propósito, porque reenviar
    // el vencimiento que ya estaba no es ponerle uno—. Con `min = hoy` el
    // control no podría ni mostrar su propio valor.
    expect(minimoDeVencimiento(NOCHE_DEL_24, "2024-03-01")).toBe("2024-03-01");
  });

  it("un vencimiento guardado posterior a hoy no baja el mínimo", () => {
    // El mínimo es el **menor** de los dos, no «el guardado si lo hay».
    expect(minimoDeVencimiento(NOCHE_DEL_24, "2026-12-31")).toBe("2026-10-24");
  });

  it("un vencimiento guardado que es hoy deja el mínimo en hoy", () => {
    // El borde entre las dos mitades. Con un `<=` mal puesto los dos
    // resultados coinciden, así que esta prueba no distingue nada por sí
    // sola; está para fijar que el borde no se cae en ninguna de las dos.
    expect(minimoDeVencimiento(NOCHE_DEL_24, "2026-10-24")).toBe("2026-10-24");
  });
});

// ---------------------------------------------------------------------------
// El borrador del formulario
// ---------------------------------------------------------------------------

describe("borradorDesde", () => {
  it("abre el borrador con lo que la cotización ya tiene", () => {
    expect(borradorDesde(cotizacion({ venceEn: "2026-11-30" }))).toEqual({
      clienteId: CLIENTE_ID,
      venceEn: "2026-11-30",
    });
  });

  it("el vencimiento nulo se vuelve un campo vacío editable", () => {
    // Un `null` metido en el `value` de un control lo vuelve no controlado,
    // y React avisa en consola de algo que la persona no ve.
    expect(borradorDesde(cotizacion({ venceEn: null })).venceEn).toBe("");
  });
});

describe("aPeticion", () => {
  it("el campo de fecha en blanco vuelve a ser nulo, no cadena vacía", () => {
    // Un `""` por el cable no es «sin vencimiento»: el Worker lo lee como
    // tal hoy, pero lo que la pantalla quiere decir es nulo y lo dice.
    expect(aPeticion(borrador({ clienteId: CLIENTE_ID, venceEn: "" }))).toEqual(
      { clienteId: CLIENTE_ID, venceEn: null },
    );
  });

  it("recorta lo que se pegó con espacios alrededor", () => {
    expect(
      aPeticion(borrador({ clienteId: ` ${CLIENTE_ID} `, venceEn: " 2026-11-30 " })),
    ).toEqual({ clienteId: CLIENTE_ID, venceEn: "2026-11-30" });
  });
});

describe("validarBorrador", () => {
  const HOY = "2026-10-24";

  it("acepta un borrador con cliente y sin vencimiento", () => {
    expect(
      validarBorrador(borrador({ clienteId: CLIENTE_ID }), {
        hoy: HOY,
        venceEnActual: null,
      }),
    ).toEqual([]);
  });

  it("exige el cliente, que es lo único obligatorio", () => {
    expect(
      motivos(
        validarBorrador(borrador(), { hoy: HOY, venceEnActual: null }),
      ),
    ).toEqual(["cliente_requerido"]);
  });

  it("un cliente de puros espacios es no haber elegido ninguno", () => {
    expect(
      motivos(
        validarBorrador(borrador({ clienteId: "   " }), {
          hoy: HOY,
          venceEnActual: null,
        }),
      ),
    ).toEqual(["cliente_requerido"]);
  });

  it("rechaza un día que no existe en el calendario", () => {
    // `2026-02-31` pasa cualquier expresión regular y no es ningún día.
    expect(
      motivos(
        validarBorrador(
          borrador({ clienteId: CLIENTE_ID, venceEn: "2026-02-31" }),
          { hoy: HOY, venceEnActual: null },
        ),
      ),
    ).toEqual(["vencimiento_invalido"]);
  });

  it("rechaza un vencimiento que ya pasó", () => {
    expect(
      motivos(
        validarBorrador(
          borrador({ clienteId: CLIENTE_ID, venceEn: "2026-10-23" }),
          { hoy: HOY, venceEnActual: null },
        ),
      ),
    ).toEqual(["vencimiento_pasado"]);
  });

  it("hoy no es pasado", () => {
    // El caso corriente: una cotización que se manda y se responde el mismo
    // día. Es la misma arista que el Worker protege con `<` y no `<=`.
    expect(
      validarBorrador(
        borrador({ clienteId: CLIENTE_ID, venceEn: HOY }),
        { hoy: HOY, venceEnActual: null },
      ),
    ).toEqual([]);
  });

  it("reenviar el vencimiento que ya estaba no es ponerle uno", () => {
    // La edición manda el juego completo de campos —`PUT` y no `PATCH`—, así
    // que quien abre un borrador viejo para corregirle el cliente reenvía su
    // vencimiento vencido sin tocarlo.
    expect(
      validarBorrador(
        borrador({ clienteId: CLIENTE_ID, venceEn: "2024-03-01" }),
        { hoy: HOY, venceEnActual: "2024-03-01" },
      ),
    ).toEqual([]);
  });

  it("pero cambiarlo por otro día pasado sí se rechaza", () => {
    expect(
      motivos(
        validarBorrador(
          borrador({ clienteId: CLIENTE_ID, venceEn: "2024-03-02" }),
          { hoy: HOY, venceEnActual: "2024-03-01" },
        ),
      ),
    ).toEqual(["vencimiento_pasado"]);
  });

  it("devuelve todas las fallas y no la primera", () => {
    // Un formulario que corrige de a un error por envío es el formulario que
    // nadie usa.
    expect(
      motivos(
        validarBorrador(borrador({ venceEn: "2026-10-23" }), {
          hoy: HOY,
          venceEnActual: null,
        }),
      ),
    ).toEqual(["cliente_requerido", "vencimiento_pasado"]);
  });
});

// ---------------------------------------------------------------------------
// Presentación
// ---------------------------------------------------------------------------

describe("estadoLegible", () => {
  it("dice cada uno de los cuatro estados", () => {
    expect(estadoLegible(cotizacion({ estado: "borrador" }))).toBe("Borrador");
    expect(estadoLegible(cotizacion({ estado: "emitida" }))).toBe("Emitida");
    expect(estadoLegible(cotizacion({ estado: "ganada" }))).toBe("Ganada");
    expect(estadoLegible(cotizacion({ estado: "perdida" }))).toBe("Perdida");
  });
});

describe("clienteDe", () => {
  it("nombra al cliente", () => {
    expect(clienteDe(cotizacion({ clienteNombre: "Carlos Pérez" }))).toBe(
      "Carlos Pérez",
    );
  });

  it("no inventa un nombre cuando no se pudo resolver", () => {
    // Llega nulo si la fila del cliente cruzara la frontera del bufete. Un
    // hueco en blanco se lee como «sin cliente», y sí lo hay: la columna es
    // `NOT NULL`.
    expect(clienteDe(cotizacion({ clienteNombre: null }))).toBe("—");
  });
});

describe("vencimientoDe", () => {
  it("escribe el día con el mes en letras, sin correrlo", () => {
    // `new Date("2026-11-30")` es medianoche UTC, que en Panamá es el 29 a
    // las siete de la tarde: formatearlo con el huso local correría la
    // fecha un día hacia atrás.
    expect(vencimientoDe(cotizacion({ venceEn: "2026-11-30" }))).toBe(
      "30 nov 2026",
    );
  });

  it("una cotización que no vence lo dice, en vez de dejar un guion", () => {
    // Es el caso mayoritario, y «—» se lee como «no sabemos» cuando acá lo
    // que se sabe es que no vence.
    expect(vencimientoDe(cotizacion({ venceEn: null }))).toBe("No vence");
  });
});

describe("estaVencida", () => {
  const HOY = "2026-10-24";

  it("un borrador con el vencimiento pasado está vencido", () => {
    expect(estaVencida(cotizacion({ venceEn: "2026-10-23" }), HOY)).toBe(true);
  });

  it("vencer hoy todavía cuenta", () => {
    expect(estaVencida(cotizacion({ venceEn: HOY }), HOY)).toBe(false);
  });

  it("una cotización sin vencimiento nunca está vencida", () => {
    expect(estaVencida(cotizacion({ venceEn: null }), HOY)).toBe(false);
  });

  it("lo que ya salió del borrador no se marca vencido", () => {
    // Rojo sobre algo que nadie va a volver a mandar es ruido: lo que un
    // documento ya emitido hace con su vencimiento es de T-4.
    expect(
      estaVencida(cotizacion({ estado: "emitida", venceEn: "2026-10-23" }), HOY),
    ).toBe(false);
    expect(
      estaVencida(cotizacion({ estado: "ganada", venceEn: "2026-10-23" }), HOY),
    ).toBe(false);
  });
});

describe("ordenarCotizaciones", () => {
  it("pone la más nueva primero", () => {
    const vieja = cotizacion({
      id: "vieja",
      codigo: "COT-2026-0001",
      fecha: "2026-01-02T10:00:00.000Z",
    });
    const nueva = cotizacion({
      id: "nueva",
      codigo: "COT-2026-0009",
      fecha: "2026-10-02T10:00:00.000Z",
    });

    expect(ordenarCotizaciones([vieja, nueva]).map((c) => c.id)).toEqual([
      "nueva",
      "vieja",
    ]);
  });

  it("desempata por código, del mayor al menor", () => {
    // Dos altas del mismo instante son posibles —el correlativo las
    // distingue— y un orden que dependa del azar del arreglo hace que la
    // tabla se reacomode sola entre dos cargas.
    const mismoInstante = "2026-10-02T10:00:00.000Z";
    const a = cotizacion({ id: "a", codigo: "COT-2026-0002", fecha: mismoInstante });
    const b = cotizacion({ id: "b", codigo: "COT-2026-0010", fecha: mismoInstante });

    expect(ordenarCotizaciones([a, b]).map((c) => c.id)).toEqual(["b", "a"]);
  });

  it("no toca el arreglo que recibe, que puede ser estado de React", () => {
    const original = [
      cotizacion({ id: "a", fecha: "2026-01-02T10:00:00.000Z" }),
      cotizacion({ id: "b", fecha: "2026-10-02T10:00:00.000Z" }),
    ];

    ordenarCotizaciones(original);

    expect(original.map((c) => c.id)).toEqual(["a", "b"]);
  });
});

describe("filtrarCotizaciones", () => {
  const CARTERA = [
    cotizacion({
      id: "a",
      codigo: "COT-2026-0001",
      clienteNombre: "Carlos Pérez",
      estado: "borrador",
    }),
    cotizacion({
      id: "b",
      codigo: "COT-2026-0002",
      clienteNombre: "Inmobiliaria del Istmo",
      estado: "emitida",
    }),
  ];

  it("sin consulta devuelve todo", () => {
    expect(filtrarCotizaciones(CARTERA, "   ").map((c) => c.id)).toEqual([
      "a",
      "b",
    ]);
  });

  it("busca por código", () => {
    expect(filtrarCotizaciones(CARTERA, "0002").map((c) => c.id)).toEqual(["b"]);
  });

  it("busca por cliente ignorando acentos y mayúsculas", () => {
    expect(filtrarCotizaciones(CARTERA, "PEREZ").map((c) => c.id)).toEqual([
      "a",
    ]);
  });

  it("busca por el estado tal como se lee en la pantalla", () => {
    // Lo que alguien escribe es lo que ve: «emitida», no `emitida` el valor
    // del `CHECK`. Que hoy coincidan no es razón para buscar por el crudo.
    expect(filtrarCotizaciones(CARTERA, "Emitida").map((c) => c.id)).toEqual([
      "b",
    ]);
  });

  it("no devuelve nada cuando nada coincide", () => {
    expect(filtrarCotizaciones(CARTERA, "hipoteca")).toEqual([]);
  });
});

describe("avisoDeNoEsBorrador", () => {
  it("un borrador no tiene nada que avisar", () => {
    expect(avisoDeNoEsBorrador(cotizacion({ estado: "borrador" }))).toBeNull();
  });

  it("lo que ya salió del borrador dice en qué estado quedó", () => {
    // El 409 del Worker lleva el estado «porque “ya no es borrador” sin
    // decir en qué quedó obliga a recargar para enterarse». La pantalla no
    // puede decir menos que la API.
    const aviso = avisoDeNoEsBorrador(cotizacion({ estado: "emitida" }));

    expect(aviso).not.toBeNull();
    expect(aviso).toContain("Emitida");
  });

  it("no promete una salida que esta pantalla no tiene", () => {
    // Emitir, ganar, perder y duplicar son de T-4 y T-5. Un aviso que los
    // nombrara mandaría a buscar un botón que no existe.
    const aviso = avisoDeNoEsBorrador(cotizacion({ estado: "ganada" })) ?? "";

    for (const palabra of ["emitir", "duplicar", "ganar", "perder"]) {
      expect(aviso.toLowerCase()).not.toContain(palabra);
    }
  });
});

// ---------------------------------------------------------------------------
// El 409 de editar algo que ya no es un borrador
// ---------------------------------------------------------------------------

describe("textoDeProblema, sobre `cotizacion_no_es_borrador`", () => {
  const CONFLICTO = {
    estado: "conflicto",
    motivo: "cotizacion_no_es_borrador",
    bloqueo: null,
    duplicado: null,
  } as const;

  it("tiene su propia frase y no cae en el texto de reserva", () => {
    const texto = textoDeProblema(CONFLICTO, "esa cotización");

    // Afirmar **algo del texto nuevo**, y no solo la ausencia de «borrar».
    // Un `not.toContain` a secas lo pasa cualquier texto de reserva que no
    // use esa palabra, así que no demuestra que la entrada de `CONFLICTOS`
    // se esté usando: solo que la de reserva cambió de redacción.
    expect(texto).toContain("ya no es un borrador");
    expect(texto).toContain("el registro de lo que se mandó");

    // Y el texto de reserva habla de un borrado con dependientes: ante este
    // 409 diría «no se pudo borrar», que es un borrado que nadie pidió.
    expect(texto.toLowerCase()).not.toContain("borrar");
  });

  it("dice que hay que volver a cargarla para ver en qué quedó", () => {
    // Sin eso, la única salida visible es reintentar lo mismo.
    expect(textoDeProblema(CONFLICTO, "esa cotización")).toContain(
      "volver a cargar",
    );
  });
});

// ---------------------------------------------------------------------------
// El desplegable de clientes
//
// El defecto que estas pruebas fijan, medido contra el navegador antes de
// arreglarlo: al editar un borrador cuyo cliente no estaba en la lista, el
// `<select>` controlado caía en la primera opción y dibujaba «Elegir
// cliente…» mientras el `PUT` salía con el `clienteId` original. Dos casos
// medidos, los dos con el mismo síntoma: la lista fallando en 403, y una
// lista que cargaba sin ese cliente.
// ---------------------------------------------------------------------------

function cliente(id: string, nombre: string): Cliente {
  return {
    id,
    nombre,
    tipoClienteId: null,
    tipoClienteNombre: null,
    documentoTipo: null,
    documentoNumero: null,
    representanteLegal: null,
    email: null,
    telefono: "+507 6000-0000",
    notas: null,
    creadoPor: "7335d417-61da-459d-899c-0a01c76a2f94",
    creadoPorNombre: "Itzel",
    creadoEn: "2026-10-22T14:03:00.000Z",
  };
}

const OTRO_CLIENTE_ID = "4a3f1d0e-0e2c-4c1f-9a6b-2d8a1c5e7b99";

describe("clientesSeleccionables", () => {
  const ACTUAL = { id: CLIENTE_ID, nombre: "Carlos Pérez" };

  it("el primer caso medido: la lista no cargó y el cliente de la cotización se ofrece igual", () => {
    // Sin esto el desplegable queda con la sola opción vacía, dibuja
    // «Elegir cliente…» y el envío lleva el cliente original: el control
    // diciendo una cosa y el cuerpo llevando otra.
    expect(clientesSeleccionables([], ACTUAL)).toEqual([
      { id: CLIENTE_ID, nombre: "Carlos Pérez" },
    ]);
  });

  it("el segundo caso medido: la lista cargó sin ese cliente y se agrega", () => {
    const opciones = clientesSeleccionables(
      [cliente(OTRO_CLIENTE_ID, "Inmobiliaria del Istmo")],
      ACTUAL,
    );

    expect(opciones.map((opcion) => opcion.id)).toContain(CLIENTE_ID);
    expect(opciones).toHaveLength(2);
  });

  it("no lo duplica cuando la lista ya lo trae", () => {
    const opciones = clientesSeleccionables(
      [cliente(CLIENTE_ID, "Carlos Pérez"), cliente(OTRO_CLIENTE_ID, "Istmo")],
      ACTUAL,
    );

    expect(opciones.filter((opcion) => opcion.id === CLIENTE_ID)).toHaveLength(1);
  });

  it("en el alta no agrega nada: no hay cliente previo que conservar", () => {
    expect(clientesSeleccionables([cliente(OTRO_CLIENTE_ID, "Istmo")], null)).toEqual([
      { id: OTRO_CLIENTE_ID, nombre: "Istmo" },
    ]);
  });

  it("dice el hueco cuando el cliente guardado no se pudo nombrar", () => {
    // Un identificador crudo en un desplegable no le habla a nadie, y una
    // opción con texto vacío es la misma mentira de antes con otra cara.
    const [opcion] = clientesSeleccionables([], { id: CLIENTE_ID, nombre: null });

    expect(opcion.nombre).not.toBe("");
    expect(opcion.nombre).not.toBe(CLIENTE_ID);
    expect(opcion.nombre).toContain("cotización ya tenía");
  });

  it("ordena por nombre con las reglas del español", () => {
    const opciones = clientesSeleccionables(
      [cliente("b", "ávila"), cliente("a", "Álvarez"), cliente("c", "Zamora")],
      null,
    );

    expect(opciones.map((opcion) => opcion.nombre)).toEqual([
      "Álvarez",
      "ávila",
      "Zamora",
    ]);
  });

  it("no toca el arreglo que recibe, que puede ser estado de React", () => {
    const original = [cliente("z", "Zamora"), cliente("a", "Álvarez")];

    clientesSeleccionables(original, ACTUAL);

    expect(original.map((uno) => uno.id)).toEqual(["z", "a"]);
  });
});

describe("avisoDelDesplegable", () => {
  it("sin problema no dice nada", () => {
    expect(avisoDelDesplegable(null, true)).toBeNull();
  });

  it("con la lista caída y un cliente ya elegido, explica qué queda elegible", () => {
    // Es la trampa del arreglo: con el cliente de la cotización inyectado,
    // el desplegable deja de estar vacío, así que un aviso condicionado a
    // «no hay opciones» se apagaría justo cuando hace falta.
    const aviso = avisoDelDesplegable("No se pudo consultar: red.", true) ?? "";

    expect(aviso).toContain("No se pudo consultar: red.");
    expect(aviso).toContain("el cliente que la cotización ya tenía");
  });

  it("en el alta no promete un cliente previo que no existe", () => {
    expect(avisoDelDesplegable("No se pudo consultar: red.", false)).toBe(
      "No se pudo consultar: red.",
    );
  });
});
