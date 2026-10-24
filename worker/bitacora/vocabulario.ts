/**
 * El vocabulario cerrado de la bitácora (T-10).
 *
 * ## Por qué está en dos lugares, y por qué eso no es duplicación
 *
 * El vocabulario vive **a la vez** en un `CHECK` de
 * `migrations/0002_bitacora_inmutable.sql` y en las uniones de
 * `worker/contract.ts`. Las dos mitades hacen cosas distintas y ninguna
 * reemplaza a la otra:
 *
 *  - El **`CHECK`** es el que sobrevive al primer script de importación.
 *    `docs/diseno.md` §5 lo dice sin vueltas: una regla que solo vive en el
 *    código es la que ese script se salta. Y §6 ya fijó la forma — «no hay
 *    `ENUM` nativo; los valores cerrados se imponen con `CHECK`» — que es lo
 *    que T-2 hizo con `proceso.estado` y `proceso.origen`.
 *  - La **unión de TypeScript** es la que impide que el único camino de
 *    escritura emita una acción inventada, y la que deja que
 *    `src/bitacora.ts` exija una frase por acción con un `Record`
 *    exhaustivo, igual que `src/mensajes.ts` con los motivos de falla.
 *
 * El criterio del proyecto —catálogo en la base cuando es solo una etiqueta,
 * en código cuando hay código detrás del valor— apunta al código: detrás de
 * `etapa_alcanzada` hay código, porque es el único camino que la escribe y
 * hay una frase que la dibuja. Pero el criterio de §5 apunta a la base. No
 * se eligió uno: se pusieron los dos, y hay una prueba que falla si se
 * separan (`test/bitacora-api.spec.ts`, «el vocabulario de la base y el del
 * código dicen lo mismo»). Una tabla de catálogo editable, en cambio, sería
 * lo contrario de lo que esto necesita: agregar un verbo tiene que ser un
 * despliegue, porque sin su frase y sin el sitio que lo emite, el verbo no
 * significa nada.
 *
 * ## La granularidad
 *
 * **Eventos, no cambios campo por campo.** Una entrada dice «el 3 de marzo
 * Itzel movió este proceso a Demanda presentada»; no guarda valor anterior
 * ni posterior. Eso contesta el 95 % de los «¿quién hizo esto?» y deja la
 * puerta abierta a lo otro sin pagarlo hoy.
 *
 * ## Un hecho, una entidad
 *
 * Un proceso que nace para un cliente es un hecho **del proceso**, y se
 * registra una sola vez. Duplicarlo bajo el cliente haría que el 3 de marzo
 * apareciera dos veces y que nadie supiera cuál es el original.
 */

import type { AccionDeBitacora, EntidadRegistrada } from "../contract";

/**
 * Qué le puede pasar a cada entidad.
 *
 * `satisfies` y no una anotación: así las tuplas conservan sus literales y
 * `Evento` puede derivarse de acá, pero el compilador sigue exigiendo que
 * **toda** entidad del vocabulario tenga su lista. Agregar una entidad sin
 * decir qué le puede pasar no compila.
 */
