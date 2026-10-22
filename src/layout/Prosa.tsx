/**
 * Prosa — columna de texto con tope de ancho en `ch`.
 *
 * §9: «El texto se mide en `ch`». El tope es de legibilidad, no de diseño:
 * una línea de más de unos 70 caracteres obliga al ojo a buscar el renglón
 * siguiente. En `ch` el tope sigue a la tipografía; en píxeles no.
 *
 * El tope es un `max-width`, nunca un `width`: a 320px la columna mide 320px.
 */
import type { CSSProperties, ElementType, ReactNode } from "react";

type Props = {
  readonly children: ReactNode;
  /** Tope de ancho en caracteres. */
  readonly tope?: number;
  readonly como?: ElementType;
  readonly className?: string;
};

export function Prosa({
  children,
  tope = 68,
  como: Como = "div",
  className,
}: Props) {
  return (
    <Como
      className={["prosa", className].filter(Boolean).join(" ")}
      style={{ "--prosa-tope": `${String(tope)}ch` } as CSSProperties}
    >
      {children}
    </Como>
  );
}
