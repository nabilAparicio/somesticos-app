/**
 * El adaptador de D1 para las plantillas de módulo.
 *
 * `ServicioDePlantillas` es el puerto: lo que el ruteo conoce. La función de
 * abajo es la única implementación, y la única que sabe que existe SQL. Que
 * sea una interfaz y no una llamada directa es lo que deja probar que **una
 * petición sin identidad no llega hasta acá**, sustituyéndola por un espía.
 *
 * I-8 (`docs/diseno.md` §5) vive en cada consulta de este archivo: no hay una
 * sola que no filtre por `tenant_id`, ni siquiera la que busca por llave
 * primaria. Un UUID ajeno sigue siendo un UUID. Y acá importa más que en otras
 * tablas, por lo mismo que en el arancel: los seis presets son los mismos para
 * los dos bufetes, y lo que es propio de cada uno son exactamente `rotulo` y
 * `descripcion`, que son el motivo de la tabla.
 *
 * ## Qué se escribe, y qué no
 *
 * **Tres columnas**: `rotulo`, `descripcion` y `activo`. El `UPDATE` de más
 * abajo las nombra solas, y eso no es prolijidad sino la tercera de tres
 * guardas que dicen lo mismo en tres lugares distintos, cada una tapando lo
 * que la otra no puede:
 *
 *  1. `revisarPlantilla` en `dominio.ts` rechaza el cuerpo que nombra la
 *     `clave` o el preset, y es la que deja **contestar** con un 409 en vez de
 *     caerse.
 *  2. El `UPDATE` de acá no tiene por dónde escribir otra cosa.
 *  3. `modulo_plantilla_clave_inmutable` y
 *     `modulo_plantilla_preset_no_se_edita` en la base abortan cualquier otra
 *     escritura, venga de esta ruta, de una siembra o de un `wrangler d1
 *     execute` escrito a mano a las once de la noche.
 *
 * Las tres son necesarias y ninguna es redundante: quitar la 1 convierte la
 * negativa en un 500, quitar la 2 deja el preset sostenido por un disparador
 * que esta capa estaría tratando de violar en cada escritura, y quitar la 3
 * deja la regla viviendo solo en el código — que es lo que §5 dice que el
 * primer script de importación se salta, y esta tabla **va a** recibir
 * scripts: la siembra de `0016` es uno.
 *
 * `orden` queda afuera del `SET` y no es un olvido: reordenar está fuera del
 * alcance de esta tarea. `0016` deliberadamente **no** le puso disparador —y
 * tampoco índice único, para que un `SET orden = orden + 1` sea posible— así
 * que el día que exista la pantalla que reordena, la columna ya está lista y
 * lo único que falta es la sentencia. Lo que no se hizo es abrir la escritura
 * sin la operación que la usa.
 *
 * ## Hay `crear` desde T-7, y no hay `borrar` nunca
 *
 * **`crear` llegó cuando `0017` quitó el techo.** Mientras
 * `cotizacion_modulo.tipo` estuvo cerrado por el `CHECK` de `0004`, una clave
 * nueva era una plantilla **inservible** —el editor la ofrecía y la base
 * rechazaba el primer módulo que la usara—, y por eso la tajada 1 no la
 * construyó. Con la columna convertida en `plantilla_id`, una referencia a
 * esta tabla, una plantilla nueva ya se puede usar, y lo único que faltaba era
 * acuñar la clave: eso vive en `acunarClave` de `dominio.ts`, que es puro y
 * tiene sus bordes probados aparte.
 *
 * Con la ruta entró el verbo: `creado` está ahora en el vocabulario de
 * bitácora de esta entidad, y **no hizo falta migración** —ya estaba en el
 * `CHECK` de `accion` desde `0012:132`, y la entidad ya estaba en el `CHECK` de
 * `entidad` desde `0016`—. Que la ausencia del verbo significara «la operación
 * no es de esta unidad» es justamente lo que hace que agregarlo cueste una
 * línea.
 *
 * **`borrar` nunca**, y acá el argumento es más fuerte que en el arancel: una
 * plantilla borrada deja sin rótulo los módulos de las cotizaciones vivas.
 * Hasta T-4 el daño era un desplegable que no podía mostrar lo que la fila
 * decía, porque la columna era texto; **desde `0017` es una llave foránea
 * rota**, o sea que el borrado ya no rebota sólo en el disparador de esta
 * tabla. Las dos guardas se dejan puestas y no es redundancia: la llave
 * foránea es la que un `PRAGMA` apaga. La salida sigue siendo `activo = 0`, y
 * `modulo_plantilla_no_se_borra` aborta todo `DELETE` por si algún día
 * apareciera el camino.
 *
 * ## El registro de bitácora
 *
 * Viaja con la escritura, no al lado. Este archivo no recibe un `D1Database`
 * sino una `BaseDeDatos`, que solo sabe leer y `mutar`, y `mutar` **exige el
 * evento como primer parámetro**: una mutación nueva sin su entrada no compila
 * (ver `worker/db/base.ts`). Es por esto que `0016` reconstruye `bitacora` por
 * séptima vez: sin `modulo_plantilla` en el vocabulario, el rótulo del bufete
 * no tenía forma de escribirse.
 *
 * El `detalle` lleva el **rótulo vigente nuevo** y no el texto que cambió, por
 * la granularidad que T-10 fijó: la bitácora guarda hechos, no diffs. «Itzel
 * editó «Alcance»» contesta quién tocó qué; el valor anterior no se guarda y
 * eso está decidido. Es el rótulo *nuevo* y no el viejo porque es el nombre con
 * el que la plantilla se va a llamar de ahí en adelante, que es el que alguien
 * va a buscar en la historia.
 */

