/**
 * La fila de indicadores del mes: los cuatro estados por separado y la tasa
 * de cierre. Cuatro números y uno derivado, sin gráfico: un número que se
 * lee de un vistazo no gana nada dibujado.
 */
import type { RespuestaDelInicio } from "../../../worker/contract";
import { Pila } from "../../layout/Pila";
import { Rejilla } from "../../layout/Rejilla";
import { Tarjeta } from "../../layout/Tarjeta";
import { ESTADOS, etiquetaDeEstado, mesLargo, tasaLegible } from "./presentacion";

/** Qué cuenta cada tarjeta, dicho debajo del número. */
const QUE_CUENTA = {
  borrador: "abiertos este mes",
  emitida: "emitidas este mes",
  ganada: "ganadas este mes",
  perdida: "perdidas este mes",
} as const;

type Props = {
  readonly mes: RespuestaDelInicio["mes"];
};

export function Indicadores({ mes }: Props) {
  return (
    <Pila>
      <p className="texto-apagado">{mesLargo(mes.mes)}</p>
      <Rejilla minimo="9rem">
        {ESTADOS.map((estado) => (
          <Tarjeta
            key={estado}
            titulo={etiquetaDeEstado(estado)}
            className={`inicio__indicador inicio__indicador--${estado}`}
          >
            <p className="dato">{String(mes[estado])}</p>
            <p>{QUE_CUENTA[estado]}</p>
          </Tarjeta>
        ))}
        <Tarjeta titulo="Tasa de cierre" className="inicio__indicador">
          <p className="dato">{tasaLegible(mes.tasaDeCierre)}</p>
          <p>ganadas sobre ganadas y perdidas</p>
        </Tarjeta>
      </Rejilla>
    </Pila>
  );
}
