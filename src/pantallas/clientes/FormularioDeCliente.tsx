/**
 * El alta y la edición de un cliente: un solo formulario.
 *
 * La decisión que manda acá es cuál es el campo obligatorio, y son dos:
 * **nombre y un medio de contacto**. El resto se marca "opcional" en la
 * propia etiqueta, no en una ayuda al pie, porque lo que hace que alguien
 * abandone un alta es creer que tiene que averiguar el RUC antes de guardar.
 * Ese abandono es el que convierte los invariantes I-1 e I-2 en un bloqueo
 * para cotizarle a un prospecto (`docs/diseno.md` §5).
 *
 * El `<form>` es un formulario de verdad, con `onSubmit`: así funciona la
 * tecla Enter y el navegador anuncia los campos como lo que son.
 */
import { useEffect, useState, type FormEvent } from "react";

import type { FallaDeValidacion, TipoCliente } from "../../../worker/contract";
import { Aviso } from "../../layout/Aviso";
import { Enlace } from "../../layout/Enlace";
import { Fila } from "../../layout/Fila";
import { Pila } from "../../layout/Pila";
import { Rejilla } from "../../layout/Rejilla";
import { navegarA } from "../../navegacion";
import { enlaceDe } from "../../ruteo";
import {
  actualizarCliente,
  cargarCliente,
  cargarTipos,
  crearCliente,
  textoDeProblema,
} from "./api";
import {
  BORRADOR_VACIO,
  aPeticion,
  borradorDesde,
  mensajeDeFalla,
  tiposSeleccionables,
  validarBorrador,
  type BorradorDeCliente,
  type CampoDelBorrador,
} from "./formulario";

type Props = {
  /** Sin esto es un alta; con esto, la edición de ese cliente. */
  readonly clienteId?: string;
};

type Carga =
  | { fase: "cargando" }
  | { fase: "listo" }
  | { fase: "problema"; mensaje: string };

type Campo = {
  readonly campo: CampoDelBorrador;
  readonly rotulo: string;
  readonly tipo?: "text" | "email" | "tel";
  readonly obligatorio?: boolean;
  readonly ayuda?: string;
};

/**
 * El orden de carga, que es el orden de la conversación telefónica: primero
 * cómo se llama y cómo se le vuelve a hablar, después todo lo demás.
 */
const CAMPOS: readonly Campo[] = [
  { campo: "nombre", rotulo: "Nombre", obligatorio: true },
  { campo: "telefono", rotulo: "Teléfono", tipo: "tel" },
  { campo: "email", rotulo: "Correo", tipo: "email" },
  { campo: "documentoTipo", rotulo: "Tipo de documento", ayuda: "Cédula, RUC, pasaporte…" },
  { campo: "documentoNumero", rotulo: "Número de documento" },
  {
    campo: "representanteLegal",
    rotulo: "Representante legal",
    ayuda: "Quién firma, cuando el cliente es una entidad.",
  },
] as const;

