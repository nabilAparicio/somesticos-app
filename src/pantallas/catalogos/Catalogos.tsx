/**
 * Los catálogos del bufete, en una pantalla.
 *
 * Las áreas y los tipos de cliente son dos listas cortas de dos campos, así
 * que van juntas: partirlas en dos pantallas sería hacer navegar a alguien
 * para ver cuatro filas. Los tipos de proceso tienen su propia pantalla
 * porque arrastran una plantilla ordenada y no entran en una fila de tabla.
 *
 * El tipo de cliente entra acá por el agujero que dejó T-5: la migración no
 * siembra filas y hasta ahora no había forma de poblarlo, de modo que en una
 * instalación limpia el desplegable del formulario de cliente salía vacío
 * para siempre.
 */
import { Enlace } from "../../layout/Enlace";
import { Pila } from "../../layout/Pila";
import { Prosa } from "../../layout/Prosa";
import { enlaceDe } from "../../ruteo";
import {
  borrarArea,
  borrarTipoCliente,
  cargarAreas,
  cargarBitacoraDeArea,
  cargarBitacoraDeTipoCliente,
  cargarTiposCliente,
  guardarArea,
  guardarTipoCliente,
} from "./api";
import { ListaDeCatalogo } from "./ListaDeCatalogo";

export function Catalogos() {
  return (
    <Pila espacio="holgado">
      <header>
        <Pila espacio="ceñido">
          <h1>Catálogos</h1>
          <Prosa como="p" className="texto-apagado">
            Son datos del bufete, no configuración: se crean, se editan y se
            borran desde acá. Dar de baja una fila la saca de lo que se puede
            elegir y la deja válida para lo que ya la usa; borrarla solo se
            puede si no cuelga nada de ella.
          </Prosa>
        </Pila>
      </header>

      <ListaDeCatalogo
        titulo="Áreas"
        sujeto="esa área"
        explicacion="Las ramas del derecho que trabaja el bufete: familia, migración, civil, penal."
        rotuloDeAlta="Nombre del área nueva"
        cargar={cargarAreas}
        guardar={guardarArea}
        borrar={borrarArea}
        cargarBitacora={cargarBitacoraDeArea}
      />

      <ListaDeCatalogo
        titulo="Tipos de cliente"
        sujeto="ese tipo de cliente"
        explicacion="Particular, empresa, ONG… Es una etiqueta, no una ramificación: agregar una es una fila, no un despliegue."
        rotuloDeAlta="Nombre del tipo nuevo"
        cargar={cargarTiposCliente}
        guardar={guardarTipoCliente}
        borrar={borrarTipoCliente}
        cargarBitacora={cargarBitacoraDeTipoCliente}
      />

      {/*
        Las dos pantallas del arancel (T-3 de
        `odd/tasks/arancel-de-honorarios.md`). Entran acá con enlace propio y
        no solo con ruta, porque la historia de este archivo es la lección:
        las cuatro pantallas de cotización se escribieron, se probaron y
        pasaron el punta a punta **sin que nadie pudiera llegar a ellas
        haciendo clic**. Una pantalla a la que solo se llega escribiendo la
        URL no está entregada.

        Van en dos secciones y no en una, porque son dos cosas distintas y
        confundirlas es el defecto que esta tajada existe para evitar: una es
        lo que el bufete cobra y se edita; la otra es la cita de un documento
        publicado y se lee.
      */}
      <section aria-labelledby="catalogo-precios">
        <Pila espacio="ceñido">
          <h2 id="catalogo-precios">Precios de los servicios</h2>
          <p className="texto-apagado">
            Lo que el bufete cobra por cada servicio. Donde todavía no hay un
            precio decidido, el sistema sugiere uno.
          </p>
          <p>
            <Enlace href={enlaceDe({ nombre: "precios" })} className="boton">
              Ver los precios del bufete
            </Enlace>
          </p>
        </Pila>
      </section>

      <section aria-labelledby="catalogo-arancel">
        <Pila espacio="ceñido">
          <h2 id="catalogo-arancel">Arancel de honorarios</h2>
          <p className="texto-apagado">
            La tarifa del Acuerdo No 49 de 2001, completa y de solo lectura.
            Es de donde sale cada precio preestablecido.
          </p>
          <p>
            <Enlace href={enlaceDe({ nombre: "arancel" })} className="boton">
              Ver la tabla del arancel
            </Enlace>
          </p>
        </Pila>
      </section>

      <section aria-labelledby="catalogo-tipos-proceso">
        <Pila espacio="ceñido">
          <h2 id="catalogo-tipos-proceso">Tipos de proceso</h2>
          <p className="texto-apagado">
            Cada tipo vive dentro de un área y lleva su propia plantilla de
            etapas, así que tiene pantalla aparte.
          </p>
          <p>
            <Enlace
              href={enlaceDe({ nombre: "tipos-proceso" })}
              className="boton"
            >
              Ver tipos de proceso
            </Enlace>
          </p>
        </Pila>
      </section>
    </Pila>
  );
}
