/**
 * El vocabulario del gasto real, **la aritmética del saldo** y las reglas de
 * qué es un movimiento aceptable. Puras: ni D1, ni R2, ni HTTP.
 *
 * ## I-7 vive acá, y lo que vive acá es la resta
 *
 * > **El saldo de gastos nunca se almacena. Siempre se deriva**
 * > (`Σ anticipos − Σ gastos`). `docs/diseno.md` §5.
 *
 * `migrations/0009_gastos_y_comprobantes.sql` no tiene columna de saldo, y eso
 * no es una omisión que haya que completar: es la regla. Si se guardara, en
 * seis meses habría procesos cuyo saldo no coincide con sus movimientos y
 * nadie sabría cuál de los dos números es el verdadero — exactamente el mismo
 * argumento con el que `worker/cotizaciones/lineas.ts` se niega a guardar un
 * total.
 *
 * La resta vive en **una sola función**, `saldoDe`, y **sólo el servidor la
 * llama**. La pantalla no la importa, y eso es deliberado: T-10 B lo decidió
 * así y el encabezado de este archivo decía lo contrario hasta que esa unidad
 * lo midió.
 *
 * El motivo es el precedente de T-3 con `totalesDe`. Si la pantalla pudiera
 * llamarla, la prueba que de verdad importa —que la pantalla **muestra** el
 * saldo y no lo recalcula— sería imposible de escribir, porque las dos
 * implementaciones darían el mismo número. Tener la función a mano es la
 * forma más fácil de que alguien, un martes, la use «para evitar un viaje».
 * Hay una prueba en `test/gastos-ui.spec.ts` que verifica que el módulo de
 * pantalla no la exporta.
 *
 * Dos restas en dos sitios son dos resultados el día que una cambie — por eso
 * la resta es una sola. Que viva de un solo lado del cable no la duplica: la
 * pantalla recibe el número ya restado.
 *
 * **Y el número que sale de acá es informativo, no verdad contable.** Está en
 * el alcance autorizado de la tajada con todas las letras, y se dice en el
 * sitio donde se calcula porque es acá donde alguien podría creer lo
 * contrario: la conciliación bancaria, las cuentas por cobrar y el estado de
 * cuenta formal están fuera (`docs/diseno.md` §2). Esto contesta «¿cómo va la
 * plata de este trámite?», no «¿cuánto debe este cliente ante la DGI?».
 *
 * ## Las dos mecánicas, y por qué no hay una sola rama que las distinga
 *
 * El bufete cobra de dos maneras (`docs/diseno.md` §6):
 *
 *  - **reembolso contra factura**: sólo filas `gasto`, y el saldo queda
 *    negativo — eso es lo que el cliente debe;
 *  - **anticipo con sobrante a favor**: filas `anticipo` y filas `gasto`, y el
 *    saldo queda positivo — eso es lo que le sobra al cliente.
 *
 * **La mecánica no es un dato: es qué filas existen.** El reembolso puro es el
 * caso en que `Σ anticipos` vale cero, y la resta sigue siendo la misma resta.
 * Por eso no hay un `if (mecanica === …)`, no hay columna que la nombre y no
 * hace falta ninguna: una bandera sería un segundo lugar donde decir lo que
 * las filas ya dicen.
 *
 * Y tampoco hay un `if (tipo === "anticipo")` dentro de la suma. El tipo de la
 * fila **indexa** el acumulador en vez de elegir una rama, que es lo que deja
 * que agregar un tipo al vocabulario sea una entrada en un registro y no una
 * condición más en una función que ya suma bien.
 */

import type {
  FallaDeValidacion,
  MotivoDeFalla,
  DatosDeMovimiento,
  SaldoDeGastos,
  TipoDeMovimiento,
} from "../contract";

/* ==========================================================================
   El vocabulario cerrado
   ========================================================================== */

