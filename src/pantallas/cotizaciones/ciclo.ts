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
 * lo borró: **abrir** procesos es del servidor y pasaba dentro de la misma
 * transacción que marca la cotización ganada. Lo que T-15 trajo acá es otra
 * cosa — **decir cuáles abrió**, que es el final del ciclo visto desde la
 * pantalla y por lo tanto exactamente de lo que este archivo habla.
 *
 * ## Y lo que T-13 trajo: **proponer** cuáles abrir
 *
 * Abrir sigue siendo del servidor. Lo que vive acá desde T-13 es la
 * derivación que el servidor dejó de hacer: qué procesos sugieren las
 * líneas de una cotización ganada, para que el bufete la edite antes de que
 * exista nada. Es una función pura sobre datos que la pantalla ya tiene
 * —`LineaDeCotizacion` viaja con su `tipoProcesoId` y su
 * `tipoProcesoNombre` resueltos desde T-3— y por eso no hay ninguna ruta
 * nueva que la pida: una propuesta que viajara de ida para volver corregida
 * serían dos formas del mismo dato en el cable.
 */

import type {
  Cotizacion,
  DatosDeProcesoPorAbrir,
  EstadoDeCotizacion,
  FallaDeValidacion,
  LineaDeCotizacion,
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
 * En qué quedó una cotización ganada (T-15, corregido por T-13).
 *
 * ## Una sola fuente, y ya no dos momentos
 *
 * T-15 escribió acá que `RespuestaDeCierre.procesosAbiertos` contestaba la
 * pregunta «en el instante» y que el detalle la volvía a contestar leyendo
 * la lista de procesos, y que eso eran «dos momentos en que se lo mira» de
 * una sola fuente. **La corrección de T-13 es que ya no hay dos momentos,
 * hay uno**: ganar dejó de abrir procesos, así que aquel conteo dejó de
 * existir y se fue del contrato. Lo que queda es esta lectura, y es la
 * única.
 *
 * La pregunta que sostiene el bloque no cambió, y es la que importa: una
 * persona que abre esta cotización tres meses después quiere saber en qué
 * quedó, y una respuesta que se pierde al recargar no la contesta.
 *
 * ## Los tres finales, y por qué el del medio cambió de frase
 *
 *  - **Con procesos**, la frase termina en dos puntos porque abajo va la
 *    lista. Es lo que ata el número a los enlaces: «abrió 2» sin la lista
 *    debajo obliga a ir a buscarlos a otra pantalla.
 *  - **Sin ninguno**, la frase de T-15 decía *por qué*: «ninguna de sus
 *    líneas lleva tipo de proceso». **Eso era cierto mientras ganar
 *    abriera**, y con T-13 pasó a ser falso: una ganada con cinco líneas de
 *    trámite también muestra cero hasta que alguien confirme la propuesta.
 *    Decirlo igual mandaría a revisar las líneas de una cotización que no
 *    tiene nada malo. La frase nueva dice lo que de verdad pasa —todavía no
 *    se abrió ninguno— y el panel de abajo dice qué hacer con eso.
 *  - **La lectura que no salió** es el tercero, y no se confunde con el
 *    cero. Es el mismo criterio que `textoDeProcedencia` unos renglones más
 *    arriba: un fallo de red dicho como «no abrió ninguno» manda a alguien
 *    a concluir que no hay procesos que sí existen.
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
      "Esta cotización está ganada y todavía no abrió ningún proceso."
    );
  }

  return procesos.length === 1
    ? "Esta cotización está ganada y abrió 1 proceso:"
    : `Esta cotización está ganada y abrió ${String(
        procesos.length,
      )} procesos:`;
}

/* ==========================================================================
   T-13 B · La propuesta de procesos, antes de que exista ninguno

   El usuario eligió, entre dos caminos, el de proponer y confirmar:

   > «Al ganar, muestra "voy a abrir estos dos procesos" con sus nombres y
   > tipos, y vos sacás uno, fusionás, cambiás el tipo o agregás otro.
   > Recién entonces nacen.»

   El otro camino —abrir y que el bufete ajuste después— se descartó por el
   propio ejemplo de la sociedad anónima: el sistema infiere dos y el bufete
   quiere uno, así que nacería un expediente que hay que borrar, y borrar un
   proceso arrastra bitácora. La ambigüedad se resuelve antes de que haya
   algo que deshacer.
   ========================================================================== */

/**
 * Una fila de la propuesta: un proceso que todavía no existe.
 *
 * **No es `DatosDeProcesoPorAbrir` con un campo más, aunque se le parezca**,
 * y la diferencia es la que separa un formulario de un cuerpo de petición:
 *
 *  - `responsableId` es `string` y no `string | null`, porque la cadena
 *    vacía es lo que manda un `<select>` sin elegir. Convertirla a nulo es
 *    trabajo de `aAperturaDeProcesos`, en el borde, y no de cada control.
 *  - `clave` no viaja a ningún lado: es la identidad de la fila **dentro de
 *    la pantalla**, y existe porque React necesita una y porque sin ella
 *    sacar la segunda de tres filas redibujaría la tercera encima de la
 *    segunda, perdiendo el foco y el texto a medio escribir. No puede ser
 *    el índice por exactamente eso.
 */
