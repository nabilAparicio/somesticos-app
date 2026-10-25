/**
 * Los dos adaptadores de almacenamiento del gasto real: **D1 para las filas y
 * R2 para los papeles**.
 *
 * Están en el mismo archivo porque son las dos mitades de un solo hecho —un
 * movimiento con su comprobante— y porque la regla que los ordena es una
 * sola, la de más abajo. Separarlos en dos archivos haría que esa regla
 * quedara escrita en ninguno de los dos.
 *
 * I-8 (`docs/diseno.md` §5) vive en cada consulta de este archivo: no hay una
 * sola que no filtre por `tenant_id`, ni siquiera las que buscan por llave
 * primaria. Un UUID ajeno sigue siendo un UUID.
 *
 * ## La regla que ordena las dos escrituras: la fila nunca promete un objeto
 * ## que no está
 *
 * D1 es transaccional y R2 no, y no hay transacción que los abarque. Entonces
 * toda operación que toca los dos tiene un orden, y el orden no es cuestión
 * de gusto: **el objeto se escribe antes que la fila que lo nombra, y se
 * borra después que la fila que lo nombraba.** De ahí salen los dos modos de
 * falla, y los dos son el mismo, que es el barato:
 *
 * | Operación | Orden | Si falla la segunda mitad |
 * |---|---|---|
 * | Adjuntar | objeto, después fila | un objeto que nadie nombra |
 * | Borrar   | fila, después objeto | un objeto que nadie nombra |
 *
 * Un objeto huérfano en R2 es plata que alguien paga y basura que nadie
 * encuentra. Una fila que promete un comprobante que no está es peor: es una
 * fila que miente, y lo que §5 pide es exactamente que esa fila no exista.
 *
 * Y el huérfano se puede barrer, porque la llave es determinística: toda
 * dirección bajo `comprobantes/` que no coincida con el
 * `movimiento_gasto.comprobante_key` de su fila es basura. Esa herramienta no
 * se escribió —no hay nada que barrer todavía— pero se puede escribir, que es
 * lo que la decide frente a una llave aleatoria.
 *
 * **Y hay un huérfano que directamente no puede existir: el de la
 * corrección.** Reemplazar el comprobante escribe sobre la misma llave,
 * porque la llave se deriva de la fila y la fila no cambió. No hay un segundo
 * objeto que olvidar.
 *
 * Las dos mitades de la regla **están cubiertas, y cada una pide una prueba
 * distinta**. La de adjuntar se mide con un almacén que falla y mirando que
 * la fila quede sin llave. La de borrar no se puede medir así —la que tiene
 * que fallar es la escritura de D1, y D1 no falla a pedido—, y por eso su
 * prueba usa un `ServicioDeGastos` que rechaza y mira que el papel siga
 * entero. Sin esa segunda prueba, invertir las dos líneas de `quitar` no
 * mataba nada: medido, y por eso existe.
 *
 * ## El almacén se inyecta por el mismo camino que usa producción
 *
 * `AlmacenDeComprobantes` existe por lo mismo que `ModeloDeLenguaje` en T-8:
 * para que las pruebas puedan ejercer las ramas —el almacén sin configurar,
 * el que falla, el objeto que no está— **sin llamar a un R2 real**, que
 * cuesta plata, no es determinista y no corre sin credenciales. El camino que
 * corre desplegado es el mismo: `worker/index.ts` resuelve
 * `dependencias.comprobantes ?? almacenSobreR2(env)`, y lo único que cambia
 * entre una corrida de prueba y una desplegada es quién construyó el objeto.
 */

import type { Evento } from "../bitacora/vocabulario";
import type {
  MovimientoDeGasto,
  MotivoDeFallaDelComprobante,
  DatosDeMovimiento,
  RespuestaDeGastos,
  TipoDeMovimiento,
} from "../contract";
import type { BaseDeDatos } from "../db/base";
import { recorte, sentencia } from "../db/base";
import { nuevoId } from "../db/ids";
import { ahoraIso, diaEnPanama, finDelDiaEnPanama } from "../db/momentos";
import { saldoDe } from "./dominio";

/* ==========================================================================
   El almacén de los papeles
   ========================================================================== */

/** Lo que sale de una operación del almacén. Nunca una excepción. */
export type ResultadoDelAlmacen<T> =
  | { ok: true; valor: T }
  | { ok: false; motivo: MotivoDeFallaDelComprobante };

export interface ComprobanteGuardado {
  readonly cuerpo: ReadableStream;
  readonly tipoDeContenido: string;
}

