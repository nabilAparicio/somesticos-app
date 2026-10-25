/**
 * Los módulos de prosa de una cotización: agregar, editar, quitar y
 * reordenar (T-2, unidad C2).
 *
 * **Este archivo no decide nada.** El orden, el movimiento, la validación
 * del borrador y la pregunta de si una negativa obliga a recargar viven en
 * `./modulos.ts`, que se prueba sin navegador. Acá queda el cableado: qué
 * botón llama a qué, qué se dibuja mientras se espera y qué se muestra
 * cuando el servidor dice que no.
 *
 * ## Una petición por operación, y no un «guardar» al final
 *
 * Es la diferencia con el editor del plan de un proceso, que acumula los
 * cambios y los manda juntos. La API de módulos tiene cuatro rutas de
 * escritura, y las tiene para que la bitácora pueda decir **cuál de las
 * cuatro cosas pasó** (`worker/cotizaciones/rutas.ts`). Un envío único
 * aplastaría «agregó», «editó», «quitó» y «reordenó» en un solo hecho, y en
 * seis meses nadie podría contestar quién movió el alcance al final.
 *
 * Las cuatro devuelven **la lista entera**, así que después de cada una la
 * pantalla no recompone nada: dibuja lo que vino.
 *
 * ## Sobre un borrador se edita; sobre lo demás se lee
 *
 * `editable` lo decide el detalle con `avisoDeNoEsBorrador`, que es la misma
 * regla que el servidor hace valer con un 409. Cuando es `false` **no se
 * dibuja ningún control apagado**: un botón deshabilitado promete una
 * pantalla que no existe, y el criterio del proyecto es no dibujar puertas
 * donde no hay puerta. Se dice por qué, y se muestran los módulos.
 *
 * Lo que no hay acá es emitir, ganar, perder ni duplicar —de T-4 y T-5— ni
 * nada de líneas ni aritmética, que son de T-3.
 */
import { useEffect, useState, type FormEvent } from "react";

import type {
  FallaDeValidacion,
  ModuloDeCotizacion,
} from "../../../worker/contract";
import { Aviso } from "../../layout/Aviso";
import { Fila } from "../../layout/Fila";
import { Pila } from "../../layout/Pila";
import type { Resultado } from "../../api/peticiones";
import {
  agregarModulo,
  cargarModulos,
  editarModulo,
  quitarModulo,
  reordenarModulos,
  textoDeProblema,
} from "./api";
import {
  AVISO_MODULOS_CONGELADOS,
  AYUDA_DE_MODULOS,
  BORRADOR_DE_MODULO_VACIO,
  CATALOGO_DE_MODULOS,
  borradorDesdeModulo,
  exigeRecarga,
  hayCambioEnModulo,
  mensajeDeFalla,
  mismoOrden,
  modulosOrdenados,
  moverModulo,
  normalizarBorradorDeModulo,
  ordenDe,
  podarBorradores,
  rotuloDeTipo,
  type BorradorDeModulo,
  type BorradoresAbiertos,
} from "./modulos";

type Props = {
  readonly cotizacionId: string;
  /** Sólo un borrador se edita. Lo demás se muestra y no se toca. */
  readonly editable: boolean;
};

type Carga =
  | { fase: "cargando" }
  | { fase: "listo" }
  | { fase: "problema"; mensaje: string };

/** El desplegable de tipos, dibujado del mismo catálogo que valida el Worker. */
function Tipos() {
  return (
    <>
      <option value="">Elegir tipo…</option>
      {CATALOGO_DE_MODULOS.map((entrada) => (
        <option key={entrada.tipo} value={entrada.tipo}>
          {entrada.rotulo}
        </option>
      ))}
    </>
  );
}

