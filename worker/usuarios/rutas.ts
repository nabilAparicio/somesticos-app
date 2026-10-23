/**
 * La ruta HTTP de las personas del bufete.
 *
 *   GET /api/usuarios   el equipo, para poder elegir responsable
 *
 * **Y nada más.** No hay `POST`, no hay `PUT`, no hay `DELETE` y no hay
 * `/api/usuarios/{id}`. El sistema no da de alta a nadie: que Access apruebe
 * a alguien significa que pasó la política de la puerta, no que sea del
 * bufete, y la fila en `usuario` la pone quien administra (T-3). Una
 * escritura acá sería una segunda puerta de entrada al lado de la primera.
 *
 * Los métodos de escritura contestan 405 —el verbo no existe, dicho en un
 * código de estado— y `/api/usuarios/{id}` no es ninguna ruta, así que cae
 * en el 404 general: una persona no se direcciona sola porque no hay nada
 * que leer de una sola que el listado no diga mejor.
 *
 * Todo esto corre **después** de la puerta de Access.
 */

import type { RespuestaDeUsuarios } from "../contract";
import type { ServicioDeUsuarios } from "./repositorio";

/**
 * Devuelve `null` cuando la ruta no es de usuarios, para que quien llama
 * siga buscando y termine en su propio 404.
 */
export async function rutasDeUsuarios(
  request: Request,
  url: URL,
  tenantId: string,
  servicio: ServicioDeUsuarios,
): Promise<Response | null> {
  // Sin la barra final: `/api/usuarios/` es el listado, no «el usuario de
  // identificador vacío».
  if (url.pathname.replace(/\/+$/, "") !== "/api/usuarios") return null;

  if (request.method !== "GET") {
    return Response.json(
      { error: "method_not_allowed" },
      {
        status: 405,
        headers: { allow: "GET", "cache-control": "no-store" },
      },
    );
  }

  const cuerpo: RespuestaDeUsuarios = {
    usuarios: await servicio.listar(tenantId),
  };

  return Response.json(cuerpo, { headers: { "cache-control": "no-store" } });
}
