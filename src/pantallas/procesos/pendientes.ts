/**
 * Los pendientes de un proceso del lado del navegador: el borrador, la
 * cuenta de la cabecera y las firmas. Sin React y sin DOM.
 *
 * Un **pendiente es algo que sigue pasando**: «falta el documento X, pero el
 * proceso inicia» (`docs/diseno.md` §3 y §6). No bloquea el avance del
 * proceso, pero no se calla hasta que alguien lo cierre — y esa última
 * mitad es casi toda de este archivo, porque «no callarse» es una propiedad
 * de la pantalla.
 *
 * **Ésta es la segunda copia de las reglas del pendiente**, declarada como
 * tal. La que manda vive en `worker/pendientes/dominio.ts` y en su
 * repositorio; ésta avisa antes de mandar. Son dos copias con pruebas
 * propias cada una, igual que en T-5, T-6, T-7 y T-8: aflojar una tiene que
 * matar sus pruebas y no las de la otra.
 *
 * Lo que **no** está acá, y es deliberado:
 *
 *  - **No hay `reabrirPendiente` ni nada que se le parezca.** Un pendiente
 *    cerrado no se reabre (decisión de T-9): el esquema tiene un solo par
 *    `cerrado_en`/`cerrado_por` y reabrir sería borrar la firma de quien
 *    cerró. La salida, cuando el cierre estuvo mal, es un pendiente nuevo
 *    que diga la verdad de ahora — ver `AVISO_PENDIENTE_NO_SE_REABRE`.
 *  - **No hay forma de elegir la etapa de nacimiento.** La pone el servidor:
 *    un pendiente nace cuando alguien lo escribe.
 */

import type {
  DatosDePendiente,
  EtapaDeProceso,
  FallaDeValidacion,
  PendienteDeProceso,
  Usuario,
} from "../../../worker/contract";
import { ORDEN_ES, VACIO } from "../../formatos";

export interface BorradorDePendiente {
  texto: string;
  /** Cadena vacía es «sin responsable»: es lo que manda un `<select>`. */
  responsableId: string;
  /** Cadena vacía es «sin vencimiento»: es lo que manda un `<input date>`. */
  venceEn: string;
}

export const BORRADOR_DE_PENDIENTE_VACIO: BorradorDePendiente = {
  texto: "",
  responsableId: "",
  venceEn: "",
};

/**
 * Lo que hay que decir **antes** de cerrar, no después.
 *
 * Cerrar es de una sola dirección, igual que avanzar una etapa, y por la
 * misma clase de razón: la firma de quien cerró es un hecho y no se borra.
 * Pero el caso que de verdad pasa —«cerré *falta el documento X* y resulta
 * que el documento era otro»— necesita una salida, no solo una prohibición,
 * así que el aviso trae las dos.
 *
 * Vive acá, como constante exportada, para que su contenido se pueda
 * afirmar en una prueba en vez de quedar enterrado en un `.tsx`.
 */
export const AVISO_PENDIENTE_NO_SE_REABRE =
  "Cerrar deja firmado quién lo cerró y cuándo, y no se reabre: esa firma" +
  " es un hecho y borrarla sería reescribir lo que pasó. Si después resulta" +
  " que faltaba otra cosa, se anota un pendiente nuevo que diga qué falta" +
  " ahora; el cerrado queda como registro de lo que ya se persiguió.";

/**
 * El día de hoy en Panamá, como `AAAA-MM-DD`.
 *
 * **Ya no se define acá.** La tajada 2 necesitó el mismo huso en el Worker
 * —el vencimiento de una cotización se compara contra hoy—, y dos copias de
 * la zona horaria de un bufete que está en un solo lugar son una que se
 * arregla y otra que no. La definición vive en `worker/db/momentos.ts`, que
 * es un módulo sin dependencias y por eso lo pueden importar los dos lados;
 * el Worker no podría importar éste sin dar vuelta la flecha del proyecto.
 *
 * Se **reexporta** en vez de mandar a cada llamador al archivo nuevo porque
 * eso no cambiaría nada y tocaría pantallas que no tienen por qué enterarse
 * de dónde vive una resta. Lo que importa es que la constante exista una
 * sola vez, y ahora existe una sola vez.
 */
