/**
 * El plan de pagos en pantalla, sin React y sin DOM (T-11, unidad B).
 *
 * Es el tercer módulo de dinero de `src/`, después de `./lineas.ts` —los
 * importes de la cotización— y `../procesos/gastos.ts` —lo que ya se movió—.
 * Los tres tienen todas sus decisiones en un `.ts` que se prueba en el
 * corredor del Worker, para que el `.tsx` no decida nada.
 *
 * ## 1. La pantalla no suma, no divide y no aplica porcentajes
 *
 * Es la barandilla de la tajada, y acá tiene una forma propia: **el importe
 * de una cuota porcentual lo resuelve el servidor**. `importeDe` y `planDe`
 * viven en `worker/cuotas/dominio.ts` y corren allá, sobre la base que esa
 * capa leyó de las líneas de la cotización. La respuesta trae cada
 * `Cuota.importe` ya aplicado y el `PlanDePagos.total` al lado de su `base`,
 * y lo que este módulo hace con los tres es **escribirlos**.
 *
 * **No hay un solo `+`, `−`, `*` ni `/` sobre dinero en este archivo.** La
 * tentación acá tiene dos nombres y conviene dejarlos escritos:
 *
 *  - aplicar el porcentaje mientras se teclea, para que la cuota muestre su
 *    importe antes de guardarla;
 *  - restar `total − base` para decir «faltan diez centavos» con una cifra.
 *
 * Las dos costarían una segunda aritmética de dinero en un segundo lenguaje.
 * La primera es exactamente la mutación que T-10 B midió sobreviviendo a
 * veinticuatro pruebas de punta a punta. La segunda es más sutil y por eso
 * se decide abajo, en `cotejoDelPlan`.
 *
 * ## 2. Lo que este módulo NO importa, aunque podría
 *
 * `importeDe` y `planDe` están en `worker/cuotas/dominio.ts`, que es el
 * módulo del que sí se importa `PUNTOS_BASICOS_DEL_CIEN_POR_CIENTO`, así que
 * traerlas costaría dos palabras más en el `import`. **No se importan a
 * propósito**, y es la misma decisión que `./lineas.ts` tomó con `totalesDe`
 * y `../procesos/gastos.ts` con `saldoDe`: tenerlas a mano es la forma más
 * fácil de que mañana alguien aplique un porcentaje en la pantalla sin darse
 * cuenta de que estaba prohibido, y de que la prueba que afirma que la
 * pantalla **muestra** pase a ser imposible de escribir porque las dos
 * implementaciones darían el mismo número.
 *
 * ## 3. El residuo se muestra, y nunca se redondea
 *
 * Tres cuotas del 33,33 % de mil dólares suman 999,90. **Eso no es un
 * defecto que haya que esconder: es información**, y quien arma el plan
 * tiene que verla antes de mandárselo al cliente. Cómo se muestra está en
 * `cotejoDelPlan`, con el argumento entero.
 *
 * ## 4. Las dos clases de cuota, y la que no siempre existe
 *
 * Monto fijo y porcentaje se leen distinto y se cargan distinto. Y **el
 * porcentaje sólo existe cuando la cuota cuelga de una cotización**: un
 * proceso no tiene total del que ser porcentaje, y la base lo rechaza con
 * `un_porcentaje_sin_cotizacion_no_tiene_de_que_ser_porcentaje`. Por eso
 * `clasesDeCuotaDisponibles` recibe la base y devuelve una clase o dos: la
 * pantalla no puede ofrecer lo que el servidor va a rechazar, que es la
 * lección de la unidad B de T-2 —un control que existe es una promesa—.
 *
 * ## 5. La conversión de puntos básicos, y por qué es la hermana y no la
 * ## misma
 *
 * Ver `puntosBasicosDesdeTexto`. En una frase: **el parseo es el mismo y se
 * reusa; el rango y la escritura son propios y se escriben acá.**
 *
 * ## 6. Esta validación no autoriza nada
 *
 * `normalizarBorradorDeCuota` es **la segunda copia** de las reglas de
 * `normalizarCuota` del Worker. La que manda es la del servidor; ésta existe
 * para avisar antes de mandar. Son dos copias a propósito, con pruebas
 * propias cada una: aflojar una tiene que matar sus pruebas y no las de la
 * otra.
 *
 * Lo que esta función **no** vuelve a comprobar es que un porcentaje tenga
 * una cotización detrás, y no es un olvido: eso ya lo decide
 * `clasesDeCuotaDisponibles`, que es lo que hace que la clase no se pueda
 * elegir. Escribirlo también acá serían dos guardas de pantalla para lo
 * mismo, y ninguna de las dos sería verificable —quitar cualquiera no
 * mataría una prueba—. La guarda que de verdad manda sigue siendo el `CHECK`
 * de la migración, y su 422 trae la frase que dice qué hacer.
 *
 * ## 7. Lo que no vive acá
 *
 * El ITBMS. Es T-12 y no hay una sola línea de aritmética de impuestos en
 * este archivo ni en el que lo dibuja.
 */

