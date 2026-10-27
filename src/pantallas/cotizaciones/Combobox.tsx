/**
 * El combobox buscable de la pantalla de cotización: **uno**, para los dos
 * selectores que lo necesitan (T-1 de
 * `odd/tasks/el-selector-de-cliente-busca.md`).
 *
 * ## De dónde sale este archivo, y por qué se extrajo en vez de copiarse
 *
 * Nació como el cuerpo de `SelectorDeServicio.tsx`, que T-2 bis escribió para
 * los 282 servicios con cifra del arancel. Cuando el usuario pidió lo mismo
 * para el cliente —«ese dropdown hay que mejorarlo con un buscador; ¿qué pasará
 * cuando haya 50 clientes o 100 clientes?»— había dos salidas, y el documento
 * de la tajada dejó una afuera: copiar el teclado a un segundo archivo.
 *
 * La elección se midió sobre el archivo viejo antes de tocarlo. De sus 375
 * líneas de código —sin el encabezado—, **unas 215 eran el patrón**: el estado
 * abierto/cerrado, la opción activa, las cuatro teclas, los cuatro atributos
 * del `role="combobox"`, la `<ul role="listbox">` con sus `<li role="option">`,
 * el `onMouseDown` que gana al `blur`, y el armazón del campo con su ancla.
 * **Unas 80 eran del arancel**: el importe al lado de cada opción, la moneda,
 * el botón «Listar todos» con su `<dialog>`, y el texto de reserva para un
 * servicio que dejó de estar tarifado. Dos tercios comunes contra un tercio
 * propio es lo que decide: extraer deja una implementación del teclado y dos
 * archivos cortos que sólo dicen qué son sus opciones; copiar habría dejado dos
 * de 375 que se separan en la flecha de un borde.
 *
 * ## El patrón, entero y sin adornos
 *
 *  - `role="combobox"` en el `<input>`, con `aria-expanded`, `aria-controls` y
 *    `aria-autocomplete="list"`;
 *  - `aria-activedescendant` apuntando a la opción activa, que es lo que hace
 *    que un lector de pantalla anuncie la opción **sin mover el foco**: el foco
 *    se queda en el campo, porque ahí es donde se sigue escribiendo;
 *  - una `<ul role="listbox">` de `<li role="option">` con `aria-selected`;
 *  - ↓ y ↑ mueven, `Enter` elige, `Escape` cierra, `Tab` sale. El anillo de
 *    foco es el global de `base.css` y no se toca.
 *
 * **No se compra una librería por esto**: este proyecto tiene exactamente
 * `react` y `react-dom`, y lo que el patrón pide son cuatro atributos y cuatro
 * teclas. Lo que sí hace falta es escribirlo completo, porque un combobox a
 * medias es peor que un `<select>`: un campo de texto con una lista debajo y
 * sin teclado deja el control inalcanzable para quien no usa mouse, y acá eso
 * sería **el campo obligatorio de la cotización** y **un campo de dinero**.
 *
 * ## Este archivo no decide nada
 *
 * Qué opciones coinciden con lo que se escribió lo decide
 * `opcionesQueCoinciden`; qué opción queda activa al mover una flecha lo decide
 * `moverOpcionActiva`. Las dos viven en `./combobox.ts` y se prueban sin
 * navegador. Lo que queda acá es lo que **sólo** se puede escribir con el DOM
 * enfrente: el estado abierto/cerrado, la opción activa, y qué tecla llama a
 * qué.
 *
 * Y tampoco decide de qué son sus opciones. Los textos, el contenido de cada
 * opción y el botón que acompaña al campo entran por propiedad, porque son del
 * dominio de cada selector: el de servicio dibuja un importe y abre una vista
 * expandida, el de cliente dibuja un nombre y abre un modal de alta.
 *
 * ## Las clases: una genérica que pinta y una propia que se puede medir
 *
 * El dibujo cuelga de `.combobox*`, declarado una sola vez en
 * `src/estilos/layout.css`. Además, el bloque que llega por propiedad se pone
 * en la raíz y en la fila de la lista vacía, y eso **no es decoración**: las
 * mediciones ya escritas de `e2e/precios-en-cotizacion.spec.ts` localizan el
 * selector del alta por `.selector-de-servicio` y su frase de «ningún
 * resultado» por `.selector-de-servicio__vacio`, y el selector de cliente
 * necesita el equivalente para acotar sus opciones —un `<option>` nativo tiene
 * el mismo rol que estos, así que un `getByRole("option")` sin acotar devuelve
 * también los de los desplegables de cada línea—. Son dos clases donde una
 * prueba necesita distinguir **cuál** de los dos comboboxes está mirando, y
 * ninguna más.
 */
