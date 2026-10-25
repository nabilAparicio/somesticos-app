/**
 * Los gastos reales de un proceso en pantalla, sin React y sin DOM (T-10,
 * unidad B).
 *
 * Es el hermano de `../cotizaciones/lineas.ts` del otro lado del sistema:
 * allá está el gasto **estimado**, congelado en la cotización, y acá el
 * **real**, que aparece meses después y vive en el proceso
 * (`docs/diseno.md` §6). Las dos pantallas muestran dinero y las dos tienen
 * todas sus decisiones en un `.ts` que se prueba en el corredor del Worker,
 * para que el `.tsx` no decida nada.
 *
 * ## 1. La pantalla no suma. Nunca. Y acá menos que en ningún otro lado.
 *
 * Es la barandilla de la tajada, y es I-7 visto desde este lado: **el saldo
 * nunca se almacena y siempre se deriva**, y quien lo deriva es el servidor,
 * en `saldoDe` de `worker/gastos/dominio.ts`, sobre los movimientos que
 * acaba de leer. La respuesta lo trae en el mismo cuerpo que la lista
 * (`RespuestaDeGastos`), y lo que esta pantalla hace con él es **mostrarlo**.
 *
 * No hay un solo `+` sobre dinero en este archivo. La tentación tiene nombre
 * y conviene dejarlo escrito para el que venga: un avance del saldo mientras
 * se teclea el monto, para ahorrar un viaje. Costaría una segunda aritmética
 * en un segundo lenguaje, y el día que las dos discrepen por un centavo
 * nadie va a saber cuál de los dos números es el del proceso — que es
 * exactamente la familia de errores que I-7 elimina al no guardar el saldo
 * en ninguna columna.
 *
 * `familiasDeMovimientos` es la prueba de que se cumple: recibe el saldo y
 * lo reparte en subtotales, y `test/gastos-ui.spec.ts` le pasa uno que **no**
 * coincide con la suma de los movimientos y exige que salga el que llegó.
 *
 * ## 2. Lo que este módulo NO importa, aunque podría
 *
 * `saldoDe` vive en `worker/gastos/dominio.ts`, que es el módulo del que sí
 * se importan el vocabulario y las reglas del comprobante, así que traerla
 * costaría una palabra más en el `import`. **No se importa a propósito**, y
 * es la misma decisión que `../cotizaciones/lineas.ts` tomó con `totalesDe`:
 * tenerla a mano es la forma más fácil de que mañana alguien sume en la
 * pantalla sin darse cuenta de que estaba prohibido.
 *
 * El encabezado de `worker/gastos/dominio.ts` dice que la resta «la importan
 * el servidor y la pantalla del mismo lugar». **La pantalla no la importa**,
 * y la razón es la de arriba: una sola resta en el sistema es el objetivo, y
 * se consigue mejor con un solo llamador que con dos que la comparten. Dos
 * cuentas que dan el mismo número se contradicen el día que una corra con
 * datos distintos — acá serían los movimientos que la pantalla tiene en
 * memoria contra los que el servidor acaba de leer.
 *
 * ## 3. El saldo es informativo, no verdad contable
 *
 * Está en el alcance autorizado de la tajada con todas las letras
 * (`docs/diseno.md` §2 y el plan), y esta pantalla **lo dice**. Cómo lo dice
 * sale del criterio que T-3 B fijó para el gasto estimado:
 *
 *  - **rótulo visible pegado a la cifra** (`ROTULO_DEL_SALDO`), no una nota
 *    al pie ni letra chica;
 *  - **ningún color** lo distingue, así que sobrevive a una impresora que no
 *    imprime fondos y a una fotocopia en blanco y negro;
 *  - y un aviso aparte (`AVISO_SALDO_INFORMATIVO`) que dice **contra qué** es
 *    informativo, porque la palabra sola no lo dice.
 *
 * Los dos no son la misma guarda contada dos veces: el rótulo marca el
 * número aunque se recorte la pantalla, y el aviso explica qué significa la
 * marca. Cada uno tiene su prueba y ninguno se puede borrar sin matarla.
 *
 * ## 4. La conversión de dinero no se vuelve a escribir
 *
 * `montoLegible` y `centavosDesdeTexto` se importan de
 * `../cotizaciones/lineas.ts`, que es donde la restricción 5 tiene su única
 * frontera entre centavos enteros y lo que una persona escribe. Una segunda
 * conversión acá serían dos formas de escribir un importe, y la que se
 * desincronice primero lo haría sin que nadie lo note.
 *
 * El `import` cruza de una carpeta de pantallas a otra, que es lo único
 * discutible de esta decisión, y la alternativa era peor. **Queda dicho para
 * la próxima tarea que roce dinero en una tercera pantalla: ahí el archivo
 * se muda a `src/dinero.ts`, con los tres llamadores a la vista.** Es el
 * mismo criterio con el que `worker/gastos/dominio.ts` dejó anotada la
 * mudanza de `esDiaValido`.
 *
 * ## 5. Lo que este módulo no declara de nuevo
 *
 * El vocabulario cerrado (`TIPOS_DE_MOVIMIENTO`, `esTipoDeMovimiento`), las
 * reglas del comprobante (`TIPOS_DE_COMPROBANTE`, `TOPE_DEL_COMPROBANTE`) y
 * `esDiaValido` se importan de `worker/gastos/dominio.ts`. Copiarlos sería
 * una tercera mitad de lo que ya son dos mitades acopladas con la migración,
 * y la pantalla terminaría ofreciendo un tipo que la base rechaza con un 500
 * que nadie puede leer. Cruzar la frontera está permitido por lo mismo que
 * para `worker/cotizaciones/lineas.ts`: ese módulo **no tiene ninguna
 * importación en tiempo de ejecución** —sólo tipos, que se borran al
 * compilar—, así que no arrastra ni D1 ni R2 ni HTTP al bundle del
 * navegador. Está listado en `tsconfig.app.json`.
 *
 * ## 6. Esta validación no autoriza nada
 *
 * `normalizarBorradorDeMovimiento` y `validarComprobante` son **la segunda
 * copia** de las reglas de `normalizarMovimiento` y de las guardas de
 * `worker/gastos/rutas.ts`. La que manda es la del servidor; éstas existen
 * para avisar antes de mandar, y la del comprobante además para no gastar
 * una subida de diez megabytes en un 422. Son dos copias a propósito, con
 * pruebas propias cada una: aflojar una tiene que matar sus pruebas y no las
 * de la otra.
 *
 * ## 7. Lo que no vive acá
 *
 * **Que no poder adjuntar un comprobante no impida registrar un gasto.** Eso
 * no es una regla sino un estado de componente —son dos `useState` que no se
 * tocan— y se prueba en `e2e/gastos.spec.ts` sobre la pantalla dibujada.
 * Afirmarlo acá sería afirmar sobre la mitad que no se rompe.
 */

