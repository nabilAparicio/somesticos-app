/**
 * El adaptador de D1 para los procesos y su plan de trabajo.
 *
 * `ServicioDeProcesos` es el puerto: lo que el ruteo conoce. La función de
 * abajo es la única implementación, y la única que sabe que existe SQL. Que
 * sea una interfaz y no una llamada directa es lo que deja probar que **una
 * petición sin identidad no llega hasta acá**, sustituyéndola por un espía.
 *
 * I-8 (`docs/diseno.md` §5) vive en cada consulta de este archivo: no hay una
 * sola que no filtre por `tenant_id`, ni siquiera las que buscan por llave
 * primaria. Un UUID ajeno sigue siendo un UUID.
 *
 * ## Las tres reglas que este archivo existe para sostener
 *
 * ### 1. La plantilla siembra, el proceso manda
 *
 * `crear` **copia** las filas de `etapa_plantilla` a `proceso_etapa`. No
 * guarda ninguna referencia a la plantilla: ni una columna, ni el id de
 * origen. Desde ese momento el proceso es dueño de su plan y editar la
 * plantilla no lo toca (`docs/diseno.md` §6, «Etapas»).
 *
 * Esa es la propiedad más importante del modelo, y la que hace que un proceso
 * en curso no cambie de plan porque alguien editó un molde.
 *
 * ### 2. Se quita una etapa pendiente; no se quita una alcanzada
 *
 * Las notas se anclan a la etapa donde ocurrieron y son inmutables por
 * disparador (I-6): borrar una etapa cumplida dejaría notas huérfanas o
 * reescribiría la historia, que es justo lo que el modelo existe para
 * impedir.
 *
 * **La guarda es el chequeo explícito de `guardarLoAlcanzado`, no un `catch`
 * del error de la base.** Es la misma disciplina que T-6 dejó asentada para
 * el borrado de catálogos: con un `catch` que tradujera el disparador de
 * `nota` o la llave foránea a una respuesta amable, aflojar la guarda no
 * rompería ninguna prueba y la guarda quedaría sin verificar para siempre.
 * Acá no se atrapa nada: la guarda se ve fallar, y cuando se la afloja mueren
 * sus pruebas.
 *
 * Y la guarda es **más que «no se quita»**: lo cumplido también tiene que
 * quedarse adelante y en su orden. Un plan que promete un paso *antes* de
 * algo que ya pasó no se puede dibujar separado en cumplido y pendiente, que
 * es exactamente lo que la pantalla de detalle tiene que mostrar.
 *
 * ### 3. Una etapa pendiente CON NOTAS tampoco se quita (T-8)
 *
 * Hasta T-7 una etapa pendiente no tenía nada colgando y quitarla era
 * gratis; T-7 dejó escrito que la guarda le tocaba a la tarea que creara la
 * dependencia. Es `guardarLoAnotado`, más abajo: cuenta las notas de cada
 * etapa que se va a borrar y rechaza diciendo cuántas lo impiden. Misma
 * disciplina que la regla 2 — el conteo explícito, nunca un `catch` del
 * error de la llave foránea.
 *
 * ### El avance es de una sola dirección
 *
 * No existe «desandar». `avanzar` solo escribe `alcanzada_en` donde era nulo,
 * y el `PUT` del plan **nunca toca esa columna**: el envío lleva id y nombre
 * y nada más. Es la decisión coherente con que una alcanzada no se borre —si
 * se pudiera volver a nulo, quitarla después sería legal y la regla de arriba
 * tendría una puerta trasera de dos pasos.
 *
 * Lo que este archivo NO hace, a propósito: escribir en `bitacora`. Ese
 * registro es T-10, y se va a cablear en un solo lugar.
 */

import type {
  DatosDeEtapa,
  DatosDeProceso,
  DetalleDeProceso,
  EstadoDeProceso,
  EtapaDeProceso,
  FallaDeValidacion,
  OrigenDeProceso,
  Proceso,
} from "../contract";
import { nuevoId } from "../db/ids";
import { ahoraIso } from "../db/momentos";

