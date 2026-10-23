/**
 * El adaptador de D1 para los pendientes de un proceso.
 *
 * `ServicioDePendientes` es el puerto: lo que el ruteo conoce. La función de
 * abajo es la única implementación, y la única que sabe que existe SQL. Que
 * sea una interfaz y no una llamada directa es lo que deja probar que **una
 * petición sin identidad no llega hasta acá**, sustituyéndola por un espía.
 *
 * I-8 (`docs/diseno.md` §5) vive en cada consulta de este archivo: no hay
 * una sola que no filtre por `tenant_id`, ni siquiera las que buscan por
 * llave primaria. Un UUID ajeno sigue siendo un UUID.
 *
 * ## La propiedad que este archivo existe para sostener
 *
 * **Un pendiente sobrevive el cambio de etapa sin que nadie lo copie.** La
 * mecánica entera está en una sola línea de `leer`: el `WHERE` filtra por
 * `proceso_id` y **no** por `proceso_etapa_id`. No hay copia de etapa en
 * etapa porque no hace falta ninguna — el pendiente nunca estuvo atado a la
 * etapa vigente, solo a la que lo vio nacer.
 *
 * Es la diferencia con la línea de tiempo de T-8, que sí agrupa por etapa:
 * una nota *pertenece* a la etapa donde ocurrió el hecho; un pendiente solo
 * *nació* ahí y después cruza el plan entero.
 *
 * ## A qué etapa se ancla un pendiente
 *
 * `pendiente.proceso_etapa_id` es `NOT NULL`, así que tiene que colgar de
 * algo. Se ancla a la **etapa vigente** —la misma definición que usan el
 * listado de procesos y las notas—, y a diferencia de una nota **quien
 * escribe no puede elegir otra**: una nota se escribe a veces días después
 * del hecho, y por eso T-8 deja anclarla donde de verdad ocurrió; un
 * pendiente, en cambio, nace cuando alguien lo escribe. Elegir otra etapa
 * sería afirmar que el cabo suelto apareció antes de que nadie lo viera.
 *
 * Si el proceso no tiene ninguna etapa se rechaza con `proceso_sin_etapas`,
 * igual que T-8: el servidor no inventa un paso para poder guardar.
 *
 * ## Lo que este archivo NO hace, a propósito
 *
 *  - **No reabre.** No hay método, no hay ruta. El esquema tiene un solo par
 *    `cerrado_en`/`cerrado_por`: reabrir sería ponerlos en nulo, o sea
 *    borrar la firma de quien cerró. Es la decisión de T-9 y vive como
 *    ausencia del camino, no como una guarda que alguien pueda aflojar.
 *  - **No edita el texto ni mueve la etapa de nacimiento.** Lo mismo: no
 *    existe la operación.
 *  - **No escribe en `bitacora`.** Ese registro es T-10, y se cablea en un
 *    solo lugar.
 */

import type {
  DatosDePendiente,
  FallaDeValidacion,
  PendienteDeProceso,
} from "../contract";
import { nuevoId } from "../db/ids";
import { ahoraIso } from "../db/momentos";
// La misma función y no una copia: dos definiciones de «etapa vigente» es
// exactamente lo que este proyecto evita. Vive en notas porque T-8 la
// escribió primero; el día que aparezca un tercer llamador conviene mudarla
// a `worker/procesos/`.
import { etapaVigente } from "../notas/repositorio";

export type ResultadoDePendiente =
  | { estado: "guardado"; pendientes: PendienteDeProceso[] }
  | { estado: "invalido"; fallas: FallaDeValidacion[] }
  /** El pendiente no es de este proceso, o no es de este bufete. */
  | { estado: "no_encontrado" }
  /** Ya estaba cerrado. No es un error de datos: es el estado. */
  | { estado: "ya_cerrado" };

export interface ServicioDePendientes {
  /** Abiertos y cerrados, en el orden que define `ORDEN`. */
  listar(tenantId: string, procesoId: string): Promise<PendienteDeProceso[]>;
  crear(
    tenantId: string,
    procesoId: string,
    autorId: string,
    datos: DatosDePendiente,
  ): Promise<ResultadoDePendiente>;
  cerrar(
    tenantId: string,
    procesoId: string,
    pendienteId: string,
    quienCierra: string,
  ): Promise<ResultadoDePendiente>;
}

