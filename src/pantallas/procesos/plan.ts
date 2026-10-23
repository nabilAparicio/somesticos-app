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