import type {
  Cuota,
  DatosDeCuota,
  FallaDeValidacion,
  MotivoDeFalla,
} from "../../../worker/contract";
import { PUNTOS_BASICOS_DEL_CIEN_POR_CIENTO } from "../../../worker/cuotas/dominio";
import { esDiaValido } from "../../../worker/gastos/dominio";
import { VACIO, diaLegible } from "../../formatos";
import { centavosDesdeTexto, montoLegible } from "./lineas";

export { PUNTOS_BASICOS_DEL_CIEN_POR_CIENTO };
export { montoLegible };
export { mensajeDeFalla } from "../../mensajes";

/* ==========================================================================
   La conversión puntos básicos ↔ pantalla

   El fondo trabaja en **puntos básicos enteros**, 1 bp = 0,01 %, y la
   persona escribe «33,33» con un punto: «33.33». Ésta es la única frontera
   entre las dos unidades, igual que `centavosDesdeTexto` lo es entre
   centavos y dólares.
   ========================================================================== */

/**
 * De lo que una persona escribió a puntos básicos enteros, o a que no se
 * pudo.
 *
 * ## Por qué reusa `centavosDesdeTexto` y no escribe otro parseo
 *
 * Porque **es exactamente la misma conversión**: de una cifra con hasta dos
 * decimales a su centésima parte en enteros. `"33.33"` → `3333` es el mismo
 * recorrido que `"33.33"` → `3333` centavos, con los mismos bordes —el
 * decimal faltante que se completa a la derecha, el tercer decimal que no
 * existe, el entero que se sale de `Number.isSafeInteger`— y los mismos
 * argumentos para cada uno. Un segundo parseo acá sería la segunda forma de
 * leer «una cifra con centésimas», y la que se desincronice primero lo haría
 * sin que nadie lo note. Es la misma razón por la que `../procesos/gastos.ts`
 * importa la conversión de centavos en vez de reescribirla.
 *
 * ## Qué sí es propio de acá, y por eso esta función existe
 *
 * **El rango.** Un importe va de cero para arriba y hasta donde dé un entero
 * seguro; un porcentaje va de `1` a `10000` puntos básicos, los dos extremos
 * incluidos. Cero fuera porque una cuota de 0 % promete un cobro que no
 * existe, y más de 10000 fuera porque una sola cuota de más del 100 % es un
 * error de tecleo. Son los mismos dos bordes que el
 * `CHECK el_porcentaje_de_la_cuota_es_puntos_basicos_de_uno_a_diez_mil`
 * impone del lado de la base, y por eso el tope se escribe con la constante
 * importada y no con un `10000` suelto.
 *
 * **Y los separadores de miles quedan fuera gratis**: `"1,000"` parsea como
 * 100000 puntos básicos, que el rango rechaza. No hace falta una guarda
 * propia, y poner una sería la segunda que resuelve lo mismo.
 *
 * No dice **por qué** no se pudo, por lo mismo que `centavosDesdeTexto`: las
 * formas de fallar se arreglan todas igual desde donde está la persona, y el
 * vocabulario tiene un solo motivo para todas (`porcentaje_invalido`).
 */
export function puntosBasicosDesdeTexto(
  texto: string,
): { ok: true; puntosBasicos: number } | { ok: false } {
  const leido = centavosDesdeTexto(texto);
  if (!leido.ok) return { ok: false };

  if (
    leido.centavos <= 0 ||
    leido.centavos > PUNTOS_BASICOS_DEL_CIEN_POR_CIENTO
  ) {
    return { ok: false };
  }

  return { ok: true, puntosBasicos: leido.centavos };
}

