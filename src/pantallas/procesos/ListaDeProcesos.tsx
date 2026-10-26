/**
 * El listado de procesos del bufete.
 *
 * Es tabular, así que va dentro de `ContenedorDeTabla`: el desbordamiento
 * vive dentro del envoltorio y la página no scrollea en horizontal
 * (`docs/diseno.md` §9). El filtro es del navegador y no del servidor, igual
 * que en clientes: el bufete son dos personas y la cartera cabe entera en
 * una respuesta.
 *
 * La columna que justifica esta pantalla es **«Lo que viene»**. El listado
 * no está para decir dónde quedó cada proceso sino qué hay que hacer, y esa
 * columna es la respuesta a la pregunta con la que el bufete abre la
 * aplicación.
 */
import { useEffect, useMemo, useState } from "react";

import type { Proceso } from "../../../worker/contract";
import { Aviso } from "../../layout/Aviso";
import { ContenedorDeTabla } from "../../layout/ContenedorDeTabla";
import { Enlace } from "../../layout/Enlace";
import { Fila } from "../../layout/Fila";
import { Pila } from "../../layout/Pila";
import { enlaceDe } from "../../ruteo";
import { cargarProcesos, textoDeProblema } from "./api";
import {
  avanceDe,
  estadoLegible,
  etiquetaDeOrigen,
  filtrarPorEstado,
  filtrarProcesos,
  ocultosPorEstado,
  ordenarProcesos,
  proximoPaso,
  type FiltroDeEstado,
} from "./presentacion";

type Estado =
  | { fase: "cargando" }
  | { fase: "listo"; procesos: Proceso[] }
  | { fase: "problema"; mensaje: string };

