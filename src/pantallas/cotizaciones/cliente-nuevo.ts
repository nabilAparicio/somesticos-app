/**
 * El cliente que nace desde el alta de cotización: qué campos lleva el modal
 * y cómo esos campos se vuelven el borrador que la validación ya conoce.
 *
 * Sin React y sin DOM, como el resto de la lógica de pantalla.
 *
 * ## Por qué este módulo existe, si no valida nada
 *
 * Porque **no valida nada** es justamente el punto. La validación y la
 * conversión a petición son las de `src/pantallas/clientes/formulario.ts`, sin
 * una línea propia: `validarBorrador` y `aPeticion`, tal cual. Las palabras
 * del usuario piden «una identidad rápida» para un lead, no un cliente de
 * otra clase, y la única forma de que las dos puertas no se desincronicen es
 * que atraviesen la misma función. Una segunda validación escrita acá sería
 * la que acepta un cliente que `/clientes/nuevo` rechaza — y sería ésa la que
 * se afloje, porque la otra ya tiene pruebas.
 *
 * Lo único que hace falta inventar es **qué controles dibuja el modal**, que
 * es la lista de abajo. El estado que esos controles llenan es el borrador
 * entero, de `clientes/formulario.ts`, sin ninguna conversión intermedia: ver
 * «Qué campos» para el porqué de que ya no haga falta ninguna.
 *
 * ## Qué campos: la ficha completa
 *
 * Los ocho del borrador, que es un cambio de alcance y las palabras del
 * usuario lo decidieron:
 *
 * > «Deja los campos opcionales, están bien. El modal es compacto y tenemos
 * > espacio.»
 *
 * Hasta acá eran cuatro —nombre, teléfono, correo y tipo— con el argumento de
 * que el resto de la ficha se completaba después, desde la pantalla del
 * cliente. Ese argumento tenía un costo que el modal pagaba en voz alta: un
 * párrafo que pedía disculpas por el cliente «cargado a medias», y que el
 * commit `b686c72` sacó por inútil. Con la ficha completa **esa categoría no
 * existe**: el modal es `/clientes/nuevo` sin salir de la cotización, y nada
 * de lo que se carga por esta puerta queda a medio llenar.
 *
 * Lo que no cambió es qué se exige: nombre y un medio de contacto, el
 * criterio de T-5. Los cuatro campos nuevos son opcionales de verdad, y su
 * propia etiqueta lo dice.
 *
 * Y una consecuencia que el alcance viejo tapaba: `documento_incompleto` —la
 * regla de `validarBorrador` que pide el documento con tipo **y** número—
 * era inalcanzable desde un modal que no preguntaba el documento. Ahora vale
 * acá, y se puede corregir acá, que es la condición para que una falla se
 * pueda mostrar: una falla sobre un campo que no se dibuja es una falla que
 * nadie puede resolver.
 *
 * ## Por qué los rótulos están dos veces, y no compartidos
 *
 * Los rótulos y las dos ayudas son **letra por letra** los de
 * `FormularioDeCliente.tsx`, y son literales escritos dos veces a propósito.
 * No es descuido: las dos pantallas describen sus campos con tipos distintos
 * —allá un `obligatorio?: boolean`, acá una `exigencia` de tres estados,
 * porque el modal tiene que poder decir «uno de los dos»— y una constante
 * compartida entre dos listas que ya difieren en forma es una constante que
 * la primera divergencia parte en dos. El día que el modal necesite un rótulo
 * más corto por el ancho, una constante común lo cambiaría también en la
 * pantalla completa, que tiene el espacio.
 *
 * Lo que mantiene a los dos juegos iguales es una medición, no un tipo:
 * `e2e/cotizaciones.spec.ts` lee las etiquetas de `/clientes/nuevo` y las del
 * modal en un navegador y las enfrenta. Un renombre en cualquiera de las dos
 * puertas falla ahí.
 *
 * ## Y los textos del campo al que ese botón acompaña (T-1 de
 * `odd/tasks/el-selector-de-cliente-busca.md`)
 *
 * El selector de cliente pasó de `<select>` a combobox buscable, y sus textos
 * están al final de este archivo. Viven acá y no en `./combobox.ts` por
 * pertenencia —aquél es la mecánica, que no sabe de qué dominio son las
 * opciones que recorre— y viven junto al rótulo del botón por una razón que se
 * lee en las frases: **lo que se dice cuando no hay ningún cliente es un
 * puntero a ese botón**, y la ayuda de siempre lo vuelve a nombrar. Separarlos
 * dejaría la frase en un archivo y el control que nombra en otro, que es cómo
 * una de las dos mitades se renombra sola.
 */

