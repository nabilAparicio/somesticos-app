/**
 * El detalle de un proceso, con su plan de trabajo.
 *
 * Esta pantalla es el corazón del CRM, y su forma sale directo del diseño:
 * `proceso_etapa` es la **lista ordenada completa** del plan, no un puntero a
 * la etapa vigente, y «lo que viene» es la mitad del valor
 * (`docs/diseno.md` §6, «Etapas: plantilla y plan de trabajo»).
 *
 * De ahí las dos secciones separadas y no una lista con marcas de color:
 *
 *  - **Lo cumplido**, con la fecha de cada paso. Es el registro.
 *  - **Lo que falta**, que es editable. Es el plan.
 *
 * Si la pantalla mostrara solo la etapa actual, el dato estaría bien y la
 * tarea no habría cumplido su objetivo: el abogado abre un proceso para ver
 * qué tiene por delante, no solo dónde quedó.
 *
 * Tres botones y no uno, por lo mismo que en T-6: avanzar y guardar el plan
 * son dos escrituras distintas, y un botón que hace las dos tiene un estado
 * en el que hizo una.
 *
 * T-8 le colgó la **línea de tiempo**: las notas del proceso, agrupadas por
 * la etapa donde ocurrieron y en el orden del plan. Va al final y no arriba,
 * y eso también sale del diseño: «los pendientes abiertos viven arriba del
 * proceso, contados y a la vista; las notas viven en la línea de tiempo»
 * (`docs/diseno.md` §6). A las cuarenta notas, nada sería visible si todo
 * compitiera por el mismo lugar.
 *
 * Lo que todavía no está, y se nota: los pendientes (T-9).
 */
import { useEffect, useState } from "react";

import type {
  Area,
  DetalleDeProceso as Detalle,
  FallaDeValidacion,
  TramoDeLineaDeTiempo,
} from "../../../worker/contract";
import { VACIO, fechaLegible } from "../../formatos";
import { Aviso } from "../../layout/Aviso";
import { Enlace } from "../../layout/Enlace";
import { Fila } from "../../layout/Fila";
import { Pila } from "../../layout/Pila";
import { Prosa } from "../../layout/Prosa";
import { Rejilla } from "../../layout/Rejilla";
import { mensajeDeFalla } from "../../mensajes";
import { enlaceDe } from "../../ruteo";
import { cargarAreas } from "../catalogos/api";
import {
  anotar,
  avanzarEtapa,
  cargarLineaDeTiempo,
  cargarProceso,
  guardarComoPlantilla,
  guardarPlan,
  textoDeProblema,
} from "./api";
import { tipoSeleccionables } from "./formulario";
import {
  AVISO_NOTA_INMUTABLE,
  BORRADOR_DE_NOTA_VACIO,
  aPeticionDeNota,
  etapaVigenteDe,
  opcionesDeEtapa,
  resumenDeLaLinea,
  validarNota,
  type BorradorDeNota,
} from "./notas";
import {
  AVISO_GUARDAR_NO_SINCRONIZA,
  AVISO_TIPO_NUEVO_NO_REASIGNA,
  BORRADOR_DE_GUARDADO_VACIO,
  aPeticionDeGuardado,
  resumenDelPlan,
  validarGuardado,
  type BorradorDeGuardado,
} from "./plantilla";
import {
  AVISO_PLAN_PROPIO,
  AYUDA_DE_CARA_AL_CLIENTE,
  agregarPaso,
  aPeticionDePlan,
  esAlcanzado,
  moverPaso,
  planDe,
  quitarPaso,
  renombrarPaso,
  separarPlan,
  validarPlan,
  type PasoDelPlan,
} from "./plan";
import { avanceDe, proximoPaso } from "./presentacion";

type Props = {
  readonly id: string;
};

type Estado =
  | { fase: "cargando" }
  | { fase: "listo"; detalle: Detalle }
  | { fase: "problema"; mensaje: string };

function Dato({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="definicion">
      <dt className="definicion__rotulo">{rotulo}</dt>
      <dd className="definicion__valor">{valor}</dd>
    </div>
  );
}

