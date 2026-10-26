/**
 * La cabecera del proceso: lo que se ve esté abierta la pestaña que esté.
 *
 * **Es la restricción que decide la forma de toda la pantalla**, y no una
 * preferencia de maquetado: «los pendientes abiertos viven arriba del
 * proceso, contados y a la vista» (`docs/diseno.md` §6). Por eso esto no es
 * «pestañas para todo»: el contador de cabos sueltos y la etapa vigente
 * quedan fuera del reparto, arriba, donde no hace falta apretar nada para
 * verlos. Un pendiente que hay que ir a buscar no cumple su única función.
 *
 * El contador **se dibuja también cuando no hay ninguno**, igual que el
 * bloque que lo contenía antes y por la misma razón: una cuenta que
 * aparece y desaparece obliga a preguntarse si no hay pendientes o si no se
 * cargaron, y esa duda es exactamente lo que esta línea existe para no
 * tener.
 *
 * Lo que está acá adentro: el título con la acción de cerrar al lado, la
 * cuenta, la tira de datos y las dos salidas hacia el cliente y la
 * cotización.
 *
 * **T-2 subió el cierre a la cabecera y le sacó el `<h2>`.** T-1 lo dejó
 * como una `<section aria-labelledby="estado-del-proceso">` debajo de la
 * tira de pestañas, y recorrerlo con datos reales mostró el costo: en una
 * pantalla de 2000px las pestañas —que son el eje de navegación— aparecían
 * recién a un tercio de la altura, detrás de un encabezado de segundo
 * nivel que pesaba más que ellas. Cerrar un proceso no es una parte del
 * expediente que se pueda visitar: es una acción sobre el expediente
 * entero, y las acciones de ese alcance viven con el título.
 */
import type { PendienteDeProceso, Proceso } from "../../../worker/contract";
import { VACIO, fechaLegible } from "../../formatos";
import { Aviso } from "../../layout/Aviso";
import { Enlace } from "../../layout/Enlace";
import { Fila } from "../../layout/Fila";
import { Pila } from "../../layout/Pila";
import { Rejilla } from "../../layout/Rejilla";
import { enlaceDe } from "../../ruteo";
import {
  ROTULO_DE_LA_COTIZACION,
  avanceDe,
  avisoDeProcesoCerrado,
  estadoLegible,
  proximoPaso,
  resumenDeTrabajoVigente,
  textoDeOrigen,
} from "./presentacion";

type Props = {
  readonly proceso: Proceso;
  /** Los cabos sueltos sin cerrar. La cabecera solo los cuenta. */
  readonly abiertos: readonly PendienteDeProceso[];
  readonly hoy: string;
  readonly trabajando: boolean;
  readonly avisoDelEstado: {
    tono: "neutro" | "error";
    texto: string;
  } | null;
  readonly alCambiarEstado: (hacia: "cerrar" | "reabrir") => void;
};

/**
 * El `id` que ata la advertencia del cierre a su botón.
 *
 * Es una constante y no una cadena escrita dos veces: el `id` del párrafo y
 * el `aria-describedby` del botón **tienen** que decir lo mismo, y dos
 * literales iguales son dos que mañana se separan sin que nada avise.
 */
const AYUDA_DEL_CIERRE = "ayuda-del-cierre";

function Dato({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="definicion">
      <dt className="definicion__rotulo">{rotulo}</dt>
      <dd className="definicion__valor">{valor}</dd>
    </div>
  );
}

