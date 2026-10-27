/**
 * El encargo que se le hace al modelo: el prompt de T-9, y **la lista de
 * trámites que ese prompt ofreció**. Puro: ni D1, ni HTTP, ni entorno.
 *
 * Es la mitad de arriba de la costura de T-8. Aquella decidió que
 * `ModeloDeLenguaje` recibe `instrucciones` y `entrada` ya compuestas y que
 * **la costura no arma prompts**; esto es quien los arma.
 *
 * ## Las cuatro salidas son una sola, y eso es el archivo entero
 *
 * `encargoAlModelo` devuelve el texto **y** `tiposDeModuloOfrecidos` **y**
 * `tiposDeProcesoOfrecidos` **y** `serviciosOfrecidos`, y no hay forma de
 * pedir uno sin los otros. La razón no es comodidad:
 *
 *  - El esquema de T-8 rechaza todo `tipoProcesoId` que quien llama no haya
 *    declarado haber ofrecido. Falla cerrada, porque `tipo_proceso` es una
 *    tabla de **este** bufete y no hay catálogo en código que la pueda
 *    cerrar.
 *  - Entonces un prompt que nombra tres trámites con una lista de ofrecidos
 *    que nombra dos produce un rechazo silencioso de la tercera línea; y una
 *    lista vacía con un prompt que los nombra todos produce un borrador
 *    generado **sin un solo trámite**.
 *  - Y un borrador sin trámites es un borrador que, al ganarse la cotización,
 *    **no abre ningún proceso**: el círculo que T-7 cerró —de cotización
 *    ganada a procesos reales— queda abierto por el lado del generador, y
 *    queda abierto en silencio, porque nada falla.
 *
 * Dos valores que se tienen que corresponder y se piden por separado son dos
 * valores que un día no se corresponden. Acá se construyen del mismo arreglo,
 * en la misma pasada, y la correspondencia no se puede romper sin editar
 * estas veinte líneas.
 *
 * Con los servicios tarifados de T-3 el mismo argumento cuesta más, porque
 * `serviciosOfrecidos` no lleva sólo identificadores: **lleva el precio**. Es
 * la lista con la que el esquema valida y de la que el sistema saca el monto
 * de cada línea tarifada, así que separarla del texto permitiría un borrador
 * cuyos montos no son los que el modelo leyó para escribir la prosa — un
 * documento que se contradice consigo mismo y que nada marca como roto.
 *
 * Y con los tipos de módulo de T-4 el argumento pasa a valer para **los
 * tres** catálogos sin excepción: hasta T-3 los módulos eran el único juego
 * cerrado por una constante que el esquema también importaba, así que el texto
 * y la validación no podían discrepar aunque alguien quisiera. Ahora la lista
 * la trae la base, el esquema no tiene con qué cerrarla sola, y lo único que
 * impide que el prompt ofrezca seis plantillas y la validación acepte otras
 * es que las dos salen de este mismo arreglo.
 *
 * ## Los catálogos salen de donde viven, y nunca se copian
 *
 * Las clases de línea salen de `CATALOGO_DE_CLASES`, y las claves de cada
 * forma de `CLAVES_DE_MODULO` y `CLAVES_DE_LINEA`, que son las mismas que el
 * esquema comprueba. Una segunda lista escrita a mano acá sería la que se
 * desincroniza: el día que alguien agregue una clase de línea, el prompt la
 * ofrecería o no según se acuerde, y lo que se vería es «el generador nunca
 * usa la clase nueva».
 *
 * **Los tipos de módulo ya no salen de ninguna constante** (T-4 de
 * `odd/tasks/plantillas-de-modulo.md`): llegan como argumento, leídos de
 * `modulo_plantilla` por quien tiene la base en la mano, y traen **la
 * descripción** del módulo además de su rótulo. Ése es el motivo de la tajada
 * entera: hasta T-3 este archivo le pasaba al modelo `alcance · Alcance` y
 * nada más, así que el propósito de cada módulo lo deducía del nombre. Y es
 * además lo que borró `CATALOGO_DE_MODULOS`, que era la última copia en código
 * de los seis rótulos: con el rótulo editable desde `/catalogos/modulos`, una
 * lista escrita acá sería la que se queda vieja el día que el bufete renombre
 * un módulo.
 *
 * ## Lo que este prompt NO intenta
 *
 * **No usa salida estructurada** (`output_config`). Existe, funciona y le
 * ahorraría reintentos al modelo, y aun así la barandilla no se apoya ahí:
 * una garantía que depende de que el proveedor coopere no es una garantía, y
 * la validación propia de `worker/ia/esquema.ts` es la que manda. Hay además
 * una razón mecánica que lo cierra del todo hoy: el adaptador manda
 * **exactamente cuatro claves** en el cuerpo y tiene una prueba que lo
 * afirma, precisamente porque en Opus 5 un parámetro de más devuelve 400.
 * Agregarlo es una decisión de `worker/ia/anthropic.ts`, con su prueba, y no
 * de este archivo.
 *
 * **No precarga un turno de asistente** con un `{`, que es el truco clásico
 * para forzar JSON: el prefill fue removido en Opus 5 y devuelve 400. Por eso
 * el prompt pide JSON pelado con todas las letras, y por eso el esquema
 * rechaza un bloque con cercas en vez de desenvolverlo — desenvolverlo
 * convertiría un defecto de este archivo en una rareza intermitente que
 * aparece una vez cada veinte.
 */

