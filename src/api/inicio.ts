/**
 * El cliente HTTP del tablero de Inicio.
 *
 * Solo lectura: el tablero no escribe nada, resume. Pasa por `pedir`, que ya
 * distingue la puerta cerrada de una falla del servidor y conserva el motivo.
 */

import type {
  AlcanceDelInicio,
  RespuestaDelInicio,
} from "../../worker/contract";
import { pedir, type Resultado } from "./peticiones";

export function cargarInicio(
  alcance: AlcanceDelInicio,
  signal: AbortSignal,
): Promise<Resultado<RespuestaDelInicio>> {
  return pedir<RespuestaDelInicio>(
    `/api/inicio?alcance=${encodeURIComponent(alcance)}`,
    { signal },
  );
}
