/**
 * Pila — apila sus hijos en vertical con un hueco uniforme.
 *
 * Es el primitivo que reemplaza los márgenes sueltos: el espacio lo pone el
 * contenedor, una sola vez, y no cada hijo por su cuenta. Flexbox, porque es
 * una franja unidimensional (`docs/diseno.md` §9).
 */
import type { ElementType, ReactNode } from "react";

export type EspacioDePila = "ceñido" | "normal" | "holgado";

type Props = {
  readonly children: ReactNode;
  readonly espacio?: EspacioDePila;
  /** Para que la pila no obligue a envolverla en otro elemento semántico. */
  readonly como?: ElementType;
  readonly className?: string;
};

export function Pila({
  children,
  espacio = "normal",
  como: Como = "div",
  className,
}: Props) {
  return (
    <Como
      className={["pila", `pila--${espacio}`, className]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </Como>
  );
}
