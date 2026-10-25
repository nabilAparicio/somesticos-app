/**
 * El vocabulario del plan de pagos, **la aritmética de los importes** y las
 * reglas de qué es una cuota aceptable. Puras: ni D1, ni HTTP.
 *
 * ## Un cronograma, nunca un enum de modalidades
 *
 * > Un pago es una cuota, 50/50 son dos, mensual son N.
 * > `docs/diseno.md` §6, «Plan de pagos».
 *
 * **En este archivo no hay ningún tipo que nombre una forma de cobro**, y esa
 * ausencia es la decisión. Con un enum `modalidad`, cada forma nueva —«30 %
 * ahora, 30 % contra demanda, 40 % contra sentencia»— cuesta un valor nuevo,
 * o sea una migración, y el sistema pasa a tener **dos fuentes de verdad
 * sobre la misma cosa**: el enum dice qué forma es y las filas dicen qué se
 * cobra. El día que se contradigan, nadie sabe cuál manda. Es exactamente el
 * defecto del saldo almacenado de T-10, con otra piel.
 *
 * Un cronograma de filas expresa las tres formas de hoy y las que inventen
 * después sin agregar un valor a ninguna parte. La forma de cobro no es un
 * dato: es qué filas existen.
 *
 * ## I-7, tercera piel: el total del plan no se guarda
 *
 * `0004` se negó a guardar el total de una cotización, `0009` el saldo de un
 * proceso, y `migrations/0010_plan_de_pagos.sql` se niega a guardar el total
 * del plan. El argumento es el mismo las tres veces y la implementación
 * también: **no se declara la columna**. La suma vive en una sola función,
 * `planDe`, y **sólo el servidor la llama**.
 *
 * Que la pantalla no la importe es deliberado y es el precedente de T-3 con
 * `totalesDe` y de T-10 con `saldoDe`: si pudiera llamarla, la prueba que de
 * verdad importa —que la pantalla **muestra** los importes y no los
 * recalcula— sería imposible de escribir, porque las dos implementaciones
 * darían el mismo número. Y T-10 B midió lo caro que sale confiarse: la
 * mutación que hacía que la pantalla derivara el saldo sobrevivió a
 * veinticuatro pruebas de punta a punta, porque el banco de pruebas era
 * coherente consigo mismo. **Un doble de servidor coherente consigo mismo no
 * distingue una pantalla que muestra de una que calcula.**
 *
 * ## El ITBMS no está acá
 *
 * Es T-12 y sigue bloqueado por su propia verificación. No hay una sola línea
 * de aritmética de impuestos en este archivo.
 */

import type {
  Cuota,
  DatosDeCuota,
  FallaDeValidacion,
  MotivoDeFalla,
  PlanDePagos,
} from "../contract";

/* ==========================================================================
   La unidad del porcentaje. Acá, y en ningún otro lado.
   ========================================================================== */

/**
 * Cuántos puntos básicos son el 100 %.
 *
 * **La unidad del porcentaje son puntos básicos**: enteros, donde 1 bp es
 * 0,01 %. Un `50` y un `0,5` que conviven para decir lo mismo son el mismo
 * defecto que un total guardado —dos representaciones de un número y ningún
 * lugar donde diga cuál manda—, así que la unidad se fija una sola vez.
 *
 * Son puntos básicos y no puntos porcentuales enteros por un caso que el
 * bufete tiene hoy: partir unos honorarios en tres da 33,33 / 33,33 / 33,34,
 * que con porcentajes enteros no se puede escribir y acá es 3333 / 3333 /
 * 3334.
 *
 * Es la misma elección que los centavos, por la misma razón: la centésima
 * parte de la unidad que la persona escribe, guardada como entero. Y la
 * conversión de lo que se teclea a esta unidad es de la pantalla, que es la
 * que sabe en qué unidad se tecleó — igual que con los centavos.
 *
 * **Es una de dos mitades acopladas** con el
 * `CHECK el_porcentaje_de_la_cuota_es_puntos_basicos_de_uno_a_diez_mil` de la
 * migración. El `CHECK` es el que sobrevive al primer script de importación
 * (`docs/diseno.md` §5); esta constante es la que cierra lo que la API
 * acepta. `test/cuotas-api.spec.ts` las compara.
 */
