/**
 * Fila — acomoda sus hijos en horizontal y los envuelve cuando no entran.
 *
 * Flexbox con `flex-wrap`, que es el caso unidimensional de §9: una franja
 * que reparte lo que le cabe y baja el resto. Sin breakpoints: el envoltorio
 * ocurre cuando ocurre.
 */
import type { ReactNode } from "react";

export type AlineacionDeFila = "inicio" | "centro" | "entre";

type Props = {
  readonly children: ReactNode;
  readonly alinear?: AlineacionDeFila;
  readonly className?: string;
};

export function Fila({ children, alinear = "inicio", className }: Props) {
  return (
    <div
      className={["fila", `fila--${alinear}`, className]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}
