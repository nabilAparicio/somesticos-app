/**
 * La pestaña «Pendientes»: los cabos sueltos en detalle.
 *
 * **La cuenta no está acá, y es a propósito.** `docs/diseno.md` §6 pide
 * que los pendientes abiertos vivan «arriba del proceso, contados y a la
 * vista», así que el número se quedó en la cabecera, donde se ve esté
 * abierta la pestaña que esté. Lo que bajó a esta pestaña es el detalle:
 * quién tiene cada cosa, cuándo vence, el formulario para anotar una más y
 * los que ya se cerraron. Contar es la alarma; leer el detalle es ir a
 * trabajar, y para eso sí se aprieta.
 *
 * Dentro del panel se conserva el reparto de T-9: arriba lo que no se
 * puede perder de vista, abajo lo que se escribe y el registro de lo ya
 * perseguido. El formulario no puede empujar hacia abajo lo que hay que
 * ver sin buscarlo.
 *
 * Sin estado propio, por lo mismo que los otros tres paneles: el borrador
 * del pendiente es texto que alguien escribió, y cambiar de pestaña no
 * puede ser una forma de perderlo.
 */
import { useState, type Dispatch, type SetStateAction } from "react";

import type {
  FallaDeValidacion,
  PendienteDeProceso,
  Usuario,
} from "../../../worker/contract";
import { diaLegible, fechaLegible } from "../../formatos";
import { Aviso } from "../../layout/Aviso";
import { Confirmacion } from "../../layout/Confirmacion";
import { Fila } from "../../layout/Fila";
import { Pila } from "../../layout/Pila";
import { Prosa } from "../../layout/Prosa";
import { Rejilla } from "../../layout/Rejilla";
import { mensajeDeFalla } from "../../mensajes";
import {
  AVISO_PENDIENTE_NO_SE_REABRE,
  estaVencido,
  firmaDeAutor,
  firmaDeCierre,
  firmaDeResponsable,
  responsablesSeleccionables,
  type BorradorDePendiente,
} from "./pendientes";

type Props = {
  readonly abiertos: readonly PendienteDeProceso[];
  readonly cerrados: readonly PendienteDeProceso[];
  readonly hoy: string;
  readonly trabajando: boolean;
  readonly terminado: boolean;
  readonly equipo: readonly Usuario[];
  readonly pendiente: BorradorDePendiente;
  readonly setPendiente: Dispatch<SetStateAction<BorradorDePendiente>>;
  readonly fallasDelPendiente: readonly FallaDeValidacion[];
  readonly avisoDelPendiente: string | null;
  readonly alCerrar: (pendienteId: string) => void;
  readonly alAnotar: () => void;
};

/**
 * Un pendiente dibujado.
 *
 * El reparto visual sale de qué hace falta para que no se pierda:
 *
 *  - **El texto manda**, en el cuerpo del párrafo. Es lo que falta.
 *  - **El responsable va en una etiqueta**, destacada, porque es quien tiene
 *    que hacer algo. Si no hay ninguno, la etiqueta lo dice en vez de
 *    desaparecer: un hueco en blanco no se ve, y un pendiente que nadie
 *    tiene es justo el que se pierde.
 *  - **El autor va apagado**, abajo, con la fecha. Es contexto, no una
 *    tarea. Confundirlo con el responsable pierde la mitad del dato, así
 *    que no se parecen.
 *  - **Lo vencido se marca**, y solo si está abierto: en rojo sobre algo ya
 *    cerrado sería ruido sobre lo que no hay que hacer.
 *
 * Se declara **al lado del panel y no adentro**: un componente definido
 * dentro de otro es un tipo nuevo en cada dibujo, así que React desmonta lo
 * que había y vuelve a montarlo — y el campo que se estaba tecleando pierde
 * el foco en cada letra.
 */
