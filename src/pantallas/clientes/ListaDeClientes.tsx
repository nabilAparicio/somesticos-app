/**
 * El listado de clientes.
 *
 * Es tabular, así que va dentro de `ContenedorDeTabla`: el desbordamiento
 * vive dentro del envoltorio y la página no scrollea en horizontal
 * (`docs/diseno.md` §9). El filtro es del navegador y no del servidor a
 * propósito: el bufete son dos personas y la cartera cabe entera en una
 * respuesta; pedirle al servidor cada tecla sería latencia a cambio de nada.
 */
import { useEffect, useMemo, useState } from "react";

import type { Cliente } from "../../../worker/contract";
import { Aviso } from "../../layout/Aviso";
import { ContenedorDeTabla } from "../../layout/ContenedorDeTabla";
import { Enlace } from "../../layout/Enlace";
import { Fila } from "../../layout/Fila";
import { Pila } from "../../layout/Pila";
import { enlaceDe } from "../../ruteo";
import { cargarClientes, textoDeProblema } from "./api";
import {
  contactoDe,
  documentoDe,
  filtrarClientes,
  ordenarPorNombre,
  tipoDe,
} from "./presentacion";

type Estado =
  | { fase: "cargando" }
  | { fase: "listo"; clientes: Cliente[] }
  | { fase: "problema"; mensaje: string };

export function ListaDeClientes() {
  const [estado, setEstado] = useState<Estado>({ fase: "cargando" });
  const [consulta, setConsulta] = useState("");

  useEffect(() => {
    const control = new AbortController();

    void cargarClientes(control.signal).then((resultado) => {
      if (control.signal.aborted) return;

      setEstado(
        resultado.estado === "ok"
          ? { fase: "listo", clientes: resultado.valor }
          : { fase: "problema", mensaje: textoDeProblema(resultado) },
      );
    });

    return () => {
      control.abort();
    };
  }, []);

  const visibles = useMemo(() => {
    if (estado.fase !== "listo") return [];
    return ordenarPorNombre(filtrarClientes(estado.clientes, consulta));
  }, [estado, consulta]);

  return (
    <Pila espacio="holgado">
      <header>
        <Fila alinear="entre">
          <h1>Clientes</h1>
          <Enlace href={enlaceDe({ nombre: "cliente-nuevo" })} className="boton boton--primario">
            Nuevo cliente
          </Enlace>
        </Fila>
      </header>

      {estado.fase === "cargando" && <p>Consultando…</p>}

      {estado.fase === "problema" && <Aviso tono="error">{estado.mensaje}</Aviso>}

      {estado.fase === "listo" && estado.clientes.length === 0 && (
        <Aviso>
          Todavía no hay ningún cliente. Para cotizar hace falta uno, y darlo
          de alta cuesta un nombre y un teléfono.
        </Aviso>
      )}

      {estado.fase === "listo" && estado.clientes.length > 0 && (
        <Pila>
          <div className="campo campo--busqueda">
            <label className="campo__rotulo" htmlFor="busqueda-de-clientes">
              Buscar
            </label>
            <input
              id="busqueda-de-clientes"
              className="campo__control"
              type="search"
              value={consulta}
              placeholder="Nombre, documento, correo o teléfono"
              onChange={(evento) => {
                setConsulta(evento.target.value);
              }}
            />
          </div>

          <p className="texto-apagado" aria-live="polite">
            {visibles.length === estado.clientes.length
              ? `${String(estado.clientes.length)} cliente(s).`
              : `${String(visibles.length)} de ${String(estado.clientes.length)} cliente(s).`}
          </p>

          {visibles.length === 0 ? (
            <Aviso>Ningún cliente coincide con «{consulta}».</Aviso>
          ) : (
            <ContenedorDeTabla rotulo="Clientes del bufete">
              <thead>
                <tr>
                  <th scope="col">Nombre</th>
                  <th scope="col">Tipo</th>
                  <th scope="col">Contacto</th>
                  <th scope="col">Documento</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((cliente) => (
                  <tr key={cliente.id}>
                    <th scope="row">
                      <Enlace href={enlaceDe({ nombre: "cliente", id: cliente.id })}>
                        {cliente.nombre}
                      </Enlace>
                    </th>
                    <td>{tipoDe(cliente)}</td>
                    <td>{contactoDe(cliente)}</td>
                    <td>{documentoDe(cliente)}</td>
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
