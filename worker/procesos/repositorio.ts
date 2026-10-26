/**
 * El adaptador de D1 para los procesos y su plan de trabajo.
 *
 * `ServicioDeProcesos` es el puerto: lo que el ruteo conoce. La función de
 * abajo es la única implementación, y la única que sabe que existe SQL. Que
 * sea una interfaz y no una llamada directa es lo que deja probar que **una
 * petición sin identidad no llega hasta acá**, sustituyéndola por un espía.
 *
 * I-8 (`docs/diseno.md` §5) vive en cada consulta de este archivo: no hay una
 * sola que no filtre por `tenant_id`, ni siquiera las que buscan por llave
 * primaria. Un UUID ajeno sigue siendo un UUID.
 *
 * ## Las reglas que este archivo existe para sostener
 *
 * (Decía «las tres» desde T-7 y ya eran cuatro en T-9. Se las deja
 * numeradas y sin el conteo en el título: un número en la prosa que hay que
 * acordarse de subir con cada tarea es un número que va a mentir.)
 *
 * ### 1. La plantilla siembra, el proceso manda
 *
 * `crear` **copia** las filas de `etapa_plantilla` a `proceso_etapa`. No
 * guarda ninguna referencia a la plantilla: ni una columna, ni el id de
 * origen. Desde ese momento el proceso es dueño de su plan y editar la
 * plantilla no lo toca (`docs/diseno.md` §6, «Etapas»).
 *
 * Esa es la propiedad más importante del modelo, y la que hace que un proceso
 * en curso no cambie de plan porque alguien editó un molde.
 *
 * ### 2. Se quita una etapa pendiente; no se quita una alcanzada
 *
 * Las notas se anclan a la etapa donde ocurrieron y son inmutables por
 * disparador (I-6): borrar una etapa cumplida dejaría notas huérfanas o
 * reescribiría la historia, que es justo lo que el modelo existe para
 * impedir.
 *
 * **La guarda es el chequeo explícito de `guardarLoAlcanzado`, no un `catch`
 * del error de la base.** Es la misma disciplina que T-6 dejó asentada para
 * el borrado de catálogos: con un `catch` que tradujera el disparador de
 * `nota` o la llave foránea a una respuesta amable, aflojar la guarda no
 * rompería ninguna prueba y la guarda quedaría sin verificar para siempre.
 * Acá no se atrapa nada: la guarda se ve fallar, y cuando se la afloja mueren
 * sus pruebas.
 *
 * Y la guarda es **más que «no se quita»**: lo cumplido también tiene que
 * quedarse adelante y en su orden. Un plan que promete un paso *antes* de
 * algo que ya pasó no se puede dibujar separado en cumplido y pendiente, que
 * es exactamente lo que la pantalla de detalle tiene que mostrar.
 *
 * ### 3. Una etapa pendiente CON NOTAS tampoco se quita (T-8)
 *
 * Hasta T-7 una etapa pendiente no tenía nada colgando y quitarla era
 * gratis; T-7 dejó escrito que la guarda le tocaba a la tarea que creara la
 * dependencia. Es `guardarLoAnotado`, más abajo: cuenta las notas de cada
 * etapa que se va a borrar y rechaza diciendo cuántas lo impiden. Misma
 * disciplina que la regla 2 — el conteo explícito, nunca un `catch` del
 * error de la llave foránea.
 *
 * ### 4. Tampoco se quita la etapa donde NACIÓ un pendiente (T-9)
 *
 * Es `guardarLoPendiente`, al lado de la anterior. El argumento **no es el
 * mismo** que el de las notas y por eso se escribe aparte: una nota
 * *pertenece* a la etapa donde ocurrió el hecho, mientras que un pendiente
 * solo *nació* en la suya y después cruza el plan entero. Lo que lo sostiene
 * es más simple: `pendiente.proceso_etapa_id` es `NOT NULL` y significa
 * «donde nació». Quitar esa etapa obligaría a dejarlo huérfano —que la base
 * no permite— o a reanclarlo a otra, que es falsificar dónde nació.
 *
 * Y vale **esté el pendiente abierto o cerrado**: lo que impide quitar la
 * etapa no es que el cabo suelto siga vivo, sino que nació ahí. Un pendiente
 * cerrado sigue siendo el registro de que existió en ese paso del plan.
 *
 * Son dos guardas y no una porque cada una tiene su propio argumento y su
 * propio motivo de falla: aflojar una tiene que matar sus pruebas y no las
 * de la otra.
 *
 * ### 5. Un proceso cerrado no acepta avance (T-14)
 *
 * `avanzar` y `reemplazarEtapas` miran `proceso.estado` antes de escribir y
 * se niegan si está cerrado. **Es un chequeo explícito y no un `catch`**, y
 * acá no había siquiera qué atrapar: el esquema no impide marcar una etapa
 * de un proceso cerrado. Esa es justamente la razón de escribirlo — una
 * regla que la base no sostiene es una regla que solo existe mientras estas
 * dos líneas existan, así que tiene que morir ruidosamente al quitarlas.
 *
 * A diferencia de la regla 2, ésta **es reversible**: `reabrir` la levanta,
 * y las dos transiciones dejan su entrada de bitácora. Por eso puede ser
 * tajante sin ser una pared.
 *
 * ### El avance es de una sola dirección
 *
 * No existe «desandar». `avanzar` solo escribe `alcanzada_en` donde era nulo,
 * y el `PUT` del plan **nunca toca esa columna**: el envío lleva id y nombre
 * y nada más. Es la decisión coherente con que una alcanzada no se borre —si
 * se pudiera volver a nulo, quitarla después sería legal y la regla de arriba
 * tendría una puerta trasera de dos pasos.
 *
 * Lo que este archivo NO hace, a propósito: escribir en `bitacora`. Ese
 * registro es T-10, y se va a cablear en un solo lugar.
 */

import type {
  DatosDeEtapa,
  DatosDeProceso,
  DetalleDeProceso,
  EstadoDeProceso,
  EtapaDeProceso,
  FallaDeValidacion,
  OrigenDeProceso,
  Proceso,
} from "../contract";
import type {
  BaseDeDatos,
  LecturaD1,
  Sentencia,
  Vinculable,
} from "../db/base";
import { sentencia } from "../db/base";
import { nuevoId } from "../db/ids";
import { ahoraIso } from "../db/momentos";

