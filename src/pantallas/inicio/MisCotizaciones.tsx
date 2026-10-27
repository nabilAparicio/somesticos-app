/**
 * «Mis cotizaciones por atender»: mis borradores y mis emitidas que vencen
 * dentro de siete días o ya vencieron. Presentacional.
 */
import type { CotizacionDelInicio } from "../../../worker/contract";
import { Aviso } from "../../layout/Aviso";
import { Enlace } from "../../layout/Enlace";
import { Pila } from "../../layout/Pila";
import { VACIO } from "../../formatos";
import {
  enlaceDeCotizacion,
  etiquetaDeEstado,
  vencimientoDeCotizacion,
} from "./presentacion";

type Props = {
  readonly cotizaciones: readonly CotizacionDelInicio[];
  readonly hoy: string;
};

export function MisCotizaciones({ cotizaciones, hoy }: Props) {
  return (
    <section aria-labelledby="mis-cotizaciones" className="inicio__seccion">
      <Pila>
        <h2 id="mis-cotizaciones">Mis cotizaciones por atender</h2>
        {cotizaciones.length === 0 ? (
          <Aviso>
            No tienes borradores abiertos ni cotizaciones emitidas que venzan
            en los próximos siete días.
          </Aviso>
        ) : (
          <ul className="inicio__lista">
            {cotizaciones.map((cotizacion) => (
              <li key={cotizacion.id} className="inicio__renglon">
                <Enlace href={enlaceDeCotizacion(cotizacion)}>
                  {cotizacion.codigo} · {cotizacion.clienteNombre ?? VACIO}
                </Enlace>
                <span className="texto-apagado">
                  <span
                    className={`inicio__marca inicio__marca--${cotizacion.estado}`}
                    aria-hidden="true"
                  />
                  {etiquetaDeEstado(cotizacion.estado)} ·{" "}
                  {vencimientoDeCotizacion(cotizacion, hoy)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Pila>
    </section>
  );
}
