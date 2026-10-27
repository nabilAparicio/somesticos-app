/**
 * El editor de módulos de prosa, sin React y sin DOM.
 *
 * Es el primo del borrador del plan de un proceso
 * (`src/pantallas/procesos/plan.ts`) y tiene la misma anatomía: una lista
 * que se agrega, se edita, se quita y se reordena, con todas las decisiones
 * acá afuera para que se prueben en el corredor del Worker y el `.tsx` no
 * decida nada.
 *
 * Y tiene **una diferencia que lo cambia todo**: allá el plan entero viaja
 * en un solo `PUT` al guardar; acá cada operación es su propia petición
 * porque la API tiene cuatro rutas de escritura, y las tiene para que la
 * bitácora pueda decir **cuál de las cuatro cosas pasó**
 * (`worker/cotizaciones/rutas.ts`). Un «guardar» que mandara la lista
 * entera aplastaría las cuatro preguntas en un solo hecho.
 *
 * ## El rótulo sale de la base, y la clave se importa
 *
 * Son dos cosas distintas y conviene no confundirlas (T-3 de
 * `odd/tasks/plantillas-de-modulo.md`):
 *
 *  - **El rótulo que se dibuja** sale de `GET /api/plantillas-modulo`, que es
 *    el catálogo que el abogado administra en `/catalogos/modulos`. Hasta T-2
 *    salía de un registro en código, y entonces renombrar un módulo no se veía
 *    en ninguna cotización. Las tres funciones de abajo son las que lo
 *    resuelven, y ninguna sabe ningún rótulo: lo reciben en una lista de filas.
 *  - **La clave que se valida** se importa de `worker/cotizaciones/modulos.ts`,
 *    que es la mitad acoplada del `CHECK` de
 *    `migrations/0004_cotizaciones.sql`. Una tercera copia en `src/` sería el
 *    defecto que esa migración existe para impedir: la pantalla ofrecería una
 *    clave que la base rechaza con un 500 que nadie puede leer.
 *
 * Cruzar la frontera está permitido por la misma razón que lo está para
 * `worker/db/momentos.ts`: ese módulo **no importa nada en tiempo de
 * ejecución** —sólo tipos de `worker/contract.ts`, que se borran al
 * compilar— así que no arrastra ni D1 ni HTTP al bundle del navegador, y la
 * flecha del proyecto va `src/` → `worker/` y nunca al revés. Está listado
 * en `tsconfig.app.json` por lo mismo que los otros dos.
 *
 * ## Esta validación no autoriza nada
 *
 * `normalizarBorradorDeModulo` es **la segunda copia** de las reglas de
 * `normalizarModulo` del Worker, igual que la del formulario de la
 * cotización lo es de las de `dominio.ts`. La que manda es la del servidor;
 * ésta existe para avisar antes de mandar. Son dos copias a propósito, con
 * pruebas propias cada una: aflojar una tiene que matar sus pruebas y no
 * las de la otra.
 *
 * Todo devuelve copias. Esto es estado de React: mutarlo es el defecto que
 * no se ve hasta que una pantalla deja de redibujarse.
 */

import type {
  DatosDeModulo,
  FallaDeValidacion,
  ModuloDeCotizacion,
  MotivoDeFalla,
  PlantillaDeModulo,
} from "../../../worker/contract";

/**
 * Re-exportado y no re-escrito, igual que `mensajeDeFalla`: las claves que esta
 * pantalla compara son **las mismas** que compara el servidor, y el día que
 * «qué claves cuentan» cambie —T-7 agrega plantillas propias— tiene que cambiar
 * en un lugar. Vive en `worker/cotizaciones/modulos.ts`, que es el archivo que
 * este módulo ya importaba para `esTipoDeModulo` antes de que T-6 lo borrara, y
 * que cumple la condición del `include` de `tsconfig.app.json`: ninguna
 * importación en tiempo de ejecución.
 */
export { clavesDePlantillas } from "../../../worker/cotizaciones/modulos";

export { mensajeDeFalla } from "../../mensajes";

/* ==========================================================================
   El rótulo de un módulo, que desde T-3 sale de una fila
   ========================================================================== */

/**
 * Lo que se le dice a la plantilla que el bufete retiró, dentro del
 * desplegable.
 *
 * Es un literal propio y **no** el `ETIQUETA_DE_BAJA` de
 * `src/pantallas/catalogos/plantillas.ts`, aunque diga casi lo mismo, y el
 * motivo es gramatical y no de prolijidad: allá es un distintivo al lado de un
 * encabezado —una insignia— y acá es parte del texto de una `<option>`, que se
 * lee de corrido. «Alcance De baja» no es una frase.
 */
