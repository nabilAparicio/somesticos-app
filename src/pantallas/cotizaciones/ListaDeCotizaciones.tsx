/**
 * El listado de cotizaciones.
 *
 * Es tabular, así que va dentro de `ContenedorDeTabla`: el desbordamiento
 * vive dentro del envoltorio y la página no scrollea en horizontal
 * (`docs/diseno.md` §9). El filtro es del navegador y no del servidor, por
 * lo mismo que el de clientes: el bufete son dos personas y la cartera cabe
 * entera en una respuesta.
 *
 * **La tabla muestra el estado y no ofrece cambiarlo**, y desde T-5 eso es
 * una decisión y no una tarea pendiente: emitir, ganar, perder y duplicar
 * existen, y viven en el detalle.
 *
 * El motivo es que las cuatro son irreversibles de un modo u otro —emitir
 * congela, ganar y perder son el final, duplicar deja una fila nueva— y
 * ninguna se decide mirando una fila de tabla: se decide mirando el
 * documento. Una franja de botones por renglón, encima, pone «Emitir» y
 * «Marcar perdida» a un píxel de distancia en una lista donde lo único que
 * distingue un renglón del de al lado es el código.
 *
 * Un distintivo que dice «Emitida» es información; un botón de más acá sería
 * una emisión equivocada.
 */
import { useEffect, useMemo, useState } from "react";

import type { Cotizacion } from "../../../worker/contract";
import { hoyEnPanama } from "../../../worker/db/momentos";
import { Aviso } from "../../layout/Aviso";
import { ContenedorDeTabla } from "../../layout/ContenedorDeTabla";
import { Enlace } from "../../layout/Enlace";
import { Fila } from "../../layout/Fila";
import { Pila } from "../../layout/Pila";
import { enlaceDe } from "../../ruteo";
import { cargarCotizaciones, textoDeProblema } from "./api";
import {
  clienteDe,
  estaVencida,
  estadoLegible,
  filtrarCotizaciones,
  ordenarCotizaciones,
  vencimientoDe,
} from "./presentacion";

type Estado =
  | { fase: "cargando" }
  | { fase: "listo"; cotizaciones: Cotizacion[] }
  | { fase: "problema"; mensaje: string };

export function ListaDeCotizaciones() {
  const [estado, setEstado] = useState<Estado>({ fase: "cargando" });
  const [consulta, setConsulta] = useState("");

  useEffect(() => {
    const control = new AbortController();

    void cargarCotizaciones(control.signal).then((resultado) => {
      if (control.signal.aborted) return;

      setEstado(
        resultado.estado === "ok"
          ? { fase: "listo", cotizaciones: resultado.valor }
          : { fase: "problema", mensaje: textoDeProblema(resultado) },
      );
    });

    return () => {
      control.abort();
    };
  }, []);

  const visibles = useMemo(() => {
    if (estado.fase !== "listo") return [];
    return ordenarCotizaciones(
      filtrarCotizaciones(estado.cotizaciones, consulta),
    );
  }, [estado, consulta]);

  // El día del bufete, leído una vez por dibujo. Es lo que decide qué
  // borrador se marca vencido, y sale de Panamá y no de UTC: con el día de
  // UTC, a partir de las siete de la tarde un borrador que vence hoy
  // aparecería vencido con la oficina abierta.
  const hoy = hoyEnPanama(new Date());

  return (
    <Pila espacio="holgado">
      <header>
        <Fila alinear="entre">
          <h1>Cotizaciones</h1>
          <Enlace
            href={enlaceDe({ nombre: "cotizacion-nueva" })}
            className="boton boton--primario"
          >
            Nueva cotización
          </Enlace>
        </Fila>
      </header>

      {estado.fase === "cargando" && <p>Consultando…</p>}

      {estado.fase === "problema" && <Aviso tono="error">{estado.mensaje}</Aviso>}

      {estado.fase === "listo" && estado.cotizaciones.length === 0 && (
        <Aviso>
          Todavía no hay ninguna cotización. Abrir un borrador cuesta elegir
          el cliente; el código lo pone el sistema.
        </Aviso>
      )}

      {estado.fase === "listo" && estado.cotizaciones.length > 0 && (
        <Pila>
          <div className="campo campo--busqueda">
            <label className="campo__rotulo" htmlFor="busqueda-de-cotizaciones">
              Buscar
            </label>
            <input
              id="busqueda-de-cotizaciones"
              className="campo__control"
              type="search"
              value={consulta}
              placeholder="Código, cliente o estado"
              onChange={(evento) => {
                setConsulta(evento.target.value);
              }}
            />
          </div>

          <p className="texto-apagado" aria-live="polite">
            {visibles.length === estado.cotizaciones.length
              ? `${String(estado.cotizaciones.length)} cotización(es).`
              : `${String(visibles.length)} de ${String(estado.cotizaciones.length)} cotización(es).`}
          </p>

          {visibles.length === 0 ? (
            <Aviso>Ninguna cotización coincide con «{consulta}».</Aviso>
          ) : (
            <ContenedorDeTabla rotulo="Cotizaciones del bufete">
              <thead>
                <tr>
                  <th scope="col">Código</th>
                  <th scope="col">Cliente</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Vence</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((cotizacion) => (
                  <tr key={cotizacion.id}>
                    <th scope="row">
                      <Enlace
                        href={enlaceDe({
                          nombre: "cotizacion",
                          id: cotizacion.id,
                        })}
                      >
                        {cotizacion.codigo}
                      </Enlace>
                    </th>
                    <td>{clienteDe(cotizacion)}</td>
                    <td>
                      <span className="etiqueta">
                        {estadoLegible(cotizacion)}
                      </span>
                    </td>
                    <td>
                      {vencimientoDe(cotizacion)}
                      {estaVencida(cotizacion, hoy) && (
                        <>
                          {" "}
                          <span className="etiqueta etiqueta--tenue">
                            vencida
                          </span>
                        </>
                      )}
                    </td>
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
