/**
 * La pestaña «Trabajo»: el plan del proceso y lo que se hace con él.
 *
 * Ver y editar van juntos **por decisión del usuario**: «es algo que pasa
 * seguido y por ende debe estar integrado en el avance». Agregar o borrar
 * un paso ocurre mientras el expediente corre —el juez pide algo que nadie
 * previó—, así que separar «Avance» de «Plan» en dos pestañas obligaría a
 * cambiar de lugar justo en el medio del trabajo.
 *
 * Por eso las cuatro secciones de abajo están en la misma pestaña. **En
 * T-1 siguen siendo cuatro**, apiladas y tal cual estaban: las etapas se
 * dibujan tres veces porque «Cumplido», «Lo que falta» y «Plan de trabajo»
 * son las mismas filas de `proceso_etapa`. Fundirlas en una sola lista es
 * T-2, y va con la guarda de avanzar-con-cambios-sin-guardar, que es una
 * regla de verdad y no un movimiento de renglones.
 *
 * **No tiene estado propio, y eso es una decisión escrita.** Todo lo que se
 * dibuja acá —el borrador del plan, el paso que se está tecleando, el
 * destino de la plantilla— es dato del proceso o texto que una persona
 * escribió, y las dos cosas tienen que sobrevivir a un clic en otra
 * pestaña igual que sobreviven a un 403. Viven en el armador; acá entran
 * como propiedades.
 */
import type { Dispatch, SetStateAction } from "react";

import type {
  Area,
  DetalleDeProceso as Detalle,
  FallaDeValidacion,
} from "../../../worker/contract";
import { VACIO, fechaLegible } from "../../formatos";
import { Aviso } from "../../layout/Aviso";
import { Fila } from "../../layout/Fila";
import { Pila } from "../../layout/Pila";
import { Prosa } from "../../layout/Prosa";
import { Rejilla } from "../../layout/Rejilla";
import { mensajeDeFalla } from "../../mensajes";
import { tipoSeleccionables } from "./formulario";
import {
  AVISO_PLAN_PROPIO,
  AYUDA_DE_CARA_AL_CLIENTE,
  agregarPaso,
  esAlcanzado,
  moverPaso,
  quitarPaso,
  renombrarPaso,
  separarPlan,
  type PasoDelPlan,
} from "./plan";
import {
  AVISO_GUARDAR_NO_SINCRONIZA,
  AVISO_TIPO_NUEVO_NO_REASIGNA,
  resumenDelPlan,
  type BorradorDeGuardado,
} from "./plantilla";
import { avisoDeProcesoCerrado } from "./presentacion";

type Props = {
  readonly detalle: Detalle;
  readonly trabajando: boolean;
  /** El borrador del plan, que vive arriba junto a lo guardado. */
  readonly plan: readonly PasoDelPlan[];
  readonly setPlan: Dispatch<SetStateAction<PasoDelPlan[]>>;
  readonly sinGuardar: boolean;
  readonly fallas: readonly FallaDeValidacion[];
  readonly avisoDelPlan: string | null;
  readonly pasoNuevo: string;
  readonly setPasoNuevo: Dispatch<SetStateAction<string>>;
  readonly alAvanzar: () => void;
  readonly alGuardar: () => void;
  /* --- T-11: guardar el plan como plantilla --- */
  readonly guardado: BorradorDeGuardado;
  readonly setGuardado: Dispatch<SetStateAction<BorradorDeGuardado>>;
  readonly areas: readonly Area[];
  readonly fallasDelGuardado: readonly FallaDeValidacion[];
  readonly avisoDelGuardado: {
    tono: "neutro" | "error";
    texto: string;
  } | null;
  readonly alGuardarPlantilla: () => void;
};

