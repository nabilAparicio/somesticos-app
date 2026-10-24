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
  Cotizacion,
  DatosDeCotizacion,
  EstadoDeCotizacion,
  FallaDeValidacion,
} from "../contract";
import type { BaseDeDatos } from "../db/base";
import { sentencia } from "../db/base";
import { nuevoId } from "../db/ids";
import {
  ahoraIso,
  diaEnPanama,
  finDelDiaEnPanama,
} from "../db/momentos";

export type ResultadoDeEscritura =
  | { estado: "guardado"; cotizacion: Cotizacion }
  | { estado: "invalido"; fallas: FallaDeValidacion[] }
  | { estado: "no_es_borrador"; actual: EstadoDeCotizacion }
  | { estado: "no_encontrado" };

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
  };
}
