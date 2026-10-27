/**
 * La leyenda de los cuatro estados. Siempre presente: el color nunca es el
 * único que dice qué es cada barra. La muestra lleva el color; el texto va
 * en tinta, nunca en el color del estado.
 */
import { ESTADOS, etiquetaDeEstado } from "./presentacion";

export function Leyenda() {
  return (
    <ul className="inicio__leyenda">
      {ESTADOS.map((estado) => (
        <li key={estado}>
          <span
            className={`inicio__marca inicio__marca--${estado}`}
            aria-hidden="true"
          />
          {etiquetaDeEstado(estado)}
        </li>
      ))}
    </ul>
  );
}