import type { CampoDelBorrador } from "../clientes/formulario";

/**
 * Qué campo del borrador llena un control del modal.
 *
 * Es `CampoDelBorrador` menos el tipo de cliente, y las dos mitades de ese
 * `Exclude` hacen trabajo. La primera: la lista de abajo no puede nombrar un
 * campo que el borrador no tenga, así que el control sin estado —el error de
 * tipeo que dibuja un campo que no guarda nada— deja de ser posible de
 * escribir. La segunda: el tipo de cliente **no puede** entrar en la lista,
 * porque no es un control de texto sino un desplegable que necesita el
 * catálogo, y el componente lo dibuja aparte.
 *
 * Hasta esta tajada acá había un `Pick` del borrador —`ValoresDelClienteNuevo`,
 * los cuatro campos que el modal tenía en la mano— y el modal guardaba su
 * estado en ese subconjunto. Con la ficha completa ese `Pick` sería el
 * borrador entero, o sea un alias que no dice nada y que hay que recordar
 * ampliar; se fue, y con él `borradorDelClienteNuevo`, que completaba los
 * campos faltantes con cadenas vacías y hoy sería la función identidad. El
 * modal guarda directamente un `BorradorDeCliente`, que nace de
 * `BORRADOR_VACIO`: el campo que el borrador gane mañana nace vacío sin que
 * nadie lo recuerde, que era la garantía por la que esa función existía.
 */
export type CampoEditableDelClienteNuevo = Exclude<
  CampoDelBorrador,
  "tipoClienteId"
>;

type RasgosDelCampo = {
  readonly campo: CampoEditableDelClienteNuevo;
  readonly rotulo: string;
  /**
   * Qué exige este campo, dicho **en su propia etiqueta**.
   *
   * Es la convención de `FormularioDeCliente.tsx`, que la escribe así: «el
   * resto se marca "opcional" en la propia etiqueta, **no en una ayuda al
   * pie**». El modal la estaba contradiciendo: marcaba los dos contactos como
   * «opcional» —que es falso, porque uno de los dos hace falta— y después
   * corregía esa mentira con un párrafo arriba del formulario. La etiqueta
   * que dice la verdad vuelve innecesario el párrafo.
   *
   * Por eso son tres estados y no un booleano: hay un requisito que no es ni
   * «este campo» ni «ninguno», sino **uno de estos dos**.
   */
  readonly exigencia: "obligatorio" | "uno de los dos" | "opcional";
  /**
   * La aclaración al pie del campo, cuando el rótulo no alcanza.
   *
   * Sólo dos campos la llevan, y son los mismos dos del formulario completo:
   * «tipo de documento» no dice qué se espera adentro, y el representante
   * legal sólo tiene sentido cuando el cliente es una entidad.
   */
  readonly ayuda?: string;
};

/**
 * Un campo de una línea: un `<input>`, con el teclado que le corresponde.
 *
 * `tipo` vive en esta mitad de la unión y no en los rasgos comunes porque un
 * `<textarea>` no tiene `type`: un `tipo: "email"` sobre las notas sería un
 * dato que el dibujo no puede obedecer.
 */
export type CampoDeTextoDelClienteNuevo = RasgosDelCampo & {
  readonly control: "texto";
  readonly tipo: "text" | "email" | "tel";
};

/** Un campo de varias líneas: un `<textarea>`. */
export type CampoDeProsaDelClienteNuevo = RasgosDelCampo & {
  readonly control: "prosa";
};

/**
 * Qué control es cada campo, dicho **en el dato**.
 *
 * La alternativa era la del formulario completo: la lista asume `<input>` y
 * las notas se dibujan aparte, a mano, debajo de la rejilla. Acá no sirve, y
 * la razón es la asimetría que esta tajada creó: allá hay un solo campo fuera
 * de la lista y la lista es de seis; acá el modal **es** la ficha completa, y
 * un campo que vive fuera de la lista es un campo que ninguna prueba de
 * función ve. La lista es lo que `test/cliente-nuevo-ui.spec.ts` lee para
 * afirmar que las dos puertas preguntan lo mismo, y un `<textarea>` escrito
 * en el JSX queda afuera de esa cuenta.
 *
 * La otra forma del mismo defecto es un `if (campo === "notas")` enterrado en
 * el componente: distinguir un campo por su nombre funciona hasta que hay un
 * segundo campo de prosa, y entonces falla en silencio dibujando un `<input>`.
 * Con un discriminante el dibujo sale del dato y no del nombre.
 */
