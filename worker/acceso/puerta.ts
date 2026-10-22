/**
 * La puerta de entrada: de una petición HTTP a una identidad del dominio.
 *
 * Todo lo que sale de acá es un `usuario_id` o un rechazo. El token no viaja
 * más adentro.
 */

import { TENANT_UNICO_ID } from "../db/ids";
import { origenRemoto, type OrigenDeClaves } from "./claves";
import { normalizarCorreo, resolverUsuario, type Identidad } from "./identidad";
import { rechazar, type Resultado } from "./rechazo";
import { verificarToken } from "./jwt";

/**
 * El encabezado y la cookie donde Access deja el token, verificados contra la
 * documentación de Cloudflare el 22-oct-2026. La documentación recomienda el
 * encabezado; la cookie se acepta porque es la que lleva el navegador cuando
 * la petición no pasa por el proxy que inyecta el encabezado.
 */
const ENCABEZADO_DE_ACCESS = "Cf-Access-Jwt-Assertion";
const COOKIE_DE_ACCESS = "CF_Authorization";

export interface DependenciasDeAcceso {
  /**
   * De dónde salen las claves públicas. Sin esto se usa el endpoint de
   * certificados del team, que es lo que corre en producción.
   */
  origenDeClaves?: OrigenDeClaves;

  /**
   * De dónde sale el correo de desarrollo. Existe como dependencia, y no como
   * una rama suelta dentro de `autenticar`, para que las pruebas puedan correr
   * **la forma de producción**: pasando un origen que siempre devuelve `null`
   * se ejerce exactamente el camino que corre desplegado.
   *
   * Sin esto se usa `correoDeDesarrollo`, que el empaquetador elimina.
   */
  correoDeDesarrollo?: (env: Env) => string | null;
}

function tokenDeLaPeticion(request: Request): string | null {
  const delEncabezado = request.headers.get(ENCABEZADO_DE_ACCESS)?.trim();
  if (delEncabezado) return delEncabezado;

  const cookies = request.headers.get("cookie");
  if (cookies === null) return null;

  for (const parte of cookies.split(";")) {
    const separador = parte.indexOf("=");
    if (separador === -1) continue;
    if (parte.slice(0, separador).trim() !== COOKIE_DE_ACCESS) continue;

    const valor = parte.slice(separador + 1).trim();
    if (valor) return valor;
  }

  return null;
}

/**
 * La vía de desarrollo local, y por qué no se puede encender en producción.
 *
 * Hace falta porque Cloudflare Access no está delante de `vite dev`: en local
 * no hay quien emita un token, así que sin esto la aplicación no se puede
 * abrir. Tiene **dos candados independientes**, y los dos tienen que estar
 * abiertos:
 *
 * 1. `import.meta.env.DEV` es una constante de compilación. Vite la sustituye
 *    por `false` literal al construir, y el empaquetador borra la rama entera:
 *    verificado sobre el bundle generado, el cuerpo de este `if` no existe en
 *    `dist/app_cotizador/index.js`. No hay variable, secreto, encabezado ni
 *    valor de configuración que pueda encender código que no está ahí.
 * 2. `ACCESO_DEV_EMAIL` solo puede venir de `.dev.vars` o `.env`, que son
 *    archivos locales que ningún despliegue sube (y que además están en
 *    `.gitignore`). Deliberadamente **no** está en `wrangler.jsonc`: lo que
 *    está ahí sí se despliega.
 *
 * Y aun con los dos candados abiertos la vía no regala identidad: resuelve el
 * correo contra `usuario` igual que el camino real, así que un correo que no
 * está en la tabla, o uno con `activo = 0`, se rechaza lo mismo.
 */
function correoDeDesarrollo(env: Env): string | null {
  if (!import.meta.env.DEV) return null;

  const correo = env.ACCESO_DEV_EMAIL?.trim();
  return correo ? correo : null;
}

export async function autenticar(
  request: Request,
  env: Env,
  dependencias: DependenciasDeAcceso = {},
): Promise<Resultado<Identidad>> {
  const dominioDelTeam = env.ACCESO_TEAM_DOMAIN.trim();
  const audiencia = env.ACCESO_AUD.trim();

  // Falla cerrada: sin configuración no hay con qué verificar, y lo que no se
  // verifica no entra. Se comprueba antes que el token para que un despliegue
  // a medias se distinga de una petición sin credenciales.
  if (dominioDelTeam === "" || audiencia === "") {
    return rechazar("acceso_no_configurado");
  }

  // Después de la guarda de configuración, a propósito: un despliegue a medias
  // tiene que fallar cerrado aunque alguien lograra encender esta vía. Antes
  // estaba primero, y esa precedencia era el defecto.
  const enDesarrollo = (dependencias.correoDeDesarrollo ?? correoDeDesarrollo)(
    env,
  );
  if (enDesarrollo !== null) {
    return resolverUsuario(env.DB, TENANT_UNICO_ID, enDesarrollo);
  }

  const token = tokenDeLaPeticion(request);
  if (token === null) return rechazar("sin_token");

  const reclamos = await verificarToken(
    token,
    dependencias.origenDeClaves ?? origenRemoto(dominioDelTeam),
    { emisor: dominioDelTeam, audiencia },
  );
  if (!reclamos.ok) return reclamos;

  return resolverUsuario(
    env.DB,
    TENANT_UNICO_ID,
    normalizarCorreo(reclamos.valor.email),
  );
}
