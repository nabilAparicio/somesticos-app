/**
 * El detalle de una cotización.
 *
 * Los campos van en una lista de definiciones dentro de una rejilla que se
 * reacomoda sola: a 320px es una columna, en escritorio son varias, y no hay
 * un breakpoint escrito a mano (`docs/diseno.md` §9).
 *
 * Cuelga la bitácora, pedida por separado y por lo mismo que en la ficha del
 * cliente: son dos lecturas independientes, y un fallo del registro no puede
 * dejar la ficha en blanco.
 *
 * Y cuelga dos editores —el de módulos de prosa y el de líneas de importe—,
 * que son dos lecturas más por el mismo motivo: `/modulos` y `/lineas`
 * tienen cada uno su propia dirección, y un fallo de cualquiera de los dos
 * no puede dejar la ficha en blanco.
 *
 * **El total no se arma acá.** Viene con las líneas, en el mismo cuerpo que
 * ellas, porque la aritmética es del sistema y no de la pantalla: por eso
 * este componente no lee un total ni se lo pasa a nadie. Lo único que le da
 * al editor de líneas es la **moneda**, para que ningún importe quede sin
 * unidad.
 *
 * ## El ciclo de vida, que esta pantalla ahora sí ofrece (T-4 y T-5, B)
 *
 * Los controles salen de `accionesDe`, en `ciclo.ts`, que es la segunda
 * copia de las tres transiciones que `migrations/0007_ciclo_de_vida.sql`
 * enumera en positivo. **La pantalla no ofrece lo que el servidor va a
 * rechazar**: no hay «Marcar ganada» sobre un borrador ni «Emitir» sobre lo
 * que ya salió, ni apagado ni anunciado. Es la lección de la unidad B de
 * T-2, donde el desplegable mostraba un hueco donde había un cliente — un
 * control que existe es una promesa.
 *
 * El mismo mapa alimenta el aviso de `avisoDeNoEsBorrador`, así que el texto
 * no puede nombrar una puerta que no esté dibujada ni callarse una que sí.
 *
 * **Sólo emitir se confirma**, y la asimetría tiene un motivo: emitir congela
 * el borrador que alguien estaba escribiendo, y un clic de más ahí cuesta el
 * trabajo en curso de los dos editores. Ganar y perder registran un desenlace
 * que ya ocurrió afuera, sobre un documento que ya estaba congelado: la
 * equivocación cuesta una etiqueta mal puesta, no contenido. Confirmar las
 * tres convertiría la confirmación en un trámite que se aprieta sin leer, que
 * es exactamente lo que la de emitir no puede ser.
 *
 * ## Lo que esta pantalla sigue sin hacer
 *
 * No imprime (T-6), no abre procesos (T-7) y **no muestra el snapshot**: lo
 * que se dibuja acá sale de las tablas vivas, igual que antes de T-4. El
 * snapshot es la prueba de qué se le mandó al cliente y se lee en la salida
 * imprimible, no en la ficha de trabajo.
 *
 * «Editar» aparece **solo sobre un borrador**, que es lo único que la API
 * deja editar. El aviso de por qué no está vive en `avisoDeNoEsBorrador` y
 * se dibuja en su lugar: un botón que falta sin explicación se lee como un
 * defecto de la pantalla.
 */
import { useEffect, useState } from "react";

import type { Cotizacion } from "../../../worker/contract";
import { hoyEnPanama } from "../../../worker/db/momentos";
import { Aviso } from "../../layout/Aviso";
import { Enlace } from "../../layout/Enlace";
import { Fila } from "../../layout/Fila";
import { Pila } from "../../layout/Pila";
import { Rejilla } from "../../layout/Rejilla";
import { navegarA } from "../../navegacion";
import { enlaceDe } from "../../ruteo";
import { Bitacora, type EstadoDeBitacora } from "../Bitacora";
import {
  cargarBitacoraDeCotizacion,
  cargarCotizacion,
  duplicarCotizacion,
  emitirCotizacion,
  ganarCotizacion,
  perderCotizacion,
  textoDeProblema,
  type Resultado,
} from "./api";
import {
  ROTULOS_DE_ACCION,
  ROTULO_DE_CANCELAR_EMISION,
  ROTULO_DE_CONFIRMAR_EMISION,
  accionesDe,
  confirmacionDeEmitir,
  textoDeProcedencia,
  type AccionDeCiclo,
} from "./ciclo";
import { EditorDeLineas } from "./EditorDeLineas";
import { EditorDeModulos } from "./EditorDeModulos";
import { mensajeDeExcepcion } from "./modulos";
import {
  VACIO,
  avisoDeNoEsBorrador,
  clienteDe,
  estaVencida,
  estadoLegible,
  fechaLegible,
  vencimientoDe,
} from "./presentacion";