export interface PropuestaDeProceso {
  readonly clave: string;
  readonly tipoProcesoId: string;
  readonly titulo: string;
  /** Cadena vacía es «sin responsable»: es lo que manda un `<select>`. */
  readonly responsableId: string;
}

/**
 * La siembra: **una propuesta por cada línea con trámite**.
 *
 * ## Qué se siembra y qué no
 *
 * Las líneas sin `tipoProcesoId` no entran, y no son un caso raro ni un
 * dato faltante: son honorarios y gastos que no corresponden a ningún
 * expediente —una consulta, un timbre, la mensajería— y `0004` las declaró
 * el caso corriente al hacer la columna nullable. Es el mismo filtro que
 * hacía el servidor hasta T-13, trasladado entero.
 *
 * ## El título es el concepto de la línea, y no se pide de nuevo
 *
 * Es el texto que el abogado ya escribió para nombrar ese trabajo de cara
 * al cliente. Pedirle que lo escriba otra vez al abrir el proceso sería
 * pedirle dos nombres para una cosa, y el día que no coincidan nadie sabría
 * cuál manda. Se puede reescribir fila por fila, que es el punto entero de
 * la tarea; lo que no se puede es llegar en blanco.
 *
 * ## El responsable nace vacío
 *
 * Ganar una cotización cierra una venta, no reparte trabajo. Repartirlo es
 * una decisión aparte, y acá se puede tomar —el desplegable está— sin que
 * sea un requisito: `proceso.responsable_id` es nullable desde `0003`.
 *
 * ## El orden
 *
 * Es el de la lista que llega, y la lista que llega es la de la cotización:
 * `GET /api/cotizaciones/{id}/lineas` la sirve con `ORDER BY orden`. No se
 * vuelve a ordenar acá, y la omisión es deliberada: un segundo criterio de
 * orden sobre la misma lista sería el que un día dice algo distinto del
 * primero, y ninguno de los dos podría llamarse «el orden de la
 * cotización».
 *
 * La lista que llega no se toca: puede ser estado de React.
 */
export function propuestaDeProcesos(
  lineas: readonly LineaDeCotizacion[],
): PropuestaDeProceso[] {
  return lineas
    .filter((linea) => linea.tipoProcesoId !== null)
    .map((linea) => ({
      // El identificador de la línea que la sembró. Es estable mientras la
      // fila viva, y no se puede repetir: dos filas de la propuesta nacidas
      // de la misma línea no existen.
      clave: linea.id,
      tipoProcesoId: linea.tipoProcesoId ?? "",
      titulo: linea.concepto,
      responsableId: "",
    }));
}

/**
 * Una fila en blanco, para «agregar uno que no estaba».
 *
 * Es el caso que el usuario pidió con todas las letras —«¿qué sucede si
 * como bufete no había visto este tipo de caso y en este momento quiero
 * crear este nuevo tipo de proceso?»— y el que vuelve útil al panel sobre
 * una cotización que ya abrió los suyos.
 *
 * La `clave` la pone quien llama y no esta función, porque la unicidad es
 * una propiedad de **la lista** y no de la fila: una función que la
 * generara sola tendría que llevar un contador propio, y ese contador
 * sobreviviría entre dos cotizaciones distintas.
 */
export function propuestaVacia(clave: string): PropuestaDeProceso {
  return { clave, tipoProcesoId: "", titulo: "", responsableId: "" };
}

/**
 * Lo que la propuesta tiene que cumplir antes de mandarse.
 *
 * Es **la segunda copia** de la validación, declarada como tal, igual que
 * `validarProceso` en el alta a mano: la que manda vive en
 * `worker/procesos/dominio.ts` y en los dos repositorios. Ésta avisa antes
 * de mandar, que es la diferencia entre un campo marcado al instante y una
 * ida y vuelta al servidor para enterarse de lo mismo.
 *
 * Las tres cosas que mira son las tres que el servidor rechaza con 422 sin
 * tocar la base: que haya al menos una fila, que cada una tenga tipo, y que
 * cada una tenga título. Lo que **no** mira —que el tipo sea de este bufete,
 * que el responsable exista— no se puede decidir acá y no se intenta: eso
 * es de quien tiene las filas.
 *
 * Las fallas llevan la posición delante del campo, con la misma forma que
 * el servidor usa en su respuesta, para que las dos listas se lean igual.
 */
export function validarPropuesta(
  filas: readonly PropuestaDeProceso[],
): FallaDeValidacion[] {
  if (filas.length === 0) {
    return [{ campo: "procesos", motivo: "sin_procesos_que_abrir" }];
  }

  const fallas: FallaDeValidacion[] = [];

  filas.forEach((fila, indice) => {
    if (fila.tipoProcesoId.trim() === "") {
      fallas.push({
        campo: `proceso-${String(indice)}.tipoProcesoId`,
        motivo: "tipo_proceso_requerido",
      });
    }
    if (fila.titulo.trim() === "") {
      fallas.push({
        campo: `proceso-${String(indice)}.titulo`,
        motivo: "titulo_requerido",
      });
    }
  });

  return fallas;
}

