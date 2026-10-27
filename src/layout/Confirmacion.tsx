/**
 * La pregunta antes de una acción que no se deshace.
 *
 * Nace en T-1 de `odd/tasks/procesos-comodidad.md`: marcar cumplida una
 * etapa, marcar resuelto un pendiente y quitar un movimiento de la cuenta
 * salían con **un solo clic**, y el aviso de que no se deshacían quedaba
 * después del botón, donde nadie lo lee antes de apretar.
 *
 * Es el mismo `<dialog>` nativo con `showModal()` de `ListaDeServicios.tsx`,
 * y por las mismas razones, que están escritas allá con lo que se midió: el
 * velo, la inercia de lo de atrás, `Escape` sin escucha global y el foco
 * devuelto al botón que lo abrió los da el navegador. De ahí se copia la
 * disciplina entera, no sólo la idea:
 *
 *  - **Existe sólo mientras pregunta.** Quien lo usa lo monta con
 *    `{pidiendo && <Confirmacion … />}`; no hay un segundo «abierto» que
 *    pueda discrepar del de arriba.
 *  - **`useLayoutEffect` y no `useEffect`**, para que el `close()` del
 *    desmontaje corra con el nodo todavía en el documento y el foco vuelva.
 *  - **Nada escucha `onClose`**: el `close()` de la limpieza no es un gesto
 *    de nadie, y con `<StrictMode>` desmontaba la pregunta en el mismo cuadro
 *    en que se abría.
 *
 * ## Lo que esta pregunta agrega
 *
 * **El foco arranca en «Cancelar».** Un `Enter` de más —el mismo dedo que
 * apretó el botón de la fila— no puede ser lo que firme un hecho. Confirmar
 * pide moverse hasta el botón que lo nombra.
 *
 * **El título es la pregunta y el botón nombra la acción.** «Aceptar» no
 * dice qué acepta; «Marcar cumplida» sí, y se lee sin el título.
 */
import { useId, useLayoutEffect, useRef, type ReactNode } from "react";

import { Fila } from "./Fila";
import { Pila } from "./Pila";

type Props = {
  /** La pregunta, con signos: «¿Marcar cumplida «Entrevista»?». */
  readonly titulo: string;
  /** El rótulo del botón que confirma: la acción, en infinitivo o imperativo. */
  readonly accion: string;
  /** Borra algo: el botón que confirma lleva el color de peligro. */
  readonly peligro?: boolean;
  /** Lo que conviene saber antes de decidir. */
  readonly children?: ReactNode;
  readonly alConfirmar: () => void;
  readonly alCancelar: () => void;
};

export function Confirmacion({
  titulo,
  accion,
  peligro = false,
  children,
  alConfirmar,
  alCancelar,
}: Props) {
  const idDelTitulo = `confirmacion-${useId()}`;
  const dialogo = useRef<HTMLDialogElement>(null);
  const cancelar = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    const elemento = dialogo.current;
    if (elemento !== null && !elemento.open) elemento.showModal();
    /* Después de abrir y no antes: `showModal()` corre sus propios pasos de
       enfoque y le ganaría a cualquier foco puesto de antemano. */
    cancelar.current?.focus();

    return () => {
      if (elemento !== null && elemento.open) elemento.close();
    };
  }, []);

  return (
    <dialog
      ref={dialogo}
      className="confirmacion"
      aria-labelledby={idDelTitulo}
      onCancel={(evento) => {
        evento.preventDefault();
        alCancelar();
      }}
      onClick={(evento) => {
        if (evento.target === evento.currentTarget) alCancelar();
      }}
    >
      <Pila>
        <h2 id={idDelTitulo} className="confirmacion__titulo">
          {titulo}
        </h2>
        {children}
        <Fila>
          <button
            type="button"
            className={["boton", peligro ? "boton--peligro" : "boton--primario"]
              .join(" ")}
            onClick={alConfirmar}
          >
            {accion}
          </button>
          <button
            ref={cancelar}
            type="button"
            className="boton"
            onClick={alCancelar}
          >
            Cancelar
          </button>
        </Fila>
      </Pila>
    </dialog>
  );
}
