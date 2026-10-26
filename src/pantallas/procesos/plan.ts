/**
 * El borrador del plan de trabajo de un proceso: agregar, quitar, renombrar y
 * reordenar pasos, sin React y sin DOM.
 *
 * Es el primo del borrador de plantilla de T-6 (`catalogos/plantilla.ts`),
 * con una diferencia que lo cambia todo: **acá los pasos tienen historia**.
 * Los que llevan `alcanzadaEn` ya ocurrieron, y lo que ocurrió no se borra ni
 * se mueve (`docs/diseno.md` §6: las notas se anclan a la etapa donde
 * pasaron y son inmutables, I-6).
 *
 * Por eso son dos módulos y no uno parametrizado: generalizarlos obligaría a
 * meter el concepto de «alcanzada» dentro del editor de plantillas, donde no
 * existe, y a que cada operación preguntara si está en el modo que la
 * protege. El editor de plantillas no tiene nada que proteger.
 *
 * **Ésta es la copia de la guarda que vive en el navegador.** La que manda
 * está en `worker/procesos/repositorio.ts`, y es la que se afloja en la
 * prueba de mutación. Son dos copias declaradas, con pruebas propias cada
 * una, igual que la validación del formulario de cliente en T-5: la del
 * navegador avisa, la del servidor autoriza.
 *
 * Todo devuelve copias. Esto es estado de React: mutarlo es el defecto que no
 * se ve hasta que una pantalla deja de redibujarse.
 */

import type {
  DatosDeEtapa,
  EtapaDeProceso,
  FallaDeValidacion,
} from "../../../worker/contract";
import { fechaLegible } from "../../formatos";

/** Sin `id` es un paso nuevo; el servidor se lo pone al guardar. */
export interface PasoDelPlan {
  id: string | null;
  nombre: string;
  /** El momento en que se cumplió, o `null` si todavía falta. */
  alcanzadaEn: string | null;
}

/**
 * La contracara del aviso de T-6, en la pantalla contraria.
 *
 * Allá se dice que editar la plantilla no toca los procesos abiertos; acá se
 * dice que este plan es del proceso. Las dos mitades de «la plantilla
 * siembra, el proceso manda» tienen que estar escritas donde alguien las va a
 * leer, no en un manual.
 *
 * Vive acá, como constante exportada, para que su contenido se pueda afirmar
 * en una prueba en vez de quedar enterrado en un `.tsx`.
 */
export const AVISO_PLAN_PROPIO =
  "Este plan es de este proceso: se copió de la plantilla al abrirlo y" +
  " cambiarlo no toca la plantilla ni los demás procesos. Las etapas" +
  " cumplidas no se quitan ni se mueven, porque son el registro de lo que" +
  " ya pasó.";

/**
 * Los nombres de etapa son **texto de cara al cliente** desde hoy
 * (`docs/diseno.md` §6, «Una consecuencia futura que obliga hoy»): más
 * adelante se van a exponer por un enlace, y renombrarlos a mano en todos los
 * procesos vivos es el trabajo que este aviso evita.
 */
export const AYUDA_DE_CARA_AL_CLIENTE =
  "Los nombres de etapa los va a leer el cliente: se escriben para alguien" +
  " de afuera del bufete, sin jerga ni abreviaturas de apuro.";

export function esAlcanzado(paso: PasoDelPlan): boolean {
  return paso.alcanzadaEn !== null;
}

export function planDe(etapas: readonly EtapaDeProceso[]): PasoDelPlan[] {
  return [...etapas]
    .sort((a, b) => a.orden - b.orden)
    .map((etapa) => ({
      id: etapa.id,
      nombre: etapa.nombre,
      alcanzadaEn: etapa.alcanzadaEn,
    }));
}

/**
 * Lo cumplido y lo que falta, separados.
 *
 * «Lo que viene» es la mitad del valor de esta pantalla: el abogado abre un
 * proceso para ver qué tiene por delante, no solo dónde quedó. Que el cálculo
 * sea una función y no un `filter` dentro del `.tsx` es lo que deja probarlo
 * sin montar un navegador.
 *
 * **Desde T-2 la pantalla ya no dibuja estas dos listas**: los pasos están en
 * una sola, en orden, cada uno con su estado. Lo que esta función sigue
 * sirviendo es lo que se lee **del plan guardado y no del borrador**: cuál es
 * la próxima etapa que `POST /avanzar` va a marcar, y cuántos pasos cumplidos
 * cuenta el resumen de «guardar como plantilla». Las dos preguntas son sobre
 * lo que está en la base, así que se le hacen a `detalle.etapas` y nunca al
 * borrador que se está editando en pantalla.
 */
export function separarPlan(etapas: readonly EtapaDeProceso[]): {
  cumplidas: EtapaDeProceso[];
  pendientes: EtapaDeProceso[];
} {
  const ordenadas = [...etapas].sort((a, b) => a.orden - b.orden);

  return {
    cumplidas: ordenadas.filter((etapa) => etapa.alcanzadaEn !== null),
    pendientes: ordenadas.filter((etapa) => etapa.alcanzadaEn === null),
  };
}

