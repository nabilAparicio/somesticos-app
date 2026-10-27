import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { totalesDe } from "../worker/cotizaciones/lineas";
import {
  MAXIMO_DE_TOKENS_POR_DEFECTO,
  MODELO_POR_DEFECTO,
  URL_DE_MENSAJES,
  VERSION_DE_LA_API,
  proveedorAnthropic,
} from "../worker/ia/anthropic";
import {
  CLAVES_DE_LINEA,
  CLAVES_DE_MODULO,
  CLAVES_DE_PROPUESTA,
  validarPropuesta,
  validarTextoDePropuesta,
} from "../worker/ia/esquema";
import type {
  CatalogosOfrecidos,
  MotivoDeRechazoDeSalida,
  PropuestaDelModelo,
  ServicioOfrecido,
} from "../worker/ia/esquema";
import { PROVEEDORES, modeloDesdeEntorno } from "../worker/ia/modelo";
import type { Pedir, PeticionDeCompletado } from "../worker/ia/modelo";

/**
 * La costura con el modelo (T-8, `docs/diseno.md` §8 «La costura»).
 *
 * ## Qué se prueba acá, y qué no probaría nada
 *
 * La barandilla de la tajada es **el modelo no suma, nunca**, y la tarea de
 * T-8 es hacerla **imposible y no improbable**. Una prueba que le da a la
 * costura una salida válida y verifica que pasa no demuestra ninguna de las
 * dos cosas: demuestra que el camino feliz existe. Por eso casi todo lo que
 * hay abajo es **una salida inválida y la afirmación de que se rechaza**, que
 * es la restricción 1 de la tajada escrita sobre el modelo en vez de sobre la
 * base.
 *
 * Hay exactamente dos pruebas de aceptación, y están por lo que afirman
 * **además** de que pasa: que lo que sale tiene las claves que tiene y
 * ninguna más, y que la aritmética la hace `totalesDe` sobre las líneas
 * validadas.
 *
 * ## Ninguna prueba llama a la red
 *
 * Hay dos costuras, a dos alturas, y ninguna de las dos sustituye la
 * validación:
 *
 *  1. `ModeloDeLenguaje` — lo que ve el resto del sistema. Un doble completo
 *     del proveedor entra por acá.
 *  2. `Pedir` — el transporte dentro del adaptador de Anthropic, con la misma
 *     forma y por la misma razón que `Pedir` en `worker/acceso/claves.ts`:
 *     ejercer las ramas del adaptador —la clave que falta, el 500, el cuerpo
 *     sin texto, el corte por `max_tokens`— que si no corren sólo desplegadas
 *     y sin que nada las toque.
 *
 * El camino que corre en producción es **el mismo**: `modeloDesdeEntorno`
 * resuelve el proveedor igual con transporte real que con transporte falso, y
 * la validación de esquema está por encima de los dos. Si la costura estuviera
 * en la validación, estas pruebas no probarían nada.
 */

/* ==========================================================================
   El entorno de las pruebas es hermético
   ========================================================================== */

/**
 * No hereda nada que no esté acá, por el defecto que `test/acceso.spec.ts`
 * documenta y que acá sería peor: `IA_API_KEY` es un secreto que vive en
 * `.dev.vars`, un archivo local sin versionar. Si se esparciera `env` tal
 * cual, en la máquina que tenga la clave puesta la prueba de «falta el
 * secreto» observaría otra cosa — y el adaptador, con un transporte real,
 * llamaría a la red de verdad. Se anulan las tres de forma explícita y la
 * prueba que quiera un valor lo pide por `ajustes`.
 */
function entorno(ajustes: Partial<Env> = {}): Env {
  return {
    ...env,
    IA_API_KEY: undefined,
    IA_MODELO: undefined,
    IA_PROVEEDOR: undefined,
    ...ajustes,
  };
}

const CLAVE = "clave-de-prueba-que-no-vale-nada";

/* ==========================================================================
   Dobles del transporte
   ========================================================================== */

interface Llamada {
  url: string;
  init: RequestInit;
}

interface Transporte {
  pedir: Pedir;
  llamadas: Llamada[];
}

function respondiendo(
  cuerpo: unknown,
  { ok = true, status = 200 } = {},
): Transporte {
  const llamadas: Llamada[] = [];

  const pedir: Pedir = (url, init) => {
    llamadas.push({ url, init });
    return Promise.resolve({ ok, status, json: () => Promise.resolve(cuerpo) });
  };

  return { pedir, llamadas };
}

/** Un transporte que no llega: la red caída, no una guarda nuestra. */
function cayendose(error: unknown): Transporte {
  const llamadas: Llamada[] = [];

  const pedir: Pedir = (url, init) => {
    llamadas.push({ url, init });
    return Promise.reject(error);
  };

  return { pedir, llamadas };
}

/** Un cuerpo de Anthropic con el texto que la prueba quiera. */
function devolviendoTexto(
  texto: string,
  stopReason = "end_turn",
): Record<string, unknown> {
  return {
    content: [{ type: "text", text: texto }],
    stop_reason: stopReason,
  };
}

/**
 * Las claves de módulo que el prompt de estas pruebas declara haber ofrecido
 * (T-4 de `odd/tasks/plantillas-de-modulo.md`).
 *
 * Desde T-4 el juego de tipos de módulo **no lo cierra ninguna constante del
 * código**: lo cierra el catálogo de plantillas activas que quien llama
 * declaró, igual que los trámites y los servicios. Así que una petición sin
 * esta lista es una petición en la que ningún módulo pasa, y por eso viaja en
 * `PETICION`: es lo que hace el generador de verdad en cada corrida.
 *
 * Son dos y no seis a propósito: con las seis, una suite que declarara el
 * catálogo entero no podría distinguir «la clave no está ofrecida» de «la
 * clave no existe».
 */
const MODULOS_OFRECIDOS: readonly string[] = ["alcance", "supuestos"];

const PETICION: PeticionDeCompletado = {
  instrucciones: "Sos el generador de cotizaciones del bufete.",
  entrada: "Divorcio de mutuo acuerdo, hay bienes.",
  tiposDeModuloOfrecidos: MODULOS_OFRECIDOS,
};

/* ==========================================================================
   Propuestas de referencia
   ========================================================================== */

