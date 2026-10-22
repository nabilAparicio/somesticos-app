/**
 * BANCO DE PRUEBAS DEL LAYOUT — no es una pantalla del producto.
 *
 * Existe por una sola razón: el criterio de T-4 dice que la página no
 * scrollea en horizontal entre 320px y 2560px, y **una página vacía nunca
 * scrollea**. Una prueba que recorre viewports sobre un título y dos párrafos
 * pasa siempre y no prueba nada.
 *
 * Entonces esta ruta junta, a propósito, el contenido que rompe un layout mal
 * hecho:
 *
 *  - una tabla de nueve columnas con texto de dominio largo en las celdas,
 *    que a 320px no entra ni de lejos;
 *  - prosa con una URL larguísima y una palabra sin puntos de corte, que es
 *    lo que desborda un contenedor al que le falta `overflow-wrap`;
 *  - una rejilla de tarjetas con bastantes elementos, para que el reflujo
 *    automático tenga de qué reacomodar;
 *  - títulos y etiquetas con nombres reales de trámites migratorios, que son
 *    largos de verdad.
 *
 * Si alguien mete un ancho fijo en cualquier parte del sistema de layout,
 * esta ruta lo delata. Por eso el contenido no se "limpia" ni se acorta: su
 * fealdad es la prueba. No se enlaza desde la navegación del producto.
 */
import { ContenedorDeTabla } from "../layout/ContenedorDeTabla";
import { Fila } from "../layout/Fila";
import { Pila } from "../layout/Pila";
import { Prosa } from "../layout/Prosa";
import { Rejilla } from "../layout/Rejilla";
import { Tarjeta } from "../layout/Tarjeta";

type FilaDeProceso = {
  readonly cliente: string;
  readonly tipoDeCliente: string;
  readonly documento: string;
  readonly area: string;
  readonly tipoDeProceso: string;
  readonly etapa: string;
  readonly responsable: string;
  readonly pendientes: number;
  readonly abiertoEn: string;
};

const PROCESOS: readonly FilaDeProceso[] = [
  {
    cliente: "Corporación Interamericana de Servicios Logísticos, S.A.",
    tipoDeCliente: "Persona jurídica",
    documento: "RUC 155712345-2-2021 DV 84",
    area: "Migración",
    tipoDeProceso:
      "Solicitud de permiso de residencia permanente en calidad de profesional extranjero",
    etapa: "Recolección de documentos apostillados en el país de origen",
    responsable: "Itzel Aparicio Mendieta",
    pendientes: 3,
    abiertoEn: "2026-03-11",
  },
  {
    cliente: "María Fernanda Villalobos de Carrizo",
    tipoDeCliente: "Persona natural",
    documento: "Cédula 8-912-2345",
    area: "Familia",
    tipoDeProceso: "Divorcio de mutuo acuerdo con convenio de guarda y crianza",
    etapa: "Presentación de la demanda ante el Juzgado de Niñez y Adolescencia",
    responsable: "Itzel Aparicio Mendieta",
    pendientes: 0,
    abiertoEn: "2026-05-02",
  },
  {
    cliente: "Hendrik Johannes van der Meulen-Rietveld",
    tipoDeCliente: "Persona natural extranjera",
    documento: "Pasaporte NLD-XK7741902",
    area: "Migración",
    tipoDeProceso:
      "Solicitud de residencia permanente en calidad de jubilado o pensionado",
    etapa: "Verificación de la certificación bancaria de la pensión vitalicia",
    responsable: "Equipo del bufete",
    pendientes: 5,
    abiertoEn: "2026-01-27",
  },
  {
    cliente: "Inmobiliaria Punta Barco Development Group, S.A.",
    tipoDeCliente: "Persona jurídica",
    documento: "RUC 2550987-1-845621 DV 09",
    area: "Civil",
    tipoDeProceso:
      "Compraventa de bien inmueble con constitución de hipoteca a favor de entidad bancaria",
    etapa: "Inscripción del traspaso en el Registro Público de Panamá",
    responsable: "Itzel Aparicio Mendieta",
    pendientes: 2,
    abiertoEn: "2026-06-18",
  },
  {
    cliente: "Asociación de Productores Agropecuarios de Chiriquí Occidente",
    tipoDeCliente: "Organización sin fines de lucro",
    documento: "RUC 3312998-2-2019 DV 17",
    area: "Civil",
    tipoDeProceso:
      "Constitución de sociedad y protocolización del pacto social ante notaría pública",
    etapa: "Redacción del borrador del pacto social para revisión del cliente",
    responsable: "Equipo del bufete",
    pendientes: 1,
    abiertoEn: "2026-07-30",
  },
  {
    cliente: "Giuseppe Alessandro Montenegro Balbuena",
    tipoDeCliente: "Persona natural extranjera",
    documento: "Pasaporte ITA-YA0938471",
    area: "Migración",
    tipoDeProceso:
      "Solicitud de permiso de trabajo dentro del porcentaje del diez por ciento del personal ordinario",
    etapa: "Espera de la resolución del Ministerio de Trabajo y Desarrollo Laboral",
    responsable: "Itzel Aparicio Mendieta",
    pendientes: 4,
    abiertoEn: "2025-11-14",
  },
] as const;

