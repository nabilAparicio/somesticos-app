/**
 * Detecta si la vía de desarrollo sobrevivió al empaquetado.
 *
 * Vive aparte del script de línea de comandos por una razón que una revisión
 * señaló: una compuerta que nunca se ejerce no prueba nada. Separada y pura,
 * se puede probar en los dos sentidos desde la suite.
 *
 * **Por qué busca el nombre y no una expresión de lectura.** La versión
 * anterior buscaba `env.ACCESO_DEV_EMAIL`, atándose al identificador `env`,
 * que es un parámetro local y el empaquetador puede renombrar a `e` o `a`.
 * Peor: `const { ACCESO_DEV_EMAIL } = env`, `env["ACCESO_" + "DEV_EMAIL"]` o
 * una clave precalculada producen una lectura viva que ese patrón no ve, y la
 * compuerta daba verde. Lo que no puede renombrarse es **el nombre del
 * binding**: para leerlo hay que nombrarlo. Por eso la regla es que el
 * identificador no aparezca en absoluto fuera de los comentarios.
 */

const NOMBRE_PROHIBIDO = /ACCESO_DEV_EMAIL/;

/** Quita comentarios de bloque y de línea, que sí pueden nombrar la variable. */
export function sinComentarios(codigo) {
  return codigo
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[^\n"'`]*?\/\/.*$/gm, "");
}

/**
 * @returns `null` si el artefacto está limpio; si no, en qué línea aparece.
 */
export function lecturaProhibida(codigo) {
  const limpio = sinComentarios(codigo);
  const coincidencia = NOMBRE_PROHIBIDO.exec(limpio);

  if (coincidencia === null) return null;

  return { linea: limpio.slice(0, coincidencia.index).split("\n").length };
}