const MODULO_VALIDO = { tipo: "alcance", contenido: "Lo que se va a hacer." };
const LINEA_VALIDA = {
  clase: "honorario",
  concepto: "Honorarios profesionales",
  monto: 150000,
};

function propuesta(ajustes: Record<string, unknown> = {}): unknown {
  return { modulos: [MODULO_VALIDO], lineas: [LINEA_VALIDA], ...ajustes };
}

function conModulo(ajustes: Record<string, unknown>): unknown {
  return propuesta({ modulos: [{ ...MODULO_VALIDO, ...ajustes }] });
}

function conLinea(ajustes: Record<string, unknown>): unknown {
  return propuesta({ lineas: [{ ...LINEA_VALIDA, ...ajustes }] });
}

/**
 * Los motivos de un rechazo, sin su ruta. Para afirmar el conjunto.
 *
 * Recibe los catálogos declarados **enteros** y no sólo los trámites: desde
 * T-3 hay dos —los trámites y los servicios tarifados— y una firma con un
 * arreglo suelto por catálogo obligaría a pasar `undefined` en el medio para
 * llegar al segundo.
 */
function motivos(crudo: unknown, catalogos: CatalogosOfrecidos = {}): string[] {
  // El catálogo de módulos se pone **siempre salvo que la prueba lo nombre**,
  // y no es comodidad: desde T-4 falla cerrada, así que sin él ningún módulo
  // pasa y cada prueba sobre otra regla tendría que declararlo para que su
  // propuesta llegara a la regla que mide. Las pruebas del catálogo vacío y de
  // la clave no ofrecida lo nombran explícitamente, que es cómo se distinguen
  // —y el `...catalogos` al final es lo que deja sobreescribirlo—.
  const validacion = validarPropuesta(crudo, {
    modulos: MODULOS_OFRECIDOS,
    ...catalogos,
  });
  if (validacion.ok) return [];
  return validacion.rechazos.map((r) => r.motivo);
}

/* ==========================================================================
   Por rechazo: lo que el modelo no puede hacer
   ========================================================================== */

describe("la costura rechaza una salida que no tiene la forma acordada", () => {
  const fuera: [string, unknown, MotivoDeRechazoDeSalida][] = [
    ["es `null`", null, "salida_no_es_objeto"],
    ["es un número", 7, "salida_no_es_objeto"],
    ["es una cadena", "listo", "salida_no_es_objeto"],
    // Un arreglo de nivel superior es el JSON que después nadie sabe
    // versionar, y además no tiene dónde poner las dos colecciones.
    ["es un arreglo", [MODULO_VALIDO], "salida_no_es_objeto"],
  ];

  it.each(fuera)("cuando la salida %s", (_nombre, crudo, motivo) => {
    expect(motivos(crudo)).toEqual([motivo]);
  });

  const colecciones: [string, unknown, MotivoDeRechazoDeSalida[]][] = [
    ["faltan las dos colecciones", {}, ["coleccion_ausente", "coleccion_ausente"]],
    ["falta `modulos`", { lineas: [LINEA_VALIDA] }, ["coleccion_ausente"]],
    ["falta `lineas`", { modulos: [MODULO_VALIDO] }, ["coleccion_ausente"]],
    [
      "`modulos` no es un arreglo",
      { modulos: MODULO_VALIDO, lineas: [] },
      ["coleccion_ausente"],
    ],
    [
      "`lineas` es un objeto",
      { modulos: [], lineas: { "0": LINEA_VALIDA } },
      ["coleccion_ausente"],
    ],
    [
      "un módulo no es un objeto",
      { modulos: ["alcance"], lineas: [] },
      ["modulo_no_es_objeto"],
    ],
    [
      "una línea es `null`",
      { modulos: [], lineas: [null] },
      ["linea_no_es_objeto"],
    ],
  ];

  it.each(colecciones)("cuando %s", (_nombre, crudo, esperados) => {
    expect(motivos(crudo)).toEqual(esperados);
  });

  it("cuando las dos colecciones vienen y están vacías", () => {
    // Una propuesta sin un solo módulo y sin una sola línea es una página en
    // blanco. Que llegue como éxito le daría a T-9 un borrador vacío sin nada
    // que explicarle al abogado; que llegue como falla le da el motivo.
    expect(motivos({ modulos: [], lineas: [] })).toEqual(["propuesta_vacia"]);
  });
});

describe("la costura rechaza un tipo o una clase que el catálogo no tiene", () => {
  const inventados: [string, unknown][] = [
    ["un tipo de módulo que no existe", conModulo({ tipo: "resumen_ejecutivo" })],
    ["un tipo con otra grafía", conModulo({ tipo: "cláusulas" })],
    ["un tipo en inglés", conModulo({ tipo: "scope" })],
    ["un tipo vacío", conModulo({ tipo: "" })],
    ["un tipo que no es cadena", conModulo({ tipo: 3 })],
    ["un tipo ausente", propuesta({ modulos: [{ contenido: "Texto." }] })],
  ];

  it.each(inventados)("%s", (_nombre, crudo) => {
    expect(motivos(crudo)).toEqual(["tipo_de_modulo_desconocido"]);
  });

  const clases: [string, unknown][] = [
    ["una clase que no existe", conLinea({ clase: "impuesto" })],
    ["la clase que T-12 todavía no decidió", conLinea({ clase: "itbms" })],
    ["una clase ausente", propuesta({ lineas: [{ concepto: "x", monto: 1 }] })],
    ["una clase que no es cadena", conLinea({ clase: null })],
  ];

  it.each(clases)("%s", (_nombre, crudo) => {
    expect(motivos(crudo)).toEqual(["clase_de_linea_desconocida"]);
  });
});