import { CATALOGO_DE_CLASES } from "../cotizaciones/lineas";
import { CLAVES_DE_LINEA, CLAVES_DE_MODULO } from "./esquema";
import type { ServicioOfrecido } from "./esquema";

/**
 * Un tipo de módulo de prosa que el bufete usa, tal como el prompt lo va a
 * nombrar: su clave, su rótulo vigente y **para qué sirve**.
 *
 * Es estructural y no `PlantillaDeModulo` entera por lo mismo que
 * `TramiteOfrecido` no es `TipoProceso`: de los diez campos de una plantilla
 * el prompt necesita tres, y una prueba que arme el caso con tres en vez de
 * con diez es una prueba que se lee.
 *
 * **`rotulo` y `descripcion` son los vigentes, ya resueltos** —`COALESCE(x,
 * x_oficial)`, el criterio de `migrations/0016_…`, aplicado una sola vez en
 * `worker/plantillas/`— y no las dos columnas de cada par. Resolverlos acá
 * sería el segundo lugar donde se decide cómo se llama un módulo, y el día que
 * los dos no coincidan gana el que alguien mire primero. Es exactamente el
 * argumento con que `ServicioTarifado` lleva un `monto` y no dos.
 *
 * **No hay un campo que diga quién escribió el rótulo o la descripción**, y la
 * ausencia es la misma decisión que en `ServicioTarifado`: la marca de
 * «editado» es para una persona que quiere saber de dónde viene un texto; al
 * modelo le llega el texto y nada más. Señalarle cuál es «sólo el preset»
 * sería pedirle que juzgue, y juzgar es lo que este sistema no hace.
 */
export interface ModuloOfrecido {
  readonly clave: string;
  readonly rotulo: string;
  readonly descripcion: string;
}

/**
 * Un trámite que el bufete ofrece, tal como el prompt lo va a nombrar.
 *
 * Es estructural y no `TipoProceso` entero por lo mismo que `LineaSumable`
 * no es `LineaDeCotizacion`: lo que el prompt necesita son tres campos, y
 * una prueba que arme el caso con tres en vez de con seis es una prueba que
 * se lee. `area` es nullable porque `areaNombre` se resuelve en lectura y
 * puede faltar.
 */
export interface TramiteOfrecido {
  readonly id: string;
  readonly nombre: string;
  readonly area: string | null;
}

