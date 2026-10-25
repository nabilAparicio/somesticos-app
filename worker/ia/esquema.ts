/**
 * El esquema de lo que el modelo puede devolver, y la única puerta por la que
 * su salida entra al sistema. Pura: ni D1, ni HTTP, ni entorno.
 *
 * ## Lo único que hay que entender de este archivo
 *
 * > **El modelo no suma. Nunca.** (`docs/diseno.md` §8, la barandilla de la
 * > tajada.)
 *
 * La IA decide qué módulos entran, en qué orden, y escribe la prosa. En lo
 * estructurado **rellena campos tipados y el sistema hace la aritmética**. El
 * trabajo de este archivo es que eso sea **imposible y no improbable**: que un
 * modelo que inventa un tipo de módulo, agrega un campo, manda un monto como
 * texto o calcula un total quede rechazado acá, y no en quien llama.
 *
 * ## Las tres cosas que lo hacen imposible, y no tres guardas para lo mismo
 *
 * 1. **El tipo de salida es el mismo que usa el camino a mano.**
 *    `PropuestaDelModelo` no define una forma propia: son `DatosDeModulo[]` y
 *    `DatosDeLinea[]`, exactamente lo que `normalizarModulo` y
 *    `normalizarLinea` producen desde un formulario. No hay un sitio donde
 *    poner un total porque esos tipos no lo tienen, y no lo tienen porque
 *    `migrations/0004_cotizaciones.sql` no tiene columna de total ni de
 *    subtotal. La aritmética vive en `totalesDe`, en
 *    `worker/cotizaciones/lineas.ts`, y se calcula **sobre las líneas ya
 *    validadas**.
 * 2. **El juego de claves es cerrado**, y se comprueba. Es la única guarda de
 *    las tres —las otras dos son una red de compilación y una elección de
 *    tipos—, y es la que convierte un campo inventado en un rechazo.
 * 3. **Los catálogos son los que ya existen.** `esTipoDeModulo` y
 *    `esClaseDeLinea` se importan de donde viven; no hay una segunda lista
 *    acá, que es la que se desincroniza.
 *
 * ## Por qué esto es más estricto que el formulario, a propósito
 *
 * `normalizarModulo` y `normalizarLinea` **ignoran en silencio** lo que no
 * conocen, y lo documentan: ninguna pantalla manda `orden`, así que un 422 no
 * le hablaría a nadie. Para un modelo la misma lenidad es el defecto: un campo
 * ignorado en silencio es exactamente un campo que el modelo inventó y del que
 * nadie se enteró. El día que la deriva empiece, la señal llegaría como «las
 * cotizaciones generadas salen raras» en vez de como un motivo con su ruta.
 *
 * Por el mismo argumento no se desenvuelve un bloque de código ni se busca el
 * JSON dentro de la prosa: esa tolerancia convierte un defecto del prompt de
 * T-9 en una rareza intermitente que nadie puede reproducir.
 *
 * ## Dónde se enchufa el corpus
 *
 * En ningún lado de este archivo, y eso es la decisión. El corpus de
 * cotizaciones previas (`docs/diseno.md` §11, punto 2) está sin decidir, y
 * cualquiera de sus dos formas —catálogo sembrado o ejemplos en el prompt—
 * cambia **lo que se le pide al modelo**, nunca lo que se acepta de vuelta.
 * El esquema de la respuesta es el mismo con corpus y sin él. Ver
 * `worker/ia/modelo.ts` para el campo donde el material de referencia viaja.
 */

import type { DatosDeLinea, DatosDeModulo } from "../contract";
import { esClaseDeLinea } from "../cotizaciones/lineas";
import { esTipoDeModulo } from "../cotizaciones/modulos";

/* ==========================================================================
   Lo que sale
   ========================================================================== */

/**
 * Lo que la costura entrega cuando la salida del modelo pasó.
 *
 * **No hay un tercer campo, y la ausencia es la barandilla.** No hay `total`,
 * no hay `totales`, no hay `subtotal` por línea y no hay `moneda`: lo primero
 * lo calcula `totalesDe` y lo último es de la cotización, no de lo que el
 * modelo propone.
 */
export interface PropuestaDelModelo {
  readonly modulos: readonly DatosDeModulo[];
  readonly lineas: readonly DatosDeLinea[];
}

