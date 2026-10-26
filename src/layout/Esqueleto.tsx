/**
 * Esqueleto — el armazón de la página.
 *
 * Es el único layout bidimensional del sistema, así que es el único que usa
 * grid (§9: «Grid para el esqueleto de la pantalla, que es bidimensional.
 * Flexbox para acomodar el contenido dentro de una franja»). Tres regiones:
 * encabezado, navegación y contenido.
 *
 * En angosto la navegación es un cajón que se abre encima del contenido; en
 * ancho es una columna lateral abierta por defecto. Ese cambio lo decide una
 * **consulta de contenedor** sobre el hueco real del armazón, no una `@media`
 * del viewport: el día que esto se embeba en algo más angosto que la ventana,
 * se acomoda igual.
 *
 * Desde T-1 el armazón **mide la ventana** (`100svh`) y la única región que
 * scrollea es el contenido. Eso no se ve acá porque no hay nada que mirar:
 * está entero en `src/estilos/layout.css` y no hay una sola altura calculada
 * en este archivo. Lo que sí vive acá es lo que no se puede expresar en CSS:
 * el estado del cajón, el modo en el que está, y el `inert` que convierte el
 * velo en un overlay de verdad.
 *
 * Desde T-3 vive acá además **quién entró y cómo salir**. Está en el armazón
 * y no en una pantalla porque es de la aplicación y no de ninguna de ellas:
 * hasta T-3 la identidad se dibujaba sólo en la portada, como una línea de
 * diagnóstico que se perdía en cuanto alguien navegaba a cualquier otro
 * lado, y de salir no había nada.
 */
import { useEffect, useState, type MouseEvent, type ReactNode } from "react";

import type { IdentidadActual } from "../../worker/contract";
import { cargarIdentidad } from "../api/identidad";
import type { Resultado } from "../api/peticiones";
import { Enlace } from "./Enlace";

type Props = {
  readonly children: ReactNode;
  /** Ruta vigente, para marcar el ítem activo de la navegación. */
  readonly ruta: string;
};

type ItemDeNavegacion = {
  readonly rotulo: string;
  readonly href?: string;
  /**
   * Para una sección sin pantalla propia: dónde se ve hoy eso que la entrada
   * nombra. Solo tiene sentido junto a la marca de «pendiente».
   */
  readonly dondeEstaHoy?: string;
};

/**
 * Las secciones de la aplicación. Las que todavía no existen se muestran
 * apagadas en vez de omitirse: el armazón tiene que verse con la cantidad de
 * ítems que va a tener de verdad, no con uno solo.
 *
 * **Toda pantalla con ruta propia tiene que estar acá.** Es la lección de la
 * tajada 2: las cuatro pantallas de cotización se escribieron, se probaron y
 * pasaron el punta a punta sin que esta lista las nombrara, porque el
 * `not_found_handling` de la SPA hace que una URL escrita a mano llegue
 * igual. Una pantalla a la que solo se llega escribiendo la URL no está
 * entregada, y ninguna prueba lo atrapó.
 *
 * **Por qué «Pendientes» y «Bitácora» siguen acá, apagadas.** Las dos cosas
 * existen desde T-9 y T-15; lo que no existe es una pantalla *global* que
 * las junte, y la marca de «pendiente» dice exactamente eso. Sacarlas sería
 * peor por dos razones: el armazón volvería a medirse con cuatro ítems y
 * crecería después sin que nadie lo hubiera visto —la vacuidad que T-4
 * encontró en su propia rejilla—, y una navegación sin «Pendientes» le dice
 * al que la lee que el bufete no lleva pendientes, que es falso.
 *
 * Lo que sí se les agregó en T-18 es **dónde están hoy**. Una entrada
 * apagada y muda promete una pantalla y no dice nada más; con el destino
 * escrito al lado, quien la lee sabe adónde ir ahora mismo en vez de quedar
 * esperando.
 */
const SECCIONES: readonly ItemDeNavegacion[] = [
  { rotulo: "Inicio", href: "/" },
  { rotulo: "Clientes", href: "/clientes" },
  { rotulo: "Catálogos", href: "/catalogos" },
  { rotulo: "Procesos", href: "/procesos" },
  /*
   * Cotizaciones entra acá, y la posición no es decorativa: va **con las que
   * tienen `href`**, porque tiene pantalla propia desde la tajada 2, y va
   * **última de ésas**, porque las dos entradas de abajo son las mudas y la
   * lista está partida en esas dos clases. Meterla entre las apagadas la
   * haría ver como una sección que todavía no existe; meterla antes de
   * «Procesos» rompería el orden en que se trabaja: primero el cliente,
   * después el trámite, y la cotización cuelga de los dos.
   */
  { rotulo: "Cotizaciones", href: "/cotizaciones" },
  { rotulo: "Pendientes", dondeEstaHoy: "Hoy, dentro de cada proceso." },
  { rotulo: "Bitácora", dondeEstaHoy: "Hoy, en la ficha de cada registro." },
] as const;