import { useId, useState, type KeyboardEvent, type ReactNode } from "react";

import {
  moverOpcionActiva,
  opcionesQueCoinciden,
  type OpcionDelCombobox,
} from "./combobox";

type Props<T extends OpcionDelCombobox> = {
  /** Lo ofrecible. Vacío mientras no haya cargado, o si no hay nada. */
  readonly opciones: readonly T[];
  /** El identificador que ya está elegido, o `""` si ninguno. */
  readonly elegido: string;
  /**
   * Lo elegido, dicho como texto: el punto de partida del campo y el de vuelta.
   *
   * Entra por propiedad y no se deriva acá con `rotuloDeLoElegido` porque los
   * dos selectores no contestan igual el caso «elegido y fuera de la lista». El
   * de cliente no lo tiene —`clientesSeleccionables` inyecta siempre el que la
   * cotización ya tiene— y el de servicio sí: el bufete puede borrarle el
   * precio a una regla por cuantía que una línea ya nombraba, y ahí el texto
   * sale del concepto que la lectura resolvió. Que cada uno traiga su texto
   * resuelto es lo que deja ese caso resuelto en un solo lugar y no en dos.
   */
  readonly textoDeLoElegido: string;
  /** Qué hacer con el identificador elegido. `""` es desvincular. */
  readonly alElegir: (id: string) => void;
  /** El `id` del `<input>`, que es lo que el `<label for>` apunta. */
  readonly idDelCampo: string;
  /** La clase propia del bloque. El porqué está en el encabezado. */
  readonly bloque: string;
  /** El contenido del `<label>` a la vista, con su marca si lleva. */
  readonly rotulo: ReactNode;
  /**
   * El nombre accesible, cuando tiene que ser más largo que el rótulo.
   *
   * En una línea guardada lleva el puesto de la línea dentro de su familia,
   * porque en una página con seis líneas hay seis selectores y un lector de
   * pantalla los anuncia uno detrás del otro. El rótulo a la vista es su
   * prefijo, que es lo que pide WCAG 2.5.3.
   */
  readonly nombreAccesible?: string;
  /** El nombre de la lista, para quien la oye y no la ve. */
  readonly nombreDeLaLista: string;
  /** Qué dice el campo vacío. Sólo se dibuja si hay algo que buscar. */
  readonly marcadorDePosicion: string;
  /** El pie del control: la ayuda, o el aviso de lo que salió mal. */
  readonly ayuda: ReactNode;
  /** Qué se dibuja dentro de cada `<li role="option">`. */
  readonly contenidoDeLaOpcion: (opcion: T) => ReactNode;
  /** Qué se dice cuando la búsqueda no encontró nada. */
  readonly textoSinCoincidencias: (consulta: string) => string;
  /**
   * El botón que acompaña al campo dentro de la misma franja.
   *
   * Recibe `cerrar` porque los dos que hay abren algo encima: el de servicio
   * una vista expandida, el de cliente un modal de alta. Dejar la lista de
   * opciones desplegada debajo de un diálogo modal es un control abierto que
   * nadie puede tocar.
   */
  readonly accesorio?: (cerrar: () => void) => ReactNode;
  /**
   * Lo que el selector dibuja **dentro de su bloque y después de la ayuda**.
   *
   * Es el sitio del `<dialog>` de «Listar todos», y es una ranura y no un
   * hermano del componente por una razón de dibujo: el bloque es un hijo
   * directo de la `<Rejilla>` del editor de líneas, y devolver dos elementos
   * desde el selector le agregaría una celda a esa rejilla.
   */
  readonly children?: ReactNode;
};

