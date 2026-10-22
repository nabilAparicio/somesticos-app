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

/* ==========================================================================
   Clientes (T-5)
   ========================================================================== */

/**
 * Una fila del catálogo `tipo_cliente`.
 *
 * Viaja con `activo` en vez de omitir los dados de baja: un cliente viejo
 * puede tener un tipo que ya no se ofrece, y la pantalla de edición necesita
 * poder nombrarlo sin ofrecerlo a los demás (`docs/diseno.md` §6, "Tipos de
 * cliente").
 */
export interface TipoCliente {
  id: string;
  nombre: string;
  activo: boolean;
}

/**
 * Un cliente tal como lo lee la pantalla.
 *
 * Casi todo es `null`able, y eso es el diseño y no un descuido: el alta pide
 * nombre y un medio de contacto, y nada más (`docs/diseno.md` §5). Un
 * formulario completo convertiría I-1 e I-2 en un bloqueo para cotizarle a un
 * prospecto, que es justo el momento en que se cotiza.
 *
 * `tipoClienteNombre` y `creadoPorNombre` se resuelven **en lectura**: lo que
 * se guarda es la llave (§6, "Autoría"). Si una persona cambia de apellido,
 * cuatrocientas filas no quedan firmadas con un nombre que ya no existe.
 */
export interface Cliente {
  id: string;
  tipoClienteId: string | null;
  tipoClienteNombre: string | null;
  nombre: string;
  documentoTipo: string | null;
  documentoNumero: string | null;
  representanteLegal: string | null;
  email: string | null;
  telefono: string | null;
  notas: string | null;
  creadoPor: string;
  creadoPorNombre: string | null;
  creadoEn: string;
}

/** Lo que el formulario manda al crear o editar. Ya normalizado. */
export interface DatosDeCliente {
  nombre: string;
  tipoClienteId: string | null;
  documentoTipo: string | null;
  documentoNumero: string | null;
  representanteLegal: string | null;
  email: string | null;
  telefono: string | null;
  notas: string | null;
}

export type MotivoDeFalla =
  /** Un campo vino con algo que no es texto ni `null`. */
  | "tipo_invalido"
  /** Sin nombre no hay cliente. Es la única columna obligatoria del esquema. */
  | "nombre_requerido"
  /** Ni correo ni teléfono utilizables: el cliente quedaría incontactable. */
  | "contacto_requerido"
  | "correo_invalido"
  | "telefono_invalido"
  /** Tipo de documento sin número, o número sin tipo. */
  | "documento_incompleto"
  /** El `tipoClienteId` no es una fila del catálogo de ESTE tenant. */
  | "tipo_cliente_desconocido";

export interface FallaDeValidacion {
  campo: string;
  motivo: MotivoDeFalla;
}

export interface DatosInvalidos {
  error: "datos_invalidos";
  fallas: FallaDeValidacion[];
}

export interface RespuestaDeCliente {
  cliente: Cliente;
}

export interface RespuestaDeClientes {
  clientes: Cliente[];
}

export interface RespuestaDeTiposCliente {
  tipos: TipoCliente[];
}
