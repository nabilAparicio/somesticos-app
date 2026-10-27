/**
 * Los módulos de una cotización, configurables (T-2 de
 * `odd/tasks/plantillas-de-modulo.md`).
 *
 * Es la pantalla donde el bufete le enseña al asistente de qué trata cada
 * módulo. Hasta `0016`, los seis tipos de prosa estaban escritos en el código
 * y **el rótulo era todo lo que el sistema sabía de ellos**: `prompt.ts` le
 * pasaba al modelo `alcance · Alcance` y el propósito lo deducía del nombre.
 * El campo de descripción de esta pantalla es lo que cierra eso.
 *
 * ## Lo que esta pantalla no muestra, y es la decisión que la define
 *
 * No muestra el texto preestablecido al lado del texto propio. Ni abajo, ni en
 * un color, ni como un «antes decía: X». Es la misma corrección del usuario
 * que fijó la forma de la pantalla de precios, y vale igual para un rótulo:
 *
 * > «En lugar de siempre al lado, un tipo hipervínculo que te permita ver la
 * > tabla. Así no se siente que el sistema juzga tus precios, sino que el
 * > sistema sabe cuánto cuesta y te lo sugiere.»
 *
 * Con las dos versiones a la vista, la pantalla sería una auditoría de lo que
 * el abogado escribió. Lo que el sistema hace es traer el texto puesto; lo que
 * se escriba encima es del bufete. **Y acá no hay una segunda pantalla a un
 * clic**, como el arancel para el precio, porque no hay un documento publicado
 * que consultar: el piso es un preset nuestro, y la forma de volver a verlo es
 * vaciar el campo — que es también la forma de volver a usarlo.
 *
 * `e2e/plantillas.spec.ts` cuenta los controles de texto de cada módulo para
 * que una «mejora» que devuelva el preestablecido al lado se ponga roja.
 *
 * ## La marca va sobre la excepción, nunca sobre la norma
 *
 * El asterisco marca lo que el bufete editó, no lo preestablecido:
 *
 * > «Los preestablecidos son eso, preestablecidos: siempre pueden ser
 * > editables, pero **son la norma hasta que se editen, no son una
 * > subcategoría**.»
 *
 * Es el mismo literal que dibujan la pantalla de precios y la vista expandida
 * de la cotización, importado y no copiado. La leyenda que lo explica va
 * **arriba de la lista** y solo si hay alguna marca: una leyenda que explica un
 * signo que no aparece manda a buscarlo.
 *
 * ## La forma del bloque, y por qué no es una tabla
 *
 * Cada módulo es una sección con dos campos apilados, no una fila de tabla, y
 * eso es una decisión de `docs/diseno.md` §9 y no una preferencia: la
 * descripción es un `<textarea>` de varios renglones, y una celda con un
 * párrafo editable adentro obliga a la tabla a crecer en vertical hasta que el
 * encabezado de columna queda fuera de pantalla — con lo cual la columna deja
 * de rotular nada. Lo tabular de esta pantalla son seis filas de dos campos
 * largos, que es exactamente lo que una lista apilada dibuja mejor. §9 pide
 * flex para una franja unidimensional y grid para el esqueleto; acá cada
 * módulo es una pila y no hay nada bidimensional que acomodar.
 */
import { useEffect, useState } from "react";

import type { PlantillaDeModulo } from "../../../worker/contract";
import {
  cargarPlantillasDeModulo,
  guardarPlantillaDeModulo,
  textoDeProblemaDeLasPlantillas,
} from "../../api/plantillas";
import { Aviso } from "../../layout/Aviso";
import { Enlace } from "../../layout/Enlace";
import { Fila } from "../../layout/Fila";
import { Pila } from "../../layout/Pila";
import { Prosa } from "../../layout/Prosa";
import { enlaceDe } from "../../ruteo";
import {
  AVISO_SIN_PLANTILLAS,
  AYUDA_DEL_VUELTA_ATRAS,
  ETIQUETA_DE_BAJA,
  EXPLICACION_DE_LA_PANTALLA,
  LEYENDA_DE_LA_MARCA,
  MARCA_DE_EDITADO,
  MARCA_EDITADA_LEIDA,
  ROTULO_DEL_ROTULO,
  ROTULO_DE_LA_DESCRIPCION,
  TITULO_DE_LA_PANTALLA,
  anclaDeLaPlantilla,
  borradorDe,
  camposQueQuedarianVacios,
  datosParaGuardar,
  descripcionALaVista,
  hayEditadas,
  rotuloALaVista,
  sePuedeGuardar,
  sinBorrador,
  type BorradoresDePlantilla,
  type BorradorDePlantilla,
  type OrigenDelTexto,
} from "./plantillas";

