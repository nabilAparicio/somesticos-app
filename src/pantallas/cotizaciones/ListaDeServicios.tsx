/**
 * La vista expandida de los precios del bufete, detrás de «Listar todos»
 * (T-2 bis de `odd/tasks/precios-en-la-cotizacion.md`).
 *
 * Las palabras del usuario, que son el criterio:
 *
 * > «…y un botón que diga "listar todos". Esto abre un modal que me permite ver
 * > todos en una vista más expandida, y con un indicativo visual si es
 * > preestablecido o editado, algo sutil, una marca, un asterisco.»
 *
 * ## Se eligió el `<dialog>` nativo, y conviene decir contra qué
 *
 * El precedente de la casa para un overlay es el cajón de navegación de
 * `Esqueleto.tsx`: un velo que es un `<button>` de verdad, `inert` sobre
 * `<main>`, y un escucha de `Escape` en `window`. Ahí está escrito a mano por
 * una razón que acá **no** se cumple: ese cajón tiene que ser **no modal** por
 * encima de las 48rem —es una columna al lado del contenido— y tiene que dejar
 * el encabezado vivo, porque ahí está el botón que lo cierra. Un `<dialog>`
 * modal no puede hacer eso: en el modo ancho no habría nada que abrir.
 *
 * Esta vista no tiene esa restricción: es modal siempre. Y el `<dialog>` con
 * `showModal()` da las cuatro cosas que el cajón escribe a mano, pero como
 * conducta del navegador y no como código nuestro:
 *
 *  - el velo, que es `::backdrop` —y toma el `--color-velo` de los tokens, así
 *    que es el mismo velo del cajón y no un segundo gris—;
 *  - la inercia de todo lo que queda detrás, que es más fuerte que `inert` sobre
 *    `<main>`: incluye el encabezado, que acá sí debe quedar fuera de alcance;
 *  - `Escape`, sin escucha global;
 *  - el foco movido adentro al abrir y **devuelto al abridor al cerrar**, que es
 *    lo único de la lista que `Esqueleto.tsx` no hace y que acá no se puede no
 *    hacer: lo que se abre tapa la página entera.
 *
 * Y una quinta que es de layout: el `<dialog>` modal vive en la capa superior
 * del navegador, así que **no necesita un `z-index`** y no compite con
 * `--z-velo` ni `--z-cajon`. Escribirlo a mano habría obligado a inventar un
 * tercer número en `tokens.css` que tendría que ganarle a los dos.
 *
 * El precio es el único que el elemento cobra: con React, `showModal()` se llama
 * a mano. Se paga en un `useEffect` de cinco líneas, y se paga a propósito en vez
 * de usar el atributo `open`, que abre el diálogo **no modal** —sin velo, sin
 * inercia, sin `Escape` y sin foco— y se parece tanto a lo correcto que es la
 * forma más fácil de perder las cuatro cosas sin notarlo.
 *
 * ## La marca, y por qué es una tabla
 *
 * El dibujo es el de `/catalogos/arancel`: una tabla agrupada por categoría, con
 * el concepto en `<th scope="row">` y el importe en un `<td>`. No es gusto, es lo
 * que hace **contable** la regla de la tajada anterior: los conceptos del acuerdo
 * traen importes adentro —«De B/.0.01 hasta B/.3,000.00»— que tienen que verse y
 * no son el precio de la fila, así que la única forma de afirmar «una sola cifra
 * por fila» sin falsos positivos es contar las cifras de las celdas de datos.
 * `e2e/precios-en-cotizacion.spec.ts` las cuenta.
 *
 * La marca es un asterisco al lado del concepto, con un nombre accesible oculto
 * —un asterisco no se lee— y una leyenda encima de la tabla. **No es un aviso**:
 * no es un color, no es un ícono de alerta y no dice nada sobre si el número está
 * bien. Dice de cuál de dos orígenes salió la cifra, que es un hecho.
 */
import { useId, useLayoutEffect, useRef, useState } from "react";

import { ContenedorDeTabla } from "../../layout/ContenedorDeTabla";
import { Pila } from "../../layout/Pila";
import { Prosa } from "../../layout/Prosa";
import {
  LEYENDA_DE_LA_MARCA,
  MARCA_DE_EDITADO,
  MARCA_DE_EDITADO_LEIDA,
  serviciosPorCategoria,
  serviciosQueCoinciden,
  type ServicioOfrecible,
} from "../catalogos/precios";
import {
  AYUDA_DE_LA_LISTA,
  ROTULO_DE_LA_BUSQUEDA,
  TITULO_DE_LA_LISTA,
  importeLegible,
  sinCoincidencias,
} from "./lineas";

type Props = {
  readonly servicios: readonly ServicioOfrecible[];
  /** El renglón que la línea ya nombra, para marcar la fila como elegida. */
  readonly elegido: string;
  readonly moneda: string;
  readonly alElegir: (id: string) => void;
  readonly alCerrar: () => void;
};

