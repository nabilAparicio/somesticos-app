/**
 * Siembra el arancel de honorarios en D1 desde
 * `scripts/arancel/arancel.json`.
 *
 * Se corre con `pnpm arancel:sembrar` (local) o
 * `pnpm arancel:sembrar -- --remote` (la base desplegada). Escribe por
 * `wrangler d1 execute`, que es el único camino que no exige una credencial
 * propia ni un cliente de D1 en Node.
 *
 * La migración `0012_arancel_de_honorarios.sql` crea las tablas y **no
 * siembra ninguna fila**, a propósito: 453 `INSERT` dentro del esquema serían
 * 140 kB de datos sin forma de volver a correrlos cuando la extracción
 * mejore, y sin el control de divergencia que esto sí hace.
 *
 * ## Idempotente, y cómo
 *
 * `INSERT … ON CONFLICT (tenant_id, orden) DO NOTHING`. Eso es toda la
 * historia, y las dos propiedades que se piden salen de ahí:
 *
 *  - **Correrlo dos veces deja la base idéntica.** La segunda corrida choca
 *    con `arancel_renglon_orden_unico` en los 453 renglones y con
 *    `arancel_nota_orden_unico` en las 57 notas, y `DO NOTHING` las descarta.
 *  - **Nunca pisa un `monto` que el bufete ya puso.** No porque se tenga
 *    cuidado, sino porque **no hay `DO UPDATE`**: la sentencia no tiene por
 *    dónde escribir sobre una fila existente. Un `DO UPDATE SET monto_oficial
 *    = excluded.monto_oficial` —que es lo que uno escribe sin pensar para que
 *    la siembra «refresque»— además moriría en el disparador
 *    `arancel_renglon_citado_no_se_edita`, y con razón.
 *
 * ## Qué pasa si `arancel.json` cambia después de que las filas existen
 *
 * Esto es la parte que importa y la que una siembra ingenua resuelve mal.
 * Con `DO NOTHING`, un renglón ya sembrado cuyo monto cambió en la extracción
 * **se queda como está**, y la corrida terminaría diciendo «✓ 453 renglones»
 * como si todo estuviera al día. Es decir: la mejora de la extracción no se
 * aplicaría, y nadie se enteraría.
 *
 * Así que no se calla. Antes de escribir nada, la siembra **lee lo que hay y
 * lo compara campo por campo** contra el JSON. Si algún renglón ya guardado
 * difiere en cualquiera de los siete campos citados, imprime cuáles y **sale
 * con código 1 sin escribir una sola fila**. Y es lo correcto, no una
 * limitación: cambiar una cita ya guardada no es tarea de un script de
 * siembra, porque de esa cita pueden colgar precios que el bufete puso
 * mirándola. La salida es una migración que decida qué hacer con cada
 * renglón afectado —o `activo = 0` sobre el viejo y un renglón nuevo— y eso
 * es una decisión, no un `UPDATE`.
 *
 * ## Por qué esto no tiene prueba unitaria
 *
 * El suite corre en el runtime de Workers (`@cloudflare/vitest-plugin`) y
 * `wrangler.jsonc` no lleva `nodejs_compat`, así que un `import` de este
 * archivo —que usa `node:fs` y `node:child_process`— no resuelve ahí. Lo que
 * sí está probado es la red de abajo, que es la que importa: el disparador
 * que hace imposible que una cita se reescriba, en
 * `test/arancel-rutas.spec.ts`. La idempotencia se verifica corriendo la
 * siembra dos veces y comparando el conteo, que es lo que el registro de la
 * tarea deja anotado.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");

const ENTRADA = join(AQUI, "arancel.json");

/**
 * El bufete único, copiado de `worker/db/ids.ts`.
 *
 * Se copia y no se importa porque este script corre en Node y aquél es un
 * módulo de TypeScript del Worker. La copia tiene una red: la comprobación de
 * más abajo lee el valor de ese archivo y falla si los dos se separaron, que
 * es la misma forma en que el proyecto cuida el vocabulario de la bitácora.
 */
const TENANT_ID = "ead2d071-2ff7-4461-bf95-941c1e90d6d8";

/** Los siete campos que el Acuerdo imprime y que nadie puede editar. */
const CAMPOS_CITADOS = [
  "categoria",
  "numeral",
  "concepto",
  "clase",
  "montoOficial",
  "reglaOficial",
];

