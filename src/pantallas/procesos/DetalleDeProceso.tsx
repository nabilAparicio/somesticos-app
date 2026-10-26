/**
 * El detalle de un proceso: la cabecera fija, la tira de pestañas y el
 * panel de la que esté abierta.
 *
 * Esta pantalla es el corazón del CRM, y hasta esta tajada era **una sola
 * lista de trece secciones**: pendientes, estado, cumplido, lo que falta,
 * plan, guardar como plantilla, anotar un pendiente, cerrados, gastos,
 * línea de tiempo, bitácora y anotar. Las palabras del usuario, que son el
 * criterio: «ahorita es difícil ver y configurar porque todo es como una
 * gran lista grande».
 *
 * La forma que salió de ahí **no** es «pestañas para todo», y la razón es
 * una restricción que no se negocia: «los pendientes abiertos viven arriba
 * del proceso, contados y a la vista» (`docs/diseno.md` §6). De ahí que
 * esto sea una **cabecera fija más pestañas para el cuerpo**: el contador
 * de cabos sueltos y la etapa vigente nunca quedan detrás de un clic.
 *
 * ## Qué quedó acá y por qué
 *
 * Este archivo es el **armador**: carga los datos, dibuja la cabecera y la
 * navegación, y despacha al panel. Las cuatro pestañas viven en
 * `PanelDeTrabajo`, `PanelDePendientes`, `PanelDeGastos` y
 * `PanelDeHistorial`, y lo que no es React vive en los `.ts` puros de al
 * lado (`plan.ts`, `pendientes.ts`, `notas.ts`, `plantilla.ts`,
 * `presentacion.ts`, `pestanas.ts`).
 *
 * ## Todo el estado vive acá, y eso es una decisión, no una omisión
 *
 * La regla sana es que el estado viva donde está el dato y no donde está
 * el botón. Aplicada a esta pantalla da un resultado claro:
 *
 *  - **Lo que se carga del servidor** —el proceso, el plan, los
 *    pendientes, el equipo, la línea de tiempo, la bitácora— es dato del
 *    proceso, no de la pestaña. La cabecera cuenta los pendientes, así que
 *    ni siquiera son de un panel solo.
 *  - **Lo que una persona escribió y todavía no se guardó** —el borrador
 *    del plan, el paso que se está tecleando, el pendiente a medio
 *    redactar, la nota, el destino de la plantilla— también es del
 *    proceso. El criterio de T-8 y T-9 es que un borrador se vacía **solo
 *    si el servidor lo guardó**, porque perder el texto por un 403 sería
 *    perderlo de verdad; un clic en otra pestaña no puede ser la excepción
 *    a esa regla.
 *
 * Con eso, ningún panel tiene estado propio: son presentación con
 * propiedades, y lo que un panel necesita avisarle a otro —que el plan
 * avanzó y hay que recontar los pendientes— es una devolución explícita a
 * una función de acá, no un estado global.
 *
 * ## La carga sigue siendo una sola, en paralelo
 *
 * Nada se pide por pestaña. La cabecera necesita los pendientes igual, y
 * cargar al cambiar de pestaña pondría un «Consultando…» en cada clic para
 * ahorrar lecturas que ya viajan juntas. El día que se mida lento se
 * revisa; hoy no hay medición que lo pida. Lo que lo sostiene del lado de
 * `App` es que la `key` de este componente es el identificador y **no** la
 * pestaña: cambiar de pestaña no vuelve a montar nada.
 */
import { useEffect, useState } from "react";

