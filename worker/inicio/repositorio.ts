/**
 * El adaptador de D1 del tablero de Inicio.
 *
 * `ServicioDelInicio` es el puerto: lo que el ruteo conoce. La función de
 * abajo es la única implementación, y la única que sabe que existe SQL. Que
 * sea una interfaz es lo que deja probar que **una petición sin identidad no
 * llega hasta acá**, sustituyéndola por un espía.
 *
 * I-8 (`docs/diseno.md` §5) vive en cada consulta: todas filtran por
 * `tenant_id`, y las uniones lo repiten en el `ON`, igual que T-7.
 *
 * ## Cinco consultas, ninguna por fila
 *
 * Los pendientes, las cotizaciones por atender, los borradores por mes, las
 * transiciones por mes y la distribución. Cada una es **una** consulta que
 * agrega en la base; ninguna se repite por proceso ni por mes. Corren en
 * paralelo porque no dependen entre sí.
 *
 * ## De dónde sale cada número
 *
 *  - **Borrador** por `cotizacion.creada_en`: abrir un borrador no deja
 *    entrada de transición, nace así.
 *  - **Emitida, ganada y perdida** por la bitácora (`emitido`, `ganado`,
 *    `perdido`), que es el registro del momento en que pasó. El estado de la
 *    fila dice dónde está hoy, no cuándo llegó. Se cuentan cotizaciones
 *    **distintas**, para que una entrada repetida no infle el mes.
 *  - **«Mías»** filtra por `creada_por`, también en las transiciones: una
 *    cotización es de quien la creó, aunque la haya cerrado otro.
 *
 * ## Lo que este archivo NO hace, a propósito
 *
 *  - **No escribe.** Recibe `BaseDeDatos` y solo usa `lectura`.
 *  - **No suma plata.** Ni montos ni moneda: decisión del usuario.
 */

import type {
  AlcanceDelInicio,
  CotizacionDelInicio,
  CuentaPorEstado,
  EstadoDeCotizacion,
  MesDelInicio,
  PendienteDelInicio,
  RespuestaDelInicio,
} from "../contract";
import type { BaseDeDatos } from "../db/base";
import { diaEnPanama, finDelDiaEnPanama, hoyEnPanama } from "../db/momentos";
import {
  AL_RELOJ_DE_PANAMA,
  DIAS_DE_AVISO,
  cuentaVacia,
  mesesDeLaSerie,
  sumarDias,
  tasaDeCierre,
} from "./dominio";

export interface ServicioDelInicio {
  resumen(
    tenantId: string,
    usuarioId: string,
    alcance: AlcanceDelInicio,
    ahora: Date,
  ): Promise<RespuestaDelInicio>;
}

interface FilaDePendiente {
  id: string;
  texto: string;
  vence_en: string | null;
  proceso_id: string;
  proceso_titulo: string;
  cliente_nombre: string | null;
}

interface FilaDeCotizacion {
  id: string;
  codigo: string;
  cliente_nombre: string | null;
  estado: EstadoDeCotizacion;
  vence_en: string | null;
}

interface FilaDeConteo {
  mes: string;
  estado: EstadoDeCotizacion;
  cuantas: number;
}

/** Qué estado alcanza cada verbo de la bitácora. */
const ESTADO_DE_LA_ACCION =
  "CASE b.accion WHEN 'emitido' THEN 'emitida'" +
  " WHEN 'ganado' THEN 'ganada' ELSE 'perdida' END";

