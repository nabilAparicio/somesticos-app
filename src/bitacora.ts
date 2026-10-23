/**
 * La bitácora, dicha para quien está mirando la pantalla (T-10).
 *
 * El mapa vive en un módulo propio y no dentro de una pantalla por lo mismo
 * que `src/mensajes.ts`: el vocabulario de la bitácora es uno solo para todo
 * el sistema (`worker/contract.ts`), y `AccionDeBitacora` es exhaustivo. El
 * día que el Worker agregue una acción, este `Record` **deja de compilar**
 * hasta que alguien escriba cómo se dice. Esa es toda la gracia — que no se
 * pueda agregar un hecho sin su frase y descubrirlo en producción como una
 * línea en blanco en el único registro que existe para no mentir.
 *
 * Sin DOM y sin React: son funciones de datos a texto, y adentro de un
 * `.tsx` solo se pueden probar montando un navegador para leer lo que ya era
 * una cadena.
 */

import type { AccionDeBitacora, EntradaDeBitacora } from "../worker/contract";

/**
 * El verbo de cada acción, en tercera persona y en pasado.
 *
 * Son verbos y no frases completas porque el sujeto siempre es la persona y
 * el objeto siempre es `detalle`: «Itzel **avanzó a** «Demanda
 * presentada»». Escribir la frase entera por acción haría doce copias de la
 * misma plantilla, y la treceava saldría distinta.
 *
 * Cada verbo tiene que distinguirse de los demás: dos acciones que se leen
 * igual son dos acciones que no contestan «¿quién hizo esto?», y la
 * distinción que el vocabulario cerrado protege se perdería acá, en el
 * último metro.
 */
export const VERBOS_DE_BITACORA: Record<AccionDeBitacora, string> = {
  creado: "dio de alta",
  editado: "editó",
  dado_de_baja: "dio de baja",
  reactivado: "reactivó",
  borrado: "borró",
  plantilla_editada: "guardó la plantilla",
  plan_editado: "editó el plan",
  etapa_alcanzada: "avanzó a",
  plantilla_guardada: "guardó el plan como la plantilla de",
  nota_agregada: "anotó en",
  pendiente_abierto: "abrió el pendiente",
  pendiente_cerrado: "cerró el pendiente",
};

/**
 * Cómo se nombra a quien no se pudo resolver.
 *
 * `usuarioNombre` llega nulo si la fila de `usuario` cruzara la frontera del
 * tenant. Un hueco en blanco en un registro de auditoría se lee como si no
 * hubiera autor, y sí lo hay: la columna es `NOT NULL` (I-6).
 */
const AUTOR_SIN_NOMBRE = "Alguien del bufete";

/**
 * Un hecho, en una línea: quién, qué y sobre qué.
 *
 * Es exactamente la granularidad que pidió el usuario —«el 3 de marzo Itzel
 * movió este proceso a Demanda presentada»—. Sin valor anterior ni
 * posterior: un evento, no un diff. El momento no entra en la frase porque
 * la pantalla lo dibuja aparte, alineado, que es como se lee una historia.
 */
export function fraseDeBitacora(entrada: EntradaDeBitacora): string {
  const quien = entrada.usuarioNombre ?? AUTOR_SIN_NOMBRE;
  const verbo = VERBOS_DE_BITACORA[entrada.accion];

  return entrada.detalle === null
    ? `${quien} ${verbo}.`
    : `${quien} ${verbo} «${entrada.detalle}».`;
}

/** Cuántos hechos hay, dicho para una persona. */
export function resumenDeLaBitacora(
  entradas: readonly EntradaDeBitacora[],
): string {
  if (entradas.length === 0) return "Todavía no hay nada registrado.";
  if (entradas.length === 1) return "1 hecho registrado.";

  return `${String(entradas.length)} hechos registrados.`;
}

/**
 * Lo que hay que decir para que una bitácora corta no se lea como «acá no
 * pasó nada».
 *
 * **No hubo relleno retroactivo.** Lo que ocurrió antes de que existiera
 * este registro no está, y no se inventó: escribir hechos que nadie
 * presenció, en la única tabla del sistema que existe para no mentir, sería
 * peor que no tenerla. Se dice en vez de disimularse.
 *
 * Vive acá, como constante exportada, para que su contenido se pueda
 * afirmar en una prueba en vez de quedar enterrado en un `.tsx`. Es la misma
 * decisión que `AVISO_NOTA_INMUTABLE` en T-8.
 */
export const AVISO_BITACORA_SIN_RELLENO =
  "La bitácora empieza el día que se encendió: lo que pasó antes no está" +
  " acá, y no se rellenó con suposiciones. De acá en adelante, cada cosa" +
  " que alguien haga queda firmada con quién y cuándo.";
