/**
 * El borrador de la plantilla de etapas: agregar, quitar, renombrar y
 * **reordenar**, sin React y sin DOM.
 *
 * Reordenar es la operación donde el esquema no ayuda. T-2 dejó
 * `etapa_plantilla.orden` sin índice único a propósito, porque en SQLite un
 * `UPDATE … SET orden = orden + 1` viola un único transitoriamente fila por
 * fila. La consecuencia es que **el orden lo sostiene el código**: acá el del
 * navegador, y en `worker/catalogos/repositorio.ts` el del servidor, que
 * reasigna el `orden` desde la posición en la lista y nunca desde lo que el
 * cliente diga. Las dos mitades tienen pruebas propias.
 *
 * Todo devuelve copias. Esto es estado de React: mutarlo es el defecto que no
 * se ve hasta que una pantalla deja de redibujarse.
 */

import type {
  DatosDeEtapa,
  EtapaPlantilla,
  FallaDeValidacion,
} from "../../../worker/contract";

/** Sin `id` es una etapa nueva; el servidor se lo pone al guardar. */
export interface BorradorDeEtapa {
  id: string | null;
  nombre: string;
}

/**
 * El aviso que el diseño exige **en la pantalla donde se edita la
 * plantilla**, no en un manual.
 *
 * «Editar una plantilla no altera los procesos ya abiertos. La plantilla es
 * un punto de partida, no un vínculo vivo. Eso es deliberado […] pero es
 * contraintuitivo, así que la interfaz lo dice en el lugar donde se edita la
 * plantilla, no en un manual que nadie lee» (`docs/diseno.md` §6, «Etapas:
 * plantilla y plan de trabajo»).
 *
 * Vive acá, como constante exportada, para que su contenido se pueda afirmar
 * en una prueba en vez de quedar enterrado en un `.tsx`.
 */
export const AVISO_PLANTILLA_NO_RETROACTIVA =
  "Editar esta plantilla no cambia los procesos ya abiertos. Las etapas se" +
  " copian al crear cada proceso, y desde ese momento cada proceso es dueño" +
  " de su propio plan: lo que se cambie acá vale para los procesos que se" +
  " abran de ahora en adelante.";

export function borradorDeEtapas(
  etapas: readonly EtapaPlantilla[],
): BorradorDeEtapa[] {
  return etapas.map((etapa) => ({ id: etapa.id, nombre: etapa.nombre }));
}

/** Una etapa en blanco no es una etapa: no se agrega. */
export function agregarEtapa(
  lista: readonly BorradorDeEtapa[],
  nombre: string,
): BorradorDeEtapa[] {
  const limpio = nombre.trim();
  if (limpio === "") return [...lista];

  return [...lista, { id: null, nombre: limpio }];
}

export function quitarEtapa(
  lista: readonly BorradorDeEtapa[],
  indice: number,
): BorradorDeEtapa[] {
  return lista.filter((_, posicion) => posicion !== indice);
}

export function renombrarEtapa(
  lista: readonly BorradorDeEtapa[],
  indice: number,
  nombre: string,
): BorradorDeEtapa[] {
  return lista.map((etapa, posicion) =>
    posicion === indice ? { ...etapa, nombre } : etapa,
  );
}

/**
 * Mueve una etapa un lugar arriba (`-1`) o abajo (`1`).
 *
 * Las guardas de borde no son ceremonia: sin ellas, subir la primera calcula
 * el índice -1 y `splice` saca la etapa del arreglo, de modo que la plantilla
 * pierde un paso en silencio. El caso existe de verdad — el botón «subir» de
 * la primera fila está ahí para que alguien lo apriete.
 */
export function moverEtapa(
  lista: readonly BorradorDeEtapa[],
  indice: number,
  direccion: -1 | 1,
): BorradorDeEtapa[] {
  const destino = indice + direccion;

  if (indice < 0 || indice >= lista.length) return [...lista];
  if (destino < 0 || destino >= lista.length) return [...lista];

  const movida = [...lista];
  [movida[indice], movida[destino]] = [movida[destino], movida[indice]];
  return movida;
}

/**
 * Una plantilla vacía es válida: un tipo de proceso sin plan por defecto es
 * legítimo, porque las etapas se pueden armar sobre el proceso. Exigir al
 * menos una sería inventar una regla que el diseño no pide.
 */
export function validarEtapas(
  lista: readonly BorradorDeEtapa[],
): FallaDeValidacion[] {
  return lista.flatMap((etapa, indice) =>
    etapa.nombre.trim() === ""
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
 * El orden es la posición en el arreglo. No viaja ningún número de orden: lo
 * asigna el servidor, que es el único que puede garantizar que no haya dos
 * etapas con el mismo.
 */
export function aPeticionDeEtapas(
  lista: readonly BorradorDeEtapa[],
): DatosDeEtapa[] {
  return lista.map((etapa) => ({ id: etapa.id, nombre: etapa.nombre.trim() }));
}
