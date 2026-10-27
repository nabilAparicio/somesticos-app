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

import type { PlantillaDeModulo } from "../../../worker/contract";
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
export const EXPLICACION_DE_LA_PANTALLA =
  "Los seis módulos con los que se arma una propuesta, ya configurados. El" +
  " rótulo es el encabezado que lee el cliente; la descripción es lo que lee" +
  " el asistente para entender de qué trata el módulo cuando redacta.";

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
 * **No hay una tercera variante**, al revés que `OrigenDelPrecio`, que tiene
 * `sin_precio` para los 74 rubros del acuerdo. Acá no puede haberla: los dos
 * `CHECK` de `0016` —`la_plantilla_tiene_rotulo_vigente` y
 * `la_plantilla_tiene_descripcion_vigente`— garantizan que toda plantilla
 * guardada tiene las dos cosas, así que «no hay nada que mostrar» es un estado
 * que la base niega. Inventarlo obligaría a la pantalla a decidir qué dibujar
 * en un caso inalcanzable.
 */
export type OrigenDelTexto = "bufete" | "preestablecido";

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
    origen: plantilla.rotulo !== null ? "bufete" : "preestablecido",
  };
}

export function descripcionALaVista(
  plantilla: PlantillaDeModulo,
): TextoALaVista {
  return {
    valor: plantilla.descripcionVigente,
    origen: plantilla.descripcion !== null ? "bufete" : "preestablecido",
  };
}

/** Si alguna plantilla de la lista lleva marca. Decide si la leyenda se dibuja. */
export function hayEditadas(
  plantillas: readonly PlantillaDeModulo[],
): boolean {
  return plantillas.some(
    (plantilla) => plantilla.rotulo !== null || plantilla.descripcion !== null,
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
