/**
 * El selector de servicio de una línea: el combobox de `./Combobox.tsx` con el
 * monto al lado (T-2 bis de `odd/tasks/precios-en-la-cotizacion.md`, rehecho
 * sobre el componente compartido por T-1 de
 * `odd/tasks/el-selector-de-cliente-busca.md`).
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
 * ## Qué quedó en este archivo después de la extracción
 *
 * El patrón entero —las cuatro teclas, los cuatro atributos del
 * `role="combobox"`, la lista, la opción activa, el `onMouseDown` que gana al
 * `blur`— se fue a `./Combobox.tsx`, que es ahora el único sitio donde está
 * escrito y el que también sirve al selector de cliente del alta. La medición
 * que decidió la extracción está en el encabezado de ese archivo.
 *
 * Lo que queda acá es **lo del arancel**, que es exactamente lo que no se podía
 * generalizar:
 *
 *  - el importe al lado de cada opción, con la moneda de la cotización;
 *  - el botón «Listar todos» y la vista expandida que abre;
 *  - el texto del campo cuando el servicio elegido **no está** en el catálogo,
 *    que es el caso que el selector de cliente no tiene.
 *
 * ## Este archivo no decide nada, y la frontera está donde siempre
 *
 * Qué opciones coinciden con lo que se escribió lo decide
 * `opcionesQueCoinciden`; qué opción queda activa al mover una flecha lo decide
 * `moverOpcionActiva`; qué texto muestra el campo cuando la línea ya tiene un
 * servicio lo decide `textoDelServicioElegido`; y qué le pasa al borrador lo
 * decide `conServicioElegido`, del lado de quien recibe `alElegir`. Las cuatro
 * se prueban sin navegador.
 *
 * ## Una sola cifra por opción, y la marca no va acá
 *
 * El monto al lado es **uno**: el que el servicio tiene. Y la marca de editado
 * **no se dibuja en este control**, que es lo que el usuario pidió con todas las
 * letras: en el selector son todos precios y nada más. La marca vive en la vista
 * expandida, con su leyenda.
 */
import { useId, useState } from "react";

import {
  textoDelServicioElegido,
  type ServicioOfrecible,
} from "../catalogos/precios";
import { Combobox } from "./Combobox";
import { ListaDeServicios } from "./ListaDeServicios";
import {
  AYUDA_DEL_SERVICIO,
  ROTULO_DE_LISTAR_TODOS,
  importeLegible,
  sinCoincidencias,
} from "./lineas";

/** Cómo se anuncia la lista de resultados de este selector. */
const NOMBRE_DE_LA_LISTA = "Servicios que coinciden";

/** Lo que dice el campo vacío. Las palabras son las del usuario. */
const MARCADOR_DEL_SERVICIO = "Buscar un servicio";

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
  /*
   * El `id` del campo sale de `useId` y no es un literal: en una cotización con
   * seis líneas hay seis de estos controles en la misma página, y un `id` fijo
   * sería seis identificadores duplicados con seis `<label for>` apuntando
   * todos al primero.
   */
  const base = useId();
  const idDelCampo = `servicio-${base}`;

  const [listaAbierta, setListaAbierta] = useState(false);

  return (
    <Combobox
      opciones={servicios}
      elegido={elegido}
      /* Lo elegido, dicho como texto. Las tres ramas —nada, lo del catálogo, y
         lo que la lectura resolvió de un renglón que dejó de estar tarifado—
         están en `textoDelServicioElegido`. */
      textoDeLoElegido={textoDelServicioElegido(
        servicios,
        elegido,
        conceptoDeLaLinea,
      )}
      alElegir={alElegir}
      idDelCampo={idDelCampo}
      bloque="selector-de-servicio"
      rotulo={
        <>
          {rotulo}{" "}
          {/* Sin el punto medio de `FormularioDeCliente`, a propósito: los
              otros cuatro controles de esta misma fila lo escriben así
              —«Trámite opcional»— y dos formas de decir lo mismo en un renglón
              se leen como dos cosas distintas. */}
          <span className="campo__marca campo__marca--tenue">opcional</span>
        </>
      }
      nombreAccesible={nombreAccesible}
      nombreDeLaLista={NOMBRE_DE_LA_LISTA}
      marcadorDePosicion={MARCADOR_DEL_SERVICIO}
      /*
        **Lo que falló al traer el catálogo no se dice acá**, y es una
        corrección medida: el aviso vivía dentro de este control y una
        cotización con seis líneas lo dibujaba seis veces, una por selector.
        Peor: rompía la prueba «el gasto estimado dice que es aproximado» de
        `e2e/cotizaciones.spec.ts`, que busca **el** aviso de una familia de
        líneas y se encontró con cuatro. Lo que pasa con el catálogo le pasa a
        la sección entera y se dice una sola vez arriba, al lado del aviso de
        los trámites, que ya estaba resuelto así.
      */
      ayuda={AYUDA_DEL_SERVICIO}
      contenidoDeLaOpcion={(servicio) => (
        <>
          {/* La clase genérica es la que pinta; la propia está porque
              `e2e/precios-en-cotizacion.spec.ts` lee el nombre y el importe de
              cada opción por separado para comprobar que ninguna fila dibuje
              dos cifras. */}
          <span className="combobox__nombre selector-de-servicio__nombre">
            {servicio.rotulo}
          </span>
          {/*
            La única cifra de la opción, y es la del servicio. Sin marca de
            ninguna clase: acá son todos precios.
          */}
          <span className="selector-de-servicio__importe">
            {importeLegible(servicio.monto, moneda)}
          </span>
        </>
      )}
      textoSinCoincidencias={sinCoincidencias}
      accesorio={(cerrar) => (
        /*
          El botón que abre la vista expandida. **No lleva `boton--primario`**:
          lo que se hace en esta fila es escribir una línea, y el botón que
          manda es «Guardar». Y no es un ícono: «Listar todos» son las palabras
          del usuario, y un glifo obligaría a adivinarlas.
        */
        <button
          type="button"
          className="boton boton--tenue"
          disabled={servicios.length === 0}
          onClick={() => {
            cerrar();
            setListaAbierta(true);
          }}
        >
          {ROTULO_DE_LISTAR_TODOS}
        </button>
      )}
    >
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
    </Combobox>
  );
}
