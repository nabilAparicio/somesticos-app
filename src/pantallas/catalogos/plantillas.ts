/**
 * La lógica de la pantalla de plantillas de módulo (T-2 de
 * `odd/tasks/plantillas-de-modulo.md`), sin React y sin DOM.
 *
 * Misma frontera que el resto de los módulos de pantalla de este proyecto: lo
 * que se puede probar como función se escribe como función y vive en un `.ts`,
 * para que corra en el mismo corredor que la API en vez de exigir un navegador
 * para comparar cadenas. Lo que queda en el `.tsx` es el dibujo. Lo que
 * **solo** se puede ver dibujado —que ninguna fila muestre el preset al lado
 * del texto propio, que vaciar el campo devuelva el original— vive en
 * `e2e/plantillas.spec.ts`.
 *
 * ## La disciplina se hereda de `precios.ts`, y la pregunta es la misma
 *
 * Esta pantalla y la de precios resuelven el mismo problema sobre datos
 * distintos: hay un valor preestablecido y un valor del bufete, y hay que
 * mostrar **uno**. La corrección del usuario que fijó esa forma fue sobre un
 * monto:
 *
 * > «En lugar de siempre al lado, un tipo hipervínculo que te permita ver la
 * > tabla. Así no se siente que el sistema juzga tus precios, sino que el
 * > sistema sabe cuánto cuesta y te lo sugiere.»
 *
 * Y vale igual para un rótulo y para una descripción: con el preset al lado,
 * la pantalla sería una auditoría —cada vez que el abogado mira su texto, el
 * sistema le muestra el que traía puesto—. Lo que el sistema hace es **saber**
 * qué dice cada módulo y traerlo puesto; lo que el bufete escriba encima es
 * suyo.
 *
 * De ahí salen tres cosas que este archivo sostiene:
 *
 *  - `TextoALaVista` tiene **un** `valor` y un `origen`, y ningún campo donde
 *    quepa el preset. El tipo es la mitad del criterio; la otra la mide el
 *    punta a punta sobre el dibujo.
 *  - **La marca va sobre la excepción, nunca sobre la norma.** El asterisco
 *    marca el texto que el bufete editó, no el preestablecido:
 *
 *    > «Los preestablecidos son eso, preestablecidos: siempre pueden ser
 *    > editables, pero **son la norma hasta que se editen, no son una
 *    > subcategoría**.»
 *
 *    El literal se **importa** de `./precios` y no se copia: es la misma marca
 *    y tiene que leerse como la misma cosa en las tres pantallas que la
 *    dibujan. Dos literales idénticos son el par que se desincroniza el día
 *    que alguien cambie uno.
 *  - **Volver al preset es vaciar el campo**, y eso se dice una vez arriba y
 *    no en cada fila. Es la misma salida que `AYUDA_DEL_PRECIO_PROPIO` ya
 *    explicaba para el precio, y por el mismo motivo: un campo vacío que
 *    guarda un nulo no es obvio.
 *
 * ## Lo que esta pantalla agrega y la de precios no tenía
 *
 * **La descripción es la razón de ser de la tajada**, así que la pantalla dice
 * —una vez, y en una línea— que es lo que el asistente lee para entender el
 * módulo. Sin eso, el campo se lee como una nota interna y nadie lo escribe
 * con cuidado; con un párrafo de ayuda que se disculpe por el formulario, se
 * lee como un trámite. `src/pantallas/clientes/FormularioDeCliente.tsx` tiene
 * la regla de la casa: el rótulo dice lo que el campo exige.
 */

import type {
  FallaDeValidacion,
  PlantillaDeModulo,
} from "../../../worker/contract";
/*
 * La marca y su nombre accesible salen de `./precios`, que es donde viven para
 * las dos pantallas que ya las dibujan. Lo que **no** se importa es
 * `MARCA_DE_EDITADO_LEIDA`: su texto dice «precio editado por el bufete», y
 * acá lo editado no es un precio. Un nombre accesible que nombra la cosa
 * equivocada es peor que no tener ninguno.
 */
import { MARCA_DE_EDITADO } from "./precios";

export { MARCA_DE_EDITADO };

