/**
 * El selector de servicio de una línea: un combobox buscable con el monto al
 * lado (T-2 bis de `odd/tasks/precios-en-la-cotizacion.md`).
 *
 * Las palabras del usuario, que son el criterio:
 *
 * > «El panel "Tus precios" desaparece y el dropdown que los lista pasa a tener
 * > una barra de búsqueda, y las opciones el monto al lado, y un botón que diga
 * > "listar todos".»
 *
 * ## Por qué no es un `<select>`, y no es una preferencia
 *
 * Un `<select>` nativo **no puede hacer ninguna de las tres cosas**: no filtra
 * mientras se escribe, no deja dibujar dos cosas dentro de una opción —el
 * contenido de un `<option>` es texto plano, así que el monto al lado sólo se
 * podría pegar dentro de la misma cadena— y no tiene dónde colgar un botón. Y
 * hay una cuarta razón que pesa más con 282 servicios: el teclado de un
 * `<select>` busca por prefijo del texto de la opción, así que escribir
 * «pensionado» no encuentra «Inmigrantes · Visa de pensionado o jubilado».
 *
 * Así que hace falta un combobox de verdad. **No se compra una librería por
 * esto**: este proyecto tiene exactamente `react` y `react-dom`, y lo que el
 * patrón pide son cuatro atributos y cuatro teclas. Lo que sí hace falta es
 * escribirlo completo, porque un combobox a medias es peor que un `<select>`:
 * un campo de texto con una lista debajo y sin teclado deja el control
 * inalcanzable para quien no usa mouse, **sobre un campo de dinero**.
 *
 * El patrón, entero y sin adornos:
 *
 *  - `role="combobox"` en el `<input>`, con `aria-expanded`, `aria-controls` y
 *    `aria-autocomplete="list"`;
 *  - `aria-activedescendant` apuntando a la opción activa, que es lo que hace
 *    que un lector de pantalla anuncie la opción **sin mover el foco**: el foco
 *    se queda en el campo, porque ahí es donde se sigue escribiendo;
 *  - una `<ul role="listbox">` de `<li role="option">` con `aria-selected`;
 *  - ↓ y ↑ mueven, `Enter` elige, `Escape` cierra, `Tab` sale. El anillo de foco
 *    es el global de `base.css` y no se toca.
 *
 * ## Este archivo no decide nada, y la frontera está donde siempre
 *
 * Qué servicios coinciden con lo que se escribió lo decide
 * `serviciosQueCoinciden`; qué opción queda activa al mover una flecha lo decide
 * `moverOpcionActiva`; qué texto muestra el campo cuando la línea ya tiene un
 * servicio lo decide `textoDelServicioElegido`; y qué le pasa al borrador lo
 * decide `conServicioElegido`, del lado de quien recibe `alElegir`. Las cuatro
 * se prueban sin navegador.
 *
 * Lo que queda acá es lo que **sólo** se puede escribir con el DOM enfrente: el
 * estado abierto/cerrado, la opción activa, y qué tecla llama a qué.
 *
 * ## Una sola cifra por opción, y la marca no va acá
 *
 * El monto al lado es **uno**: el que el servicio tiene. Y la marca de editado
 * **no se dibuja en este control**, que es lo que el usuario pidió con todas las
 * letras: en el selector son todos precios y nada más. La marca vive en la vista
 * expandida, con su leyenda.
 */
import { useId, useState, type KeyboardEvent } from "react";

import {
  serviciosQueCoinciden,
  textoDelServicioElegido,
  type ServicioOfrecible,
} from "../catalogos/precios";
import { ListaDeServicios } from "./ListaDeServicios";
import {
  AYUDA_DEL_SERVICIO,
  ROTULO_DE_LISTAR_TODOS,
  importeLegible,
  moverOpcionActiva,
  sinCoincidencias,
} from "./lineas";

type Props = {
  /** El catálogo ofrecible del bufete. Vacío mientras no haya cargado. */
  readonly servicios: readonly ServicioOfrecible[];
  /** El renglón que la línea ya nombra, o `""` si ninguno. */
  readonly elegido: string;
  /**
   * El concepto que la lectura resolvió del renglón de la línea.
   *
   * Hace falta para el caso en que el servicio elegido **no está** en el
   * catálogo: el bufete pudo borrarle el precio a una regla por cuantía que una
   * línea ya nombraba. Ver `textoDelServicioElegido`.
   */
  readonly conceptoDeLaLinea: string | null;
  /** La de la cotización, para que ningún importe quede sin unidad. */
  readonly moneda: string;
  /** El rótulo a la vista. Corto: la fila es angosta. */
  readonly rotulo: string;
  /**
   * El nombre accesible, cuando tiene que ser más largo que el rótulo.
   *
   * En una fila guardada lleva el puesto de la línea dentro de su familia,
   * porque en una página con seis líneas hay seis selectores y un lector de
   * pantalla los anuncia uno detrás del otro. El rótulo a la vista es su
   * prefijo, que es lo que pide WCAG 2.5.3.
   */
  readonly nombreAccesible?: string;
  /** Qué hacer con el identificador elegido. `""` es desvincular. */
  readonly alElegir: (id: string) => void;
};

