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
      />

      <ListaDeCatalogo
        titulo="Tipos de cliente"
        sujeto="ese tipo de cliente"
        explicacion="Particular, empresa, ONG… Es una etiqueta, no una ramificación: agregar una es una fila, no un despliegue."
        rotuloDeAlta="Nombre del tipo nuevo"
        cargar={cargarTiposCliente}
        guardar={guardarTipoCliente}
        borrar={borrarTipoCliente}
      />

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
