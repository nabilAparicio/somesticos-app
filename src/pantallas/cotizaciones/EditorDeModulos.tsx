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
 * ## Dos lecturas al montar, y la segunda es de T-3
 *
 * Los módulos de la cotización **y** el catálogo de plantillas
 * (`GET /api/plantillas-modulo`). El catálogo hace falta por dos cosas que no
 * se pueden deducir de los módulos: el **rótulo vigente** de cada clave, que
 * el abogado edita en `/catalogos/modulos`, y **cuáles se pueden elegir**, que
 * es la lista de las activas.
 *
 * Van en un solo `Promise.all` y un fallo de cualquiera de las dos cae en la
 * misma fase `problema`. Es a propósito y no comodidad: sin el catálogo esta
 * pantalla no sabe cómo se llama ningún módulo, así que lo único que podría
 * dibujar son las claves crudas —«nota_cliente»— debajo de un desplegable
 * vacío. Eso no es una pantalla degradada, es una pantalla que miente sobre lo
 * que sabe; se dice que no se pudo leer y se ofrece la puerta.
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
 * ## La precondición que este archivo no puede garantizar solo
 *
 * El efecto de carga **no reinicia el estado** cuando cambia
 * `cotizacionId`, y no es un olvido: `src/App.tsx` monta
 * `DetalleDeCotizacion` con `key={ruta.id}`, así que React descarta el
 * subárbol entero —este componente incluido— al pasar de una cotización a
 * otra. Esa decisión está razonada allá, y explica además por qué se
 * prefirió la `key` a reiniciar el estado dentro del efecto: lo segundo es
 * el renderizado en cascada que `react-hooks` marca.
 *
 * Importa dejarlo escrito acá porque **lo que esa `key` evita no es una
 * pantalla fea**: sin ella, entre el cambio de ruta y la respuesta nueva
 * este editor seguiría mostrando los módulos de la cotización anterior en
 * fase «listo», y sus botones mandarían escrituras a la cotización nueva
 * con los identificadores de módulo de la vieja. Escribir en el documento
 * equivocado. La precondición tiene prueba propia en
 * `e2e/cotizaciones.spec.ts`, que navega de una cotización a otra del lado
 * del cliente y mide que no quede nada de la anterior en pantalla.
 *
 * Lo que no hay acá es emitir, ganar, perder ni duplicar —de T-4 y T-5— ni
 * nada de líneas ni aritmética, que son de T-3.
 */
import { useEffect, useState, type FormEvent } from "react";

import type {
  FallaDeValidacion,
  ModuloDeCotizacion,
  PlantillaDeModulo,
} from "../../../worker/contract";
import { Aviso } from "../../layout/Aviso";
import { Fila } from "../../layout/Fila";
import { Pila } from "../../layout/Pila";
import type { Resultado } from "../../api/peticiones";
import { cargarPlantillasDeModulo } from "../../api/plantillas";
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
  AVISO_SIN_RELECTURA,
  AYUDA_DE_MODULOS,
  BORRADOR_DE_MODULO_VACIO,
  borradorDesdeModulo,
  clavesDePlantillas,
  exigeRecarga,
  hayCambioEnModulo,
  mensajeDeExcepcion,
  mensajeDeFalla,
  mismoOrden,
  modulosOrdenados,
  moverModulo,
  normalizarBorradorDeModulo,
  opcionesParaModulo,
  opcionesParaNuevo,
  ordenDe,
  podarBorradores,
  rotuloDeModulo,
  type BorradorDeModulo,
  type BorradoresAbiertos,
  type OpcionDeTipo,
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

/**
 * El desplegable de tipos, dibujado del catálogo que el bufete administra.
 *
 * Recibe las opciones y no las calcula, porque **no son las mismas para los
 * dos lugares donde aparece**: el alta ofrece sólo las plantillas activas y el
 * módulo existente ofrece además la suya si la retiraron. El argumento de esa
 * asimetría está en `opcionesParaModulo`.
 */
function Tipos({ opciones }: { readonly opciones: readonly OpcionDeTipo[] }) {
  return (
    <>
      <option value="">Elegir tipo…</option>
      {opciones.map((opcion) => (
        <option key={opcion.tipo} value={opcion.tipo}>
          {opcion.rotulo}
        </option>
      ))}
    </>
  );
}