/**
 * El puerto del almacén de objetos. Es toda la superficie que el resto del
 * sistema ve de R2.
 *
 * No hay excepciones, por lo mismo que `ResultadoDelModelo` y que `Resultado`
 * en `worker/acceso/rechazo.ts`: que el almacén no esté es una respuesta
 * esperada de un despliegue a medias, y el tipo obliga a tratarla en cada
 * llamada en vez de dejarla caer en un 500 que nadie puede leer.
 *
 * `leer` devuelve `null` dentro de un `ok` cuando el objeto no está: eso no
 * es una falla del almacén sino una fila que quedó sin su papel, y quien
 * llama decide qué contestar.
 */
export interface AlmacenDeComprobantes {
  guardar(
    llave: string,
    cuerpo: ArrayBuffer,
    tipoDeContenido: string,
  ): Promise<ResultadoDelAlmacen<void>>;
  leer(llave: string): Promise<ResultadoDelAlmacen<ComprobanteGuardado | null>>;
  borrar(llave: string): Promise<ResultadoDelAlmacen<void>>;
}

/**
 * El almacén que el sistema usa, resuelto desde el entorno.
 *
 * El binding se llama `COMPROBANTES` y **todavía no está en
 * `wrangler.jsonc`**, por lo que `worker/entorno.d.ts` explica: crear el
 * bucket es una operación sobre la cuenta de Cloudflare. Por eso
 * `env.COMPROBANTES` es opcional.
 *
 * **No tira y no devuelve un `Resultado` al construirse**: un despliegue sin
 * binding produce un `AlmacenDeComprobantes` que falla con
 * `almacen_no_configurado` en cuanto se lo usa. Es la misma precedencia que
 * eligieron `autenticar` y `modeloDesdeEntorno`: la guarda de configuración
 * vive **dentro** de la operación, para que haya un solo lugar donde tratarla
 * y para que armar las dependencias de una petición no tenga que distinguir
 * un despliegue a medias de un pedido mal hecho.
 *
 * El `try/catch` de cada operación **no disfraza una guarda**: no hay ninguna
 * regla del dominio detrás de él. Es la frontera con un sistema de arriba, y
 * lo que atrapa es que la red se cayó — exactamente lo que
 * `proveedor_no_disponible` atrapa en la costura con el modelo. Las guardas
 * de este sistema se cuentan y no se atrapan, y las de los gastos están en la
 * migración, donde se pueden contar.
 */
export function almacenSobreR2(env: Env): AlmacenDeComprobantes {
  const bucket = env.COMPROBANTES;

  if (bucket === undefined) {
    const sinConfigurar = <T>(): Promise<ResultadoDelAlmacen<T>> =>
      Promise.resolve({ ok: false, motivo: "almacen_no_configurado" });

    return {
      guardar: sinConfigurar,
      leer: sinConfigurar,
      borrar: sinConfigurar,
    };
  }

  return {
    async guardar(llave, cuerpo, tipoDeContenido) {
      try {
        await bucket.put(llave, cuerpo, {
          httpMetadata: { contentType: tipoDeContenido },
        });
        return { ok: true, valor: undefined };
      } catch {
        return { ok: false, motivo: "almacen_no_disponible" };
      }
    },

    async leer(llave) {
      try {
        const objeto = await bucket.get(llave);
        if (objeto === null) return { ok: true, valor: null };

        return {
          ok: true,
          valor: {
            cuerpo: objeto.body,
            // Un objeto subido por esta API siempre tiene su tipo, porque
            // `guardar` lo escribe. El de reserva es para el que alguien haya
            // puesto por la consola: servirlo como binario opaco es lo único
            // seguro que se puede hacer con un papel de procedencia
            // desconocida.
            tipoDeContenido:
              objeto.httpMetadata?.contentType ?? "application/octet-stream",
          },
        };
      } catch {
        return { ok: false, motivo: "almacen_no_disponible" };
      }
    },

    async borrar(llave) {
      try {
        await bucket.delete(llave);
        return { ok: true, valor: undefined };
      } catch {
        return { ok: false, motivo: "almacen_no_disponible" };
      }
    },
  };
}

/* ==========================================================================
   Las filas
   ========================================================================== */

/**
 * Un movimiento con lo que el cable **no** lleva: la llave de su objeto.
 *
 * La llave no sale del servidor —`MovimientoDeGasto` lleva un booleano— pero
 * las rutas del comprobante la necesitan para hablar con el almacén. Esta es
 * la forma que cruza esa frontera y ninguna otra.
 */
export interface MovimientoConSuLlave {
  readonly id: string;
  readonly tipo: TipoDeMovimiento;
  readonly concepto: string;
  readonly comprobanteKey: string | null;
}

