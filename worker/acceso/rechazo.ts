/**
 * El vocabulario de rechazos de la puerta de entrada.
 *
 * La puerta **falla cerrada**: no existe un camino que devuelva identidad
 * cuando algo no se pudo comprobar. Todo lo que no termina en una fila de
 * `usuario` viva termina en uno de estos motivos.
 */

export type MotivoDeRechazo =
  /** Ni encabezado `Cf-Access-Jwt-Assertion` ni cookie `CF_Authorization`. */
  | "sin_token"
  /** No tiene tres partes, o alguna no es base64url de un JSON. */
  | "token_malformado"
  /** El encabezado del JWT no dice `RS256`, que es lo único que firma Access. */
  | "algoritmo_no_soportado"
  /** El `kid` no está en el juego de certificados del team. */
  | "clave_desconocida"
  /** La firma no corresponde a la clave pública anunciada. */
  | "firma_invalida"
  /** Sin `exp`, o ya pasó. Un token sin vencimiento no es un token vigente. */
  | "token_expirado"
  /** Tiene `nbf` en el futuro. */
  | "token_aun_no_valido"
  /** El `iss` no es el dominio del team configurado. */
  | "emisor_invalido"
  /** El `aud` no incluye el AUD de esta aplicación de Access. */
  | "audiencia_invalida"
  /** El token es válido pero no trae el reclamo `email`. */
  | "sin_correo"
  /** Access lo dejó pasar, pero no hay fila en `usuario` con ese correo. */
  | "usuario_desconocido"
  /** Hay fila, con `activo = 0`. */
  | "usuario_inactivo"
  /** Falta el dominio del team o el AUD en la configuración del Worker. */
  | "acceso_no_configurado"
  /** El endpoint de certificados no respondió o respondió cualquier cosa. */
  | "claves_no_disponibles";

/**
 * 403 es "vos no entrás"; 503 es "el sistema no puede comprobar quién sos".
 * Los dos cierran la puerta. Separarlos es para el operador: un 403 es una
 * petición mal armada, un 503 es un despliegue mal armado o un servicio caído,
 * y confundirlos haría que un error de configuración se vea como un intruso.
 */
const ESTADO_POR_MOTIVO: Record<MotivoDeRechazo, 403 | 503> = {
  sin_token: 403,
  token_malformado: 403,
  algoritmo_no_soportado: 403,
  clave_desconocida: 403,
  firma_invalida: 403,
  token_expirado: 403,
  token_aun_no_valido: 403,
  emisor_invalido: 403,
  audiencia_invalida: 403,
  sin_correo: 403,
  usuario_desconocido: 403,
  usuario_inactivo: 403,
  acceso_no_configurado: 503,
  claves_no_disponibles: 503,
};

export interface Rechazo {
  motivo: MotivoDeRechazo;
  estado: 403 | 503;
}

/**
 * El resultado de cualquier paso de la puerta. No se usan excepciones: un
 * rechazo es una respuesta esperada del dominio, no un accidente, y el tipo
 * obliga a tratarlo en cada llamada.
 */
export type Resultado<T> =
  | { ok: true; valor: T }
  | { ok: false; rechazo: Rechazo };

export function rechazar<T>(motivo: MotivoDeRechazo): Resultado<T> {
  return { ok: false, rechazo: { motivo, estado: ESTADO_POR_MOTIVO[motivo] } };
}

export function aceptar<T>(valor: T): Resultado<T> {
  return { ok: true, valor };
}