export type CampoDelClienteNuevo =
  | CampoDeTextoDelClienteNuevo
  | CampoDeProsaDelClienteNuevo;

/**
 * La ficha completa, en el orden del formulario completo: primero cómo se
 * llama y cómo se le vuelve a hablar, después lo que se averigua con el
 * expediente en la mano, y las notas al final porque son las que más ocupan.
 *
 * Es el mismo orden y los mismos rótulos que `FormularioDeCliente.tsx`, y eso
 * no es decoración: quien carga un cliente por las dos puertas tiene que
 * reconocer los campos, y «Correo» en una y «Email» en la otra se lee como
 * dos campos distintos. El porqué de que sean literales y no una constante
 * compartida está en el encabezado.
 *
 * El tipo de cliente no está en esta lista porque no es un campo de texto: es
 * un desplegable que necesita el catálogo, y el componente lo dibuja aparte,
 * en el mismo lugar de la rejilla en que lo dibuja el formulario completo.
 */
export const CAMPOS_DEL_CLIENTE_NUEVO: readonly CampoDelClienteNuevo[] = [
  {
    campo: "nombre",
    rotulo: "Nombre",
    control: "texto",
    tipo: "text",
    exigencia: "obligatorio",
  },
  {
    campo: "telefono",
    rotulo: "Teléfono",
    control: "texto",
    tipo: "tel",
    exigencia: "uno de los dos",
  },
  {
    campo: "email",
    rotulo: "Correo",
    control: "texto",
    tipo: "email",
    exigencia: "uno de los dos",
  },
  {
    campo: "documentoTipo",
    rotulo: "Tipo de documento",
    control: "texto",
    tipo: "text",
    exigencia: "opcional",
    ayuda: "Cédula, RUC, pasaporte…",
  },
  {
    campo: "documentoNumero",
    rotulo: "Número de documento",
    control: "texto",
    tipo: "text",
    exigencia: "opcional",
  },
  {
    campo: "representanteLegal",
    rotulo: "Representante legal",
    control: "texto",
    tipo: "text",
    exigencia: "opcional",
    ayuda: "Quién firma, cuando el cliente es una entidad.",
  },
  {
    campo: "notas",
    rotulo: "Notas",
    control: "prosa",
    exigencia: "opcional",
  },
] as const;

/*
 * Las dos guardias que el componente usa para partir la lista en dos dibujos:
 * los campos cortos van en la rejilla, junto al desplegable del tipo, y la
 * prosa va entera debajo, a todo el ancho.
 *
 * Son funciones y no un `filter` con la comparación escrita en el JSX porque
 * lo que hace falta es el estrechamiento de tipo: sin él, `tipo` no existe
 * sobre la unión y el `<input>` se quedaría sin su teclado.
 */

export function esCampoDeTexto(
  campo: CampoDelClienteNuevo,
): campo is CampoDeTextoDelClienteNuevo {
  return campo.control === "texto";
}

export function esCampoDeProsa(
  campo: CampoDelClienteNuevo,
): campo is CampoDeProsaDelClienteNuevo {
  return campo.control === "prosa";
}

/* --- Los textos del modal ------------------------------------------------
 *
 * Viven acá y no dentro del componente por lo mismo que los de
 * `cotizaciones/lineas.ts`: son la parte de la pantalla que una prueba puede
 * leer sin un navegador, y tenerlos sueltos entre el JSX los vuelve
 * invisibles para cualquier revisión.
 */

export const TITULO_DEL_CLIENTE_NUEVO = "Cliente nuevo";

/** El nombre accesible del botón que abre el modal, y su texto visible. */
export const ROTULO_DE_ABRIR_CLIENTE_NUEVO = "Crear un cliente nuevo";

/**
 * Una línea, y las etiquetas hacen el resto.
 *
 * Acá había **dos párrafos**: uno explicaba que con el nombre y un contacto
 * alcanzaba, y el otro que el cliente no era de segunda. Los dos se fueron
 * por pedido del usuario —«algo como "rellená los datos de un nuevo cliente"
 * es suficiente»— y tenía razón por una razón que vale escribir: ninguno de
 * los dos decía nada que la pantalla no pudiera decir sin párrafos.
 *
 * El primero existía para **corregir una etiqueta que mentía**: los dos
 * contactos decían «opcional» cuando uno de los dos hace falta. Arreglada la
 * etiqueta (ver `exigencia`), el párrafo sobra. El segundo contestaba una
 * pregunta que nadie se hace frente a un formulario; y si alguien se la hace,
 * la respuesta está donde se busca, que es la ficha del cliente.
 *
 * Y con la ficha completa adentro el segundo párrafo quedó además **falso**:
 * ya no hay un cliente de segunda del que avisar, porque el modal pregunta lo
 * mismo que `/clientes/nuevo`. Una línea que diga de qué es el formulario
 * alcanza; lo que exige cada campo lo dice su etiqueta.
 */
