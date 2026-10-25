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
 * `never`, la restricción `T extends never` de `DebeSerVacio` no se satisface
 * y **el `typecheck` se cae con TS2344** nombrando la clase sin rótulo.
 *
 * Sin esto, una clase nueva compilaría, la base la aceptaría —si alguien se
 * acordó del `CHECK`— y la pantalla la dibujaría sin rótulo, que en una
 * pantalla que separa las dos familias quiere decir una sección sin título
 * encima de una columna de dinero.
 *
 * ## La forma que había acá no servía, y hay que no volver a escribirla
 *
 * Hasta T-8 la red era `export const TODAS_LAS_CLASES_TIENEN_ROTULO:
 * ClasesSinRotulo[] = []`, y este comentario afirmaba que esa asignación no
 * compilaba. **Era falso**: un arreglo vacío es asignable a `T[]` para
 * cualquier `T`, así que `const x: "itbms"[] = []` compila igual que
 * `const x: never[] = []`.
 *
 * ## Y acá la mutación equivocada es muy fácil de hacer
 *
 * Agregar `"itbms"` a `ClaseDeLinea` **a secas** sí rompe el `typecheck`,
 * pero por otra cosa: hay dos `Record<ClaseDeLinea, …>` multilínea en las
 * pantallas —`COMO_SE_IMPRIME` en
 * `src/pantallas/cotizaciones/impresion.ts` y `COMO_SE_MUESTRA` en
 * `src/pantallas/cotizaciones/lineas.ts`— que exigen una entrada por clase.
 * Esa muerte no prueba esta red.
 *
 * El camino que esta red cubre, y que nadie más cubre, es **clase con sus
 * dos entradas de pantalla y sin entrada en `CATALOGO_DE_CLASES`**. Se midió
 * así con la forma vieja y `pnpm typecheck` salió 0; con la forma de abajo
 * sale TS2344. Es el gemelo exacto de «frase sí, dueño no» en
 * `worker/bitacora/vocabulario.ts`.
 */
type DebeSerVacio<T extends never> = T;

export type ClasesSinRotulo = DebeSerVacio<
  Exclude<ClaseDeLinea, (typeof CATALOGO_DE_CLASES)[number]["clase"]>
>;

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
 * identificador crudo escondería justamente el caso que `ClasesSinRotulo`
 * existe para romper en el `typecheck`.
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

/* --------------------------------------------------------------------------
   El ITBMS (T-12)

   **La aritmética del impuesto vive acá y no en `./impuesto.ts`**, y la razón
   es el encabezado de esta sección: el ITBMS es aritmética de la cotización,
   igual que la suma de los honorarios, y partirla en dos archivos sería el
   primer paso hacia dos sitios que suman dinero.

   En `./impuesto.ts` queda lo único que acá no puede estar: la lectura de la
   variable de entorno que lo enciende. Este archivo viaja al navegador
   —`tsconfig.app.json` lo lista para que la pantalla comparta el catálogo de
   clases— y la condición para estar en esa lista es no arrastrar servidor.
   -------------------------------------------------------------------------- */

/**
 * La tarifa, en puntos porcentuales enteros.
 *
 * **Entera y no `0.07`**, por lo mismo que los montos son centavos: un 7
 * multiplica exacto y un 0,07 no se puede representar en coma flotante. La
 * división por cien viene después, y viene escrita de forma que no produzca
 * un flotante nunca (ver `itbmsDe`).
 */
export const TARIFA_DEL_ITBMS_POR_CIENTO = 7;

/** El divisor del porcentaje. Acá, y en ningún otro lado de este archivo. */
const CIEN = 100;

/**
 * Cómo se llama el impuesto en el papel que el cliente lee.
 *
 * **Se arma con la tarifa y no se escribe a mano**: son las dos mitades
 * acopladas de siempre, y acá la consecuencia de separarlas es la peor
 * posible — el documento diría «ITBMS (7 %)» encima de una cuenta hecha a
 * otra tarifa, y la cifra equivocada es la que el cliente firma.
 */
export const ROTULO_DEL_ITBMS = `ITBMS (${String(
  TARIFA_DEL_ITBMS_POR_CIENTO,
)} %)`;

/**
 * Si el bufete factura ITBMS hoy.
 *
 * Es un objeto de un solo campo y no un `boolean` suelto, y la razón se lee
 * en el sitio donde se usa: `totalesDe(lineas, true)` no dice nada —¿true
 * qué? ¿editable? ¿incluye gastos?— y `totalesDe(lineas, regimen)` sí. Un
 * booleano posicional en una función de dinero es el que alguien invierte al
 * refactorizar sin que el compilador se entere.
 *
 * **No lleva la tarifa adentro**, y eso también es una decisión: el 7 % es la
 * ley, no una preferencia del bufete. Si un día la ley cambia, cambia para
 * todos a la vez y el sitio donde se escribe es la constante de arriba.
 */
export interface RegimenDeImpuesto {
  readonly grava: boolean;
}

/**
 * El régimen apagado. **Es el estado por omisión del sistema entero.**
 *
 * Existe como constante exportada y no sólo como literal por dentro, porque
 * es lo que `totalesDe` toma cuando no le pasan nada: el valor por omisión de
 * ese parámetro **es** el interruptor en su posición apagada, y tener un
 * nombre para esa posición es lo que permite escribir la prueba que exige que
 * las dos formas de llegar —no pasar nada y pasar `SIN_ITBMS`— den lo mismo.
 */
export const SIN_ITBMS: RegimenDeImpuesto = { grava: false };