/**
 * Una sección queda marcada también en sus rutas hijas: estando en el detalle
 * de un cliente, «Clientes» sigue siendo donde uno está. `/` es la excepción,
 * porque es prefijo de todo.
 */
function esSeccionActiva(ruta: string, href: string): boolean {
  if (href === "/") return ruta === "/";
  return ruta === href || ruta.startsWith(`${href}/`);
}

/**
 * El identificador del `<nav>`, escrito una vez porque lo usan dos lugares:
 * el elemento y el `aria-controls` del botón. Dos literales iguales en dos
 * atributos distintos son dos literales que se desincronizan.
 */
const ID_NAVEGACION = "navegacion-de-secciones";

/**
 * El umbral del armazón, leído con `matchMedia`.
 *
 * **Es el único lugar de todo el sistema donde el viewport decide algo**, y
 * no es una concesión sino una imposibilidad: JavaScript no puede consultar
 * una `@container`. Y acá hace falta saberlo, porque el comportamiento modal
 * del cajón —el valor inicial del estado, `Escape`, `inert`— depende del modo
 * y no hay forma de expresarlo en CSS.
 *
 * El número está duplicado a propósito y con la duplicación a la vista: la
 * fuente es `--umbral-lateral: 48rem` en `src/estilos/tokens.css`, y de ahí
 * salen las dos consultas `@container armazon (min-width: 48rem)` de
 * `src/estilos/layout.css`. No se puede leer el token desde acá sin pedirle
 * el estilo calculado al documento en cada render, que es peor que una copia
 * declarada. Si el umbral cambia, cambia en los dos lados.
 *
 * Que las dos consultas coincidan depende de que el contenedor de consulta
 * sea `#root`, que mide la ventana entera. **Toda la adaptación visual se
 * queda en `@container armazon`** justamente por eso: el día que el armazón
 * se embeba en un hueco más angosto que la ventana, esta consulta y las del
 * CSS dejarían de decir lo mismo, y lo que se desacomodaría sería solo el
 * modo —no el dibujo.
 */
const CONSULTA_DEL_UMBRAL = "(min-width: 48rem)";

function estaEnModoAncho(): boolean {
  return window.matchMedia(CONSULTA_DEL_UMBRAL).matches;
}

/**
 * La salida. **Es un enlace y no va a ser un `fetch`.**
 *
 * Alguien va a querer «arreglar» esto convirtiéndolo en un botón con un
 * `fetch` y un `setState`, así que queda escrito por qué no: la
 * autenticación es Cloudflare Access (`docs/diseno.md` §7 y §9) y **no hay
 * sesión nuestra que cerrar**. Lo que hay que borrar es la cookie
 * `CF_Authorization`, que la pone y la saca el borde de Cloudflare; el
 * Worker no la ve nacer ni la puede matar, y por eso no hay —ni va a haber—
 * una ruta de salida en `worker/index.ts`. Un `fetch` a esta dirección
 * tampoco serviría: lo que Access contesta es una redirección a su propia
 * pantalla de salida, y una redirección dentro de un `fetch` no saca a nadie
 * de ninguna parte. Tiene que **navegar**.
 *
 * Verificado en la documentación de Cloudflare (Access · Session
 * Management): sirven las dos direcciones, la del dominio del team y la de
 * la aplicación. Se usa **la de la aplicación**, o sea esta ruta relativa, y
 * la diferencia es observable: es la que borra la cookie del dominio propio,
 * así que la salida se siente inmediata en vez de dejar al navegador con una
 * cookie nuestra todavía puesta mientras el team resuelve lo suyo.
 *
 * Relativa también significa que no hay ningún nombre de team escrito en el
 * código del navegador, que es un valor de despliegue y no de la aplicación.
 */
const SALIDA_DE_ACCESS = "/cdn-cgi/access/logout";

/**
 * Lo que el armazón sabe de quién entró, en los tres estados que de verdad
 * existen.
 *
 * `sin_reconocer` es uno y no cuatro a propósito: la puerta puede negarse de
 * varias formas —mal configurada, sin token, un correo sin fila en
 * `usuario`— y para el armazón son la misma situación (no hay nombre que
 * mostrar y hay que ofrecer salir). Lo que **sí** se conserva es el motivo,
 * en `detalle`, porque es lo único que distingue «hay que arreglar el
 * despliegue» de «hay que dar de alta a esa persona».
 */