export { hoyEnPanama } from "../../../worker/db/momentos";

/**
 * ¿Se le pasó la fecha?
 *
 * La comparación es por **día** y como texto, que es exacta porque
 * `AAAA-MM-DD` ordena alfabéticamente igual que cronológicamente. Vencer «el
 * 22» quiere decir que el 22 todavía cuenta, así que lo vencido es lo
 * estrictamente anterior a hoy.
 *
 * Un pendiente **cerrado nunca está vencido**: lo cerrado ya no se persigue,
 * y marcarlo sería ruido rojo sobre algo que no hay que hacer.
 */
export function estaVencido(
  pendiente: Pick<PendienteDeProceso, "venceEn" | "cerradoEn">,
  hoy: string,
): boolean {
  if (pendiente.cerradoEn !== null) return false;
  return pendiente.venceEn !== null && pendiente.venceEn < hoy;
}

/**
 * Los abiertos y los cerrados, por separado.
 *
 * Llegan en una sola lista desde el servidor y se parten acá —al revés que
 * la línea de tiempo de T-8, que llega ya agrupada— porque el reparto cambia
 * en cada cierre y el contador de la cabecera no puede quedar
 * desactualizado esperando otra petición.
 *
 * El orden que trae el servidor se respeta: no se reordena nada.
 */
export function separarPendientes(
  pendientes: readonly PendienteDeProceso[],
): { abiertos: PendienteDeProceso[]; cerrados: PendienteDeProceso[] } {
  return {
    abiertos: pendientes.filter((pendiente) => pendiente.cerradoEn === null),
    cerrados: pendientes.filter((pendiente) => pendiente.cerradoEn !== null),
  };
}

/**
 * La cuenta de la cabecera: lo que se lee sin buscarlo.
 *
 * Es el «no se calla» del diseño, dicho en una frase. Los vencidos van
 * aparte del total porque son el número que obliga a mirar hoy: tres
 * pendientes abiertos es trabajo, uno vencido es un problema.
 */
export function resumenDePendientes(
  abiertos: readonly PendienteDeProceso[],
  hoy: string,
): string {
  if (abiertos.length === 0) {
    return "No hay ningún pendiente abierto en este proceso.";
  }

  const cuantos = abiertos.length;
  const base =
    cuantos === 1
      ? "1 pendiente abierto"
      : `${String(cuantos)} pendientes abiertos`;

  const vencidos = abiertos.filter((pendiente) =>
    estaVencido(pendiente, hoy),
  ).length;

  if (vencidos === 0) return `${base}.`;

  return `${base}, ${String(vencidos)} ${
    vencidos === 1 ? "vencido" : "vencidos"
  }.`;
}

/**
 * Quién lo anotó y quién lo tiene que resolver, dichos **distinto**.
 *
 * Son dos personas con dos papeles distintos, y confundirlos pierde la mitad
 * del dato: el autor vio el cabo suelto, el responsable es quien lo persigue.
 * La pantalla los dibuja con pesos distintos y estas funciones son el texto
 * de cada uno, acá para que se puedan afirmar sin montar un navegador.
 */
export function firmaDeAutor(
  pendiente: Pick<PendienteDeProceso, "autorNombre">,
): string {
  return `Anotado por ${pendiente.autorNombre ?? VACIO}`;
}

/**
 * Un pendiente **sin responsable lo dice**, no deja el hueco.
 *
 * El esquema deja `responsable_id` nulo y §5 no lo lista como invariante,
 * así que exigirlo sería una regla sin respaldo en la base. Pero un cabo
 * suelto que nadie tiene asignado es justo el que se pierde, y un espacio en
 * blanco en la pantalla no se ve: esta frase sí.
 */
