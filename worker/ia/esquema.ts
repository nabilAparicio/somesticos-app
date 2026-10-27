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
 * ## Las cuatro cosas que lo hacen imposible, y no cuatro guardas para lo mismo
 *
 * 1. **El tipo de salida es el mismo que usa el camino a mano.**
 *    `PropuestaDelModelo` no define una forma propia: son `DatosDeModulo[]` y
 *    `DatosDeLineaConOrigen[]`, exactamente lo que `normalizarModulo` y
 *    `normalizarLinea` producen desde un formulario. No hay un sitio donde
 *    poner un total porque esos tipos no lo tienen, y no lo tienen porque
 *    `migrations/0004_cotizaciones.sql` no tiene columna de total ni de
 *    subtotal. La aritmética vive en `totalesDe`, en
 *    `worker/cotizaciones/lineas.ts`, y se calcula **sobre las líneas ya
 *    validadas**.
 *
 *    Nótese que el tipo de salida **no es la forma que el modelo escribe**: el
 *    modelo manda un servicio tarifado *o* un monto, y lo que sale de acá
 *    siempre tiene su `monto`. Esa es la cuarta cosa, abajo.
 * 2. **El juego de claves es cerrado**, y se comprueba. De las cuatro, es la
 *    que convierte un campo inventado en un rechazo: la 1 es una elección de
 *    tipos, la 3 una red de compilación y la 4 una lectura del catálogo.
 * 3. **Los catálogos son los que ya existen.** `esClaseDeLinea` se importa de
 *    donde vive y `esTipoDeModulo` también; no hay una segunda lista acá, que
 *    es la que se desincroniza. Desde T-4 de
 *    `odd/tasks/plantillas-de-modulo.md` los tipos de módulo tienen **además**
 *    su catálogo declarado, igual que los trámites y los servicios: el juego
 *    de claves lo cierra el compilador —la unión sigue viva durante la tajada
 *    1— pero **cuáles están vigentes lo dice la base**, así que quien llama
 *    declara las que el prompt ofreció.
 * 4. **El precio de un servicio tarifado no es un campo que el modelo
 *    rellena** (T-3 de `odd/tasks/precios-en-la-cotizacion.md`). Una línea
 *    trae *o* el identificador de un servicio del catálogo *o* un monto,
 *    nunca las dos y nunca ninguna, y cuando trae el servicio **el monto lo
 *    pone este archivo leyendo la cifra que viajó con el identificador**.
 *    Para todo lo que el bufete tarifó, un monto alucinado deja de ser
 *    posible: no hay clave donde escribirlo. Las dos del medio —el juego de
 *    claves cerrado y la red de compilación— son lo que sostiene que la
 *    cuarta no se pueda rodear agregando un campo.
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