/**
 * Los puntos básicos guardados, en la unidad que la persona lee: `3333` →
 * `"33.33"`, `5000` → `"50"`.
 *
 * ## Por qué **no** reusa `montoEditable`, que daría casi lo mismo
 *
 * `montoEditable(5000)` devuelve `"50.00"`, y un porcentaje escrito así se
 * lee mal: nadie dice «cincuenta coma cero cero por ciento». Los ceros que
 * no dicen nada se van, y los que sí dicen algo se quedan — `3330` es
 * `"33.3"` y `3333` es `"33.33"`.
 *
 * Es la diferencia honesta entre las dos unidades: un importe de dinero
 * **siempre** lleva sus dos decimales, porque una columna de importes se lee
 * comparando, y «1500» junto a «1500.50» se leen como dos cifras de tamaños
 * distintos. Un porcentaje no vive en una columna de porcentajes: vive
 * pegado a su cuota.
 *
 * La división entera está escrita con `Math.floor` y `%` sobre un entero
 * seguro, igual que `montoEditable` y por el mismo motivo: ningún valor
 * intermedio es una fracción que se pueda perder. **Esto no es aritmética de
 * dinero**, que es lo que la barandilla prohíbe: es partir un entero en sus
 * dígitos para escribirlo, y no produce ningún importe.
 *
 * Un valor que no es un porcentaje devuelve el hueco y no un número
 * inventado, igual que `montoEditable`: no debería llegar nunca —el contrato
 * y el `CHECK` lo impiden— y justamente por eso, si llega, lo correcto es
 * decir que no se sabe.
 */
export function porcentajeEditable(puntosBasicos: number): string {
  if (
    !Number.isSafeInteger(puntosBasicos) ||
    puntosBasicos <= 0 ||
    puntosBasicos > PUNTOS_BASICOS_DEL_CIEN_POR_CIENTO
  ) {
    return VACIO;
  }

  const enteros = Math.floor(puntosBasicos / 100);
  const resto = puntosBasicos % 100;

  if (resto === 0) return String(enteros);
  if (resto % 10 === 0) return `${String(enteros)}.${String(resto / 10)}`;

  return `${String(enteros)}.${String(resto).padStart(2, "0")}`;
}

/**
 * El porcentaje como se muestra: `3333` → `"33.33 %"`.
 *
 * Se apoya en `porcentajeEditable` en vez de volver a partir los puntos
 * básicos: la conversión está escrita una sola vez, y esto le agrega el
 * signo. Sobre un hueco **no** se antepone nada, por lo mismo que
 * `importeLegible`: «— %» promete una cifra que no existe.
 *
 * El espacio antes del `%` es el que pide la ortografía del español, y
 * además es el que impide que «33.33%» se lea como una sola palabra.
 */
export function porcentajeLegible(puntosBasicos: number): string {
  const editable = porcentajeEditable(puntosBasicos);
  return editable === VACIO ? VACIO : `${editable} %`;
}

/* ==========================================================================
   Los textos de la sección

   Viven acá y no dentro del `.tsx` por lo mismo que `AVISO_GASTO_APROXIMADO`
   y `AVISO_SALDO_INFORMATIVO`: así su contenido se puede afirmar en una
   prueba en vez de quedar enterrado en un componente.
   ========================================================================== */

/**
 * Qué es un plan de pagos acá, dicho en términos de filas.
 *
 * Dice lo que la tabla es —un cronograma— porque es lo que hace entender por
 * qué no hay un desplegable de «50/50» ni de «mensual»: las formas de cobro
 * son cuántas cuotas se cargan, no una opción que alguien elige.
 */
export const AYUDA_DEL_PLAN =
  "El plan de pagos es un cronograma: un pago es una cuota, 50/50 son dos," +
  " y mensual son doce. No hay que elegir una modalidad; hay que cargar las" +
  " cuotas que el cliente va a pagar, cada una con su importe y con lo que" +
  " la dispara. Los números se escriben con punto para los decimales.";

/**
 * Lo que el plan **no** dice, dicho antes de que alguien lo suponga.
 *
 * Es el reverso de una decisión de la unidad A: `cuota` no tiene columna
 * `pagada_en`, porque registrar un cobro es un modelo que este sistema
 * todavía no tiene y que `docs/diseno.md` §2 deja fuera de la tajada. Una
 * pantalla que lista cuotas y no dice nada se lee como un estado de cuenta,
 * y alguien va a mirarla para saber qué le falta cobrar.
 *
 * No es letra chica: va dibujado dentro de la sección, arriba del
 * cronograma.
 */
