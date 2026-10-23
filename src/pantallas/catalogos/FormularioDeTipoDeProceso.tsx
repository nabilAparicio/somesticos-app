/**
 * El alta y la edición de un tipo de proceso, con su plantilla de etapas.
 *
 * Dos decisiones de pantalla que conviene dejar escritas:
 *
 *  1. **El aviso de que la plantilla no es retroactiva está acá, arriba de la
 *     plantilla.** El diseño lo pide textualmente: «es contraintuitivo, así
 *     que la interfaz lo dice en el lugar donde se edita la plantilla, no en
 *     un manual que nadie lee» (`docs/diseno.md` §6). El texto vive en
 *     `plantilla.ts` para que una prueba pueda afirmarlo.
 *  2. **La plantilla aparece recién cuando el tipo existe.** Las etapas
 *     cuelgan del tipo por llave foránea, así que en el alta no hay de qué
 *     colgarlas: guardar las dos cosas en un alta serían dos escrituras con
 *     una forma de quedar a medias. Se guarda el tipo, y la misma pantalla
 *     vuelve con la plantilla disponible.
 *
 * Guardar el tipo y guardar la plantilla son dos botones y no uno, por lo
 * mismo: son dos recursos, y un botón que escribe dos cosas tiene un estado
 * en el que escribió una.
 */
import { useEffect, useState, type FormEvent } from "react";

import type { Area, FallaDeValidacion } from "../../../worker/contract";
import { Aviso } from "../../layout/Aviso";
import { Enlace } from "../../layout/Enlace";
import { Fila } from "../../layout/Fila";
import { Pila } from "../../layout/Pila";
import { Prosa } from "../../layout/Prosa";
import { Rejilla } from "../../layout/Rejilla";
import { mensajeDeFalla } from "../../mensajes";
import { navegarA } from "../../navegacion";
import { enlaceDe } from "../../ruteo";
import { Bitacora, type EstadoDeBitacora } from "../Bitacora";
import {
  borrarTipoProceso,
  cargarAreas,
  cargarBitacoraDeTipoProceso,
  cargarEtapas,
  cargarTipoProceso,
  guardarEtapas,
  guardarTipoProceso,
  textoDeProblema,
} from "./api";
import {
  BORRADOR_DE_TIPO_VACIO,
  aPeticionDeTipoProceso,
  areasSeleccionables,
  borradorDeTipoProceso,
  mensajeDeBloqueo,
  validarTipoProceso,
  type BorradorDeTipoProceso,
} from "./formulario";
import {
  AVISO_PLANTILLA_NO_RETROACTIVA,
  agregarEtapa,
  aPeticionDeEtapas,
  borradorDeEtapas,
  moverEtapa,
  quitarEtapa,
  renombrarEtapa,
  validarEtapas,
  type BorradorDeEtapa,
} from "./plantilla";
import { ordenarCatalogo } from "./presentacion";

type Props = {
  /** Sin esto es un alta; con esto, la edición de ese tipo. */
  readonly tipoId?: string;
};

type Carga =
  | { fase: "cargando" }
  | { fase: "listo" }
  | { fase: "problema"; mensaje: string };

const SUJETO = "ese tipo de proceso";

