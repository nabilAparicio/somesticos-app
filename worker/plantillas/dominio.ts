/**
 * Las reglas de qué se puede escribir de una plantilla de módulo. Puras: ni
 * D1 ni HTTP.
 *
 * ## La regla que carga con la tajada entera: vacío significa NULL
 *
 * `modulo_plantilla.rotulo` y `modulo_plantilla.descripcion` son nullable, y
 * **NULL es «uso el preset»** —lo dice la migración `0016` con todas las
 * letras—. Eso convierte «volver al preset» en una operación que no necesita
 * botón propio ni columna «¿editado?»: se vacía el campo y se guarda.
 *
 * Para que eso funcione, la normalización tiene que ser exactamente ésta:
 *
 *  - **Ausente, nulo, vacío y en blanco son la misma cosa, y esa cosa es
 *    NULL.** Un `"   "` que entrara como texto dejaría la fila con un rótulo
 *    vigente de tres espacios: el `CHECK` de la base lo acepta —no es nulo— y
 *    la hoja de la cotización dibujaría un `<h2>` en blanco. Ahí está el
 *    motivo de que el recorte no sea cosmético.
 *  - **Lo que no es texto es una falla, no un `String(valor)`.** Convertir en
 *    silencio es cómo entra un `"[object Object]"` como descripción que la IA
 *    después lee.
 *
 * Es la misma asimetría que `worker/arancel/dominio.ts` custodia para el
 * precio, con una diferencia que vale nombrar: allá el nulo es «no hay
 * decisión del bufete» y lo que queda a la vista es la cita de un documento
 * publicado; acá el nulo es lo mismo pero lo que queda a la vista es un preset
 * que la migración sembró. En los dos casos **el `COALESCE` elige cuál de los
 * dos existe, nunca cuál es mejor**.
 *
 * ## Las dos negativas, y por qué viven en dos capas
 *
 *  1. **`CAMPOS_INMUTABLES`** es el cuerpo que pretende escribir lo que esta
 *     ruta no escribe nunca. Se decide acá porque se decide **sobre el
 *     cuerpo**, sin leer nada. La red de abajo son los disparadores
 *     `modulo_plantilla_clave_inmutable` y
 *     `modulo_plantilla_preset_no_se_edita` de `0016`, y las dos mitades
 *     hacen falta por el reparto que el arancel ya dejó escrito: el
 *     disparador es el que sobrevive al primer script de importación
 *     (`docs/diseno.md` §5) y esta lista es la que deja **contestar** en vez
 *     de caerse con un 500 de SQLite crudo. `0016:436` encarga ese 409 a esta
 *     tarea por su nombre.
 *  2. **`camposSinPreset`** es el vaciado que dejaría la fila sin valor
 *     vigente. Ésa **no** se puede decidir sobre el cuerpo: depende de si la
 *     fila guardada tiene preset debajo, así que se evalúa en el repositorio
 *     contra la fila leída, igual que «un rubro no lleva precio». Es pura
 *     igual, y por eso vive acá y tiene prueba acá.
 *
 * Hoy ninguna de las seis filas sembradas tiene preset nulo, así que
 * `camposSinPreset` no se dispara en producción. Está construida igual porque
 * las dos columnas del preset **son nullable a propósito** —la tajada 2 va a
 * permitir crear plantillas propias, que nacen sin piso debajo— y el contrato
 * de T-2 tiene que ser honesto antes de que exista la fila que lo ejerce. Lo
 * contrario es descubrir el caso como un 500 el día que aparezca.
 */

import type { FallaDeValidacion, MotivoDeFalla } from "../contract";

/**
 * Lo que una edición de plantilla puede escribir, ya normalizado.
 *
 * Los dos textos son `string | null` y el nulo **significa algo**: es «uso el
 * preset». No hay una tercera variante para «no vino el campo», y es
 * deliberado: el `PUT` manda el juego completo de lo editable —la decisión de
 * T-5 que esta API repite en todas sus rutas—, así que un campo ausente es un
 * campo que quien edita dejó vacío. Distinguirlos obligaría a que la pantalla
 * eligiera entre dos formas de volver al preset.
 */
export interface DatosDePlantilla {
  readonly rotulo: string | null;
  readonly descripcion: string | null;
  readonly activo: boolean;
}

