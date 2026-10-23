/**
 * El adaptador de D1 para los catálogos del bufete.
 *
 * `ServicioDeCatalogos` es el puerto: lo que el ruteo conoce. La función de
 * abajo es la única implementación, y la única que sabe que existe SQL. Que
 * sea una interfaz y no una llamada directa es lo que deja probar que **una
 * petición sin identidad no llega hasta acá**, sustituyéndola por un espía.
 *
 * I-8 (`docs/diseno.md` §5) vive en cada consulta de este archivo: no hay una
 * sola que no filtre por `tenant_id`, ni siquiera las que buscan por llave
 * primaria. Un UUID ajeno sigue siendo un UUID.
 *
 * ## La política de borrado, que T-2 dejó a esta tarea
 *
 * Las llaves foráneas quedaron en `NO ACTION`, que es lo que impide borrar un
 * padre con hijos. Eso, solo, saldría como un error de SQL crudo con un 500
 * encima. Acá se decide lo otro:
 *
 *  - **Se cuenta antes de borrar.** `dependenciasDe…` devuelve qué cuelga de
 *    la fila y cuántos son; el ruteo lo convierte en un 409 que lo dice. El
 *    conteo filtra por tenant igual que todo lo demás: un dependiente del
 *    vecino no puede bloquear un borrado nuestro.
 *  - **No se atrapa el error de la base para disfrazarlo de 409.** Sería la
 *    red que hace que la guarda de conteo deje de estar probada: aflojarla no
 *    rompería ninguna prueba. La guarda es el conteo, y se ve fallar.
 *  - **Lo normal no es borrar, es dar de baja.** `activo = 0` saca la fila de
 *    lo elegible sin invalidar lo ya guardado — la misma distinción entre
 *    *válido* y *seleccionable* que estableció T-5.
 *
 * Lo que este archivo NO hace, a propósito: escribir en `bitacora`. Ese
 * registro es T-10, y se va a cablear en un solo lugar.
 */

import type {
  Area,
  DatosDeCatalogo,
  DatosDeEtapa,
  DatosDeTipoProceso,
  Dependencia,
  EtapaPlantilla,
  FallaDeValidacion,
  TipoCliente,
  TipoProceso,
} from "../contract";
import { nuevoId } from "../db/ids";

export type ResultadoDeEscritura<T> =
  | { estado: "guardado"; fila: T }
  | { estado: "invalido"; fallas: FallaDeValidacion[] }
  | { estado: "no_encontrado" };

export type ResultadoDeBorrado =
  | { estado: "borrado" }
  | { estado: "bloqueado"; dependencias: Dependencia[] }
  | { estado: "no_encontrado" };

export type ResultadoDeEtapas =
  | { estado: "guardado"; etapas: EtapaPlantilla[] }
  | { estado: "invalido"; fallas: FallaDeValidacion[] }
  | { estado: "no_encontrado" };

export interface ServicioDeCatalogos {
  listarAreas(tenantId: string): Promise<Area[]>;
  obtenerArea(tenantId: string, id: string): Promise<Area | null>;
  crearArea(
    tenantId: string,
    datos: DatosDeCatalogo,
  ): Promise<ResultadoDeEscritura<Area>>;
  actualizarArea(
    tenantId: string,
    id: string,
    datos: DatosDeCatalogo,
  ): Promise<ResultadoDeEscritura<Area>>;
  borrarArea(tenantId: string, id: string): Promise<ResultadoDeBorrado>;

  listarTiposProceso(tenantId: string): Promise<TipoProceso[]>;
  obtenerTipoProceso(tenantId: string, id: string): Promise<TipoProceso | null>;
  crearTipoProceso(
    tenantId: string,
    datos: DatosDeTipoProceso,
  ): Promise<ResultadoDeEscritura<TipoProceso>>;
  actualizarTipoProceso(
    tenantId: string,
    id: string,
    datos: DatosDeTipoProceso,
  ): Promise<ResultadoDeEscritura<TipoProceso>>;
  borrarTipoProceso(tenantId: string, id: string): Promise<ResultadoDeBorrado>;