/* ==========================================================================
   Cómo nace un proceso, en un solo lugar (T-7 de la tajada 2)

   Hasta T-7 el alta a mano era la única puerta hacia `proceso` y esta lógica
   vivía adentro de `crear`. Desde que una cotización ganada abre procesos,
   son dos puertas, y un segundo `INSERT INTO proceso` en otro archivo sería
   el mismo problema que `worker/procesos/plantilla.ts` describe para la
   escritura de plantillas: dos sitios que saben cómo se escribe lo mismo, y
   el día que uno aprenda algo —una columna, una regla de siembra— el otro no
   se entera.

   Por eso esto se extrae **como constructor de sentencias y no como método
   del puerto**. Quien abre procesos desde una cotización necesita ponerlos
   en **su** `batch`, junto al `UPDATE` que marca la cotización ganada: si
   fueran dos escrituras separadas existiría una ganada sin sus procesos y
   nadie se enteraría hasta que alguien la busque. Un método del servicio
   escribiría por su cuenta y esa atomicidad no sería expresable.
   ========================================================================== */

/**
 * Lo que hace falta para abrir un proceso, venga de donde venga.
 *
 * **No lleva `origen`**, y la ausencia es la decisión: se deriva de
 * `cotizacionId` más abajo. Recibirlo abriría la posibilidad de escribir
 * `'directo'` sobre una fila que trae cotización, que es exactamente la fila
 * que miente y que `el_origen_y_la_cotizacion_dicen_lo_mismo` rechaza en la
 * base. Es el mismo criterio con el que `cerrar`, en el repositorio de
 * cotizaciones, deriva el verbo de bitácora del destino en vez de recibirlo.
 *
 * La razón no cambió con T-13; lo que cambió es de qué cuelga el proceso.
 * Hasta `0010` era la línea, y eso ataba una unidad de trabajo a una unidad
 * de facturación.
 */
export interface AperturaDeProceso {
  readonly clienteId: string;
  readonly tipoProcesoId: string;
  readonly titulo: string;
  readonly responsableId: string | null;
  /** La cotización que lo abrió, o nulo si lo abrió una persona. */
  readonly cotizacionId: string | null;
}

/** Un proceso por nacer: su identificador y las sentencias que lo escriben. */
export interface ProcesoPorNacer {
  readonly id: string;
  readonly sentencias: readonly Sentencia[];
}

/*
 * Acá vivía `CondicionDeApertura`, la precondición que T-7 le colgaba a cada
 * `INSERT` de apertura para que la petición que perdía la carrera de ganar
 * no escribiera sus procesos igual. **T-13 la dejó sin un solo llamador y
 * por eso se fue**, y la medición vale la pena dejarla escrita porque la
 * conclusión no es obvia:
 *
 *  - Ganar ya no abre nada, así que aquella carrera —dos peticiones que
 *    leyeron `emitida` a la vez y las dos escribían trámites— no existe.
 *    Lo único que ganar escribe ahora es su `UPDATE`, que trae su propia
 *    cláusula `AND estado = 'emitida'` y su propia prueba.
 *  - La ruta nueva —abrir procesos sobre una ganada— **no la necesita, y
 *    ponérsela habría sido una guarda que ninguna prueba puede matar.** Su
 *    precondición sería `estado = 'ganada'`, y `ganada` es terminal: el
 *    disparador `cotizacion_el_estado_sigue_el_ciclo_de_vida` de `0007`
 *    enumera las transiciones en positivo y ninguna sale de ahí. O sea que
 *    no hay mutación que pueda volverla falsa entre leer y escribir, y una
 *    condición que nadie puede falsificar no distingue a nadie.
 *  - Dos peticiones que abren procesos a la vez sobre la misma ganada
 *    **entran las dos, y eso es correcto**: abrir no es una transición, es
 *    aditivo. Dos personas que piden cada una su expediente tienen que
 *    terminar con dos, que es exactamente lo que el bufete pidió al querer
 *    poder abrir otro meses después.
 *
 * Con la condición fuera, las sentencias volvieron a ser `INSERT … VALUES`:
 * la forma `INSERT … SELECT` existía nada más que para poder colgarles un
 * `WHERE EXISTS`.
 */

/**
 * Las sentencias que abren uno o varios procesos, con su plan ya sembrado.
 *
 * ## La siembra: la plantilla siembra, el proceso manda
 *
 * Las etapas se **copian** de `etapa_plantilla` a `proceso_etapa` y no queda
 * ninguna referencia a la plantilla: ni una columna, ni el id de origen.
 * Desde ese momento el proceso es dueño de su plan y editar el molde no lo
 * toca (`docs/diseno.md` §6, «Etapas»). Es la propiedad más importante del
 * modelo y la razón por la que acá se copia en vez de apuntar.
 *
 * ## Una sola lectura para todos los tipos
 *
 * Una cotización con seis líneas de trámite no tiene por qué costar seis
 * viajes, que es el mismo criterio con el que `guardarLoAnotado` cuenta las
 * notas de todas las etapas en un `GROUP BY`. Los tipos se deduplican antes
 * de preguntar, porque dos líneas del mismo tipo comparten plantilla.
 *
 * El filtro de tenencia va puesto como en todo este archivo (I-8): la
 * plantilla de otro bufete no siembra nada acá.
 *
 * `alcanzada_en` queda nulo en todas: un proceso recién abierto no tiene
 * nada cumplido, ni siquiera su primer paso.
 *
 * ## Las sentencias no llevan condición, y antes sí
 *
 * Hasta T-13 esta función aceptaba un `soloSi` y escribía `INSERT … SELECT …
 * WHERE EXISTS (…)` para poder colgárselo. El bloque de arriba cuenta por
 * qué se fue y qué se midió para saberlo. Sin él, `VALUES` dice lo mismo con
 * menos letras y sin prometer una condición que ya no hay dónde poner.
 */
