/**
 * El generador: de una descripción en prosa a una propuesta validada (T-9,
 * `docs/diseno.md` §8 «La entrada»).
 *
 * No toca D1 y no sabe que existe HTTP. Lo que hace es juntar las piezas que
 * ya existían y que nadie había juntado: los **tres** catálogos del bufete
 * —sus plantillas de módulo, sus trámites y sus servicios tarifados—, el
 * prompt que los nombra, y la costura de T-8 que valida lo que vuelve. Guardar
 * el borrador es de `worker/cotizaciones/repositorio.ts`.
 *
 * **Quién pone el precio de una línea tarifada se decide una sola vez y no
 * acá** (T-3): el catálogo con su cifra viaja hasta `validarPropuesta`, que es
 * la única puerta por la que la salida del modelo entra al sistema, y es ahí
 * donde el monto se lee. Tarifar en esta función obligaría a recorrer de nuevo
 * las líneas ya validadas para rellenarles un campo, y entonces existiría el
 * estado intermedio —una propuesta validada sin precio— que alguien podría
 * guardar.
 *
 * ## Por qué esto existe en vez de llamar a `proponer` desde la ruta
 *
 * Porque entre el catálogo y la petición hay **una correspondencia que se
 * puede romper**: el prompt tiene que nombrar los mismos trámites que
 * `tiposDeProcesoOfrecidos` declara. `encargoAlModelo` la hace imposible
 * devolviendo los dos juntos; esta función es la que se encarga de que los
 * dos lleguen juntos hasta `PeticionDeCompletado`, en una sola expresión y
 * sin pasar por ninguna variable intermedia que alguien pueda recomponer.
 *
 * Una ruta que armara la petición a mano tendría dos líneas que hay que
 * acordarse de mantener iguales, y es exactamente la clase de olvido que no
 * falla: el borrador sale, sin trámites, y al ganarse no abre ningún
 * proceso.
 *
 * ## El corpus
 *
 * Sigue sin existir (`docs/diseno.md` §11, punto 2). Cuando exista entra por
 * `antecedentes`, que `PeticionDeCompletado` ya tiene, y lo único que cambia
 * es una línea de acá. No se escribió un mecanismo de recuperación contra un
 * corpus que nadie definió: esa interfaz se tira.
 *
 * ## El techo de tokens
 *
 * No se toca: queda el del adaptador, que son dieciséis mil y están
 * argumentados ahí. Un techo propio acá sería un segundo lugar donde se
 * decide lo mismo, y el día que los dos no coincidan gana el que alguien
 * mire primero.
 */

import type { FallaDeValidacion, MotivoDeFalla } from "../contract";
import type { PropuestaDelModelo } from "./esquema";
import type { ModeloDeLenguaje, ResultadoDelModelo } from "./modelo";
import {
  encargoAlModelo,
  type ModuloOfrecido,
  type ServicioTarifado,
  type TramiteOfrecido,
} from "./prompt";

/* ==========================================================================
   La descripción
   ========================================================================== */

export type NormalizacionDeDescripcion =
  | { ok: true; descripcion: string }
  | { ok: false; fallas: FallaDeValidacion[] };

function falla(campo: string, motivo: MotivoDeFalla): FallaDeValidacion {
  return { campo, motivo };
}

function esObjeto(cuerpo: unknown): cuerpo is Record<string, unknown> {
  return typeof cuerpo === "object" && cuerpo !== null && !Array.isArray(cuerpo);
}

/**
 * De un cuerpo JSON cualquiera a la descripción del encargo, o a por qué no.
 *
 * Vive acá y no en `worker/cotizaciones/dominio.ts` porque es la entrada
 * **del generador**: qué cuenta como una descripción usable es una pregunta
 * de este módulo, y el dominio de la cotización no tiene ninguna columna que
 * la reciba — la prosa del abogado no se guarda en ningún lado, se convierte
 * en módulos y líneas y se termina.
 *
 * Se recorta **antes** de comprobar, por lo mismo que `normalizarModulo`: una
 * descripción de tres saltos de línea no describe ningún encargo. Y el valor
 * que se comprueba es el que se devuelve, así que no hay dos versiones del
 * texto ni una comprobación que mire una cosa y mande otra.
 *
 * **No hay tope de largo**, y vale decir por qué no: el techo real es el de
 * tokens del adaptador, que cubre entrada y salida y que ya tiene su motivo
 * —`respuesta_truncada`— con su frase. Un segundo tope acá, elegido a ojo,
 * rechazaría descripciones que el modelo habría procesado bien, y rechazaría
 * justo las largas, que son las que más caro cuesta reescribir.
 */
