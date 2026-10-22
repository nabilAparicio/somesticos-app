/**
 * Compuerta de artefacto: falla la construcción si la vía de desarrollo
 * sobrevive al empaquetado.
 *
 * La puerta de acceso deja entrar sin token cuando `ACCESO_DEV_EMAIL` está
 * puesta, y lo único que impide que eso llegue a producción es que el
 * empaquetador elimine la rama, porque la guarda es una constante de
 * compilación. Si mañana alguien la cambia por una lectura en tiempo de
 * ejecución, o se construye en el modo equivocado, las pruebas siguen verdes y
 * se despliega una entrada sin autenticar.
 *
 * Por eso esto cuelga de `build` y no de `test`: no se puede producir un
 * artefacto desplegable sin que pase. La detección vive en
 * `deteccion-artefacto.mjs` y la suite la ejerce en sus dos sentidos.
 */
import { readFile } from "node:fs/promises";

import { lecturaProhibida } from "./deteccion-artefacto.mjs";

const ARTEFACTO = "dist/app_cotizador/index.js";

const hallazgo = lecturaProhibida(await readFile(ARTEFACTO, "utf8"));

if (hallazgo !== null) {
  console.error(
    `\n✗ ${ARTEFACTO}:${hallazgo.linea} nombra ACCESO_DEV_EMAIL.\n\n` +
      "  La vía de desarrollo sobrevivió al empaquetado. El artefacto deja\n" +
      "  entrar sin token a quien tenga esa variable puesta. No se despliega.\n",
  );
  process.exit(1);
}

console.log(`✓ ${ARTEFACTO}: la vía de desarrollo no existe en el artefacto.`);