/**
 * Los nombres —**del cable**, no de las columnas— que esta ruta no escribe
 * nunca.
 *
 * Son los del cable porque quien recibe la negativa está mirando el cuerpo
 * que mandó, no el esquema. Van en orden alfabético para que la respuesta sea
 * determinista: un arreglo cuyo orden dependa del orden de las claves del
 * JSON entrante haría que la misma negativa se viera distinta según cómo se
 * armó la petición, y eso no se puede probar exacto. Es la misma decisión que
 * `CAMPOS_CITADOS` en `worker/arancel/dominio.ts`.
 *
 * ## Son tres y van en **una** lista, aunque la base los guarde con dos
 * disparadores
 *
 * `0016` separa `modulo_plantilla_clave_inmutable` de
 * `modulo_plantilla_preset_no_se_edita`, y su encabezado explica por qué: son
 * dos hechos distintos y el mensaje de rechazo de la base tiene que
 * distinguirlos, porque quien pisa un `RAISE` desde un `wrangler d1 execute`
 * no tiene otra pista que el texto.
 *
 * En el cable eso no se repite, y la razón es que **`campos` ya dice cuál
 * fue**. Lo que la pantalla contesta es una sola cosa para los tres —«eso no
 * se edita desde acá»— y partirlo en dos motivos obligaría a escribir dos
 * frases que dicen lo mismo con distinto sujeto. El motivo del cable existe
 * para que la pantalla pueda explicar; el nombre del disparador existe para
 * que una consola pueda diagnosticar, y no son el mismo problema.
 *
 * `id` **no** está en la lista, y vale decir por qué: es la llave primaria y
 * viaja en la dirección, no en el cuerpo. Un `id` adentro del cuerpo no es un
 * intento de reasignarlo sino ruido de un cliente que mandó la fila entera, y
 * rechazarlo convertiría «releer y volver a guardar» en un error. `orden`
 * tampoco: es editable por diseño —`0016` no le puso disparador justamente
 * para que T-2 pueda reordenar— y lo que pasa es que esta tarea todavía no
 * abre el reordenamiento. Un campo que se ignora porque la operación no
 * existe no es un campo prohibido.
 */
export const CAMPOS_INMUTABLES = [
  "clave",
  "descripcionOficial",
  "rotuloOficial",
] as const;

/**
 * Lo que puede salir de mirar el cuerpo de una edición.
 *
 * `inmutable` es una variante propia y no un `invalido` con otro motivo, por
 * la misma distinción que el arancel ya pagó: un 422 dice «hay un dato que
 * arreglar», y acá no hay dato que arreglar —ese campo no se escribe nunca—.
 * Aplastarlos en uno dejaría a la pantalla prometiendo un reintento que no
 * puede funcionar.
 */
export type RevisionDePlantilla =
  | { estado: "ok"; datos: DatosDePlantilla }
  | { estado: "inmutable"; campos: string[] }
  | { estado: "invalido"; fallas: FallaDeValidacion[] };

function falla(campo: string, motivo: MotivoDeFalla): FallaDeValidacion {
  return { campo, motivo };
}

function esObjeto(cuerpo: unknown): cuerpo is Record<string, unknown> {
  return typeof cuerpo === "object" && cuerpo !== null && !Array.isArray(cuerpo);
}

/**
 * Qué campos inmutables trae el cuerpo.
 *
 * Se mira si la **clave vino**, no si trae un valor que valga: un
 * `{ "rotuloOficial": null }` es igual de inadmisible que un
 * `{ "rotuloOficial": "Otro" }`, porque las dos peticiones vienen de un
 * cliente que cree que puede escribir esa columna. Y acá el nulo es el peor de
 * los dos: borrar un `rotulo_oficial` es borrar el piso al que se vuelve, que
 * es exactamente el agujero que `0016` describe como «el peor que esta tarea
 * podía dejar».
 */
function inmutablesEn(cuerpo: Record<string, unknown>): string[] {
  return CAMPOS_INMUTABLES.filter((campo) =>
    Object.prototype.hasOwnProperty.call(cuerpo, campo),
  );
}

/**
 * Un texto editable del cuerpo, recortado, con el vacío convertido en NULL.
 *
 * Devuelve `{ ok: false }` cuando lo que vino no es texto ni nulo. No hay
 * conversión: lo que manda otra cosa es un cliente con un defecto, y hay que
 * verlo.
 */
