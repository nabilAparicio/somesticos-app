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
 * Lo único que hace falta inventar es la costura entre los cuatro campos que
 * el modal muestra y los nueve del borrador, y es la razón de
 * `borradorDelClienteNuevo`: los cinco campos que el modal no pregunta tienen
 * que llegar a `aPeticion` como cadena vacía para que salgan como `null`. Un
 * `""` guardado es un documento que existe y está en blanco, y después nada
 * lo distingue de uno que nadie preguntó; el argumento completo está en
 * `clientes/formulario.ts`. Pasar por `BORRADOR_VACIO` en vez de armar el
 * objeto a mano es lo que mantiene esa garantía cuando el borrador crezca un
 * campo: el campo nuevo nace vacío acá sin que nadie lo recuerde.
 *
 * ## Qué campos, y por qué no más
 *
 * Nombre, teléfono, correo y tipo. Son los que alcanzan para que el cliente
 * exista —el criterio de T-5: nombre y un medio de contacto— más el tipo, que
 * ya era opcional y es una sola elección de una lista. El documento, el
 * representante legal y las notas no entran: el resto de la ficha se completa
 * después, desde la pantalla del cliente, y el modal lo dice. Un campo más
 * acá es la pantalla completa metida en un modal, que es exactamente lo que
 * esta tajada no es.
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

import {
  BORRADOR_VACIO,
  type BorradorDeCliente,
} from "../clientes/formulario";

/**
 * Lo que el modal tiene en la mano: cuatro de los nueve campos del borrador.
 *
 * Es un `Pick` del borrador y no un tipo propio, así que el día que alguno de
 * esos cuatro campos se renombre allá, acá deja de compilar. Un tipo paralelo
 * se habría quedado viejo en silencio.
 */
export type ValoresDelClienteNuevo = Pick<
  BorradorDeCliente,
  "nombre" | "telefono" | "email" | "tipoClienteId"
>;

export const VALORES_DEL_CLIENTE_NUEVO_VACIOS: ValoresDelClienteNuevo = {
  nombre: "",
  telefono: "",
  email: "",
  tipoClienteId: "",
};

/**
 * Los campos de texto del modal, que son los tres que no son el tipo.
 *
 * Se escribe como `Exclude` sobre las claves de `ValoresDelClienteNuevo` y no
 * como una unión a mano: así la lista de abajo no puede nombrar un campo que
 * el modal no tiene en la mano, y el control sin estado —el defecto de tipeo
 * que dibuja un campo que no guarda nada— deja de ser posible de escribir.
 */
export type CampoDeTextoDelClienteNuevo = Exclude<
  keyof ValoresDelClienteNuevo,
  "tipoClienteId"
>;

export type CampoDelClienteNuevo = {
  readonly campo: CampoDeTextoDelClienteNuevo;
  readonly rotulo: string;
  readonly tipo: "text" | "email" | "tel";
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
};

/**
 * Los tres campos de texto, en el orden de la conversación telefónica:
 * primero cómo se llama, después cómo se le vuelve a hablar.
 *
 * Es el mismo orden y los mismos rótulos que `FormularioDeCliente.tsx`, y eso
 * no es decoración: quien carga un cliente por las dos puertas tiene que
 * reconocer los campos, y «Correo» en una y «Email» en la otra se lee como
 * dos campos distintos.
 *
 * El tipo de cliente no está en esta lista porque no es un campo de texto: es
 * un desplegable que necesita el catálogo, y el componente lo dibuja aparte.
 */
export const CAMPOS_DEL_CLIENTE_NUEVO: readonly CampoDelClienteNuevo[] = [
  {
    campo: "nombre",
    rotulo: "Nombre",
    tipo: "text",
    exigencia: "obligatorio",
  },
  {
    campo: "telefono",
    rotulo: "Teléfono",
    tipo: "tel",
    exigencia: "uno de los dos",
  },
  {
    campo: "email",
    rotulo: "Correo",
    tipo: "email",
    exigencia: "uno de los dos",
  },
] as const;

/**
 * Los cuatro valores del modal, completados hasta ser un borrador entero.
 *
 * Lo que agrega es lo que falta: los cinco campos que el modal no pregunta,
 * vacíos. Vacíos y no ausentes, porque es `aPeticion` quien los convierte en
 * `null`, y es ahí donde «no lo sabemos» se distingue de «no tiene».
 */
export function borradorDelClienteNuevo(
  valores: ValoresDelClienteNuevo,
): BorradorDeCliente {
  return { ...BORRADOR_VACIO, ...valores };
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
 * pregunta que nadie se hace frente a cuatro campos; y si alguien se la hace,
 * la respuesta está donde se busca, que es la ficha del cliente.
 *
 * Un modal con cuatro campos no necesita justificar su existencia antes de
 * dejar escribir.
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