/* ==========================================================================
   Los textos. Están acá y no dentro del `.tsx` para que se puedan afirmar en
   una prueba en vez de quedar enterrados en un componente.
   ========================================================================== */

/** El encabezado de la pantalla. */
export const TITULO_DE_LA_PANTALLA = "Los módulos de una cotización";

/**
 * Qué es esta pantalla, en una línea.
 *
 * Dice **las dos cosas que cambian el comportamiento de quien la lee**: que
 * los seis vienen configurados —así el campo lleno no se lee como un dato que
 * alguien olvidó cambiar— y que la descripción es lo que el asistente lee.
 * Esa segunda es la tajada entera: sin ella, la descripción parece una nota
 * interna y se escribe como tal.
 *
 * No se disculpa por el formulario ni explica cómo funciona un campo de texto.
 */
/*
 * **Ya no dice «los seis»**, y es T-7 la que lo cambió: con el alta puesta, el
 * número deja de ser cierto en cuanto alguien agrega el séptimo, y un
 * encabezado que cuenta mal es el que hace dudar de todo lo demás. Lo que sí
 * sigue diciendo es que los de fábrica vienen configurados, que es la mitad
 * que evita leer un campo lleno como un olvido.
 */
export const EXPLICACION_DE_LA_PANTALLA =
  "Los módulos con los que se arma una propuesta. Los seis que vienen de" +
  " fábrica ya están configurados, y se pueden agregar los que el bufete" +
  " quiera. El rótulo es el encabezado que lee el cliente; la descripción es" +
  " lo que el asistente lee para entender de qué trata el módulo cuando" +
  " redacta.";

/** El nombre accesible de la marca, para quien no ve el asterisco. */
export const MARCA_EDITADA_LEIDA = "lo editó el bufete";

/**
 * Qué significa el asterisco, dicho una vez arriba de la lista.
 *
 * Tiene que estar porque una marca sin leyenda es un signo que obliga a
 * adivinar. Y tiene que decir **sólo** eso: no juzga el texto, no sugiere que
 * haya algo que revisar y no nombra ninguna mecánica de la pantalla. Las dos
 * palabras son las del usuario: editado y preestablecido.
 */
export const LEYENDA_DE_LA_MARCA =
  "El asterisco marca lo que el bufete editó. Lo demás es el texto" +
  " preestablecido, y es texto igual: se usa tal cual y se puede editar" +
  " encima.";

/**
 * Cómo se vuelve al preestablecido, dicho una vez arriba y no en cada módulo.
 *
 * Hace falta decirlo porque un campo vacío que **guarda un nulo** no es obvio,
 * y es la única forma de volver atrás después de haber escrito algo propio. La
 * alternativa era un segundo botón por campo, o sea doce botones más para una
 * operación que casi nadie va a hacer. Es la misma decisión que
 * `AYUDA_DEL_PRECIO_PROPIO` tomó para el precio.
 */
export const AYUDA_DEL_VUELTA_ATRAS =
  "Vaciar un campo y guardar vuelve a dejar a la vista el texto" +
  " preestablecido.";

/** El rótulo del campo del encabezado. Dice qué es y para quién. */
export const ROTULO_DEL_ROTULO = "Rótulo";

/** El rótulo del campo de la descripción. */
export const ROTULO_DE_LA_DESCRIPCION = "Descripción";

/**
 * El distintivo de una plantilla dada de baja.
 *
 * El mismo literal que los catálogos de T-6 usan, y por el mismo motivo: una
 * fila de baja se muestra marcada y no escondida, porque lo que ya la usa
 * tiene que poder seguir nombrándola.
 */
export const ETIQUETA_DE_BAJA = "De baja";

/**
 * El distintivo de una plantilla que el bufete creó (T-7).
 *
 * Dice **lo mecánico que importa y no quién la escribió**: que no tiene texto
 * preestablecido debajo, o sea que vaciar un campo no la devuelve a nada.
 * «Propia del bufete» habría sido más cálido y habría dicho menos: lo que
 * cambia el comportamiento de quien lo lee es que acá la salida de atrás no
 * existe.
 *
 * Usa **la palabra que la leyenda del asterisco ya enseñó** en vez de un
 * sinónimo nuevo: la pantalla ya le dijo a quien la lee qué es un
 * preestablecido, así que esto no lo explica otra vez.
 *
 * Es una `.etiqueta` y no una marca, al revés que el asterisco, y la
 * distinción es la que `layout.css` ya tiene escrita: una etiqueta es la forma
 * de un **estado** de la fila, y esto lo es —la fila no tiene preset—; la marca
 * dice de cuál de dos orígenes salió un texto, y acá no hay dos.
 */
