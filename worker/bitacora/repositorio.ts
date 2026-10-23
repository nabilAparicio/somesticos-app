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
 * I-8 (`docs/diseno.md` §5) vive en las dos consultas del archivo: filtran
 * por `tenant_id` aunque ya filtren por entidad e identificador. Un UUID
 * ajeno sigue siendo un UUID.
 *
 * Las dos usan exactamente el índice `(entidad, entidad_id, ocurrido_en)`
 * que T-2 dejó puesto, que es la forma de la pregunta: «¿qué pasó con
 * esto?».
 */

import type { EntidadRegistrada, EntradaDeBitacora } from "../contract";
import type { BaseDeDatos } from "../db/base";

/**
 * Una tajada de la historia de una entidad, y cuánta historia hay.
 *
 * `total` no se puede deducir de `entradas.length` y por eso viaja aparte:
 * la página trae a lo sumo `limite` hechos, así que sin el total la pantalla
 * no sabe cuántos está escondiendo.
 */
export interface PaginaDeBitacora {
  /** A lo sumo `limite` hechos, **los más recientes**. */
  readonly entradas: EntradaDeBitacora[];
  /** Cuántos hechos tiene la entidad, los de la página y los de atrás. */
  readonly total: number;
}

export interface ServicioDeBitacora {
  /**
   * Los `limite` hechos más recientes de una entidad, del más nuevo al más
   * viejo, y cuántos hay en total.
   *
   * `limite` llega ya validado: quien lo recibe de la URL es
   * `worker/bitacora/rutas.ts`, y ahí se acota contra el techo del contrato.
   * Acá no se vuelve a mirar porque la guarda no se reparte en dos lugares;
   * el tipo dice «un entero positivo» y el único llamador lo cumple.
   */
  listar(
    tenantId: string,
    entidad: EntidadRegistrada,
    entidadId: string,
    limite: number,
  ): Promise<PaginaDeBitacora>;
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
 * **`DESC` en los dos términos del orden** (T-17). El primero porque la
 * bitácora es auditoría y no narración: se lee empezando por lo último. El
 * segundo —`b.rowid`, que es el orden de inserción— porque es el desempate
 * de los hechos que comparten `ocurrido_en`, y mezclando las direcciones ese
 * grupo quedaría al revés que el resto de la lista. No es solo prolijidad:
 * con `rowid` ascendente, `EXPLAIN QUERY PLAN` muestra «USE TEMP B-TREE FOR
 * LAST TERM OF ORDER BY», es decir, todas las filas de la entidad ordenadas
 * en memoria antes de aplicar el `LIMIT` — exactamente el ahorro que el
 * `LIMIT` venía a comprar. Con los dos `DESC`, SQLite recorre el índice al
 * revés y se detiene al llegar al tope.
 *
 * El `LIMIT` es lo que convierte esto en una página. Sin él, una sucesión de
 * tres años dibuja sus cuatrocientos hechos cada vez que alguien abre la
 * pantalla.
 */
const SELECCION =
  "SELECT b.id, b.entidad, b.entidad_id, b.accion, b.usuario_id," +
  " u.nombre AS usuario_nombre, b.ocurrido_en, b.detalle" +
  " FROM bitacora b" +
  " LEFT JOIN usuario u ON u.id = b.usuario_id AND u.tenant_id = b.tenant_id" +
  " WHERE b.tenant_id = ? AND b.entidad = ? AND b.entidad_id = ?" +
  " ORDER BY b.ocurrido_en DESC, b.rowid DESC" +
  " LIMIT ?";

/**
 * El total, **sin traer las filas**.
 *
 * Es una sentencia aparte y no un `COUNT(*) OVER ()` pegado a la selección.
 * La ventana obligaría a SQLite a materializar todas las filas de la entidad
 * antes de aplicar el `LIMIT` —la misma pérdida que el `rowid` ascendente— y
 * encima repetiría el número en cada una de las filas que sí viajan.
 *
 * Así, en cambio, lo que cruza la frontera de D1 es un entero. La consulta
 * entra por el mismo índice `(entidad, entidad_id, …)`, no toca la unión con
 * `usuario` y no serializa ninguna columna: recorre las entradas del índice
 * de esa entidad comprobando `tenant_id` fila por fila —`tenant_id` no está
 * en el índice— y devuelve la cuenta. Con unos cientos de hechos por entidad
 * eso es trabajo despreciable; traer esos cientos de filas para contarlas en
 * JavaScript no lo es, y es lo que esta sentencia evita.
 *
 * Son dos idas a la base porque `BaseDeDatos.lectura` es un puerto de
 * lectura angosto, deliberadamente sin `batch` (`worker/db/base.ts`). Como
 * son independientes, salen juntas en un `Promise.all` y la latencia es la
 * de la más lenta, no la suma.
 */
const CONTEO =
  "SELECT count(*) AS total FROM bitacora" +
  " WHERE tenant_id = ? AND entidad = ? AND entidad_id = ?";

export function bitacoraSobreD1(base: BaseDeDatos): ServicioDeBitacora {
  const db = base.lectura;

  return {
    async listar(tenantId, entidad, entidadId, limite) {
      const [pagina, cuenta] = await Promise.all([
        db
          .prepare(SELECCION)
          .bind(tenantId, entidad, entidadId, limite)
          .all<FilaDeBitacora>(),
        db
          .prepare(CONTEO)
          .bind(tenantId, entidad, entidadId)
          .first<{ total: number }>(),
      ]);

      return {
        entradas: pagina.results.map((fila) => ({
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
        })),
        // `count(*)` siempre devuelve una fila, también cuando no hay
        // ninguna que contar; el `?? 0` es para el tipo, no para un caso.
        total: cuenta?.total ?? 0,
      };
    },
  };
}