/**
 * Los dos tipos, **en el orden en que se leen**: primero lo que entró y
 * después lo que salió.
 *
 * **Es una de dos mitades acopladas.** La otra es el
 * `CHECK (tipo IN ('gasto', 'anticipo'))` de la migración, y hacen cosas
 * distintas: el `CHECK` es el que sobrevive al primer script de importación
 * (`docs/diseno.md` §5); esta lista es la que cierra lo que la API acepta y la
 * que `esTipoDeMovimiento` consulta. Si se separan, la API acepta un tipo que
 * la base rechaza con un 500 que nadie puede leer. `test/gastos-api.spec.ts`
 * las compara en los dos sentidos.
 *
 * `as const satisfies` y no una anotación, por lo mismo que
 * `MOTIVOS_DE_FALLA_DEL_MODELO`: así las cadenas conservan sus literales y el
 * compilador sigue exigiendo que cada una sea de la unión. Un tipo inventado
 * acá no compila.
 *
 * **No lleva rótulos.** El registro de clases de línea los lleva porque una
 * pantalla los dibuja; acá la pantalla es la unidad B y un rótulo que nadie
 * muestra es una declaración que no hace nada — que es el criterio que T-8 ya
 * aplicó al no cablear lo que no se usaba.
 */
export const TIPOS_DE_MOVIMIENTO = [
  "anticipo",
  "gasto",
] as const satisfies readonly TipoDeMovimiento[];

/**
 * La red que impide que un tipo de la unión se quede fuera de la lista.
 *
 * El `satisfies` de arriba cierra una dirección: no se puede listar un tipo
 * que la unión no tiene. Esto cierra la otra: si alguien agrega un tipo y no
 * lo pone acá, `Exclude<…>` deja de ser `never`, la restricción
 * `T extends never` no se satisface y **el `typecheck` se cae con TS2344**
 * nombrando el tipo que falta.
 *
 * Es la forma medida en T-8, y **no** la que el proyecto usaba antes:
 * `export const X: Exclusion[] = []` compila para cualquier `T`, porque un
 * arreglo vacío es asignable a todo.
 *
 * ## Qué cubre esta red que no cubre nada más, y cuál es la mutación correcta
 *
 * Un tipo nuevo en la unión rompe el `typecheck` por otros tres caminos a la
 * vez que por acá: los dos `Record<TipoDeMovimiento, AccionDeProceso>` de
 * `worker/gastos/repositorio.ts` y el acumulador de `saldoDe`. Una mutación
 * que agregue `"ajuste"` a secas muere por los cuatro juntos, así que **no
 * prueba esta red**, y concluir de ahí que funciona es la trampa que T-8
 * documentó.
 *
 * El único camino que esta red cubre es **tipo con sus tres entradas de
 * registro y sin entrada en `TIPOS_DE_MOVIMIENTO`**: ahí `esTipoDeMovimiento`
 * contestaría `false` sobre un tipo que el resto del sistema sí conoce, la
 * API lo rechazaría con un 422 que habla de un tipo que existe, y nadie se
 * enteraría.
 *
 * Medido con esa mutación —`"ajuste"` en la unión, en el acumulador y en los
 * dos registros de verbos, y **no** en la lista—: el `typecheck` deja
 * exactamente un error, el TS2344 de esta línea. Sin esta red, cero.
 */
type DebeSerVacio<T extends never> = T;

export type TiposDeMovimientoSinListar = DebeSerVacio<
  Exclude<TipoDeMovimiento, (typeof TIPOS_DE_MOVIMIENTO)[number]>
>;

const TIPOS: ReadonlySet<string> = new Set(TIPOS_DE_MOVIMIENTO);

/** Si lo que llegó por el cable es uno de los dos tipos. */
export function esTipoDeMovimiento(valor: unknown): valor is TipoDeMovimiento {
  return typeof valor === "string" && TIPOS.has(valor);
}

/* ==========================================================================
   La aritmética. Acá, y en ningún otro lado.
   ========================================================================== */

/**
 * Lo mínimo que hace falta para sacar el saldo: el tipo y el monto.
 *
 * Es estructural y no `MovimientoDeGasto` entero para que la pantalla pueda
 * sumar lo que tiene a mano, y para que una prueba pueda construir el caso con
 * dos campos en vez de con nueve — que es lo que hace que la prueba se lea.
 */
export interface MovimientoSumable {
  readonly tipo: TipoDeMovimiento;
  /** Centavos enteros. */
  readonly monto: number;
}

