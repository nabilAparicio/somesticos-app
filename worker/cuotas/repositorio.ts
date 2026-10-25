/**
 * El adaptador de D1 del plan de pagos.
 *
 * I-8 (`docs/diseno.md` §5) vive en cada consulta de este archivo: no hay una
 * sola que no filtre por `tenant_id`, ni siquiera las que buscan por llave
 * primaria. Un UUID ajeno sigue siendo un UUID.
 *
 * ## Un solo puerto para los dos dueños, y por qué no son dos
 *
 * Una cuota cuelga de una cotización o de un proceso —la decisión (c) de
 * `migrations/0010_plan_de_pagos.sql`— y este archivo tiene **un** servicio
 * con un parámetro que dice cuál, no dos servicios paralelos.
 *
 * El motivo es el mismo que el de la tabla única: la consulta, la escritura y
 * la aritmética son idénticas en los dos casos, y lo único que cambia es qué
 * columna lleva el identificador. Dos servicios serían dos copias de la misma
 * consulta, que es justo lo que `worker/index.ts` evita cuando reparte un
 * solo `ServicioDeProcesos` entre las rutas que lo necesitan. Y el día que
 * una de las dos copias se arreglara, la otra no.
 *
 * ## El dueño **indexa** la columna y el hecho, no ramifica la consulta
 *
 * `COLUMNA_DEL_DUENIO[dueño.tipo]` y `EVENTO_DEL_DUENIO[dueño.tipo]` son
 * registros tipados y no `if`s, por lo mismo que el acumulador de `saldoDe` y
 * los dos registros de verbos de T-10: con `Record<TipoDeDuenio, …>`, agregar
 * un tercer dueño **no compila** hasta que alguien diga en qué columna va y
 * bajo qué entidad se registra su hecho. Con un `if (tipo === "cotizacion")`,
 * un dueño nuevo compilaría y escribiría en la columna equivocada en silencio
 * — que en esta tabla quiere decir «en el plan de otro».
 *
 * ## El total del plan no se toca acá, y no hay dónde tocarlo
 *
 * I-7, tercera piel. El total sale de `planDe` sobre las cuotas que se acaban
 * de leer, no de ninguna columna: no hay columna. Ver el encabezado de
 * `worker/cuotas/dominio.ts` y el de la migración.
 */

import type { Evento } from "../bitacora/vocabulario";
import type { Cuota, DatosDeCuota, PlanDePagos } from "../contract";
import type { BaseDeDatos } from "../db/base";
import { recorte, sentencia } from "../db/base";
import { nuevoId } from "../db/ids";
import { ahoraIso, diaEnPanama, finDelDiaEnPanama } from "../db/momentos";
import { planDe } from "./dominio";

/* ==========================================================================
   De quién cuelga el plan
   ========================================================================== */

/**
 * Los dos dueños posibles de una cuota, cerrados por el tipo.
 *
 * Es **una de dos mitades acopladas** con el
 * `CHECK la_cuota_cuelga_de_la_cotizacion_o_del_proceso_y_nunca_de_los_dos`
 * de la migración. El `CHECK` es el que sobrevive al primer script de
 * importación (`docs/diseno.md` §5); este tipo es el que cierra lo que la API
 * puede escribir, y es lo que vuelve imposible que una fila salga de acá con
 * las dos columnas puestas o con ninguna: la forma de abajo sólo sabe llenar
 * una.
 */
export type TipoDeDuenio = "cotizacion" | "proceso";

export interface DuenioDelPlan {
  readonly tipo: TipoDeDuenio;
  readonly id: string;
  /**
   * El total contra el que se aplican los porcentajes, en centavos.
   *
   * Lo resuelve quien llama, porque sólo él sabe de dónde sale: de
   * `totalesDe` sobre las líneas de la cotización. **Es `null` para un
   * proceso, y ese nulo es la respuesta honesta a «¿porcentaje de qué?»**: un
   * proceso no tiene total, y por eso una cuota suya no puede ser porcentual
   * —lo impide la base— y su plan se lee sin base.
   */
  readonly base: number | null;
}

/**
 * En qué columna va el identificador del dueño.
 *
 * Registro y no `if`, por lo que explica el encabezado. Los nombres son los
 * de la migración y por eso se interpolan en el SQL: son constantes de este
 * archivo y no llegan del cable, así que no hay nada que parametrizar — lo
 * que llega del cable siempre va atado con `?`.
 */
const COLUMNA_DEL_DUENIO: Record<TipoDeDuenio, string> = {
  cotizacion: "cotizacion_id",
  proceso: "proceso_id",
};