const REMOTO = process.argv.includes("--remote");

/**
 * Que la copia del identificador del bufete no se haya separado del original.
 *
 * Sin esto, un cambio en `worker/db/ids.ts` dejaría la siembra escribiendo en
 * un tenant que no existe: la llave foránea a `tenant` lo rechazaría con un
 * error de SQL crudo sobre 453 filas, y el motivo real —dos constantes
 * distintas— no aparecería en ninguna parte del mensaje.
 */
function verificarTenant() {
  const fuente = readFileSync(join(RAIZ, "worker", "db", "ids.ts"), "utf8");
  const hallazgo = /TENANT_UNICO_ID = "([0-9a-f-]+)"/.exec(fuente);

  if (hallazgo === null) {
    throw new Error(
      "No se pudo leer `TENANT_UNICO_ID` de `worker/db/ids.ts`. Si la " +
        "constante se renombró, hay que actualizar esta comprobación antes " +
        "de sembrar.",
    );
  }

  if (hallazgo[1] !== TENANT_ID) {
    throw new Error(
      `El tenant de este script (${TENANT_ID}) no es el de ` +
        `worker/db/ids.ts (${hallazgo[1]}). Se separaron: hay que igualarlos ` +
        "antes de sembrar, o la siembra escribe en un bufete inexistente.",
    );
  }
}

/** Una cadena como literal de SQL, con las comillas simples duplicadas. */
function texto(valor) {
  return `'${String(valor).replaceAll("'", "''")}'`;
}

/** Un entero, o `NULL`. Nunca una coma flotante: son centavos enteros. */
function entero(valor) {
  if (valor === null || valor === undefined) return "NULL";

  if (!Number.isInteger(valor)) {
    throw new Error(
      `${String(valor)} no es un entero. Los montos del arancel son ` +
        "centavos enteros y la columna tiene `typeof(x) = 'integer'`: un " +
        "real entraría acá y moriría en la base, 453 filas más tarde.",
    );
  }

  return String(valor);
}

/**
 * El identificador de un renglón, **derivado y no aleatorio**.
 *
 * `arancel-r-<orden>` en vez de un UUID, y es una decisión con dos motivos:
 *
 *  1. **La siembra queda reproducible.** Correrla sobre dos bases distintas
 *     —la local y la desplegada— produce los mismos identificadores, así que
 *     una captura de pantalla, un enlace o un renglón citado en un informe
 *     significan lo mismo en las dos. Con UUID aleatorios, el renglón 149 del
 *     acuerdo tendría dos nombres y la lectura 1 de `lecturas.md`, que lo
 *     cita por `orden`, no se podría seguir hasta una fila.
 *  2. **Hace el `DO NOTHING` obvio.** El identificador y la clave única
 *     dicen lo mismo, así que una segunda corrida choca por las dos vías y no
 *     hay forma de que inserte un duplicado con otro `id`.
 *
 * Lo que esto **no** es: un identificador con significado de negocio. Nada
 * lo parsea; `orden` ya está en su columna.
 */
function idDeRenglon(orden) {
  return `arancel-r-${String(orden).padStart(3, "0")}`;
}

function idDeNota(orden) {
  return `arancel-n-${String(orden).padStart(3, "0")}`;
}

/**
 * Corre SQL por `wrangler d1 execute` y devuelve las filas, si pidió alguna.
 *
 * `--json` para poder leer el resultado; `--local` o `--remote` explícito
 * porque el valor por defecto de wrangler cambió entre versiones y una
 * siembra que escribe en la base equivocada es el peor error posible de este
 * script.
 */
function ejecutar(sql, { leer = false } = {}) {
  const argumentos = [
    "d1",
    "execute",
    "app-cotizador",
    REMOTO ? "--remote" : "--local",
    "--command",
    sql,
  ];

  if (leer) argumentos.push("--json");

  const salida = execFileSync("pnpm", ["exec", "wrangler", ...argumentos], {
    cwd: RAIZ,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });

  if (!leer) return null;

  // `wrangler --json` imprime un arreglo de resultados, uno por sentencia, y
  // a veces precedido por líneas de cortesía. Se busca el primer `[` para no
  // depender de que no imprima nada antes.
  const inicio = salida.indexOf("[");
  if (inicio < 0) {
    throw new Error(`\`wrangler d1 execute\` no devolvió JSON:\n${salida}`);
  }

  return JSON.parse(salida.slice(inicio))[0].results;
}

