/**
 * Los precios del bufete (T-3 de `odd/tasks/arancel-de-honorarios.md`).
 *
 * Es la pantalla donde el abogado trabaja: un servicio por fila y **un solo
 * precio a la vista, el del bufete**. Hasta esta tajada el bufete no tenía
 * dónde guardar la respuesta a «¿cuánto cobramos nosotros por una visa de
 * pensionado?»: cada monto de cada cotización se tipeaba a mano.
 *
 * ## Lo que esta pantalla no muestra, y es la decisión que la define
 *
 * No muestra el monto del Acuerdo No 49 de 2001 al lado del precio propio.
 * Ni abajo, ni en un color, ni como un «mínimo: X», ni como un aviso de que
 * el precio quedó por debajo. La primera versión del diseño hacía justamente
 * eso y el usuario lo corrigió:
 *
 * > «En lugar de siempre al lado, un tipo hipervínculo que te permita ver la
 * > tabla. Así no se siente que el sistema juzga tus precios, sino que el
 * > sistema sabe cuánto cuesta y te lo sugiere.»
 *
 * Con las dos columnas lado a lado la pantalla era **una auditoría**: cada
 * vez que el abogado miraba su precio, el sistema le mostraba la vara con la
 * que lo medía. El Artículo 1 del acuerdo existe y dice lo que dice, pero no
 * es trabajo de esta aplicación vigilarlo. Lo que sí es trabajo suyo es
 * saber cuánto cuesta y sugerirlo, y de eso se trata la fila: donde el bufete
 * todavía no decidió, el campo **arranca con el valor sugerido** —no vacío y
 * no en cero— marcado con una palabra apagada.
 *
 * La cita completa se consulta en la otra pantalla, a un clic de distancia
 * desde cada fila. `e2e/precios.spec.ts` cuenta las cifras de dinero de cada
 * fila para que una «mejora» que devuelva la columna oficial se ponga roja.
 *
 * ## Tres clases de fila, porque el acuerdo imprime tres
 *
 *  - **`monto`**: un número. Campo de precio con la sugerencia adentro.
 *  - **`regla`**: un porcentaje por tramos sobre la cuantía, que esta tajada
 *    no auto-calcula. Se muestra el texto de la regla **debajo del concepto**
 *    para que el número que el bufete escriba tenga de qué hablar, y el campo
 *    de precio se ofrece igual: son 97 servicios que si no quedarían sin
 *    ninguna forma de tener precio propio.
 *  - **`rubro`**: los 74 encabezados que el acuerdo imprime sin valor porque
 *    solo agrupan a sus hijos. **No llevan campo de precio**: la base los
 *    rechaza con `un_rubro_no_lleva_precio` y ofrecerle un monto a un título
 *    es ofrecerle escribir un dato que no significa nada.
 */
import { useEffect, useState } from "react";

import type {
  CategoriaDelArancel,
  RenglonDelArancel,
} from "../../../worker/contract";
import {
  cargarArancel,
  fijarMontoDelArancel,
  textoDeProblemaDelArancel,
} from "../../api/arancel";
import { Aviso } from "../../layout/Aviso";
import { ContenedorDeTabla } from "../../layout/ContenedorDeTabla";
import { Enlace } from "../../layout/Enlace";
import { Fila } from "../../layout/Fila";
import { Pila } from "../../layout/Pila";
import { Prosa } from "../../layout/Prosa";
import { enlaceDe } from "../../ruteo";
import {
  AYUDA_DEL_PRECIO_PROPIO,
  MARCA_SUGERIDO,
  ROTULO_DE_PROCEDENCIA,
  cuantasFilas,
  cuantosRenglones,
  enlaceAlRenglonDelArancel,
  gruposDePrecios,
  hayCambioDePrecio,
  montoParaGuardar,
  sinBorrador,
  type BorradoresDePrecio,
} from "./precios";

type Estado =
  | { fase: "cargando" }
  | { fase: "listo"; categorias: CategoriaDelArancel[] }
  | { fase: "problema"; mensaje: string };

/**
 * Lo que alguien tecleó encima de una fila, mientras no lo guardó.
 *
 * Es un mapa por identificador y no un campo por fila en el estado, porque
 * son 453 filas y solo las tocadas tienen borrador. Eso es además lo que
 * decide **cuándo aparece el botón de guardar**: una fila sin borrador no lo
 * dibuja. Con el botón en las 453 filas, la pantalla sería una pared de
 * cuatrocientos cincuenta y tres botones apagados, y la única manera de
 * apagarlos de a uno habría sido comparar contra lo que se ve, que es lo que
 * impediría adoptar la sugerencia tal cual.
 *
 * El tipo y la poda viven en `./precios.ts` —`BorradoresDePrecio` y
 * `sinBorrador`— porque tirar el borrador después de guardar tiene
 * consecuencia visible y ahí tiene prueba.
 */