describe("la costura rechaza un campo que el modelo agregó", () => {
  /**
   * **Acá la costura es deliberadamente más estricta que el formulario.**
   *
   * `normalizarModulo` y `normalizarLinea` ignoran en silencio lo que no
   * conocen, y para un formulario eso está bien: ningún 422 le hablaría a
   * nadie por un campo que ninguna pantalla manda. Para un modelo es al revés.
   * Un campo que se ignora en silencio es exactamente un campo que el modelo
   * inventó y que nadie se enteró de que inventó; y el día que la deriva
   * empiece, la señal llega como «las cotizaciones generadas salen raras» en
   * vez de como un motivo.
   */
  const demas: [string, unknown][] = [
    ["en la raíz", propuesta({ resumen: "…" })],
    ["en un módulo", conModulo({ estilo: "formal" })],
    ["en una línea", conLinea({ moneda: "USD" })],
    ["el `orden`, que lo pone el servidor", conModulo({ orden: 0 })],
    ["el `id`, que lo pone el servidor", conLinea({ id: "lin-1" })],
    ["el `tipoProcesoNombre`, que se resuelve en lectura", conLinea({ tipoProcesoNombre: "Divorcio" })],
  ];

  it.each(demas)("%s", (_nombre, crudo) => {
    expect(motivos(crudo)).toEqual(["campo_desconocido"]);
  });
});

describe("la costura descarta cualquier total que el modelo mande", () => {
  /**
   * La barandilla, probada donde se rompe. `totalesDe` es la única aritmética
   * del sistema y no tiene manera de llegar a un número del modelo: el tipo
   * que sale de la costura no tiene dónde ponerlo, y el camino para que lo
   * tuviera —una clave de más— está cerrado.
   */
  const totales: [string, unknown][] = [
    ["un total en la raíz", propuesta({ total: 500000 })],
    ["un subtotal de honorarios", propuesta({ honorarios: 150000 })],
    ["un subtotal de gastos", propuesta({ gastosEstimados: 0 })],
    ["unos totales anidados", propuesta({ totales: { total: 1 } })],
    ["un subtotal por línea", conLinea({ subtotal: 150000 })],
  ];

  it.each(totales)("rechaza %s", (_nombre, crudo) => {
    expect(motivos(crudo)).toEqual(["campo_desconocido"]);
  });

  it("la aritmética sale de `totalesDe` sobre las líneas validadas", () => {
    const validacion = validarPropuesta({
      modulos: [],
      lineas: [
        { clase: "honorario", concepto: "Honorarios", monto: 150000 },
        { clase: "honorario", concepto: "Audiencia", monto: 50000 },
        { clase: "gasto_estimado", concepto: "Timbres", monto: 2500 },
      ],
    });

    expect(validacion.ok).toBe(true);
    if (!validacion.ok) return;

    // El esperado se escribe a mano y no se calcula con la función que se
    // prueba (restricción 6 de la tajada).
    expect(totalesDe(validacion.propuesta.lineas)).toEqual({
      honorarios: 200000,
      gastosEstimados: 2500,
      total: 202500,
    });
  });
});

describe("la costura rechaza un monto que no es un entero de centavos", () => {
  const montos: [string, unknown][] = [
    ["un monto como texto", conLinea({ monto: "150000" })],
    ["un monto con coma", conLinea({ monto: 1500.5 })],
    ["un monto en dólares con decimales", conLinea({ monto: 1500.0001 })],
    ["un monto negativo", conLinea({ monto: -1 })],
    ["un monto ausente", propuesta({ lineas: [{ clase: "honorario", concepto: "x" }] })],
    ["un monto nulo", conLinea({ monto: null })],
    ["NaN", conLinea({ monto: Number.NaN })],
    ["infinito", conLinea({ monto: Number.POSITIVE_INFINITY })],
    ["un entero más grande que 2^53", conLinea({ monto: 2 ** 53 + 2 })],
    ["un booleano", conLinea({ monto: true })],
  ];

  it.each(montos)("%s", (_nombre, crudo) => {
    expect(motivos(crudo)).toEqual(["monto_invalido"]);
  });

  it("acepta cero, que es una línea sin cargo y no un error", () => {
    expect(motivos(conLinea({ monto: 0 }))).toEqual([]);
  });
});

describe("la costura rechaza prosa que no dice nada", () => {
  const textos: [string, unknown][] = [
    ["un contenido vacío", conModulo({ contenido: "" })],
    ["un contenido de puros espacios", conModulo({ contenido: "   \n\t " })],
    ["un contenido ausente", propuesta({ modulos: [{ tipo: "alcance" }] })],
    ["un contenido que no es cadena", conModulo({ contenido: 42 })],
  ];

  it.each(textos)("%s", (_nombre, crudo) => {
    expect(motivos(crudo)).toEqual(["texto_requerido"]);
  });

  const conceptos: [string, unknown][] = [
    ["un concepto vacío", conLinea({ concepto: "" })],
    ["un concepto de puros espacios", conLinea({ concepto: "  " })],
    ["un concepto ausente", propuesta({ lineas: [{ clase: "honorario", monto: 1 }] })],
    ["un concepto que no es cadena", conLinea({ concepto: ["x"] })],
  ];

  it.each(conceptos)("%s", (_nombre, crudo) => {
    expect(motivos(crudo)).toEqual(["texto_requerido"]);
  });

  it("recorta lo que deja pasar, igual que al guardar", () => {
    const validacion = validarPropuesta(
      conModulo({ contenido: "  Lo que se va a hacer.  " }),
      { modulos: MODULOS_OFRECIDOS },
    );

    expect(validacion.ok).toBe(true);
    if (!validacion.ok) return;
    expect(validacion.propuesta.modulos[0]?.contenido).toBe(
      "Lo que se va a hacer.",
    );
  });
});