export function PanelDeTrabajo({
  detalle,
  trabajando,
  plan,
  setPlan,
  sinGuardar,
  fallas,
  avisoDelPlan,
  pasoNuevo,
  setPasoNuevo,
  alAvanzar,
  alGuardar,
  guardado,
  setGuardado,
  areas,
  fallasDelGuardado,
  avisoDelGuardado,
  alGuardarPlantilla,
}: Props) {
  const { proceso } = detalle;
  const { cumplidas, pendientes: etapasPendientes } = separarPlan(
    detalle.etapas,
  );
  const terminado = proceso.estado === "cerrado";
  const avisoDelCierre = avisoDeProcesoCerrado(proceso);

  return (
    <Pila espacio="holgado">
      {avisoDelPlan !== null && <Aviso tono="error">{avisoDelPlan}</Aviso>}

      {fallas.length > 0 && (
        <Aviso tono="error">
          <ul className="lista-de-fallas">
            {fallas.map((falla) => (
              <li key={`${falla.campo}-${falla.motivo}`}>
                {mensajeDeFalla(falla.motivo)}
              </li>
            ))}
          </ul>
        </Aviso>
      )}

      {/* ---------------------------------------------------------------
          Lo cumplido. Es el registro, así que no se edita desde acá: se
          lee, con la fecha de cada paso.
          --------------------------------------------------------------- */}
      <section aria-labelledby="etapas-cumplidas">
        <Pila>
          <h2 id="etapas-cumplidas">Cumplido</h2>

          {cumplidas.length === 0 ? (
            <p className="texto-apagado">
              Todavía no se cumplió ninguna etapa de este proceso.
            </p>
          ) : (
            <ol className="plan plan--cumplido">
              {cumplidas.map((etapa) => (
                <li className="plan__paso plan__paso--cumplido" key={etapa.id}>
                  <span className="plan__nombre">{etapa.nombre}</span>
                  <span className="etiqueta">
                    {fechaLegible(etapa.alcanzadaEn ?? "")}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Pila>
      </section>

      {/* ---------------------------------------------------------------
          Lo que falta. Es el plan, así que sí se edita.
          --------------------------------------------------------------- */}
      <section aria-labelledby="etapas-pendientes">
        <Pila>
          <h2 id="etapas-pendientes">Lo que falta</h2>

          {etapasPendientes.length === 0 ? (
            <Aviso>
              {proceso.etapasTotales === 0
                ? "Este proceso no tiene plan todavía. Se le pueden agregar" +
                  " los pasos acá abajo."
                : "No queda ninguna etapa por delante. Si falta trabajo, se" +
                  " agrega un paso nuevo acá abajo."}
            </Aviso>
          ) : (
            <ol className="plan plan--pendiente">
              {etapasPendientes.map((etapa) => (
                <li className="plan__paso" key={etapa.id}>
                  <span className="plan__nombre">{etapa.nombre}</span>
                </li>
              ))}
            </ol>
          )}

          <Fila>
            <button
              type="button"
              className="boton boton--primario"
              disabled={
                trabajando || terminado || etapasPendientes.length === 0
              }
              onClick={alAvanzar}
            >
              {etapasPendientes.length === 0
                ? "Nada por avanzar"
                : `Avanzar a «${etapasPendientes[0].nombre}»`}
            </button>
          </Fila>
          <p className="campo__ayuda">
            Avanzar marca cumplida esa etapa con la fecha de hoy.{" "}
            <strong>No se puede deshacer</strong>: lo que ya pasó se queda
            registrado, igual que las notas que cuelguen de él.
          </p>
        </Pila>
      </section>

      {/* ---------------------------------------------------------------
          El editor del plan.
          --------------------------------------------------------------- */}
      <section aria-labelledby="plan-de-trabajo">
        <Pila>
          <h2 id="plan-de-trabajo">Plan de trabajo</h2>

          <Aviso>{AVISO_PLAN_PROPIO}</Aviso>
          {terminado && <Aviso>{avisoDelCierre}</Aviso>}
          <Prosa como="p" className="texto-apagado">
            {AYUDA_DE_CARA_AL_CLIENTE}
          </Prosa>

          {plan.length === 0 ? (
            <p className="texto-apagado">
              El plan está vacío. Se arma agregando pasos acá abajo.
            </p>
          ) : (
            <ol className="plantilla">
              {plan.map((paso, indice) => {
                const cumplido = esAlcanzado(paso);
                const primeroPendiente = plan.findIndex(
                  (otro) => !esAlcanzado(otro),
                );

                return (
                  <li
                    className={[
                      "plantilla__etapa",
                      cumplido ? "plantilla__etapa--cumplida" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    key={paso.id ?? `nuevo-${String(indice)}`}
                  >
                    <Fila>
                      <div className="campo campo--crecer">
                        <input
                          className="campo__control"
                          type="text"
                          aria-label={`Etapa ${String(indice + 1)}`}
                          value={paso.nombre}
                          onChange={(evento) => {
                            setPlan((anterior) =>
                              renombrarPaso(
                                anterior,
                                indice,
                                evento.target.value,
                              ),
                            );
                          }}
                        />
                      </div>
                      {cumplido ? (
                        // Una etapa cumplida no se mueve ni se quita, así que
                        // no se dibujan los botones apagados: se dice por qué.
                        <span className="etiqueta">Cumplida</span>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="boton boton--tenue"
                            aria-label={`Subir ${paso.nombre}`}
                            disabled={indice <= primeroPendiente}
                            onClick={() => {
                              setPlan((anterior) =>
                                moverPaso(anterior, indice, -1),
                              );
                            }}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="boton boton--tenue"
                            aria-label={`Bajar ${paso.nombre}`}
                            disabled={indice === plan.length - 1}
                            onClick={() => {
                              setPlan((anterior) =>
                                moverPaso(anterior, indice, 1),
                              );
                            }}
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            className="boton boton--tenue"
                            aria-label={`Quitar ${paso.nombre}`}
                            onClick={() => {
                              setPlan((anterior) =>
                                quitarPaso(anterior, indice),
                              );
                            }}
                          >
                            Quitar
                          </button>
                        </>
                      )}
                    </Fila>
                  </li>
                );
              })}
            </ol>
          )}

          <form
            onSubmit={(evento) => {
              evento.preventDefault();
              setPlan((anterior) => agregarPaso(anterior, pasoNuevo));
              setPasoNuevo("");
            }}
            noValidate
          >
            <Fila>
              <div className="campo campo--crecer">
                <label className="campo__rotulo" htmlFor="campo-paso">
                  Etapa nueva
                </label>
                <input
                  id="campo-paso"
                  className="campo__control"
                  type="text"
                  value={pasoNuevo}
                  onChange={(evento) => {
                    setPasoNuevo(evento.target.value);
                  }}
                />
              </div>
              <button type="submit" className="boton">
                Agregar etapa
              </button>
            </Fila>
          </form>

          <Fila>
            <button
              type="button"
              className="boton boton--primario"
              disabled={trabajando || terminado}
              onClick={alGuardar}
            >
              {trabajando ? "Guardando…" : "Guardar plan"}
            </button>
            {sinGuardar && (
              <span className="etiqueta" role="status">
                Hay cambios sin guardar
              </span>
            )}
          </Fila>
        </Pila>
      </section>

      {/* ---------------------------------------------------------------
          T-11 · Guardar el plan como plantilla.

          El diseño señala este camino como el que más se va a usar para
          crear una plantilla, y por eso está acá y no en Catálogos: se
          acomodan los pasos sobre la marcha y, cuando queda bien, se
          guarda para la próxima. Va en esta pestaña por lo mismo: es lo
          último que se hace con un plan que se acaba de ajustar.
          --------------------------------------------------------------- */}
      <section aria-labelledby="guardar-plantilla">
        <Pila>
          <h2 id="guardar-plantilla">Guardar como plantilla</h2>

          <Prosa como="p" className="texto-apagado">
            {resumenDelPlan(detalle.etapas.length, cumplidas.length)}
          </Prosa>

          {sinGuardar && (
            <Aviso tono="error">
              Hay cambios en el plan que no se guardaron todavía. Lo que se
              copia a la plantilla es el plan guardado, así que conviene
              apretar «Guardar plan» primero.
            </Aviso>
          )}

          {fallasDelGuardado.length > 0 && (
            <Aviso tono="error">
              <ul className="lista-de-fallas">
                {fallasDelGuardado.map((falla) => (
                  <li key={`${falla.campo}-${falla.motivo}`}>
                    {mensajeDeFalla(falla.motivo)}
                  </li>
                ))}
              </ul>
            </Aviso>
          )}

          {avisoDelGuardado !== null && (
            <Aviso tono={avisoDelGuardado.tono}>{avisoDelGuardado.texto}</Aviso>
          )}

          <fieldset className="campo">
            <legend className="campo__rotulo">A dónde se guarda</legend>

            <label className="campo__casilla">
              <input
                type="radio"
                name="destino-de-plantilla"
                value="actualizar"
                checked={guardado.destino === "actualizar"}
                onChange={() => {
                  setGuardado((anterior) => ({
                    ...anterior,
                    destino: "actualizar",
                  }));
                }}
              />
              <span>
                {`Actualizar la plantilla de «${
                  proceso.tipoProcesoNombre ?? VACIO
                }»`}
              </span>
            </label>

            <label className="campo__casilla">
              <input
                type="radio"
                name="destino-de-plantilla"
                value="nuevo"
                checked={guardado.destino === "nuevo"}
                onChange={() => {
                  setGuardado((anterior) => ({
                    ...anterior,
                    destino: "nuevo",
                  }));
                }}
              />
              <span>Crear un tipo de proceso nuevo con este plan</span>
            </label>
          </fieldset>

          {guardado.destino === "nuevo" && (
            <Rejilla minimo="16rem">
              <div className="campo">
                <label className="campo__rotulo" htmlFor="campo-area-nueva">
                  Área del tipo nuevo
                  <span className="campo__marca"> · obligatorio</span>
                </label>
                <select
                  id="campo-area-nueva"
                  className="campo__control"
                  value={guardado.areaId}
                  onChange={(evento) => {
                    setGuardado((anterior) => ({
                      ...anterior,
                      areaId: evento.target.value,
                    }));
                  }}
                >
                  <option value="">Elegir área…</option>
                  {tipoSeleccionables(areas, guardado.areaId).map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div className="campo">
                <label className="campo__rotulo" htmlFor="campo-tipo-nuevo">
                  Nombre del tipo nuevo
                  <span className="campo__marca"> · obligatorio</span>
                </label>
                <input
                  id="campo-tipo-nuevo"
                  className="campo__control"
                  type="text"
                  value={guardado.nombre}
                  onChange={(evento) => {
                    setGuardado((anterior) => ({
                      ...anterior,
                      nombre: evento.target.value,
                    }));
                  }}
                />
              </div>
            </Rejilla>
          )}

          {/* El aviso va acá, pegado al botón: es el momento en que alguien
              acaba de ajustar un plan y supone que guardarlo sincroniza
              todo. No en un manual. */}
          <Aviso>{AVISO_GUARDAR_NO_SINCRONIZA}</Aviso>
          {guardado.destino === "nuevo" && (
            <Aviso>{AVISO_TIPO_NUEVO_NO_REASIGNA}</Aviso>
          )}

          <Fila>
            <button
              type="button"
              className="boton"
              disabled={trabajando}
              onClick={alGuardarPlantilla}
            >
              Guardar como plantilla
            </button>
          </Fila>
        </Pila>
      </section>
    </Pila>
  );
}
