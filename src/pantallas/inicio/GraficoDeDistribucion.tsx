/**
 * Cuántas cotizaciones hay hoy en cada estado: barras horizontales.
 *
 * Son cuatro filas de texto con una barra al lado, no un SVG: el nombre y el
 * número **son texto de la página**, así que se leen, se copian y los lee un
 * lector de pantalla sin pasar por una descripción aparte. La barra es la
 * única parte dibujada y por eso es la única oculta a la lectura.
 */
import type { CuentaPorEstado } from "../../../worker/contract";
import {
  barrasDeLaDistribucion,
  descripcionDeLaDistribucion,
  etiquetaDeEstado,
} from "./presentacion";

type Props = {
  readonly distribucion: CuentaPorEstado;
};

export function GraficoDeDistribucion({ distribucion }: Props) {
  // En por ciento del ancho disponible: la más larga lo llena.
  const barras = barrasDeLaDistribucion(distribucion, 100);

  return (
    <figure className="inicio__grafico">
      <figcaption className="oculto-visualmente">
        {descripcionDeLaDistribucion(distribucion)}
      </figcaption>
      <dl className="inicio__distribucion">
        {barras.map((barra) => (
          <div key={barra.estado} className="inicio__distribucion-fila">
            <dt>{etiquetaDeEstado(barra.estado)}</dt>
            <dd>
              <span className="inicio__pista" aria-hidden="true">
                <span
                  className={`inicio__barra-h inicio__barra--${barra.estado}`}
                  style={{ inlineSize: `${String(barra.largo)}%` }}
                />
              </span>
              <span className="inicio__valor">{String(barra.valor)}</span>
            </dd>
          </div>
        ))}
      </dl>
    </figure>
  );
}
