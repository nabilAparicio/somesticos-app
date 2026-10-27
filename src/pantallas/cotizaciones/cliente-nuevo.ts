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
  /** Sólo el nombre. De los contactos alcanza uno, y eso lo dice la ayuda. */
  readonly obligatorio?: boolean;
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
  { campo: "nombre", rotulo: "Nombre", tipo: "text", obligatorio: true },
  { campo: "telefono", rotulo: "Teléfono", tipo: "tel" },
  { campo: "email", rotulo: "Correo", tipo: "email" },
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
 * La regla del contacto, dicha **antes** de que alguien la descubra fallando.
 *
 * Es ayuda y no error. Un formulario que enseña su regla reprobando a quien
 * la ignoraba enseña tarde: para cuando el aviso aparece, la persona ya
 * decidió que el alta pide más de lo que pide.
 */
export const AYUDA_DEL_CONTACTO =
  "Con el nombre y un medio de contacto alcanza: un teléfono o un correo," +
  " cualquiera de los dos.";

/**
 * Que lo que nace acá no es un cliente de segunda.
 *
 * El modal muestra menos campos, no define un cliente más pobre: es el mismo
 * registro, con los campos que todavía nadie sabe. Sin esta línea, quien lo
 * usa puede creer que creó algo incompleto a propósito y volver a cargarlo
 * desde la pantalla completa.
 */
export const AYUDA_DE_LA_FICHA_COMPLETA =
  "Es un cliente igual a cualquier otro. El resto de la ficha —documento," +
  " representante legal, notas— se completa después, desde la pantalla del" +
  " cliente.";

export const ROTULO_DE_CREAR_CLIENTE = "Crear cliente";
