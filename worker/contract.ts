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
  | "tipo_cliente_desconocido"
  /* --- Catálogos (T-6). Un solo vocabulario de fallas para toda la API:
     dos uniones paralelas obligarían a dos `Resultado`, dos `pedir` y dos
     mapas de mensajes para decir lo mismo. --- */
  /** Un tipo de proceso sin área. El área no es opcional. */
  | "area_requerida"
  /** El `areaId` no es una fila de `area` de ESTE tenant. */
  | "area_desconocida"
  /** Un id de etapa que no pertenece a la plantilla que se está guardando. */
  | "etapa_desconocida";

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

/* ==========================================================================
   Catálogos del bufete (T-6)

   `area`, `tipo_proceso`, `etapa_plantilla` y `tipo_cliente` son datos del
   bufete, no configuración de desarrollador: se crean, se editan y se borran
   desde la aplicación (`docs/diseno.md` §6, «Las plantillas son del bufete,
   no del sistema»). `tipo_cliente` entra acá porque T-5 lo dejó sin forma de
   poblarse.

   Los cuatro llevan la misma marca `activo` que `tipo_cliente` estrenó en
   T-5, y por la misma razón: dar de baja saca la fila de lo *elegible* sin
   invalidar lo ya guardado. Viaja marcada, no omitida.
   ========================================================================== */

/** Una rama del derecho: familia, migración, civil, penal. */
export interface Area {
  id: string;
  nombre: string;
  activo: boolean;
}

/**
 * Un tipo de proceso dentro de su área, tan granular como haga falta: una
 * visa de trabajo y una de pensionado son tipos distintos (`docs/diseno.md`
 * §6). `areaNombre` se resuelve en lectura, igual que el autor de un cliente.
 */
export interface TipoProceso {
  id: string;
  areaId: string;
  areaNombre: string | null;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
}

/**
 * Un paso del plan por defecto de un tipo de proceso.
 *
 * No lleva `activo`: una etapa de plantilla que sobra se quita, porque nada
 * cuelga de ella. Y su nombre es **texto de cara al cliente** (§6, «Una
 * consecuencia futura que obliga hoy»).
 */
export interface EtapaPlantilla {
  id: string;
  nombre: string;
  orden: number;
}

/** Lo que el formulario manda para un `area` o un `tipo_cliente`. */
export interface DatosDeCatalogo {
  nombre: string;
  activo: boolean;
}

export interface DatosDeTipoProceso {
  areaId: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
}

/** Una etapa en el envío: sin `id` es nueva, con `id` es la que ya existía. */
export interface DatosDeEtapa {
  id: string | null;
  nombre: string;
}

/**
 * Qué impide borrar una fila de catálogo, y cuántos son.
 *
 * La política de borrado de T-6: se puede borrar lo que no tiene
 * dependientes; lo que los tiene se da de baja. El choque contra la llave
 * foránea —que T-2 dejó en `NO ACTION` a propósito— nunca sale como un 500
 * ni como un error de SQL crudo: se cuenta antes y se contesta esto con 409.
 */
export type EntidadDependiente =
  | "tipo_proceso"
  | "etapa_plantilla"
  | "proceso"
  | "cliente";

export interface Dependencia {
  entidad: EntidadDependiente;
  cuantos: number;
}

export interface BorradoBloqueado {
  error: "tiene_dependientes";
  entidad: "area" | "tipo_proceso" | "tipo_cliente";
  dependencias: Dependencia[];
}

export interface RespuestaDeAreas {
  areas: Area[];
}

export interface RespuestaDeArea {
  area: Area;
}

export interface RespuestaDeTiposProceso {
  tipos: TipoProceso[];
}

export interface RespuestaDeTipoProceso {
  tipo: TipoProceso;
}

export interface RespuestaDeTipoCliente {
  tipo: TipoCliente;
}

export interface RespuestaDeEtapas {
  etapas: EtapaPlantilla[];
}
