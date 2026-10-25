/**
 * La bitácora, dicha para quien está mirando la pantalla (T-10).
 *
 * El mapa vive en un módulo propio y no dentro de una pantalla por lo mismo
 * que `src/mensajes.ts`: el vocabulario de la bitácora es uno solo para todo
 * el sistema (`worker/contract.ts`), y `AccionDeBitacora` es exhaustivo. El
 * día que el Worker agregue una acción, este `Record` **deja de compilar**
 * hasta que alguien escriba cómo se dice. Esa es toda la gracia — que no se
 * pueda agregar un hecho sin su frase y descubrirlo en producción como una
 * línea en blanco en el único registro que existe para no mentir.
 *
 * Sin DOM y sin React: son funciones de datos a texto, y adentro de un
 * `.tsx` solo se pueden probar montando un navegador para leer lo que ya era
 * una cadena. T-17 sumó la aritmética de la paginación —qué trae el control
 * de «ver más viejos», qué queda afuera— por el mismo argumento: son
 * cuentas, y una cuenta se prueba sin navegador.
 *
 * Lo que **no** entró acá es la petición. `test/tsconfig.json` lista este
 * archivo entre los módulos puros y no lista `src/api/peticiones.ts`, que es
 * la forma que tiene el proyecto de decir que acá no se hacen llamadas.
 * Quien pide es quien ya pedía: el `api.ts` de cada pantalla para la primera
 * página, y `src/pantallas/Bitacora.tsx` para las siguientes. Los dos arman
 * la dirección y desenvuelven la respuesta con las dos funciones de abajo,
 * así que la forma de la página se decide en un solo lugar aunque se pida
 * desde cuatro.
 */

import {
  LIMITE_DE_BITACORA_POR_DEFECTO,
  TECHO_DEL_LIMITE_DE_BITACORA,
  type AccionDeBitacora,
  type EntradaDeBitacora,
  type RespuestaDeBitacora,
} from "../worker/contract";

/**
 * El verbo de cada acción, en tercera persona y en pasado.
 *
 * Son verbos y no frases completas porque el sujeto siempre es la persona y
 * el objeto siempre es `detalle`: «Itzel **avanzó a** «Demanda
 * presentada»». Escribir la frase entera por acción haría doce copias de la
 * misma plantilla, y la treceava saldría distinta.
 *
 * Cada verbo tiene que distinguirse de los demás: dos acciones que se leen
 * igual son dos acciones que no contestan «¿quién hizo esto?», y la
 * distinción que el vocabulario cerrado protege se perdería acá, en el
 * último metro.
 */
export const VERBOS_DE_BITACORA: Record<AccionDeBitacora, string> = {
  creado: "dio de alta",
  editado: "editó",
  dado_de_baja: "dio de baja",
  reactivado: "reactivó",
  borrado: "borró",
  plantilla_editada: "guardó la plantilla",
  plan_editado: "editó el plan",
  etapa_alcanzada: "avanzó a",
  cerrado: "cerró",
  reabierto: "reabrió",
  plantilla_guardada: "guardó el plan como la plantilla de",
  nota_agregada: "anotó en",
  pendiente_abierto: "abrió el pendiente",
  pendiente_cerrado: "cerró el pendiente",
  /* Los cuatro de los módulos de prosa (T-2 C). `detalle` lleva el rótulo
     del tipo —«Alcance», «Cláusulas»— salvo en el reordenamiento, que no
     nombra ninguno porque lo que se movió es la lista entera. */
  modulo_agregado: "agregó el módulo",
  modulo_editado: "editó el módulo",
  modulo_quitado: "quitó el módulo",
  modulos_reordenados: "reordenó los módulos",
  /* Los cuatro de las líneas de honorarios y gastos estimados (T-3 A).
     `detalle` lleva el **concepto** de la línea y no el rótulo de su clase:
     en una cotización hay seis honorarios y lo único que los distingue es lo
     que dice cada uno. El reordenamiento no nombra ninguno, igual que el de
     los módulos. */
  linea_agregada: "agregó la línea",
  linea_editada: "editó la línea",
  linea_quitada: "quitó la línea",
  lineas_reordenadas: "reordenó las líneas",
};