export function FormularioDeTipoDeProceso({ tipoId }: Props) {
  const editando = tipoId !== undefined;

  const [borrador, setBorrador] = useState<BorradorDeTipoProceso>(
    BORRADOR_DE_TIPO_VACIO,
  );
  const [areas, setAreas] = useState<Area[]>([]);
  const [carga, setCarga] = useState<Carga>({ fase: "cargando" });
  const [fallas, setFallas] = useState<FallaDeValidacion[]>([]);
  const [problema, setProblema] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const [etapas, setEtapas] = useState<BorradorDeEtapa[]>([]);
  const [etapaNueva, setEtapaNueva] = useState("");
  const [fallasDeEtapas, setFallasDeEtapas] = useState<FallaDeValidacion[]>([]);
  const [avisoDePlantilla, setAvisoDePlantilla] = useState<string | null>(null);

  /**
   * T-15 · La historia del tipo. Acá va montada entera y no desplegable,
   * al revés que en la lista de áreas: el tipo de proceso **sí** tiene
   * pantalla propia, así que es el mismo trato que le dan el detalle del
   * cliente y el del proceso.
   */
  const [bitacora, setBitacora] = useState<EstadoDeBitacora>({
    fase: "cargando",
  });

  useEffect(() => {
    const control = new AbortController();

    async function cargar() {
      const resultadoDeAreas = await cargarAreas(control.signal);
      if (control.signal.aborted) return;

      if (resultadoDeAreas.estado !== "ok") {
        // Acá sí bloquea, al revés que el catálogo de tipos de cliente en
        // T-5: un tipo de proceso SIN área no existe, así que un formulario
        // sin áreas no puede guardar nada.
        setCarga({
          fase: "problema",
          mensaje: textoDeProblema(resultadoDeAreas, "esa área"),
        });
        return;
      }
      setAreas(resultadoDeAreas.valor);

      if (tipoId === undefined) {
        setCarga({ fase: "listo" });
        return;
      }

      const tipo = await cargarTipoProceso(tipoId, control.signal);
      if (control.signal.aborted) return;

      if (tipo.estado !== "ok") {
        setCarga({ fase: "problema", mensaje: textoDeProblema(tipo, SUJETO) });
        return;
      }
      setBorrador(borradorDeTipoProceso(tipo.valor));

      const plan = await cargarEtapas(tipoId, control.signal);
      if (control.signal.aborted) return;

      if (plan.estado === "ok") {
        setEtapas(borradorDeEtapas(plan.valor));
      } else {
        setAvisoDePlantilla(textoDeProblema(plan, "esa plantilla"));
      }

      setCarga({ fase: "listo" });
    }

    void cargar();

    return () => {
      control.abort();
    };
  }, [tipoId]);

  /**
   * La bitácora, en su propia petición y **solo en la edición**: un tipo
   * que todavía no existe no tiene historia, y pedirla daría un 404 dibujado
   * como aviso de error en una pantalla que está perfectamente bien.
   *
   * No bloquea: si no llega, el formulario se sigue usando. Lo que no se
   * puede perder es la plantilla, no el registro de quién la tocó.
   */
  useEffect(() => {
    if (tipoId === undefined) return undefined;

    const control = new AbortController();

    void cargarBitacoraDeTipoProceso(tipoId, control.signal).then(
      (resultado) => {
        if (control.signal.aborted) return;

        setBitacora(
          resultado.estado === "ok"
            ? { fase: "listo", entradas: resultado.valor }
            : { fase: "problema", mensaje: textoDeProblema(resultado, SUJETO) },
        );
      },
    );

    return () => {
      control.abort();
    };
  }, [tipoId]);

  function cambiar(campo: keyof BorradorDeTipoProceso, valor: string) {
    setBorrador((anterior) => ({ ...anterior, [campo]: valor }));
  }

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (guardando) return;

    const previas = validarTipoProceso(borrador);
    setFallas(previas);
    setProblema(null);
    if (previas.length > 0) return;

    setGuardando(true);
    const resultado = await guardarTipoProceso(
      tipoId ?? null,
      aPeticionDeTipoProceso(borrador),
    );
    setGuardando(false);

    if (resultado.estado === "invalido") {
      setFallas(resultado.fallas);
      return;
    }
    if (resultado.estado !== "ok") {
      setProblema(textoDeProblema(resultado, SUJETO));
      return;
    }

    navegarA(enlaceDe({ nombre: "tipo-proceso", id: resultado.valor.id }));
  }

  async function guardarPlantilla() {
    if (tipoId === undefined || guardando) return;

    const previas = validarEtapas(etapas);
    setFallasDeEtapas(previas);
    setAvisoDePlantilla(null);
    if (previas.length > 0) return;

    setGuardando(true);
    const resultado = await guardarEtapas(tipoId, aPeticionDeEtapas(etapas));
    setGuardando(false);

    if (resultado.estado === "invalido") {
      setFallasDeEtapas(resultado.fallas);
      return;
    }
    if (resultado.estado !== "ok") {
      setAvisoDePlantilla(textoDeProblema(resultado, "esa plantilla"));
      return;
    }

    // Relee lo que el servidor dejó guardado, con sus identificadores y su
    // orden: las etapas nuevas vuelven con id, y sin esto el siguiente
    // guardado las crearía otra vez.
    setEtapas(borradorDeEtapas(resultado.valor));
  }

  async function eliminar() {
    if (tipoId === undefined || guardando) return;

    setProblema(null);
    setGuardando(true);
    const resultado = await borrarTipoProceso(tipoId);
    setGuardando(false);

    if (resultado.estado === "conflicto") {
      setProblema(mensajeDeBloqueo(resultado.bloqueo, borrador.nombre));
      return;
    }
    if (resultado.estado !== "ok") {
      setProblema(textoDeProblema(resultado, SUJETO));
      return;
    }

    navegarA(enlaceDe({ nombre: "tipos-proceso" }));
  }

  if (carga.fase === "cargando") return <p>Consultando…</p>;

  if (carga.fase === "problema") {
    return (
      <Pila>
        <Aviso tono="error">{carga.mensaje}</Aviso>
        <p>
          <Enlace href={enlaceDe({ nombre: "tipos-proceso" })}>
            Volver a tipos de proceso
          </Enlace>
        </p>
      </Pila>
    );
  }

  const seleccionables = ordenarCatalogo(
    areasSeleccionables(areas, borrador.areaId),
  );

  return (
    <Pila espacio="holgado">
      <header>
        <Pila espacio="ceñido">
          <p className="texto-apagado">
            <Enlace href={enlaceDe({ nombre: "tipos-proceso" })}>
              Tipos de proceso
            </Enlace>
          </p>
          <h1>{editando ? "Editar tipo de proceso" : "Nuevo tipo de proceso"}</h1>
          <Prosa como="p" className="texto-apagado">
            Conviene que sea granular: una visa de trabajo y una de pensionado
            no tienen los mismos pasos, así que son dos tipos y no uno con
            variantes.
          </Prosa>
        </Pila>
      </header>

      {problema !== null && <Aviso tono="error">{problema}</Aviso>}

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

      <form onSubmit={(evento) => void enviar(evento)} noValidate>
        <Pila espacio="holgado">
          <Rejilla minimo="16rem">
            <div className="campo">
              <label className="campo__rotulo" htmlFor="campo-nombre">
                Nombre
                <span className="campo__marca"> · obligatorio</span>
              </label>
              <input
                id="campo-nombre"
                className="campo__control"
                type="text"
                value={borrador.nombre}
                onChange={(evento) => {
                  cambiar("nombre", evento.target.value);
                }}
              />
            </div>

            <div className="campo">
              <label className="campo__rotulo" htmlFor="campo-areaId">
                Área
                <span className="campo__marca"> · obligatoria</span>
              </label>
              <select
                id="campo-areaId"
                className="campo__control"
                value={borrador.areaId}
                onChange={(evento) => {
                  cambiar("areaId", evento.target.value);
                }}
              >
                <option value="">Elegir área…</option>
                {seleccionables.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.nombre}
                  </option>
                ))}
              </select>
              {seleccionables.length === 0 && (
                <p className="campo__ayuda">
                  No hay áreas todavía. Hay que crear una en Catálogos antes
                  de poder guardar un tipo de proceso.
                </p>
              )}
            </div>
          </Rejilla>

          <div className="campo">
            <label className="campo__rotulo" htmlFor="campo-descripcion">
              Descripción
              <span className="campo__marca campo__marca--tenue">
                {" "}
                · opcional
              </span>
            </label>
            <textarea
              id="campo-descripcion"
              className="campo__control campo__control--prosa"
              rows={3}
              value={borrador.descripcion}
              onChange={(evento) => {
                cambiar("descripcion", evento.target.value);
              }}
            />
          </div>

          <label className="campo__casilla">
            <input
              type="checkbox"
              checked={borrador.activo}
              onChange={(evento) => {
                setBorrador((anterior) => ({
                  ...anterior,
                  activo: evento.target.checked,
                }));
              }}
            />
            Vigente — se puede elegir al abrir procesos nuevos
          </label>

          <Fila>
            <button
              type="submit"
              className="boton boton--primario"
              disabled={guardando}
            >
              {guardando ? "Guardando…" : "Guardar tipo"}
            </button>
            <Enlace
              href={enlaceDe({ nombre: "tipos-proceso" })}
              className="boton boton--tenue"
            >
              Cancelar
            </Enlace>
            {editando && (
              <button
                type="button"
                className="boton boton--tenue"
                disabled={guardando}
                onClick={() => {
                  void eliminar();
                }}
              >
                Borrar tipo
              </button>
            )}
          </Fila>
        </Pila>
      </form>

      <section aria-labelledby="plantilla-de-etapas">
        <Pila>
          <h2 id="plantilla-de-etapas">Plantilla de etapas</h2>

          <Aviso>{AVISO_PLANTILLA_NO_RETROACTIVA}</Aviso>

          {!editando ? (
            <p className="texto-apagado">
              La plantilla se carga después de guardar el tipo: las etapas
              cuelgan de él.
            </p>
          ) : (
            <>
              {avisoDePlantilla !== null && (
                <Aviso tono="error">{avisoDePlantilla}</Aviso>
              )}

              {fallasDeEtapas.length > 0 && (
                <Aviso tono="error">
                  <ul className="lista-de-fallas">
                    {fallasDeEtapas.map((falla) => (
                      <li key={`${falla.campo}-${falla.motivo}`}>
                        {mensajeDeFalla(falla.motivo)}
                      </li>
                    ))}
                  </ul>
                </Aviso>
              )}

              <p className="texto-apagado">
                Los nombres de etapa los va a leer el cliente: se escriben
                para alguien de afuera del bufete.
              </p>

              {etapas.length === 0 ? (
                <Aviso>
                  Esta plantilla está vacía. Un proceso que nazca de este tipo
                  arranca sin pasos.
                </Aviso>
              ) : (
                <ol className="plantilla">
                  {etapas.map((etapa, indice) => (
                    <li
                      className="plantilla__etapa"
                      key={etapa.id ?? `nueva-${String(indice)}`}
                    >
                      <Fila>
                        <div className="campo campo--crecer">
                          <input
                            className="campo__control"
                            type="text"
                            aria-label={`Etapa ${String(indice + 1)}`}
                            value={etapa.nombre}
                            onChange={(evento) => {
                              setEtapas((anterior) =>
                                renombrarEtapa(
                                  anterior,
                                  indice,
                                  evento.target.value,
                                ),
                              );
                            }}
                          />
                        </div>
                        <button
                          type="button"
                          className="boton boton--tenue"
                          aria-label={`Subir ${etapa.nombre}`}
                          disabled={indice === 0}
                          onClick={() => {
                            setEtapas((anterior) =>
                              moverEtapa(anterior, indice, -1),
                            );
                          }}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="boton boton--tenue"
                          aria-label={`Bajar ${etapa.nombre}`}
                          disabled={indice === etapas.length - 1}
                          onClick={() => {
                            setEtapas((anterior) =>
                              moverEtapa(anterior, indice, 1),
                            );
                          }}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className="boton boton--tenue"
                          aria-label={`Quitar ${etapa.nombre}`}
                          onClick={() => {
                            setEtapas((anterior) =>
                              quitarEtapa(anterior, indice),
                            );
                          }}
                        >
                          Quitar
                        </button>
                      </Fila>
                    </li>
                  ))}
                </ol>
              )}

              <form
                onSubmit={(evento) => {
                  evento.preventDefault();
                  setEtapas((anterior) => agregarEtapa(anterior, etapaNueva));
                  setEtapaNueva("");
                }}
                noValidate
              >
                <Fila>
                  <div className="campo campo--crecer">
                    <label className="campo__rotulo" htmlFor="campo-etapa">
                      Etapa nueva
                    </label>
                    <input
                      id="campo-etapa"
                      className="campo__control"
                      type="text"
                      value={etapaNueva}
                      onChange={(evento) => {
                        setEtapaNueva(evento.target.value);
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
                  disabled={guardando}
                  onClick={() => {
                    void guardarPlantilla();
                  }}
                >
                  Guardar plantilla
                </button>
              </Fila>
            </>
          )}
        </Pila>
      </section>

      {/* Solo en la edición: en el alta no hay de qué contar la historia. */}
      {editando && (
        <Bitacora estado={bitacora} id="bitacora-del-tipo-de-proceso" />
      )}
    </Pila>
  );
}
