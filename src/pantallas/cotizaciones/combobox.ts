/**
 * Lo que un combobox buscable decide, sin React y sin DOM (T-1 de
 * `odd/tasks/el-selector-de-cliente-busca.md`).
 *
 * ## Por qué este módulo existe
 *
 * La pantalla de cotización tiene **dos** controles de esta forma: el cliente,
 * arriba, y el servicio de cada línea. Las palabras del usuario que pidieron el
 * segundo y el primero son casi las mismas —«un dropdown con una barra de
 * búsqueda», «¿qué pasará cuando haya 100 clientes?»— y el documento de la
 * tajada es explícito sobre lo que no se acepta: **un segundo teclado escrito a
 * mano**.
 *
 * Así que la mecánica está una sola vez, en `./Combobox.tsx`, y las tres
 * decisiones que esa mecánica toma y que no necesitan un navegador están acá.
 * Es el mismo reparto que el resto de la carpeta: el `.tsx` cablea teclas, y
 * decidir cuál es la siguiente opción es decidir.
 *
 * ## Qué es «la mecánica» y qué no
 *
 * Lo que este módulo **no** sabe es de qué son las opciones. No importa
 * `Cliente` ni `ServicioOfrecible`, y no puede: lo que recorre es cualquier
 * cosa que tenga un identificador y un rótulo. Eso es lo que deja que el
 * selector de servicio siga mostrando un importe al lado de cada opción y el de
 * cliente no muestre ninguno, sin que ninguno de los dos vuelva a escribir una
 * flecha.
 *
 * Lo que queda **fuera** de acá y es de cada selector: los textos —el rótulo,
 * el marcador de posición, la ayuda, la frase de la lista vacía—, qué dibuja
 * cada opción adentro, y qué botón acompaña al campo. Ninguna de esas cosas es
 * mecánica; todas son del dominio, y mezclarlas acá habría convertido este
 * archivo en el registro de los dos selectores en vez de en la parte que
 * comparten.
 *
 * ## La relación con `serviciosQueCoinciden`
 *
 * `opcionesQueCoinciden` es la generalización de `serviciosQueCoinciden`
 * (`src/pantallas/catalogos/precios.ts`), y es la misma regla: comparar
 * `plano` contra `plano`, con la consulta vacía devolviendo todo. Aquélla sigue
 * existiendo porque la vista expandida —«Listar todos»— la usa con su propio
 * buscador, que no es un combobox y no pasa por acá.
 */

import { plano } from "../../formatos";

/**
 * Lo único que una opción tiene que tener para que este combobox la sirva.
 *
 * Es **estructural y no un tipo que nadie implemente**: `ServicioOfrecible` ya
 * tiene `id` y `rotulo`, así que entra sin un solo `as`, y las opciones de
 * cliente llegan de `clientesSeleccionables` con `nombre` y se renombran en una
 * línea del lado del selector. Pedir las dos propiedades que hacen falta —y no
 * un tipo propio del que los dos dominios tuvieran que heredar— es lo que
 * mantiene la flecha de importación en un solo sentido: este archivo no conoce
 * ni a los clientes ni al arancel.
 *
 * `rotulo` es **el nombre completo y buscable**, no el que se dibuja. Para un
 * servicio del acuerdo eso incluye el rubro que lo encabeza —«Inmigrantes ·
 * Visa de pensionado»—, porque buscar «inmigrantes» y no encontrar la visa
 * sería buscar en la mitad del nombre.
 */
export interface OpcionDelCombobox {
  readonly id: string;
  readonly rotulo: string;
}