/**
 * Cómo se nombra a quien no se pudo resolver.
 *
 * `usuarioNombre` llega nulo si la fila de `usuario` cruzara la frontera del
 * tenant. Un hueco en blanco en un registro de auditoría se lee como si no
 * hubiera autor, y sí lo hay: la columna es `NOT NULL` (I-6).
 */
const AUTOR_SIN_NOMBRE = "Alguien del bufete";

/**
 * Un hecho, en una línea: quién, qué y sobre qué.
 *
 * Es exactamente la granularidad que pidió el usuario —«el 3 de marzo Itzel
 * movió este proceso a Demanda presentada»—. Sin valor anterior ni
 * posterior: un evento, no un diff. El momento no entra en la frase porque
 * la pantalla lo dibuja aparte, alineado, que es como se lee una historia.
 */
export function fraseDeBitacora(entrada: EntradaDeBitacora): string {
  const quien = entrada.usuarioNombre ?? AUTOR_SIN_NOMBRE;
  const verbo = VERBOS_DE_BITACORA[entrada.accion];

  return entrada.detalle === null
    ? `${quien} ${verbo}.`
    : `${quien} ${verbo} «${entrada.detalle}».`;
}

/* ==========================================================================
   Una página de bitácora (T-17)
   ========================================================================== */

/**
 * Lo que una pantalla tiene de la historia de una entidad.
 *
 * Es un registro llano a propósito: sin funciones adentro, sin promesas a
 * medio resolver. Cualquiera lo puede construir en una prueba y cualquiera
 * lo puede mirar en el depurador, que es lo que un objeto con una clausura
 * de continuación adentro no deja hacer.
 *
 * `total` es el dato que no se puede deducir: `entradas` trae a lo sumo
 * `limite` hechos —los más recientes—, así que `entradas.length` no dice
 * cuántos hay. Sin el total no se puede decir cuántos quedan escondidos, y
 * un «ver más» que no dice cuántos trae es un botón que no informa.
 *
 * `ruta` viaja con la página porque es de donde salió, y es por donde se
 * piden más. Guardarla acá es lo que deja que el componente traiga la
 * siguiente tanda sin que las cuatro pantallas que lo montan tengan que
 * pasarle, cada una, cómo se pide su propia historia.
 */
export interface PaginaDeBitacora {
  /** A lo sumo `limite` hechos, del más nuevo al más viejo. */
  readonly entradas: EntradaDeBitacora[];
  /** Cuántos hechos tiene la entidad, los dibujados y los de atrás. */
  readonly total: number;
  /** El tope con el que se pidió esta página. */
  readonly limite: number;
  /** La dirección de la que salió, sin la consulta. */
  readonly ruta: string;
}

/**
 * La dirección con la que se pide una página.
 *
 * El `?limite` va siempre escrito, también cuando vale lo que el servidor
 * usaría igual: una petición que dice lo que pide se lee en el panel de red
 * sin tener que ir a buscar cuál era el valor por omisión.
 */
export function direccionDeBitacora(ruta: string, limite: number): string {
  return `${ruta}?limite=${String(limite)}`;
}

/**
 * La respuesta del servidor, convertida en la página que la pantalla usa.
 *
 * Le pega `ruta` y `limite`, que son lo que el cable no trae y la pantalla
 * necesita para poder pedir la tanda siguiente.
 */
export function paginaDeBitacora(
  ruta: string,
  limite: number,
  respuesta: RespuestaDeBitacora,
): PaginaDeBitacora {
  return {
    entradas: respuesta.entradas,
    total: respuesta.total,
    limite,
    ruta,
  };
}

/** El control de «traer los más viejos», cuando hay algo que traer. */
export interface ControlDeMasViejos {
  /** Cuántos hechos agregaría. Nunca cero: sin nada que traer no hay control. */
  readonly cuantos: number;
  /** El tope con el que hay que volver a pedir. */
  readonly limite: number;
  /** Lo que dice el control, que incluye cuántos trae. */
  readonly rotulo: string;
}