import type {
  DatosDeLineaConOrigen,
  DatosDeModulo,
} from "../contract";
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
  readonly lineas: readonly DatosDeLineaConOrigen[];
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
  /**
   * El `tipo` no es ninguna de las plantillas que el prompt ofreció.
   *
   * **La frase no cambió y el motivo tampoco; cambió de dónde sale la lista**
   * (T-4). Hasta T-3 se comparaba contra los seis rótulos escritos en
   * `CATALOGO_DE_MODULOS`; ahora contra las claves de las plantillas activas de
   * `modulo_plantilla` que quien llama declara haber nombrado. Cubre tres
   * situaciones que desde acá son una sola —la clave inventada, la que no es
   * cadena y la de una plantilla **dada de baja**—: lo ofrecible son las
   * plantillas activas, así que cualquiera de las tres es, desde este archivo,
   * una clave que no está en la lista.
   */
  | "tipo_de_modulo_desconocido"
  /** La `clase` no es ninguna de las dos de `CATALOGO_DE_CLASES`. */
  | "clase_de_linea_desconocida"
  /** Prosa vacía, de puros espacios, ausente o que no es cadena. */
  | "texto_requerido"
  /**
   * No es un entero de centavos, cero o más. Nunca coma flotante.
   *
   * **Y también la línea que no trae precio de ningún lado** (T-3): ni un
   * servicio tarifado ni un monto. Es el mismo motivo y no uno nuevo porque
   * desde donde está quien tiene que arreglarlo —el prompt— «esto no es un
   * importe» y «acá no hay importe» son el mismo defecto y la corrección es la
   * misma. Es el reparto que `monto_invalido` ya hacía en `worker/contract.ts`
   * con sus cuatro formas de no ser un número.
   */
  | "monto_invalido"
  /** Un trámite que quien llamó no declaró haber ofrecido en el prompt. */
  | "tipo_de_proceso_no_ofrecido"
  /* --- El precio de una línea sale de un solo lugar (T-3 de
     `odd/tasks/precios-en-la-cotizacion.md`) --- */
  /**
   * Un servicio tarifado que quien llamó no declaró haber ofrecido.
   *
   * El gemelo exacto de `tipo_de_proceso_no_ofrecido`, y por el mismo motivo:
   * `arancelRenglonId` es una llave foránea contra `arancel_renglon` **de este
   * bufete**, así que no hay catálogo en código que la pueda cerrar. La cierra
   * quien llama diciendo qué ids puso en el prompt, y **con ellos la cifra**,
   * porque el precio sale de esa misma lista.
   *
   * Cubre cuatro situaciones que desde acá son una sola —el identificador
   * inventado, el del bufete vecino, el encabezado del acuerdo y el renglón
   * sin ninguna cifra—: lo ofrecible son los renglones con cifra, así que
   * cualquiera de los cuatro es, desde este archivo, un identificador que no
   * está en la lista. Un motivo por situación serían cuatro guardas para el
   * mismo hecho.
   */
  | "servicio_no_ofrecido"
  /**
   * La línea nombra un servicio tarifado **y** escribe un monto.
   *
   * Tiene motivo propio y no se resuelve eligiendo uno de los dos en
   * silencio: un modelo que manda los dos campos está diciendo dos cosas
   * distintas sobre quién pone el precio, y quedarse con el del catálogo
   * dejaría al prompt pidiendo una cosa y al esquema aceptando otra sin que
   * nadie se entere hasta que el modelo empiece a mandar siempre los dos.
   *
   * **El defecto es que tarifó, no que tarifó mal**, así que éste gana sobre
   * `monto_invalido` incluso cuando el número que mandó no es un importe: la
   * corrección es sacar el campo, no arreglarlo.
   */
  | "servicio_y_monto_a_la_vez"
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
/**
 * Un servicio tarifado que quien llama declara haber ofrecido, **con su
 * cifra**.
 *
 * El identificador y el monto viajan juntos, y eso es toda la decisión de
 * T-3: con la lista de ids de un lado y los precios del otro habría dos
 * valores que se tienen que corresponder y se piden por separado, que es el
 * defecto contra el que `worker/ia/prompt.ts` ya existe. Acá el precio de una
 * línea tarifada sale **de la misma fila** que la autorizó, así que no hay
 * ninguna ventana en la que el catálogo que validó y el que tarifó puedan
 * decir cosas distintas.
 *
 * `monto` es la cifra del bufete —`COALESCE(monto, monto_oficial)`, el mismo
 * criterio de `migrations/0015_un_precio_es_una_cifra.sql`— en centavos
 * enteros. **No hay un segundo número acá**, y la ausencia es deliberada: un
 * `montoOficial` al lado sería la comparación con el arancel que
 * `odd/tasks/arancel-de-honorarios.md` dejó prohibida, metida en el único
 * lugar del sistema que no tiene pantalla.
 */
export interface ServicioOfrecido {
  readonly id: string;
  /** Centavos enteros, cero o más. La cifra del bufete para ese servicio. */
  readonly monto: number;
}

