/**
 * El documento congelado: qué se le mandó al cliente, dicho de una forma que
 * se baste sola dentro de seis años (T-4, I-5 de `docs/diseno.md` §5).
 *
 * Pura: ni D1 ni HTTP. Recibe lo que el repositorio leyó y devuelve el objeto
 * que se serializa en `cotizacion.snapshot`.
 *
 * ## El criterio, que es uno solo
 *
 * > **El snapshot tiene que bastarse solo.**
 *
 * Si para entender qué se prometió hay que unir contra `cliente` o contra
 * `tipo_proceso` —filas que pudieron cambiar de nombre, darse de baja o
 * irse—, el snapshot no congeló nada: congeló un puñado de llaves foráneas
 * hacia un presente que se mueve. Por eso cada identificador que queda
 * adentro viaja **con el texto resuelto al lado**, y el texto es el que
 * manda. El identificador es un rastro para el sistema; el nombre es lo que
 * leyó la persona.
 *
 * Es la misma decisión que §6 ya había tomado al revés para las etapas
 * —«sembrar, no referenciar»—, aplicada al documento entero.
 *
 * ## Los totales entran, y no para ahorrar una suma
 *
 * `totales` se guarda aunque sea derivable de `lineas`, y aunque la
 * barandilla de la tajada diga que la aritmética no se almacena. No es una
 * excepción a esa regla: **la regla habla de las tablas vivas**, donde un
 * total guardado es un total que algún día no coincide con sus líneas. Acá
 * las líneas que lo producen están congeladas en el mismo objeto, así que no
 * pueden separarse nunca.
 *
 * Y el motivo para ponerlo es otro: *el total que el cliente vio es un hecho
 * histórico*. Si mañana `totalesDe` cambia —el ITBMS de T-12, un redondeo,
 * una clase nueva—, recalcular desde las líneas congeladas daría un número
 * que nadie le prometió a nadie. El snapshot tiene que poder contestar
 * «¿cuánto decía el papel?», y eso no se recalcula.
 *
 * ## Qué queda afuera, y por qué
 *
 *  - **`estado`.** Es lo único de la cotización que sigue vivo después de
 *    emitir: T-5 lo mueve a `ganada` o a `perdida`. Una copia acá adentro
 *    sería un segundo lugar que dice el estado, congelado en `emitida`
 *    para siempre, y el primero que lo lea va a creerle al que miente.
 *  - **`tenant_id`.** El snapshot vive dentro de una fila que ya lo lleva.
 *    Copiarlo sería crear un valor que puede contradecir a su propia fila, y
 *    `cotizacion_tenant_inmutable` ya garantiza que el de la fila no cambia.
 *  - **`duplicadaDeId`.** Es la procedencia de la *cotización*, no del
 *    documento: dice de cuál nació esta propuesta, que es un hecho interno
 *    del bufete y no algo que el cliente leyó. Vive en su columna, y es T-5
 *    quien la recorre.
 *  - **El `orden` de cada módulo y de cada línea.** El orden **es** la
 *    posición en el arreglo. Un número al lado sería un segundo lugar
 *    diciendo lo mismo, que es el mismo argumento por el que
 *    `CATALOGO_DE_CLASES` tiene dos campos y no tres.
 *  - **El `id` de cada módulo y de cada línea.** Son direcciones de filas
 *    vivas, y el snapshot existe justamente para no depender de ellas. El
 *    `tipoProcesoId` de una línea sí se conserva, y la diferencia no es
 *    caprichosa: ése apunta **afuera**, a una fila que el sistema va a
 *    volver a usar cuando T-7 abra los procesos de una cotización ganada.
 *  - **Las `notas` del cliente.** Son apuntes internos del bufete sobre esa
 *    persona. Nunca estuvieron en la propuesta, y meterlas en el documento
 *    congelado las volvería parte de él.
 *
 * ## `version`
 *
 * Va primero y es un número, no una fecha. Lo que esta tarea no puede saber
 * es qué forma va a tener el snapshot cuando existan el plan de pagos y el
 * impuesto, y quien lo lea en 2032 va a tener delante filas escritas por dos
 * o tres formas distintas. Sin el número hay que adivinar cuál es cuál
 * mirando qué campos están; con él, no.
 */