/**
 * Lo que ya está guardado, por `orden`.
 *
 * Se lee **antes** de escribir nada, y de eso depende el control de
 * divergencia: con las filas en la mano se puede decir «el renglón 149 dice
 * otra cosa» en vez de insertar 453 y descubrir después que 80 se
 * descartaron.
 */
function renglonesGuardados() {
  const filas = ejecutar(
    "SELECT orden, categoria, numeral, concepto, clase, monto_oficial," +
      " regla_oficial FROM arancel_renglon" +
      ` WHERE tenant_id = ${texto(TENANT_ID)} ORDER BY orden`,
    { leer: true },
  );

  return new Map(
    filas.map((fila) => [
      fila.orden,
      {
        categoria: fila.categoria,
        numeral: fila.numeral,
        concepto: fila.concepto,
        clase: fila.clase,
        montoOficial: fila.monto_oficial,
        reglaOficial: fila.regla_oficial,
      },
    ]),
  );
}

function notasGuardadas() {
  const filas = ejecutar(
    "SELECT orden, categoria, texto FROM arancel_nota" +
      ` WHERE tenant_id = ${texto(TENANT_ID)} ORDER BY orden`,
    { leer: true },
  );

  return new Map(filas.map((fila) => [fila.orden, fila]));
}

/** En qué campos citados difiere lo guardado de lo que dice el JSON. */
function divergencias(guardado, delAcuerdo) {
  return CAMPOS_CITADOS.filter(
    (campo) => (guardado[campo] ?? null) !== (delAcuerdo[campo] ?? null),
  );
}

/**
 * Las sentencias en lotes, porque `--command` tiene un tope de longitud y
 * 453 `INSERT` en una sola línea lo pasan.
 */
function enLotes(sentencias, tamanio = 50) {
  const lotes = [];
  for (let desde = 0; desde < sentencias.length; desde += tamanio) {
    lotes.push(sentencias.slice(desde, desde + tamanio));
  }
  return lotes;
}

// ---------------------------------------------------------------------------
// La corrida
// ---------------------------------------------------------------------------

verificarTenant();

const arancel = JSON.parse(readFileSync(ENTRADA, "utf8"));
const { fuente, conteo, registros, notas } = arancel;

if (!Array.isArray(registros) || registros.length === 0) {
  throw new Error(
    `${ENTRADA} no tiene renglones. Hay que correr \`pnpm arancel:extraer\` ` +
      "antes de sembrar: un arancel vacío se ve igual que uno completo desde " +
      "la pantalla.",
  );
}

// El conteo de control de T-1, vuelto a comprobar acá. El script de
// extracción ya lo verifica, pero el JSON puede haberse editado a mano entre
// una cosa y la otra, y es justo lo que nadie recordaría haber hecho.
if (conteo.total !== registros.length) {
  throw new Error(
    `El conteo de ${ENTRADA} dice ${String(conteo.total)} renglones y el ` +
      `arreglo tiene ${String(registros.length)}. No se siembra un arancel ` +
      "cuyo propio control no cuadra.",
  );
}

console.log(`\n${fuente.acuerdo}  ·  ${fuente.archivo}`);
console.log(`Base: ${REMOTO ? "remota (--remote)" : "local"}\n`);

const yaEstanRenglones = renglonesGuardados();
const yaEstanNotas = notasGuardadas();

// ---------------------------------------------------------------------------
// El control de divergencia, antes de escribir una sola fila
// ---------------------------------------------------------------------------

const divergentes = [];

for (const registro of registros) {
  const guardado = yaEstanRenglones.get(registro.orden);
  if (guardado === undefined) continue;

  const campos = divergencias(guardado, registro);
  if (campos.length > 0) divergentes.push({ orden: registro.orden, campos });
}

notas.forEach((nota, indice) => {
  const orden = indice + 1;
  const guardada = yaEstanNotas.get(orden);
  if (guardada === undefined) return;

  if (guardada.categoria !== nota.categoria || guardada.texto !== nota.texto) {
    divergentes.push({ orden, campos: ["nota"] });
  }
});