export function Precios() {
  const [estado, setEstado] = useState<Estado>({ fase: "cargando" });
  const [consulta, setConsulta] = useState("");
  const [borradores, setBorradores] = useState<BorradoresDePrecio>({});
  /** Qué fila se está guardando. Apaga su botón, no los de las otras. */
  const [guardando, setGuardando] = useState<string | null>(null);
  const [problema, setProblema] = useState<string | null>(null);

  useEffect(() => {
    const control = new AbortController();

    void cargarArancel(control.signal).then((resultado) => {
      if (control.signal.aborted) return;

      setEstado(
        resultado.estado === "ok"
          ? { fase: "listo", categorias: resultado.valor }
          : {
              fase: "problema",
              mensaje: textoDeProblemaDelArancel(resultado),
            },
      );
    });

    return () => {
      control.abort();
    };
  }, []);

  /**
   * El renglón guardado, puesto en su lugar sin releer la tabla entera.
   *
   * `fijarMontoDelArancel` devuelve el renglón **releído del servidor**, así
   * que no hay nada que adivinar: se reemplaza esa fila y punto. Releer las
   * 453 por cada precio editado serían 453 filas de ida y vuelta para
   * enterarse de un número que la respuesta ya trajo.
   */
  function reemplazar(guardado: RenglonDelArancel) {
    setEstado((anterior) => {
      if (anterior.fase !== "listo") return anterior;

      return {
        fase: "listo",
        categorias: anterior.categorias.map((categoria) => ({
          ...categoria,
          renglones: categoria.renglones.map((renglon) =>
            renglon.id === guardado.id ? guardado : renglon,
          ),
        })),
      };
    });
  }

  async function guardar(renglon: RenglonDelArancel) {
    const escrito = montoParaGuardar(borradores[renglon.id] ?? "");
    if (!escrito.ok) return;

    setProblema(null);
    setGuardando(renglon.id);

    const resultado = await fijarMontoDelArancel(
      renglon.id,
      escrito.monto,
      new AbortController().signal,
    );

    setGuardando(null);

    if (resultado.estado !== "ok") {
      setProblema(textoDeProblemaDelArancel(resultado));
      return;
    }

    reemplazar(resultado.valor);
    /*
     * El borrador se tira: desde acá lo que manda es lo que contestó el
     * servidor. Dejarlo puesto sería dejar el botón de guardar prendido
     * sobre un cambio que ya está guardado, y encima tapando con el texto
     * viejo un valor que el servidor pudo haber normalizado.
     */
    setBorradores((anterior) => sinBorrador(anterior, renglon.id));
  }

  const categorias = estado.fase === "listo" ? estado.categorias : [];
  const grupos = gruposDePrecios(categorias, consulta);
  const total = cuantosRenglones(categorias);
  const visibles = cuantasFilas(grupos);

  return (
    <Pila espacio="holgado">
      <header>
        <Pila espacio="ceñido">
          <p className="texto-apagado">
            <Enlace href={enlaceDe({ nombre: "catalogos" })}>Catálogos</Enlace>
          </p>
          <h1>Los precios del bufete</h1>
          <Prosa como="p" className="texto-apagado">
            Un precio por servicio: el que cobra el bufete. Donde todavía no
            hay uno decidido, el campo arranca con el valor que el sistema
            sugiere; escribir encima lo convierte en el precio del bufete.
          </Prosa>
        </Pila>
      </header>

      {estado.fase === "cargando" && <p>Consultando…</p>}

      {estado.fase === "problema" && (
        <Aviso tono="error">{estado.mensaje}</Aviso>
      )}

      {problema !== null && <Aviso tono="error">{problema}</Aviso>}

      {estado.fase === "listo" && total === 0 && (
        <Aviso>
          Todavía no hay ningún servicio cargado. La tabla se siembra con
          <code> pnpm arancel:sembrar</code>.
        </Aviso>
      )}

      {estado.fase === "listo" && total > 0 && (
        <Pila>
          {/*
            El buscador no es una comodidad: son 453 filas, y una lista de
            453 filas sin forma de llegar a una no se usa.
          */}
          <div className="campo campo--busqueda">
            <label className="campo__rotulo" htmlFor="busqueda-de-precios">
              Buscar
            </label>
            <input
              id="busqueda-de-precios"
              className="campo__control"
              type="search"
              value={consulta}
              placeholder="Nombre del servicio"
              onChange={(evento) => {
                setConsulta(evento.target.value);
              }}
            />
            {/*
              `Prosa` y no un `<p>` pelado: medido a 1440px, el párrafo sin
              tope ocupaba el ancho entero de la columna de contenido —más de
              cien caracteres de corrido— que es justo el renglón que obliga
              al ojo a buscar dónde sigue (§9: el texto se mide en `ch`).
            */}
            <Prosa como="p" className="campo__ayuda">
              {AYUDA_DEL_PRECIO_PROPIO}
            </Prosa>
          </div>

          <p className="texto-apagado" aria-live="polite">
            {visibles === total
              ? `${String(total)} servicio(s).`
              : `${String(visibles)} de ${String(total)} servicio(s).`}
          </p>

          {grupos.length === 0 && (
            <Aviso>Ningún servicio coincide con «{consulta}».</Aviso>
          )}

          {grupos.map((grupo) => (
            <section
              key={grupo.categoria}
              aria-labelledby={`precios-${grupo.categoria}`}
            >
              <Pila>
                <h2 id={`precios-${grupo.categoria}`}>{grupo.categoria}</h2>
                <ContenedorDeTabla rotulo={`Precios de ${grupo.categoria}`}>
                  <thead>
                    <tr>
                      <th scope="col">Servicio</th>
                      <th scope="col">Precio del bufete</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grupo.filas.map(({ renglon, precio, llevaPrecio }) => {
                      const borrador = borradores[renglon.id];
                      const tocada = borrador !== undefined;
                      const texto = borrador ?? precio.texto;
                      const escrito = montoParaGuardar(texto);

                      /*
                        El encabezado del acuerdo, dibujado como lo que es:
                        un título. Ocupa las dos columnas porque no hay
                        precio que poner en la segunda, y una celda vacía
                        parecería un precio que falta.
                      */
                      if (!llevaPrecio) {
                        return (
                          <tr key={renglon.id} className="precios__rubro">
                            <th scope="row" colSpan={2}>
                              <span className="precios__numeral">
                                {renglon.numeral}
                              </span>{" "}
                              {renglon.concepto}
                            </th>
                          </tr>
                        );
                      }

                      return (
                        <tr key={renglon.id}>
                          <th scope="row">
                            <Pila espacio="ceñido">
                              <span>
                                <span className="precios__numeral">
                                  {renglon.numeral}
                                </span>{" "}
                                {renglon.concepto}
                              </span>
                              {/*
                                El texto de la regla, para los 97 servicios
                                que el acuerdo tarifa por tramos sobre la
                                cuantía. Va acá y no en la columna del
                                precio **a propósito**: trae importes
                                adentro —«B/.2,000.00 más el 35%»— que son
                                parte de la cita, y la celda del precio
                                tiene que poder contarse con una sola cifra.
                              */}
                              {renglon.reglaOficial !== null && (
                                <span className="precios__regla">
                                  {renglon.reglaOficial}
                                </span>
                              )}
                            </Pila>
                          </th>
                          <td className="precio">
                            <Pila espacio="ceñido">
                              <Fila alinear="inicio">
                                <input
                                  className="campo__control campo__control--importe"
                                  type="text"
                                  inputMode="decimal"
                                  aria-label={`Precio de ${renglon.concepto}`}
                                  value={texto}
                                  onChange={(evento) => {
                                    setBorradores((anterior) => ({
                                      ...anterior,
                                      [renglon.id]: evento.target.value,
                                    }));
                                  }}
                                />
                                {/*
                                  La marca de que el número todavía es una
                                  sugerencia. Una palabra apagada y nada
                                  más: no nombra de dónde sale, porque eso
                                  encima del precio propio sería la
                                  advertencia permanente que esta pantalla
                                  no tiene.
                                */}
                                {precio.origen === "sugerido" && !tocada && (
                                  <span className="precio__marca">
                                    {MARCA_SUGERIDO}
                                  </span>
                                )}
                                {tocada && (
                                  <button
                                    type="button"
                                    className="boton boton--primario"
                                    aria-label={`Guardar el precio de ${renglon.concepto}`}
                                    disabled={
                                      guardando !== null ||
                                      !hayCambioDePrecio(renglon, texto)
                                    }
                                    onClick={() => {
                                      void guardar(renglon);
                                    }}
                                  >
                                    Guardar
                                  </button>
                                )}

                                {/*
                                  El enlace, discreto y en cada fila. El
                                  rótulo ofrece en vez de advertir, y por eso
                                  es un enlace de texto y no un botón ni un
                                  icono: un icono al lado de un precio se lee
                                  como una marca de que algo anda mal.

                                  Va **dentro de la misma franja** que el
                                  campo y no debajo. Medido a 1440px con los
                                  453 renglones de verdad: apilado, cada fila
                                  medía unos 140px y el rótulo se partía en
                                  dos renglones, o sea más de sesenta mil
                                  píxeles de alto para una tabla que se
                                  recorre buscando una fila. En la franja
                                  entra todo en un renglón y baja solo cuando
                                  no entra.
                                */}
                                <Enlace
                                  className="precio__procedencia"
                                  href={enlaceAlRenglonDelArancel(renglon.id)}
                                >
                                  {ROTULO_DE_PROCEDENCIA}
                                </Enlace>
                              </Fila>

                              {tocada && !escrito.ok && (
                                <span className="campo__ayuda" role="alert">
                                  Eso no es un importe.
                                </span>
                              )}
                            </Pila>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </ContenedorDeTabla>
              </Pila>
            </section>
          ))}
        </Pila>
      )}
    </Pila>
  );
}