/** Los dos verbos del plan. Cerrados acá para que el registro de abajo los exija. */
type VerboDeCuota = "cuota_agregada" | "cuota_quitada";

/**
 * Cómo se arma el hecho que va a la bitácora, según de quién cuelgue la
 * cuota.
 *
 * Es la segunda consecuencia de la decisión (c), y la que `0009` no podía
 * escribir: el verbo se atribuye a la entidad que de verdad lleva esa cuota.
 *
 * ## Por qué es un registro de funciones y no un registro de nombres
 *
 * Porque **con nombres no compila, y hacerlo compilar costaría un `as`**.
 * `Evento` es un tipo distribuido sobre la entidad, así que
 * `{ entidad: <una de dos>, accion: "cuota_agregada" }` no es asignable a
 * ninguna de sus ramas: TypeScript no puede comprobar el par cuando la
 * entidad todavía no está decidida. Un `as Evento` ahí apagaría exactamente
 * la red que `ACCIONES_POR_ENTIDAD` monta —la que exige que cada verbo esté
 * atribuido a la entidad bajo la que se emite— justo en el único archivo que
 * emite estos dos verbos.
 *
 * Con una función por entidad, cada cuerpo tiene su `entidad` literal, y
 * dentro de cada uno el compilador **sí** comprueba el par. Si alguien
 * borrara `cuota_agregada` de la lista de `cotizacion` en
 * `worker/bitacora/vocabulario.ts`, la primera línea de abajo dejaría de
 * compilar. Está medido con esa mutación en `test/cuotas-api.spec.ts`.
 */
const EVENTO_DEL_DUENIO: Record<
  TipoDeDuenio,
  (entidadId: string, accion: VerboDeCuota, detalle: string) => Evento
> = {
  cotizacion: (entidadId, accion, detalle) => ({
    entidad: "cotizacion",
    entidadId,
    accion,
    detalle,
  }),
  proceso: (entidadId, accion, detalle) => ({
    entidad: "proceso",
    entidadId,
    accion,
    detalle,
  }),
};

/* ==========================================================================
   El puerto
   ========================================================================== */

export interface ServicioDeCuotas {
  /** El plan del dueño y lo que suma. El total se deriva acá. */
  plan(tenantId: string, duenio: DuenioDelPlan): Promise<PlanDePagos>;
  /** `null` si esa cuota no es de este plan en este bufete. */
  obtener(
    tenantId: string,
    duenio: DuenioDelPlan,
    cuotaId: string,
  ): Promise<CuotaConSuConcepto | null>;
  agregar(
    tenantId: string,
    duenio: DuenioDelPlan,
    datos: DatosDeCuota,
  ): Promise<PlanDePagos>;
  quitar(
    tenantId: string,
    duenio: DuenioDelPlan,
    cuota: CuotaConSuConcepto,
  ): Promise<PlanDePagos>;
}

/**
 * Lo mínimo de una cuota que la capa de rutas necesita antes de borrarla.
 *
 * El concepto viaja porque es lo que va al `detalle` de la bitácora, y se lee
 * **antes** del borrado por la razón obvia: después no hay fila de donde
 * sacarlo. Es la misma forma que `MovimientoConSuLlave` cumple en T-10.
 */
export interface CuotaConSuConcepto {
  readonly id: string;
  readonly concepto: string;
}

interface FilaDeCuota {
  id: string;
  concepto: string;
  monto: number | null;
  porcentaje: number | null;
  vence_en: string | null;
  hito: string | null;
  creada_en: string;
}

/**
 * De la fila a lo que viaja, sin el importe.
 *
 * `importe` lo pone `planDe`, que es la única que sabe la base. Sale `null`
 * acá y se reemplaza allá: dejarlo fuera del tipo obligaría a un segundo tipo
 * «cuota sin importe» que no significa nada de cara al cable.
 */
function aCuota(fila: FilaDeCuota): Cuota {
  return {
    id: fila.id,
    concepto: fila.concepto,
    monto: fila.monto,
    porcentaje: fila.porcentaje,
    // Se guarda como el fin del día **en Panamá** y se lee de vuelta al día
    // que es. Las dos conversiones son una sola dada vuelta, y por eso van
    // siempre juntas: ver `worker/db/momentos.ts`.
    venceEn: fila.vence_en === null ? null : diaEnPanama(fila.vence_en),
    hito: fila.hito,
    importe: null,
    creadaEn: fila.creada_en,
  };
}

