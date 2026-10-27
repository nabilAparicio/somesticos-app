/**
 * La tabla del arancel de honorarios, de solo lectura (T-3 de
 * `odd/tasks/arancel-de-honorarios.md`).
 *
 * Es la cita: el **Acuerdo No 49 del 24 de abril de 2001** de la Sala Cuarta
 * de Negocios Generales de la Corte Suprema de Justicia, transcripto entero y
 * agrupado como el documento. Acá no se edita nada, y no es una limitación
 * pendiente de levantar: `monto_oficial` y `regla_oficial` son lo que dice un
 * documento publicado, lo sostiene el disparador
 * `arancel_renglon_citado_no_se_edita` de la migración y lo niega la API con
 * un 409 `renglon_citado`. Una pantalla que ofreciera editarlos estaría
 * ofreciendo falsificar una cita.
 *
 * ## Por qué es una pantalla aparte de la de precios
 *
 * Porque la separación es la corrección del usuario hecha estructura: con las
 * dos cifras en la misma pantalla, mirar el precio propio era ver al lado la
 * vara con la que el sistema lo medía. Acá no hay precio del bufete, y allá
 * no hay monto del acuerdo. Lo que une a las dos es el enlace «de dónde sale
 * este precio», que aterriza en el renglón que lo motivó.
 *
 * ## La nota de procedencia va arriba, y es acá
 *
 * De qué acuerdo salen los valores, de qué fecha y que son **mínimos de
 * 2001**. Va arriba de la tabla y en esta pantalla porque éste es el lugar al
 * que alguien llegó justamente a preguntar de dónde sale un número; puesta al
 * lado del precio propio sería una advertencia permanente sobre una decisión
 * que el abogado ya tomó. El texto vive en `./precios.ts` para que una prueba
 * pueda afirmarlo en vez de quedar enterrado en este componente.
 *
 * ## El aterrizaje en un renglón
 *
 * El renglón viaja como **fragmento** (`#renglon-{id}`) y no como segmento de
 * la ruta: la tabla se muestra entera siempre —es un documento, no una
 * ficha—. `navegarA` empuja la historia con `pushState`, que **no** salta al
 * fragmento, y además al momento del empujón esta pantalla todavía no existe.
 * Así que el salto lo hace esta pantalla, recién cuando tiene los renglones
 * dibujados. Es también la razón por la que esto no puede vivir en
 * `./precios.ts`: leer `window.location` es tocar el navegador, y ese módulo
 * compila sin DOM a propósito.
 */
import { useEffect, useState } from "react";

import type { CategoriaDelArancel } from "../../../worker/contract";
import { cargarArancel, textoDeProblemaDelArancel } from "../../api/arancel";
import { Aviso } from "../../layout/Aviso";
import { ContenedorDeTabla } from "../../layout/ContenedorDeTabla";
import { Enlace } from "../../layout/Enlace";
import { Pila } from "../../layout/Pila";
import { Prosa } from "../../layout/Prosa";
import { VACIO } from "../../formatos";
import { enlaceDe } from "../../ruteo";
import { montoLegible } from "../cotizaciones/lineas";
import {
  NOTA_DE_PROCEDENCIA,
  TITULO_DE_PROCEDENCIA,
  anclaDelRenglon,
  categoriasFiltradas,
  cuantosRenglones,
} from "./precios";

type Estado =
  | { fase: "cargando" }
  | { fase: "listo"; categorias: CategoriaDelArancel[] }
  | { fase: "problema"; mensaje: string };

/** Las tres columnas, para el `colSpan` de la fila de un rubro. */
const COLUMNAS = 3;

