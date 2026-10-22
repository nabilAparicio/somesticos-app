/**
 * Los derivados de presentación del cliente: lo que la tabla y el detalle
 * muestran, calculado una sola vez y probado.
 *
 * Sin DOM y sin React, por la misma razón que `src/ruteo.ts`: son funciones
 * de datos a texto, y adentro de un `.tsx` solo se pueden probar montando un
 * navegador para leer lo que ya era una cadena.
 */

import type { Cliente } from "../../../worker/contract";

/** Lo que se muestra donde no hay dato. Un solo guion, en un solo lugar. */
export const VACIO = "—";

/**
 * Comparador con las reglas del español: `Álvarez` antes que `ávila`, y `ñ`
 * después de `n`. Con `Array.prototype.sort()` crudo las mayúsculas y los
 * acentos se van todos al final, y un listado de apellidos panameños queda
 * ordenado de una forma que nadie reconoce.
 */
const ORDEN_ES = new Intl.Collator("es", { numeric: true });

/** Minúsculas y sin acentos, para buscar como la gente escribe. */
function plano(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export function contactoDe(cliente: Cliente): string {
  const partes = [cliente.telefono, cliente.email].filter(
    (parte): parte is string => parte !== null,
  );

  return partes.length === 0 ? VACIO : partes.join(" · ");
}

export function documentoDe(cliente: Cliente): string {
  if (cliente.documentoTipo === null || cliente.documentoNumero === null) {
    return VACIO;
  }

  return `${cliente.documentoTipo} ${cliente.documentoNumero}`;
}

export function tipoDe(cliente: Cliente): string {
  return cliente.tipoClienteNombre ?? "Sin tipo";
}

/** Copia ordenada. El arreglo que llega no se toca: puede ser estado React. */
export function ordenarPorNombre(clientes: readonly Cliente[]): Cliente[] {
  return [...clientes].sort((a, b) => ORDEN_ES.compare(a.nombre, b.nombre));
}

/**
 * El filtro del listado: busca en todo lo que alguien recordaría de un
 * cliente —nombre, documento, correo, teléfono y representante— ignorando
 * acentos y mayúsculas.
 */
export function filtrarClientes(
  clientes: readonly Cliente[],
  consulta: string,
): Cliente[] {
  const buscado = plano(consulta.trim());
  if (buscado === "") return [...clientes];

  return clientes.filter((cliente) => {
    const pajar = plano(
      [
        cliente.nombre,
        cliente.tipoClienteNombre,
        cliente.documentoTipo,
        cliente.documentoNumero,
        cliente.representanteLegal,
        cliente.email,
        cliente.telefono,
      ]
        .filter((parte): parte is string => parte !== null)
        .join(" "),
    );

    return pajar.includes(buscado);
  });
}

/** El momento ISO que guarda la base, en la forma que lee una persona. */
export function fechaLegible(iso: string): string {
  const momento = new Date(iso);
  if (Number.isNaN(momento.getTime())) return VACIO;

  return new Intl.DateTimeFormat("es-PA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(momento);
}
