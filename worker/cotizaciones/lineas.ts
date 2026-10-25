/**
 * El catálogo de clases de línea, las reglas de qué es una línea aceptable y
 * **la aritmética de la cotización**. Puras: ni D1 ni HTTP.
 *
 * Es el hermano de `worker/cotizaciones/modulos.ts` una tabla más abajo, y
 * casi todo lo que decide ya lo decidió aquél. Lo que esta mitad agrega, y
 * que la de prosa no tenía, es dinero.
 *
 * ## La barandilla de la tajada vive acá
 *
 * > **Subtotales y total se derivan, no se guardan.**
 *
 * `migrations/0004_cotizaciones.sql` no tiene columna de subtotal ni de
 * total, ni en `cotizacion_linea` ni en `cotizacion`, y eso no es una
 * omisión que haya que completar: es la regla. Si se guardaran, en seis meses
 * habría cotizaciones cuyo total no coincide con la suma de sus líneas y
 * nadie sabría cuál de los dos números es el verdadero — y la pregunta que
 * la tajada existe para contestar, «¿cuánto cobramos en promedio por una
 * visa de trabajo?», se contestaría mal para siempre.
 *
 * La suma vive en **una sola función**, `totalesDe`, que el servidor y la
 * pantalla importan del mismo lugar. Dos sumas en dos sitios son dos
 * resultados el día que una cambie.
 *
 * ## Centavos enteros, y por qué la validación del monto no sobra
 *
 * Restricción 5 de la tajada: montos en enteros de centavos, nunca coma
 * flotante. La base lo sostiene con
 * `CHECK (typeof(monto) = 'integer' AND monto >= 0)` y **ese `CHECK` es el
 * que manda**, porque en SQLite `INTEGER` es afinidad y no tipo: un 1500.5
 * no se puede convertir a entero sin pérdida, así que la columna lo guardaría
 * tal cual si nadie se lo impidiera. Eso está medido en `0004` y no se
 * duplica acá.
 *
 * Lo que sí hace falta acá es otra cosa, y es la misma frontera de siempre:
 * el `CHECK` convierte un monto mal formado en un 500 que nadie puede leer, y
 * `monto_invalido` lo convierte en un 422 que dice qué arreglar. Y hay un
 * segundo efecto que el `CHECK` no puede dar: **que la ruta no convierta a
 * coma flotante en el camino**. Lo que no pasa por `normalizarLinea` no llega
 * a la base como número, y lo que pasa es un entero.
 *
 * ## Las dos mitades acopladas, otra vez
 *
 * El `CHECK` de `cotizacion_linea.clase` y el registro de abajo son **una
 * sola decisión escrita dos veces**, exactamente como el catálogo de tipos de
 * módulo y como el vocabulario de la bitácora:
 *
 *  - El **`CHECK`** es el que sobrevive al primer script de importación (§5).
 *  - El **registro** es el que le da rótulo y orden a cada clase, el que la
 *    pantalla dibuja y el que, en T-9, impide que el modelo invente una.
 *
 * Si se separan, la pantalla ofrece una clase que la base rechaza con un 500
 * que nadie puede leer. `test/lineas-api.spec.ts` las compara y falla.
 */

import type {
  ClaseDeLinea,
  DatosDeLinea,
  FallaDeValidacion,
  MotivoDeFalla,
  TotalesDeCotizacion,
} from "../contract";

