/**
 * El adaptador de D1 para el arancel de honorarios.
 *
 * `ServicioDeArancel` es el puerto: lo que el ruteo conoce. La función de
 * abajo es la única implementación, y la única que sabe que existe SQL. Que
 * sea una interfaz y no una llamada directa es lo que deja probar que **una
 * petición sin identidad no llega hasta acá**, sustituyéndola por un espía.
 *
 * I-8 (`docs/diseno.md` §5) vive en cada consulta de este archivo: no hay una
 * sola que no filtre por `tenant_id`, ni siquiera la que busca por llave
 * primaria. Un UUID ajeno sigue siendo un UUID. Y acá importa más que en
 * otras tablas, porque el documento sembrado es el mismo para los dos
 * bufetes: lo que es propio de cada uno es exactamente la columna `monto`,
 * que es el motivo de la tabla.
 *
 * ## Qué se escribe, y qué no
 *
 * **Una sola columna**: `monto`. El `UPDATE` de más abajo la nombra sola, y
 * eso no es prolijidad sino la tercera de tres guardas que dicen lo mismo en
 * tres lugares distintos, cada una tapando lo que la otra no puede:
 *
 *  1. `revisarMonto` en `dominio.ts` rechaza el cuerpo que nombra una cita, y
 *     es la que deja **contestar** con un 409 en vez de caerse.
 *  2. El `UPDATE` de acá no tiene por dónde escribir otra cosa.
 *  3. `arancel_renglon_citado_no_se_edita` en la base aborta cualquier otra
 *     escritura, venga de esta ruta, de la siembra o de un `wrangler d1
 *     execute` escrito a mano a las once de la noche.
 *
 * Las tres son necesarias y ninguna es redundante: quitar la 1 convierte la
 * negativa en un 500, quitar la 2 deja la cita sostenida por un disparador
 * que esta capa estaría tratando de violar en cada escritura, y quitar la 3
 * deja la regla viviendo solo en el código — que es lo que §5 dice que el
 * primer script de importación se salta.
 *
 * ## Por qué no hay `crear`, ni `borrar`, ni `sembrar`
 *
 * Los renglones no nacen por la API: los siembra
 * `scripts/arancel/sembrar.mjs` desde `scripts/arancel/arancel.json`, que es
 * la extracción reproducible del PDF oficial. Una ruta de alta sería la forma
 * de meter a mano un renglón que el acuerdo no dice, y entonces
 * `monto_oficial` dejaría de ser una cita de nada.
 *
 * Y no se borran: se desactivan (`arancel_renglon_no_se_borra`). Hoy ninguna
 * ruta escribe `activo`, y se dice en vez de suponerse — T-2 abre la lectura
 * y la edición del precio, nada más.
 *
 * ## El registro de bitácora (T-10)
 *
 * Viaja con la escritura, no al lado. Este archivo no recibe un `D1Database`
 * sino una `BaseDeDatos`, que solo sabe leer y `mutar`, y `mutar` **exige el
 * evento como primer parámetro**: una mutación nueva sin su entrada no
 * compila (ver `worker/db/base.ts`). Es por esto que
 * `migrations/0012_arancel_de_honorarios.sql` reconstruye `bitacora` por
 * sexta vez: sin `arancel_renglon` en el vocabulario, el precio del bufete no
 * tenía forma de escribirse.
 *
 * El `detalle` lleva el **concepto** del renglón y no el monto nuevo, por la
 * granularidad que T-10 fijó: la bitácora guarda hechos, no diffs. «Itzel
 * editó «Visitantes Temporales (por persona)»» contesta quién tocó qué; el
 * valor anterior no se guarda y eso está decidido.
 */

import type { NotaDelArancel, RenglonDelArancel } from "../contract";
import type { BaseDeDatos } from "../db/base";
import { recorte, sentencia } from "../db/base";

/**
 * Lo que la tabla entera trae en una lectura.
 *
 * Las dos listas viajan **separadas y sin agrupar**: agruparlas es una
 * decisión de presentación —y pura, y por eso probada aparte en
 * `dominio.ts`—, mientras que lo que esta capa sabe es qué filas hay y en qué
 * orden las guardó el acuerdo.
 */
export interface ArancelCompleto {
  renglones: RenglonDelArancel[];
  notas: NotaDelArancel[];
}

export type ResultadoDeMonto =
  | { estado: "guardado"; renglon: RenglonDelArancel }
  /** El renglón es uno de los 74 rubros: un encabezado no lleva precio. */
  | { estado: "rubro" }
  | { estado: "no_encontrado" };

export interface ServicioDeArancel {
  /** La tabla entera de este bufete, en el orden del documento. */
  leer(tenantId: string): Promise<ArancelCompleto>;

  /**
   * Un renglón, o `null` si no es de este bufete.
   *
   * Lo usa la bitácora del renglón para comprobar la existencia por el mismo
   * puerto que la pantalla, y no por una segunda copia de la consulta.
   */
  obtener(tenantId: string, id: string): Promise<RenglonDelArancel | null>;

  /** El precio del bufete. Lo único editable de un renglón. */
  fijarMonto(
    tenantId: string,
    id: string,
    monto: number | null,
  ): Promise<ResultadoDeMonto>;
}

