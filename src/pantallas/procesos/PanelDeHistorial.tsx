/**
 * La pestaña «Historial»: lo que ya pasó, y el lugar donde se anota.
 *
 * Son **dos registros distintos y la pantalla los separa a propósito**: la
 * línea de tiempo son hechos que alguien quiso dejar dichos; la bitácora
 * son hechos del sistema. Juntarlos haría que «Itzel avanzó a Entrevista» y
 * «el cliente quiere pago diferido» se leyeran como lo mismo. Que ahora
 * compartan pestaña no los funde: comparten el cajón porque las dos se leen
 * cuando se las busca, que es justamente por lo que T-8 las había puesto al
 * final de la lista larga.
 *
 * El formulario va al final, debajo de las dos, por lo mismo de siempre:
 * escribir no puede empujar hacia abajo lo que hay que leer.
 *
 * Sin estado propio: el borrador de la nota vive en el armador, porque es
 * texto que una persona escribió y cambiar de pestaña no puede ser una
 * forma de perderlo.
 */
import type { Dispatch, SetStateAction } from "react";

import type {
  DetalleDeProceso as Detalle,
  FallaDeValidacion,
  TramoDeLineaDeTiempo,
} from "../../../worker/contract";
import { VACIO, fechaLegible } from "../../formatos";
import { Aviso } from "../../layout/Aviso";
import { Fila } from "../../layout/Fila";
import { Pila } from "../../layout/Pila";
import { Prosa } from "../../layout/Prosa";
import { mensajeDeFalla } from "../../mensajes";
import { Bitacora, type EstadoDeBitacora } from "../Bitacora";
import {
  AVISO_NOTA_INMUTABLE,
  etapaVigenteDe,
  opcionesDeEtapa,
  resumenDeLaLinea,
  type BorradorDeNota,
} from "./notas";

type Props = {
  readonly etapas: Detalle["etapas"];
  readonly tramos: readonly TramoDeLineaDeTiempo[];
  readonly bitacora: EstadoDeBitacora;
  readonly trabajando: boolean;
  readonly nota: BorradorDeNota;
  readonly setNota: Dispatch<SetStateAction<BorradorDeNota>>;
  readonly fallasDeLaNota: readonly FallaDeValidacion[];
  readonly avisoDeLaNota: string | null;
  readonly alAnotar: () => void;
};

export function PanelDeHistorial({
  etapas,
  tramos,
  bitacora,
  trabajando,
  nota,
  setNota,
  fallasDeLaNota,
  avisoDeLaNota,
  alAnotar,
}: Props) {
  const vigente = etapaVigenteDe(etapas);

  return (
    <Pila espacio="holgado">
      {/* ---------------------------------------------------------------
          T-8 · La línea de tiempo.
          --------------------------------------------------------------- */}
      <section aria-labelledby="linea-de-tiempo">
        <Pila>
          <h2 id="linea-de-tiempo">Línea de tiempo</h2>

          <Prosa como="p" className="texto-apagado">
            {resumenDeLaLinea(tramos)}
          </Prosa>

          {tramos.length === 0 ? (
            <p className="texto-apagado">
              Las notas que se escriban van a aparecer acá, agrupadas por la
              etapa en la que pasaron.
            </p>
          ) : (
            <ol className="linea">
              {tramos.map((tramo) => (
                <li className="linea__tramo" key={tramo.etapa.id}>
                  <h3 className="linea__etapa">
                    {tramo.etapa.nombre}
                    {tramo.etapa.alcanzadaEn !== null && (
                      <span className="etiqueta">
                        {fechaLegible(tramo.etapa.alcanzadaEn)}
                      </span>
                    )}
                  </h3>
                  <ul className="linea__notas sin-viñetas">
                    {tramo.notas.map((suya) => (
                      <li className="nota" key={suya.id}>
                        <p className="nota__texto">{suya.texto}</p>
                        <p className="nota__firma texto-apagado">
                          {suya.autorNombre ?? VACIO} ·{" "}
                          {fechaLegible(suya.creadaEn)}
                        </p>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          )}
        </Pila>
      </section>

      {/* ---------------------------------------------------------------
          T-10 · La bitácora.

          Debajo de la línea de tiempo y encima del formulario de anotar:
          las dos se leen, y lo que se escribe va al final.
          --------------------------------------------------------------- */}
      <Bitacora estado={bitacora} id="bitacora-del-proceso" />

      {/* ---------------------------------------------------------------
          El formulario de la nota. Separado de la línea y debajo de ella,
          para que escribir no empuje hacia abajo lo que hay que leer.
          --------------------------------------------------------------- */}
      <section aria-labelledby="anotar">
        <Pila>
          <h2 id="anotar">Anotar</h2>

          {/* El aviso va ANTES del campo: enterarse de que no se puede
              corregir recién después de escribir no sirve de nada. */}
          <Aviso>{AVISO_NOTA_INMUTABLE}</Aviso>

          {avisoDeLaNota !== null && <Aviso tono="error">{avisoDeLaNota}</Aviso>}

          {fallasDeLaNota.length > 0 && (
            <Aviso tono="error">
              <ul className="lista-de-fallas">
                {fallasDeLaNota.map((falla) => (
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
                <label className="campo__rotulo" htmlFor="campo-nota">
                  Qué pasó
                  <span className="campo__marca"> · obligatorio</span>
                </label>
                <textarea
                  id="campo-nota"
                  className="campo__control campo__control--prosa"
                  rows={4}
                  value={nota.texto}
                  onChange={(evento) => {
                    setNota((anterior) => ({
                      ...anterior,
                      texto: evento.target.value,
                    }));
                  }}
                />
                <p className="campo__ayuda">
                  Un hecho, como se lo contaría a alguien del bufete: «el
                  cliente quiere pago diferido por meses».
                </p>
              </div>

              <div className="campo">
                <label className="campo__rotulo" htmlFor="campo-etapa-nota">
                  Etapa en la que pasó
                </label>
                <select
                  id="campo-etapa-nota"
                  className="campo__control"
                  value={nota.procesoEtapaId}
                  disabled={etapas.length === 0}
                  onChange={(evento) => {
                    setNota((anterior) => ({
                      ...anterior,
                      procesoEtapaId: evento.target.value,
                    }));
                  }}
                >
                  {/* La opción vacía no es «ninguna»: es «la vigente», que es
                      lo que el servidor elige y lo que acierta casi siempre.
                      Se la nombra para que nadie crea que dejó el campo sin
                      llenar. */}
                  <option value="">
                    {vigente === null
                      ? "Este proceso no tiene etapas todavía"
                      : `Donde está el proceso hoy: «${vigente.nombre}»`}
                  </option>
                  {opcionesDeEtapa(etapas).map((opcion) => (
                    <option key={opcion.id} value={opcion.id}>
                      {opcion.etiqueta}
                    </option>
                  ))}
                </select>
                <p className="campo__ayuda">
                  Una nota se ancla a la etapa donde ocurrió el hecho, que no
                  siempre es donde está el proceso cuando alguien se sienta a
                  escribirlo.
                </p>
              </div>

              <Fila>
                <button
                  type="submit"
                  className="boton boton--primario"
                  disabled={trabajando}
                >
                  {trabajando ? "Guardando…" : "Anotar"}
                </button>
              </Fila>
            </Pila>
          </form>
        </Pila>
      </section>
    </Pila>
  );
}