export interface ServicioDeGastos {
  /** Los movimientos del proceso y lo que suman. El saldo se deriva acá. */
  cuenta(tenantId: string, procesoId: string): Promise<RespuestaDeGastos>;
  /** `null` si ese movimiento no es de este proceso en este bufete. */
  obtener(
    tenantId: string,
    procesoId: string,
    movimientoId: string,
  ): Promise<MovimientoConSuLlave | null>;
  registrar(
    tenantId: string,
    procesoId: string,
    usuarioId: string,
    datos: DatosDeMovimiento,
  ): Promise<RespuestaDeGastos>;
  /** Deja escrita la llave del objeto que ya se guardó. */
  adjuntarComprobante(
    tenantId: string,
    procesoId: string,
    movimiento: MovimientoConSuLlave,
    llave: string,
  ): Promise<RespuestaDeGastos>;
  quitar(
    tenantId: string,
    procesoId: string,
    movimiento: MovimientoConSuLlave,
  ): Promise<RespuestaDeGastos>;
}

interface FilaDeMovimiento {
  id: string;
  fecha: string;
  concepto: string;
  monto: number;
  /** El `CHECK` de la migración garantiza que es uno de los dos. */
  tipo: TipoDeMovimiento;
  comprobante_key: string | null;
  usuario_id: string;
  usuario_nombre: string | null;
  registrado_en: string;
}

/**
 * Qué verbo de bitácora nombra el alta de cada tipo, y cuál el borrado.
 *
 * Son dos registros y no dos `if`, por lo mismo que el acumulador de
 * `saldoDe` indexa en vez de ramificar: `Record<TipoDeMovimiento, …>` obliga
 * a que agregar un tipo al vocabulario **no compile** hasta que alguien diga
 * cómo se llama su hecho. Con un `if (tipo === "anticipo")`, un tipo nuevo
 * compilaría y se registraría en silencio bajo el verbo equivocado, que en
 * este vocabulario quiere decir «del lado equivocado del saldo».
 *
 * El valor no es `AccionDeBitacora` sino **los verbos que un proceso admite**,
 * sacados del mismo `Evento` que `mutar` exige: un verbo de cotización acá no
 * compila. Es la misma red distribuida que `ACCIONES_POR_ENTIDAD` monta, leída
 * desde el otro lado.
 */
type AccionDeProceso = Extract<Evento, { entidad: "proceso" }>["accion"];

const ACCION_AL_REGISTRAR: Record<TipoDeMovimiento, AccionDeProceso> = {
  gasto: "gasto_registrado",
  anticipo: "anticipo_registrado",
};

const ACCION_AL_QUITAR: Record<TipoDeMovimiento, AccionDeProceso> = {
  gasto: "gasto_quitado",
  anticipo: "anticipo_quitado",
};

function aMovimiento(fila: FilaDeMovimiento): MovimientoDeGasto {
  return {
    id: fila.id,
    // Se guarda como el fin del día **en Panamá** y se lee de vuelta al día
    // que es. Las dos conversiones son una sola dada vuelta, y por eso van
    // siempre juntas: ver `worker/db/momentos.ts`.
    fecha: diaEnPanama(fila.fecha),
    concepto: fila.concepto,
    monto: fila.monto,
    tipo: fila.tipo,
    // La dirección del objeto no sale del servidor: lo que la pantalla
    // necesita saber es si hay papel, no dónde está.
    tieneComprobante: fila.comprobante_key !== null,
    usuarioId: fila.usuario_id,
    usuarioNombre: fila.usuario_nombre,
    registradoEn: fila.registrado_en,
  };
}

