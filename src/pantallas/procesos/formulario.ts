/**
 * El borrador del alta de un proceso, sin React y sin DOM.
 *
 * Es **la segunda copia** de la validación, declarada como tal: la que manda
 * vive en `worker/procesos/dominio.ts` y en su repositorio. Ésta avisa antes
 * de mandar, que es la diferencia entre un campo marcado al instante y una
 * ida y vuelta al servidor para enterarse de lo mismo.
 */

import type {
  DatosDeProceso,
  FallaDeValidacion,
} from "../../../worker/contract";
import { ORDEN_ES } from "../../formatos";

export interface BorradorDeProceso {
  clienteId: string;
  tipoProcesoId: string;
  titulo: string;
  /** Cadena vacía es «sin responsable»: es lo que manda un `<select>`. */
  responsableId: string;
}

export const BORRADOR_DE_PROCESO_VACIO: BorradorDeProceso = {
  clienteId: "",
  tipoProcesoId: "",
  titulo: "",
  responsableId: "",
};

export function validarProceso(
  borrador: BorradorDeProceso,
): FallaDeValidacion[] {
  const fallas: FallaDeValidacion[] = [];

  // I-2: todo proceso está ligado a un cliente.
  if (borrador.clienteId.trim() === "") {
    fallas.push({ campo: "clienteId", motivo: "cliente_requerido" });
  }
  if (borrador.tipoProcesoId.trim() === "") {
    fallas.push({ campo: "tipoProcesoId", motivo: "tipo_proceso_requerido" });
  }
  if (borrador.titulo.trim() === "") {
    fallas.push({ campo: "titulo", motivo: "titulo_requerido" });
  }

  return fallas;
}

export function aPeticionDeProceso(
  borrador: BorradorDeProceso,
): DatosDeProceso {
  const responsableId = borrador.responsableId.trim();

  return {
    clienteId: borrador.clienteId.trim(),
    tipoProcesoId: borrador.tipoProcesoId.trim(),
    titulo: borrador.titulo.trim(),
    responsableId: responsableId === "" ? null : responsableId,
  };
}

/**
 * El título que la pantalla propone al elegir tipo y cliente.
 *
 * Sin el nombre del cliente, cinco residencias del mismo tipo se llaman igual
 * en el listado y hay que abrirlas una por una para saber cuál es cuál. Es
 * una **sugerencia**, no un valor impuesto: quien da de alta lo puede
 * reescribir entero, y el servidor no lo recalcula.
 */
export function tituloSugerido(
  tipoNombre: string | null,
  clienteNombre: string | null,
): string {
  if (tipoNombre === null || tipoNombre.trim() === "") return "";
  if (clienteNombre === null || clienteNombre.trim() === "") {
    return tipoNombre.trim();
  }

  return `${tipoNombre.trim()} — ${clienteNombre.trim()}`;
}

/**
 * Lo válido y lo seleccionable son cosas distintas, como estableció T-5.
 *
 * Un tipo dado de baja sigue siendo válido para los procesos que ya lo usan,
 * pero no se ofrece para abrir uno nuevo. La excepción es el que **ya está
 * elegido**: si no se ofreciera, el desplegable se vaciaría solo y el
 * formulario parecería haber perdido el dato.
 */
export function tipoSeleccionables<
  T extends { readonly id: string; readonly nombre: string; readonly activo: boolean },
>(tipos: readonly T[], elegido: string): T[] {
  return [...tipos]
    .filter((tipo) => tipo.activo || tipo.id === elegido)
    .sort((a, b) => ORDEN_ES.compare(a.nombre, b.nombre));
}

/**
 * Los clientes, ordenados. Van todos: `cliente` no tiene marca de vigencia —
 * un cliente no se da de baja, y el que no vuelve simplemente no vuelve.
 */
export function clientesSeleccionables<
  T extends { readonly id: string; readonly nombre: string },
>(clientes: readonly T[]): T[] {
  return [...clientes].sort((a, b) => ORDEN_ES.compare(a.nombre, b.nombre));
}
