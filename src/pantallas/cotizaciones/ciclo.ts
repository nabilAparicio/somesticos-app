/**
 * El ciclo de vida de la cotización, visto desde la pantalla (T-4 y T-5,
 * unidad B).
 *
 * Acá vive **qué puede hacerse en cada estado** y **qué dice la pantalla
 * antes de que alguien lo haga**. Sin React y sin DOM, por lo mismo que
 * `presentacion.ts`: son funciones de datos a texto, y adentro de un `.tsx`
 * sólo se pueden probar levantando un navegador para leer lo que ya era una
 * cadena.
 *
 * ## Las tres flechas, y ni una más
 *
 * `migrations/0007_ciclo_de_vida.sql` enumera las transiciones legales **en
 * positivo**, y este archivo es la misma enumeración del lado de la
 * pantalla:
 *
 *     borrador  ──>  emitida  ──>  ganada | perdida
 *
 * Son **dos copias deliberadas** de la misma regla, igual que la validación
 * del formulario es la segunda copia de la de `dominio.ts`. La que manda es
 * la de la base, que se niega aunque esta tabla esté mal; ésta existe para
 * que la pantalla **no ofrezca lo que el servidor va a rechazar**.
 *
 * Es la lección de la unidad B de T-2, donde el desplegable mostraba un
 * hueco donde había un cliente: un control que existe es una promesa. Un
 * botón «Marcar ganada» sobre un borrador promete una transición que el
 * disparador `cotizacion_el_estado_sigue_el_ciclo_de_vida` aborta.
 *
 * ## Por qué `duplicar` está en los cuatro
 *
 * Porque no es una transición: no mueve el estado de nada. Nace una fila
 * nueva en `borrador`, atada por `duplicada_de_id`, y la de arriba se queda
 * exactamente como estaba. Es justamente la salida que vuelve soportable que
 * ganada y perdida sean el final — «un ciclo de vida sin vuelta atrás y una
 * duplicación barata son la misma decisión vista de los dos lados», dice la
 * migración.
 *
 * ## Lo que este archivo NO hace
 *
 * No imprime (T-6) y no mira el snapshot: lo que el detalle muestra sale de
 * las tablas vivas. Y no calcula nada — los totales los trae el servidor con
 * las líneas, en el mismo cuerpo que ellas.
 *
 * Decía además «no abre procesos (T-7)», y seguía siendo cierto cuando T-15
 * lo borró: **abrir** procesos es del servidor y pasa dentro de la misma
 * transacción que marca la cotización ganada. Lo que T-15 trajo acá es otra
 * cosa — **decir cuáles abrió**, que es el final del ciclo visto desde la
 * pantalla y por lo tanto exactamente de lo que este archivo habla.
 */

import type {
  Cotizacion,
  EstadoDeCotizacion,
  Proceso,
} from "../../../worker/contract";

/**
 * Las cuatro cosas que se pueden pedir desde la pantalla.
 *
 * Son exactamente los cuatro verbos de `worker/cotizaciones/rutas.ts`, y la
 * unión se escribe acá y no se importa del contrato porque allá no existe:
 * el Worker los tiene como un arreglo literal adentro del enrutador.
 */
export type AccionDeCiclo = "emitir" | "ganar" | "perder" | "duplicar";

/**
 * Qué se puede hacer desde cada estado.
 *
 * El `Record` es **exhaustivo** sobre `EstadoDeCotizacion`, igual que el mapa
 * de estados legibles de `presentacion.ts`: el día que el `CHECK` de la tabla
 * admita un quinto estado, esto deja de compilar hasta que alguien decida qué
 * se puede hacer con él. Un estado sin entrada que cayera en un arreglo vacío
 * por omisión sería una pantalla muda sin que nadie lo haya decidido.
 *
 * El **orden de cada lista es el orden en que se dibujan los botones**, y no
 * es alfabético: primero lo que mueve el ciclo hacia adelante, y `duplicar`
 * último en los cuatro porque es la salida lateral. Que esté siempre en el
 * mismo lugar es lo que evita que la persona que duplica dos veces seguidas
 * apriete «Marcar perdida» la segunda.
 */
const ACCIONES_POR_ESTADO: Record<
  EstadoDeCotizacion,
  readonly AccionDeCiclo[]
> = {
  borrador: ["emitir", "duplicar"],
  emitida: ["ganar", "perder", "duplicar"],
  // Ganada y perdida son el final, y es una decisión de negocio antes que un
  // dibujo: una cotización aceptada que después se cae no es una cotización
  // perdida, es un encargo que se cerró, y un encargo vive en `proceso`. El
  // argumento largo está en M-1 de `0007`.
  ganada: ["duplicar"],
  perdida: ["duplicar"],
};

