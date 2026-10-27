/**
 * Raíz de la SPA: resuelve la ruta y la monta dentro del armazón.
 *
 * El ruteo sigue siendo propio y no una librería, pero ya no es un `switch`
 * suelto: T-5 trae las primeras rutas con parámetro, y la resolución vive en
 * `src/ruteo.ts`, que es una función pura con pruebas. Lo que queda acá es
 * solo el reparto a la pantalla.
 *
 * El Worker ya manda todo lo que no sea `/api/*` al `index.html`
 * (`not_found_handling: "single-page-application"` en `wrangler.jsonc`), así
 * que una ruta profunda abierta en frío llega hasta acá.
 */
import { useEffect, useState } from "react";

import { Esqueleto } from "./layout/Esqueleto";
import { BancoDePruebas } from "./pantallas/BancoDePruebas";
import { Inicio } from "./pantallas/Inicio";
import { Arancel } from "./pantallas/catalogos/Arancel";
import { Catalogos } from "./pantallas/catalogos/Catalogos";
import { PlantillasDeModulo } from "./pantallas/catalogos/PlantillasDeModulo";
import { Precios } from "./pantallas/catalogos/Precios";
import { FormularioDeTipoDeProceso } from "./pantallas/catalogos/FormularioDeTipoDeProceso";
import { TiposDeProceso } from "./pantallas/catalogos/TiposDeProceso";
import { DetalleDeCliente } from "./pantallas/clientes/DetalleDeCliente";
import { FormularioDeCliente } from "./pantallas/clientes/FormularioDeCliente";
import { ListaDeClientes } from "./pantallas/clientes/ListaDeClientes";
import { DetalleDeCotizacion } from "./pantallas/cotizaciones/DetalleDeCotizacion";
import { FormularioDeCotizacion } from "./pantallas/cotizaciones/FormularioDeCotizacion";
import { GenerarCotizacion } from "./pantallas/cotizaciones/GenerarCotizacion";
import { HojaDeCotizacion } from "./pantallas/cotizaciones/HojaDeCotizacion";
import { ListaDeCotizaciones } from "./pantallas/cotizaciones/ListaDeCotizaciones";
import { DetalleDeProceso } from "./pantallas/procesos/DetalleDeProceso";
import { FormularioDeProceso } from "./pantallas/procesos/FormularioDeProceso";
import { ListaDeProcesos } from "./pantallas/procesos/ListaDeProcesos";
import { resolverRuta, type Ruta } from "./ruteo";

function rutaActual(): string {
  return window.location.pathname;
}

function pantallaDe(ruta: Ruta) {
  switch (ruta.nombre) {
    case "inicio":
      return <Inicio />;
    case "banco-de-pruebas":
      return <BancoDePruebas />;
    case "clientes":
      return <ListaDeClientes />;
    // `key` por identificador: pasar del cliente A al B tiene que volver a
    // montar la pantalla, no reusarla. Sin eso, React conserva el estado y
    // durante un instante se ven los datos de A bajo el nombre de B —y el
    // arreglo alternativo, resetear el estado dentro del efecto, es el
    // renderizado en cascada que `react-hooks` marca con razón.
    case "cliente-nuevo":
      return <FormularioDeCliente key="nuevo" />;
    case "cliente":
      return <DetalleDeCliente key={ruta.id} id={ruta.id} />;
    case "cliente-edicion":
      return <FormularioDeCliente key={ruta.id} clienteId={ruta.id} />;
    case "catalogos":
      return <Catalogos />;
    // Las dos del arancel (T-3). Ninguna lleva `key`: no tienen parámetro
    // que las distinga, así que no hay dos instancias entre las que React
    // pudiera conservar estado de la equivocada.
    case "precios":
      return <Precios />;
    case "arancel":
      return <Arancel />;
    // Los módulos de una cotización (T-2 de
    // `odd/tasks/plantillas-de-modulo.md`). Tampoco lleva `key`, por lo mismo
    // que las dos de arriba: no tiene parámetro que la distinga.
    case "plantillas-de-modulo":
      return <PlantillasDeModulo />;
    case "tipos-proceso":
      return <TiposDeProceso />;
    case "tipo-proceso-nuevo":
      return <FormularioDeTipoDeProceso key="nuevo" />;
    case "tipo-proceso":
      return <FormularioDeTipoDeProceso key={ruta.id} tipoId={ruta.id} />;
    case "procesos":
      return <ListaDeProcesos />;
    case "proceso-nuevo":
      return (
        <FormularioDeProceso
          key={`nuevo-${ruta.clienteId ?? "sin-cliente"}`}
          clienteId={ruta.clienteId ?? undefined}
        />
      );
    // La `key` es el identificador **y no la pestaña**. Cambiar de pestaña
    // tiene que dejar la pantalla montada: si la pestaña entrara en la
    // `key`, cada clic volvería a pedir el proceso, los pendientes, la
    // línea de tiempo y la bitácora, pondría un «Consultando…» en el medio
    // y tiraría el pendiente a medio escribir. Pasar del proceso A al B sí
    // vuelve a montar, por lo mismo que en clientes.
    case "proceso":
      return (
        <DetalleDeProceso key={ruta.id} id={ruta.id} pestana={ruta.pestana} />
      );
    case "cotizaciones":
      return <ListaDeCotizaciones />;
    case "cotizacion-nueva":
      return <FormularioDeCotizacion key="nueva" />;
    case "cotizacion-generar":
      return <GenerarCotizacion key="generar" />;
    case "cotizacion":
      return <DetalleDeCotizacion key={ruta.id} id={ruta.id} />;
    case "cotizacion-edicion":
      return <FormularioDeCotizacion key={ruta.id} cotizacionId={ruta.id} />;
    case "cotizacion-hoja":
      return <HojaDeCotizacion key={ruta.id} id={ruta.id} />;
    case "desconocida":
      return (
        <section>
          <h1>Esa página no existe</h1>
          <p className="texto-apagado">{ruta.ruta}</p>
        </section>
      );
  }
}

export function App() {
  const [ruta, setRuta] = useState(rutaActual);

  useEffect(() => {
    // Sin esto, el botón de atrás del navegador deja la pantalla vieja. Es
    // también el canal por el que `navegarA` anuncia una navegación interna.
    const alNavegar = () => {
      setRuta(rutaActual());
    };

    window.addEventListener("popstate", alNavegar);
    return () => {
      window.removeEventListener("popstate", alNavegar);
    };
  }, []);

  return <Esqueleto ruta={ruta}>{pantallaDe(resolverRuta(ruta))}</Esqueleto>;
}
