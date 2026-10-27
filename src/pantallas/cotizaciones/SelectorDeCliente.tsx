/**
 * El selector de cliente del alta y la edición de una cotización: el combobox
 * de `./Combobox.tsx` con el botón de cliente nuevo al lado (T-1 de
 * `odd/tasks/el-selector-de-cliente-busca.md`).
 *
 * Las palabras del usuario, que son el criterio:
 *
 * > «Ese dropdown hay que mejorarlo con un buscador y scroll infinito. ¿Qué
 * > pasará cuando haya 50 clientes o 100 clientes?»
 *
 * ## Las dos mitades de esa frase tuvieron respuestas distintas
 *
 * El buscador entra. Un `<select>` nativo con cien opciones se recorre a ojo, y
 * su teclado busca por **prefijo** del texto de la opción: escribir «istmo» no
 * encuentra «Inmobiliaria del Istmo». Sobre el único campo obligatorio de la
 * cotización —I-1, y lo primero que se toca en la pantalla— eso es buscar en la
 * mitad del nombre.
 *
 * El scroll infinito **no entra**, y la razón es un dato y no una opinión:
 * `GET /api/clientes` no tiene `LIMIT` ni cursor, la pantalla pide la lista
 * entera una vez y la guarda en memoria, y ocho clientes pesan 751 bytes. A mil
 * clientes son 94 KB, y **scrollear de a poco un arreglo que ya está entero en
 * memoria no ahorra nada**: ni red, ni tiempo de carga, ni memoria. El scroll
 * infinito sirve para no traer filas, y eso exige que el servidor pagine. El
 * día que la respuesta se mida como un problema, el arreglo es `LIMIT` más
 * cursor en la ruta y que este control pida de a tandas: la forma de la
 * pantalla no cambia, sólo de dónde salen las opciones.
 *
 * ## Qué hay en este archivo, que es poco a propósito
 *
 * No hay un teclado. El patrón entero vive en `./Combobox.tsx`, que es el mismo
 * componente que sirve al selector de servicio de cada línea; la medición que
 * decidió extraerlo en vez de copiarlo está en su encabezado. Lo que queda acá
 * son las tres cosas que son del cliente: cómo se nombran sus opciones, qué
 * dice el pie, y el botón de al lado.
 *
 * ## El botón vive acá, dentro del bloque del campo
 *
 * Y no en el encabezado de la pantalla, que es la decisión de la tajada
 * anterior: la pregunta «¿y si el que llamó no está en la lista?» se hace
 * **mirando la lista**, así que la salida tiene que estar donde está la
 * pregunta. Lo que este archivo agrega es que ahora está dentro del mismo bloque
 * que el campo y comparte su franja, así que a 320px baja a su propio renglón
 * en vez de empujar la página.
 *
 * El modal **no** se monta acá: vive en `FormularioDeCotizacion.tsx`, que es
 * quien tiene el borrador, y tiene que ser hermano de aquel `<form>` porque un
 * formulario dentro de otro no es HTML válido. Lo que este componente hace es
 * avisar que hay que abrirlo.
 */
import type { OpcionDeCliente } from "./formulario";
import { Combobox } from "./Combobox";
import { rotuloDeLoElegido } from "./combobox";
import {
  AYUDA_DEL_CLIENTE,
  MARCADOR_DEL_CLIENTE,
  NOMBRE_DE_LA_LISTA_DE_CLIENTES,
  ROTULO_DEL_CLIENTE,
  ROTULO_DE_ABRIR_CLIENTE_NUEVO,
  SIN_CLIENTES,
  sinClienteQueCoincida,
} from "./cliente-nuevo";

type Props = {
  /**
   * Las opciones, ya armadas por `clientesSeleccionables`.
   *
   * Llegan hechas y no como la lista cruda de clientes porque esa función toma
   * dos decisiones que no son de dibujo: el orden alfabético, y que **el
   * cliente que la cotización ya tiene va siempre**, esté o no en la lista del
   * momento. Lo segundo es lo que hace que el control diga la verdad cuando la
   * lectura de clientes falló.
   */
  readonly opciones: readonly OpcionDeCliente[];
  /** El cliente elegido, o `""` si ninguno. */
  readonly elegido: string;
  /** Lo que pasó al traer la lista, dicho por `avisoDelDesplegable`, o `null`. */
  readonly aviso: string | null;
  /** Qué hacer con el identificador elegido. `""` es ninguno. */
  readonly alElegir: (id: string) => void;
  /** Que hay que abrir el modal de alta rápida. */
  readonly alCrearCliente: () => void;
};

