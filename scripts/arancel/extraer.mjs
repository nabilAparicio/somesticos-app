/**
 * Saca el arancel de honorarios del PDF oficial y lo deja en
 * `scripts/arancel/arancel.json`.
 *
 * El PDF entra desde `docs/fuentes/`, dentro del repositorio, y no desde una
 * descarga ni un directorio temporal: una extracción que depende de un
 * archivo que no está versionado no es reproducible, y dentro de un año nadie
 * va a poder volver a correrla para auditar un monto. El acuerdo es de 2001 y
 * no se va a mover; pesa 135 kB.
 *
 * Esto es la cáscara de entrada/salida. Las decisiones de parseo —y son
 * muchas, porque la maqueta de 2001 no es una tabla de datos— viven en
 * `parseo.mjs`, que se prueba sin PDF en `test/arancel-api.spec.ts`.
 *
 * Se corre con `pnpm arancel:extraer`.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { contarArancel, extraerArancel } from "./parseo.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");

const PDF = join(RAIZ, "docs", "fuentes", "acuerdo-49-2001-tarifa-abogados.pdf");
const SALIDA = join(AQUI, "arancel.json");

const FUENTE = {
  acuerdo: "Acuerdo No 49 de 24 de abril de 2001",
  organo:
    "Sala Cuarta de Negocios Generales de la Corte Suprema de Justicia de Panamá",
  titulo:
    "Tarifa de Honorarios Profesionales Mínimos de los Abogados en la República de Panamá",
  aprobadaPor: "Asamblea General de Abogados de 19 de febrero de 2000",
  archivo: "docs/fuentes/acuerdo-49-2001-tarifa-abogados.pdf",
  advertencia:
    "Son honorarios mínimos de 2001 y nunca se indexaron. Sirven de preset; " +
    "lo que el bufete cobra es su propia columna.",
};

/**
 * El volcado del PDF con `pdftotext -layout`.
 *
 * `-layout` y no el modo corriente porque el acuerdo es una tabla de dos
 * columnas maquetada con espacios: el modo corriente las intercala y el monto
 * deja de poderse atribuir a su concepto. `-enc UTF-8` se pide explícito para
 * que los acentos de las categorías no dependan de la configuración regional
 * de quien corra el script.
 *
 * Si `pdftotext` no está instalado, esto **falla y no sigue**. La alternativa
 * —adivinar, o extraer la mitad— produciría un `arancel.json` corto que se
 * vería sano, y la siembra de T-2 lo cargaría sin que nadie note los
 * renglones que faltan. Un arancel incompleto es peor que ningún arancel.
 */
function volcarPdf() {
  try {
    return execFileSync(
      "pdftotext",
      ["-layout", "-enc", "UTF-8", PDF, "-"],
      { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
    );
  } catch (causa) {
    const falta = causa.code === "ENOENT";
    throw new Error(
      falta
        ? "No se encontró `pdftotext`. Es de poppler-utils: instalarlo con " +
          "`sudo pacman -S poppler` (Arch), `apt install poppler-utils` " +
          "(Debian/Ubuntu) o `brew install poppler` (macOS), y volver a " +
          "correr `pnpm arancel:extraer`. Sin él no hay extracción: no se " +
          "escribe un arancel parcial."
        : `\`pdftotext\` falló sobre ${FUENTE.archivo}: ${causa.message}`,
      { cause: causa },
    );
  }
}

const texto = volcarPdf();
const { registros, notas, sinClasificar } = extraerArancel(texto);
const conteo = contarArancel(registros);

const arancel = {
  fuente: FUENTE,
  conteo,
  sinClasificar,
  notas,
  registros,
};

mkdirSync(dirname(SALIDA), { recursive: true });
writeFileSync(SALIDA, `${JSON.stringify(arancel, null, 2)}\n`, "utf8");

// ---------------------------------------------------------------------------
// El conteo de control
// ---------------------------------------------------------------------------
//
// Se imprime siempre y no solo cuando algo falla, porque es la única forma de
// comparar la extracción contra el papel sin abrir el JSON de 400 renglones.
// Lo que el documento de la tajada estimó a ojo —358 montos, 54 reglas— eran
// greps sobre el volcado, no verdad; los números de abajo son los medidos.
console.log(`\n${FUENTE.acuerdo}  ·  ${FUENTE.archivo}\n`);
console.log(`  renglones          ${conteo.total}`);
console.log(`  con monto oficial  ${conteo.conMonto}`);
console.log(`  con regla oficial  ${conteo.conRegla}`);
console.log(`  rubros sin valor   ${conteo.rubros}`);
console.log(`  categorías         ${conteo.categorias}`);
console.log(`  notas del acuerdo  ${notas.length}\n`);

const ancho = Math.max(
  ...Object.keys(conteo.porCategoria).map((nombre) => nombre.length),
);
for (const [nombre, cuenta] of Object.entries(conteo.porCategoria)) {
  console.log(
    `  ${nombre.padEnd(ancho)}  ${String(cuenta.total).padStart(3)}` +
      `  monto ${String(cuenta.conMonto).padStart(3)}` +
      `  regla ${String(cuenta.conRegla).padStart(2)}` +
      `  rubro ${String(cuenta.rubros).padStart(2)}`,
  );
}

if (sinClasificar.length > 0) {
  console.error(
    `\n✗ ${sinClasificar.length} línea(s) del acuerdo no se pudieron atribuir ` +
      "a ningún renglón. No se adivinan y no se descartan: acá están.\n",
  );
  for (const { linea, texto: crudo } of sinClasificar) {
    console.error(`  ${String(linea).padStart(4)}  ${crudo.trim()}`);
  }
  console.error(
    "\n  Arreglar el parseo antes de sembrar: un arancel al que le falta un\n" +
      "  renglón se ve exactamente igual que uno completo.\n",
  );
  process.exit(1);
}

console.log(`✓ ${conteo.total} renglones escritos en scripts/arancel/arancel.json\n`);
