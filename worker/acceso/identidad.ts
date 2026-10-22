/**
 * De un correo aprobado por Access a una identidad del dominio.
 *
 * Esta es la frontera: hacia afuera viaja un `usuario_id`, nunca el token.
 * Las invariantes de autoría (`docs/diseno.md` §5, I-6) necesitan una llave
 * foránea real a `usuario`, no un correo ni un nombre en texto.
 *
 * El sistema **no da de alta a nadie**. Que Access apruebe a alguien significa
 * que esa persona pasó la política de la puerta, no que sea del bufete. Si no
 * hay fila en `usuario`, no hay identidad, y la petición se rechaza.
 */

import { aceptar, rechazar, type Resultado } from "./rechazo";

export interface Identidad {
  usuarioId: string;
  email: string;
  nombre: string;
}

interface FilaDeUsuario {
  id: string;
  nombre: string;
  email: string;
  activo: number;
}

/**
 * Los correos se comparan en minúsculas: los proveedores de identidad no
 * garantizan la caja y nadie quiere quedar afuera por una mayúscula. La
 * consecuencia es que `usuario.email` tiene que guardarse en minúsculas; el
 * día que exista la pantalla de administración de usuarios (T-5 en adelante),
 * ahí va el `CHECK` que lo obligue.
 */
export function normalizarCorreo(correo: string): string {
  return correo.trim().toLowerCase();
}

export async function resolverUsuario(
  db: D1Database,
  tenantId: string,
  correo: string,
): Promise<Resultado<Identidad>> {
  // I-8: la consulta filtra por `tenant_id`. No hay consulta sin él.
  const fila = await db
    .prepare(
      "SELECT id, nombre, email, activo FROM usuario" +
        " WHERE tenant_id = ? AND email = ?",
    )
    .bind(tenantId, normalizarCorreo(correo))
    .first<FilaDeUsuario>();

  if (fila === null) return rechazar("usuario_desconocido");
  if (fila.activo !== 1) return rechazar("usuario_inactivo");

  return aceptar({
    usuarioId: fila.id,
    email: fila.email,
    nombre: fila.nombre,
  });
}
