/**
 * Tarjeta — bloque de contenido que se adapta a SU hueco, no a la ventana.
 *
 * Es el ejemplo vivo de «consultas de contenedor antes que de viewport» (§9).
 * La misma tarjeta se va a renderizar en una rejilla de cuatro columnas, en
 * una barra lateral angosta y a ancho completo en el celular. Preguntarle al
 * viewport cuánto espacio tiene es preguntarle a quien no sabe: a 2560px una
 * tarjeta en la cuarta columna puede medir 300px.
 *
 * Por eso declara `container-type: inline-size` y el aire, el tamaño del
 * título y la dirección de su pie salen de `@container`, en `layout.css`.
 */
import type { ReactNode } from "react";

type Props = {
  readonly titulo: string;
  readonly children: ReactNode;
  readonly className?: string;
};

export function Tarjeta({ titulo, children, className }: Props) {
  return (
    <article className={["tarjeta", className].filter(Boolean).join(" ")}>
      <div className="tarjeta__cuerpo">
        <h3 className="tarjeta__titulo">{titulo}</h3>
        {children}
      </div>
    </article>
  );
}
