/**
 * Los derivados de presentación del cliente: lo que la tabla y el detalle
 * muestran, calculado una sola vez y probado.
 *
 * Sin DOM y sin React, por la misma razón que `src/ruteo.ts`: son funciones
 * de datos a texto, y adentro de un `.tsx` solo se pueden probar montando un
 * navegador para leer lo que ya era una cadena.
 */

import type { Cliente, Cotizacion } from "../../../worker/contract";
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

/**
 * Las cotizaciones de un cliente, sacadas del listado entero (T-16).
 *
 * ## Por qué filtra el navegador y no el servidor
 *
 * Porque `GET /api/cotizaciones` ya devuelve cada fila con su `clienteId`,
 * y es exactamente lo que hace `procesosDeCotizacion` para los procesos que
 * abrió una cotización: el servidor entrega la cartera completa en una
 * respuesta —el bufete son dos personas— y la pantalla se queda con las que
 * le tocan. Es lo que evita una ruta nueva, una consulta nueva y un segundo
 * lugar donde se decida qué cotización cuelga de qué cliente.
 *
 * El listado de procesos de esta misma ficha sí filtra del lado del
 * servidor, con `?clienteId=`, y la diferencia no es un descuido: esa ruta
 * ya tenía el parámetro. La de cotizaciones no lo tiene, y agregarlo para
 * esta pantalla sería ampliar el contrato de la API por una lista de tres
 * renglones.
 *
 * Compara por **identificador y no por nombre**: el nombre es texto de cara
 * a una persona y dos fichas pueden repetirlo; lo que ata las dos filas es
 * la llave.
 *
 * El arreglo que llega no se toca: puede ser estado de React.
 */
export function cotizacionesDeCliente(
  cotizaciones: readonly Cotizacion[],
  clienteId: string,
): Cotizacion[] {
  return cotizaciones.filter(
    (cotizacion) => cotizacion.clienteId === clienteId,
  );
}