const TARJETAS: readonly { readonly titulo: string; readonly detalle: string }[] =
  [
    {
      titulo: "Residencia permanente por profesional extranjero",
      detalle:
        "Nueve etapas por defecto, de la apostilla del título hasta el carné de residente.",
    },
    {
      titulo: "Residencia por jubilado o pensionado",
      detalle:
        "Siete etapas. La certificación de la pensión vitalicia es la que más se demora.",
    },
    {
      titulo: "Permiso de trabajo del diez por ciento",
      detalle: "Seis etapas, y depende de que la residencia ya esté resuelta.",
    },
    {
      titulo: "Divorcio de mutuo acuerdo",
      detalle:
        "Ocho etapas cuando hay menores de edad; cinco cuando no los hay.",
    },
    {
      titulo: "Compraventa de bien inmueble",
      detalle:
        "Diez etapas, con la inscripción en el Registro Público al final de todo.",
    },
    {
      titulo: "Constitución de sociedad anónima",
      detalle: "Cinco etapas. El pacto social se protocoliza ante notaría.",
    },
    {
      titulo: "Guarda, crianza y reglamentación de visitas",
      detalle: "Siete etapas ante el Juzgado de Niñez y Adolescencia.",
    },
    {
      titulo: "Naturalización por matrimonio con nacional panameño",
      detalle:
        "Once etapas, la más larga del catálogo, con dos audiencias de por medio.",
    },
    {
      titulo: "Sucesión testada",
      detalle: "Nueve etapas desde la apertura hasta la adjudicación de bienes.",
    },
  ] as const;