/**
 * Las dos clases, **en el orden en que se muestran**.
 *
 * Primero lo que cobra el bufete y después lo que el encargo va a costar en
 * trámites de terceros. Es el orden en que se lee una propuesta y el orden en
 * que la pantalla las separa, y no el alfabético — que pondría el gasto
 * primero y haría que lo aproximado encabezara el documento.
 *
 * El rótulo del gasto dice «estimados» y eso no es decoración: un presupuesto
 * de gasto que se lee como un precio cerrado es una promesa que el bufete no
 * puede cumplir, y el usuario fue explícito en que el saldo de gastos es
 * informativo y no verdad contable.
 *
 * `as const satisfies` y no una anotación, por lo mismo que
 * `CATALOGO_DE_MODULOS`: así las cadenas conservan sus literales —y
 * `rotuloDeClase` puede devolver el tipo estrecho— pero el compilador sigue
 * exigiendo que cada `clase` sea una de la unión. Una clase inventada acá no
 * compila.
 *
 * **El registro tiene dos campos y no tres**, por el mismo argumento que el
 * de los módulos: el orden en que se muestran **es** la posición en el
 * arreglo, y una columna `orden` sería un segundo lugar donde decir lo mismo.
 * Tampoco hay `descripcion` ni `aproximado: true`: que el gasto sea
 * aproximado ya lo dice su rótulo, y una bandera paralela es la que mañana
 * dice otra cosa que el texto.
 */
export const CATALOGO_DE_CLASES = [
  { clase: "honorario", rotulo: "Honorarios" },
  { clase: "gasto_estimado", rotulo: "Gastos estimados" },
] as const satisfies readonly { clase: ClaseDeLinea; rotulo: string }[];

/**
 * La red que impide que una clase de la unión se quede sin entrada.
 *
 * El `satisfies` de arriba cierra una dirección: no se puede rotular una
 * clase que no está en `ClaseDeLinea`. Esto cierra la otra: si alguien agrega
 * una clase a la unión y no la pone en el catálogo, `Exclude<…>` deja de ser
 * `never` y la asignación de abajo **no compila**. Es el mismo mecanismo que
 * `TiposSinRotulo` y que `AccionesSinDuenio`.
 *
 * Sin esto, una clase nueva compilaría, la base la aceptaría —si alguien se
 * acordó del `CHECK`— y la pantalla la dibujaría sin rótulo, que en una
 * pantalla que separa las dos familias quiere decir una sección sin título
 * encima de una columna de dinero.
 */
export type ClasesSinRotulo = Exclude<
  ClaseDeLinea,
  (typeof CATALOGO_DE_CLASES)[number]["clase"]
>;

/** El uso que hace valer la red de arriba. Tiene que poder ser `never`. */
export const TODAS_LAS_CLASES_TIENEN_ROTULO: ClasesSinRotulo[] = [];

/**
 * Sólo los identificadores, en el mismo orden.
 *
 * Se deriva del catálogo en vez de escribirse de nuevo, igual que
 * `TIPOS_DE_MODULO` y `ACCIONES_DE_BITACORA`: una segunda lista a mano es la
 * que se desincroniza. Es la que `test/lineas-api.spec.ts` compara contra el
 * `CHECK` de la base.
 */
export const CLASES_DE_LINEA: readonly ClaseDeLinea[] = CATALOGO_DE_CLASES.map(
  (entrada) => entrada.clase,
);

const ROTULOS = new Map<string, string>(
  CATALOGO_DE_CLASES.map((entrada) => [entrada.clase, entrada.rotulo]),
);

/**
 * El rótulo de una clase, para una persona.
 *
 * Total sobre la unión —el `Map` se construye del mismo catálogo que la red
 * de arriba vigila— así que no hay rama de reserva: una que devolviera el
 * identificador crudo escondería justamente el caso que
 * `TODAS_LAS_CLASES_TIENEN_ROTULO` existe para romper en el `typecheck`.
 */
export function rotuloDeClase(clase: ClaseDeLinea): string {
  return ROTULOS.get(clase) as string;
}

/** Si una cadena cualquiera es una de las dos clases. */
export function esClaseDeLinea(valor: unknown): valor is ClaseDeLinea {
  return typeof valor === "string" && ROTULOS.has(valor);
}

/* ==========================================================================
   La aritmética. Acá, y en ningún otro lado.
   ========================================================================== */

/**
 * Lo mínimo que hace falta para sumar: la clase y el monto.
 *
 * Es estructural y no `LineaDeCotizacion` entera para que la pantalla pueda
 * sumar lo que tiene a mano —y para que una prueba pueda construir el caso
 * con dos campos en vez de con siete, que es lo que hace que la prueba se
 * lea—.
 */