export type ResultadoDeEscritura =
  | { estado: "guardado"; detalle: DetalleDeProceso }
  | { estado: "invalido"; fallas: FallaDeValidacion[] }
  | { estado: "no_encontrado" };

export type ResultadoDeAvance =
  | { estado: "avanzado"; detalle: DetalleDeProceso }
  /** El plan ya no tiene nada por delante. No es un error de datos. */
  | { estado: "sin_pendientes" }
  | { estado: "no_encontrado" };

export interface ServicioDeProcesos {
  /** `clienteId` nulo es el listado global. */
  listar(tenantId: string, clienteId: string | null): Promise<Proceso[]>;
  obtener(tenantId: string, id: string): Promise<DetalleDeProceso | null>;
  crear(tenantId: string, datos: DatosDeProceso): Promise<ResultadoDeEscritura>;
  reemplazarEtapas(
    tenantId: string,
    procesoId: string,
    etapas: DatosDeEtapa[],
  ): Promise<ResultadoDeEscritura>;
  avanzar(tenantId: string, procesoId: string): Promise<ResultadoDeAvance>;
}

interface FilaDeProceso {
  id: string;
  cliente_id: string;
  cliente_nombre: string | null;
  tipo_proceso_id: string;
  tipo_proceso_nombre: string | null;
  area_nombre: string | null;
  origen: string;
  titulo: string;
  estado: string;
  responsable_id: string | null;
  responsable_nombre: string | null;
  abierto_en: string;
  cerrado_en: string | null;
  etapas_cumplidas: number;
  etapas_totales: number;
  etapa_vigente: string | null;
}

interface FilaDeEtapa {
  id: string;
  nombre: string;
  orden: number;
  alcanzada_en: string | null;
}

/**
 * Todo lo que la pantalla muestra de un proceso, en una sola consulta.
 *
 * Las tres uniones repiten el filtro de tenencia en el `ON`: un `cliente_id`
 * que cruzara la frontera devuelve `NULL` en vez del nombre ajeno. Es la
 * misma precaución que T-6 tomó con `area` en `tipo_proceso`.
 *
 * Los tres derivados del plan salen de subconsultas y no de un `GROUP BY`
 * sobre un `LEFT JOIN`: con la unión, un proceso de cuatro etapas se
 * multiplicaría por cuatro y habría que deduplicar a mano todo lo demás.
 *
 * `etapa_vigente` es **la próxima pendiente**, no la última cumplida. «Lo que
 * viene» es la mitad del valor de esta pantalla (`docs/diseno.md` §6): el
 * abogado abre un proceso para ver qué tiene por delante.
 */
const SELECCION =
  "SELECT p.id, p.cliente_id, c.nombre AS cliente_nombre," +
  " p.tipo_proceso_id, tp.nombre AS tipo_proceso_nombre," +
  " a.nombre AS area_nombre, p.origen, p.titulo, p.estado," +
  " p.responsable_id, u.nombre AS responsable_nombre," +
  " p.abierto_en, p.cerrado_en," +
  " (SELECT count(*) FROM proceso_etapa e" +
  "    WHERE e.proceso_id = p.id AND e.tenant_id = p.tenant_id" +
  "      AND e.alcanzada_en IS NOT NULL) AS etapas_cumplidas," +
  " (SELECT count(*) FROM proceso_etapa e" +
  "    WHERE e.proceso_id = p.id AND e.tenant_id = p.tenant_id)" +
  "   AS etapas_totales," +
  " (SELECT e.nombre FROM proceso_etapa e" +
  "    WHERE e.proceso_id = p.id AND e.tenant_id = p.tenant_id" +
  "      AND e.alcanzada_en IS NULL" +
  "    ORDER BY e.orden LIMIT 1) AS etapa_vigente" +
  " FROM proceso p" +
  " LEFT JOIN cliente c ON c.id = p.cliente_id AND c.tenant_id = p.tenant_id" +
  " LEFT JOIN tipo_proceso tp ON tp.id = p.tipo_proceso_id" +
  "   AND tp.tenant_id = p.tenant_id" +
  " LEFT JOIN area a ON a.id = tp.area_id AND a.tenant_id = tp.tenant_id" +
  " LEFT JOIN usuario u ON u.id = p.responsable_id" +
  "   AND u.tenant_id = p.tenant_id" +
  " WHERE p.tenant_id = ?";