export function DetalleDeProceso({ id }: Props) {
  const [estado, setEstado] = useState<Estado>({ fase: "cargando" });
  const [plan, setPlan] = useState<PasoDelPlan[]>([]);
  const [pasoNuevo, setPasoNuevo] = useState("");
  const [fallas, setFallas] = useState<FallaDeValidacion[]>([]);
  const [avisoDelPlan, setAvisoDelPlan] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  /* --- T-11: guardar el plan como plantilla ---------------------------- */
  const [guardado, setGuardado] = useState<BorradorDeGuardado>(
    BORRADOR_DE_GUARDADO_VACIO,
  );
  const [areas, setAreas] = useState<Area[]>([]);
  const [fallasDelGuardado, setFallasDelGuardado] = useState<
    FallaDeValidacion[]
  >([]);
  const [avisoDelGuardado, setAvisoDelGuardado] = useState<
    { tono: "neutro" | "error"; texto: string } | null
  >(null);

  /* --- T-8: las notas y su línea de tiempo ----------------------------- */
  const [tramos, setTramos] = useState<TramoDeLineaDeTiempo[]>([]);
  const [nota, setNota] = useState<BorradorDeNota>(BORRADOR_DE_NOTA_VACIO);
  const [fallasDeLaNota, setFallasDeLaNota] = useState<FallaDeValidacion[]>(
    [],
  );
  const [avisoDeLaNota, setAvisoDeLaNota] = useState<string | null>(null);

  useEffect(() => {
    const control = new AbortController();

    void cargarProceso(id, control.signal).then((resultado) => {
      if (control.signal.aborted) return;

      if (resultado.estado !== "ok") {
        setEstado({
          fase: "problema",
          mensaje: textoDeProblema(resultado),
        });
        return;
      }

      setEstado({ fase: "listo", detalle: resultado.valor });
      setPlan(planDe(resultado.valor.etapas));
    });

    return () => {
      control.abort();
    };
  }, [id]);

  /**
   * La línea de tiempo va en su propia petición y no dentro del detalle: el
   * detalle lo pide todo el mundo —el listado navega ahí— y la línea crece
   * sin techo mientras el proceso corre.
   */
  useEffect(() => {
    const control = new AbortController();

    void cargarLineaDeTiempo(id, control.signal).then((resultado) => {
      if (control.signal.aborted) return;
      if (resultado.estado === "ok") setTramos(resultado.valor.tramos);
    });

    return () => {
      control.abort();
    };
  }, [id]);

  /**
   * Las áreas solo se piden cuando hacen falta: el destino por defecto
   * —actualizar la plantilla del tipo que el proceso ya tiene— no las usa, y
   * ésa va a ser la mayoría de las veces.
   */
  useEffect(() => {
    if (guardado.destino !== "nuevo") return undefined;

    const control = new AbortController();

    void cargarAreas(control.signal).then((resultado) => {
      if (control.signal.aborted) return;
      if (resultado.estado === "ok") setAreas(resultado.valor);
    });

    return () => {
      control.abort();
    };
  }, [guardado.destino]);

  /** Lo que el servidor dejó guardado manda sobre lo que la pantalla creía. */
  function asentar(detalle: Detalle) {
    setEstado({ fase: "listo", detalle });
    setPlan(planDe(detalle.etapas));
  }

  async function guardar() {
    if (trabajando) return;

    const previas = validarPlan(plan);
    setFallas(previas);
    setAvisoDelPlan(null);
    if (previas.length > 0) return;

    setTrabajando(true);
    const resultado = await guardarPlan(id, aPeticionDePlan(plan));
    setTrabajando(false);

    if (resultado.estado === "invalido") {
      setFallas(resultado.fallas);
      return;
    }
    if (resultado.estado !== "ok") {
      setAvisoDelPlan(textoDeProblema(resultado, "ese plan"));
      return;
    }

    asentar(resultado.valor);
  }

  async function avanzar() {
    if (trabajando) return;

    setFallas([]);
    setAvisoDelPlan(null);
    setTrabajando(true);
    const resultado = await avanzarEtapa(id);
    setTrabajando(false);

    if (resultado.estado !== "ok") {
      setAvisoDelPlan(textoDeProblema(resultado, "ese proceso"));
      return;
    }

    asentar(resultado.valor);
  }

  /**
   * Guardar el plan como plantilla.
   *
   * Lo que se copia es **lo que está guardado**, no el borrador que se está
   * editando en pantalla: el servidor lee `proceso_etapa`. Si hay cambios
   * sin guardar, la pantalla lo dice en vez de copiar algo que nadie guardó.
   */
  async function guardarPlantilla(pasos: number) {
    if (trabajando) return;

    const previas = validarGuardado(guardado, pasos);
    setFallasDelGuardado(previas);
    setAvisoDelGuardado(null);
    if (previas.length > 0) return;

    setTrabajando(true);
    const resultado = await guardarComoPlantilla(
      id,
      aPeticionDeGuardado(guardado),
    );
    setTrabajando(false);

    if (resultado.estado === "invalido") {
      setFallasDelGuardado(resultado.fallas);
      return;
    }
    if (resultado.estado !== "ok") {
      setAvisoDelGuardado({
        tono: "error",
        texto: textoDeProblema(resultado, "ese tipo de proceso"),
      });
      return;
    }

    const pasosGuardados = resultado.valor.etapas.length;
    setGuardado(BORRADOR_DE_GUARDADO_VACIO);
    setAvisoDelGuardado({
      tono: "neutro",
      texto:
        `La plantilla quedó guardada en «${resultado.valor.tipo.nombre}»` +
        ` con ${String(pasosGuardados)} pasos. Este proceso y los demás ya` +
        " abiertos siguen con el plan que tenían.",
    });
  }

  /**
   * Anota un hecho.
   *
   * El borrador se vacía **solo si el servidor la guardó**: una nota no se
   * puede volver a escribir desde el historial del navegador, así que perder
   * el texto por un 403 sería perderlo de verdad.
   */
  async function escribirNota(etapas: readonly Detalle["etapas"][number][]) {
    if (trabajando) return;

    const previas = validarNota(nota, etapas);
    setFallasDeLaNota(previas);
    setAvisoDeLaNota(null);
    if (previas.length > 0) return;

    setTrabajando(true);
    const resultado = await anotar(id, aPeticionDeNota(nota));
    setTrabajando(false);

    if (resultado.estado === "invalido") {
      setFallasDeLaNota(resultado.fallas);
      return;
    }
    if (resultado.estado !== "ok") {
      setAvisoDeLaNota(textoDeProblema(resultado));
      return;
    }

    setTramos(resultado.valor.tramos);
    setNota(BORRADOR_DE_NOTA_VACIO);
  }

  if (estado.fase === "cargando") return <p>Consultando…</p>;

  if (estado.fase === "problema") {
    return (
      <Pila>
        <Aviso tono="error">{estado.mensaje}</Aviso>
        <p>
          <Enlace href={enlaceDe({ nombre: "procesos" })}>
            Volver a procesos
          </Enlace>
        </p>
      </Pila>
    );
  }

  const { proceso } = estado.detalle;
  const { cumplidas, pendientes } = separarPlan(estado.detalle.etapas);
  /* El borrador tiene cambios sin guardar respecto de lo que está en la base. */
  const sinGuardar =
    JSON.stringify(aPeticionDePlan(plan)) !==
    JSON.stringify(aPeticionDePlan(planDe(estado.detalle.etapas)));

  return (
    <Pila espacio="holgado">
      <header>
        <Pila espacio="ceñido">
          <p className="texto-apagado">
            <Enlace href={enlaceDe({ nombre: "procesos" })}>Procesos</Enlace>
          </p>
          <h1>{proceso.titulo}</h1>
        </Pila>
      </header>

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
          <Dato rotulo="Abierto" valor={fechaLegible(proceso.abiertoEn)} />
        </dl>
      </Rejilla>

      <p>
        <Enlace href={enlaceDe({ nombre: "cliente", id: proceso.clienteId })}>
          Ver el cliente
        </Enlace>
      </p>

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

          {pendientes.length === 0 ? (
            <Aviso>
              {proceso.etapasTotales === 0
                ? "Este proceso no tiene plan todavía. Se le pueden agregar" +
                  " los pasos acá abajo."
                : "No queda ninguna etapa por delante. Si falta trabajo, se" +
                  " agrega un paso nuevo acá abajo."}
            </Aviso>
          ) : (
            <ol className="plan plan--pendiente">
              {pendientes.map((etapa) => (
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
              disabled={trabajando || pendientes.length === 0}
              onClick={() => {
                void avanzar();
              }}
            >
              {pendientes.length === 0
                ? "Nada por avanzar"
                : `Avanzar a «${pendientes[0].nombre}»`}
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
              disabled={trabajando}
              onClick={() => {
                void guardar();
              }}
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
          guarda para la próxima.
          --------------------------------------------------------------- */}
      <section aria-labelledby="guardar-plantilla">
        <Pila>
          <h2 id="guardar-plantilla">Guardar como plantilla</h2>

          <Prosa como="p" className="texto-apagado">
            {resumenDelPlan(estado.detalle.etapas.length, cumplidas.length)}
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
              onClick={() => {
                void guardarPlantilla(estado.detalle.etapas.length);
              }}
            >
              Guardar como plantilla
            </button>
          </Fila>
        </Pila>
      </section>

      {/* ---------------------------------------------------------------
          T-8 · La línea de tiempo.

          Va al final: «los pendientes abiertos viven arriba del proceso,
          contados y a la vista; las notas viven en la línea de tiempo»
          (`docs/diseno.md` §6). Las notas se leen cuando se las busca; lo
          que no se puede perder de vista es otra cosa.
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
              void escribirNota(estado.detalle.etapas);
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
                  disabled={estado.detalle.etapas.length === 0}
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
                    {etapaVigenteDe(estado.detalle.etapas) === null
                      ? "Este proceso no tiene etapas todavía"
                      : `Donde está el proceso hoy: «${
                          etapaVigenteDe(estado.detalle.etapas)?.nombre ?? ""
                        }»`}
                  </option>
                  {opcionesDeEtapa(estado.detalle.etapas).map((opcion) => (
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