const SUFIJO_DE_BAJA = " (de baja)";

/**
 * El rótulo vigente de una clave, o la clave si el catálogo no la tiene.
 *
 * La reserva es la clave cruda y no una cadena vacía ni un `undefined`
 * disfrazado. Es inalcanzable, y el motivo que acá estaba escrito —«el `CHECK`
 * de `0004` permite seis claves y `0016` las sembró»— no existe desde T-5 y
 * T-6: lo que la vuelve inalcanzable hoy es que el `tipo` de un módulo **sale**
 * de `modulo_plantilla.clave` y el catálogo que esta función recibe es de esa
 * misma tabla, así que las dos listas no son dos. Y si algún día se alcanza
 * —el catálogo quedó viejo entre dos lecturas—, lo que se ve es `nota_cliente`
 * en un encabezado, que se entiende y se reporta. Es la misma salida que toman
 * el repositorio y `congelar`.
 */
export function rotuloDeModulo(
  plantillas: readonly PlantillaDeModulo[],
  tipo: string,
): string {
  const plantilla = plantillas.find((una) => una.clave === tipo);
  return plantilla?.rotuloVigente ?? tipo;
}

/** Una opción del desplegable de tipos. */
export interface OpcionDeTipo {
  readonly tipo: string;
  /** Ya con el sufijo de baja si hace falta: es lo que se dibuja tal cual. */
  readonly rotulo: string;
}

function aOpcion(plantilla: PlantillaDeModulo): OpcionDeTipo {
  return {
    tipo: plantilla.clave,
    rotulo: plantilla.activo
      ? plantilla.rotuloVigente
      : plantilla.rotuloVigente + SUFIJO_DE_BAJA,
  };
}

/**
 * Lo que se ofrece para un módulo **nuevo**: sólo las plantillas activas.
 *
 * Es la mitad visible de la baja. Dar de baja un módulo desde
 * `/catalogos/modulos` significa «dejen de usar esto», y un desplegable que lo
 * sigue ofreciendo convierte esa decisión en una sugerencia. El orden es el que
 * trae el servidor —`ORDER BY orden, clave`—, que es el orden en que el bufete
 * los puso.
 */
export function opcionesParaNuevo(
  plantillas: readonly PlantillaDeModulo[],
): OpcionDeTipo[] {
  return plantillas.filter((una) => una.activo).map(aOpcion);
}

/**
 * Lo que se ofrece para un módulo **que ya existe**: las activas, más la suya
 * si la retiraron.
 *
 * Ésta es la otra mitad de la baja, y es la que hubo que decidir con cuidado.
 * Un módulo escrito con una plantilla que después se dio de baja sigue
 * existiendo en su cotización, y su desplegable tiene que poder mostrar lo que
 * la fila dice. Con sólo las activas, un `<select value="exclusiones">` cuya
 * lista no incluye `exclusiones` **no deja el control vacío: deja puesta la
 * primera opción**, así que la pantalla afirmaría que ese módulo es de otro
 * tipo. Y como el formulario manda el juego completo, el primer «Guardar»
 * —hecho para corregir una coma del texto— le cambiaría el tipo al módulo sin
 * que nadie lo pidiera. Eso no es una sutileza de dibujo: es perder un dato.
 *
 * Así que la plantilla retirada aparece, **marcada**, y sólo en el módulo que
 * ya la usa: no se ofrece para uno nuevo y no aparece en los desplegables de
 * los demás módulos. Lo que se conserva es poder nombrar lo que ya está
 * escrito; lo que no se abre es poder volver a elegirlo.
 *
 * El `tipoActual` que no está en el catálogo —ninguna fila con esa clave—
 * también entra, con la clave cruda como rótulo. Es la misma rama inalcanzable
 * de `rotuloDeModulo`, y por el mismo motivo: mejor un desplegable que dice
 * una verdad fea que uno que dice una mentira prolija.
 */
export function opcionesParaModulo(
  plantillas: readonly PlantillaDeModulo[],
  tipoActual: string,
): OpcionDeTipo[] {
  const opciones = opcionesParaNuevo(plantillas);
  if (opciones.some((una) => una.tipo === tipoActual)) return opciones;

  const suya = plantillas.find((una) => una.clave === tipoActual);

  return [
    ...opciones,
    suya === undefined
      ? { tipo: tipoActual, rotulo: tipoActual + SUFIJO_DE_BAJA }
      : aOpcion(suya),
  ];
}