import type {
  DatosDeMovimiento,
  FallaDeValidacion,
  MotivoDeFalla,
  MovimientoDeGasto,
  SaldoDeGastos,
  TipoDeMovimiento,
} from "../../../worker/contract";
import {
  TIPOS_DE_COMPROBANTE,
  TIPOS_DE_MOVIMIENTO,
  TOPE_DEL_COMPROBANTE,
  esDiaValido,
  esTipoDeMovimiento,
} from "../../../worker/gastos/dominio";
import { VACIO } from "../../formatos";
import { centavosDesdeTexto, montoLegible } from "../cotizaciones/lineas";

export {
  TIPOS_DE_COMPROBANTE,
  TIPOS_DE_MOVIMIENTO,
  TOPE_DEL_COMPROBANTE,
  esTipoDeMovimiento,
};
export { centavosDesdeTexto, montoLegible };
export { mensajeDeFalla } from "../../mensajes";

/* ==========================================================================
   Los textos de la sección

   Viven acá y no dentro del `.tsx` por lo mismo que `AVISO_GASTO_APROXIMADO`:
   así su contenido se puede afirmar en una prueba en vez de quedar enterrado
   en un componente.
   ========================================================================== */

/**
 * El rótulo del número, **con la palabra adentro**.
 *
 * No dice «Saldo» a secas, y ésa es toda la decisión. Un número bajo un
 * rótulo que dice «Saldo», en una pantalla que ya muestra importes y
 * subtotales, se lee como contabilidad; y alguien va a tomar una decisión
 * mirándolo —cuánto pedirle al cliente, si cerrar el trámite— sin haber
 * leído el párrafo de al lado.
 *
 * Es el criterio de T-3 B con el gasto estimado, que no puso una bandera
 * `aproximado` sino que metió la palabra en el rótulo del subtotal: **la
 * marca viaja pegada a la cifra**. Sobrevive a que alguien recorte la
 * pantalla, la imprima o la fotocopie; un color no sobrevive a ninguna de
 * las tres, y por eso acá no hay ninguno.
 */