describe("la costura rechaza un tipo de módulo que nadie le ofreció", () => {
  /**
   * **El motivo no cambió; cambió de dónde sale la lista** (T-4 de
   * `odd/tasks/plantillas-de-modulo.md`).
   *
   * Hasta T-3 el juego de tipos de módulo lo cerraba `esTipoDeModulo` sobre
   * una constante del código, y eso alcanzaba porque el rótulo también vivía
   * ahí. Ya no: la clave sigue siendo de la unión, pero **qué plantillas están
   * activas es una columna de una fila** que el abogado edita desde
   * `/catalogos/modulos`. Así que el catálogo lo declara quien llama, igual
   * que con los trámites y los servicios, y falla cerrado por el mismo
   * argumento: un tipo que el modelo compuso solo es un dato inventado.
   *
   * La diferencia con los otros dos, que vale decirla: acá el vacío no deja un
   * campo en `null`, deja la propuesta **sin módulos**. Es la respuesta
   * correcta igual —un bufete sin plantillas activas no tiene módulos que
   * ofrecer— y es lo que el prompt le dice al modelo con todas las letras.
   */
  it("sin catálogo declarado, cualquier tipo de módulo se rechaza", () => {
    expect(motivos(propuesta(), { modulos: [] })).toEqual([
      "tipo_de_modulo_desconocido",
    ]);
  });

  it("con catálogo declarado, uno que no está se rechaza", () => {
    // `exclusiones` **es** una clave válida: tiene fila en
    // `modulo_plantilla`, así que la llave foránea la acepta y la ruta de
    // módulos también. Lo que la rechaza es que esta corrida no la ofreció, que
    // es exactamente lo que le pasa a una plantilla dada de baja. Hasta T-3
    // esta propuesta pasaba, y lo que la dejaba pasar —la unión y la lista en
    // código— lo borró T-6.
    expect(
      motivos(conModulo({ tipo: "exclusiones" }), {
        modulos: MODULOS_OFRECIDOS,
      }),
    ).toEqual(["tipo_de_modulo_desconocido"]);
  });

  it("una clave que no existe en ningún lado cae en el mismo motivo", () => {
    expect(
      motivos(conModulo({ tipo: "resumen_ejecutivo" }), {
        modulos: MODULOS_OFRECIDOS,
      }),
    ).toEqual(["tipo_de_modulo_desconocido"]);
  });

  it("con catálogo declarado, el que está pasa", () => {
    expect(
      motivos(conModulo({ tipo: "supuestos" }), {
        modulos: MODULOS_OFRECIDOS,
      }),
    ).toEqual([]);
  });

  it("un tipo que no es cadena se rechaza aunque el catálogo esté puesto", () => {
    expect(
      motivos(conModulo({ tipo: 7 }), { modulos: MODULOS_OFRECIDOS }),
    ).toEqual(["tipo_de_modulo_desconocido"]);
  });

  /**
   * **La propuesta de puras líneas es válida con el catálogo vacío**, y ésa es
   * la forma exacta de la falla cerrada: no es que la generación se caiga, es
   * que no hay módulos que proponer. Sin esta prueba, «falla cerrada» podría
   * estar implementada como «falla», que es otra cosa.
   */
  it("con el catálogo vacío, una propuesta de puras líneas pasa", () => {
    expect(motivos({ modulos: [], lineas: [LINEA_VALIDA] }, { modulos: [] }))
      .toEqual([]);
  });
});

describe("la costura rechaza un trámite que nadie le ofreció", () => {
  /**
   * `tipoProcesoId` es una llave foránea contra `tipo_proceso` **de este
   * bufete**: no hay catálogo en código que la cierre, así que la cierra el
   * que llama, declarando qué ids puso en el prompt. Falla cerrada, igual que
   * `acceso_no_configurado`: sin catálogo declarado, ningún trámite pasa.
   */
  it("sin catálogo declarado, cualquier trámite se rechaza", () => {
    expect(motivos(conLinea({ tipoProcesoId: "tp-divorcio" }))).toEqual([
      "tipo_de_proceso_no_ofrecido",
    ]);
  });

  it("con catálogo declarado, uno que no está se rechaza", () => {
    expect(
      motivos(conLinea({ tipoProcesoId: "tp-inventado" }), {
        tiposDeProceso: ["tp-divorcio"],
      }),
    ).toEqual(["tipo_de_proceso_no_ofrecido"]);
  });

  it("con catálogo declarado, el que está pasa", () => {
    expect(
      motivos(conLinea({ tipoProcesoId: "tp-divorcio" }), {
        tiposDeProceso: ["tp-divorcio"],
      }),
    ).toEqual([]);
  });

  it("una línea sin trámite es el caso corriente y no una falla", () => {
    expect(motivos(conLinea({ tipoProcesoId: null }))).toEqual([]);
    expect(motivos(propuesta())).toEqual([]);
  });

  it("un trámite que no es cadena se rechaza aunque el catálogo esté puesto", () => {
    expect(
      motivos(conLinea({ tipoProcesoId: 7 }), {
        tiposDeProceso: ["tp-divorcio"],
      }),
    ).toEqual(["tipo_de_proceso_no_ofrecido"]);
  });
});

/* ==========================================================================
   El precio de una línea: o el catálogo, o el modelo. Nunca los dos.
   ========================================================================== */

/**
 * Los servicios tarifados que quien llama declara haber ofrecido, con su
 * cifra.
 *
 * **Los tres importes de esta suite son distintos entre sí** —180.000,
 * 250.000 y el 150.000 de `LINEA_VALIDA`—, y es a propósito: con dos números
 * iguales, una costura que dejara pasar el monto que el modelo escribió en
 * lugar de leer el catálogo pasaría estas pruebas sin que nada se notara.
 */
const SERVICIO_VISA: ServicioOfrecido = { id: "ar-visa", monto: 180_000 };
const SERVICIO_NATURALIZACION: ServicioOfrecido = {
  id: "ar-naturalizacion",
  monto: 250_000,
};
const SERVICIOS: readonly ServicioOfrecido[] = [
  SERVICIO_VISA,
  SERVICIO_NATURALIZACION,
];

/**
 * Los dos catálogos que estas pruebas declaran: los servicios tarifados y
 * —desde T-4— las claves de módulo. El segundo no es decorativo: sin él todas
 * las propuestas de abajo llegarían con su módulo rechazado y
 * `primeraLinea` devolvería `null` por un motivo que no tiene nada que ver con
 * el precio de una línea.
 */
const CON_SERVICIOS: CatalogosOfrecidos = {
  modulos: MODULOS_OFRECIDOS,
  servicios: SERVICIOS,
};

/**
 * Una línea que **nombra un servicio tarifado y no escribe su precio**, que
 * es la forma que T-3 le pide al modelo.
 *
 * No se arma con `conLinea`, que parte de `LINEA_VALIDA`: esa trae `monto`, y
 * una línea con los dos campos es justamente el caso contrario.
 */
function conServicio(ajustes: Record<string, unknown> = {}): unknown {
  return propuesta({
    lineas: [
      {
        clase: "honorario",
        concepto: "Visa de trabajo",
        arancelRenglonId: SERVICIO_VISA.id,
        ...ajustes,
      },
    ],
  });
}

