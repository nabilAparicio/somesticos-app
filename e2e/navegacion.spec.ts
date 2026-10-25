/**
 * El invariante que la tajada 2 descubrió por la peor vía: **toda pantalla
 * con ruta propia tiene que ser alcanzable desde el menú**.
 *
 * Las cuatro pantallas de cotización se escribieron, se probaron y pasaron
 * las 182 pruebas de punta a punta sin que `SECCIONES` las nombrara. No las
 * atrapó nadie porque el `not_found_handling: "single-page-application"` de
 * `wrangler.jsonc` hace que una URL escrita a mano llegue igual: la prueba
 * navega con `page.goto`, que es justamente lo único que la persona **no**
 * puede hacer si no sabe que la pantalla existe. Se midió: borrar la entrada
 * del menú no mataba ninguna de 1069 unitarias ni de 182 de punta a punta.
 *
 * ## Por qué vive acá y no en `test/`
 *
 * Porque esta prueba necesita las dos mitades a la vez, y una de ellas es un
 * `.tsx`. `test/tsconfig.json` es `lib: ["ES2022"]` sin DOM y sin `jsx` **a
 * propósito** —es la barrera que mantiene puros a los módulos de lógica de
 * pantalla— así que desde ahí no se puede importar `Esqueleto.tsx`, y
 * relajarlo costaría esa barrera para todo el proyecto a cambio de una
 * prueba. `tsconfig.app.json`, en cambio, incluye `src` y `e2e` juntos.
 *
 * Y el cambio de corredor es una mejora, no un consuelo: acá el menú se lee
 * **como se dibuja** y no como está escrito. Lo que se rompió fue la
 * navegación renderizada; afirmar sobre la constante habría sido afirmar
 * sobre la mitad que no falló.
 *
 * ## Por qué las exentas van nombradas una por una
 *
 * Un predicado que filtrara «las que no son pantalla» dejaría que la próxima
 * variante de `Ruta` se cuele sola, y entonces la prueba general deja de ser
 * general sin que nadie se entere. Con el `Record` exhaustivo de más abajo,
 * **agregar una variante a `Ruta` rompe la compilación** hasta que alguien
 * decida a mano bajo qué sección vive o por qué no vive bajo ninguna. Y la
 * exención lleva su motivo escrito: una lista de nombres sin razones es una
 * lista a la que se le agrega el siguiente sin pensarlo.
 */
import { expect, test, type Page } from "@playwright/test";

import { enlaceDe, resolverRuta, type Ruta } from "../src/ruteo";

/**
 * Dónde vive cada pantalla, o por qué no vive en el menú.
 *
 * `bajo` es la **raíz de sección** que el menú tiene que ofrecer, y se
 * comprueba además contra la que sale de `enlaceDe`: declarar una sección
 * equivocada tiene que fallar igual que no declarar ninguna.
 */
type Destino =
  | { readonly ruta: Ruta; readonly bajo: string }
  | { readonly ruta: Ruta; readonly exenta: string };