export const ROTULO_DEL_SALDO = "Saldo informativo";

/**
 * Qué quiere decir «informativo», dicho entero.
 *
 * El rótulo pone la marca y esto dice **contra qué**: la palabra sola no
 * distingue «aproximado» de «no es el estado de cuenta del bufete», y es lo
 * segundo. Facturación, conciliación bancaria, cuentas por cobrar y estado
 * de cuenta formal están fuera del alcance (`docs/diseno.md` §2), así que
 * este número contesta «¿cómo va la plata de este trámite?» y no «¿cuánto
 * debe este cliente?».
 *
 * No es letra chica: se dibuja dentro de la sección, arriba de la cifra, en
 * el mismo cuerpo de texto que todo lo demás — igual que
 * `AVISO_GASTO_APROXIMADO` en el documento de la cotización.
 */
export const AVISO_SALDO_INFORMATIVO =
  "Este saldo es informativo y no es contabilidad: sale de sumar lo que se" +
  " cargó acá y nada más. El sistema no hace facturación, ni conciliación" +
  " bancaria, ni estado de cuenta formal, así que antes de cobrarle o" +
  " devolverle plata a alguien hay que contrastarlo con los recibos.";

/**
 * Qué es esta sección y qué no.
 *
 * Dice la diferencia entre las dos vidas del gasto, porque es la que se
 * confunde: lo que está acá ya se movió, y lo que se espera gastar vive en
 * la cotización como una línea de clase `gasto_estimado`.
 */
export const AYUDA_DE_GASTOS =
  "Acá va la plata que ya se movió en este trámite: lo que el bufete pagó" +
  " por el cliente y lo que el cliente adelantó. Lo que todavía no ocurrió" +
  " no va acá: eso se cotiza como gasto estimado. Los importes se escriben" +
  " con punto para los centavos.";

/** Lo que se dice donde iría el papel y no hay ninguno todavía. */
export const AVISO_COMPROBANTE_OPCIONAL =
  "El comprobante es opcional y se puede subir después: lo corriente es que" +
  " el monto se sepa hoy y el papel se escanee más tarde. Subir uno nuevo" +
  " sobre un movimiento que ya tenía reemplaza el anterior.";

/** Lo que se dice antes de sacar un movimiento de la cuenta. */
export const AVISO_MOVIMIENTO_NO_SE_EDITA =
  "Un movimiento cargado no se corrige: se saca de la cuenta y se vuelve a" +
  " cargar. Al sacarlo se borra también su comprobante, y el saldo lo" +
  " recalcula el servidor con lo que quede.";

/* ==========================================================================
   La lectura del saldo
   ========================================================================== */

/** De qué lado cae la cuenta, dicho en palabras y no con un signo. */
export const TITULAR_A_FAVOR = "A favor del cliente";
export const TITULAR_EN_CONTRA = "El cliente debe";
export const TITULAR_AL_DIA = "La cuenta está al día";

/**
 * Lo que se dice cuando el número que llegó no es un saldo que se pueda
 * leer.
 *
 * Ver `lecturaDelSaldo`. No debería llegar nunca, y justamente por eso.
 */
export const TITULAR_ILEGIBLE = "No se pudo leer el saldo";

export interface LecturaDelSaldo {
  /** Siempre `ROTULO_DEL_SALDO`. No hay un segundo rótulo. */
  readonly rotulo: string;
  /** De qué lado cae, en palabras. */
  readonly titular: string;
  /** El importe **sin signo**: el signo lo lleva el titular. */
  readonly importe: string;
  /** Qué significa ese lado, para quien no lo tenga claro. */
  readonly explicacion: string;
}