import type {
  Area,
  DetalleDeProceso as Detalle,
  FallaDeValidacion,
  PendienteDeProceso,
  TramoDeLineaDeTiempo,
  Usuario,
} from "../../../worker/contract";
import { Aviso } from "../../layout/Aviso";
import { Enlace } from "../../layout/Enlace";
import { Pila } from "../../layout/Pila";
import { enlaceDe, type PestanaDeProceso } from "../../ruteo";
import { cargarUsuarios } from "../../api/usuarios";
import { cargarAreas } from "../catalogos/api";
import type { EstadoDeBitacora } from "../Bitacora";
import { CabeceraDeProceso } from "./CabeceraDeProceso";
import { PanelDeGastos } from "./PanelDeGastos";
import { PanelDeHistorial } from "./PanelDeHistorial";
import { PanelDePendientes } from "./PanelDePendientes";
import { PanelDeTrabajo } from "./PanelDeTrabajo";
import { PESTANAS_DEL_PROCESO } from "./pestanas";
import {
  anotar,
  anotarPendiente,
  avanzarEtapa,
  cargarBitacoraDeProceso,
  cargarLineaDeTiempo,
  cargarPendientes,
  cargarProceso,
  cerrarPendiente,
  cerrarProceso,
  guardarComoPlantilla,
  guardarPlan,
  reabrirProceso,
  textoDeProblema,
} from "./api";
import {
  BORRADOR_DE_PENDIENTE_VACIO,
  aPeticionDePendiente,
  hoyEnPanama,
  separarPendientes,
  validarPendiente,
  type BorradorDePendiente,
} from "./pendientes";
import {
  BORRADOR_DE_NOTA_VACIO,
  aPeticionDeNota,
  validarNota,
  type BorradorDeNota,
} from "./notas";
import {
  BORRADOR_DE_GUARDADO_VACIO,
  aPeticionDeGuardado,
  validarGuardado,
  type BorradorDeGuardado,
} from "./plantilla";
import { aPeticionDePlan, planDe, validarPlan, type PasoDelPlan } from "./plan";
import { textoDelCierre } from "./presentacion";

type Props = {
  readonly id: string;
  readonly pestana: PestanaDeProceso;
};

type Estado =
  | { fase: "cargando" }
  | { fase: "listo"; detalle: Detalle }
  | { fase: "problema"; mensaje: string };

