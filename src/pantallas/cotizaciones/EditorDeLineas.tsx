/**
 * Las líneas de honorarios y gastos estimados de una cotización: agregar,
 * editar, quitar y reordenar (T-3, unidad B).
 *
 * **Este archivo no decide nada.** El reparto en las dos familias, el
 * movimiento dentro de una, la conversión entre centavos y lo que la persona
 * escribe, la validación del borrador y la pregunta de si una negativa
 * obliga a recargar viven en `./lineas.ts`, que se prueba sin navegador. Acá
 * queda el cableado: qué botón llama a qué, qué se dibuja mientras se espera
 * y qué se muestra cuando el servidor dice que no.
 *
 * ## La pantalla no suma
 *
 * Es la barandilla de la tajada. Los subtotales y el total salen de
 * `totales`, que es lo que **el servidor** manda en el mismo cuerpo que la
 * lista (`RespuestaDeLineas`), y las cinco rutas lo traen. En este archivo
 * no hay una sola suma de dinero, y tampoco hay un preview del total
 * mientras se teclea: eso costaría una segunda aritmética que puede
 * discrepar de la primera por un centavo, y entonces nadie sabría cuál es el
 * número de la cotización. Se paga una petición de más.
 *
 * Por eso el estado guarda `totales` al lado de `lineas` y los dos se
 * reemplazan **juntos**, en `recibir`: separarlos sería el camino para que
 * en algún redibujado la lista sea la nueva y el total el viejo.
 *
 * ## Las dos familias se muestran separadas
 *
 * Honorarios primero y gastos estimados después, que es el orden del
 * catálogo del Worker y el orden en que se lee una propuesta. **El gasto
 * lleva su aviso de que la cifra es aproximada dentro de la sección y
 * encima de su subtotal**, no en letra chica al pie: es plata de terceros
 * que va a cambiar, y el cliente tiene que saberlo antes de firmar.
 *
 * El `orden` que la base guarda es **uno solo para las dos familias** —el
 * índice único de `0004` es sobre `(cotizacion_id, orden)`—, así que las
 * flechas mueven dentro de la familia y el `PUT` manda la lista global
 * entera. Quien resuelve eso es `moverLinea`, no este archivo.
 *
 * ## Una petición por operación, y no un «guardar» al final
 *
 * Igual que el editor de prosa, y por el mismo motivo: la API tiene cuatro
 * rutas de escritura para que la bitácora pueda decir **cuál de las cuatro
 * cosas pasó**. Las cuatro devuelven la lista entera con sus totales, así
 * que después de cada una la pantalla no recompone nada: dibuja lo que vino.
 *
 * ## Sobre un borrador se edita; sobre lo demás se lee
 *
 * `editable` lo decide el detalle con `avisoDeNoEsBorrador`, que es la misma
 * regla que el servidor hace valer con un 409. Cuando es `false` **no se
 * dibuja ningún control apagado**: un botón deshabilitado promete una
 * pantalla que no existe. Se dice por qué, y se muestran las líneas.
 *
 * ## La precondición que este archivo no puede garantizar solo
 *
 * El efecto de carga **no reinicia el estado** cuando cambia `cotizacionId`,
 * y no es un olvido: `src/App.tsx` monta `DetalleDeCotizacion` con
 * `key={ruta.id}`, así que React descarta el subárbol entero al pasar de una
 * cotización a otra. Sin esa `key`, entre el cambio de ruta y la respuesta
 * nueva este editor seguiría mostrando las líneas —y los importes— de la
 * cotización anterior en fase «listo», y sus botones mandarían escrituras a
 * la cotización nueva con identificadores de la vieja. Escribir dinero en el
 * documento equivocado.
 *
 * Lo que no hay acá es emitir, ganar, perder ni duplicar, que son de T-4 y
 * T-5.
 */
import { useEffect, useState, type FormEvent } from "react";