type Props = {
  readonly id: string;
};

type Estado =
  | { fase: "cargando" }
  | { fase: "listo"; cotizacion: Cotizacion }
  | { fase: "problema"; mensaje: string };

/**
 * De dónde salió esta cotización, cuando salió de alguna.
 *
 * `cotizacion` en nulo **no** quiere decir «no nació duplicando»: eso lo dice
 * `duplicadaDeId` y se decide antes de pedir nada. Quiere decir que la
 * lectura de la de arriba no salió, que es un fallo de red y no un dato
 * ausente — la fila existe siempre, se lo garantizan la llave foránea y el
 * disparador de tenencia de `0004`.
 *
 * **`de` no es decoración.** Es de cuál se leyó, y es lo que hace que un
 * resultado viejo no se dibuje debajo de una cotización nueva: la respuesta
 * que llega tarde se descarta sola al no coincidir, sin un efecto que
 * limpie nada. Es el mismo truco que evita los tres `setState` de reseteo
 * que React desaconseja dentro de un efecto.
 */
type Procedencia = {
  readonly de: string;
  readonly cotizacion: Cotizacion | null;
};

function Dato({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="definicion">
      <dt className="definicion__rotulo">{rotulo}</dt>
      <dd className="definicion__valor">{valor}</dd>
    </div>
  );
}