export function SelectorDeServicio({
  servicios,
  elegido,
  conceptoDeLaLinea,
  moneda,
  rotulo,
  nombreAccesible,
  alElegir,
}: Props) {
  const base = useId();
  const idDelCampo = `servicio-${base}`;
  const idDeLaLista = `opciones-${base}`;
  const idDeLaAyuda = `ayuda-${base}`;

  /** Lo elegido, dicho como texto. Es el punto de partida y el de vuelta. */
  const elegidoComoTexto = textoDelServicioElegido(
    servicios,
    elegido,
    conceptoDeLaLinea,
  );

  /**
   * Lo que se está buscando, o `null` si no se está buscando nada.
   *
   * **El estado es la búsqueda y no el texto del campo**, y es la decisión que
   * hace que este componente no tenga un solo efecto. Guardar el texto obliga a
   * resincronizarlo cada vez que lo elegido cambia desde afuera —elegir en la
   * vista expandida, «Descartar» sobre una línea guardada, el catálogo que
   * termina de cargar y le da rótulo a un identificador que antes no se podía
   * nombrar— y eso es un `setState` dentro de un `useEffect`, que es a la vez
   * una cascada de renders y lo que el `eslint-plugin-react-hooks` prohíbe con
   * el argumento correcto.
   *
   * Con `null`, el campo **deriva** de lo elegido y los tres casos se arreglan
   * solos. El `null` y la cadena vacía son distintos a propósito: vacío es
   * «borré el campo», que desvincula; `null` es «no estoy buscando».
   */
  const [busqueda, setBusqueda] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [activa, setActiva] = useState(-1);
  const [listaAbierta, setListaAbierta] = useState(false);

  const texto = busqueda ?? elegidoComoTexto;

  /*
   * Sin búsqueda, la lista está **completa**. Filtrar por el nombre del propio
   * servicio elegido dejaría una sola opción —la que ya está puesta— justo
   * cuando se abre el control para cambiarla.
   */
  const visibles =
    busqueda === null ? servicios : serviciosQueCoinciden(servicios, busqueda);

  const hayCatalogo = servicios.length > 0;

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
      // envío del formulario de la línea, y robárselo dejaría el teclado sin
      // forma de guardar.
      if (!abierto || activa < 0 || activa >= visibles.length) return;
      evento.preventDefault();
      elegir(visibles[activa].id);
      return;
    }

    if (evento.key === "Escape") {
      /*
       * Cierra la lista y **deshace la búsqueda**: el campo vuelve a decir lo
       * que la línea tiene. Es lo que `Escape` significa en un combobox —abandonar
       * lo que se estaba escribiendo— y es lo que impide que quede un texto a
       * medio escribir encima de un servicio que no cambió.
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
   * precios ya usa para borrar un precio propio, y la ayuda lo dice. La
   * alternativa era un botón «quitar» por línea, o sea un control más en una
   * fila que ya tiene cinco.
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
    <div className="campo selector-de-servicio">
      <label className="campo__rotulo" htmlFor={idDelCampo}>
        {rotulo}{" "}
        {/* Sin el punto medio de `FormularioDeCliente`, a propósito: los otros
            cuatro controles de esta misma fila lo escriben así —«Trámite
            opcional»— y dos formas de decir lo mismo en un renglón se leen como
            dos cosas distintas. */}
        <span className="campo__marca campo__marca--tenue">opcional</span>
      </label>

      <div className="selector-de-servicio__caja">
        {/*
          El ancla de la lista, y es un elemento propio por una razón medida: la
          lista tiene que caer justo debajo **del campo**, y el único elemento
          que puede anclarla ahí es uno que envuelva al campo y nada más. Con el
          ancla puesta en la caja —que lleva también el botón, y que en un hueco
          angosto lo baja a su propio renglón— el `inset-block-start: 100%`
          resolvía ciento sesenta y cinco píxeles más abajo: las opciones salían
          flotando debajo del botón, separadas del campo que las produjo.
        */}
        <div className="selector-de-servicio__ancla">
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
            placeholder={hayCatalogo ? "Buscar un servicio" : undefined}
            disabled={!hayCatalogo}
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
             * abriría también cuando el foco vuelve desde la vista expandida
             * —`alCerrar` lo devuelve al campo— y quien acaba de elegir un
             * servicio en el modal vería la lista entera desplegada encima del
             * formulario sin haber pedido nada. Con el teclado la lista se abre
             * escribiendo o con las flechas, que es el camino del patrón.
             */
            onClick={() => {
              setAbierto(true);
            }}
            onBlur={alSalir}
          />

        {/*
          La lista de resultados.

          Está **siempre en el árbol** y se oculta con `hidden`, por lo mismo que
          el cajón de navegación de `Esqueleto.tsx` no se renderiza
          condicionalmente: `aria-controls` tiene que apuntar a un elemento que
          exista, y un `role="listbox"` que aparece y desaparece del árbol es un
          `aria-controls` roto la mitad del tiempo.

          **Y vive dentro de la caja del campo, no al lado.** Es la corrección de
          un defecto visto en el navegador: con la lista como hermana de la caja
          y anclada al `100%` de `.selector-de-servicio`, el «abajo» al que caía
          era el de **todo el bloque** —rótulo, campo, botón y párrafo de
          ayuda—, así que las opciones aparecían flotando media pantalla más
          abajo, debajo de la ayuda. El ancla tiene que ser el campo, y el único
          elemento que lo envuelve es éste.
        */}
        <ul
        id={idDeLaLista}
        className="selector-de-servicio__opciones"
        role="listbox"
        aria-label={`Servicios que coinciden${
          nombreAccesible === undefined ? "" : ` · ${nombreAccesible}`
        }`}
        hidden={!abierto}
      >
        {visibles.length === 0 ? (
          <li className="selector-de-servicio__vacio">
            {sinCoincidencias(texto)}
          </li>
        ) : (
          visibles.map((servicio, indice) => (
            <li
              key={servicio.id}
              id={`${idDeLaLista}-${String(indice)}`}
              className={
                indice === activa
                  ? "selector-de-servicio__opcion selector-de-servicio__opcion--activa"
                  : "selector-de-servicio__opcion"
              }
              role="option"
              aria-selected={servicio.id === elegido}
              /*
               * `onMouseDown` y no `onClick`: el `blur` del campo llega antes
               * que el clic, y `alSalir` ya habría cerrado la lista —y
               * descartado el texto— dejando el clic en el aire. Con
               * `preventDefault` el campo no pierde el foco y la elección
               * ocurre.
               */
              onMouseDown={(evento) => {
                evento.preventDefault();
                elegir(servicio.id);
              }}
            >
              <span className="selector-de-servicio__nombre">
                {servicio.rotulo}
              </span>
              {/*
                La única cifra de la opción, y es la del servicio. Sin marca de
                ninguna clase: acá son todos precios.
              */}
              <span className="selector-de-servicio__importe">
                {importeLegible(servicio.monto, moneda)}
              </span>
            </li>
          ))
        )}
        </ul>
        </div>

        {/*
          El botón que abre la vista expandida. **No lleva `boton--primario`**:
          lo que se hace en esta fila es escribir una línea, y el botón que
          manda es «Guardar». Y no es un ícono: «Listar todos» son las palabras
          del usuario, y un glifo obligaría a adivinarlas.
        */}
        <button
          type="button"
          className="boton boton--tenue"
          disabled={!hayCatalogo}
          onClick={() => {
            cerrar();
            setListaAbierta(true);
          }}
        >
          {ROTULO_DE_LISTAR_TODOS}
        </button>
      </div>

      {/*
        **Lo que falló al traer el catálogo no se dice acá**, y es una
        corrección medida: el aviso vivía dentro de este control y una
        cotización con seis líneas lo dibujaba seis veces, una por selector.
        Peor: rompía la prueba «el gasto estimado dice que es aproximado» de
        `e2e/cotizaciones.spec.ts`, que busca **el** aviso de una familia de
        líneas y se encontró con cuatro. Lo que pasa con el catálogo le pasa a
        la sección entera y se dice una sola vez arriba, al lado del aviso de
        los trámites, que ya estaba resuelto así.
      */}
      <p className="campo__ayuda" id={idDeLaAyuda}>
        {AYUDA_DEL_SERVICIO}
      </p>

      {listaAbierta && (
        <ListaDeServicios
          servicios={servicios}
          elegido={elegido}
          moneda={moneda}
          alElegir={(id) => {
            alElegir(id);
            setListaAbierta(false);
          }}
          /*
           * **El foco lo devuelve el navegador y acá no se le discute.** El
           * `<dialog>` modal lo restituye al elemento que lo abrió, que es el
           * botón «Listar todos», y eso es exactamente la disciplina que un
           * overlay tiene que cumplir: el foco vuelve de donde salió.
           *
           * La primera versión lo movía a mano al campo, con el argumento de
           * que después de elegir un servicio lo siguiente es ver qué quedó
           * escrito. **No funcionaba, y está medido**: en el momento en que
           * `alCerrar` corre, el diálogo sigue abierto —`onCancel` lo mantiene
           * abierto a propósito— y el foco está atrapado en la capa superior,
           * así que un `focus()` sobre un elemento de abajo se ignora en
           * silencio. Hacerlo bien costaba un `ref` bandera y un efecto que
           * corriera después del desmontaje: tres piezas para pelearle al
           * navegador una conducta que ya es la correcta.
           */
          alCerrar={() => {
            setListaAbierta(false);
          }}
        />
      )}
    </div>
  );
}