interface FilaDePendiente {
  id: string;
  proceso_etapa_id: string;
  etapa_nombre: string | null;
  texto: string;
  autor_id: string;
  autor_nombre: string | null;
  responsable_id: string | null;
  responsable_nombre: string | null;
  creado_en: string;
  vence_en: string | null;
  cerrado_en: string | null;
  cerrado_por: string | null;
  cerrado_por_nombre: string | null;
}

/**
 * El día `AAAA-MM-DD` que el bufete escribe, en la forma de instante que la
 * columna exige por `CHECK`.
 *
 * Se guarda el **final** de ese día y no su comienzo porque un vencimiento
 * se cumple hasta el último momento del día que dice. El instante exacto es
 * un detalle de la columna: la comparación que importa —«¿ya pasó?»— es por
 * día y la hace la pantalla con el calendario de Panamá, no con este valor.
 * Por eso la conversión de vuelta es cortar los diez primeros caracteres, y
 * el ida y vuelta es exacto.
 */
function aInstante(dia: string): string {
  return `${dia}T23:59:59.999Z`;
}

function aDia(instante: string | null): string | null {
  return instante === null ? null : instante.slice(0, 10);
}

function aPendiente(fila: FilaDePendiente): PendienteDeProceso {
  return {
    id: fila.id,
    procesoEtapaId: fila.proceso_etapa_id,
    procesoEtapaNombre: fila.etapa_nombre,
    texto: fila.texto,
    autorId: fila.autor_id,
    autorNombre: fila.autor_nombre,
    responsableId: fila.responsable_id,
    responsableNombre: fila.responsable_nombre,
    creadoEn: fila.creado_en,
    venceEn: aDia(fila.vence_en),
    cerradoEn: fila.cerrado_en,
    cerradoPor: fila.cerrado_por,
    cerradoPorNombre: fila.cerrado_por_nombre,
  };
}

/**
 * Los abiertos primero; dentro de ellos, el que vence antes arriba y los sin
 * fecha al final; y de últimos los cerrados.
 *
 * El desempate final es `rowid`, que es el orden de inserción: dos
 * pendientes anotados dentro del mismo milisegundo comparten `creado_en`, y
 * sin desempate la lista cambiaría de orden entre lecturas.
 */
const ORDEN =
  " ORDER BY (p.cerrado_en IS NOT NULL), (p.vence_en IS NULL)," +
  " p.vence_en, p.creado_en, p.rowid";

/**
 * Las uniones repiten el filtro de tenencia en el `ON`, igual que T-7 con el
 * cliente y T-8 con el autor: una llave que cruzara la frontera devuelve
 * `NULL` en vez del nombre ajeno.
 *
 * Son `LEFT JOIN` incluso la de la etapa, que siempre existe: un `INNER`
 * haría desaparecer la fila en vez de delatar el problema, y un pendiente
 * que desaparece de la lista es exactamente el fracaso que esta tarea
 * existe para impedir.
 */
const SELECCION =
  "SELECT p.id, p.proceso_etapa_id, e.nombre AS etapa_nombre, p.texto," +
  " p.autor_id, a.nombre AS autor_nombre," +
  " p.responsable_id, r.nombre AS responsable_nombre," +
  " p.creado_en, p.vence_en, p.cerrado_en, p.cerrado_por," +
  " c.nombre AS cerrado_por_nombre" +
  " FROM pendiente p" +
  " LEFT JOIN proceso_etapa e ON e.id = p.proceso_etapa_id" +
  "   AND e.tenant_id = p.tenant_id" +
  " LEFT JOIN usuario a ON a.id = p.autor_id AND a.tenant_id = p.tenant_id" +
  " LEFT JOIN usuario r ON r.id = p.responsable_id" +
  "   AND r.tenant_id = p.tenant_id" +
  " LEFT JOIN usuario c ON c.id = p.cerrado_por AND c.tenant_id = p.tenant_id";