import type {
  Cotizacion,
  LineaDeCotizacion,
  ModuloDeCotizacion,
  ClaseDeLinea,
  TipoDeModulo,
  TotalesDeCotizacion,
} from "../contract";
import type { RegimenDeImpuesto } from "./lineas";
import { SIN_ITBMS, rotuloDeClase, totalesDe } from "./lineas";
import { rotuloDeTipo } from "./modulos";

/**
 * La forma de este snapshot.
 *
 * Se sube cuando cambia lo que el objeto **significa**, no cuando se le
 * agrega un campo que los lectores viejos pueden ignorar.
 */
export const VERSION_DEL_SNAPSHOT = 1;

/**
 * El cliente, tal como figuraba en la propuesta.
 *
 * `tipo` es el **nombre** del tipo de cliente y no su identificador, por el
 * criterio de arriba: `tipo_cliente` es un catálogo que se edita y se da de
 * baja, así que la llave no contesta nada dentro de seis años.
 *
 * Nullable casi todo porque casi todo lo es en `cliente`: el alta pide lo
 * mínimo —nombre y un medio de contacto— justamente para que se pueda
 * cotizarle a un prospecto (`docs/diseno.md` §5).
 */
export interface ClienteCongelado {
  id: string;
  nombre: string;
  tipo: string | null;
  documentoTipo: string | null;
  documentoNumero: string | null;
  representanteLegal: string | null;
  email: string | null;
  telefono: string | null;
}

/**
 * Un módulo de prosa congelado.
 *
 * Lleva `tipo` **y** `rotulo`, que parecen lo mismo y no lo son: `tipo` es la
 * cadena del catálogo cerrado, que un lector automático puede comparar;
 * `rotulo` es el encabezado que la persona leyó. `CATALOGO_DE_MODULOS` vive
 * en código y se puede renombrar en cualquier despliegue —«Nota al cliente»
 * puede pasar a llamarse de otra forma—, y el título que encabezaba el
 * documento que se mandó es un hecho, no una preferencia de hoy.
 */
export interface ModuloCongelado {
  tipo: TipoDeModulo;
  rotulo: string;
  contenido: string;
}

/**
 * Una línea congelada.
 *
 * `clase` y `rotulo` por lo mismo que en el módulo. `monto` en **centavos
 * enteros**, igual que en todas partes: el snapshot no cambia de unidad a
 * mitad de camino, porque una conversión a unidades de moneda mete un
 * flotante en el único lugar del sistema que no se puede corregir después.
 *
 * `tipoProceso` es el nombre del trámite y `tipoProcesoId` su llave. Los dos,
 * y no uno: el nombre para quien lee, la llave para T-7, que abre un proceso
 * por cada línea que la lleve.
 */
export interface LineaCongelada {
  clase: ClaseDeLinea;
  rotulo: string;
  concepto: string;
  monto: number;
  tipoProcesoId: string | null;
  tipoProceso: string | null;
}

/** Quién la emitió. El nombre puede faltar; el identificador no. */
export interface EmisorCongelado {
  id: string;
  nombre: string | null;
}

/**
 * El documento congelado entero. Esto es lo que se serializa a
 * `cotizacion.snapshot`.
 */
export interface SnapshotDeCotizacion {
  version: number;
  /** Momento ISO 8601 UTC en que dejó de ser editable. */
  emitidaEn: string;
  emitidaPor: EmisorCongelado;
  cotizacion: {
    id: string;
    codigo: string;
    /** Momento ISO 8601 UTC: cuándo se abrió el borrador. */
    fecha: string;
    /** Día `AAAA-MM-DD`, o nulo. */
    venceEn: string | null;
    moneda: string;
  };
  cliente: ClienteCongelado;
  modulos: ModuloCongelado[];
  lineas: LineaCongelada[];
  totales: TotalesDeCotizacion;
}