type Quien =
  | { readonly estado: "cargando" }
  | { readonly estado: "dentro"; readonly identidad: IdentidadActual }
  | { readonly estado: "sin_reconocer"; readonly detalle: string };

/**
 * El motivo del rechazo, en una palabra que quepa en la franja.
 *
 * No se usa `textoDeProblema` —que es la frase buena para una pantalla—
 * porque acá no hay lugar para una frase: el encabezado es una franja de una
 * línea y una oración de dos renglones la haría crecer sobre el contenido.
 * Lo que se muestra es el término técnico que manda la puerta, que es
 * justamente lo que quien configuró el despliegue necesita leer.
 */
function detalleDelRechazo(
  resultado: Exclude<Resultado<IdentidadActual>, { estado: "ok" }>,
): string {
  if (resultado.estado === "sin_acceso") return resultado.motivo;
  if (resultado.estado === "falla") return resultado.mensaje;
  // Ninguno de los demás tiene sentido en `/api/yo` —no hay 404, ni 409, ni
  // 422 en una ruta que no recibe nada—, pero un servidor más nuevo que esta
  // pantalla podría traer cualquiera. Se dice el estado y no se inventa una
  // explicación.
  return resultado.estado;
}

/**
 * Quién entró, dibujado.
 *
 * Los tres estados dibujan **algo**, y eso es el requisito y no una
 * casualidad:
 *
 *  - **cargando** no deja un hueco. Un rótulo apagado ocupa el lugar que el
 *    nombre va a ocupar, así que el encabezado no cambia de alto cuando la
 *    respuesta llega y el contenido de abajo no salta. La alternativa
 *    —renderizar nada hasta saber— es un parpadeo en cada carga de página, y
 *    en una franja que envuelve es además un renglón que aparece y empuja
 *    todo.
 *  - **sin reconocer** lo dice con el motivo a la vista. Quedarse en blanco
 *    sería esconder un despliegue a medias, y hoy es el estado probable:
 *    `wrangler.jsonc` sigue con los valores de ejemplo en
 *    `ACCESO_TEAM_DOMAIN` y `ACCESO_AUD`, así que la puerta falla cerrada
 *    con `acceso_no_configurado`.
 *  - **dentro** muestra el nombre, y el correo **dos veces**: en el `title`
 *    para quien pasa el mouse, y en un `<span>` recortado para quien no
 *    tiene mouse. Un `title` solo no alcanza: no hay mouse en un teléfono ni
 *    navegando con teclado, y los lectores de pantalla no lo anuncian de
 *    forma confiable. El nombre es lo que se lee de un vistazo y el correo
 *    es lo que desempata dos personas con el mismo nombre, así que el correo
 *    tiene que estar al alcance de todos y no sólo del que apunta.
 *
 * `.oculto-visualmente` es la utilidad global de `src/estilos/formulario.css`
 * y se reusa en vez de copiarse: dos definiciones de «recortado pero leíble»
 * son dos lugares donde la próxima persona arregla una sola.
 */
function QuienEntro({ quien }: { readonly quien: Quien }) {
  if (quien.estado === "cargando") {
    return (
      <span className="esqueleto__quien esqueleto__quien--cargando">
        Identificando…
      </span>
    );
  }

  if (quien.estado === "sin_reconocer") {
    return (
      <span className="esqueleto__quien esqueleto__quien--sin-reconocer">
        Sin identidad reconocida ({quien.detalle})
      </span>
    );
  }

  return (
    <span className="esqueleto__quien" title={quien.identidad.email}>
      {quien.identidad.nombre}
      <span className="oculto-visualmente">{` (${quien.identidad.email})`}</span>
    </span>
  );
}