/**
 * Por qué cada lado del saldo significa lo que significa.
 *
 * Son las dos mecánicas de cobro del bufete (`docs/diseno.md` §6), y salen
 * de las mismas filas sin una sola rama que las distinga: el reembolso puro
 * es el caso en que no hay anticipos.
 */
const EXPLICACIONES = {
  aFavor:
    "El cliente adelantó más de lo que se gastó hasta ahora. Esa diferencia" +
    " es suya: se le devuelve o se le aplica al próximo gasto.",
  enContra:
    "Se gastó más de lo que el cliente adelantó. Esa diferencia es lo que" +
    " hay que cobrarle, contra los comprobantes de cada gasto.",
  alDia:
    "Lo que el cliente adelantó y lo que se gastó dan lo mismo: no queda" +
    " nada por cobrar ni por devolver.",
  ilegible:
    "El saldo que llegó del servidor no es un importe en centavos enteros," +
    " así que no se dibuja un número que podría estar mal. Hay que volver a" +
    " cargar la página; si sigue pasando, es un defecto que hay que avisar.",
} as const;

/**
 * El saldo del proceso, listo para dibujar.
 *
 * **No calcula el saldo: lo lee.** El número llega derivado en la respuesta
 * y acá sólo se decide cómo se dice. Lo único que se hace con él es
 * `Math.abs`, que sobre un entero sigue siendo un entero.
 *
 * ## Por qué hay una guarda de entero, y qué pasa sin ella
 *
 * La comparación `saldo === 0` es exacta **porque el número es un entero de
 * centavos**, y eso no es casualidad: la unidad A lo midió. Con un anticipo
 * de 160 238 centavos contra tres gastos de 58 795, 57 539 y 43 904, la
 * cuenta entera da **exactamente cero** —la cuenta está saldada— y la misma
 * cuenta hecha en dólares da `5,684341886080802e-14`.
 *
 * Si ese número llegara, `=== 0` diría que la cuenta **no** está al día y
 * `> 0` diría que al cliente le sobran cero coma nada: dos respuestas
 * equivocadas sobre una cuenta saldada. Por eso lo que no es un entero
 * seguro **no se clasifica**, y se dice que no se pudo leer. Redondear sería
 * meter una decisión aritmética en la pantalla, que es lo que la barandilla
 * prohíbe; dibujar el titular igual sería mentir con una cifra escondida
 * detrás.
 *
 * Es la misma precedencia que `montoEditable` eligió para un importe que no
 * es un importe: no debería llegar nunca —el contrato, el `CHECK` de la
 * migración y `Number.isSafeInteger` del Worker lo impiden— y justamente por
 * eso, si llega, lo correcto es decir que no se sabe.
 */
export function lecturaDelSaldo(saldo: SaldoDeGastos): LecturaDelSaldo {
  if (!Number.isSafeInteger(saldo.saldo)) {
    return {
      rotulo: ROTULO_DEL_SALDO,
      titular: TITULAR_ILEGIBLE,
      importe: VACIO,
      explicacion: EXPLICACIONES.ilegible,
    };
  }

  const titular =
    saldo.saldo === 0
      ? TITULAR_AL_DIA
      : saldo.saldo > 0
        ? TITULAR_A_FAVOR
        : TITULAR_EN_CONTRA;

  const explicacion =
    saldo.saldo === 0
      ? EXPLICACIONES.alDia
      : saldo.saldo > 0
        ? EXPLICACIONES.aFavor
        : EXPLICACIONES.enContra;

  return {
    rotulo: ROTULO_DEL_SALDO,
    titular,
    // Sin signo: «−1,602.38» obliga a acordarse de qué lado es el negativo,
    // y el titular ya lo dijo en palabras. `montoLegible` además sólo sabe
    // escribir importes de cero en adelante.
    importe: montoLegible(Math.abs(saldo.saldo)),
    explicacion,
  };
}

/* ==========================================================================
   Las dos familias
   ========================================================================== */