export function ListaDeServicios({
  servicios,
  elegido,
  moneda,
  alElegir,
  alCerrar,
}: Props) {
  const base = useId();
  const idDelTitulo = `lista-de-servicios-${base}`;
  const idDeLaBusqueda = `busqueda-de-servicios-${base}`;

  const dialogo = useRef<HTMLDialogElement>(null);
  const [consulta, setConsulta] = useState("");

  /*
   * El modal se abre **una vez**, al montar, y el componente sólo existe
   * mientras está abierto: quien lo monta es `{listaAbierta && …}`. Así no hay
   * un segundo estado «abierto» que pueda discrepar del de arriba, que es el
   * defecto clásico de envolver un `<dialog>` en React.
   *
   * El `close()` del desmontaje no es ceremonia: sin él, desmontar el elemento
   * mientras está en la capa superior deja al navegador con una entrada en esa
   * capa que nadie va a cerrar, y en Chromium eso se ve como una página que
   * sigue inerte después de que el modal desapareció.
   *
   * ## El `open` del `if`, y el defecto que lo puso ahí
   *
   * Medido en el navegador, no razonado: con `<StrictMode>` —que `src/main.tsx`
   * tiene puesto— React corre el efecto, su limpieza y el efecto otra vez. La
   * primera versión de este componente cerraba con `close()` y escuchaba
   * `onClose` para avisar arriba, y la secuencia era: montar → `showModal()` →
   * limpieza → `close()` → **`close` dispara el evento** → `onClose` →
   * `setListaAbierta(false)` → el modal se desmonta solo, en el mismo cuadro en
   * que se abrió. En el navegador se veía como que el botón «Listar todos» no
   * hacía nada.
   *
   * De ahí salen las dos mitades del arreglo. Acá, `showModal()` sólo sobre un
   * diálogo cerrado —abrir uno abierto tira `InvalidStateError`—. Y abajo, nada
   * escucha `onClose`: el aviso de cierre sale de `onCancel` y de los dos
   * controles que cierran, que son los tres gestos que una persona hace. Un
   * `close()` de limpieza no es un gesto de nadie.
   *
   * ## Y es `useLayoutEffect` y no `useEffect`, y eso **se midió**
   *
   * Con `useEffect` el foco **no volvía**: al cerrar con `Escape` el elemento
   * activo quedaba en el `<body>`, o sea que quien navega con teclado aterrizaba
   * al principio de la página. Medido con el elemento activo leído del
   * documento, antes y después: `BUTTON` adentro del diálogo → `BODY`.
   *
   * El motivo es el orden del desmontaje. React corre la limpieza de un efecto
   * **pasivo** después de la fase de mutación, o sea **después** de haber
   * sacado el nodo del documento, y `close()` sobre un `<dialog>` ya
   * desprendido no devuelve el foco a ninguna parte: los pasos de enfoque del
   * cierre no tienen a quién aplicarse. La limpieza de un efecto de **layout**
   * corre dentro de la fase de mutación, con el nodo todavía en su lugar, así
   * que el cierre es un cierre de verdad y el navegador devuelve el foco al
   * elemento que lo abrió. Con el cambio: `BUTTON` adentro → `BUTTON "Listar
   * todos"`.
   */
  useLayoutEffect(() => {
    const elemento = dialogo.current;
    if (elemento !== null && !elemento.open) elemento.showModal();

    return () => {
      if (elemento !== null && elemento.open) elemento.close();
    };
  }, []);

  const coincidentes = serviciosQueCoinciden(servicios, consulta);
  const grupos = serviciosPorCategoria(coincidentes);
  const hayAlgunEditado = coincidentes.some((servicio) => servicio.editado);

  return (
    <dialog
      ref={dialogo}
      className="lista-de-servicios"
      aria-labelledby={idDelTitulo}
      /*
       * `onCancel` y **no** `onClose`: `Escape` cierra el diálogo sin pasar por
       * ningún manejador nuestro, así que hace falta escucharlo — pero `close`
       * lo dispara también el `close()` de la limpieza del efecto, y eso
       * desmontaba el modal en el mismo cuadro en que se abría. El argumento
       * entero está arriba.
       *
       * `preventDefault()` deja el diálogo abierto en el DOM y quien lo cierra
       * es el desmontaje, que es lo que `alCerrar` provoca. Sin eso quedaría un
       * cuadro con el diálogo cerrado y todavía montado, que es exactamente el
       * estado doble que este componente existe para no tener.
       *
       * Medido a mano y conviene anotarlo para que nadie lo lea como un
       * defecto: con el foco dentro del buscador, el **primer** `Escape` lo
       * vacía y el segundo cierra la vista. Es la conducta nativa de un
       * `<input type="search">` en Chromium, y es la correcta: lo primero que
       * se abandona es la búsqueda.
       */
      onCancel={(evento) => {
        evento.preventDefault();
        alCerrar();
      }}
      /*
       * Tocar el velo cierra. El clic en `::backdrop` llega al propio
       * `<dialog>`, así que la comparación con `currentTarget` es lo que
       * distingue «tocó afuera» de «tocó algo de adentro».
       *
       * Es una comodidad del mouse y no la única salida: el teclado ya tiene
       * `Escape` y el botón «Cerrar». Por eso acá sí alcanza un manejador sobre
       * un elemento que no es un botón, al revés que en el velo del cajón de
       * `Esqueleto.tsx`, que **es** la única forma de cerrar con el mouse.
       */
      onClick={(evento) => {
        if (evento.target === evento.currentTarget) alCerrar();
      }}
    >
      <Pila>
        <div className="lista-de-servicios__encabezado">
          <h2 id={idDelTitulo}>{TITULO_DE_LA_LISTA}</h2>
          <button type="button" className="boton boton--tenue" onClick={alCerrar}>
            Cerrar
          </button>
        </div>

        <Prosa como="p" className="texto-apagado">
          {AYUDA_DE_LA_LISTA}
        </Prosa>

        <div className="campo campo--busqueda">
          <label className="campo__rotulo" htmlFor={idDeLaBusqueda}>
            {ROTULO_DE_LA_BUSQUEDA}
          </label>
          <input
            id={idDeLaBusqueda}
            className="campo__control"
            type="search"
            value={consulta}
            placeholder="Concepto o categoría"
            onChange={(evento) => {
              setConsulta(evento.target.value);
            }}
          />
        </div>

        <p className="texto-apagado" aria-live="polite">
          {coincidentes.length === servicios.length
            ? `${String(servicios.length)} servicio(s) con precio.`
            : `${String(coincidentes.length)} de ${String(
                servicios.length,
              )} servicio(s) con precio.`}
        </p>

        {/*
          La leyenda de la marca, **encima de la tabla y no debajo**. Es una
          corrección vista en el navegador: con los 282 servicios de verdad, el
          pie de la tabla queda a varias pantallas de scroll, así que la leyenda
          explicaba un asterisco que para entonces ya nadie tenía a la vista.
          Acá se lee antes de encontrarse con la primera marca.

          Y se dibuja **sólo cuando hay alguna fila marcada**: una leyenda que
          explica un signo que no aparece en ninguna parte manda a buscarlo.
        */}
        {hayAlgunEditado && (
          <Prosa como="p" className="texto-apagado">
            <span aria-hidden="true">{MARCA_DE_EDITADO} </span>
            {LEYENDA_DE_LA_MARCA}
          </Prosa>
        )}

        {grupos.length === 0 ? (
          <p className="texto-apagado">{sinCoincidencias(consulta)}</p>
        ) : (
          /*
            **Una** tabla y no una por categoría, y la razón es el teclado.
            `ContenedorDeTabla` pone `tabindex="0"` sobre la región scrolleable
            —§9: una tabla scrollea sola— y con las 29 categorías del acuerdo eso
            serían veintinueve paradas de tabulación antes de llegar al primer
            botón «Elegir». Las categorías entran como un `<tbody>` propio con su
            fila de encabezado de grupo, que es semántica de tabla y una sola
            región.
          */
          <ContenedorDeTabla
            rotulo="Servicios con precio, por categoría"
            className="lista-de-servicios__tabla"
          >
            <thead>
              <tr>
                <th scope="col">Servicio</th>
                <th scope="col">Precio</th>
                <th scope="col">
                  {/* La columna del botón no tiene encabezado que decir: lo
                      que hace cada botón lo dice su propio nombre. */}
                  <span className="oculto-visualmente">Elegir</span>
                </th>
              </tr>
            </thead>
            {grupos.map((grupo) => (
              <tbody key={grupo.categoria}>
                <tr className="lista-de-servicios__categoria">
                  <th scope="colgroup" colSpan={3}>
                    {grupo.categoria}
                  </th>
                </tr>
                {grupo.servicios.map((servicio) => (
                  <tr
                    key={servicio.id}
                    className={
                      servicio.id === elegido
                        ? "lista-de-servicios__fila lista-de-servicios__fila--elegida"
                        : "lista-de-servicios__fila"
                    }
                  >
                    {/*
                      El concepto va en `<th scope="row">` y no en un `<td>`: es
                      semántica de tabla y además es lo que deja contar las
                      cifras de las celdas de datos sin que los importes que el
                      acuerdo imprime dentro de un concepto —«De B/.0.01 hasta
                      B/.3,000.00»— cuenten como el precio de la fila.
                    */}
                    <th scope="row" className="lista-de-servicios__servicio">
                      {servicio.rotulo}
                      {servicio.editado && (
                        <span className="lista-de-servicios__marca">
                          <span aria-hidden="true">{MARCA_DE_EDITADO}</span>
                          <span className="oculto-visualmente">
                            {MARCA_DE_EDITADO_LEIDA}
                          </span>
                        </span>
                      )}
                    </th>
                    <td className="lista-de-servicios__importe">
                      {importeLegible(servicio.monto, moneda)}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="boton boton--tenue"
                        aria-label={`Elegir ${servicio.rotulo}`}
                        onClick={() => {
                          alElegir(servicio.id);
                        }}
                      >
                        Elegir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            ))}
          </ContenedorDeTabla>
        )}

      </Pila>
    </dialog>
  );
}