function textoEditable(
  crudo: Record<string, unknown>,
  campo: string,
): { ok: true; valor: string | null } | { ok: false } {
  const valor = crudo[campo];

  // Ausente y nulo son lo mismo, y los dos son «uso el preset». Que el campo
  // no venga no es un caso aparte: el `PUT` manda el juego completo, así que
  // la ausencia es una decisión y no un silencio.
  if (valor === undefined || valor === null) return { ok: true, valor: null };

  if (typeof valor !== "string") return { ok: false };

  // El recorte es la mitad visible de «vacío significa NULL»: sin él, un
  // `"  "` entraría como rótulo vigente y la hoja de la cotización dibujaría
  // un encabezado en blanco que el `CHECK` de la base no puede atrapar,
  // porque tres espacios no son nulos.
  const limpio = valor.trim();
  return { ok: true, valor: limpio === "" ? null : limpio };
}

/**
 * La marca de vigencia.
 *
 * Ausente significa **vigente**, igual que en `worker/catalogos/dominio.ts` y
 * por el mismo motivo: el `PUT` manda el juego completo de campos, y una
 * plantilla que se guarda sin `activo` no se está dando de baja.
 */
function vigencia(
  crudo: Record<string, unknown>,
  fallas: FallaDeValidacion[],
): boolean {
  const valor = crudo.activo;
  if (valor === undefined || valor === null) return true;
  if (typeof valor !== "boolean") {
    fallas.push(falla("activo", "tipo_invalido"));
    return true;
  }
  return valor;
}

/**
 * El cuerpo de `PUT /api/plantillas-modulo/{id}`, revisado.
 *
 * **Lo inmutable manda sobre lo inválido**, igual que la cita manda sobre el
 * importe en el arancel: un cuerpo con `rotuloOficial` y un `activo` que es
 * una cadena contesta `inmutable` y no `invalido`. Si contestara por el
 * `activo`, quien lo mandó arreglaría ese campo y volvería a intentar creyendo
 * que así entra el otro.
 */
export function revisarPlantilla(cuerpo: unknown): RevisionDePlantilla {
  if (!esObjeto(cuerpo)) {
    return {
      estado: "invalido",
      fallas: [falla("rotulo", "tipo_invalido")],
    };
  }

  const inmutables = inmutablesEn(cuerpo);
  if (inmutables.length > 0) {
    return { estado: "inmutable", campos: inmutables };
  }

  const fallas: FallaDeValidacion[] = [];

  const rotulo = textoEditable(cuerpo, "rotulo");
  if (!rotulo.ok) fallas.push(falla("rotulo", "tipo_invalido"));

  const descripcion = textoEditable(cuerpo, "descripcion");
  if (!descripcion.ok) fallas.push(falla("descripcion", "tipo_invalido"));

  const activo = vigencia(cuerpo, fallas);

  if (fallas.length > 0) return { estado: "invalido", fallas };

  return {
    estado: "ok",
    datos: {
      rotulo: rotulo.ok ? rotulo.valor : null,
      descripcion: descripcion.ok ? descripcion.valor : null,
      activo,
    },
  };
}

/** Lo que hace falta saber de la fila guardada para decidir si se puede vaciar. */
export interface PresetDePlantilla {
  readonly rotuloOficial: string | null;
  readonly descripcionOficial: string | null;
}

/**
 * Qué campos quedarían **sin valor vigente** si se guardaran estos datos.
 *
 * Es la mitad de arriba de los dos `CHECK` de `0016`
 * —`la_plantilla_tiene_rotulo_vigente` y
 * `la_plantilla_tiene_descripcion_vigente`—, y las dos mitades hacen falta
 * por el reparto de siempre: el `CHECK` es el que sobrevive a un script de
 * importación, y esto es lo que deja contestar una negativa que la pantalla
 * puede explicar en vez de un `SQLITE_CONSTRAINT_CHECK` convertido en 500.
 *
 * Se evalúa contra la **fila guardada** y no contra el cuerpo, y no podría ser
 * de otra manera: el preset no viaja en la petición —es inmutable, ver
 * `CAMPOS_INMUTABLES`— así que quien edita no lo manda y no podría mandarlo.
 * Es la misma forma que `fijarMonto` usa para decidir si un renglón es un
 * rubro.
 *
 * Los nombres devueltos son los **del cable**, y en orden alfabético por lo
 * mismo que `CAMPOS_INMUTABLES`: la negativa tiene que verse igual
 * independientemente de cómo se armó el JSON.
 *
 * Hoy esto devuelve siempre la lista vacía sobre las seis filas sembradas, y
 * eso no lo vuelve decorativo: lo que lo vuelve necesario es que las dos
 * columnas del preset sean nullable a propósito. Una plantilla propia de la
 * tajada 2 nace sin piso, y entonces vaciar su descripción no es volver atrás
 * —no hay a dónde— sino dejar una plantilla que la IA va a usar mal, que es
 * el defecto exacto que esta tajada vino a arreglar.
 */
