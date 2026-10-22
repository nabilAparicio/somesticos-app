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

type Props = {
  readonly children: ReactNode;
  /** Ruta vigente, para marcar el ítem activo de la navegación. */
  readonly ruta: string;
};

type ItemDeNavegacion = {
  readonly rotulo: string;
  readonly href?: string;
};

/**
 * Las secciones de la tajada 1. Las que todavía no existen se muestran
 * apagadas en vez de omitirse: el armazón tiene que verse con la cantidad de
 * ítems que va a tener de verdad, no con uno solo.
 */
const SECCIONES: readonly ItemDeNavegacion[] = [
  { rotulo: "Inicio", href: "/" },
  { rotulo: "Clientes" },
  { rotulo: "Áreas y tipos de proceso" },
  { rotulo: "Procesos" },
  { rotulo: "Pendientes" },
  { rotulo: "Bitácora" },
] as const;

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
                  {seccion.rotulo}
                  <span className="etiqueta etiqueta--tenue">pendiente</span>
                </span>
              ) : (
                <a
                  className="navegacion__item"
                  href={seccion.href}
                  aria-current={ruta === seccion.href ? "page" : undefined}
                >
                  {seccion.rotulo}
                </a>
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
          <a
            className="navegacion__item"
            href="/banco-de-pruebas"
            aria-current={ruta === "/banco-de-pruebas" ? "page" : undefined}
          >
            Banco de pruebas del layout
          </a>
        </div>
      </nav>

      <main className="esqueleto__contenido">{children}</main>
    </div>
  );
}