/**
 * De las filas de la pantalla al cuerpo de la petición.
 *
 * Es el borde donde la cadena vacía del `<select>` se vuelve el `null` del
 * contrato, y donde la `clave` se queda afuera: es identidad de pantalla y
 * no hay columna donde ponerla. El recorte va acá y no en cada control por
 * lo mismo que en `aPeticionDeProceso` del alta: un título con un espacio
 * al final no es un título distinto, y guardar los dos dejaría dos procesos
 * que se ven iguales en el listado.
 */
export function aAperturaDeProcesos(
  filas: readonly PropuestaDeProceso[],
): DatosDeProcesoPorAbrir[] {
  return filas.map((fila) => {
    const responsableId = fila.responsableId.trim();

    return {
      tipoProcesoId: fila.tipoProcesoId.trim(),
      titulo: fila.titulo.trim(),
      responsableId: responsableId === "" ? null : responsableId,
    };
  });
}

/** El rótulo del control que confirma la apertura. */
export const ROTULO_DE_ABRIR = "Abrir estos procesos";

/** El rótulo del control que agrega una fila en blanco. */
export const ROTULO_DE_AGREGAR_PROCESO = "Agregar otro proceso";

/**
 * Lo que el panel dice **antes** de que nazca nada, y es distinto según lo
 * que la cotización ya tenga.
 *
 * ## Dos estados, y la diferencia importa
 *
 *  - **La ganada que todavía no abrió ninguno** es el momento en que la
 *    pregunta es urgente: el encargo está vendido y el trabajo no tiene
 *    expediente. La propuesta aparece sembrada y a la vista, y el texto
 *    dice que es una sugerencia y qué se puede hacer con ella.
 *  - **La ganada que ya abrió procesos** es otra cosa. Volver a sembrar
 *    ofrecería lo que ya existe, que es ruido de la peor clase: invita a
 *    abrir dos veces lo mismo. Ahí el panel es un camino para **abrir
 *    otro**, arranca vacío, y el texto dice por qué.
 *
 * ## Por qué el texto nombra el paso extra
 *
 * Porque es la mitad del ejemplo del usuario —«crear una sociedad anónima
 * puede ser sólo crearla, o crearla y registrarla»— y la que el sistema ya
 * sabía hacer sin que se notara: los pasos de un proceso son editables,
 * `PUT /api/procesos/{id}/etapas` reemplaza el plan entero. Lo que faltaba
 * era que el sistema no impusiera la partición antes. Sin esta frase, quien
 * mira la propuesta ve dos filas y cree que fusionarlas pierde un paso.
 *
 * El criterio del texto es el mismo que el de `confirmacionDeEmitir`: que
 * diga qué pasa, no que pregunte si está seguro. La diferencia es que acá
 * **no hay confirmación aparte**, y tampoco hace falta: a diferencia de
 * emitir, lo que esto escribe se puede deshacer —un proceso recién abierto
 * se cierra—, y la lista a la vista ya es la revisión.
 */
export function textoDeAperturaDeProcesos(yaAbrio: boolean): string {
  if (yaAbrio) {
    return (
      "Esta cotización ya abrió los suyos, así que acá no se propone nada:" +
      " lo que sigue es para abrir uno más, si hace falta. Es el caso del" +
      " trámite que no estaba cotizado, o del tipo de proceso que el" +
      " catálogo todavía no tenía cuando se armó la propuesta."
    );
  }

  return (
    "Estos son los procesos que las líneas de esta cotización sugieren." +
    " Todavía no existe ninguno: se saca el que no corresponda, se le" +
    " cambia el tipo o el título, y se agrega el que falte. Dos líneas que" +
    " para el bufete son un solo expediente se fusionan sacando una y" +
    " renombrando la otra; el paso de más se le agrega después al plan del" +
    " proceso, que es editable."
  );
}

/**
 * Lo que el panel dice cuando no pudo sembrar nada porque las líneas no se
 * leyeron.
 *
 * Es el mismo criterio que separa el cero del fallo de red en
 * `textoDeProcesosAbiertos`, aplicado a la otra lectura: una propuesta
 * vacía porque la cotización no tiene trámites y una propuesta vacía porque
 * no se pudo leer nada se ven igual, y la primera es información mientras
 * la segunda es un hueco. El panel sigue sirviendo —se puede agregar una
 * fila a mano—, así que el texto lo dice en vez de esconder el control.
 */
export const AVISO_DE_LINEAS_NO_LEIDAS =
  "Las líneas de esta cotización no se pudieron leer ahora, así que no hay" +
  " nada sembrado. Se puede agregar un proceso a mano igual.";
