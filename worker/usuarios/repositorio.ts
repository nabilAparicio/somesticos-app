/**
 * El adaptador de D1 para las personas del bufete.
 *
 * `ServicioDeUsuarios` es el puerto: lo que el ruteo conoce. La función de
 * abajo es la única implementación, y la única que sabe que existe SQL. Que
 * sea una interfaz y no una llamada directa es lo que deja probar que **una
 * petición sin identidad no llega hasta acá**, sustituyéndola por un espía.
 *
 * I-8 (`docs/diseno.md` §5) vive en la única consulta de este archivo. Sobre
 * esta tabla importa más que sobre ninguna: filtrar mal acá no filtra datos
 * de un bufete vecino, filtra **su gente**.
 *
 * ## Lo que este archivo NO hace, a propósito
 *
 *  - **No crea, no edita y no borra.** El sistema no da de alta a nadie:
 *    quién entra lo deciden Cloudflare Access y la fila en `usuario` (T-3).
 *    Una escritura acá sería una segunda puerta al lado de la que ya existe.
 *  - **No omite a los inactivos.** Viajan marcados. Un pendiente viejo puede
 *    tener como responsable a alguien que ya no está, y la pantalla necesita
 *    poder nombrarlo sin ofrecerlo para uno nuevo (misma decisión que T-5
 *    con `tipo_cliente` y T-6 con las áreas).
 */

import type { Usuario } from "../contract";

export interface ServicioDeUsuarios {
  listar(tenantId: string): Promise<Usuario[]>;
}

interface FilaDeUsuario {
  id: string;
  nombre: string;
  email: string;
  activo: number;
}

export function usuariosSobreD1(db: D1Database): ServicioDeUsuarios {
  return {
    async listar(tenantId) {
      // `COLLATE NOCASE` en el nombre y el correo de desempate: dos personas
      // del bufete se pueden llamar igual, y un orden que cambia entre
      // lecturas hace que el desplegable baile bajo el cursor.
      const { results } = await db
        .prepare(
          "SELECT id, nombre, email, activo FROM usuario" +
            " WHERE tenant_id = ?" +
            " ORDER BY nombre COLLATE NOCASE, email COLLATE NOCASE",
        )
        .bind(tenantId)
        .all<FilaDeUsuario>();

      return results.map((fila) => ({
        id: fila.id,
        nombre: fila.nombre,
        email: fila.email,
        activo: fila.activo === 1,
      }));
    },
  };
}
