/**
 * El alta y la edición de un borrador de cotización: un solo formulario.
 *
 * **Son dos campos y no doce**, y la lista corta es el contenido de la
 * decisión, no una versión recortada: de las doce columnas de `cotizacion`,
 * las otras diez las pone el servidor, las fija el esquema o son de otra
 * tarea. El `codigo` entre ellas — lo genera el servidor y la pantalla lo
 * muestra; un campo acá sería un camino para imponer desde el navegador algo
 * que la API decide.
 *
 * El `<form>` es un formulario de verdad, con `onSubmit`: así funciona la
 * tecla Enter y el navegador anuncia los campos como lo que son.
 *
 * ## Lo que la edición comprueba antes de dibujarse
 *
 * Una cotización que ya salió del borrador no se edita, y eso se dice
 * **antes** del formulario y no después de apretar «Guardar». El 409 del
 * Worker sigue estando debajo, para el instante entre esta lectura y el
 * envío; lo que no puede pasar es que alguien escriba durante cinco minutos
 * en un formulario que nunca iba a guardar.
 */
import { useEffect, useState, type FormEvent } from "react";

import type { Cliente, FallaDeValidacion } from "../../../worker/contract";
import { Aviso } from "../../layout/Aviso";
import { Enlace } from "../../layout/Enlace";
import { Fila } from "../../layout/Fila";
import { Pila } from "../../layout/Pila";
import { Rejilla } from "../../layout/Rejilla";
import { navegarA } from "../../navegacion";
import { enlaceDe } from "../../ruteo";
import { hoyEnPanama } from "../../../worker/db/momentos";
import { ORDEN_ES } from "../../formatos";
import { cargarClientes } from "../clientes/api";
import {
  actualizarCotizacion,
  cargarCotizacion,
  crearCotizacion,
  textoDeProblema,
} from "./api";
import {
  BORRADOR_DE_COTIZACION_VACIO,
  aPeticion,
  borradorDesde,
  mensajeDeFalla,
  minimoDeVencimiento,
  validarBorrador,
  type BorradorDeCotizacion,
} from "./formulario";
import { avisoDeNoEsBorrador } from "./presentacion";

type Props = {
  /** Sin esto es un alta; con esto, la edición de ese borrador. */
  readonly cotizacionId?: string;
};

type Carga =
  | { fase: "cargando" }
  | { fase: "listo" }
  /** Cargó, pero lo que cargó no se puede editar. */
  | { fase: "bloqueada"; mensaje: string }
  | { fase: "problema"; mensaje: string };