/** La primera línea de una propuesta que pasó, o `null` si no pasó. */
function primeraLinea(
  crudo: unknown,
  catalogos: CatalogosOfrecidos = CON_SERVICIOS,
): PropuestaDelModelo["lineas"][number] | null {
  const validacion = validarPropuesta(crudo, catalogos);
  if (!validacion.ok) return null;
  return validacion.propuesta.lineas[0] ?? null;
}

describe("el precio de una línea sale de un solo lugar", () => {
  /**
   * **El criterio de aceptación de la tajada entera, medido en la puerta.**
   *
   * El modelo elige qué servicio aplica; el monto lo pone el sistema desde el
   * catálogo. No es que el modelo se porte bien: es que no hay dónde escribir
   * ese número.
   */
  it("un servicio tarifado sin monto pasa, y el monto lo pone el catálogo", () => {
    const linea = primeraLinea(conServicio());

    expect(linea, "una línea que nombra un servicio del catálogo se rechazó")
      .not.toBeNull();
    expect(
      linea?.monto,
      "el monto de una línea tarifada no salió del catálogo: el precio del" +
        " bufete dejó de ser el que manda",
    ).toBe(SERVICIO_VISA.monto);
    expect(linea?.arancelRenglonId).toBe(SERVICIO_VISA.id);
  });

  it("cada servicio trae su propia cifra, y no la del primero de la lista", () => {
    const linea = primeraLinea(
      conServicio({ arancelRenglonId: SERVICIO_NATURALIZACION.id }),
    );

    expect(linea?.monto).toBe(SERVICIO_NATURALIZACION.monto);
  });

  it("un monto sin servicio tarifado pasa, y es el caso corriente", () => {
    const linea = primeraLinea(propuesta());

    expect(linea?.monto).toBe(150_000);
    expect(linea?.arancelRenglonId).toBeNull();
  });

  it("un `arancelRenglonId` nulo es una línea sin servicio y no una falla", () => {
    expect(motivos(conLinea({ arancelRenglonId: null }), CON_SERVICIOS)).toEqual(
      [],
    );
  });

  /**
   * **La contradicción tiene motivo propio y no se resuelve eligiendo uno.**
   *
   * Un modelo que manda los dos campos está diciendo dos cosas distintas
   * sobre quién pone el precio. Quedarse con el del catálogo en silencio
   * dejaría al prompt pidiendo una cosa y al esquema aceptando otra, y nadie
   * se enteraría hasta que el modelo empezara a mandar siempre los dos.
   */
  it("los dos campos a la vez se rechazan con su propio motivo", () => {
    expect(motivos(conServicio({ monto: 999_999 }), CON_SERVICIOS)).toEqual([
      "servicio_y_monto_a_la_vez",
    ]);
  });

  it("el motivo es la contradicción aunque el monto que mandó sea basura", () => {
    // El defecto no es que tarifó mal: es que tarifó. Un `monto_invalido` acá
    // mandaría a arreglar el número en vez de a sacar el campo.
    expect(motivos(conServicio({ monto: "180000" }), CON_SERVICIOS)).toEqual([
      "servicio_y_monto_a_la_vez",
    ]);
  });

  it("un `monto` nulo junto a un servicio es ausencia, no contradicción", () => {
    // Ausente y nulo son lo mismo, igual que para `tipoProcesoId`: un modelo
    // que escribe el campo en nulo no está tarifando nada.
    expect(primeraLinea(conServicio({ monto: null }))?.monto).toBe(
      SERVICIO_VISA.monto,
    );
  });

  it("ninguno de los dos campos deja la línea sin precio, y se dice así", () => {
    // El motivo que ya existía: desde donde está quien tiene que arreglarlo
    // —el prompt— «esta línea no trae precio» y «el precio no es un entero de
    // centavos» son el mismo defecto y la corrección es la misma.
    expect(
      motivos(
        propuesta({ lineas: [{ clase: "honorario", concepto: "Consulta" }] }),
        CON_SERVICIOS,
      ),
    ).toEqual(["monto_invalido"]);
  });
});

describe("la costura rechaza un servicio que nadie le ofreció", () => {
  /**
   * El gemelo exacto de `tipo_de_proceso_no_ofrecido`, y por el mismo motivo:
   * `arancelRenglonId` es una llave foránea contra `arancel_renglon` **de este
   * bufete**, así que no hay catálogo en código que la pueda cerrar. La cierra
   * quien llama, declarando qué ids puso en el prompt — y con ellos la cifra,
   * porque es la misma lista que el prompt nombró.
   */
  it("sin catálogo declarado, cualquier servicio se rechaza", () => {
    expect(motivos(conServicio())).toEqual(["servicio_no_ofrecido"]);
  });

  it("con catálogo declarado, uno que no está se rechaza", () => {
    expect(
      motivos(conServicio({ arancelRenglonId: "ar-inventado" }), CON_SERVICIOS),
    ).toEqual(["servicio_no_ofrecido"]);
  });

  it("un servicio que no es cadena se rechaza aunque el catálogo esté puesto", () => {
    expect(
      motivos(conServicio({ arancelRenglonId: 7 }), CON_SERVICIOS),
    ).toEqual(["servicio_no_ofrecido"]);
  });

  it("un servicio inventado con monto acusa las dos cosas, no una", () => {
    // Los dos defectos son ciertos y los dos hay que arreglarlos: el
    // identificador no existe **y** el modelo tarifó. Devolver sólo el
    // primero obligaría a dos corridas del prompt para corregir una salida.
    expect(
      motivos(
        conServicio({ arancelRenglonId: "ar-inventado", monto: 1 }),
        CON_SERVICIOS,
      ),
    ).toEqual(["servicio_no_ofrecido", "servicio_y_monto_a_la_vez"]);
  });
});

