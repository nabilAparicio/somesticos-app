/**
 * El encargo que se le hace al modelo: el prompt de T-9, y **la lista de
 * trámites que ese prompt ofreció**. Puro: ni D1, ni HTTP, ni entorno.
 *
 * Es la mitad de arriba de la costura de T-8. Aquella decidió que
 * `ModeloDeLenguaje` recibe `instrucciones` y `entrada` ya compuestas y que
 * **la costura no arma prompts**; esto es quien los arma.
 *
 * ## Las dos salidas son una sola, y eso es el archivo entero
 *
 * `encargoAlModelo` devuelve el texto **y** `tiposDeProcesoOfrecidos`, y no
 * hay forma de pedir uno sin el otro. La razón no es comodidad:
 *
 *  - El esquema de T-8 rechaza todo `tipoProcesoId` que quien llama no haya
 *    declarado haber ofrecido. Falla cerrada, porque `tipo_proceso` es una
 *    tabla de **este** bufete y no hay catálogo en código que la pueda
 *    cerrar.
 *  - Entonces un prompt que nombra tres trámites con una lista de ofrecidos
 *    que nombra dos produce un rechazo silencioso de la tercera línea; y una
 *    lista vacía con un prompt que los nombra todos produce un borrador
 *    generado **sin un solo trámite**.
 *  - Y un borrador sin trámites es un borrador que, al ganarse la cotización,
 *    **no abre ningún proceso**: el círculo que T-7 cerró —de cotización
 *    ganada a procesos reales— queda abierto por el lado del generador, y
 *    queda abierto en silencio, porque nada falla.
 *
 * Dos valores que se tienen que corresponder y se piden por separado son dos
 * valores que un día no se corresponden. Acá se construyen del mismo arreglo,
 * en la misma pasada, y la correspondencia no se puede romper sin editar
 * estas veinte líneas.
 *
 * ## Los catálogos salen de donde viven, y nunca se copian
 *
 * Los tipos de módulo salen de `CATALOGO_DE_MODULOS` y las clases de línea de
 * `CATALOGO_DE_CLASES`. Las claves de cada forma salen de `CLAVES_DE_MODULO`
 * y `CLAVES_DE_LINEA`, que son las mismas que el esquema comprueba. Una
 * segunda lista escrita a mano acá sería la que se desincroniza: el día que
 * alguien agregue un tipo de módulo, el prompt lo ofrecería o no según se
 * acuerde, y lo que se vería es «el generador nunca usa el módulo nuevo».
 *
 * ## Lo que este prompt NO intenta
 *
 * **No usa salida estructurada** (`output_config`). Existe, funciona y le
 * ahorraría reintentos al modelo, y aun así la barandilla no se apoya ahí:
 * una garantía que depende de que el proveedor coopere no es una garantía, y
 * la validación propia de `worker/ia/esquema.ts` es la que manda. Hay además
 * una razón mecánica que lo cierra del todo hoy: el adaptador manda
 * **exactamente cuatro claves** en el cuerpo y tiene una prueba que lo
 * afirma, precisamente porque en Opus 5 un parámetro de más devuelve 400.
 * Agregarlo es una decisión de `worker/ia/anthropic.ts`, con su prueba, y no
 * de este archivo.
 *
 * **No precarga un turno de asistente** con un `{`, que es el truco clásico
 * para forzar JSON: el prefill fue removido en Opus 5 y devuelve 400. Por eso
 * el prompt pide JSON pelado con todas las letras, y por eso el esquema
 * rechaza un bloque con cercas en vez de desenvolverlo — desenvolverlo
 * convertiría un defecto de este archivo en una rareza intermitente que
 * aparece una vez cada veinte.
 */

import { CATALOGO_DE_CLASES } from "../cotizaciones/lineas";
import { CATALOGO_DE_MODULOS } from "../cotizaciones/modulos";
import { CLAVES_DE_LINEA, CLAVES_DE_MODULO } from "./esquema";

/**
 * Un trámite que el bufete ofrece, tal como el prompt lo va a nombrar.
 *
 * Es estructural y no `TipoProceso` entero por lo mismo que `LineaSumable`
 * no es `LineaDeCotizacion`: lo que el prompt necesita son tres campos, y
 * una prueba que arme el caso con tres en vez de con seis es una prueba que
 * se lee. `area` es nullable porque `areaNombre` se resuelve en lectura y
 * puede faltar.
 */
export interface TramiteOfrecido {
  readonly id: string;
  readonly nombre: string;
  readonly area: string | null;
}

/**
 * El encargo completo: el texto, y qué trámites declara haber ofrecido.
 *
 * Los dos campos viajan juntos a `PeticionDeCompletado` y no se separan en
 * el camino. Ver el encabezado del archivo.
 */
export interface EncargoAlModelo {
  readonly instrucciones: string;
  readonly tiposDeProcesoOfrecidos: readonly string[];
}

/** Cómo se nombra un trámite dentro del prompt: con su área, si la tiene. */
function comoSeOfrece(tramite: TramiteOfrecido): string {
  const area = tramite.area === null ? "" : ` (${tramite.area})`;
  return `- ${tramite.id} · ${tramite.nombre}${area}`;
}