export const ETIQUETA_SIN_PREESTABLECIDO = "Sin preestablecido";

/** Lo que se lee cuando el catálogo viene vacío, que no debería pasar. */
export const AVISO_SIN_PLANTILLAS =
  "No hay ningún módulo configurado. Los seis los siembra la migración" +
  " 0016, así que una lista vacía significa que la base no está al día.";

/* ==========================================================================
   El texto a la vista
   ========================================================================== */

/**
 * De quién es el texto que el campo muestra.
 *
 *  - `bufete`: lo escribió el bufete. Lleva la marca.
 *  - `preestablecido`: todavía no hay texto propio y lo que se ve es el que el
 *    sistema trae puesto. **No es un estado menor**: es la norma hasta que
 *    alguien lo edite, y por eso no lleva ninguna marca. El nombre es la
 *    palabra del usuario y no «sugerido», que es la que se fue del vocabulario
 *    de estas pantallas.
 *
 *  - `sin_preestablecido`: el texto es del bufete y **no hay ningún
 *    preestablecido debajo**, porque la plantilla entera la creó el bufete
 *    (T-7). Tampoco lleva marca, y el motivo es distinto del de arriba: la
 *    marca dice «el bufete escribió esto encima del preestablecido», y acá no
 *    hay nada encima de lo cual escribir. Marcarla sería afirmar una excepción
 *    sobre algo que no tiene norma.
 *
 * **La tercera variante es de T-7, y es la que `OrigenDelPrecio` ya tenía.**
 * La tajada 1 dijo que no podía haberla, y tenía razón con lo que existía
 * entonces: las seis sembradas tienen preset en las dos columnas, así que
 * `rotulo !== null` alcanzaba para decidir la marca. Lo que cambió no es el
 * razonamiento sino el dominio: desde el alta hay filas cuyo preset es NULL, y
 * en ellas «el bufete lo editó» es falso — nadie editó nada, la escribió
 * entera.
 *
 * Lo que **sigue** sin poder existir es «no hay nada que mostrar»: los dos
 * `CHECK` de `0016` —`la_plantilla_tiene_rotulo_vigente` y
 * `la_plantilla_tiene_descripcion_vigente`— garantizan que toda plantilla
 * guardada tiene valor vigente, venga del preset o del bufete. Ésa es la
 * diferencia con `sin_precio`, que sí es un «no hay nada»: los 74 rubros del
 * acuerdo no tienen ninguna cifra.
 *
 * Y es una variante del vocabulario y **no una rama en el componente**: con un
 * `if (rotuloOficial === null)` en el `.tsx`, la decisión de qué marca dibujar
 * viviría en dos lugares —acá el origen, allá la excepción— y uno de los dos
 * se quedaría viejo.
 */
export type OrigenDelTexto =
  | "bufete"
  | "preestablecido"
  | "sin_preestablecido";

/**
 * De quién es un texto, a partir del par propio/preestablecido.
 *
 * Una sola función para los dos campos, y el orden de las ramas es la regla:
 * sin texto propio, lo que se ve es el preestablecido —que es la norma—; con
 * texto propio y sin preset debajo, la plantilla es del bufete entera; con los
 * dos, es una edición encima de la norma, que es la única que lleva marca.
 */
function origenDe(
  propio: string | null,
  oficial: string | null,
): OrigenDelTexto {
  if (propio === null) return "preestablecido";
  return oficial === null ? "sin_preestablecido" : "bufete";
}

/**
 * El único texto de un campo.
 *
 * **No hay un segundo campo con el preset, y no es un olvido.** Ver el
 * encabezado de este archivo: si alguien agrega acá el preestablecido, la
 * prueba hostil de `test/plantillas-ui.spec.ts` que recorre los valores del
 * objeto se pone roja.
 */