export function camposSinPreset(
  preset: PresetDePlantilla,
  datos: DatosDePlantilla,
): string[] {
  const campos: string[] = [];

  if (datos.descripcion === null && preset.descripcionOficial === null) {
    campos.push("descripcion");
  }
  if (datos.rotulo === null && preset.rotuloOficial === null) {
    campos.push("rotulo");
  }

  return campos;
}

/**
 * El valor vigente de un par preset/bufete.
 *
 * Es `COALESCE(bufete, preset)` escrito en TypeScript, y existe para que la
 * resolución viva en **un** lugar: el `SELECT` del repositorio ya la hace en
 * SQL para la lectura, pero el registro de bitácora necesita el rótulo
 * vigente **nuevo** —el que la escritura acaba de dejar— antes de releer la
 * fila. Calcularlo a mano al lado del `mutar` sería la segunda copia de la
 * regla, y la que se queda vieja el día que el `COALESCE` cambie de orden.
 *
 * Devuelve `null` solo si los dos son nulos, que es el caso que
 * `camposSinPreset` rechaza antes de llegar acá y que los dos `CHECK` de la
 * base niegan debajo.
 */
export function valorVigente(
  propio: string | null,
  oficial: string | null,
): string | null {
  return propio ?? oficial;
}

/* ==========================================================================
   El alta (T-7)

   La tajada 1 no tenía alta, y el motivo está escrito en el encabezado de
   `repositorio.ts`: mientras `cotizacion_modulo.tipo` estuvo cerrado por el
   `CHECK` de `0004`, una plantilla nueva era una plantilla **inservible**. El
   techo lo quitó `0017` —la columna es `plantilla_id`, una referencia a esta
   tabla—, así que lo que falta acá es acuñar la clave.

   Las palabras del usuario, mirando la pantalla de la tajada 1:

   > «No veo la opción de crear un módulo, sólo editar y dar de baja.»
   ========================================================================== */

/**
 * El tope de una clave acuñada, en caracteres.
 *
 * Existe porque el rótulo lo escribe una persona y **la clave viaja fuera de
 * esta tabla**: la copia la IA en su respuesta, la congela el snapshot al
 * emitir y la guarda cada `cotizacion_modulo` por llave foránea. Un rótulo de
 * un párrafo acuñaría un identificador de un párrafo, y eso se ve en el
 * prompt, en la pantalla de catálogos y en toda consulta que la imprima.
 *
 * Cuarenta y no veinte: la más larga de las seis sembradas es `nota_cliente`
 * con 12, y `observaciones_del_cliente` —el ejemplo que el usuario dio— tiene
 * 25. Un tope de veinte lo habría cortado, que es exactamente el caso que esta
 * tarea existe para servir.
 *
 * La columna **no** tiene límite de largo, y es a propósito: un `CHECK` de
 * longitud en la base habría convertido este tope en una restricción del
 * esquema, y entonces subirlo mañana sería una migración. Lo que la base
 * sostiene es la unicidad, que es la regla que de verdad no se puede violar.
 */
export const LARGO_MAXIMO_DE_LA_CLAVE = 40;

