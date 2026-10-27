/**
 * Los gastos reales de un proceso y su saldo (T-10, unidad B).
 *
 * **Este archivo no decide nada.** El reparto en las dos familias, la
 * lectura del saldo, la conversión entre centavos y lo que la persona
 * escribe, la validación del borrador y la del comprobante viven en
 * `./gastos.ts`, que se prueba sin navegador. Acá queda el cableado: qué
 * botón llama a qué, qué se dibuja mientras se espera y qué se muestra
 * cuando el servidor dice que no.
 *
 * ## La pantalla no suma
 *
 * Es la barandilla de la tajada y acá se cumple **por omisión**: no hay un
 * solo `+` sobre dinero en este archivo. El saldo y los dos subtotales salen
 * de `saldo`, que es lo que el servidor manda en el mismo cuerpo que la
 * lista (`RespuestaDeGastos`), y las tres rutas de escritura lo traen.
 *
 * Por eso el estado guarda `saldo` al lado de `movimientos` y los dos se
 * reemplazan **juntos**, en `recibir`: separarlos sería el camino para que
 * en algún redibujado la lista sea la nueva y el saldo el viejo. Es la misma
 * forma que `EditorDeLineas` con sus totales.
 *
 * ## Que no haya dónde archivar el papel no impide cargar el gasto
 *
 * Es la regla que la unidad A dejó escrita y que esta pantalla tiene que
 * respetar: sin el binding de R2, registrar y leer el saldo andan y **sólo**
 * el comprobante contesta 502. Acá eso son **dos estados separados** —
 * `problema`, del formulario y de la lista, y `problemaDelPapel`, del
 * almacén—, dibujados en dos lugares distintos. Un solo estado compartido
 * haría que una negativa del almacén tapara el formulario, o peor, que
 * apagara el botón de registrar: el abogado dejaría de poder anotar lo que
 * pagó porque un bucket no está creado.
 *
 * No hay ningún `disabled` atado a `problemaDelPapel`, y eso no es un
 * descuido: es la regla.
 *
 * ## Una petición por operación, y no un «guardar» al final
 *
 * Igual que el editor de líneas, y por el mismo motivo: la API tiene una
 * ruta por cosa que puede pasar, para que la bitácora pueda decir cuál de
 * ellas pasó —`gasto_registrado`, `anticipo_quitado`,
 * `comprobante_adjuntado`—. Las tres devuelven la cuenta entera, así que
 * después de cada una la pantalla no recompone nada: dibuja lo que vino.
 *
 * ## La precondición que este archivo no puede garantizar solo
 *
 * El efecto de carga **no reinicia el estado** cuando cambia `procesoId`, y
 * no es un olvido: `src/App.tsx` monta `DetalleDeProceso` con
 * `key={ruta.id}`, así que React descarta el subárbol entero al pasar de un
 * proceso a otro. Sin esa `key`, entre el cambio de ruta y la respuesta
 * nueva este panel seguiría mostrando los movimientos —y el saldo— del
 * proceso anterior, y sus botones mandarían escrituras al proceso nuevo con
 * identificadores del viejo.
 */
import { useEffect, useRef, useState, type FormEvent } from "react";

import type {
  FallaDeValidacion,
  MovimientoDeGasto,
  SaldoDeGastos,
} from "../../../worker/contract";
import { diaLegible } from "../../formatos";
import { Aviso } from "../../layout/Aviso";
import { Confirmacion } from "../../layout/Confirmacion";
import { Fila } from "../../layout/Fila";
import { Pila } from "../../layout/Pila";
import { Prosa } from "../../layout/Prosa";
import { Rejilla } from "../../layout/Rejilla";
import type { Resultado } from "../../api/peticiones";
import {
  cargarGastos,
  quitarMovimiento,
  registrarMovimiento,
  subirComprobante,
  textoDeProblema,
  traerComprobante,
} from "./api";
import {
  ACEPTA_COMPROBANTE,
  AVISO_COMPROBANTE_OPCIONAL,
  AVISO_MOVIMIENTO_NO_SE_EDITA,
  AVISO_SALDO_INFORMATIVO,
  AYUDA_DE_GASTOS,
  BORRADOR_DE_MOVIMIENTO_VACIO,
  SALDO_EN_CERO,
  TIPOS_DE_MOVIMIENTO,
  familiasDeMovimientos,
  firmaDelMovimiento,
  lecturaDelSaldo,
  mensajeDeFalla,
  montoLegible,
  nombreDelComprobante,
  normalizarBorradorDeMovimiento,
  validarComprobante,
  type BorradorDeMovimiento,
} from "./gastos";
import { hoyEnPanama } from "./pendientes";