/**
 * Un servicio tarifado del bufete, tal como el prompt lo va a nombrar.
 *
 * Es estructural y no `RenglonDelArancel` entero por lo mismo que
 * `TramiteOfrecido` no es `TipoProceso`: lo que el prompt necesita son cuatro
 * campos de los diez que tiene un renglón.
 *
 * `monto` es **la cifra del bufete ya resuelta** —`COALESCE(monto,
 * monto_oficial)`, el criterio de `migrations/0015_un_precio_es_una_cifra.sql`—
 * y no las dos columnas: resolverla acá sería un segundo lugar donde se decide
 * cuál es el precio de un servicio, y el día que los dos no coincidan gana el
 * que alguien mire primero.
 *
 * **No hay un campo que diga quién escribió ese número**, y la ausencia es la
 * decisión de T-2 ter llevada al agente: la marca de «editado» es para una
 * persona que quiere saber de dónde viene una cifra; al modelo le llegan
 * precios y nada más. Señalarle cuál es «sólo el del acuerdo» sería pedirle que
 * juzgue, y juzgar es lo que este sistema no hace.
 */
export interface ServicioTarifado {
  readonly id: string;
  readonly concepto: string;
  readonly categoria: string;
  /** Centavos enteros, cero o más. */
  readonly monto: number;
}

/**
 * El encargo completo: el texto, y qué catálogos declara haber ofrecido.
 *
 * Los tres campos viajan juntos a `PeticionDeCompletado` y no se separan en
 * el camino. Ver el encabezado del archivo.
 */
export interface EncargoAlModelo {
  readonly instrucciones: string;
  /**
   * Las claves de módulo que el texto nombró (T-4).
   *
   * Es el tercer catálogo que viaja junto con el texto, y por el mismo motivo
   * que los otros dos: desde T-4 la lista de tipos de módulo sale de
   * `modulo_plantilla` y no de una constante, así que **el esquema no tiene
   * forma de cerrarla sola**. La cierra esta lista, que es la que el prompt
   * imprimió.
   *
   * Lo que agrega sobre lo que había es que una plantilla **dada de baja** se
   * rechaza: su clave sigue estando en el `CHECK` de `0004` y en
   * `TIPOS_DE_MODULO`, así que hasta T-3 el esquema la aceptaba. Un módulo con
   * una plantilla retirada es un módulo que el editor no puede volver a
   * ofrecer, y el modelo no tiene por qué proponerlo.
   */
  readonly tiposDeModuloOfrecidos: readonly string[];
  readonly tiposDeProcesoOfrecidos: readonly string[];
  /**
   * Los servicios tarifados que el texto nombró, **con su precio**.
   *
   * Es el catálogo con el que el esquema valida y del que el sistema saca el
   * monto de una línea tarifada, así que el mismo argumento de los trámites
   * vale acá y cuesta más: un prompt que nombra un servicio que esta lista no
   * trae produce una línea rechazada por `servicio_no_ofrecido`; y una lista
   * que trae un precio distinto del que el texto imprimió sería un borrador
   * cuyo monto no es el que el modelo leyó para escribir la prosa.
   */
  readonly serviciosOfrecidos: readonly ServicioOfrecido[];
}

/**
 * Cómo se nombra un tipo de módulo dentro del prompt: clave, rótulo y
 * descripción, separados igual que las otras dos listas de este archivo.
 *
 * **La descripción va entera y no recortada.** Las seis suman 974 caracteres
 * medidos (T-1) contra los 30.304 que pesa la sección del arancel, así que
 * recortarla ahorraría nada y le quitaría al modelo justamente la mitad de la
 * frase que dice qué *no* va en el módulo —«Sin opinión jurídica», «No repite
 * el alcance»—, que es la parte que un nombre no puede sugerir.
 */
function comoSeCompone(modulo: ModuloOfrecido): string {
  return `- ${modulo.clave} · ${modulo.rotulo} · ${modulo.descripcion}`;
}