export function Arancel() {
  const [estado, setEstado] = useState<Estado>({ fase: "cargando" });
  const [consulta, setConsulta] = useState("");
  /**
   * Qué renglón pidió el enlace que trajo a alguien hasta acá.
   *
   * Se lee **una vez, al montar**, con el inicializador perezoso de
   * `useState`, y no dentro del efecto que hace el salto. La diferencia no es
   * estilo: ponerlo con un `setState` adentro del efecto es el renderizado en
   * cascada que `react-hooks/set-state-in-effect` marca con razón —la
   * pantalla se dibujaría una vez sin la marca y otra con ella—, y acá no
   * hace falta, porque cuando este componente monta el fragmento **ya está**
   * en la barra de direcciones: `navegarA` empujó la historia antes de que
   * `App` cambiara de pantalla.
   *
   * Que el salto en sí viva en un efecto sí corresponde: mover el scroll es
   * actualizar un sistema externo, que es para lo que están los efectos.
   */
  const [ancla] = useState(() => window.location.hash.slice(1));

  useEffect(() => {
    const control = new AbortController();

    void cargarArancel(control.signal).then((resultado) => {
      if (control.signal.aborted) return;

      setEstado(
        resultado.estado === "ok"
          ? { fase: "listo", categorias: resultado.valor }
          : { fase: "problema", mensaje: textoDeProblemaDelArancel(resultado) },
      );
    });

    return () => {
      control.abort();
    };
  }, []);

  /*
   * El salto al renglón del fragmento, una vez y con la tabla ya dibujada.
   *
   * Depende de la fase y no de la consulta: buscar después de aterrizar no
   * tiene que volver a mover la página ni a marcar nada. Y si el `id` no
   * está —porque el fragmento quedó viejo, o porque alguien lo escribió a
   * mano— no pasa nada: la tabla se lee igual desde el principio, que es
   * mejor que un salto a ninguna parte.
   */
  useEffect(() => {
    if (estado.fase !== "listo" || ancla === "") return;

    document.getElementById(ancla)?.scrollIntoView({ block: "center" });
  }, [ancla, estado.fase]);

  const categorias = estado.fase === "listo" ? estado.categorias : [];
  const visibles = categoriasFiltradas(categorias, consulta);
  const total = cuantosRenglones(categorias);

  return (
    <Pila espacio="holgado">
      <header>
        <Pila espacio="ceñido">
          <p className="texto-apagado">
            <Enlace href={enlaceDe({ nombre: "catalogos" })}>Catálogos</Enlace>
          </p>
          <h1>La tabla del arancel</h1>
        </Pila>
      </header>

      {/*
        La nota de procedencia. Va antes de todo lo demás —antes del buscador
        y antes de la primera tabla— y `e2e/precios.spec.ts` lo afirma como
        orden en el documento y no como coordenada, porque la coordenada
        cambia con el ancho y el orden no.
      */}
      <section className="procedencia" aria-labelledby="procedencia-del-arancel">
        <Pila espacio="ceñido">
          <h2 id="procedencia-del-arancel">{TITULO_DE_PROCEDENCIA}</h2>
          {NOTA_DE_PROCEDENCIA.map((parrafo) => (
            <Prosa como="p" key={parrafo}>
              {parrafo}
            </Prosa>
          ))}
        </Pila>
      </section>

      {estado.fase === "cargando" && <p>Consultando…</p>}

      {estado.fase === "problema" && (
        <Aviso tono="error">{estado.mensaje}</Aviso>
      )}

      {estado.fase === "listo" && total > 0 && (
        <Pila>
          <div className="campo campo--busqueda">
            <label className="campo__rotulo" htmlFor="busqueda-del-arancel">
              Buscar
            </label>
            <input
              id="busqueda-del-arancel"
              className="campo__control"
              type="search"
              value={consulta}
              placeholder="Concepto del acuerdo"
              onChange={(evento) => {
                setConsulta(evento.target.value);
              }}
            />
          </div>

          {visibles.length === 0 && (
            <Aviso>Ningún concepto del acuerdo coincide con «{consulta}».</Aviso>
          )}

          {visibles.map((categoria) => (
            <section
              key={categoria.nombre}
              aria-labelledby={`arancel-${categoria.nombre}`}
            >
              <Pila>
                <h2 id={`arancel-${categoria.nombre}`}>{categoria.nombre}</h2>

                {/*
                  Las dos secciones que el acuerdo imprime **solo como
                  prosa** —«OTROS ASUNTOS» y «PROCESO DE SEPARACIONES DE
                  BIENES…»— llegan con `renglones` vacío, y eso no es un
                  error: son parte del documento y sin su encabezado
                  desaparecerían del arancel sin que nadie lo note. Lo único
                  que no tienen es tabla.
                */}
                {categoria.renglones.length > 0 && (
                  <ContenedorDeTabla rotulo={`Arancel · ${categoria.nombre}`}>
                    <thead>
                      <tr>
                        <th scope="col">Numeral</th>
                        <th scope="col">Concepto</th>
                        <th scope="col">Lo que dice el acuerdo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {categoria.renglones.map((renglon) => {
                        const propia = anclaDelRenglon(renglon.id);
                        const esRubro = renglon.clase === "rubro";

                        return (
                          <tr
                            key={renglon.id}
                            id={propia}
                            className={[
                              "arancel__renglon",
                              esRubro ? "arancel__renglon--rubro" : "",
                              ancla === propia
                                ? "arancel__renglon--señalado"
                                : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                          >
                            <th scope="row" className="arancel__numeral">
                              {renglon.numeral}
                            </th>
                            {/*
                              El rubro ocupa el resto de la fila: el acuerdo
                              lo imprime sin valor porque solo agrupa a sus
                              hijos, y una celda vacía en la columna del
                              monto parecería un dato que falta.
                            */}
                            {esRubro ? (
                              <td colSpan={COLUMNAS - 1}>{renglon.concepto}</td>
                            ) : (
                              <>
                                <td>{renglon.concepto}</td>
                                <td className="arancel__valor">
                                  {renglon.montoOficial !== null ? (
                                    <span className="numerico">
                                      {montoLegible(renglon.montoOficial)}
                                    </span>
                                  ) : (
                                    (renglon.reglaOficial ?? VACIO)
                                  )}
                                </td>
                              </>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </ContenedorDeTabla>
                )}

                {/*
                  Las notas de la categoría, **después** de sus renglones.
                  Pertenecen a la categoría y no a una fila —«PARÁGRAFO: en
                  todo trámite se cargarán B/.200.00 por cada dependiente»
                  cambia el precio de las 24 filas de migración, no de una—,
                  y van al final porque un parágrafo califica lo que viene
                  antes. T-2 dejó anotado que la posición exacta de cada
                  nota dentro del documento **no está en los datos**: la
                  extracción guarda el orden de las notas entre sí y no
                  dónde cae cada una respecto de los renglones, así que
                  intercalarlas sería inventar una posición.
                */}
                {categoria.notas.map((nota) => (
                  <Prosa como="p" key={nota.id} className="arancel__nota">
                    {nota.texto}
                  </Prosa>
                ))}
              </Pila>
            </section>
          ))}
        </Pila>
      )}

      {estado.fase === "listo" && total === 0 && (
        <Aviso>
          La tabla del acuerdo todavía no está sembrada. Se carga con
          <code> pnpm arancel:sembrar</code>.
        </Aviso>
      )}
    </Pila>
  );
}