export interface TextoALaVista {
  readonly valor: string;
  readonly origen: OrigenDelTexto;
}

/**
 * El texto que se ve, y de quién es.
 *
 * El orden de las ramas es la regla entera: primero lo que el bufete decidió,
 * después el preestablecido. Y el valor vigente **no se recalcula acá**: viene
 * resuelto del servidor en `rotuloVigente` y `descripcionVigente`, porque
 * `COALESCE` es una regla del sistema y dos implementaciones son dos que
 * algún día discrepan. Lo que esta función decide es el `origen`, que es lo
 * que la pantalla dibuja y lo único que no viaja por el cable.
 */
export function rotuloALaVista(plantilla: PlantillaDeModulo): TextoALaVista {
  return {
    valor: plantilla.rotuloVigente,
    origen: origenDe(plantilla.rotulo, plantilla.rotuloOficial),
  };
}

export function descripcionALaVista(
  plantilla: PlantillaDeModulo,
): TextoALaVista {
  return {
    valor: plantilla.descripcionVigente,
    origen: origenDe(plantilla.descripcion, plantilla.descripcionOficial),
  };
}

/**
 * Si alguna plantilla de la lista lleva marca. Decide si la leyenda se dibuja.
 *
 * Pregunta por **el origen** y no por la columna, y eso es de T-7: con
 * `rotulo !== null`, una plantilla propia del bufete —cuyo rótulo nunca es
 * nulo— encendía la leyenda sin que hubiera un solo asterisco en la página, y
 * una leyenda que explica un signo que no aparece manda a buscarlo. Pasando por
 * `rotuloALaVista`, la leyenda y la marca salen de la misma función y no pueden
 * discrepar por construcción.
 */
export function hayEditadas(
  plantillas: readonly PlantillaDeModulo[],
): boolean {
  return plantillas.some(
    (plantilla) =>
      rotuloALaVista(plantilla).origen === "bufete" ||
      descripcionALaVista(plantilla).origen === "bufete",
  );
}

/* ==========================================================================
   Los borradores y lo que se manda
   ========================================================================== */

/**
 * Lo que alguien tecleó encima de un módulo, mientras no lo guardó.
 *
 * Es un mapa por identificador y no un par de campos por fila en el estado,
 * por lo mismo que en la pantalla de precios: solo los módulos tocados tienen
 * borrador, y eso es además lo que decide **cuándo aparece el botón de
 * guardar**. Con el botón en los seis, la pantalla sería una columna de seis
 * botones apagados, y la única manera de apagarlos de a uno habría sido
 * comparar contra lo que se ve — que es justo lo que impediría adoptar el
 * preestablecido tal cual.
 *
 * El borrador lleva **los dos campos juntos** y no uno por clave, y la razón
 * es el `PUT`: el cuerpo manda el juego completo de lo editable, así que
 * guardar el rótulo sin el borrador de la descripción mandaría la descripción
 * tal como está guardada —que es lo correcto— pero tocar solo la descripción
 * no podría mandar el rótulo tecleado. Un borrador por campo obligaría a
 * reconstruir el par en el momento de guardar, en el componente y sin prueba.
 */
export interface BorradorDePlantilla {
  readonly rotulo: string;
  readonly descripcion: string;
}

export type BorradoresDePlantilla = Readonly<
  Record<string, BorradorDePlantilla>
>;

/**
 * El borrador de un módulo, o el que corresponde arrancar a partir de lo que
 * se ve.
 *
 * Arranca con el **valor vigente** y no vacío, y ahí está la mitad de la
 * promesa: el campo de un módulo sin texto propio muestra el preestablecido,
 * así que escribir encima parte de algo y no de una hoja en blanco. Es lo
 * mismo que la fila de precios hace con la sugerencia del acuerdo.
 */
export function borradorDe(
  borradores: BorradoresDePlantilla,
  plantilla: PlantillaDeModulo,
): BorradorDePlantilla {
  return (
    borradores[plantilla.id] ?? {
      rotulo: plantilla.rotuloVigente,
      descripcion: plantilla.descripcionVigente,
    }
  );
}