/**
 * Cómo se muestra cada tipo. **Exhaustivo** sobre `TipoDeMovimiento`: el día
 * que el vocabulario tenga un tercero, esto deja de compilar hasta que
 * alguien diga de qué suma sale su subtotal y cómo se llama.
 *
 * Es **un solo registro y no tres paralelos**, por el mismo argumento que
 * `COMO_SE_MUESTRA` en las líneas: tres tablas que dicen cosas del mismo
 * tipo son tres lugares que mañana dicen cosas distintas.
 *
 * `campoDelSubtotal` es una clave de `SaldoDeGastos` y no de otra cosa, y
 * eso es la barandilla escrita en el tipo: el subtotal **sale del saldo que
 * mandó el servidor** y no hay forma de que salga de los movimientos sin
 * cambiar esta declaración.
 */
const COMO_SE_MUESTRA: Record<
  TipoDeMovimiento,
  {
    readonly campoDelSubtotal: keyof SaldoDeGastos;
    readonly rotulo: string;
    readonly rotuloDelSubtotal: string;
    readonly ayuda: string;
    readonly vacia: string;
  }
> = {
  anticipo: {
    campoDelSubtotal: "anticipos",
    rotulo: "Lo que el cliente adelantó",
    rotuloDelSubtotal: "Total adelantado",
    ayuda:
      "Plata que entró: el cliente la puso por adelantado para que el" +
      " bufete vaya pagando los trámites.",
    vacia:
      "Este cliente no adelantó nada todavía. Si el bufete paga y después" +
      " cobra, esta lista se queda vacía y está bien.",
  },
  gasto: {
    campoDelSubtotal: "gastos",
    rotulo: "Lo que se gastó en el trámite",
    rotuloDelSubtotal: "Total gastado",
    ayuda:
      "Plata que salió: tasas, timbres, mensajería y todo lo que el bufete" +
      " adelantó o pagó por el cliente, con su comprobante.",
    vacia: "Todavía no se cargó ningún gasto de este proceso.",
  },
};

/** Una de las dos mitades de la cuenta, lista para dibujar. */
export interface FamiliaDeMovimientos {
  readonly tipo: TipoDeMovimiento;
  readonly rotulo: string;
  readonly ayuda: string;
  readonly movimientos: readonly MovimientoDeGasto[];
  /** **Del servidor.** Nunca la suma de `movimientos`. En centavos. */
  readonly subtotal: number;
  /** El mismo número, escrito. Un hueco si no es un importe. */
  readonly subtotalLegible: string;
  readonly rotuloDelSubtotal: string;
  /** Qué se dice cuando la familia no tiene ningún movimiento. */
  readonly vacia: string;
}

/** Los tres en cero, para antes de que llegue la primera respuesta. */
export const SALDO_EN_CERO: SaldoDeGastos = {
  anticipos: 0,
  gastos: 0,
  saldo: 0,
};

/**
 * Reparte los movimientos en sus dos familias, **en el orden del
 * vocabulario**: primero lo que entró y después lo que salió.
 *
 * Ese orden lo fija `TIPOS_DE_MOVIMIENTO` en `worker/gastos/dominio.ts` y no
 * esta pantalla, por lo mismo que el de las clases de línea: es el orden en
 * que se lee la cuenta, y tenerlo en un solo lugar evita que el servidor y
 * la pantalla cuenten la misma historia al revés.
 *
 * **El subtotal sale de `saldo` y jamás de los movimientos.** Es la
 * barandilla, y esta función es el único sitio de la pantalla donde las dos
 * cosas se tocan: si alguien cambiara esto por una suma, lo notaría la
 * prueba que le pasa un saldo que no coincide.
 *
 * **Las dos familias se dibujan siempre**, aunque estén vacías. Una que
 * apareciera recién con su primer movimiento escondería la mitad de la
 * cuenta —nadie encontraría dónde anotar el primer anticipo— y además
 * dejaría la duda de si no hay ninguno o si no se cargaron. Cada una dice en
 * su `vacia` cuál de las dos cosas es.
 */
