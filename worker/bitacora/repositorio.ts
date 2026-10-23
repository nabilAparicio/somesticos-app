/**
 * El adaptador de D1 para **leer** la bitácora.
 *
 * Solo lee, y eso no es una omisión: **escribir no es de este módulo**. Las
 * entradas las pone `BaseDeDatos.mutar` (`worker/db/base.ts`), que es el
 * único camino por el que este sistema escribe cualquier cosa. Si acá
 * hubiera un `crear`, existiría un segundo lugar desde el que registrar un
 * hecho, y el día que uno aprenda algo —una columna, una regla— el otro no
 * se entera. Peor: habría un puerto de escritura al que alguien podría
 * colgarle una ruta.
 *
 * I-8 (`docs/diseno.md` §5) vive en la única consulta del archivo: filtra
 * por `tenant_id` aunque ya filtre por entidad e identificador. Un UUID
 * ajeno sigue siendo un UUID.
 *
 * La consulta usa exactamente el índice `(entidad, entidad_id, ocurrido_en)`
 * que T-2 dejó puesto, que es la forma de la pregunta: «¿qué pasó con
 * esto?».
 */

import type { EntidadRegistrada, EntradaDeBitacora } from "../contract";
import type { BaseDeDatos } from "../db/base";

export interface ServicioDeBitacora {
  /** Los hechos de una entidad, del más viejo al más nuevo. */
  listar(
    tenantId: string,
    entidad: EntidadRegistrada,
    entidadId: string,
  ): Promise<EntradaDeBitacora[]>;
}

interface FilaDeBitacora {
  id: string;
  entidad: string;
  entidad_id: string;
  accion: string;
  usuario_id: string;
  usuario_nombre: string | null;
  ocurrido_en: string;
  detalle: string | null;
}

/**
 * La unión con `usuario` repite el filtro de tenencia en el `ON`, igual que
 * T-7 con el cliente y T-8 con el autor de una nota: un `usuario_id` que
 * cruzara la frontera devuelve `NULL` en vez del nombre ajeno.
 *
 * El desempate es `b.rowid`, que es el orden de inserción: dos hechos del
 * mismo milisegundo tienen el mismo `ocurrido_en`, y sin desempate la
 * historia se leería en un orden que cambia entre lecturas.
 */
const SELECCION =
  "SELECT b.id, b.entidad, b.entidad_id, b.accion, b.usuario_id," +
  " u.nombre AS usuario_nombre, b.ocurrido_en, b.detalle" +
  " FROM bitacora b" +
  " LEFT JOIN usuario u ON u.id = b.usuario_id AND u.tenant_id = b.tenant_id" +
  " WHERE b.tenant_id = ? AND b.entidad = ? AND b.entidad_id = ?" +
  " ORDER BY b.ocurrido_en, b.rowid";

export function bitacoraSobreD1(base: BaseDeDatos): ServicioDeBitacora {
  const db = base.lectura;

  return {
    async listar(tenantId, entidad, entidadId) {
      const { results } = await db
        .prepare(SELECCION)
        .bind(tenantId, entidad, entidadId)
        .all<FilaDeBitacora>();

      return results.map((fila) => ({
        id: fila.id,
        // El `CHECK` de la migración garantiza que estos dos valores salen
        // del vocabulario; la aserción no afloja nada que la base no haya
        // comprobado ya al escribir.
        entidad: fila.entidad as EntidadRegistrada,
        entidadId: fila.entidad_id,
        accion: fila.accion as EntradaDeBitacora["accion"],
        usuarioId: fila.usuario_id,
        usuarioNombre: fila.usuario_nombre,
        ocurridoEn: fila.ocurrido_en,
        detalle: fila.detalle,
      }));
    },
  };
}
