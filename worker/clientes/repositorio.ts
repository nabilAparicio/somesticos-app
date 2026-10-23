/**
 * El adaptador de D1 para clientes.
 *
 * `ServicioDeClientes` es el puerto: lo que el ruteo conoce. La función de
 * abajo es la única implementación, y la única que sabe que existe SQL. Que
 * sea una interfaz y no una llamada directa no es ceremonia — es lo que deja
 * probar que **una petición sin identidad no llega hasta acá**, sustituyéndola
 * por un espía que solo sabe delatar que lo llamaron.
 *
 * I-8 (`docs/diseno.md` §5) vive en cada consulta de este archivo: no hay una
 * sola que no filtre por `tenant_id`, ni siquiera las que buscan por llave
 * primaria. Un UUID ajeno sigue siendo un UUID: sin el filtro, conocerlo
 * alcanzaría para leerlo y editarlo.
 *
 * ## El registro de bitácora (T-10)
 *
 * No está esparcido por acá: viaja con la escritura. Este archivo no recibe
 * un `D1Database` sino una `BaseDeDatos`, que solo sabe leer y `mutar`, y
 * `mutar` **exige el evento como primer parámetro**. Agregar una mutación
 * nueva sin su entrada de bitácora no es un olvido posible: no compila.
 * Ver `worker/db/base.ts`.
 */

import type { Cliente, DatosDeCliente, FallaDeValidacion } from "../contract";
import type { BaseDeDatos } from "../db/base";
import { sentencia } from "../db/base";
import { nuevoId } from "../db/ids";
import { ahoraIso } from "../db/momentos";

export type ResultadoDeEscritura =
  | { estado: "guardado"; cliente: Cliente }
  | { estado: "invalido"; fallas: FallaDeValidacion[] }
  | { estado: "no_encontrado" };

export interface ServicioDeClientes {
  listar(tenantId: string): Promise<Cliente[]>;
  obtener(tenantId: string, id: string): Promise<Cliente | null>;
  crear(
    tenantId: string,
    autorId: string,
    datos: DatosDeCliente,
  ): Promise<ResultadoDeEscritura>;
  actualizar(
    tenantId: string,
    id: string,
    datos: DatosDeCliente,
  ): Promise<ResultadoDeEscritura>;
}

interface FilaDeCliente {
  id: string;
  tipo_cliente_id: string | null;
  tipo_cliente_nombre: string | null;
  nombre: string;
  documento_tipo: string | null;
  documento_numero: string | null;
  representante_legal: string | null;
  email: string | null;
  telefono: string | null;
  notas: string | null;
  creado_por: string;
  creado_por_nombre: string | null;
  creado_en: string;
}

/**
 * Las dos uniones son `LEFT JOIN` y llevan su propio `tenant_id`.
 *
 * `LEFT` porque el tipo es opcional; y con el filtro de tenencia repetido en
 * la unión para que un identificador que cruzara la frontera devuelva `NULL`
 * en vez del nombre ajeno.
 */
const SELECCION =
  "SELECT c.id, c.tipo_cliente_id, t.nombre AS tipo_cliente_nombre," +
  " c.nombre, c.documento_tipo, c.documento_numero, c.representante_legal," +
  " c.email, c.telefono, c.notas, c.creado_por," +
  " u.nombre AS creado_por_nombre, c.creado_en" +
  " FROM cliente c" +
  " LEFT JOIN tipo_cliente t" +
  "   ON t.id = c.tipo_cliente_id AND t.tenant_id = c.tenant_id" +
  " LEFT JOIN usuario u" +
  "   ON u.id = c.creado_por AND u.tenant_id = c.tenant_id" +
  " WHERE c.tenant_id = ?";

function aCliente(fila: FilaDeCliente): Cliente {
  return {
    id: fila.id,
    tipoClienteId: fila.tipo_cliente_id,
    tipoClienteNombre: fila.tipo_cliente_nombre,
    nombre: fila.nombre,
    documentoTipo: fila.documento_tipo,
    documentoNumero: fila.documento_numero,
    representanteLegal: fila.representante_legal,
    email: fila.email,
    telefono: fila.telefono,
    notas: fila.notas,
    creadoPor: fila.creado_por,
    creadoPorNombre: fila.creado_por_nombre,
    creadoEn: fila.creado_en,
  };
}

