/**
 * Shapes exchanged over the HTTP API. Type-only, so it is safe to compile this
 * file both in the Worker project and in the browser project.
 */

export interface HealthReport {
  status: "ok" | "degraded";
  d1: "ok" | "error";
  timestamp: string;
}

/**
 * Quién entró. Lo que viaja es el `usuario_id` de la tabla `usuario`, nunca el
 * token de Access: es la llave que las invariantes de autoría necesitan.
 */
export interface IdentidadActual {
  usuarioId: string;
  email: string;
  nombre: string;
}

/** Cuerpo de toda respuesta de la puerta que no deja pasar. */
export interface AccesoDenegado {
  error: "acceso_denegado";
  motivo: string;
}