export async function aperturasDeProcesos(
  lectura: LecturaD1,
  tenantId: string,
  aperturas: readonly AperturaDeProceso[],
): Promise<ProcesoPorNacer[]> {
  if (aperturas.length === 0) return [];

  const tipos = [...new Set(aperturas.map((cada) => cada.tipoProcesoId))];

  const { results: plantilla } = await lectura
    .prepare(
      "SELECT tipo_proceso_id, nombre FROM etapa_plantilla" +
        ` WHERE tenant_id = ? AND tipo_proceso_id IN (${tipos
          .map(() => "?")
          .join(", ")})` +
        " ORDER BY tipo_proceso_id, orden, nombre COLLATE NOCASE",
    )
    .bind(tenantId, ...tipos)
    .all<{ tipo_proceso_id: string; nombre: string }>();

  const porTipo = new Map<string, string[]>();
  for (const etapa of plantilla) {
    const nombres = porTipo.get(etapa.tipo_proceso_id) ?? [];
    nombres.push(etapa.nombre);
    porTipo.set(etapa.tipo_proceso_id, nombres);
  }

  const abierto = ahoraIso();

  /** `INSERT INTO tabla (cols) VALUES (?, …)`. */
  function entra(
    tabla: string,
    columnas: readonly string[],
    valores: readonly Vinculable[],
  ): Sentencia {
    return {
      sql:
        `INSERT INTO ${tabla} (${columnas.join(", ")})` +
        ` VALUES (${columnas.map(() => "?").join(", ")})`,
      parametros: valores,
    };
  }

  return aperturas.map((apertura) => {
    const id = nuevoId();
    // Un tipo sin plantilla abre el proceso igual, con el plan vacío: la
    // plantilla es un atajo y no un requisito.
    const etapas = porTipo.get(apertura.tipoProcesoId) ?? [];

    return {
      id,
      sentencias: [
        entra(
          "proceso",
          [
            "id",
            "tenant_id",
            "cliente_id",
            "tipo_proceso_id",
            "origen",
            "titulo",
            "estado",
            "responsable_id",
            "abierto_en",
            "cotizacion_id",
          ],
          [
            id,
            tenantId,
            apertura.clienteId,
            apertura.tipoProcesoId,
            apertura.cotizacionId === null ? "directo" : "cotizacion",
            apertura.titulo,
            "abierto",
            apertura.responsableId,
            abierto,
            apertura.cotizacionId,
          ],
        ),
        ...etapas.map((nombre, orden) =>
          entra(
            "proceso_etapa",
            ["id", "tenant_id", "proceso_id", "nombre", "orden"],
            [nuevoId(), tenantId, id, nombre, orden],
          ),
        ),
      ],
    };
  });
}

/**
 * Que la fila exista **en este tenant**. Una fila de otro tenant es, desde
 * acá, una fila que no existe.
 *
 * Está al nivel del módulo y no adentro del adaptador porque desde T-13 hay
 * dos puertas que abren procesos —el alta a mano y la apertura desde una
 * cotización ganada— y las dos tienen que preguntar lo mismo. Toma una
 * `LecturaD1` y no la base entera por el mismo motivo que
 * `aperturasDeProcesos`: lo único que hace es consultar.
 */
async function existeEnElTenant(
  lectura: LecturaD1,
  tabla: "cliente" | "tipo_proceso" | "usuario",
  tenantId: string,
  id: string,
): Promise<boolean> {
  const fila = await lectura
    .prepare(`SELECT id FROM ${tabla} WHERE tenant_id = ? AND id = ?`)
    .bind(tenantId, id)
    .first<{ id: string }>();

  return fila !== null;
}

/**
 * Las dos llaves que **toda** apertura recibe de afuera: el tipo de proceso
 * y, si vino, el responsable.
 *
 * Se exporta porque el alta a mano (`crear`, acá mismo) y la apertura desde
 * una cotización ganada (`abrirProcesos`, en `worker/cotizaciones/
 * repositorio.ts`) validan exactamente lo mismo, y dos copias serían dos
 * criterios de «qué tipo de proceso es válido» que se separan en el primer
 * cambio. El cliente **no** está acá porque las dos puertas lo consiguen de
 * lugares distintos: el alta lo recibe del cuerpo y lo tiene que validar; la
 * apertura lo saca de la cotización, que es I-3 y no se negocia desde
 * afuera.
 *
 * No se exige `activo = 1` en el tipo de proceso, por la misma razón que
 * T-5 no lo exige del tipo de cliente y T-6 no lo exige del área: qué se
 * puede *elegir* lo decide la pantalla; qué es *válido* lo decide esto. Si
 * se exigiera, dar de baja un tipo rompería la apertura de un proceso que el
 * bufete sí quiere abrir con él —y es justo el caso que destapó T-13, donde
 * el catálogo de entonces no tenía el trámite que hoy hace falta—.
 *
 * Los `campo` que devuelve son los del alta —`tipoProcesoId` y
 * `responsableId`—. Quien valida una lista los prefija con la posición de la
 * fila, que es lo que `reemplazarEtapas` ya hace con `etapa-{i}`.
 */
export async function fallasDeLasLlavesDelProceso(
  lectura: LecturaD1,
  tenantId: string,
  datos: { readonly tipoProcesoId: string; readonly responsableId: string | null },
): Promise<FallaDeValidacion[]> {
  const fallas: FallaDeValidacion[] = [];

  if (!(await existeEnElTenant(lectura, "tipo_proceso", tenantId, datos.tipoProcesoId))) {
    fallas.push({
      campo: "tipoProcesoId",
      motivo: "tipo_proceso_desconocido",
    });
  }
  if (
    datos.responsableId !== null &&
    !(await existeEnElTenant(lectura, "usuario", tenantId, datos.responsableId))
  ) {
    fallas.push({
      campo: "responsableId",
      motivo: "responsable_desconocido",
    });
  }

  return fallas;
}

/**
 * El resultado del alta.
 *
 * **No incluye `proceso_cerrado`**, y la ausencia es el punto: un proceso
 * nace abierto, así que la guarda de T-14 no puede alcanzarlo. Si estuviera
 * en la unión, el ruteo tendría que escribir una rama que nunca corre, y
 * una rama que nunca corre es una rama que nadie puede probar.
 */
export type ResultadoDeAlta =
  | { estado: "guardado"; detalle: DetalleDeProceso }
  | { estado: "invalido"; fallas: FallaDeValidacion[] }
  | { estado: "no_encontrado" };