export const AVISO_EL_PLAN_NO_REGISTRA_COBROS =
  "Esto es lo que se va a cobrar, no lo que se cobró: el sistema todavía no" +
  " registra pagos recibidos, así que ninguna cuota de esta lista dice si" +
  " ya entró la plata. Para eso hay que mirar los recibos del bufete.";

/** Lo que se dice antes de sacar una cuota del plan. */
export const AVISO_LA_CUOTA_NO_SE_EDITA =
  "Una cuota cargada no se corrige: se saca del plan y se vuelve a cargar." +
  " El total lo recalcula el servidor con las que queden.";

/** Lo que se dice donde iría el cronograma y todavía no hay ninguna cuota. */
export const PLAN_VACIO =
  "Esta cotización todavía no tiene plan de pagos. Mientras no tenga" +
  " ninguna cuota, no hay nada acordado sobre cuándo cobra el bufete.";

/* ==========================================================================
   El cotejo: el plan contra el total de la cotización
   ========================================================================== */

/** En cuál de los cuatro estados quedó el plan frente a su base. */
export type EstadoDelCotejo =
  | "sin_base"
  | "exacto"
  | "incompleto"
  | "excedido"
  | "ilegible";

export interface CotejoDelPlan {
  readonly estado: EstadoDelCotejo;
  readonly titular: string;
  /** La suma del plan, escrita. Del servidor. */
  readonly sumaLegible: string;
  /** El total de la cotización, escrito. `null` si no hay base. */
  readonly baseLegible: string | null;
  readonly explicacion: string;
}

export const ROTULO_DE_LA_SUMA = "Suma del plan";
export const ROTULO_DE_LA_BASE = "Total de la cotización";

const TITULARES = {
  sin_base: "El plan suma",
  exacto: "El plan cubre el total exacto",
  incompleto: "El plan no llega al total",
  excedido: "El plan se pasa del total",
  ilegible: "No se pudo leer el plan",
} as const;

const EXPLICACIONES = {
  sin_base:
    "Este plan no cuelga de una cotización, así que no hay un total contra" +
    " el que compararlo: lo que suman sus cuotas es todo lo que se sabe.",
  exacto:
    "Las cuotas suman exactamente lo que la cotización cobra. No falta ni" +
    " sobra nada por asignar.",
  /*
   * **El caso de los diez centavos, explicado donde se ve.**
   *
   * No dice sólo «no cierra»: dice por qué puede no cerrar sin que nadie se
   * haya equivocado, porque el truncamiento de los porcentajes es la causa
   * más común y la menos obvia. Quien arma el plan tiene que poder decidir
   * si le agrega el resto a la última cuota o lo deja así, y para eso tiene
   * que entender de dónde salió.
   *
   * Y dice que el sistema **no** lo reparte solo, que es la otra mitad: un
   * sistema que redondea en silencio para que cuadre es un sistema en el que
   * nadie sabe cuánto va a pagar el cliente.
   */
  incompleto:
    "Las dos cifras de arriba no coinciden: comparándolas se ve cuánto" +
    " falta por asignar. Puede ser que falte una cuota, o puede ser el" +
    " resto de los porcentajes: tres cuotas del 33,33 % suman 99,99 % y no" +
    " 100 %, porque el porcentaje se trunca hacia abajo. El sistema no" +
    " reparte ese resto solo, porque repartirlo sería decidir a qué cuota" +
    " le toca el centavo; hay que asignarlo a mano o dejarlo así a" +
    " sabiendas.",
  excedido:
    "Las cuotas suman más de lo que la cotización cobra: comparando las dos" +
    " cifras de arriba se ve cuánto. Hay que sacar o achicar alguna, o el" +
    " cliente va a recibir un plan que le pide más que el encargo.",
  ilegible:
    "Las cifras que llegaron del servidor no son importes en centavos" +
    " enteros, así que no se dibuja un cotejo que podría estar mal. Hay que" +
    " volver a cargar la página; si sigue pasando, es un defecto que hay" +
    " que avisar.",
} as const;