export function DetalleDeCotizacion({ id }: Props) {
  const [estado, setEstado] = useState<Estado>({ fase: "cargando" });
  const [bitacora, setBitacora] = useState<EstadoDeBitacora>({
    fase: "cargando",
  });
  const [procedencia, setProcedencia] = useState<Procedencia | null>(null);
  const [ocupado, setOcupado] = useState(false);

  /*
   * Las dos cosas que esta pantalla dice **de una cotización concreta**
   * guardan de cuál hablan, en vez de limpiarse cuando el identificador
   * cambia. Duplicar navega a la copia sin desmontar este componente, así
   * que sin el identificador adentro la confirmación de emitir se quedaría
   * abierta sobre un documento que nadie miró, y el aviso de un 409 seguiría
   * hablando de la cotización anterior.
   *
   * Guardarlo es además lo que deja no escribir estado dentro de un efecto,
   * que es lo que React desaconseja y lo que el linter de este proyecto
   * rechaza: lo viejo no se borra, deja de coincidir.
   */
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ id: string; mensaje: string } | null>(
    null,
  );

  const confirmando = confirmandoId === id;
  const problema = aviso !== null && aviso.id === id ? aviso.mensaje : null;

  useEffect(() => {
    const control = new AbortController();

    void cargarCotizacion(id, control.signal).then((resultado) => {
      if (control.signal.aborted) return;

      setEstado(
        resultado.estado === "ok"
          ? { fase: "listo", cotizacion: resultado.valor }
          : { fase: "problema", mensaje: textoDeProblema(resultado) },
      );
    });

    void cargarBitacoraDeCotizacion(id, control.signal).then((resultado) => {
      if (control.signal.aborted) return;

      setBitacora(
        resultado.estado === "ok"
          ? { fase: "listo", entradas: resultado.valor }
          : { fase: "problema", mensaje: textoDeProblema(resultado) },
      );
    });

    return () => {
      control.abort();
    };
  }, [id]);

  const origenId = estado.fase === "listo" ? estado.cotizacion.duplicadaDeId : null;

  /**
   * La de arriba en la cadena de duplicación, y **sólo ella**.
   *
   * Un salto y no el recorrido entero: la de arriba, abierta, muestra el
   * suyo con este mismo componente, así que la cadena se sube a un clic por
   * salto. Que termine siempre está medido en M-2 de `0007` —el grafo es un
   * bosque, porque sólo crece por las hojas y `duplicada_de_id` es inmutable
   * desde el alta—, así que acá no hay tope de profundidad ni detección de
   * ciclos: sería código que ninguna prueba puede matar.
   *
   * Es un efecto aparte del de arriba y no una lectura encadenada adentro de
   * él por el mismo motivo que la bitácora: un fallo de esta lectura no
   * puede dejar la ficha en blanco.
   */
  useEffect(() => {
    if (origenId === null) return;

    const control = new AbortController();

    void cargarCotizacion(origenId, control.signal).then((resultado) => {
      if (control.signal.aborted) return;

      setProcedencia({
        de: origenId,
        cotizacion: resultado.estado === "ok" ? resultado.valor : null,
      });
    });

    return () => {
      control.abort();
    };
  }, [origenId]);

  /**
   * Las cuatro escrituras del ciclo pasan por acá, y existe por el
   * `finally`: es la misma forma que `conLaPantallaOcupada` de los dos
   * editores, y está acá por el mismo defecto que aquélla cierra.
   *
   * `pedir` devuelve un `Resultado` para todo lo que sabe que puede pasar,
   * pero su `respuesta.json()` del camino feliz no está cubierto: un 200 con
   * un cuerpo que no es JSON hace que la promesa **rechace**, y sin el
   * `finally` los botones quedarían apagados para siempre. El `catch` no es
   * adorno al lado del `finally`: destrabar los controles sin decir nada
   * deja a alguien apretando un botón que aparentemente no hace nada.
   */
  async function conLaPantallaOcupada(
    accion: () => Promise<void>,
  ): Promise<void> {
    setOcupado(true);
    try {
      await accion();
    } catch (error: unknown) {
      setAviso({
        id,
        mensaje: textoDeProblema({
          estado: "falla",
          mensaje: mensajeDeExcepcion(error),
        }),
      });
    } finally {
      setOcupado(false);
    }
  }

  /**
   * Lo que llega de cualquiera de las tres transiciones.
   *
   * El 409 —`cotizacion_no_es_emitida`, o `cotizacion_no_es_borrador` si
   * alguien emitió desde otra pestaña— quiere decir que **lo que hay en
   * pantalla es mentira**: el estado que decidió estos botones ya no es el
   * de la base. Así que además del mensaje se vuelve a leer la cotización,
   * por lo mismo que los editores releen su lista ante `orden_incompleto`:
   * reintentar contra lo que se ve volvería a fallar.
   */
  async function aplicar(
    peticion: () => Promise<Resultado<Cotizacion>>,
  ): Promise<void> {
    const resultado = await peticion();

    if (resultado.estado === "ok") {
      setEstado({ fase: "listo", cotizacion: resultado.valor });
      setConfirmandoId(null);
      setAviso(null);
      return;
    }

    setAviso({ id, mensaje: textoDeProblema(resultado) });

    if (resultado.estado !== "conflicto") return;

    const releido = await cargarCotizacion(id, new AbortController().signal);
    if (releido.estado === "ok") {
      setEstado({ fase: "listo", cotizacion: releido.valor });
      setConfirmandoId(null);
    }
  }

  /**
   * Duplicar no mueve el estado de nada: nace una fila nueva, y lo que se
   * hace con ella es abrirla. Por eso no pasa por `aplicar` —el cuerpo que
   * vuelve es **la copia**, y escribirla en `estado` dejaría el detalle
   * mostrando otra cotización bajo la dirección de ésta—.
   */
  async function duplicar(): Promise<void> {
    const resultado = await duplicarCotizacion(id);

    if (resultado.estado !== "ok") {
      setAviso({ id, mensaje: textoDeProblema(resultado) });
      return;
    }

    navegarA(enlaceDe({ nombre: "cotizacion", id: resultado.valor.id }));
  }

  function pedirAccion(accion: AccionDeCiclo) {
    // Emitir no escribe acá: abre la confirmación. Es la única de las cuatro
    // que lo hace, y el motivo está en la cabecera del archivo.
    if (accion === "emitir") {
      setAviso(null);
      setConfirmandoId(id);
      return;
    }

    if (accion === "duplicar") {
      void conLaPantallaOcupada(duplicar);
      return;
    }

    void conLaPantallaOcupada(() =>
      aplicar(() =>
        accion === "ganar" ? ganarCotizacion(id) : perderCotizacion(id),
      ),
    );
  }

  if (estado.fase === "cargando") return <p>Consultando…</p>;

  if (estado.fase === "problema") {
    return (
      <Pila>
        <Aviso tono="error">{estado.mensaje}</Aviso>
        <p>
          <Enlace href={enlaceDe({ nombre: "cotizaciones" })}>
            Volver a cotizaciones
          </Enlace>
        </p>
      </Pila>
    );
  }

  const { cotizacion } = estado;
  const bloqueo = avisoDeNoEsBorrador(cotizacion);
  const vencida = estaVencida(cotizacion, hoyEnPanama(new Date()));

  return (
    <Pila espacio="holgado">
      <header>
        <Pila espacio="ceñido">
          <p className="texto-apagado">
            <Enlace href={enlaceDe({ nombre: "cotizaciones" })}>
              Cotizaciones
            </Enlace>
          </p>
          <Fila alinear="entre">
            <h1>{cotizacion.codigo}</h1>
            {/*
              Los controles del ciclo van en la misma franja que «Editar» y
              no en una barra propia: son lo que se hace con **esta**
              cotización, y separarlos obligaría a buscarlos. La `Fila`
              envuelve sola cuando no entran, así que a 320px bajan de
              renglón sin un breakpoint escrito a mano.
            */}
            <Fila>
              {bloqueo === null && (
                <Enlace
                  href={enlaceDe({
                    nombre: "cotizacion-edicion",
                    id: cotizacion.id,
                  })}
                  className="boton"
                >
                  Editar
                </Enlace>
              )}
              {accionesDe(cotizacion).map((accion) => (
                <button
                  key={accion}
                  type="button"
                  className="boton"
                  disabled={ocupado}
                  onClick={() => {
                    pedirAccion(accion);
                  }}
                >
                  {ROTULOS_DE_ACCION[accion]}
                </button>
              ))}
            </Fila>
          </Fila>
        </Pila>
      </header>

      {/*
        La confirmación de emitir. Es un bloque en la página y no un diálogo
        del navegador: `window.confirm` no se puede redactar en dos renglones
        ni se deja leer con el documento detrás, que es justo lo que alguien
        quiere mirar antes de congelarlo.
      */}
      {confirmando && (
        <div className="confirmacion" role="group" aria-labelledby="emitir">
          <Pila>
            <h2 id="emitir" className="confirmacion__titulo">
              Emitir congela el documento
            </h2>
            <p>{confirmacionDeEmitir(cotizacion)}</p>
            <Fila>
              <button
                type="button"
                className="boton boton--primario"
                disabled={ocupado}
                onClick={() => {
                  void conLaPantallaOcupada(() =>
                    aplicar(() => emitirCotizacion(cotizacion.id)),
                  );
                }}
              >
                {ROTULO_DE_CONFIRMAR_EMISION}
              </button>
              <button
                type="button"
                className="boton"
                disabled={ocupado}
                onClick={() => {
                  setConfirmandoId(null);
                }}
              >
                {ROTULO_DE_CANCELAR_EMISION}
              </button>
            </Fila>
          </Pila>
        </div>
      )}

      {problema !== null && <Aviso tono="error">{problema}</Aviso>}

      {bloqueo !== null && <Aviso>{bloqueo}</Aviso>}

      {/*
        De dónde salió, cuando salió de otra. El código va en la frase y el
        enlace al lado con un rótulo fijo: el rótulo no puede ser el código
        porque mientras la de arriba se está leyendo todavía no se sabe cuál
        es, y un enlace que cambia de nombre al terminar de cargar es un
        enlace que se aprieta en el medio.
      */}
      {cotizacion.duplicadaDeId !== null && (
        <p className="texto-apagado">
          {procedencia === null || procedencia.de !== cotizacion.duplicadaDeId
            ? "Esta cotización nació duplicando otra."
            : textoDeProcedencia(procedencia.cotizacion)}{" "}
          <Enlace
            href={enlaceDe({
              nombre: "cotizacion",
              id: cotizacion.duplicadaDeId,
            })}
          >
            Ver de dónde salió
          </Enlace>
        </p>
      )}

      {vencida && (
        <Aviso>
          Este borrador tiene el vencimiento pasado. Se puede seguir editando
          sin tocarle la fecha —el vencimiento que ya estaba se reenvía tal
          cual—, pero conviene correrlo antes de mandarlo.
        </Aviso>
      )}

      <Rejilla minimo="16rem">
        <dl className="definiciones">
          <Dato rotulo="Estado" valor={estadoLegible(cotizacion)} />
          <Dato rotulo="Cliente" valor={clienteDe(cotizacion)} />
          <Dato rotulo="Moneda" valor={cotizacion.moneda} />
        </dl>
        <dl className="definiciones">
          <Dato rotulo="Vence" valor={vencimientoDe(cotizacion)} />
          <Dato rotulo="Abierta" valor={fechaLegible(cotizacion.fecha)} />
          <Dato
            rotulo="Alta"
            valor={`${fechaLegible(cotizacion.creadaEn)} · ${
              cotizacion.creadaPorNombre ?? VACIO
            }`}
          />
        </dl>
      </Rejilla>

      {/*
        `editable` sale del mismo `avisoDeNoEsBorrador` que decide el botón
        de editar: una sola lectura del estado manda en las dos cosas, y así
        no pueden contradecirse — un editor de módulos vivo junto a un aviso
        de que esto ya no se edita sería la peor de las dos pantallas.

        Y es lo que hace que emitir cierre los dos editores sin recargar: la
        respuesta de `/emitir` reemplaza la cotización en `estado`, `bloqueo`
        deja de ser nulo y los dos pasan a lectura en el mismo dibujo.
      */}
      <EditorDeModulos cotizacionId={cotizacion.id} editable={bloqueo === null} />

      {/*
        Las líneas van **después** de la prosa y antes de la bitácora, que
        es el orden del documento: primero qué se va a hacer y después
        cuánto cuesta. El mismo `bloqueo` manda en los dos editores, así que
        no pueden contradecirse.
      */}
      <EditorDeLineas
        cotizacionId={cotizacion.id}
        moneda={cotizacion.moneda}
        editable={bloqueo === null}
      />

      <Bitacora estado={bitacora} id="bitacora-de-la-cotizacion" />
    </Pila>
  );
}