/**
 * Un paso nuevo va **al final**, que es el único lugar donde no se mete
 * delante de algo que ya pasó. Un paso en blanco no es un paso: no se agrega.
 */
export function agregarPaso(
  lista: readonly PasoDelPlan[],
  nombre: string,
): PasoDelPlan[] {
  const limpio = nombre.trim();
  if (limpio === "") return [...lista];

  return [...lista, { id: null, nombre: limpio, alcanzadaEn: null }];
}

/** Se quita un paso pendiente; uno alcanzado se queda donde está. */
export function quitarPaso(
  lista: readonly PasoDelPlan[],
  indice: number,
): PasoDelPlan[] {
  const paso = lista[indice];
  if (paso === undefined || esAlcanzado(paso)) return [...lista];

  return lista.filter((_, posicion) => posicion !== indice);
}

/**
 * Renombrar **sí** se permite sobre un paso alcanzado.
 *
 * Es deliberado y es la frontera de la regla: el nombre es texto de cara al
 * cliente, y corregir una errata no borra el hecho ni deja ninguna nota
 * huérfana — `alcanzadaEn` se conserva intacto. Lo que la regla protege es la
 * existencia y el lugar del paso, no su redacción.
 */
export function renombrarPaso(
  lista: readonly PasoDelPlan[],
  indice: number,
  nombre: string,
): PasoDelPlan[] {
  return lista.map((paso, posicion) =>
    posicion === indice ? { ...paso, nombre } : paso,
  );
}

/**
 * Mueve un paso un lugar arriba (`-1`) o abajo (`1`).
 *
 * Se niega en tres casos, y los tres pasan de verdad:
 *
 *  - fuera de los bordes: sin esa guarda, subir el primero calcula el índice
 *    -1 y el plan pierde un paso en silencio;
 *  - si el que se mueve está alcanzado;
 *  - si el destino está alcanzado, porque eso metería un pendiente por
 *    delante de algo que ya pasó.
 */
export function moverPaso(
  lista: readonly PasoDelPlan[],
  indice: number,
  direccion: -1 | 1,
): PasoDelPlan[] {
  const destino = indice + direccion;

  if (indice < 0 || indice >= lista.length) return [...lista];
  if (destino < 0 || destino >= lista.length) return [...lista];
  if (esAlcanzado(lista[indice]) || esAlcanzado(lista[destino])) {
    return [...lista];
  }

  const movida = [...lista];
  [movida[indice], movida[destino]] = [movida[destino], movida[indice]];
  return movida;
}

/**
 * Un plan vacío es válido: un proceso sin pasos es legítimo —un tipo sin
 * plantilla abre uno así— y se le agregan sobre la marcha. Exigir al menos
 * uno sería inventar una regla que el diseño no pide.
 */
export function validarPlan(
  lista: readonly PasoDelPlan[],
): FallaDeValidacion[] {
  return lista.flatMap((paso, indice) =>
    paso.nombre.trim() === ""
      ? [
          {
            campo: `etapa-${String(indice)}`,
            motivo: "nombre_requerido" as const,
          },
        ]
      : [],
  );
}

/**
 * El envío: id y nombre, nada más.
 *
 * `alcanzadaEn` **no viaja**, y eso no es un olvido: el avance es de una sola
 * dirección, y un campo que el cliente pudiera mandar en nulo sería la puerta
 * trasera para desandar. El orden tampoco viaja: es la posición en el
 * arreglo, y lo asigna el servidor.
 */
export function aPeticionDePlan(
  lista: readonly PasoDelPlan[],
): DatosDeEtapa[] {
  return lista.map((paso) => ({ id: paso.id, nombre: paso.nombre.trim() }));
}

/* ==========================================================================
   T-2 · Una sola lista, y la frontera entre el borrador y lo guardado

   Al fundir «Cumplido», «Lo que falta» y «Plan de trabajo» en una lista,
   ver y editar pasan a ocurrir sobre los mismos renglones. Eso es lo que el
   usuario pidió —«es algo que pasa seguido y por ende debe estar integrado
   en el avance»— y es también lo que abre el conflicto que estas tres
   funciones existen para cerrar.
   ========================================================================== */

/**
 * La marca de un paso cumplido: que lo está, y desde cuándo, en un solo
 * texto.
 *
 * Antes eran dos cosas en dos listas: «Cumplido» mostraba la fecha y el
 * editor una etiqueta que decía «Cumplida». En una sola lista tienen que ser
 * un solo rótulo, porque si no el mismo renglón diría dos veces lo mismo con
 * dos redacciones distintas.
 *
 * Devuelve `null` —y no una cadena vacía ni un `VACIO`— cuando el paso
 * todavía falta: **la ausencia de marca es el estado pendiente**, y un nulo
 * obliga a quien la dibuje a decidir qué hace con él. Una cadena vacía se
 * cuela hasta la pantalla como un hueco sin que nadie se entere.
 */
export function marcaDeCumplida(paso: PasoDelPlan): string | null {
  if (paso.alcanzadaEn === null) return null;

  return `Cumplida el ${fechaLegible(paso.alcanzadaEn)}`;
}

