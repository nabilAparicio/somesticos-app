/**
 * La administración de un catálogo plano: `area` o `tipo_cliente`.
 *
 * Los dos son un nombre y una marca de vigencia, así que son una pantalla
 * sola parametrizada, no dos copias. Lo que cambia entre ellos son los
 * textos y las tres funciones de la API.
 *
 * La edición es **en la fila**, sin pantalla aparte. Un catálogo se toca de a
 * ratos —se agrega «ONG», se corrige un acento— y mandar a alguien a otra
 * pantalla para cambiar una palabra es el camino por el que el catálogo deja
 * de mantenerse.
 *
 * Los dos botones del final de cada fila no son lo mismo y la pantalla lo
 * dice: **dar de baja** saca la fila de lo que se puede elegir y la deja
 * válida para lo ya guardado; **borrar** la saca de la base, y solo funciona
 * si no cuelga nada de ella. Cuando cuelga algo, el servidor contesta 409 y
 * acá se lee qué lo impide y cuántos son.
 *
 * ## La historia, desplegable en la fila (T-15)
 *
 * Estas dos entidades no tienen pantalla de detalle, y no la van a tener:
 * son un nombre y una marca de vigencia, así que una pantalla propia sería
 * una pantalla entera para un campo, con ruta, enlace y navegación de vuelta
 * inventados. La bitácora va entonces **donde está la fila**, que además es
 * donde mira quien acaba de dar de baja un área por error.
 *
 * Se pide **al abrirse** y no al pintar la lista: una tabla de treinta áreas
 * serían treinta peticiones que casi nadie va a leer. Y **de a una por vez**
 * —la regla está en `alternarHistoria`, probada aparte— para que la tabla no
 * se convierta en una pared de texto.
 */
import { Fragment, useEffect, useState } from "react";

import type {
  DatosDeCatalogo,
  FallaDeValidacion,
} from "../../../worker/contract";
import { Aviso } from "../../layout/Aviso";
import { ContenedorDeTabla } from "../../layout/ContenedorDeTabla";
import { Fila } from "../../layout/Fila";
import { Pila } from "../../layout/Pila";
import type { PaginaDeBitacora } from "../../bitacora";
import { mensajeDeFalla } from "../../mensajes";
import { Bitacora, type EstadoDeBitacora } from "../Bitacora";
import { textoDeProblema, type Resultado } from "./api";
import {
  BORRADOR_DE_CATALOGO_VACIO,
  aPeticionDeCatalogo,
  borradorDeCatalogo,
  mensajeDeBloqueo,
  validarCatalogo,
  type BorradorDeCatalogo,
} from "./formulario";
import { alternarHistoria, estadoDe, ordenarCatalogo } from "./presentacion";

/** Las tres columnas de la tabla, para el `colSpan` de la fila desplegada. */
const COLUMNAS = 3;

/** Lo mínimo que esta pantalla necesita saber de una fila de catálogo. */
export interface FilaDeCatalogo {
  readonly id: string;
  readonly nombre: string;
  readonly activo: boolean;
}

type Props<T extends FilaDeCatalogo> = {
  readonly titulo: string;
  /** Cómo se nombra UNA fila: «esa área», «ese tipo de cliente». */
  readonly sujeto: string;
  readonly explicacion: string;
  readonly rotuloDeAlta: string;
  readonly cargar: (signal: AbortSignal) => Promise<Resultado<T[]>>;
  readonly guardar: (
    id: string | null,
    datos: DatosDeCatalogo,
  ) => Promise<Resultado<T>>;
  readonly borrar: (id: string) => Promise<Resultado<null>>;
  /** La historia de una fila. Se pide recién cuando alguien la despliega. */
  readonly cargarBitacora: (
    id: string,
    signal: AbortSignal,
  ) => Promise<Resultado<PaginaDeBitacora>>;
};

type Carga =
  | { fase: "cargando" }
  | { fase: "listo" }
  | { fase: "problema"; mensaje: string };

