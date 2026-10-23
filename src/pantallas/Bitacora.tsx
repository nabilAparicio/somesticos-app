/**
 * La bitácora de una entidad, dibujada (T-10).
 *
 * Un solo componente para el proceso y para el cliente: lo que cambia entre
 * las dos pantallas es de dónde salen las entradas, no cómo se leen. Dos
 * copias de esta lista serían dos formas de escribir «el 3 de marzo Itzel
 * movió este proceso», y la que se desincronice primero lo hace sin que
 * nadie lo note — el mismo argumento con el que `src/formatos.ts` existe.
 *
 * Toda la lógica que se puede probar sin navegador vive en
 * `src/bitacora.ts`. Acá queda el dibujo.
 *
 * El `id` del encabezado llega por prop porque las dos pantallas lo usan en
 * su `aria-labelledby` y en la misma página puede haber otras secciones:
 * dos `id` iguales en un documento rompen la asociación de las dos.
 */
import type { EntradaDeBitacora } from "../../worker/contract";
import {
  AVISO_BITACORA_SIN_RELLENO,
  fraseDeBitacora,
  resumenDeLaBitacora,
} from "../bitacora";
import { fechaLegible } from "../formatos";
import { Aviso } from "../layout/Aviso";
import { Pila } from "../layout/Pila";
import { Prosa } from "../layout/Prosa";

/**
 * Las tres fases de una lectura que no puede tumbar la pantalla que la
 * contiene. Es la misma forma que T-7 le dio al listado de procesos dentro
 * de la ficha del cliente.
 */
export type EstadoDeBitacora =
  | { fase: "cargando" }
  | { fase: "listo"; entradas: EntradaDeBitacora[] }
  | { fase: "problema"; mensaje: string };

type Props = {
  readonly estado: EstadoDeBitacora;
  readonly id: string;
};

export function Bitacora({ estado, id }: Props) {
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

        {estado.fase === "listo" && (
          <>
            <Prosa como="p" className="texto-apagado">
              {resumenDeLaBitacora(estado.entradas)}
            </Prosa>

            {estado.entradas.length > 0 && (
              <ol className="bitacora sin-viñetas">
                {estado.entradas.map((entrada) => (
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
          </>
        )}
      </Pila>
    </section>
  );
}
