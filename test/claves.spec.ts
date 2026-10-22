import { describe, expect, it } from "vitest";

import type { Pedir } from "../worker/acceso/claves";
import { origenRemoto, urlDeCertificados } from "../worker/acceso/claves";

/**
 * `origenRemoto` es el default de producción de la única dependencia que la
 * puerta no inyecta: cada petición desplegada pasa por acá para conseguir las
 * claves con las que verificar el token.
 *
 * Una revisión marcó que no tenía ni una línea probada. Un defecto en el
 * armado de la URL, o un filtro que descarta una forma de JWK que Access sí
 * devuelve, es un 503 para todos los usuarios con la suite en verde. Abajo
 * está cada rama.
 */

const JWK_RSA = { kty: "RSA", kid: "kid-vigente", n: "…", e: "AQAB" };

function respondiendo(
  cuerpo: unknown,
  { ok = true, status = 200 } = {},
): { pedir: Pedir; vistas: { url: string; init: RequestInit }[] } {
  const vistas: { url: string; init: RequestInit }[] = [];

  const pedir: Pedir = (url, init) => {
    vistas.push({ url, init });
    return Promise.resolve({ ok, status, json: () => Promise.resolve(cuerpo) });
  };

  return { pedir, vistas };
}

describe("urlDeCertificados", () => {
  it("arma la ruta que documenta Cloudflare", () => {
    expect(urlDeCertificados("https://bufete.cloudflareaccess.com")).toBe(
      "https://bufete.cloudflareaccess.com/cdn-cgi/access/certs",
    );
  });

  it("tolera barras finales en el dominio configurado", () => {
    // Un dominio copiado del tablero suele venir con barra. Sin esto la URL
    // queda con doble barra y el endpoint responde 404.
    expect(urlDeCertificados("https://bufete.cloudflareaccess.com///")).toBe(
      "https://bufete.cloudflareaccess.com/cdn-cgi/access/certs",
    );
  });
});

describe("origenRemoto", () => {
  it("devuelve las JWK usables y pide con caché de red", async () => {
    const { pedir, vistas } = respondiendo({ keys: [JWK_RSA] });

    const claves = await origenRemoto("https://bufete.cloudflareaccess.com", pedir).claves();

    expect(claves).toEqual([JWK_RSA]);
    expect(vistas).toHaveLength(1);
    expect(vistas[0]?.url).toBe(
      "https://bufete.cloudflareaccess.com/cdn-cgi/access/certs",
    );
    expect(vistas[0]?.init.cf).toEqual({
      cacheTtl: 300,
      cacheEverything: true,
    });
  });

  it("descarta lo que no es una JWK RSA con kid y conserva el resto", async () => {
    const { pedir } = respondiendo({
      keys: [null, "texto", { kty: "EC", kid: "x" }, { kty: "RSA" }, { kty: "RSA", kid: "" }, JWK_RSA],
    });

    const claves = await origenRemoto("https://bufete.cloudflareaccess.com", pedir).claves();

    expect(claves).toEqual([JWK_RSA]);
  });

  const fallas: [string, unknown, { ok: boolean; status: number }, RegExp][] = [
    ["el endpoint responde 500", {}, { ok: false, status: 500 }, /respondió 500/],
    ["el endpoint responde 404", {}, { ok: false, status: 404 }, /respondió 404/],
    ["el cuerpo no trae `keys`", { public_cert: "…" }, { ok: true, status: 200 }, /no devolvió `keys`/],
    ["`keys` no es un arreglo", { keys: "no-es-arreglo" }, { ok: true, status: 200 }, /no devolvió `keys`/],
    ["el cuerpo no es un objeto", "no-es-objeto", { ok: true, status: 200 }, /no devolvió `keys`/],
    ["ninguna clave pasa el filtro", { keys: [{ kty: "EC", kid: "x" }] }, { ok: true, status: 200 }, /ninguna clave RSA/],
    ["`keys` viene vacío", { keys: [] }, { ok: true, status: 200 }, /ninguna clave RSA/],
  ];

  it.each(fallas)("tira cuando %s", async (_nombre, cuerpo, estado, mensaje) => {
    const { pedir } = respondiendo(cuerpo, estado);

    await expect(
      origenRemoto("https://bufete.cloudflareaccess.com", pedir).claves(),
    ).rejects.toThrow(mensaje);
  });
});
