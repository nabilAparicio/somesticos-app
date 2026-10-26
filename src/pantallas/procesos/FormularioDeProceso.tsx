/**
 * El alta de un proceso.
 *
 * Solo alta: el plan de trabajo se edita en el detalle, porque antes de
 * guardar no hay de qué colgar las etapas —es la misma razón por la que T-6
 * muestra la plantilla recién después de guardar el tipo.
 *
 * Dos cosas que la pantalla dice y conviene que diga:
 *
 *  1. **Las etapas se copian de la plantilla del tipo.** Quien abre el
 *     proceso tiene que saber de dónde salen los pasos que va a ver, y que
 *     desde ese momento son suyos.
 *  2. **El título sale sugerido del tipo y el cliente**, y se puede
 *     reescribir. Sin eso, cinco residencias se llaman igual en el listado.
 *
 * `origen` no es un campo: en esta tajada todo proceso nace `directo`. El
 * camino desde una cotización es de la tajada 2, junto con la tabla a la que
 * apuntaría.
 */
import { useEffect, useState, type FormEvent } from "react";

import type {
  Cliente,
  FallaDeValidacion,
  TipoProceso,
  Usuario,
} from "../../../worker/contract";
import { cargarUsuarios } from "../../api/usuarios";
import { Aviso } from "../../layout/Aviso";
import { Enlace } from "../../layout/Enlace";
import { Fila } from "../../layout/Fila";
import { Pila } from "../../layout/Pila";
import { Prosa } from "../../layout/Prosa";
import { Rejilla } from "../../layout/Rejilla";
import { mensajeDeFalla } from "../../mensajes";
import { navegarA } from "../../navegacion";
import { enlaceDe } from "../../ruteo";
import { cargarClientes } from "../clientes/api";
import { cargarTiposProceso } from "../catalogos/api";
import { crearProceso, textoDeProblema } from "./api";
// `responsablesSeleccionables` se importa de los pendientes en vez de
// copiarse acá: es la misma regla sobre la misma tabla —el equipo del
// bufete— y dos copias serían dos criterios de «quién se puede elegir» que
// se desincronizan en el primer cambio. Que haya nacido en T-9 dice dónde se
// necesitó primero, no de quién es.
import { responsablesSeleccionables } from "./pendientes";
import {
  BORRADOR_DE_PROCESO_VACIO,
  aPeticionDeProceso,
  clientesSeleccionables,
  tipoSeleccionables,
  tituloSugerido,
  validarProceso,
  type BorradorDeProceso,
} from "./formulario";

type Props = {
  /** Con esto, el alta abierta desde el detalle de ese cliente. */
  readonly clienteId?: string;
};

type Carga =
  | { fase: "cargando" }
  | { fase: "listo" }
  | { fase: "problema"; mensaje: string };