  listarEtapas(
    tenantId: string,
    tipoProcesoId: string,
  ): Promise<EtapaPlantilla[] | null>;
  reemplazarEtapas(
    tenantId: string,
    tipoProcesoId: string,
    etapas: DatosDeEtapa[],
  ): Promise<ResultadoDeEtapas>;

  listarTiposCliente(tenantId: string): Promise<TipoCliente[]>;
  obtenerTipoCliente(tenantId: string, id: string): Promise<TipoCliente | null>;
  crearTipoCliente(
    tenantId: string,
    datos: DatosDeCatalogo,
  ): Promise<ResultadoDeEscritura<TipoCliente>>;
  actualizarTipoCliente(
    tenantId: string,
    id: string,
    datos: DatosDeCatalogo,
  ): Promise<ResultadoDeEscritura<TipoCliente>>;
  borrarTipoCliente(tenantId: string, id: string): Promise<ResultadoDeBorrado>;
}

interface FilaSimple {
  id: string;
  nombre: string;
  activo: number;
}

interface FilaDeTipoProceso {
  id: string;
  area_id: string;
  area_nombre: string | null;
  nombre: string;
  descripcion: string | null;
  activo: number;
}

interface FilaDeEtapa {
  id: string;
  nombre: string;
  orden: number;
}

/**
 * La unión con `area` lleva su propio `tenant_id`: un `area_id` que cruzara
 * la frontera devuelve `NULL` en vez del nombre ajeno.
 */
const SELECCION_DE_TIPO =
  "SELECT t.id, t.area_id, a.nombre AS area_nombre, t.nombre," +
  " t.descripcion, t.activo" +
  " FROM tipo_proceso t" +
  " LEFT JOIN area a ON a.id = t.area_id AND a.tenant_id = t.tenant_id" +
  " WHERE t.tenant_id = ?";

function aSimple(fila: FilaSimple): Area {
  return { id: fila.id, nombre: fila.nombre, activo: fila.activo === 1 };
}

function aTipoProceso(fila: FilaDeTipoProceso): TipoProceso {
  return {
    id: fila.id,
    areaId: fila.area_id,
    areaNombre: fila.area_nombre,
    nombre: fila.nombre,
    descripcion: fila.descripcion,
    activo: fila.activo === 1,
  };
}

