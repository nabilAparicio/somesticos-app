import { env, exports } from "cloudflare:workers";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { OrigenDeClaves } from "../worker/acceso/claves";
import type { IdentidadActual } from "../worker/contract";
import { TENANT_UNICO_ID, nuevoId } from "../worker/db/ids";
import { manejar } from "../worker/index";

/**
 * Pruebas de la puerta de entrada (`docs/diseno.md` §7: Cloudflare Access como
 * puerta, tabla `usuario` como dueña de la identidad del dominio).
 *
 * La vara es la misma que la de T-2: **la mayoría de lo que hay acá abajo es
 * una petición inválida y una aserción de que se rechaza**. Un token que entra
 * no prueba nada; lo que prueba algo es que el token roto, el vencido, el
 * firmado por un extraño y el del usuario inactivo NO entran.
 *
 * El seam está en **el origen de las claves públicas**, no en la verificación.
 * La firma se verifica de verdad, con WebCrypto, contra un par de llaves RSA
 * generado acá mismo. Lo único que se sustituye es de dónde salen las claves
 * públicas: en producción es el endpoint de certificados del team, en la
 * prueba es un objeto que devuelve la JWK que esta prueba acaba de generar.
 * Si el seam estuviera en la verificación, estas pruebas no probarían nada.
 */

const DOMINIO = "https://bufete-de-prueba.cloudflareaccess.com";
const AUD = "aud-de-la-aplicacion-del-bufete";
const KID_LEGITIMA = "kid-de-la-clave-vigente";
const KID_EXTRANIA = "kid-de-una-clave-ajena";

interface ParDeClaves {
  privada: CryptoKey;
  jwkPublica: JsonWebKeyWithKid;
}

const ALGORITMO_RSA = {
  name: "RSASSA-PKCS1-v1_5",
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: "SHA-256",
} satisfies SubtleCryptoGenerateKeyAlgorithm;

