/**
 * La medición del criterio responsivo de T-4, compartida por las pruebas de
 * punta a punta.
 *
 * Vivía dentro de `sin-scroll-horizontal.spec.ts` y se mudó acá en T-6,
 * cuando apareció la segunda pantalla que hay que medir igual. Dos copias de
 * esta función serían dos definiciones de «la página no scrollea», y la que
 * se relaje primero deja de avisar sin que nadie lo note.
 *
 * No es un archivo `.spec.ts`, así que Playwright no lo recoge como suite.
 */
import type { Page } from "@playwright/test";

export type Desborde = {
  readonly scrollWidth: number;
  readonly clientWidth: number;
  readonly culpables: readonly string[];
};

/**
 * Además de la medición del criterio, devuelve qué elementos se salen del
 * ancho del documento. Sin eso, una falla dice "1347 > 320" y deja al
 * siguiente buscando a mano cuál de doscientos nodos fue.
 */
export async function medirDesborde(page: Page): Promise<Desborde> {
  return page.evaluate(() => {
    const raiz = document.documentElement;
    const limite = raiz.clientWidth;

    const culpables: string[] = [];
    for (const elemento of Array.from(document.body.querySelectorAll("*"))) {
      const caja = elemento.getBoundingClientRect();
      if (caja.width === 0 && caja.height === 0) continue;
      if (caja.right <= limite + 0.5 && caja.left >= -0.5) continue;

      const clases =
        typeof elemento.className === "string" && elemento.className !== ""
          ? `.${elemento.className.trim().split(/\s+/).join(".")}`
          : "";
      culpables.push(
        `${elemento.tagName.toLowerCase()}${clases} ` +
          `[left=${String(Math.round(caja.left))} right=${String(Math.round(caja.right))}]`,
      );
      if (culpables.length === 8) break;
    }

    return {
      scrollWidth: raiz.scrollWidth,
      clientWidth: limite,
      culpables,
    };
  });
}

/** El mensaje de una falla de desborde, con los culpables adentro. */
export function porQueSeSale(ancho: number, desborde: Desborde): string {
  return (
    `el documento se sale a ${String(ancho)}px. Se salen del ancho: ` +
    (desborde.culpables.length > 0
      ? desborde.culpables.join(" | ")
      : "(ninguno medible)")
  );
}
