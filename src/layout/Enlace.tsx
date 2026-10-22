/**
 * Enlace — un `<a>` de verdad que, además, navega sin recargar.
 *
 * Es un ancla con `href` y no un `<button>` con un `onClick`: el `href` es lo
 * que hace que el enlace se pueda copiar, abrir en una pestaña nueva y leer
 * en voz alta como enlace. La intercepción es la mejora, no el mecanismo.
 */
import type { MouseEvent, ReactNode } from "react";

import { esClicDelNavegador, navegarA } from "../navegacion";

type Props = {
  readonly href: string;
  readonly children: ReactNode;
  readonly className?: string;
  readonly ariaCurrent?: "page";
};

export function Enlace({ href, children, className, ariaCurrent }: Props) {
  function alHacerClic(evento: MouseEvent<HTMLAnchorElement>) {
    if (esClicDelNavegador(evento)) return;

    evento.preventDefault();
    navegarA(href);
  }

  return (
    <a
      href={href}
      className={className}
      aria-current={ariaCurrent}
      onClick={alHacerClic}
    >
      {children}
    </a>
  );
}