export interface CatalogosOfrecidos {
  /**
   * Las claves de módulo que el prompt nombró (T-4 de
   * `odd/tasks/plantillas-de-modulo.md`).
   *
   * **Falla cerrada igual que los otros dos**: sin catálogo declarado ningún
   * módulo pasa. El argumento es el mismo con un agravante propio — las claves
   * de módulo **sí** tienen catálogo en código, el `CHECK` de `0004` y
   * `TIPOS_DE_MODULO`, así que la tentación de cerrarlas sólo con eso existe y
   * sería un error: ese catálogo dice qué claves son *válidas*, no cuáles el
   * bufete tiene *activas*. La distinción entre válido y seleccionable la fijó
   * T-5 y es la misma que separa `listar` de lo que el editor ofrece.
   *
   * Sin esta lista, una plantilla dada de baja sería un tipo que el modelo
   * puede proponer, que el editor no puede volver a elegir y que la pantalla
   * muestra marcada «(de baja)» — un módulo nacido retirado.
   */
  readonly modulos?: readonly string[];
  readonly tiposDeProceso?: readonly string[];
  /**
   * Los servicios tarifados que el prompt nombró, con su precio.
   *
   * **Falla cerrada igual que `tiposDeProceso`**: sin catálogo declarado
   * ninguna línea puede nombrar un servicio, porque un identificador que el
   * modelo compuso solo es la definición de un dato inventado — y acá peor,
   * porque de ese identificador sale el precio.
   */
  readonly servicios?: readonly ServicioOfrecido[];
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
 * `typecheck` rompe. Es el mismo mecanismo que `TiposFueraDeLaLista` en
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

/**
 * **La frontera que T-3 movió, y queda escrito que fue una decisión.**
 *
 * Hasta T-2 esta lista se cerraba contra `DatosDeLinea` —las cuatro claves de
 * lo que una línea lleva sin su procedencia— y el contrato dejó anotado por
 * qué: declarar `arancelRenglonId` acá era abrirle la puerta al modelo
 * **antes** de la regla del `xor`. Esa regla ya está escrita unas líneas más
 * abajo, así que la puerta se abre ahora, y se cierra contra el tipo ancho.
 *
 * Que la red de `DebeSerVacio` mire `DatosDeLineaConOrigen` es estrictamente
 * más fuerte que antes: hasta hoy un campo agregado **sólo** al tipo ancho no
 * ponía nada en rojo, porque la exclusión se calculaba sobre el angosto.
 */
export const CLAVES_DE_LINEA = [
  "clase",
  "concepto",
  "monto",
  "tipoProcesoId",
  "arancelRenglonId",
] as const satisfies readonly (keyof DatosDeLineaConOrigen)[];

/**
 * La red: la exclusión **bajo una restricción**.
 *
 * Si `Exclude<…>` no es `never`, `T extends never` no se satisface y el
 * `typecheck` se cae con TS2344, sin necesidad de ningún valor en tiempo de
 * ejecución. Verificado quitando `"contenido"` de `CLAVES_DE_MODULO`.
 *
 * **No es la forma que el proyecto usaba**, y la diferencia costó medirla.
 * `TiposSinRotulo` —hoy `TiposFueraDeLaLista`, renombrada en T-3 cuando el
 * rótulo pasó a ser una fila y la red dejó de poder hablar de rótulos—,
 * `ClasesSinRotulo` y `AccionesSinDuenio` se escribían como
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
  Exclude<keyof DatosDeLineaConOrigen, (typeof CLAVES_DE_LINEA)[number]>
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
  /** Las claves de plantilla **activas** que el prompt declaró haber ofrecido. */
  clavesOfrecidas: readonly string[],
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
  //
  // **Dos comprobaciones y un solo motivo** (T-4), y ninguna sobra:
  //
  //  - `esTipoDeModulo` es la que **estrecha el tipo**. `DatosDeModulo.tipo`
  //    es `TipoDeModulo`, una unión que sigue viva hasta T-6, así que sin esta
  //    guarda el `return` de abajo necesitaría un `as` — y un `as` acá sería
  //    afirmarle al compilador algo que viene del cable.
  //  - `clavesOfrecidas.includes` es la que dice **qué está vigente**. La anterior no
  //    puede: la unión enumera las claves *posibles*, no las plantillas que el
  //    bufete tiene activas, así que una dada de baja pasaría. Ésta es la que
  //    falla cerrada con el catálogo vacío.
  //
  // **El `CHECK` de `0004` ya no es la tercera pata**: T-5 lo borró —`0017`
  // cambió `cotizacion_modulo.tipo` por `plantilla_id`, una referencia a
  // `modulo_plantilla`— así que la red de abajo del modelo pasó de ser una
  // lista en el esquema a ser una fila que tiene que existir. Es más fuerte, y
  // es lo que deja que T-6 se lleve `TipoDeModulo`: ese día la primera
  // comprobación se va y queda sólo la segunda, que es la que lleva la regla.
  const tipo = crudo.tipo;
  const tipoConocido = esTipoDeModulo(tipo) && clavesOfrecidas.includes(tipo);
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
  servicios: readonly ServicioOfrecido[],
  rechazos: RechazoDeSalida[],
): DatosDeLineaConOrigen | null {
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

  // ====================================================================
  // El precio: **o el catálogo, o el modelo. Nunca los dos, nunca ninguno.**
  //
  // Es la frontera de `docs/diseno.md` §8 corrida un paso. Ya decía «la IA
  // rellena campos tipados; el sistema hace la aritmética»; acá el precio de
  // un servicio conocido deja de ser un campo que la IA rellena. Para todo lo
  // que está en el catálogo, un monto alucinado deja de ser posible — no
  // porque el modelo se porte bien, sino porque **no hay dónde escribirlo**.
  // ====================================================================

  // El servicio es opcional, igual que el trámite: una consulta o una
  // mensajería no sale de ningún renglón tarifado, y es el caso corriente.
  // Ausente y nulo son lo mismo y no son una falla.
  const servicio = crudo.arancelRenglonId;
  const nombraServicio = servicio !== undefined && servicio !== null;
  const tarifado =
    typeof servicio === "string"
      ? (servicios.find((uno) => uno.id === servicio) ?? null)
      : null;

  if (nombraServicio && tarifado === null) {
    rechazos.push(rechazo(`${ruta}.arancelRenglonId`, "servicio_no_ofrecido"));
  }

  // `monto` nulo es `monto` ausente, por lo mismo que arriba: un modelo que
  // escribe el campo en nulo no está tarifando nada, así que al lado de un
  // servicio no es la contradicción sino la forma correcta.
  const montoDelModelo = crudo.monto;
  const modeloTarifo = montoDelModelo !== undefined && montoDelModelo !== null;

  // `null` hasta que alguno de los dos caminos lo ponga, y es lo que estrecha
  // el tipo abajo: una línea sin precio no se construye.
  let monto: number | null = null;

  if (nombraServicio && modeloTarifo) {
    // La contradicción gana sobre `monto_invalido` aunque el número sea
    // basura: el defecto es que tarifó, y la corrección es sacar el campo.
    rechazos.push(rechazo(`${ruta}.monto`, "servicio_y_monto_a_la_vez"));
  } else if (nombraServicio) {
    // **Acá tarifa el sistema.** El número sale de la fila que autorizó el
    // identificador, no de una segunda lectura que podría discrepar.
    if (tarifado !== null) monto = tarifado.monto;
  } else if (esMontoEnCentavos(montoDelModelo)) {
    monto = montoDelModelo;
  } else {
    // Ausente, nulo e inválido caen en el mismo motivo: ver su comentario.
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
  // `monto === null` es la condición que lo estrecha a `number`, y de paso
  // cubre sola los tres caminos por los que una línea se queda sin precio.
  if (!claseConocida || concepto === null || monto === null || !tramiteValido) {
    return null;
  }
  return {
    clase,
    concepto,
    monto,
    tipoProcesoId,
    arancelRenglonId: tarifado === null ? null : tarifado.id,
  };
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
  // Los tres `?? []` son la falla cerrada, y el de módulos es de T-4: una
  // llamada que no declara catálogo no es una llamada permisiva, es una
  // llamada a la que no se le puede creer nada.
  const clavesDeModulo = catalogos.modulos ?? [];
  const tiposDeProceso = catalogos.tiposDeProceso ?? [];
  const servicios = catalogos.servicios ?? [];

  for (const clave of clavesDeMas(crudo, CLAVES_DE_PROPUESTA)) {
    rechazos.push(rechazo(`propuesta.${clave}`, "campo_desconocido"));
  }

  const modulos = validarColeccion(
    crudo.modulos,
    "modulos",
    (elemento, ruta) => validarModulo(elemento, ruta, clavesDeModulo, rechazos),
    rechazos,
  );

  const lineas = validarColeccion(
    crudo.lineas,
    "lineas",
    (elemento, ruta) =>
      validarLinea(elemento, ruta, tiposDeProceso, servicios, rechazos),
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