/**
 * Los tipos de módulo del bufete, dichos para el modelo.
 *
 * **Falla cerrada cuando está vacío**, con la misma forma exacta que
 * `catalogoDeServicios`: lo dice en vez de omitir la sección. El argumento es
 * el de los precios y no el de los trámites, porque acá no hay un `null` que
 * ofrecer como salida — una propuesta generada contra un catálogo vacío es una
 * propuesta cuyos tipos de módulo el modelo inventó, y el esquema los va a
 * rechazar uno por uno con `tipo_de_modulo_desconocido` sin que nadie entienda
 * por qué. Decirle que no hay ninguno es lo que hace que devuelva `modulos`
 * vacío, que es la respuesta correcta para un bufete que dio de baja sus seis
 * plantillas.
 *
 * **Las tres frases de cómo se usan viven acá dentro y no en el arreglo de
 * instrucciones**, y ésa es la única diferencia de forma con las otras dos
 * secciones. No es prolijidad: «van en el orden en que se leen» y «no hace
 * falta que estén todos» son instrucciones sobre una lista, y con la lista
 * vacía dirían lo contrario de la frase que acaba de prohibir nombrar
 * cualquiera. La sección es una cosa o la otra, nunca las dos mitades.
 */
function catalogoDeModulos(modulos: readonly ModuloOfrecido[]): string {
  if (modulos.length === 0) {
    return (
      "Este bufete no tiene ninguna plantilla de módulo activa, así que" +
      " **ningún módulo** se puede nombrar: `modulos` va vacío, sin" +
      " excepción, y la propuesta la componen sólo las líneas de dinero."
    );
  }

  return (
    "Tipos de módulo que este bufete usa, con para qué sirve cada uno." +
    " `tipo` sólo puede ser uno de estos identificadores, copiado tal cual," +
    " y la descripción dice qué va adentro y qué no:\n" +
    modulos.map(comoSeCompone).join("\n") +
    "\n\nVan en el orden en que se leen en la propuesta. No hace falta que" +
    " estén todos: una consulta simple no lleva antecedentes, y eso no es un" +
    " error. `contenido` es la prosa, escrita para el cliente, sin títulos" +
    " adentro: el rótulo lo pone el sistema."
  );
}

/** Cómo se nombra un trámite dentro del prompt: con su área, si la tiene. */
function comoSeOfrece(tramite: TramiteOfrecido): string {
  const area = tramite.area === null ? "" : ` (${tramite.area})`;
  return `- ${tramite.id} · ${tramite.nombre}${area}`;
}

/**
 * El catálogo de trámites, dicho para el modelo.
 *
 * **Falla cerrada cuando está vacío**, y lo dice en vez de omitir la
 * sección: un prompt que simplemente no habla de trámites deja al modelo
 * libre de inventar un identificador, y entonces la propuesta entera se
 * rechaza por `tipo_de_proceso_no_ofrecido` sin que nadie entienda por qué.
 * Decirle que no hay ninguno es lo que hace que devuelva `null`, que es la
 * respuesta correcta para un bufete que todavía no cargó su catálogo.
 */
function catalogoDeTramites(tramites: readonly TramiteOfrecido[]): string {
  if (tramites.length === 0) {
    return (
      "Este bufete no tiene cargado ningún trámite todavía, así que **ningún" +
      " trámite** se puede nombrar: `tipoProcesoId` va en `null` en todas las" +
      " líneas, sin excepción."
    );
  }

  return (
    "Trámites que este bufete ofrece. `tipoProcesoId` sólo puede ser uno de" +
    " estos identificadores, copiado tal cual, o `null`:\n" +
    tramites.map(comoSeOfrece).join("\n")
  );
}

/**
 * Cómo se nombra un servicio tarifado dentro del prompt.
 *
 * **El monto va en centavos enteros**, igual que el `monto` que el prompt le
 * pide al modelo unas líneas más arriba, y no en balboas con dos decimales.
 * Las dos razones son la misma: imprimir «B/.3,200.00» obliga a dividir por
 * cien acá —aritmética en el prompt, que es exactamente lo que este sistema no
 * hace— y además le enseñaría al modelo dos formatos de dinero a la vez, con
 * lo que una línea sin servicio volvería alguna vez con el punto decimal que
 * `esMontoEnCentavos` rechaza.
 */
