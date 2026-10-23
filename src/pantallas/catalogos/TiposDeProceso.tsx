/**
 * El listado de tipos de proceso, agrupado por área.
 *
 * Agrupado y no plano porque el catálogo es granular a propósito —una visa
 * de trabajo y una de pensionado son tipos distintos (`docs/diseno.md` §6)—
 * y en seis meses esto son treinta filas. Sin la rama del derecho delante,
 * una lista de treinta nombres de trámite no se lee.
 */
import { useEffect, useState } from "react";

import type { TipoProceso } from "../../../worker/contract";
import { Aviso } from "../../layout/Aviso";
import { ContenedorDeTabla } from "../../layout/ContenedorDeTabla";
import { Enlace } from "../../layout/Enlace";
import { Fila } from "../../layout/Fila";
import { Pila } from "../../layout/Pila";
import { enlaceDe } from "../../ruteo";
import { cargarTiposProceso, textoDeProblema } from "./api";
import { VACIO, agruparPorArea, estadoDe } from "./presentacion";

type Estado =
  | { fase: "cargando" }
  | { fase: "listo"; tipos: TipoProceso[] }
  | { fase: "problema"; mensaje: string };

export function TiposDeProceso() {
  const [estado, setEstado] = useState<Estado>({ fase: "cargando" });

  useEffect(() => {
    const control = new AbortController();

    void cargarTiposProceso(control.signal).then((resultado) => {
      if (control.signal.aborted) return;

      setEstado(
        resultado.estado === "ok"
          ? { fase: "listo", tipos: resultado.valor }
          : {
              fase: "problema",
              mensaje: textoDeProblema(resultado, "ese tipo de proceso"),
            },
      );
    });

    return () => {
      control.abort();
    };
  }, []);

  const grupos = estado.fase === "listo" ? agruparPorArea(estado.tipos) : [];

  return (
    <Pila espacio="holgado">
      <header>
        <Pila espacio="ceñido">
          <p className="texto-apagado">
            <Enlace href={enlaceDe({ nombre: "catalogos" })}>Catálogos</Enlace>
          </p>
          <Fila alinear="entre">
            <h1>Tipos de proceso</h1>
            <Enlace
              href={enlaceDe({ nombre: "tipo-proceso-nuevo" })}
              className="boton boton--primario"
            >
              Nuevo tipo de proceso
            </Enlace>
          </Fila>
        </Pila>
      </header>

      {estado.fase === "cargando" && <p>Consultando…</p>}

      {estado.fase === "problema" && (
        <Aviso tono="error">{estado.mensaje}</Aviso>
      )}

      {estado.fase === "listo" && grupos.length === 0 && (
        <Aviso>
          Todavía no hay ningún tipo de proceso. Hace falta al menos un área
          para colgar el primero.
        </Aviso>
      )}

      {grupos.map((grupo) => (
        <section key={grupo.areaId} aria-labelledby={`area-${grupo.areaId}`}>
          <Pila>
            <h2 id={`area-${grupo.areaId}`}>{grupo.areaNombre}</h2>
            <ContenedorDeTabla rotulo={`Tipos de proceso de ${grupo.areaNombre}`}>
              <thead>
                <tr>
                  <th scope="col">Tipo</th>
                  <th scope="col">Descripción</th>
                  <th scope="col">Estado</th>
                </tr>
              </thead>
              <tbody>
                {grupo.tipos.map((tipo) => (
                  <tr key={tipo.id}>
                    <th scope="row">
                      <Enlace
                        href={enlaceDe({ nombre: "tipo-proceso", id: tipo.id })}
                      >
                        {tipo.nombre}
                      </Enlace>
                    </th>
                    <td>{tipo.descripcion ?? VACIO}</td>
                    <td>
                      <span
                        className={
                          tipo.activo ? "etiqueta" : "etiqueta etiqueta--tenue"
                        }
                      >
                        {estadoDe(tipo.activo)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </ContenedorDeTabla>
          </Pila>
        </section>
      ))}
    </Pila>
  );
}