/**
 * `Σ anticipos − Σ gastos`, y los dos sumandos que la explican.
 *
 * **Enteros de principio a fin.** No hay división, no hay `Math.round`, no hay
 * `toFixed` y no hay conversión a unidades de moneda en el camino: cualquiera
 * de las cuatro metería un flotante en el medio, y una suma de flotantes no es
 * asociativa. La diferencia no es teórica y tiene su prueba: con un anticipo
 * de 160 238 centavos contra tres gastos de 58 795, 57 539 y 43 904, la cuenta
 * entera da **exactamente cero** —la cuenta está saldada— y la misma cuenta
 * hecha en dólares da 5,68 × 10⁻¹⁴, que no es cero. Una pantalla que pregunta
 * `saldo === 0` para decir «al día» diría que no lo está.
 *
 * ## Por qué el tipo indexa en vez de ramificar
 *
 * `sumas[movimiento.tipo] += movimiento.monto` no es una forma pintoresca de
 * escribir un `if`: es lo que hace que el vocabulario cerrado sea el **único**
 * lugar donde los tipos están enumerados. Con un `if (tipo === "anticipo")`,
 * agregar un tipo compila y suma mal en silencio; con el acumulador tipado
 * `Record<TipoDeMovimiento, number>`, agregar un tipo no compila hasta que
 * alguien diga dónde se acumula.
 *
 * ## Por qué `saldo` se deriva de los otros dos, al revés que `totalesDe`
 *
 * `worker/cotizaciones/lineas.ts` suma su `total` en el mismo recorrido y
 * **no** lo calcula como `honorarios + gastosEstimados`, por una razón de
 * prueba: ahí el total es un tercer hecho —la suma de todas las líneas— y
 * derivarlo volvería tautológica la prueba que afirma los tres.
 *
 * Acá es al revés, y la diferencia es exactamente I-7: el saldo **está
 * definido** como la diferencia de los otros dos. Calcularlo por un segundo
 * camino —un acumulador con signo— sería tener dos definiciones del mismo
 * número en el mismo archivo, que es la misma falla que guardarlo en una
 * columna, una capa más arriba. Dos guardas que resuelven lo mismo se anulan
 * como garantía; dos cuentas que dan el mismo número se contradicen el día que
 * una cambie.
 *
 * Una lista vacía da cero en los tres, y eso no es un caso especial: un
 * proceso sin movimientos no debe nada y no tiene nada a favor. No hay rama.
 */
export function saldoDe(
  movimientos: readonly MovimientoSumable[],
): SaldoDeGastos {
  const sumas: Record<TipoDeMovimiento, number> = { anticipo: 0, gasto: 0 };

  for (const movimiento of movimientos) {
    sumas[movimiento.tipo] += movimiento.monto;
  }

  return {
    anticipos: sumas.anticipo,
    gastos: sumas.gasto,
    saldo: sumas.anticipo - sumas.gasto,
  };
}

/* ==========================================================================
   La llave del comprobante. La fabrica el sistema, nunca quien sube.
   ========================================================================== */

/**
 * Dónde vive el comprobante de un movimiento, dentro del almacén de objetos.
 *
 * **Quien sube no elige la llave.** Una llave que viene del cliente es una
 * llave que puede pisar la de otro movimiento —y tapar un comprobante sin que
 * nadie se entere— o salirse de su bufete, que en un almacén sin columna
 * `tenant_id` es la única frontera que hay. Las tres partes salen de columnas
 * que el cliente no controla: el tenant lo fija la puerta de Access, el
 * proceso lo fija la dirección, y el identificador lo fabrica el servidor.
 *
 * **Es determinística, y de ahí salen tres cosas que no hacen falta:**
 *
 *  1. Reemplazar un comprobante escribe sobre el mismo objeto, así que una
 *     corrección **no puede dejar un huérfano**: no hay un segundo objeto que
 *     olvidar.
 *  2. No hace falta guardar un contador ni un sufijo de versión.
 *  3. Un barrido que algún día busque objetos huérfanos en el almacén se
 *     puede escribir, porque la dirección de cada comprobante es deducible de
 *     su fila.
 *
 * **Es una de dos mitades acopladas** con el
 * `CHECK la_llave_del_comprobante_la_fabrica_el_sistema` de la migración, que
 * dice la misma forma en SQL. Las dos existen por lo de siempre: el `CHECK`
 * sobrevive a un script de importación, y esta función es la única que
 * fabrica. `test/gastos-api.spec.ts` las compara.
 */