import type {
  FallaDeValidacion,
  LineaDeCotizacion,
  TipoProceso,
  TotalesDeCotizacion,
} from "../../../worker/contract";
import { Aviso } from "../../layout/Aviso";
import { Enlace } from "../../layout/Enlace";
import { Fila } from "../../layout/Fila";
import { Pila } from "../../layout/Pila";
import { Prosa } from "../../layout/Prosa";
import { Rejilla } from "../../layout/Rejilla";
import type { Resultado } from "../../api/peticiones";
import {
  cargarArancel,
  textoDeProblemaDelArancel,
} from "../../api/arancel";
import {
  textoDeProblema as textoDeProblemaDeCatalogo,
  cargarTiposProceso,
} from "../catalogos/api";
import {
  serviciosQueCoinciden,
  serviciosSeleccionables,
  serviciosTarifados,
  type ServicioTarifado,
} from "../catalogos/precios";
import {
  agregarLinea,
  cargarLineas,
  editarLinea,
  quitarLinea,
  reordenarLineas,
  textoDeProblema,
} from "./api";
import {
  AVISO_DEL_TOTAL,
  AVISO_LINEAS_CONGELADAS,
  AVISO_SIN_RELECTURA_DE_LINEAS,
  AYUDA_DEL_SERVICIO_TARIFADO,
  AYUDA_DE_LINEAS,
  AYUDA_DE_TUS_PRECIOS,
  BORRADOR_DE_LINEA_VACIO,
  CATALOGO_DE_CLASES,
  SIN_PRECIOS_TARIFADOS,
  TITULO_DE_TUS_PRECIOS,
  TOTALES_EN_CERO,
  avisoDePrecios,
  avisoDeTramites,
  borradorDesdeLinea,
  conServicioElegido,
  enlaceALosPrecios,
  exigeRecarga,
  familiasDeLineas,
  hayCambioEnLinea,
  hayGastoEstimado,
  importeLegible,
  lineasOrdenadas,
  mensajeDeExcepcion,
  mensajeDeFalla,
  mismoOrden,
  montoLegible,
  moverLinea,
  normalizarBorradorDeLinea,
  ordenDeLineas,
  podarBorradoresDeLinea,
  renglonDelImpuesto,
  servicioDeLaLinea,
  tramiteDeLaLinea,
  tramitesSeleccionables,
  type BorradorDeLinea,
  type BorradoresDeLinea,
  type ServicioDeLaLinea,
  type TramiteDeLaLinea,
} from "./lineas";
import { VACIO } from "./presentacion";

type Props = {
  readonly cotizacionId: string;
  /** La de la cotización, para que ningún importe quede sin unidad. */
  readonly moneda: string;
  /** Sólo un borrador se edita. Lo demás se muestra y no se toca. */
  readonly editable: boolean;
};

type Carga =
  | { fase: "cargando" }
  | { fase: "listo" }
  | { fase: "problema"; mensaje: string };

/** El desplegable de clases, dibujado del mismo catálogo que valida el Worker. */
function Clases() {
  return (
    <>
      <option value="">Elegir clase…</option>
      {CATALOGO_DE_CLASES.map((entrada) => (
        <option key={entrada.clase} value={entrada.clase}>
          {entrada.rotulo}
        </option>
      ))}
    </>
  );
}

/**
 * El desplegable de trámites, con el que la línea ya tiene siempre ofrecido
 * aunque el catálogo no lo traiga. El porqué está en `tramitesSeleccionables`.
 */
function Tramites({
  tipos,
  actual,
}: {
  readonly tipos: readonly TipoProceso[];
  readonly actual: TramiteDeLaLinea | null;
}) {
  return (
    <>
      <option value="">Ninguno</option>
      {tramitesSeleccionables(tipos, actual).map((opcion) => (
        <option key={opcion.id} value={opcion.id}>
          {opcion.nombre}
        </option>
      ))}
    </>
  );
}

/**
 * El desplegable de servicios tarifados del bufete, con el que la línea ya
 * tiene siempre ofrecido aunque el catálogo no lo traiga (T-2 de
 * `odd/tasks/precios-en-la-cotizacion.md`).
 *
 * El porqué de esa inyección está en `serviciosSeleccionables`, y acá importa
 * más que en el de trámites: el bufete puede dejar de tarifar un servicio que
 * una línea ya nombra, así que el caso es alcanzable sin que nadie se
 * equivoque.
 */
function Servicios({
  servicios,
  actual,
}: {
  readonly servicios: readonly ServicioTarifado[];
  readonly actual: ServicioDeLaLinea | null;
}) {
  return (
    <>
      <option value="">Ninguno</option>
      {serviciosSeleccionables(servicios, actual).map((opcion) => (
        <option key={opcion.id} value={opcion.id}>
          {opcion.rotulo}
        </option>
      ))}
    </>
  );
}

/**
 * **Tus precios, a la vista mientras se arma la cotización.**
 *
 * Es lo que el usuario pidió explícitamente, y es más que el prellenado: «para
 * que el usuario sepa sus propios precios en todo momento». Sin esto habría que
 * acordarse de un número o irse a otra pantalla a mirarlo, y volver.
 *
 * ## Una sola cifra por servicio, y la regla no se renegocia
 *
 * El precio del bufete y nada más. Ningún monto del Acuerdo No 49 de 2001, ni
 * al lado, ni abajo, ni en un color, ni como un «mínimo: X». Acá eso es
 * estructura: `ServicioTarifado` no tiene dónde ponerlo, así que no hay un
 * segundo número que se pueda dibujar por descuido.
 * `e2e/precios-en-cotizacion.spec.ts` cuenta las cifras que cada fila de este
 * panel renderiza para que agregar la segunda —con cualquier rótulo— se ponga
 * rojo.
 *
 * ## El vacío es el caso de hoy, y por eso tiene su propio párrafo
 *
 * Los 453 renglones del acuerdo nacen con `monto` en nulo, así que en una
 * instalación recién sembrada este panel no tiene una sola fila. Decir «no hay
 * resultados» sería mentir por omisión: lo que pasa es que nadie puso precios
 * todavía, y lo útil es decirlo y llevar a donde se ponen.
 *
 * El buscador sólo aparece cuando hay algo que buscar: un campo de búsqueda
 * sobre una lista vacía es un control que no puede hacer nada.
 */