const PANTALLAS: Record<Ruta["nombre"], Destino> = {
  inicio: { ruta: { nombre: "inicio" }, bajo: "/" },

  "banco-de-pruebas": {
    ruta: { nombre: "banco-de-pruebas" },
    exenta:
      "No es una pantalla del producto sino la ruta de diagnóstico del" +
      " layout. Vive en el bloque «Diagnóstico» del armazón, aparte y" +
      " rotulada como tal, justamente para que nadie la confunda con una" +
      " sección: meterla en la lista de secciones sería deshacer esa" +
      " decisión de T-4.",
  },

  clientes: { ruta: { nombre: "clientes" }, bajo: "/clientes" },
  "cliente-nuevo": { ruta: { nombre: "cliente-nuevo" }, bajo: "/clientes" },
  cliente: { ruta: { nombre: "cliente", id: "x" }, bajo: "/clientes" },
  "cliente-edicion": {
    ruta: { nombre: "cliente-edicion", id: "x" },
    bajo: "/clientes",
  },

  catalogos: { ruta: { nombre: "catalogos" }, bajo: "/catalogos" },
  "tipos-proceso": { ruta: { nombre: "tipos-proceso" }, bajo: "/catalogos" },
  "tipo-proceso-nuevo": {
    ruta: { nombre: "tipo-proceso-nuevo" },
    bajo: "/catalogos",
  },
  "tipo-proceso": {
    ruta: { nombre: "tipo-proceso", id: "x" },
    bajo: "/catalogos",
  },

  procesos: { ruta: { nombre: "procesos" }, bajo: "/procesos" },
  /*
   * La única ruta con dos raíces posibles: con `clienteId` nulo es
   * `/procesos/nuevo`, y con cliente ya elegido es
   * `/clientes/{id}/procesos/nuevo`. Se toma la primera, y la segunda queda
   * cubierta igual porque `/clientes` también está en el menú. Si algún día
   * una de las dos formas dejara de tener sección, esta muestra habría que
   * partirla en dos.
   */
  "proceso-nuevo": {
    ruta: { nombre: "proceso-nuevo", clienteId: null },
    bajo: "/procesos",
  },
  proceso: { ruta: { nombre: "proceso", id: "x" }, bajo: "/procesos" },

  cotizaciones: { ruta: { nombre: "cotizaciones" }, bajo: "/cotizaciones" },
  "cotizacion-nueva": {
    ruta: { nombre: "cotizacion-nueva" },
    bajo: "/cotizaciones",
  },
  cotizacion: {
    ruta: { nombre: "cotizacion", id: "x" },
    bajo: "/cotizaciones",
  },
  "cotizacion-edicion": {
    ruta: { nombre: "cotizacion-edicion", id: "x" },
    bajo: "/cotizaciones",
  },
  /*
   * La hoja imprimible (T-6). **No está exenta**, y vale la pena decir por
   * qué no lo está: es una pantalla sin menú, sin controles y pensada para
   * salir por la impresora, así que parece candidata. No lo es, porque este
   * invariante compara la **raíz de sección** y no la dirección entera: la
   * hoja vive bajo `/cotizaciones`, que el menú ya ofrece, y se llega a ella
   * desde el detalle de la cotización. Una exención acá habría sido declarar
   * inalcanzable algo que sí se alcanza.
   */
  "cotizacion-hoja": {
    ruta: { nombre: "cotizacion-hoja", id: "x" },
    bajo: "/cotizaciones",
  },

  desconocida: {
    ruta: { nombre: "desconocida", ruta: "/lo-que-sea" },
    exenta:
      "No es una pantalla: es el 404 de la SPA, y `enlaceDe` le devuelve la" +
      " misma ruta que no se pudo resolver. No tiene raíz propia que ofrecer" +
      " y ofrecerla sería un ítem de menú hacia «esa página no existe».",
  },
};

/**
 * La raíz de sección de una ruta: `/` más su primer segmento.
 *
 * Se compara **exacta** y no con `startsWith`, porque `/` es prefijo de
 * todo: con un prefijo, cualquier ruta quedaría «cubierta» por la entrada de
 * Inicio y la prueba no afirmaría nada.
 */
function raizDe(ruta: Ruta): string {
  const primero = enlaceDe(ruta).split("/")[1] ?? "";
  return primero === "" ? "/" : `/${primero}`;
}

