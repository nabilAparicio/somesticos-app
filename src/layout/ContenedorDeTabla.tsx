/**
 * ContenedorDeTabla — una tabla que scrollea dentro de sí misma.
 *
 * §9: «Las tablas scrollean solas […]; la página nunca scrollea en
 * horizontal». Una tabla es el contenido menos elástico que existe: tiene un
 * ancho mínimo real que sale de sus columnas, y a 320px no hay layout que lo
 * arregle. Lo que sí se puede es contener el daño: el desbordamiento vive
 * dentro de este envoltorio y no se propaga al documento.
 *
 * Tres detalles que no son adorno:
 *  - `min-width: 0` en el envoltorio, porque un hijo de grid o flex tiene
 *    `min-width: auto` por defecto y entonces crece con su contenido en vez
 *    de scrollear — es la causa número uno de scroll horizontal de página;
 *  - `tabindex=0` sobre el contenedor scrolleable, para que quien navega con
 *    teclado pueda desplazarlo;
 *  - `role="region"` con rótulo, que es lo que hace anunciable esa región.
 */
import { useId, type ReactNode } from "react";

type Props = {
  /** El `<thead>` y el `<tbody>`. La `<table>` la pone este componente. */
  readonly children: ReactNode;
  /** Rótulo accesible; también es el `<caption>` de la tabla. */
  readonly rotulo: string;
  readonly className?: string;
};

export function ContenedorDeTabla({ children, rotulo, className }: Props) {
  const id = useId();

  return (
    <div
      className={["tabla-contenedor", className].filter(Boolean).join(" ")}
      role="region"
      aria-labelledby={id}
      tabIndex={0}
    >
      <table className="tabla">
        <caption id={id} className="tabla__rotulo">
          {rotulo}
        </caption>
        {children}
      </table>
    </div>
  );
}
