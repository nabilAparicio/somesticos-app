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
 *
 * Desde T-10 cuelga también la bitácora, pedida igual y por lo mismo. Trae
 * **solo los hechos de la ficha** —quién la dio de alta, quién la editó—; lo
 * que pasó en cada proceso vive en la bitácora de ese proceso, porque un
 * hecho se registra una sola vez, bajo la entidad de la que es.
 *
 * Y desde T-16 cuelgan sus cotizaciones, que era el agujero de esta
 * pantalla: la ficha mostraba procesos, bitácora y notas, y desde el cliente
 * que había encargado una cotización ganada no había forma de llegar a ella.
 * Se pide igual que las otras dos —por separado, para que un fallo no deje
 * la ficha en blanco— pero con una diferencia: **lo que se pide es el
 * listado entero y el filtro corre acá**, porque `GET /api/cotizaciones` no
 * tiene un `?clienteId=` como sí lo tiene el de procesos. Es el mismo
 * camino que toma el detalle de la cotización con los procesos que abrió, y
 * el argumento está en `cotizacionesDeCliente`.
 */
import { useEffect, useState } from "react";

import type { Cliente, Cotizacion, Proceso } from "../../../worker/contract";
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
import {
  cargarCotizaciones,
  textoDeProblema as textoDeProblemaDeCotizacion,
} from "../cotizaciones/api";
import {
  estadoLegible,
  ordenarCotizaciones,
  vencimientoDe,
} from "../cotizaciones/presentacion";
import { Bitacora, type EstadoDeBitacora } from "../Bitacora";
import {
  cargarBitacoraDeCliente,
  cargarCliente,
  textoDeProblema,
} from "./api";
import {
  VACIO,
  cotizacionesDeCliente,
  documentoDe,
  fechaLegible,
  tipoDe,
} from "./presentacion";

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

type EstadoDeCotizaciones =
  | { fase: "cargando" }
  | { fase: "listo"; cotizaciones: Cotizacion[] }
  | { fase: "problema"; mensaje: string };

export function DetalleDeCliente({ id }: Props) {
  const [estado, setEstado] = useState<Estado>({ fase: "cargando" });
  const [procesos, setProcesos] = useState<EstadoDeProcesos>({
    fase: "cargando",
  });
  const [cotizaciones, setCotizaciones] = useState<EstadoDeCotizaciones>({
    fase: "cargando",
  });
  const [bitacora, setBitacora] = useState<EstadoDeBitacora>({
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

    /*
     * El listado entero, y el filtro en la línea de abajo.
     *
     * `cargarCotizaciones` se importa de `../cotizaciones/api` en vez de
     * declararse acá, por lo mismo que aquel archivo importa el listado de
     * clientes del de clientes: una segunda forma de pedir la misma ruta es
     * la que se queda sin el `AbortSignal` el día que alguien la toque.
     */
    void cargarCotizaciones(control.signal).then((resultado) => {
      if (control.signal.aborted) return;

      setCotizaciones(
        resultado.estado === "ok"
          ? {
              fase: "listo",
              cotizaciones: ordenarCotizaciones(
                cotizacionesDeCliente(resultado.valor, id),
              ),
            }
          : {
              fase: "problema",
              mensaje: textoDeProblemaDeCotizacion(resultado),
            },
      );
    });

    void cargarBitacoraDeCliente(id, control.signal).then((resultado) => {
      if (control.signal.aborted) return;

      setBitacora(
        resultado.estado === "ok"
          ? { fase: "listo", entradas: resultado.valor }
          : { fase: "problema", mensaje: textoDeProblema(resultado) },
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

      {/* ---------------------------------------------------------------
          Las cotizaciones del cliente (T-16).

          Va debajo de los procesos y no arriba, aunque en el ciclo la
          cotización venga primero: lo que el bufete abre a mirar es en qué
          va el cliente, y eso lo contestan los procesos.

          **Misma forma que los procesos**: tabla con el documento
          enlazado en la celda de cabecera de fila. Y el estado en su
          propia columna, porque un borrador y una ganada no se leen igual
          y abrir tres fichas para enterarse es lo que esta sección existe
          para evitar.

          El rótulo es «Cotizaciones» pelado y el de la tabla lleva el
          nombre del cliente, igual que el de procesos. Los dos son
          regiones con nombre, así que apuntar a la sección desde una
          prueba pide coincidencia exacta: los localizadores de Playwright
          buscan por subcadena y «Cotizaciones» también resuelve
          «Cotizaciones de …».
          --------------------------------------------------------------- */}
      <section aria-labelledby="cotizaciones-del-cliente">
        <Pila>
          {/*
            **Sin botón de alta**, al revés que la sección de procesos. El
            de allá pasa `clienteId` y la pantalla abre con el cliente ya
            elegido; `cotizacion-nueva` no admite ese parámetro, así que un
            botón acá mandaría a un formulario en blanco donde hay que
            volver a buscar al cliente que se estaba mirando. Esta sección
            es para llegar a lo que ya existe.
          */}
          <h2 id="cotizaciones-del-cliente">Cotizaciones</h2>

          {cotizaciones.fase === "cargando" && <p>Consultando…</p>}

          {cotizaciones.fase === "problema" && (
            <Aviso tono="error">{cotizaciones.mensaje}</Aviso>
          )}

          {cotizaciones.fase === "listo" &&
            cotizaciones.cotizaciones.length === 0 && (
              <Aviso>
                Este cliente todavía no tiene ninguna cotización.
              </Aviso>
            )}

          {cotizaciones.fase === "listo" &&
            cotizaciones.cotizaciones.length > 0 && (
              <ContenedorDeTabla rotulo={`Cotizaciones de ${cliente.nombre}`}>
                <thead>
                  <tr>
                    <th scope="col">Código</th>
                    <th scope="col">Estado</th>
                    <th scope="col">Vence</th>
                  </tr>
                </thead>
                <tbody>
                  {cotizaciones.cotizaciones.map((cotizacion) => (
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
                      <td>
                        <span className="etiqueta">
                          {estadoLegible(cotizacion)}
                        </span>
                      </td>
                      <td>{vencimientoDe(cotizacion)}</td>
                    </tr>
                  ))}
                </tbody>
              </ContenedorDeTabla>
            )}
        </Pila>
      </section>

      <Bitacora estado={bitacora} id="bitacora-del-cliente" />

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