export type ResultadoDeEscritura =
  | ResultadoDeAlta
  /** T-14: el proceso está cerrado y editar el plan es avance. */
  | { estado: "proceso_cerrado" };

export type ResultadoDeAvance =
  | { estado: "avanzado"; detalle: DetalleDeProceso }
  /** El plan ya no tiene nada por delante. No es un error de datos. */
  | { estado: "sin_pendientes" }
  | { estado: "no_encontrado" }
  /** T-14: el proceso está cerrado. Si hay trabajo, se reabre primero. */
  | { estado: "proceso_cerrado" };

/**
 * El resultado de cerrar o de reabrir (T-14).
 *
 * `ya_estaba` es uno solo para las dos operaciones y lleva el estado que
 * encontró: cerrar algo cerrado y reabrir algo abierto son el mismo choque
 * —la transición no tiene nada que transicionar— y partirlo en dos
 * resultados obligaría al ruteo a repetir la misma rama con otro nombre.
 */
export type ResultadoDeCambioDeEstado =
  | {
      estado: "cambiado";
      detalle: DetalleDeProceso;
      pendientesAbiertos: number;
    }
  | { estado: "ya_estaba"; actual: EstadoDeProceso }
  | { estado: "no_encontrado" };

export interface ServicioDeProcesos {
  /** `clienteId` nulo es el listado global. */
  listar(tenantId: string, clienteId: string | null): Promise<Proceso[]>;
  obtener(tenantId: string, id: string): Promise<DetalleDeProceso | null>;
  crear(tenantId: string, datos: DatosDeProceso): Promise<ResultadoDeAlta>;
  reemplazarEtapas(
    tenantId: string,
    procesoId: string,
    etapas: DatosDeEtapa[],
  ): Promise<ResultadoDeEscritura>;
  avanzar(tenantId: string, procesoId: string): Promise<ResultadoDeAvance>;
  /** T-14. Devuelve cuántos cabos sueltos quedaron, sin impedir el cierre. */
  cerrar(
    tenantId: string,
    procesoId: string,
  ): Promise<ResultadoDeCambioDeEstado>;
  reabrir(
    tenantId: string,
    procesoId: string,
  ): Promise<ResultadoDeCambioDeEstado>;
}

interface FilaDeProceso {
  id: string;
  cliente_id: string;
  cliente_nombre: string | null;
  tipo_proceso_id: string;
  tipo_proceso_nombre: string | null;
  area_nombre: string | null;
  origen: string;
  titulo: string;
  estado: string;
  responsable_id: string | null;
  responsable_nombre: string | null;
  abierto_en: string;
  cerrado_en: string | null;
  etapas_cumplidas: number;
  etapas_totales: number;
  etapa_vigente: string | null;
  cotizacion_id: string | null;
  cotizacion_codigo: string | null;
}

interface FilaDeEtapa {
  id: string;
  nombre: string;
  orden: number;
  alcanzada_en: string | null;
}

/**
 * Todo lo que la pantalla muestra de un proceso, en una sola consulta.
 *
 * Las tres uniones repiten el filtro de tenencia en el `ON`: un `cliente_id`
 * que cruzara la frontera devuelve `NULL` en vez del nombre ajeno. Es la
 * misma precaución que T-6 tomó con `area` en `tipo_proceso`.
 *
 * Los tres derivados del plan salen de subconsultas y no de un `GROUP BY`
 * sobre un `LEFT JOIN`: con la unión, un proceso de cuatro etapas se
 * multiplicaría por cuatro y habría que deduplicar a mano todo lo demás.
 *
 * `etapa_vigente` es **la próxima pendiente**, no la última cumplida. «Lo que
 * viene» es la mitad del valor de esta pantalla (`docs/diseno.md` §6): el
 * abogado abre un proceso para ver qué tiene por delante.
 *
 * ## La unión de la procedencia: era de dos saltos y T-13 la dejó en uno
 *
 * T-15 había puesto **dos** uniones, `cotizacion_linea` y después
 * `cotizacion`, y no por gusto: `proceso` apuntaba a la línea, así que no
 * había forma de llegar al código de la cotización sin pasar por ella. Con
 * la arista corrida a la cotización, la unión intermedia deja de tener nada
 * que aportar — la línea nunca se leía, era un peaje — y se va entera. Una
 * unión que sólo existe para alcanzar a la siguiente desaparece el día que
 * la siguiente queda al alcance; dejarla sería pagar una búsqueda por fila
 * para no tocar una línea de SQL.
 *
 * Lo que T-15 midió sobre la que queda sigue valiendo, y es lo que la
 * justifica: entra como `SEARCH … USING INDEX … (id=?)` sobre la llave
 * primaria, igual que las cuatro que ya estaban. Ni un `SCAN`, ni una tabla
 * temporal, ni un `GROUP BY` que deduplicar. Lo que ahorra es lo que
 * costaría no tenerla: con sólo el identificador en el cable, dibujar el
 * listado sería una lectura más **por fila**.
 *
 * El filtro de tenencia se repite en su `ON`, como en las otras cuatro. Una
 * cotización que cruzara la frontera devuelve `NULL` en lugar del código
 * ajeno, y el proceso se dibuja sin procedencia en vez de con la de otro
 * bufete.
 */
const SELECCION =
  "SELECT p.id, p.cliente_id, c.nombre AS cliente_nombre," +
  " p.tipo_proceso_id, tp.nombre AS tipo_proceso_nombre," +
  " a.nombre AS area_nombre, p.origen, p.titulo, p.estado," +
  " p.responsable_id, u.nombre AS responsable_nombre," +
  " p.abierto_en, p.cerrado_en," +
  " (SELECT count(*) FROM proceso_etapa e" +
  "    WHERE e.proceso_id = p.id AND e.tenant_id = p.tenant_id" +
  "      AND e.alcanzada_en IS NOT NULL) AS etapas_cumplidas," +
  " (SELECT count(*) FROM proceso_etapa e" +
  "    WHERE e.proceso_id = p.id AND e.tenant_id = p.tenant_id)" +
  "   AS etapas_totales," +
  " (SELECT e.nombre FROM proceso_etapa e" +
  "    WHERE e.proceso_id = p.id AND e.tenant_id = p.tenant_id" +
  "      AND e.alcanzada_en IS NULL" +
  "    ORDER BY e.orden LIMIT 1) AS etapa_vigente," +
  " q.id AS cotizacion_id, q.codigo AS cotizacion_codigo" +
  " FROM proceso p" +
  " LEFT JOIN cliente c ON c.id = p.cliente_id AND c.tenant_id = p.tenant_id" +
  " LEFT JOIN tipo_proceso tp ON tp.id = p.tipo_proceso_id" +
  "   AND tp.tenant_id = p.tenant_id" +
  " LEFT JOIN area a ON a.id = tp.area_id AND a.tenant_id = tp.tenant_id" +
  " LEFT JOIN usuario u ON u.id = p.responsable_id" +
  "   AND u.tenant_id = p.tenant_id" +
  " LEFT JOIN cotizacion q ON q.id = p.cotizacion_id" +
  "   AND q.tenant_id = p.tenant_id" +
  " WHERE p.tenant_id = ?";

