/**
 * Verificación del token de aplicación de Cloudflare Access.
 *
 * La criptografía la hace WebCrypto, que el runtime de Workers provee. Acá no
 * se implementa ni una primitiva: lo único que se escribe es el recorrido del
 * token y el **orden** de las comprobaciones, que es la mitad de la seguridad
 * de un verificador de JWT.
 *
 * El orden importa y es este:
 *
 * 1. Partir el token y leer el encabezado. Nada del encabezado se cree todavía.
 * 2. Exigir `RS256`. Un `alg` que no sea ese —`none` sobre todo— se rechaza
 *    antes de tocar nada más.
 * 3. Buscar la clave por `kid` en el juego de certificados. El `kid` dice qué
 *    clave *dice* el emisor que usó; no es una credencial.
 * 4. **Verificar la firma.** Recién después de esto el cuerpo es creíble.
 * 5. Leer el cuerpo y comprobar `iss`, `aud`, `exp`, `nbf` y `email`.
 *
 * Comprobar los reclamos antes de la firma sería leerle los papeles a alguien
 * que todavía no mostró la cara.
 *
 * Forma del token verificada contra la documentación de Cloudflare el
 * 22-oct-2026 (`.../authorization-cookie/application-token/`): encabezado
 * `{alg: "RS256", kid, typ}`, cuerpo `{aud: [...], email, exp, iat, nbf, iss,
 * type, sub, country}`, momentos en segundos Unix.
 */

import type { OrigenDeClaves } from "./claves";
import { aceptar, rechazar, type Resultado } from "./rechazo";

export interface ReclamosDeAcceso {
  email: string;
  sub: string;
}

export interface ExigenciasDelToken {
  /** El `iss` que el token tiene que traer: el dominio del team. */
  emisor: string;
  /** El AUD de esta aplicación de Access. */
  audiencia: string;
}

/** Lo único que Access firma. */
const ALGORITMO_ESPERADO = "RS256";

const IMPORTACION_RSA = {
  name: "RSASSA-PKCS1-v1_5",
  hash: "SHA-256",
} satisfies SubtleCryptoImportKeyAlgorithm;

function bytesDeBase64Url(texto: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(texto)) return null;

  const relleno = "=".repeat((4 - (texto.length % 4)) % 4);
  const base64 = texto.replace(/-/g, "+").replace(/_/g, "/") + relleno;

  try {
    const binario = atob(base64);
    const bytes = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

function jsonDeBase64Url(texto: string): Record<string, unknown> | null {
  const bytes = bytesDeBase64Url(texto);
  if (bytes === null) return null;

  try {
    const valor: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (typeof valor !== "object" || valor === null || Array.isArray(valor)) {
      return null;
    }
    return valor as Record<string, unknown>;
  } catch {
    return null;
  }
}

function incluyeAudiencia(aud: unknown, esperada: string): boolean {
  if (typeof aud === "string") return aud === esperada;
  if (Array.isArray(aud)) return aud.includes(esperada);
  return false;
}

/** Los momentos del JWT son segundos Unix, no milisegundos. */
function ahoraEnSegundos(): number {
  return Math.floor(Date.now() / 1000);
}

export async function verificarToken(
  token: string,
  origen: OrigenDeClaves,
  exigencias: ExigenciasDelToken,
): Promise<Resultado<ReclamosDeAcceso>> {
  const partes = token.split(".");
  if (partes.length !== 3) return rechazar("token_malformado");

  const [encabezadoCrudo, cargaCruda, firmaCruda] = partes;
  const encabezado = jsonDeBase64Url(encabezadoCrudo);
  if (encabezado === null) return rechazar("token_malformado");

  if (encabezado.alg !== ALGORITMO_ESPERADO) {
    return rechazar("algoritmo_no_soportado");
  }
  if (typeof encabezado.kid !== "string" || encabezado.kid === "") {
    return rechazar("token_malformado");
  }

  let disponibles: JsonWebKeyWithKid[];
  try {
    disponibles = await origen.claves();
  } catch {
    // Si no se pueden conseguir las claves, no se puede verificar; y lo que no
    // se puede verificar no pasa. Nunca "se deja pasar porque no se pudo".
    return rechazar("claves_no_disponibles");
  }

  const jwk = disponibles.find((clave) => clave.kid === encabezado.kid);
  if (jwk === undefined) return rechazar("clave_desconocida");

  const firma = bytesDeBase64Url(firmaCruda);
  if (firma === null) return rechazar("token_malformado");

  let clavePublica: CryptoKey;
  try {
    clavePublica = await crypto.subtle.importKey(
      "jwk",
      jwk,
      IMPORTACION_RSA,
      false,
      ["verify"],
    );
  } catch {
    // Una clave del juego que no se puede importar es una clave con la que no
    // se puede verificar: mismo tratamiento que no tenerla.
    return rechazar("clave_desconocida");
  }

  const firmado = new TextEncoder().encode(`${encabezadoCrudo}.${cargaCruda}`);
  const valida = await crypto.subtle.verify(
    IMPORTACION_RSA.name,
    clavePublica,
    firma,
    firmado,
  );
  if (!valida) return rechazar("firma_invalida");

  // --- Desde acá el cuerpo es creíble, porque la firma lo cubre. ---

  const carga = jsonDeBase64Url(cargaCruda);
  if (carga === null) return rechazar("token_malformado");

  if (carga.iss !== exigencias.emisor) return rechazar("emisor_invalido");
  if (!incluyeAudiencia(carga.aud, exigencias.audiencia)) {
    return rechazar("audiencia_invalida");
  }

  const ahora = ahoraEnSegundos();

  // Sin `exp` no hay vencimiento, y un token sin vencimiento es un token
  // eterno. Se trata igual que uno vencido.
  if (typeof carga.exp !== "number" || !Number.isFinite(carga.exp)) {
    return rechazar("token_expirado");
  }
  if (ahora >= carga.exp) return rechazar("token_expirado");

  if (typeof carga.nbf === "number" && ahora < carga.nbf) {
    return rechazar("token_aun_no_valido");
  }

  if (typeof carga.email !== "string" || carga.email.trim() === "") {
    return rechazar("sin_correo");
  }

  return aceptar({
    email: carga.email,
    sub: typeof carga.sub === "string" ? carga.sub : "",
  });
}
