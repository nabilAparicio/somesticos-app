/**
 * Generar una cotización desde una descripción en prosa (T-9,
 * `docs/diseno.md` §8 «La entrada»).
 *
 * **Son tres campos y un botón**, y la lista corta es el contenido de la
 * decisión: el cliente, porque es I-1 y ninguna cotización existe sin él; el
 * vencimiento, que es opcional y se puede corregir después; y la prosa, que
 * es todo lo demás. No hay un campo para el modelo, ni para la cantidad de
 * módulos, ni para el estilo: cualquiera de los tres sería una decisión del
 * despliegue puesta en manos de quien escribe, y ninguna de las tres mejora
 * la propuesta tanto como escribir dos renglones más de descripción.
 *
 * ## Lo que sale es un borrador, y se ve que lo es
 *
 * No hay pantalla de resultado, no hay vista previa y no hay un botón de
 * «aceptar la propuesta». Lo generado **cae en el detalle de la cotización
 * nueva**, que es la misma pantalla donde se edita cualquier otro borrador:
 * con su estado dibujado, sus módulos en sus editores y sus líneas con sus
 * importes. Sin magia.
 *
 * Es deliberado, y la alternativa estaba a mano: una pantalla intermedia que
 * muestre lo que el modelo propuso y pida confirmación. No se hizo por dos
 * razones. La primera es que esa pantalla sería un segundo editor de módulos
 * y de líneas, con su propio estado y sus propias reglas, al lado del que ya
 * existe. La segunda es la que decide: **una confirmación hace parecer que
 * lo generado es un documento terminado**, y lo que es es un primer borrador
 * — lo valioso de esta tarea es que el abogado empiece desde algo, no que
 * apruebe algo.
 *
 * ## Lo que el abogado escribió no se pierde nunca
 *
 * Es el requisito más fácil de romper de la tarea, y el más caro: una
 * descripción de cinco renglones que desaparece porque el proveedor tuvo un
 * mal minuto es la razón por la que nadie vuelve a usar la pantalla. Acá lo
 * sostiene una cosa concreta y una ausencia:
 *
 *  - el estado del borrador **no se toca** en ninguna rama de falla — se
 *    pone el aviso y se devuelve el control, y nada más;
 *  - **no hay ningún `setBorrador(BORRADOR_DE_GENERACION_VACIO)`** después
 *    del envío, que es la línea que se escribe sola cuando uno piensa en el
 *    camino feliz. En el camino feliz no hace falta: la pantalla se
 *    desmonta porque se navega al detalle.
 *
 * Lo prueba `e2e/generar.spec.ts`, con los cuatro motivos y con un token de
 * setenta caracteres adentro de la descripción.
 */
import { useEffect, useState, type FormEvent } from "react";

import type { Cliente, FallaDeValidacion } from "../../../worker/contract";
import { hoyEnPanama } from "../../../worker/db/momentos";
import { Aviso } from "../../layout/Aviso";
import { Enlace } from "../../layout/Enlace";
import { Fila } from "../../layout/Fila";
import { Pila } from "../../layout/Pila";
import { Rejilla } from "../../layout/Rejilla";
import { navegarA } from "../../navegacion";
import { enlaceDe } from "../../ruteo";
import { cargarClientes } from "../clientes/api";
import { generarCotizacion, textoDeProblema } from "./api";
import {
  avisoDelDesplegable,
  clientesSeleccionables,
  mensajeDeFalla,
  minimoDeVencimiento,
} from "./formulario";
import {
  BORRADOR_DE_GENERACION_VACIO,
  aPeticionDeGeneracion,
  validarBorradorDeGeneracion,
  type BorradorDeGeneracion,
} from "./generar";