export const PUNTOS_BASICOS_DEL_CIEN_POR_CIENTO = 10_000;

/* ==========================================================================
   La aritmética. Acá, y en ningún otro lado.
   ========================================================================== */

/**
 * Lo mínimo que hace falta para sacar el importe de una cuota.
 *
 * Es estructural y no `Cuota` entera para que una prueba pueda construir el
 * caso con dos campos en vez de con ocho, que es lo que hace que la prueba se
 * lea. Es el mismo criterio que `MovimientoSumable` y `LineaSumable`.
 */
export interface CuotaAplicable {
  /** Centavos enteros, o nulo si la cuota es porcentual. */
  readonly monto: number | null;
  /** Puntos básicos, o nulo si la cuota lleva monto. */
  readonly porcentaje: number | null;
}

/**
 * Qué cobra una cuota, en centavos enteros.
 *
 * Con `monto`, es el monto: no hay nada que aplicar. Con `porcentaje`, es ese
 * porcentaje de `base`, que es el total de la cotización de la que cuelga.
 *
 * ## Enteros de principio a fin, y por qué la división está escrita así
 *
 * `base * porcentaje / 10000` con una división de JavaScript produce un
 * flotante, y redondearlo con `Math.round` metería una coma flotante en el
 * medio de una cuenta de dinero — exactamente lo que la restricción 5 de la
 * tajada prohíbe y lo que T-10 midió que cambia el resultado.
 *
 * La forma de abajo es **exacta por construcción**: `producto` es entero y
 * está acotado muy por debajo de 2^53 —un total de diez millones de dólares
 * son 10^9 centavos, y por 10^4 da 10^13—, el resto de la división entera se
 * calcula con `%`, que sobre enteros exactos es exacto, y la resta deja un
 * múltiplo exacto de 10000 cuya división sí es representable sin pérdida. No
 * hay `Math.round`, no hay `toFixed` y no hay conversión a dólares en el
 * camino.
 *
 * ## Se trunca hacia abajo, y el residuo es visible a propósito
 *
 * Tres cuotas de 3333 bp sobre un total de 100 000 centavos dan 33 330 cada
 * una, y suman 99 990: faltan diez centavos. **Ese residuo no se reparte y no
 * se esconde**, y es exactamente por lo que el total del plan se deriva en
 * vez de guardarse: con `PlanDePagos.total` al lado de `PlanDePagos.base`, un
 * plan que no cierra se ve. Un total almacenado habría dicho 100 000 y nadie
 * se habría enterado hasta que las cifras no cerraran delante del cliente.
 *
 * Repartir el residuo —darle el centavo sobrante a la última cuota— sería una
 * regla de negocio que nadie pidió, y además dependería del orden de las
 * filas: la misma plata repartida distinto según quién se cargó primero.
 *
 * ## `base` nula no es la segunda mitad de una guarda que ya existe
 *
 * Una cuota porcentual sólo puede colgar de una cotización, y eso lo impide
 * la base con
 * `un_porcentaje_sin_cotizacion_no_tiene_de_que_ser_porcentaje`. Esto de acá
 * **no es esa misma guarda escrita otra vez**, y la diferencia se nota en lo
 * que produce cada una: aquélla decide **qué filas pueden existir** y rechaza
 * la escritura; ésta decide **qué se lee de una fila que entró igual** —por
 * un script de importación, que es la razón entera por la que los invariantes
 * viven en la base (§5)— y devuelve `null`, que la pantalla muestra como «no
 * se puede saber». Quitar cualquiera de las dos cambia algo observable y
 * distinto, así que no se anulan como garantía.
 */
