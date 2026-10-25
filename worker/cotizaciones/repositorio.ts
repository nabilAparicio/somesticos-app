/**
 * El adaptador de D1 para las cotizaciones.
 *
 * `ServicioDeCotizaciones` es el puerto: lo que el ruteo conoce. La función
 * de abajo es la única implementación, y la única que sabe que existe SQL.
 *
 * I-8 (`docs/diseno.md` §5) vive en **cada** consulta de este archivo, las
 * cuatro: el listado, el detalle, la comprobación del cliente y la que
 * calcula el correlativo. Esa última es la que menos parece necesitarlo y la
 * que peor falla sin él — no filtra una lectura, decide un número, así que un
 * filtro flojo ahí no fuga datos del vecino: hace que la primera cotización
 * de este bufete nazca numerada detrás de las suyas.
 *
 * ## El registro de bitácora (T-10)
 *
 * No está esparcido por acá: viaja con la escritura. Este archivo no recibe
 * un `D1Database` sino una `BaseDeDatos`, que solo sabe leer y `mutar`, y
 * `mutar` **exige el evento como primer parámetro**. Ver `worker/db/base.ts`.
 *
 * ## Las guardas de la base no se atrapan
 *
 * No hay un solo `try`/`catch` en este archivo, y es una decisión. El `CHECK`
 * de coherencia entre estado y snapshot, el de la moneda, el de la vigencia,
 * el índice único del código y los cinco disparadores de tenencia de
 * `migrations/0004_cotizaciones.sql` son las guardas que de verdad sostienen
 * los invariantes; envolverlas en un `catch` que devuelva un 422 amable las
 * convertiría en un mensaje y haría que el defecto que las despertó nunca se
 * arregle. Si una salta, sale.
 */

import type {
  ClaseDeLinea,
  Cotizacion,
  DatosDeCotizacion,
  DatosDeLinea,
  DatosDeModulo,
  EstadoDeCotizacion,
  FallaDeValidacion,
  LineaDeCotizacion,
  ModuloDeCotizacion,
  TipoDeModulo,
} from "../contract";
import type { BaseDeDatos, Sentencia } from "../db/base";
import { recorte, sentencia } from "../db/base";
import { nuevoId } from "../db/ids";
import {
  ahoraIso,
  diaEnPanama,
  finDelDiaEnPanama,
} from "../db/momentos";
import { rotuloDeTipo } from "./modulos";
import {
  congelar,
  type ClienteCongelado,
  type EmisorCongelado,
} from "./snapshot";

export type ResultadoDeEscritura =
  | { estado: "guardado"; cotizacion: Cotizacion }
  | { estado: "invalido"; fallas: FallaDeValidacion[] }
  | { estado: "no_es_borrador"; actual: EstadoDeCotizacion }
  | { estado: "no_encontrado" };

/**
 * Lo que devuelve emitir (T-4).
 *
 * **No tiene rama `invalido`, y la ausencia es la decisión.** Emitir no lleva
 * cuerpo: lo único que se le manda es la dirección de la cotización, así que
 * no hay formulario que corregir. Una rama que el sistema no sabe producir
 * obligaría a la ruta a escribir una respuesta inalcanzable, que es el mismo
 * adorno que `0004` se sacó de encima con los disparadores que no podían
 * disparar.
 *
 * Y tampoco hay una rama para «esta cotización está vacía». Se evaluó y se
 * dejó afuera: ni el plan de la tajada ni `docs/diseno.md` dicen que una
 * propuesta tenga que traer líneas o módulos para salir, y una regla que
 * nadie pidió sería inventar negocio desde acá. Queda anotado como lo que es
 * —una pregunta abierta para quien escriba la pantalla— y no disfrazado de
 * invariante.
 */
export type ResultadoDeEmision =
  | { estado: "emitida"; cotizacion: Cotizacion }
  | { estado: "no_es_borrador"; actual: EstadoDeCotizacion }
  | { estado: "no_encontrado" };

/**
 * Las tres formas en que una escritura dentro de una cotización no ocurre.
 *
 * Están en un tipo propio porque son **las mismas tres** para los módulos de
 * prosa y para las líneas, y porque son las que `borradorParaEscribir` y
 * `escrituraSinEfecto` producen sin saber cuál de las dos familias las pidió.
 * Lo único que cambia entre una y otra es qué viaja cuando sí se guardó.
 */
export type EscrituraBloqueada =
  | { estado: "invalido"; fallas: FallaDeValidacion[] }
  | { estado: "no_es_borrador"; actual: EstadoDeCotizacion }
  | { estado: "no_encontrado" };

/**
 * Lo que devuelve cualquiera de las cuatro escrituras de módulos.
 *
 * Trae **la lista entera** y no el módulo tocado, igual que los pendientes
 * de T-9: lo que cambió no es un módulo sino el documento, y una respuesta
 * parcial obligaría a la pantalla a recomponer el orden a mano justo después
 * de haberlo cambiado.
 */
export type ResultadoDeModulos =
  | { estado: "guardado"; modulos: ModuloDeCotizacion[] }
  | EscrituraBloqueada;

/**
 * Lo que devuelve cualquiera de las cuatro escrituras de líneas.
 *
 * Trae **la lista entera** y no la línea tocada, por lo mismo que los
 * módulos. Y **no trae los totales**, que es la decisión que importa acá:
 * este archivo lee y escribe filas, y la aritmética vive en una sola función
 * pura —`totalesDe`, en `worker/cotizaciones/lineas.ts`— que se aplica una
 * sola vez, al armar la respuesta. Devolverlos desde acá obligaría a sumarlos
 * también en el `GET`, que es la segunda suma que mañana dice otra cosa.
 */
export type ResultadoDeLineas =
  | { estado: "guardado"; lineas: LineaDeCotizacion[] }
  | EscrituraBloqueada;

export interface ServicioDeCotizaciones {
  listar(tenantId: string): Promise<Cotizacion[]>;
  obtener(tenantId: string, id: string): Promise<Cotizacion | null>;
  crear(
    tenantId: string,
    autorId: string,
    datos: DatosDeCotizacion,
  ): Promise<ResultadoDeEscritura>;
  actualizar(
    tenantId: string,
    id: string,
    datos: DatosDeCotizacion,
  ): Promise<ResultadoDeEscritura>;

  /* --- Los módulos de prosa (T-2 C) --- */

  /**
   * Los módulos de una cotización, en su orden.
   *
   * **Leer no depende del estado**: una emitida muestra sus módulos igual
   * que un borrador. Lo que el estado bloquea es cambiarlos.
   */
  listarModulos(
    tenantId: string,
    cotizacionId: string,
  ): Promise<ModuloDeCotizacion[]>;
  agregarModulo(
    tenantId: string,
    cotizacionId: string,
    datos: DatosDeModulo,
  ): Promise<ResultadoDeModulos>;
  editarModulo(
    tenantId: string,
    cotizacionId: string,
    moduloId: string,
    datos: DatosDeModulo,
  ): Promise<ResultadoDeModulos>;
  quitarModulo(
    tenantId: string,
    cotizacionId: string,
    moduloId: string,
  ): Promise<ResultadoDeModulos>;
  /**
   * La lista completa de identificadores en su orden nuevo. El `orden` que se
   * guarda es la **posición en ese arreglo**, nunca un número del cuerpo.
   */
  reordenarModulos(
    tenantId: string,
    cotizacionId: string,
    orden: readonly string[],
  ): Promise<ResultadoDeModulos>;

  /* --- Las líneas de honorarios y gastos estimados (T-3 A) --- */

  /**
   * Las líneas de una cotización, en su orden.
   *
   * **Leer no depende del estado**, igual que con los módulos: una emitida
   * muestra sus líneas y sus totales como cualquier borrador. Lo que el
   * estado bloquea es cambiarlas.
   */
  listarLineas(
    tenantId: string,
    cotizacionId: string,
  ): Promise<LineaDeCotizacion[]>;
  agregarLinea(
    tenantId: string,
    cotizacionId: string,
    datos: DatosDeLinea,
  ): Promise<ResultadoDeLineas>;
  editarLinea(
    tenantId: string,
    cotizacionId: string,
    lineaId: string,
    datos: DatosDeLinea,
  ): Promise<ResultadoDeLineas>;
  quitarLinea(
    tenantId: string,
    cotizacionId: string,
    lineaId: string,
  ): Promise<ResultadoDeLineas>;
  /**
   * La lista completa de identificadores en su orden nuevo. El `orden` que se
   * guarda es la **posición en ese arreglo**, nunca un número del cuerpo.
   */
  reordenarLineas(
    tenantId: string,
    cotizacionId: string,
    orden: readonly string[],
  ): Promise<ResultadoDeLineas>;

  /* --- Emitir y congelar (T-4 A) --- */

