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
 * ## Los procesos, que esta pantalla ahora sí abre (T-13, unidad B)
 *
 * Decía «no abre procesos (T-7)», y era cierto mientras los abriera ganar.
 * T-13 le devolvió esa decisión al bufete —la línea es una unidad de
 * facturación y el proceso una unidad de trabajo, y no tienen por qué ser
 * lo mismo— y el sitio donde se toma es este panel.
 *
 * Va **acá y no en una pantalla aparte**, al lado de «Procesos que abrió»,
 * por tres motivos que se sostienen juntos: no hay navegación que perder
 * entre ver la propuesta y confirmarla; se puede volver meses después, que
 * es cuando aparece el trámite que no estaba cotizado; y la sección que
 * contesta «¿en qué quedó esto?» ya existía justo arriba, así que las dos
 * mitades de la misma pregunta quedan juntas.
 *
 * La propuesta se **deriva en la pantalla** (`ciclo.ts`,
 * `propuestaDeProcesos`) sobre las líneas que esta misma pantalla lee. No
 * hay ruta que la pida, y el argumento está allá: una propuesta que viajara
 * de ida para volver corregida serían dos formas del mismo dato en el
 * cable.
 *
 * ## Lo que esta pantalla sigue sin hacer
 *
 * **No muestra el snapshot**: lo que se dibuja acá sale de las tablas
 * vivas, igual que antes de T-4. El snapshot es la prueba de qué se le
 * mandó al cliente y se lee en la hoja imprimible, que es otra pantalla y
 * otra lectura.
 *
 * Lo que esta pantalla sí hace desde T-6 es **ofrecer esa hoja**, y sólo
 * sobre lo que tiene documento: un enlace a imprimir un borrador lleva a un
 * aviso, y un control que existe es una promesa.
 *
 * «Editar» aparece **solo sobre un borrador**, que es lo único que la API
 * deja editar. El aviso de por qué no está vive en `avisoDeNoEsBorrador` y
 * se dibuja en su lugar: un botón que falta sin explicación se lee como un
 * defecto de la pantalla.
 */
import { useEffect, useState } from "react";

import type {
  Cotizacion,
  FallaDeValidacion,
  Proceso,
  TipoProceso,
  Usuario,
} from "../../../worker/contract";
import { hoyEnPanama } from "../../../worker/db/momentos";
import { cargarUsuarios } from "../../api/usuarios";
import { Aviso } from "../../layout/Aviso";
import { Enlace } from "../../layout/Enlace";
import { Fila } from "../../layout/Fila";
import { Pila } from "../../layout/Pila";
import { Rejilla } from "../../layout/Rejilla";
import { mensajeDeFalla } from "../../mensajes";
import { navegarA } from "../../navegacion";
import { enlaceDe } from "../../ruteo";
import { Bitacora, type EstadoDeBitacora } from "../Bitacora";
import { cargarTiposProceso } from "../catalogos/api";
import { cargarProcesos } from "../procesos/api";
import { procesosDeCotizacion } from "../procesos/presentacion";
/*
 * Los dos filtros de «quién se puede elegir» se importan de la pantalla de
 * procesos en vez de copiarse acá, y es la misma decisión que
 * `FormularioDeProceso` ya tomó con el segundo: son las mismas reglas sobre
 * las mismas tablas, y dos copias serían dos criterios que se desincronizan
 * en el primer cambio.
 *
 * Importa especialmente el de tipos. Un trámite dado de baja que llegara al
 * desplegable abriría un proceso de un tipo que el bufete ya no usa, y la
 * excepción —el que **ya está elegido** sigue ofreciéndose— es la que
 * impide que un desplegable se vacíe solo y parezca haber perdido el dato.
 */