interface FilaDeRenglon {
  id: string;
  orden: number;
  categoria: string;
  numeral: string;
  concepto: string;
  clase: string;
  monto_oficial: number | null;
  regla_oficial: string | null;
  monto: number | null;
  activo: number;
}

interface FilaDeNota {
  id: string;
  orden: number;
  categoria: string;
  texto: string;
}

const SELECCION_DE_RENGLON =
  "SELECT id, orden, categoria, numeral, concepto, clase, monto_oficial," +
  " regla_oficial, monto, activo" +
  " FROM arancel_renglon WHERE tenant_id = ?";

/**
 * `clase` se recorta de `string` a la unión del contrato **sin validar**, y
 * vale decir por qué no es un `as` perezoso: la columna tiene
 * `CHECK (clase IN ('monto', 'regla', 'rubro'))` desde la migración, así que
 * una fila con otro valor no existe y no puede existir. Validar acá sería una
 * segunda guarda para el mismo hecho, con la propiedad de que neutralizar el
 * `CHECK` no rompería ninguna prueba.
 */
function aRenglon(fila: FilaDeRenglon): RenglonDelArancel {
  return {
    id: fila.id,
    orden: fila.orden,
    categoria: fila.categoria,
    numeral: fila.numeral,
    concepto: fila.concepto,
    clase: fila.clase as RenglonDelArancel["clase"],
    montoOficial: fila.monto_oficial,
    reglaOficial: fila.regla_oficial,
    monto: fila.monto,
    activo: fila.activo === 1,
  };
}

function aNota(fila: FilaDeNota): NotaDelArancel {
  return {
    id: fila.id,
    orden: fila.orden,
    categoria: fila.categoria,
    texto: fila.texto,
  };
}

export function arancelSobreD1(base: BaseDeDatos): ServicioDeArancel {
  const db = base.lectura;

  async function obtener(
    tenantId: string,
    id: string,
  ): Promise<RenglonDelArancel | null> {
    const fila = await db
      .prepare(`${SELECCION_DE_RENGLON} AND id = ?`)
      .bind(tenantId, id)
      .first<FilaDeRenglon>();

    return fila === null ? null : aRenglon(fila);
  }

  return {
    obtener,

    async leer(tenantId) {
      // `ORDER BY orden` y no por categoría ni por numeral: el orden del
      // documento es el que agrupa bien y el único que no se puede derivar de
      // otra cosa. El numeral se repite —44 renglones en 15 grupos—, y ordenar
      // por categoría alfabéticamente desordenaría el acuerdo.
      const [renglones, notas] = await Promise.all([
        db
          .prepare(`${SELECCION_DE_RENGLON} ORDER BY orden`)
          .bind(tenantId)
          .all<FilaDeRenglon>(),
        db
          .prepare(
            "SELECT id, orden, categoria, texto FROM arancel_nota" +
              " WHERE tenant_id = ? ORDER BY orden",
          )
          .bind(tenantId)
          .all<FilaDeNota>(),
      ]);

      return {
        renglones: renglones.results.map(aRenglon),
        notas: notas.results.map(aNota),
      };
    },

    async fijarMonto(tenantId, id, monto) {
      // La existencia se comprueba **dentro del tenant**. Una fila de otro
      // bufete es, desde acá, una fila que no existe.
      const previo = await obtener(tenantId, id);
      if (previo === null) return { estado: "no_encontrado" };

      // Un encabezado no lleva precio, y la pregunta se contesta contra la
      // fila guardada y no contra el cuerpo: la `clase` es parte de la cita,
      // así que quien edita no la manda y no podría mandarla.
      //
      // **El nulo se deja pasar igual**, y es deliberado: borrar un precio
      // que no hay no es un conflicto, es un no-op, y contestar 409 obligaría
      // a la pantalla a tratar distinto un «limpiar» según sobre qué fila cae.
      // La base tampoco se queja —`un_rubro_no_lleva_precio` admite el nulo—,
      // así que las dos guardas dicen lo mismo.
      if (previo.clase === "rubro" && monto !== null) {
        return { estado: "rubro" };
      }

      await base.mutar(
        {
          entidad: "arancel_renglon",
          entidadId: id,
          accion: "editado",
          // El concepto y no el monto: la bitácora guarda hechos, no diffs
          // (T-10). Y recortado, porque hay conceptos del acuerdo de más de
          // setecientos caracteres —son tramos de cuantía escritos en prosa—
          // y `detalle` es una pista, no una segunda copia del dato.
          detalle: recorte(previo.concepto),
        },
        // **Una sola columna en el `SET`.** No hay por dónde escribir otra
        // cosa, y el disparador de la base está debajo por si algún día la
        // hubiera.
        sentencia(
          "UPDATE arancel_renglon SET monto = ? WHERE tenant_id = ? AND id = ?",
          monto,
          tenantId,
          id,
        ),
      );

      const renglon = await obtener(tenantId, id);
      if (renglon === null) {
        // Inalcanzable salvo que el `UPDATE` haya hecho desaparecer la fila:
        // si pasa, es un defecto y no un 404 de negocio.
        throw new Error(`el renglón de arancel ${id} no se pudo releer`);
      }

      return { estado: "guardado", renglon };
    },
  };
}