/**
 * `origen` y `estado` llegan de la base como `TEXT`. El `CHECK` de la
 * migración los mantiene dentro del par válido, así que el estrechamiento es
 * una afirmación del esquema y no una validación: si la columna tuviera otra
 * cosa, el problema sería la base y no esta función.
 */
function aProceso(fila: FilaDeProceso): Proceso {
  return {
    id: fila.id,
    clienteId: fila.cliente_id,
    clienteNombre: fila.cliente_nombre,
    tipoProcesoId: fila.tipo_proceso_id,
    tipoProcesoNombre: fila.tipo_proceso_nombre,
    areaNombre: fila.area_nombre,
    origen: fila.origen as OrigenDeProceso,
    titulo: fila.titulo,
    estado: fila.estado as EstadoDeProceso,
    responsableId: fila.responsable_id,
    responsableNombre: fila.responsable_nombre,
    abiertoEn: fila.abierto_en,
    cerradoEn: fila.cerrado_en,
    etapasCumplidas: fila.etapas_cumplidas,
    etapasTotales: fila.etapas_totales,
    etapaVigente: fila.etapa_vigente,
  };
}

function aEtapa(fila: FilaDeEtapa): EtapaDeProceso {
  return {
    id: fila.id,
    nombre: fila.nombre,
    orden: fila.orden,
    alcanzadaEn: fila.alcanzada_en,
  };
}

/**
 * La guarda de la etapa alcanzada, escrita como función pura para que se la
 * pueda leer entera.
 *
 * `actuales` viene de la base en orden de plan. `enviadas` es lo que la
 * pantalla mandó, también en orden. Devuelve las fallas; vacío es «adelante».
 *
 * Las dos reglas, en este orden porque la primera explica mejor el problema:
 *
 *  1. **Ninguna alcanzada puede faltar.** Si falta, el `PUT` la borraría.
 *  2. **Las alcanzadas van al frente, en su orden.** Lo cumplido ya ocupó su
 *     lugar en el tiempo; prometer un paso antes de algo que ya pasó deja un
 *     plan que no se puede dibujar separado en cumplido y pendiente.
 */
function guardarLoAlcanzado(
  actuales: readonly EtapaDeProceso[],
  enviadas: readonly DatosDeEtapa[],
): FallaDeValidacion[] {
  const alcanzadas = actuales.filter((etapa) => etapa.alcanzadaEn !== null);
  if (alcanzadas.length === 0) return [];

  const presentes = new Set(
    enviadas
      .map((etapa) => etapa.id)
      .filter((id): id is string => id !== null),
  );

  const fallas: FallaDeValidacion[] = [];

  for (const etapa of alcanzadas) {
    if (!presentes.has(etapa.id)) {
      fallas.push({
        campo: `etapa-${String(etapa.orden)}`,
        motivo: "etapa_alcanzada_no_se_quita",
      });
    }
  }
  if (fallas.length > 0) return fallas;

  // Están todas; ahora, dónde. El prefijo del envío tiene que ser exactamente
  // las alcanzadas, en su mismo orden.
  alcanzadas.forEach((etapa, indice) => {
    if (enviadas[indice]?.id !== etapa.id) {
      fallas.push({
        campo: `etapa-${String(indice)}`,
        motivo: "etapa_alcanzada_no_se_mueve",
      });
    }
  });

  return fallas;
}