/**
 * El catálogo de trámites, dicho para el modelo.
 *
 * **Falla cerrada cuando está vacío**, y lo dice en vez de omitir la
 * sección: un prompt que simplemente no habla de trámites deja al modelo
 * libre de inventar un identificador, y entonces la propuesta entera se
 * rechaza por `tipo_de_proceso_no_ofrecido` sin que nadie entienda por qué.
 * Decirle que no hay ninguno es lo que hace que devuelva `null`, que es la
 * respuesta correcta para un bufete que todavía no cargó su catálogo.
 */
function catalogoDeTramites(tramites: readonly TramiteOfrecido[]): string {
  if (tramites.length === 0) {
    return (
      "Este bufete no tiene cargado ningún trámite todavía, así que **ningún" +
      " trámite** se puede nombrar: `tipoProcesoId` va en `null` en todas las" +
      " líneas, sin excepción."
    );
  }

  return (
    "Trámites que este bufete ofrece. `tipoProcesoId` sólo puede ser uno de" +
    " estos identificadores, copiado tal cual, o `null`:\n" +
    tramites.map(comoSeOfrece).join("\n")
  );
}

/**
 * El encargo, armado desde los catálogos reales del bufete.
 *
 * El texto está en segunda persona y en español neutro porque lo que produce
 * es prosa que va a leer un cliente panameño, y un prompt en inglés que pide
 * salida en español es un prompt que de vez en cuando contesta en inglés.
 */
export function encargoAlModelo(
  tramites: readonly TramiteOfrecido[],
): EncargoAlModelo {
  const tiposDeModulo = CATALOGO_DE_MODULOS.map(
    (entrada) => `- ${entrada.tipo} · ${entrada.rotulo}`,
  ).join("\n");

  const clasesDeLinea = CATALOGO_DE_CLASES.map(
    (entrada) => `- ${entrada.clase} · ${entrada.rotulo}`,
  ).join("\n");

  const instrucciones = [
    "Sos el asistente de cotizaciones de un bufete de abogados de Panamá.",
    "Recibís la descripción de un encargo en prosa y devolvés una propuesta" +
      " de cotización: los módulos de prosa que la componen y las líneas de" +
      " dinero que la cotizan.",

    "## Lo único que no se negocia",
    "**No sumás. Nunca.** No devuelvas totales, subtotales, impuestos ni" +
      " ningún número derivado de otros: el total lo calcula el sistema" +
      " sobre las líneas. Un campo `total`, `subtotal`, `itbms` o" +
      " `moneda` en cualquier nivel hace que la propuesta entera se" +
      " descarte y el abogado se quede sin borrador.",

    "## Qué devolver",
    "Un único objeto JSON con exactamente estas dos claves:" +
      " `modulos` y `lineas`. Ninguna más.",
    `Cada módulo lleva exactamente: ${CLAVES_DE_MODULO.join(", ")}.`,
    `Cada línea lleva exactamente: ${CLAVES_DE_LINEA.join(", ")}.`,

    "## Tipos de módulo",
    "`tipo` sólo puede ser uno de estos identificadores, copiado tal cual:\n" +
      tiposDeModulo,
    "Van en el orden en que se leen en la propuesta. No hace falta que estén" +
      " todos: una consulta simple no lleva antecedentes, y eso no es un" +
      " error. `contenido` es la prosa, escrita para el cliente, sin títulos" +
      " adentro: el rótulo lo pone el sistema.",

    "## Clases de línea",
    "`clase` sólo puede ser una de estas dos, copiada tal cual:\n" +
      clasesDeLinea,
    "`concepto` dice qué se cobra, en una línea. `monto` va en **centavos" +
      " enteros**: mil quinientos dólares son 150000. Nunca con punto" +
      " decimal, nunca como texto, nunca negativo. Un honorario es lo que" +
      " cobra el bufete; un gasto estimado es plata de terceros que el" +
      " bufete adelanta, y el cliente lo lee como aproximado.",

    `## ${tramites.length === 0 ? "Trámites" : "Trámites del bufete"}`,
    catalogoDeTramites(tramites),
    "Una línea con trámite es la que abre el expediente cuando el cliente" +
      " acepta, así que ponelo siempre que la línea corresponda a un trámite" +
      " de la lista. Una consulta, una mensajería o un gasto van con" +
      " `tipoProcesoId` en `null`, que es el caso corriente.",

    "## La forma de la respuesta",
    "Devolvé **únicamente el JSON, pelado**. Sin ``` alrededor, sin" +
      " `json` al principio, sin una frase antes ni después, sin comentarios" +
      " dentro. Cualquier carácter fuera del objeto hace que la respuesta se" +
      " descarte entera y no se intenta rescatar nada de ella.",
  ].join("\n\n");

  return {
    instrucciones,
    // Del mismo arreglo que acaba de armar el texto, en la misma llamada.
    // Ver el encabezado: separarlos es abrir el círculo de T-7 en silencio.
    tiposDeProcesoOfrecidos: tramites.map((tramite) => tramite.id),
  };
}