/**
 * La clave que le corresponde a un rótulo, o `null` si no le corresponde
 * ninguna.
 *
 * El abogado nombra «Observaciones del cliente» y esto acuña
 * `observaciones_del_cliente`. **La clave no se teclea nunca**, y eso no es
 * comodidad: es que la clave es inmutable desde que nace
 * —`modulo_plantilla_clave_inmutable`— así que un campo para escribirla sería
 * un campo cuyo error no se puede corregir. El rótulo sí se corrige, y
 * corregirlo no toca la clave, que es toda la gracia de que estén separadas.
 *
 * ## Los cuatro pasos, en este orden, y el orden importa
 *
 *  1. **Descomponer en NFD y tirar las marcas combinantes.** Es el paso que
 *     decide, y el único que no es obvio: sin él, `Cláusulas` acuñaría
 *     `cl_usulas`, porque la `á` no es `[a-z0-9]` y caería en el separador
 *     partiendo la palabra al medio. Descompuesta, la `á` es una `a` seguida
 *     de un acento combinante, así que tirar el acento deja la letra. Vale
 *     igual para la eñe —`Año` da `ano`, que es un artefacto conocido y
 *     aceptado: la clave es un identificador interno y el rótulo es lo que la
 *     persona lee— y para la diéresis.
 *  2. **Minúsculas.** Dos rótulos que difieren solo en mayúsculas son el
 *     mismo módulo escrito dos veces, y el único de `(tenant_id, clave)` tiene
 *     que verlo.
 *  3. **Toda corrida de lo que no es `[a-z0-9]` es un separador, uno solo.**
 *     Los espacios, los signos, los guiones y lo que quede de un emoji. Una
 *     corrida y no un carácter por separador: `Gastos / Tasas` tiene tres
 *     caracteres entre las dos palabras y una sola junta.
 *  4. **Los separadores de los extremos se van.** `¡¿Qué?!` acuña `que` y no
 *     `_que_`: una clave que empieza o termina en `_` se lee como un
 *     identificador partido al medio.
 *
 * Y después el tope, que se aplica **al final**: cortar antes de juntar las
 * corridas dejaría el corte dependiendo de cuántos espacios había. El corte es
 * al carácter y no a la palabra, y eso es deliberado: cortar en el último `_`
 * dejaría sin clave a un rótulo que es una sola palabra de más de cuarenta
 * letras, que es justo el caso que el tope tiene que resolver. Lo que sí se
 * quita es el separador que el corte pudo dejar al final.
 *
 * ## Devuelve `null`, y ése es el primero de los dos 422 de esta tarea
 *
 * Un rótulo de solo signos o solo emoji es un rótulo escribible del que no
 * queda **nada** utilizable. Eso tiene que ser una negativa que alguien pueda
 * leer: sin esto, la clave llegaría vacía a un `INSERT` y lo que saldría sería
 * un `CHECK`, un único o un `NOT NULL` de SQLite envuelto en un 500 — y un 500
 * no es una negativa, es una caída.
 *
 * El `null` **no** significa «el rótulo está vacío»: eso es otro problema, con
 * otro motivo y otra salida, y `revisarAltaDePlantilla` los separa.
 */
export function acunarClave(rotulo: string): string | null {
  const juntado = rotulo
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (juntado === "") return null;

  // El corte no puede dejar la clave vacía: `juntado` no tiene separador al
  // principio, así que su primer carácter es una letra o un número y
  // sobrevive a cualquier tope mayor que cero.
  return juntado.slice(0, LARGO_MAXIMO_DE_LA_CLAVE).replace(/_+$/, "");
}

/**
 * Lo que un alta de plantilla escribe, ya normalizado y con su clave acuñada.
 *
 * Los dos textos son `string` y no `string | null`, al revés que
 * `DatosDePlantilla`, y la asimetría **es la tarea**: una plantilla nueva no
 * tiene preset debajo, así que el nulo no significa «uso el preestablecido»
 * —no hay ninguno— sino «esta fila no tiene valor vigente», que es lo que los
 * dos `CHECK` de `0016` niegan. Lo que en la edición es la forma de volver
 * atrás, acá es la fila que no puede existir.
 *
 * No lleva `activo` ni `orden`. Una plantilla **nace vigente**, igual que un
 * catálogo de T-6 —`BORRADOR_DE_CATALOGO_VACIO` lo dice: «un catálogo recién
 * creado tiene que poder elegirse sin un segundo paso»— y su posición es la
 * última, que es un `MAX(orden) + 1` y por lo tanto cosa del repositorio.
 */
export interface DatosDeAlta {
  readonly clave: string;
  readonly rotulo: string;
  readonly descripcion: string;
}

/**
 * Lo que puede salir de mirar el cuerpo de un alta.
 *
 * Las tres variantes son las mismas que `RevisionDePlantilla` y por los mismos
 * motivos, con una diferencia en qué cae en cada una: acá el rótulo vacío y el
 * rótulo que no acuña nada son dos `invalido` con **motivos distintos**. Son
 * dos problemas distintos y la salida que ofrecen es distinta —uno pide
 * escribir algo, el otro pide escribir algo *con letras*— y aplastarlos
 * dejaría a la pantalla diciendo «el rótulo es obligatorio» sobre un campo que
 * tiene texto.
 */