export function familiasDeMovimientos(
  movimientos: readonly MovimientoDeGasto[],
  saldo: SaldoDeGastos,
): FamiliaDeMovimientos[] {
  return TIPOS_DE_MOVIMIENTO.map((tipo) => {
    const como = COMO_SE_MUESTRA[tipo];
    const subtotal = saldo[como.campoDelSubtotal];

    return {
      tipo,
      rotulo: como.rotulo,
      ayuda: como.ayuda,
      movimientos: movimientos.filter((uno) => uno.tipo === tipo),
      subtotal,
      subtotalLegible: montoLegible(subtotal),
      rotuloDelSubtotal: como.rotuloDelSubtotal,
      vacia: como.vacia,
    };
  });
}

/* ==========================================================================
   El borrador de un movimiento
   ========================================================================== */

/**
 * Lo que se escribe en los cuatro controles.
 *
 * Los cuatro son `string` y ninguno está tipado estrecho, por las mismas
 * razones que `BorradorDeLinea`:
 *
 *  - `tipo` arranca **vacío**, así que tiparlo `TipoDeMovimiento` obligaría
 *    a inventar un tercer tipo para «ninguno todavía», que es justo lo que
 *    el vocabulario cerrado existe para impedir.
 *  - `monto` es texto porque **lo que hay en el campo es texto**, y a veces
 *    texto que todavía no es un número.
 *  - `fecha` usa la cadena vacía para «hoy», que es lo que vale un
 *    `<input type="date">` sin tocar. La traducción al día de hoy la hace
 *    `normalizarBorradorDeMovimiento`, que es la frontera.
 */
export interface BorradorDeMovimiento {
  tipo: string;
  concepto: string;
  monto: string;
  fecha: string;
}

/**
 * El alta arranca **sin tipo, sin concepto, sin monto y sin fecha**.
 *
 * Un desplegable que arranca en «gasto» es el que hace cargar un gasto donde
 * alguien quería anotar un anticipo, y eso no es un detalle: es el lado
 * equivocado del saldo, o sea el doble del error. Y la fecha en blanco se
 * lee como hoy, que es el caso corriente, sin que nadie tenga que elegirla.
 */
export const BORRADOR_DE_MOVIMIENTO_VACIO: BorradorDeMovimiento = {
  tipo: "",
  concepto: "",
  monto: "",
  fecha: "",
};

/** Lo que esta validación necesita saber del mundo. */
export interface ContextoDelMovimiento {
  /** El día de hoy **en Panamá**, `AAAA-MM-DD`. */
  readonly hoy: string;
}

export type MovimientoNormalizado =
  | { ok: true; datos: DatosDeMovimiento }
  | { ok: false; fallas: FallaDeValidacion[] };

function falla(campo: string, motivo: MotivoDeFalla): FallaDeValidacion {
  return { campo, motivo };
}

/**
 * Del borrador a lo que se manda, o a la lista de por qué no.
 *
 * Devuelve **todas** las fallas y no la primera, igual que su gemela del
 * Worker: un formulario que corrige de a un error por envío es el formulario
 * que nadie usa, y acá hay cuatro campos que se pueden equivocar a la vez.
 *
 * **El saldo no viaja, y no hay dónde ponerlo**: `DatosDeMovimiento` no lo
 * tiene. No es una omisión de esta función — es I-7 escrito en el contrato.
 */
export function normalizarBorradorDeMovimiento(
  borrador: BorradorDeMovimiento,
  contexto: ContextoDelMovimiento,
): MovimientoNormalizado {
  const fallas: FallaDeValidacion[] = [];

  const tipo = borrador.tipo;
  if (!esTipoDeMovimiento(tipo)) {
    fallas.push(falla("tipo", "tipo_de_movimiento_desconocido"));
  }

  // Se recorta al guardar, y por eso la comprobación es sobre el recorte: un
  // concepto de tres espacios es un monto sin explicación.
  const concepto = borrador.concepto.trim();
  if (concepto === "") fallas.push(falla("concepto", "concepto_requerido"));

  const monto = centavosDesdeTexto(borrador.monto);
  if (!monto.ok) fallas.push(falla("monto", "monto_invalido"));

  // La fecha es opcional y en blanco se lee como hoy. Lo que no es opcional
  // es que, si viene, sea un día que exista y que no esté en el futuro: un
  // gasto que todavía no ocurrió es un presupuesto, y para eso está la línea
  // de clase `gasto_estimado` de la cotización.
  const escrita = borrador.fecha.trim();
  let fecha = contexto.hoy;
  if (escrita !== "") {
    if (!esDiaValido(escrita)) {
      fallas.push(falla("fecha", "fecha_invalida"));
      // La comparación es de texto y es correcta **por construcción, no por
      // casualidad**: `esDiaValido` ya corrió, así que las dos cadenas están
      // en `AAAA-MM-DD`, que es de ancho fijo y donde el orden lexicográfico
      // y el cronológico son el mismo. Si la guarda de arriba se aflojara,
      // ésta dejaría de valer en silencio.
    } else if (escrita > contexto.hoy) {
      fallas.push(falla("fecha", "fecha_futura"));
    } else {
      fecha = escrita;
    }
  }

  if (fallas.length > 0) return { ok: false, fallas };

  return {
    ok: true,
    datos: {
      tipo: tipo as TipoDeMovimiento,
      concepto,
      monto: monto.ok ? monto.centavos : 0,
      fecha,
    },
  };
}