export function FormularioDeProceso({ clienteId }: Props) {
  const [borrador, setBorrador] = useState<BorradorDeProceso>({
    ...BORRADOR_DE_PROCESO_VACIO,
    clienteId: clienteId ?? "",
  });
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [tipos, setTipos] = useState<TipoProceso[]>([]);
  const [equipo, setEquipo] = useState<Usuario[]>([]);
  const [carga, setCarga] = useState<Carga>({ fase: "cargando" });
  const [fallas, setFallas] = useState<FallaDeValidacion[]>([]);
  const [problema, setProblema] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  /** Mientras nadie lo escriba a mano, el título sigue a los desplegables. */
  const [tituloATexto, setTituloATexto] = useState(false);

  useEffect(() => {
    const control = new AbortController();

    async function cargar() {
      const [lista, catalogo, personas] = await Promise.all([
        cargarClientes(control.signal),
        cargarTiposProceso(control.signal),
        cargarUsuarios(control.signal),
      ]);
      if (control.signal.aborted) return;

      // Los dos bloquean, al revés que el catálogo de tipos de cliente en
      // T-5: un proceso SIN cliente o SIN tipo no existe (I-2), así que un
      // formulario sin ellos no puede guardar nada.
      if (lista.estado !== "ok") {
        setCarga({
          fase: "problema",
          mensaje: textoDeProblema(lista, "ese cliente"),
        });
        return;
      }
      if (catalogo.estado !== "ok") {
        setCarga({
          fase: "problema",
          mensaje: textoDeProblema(catalogo, "ese tipo de proceso"),
        });
        return;
      }

      setClientes(lista.valor);
      setTipos(catalogo.valor);
      // El equipo **no** bloquea, al revés que los dos de arriba: el
      // responsable es opcional —`proceso.responsable_id` es nullable— así
      // que un proceso se abre perfectamente sin él. Negarle el alta al
      // bufete porque no se pudo listar quiénes son sería cambiar un campo
      // opcional por una puerta cerrada.
      if (personas.estado === "ok") setEquipo(personas.valor);
      setCarga({ fase: "listo" });
    }

    void cargar();

    return () => {
      control.abort();
    };
  }, []);

  function elegir(campo: "clienteId" | "tipoProcesoId", valor: string) {
    setBorrador((anterior) => {
      const siguiente = { ...anterior, [campo]: valor };
      if (tituloATexto) return siguiente;

      const tipo = tipos.find((t) => t.id === siguiente.tipoProcesoId);
      const cliente = clientes.find((c) => c.id === siguiente.clienteId);

      return {
        ...siguiente,
        titulo: tituloSugerido(tipo?.nombre ?? null, cliente?.nombre ?? null),
      };
    });
  }

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (guardando) return;

    const previas = validarProceso(borrador);
    setFallas(previas);
    setProblema(null);
    if (previas.length > 0) return;

    setGuardando(true);
    const resultado = await crearProceso(aPeticionDeProceso(borrador));
    setGuardando(false);

    if (resultado.estado === "invalido") {
      setFallas(resultado.fallas);
      return;
    }
    if (resultado.estado !== "ok") {
      setProblema(textoDeProblema(resultado));
      return;
    }

    navegarA(enlaceDe({
        nombre: "proceso",
        id: resultado.valor.id,
        pestana: "trabajo",
      }));
  }

  const volver =
    clienteId === undefined
      ? enlaceDe({ nombre: "procesos" })
      : enlaceDe({ nombre: "cliente", id: clienteId });

  if (carga.fase === "cargando") return <p>Consultando…</p>;

  if (carga.fase === "problema") {
    return (
      <Pila>
        <Aviso tono="error">{carga.mensaje}</Aviso>
        <p>
          <Enlace href={volver}>Volver</Enlace>
        </p>
      </Pila>
    );
  }

  const clientesOfrecidos = clientesSeleccionables(clientes);
  const tiposOfrecidos = tipoSeleccionables(tipos, borrador.tipoProcesoId);
  const responsablesOfrecidos = responsablesSeleccionables(
    equipo,
    borrador.responsableId,
  );

  return (
    <Pila espacio="holgado">
      <header>
        <Pila espacio="ceñido">
          <p className="texto-apagado">
            <Enlace href={enlaceDe({ nombre: "procesos" })}>Procesos</Enlace>
          </p>
          <h1>Nuevo proceso</h1>
          <Prosa como="p" className="texto-apagado">
            Al guardar, las etapas de la plantilla de ese tipo de proceso se
            copian a este proceso. Desde ese momento el plan es suyo: se le
            agregan y se le quitan pasos sin tocar la plantilla.
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
              <label className="campo__rotulo" htmlFor="campo-clienteId">
                Cliente
                <span className="campo__marca"> · obligatorio</span>
              </label>
              <select
                id="campo-clienteId"
                className="campo__control"
                value={borrador.clienteId}
                onChange={(evento) => {
                  elegir("clienteId", evento.target.value);
                }}
              >
                <option value="">Elegir cliente…</option>
                {clientesOfrecidos.map((cliente) => (
                  <option key={cliente.id} value={cliente.id}>
                    {cliente.nombre}
                  </option>
                ))}
              </select>
              {clientesOfrecidos.length === 0 && (
                <p className="campo__ayuda">
                  No hay clientes todavía. Hay que dar uno de alta antes de
                  poder abrirle un proceso.
                </p>
              )}
            </div>

            <div className="campo">
              <label className="campo__rotulo" htmlFor="campo-tipoProcesoId">
                Tipo de proceso
                <span className="campo__marca"> · obligatorio</span>
              </label>
              <select
                id="campo-tipoProcesoId"
                className="campo__control"
                value={borrador.tipoProcesoId}
                onChange={(evento) => {
                  elegir("tipoProcesoId", evento.target.value);
                }}
              >
                <option value="">Elegir tipo…</option>
                {tiposOfrecidos.map((tipo) => (
                  <option key={tipo.id} value={tipo.id}>
                    {tipo.nombre}
                  </option>
                ))}
              </select>
              {tiposOfrecidos.length === 0 && (
                <p className="campo__ayuda">
                  No hay tipos de proceso todavía. Hay que crear uno en
                  Catálogos, con su plantilla de etapas.
                </p>
              )}
            </div>

            <div className="campo">
              <label className="campo__rotulo" htmlFor="campo-responsableId">
                Responsable
              </label>
              <select
                id="campo-responsableId"
                className="campo__control"
                value={borrador.responsableId}
                onChange={(evento) => {
                  setBorrador((anterior) => ({
                    ...anterior,
                    responsableId: evento.target.value,
                  }));
                }}
              >
                {/* La opción vacía se NOMBRA, igual que en el pendiente de
                    T-9: abrir un proceso sin decidir quién lo lleva es
                    legítimo, y justamente por eso tiene que elegirse a
                    sabiendas y no quedar en un hueco en blanco. */}
                <option value="">Sin responsable asignado</option>
                {responsablesOfrecidos.map((persona) => (
                  <option key={persona.id} value={persona.id}>
                    {persona.nombre}
                  </option>
                ))}
              </select>
              <p className="campo__ayuda">
                {responsablesOfrecidos.length === 0
                  ? "No hay nadie a quien asignárselo ahora mismo. El proceso" +
                    " se abre igual, sin responsable."
                  : "Opcional: es quien lleva el trámite. Hoy se elige al" +
                    " abrirlo y la pantalla todavía no sabe reasignarlo."}
              </p>
            </div>
          </Rejilla>

          <div className="campo">
            <label className="campo__rotulo" htmlFor="campo-titulo">
              Título
              <span className="campo__marca"> · obligatorio</span>
            </label>
            <input
              id="campo-titulo"
              className="campo__control"
              type="text"
              value={borrador.titulo}
              onChange={(evento) => {
                setTituloATexto(true);
                setBorrador((anterior) => ({
                  ...anterior,
                  titulo: evento.target.value,
                }));
              }}
            />
            <p className="campo__ayuda">
              Es lo que distingue este proceso de otro del mismo tipo en el
              listado. Se propone uno al elegir tipo y cliente.
            </p>
          </div>

          <Fila>
            <button
              type="submit"
              className="boton boton--primario"
              disabled={guardando}
            >
              {guardando ? "Abriendo…" : "Abrir proceso"}
            </button>
            <Enlace href={volver} className="boton boton--tenue">
              Cancelar
            </Enlace>
          </Fila>
        </Pila>
      </form>
    </Pila>
  );
}