/**
 * Los borradores sin el de `id`, en una copia nueva.
 *
 * Es una función y no un `delete` adentro del componente por dos razones. La
 * primera es que el mapa **es estado de React** y mutarlo en el lugar sería un
 * cambio que no vuelve a renderizar. La segunda es que tirar el borrador
 * después de guardar es una decisión con consecuencia visible —es lo que hace
 * desaparecer el botón de guardar y lo que deja a la vista lo que contestó el
 * servidor en vez del texto viejo— y acá tiene prueba.
 */
export function sinBorrador(
  borradores: BorradoresDePlantilla,
  id: string,
): BorradoresDePlantilla {
  const resto: Record<string, BorradorDePlantilla> = {};

  for (const [clave, borrador] of Object.entries(borradores)) {
    if (clave !== id) resto[clave] = borrador;
  }

  return resto;
}

function aNuloSiVacio(texto: string): string | null {
  const limpio = texto.trim();
  return limpio === "" ? null : limpio;
}

/**
 * El valor que va a la columna propia de un campo, a partir de lo tecleado.
 *
 * ## Dos reglas, y las dos devuelven NULL
 *
 * **1. Un campo vacío es «uso el preestablecido».** Es la regla que carga con
 * la tajada: vaciar el campo es la única forma de volver atrás, y es lo que
 * hace que no haga falta ni un botón de «restaurar» ni una columna
 * «¿editado?» en la base. El recorte no es cosmético: sin él, un `"  "`
 * viajaría como texto, la base lo aceptaría —tres espacios no son nulos, así
 * que el `CHECK` de rótulo vigente pasa— y la hoja de la cotización dibujaría
 * un `<h2>` en blanco.
 *
 * **2. Escribir exactamente lo que ya se ve, sobre un campo que todavía usa el
 * preestablecido, tampoco es una decisión.** Ésta es propia de esta pantalla y
 * se descubrió manejándola: cada módulo tiene **dos** campos y el `PUT` manda
 * el juego completo, así que editar el rótulo manda también la descripción —y
 * la descripción, que nadie tocó, llegaba como texto del bufete—. Medido en el
 * navegador: cambiar el rótulo de «Alcance» aparecía marcando **dos** campos
 * como editados en vez de uno.
 *
 * Eso es un defecto y no una sutileza, por dos motivos:
 *
 *  - **La marca mentiría.** Dice «lo editó el bufete», y nadie editó esa
 *    descripción.
 *  - **La copia se queda vieja.** Un `descripcion` igual al
 *    `descripcion_oficial` deja de seguir al preestablecido: el día que una
 *    migración mejore la descripción que la IA lee, esa fila conservaría la
 *    vieja sin que nadie lo haya pedido. Con NULL, la sigue.
 *
 * ## Por qué esto no contradice a la pantalla de precios
 *
 * `hayCambioDePrecio` deja adoptar la sugerencia del acuerdo tal cual, y lo
 * dice con todas las letras: «guardarlo convierte una referencia en una
 * decisión del bufete». La diferencia es que **allá hay un solo campo por
 * fila**, así que escribir el valor que se ve solo puede ser un acto
 * deliberado — y además un monto propio igual al oficial sí significa algo: el
 * acuerdo es de 2001 y nunca se indexó, así que fijar hoy ese número es
 * decidir no subirlo. Un rótulo propio idéntico al preestablecido no dice
 * nada que el preestablecido no diga ya.
 *
 * ## Qué queda afuera, y es deliberado
 *
 * Esto es **sólo de la pantalla**. El servidor escribe lo que le mandan, y
 * tiene que hacerlo: un cliente que quiera guardar un rótulo propio idéntico
 * al preset tiene derecho, y `worker/plantillas/dominio.ts` no puede saber si
 * eso fue un gesto o un descuido. Es la misma relación que
 * `catalogos/formulario.ts` tiene con `worker/catalogos/dominio.ts`, con una
 * diferencia que conviene decir: acá la de abajo **no** respalda a la de
 * arriba, porque no hay nada ilegal que impedir. Es una decisión de
 * presentación con consecuencia en los datos, y por eso vive acá y tiene
 * prueba acá.
 */