export function DetalleDeProceso({ id, pestana }: Props) {
  const [estado, setEstado] = useState<Estado>({ fase: "cargando" });
  const [plan, setPlan] = useState<PasoDelPlan[]>([]);
  const [pasoNuevo, setPasoNuevo] = useState("");
  const [fallas, setFallas] = useState<FallaDeValidacion[]>([]);
  const [avisoDelPlan, setAvisoDelPlan] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  /* --- T-11: guardar el plan como plantilla ---------------------------- */
  const [guardado, setGuardado] = useState<BorradorDeGuardado>(
    BORRADOR_DE_GUARDADO_VACIO,
  );
  const [areas, setAreas] = useState<Area[]>([]);
  const [fallasDelGuardado, setFallasDelGuardado] = useState<
    FallaDeValidacion[]
  >([]);
  const [avisoDelGuardado, setAvisoDelGuardado] = useState<
    { tono: "neutro" | "error"; texto: string } | null
  >(null);

  /* --- T-8: las notas y su línea de tiempo ----------------------------- */
  const [tramos, setTramos] = useState<TramoDeLineaDeTiempo[]>([]);
  const [nota, setNota] = useState<BorradorDeNota>(BORRADOR_DE_NOTA_VACIO);
  const [fallasDeLaNota, setFallasDeLaNota] = useState<FallaDeValidacion[]>(
    [],
  );
  const [avisoDeLaNota, setAvisoDeLaNota] = useState<string | null>(null);

  /* --- T-9: los pendientes --------------------------------------------- */
  const [pendientes, setPendientes] = useState<PendienteDeProceso[]>([]);
  const [equipo, setEquipo] = useState<Usuario[]>([]);
  const [pendiente, setPendiente] = useState<BorradorDePendiente>(
    BORRADOR_DE_PENDIENTE_VACIO,
  );
  const [fallasDelPendiente, setFallasDelPendiente] = useState<
    FallaDeValidacion[]
  >([]);
  const [avisoDelPendiente, setAvisoDelPendiente] = useState<string | null>(
    null,
  );
  /* --- T-14: cerrar y reabrir ------------------------------------------ */
  /**
   * Lo que el último cambio de estado dejó dicho.
   *
   * Vive aparte de `avisoDelPlan` porque no es un error: el cierre que
   * informa «quedaron dos pendientes sin cerrar» salió bien, y pintarlo del
   * mismo rojo que un fallo enseñaría a ignorar los dos.
   */
  const [avisoDelEstado, setAvisoDelEstado] = useState<
    { tono: "neutro" | "error"; texto: string } | null
  >(null);

  /**
   * El día de hoy se calcula **una vez al montar** y no en cada dibujo.
   *
   * Es lo que decide qué se ve vencido, y recalcularlo en cada render haría
   * que la pantalla cambiara de estado sola a la medianoche sin que nadie
   * tocara nada. Quien deje la pestaña abierta dos días recarga, que es lo
   * que ya hace para ver cualquier otro cambio.
   */
  const [hoy] = useState(() => hoyEnPanama(new Date()));

  /* -------------------------------------------------------------------
     T-10 · La bitácora.

     Va en su propia petición, como la línea de tiempo y los pendientes, y
     por lo mismo: un fallo acá no puede dejar la pantalla del proceso en
     blanco. Y se vuelve a pedir cada vez que algo se escribe, porque lo
     que la pantalla acaba de hacer es exactamente lo que la bitácora tiene
     que mostrar. El sello es el disparador: lo mueve `registrado()`, que
     se llama en el único lugar donde cada escritura termina bien.

     El sello vive acá y no en la pestaña del historial a propósito: el
     hecho que hay que registrar lo produce casi siempre otra pestaña
     —avanzar una etapa, cerrar un cabo suelto— y un contador que viviera
     dentro del panel que lo lee no se enteraría de nada.
     ------------------------------------------------------------------- */
  const [bitacora, setBitacora] = useState<EstadoDeBitacora>({
    fase: "cargando",
  });
  const [sello, setSello] = useState(0);

  function registrado() {
    setSello((anterior) => anterior + 1);
  }

  useEffect(() => {
    const control = new AbortController();

    void cargarProceso(id, control.signal).then((resultado) => {
      if (control.signal.aborted) return;

      if (resultado.estado !== "ok") {
        setEstado({
          fase: "problema",
          mensaje: textoDeProblema(resultado),
        });
        return;
      }

      setEstado({ fase: "listo", detalle: resultado.valor });
      setPlan(planDe(resultado.valor.etapas));
    });

    return () => {
      control.abort();
    };
  }, [id]);

  /**
   * La línea de tiempo va en su propia petición y no dentro del detalle: el
   * detalle lo pide todo el mundo —el listado navega ahí— y la línea crece
   * sin techo mientras el proceso corre.
   */
  useEffect(() => {
    const control = new AbortController();

    void cargarLineaDeTiempo(id, control.signal).then((resultado) => {
      if (control.signal.aborted) return;
      if (resultado.estado === "ok") setTramos(resultado.valor.tramos);
    });

    return () => {
      control.abort();
    };
  }, [id]);

  /**
   * Los pendientes y el equipo, en su propia petición.
   *
   * Van juntos porque el desplegable de responsable no sirve sin el equipo
   * y el equipo no se usa en ninguna otra parte de esta pantalla. Ninguno
   * de los dos bloquea el detalle: un proceso sin pendientes se lee igual,
   * y si el equipo no llega, la cuenta de la cabecera —que es lo que no se
   * puede perder— se dibuja lo mismo.
   */
  useEffect(() => {
    const control = new AbortController();

    async function cargar() {
      const [lista, personas] = await Promise.all([
        cargarPendientes(id, control.signal),
        cargarUsuarios(control.signal),
      ]);
      if (control.signal.aborted) return;

      if (lista.estado === "ok") setPendientes(lista.valor);
      if (personas.estado === "ok") setEquipo(personas.valor);
    }

    void cargar();

    return () => {
      control.abort();
    };
  }, [id]);

  /**
   * Las áreas solo se piden cuando hacen falta: el destino por defecto
   * —actualizar la plantilla del tipo que el proceso ya tiene— no las usa, y
   * ésa va a ser la mayoría de las veces.
   */
  useEffect(() => {
    if (guardado.destino !== "nuevo") return undefined;

    const control = new AbortController();

    void cargarAreas(control.signal).then((resultado) => {
      if (control.signal.aborted) return;
      if (resultado.estado === "ok") setAreas(resultado.valor);
    });

    return () => {
      control.abort();
    };
  }, [guardado.destino]);

  useEffect(() => {
    const control = new AbortController();

    void cargarBitacoraDeProceso(id, control.signal).then((resultado) => {
      if (control.signal.aborted) return;

      setBitacora(
        resultado.estado === "ok"
          ? { fase: "listo", entradas: resultado.valor }
          : {
              fase: "problema",
              mensaje: textoDeProblema(resultado, "ese proceso"),
            },
      );
    });

    return () => {
      control.abort();
    };
  }, [id, sello]);

  /** Lo que el servidor dejó guardado manda sobre lo que la pantalla creía. */
  function asentar(detalle: Detalle) {
    setEstado({ fase: "listo", detalle });
    setPlan(planDe(detalle.etapas));
    registrado();
  }

  async function guardar() {
    if (trabajando) return;

    const previas = validarPlan(plan);
    setFallas(previas);
    setAvisoDelPlan(null);
    if (previas.length > 0) return;

    setTrabajando(true);
    const resultado = await guardarPlan(id, aPeticionDePlan(plan));
    setTrabajando(false);

    if (resultado.estado === "invalido") {
      setFallas(resultado.fallas);
      return;
    }
    if (resultado.estado !== "ok") {
      setAvisoDelPlan(textoDeProblema(resultado, "ese plan"));
      return;
    }

    asentar(resultado.valor);
  }

  async function avanzar() {
    if (trabajando) return;

    setFallas([]);
    setAvisoDelPlan(null);
    setTrabajando(true);
    const resultado = await avanzarEtapa(id);
    setTrabajando(false);

    if (resultado.estado !== "ok") {
      setAvisoDelPlan(textoDeProblema(resultado, "ese proceso"));
      return;
    }

    asentar(resultado.valor);
  }

  /**
   * Guardar el plan como plantilla.
   *
   * Lo que se copia es **lo que está guardado**, no el borrador que se está
   * editando en pantalla: el servidor lee `proceso_etapa`. Si hay cambios
   * sin guardar, la pantalla lo dice en vez de copiar algo que nadie guardó.
   */
  async function guardarPlantilla(pasos: number) {
    if (trabajando) return;

    const previas = validarGuardado(guardado, pasos);
    setFallasDelGuardado(previas);
    setAvisoDelGuardado(null);
    if (previas.length > 0) return;

    setTrabajando(true);
    const resultado = await guardarComoPlantilla(
      id,
      aPeticionDeGuardado(guardado),
    );
    setTrabajando(false);

    if (resultado.estado === "invalido") {
      setFallasDelGuardado(resultado.fallas);
      return;
    }
    if (resultado.estado !== "ok") {
      setAvisoDelGuardado({
        tono: "error",
        texto: textoDeProblema(resultado, "ese tipo de proceso"),
      });
      return;
    }

    const pasosGuardados = resultado.valor.etapas.length;
    setGuardado(BORRADOR_DE_GUARDADO_VACIO);
    setAvisoDelGuardado({
      tono: "neutro",
      texto:
        `La plantilla quedó guardada en «${resultado.valor.tipo.nombre}»` +
        ` con ${String(pasosGuardados)} pasos. Este proceso y los demás ya` +
        " abiertos siguen con el plan que tenían.",
    });
    registrado();
  }

  /**
   * Anota un hecho.
   *
   * El borrador se vacía **solo si el servidor la guardó**: una nota no se
   * puede volver a escribir desde el historial del navegador, así que perder
   * el texto por un 403 sería perderlo de verdad.
   */
  async function escribirNota(etapas: readonly Detalle["etapas"][number][]) {
    if (trabajando) return;

    const previas = validarNota(nota, etapas);
    setFallasDeLaNota(previas);
    setAvisoDeLaNota(null);
    if (previas.length > 0) return;

    setTrabajando(true);
    const resultado = await anotar(id, aPeticionDeNota(nota));
    setTrabajando(false);

    if (resultado.estado === "invalido") {
      setFallasDeLaNota(resultado.fallas);
      return;
    }
    if (resultado.estado !== "ok") {
      setAvisoDeLaNota(textoDeProblema(resultado));
      return;
    }

    setTramos(resultado.valor.tramos);
    setNota(BORRADOR_DE_NOTA_VACIO);
    registrado();
  }

  /**
   * Anota un cabo suelto.
   *
   * El borrador se vacía **solo si el servidor lo guardó**, por lo mismo que
   * con una nota: perder el texto por un 403 sería perderlo de verdad.
   */
  async function escribirPendiente(
    etapas: readonly Detalle["etapas"][number][],
  ) {
    if (trabajando) return;

    const previas = validarPendiente(pendiente, etapas, equipo);
    setFallasDelPendiente(previas);
    setAvisoDelPendiente(null);
    if (previas.length > 0) return;

    setTrabajando(true);
    const resultado = await anotarPendiente(id, aPeticionDePendiente(pendiente));
    setTrabajando(false);

    if (resultado.estado === "invalido") {
      setFallasDelPendiente(resultado.fallas);
      return;
    }
    if (resultado.estado !== "ok") {
      setAvisoDelPendiente(textoDeProblema(resultado, "ese pendiente"));
      return;
    }

    setPendientes(resultado.valor);
    setPendiente(BORRADOR_DE_PENDIENTE_VACIO);
    registrado();
  }

  /**
   * Cierra un pendiente.
   *
   * **No hay forma de deshacerlo**, y la pantalla lo dice antes con
   * `AVISO_PENDIENTE_NO_SE_REABRE`, no después. El 409 de «ya estaba
   * cerrado» llega acá como un aviso con texto propio y no como «algo salió
   * mal»: es lo que pasa cuando dos personas cierran lo mismo a la vez.
   */
  async function cerrar(pendienteId: string) {
    if (trabajando) return;

    setAvisoDelPendiente(null);
    setTrabajando(true);
    const resultado = await cerrarPendiente(id, pendienteId);
    setTrabajando(false);

    if (resultado.estado !== "ok") {
      setAvisoDelPendiente(textoDeProblema(resultado, "ese pendiente"));
      return;
    }

    setPendientes(resultado.valor);
    registrado();
  }

  /**
   * Cierra o reabre el proceso (T-14).
   *
   * Una función para las dos porque son la misma forma con distinta
   * dirección, y el único lugar donde se separan es el texto del resultado.
   * Dos copias serían dos sitios donde mañana una se olvida de asentar lo
   * que el servidor contestó.
   *
   * **El cierre con cabos sueltos no se discute, se informa.** El servidor
   * contesta 200 con cuántos quedaron, y eso llega acá como un aviso
   * neutro: la decisión del bufete se respeta y el número se dice.
   */
  async function cambiarEstado(hacia: "cerrar" | "reabrir") {
    if (trabajando) return;

    setAvisoDelEstado(null);
    setAvisoDelPlan(null);
    setTrabajando(true);
    const resultado =
      hacia === "cerrar" ? await cerrarProceso(id) : await reabrirProceso(id);
    setTrabajando(false);

    if (resultado.estado !== "ok") {
      setAvisoDelEstado({
        tono: "error",
        texto: textoDeProblema(resultado, "ese proceso"),
      });
      return;
    }

    const { proceso: cambiado, etapas, pendientesAbiertos } = resultado.valor;
    asentar({ proceso: cambiado, etapas });

    setAvisoDelEstado({
      tono: "neutro",
      texto:
        hacia === "cerrar"
          ? textoDelCierre(pendientesAbiertos)
          : "El proceso volvió a estar en curso. El cierre anterior sigue" +
            " en la bitácora, con quién lo cerró y cuándo.",
    });
  }

  if (estado.fase === "cargando") return <p>Consultando…</p>;

  if (estado.fase === "problema") {
    return (
      <Pila>
        <Aviso tono="error">{estado.mensaje}</Aviso>
        <p>
          <Enlace href={enlaceDe({ nombre: "procesos" })}>
            Volver a procesos
          </Enlace>
        </p>
      </Pila>
    );
  }

  const { detalle } = estado;
  const { proceso } = detalle;
  const { abiertos, cerrados } = separarPendientes(pendientes);
  const terminado = proceso.estado === "cerrado";
  /* El borrador tiene cambios sin guardar respecto de lo que está en la base. */
  const sinGuardar =
    JSON.stringify(aPeticionDePlan(plan)) !==
    JSON.stringify(aPeticionDePlan(planDe(detalle.etapas)));

  /**
   * El panel de la pestaña abierta.
   *
   * Es un `switch` sobre la unión y no un mapa de componentes: así el
   * compilador obliga a cubrir las cuatro, y una pestaña nueva no puede
   * quedar dibujando una pantalla en blanco.
   */
  function panel() {
    switch (pestana) {
      case "trabajo":
        return (
          <PanelDeTrabajo
            detalle={detalle}
            trabajando={trabajando}
            plan={plan}
            setPlan={setPlan}
            sinGuardar={sinGuardar}
            fallas={fallas}
            avisoDelPlan={avisoDelPlan}
            pasoNuevo={pasoNuevo}
            setPasoNuevo={setPasoNuevo}
            alAvanzar={() => {
              void avanzar();
            }}
            alGuardar={() => {
              void guardar();
            }}
            guardado={guardado}
            setGuardado={setGuardado}
            areas={areas}
            fallasDelGuardado={fallasDelGuardado}
            avisoDelGuardado={avisoDelGuardado}
            alGuardarPlantilla={() => {
              void guardarPlantilla(detalle.etapas.length);
            }}
          />
        );
      case "pendientes":
        return (
          <PanelDePendientes
            abiertos={abiertos}
            cerrados={cerrados}
            hoy={hoy}
            trabajando={trabajando}
            terminado={terminado}
            equipo={equipo}
            pendiente={pendiente}
            setPendiente={setPendiente}
            fallasDelPendiente={fallasDelPendiente}
            avisoDelPendiente={avisoDelPendiente}
            alCerrar={(pendienteId) => {
              void cerrar(pendienteId);
            }}
            alAnotar={() => {
              void escribirPendiente(detalle.etapas);
            }}
          />
        );
      case "dinero":
        /* T-10 · Los gastos reales y su saldo.
           **Cuelgan del proceso y no de la cotización**, y eso no es
           maquetado: el gasto tiene dos vidas en dos lugares
           (`docs/diseno.md` §6). El estimado vive congelado en la
           cotización; el real aparece meses después, acá, con su
           comprobante.

           Su `<h2>Gastos y anticipos</h2>` se conserva aunque la pestaña ya
           se llame «Dinero», y no es un descuido: son dos textos distintos
           —«Dinero» es el cajón, «Gastos y anticipos» es lo que hay
           adentro—, el encabezado es el nombre accesible de la sección y el
           ancla de su `aria-labelledby`, y los `<h3>` de saldo y
           movimientos cuelgan de él. Quitarlo dejaría la región sin nombre
           y ataría un componente propio al contenedor que hoy le toca. */
        return <PanelDeGastos procesoId={id} />;
      case "historial":
        return (
          <PanelDeHistorial
            etapas={detalle.etapas}
            tramos={tramos}
            bitacora={bitacora}
            trabajando={trabajando}
            nota={nota}
            setNota={setNota}
            fallasDeLaNota={fallasDeLaNota}
            avisoDeLaNota={avisoDeLaNota}
            alAnotar={() => {
              void escribirNota(detalle.etapas);
            }}
          />
        );
    }
  }

  return (
    <Pila espacio="holgado">
      <CabeceraDeProceso
        proceso={proceso}
        abiertos={abiertos}
        hoy={hoy}
        trabajando={trabajando}
        avisoDelEstado={avisoDelEstado}
        alCambiarEstado={(hacia) => {
          void cambiarEstado(hacia);
        }}
      />

      {/* ---------------------------------------------------------------
          La tira de pestañas: enlaces de verdad, no el patrón `tablist`.

          Cada pestaña es **una dirección**, con su entrada en el historial
          y su botón de atrás. `role="tablist"` le prometería a un lector de
          pantalla que el contenido cambia en la misma página y que las
          flechas recorren las pestañas, y las dos cosas serían mentira.
          Lo que esto es, de verdad, es una navegación.
          --------------------------------------------------------------- */}
      <nav className="pestanas" aria-label="Partes del proceso">
        <ul className="pestanas__lista sin-viñetas">
          {PESTANAS_DEL_PROCESO.map((entrada) => (
            <li key={entrada.clave}>
              <Enlace
                className="pestanas__item"
                href={enlaceDe({
                  nombre: "proceso",
                  id,
                  pestana: entrada.clave,
                })}
                ariaCurrent={entrada.clave === pestana ? "page" : undefined}
              >
                {entrada.rotulo}
              </Enlace>
            </li>
          ))}
        </ul>
      </nav>

      {panel()}
    </Pila>
  );
}