if (divergentes.length > 0) {
  console.error(
    `✗ ${String(divergentes.length)} renglón(es) ya sembrado(s) dicen algo ` +
      "distinto de lo que dice `arancel.json` ahora.\n",
  );
  for (const { orden, campos } of divergentes) {
    console.error(`  orden ${String(orden).padStart(3)}  ${campos.join(", ")}`);
  }
  console.error(
    "\n  No se escribe nada. Esto **no** se arregla con un `DO UPDATE`:\n" +
      "  cambiar una cita ya guardada no es tarea de una siembra, porque de\n" +
      "  esa cita pueden colgar precios que el bufete puso mirándola, y el\n" +
      "  disparador `arancel_renglon_citado_no_se_edita` lo aborta igual.\n" +
      "  La salida es una migración que decida qué hacer con cada renglón\n" +
      "  afectado —o `activo = 0` sobre el viejo y uno nuevo al final—.\n",
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// La escritura
// ---------------------------------------------------------------------------

const sentenciasDeRenglon = registros.map(
  (registro) =>
    "INSERT INTO arancel_renglon (id, tenant_id, orden, categoria, numeral," +
    " concepto, clase, monto_oficial, regla_oficial, monto, activo) VALUES (" +
    [
      texto(idDeRenglon(registro.orden)),
      texto(TENANT_ID),
      entero(registro.orden),
      texto(registro.categoria),
      texto(registro.numeral),
      texto(registro.concepto),
      texto(registro.clase),
      entero(registro.montoOficial),
      registro.reglaOficial === null ? "NULL" : texto(registro.reglaOficial),
      // `monto` nace **nulo** y no copiando el oficial, y es la decisión de la
      // tajada: nulo significa «el bufete todavía no decidió», que es lo que
      // hace que la pantalla muestre la sugerencia del acuerdo como valor de
      // arranque en vez de un precio propio que nadie puso. Copiarlo haría
      // que los 282 montos de 2001 se vieran como precios del bufete, que es
      // justo lo contrario de lo que la tajada quiere.
      "NULL",
      "1",
    ].join(", ") +
    ") ON CONFLICT (tenant_id, orden) DO NOTHING",
);

const sentenciasDeNota = notas.map(
  (nota, indice) =>
    "INSERT INTO arancel_nota (id, tenant_id, orden, categoria, texto)" +
    " VALUES (" +
    [
      texto(idDeNota(indice + 1)),
      texto(TENANT_ID),
      entero(indice + 1),
      texto(nota.categoria),
      texto(nota.texto),
    ].join(", ") +
    ") ON CONFLICT (tenant_id, orden) DO NOTHING",
);

for (const lote of enLotes([...sentenciasDeRenglon, ...sentenciasDeNota])) {
  ejecutar(`${lote.join(";\n")};`);
}

// ---------------------------------------------------------------------------
// El contrapeso: se relee de la base, no se cuenta lo que se mandó
// ---------------------------------------------------------------------------
//
// Contar las sentencias emitidas no prueba nada: pasa igual con el `INSERT`
// descartado. Lo único que dice que el arancel está sembrado es volver a
// leerlo.

const [recuento] = ejecutar(
  "SELECT (SELECT count(*) FROM arancel_renglon WHERE tenant_id =" +
    ` ${texto(TENANT_ID)}) AS renglones,` +
    " (SELECT count(*) FROM arancel_nota WHERE tenant_id =" +
    ` ${texto(TENANT_ID)}) AS notas,` +
    " (SELECT count(*) FROM arancel_renglon WHERE tenant_id =" +
    ` ${texto(TENANT_ID)} AND monto IS NOT NULL) AS conPrecioPropio,` +
    " (SELECT count(DISTINCT categoria) FROM arancel_renglon WHERE tenant_id =" +
    ` ${texto(TENANT_ID)}) AS categorias`,
  { leer: true },
);

console.log(`  renglones en la base   ${String(recuento.renglones)}`);
console.log(`  notas en la base       ${String(recuento.notas)}`);
console.log(`  categorías             ${String(recuento.categorias)}`);
console.log(`  con precio del bufete  ${String(recuento.conPrecioPropio)}`);

const faltan = registros.length - recuento.renglones;
if (faltan > 0) {
  console.error(
    `\n✗ Faltan ${String(faltan)} renglones en la base. No se adivina qué ` +
      "pasó: hay que mirar el error de wrangler de arriba.\n",
  );
  process.exit(1);
}

console.log(
  `\n✓ El arancel está sembrado. ${String(recuento.renglones)} renglones y ` +
    `${String(recuento.notas)} notas del ${fuente.acuerdo}.\n`,
);
