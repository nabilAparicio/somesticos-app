import { describe, expect, it } from "vitest";

// @ts-expect-error -- módulo de construcción en JS, sin tipos; es a propósito:
// vive en `scripts/` porque corre en Node durante el build, no en el Worker.
import { lecturaProhibida } from "../scripts/deteccion-artefacto.mjs";

/**
 * La compuerta que impide desplegar la vía de desarrollo.
 *
 * Una revisión marcó que la compuerta no tenía ninguna prueba de que
 * **fallara**. Una compuerta que nunca se ve fallar no es una compuerta: es
 * una línea en el `package.json` que todos suponen que funciona.
 *
 * Los casos de abajo son las formas reales en que una regresión podría
 * reintroducir la lectura. El patrón anterior, atado al identificador `env`,
 * dejaba pasar casi todas.
 */
describe("compuerta del artefacto", () => {
  it("deja pasar un artefacto donde la rama fue eliminada", () => {
    const limpio = `function correoDeDesarrollo(env) {\n\treturn null;\n}`;

    expect(lecturaProhibida(limpio)).toBeNull();
  });

  it("deja pasar un artefacto que solo la nombra en un comentario", () => {
    const soloComentario = `/* ACCESO_DEV_EMAIL no se lee acá */\nreturn null;`;

    expect(lecturaProhibida(soloComentario)).toBeNull();
  });

  const regresiones: [string, string][] = [
    ["lectura directa", `return env.ACCESO_DEV_EMAIL ?? null;`],
    ["binding renombrado por el empaquetador", `return a.ACCESO_DEV_EMAIL;`],
    ["acceso por corchetes", `return e["ACCESO_DEV_EMAIL"];`],
    ["desestructuración", `const { ACCESO_DEV_EMAIL } = n; return ACCESO_DEV_EMAIL;`],
    ["clave precalculada", `const k = "ACCESO_DEV_EMAIL"; return o[k];`],
  ];

  it.each(regresiones)("atrapa la regresión: %s", (_nombre, codigo) => {
    const hallazgo = lecturaProhibida(codigo) as { linea: number } | null;

    expect(hallazgo).not.toBeNull();
    expect(hallazgo?.linea).toBeGreaterThan(0);
  });
});