/**
 * Lo que se escribe en los dos controles de un módulo.
 *
 * `tipo` es `string`, y hasta T-6 el comentario de acá tenía que argumentar por
 * qué no era la unión: porque el desplegable arranca **vacío** en el alta, y
 * tiparlo estrecho obligaba a inventar un séptimo valor para «ninguno
 * todavía». El argumento ya no hace falta —la clave es `string` en todo el
 * sistema— pero la cadena vacía sigue significando eso, y
 * `BORRADOR_DE_MODULO_VACIO` sigue siendo un borrador que no pasa.
 */
export interface BorradorDeModulo {
  tipo: string;
  contenido: string;
}

/**
 * El alta arranca **sin tipo elegido**.
 *
 * Un desplegable que arranca en «Antecedentes» es el que hace guardar un
 * módulo de antecedentes donde alguien quería escribir el alcance, por el
 * mismo motivo por el que el cliente de la cotización tampoco viene
 * preelegido.
 */
export const BORRADOR_DE_MODULO_VACIO: BorradorDeModulo = {
  tipo: "",
  contenido: "",
};

/**
 * El texto de ayuda de la sección, acá y no dentro del `.tsx` por lo mismo
 * que `AVISO_PLAN_PROPIO`: así su contenido se puede afirmar en una prueba
 * en vez de quedar enterrado en un componente.
 */
export const AYUDA_DE_MODULOS =
  "Los módulos son la prosa de la propuesta, y el orden en que están acá es" +
  " el orden en que se van a leer. Cada cambio se guarda por su cuenta: no" +
  " hay un botón al final que confirme todo junto.";

/**
 * Lo que se dice cuando el servidor avisó que la lista en pantalla quedó
 * vieja **y la relectura que tenía que arreglarlo tampoco salió**.
 *
 * Es el peor de los estados posibles de esta pantalla y por eso tiene frase
 * propia: lo que se está mirando ya no es lo que hay guardado, y el editor
 * lo sabe. Callarlo —que es lo que hacía la primera versión, descartando en
 * silencio una relectura fallida— deja la lista vieja debajo de un mensaje
 * que dice que está vieja, sin que quien mira tenga cómo saber cuál de las
 * dos cosas creer.
 */
export const AVISO_SIN_RELECTURA =
  "Lo que está en pantalla ya no es lo que hay guardado y no se pudo volver" +
  " a leer la lista. Hasta que se relea, lo que se ve es de antes: conviene" +
  " no guiarse por el orden ni por lo que falta.";

/**
 * El texto de un error que **no** llegó como `Resultado`.
 *
 * `pedir` convierte en `Resultado` todo lo que sabe que puede pasar, pero
 * tiene un `await` sin red: el `respuesta.json()` del camino feliz. Un 200
 * con un cuerpo que no es JSON —un proxy que se mete en el medio, un
 * reinicio del servidor a mitad de la respuesta— hace que la promesa
 * **rechace**, y ninguna rama del editor pasa por ahí.
 *
 * Vive acá y no dentro del componente para que se pueda probar sin montar
 * un navegador, y espeja a `llamar` en `src/api/peticiones.ts`, que resuelve
 * lo mismo para el fallo de red.
 */