export function inicioSobreD1(base: BaseDeDatos): ServicioDelInicio {
  const db = base.lectura;

  /**
   * Los abiertos de procesos abiertos donde soy responsable.
   *
   * El orden es el de la lista de pendientes de un proceso, sin los
   * cerrados: el que vence antes arriba, los sin fecha al final, y el
   * desempate por inserción.
   */
  async function misPendientes(
    tenantId: string,
    usuarioId: string,
  ): Promise<PendienteDelInicio[]> {
    const { results } = await db
      .prepare(
        "SELECT p.id, p.texto, p.vence_en, p.proceso_id," +
          " pr.titulo AS proceso_titulo, c.nombre AS cliente_nombre" +
          " FROM pendiente p" +
          " JOIN proceso pr ON pr.id = p.proceso_id" +
          "   AND pr.tenant_id = p.tenant_id" +
          " LEFT JOIN cliente c ON c.id = pr.cliente_id" +
          "   AND c.tenant_id = pr.tenant_id" +
          " WHERE p.tenant_id = ? AND p.responsable_id = ?" +
          "   AND p.cerrado_en IS NULL AND pr.estado = 'abierto'" +
          " ORDER BY (p.vence_en IS NULL), p.vence_en, p.creado_en, p.rowid",
      )
      .bind(tenantId, usuarioId)
      .all<FilaDePendiente>();

    return results.map((fila) => ({
      id: fila.id,
      texto: fila.texto,
      venceEn: fila.vence_en === null ? null : diaEnPanama(fila.vence_en),
      procesoId: fila.proceso_id,
      procesoTitulo: fila.proceso_titulo,
      clienteNombre: fila.cliente_nombre,
    }));
  }

  /**
   * Mis borradores, y mis emitidas que vencen hasta dentro de
   * `DIAS_DE_AVISO` días, **incluidas las ya vencidas**: una emitida vencida
   * es la que más urge, porque hay que renovarla o darla por perdida.
   *
   * El tope es el fin de ese día en Panamá, la misma forma en que el
   * repositorio de cotizaciones guarda `vence_en`.
   */
  async function misCotizaciones(
    tenantId: string,
    usuarioId: string,
    hoy: string,
  ): Promise<CotizacionDelInicio[]> {
    const tope = finDelDiaEnPanama(sumarDias(hoy, DIAS_DE_AVISO));
    const { results } = await db
      .prepare(
        "SELECT q.id, q.codigo, c.nombre AS cliente_nombre, q.estado," +
          " q.vence_en FROM cotizacion q" +
          " LEFT JOIN cliente c ON c.id = q.cliente_id" +
          "   AND c.tenant_id = q.tenant_id" +
          " WHERE q.tenant_id = ? AND q.creada_por = ?" +
          "   AND (q.estado = 'borrador'" +
          "     OR (q.estado = 'emitida' AND q.vence_en <= ?))" +
          " ORDER BY (q.vence_en IS NULL), q.vence_en, q.creada_en, q.rowid",
      )
      .bind(tenantId, usuarioId, tope)
      .all<FilaDeCotizacion>();

    return results.map((fila) => ({
      id: fila.id,
      codigo: fila.codigo,
      clienteNombre: fila.cliente_nombre,
      estado: fila.estado,
      venceEn: fila.vence_en === null ? null : diaEnPanama(fila.vence_en),
    }));
  }

  /**
   * Los borradores abiertos y las transiciones, por mes de Panamá y por
   * estado, de los meses de la serie. Dos consultas que agregan, unidas en
   * una lista de conteos.
   */
  async function conteosPorMes(
    tenantId: string,
    usuarioId: string,
    alcance: AlcanceDelInicio,
    desde: string,
    hasta: string,
  ): Promise<FilaDeConteo[]> {
    const mio = alcance === "mio";
    const deQuien = mio ? " AND q.creada_por = ?" : "";
    const quien = mio ? [usuarioId] : [];

    const borradores = db
      .prepare(
        "SELECT strftime('%Y-%m', q.creada_en, ?) AS mes," +
          " 'borrador' AS estado, count(*) AS cuantas FROM cotizacion q" +
          " WHERE q.tenant_id = ?" +
          deQuien +
          "   AND strftime('%Y-%m', q.creada_en, ?) BETWEEN ? AND ?" +
          " GROUP BY mes",
      )
      .bind(
        AL_RELOJ_DE_PANAMA,
        tenantId,
        ...quien,
        AL_RELOJ_DE_PANAMA,
        desde,
        hasta,
      )
      .all<FilaDeConteo>();

    const transiciones = db
      .prepare(
        "SELECT strftime('%Y-%m', b.ocurrido_en, ?) AS mes," +
          ` ${ESTADO_DE_LA_ACCION} AS estado,` +
          " count(DISTINCT b.entidad_id) AS cuantas" +
          " FROM bitacora b" +
          " JOIN cotizacion q ON q.id = b.entidad_id" +
          "   AND q.tenant_id = b.tenant_id" +
          " WHERE b.tenant_id = ? AND b.entidad = 'cotizacion'" +
          "   AND b.accion IN ('emitido', 'ganado', 'perdido')" +
          deQuien +
          "   AND strftime('%Y-%m', b.ocurrido_en, ?) BETWEEN ? AND ?" +
          " GROUP BY mes, b.accion",
      )
      .bind(
        AL_RELOJ_DE_PANAMA,
        tenantId,
        ...quien,
        AL_RELOJ_DE_PANAMA,
        desde,
        hasta,
      )
      .all<FilaDeConteo>();

    const [a, b] = await Promise.all([borradores, transiciones]);
    return [...a.results, ...b.results];
  }

  /** Cuántas hay hoy en cada estado, sin importar cuándo nacieron. */
  async function distribucion(
    tenantId: string,
    usuarioId: string,
    alcance: AlcanceDelInicio,
  ): Promise<CuentaPorEstado> {
    const mio = alcance === "mio";
    const { results } = await db
      .prepare(
        "SELECT q.estado, count(*) AS cuantas FROM cotizacion q" +
          " WHERE q.tenant_id = ?" +
          (mio ? " AND q.creada_por = ?" : "") +
          " GROUP BY q.estado",
      )
      .bind(tenantId, ...(mio ? [usuarioId] : []))
      .all<{ estado: EstadoDeCotizacion; cuantas: number }>();

    const cuenta = cuentaVacia();
    for (const fila of results) cuenta[fila.estado] = fila.cuantas;
    return cuenta;
  }

  return {
    async resumen(tenantId, usuarioId, alcance, ahora) {
      const hoy = hoyEnPanama(ahora);
      const meses = mesesDeLaSerie(ahora);

      const [pendientes, cotizaciones, conteos, actual] = await Promise.all([
        misPendientes(tenantId, usuarioId),
        misCotizaciones(tenantId, usuarioId, hoy),
        conteosPorMes(
          tenantId,
          usuarioId,
          alcance,
          meses[0],
          meses[meses.length - 1],
        ),
        distribucion(tenantId, usuarioId, alcance),
      ]);

      // Los meses sin ninguna fila también van, en cero: una serie con
      // huecos dibuja un mes vacío como si no existiera.
      const porMes = new Map<string, MesDelInicio>(
        meses.map((mes) => [mes, { mes, ...cuentaVacia() }]),
      );
      for (const fila of conteos) {
        const mes = porMes.get(fila.mes);
        if (mes !== undefined) mes[fila.estado] = fila.cuantas;
      }

      const serie = meses.map(
        (mes) => porMes.get(mes) ?? { mes, ...cuentaVacia() },
      );
      const delMes = serie[serie.length - 1];

      return {
        alcance,
        hoy,
        misPendientes: pendientes,
        misCotizaciones: cotizaciones,
        mes: { ...delMes, tasaDeCierre: tasaDeCierre(delMes) },
        serie,
        distribucion: actual,
      };
    },
  };
}