export const ACCIONES_POR_ENTIDAD = {
  /* El alta y la edición de la ficha. Borrar un cliente no está en esta
     tajada, así que su verbo tampoco. */
  cliente: ["creado", "editado"],

  /* Los tres catálogos comparten los cuatro movimientos de T-6: se crean, se
     editan, se dan de baja —que es lo normal— y se borran cuando no tienen
     dependientes. `dado_de_baja` y `reactivado` son acciones propias y no
     `editado` con otro nombre: dejar de ofrecer un área es un hecho del
     bufete, y esconderlo adentro de «editó» lo vuelve invisible. */
  area: ["creado", "editado", "dado_de_baja", "reactivado", "borrado"],
  tipo_cliente: ["creado", "editado", "dado_de_baja", "reactivado", "borrado"],
  tipo_proceso: [
    "creado",
    "editado",
    "dado_de_baja",
    "reactivado",
    "borrado",
    /* Guardar la plantilla del tipo. No es `editado`: lo que cambió no es la
       ficha del tipo sino el plan con el que van a nacer los procesos
       siguientes. */
    "plantilla_editada",
  ],

  /* El proceso concentra su vida entera, incluidas las notas y los
     pendientes: cuelgan de él y no tienen pantalla propia, así que su hecho
     es un hecho del proceso. Es también lo que hace que el índice
     `(entidad, entidad_id, ocurrido_en)` conteste la pregunta de la
     pantalla con una sola consulta. */
  proceso: [
    "creado",
    /* T-14: el trámite terminó, y volvió a estar en curso. Van pelados —no
       `proceso_cerrado`— por la misma regla que `creado`: la entidad ya
       viaja en su columna y solo llevan prefijo los hechos de algo que
       cuelga del proceso. Y `reabierto` carga solo: al reabrir, la fila
       pierde su `cerrado_en`, así que esta entrada es lo único que queda
       de que aquel cierre existió. */
    "cerrado",
    "reabierto",
    "plan_editado",
    "etapa_alcanzada",
    "plantilla_guardada",
    "nota_agregada",
    "pendiente_abierto",
    "pendiente_cerrado",
  ],

  /* El alta y la edición del borrador (tajada 2, T-2). Emitir, ganar y
     perder son de T-4 y traen sus propios verbos; los de los módulos de
     prosa son de la unidad C de esta misma tarea. Ninguno entra antes de
     tener su sitio que lo emita y su frase, que es lo que un verbo del
     vocabulario significa.

     ## Por qué `creado` y `editado`, y no `creada` y `editada`

     La cotización es femenina y los catorce verbos existentes son
     masculinos, así que la pregunta se plantea sola. La respuesta es que
     **el género no está en juego**, y confundirlo rompería dos reglas que
     este vocabulario ya tenía escritas:

      - **Lo que se guarda es un verbo conjugado, no un adjetivo.** La frase
        de `src/bitacora.ts` para `creado` es «dio de alta» y para `editado`
        es «editó». Ninguna de las dos concuerda con nada: el sujeto es la
        persona y el objeto viaja en `detalle`. «Itzel dio de alta
        «COT-2026-0001»» ya está bien dicho, y `creada` tendría que mapear a
        esa misma frase.
      - **Dos acciones no se pueden leer igual.** El `Record` de frases lo
        exige con todas las letras: «dos acciones que se leen igual son dos
        acciones que no contestan ¿quién hizo esto?». `creada` junto a
        `creado` serían exactamente eso.

     Y hay un tercer motivo, el que decide: `AccionDeBitacora` es
     deliberadamente **independiente de la entidad** —«son verbos y no pares
     entidad+verbo porque la entidad ya viaja en su columna»—. Un verbo que
     cambia de forma según a qué entidad se le cuelga es un par entidad+verbo
     disfrazado, y por ese camino el vocabulario se multiplica por el número
     de entidades para decir lo mismo.

     ## Los cuatro verbos de módulo (unidad C)

     Los módulos de prosa **no son una entidad propia**: se leen dentro de la
     cotización, no tienen pantalla ni dirección propia, y por eso sus hechos
     son hechos de la cotización. Es exactamente lo que `nota_agregada` y
     `pendiente_abierto` hacen con el proceso, y por eso llevan prefijo: en
     este vocabulario van pelados los hechos propios de la entidad y
     prefijados los de lo que cuelga de ella.

     Son cuatro, uno por operación, porque las cuatro preguntas son
     distintas y la bitácora existe para contestarlas por separado. Lo que
     **no** hay es un verbo por módulo movido: reordenar es un hecho de la
     lista entera, y una entrada por fila convertiría una decisión en seis
     líneas de ruido. */
  cotizacion: [
    "creado",
    "editado",
    "modulo_agregado",
    "modulo_editado",
    "modulo_quitado",
    "modulos_reordenados",
  ],
} as const satisfies Record<EntidadRegistrada, readonly AccionDeBitacora[]>;