export function Esqueleto({ children, ruta }: Props) {
  /*
   * Dos estados, y el segundo no es estado del lateral: es el entorno.
   *
   * `navegacionVisible` es el único booleano que describe la navegación —«¿se
   * está mostrando?»— y se lee igual en los dos modos. `modoAncho` es de qué
   * lado del umbral está la ventana, y existe porque el valor inicial, el
   * `Escape` y el `inert` lo necesitan. Guardarlo en vez de consultarlo en
   * cada render es lo que permite que un cambio de modo vuelva a renderizar.
   */
  const [modoAncho, setModoAncho] = useState(estaEnModoAncho);
  /* El valor inicial es el del modo: abierto en ancho, cerrado en angosto. */
  const [navegacionVisible, setNavegacionVisible] = useState(estaEnModoAncho);

  /*
   * Quién entró. Se pide **una vez**, al montar el armazón, y no en cada
   * pantalla: el armazón no se desmonta al navegar —`App.tsx` cambia lo que
   * va adentro de `children`— así que una sola petición cubre la sesión
   * entera. Pedirla por pantalla serían tantas lecturas de `/api/yo` como
   * clics, para una respuesta que no cambia.
   */
  const [quien, setQuien] = useState<Quien>({ estado: "cargando" });

  useEffect(() => {
    const control = new AbortController();

    async function cargar() {
      const resultado = await cargarIdentidad(control.signal);
      /*
       * El aborto del desmontaje. `cargarIdentidad` lo devuelve como `falla`
       * en vez de tirar, así que sin esta guarda el armazón desmontado
       * terminaría pintando «sin identidad reconocida» en un componente que
       * ya no está. Es la misma guarda que los formularios de procesos y
       * cotizaciones ponen después de cada `Promise.all`.
       */
      if (control.signal.aborted) return;

      setQuien(
        resultado.estado === "ok"
          ? { estado: "dentro", identidad: resultado.valor }
          : { estado: "sin_reconocer", detalle: detalleDelRechazo(resultado) },
      );
    }

    void cargar();

    return () => {
      control.abort();
    };
  }, []);

  useEffect(() => {
    const consulta = window.matchMedia(CONSULTA_DEL_UMBRAL);

    function alCruzarElUmbral(evento: MediaQueryListEvent) {
      setModoAncho(evento.matches);
      /*
       * Y se vuelve al valor por defecto del modo nuevo. Arrastrar el estado
       * del modo anterior deja las dos formas malas: un cajón que alguien
       * abrió, al ensancharse, se convierte en una columna que nadie pidió; y
       * una columna que alguien colapsó, al angostarse, deja la aplicación sin
       * menú visible y sin ninguna señal de por qué.
       */
      setNavegacionVisible(evento.matches);
    }

    consulta.addEventListener("change", alCruzarElUmbral);
    return () => {
      consulta.removeEventListener("change", alCruzarElUmbral);
    };
  }, []);

  /*
   * El cajón es cajón solo en angosto. En ancho el lateral es una columna
   * que no tapa nada, así que no hay nada modal: ni `Escape` que cierre, ni
   * contenido que dejar inerte.
   */
  const cajonAbierto = !modoAncho && navegacionVisible;

  useEffect(() => {
    if (!cajonAbierto) return;

    function alTeclear(evento: KeyboardEvent) {
      if (evento.key === "Escape") setNavegacionVisible(false);
    }

    window.addEventListener("keydown", alTeclear);
    return () => {
      window.removeEventListener("keydown", alTeclear);
    };
  }, [cajonAbierto]);

  function alternarNavegacion() {
    setNavegacionVisible((visible) => !visible);
  }

  function alElegirSeccion(evento: MouseEvent<HTMLElement>) {
    /*
     * En modo cajón, elegir una sección es navegar, y el cajón se cierra.
     * Dejarlo abierto encima de la pantalla nueva —y con el contenido
     * `inert` detrás— sería entregar la navegación a medias: la persona
     * llegó a donde quería y tiene que cerrar algo para verlo.
     *
     * Se comprueba que el clic haya caído en un enlace: las secciones sin
     * pantalla propia se dibujan como `<span>` y no llevan a ninguna parte,
     * así que cerrar el cajón al tocarlas sería castigar una exploración.
     */
    if (!cajonAbierto) return;
    if (!(evento.target instanceof Element)) return;
    if (evento.target.closest("a") === null) return;
    setNavegacionVisible(false);
  }

  return (
    <div
      className={`esqueleto${navegacionVisible ? "" : " esqueleto--sin-navegacion"}`}
    >
      <header className="esqueleto__encabezado">
        {/*
          El encabezado **no** recibe `inert` con el cajón abierto, y el velo
          tampoco lo tapa. Es deliberado y es el precio de que el botón sea
          una de las tres formas de cerrar el cajón: un encabezado inerte es
          un botón que no puede cerrar lo que abrió. La barra de arriba es lo
          único del armazón que nunca se mueve ni se apaga.
        */}
        <button
          type="button"
          className="esqueleto__alternar"
          aria-expanded={navegacionVisible}
          aria-controls={ID_NAVEGACION}
          onClick={alternarNavegacion}
        >
          <span className="esqueleto__alternar-glifo" aria-hidden="true">
            ☰
          </span>
          Secciones
        </button>
        <div className="marca">
          <span className="marca__sello" aria-hidden="true">
            ⚖
          </span>
          <span className="marca__nombre">Bufete</span>
        </div>
        <p className="esqueleto__lema">Seguimiento de procesos</p>

        {/*
          Quién entró y cómo salir, **al final de la franja** y siempre los
          dos juntos.

          Van juntos en un grupo propio porque son una sola cosa para quien
          mira —de quién es esta sesión y cómo se termina— y porque así la
          franja los acomoda o los envuelve como un bloque en vez de dejar el
          nombre arriba y la salida abajo.

          «Salir» se dibuja en los tres estados, incluido el de no reconocido,
          y eso no es simetría: **es el estado en el que más falta hace**. Una
          sesión que la puerta no reconoce es exactamente la que alguien
          necesita poder cerrar para volver a entrar como quien corresponde;
          esconder la salida ahí sería dejar a la persona sin la única palanca
          que le queda dentro de la aplicación.

          Y queda alcanzable con el cajón de navegación abierto, que es
          deliberado: el encabezado está fuera del velo por construcción
          —el cajón y el velo se posicionan contra el área de contenido de la
          rejilla— y no recibe `inert`. Es la decisión que T-2 tomó para que
          el botón pudiera cerrar lo que abrió, y «Salir» se beneficia de
          ella. Nada de esto se arregla agregándole `inert` al encabezado.
        */}
        <div className="esqueleto__identidad">
          <QuienEntro quien={quien} />
          {/*
            Un `<a>` pelado y sin la clase `.boton`. Lo segundo cuesta las
            declaraciones de `.esqueleto__salir` en `layout.css` y vale lo
            mismo que costaba en el botón de secciones: varias pruebas de
            punta a punta de cotizaciones miden la barra de acciones de una
            pantalla contando `header button.boton` y leyendo
            `header .boton`. La salida no es una acción de ninguna pantalla.
          */}
          <a className="esqueleto__salir" href={SALIDA_DE_ACCESS}>
            Salir
          </a>
        </div>
      </header>

      {/*
        El velo. Es un botón de verdad —no un `div` con `onClick`— para que
        «cerrar tocando afuera» exista también para el teclado y se anuncie
        con nombre. En ancho lo oculta la consulta de contenedor de
        `layout.css`, así que ahí no hay clic que interceptar.
      */}
      <button
        type="button"
        className="esqueleto__velo"
        aria-label="Cerrar las secciones"
        onClick={() => {
          setNavegacionVisible(false);
        }}
      />

      <nav
        id={ID_NAVEGACION}
        className="esqueleto__navegacion"
        aria-label="Secciones"
        onClick={alElegirSeccion}
      >
        <ul className="navegacion__lista">
          {SECCIONES.map((seccion) => (
            <li key={seccion.rotulo}>
              {seccion.href === undefined ? (
                <span className="navegacion__item navegacion__item--pendiente">
                  <span className="navegacion__rotulo">
                    {seccion.rotulo}
                    <span className="etiqueta etiqueta--tenue">pendiente</span>
                  </span>
                  {seccion.dondeEstaHoy !== undefined && (
                    <span className="navegacion__donde">
                      {seccion.dondeEstaHoy}
                    </span>
                  )}
                </span>
              ) : (
                <Enlace
                  className="navegacion__item"
                  href={seccion.href}
                  ariaCurrent={
                    esSeccionActiva(ruta, seccion.href) ? "page" : undefined
                  }
                >
                  {seccion.rotulo}
                </Enlace>
              )}
            </li>
          ))}
        </ul>

        {/*
          El banco de pruebas no es una sección del producto: es la ruta de
          diagnóstico del layout. Va acá y rotulada como tal para poder
          abrirla a mano, no para que nadie la confunda con una pantalla.
        */}
        <div className="navegacion__diagnostico">
          <p className="navegacion__titulo">Diagnóstico</p>
          <Enlace
            className="navegacion__item"
            href="/banco-de-pruebas"
            ariaCurrent={ruta === "/banco-de-pruebas" ? "page" : undefined}
          >
            Banco de pruebas del layout
          </Enlace>
        </div>
      </nav>

      {/*
        `inert` es la mitad que convierte el velo en overlay de verdad. Un
        velo que solo oscurece deja el foco tabulando por debajo: se llega
        con el teclado a controles que no se ven y que no se sabe que están
        ahí. Y solo en modo cajón: en ancho el lateral no tapa nada, así que
        dejar el contenido inerte sería una aplicación que no se puede usar.
      */}
      <main className="esqueleto__contenido" inert={cajonAbierto}>
        {children}
      </main>
    </div>
  );
}