export function ListaDeCatalogo<T extends FilaDeCatalogo>({
  titulo,
  sujeto,
  explicacion,
  rotuloDeAlta,
  cargar,
  guardar,
  borrar,
  cargarBitacora,
}: Props<T>) {
  const [filas, setFilas] = useState<T[]>([]);
  const [carga, setCarga] = useState<Carga>({ fase: "cargando" });
  const [nueva, setNueva] = useState<BorradorDeCatalogo>(
    BORRADOR_DE_CATALOGO_VACIO,
  );
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [edicion, setEdicion] = useState<BorradorDeCatalogo>(
    BORRADOR_DE_CATALOGO_VACIO,
  );
  const [fallas, setFallas] = useState<FallaDeValidacion[]>([]);
  const [problema, setProblema] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  /** Qué fila tiene la historia desplegada, y qué se sabe de ella. */
  const [historiaDe, setHistoriaDe] = useState<string | null>(null);
  const [historia, setHistoria] = useState<EstadoDeBitacora>({
    fase: "cargando",
  });

  useEffect(() => {
    const control = new AbortController();

    void cargar(control.signal).then((resultado) => {
      if (control.signal.aborted) return;

      if (resultado.estado === "ok") {
        setFilas(resultado.valor);
        setCarga({ fase: "listo" });
        return;
      }
      setCarga({
        fase: "problema",
        mensaje: textoDeProblema(resultado, sujeto),
      });
    });

    return () => {
      control.abort();
    };
  }, [cargar, sujeto]);

  /**
   * La historia de la fila desplegada, pedida recién acá.
   *
   * Depende de `historiaDe`, así que no corre al pintar la lista: corre la
   * primera vez que alguien abre una fila, y de nuevo cada vez que se abre
   * otra. Volver a pedirla al reabrir la misma fila es deliberado: entre una
   * apertura y la otra alguien pudo editarla, y una historia cacheada que se
   * quedó vieja es peor que una petición de más.
   */
  useEffect(() => {
    if (historiaDe === null) return undefined;

    const control = new AbortController();

    void cargarBitacora(historiaDe, control.signal).then((resultado) => {
      if (control.signal.aborted) return;

      setHistoria(
        resultado.estado === "ok"
          ? { fase: "listo", entradas: resultado.valor }
          : { fase: "problema", mensaje: textoDeProblema(resultado, sujeto) },
      );
    });

    return () => {
      control.abort();
    };
  }, [cargarBitacora, historiaDe, sujeto]);

  /** Relee la lista entera: es más corto que reconciliar a mano y no miente. */
  async function recargar() {
    const resultado = await cargar(new AbortController().signal);
    if (resultado.estado === "ok") setFilas(resultado.valor);
  }

  async function escribir(id: string | null, borrador: BorradorDeCatalogo) {
    const previas = validarCatalogo(borrador);
    setFallas(previas);
    setProblema(null);
    if (previas.length > 0) return;

    setOcupado(true);
    const resultado = await guardar(id, aPeticionDeCatalogo(borrador));
    setOcupado(false);

    if (resultado.estado === "invalido") {
      setFallas(resultado.fallas);
      return;
    }
    if (resultado.estado !== "ok") {
      setProblema(textoDeProblema(resultado, sujeto));
      return;
    }

    if (id === null) setNueva(BORRADOR_DE_CATALOGO_VACIO);
    setEditandoId(null);
    await recargar();
  }

  async function eliminar(fila: T) {
    setFallas([]);
    setProblema(null);
    setOcupado(true);
    const resultado = await borrar(fila.id);
    setOcupado(false);

    if (resultado.estado === "conflicto") {
      // El 409 con nombre y cuenta. Sin esto, «no se pudo borrar» deja a
      // alguien buscando a mano qué cuelga de la fila.
      setProblema(mensajeDeBloqueo(resultado.bloqueo, fila.nombre));
      return;
    }
    if (resultado.estado !== "ok") {
      setProblema(textoDeProblema(resultado, sujeto));
      return;
    }

    await recargar();
  }

  const visibles = ordenarCatalogo(filas);

  return (
    <section aria-labelledby={`catalogo-${titulo}`}>
      <Pila>
        <header>
          <Pila espacio="ceñido">
            <h2 id={`catalogo-${titulo}`}>{titulo}</h2>
            <p className="texto-apagado">{explicacion}</p>
          </Pila>
        </header>

        {carga.fase === "cargando" && <p>Consultando…</p>}

        {carga.fase === "problema" && (
          <Aviso tono="error">{carga.mensaje}</Aviso>
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

        {carga.fase === "listo" && (
          <>
            {visibles.length === 0 ? (
              <Aviso>
                Todavía no hay ninguna fila en este catálogo. Lo que se cargue
                acá es lo que después se puede elegir.
              </Aviso>
            ) : (
              <ContenedorDeTabla rotulo={titulo}>
                <thead>
                  <tr>
                    <th scope="col">Nombre</th>
                    <th scope="col">Estado</th>
                    <th scope="col">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((fila) => (
                    <Fragment key={fila.id}>
                    <tr>
                      {editandoId === fila.id ? (
                        <>
                          <th scope="row">
                            <input
                              id={`editar-${fila.id}`}
                              className="campo__control"
                              type="text"
                              aria-label={`Nombre de ${fila.nombre}`}
                              value={edicion.nombre}
                              onChange={(evento) => {
                                setEdicion((anterior) => ({
                                  ...anterior,
                                  nombre: evento.target.value,
                                }));
                              }}
                            />
                          </th>
                          <td>
                            <label className="campo__casilla">
                              <input
                                type="checkbox"
                                checked={edicion.activo}
                                onChange={(evento) => {
                                  setEdicion((anterior) => ({
                                    ...anterior,
                                    activo: evento.target.checked,
                                  }));
                                }}
                              />
                              Vigente
                            </label>
                          </td>
                          <td>
                            <Fila>
                              <button
                                type="button"
                                className="boton boton--primario"
                                disabled={ocupado}
                                onClick={() => {
                                  void escribir(fila.id, edicion);
                                }}
                              >
                                Guardar
                              </button>
                              <button
                                type="button"
                                className="boton boton--tenue"
                                onClick={() => {
                                  setEditandoId(null);
                                  setFallas([]);
                                }}
                              >
                                Cancelar
                              </button>
                            </Fila>
                          </td>
                        </>
                      ) : (
                        <>
                          <th scope="row">{fila.nombre}</th>
                          <td>
                            <span
                              className={
                                fila.activo
                                  ? "etiqueta"
                                  : "etiqueta etiqueta--tenue"
                              }
                            >
                              {estadoDe(fila.activo)}
                            </span>
                          </td>
                          <td>
                            <Fila>
                              <button
                                type="button"
                                className="boton"
                                onClick={() => {
                                  setEditandoId(fila.id);
                                  setEdicion(borradorDeCatalogo(fila));
                                  setFallas([]);
                                  setProblema(null);
                                }}
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                className="boton boton--tenue"
                                disabled={ocupado}
                                onClick={() => {
                                  void escribir(fila.id, {
                                    nombre: fila.nombre,
                                    activo: !fila.activo,
                                  });
                                }}
                              >
                                {fila.activo ? "Dar de baja" : "Reactivar"}
                              </button>
                              <button
                                type="button"
                                className="boton boton--tenue"
                                disabled={ocupado}
                                onClick={() => {
                                  void eliminar(fila);
                                }}
                              >
                                Borrar
                              </button>
                              {/* El rótulo nombra la fila: en una tabla de
                                  treinta, «Historia» a secas se repite
                                  treinta veces y deja de decir cuál. */}
                              <button
                                type="button"
                                className="boton boton--tenue"
                                aria-expanded={historiaDe === fila.id}
                                aria-controls={`historia-${fila.id}`}
                                onClick={() => {
                                  // «Consultando…» se pone acá y no dentro
                                  // del efecto: un `setState` síncrono en el
                                  // cuerpo de un efecto encadena renders, y
                                  // además es el gesto el que invalida lo
                                  // que había, no la petición.
                                  setHistoria({ fase: "cargando" });
                                  setHistoriaDe((anterior) =>
                                    alternarHistoria(anterior, fila.id),
                                  );
                                }}
                              >
                                {`Historia de ${fila.nombre}`}
                              </button>
                            </Fila>
                          </td>
                        </>
                      )}
                    </tr>

                    {historiaDe === fila.id && (
                      <tr className="catalogo__historia">
                        <td colSpan={COLUMNAS} id={`historia-${fila.id}`}>
                          <Bitacora
                            estado={historia}
                            id={`bitacora-${fila.id}`}
                          />
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  ))}
                </tbody>
              </ContenedorDeTabla>
            )}

            <form
              onSubmit={(evento) => {
                evento.preventDefault();
                void escribir(null, nueva);
              }}
              noValidate
            >
              <Fila>
                <div className="campo campo--crecer">
                  <label className="campo__rotulo" htmlFor={`alta-${titulo}`}>
                    {rotuloDeAlta}
                  </label>
                  <input
                    id={`alta-${titulo}`}
                    className="campo__control"
                    type="text"
                    value={nueva.nombre}
                    onChange={(evento) => {
                      setNueva({ nombre: evento.target.value, activo: true });
                    }}
                  />
                </div>
                <button
                  type="submit"
                  className="boton boton--primario"
                  disabled={ocupado}
                >
                  Agregar
                </button>
              </Fila>
            </form>
          </>
        )}
      </Pila>
    </section>
  );
}