/**
 * Un hecho del sistema, listo para registrar.
 *
 * Es un tipo **distribuido** sobre la entidad, no un par de cadenas sueltas:
 * `{ entidad: "cliente", accion: "etapa_alcanzada" }` no compila. Sin eso, el
 * vocabulario estaría cerrado por columna y abierto por combinación, que es
 * donde las consultas vuelven a dejar de servir.
 *
 * `detalle` es opcional y corto, y es **el nombre de cara al usuario de lo
 * que el hecho señala**: el nombre del cliente, el del área, el título del
 * proceso, el de la etapa que se alcanzó. Nunca un diff, nunca un
 * identificador.
 */
export type Evento = {
  [E in EntidadRegistrada]: {
    entidad: E;
    entidadId: string;
    accion: (typeof ACCIONES_POR_ENTIDAD)[E][number];
    detalle?: string | null;
  };
}[EntidadRegistrada];

/** Las entidades del vocabulario, para comparar contra el `CHECK`. */
export const ENTIDADES_REGISTRADAS = Object.keys(
  ACCIONES_POR_ENTIDAD,
) as EntidadRegistrada[];

/**
 * Las acciones del vocabulario, en orden alfabético y sin repetidas.
 *
 * Se deriva de `ACCIONES_POR_ENTIDAD` en vez de escribirse de nuevo: una
 * segunda lista a mano es la que se desincroniza.
 */
export const ACCIONES_DE_BITACORA: readonly AccionDeBitacora[] = [
  ...new Set(
    Object.values(ACCIONES_POR_ENTIDAD).flatMap(
      (acciones) => acciones as readonly AccionDeBitacora[],
    ),
  ),
].sort();

/**
 * La red que impide que una acción del vocabulario quede sin dueño.
 *
 * Si alguien agrega un verbo a `AccionDeBitacora` y no se lo atribuye a
 * ninguna entidad, `Exclude<…>` deja de ser `never` y esto **no compila**.
 * Es el mismo mecanismo que el `Record<MotivoDeFalla, string>` de
 * `src/mensajes.ts`, aplicado en la otra dirección: allá se exige el texto,
 * acá se exige el dueño.
 */
export type AccionesSinDuenio = Exclude<
  AccionDeBitacora,
  (typeof ACCIONES_POR_ENTIDAD)[EntidadRegistrada][number]
>;

/**
 * El uso que hace valer la red de arriba.
 *
 * `AccionesSinDuenio` tiene que ser `never`; si deja de serlo, esta
 * asignación no compila y el `pnpm typecheck` señala la acción huérfana.
 */
export const TODAS_LAS_ACCIONES_TIENEN_DUENIO: AccionesSinDuenio[] = [];

/**
 * Qué acción nombra una edición de catálogo.
 *
 * Dar de baja y reactivar llegan por el mismo `PUT` que cualquier otra
 * edición —el formulario manda el juego completo, decisión de T-5—, así que
 * el verbo se decide mirando cómo quedó `activo` respecto de cómo estaba.
 *
 * Esto **no es guardar el valor anterior y el posterior**, que es
 * exactamente lo que la granularidad de T-10 descarta: el estado previo se
 * usa para elegir el nombre del hecho y se tira. Lo que queda escrito es un
 * verbo, no un diff.
 *
 * Y vale la distinción: si la baja se registrara como «editó», la pregunta
 * que el bufete va a hacer de verdad —«¿por qué desapareció Penal del
 * desplegable?»— no tendría respuesta en la bitácora.
 */
export function accionDeEdicion(
  activoAntes: boolean,
  activoDespues: boolean,
): "editado" | "dado_de_baja" | "reactivado" {
  if (activoAntes && !activoDespues) return "dado_de_baja";
  if (!activoAntes && activoDespues) return "reactivado";
  return "editado";
}
