/**
 * Aviso — un bloque de mensaje con su rol de accesibilidad.
 *
 * `role="alert"` para lo que salió mal, porque un error que solo cambia de
 * color no llega a quien usa un lector de pantalla. El tono neutro no lo
 * lleva: anunciar «no hay clientes todavía» interrumpiendo la lectura es
 * ruido.
 */
import type { ReactNode } from "react";

export type TonoDeAviso = "neutro" | "error";

type Props = {
  readonly children: ReactNode;
  readonly tono?: TonoDeAviso;
};

export function Aviso({ children, tono = "neutro" }: Props) {
  return (
    <div
      className={`aviso aviso--${tono}`}
      role={tono === "error" ? "alert" : undefined}
    >
      {children}
    </div>
  );
}