export interface LineaSumable {
  readonly clase: ClaseDeLinea;
  /** Centavos enteros. */
  readonly monto: number;
}

/**
 * Lo que suman las líneas: honorarios, gastos estimados y el total.
 *
 * **Enteros de principio a fin.** No hay división, no hay `Math.round`, no
 * hay `toFixed` y no hay una conversión a unidades de moneda en el camino:
 * cualquiera de las cuatro metería un número de coma flotante en el medio, y
 * una suma de flotantes no es asociativa. La diferencia no es teórica —en
 * dólares, `0.1 + 0.2` no da `0.3`— y en una cotización se manifiesta como un
 * total que no coincide con sus líneas por un centavo, que es exactamente lo
 * que destruye la confianza en el documento.
 *
 * La suma recorre las líneas una sola vez. Separar en dos `filter` daría el
 * mismo número y recorrería tres veces para decir lo mismo.
 *
 * `total` se suma del mismo recorrido y **no** se calcula como
 * `honorarios + gastosEstimados` por una razón de prueba, no de rendimiento:
 * derivarlo de los otros dos haría que una prueba que afirma los tres
 * estuviera afirmando dos, y el tercero sería una tautología. Con los enteros
 * de esta función los dos caminos dan lo mismo siempre; que den lo mismo es
 * justamente lo que una prueba puede exigir, y no puede si uno es el otro.
 *
 * Una lista vacía suma cero en los tres, y eso no es un caso especial: una
 * cotización sin líneas todavía no cobra nada. No hay rama para eso.
 */
export function totalesDe(
  lineas: readonly LineaSumable[],
): TotalesDeCotizacion {
  let honorarios = 0;
  let gastosEstimados = 0;
  let total = 0;

  for (const linea of lineas) {
    if (linea.clase === "honorario") honorarios += linea.monto;
    else gastosEstimados += linea.monto;
    total += linea.monto;
  }

  return { honorarios, gastosEstimados, total };
}

/* ==========================================================================
   La forma de lo que llega por el cable
   ========================================================================== */

export type NormalizacionDeLinea =
  | { ok: true; datos: DatosDeLinea }
  | { ok: false; fallas: FallaDeValidacion[] };

export type NormalizacionDeOrdenDeLineas =
  | { ok: true; orden: string[] }
  | { ok: false; fallas: FallaDeValidacion[] };

function falla(campo: string, motivo: MotivoDeFalla): FallaDeValidacion {
  return { campo, motivo };
}

function esObjeto(cuerpo: unknown): cuerpo is Record<string, unknown> {
  return typeof cuerpo === "object" && cuerpo !== null && !Array.isArray(cuerpo);
}

/**
 * De un cuerpo JSON cualquiera a los datos de una línea, o a la lista de por
 * qué no.
 *
 * Devuelve **todas** las fallas y no la primera, igual que el alta de una
 * cotización y la de un módulo: un formulario que corrige de a un error por
 * envío es el formulario que nadie usa. Y acá importa más que allá, porque
 * una línea tiene cuatro campos y tres de ellos se pueden equivocar.
 *
 * `orden` **se ignora en silencio** si viene, igual que en un módulo: ninguna
 * pantalla lo manda, así que un 422 no le hablaría a nadie, y lo que de
 * verdad importa —que no se pueda imponer— lo garantiza que esta función no
 * lo copia a la salida. El `orden` lo asigna el servidor, siempre.
 */
