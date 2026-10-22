/**
 * Raíz de la SPA: resuelve la ruta y la monta dentro del armazón.
 *
 * El ruteo es deliberadamente mínimo —`location.pathname` y un `switch`— y no
 * una librería. Hoy hay dos rutas y ninguna lleva parámetros; traer un router
 * ahora sería elegir su modelo de datos antes de saber qué pantallas van a
 * existir. T-5 en adelante dirán si hace falta.
 *
 * El Worker ya manda todo lo que no sea `/api/*` al `index.html`
 * (`not_found_handling: "single-page-application"` en `wrangler.jsonc`), así
 * que una ruta profunda abierta en frío llega hasta acá.
 */
import { useEffect, useState } from "react";

import { Esqueleto } from "./layout/Esqueleto";
import { BancoDePruebas } from "./pantallas/BancoDePruebas";
import { Inicio } from "./pantallas/Inicio";

function rutaActual(): string {
  return window.location.pathname;
}

export function App() {
  const [ruta, setRuta] = useState(rutaActual);

  useEffect(() => {
    // Sin esto, el botón de atrás del navegador deja la pantalla vieja.
    const alNavegar = () => {
      setRuta(rutaActual());
    };

    window.addEventListener("popstate", alNavegar);
    return () => {
      window.removeEventListener("popstate", alNavegar);
    };
  }, []);

  return (
    <Esqueleto ruta={ruta}>
      {ruta === "/banco-de-pruebas" ? <BancoDePruebas /> : <Inicio />}
    </Esqueleto>
  );
}
