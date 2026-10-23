/**
 * Guardar el plan de un proceso como plantilla (T-11).
 *
 * El diseño llama a esto «el camino que más se va a usar» para crear una
 * plantilla: se abre un proceso, se le acomodan los pasos sobre la marcha, y
 * cuando queda bien se guarda para la próxima (`docs/diseno.md` §6, «Etapas:
 * plantilla y plan de trabajo»). No es una función de administración, es el
 * atajo del trabajo diario.
 *
 * ## Por qué es un módulo propio y no un método de un repositorio
 *
 * Esta operación **lee de procesos y escribe en catálogos**. Si viviera en
 * `procesos/repositorio.ts` habría ahí un segundo `INSERT INTO
 * etapa_plantilla`, y entonces habría dos lugares que saben cómo se escribe
 * una plantilla: el día que uno aprenda algo —una columna, una regla de
 * orden— el otro no se entera. Por eso acá no hay una sola línea de SQL: se
 * compone `ServicioDeProcesos.obtener` con `ServicioDeCatalogos`, y la
 * escritura es **`reemplazarEtapas`, la misma que usa la pantalla de
 * catálogos**.
 *
 * ## Las tres reglas
 *
 * ### 1. Se copian todas las etapas, en su orden actual
 *
 * Cumplidas y pendientes por igual. Una plantilla es un plan, y en un plan
 * no hay nada «ya hecho»: copiar solo lo pendiente dejaría una plantilla que
 * empieza por la mitad del trámite. `alcanzada_en` **no se copia** porque
 * `etapa_plantilla` no tiene esa columna, y no debe tenerla.
 *
 * Todas las etapas viajan con `id: null`, es decir, como etapas **nuevas de
 * la plantilla**. Los identificadores de `proceso_etapa` son de otra tabla:
 * pasarlos haría que `reemplazarEtapas` los rechazara por ajenos, y si los
 * aceptara sería peor.
 *
 * ### 2. Guardar la plantilla no modifica ningún proceso abierto
 *
 * Ni siquiera el de origen. Es la propiedad de siempre —«la plantilla
 * siembra, el proceso manda»— pero **éste es el punto donde más gente va a
 * suponer lo contrario**: acaba de ajustar un plan y lo está «guardando»,
 * así que es natural creer que eso lo sincroniza todo. Acá eso se cumple
 * solo: no hay ninguna escritura sobre `proceso` ni sobre `proceso_etapa`.
 * Lo que lo sostiene son las pruebas que releen el proceso de origen y los
 * demás procesos del tipo. La pantalla lo dice en el momento de confirmar.
 *
 * ### 3. Un tipo nuevo no reasigna el proceso de origen
 *
 * **La decisión de T-11.** El proceso sigue apuntando a su tipo viejo, por
 * tres razones:
 *
 *  - Reasignarlo rompería la regla 2 justo en el caso donde nadie lo
 *    esperaría. Una acción, un efecto.
 *  - `tipo_proceso_id` es cómo el listado, los filtros y —desde T-10— la
 *    bitácora clasifican trabajo que ya ocurrió. Mover el proceso a un tipo
 *    recién inventado reescribiría lo que el listado dice del pasado.
 *  - Las dos opciones del destino se comportarían distinto: actualizar la
 *    plantilla nunca reasigna nada, y crear un tipo sí. Esa asimetría es la
 *    que hace que alguien, en seis meses, guarde una plantilla esperando una
 *    cosa y obtenga la otra.
 *
 * Reasignar un proceso a otro tipo puede llegar a existir, pero como una
 * acción propia y visible, no como el efecto secundario de otra.
 *
 * ## El registro de bitácora (T-10)
 *
 * Esta operación deja **tres** entradas, y no es duplicación: son tres
 * hechos sobre dos entidades distintas. Si el destino es un tipo nuevo, el
 * tipo *se creó* (`tipo_proceso` / `creado`); en los dos destinos la
 * plantilla *se guardó* (`tipo_proceso` / `plantilla_editada`); y en los dos
 * el proceso *guardó su plan como plantilla* (`proceso` /
 * `plantilla_guardada`). Las dos primeras las pone `ServicioDeCatalogos` por
 * su cuenta, porque son suyas. La tercera la pone esta función, y es la que
 * hace que la bitácora del proceso conteste qué pasó con él.
 *
 * Es el único `mutar` sin sentencias del sistema, y es a propósito: acá no
 * hay SQL porque la escritura es de otro módulo, pero el hecho sigue siendo
 * de éste.
 */

import type {
  DatosDeEtapa,
  DatosDeGuardadoDePlantilla,
  FallaDeValidacion,
  PlantillaGuardada,
  TipoProceso,
} from "../contract";
import type {
  NombreTomado,
  ServicioDeCatalogos,
} from "../catalogos/repositorio";
import type { BaseDeDatos } from "../db/base";
import type { ServicioDeProcesos } from "./repositorio";

export type ResultadoDeGuardadoDePlantilla =
  | ({
      estado: "guardado";
      /** `true` cuando el tipo de proceso se creó en esta misma llamada. */
      creado: boolean;
    } & PlantillaGuardada)
  | { estado: "invalido"; fallas: FallaDeValidacion[] }
  /**
   * El tipo nuevo chocaría con uno que ya existe en esa área (T-12).
   *
   * Este estado existe porque **ésta es la segunda puerta de escritura
   * hacia `crearTipoProceso`**, la que no pasa por las rutas de catálogos.
   * La guarda vive en el repositorio justamente para cubrir las dos; lo que
   * falta acá es reenviar su resultado, porque tragárselo devolvería el
   * mismo 500 que T-12 vino a eliminar en el otro camino.
   */
  | { estado: "duplicado"; existente: NombreTomado }
  | { estado: "no_encontrado" };