export function EditorDeModulos({ cotizacionId, editable }: Props) {
  const [carga, setCarga] = useState<Carga>({ fase: "cargando" });
  const [modulos, setModulos] = useState<ModuloDeCotizacion[]>([]);
  /** El catálogo de plantillas: de acá sale cada rótulo que se dibuja (T-3). */
  const [plantillas, setPlantillas] = useState<PlantillaDeModulo[]>([]);
  const [abiertos, setAbiertos] = useState<BorradoresAbiertos>({});
  const [nuevo, setNuevo] = useState<BorradorDeModulo>(
    BORRADOR_DE_MODULO_VACIO,
  );
  const [fallas, setFallas] = useState<FallaDeValidacion[]>([]);
  const [problema, setProblema] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  /** La lista en pantalla quedó vieja y la relectura tampoco salió. */
  const [desactualizada, setDesactualizada] = useState(false);

  useEffect(() => {
    const control = new AbortController();

    // Las dos en paralelo y no una después de la otra: son independientes —el
    // catálogo no depende de qué cotización es— y encadenarlas sumaría una
    // ida y vuelta a una pantalla que ya espera dos.
    void Promise.all([
      cargarModulos(cotizacionId, control.signal),
      cargarPlantillasDeModulo(control.signal),
    ]).then(([deModulos, deCatalogo]) => {
      if (control.signal.aborted) return;

      // El catálogo se mira primero, y no es arbitrario: sin él no hay forma
      // de rotular nada, así que un fallo suyo es el que de verdad impide
      // dibujar. Con el orden al revés, un error de módulos taparía el de
      // catálogo y el mensaje hablaría de la cotización cuando el problema es
      // el otro.
      if (deCatalogo.estado !== "ok") {
        setCarga({ fase: "problema", mensaje: textoDeProblema(deCatalogo) });
        return;
      }

      if (deModulos.estado !== "ok") {
        setCarga({ fase: "problema", mensaje: textoDeProblema(deModulos) });
        return;
      }

      setPlantillas(deCatalogo.valor);
      setModulos(modulosOrdenados(deModulos.valor));
      setCarga({ fase: "listo" });
    });

    return () => {
      control.abort();
    };
  }, [cotizacionId]);

  function recibir(lista: ModuloDeCotizacion[]) {
    const ordenados = modulosOrdenados(lista);
    setModulos(ordenados);
    setAbiertos((anteriores) => podarBorradores(anteriores, ordenados));
    // Toda lista que llega del servidor —de una lectura o de una
    // escritura— es la buena, así que cualquiera de las dos cancela el
    // estado de «lo que ves ya no vale».
    setDesactualizada(false);
  }

  /**
   * Lo útil con una lista que quedó vieja **no es mostrar el motivo**: es
   * volver a leerla. `orden_incompleto` llega cuando alguien quitó un módulo
   * desde otra pestaña, y entonces lo que hay en pantalla es mentira —
   * reintentar con lo mismo vuelve a fallar. El mensaje se muestra igual,
   * para que el movimiento que no ocurrió no parezca haber ocurrido.
   *
   * Devuelve si pudo. **Un fallo acá no se descarta**, que es lo que hacía
   * la primera versión: dejaba la lista vieja en pantalla debajo de un
   * mensaje que decía que estaba vieja, sin nada que hacer al respecto.
   * Ahora se marca, se dice con `AVISO_SIN_RELECTURA` y se ofrece la
   * puerta.
   */
  async function volverALeer(): Promise<boolean> {
    const resultado = await cargarModulos(cotizacionId);

    if (resultado.estado !== "ok") {
      setDesactualizada(true);
      return false;
    }

    recibir(resultado.valor);
    return true;
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

  /**
   * El envoltorio por el que pasan las cuatro escrituras y la relectura a
   * mano. Existe por el `finally`.
   *
   * `pedir` devuelve un `Resultado` para todo lo que sabe que puede pasar,
   * pero su `respuesta.json()` del camino feliz no está cubierto: un 200
   * con un cuerpo que no es JSON hace que la promesa **rechace**. Sin este
   * `finally`, `ocupado` se quedaba arriba para siempre y la pantalla
   * entera quedaba muerta hasta recargar — el mismo error de forma que el
   * 409 que escribía de la unidad C1: el camino feliz cuidado y el otro sin
   * existir.
   *
   * El `catch` no está de adorno al lado del `finally`: destrabar los
   * controles sin decir nada deja a la persona apretando un botón que
   * aparentemente no hace nada.
   */
  async function conLaPantallaOcupada(
    accion: () => Promise<boolean>,
  ): Promise<boolean> {
    setOcupado(true);
    try {
      return await accion();
    } catch (error: unknown) {
      setFallas([]);
      setProblema(
        textoDeProblema({
          estado: "falla",
          mensaje: mensajeDeExcepcion(error),
        }),
      );
      return false;
    } finally {
      setOcupado(false);
    }
  }

  function escribir(
    peticion: () => Promise<Resultado<ModuloDeCotizacion[]>>,
  ): Promise<boolean> {
    return conLaPantallaOcupada(async () => aplicar(await peticion()));
  }

  /** La puerta que abre `AVISO_SIN_RELECTURA`: volver a intentar la lectura. */
  async function recargar() {
    const pudo = await conLaPantallaOcupada(() => volverALeer());
    if (!pudo) return;

    // La lista nueva es la verdad, así que lo que se dijo de la vieja
    // —tanto la falla como el problema— ya no habla de nada.
    setFallas([]);
    setProblema(null);
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
    // Las claves salen del catálogo que esta pantalla ya tiene cargado (T-6).
    // No hace falta pedirlo de nuevo ni preguntarse si está: la fase `listo` no
    // existe sin él —un fallo de cualquiera de las dos lecturas cae en
    // `problema`— y sin catálogo esta pantalla no sabría dibujar un rótulo.
    const normalizado = normalizarBorradorDeModulo(
      borradorDe(modulo),
      clavesDePlantillas(plantillas),
    );
    if (!normalizado.ok) {
      setFallas(normalizado.fallas);
      setProblema(null);
      return;
    }

    const ok = await escribir(() =>
      editarModulo(cotizacionId, modulo.id, normalizado.datos),
    );

    // Guardado el módulo, el campo vuelve a mostrar lo que el servidor
    // devolvió y no lo que se tecleó. No son siempre lo mismo —el servidor
    // recorta, y mañana podría normalizar más—, y el que manda es el de la
    // base. Si la escritura **no** salió, el borrador se queda: tirar lo
    // que alguien escribió porque el servidor dijo que no es perder
    // trabajo ajeno para no guardar estado.
    if (ok) olvidarBorrador(modulo.id);
  }

  async function quitar(modulo: ModuloDeCotizacion) {
    await escribir(() => quitarModulo(cotizacionId, modulo.id));
  }

  async function mover(indice: number, direccion: -1 | 1) {
    const movidos = moverModulo(modulos, indice, direccion);
    const pedido = ordenDe(movidos);

    // Reordenar a lo que ya estaba no cambia nada: el servidor lo corta
    // antes de registrarlo, así que mandarlo no rompería nada — sería una
    // petición que ya se sabe estéril, y la pantalla puede saberlo sola.
    if (mismoOrden(pedido, ordenDe(modulos))) return;

    await escribir(() => reordenarModulos(cotizacionId, pedido));
  }

  async function agregar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (ocupado) return;

    const normalizado = normalizarBorradorDeModulo(
      nuevo,
      clavesDePlantillas(plantillas),
    );
    if (!normalizado.ok) {
      setFallas(normalizado.fallas);
      setProblema(null);
      return;
    }

    const ok = await escribir(() =>
      agregarModulo(cotizacionId, normalizado.datos),
    );

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

            {/*
              El peor estado de esta pantalla, y el único que lleva botón
              propio: el servidor avisó que la lista quedó vieja y la
              relectura tampoco salió. Un aviso que dice «esto que ves no
              vale» sin con qué arreglarlo es una pared sin puerta, así que
              acá va la puerta.
            */}
            {desactualizada && (
              <Aviso tono="error">
                <Pila espacio="ceñido">
                  <span>{AVISO_SIN_RELECTURA}</span>
                  <Fila>
                    <button
                      type="button"
                      className="boton"
                      disabled={ocupado}
                      onClick={() => void recargar()}
                    >
                      Volver a cargar los módulos
                    </button>
                  </Fila>
                </Pila>
              </Aviso>
            )}

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
                  const rotulo = rotuloDeModulo(plantillas, modulo.tipo);
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
                                {/*
                                  Las opciones de **este** módulo, que incluyen
                                  su propia plantilla si la dieron de baja.
                                  Ver `opcionesParaModulo`: sin eso el control
                                  mostraría otro tipo y el primer «Guardar» se
                                  lo cambiaría.
                                */}
                                <Tipos
                                  opciones={opcionesParaModulo(
                                    plantillas,
                                    modulo.tipo,
                                  )}
                                />
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
                      {/* Para uno nuevo, sólo lo que sigue vigente. */}
                      <Tipos opciones={opcionesParaNuevo(plantillas)} />
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
