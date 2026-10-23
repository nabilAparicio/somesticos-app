/**
 * El detalle de un cliente.
 *
 * Los campos van en una lista de definiciones dentro de una rejilla que se
 * reacomoda sola: a 320px es una columna, en escritorio son varias, y no hay
 * un breakpoint escrito a mano (`docs/diseno.md` §9).
 *
 * Desde T-7 cuelga de acá el bloque de procesos del cliente: es la respuesta
 * a «en qué va este cliente», que es con lo que el bufete abre la aplicación.
 * Se pide por separado del cliente a propósito —son dos lecturas
 * independientes— para que un fallo del listado no deje la ficha en blanco.
 */
import { useEffect, useState } from "react";

import type { Cliente, Proceso } from "../../../worker/contract";
import { Aviso } from "../../layout/Aviso";
import { Enlace } from "../../layout/Enlace";
import { Fila } from "../../layout/Fila";
import { Pila } from "../../layout/Pila";
import { Prosa } from "../../layout/Prosa";
import { Rejilla } from "../../layout/Rejilla";
import { enlaceDe } from "../../ruteo";
import { ContenedorDeTabla } from "../../layout/ContenedorDeTabla";
import {
  cargarProcesos,
  textoDeProblema as textoDeProblemaDeProceso,
} from "../procesos/api";
import { avanceDe, ordenarProcesos, proximoPaso } from "../procesos/presentacion";
import { cargarCliente, textoDeProblema } from "./api";
import { VACIO, documentoDe, fechaLegible, tipoDe } from "./presentacion";

type Props = {
  readonly id: string;
};

type Estado =
  | { fase: "cargando" }
  | { fase: "listo"; cliente: Cliente }
  | { fase: "problema"; mensaje: string };

function Dato({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="definicion">
      <dt className="definicion__rotulo">{rotulo}</dt>
      <dd className="definicion__valor">{valor}</dd>
    </div>
  );
}

type EstadoDeProcesos =
  | { fase: "cargando" }
  | { fase: "listo"; procesos: Proceso[] }
  | { fase: "problema"; mensaje: string };

export function DetalleDeCliente({ id }: Props) {
  const [estado, setEstado] = useState<Estado>({ fase: "cargando" });
  const [procesos, setProcesos] = useState<EstadoDeProcesos>({
    fase: "cargando",
  });

  useEffect(() => {
    const control = new AbortController();

    void cargarCliente(id, control.signal).then((resultado) => {
      if (control.signal.aborted) return;

      setEstado(
        resultado.estado === "ok"
          ? { fase: "listo", cliente: resultado.valor }
          : { fase: "problema", mensaje: textoDeProblema(resultado) },
      );
    });

    void cargarProcesos(control.signal, id).then((resultado) => {
      if (control.signal.aborted) return;

      setProcesos(
        resultado.estado === "ok"
          ? { fase: "listo", procesos: ordenarProcesos(resultado.valor) }
          : {
              fase: "problema",
              mensaje: textoDeProblemaDeProceso(resultado, "ese proceso"),
            },
      );
    });

    return () => {
      control.abort();
    };
  }, [id]);

  if (estado.fase === "cargando") return <p>Consultando…</p>;

  if (estado.fase === "problema") {
    return (
      <Pila>
        <Aviso tono="error">{estado.mensaje}</Aviso>
        <p>
          <Enlace href={enlaceDe({ nombre: "clientes" })}>
            Volver a clientes
          </Enlace>
        </p>
      </Pila>
    );
  }

  const { cliente } = estado;

  return (
    <Pila espacio="holgado">
      <header>
        <Pila espacio="ceñido">
          <p className="texto-apagado">
            <Enlace href={enlaceDe({ nombre: "clientes" })}>Clientes</Enlace>
          </p>
          <Fila alinear="entre">
            <h1>{cliente.nombre}</h1>
            <Enlace
              href={enlaceDe({ nombre: "cliente-edicion", id: cliente.id })}
              className="boton"
            >
              Editar
            </Enlace>
          </Fila>
        </Pila>
      </header>

      <Rejilla minimo="16rem">
        <dl className="definiciones">
          <Dato rotulo="Tipo" valor={tipoDe(cliente)} />
          <Dato rotulo="Documento" valor={documentoDe(cliente)} />
          <Dato
            rotulo="Representante legal"
            valor={cliente.representanteLegal ?? VACIO}
          />
        </dl>
        <dl className="definiciones">
          <Dato rotulo="Teléfono" valor={cliente.telefono ?? VACIO} />
          <Dato rotulo="Correo" valor={cliente.email ?? VACIO} />
          <Dato
            rotulo="Alta"
            valor={`${fechaLegible(cliente.creadoEn)} · ${
              cliente.creadoPorNombre ?? VACIO
            }`}
          />
        </dl>
      </Rejilla>

      <section aria-labelledby="procesos-del-cliente">
        <Pila>
          <Fila alinear="entre">
            <h2 id="procesos-del-cliente">Procesos</h2>
            <Enlace
              href={enlaceDe({
                nombre: "proceso-nuevo",
                clienteId: cliente.id,
              })}
              className="boton"
            >
              Nuevo proceso
            </Enlace>
          </Fila>

          {procesos.fase === "cargando" && <p>Consultando…</p>}

          {procesos.fase === "problema" && (
            <Aviso tono="error">{procesos.mensaje}</Aviso>
          )}

          {procesos.fase === "listo" && procesos.procesos.length === 0 && (
            <Aviso>
              Este cliente todavía no tiene ningún proceso abierto.
            </Aviso>
          )}

          {procesos.fase === "listo" && procesos.procesos.length > 0 && (
            <ContenedorDeTabla rotulo={`Procesos de ${cliente.nombre}`}>
              <thead>
                <tr>
                  <th scope="col">Proceso</th>
                  <th scope="col">Tipo</th>
                  <th scope="col">Avance</th>
                  <th scope="col">Lo que viene</th>
                </tr>
              </thead>
              <tbody>
                {procesos.procesos.map((proceso) => (
                  <tr key={proceso.id}>
                    <th scope="row">
                      <Enlace
                        href={enlaceDe({ nombre: "proceso", id: proceso.id })}
                      >
                        {proceso.titulo}
                      </Enlace>
                    </th>
                    <td>{proceso.tipoProcesoNombre}</td>
                    <td className="numerico">{avanceDe(proceso)}</td>
                    <td>{proximoPaso(proceso)}</td>
                  </tr>
                ))}
              </tbody>
            </ContenedorDeTabla>
          )}
        </Pila>
      </section>

      <section aria-labelledby="notas-del-cliente">
        <Pila>
          <h2 id="notas-del-cliente">Notas</h2>
          {cliente.notas === null ? (
            <p className="texto-apagado">Sin notas.</p>
          ) : (
            <Prosa>
              <p className="notas">{cliente.notas}</p>
            </Prosa>
          )}
        </Pila>
      </section>
    </Pila>
  );
}