/**
 * El plan tal como entra en una plantilla: nombre y posición, nada más.
 *
 * `alcanzadaEn` se queda afuera por construcción, no por un `delete`:
 * `DatosDeEtapa` no lo tiene, así que no hay forma de que se cuele.
 */
function comoPlantilla(
  etapas: readonly { id: string; nombre: string; orden: number }[],
): DatosDeEtapa[] {
  return [...etapas]
    .sort((a, b) => a.orden - b.orden)
    .map((etapa) => ({ id: null, nombre: etapa.nombre }));
}

export async function guardarPlanComoPlantilla(
  tenantId: string,
  procesoId: string,
  datos: DatosDeGuardadoDePlantilla,
  procesos: ServicioDeProcesos,
  catalogos: ServicioDeCatalogos,
  base: BaseDeDatos,
): Promise<ResultadoDeGuardadoDePlantilla> {
  // El filtro de tenencia: un proceso de otro bufete es, desde acá, un
  // proceso que no existe. `obtener` ya filtra por `tenant_id`, y esta rama
  // es la única puerta de entrada.
  const detalle = await procesos.obtener(tenantId, procesoId);
  if (detalle === null) return { estado: "no_encontrado" };

  // Un proceso sin etapas no tiene plan que guardar, y guardarlo igual no
  // sería inocuo: `reemplazarEtapas` **reemplaza**, así que vaciaría la
  // plantilla del tipo y el próximo proceso nacería sin pasos. Se comprueba
  // antes de crear nada, para que el tipo nuevo tampoco quede a medias.
  if (detalle.etapas.length === 0) {
    return {
      estado: "invalido",
      fallas: [{ campo: "etapas", motivo: "plan_vacio" }],
    };
  }

  const etapas = comoPlantilla(detalle.etapas);

  let tipo: TipoProceso;
  let creado = false;

  if (datos.destino === "actualizar") {
    const existente = await catalogos.obtenerTipoProceso(
      tenantId,
      detalle.proceso.tipoProcesoId,
    );
    // Defensa en profundidad, **no alcanzable desde la base, sí desde el
    // puerto**. La distinción importa y T-12 la escribió mal.
    //
    // Hasta `migrations/0003_tenencia_y_unicidad.sql` esta rama se ejercitaba
    // con datos: la llave foránea de `proceso.tipo_proceso_id` no lleva el
    // tenant, así que una fila cruzada insertada a mano apuntaba al tipo del
    // bufete vecino y llegaba hasta acá. Desde M-3 esa fila es inexpresable
    // —el disparador `proceso_tenencia_coherente_al_insertar` la aborta—.
    //
    // Pero `catalogos` entra **por parámetro**, así que la rama se ejercita
    // sustituyendo el puerto por un doble que contesta `null`, y eso es
    // exactamente lo que hace `test/procesos-api.spec.ts`. T-12 declaró la
    // rama inverificable; la revisión mostró que no, y la arquitectura
    // hexagonal era la respuesta todo el tiempo.
    //
    // Se conserva igual, y no por costumbre: la guarda que se puede apagar
    // es la de la base, y si alguien desactivara ese disparador o
    // reconstruyera la tabla sin él, esto es lo único que quedaría en pie.
    // Es el mismo criterio con el que `0003` argumenta que un disparador no
    // vuelve redundante al filtro de tenencia del repositorio.
    //
    // Que la base la rechace ahora está probado por rechazo en
    // `test/esquema.spec.ts` («M-2 y M-3 · ninguna fila referencia a otro
    // bufete») y en `test/procesos-api.spec.ts` («la fila cruzada que esta
    // prueba necesitaba ya no se puede escribir»), que es la prueba que
    // antes armaba esa fila para ejercitar justamente esta línea.
    if (existente === null) return { estado: "no_encontrado" };
    tipo = existente;
  } else {
    const alta = await catalogos.crearTipoProceso(tenantId, {
      areaId: datos.areaId,
      nombre: datos.nombre,
      descripcion: datos.descripcion,
      activo: true,
    });
    if (alta.estado === "no_encontrado") return { estado: "no_encontrado" };
    if (alta.estado === "invalido") {
      return { estado: "invalido", fallas: alta.fallas };
    }
    // El nombre tomado se reenvía tal cual, sin traducirlo a una falla de
    // validación: es un 409 y no un 422, igual que por el otro camino. Dos
    // códigos distintos para el mismo choque obligarían a la pantalla a
    // tratar el mismo problema de dos maneras según de dónde vino.
    if (alta.estado === "duplicado") {
      return { estado: "duplicado", existente: alta.existente };
    }

    tipo = alta.fila;
    creado = true;
  }

  const escritura = await catalogos.reemplazarEtapas(tenantId, tipo.id, etapas);

  // Ninguno de los dos finales es alcanzable acá: el tipo acaba de leerse o
  // de crearse en este tenant, y todas las etapas van con `id: null`, que es
  // lo único que `reemplazarEtapas` valida. Si pasa, es un defecto y no una
  // respuesta de negocio — callarlo dejaría un tipo nuevo con la plantilla
  // vacía y nadie sabría por qué.
  if (escritura.estado !== "guardado") {
    throw new Error(
      `la plantilla del tipo ${tipo.id} no se pudo escribir:` +
        ` ${escritura.estado}`,
    );
  }

  // Último, cuando ya no puede fallar nada: un hecho que se registra antes
  // de que ocurra es exactamente lo que una bitácora no puede permitirse.
  await base.mutar({
    entidad: "proceso",
    entidadId: procesoId,
    accion: "plantilla_guardada",
    detalle: tipo.nombre,
  });

  return { estado: "guardado", creado, tipo, etapas: escritura.etapas };
}