/**
 * Las opciones que coinciden con `consulta`, **en el orden en que llegaron**.
 *
 * Tres reglas, y las tres importan:
 *
 *  - busca **en cualquier parte** del rótulo y no por prefijo. Es la razón
 *    entera por la que estos dos controles no son `<select>`: el teclado de un
 *    `<select>` nativo busca por el principio del texto de la opción, así que
 *    escribir «istmo» no encuentra «Inmobiliaria del Istmo» y escribir
 *    «pensionado» no encuentra «Inmigrantes · Visa de pensionado»;
 *  - compara `plano` contra `plano`, así que las tildes y las mayúsculas no
 *    cuentan de ninguno de los dos lados. Un apellido se teclea sin tilde y el
 *    acuerdo imprime rótulos en mayúsculas;
 *  - con la consulta vacía —o de solo espacios— devuelve **todo**. Filtrar por
 *    el nombre de lo que ya está elegido dejaría una sola opción justo cuando
 *    se abre el control para cambiarla.
 *
 * El orden no se recompone: lo decide quien arma la lista —el orden del acuerdo
 * para los servicios, el alfabético de `clientesSeleccionables` para los
 * clientes— y un buscador que reordenara por relevancia sería una segunda
 * opinión sobre eso.
 *
 * Devuelve una copia siempre. Esto es estado de React: devolver el mismo
 * arreglo invita a ordenarlo en el lugar, que es el cambio que no vuelve a
 * renderizar.
 */
export function opcionesQueCoinciden<T extends OpcionDelCombobox>(
  opciones: readonly T[],
  consulta: string,
): T[] {
  const buscado = plano(consulta.trim());
  if (buscado === "") return [...opciones];

  return opciones.filter((opcion) => plano(opcion.rotulo).includes(buscado));
}

/**
 * Qué opción queda activa al mover las flechas.
 *
 * Vivía en `./lineas.ts`, que es el módulo del editor de líneas, y se mudó acá
 * con la extracción del componente: lo que esta función decide no tiene nada
 * que ver con una línea de honorarios, y dejarla allá habría obligado al
 * selector de cliente a importar el módulo del dinero para poder mover una
 * flecha.
 *
 * Tres reglas, y las tres salen del patrón de combobox que el navegador no
 * regala:
 *
 *  - **sin opciones no hay activa**, y el resultado es `-1`. Es el caso de una
 *    búsqueda sin resultados, y sin esto `Enter` elegiría la opción número cero
 *    de una lista vacía;
 *  - **desde ninguna activa**, bajar lleva a la primera y subir a la última. Es
 *    lo que hace que abrir la lista y apretar ↑ sirva para algo. La misma rama
 *    atrapa un índice que quedó fuera de rango, que pasa de verdad: la lista se
 *    encoge al escribir una letra más mientras la activa era la última;
 *  - **da la vuelta en los dos extremos**. Una lista que se queda trabada en la
 *    última opción obliga a contar cuántas veces hay que subir.
 */
export function moverOpcionActiva(
  activa: number,
  cuantas: number,
  direccion: -1 | 1,
): number {
  if (cuantas === 0) return -1;
  if (activa < 0 || activa >= cuantas) return direccion === 1 ? 0 : cuantas - 1;

  return (activa + direccion + cuantas) % cuantas;
}

/**
 * Qué texto muestra el campo cuando ya hay algo elegido.
 *
 * Es la mitad de la corrección que el combobox trae sobre el `<select>`, y
 * conviene dejar escrito el defecto que reemplaza: un `<select>` controlado
 * cuyo valor no corresponde a ninguna opción **cae en la primera**, así que
 * dibujaba «Elegir cliente…» sobre una cotización que sí tenía cliente, y quien
 * leía eso podía elegir otro creyendo que confirmaba. En un combobox lo que se
 * ve es el texto del campo, y el texto lo escribe esto.
 *
 * Un identificador que la lista no trae deja el campo **vacío**, y es la
 * dirección segura: no hay de dónde sacar un nombre, y poner el identificador
 * crudo sería un UUID dentro de un campo de texto. Quien sí tiene de dónde
 * sacarlo no llama a esta función: el selector de servicio pasa su propio texto
 * —`textoDelServicioElegido`, que cae en el concepto que la lectura resolvió de
 * la línea— porque el bufete puede borrarle el precio a una regla por cuantía
 * que una línea ya nombraba. Para el cliente ese caso no existe:
 * `clientesSeleccionables` inyecta siempre el que la cotización tiene.
 */
export function rotuloDeLoElegido(
  opciones: readonly OpcionDelCombobox[],
  elegido: string,
): string {
  if (elegido === "") return "";

  return opciones.find((una) => una.id === elegido)?.rotulo ?? "";
}