function propioParaGuardar(
  tecleado: string,
  propioGuardado: string | null,
  vigente: string,
): string | null {
  const limpio = aNuloSiVacio(tecleado);
  if (limpio === null) return null;

  // Sólo cuando el campo **todavía** usa el preestablecido. Sobre un campo que
  // el bufete ya editó, reescribir el mismo texto es un no-op y `hayCambio` lo
  // apaga; convertirlo en NULL ahí sería devolverlo al preset sin que nadie lo
  // haya pedido.
  if (propioGuardado === null && limpio === vigente.trim()) return null;

  return limpio;
}

/** Lo que va en el cuerpo del `PUT`, a partir de lo tecleado. */
export function datosParaGuardar(
  plantilla: PlantillaDeModulo,
  borrador: BorradorDePlantilla,
  activo: boolean,
): { rotulo: string | null; descripcion: string | null; activo: boolean } {
  return {
    rotulo: propioParaGuardar(
      borrador.rotulo,
      plantilla.rotulo,
      plantilla.rotuloVigente,
    ),
    descripcion: propioParaGuardar(
      borrador.descripcion,
      plantilla.descripcion,
      plantilla.descripcionVigente,
    ),
    activo,
  };
}

/**
 * Si lo tecleado cambia **lo que el bufete guardó**.
 *
 * Se compara lo que iría a las columnas propias contra lo que hay en ellas, y
 * no el texto tecleado contra el texto a la vista. Así las dos reglas de
 * `propioParaGuardar` valen también acá sin repetirse: vaciar un campo que ya
 * estaba en el preestablecido no es un cambio, y reescribir el preestablecido
 * encima de sí mismo tampoco. Las dos serían un `PUT` que no cambia nada y una
 * entrada de bitácora de algo que no pasó.
 */
export function hayCambio(
  plantilla: PlantillaDeModulo,
  borrador: BorradorDePlantilla,
): boolean {
  const datos = datosParaGuardar(plantilla, borrador, plantilla.activo);

  return (
    datos.rotulo !== plantilla.rotulo ||
    datos.descripcion !== plantilla.descripcion
  );
}

/**
 * Qué campos quedarían **sin texto a la vista** si se guardara este borrador.
 *
 * Es la guarda de arriba de los dos `CHECK` de `0016`, y es la tercera mitad
 * de la misma regla: el `CHECK` es el que manda, el 409
 * `plantilla_sin_preset` de `worker/plantillas/rutas.ts` es el que deja
 * contestar en vez de caerse, y ésta es la que **avisa antes de mandar**. Es
 * la misma relación que `catalogos/formulario.ts` tiene con
 * `worker/catalogos/dominio.ts`.
 *
 * Devuelve los nombres de los campos de la pantalla —`rotulo`,
 * `descripcion`— en orden alfabético, para que el aviso se vea igual
 * independientemente de en qué orden alguien vació los campos.
 *
 * Hoy devuelve siempre la lista vacía sobre las seis filas sembradas, porque
 * las seis tienen preset en las dos columnas. Está escrita porque las dos
 * columnas del preset son nullable a propósito —la tajada 2 permite crear
 * plantillas propias, que nacen sin piso— y una pantalla que no lo contempla
 * manda un `PUT` que vuelve 409 sin que nada lo haya advertido.
 */
export function camposQueQuedarianVacios(
  plantilla: PlantillaDeModulo,
  borrador: BorradorDePlantilla,
): string[] {
  const datos = datosParaGuardar(plantilla, borrador, plantilla.activo);
  const campos: string[] = [];

  if (datos.descripcion === null && plantilla.descripcionOficial === null) {
    campos.push("descripcion");
  }
  if (datos.rotulo === null && plantilla.rotuloOficial === null) {
    campos.push("rotulo");
  }

  return campos;
}

/**
 * Si el borrador se puede guardar: cambia algo y no deja nada sin texto.
 *
 * Las dos condiciones en una función y no dos llamadas en el componente,
 * porque juntas son lo que decide si el botón está apretable, y esa decisión
 * tiene que tener una sola definición y una prueba.
 */