type Props = {
  readonly procesoId: string;
};

type Carga =
  | { fase: "cargando" }
  | { fase: "listo" }
  | { fase: "problema"; mensaje: string };

/**
 * El desplegable de tipos, dibujado del mismo vocabulario que valida el
 * Worker.
 *
 * Los rótulos **no** salen de `TIPOS_DE_MOVIMIENTO`, que deliberadamente no
 * los lleva: salen del registro de `./gastos.ts`, que es exhaustivo sobre la
 * unión. Acá se piden familia por familia para no repartir esa tabla en dos.
 */
function Tipos({
  rotulos,
}: {
  readonly rotulos: Readonly<Record<string, string>>;
}) {
  return (
    <>
      <option value="">Elegir qué pasó…</option>
      {TIPOS_DE_MOVIMIENTO.map((tipo) => (
        <option key={tipo} value={tipo}>
          {rotulos[tipo]}
        </option>
      ))}
    </>
  );
}

export function PanelDeGastos({ procesoId }: Props) {
  const [carga, setCarga] = useState<Carga>({ fase: "cargando" });
  const [movimientos, setMovimientos] = useState<MovimientoDeGasto[]>([]);
  /**
   * **Del servidor, siempre.** Se reemplaza junto con `movimientos` y nunca
   * se calcula acá: es I-7 y la barandilla de la tajada, escritas como
   * estado.
   */
  const [saldo, setSaldo] = useState<SaldoDeGastos>(SALDO_EN_CERO);
  const [nuevo, setNuevo] = useState<BorradorDeMovimiento>(
    BORRADOR_DE_MOVIMIENTO_VACIO,
  );
  const [fallas, setFallas] = useState<FallaDeValidacion[]>([]);
  const [problema, setProblema] = useState<string | null>(null);
  /** Lo del almacén, **aparte**: ver el encabezado de este archivo. */
  const [problemaDelPapel, setProblemaDelPapel] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  /**
   * El día de hoy se calcula **una vez al montar** y no en cada dibujo, por
   * lo mismo que en el detalle: es lo que decide si una fecha es futura, y
   * recalcularlo haría que la pantalla cambiara de criterio sola a la
   * medianoche.
   */
  const [hoy] = useState(() => hoyEnPanama(new Date()));

  /**
   * El control de archivo del movimiento que se está adjuntando.
   *
   * Hay **uno solo**, oculto, y se reusa: un `<input type="file">` por fila
   * son N controles que un lector de pantalla anuncia todos, y el botón
   * visible de cada fila ya dice a cuál pertenece. Quién lo abrió se guarda
   * en `adjuntando`.
   */
  const archivo = useRef<HTMLInputElement>(null);
  const [adjuntando, setAdjuntando] = useState<MovimientoDeGasto | null>(null);

  /**
   * El movimiento que se está por quitar, mientras se pregunta.
   *
   * Quitar borra el movimiento **y su comprobante**, y los dos salían con un
   * clic. La pregunta nombra los dos (T-1 de `procesos-comodidad.md`).
   */
  const [porQuitar, setPorQuitar] = useState<MovimientoDeGasto | null>(null);

  useEffect(() => {
    const control = new AbortController();

    void cargarGastos(procesoId, control.signal).then((resultado) => {
      if (control.signal.aborted) return;

      if (resultado.estado === "ok") {
        setMovimientos(resultado.valor.movimientos);
        setSaldo(resultado.valor.saldo);
        setCarga({ fase: "listo" });
        return;
      }

      setCarga({
        fase: "problema",
        mensaje: textoDeProblema(resultado, "esa cuenta de gastos"),
      });
    });

    return () => {
      control.abort();
    };
  }, [procesoId]);

  /** La lista y su saldo se reemplazan juntos. Nunca uno sin el otro. */
  function recibir(cuenta: {
    movimientos: MovimientoDeGasto[];
    saldo: SaldoDeGastos;
  }) {
    setMovimientos(cuenta.movimientos);
    setSaldo(cuenta.saldo);
  }

  /**
   * El envoltorio por el que pasan las escrituras. Existe por el `finally`:
   * `pedir` devuelve un `Resultado` para todo lo que sabe que puede pasar,
   * pero su `respuesta.json()` del camino feliz no está cubierto, y un 200
   * con un cuerpo que no es JSON hace que la promesa **rechace**. Sin esto,
   * `ocupado` se quedaría arriba para siempre y el panel entero quedaría
   * muerto hasta recargar. Es el mismo recurso que `EditorDeLineas`.
   */
  async function conElPanelOcupado(accion: () => Promise<void>) {
    setOcupado(true);
    try {
      await accion();
    } catch {
      setProblema(
        "No se pudo completar la operación. Hay que volver a cargar la" +
          " página para ver cómo quedó la cuenta.",
      );
    } finally {
      setOcupado(false);
    }
  }

  /** Qué hacer con lo que contestó una escritura de la cuenta. */
  function aplicar(
    resultado: Resultado<{
      movimientos: MovimientoDeGasto[];
      saldo: SaldoDeGastos;
    }>,
  ): boolean {
    if (resultado.estado === "ok") {
      recibir(resultado.valor);
      setFallas([]);
      setProblema(null);
      return true;
    }

    if (resultado.estado === "invalido") {
      setFallas(resultado.fallas);
      setProblema(null);
      return false;
    }

    setFallas([]);
    setProblema(textoDeProblema(resultado, "ese movimiento"));
    return false;
  }

  async function registrar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (ocupado) return;

    const normalizado = normalizarBorradorDeMovimiento(nuevo, { hoy });
    if (!normalizado.ok) {
      setFallas(normalizado.fallas);
      setProblema(null);
      return;
    }

    await conElPanelOcupado(async () => {
      const ok = aplicar(
        await registrarMovimiento(procesoId, normalizado.datos),
      );
      // El borrador se vacía **sólo si el servidor lo guardó**: tirar lo que
      // alguien escribió porque el servidor dijo que no es perder trabajo
      // ajeno, y un importe se vuelve a tipear a mano.
      if (ok) setNuevo(BORRADOR_DE_MOVIMIENTO_VACIO);
    });
  }

  async function quitar(movimiento: MovimientoDeGasto) {
    if (ocupado) return;

    await conElPanelOcupado(async () => {
      aplicar(await quitarMovimiento(procesoId, movimiento.id));
    });
  }

  /**
   * Sube el papel que la persona eligió.
   *
   * La negativa del almacén va a `problemaDelPapel` y **no** a `problema`:
   * lo que falló es archivar el papel, y la cuenta sigue andando. Las fallas
   * de validación del archivo —no es un comprobante, pasa del tope— van al
   * mismo sitio, porque se leen en el mismo lugar y hablan de lo mismo.
   */
  async function adjuntar(movimiento: MovimientoDeGasto, elegido: File) {
    if (ocupado) return;

    const mal = validarComprobante(elegido);
    if (mal !== null) {
      setProblemaDelPapel(mensajeDeFalla(mal.motivo));
      return;
    }

    await conElPanelOcupado(async () => {
      const resultado = await subirComprobante(
        procesoId,
        movimiento.id,
        elegido,
      );

      if (resultado.estado === "ok") {
        recibir(resultado.valor);
        setProblemaDelPapel(null);
        return;
      }

      setProblemaDelPapel(textoDeProblema(resultado, "ese comprobante"));
    });
  }

  /**
   * Trae el papel y se lo entrega al navegador.
   *
   * Pasa por `fetch` y no por un enlace para que el 502 del almacén llegue
   * como texto y no como un JSON crudo en una pestaña. El `<a>` en memoria
   * es lo único que hace falta para que el navegador lo guarde: el servidor
   * ya manda `content-disposition: attachment`, y el nombre lo pone la
   * pantalla porque la llave no viaja.
   */
  async function ver(movimiento: MovimientoDeGasto) {
    if (ocupado) return;

    await conElPanelOcupado(async () => {
      const resultado = await traerComprobante(procesoId, movimiento.id);

      if (resultado.estado !== "ok") {
        setProblemaDelPapel(textoDeProblema(resultado, "ese comprobante"));
        return;
      }

      setProblemaDelPapel(null);
      const direccion = URL.createObjectURL(resultado.valor);
      const ancla = document.createElement("a");
      ancla.href = direccion;
      ancla.download = nombreDelComprobante(movimiento);
      ancla.click();
      URL.revokeObjectURL(direccion);
    });
  }

  if (carga.fase === "cargando") {
    return (
      <section aria-labelledby="gastos-del-proceso">
        <Pila>
          <h2 id="gastos-del-proceso">Gastos y anticipos</h2>
          <p>Consultando…</p>
        </Pila>
      </section>
    );
  }

  const familias = familiasDeMovimientos(movimientos, saldo);
  const rotulos = Object.fromEntries(
    familias.map((familia) => [familia.tipo, familia.rotulo]),
  );
  const lectura = lecturaDelSaldo(saldo);

  return (
    <section aria-labelledby="gastos-del-proceso">
      <Pila>
        <h2 id="gastos-del-proceso">Gastos y anticipos</h2>

        {carga.fase === "problema" ? (
          <Aviso tono="error">{carga.mensaje}</Aviso>
        ) : (
          <>
            <Prosa como="p" className="texto-apagado">
              {AYUDA_DE_GASTOS}
            </Prosa>

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

            {/* ---------------------------------------------------------
                El saldo, con su rótulo y su aviso.

                Va **arriba** de las dos listas: es la pregunta que alguien
                abre esta sección para contestar —«¿cómo va la plata de este
                trámite?»— y buscarla al pie de dos listas que crecen sería
                esconderla.

                El aviso va **antes** de la cifra y no debajo: enterarse de
                que el número no es contabilidad después de haberlo leído no
                sirve de nada. Y la marca de que es informativo está además
                en el rótulo pegado al número, para que sobreviva a que
                alguien recorte o fotocopie sólo esta parte.
                --------------------------------------------------------- */}
            <section aria-labelledby="saldo-del-proceso" className="saldo">
              <Pila espacio="ceñido">
                <h3 id="saldo-del-proceso" className="saldo__titulo">
                  {lectura.rotulo}
                </h3>

                <Aviso>{AVISO_SALDO_INFORMATIVO}</Aviso>

                <p className="suma suma--total">
                  <span className="suma__rotulo">{lectura.titular}</span>
                  <span className="suma__importe">{lectura.importe}</span>
                </p>

                <Prosa como="p" className="texto-apagado">
                  {lectura.explicacion}
                </Prosa>
              </Pila>
            </section>

            {/* ---------------------------------------------------------
                Las dos familias, en el orden del vocabulario: primero lo
                que entró y después lo que salió. Se dibujan las dos aunque
                estén vacías, y cada una dice en su lugar por qué podría
                estarlo.
                --------------------------------------------------------- */}
            {problemaDelPapel !== null && (
              <Aviso tono="error">{problemaDelPapel}</Aviso>
            )}

            {familias.map((familia) => (
              <section
                key={familia.tipo}
                className="familia"
                aria-labelledby={`familia-${familia.tipo}`}
              >
                <Pila espacio="ceñido">
                  <h3
                    id={`familia-${familia.tipo}`}
                    className="familia__rotulo"
                  >
                    {familia.rotulo}
                  </h3>

                  <Prosa como="p" className="texto-apagado">
                    {familia.ayuda}
                  </Prosa>

                  {familia.movimientos.length === 0 ? (
                    <p className="texto-apagado">{familia.vacia}</p>
                  ) : (
                    <ol className="renglones">
                      {familia.movimientos.map((movimiento) => (
                        <li className="renglon movimiento" key={movimiento.id}>
                          <Pila espacio="ceñido">
                            <Fila alinear="entre">
                              <span className="renglon__concepto">
                                {movimiento.concepto}
                                <span className="movimiento__firma">
                                  {diaLegible(movimiento.fecha)} ·{" "}
                                  {firmaDelMovimiento(movimiento)}
                                </span>
                              </span>
                              <span className="renglon__importe">
                                {montoLegible(movimiento.monto)}
                              </span>
                            </Fila>

                            <Fila>
                              {/* El estado del papel se dice con una
                                  palabra y no con un ícono ni un color: un
                                  punto verde no se lee en una fotocopia ni
                                  en un lector de pantalla. */}
                              <span
                                className={[
                                  "etiqueta",
                                  movimiento.tieneComprobante
                                    ? ""
                                    : "etiqueta--tenue",
                                ]
                                  .filter(Boolean)
                                  .join(" ")}
                              >
                                {movimiento.tieneComprobante
                                  ? "Con comprobante"
                                  : "Sin comprobante"}
                              </span>

                              {movimiento.tieneComprobante && (
                                <button
                                  type="button"
                                  className="boton boton--tenue"
                                  aria-label={`Ver el comprobante de «${movimiento.concepto}»`}
                                  disabled={ocupado}
                                  onClick={() => void ver(movimiento)}
                                >
                                  Ver el comprobante
                                </button>
                              )}

                              <button
                                type="button"
                                className="boton boton--tenue"
                                aria-label={`${
                                  movimiento.tieneComprobante
                                    ? "Reemplazar"
                                    : "Adjuntar"
                                } el comprobante de «${movimiento.concepto}»`}
                                disabled={ocupado}
                                onClick={() => {
                                  setAdjuntando(movimiento);
                                  archivo.current?.click();
                                }}
                              >
                                {movimiento.tieneComprobante
                                  ? "Reemplazar"
                                  : "Adjuntar comprobante"}
                              </button>

                              <button
                                type="button"
                                className="boton boton--tenue boton--peligro"
                                aria-label={`Quitar «${movimiento.concepto}» de la cuenta`}
                                disabled={ocupado}
                                onClick={() => {
                                  setPorQuitar(movimiento);
                                }}
                              >
                                Quitar
                              </button>
                            </Fila>
                          </Pila>
                        </li>
                      ))}
                    </ol>
                  )}

                  <p className="suma suma--subtotal">
                    <span className="suma__rotulo">
                      {familia.rotuloDelSubtotal}
                    </span>
                    <span className="suma__importe">
                      {familia.subtotalLegible}
                    </span>
                  </p>
                </Pila>
              </section>
            ))}

            <Aviso>{AVISO_COMPROBANTE_OPCIONAL}</Aviso>
            <Aviso>{AVISO_MOVIMIENTO_NO_SE_EDITA}</Aviso>

            {/* El único control de archivo del panel, oculto y reusado. El
                `value` se limpia después de cada elección para que volver a
                elegir el mismo archivo dispare el evento otra vez. */}
            <input
              ref={archivo}
              type="file"
              className="oculto-visualmente"
              tabIndex={-1}
              aria-hidden="true"
              accept={ACEPTA_COMPROBANTE}
              onChange={(evento) => {
                const elegido = evento.target.files?.[0];
                evento.target.value = "";
                if (elegido === undefined || adjuntando === null) return;
                void adjuntar(adjuntando, elegido);
              }}
            />

            {/* ---------------------------------------------------------
                Cargar un movimiento. Va al final, igual que los
                formularios de nota y de pendiente: escribir no puede
                empujar hacia abajo lo que hay que leer.
                --------------------------------------------------------- */}
            <form onSubmit={(evento) => void registrar(evento)} noValidate>
              <Pila espacio="ceñido">
                <h3>Cargar un movimiento</h3>

                <div className="campo">
                  <label className="campo__rotulo" htmlFor="gasto-concepto">
                    Concepto
                    <span className="campo__marca"> · obligatorio</span>
                  </label>
                  <input
                    id="gasto-concepto"
                    className="campo__control"
                    type="text"
                    value={nuevo.concepto}
                    onChange={(evento) => {
                      setNuevo((anterior) => ({
                        ...anterior,
                        concepto: evento.target.value,
                      }));
                    }}
                  />
                  <p className="campo__ayuda">
                    Qué se pagó o qué se recibió: «timbres del Registro
                    Público», «depósito del cliente».
                  </p>
                </div>

                <Rejilla minimo="10rem">
                  <div className="campo">
                    <label className="campo__rotulo" htmlFor="gasto-tipo">
                      Qué pasó
                      <span className="campo__marca"> · obligatorio</span>
                    </label>
                    <select
                      id="gasto-tipo"
                      className="campo__control"
                      value={nuevo.tipo}
                      onChange={(evento) => {
                        setNuevo((anterior) => ({
                          ...anterior,
                          tipo: evento.target.value,
                        }));
                      }}
                    >
                      <Tipos rotulos={rotulos} />
                    </select>
                  </div>

                  <div className="campo">
                    <label className="campo__rotulo" htmlFor="gasto-monto">
                      Importe
                      <span className="campo__marca"> · obligatorio</span>
                    </label>
                    <input
                      id="gasto-monto"
                      className="campo__control campo__control--importe"
                      type="text"
                      inputMode="decimal"
                      value={nuevo.monto}
                      onChange={(evento) => {
                        setNuevo((anterior) => ({
                          ...anterior,
                          monto: evento.target.value,
                        }));
                      }}
                    />
                    <p className="campo__ayuda">
                      El punto separa los centavos: 587.95. Siempre positivo:
                      de qué lado cae lo dice «Qué pasó».
                    </p>
                  </div>

                  <div className="campo">
                    <label className="campo__rotulo" htmlFor="gasto-fecha">
                      Cuándo se movió
                    </label>
                    <input
                      id="gasto-fecha"
                      className="campo__control"
                      type="date"
                      max={hoy}
                      value={nuevo.fecha}
                      onChange={(evento) => {
                        setNuevo((anterior) => ({
                          ...anterior,
                          fecha: evento.target.value,
                        }));
                      }}
                    />
                    <p className="campo__ayuda">
                      En blanco se lee como hoy. La factura de la mensajería
                      puede ser del mes pasado y cargarse recién ahora.
                    </p>
                  </div>
                </Rejilla>

                <Fila>
                  <button
                    type="submit"
                    className="boton boton--primario"
                    disabled={ocupado}
                  >
                    {ocupado ? "Guardando…" : "Cargar el movimiento"}
                  </button>
                </Fila>
              </Pila>
            </form>
          </>
        )}
      </Pila>

      {porQuitar !== null && (
        <Confirmacion
          titulo={`¿Quitar «${porQuitar.concepto}» (${montoLegible(
            porQuitar.monto,
          )})?`}
          accion="Quitar movimiento"
          peligro
          alCancelar={() => {
            setPorQuitar(null);
          }}
          alConfirmar={() => {
            setPorQuitar(null);
            void quitar(porQuitar);
          }}
        >
          {/* El comprobante se nombra sólo si existe: decir que se borra un
              papel que nunca se adjuntó haría dudar de qué movimiento es. */}
          {porQuitar.tieneComprobante && (
            <Prosa como="p">También se borra su comprobante.</Prosa>
          )}
        </Confirmacion>
      )}
    </section>
  );
}
