/**
 * **El interruptor del ITBMS**: la única puerta por la que el impuesto se
 * enciende (T-12). Puro: ni D1 ni HTTP.
 *
 * ## Qué hay acá y qué no, que es la parte que importa
 *
 * La **aritmética** del impuesto no está en este archivo: vive en
 * `./lineas.ts`, al lado de `totalesDe`, porque ese archivo dice de sí mismo
 * «la aritmética, acá y en ningún otro lado» y el ITBMS es aritmética de la
 * cotización como lo es la suma de los honorarios. Partirla en dos archivos
 * habría sido el primer paso hacia dos sitios que suman dinero.
 *
 * Lo que hay acá es lo **único** que `./lineas.ts` no puede tener: la lectura
 * del entorno. Ese archivo viaja al navegador —está listado en
 * `tsconfig.app.json` para que la pantalla comparta su catálogo de clases— y
 * la condición para estar en esa lista es no arrastrar servidor. Una variable
 * de entorno del Worker es servidor.
 *
 * Así que este módulo tiene **un solo trabajo**: contestar si el bufete
 * factura ITBMS hoy, mirando una variable. Tres constantes y una función.
 *
 * ## Por qué existe el interruptor
 *
 * La investigación está en `odd/tasks/cotizaciones.md`, fechada el 25 de
 * octubre de 2026, y **no es asesoría tributaria**. De sus tres puntos sólo
 * uno está apoyado en fuente primaria:
 *
 *  1. **La tarifa general es 7 %**, vigente desde el 1 de julio de 2010 por
 *     el artículo 76 de la Ley 8 de 2010. Confirmado contra la DGI, que es
 *     fuente primaria.
 *  2. **Los servicios profesionales están gravados al 7 %.** Fuentes
 *     secundarias coincidentes; la página de generalidades de la DGI no los
 *     nombra. Apoyado en terceros.
 *  3. **El reembolso de gastos no se grava.** También fuente secundaria, y es
 *     el punto que más necesita validación, porque es el que decide de qué
 *     lado del corte cae cada línea.
 *
 * De ahí el mandato que este archivo existe para cumplir:
 *
 * > Ninguna cotización emitida puede llevar un total con impuesto hasta que
 * > esto esté validado por la contadora del bufete.
 *
 * Lo que se construyó, entonces, es la cuenta entera **detrás de un
 * interruptor apagado**. No es una función a medias ni un `TODO`: está
 * completa, probada en sus dos posiciones, y lo único que falta es la firma
 * de alguien que sepa de impuestos. El día que llegue, encenderla es poner
 * una variable.
 *
 * ## La forma del interruptor: una variable de entorno opcional
 *
 * Es el precedente exacto de `IA_MODELO` y de `IA_PROVEEDOR`: declarada en
 * `worker/entorno.d.ts`, **ausente de `wrangler.jsonc`**, con el valor por
 * defecto en el código. Un despliegue que no la ponga sigue funcionando y
 * sigue sin cobrar impuesto, que es lo que hoy corresponde.
 *
 * **No es configuración por bufete**, y la razón es de alcance y no de
 * criterio: una columna por bufete pide una migración, y el día que el
 * sistema tenga más de un tenant esa migración va a hacer falta de verdad.
 * Hoy hay uno solo (`TENANT_UNICO_ID`), así que una variable dice lo mismo
 * sin inventar una tabla. Queda anotado para quien abra el segundo bufete.
 */

import type { RegimenDeImpuesto } from "./lineas";
import { CON_ITBMS, SIN_ITBMS } from "./lineas";

/**
 * El nombre de la variable que enciende el impuesto.
 *
 * Vive acá como constante y no suelta en una comparación por el motivo de
 * siempre: el nombre aparece en el código, en `worker/entorno.d.ts`, en las
 * pruebas y algún día en `wrangler.jsonc`. Cuatro sitios donde escribirlo mal
 * es cuatro sitios donde el interruptor no responde y nadie entiende por qué.
 */
export const VARIABLE_DEL_INTERRUPTOR = "ITBMS_ACTIVO";

/**
 * **La única cadena que enciende el impuesto.**
 *
 * `"true"`, `"1"`, `"SI"`, `" si "` y cualquier otra cosa lo dejan apagado.
 * No es rigidez: es que el estado seguro es apagado, y un interruptor que
 * adivina intenciones es el que se enciende solo. De esas cinco cadenas, sólo
 * una la tecleó alguien que sabía qué estaba habilitando; las otras cuatro
 * son el hábito de otro lenguaje, un dedo en mayúsculas o un espacio que
 * nadie ve en un panel de variables.
 *
 * Y el costo de equivocarse no es simétrico. Un interruptor tolerante que se
 * enciende de más manda al cliente una cotización con un impuesto que la
 * contadora no validó; uno estricto que se queda apagado produce, como mucho,
 * un rato de desconcierto para quien lo puso.
 */
export const ENCIENDE_EL_ITBMS = "si";

/**
 * Lo mínimo del entorno que hace falta para saber si el bufete grava.
 *
 * Estructural y no `Env` entero, por el mismo criterio que `LineaSumable` y
 * `CuotaAplicable`: así una prueba construye el caso con un campo en vez de
 * con quince.
 */
export interface EntornoDelImpuesto {
  readonly ITBMS_ACTIVO?: string;
}

/**
 * Lee el interruptor del entorno.
 *
 * **Sin recortar y sin bajar a minúsculas**, a propósito. Normalizar sería
 * hacer que `" SI "` encienda, y lo que se gana con eso —un tecleo
 * perdonado— es exactamente lo que no se quiere tener: cada forma distinta
 * que enciende es una forma más de encenderlo sin querer. La comparación es
 * por igualdad con `ENCIENDE_EL_ITBMS` y no hay segunda rama.
 *
 * Ausente, vacía o cualquier otra cosa: apagado. **La guarda de configuración
 * vive dentro de la operación**, que es la misma precedencia que eligieron
 * `autenticar` con `acceso_no_configurado` y la costura del modelo con
 * `modelo_no_configurado` — con la diferencia de que acá la falta de
 * configuración no es un error que haya que anunciar, sino el estado normal
 * del despliegue de hoy.
 */
export function regimenDelBufete(
  entorno: EntornoDelImpuesto,
): RegimenDeImpuesto {
  return entorno.ITBMS_ACTIVO === ENCIENDE_EL_ITBMS ? CON_ITBMS : SIN_ITBMS;
}