function comoSeTarifa(servicio: ServicioTarifado): string {
  return (
    `- ${servicio.id} · ${servicio.concepto} (${servicio.categoria}) ·` +
    ` ${String(servicio.monto)}`
  );
}

/**
 * Los precios del bufete, dichos para el modelo.
 *
 * **Falla cerrada cuando está vacío**, y lo dice en vez de omitir la sección,
 * por una razón más fuerte que la de los trámites: un prompt que simplemente
 * no habla de precios deja al modelo libre de inventar uno, que es el defecto
 * que esta tajada entera existe para cerrar. Antes de T-3 le pedíamos una cifra
 * de dinero a alguien al que no le dijimos cuánto cobra el bufete, y lo que
 * salía era un número que no venía de ningún lado.
 *
 * **Viajan los renglones con cifra, los editados y los preestablecidos**, que
 * es exactamente el catálogo que ofrece el editor de líneas. Es la corrección
 * de T-2 bis aplicada acá: si un renglón sin editar es el precio del bufete
 * para la pantalla de precios, para el editor y para la base, entonces también
 * lo es para el agente. Retenerlo sería volver a poner dos criterios distintos
 * para la misma pregunta en dos lugares del mismo sistema.
 */
function catalogoDeServicios(servicios: readonly ServicioTarifado[]): string {
  if (servicios.length === 0) {
    return (
      "Este bufete no tiene tarifado ningún servicio todavía, así que" +
      " **ningún servicio** se puede nombrar: `arancelRenglonId` va en `null`" +
      " en todas las líneas, sin excepción, y el `monto` de cada una lo" +
      " escribís vos."
    );
  }

  return (
    "Servicios que este bufete tarifa, con su precio en centavos enteros." +
    " `arancelRenglonId` sólo puede ser uno de estos identificadores, copiado" +
    " tal cual, o `null`. **El precio lo pone el sistema**: cuando pongas uno" +
    " de estos identificadores, no mandes `monto` — el sistema lo lee de esta" +
    " misma lista. Usalos siempre que la línea corresponda a uno de estos" +
    " servicios, y leé el precio para que la prosa que escribas corresponda" +
    " con lo que el bufete cobra:\n" +
    servicios.map(comoSeTarifa).join("\n")
  );
}

/**
 * El encargo, armado desde los catálogos reales del bufete.
 *
 * El texto está en segunda persona y en español neutro porque lo que produce
 * es prosa que va a leer un cliente panameño, y un prompt en inglés que pide
 * salida en español es un prompt que de vez en cuando contesta en inglés.
 */