export function mensajeDeExcepcion(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Lo que se dice donde estarían los controles, sobre algo que ya se mandó. */
export const AVISO_MODULOS_CONGELADOS =
  "Los módulos de esta cotización se pueden leer pero no cambiar: son el" +
  " registro de lo que el cliente ya tiene.";

/**
 * Copia ordenada por `orden`. El arreglo que llega no se toca.
 *
 * El servidor ya los devuelve en orden, así que esto parece de más — y no
 * lo es: lo que la pantalla dibuja es la posición del arreglo, y el día que
 * una respuesta llegue mezclada por cualquier motivo, el editor movería un
 * módulo creyendo que mueve otro. Ordenar acá cuesta nada y hace que la
 * posición y el campo `orden` no puedan contradecirse.
 *
 * Quitar un módulo deja un hueco en `orden`, así que lo que se compara es
 * el número y nunca la distancia entre dos: lo que vale es el orden
 * relativo.
 */
export function modulosOrdenados(
  modulos: readonly ModuloDeCotizacion[],
): ModuloDeCotizacion[] {
  return [...modulos].sort((a, b) => a.orden - b.orden);
}

/**
 * Mueve un módulo un lugar arriba (`-1`) o abajo (`1`).
 *
 * Se niega fuera de los bordes, y esa guarda no es decorativa: sin ella,
 * subir el primero calcula el índice -1 y el intercambio deja la lista con
 * un hueco. Es el mismo borde que `moverPaso` defiende en el plan de un
 * proceso.
 *
 * Acá **no hay la tercera negativa** que sí tiene el plan —la de no meter
 * un paso pendiente delante de uno ya cumplido—, porque un módulo no tiene
 * historia: ninguno de los seis tipos es un hecho ocurrido, y el orden de
 * la prosa lo decide entero quien la escribe. Lo que sí hay es que todo
 * esto corre sólo sobre un borrador, y de eso se ocupa la pantalla.
 */
export function moverModulo(
  lista: readonly ModuloDeCotizacion[],
  indice: number,
  direccion: -1 | 1,
): ModuloDeCotizacion[] {
  const destino = indice + direccion;

  if (indice < 0 || indice >= lista.length) return [...lista];
  if (destino < 0 || destino >= lista.length) return [...lista];

  const movida = [...lista];
  [movida[indice], movida[destino]] = [movida[destino], movida[indice]];
  return movida;
}

/**
 * Los identificadores **en la posición del arreglo**, que es lo que viaja en
 * el `PUT` de la colección.
 *
 * Lee la posición y nunca el campo `orden`: el movimiento ya ocurrió en el
 * arreglo y todavía no en la base, así que el `orden` que cada módulo trae
 * es el viejo. Mandar ése sería mandar la lista sin mover.
 */
export function ordenDe(lista: readonly ModuloDeCotizacion[]): string[] {
  return lista.map((modulo) => modulo.id);
}

/**
 * Si dos listas de identificadores dicen lo mismo.
 *
 * Sirve para no mandar un `PUT` que ya se sabe que no cambia nada. El
 * servidor también lo corta —`reordenarModulos` se niega a registrar un
 * movimiento que no movió nada, porque una entrada de bitácora inventada es
 * peor que una petición de más—, así que esto no protege ningún invariante:
 * ahorra el viaje, y nada más.
 *
 * La **longitud se compara primero** y no es redundante: sin eso, una lista
 * que perdió su último módulo porque alguien lo quitó desde otra pestaña
 * coincidiría posición por posición con el prefijo de la otra y se leería
 * como «no cambió nada».
 */
export function mismoOrden(
  uno: readonly string[],
  otro: readonly string[],
): boolean {
  if (uno.length !== otro.length) return false;
  return uno.every((id, indice) => id === otro[indice]);
}

/** De un módulo guardado a lo que se edita en pantalla. */
export function borradorDesdeModulo(
  modulo: ModuloDeCotizacion,
): BorradorDeModulo {
  return { tipo: modulo.tipo, contenido: modulo.contenido };
}

export type ModuloNormalizado =
  | { ok: true; datos: DatosDeModulo }
  | { ok: false; fallas: FallaDeValidacion[] };

function falla(campo: string, motivo: MotivoDeFalla): FallaDeValidacion {
  return { campo, motivo };
}

/**
 * Del borrador a lo que se manda, o a la lista de por qué no.
 *
 * Devuelve **todas** las fallas y no la primera, igual que su gemela del
 * Worker: un formulario que corrige de a un error por envío es el
 * formulario que nadie usa.
 *
 * Ausente, en blanco e inventado caen en el mismo motivo por lo mismo que
 * allá: el tipo sale de un desplegable, así que las tres situaciones son el
 * mismo defecto desde donde está la persona.
 *
 * Lo que se comprueba es la **pertenencia al catálogo del bufete**, no que la
 * plantilla esté activa, y las dos mitades de esa frase son decisiones:
 *
 *  - *Pertenencia al catálogo* y no a una lista cerrada en código, que es el
 *    cambio de T-6: la lista de seis de `worker/cotizaciones/modulos.ts` y su
 *    guarda no existen más. Las claves llegan por parámetro —el editor ya
 *    tiene el catálogo cargado, porque sin él no sabe dibujar un solo rótulo—
 *    y esta función sigue pura y probada sin navegador.
 *  - *No que esté activa*, que ya era así: una plantilla de baja se puede
 *    seguir guardando en el módulo que ya la usa —ver `opcionesParaModulo`— y
 *    lo que impide elegirla de nuevo es qué ofrece el desplegable, no esta
 *    función. Rechazarla acá dejaría congelado todo módulo cuya plantilla se
 *    retiró: nadie podría corregirle una coma, porque el formulario manda el
 *    tipo junto con el texto. Por eso lo que se le pasa es
 *    `clavesDePlantillas` del catálogo **entero**, que es exactamente lo que
 *    recibe el servidor.
 *
 * Esta validación sigue sin autorizar nada: la que manda es la del Worker, que
 * compara contra las filas y no contra lo que la pantalla leyó hace un rato.
 */
export function normalizarBorradorDeModulo(
  borrador: BorradorDeModulo,
  clavesConocidas: readonly string[],
): ModuloNormalizado {
  const fallas: FallaDeValidacion[] = [];

  const tipo = borrador.tipo;
  if (!clavesConocidas.includes(tipo)) {
    fallas.push(falla("tipo", "tipo_de_modulo_desconocido"));
  }

  // Se recorta al guardar, y por eso la comprobación es sobre el recorte: un
  // módulo con tres saltos de línea y nada más es un título sin nada debajo.
  const contenido = borrador.contenido.trim();
  if (contenido === "") {
    fallas.push(falla("contenido", "contenido_requerido"));
  }

  if (fallas.length > 0) return { ok: false, fallas };

  // Sin aserción de tipo, y la ausencia es el punto de T-6: `tipo` ya es
  // `string` y `DatosDeModulo.tipo` también, así que no hay nada que afirmarle
  // al compilador. Antes acá había un `as` que la guarda de arriba justificaba;
  // hoy no hay guarda que justificar porque no hay estrechamiento que hacer.
  return { ok: true, datos: { tipo, contenido } };
}

/**
 * Si el borrador dice algo distinto de lo que está guardado.
 *
 * El contenido se compara **recortado** porque recortado es como se va a
 * guardar: sin eso, apoyar la barra espaciadora deja el botón de guardar
 * encendido sobre una petición que no cambiaría una sola letra.
 */
export function hayCambioEnModulo(
  modulo: ModuloDeCotizacion,
  borrador: BorradorDeModulo,
): boolean {
  return (
    borrador.tipo !== modulo.tipo ||
    borrador.contenido.trim() !== modulo.contenido
  );
}

/** Los borradores abiertos, indexados por el módulo al que pertenecen. */
export type BorradoresAbiertos = Readonly<Record<string, BorradorDeModulo>>;

/**
 * Se queda con los borradores de los módulos que siguen existiendo.
 *
 * Después de cada escritura el servidor devuelve la lista entera, y puede
 * traer uno menos: el que se acaba de quitar, o el que quitó alguien desde
 * otra pestaña. Sin podar, su texto a medio escribir queda colgado en
 * memoria para siempre y, peor, reaparecería si el mismo identificador
 * volviera a la lista.
 *
 * Lo que **no** hace es tirar los borradores de los demás. Reordenar no
 * toca el contenido de nadie, y perder lo que alguien estaba escribiendo en
 * otro módulo por haber apretado una flecha sería pérdida de trabajo.
 */
export function podarBorradores(
  abiertos: BorradoresAbiertos,
  modulos: readonly ModuloDeCotizacion[],
): BorradoresAbiertos {
  const vivos = new Set(modulos.map((modulo) => modulo.id));

  return Object.fromEntries(
    Object.entries(abiertos).filter(([id]) => vivos.has(id)),
  );
}

/**
 * Los motivos que la persona **no puede arreglar escribiendo**, porque lo
 * que está mal es la lista que tiene en pantalla.
 *
 * Los dos dicen lo mismo desde dos lados: `orden_incompleto` es «la lista
 * que mandaste no son los módulos de esta cotización» y `modulo_desconocido`
 * es «ese de ahí ya no es de acá». En los dos casos lo que hay en pantalla
 * es mentira, y reintentar con lo mismo vuelve a fallar: lo útil es volver a
 * leer la lista del servidor, y eso es lo que la pantalla hace con esto.
 */
const OBLIGAN_A_RECARGAR: readonly MotivoDeFalla[] = [
  "orden_incompleto",
  "modulo_desconocido",
];

export function exigeRecarga(fallas: readonly FallaDeValidacion[]): boolean {
  return fallas.some((una) => OBLIGAN_A_RECARGAR.includes(una.motivo));
}
