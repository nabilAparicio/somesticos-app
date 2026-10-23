/**
 * El borrador del formulario de cliente y sus reglas, sin React y sin DOM.
 *
 * Un formulario tiene tres transformaciones que no son de presentación y que
 * se equivocan en silencio si viven dentro del componente:
 *
 *  1. **cliente → borrador**: los `null` se vuelven campos vacíos editables;
 *  2. **borrador → petición**: lo vacío vuelve a ser `null`, no `""`;
 *  3. **borrador → fallas**: qué falta antes de molestar al servidor.
 *
 * La segunda importa más de lo que parece. Un `""` guardado en la base es un
 * documento que existe y está vacío, y después nada distingue «no lo sabemos»
 * de «no tiene».
 *
 * **Esta validación no autoriza nada.** La que manda es la del Worker
 * (`worker/clientes/dominio.ts`), que es la que la base y el invariante
 * respaldan. Esta existe para avisar antes de mandar. Son dos copias de la
 * misma regla a propósito, y cada una tiene sus propias pruebas: aflojar una
 * tiene que matar sus pruebas y no las de la otra.
 */

import type {
  Cliente,
  DatosDeCliente,
  FallaDeValidacion,
  TipoCliente,
} from "../../../worker/contract";

export interface BorradorDeCliente {
  nombre: string;
  tipoClienteId: string;
  documentoTipo: string;
  documentoNumero: string;
  representanteLegal: string;
  email: string;
  telefono: string;
  notas: string;
}

export type CampoDelBorrador = keyof BorradorDeCliente;

export const BORRADOR_VACIO: BorradorDeCliente = {
  nombre: "",
  tipoClienteId: "",
  documentoTipo: "",
  documentoNumero: "",
  representanteLegal: "",
  email: "",
  telefono: "",
  notas: "",
};

/** La misma forma laxa que acepta el Worker. Ver el porqué allá. */
const FORMA_DE_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function recortar(valor: string): string | null {
  const limpio = valor.trim();
  return limpio === "" ? null : limpio;
}

export function borradorDesde(cliente: Cliente): BorradorDeCliente {
  return {
    nombre: cliente.nombre,
    tipoClienteId: cliente.tipoClienteId ?? "",
    documentoTipo: cliente.documentoTipo ?? "",
    documentoNumero: cliente.documentoNumero ?? "",
    representanteLegal: cliente.representanteLegal ?? "",
    email: cliente.email ?? "",
    telefono: cliente.telefono ?? "",
    notas: cliente.notas ?? "",
  };
}

export function aPeticion(borrador: BorradorDeCliente): DatosDeCliente {
  return {
    nombre: borrador.nombre.trim(),
    tipoClienteId: recortar(borrador.tipoClienteId),
    documentoTipo: recortar(borrador.documentoTipo),
    documentoNumero: recortar(borrador.documentoNumero),
    representanteLegal: recortar(borrador.representanteLegal),
    // Minúsculas, igual que la puerta de acceso y que el Worker.
    email: recortar(borrador.email.toLowerCase()),
    telefono: recortar(borrador.telefono),
    notas: recortar(borrador.notas),
  };
}

export function validarBorrador(
  borrador: BorradorDeCliente,
): FallaDeValidacion[] {
  const datos = aPeticion(borrador);
  const fallas: FallaDeValidacion[] = [];

  if (datos.nombre === "") {
    fallas.push({ campo: "nombre", motivo: "nombre_requerido" });
  }

  const correoUtil = datos.email !== null && FORMA_DE_CORREO.test(datos.email);
  const telefonoUtil = datos.telefono !== null && /\d/.test(datos.telefono);

  if (datos.email !== null && !correoUtil) {
    fallas.push({ campo: "email", motivo: "correo_invalido" });
  }
  if (datos.telefono !== null && !telefonoUtil) {
    fallas.push({ campo: "telefono", motivo: "telefono_invalido" });
  }

  // El criterio de T-5: nombre y UN medio de contacto. Nada más es exigible.
  if (!correoUtil && !telefonoUtil) {
    fallas.push({ campo: "telefono", motivo: "contacto_requerido" });
  }

  if ((datos.documentoTipo === null) !== (datos.documentoNumero === null)) {
    fallas.push({
      campo:
        datos.documentoTipo === null ? "documentoTipo" : "documentoNumero",
      motivo: "documento_incompleto",
    });
  }

  return fallas;
}

/**
 * Los tipos que el desplegable puede ofrecer.
 *
 * Los dados de baja no se ofrecen, **salvo el que el cliente ya tiene**. Sin
 * esa excepción, abrir a editar un cliente viejo y guardar sin tocar nada le
 * cambiaría el tipo sin que nadie lo pidiera, que es la peor clase de cambio.
 */
export function tiposSeleccionables(
  tipos: readonly TipoCliente[],
  seleccionadoId: string,
): TipoCliente[] {
  return tipos.filter(
    (tipo) => tipo.activo || tipo.id === seleccionadoId,
  );
}

/**
 * Los textos de las fallas viven en `src/mensajes.ts` desde T-6: el
 * vocabulario de motivos es uno solo para toda la API, y tenerlo dos veces
 * sería dos lugares donde un motivo nuevo puede quedarse sin texto.
 */
export { mensajeDeFalla } from "../../mensajes";
