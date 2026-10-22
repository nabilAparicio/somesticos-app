import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      ".wrangler/**",
      "worker/worker-configuration.d.ts",
      // Artefactos de Playwright: salida de una corrida, no código fuente.
      "test-results/**",
      "playwright-report/**",
      ".playwright/**",
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [reactHooks.configs.flat["recommended-latest"]],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: ["worker/**/*.ts", "test/**/*.ts"],
    languageOptions: {
      globals: globals.worker,
    },
  },
  {
    // Las pruebas de Playwright corren en Node, pero los cuerpos de
    // `page.evaluate` se evalúan en el navegador: en un mismo archivo
    // conviven los dos juegos de globales.
    files: ["e2e/**/*.ts"],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
  {
    files: ["*.config.ts", "*.config.js", "scripts/**/*.mjs"],
    languageOptions: {
      globals: globals.node,
    },
  },
);
