/**
 * La costura con el modelo (`docs/diseno.md` §8, «La costura»).
 *
 * > El acceso al modelo pasa por **una sola interfaz** con una única operación
 * > de completado. El proveedor se resuelve por configuración y la salida se
 * > valida contra esquema antes de tocar nada. Nada del resto del sistema sabe
 * > que existe un LLM.
 *
 * Este archivo es esa interfaz. Lo que entra es prosa; lo que sale es una
 * `PropuestaDelModelo` ya validada o una falla con su motivo. No hay `fetch`
 * acá, no hay nombre de proveedor en ninguna firma y no hay una sola cadena de
 * la API de nadie: eso vive en `worker/ia/anthropic.ts`, que es sustituible
 * sin que nada de lo de arriba se entere.
 *
 * ## La operación es `proponer` y no `completar`, y la diferencia es la tarea
 *
 * Una operación que devolviera el texto del modelo dejaría la validación del
 * lado de quien llama, y entonces la barandilla sería una disciplina: T-9
 * tendría que acordarse de validar, y el día que no se acuerde nadie se
 * entera. El encargo de T-8 es que sea **imposible y no improbable**, así que
 * la única operación devuelve lo ya validado y **el texto crudo no sale de
 * acá**. Sigue siendo una sola operación de completado; lo que cambia es que
 * su tipo de retorno no deja pasar nada sin esquema.
 *
 * ## El corpus, y por qué agregarlo no va a obligar a rehacer esto
 *
 * El corpus de cotizaciones previas es una decisión abierta del bufete
 * (`docs/diseno.md` §11, punto 2) y no existe todavía. La decisión que se toma
 * acá es que **la costura no arma prompts**: recibe `instrucciones` y
 * `entrada` ya compuestas, y `antecedentes` como material de referencia ya
 * renderizado. Quien compone es T-9.
 *
 * Con eso, las dos formas que §8 deja abiertas caen fuera de esta interfaz:
 *
 *  - **Catálogo sembrado de servicios y honorarios típicos** — cambia los
 *    catálogos y las tablas, que la costura no conoce; lo único que llega acá
 *    es que el prompt de T-9 nombra más cosas.
 *  - **Ejemplos en el prompt** — se renderizan y entran por `antecedentes`,
 *    que ya existe.
 *  - **Ambas** — las dos anteriores a la vez, sin un tercer caso.
 *
 * `antecedentes` es un arreglo y no un pegote dentro de `instrucciones` por
 * una razón concreta del transporte: viajan como bloques de sistema separados,
 * que es la forma en que un día se pueden cachear o recortar sin tocar las
 * instrucciones. Un pegote obliga a volver a separarlos para eso.
 *
 * Lo que **no** se construyó es una fuente de antecedentes con su mecanismo de
 * búsqueda. No hay corpus que buscar, y una interfaz de recuperación escrita
 * contra un corpus que nadie definió es una interfaz que se tira.
 */

import type { MotivoDeFallaDelModelo } from "../contract";
import type {
  PropuestaDelModelo,
  RechazoDeSalida,
  ServicioOfrecido,
} from "./esquema";
import { proveedorAnthropic } from "./anthropic";

/* ==========================================================================
   Lo que entra
   ========================================================================== */

export interface PeticionDeCompletado {
  /** El encargo al modelo. Lo compone T-9; acá viaja tal cual. */
  readonly instrucciones: string;

  /** Lo que el abogado escribió. El turno del usuario. */
  readonly entrada: string;

  /**
   * Material de referencia ya renderizado: el punto de enchufe del corpus.
   * Viaja como bloques de sistema aparte de las instrucciones.
   */
  readonly antecedentes?: readonly string[];

  /**
   * Las claves de `modulo_plantilla` que el prompt le ofreció al modelo (T-4
   * de `odd/tasks/plantillas-de-modulo.md`).
   *
   * Sin esto, ningún módulo puede pasar. **Falla cerrada igual que los otros
   * dos catálogos**, y la novedad frente a ellos es que acá sí hay un catálogo
   * en código —el `CHECK` de `0004` y `TIPOS_DE_MODULO`— que dice qué claves
   * son *válidas*: lo que no puede decir es cuáles el bufete tiene *activas*,
   * porque eso es una columna de una fila que el abogado edita desde
   * `/catalogos/modulos`. Una plantilla dada de baja es una clave válida que el
   * prompt no ofreció.
   */
  readonly tiposDeModuloOfrecidos?: readonly string[];

  /**
   * Los `tipo_proceso.id` que el prompt le ofreció al modelo.
   *
   * Sin esto, ninguna línea puede traer trámite: un identificador que el
   * modelo compuso solo es un dato inventado, y no hay catálogo en código que
   * lo pueda cerrar porque la tabla es de este bufete. Falla cerrada, igual
   * que `acceso_no_configurado`.
   */
  readonly tiposDeProcesoOfrecidos?: readonly string[];

  /**
   * Los servicios tarifados que el prompt le ofreció al modelo, **con su
   * precio** (T-3 de `odd/tasks/precios-en-la-cotizacion.md`).
   *
   * Falla cerrada igual que el campo de arriba, y por el mismo motivo:
   * `arancel_renglon` es una tabla de este bufete y no hay catálogo en código
   * que la pueda cerrar. Lo que esta lista agrega es que **de acá sale el
   * monto** de toda línea que nombre un servicio: el modelo elige qué servicio
   * aplica y el sistema le pone el precio, así que una petición sin esta lista
   * no tarifa nada, no es que tarife mal.
   *
   * Viaja junto con las instrucciones y no en otra llamada, porque el precio
   * que el prompt imprimió y el que el sistema guarda tienen que ser el mismo
   * número. Ver el encabezado de `worker/ia/prompt.ts`.
   */
  readonly serviciosOfrecidos?: readonly ServicioOfrecido[];