/**
 * El plan frente al total de su cotización, listo para dibujar.
 *
 * ## Esta función **compara**, y deliberadamente no resta
 *
 * Es la decisión más fina de este archivo y conviene escribirla entera.
 *
 * El residuo tiene que verse: tres cuotas del 33,33 % de mil dólares suman
 * 999,90, y quien arma el plan tiene que enterarse **antes** de mandárselo
 * al cliente. La forma obvia de mostrarlo sería `base − total` y una frase
 * que diga «faltan USD 0.10».
 *
 * **No se hace, y el motivo no es purismo.** Esa resta sería la primera
 * operación aritmética sobre dinero en `src/`, y la regla que
 * `../procesos/gastos.ts` sostiene con todas las letras —«no hay un solo
 * `+` sobre dinero en este archivo»— es justamente la que hace que la
 * pregunta «¿este número lo calculó la pantalla o el servidor?» tenga una
 * sola respuesta posible en todo el sistema. Una excepción que empieza
 * siendo una resta de dos enteros es el lugar exacto donde seis meses
 * después alguien agrega un `Math.round` para que cuadre.
 *
 * Lo que se hace en su lugar: **se escriben las dos cifras juntas**
 * —`sumaLegible` y `baseLegible`, una debajo de la otra— y se dice en
 * palabras en cuál de los cuatro estados quedó el plan. La diferencia es
 * visible leyendo dos renglones, y no hay ningún número que la pantalla haya
 * inventado. Una comparación entre dos enteros no puede derivar; una resta
 * sí puede empezar a redondear.
 *
 * **Lo que esto cuesta, dicho y no escondido:** la cifra exacta que falta no
 * aparece escrita. Si el bufete la pide, el lugar donde ponerla es
 * `PlanDePagos`, con el servidor derivándola al lado de `total` y de `base`
 * — que es donde ya viven las otras dos y donde `worker/cuotas/dominio.ts`
 * es el único que hace cuentas.
 *
 * ## La guarda de entero
 *
 * Es la misma que `lecturaDelSaldo` escribió y por el mismo motivo: la
 * comparación `total === base` es exacta **porque los dos son enteros de
 * centavos**. Con un flotante en el medio, dos cifras que valen lo mismo
 * compararían distinto y el cotejo diría que el plan no cierra cuando cierra
 * exacto. Lo que no es un entero seguro no se clasifica.
 */
export function cotejoDelPlan(
  total: number,
  base: number | null,
): CotejoDelPlan {
  const enteros =
    Number.isSafeInteger(total) && (base === null || Number.isSafeInteger(base));

  if (!enteros) {
    return {
      estado: "ilegible",
      titular: TITULARES.ilegible,
      sumaLegible: VACIO,
      baseLegible: VACIO,
      explicacion: EXPLICACIONES.ilegible,
    };
  }

  if (base === null) {
    return {
      estado: "sin_base",
      titular: TITULARES.sin_base,
      sumaLegible: montoLegible(total),
      baseLegible: null,
      explicacion: EXPLICACIONES.sin_base,
    };
  }

  const estado =
    total === base ? "exacto" : total < base ? "incompleto" : "excedido";

  return {
    estado,
    titular: TITULARES[estado],
    sumaLegible: montoLegible(total),
    baseLegible: montoLegible(base),
    explicacion: EXPLICACIONES[estado],
  };
}

/* ==========================================================================
   Las dos clases de cuota
   ========================================================================== */

/** Cómo se cobra una cuota: por una cifra cerrada o por una parte del total. */
export type ClaseDeCuota = "monto_fijo" | "porcentaje";

interface ComoSeCobra {
  readonly rotulo: string;
  readonly ayuda: string;
  /** El rótulo del control donde se escribe la cifra de esta clase. */
  readonly rotuloDelCampo: string;
  readonly ayudaDelCampo: string;
}

/**
 * Las dos clases, **en el orden en que se leen**: primero la cifra cerrada,
 * que es la mayoritaria, y después la parte del total.
 *
 * Es **un solo registro y no varios paralelos**, por el mismo argumento que
 * `COMO_SE_MUESTRA` en los gastos y en las líneas: varias tablas que dicen
 * cosas del mismo valor son varios lugares que mañana dicen cosas distintas.
 *
 * Es exhaustivo sobre `ClaseDeCuota`: el día que aparezca una tercera forma
 * de cobrar, esto deja de compilar hasta que alguien diga cómo se llama y
 * qué se escribe en su campo.
 */
