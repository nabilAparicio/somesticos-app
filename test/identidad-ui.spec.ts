/**
 * El cliente de la identidad (`odd/tasks/armazon-de-aplicacion.md`, T-3).
 *
 * `GET /api/yo` existe desde T-3 de la tajada 1 y hasta ahora lo consumía
 * **una** pantalla, `src/pantallas/Inicio.tsx`, con un `fetch` a mano: un
 * `response.status === 200` y todo lo demás aplastado en «sin identidad».
 * Esa forma tenía dos defectos que esta suite fija de una vez, porque son
 * los dos que no se ven mirando la pantalla:
 *
 *  1. **El motivo del rechazo se perdía.** La puerta contesta 403 con un
 *     cuerpo que dice *por qué* —`acceso_no_configurado` cuando
 *     `wrangler.jsonc` sigue con los valores de ejemplo, `sin_token` en
 *     local, `usuario_desconocido` cuando el correo pasó Access y no tiene
 *     fila en `usuario`— y las tres piden cosas distintas de quien mira. Un
 *     `status === 200` las vuelve la misma nada.
 *  2. **El 503 no era 403.** `pedir` junta los dos en `sin_acceso` a
 *     propósito (ver `src/api/peticiones.ts`), y un `fetch` a mano los trata
 *     distinto sin que nadie lo haya decidido.
 *
 * ## Por qué se ejerce `pedir` y no se arma el `Resultado` a mano
 *
 * Es la misma medición que `test/generar-ui.spec.ts` dejó escrita: el mapeo
 * de un código de estado a `Resultado` vive adentro de `problemaDe`, que es
 * privada, así que una prueba que construye el `Resultado` a mano sobrevive
 * a que la rama desaparezca. Acá se contesta con un `fetch` de mentira y se
 * mira qué sale del otro lado, que es lo que el armazón va a leer.
 *
 * El dibujo —que el nombre se vea en el encabezado de toda pantalla, que
 * «Salir» siga ofrecido sin identidad— no se prueba acá sino en
 * `e2e/identidad.spec.ts`: afirmar sobre el estado en vez de sobre lo
 * dibujado sería afirmar sobre la mitad que no falla.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import type { IdentidadActual } from "../worker/contract";
import { cargarIdentidad } from "../src/api/identidad";

const IDENTIDAD: IdentidadActual = {
  usuarioId: "6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44",
  email: "itzel@bufete.test",
  nombre: "Itzel Rodríguez",
};

/**
 * Un `fetch` que contesta lo que la prueba quiera, **sin salir a ninguna
 * parte**, y que **respeta la senal** como la respeta el de verdad.
 *
 * Lo segundo no es adorno: el armazón aborta la petición al desmontarse, y
 * lo que no puede pasar es que ese aborto salga como una promesa rechazada.
 * `pedir` envuelve el `fetch` en un `try`/`catch` justamente para eso, y sin
 * una senal honrada acá esa red no se ejerce.
 */
function contestando(cuerpo: unknown, status = 200): void {
  vi.stubGlobal("fetch", (_ruta: string, init?: RequestInit) => {
    const senal = init?.signal;
    if (senal?.aborted === true) {
      return Promise.reject(
        senal.reason instanceof Error
          ? senal.reason
          : new Error("the operation was aborted"),
      );
    }

    return Promise.resolve(Response.json(cuerpo, { status }));
  });
}