export function BancoDePruebas() {
  return (
    <Pila espacio="holgado">
      <header>
        <h1>Banco de pruebas del layout</h1>
        <p className="texto-apagado">
          Ruta de diagnóstico. No es una pantalla del producto: junta el
          contenido más hostil que el sistema tiene que aguantar sin que la
          página scrollee en horizontal.
        </p>
      </header>

      <section aria-labelledby="bp-prosa">
        <Pila>
          <h2 id="bp-prosa">Prosa con tope de ancho</h2>
          <Prosa>
            <p>
              El alcance de una propuesta se lee en columna angosta porque la
              legibilidad se mide en caracteres por línea, no en píxeles. Este
              párrafo existe para comprobar que el tope de ancho está escrito
              en <code>ch</code> y que el texto sigue entrando a 320 píxeles.
            </p>
            <p>
              Y acá va lo que de verdad rompe un contenedor mal hecho: una URL
              sin un solo espacio donde cortar,{" "}
              <a href="https://www.migracion.gob.pa/tramites/residencia-permanente-profesional-extranjero/requisitos-documentales-apostillados-y-traducidos-por-interprete-publico-autorizado">
                https://www.migracion.gob.pa/tramites/residencia-permanente-profesional-extranjero/requisitos-documentales-apostillados-y-traducidos-por-interprete-publico-autorizado
              </a>{" "}
              y una palabra interminable:{" "}
              <strong>
                contraetiquetamientointerinstitucionalizadamenteimprocedentes
              </strong>
              . Si el layout no las parte, la página se va de ancho.
            </p>
          </Prosa>
        </Pila>
      </section>

      <section aria-labelledby="bp-rejilla">
        <Pila>
          <h2 id="bp-rejilla">Rejilla que refluye sola</h2>
          <Rejilla minimo="18rem">
            {TARJETAS.map((tarjeta) => (
              <Tarjeta key={tarjeta.titulo} titulo={tarjeta.titulo}>
                <p>{tarjeta.detalle}</p>
                <Fila>
                  <span className="etiqueta">Migración</span>
                  <span className="etiqueta">Plantilla editable</span>
                  <span className="etiqueta">
                    Etapas copiadas al abrir el proceso
                  </span>
                </Fila>
              </Tarjeta>
            ))}
          </Rejilla>
        </Pila>
      </section>

      <section aria-labelledby="bp-rejilla-ancha">
        <Pila>
          <h2 id="bp-rejilla-ancha">Rejilla con mínimo mayor que la pantalla</h2>
          <p className="texto-apagado">
            Esta rejilla pide columnas de 24rem (384px), más de lo que mide la
            columna de contenido a 320px. Es el caso que delata un{" "}
            <code>minmax(24rem, 1fr)</code> escrito sin{" "}
            <code>min(…, 100%)</code>: la pista no cede, y la rejilla empuja la
            página. Sin esta sección, quitarle el <code>min()</code> a la
            rejilla no rompería ninguna prueba.
          </p>
          <Rejilla minimo="24rem">
            <Tarjeta titulo="Expediente migratorio consolidado">
              <p>
                Resolución del Servicio Nacional de Migración, carné de
                residente y constancia de trámite en una sola ficha.
              </p>
            </Tarjeta>
            <Tarjeta titulo="Plan de trabajo del proceso">
              <p>
                Etapas cumplidas y etapas por delante, que es la mitad del
                valor de la vista.
              </p>
            </Tarjeta>
            <Tarjeta titulo="Pendientes abiertos del cliente">
              <p>
                Cabos sueltos que cruzan etapas sin que nadie los copie a mano.
              </p>
            </Tarjeta>
          </Rejilla>
        </Pila>
      </section>

      <section aria-labelledby="bp-tabla">
        <Pila>
          <h2 id="bp-tabla">Tabla que scrollea dentro de sí misma</h2>
          <p className="texto-apagado">
            Nueve columnas con texto de dominio real. A 320px no entra: tiene
            que scrollear el contenedor, nunca la página.
          </p>
          <ContenedorDeTabla rotulo="Procesos abiertos del bufete">
            <thead>
              <tr>
                <th scope="col">Cliente</th>
                <th scope="col">Tipo de cliente</th>
                <th scope="col">Documento</th>
                <th scope="col">Área</th>
                <th scope="col">Tipo de proceso</th>
                <th scope="col">Etapa vigente</th>
                <th scope="col">Responsable</th>
                <th scope="col">Pendientes</th>
                <th scope="col">Abierto en</th>
              </tr>
            </thead>
            <tbody>
              {PROCESOS.map((proceso) => (
                <tr key={proceso.cliente}>
                  <th scope="row">{proceso.cliente}</th>
                  <td>{proceso.tipoDeCliente}</td>
                  <td>{proceso.documento}</td>
                  <td>{proceso.area}</td>
                  <td>{proceso.tipoDeProceso}</td>
                  <td>{proceso.etapa}</td>
                  <td>{proceso.responsable}</td>
                  <td className="numerico">{proceso.pendientes}</td>
                  <td>{proceso.abiertoEn}</td>
                </tr>
              ))}
            </tbody>
          </ContenedorDeTabla>
        </Pila>
      </section>

      <section aria-labelledby="bp-fila">
        <Pila>
          <h2 id="bp-fila">Fila que envuelve</h2>
          <p className="texto-apagado">
            Una franja unidimensional con etiquetas largas. Envuelve; no
            encoge hasta lo ilegible ni empuja la página.
          </p>
          <Fila>
            <span className="etiqueta">
              Solicitud de permiso de residencia permanente en calidad de
              profesional extranjero
            </span>
            <span className="etiqueta">
              Verificación de la certificación bancaria de la pensión vitalicia
            </span>
            <span className="etiqueta">
              Inscripción del traspaso en el Registro Público de Panamá
            </span>
            <span className="etiqueta">
              Espera de la resolución del Ministerio de Trabajo y Desarrollo
              Laboral
            </span>
          </Fila>
        </Pila>
      </section>
    </Pila>
  );
}
