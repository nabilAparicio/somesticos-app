/**
 * Los últimos seis meses, por estado: columnas agrupadas en SVG a mano.
 *
 * Sin biblioteca de gráficos a propósito (`odd/tasks/inicio-tablero.md`):
 * dos gráficos simples no justifican una dependencia de ejecución. La
 * geometría vive en `presentacion.ts` y tiene pruebas; acá solo se dibuja.
 *
 * Accesible por tres caminos que no dependen del color: el SVG es
 * `role="img"` con una descripción, cada barra lleva su `<title>` (el
 * globo al pasar el puntero), y los números enteros están en una tabla
 * desplegable debajo. La tabla es además el alivio que exigen los dos tonos
 * claros de la paleta, que no llegan a 3:1 contra la superficie.
 */
import type { MesDelInicio } from "../../../worker/contract";
import { ContenedorDeTabla } from "../../layout/ContenedorDeTabla";
import { Leyenda } from "./Leyenda";
import {
  ESTADOS,
  barrasDeLaSerie,
  descripcionDeLaSerie,
  etiquetaDeEstado,
  marcasDelEje,
  mesCorto,
  mesLargo,
} from "./presentacion";

/** El sistema de coordenadas del dibujo; el SVG escala al ancho que tenga. */
const ANCHO = 640;
const ALTO = 240;
const MARGEN = { arriba: 8, derecha: 8, abajo: 28, izquierda: 32 } as const;
const AREA = {
  ancho: ANCHO - MARGEN.izquierda - MARGEN.derecha,
  alto: ALTO - MARGEN.arriba - MARGEN.abajo,
};

/**
 * Una columna con el extremo de datos redondeado (4px) y la base recta,
 * apoyada en la línea base.
 */
function columna(x: number, y: number, ancho: number, alto: number): string {
  const r = Math.min(4, alto, ancho / 2);
  const base = y + alto;
  return (
    `M${String(x)},${String(base)}` +
    ` V${String(y + r)}` +
    ` Q${String(x)},${String(y)} ${String(x + r)},${String(y)}` +
    ` H${String(x + ancho - r)}` +
    ` Q${String(x + ancho)},${String(y)} ${String(x + ancho)},${String(y + r)}` +
    ` V${String(base)} Z`
  );
}

type Props = {
  readonly serie: readonly MesDelInicio[];
};

export function GraficoDeSerie({ serie }: Props) {
  const barras = barrasDeLaSerie(serie, AREA);
  const maximo = Math.max(0, ...serie.flatMap((m) => ESTADOS.map((e) => m[e])));
  const marcas = marcasDelEje(maximo);
  const tope = marcas[marcas.length - 1];
  const hueco = AREA.ancho / Math.max(1, serie.length);

  return (
    <figure className="inicio__grafico">
      <Leyenda />
      <svg
        className="inicio__lienzo"
        viewBox={`0 0 ${String(ANCHO)} ${String(ALTO)}`}
        role="img"
        aria-label={descripcionDeLaSerie(serie)}
      >
        <g transform={`translate(${String(MARGEN.izquierda)},${String(MARGEN.arriba)})`}>
          {marcas.map((marca) => {
            const y = AREA.alto - (marca / tope) * AREA.alto;
            return (
              <g key={marca} aria-hidden="true">
                <line
                  className="inicio__reticula"
                  x1={0}
                  x2={AREA.ancho}
                  y1={y}
                  y2={y}
                />
                <text className="inicio__eje" x={-8} y={y} dy="0.32em" textAnchor="end">
                  {String(marca)}
                </text>
              </g>
            );
          })}
          {barras
            .filter((barra) => barra.alto > 0)
            .map((barra) => (
              <path
                key={`${barra.mes}-${barra.estado}`}
                className={`inicio__barra inicio__barra--${barra.estado}`}
                d={columna(barra.x, barra.y, barra.ancho, barra.alto)}
              >
                <title>
                  {`${etiquetaDeEstado(barra.estado)}, ${mesLargo(barra.mes)}: ${String(barra.valor)}`}
                </title>
              </path>
            ))}
          {serie.map((mes, i) => (
            <text
              key={mes.mes}
              aria-hidden="true"
              className="inicio__eje"
              x={i * hueco + hueco / 2}
              y={AREA.alto + 18}
              textAnchor="middle"
            >
              {mesCorto(mes.mes)}
            </text>
          ))}
        </g>
      </svg>
      <details className="inicio__numeros">
        <summary>Ver los números</summary>
        <ContenedorDeTabla rotulo="Cotizaciones por estado y por mes">
          <thead>
            <tr>
              <th scope="col">Mes</th>
              {ESTADOS.map((estado) => (
                <th key={estado} scope="col" className="numerico">
                  {etiquetaDeEstado(estado)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {serie.map((mes) => (
              <tr key={mes.mes}>
                <th scope="row">{mesLargo(mes.mes)}</th>
                {ESTADOS.map((estado) => (
                  <td key={estado} className="numerico">
                    {String(mes[estado])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </ContenedorDeTabla>
      </details>
    </figure>
  );
}