export function FormularioDeCliente({ clienteId }: Props) {
  const editando = clienteId !== undefined;

  const [borrador, setBorrador] = useState<BorradorDeCliente>(BORRADOR_VACIO);
  const [tipos, setTipos] = useState<TipoCliente[]>([]);
  const [carga, setCarga] = useState<Carga>({ fase: "cargando" });
  const [fallas, setFallas] = useState<FallaDeValidacion[]>([]);
  const [problema, setProblema] = useState<string | null>(null);
  const [avisoDeCatalogo, setAvisoDeCatalogo] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    const control = new AbortController();

    async function cargar() {
      const tipos = await cargarTipos(control.signal);
      if (control.signal.aborted) return;

      // El catálogo que no carga **no** impide dar de alta: el tipo es
      // opcional, así que bloquear el formulario por él sería convertir un
      // campo prescindible en un requisito, que es justo lo que el criterio
      // de T-5 prohíbe. Se avisa y se sigue.
      if (tipos.estado === "ok") {
        setTipos(tipos.valor);
      } else {
        setAvisoDeCatalogo(textoDeProblema(tipos));
      }

      if (clienteId === undefined) {
        setBorrador(BORRADOR_VACIO);
        setCarga({ fase: "listo" });
        return;
      }

      const cliente = await cargarCliente(clienteId, control.signal);
      if (control.signal.aborted) return;

      if (cliente.estado !== "ok") {
        setCarga({ fase: "problema", mensaje: textoDeProblema(cliente) });
        return;
      }

      setBorrador(borradorDesde(cliente.valor));
      setCarga({ fase: "listo" });
    }

    void cargar();

    return () => {
      control.abort();
    };
  }, [clienteId]);

  function cambiar(campo: CampoDelBorrador, valor: string) {
    setBorrador((anterior) => ({ ...anterior, [campo]: valor }));
  }

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (guardando) return;

    // El aviso temprano. La validación que manda es la del Worker, y su
    // respuesta se muestra igual más abajo.
    const previas = validarBorrador(borrador);
    setFallas(previas);
    setProblema(null);
    if (previas.length > 0) return;

    setGuardando(true);
    const datos = aPeticion(borrador);
    const resultado =
      clienteId === undefined
        ? await crearCliente(datos)
        : await actualizarCliente(clienteId, datos);
    setGuardando(false);

    if (resultado.estado === "invalido") {
      setFallas(resultado.fallas);
      return;
    }
    if (resultado.estado !== "ok") {
      setProblema(textoDeProblema(resultado));
      return;
    }

    navegarA(enlaceDe({ nombre: "cliente", id: resultado.valor.id }));
  }

  if (carga.fase === "cargando") return <p>Consultando…</p>;

  if (carga.fase === "problema") {
    return (
      <Pila>
        <Aviso tono="error">{carga.mensaje}</Aviso>
        <p>
          <Enlace href={enlaceDe({ nombre: "clientes" })}>
            Volver a clientes
          </Enlace>
        </p>
      </Pila>
    );
  }

  const seleccionables = tiposSeleccionables(tipos, borrador.tipoClienteId);
  const destinoAlCancelar =
    clienteId === undefined
      ? enlaceDe({ nombre: "clientes" })
      : enlaceDe({ nombre: "cliente", id: clienteId });

  return (
    <Pila espacio="holgado">
      <header>
        <Pila espacio="ceñido">
          <h1>{editando ? "Editar cliente" : "Nuevo cliente"}</h1>
          <p className="texto-apagado">
            Con el nombre y un teléfono alcanza. Todo lo demás se puede
            completar después.
          </p>
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
            {CAMPOS.map(({ campo, rotulo, tipo, obligatorio, ayuda }) => (
              <div className="campo" key={campo}>
                <label className="campo__rotulo" htmlFor={`campo-${campo}`}>
                  {rotulo}
                  {obligatorio === true ? (
                    <span className="campo__marca"> · obligatorio</span>
                  ) : (
                    <span className="campo__marca campo__marca--tenue">
                      {" "}
                      · opcional
                    </span>
                  )}
                </label>
                <input
                  id={`campo-${campo}`}
                  className="campo__control"
                  type={tipo ?? "text"}
                  value={borrador[campo]}
                  aria-describedby={
                    ayuda === undefined ? undefined : `ayuda-${campo}`
                  }
                  onChange={(evento) => {
                    cambiar(campo, evento.target.value);
                  }}
                />
                {ayuda !== undefined && (
                  <p className="campo__ayuda" id={`ayuda-${campo}`}>
                    {ayuda}
                  </p>
                )}
              </div>
            ))}

            <div className="campo">
              <label className="campo__rotulo" htmlFor="campo-tipoClienteId">
                Tipo de cliente
                <span className="campo__marca campo__marca--tenue">
                  {" "}
                  · opcional
                </span>
              </label>
              <select
                id="campo-tipoClienteId"
                className="campo__control"
                value={borrador.tipoClienteId}
                onChange={(evento) => {
                  cambiar("tipoClienteId", evento.target.value);
                }}
              >
                <option value="">Sin tipo</option>
                {seleccionables.map((tipo) => (
                  <option key={tipo.id} value={tipo.id}>
                    {tipo.nombre}
                  </option>
                ))}
              </select>
              {seleccionables.length === 0 && (
                <p className="campo__ayuda">
                  {avisoDeCatalogo ?? "El catálogo de tipos está vacío todavía."}
                </p>
              )}
            </div>
          </Rejilla>

          <div className="campo">
            <label className="campo__rotulo" htmlFor="campo-notas">
              Notas
              <span className="campo__marca campo__marca--tenue">
                {" "}
                · opcional
              </span>
            </label>
            <textarea
              id="campo-notas"
              className="campo__control campo__control--prosa"
              rows={4}
              value={borrador.notas}
              onChange={(evento) => {
                cambiar("notas", evento.target.value);
              }}
            />
          </div>

          <Fila>
            <button
              type="submit"
              className="boton boton--primario"
              disabled={guardando}
            >
              {guardando ? "Guardando…" : "Guardar"}
            </button>
            <Enlace href={destinoAlCancelar} className="boton boton--tenue">
              Cancelar
            </Enlace>
          </Fila>
        </Pila>
      </form>
    </Pila>
  );
}