type Estado =
  | { fase: "cargando" }
  | { fase: "listo"; plantillas: PlantillaDeModulo[] }
  | { fase: "problema"; mensaje: string };

/**
 * La marca sutil, dibujada igual en los dos campos.
 *
 * Se dibuja **sólo** cuando el origen es el bufete, y mira el valor
 * **guardado** y no el borrador: lo que la marca dice es de quién es el texto
 * que está en la base, y teclear encima todavía no guardó nada. Que apareciera
 * y desapareciera mientras alguien escribe sería un signo que se lee como un
 * aviso.
 *
 * El asterisco no se lee en voz alta, así que lleva su nombre al lado en un
 * `span` oculto — la misma forma que `.precio__marca`.
 */
function Marca({ origen }: { readonly origen: OrigenDelTexto }) {
  if (origen !== "bufete") return null;

  return (
    <span className="plantilla-modulo__marca">
      <span aria-hidden="true">{MARCA_DE_EDITADO}</span>
      <span className="oculto-visualmente">{MARCA_EDITADA_LEIDA}</span>
    </span>
  );
}

export function PlantillasDeModulo() {
  const [estado, setEstado] = useState<Estado>({ fase: "cargando" });
  const [borradores, setBorradores] = useState<BorradoresDePlantilla>({});
  /** Qué módulo se está guardando. Apaga su botón, no los de los otros. */
  const [guardando, setGuardando] = useState<string | null>(null);
  const [problema, setProblema] = useState<string | null>(null);

  useEffect(() => {
    const control = new AbortController();

    void cargarPlantillasDeModulo(control.signal).then((resultado) => {
      if (control.signal.aborted) return;

      setEstado(
        resultado.estado === "ok"
          ? { fase: "listo", plantillas: resultado.valor }
          : {
              fase: "problema",
              mensaje: textoDeProblemaDeLasPlantillas(resultado),
            },
      );
    });

    return () => {
      control.abort();
    };
  }, []);

  /**
   * La plantilla guardada, puesta en su lugar sin releer el catálogo.
   *
   * `guardarPlantillaDeModulo` devuelve la fila **releída del servidor**, con
   * el valor vigente ya resuelto, así que no hay nada que adivinar: se
   * reemplaza esa plantilla y punto. Y es lo que hace visible el vuelta atrás:
   * cuando se guardó un nulo, lo que vuelve en la respuesta es el preset.
   */
  function reemplazar(guardada: PlantillaDeModulo) {
    setEstado((anterior) => {
      if (anterior.fase !== "listo") return anterior;

      return {
        fase: "listo",
        plantillas: anterior.plantillas.map((plantilla) =>
          plantilla.id === guardada.id ? guardada : plantilla,
        ),
      };
    });
  }

  async function guardar(
    plantilla: PlantillaDeModulo,
    borrador: BorradorDePlantilla,
    activo: boolean,
  ) {
    setProblema(null);
    setGuardando(plantilla.id);

    const resultado = await guardarPlantillaDeModulo(
      plantilla.id,
      datosParaGuardar(plantilla, borrador, activo),
      new AbortController().signal,
    );

    setGuardando(null);

    if (resultado.estado !== "ok") {
      setProblema(textoDeProblemaDeLasPlantillas(resultado));
      return;
    }

    reemplazar(resultado.valor);
    /*
     * El borrador se tira: desde acá lo que manda es lo que contestó el
     * servidor. Dejarlo puesto sería dejar el botón de guardar prendido sobre
     * un cambio que ya está guardado, y encima tapando con el texto viejo un
     * valor que el servidor normalizó — que acá pasa de verdad, porque vaciar
     * el campo devuelve el preset y el borrador vacío lo taparía.
     */
    setBorradores((anterior) => sinBorrador(anterior, plantilla.id));
  }

  /** Dar de baja o reactivar: el mismo `PUT`, con el texto tal como está. */
  function cambiarVigencia(plantilla: PlantillaDeModulo) {
    void guardar(
      plantilla,
      borradorDe(borradores, plantilla),
      !plantilla.activo,
    );
  }

  /**
   * Teclear en un campo, sin perder el otro.
   *
   * El borrador que entra al mapa la primera vez **arranca de los dos valores
   * vigentes** y no de dos cadenas vacías, y no es un detalle: el `PUT` manda
   * el juego completo, así que un borrador con la descripción en blanco porque
   * nadie la tocó la mandaría como NULL y la volvería al preestablecido sin
   * que nadie lo pidiera. `borradorDe` es el que sabe de dónde arranca, y por
   * eso se le pasa la plantilla en vez de leer el mapa a mano.
   */
  function escribir(
    plantilla: PlantillaDeModulo,
    campo: keyof BorradorDePlantilla,
    texto: string,
  ) {
    setBorradores((anterior) => ({
      ...anterior,
      [plantilla.id]: { ...borradorDe(anterior, plantilla), [campo]: texto },
    }));
  }

  const plantillas = estado.fase === "listo" ? estado.plantillas : [];

  return (
    <Pila espacio="holgado">
      <header>
        <Pila espacio="ceñido">
          <p className="texto-apagado">
            <Enlace href={enlaceDe({ nombre: "catalogos" })}>Catálogos</Enlace>
          </p>
          <h1>{TITULO_DE_LA_PANTALLA}</h1>
          {/*
            `Prosa` y no un `<p>` pelado: el tope de ancho se mide en `ch` (§9)
            porque es de legibilidad. Sin él, el párrafo ocupa la columna de
            contenido entera a 1400px y pasa de los cien caracteres de corrido.
          */}
          <Prosa como="p" className="texto-apagado">
            {EXPLICACION_DE_LA_PANTALLA}
          </Prosa>
        </Pila>
      </header>

      {estado.fase === "cargando" && <p>Consultando…</p>}

      {estado.fase === "problema" && (
        <Aviso tono="error">{estado.mensaje}</Aviso>
      )}

      {problema !== null && <Aviso tono="error">{problema}</Aviso>}

      {estado.fase === "listo" && plantillas.length === 0 && (
        <Aviso>{AVISO_SIN_PLANTILLAS}</Aviso>
      )}

      {estado.fase === "listo" && plantillas.length > 0 && (
        <Pila>
          <Prosa como="p" className="texto-apagado">
            {AYUDA_DEL_VUELTA_ATRAS}
          </Prosa>

          {/*
            La leyenda de la marca, y **solo cuando hay alguna marcada**: una
            leyenda que explica un signo que no aparece en ninguna parte manda
            a buscarlo. Va arriba de la lista y no al pie, por lo mismo que en
            la pantalla de precios: un pie de página explica un asterisco que
            quien lo encontró ya no tiene a la vista.
          */}
          {hayEditadas(plantillas) && (
            <Prosa como="p" className="texto-apagado plantillas__leyenda">
              <span aria-hidden="true">{MARCA_DE_EDITADO} </span>
              {LEYENDA_DE_LA_MARCA}
            </Prosa>
          )}

          {plantillas.map((plantilla) => {
            const ancla = anclaDeLaPlantilla(plantilla.clave);
            const rotulo = rotuloALaVista(plantilla);
            const descripcion = descripcionALaVista(plantilla);
            const borrador = borradorDe(borradores, plantilla);
            const tocada = borradores[plantilla.id] !== undefined;
            const vacios = camposQueQuedarianVacios(plantilla, borrador);

            return (
              <section
                key={plantilla.id}
                aria-labelledby={ancla}
                className={[
                  "plantilla-modulo",
                  plantilla.activo ? null : "plantilla-modulo--de-baja",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {/*
                  El relleno vive en esta pila y no en la `<section>`: una
                  consulta de contenedor no puede dar estilo a su propio
                  contenedor, así que la que ajusta el relleno por ancho tiene
                  que apuntar a un elemento de adentro. Es el mismo reparto que
                  `.tarjeta` tiene con `.tarjeta__cuerpo`.
                */}
                <Pila className="plantilla-modulo__cuerpo">
                  <Fila alinear="entre">
                    {/*
                      El encabezado es el **rótulo vigente** y no la clave: es
                      el nombre con el que la persona conoce el módulo. La
                      clave vive debajo, en chico, porque es lo que la IA
                      copia y lo que una cotización emitida guardó — hace
                      falta para entender de qué módulo se habla, pero no es
                      el título.
                    */}
                    <Pila espacio="ceñido">
                      <h2 id={ancla}>
                        {rotulo.valor}
                        <Marca origen={rotulo.origen} />
                      </h2>
                      <span className="plantilla-modulo__clave">
                        {plantilla.clave}
                      </span>
                    </Pila>

                    <Fila alinear="inicio">
                      {!plantilla.activo && (
                        <span className="etiqueta etiqueta--tenue">
                          {ETIQUETA_DE_BAJA}
                        </span>
                      )}
                      <button
                        type="button"
                        className="boton boton--tenue"
                        disabled={guardando !== null}
                        onClick={() => {
                          cambiarVigencia(plantilla);
                        }}
                      >
                        {plantilla.activo ? "Dar de baja" : "Reactivar"}
                      </button>
                    </Fila>
                  </Fila>

                  {/*
                    **Los dos campos nombran su módulo, y no solo su campo.**

                    Seis módulos por dos campos son doce controles, y con el
                    rótulo visible a secas doce se llamarían «Rótulo» o
                    «Descripción»: un lector de pantalla recorrería la página
                    anunciando el mismo nombre una y otra vez, y no habría
                    forma de saber de cuál módulo es el campo en el que uno
                    está parado. `aria-labelledby` con **los dos** `id` —el del
                    rótulo del campo primero y el del encabezado del módulo
                    después— compone «Rótulo Alcance», que dice las dos cosas.

                    Va así y no con un `aria-label` escrito a mano, que es lo
                    que hace la pantalla de precios: allá el campo no tiene
                    rótulo visible, y acá sí. Un `aria-label` lo reemplazaría, y
                    entonces lo que se ve y lo que se lee en voz alta serían
                    dos textos distintos — que es exactamente lo que el
                    criterio de «rótulo en el nombre» prohíbe.
                  */}
                  <div className="campo">
                    <label
                      className="campo__rotulo"
                      id={`${ancla}-rotulo-nombre`}
                      htmlFor={`${ancla}-rotulo`}
                    >
                      {ROTULO_DEL_ROTULO}
                    </label>
                    <input
                      id={`${ancla}-rotulo`}
                      className="campo__control"
                      type="text"
                      aria-labelledby={`${ancla}-rotulo-nombre ${ancla}`}
                      value={borrador.rotulo}
                      onChange={(evento) => {
                        escribir(plantilla, "rotulo", evento.target.value);
                      }}
                    />
                  </div>

                  <div className="campo">
                    <label
                      className="campo__rotulo"
                      id={`${ancla}-descripcion-nombre`}
                      htmlFor={`${ancla}-descripcion`}
                    >
                      {ROTULO_DE_LA_DESCRIPCION}
                      <Marca origen={descripcion.origen} />
                    </label>
                    {/*
                      `<textarea>` con `.campo__control--prosa`: la altura la
                      define el contenido y se puede estirar **solo** en
                      vertical, porque `resize: both` deja arrastrarlo más
                      ancho que la página y eso es scroll horizontal (§9).
                    */}
                    <textarea
                      id={`${ancla}-descripcion`}
                      className="campo__control campo__control--prosa"
                      aria-labelledby={`${ancla}-descripcion-nombre ${ancla}`}
                      value={borrador.descripcion}
                      onChange={(evento) => {
                        escribir(plantilla, "descripcion", evento.target.value);
                      }}
                    />
                  </div>

                  {/*
                    El botón solo aparece sobre un módulo tocado, por lo mismo
                    que en la pantalla de precios: con el botón en los seis, la
                    pantalla sería una columna de botones apagados.
                  */}
                  {tocada && (
                    <Fila alinear="inicio">
                      <button
                        type="button"
                        className="boton boton--primario"
                        disabled={
                          guardando !== null ||
                          !sePuedeGuardar(plantilla, borrador)
                        }
                        onClick={() => {
                          void guardar(plantilla, borrador, plantilla.activo);
                        }}
                      >
                        Guardar
                      </button>
                    </Fila>
                  )}

                  {/*
                    El aviso de que vaciar dejaría el módulo sin texto. Es la
                    guarda de arriba del `CHECK` de la base, y hoy no se puede
                    ver con las seis filas sembradas: las seis tienen
                    preestablecido. Existe porque una plantilla propia de la
                    tajada 2 nace sin piso debajo.
                  */}
                  {tocada && vacios.length > 0 && (
                    <span className="campo__ayuda" role="alert">
                      Este módulo no tiene texto preestablecido, así que{" "}
                      {vacios.length === 2
                        ? "el rótulo y la descripción no pueden"
                        : vacios[0] === "rotulo"
                          ? "el rótulo no puede"
                          : "la descripción no puede"}{" "}
                      quedar vacíos.
                    </span>
                  )}
                </Pila>
              </section>
            );
          })}
        </Pila>
      )}
    </Pila>
  );
}