export const AYUDA_DEL_CLIENTE_NUEVO = "Complete los datos del cliente nuevo.";

export const ROTULO_DE_CREAR_CLIENTE = "Crear cliente";

/* --- Los textos del selector de cliente (T-1) ----------------------------
 *
 * El porqué de que vivan en este archivo está en el encabezado. Lo que sigue
 * es el vocabulario del campo: cómo se llama, qué invita a hacer, cómo se
 * anuncia su lista, y las dos cosas que dice cuando no tiene nada que ofrecer.
 */

/**
 * El rótulo a la vista. Una palabra, y no «Elegir el cliente».
 *
 * Corto porque el campo convive con el botón en la misma franja y porque la
 * marca de obligatorio va pegada: «Cliente · obligatorio» es el nombre
 * accesible entero, y de ahí para arriba el rótulo ocupa dos renglones a
 * 320px. Lo que hay que decir es **qué dato va ahí**, y para eso alcanza una
 * palabra: qué se hace con el campo lo dice el marcador de abajo.
 */
export const ROTULO_DEL_CLIENTE = "Cliente";

/**
 * Lo que dice el campo vacío.
 *
 * Hace falta y es nuevo: un `<select>` se abría, y de esto hay que enterarse de
 * que **se escribe**. Es la misma frase que el selector de servicio usa un
 * control más abajo, con su sustantivo, porque las dos cosas se hacen igual y
 * decirlas distinto haría creer que no.
 */
export const MARCADOR_DEL_CLIENTE = "Buscar un cliente";

/**
 * Cómo se anuncia la lista de resultados, para quien la oye y no la ve.
 *
 * **No puede ser la del otro combobox.** El detalle de una cotización dibuja un
 * `role="listbox"` por línea —«Servicios que coinciden»— y dos listas que se
 * anuncian igual son dos controles que un lector de pantalla no separa.
 */
export const NOMBRE_DE_LA_LISTA_DE_CLIENTES = "Clientes que coinciden";

/**
 * La ayuda del campo, dicha siempre.
 *
 * Dos mitades, y las dos hacen falta. La primera es que el control se teclea,
 * que es el cambio de esta tajada. La segunda es la salida —el cliente que no
 * está en la lista— y va **siempre** y no sólo cuando la lista queda vacía: la
 * pregunta «¿y si el que llamó no está?» aparece mirando una lista llena, que
 * es justo cuando un aviso condicionado a «no hay ninguno» no está.
 */
export const AYUDA_DEL_CLIENTE =
  "Escribí para buscar entre los clientes del bufete: se puede buscar por" +
  " cualquier parte del nombre, y se elige con las flechas y Enter. Si quien" +
  " llamó no está en la lista, el botón de al lado lo crea sin salir de esta" +
  " pantalla.";

/**
 * Lo que se dice cuando no hay un solo cliente que ofrecer.
 *
 * Es la frase que el texto de ayuda del formulario ya decía antes de esta
 * tajada, y se conserva entera: **nombrar el botón es la mitad del aviso**. La
 * versión anterior a la tajada del cliente nuevo decía que hacía falta un
 * cliente y dejaba a quien leía buscando dónde crearlo.
 *
 * Y no manda a otra pantalla a propósito: el botón de al lado crea el cliente
 * acá, que es exactamente el viaje que esa tajada ahorró.
 */
export const SIN_CLIENTES =
  "Todavía no hay ningún cliente. Para cotizar hace falta uno, y el botón de" +
  " al lado lo crea sin salir de esta pantalla.";

/**
 * Lo que se dice cuando la búsqueda no encuentra ningún cliente.
 *
 * Entrecomilla lo buscado, igual que `sinCoincidencias` hace con los
 * servicios: «ningún resultado» a secas no deja ver que lo que sobra es una
 * letra. Son dos funciones y no una compartida porque lo que cambia es el
 * sustantivo, y un texto genérico —«ninguna opción coincide»— diría menos en
 * los dos controles para no repetir una línea.
 */
export function sinClienteQueCoincida(consulta: string): string {
  return `Ningún cliente coincide con «${consulta}».`;
}