export type RevisionDeAlta =
  | { estado: "ok"; datos: DatosDeAlta }
  | { estado: "inmutable"; campos: string[] }
  | { estado: "invalido"; fallas: FallaDeValidacion[] };

/**
 * Un texto obligatorio del cuerpo de un alta, recortado.
 *
 * Devuelve el motivo en vez de empujarlo, para que quien llama decida cuál es
 * —el del rótulo y el de la descripción son distintos— sin que esta función
 * tenga que conocer los dos.
 */
function textoObligatorio(
  crudo: Record<string, unknown>,
  campo: string,
  siFalta: MotivoDeFalla,
): { ok: true; valor: string } | { ok: false; motivo: MotivoDeFalla } {
  const valor = crudo[campo];

  if (valor === undefined || valor === null) {
    return { ok: false, motivo: siFalta };
  }
  if (typeof valor !== "string") return { ok: false, motivo: "tipo_invalido" };

  const limpio = valor.trim();
  // En blanco es lo mismo que ausente, igual que en la edición. Acá además es
  // lo único que puede ser: sin preset debajo, un rótulo de tres espacios es
  // una fila que el `CHECK` de la base acepta y la hoja dibuja en blanco.
  return limpio === "" ? { ok: false, motivo: siFalta } : { ok: true, valor: limpio };
}

/**
 * El cuerpo de `POST /api/plantillas-modulo`, revisado.
 *
 * **Lo inmutable manda sobre lo inválido**, igual que en la edición y por el
 * mismo motivo. Y acá la lista de inmutables dice algo más fuerte que allá: en
 * la edición esos tres campos *existen y no se escriben*; en el alta, dos de
 * los tres —el preset— **nacen nulos a propósito**. Una plantilla propia del
 * bufete no tiene piso al que volver, y fabricárselo desde el cuerpo sería
 * sembrar un preset que nadie publicó, que es lo contrario de lo que el preset
 * significa.
 *
 * `activo` y `orden` se ignoran en silencio, y eso no contradice lo de arriba:
 * el argumento es el que `CAMPOS_INMUTABLES` ya tiene escrito —«un campo que
 * se ignora porque la operación no existe no es un campo prohibido»—. Acá no
 * es que la operación no exista: es que el alta no la decide.
 *
 * Devuelve **las dos fallas y no la primera**, por lo mismo que
 * `validarTipoProceso`: un formulario que corrige de a un error por envío es
 * el que hace que nadie cargue nada.
 */
export function revisarAltaDePlantilla(cuerpo: unknown): RevisionDeAlta {
  if (!esObjeto(cuerpo)) {
    return { estado: "invalido", fallas: [falla("rotulo", "tipo_invalido")] };
  }

  const inmutables = inmutablesEn(cuerpo);
  if (inmutables.length > 0) {
    return { estado: "inmutable", campos: inmutables };
  }

  const fallas: FallaDeValidacion[] = [];

  const rotulo = textoObligatorio(cuerpo, "rotulo", "rotulo_requerido");
  if (!rotulo.ok) fallas.push(falla("rotulo", rotulo.motivo));

  const descripcion = textoObligatorio(
    cuerpo,
    "descripcion",
    "descripcion_de_modulo_requerida",
  );
  if (!descripcion.ok) fallas.push(falla("descripcion", descripcion.motivo));

  // La acuñación se intenta sólo si hay rótulo: sobre un rótulo ausente,
  // `acunarClave` devolvería `null` igual y la pantalla recibiría dos fallas
  // sobre el mismo campo diciendo cosas distintas del mismo vacío.
  const clave = rotulo.ok ? acunarClave(rotulo.valor) : null;
  if (rotulo.ok && clave === null) {
    fallas.push(falla("rotulo", "rotulo_sin_clave"));
  }

  if (fallas.length > 0) return { estado: "invalido", fallas };

  return {
    estado: "ok",
    datos: {
      // El `as` y las dos cadenas de reserva son inalcanzables: si la clave
      // fuera nula o cualquiera de los dos textos hubiera fallado, la lista
      // de fallas no estaría vacía y el `return` de arriba ya salió. Se
      // escriben así y no con una aserción por cada uno porque lo que se
      // vería el día que esto se rompiera es una plantilla con el texto en
      // blanco, que el `CHECK` de la base rechaza, y no un `undefined`
      // navegando por el cable.
      clave: clave as string,
      rotulo: rotulo.ok ? rotulo.valor : "",
      descripcion: descripcion.ok ? descripcion.valor : "",
    },
  };
}
