/**
 * El adaptador de D1 para las notas y la línea de tiempo.
 *
 * `ServicioDeNotas` es el puerto: lo que el ruteo conoce. La función de
 * abajo es la única implementación, y la única que sabe que existe SQL. Que
 * sea una interfaz y no una llamada directa es lo que deja probar que **una
 * petición sin identidad no llega hasta acá**, sustituyéndola por un espía.
 *
 * I-8 (`docs/diseno.md` §5) vive en cada consulta de este archivo: no hay
 * una sola que no filtre por `tenant_id`, ni siquiera las que buscan por
 * llave primaria. Un UUID ajeno sigue siendo un UUID.
 *
 * ## A qué etapa se ancla una nota
 *
 * `nota.proceso_etapa_id` es `NOT NULL` (T-2: «una nota sin etapa no es una
 * nota de este modelo»), y un proceso recién abierto no tiene **ninguna**
 * etapa alcanzada. La decisión, tomada acá y declarada en el contrato:
 *
 *  - Por defecto se ancla a la **etapa vigente**, que es exactamente la que
 *    el listado ya muestra como «lo que viene»: la primera pendiente en el
 *    orden del plan. En un proceso recién abierto eso es su primer paso, que
 *    es donde el trabajo está pasando cuando alguien escribe.
 *  - Si no queda ninguna pendiente, la **última alcanzada**: es donde el
 *    proceso está parado, y seguir trabajo después del último paso del plan
 *    es normal.
 *  - Si el proceso **no tiene ninguna etapa**, se rechaza con
 *    `proceso_sin_etapas`. El servidor no inventa un paso para poder
 *    guardar: inventarlo metería en el plan de trabajo algo que nadie
 *    decidió, y el plan es lo que el abogado lee para saber qué falta.
 *
 * Y **quien escribe puede elegir otra etapa del mismo proceso**. Una nota se
 * escribe a veces días después del hecho, y como es inmutable, el momento de
 * escribirla es la única oportunidad de anclarla donde de verdad ocurrió.
 * Una etapa de otro proceso —o de otro bufete— no es una opción: es
 * `etapa_de_otro_proceso`, comprobado contra el plan leído con el filtro de
 * tenencia puesto.
 *
 * ## Lo que este archivo NO hace, a propósito
 *
 *  - **No actualiza ni borra.** No hay método, no hay ruta y no hay
 *    identificador público de una nota. La base lo sostiene aparte con los
 *    dos disparadores de T-2; esto no es una segunda copia de esa regla sino
 *    la ausencia del camino.
 *  - **No escribe en `bitacora`.** Ese registro es T-10, y se va a cablear
 *    en un solo lugar. Una nota es intención; la bitácora es hecho del
 *    sistema.
 */

import type {
  DatosDeNota,
  EtapaDeProceso,
  FallaDeValidacion,
  LineaDeTiempo,
  NotaDeProceso,
} from "../contract";
import { nuevoId } from "../db/ids";
import { ahoraIso } from "../db/momentos";

export type ResultadoDeNota =
  | { estado: "guardada"; linea: LineaDeTiempo }
  | { estado: "invalido"; fallas: FallaDeValidacion[] };

export interface ServicioDeNotas {
  /** Las notas del proceso, agrupadas por etapa, en el orden del plan. */
  lineaDeTiempo(tenantId: string, procesoId: string): Promise<LineaDeTiempo>;
  crear(
    tenantId: string,
    procesoId: string,
    autorId: string,
    datos: DatosDeNota,
  ): Promise<ResultadoDeNota>;
}

interface FilaDeEtapa {
  id: string;
  nombre: string;
  orden: number;
  alcanzada_en: string | null;
}

interface FilaDeNota {
  id: string;
  proceso_etapa_id: string;
  texto: string;
  autor_id: string;
  autor_nombre: string | null;
  creada_en: string;
}

function aEtapa(fila: FilaDeEtapa): EtapaDeProceso {
  return {
    id: fila.id,
    nombre: fila.nombre,
    orden: fila.orden,
    alcanzadaEn: fila.alcanzada_en,
  };
}

function aNota(fila: FilaDeNota): NotaDeProceso {
  return {
    id: fila.id,
    procesoEtapaId: fila.proceso_etapa_id,
    texto: fila.texto,
    autorId: fila.autor_id,
    autorNombre: fila.autor_nombre,
    creadaEn: fila.creada_en,
  };
}

/**
 * La etapa vigente del plan: la primera pendiente, o la última alcanzada si
 * no queda ninguna pendiente. `null` solo cuando el plan está vacío.
 *
 * Es función pura y recibe el plan ya ordenado para que la regla se pueda
 * leer entera sin mirar SQL. La misma definición de «vigente» que
 * `etapa_vigente` en `worker/procesos/repositorio.ts`, con la cola que acá
 * hace falta porque una nota tiene que colgar de algo incluso cuando no
 * falta nada.
 */
