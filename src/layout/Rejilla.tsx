/**
 * Rejilla — columnas que se reacomodan solas.
 *
 * `repeat(auto-fit, minmax(min(<mínimo>, 100%), 1fr))` de §9: el número de
 * columnas sale del espacio disponible, no de un breakpoint escrito a mano.
 *
 * El `min(…, 100%)` de adentro no es decorativo: sin él, un `minmax` con un
 * mínimo de 18rem fuerza una pista de 18rem aunque el contenedor mida 320px,
 * y la rejilla se sale. Ese es el ancho fijo encubierto que §9 prohíbe.
 */
import type { CSSProperties, ReactNode } from "react";

type Props = {
  readonly children: ReactNode;
  /** Ancho mínimo deseable de una columna. Nunca un ancho impuesto. */
  readonly minimo?: string;
  readonly className?: string;
};

export function Rejilla({ children, minimo = "16rem", className }: Props) {
  return (
    <div
      className={["rejilla", className].filter(Boolean).join(" ")}
      style={{ "--rejilla-minimo": minimo } as CSSProperties}
    >
      {children}
    </div>
  );
}
