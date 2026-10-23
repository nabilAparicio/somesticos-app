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
 * Lo que todavía no está, y se nota: las notas (T-8) y los pendientes (T-9).
 * Esta pantalla es el lugar donde van a colgar.
 */
import { useEffect, useState } from "react";

import type {
  DetalleDeProceso as Detalle,
  FallaDeValidacion,
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
import {
  avanzarEtapa,
  cargarProceso,
  guardarPlan,
  textoDeProblema,
} from "./api";
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
    </Pila>
  );
}
