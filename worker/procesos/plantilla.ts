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
 * ## Lo que este archivo NO hace, a propósito
 *
 * Escribir en `bitacora`: ese registro es T-10 y se va a cablear en un solo
 * lugar.
 */

import type {
  DatosDeEtapa,
  DatosDeGuardadoDePlantilla,
  FallaDeValidacion,
  PlantillaGuardada,
  TipoProceso,
} from "../contract";
import type { ServicioDeCatalogos } from "../catalogos/repositorio";
import type { ServicioDeProcesos } from "./repositorio";

export type ResultadoDeGuardadoDePlantilla =
  | ({
      estado: "guardado";
      /** `true` cuando el tipo de proceso se creó en esta misma llamada. */
      creado: boolean;
    } & PlantillaGuardada)
  | { estado: "invalido"; fallas: FallaDeValidacion[] }
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
    // Alcanzable de verdad: la llave foránea de `proceso.tipo_proceso_id` no
    // lleva el tenant, así que una fila cruzada a mano apuntaría al tipo del
    // bufete vecino. Desde acá, ese tipo no existe.
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

  return { estado: "guardado", creado, tipo, etapas: escritura.etapas };
}