function Pendiente({
  pendiente,
  hoy,
  trabajando,
  alCerrar,
}: {
  readonly pendiente: PendienteDeProceso;
  readonly hoy: string;
  readonly trabajando: boolean;
  readonly alCerrar?: (pendienteId: string) => void;
}) {
  const vencido = estaVencido(pendiente, hoy);
  const cierre = firmaDeCierre(pendiente);
  /* La pregunta es de la fila y vive en la fila: dos filas no preguntan a
     la vez, porque el `<dialog>` modal deja inerte todo lo de atrás. */
  const [preguntando, setPreguntando] = useState(false);

  return (
    <li
      className={[
        "pendiente",
        vencido ? "pendiente--vencido" : "",
        pendiente.cerradoEn !== null ? "pendiente--cerrado" : "",
        // No hay modificador para «sin responsable»: ese estado ya se dice
        // con la etiqueta apagada y con su frase, y una clase que ninguna
        // regla usa y ninguna prueba puede matar es decoración, no defensa
        // — la lección que T-8 dejó escrita sobre el `overflow-wrap`.
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <p className="pendiente__texto">{pendiente.texto}</p>

      <Fila>
        <span
          className={[
            "etiqueta",
            pendiente.responsableId === null ? "etiqueta--tenue" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {firmaDeResponsable(pendiente)}
        </span>

        {pendiente.venceEn !== null && (
          <span className="pendiente__vence">
            {vencido ? "Venció el " : "Vence el "}
            {diaLegible(pendiente.venceEn)}
          </span>
        )}

        {cierre !== null && <span className="etiqueta">Cerrado</span>}

        {/* «Marcar resuelto» y no «Cerrar», que es lo que decía: en la misma
            pantalla está «Cerrar el proceso», y sin nombre propio el lector
            de pantalla anunciaba N botones «Cerrar» iguales. El nombre
            accesible lleva el texto del pendiente para que cada uno diga
            cuál resuelve. */}
        {alCerrar !== undefined && (
          <button
            type="button"
            className="boton boton--tenue"
            aria-label={`Marcar resuelto «${pendiente.texto}»`}
            disabled={trabajando}
            onClick={() => {
              setPreguntando(true);
            }}
          >
            Marcar resuelto
          </button>
        )}
      </Fila>

      {/* La firma de quien lo resolvió no se borra: se pregunta antes. */}
      {preguntando && alCerrar !== undefined && (
        <Confirmacion
          titulo="¿Marcar resuelto este pendiente?"
          accion="Marcar resuelto"
          alCancelar={() => {
            setPreguntando(false);
          }}
          alConfirmar={() => {
            setPreguntando(false);
            alCerrar(pendiente.id);
          }}
        >
          <Prosa como="p" className="confirmacion__cita">
            {pendiente.texto}
          </Prosa>
          <Prosa como="p">{AVISO_PENDIENTE_NO_SE_REABRE}</Prosa>
        </Confirmacion>
      )}

      <p className="pendiente__firma texto-apagado">
        {firmaDeAutor(pendiente)} · {fechaLegible(pendiente.creadoEn)}
        {pendiente.procesoEtapaNombre !== null && (
          <> · nació en «{pendiente.procesoEtapaNombre}»</>
        )}
        {cierre !== null && (
          <>
            {" · "}
            {cierre} · {fechaLegible(pendiente.cerradoEn ?? "")}
          </>
        )}
      </p>
    </li>
  );
}

export function PanelDePendientes({
  abiertos,
  cerrados,
  hoy,
  trabajando,
  terminado,
  equipo,
  pendiente,
  setPendiente,
  fallasDelPendiente,
  avisoDelPendiente,
  alCerrar,
  alAnotar,
}: Props) {
  return (
    <Pila espacio="holgado">
      {/* ---------------------------------------------------------------
          Los abiertos, en detalle.

          El bloque se dibuja **también cuando no hay ninguno**, igual que
          cuando vivía arriba del proceso: uno que aparece y desaparece
          obliga a preguntarse si no hay pendientes o si no se cargaron.
          --------------------------------------------------------------- */}
      <section aria-labelledby="pendientes-abiertos" className="pendientes">
        <Pila espacio="ceñido">
          <h2 id="pendientes-abiertos">Pendientes</h2>

          {avisoDelPendiente !== null && (
            <Aviso tono="error">{avisoDelPendiente}</Aviso>
          )}

          {abiertos.length === 0 ? (
            // La cuenta que decía «no hay ninguno» se fue a la cabecera, y
            // sin esta línea el bloque quedaba **con su borde y vacío
            // adentro**: medido en pantalla, no supuesto. Un recuadro mudo
            // es exactamente la duda que este bloque existe para no tener.
            // No repite la cuenta de arriba: dice la salida, como el resto
            // de los vacíos de esta pantalla.
            <p className="texto-apagado">
              Ninguno abierto. Si aparece un cabo suelto, se anota acá abajo.
            </p>
          ) : (
            <ul className="pendientes__lista sin-viñetas">
              {abiertos.map((suyo) => (
                <Pendiente
                  key={suyo.id}
                  pendiente={suyo}
                  hoy={hoy}
                  trabajando={trabajando}
                  alCerrar={alCerrar}
                />
              ))}
            </ul>
          )}
        </Pila>
      </section>

      {/* ---------------------------------------------------------------
          T-9 · Anotar un pendiente, y los que ya se cerraron.

          Escribir va abajo y leer va arriba, igual que con las notas: el
          formulario no puede empujar hacia abajo lo que hay que ver sin
          buscarlo. Los cerrados también viven acá — ya no hay que hacer
          nada con ellos, pero son el registro de lo que se persiguió.
          --------------------------------------------------------------- */}
      <section aria-labelledby="anotar-pendiente">
        <Pila>
          <h2 id="anotar-pendiente">Anotar un pendiente</h2>

          <Prosa como="p" className="texto-apagado">
            Un cabo suelto que no detiene el proceso pero no se puede
            olvidar: «falta el certificado apostillado, pero el proceso
            inicia». Mientras esté abierto se ve arriba, contado.
          </Prosa>

          {/* El botón apagado sin explicación hace pensar en un error de la
              aplicación. Acá se dice la regla y la salida: la nota del
              historial sigue abierta, y es donde va «el cliente volvió
              preguntando por X». */}
          {terminado && (
            <Aviso>
              Este proceso está cerrado, así que no se le anotan pendientes
              nuevos: un pendiente es algo que sigue pasando, y acá ya no
              está pasando nada. Lo que sí se puede es escribir una nota en
              el historial, y cerrar los que hayan quedado abiertos. Si
              apareció trabajo de verdad, hay que reabrir el proceso.
            </Aviso>
          )}

          {fallasDelPendiente.length > 0 && (
            <Aviso tono="error">
              <ul className="lista-de-fallas">
                {fallasDelPendiente.map((falla) => (
                  <li key={`${falla.campo}-${falla.motivo}`}>
                    {mensajeDeFalla(falla.motivo, falla.cuantos)}
                  </li>
                ))}
              </ul>
            </Aviso>
          )}

          <form
            onSubmit={(evento) => {
              evento.preventDefault();
              alAnotar();
            }}
            noValidate
          >
            <Pila>
              <div className="campo">
                <label className="campo__rotulo" htmlFor="campo-pendiente">
                  Qué falta
                  <span className="campo__marca"> · obligatorio</span>
                </label>
                <textarea
                  id="campo-pendiente"
                  className="campo__control campo__control--prosa"
                  rows={3}
                  value={pendiente.texto}
                  onChange={(evento) => {
                    setPendiente((anterior) => ({
                      ...anterior,
                      texto: evento.target.value,
                    }));
                  }}
                />
              </div>

              <Rejilla minimo="16rem">
                <div className="campo">
                  <label
                    className="campo__rotulo"
                    htmlFor="campo-responsable-pendiente"
                  >
                    Quién lo tiene que resolver
                  </label>
                  <select
                    id="campo-responsable-pendiente"
                    className="campo__control"
                    value={pendiente.responsableId}
                    onChange={(evento) => {
                      setPendiente((anterior) => ({
                        ...anterior,
                        responsableId: evento.target.value,
                      }));
                    }}
                  >
                    {/* La opción vacía se NOMBRA, no se deja en blanco: un
                        pendiente sin dueño es legítimo y es el que se
                        pierde, así que hay que elegirlo a sabiendas. */}
                    <option value="">Sin responsable asignado</option>
                    {responsablesSeleccionables(
                      equipo,
                      pendiente.responsableId,
                    ).map((persona) => (
                      <option key={persona.id} value={persona.id}>
                        {persona.nombre}
                      </option>
                    ))}
                  </select>
                  <p className="campo__ayuda">
                    Es distinto de quien lo anota: el sistema firma con tu
                    identidad quién lo vio, y acá va quien lo persigue.
                  </p>
                </div>

                <div className="campo">
                  <label className="campo__rotulo" htmlFor="campo-vence">
                    Vence el
                  </label>
                  <input
                    id="campo-vence"
                    className="campo__control"
                    type="date"
                    value={pendiente.venceEn}
                    onChange={(evento) => {
                      setPendiente((anterior) => ({
                        ...anterior,
                        venceEn: evento.target.value,
                      }));
                    }}
                  />
                  <p className="campo__ayuda">
                    Opcional. Si se pasa, el pendiente se ve marcado arriba
                    hasta que alguien lo cierre.
                  </p>
                </div>
              </Rejilla>

              <Fila>
                <button
                  type="submit"
                  className="boton boton--primario"
                  disabled={trabajando || terminado}
                  aria-busy={trabajando}
                >
                  {trabajando ? "Guardando…" : "Anotar pendiente"}
                </button>
              </Fila>
            </Pila>
          </form>

          {/* El aviso va pegado a lo que se resuelve, no en un manual: es el
              momento en que alguien va a apretar «Marcar resuelto». Y se
              repite dentro de la pregunta, que es donde se decide. */}
          <Aviso>{AVISO_PENDIENTE_NO_SE_REABRE}</Aviso>

          <h3>Cerrados</h3>
          {cerrados.length === 0 ? (
            <p className="texto-apagado">
              Todavía no se cerró ningún pendiente de este proceso.
            </p>
          ) : (
            <ul className="pendientes__lista sin-viñetas">
              {cerrados.map((suyo) => (
                <Pendiente
                  key={suyo.id}
                  pendiente={suyo}
                  hoy={hoy}
                  trabajando={trabajando}
                />
              ))}
            </ul>
          )}
        </Pila>
      </section>
    </Pila>
  );
}
