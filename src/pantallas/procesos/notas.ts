/**
 * Las notas de un proceso del lado del navegador: el borrador, el
 * desplegable de etapas y el resumen de la línea de tiempo. Sin React y sin
 * DOM.
 *
 * Una **nota es un hecho**: fechada, anclada a la etapa donde ocurrió, con
 * autor, e inmutable (`docs/diseno.md` §3). Eso cambia la forma del
 * formulario respecto de todos los demás de la aplicación: **no hay botón de
 * editar y no hay botón de borrar**, y la pantalla lo dice antes de que
 * alguien escriba, no después.
 *
 * **Ésta es la segunda copia de las reglas**, declarada como tal. La que
 * manda vive en `worker/notas/dominio.ts` y en su repositorio; ésta avisa
 * antes de mandar. Son dos copias con pruebas propias cada una, igual que en
 * T-5, T-6 y T-7: aflojar una tiene que matar sus pruebas y no las de la
 * otra.
 */

import type {
  DatosDeNota,
  EtapaDeProceso,
  FallaDeValidacion,
  TramoDeLineaDeTiempo,
} from "../../../worker/contract";

export interface BorradorDeNota {
  texto: string;
  /**
   * Cadena vacía es «la que el servidor elija»: es lo que manda un `<select>`
   * que quedó en su opción por defecto.
   */
  procesoEtapaId: string;
}

export const BORRADOR_DE_NOTA_VACIO: BorradorDeNota = {
  texto: "",
  procesoEtapaId: "",
};

/**
 * Lo que hay que decir **antes** de escribir, no después.
 *
 * Una nota es el único dato de la aplicación que no se puede corregir. En
 * una pantalla donde todo lo demás se edita, suponer lo mismo de esto es lo
 * natural, y el momento de enterarse no puede ser cuando ya está escrito.
 *
 * Vive acá, como constante exportada, para que su contenido se pueda afirmar
 * en una prueba en vez de quedar enterrado en un `.tsx`.
 */
export const AVISO_NOTA_INMUTABLE =
  "Una nota no se edita ni se borra, ni desde acá ni desde ningún lado: es" +
  " el registro de un hecho y queda firmada con quien la escribió y cuándo." +
  " Si algo cambia después, se anota de nuevo.";

/**
 * La etapa que una nota toma por defecto: la **vigente**.
 *
 * Es la misma definición que el listado usa para «lo que viene» —la primera
 * pendiente en el orden del plan—, con una cola que acá hace falta: si no
 * queda ninguna pendiente, la última alcanzada, porque una nota tiene que
 * colgar de algo igual. `null` solo cuando el proceso no tiene plan.
 *
 * El arreglo que llega **se ordena acá**: puede venir en cualquier orden, y
 * «la primera pendiente» sin orden no quiere decir nada.
 */
export function etapaVigenteDe(
  etapas: readonly EtapaDeProceso[],
): EtapaDeProceso | null {
  if (etapas.length === 0) return null;

  const ordenadas = [...etapas].sort((a, b) => a.orden - b.orden);

  return (
    ordenadas.find((etapa) => etapa.alcanzadaEn === null) ??
    ordenadas[ordenadas.length - 1]
  );
}

/**
 * El plan entero como opciones de un desplegable, numeradas y con su estado.
 *
 * Se ofrecen **todas**, cumplidas incluidas, porque una nota se escribe a
 * veces días después del hecho y la etapa donde ocurrió ya puede estar
 * cumplida. Como la nota es inmutable, el momento de elegir es el único que
 * hay.
 *
 * El número va adelante porque dos etapas pueden llamarse parecido, y el
 * estado detrás porque es lo que distingue «donde está el trabajo» de «lo
 * que ya pasó».
 */
export function opcionesDeEtapa(
  etapas: readonly EtapaDeProceso[],
): { id: string; etiqueta: string }[] {
  const vigente = etapaVigenteDe(etapas);

  return [...etapas]
    .sort((a, b) => a.orden - b.orden)
    .map((etapa, indice) => {
      const estado =
        etapa.id === vigente?.id
          ? "etapa vigente"
          : etapa.alcanzadaEn === null
            ? "pendiente"
            : "cumplida";

      return {
        id: etapa.id,
        etiqueta: `${String(indice + 1)}. ${etapa.nombre} · ${estado}`,
      };
    });
}

export function validarNota(
  borrador: BorradorDeNota,
  etapas: readonly EtapaDeProceso[],
): FallaDeValidacion[] {
  const fallas: FallaDeValidacion[] = [];

  if (borrador.texto.trim() === "") {
    fallas.push({ campo: "texto", motivo: "texto_requerido" });
  }

  // `nota.proceso_etapa_id` es `NOT NULL`: sin plan no hay de dónde colgar.
  if (etapas.length === 0) {
    fallas.push({ campo: "procesoEtapaId", motivo: "proceso_sin_etapas" });
    return fallas;
  }

  const elegida = borrador.procesoEtapaId.trim();
  if (elegida !== "" && !etapas.some((etapa) => etapa.id === elegida)) {
    fallas.push({ campo: "procesoEtapaId", motivo: "etapa_de_otro_proceso" });
  }

  return fallas;
}

/**
 * El envío: el texto y, si alguien la eligió, la etapa.
 *
 * Se recortan **los bordes y nada más**: adentro los saltos de línea son del
 * autor y se leen tal cual. Ni el momento ni la autoría viajan: los pone el
 * servidor con el reloj y con la identidad de Access (I-6).
 */
export function aPeticionDeNota(borrador: BorradorDeNota): DatosDeNota {
  const procesoEtapaId = borrador.procesoEtapaId.trim();

  return {
    texto: borrador.texto.trim(),
    procesoEtapaId: procesoEtapaId === "" ? null : procesoEtapaId,
  };
}

export function totalDeNotas(
  tramos: readonly TramoDeLineaDeTiempo[],
): number {
  return tramos.reduce((suma, tramo) => suma + tramo.notas.length, 0);
}

/**
 * Qué hay en la línea de tiempo, dicho en números antes de leerla.
 *
 * Importa el reparto y no solo el total: cuarenta notas en una sola etapa y
 * cuarenta repartidas en diez son dos procesos distintos.
 */
export function resumenDeLaLinea(
  tramos: readonly TramoDeLineaDeTiempo[],
): string {
  const notas = totalDeNotas(tramos);
  if (notas === 0) return "Todavía no hay ninguna nota en este proceso.";
  if (notas === 1) return "1 nota, anclada a 1 etapa del plan.";
  if (tramos.length === 1) {
    return `${String(notas)} notas, todas en la misma etapa.`;
  }

  return `${String(notas)} notas, repartidas en ${String(
    tramos.length,
  )} etapas.`;
}