async function generarPar(kid: string): Promise<ParDeClaves> {
  // `generateKey` está tipado como `CryptoKey | CryptoKeyPair` porque sirve
  // para algoritmos simétricos también; con RSA siempre devuelve el par.
  const par = (await crypto.subtle.generateKey(ALGORITMO_RSA, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  // Igual que arriba: `exportKey` está tipado `ArrayBuffer | JsonWebKey`
  // porque el formato es un string en tiempo de ejecución.
  const jwk = (await crypto.subtle.exportKey(
    "jwk",
    par.publicKey,
  )) as JsonWebKey;

  return {
    privada: par.privateKey,
    jwkPublica: { ...jwk, kid, alg: "RS256", use: "sig" },
  };
}

function aBase64Url(bytes: Uint8Array): string {
  let binario = "";
  for (const byte of bytes) binario += String.fromCharCode(byte);
  return btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function textoABase64Url(texto: string): string {
  return aBase64Url(new TextEncoder().encode(texto));
}

function deBase64Url(texto: string): Uint8Array {
  const relleno = "=".repeat((4 - (texto.length % 4)) % 4);
  const binario = atob(
    texto.replace(/-/g, "+").replace(/_/g, "/") + relleno,
  );
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

/**
 * Altera la firma invirtiendo un byte, no un carácter.
 *
 * Cambiar el último carácter de la firma en base64url **no alcanza**: ese
 * carácter solo aporta los 2 bits altos del último byte, así que uno de cada
 * dieciséis cambios decodifica a los mismos bytes y la firma sigue siendo
 * válida. Esta prueba falló de forma intermitente por exactamente eso antes de
 * escribirse así.
 */
function conFirmaAlterada(token: string): string {
  const [encabezado, carga, firma] = token.split(".");
  const bytes = deBase64Url(firma);
  bytes[0] ^= 0xff;
  return `${encabezado}.${carga}.${aBase64Url(bytes)}`;
}

/** Los `exp`/`iat`/`nbf` de un JWT son segundos Unix, no milisegundos. */
function enSegundos(desplazamiento = 0): number {
  return Math.floor(Date.now() / 1000) + desplazamiento;
}

interface CuerpoDelToken {
  aud?: string | string[];
  email?: string;
  exp?: number;
  iat?: number;
  nbf?: number;
  iss?: string;
  type?: string;
  sub?: string;
}

/**
 * La forma exacta del token de aplicación de Access, según la documentación de
 * Cloudflare (`aud` es un arreglo, `iss` es el dominio del team, los momentos
 * van en segundos Unix).
 */
function cuerpoValido(email: string): CuerpoDelToken {
  return {
    aud: [AUD],
    email,
    exp: enSegundos(600),
    iat: enSegundos(-10),
    nbf: enSegundos(-10),
    iss: DOMINIO,
    type: "app",
    sub: "7335d417-61da-459d-899c-0a01c76a2f94",
  };
}

async function firmar(
  cuerpo: CuerpoDelToken,
  par: ParDeClaves,
  kidDeclarado: string,
): Promise<string> {
  const encabezado = textoABase64Url(
    JSON.stringify({ alg: "RS256", kid: kidDeclarado, typ: "JWT" }),
  );
  const carga = textoABase64Url(JSON.stringify(cuerpo));
  const firma = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    par.privada,
    new TextEncoder().encode(`${encabezado}.${carga}`),
  );

  return `${encabezado}.${carga}.${aBase64Url(new Uint8Array(firma))}`;
}

function peticion(ruta: string, init?: RequestInit): Request {
  return new Request(`https://cotizador.bufete.pa${ruta}`, init);
}

function conToken(token: string, ruta = "/api/yo"): Request {
  return peticion(ruta, { headers: { "Cf-Access-Jwt-Assertion": token } });
}

/** El entorno con la configuración de Access puesta, salvo lo que se pise. */
/**
 * El entorno de las pruebas es **hermético**: no hereda nada que no esté acá.
 *
 * Esparcir `env` tal cual traía un defecto grave. `ACCESO_DEV_EMAIL` sale de
 * `.dev.vars`, un archivo local sin versionar que el propio plan le dice al
 * desarrollador que cree. Si existe, la puerta resuelve esa identidad y casi
 * toda la batería de rechazos observa `usuario_desconocido` en vez del motivo
 * que afirma: la suite pasaba o fallaba según qué tuviera cada máquina en un
 * archivo que git no ve. Por eso se anula de forma explícita, y la prueba que
 * quiera la vía de desarrollo la pide por `ajustes`.
 */
function entorno(ajustes: Partial<Env> = {}): Env {
  return {
    ...env,
    ACCESO_TEAM_DOMAIN: DOMINIO,
    ACCESO_AUD: AUD,
    ACCESO_DEV_EMAIL: undefined,
    ...ajustes,
  };
}

let legitima: ParDeClaves;
let extrania: ParDeClaves;

/** El seam: de acá salen las claves públicas en vez del endpoint del team. */
let origenDeClaves: OrigenDeClaves;

/** Un origen que no responde, para probar que la falla es cerrada. */
const origenCaido: OrigenDeClaves = {
  claves() {
    return Promise.reject(new Error("el endpoint de certificados no responde"));
  },
};

const EMAIL_ACTIVO = "itzel@bufete.test";
const EMAIL_INACTIVO = "exsocio@bufete.test";
const EMAIL_DESCONOCIDO = "cualquiera@gmail.test";

let usuarioActivoId: string;

beforeAll(async () => {
  legitima = await generarPar(KID_LEGITIMA);
  extrania = await generarPar(KID_EXTRANIA);

  // Solo la legítima está en el juego de certificados. La extraña existe para
  // poder firmar con una clave que el juego no conoce.
  origenDeClaves = {
    claves: () => Promise.resolve([legitima.jwkPublica]),
  };
});

beforeEach(async () => {
  usuarioActivoId = nuevoId();

  // El almacenamiento está aislado por archivo, no por prueba, así que la
  // siembra se rehace desde cero en cada una. Sin esto, el índice único
  // `(tenant_id, email)` rechazaría la segunda.
  await env.DB.prepare("DELETE FROM usuario").run();

  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO usuario (id, tenant_id, nombre, email, activo)" +
        " VALUES (?, ?, ?, ?, 1)",
    ).bind(usuarioActivoId, TENANT_UNICO_ID, "Itzel", EMAIL_ACTIVO),
    env.DB.prepare(
      "INSERT INTO usuario (id, tenant_id, nombre, email, activo)" +
        " VALUES (?, ?, ?, ?, 0)",
    ).bind(nuevoId(), TENANT_UNICO_ID, "Ex socio", EMAIL_INACTIVO),
  ]);
});

async function motivoDe(respuesta: Response): Promise<string> {
  const cuerpo = (await respuesta.json()) as { motivo?: string };
  return cuerpo.motivo ?? "";
}

