/**
 * De dónde salen las claves públicas con las que se verifica el token de
 * Access.
 *
 * Esto es **el único seam** de la puerta. La verificación de la firma no se
 * sustituye nunca —ni en pruebas—, porque una verificación sustituible no
 * verifica nada. Lo que se sustituye es el origen de las claves: en producción
 * el endpoint de certificados del team, en las pruebas un objeto que devuelve
 * la clave pública que la prueba acaba de generar.
 *
 * Forma del endpoint, verificada contra la documentación de Cloudflare el
 * 22-oct-2026 (`/cloudflare-one/access-controls/applications/http-apps/
 * authorization-cookie/validating-json/`): `GET
 * https://<team>.cloudflareaccess.com/cdn-cgi/access/certs` devuelve un JSON
 * con `keys` (arreglo de JWK), más `public_cert` y `public_certs` en PEM, que
 * acá no se usan.
 */

export interface OrigenDeClaves {
  /** Las JWK públicas vigentes del team. Tira si no se pueden conseguir. */
  claves(): Promise<JsonWebKeyWithKid[]>;
}

/**
 * Cuánto se puede reusar la respuesta del endpoint de certificados.
 *
 * El caché es el de la red de Cloudflare, no un `Map` en el módulo: un caché
 * propio en estado global del Worker sobrevive entre peticiones de distintos
 * usuarios y es exactamente el tipo de cosa que después nadie sabe invalidar.
 * Access mantiene la clave anterior junto a la vigente en `public_certs`, así
 * que cinco minutos de desfase durante una rotación no dejan a nadie afuera.
 */
const SEGUNDOS_DE_CACHE = 300;

function esJwkUsable(valor: unknown): valor is JsonWebKeyWithKid {
  if (typeof valor !== "object" || valor === null) return false;
  const jwk = valor as Partial<JsonWebKeyWithKid>;
  return jwk.kty === "RSA" && typeof jwk.kid === "string" && jwk.kid !== "";
}

/**
 * Cómo se pide el juego de certificados. Existe como parámetro **solo** para
 * que las pruebas puedan ejercer las ramas de `origenRemoto` —la URL que arma,
 * la respuesta no-ok, el cuerpo sin `keys`, el filtro y el conjunto vacío—,
 * que de otro modo corren en cada petición desplegada sin que nada las toque.
 *
 * No es un seam de verificación: la firma se sigue verificando de verdad.
 */
export type Pedir = (
  url: string,
  init: RequestInit,
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

const pedirConFetch: Pedir = (url, init) => fetch(url, init);

/** La URL del juego de certificados de un team. Expuesta para probarla. */
export function urlDeCertificados(dominioDelTeam: string): string {
  return `${dominioDelTeam.replace(/\/+$/, "")}/cdn-cgi/access/certs`;
}

export function origenRemoto(
  dominioDelTeam: string,
  pedir: Pedir = pedirConFetch,
): OrigenDeClaves {
  const url = urlDeCertificados(dominioDelTeam);

  return {
    async claves(): Promise<JsonWebKeyWithKid[]> {
      const respuesta = await pedir(url, {
        cf: { cacheTtl: SEGUNDOS_DE_CACHE, cacheEverything: true },
      });

      if (!respuesta.ok) {
        throw new Error(
          `el endpoint de certificados respondió ${String(respuesta.status)}`,
        );
      }

      const cuerpo: unknown = await respuesta.json();
      const claves =
        typeof cuerpo === "object" && cuerpo !== null
          ? (cuerpo as { keys?: unknown }).keys
          : undefined;

      if (!Array.isArray(claves)) {
        throw new Error("el endpoint de certificados no devolvió `keys`");
      }

      const usables = claves.filter(esJwkUsable);
      if (usables.length === 0) {
        throw new Error("el juego de certificados no trae ninguna clave RSA");
      }

      return usables;
    },
  };
}
