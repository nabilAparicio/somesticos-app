/**
 * La pestaña «Trabajo»: el plan del proceso y lo que se hace con él.
 *
 * Ver y editar van juntos **por decisión del usuario**: «es algo que pasa
 * seguido y por ende debe estar integrado en el avance». Agregar o borrar
 * un paso ocurre mientras el expediente corre —el juez pide algo que nadie
 * previó—, así que separar «Avance» de «Plan» en dos pestañas obligaría a
 * cambiar de lugar justo en el medio del trabajo.
 *
 * **T-2 fundió las tres listas en una.** Hasta T-1 las etapas se dibujaban
 * tres veces —«Cumplido», «Lo que falta» y «Plan de trabajo» eran las
 * mismas filas de `proceso_etapa` con tres encabezados distintos—, y eso
 * es lo que hacía de la pantalla «una gran lista grande» donde cuesta ver
 * y configurar. Ahora es **una sola lista en orden**: cada paso muestra su
 * estado y se edita en el lugar.
 *
 * ## Lo que la fusión NO cambió
 *
 * Qué se permite sobre un paso ya cumplido. La regla estaba repartida
 * entre `plan.ts` y `AVISO_PLAN_PROPIO`, y es la misma de antes:
 * **renombrar sí, mover y quitar no**. Renombrar está permitido a
 * propósito —el nombre es texto de cara al cliente y corregir una errata
 * no borra el hecho ni deja una nota huérfana—; lo que la regla protege es
 * la existencia y el lugar del paso, que es el registro de lo que pasó.
 *
 * Las dos vistas de antes no se contradecían, aunque lo pareciera: la
 * sección «Cumplido» era **el registro dibujado**, no un editor que
 * prohibiera renombrar, y el único editor que había —«Plan de trabajo»—
 * ya mostraba las cumplidas con su campo de texto y sin los botones de
 * orden ni de quitar. La lista única es esa misma, con la fecha que antes
 * sólo estaba en el registro.
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
import { VACIO } from "../../formatos";
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
  avanceDelPlan,
  esAlcanzado,
  marcaDeCumplida,
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
  /* Del plan **guardado**, no del borrador: son las dos preguntas que se
     le hacen a lo que está en la base —qué etapa va a marcar el servidor y
     cuántos pasos cumplidos cuenta el resumen de la plantilla—. */
  const { cumplidas, pendientes: etapasPendientes } = separarPlan(
    detalle.etapas,
  );
  const terminado = proceso.estado === "cerrado";

  const avance = avanceDelPlan({
    proxima: etapasPendientes[0]?.nombre ?? null,
    cerrado: terminado,
    sinGuardar,
    trabajando,
  });

  /* El primer paso que todavía falta, en el borrador: es el tope hacia
     arriba del botón «Subir», porque por encima sólo hay registro. */
  const primeroPendiente = plan.findIndex((paso) => !esAlcanzado(paso));
  /* Con el plan entero cumplido no hay nada por delante, y la lista no
     queda vacía —muestra el registro—, así que hace falta decirlo y decir
     la salida. Se mira el **borrador**: quien acaba de agregar un paso ya
     tiene algo por delante aunque no lo haya guardado.

     Con el proceso cerrado no se dice, y no es por ahorrar un renglón: la
     salida que ofrece —agregar un paso— no existe ahí, y el aviso del
     cierre ya explica qué se puede y qué no. Prometer una puerta cerrada
     es peor que no decir nada. */
  const todoCumplido = !terminado && plan.length > 0 && plan.every(esAlcanzado);

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
          El plan, en una sola lista.

          Hasta T-1 esto eran tres secciones con las mismas filas de
          `proceso_etapa`: «Cumplido» las leía, «Lo que falta» las leía
          otra vez y «Plan de trabajo» las editaba. Tres copias del mismo
          dato es lo que obligaba a recorrer la pantalla entera para saber
          en qué va un expediente, y es literalmente lo que el usuario
          describió como «una gran lista grande».

          Ahora el orden **es** el dato —por eso sigue siendo un `<ol>`, y
          el número que pone el navegador es el número de paso— y cada
          renglón dice su estado al lado de su nombre. Lo cumplido no se
          distingue sólo por color: lleva la barra del acento a la
          izquierda, el rótulo con la fecha, y **no tiene** los botones de
          orden ni de quitar.
          --------------------------------------------------------------- */}
      <section aria-labelledby="plan-de-trabajo">
        <Pila>
          <h2 id="plan-de-trabajo">Plan de trabajo</h2>

          <Aviso>{AVISO_PLAN_PROPIO}</Aviso>
          {/* El aviso del proceso cerrado **no** se repite acá. Lo dibuja la
              cabecera, que está tres centímetros más arriba y en las cuatro
              pestañas, y era exactamente el mismo texto: con la sección
              «Estado del proceso» en el medio costaba verlo, y con el
              cierre subido al título quedaron los dos carteles idénticos
              uno debajo del otro. Un aviso repetido es un aviso que se
              aprende a saltear. */}
          <Prosa como="p" className="texto-apagado">
            {AYUDA_DE_CARA_AL_CLIENTE}
          </Prosa>

          {plan.length === 0 ? (
            <Aviso>
              Este proceso no tiene plan todavía. Se le pueden agregar los
              pasos acá abajo.
            </Aviso>
          ) : (
            <ol className="plantilla">
              {plan.map((paso, indice) => {
                /* La marca es una sola lectura, y de ella cuelgan las dos
                   mitades del renglón: el rótulo con la fecha y la ausencia
                   de los botones. Preguntar dos veces —una por el texto y
                   otra por los controles— serían dos guardas del mismo
                   hecho, y quitar cualquiera dejaría la otra sin verificar. */
                const marca = marcaDeCumplida(paso);

                return (
                  <li
                    className={[
                      "plantilla__etapa",
                      marca !== null ? "plantilla__etapa--cumplida" : "",
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
                      {marca !== null ? (
                        /* Un paso cumplido se renombra —el nombre lo lee el
                           cliente y una errata se corrige— pero no se mueve
                           ni se quita: eso es el registro. Los botones no se
                           dibujan apagados, que sería prometer que existen:
                           en su lugar va la marca, que dice por qué. */
                        <span className="etiqueta">{marca}</span>
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

          {todoCumplido && (
            <Aviso>
              No queda ninguna etapa por delante. Si falta trabajo, se agrega
              un paso nuevo acá abajo.
            </Aviso>
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

          {/* -------------------------------------------------------------
              Avanzar va **debajo de guardar**, y no es maquetado.

              El servidor marca cumplida la próxima pendiente del plan que
              él tiene, así que avanzar con el borrador a medio editar
              firmaría como hecha una etapa distinta de la que se está
              mirando. La guarda apaga el botón y dice por qué; el orden en
              pantalla pone la salida —«Guardar plan»— antes que la puerta
              cerrada.
              ------------------------------------------------------------- */}
          <Fila>
            {/* Plain `boton` y no `boton--primario`, que es lo que era
                cuando vivía en una sección aparte. Juntos, dos botones
                oscuros pegados no destacan: destacan los dos, que es lo
                mismo que ninguno. El realce de esta pantalla se lo queda
                «Guardar plan», que es el envío de esta sección —la regla
                que el resto del proyecto ya sigue: uno por formulario—, y
                avanzar queda del lado de «Cerrar el proceso», que también
                es plano siendo la acción más consecuente de la pantalla.
                Un cambio de estado que no se deshace no tiene por qué ser
                además el botón que más llama. */}
            <button
              type="button"
              className="boton"
              disabled={!avance.habilitado}
              onClick={alAvanzar}
            >
              {avance.rotulo}
            </button>
          </Fila>
          {avance.impedimento !== null && (
            <Aviso tono="error">{avance.impedimento}</Aviso>
          )}
          <p className="campo__ayuda">
            Avanzar marca cumplida esa etapa con la fecha de hoy.{" "}
            <strong>No se puede deshacer</strong>: lo que ya pasó se queda
            registrado, igual que las notas que cuelguen de él.
          </p>
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