export function sePuedeGuardar(
  plantilla: PlantillaDeModulo,
  borrador: BorradorDePlantilla,
): boolean {
  return (
    hayCambio(plantilla, borrador) &&
    camposQueQuedarianVacios(plantilla, borrador).length === 0
  );
}

/**
 * El ancla de un módulo como identificador del documento.
 *
 * Se usa para colgar el rótulo accesible de cada sección de su encabezado y
 * para que los dos campos nombren el suyo. Es una función y no una plantilla
 * de texto repetida en cinco atributos por la misma razón que
 * `anclaDelRenglon`: cinco literales son cinco lugares donde el prefijo puede
 * discrepar y el `aria-labelledby` apunte a nada.
 */
export function anclaDeLaPlantilla(clave: string): string {
  return `modulo-${clave}`;
}

/* ==========================================================================
   El alta (T-7)

   Las palabras del usuario, mirando la pantalla de la tajada 1:

   > «No veo la opción de crear un módulo, sólo editar y dar de baja.»

   Era correcto y era el plan. El alta no podía estar antes porque
   `cotizacion_modulo.tipo` estaba cerrado por el `CHECK` de `0004`: una
   plantilla nueva habría sido una plantilla que esta pantalla ofrece y la base
   rechaza al guardar el primer módulo de una cotización. `0017` convirtió esa
   columna en una referencia a `modulo_plantilla`, y recién ahí el botón tiene
   sentido.

   ## Dónde vive el formulario, y es una decisión

   **Al final de la lista y siempre abierto.** Las tres alternativas eran
   arriba, detrás de un desplegable, y al final:

    - **Detrás de un desplegable, no.** La queja del usuario es literalmente
      que no veía la opción. Esconderla detrás de un control que hay que abrir
      es cómo vuelve a no verse, y el costo de tenerla abierta son dos campos
      vacíos al pie de una pantalla a la que se entra a leer.
    - **Arriba, tampoco.** A esta pantalla se entra a mirar y a corregir los
      módulos que ya están, no a agregar uno: poner el alta primero empuja el
      catálogo —que es lo que se vino a buscar— abajo de un formulario que casi
      nunca se usa.
    - **Al final, sí**, y lo que lo decide no es el descarte de los otros dos:
      es que `orden = MAX(orden) + 1`, así que **el módulo nuevo aparece
      justamente ahí**, donde estaba el formulario que lo creó. Es además lo
      que los dos catálogos planos de T-6 ya hacen con su fila de alta.

   Lo que cuesta, dicho en vez de callado: con veinte módulos, el alta queda
   veinte bloques abajo. Hoy son seis y el encabezado de la sección es
   navegable; el día que sean veinte, lo que hace falta no es mover el
   formulario sino que la lista se pueda recorrer, que es otra tarea.
   ========================================================================== */

/** El encabezado de la sección del alta. */
export const TITULO_DEL_ALTA = "Agregar un módulo";

/**
 * Qué hay que saber **antes** de llenar los dos campos.
 *
 * Dice las dos cosas que no se pueden deshacer desde la pantalla, y las dice
 * antes y no después:
 *
 *  - **El identificador sale del rótulo y no se cambia.** Es lo único de un
 *    módulo que se escribe una vez para siempre —`clave` es inmutable desde
 *    que nace—, así que enterarse después es enterarse tarde. Y dice que lo
 *    acuña el sistema, porque lo contrario es buscar el campo donde
 *    escribirlo.
 *  - **La descripción es obligatoria, y por qué.** No hay texto preestablecido
 *    debajo de un módulo nuevo, así que vaciarla no vuelve a nada. Es la
 *    asimetría con los seis de fábrica, y decirla acá es lo que evita que la
 *    persona la descubra como un rechazo.
 *
 * Va en el rótulo de la sección y no como ayuda al pie, que es la regla de la
 * casa de `src/pantallas/clientes/FormularioDeCliente.tsx`: «lo que hace que
 * alguien abandone un alta es creer que tiene que averiguar el RUC antes de
 * guardar». Acá es lo mismo al revés —lo que hace abandonar es enterarse de la
 * regla después de haberla violado—, y por eso ninguno de los dos campos lleva
 * marca de opcionalidad: no hay ninguno opcional.
 */
