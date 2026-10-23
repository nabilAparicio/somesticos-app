/**
 * «Guardar como plantilla», del lado del navegador: el borrador del destino
 * y los avisos que la pantalla tiene que decir. Sin React y sin DOM.
 *
 * El diseño señala este camino como **el que más se va a usar** para crear
 * una plantilla: se abre un proceso, se le acomodan los pasos sobre la
 * marcha, y cuando queda bien se guarda (`docs/diseno.md` §6, «Etapas:
 * plantilla y plan de trabajo»). No es administración; es el atajo del
 * trabajo diario, y por eso vive en la pantalla del proceso.
 *
 * **Esta validación no autoriza nada.** La que manda vive en
 * `worker/procesos/dominio.ts` y en `worker/procesos/plantilla.ts`. Ésta
 * avisa antes de mandar. Son dos copias declaradas, con pruebas propias cada
 * una, igual que en T-5, T-6 y T-7: aflojar una tiene que matar sus pruebas
 * y no las de la otra.
 */

import type {
  DatosDeGuardadoDePlantilla,
  FallaDeValidacion,
} from "../../../worker/contract";

export type DestinoDePlantilla = "actualizar" | "nuevo";

export interface BorradorDeGuardado {
  destino: DestinoDePlantilla;
  /** Cadena vacía es «sin elegir»: es lo que manda un `<select>`. */
  areaId: string;
  nombre: string;
  descripcion: string;
}

/**
 * Nace en «actualizar»: es el destino que no pide nada más y el que
 * corresponde al caso de todos los días —se ajustó el plan de un trámite que
 * ya tiene su tipo, y se quiere que la próxima vez salga así.
 */
export const BORRADOR_DE_GUARDADO_VACIO: BorradorDeGuardado = {
  destino: "actualizar",
  areaId: "",
  nombre: "",
  descripcion: "",
};

/**
 * El aviso que no puede faltar, y va **en el momento de confirmar**.
 *
 * «Editar una plantilla no altera los procesos ya abiertos […] es
 * contraintuitivo, así que la interfaz lo dice en el lugar donde se edita la
 * plantilla, no en un manual que nadie lee» (`docs/diseno.md` §6). Acá pesa
 * el doble: quien aprieta este botón acaba de ajustar un plan y lo está
 * «guardando», así que lo natural es creer que eso lo sincroniza todo —
 * empezando por el proceso que tiene delante.
 *
 * Vive acá, como constante exportada, para que su contenido se pueda afirmar
 * en una prueba en vez de quedar enterrado en un `.tsx`.
 */
export const AVISO_GUARDAR_NO_SINCRONIZA =
  "Guardar la plantilla no cambia los procesos ya abiertos de este tipo, ni" +
  " siquiera éste: cada proceso es dueño de su propio plan desde que se" +
  " abrió. Lo que se guarda acá vale para los procesos que se abran de" +
  " ahora en adelante.";

/**
 * La decisión de T-11, dicha donde se toma: un tipo de proceso nuevo no se
 * lleva al proceso de origen. Reasignarlo sería exactamente lo que el aviso
 * de arriba promete que no pasa.
 */
export const AVISO_TIPO_NUEVO_NO_REASIGNA =
  "Este proceso sigue siendo del tipo que ya tenía. El tipo nuevo queda en" +
  " el catálogo, con este plan como su plantilla, para los procesos que se" +
  " abran con él.";

/** Qué se va a guardar, dicho en números antes de apretar. */
export function resumenDelPlan(pasos: number, cumplidos: number): string {
  if (pasos === 0) {
    return "Este proceso no tiene plan todavía: no hay nada que guardar.";
  }
  if (pasos === 1) return "Se guarda el único paso del plan.";

  // Las cumplidas se nombran porque es la parte que sorprende: una plantilla
  // es un plan, y en un plan no hay nada «ya hecho».
  return cumplidos === 0
    ? `Se guardan los ${String(pasos)} pasos del plan.`
    : `Se guardan los ${String(pasos)} pasos del plan, los ${String(
        cumplidos,
      )} ya cumplidos incluidos.`;
}

export function validarGuardado(
  borrador: BorradorDeGuardado,
  pasos: number,
): FallaDeValidacion[] {
  // Un plan vacío no se guarda por ninguno de los dos caminos: la plantilla
  // del tipo quedaría vacía, y el próximo proceso nacería sin pasos.
  if (pasos === 0) return [{ campo: "etapas", motivo: "plan_vacio" }];

  if (borrador.destino === "actualizar") return [];

  const fallas: FallaDeValidacion[] = [];
  if (borrador.nombre.trim() === "") {
    fallas.push({ campo: "nombre", motivo: "nombre_requerido" });
  }
  if (borrador.areaId.trim() === "") {
    fallas.push({ campo: "areaId", motivo: "area_requerida" });
  }

  return fallas;
}

export function aPeticionDeGuardado(
  borrador: BorradorDeGuardado,
): DatosDeGuardadoDePlantilla {
  if (borrador.destino === "actualizar") return { destino: "actualizar" };

  const descripcion = borrador.descripcion.trim();

  return {
    destino: "nuevo",
    areaId: borrador.areaId.trim(),
    nombre: borrador.nombre.trim(),
    // Vacío viaja como nulo: una descripción en blanco es «no hay», no una
    // cadena vacía guardada en la base.
    descripcion: descripcion === "" ? null : descripcion,
  };
}