describe("la costura junta todos los motivos y no sólo el primero", () => {
  it("una salida rota de varias maneras los nombra todos, con su ruta", () => {
    const validacion = validarPropuesta(
      {
        modulos: [{ tipo: "inventado", contenido: "" }],
        lineas: [{ clase: "honorario", concepto: "Honorarios", monto: "1500" }],
        total: 1500,
      },
      { modulos: MODULOS_OFRECIDOS },
    );

    expect(validacion.ok).toBe(false);
    if (validacion.ok) return;

    expect(validacion.rechazos).toEqual([
      { ruta: "propuesta.total", motivo: "campo_desconocido" },
      { ruta: "modulos[0].tipo", motivo: "tipo_de_modulo_desconocido" },
      { ruta: "modulos[0].contenido", motivo: "texto_requerido" },
      { ruta: "lineas[0].monto", motivo: "monto_invalido" },
    ]);
  });
});

describe("lo que sale de la costura no tiene nada que no sea del catálogo", () => {
  it("las claves de lo validado son exactamente las declaradas", () => {
    const validacion = validarPropuesta(
      { modulos: [MODULO_VALIDO], lineas: [LINEA_VALIDA] },
      { modulos: MODULOS_OFRECIDOS },
    );

    expect(validacion.ok).toBe(true);
    if (!validacion.ok) return;

    expect(Object.keys(validacion.propuesta).sort()).toEqual(
      [...CLAVES_DE_PROPUESTA].sort(),
    );
    expect(Object.keys(validacion.propuesta.modulos[0] ?? {}).sort()).toEqual(
      [...CLAVES_DE_MODULO].sort(),
    );
    expect(Object.keys(validacion.propuesta.lineas[0] ?? {}).sort()).toEqual(
      [...CLAVES_DE_LINEA].sort(),
    );
  });
});

/* ==========================================================================
   El texto crudo
   ========================================================================== */

describe("del texto del modelo a la propuesta", () => {
  it("rechaza lo que no es JSON en vez de intentar arreglarlo", () => {
    const validacion = validarTextoDePropuesta("Claro, acá va la cotización:");

    expect(validacion.ok).toBe(false);
    if (validacion.ok) return;
    expect(validacion.rechazos).toEqual([
      { ruta: "propuesta", motivo: "salida_no_es_json" },
    ]);
  });

  it("rechaza el JSON envuelto en un bloque de código", () => {
    // Deliberado: desenvolverlo sería tolerar que el prompt de T-9 no esté
    // pidiendo lo que cree que pide, y esa tolerancia es la que convierte un
    // defecto de prompt en una rareza intermitente.
    const validacion = validarTextoDePropuesta(
      '```json\n{"modulos":[],"lineas":[]}\n```',
    );

    expect(validacion.ok).toBe(false);
    if (validacion.ok) return;
    expect(validacion.rechazos[0]?.motivo).toBe("salida_no_es_json");
  });

  it("rechaza un JSON válido que no es una propuesta", () => {
    const validacion = validarTextoDePropuesta('"ok"');

    expect(validacion.ok).toBe(false);
    if (validacion.ok) return;
    expect(validacion.rechazos[0]?.motivo).toBe("salida_no_es_objeto");
  });
});

describe("la validación es total: devuelve, nunca tira", () => {
  /**
   * Es lo que permite que el adaptador la llame **fuera** del `try` del
   * transporte, y por lo tanto lo que impide que `salida_rechazada` sea
   * alcanzable desde un `catch`. Sin esta prueba, esa separación es una
   * disciplina que ninguna corrida verifica: se midió moviendo la validación
   * adentro del `try` y no moría nada.
   */
  const hostiles: [string, unknown][] = [
    ["un objeto sin prototipo", Object.create(null) as unknown],
    ["un objeto con miles de claves", Object.fromEntries(
      Array.from({ length: 2000 }, (_, i) => [`k${String(i)}`, i]),
    )],
    ["colecciones anidadas hasta el absurdo", {
      modulos: [[[[[{ tipo: "alcance" }]]]]],
      lineas: [{ clase: { clase: { clase: 1 } } }],
    }],
    ["un símbolo como valor", { modulos: [], lineas: [], raro: Symbol("x") }],
    ["una función como módulo", { modulos: [() => 1], lineas: [] }],
    ["`undefined`", undefined],
  ];

  it.each(hostiles)("no tira con %s", (_nombre, crudo) => {
    const validacion = validarPropuesta(crudo);
    expect(typeof validacion.ok).toBe("boolean");
  });

  /*
   * El carácter nulo va escrito `\u0000` y **no** como el byte crudo, que es
   * lo que había. Los dos producen el mismo carácter en ejecución, así que la
   * prueba afirma exactamente lo mismo; lo que cambia es el archivo. Un NUL
   * literal en el fuente lo vuelve binario para `rg`, `grep` y `diff`: la
   * búsqueda deja de entrar acá y el `git diff` muestra «Binary files
   * differ». Y en el editor no se ve, así que nadie entiende por qué su
   * búsqueda no encuentra lo que está mirando.
   */
  it("no tira con un texto que no es JSON, por largo o raro que sea", () => {
    for (const texto of ["", "\u0000", "{".repeat(5000), "ñ".repeat(10000)]) {
      expect(typeof validarTextoDePropuesta(texto).ok).toBe("boolean");
    }
  });
});

/* ==========================================================================
   El secreto que falta
   ========================================================================== */

describe("cuando el secreto no está configurado", () => {
  it("falla con un motivo legible y **sin llamar a la red**", async () => {
    const { pedir, llamadas } = respondiendo(devolviendoTexto("{}"));

    const resultado = await proveedorAnthropic(entorno(), pedir).proponer(
      PETICION,
    );

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.falla.motivo).toBe("modelo_no_configurado");
    expect(resultado.falla.detalle).toMatch(/IA_API_KEY/);
    // Lo que de verdad se afirma: la guarda está **antes** del transporte.
    expect(llamadas).toHaveLength(0);
  });

  it("una clave de puros espacios es una clave que falta", async () => {
    const { pedir, llamadas } = respondiendo(devolviendoTexto("{}"));

    const resultado = await proveedorAnthropic(
      entorno({ IA_API_KEY: "   " }),
      pedir,
    ).proponer(PETICION);

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.falla.motivo).toBe("modelo_no_configurado");
    expect(llamadas).toHaveLength(0);
  });
});

/* ==========================================================================
   El proveedor por configuración
   ========================================================================== */