describe("se rechaza lo que no trae identidad verificable", () => {
  it("rechaza una petición sin encabezado ni cookie", async () => {
    const respuesta = await manejar(peticion("/api/yo"), entorno(), {
      origenDeClaves,
    });

    expect(respuesta.status).toBe(403);
    expect(await motivoDe(respuesta)).toBe("sin_token");
  });

  it("rechaza un token con la firma alterada", async () => {
    const valido = await firmar(
      cuerpoValido(EMAIL_ACTIVO),
      legitima,
      KID_LEGITIMA,
    );
    // Se le invierte un byte a la firma; el resto del token es idéntico al que
    // sí entra en la prueba de contrapeso.
    const alterado = conFirmaAlterada(valido);
    expect(alterado).not.toBe(valido);

    const respuesta = await manejar(conToken(alterado), entorno(), {
      origenDeClaves,
    });

    expect(respuesta.status).toBe(403);
    expect(await motivoDe(respuesta)).toBe("firma_invalida");
  });

  it("rechaza un token firmado con una clave que no está en el juego de certificados", async () => {
    const token = await firmar(
      cuerpoValido(EMAIL_ACTIVO),
      extrania,
      KID_EXTRANIA,
    );

    const respuesta = await manejar(conToken(token), entorno(), {
      origenDeClaves,
    });

    expect(respuesta.status).toBe(403);
    expect(await motivoDe(respuesta)).toBe("clave_desconocida");
  });

  it("rechaza un token firmado por un extraño que se hace pasar por la clave vigente", async () => {
    // El `kid` dice la clave buena, la firma es de la mala. Si el código
    // confiara en el `kid` sin verificar, esto entraría.
    const token = await firmar(
      cuerpoValido(EMAIL_ACTIVO),
      extrania,
      KID_LEGITIMA,
    );

    const respuesta = await manejar(conToken(token), entorno(), {
      origenDeClaves,
    });

    expect(respuesta.status).toBe(403);
    expect(await motivoDe(respuesta)).toBe("firma_invalida");
  });

  it("rechaza un token expirado", async () => {
    const token = await firmar(
      { ...cuerpoValido(EMAIL_ACTIVO), exp: enSegundos(-60) },
      legitima,
      KID_LEGITIMA,
    );

    const respuesta = await manejar(conToken(token), entorno(), {
      origenDeClaves,
    });

    expect(respuesta.status).toBe(403);
    expect(await motivoDe(respuesta)).toBe("token_expirado");
  });

  it("rechaza un token sin `exp`, en vez de tratarlo como eterno", async () => {
    const cuerpo = cuerpoValido(EMAIL_ACTIVO);
    delete cuerpo.exp;
    const token = await firmar(cuerpo, legitima, KID_LEGITIMA);

    const respuesta = await manejar(conToken(token), entorno(), {
      origenDeClaves,
    });

    expect(respuesta.status).toBe(403);
    expect(await motivoDe(respuesta)).toBe("token_expirado");
  });

  it("rechaza un token con el `aud` de otra aplicación", async () => {
    const token = await firmar(
      { ...cuerpoValido(EMAIL_ACTIVO), aud: ["aud-de-otra-aplicacion"] },
      legitima,
      KID_LEGITIMA,
    );

    const respuesta = await manejar(conToken(token), entorno(), {
      origenDeClaves,
    });

    expect(respuesta.status).toBe(403);
    expect(await motivoDe(respuesta)).toBe("audiencia_invalida");
  });

  it("rechaza un token emitido por otro team de Access", async () => {
    const token = await firmar(
      { ...cuerpoValido(EMAIL_ACTIVO), iss: "https://otro.cloudflareaccess.com" },
      legitima,
      KID_LEGITIMA,
    );

    const respuesta = await manejar(conToken(token), entorno(), {
      origenDeClaves,
    });

    expect(respuesta.status).toBe(403);
    expect(await motivoDe(respuesta)).toBe("emisor_invalido");
  });

  it("rechaza un token con `alg: none` y sin firma", async () => {
    // El ataque clásico contra verificadores escritos a mano.
    const encabezado = textoABase64Url(
      JSON.stringify({ alg: "none", kid: KID_LEGITIMA, typ: "JWT" }),
    );
    const carga = textoABase64Url(JSON.stringify(cuerpoValido(EMAIL_ACTIVO)));

    const respuesta = await manejar(
      conToken(`${encabezado}.${carga}.`),
      entorno(),
      { origenDeClaves },
    );

    expect(respuesta.status).toBe(403);
    expect(await motivoDe(respuesta)).toBe("algoritmo_no_soportado");
  });

  it("rechaza algo que ni siquiera es un JWT", async () => {
    const respuesta = await manejar(conToken("esto-no-es-un-token"), entorno(), {
      origenDeClaves,
    });

    expect(respuesta.status).toBe(403);
    expect(await motivoDe(respuesta)).toBe("token_malformado");
  });
});