export function llaveDeComprobante(
  tenantId: string,
  procesoId: string,
  movimientoId: string,
): string {
  return `comprobantes/${tenantId}/${procesoId}/${movimientoId}`;
}

/**
 * Qué se admite como comprobante.
 *
 * Lo que el bufete tiene es un PDF de la factura o una foto del recibo, y no
 * hay un tercer caso. La lista es cerrada y no una comprobación de que «parece
 * un archivo» por un motivo concreto: lo que se sube se vuelve a servir desde
 * el mismo dominio, y un `text/html` servido desde ahí corre con los permisos
 * de la aplicación.
 */
export const TIPOS_DE_COMPROBANTE = [
  "application/pdf",
  "image/jpeg",
  "image/png",
] as const;

/**
 * Lo más que pesa un comprobante: diez megabytes.
 *
 * Una factura escaneada pesa cientos de kilobytes y la foto de un recibo
 * sacada con un teléfono moderno llega a unos pocos megabytes. Diez deja pasar
 * las dos con holgura y corta el caso que importa, que no es el papel grande
 * sino el archivo que no es un comprobante.
 */
export const TOPE_DEL_COMPROBANTE = 10 * 1024 * 1024;

/** Si ese `content-type` es uno de los tres que se admiten. */
export function esTipoDeComprobante(valor: string | null): boolean {
  if (valor === null) return false;
  // El encabezado puede traer parámetros —`image/jpeg; charset=binary`— y lo
  // que decide es el tipo, no lo que venga detrás del punto y coma.
  const tipo = valor.split(";")[0].trim().toLowerCase();
  return (TIPOS_DE_COMPROBANTE as readonly string[]).includes(tipo);
}

/* ==========================================================================
   La forma de lo que llega por el cable
   ========================================================================== */

export type NormalizacionDeMovimiento =
  | { ok: true; datos: DatosDeMovimiento }
  | { ok: false; fallas: FallaDeValidacion[] };

/** Lo que el dominio necesita saber del mundo para decidir. */
export interface ContextoDelMovimiento {
  /** El día de hoy **en Panamá**, `AAAA-MM-DD`. */
  readonly hoy: string;
}

function falla(campo: string, motivo: MotivoDeFalla): FallaDeValidacion {
  return { campo, motivo };
}

function esObjeto(cuerpo: unknown): cuerpo is Record<string, unknown> {
  return typeof cuerpo === "object" && cuerpo !== null && !Array.isArray(cuerpo);
}

/**
 * Si eso es un día del calendario.
 *
 * Es la misma comprobación que `esDiaValido` en
 * `worker/cotizaciones/dominio.ts` y en `worker/pendientes/dominio.ts`:
 * `2026-02-31` pasa cualquier expresión regular y no es ningún día, y `Date`
 * lo normalizaría a marzo sin decir nada, así que la comprobación es el viaje
 * de ida y vuelta.
 *
 * **Es la tercera copia, y la que paga la mudanza del día que venga la
 * cuarta.** `worker/cotizaciones/dominio.ts` dejó escrito el criterio: «el día
 * que aparezca un tercer vencimiento, la que se mueve a un módulo común es
 * ésta, con los tres llamadores a la vista». Acá no es un vencimiento sino la
 * fecha de un movimiento, y mover las tres pide tocar dos módulos que están
 * fuera de la superficie de esta unidad. Queda dicho para que la próxima tarea
 * que roce cualquiera de los tres las junte: el sitio natural es
 * `worker/db/momentos.ts`, que es el módulo sin dependencias que los tres
 * pueden importar.
 */
export function esDiaValido(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;

  const momento = new Date(`${valor}T00:00:00.000Z`);
  if (Number.isNaN(momento.getTime())) return false;

  return momento.toISOString().slice(0, 10) === valor;
}

