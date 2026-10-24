/**
 * Los derivados de presentación de la cotización: lo que la tabla y el
 * detalle muestran, calculado una sola vez y probado.
 *
 * Sin DOM y sin React, por la misma razón que `src/ruteo.ts`: son funciones
 * de datos a texto, y adentro de un `.tsx` solo se pueden probar montando un
 * navegador para leer lo que ya era una cadena.
 *
 * **Nada de acá decide una acción.** Emitir, ganar, perder y duplicar son de
 * T-4 y T-5; los módulos y las líneas son de la unidad C y de T-3. Lo que
 * este archivo hace con el estado es **decirlo**, que es distinto de ofrecer
 * un botón para cambiarlo.
 */

import type { Cotizacion, EstadoDeCotizacion } from "../../../worker/contract";
import { ORDEN_ES, VACIO, diaLegible, fechaLegible, plano } from "../../formatos";

export { VACIO, diaLegible, fechaLegible };

/**
 * Cómo se lee cada estado.
 *
 * El `Record` es **exhaustivo** sobre `EstadoDeCotizacion`: el día que el
 * `CHECK` de la tabla admita un quinto estado, esto deja de compilar hasta
 * que alguien escriba cómo se dice. Es la misma gracia que el mapa de
 * motivos de `src/mensajes.ts`.
 */
const ESTADOS: Record<EstadoDeCotizacion, string> = {
  borrador: "Borrador",
  emitida: "Emitida",
  ganada: "Ganada",
  perdida: "Perdida",
};

export function estadoLegible(cotizacion: Cotizacion): string {
  return ESTADOS[cotizacion.estado];
}

/**
 * El cliente, o el hueco dicho.
 *
 * `clienteNombre` llega nulo solo si la fila del cliente cruzara la frontera
 * del bufete. Inventarle un nombre sería peor, y dejarlo en blanco se lee
 * como «sin cliente», que es falso: la columna es `NOT NULL` (I-1).
 */
export function clienteDe(cotizacion: Cotizacion): string {
  return cotizacion.clienteNombre ?? VACIO;
}

/**
 * El vencimiento, dicho.
 *
 * Sin vencimiento **no** se dibuja un guion: «—» significa «no lo sabemos»
 * en todas las demás celdas de la aplicación, y acá lo que se sabe es que
 * no vence. Una cotización que no vence es además el caso mayoritario, así
 * que es la celda que más se va a leer.
 */
export function vencimientoDe(cotizacion: Cotizacion): string {
  return cotizacion.venceEn === null ? "No vence" : diaLegible(cotizacion.venceEn);
}

/**
 * ¿Se le pasó la fecha?
 *
 * Dos decisiones, las dos copiadas del pendiente de T-9 porque son el mismo
 * criterio:
 *
 *  - **Vencer «el 22» quiere decir que el 22 todavía cuenta**, así que lo
 *    vencido es lo estrictamente anterior a hoy. Es el mismo borde que el
 *    Worker defiende con `<` y no `<=`.
 *  - **Solo un borrador puede estar vencido.** Rojo sobre algo que ya se
 *    emitió, se ganó o se perdió es ruido: nadie la va a volver a mandar, y
 *    qué hace un documento emitido con su vencimiento es de T-4.
 *
 * La comparación es de texto, exacta porque `AAAA-MM-DD` ordena
 * alfabéticamente igual que cronológicamente.
 */
export function estaVencida(cotizacion: Cotizacion, hoy: string): boolean {
  if (cotizacion.estado !== "borrador") return false;
  return cotizacion.venceEn !== null && cotizacion.venceEn < hoy;
}

/**
 * Copia ordenada, de la más nueva a la más vieja. El arreglo que llega no se
 * toca: puede ser estado de React.
 *
 * El desempate por código no es adorno. Dos altas del mismo instante son
 * posibles —el correlativo es lo que las distingue— y un orden que dependa
 * del azar del arreglo hace que la tabla se reacomode sola entre dos cargas,
 * que es de las cosas que hacen desconfiar de una pantalla.
 */
export function ordenarCotizaciones(
  cotizaciones: readonly Cotizacion[],
): Cotizacion[] {
  return [...cotizaciones].sort((a, b) => {
    if (a.fecha !== b.fecha) return a.fecha < b.fecha ? 1 : -1;
    return ORDEN_ES.compare(b.codigo, a.codigo);
  });
}

/**
 * El filtro del listado: busca en todo lo que alguien recordaría de una
 * cotización —el código, el cliente y el estado— ignorando acentos y
 * mayúsculas.
 *
 * El estado entra por su **texto de pantalla** y no por el valor crudo del
 * `CHECK`. Que hoy coincidan no es razón para buscar por el crudo: lo que
 * alguien escribe es lo que ve, y el día que un estado se diga distinto del
 * valor que guarda la base, la búsqueda tiene que seguir el texto.
 */
export function filtrarCotizaciones(
  cotizaciones: readonly Cotizacion[],
  consulta: string,
): Cotizacion[] {
  const buscado = plano(consulta.trim());
  if (buscado === "") return [...cotizaciones];

  return cotizaciones.filter((cotizacion) => {
    const pajar = plano(
      [cotizacion.codigo, cotizacion.clienteNombre, estadoLegible(cotizacion)]
        .filter((parte): parte is string => parte !== null)
        .join(" "),
    );

    return pajar.includes(buscado);
  });
}

/**
 * La regla del borrador, dicha antes de que alguien la descubra apretando
 * «Guardar».
 *
 * Nombra **en qué estado quedó**, que es lo que el 409 del Worker lleva en
 * el cuerpo y por el mismo motivo: «ya no es borrador» sin decir en qué
 * quedó obliga a recargar para enterarse.
 *
 * Y **no nombra ninguna salida que esta pantalla no tenga**. El criterio del
 * proyecto es que ninguna negativa se quede sin puerta, pero una puerta
 * dibujada donde no hay puerta es peor: emitir, ganar, perder y duplicar son
 * de T-4 y T-5, y mencionarlos acá mandaría a buscar un botón que no
 * existe. La puerta que sí hay es mirar la cotización como quedó.
 */
export function avisoDeNoEsBorrador(cotizacion: Cotizacion): string | null {
  if (cotizacion.estado === "borrador") return null;

  return (
    `Esta cotización ya no es un borrador: quedó en «${estadoLegible(
      cotizacion,
    )}», y lo que salió del borrador no se edita. Su contenido es el` +
    " registro de lo que se mandó, y cambiarlo ahora reescribiría un" +
    " documento que el cliente ya tiene."
  );
}
