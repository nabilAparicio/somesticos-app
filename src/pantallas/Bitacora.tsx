/**
 * La bitácora de una entidad, dibujada (T-10, paginada en T-17).
 *
 * Un solo componente para el proceso, el cliente y los tres catálogos: lo
 * que cambia entre esas pantallas es de dónde salen las entradas, no cómo se
 * leen. Dos copias de esta lista serían dos formas de escribir «el 3 de
 * marzo Itzel movió este proceso», y la que se desincronice primero lo hace
 * sin que nadie lo note — el mismo argumento con el que `src/formatos.ts`
 * existe.
 *
 * Toda la lógica que se puede probar sin navegador vive en
 * `src/bitacora.ts`: las frases, el resumen y la aritmética de cuántos
 * hechos trae el control de «ver más viejos». Acá queda el dibujo y la
 * petición de las tandas siguientes.
 *
 * ## Por qué el componente pide, si antes no pedía
 *
 * Cuatro pantallas lo montan —el detalle del cliente, el del proceso, el
 * formulario del tipo de proceso y el desplegable por fila de la lista de
 * catálogos— y las cuatro le pasan exactamente lo mismo: el estado y un
 * `id`. Si el control de «ver más viejos» dependiera de que la pantalla le
 * pasara además cómo pedir su propia historia, serían cuatro cambios, y el
 * día que aparezca la quinta pantalla ésa se montaría sin el control y
 * nadie lo notaría — la bitácora se vería completa estando cortada.
 *
 * Por eso la página trae su `ruta`: con eso, el componente sabe pedir más de
 * lo mismo sin preguntarle nada a quien lo montó. El estado de la primera
 * página sigue siendo de la pantalla; el de las siguientes es de acá, y se
 * descarta solo cuando llega una primera página nueva —el detalle del
 * proceso vuelve a pedirla después de cada escritura—, porque lo que la
 * pantalla acaba de releer manda sobre lo que este componente había
 * ampliado.
 *
 * El `id` del encabezado llega por prop porque las pantallas lo usan en su
 * `aria-labelledby` y en la misma página puede haber otras secciones: dos
 * `id` iguales en un documento rompen la asociación de las dos.
 */
import { useEffect, useState } from "react";

import type { RespuestaDeBitacora } from "../../worker/contract";
import { pedir, textoDeProblema } from "../api/peticiones";
import {
  AVISO_BITACORA_SIN_RELLENO,
  avisoDeHechosFueraDelAlcance,
  controlDeMasViejos,
  direccionDeBitacora,
  fraseDeBitacora,
  paginaDeBitacora,
  resumenDeLaBitacora,
  type PaginaDeBitacora,
} from "../bitacora";
import { fechaLegible } from "../formatos";
import { Aviso } from "../layout/Aviso";
import { Pila } from "../layout/Pila";
import { Prosa } from "../layout/Prosa";

/**
 * Las tres fases de una lectura que no puede tumbar la pantalla que la
 * contiene. Es la misma forma que T-7 le dio al listado de procesos dentro
 * de la ficha del cliente.
 *
 * `entradas` guarda **una página** desde T-17 y no una lista: el campo
 * conserva el nombre a propósito, porque es lo que las cuatro pantallas que
 * montan esto escriben en su `setBitacora`, y cambiárselo las obligaría a
 * las cuatro a tocarse para no decir nada nuevo.
 */
export type EstadoDeBitacora =
  | { fase: "cargando" }
  | { fase: "listo"; entradas: PaginaDeBitacora }
  | { fase: "problema"; mensaje: string };

type Props = {
  readonly estado: EstadoDeBitacora;
  readonly id: string;
};

/** Cómo se nombra esta lectura cuando falla pedir una tanda más. */
const SUJETO = "esa historia";