/**
 * El control que trae la tanda siguiente, o `null` si no hay ninguna.
 *
 * Crece de a una página por vez y no de un salto hasta el final: quien abre
 * la pantalla para ver qué pasó la semana pasada no tiene por qué esperar
 * cuatrocientos hechos porque tocó un botón.
 *
 * Lo que promete está acotado por tres cosas a la vez —lo que falta, lo que
 * crece una página y lo que el servidor sirve—, y por eso el rótulo dice un
 * número calculado y no «ver más» a secas: el número tiene que ser el que
 * va a aparecer. Cuando la página ya llegó al techo del servidor, el
 * control desaparece en vez de prometer lo que la próxima petición no
 * traería; lo que queda afuera lo dice
 * `avisoDeHechosFueraDelAlcance`, que no lo disimula.
 */
export function controlDeMasViejos(
  pagina: PaginaDeBitacora,
): ControlDeMasViejos | null {
  const mostrados = pagina.entradas.length;
  const limite = Math.min(
    mostrados + LIMITE_DE_BITACORA_POR_DEFECTO,
    TECHO_DEL_LIMITE_DE_BITACORA,
  );
  const cuantos = Math.min(limite, pagina.total) - mostrados;

  if (cuantos <= 0) return null;

  return {
    cuantos,
    limite,
    rotulo:
      cuantos === 1
        ? "Ver 1 hecho más antiguo"
        : `Ver ${String(cuantos)} hechos más antiguos`,
  };
}

/**
 * Lo que hay que decir cuando el techo del servidor deja hechos afuera.
 *
 * `null` mientras no quede ninguno, que es el caso de todo lo que este
 * bufete tiene hoy. Existe igual porque la alternativa es que la pantalla
 * se quede callada: un «ver más» que desaparece sin explicación se lee como
 * «ya está todo», y eso sería falso. Nada de estimar — el número sale del
 * total que mandó el servidor.
 */
export function avisoDeHechosFueraDelAlcance(
  pagina: PaginaDeBitacora,
): string | null {
  const fuera = pagina.total - TECHO_DEL_LIMITE_DE_BITACORA;
  if (fuera <= 0) return null;

  return fuera === 1
    ? "Hay 1 hecho más antiguo que esta pantalla no alcanza a traer."
    : `Hay ${String(fuera)} hechos más antiguos que esta pantalla no` +
        " alcanza a traer.";
}

/**
 * Cuántos hechos hay, dicho para una persona.
 *
 * Cuenta **el total**, no lo que se dibujó. Antes de T-17 eran lo mismo y la
 * frase contaba la lista que recibía; con la página, esa misma frase diría
 * «20 hechos registrados» sobre una entidad que tiene cuatrocientos. Es
 * exactamente la clase de frase que caduca en silencio: sigue compilando,
 * sigue leyéndose bien y pasa a ser mentira.
 *
 * Y cuando la página esconde algo, lo dice en la misma frase: sin eso, la
 * lista de abajo y el número de arriba no coinciden y no hay forma de saber
 * por qué.
 */
export function resumenDeLaBitacora(pagina: PaginaDeBitacora): string {
  if (pagina.total === 0) return "Todavía no hay nada registrado.";

  const cuantos =
    pagina.total === 1 ? "1 hecho registrado" : `${String(pagina.total)} hechos registrados`;

  if (pagina.entradas.length >= pagina.total) return `${cuantos}.`;

  return (
    `${cuantos}; se muestran los ${String(pagina.entradas.length)} más` +
    " recientes."
  );
}

/**
 * Lo que hay que decir para que una bitácora corta no se lea como «acá no
 * pasó nada».
 *
 * **No hubo relleno retroactivo.** Lo que ocurrió antes de que existiera
 * este registro no está, y no se inventó: escribir hechos que nadie
 * presenció, en la única tabla del sistema que existe para no mentir, sería
 * peor que no tenerla. Se dice en vez de disimularse.
 *
 * Vive acá, como constante exportada, para que su contenido se pueda
 * afirmar en una prueba en vez de quedar enterrado en un `.tsx`. Es la misma
 * decisión que `AVISO_NOTA_INMUTABLE` en T-8.
 */
export const AVISO_BITACORA_SIN_RELLENO =
  "La bitácora empieza el día que se encendió: lo que pasó antes no está" +
  " acá, y no se rellenó con suposiciones. De acá en adelante, cada cosa" +
  " que alguien haga queda firmada con quién y cuándo.";