import type { PlantillaDeModulo } from "../contract";
import { accionDeEdicion } from "../bitacora/vocabulario";
import type { BaseDeDatos } from "../db/base";
import { recorte, sentencia } from "../db/base";
import { nuevoId } from "../db/ids";
import {
  camposSinPreset,
  valorVigente,
  type DatosDeAlta,
  type DatosDePlantilla,
} from "./dominio";

export type ResultadoDePlantilla =
  | { estado: "guardado"; plantilla: PlantillaDeModulo }
  /**
   * El vaciado dejaría la fila sin valor vigente, porque no hay preset
   * debajo. `campos` son los nombres del cable, en orden alfabético.
   */
  | { estado: "sin_preset"; campos: string[] }
  | { estado: "no_encontrado" };

/**
 * Lo que puede salir de un alta (T-7).
 *
 * `clave_tomada` es la única negativa, y se cuenta **antes de escribir**: es
 * la disciplina que `nombreTomado` de `worker/catalogos/repositorio.ts` ya
 * aplica al nombre duplicado y que este proyecto aplica también al borrado
 * bloqueado. No se atrapa el error de la base para disfrazarlo.
 *
 * No lleva la clave ni la fila que choca, y es deliberado: la falla del cable
 * es `{ campo, motivo }` y no hay dónde ponerla, y la pantalla ya muestra la
 * clave de cada módulo debajo de su rótulo — incluidas las dadas de baja, que
 * son las que chocan sin que nadie las esté mirando. La frase del motivo manda
 * a mirar esa lista, que es donde está la respuesta.
 */
export type ResultadoDeAlta =
  | { estado: "creado"; plantilla: PlantillaDeModulo }
  | { estado: "clave_tomada" };

export interface ServicioDePlantillas {
  /**
   * El catálogo entero de este bufete, en el orden sugerido.
   *
   * **Incluye las dadas de baja**, y la decisión es de esta tajada: el alcance
   * autorizado dice «la baja y la reactivación» con todas las letras, y una
   * fila que la lectura esconde es una fila que no se puede reactivar. Es
   * además lo que ya hacen los tres catálogos de T-6 —ahí lo dado de baja se
   * muestra marcado, no escondido— y por el mismo motivo: lo que ya lo usa
   * tiene que poder seguir nombrándolo.
   *
   * Lo que **sí** filtra por `activo` es el editor de la cotización, que es
   * otra pregunta —«¿qué puedo elegir?»— y es de T-3. La distinción entre
   * *válido* y *seleccionable* la fijó T-5 y no se repite acá.
   */
  listar(tenantId: string): Promise<PlantillaDeModulo[]>;