export function catalogosSobreD1(db: D1Database): ServicioDeCatalogos {
  // -------------------------------------------------------------------------
  // Los dos catálogos planos: `area` y `tipo_cliente`
  // -------------------------------------------------------------------------

  /**
   * `area` y `tipo_cliente` tienen la misma forma y las mismas reglas, así
   * que comparten implementación y se distinguen solo por el nombre de la
   * tabla. El nombre nunca viene de la petición: sale de esta constante, que
   * es lo que hace que interpolarlo en el SQL sea seguro.
   */
  function catalogoPlano(tabla: "area" | "tipo_cliente") {
    async function obtener(
      tenantId: string,
      id: string,
    ): Promise<Area | null> {
      const fila = await db
        .prepare(
          `SELECT id, nombre, activo FROM ${tabla}` +
            " WHERE tenant_id = ? AND id = ?",
        )
        .bind(tenantId, id)
        .first<FilaSimple>();

      return fila === null ? null : aSimple(fila);
    }

    async function listar(tenantId: string): Promise<Area[]> {
      const { results } = await db
        .prepare(
          `SELECT id, nombre, activo FROM ${tabla}` +
            " WHERE tenant_id = ? ORDER BY nombre COLLATE NOCASE",
        )
        .bind(tenantId)
        .all<FilaSimple>();

      return results.map(aSimple);
    }

    async function crear(
      tenantId: string,
      datos: DatosDeCatalogo,
    ): Promise<ResultadoDeEscritura<Area>> {
      const id = nuevoId();

      await db
        .prepare(
          `INSERT INTO ${tabla} (id, tenant_id, nombre, activo)` +
            " VALUES (?, ?, ?, ?)",
        )
        .bind(id, tenantId, datos.nombre, datos.activo ? 1 : 0)
        .run();

      const fila = await obtener(tenantId, id);
      if (fila === null) {
        // Inalcanzable salvo que el `INSERT` no haya escrito: si pasa, es un
        // defecto y no un 404 de negocio.
        throw new Error(`la fila de ${tabla} recién creada no se pudo releer`);
      }

      return { estado: "guardado", fila };
    }

    async function actualizar(
      tenantId: string,
      id: string,
      datos: DatosDeCatalogo,
    ): Promise<ResultadoDeEscritura<Area>> {
      // La existencia se comprueba **dentro del tenant**. Una fila de otro
      // tenant es, desde acá, una fila que no existe.
      if ((await obtener(tenantId, id)) === null) {
        return { estado: "no_encontrado" };
      }

      await db
        .prepare(
          `UPDATE ${tabla} SET nombre = ?, activo = ?` +
            " WHERE tenant_id = ? AND id = ?",
        )
        .bind(datos.nombre, datos.activo ? 1 : 0, tenantId, id)
        .run();

      const fila = await obtener(tenantId, id);
      if (fila === null) return { estado: "no_encontrado" };

      return { estado: "guardado", fila };
    }

    async function borrar(
      tenantId: string,
      id: string,
      dependenciasDe: (tenantId: string, id: string) => Promise<Dependencia[]>,
    ): Promise<ResultadoDeBorrado> {
      if ((await obtener(tenantId, id)) === null) {
        return { estado: "no_encontrado" };
      }

      const dependencias = await dependenciasDe(tenantId, id);
      if (dependencias.length > 0) return { estado: "bloqueado", dependencias };

      await db
        .prepare(`DELETE FROM ${tabla} WHERE tenant_id = ? AND id = ?`)
        .bind(tenantId, id)
        .run();

      return { estado: "borrado" };
    }

    return { obtener, listar, crear, actualizar, borrar };
  }

  const areas = catalogoPlano("area");
  const tiposCliente = catalogoPlano("tipo_cliente");

  /**
   * Cuántas filas de `tabla` cuelgan de `id` **en este tenant**.
   *
   * El filtro por tenant no es higiene repetida: sin él, un tipo de proceso
   * del bufete vecino que colgara de SU área bloquearía el borrado de un área
   * nuestra que está vacía.
   */
  async function contar(
    tabla: "tipo_proceso" | "etapa_plantilla" | "proceso" | "cliente",
    columna: string,
    tenantId: string,
    id: string,
  ): Promise<number> {
    const fila = await db
      .prepare(
        `SELECT count(*) AS n FROM ${tabla}` +
          ` WHERE tenant_id = ? AND ${columna} = ?`,
      )
      .bind(tenantId, id)
      .first<{ n: number }>();

    return fila?.n ?? 0;
  }

  async function dependencias(
    cuentas: readonly [Dependencia["entidad"], Promise<number>][],
  ): Promise<Dependencia[]> {
    const resueltas: Dependencia[] = [];

    for (const [entidad, promesa] of cuentas) {
      const cuantos = await promesa;
      if (cuantos > 0) resueltas.push({ entidad, cuantos });
    }

    return resueltas;
  }

  // -------------------------------------------------------------------------
  // Tipos de proceso
  // -------------------------------------------------------------------------

  async function obtenerTipoProceso(
    tenantId: string,
    id: string,
  ): Promise<TipoProceso | null> {
    const fila = await db
      .prepare(`${SELECCION_DE_TIPO} AND t.id = ?`)
      .bind(tenantId, id)
      .first<FilaDeTipoProceso>();

    return fila === null ? null : aTipoProceso(fila);
  }

  /**
   * El área tiene que ser una fila de `area` **de este tenant**.
   *
   * No se exige `activo = 1`, por la misma razón que T-5 no lo exige del tipo
   * de cliente: dar de baja un área dejaría sin poder guardar a todos sus
   * tipos, y renombrar uno fallaría con un error que no se entiende. Qué se
   * puede *elegir* lo decide la pantalla; qué es *válido* es esto.
   */
  async function validarArea(
    tenantId: string,
    areaId: string,
  ): Promise<FallaDeValidacion[]> {
    const fila = await db
      .prepare("SELECT id FROM area WHERE tenant_id = ? AND id = ?")
      .bind(tenantId, areaId)
      .first<{ id: string }>();

    return fila === null
      ? [{ campo: "areaId", motivo: "area_desconocida" }]
      : [];
  }

  // -------------------------------------------------------------------------
  // La plantilla
  // -------------------------------------------------------------------------

  async function leerEtapas(
    tenantId: string,
    tipoProcesoId: string,
  ): Promise<EtapaPlantilla[]> {
    const { results } = await db
      .prepare(
        "SELECT id, nombre, orden FROM etapa_plantilla" +
          " WHERE tenant_id = ? AND tipo_proceso_id = ?" +
          " ORDER BY orden, nombre COLLATE NOCASE",
      )
      .bind(tenantId, tipoProcesoId)
      .all<FilaDeEtapa>();

    return results.map((fila) => ({
      id: fila.id,
      nombre: fila.nombre,
      orden: fila.orden,
    }));
  }

  return {
    listarAreas: areas.listar,
    obtenerArea: areas.obtener,
    crearArea: areas.crear,
    actualizarArea: areas.actualizar,

    borrarArea(tenantId, id) {
      return areas.borrar(tenantId, id, (t, i) =>
        dependencias([["tipo_proceso", contar("tipo_proceso", "area_id", t, i)]]),
      );
    },

    listarTiposCliente: tiposCliente.listar,
    obtenerTipoCliente: tiposCliente.obtener,
    crearTipoCliente: tiposCliente.crear,
    actualizarTipoCliente: tiposCliente.actualizar,

    borrarTipoCliente(tenantId, id) {
      return tiposCliente.borrar(tenantId, id, (t, i) =>
        dependencias([["cliente", contar("cliente", "tipo_cliente_id", t, i)]]),
      );
    },

    async listarTiposProceso(tenantId) {
      const { results } = await db
        .prepare(
          `${SELECCION_DE_TIPO} ORDER BY a.nombre COLLATE NOCASE,` +
            " t.nombre COLLATE NOCASE",
        )
        .bind(tenantId)
        .all<FilaDeTipoProceso>();

      return results.map(aTipoProceso);
    },

    obtenerTipoProceso,

    async crearTipoProceso(tenantId, datos) {
      const fallas = await validarArea(tenantId, datos.areaId);
      if (fallas.length > 0) return { estado: "invalido", fallas };

      const id = nuevoId();

      await db
        .prepare(
          "INSERT INTO tipo_proceso (id, tenant_id, area_id, nombre," +
            " descripcion, activo) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(
          id,
          tenantId,
          datos.areaId,
          datos.nombre,
          datos.descripcion,
          datos.activo ? 1 : 0,
        )
        .run();

      const fila = await obtenerTipoProceso(tenantId, id);
      if (fila === null) {
        throw new Error("el tipo de proceso recién creado no se pudo releer");
      }

      return { estado: "guardado", fila };
    },

    async actualizarTipoProceso(tenantId, id, datos) {
      if ((await obtenerTipoProceso(tenantId, id)) === null) {
        return { estado: "no_encontrado" };
      }

      const fallas = await validarArea(tenantId, datos.areaId);
      if (fallas.length > 0) return { estado: "invalido", fallas };

      await db
        .prepare(
          "UPDATE tipo_proceso SET area_id = ?, nombre = ?," +
            " descripcion = ?, activo = ? WHERE tenant_id = ? AND id = ?",
        )
        .bind(
          datos.areaId,
          datos.nombre,
          datos.descripcion,
          datos.activo ? 1 : 0,
          tenantId,
          id,
        )
        .run();

      const fila = await obtenerTipoProceso(tenantId, id);
      if (fila === null) return { estado: "no_encontrado" };

      return { estado: "guardado", fila };
    },

    async borrarTipoProceso(tenantId, id) {
      if ((await obtenerTipoProceso(tenantId, id)) === null) {
        return { estado: "no_encontrado" };
      }

      const bloqueantes = await dependencias([
        [
          "etapa_plantilla",
          contar("etapa_plantilla", "tipo_proceso_id", tenantId, id),
        ],
        ["proceso", contar("proceso", "tipo_proceso_id", tenantId, id)],
      ]);
      if (bloqueantes.length > 0) {
        return { estado: "bloqueado", dependencias: bloqueantes };
      }

      await db
        .prepare("DELETE FROM tipo_proceso WHERE tenant_id = ? AND id = ?")
        .bind(tenantId, id)
        .run();

      return { estado: "borrado" };
    },

    async listarEtapas(tenantId, tipoProcesoId) {
      // El 404 del tipo de proceso manda sobre la lista: una plantilla vacía
      // y «ese tipo no es de este bufete» no pueden contestar lo mismo.
      if ((await obtenerTipoProceso(tenantId, tipoProcesoId)) === null) {
        return null;
      }

      return leerEtapas(tenantId, tipoProcesoId);
    },

    async reemplazarEtapas(tenantId, tipoProcesoId, etapas) {
      if ((await obtenerTipoProceso(tenantId, tipoProcesoId)) === null) {
        return { estado: "no_encontrado" };
      }

      const existentes = new Set(
        (await leerEtapas(tenantId, tipoProcesoId)).map((etapa) => etapa.id),
      );

      // Un id que no es de ESTA plantilla no se toca: ni se actualiza (sería
      // editar la etapa de otro tipo, o la del bufete vecino) ni se inserta
      // con ese id prestado.
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

      const conservados = new Set(
        etapas
          .map((etapa) => etapa.id)
          .filter((id): id is string => id !== null),
      );

      // El `orden` es la posición en el arreglo, asignada acá y no por el
      // cliente. Todo va en un `batch`: media plantilla guardada es peor que
      // ninguna.
      const sentencias = [
        ...[...existentes]
          .filter((id) => !conservados.has(id))
          .map((id) =>
            db
              .prepare(
                "DELETE FROM etapa_plantilla WHERE tenant_id = ? AND id = ?",
              )
              .bind(tenantId, id),
          ),
        ...etapas.map((etapa, orden) =>
          etapa.id === null
            ? db
                .prepare(
                  "INSERT INTO etapa_plantilla (id, tenant_id," +
                    " tipo_proceso_id, nombre, orden) VALUES (?, ?, ?, ?, ?)",
                )
                .bind(nuevoId(), tenantId, tipoProcesoId, etapa.nombre, orden)
            : db
                .prepare(
                  "UPDATE etapa_plantilla SET nombre = ?, orden = ?" +
                    " WHERE tenant_id = ? AND tipo_proceso_id = ? AND id = ?",
                )
                .bind(
                  etapa.nombre,
                  orden,
                  tenantId,
                  tipoProcesoId,
                  etapa.id,
                ),
        ),
      ];

      if (sentencias.length > 0) await db.batch(sentencias);

      return {
        estado: "guardado",
        etapas: await leerEtapas(tenantId, tipoProcesoId),
      };
    },
  };
}
