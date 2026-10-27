/**
 * «Mis pendientes»: los abiertos donde soy responsable, agrupados contra
 * hoy. Presentacional: recibe la lista y el día, no pide nada.
 */
import type { PendienteDelInicio } from "../../../worker/contract";
import { Aviso } from "../../layout/Aviso";
import { Enlace } from "../../layout/Enlace";
import { Pila } from "../../layout/Pila";
import { diaLegible } from "../../formatos";
import { agruparPendientes, enlaceDePendiente } from "./presentacion";

type Props = {
  readonly pendientes: readonly PendienteDelInicio[];
  readonly hoy: string;
};

export function MisPendientes({ pendientes, hoy }: Props) {
  const grupos = agruparPendientes(pendientes, hoy);

  return (
    <section aria-labelledby="mis-pendientes" className="inicio__seccion">
      <Pila>
        <h2 id="mis-pendientes">Mis pendientes</h2>
        {grupos.length === 0 && (
          <Aviso>
            No hay ningún pendiente abierto a tu nombre. Los pendientes se
            anotan dentro de cada proceso, con responsable y fecha.
          </Aviso>
        )}
        {grupos.map((grupo) => (
          <Pila key={grupo.clave} espacio="ceñido">
            <h3 className={`inicio__grupo inicio__grupo--${grupo.clave}`}>
              {grupo.titulo}{" "}
              <span className="texto-apagado">
                ({String(grupo.pendientes.length)})
              </span>
            </h3>
            <ul className="inicio__lista">
              {grupo.pendientes.map((pendiente) => (
                <li key={pendiente.id} className="inicio__renglon">
                  <Enlace href={enlaceDePendiente(pendiente)}>
                    {pendiente.texto}
                  </Enlace>
                  <span className="texto-apagado">
                    {pendiente.procesoTitulo}
                    {pendiente.venceEn !== null &&
                      ` · vence el ${diaLegible(pendiente.venceEn)}`}
                  </span>
                </li>
              ))}
            </ul>
          </Pila>
        ))}
      </Pila>
    </section>
  );
}