export function etapaVigente(
  plan: readonly EtapaDeProceso[],
): EtapaDeProceso | null {
  if (plan.length === 0) return null;

  return (
    plan.find((etapa) => etapa.alcanzadaEn === null) ?? plan[plan.length - 1]
  );
}

export function notasSobreD1(db: D1Database): ServicioDeNotas {
  /** El plan del proceso, en su orden. Con el filtro de tenencia puesto. */
  async function leerPlan(
    tenantId: string,
    procesoId: string,
  ): Promise<EtapaDeProceso[]> {
    const { results } = await db
      .prepare(
        "SELECT id, nombre, orden, alcanzada_en FROM proceso_etapa" +
          " WHERE tenant_id = ? AND proceso_id = ?" +
          " ORDER BY orden, nombre COLLATE NOCASE",
      )
      .bind(tenantId, procesoId)
      .all<FilaDeEtapa>();

    return results.map(aEtapa);
  }

  /**
   * Las notas del proceso, ya ordenadas por etapa y, dentro de cada etapa,
   * por el momento en que se escribieron.
   *
   * El desempate es `n.rowid`, que es el orden de inserción: dos notas
   * escritas dentro del mismo milisegundo tienen el mismo `creada_en`, y sin
   * desempate la línea de tiempo las mostraría en un orden que cambia entre
   * lecturas.
   *
   * La unión con `usuario` repite el filtro de tenencia en el `ON`, igual
   * que T-7 con el cliente: un `autor_id` que cruzara la frontera devuelve
   * `NULL` en vez del nombre ajeno.
   */
  async function leerNotas(
    tenantId: string,
    procesoId: string,
  ): Promise<NotaDeProceso[]> {
    const { results } = await db
      .prepare(
        "SELECT n.id, n.proceso_etapa_id, n.texto, n.autor_id," +
          " u.nombre AS autor_nombre, n.creada_en" +
          " FROM nota n" +
          " JOIN proceso_etapa e ON e.id = n.proceso_etapa_id" +
          "   AND e.tenant_id = n.tenant_id" +
          " LEFT JOIN usuario u ON u.id = n.autor_id" +
          "   AND u.tenant_id = n.tenant_id" +
          " WHERE n.tenant_id = ? AND n.proceso_id = ?" +
          " ORDER BY e.orden, n.creada_en, n.rowid",
      )
      .bind(tenantId, procesoId)
      .all<FilaDeNota>();

    return results.map(aNota);
  }

  /**
   * Agrupa las notas bajo su etapa, en el orden del plan.
   *
   * **Solo las etapas que tienen notas.** La línea de tiempo es el registro
   * de lo que pasó, no una segunda copia del plan: el plan ya está en la
   * pantalla separado en cumplido y pendiente.
   */
  async function lineaDeTiempo(
    tenantId: string,
    procesoId: string,
  ): Promise<LineaDeTiempo> {
    const [plan, notas] = await Promise.all([
      leerPlan(tenantId, procesoId),
      leerNotas(tenantId, procesoId),
    ]);

    const porEtapa = new Map<string, NotaDeProceso[]>();
    for (const nota of notas) {
      const acumuladas = porEtapa.get(nota.procesoEtapaId);
      if (acumuladas === undefined) {
        porEtapa.set(nota.procesoEtapaId, [nota]);
      } else {
        acumuladas.push(nota);
      }
    }

    return {
      tramos: plan.flatMap((etapa) => {
        const suyas = porEtapa.get(etapa.id);
        return suyas === undefined ? [] : [{ etapa, notas: suyas }];
      }),
    };
  }

  return {
    lineaDeTiempo,

    async crear(tenantId, procesoId, autorId, datos) {
      const plan = await leerPlan(tenantId, procesoId);

      if (plan.length === 0) {
        return {
          estado: "invalido",
          fallas: [{ campo: "procesoEtapaId", motivo: "proceso_sin_etapas" }],
        };
      }

      // La etapa elegida se comprueba contra ESTE plan, que ya vino filtrado
      // por tenencia: una etapa de otro proceso —o de otro bufete— no está
      // en la lista, y no hay forma de que lo esté.
      const anclaje =
        datos.procesoEtapaId === null
          ? etapaVigente(plan)
          : (plan.find((etapa) => etapa.id === datos.procesoEtapaId) ?? null);

      if (anclaje === null) {
        return {
          estado: "invalido",
          fallas: [
            { campo: "procesoEtapaId", motivo: "etapa_de_otro_proceso" },
          ],
        };
      }

      await db
        .prepare(
          "INSERT INTO nota (id, tenant_id, proceso_id, proceso_etapa_id," +
            " texto, autor_id, creada_en) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(
          nuevoId(),
          tenantId,
          procesoId,
          anclaje.id,
          datos.texto,
          autorId,
          ahoraIso(),
        )
        .run();

      // Se relee entera: lo que el servidor dejó guardado manda sobre lo que
      // la pantalla creía, igual que el `PUT` del plan en T-7.
      return {
        estado: "guardada",
        linea: await lineaDeTiempo(tenantId, procesoId),
      };
    },
  };
}