/**
 * `origen` y `estado` llegan de la base como `TEXT`. El `CHECK` de la
 * migración los mantiene dentro del par válido, así que el estrechamiento es
 * una afirmación del esquema y no una validación: si la columna tuviera otra
 * cosa, el problema sería la base y no esta función.
 *
 * Lo mismo vale para el par de la cotización: las dos columnas salen de la
 * **misma fila unida**, así que son nulas juntas o no lo son ninguna. Mirar
 * las dos es estrechamiento de tipos y no una guarda —no hay forma de que
 * discrepen—, y por eso no tiene prueba propia: tenerla sería afirmar que
 * `LEFT JOIN` devuelve media fila.
 */
function aProceso(fila: FilaDeProceso): Proceso {
  return {
    id: fila.id,
    clienteId: fila.cliente_id,
    clienteNombre: fila.cliente_nombre,
    tipoProcesoId: fila.tipo_proceso_id,
    tipoProcesoNombre: fila.tipo_proceso_nombre,
    areaNombre: fila.area_nombre,
    origen: fila.origen as OrigenDeProceso,
    titulo: fila.titulo,
    estado: fila.estado as EstadoDeProceso,
    responsableId: fila.responsable_id,
    responsableNombre: fila.responsable_nombre,
    abiertoEn: fila.abierto_en,
    cerradoEn: fila.cerrado_en,
    etapasCumplidas: fila.etapas_cumplidas,
    etapasTotales: fila.etapas_totales,
    etapaVigente: fila.etapa_vigente,
    cotizacionDeOrigen:
      fila.cotizacion_id === null || fila.cotizacion_codigo === null
        ? null
        : { id: fila.cotizacion_id, codigo: fila.cotizacion_codigo },
  };
}

function aEtapa(fila: FilaDeEtapa): EtapaDeProceso {
  return {
    id: fila.id,
    nombre: fila.nombre,
    orden: fila.orden,
    alcanzadaEn: fila.alcanzada_en,
  };
}

/**
 * La guarda de la etapa alcanzada, escrita como función pura para que se la
 * pueda leer entera.
 *
 * `actuales` viene de la base en orden de plan. `enviadas` es lo que la
 * pantalla mandó, también en orden. Devuelve las fallas; vacío es «adelante».
 *
 * Las dos reglas, en este orden porque la primera explica mejor el problema:
 *
 *  1. **Ninguna alcanzada puede faltar.** Si falta, el `PUT` la borraría.
 *  2. **Las alcanzadas van al frente, en su orden.** Lo cumplido ya ocupó su
 *     lugar en el tiempo; prometer un paso antes de algo que ya pasó deja un
 *     plan que no se puede dibujar separado en cumplido y pendiente.
 */
function guardarLoAlcanzado(
  actuales: readonly EtapaDeProceso[],
  enviadas: readonly DatosDeEtapa[],
): FallaDeValidacion[] {
  const alcanzadas = actuales.filter((etapa) => etapa.alcanzadaEn !== null);
  if (alcanzadas.length === 0) return [];

  const presentes = new Set(
    enviadas
      .map((etapa) => etapa.id)
      .filter((id): id is string => id !== null),
  );

  const fallas: FallaDeValidacion[] = [];

  for (const etapa of alcanzadas) {
    if (!presentes.has(etapa.id)) {
      fallas.push({
        campo: `etapa-${String(etapa.orden)}`,
        motivo: "etapa_alcanzada_no_se_quita",
      });
    }
  }
  if (fallas.length > 0) return fallas;

  // Están todas; ahora, dónde. El prefijo del envío tiene que ser exactamente
  // las alcanzadas, en su mismo orden.
  alcanzadas.forEach((etapa, indice) => {
    if (enviadas[indice]?.id !== etapa.id) {
      fallas.push({
        campo: `etapa-${String(indice)}`,
        motivo: "etapa_alcanzada_no_se_mueve",
      });
    }
  });

  return fallas;
}