describe("modeloDesdeEntorno resuelve el proveedor por configuración", () => {
  it("sin configuración usa Anthropic, que es el único que existe hoy", async () => {
    const { pedir, llamadas } = respondiendo(
      devolviendoTexto(JSON.stringify({ modulos: [MODULO_VALIDO], lineas: [] })),
    );

    const resultado = await modeloDesdeEntorno(
      entorno({ IA_API_KEY: CLAVE }),
      { pedir },
    ).proponer(PETICION);

    expect(resultado.ok).toBe(true);
    expect(llamadas[0]?.url).toBe(URL_DE_MENSAJES);
  });

  it("un proveedor que no existe falla cerrado y no llama a nadie", async () => {
    const { pedir, llamadas } = respondiendo(devolviendoTexto("{}"));

    const resultado = await modeloDesdeEntorno(
      entorno({ IA_API_KEY: CLAVE, IA_PROVEEDOR: "un-proveedor-que-no-existe" }),
      { pedir },
    ).proponer(PETICION);

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.falla.motivo).toBe("proveedor_desconocido");
    expect(llamadas).toHaveLength(0);
  });

  it("el registro de proveedores no tiene entradas sin implementación", () => {
    expect(Object.keys(PROVEEDORES)).toEqual(["anthropic"]);
  });
});

/* ==========================================================================
   Lo que viaja en el pedido
   ========================================================================== */

describe("el pedido que arma el adaptador", () => {
  async function pedidoDe(
    peticion: PeticionDeCompletado,
    ajustes: Partial<Env> = {},
  ): Promise<{ url: string; cabeceras: Headers; cuerpo: Record<string, unknown> }> {
    const { pedir, llamadas } = respondiendo(
      devolviendoTexto(JSON.stringify({ modulos: [MODULO_VALIDO], lineas: [] })),
    );

    await proveedorAnthropic(
      entorno({ IA_API_KEY: CLAVE, ...ajustes }),
      pedir,
    ).proponer(peticion);

    const llamada = llamadas[0];
    if (llamada === undefined) throw new Error("no hubo pedido");

    return {
      url: llamada.url,
      cabeceras: new Headers(llamada.init.headers),
      cuerpo: JSON.parse(String(llamada.init.body)) as Record<string, unknown>,
    };
  }

  it("va al endpoint de mensajes con la clave y la versión de la API", async () => {
    const { url, cabeceras } = await pedidoDe(PETICION);

    expect(url).toBe(URL_DE_MENSAJES);
    expect(cabeceras.get("x-api-key")).toBe(CLAVE);
    expect(cabeceras.get("anthropic-version")).toBe(VERSION_DE_LA_API);
    expect(cabeceras.get("content-type")).toBe("application/json");
  });

  it("usa `claude-opus-5` cuando nadie configura otra cosa", async () => {
    const { cuerpo } = await pedidoDe(PETICION);

    expect(MODELO_POR_DEFECTO).toBe("claude-opus-5");
    expect(cuerpo.model).toBe("claude-opus-5");
    expect(cuerpo.max_tokens).toBe(MAXIMO_DE_TOKENS_POR_DEFECTO);
  });

  it("obedece el modelo que diga la configuración", async () => {
    const { cuerpo } = await pedidoDe(PETICION, { IA_MODELO: "claude-sonnet-5" });

    expect(cuerpo.model).toBe("claude-sonnet-5");
  });

  it("no manda `temperature` ni `budget_tokens`, que Opus 5 rechaza con 400", async () => {
    const { cuerpo } = await pedidoDe(PETICION);

    expect(Object.keys(cuerpo).sort()).toEqual([
      "max_tokens",
      "messages",
      "model",
      "system",
    ]);
  });

  it("manda la descripción como el turno del usuario", async () => {
    const { cuerpo } = await pedidoDe(PETICION);

    expect(cuerpo.messages).toEqual([
      { role: "user", content: PETICION.entrada },
    ]);
  });

  it("los antecedentes viajan como bloques aparte de las instrucciones", async () => {
    // El punto de enchufe del corpus: cuando exista, T-9 lo renderiza y lo
    // pone acá. La forma de la costura no cambia.
    const { cuerpo } = await pedidoDe({
      ...PETICION,
      antecedentes: ["Cotización previa A", "Cotización previa B"],
    });

    expect(cuerpo.system).toEqual([
      { type: "text", text: PETICION.instrucciones },
      { type: "text", text: "Cotización previa A" },
      { type: "text", text: "Cotización previa B" },
    ]);
  });

  it("sin antecedentes el sistema lleva un solo bloque", async () => {
    const { cuerpo } = await pedidoDe(PETICION);

    expect(cuerpo.system).toEqual([
      { type: "text", text: PETICION.instrucciones },
    ]);
  });
});

/* ==========================================================================
   La falla de red, que no es una guarda
   ========================================================================== */

describe("cuando el proveedor no está disponible", () => {
  /**
   * **Por qué acá sí hay un `try`, y por qué no contradice la restricción 2.**
   *
   * «Las guardas se cuentan, nunca se atrapan» prohíbe envolver el error de un
   * disparador, una llave foránea o un índice: esos son **reglas nuestras**, y
   * atraparlas disfraza de respuesta amable la violación de un invariante que
   * nosotros elegimos sostener. Un `fetch` que tira no viola ninguna regla
   * nuestra: es un sistema externo informando que no está. No hay nada que
   * disfrazar, y la alternativa —dejarlo propagar— convierte «Anthropic tuvo
   * un mal minuto» en un 500 sin motivo.
   *
   * La disciplina que lo mantiene honesto es **el alcance**: el `try` envuelve
   * exactamente el transporte y nada más. La validación de esquema corre
   * fuera, así que `salida_rechazada` no se puede alcanzar desde un `catch`.
   */
  it("un transporte que tira es `proveedor_no_disponible`", async () => {
    const { pedir } = cayendose(new TypeError("network error"));

    const resultado = await proveedorAnthropic(
      entorno({ IA_API_KEY: CLAVE }),
      pedir,
    ).proponer(PETICION);

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.falla.motivo).toBe("proveedor_no_disponible");
  });

  const estados: [string, number][] = [
    ["un 401 por clave inválida", 401],
    ["un 429 por límite de tasa", 429],
    ["un 500 del proveedor", 500],
    ["un 529 de sobrecarga", 529],
  ];

  it.each(estados)("%s es `proveedor_no_disponible`", async (_n, status) => {
    const { pedir } = respondiendo({}, { ok: false, status });

    const resultado = await proveedorAnthropic(
      entorno({ IA_API_KEY: CLAVE }),
      pedir,
    ).proponer(PETICION);

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.falla.motivo).toBe("proveedor_no_disponible");
    expect(resultado.falla.detalle).toContain(String(status));
  });

  it("un cuerpo que no es JSON es `proveedor_no_disponible`, no una salida rechazada", async () => {
    // El transporte no pudo entregar nada legible. No es el modelo
    // inventando un campo: es la respuesta que no llegó entera.
    const pedir: Pedir = () =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.reject(new SyntaxError("Unexpected end of JSON")),
      });

    const resultado = await proveedorAnthropic(
      entorno({ IA_API_KEY: CLAVE }),
      pedir,
    ).proponer(PETICION);

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.falla.motivo).toBe("proveedor_no_disponible");
  });
});