export function CabeceraDeProceso({
  proceso,
  abiertos,
  hoy,
  trabajando,
  avisoDelEstado,
  alCambiarEstado,
}: Props) {
  /* T-14: el proceso cerrado no acepta avance. La pantalla lo apaga y lo
     dice; la guarda que vale es la del servidor, y ésta solo evita que
     alguien descubra la regla apretando. */
  const terminado = proceso.estado === "cerrado";
  const avisoDelCierre = avisoDeProcesoCerrado(proceso);
  /* T-15: la cotización de la que nace, leída **una sola vez**. Es la que
     decide si hay renglón, la que da el texto y la que da la dirección del
     enlace: tres cosas de una lectura, que es lo que impide que la frase y
     el botón puedan discrepar. */
  const deCotizacion = proceso.cotizacionDeOrigen;

  return (
    <Pila>
      <header>
        <Pila espacio="ceñido">
          <p className="texto-apagado">
            <Enlace href={enlaceDe({ nombre: "procesos" })}>Procesos</Enlace>
          </p>

          {/* -------------------------------------------------------------
              T-14 · Cerrar y reabrir, al lado del título.

              Hasta T-1 esto era una `<section>` con su propio `<h2>Estado
              del proceso</h2>`, **debajo de la tira de pestañas**. Medido
              en una pantalla de 2000px: las pestañas aparecían recién a un
              tercio de la altura, y ese `<h2>` gritaba más que la
              navegación que tenía encima. El reparto de T-1 lo dejó así, y
              es culpa del reparto.

              Cerrar un proceso es **una acción de la cabecera**, de la
              misma clase que el título al que pertenece: no es una parte
              del expediente que se pueda visitar, así que no es una
              sección ni lleva encabezado. Sigue arriba del cuerpo, que es
              donde T-14 la puso y por la razón de T-14: lo que decide si
              el plan se puede tocar tiene que leerse antes que el plan, y
              el cierre apaga controles en tres de las cuatro pestañas.
              ------------------------------------------------------------- */}
          <Fila alinear="entre">
            <h1>{proceso.titulo}</h1>
            <button
              type="button"
              className="boton"
              disabled={trabajando}
              aria-describedby={AYUDA_DEL_CIERRE}
              onClick={() => {
                alCambiarEstado(terminado ? "reabrir" : "cerrar");
              }}
            >
              {terminado ? "Reabrir el proceso" : "Cerrar el proceso"}
            </button>
          </Fila>

          {/* La cuenta va pegada al título y no dentro de una sección con
              su propio encabezado: la pestaña de al lado ya se llama
              «Pendientes», y dos rótulos iguales en la misma pantalla son
              dos cosas que el ojo tiene que desambiguar antes de leer el
              número. La frase se basta sola — dice cuántos hay y cuántos
              están vencidos. */}
          <p>
            <span className="etiqueta" role="status">
              {resumenDeTrabajoVigente(proceso, abiertos, hoy)}
            </span>
          </p>

          {/* La advertencia va atada al botón por `aria-describedby` y no
              sólo puesta cerca. Con la sección fuera, la cercanía era lo
              único que los unía, y eso es exactamente la flojedad que T-1
              arregló en dos pruebas: el botón en un lado y su advertencia
              en otro habrían pasado igual.

              Es **una línea y no tres**. De las dos frases que decía antes,
              la que tiene que leerse *antes* de apretar es que el cierre se
              deshace y queda firmado; la otra —que los pendientes abiertos
              no lo impiden y que la respuesta dice cuántos son— la dice
              `textoDelCierre` justo después de cerrar, con el número de
              verdad y sólo cuando es cierta. */}
          <p className="campo__ayuda" id={AYUDA_DEL_CIERRE}>
            {terminado
              ? "Reabrir no borra nada: el cierre anterior queda en la" +
                " bitácora, con quién lo hizo y cuándo."
              : "Cerrar se puede deshacer reabriendo, y las dos cosas quedan" +
                " firmadas."}
          </p>
        </Pila>
      </header>

      {/* Los dos avisos del cierre **no** son permanentes: el de la regla
          sólo aparece con el proceso cerrado —con el proceso abierto no hay
          nada que advertir, y un cartel que está siempre se deja de leer— y
          el de la última acción sólo después de apretar. Por eso pueden
          vivir en la cabecera sin empujar nada hacia abajo el resto del
          tiempo. */}
      {avisoDelCierre !== null && <Aviso>{avisoDelCierre}</Aviso>}

      {avisoDelEstado !== null && (
        <Aviso tono={avisoDelEstado.tono}>{avisoDelEstado.texto}</Aviso>
      )}

      <Rejilla minimo="16rem">
        <dl className="definiciones">
          <Dato rotulo="Cliente" valor={proceso.clienteNombre ?? VACIO} />
          <Dato
            rotulo="Tipo de proceso"
            valor={proceso.tipoProcesoNombre ?? VACIO}
          />
          <Dato rotulo="Área" valor={proceso.areaNombre ?? VACIO} />
        </dl>
        <dl className="definiciones">
          <Dato rotulo="Avance" valor={`${avanceDe(proceso)} etapas`} />
          <Dato rotulo="Lo que viene" valor={proximoPaso(proceso)} />
          {/* «Abierto el» y no «Abierto»: desde que al lado hay un «Estado»
              que puede decir «Abierto», el rótulo a secas se leía como si
              fuera el estado y no la fecha de apertura. */}
          <Dato rotulo="Abierto el" valor={fechaLegible(proceso.abiertoEn)} />
          <Dato rotulo="Estado" valor={estadoLegible(proceso)} />
        </dl>
      </Rejilla>

      <p>
        <Enlace href={enlaceDe({ nombre: "cliente", id: proceso.clienteId })}>
          Ver el cliente
        </Enlace>
      </p>

      {/* ---------------------------------------------------------------
          T-15 · De dónde nace este proceso, y el botón para ir a verlo.

          Va pegado al enlace del cliente porque son la misma clase de
          cosa: las dos salidas de esta pantalla hacia la fila de la que
          cuelga el proceso.

          **La condición es una sola lectura**, y la frase y el enlace
          cuelgan de ella. Colgar la frase de `textoDeOrigen` y el enlace
          de `proceso.origen === "cotizacion"` serían dos guardas para el
          mismo hecho: quitar cualquiera de las dos dejaría la pantalla
          igual, y ninguna quedaría verificada.

          Y sobre un proceso directo **no se dibuja nada**: ni el renglón,
          ni un botón apagado. Un control apagado sigue siendo la promesa
          de que hay algo detrás, y detrás no hay ninguna cotización —es
          la lección de la unidad B de T-2—. */}
      {deCotizacion !== null && (
        <p className="texto-apagado">
          {textoDeOrigen(proceso)}{" "}
          <Enlace
            href={enlaceDe({ nombre: "cotizacion", id: deCotizacion.id })}
          >
            {ROTULO_DE_LA_COTIZACION}
          </Enlace>
        </p>
      )}
    </Pila>
  );
}