export function accionesDe(cotizacion: Cotizacion): readonly AccionDeCiclo[] {
  return ACCIONES_POR_ESTADO[cotizacion.estado];
}

/**
 * Cómo se llama cada control.
 *
 * `ganar` y `perder` se dicen **«Marcar ganada»** y **«Marcar perdida»** y no
 * «Ganar» y «Perder», que es lo que hacen los verbos de la API. La diferencia
 * importa: nadie gana una cotización apretando un botón —la ganó el bufete,
 * afuera—, y lo que la pantalla hace es **registrar** ese hecho. Un «Ganar»
 * imperativo se lee como si el sistema produjera el desenlace.
 *
 * El rótulo de `emitir` es una palabra sola a propósito: el botón que
 * **confirma** se llama distinto («Emitir y congelar»), y dos controles con
 * el mismo nombre accesible son dos controles que nadie puede distinguir —ni
 * una prueba, ni un lector de pantalla—.
 */
export const ROTULOS_DE_ACCION: Record<AccionDeCiclo, string> = {
  emitir: "Emitir",
  ganar: "Marcar ganada",
  perder: "Marcar perdida",
  duplicar: "Duplicar",
};

/** Lo que confirma la emisión. Ver `confirmacionDeEmitir`. */
export const ROTULO_DE_CONFIRMAR_EMISION = "Emitir y congelar";

/** La salida de la confirmación que no emite nada. */
export const ROTULO_DE_CANCELAR_EMISION = "No emitir";

/**
 * Las mismas acciones, dichas dentro de una frase.
 *
 * Es un mapa aparte de `ROTULOS_DE_ACCION` y no una transformación de él
 * porque un rótulo de botón y un verbo en prosa no son la misma palabra:
 * «Marcar ganada» en medio de una oración se lee como un título pegado.
 */
const EN_PROSA: Record<AccionDeCiclo, string> = {
  emitir: "emitirla",
  ganar: "marcarla ganada",
  perder: "marcarla perdida",
  duplicar: "duplicarla",
};

/**
 * Las salidas de una cotización, enumeradas para meter en una frase.
 *
 * Sale de `ACCIONES_POR_ESTADO`, que es el mismo mapa que decide los
 * botones, y eso es el punto: **el aviso no puede nombrar una puerta que la
 * pantalla no dibuja**, ni callarse una que sí. Con dos listas separadas, el
 * día que una cambie la otra queda mintiendo y nadie se entera hasta que
 * alguien busca un botón que el texto prometió.
 */
export function salidasEnProsa(cotizacion: Cotizacion): string {
  const salidas = accionesDe(cotizacion).map((accion) => EN_PROSA[accion]);

  if (salidas.length === 1) return salidas[0];

  // «a, b o c»: la coordinación va sólo antes de la última. Un `join(" o ")`
  // daría «a o b o c», que se lee como una lista de alternativas excluyentes
  // y éstas no lo son — una emitida se puede duplicar y además perder.
  return `${salidas.slice(0, -1).join(", ")} o ${salidas[salidas.length - 1]}`;
}

/**
 * Lo que la pantalla dice **antes** de emitir, y por qué está redactado así.
 *
 * El criterio es uno solo: **que diga qué pasa, no que pregunte si está
 * seguro.** «¿Estás seguro?» no informa a nadie y se aprieta sin leer; «se
 * congela el documento y deja de poder editarse» es una frase que cambia lo
 * que la persona hace a continuación.
 *
 * De ahí las cuatro cosas que dice, y ninguna es decorativa:
 *
 *  1. **Qué cotización.** Con tres pestañas abiertas, una confirmación que no
 *     nombra el código no dice cuál se está por congelar.
 *  2. **Qué se congela**, y nombrando las dos mitades: los módulos de prosa y
 *     las líneas de importe. «No se podrá editar la cotización» deja afuera
 *     justo lo que la persona acaba de escribir.
 *  3. **Que no hay otro camino.** No es una regla de esta pantalla: la
 *     sostienen los disparadores de `migrations/0006_emitir_y_congelar.sql`,
 *     así que tampoco se deshace entrando por otro lado.
 *  4. **Qué queda después.** Una puerta cerrada sin decir cuáles quedan
 *     abiertas se lee como un callejón.
 *
 * No lleva signo de interrogación, y eso también es la decisión: no es una
 * pregunta, es un aviso con dos botones debajo.
 */
