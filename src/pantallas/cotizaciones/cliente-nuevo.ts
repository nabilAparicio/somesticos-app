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