  /** Techo de tokens de salida. Sin esto, el del adaptador. */
  readonly maximoDeTokens?: number;
}

/* ==========================================================================
   Lo que sale cuando algo no se pudo
   ========================================================================== */

/**
 * Por qué no se pudo. **Vive en `worker/contract.ts` desde T-9**, y se
 * reexporta acá para que la costura siga siendo el único archivo que el
 * resto del Worker mira.
 *
 * Se mudó porque dejó de ser interno: T-9 lo hace **viajar por el cable** en
 * el cuerpo de un 502, y lo que viaja por el cable vive en el contrato — es
 * la misma frontera por la que `MotivoDeFalla` nunca estuvo acá. Dejar la
 * unión en este archivo habría obligado a declarar una paralela del otro
 * lado, y dos uniones paralelas son dos vocabularios que un día dicen cosas
 * distintas; o a listar `worker/ia/modelo.ts` en `tsconfig.app.json`, que se
 * llevaría `anthropic.ts` al bundle del navegador por una importación en
 * tiempo de ejecución.
 *
 * Los siete siguen significando lo mismo y cada uno conserva su comentario
 * allá, al lado de la decisión que esta separación existe para sostener:
 * **que la distinción llegue hasta quien la necesita**.
 */
export type { MotivoDeFallaDelModelo } from "../contract";

export interface FallaDelModelo {
  motivo: MotivoDeFallaDelModelo;
  /** Para el operador, no para el cliente. Nunca lleva la clave. */
  detalle: string;
  /** Sólo en `salida_rechazada`: qué rechazó el esquema y dónde. */
  rechazos?: readonly RechazoDeSalida[];
}

/**
 * No se usan excepciones, por lo mismo que `Resultado` en
 * `worker/acceso/rechazo.ts`: una falla del modelo es una respuesta esperada y
 * el tipo obliga a tratarla en cada llamada.
 */
export type ResultadoDelModelo<T> =
  | { ok: true; valor: T }
  | { ok: false; falla: FallaDelModelo };

export function fallar<T>(
  motivo: MotivoDeFallaDelModelo,
  detalle: string,
  rechazos?: readonly RechazoDeSalida[],
): ResultadoDelModelo<T> {
  return {
    ok: false,
    falla: rechazos === undefined ? { motivo, detalle } : { motivo, detalle, rechazos },
  };
}

/* ==========================================================================
   La interfaz. Es toda la superficie que el resto del sistema ve.
   ========================================================================== */

export interface ModeloDeLenguaje {
  proponer(
    peticion: PeticionDeCompletado,
  ): Promise<ResultadoDelModelo<PropuestaDelModelo>>;
}

/* ==========================================================================
   El transporte, que es lo único que las pruebas sustituyen
   ========================================================================== */

/**
 * Cómo se hace el pedido HTTP. Existe como parámetro **por lo mismo que
 * `Pedir` en `worker/acceso/claves.ts`**: para que las pruebas puedan ejercer
 * las ramas del adaptador —el 500, el cuerpo sin texto, el corte por tokens—
 * que de otro modo corren sólo desplegadas y sin que nada las toque.
 *
 * **No es una costura de validación.** El esquema se aplica igual con
 * transporte real que con transporte falso, porque está por encima de los dos.
 * Y el camino que corre en producción es el mismo: la única diferencia es que
 * el valor por defecto es `fetch`.
 */
export type Pedir = (
  url: string,
  init: RequestInit,
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export interface DependenciasDelModelo {
  pedir?: Pedir;
}

/* ==========================================================================
   El proveedor por configuración
   ========================================================================== */

export type FabricaDeProveedor = (
  env: Env,
  dependencias: DependenciasDelModelo,
) => ModeloDeLenguaje;

/**
 * Los proveedores implementados, por nombre.
 *
 * Hay uno. El registro existe igual porque §8 pide que el proveedor se
 * resuelva por configuración, y porque la alternativa —leer `IA_PROVEEDOR` y
 * ramificar con un `if` en el sitio de uso— es la que mañana tiene tres `if`
 * en tres sitios. Agregar uno es una entrada acá y un archivo al lado de
 * `anthropic.ts`; nada de lo de arriba cambia.
 */
export const PROVEEDORES: Record<string, FabricaDeProveedor> = {
  anthropic: (env, dependencias) => proveedorAnthropic(env, dependencias.pedir),
};

export const PROVEEDOR_POR_DEFECTO = "anthropic";

/**
 * El modelo que el sistema usa, resuelto desde el entorno.
 *
 * **No tira y no devuelve un `Resultado`**: un proveedor mal configurado
 * produce un `ModeloDeLenguaje` que falla con `proveedor_desconocido` en
 * cuanto se lo usa. Es la misma precedencia que eligió `autenticar`: la guarda
 * de configuración vive **dentro** de la operación, para que haya un solo
 * lugar donde tratarla y para que el armado de dependencias de una petición no
 * tenga que saber distinguir un despliegue a medias de un pedido mal hecho.
 */
export function modeloDesdeEntorno(
  env: Env,
  dependencias: DependenciasDelModelo = {},
): ModeloDeLenguaje {
  const nombre = env.IA_PROVEEDOR?.trim() ?? "";
  const elegido = nombre === "" ? PROVEEDOR_POR_DEFECTO : nombre;
  const fabrica = PROVEEDORES[elegido];

  if (fabrica === undefined) {
    return {
      proponer: () =>
        Promise.resolve(
          fallar(
            "proveedor_desconocido",
            `IA_PROVEEDOR nombra «${elegido}», que no está implementado`,
          ),
        ),
    };
  }

  return fabrica(env, dependencias);
}