import { tipoSeleccionables } from "../procesos/formulario";
import { responsablesSeleccionables } from "../procesos/pendientes";
import {
  abrirProcesosDeCotizacion,
  cargarBitacoraDeCotizacion,
  cargarCotizacion,
  cargarLineas,
  duplicarCotizacion,
  emitirCotizacion,
  ganarCotizacion,
  perderCotizacion,
  textoDeProblema,
  type Resultado,
} from "./api";
import {
  AVISO_DE_LINEAS_NO_LEIDAS,
  ROTULOS_DE_ACCION,
  ROTULO_DE_ABRIR,
  ROTULO_DE_AGREGAR_PROCESO,
  ROTULO_DE_CANCELAR_EMISION,
  ROTULO_DE_CONFIRMAR_EMISION,
  aAperturaDeProcesos,
  accionesDe,
  confirmacionDeEmitir,
  propuestaDeProcesos,
  propuestaVacia,
  textoDeAperturaDeProcesos,
  textoDeProcedencia,
  textoDeProcesosAbiertos,
  validarPropuesta,
  type AccionDeCiclo,
  type PropuestaDeProceso,
} from "./ciclo";
import { EditorDeLineas } from "./EditorDeLineas";
import { EditorDeModulos } from "./EditorDeModulos";
import { PlanDePagos } from "./PlanDePagos";
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

/**
 * En qué quedó esta cotización: los procesos que abrió al ganarse (T-15).
 *
 * `procesos` en nulo **no** quiere decir «no abrió ninguno» —eso es el
 * arreglo vacío, y es un desenlace legítimo— sino que la lectura no salió.
 * Las dos cosas se dicen distinto, por lo mismo que en `Procedencia`: un
 * fallo de red disfrazado de cero manda a alguien a concluir que no hay
 * procesos que sí existen.
 *
 * **`de` no es decoración**, igual que allá: es de cuál cotización se leyó.
 * Duplicar navega a la copia sin desmontar este componente, así que sin el
 * identificador adentro la lista de una ganada se quedaría dibujada debajo
 * del borrador recién nacido.
 */
type Abiertos = {
  readonly de: string;
  readonly procesos: readonly Proceso[] | null;
};

/**
 * La propuesta de procesos que el bufete está editando (T-13).
 *
 * **`de` no es decoración**, por tercera vez en este archivo y por el mismo
 * motivo: duplicar navega a la copia sin desmontar el componente, y sin el
 * identificador adentro las filas a medio editar de una ganada quedarían
 * dibujadas debajo del borrador recién nacido — y peor, el botón las
 * abriría contra la cotización equivocada.
 *
 * `conLineas` en `false` quiere decir que las líneas no se leyeron, no que
 * la cotización no tenga trámites. Son dos cosas que producen la misma
 * lista vacía y se dicen distinto, igual que el cero y el fallo de red en
 * `Abiertos`.
 *
 * `nuevas` es el contador de filas agregadas a mano, y existe para darles
 * una `clave` que no se repita. Vive **adentro de la propuesta** y no en un
 * estado aparte para que se reinicie junto con ella: un contador que
 * sobreviviera al cambio de cotización no rompería nada hoy, pero sería un
 * dato de una cotización colgando de otra.
 */