export function pendientesSobreD1(db: D1Database): ServicioDePendientes {
  /**
   * Los pendientes del proceso.
   *
   * **El `WHERE` filtra por proceso, no por etapa.** Esa ausencia es la
   * propiedad 2 de T-9 entera: por eso un pendiente abierto en la etapa 1
   * sigue visible en la etapa 4 sin que nadie lo haya copiado. Agregarle
   * aquí un `AND p.proceso_etapa_id = …` es la mutación que esa propiedad
   * tiene que detectar.
   */
  async function listar(
    tenantId: string,
    procesoId: string,
  ): Promise<PendienteDeProceso[]> {
    const { results } = await db
      .prepare(
        `${SELECCION} WHERE p.tenant_id = ? AND p.proceso_id = ?${ORDEN}`,
      )
      .bind(tenantId, procesoId)
      .all<FilaDePendiente>();

    return results.map(aPendiente);
  }

  /** ¿Es esta persona del bufete? Con el filtro de tenencia puesto. */
  async function esDelBufete(
    tenantId: string,
    usuarioId: string,
  ): Promise<boolean> {
    const fila = await db
      .prepare("SELECT id FROM usuario WHERE tenant_id = ? AND id = ?")
      .bind(tenantId, usuarioId)
      .first<{ id: string }>();

    return fila !== null;
  }

  return {
    listar,

    async crear(tenantId, procesoId, autorId, datos) {
      // El plan, con el filtro de tenencia puesto: de acá sale la etapa de
      // nacimiento y no del cuerpo de la petición.
      const { results } = await db
        .prepare(
          "SELECT id, nombre, orden, alcanzada_en FROM proceso_etapa" +
            " WHERE tenant_id = ? AND proceso_id = ?" +
            " ORDER BY orden, nombre COLLATE NOCASE",
        )
        .bind(tenantId, procesoId)
        .all<{
          id: string;
          nombre: string;
          orden: number;
          alcanzada_en: string | null;
        }>();

      const plan = results.map((fila) => ({
        id: fila.id,
        nombre: fila.nombre,
        orden: fila.orden,
        alcanzadaEn: fila.alcanzada_en,
      }));

      const anclaje = etapaVigente(plan);
      if (anclaje === null) {
        return {
          estado: "invalido",
          fallas: [{ campo: "procesoEtapaId", motivo: "proceso_sin_etapas" }],
        };
      }

      // Se **cuenta** antes de escribir, no se atrapa la llave foránea: un
      // `responsableId` del bufete vecino es un rechazo con su motivo, no un
      // `FOREIGN KEY constraint failed` disfrazado.
      if (
        datos.responsableId !== null &&
        !(await esDelBufete(tenantId, datos.responsableId))
      ) {
        return {
          estado: "invalido",
          fallas: [
            { campo: "responsableId", motivo: "responsable_desconocido" },
          ],
        };
      }

      await db
        .prepare(
          "INSERT INTO pendiente (id, tenant_id, proceso_id," +
            " proceso_etapa_id, texto, autor_id, responsable_id, creado_en," +
            " vence_en) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(
          nuevoId(),
          tenantId,
          procesoId,
          anclaje.id,
          datos.texto,
          autorId,
          datos.responsableId,
          ahoraIso(),
          datos.venceEn === null ? null : aInstante(datos.venceEn),
        )
        .run();

      // Se relee entera: lo que el servidor dejó guardado manda sobre lo que
      // la pantalla creía, igual que el `PUT` del plan en T-7 y el alta de
      // una nota en T-8.
      return { estado: "guardado", pendientes: await listar(tenantId, procesoId) };
    },

    async cerrar(tenantId, procesoId, pendienteId, quienCierra) {
      // Los tres filtros juntos: tenant, proceso y pendiente. Un pendiente
      // que existe pero es de otro proceso no se encuentra, y el 404 no
      // distingue «no existe» de «no es tuyo», que es lo que se busca.
      const fila = await db
        .prepare(
          "SELECT cerrado_en FROM pendiente" +
            " WHERE tenant_id = ? AND proceso_id = ? AND id = ?",
        )
        .bind(tenantId, procesoId, pendienteId)
        .first<{ cerrado_en: string | null }>();

      if (fila === null) return { estado: "no_encontrado" };
      if (fila.cerrado_en !== null) return { estado: "ya_cerrado" };

      // `AND cerrado_en IS NULL` también en el `UPDATE`, igual que el avance
      // de etapa en T-7: dos cierres simultáneos no pueden reescribir la
      // firma del primero.
      //
      // Los dos campos se escriben juntos porque el `CHECK` del esquema los
      // exige juntos. Esa restricción es la razón de ser de la tabla:
      // cerrar sin dejar quién cerró es el agujero que tapa.
      await db
        .prepare(
          "UPDATE pendiente SET cerrado_en = ?, cerrado_por = ?" +
            " WHERE tenant_id = ? AND proceso_id = ? AND id = ?" +
            " AND cerrado_en IS NULL",
        )
        .bind(ahoraIso(), quienCierra, tenantId, procesoId, pendienteId)
        .run();

      return { estado: "guardado", pendientes: await listar(tenantId, procesoId) };
    },
  };
}