/** Lo que hay que haber leído para poder congelar. */
export interface DatosParaCongelar {
  cotizacion: Cotizacion;
  cliente: ClienteCongelado;
  modulos: readonly ModuloDeCotizacion[];
  lineas: readonly LineaDeCotizacion[];
  emisor: EmisorCongelado;
  /** El mismo momento que va a quedar en la bitácora. */
  emitidaEn: string;
  /**
   * Si el bufete factura ITBMS **en el momento de emitir** (T-12).
   *
   * Entra como dato y no se lee de ningún lado acá, por lo mismo que
   * `emitidaEn`: esta función es pura y congelar es justamente el acto de
   * fijar lo que era cierto en un instante. Quien lo resuelve es
   * `worker/index.ts` con `regimenDelBufete(env)`, y viaja hasta acá por el
   * repositorio.
   *
   * **Opcional, y la omisión es apagado.** Es el mismo interruptor que
   * `totalesDe`, en la misma posición por omisión, por el mismo motivo:
   * olvidarlo deja el documento sin impuesto, que es el estado seguro.
   */
  impuesto?: RegimenDeImpuesto;
}

/**
 * Arma el documento congelado.
 *
 * **Los módulos y las líneas se copian en el orden en que llegan**, y eso es
 * una precondición y no un descuido: el repositorio los lee con
 * `ORDER BY orden`, que es el único orden que la cotización tiene. Ordenar de
 * nuevo acá sería una segunda regla de orden, y el día que las dos difieran
 * el documento congelado se leería distinto que el vivo.
 *
 * Los totales salen de `totalesDe`, la misma función que usa la respuesta de
 * `/lineas`. **No se suma acá**: dos sumas en dos sitios son dos resultados
 * el día que una cambie, y la que se congelaría sería la equivocada.
 *
 * ## El régimen de impuesto se congela con todo lo demás
 *
 * **Y ésta es la mitad que de verdad cierra T-12.** El comentario de arriba
 * —escrito en T-4, cuando el impuesto era una fecha en el calendario— dice
 * que los totales entran al documento porque *«si mañana `totalesDe` cambia
 * —el ITBMS de T-12—, recalcular desde las líneas congeladas daría un número
 * que nadie le prometió a nadie»*. Éste es ese mañana, y la promesa se
 * sostiene sola: el impuesto se aplica **una vez, acá, con el interruptor
 * como estaba ese día**, y queda escrito adentro del objeto.
 *
 * De ahí salen las dos garantías, que son la misma mirada desde cada lado:
 *
 *  - Una cotización emitida hoy, con el impuesto apagado, va a seguir
 *    imprimiéndose sin ITBMS **para siempre**, aunque mañana la contadora lo
 *    valide y el interruptor se encienda.
 *  - Una emitida con el impuesto encendido lo conserva aunque el interruptor
 *    se vuelva a apagar. El papel es un hecho histórico en las dos
 *    direcciones, no una preferencia que se relee.
 *
 * Lo sostiene que nada de esto se recalcula nunca: `obtenerDocumento` hace
 * `JSON.parse` de la columna y la devuelve, y
 * `cotizacion_snapshot_se_escribe_una_sola_vez` (M-3 de `0006`) garantiza que
 * nadie la reescribió. Está medido en `test/impuesto-api.spec.ts`, moviendo
 * el interruptor **entre las dos lecturas** — que es la única forma de que
 * esa prueba distinga algo.
 */
export function congelar(datos: DatosParaCongelar): SnapshotDeCotizacion {
  return {
    version: VERSION_DEL_SNAPSHOT,
    emitidaEn: datos.emitidaEn,
    emitidaPor: datos.emisor,
    cotizacion: {
      id: datos.cotizacion.id,
      codigo: datos.cotizacion.codigo,
      fecha: datos.cotizacion.fecha,
      venceEn: datos.cotizacion.venceEn,
      moneda: datos.cotizacion.moneda,
    },
    cliente: datos.cliente,
    modulos: datos.modulos.map((modulo) => ({
      tipo: modulo.tipo,
      rotulo: rotuloDeTipo(modulo.tipo),
      contenido: modulo.contenido,
    })),
    lineas: datos.lineas.map((linea) => ({
      clase: linea.clase,
      rotulo: rotuloDeClase(linea.clase),
      concepto: linea.concepto,
      monto: linea.monto,
      tipoProcesoId: linea.tipoProcesoId,
      tipoProceso: linea.tipoProcesoNombre,
    })),
    totales: totalesDe(datos.lineas, datos.impuesto ?? SIN_ITBMS),
  };
}