/**
 * Los `href` del menú, leídos del DOM.
 *
 * Se acota a `.navegacion__lista` a propósito: el bloque de diagnóstico usa
 * la misma clase `.navegacion__item` y no es una sección. Y se piden solo
 * los `<a>` porque las entradas sin pantalla propia se dibujan como `<span>`
 * sin `href`, que es exactamente la distinción que esta prueba mide.
 *
 * **La espera no es higiene: sin ella esta prueba miente.** `evaluateAll` no
 * reintenta — devuelve las anclas que existan en ese instante—, y el armazón
 * lo monta React después del `goto`. Sin esperar, un montaje lento da un
 * arreglo vacío y las tres pruebas fallan diciendo «la prueba está rota»
 * con el menú perfecto. O sea: el control de hostilidad que existe para
 * separar «falta un `href`» de «el selector no encuentra nada» se
 * convertiría en el que confunde, porque habría una tercera causa que no es
 * ninguna de las dos. Se espera a que exista la primera ancla y recién ahí
 * se lee.
 */
async function menuDibujado(page: Page): Promise<string[]> {
  const anclas = page.locator(".navegacion__lista a.navegacion__item");

  await expect(
    anclas.first(),
    "el menú no llegó a dibujarse: `.navegacion__lista a.navegacion__item`" +
      " no apareció nunca",
  ).toBeAttached();

  return anclas.evaluateAll((nodos) =>
    nodos.map((nodo) => (nodo as HTMLAnchorElement).getAttribute("href") ?? ""),
  );
}

test.describe("la navegación del armazón", () => {
  /**
   * El control de hostilidad, y no es ceremonia.
   *
   * «Falta un `href` en el menú» y «el selector no encontró el menú» se
   * parecen en la salida y significan lo contrario: la primera es el defecto
   * que esta prueba busca, la segunda es la prueba rota afirmando nada. Esta
   * comprobación va primero para que la segunda falle con su propio mensaje
   * y nunca se lea como la primera.
   */
  test("el menú se dibuja y tiene enlaces", async ({ page }) => {
    await page.goto("/");

    const href = await menuDibujado(page);

    expect(
      href.length,
      "el selector `.navegacion__lista a.navegacion__item` no encontró el" +
        " menú: esto es la prueba rota, no una sección que falta",
    ).toBeGreaterThanOrEqual(4);

    // Dos secciones de la tajada 1, que existen desde antes de esta prueba.
    expect(href).toContain("/clientes");
    expect(href).toContain("/procesos");
  });

  test("toda pantalla con ruta propia es alcanzable desde el menú", async ({
    page,
  }) => {
    await page.goto("/");
    const href = await menuDibujado(page);

    // Sin esto, un menú vacío haría pasar el bucle entero en silencio: no
    // habría ninguna sección que reclamar porque no habría ninguna que
    // comparar.
    expect(href.length).toBeGreaterThanOrEqual(4);

    for (const [nombre, destino] of Object.entries(PANTALLAS)) {
      if ("exenta" in destino) {
        expect(
          destino.exenta.length,
          `«${nombre}» está exenta y tiene que decir por qué`,
        ).toBeGreaterThan(0);
        continue;
      }

      // Que la sección declarada sea la real. Declarar una equivocada tiene
      // que fallar igual que no declarar ninguna.
      expect(
        raizDe(destino.ruta),
        `«${nombre}» dice vivir bajo ${destino.bajo} y su enlace no empieza ahí`,
      ).toBe(destino.bajo);

      expect(
        href,
        `«${nombre}» tiene ruta propia y el menú no ofrece ${destino.bajo}:` +
          " solo se llega escribiendo la URL, y eso no es estar entregada",
      ).toContain(destino.bajo);
    }
  });

  test("ningún enlace del menú apunta a una ruta que no existe", async ({
    page,
  }) => {
    // La vuelta del invariante. Un `href` mal escrito dibuja un ítem que se
    // ve igual de bien y lleva a «esa página no existe»; el resolvedor es
    // quien sabe, así que se le pregunta a él.
    await page.goto("/");
    const href = await menuDibujado(page);

    expect(href.length).toBeGreaterThanOrEqual(4);

    for (const destino of href) {
      expect(
        resolverRuta(destino).nombre,
        `el menú ofrece ${destino} y no resuelve a ninguna pantalla`,
      ).not.toBe("desconocida");
    }
  });
});