/**
 * Si el borrador en pantalla dice algo distinto de lo que está guardado.
 *
 * Vivía dentro del `.tsx` como un `JSON.stringify` suelto. Vino acá porque
 * desde T-2 **decide una guarda y no sólo una etiqueta**: lo que antes
 * encendía el cartelito «Hay cambios sin guardar» ahora además apaga
 * «Avanzar», y una condición que puede marcar o no marcar una etapa como
 * cumplida tiene que poder probarse sin montar un navegador.
 *
 * Compara por `aPeticionDePlan`, que es exactamente lo que viaja en el
 * `PUT`: id, nombre recortado y la posición en el arreglo. Dos planes que
 * mandarían el mismo cuerpo **son** el mismo plan, así que un espacio al
 * final que el servidor va a recortar igual no cuenta como cambio sin
 * guardar; si contara, el botón quedaría apagado por una diferencia que no
 * existe del otro lado del cable.
 */
export function hayCambiosSinGuardar(
  borrador: readonly PasoDelPlan[],
  guardadas: readonly EtapaDeProceso[],
): boolean {
  return (
    JSON.stringify(aPeticionDePlan(borrador)) !==
    JSON.stringify(aPeticionDePlan(planDe(guardadas)))
  );
}

/**
 * Por qué «Avanzar» no se puede apretar con el plan a medio editar.
 *
 * **No es una molestia de interfaz, es corrección.** `POST /avanzar` marca
 * alcanzada *la próxima pendiente* del plan **guardado**, o sea que depende
 * del orden que hay en la base. El editor, en cambio, trabaja sobre un
 * borrador y recién lo persiste con `PUT /etapas`. Con las dos cosas en la
 * misma lista, la secuencia «reordeno, no guardo, avanzo» hace que el
 * servidor firme como cumplida **la etapa que estaba antes en esa
 * posición**: no es un renglón mal dibujado, es un hecho falso con fecha, y
 * el avance no se deshace.
 *
 * Esta guarda **no tiene gemela en el servidor**, y es la única del
 * proyecto que no la tiene. No es un olvido: el borrador existe sólo en este
 * navegador, así que no hay nada que el worker pueda mirar para saber que lo
 * que la persona ve no es lo que él tiene. Por eso se niega acá, y por eso
 * se prueba por rechazo.
 *
 * El rótulo sale siempre de la misma lectura que la decisión, para que el
 * botón y el motivo no puedan discrepar — y `proxima` es la del **plan
 * guardado**, porque es la etapa que el servidor va a marcar de verdad.
 */
export const AVISO_AVANZAR_SIN_GUARDAR =
  "Avanzar marca cumplida la próxima etapa del plan guardado, y este plan" +
  " tiene cambios que todavía no se guardaron. Con otro orden en pantalla" +
  " quedaría firmada como cumplida una etapa distinta de la que se está" +
  " mirando, con su fecha y sin forma de deshacerlo. Primero hay que" +
  " guardar el plan; después el botón vuelve.";

export interface AvanceDelPlan {
  /** Lo que dice el botón. */
  readonly rotulo: string;
  /** Si se puede apretar. */
  readonly habilitado: boolean;
  /** Por qué no se puede, cuando callarlo dejaría un botón apagado sin
   *  explicación. `null` cuando se puede, o cuando la razón ya está dicha
   *  en otro lado de la pantalla. */
  readonly impedimento: string | null;
}

export function avanceDelPlan(situacion: {
  /** La próxima etapa pendiente **del plan guardado**, o `null` si no hay. */
  readonly proxima: string | null;
  readonly cerrado: boolean;
  readonly sinGuardar: boolean;
  readonly trabajando: boolean;
}): AvanceDelPlan {
  const rotulo =
    situacion.proxima === null
      ? "Nada por avanzar"
      : `Avanzar a «${situacion.proxima}»`;

  /* El proceso cerrado va primero y **sin motivo propio**: la pantalla ya
     dibuja `avisoDeProcesoCerrado`, que nombra las tres prohibiciones y las
     dos salidas. Repetirlo acá sería un segundo cartel diciendo lo mismo. */
  if (situacion.cerrado) {
    return { rotulo, habilitado: false, impedimento: null };
  }

  /* Los cambios sin guardar ganan incluso sobre «nada por avanzar», y es a
     propósito: con un paso nuevo en el borrador, la persona está viendo en
     la lista algo por delante que el botón le niega. «Nada por avanzar» ahí
     sería cierto del plan guardado y falso de lo que tiene a la vista. */
  if (situacion.sinGuardar) {
    return {
      rotulo,
      habilitado: false,
      impedimento: AVISO_AVANZAR_SIN_GUARDAR,
    };
  }

  /* «Nada por avanzar» se explica solo en el rótulo, y la salida —agregar un
     paso— la dice el aviso de la lista. Y «trabajando» dura lo que dura una
     petición: un cartel que aparece y desaparece solo es ruido. */
  if (situacion.proxima === null || situacion.trabajando) {
    return { rotulo, habilitado: false, impedimento: null };
  }

  return { rotulo, habilitado: true, impedimento: null };
}