  /**
   * Una plantilla, o `null` si no es de este bufete.
   *
   * Lo usan la ruta de edición y **la bitácora de la plantilla**, que
   * comprueba la existencia por este mismo puerto y no por una segunda copia
   * de la consulta. Esa segunda llamada es la que cierra el 404 que T-1 dejó
   * debiendo en `worker/bitacora/rutas.ts`.
   */
  obtener(tenantId: string, id: string): Promise<PlantillaDeModulo | null>;

  /**
   * Una plantilla propia del bufete, con su clave ya acuñada (T-7).
   *
   * Nace **vigente y última**: `activo = 1` porque una plantilla que hay que
   * reactivar para usarla es un alta a medias, y `orden = MAX(orden) + 1`
   * porque es la decisión menos sorprendente —el módulo nuevo aparece donde la
   * persona lo acaba de agregar— y la única que no exige elegir una posición
   * en un formulario de dos campos.
   *
   * Y nace **sin preset**: `rotulo_oficial` y `descripcion_oficial` quedan en
   * NULL, que es lo que hace que esta fila sea del bufete y de nadie más. Las
   * dos columnas son nullable desde `0016` justamente para esto, y la
   * consecuencia visible es que en esta fila **vaciar un campo no vuelve a
   * nada**: no hay piso debajo, así que `camposSinPreset` la rechaza con el
   * 409 que T-2 construyó sin poder ejercerlo todavía.
   */
  crear(tenantId: string, datos: DatosDeAlta): Promise<ResultadoDeAlta>;

  /** El rótulo, la descripción y la vigencia. Lo único editable. */
  guardar(
    tenantId: string,
    id: string,
    datos: DatosDePlantilla,
  ): Promise<ResultadoDePlantilla>;
}

interface FilaDePlantilla {
  id: string;
  clave: string;
  orden: number;
  rotulo_oficial: string | null;
  descripcion_oficial: string | null;
  rotulo: string | null;
  descripcion: string | null;
  activo: number;
}

const SELECCION =
  "SELECT id, clave, orden, rotulo_oficial, descripcion_oficial, rotulo," +
  " descripcion, activo" +
  " FROM modulo_plantilla WHERE tenant_id = ?";

/**
 * La fila, con el valor vigente resuelto.
 *
 * El `COALESCE` se hace acá en TypeScript y no en el `SELECT`, aunque la base
 * sepa hacerlo: así **la misma función** —`valorVigente`— resuelve la lectura
 * y el `detalle` de bitácora, que necesita el vigente nuevo antes de releer la
 * fila. Con el `COALESCE` en SQL habría dos implementaciones de una regla que
 * tiene que ser una, y la de TypeScript sería la que nadie mira.
 *
 * El `??` en los dos `Vigente` no es una tercera rama: los dos `CHECK` de
 * `0016` garantizan que `valorVigente` no devuelve nulo sobre una fila
 * guardada, así que esa cadena vacía es inalcanzable. Está escrita porque el
 * tipo del contrato promete texto y un `as string` taparía el día que alguien
 * ablandara un `CHECK` — así, lo que se vería es un rótulo vacío en la
 * pantalla y no un `undefined` navegando por el cable.
 */
function aPlantilla(fila: FilaDePlantilla): PlantillaDeModulo {
  return {
    id: fila.id,
    clave: fila.clave,
    orden: fila.orden,
    rotuloOficial: fila.rotulo_oficial,
    descripcionOficial: fila.descripcion_oficial,
    rotulo: fila.rotulo,
    descripcion: fila.descripcion,
    rotuloVigente: valorVigente(fila.rotulo, fila.rotulo_oficial) ?? "",
    descripcionVigente:
      valorVigente(fila.descripcion, fila.descripcion_oficial) ?? "",
    activo: fila.activo === 1,
  };
}

/**
 * Las plantillas indexadas por su clave, con el rótulo vigente ya resuelto.
 *
 * Es lo que necesita quien tiene una `clave` en la mano y no una fila: las
 * tres escrituras de módulo de `worker/cotizaciones/repositorio.ts`, que
 * arman el `detalle` de la bitácora, y `emitir`, que le pasa los rótulos a
 * `congelar`. Toma la lista del puerto —**la misma** `listar` que sirve el
 * `GET`, con su `COALESCE` ya hecho por `valorVigente`— en vez de una consulta
 * propia, porque una consulta propia sería la segunda implementación de la
 * resolución del rótulo y la que nadie mira.
 *
 * **Incluye las dadas de baja**, y eso es deliberado: un módulo escrito con
 * una plantilla que después se retiró tiene que seguir mostrando su rótulo.
 * Esconderlo acá convertiría una baja en una pérdida de dato en las
 * cotizaciones vivas. Qué se puede **elegir** es la otra pregunta, y la
 * contesta la pantalla filtrando por `activo`.
 */