export function normalizarLinea(cuerpo: unknown): NormalizacionDeLinea {
  if (!esObjeto(cuerpo)) {
    return {
      ok: false,
      fallas: [falla("clase", "clase_de_linea_desconocida")],
    };
  }

  const fallas: FallaDeValidacion[] = [];

  // Ausente, en blanco e inventada caen en el mismo motivo, por el argumento
  // que `tipo_de_modulo_desconocido` escribe entero: la clase sale de un
  // control que la pantalla dibuja del mismo registro contra el que el
  // servidor valida.
  const clase = cuerpo.clase;
  if (!esClaseDeLinea(clase)) {
    fallas.push(falla("clase", "clase_de_linea_desconocida"));
  }

  // Se recorta al guardar, y por eso la comprobación es sobre el recorte: un
  // concepto de tres espacios es un monto sin explicación.
  const crudo = cuerpo.concepto;
  let concepto = "";
  if (crudo === undefined || crudo === null) {
    fallas.push(falla("concepto", "concepto_requerido"));
  } else if (typeof crudo !== "string") {
    fallas.push(falla("concepto", "tipo_invalido"));
  } else {
    concepto = crudo.trim();
    if (concepto === "") fallas.push(falla("concepto", "concepto_requerido"));
  }

  // **El monto tiene que llegar como número de JSON y ya entero.** No se
  // acepta `"2000"` ni se convierte: una cadena que el servidor parsea es un
  // camino por el que mañana entra `"2.000,50"` y sale cualquier cosa, y la
  // conversión de lo que la persona teclea a centavos es de la pantalla, que
  // es la que sabe en qué unidad lo escribió.
  //
  // `Number.isSafeInteger` y no `Number.isInteger`: por encima de 2^53 los
  // enteros dejan de ser distinguibles entre sí, así que un monto de ese
  // tamaño ya no es el número que alguien quiso escribir. También descarta
  // `NaN` e `Infinity`, que es lo que llega cuando la pantalla divide por
  // algo vacío.
  const monto = cuerpo.monto;
  if (typeof monto !== "number" || !Number.isSafeInteger(monto) || monto < 0) {
    fallas.push(falla("monto", "monto_invalido"));
  }

  // El trámite es opcional —una consulta o una mensajería no abre ninguno— y
  // por eso la ausencia y el nulo son lo mismo y no una falla. Que el
  // identificador exista **y sea de este bufete** lo decide el repositorio,
  // que es el único que lo puede saber: la misma frontera que `clienteId` en
  // el alta de la cotización.
  const tipoProceso = cuerpo.tipoProcesoId;
  let tipoProcesoId: string | null = null;
  if (tipoProceso !== undefined && tipoProceso !== null) {
    if (typeof tipoProceso !== "string" || tipoProceso.trim() === "") {
      fallas.push(falla("tipoProcesoId", "tipo_invalido"));
    } else {
      tipoProcesoId = tipoProceso;
    }
  }

  if (fallas.length > 0) return { ok: false, fallas };

  return {
    ok: true,
    datos: {
      clase: clase as ClaseDeLinea,
      concepto,
      monto: monto as number,
      tipoProcesoId,
    },
  };
}

/**
 * De un cuerpo JSON cualquiera a la lista de identificadores en su orden
 * nuevo, o a por qué no.
 *
 * Acá sólo se comprueba la **forma**: que sea un arreglo de cadenas no
 * vacías. Que esos identificadores sean exactamente las líneas de esta
 * cotización lo decide el repositorio, que es el único que las conoce.
 *
 * Es la gemela exacta de `normalizarOrdenDeModulos`, y **no se compartió a
 * propósito, aunque sean las mismas diez líneas**: unificarlas pide tocar
 * `worker/cotizaciones/modulos.ts`, que es de la unidad C de T-2 y está
 * fuera de la superficie de ésta. Queda dicho acá para que quien vuelva a
 * tocar las dos lo junte entonces, que es cuando se puede hacer sin tocar
 * código ajeno a la tarea.
 */
export function normalizarOrdenDeLineas(
  cuerpo: unknown,
): NormalizacionDeOrdenDeLineas {
  if (!esObjeto(cuerpo) || !Array.isArray(cuerpo.orden)) {
    return { ok: false, fallas: [falla("orden", "tipo_invalido")] };
  }

  const fallas: FallaDeValidacion[] = [];
  const orden: string[] = [];

  cuerpo.orden.forEach((valor: unknown, indice) => {
    if (typeof valor !== "string" || valor.trim() === "") {
      fallas.push(falla(`orden-${String(indice)}`, "tipo_invalido"));
      return;
    }
    orden.push(valor);
  });

  if (fallas.length > 0) return { ok: false, fallas };

  return { ok: true, orden };
}