export const COMO_SE_COBRA: Record<ClaseDeCuota, ComoSeCobra> = {
  monto_fijo: {
    rotulo: "Un importe fijo",
    ayuda:
      "Una cifra cerrada en dólares, que no cambia si la cotización cambia.",
    rotuloDelCampo: "Importe",
    ayudaDelCampo:
      "El punto separa los centavos: 1500.00. Siempre mayor que cero: una" +
      " cuota de cero no cobra nada.",
  },
  porcentaje: {
    rotulo: "Un porcentaje del total",
    ayuda:
      "Una parte del total de esta cotización. Si las líneas cambian, el" +
      " importe de la cuota cambia con ellas.",
    rotuloDelCampo: "Porcentaje",
    ayudaDelCampo:
      "El punto separa los decimales: 33.33. De 0.01 a 100, y hasta dos" +
      " decimales.",
  },
};

/**
 * Qué clases se pueden ofrecer, según si hay un total contra el que aplicar
 * un porcentaje.
 *
 * **La pantalla no puede ofrecer lo que el servidor va a rechazar.** Un
 * proceso suelto no tiene total —tiene gastos reales, que son plata de
 * terceros— así que una cuota suya no puede ser porcentual: lo rechaza la
 * base con `un_porcentaje_sin_cotizacion_no_tiene_de_que_ser_porcentaje` y
 * la ruta con un 422. Dibujar la opción y que la respuesta la niegue es la
 * lección de la unidad B de T-2 con el desplegable que mostraba un hueco
 * donde había un cliente: un control que existe es una promesa.
 *
 * Esto es lo que hace que el día que el plan de pagos cuelgue también de la
 * pantalla de un proceso, esa pantalla no ofrezca la mitad que no sirve
 * ahí. Hoy el único llamador es la cotización, donde la base siempre es un
 * número, y por eso el caso de una sola clase **no tiene pantalla pero sí
 * tiene prueba**: es la forma de que la decisión no se pierda hasta
 * entonces.
 */
export function clasesDeCuotaDisponibles(
  base: number | null,
): readonly ClaseDeCuota[] {
  return base === null ? ["monto_fijo"] : ["monto_fijo", "porcentaje"];
}

/* ==========================================================================
   El cronograma, listo para dibujar
   ========================================================================== */

/** Qué dispara el cobro de una cuota. */
export type DisparadorDeCuota = "fecha" | "hito";

export const COMO_SE_DISPARA: Record<
  DisparadorDeCuota,
  { readonly rotulo: string; readonly ayuda: string }
> = {
  fecha: {
    rotulo: "En una fecha",
    ayuda: "Un día del calendario: «el saldo al 30 de junio».",
  },
  hito: {
    rotulo: "Contra un hito",
    ayuda:
      "Algo que pasa en el trámite: «a la firma», «contra presentación de" +
      " la demanda». Va en palabras, no en fecha.",
  },
};

/** Una cuota del cronograma, lista para dibujar. */
export interface RenglonDelPlan {
  readonly id: string;
  readonly concepto: string;
  readonly clase: ClaseDeCuota;
  /** «Importe fijo» o «33.33 % del total». */
  readonly comoSeCobra: string;
  /** **Del servidor.** Nunca aplicado acá. Un hueco si no se pudo saber. */
  readonly importeLegible: string;
  /** «Vence» o «Contra hito». */
  readonly rotuloDelCuando: string;
  /** El día escrito, o el hito tal cual. */
  readonly cuando: string;
}

/**
 * Lo que se dice de una cuota porcentual cuyo importe no llegó.
 *
 * El servidor lo manda `null` en un solo caso —un porcentaje sin base—, que
 * la base hace imposible de escribir por la API pero que un script de
 * importación podría meter. Lo que se dibuja entonces es esto y **no un
 * cero**: «no se puede saber» no es «no cobra nada».
 */
export const IMPORTE_SIN_BASE = VACIO;