export function firmaDeResponsable(
  pendiente: Pick<PendienteDeProceso, "responsableNombre" | "responsableId">,
): string {
  if (pendiente.responsableId === null) return "Sin responsable asignado";
  return `Responsable: ${pendiente.responsableNombre ?? VACIO}`;
}

/** Quién lo cerró, o `null` si sigue abierto. */
export function firmaDeCierre(
  pendiente: Pick<PendienteDeProceso, "cerradoEn" | "cerradoPorNombre">,
): string | null {
  if (pendiente.cerradoEn === null) return null;
  return `Cerrado por ${pendiente.cerradoPorNombre ?? VACIO}`;
}

/**
 * Un día `AAAA-MM-DD` que existe de verdad.
 *
 * Segunda copia declarada de `esDiaValido` en `worker/pendientes/dominio.ts`:
 * `2026-02-31` tiene la forma correcta y no es ningún día, y `Date` lo
 * normalizaría a marzo sin decir nada. El viaje de ida y vuelta lo delata.
 */
function esDiaValido(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;

  const momento = new Date(`${valor}T00:00:00.000Z`);
  if (Number.isNaN(momento.getTime())) return false;

  return momento.toISOString().slice(0, 10) === valor;
}

export function validarPendiente(
  borrador: BorradorDePendiente,
  etapas: readonly EtapaDeProceso[],
  equipo: readonly Usuario[],
): FallaDeValidacion[] {
  const fallas: FallaDeValidacion[] = [];

  if (borrador.texto.trim() === "") {
    fallas.push({ campo: "texto", motivo: "texto_requerido" });
  }

  // `pendiente.proceso_etapa_id` es `NOT NULL`: sin plan no hay de dónde
  // colgarlo, y el servidor no inventa un paso para resolverlo.
  if (etapas.length === 0) {
    fallas.push({ campo: "procesoEtapaId", motivo: "proceso_sin_etapas" });
    return fallas;
  }

  // Se comprueba contra el equipo entero y no contra los seleccionables: lo
  // válido y lo ofrecible son cosas distintas desde T-5, y alguien que ya no
  // está sigue siendo un responsable válido para lo que ya tenía.
  const elegido = borrador.responsableId.trim();
  if (elegido !== "" && !equipo.some((persona) => persona.id === elegido)) {
    fallas.push({ campo: "responsableId", motivo: "responsable_desconocido" });
  }

  const fecha = borrador.venceEn.trim();
  if (fecha !== "" && !esDiaValido(fecha)) {
    fallas.push({ campo: "venceEn", motivo: "vencimiento_invalido" });
  }

  return fallas;
}

/**
 * El envío: el texto, el responsable y el vencimiento.
 *
 * Del texto se recortan **los bordes y nada más**: adentro los saltos de
 * línea son de quien escribe. Ni el autor, ni el momento, ni la etapa
 * viajan: los pone el servidor con la identidad de Access, el reloj y el
 * plan (I-6).
 */
export function aPeticionDePendiente(
  borrador: BorradorDePendiente,
): DatosDePendiente {
  const responsableId = borrador.responsableId.trim();
  const venceEn = borrador.venceEn.trim();

  return {
    texto: borrador.texto.trim(),
    responsableId: responsableId === "" ? null : responsableId,
    venceEn: venceEn === "" ? null : venceEn,
  };
}

/**
 * El equipo como opciones del desplegable de responsable.
 *
 * Misma regla que los tipos en T-5 y T-6: los dados de baja no se ofrecen,
 * salvo el que **ya está elegido**, porque si no el desplegable se vaciaría
 * solo y el formulario parecería haber perdido el dato.
 */
export function responsablesSeleccionables(
  equipo: readonly Usuario[],
  elegido: string,
): Usuario[] {
  return [...equipo]
    .filter((persona) => persona.activo || persona.id === elegido)
    .sort((a, b) => ORDEN_ES.compare(a.nombre, b.nombre));
}