describe("cargarIdentidad", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("devuelve quién entró cuando la puerta lo reconoce", async () => {
    contestando(IDENTIDAD);

    const resultado = await cargarIdentidad(new AbortController().signal);

    expect(resultado).toEqual({ estado: "ok", valor: IDENTIDAD });
  });

  it("el cuerpo del 200 **es** la identidad y no un sobre con una lista", async () => {
    /*
     * La diferencia con `cargarUsuarios`, que es el molde de este archivo:
     * `/api/usuarios` contesta `{ usuarios: [...] }` y el cliente desenvuelve
     * el sobre. `/api/yo` contesta la identidad pelada (`worker/index.ts`,
     * ruta `/api/yo`), así que acá no hay nada que desenvolver. Una copia del
     * molde que buscara `.identidad` dentro del cuerpo devolvería `undefined`
     * detrás de un tipo que promete tres campos, y el encabezado diría
     * «entró undefined» sin que nada fallara.
     */
    contestando(IDENTIDAD);

    const resultado = await cargarIdentidad(new AbortController().signal);

    expect(
      resultado.estado === "ok" ? resultado.valor.nombre : null,
      "el cliente buscó un sobre donde el Worker manda la identidad pelada",
    ).toBe("Itzel Rodríguez");
  });

  it("pide `/api/yo` y le pasa la senal", async () => {
    /*
     * Las dos mitades de una sola cosa, y las dos se rompen en silencio: una
     * ruta equivocada devuelve el 404 de la SPA —que es un HTML, o sea un
     * `falla` raro— y una senal que no viaja deja la petición corriendo
     * después de desmontar el armazón. Ninguna de las dos se ve mirando la
     * pantalla.
     */
    const espia = vi.fn(() => Promise.resolve(Response.json(IDENTIDAD)));
    vi.stubGlobal("fetch", espia);

    const control = new AbortController();
    await cargarIdentidad(control.signal);

    expect(espia).toHaveBeenCalledWith("/api/yo", { signal: control.signal });
  });

  it("un 403 llega como `sin_acceso` **con el motivo de la puerta**", async () => {
    // El caso que `wrangler.jsonc` hace probable hoy: `ACCESO_TEAM_DOMAIN` y
    // `ACCESO_AUD` siguen con los valores de ejemplo, así que la puerta falla
    // cerrada antes de mirar el token. Eso tiene que verse, y para verse
    // tiene que llegar.
    contestando({ error: "acceso_denegado", motivo: "acceso_no_configurado" }, 403);

    const resultado = await cargarIdentidad(new AbortController().signal);

    expect(resultado).toEqual({
      estado: "sin_acceso",
      motivo: "acceso_no_configurado",
    });
  });

  it("el correo aprobado por Access sin fila en `usuario` también es `sin_acceso`", async () => {
    // `resolverUsuario` rechaza con `usuario_desconocido`: Access aprobó a
    // alguien que no es del bufete. Es un 403 igual, y el motivo es lo único
    // que distingue «la puerta está mal configurada» de «esa persona no está
    // dada de alta».
    contestando({ error: "acceso_denegado", motivo: "usuario_desconocido" }, 403);

    const resultado = await cargarIdentidad(new AbortController().signal);

    expect(resultado).toEqual({
      estado: "sin_acceso",
      motivo: "usuario_desconocido",
    });
  });

  it("un 503 es el mismo `sin_acceso` que el 403", async () => {
    // `pedir` junta los dos a propósito: la pantalla no puede hacer nada
    // distinto con uno y con otro. Un `fetch` a mano los trataba distinto sin
    // que nadie lo hubiera decidido.
    contestando({ error: "acceso_denegado", motivo: "clave_no_disponible" }, 503);

    const resultado = await cargarIdentidad(new AbortController().signal);

    expect(resultado).toEqual({
      estado: "sin_acceso",
      motivo: "clave_no_disponible",
    });
  });

  it("un 403 sin cuerpo no inventa un motivo", async () => {
    vi.stubGlobal(
      "fetch",
      () => Promise.resolve(new Response("", { status: 403 })),
    );

    const resultado = await cargarIdentidad(new AbortController().signal);

    expect(resultado).toEqual({ estado: "sin_acceso", motivo: "desconocido" });
  });

  it("una senal ya abortada vuelve como `falla` y no como promesa rechazada", async () => {
    /*
     * El desmontaje del armazón. Lo que importa no es el texto del mensaje
     * —lo pone el runtime— sino que la cancelación **vuelva** en vez de
     * tirar: una promesa rechazada acá sería un error no atrapado en el
     * `useEffect` del encabezado cada vez que alguien cambia de pantalla
     * antes de que la identidad llegue.
     */
    contestando(IDENTIDAD);

    const control = new AbortController();
    control.abort();

    const resultado = await cargarIdentidad(control.signal);

    expect(
      resultado.estado,
      "el aborto escapó del cliente: lo que llega al armazón es un rechazo" +
        " y no un `Resultado`",
    ).toBe("falla");
  });
});