/* ==========================================================================
   La respuesta del proveedor
   ========================================================================== */

describe("cuando el proveedor responde algo que no sirve", () => {
  async function fallaDe(cuerpo: unknown): Promise<string> {
    const { pedir } = respondiendo(cuerpo);
    const resultado = await proveedorAnthropic(
      entorno({ IA_API_KEY: CLAVE }),
      pedir,
    ).proponer(PETICION);

    if (resultado.ok) return "ok";
    return resultado.falla.motivo;
  }

  const ininteligibles: [string, unknown][] = [
    ["el cuerpo no es un objeto", "no-es-objeto"],
    ["no trae `content`", { stop_reason: "end_turn" }],
    ["`content` no es un arreglo", { content: "texto", stop_reason: "end_turn" }],
    ["`content` viene vacío", { content: [], stop_reason: "end_turn" }],
    [
      "no hay un solo bloque de texto",
      { content: [{ type: "thinking", thinking: "" }], stop_reason: "end_turn" },
    ],
  ];

  it.each(ininteligibles)("%s es `respuesta_ininteligible`", async (_n, cuerpo) => {
    expect(await fallaDe(cuerpo)).toBe("respuesta_ininteligible");
  });

  it("un corte por `max_tokens` es `respuesta_truncada` y no una salida rechazada", async () => {
    // El JSON cortado a la mitad no parsea, y llamarlo `salida_rechazada`
    // diría que el modelo se equivocó cuando lo que pasó es que no terminó.
    expect(
      await fallaDe(devolviendoTexto('{"modulos":[{"tipo":"alc', "max_tokens")),
    ).toBe("respuesta_truncada");
  });

  it("una negativa del proveedor tiene su propio motivo", async () => {
    expect(
      await fallaDe({
        content: [{ type: "text", text: "No puedo ayudar con eso." }],
        stop_reason: "refusal",
      }),
    ).toBe("respuesta_rechazada_por_el_proveedor");
  });

  it("una salida que no pasa el esquema es `salida_rechazada` y trae los motivos", async () => {
    const { pedir } = respondiendo(
      devolviendoTexto(
        JSON.stringify({ modulos: [], lineas: [], total: 500000 }),
      ),
    );

    const resultado = await proveedorAnthropic(
      entorno({ IA_API_KEY: CLAVE }),
      pedir,
    ).proponer(PETICION);

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.falla.motivo).toBe("salida_rechazada");
    expect(resultado.falla.rechazos).toEqual([
      { ruta: "propuesta.total", motivo: "campo_desconocido" },
    ]);
  });

  it("el catálogo de trámites de la petición es el que cierra la validación", async () => {
    const salida = JSON.stringify({
      modulos: [],
      lineas: [{ ...LINEA_VALIDA, tipoProcesoId: "tp-divorcio" }],
    });

    const rechazada = await proveedorAnthropic(
      entorno({ IA_API_KEY: CLAVE }),
      respondiendo(devolviendoTexto(salida)).pedir,
    ).proponer(PETICION);

    expect(rechazada.ok).toBe(false);
    if (rechazada.ok) return;
    expect(rechazada.falla.motivo).toBe("salida_rechazada");

    const aceptada = await proveedorAnthropic(
      entorno({ IA_API_KEY: CLAVE }),
      respondiendo(devolviendoTexto(salida)).pedir,
    ).proponer({ ...PETICION, tiposDeProcesoOfrecidos: ["tp-divorcio"] });

    expect(aceptada.ok).toBe(true);
    if (!aceptada.ok) return;
    expect(aceptada.valor.lineas[0]?.tipoProcesoId).toBe("tp-divorcio");
  });

  it("junta los bloques de texto cuando el proveedor manda más de uno", async () => {
    const { pedir } = respondiendo({
      content: [
        { type: "thinking", thinking: "" },
        { type: "text", text: '{"modulos":[],' },
        { type: "text", text: '"lineas":[]}' },
      ],
      stop_reason: "end_turn",
    });

    const resultado = await proveedorAnthropic(
      entorno({ IA_API_KEY: CLAVE }),
      pedir,
    ).proponer(PETICION);

    // Se juntan y el resultado es una propuesta vacía: lo que importa es que
    // el motivo sea del esquema y no del transporte.
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.falla.motivo).toBe("salida_rechazada");
    expect(resultado.falla.rechazos?.[0]?.motivo).toBe("propuesta_vacia");
  });
});

/* ==========================================================================
   El entorno de las pruebas no hereda estado local
   ========================================================================== */

describe("el entorno de las pruebas no hereda estado local", () => {
  // La prueba del defecto, no de la corrección: si alguien vuelve a esparcir
  // `env` sin anular las tres, en la máquina que tenga `IA_API_KEY` en
  // `.dev.vars` la prueba del secreto ausente deja de probar lo que dice.
  it("entorno() entrega las tres variables sin definir salvo que se pidan", () => {
    expect(entorno().IA_API_KEY).toBeUndefined();
    expect(entorno().IA_MODELO).toBeUndefined();
    expect(entorno().IA_PROVEEDOR).toBeUndefined();
    expect(entorno({ IA_API_KEY: CLAVE }).IA_API_KEY).toBe(CLAVE);
  });
});