export function cuotasSobreD1(base: BaseDeDatos): ServicioDeCuotas {
  const db = base.lectura;

  /**
   * Las cuotas del plan, de la más vieja a la más nueva.
   *
   * Un cronograma se lee hacia adelante, igual que una cuenta de gastos: lo
   * que se quiere ver es en qué orden se cobra.
   *
   * **El orden es el de escritura y no el de vencimiento**, y conviene decir
   * por qué, porque lo segundo parece más natural: la mitad de las cuotas de
   * un plan no tiene fecha sino hito —«a la firma», «contra sentencia»—, así
   * que ordenar por `vence_en` mandaría al final justamente a la primera. El
   * orden en que el abogado dicta el plan es el orden en que el plan se lee.
   *
   * El desempate es `rowid`, que es el orden de inserción: dos cuotas
   * cargadas en el mismo milisegundo tienen el mismo `creada_en`, y sin
   * desempate el cronograma cambiaría de orden entre lecturas.
   */
  async function leerCuotas(
    tenantId: string,
    duenio: DuenioDelPlan,
  ): Promise<Cuota[]> {
    const columna = COLUMNA_DEL_DUENIO[duenio.tipo];

    const { results } = await db
      .prepare(
        "SELECT id, concepto, monto, porcentaje, vence_en, hito, creada_en" +
          " FROM cuota" +
          ` WHERE tenant_id = ? AND ${columna} = ?` +
          " ORDER BY creada_en, rowid",
      )
      .bind(tenantId, duenio.id)
      .all<FilaDeCuota>();

    return results.map(aCuota);
  }

  /**
   * El plan entero: las cuotas y lo que suman.
   *
   * **El total se calcula acá, sobre lo que se acaba de leer, y no se guarda
   * en ningún lado** (I-7). No hay columna que actualizar, no hay caché que
   * invalidar y no hay nada que reconciliar: la familia entera de esos
   * errores no existe porque no hay un segundo número.
   */
  async function plan(
    tenantId: string,
    duenio: DuenioDelPlan,
  ): Promise<PlanDePagos> {
    return planDe(await leerCuotas(tenantId, duenio), duenio.base);
  }

  return {
    plan,

    async obtener(tenantId, duenio, cuotaId) {
      const columna = COLUMNA_DEL_DUENIO[duenio.tipo];

      const fila = await db
        .prepare(
          "SELECT id, concepto FROM cuota" +
            ` WHERE tenant_id = ? AND ${columna} = ? AND id = ?`,
        )
        .bind(tenantId, duenio.id, cuotaId)
        .first<{ id: string; concepto: string }>();

      if (fila === null) return null;

      return { id: fila.id, concepto: fila.concepto };
    },

    async agregar(tenantId, duenio, datos) {
      const id = nuevoId();
      const columna = COLUMNA_DEL_DUENIO[duenio.tipo];

      // **Se llena una sola de las dos columnas del dueño**, y la otra ni
      // siquiera aparece en el `INSERT`: nace nula por omisión. Ésa es la
      // forma en que la exclusividad de la decisión (c) no depende de que
      // nadie se equivoque acá — el `CHECK` de la base la exige igual, pero
      // este camino no tiene cómo violarla.
      await base.mutar(
        EVENTO_DEL_DUENIO[duenio.tipo](
          duenio.id,
          "cuota_agregada",
          recorte(datos.concepto),
        ),
        sentencia(
          `INSERT INTO cuota (id, tenant_id, ${columna}, concepto, monto,` +
            " porcentaje, vence_en, hito, creada_en)" +
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          id,
          tenantId,
          duenio.id,
          datos.concepto,
          datos.monto,
          datos.porcentaje,
          // El día que la persona eligió, guardado como su último instante en
          // Panamá — igual que `cotizacion.vence_en`, porque un vencimiento
          // guardado a medianoche UTC se muere a las siete de la tarde con la
          // oficina abierta.
          datos.venceEn === null ? null : finDelDiaEnPanama(datos.venceEn),
          datos.hito,
          ahoraIso(),
        ),
      );

      // Se relee entero: lo que el servidor dejó guardado manda sobre lo que
      // la pantalla creía. Y acá hay un motivo más: el total que la pantalla
      // va a dibujar tiene que ser el de estas cuotas y no el de las que
      // tenía antes.
      return plan(tenantId, duenio);
    },

    async quitar(tenantId, duenio, cuota) {
      const columna = COLUMNA_DEL_DUENIO[duenio.tipo];

      await base.mutar(
        EVENTO_DEL_DUENIO[duenio.tipo](
          duenio.id,
          "cuota_quitada",
          recorte(cuota.concepto),
        ),
        sentencia(
          "DELETE FROM cuota" +
            ` WHERE tenant_id = ? AND ${columna} = ? AND id = ?`,
          tenantId,
          duenio.id,
          cuota.id,
        ),
      );

      return plan(tenantId, duenio);
    },
  };
}