export function importeDe(
  cuota: CuotaAplicable,
  base: number | null,
): number | null {
  if (cuota.monto !== null) return cuota.monto;
  if (cuota.porcentaje === null || base === null) return null;

  const producto = base * cuota.porcentaje;
  return (
    (producto - (producto % PUNTOS_BASICOS_DEL_CIEN_POR_CIENTO)) /
    PUNTOS_BASICOS_DEL_CIEN_POR_CIENTO
  );
}

/**
 * El plan entero: sus cuotas con el importe aplicado, y lo que suman.
 *
 * **El total se calcula acá, sobre las cuotas que se acaban de leer, y no se
 * guarda en ningún lado** (I-7). No hay columna que actualizar, no hay caché
 * que invalidar y no hay nada que reconciliar: la familia entera de esos
 * errores no existe porque no hay un segundo número.
 *
 * ## Por qué `total` se deriva de los importes y no se acumula aparte
 *
 * Es la misma distinción que T-10 escribió para `saldoDe` frente a
 * `totalesDe`, y acá cae del mismo lado que el saldo: el total del plan
 * **está definido** como la suma de los importes de sus cuotas. Calcularlo
 * por un segundo camino —acumulando montos y porcentajes aplicados por
 * separado— sería tener dos definiciones del mismo número en el mismo
 * archivo, que es la misma falla que guardarlo en una columna, una capa más
 * arriba. Dos cuentas que dan el mismo número se contradicen el día que una
 * cambie.
 *
 * Una cuota cuyo importe no se puede saber no suma, y no hay rama para eso:
 * sumar `null` como cero diría que esa cuota no cobra nada, que es distinto
 * de no saber cuánto cobra. La distinción viaja en `Cuota.importe`, que es
 * donde la pantalla la puede leer.
 *
 * Un plan vacío da cero, y tampoco es un caso especial: una cotización sin
 * plan de pagos todavía no cobra nada en cuotas.
 */
export function planDe(
  cuotas: readonly Cuota[],
  base: number | null,
): PlanDePagos {
  let total = 0;
  const conImporte: Cuota[] = [];

  for (const cuota of cuotas) {
    const importe = importeDe(cuota, base);
    if (importe !== null) total += importe;
    conImporte.push({ ...cuota, importe });
  }

  return { cuotas: conImporte, total, base };
}

/* ==========================================================================
   La forma de lo que llega por el cable
   ========================================================================== */

export type NormalizacionDeCuota =
  | { ok: true; datos: DatosDeCuota }
  | { ok: false; fallas: FallaDeValidacion[] };