export function Combobox<T extends OpcionDelCombobox>({
  opciones,
  elegido,
  textoDeLoElegido,
  alElegir,
  idDelCampo,
  bloque,
  rotulo,
  nombreAccesible,
  nombreDeLaLista,
  marcadorDePosicion,
  ayuda,
  contenidoDeLaOpcion,
  textoSinCoincidencias,
  accesorio,
  children,
}: Props<T>) {
  const base = useId();
  const idDeLaLista = `opciones-${base}`;
  const idDeLaAyuda = `ayuda-${base}`;

  /**
   * Lo que se está buscando, o `null` si no se está buscando nada.
   *
   * **El estado es la búsqueda y no el texto del campo**, y es la decisión que
   * hace que este componente no tenga un solo efecto. Guardar el texto obliga a
   * resincronizarlo cada vez que lo elegido cambia desde afuera —elegir en la
   * vista expandida, el cliente que nace en el modal y queda elegido, el
   * catálogo que termina de cargar y le da rótulo a un identificador que antes
   * no se podía nombrar— y eso es un `setState` dentro de un `useEffect`, que
   * es a la vez una cascada de renders y lo que el `eslint-plugin-react-hooks`
   * prohíbe con el argumento correcto.
   *
   * Con `null`, el campo **deriva** de lo elegido y todos esos casos se
   * arreglan solos. El `null` y la cadena vacía son distintos a propósito:
   * vacío es «borré el campo», que desvincula; `null` es «no estoy buscando».
   */
  const [busqueda, setBusqueda] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [activa, setActiva] = useState(-1);

  const texto = busqueda ?? textoDeLoElegido;

  /*
   * Sin búsqueda la lista está **completa**, que es lo que `opcionesQueCoinciden`
   * contesta sobre la consulta vacía. Filtrar por el nombre de lo que ya está
   * elegido dejaría una sola opción —la que ya está puesta— justo cuando se abre
   * el control para cambiarla.
   */
  const visibles = opcionesQueCoinciden(opciones, busqueda ?? "");

  /**
   * El control se apaga cuando no hay **nada** que elegir, y la regla es una
   * sola para los dos selectores: un campo de búsqueda que no puede encontrar
   * nada es un control que sobra. Quién lo dice y adónde manda es de cada
   * selector y se dice en `ayuda` — en el del cliente, al botón de al lado.
   */
  const habilitado = opciones.length > 0;

  function cerrar() {
    setAbierto(false);
    setActiva(-1);
  }

  function elegir(id: string) {
    alElegir(id);
    /* La búsqueda termina: el campo vuelve a derivar de lo elegido, que ahora
       es lo que se acaba de elegir. */
    setBusqueda(null);
    cerrar();
  }

  function alTeclear(evento: KeyboardEvent<HTMLInputElement>) {
    if (evento.key === "ArrowDown" || evento.key === "ArrowUp") {
      // El navegador mueve el cursor dentro del campo con las flechas
      // verticales; acá las flechas recorren la lista.
      evento.preventDefault();
      setAbierto(true);
      setActiva((anterior) =>
        moverOpcionActiva(
          anterior,
          visibles.length,
          evento.key === "ArrowDown" ? 1 : -1,
        ),
      );
      return;
    }

    if (evento.key === "Enter") {
      // Sólo cuando hay una opción activa: con la lista cerrada, `Enter` es el
      // envío del formulario que contiene el control, y robárselo dejaría el
      // teclado sin forma de guardar. Es lo que cierra el recorrido sin mouse:
      // se elige el cliente con `Enter` y se guarda la cotización con el
      // siguiente.
      if (!abierto || activa < 0 || activa >= visibles.length) return;
      evento.preventDefault();
      elegir(visibles[activa].id);
      return;
    }

    if (evento.key === "Escape") {
      /*
       * Cierra la lista y **deshace la búsqueda**: el campo vuelve a decir lo
       * que había elegido. Es lo que `Escape` significa en un combobox
       * —abandonar lo que se estaba escribiendo— y es lo que impide que quede
       * un texto a medio escribir encima de algo que no cambió.
       *
       * No se propaga: con el selector de una línea abierto dentro de la vista
       * expandida, un `Escape` que siguiera subiendo cerraría también el modal.
       */
      evento.stopPropagation();
      setBusqueda(null);
      cerrar();
    }
  }

  /*
   * Salir del campo cierra la lista, y además **decide qué quiso decir el
   * texto**: vacío desvincula, y cualquier otra cosa que no sea una elección se
   * descarta.
   *
   * Vaciar el campo para desvincular es el mismo gesto que la pantalla de
   * precios ya usa para borrar un precio propio, y la ayuda de cada selector lo
   * dice. La alternativa era un botón «quitar» al lado de cada control.
   */
  function alSalir() {
    if (busqueda !== null && busqueda.trim() === "") {
      if (elegido !== "") alElegir("");
      setBusqueda(null);
      cerrar();
      return;
    }

    setBusqueda(null);
    cerrar();
  }

  const opcionActiva =
    abierto && activa >= 0 && activa < visibles.length
      ? `${idDeLaLista}-${String(activa)}`
      : undefined;

  return (
    <div className={`campo combobox ${bloque}`}>
      <label className="campo__rotulo" htmlFor={idDelCampo}>
        {rotulo}
      </label>

      <div className="combobox__caja">
        {/*
          El ancla de la lista, y es un elemento propio por una razón medida: la
          lista tiene que caer justo debajo **del campo**, y el único elemento
          que puede anclarla ahí es uno que envuelva al campo y nada más. Con el
          ancla puesta en la caja —que lleva también el botón, y que en un hueco
          angosto lo baja a su propio renglón— el `inset-block-start: 100%`
          resolvía ciento sesenta y cinco píxeles más abajo: las opciones salían
          flotando debajo del botón, separadas del campo que las produjo.
        */}
        <div className="combobox__ancla">
          <input
            id={idDelCampo}
            className="campo__control"
            type="text"
            role="combobox"
            aria-expanded={abierto}
            aria-controls={idDeLaLista}
            aria-autocomplete="list"
            aria-activedescendant={opcionActiva}
            aria-describedby={idDeLaAyuda}
            aria-label={nombreAccesible}
            autoComplete="off"
            placeholder={habilitado ? marcadorDePosicion : undefined}
            disabled={!habilitado}
            value={texto}
            onChange={(evento) => {
              setBusqueda(evento.target.value);
              setAbierto(true);
              setActiva(-1);
            }}
            onKeyDown={alTeclear}
            /*
             * Tocar el campo abre la lista, que es lo que un `<select>` hacía
             * solo. **`onClick` y no `onFocus`**: con `onFocus`, la lista se
             * abriría también cuando el foco vuelve desde una capa de encima
             * —la vista expandida lo devuelve al campo, y el modal de cliente
             * nuevo al botón de al lado— y quien acaba de elegir ahí vería la
             * lista entera desplegada sin haber pedido nada. Con el teclado la
             * lista se abre escribiendo o con las flechas, que es el camino del
             * patrón.
             */
            onClick={() => {
              setAbierto(true);
            }}
            onBlur={alSalir}
          />

          {/*
            La lista de resultados.

            Está **siempre en el árbol** y se oculta con `hidden`, por lo mismo
            que el cajón de navegación de `Esqueleto.tsx` no se renderiza
            condicionalmente: `aria-controls` tiene que apuntar a un elemento
            que exista, y un `role="listbox"` que aparece y desaparece del árbol
            es un `aria-controls` roto la mitad del tiempo.

            **Y vive dentro de la caja del campo, no al lado.** Es la corrección
            de un defecto visto en el navegador: con la lista como hermana de la
            caja y anclada al `100%` del bloque, el «abajo» al que caía era el
            de **todo el bloque** —rótulo, campo, botón y párrafo de ayuda—, así
            que las opciones aparecían flotando media pantalla más abajo, debajo
            de la ayuda. El ancla tiene que ser el campo, y el único elemento
            que lo envuelve es éste.
          */}
          <ul
            id={idDeLaLista}
            className="combobox__opciones"
            role="listbox"
            aria-label={
              nombreAccesible === undefined
                ? nombreDeLaLista
                : `${nombreDeLaLista} · ${nombreAccesible}`
            }
            hidden={!abierto}
          >
            {visibles.length === 0 ? (
              <li className={`combobox__vacio ${bloque}__vacio`}>
                {textoSinCoincidencias(texto)}
              </li>
            ) : (
              visibles.map((opcion, indice) => (
                <li
                  key={opcion.id}
                  id={`${idDeLaLista}-${String(indice)}`}
                  className={
                    indice === activa
                      ? "combobox__opcion combobox__opcion--activa"
                      : "combobox__opcion"
                  }
                  role="option"
                  aria-selected={opcion.id === elegido}
                  /*
                   * `onMouseDown` y no `onClick`: el `blur` del campo llega
                   * antes que el clic, y `alSalir` ya habría cerrado la lista
                   * —y descartado el texto— dejando el clic en el aire. Con
                   * `preventDefault` el campo no pierde el foco y la elección
                   * ocurre.
                   */
                  onMouseDown={(evento) => {
                    evento.preventDefault();
                    elegir(opcion.id);
                  }}
                >
                  {contenidoDeLaOpcion(opcion)}
                </li>
              ))
            )}
          </ul>
        </div>

        {accesorio?.(cerrar)}
      </div>

      <p className="campo__ayuda" id={idDeLaAyuda}>
        {ayuda}
      </p>

      {children}
    </div>
  );
}