/**
 * Las cuotas, listas para dibujar, **en el orden en que llegaron**.
 *
 * Ese orden lo fija el servidor —`creada_en` y después `rowid`, que es el
 * orden en que el abogado dictó el plan— y no esta pantalla. Reordenar acá
 * sería contar el cronograma al revés de como lo cuenta el servidor.
 *
 * **No aplica ningún porcentaje y no suma nada.** `importe` llega resuelto
 * en cada `Cuota`, y esta función sólo elige cómo se escribe. Si alguien
 * cambiara esto por una multiplicación, lo notaría la prueba que le pasa
 * cuotas cuyo `importe` **no** coincide con su porcentaje por la base.
 *
 * La clase sale de cuál de los dos campos vino, que es la exclusividad de la
 * migración leída desde este lado: exactamente uno es nulo. Una cuota que
 * llegara con los dos —imposible por el `CHECK`— se lee como porcentual,
 * porque es la lectura que no inventa un importe fijo que nadie escribió.
 */
export function renglonesDelPlan(
  cuotas: readonly Cuota[],
): RenglonDelPlan[] {
  return cuotas.map((cuota) => {
    const clase: ClaseDeCuota =
      cuota.porcentaje === null ? "monto_fijo" : "porcentaje";

    const disparador: DisparadorDeCuota =
      cuota.venceEn === null ? "hito" : "fecha";

    return {
      id: cuota.id,
      concepto: cuota.concepto,
      clase,
      comoSeCobra:
        clase === "porcentaje"
          ? `${porcentajeLegible(cuota.porcentaje as number)} del total`
          : COMO_SE_COBRA.monto_fijo.rotuloDelCampo,
      importeLegible:
        cuota.importe === null ? IMPORTE_SIN_BASE : montoLegible(cuota.importe),
      rotuloDelCuando: disparador === "fecha" ? "Vence" : "Contra hito",
      cuando:
        disparador === "fecha"
          ? diaLegible(cuota.venceEn as string)
          : (cuota.hito ?? VACIO),
    };
  });
}

/* ==========================================================================
   El borrador de una cuota
   ========================================================================== */

/**
 * Lo que se escribe en los cinco controles.
 *
 * Los cinco son `string` y ninguno está tipado estrecho, por las mismas
 * razones que `BorradorDeMovimiento`:
 *
 *  - `clase` y `disparador` arrancan **vacíos**, así que tiparlos
 *    `ClaseDeCuota` y `DisparadorDeCuota` obligaría a inventar un valor para
 *    «ninguno todavía», que es justo lo que los vocabularios cerrados
 *    existen para impedir;
 *  - `cifra` es texto porque **lo que hay en el campo es texto**, y a veces
 *    texto que todavía no es un número.
 *
 * **`cifra` es una sola y no dos.** El campo que se dibuja es el de la clase
 * elegida, así que un segundo campo escondido guardaría lo que alguien
 * escribió para la otra clase y lo mandaría sin que se vea — que es
 * exactamente la cuota con monto **y** porcentaje que la migración rechaza.
 * Con un solo campo, esa fila no se puede ni intentar.
 */
export interface BorradorDeCuota {
  concepto: string;
  clase: string;
  cifra: string;
  disparador: string;
  venceEn: string;
  hito: string;
}

/**
 * El alta arranca **sin nada elegido**.
 *
 * Ni clase ni disparador vienen preseleccionados, y no es rigor: una clase
 * que arranca en «importe fijo» es la que hace cargar una cifra cerrada
 * donde alguien quería un porcentaje, y las dos cosas se ven igual en el
 * campo —«50» puede ser cincuenta dólares o la mitad del encargo—. Es la
 * misma decisión que el desplegable de tipos de movimiento, y acá el error
 * es más caro: una cuota de «50» mal clasificada en una cotización de diez
 * mil dólares son cuatro mil novecientos cincuenta dólares de diferencia.
 */
export const BORRADOR_DE_CUOTA_VACIO: BorradorDeCuota = {
  concepto: "",
  clase: "",
  cifra: "",
  disparador: "",
  venceEn: "",
  hito: "",
};

export type CuotaNormalizada =
  | { ok: true; datos: DatosDeCuota }
  | { ok: false; fallas: FallaDeValidacion[] };

function falla(campo: string, motivo: MotivoDeFalla): FallaDeValidacion {
  return { campo, motivo };
}

function esClase(valor: string): valor is ClaseDeCuota {
  return valor === "monto_fijo" || valor === "porcentaje";
}

function esDisparador(valor: string): valor is DisparadorDeCuota {
  return valor === "fecha" || valor === "hito";
}