export function confirmacionDeEmitir(cotizacion: Cotizacion): string {
  return (
    `Emitir «${cotizacion.codigo}» congela el documento. Su contenido —los` +
    " módulos de prosa y las líneas de importe— queda guardado tal como está" +
    " ahora y no se vuelve a editar: ni desde esta pantalla, ni por ningún" +
    " otro camino. Después quedan tres cosas por hacer con ella: marcarla" +
    " ganada, marcarla perdida o duplicarla para volver a cotizar."
  );
}

/**
 * De dónde salió una cotización que nació duplicando.
 *
 * **Un salto, y no la cadena entera.** `Cotizacion` trae `duplicadaDeId` pero
 * no el código de la de arriba, así que cada salto cuesta una lectura más al
 * dibujar el detalle; y la de arriba, abierta, muestra el suyo con el mismo
 * componente. O sea: la cadena se recorre a un clic por salto, que es lo que
 * alguien hace de todos modos cuando quiere ver qué decía la anterior.
 *
 * Que el recorrido **termine** no hay que defenderlo con un tope de
 * profundidad ni con detección de ciclos, y eso está medido en M-2 de
 * `migrations/0007_ciclo_de_vida.sql`: por `INSERT` no se puede cerrar un
 * ciclo de ninguna longitud —la fila apuntada tiene que existir ya, así que
 * el padre siempre es más viejo que el hijo— y `duplicada_de_id` es inmutable
 * desde el alta. Un grafo que sólo crece por las hojas y nunca se reescribe
 * es un bosque. Código de tope sería código que ninguna prueba puede matar.
 *
 * El `null` **no es** «no nació duplicando»: eso lo dice `duplicadaDeId` y se
 * decide antes de llamar acá. Es «la lectura de la de arriba no salió», que
 * es un fallo de red y no un dato ausente — la fila existe siempre, se lo
 * garantizan la llave foránea y el disparador de tenencia de `0004`.
 */
export function textoDeProcedencia(origen: Cotizacion | null): string {
  if (origen === null) {
    return (
      "Esta cotización nació duplicando otra, y esa otra no se pudo leer" +
      " ahora."
    );
  }

  return `Nació duplicando «${origen.codigo}».`;
}

/**
 * En qué quedó una cotización ganada (T-15).
 *
 * ## Por qué esto no vive en la respuesta de ganar
 *
 * `RespuestaDeCierre.procesosAbiertos` trae el conteo desde T-7, y contesta
 * la pregunta **en el instante en que alguien aprieta el botón**. Pero la
 * pregunta que una persona se hace de verdad es tres meses después, delante
 * de una cotización que no recuerda: «ésta, ¿en qué quedó?». Una respuesta
 * que se pierde al recargar no la contesta.
 *
 * Por eso el detalle lo lee del listado de procesos cada vez que se dibuja,
 * y el conteo de la respuesta se queda como está: no hay dos lugares donde
 * se decida cuántos procesos abrió una cotización, hay uno —las filas de
 * `proceso` que apuntan a sus líneas— y dos momentos en que se lo mira.
 *
 * ## Los tres finales, y por qué son tres y no dos
 *
 *  - **Con procesos**, la frase termina en dos puntos porque abajo va la
 *    lista. Es lo que ata el número a los enlaces: «abrió 2» sin la lista
 *    debajo obliga a ir a buscarlos a otra pantalla.
 *  - **Sin ninguno**, se dice igual, y además se dice *por qué*. Es el mismo
 *    argumento con el que el contrato decidió que el conteo viajara aunque
 *    valga cero: una ganada donde ninguna línea lleva tipo de proceso es
 *    legítima y corriente —una consulta, un timbre, una mensajería— y «no
 *    abrió ninguno» es información, mientras que un bloque que desaparece es
 *    un hueco.
 *  - **La lectura que no salió** es el tercero, y no se confunde con el
 *    cero. Es el mismo criterio que `textoDeProcedencia` unos renglones más
 *    arriba: un fallo de red dicho como «no abrió ninguno» manda a alguien a
 *    concluir que no hay procesos que sí existen.
 *
 * El `null` es ese tercer caso. El arreglo vacío es el segundo. Que sean
 * dos valores distintos y no uno solo es la diferencia entre las dos
 * frases.
 */
export function textoDeProcesosAbiertos(
  procesos: readonly Proceso[] | null,
): string {
  if (procesos === null) {
    return (
      "Esta cotización está ganada. Los procesos que abrió no se pudieron" +
      " leer ahora."
    );
  }

  if (procesos.length === 0) {
    return (
      "Esta cotización está ganada y no abrió ningún proceso: ninguna de sus" +
      " líneas lleva tipo de proceso."
    );
  }

  return procesos.length === 1
    ? "Esta cotización está ganada y abrió 1 proceso:"
    : `Esta cotización está ganada y abrió ${String(
        procesos.length,
      )} procesos:`;
}