export function procesosSobreD1(base: BaseDeDatos): ServicioDeProcesos {
  const db = base.lectura;

  async function leerEtapas(
    tenantId: string,
    procesoId: string,
  ): Promise<EtapaDeProceso[]> {
    const { results } = await db
      .prepare(
        "SELECT id, nombre, orden, alcanzada_en FROM proceso_etapa" +
          " WHERE tenant_id = ? AND proceso_id = ?" +
          " ORDER BY orden, nombre COLLATE NOCASE",
      )
      .bind(tenantId, procesoId)
      .all<FilaDeEtapa>();

    return results.map(aEtapa);
  }

  async function leerProceso(
    tenantId: string,
    id: string,
  ): Promise<Proceso | null> {
    const fila = await db
      .prepare(`${SELECCION} AND p.id = ?`)
      .bind(tenantId, id)
      .first<FilaDeProceso>();

    return fila === null ? null : aProceso(fila);
  }

  async function obtener(
    tenantId: string,
    id: string,
  ): Promise<DetalleDeProceso | null> {
    const proceso = await leerProceso(tenantId, id);
    if (proceso === null) return null;

    return { proceso, etapas: await leerEtapas(tenantId, id) };
  }

  /**
   * Relee el detalle después de escribir. Si no está, el `INSERT` o el
   * `UPDATE` no escribió: eso es un defecto, no un 404 de negocio.
   */
  async function releer(
    tenantId: string,
    id: string,
    que: string,
  ): Promise<DetalleDeProceso> {
    const detalle = await obtener(tenantId, id);
    if (detalle === null) {
      throw new Error(`${que} no se pudo releer`);
    }
    return detalle;
  }

  /**
   * Las tres llaves que el alta recibe de afuera.
   *
   * Son **la del cliente más las dos compartidas**: el cliente lo valida
   * esta puerta porque es la única que lo recibe del cuerpo, y el tipo y el
   * responsable salen de `fallasDeLasLlavesDelProceso`, que es la misma
   * función que usa la apertura desde una cotización ganada. El argumento de
   * por qué no se exige `activo = 1` vive allá, al lado del código que lo
   * decide.
   *
   * El orden de las fallas se conserva —cliente, tipo, responsable— porque
   * es el orden de los campos del formulario, y una lista de problemas que
   * no sigue el orden en que se leen obliga a buscarlos.
   */
  async function validarLlaves(
    tenantId: string,
    datos: DatosDeProceso,
  ): Promise<FallaDeValidacion[]> {
    const fallas: FallaDeValidacion[] = [];

    if (!(await existeEnElTenant(db, "cliente", tenantId, datos.clienteId))) {
      fallas.push({ campo: "clienteId", motivo: "cliente_desconocido" });
    }

    fallas.push(...(await fallasDeLasLlavesDelProceso(db, tenantId, datos)));

    return fallas;
  }

  /**
   * La guarda que T-7 dejó encargada a T-8: **una etapa pendiente con notas
   * no se quita del plan.**
   *
   * Hasta T-8 una etapa pendiente no tenía nada colgando y quitarla era
   * gratis. Desde que existen las notas, quitarla chocaría contra la llave
   * foránea de `nota.proceso_etapa_id`, que T-2 dejó en `NO ACTION` a
   * propósito.
   *
   * **La guarda es este conteo, no un `catch` de ese choque.** Es la misma
   * disciplina que T-6 asentó para el borrado de catálogos y T-7 para la
   * etapa alcanzada: con un `catch` que tradujera el error de la base a una
   * respuesta amable, aflojar el conteo no rompería ninguna prueba y la
   * guarda quedaría sin verificar para siempre. Acá no se atrapa nada — al
   * aflojar esto, lo que sale es `FOREIGN KEY constraint failed` crudo, que
   * es exactamente lo que no tiene que llegarle a nadie.
   *
   * La falla viaja con `cuantos` porque «tiene notas» obliga a ir a
   * contarlas: el rechazo dice cuántas lo impiden, como el 409 de T-6 dice
   * cuántos dependientes hay.
   *
   * Un solo `GROUP BY` y no una consulta por etapa: quitar seis pasos de un
   * plan reordenado no tiene por qué costar seis viajes.
   */
  async function guardarLoAnotado(
    tenantId: string,
    procesoId: string,
    quitadas: readonly EtapaDeProceso[],
  ): Promise<FallaDeValidacion[]> {
    if (quitadas.length === 0) return [];

    const { results } = await db
      .prepare(
        "SELECT proceso_etapa_id, count(*) AS cuantas FROM nota" +
          " WHERE tenant_id = ? AND proceso_id = ?" +
          " GROUP BY proceso_etapa_id",
      )
      .bind(tenantId, procesoId)
      .all<{ proceso_etapa_id: string; cuantas: number }>();

    const notasPorEtapa = new Map(
      results.map((fila) => [fila.proceso_etapa_id, fila.cuantas]),
    );

    return quitadas.flatMap((etapa) => {
      const cuantos = notasPorEtapa.get(etapa.id) ?? 0;
      return cuantos === 0
        ? []
        : [
            {
              campo: `etapa-${String(etapa.orden)}`,
              motivo: "etapa_con_notas_no_se_quita" as const,
              cuantos,
            },
          ];
    });
  }

  /**
   * Las etapas que no se pueden quitar porque **ahí nació** un pendiente.
   *
   * Hermana de `guardarLoAnotado` y escrita aparte a propósito: el argumento
   * no se traslada. Una nota pertenece a su etapa; un pendiente solo nació
   * en ella y después cruza el plan. Lo que lo impide es que
   * `pendiente.proceso_etapa_id` es `NOT NULL` y dice dónde nació: sacar esa
   * etapa obliga a dejarlo huérfano —imposible— o a reanclarlo, que es
   * mentir sobre dónde nació.
   *
   * **No se filtra por `cerrado_en`.** Cuentan los abiertos y los cerrados,
   * porque el hecho que se protege es el nacimiento y no la vigencia. Un
   * pendiente cerrado es el registro de un cabo suelto que existió en ese
   * paso del plan.
   *
   * Y como en la guarda de las notas: **esto es el conteo, no un `catch`.**
   * Al aflojarlo sale `FOREIGN KEY constraint failed` crudo, que es
   * exactamente lo que no tiene que llegarle a nadie.
   */
  async function guardarLoPendiente(
    tenantId: string,
    procesoId: string,
    quitadas: readonly EtapaDeProceso[],
  ): Promise<FallaDeValidacion[]> {
    if (quitadas.length === 0) return [];

    const { results } = await db
      .prepare(
        "SELECT proceso_etapa_id, count(*) AS cuantas FROM pendiente" +
          " WHERE tenant_id = ? AND proceso_id = ?" +
          " GROUP BY proceso_etapa_id",
      )
      .bind(tenantId, procesoId)
      .all<{ proceso_etapa_id: string; cuantas: number }>();

    const porEtapa = new Map(
      results.map((fila) => [fila.proceso_etapa_id, fila.cuantas]),
    );

    return quitadas.flatMap((etapa) => {
      const cuantos = porEtapa.get(etapa.id) ?? 0;
      return cuantos === 0
        ? []
        : [
            {
              campo: `etapa-${String(etapa.orden)}`,
              motivo: "etapa_con_pendientes_no_se_quita" as const,
              cuantos,
            },
          ];
    });
  }

  /**
   * Cuántos cabos sueltos del proceso siguen sin cerrarse (T-14).
   *
   * `cerrado_en IS NULL` y no `<> ''`: la columna es nula mientras el
   * pendiente está abierto, y en SQL una comparación contra nulo no es
   * falsa sino desconocida — la fila se perdería en silencio y el cierre
   * informaría cero cabos sueltos teniendo tres.
   *
   * Vive en el repositorio de procesos y no en el de pendientes aunque lea
   * su tabla: lo que se cuenta no es una lista de pendientes sino una
   * propiedad del proceso que se está cerrando, y el conteo viaja en la
   * respuesta del cierre.
   */
  async function contarPendientesAbiertos(
    tenantId: string,
    procesoId: string,
  ): Promise<number> {
    const fila = await db
      .prepare(
        "SELECT count(*) AS cuantos FROM pendiente" +
          " WHERE tenant_id = ? AND proceso_id = ? AND cerrado_en IS NULL",
      )
      .bind(tenantId, procesoId)
      .first<{ cuantos: number }>();

    return fila?.cuantos ?? 0;
  }

  return {
    async listar(tenantId, clienteId) {
      // Un `clienteId` que no es de este tenant no devuelve nada, porque el
      // filtro va encima del `WHERE p.tenant_id = ?` que ya está puesto: no
      // hay forma de que un identificador ajeno traiga filas ajenas.
      const consulta =
        clienteId === null
          ? db
              .prepare(
                `${SELECCION} ORDER BY c.nombre COLLATE NOCASE,` +
                  " p.titulo COLLATE NOCASE",
              )
              .bind(tenantId)
          : db
              .prepare(
                `${SELECCION} AND p.cliente_id = ?` +
                  " ORDER BY p.abierto_en DESC, p.titulo COLLATE NOCASE",
              )
              .bind(tenantId, clienteId);

      const { results } = await consulta.all<FilaDeProceso>();
      return results.map(aProceso);
    },

    obtener,

    async crear(tenantId, datos) {
      const fallas = await validarLlaves(tenantId, datos);
      if (fallas.length > 0) return { estado: "invalido", fallas };

      // El alta a mano es una apertura **sin cotización**, y por eso nace
      // `'directo'`: el origen lo deriva `aperturasDeProcesos`, que es la
      // única que sabe escribir esa fila desde T-7. Antes la siembra estaba
      // acá; se movió para que la apertura desde una cotización ganada no
      // fuera una segunda copia de la misma escritura.
      const [abierto] = await aperturasDeProcesos(db, tenantId, [
        {
          clienteId: datos.clienteId,
          tipoProcesoId: datos.tipoProcesoId,
          titulo: datos.titulo,
          responsableId: datos.responsableId,
          cotizacionId: null,
        },
      ]);

      const id = abierto.id;

      // Todo en un `batch`: un proceso guardado sin su plan es peor que
      // ninguno, porque se ve bien y está vacío. La entrada de bitácora
      // viaja en el mismo `batch`, por lo mismo.
      await base.mutar(
        {
          entidad: "proceso",
          entidadId: id,
          accion: "creado",
          detalle: datos.titulo,
        },
        ...abierto.sentencias,
      );

      return {
        estado: "guardado",
        detalle: await releer(tenantId, id, "el proceso recién creado"),
      };
    },

    async reemplazarEtapas(tenantId, procesoId, etapas) {
      const proceso = await leerProceso(tenantId, procesoId);
      if (proceso === null) return { estado: "no_encontrado" };

      // T-14, y antes que cualquier validación del envío: un 422 sobre el
      // plan de un proceso cerrado contestaría qué hay de malo en un plan
      // que de todas formas no se va a guardar.
      if (proceso.estado === "cerrado") return { estado: "proceso_cerrado" };

      const actuales = await leerEtapas(tenantId, procesoId);
      const existentes = new Set(actuales.map((etapa) => etapa.id));

      // Un id que no es de ESTE proceso no se toca: ni se actualiza (sería
      // editar la etapa de otro proceso, o la del bufete vecino) ni se
      // inserta con ese id prestado.
      const fallas: FallaDeValidacion[] = [];
      etapas.forEach((etapa, indice) => {
        if (etapa.id !== null && !existentes.has(etapa.id)) {
          fallas.push({
            campo: `etapa-${String(indice)}`,
            motivo: "etapa_desconocida",
          });
        }
      });
      if (fallas.length > 0) return { estado: "invalido", fallas };

      const deLoAlcanzado = guardarLoAlcanzado(actuales, etapas);
      if (deLoAlcanzado.length > 0) {
        return { estado: "invalido", fallas: deLoAlcanzado };
      }

      const conservados = new Set(
        etapas
          .map((etapa) => etapa.id)
          .filter((id): id is string => id !== null),
      );

      const quitadas = actuales.filter((etapa) => !conservados.has(etapa.id));
      const deLasNotas = await guardarLoAnotado(
        tenantId,
        procesoId,
        quitadas,
      );
      if (deLasNotas.length > 0) {
        return { estado: "invalido", fallas: deLasNotas };
      }

      // La guarda de T-9, aparte de la de T-8 porque su argumento es otro:
      // acá no se protege lo que *pertenece* a la etapa sino lo que *nació*
      // en ella. Las notas se consultan primero por antigüedad, no por
      // precedencia: las dos rechazan antes de que se escriba una sola fila.
      const deLosPendientes = await guardarLoPendiente(
        tenantId,
        procesoId,
        quitadas,
      );
      if (deLosPendientes.length > 0) {
        return { estado: "invalido", fallas: deLosPendientes };
      }

      // El `orden` es la posición en el arreglo, asignada acá y no por el
      // cliente: `proceso_etapa.orden` no tiene índice único (T-2 lo dejó así
      // a propósito), así que si el cliente lo eligiera, dos etapas con el
      // mismo `orden` entrarían sin que nada se quejara.
      //
      // El `UPDATE` **no menciona `alcanzada_en`**. Ese es el candado del
      // avance de una sola dirección: no hay forma de desandar por esta vía.
      const sentencias = [
        ...quitadas.map((etapa) =>
          sentencia(
            "DELETE FROM proceso_etapa WHERE tenant_id = ?" +
              " AND proceso_id = ? AND id = ?",
            tenantId,
            procesoId,
            etapa.id,
          ),
        ),
        ...etapas.map((etapa, orden) =>
          etapa.id === null
            ? sentencia(
                "INSERT INTO proceso_etapa (id, tenant_id, proceso_id," +
                  " nombre, orden) VALUES (?, ?, ?, ?, ?)",
                nuevoId(),
                tenantId,
                procesoId,
                etapa.nombre,
                orden,
              )
            : sentencia(
                "UPDATE proceso_etapa SET nombre = ?, orden = ?" +
                  " WHERE tenant_id = ? AND proceso_id = ? AND id = ?",
                etapa.nombre,
                orden,
                tenantId,
                procesoId,
                etapa.id,
              ),
        ),
      ];

      // Se registra el guardado del plan, no cada paso que se movió: es un
      // evento, no un diff. `detalle` va vacío porque un plan no tiene
      // nombre — el nombre es el del proceso, que ya es la entidad.
      await base.mutar(
        { entidad: "proceso", entidadId: procesoId, accion: "plan_editado" },
        ...sentencias,
      );

      return {
        estado: "guardado",
        detalle: await releer(tenantId, procesoId, "el plan recién guardado"),
      };
    },

    async avanzar(tenantId, procesoId) {
      const proceso = await leerProceso(tenantId, procesoId);
      if (proceso === null) return { estado: "no_encontrado" };

      // La guarda de T-14. **Se consulta el estado, no se atrapa nada**: el
      // esquema no tiene ningún `CHECK` que impida marcar una etapa de un
      // proceso cerrado, así que no hay error de base que disfrazar — y si
      // lo hubiera, atraparlo dejaría la guarda sin verificar para siempre.
      // Al quitar esta línea mueren sus pruebas, que es lo que se busca.
      if (proceso.estado === "cerrado") return { estado: "proceso_cerrado" };

      // La próxima pendiente en el orden del plan. Avanzar no salta pasos:
      // saltarlos dejaría cumplidas y pendientes intercaladas, y la pantalla
      // dejaría de poder mostrar «lo que falta» como una lista.
      const siguiente = await db
        .prepare(
          "SELECT id, nombre FROM proceso_etapa" +
            " WHERE tenant_id = ? AND proceso_id = ? AND alcanzada_en IS NULL" +
            " ORDER BY orden, nombre COLLATE NOCASE LIMIT 1",
        )
        .bind(tenantId, procesoId)
        .first<{ id: string; nombre: string }>();

      if (siguiente === null) return { estado: "sin_pendientes" };

      // `AND alcanzada_en IS NULL` también en el `UPDATE`: dos avances
      // simultáneos no pueden reescribir el momento de una etapa ya marcada.
      //
      // El `detalle` es el nombre de la etapa, y es el que hace que la
      // bitácora diga la frase que pidió el usuario: «el 3 de marzo Itzel
      // movió este proceso a Demanda presentada».
      await base.mutar(
        {
          entidad: "proceso",
          entidadId: procesoId,
          accion: "etapa_alcanzada",
          detalle: siguiente.nombre,
        },
        sentencia(
          "UPDATE proceso_etapa SET alcanzada_en = ?" +
            " WHERE tenant_id = ? AND proceso_id = ? AND id = ?" +
            " AND alcanzada_en IS NULL",
          ahoraIso(),
          tenantId,
          procesoId,
          siguiente.id,
        ),
      );

      return {
        estado: "avanzado",
        detalle: await releer(tenantId, procesoId, "el proceso recién avanzado"),
      };
    },

    async cerrar(tenantId, procesoId) {
      const proceso = await leerProceso(tenantId, procesoId);
      if (proceso === null) return { estado: "no_encontrado" };

      // Cerrar dos veces no es un no-op: el segundo cierre no puede pisar
      // el momento del primero, y su entrada de bitácora diría que alguien
      // cerró algo que ya estaba cerrado.
      if (proceso.estado === "cerrado") {
        return { estado: "ya_estaba", actual: "cerrado" };
      }

      // Se cuentan **antes** de cerrar y no se usan para impedirlo. Es la
      // decisión de T-14 en una línea: el bufete cierra casos con cabos
      // sueltos y el sistema no está para discutirle; lo que no puede es
      // dejar que pase inadvertido.
      const pendientesAbiertos = await contarPendientesAbiertos(
        tenantId,
        procesoId,
      );

      // `AND estado = 'abierto'` también en el `UPDATE`, igual que el avance
      // de etapa y el cierre de un pendiente: dos cierres simultáneos no
      // pueden reescribir el momento del primero.
      await base.mutar(
        {
          entidad: "proceso",
          entidadId: procesoId,
          accion: "cerrado",
          detalle: proceso.titulo,
        },
        sentencia(
          "UPDATE proceso SET estado = 'cerrado', cerrado_en = ?" +
            " WHERE tenant_id = ? AND id = ? AND estado = 'abierto'",
          ahoraIso(),
          tenantId,
          procesoId,
        ),
      );

      return {
        estado: "cambiado",
        detalle: await releer(tenantId, procesoId, "el proceso recién cerrado"),
        pendientesAbiertos,
      };
    },

    async reabrir(tenantId, procesoId) {
      const proceso = await leerProceso(tenantId, procesoId);
      if (proceso === null) return { estado: "no_encontrado" };

      if (proceso.estado === "abierto") {
        return { estado: "ya_estaba", actual: "abierto" };
      }

      // **`cerrado_en` vuelve a nulo y no conserva la fecha vieja.** Un
      // proceso abierto con fecha de cierre es un dato que miente, y la
      // fecha no se pierde: la entrada `cerrado` de la bitácora la guarda, y
      // esa tabla es inmutable por disparador desde T-10.
      await base.mutar(
        {
          entidad: "proceso",
          entidadId: procesoId,
          accion: "reabierto",
          detalle: proceso.titulo,
        },
        sentencia(
          "UPDATE proceso SET estado = 'abierto', cerrado_en = NULL" +
            " WHERE tenant_id = ? AND id = ? AND estado = 'cerrado'",
          tenantId,
          procesoId,
        ),
      );

      return {
        estado: "cambiado",
        detalle: await releer(
          tenantId,
          procesoId,
          "el proceso recién reabierto",
        ),
        // Los mismos cabos sueltos que el cierre informó, y ahora vuelven a
        // ser trabajo por hacer: el número no cambia, cambia qué significa.
        pendientesAbiertos: await contarPendientesAbiertos(
          tenantId,
          procesoId,
        ),
      };
    },
  };
}