export function GenerarCotizacion() {
  const [borrador, setBorrador] = useState<BorradorDeGeneracion>(
    BORRADOR_DE_GENERACION_VACIO,
  );
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [fallas, setFallas] = useState<FallaDeValidacion[]>([]);
  const [problema, setProblema] = useState<string | null>(null);
  const [avisoDeClientes, setAvisoDeClientes] = useState<string | null>(null);
  const [generando, setGenerando] = useState(false);

  useEffect(() => {
    const control = new AbortController();

    void cargarClientes(control.signal).then((lista) => {
      if (control.signal.aborted) return;

      // Sin clientes no hay cotización posible —el cliente es I-1—, así que
      // el catálogo que no carga se avisa fuerte. Pero no se bloquea la
      // pantalla: el aviso explica por qué el desplegable está vacío, que es
      // más útil que una pantalla de error sin contexto.
      if (lista.estado === "ok") setClientes(lista.valor);
      else setAvisoDeClientes(textoDeProblema(lista));

      setCargando(false);
    });

    return () => {
      control.abort();
    };
  }, []);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (generando) return;

    // El aviso temprano, y acá no es sólo cortesía: lo que esta pantalla
    // manda tarda treinta segundos y cuesta plata, así que un envío que el
    // servidor va a rechazar igual se paga dos veces.
    const previas = validarBorradorDeGeneracion(borrador, {
      hoy: hoyEnPanama(new Date()),
      venceEnActual: null,
    });
    setFallas(previas);
    setProblema(null);
    if (previas.length > 0) return;

    setGenerando(true);
    const resultado = await generarCotizacion(aPeticionDeGeneracion(borrador));
    setGenerando(false);

    if (resultado.estado === "invalido") {
      setFallas(resultado.fallas);
      return;
    }

    if (resultado.estado !== "ok") {
      // **Acá no se toca el borrador.** El motivo del modelo viene entero
      // desde `textoDeProblema`, que lo resolvió contra el vocabulario de
      // T-8: los siete dicen cosas distintas porque lo que hay que hacer con
      // cada uno es distinto.
      setProblema(textoDeProblema(resultado));
      return;
    }

    navegarA(enlaceDe({ nombre: "cotizacion", id: resultado.valor.id }));
  }

  if (cargando) return <p>Consultando…</p>;

  const seleccionables = clientesSeleccionables(clientes, null);
  const avisoDeLaLista = avisoDelDesplegable(avisoDeClientes, false);

  return (
    <Pila espacio="holgado">
      <header>
        <Pila espacio="ceñido">
          <h1>Generar una cotización</h1>
          <p className="texto-apagado">
            Contá el encargo en prosa y sale un <strong>borrador</strong> con
            sus módulos y sus líneas, para editar. Los importes los propone el
            asistente y los suma el sistema; nada se emite hasta que vos lo
            decidas.
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
              <label className="campo__rotulo" htmlFor="campo-generar-cliente">
                Cliente
                <span className="campo__marca"> · obligatorio</span>
              </label>
              <select
                id="campo-generar-cliente"
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
                {seleccionables.map((opcion) => (
                  <option key={opcion.id} value={opcion.id}>
                    {opcion.nombre}
                  </option>
                ))}
              </select>
              {avisoDeLaLista !== null && (
                <p className="campo__ayuda">{avisoDeLaLista}</p>
              )}
              {avisoDeLaLista === null && seleccionables.length === 0 && (
                <p className="campo__ayuda">
                  Todavía no hay ningún cliente. Para cotizar hace falta uno.
                </p>
              )}
            </div>

            <div className="campo">
              <label className="campo__rotulo" htmlFor="campo-generar-vence">
                Vence el
                <span className="campo__marca campo__marca--tenue">
                  {" "}
                  · opcional
                </span>
              </label>
              <input
                id="campo-generar-vence"
                className="campo__control"
                type="date"
                value={borrador.venceEn}
                /*
                 * El día del bufete y no el de UTC. Acá no hay vencimiento
                 * guardado que respetar —la cotización todavía no existe—,
                 * así que el mínimo es hoy a secas. El porqué del huso está
                 * entero en `minimoDeVencimiento`.
                 */
                min={minimoDeVencimiento(new Date(), null)}
                aria-describedby="ayuda-generar-vence"
                onChange={(evento) => {
                  setBorrador((anterior) => ({
                    ...anterior,
                    venceEn: evento.target.value,
                  }));
                }}
              />
              <p className="campo__ayuda" id="ayuda-generar-vence">
                Hasta qué día vale lo cotizado. En blanco, no vence.
              </p>
            </div>
          </Rejilla>

          <div className="campo">
            <label
              className="campo__rotulo"
              htmlFor="campo-generar-descripcion"
            >
              Descripción del encargo
              <span className="campo__marca"> · obligatorio</span>
            </label>
            <textarea
              id="campo-generar-descripcion"
              className="campo__control campo__control--prosa"
              value={borrador.descripcion}
              rows={8}
              aria-describedby="ayuda-generar-descripcion"
              placeholder="Divorcio de mutuo acuerdo, hay bienes, el cliente pide pago diferido."
              onChange={(evento) => {
                setBorrador((anterior) => ({
                  ...anterior,
                  descripcion: evento.target.value,
                }));
              }}
            />
            <p className="campo__ayuda" id="ayuda-generar-descripcion">
              De qué se trata, qué pidió el cliente y lo que ya sepas del
              caso. Cuanto más concreto, menos hay que corregir después.
            </p>
          </div>

          <Fila>
            <button
              type="submit"
              className="boton boton--primario"
              disabled={generando}
            >
              {generando ? "Generando…" : "Generar el borrador"}
            </button>
            <Enlace
              href={enlaceDe({ nombre: "cotizaciones" })}
              className="boton boton--tenue"
            >
              Cancelar
            </Enlace>
          </Fila>

          {generando && (
            <p className="texto-apagado" aria-live="polite">
              Leyendo el encargo y armando la propuesta. Puede tardar algunos
              segundos; lo que escribiste no se pierde.
            </p>
          )}
        </Pila>
      </form>
    </Pila>
  );
}