describe("se rechaza la identidad que Access aprueba pero el bufete no", () => {
  it("rechaza un token válido cuyo correo no existe en `usuario`", async () => {
    // Access deja pasar a cualquiera que su política apruebe. El sistema no da
    // de alta usuarios solos: si no hay fila, no hay identidad de dominio.
    const token = await firmar(
      cuerpoValido(EMAIL_DESCONOCIDO),
      legitima,
      KID_LEGITIMA,
    );

    const respuesta = await manejar(conToken(token), entorno(), {
      origenDeClaves,
    });

    expect(respuesta.status).toBe(403);
    expect(await motivoDe(respuesta)).toBe("usuario_desconocido");
  });

  it("rechaza un token válido de un usuario con `activo = 0`", async () => {
    const token = await firmar(
      cuerpoValido(EMAIL_INACTIVO),
      legitima,
      KID_LEGITIMA,
    );

    const respuesta = await manejar(conToken(token), entorno(), {
      origenDeClaves,
    });

    expect(respuesta.status).toBe(403);
    expect(await motivoDe(respuesta)).toBe("usuario_inactivo");
  });

  it("rechaza un token válido sin reclamo de correo", async () => {
    const cuerpo = cuerpoValido(EMAIL_ACTIVO);
    delete cuerpo.email;
    const token = await firmar(cuerpo, legitima, KID_LEGITIMA);

    const respuesta = await manejar(conToken(token), entorno(), {
      origenDeClaves,
    });

    expect(respuesta.status).toBe(403);
    expect(await motivoDe(respuesta)).toBe("sin_correo");
  });

  it("no resuelve el correo de un usuario de otro tenant", async () => {
    // I-8: ninguna consulta se escribe sin filtrar por `tenant_id`. Hoy hay un
    // solo tenant, así que la única forma de probarlo es sembrar otro.
    const otroTenant = nuevoId();
    const emailAjeno = "ajeno@otrobufete.test";
    await env.DB.prepare("INSERT INTO tenant (id, nombre) VALUES (?, ?)")
      .bind(otroTenant, "Otro bufete")
      .run();
    await env.DB.prepare(
      "INSERT INTO usuario (id, tenant_id, nombre, email, activo)" +
        " VALUES (?, ?, ?, ?, 1)",
    )
      .bind(nuevoId(), otroTenant, "Ajeno", emailAjeno)
      .run();

    const token = await firmar(cuerpoValido(emailAjeno), legitima, KID_LEGITIMA);

    const respuesta = await manejar(conToken(token), entorno(), {
      origenDeClaves,
    });

    expect(respuesta.status).toBe(403);
    expect(await motivoDe(respuesta)).toBe("usuario_desconocido");
  });
});

describe("se rechaza cuando la verificación no se puede completar", () => {
  it("rechaza si falta el AUD de la aplicación", async () => {
    const token = await firmar(
      cuerpoValido(EMAIL_ACTIVO),
      legitima,
      KID_LEGITIMA,
    );

    const respuesta = await manejar(
      conToken(token),
      entorno({ ACCESO_AUD: "" }),
      { origenDeClaves },
    );

    expect(respuesta.status).toBe(503);
    expect(await motivoDe(respuesta)).toBe("acceso_no_configurado");
  });

  it("rechaza si falta el dominio del team", async () => {
    const token = await firmar(
      cuerpoValido(EMAIL_ACTIVO),
      legitima,
      KID_LEGITIMA,
    );

    const respuesta = await manejar(
      conToken(token),
      entorno({ ACCESO_TEAM_DOMAIN: "" }),
      { origenDeClaves },
    );

    expect(respuesta.status).toBe(503);
    expect(await motivoDe(respuesta)).toBe("acceso_no_configurado");
  });

  it("rechaza si el endpoint de certificados no responde", async () => {
    const token = await firmar(
      cuerpoValido(EMAIL_ACTIVO),
      legitima,
      KID_LEGITIMA,
    );

    const respuesta = await manejar(conToken(token), entorno(), {
      origenDeClaves: origenCaido,
    });

    expect(respuesta.status).toBe(503);
    expect(await motivoDe(respuesta)).toBe("claves_no_disponibles");
  });
});