/**
 * De un cuerpo JSON cualquiera a los datos de un movimiento, o a la lista de
 * por qué no.
 *
 * Devuelve **todas** las fallas y no la primera, igual que el alta de una
 * línea: un formulario que corrige de a un error por envío es el formulario
 * que nadie usa.
 *
 * `comprobante` **no viaja en este cuerpo** y no se ignora en silencio porque
 * no existe: el papel se sube por su propia dirección, con su propio verbo, y
 * la llave no la elige quien sube. Ver `llaveDeComprobante`.
 */
export function normalizarMovimiento(
  cuerpo: unknown,
  contexto: ContextoDelMovimiento,
): NormalizacionDeMovimiento {
  if (!esObjeto(cuerpo)) {
    return { ok: false, fallas: [falla("tipo", "tipo_de_movimiento_desconocido")] };
  }

  const fallas: FallaDeValidacion[] = [];

  // Ausente, en blanco e inventado caen en el mismo motivo, por el argumento
  // que `tipo_de_modulo_desconocido` escribe entero: el tipo sale de un
  // control que la pantalla dibuja del mismo registro contra el que el
  // servidor valida, así que «no mandaste ninguno» y «mandaste uno inventado»
  // son el mismo defecto y se arreglan igual.
  const tipo = cuerpo.tipo;
  if (!esTipoDeMovimiento(tipo)) {
    fallas.push(falla("tipo", "tipo_de_movimiento_desconocido"));
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

  // **El monto tiene que llegar como número de JSON y ya entero**, por lo
  // mismo que en una línea de cotización: una cadena que el servidor parsea es
  // un camino por el que mañana entra `"2.000,50"` y sale cualquier cosa, y la
  // conversión de lo que la persona teclea a centavos es de la pantalla, que
  // es la que sabe en qué unidad lo escribió.
  //
  // `Number.isSafeInteger` y no `Number.isInteger`: por encima de 2^53 los
  // enteros dejan de ser distinguibles entre sí. También descarta `NaN` e
  // `Infinity`.
  //
  // El signo lo lleva `tipo` y nunca el monto: ver la migración.
  const monto = cuerpo.monto;
  if (typeof monto !== "number" || !Number.isSafeInteger(monto) || monto < 0) {
    fallas.push(falla("monto", "monto_invalido"));
  }

  // La fecha es **el día en que la plata se movió**, y es opcional: el caso
  // corriente es cargar hoy lo que pasó hoy. Lo que no es opcional es que, si
  // viene, sea un día que exista y que no esté en el futuro — un gasto que
  // todavía no ocurrió no es un gasto, es un presupuesto, y para eso está la
  // línea de clase `gasto_estimado` de la cotización.
  //
  // Son **dos motivos y no uno**, al revés que `monto_invalido`, por el mismo
  // criterio que separa `vencimiento_invalido` de `vencimiento_pasado`: la
  // corrección es distinta. Una pide escribir un día del calendario; la otra
  // pide decir cuándo pasó de verdad.
  const cuando = cuerpo.fecha;
  let fecha = contexto.hoy;
  if (cuando !== undefined && cuando !== null) {
    if (typeof cuando !== "string") {
      fallas.push(falla("fecha", "tipo_invalido"));
    } else {
      const limpio = cuando.trim();
      if (limpio === "") {
        // Un campo de fecha que la persona dejó en blanco después de haber
        // escrito algo. Se lee como «hoy», igual que si no hubiera venido.
        fecha = contexto.hoy;
      } else if (!esDiaValido(limpio)) {
        fallas.push(falla("fecha", "fecha_invalida"));
        // La comparación es de texto y eso es correcto **por construcción, no
        // por casualidad**: `esDiaValido` ya corrió, así que las dos cadenas
        // están en `AAAA-MM-DD`, que es de ancho fijo y donde el orden
        // lexicográfico y el cronológico son el mismo. Es el mismo argumento
        // con el que `0004` compara `vence_en` contra `fecha`. Si la guarda
        // de arriba se aflojara, ésta dejaría de valer en silencio.
      } else if (limpio > contexto.hoy) {
        fallas.push(falla("fecha", "fecha_futura"));
      } else {
        fecha = limpio;
      }
    }
  }

  if (fallas.length > 0) return { ok: false, fallas };

  return {
    ok: true,
    datos: {
      tipo: tipo as (typeof TIPOS_DE_MOVIMIENTO)[number],
      concepto,
      monto: monto as number,
      fecha,
    },
  };
}
