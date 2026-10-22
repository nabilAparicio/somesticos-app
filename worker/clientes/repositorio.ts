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
 * Lo que este archivo NO hace, a propósito: escribir en `bitacora`. Ese
 * registro es T-10, y se va a cablear en un solo lugar de la capa de
 * comandos. Esparcirlo ahora obligaría a T-10 a deshacerlo.
 */

import type {
  Cliente,
  DatosDeCliente,
  FallaDeValidacion,
  TipoCliente,
} from "../contract";
import { nuevoId } from "../db/ids";
import { ahoraIso } from "../db/momentos";

export type ResultadoDeEscritura =
  | { estado: "guardado"; cliente: Cliente }
  | { estado: "invalido"; fallas: FallaDeValidacion[] }
  | { estado: "no_encontrado" };

export interface ServicioDeClientes {
  listarTipos(tenantId: string): Promise<TipoCliente[]>;
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

interface FilaDeTipo {
  id: string;
  nombre: string;
  activo: number;
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

export function servicioSobreD1(db: D1Database): ServicioDeClientes {
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
   * pantalla (`tiposSeleccionables`); qué es *válido* es esto.
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
    async listarTipos(tenantId) {
      const { results } = await db
        .prepare(
          "SELECT id, nombre, activo FROM tipo_cliente" +
            " WHERE tenant_id = ? ORDER BY nombre COLLATE NOCASE",
        )
        .bind(tenantId)
        .all<FilaDeTipo>();

      return results.map((fila) => ({
        id: fila.id,
        nombre: fila.nombre,
        activo: fila.activo === 1,
      }));
    },

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

      await db
        .prepare(
          "INSERT INTO cliente (id, tenant_id, tipo_cliente_id, nombre," +
            " documento_tipo, documento_numero, representante_legal, email," +
            " telefono, notas, creado_por, creado_en)" +
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(
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
        )
        .run();

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
      await db
        .prepare(
          "UPDATE cliente SET tipo_cliente_id = ?, nombre = ?," +
            " documento_tipo = ?, documento_numero = ?," +
            " representante_legal = ?, email = ?, telefono = ?, notas = ?" +
            " WHERE tenant_id = ? AND id = ?",
        )
        .bind(
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
        )
        .run();

      const cliente = await obtener(tenantId, id);
      if (cliente === null) return { estado: "no_encontrado" };

      return { estado: "guardado", cliente };
    },
  };
}
