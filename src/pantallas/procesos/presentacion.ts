/**
 * Los derivados de presentación de los procesos: lo que el listado muestra,
 * calculado una sola vez y probado.
 *
 * Sin DOM y sin React, por la misma razón que `src/ruteo.ts`: son funciones
 * de datos a texto, y adentro de un `.tsx` solo se pueden probar montando un
 * navegador para leer lo que ya era una cadena.
 */

import type { Proceso } from "../../../worker/contract";
import { ORDEN_ES, plano } from "../../formatos";

/**
 * El avance, en etapas y no en porcentaje.
 *
 * Un «25 %» sobre cuatro pasos suena preciso y no lo es: los pasos no pesan
 * lo mismo, y el plan cambia mientras el proceso corre. «1 de 4» dice lo que
 * se sabe.
 */
export function avanceDe(proceso: Proceso): string {
  if (proceso.etapasTotales === 0) return "Sin plan";

  return `${String(proceso.etapasCumplidas)} de ${String(
    proceso.etapasTotales,
  )}`;
}

/**
 * Lo que viene, que es la mitad del valor de esta pantalla.
 *
 * Los dos finales se distinguen a propósito: un proceso sin plan todavía
 * necesita que alguien le arme los pasos; uno con todo cumplido no. Decir
 * «Sin plan» en los dos casos esconde un trabajo pendiente detrás de algo que
 * parece terminado.
 */
export function proximoPaso(proceso: Proceso): string {
  if (proceso.etapaVigente !== null) return proceso.etapaVigente;
  if (proceso.etapasTotales === 0) return "Sin plan todavía";

  return "Todas las etapas cumplidas";
}

/**
 * Copia ordenada por cliente y después por título: el bufete piensa los
 * procesos por cliente, y dos del mismo cliente quedan juntos. El arreglo que
 * llega no se toca: puede ser estado de React.
 */
export function ordenarProcesos(procesos: readonly Proceso[]): Proceso[] {
  return [...procesos].sort((a, b) => {
    const porCliente = ORDEN_ES.compare(
      a.clienteNombre ?? "",
      b.clienteNombre ?? "",
    );
    return porCliente !== 0 ? porCliente : ORDEN_ES.compare(a.titulo, b.titulo);
  });
}

/**
 * El filtro del listado.
 *
 * Busca también por **la etapa que viene**, que es como alguien recuerda un
 * proceso cuando no se acuerda del título: «el que está en entrevista».
 */
export function filtrarProcesos(
  procesos: readonly Proceso[],
  consulta: string,
): Proceso[] {
  const buscado = plano(consulta.trim());
  if (buscado === "") return [...procesos];

  return procesos.filter((proceso) => {
    const pajar = plano(
      [
        proceso.titulo,
        proceso.clienteNombre,
        proceso.tipoProcesoNombre,
        proceso.areaNombre,
        proceso.responsableNombre,
        proceso.etapaVigente,
      ]
        .filter((parte): parte is string => parte !== null)
        .join(" "),
    );

    return pajar.includes(buscado);
  });
}