  /**
   * Pasa el borrador a emitida y escribe su snapshot **en la misma
   * escritura**.
   *
   * `emisorId` llega de la puerta de Access y nunca del cuerpo, igual que el
   * autor en `crear` (I-6): quien congela un documento queda firmado adentro
   * del documento.
   *
   * Es la única operación del sistema que no tiene vuelta atrás. Después de
   * ella la base rechaza toda escritura sobre la cotización, sus módulos y
   * sus líneas (I-4 e I-5, `migrations/0006_emitir_y_congelar.sql`).
   */
  emitir(
    tenantId: string,
    emisorId: string,
    id: string,
  ): Promise<ResultadoDeEmision>;
}

interface FilaDeCotizacion {
  id: string;
  codigo: string;
  estado: EstadoDeCotizacion;
  cliente_id: string;
  cliente_nombre: string | null;
  fecha: string;
  vence_en: string | null;
  moneda: string;
  duplicada_de_id: string | null;
  creada_por: string;
  creada_por_nombre: string | null;
  creada_en: string;
}

/**
 * Las dos uniones son `LEFT JOIN` y llevan su propio `tenant_id`, igual que
 * en clientes: con el filtro de tenencia repetido en la unión, un
 * identificador que cruzara la frontera devuelve `NULL` en vez del nombre
 * ajeno.
 *
 * `LEFT` incluso para el cliente, que es `NOT NULL`: la columna obliga a que
 * haya uno, pero si por lo que fuera la fila apuntada no se puede leer desde
 * este tenant, lo correcto es devolver la cotización con el nombre en nulo y
 * no hacerla desaparecer del listado. Un `INNER JOIN` escondería la fila, que
 * es la peor de las dos formas de fallar.
 *
 * **`snapshot` no está en la selección**, y la ausencia es el diseño: es el
 * documento entero y nadie que mire una ficha o un listado lo necesita.
 */
const SELECCION =
  "SELECT q.id, q.codigo, q.estado, q.cliente_id," +
  " c.nombre AS cliente_nombre, q.fecha, q.vence_en, q.moneda," +
  " q.duplicada_de_id, q.creada_por, u.nombre AS creada_por_nombre," +
  " q.creada_en" +
  " FROM cotizacion q" +
  " LEFT JOIN cliente c ON c.id = q.cliente_id AND c.tenant_id = q.tenant_id" +
  " LEFT JOIN usuario u ON u.id = q.creada_por AND u.tenant_id = q.tenant_id" +
  " WHERE q.tenant_id = ?";

/**
 * El prefijo del código para un momento dado: `COT-<año>-`.
 *
 * El año sale del mismo momento que se va a guardar en `fecha`, y no de un
 * segundo `new Date()`. Dos lecturas del reloj separadas por un `await`
 * pueden caer en años distintos —una cotización abierta a las 23:59:59.999
 * del 31 de diciembre— y el resultado sería una fila cuyo código dice un año
 * y cuya fecha dice otro.
 */
function prefijoDelCodigo(momento: string): string {
  return `COT-${momento.slice(0, 4)}-`;
}

/**
 * El vencimiento, de día a momento guardable, y de vuelta.
 *
 * Las dos son `worker/db/momentos.ts`, que argumenta el huso y la
 * simetría. Acá solo se les agrega el nulo, que es la mitad que el
 * repositorio conoce y el dominio no: una cotización puede no vencer.
 *
 * **Al final del día y no al principio**, y no es un detalle de gusto:
 * `CHECK (vence_en >= fecha)` compara momentos. Con medianoche, «vence hoy»
 * —el caso más corriente de una cotización que se manda y se responde el
 * mismo día— daría un vencimiento anterior a la fecha y la base abortaría la
 * escritura. Y es lo que la frase significa: «válida hasta el 31» vale el 31
 * entero, en la hora del bufete y no en la de Greenwich.
 */
function aMomento(dia: string | null): string | null {
  return dia === null ? null : finDelDiaEnPanama(dia);
}

/** La vuelta exacta de `aMomento`. */
function aDia(momento: string | null): string | null {
  return momento === null ? null : diaEnPanama(momento);
}

interface FilaDeModulo {
  id: string;
  tipo: TipoDeModulo;
  orden: number;
  contenido: string;
}

/**
 * La subconsulta que exige que la cotización siga siendo un borrador.
 *
 * Va pegada a **cada** sentencia de escritura de módulos, y no es una
 * segunda copia de la comprobación que el puerto hace antes: entre leer el
 * estado y escribir hay una ventana en la que otra petición puede emitir la
 * cotización —T-4—, y sin esta cláusula el módulo entraría o se movería en
 * un documento ya congelado cuyo snapshot pasaría a decir otra cosa. La
 * comprobación de arriba contesta bien el caso corriente; ésta es la que lo
 * hace cierto. Es exactamente lo que `actualizar` ya hace con su
 * `AND estado = 'borrador'`.
 *
 * Lleva su propio `tenant_id` aunque la fila del módulo ya esté filtrada:
 * sin él, una cotización del bufete vecino en estado borrador habilitaría la
 * escritura. El filtro de tenencia no se hereda de la sentencia que lo
 * contiene.
 */
const SOBRE_UN_BORRADOR =
  " EXISTS (SELECT 1 FROM cotizacion c WHERE c.tenant_id = ?" +
  " AND c.id = ? AND c.estado = 'borrador')";

interface FilaDeLinea {
  id: string;
  clase: ClaseDeLinea;
  concepto: string;
  monto: number;
  tipo_proceso_id: string | null;
  tipo_proceso_nombre: string | null;
  orden: number;
}

/**
 * Las líneas con el nombre del trámite resuelto en lectura.
 *
 * El `LEFT JOIN` lleva **su propio `tenant_id`**, igual que los de
 * `SELECCION`: con el filtro repetido en la unión, un `tipo_proceso_id` que
 * cruzara la frontera devuelve `NULL` en vez del nombre ajeno. Y `LEFT` y no
 * `INNER` porque la columna es nullable a propósito —una línea sin trámite es
 * el caso corriente— y porque, si la fila apuntada no se pudiera leer desde
 * este tenant, lo correcto es devolver la línea con el nombre en nulo y no
 * hacerla desaparecer de la cotización. Un `INNER JOIN` escondería la fila, y
 * una línea que desaparece es un monto que desaparece del total.
 */
const SELECCION_DE_LINEAS =
  "SELECT l.id, l.clase, l.concepto, l.monto, l.tipo_proceso_id," +
  " t.nombre AS tipo_proceso_nombre, l.orden" +
  " FROM cotizacion_linea l" +
  " LEFT JOIN tipo_proceso t ON t.id = l.tipo_proceso_id" +
  " AND t.tenant_id = l.tenant_id" +
  " WHERE l.tenant_id = ? AND l.cotizacion_id = ? ORDER BY l.orden";

function aLinea(fila: FilaDeLinea): LineaDeCotizacion {
  return {
    id: fila.id,
    clase: fila.clase,
    concepto: fila.concepto,
    monto: fila.monto,
    tipoProcesoId: fila.tipo_proceso_id,
    tipoProcesoNombre: fila.tipo_proceso_nombre,
    orden: fila.orden,
  };
}

function aModulo(fila: FilaDeModulo): ModuloDeCotizacion {
  return {
    id: fila.id,
    tipo: fila.tipo,
    orden: fila.orden,
    contenido: fila.contenido,
  };
}

/**
 * El cliente entero, para congelarlo dentro del snapshot.
 *
 * Es una consulta aparte y no una ampliación de `SELECCION`, y es a
 * propósito: el listado y la ficha no necesitan el documento ni el
 * representante legal de nadie, y arrastrarlos en las dos consultas que más
 * corren para que una tercera los use sería pagar en todas partes lo que
 * hace falta en una.
 *
 * El `LEFT JOIN` lleva **su propio `tenant_id`**, como todos los de este
 * archivo: con el filtro repetido en la unión, un `tipo_cliente_id` que
 * cruzara la frontera devuelve `NULL` en vez del nombre ajeno. Y se resuelve
 * el **nombre** del tipo y no su llave, porque lo que va al snapshot es lo
 * que una persona puede leer dentro de seis años.
 */
const SELECCION_DE_CLIENTE =
  "SELECT c.id, c.nombre, t.nombre AS tipo, c.documento_tipo," +
  " c.documento_numero, c.representante_legal, c.email, c.telefono" +
  " FROM cliente c" +
  " LEFT JOIN tipo_cliente t ON t.id = c.tipo_cliente_id" +
  " AND t.tenant_id = c.tenant_id" +
  " WHERE c.tenant_id = ? AND c.id = ?";

interface FilaDeCliente {
  id: string;
  nombre: string;
  tipo: string | null;
  documento_tipo: string | null;
  documento_numero: string | null;
  representante_legal: string | null;
  email: string | null;
  telefono: string | null;
}

function aClienteCongelado(fila: FilaDeCliente): ClienteCongelado {
  return {
    id: fila.id,
    nombre: fila.nombre,
    tipo: fila.tipo,
    documentoTipo: fila.documento_tipo,
    documentoNumero: fila.documento_numero,
    representanteLegal: fila.representante_legal,
    email: fila.email,
    telefono: fila.telefono,
  };
}

