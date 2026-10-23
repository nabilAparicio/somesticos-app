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
  filtrarProcesos,
  ordenarProcesos,
  proximoPaso,
} from "./presentacion";

type Estado =
  | { fase: "cargando" }
  | { fase: "listo"; procesos: Proceso[] }
  | { fase: "problema"; mensaje: string };

export function ListaDeProcesos() {
  const [estado, setEstado] = useState<Estado>({ fase: "cargando" });
  const [consulta, setConsulta] = useState("");

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
    return ordenarProcesos(filtrarProcesos(estado.procesos, consulta));
  }, [estado, consulta]);

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
          <div className="campo campo--busqueda">
            <label className="campo__rotulo" htmlFor="busqueda-de-procesos">
              Buscar
            </label>
            <input
              id="busqueda-de-procesos"
              className="campo__control"
              type="search"
              value={consulta}
              placeholder="Título, cliente, tipo o la etapa que viene"
              onChange={(evento) => {
                setConsulta(evento.target.value);
              }}
            />
          </div>

          <p className="texto-apagado" aria-live="polite">
            {visibles.length === estado.procesos.length
              ? `${String(estado.procesos.length)} proceso(s).`
              : `${String(visibles.length)} de ${String(estado.procesos.length)} proceso(s).`}
          </p>

          {visibles.length === 0 ? (
            <Aviso>Ningún proceso coincide con «{consulta}».</Aviso>
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