export function procesosSobreD1(db: D1Database): ServicioDeProcesos {
  async function leerEtapas(
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

  async function leerProceso(
    tenantId: string,
    id: string,
  ): Promise<Proceso | null> {
    const fila = await db
      .prepare(`${SELECCION} AND p.id = ?`)
      .bind(tenantId, id)
      .first<FilaDeProceso>();

    return fila === null ? null : aProceso(fila);
  }

  async function obtener(
    tenantId: string,
    id: string,
  ): Promise<DetalleDeProceso | null> {
    const proceso = await leerProceso(tenantId, id);
    if (proceso === null) return null;

    return { proceso, etapas: await leerEtapas(tenantId, id) };
  }

  /**
   * Relee el detalle después de escribir. Si no está, el `INSERT` o el
   * `UPDATE` no escribió: eso es un defecto, no un 404 de negocio.
   */
  async function releer(
    tenantId: string,
    id: string,
    que: string,
  ): Promise<DetalleDeProceso> {
    const detalle = await obtener(tenantId, id);
    if (detalle === null) {
      throw new Error(`${que} no se pudo releer`);
    }
    return detalle;
  }

  /**
   * Que la fila exista **en este tenant**. Una fila de otro tenant es, desde
   * acá, una fila que no existe.
   */
  async function existe(
    tabla: "cliente" | "tipo_proceso" | "usuario",
    tenantId: string,
    id: string,
  ): Promise<boolean> {
    const fila = await db
      .prepare(`SELECT id FROM ${tabla} WHERE tenant_id = ? AND id = ?`)
      .bind(tenantId, id)
      .first<{ id: string }>();

    return fila !== null;
  }

  /**
   * Las tres llaves que el alta recibe de afuera.
   *
   * No se exige `activo = 1` en el tipo de proceso, por la misma razón que
   * T-5 no lo exige del tipo de cliente y T-6 no lo exige del área: qué se
   * puede *elegir* lo decide la pantalla; qué es *válido* lo decide esto. Si
   * se exigiera, dar de baja un tipo rompería el alta de un proceso que el
   * bufete sí quiere abrir con él.
   */
  async function validarLlaves(
    tenantId: string,
    datos: DatosDeProceso,
  ): Promise<FallaDeValidacion[]> {
    const fallas: FallaDeValidacion[] = [];

    if (!(await existe("cliente", tenantId, datos.clienteId))) {
      fallas.push({ campo: "clienteId", motivo: "cliente_desconocido" });
    }
    if (!(await existe("tipo_proceso", tenantId, datos.tipoProcesoId))) {
      fallas.push({
        campo: "tipoProcesoId",
        motivo: "tipo_proceso_desconocido",
      });
    }
    if (
      datos.responsableId !== null &&
      !(await existe("usuario", tenantId, datos.responsableId))
    ) {
      fallas.push({
        campo: "responsableId",
        motivo: "responsable_desconocido",
      });
    }

    return fallas;
  }

  /**
   * La guarda que T-7 dejó encargada a T-8: **una etapa pendiente con notas
   * no se quita del plan.**
   *
   * Hasta T-8 una etapa pendiente no tenía nada colgando y quitarla era
   * gratis. Desde que existen las notas, quitarla chocaría contra la llave
   * foránea de `nota.proceso_etapa_id`, que T-2 dejó en `NO ACTION` a
   * propósito.
   *
   * **La guarda es este conteo, no un `catch` de ese choque.** Es la misma
   * disciplina que T-6 asentó para el borrado de catálogos y T-7 para la
   * etapa alcanzada: con un `catch` que tradujera el error de la base a una
   * respuesta amable, aflojar el conteo no rompería ninguna prueba y la
   * guarda quedaría sin verificar para siempre. Acá no se atrapa nada — al
   * aflojar esto, lo que sale es `FOREIGN KEY constraint failed` crudo, que
   * es exactamente lo que no tiene que llegarle a nadie.
   *
   * La falla viaja con `cuantos` porque «tiene notas» obliga a ir a
   * contarlas: el rechazo dice cuántas lo impiden, como el 409 de T-6 dice
   * cuántos dependientes hay.
   *
   * Un solo `GROUP BY` y no una consulta por etapa: quitar seis pasos de un
   * plan reordenado no tiene por qué costar seis viajes.
   */
  async function guardarLoAnotado(
    tenantId: string,
    procesoId: string,
    quitadas: readonly EtapaDeProceso[],
  ): Promise<FallaDeValidacion[]> {
    if (quitadas.length === 0) return [];

    const { results } = await db
      .prepare(
        "SELECT proceso_etapa_id, count(*) AS cuantas FROM nota" +
          " WHERE tenant_id = ? AND proceso_id = ?" +
          " GROUP BY proceso_etapa_id",
      )
      .bind(tenantId, procesoId)
      .all<{ proceso_etapa_id: string; cuantas: number }>();

    const notasPorEtapa = new Map(
      results.map((fila) => [fila.proceso_etapa_id, fila.cuantas]),
    );

    return quitadas.flatMap((etapa) => {
      const cuantos = notasPorEtapa.get(etapa.id) ?? 0;
      return cuantos === 0
        ? []
        : [
            {
              campo: `etapa-${String(etapa.orden)}`,
              motivo: "etapa_con_notas_no_se_quita" as const,
              cuantos,
            },
          ];
    });
  }

  return {
    async listar(tenantId, clienteId) {
      // Un `clienteId` que no es de este tenant no devuelve nada, porque el
      // filtro va encima del `WHERE p.tenant_id = ?` que ya está puesto: no
      // hay forma de que un identificador ajeno traiga filas ajenas.
      const consulta =
        clienteId === null
          ? db
              .prepare(
                `${SELECCION} ORDER BY c.nombre COLLATE NOCASE,` +
                  " p.titulo COLLATE NOCASE",
              )
              .bind(tenantId)
          : db
              .prepare(
                `${SELECCION} AND p.cliente_id = ?` +
                  " ORDER BY p.abierto_en DESC, p.titulo COLLATE NOCASE",
              )
              .bind(tenantId, clienteId);

      const { results } = await consulta.all<FilaDeProceso>();
      return results.map(aProceso);
    },

    obtener,

    async crear(tenantId, datos) {
      const fallas = await validarLlaves(tenantId, datos);
      if (fallas.length > 0) return { estado: "invalido", fallas };

      // La siembra: las etapas de la plantilla, en su orden, leídas con el
      // filtro de tenencia puesto igual que todo lo demás.
      const { results: plantilla } = await db
        .prepare(
          "SELECT nombre FROM etapa_plantilla" +
            " WHERE tenant_id = ? AND tipo_proceso_id = ?" +
            " ORDER BY orden, nombre COLLATE NOCASE",
        )
        .bind(tenantId, datos.tipoProcesoId)
        .all<{ nombre: string }>();

      const id = nuevoId();

      // Todo en un `batch`: un proceso guardado sin su plan es peor que
      // ninguno, porque se ve bien y está vacío.
      await db.batch([
        db
          .prepare(
            "INSERT INTO proceso (id, tenant_id, cliente_id," +
              " tipo_proceso_id, origen, titulo, estado, responsable_id," +
              " abierto_en) VALUES (?, ?, ?, ?, 'directo', ?, 'abierto', ?, ?)",
          )
          .bind(
            id,
            tenantId,
            datos.clienteId,
            datos.tipoProcesoId,
            datos.titulo,
            datos.responsableId,
            ahoraIso(),
          ),
        // `alcanzada_en` queda nulo: un proceso recién abierto no tiene nada
        // cumplido, ni siquiera su primer paso.
        ...plantilla.map((etapa, orden) =>
          db
            .prepare(
              "INSERT INTO proceso_etapa (id, tenant_id, proceso_id," +
                " nombre, orden) VALUES (?, ?, ?, ?, ?)",
            )
            .bind(nuevoId(), tenantId, id, etapa.nombre, orden),
        ),
      ]);

      return {
        estado: "guardado",
        detalle: await releer(tenantId, id, "el proceso recién creado"),
      };
    },

    async reemplazarEtapas(tenantId, procesoId, etapas) {
      if ((await leerProceso(tenantId, procesoId)) === null) {
        return { estado: "no_encontrado" };
      }

      const actuales = await leerEtapas(tenantId, procesoId);
      const existentes = new Set(actuales.map((etapa) => etapa.id));

      // Un id que no es de ESTE proceso no se toca: ni se actualiza (sería
      // editar la etapa de otro proceso, o la del bufete vecino) ni se
      // inserta con ese id prestado.
      const fallas: FallaDeValidacion[] = [];
      etapas.forEach((etapa, indice) => {
        if (etapa.id !== null && !existentes.has(etapa.id)) {
          fallas.push({
            campo: `etapa-${String(indice)}`,
            motivo: "etapa_desconocida",
          });
        }
      });
      if (fallas.length > 0) return { estado: "invalido", fallas };

      const deLoAlcanzado = guardarLoAlcanzado(actuales, etapas);
      if (deLoAlcanzado.length > 0) {
        return { estado: "invalido", fallas: deLoAlcanzado };
      }

      const conservados = new Set(
        etapas
          .map((etapa) => etapa.id)
          .filter((id): id is string => id !== null),
      );

      const quitadas = actuales.filter((etapa) => !conservados.has(etapa.id));
      const deLasNotas = await guardarLoAnotado(
        tenantId,
        procesoId,
        quitadas,
      );
      if (deLasNotas.length > 0) {
        return { estado: "invalido", fallas: deLasNotas };
      }

      // El `orden` es la posición en el arreglo, asignada acá y no por el
      // cliente: `proceso_etapa.orden` no tiene índice único (T-2 lo dejó así
      // a propósito), así que si el cliente lo eligiera, dos etapas con el
      // mismo `orden` entrarían sin que nada se quejara.
      //
      // El `UPDATE` **no menciona `alcanzada_en`**. Ese es el candado del
      // avance de una sola dirección: no hay forma de desandar por esta vía.
      const sentencias = [
        ...quitadas.map((etapa) =>
            db
              .prepare(
                "DELETE FROM proceso_etapa WHERE tenant_id = ?" +
                  " AND proceso_id = ? AND id = ?",
              )
              .bind(tenantId, procesoId, etapa.id),
          ),
        ...etapas.map((etapa, orden) =>
          etapa.id === null
            ? db
                .prepare(
                  "INSERT INTO proceso_etapa (id, tenant_id, proceso_id," +
                    " nombre, orden) VALUES (?, ?, ?, ?, ?)",
                )
                .bind(nuevoId(), tenantId, procesoId, etapa.nombre, orden)
            : db
                .prepare(
                  "UPDATE proceso_etapa SET nombre = ?, orden = ?" +
                    " WHERE tenant_id = ? AND proceso_id = ? AND id = ?",
                )
                .bind(etapa.nombre, orden, tenantId, procesoId, etapa.id),
        ),
      ];

      if (sentencias.length > 0) await db.batch(sentencias);

      return {
        estado: "guardado",
        detalle: await releer(tenantId, procesoId, "el plan recién guardado"),
      };
    },

    async avanzar(tenantId, procesoId) {
      if ((await leerProceso(tenantId, procesoId)) === null) {
        return { estado: "no_encontrado" };
      }

      // La próxima pendiente en el orden del plan. Avanzar no salta pasos:
      // saltarlos dejaría cumplidas y pendientes intercaladas, y la pantalla
      // dejaría de poder mostrar «lo que falta» como una lista.
      const siguiente = await db
        .prepare(
          "SELECT id FROM proceso_etapa" +
            " WHERE tenant_id = ? AND proceso_id = ? AND alcanzada_en IS NULL" +
            " ORDER BY orden, nombre COLLATE NOCASE LIMIT 1",
        )
        .bind(tenantId, procesoId)
        .first<{ id: string }>();

      if (siguiente === null) return { estado: "sin_pendientes" };

      // `AND alcanzada_en IS NULL` también en el `UPDATE`: dos avances
      // simultáneos no pueden reescribir el momento de una etapa ya marcada.
      await db
        .prepare(
          "UPDATE proceso_etapa SET alcanzada_en = ?" +
            " WHERE tenant_id = ? AND proceso_id = ? AND id = ?" +
            " AND alcanzada_en IS NULL",
        )
        .bind(ahoraIso(), tenantId, procesoId, siguiente.id)
        .run();

      return {
        estado: "avanzado",
        detalle: await releer(tenantId, procesoId, "el proceso recién avanzado"),
      };
    },
  };
}