export const EXPLICACION_DEL_ALTA =
  "El rótulo y la descripción son los dos obligatorios. El identificador" +
  " interno del módulo lo acuña el sistema a partir del rótulo y no se puede" +
  " cambiar después, aunque el rótulo sí se corrija. Y la descripción no" +
  " puede quedar vacía: un módulo nuevo no trae texto preestablecido debajo," +
  " así que no hay a qué volver.";

/** El botón que cierra el alta. Dice el acto, no el mecanismo. */
export const ROTULO_DEL_BOTON_DE_ALTA = "Agregar";

/** Lo que alguien tecleó en el formulario del alta, mientras no lo mandó. */
export interface BorradorDeAlta {
  readonly rotulo: string;
  readonly descripcion: string;
}

/**
 * Los dos campos vacíos.
 *
 * **No lleva `activo`**, al revés que `BORRADOR_DE_CATALOGO_VACIO`: una
 * plantilla nace vigente y no hay control que lo decida. Un alta que pudiera
 * nacer dada de baja sería un alta a medias, y la columna que la retira ya
 * tiene su botón en el bloque de cada módulo.
 */
export const BORRADOR_DE_ALTA_VACIO: BorradorDeAlta = {
  rotulo: "",
  descripcion: "",
};

/**
 * Lo que va en el cuerpo del `POST`.
 *
 * Dos campos, recortados, y **ninguno es la clave**: la acuña el servidor a
 * partir del rótulo. El argumento de por qué esta capa no la calcula ni la
 * previsualiza está en `src/api/plantillas.ts`, y es el que separa una
 * validación duplicada de una acuñación duplicada: la primera puede ser más
 * laxa que la del servidor sin mentir, la segunda tendría que coincidir
 * carácter por carácter o la pantalla prometería un identificador que no es el
 * que va a quedar.
 */
export function aPeticionDeAlta(borrador: BorradorDeAlta): {
  rotulo: string;
  descripcion: string;
} {
  return {
    rotulo: borrador.rotulo.trim(),
    descripcion: borrador.descripcion.trim(),
  };
}

/**
 * Qué falta para que el alta se pueda mandar.
 *
 * **Esta validación no autoriza nada.** La que manda es la del Worker
 * —`revisarAltaDePlantilla` en `worker/plantillas/dominio.ts`—, que es la que
 * los dos `CHECK` de `0016` respaldan. Ésta existe para avisar antes de
 * mandar, y son dos copias a propósito con sus propias pruebas: aflojar una
 * tiene que matar sus pruebas y no las de la otra. Es la misma relación que
 * `catalogos/formulario.ts` tiene con `worker/catalogos/dominio.ts`.
 *
 * Devuelve **las dos fallas y no la primera**, por lo mismo que
 * `validarTipoProceso`: un formulario que corrige de a un error por envío es
 * el que hace que nadie cargue nada.
 *
 * Y los dos motivos son los del servidor, con sus frases en `src/mensajes.ts`:
 * así el aviso previo y el rechazo del cable dicen exactamente lo mismo, en
 * vez de dos frases que hay que mantener parecidas.
 */
export function validarAlta(borrador: BorradorDeAlta): FallaDeValidacion[] {
  const fallas: FallaDeValidacion[] = [];

  if (borrador.rotulo.trim() === "") {
    fallas.push({ campo: "rotulo", motivo: "rotulo_requerido" });
  }
  if (borrador.descripcion.trim() === "") {
    fallas.push({
      campo: "descripcion",
      motivo: "descripcion_de_modulo_requerida",
    });
  }

  return fallas;
}

/**
 * Si el alta se puede mandar.
 *
 * Sale de `validarAlta` y no de una segunda condición, porque el botón
 * apretable y la validación tienen que decidir lo mismo: con dos
 * definiciones, un día el botón estaría prendido sobre un borrador que la
 * validación rechaza, y la pantalla contestaría un aviso donde prometía una
 * escritura. Es lo mismo que `sePuedeGuardar` hace para la edición.
 */
export function sePuedeAgregar(borrador: BorradorDeAlta): boolean {
  return validarAlta(borrador).length === 0;
}