export function servicioSobreD1(base: BaseDeDatos): ServicioDeClientes {
  const db = base.lectura;

  async function obtener(
    tenantId: string,
    id: string,
  ): Promise<Cliente | null> {
    const fila = await db
      .prepare(`${SELECCION} AND c.id = ?`)
      .bind(tenantId, id)
      .first<FilaDeCliente>();

    return fila === null ? null : aCliente(fila);
  }

  /**
   * El tipo tiene que ser una fila del catálogo **de este tenant**.
   *
   * No se exige `activo = 1`: dar de baja un tipo dejaría sin poder guardar a
   * todos los clientes que ya lo tienen, y editar un teléfono fallaría con un
   * error que no se entiende. Quién se puede *elegir* es decisión de la
   * pantalla (`tiposSeleccionables`); qué es *válido* es esto. El listado del
   * catálogo vive en `worker/catalogos/` desde T-6, que es quien lo escribe.
   */
  async function tipoDesconocido(
    tenantId: string,
    tipoClienteId: string,
  ): Promise<boolean> {
    const fila = await db
      .prepare("SELECT id FROM tipo_cliente WHERE tenant_id = ? AND id = ?")
      .bind(tenantId, tipoClienteId)
      .first<{ id: string }>();

    return fila === null;
  }

  async function validarTipo(
    tenantId: string,
    datos: DatosDeCliente,
  ): Promise<FallaDeValidacion[]> {
    if (datos.tipoClienteId === null) return [];
    if (!(await tipoDesconocido(tenantId, datos.tipoClienteId))) return [];

    return [{ campo: "tipoClienteId", motivo: "tipo_cliente_desconocido" }];
  }

  return {
    async listar(tenantId) {
      const { results } = await db
        .prepare(`${SELECCION} ORDER BY c.nombre COLLATE NOCASE`)
        .bind(tenantId)
        .all<FilaDeCliente>();

      return results.map(aCliente);
    },

    obtener,

    async crear(tenantId, autorId, datos) {
      const fallas = await validarTipo(tenantId, datos);
      if (fallas.length > 0) return { estado: "invalido", fallas };

      const id = nuevoId();

      await base.mutar(
        {
          entidad: "cliente",
          entidadId: id,
          accion: "creado",
          detalle: datos.nombre,
        },
        sentencia(
          "INSERT INTO cliente (id, tenant_id, tipo_cliente_id, nombre," +
            " documento_tipo, documento_numero, representante_legal, email," +
            " telefono, notas, creado_por, creado_en)" +
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          id,
          tenantId,
          datos.tipoClienteId,
          datos.nombre,
          datos.documentoTipo,
          datos.documentoNumero,
          datos.representanteLegal,
          datos.email,
          datos.telefono,
          datos.notas,
          autorId,
          ahoraIso(),
        ),
      );

      const cliente = await obtener(tenantId, id);
      if (cliente === null) {
        // Inalcanzable salvo que el `INSERT` no haya escrito: si pasa, es un
        // defecto y no un 404 de negocio.
        throw new Error("el cliente recién creado no se pudo releer");
      }

      return { estado: "guardado", cliente };
    },

    async actualizar(tenantId, id, datos) {
      // La existencia se comprueba **dentro del tenant**. Un cliente de otro
      // tenant es, desde acá, un cliente que no existe: devolver 403 sería
      // confirmarle a quien prueba identificadores que ese existe.
      if ((await obtener(tenantId, id)) === null) {
        return { estado: "no_encontrado" };
      }

      const fallas = await validarTipo(tenantId, datos);
      if (fallas.length > 0) return { estado: "invalido", fallas };

      // `creado_por` y `creado_en` no están en el `SET`: la autoría del alta
      // es un hecho, y editar un teléfono no reescribe quién dio de alta.
      await base.mutar(
        {
          entidad: "cliente",
          entidadId: id,
          accion: "editado",
          detalle: datos.nombre,
        },
        sentencia(
          "UPDATE cliente SET tipo_cliente_id = ?, nombre = ?," +
            " documento_tipo = ?, documento_numero = ?," +
            " representante_legal = ?, email = ?, telefono = ?, notas = ?" +
            " WHERE tenant_id = ? AND id = ?",
          datos.tipoClienteId,
          datos.nombre,
          datos.documentoTipo,
          datos.documentoNumero,
          datos.representanteLegal,
          datos.email,
          datos.telefono,
          datos.notas,
          tenantId,
          id,
        ),
      );

      const cliente = await obtener(tenantId, id);
      if (cliente === null) return { estado: "no_encontrado" };

      return { estado: "guardado", cliente };
    },
  };
}