export type MotivoDeRechazoDeSalida =
  /** El texto del modelo no es JSON. No se intenta rescatar nada de él. */
  | "salida_no_es_json"
  /** Es JSON, pero no un objeto: un arreglo, un número, `null`. */
  | "salida_no_es_objeto"
  /** `modulos` o `lineas` no vino, o no es un arreglo. */
  | "coleccion_ausente"
  /** Un elemento de `modulos` no es un objeto. */
  | "modulo_no_es_objeto"
  /** Un elemento de `lineas` no es un objeto. */
  | "linea_no_es_objeto"
  /** **El modelo agregó algo.** La guarda de la barandilla. */
  | "campo_desconocido"
  /** El `tipo` no es ninguno de los seis de `CATALOGO_DE_MODULOS`. */
  | "tipo_de_modulo_desconocido"
  /** La `clase` no es ninguna de las dos de `CATALOGO_DE_CLASES`. */
  | "clase_de_linea_desconocida"
  /** Prosa vacía, de puros espacios, ausente o que no es cadena. */
  | "texto_requerido"
  /** No es un entero de centavos, cero o más. Nunca coma flotante. */
  | "monto_invalido"
  /** Un trámite que quien llamó no declaró haber ofrecido en el prompt. */
  | "tipo_de_proceso_no_ofrecido"
  /** Ni un módulo ni una línea: una página en blanco. */
  | "propuesta_vacia";

/** Dónde y por qué. La ruta nombra el lugar: `lineas[2].monto`. */
export interface RechazoDeSalida {
  ruta: string;
  motivo: MotivoDeRechazoDeSalida;
}

export type ValidacionDePropuesta =
  | { ok: true; propuesta: PropuestaDelModelo }
  | { ok: false; rechazos: RechazoDeSalida[] };

/**
 * Los trámites que quien llama declara haber ofrecido en el prompt.
 *
 * `tipoProcesoId` es una llave foránea contra `tipo_proceso` **de este
 * bufete**, así que no hay catálogo en código que la pueda cerrar: la cierra
 * quien llama, diciendo qué ids puso. **Falla cerrada**, igual que
 * `acceso_no_configurado` en la puerta: sin catálogo declarado no pasa ningún
 * trámite, porque un identificador que el modelo compuso solo es la definición
 * de un dato inventado.
 */
export interface CatalogosOfrecidos {
  readonly tiposDeProceso?: readonly string[];
}

/* ==========================================================================
   El juego de claves cerrado, y las redes que lo mantienen sincronizado
   ========================================================================== */

/**
 * Las claves que cada forma puede traer, **y ninguna más**.
 *
 * `as const satisfies readonly (keyof …)[]` cierra una dirección: no se puede
 * declarar acá una clave que el tipo no tiene. `Exclude<…>` de abajo cierra la
 * otra: si alguien agrega un campo a `DatosDeLinea` y no lo declara acá, el
 * `typecheck` rompe. Es el mismo mecanismo que `TiposSinRotulo` en
 * `worker/cotizaciones/modulos.ts` y `ClasesSinRotulo` en `lineas.ts`.
 *
 * Sin la segunda red, un campo nuevo del contrato se volvería `campo_desconocido`
 * en silencio y el generador de T-9 dejaría de poder llenarlo sin que nada
 * avisara.
 */
export const CLAVES_DE_PROPUESTA = [
  "modulos",
  "lineas",
] as const satisfies readonly (keyof PropuestaDelModelo)[];

export const CLAVES_DE_MODULO = [
  "tipo",
  "contenido",
] as const satisfies readonly (keyof DatosDeModulo)[];

export const CLAVES_DE_LINEA = [
  "clase",
  "concepto",
  "monto",
  "tipoProcesoId",
] as const satisfies readonly (keyof DatosDeLinea)[];

/**
 * La red: la exclusión **bajo una restricción**.
 *
 * Si `Exclude<…>` no es `never`, `T extends never` no se satisface y el
 * `typecheck` se cae con TS2344, sin necesidad de ningún valor en tiempo de
 * ejecución. Verificado quitando `"contenido"` de `CLAVES_DE_MODULO`.
 *
 * **No es la forma que el proyecto usaba**, y la diferencia costó medirla.
 * `TiposSinRotulo`, `ClasesSinRotulo` y `AccionesSinDuenio` se escribían como
 * `export const X: Exclusion[] = []`, con el comentario de que esa asignación
 * no compila cuando la exclusión deja de ser `never`. Era falso: un arreglo
 * vacío es asignable a `T[]` para cualquier `T`. Las tres se corrigieron a
 * esta forma en T-8 y cada una quedó demostrada con su mutación; sus
 * comentarios cuentan ahora cuál es el camino que cada una cubre y cuál es la
 * mutación equivocada que mata el `typecheck` por otro lado.
 */
type DebeSerVacio<T extends never> = T;

export type ClavesDePropuestaSinDeclarar = DebeSerVacio<
  Exclude<keyof PropuestaDelModelo, (typeof CLAVES_DE_PROPUESTA)[number]>
>;
export type ClavesDeModuloSinDeclarar = DebeSerVacio<
  Exclude<keyof DatosDeModulo, (typeof CLAVES_DE_MODULO)[number]>
