/**
 * Esqueleto — el armazón de la página.
 *
 * Es el único layout bidimensional del sistema, así que es el único que usa
 * grid (§9: «Grid para el esqueleto de la pantalla, que es bidimensional.
 * Flexbox para acomodar el contenido dentro de una franja»). Tres regiones:
 * encabezado, navegación y contenido.
 *
 * En angosto las tres se apilan; en ancho la navegación pasa a ser una
 * columna lateral. Ese cambio lo decide una **consulta de contenedor** sobre
 * el hueco real del armazón, no una `@media` del viewport: el día que esto se
 * embeba en algo más angosto que la ventana, se acomoda igual.
 */
import type { ReactNode } from "react";

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
 * Las secciones de la tajada 1. Las que todavía no existen se muestran
 * apagadas en vez de omitirse: el armazón tiene que verse con la cantidad de
 * ítems que va a tener de verdad, no con uno solo.
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

export function Esqueleto({ children, ruta }: Props) {
  return (
    <div className="esqueleto">
      <header className="esqueleto__encabezado">
        <div className="marca">
          <span className="marca__sello" aria-hidden="true">
            ⚖
          </span>
          <span className="marca__nombre">Bufete</span>
        </div>
        <p className="esqueleto__lema">Seguimiento de procesos</p>
      </header>

      <nav className="esqueleto__navegacion" aria-label="Secciones">
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

      <main className="esqueleto__contenido">{children}</main>
    </div>
  );
}