describe("contrapeso · lo que sí tiene que pasar", () => {
  // Sin esto, todas las pruebas de rechazo de arriba pasarían igual con una
  // puerta que rechaza absolutamente todo.
  it("un token válido de un usuario activo resuelve al `usuario_id` correcto", async () => {
    const token = await firmar(
      cuerpoValido(EMAIL_ACTIVO),
      legitima,
      KID_LEGITIMA,
    );

    const respuesta = await manejar(conToken(token), entorno(), {
      origenDeClaves,
    });

    expect(respuesta.status).toBe(200);

    const identidad = (await respuesta.json()) as IdentidadActual;
    expect(identidad.usuarioId).toBe(usuarioActivoId);
    expect(identidad.email).toBe(EMAIL_ACTIVO);
    expect(identidad.nombre).toBe("Itzel");
  });

  it("acepta el token en la cookie `CF_Authorization` además del encabezado", async () => {
    const token = await firmar(
      cuerpoValido(EMAIL_ACTIVO),
      legitima,
      KID_LEGITIMA,
    );

    const respuesta = await manejar(
      peticion("/api/yo", {
        headers: { cookie: `otra=cosa; CF_Authorization=${token}` },
      }),
      entorno(),
      { origenDeClaves },
    );

    expect(respuesta.status).toBe(200);
    const identidad = (await respuesta.json()) as IdentidadActual;
    expect(identidad.usuarioId).toBe(usuarioActivoId);
  });
});

describe("la puerta cubre toda la API menos salud", () => {
  it("deja pasar `/api/health` sin token", async () => {
    // Un endpoint de salud detrás de autenticación no sirve para monitorear.
    const respuesta = await exports.default.fetch(
      peticion("/api/health") as Parameters<typeof exports.default.fetch>[0],
    );

    expect(respuesta.status).toBe(200);
  });

  it("rechaza `/api/yo` sin token también por la vía del Worker desplegado", async () => {
    const respuesta = await exports.default.fetch(
      peticion("/api/yo") as Parameters<typeof exports.default.fetch>[0],
    );

    expect(respuesta.status).toBe(403);
  });

  it("exige identidad antes de decidir que una ruta no existe", async () => {
    // Si el 404 saliera primero, cualquiera podría enumerar rutas sin entrar.
    const respuesta = await manejar(peticion("/api/no-existe"), entorno(), {
      origenDeClaves,
    });

    expect(respuesta.status).toBe(403);
    expect(await motivoDe(respuesta)).toBe("sin_token");
  });

  it("devuelve 404 para una ruta inexistente cuando la identidad sí es válida", async () => {
    const token = await firmar(
      cuerpoValido(EMAIL_ACTIVO),
      legitima,
      KID_LEGITIMA,
    );

    const respuesta = await manejar(
      conToken(token, "/api/no-existe"),
      entorno(),
      { origenDeClaves },
    );

    expect(respuesta.status).toBe(404);
  });
});

describe("la vía de desarrollo local", () => {
  // `ACCESO_DEV_EMAIL` solo existe en `.dev.vars`/`.env`, que no se suben en un
  // despliegue, y además la rama entera se elimina del bundle de producción
  // porque está detrás de `import.meta.env.DEV`. Estas pruebas corren en modo
  // desarrollo, así que acá sí está viva.
  it("resuelve la identidad sin token cuando el correo de desarrollo está puesto", async () => {
    const respuesta = await manejar(
      peticion("/api/yo"),
      entorno({ ACCESO_DEV_EMAIL: EMAIL_ACTIVO }),
      { origenDeClaves },
    );

    expect(respuesta.status).toBe(200);
    const identidad = (await respuesta.json()) as IdentidadActual;
    expect(identidad.usuarioId).toBe(usuarioActivoId);
  });

  it("no da de alta al usuario: si el correo de desarrollo no está en `usuario`, rechaza", async () => {
    const respuesta = await manejar(
      peticion("/api/yo"),
      entorno({ ACCESO_DEV_EMAIL: EMAIL_DESCONOCIDO }),
      { origenDeClaves },
    );

    expect(respuesta.status).toBe(403);
    expect(await motivoDe(respuesta)).toBe("usuario_desconocido");
  });

  it("no deja pasar a un usuario inactivo por la vía de desarrollo", async () => {
    const respuesta = await manejar(
      peticion("/api/yo"),
      entorno({ ACCESO_DEV_EMAIL: EMAIL_INACTIVO }),
      { origenDeClaves },
    );

    expect(respuesta.status).toBe(403);
    expect(await motivoDe(respuesta)).toBe("usuario_inactivo");
  });

  it("sin el correo de desarrollo puesto, la vía no existe y se exige token", async () => {
    const respuesta = await manejar(peticion("/api/yo"), entorno(), {
      origenDeClaves,
    });

    expect(respuesta.status).toBe(403);
    expect(await motivoDe(respuesta)).toBe("sin_token");
  });
});