export function EditorDeModulos({ cotizacionId, editable }: Props) {
  const [carga, setCarga] = useState<Carga>({ fase: "cargando" });
  const [modulos, setModulos] = useState<ModuloDeCotizacion[]>([]);
  const [abiertos, setAbiertos] = useState<BorradoresAbiertos>({});
  const [nuevo, setNuevo] = useState<BorradorDeModulo>(
    BORRADOR_DE_MODULO_VACIO,
  );
  const [fallas, setFallas] = useState<FallaDeValidacion[]>([]);
  const [problema, setProblema] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    const control = new AbortController();

    void cargarModulos(cotizacionId, control.signal).then((resultado) => {
      if (control.signal.aborted) return;

      if (resultado.estado === "ok") {
        setModulos(modulosOrdenados(resultado.valor));
        setCarga({ fase: "listo" });
        return;
      }

      setCarga({ fase: "problema", mensaje: textoDeProblema(resultado) });
    });

    return () => {
      control.abort();
    };
  }, [cotizacionId]);

  function recibir(lista: ModuloDeCotizacion[]) {
    const ordenados = modulosOrdenados(lista);
    setModulos(ordenados);
    setAbiertos((anteriores) => podarBorradores(anteriores, ordenados));
  }

  /**
   * Lo útil con una lista que quedó vieja **no es mostrar el motivo**: es
   * volver a leerla. `orden_incompleto` llega cuando alguien quitó un módulo
   * desde otra pestaña, y entonces lo que hay en pantalla es mentira —
   * reintentar con lo mismo vuelve a fallar. El mensaje se muestra igual,
   * para que el movimiento que no ocurrió no parezca haber ocurrido.
   */
  async function volverALeer() {
    const resultado = await cargarModulos(cotizacionId);
    if (resultado.estado === "ok") recibir(resultado.valor);
  }

  /** Qué hacer con lo que contestó cualquiera de las cuatro escrituras. */
  async function aplicar(
    resultado: Resultado<ModuloDeCotizacion[]>,
  ): Promise<boolean> {
    if (resultado.estado === "ok") {
      recibir(resultado.valor);
      setFallas([]);
      setProblema(null);
      return true;
    }

    if (resultado.estado === "invalido") {
      setFallas(resultado.fallas);
      setProblema(null);
      if (exigeRecarga(resultado.fallas)) await volverALeer();
      return false;
    }

    setFallas([]);
    setProblema(textoDeProblema(resultado));
    return false;
  }

  function borradorDe(modulo: ModuloDeCotizacion): BorradorDeModulo {
    return abiertos[modulo.id] ?? borradorDesdeModulo(modulo);
  }

  /**
   * Recibe el módulo entero y no su identificador: así el valor de partida
   * sale de la fila que se está dibujando, sin tener que volver a buscarla
   * en la lista con un `find` que el compilador no puede garantizar.
   */
  function escribirBorrador(
    modulo: ModuloDeCotizacion,
    cambio: Partial<BorradorDeModulo>,
  ) {
    setAbiertos((anteriores) => ({
      ...anteriores,
      [modulo.id]: {
        ...(anteriores[modulo.id] ?? borradorDesdeModulo(modulo)),
        ...cambio,
      },
    }));
  }

  function olvidarBorrador(id: string) {
    setAbiertos((anteriores) =>
      Object.fromEntries(
        Object.entries(anteriores).filter(([clave]) => clave !== id),
      ),
    );
  }

  async function guardar(modulo: ModuloDeCotizacion) {
    const normalizado = normalizarBorradorDeModulo(borradorDe(modulo));
    if (!normalizado.ok) {
      setFallas(normalizado.fallas);
      setProblema(null);
      return;
    }

    setOcupado(true);
    const ok = await aplicar(
      await editarModulo(cotizacionId, modulo.id, normalizado.datos),
    );
    setOcupado(false);

    // Guardado el módulo, el campo vuelve a mostrar lo que el servidor
    // devolvió y no lo que se tecleó: son lo mismo salvo por el recorte, y
    // el que manda es el de la base.
    if (ok) olvidarBorrador(modulo.id);
  }

  async function quitar(modulo: ModuloDeCotizacion) {
    setOcupado(true);
    await aplicar(await quitarModulo(cotizacionId, modulo.id));
    setOcupado(false);
  }

  async function mover(indice: number, direccion: -1 | 1) {
    const movidos = moverModulo(modulos, indice, direccion);
    const pedido = ordenDe(movidos);

    // Reordenar a lo que ya estaba no cambia nada: el servidor lo corta
    // antes de registrarlo, así que mandarlo no rompería nada — sería una
    // petición que ya se sabe estéril, y la pantalla puede saberlo sola.
    if (mismoOrden(pedido, ordenDe(modulos))) return;

    setOcupado(true);
    await aplicar(await reordenarModulos(cotizacionId, pedido));
    setOcupado(false);
  }

  async function agregar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (ocupado) return;

    const normalizado = normalizarBorradorDeModulo(nuevo);
    if (!normalizado.ok) {
      setFallas(normalizado.fallas);
      setProblema(null);
      return;
    }

    setOcupado(true);
    const ok = await aplicar(await agregarModulo(cotizacionId, normalizado.datos));
    setOcupado(false);

    if (ok) setNuevo(BORRADOR_DE_MODULO_VACIO);
  }

  if (carga.fase === "cargando") {
    return (
      <section aria-labelledby="modulos-de-prosa">
        <Pila>
          <h2 id="modulos-de-prosa">Módulos</h2>
          <p>Consultando…</p>
        </Pila>
      </section>
    );
  }

  return (
    <section aria-labelledby="modulos-de-prosa">
      <Pila>
        <h2 id="modulos-de-prosa">Módulos</h2>

        {carga.fase === "problema" ? (
          <Aviso tono="error">{carga.mensaje}</Aviso>
        ) : (
          <>
            {editable ? (
              <p className="texto-apagado">{AYUDA_DE_MODULOS}</p>
            ) : (
              <Aviso>{AVISO_MODULOS_CONGELADOS}</Aviso>
            )}

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

            {modulos.length === 0 ? (
              <p className="texto-apagado">
                {editable
                  ? "Todavía no hay ningún módulo. Se arma agregando uno acá abajo."
                  : "Esta cotización no lleva módulos de prosa."}
              </p>
            ) : (
              <ol className="modulos">
                {modulos.map((modulo, indice) => {
                  const rotulo = rotuloDeTipo(modulo.tipo);
                  const puesto = `${String(indice + 1)}: ${rotulo}`;

                  if (!editable) {
                    return (
                      <li className="modulo" key={modulo.id}>
                        <Pila espacio="ceñido">
                          <h3 className="modulo__rotulo">{rotulo}</h3>
                          <p className="modulo__texto">{modulo.contenido}</p>
                        </Pila>
                      </li>
                    );
                  }

                  const borrador = borradorDe(modulo);
                  const cambiado = hayCambioEnModulo(modulo, borrador);

                  return (
                    <li className="modulo" key={modulo.id}>
                      <form
                        onSubmit={(evento) => {
                          evento.preventDefault();
                          if (!ocupado) void guardar(modulo);
                        }}
                        noValidate
                      >
                        <Pila espacio="ceñido">
                          <Fila alinear="entre">
                            <div className="campo campo--crecer">
                              <select
                                className="campo__control"
                                aria-label={`Tipo del módulo ${puesto}`}
                                value={borrador.tipo}
                                onChange={(evento) => {
                                  escribirBorrador(modulo, {
                                    tipo: evento.target.value,
                                  });
                                }}
                              >
                                <Tipos />
                              </select>
                            </div>

                            <Fila>
                              <button
                                type="button"
                                className="boton boton--tenue"
                                aria-label={`Subir el módulo ${puesto}`}
                                disabled={ocupado || indice === 0}
                                onClick={() => void mover(indice, -1)}
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                className="boton boton--tenue"
                                aria-label={`Bajar el módulo ${puesto}`}
                                disabled={
                                  ocupado || indice === modulos.length - 1
                                }
                                onClick={() => void mover(indice, 1)}
                              >
                                ↓
                              </button>
                              <button
                                type="button"
                                className="boton boton--tenue"
                                aria-label={`Quitar el módulo ${puesto}`}
                                disabled={ocupado}
                                onClick={() => void quitar(modulo)}
                              >
                                Quitar
                              </button>
                            </Fila>
                          </Fila>

                          <div className="campo">
                            <textarea
                              className="campo__control campo__control--prosa"
                              aria-label={`Texto del módulo ${puesto}`}
                              rows={4}
                              value={borrador.contenido}
                              onChange={(evento) => {
                                escribirBorrador(modulo, {
                                  contenido: evento.target.value,
                                });
                              }}
                            />
                          </div>

                          {/*
                            Los dos botones aparecen **sólo cuando hay algo
                            que guardar**, en vez de estar siempre y
                            apagados: un «Guardar» apagado debajo de cada
                            módulo es seis controles muertos en una pantalla
                            donde lo normal es no haber tocado nada.

                            El rótulo visible es corto y el accesible lleva
                            el puesto: con seis módulos en la página,
                            «Guardar» a secas nombra seis botones distintos.
                          */}
                          {cambiado && (
                            <Fila>
                              <button
                                type="submit"
                                className="boton boton--primario"
                                aria-label={`Guardar el módulo ${puesto}`}
                                disabled={ocupado}
                              >
                                Guardar
                              </button>
                              <button
                                type="button"
                                className="boton boton--tenue"
                                aria-label={`Descartar los cambios del módulo ${puesto}`}
                                disabled={ocupado}
                                onClick={() => {
                                  olvidarBorrador(modulo.id);
                                }}
                              >
                                Descartar
                              </button>
                            </Fila>
                          )}
                        </Pila>
                      </form>
                    </li>
                  );
                })}
              </ol>
            )}

            {editable && (
              <form onSubmit={(evento) => void agregar(evento)} noValidate>
                <Pila espacio="ceñido">
                  <h3>Agregar un módulo</h3>

                  <div className="campo">
                    <label className="campo__rotulo" htmlFor="modulo-nuevo-tipo">
                      Tipo
                    </label>
                    <select
                      id="modulo-nuevo-tipo"
                      className="campo__control"
                      value={nuevo.tipo}
                      onChange={(evento) => {
                        setNuevo((anterior) => ({
                          ...anterior,
                          tipo: evento.target.value,
                        }));
                      }}
                    >
                      <Tipos />
                    </select>
                  </div>

                  <div className="campo">
                    <label
                      className="campo__rotulo"
                      htmlFor="modulo-nuevo-contenido"
                    >
                      Texto
                    </label>
                    <textarea
                      id="modulo-nuevo-contenido"
                      className="campo__control campo__control--prosa"
                      rows={4}
                      value={nuevo.contenido}
                      onChange={(evento) => {
                        setNuevo((anterior) => ({
                          ...anterior,
                          contenido: evento.target.value,
                        }));
                      }}
                    />
                    <p className="campo__ayuda">
                      Va al final de la lista. Después se mueve con las
                      flechas.
                    </p>
                  </div>

                  <Fila>
                    <button
                      type="submit"
                      className="boton boton--primario"
                      disabled={ocupado}
                    >
                      {ocupado ? "Guardando…" : "Agregar"}
                    </button>
                  </Fila>
                </Pila>
              </form>
            )}
          </>
        )}
      </Pila>
    </section>
  );
}
