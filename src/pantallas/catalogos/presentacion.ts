/**
 * Los derivados de presentación de los catálogos: lo que las listas muestran,
 * calculado una sola vez y probado.
 *
 * Sin DOM y sin React, por la misma razón que `src/ruteo.ts`: son funciones
 * de datos a texto, y adentro de un `.tsx` solo se pueden probar montando un
 * navegador para leer lo que ya era una cadena.
 */

import type { TipoProceso } from "../../../worker/contract";

/**
 * Comparador con las reglas del español: `Álvarez` antes que `ávila`, y `ñ`
 * después de `n`. Con `Array.prototype.sort()` crudo las mayúsculas y los
 * acentos se van todos al final.
 */
const ORDEN_ES = new Intl.Collator("es", { numeric: true });

/** Lo que se muestra donde no hay dato. El mismo guion que usa T-5. */
export const VACIO = "—";

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
