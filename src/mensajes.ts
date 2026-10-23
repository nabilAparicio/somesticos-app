/**
 * Un motivo de falla de la API, dicho para quien está mirando la pantalla.
 *
 * El mapa vive en un módulo propio y no dentro de una pantalla porque el
 * vocabulario de fallas es uno solo para toda la API (`worker/contract.ts`),
 * y `MotivoDeFalla` es exhaustivo: el día que el Worker agregue un motivo,
 * este `Record` deja de compilar hasta que alguien escriba qué decirle al
 * usuario. Esa es toda la gracia — que no se pueda agregar un motivo sin
 * texto y descubrirlo en producción como un mensaje en blanco.
 */

import type { MotivoDeFalla } from "../worker/contract";

const MENSAJES: Record<MotivoDeFalla, string> = {
  tipo_invalido: "Ese campo no se entendió.",
  nombre_requerido: "El nombre es obligatorio.",
  contacto_requerido:
    "Hace falta al menos un medio de contacto: un teléfono o un correo.",
  correo_invalido: "Ese correo no parece un correo.",
  telefono_invalido: "Un teléfono tiene que llevar al menos un número.",
  documento_incompleto: "El documento va con tipo y número, o sin ninguno.",
  tipo_cliente_desconocido: "Ese tipo de cliente ya no existe.",
  area_requerida: "Hay que elegir el área a la que pertenece.",
  area_desconocida: "Esa área ya no existe.",
  etapa_desconocida:
    "Una de las etapas ya no existe o está repetida. Hay que volver a" +
    " cargar la plantilla.",
};

export function mensajeDeFalla(motivo: MotivoDeFalla): string {
  return MENSAJES[motivo];
}