export function gastosSobreD1(base: BaseDeDatos): ServicioDeGastos {
  const db = base.lectura;

  /**
   * Los movimientos del proceso, del más viejo al más nuevo.
   *
   * Una cuenta se lee hacia adelante, al revés que la bitácora: lo que se
   * quiere ver es cómo se fue moviendo la plata, no qué pasó último.
   *
   * El desempate es `registrado_en` y después `m.rowid`, que es el orden de
   * inserción: dos movimientos del mismo día tienen la misma `fecha` —que es
   * un día, no un instante— y sin desempate la cuenta los mostraría en un
   * orden que cambia entre lecturas.
   *
   * La unión con `usuario` repite el filtro de tenencia en el `ON`, igual que
   * las notas: un `usuario_id` que cruzara la frontera devuelve `NULL` en vez
   * del nombre ajeno.
   */
  async function leerMovimientos(
    tenantId: string,
    procesoId: string,
  ): Promise<MovimientoDeGasto[]> {
    const { results } = await db
      .prepare(
        "SELECT m.id, m.fecha, m.concepto, m.monto, m.tipo," +
          " m.comprobante_key, m.usuario_id, u.nombre AS usuario_nombre," +
          " m.registrado_en" +
          " FROM movimiento_gasto m" +
          " LEFT JOIN usuario u ON u.id = m.usuario_id" +
          "   AND u.tenant_id = m.tenant_id" +
          " WHERE m.tenant_id = ? AND m.proceso_id = ?" +
          " ORDER BY m.fecha, m.registrado_en, m.rowid",
      )
      .bind(tenantId, procesoId)
      .all<FilaDeMovimiento>();

    return results.map(aMovimiento);
  }

  /**
   * La cuenta entera: los movimientos y lo que suman.
   *
   * **El saldo se calcula acá, sobre lo que se acaba de leer, y no se guarda
   * en ningún lado** (I-7). No hay columna que actualizar, no hay caché que
   * invalidar y no hay nada que reconciliar: la familia entera de esos
   * errores no existe porque no hay un segundo número.
   */
  async function cuenta(
    tenantId: string,
    procesoId: string,
  ): Promise<RespuestaDeGastos> {
    const movimientos = await leerMovimientos(tenantId, procesoId);
    return { movimientos, saldo: saldoDe(movimientos) };
  }

  return {
    cuenta,

    async obtener(tenantId, procesoId, movimientoId) {
      const fila = await db
        .prepare(
          "SELECT id, tipo, concepto, comprobante_key FROM movimiento_gasto" +
            " WHERE tenant_id = ? AND proceso_id = ? AND id = ?",
        )
        .bind(tenantId, procesoId, movimientoId)
        .first<{
          id: string;
          tipo: TipoDeMovimiento;
          concepto: string;
          comprobante_key: string | null;
        }>();

      if (fila === null) return null;

      return {
        id: fila.id,
        tipo: fila.tipo,
        concepto: fila.concepto,
        comprobanteKey: fila.comprobante_key,
      };
    },

    async registrar(tenantId, procesoId, usuarioId, datos) {
      const id = nuevoId();

      // El hecho se registra contra el **proceso** y no contra el movimiento:
      // un movimiento no tiene pantalla propia, se lee dentro de la cuenta de
      // su proceso, y «¿qué pasó con este proceso?» tiene que contestarse con
      // una sola consulta. El verbo lo elige el tipo indexando un registro, no
      // una rama.
      await base.mutar(
        {
          entidad: "proceso",
          entidadId: procesoId,
          accion: ACCION_AL_REGISTRAR[datos.tipo],
          detalle: recorte(datos.concepto),
        },
        sentencia(
          "INSERT INTO movimiento_gasto (id, tenant_id, proceso_id, fecha," +
            " concepto, monto, tipo, comprobante_key, usuario_id," +
            " registrado_en) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)",
          id,
          tenantId,
          procesoId,
          // El día que la persona eligió, guardado como su último instante en
          // Panamá. `comprobante_key` nace nula y es el caso mayoritario: el
          // monto se sabe hoy y el papel se escanea después.
          finDelDiaEnPanama(datos.fecha),
          datos.concepto,
          datos.monto,
          datos.tipo,
          usuarioId,
          ahoraIso(),
        ),
      );

      // Se relee entera: lo que el servidor dejó guardado manda sobre lo que
      // la pantalla creía, igual que la línea de tiempo de las notas. Y acá
      // hay un motivo más: el saldo que la pantalla va a dibujar tiene que
      // ser el de estos movimientos y no el de los que tenía antes.
      return cuenta(tenantId, procesoId);
    },

    async adjuntarComprobante(tenantId, procesoId, movimiento, llave) {
      await base.mutar(
        {
          entidad: "proceso",
          entidadId: procesoId,
          accion: "comprobante_adjuntado",
          detalle: recorte(movimiento.concepto),
        },
        sentencia(
          "UPDATE movimiento_gasto SET comprobante_key = ?" +
            " WHERE tenant_id = ? AND proceso_id = ? AND id = ?",
          llave,
          tenantId,
          procesoId,
          movimiento.id,
        ),
      );

      return cuenta(tenantId, procesoId);
    },

    async quitar(tenantId, procesoId, movimiento) {
      await base.mutar(
        {
          entidad: "proceso",
          entidadId: procesoId,
          accion: ACCION_AL_QUITAR[movimiento.tipo],
          detalle: recorte(movimiento.concepto),
        },
        sentencia(
          "DELETE FROM movimiento_gasto" +
            " WHERE tenant_id = ? AND proceso_id = ? AND id = ?",
          tenantId,
          procesoId,
          movimiento.id,
        ),
      );

      return cuenta(tenantId, procesoId);
    },
  };
}