function TusPrecios({
  servicios,
  problema,
  consulta,
  alBuscar,
  moneda,
}: {
  readonly servicios: readonly ServicioTarifado[];
  readonly problema: string | null;
  readonly consulta: string;
  readonly alBuscar: (texto: string) => void;
  readonly moneda: string;
}) {
  const aviso = avisoDePrecios(problema);
  const visibles = serviciosQueCoinciden(servicios, consulta);

  return (
    <aside
      className="tus-precios"
      aria-labelledby="tus-precios"
    >
      <Pila espacio="ceñido">
        <h3 id="tus-precios" className="tus-precios__rotulo">
          {TITULO_DE_TUS_PRECIOS}
        </h3>

        {/*
          `Prosa` y no un `<p>` pelado (§9): a ancho completo, un párrafo sin
          tope ocupa la columna entera y obliga al ojo a buscar dónde sigue.
        */}
        <Prosa como="p" className="texto-apagado">
          {AYUDA_DE_TUS_PRECIOS}
        </Prosa>

        {/*
          Neutro y no de error, a propósito: un `role="alert"` por un panel de
          consulta que no cargó interrumpiría la lectura de la pantalla entera
          para avisar de algo que no impide cotizar. El argumento está en
          `avisoDePrecios`.
        */}
        {aviso !== null && <Aviso>{aviso}</Aviso>}

        {aviso === null && servicios.length === 0 && (
          <Prosa como="p" className="texto-apagado">
            {SIN_PRECIOS_TARIFADOS}{" "}
            <Enlace href={enlaceALosPrecios()}>Ir a tus precios</Enlace>
          </Prosa>
        )}

        {servicios.length > 0 && (
          <>
            <div className="campo campo--busqueda">
              <label
                className="campo__rotulo"
                htmlFor="busqueda-de-tus-precios"
              >
                Buscar en tus precios
              </label>
              <input
                id="busqueda-de-tus-precios"
                className="campo__control"
                type="search"
                value={consulta}
                placeholder="Nombre del servicio"
                onChange={(evento) => {
                  alBuscar(evento.target.value);
                }}
              />
            </div>

            {visibles.length === 0 ? (
              <p className="texto-apagado">
                Ningún servicio tuyo coincide con «{consulta}».
              </p>
            ) : (
              <ul className="tus-precios__lista">
                {visibles.map((servicio) => (
                  <li key={servicio.id} className="tus-precios__item">
                    <span className="tus-precios__servicio">
                      {servicio.rubro !== null && (
                        <span className="tus-precios__rubro">
                          {servicio.rubro}
                        </span>
                      )}
                      {servicio.concepto}
                    </span>
                    {/*
                      La única cifra de dinero de la fila, y es la del bufete.
                      Con la moneda delante, por lo mismo que los subtotales:
                      ningún importe de esta pantalla queda sin unidad.
                    */}
                    <span className="tus-precios__importe">
                      {importeLegible(servicio.monto, moneda)}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <p className="texto-apagado" aria-live="polite">
              {visibles.length === servicios.length
                ? `${String(servicios.length)} servicio(s) tarifado(s).`
                : `${String(visibles.length)} de ${String(
                    servicios.length,
                  )} servicio(s) tarifado(s).`}
            </p>

            <p className="campo__ayuda">
              <Enlace href={enlaceALosPrecios()}>
                Editar tus precios
              </Enlace>
            </p>
          </>
        )}
      </Pila>
    </aside>
  );
}

/** Una línea en modo lectura: concepto, trámite si lleva, e importe. */
function Leida({ linea }: { readonly linea: LineaDeCotizacion }) {
  return (
    <li className="renglon">
      <Fila alinear="entre">
        <span className="renglon__concepto">
          {linea.concepto}
          {linea.tipoProcesoId !== null && (
            <span className="renglon__tramite">
              {linea.tipoProcesoNombre ?? VACIO}
            </span>
          )}
        </span>
        <span className="renglon__importe">{montoLegible(linea.monto)}</span>
      </Fila>
    </li>
  );
}

export function EditorDeLineas({ cotizacionId, moneda, editable }: Props) {
  const [carga, setCarga] = useState<Carga>({ fase: "cargando" });
  const [lineas, setLineas] = useState<LineaDeCotizacion[]>([]);
  /**
   * **Del servidor, siempre.** Se reemplazan junto con `lineas` y nunca se
   * calculan acá: es la barandilla de la tajada escrita como estado.
   */
  const [totales, setTotales] = useState<TotalesDeCotizacion>(TOTALES_EN_CERO);
  const [tipos, setTipos] = useState<TipoProceso[]>([]);
  const [problemaDeTipos, setProblemaDeTipos] = useState<string | null>(null);
  /** Lo que el bufete tarifó, para prellenar y para tener a la vista (T-2). */
  const [servicios, setServicios] = useState<ServicioTarifado[]>([]);
  const [problemaDePrecios, setProblemaDePrecios] = useState<string | null>(
    null,
  );
  const [consultaDePrecios, setConsultaDePrecios] = useState("");
  const [abiertos, setAbiertos] = useState<BorradoresDeLinea>({});
  const [nueva, setNueva] = useState<BorradorDeLinea>(BORRADOR_DE_LINEA_VACIO);
  const [fallas, setFallas] = useState<FallaDeValidacion[]>([]);
  const [problema, setProblema] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  /** La lista en pantalla quedó vieja y la relectura tampoco salió. */
  const [desactualizada, setDesactualizada] = useState(false);

  useEffect(() => {
    const control = new AbortController();

    void cargarLineas(cotizacionId, control.signal).then((resultado) => {
      if (control.signal.aborted) return;

      if (resultado.estado === "ok") {
        setLineas(lineasOrdenadas(resultado.valor.lineas));
        setTotales(resultado.valor.totales);
        setCarga({ fase: "listo" });
        return;
      }

      setCarga({ fase: "problema", mensaje: textoDeProblema(resultado) });
    });

    /*
     * El catálogo de trámites es una lectura **aparte**, y un fallo suyo no
     * puede dejar las líneas sin dibujar: el trámite es opcional, así que
     * sin catálogo se sigue pudiendo cotizar. Por eso su problema va a su
     * propio estado y no a `carga`.
     */
    void cargarTiposProceso(control.signal).then((resultado) => {
      if (control.signal.aborted) return;

      if (resultado.estado === "ok") {
        setTipos(resultado.valor);
        return;
      }

      setProblemaDeTipos(
        textoDeProblemaDeCatalogo(resultado, "el catálogo de trámites"),
      );
    });

    return () => {
      control.abort();
    };
  }, [cotizacionId]);

  /*
   * El catálogo de precios del bufete, en su **propio** efecto (T-2 de
   * `odd/tasks/precios-en-la-cotizacion.md`).
   *
   * Aparte del de arriba y no colgado de él, por dos razones que son la misma
   * dicha de dos maneras: el catálogo es del **bufete** y no de la cotización,
   * así que no se vuelve a pedir al pasar de una cotización a otra; y sólo hace
   * falta mientras se pueda escribir, que es lo que `editable` dice. Sobre una
   * emitida no se pide: no hay nada que prellenar ni nada que elegir, y una
   * lectura de 453 renglones para dibujar un panel que no se dibuja es una
   * petición que no le sirve a nadie.
   *
   * Y es una lectura **aparte** por lo mismo que la de trámites: un fallo suyo
   * no puede dejar las líneas sin dibujar, así que su problema va a su propio
   * estado y no a `carga`.
   */
  useEffect(() => {
    if (!editable) return;

    const control = new AbortController();

    void cargarArancel(control.signal).then((resultado) => {
      if (control.signal.aborted) return;

      if (resultado.estado === "ok") {
        setServicios(serviciosTarifados(resultado.valor));
        setProblemaDePrecios(null);
        return;
      }

      setProblemaDePrecios(textoDeProblemaDelArancel(resultado));
    });

    return () => {
      control.abort();
    };
  }, [editable]);

  /** La lista y sus totales se reemplazan juntos. Nunca uno sin el otro. */
  function recibir(cuerpo: {
    lineas: LineaDeCotizacion[];
    totales: TotalesDeCotizacion;
  }) {
    const ordenadas = lineasOrdenadas(cuerpo.lineas);
    setLineas(ordenadas);
    setTotales(cuerpo.totales);
    setAbiertos((anteriores) => podarBorradoresDeLinea(anteriores, ordenadas));
    // Toda respuesta del servidor —de una lectura o de una escritura— es la
    // buena, así que cualquiera cancela el estado de «lo que ves ya no vale».
    setDesactualizada(false);
  }

  /**
   * Lo útil con una lista que quedó vieja **no es mostrar el motivo**: es
   * volver a leerla, con sus totales. Devuelve si pudo; un fallo acá no se
   * descarta, se marca y se ofrece la puerta.
   */
  async function volverALeer(): Promise<boolean> {
    const resultado = await cargarLineas(cotizacionId);

    if (resultado.estado !== "ok") {
      setDesactualizada(true);
      return false;
    }

    recibir(resultado.valor);
    return true;
  }

  /** Qué hacer con lo que contestó cualquiera de las cuatro escrituras. */
  async function aplicar(
    resultado: Resultado<{
      lineas: LineaDeCotizacion[];
      totales: TotalesDeCotizacion;
    }>,
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
   * mano. Existe por el `finally`: `pedir` devuelve un `Resultado` para todo
   * lo que sabe que puede pasar, pero su `respuesta.json()` del camino feliz
   * no está cubierto, y un 200 con un cuerpo que no es JSON hace que la
   * promesa **rechace**. Sin esto, `ocupado` se quedaba arriba para siempre
   * y la pantalla entera quedaba muerta hasta recargar.
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
    peticion: () => Promise<
      Resultado<{ lineas: LineaDeCotizacion[]; totales: TotalesDeCotizacion }>
    >,
  ): Promise<boolean> {
    return conLaPantallaOcupada(async () => aplicar(await peticion()));
  }

  /** La puerta que abre el aviso de relectura fallida. */
  async function recargar() {
    const pudo = await conLaPantallaOcupada(() => volverALeer());
    if (!pudo) return;

    setFallas([]);
    setProblema(null);
  }

  function borradorDe(linea: LineaDeCotizacion): BorradorDeLinea {
    return abiertos[linea.id] ?? borradorDesdeLinea(linea);
  }

  /**
   * Recibe la línea entera y no su identificador: así el valor de partida
   * sale de la fila que se está dibujando, sin tener que volver a buscarla
   * con un `find` que el compilador no puede garantizar.
   */
  function escribirBorrador(
    linea: LineaDeCotizacion,
    cambio: Partial<BorradorDeLinea>,
  ) {
    setAbiertos((anteriores) => ({
      ...anteriores,
      [linea.id]: {
        ...(anteriores[linea.id] ?? borradorDesdeLinea(linea)),
        ...cambio,
      },
    }));
  }

  /**
   * Mover el desplegable de servicios de una línea guardada.
   *
   * Las tres ramas —desvincular, prellenar y vincular sin prellenar— las decide
   * `conServicioElegido`, en `./lineas.ts`. Acá queda sólo el cableado del
   * estado, que es lo que este archivo hace.
   */
  function elegirServicio(linea: LineaDeCotizacion, elegido: string) {
    setAbiertos((anteriores) => ({
      ...anteriores,
      [linea.id]: conServicioElegido(
        anteriores[linea.id] ?? borradorDesdeLinea(linea),
        elegido,
        servicios,
      ),
    }));
  }

  function olvidarBorrador(id: string) {
    setAbiertos((anteriores) =>
      Object.fromEntries(
        Object.entries(anteriores).filter(([clave]) => clave !== id),
      ),
    );
  }

  async function guardar(linea: LineaDeCotizacion) {
    const normalizado = normalizarBorradorDeLinea(borradorDe(linea));
    if (!normalizado.ok) {
      setFallas(normalizado.fallas);
      setProblema(null);
      return;
    }

    const ok = await escribir(() =>
      editarLinea(cotizacionId, linea.id, normalizado.datos),
    );

    // Guardada la línea, los campos vuelven a mostrar lo que el servidor
    // devolvió y no lo que se tecleó: el servidor recorta el concepto y
    // devuelve el monto en centavos, y el que manda es el de la base. Si la
    // escritura **no** salió, el borrador se queda: tirar lo que alguien
    // escribió porque el servidor dijo que no es perder trabajo ajeno.
    if (ok) olvidarBorrador(linea.id);
  }

  async function quitar(linea: LineaDeCotizacion) {
    await escribir(() => quitarLinea(cotizacionId, linea.id));
  }

  async function mover(id: string, direccion: -1 | 1) {
    const movidas = moverLinea(lineas, id, direccion);
    const pedido = ordenDeLineas(movidas);

    // Reordenar a lo que ya estaba no cambia nada: el servidor lo corta
    // antes de registrarlo, así que mandarlo no rompería nada — sería una
    // petición que ya se sabe estéril, y la pantalla puede saberlo sola.
    if (mismoOrden(pedido, ordenDeLineas(lineas))) return;

    await escribir(() => reordenarLineas(cotizacionId, pedido));
  }

  async function agregar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (ocupado) return;

    const normalizado = normalizarBorradorDeLinea(nueva);
    if (!normalizado.ok) {
      setFallas(normalizado.fallas);
      setProblema(null);
      return;
    }

    const ok = await escribir(() =>
      agregarLinea(cotizacionId, normalizado.datos),
    );

    if (ok) setNueva(BORRADOR_DE_LINEA_VACIO);
  }

  if (carga.fase === "cargando") {
    return (
      <section aria-labelledby="lineas-de-la-cotizacion">
        <Pila>
          <h2 id="lineas-de-la-cotizacion">Líneas</h2>
          <p>Consultando…</p>
        </Pila>
      </section>
    );
  }

  const avisoDelCatalogo = avisoDeTramites(problemaDeTipos);

  // El impuesto, o `null` si el bufete no lo factura (T-12). Se resuelve acá
  // y no en el JSX por lo mismo que todo lo demás de este archivo: el `.tsx`
  // no decide, y «¿va el renglón?» es una decisión.
  const impuesto = renglonDelImpuesto(totales);

  return (
    /*
      La clase existe para **declarar el contenedor de consulta**, y nada más:
      lo que decide si tus precios caben al lado de las líneas es el hueco real
      de esta sección y no el ancho de la ventana (§9). El contenedor se declara
      acá y no sobre la rejilla de abajo porque una `@container` no puede mirar
      al elemento que la establece: sólo a sus descendientes.
    */
    <section
      className="seccion-de-lineas"
      aria-labelledby="lineas-de-la-cotizacion"
    >
      <Pila>
        <h2 id="lineas-de-la-cotizacion">Líneas</h2>

        {carga.fase === "problema" ? (
          <Aviso tono="error">{carga.mensaje}</Aviso>
        ) : (
          /*
            El trabajo a la izquierda y tus precios al lado (T-2).

            Es una rejilla de dos pistas **con consulta de contenedor y no de
            ventana** (§9): lo que decide si el panel cabe al lado es el hueco
            real que la sección tiene, que en esta pantalla no es el ancho del
            navegador —el detalle vive dentro del armazón, con su propia
            columna—. Con una `@media` el panel se pondría al lado a 1024px
            aunque la columna midiera cuatrocientos píxeles.

            Y el orden del documento es **las líneas primero**: en un hueco
            angosto las dos pistas se vuelven una, y lo que queda arriba es la
            cotización. El panel es una consulta, no el trabajo.
          */
          <div className="lineas-con-precios">
            <Pila className="lineas-con-precios__lineas">
            {editable ? (
              <p className="texto-apagado">{AYUDA_DE_LINEAS}</p>
            ) : (
              <Aviso>{AVISO_LINEAS_CONGELADAS}</Aviso>
            )}

            {editable && avisoDelCatalogo !== null && (
              <Aviso>{avisoDelCatalogo}</Aviso>
            )}

            {problema !== null && <Aviso tono="error">{problema}</Aviso>}

            {desactualizada && (
              <Aviso tono="error">
                <Pila espacio="ceñido">
                  <span>{AVISO_SIN_RELECTURA_DE_LINEAS}</span>
                  <Fila>
                    <button
                      type="button"
                      className="boton"
                      disabled={ocupado}
                      onClick={() => void recargar()}
                    >
                      Volver a cargar las líneas
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

            {lineas.length === 0 && !editable ? (
              <p className="texto-apagado">
                Esta cotización no lleva líneas de importe.
              </p>
            ) : (
              familiasDeLineas(lineas, totales, editable).map((familia) => (
                <section
                  key={familia.clase}
                  className="familia"
                  aria-labelledby={`familia-${familia.clase}`}
                >
                  <Pila espacio="ceñido">
                    <h3
                      id={`familia-${familia.clase}`}
                      className="familia__rotulo"
                    >
                      {familia.rotulo}
                    </h3>

                    {/*
                      El aviso del gasto va **acá**: dentro de su familia y
                      encima de su subtotal, en el mismo cuerpo de texto que
                      todo lo demás. No es una nota al pie ni letra chica,
                      porque lo que dice —que esa cifra va a cambiar— es lo
                      que separa las dos mitades del documento.
                    */}
                    {familia.aviso !== null && <Aviso>{familia.aviso}</Aviso>}

                    {familia.lineas.length === 0 ? (
                      <p className="texto-apagado">
                        Todavía no hay ninguna. Se agregan acá abajo.
                      </p>
                    ) : (
                      <ol className="renglones">
                        {familia.lineas.map((linea, indice) => {
                          if (!editable) {
                            return <Leida key={linea.id} linea={linea} />;
                          }

                          /*
                           * El nombre accesible lleva el puesto **dentro de
                           * su familia**, que es lo que se ve: con varias
                           * líneas en la página, «Subir» a secas nombra
                           * varios botones distintos, y el número global no
                           * coincidiría con el que alguien cuenta mirando
                           * la sección.
                           */
                          const puesto = `línea ${String(indice + 1)} de ${
                            familia.rotulo
                          }`;
                          const borrador = borradorDe(linea);
                          const cambiado = hayCambioEnLinea(linea, borrador);

                          return (
                            <li className="renglon" key={linea.id}>
                              <form
                                onSubmit={(evento) => {
                                  evento.preventDefault();
                                  if (!ocupado) void guardar(linea);
                                }}
                                noValidate
                              >
                                <Pila espacio="ceñido">
                                  <Fila alinear="entre">
                                    <div className="campo campo--crecer">
                                      <input
                                        className="campo__control"
                                        type="text"
                                        aria-label={`Concepto de la ${puesto}`}
                                        value={borrador.concepto}
                                        onChange={(evento) => {
                                          escribirBorrador(linea, {
                                            concepto: evento.target.value,
                                          });
                                        }}
                                      />
                                    </div>

                                    <Fila>
                                      <button
                                        type="button"
                                        className="boton boton--tenue"
                                        aria-label={`Subir la ${puesto}`}
                                        disabled={ocupado || indice === 0}
                                        onClick={() =>
                                          void mover(linea.id, -1)
                                        }
                                      >
                                        ↑
                                      </button>
                                      <button
                                        type="button"
                                        className="boton boton--tenue"
                                        aria-label={`Bajar la ${puesto}`}
                                        disabled={
                                          ocupado ||
                                          indice === familia.lineas.length - 1
                                        }
                                        onClick={() => void mover(linea.id, 1)}
                                      >
                                        ↓
                                      </button>
                                      <button
                                        type="button"
                                        className="boton boton--tenue"
                                        aria-label={`Quitar la ${puesto}`}
                                        disabled={ocupado}
                                        onClick={() => void quitar(linea)}
                                      >
                                        Quitar
                                      </button>
                                    </Fila>
                                  </Fila>

                                  <Rejilla minimo="10rem">
                                    <div className="campo">
                                      <select
                                        className="campo__control"
                                        aria-label={`Clase de la ${puesto}`}
                                        value={borrador.clase}
                                        onChange={(evento) => {
                                          escribirBorrador(linea, {
                                            clase: evento.target.value,
                                          });
                                        }}
                                      >
                                        <Clases />
                                      </select>
                                    </div>

                                    <div className="campo">
                                      <input
                                        className="campo__control campo__control--importe"
                                        type="text"
                                        inputMode="decimal"
                                        aria-label={`Importe de la ${puesto}, en ${moneda}`}
                                        value={borrador.monto}
                                        onChange={(evento) => {
                                          escribirBorrador(linea, {
                                            monto: evento.target.value,
                                          });
                                        }}
                                      />
                                    </div>

                                    <div className="campo">
                                      <select
                                        className="campo__control"
                                        aria-label={`Trámite de la ${puesto}`}
                                        value={borrador.tipoProcesoId}
                                        onChange={(evento) => {
                                          escribirBorrador(linea, {
                                            tipoProcesoId: evento.target.value,
                                          });
                                        }}
                                      >
                                        <Tramites
                                          tipos={tipos}
                                          actual={tramiteDeLaLinea(linea)}
                                        />
                                      </select>
                                    </div>

                                    {/*
                                      De dónde salió el precio (T-2). Elegir
                                      uno prellena concepto y monto encima de
                                      lo que haya; el hueco desvincula y deja
                                      el monto libre. Las tres ramas las decide
                                      `conServicioElegido`.
                                    */}
                                    <div className="campo">
                                      <select
                                        className="campo__control"
                                        aria-label={`Servicio tarifado de la ${puesto}`}
                                        value={borrador.arancelRenglonId}
                                        onChange={(evento) => {
                                          elegirServicio(
                                            linea,
                                            evento.target.value,
                                          );
                                        }}
                                      >
                                        <Servicios
                                          servicios={servicios}
                                          actual={servicioDeLaLinea(linea)}
                                        />
                                      </select>
                                    </div>
                                  </Rejilla>

                                  {/*
                                    Los dos botones aparecen **sólo cuando
                                    hay algo que guardar**, en vez de estar
                                    siempre y apagados. Y «algo que guardar»
                                    se mide en centavos y no en texto:
                                    escribir «1500» donde está guardado
                                    «1500.00» no enciende nada, porque es el
                                    mismo importe.
                                  */}
                                  {cambiado && (
                                    <Fila>
                                      <button
                                        type="submit"
                                        className="boton boton--primario"
                                        aria-label={`Guardar la ${puesto}`}
                                        disabled={ocupado}
                                      >
                                        Guardar
                                      </button>
                                      <button
                                        type="button"
                                        className="boton boton--tenue"
                                        aria-label={`Descartar los cambios de la ${puesto}`}
                                        disabled={ocupado}
                                        onClick={() => {
                                          olvidarBorrador(linea.id);
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

                    <p className="suma suma--subtotal">
                      <span className="suma__rotulo">
                        {familia.rotuloDelSubtotal}
                      </span>
                      <span className="suma__importe">
                        {importeLegible(familia.subtotal, moneda)}
                      </span>
                    </p>
                  </Pila>
                </section>
              ))
            )}

            <Pila espacio="ceñido">
              {/*
                El ITBMS, cuando el bufete lo factura (T-12).

                **Y nada cuando no lo factura**, ni siquiera un renglón en
                cero: `renglonDelImpuesto` devuelve `null` y acá no se dibuja
                nada. Un «ITBMS (7 %) 0.00» diría que al cliente no se le
                cobra impuesto, cuando lo que pasa es que el bufete todavía
                no lo factura, y son dos conversaciones distintas con su
                contador.

                Va **entre los subtotales y el total** porque ése es el orden
                de la cuenta: primero lo que suma cada familia, después lo que
                el impuesto agrega, y al final lo que se paga.
              */}
              {impuesto !== null && (
                <p className="suma suma--impuesto">
                  <span className="suma__rotulo">{impuesto.rotulo}</span>
                  <span className="suma__importe">
                    {importeLegible(impuesto.importe, moneda)}
                  </span>
                </p>
              )}

              <p className="suma suma--total">
                <span className="suma__rotulo">Total</span>
                <span className="suma__importe">
                  {importeLegible(totales.total, moneda)}
                </span>
              </p>

              {/*
                El total lleva adentro una cifra que va a cambiar, así que lo
                dice. Se condiciona a que **haya** una línea de gasto y no a
                que su subtotal sea mayor que cero: un gasto anotado en cero
                —una tasa que todavía no se sabe cuánto es— es justo donde
                más incierta está la cifra.
              */}
              {hayGastoEstimado(lineas) && <Aviso>{AVISO_DEL_TOTAL}</Aviso>}
            </Pila>

            {editable && (
              <form onSubmit={(evento) => void agregar(evento)} noValidate>
                <Pila espacio="ceñido">
                  <h3>Añadir una línea</h3>

                  <div className="campo">
                    <label className="campo__rotulo" htmlFor="linea-nueva-concepto">
                      Concepto
                    </label>
                    <input
                      id="linea-nueva-concepto"
                      className="campo__control"
                      type="text"
                      value={nueva.concepto}
                      onChange={(evento) => {
                        setNueva((anterior) => ({
                          ...anterior,
                          concepto: evento.target.value,
                        }));
                      }}
                    />
                  </div>

                  <Rejilla minimo="10rem">
                    <div className="campo">
                      <label className="campo__rotulo" htmlFor="linea-nueva-clase">
                        Clase
                      </label>
                      <select
                        id="linea-nueva-clase"
                        className="campo__control"
                        value={nueva.clase}
                        onChange={(evento) => {
                          setNueva((anterior) => ({
                            ...anterior,
                            clase: evento.target.value,
                          }));
                        }}
                      >
                        <Clases />
                      </select>
                    </div>

                    <div className="campo">
                      <label className="campo__rotulo" htmlFor="linea-nueva-monto">
                        Importe <span className="campo__marca">{moneda}</span>
                      </label>
                      <input
                        id="linea-nueva-monto"
                        className="campo__control campo__control--importe"
                        type="text"
                        inputMode="decimal"
                        value={nueva.monto}
                        onChange={(evento) => {
                          setNueva((anterior) => ({
                            ...anterior,
                            monto: evento.target.value,
                          }));
                        }}
                      />
                      <p className="campo__ayuda">
                        El punto separa los centavos: 1500.75. La coma, si se
                        usa, es de los miles.
                      </p>
                    </div>

                    <div className="campo">
                      <label className="campo__rotulo" htmlFor="linea-nueva-tramite">
                        Trámite{" "}
                        <span className="campo__marca campo__marca--tenue">
                          opcional
                        </span>
                      </label>
                      <select
                        id="linea-nueva-tramite"
                        className="campo__control"
                        value={nueva.tipoProcesoId}
                        onChange={(evento) => {
                          setNueva((anterior) => ({
                            ...anterior,
                            tipoProcesoId: evento.target.value,
                          }));
                        }}
                      >
                        <Tramites tipos={tipos} actual={null} />
                      </select>
                      <p className="campo__ayuda">
                        Si la cotización se gana, de esta línea nace ese
                        proceso.
                      </p>
                    </div>

                    {/*
                      El servicio tarifado del bufete (T-2). Va **después** del
                      trámite y no antes, aunque prellene: el orden de los
                      controles es el orden en que se piensa la línea —qué se
                      cobra, de qué clase es, cuánto, qué trámite abre— y este
                      es un atajo sobre dos de ellos, no el punto de partida.
                      Quien ya sabe el número no tiene por qué pasar por acá.
                    */}
                    <div className="campo">
                      <label
                        className="campo__rotulo"
                        htmlFor="linea-nueva-servicio"
                      >
                        Servicio tarifado{" "}
                        <span className="campo__marca campo__marca--tenue">
                          opcional
                        </span>
                      </label>
                      <select
                        id="linea-nueva-servicio"
                        className="campo__control"
                        value={nueva.arancelRenglonId}
                        onChange={(evento) => {
                          setNueva((anterior) =>
                            conServicioElegido(
                              anterior,
                              evento.target.value,
                              servicios,
                            ),
                          );
                        }}
                      >
                        <Servicios servicios={servicios} actual={null} />
                      </select>
                      <p className="campo__ayuda">
                        {AYUDA_DEL_SERVICIO_TARIFADO}
                      </p>
                    </div>
                  </Rejilla>

                  <Fila>
                    <button
                      type="submit"
                      className="boton boton--primario"
                      disabled={ocupado}
                    >
                      {/*
                        «Añadir» y no «Agregar», que es lo que dice el
                        botón del editor de prosa justo arriba. Los dos
                        viven en la misma página, y dos controles con el
                        mismo nombre accesible son dos controles que nadie
                        —ni un lector de pantalla, ni una prueba— puede
                        distinguir.
                      */}
                      {ocupado ? "Guardando…" : "Añadir la línea"}
                    </button>
                  </Fila>
                </Pila>
              </form>
            )}
            </Pila>

            {/*
              Tus precios, al lado. **Sólo sobre un borrador**: en lo que ya
              salió no hay nada que prellenar ni nada que elegir, y un panel de
              consulta al lado de un documento congelado es ruido sobre algo que
              el cliente ya tiene.
            */}
            {editable && (
              <TusPrecios
                servicios={servicios}
                problema={problemaDePrecios}
                consulta={consultaDePrecios}
                alBuscar={setConsultaDePrecios}
                moneda={moneda}
              />
            )}
          </div>
        )}
      </Pila>
    </section>
  );
}