export function normalizarDescripcion(
  cuerpo: unknown,
): NormalizacionDeDescripcion {
  if (!esObjeto(cuerpo)) {
    return {
      ok: false,
      fallas: [falla("descripcion", "descripcion_requerida")],
    };
  }

  const crudo = cuerpo.descripcion;
  if (crudo === undefined || crudo === null) {
    return {
      ok: false,
      fallas: [falla("descripcion", "descripcion_requerida")],
    };
  }

  if (typeof crudo !== "string") {
    return { ok: false, fallas: [falla("descripcion", "tipo_invalido")] };
  }

  const descripcion = crudo.trim();
  if (descripcion === "") {
    return {
      ok: false,
      fallas: [falla("descripcion", "descripcion_requerida")],
    };
  }

  return { ok: true, descripcion };
}

/* ==========================================================================
   La propuesta
   ========================================================================== */

export interface PedidoDeGeneracion {
  /** Lo que el abogado escribió, ya recortado y no vacío. */
  readonly descripcion: string;
  /**
   * Las plantillas de módulo **activas** de este bufete, con su rótulo y su
   * descripción vigentes (T-4 de `odd/tasks/plantillas-de-modulo.md`).
   *
   * Vacío es válido y falla cerrada: el prompt lo dice y ningún módulo puede
   * pasar la validación, con lo que el modelo devuelve una propuesta de puras
   * líneas. Es el único de los tres catálogos cuyo vacío cambia la **forma**
   * de la propuesta y no sólo un campo de ella, y aun así es la respuesta
   * correcta — un bufete que dio de baja sus seis plantillas no tiene módulos
   * que ofrecer, y un módulo de un tipo inventado sería peor que ninguno.
   */
  readonly modulos: readonly ModuloOfrecido[];
  /** Los trámites de **este** bufete. Vacío es válido y falla cerrada. */
  readonly tramites: readonly TramiteOfrecido[];
  /**
   * Los servicios tarifados de **este** bufete, con su cifra. Vacío es válido
   * y falla cerrada: el prompt lo dice y ninguna línea puede nombrar un
   * servicio, con lo que el modelo tarifa todo como lo hacía antes de T-3.
   */
  readonly servicios: readonly ServicioTarifado[];
}

/**
 * La propuesta que el modelo hizo sobre ese encargo, ya validada, o la falla
 * con su motivo.
 *
 * **No tira**, por lo mismo que `proponer`: una falla del modelo es una
 * respuesta esperada y el tipo obliga a tratarla. Y no interpreta la falla:
 * los siete motivos de T-8 salen tal cual, porque quien los sabe traducir es
 * la pantalla y quien los sabe producir es la costura. Un `catch` o un mapeo
 * acá sería el lugar donde los cuatro motivos se aplastan en uno.
 */
export function generarPropuesta(
  modelo: ModeloDeLenguaje,
  pedido: PedidoDeGeneracion,
): Promise<ResultadoDelModelo<PropuestaDelModelo>> {
  const encargo = encargoAlModelo(
    pedido.modulos,
    pedido.tramites,
    pedido.servicios,
  );

  return modelo.proponer({
    instrucciones: encargo.instrucciones,
    entrada: pedido.descripcion,
    // Las claves de módulo que el texto nombró, del mismo objeto (T-4).
    // Omitir esta línea no dejaría «la validación un poco más laxa»: dejaría
    // **toda** propuesta con módulos rechazada, porque desde T-4 ésta es la
    // única lista contra la que el esquema puede cerrar los tipos de módulo.
    tiposDeModuloOfrecidos: encargo.tiposDeModuloOfrecidos,
    // Lo ofrecido en el texto y lo declarado como ofrecido, del mismo
    // objeto. Separar estas dos líneas es abrir el círculo de T-7 en
    // silencio: ver el encabezado de `worker/ia/prompt.ts`.
    tiposDeProcesoOfrecidos: encargo.tiposDeProcesoOfrecidos,
    // Y los precios, del mismo objeto y por la misma razón, que acá cuesta
    // más: de esta lista sale el monto de cada línea tarifada, así que un
    // camino que la recompusiera aparte podría guardar un número distinto del
    // que el prompt le mostró al modelo.
    serviciosOfrecidos: encargo.serviciosOfrecidos,
  });
}