export function ListaDeProcesos() {
  const [estado, setEstado] = useState<Estado>({ fase: "cargando" });
  const [consulta, setConsulta] = useState("");
  /**
   * T-14. Arranca en «abiertos» porque el bufete abre esta pantalla a ver
   * qué hay que hacer, y un listado que se llena de trámites terminados deja
   * de contestar esa pregunta. Lo que el filtro deja afuera se **dice**
   * abajo: por defecto esconder sin avisar es perder, no filtrar.
   */
  const [filtro, setFiltro] = useState<FiltroDeEstado>("abiertos");

  useEffect(() => {
    const control = new AbortController();

    void cargarProcesos(control.signal).then((resultado) => {
      if (control.signal.aborted) return;

      setEstado(
        resultado.estado === "ok"
          ? { fase: "listo", procesos: resultado.valor }
          : { fase: "problema", mensaje: textoDeProblema(resultado) },
      );
    });

    return () => {
      control.abort();
    };
  }, []);

  const visibles = useMemo(() => {
    if (estado.fase !== "listo") return [];
    return ordenarProcesos(
      filtrarProcesos(filtrarPorEstado(estado.procesos, filtro), consulta),
    );
  }, [estado, consulta, filtro]);

  /* Lo que el filtro de estado deja afuera, para decirlo en vez de callarlo. */
  const ocultos =
    estado.fase === "listo"
      ? ocultosPorEstado(estado.procesos, filtro)
      : null;

  return (
    <Pila espacio="holgado">
      <header>
        <Fila alinear="entre">
          <h1>Procesos</h1>
          <Enlace
            href={enlaceDe({ nombre: "proceso-nuevo", clienteId: null })}
            className="boton boton--primario"
          >
            Nuevo proceso
          </Enlace>
        </Fila>
      </header>

      {estado.fase === "cargando" && <p>Consultando…</p>}

      {estado.fase === "problema" && (
        <Aviso tono="error">{estado.mensaje}</Aviso>
      )}

      {estado.fase === "listo" && estado.procesos.length === 0 && (
        <Aviso>
          Todavía no hay ningún proceso abierto. Un proceso es cualquier
          trabajo que lleve el bufete, y se abre sobre un cliente y un tipo de
          proceso: las etapas se copian solas de la plantilla de ese tipo.
        </Aviso>
      )}

      {estado.fase === "listo" && estado.procesos.length > 0 && (
        <Pila>
          <Fila>
            <div className="campo campo--busqueda campo--crecer">
              <label className="campo__rotulo" htmlFor="busqueda-de-procesos">
                Buscar
              </label>
              <input
                id="busqueda-de-procesos"
                className="campo__control"
                type="search"
                value={consulta}
                placeholder="Título, cliente, tipo, etapa o cotización"
                onChange={(evento) => {
                  setConsulta(evento.target.value);
                }}
              />
            </div>

            <div className="campo">
              <label className="campo__rotulo" htmlFor="filtro-de-estado">
                Estado
              </label>
              <select
                id="filtro-de-estado"
                className="campo__control"
                value={filtro}
                onChange={(evento) => {
                  setFiltro(evento.target.value as FiltroDeEstado);
                }}
              >
                <option value="abiertos">Abiertos</option>
                <option value="cerrados">Cerrados</option>
                <option value="todos">Todos</option>
              </select>
            </div>
          </Fila>

          <p className="texto-apagado" aria-live="polite">
            {visibles.length === estado.procesos.length
              ? `${String(estado.procesos.length)} proceso(s).`
              : `${String(visibles.length)} de ${String(estado.procesos.length)} proceso(s).`}
            {ocultos !== null && <> {ocultos}</>}
          </p>

          {visibles.length === 0 ? (
            <Aviso>
              {consulta.trim() === ""
                ? // Sin texto escrito, lo que vació la tabla fue el filtro de
                  // estado, y decir «ningún proceso coincide con «»» mandaría
                  // a buscar un error de tipeo que no existe.
                  "Ningún proceso está en ese estado."
                : `Ningún proceso coincide con «${consulta}».`}
            </Aviso>
          ) : (
            <ContenedorDeTabla rotulo="Procesos del bufete">
              <thead>
                <tr>
                  <th scope="col">Proceso</th>
                  <th scope="col">Cliente</th>
                  <th scope="col">Tipo</th>
                  <th scope="col">Avance</th>
                  <th scope="col">Lo que viene</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((proceso) => (
                  <tr key={proceso.id}>
                    <th scope="row">
                      <Enlace
                        href={enlaceDe({ nombre: "proceso", id: proceso.id })}
                      >
                        {proceso.titulo}
                      </Enlace>
                      {/* El estado se marca **solo cuando es cerrado**, y no
                          como columna propia: con el filtro en «Abiertos»,
                          que es lo normal, una columna diría «Abierto» en
                          todas las filas y gastaría ancho en no decir nada.
                          Lo que hay que ver es la excepción. */}
                      {proceso.estado === "cerrado" && (
                        <>
                          {" "}
                          <span className="etiqueta etiqueta--tenue">
                            {estadoLegible(proceso)}
                          </span>
                        </>
                      )}
                      {/* T-15 · De dónde viene, cuando viene de algún lado.

                          Mismo criterio que el estado: **sólo se marca la
                          excepción**. La mayoría de los procesos se abren a
                          mano, y un «Directo» en todas las demás filas
                          gastaría ancho en no decir nada.

                          La clase es propia y no `etiqueta--tenue`, que es
                          la del cerrado. No es cosmética: una prueba que
                          cuenta distintivos sobre el documento entero
                          mezclaría las dos cosas y dejaría de medir
                          cualquiera de las dos. */}
                      {etiquetaDeOrigen(proceso) !== null && (
                        <>
                          {" "}
                          <span className="etiqueta etiqueta--origen">
                            {etiquetaDeOrigen(proceso)}
                          </span>
                        </>
                      )}
                    </th>
                    <td>{proceso.clienteNombre}</td>
                    <td>{proceso.tipoProcesoNombre}</td>
                    <td className="numerico">{avanceDe(proceso)}</td>
                    <td>{proximoPaso(proceso)}</td>
                  </tr>
                ))}
              </tbody>
            </ContenedorDeTabla>
          )}
        </Pila>
      )}
    </Pila>
  );
}
