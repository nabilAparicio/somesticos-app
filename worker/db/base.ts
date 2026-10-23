/**
 * **El único lugar desde el que este sistema escribe en la base.**
 *
 * T-10 pide que la bitácora se escriba desde un solo lugar, y que agregar
 * una mutación nueva sin su entrada sea difícil o imposible. «Ponerlo en un
 * helper y usarlo con disciplina» no cumple eso: alguna ruta se va a
 * olvidar, y el agujero no se nota hasta que alguien lo busca.
 *
 * La forma que el proyecto ya conoce de convertir un olvido en un error de
 * compilación es el `Record<MotivoDeFalla, string>` de `src/mensajes.ts`:
 * agregar un motivo rompe el `typecheck` hasta que alguien escriba su texto.
 * El equivalente acá no es un `Record`, es una **capacidad retirada**:
 *
 *  - Ningún adaptador de dominio recibe un `D1Database`. Reciben
 *    `BaseDeDatos`.
 *  - `BaseDeDatos.lectura` es un `prepare` **sin `run`, sin `batch` y sin
 *    `exec`**. Con él se puede consultar y nada más.
 *  - La única escritura es `mutar(evento, ...sentencias)`, y su primer
 *    parámetro es el hecho que va a la bitácora.
 *
 * Así, una mutación nueva no es que «deba» registrarse: es que **no hay
 * ninguna otra forma de escribirla**. El compilador lo sostiene, y
 * `test/escritura-registrada.spec.ts` lo vigila con cinco `@ts-expect-error`
 * que fallan el `typecheck` el día que alguien ensanche una firma.
 *
 * Lo que esto no sostiene, dicho en vez de supuesto: alguien puede cambiar
 * la firma de un adaptador para que vuelva a aceptar `D1Database` y
 * recablear `worker/index.ts`. Eso rompe esas cinco directivas a la vez, así
 * que llega como una falla de `typecheck` y no como un agujero silencioso.
 * El compilador impide olvidarse; no impide revertir a propósito.
 *
 * ## Atomicidad
 *
 * El hecho y su efecto viajan en el mismo `batch`, que en D1 es una sola
 * transacción. Una bitácora que registra lo que no pasó es tan inútil como
 * una que calla lo que pasó, y las dos mitades se rompen por separado si se
 * escriben por separado.
 *
 * ## El autor y el tenant no viajan en la llamada
 *
 * Se fijan al construir la base, una vez por petición y después de la puerta
 * de Access. Un adaptador no puede firmar a nombre de otro ni registrar en
 * otro bufete, porque no tiene de dónde sacar esos valores (I-6 y I-8,
 * `docs/diseno.md` §5).
 */

import type { Evento } from "../bitacora/vocabulario";
import { nuevoId } from "./ids";
import { ahoraIso } from "./momentos";

/** Lo que una sentencia puede llevar atado. Montos en centavos, nunca float. */
export type Vinculable = string | number | null;

/**
 * Una sentencia de escritura, como datos.
 *
 * Es `{ sql, parametros }` y no una `D1PreparedStatement` por una razón
 * concreta: preparar una sentencia exige un `D1Database`, y si los
 * adaptadores tuvieran uno, tendrían también su `run`. Describir la
 * escritura y dejar que `mutar` la prepare es lo que cierra ese camino.
 */
export interface Sentencia {
  readonly sql: string;
  readonly parametros: readonly Vinculable[];
}

export function sentencia(
  sql: string,
  ...parametros: Vinculable[]
): Sentencia {
  return { sql, parametros };
}

/**
 * Una sentencia preparada **de lectura**.
 *
 * Es deliberadamente más angosta que `D1PreparedStatement`: no tiene `run`
 * ni `raw`. Un `D1Database` sigue siendo asignable a `LecturaD1`, así que
 * construir la base no cuesta una envoltura, pero desde adentro de un
 * adaptador el camino de escritura sencillamente no existe en el tipo.
 */
export interface SentenciaDeLectura {
  bind(...valores: Vinculable[]): SentenciaDeLectura;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
}

export interface LecturaD1 {
  prepare(sql: string): SentenciaDeLectura;
}

export interface BaseDeDatos {
  /** Consultar. Y nada más que consultar. */
  readonly lectura: LecturaD1;

  /**
   * Escribir, dejando dicho qué pasó.
   *
   * Devuelve los resultados **de las sentencias del llamante**, en su orden,
   * sin el de la entrada de bitácora: quien llama cuenta sus propios
   * cambios y no tiene por qué saber que detrás hay una fila más.
   *
   * Sin sentencias es una llamada válida y buscada: hay hechos compuestos
   * —guardar el plan de un proceso como plantilla— que escriben por los
   * puertos de otro módulo y no tienen SQL propio, pero siguen siendo un
   * hecho. Lo que no existe es el camino inverso: escribir sin evento.
   */
  mutar(evento: Evento, ...sentencias: Sentencia[]): Promise<D1Result[]>;
}

const REGISTRO =
  "INSERT INTO bitacora (id, tenant_id, entidad, entidad_id, accion," +
  " usuario_id, ocurrido_en, detalle) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";

/**
 * La base para una petición concreta: su tenant y la persona que entró.
 *
 * Se construye en `worker/index.ts`, **después** de la puerta de Access.
 * Antes de ella no hay a nombre de quién escribir nada, y el tipo lo dice:
 * `usuarioId` no es opcional.
 */
export function baseSobreD1(
  db: D1Database,
  tenantId: string,
  usuarioId: string,
): BaseDeDatos {
  return {
    lectura: db,

    async mutar(evento, ...sentencias) {
      const efectos = sentencias.map((cada) =>
        db.prepare(cada.sql).bind(...cada.parametros),
      );

      const registro = db
        .prepare(REGISTRO)
        .bind(
          nuevoId(),
          tenantId,
          evento.entidad,
          evento.entidadId,
          evento.accion,
          usuarioId,
          ahoraIso(),
          evento.detalle ?? null,
        );

      // El registro va último para que se lea como lo que es: la
      // consecuencia del efecto. Al ir todo en el mismo `batch`, el orden no
      // cambia la atomicidad.
      const resultados = await db.batch([...efectos, registro]);

      return resultados.slice(0, efectos.length);
    },
  };
}

/**
 * Recorta un texto para que quepa en un `detalle`.
 *
 * Un pendiente no tiene nombre: lo único que lo identifica es su texto, y
 * sin nada la entrada diría «cerró un pendiente» sin decir cuál. Se recorta
 * en vez de copiarse entero porque `detalle` es una pista, no una segunda
 * copia del dato: el pendiente sigue estando en su lista.
 */
export function recorte(texto: string, tope = 80): string {
  const limpio = texto.trim();
  return limpio.length <= tope ? limpio : `${limpio.slice(0, tope - 1)}…`;
}