function aCotizacion(fila: FilaDeCotizacion): Cotizacion {
  return {
    id: fila.id,
    codigo: fila.codigo,
    estado: fila.estado,
    clienteId: fila.cliente_id,
    clienteNombre: fila.cliente_nombre,
    fecha: fila.fecha,
    venceEn: aDia(fila.vence_en),
    moneda: fila.moneda,
    duplicadaDeId: fila.duplicada_de_id,
    creadaPor: fila.creada_por,
    creadaPorNombre: fila.creada_por_nombre,
    creadaEn: fila.creada_en,
  };
}

export function cotizacionesSobreD1(
  base: BaseDeDatos,
): ServicioDeCotizaciones {
  const db = base.lectura;

  async function obtener(
    tenantId: string,
    id: string,
  ): Promise<Cotizacion | null> {
    const fila = await db
      .prepare(`${SELECCION} AND q.id = ?`)
      .bind(tenantId, id)
      .first<FilaDeCotizacion>();

    return fila === null ? null : aCotizacion(fila);
  }

  /**
   * El cliente tiene que ser una fila de `cliente` **de este tenant**.
   *
   * Se comprueba acá, contando, y no se deja que salte la llave foránea ni el
   * disparador de tenencia: lo que llega es un identificador escrito en un
   * formulario, así que «ese cliente ya no existe» es una respuesta de
   * negocio y no un defecto. Es la misma frontera que `tipoDesconocido` en
   * clientes — se cuenta lo que una persona puede equivocar, y se deja saltar
   * lo que solo un defecto produce.
   *
   * No se exige `activo`: un cliente no tiene esa columna, y aunque la
   * tuviera, dejar de poder editar la cotización de un cliente viejo sería el
   * mismo error que T-5 evitó con los tipos de cliente.
   */
  async function clienteDesconocido(
    tenantId: string,
    clienteId: string,
  ): Promise<boolean> {
    const fila = await db
      .prepare("SELECT id FROM cliente WHERE tenant_id = ? AND id = ?")
      .bind(tenantId, clienteId)
      .first<{ id: string }>();

    return fila === null;
  }

  async function validarCliente(
    tenantId: string,
    datos: DatosDeCotizacion,
  ): Promise<FallaDeValidacion[]> {
    if (!(await clienteDesconocido(tenantId, datos.clienteId))) return [];

    return [{ campo: "clienteId", motivo: "cliente_desconocido" }];
  }

  /**
   * El próximo código del bufete para el año de `momento`.
   *
   * **Lo genera el servidor y no lo teclea nadie.** Un código escrito a mano
   * produce choques —dos personas eligen el mismo— y huecos, y el hueco es el
   * que rompe la pregunta que el código existe para contestar: «¿qué le
   * cotizamos a este cliente en marzo?».
   *
   * El correlativo es **por bufete y por año**, que son dos ejes y no uno. El
   * `WHERE tenant_id = ?` es el primero; el `LIKE 'COT-<año>-%'` es el
   * segundo. Confundirlos no rompe nada visible el primer día: rompe en enero,
   * o el día que haya un segundo bufete.
   *
   * `CAST(substr(...) AS INTEGER)` y no `MAX(codigo)` a secas: el máximo
   * lexicográfico de un correlativo rellenado a cuatro dígitos coincide con el
   * numérico **hasta 9999 y no más**, y el día que un bufete pase de ahí
   * `'COT-2026-9999'` seguiría ganándole a `'COT-2026-10000'` y el servidor
   * propondría un código ya tomado. Con el `CAST` eso no pasa y el relleno
   * pasa a ser cosmética.
   *
   * Sigue al **máximo** y no cuenta filas, y la diferencia importa el día que
   * haya un hueco: contar haría que borrar la cotización del medio devolviera
   * un número ya entregado a un cliente. Lo que el máximo no cubre es el
   * hueco **del final** —borrar la última libera su número—, y se deja así a
   * conciencia: la API no borra cotizaciones, no hay `DELETE` en ninguna
   * ruta, así que para llegar a ese caso hay que entrar a la consola de D1.
   * La alternativa es una tabla de contadores que no se reinicia, y es cara
   * para un agujero que el sistema no sabe abrir.
   *
   * **No hay reintento, y es deliberado.** Entre leer este número y escribir
   * la fila hay una ventana en la que otra petición puede tomarlo; si pasa, el
   * índice único `cotizacion_codigo_unico` la rechaza y el error sale. Con dos
   * personas en el bufete esa carrera es despreciable, y un reintento en
   * silencio es exactamente la clase de código que esconde que el generador
   * tiene un defecto.
   */
  async function proximoCodigo(
    tenantId: string,
    momento: string,
  ): Promise<string> {
    const prefijo = prefijoDelCodigo(momento);

    const fila = await db
      .prepare(
        "SELECT MAX(CAST(substr(codigo, ?) AS INTEGER)) AS ultimo" +
          " FROM cotizacion WHERE tenant_id = ? AND codigo LIKE ?",
      )
      .bind(prefijo.length + 1, tenantId, `${prefijo}%`)
      .first<{ ultimo: number | null }>();

    const siguiente = (fila?.ultimo ?? 0) + 1;

    return `${prefijo}${String(siguiente).padStart(4, "0")}`;
  }

  /**
   * Los módulos de la cotización, en su orden. Con el filtro de tenencia
   * puesto, igual que todas las demás consultas de este archivo (I-8).
   */
  async function leerModulos(
    tenantId: string,
    cotizacionId: string,
  ): Promise<ModuloDeCotizacion[]> {
    const { results } = await db
      .prepare(
        "SELECT id, tipo, orden, contenido FROM cotizacion_modulo" +
          " WHERE tenant_id = ? AND cotizacion_id = ? ORDER BY orden",
      )
      .bind(tenantId, cotizacionId)
      .all<FilaDeModulo>();

    return results.map(aModulo);
  }

  /**
   * Las líneas de la cotización, en su orden. Con el filtro de tenencia
   * puesto —dos veces, porque la unión lleva el suyo— igual que todas las
   * demás consultas de este archivo (I-8).
   */
  async function leerLineas(
    tenantId: string,
    cotizacionId: string,
  ): Promise<LineaDeCotizacion[]> {
    const { results } = await db
      .prepare(SELECCION_DE_LINEAS)
      .bind(tenantId, cotizacionId)
      .all<FilaDeLinea>();

    return results.map(aLinea);
  }

  /**
   * El trámite de una línea, si viene, tiene que ser una fila de
   * `tipo_proceso` **de este tenant**.
   *
   * Se comprueba acá, contando, y no se deja que salte la llave foránea ni el
   * disparador de tenencia, por el mismo argumento que `clienteDesconocido`:
   * lo que llega es un identificador elegido en un desplegable que puede
   * haber quedado viejo entre que el formulario cargó y se envió, así que
   * «ese tipo de proceso ya no existe» es una respuesta de negocio y no un
   * defecto. Se cuenta lo que una persona puede equivocar, y se deja saltar
   * lo que sólo un defecto produce.
   *
   * **No se exige `activo`**, igual que con el cliente: un tipo dado de baja
   * sigue siendo el trámite de una cotización que ya lo nombraba, y dejar de
   * poder editarla sería el mismo error que T-5 evitó con los tipos de
   * cliente.
   */
  async function validarTipoDeProceso(
    tenantId: string,
    datos: DatosDeLinea,
  ): Promise<FallaDeValidacion[]> {
    if (datos.tipoProcesoId === null) return [];

    const fila = await db
      .prepare("SELECT id FROM tipo_proceso WHERE tenant_id = ? AND id = ?")
      .bind(tenantId, datos.tipoProcesoId)
      .first<{ id: string }>();

    if (fila !== null) return [];

    return [{ campo: "tipoProcesoId", motivo: "tipo_proceso_desconocido" }];
  }

  /**
   * El guardián de las cuatro escrituras: que la cotización exista en este
   * bufete y que siga siendo un borrador.
   *
   * **Esta comprobación vive acá y no sólo en la ruta, y es a propósito.**
   * T-4 y T-5 van a llamar al puerto directo, sin ruta delante; una regla
   * que sólo estuviera en el ruteo sería una regla que esas tareas se
   * saltan sin enterarse. La prueba «el puerto se niega igual, sin pasar
   * por la ruta» de `test/modulos-api.spec.ts` es la que la mantiene viva:
   * sin ella, borrar estas tres líneas no pondría nada en rojo.
   *
   * Y no atrapa nada: la base no tiene hoy ninguna guarda contra agregarle
   * un módulo a una emitida —I-4 es de T-4, con su propio disparador—, así
   * que no hay error que disfrazar. Se **cuenta** el estado.
   */
  async function borradorParaEscribir(
    tenantId: string,
    cotizacionId: string,
  ): Promise<EscrituraBloqueada | null> {
    const cotizacion = await obtener(tenantId, cotizacionId);
    if (cotizacion === null) return { estado: "no_encontrado" };

    if (cotizacion.estado !== "borrador") {
      return { estado: "no_es_borrador", actual: cotizacion.estado };
    }

    return null;
  }

  /**
   * Qué contestar cuando la escritura no tocó ninguna fila.
   *
   * **Cero filas tiene dos causas y no una**, y confundirlas era un defecto
   * medido, no razonado. Con la cláusula `EXISTS` puesta, una sentencia no
   * escribe si la cotización dejó de ser un borrador —la carrera contra una
   * emisión de T-4— **o** si la fila que apunta ya no está, porque otra
   * petición la quitó entre que este método comprobó que existía y escribió.
   *
   * Lo que se medía antes de distinguirlas, provocando la carrera a mano con
   * el arnés de `test/modulos-api.spec.ts`:
   *
   *     editar con un quitar colado → { no_es_borrador, actual: "borrador" }
   *
   * Un 409 `cotizacion_no_es_borrador` acompañado del estado `borrador`: el
   * mensaje dice una cosa y el dato que viaja con él dice la contraria. Es
   * la misma clase de defecto que la unidad B sacó de una pantalla, acá en
   * la respuesta.
   *
   * Por eso **manda la relectura** y no la suposición. Si la cotización ya
   * no es un borrador, el 409 es verdad y lleva el estado de verdad. Si
   * sigue siéndolo, lo que pasó es lo otro, y cada llamador dice qué
   * contestar en ese caso con `siSigueSiendoBorrador`: no se decide acá
   * porque no es la misma respuesta desde la dirección de un módulo que
   * desde la de la colección.
   *
   * `siSigueSiendoBorrador` es una función y no un valor para que un
   * llamador pueda **levantar** en vez de contestar. El alta la usa así:
   * su sentencia no apunta a ninguna fila existente, así que para ella esa
   * rama es un estado que el sistema no sabe producir, y fabricarle una
   * respuesta amable sería esconder un defecto.
   *
   * **Lo que esto cuesta, dicho para que sea una decisión**, y es el mismo
   * residuo que la unidad A dejó anotado en `actualizar`: la entrada de
   * bitácora viajó en el mismo `batch` —así lo exige `mutar`, y es lo que
   * impide escribir sin registrar—, así que en estas ramas queda un
   * «editó el módulo» de algo que no se editó. Un hecho de más en el
   * registro contra una respuesta que se contradice: de los dos males, el
   * menor.
   */
  async function escrituraSinEfecto(
    tenantId: string,
    cotizacionId: string,
    siSigueSiendoBorrador: () => EscrituraBloqueada,
  ): Promise<EscrituraBloqueada> {
    const ahora = await obtener(tenantId, cotizacionId);
    if (ahora === null) return { estado: "no_encontrado" };

    if (ahora.estado !== "borrador") {
      return { estado: "no_es_borrador", actual: ahora.estado };
    }

    return siSigueSiendoBorrador();
  }

  /**
   * El cliente de la cotización, con el filtro de tenencia puesto (I-8).
   *
   * Devuelve `null` sólo si la fila no está, y eso no es un caso de negocio:
   * `cliente_id` es `NOT NULL`, la llave foránea está en `NO ACTION` y
   * `cotizacion_tenencia_coherente_al_insertar` ya garantizó que las dos
   * filas son del mismo bufete. Quien llama levanta en vez de inventarle una
   * respuesta amable, igual que `crear` con su relectura imposible.
   */
  async function leerClienteCongelado(
    tenantId: string,
    clienteId: string,
  ): Promise<ClienteCongelado | null> {
    const fila = await db
      .prepare(SELECCION_DE_CLIENTE)
      .bind(tenantId, clienteId)
      .first<FilaDeCliente>();

    return fila === null ? null : aClienteCongelado(fila);
  }

  /**
   * Quién emite, resuelto a nombre.
   *
   * El identificador viene de la puerta de Access, así que la fila existe.
   * El nombre se deja nulo si no se pudiera leer desde este bufete, por el
   * mismo criterio que `creadaPorNombre` en `SELECCION`: un hueco honesto
   * antes que un nombre ajeno, y antes que hacer fallar una emisión por un
   * dato de presentación.
   */
  async function leerEmisor(
    tenantId: string,
    emisorId: string,
  ): Promise<EmisorCongelado> {
    const fila = await db
      .prepare("SELECT nombre FROM usuario WHERE tenant_id = ? AND id = ?")
      .bind(tenantId, emisorId)
      .first<{ nombre: string }>();

    return { id: emisorId, nombre: fila?.nombre ?? null };
  }

  return {
    async listar(tenantId) {
      // De la más nueva a la más vieja: el listado contesta «¿qué estamos
      // cotizando?», y esa pregunta se agota en lo último. `q.id` desempata
      // para que dos cotizaciones abiertas en el mismo milisegundo salgan
      // siempre en el mismo orden y el listado no parpadee entre recargas.
      const { results } = await db
        .prepare(`${SELECCION} ORDER BY q.fecha DESC, q.id DESC`)
        .bind(tenantId)
        .all<FilaDeCotizacion>();

      return results.map(aCotizacion);
    },

    obtener,

    async crear(tenantId, autorId, datos) {
      const fallas = await validarCliente(tenantId, datos);
      if (fallas.length > 0) return { estado: "invalido", fallas };

      const id = nuevoId();
      const ahora = ahoraIso();
      const codigo = await proximoCodigo(tenantId, ahora);

      // `estado` va literal y `snapshot` no se menciona: un borrador nace
      // borrador y sin documento congelado, que es la mitad que el `CHECK` de
      // coherencia de T-1 exige. Emitir es de T-4 y no tiene camino acá.
      //
      // `moneda` tampoco se menciona: la columna tiene `DEFAULT 'USD'` y el
      // `CHECK` la cierra a ese único valor, así que escribirla sería repetir
      // en el código una decisión que ya está en la base.
      await base.mutar(
        {
          entidad: "cotizacion",
          entidadId: id,
          accion: "creado",
          // El código y no el nombre del cliente: es lo que identifica a la
          // cotización de cara a una persona, y es lo que va a buscar quien
          // lea la bitácora.
          detalle: codigo,
        },
        sentencia(
          "INSERT INTO cotizacion (id, tenant_id, cliente_id, codigo," +
            " estado, fecha, vence_en, creada_por, creada_en)" +
            " VALUES (?, ?, ?, ?, 'borrador', ?, ?, ?, ?)",
          id,
          tenantId,
          datos.clienteId,
          codigo,
          ahora,
          aMomento(datos.venceEn),
          autorId,
          ahora,
        ),
      );

      const cotizacion = await obtener(tenantId, id);
      if (cotizacion === null) {
        // Inalcanzable salvo que el `INSERT` no haya escrito: si pasa, es un
        // defecto y no un 404 de negocio.
        throw new Error("la cotización recién creada no se pudo releer");
      }

      return { estado: "guardado", cotizacion };
    },

    async actualizar(tenantId, id, datos) {
      // La existencia se comprueba **dentro del tenant**. Una cotización de
      // otro bufete es, desde acá, una cotización que no existe.
      const actual = await obtener(tenantId, id);
      if (actual === null) return { estado: "no_encontrado" };

      // Y el estado manda sobre el cuerpo: lo que bloquea es que ya no sea un
      // borrador, así que decirle a la pantalla «arreglá el formulario» la
      // mandaría a corregir algo que no la va a dejar pasar igual.
      //
      // Esto **cuenta** el estado; no atrapa nada. La base no tiene hoy
      // ninguna guarda contra editar una emitida —I-4 es de T-4, con su
      // propio disparador— así que sin esta comprobación el `UPDATE` pasaría
      // y dejaría una emitida cuyo documento congelado dice otra cosa que sus
      // columnas vivas.
      if (actual.estado !== "borrador") {
        return { estado: "no_es_borrador", actual: actual.estado };
      }

      const fallas = await validarCliente(tenantId, datos);
      if (fallas.length > 0) return { estado: "invalido", fallas };

      // El `SET` tiene exactamente dos columnas, y las diez que faltan son la
      // decisión: `codigo` no se reescribe porque es la identidad del
      // documento de cara al cliente; `fecha`, `creada_por` y `creada_en` son
      // hechos y editar un vencimiento no reescribe quién abrió el borrador
      // ni cuándo; `estado`, `snapshot` y `moneda` no son de esta ruta.
      //
      // **`AND estado = 'borrador'` repite en SQL la comprobación de arriba,
      // y no es redundante.** Entre la lectura y esta escritura hay una
      // ventana en la que otra petición puede emitir la cotización; sin la
      // cláusula, este `UPDATE` pisaría `cliente_id` y `vence_en` de una
      // emitida y su snapshot congelado quedaría diciendo otra cosa que sus
      // columnas vivas. No hay vuelta atrás: el documento ya salió. La
      // comprobación de arriba contesta bien el caso corriente; ésta es la
      // que lo hace cierto.
      const [efecto] = await base.mutar(
        {
          entidad: "cotizacion",
          entidadId: id,
          accion: "editado",
          detalle: actual.codigo,
        },
        sentencia(
          "UPDATE cotizacion SET cliente_id = ?, vence_en = ?" +
            " WHERE tenant_id = ? AND id = ? AND estado = 'borrador'",
          datos.clienteId,
          aMomento(datos.venceEn),
          tenantId,
          id,
        ),
      );

      // Cero filas quiere decir que perdimos la carrera. Se relee para decir
      // la verdad sobre en qué quedó: contestar con el estado que se había
      // leído antes sería repetir la foto vieja que acaba de quedar mal.
      //
      // **Lo que esto cuesta, dicho para que sea una decisión.** La entrada
      // de bitácora viajó en el mismo `batch` que el `UPDATE` —así lo exige
      // `mutar`, y es lo que hace que no se pueda escribir sin registrar—,
      // así que en esta rama queda un «editó» de una edición que no ocurrió.
      // Es un hecho de más en el registro, contra un documento emitido
      // corrompido en silencio: de los dos males es claramente el menor, y
      // sólo aparece si dos personas escriben la misma cotización en el
      // mismo instante. Cerrarlo del todo pide que `mutar` admita un
      // registro condicional, que es `worker/db/base.ts` y otra tarea.
      if (efecto.meta.changes === 0) {
        const ahora = await obtener(tenantId, id);
        if (ahora === null) return { estado: "no_encontrado" };

        return { estado: "no_es_borrador", actual: ahora.estado };
      }

      const cotizacion = await obtener(tenantId, id);
      if (cotizacion === null) return { estado: "no_encontrado" };

      return { estado: "guardado", cotizacion };
    },

    listarModulos: leerModulos,

    async agregarModulo(tenantId, cotizacionId, datos) {
      const bloqueo = await borradorParaEscribir(tenantId, cotizacionId);
      if (bloqueo !== null) return bloqueo;

      // **El `orden` se calcula dentro de la sentencia, no antes.** Leerlo
      // en una consulta aparte y escribirlo en un `batch` posterior deja una
      // ventana en la que otra alta calcula el mismo número, y la segunda
      // choca contra `cotizacion_modulo_orden_unico`. Medido, provocando la
      // carrera a mano:
      //
      //     D1_ERROR: UNIQUE constraint failed:
      //       cotizacion_modulo.cotizacion_id, cotizacion_modulo.orden
      //
      // O sea un 500 ilegible en una operación corriente, y no hacen falta
      // dos personas: alcanzan dos pestañas abiertas de la misma cotización.
      // Adentro del `INSERT`, el máximo se evalúa mientras la transacción
      // tiene el candado de escritura, así que dos altas se serializan y la
      // segunda ve a la primera. Es la misma disciplina que el
      // reordenamiento ya tenía —el `orden` se decide en el `batch`— y de la
      // que el alta se había quedado afuera.
      //
      // No se arregla atrapando el error: la guarda se cuenta y nunca se
      // atrapa, y un `catch` con reintento escondería para siempre que el
      // generador del orden tiene un defecto.
      //
      // `COALESCE(MAX(orden), -1) + 1` y no `COUNT(*)`: quitar un módulo
      // deja un hueco —no se recompacta, porque lo que vale es el orden
      // relativo y no el número— y contar devolvería una posición que otra
      // fila ya tiene. El `-1` es lo que hace que la primera nazca en 0.
      //
      // Al final de la lista, siempre. Un módulo nuevo que apareciera en el
      // medio movería lo que la persona ya había ordenado, y el único lugar
      // donde el orden se decide es el reordenamiento.
      const [efecto] = await base.mutar(
        {
          entidad: "cotizacion",
          entidadId: cotizacionId,
          accion: "modulo_agregado",
          // El rótulo del tipo y no el contenido: `detalle` es el nombre de
          // cara al usuario de lo que el hecho señala, nunca una segunda
          // copia del dato. El texto del módulo sigue estando en su fila.
          detalle: rotuloDeTipo(datos.tipo),
        },
        sentencia(
          "INSERT INTO cotizacion_modulo (id, tenant_id, cotizacion_id," +
            " tipo, orden, contenido) SELECT ?, ?, ?, ?," +
            " (SELECT COALESCE(MAX(orden), -1) + 1 FROM cotizacion_modulo" +
            " WHERE tenant_id = ? AND cotizacion_id = ?), ? WHERE" +
            SOBRE_UN_BORRADOR,
          nuevoId(),
          tenantId,
          cotizacionId,
          datos.tipo,
          tenantId,
          cotizacionId,
          datos.contenido,
          tenantId,
          cotizacionId,
        ),
      );

      if (efecto.meta.changes === 0) {
        // El `INSERT` no apunta a ninguna fila existente, así que su única
        // causa de cero es la cláusula `EXISTS`. Que la relectura dijera
        // «sigue siendo borrador» sería un estado que este sistema no sabe
        // producir —no hay camino de vuelta de emitida a borrador—, y se
        // levanta en vez de inventarle una respuesta amable, igual que el
        // `crear` de la cotización con su relectura imposible.
        return escrituraSinEfecto(tenantId, cotizacionId, () => {
          throw new Error(
            "el módulo no entró en una cotización que sigue siendo borrador",
          );
        });
      }

      return {
        estado: "guardado",
        modulos: await leerModulos(tenantId, cotizacionId),
      };
    },

    async editarModulo(tenantId, cotizacionId, moduloId, datos) {
      const bloqueo = await borradorParaEscribir(tenantId, cotizacionId);
      if (bloqueo !== null) return bloqueo;

      // Que el módulo sea de **esta** cotización y de **este** bufete se
      // comprueba leyéndolo, no dejando que el `UPDATE` no encuentre nada:
      // sin esto, editar un módulo ajeno y perder la carrera contra una
      // emisión se contestarían iguales, y son cosas muy distintas.
      const existentes = await leerModulos(tenantId, cotizacionId);
      if (!existentes.some((modulo) => modulo.id === moduloId)) {
        return { estado: "no_encontrado" };
      }

      // El `SET` no menciona `orden`: editar el texto de un módulo no lo
      // mueve de lugar. Mover es la otra operación, con su propio verbo.
      const [efecto] = await base.mutar(
        {
          entidad: "cotizacion",
          entidadId: cotizacionId,
          accion: "modulo_editado",
          // El rótulo del tipo **nuevo**: es lo que quedó escrito. La
          // bitácora guarda hechos, no diffs.
          detalle: rotuloDeTipo(datos.tipo),
        },
        sentencia(
          "UPDATE cotizacion_modulo SET tipo = ?, contenido = ?" +
            " WHERE tenant_id = ? AND cotizacion_id = ? AND id = ? AND" +
            SOBRE_UN_BORRADOR,
          datos.tipo,
          datos.contenido,
          tenantId,
          cotizacionId,
          moduloId,
          tenantId,
          cotizacionId,
        ),
      );

      if (efecto.meta.changes === 0) {
        // Sigue siendo borrador quiere decir que el módulo se fue entre la
        // comprobación de arriba y esta escritura. Es un 404 y no un motivo
        // nuevo: «ese módulo no está» es exactamente lo que esta dirección
        // ya contesta cuando no estaba desde el principio, y lo único que
        // cambia es cuándo nos enteramos. Dos respuestas distintas para el
        // mismo hecho, que además llevan a la misma acción —recargar—, son
        // una de más.
        return escrituraSinEfecto(tenantId, cotizacionId, () => ({
          estado: "no_encontrado",
        }));
      }

      return {
        estado: "guardado",
        modulos: await leerModulos(tenantId, cotizacionId),
      };
    },

    async quitarModulo(tenantId, cotizacionId, moduloId) {
      const bloqueo = await borradorParaEscribir(tenantId, cotizacionId);
      if (bloqueo !== null) return bloqueo;

      const existentes = await leerModulos(tenantId, cotizacionId);
      const quitado = existentes.find((modulo) => modulo.id === moduloId);
      if (quitado === undefined) return { estado: "no_encontrado" };

      // El hueco que esto deja en `orden` no se recompacta, y es una
      // decisión: lo que la lista usa es el orden **relativo**, el índice
      // único sólo exige que no se repita, y recompactar sería reescribir
      // cada fila siguiente para que el número quede bonito. El
      // reordenamiento ya los deja consecutivos cuando de verdad hace falta.
      const [efecto] = await base.mutar(
        {
          entidad: "cotizacion",
          entidadId: cotizacionId,
          accion: "modulo_quitado",
          detalle: rotuloDeTipo(quitado.tipo),
        },
        sentencia(
          "DELETE FROM cotizacion_modulo" +
            " WHERE tenant_id = ? AND cotizacion_id = ? AND id = ? AND" +
            SOBRE_UN_BORRADOR,
          tenantId,
          cotizacionId,
          moduloId,
          tenantId,
          cotizacionId,
        ),
      );

      if (efecto.meta.changes === 0) {
        // Sigue siendo borrador quiere decir que el módulo se fue entre la
        // comprobación de arriba y esta escritura. Es un 404 y no un motivo
        // nuevo: «ese módulo no está» es exactamente lo que esta dirección
        // ya contesta cuando no estaba desde el principio, y lo único que
        // cambia es cuándo nos enteramos. Dos respuestas distintas para el
        // mismo hecho, que además llevan a la misma acción —recargar—, son
        // una de más.
        return escrituraSinEfecto(tenantId, cotizacionId, () => ({
          estado: "no_encontrado",
        }));
      }

      return {
        estado: "guardado",
        modulos: await leerModulos(tenantId, cotizacionId),
      };
    },

    /**
     * El reordenamiento, que es donde vive la trampa de esta tarea.
     *
     * ## Por qué no se puede incrementar en su lugar
     *
     * `cotizacion_modulo` lleva índice único sobre `(cotizacion_id, orden)`,
     * al revés que `proceso_etapa`, y `migrations/0004_cotizaciones.sql`
     * explica que la diferencia es deliberada. La consecuencia es concreta:
     * un `UPDATE … SET orden = ?` fila por fila choca **transitoriamente**
     * —ponerle 2 al primero mientras el 2 todavía lo tiene otro— y SQLite no
     * tiene restricciones únicas diferibles, así que el `batch` entero
     * aborta. `reemplazarEtapas` no sirve de modelo para esto porque allá el
     * problema no existe; lo que sí se le copia es la forma de armar un
     * arreglo de sentencias para un solo `mutar`.
     *
     * ## De las dos salidas, la que conserva los identificadores
     *
     * La migración nombra dos: borrar el tramo y volver a insertarlo, o
     * pasar por un rango disjunto antes de asignar los definitivos. Se eligió
     * **el rango disjunto**, y el criterio es el identificador:
     *
     *  - Borrar e insertar le cambia el `id` a cada módulo en cada
     *    reordenamiento. Un `id` que cambia es una fila que perdió su
     *    historia: la dirección `/modulos/{id}` que la pantalla tenía abierta
     *    deja de existir, el `detalle` de una entrada de bitácora ya no se
     *    puede atar a nada, y cualquier cosa que T-4 o T-7 quieran referir
     *    desde afuera apunta a una fila borrada. Arrastrar un módulo no es
     *    reemplazarlo.
     *  - El rango disjunto conserva cada fila y cuesta **lo mismo**: dos
     *    sentencias por módulo contra un borrado más un alta por módulo.
     *
     * ## Por qué el rango de paso es negativo
     *
     * La primera pasada aparca cada módulo en `-(posición + 1)`, es decir
     * −1, −2, −3… La segunda le pone su posición definitiva, 0, 1, 2…
     *
     * Que no choquen no es suerte y no depende de cuántos módulos haya: todo
     * orden que este código escribe es una posición de arreglo, o sea `>= 0`,
     * así que el rango negativo es disjunto de **cualquier** valor guardado,
     * y los definitivos son disjuntos del rango negativo porque después de la
     * primera pasada no queda ninguna fila de esta cotización en positivo.
     * Un desplazamiento del tipo `orden + 1000` tendría la misma forma y un
     * tope: el módulo mil choca.
     *
     * Las dos pasadas viajan en el mismo `batch`, que en D1 es una
     * transacción: no hay ningún instante observable desde afuera en que los
     * órdenes negativos existan, y si algo abortara no queda media lista.
     */
    async reordenarModulos(tenantId, cotizacionId, orden) {
      const bloqueo = await borradorParaEscribir(tenantId, cotizacionId);
      if (bloqueo !== null) return bloqueo;

      const existentes = await leerModulos(tenantId, cotizacionId);
      const conocidos = new Set(existentes.map((modulo) => modulo.id));

      // Un id que no es de ESTA cotización no se toca. Primero éste, porque
      // «ese módulo no es tuyo» es más preciso que «la lista no coincide».
      const fallas: FallaDeValidacion[] = [];
      orden.forEach((moduloId, indice) => {
        if (!conocidos.has(moduloId)) {
          fallas.push({
            campo: `orden-${String(indice)}`,
            motivo: "modulo_desconocido",
          });
        }
      });
      if (fallas.length > 0) return { estado: "invalido", fallas };

      // Y la lista tiene que ser una permutación exacta: ni falta ni repite.
      // Lo primero dejaría filas con el orden viejo mezcladas entre las
      // nuevas; lo segundo pediría dos posiciones para la misma fila, que el
      // índice único rechazaría con un 500.
      const nombrados = new Set(orden);
      if (nombrados.size !== orden.length || orden.length !== conocidos.size) {
        return {
          estado: "invalido",
          fallas: [{ campo: "orden", motivo: "orden_incompleto" }],
        };
      }

      // Reordenar a lo que ya estaba no es un hecho, y la pantalla lo va a
      // mandar igual cuando alguien suelte un módulo donde lo levantó. Se
      // corta acá, **antes** de `mutar`: una entrada de bitácora que dice
      // «reordenó los módulos» cuando nada se movió es una decisión
      // inventada, y la bitácora existe para no mentir.
      const yaEstaba = existentes.every(
        (modulo, indice) => modulo.id === orden[indice],
      );
      if (yaEstaba) return { estado: "guardado", modulos: existentes };

      const aparcar = (moduloId: string, indice: number): Sentencia =>
        sentencia(
          "UPDATE cotizacion_modulo SET orden = ?" +
            " WHERE tenant_id = ? AND cotizacion_id = ? AND id = ? AND" +
            SOBRE_UN_BORRADOR,
          -(indice + 1),
          tenantId,
          cotizacionId,
          moduloId,
          tenantId,
          cotizacionId,
        );

      const asentar = (moduloId: string, indice: number): Sentencia =>
        sentencia(
          "UPDATE cotizacion_modulo SET orden = ?" +
            " WHERE tenant_id = ? AND cotizacion_id = ? AND id = ? AND" +
            SOBRE_UN_BORRADOR,
          indice,
          tenantId,
          cotizacionId,
          moduloId,
          tenantId,
          cotizacionId,
        );

      // Un solo hecho para el movimiento entero, y sin `detalle`: lo que se
      // movió es la lista, y nombrar uno de los módulos diría menos que no
      // nombrar ninguno. Es el mismo criterio que `plan_editado`.
      const resultados = await base.mutar(
        {
          entidad: "cotizacion",
          entidadId: cotizacionId,
          accion: "modulos_reordenados",
        },
        ...orden.map(aparcar),
        ...orden.map(asentar),
      );

      // **Ninguna y no la primera**, y la diferencia era un defecto medido.
      // Mirando sólo `resultados[0]` —la sentencia del primer módulo de la
      // lista nueva— bastaba con que ése desapareciera para que esto
      // devolviera un rechazo **habiendo escrito**: el `batch` se había
      // aplicado para los que seguían vivos. Se midió provocando la carrera
      // a mano: la respuesta era `no_es_borrador` con `actual: "borrador"` y
      // los órdenes guardados ya eran los nuevos.
      //
      // La guarda `EXISTS` es la misma en las `2n` sentencias, así que si la
      // cotización dejó de ser un borrador **no escribe ninguna**. Que no
      // haya escrito ninguna es entonces la condición exacta de «la
      // operación entera no ocurrió», y es la única que habilita un rechazo.
      const nadaSeMovio = resultados.every(
        (resultado) => resultado.meta.changes === 0,
      );

      if (nadaSeMovio) {
        // Acá no sirve el 404: la dirección es la de la colección y la
        // cotización existe. Si sigue siendo un borrador, lo que quedó viejo
        // es la lista que mandó la pantalla —nombra módulos que ya no
        // están— y eso es literalmente lo que `orden_incompleto` dice, con
        // la frase que ya manda a recargar. Un motivo nuevo sería una
        // segunda forma de decir lo mismo.
        return escrituraSinEfecto(tenantId, cotizacionId, () => ({
          estado: "invalido",
          fallas: [{ campo: "orden", motivo: "orden_incompleto" }],
        }));
      }

      // Si se movió algo pero a la lista se le fue un módulo en el camino,
      // esto es un guardado honesto y no a medias: los que sobrevivieron
      // quedaron en el orden pedido, y la lista que vuelve sale de releer la
      // base, así que dice la verdad. El hueco que queda en `orden` es el
      // mismo que deja un `quitar`, y vale el mismo argumento: lo que
      // importa es el orden relativo, no el número.
      return {
        estado: "guardado",
        modulos: await leerModulos(tenantId, cotizacionId),
      };
    },

    /* --- Las líneas (T-3 A) ---
     *
     * Las cuatro escrituras son la copia deliberada de las cuatro de
     * módulos: la misma comprobación de borrador en el puerto, la misma
     * cláusula `EXISTS` pegada a cada sentencia, la misma relectura cuando
     * no se tocó ninguna fila y el mismo rango de paso negativo al
     * reordenar. No se redescubrió nada: las tres trampas que la unidad C
     * de T-2 pagó a los golpes —el `orden` calculado fuera del `batch`, el
     * `UPDATE … SET orden = orden + 1` contra el índice único, y suponer
     * una sola causa para «cero filas»— son exactamente las mismas acá,
     * porque `cotizacion_linea` tiene exactamente las mismas restricciones
     * que `cotizacion_modulo`.
     *
     * Lo único que no tiene gemelo es `validarTipoDeProceso`: una línea
     * puede apuntar a un trámite y un módulo no apunta a nada. */

    listarLineas: leerLineas,

    async agregarLinea(tenantId, cotizacionId, datos) {
      const bloqueo = await borradorParaEscribir(tenantId, cotizacionId);
      if (bloqueo !== null) return bloqueo;

      const fallas = await validarTipoDeProceso(tenantId, datos);
      if (fallas.length > 0) return { estado: "invalido", fallas };

      // **El `orden` se calcula dentro de la sentencia, no antes**, por la
      // razón que `agregarModulo` deja medida arriba: leerlo en una consulta
      // aparte abre una ventana en la que otra alta calcula el mismo número
      // y la segunda choca contra `cotizacion_linea_orden_unico` con un 500
      // ilegible. Adentro del `INSERT`, el máximo se evalúa con el candado
      // de escritura tomado y las dos altas se serializan.
      //
      // `COALESCE(MAX(orden), -1) + 1` y no `COUNT(*)`: quitar una línea
      // deja un hueco, y contar devolvería una posición que otra fila ya
      // tiene.
      const [efecto] = await base.mutar(
        {
          entidad: "cotizacion",
          entidadId: cotizacionId,
          accion: "linea_agregada",
          // El concepto recortado y **nunca el monto**: `detalle` es el
          // nombre de cara al usuario de lo que el hecho señala, no una
          // segunda copia del dato. Y es el concepto y no el rótulo de la
          // clase porque en una cotización hay seis honorarios y lo único
          // que los distingue es lo que dice cada uno.
          detalle: recorte(datos.concepto),
        },
        sentencia(
          "INSERT INTO cotizacion_linea (id, tenant_id, cotizacion_id," +
            " clase, concepto, monto, tipo_proceso_id, orden)" +
            " SELECT ?, ?, ?, ?, ?, ?, ?," +
            " (SELECT COALESCE(MAX(orden), -1) + 1 FROM cotizacion_linea" +
            " WHERE tenant_id = ? AND cotizacion_id = ?) WHERE" +
            SOBRE_UN_BORRADOR,
          nuevoId(),
          tenantId,
          cotizacionId,
          datos.clase,
          datos.concepto,
          // Va tal cual, sin pasar por ninguna conversión: `normalizarLinea`
          // ya garantizó que es un entero seguro de cero en adelante, y
          // cualquier aritmética acá lo volvería un flotante que el `CHECK`
          // de `0004` rechazaría con un 500.
          datos.monto,
          datos.tipoProcesoId,
          tenantId,
          cotizacionId,
          tenantId,
          cotizacionId,
        ),
      );

      if (efecto.meta.changes === 0) {
        // El `INSERT` no apunta a ninguna fila existente, así que su única
        // causa de cero es la cláusula `EXISTS`. Que la relectura dijera
        // «sigue siendo borrador» sería un estado que este sistema no sabe
        // producir, y se levanta en vez de inventarle una respuesta amable.
        return escrituraSinEfecto(tenantId, cotizacionId, () => {
          throw new Error(
            "la línea no entró en una cotización que sigue siendo borrador",
          );
        });
      }

      return {
        estado: "guardado",
        lineas: await leerLineas(tenantId, cotizacionId),
      };
    },

    async editarLinea(tenantId, cotizacionId, lineaId, datos) {
      const bloqueo = await borradorParaEscribir(tenantId, cotizacionId);
      if (bloqueo !== null) return bloqueo;

      // Que la línea sea de **esta** cotización y de **este** bufete se
      // comprueba leyéndola, no dejando que el `UPDATE` no encuentre nada:
      // sin esto, editar una línea ajena y perder la carrera contra una
      // emisión se contestarían iguales, y son cosas muy distintas.
      const existentes = await leerLineas(tenantId, cotizacionId);
      if (!existentes.some((linea) => linea.id === lineaId)) {
        return { estado: "no_encontrado" };
      }

      const fallas = await validarTipoDeProceso(tenantId, datos);
      if (fallas.length > 0) return { estado: "invalido", fallas };

      // El `SET` no menciona `orden`: editar una línea no la mueve de lugar.
      // Mover es la otra operación, con su propio verbo.
      const [efecto] = await base.mutar(
        {
          entidad: "cotizacion",
          entidadId: cotizacionId,
          accion: "linea_editada",
          // El concepto **nuevo**: es lo que quedó escrito. La bitácora
          // guarda hechos, no diffs.
          detalle: recorte(datos.concepto),
        },
        sentencia(
          "UPDATE cotizacion_linea SET clase = ?, concepto = ?, monto = ?," +
            " tipo_proceso_id = ?" +
            " WHERE tenant_id = ? AND cotizacion_id = ? AND id = ? AND" +
            SOBRE_UN_BORRADOR,
          datos.clase,
          datos.concepto,
          datos.monto,
          datos.tipoProcesoId,
          tenantId,
          cotizacionId,
          lineaId,
          tenantId,
          cotizacionId,
        ),
      );

      if (efecto.meta.changes === 0) {
        // Sigue siendo borrador quiere decir que la línea se fue entre la
        // comprobación de arriba y esta escritura. Es un 404 y no un motivo
        // nuevo: «esa línea no está» es exactamente lo que esta dirección ya
        // contesta cuando no estaba desde el principio.
        return escrituraSinEfecto(tenantId, cotizacionId, () => ({
          estado: "no_encontrado",
        }));
      }

      return {
        estado: "guardado",
        lineas: await leerLineas(tenantId, cotizacionId),
      };
    },

    async quitarLinea(tenantId, cotizacionId, lineaId) {
      const bloqueo = await borradorParaEscribir(tenantId, cotizacionId);
      if (bloqueo !== null) return bloqueo;

      const existentes = await leerLineas(tenantId, cotizacionId);
      const quitada = existentes.find((linea) => linea.id === lineaId);
      if (quitada === undefined) return { estado: "no_encontrado" };

      // El hueco que esto deja en `orden` no se recompacta, igual que con
      // los módulos: lo que la lista usa es el orden **relativo**, el índice
      // único sólo exige que no se repita, y el reordenamiento ya los deja
      // consecutivos cuando de verdad hace falta.
      const [efecto] = await base.mutar(
        {
          entidad: "cotizacion",
          entidadId: cotizacionId,
          accion: "linea_quitada",
          detalle: recorte(quitada.concepto),
        },
        sentencia(
          "DELETE FROM cotizacion_linea" +
            " WHERE tenant_id = ? AND cotizacion_id = ? AND id = ? AND" +
            SOBRE_UN_BORRADOR,
          tenantId,
          cotizacionId,
          lineaId,
          tenantId,
          cotizacionId,
        ),
      );

      if (efecto.meta.changes === 0) {
        return escrituraSinEfecto(tenantId, cotizacionId, () => ({
          estado: "no_encontrado",
        }));
      }

      return {
        estado: "guardado",
        lineas: await leerLineas(tenantId, cotizacionId),
      };
    },

    /**
     * El reordenamiento, con la misma mecánica que el de los módulos y por
     * las mismas razones, que `reordenarModulos` argumenta entera arriba:
     * `cotizacion_linea_orden_unico` prohíbe incrementar en su lugar, el
     * rango de paso es **negativo** porque todo orden que este código
     * escribe es una posición de arreglo y por lo tanto `>= 0`, y las dos
     * pasadas viajan en el mismo `batch`, que en D1 es una transacción.
     *
     * Se conservan los identificadores en vez de borrar e insertar, y acá el
     * argumento pesa más todavía que en los módulos: T-7 va a abrir un
     * proceso por cada línea con `tipo_proceso_id`, y `proceso` va a llevar
     * una llave foránea a `cotizacion_linea`. Una línea que cambia de `id`
     * cada vez que alguien la arrastra es una llave foránea que apunta a una
     * fila borrada.
     */
    async reordenarLineas(tenantId, cotizacionId, orden) {
      const bloqueo = await borradorParaEscribir(tenantId, cotizacionId);
      if (bloqueo !== null) return bloqueo;

      const existentes = await leerLineas(tenantId, cotizacionId);
      const conocidas = new Set(existentes.map((linea) => linea.id));

      // Un id que no es de ESTA cotización no se toca. Primero éste, porque
      // «esa línea no es tuya» es más preciso que «la lista no coincide».
      const fallas: FallaDeValidacion[] = [];
      orden.forEach((lineaId, indice) => {
        if (!conocidas.has(lineaId)) {
          fallas.push({
            campo: `orden-${String(indice)}`,
            motivo: "linea_desconocida",
          });
        }
      });
      if (fallas.length > 0) return { estado: "invalido", fallas };

      // Y la lista tiene que ser una permutación exacta: ni falta ni repite.
      const nombradas = new Set(orden);
      if (nombradas.size !== orden.length || orden.length !== conocidas.size) {
        return {
          estado: "invalido",
          fallas: [{ campo: "orden", motivo: "orden_incompleto" }],
        };
      }

      // Reordenar a lo que ya estaba no es un hecho, y la pantalla lo va a
      // mandar igual cuando alguien suelte una línea donde la levantó. Se
      // corta **antes** de `mutar`: una entrada que dice «reordenó las
      // líneas» cuando nada se movió es una decisión inventada.
      const yaEstaba = existentes.every(
        (linea, indice) => linea.id === orden[indice],
      );
      if (yaEstaba) return { estado: "guardado", lineas: existentes };

      const aparcar = (lineaId: string, indice: number): Sentencia =>
        sentencia(
          "UPDATE cotizacion_linea SET orden = ?" +
            " WHERE tenant_id = ? AND cotizacion_id = ? AND id = ? AND" +
            SOBRE_UN_BORRADOR,
          -(indice + 1),
          tenantId,
          cotizacionId,
          lineaId,
          tenantId,
          cotizacionId,
        );

      const asentar = (lineaId: string, indice: number): Sentencia =>
        sentencia(
          "UPDATE cotizacion_linea SET orden = ?" +
            " WHERE tenant_id = ? AND cotizacion_id = ? AND id = ? AND" +
            SOBRE_UN_BORRADOR,
          indice,
          tenantId,
          cotizacionId,
          lineaId,
          tenantId,
          cotizacionId,
        );

      // Un solo hecho para el movimiento entero, y sin `detalle`: lo que se
      // movió es la lista, y nombrar una de las líneas diría menos que no
      // nombrar ninguna.
      const resultados = await base.mutar(
        {
          entidad: "cotizacion",
          entidadId: cotizacionId,
          accion: "lineas_reordenadas",
        },
        ...orden.map(aparcar),
        ...orden.map(asentar),
      );

      // **Ninguna y no la primera.** La guarda `EXISTS` es la misma en las
      // `2n` sentencias, así que si la cotización dejó de ser un borrador no
      // escribe ninguna; que no haya escrito ninguna es entonces la
      // condición exacta de «la operación entera no ocurrió». Mirar sólo la
      // primera era un defecto medido en los módulos: bastaba con que
      // desapareciera esa fila para devolver un rechazo **habiendo escrito**.
      const nadaSeMovio = resultados.every(
        (resultado) => resultado.meta.changes === 0,
      );

      if (nadaSeMovio) {
        // Acá no sirve el 404: la dirección es la de la colección y la
        // cotización existe. Si sigue siendo un borrador, lo que quedó viejo
        // es la lista que mandó la pantalla, y eso es lo que
        // `orden_incompleto` dice.
        return escrituraSinEfecto(tenantId, cotizacionId, () => ({
          estado: "invalido",
          fallas: [{ campo: "orden", motivo: "orden_incompleto" }],
        }));
      }

      // Si se movió algo pero a la lista se le fue una línea en el camino,
      // esto es un guardado honesto y no a medias: las que sobrevivieron
      // quedaron en el orden pedido, y la lista que vuelve sale de releer la
      // base, así que dice la verdad — los totales también, porque se
      // derivan de lo que vuelve.
      return {
        estado: "guardado",
        lineas: await leerLineas(tenantId, cotizacionId),
      };
    },

    /**
     * Emitir: el borrador se convierte en documento y deja de ser editable
     * (T-4, I-4 e I-5 de `docs/diseno.md` §5).
     *
     * ## El estado y el snapshot viajan en **una sola sentencia**
     *
     * No en el mismo `batch`: en el mismo `UPDATE`. Es más fuerte, y no es
     * una elegancia. El `CHECK` de coherencia de `0004`
     * —`(estado = 'borrador') IS (snapshot IS NULL)`— se evalúa por
     * sentencia, así que partir esto en dos muere en la primera de las dos,
     * en cualquiera de los dos órdenes: la que sólo cambia el estado deja
     * una emitida sin snapshot, y la que sólo escribe el snapshot deja un
     * borrador con uno. No existe la mitad escrita. La entrada de bitácora
     * va en el mismo `batch` que el `UPDATE`, que en D1 es una transacción,
     * así que el hecho tampoco se puede separar del efecto.
     *
     * ## `AND estado = 'borrador'` sigue estando, y ahora por otro motivo
     *
     * Hasta `0006` esa cláusula era la única guarda real contra la carrera.
     * Ahora la base también se niega —reescribir el snapshot muere en
     * `cotizacion_snapshot_se_escribe_una_sola_vez`—, y la cláusula queda
     * por lo que distingue a las dos: la guarda de la base aborta con un
     * 500, y esto **cuenta** el estado para contestar un 409 que dice en
     * qué quedó la cotización. No se atrapa nada; se cuenta antes.
     *
     * ## La ventana que queda, dicha para que sea una decisión
     *
     * Entre leer los módulos y las líneas y escribir el `UPDATE` hay un
     * instante en el que otra petición puede agregar una línea. Si pasa, esa
     * línea entra en la cotización —todavía es borrador— y **no** entra en
     * el snapshot, así que el documento congelado diría menos que las filas
     * vivas. Es la misma ventana que el repositorio ya acepta en el
     * correlativo del código, con el mismo argumento —dos personas en el
     * bufete— y con un costo mayor, así que queda anotada en vez de
     * supuesta. Cerrarla del todo pide que la lectura y la escritura
     * compartan transacción, y eso es `worker/db/base.ts`.
     */
    async emitir(tenantId, emisorId, id) {
      // La existencia se comprueba **dentro del tenant**: una cotización de
      // otro bufete es, desde acá, una cotización que no existe.
      const actual = await obtener(tenantId, id);
      if (actual === null) return { estado: "no_encontrado" };

      if (actual.estado !== "borrador") {
        return { estado: "no_es_borrador", actual: actual.estado };
      }

      const cliente = await leerClienteCongelado(tenantId, actual.clienteId);
      if (cliente === null) {
        // Inalcanzable salvo defecto: `cliente_id` es `NOT NULL`, la llave
        // foránea está en `NO ACTION` y el disparador de tenencia ya exigió
        // que las dos filas sean del mismo bufete. Se levanta en vez de
        // congelar un documento sin el cliente al que se le prometió.
        throw new Error(
          "la cotización que se emite apunta a un cliente que no se puede leer",
        );
      }

      // Los dos listados salen de las mismas funciones que sirven el `GET`,
      // con su `ORDER BY orden`. `congelar` copia ese orden tal cual: un
      // segundo criterio acá haría que el documento congelado se leyera
      // distinto que el vivo.
      const modulos = await leerModulos(tenantId, id);
      const lineas = await leerLineas(tenantId, id);
      const emisor = await leerEmisor(tenantId, emisorId);

      // Una sola lectura del reloj para el snapshot. La de la bitácora la
      // hace `mutar` por su cuenta y es un milisegundo después; no se
      // fuerzan a ser la misma porque son dos hechos distintos —cuándo se
      // congeló el documento y cuándo se registró— y hacerlas coincidir
      // obligaría a que `mutar` recibiera el momento desde afuera, que es la
      // puerta por la que se puede fechar un hecho a mano.
      const emitidaEn = ahoraIso();

      const snapshot = JSON.stringify(
        congelar({
          cotizacion: actual,
          cliente,
          modulos,
          lineas,
          emisor,
          emitidaEn,
        }),
      );

      const [efecto] = await base.mutar(
        {
          entidad: "cotizacion",
          entidadId: id,
          accion: "emitido",
          // El código, igual que en el alta y en la edición: es lo que
          // identifica a la cotización de cara a una persona.
          detalle: actual.codigo,
        },
        sentencia(
          "UPDATE cotizacion SET estado = 'emitida', snapshot = ?" +
            " WHERE tenant_id = ? AND id = ? AND estado = 'borrador'",
          snapshot,
          tenantId,
          id,
        ),
      );

      if (efecto.meta.changes === 0) {
        // Perdimos la carrera contra otra emisión. Se relee para decir la
        // verdad sobre en qué quedó, igual que en `actualizar`, y con el
        // mismo residuo conocido: la entrada de bitácora ya viajó en el
        // mismo `batch`, así que queda un «emitió» de una emisión que no
        // ocurrió. Es el mal menor, y acá el único que la otra petición ya
        // escribió de verdad.
        const ahora = await obtener(tenantId, id);
        if (ahora === null) return { estado: "no_encontrado" };

        return { estado: "no_es_borrador", actual: ahora.estado };
      }

      const cotizacion = await obtener(tenantId, id);
      if (cotizacion === null) return { estado: "no_encontrado" };

      return { estado: "emitida", cotizacion };
    },
  };
}