>;
export type ClavesDeLineaSinDeclarar = DebeSerVacio<
  Exclude<keyof DatosDeLinea, (typeof CLAVES_DE_LINEA)[number]>
>;

/* ==========================================================================
   La validación
   ========================================================================== */

function rechazo(
  ruta: string,
  motivo: MotivoDeRechazoDeSalida,
): RechazoDeSalida {
  return { ruta, motivo };
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

/**
 * **La guarda.** Una sola, usada tres veces sobre tres juegos de claves; no
 * son tres guardas. Quitarla hace entrar el total que el modelo calculó, el
 * `orden` que el servidor asigna y el campo que a nadie se le ocurrió todavía.
 */
function clavesDeMas(
  valor: Record<string, unknown>,
  permitidas: readonly string[],
): string[] {
  return Object.keys(valor).filter((clave) => !permitidas.includes(clave));
}

/**
 * El texto de un campo de prosa, ya recortado, o `null` si no sirve.
 *
 * Se recorta **antes** de comprobar, por lo mismo que `normalizarModulo`: un
 * contenido de tres saltos de línea es un título sin nada debajo. El valor que
 * se comprueba es el mismo que se devuelve, así que no hay dos versiones del
 * texto ni una comprobación que mire una cosa y guarde otra.
 */
function textoUtil(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const recortado = valor.trim();
  return recortado === "" ? null : recortado;
}

/**
 * Centavos enteros, cero o más. El mismo criterio que `normalizarLinea`, por
 * la restricción 5 de la tajada.
 *
 * `Number.isSafeInteger` y no `Number.isInteger`: por encima de 2^53 los
 * enteros dejan de ser distinguibles entre sí. También descarta `NaN`,
 * `Infinity` y cualquier cosa que no sea un número de JSON — un `"150000"`
 * **no** se convierte, porque un modelo que manda el monto como texto es un
 * modelo al que hay que corregirle el prompt, no el tipo.
 */
function esMontoEnCentavos(valor: unknown): valor is number {
  return typeof valor === "number" && Number.isSafeInteger(valor) && valor >= 0;
}

function validarModulo(
  crudo: unknown,
  ruta: string,
  rechazos: RechazoDeSalida[],
): DatosDeModulo | null {
  if (!esObjeto(crudo)) {
    rechazos.push(rechazo(ruta, "modulo_no_es_objeto"));
    return null;
  }

  for (const clave of clavesDeMas(crudo, CLAVES_DE_MODULO)) {
    rechazos.push(rechazo(`${ruta}.${clave}`, "campo_desconocido"));
  }

  // Ausente, en blanco e inventado caen en el mismo motivo, igual que en el
  // formulario: desde donde está quien tiene que arreglarlo son el mismo
  // defecto, y ese alguien acá es el prompt de T-9.
  const tipo = crudo.tipo;
  const tipoConocido = esTipoDeModulo(tipo);
  if (!tipoConocido) {
    rechazos.push(rechazo(`${ruta}.tipo`, "tipo_de_modulo_desconocido"));
  }

  const contenido = textoUtil(crudo.contenido);
  if (contenido === null) {
    rechazos.push(rechazo(`${ruta}.contenido`, "texto_requerido"));
  }

  // **No es una guarda, y por eso no se cuenta como una.** Se midió: quitarla
  // no mata ninguna prueba, porque el veredicto lo da `rechazos.length > 0`
  // allá arriba y un módulo mal armado nunca sale. Lo que hace es permitir
  // devolver el valor **sin un `as`**: es la condición bajo la cual `tipo` y
  // `contenido` ya están estrechados a sus tipos. Una segunda guarda con la
  // misma garantía que la de arriba se anularían entre sí; ésta no promete
  // nada, construye.
  if (!tipoConocido || contenido === null) return null;
  return { tipo, contenido };
}

function validarLinea(
  crudo: unknown,
  ruta: string,
  tiposDeProceso: readonly string[],
  rechazos: RechazoDeSalida[],
): DatosDeLinea | null {
  if (!esObjeto(crudo)) {
    rechazos.push(rechazo(ruta, "linea_no_es_objeto"));
    return null;
  }

  for (const clave of clavesDeMas(crudo, CLAVES_DE_LINEA)) {
    rechazos.push(rechazo(`${ruta}.${clave}`, "campo_desconocido"));
  }

  const clase = crudo.clase;
  const claseConocida = esClaseDeLinea(clase);
  if (!claseConocida) {
    rechazos.push(rechazo(`${ruta}.clase`, "clase_de_linea_desconocida"));
  }

  const concepto = textoUtil(crudo.concepto);
  if (concepto === null) {
    rechazos.push(rechazo(`${ruta}.concepto`, "texto_requerido"));
  }

  const monto = crudo.monto;
  const montoValido = esMontoEnCentavos(monto);
  if (!montoValido) {
    rechazos.push(rechazo(`${ruta}.monto`, "monto_invalido"));
  }

  // El trámite es opcional: una consulta o una mensajería no abre ninguno, y
  // es el caso corriente. Ausente y nulo son lo mismo y no son una falla.
  const tramite = crudo.tipoProcesoId;
  let tipoProcesoId: string | null = null;
  let tramiteValido = true;
  if (tramite !== undefined && tramite !== null) {
    if (typeof tramite !== "string" || !tiposDeProceso.includes(tramite)) {
      tramiteValido = false;
      rechazos.push(
        rechazo(`${ruta}.tipoProcesoId`, "tipo_de_proceso_no_ofrecido"),
      );
    } else {
      tipoProcesoId = tramite;
    }
  }

  // Construcción, no guarda: ver el comentario gemelo en `validarModulo`.
  if (!claseConocida || concepto === null || !montoValido || !tramiteValido) {
    return null;
  }
  return { clase, concepto, monto, tipoProcesoId };
}

function validarColeccion<T>(
  crudo: unknown,
  nombre: string,
  validarUno: (elemento: unknown, ruta: string) => T | null,
  rechazos: RechazoDeSalida[],
): T[] {
  if (!Array.isArray(crudo)) {
    rechazos.push(rechazo(nombre, "coleccion_ausente"));
    return [];
  }

  const validos: T[] = [];
  crudo.forEach((elemento: unknown, indice) => {
    const uno = validarUno(elemento, `${nombre}[${String(indice)}]`);
    if (uno !== null) validos.push(uno);
  });

  return validos;
}

/**
 * De lo que el modelo devolvió, ya parseado, a una propuesta o a la lista de
 * por qué no.
 *
 * Devuelve **todos** los rechazos y no el primero, por lo mismo que los
 * normalizadores del formulario: quien tiene que corregir acá es un prompt, y
 * un prompt que se corrige de a un defecto por corrida es un prompt que se
 * corrige diez veces.
 *
 * **No tira nunca.** Es total sobre `unknown`, y por eso el adaptador puede
 * llamarla fuera de todo `try`: así `salida_rechazada` no es alcanzable desde
 * un `catch`, y una falla de red nunca se puede confundir con un modelo que se
 * salió del esquema.
 */
export function validarPropuesta(
  crudo: unknown,
  catalogos: CatalogosOfrecidos = {},
): ValidacionDePropuesta {
  if (!esObjeto(crudo)) {
    return {
      ok: false,
      rechazos: [rechazo("propuesta", "salida_no_es_objeto")],
    };
  }

  const rechazos: RechazoDeSalida[] = [];
  const tiposDeProceso = catalogos.tiposDeProceso ?? [];

  for (const clave of clavesDeMas(crudo, CLAVES_DE_PROPUESTA)) {
    rechazos.push(rechazo(`propuesta.${clave}`, "campo_desconocido"));
  }

  const modulos = validarColeccion(
    crudo.modulos,
    "modulos",
    (elemento, ruta) => validarModulo(elemento, ruta, rechazos),
    rechazos,
  );

  const lineas = validarColeccion(
    crudo.lineas,
    "lineas",
    (elemento, ruta) => validarLinea(elemento, ruta, tiposDeProceso, rechazos),
    rechazos,
  );

  if (rechazos.length === 0 && modulos.length === 0 && lineas.length === 0) {
    rechazos.push(rechazo("propuesta", "propuesta_vacia"));
  }

  if (rechazos.length > 0) return { ok: false, rechazos };
  return { ok: true, propuesta: { modulos, lineas } };
}

/**
 * De lo que el modelo escribió, tal cual, a una propuesta o a por qué no.
 *
 * **El único `try` del archivo, y está acá porque `JSON.parse` no tiene
 * variante que no tire.** No contradice «las guardas se cuentan, nunca se
 * atrapan»: atrapar está prohibido cuando disfraza la violación de una regla
 * nuestra de respuesta amable, y acá el `catch` hace lo contrario — convierte
 * un fallo mudo en `salida_no_es_json`, con su ruta, que es precisamente
 * contarlo. El alcance es una sola expresión y no hay ninguna comprobación
 * nuestra adentro.
 */
export function validarTextoDePropuesta(
  texto: string,
  catalogos: CatalogosOfrecidos = {},
): ValidacionDePropuesta {
  let crudo: unknown;
  try {
    crudo = JSON.parse(texto);
  } catch {
    return { ok: false, rechazos: [rechazo("propuesta", "salida_no_es_json")] };
  }

  return validarPropuesta(crudo, catalogos);
}