export function rotulosPorClave(
  plantillas: readonly PlantillaDeModulo[],
): ReadonlyMap<string, string> {
  return new Map(plantillas.map((una) => [una.clave, una.rotuloVigente]));
}

export function plantillasSobreD1(base: BaseDeDatos): ServicioDePlantillas {
  const db = base.lectura;

  async function obtener(
    tenantId: string,
    id: string,
  ): Promise<PlantillaDeModulo | null> {
    const fila = await db
      .prepare(`${SELECCION} AND id = ?`)
      .bind(tenantId, id)
      .first<FilaDePlantilla>();

    return fila === null ? null : aPlantilla(fila);
  }

  return {
    obtener,

    async crear(tenantId, datos) {
      /*
       * **La clave tomada se cuenta antes de escribir.**
       *
       * El único `modulo_plantilla_clave_unica` está debajo y es el que manda,
       * pero lo que diría es `UNIQUE constraint failed:
       * modulo_plantilla.tenant_id, modulo_plantilla.clave` envuelto en un
       * 500 — que no es una negativa sino una caída. Es la misma disciplina
       * que `nombreTomado` aplica en los catálogos: se cuenta, no se atrapa.
       *
       * **Y el índice no mira `activo`**, así que esta consulta tampoco: una
       * plantilla dada de baja sigue teniendo su clave tomada, y tiene que
       * seguir teniéndola —los módulos de las cotizaciones vivas la
       * referencian por llave foránea desde `0017`—. Filtrar por `activo` acá
       * sería dejar pasar el alta y que el índice la mate abajo, que es
       * exactamente el 500 que esta consulta existe para evitar.
       *
       * Queda una carrera: dos altas simultáneas de la misma clave pasan las
       * dos por acá y el índice mata la segunda. Se deja dicho en vez de
       * resuelto con un `INSERT … ON CONFLICT`, por el mismo criterio con que
       * los catálogos la dejan: el único es el piso que de verdad sostiene la
       * regla, y esto es la mitad amable que existe para poder contestar.
       */
      const tomada = await db
        .prepare(
          "SELECT clave FROM modulo_plantilla" +
            " WHERE tenant_id = ? AND clave = ?",
        )
        .bind(tenantId, datos.clave)
        .first<{ clave: string }>();

      if (tomada !== null) return { estado: "clave_tomada" };

      // `COALESCE(MAX(...), 0) + 1` y no `COUNT(...) + 1`: con una fila
      // reordenada a mano, contar daría una posición ya ocupada. El empate no
      // rompe nada —`0016` no le puso único a `orden` y la lectura lo resuelve
      // por `clave`— pero una plantilla nueva en el medio de la lista es una
      // sorpresa que nadie pidió.
      const ultima = await db
        .prepare(
          "SELECT COALESCE(MAX(orden), 0) + 1 AS siguiente" +
            " FROM modulo_plantilla WHERE tenant_id = ?",
        )
        .bind(tenantId)
        .first<{ siguiente: number }>();

      const id = nuevoId();

      await base.mutar(
        {
          entidad: "modulo_plantilla",
          entidadId: id,
          // El verbo que T-7 estrena. **Sin migración**: `creado` ya estaba
          // en el `CHECK` de `accion` desde `0012:132`, y lo que faltaba era
          // la ruta que lo emitiera. El `CHECK` de `entidad` ya tenía
          // `modulo_plantilla` desde `0016`.
          accion: "creado",
          // El rótulo, que acá **es** el vigente: la fila nace sin preset, así
          // que no hay `COALESCE` que hacer. Recortado por lo mismo que en la
          // edición: `detalle` es una pista y el rótulo lo escribe una persona.
          detalle: recorte(datos.rotulo),
        },
        sentencia(
          "INSERT INTO modulo_plantilla (id, tenant_id, clave," +
            " rotulo_oficial, descripcion_oficial, rotulo, descripcion," +
            " orden, activo)" +
            " VALUES (?, ?, ?, NULL, NULL, ?, ?, ?, 1)",
          id,
          tenantId,
          datos.clave,
          datos.rotulo,
          datos.descripcion,
          ultima?.siguiente ?? 1,
        ),
      );

      const plantilla = await obtener(tenantId, id);
      if (plantilla === null) {
        // Inalcanzable salvo que el `INSERT` no haya escrito: si pasa, es un
        // defecto y no una negativa de negocio.
        throw new Error("la plantilla de módulo recién creada no se pudo releer");
      }

      return { estado: "creado", plantilla };
    },

    async listar(tenantId) {
      // `ORDER BY orden, clave`, y el segundo criterio no es decorativo:
      // `0016` **no** le puso índice único a `orden` —a propósito, para que
      // reordenar incrementando sea posible en SQLite— así que dos filas
      // pueden empatar. Su encabezado lo dice: «dos empates se resuelven de
      // forma estable en la lectura». Ésta es esa resolución, y `clave` sirve
      // porque es única dentro del bufete por índice.
      const filas = await db
        .prepare(`${SELECCION} ORDER BY orden, clave`)
        .bind(tenantId)
        .all<FilaDePlantilla>();

      return filas.results.map(aPlantilla);
    },

    async guardar(tenantId, id, datos) {
      // La existencia se comprueba **dentro del tenant**. Una fila de otro
      // bufete es, desde acá, una fila que no existe.
      const previa = await obtener(tenantId, id);
      if (previa === null) return { estado: "no_encontrado" };

      // Vaciar un campo que no tiene preset debajo dejaría la fila sin valor
      // vigente, y los dos `CHECK` de `0016` la rechazarían: eso saldría como
      // un 500 de SQLite crudo, que no es una negativa sino una caída. Se
      // cuenta antes de escribir, que es la disciplina que este proyecto ya
      // aplica al borrado bloqueado y al nombre duplicado: no se atrapa el
      // error de la base para disfrazarlo.
      const sinPreset = camposSinPreset(previa, datos);
      if (sinPreset.length > 0) {
        return { estado: "sin_preset", campos: sinPreset };
      }

      await base.mutar(
        {
          entidad: "modulo_plantilla",
          entidadId: id,
          // Dar de baja y reactivar llegan por este mismo `PUT` —el cuerpo
          // manda el juego completo— y son hechos distintos de editar el
          // rótulo: ver `accionDeEdicion`. Es la misma forma que usan los
          // tres catálogos de T-6, y la que hace que «¿por qué desapareció
          // este módulo del desplegable?» tenga respuesta en la bitácora.
          accion: accionDeEdicion(previa.activo, datos.activo),
          // El rótulo vigente **nuevo**, recortado. Nuevo porque es el nombre
          // con el que la plantilla se va a llamar de ahí en adelante; y
          // recortado porque `detalle` es una pista, no una segunda copia del
          // dato — y un rótulo lo escribe una persona, que puede escribir lo
          // que quiera de largo.
          detalle: recorte(
            valorVigente(datos.rotulo, previa.rotuloOficial) ?? previa.clave,
          ),
        },
        // **Tres columnas en el `SET`.** No hay por dónde escribir la clave ni
        // el preset, y los disparadores de la base están debajo por si algún
        // día las hubiera.
        sentencia(
          "UPDATE modulo_plantilla SET rotulo = ?, descripcion = ?, activo = ?" +
            " WHERE tenant_id = ? AND id = ?",
          datos.rotulo,
          datos.descripcion,
          datos.activo ? 1 : 0,
          tenantId,
          id,
        ),
      );

      const plantilla = await obtener(tenantId, id);
      if (plantilla === null) {
        // Inalcanzable salvo que el `UPDATE` haya hecho desaparecer la fila:
        // si pasa, es un defecto y no un 404 de negocio. Y acá es más fuerte
        // que en el arancel, porque `modulo_plantilla_no_se_borra` aborta todo
        // `DELETE`: una fila que desaparece de esta tabla es un disparador
        // caído.
        throw new Error(`la plantilla de módulo ${id} no se pudo releer`);
      }

      return { estado: "guardado", plantilla };
    },
  };
}