type Propuesta = {
  readonly de: string;
  readonly filas: readonly PropuestaDeProceso[];
  readonly conLineas: boolean;
  readonly nuevas: number;
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
  const [abiertos, setAbiertos] = useState<Abiertos | null>(null);
  const [propuesta, setPropuesta] = useState<Propuesta | null>(null);
  const [tipos, setTipos] = useState<TipoProceso[]>([]);
  const [equipo, setEquipo] = useState<Usuario[]>([]);
  const [fallas, setFallas] = useState<FallaDeValidacion[]>([]);
  const [ocupado, setOcupado] = useState(false);

  /**
   * Cuántas veces se releyó lo que esta cotización abrió.
   *
   * Es lo que hace que abrir procesos se vea sin recargar: el efecto de
   * abajo cuelga de este número además del identificador, así que subirlo
   * después de un 201 vuelve a preguntar. **No es un `setState` dentro de
   * un efecto** —lo sube el manejador del botón— que es lo que React
   * desaconseja y lo que el linter de este proyecto rechaza.
   *
   * La alternativa era escribir en `abiertos` los procesos que devuelve la
   * apertura, y es justo la que no se quiere: habría dos lugares donde se
   * decide qué procesos tiene una cotización, y el día que difieran la
   * pantalla mostraría una cosa al abrir y otra al recargar.
   */
  const [recargas, setRecargas] = useState(0);

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

  /* El identificador **sólo mientras esté ganada**. Ver el efecto de abajo. */
  const ganadaId =
    estado.fase === "listo" && estado.cotizacion.estado === "ganada"
      ? estado.cotizacion.id
      : null;

  /*
   * Lo mismo visto como pregunta de sí o no, para los dos catálogos que no
   * dependen de **cuál** cotización es. Sale de `ganadaId` y no de un
   * segundo `estado === "ganada"` escrito al lado: dos lecturas del mismo
   * hecho son dos sitios donde un día dice cosas distintas.
   */
  const esGanada = ganadaId !== null;

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
   * Lo que esta cotización ganada tiene y lo que podría abrir (T-15, con la
   * siembra de T-13).
   *
   * ## Por qué cuelga del estado y no sólo del identificador
   *
   * `ganadaId` es el identificador **sólo mientras la cotización esté
   * ganada**, y nulo si no. Eso hace dos cosas de una: no se pide nada
   * sobre un borrador —no hay nada que pedir—, y marcar ganada desde el
   * botón de arriba dispara la lectura sola, porque `aplicar` reemplaza la
   * cotización en `estado` y `ganadaId` pasa de nulo a tenerlo. Sin eso
   * habría que recargar para ver el panel de lo que uno acaba de ganar.
   *
   * ## Por qué lee el listado entero de procesos y no una ruta propia
   *
   * Porque la ruta propia no existe y no hace falta. El servidor ya
   * entrega la cartera completa de procesos en una respuesta —es la misma
   * decisión que toman el buscador y el filtro por estado de la pantalla
   * de procesos, y el bufete son dos personas— y cada proceso trae su
   * cotización de origen resuelta desde T-15. Una ruta nueva sería un
   * segundo lugar donde se decide qué proceso cuelga de qué cotización.
   *
   * ## Por qué las dos lecturas van juntas y no en dos efectos
   *
   * Porque **la segunda depende de la primera para decidir qué hacer**: la
   * propuesta se siembra sólo si la cotización todavía no abrió ninguno, y
   * eso lo contesta la lista de procesos. En dos efectos, el orden de
   * llegada decidiría si el panel aparece sembrado o vacío, que es
   * exactamente la clase de parpadeo que no se puede probar. Con un
   * `Promise.all` el resultado es el mismo siempre.
   *
   * Que vayan juntas **no las vuelve bloqueantes la una de la otra**: las
   * dos devuelven `Resultado` y ninguna tira, así que un fallo de las
   * líneas deja la lista de procesos igual y al revés. Y sigue siendo un
   * efecto aparte del de la cotización, por lo mismo que la bitácora y la
   * procedencia: un fallo de esta lectura no puede dejar la ficha en
   * blanco.
   *
   * `recargas` está en las dependencias y es lo que hace que abrir se vea
   * sin recargar la página. Ver su declaración.
   */
  useEffect(() => {
    if (ganadaId === null) return;

    const control = new AbortController();

    void Promise.all([
      cargarProcesos(control.signal),
      cargarLineas(ganadaId, control.signal),
    ]).then(([deProcesos, deLineas]) => {
      if (control.signal.aborted) return;

      const suyos =
        deProcesos.estado === "ok"
          ? procesosDeCotizacion(deProcesos.valor, ganadaId)
          : null;

      setAbiertos({ de: ganadaId, procesos: suyos });

      // **La siembra corre sólo sobre la ganada que todavía no abrió
      // ninguno.** Si ya abrió, proponer de nuevo ofrecería lo que ya
      // existe e invitaría a abrir dos veces lo mismo; ahí el panel
      // arranca vacío y es un camino para agregar otro.
      //
      // Y si la lista de procesos **no se pudo leer**, tampoco se siembra:
      // no sabemos si ya abrió, y proponer a ciegas es el mismo riesgo sin
      // la excusa. El bloque de arriba ya dice que la lectura falló.
      const sembrar = suyos !== null && suyos.length === 0;

      setPropuesta({
        de: ganadaId,
        filas:
          sembrar && deLineas.estado === "ok"
            ? propuestaDeProcesos(deLineas.valor.lineas)
            : [],
        conLineas: deLineas.estado === "ok",
        nuevas: 0,
      });
    });

    return () => {
      control.abort();
    };
  }, [ganadaId, recargas]);

  /**
   * Los dos catálogos que el panel de apertura necesita para sus
   * desplegables: los tipos de proceso y el equipo del bufete.
   *
   * Cuelgan de `esGanada` y no de `ganadaId`, y la diferencia es real: no
   * dependen de **cuál** cotización es, así que colgarlos del
   * identificador los volvería a pedir al navegar de una ganada a otra sin
   * desmontar el componente. Lo que sí hace falta es no pedirlos sobre un
   * borrador, donde no hay panel que llenar.
   *
   * **Ninguno de los dos bloquea nada**, al revés que en el alta a mano,
   * donde un proceso sin cliente ni tipo no existe. Acá la propuesta ya
   * está sembrada con los tipos que las líneas traían, así que un catálogo
   * que no cargue deja los desplegables cortos pero no impide confirmar lo
   * que ya estaba. El 422 del servidor es la red de abajo.
   */
  useEffect(() => {
    if (!esGanada) return;

    const control = new AbortController();

    void Promise.all([
      cargarTiposProceso(control.signal),
      cargarUsuarios(control.signal),
    ]).then(([catalogo, personas]) => {
      if (control.signal.aborted) return;

      if (catalogo.estado === "ok") setTipos(catalogo.valor);
      if (personas.estado === "ok") setEquipo(personas.valor);
    });

    return () => {
      control.abort();
    };
  }, [esGanada]);

  /**
   * Las cuatro escrituras del ciclo y la apertura pasan por acá, y existe
por el
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

  /* ----------------------------------------------------------------------
     T-13 · El panel de apertura

     Las cuatro cosas que se le pueden hacer a la propuesta —editar una
     fila, sacar una, agregar otra y confirmarla— pasan por estas cuatro
     funciones. Las tres primeras son escrituras de estado y no tocan la
     red; la cuarta es la única que abre algo.

     Todas vuelven a escribir la propuesta entera en vez de mutarla: es
     estado de React, y `filas` viaja como `readonly` desde `ciclo.ts`
     justamente para que no haya forma de empujarle una fila encima.
     -------------------------------------------------------------------- */

  /**
   * Cambia un campo de una fila, identificada por su `clave`.
   *
   * **Por la clave y no por el índice**, y es la misma razón por la que las
   * filas la tienen: sacar la segunda de tres y después escribir en la que
   * quedó debajo tiene que escribir en esa y no en la que ocupó su lugar.
   */
  function editarFila(
    clave: string,
    campo: "tipoProcesoId" | "titulo" | "responsableId",
    valor: string,
  ) {
    setPropuesta((anterior) =>
      anterior === null
        ? anterior
        : {
            ...anterior,
            filas: anterior.filas.map((fila) =>
              fila.clave === clave ? { ...fila, [campo]: valor } : fila,
            ),
          },
    );
  }

  /**
   * Saca una fila de la propuesta.
   *
   * Es la mitad de «fusionar dos en uno»: la otra mitad es renombrar la que
   * queda, que se hace con el campo de título. No hay un gesto propio para
   * fusionar, y la ausencia se decidió — un botón «fusionar» tendría que
   * preguntar cuál de los dos títulos sobrevive, que es exactamente lo que
   * sacar y renombrar ya contesta sin preguntar nada.
   */
  function sacarFila(clave: string) {
    setPropuesta((anterior) =>
      anterior === null
        ? anterior
        : {
            ...anterior,
            filas: anterior.filas.filter((fila) => fila.clave !== clave),
          },
    );
  }

  /**
   * Agrega una fila en blanco al final.
   *
   * La `clave` sale del contador de la propuesta y lleva prefijo: las
   * sembradas usan el identificador de su línea, que es un UUID, así que
   * `nueva-0` no puede chocar con ninguna. El contador sube siempre y no
   * se recalcula del largo de la lista — con el largo, agregar, sacar y
   * volver a agregar daría dos filas con la misma clave.
   */
  function agregarFila() {
    setPropuesta((anterior) =>
      anterior === null
        ? anterior
        : {
            ...anterior,
            filas: [
              ...anterior.filas,
              propuestaVacia(`nueva-${String(anterior.nuevas)}`),
            ],
            nuevas: anterior.nuevas + 1,
          },
    );
  }

  /**
   * Abre los procesos de la propuesta.
   *
   * ## La validación previa, y por qué no es la guarda
   *
   * `validarPropuesta` es la segunda copia de lo que el servidor rechaza
   * con 422, y está acá para marcar el campo al instante en vez de cobrar
   * una ida y vuelta. La que manda es la del servidor, que se niega
   * igual: lo prueba `test/apertura-api.spec.ts` llamando a la ruta
   * directamente.
   *
   * ## Por qué al volver se relee en vez de usar la respuesta
   *
   * El 201 trae los identificadores de lo que nació, y no se usan para
   * dibujar nada: lo que hace esta función es subir `recargas`, que vuelve
   * a preguntar por la lista de procesos. El argumento está en la
   * declaración de ese contador — dos lugares donde se decide qué procesos
   * tiene una cotización son dos respuestas el día que difieran.
   *
   * La propuesta se reconstruye sola con esa relectura: la cotización pasa
   * a tener procesos, así que la siembra no corre y el panel queda vacío,
   * listo para abrir otro. Por eso no hay un `setPropuesta` de limpieza
   * acá.
   */
  async function abrir(): Promise<void> {
    if (propuesta === null || propuesta.de !== id) return;

    const previas = validarPropuesta(propuesta.filas);
    setFallas(previas);
    setAviso(null);
    if (previas.length > 0) return;

    const resultado = await abrirProcesosDeCotizacion(
      id,
      aAperturaDeProcesos(propuesta.filas),
    );

    if (resultado.estado === "invalido") {
      setFallas(resultado.fallas);
      return;
    }
    if (resultado.estado !== "ok") {
      setAviso({ id, mensaje: textoDeProblema(resultado) });
      return;
    }

    setFallas([]);
    setRecargas((cuantas) => cuantas + 1);
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
              {/*
                La hoja imprimible, **sólo sobre lo que tiene documento**, y
                colgada del mismo `bloqueo` que decide «Editar».

                Hubo acá un predicado propio —`tieneDocumento`, en
                `impresion.ts`— con el argumento de que son dos preguntas
                distintas: `bloqueo` dice si esto se edita (I-4) y aquél
                decía si hay papel congelado (el `CHECK` de coherencia de
                `0004`). **Se midió y el argumento no se sostenía**: con el
                predicado borrado y esta condición en su lugar, el
                `typecheck`, las 1575 unitarias y las 290 de punta a punta
                quedaron en verde. O sea que su único asesino eran sus dos
                pruebas propias, y las dos pruebas de punta a punta que
                miran este enlace —que el borrador no lo ofrezca y que la
                emitida sí— pasan con cualquiera de las dos guardas.

                Es la cuarta lección de prueba de esta tajada tal cual:
                **dos guardas que resuelven lo mismo por caminos distintos
                se anulan como garantía**, porque quitar cualquiera no mata
                nada. Se midieron las combinaciones y queda una, y queda
                ésta porque es la que ya decidía otras tres cosas en esta
                pantalla y tiene asesinos propios. El día que un estado
                pueda editarse teniendo documento, la que se parte en dos es
                ésta, con su prueba.
              */}
              {bloqueo !== null && (
                <Enlace
                  href={enlaceDe({
                    nombre: "cotizacion-hoja",
                    id: cotizacion.id,
                  })}
                  className="boton"
                >
                  Ver la hoja
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

      {/*
        T-15 · En qué quedó esta cotización.

        Va **arriba de la ficha y del documento**, y debajo de la
        procedencia: las dos contestan la misma clase de pregunta —de
        dónde salió esto, adónde fue a parar— y la segunda es la que
        alguien abre a buscar tres meses después, cuando ya no recuerda el
        contenido.

        Se dibuja **sólo sobre una ganada**, y la condición es `ganadaId`:
        el mismo valor que decide la lectura. Colgarlo de «hay procesos»
        lo dibujaría también sobre una perdida que comparta cliente con un
        proceso cualquiera, y colgarlo de un segundo `estado === "ganada"`
        escrito acá serían dos lecturas del mismo hecho.

        El bloque aparece **antes** de que la lectura vuelva, diciendo la
        frase del fallo. Es deliberado: un bloque que aparece y desaparece
        obliga a preguntarse si no abrió ninguno o si no cargó, y esa duda
        es exactamente lo que estas tres frases existen para no tener.
      */}
      {ganadaId !== null && (
        <section className="procesos-abiertos" aria-labelledby="que-abrio">
          <Pila espacio="ceñido">
            <h2 id="que-abrio" className="procesos-abiertos__titulo">
              Procesos que abrió
            </h2>
            <p>
              {textoDeProcesosAbiertos(
                abiertos !== null && abiertos.de === ganadaId
                  ? abiertos.procesos
                  : null,
              )}
            </p>
            {abiertos !== null &&
              abiertos.de === ganadaId &&
              abiertos.procesos !== null &&
              abiertos.procesos.length > 0 && (
                <ul className="sin-viñetas">
                  {abiertos.procesos.map((proceso) => (
                    <li key={proceso.id}>
                      <Enlace
                        href={enlaceDe({
                          nombre: "proceso",
                          id: proceso.id,
                          pestana: "trabajo",
                        })}
                      >
                        {proceso.titulo}
                      </Enlace>
                    </li>
                  ))}
                </ul>
              )}
          </Pila>
        </section>
      )}

      {/*
        T-13 · Qué procesos abrir, y cuáles.

        Va **debajo** de «Procesos que abrió» y no arriba: primero lo que
        hay, después lo que podría haber. Es el mismo orden en que una
        persona hace la pregunta —«¿esto en qué quedó?» antes de «¿qué le
        falta?»— y el que deja que el texto del panel pueda hablar de lo
        que se acaba de leer más arriba.

        Se dibuja sobre la misma condición que aquél, `ganadaId`, y por el
        mismo motivo: colgarlo de «tiene líneas con trámite» lo dibujaría
        sobre un borrador que todavía se está escribiendo, y colgarlo de un
        segundo `estado === "ganada"` serían dos lecturas del mismo hecho.

        Las filas se dibujan **inline y no con un componente declarado
        acá adentro**. No es estilo: un componente declarado dentro de otro
        es un tipo nuevo en cada render, así que React desmonta y vuelve a
        montar el árbol entero: el campo de título perdería el foco a cada
        tecla. Con una lista de filas editables es exactamente donde
        aparece.
      */}
      {ganadaId !== null && (
        <section className="apertura" aria-labelledby="abrir-procesos">
          <Pila espacio="ceñido">
            <h2 id="abrir-procesos" className="apertura__titulo">
              Abrir procesos
            </h2>
            <p>
              {textoDeAperturaDeProcesos(
                abiertos !== null &&
                  abiertos.de === ganadaId &&
                  abiertos.procesos !== null &&
                  abiertos.procesos.length > 0,
              )}
            </p>

            {/*
              La lista vacía porque las líneas no se leyeron se dice, y no
              se confunde con la lista vacía de una cotización sin
              trámites. Es el mismo criterio que separa el cero del fallo
              de red en el bloque de arriba.
            */}
            {propuesta !== null &&
              propuesta.de === ganadaId &&
              !propuesta.conLineas && (
                <Aviso>{AVISO_DE_LINEAS_NO_LEIDAS}</Aviso>
              )}

            {fallas.length > 0 && (
              <Aviso tono="error">
                <ul className="lista-de-fallas">
                  {fallas.map((falla) => (
                    <li key={`${falla.campo}-${falla.motivo}`}>
                      {mensajeDeFalla(falla.motivo, falla.cuantos)}
                    </li>
                  ))}
                </ul>
              </Aviso>
            )}

            {propuesta !== null && propuesta.de === ganadaId && (
              <>
                <ul className="sin-viñetas apertura__filas">
                  {propuesta.filas.map((fila) => (
                    <li key={fila.clave} className="apertura__fila">
                      <Rejilla minimo="12rem">
                        <div className="campo">
                          <label
                            className="campo__rotulo"
                            htmlFor={`apertura-tipo-${fila.clave}`}
                          >
                            Tipo de proceso
                          </label>
                          <select
                            id={`apertura-tipo-${fila.clave}`}
                            className="campo__control"
                            value={fila.tipoProcesoId}
                            onChange={(evento) => {
                              editarFila(
                                fila.clave,
                                "tipoProcesoId",
                                evento.target.value,
                              );
                            }}
                          >
                            <option value="">Elegir tipo…</option>
                            {tipoSeleccionables(tipos, fila.tipoProcesoId).map(
                              (tipo) => (
                                <option key={tipo.id} value={tipo.id}>
                                  {tipo.nombre}
                                </option>
                              ),
                            )}
                          </select>
                        </div>

                        <div className="campo">
                          <label
                            className="campo__rotulo"
                            htmlFor={`apertura-titulo-${fila.clave}`}
                          >
                            Título
                          </label>
                          <input
                            id={`apertura-titulo-${fila.clave}`}
                            className="campo__control"
                            type="text"
                            value={fila.titulo}
                            onChange={(evento) => {
                              editarFila(
                                fila.clave,
                                "titulo",
                                evento.target.value,
                              );
                            }}
                          />
                        </div>

                        <div className="campo">
                          <label
                            className="campo__rotulo"
                            htmlFor={`apertura-responsable-${fila.clave}`}
                          >
                            Responsable
                          </label>
                          <select
                            id={`apertura-responsable-${fila.clave}`}
                            className="campo__control"
                            value={fila.responsableId}
                            onChange={(evento) => {
                              editarFila(
                                fila.clave,
                                "responsableId",
                                evento.target.value,
                              );
                            }}
                          >
                            {/* La opción vacía se NOMBRA, igual que en el
                                alta a mano: abrir un proceso sin decidir
                                quién lo lleva es legítimo, y justamente
                                por eso tiene que elegirse a sabiendas y no
                                quedar en un hueco en blanco. */}
                            <option value="">Sin responsable asignado</option>
                            {responsablesSeleccionables(
                              equipo,
                              fila.responsableId,
                            ).map((persona) => (
                              <option key={persona.id} value={persona.id}>
                                {persona.nombre}
                              </option>
                            ))}
                          </select>
                        </div>
                      </Rejilla>

                      {/*
                        El rótulo nombra **cuál** se saca y no dice sólo
                        «Quitar». Con tres filas en pantalla, tres
                        controles que se llaman igual son tres controles
                        que ni una prueba ni un lector de pantalla pueden
                        distinguir. El título puede estar vacío en una fila
                        recién agregada, y entonces se nombra por su
                        posición, que es lo único que queda.
                      */}
                      <button
                        type="button"
                        className="boton boton--tenue"
                        disabled={ocupado}
                        onClick={() => {
                          sacarFila(fila.clave);
                        }}
                      >
                        {fila.titulo.trim() === ""
                          ? "Sacar este proceso de la lista"
                          : `Sacar «${fila.titulo.trim()}» de la lista`}
                      </button>
                    </li>
                  ))}
                </ul>

                <Fila>
                  <button
                    type="button"
                    className="boton"
                    disabled={ocupado}
                    onClick={agregarFila}
                  >
                    {ROTULO_DE_AGREGAR_PROCESO}
                  </button>
                  {/*
                    El que confirma se apaga con la lista vacía, y eso no
                    reemplaza al 422 de `sin_procesos_que_abrir`: lo que
                    hace es no prometer una puerta que no lleva a ningún
                    lado. La guarda sigue siendo la del servidor, y tiene
                    su prueba.
                  */}
                  <button
                    type="button"
                    className="boton boton--primario"
                    disabled={ocupado || propuesta.filas.length === 0}
                    onClick={() => {
                      void conLaPantallaOcupada(abrir);
                    }}
                  >
                    {ROTULO_DE_ABRIR}
                  </button>
                </Fila>
              </>
            )}
          </Pila>
        </section>
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

      {/*
        El plan de pagos va **después** de las líneas, que es el orden del
        documento: primero qué se va a hacer, después cuánto cuesta, y recién
        entonces cómo se paga. Leerlo antes de saber el total no serviría de
        nada, porque el cotejo del plan es justamente contra ese total.

        **No recibe `editable`, y es deliberado.** Los dos editores de arriba
        sí, porque I-4 e I-5 congelan el documento al emitirlo; las cuotas no
        entran al snapshot, así que agregar una no toca lo que quedó
        congelado — y es justo cuando una cotización se gana que el plan se
        termina de acomodar. Está argumentado en `PlanDePagos.tsx` y en
        `migrations/0010_plan_de_pagos.sql`.

        Tampoco recibe la moneda, al revés que el editor de líneas, y
        tampoco es un olvido: el plan no escribe ningún importe sin unidad
        porque los dos que escribe —la suma y la base— salen del mismo
        cuerpo que el servidor derivó de esas líneas, y el documento ya dijo
        su moneda más arriba. Pasársela sería repetir la unidad en la misma
        pantalla dos veces.
      */}
      <PlanDePagos cotizacionId={cotizacion.id} />

      <Bitacora estado={bitacora} id="bitacora-de-la-cotizacion" />
    </Pila>
  );
}