export function SelectorDeCliente({
  opciones,
  elegido,
  aviso,
  alElegir,
  alCrearCliente,
}: Props) {
  /*
   * El renombre de `nombre` a `rotulo`, que es lo único que separa una opción
   * de cliente de lo que el combobox recorre. Se hace acá y no en
   * `clientesSeleccionables` porque aquélla es la forma que el dominio del
   * formulario usa —`avisoDelDesplegable` y la validación hablan de clientes, no
   * de opciones de un control— y porque el combobox no tiene que conocer ni a
   * los clientes ni al arancel: lo que pide son dos propiedades.
   */
  const paraElCombobox = opciones.map((opcion) => ({
    id: opcion.id,
    rotulo: opcion.nombre,
  }));

  return (
    <Combobox
      opciones={paraElCombobox}
      elegido={elegido}
      /*
       * `clientesSeleccionables` inyecta siempre el cliente que la cotización
       * tiene, así que la búsqueda de acá no puede fallar y no hay un texto de
       * reserva que inventar. Es el caso que el selector de servicio sí tiene y
       * que resuelve con su propia función.
       */
      textoDeLoElegido={rotuloDeLoElegido(paraElCombobox, elegido)}
      alElegir={alElegir}
      /*
       * El `id` se conserva literal, y no sale de `useId` como el del selector
       * de servicio: en esta pantalla hay **uno** de estos controles, no uno por
       * línea, así que no hay nada que pueda duplicarse — y es el identificador
       * con el que la pantalla se mide desde que era un `<select>`.
       */
      idDelCampo="campo-clienteId"
      bloque="selector-de-cliente"
      rotulo={
        <>
          {ROTULO_DEL_CLIENTE}
          <span className="campo__marca"> · obligatorio</span>
        </>
      }
      nombreDeLaLista={NOMBRE_DE_LA_LISTA_DE_CLIENTES}
      marcadorDePosicion={MARCADOR_DEL_CLIENTE}
      /*
       * Tres pies posibles y un solo párrafo, en este orden:
       *
       *  1. lo que salió mal al traer la lista, que manda sobre todo lo demás
       *     —sin clientes por un 403, lo útil es decir que falló la lectura y no
       *     que el bufete no tiene clientes—;
       *  2. sin ningún cliente, que no hay ninguno y que el botón de al lado lo
       *     crea. Es lo que el texto de ayuda ya decía antes de esta tajada;
       *  3. la ayuda de siempre, que dice que se escribe para buscar y vuelve a
       *     nombrar el botón.
       */
      ayuda={aviso ?? (opciones.length > 0 ? AYUDA_DEL_CLIENTE : SIN_CLIENTES)}
      contenidoDeLaOpcion={(opcion) => (
        /* El nombre y nada más. **Ninguna cifra y ningún dato de contacto**: lo
           que se elige acá es a quién se le cotiza, y un teléfono al lado
           convertiría la lista en media ficha de cliente. */
        <span className="combobox__nombre">{opcion.rotulo}</span>
      )}
      textoSinCoincidencias={sinClienteQueCoincida}
      accesorio={() => (
        /*
          El nombre accesible es el texto visible y dice el verbo entero. Un «+»
          o un «Nuevo» al lado de un control rotulado «Cliente» se lee, fuera de
          contexto, como «nuevo» a secas: el rótulo del campo no viaja con el
          botón.

          No usa el `cerrar` que el combobox le ofrece, y no es un olvido: tocar
          este botón —con el mouse o con `Tab`— saca el foco del campo, y el
          `blur` del campo ya cierra la lista.
        */
        <button
          type="button"
          className="boton boton--tenue campo__accion"
          onClick={alCrearCliente}
        >
          {ROTULO_DE_ABRIR_CLIENTE_NUEVO}
        </button>
      )}
    />
  );
}