/* ==========================================================================
   El comprobante
   ========================================================================== */

/**
 * Lo que el control de archivo ofrece, **de la misma lista que valida**.
 *
 * Escribirlo aparte dejaría que el control ofreciera un tipo que el servidor
 * rechaza, y el rechazo llegaría recién después de subir el archivo entero.
 */
export const ACEPTA_COMPROBANTE = TIPOS_DE_COMPROBANTE.join(",");

/** Lo mínimo que hace falta saber de un archivo para decidir si se sube. */
export interface ArchivoElegido {
  readonly type: string;
  readonly size: number;
}

/**
 * Si ese archivo se puede mandar, o por qué no.
 *
 * Es la segunda copia de las guardas de `worker/gastos/rutas.ts`, y acá vale
 * más que en otros lados: sin ella, un escaneo de veinte megabytes viaja
 * entero para que el servidor conteste 422. La que manda sigue siendo la del
 * servidor, que es la única que ve el cuerpo de verdad.
 *
 * Los dos motivos son los mismos del contrato y por el mismo reparto: vacío
 * y «no es un comprobante» caen juntos porque la corrección es la misma
 * —elegir otro archivo—, y pasarse del tope va aparte porque ahí hay que
 * achicar el que se tiene.
 *
 * El tipo se compara **sin parámetros ni mayúsculas**, igual que
 * `esTipoDeComprobante`: un navegador puede mandar `image/JPEG`.
 */
export function validarComprobante(
  archivo: ArchivoElegido,
): FallaDeValidacion | null {
  const tipo = archivo.type.split(";")[0].trim().toLowerCase();

  if (
    archivo.size === 0 ||
    !(TIPOS_DE_COMPROBANTE as readonly string[]).includes(tipo)
  ) {
    return falla("comprobante", "comprobante_no_admitido");
  }

  if (archivo.size > TOPE_DEL_COMPROBANTE) {
    return falla("comprobante", "comprobante_demasiado_grande");
  }

  return null;
}

/**
 * Cómo se llama el archivo que se descarga.
 *
 * El servidor contesta con `content-disposition: attachment` y sin nombre,
 * porque la llave no viaja; el nombre lo pone la pantalla con lo que tiene a
 * mano, que es el concepto del movimiento. Sin esto el navegador guardaría
 * un archivo llamado como el identificador, que no le dice nada a nadie seis
 * meses después.
 *
 * Se limpia lo que un sistema de archivos no admite y se recorta, porque un
 * concepto es texto libre.
 */
export function nombreDelComprobante(movimiento: MovimientoDeGasto): string {
  const limpio = movimiento.concepto
    .replace(/[^\p{L}\p{N} .-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);

  return `comprobante-${limpio === "" ? movimiento.id : limpio}`;
}

/**
 * Cómo se firma un movimiento: quién lo cargó.
 *
 * `usuarioNombre` puede venir nulo si la fila de `usuario` cruzara la
 * frontera del tenant, y ahí va el hueco en vez del identificador crudo.
 */
export function firmaDelMovimiento(movimiento: MovimientoDeGasto): string {
  return `Cargado por ${movimiento.usuarioNombre ?? VACIO}`;
}
