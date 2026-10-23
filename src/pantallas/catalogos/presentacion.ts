/**
 * Los derivados de presentación de los catálogos: lo que las listas muestran,
 * calculado una sola vez y probado.
 *
 * Sin DOM y sin React, por la misma razón que `src/ruteo.ts`: son funciones
 * de datos a texto, y adentro de un `.tsx` solo se pueden probar montando un
 * navegador para leer lo que ya era una cadena.
 */

import type { TipoProceso } from "../../../worker/contract";
import { ORDEN_ES, VACIO } from "../../formatos";

/* Reexportado y no redefinido: el guion vive en `src/formatos.ts` (T-7). */
export { VACIO };

/**
 * El rótulo del grupo cuando el área no se pudo nombrar.
 *
 * `areaNombre` viene de un `LEFT JOIN` con el filtro de tenencia repetido, y
 * `tipo_proceso.area_id` es `NOT NULL`, así que en la práctica no debería
 * llegar nulo. Si llegara, el tipo no puede desaparecer de la pantalla sin
 * que nadie se entere: una fila invisible es peor que una fila rara.
 */
export const SIN_AREA = "Sin área";

/** Copia ordenada. El arreglo que llega no se toca: puede ser estado React. */
export function ordenarCatalogo<T extends { readonly nombre: string }>(
  filas: readonly T[],
): T[] {
  return [...filas].sort((a, b) => ORDEN_ES.compare(a.nombre, b.nombre));
}

/** La marca de vigencia, dicha en una palabra y sin género. */
export function estadoDe(activo: boolean): string {
  return activo ? "Vigente" : "De baja";
}

export interface GrupoDeArea {
  readonly areaId: string;
  readonly areaNombre: string;
  readonly tipos: TipoProceso[];
}

/**
 * Los tipos de proceso agrupados por su área, con las áreas ordenadas entre
 * sí y los tipos ordenados dentro de cada una.
 *
 * La pantalla los muestra agrupados porque el catálogo es granular a
 * propósito —una visa de trabajo y una de pensionado son tipos distintos
 * (`docs/diseno.md` §6)— y una lista plana de treinta tipos sin su rama del
 * derecho no se lee.
 */
export function agruparPorArea(
  tipos: readonly TipoProceso[],
): GrupoDeArea[] {
  const porArea = new Map<string, GrupoDeArea>();

  for (const tipo of tipos) {
    const grupo = porArea.get(tipo.areaId);
    if (grupo === undefined) {
      porArea.set(tipo.areaId, {
        areaId: tipo.areaId,
        areaNombre: tipo.areaNombre ?? SIN_AREA,
        tipos: [tipo],
      });
      continue;
    }
    grupo.tipos.push(tipo);
  }

  return [...porArea.values()]
    .sort((a, b) => ORDEN_ES.compare(a.areaNombre, b.areaNombre))
    .map((grupo) => ({ ...grupo, tipos: ordenarCatalogo(grupo.tipos) }));
}

/**
 * Qué fila queda con la historia abierta al tocar el botón de `id` (T-15).
 *
 * **De a una por vez**, y es una decisión, no una limitación técnica: cada
 * apertura es una petición —la bitácora se pide recién al abrirse— así que
 * treinta áreas desplegadas serían treinta peticiones, y una pared de texto
 * donde antes había una lista que se leía de un vistazo. La bitácora se
 * consulta de a una duda.
 *
 * Vive acá y no dentro del `.tsx` por lo mismo que el resto de este módulo:
 * es una función de datos a datos y adentro de un componente solo se podría
 * probar montando un navegador.
 */
export function alternarHistoria(
  abierta: string | null,
  id: string,
): string | null {
  return abierta === id ? null : id;
}