/** El régimen encendido. Hoy sólo lo produce `regimenDelBufete`. */
export const CON_ITBMS: RegimenDeImpuesto = { grava: true };

/**
 * El ITBMS de una base de honorarios, en centavos enteros.
 *
 * ## Se trunca hacia abajo, y el residuo no se cobra
 *
 * El 7 % de un número impar de centavos casi nunca es un número entero de
 * centavos: 162 345 al 7 % son **11 364,15**, y se cobran 11 364. Los 0,15
 * que sobran no se reparten, no se redondean hacia arriba y no se ajustan
 * contra el total. Tres razones, y la primera es la que manda:
 *
 *  1. **Es la misma regla que `importeDe`** en `worker/cuotas/dominio.ts`,
 *     que trunca el porcentaje de una cuota. Dos reglas distintas harían que
 *     «el 7 %» y «700 puntos básicos» del mismo número dieran respuestas
 *     distintas, y el sistema pasaría a tener dos aritméticas del dinero —que
 *     es el defecto que esta tajada lleva tres tareas negándose a crear.
 *  2. **Truncar nunca le cobra al cliente un centavo de más.** Bajo un
 *     impuesto que la contadora todavía no validó, errar del lado del cliente
 *     es la única dirección defendible.
 *  3. **Es exacta por construcción.** `Math.round(base * 7 / 100)` tiene que
 *     producir un flotante antes de redondearlo; la forma de abajo no. El
 *     producto es entero y está acotado muy por debajo de 2^53 —diez millones
 *     de dólares son 10^9 centavos, y por 7 da 7 × 10^9—, el resto se calcula
 *     con `%`, que sobre enteros exactos es exacto, y la resta deja un
 *     múltiplo exacto de 100 cuya división sí es representable sin pérdida.
 *     No hay `Math.round`, no hay `toFixed` y no hay conversión a dólares en
 *     el camino.
 *
 * Y el residuo **se ve**, que es la lección que T-11 dejó escrita con el plan
 * de pagos: un número que no cierra se muestra, no se ajusta. Acá se ve
 * porque los cuatro números viajan juntos en `TotalesDeCotizacion`
 * —honorarios, impuesto y gastos al lado del total—, así que quien quiera
 * comprobar la cuenta tiene las cuatro cifras delante.
 *
 * No hay rama para `0`: cero honorarios dan cero de impuesto por la misma
 * cuenta, y una cotización que sólo tiene gastos estimados todavía no cobra
 * nada gravado.
 */
export function itbmsDe(honorarios: number): number {
  const producto = honorarios * TARIFA_DEL_ITBMS_POR_CIENTO;
  return (producto - (producto % CIEN)) / CIEN;
}

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
 *
 * ## El segundo parámetro **es el interruptor del ITBMS**, y nace apagado
 *
 * `impuesto` tiene valor por omisión, y ese valor —`SIN_ITBMS`— no es una
 * comodidad para no escribirlo: **es la posición apagada del interruptor**,
 * y es lo que hace que `odd/tasks/cotizaciones.md` se cumpla por
 * construcción. Ninguna cotización lleva impuesto salvo que alguien lo pida
 * explícitamente, y quien lo pide es `regimenDelBufete` leyendo una variable
 * de entorno que hoy no está puesta en ningún lado.
 *
 * Que sea opcional y no obligatorio **no se eligió**: `test/generador-api.spec.ts`
 * llama a `totalesDe(lineas)` con un solo argumento y está fuera de la
 * superficie de esta tarea. Pero el resultado es el correcto igual, y por un
 * motivo que vale escribir: un parámetro que se puede olvidar, cuando
 * olvidarlo deja el sistema en el estado seguro, es un parámetro que falla
 * bien. Al revés —apagarlo teniendo que acordarse— el primer llamador que
 * alguien escriba distraído le cobra un impuesto a un cliente.
 *
 * ## Por qué acá el total **sí** se deriva, y arriba se insistía en que no
 *
 * Con el régimen encendido, `total` sale de `total + itbms` y no de un cuarto
 * acumulador en el recorrido. Parece lo contrario de lo que el párrafo de
 * arriba defiende, y no lo es: ahí el argumento era que `honorarios +
 * gastosEstimados` convierte en tautología una prueba que afirma los tres,
 * porque **los dos caminos existen** —se pueden sumar las líneas de nuevo—.
 * El impuesto no tiene segundo camino: no es una línea, nadie lo escribió en
 * ninguna fila, y la única forma de saber cuánto es, es calcularlo. Derivar
 * el total de un número que sólo existe derivado no crea una segunda
 * definición; crea la primera.
 *
 * Lo que sí hay que no perder de vista es que **el impuesto se suma al total
 * y no se mete en `honorarios`**: el subtotal de honorarios es lo que cobra
 * el bufete, y el ITBMS es plata de la DGI que el bufete recauda. Meterlo
 * adentro haría que el documento mintiera sobre cuánto cobró el estudio.
 */
export function totalesDe(
  lineas: readonly LineaSumable[],
  impuesto: RegimenDeImpuesto = SIN_ITBMS,
): TotalesDeCotizacion {
  let honorarios = 0;
  let gastosEstimados = 0;
  let total = 0;

  for (const linea of lineas) {
    if (linea.clase === "honorario") honorarios += linea.monto;
    else gastosEstimados += linea.monto;
    total += linea.monto;
  }

  if (!impuesto.grava) return { honorarios, gastosEstimados, total };

  const itbms = itbmsDe(honorarios);
  return { honorarios, gastosEstimados, itbms, total: total + itbms };
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
