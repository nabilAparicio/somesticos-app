/**
 * Los derivados de presentación del cliente: lo que la tabla y el detalle
 * muestran, calculado una sola vez y probado.
 *
 * Sin DOM y sin React, por la misma razón que `src/ruteo.ts`: son funciones
 * de datos a texto, y adentro de un `.tsx` solo se pueden probar montando un
 * navegador para leer lo que ya era una cadena.
 */

import type { Cliente } from "../../../worker/contract";
import { ORDEN_ES, VACIO, fechaLegible, plano } from "../../formatos";

/*
 * `VACIO` y `fechaLegible` se reexportan en vez de redefinirse: T-7 los mudó
 * a `src/formatos.ts` cuando apareció la tercera pantalla que los necesitaba.
 * Quien ya los importaba de acá los sigue importando de acá.
 */
export { VACIO, fechaLegible };

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
