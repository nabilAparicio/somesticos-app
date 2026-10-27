/**
 * La ruta HTTP del tablero de Inicio. Traduce la petición a una llamada del
 * puerto; no decide ninguna regla.
 *
 *   GET /api/inicio?alcance=mio|bufete
 *
 * Corre **después** de la puerta de Access: «mis» pendientes y «mis»
 * cotizaciones son de la identidad resuelta, nunca de un parámetro. No hay
 * `?usuario=`: mirar el tablero de otro sería una forma de leer lo ajeno que
 * nadie pidió.
 *
 * Los códigos que esta capa elige:
 *
 *  - **422** para un `alcance` que no es ninguno de los dos. Caer en «mío»
 *    en silencio contestaría otra pregunta que la que se hizo.
 *  - **405** para cualquier verbo que no sea `GET`: el tablero solo se lee.
 */

import type {
  DatosInvalidos,
  RespuestaDelInicio,
} from "../contract";
import type { Identidad } from "../acceso/identidad";
import { leerAlcance } from "./dominio";
import type { ServicioDelInicio } from "./repositorio";

function json(cuerpo: unknown, init?: ResponseInit): Response {
  const respuesta = Response.json(cuerpo, init);
  respuesta.headers.set("cache-control", "no-store");
  return respuesta;
}

/** Devuelve `null` cuando la ruta no es la del inicio. */
export async function rutasDelInicio(
  request: Request,
  url: URL,
  identidad: Identidad,
  tenantId: string,
  servicio: ServicioDelInicio,
): Promise<Response | null> {
  if (url.pathname.replace(/\/+$/, "") !== "/api/inicio") return null;

  if (request.method !== "GET") {
    return json(
      { error: "method_not_allowed" },
      { status: 405, headers: { allow: "GET" } },
    );
  }

  const alcance = leerAlcance(url.searchParams.get("alcance"));
  if (alcance === null) {
    const cuerpo: DatosInvalidos = {
      error: "datos_invalidos",
      fallas: [{ campo: "alcance", motivo: "tipo_invalido" }],
    };
    return json(cuerpo, { status: 422 });
  }

  // El reloj se lee una sola vez por petición: «hoy» y «este mes» tienen que
  // ser el mismo instante para las cinco consultas.
  const cuerpo: RespuestaDelInicio = await servicio.resumen(
    tenantId,
    identidad.usuarioId,
    alcance,
    new Date(),
  );
  return json(cuerpo);
}
