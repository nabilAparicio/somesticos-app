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
 * clave del catálogo cerrado, que un lector automático puede comparar;
 * `rotulo` es el encabezado que la persona leyó.
 *
 * **Y desde T-3 esta copia es la que de verdad importa.** Antes el rótulo
 * vivía en código y sólo un despliegue lo cambiaba; ahora el abogado lo
 * renombra desde `/catalogos/modulos` cuando quiera, así que el título que
 * encabezaba el documento que se mandó no es recuperable por ninguna otra vía:
 * sin este campo, una cotización emitida en marzo se imprimiría en septiembre
 * con el rótulo de septiembre. Es un hecho, no una preferencia de hoy, y la
 * única forma de guardar un hecho es copiarlo.
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
 *
 * ## `arancelRenglonId` y `arancelConcepto`: de dónde salió el precio
 *
 * Entran por la misma puerta que el monto y el nombre del trámite, y por la
 * misma razón (T-1 de `odd/tasks/precios-en-la-cotizacion.md`): dentro de un
 * año el bufete tiene que poder saber que esos B/.1,800 salieron del precio
 * que él mismo fijó para tal servicio y no del dedo de alguien. El par es el
 * mismo de siempre —la llave para el sistema, el texto para quien lee— y el
 * texto es el **concepto del renglón**, que es lo que hace que la línea se
 * entienda sin volver al catálogo: el renglón pudo renombrarse, desactivarse o
 * cambiar de precio, y el documento no se mueve.
 *
 * **Qué más se copió, y qué no.** Del renglón entra el concepto y nada más.
 * `categoria` y `numeral` son las coordenadas de la cita en el Acuerdo, no la
 * procedencia del precio del bufete, y el concepto ya identifica el servicio
 * para quien lee. `monto_oficial` **nunca**: es la cita de 2001, y meterla en
 * el documento que el cliente leyó es exactamente la comparación que
 * `odd/tasks/arancel-de-honorarios.md` dejó prohibida. Y el `monto` del
 * renglón tampoco, que es la decisión menos obvia de las tres: el prellenado
 * es editable, así que el precio del catálogo y el que la línea cobró pueden
 * diferir, y guardar los dos pondría dentro del documento congelado un
 * segundo número de dinero cuya única lectura posible es la comparación. **El
 * monto que vale es `monto`, el que se prometió.**
 *
 * ## Las dos claves son opcionales, y su ausencia significa algo
 *
 * Son `?` y no `string | null` porque este tipo describe también los snapshots
 * que ya están guardados, escritos antes de que la columna existiera. De ahí
 * la lectura, que es la misma disciplina de `TotalesDeCotizacion.itbms`:
 *
 *  - **La clave está y vale `null`**: la línea no salió de ningún renglón
 *    tarifado. Es el caso corriente.
 *  - **La clave no está**: el documento se congeló antes de que el sistema
 *    supiera de dónde salían los precios.
 *
 * Y eso es lo que hace que `VERSION_DEL_SNAPSHOT` **no** suba: la regla de
 * este archivo es que la versión se mueve cuando cambia lo que el objeto
 * significa, y lo que un lector de 2032 necesita para no confundir «sin
 * procedencia» con «de antes de la procedencia» ya está dicho, por línea y con
 * más precisión que un número para el documento entero. `congelar` escribe las
 * dos claves **siempre**, con `null` cuando no hay nada, que es lo que
 * sostiene esa distinción.
 */
export interface LineaCongelada {
  clase: ClaseDeLinea;
  rotulo: string;
  concepto: string;
  monto: number;
  tipoProcesoId: string | null;
  tipoProceso: string | null;
  arancelRenglonId?: string | null;
  arancelConcepto?: string | null;
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
  /**
   * El rótulo vigente de cada clave de módulo, para congelarlo (T-3).
   *
   * Entra como dato y no se resuelve acá por lo mismo que `impuesto` y
   * `emitidaEn`: esta función es pura, y congelar es el acto de fijar lo que
   * era cierto en un instante. Lo lee el repositorio del puerto de plantillas
   * —`rotulosPorClave(await plantillas.listar(…))`— un solo paso antes de
   * escribir, que es lo más cerca de la emisión que se puede leer sin meter
   * SQL en este archivo.
   *
   * No es opcional, al revés que `impuesto`. Omitir el impuesto deja el
   * documento en el estado seguro; omitir los rótulos dejaría el documento
   * **sin encabezados**, que no es un estado seguro sino un papel roto. Un
   * llamador distraído tiene que no compilar.
   */
  rotulos: ReadonlyMap<string, string>;
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
      // La clave como reserva, y no un `as string` sobre el `get`. Los dos
      // `CHECK` de `0016` y la siembra hacen que toda clave del `CHECK` de
      // `0004` tenga su fila con rótulo vigente, así que esta rama es
      // inalcanzable; está escrita porque lo que un `as` taparía es un
      // documento congelado con `undefined` donde va un encabezado, y eso no
      // se puede corregir después: `cotizacion_snapshot_se_escribe_una_sola_vez`
      // lo prohíbe. Un papel que dice «alcance» en minúscula es un papel feo;
      // uno que dice «undefined» es un papel roto.
      rotulo: datos.rotulos.get(modulo.tipo) ?? modulo.tipo,
      contenido: modulo.contenido,
    })),
    lineas: datos.lineas.map((linea) => ({
      clase: linea.clase,
      rotulo: rotuloDeClase(linea.clase),
      concepto: linea.concepto,
      monto: linea.monto,
      tipoProcesoId: linea.tipoProcesoId,
      tipoProceso: linea.tipoProcesoNombre,
      // Siempre, también en nulo: es lo que distingue «esta línea no salió de
      // ningún renglón» de «este documento se congeló antes de que la
      // procedencia existiera». Ver `LineaCongelada`.
      arancelRenglonId: linea.arancelRenglonId,
      arancelConcepto: linea.arancelConcepto,
    })),
    totales: totalesDe(datos.lineas, datos.impuesto ?? SIN_ITBMS),
  };
}