/**
 * Del borrador a lo que se manda, o a la lista de por qué no.
 *
 * Devuelve **todas** las fallas y no la primera, igual que su gemela del
 * Worker: un formulario que corrige de a un error por envío es el formulario
 * que nadie usa, y acá hay cuatro cosas que se pueden equivocar a la vez.
 *
 * ## Las dos exclusividades salen **estructuralmente**, no de una guarda
 *
 * `DatosDeCuota` pide exactamente uno de `monto`/`porcentaje` y exactamente
 * uno de `venceEn`/`hito`. Esta función no los comprueba con un `if` sobre
 * los cuatro valores: los **construye** desde la clase y el disparador
 * elegidos, así que el otro sale `null` por construcción. Un borrador con
 * las dos cifras no existe —hay un solo campo— y uno con las dos fechas
 * tampoco.
 *
 * Lo que sí se comprueba es que **se haya elegido**: sin clase sale
 * `monto_o_porcentaje` y sin disparador `vencimiento_o_hito`, que son los
 * dos motivos del contrato y dicen exactamente eso —«exactamente uno», y
 * ninguno es uno—.
 *
 * **El total no viaja, y no hay dónde ponerlo**: `DatosDeCuota` no lo tiene.
 * No es una omisión de esta función: es I-7 escrito en el contrato.
 */
export function normalizarBorradorDeCuota(
  borrador: BorradorDeCuota,
): CuotaNormalizada {
  const fallas: FallaDeValidacion[] = [];

  // Se recorta al guardar, y por eso la comprobación es sobre el recorte: en
  // un plan de cuatro renglones el concepto es lo único que los distingue.
  const concepto = borrador.concepto.trim();
  if (concepto === "") fallas.push(falla("concepto", "concepto_requerido"));

  /* --- La cifra, según la clase --- */

  let monto: number | null = null;
  let porcentaje: number | null = null;

  if (!esClase(borrador.clase)) {
    fallas.push(falla("clase", "monto_o_porcentaje"));
  } else if (borrador.clase === "monto_fijo") {
    const leido = centavosDesdeTexto(borrador.cifra);
    // `> 0` y no `>= 0`, al revés que un movimiento de gasto: una cuota es
    // una obligación que el cliente lee y firma, y un renglón de cero
    // promete un cobro que no existe. Es la misma línea que el `CHECK`
    // `el_monto_de_la_cuota_es_centavos_enteros_positivos`.
    if (!leido.ok || leido.centavos <= 0) {
      fallas.push(falla("cifra", "monto_invalido"));
    } else {
      monto = leido.centavos;
    }
  } else {
    const leido = puntosBasicosDesdeTexto(borrador.cifra);
    if (!leido.ok) {
      fallas.push(falla("cifra", "porcentaje_invalido"));
    } else {
      porcentaje = leido.puntosBasicos;
    }
  }

  /* --- Cuándo se cobra, según el disparador --- */

  let venceEn: string | null = null;
  let hito: string | null = null;

  if (!esDisparador(borrador.disparador)) {
    fallas.push(falla("disparador", "vencimiento_o_hito"));
  } else if (borrador.disparador === "fecha") {
    const escrita = borrador.venceEn.trim();
    if (escrita === "" || !esDiaValido(escrita)) {
      fallas.push(falla("venceEn", "vencimiento_invalido"));
    } else {
      venceEn = escrita;
    }
    // **Una fecha en el pasado se acepta**, al revés que el vencimiento de
    // una cotización y que la fecha de un gasto. Cargar hoy el plan de un
    // encargo que empezó el mes pasado es el caso corriente, y su primera
    // cuota venció antes de que nadie la escribiera. Es la misma decisión
    // que tomó la unidad A, y por eso acá no hay ninguna comparación contra
    // hoy.
  } else {
    const escrito = borrador.hito.trim();
    // Un hito en blanco no cuenta como hito: la base lo rechaza con
    // `el_hito_de_la_cuota_no_esta_en_blanco` justamente porque un `''`
    // derrotaría la exclusividad de vencimiento/hito. Acá se contesta antes,
    // con el motivo que dice que falta elegir cuándo.
    if (escrito === "") {
      fallas.push(falla("hito", "vencimiento_o_hito"));
    } else {
      hito = escrito;
    }
  }

  if (fallas.length > 0) return { ok: false, fallas };

  return { ok: true, datos: { concepto, monto, porcentaje, venceEn, hito } };
}