export function encargoAlModelo(
  /**
   * Las plantillas de módulo **activas** de este bufete, con su rótulo y su
   * descripción vigentes. Va primero porque es la primera sección del texto, y
   * **vacío es válido y falla cerrado**: ver `catalogoDeModulos`.
   */
  modulos: readonly ModuloOfrecido[],
  tramites: readonly TramiteOfrecido[],
  servicios: readonly ServicioTarifado[],
): EncargoAlModelo {
  const clasesDeLinea = CATALOGO_DE_CLASES.map(
    (entrada) => `- ${entrada.clase} · ${entrada.rotulo}`,
  ).join("\n");

  const instrucciones = [
    "Sos el asistente de cotizaciones de un bufete de abogados de Panamá.",
    "Recibís la descripción de un encargo en prosa y devolvés una propuesta" +
      " de cotización: los módulos de prosa que la componen y las líneas de" +
      " dinero que la cotizan.",

    "## Lo único que no se negocia",
    "**No sumás. Nunca.** No devuelvas totales, subtotales, impuestos ni" +
      " ningún número derivado de otros: el total lo calcula el sistema" +
      " sobre las líneas. Un campo `total`, `subtotal`, `itbms` o" +
      " `moneda` en cualquier nivel hace que la propuesta entera se" +
      " descarte y el abogado se quede sin borrador.",

    "## Qué devolver",
    "Un único objeto JSON con exactamente estas dos claves:" +
      " `modulos` y `lineas`. Ninguna más.",
    `Cada módulo lleva exactamente: ${CLAVES_DE_MODULO.join(", ")}.`,
    `Cada línea lleva exactamente: ${CLAVES_DE_LINEA.join(", ")}.`,

    // El encabezado **no** cambia con el catálogo vacío, a diferencia de los
    // de servicios y trámites: «Tipos de módulo» ya es cierto con cero
    // plantillas, y los otros dos cambian porque «Los precios de este bufete»
    // sobre una lista vacía sería un título que miente.
    "## Tipos de módulo",
    catalogoDeModulos(modulos),

    "## Clases de línea",
    "`clase` sólo puede ser una de estas dos, copiada tal cual:\n" +
      clasesDeLinea,
    "`concepto` dice qué se cobra, en una línea. Un honorario es lo que cobra" +
      " el bufete; un gasto estimado es plata de terceros que el bufete" +
      " adelanta, y el cliente lo lee como aproximado.",

    "## De dónde sale el precio de cada línea",
    "Cada línea trae **uno** de estos dos campos, nunca los dos y nunca" +
      " ninguno:",
    "- `arancelRenglonId`, cuando la línea corresponde a un servicio de la" +
      " lista de abajo. Entonces **no mandes `monto`**: el precio lo pone el" +
      " sistema desde el catálogo del bufete.\n" +
      "- `monto`, cuando la línea no corresponde a ningún servicio de esa" +
      " lista —una consulta, una mensajería, un gasto—. Va en **centavos" +
      " enteros**: mil quinientos dólares son 150000. Nunca con punto" +
      " decimal, nunca como texto, nunca negativo.",
    "Una línea con los dos campos se descarta entera, y una sin ninguno" +
      " también.",

    `## ${servicios.length === 0 ? "Servicios tarifados" : "Los precios de este bufete"}`,
    catalogoDeServicios(servicios),

    `## ${tramites.length === 0 ? "Trámites" : "Trámites del bufete"}`,
    catalogoDeTramites(tramites),
    "Una línea con trámite es la que abre el expediente cuando el cliente" +
      " acepta, así que ponelo siempre que la línea corresponda a un trámite" +
      " de la lista. Una consulta, una mensajería o un gasto van con" +
      " `tipoProcesoId` en `null`, que es el caso corriente.",

    "## La forma de la respuesta",
    "Devolvé **únicamente el JSON, pelado**. Sin ``` alrededor, sin" +
      " `json` al principio, sin una frase antes ni después, sin comentarios" +
      " dentro. Cualquier carácter fuera del objeto hace que la respuesta se" +
      " descarte entera y no se intenta rescatar nada de ella.",
  ].join("\n\n");

  return {
    instrucciones,
    // Las claves que el texto acaba de imprimir, del mismo arreglo y en la
    // misma llamada. Desde T-4 esta lista es **lo único** que cierra el juego
    // de tipos de módulo: el esquema ya no tiene una constante con la que
    // compararlo, así que un camino que la recompusiera aparte aceptaría una
    // plantilla dada de baja que el prompt nunca ofreció.
    tiposDeModuloOfrecidos: modulos.map((modulo) => modulo.clave),
    // Del mismo arreglo que acaba de armar el texto, en la misma llamada.
    // Ver el encabezado: separarlos es abrir el círculo de T-7 en silencio.
    tiposDeProcesoOfrecidos: tramites.map((tramite) => tramite.id),
    // Lo mismo, y acá además viaja el precio: es la cifra que el texto
    // imprimió, no una segunda lectura del catálogo. Dos listas de precios
    // armadas por caminos distintos son un borrador cuyo monto no es el que
    // el modelo leyó para escribir la prosa.
    serviciosOfrecidos: servicios.map((servicio) => ({
      id: servicio.id,
      monto: servicio.monto,
    })),
  };
}