export function Bitacora({ estado, id }: Props) {
  const recibida = estado.fase === "listo" ? estado.entradas : null;

  /**
   * Qué tope pidió esta pantalla por su cuenta.
   *
   * Es un objeto y no un número para que **volver a pedir lo mismo** siga
   * siendo un pedido nuevo: tras una falla de red, tocar otra vez el control
   * tiene que reintentar, y con un número suelto el efecto no notaría
   * diferencia y el botón no haría nada.
   */
  const [pedido, setPedido] = useState<{ readonly limite: number } | null>(
    null,
  );
  /** Lo que ese pedido trajo, si llegó bien. */
  const [ampliada, setAmpliada] = useState<PaginaDeBitacora | null>(null);
  const [problemaAlAmpliar, setProblemaAlAmpliar] = useState<string | null>(
    null,
  );
  /** La última primera página que se vio, para notar cuándo llega otra. */
  const [previa, setPrevia] = useState(recibida);

  // Una primera página nueva descarta la ampliación: la pantalla acaba de
  // releer la historia porque algo se escribió —o porque se desplegó otra
  // fila del catálogo— y lo ampliado es de antes.
  //
  // El ajuste va **durante el render** y no en un efecto: en un efecto se
  // pintaría primero la ampliación vieja debajo de la página nueva, y
  // `react-hooks/set-state-in-effect` lo rechaza por la cascada de renders
  // que provoca. Es el patrón que React documenta para el estado derivado
  // de una prop que cambió.
  if (previa !== recibida) {
    setPrevia(recibida);
    setPedido(null);
    setAmpliada(null);
    setProblemaAlAmpliar(null);
  }

  // La petición de las tandas siguientes. Depende de la página recibida,
  // así que su limpieza aborta lo que esté en vuelo cuando llega otra
  // primera página o cuando esto se desmonta: una respuesta vieja no puede
  // pisar la que acaba de llegar ni asentarse sobre lo desmontado.
  useEffect(() => {
    if (recibida === null || pedido === null) return undefined;

    const peticion = new AbortController();
    const { ruta } = recibida;
    const { limite } = pedido;

    void pedir<RespuestaDeBitacora>(direccionDeBitacora(ruta, limite), {
      signal: peticion.signal,
    }).then((resultado) => {
      if (peticion.signal.aborted) return;

      if (resultado.estado === "ok") {
        setAmpliada(paginaDeBitacora(ruta, limite, resultado.valor));
        return;
      }

      // Falla la ampliación, no la bitácora: lo que ya estaba dibujado se
      // queda donde está y el aviso explica por qué no creció.
      setProblemaAlAmpliar(textoDeProblema(resultado, SUJETO));
    });

    return () => {
      peticion.abort();
    };
  }, [recibida, pedido]);

  const pagina = ampliada ?? recibida;
  const control = pagina === null ? null : controlDeMasViejos(pagina);
  const fueraDelAlcance =
    pagina === null ? null : avisoDeHechosFueraDelAlcance(pagina);

  /**
   * Hay un pedido sin contestar. Se deduce en vez de guardarse: un `boolean`
   * aparte es una cuarta cosa que alguien tiene que acordarse de apagar en
   * cada rama, y la rama que se olvide deja el control deshabilitado para
   * siempre.
   */
  const trayendo =
    pedido !== null &&
    problemaAlAmpliar === null &&
    ampliada?.limite !== pedido.limite;

  return (
    <section aria-labelledby={id}>
      <Pila>
        <h2 id={id}>Bitácora</h2>

        {/* El aviso va primero y siempre, también cuando hay entradas: una
            bitácora que arranca el martes pasado se lee como la historia
            completa si nadie dice que no lo es. */}
        <Aviso>{AVISO_BITACORA_SIN_RELLENO}</Aviso>

        {estado.fase === "cargando" && <p>Consultando…</p>}

        {estado.fase === "problema" && (
          <Aviso tono="error">{estado.mensaje}</Aviso>
        )}

        {pagina !== null && (
          <>
            <Prosa como="p" className="texto-apagado">
              {resumenDeLaBitacora(pagina)}
            </Prosa>

            {pagina.entradas.length > 0 && (
              <ol className="bitacora sin-viñetas">
                {pagina.entradas.map((entrada) => (
                  <li className="bitacora__hecho" key={entrada.id}>
                    <p className="bitacora__frase">
                      {fraseDeBitacora(entrada)}
                    </p>
                    <p className="bitacora__momento texto-apagado">
                      {fechaLegible(entrada.ocurridoEn)}
                    </p>
                  </li>
                ))}
              </ol>
            )}

            {problemaAlAmpliar !== null && (
              <Aviso tono="error">{problemaAlAmpliar}</Aviso>
            )}

            {/* Debajo de la lista y fuera del `<ol>`. Debajo porque lo más
                reciente es lo que se ve al aterrizar y lo viejo está hacia
                abajo; fuera porque el control no es un hecho de la
                historia, y adentro sería el único `<li>` que no cuenta
                nada. El rótulo dice cuántos trae: «ver más» a secas no
                informa, y acá el número se sabe. */}
            {control !== null && (
              <p>
                <button
                  type="button"
                  className="boton boton--tenue"
                  disabled={trayendo}
                  onClick={() => {
                    setProblemaAlAmpliar(null);
                    setPedido({ limite: control.limite });
                  }}
                >
                  {trayendo ? "Trayendo…" : control.rotulo}
                </button>
              </p>
            )}

            {fueraDelAlcance !== null && (
              <Prosa como="p" className="texto-apagado">
                {fueraDelAlcance}
              </Prosa>
            )}
          </>
        )}
      </Pila>
    </section>
  );
}