/** Lo que el dominio necesita saber del mundo para decidir. */
export interface ContextoDeLaCuota {
  /**
   * Si esta cuota va a colgar de una cotización.
   *
   * Lo sabe la dirección —`/api/cotizaciones/{id}/cuotas` o
   * `/api/procesos/{id}/cuotas`— y nunca el cuerpo, que es lo que vuelve
   * imposible que el cliente viole la exclusividad de la decisión (c). Entra
   * acá porque decide si un porcentaje tiene de qué ser porcentaje.
   */
  readonly cuelgaDeCotizacion: boolean;
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
 * **Es la cuarta copia de esta comprobación**, y las otras tres están en
 * `worker/cotizaciones/dominio.ts`, `worker/pendientes/dominio.ts` y
 * `worker/gastos/dominio.ts`. T-10 dejó escrito el criterio: «la que paga la
 * mudanza es la cuarta», y el sitio natural es `worker/db/momentos.ts`, que
 * es el módulo sin dependencias que los cuatro pueden importar.
 *
 * **No se mudó acá**, y el motivo es de alcance y no de criterio: juntarlas
 * pide tocar cuatro archivos que no están en la superficie autorizada de esta
 * unidad. Queda anotado otra vez, ahora con los cuatro llamadores a la vista
 * y sin la excusa de que son pocos.
 *
 * La comprobación es el viaje de ida y vuelta y no una expresión regular:
 * `2026-02-31` pasa cualquier patrón y no es ningún día, y `Date` lo
 * normalizaría a marzo sin decir nada.
 */
export function esDiaValido(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;

  const momento = new Date(`${valor}T00:00:00.000Z`);
  if (Number.isNaN(momento.getTime())) return false;

  return momento.toISOString().slice(0, 10) === valor;
}

/**
 * Lee un campo opcional que puede venir ausente, nulo, en blanco o con texto.
 *
 * Los cuatro se reducen a dos: hay texto, o no hay. Un campo que la persona
 * llenó y después borró llega como cadena vacía y significa lo mismo que si
 * nunca hubiera venido, que es exactamente lo que `normalizarMovimiento` hace
 * con su fecha.
 *
 * Devuelve `undefined` cuando lo que vino no es ni texto ni nulo, para que
 * quien llama pueda distinguir «no hay» de «eso no es un texto» y emitir
 * `tipo_invalido`.
 */
function textoOpcional(valor: unknown): string | null | undefined {
  if (valor === undefined || valor === null) return null;
  if (typeof valor !== "string") return undefined;

  const limpio = valor.trim();
  return limpio === "" ? null : limpio;
}

/**
 * De un cuerpo JSON cualquiera a los datos de una cuota, o a la lista de por
 * qué no.
 *
 * Devuelve **todas** las fallas y no la primera, igual que el alta de una
 * línea y la de un movimiento: un formulario que corrige de a un error por
 * envío es el formulario que nadie usa.
 *
 * ## Las tres exclusividades, y cuál de ellas no se valida acá
 *
 * Dos se validan acá —monto/porcentaje y vencimiento/hito— porque las dos
 * salen del cuerpo y la persona las puede equivocar. La tercera
 * —proceso/cotización— **no se puede equivocar desde el cliente**: de qué
 * cuelga la cuota lo dice la dirección, no el cuerpo, así que no hay un campo
 * que validar. Las tres están igual en la base, que es donde el invariante
 * vive; lo de acá es la mitad amable.
 *
 * ## Y la cuarta, que sí sale de la combinación de los dos lados
 *
 * Un porcentaje colgado de un proceso se rechaza con
 * `porcentaje_sin_cotizacion`, y la condición la trae el contexto. Es la
 * única regla de este archivo que mira a la vez el cuerpo y la dirección, y
 * por eso es la única que necesita contexto.
 */
export function normalizarCuota(
  cuerpo: unknown,
  contexto: ContextoDeLaCuota,
): NormalizacionDeCuota {
  if (!esObjeto(cuerpo)) {
    return { ok: false, fallas: [falla("concepto", "concepto_requerido")] };
  }

  const fallas: FallaDeValidacion[] = [];

  // Se recorta al guardar, y por eso la comprobación es sobre el recorte: un
  // concepto de tres espacios es una cuota sin explicación, y en un plan de
  // cuatro renglones el concepto es lo único que los distingue.
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

  /* --- Monto o porcentaje, exactamente uno --- */

  // **El monto tiene que llegar como número de JSON y ya entero**, por lo
  // mismo que en una línea y en un movimiento: una cadena que el servidor
  // parsea es un camino por el que mañana entra `"2.000,50"` y sale cualquier
  // cosa. `Number.isSafeInteger` descarta además `NaN` e `Infinity`.
  //
  // **`> 0` y no `>= 0`**, al revés que `movimiento_gasto.monto`. Un
  // movimiento registra algo que pasó y uno de cero no corrompe nada; una
  // cuota es una obligación que el cliente lee y firma, y un renglón de cero
  // en ese documento promete un cobro que no existe.
  const monto = cuerpo.monto ?? null;
  const hayMonto = monto !== null;
  if (hayMonto && (typeof monto !== "number" || !Number.isSafeInteger(monto) || monto <= 0)) {
    fallas.push(falla("monto", "monto_invalido"));
  }

  // El porcentaje llega **ya en puntos básicos**, por lo mismo que el monto
  // llega en centavos: la conversión de lo que la persona teclea a la unidad
  // que se guarda es de la pantalla, que es la que sabe en qué unidad lo
  // escribió. Un `33.33` acá sería un porcentaje a medio convertir.
  const porcentaje = cuerpo.porcentaje ?? null;
  const hayPorcentaje = porcentaje !== null;
  if (
    hayPorcentaje &&
    (typeof porcentaje !== "number" ||
      !Number.isSafeInteger(porcentaje) ||
      porcentaje <= 0 ||
      porcentaje > PUNTOS_BASICOS_DEL_CIEN_POR_CIENTO)
  ) {
    fallas.push(falla("porcentaje", "porcentaje_invalido"));
  }

  // Los dos, o ninguno. Un solo motivo para las dos situaciones porque la
  // corrección es la misma: elegir uno.
  //
  // Se emite **además** de las fallas de forma de arriba y no en su lugar: un
  // cuerpo con un monto inválido y también un porcentaje tiene dos problemas
  // distintos, y callar el segundo mandaría a corregir el monto para después
  // descubrir que sobraba.
  if (hayMonto === hayPorcentaje) {
    fallas.push(falla("monto", "monto_o_porcentaje"));
  }

  // La cuarta restricción: un porcentaje necesita una base, y un proceso no
  // tiene ninguna. Se mira sólo si vino un porcentaje; sin él, de qué cuelga
  // la cuota no cambia nada.
  if (hayPorcentaje && !contexto.cuelgaDeCotizacion) {
    fallas.push(falla("porcentaje", "porcentaje_sin_cotizacion"));
  }

  /* --- Vencimiento o hito, exactamente uno --- */

  const venceEnCrudo = textoOpcional(cuerpo.venceEn);
  // **Presencia y no validez**, igual que `hayMonto`: una fecha que vino mal
  // escrita sigue siendo una fecha que alguien quiso poner, y contarla como
  // ausente haría que el mismo tecleo produjera dos fallas —«ese día no
  // existe» y «falta decir cuándo»— que mandan a hacer cosas distintas sobre
  // el mismo campo.
  const hayVencimiento = venceEnCrudo !== null;
  let venceEn: string | null = null;
  if (venceEnCrudo === undefined) {
    fallas.push(falla("venceEn", "tipo_invalido"));
  } else if (venceEnCrudo !== null) {
    if (!esDiaValido(venceEnCrudo)) {
      // `vencimiento_invalido` y no `fecha_invalida`: el motivo de los gastos
      // habla del día en que la plata **se movió**, y acá se habla de cuándo
      // una cuota **se cobra**. La frase de uno debajo del campo del otro
      // manda a corregir algo que nadie tocó.
      fallas.push(falla("venceEn", "vencimiento_invalido"));
    } else {
      venceEn = venceEnCrudo;
    }
  }

  // **Un vencimiento en el pasado se acepta**, al revés que en una
  // cotización. Cargar hoy el plan de un encargo que empezó el mes pasado es
  // el caso corriente, y la primera cuota de ese plan venció antes de que
  // nadie la escribiera. Rechazarla obligaría a mentir con la fecha para
  // poder registrar lo que de verdad pasó.

  const hitoCrudo = textoOpcional(cuerpo.hito);
  const hayHito = hitoCrudo !== null;
  let hito: string | null = null;
  if (hitoCrudo === undefined) {
    fallas.push(falla("hito", "tipo_invalido"));
  } else {
    hito = hitoCrudo;
  }

  // El blanco ya se redujo a nulo arriba, así que un hito de tres espacios
  // cuenta como ausente acá y nunca llega a la fila que la base rechazaría
  // por `el_hito_de_la_cuota_no_esta_en_blanco`. Las dos guardas existen y
  // **no se anulan**: ésta contesta 422 con una frase que dice qué falta,
  // aquélla es la que sobrevive a un script de importación. Quitar cualquiera
  // cambia algo observable y distinto.
  if (hayVencimiento === hayHito) {
    fallas.push(falla("venceEn", "vencimiento_o_hito"));
  }

  if (fallas.length > 0) return { ok: false, fallas };

  return {
    ok: true,
    datos: {
      concepto,
      monto: hayMonto ? (monto as number) : null,
      porcentaje: hayPorcentaje ? (porcentaje as number) : null,
      venceEn,
      hito,
    },
  };
}