export function FormularioDeCotizacion({ cotizacionId }: Props) {
  const editando = cotizacionId !== undefined;

  const [borrador, setBorrador] = useState<BorradorDeCotizacion>(
    BORRADOR_DE_COTIZACION_VACIO,
  );
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [carga, setCarga] = useState<Carga>({ fase: "cargando" });
  const [fallas, setFallas] = useState<FallaDeValidacion[]>([]);
  const [problema, setProblema] = useState<string | null>(null);
  const [avisoDeClientes, setAvisoDeClientes] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  /**
   * El vencimiento que la cotización **ya tenía**, guardado aparte del
   * borrador editable.
   *
   * Es lo que distingue «poner un vencimiento pasado» de «reenviar el que
   * estaba», y es también la mitad baja del `min` del control. Si saliera
   * del borrador se perdería en cuanto alguien tocara el campo, que es
   * exactamente cuando hace falta.
   */
  const [venceEnActual, setVenceEnActual] = useState<string | null>(null);

  useEffect(() => {
    const control = new AbortController();

    async function cargar() {
      const lista = await cargarClientes(control.signal);
      if (control.signal.aborted) return;

      // Sin clientes no hay cotización posible —el cliente es I-1 y es el
      // único campo obligatorio—, así que acá el catálogo que no carga sí
      // se avisa fuerte. Pero no se bloquea la pantalla: el aviso explica
      // por qué el desplegable está vacío, que es más útil que una pantalla
      // de error sin contexto.
      if (lista.estado === "ok") {
        setClientes(lista.valor);
      } else {
        setAvisoDeClientes(textoDeProblema(lista));
      }

      if (cotizacionId === undefined) {
        setBorrador(BORRADOR_DE_COTIZACION_VACIO);
        setVenceEnActual(null);
        setCarga({ fase: "listo" });
        return;
      }

      const cotizacion = await cargarCotizacion(cotizacionId, control.signal);
      if (control.signal.aborted) return;

      if (cotizacion.estado !== "ok") {
        setCarga({ fase: "problema", mensaje: textoDeProblema(cotizacion) });
        return;
      }

      const bloqueo = avisoDeNoEsBorrador(cotizacion.valor);
      if (bloqueo !== null) {
        setCarga({ fase: "bloqueada", mensaje: bloqueo });
        return;
      }

      setBorrador(borradorDesde(cotizacion.valor));
      setVenceEnActual(cotizacion.valor.venceEn);
      setCarga({ fase: "listo" });
    }

    void cargar();

    return () => {
      control.abort();
    };
  }, [cotizacionId]);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (guardando) return;

    // El aviso temprano. La validación que manda es la del Worker, y su
    // respuesta se muestra igual más abajo.
    const previas = validarBorrador(borrador, {
      hoy: hoyEnPanama(new Date()),
      venceEnActual,
    });
    setFallas(previas);
    setProblema(null);
    if (previas.length > 0) return;

    setGuardando(true);
    const datos = aPeticion(borrador);
    const resultado =
      cotizacionId === undefined
        ? await crearCotizacion(datos)
        : await actualizarCotizacion(cotizacionId, datos);
    setGuardando(false);

    if (resultado.estado === "invalido") {
      setFallas(resultado.fallas);
      return;
    }
    if (resultado.estado !== "ok") {
      setProblema(textoDeProblema(resultado));
      return;
    }

    navegarA(enlaceDe({ nombre: "cotizacion", id: resultado.valor.id }));
  }

  if (carga.fase === "cargando") return <p>Consultando…</p>;

  if (carga.fase === "problema" || carga.fase === "bloqueada") {
    const destino =
      carga.fase === "bloqueada" && cotizacionId !== undefined
        ? enlaceDe({ nombre: "cotizacion", id: cotizacionId })
        : enlaceDe({ nombre: "cotizaciones" });

    return (
      <Pila>
        <Aviso tono="error">{carga.mensaje}</Aviso>
        <p>
          <Enlace href={destino}>
            {carga.fase === "bloqueada"
              ? "Ver la cotización"
              : "Volver a cotizaciones"}
          </Enlace>
        </p>
      </Pila>
    );
  }

  const ordenados = [...clientes].sort((a, b) =>
    ORDEN_ES.compare(a.nombre, b.nombre),
  );
  const destinoAlCancelar =
    cotizacionId === undefined
      ? enlaceDe({ nombre: "cotizaciones" })
      : enlaceDe({ nombre: "cotizacion", id: cotizacionId });

  return (
    <Pila espacio="holgado">
      <header>
        <Pila espacio="ceñido">
          <h1>{editando ? "Editar borrador" : "Nueva cotización"}</h1>
          <p className="texto-apagado">
            Con el cliente alcanza. El código lo pone el sistema, y el
            vencimiento se puede dejar en blanco: una cotización que no vence
            es el caso corriente.
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
                  setBorrador((anterior) => ({
                    ...anterior,
                    clienteId: evento.target.value,
                  }));
                }}
              >
                <option value="">Elegir cliente…</option>
                {ordenados.map((cliente) => (
                  <option key={cliente.id} value={cliente.id}>
                    {cliente.nombre}
                  </option>
                ))}
              </select>
              {ordenados.length === 0 && (
                <p className="campo__ayuda">
                  {avisoDeClientes ??
                    "Todavía no hay ningún cliente. Para cotizar hace falta uno."}
                </p>
              )}
            </div>

            <div className="campo">
              <label className="campo__rotulo" htmlFor="campo-venceEn">
                Vence el
                <span className="campo__marca campo__marca--tenue">
                  {" "}
                  · opcional
                </span>
              </label>
              <input
                id="campo-venceEn"
                className="campo__control"
                type="date"
                value={borrador.venceEn}
                /*
                 * El día del bufete, no el de UTC, y nunca por encima del
                 * vencimiento que la cotización ya tenía. Las dos mitades y
                 * su porqué están en `minimoDeVencimiento`.
                 */
                min={minimoDeVencimiento(new Date(), venceEnActual)}
                aria-describedby="ayuda-venceEn"
                onChange={(evento) => {
                  setBorrador((anterior) => ({
                    ...anterior,
                    venceEn: evento.target.value,
                  }));
                }}
              />
              <p className="campo__ayuda" id="ayuda-venceEn">
                Hasta qué día vale lo cotizado. En blanco, no vence.
              </p>
            </div>
          </Rejilla>

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