describe("la forma de producción de la puerta", () => {
  // El defecto que encontró la revisión: todas las pruebas corren con la
  // bandera de compilación en desarrollo, así que ninguna ejercía el camino
  // que corre desplegado. La suite probaba que la vía de desarrollo funciona
  // y nunca que está ausente. Inyectando un origen de correo que siempre
  // devuelve `null` se ejerce exactamente la forma de producción, con la
  // misma vara de rechazo.
  const comoEnProduccion = {
    origenDeClaves,
    correoDeDesarrollo: () => null,
  };

  it("rechaza una petición sin token aunque ACCESO_DEV_EMAIL esté puesta", async () => {
    const respuesta = await manejar(
      peticion("/api/yo"),
      entorno({ ACCESO_DEV_EMAIL: EMAIL_ACTIVO }),
      { ...comoEnProduccion, origenDeClaves },
    );

    expect(respuesta.status).toBe(403);
    expect(await motivoDe(respuesta)).toBe("sin_token");
  });

  it("sigue rechazando una firma alterada en la forma de producción", async () => {
    const alterado = conFirmaAlterada(
      await firmar(cuerpoValido(EMAIL_ACTIVO), legitima, KID_LEGITIMA),
    );

    const respuesta = await manejar(conToken(alterado), entorno(), {
      ...comoEnProduccion,
      origenDeClaves,
    });

    expect(respuesta.status).toBe(403);
    expect(await motivoDe(respuesta)).toBe("firma_invalida");
  });

  it("acepta un token válido en la forma de producción", async () => {
    const token = await firmar(
      cuerpoValido(EMAIL_ACTIVO),
      legitima,
      KID_LEGITIMA,
    );

    const respuesta = await manejar(conToken(token), entorno(), {
      ...comoEnProduccion,
      origenDeClaves,
    });

    expect(respuesta.status).toBe(200);
  });
});

describe("la vía de desarrollo quedó detrás de la guarda de configuración", () => {
  // Antes se consultaba primero, y esa precedencia era el defecto: un
  // despliegue a medias se habría abierto por esta puerta. Ahora el 503 gana.
  it("falla cerrada sin AUD aunque ACCESO_DEV_EMAIL esté puesta", async () => {
    const respuesta = await manejar(
      peticion("/api/yo"),
      entorno({ ACCESO_AUD: "", ACCESO_DEV_EMAIL: EMAIL_ACTIVO }),
      { origenDeClaves },
    );

    expect(respuesta.status).toBe(503);
    expect(await motivoDe(respuesta)).toBe("acceso_no_configurado");
  });
});

describe("el entorno de las pruebas no hereda estado local", () => {
  // Esta es la prueba del defecto, no de la corrección: si alguien vuelve a
  // esparcir `env` sin anular la variable, esto falla en las máquinas que
  // tengan `.dev.vars` y pasa en las que no. Dejarla explícita hace que el
  // desvío se vea en la suite y no en una diferencia entre computadoras.
  it("entorno() entrega ACCESO_DEV_EMAIL sin definir salvo que se pida", () => {
    expect(entorno().ACCESO_DEV_EMAIL).toBeUndefined();
    expect(entorno({ ACCESO_DEV_EMAIL: EMAIL_ACTIVO }).ACCESO_DEV_EMAIL).toBe(
      EMAIL_ACTIVO,
    );
  });

  it("rechaza sin token aunque la máquina tenga la variable puesta", async () => {
    // Se simula la máquina con `.dev.vars`: la variable llega en el entorno
    // base. Sin la anulación de `entorno()`, esto devolvería una identidad.
    const respuesta = await manejar(
      peticion("/api/yo"),
      { ...entorno(), ACCESO_AUD: "" },
      { origenDeClaves },
    );

    expect(respuesta.status).toBe(503);
  });
});
