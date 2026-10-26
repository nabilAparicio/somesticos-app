/**
 * Los derivados de presentación de los procesos: lo que el listado muestra,
 * calculado una sola vez y probado.
 *
 * Sin DOM y sin React, por la misma razón que `src/ruteo.ts`: son funciones
 * de datos a texto, y adentro de un `.tsx` solo se pueden probar montando un
 * navegador para leer lo que ya era una cadena.
 */

import type {
  PendienteDeProceso,
  Proceso,
} from "../../../worker/contract";
import { ORDEN_ES, fechaLegible, plano } from "../../formatos";
import { resumenDePendientes } from "./pendientes";

/**
 * El avance, en etapas y no en porcentaje.
 *
 * Un «25 %» sobre cuatro pasos suena preciso y no lo es: los pasos no pesan
 * lo mismo, y el plan cambia mientras el proceso corre. «1 de 4» dice lo que
 * se sabe.
 */
export function avanceDe(proceso: Proceso): string {
  if (proceso.etapasTotales === 0) return "Sin plan";

  return `${String(proceso.etapasCumplidas)} de ${String(
    proceso.etapasTotales,
  )}`;
}

/**
 * Lo que viene, que es la mitad del valor de esta pantalla.
 *
 * Los dos finales se distinguen a propósito: un proceso sin plan todavía
 * necesita que alguien le arme los pasos; uno con todo cumplido no. Decir
 * «Sin plan» en los dos casos esconde un trabajo pendiente detrás de algo que
 * parece terminado.
 */
export function proximoPaso(proceso: Proceso): string {
  if (proceso.etapaVigente !== null) return proceso.etapaVigente;
  if (proceso.etapasTotales === 0) return "Sin plan todavía";

  return "Todas las etapas cumplidas";
}

/**
 * Copia ordenada por cliente y después por título: el bufete piensa los
 * procesos por cliente, y dos del mismo cliente quedan juntos. El arreglo que
 * llega no se toca: puede ser estado de React.
 */
export function ordenarProcesos(procesos: readonly Proceso[]): Proceso[] {
  return [...procesos].sort((a, b) => {
    const porCliente = ORDEN_ES.compare(
      a.clienteNombre ?? "",
      b.clienteNombre ?? "",
    );
    return porCliente !== 0 ? porCliente : ORDEN_ES.compare(a.titulo, b.titulo);
  });
}

/**
 * El filtro del listado.
 *
 * Busca también por **la etapa que viene**, que es como alguien recuerda un
 * proceso cuando no se acuerda del título: «el que está en entrevista».
 *
 * Y desde T-15 por **el código de la cotización**, que es la otra forma en
 * que alguien lo recuerda: «los dos que salieron de la 0001». Entra el
 * código y no el identificador por lo mismo que el código es lo que viaja
 * resuelto — nadie escribe un UUID en un buscador.
 */
export function filtrarProcesos(
  procesos: readonly Proceso[],
  consulta: string,
): Proceso[] {
  const buscado = plano(consulta.trim());
  if (buscado === "") return [...procesos];

  return procesos.filter((proceso) => {
    const pajar = plano(
      [
        proceso.titulo,
        proceso.clienteNombre,
        proceso.tipoProcesoNombre,
        proceso.areaNombre,
        proceso.responsableNombre,
        proceso.etapaVigente,
        proceso.cotizacionDeOrigen?.codigo ?? null,
      ]
        .filter((parte): parte is string => parte !== null)
        .join(" "),
    );

    return pajar.includes(buscado);
  });
}

/* ==========================================================================
   T-14 · El estado del proceso

   El esquema lleva `estado` y `cerrado_en` desde T-2; hasta T-14 nada en la
   pantalla los miraba. Lo que vive acá es todo lo que el estado cambia de
   cómo se lee un proceso, escrito como función para que se pueda afirmar
   sin montar un navegador.
   ========================================================================== */

/**
 * Qué procesos muestra el listado.
 *
 * Son tres y no un interruptor de dos, porque «todos» no es «abiertos más
 * cerrados» en la cabeza de nadie: es la opción que se elige cuando se está
 * buscando algo y no se recuerda si ya terminó.
 */
export type FiltroDeEstado = "abiertos" | "cerrados" | "todos";

/**
 * El filtro por estado, **del lado del navegador**.
 *
 * Igual que la búsqueda de esta misma pantalla y que el filtro de clientes:
 * el bufete son dos personas y la cartera entra entera en una respuesta. El
 * servidor sigue entregando todo, a propósito — si escondiera filas, la
 * cuenta de abajo diría «4 de 6» sobre un total que nadie puede comprobar.
 *
 * El arreglo que llega no se toca: puede ser estado de React.
 */
export function filtrarPorEstado(
  procesos: readonly Proceso[],
  filtro: FiltroDeEstado,
): Proceso[] {
  if (filtro === "todos") return [...procesos];

  const buscado = filtro === "abiertos" ? "abierto" : "cerrado";
  return procesos.filter((proceso) => proceso.estado === buscado);
}

/**
 * Lo que el filtro está dejando afuera, dicho.
 *
 * El listado arranca mostrando solo los abiertos, que es lo que el bufete
 * abre a mirar. Un filtro por defecto que esconde filas **sin decirlo** es
 * la diferencia entre filtrar y perder: quien no sabe que hay un filtro
 * puesto concluye que el proceso no existe.
 *
 * Nombra lo que falta en las dos direcciones y no solo los cerrados: es una
 * regla en vez de dos, y nunca hay que recordar cuál de las opciones era la
 * que callaba.
 */
export function ocultosPorEstado(
  procesos: readonly Proceso[],
  filtro: FiltroDeEstado,
): string | null {
  if (filtro === "todos") return null;

  const escondido = filtro === "abiertos" ? "cerrado" : "abierto";
  const cuantos = procesos.filter(
    (proceso) => proceso.estado === escondido,
  ).length;

  if (cuantos === 0) return null;

  return cuantos === 1
    ? `Hay 1 proceso ${escondido} que no se está mostrando.`
    : `Hay ${String(cuantos)} procesos ${escondido}s que no se están mostrando.`;
}

/**
 * El estado del proceso, con su fecha cuando la hay.
 *
 * **Un proceso cerrado sin fecha no se rellena.** Por la API no puede pasar
 * —`cerrar` escribe las dos cosas juntas—, pero el dato llega del cable y
 * fabricarle un día sería firmar un cierre que nadie firmó. Se dice lo que
 * se sabe: «Cerrado», a secas.
 */
export function estadoLegible(proceso: Proceso): string {
  if (proceso.estado === "abierto") return "Abierto";
  if (proceso.cerradoEn === null) return "Cerrado";

  return `Cerrado el ${fechaLegible(proceso.cerradoEn)}`;
}

/**
 * La regla del proceso cerrado, dicha antes de que alguien la descubra
 * apretando un botón apagado.
 *
 * Nombra **las tres prohibiciones y las dos salidas**. Un aviso que solo
 * prohíbe es una pared, y el criterio de este proyecto —el mismo que T-6
 * fijó para el 409 de los catálogos y T-9 para el pendiente que no se
 * reabre— es que ninguna negativa se quede sin puerta.
 */
export function avisoDeProcesoCerrado(proceso: Proceso): string | null {
  if (proceso.estado === "abierto") return null;

  return (
    "Este proceso está cerrado: no avanza de etapa, no se le edita el plan" +
    " y no se le anotan pendientes nuevos. Lo que sí se puede es escribir" +
    " una nota —la historia no se congela porque el trámite terminó— y" +
    " cerrar los cabos sueltos que hayan quedado. Si apareció trabajo de" +
    " verdad, hay que reabrirlo, y queda registrado quién lo hizo."
  );
}

/**
 * La cuenta de la cabecera, leída a la luz del estado del proceso.
 *
 * `resumenDePendientes` sabe contar una lista de cabos sueltos; lo que el
 * estado del proceso cambia es **qué significa ese número**, y eso es un
 * derivado del proceso. Por eso vive acá y delega allá en vez de copiar la
 * cuenta: una segunda definición de «cuántos hay» es la que se desincroniza.
 *
 * Con el proceso cerrado el número **deja de contarse como trabajo
 * vigente**: la cabecera es «lo que obliga a mirar hoy», y un trámite
 * terminado no obliga a nada. Se apaga también la marca de vencido, por la
 * misma razón por la que `estaVencido` nunca marca un pendiente ya cerrado —
 * rojo sobre algo que nadie va a perseguir es ruido.
 *
 * **Pero no se esconde cuántos quedaron.** No alarmar y no mostrar son dos
 * cosas distintas: los cabos sueltos de un caso terminado son justamente lo
 * que alguien va a querer ver cuando el cliente vuelva a llamar.
 */
export function resumenDeTrabajoVigente(
  proceso: Proceso,
  abiertos: readonly PendienteDeProceso[],
  hoy: string,
): string {
  if (proceso.estado === "abierto") return resumenDePendientes(abiertos, hoy);

  if (abiertos.length === 0) {
    return "El proceso está cerrado y no quedó ningún cabo suelto.";
  }

  return abiertos.length === 1
    ? "El proceso está cerrado. Quedó 1 pendiente sin cerrar."
    : `El proceso está cerrado. Quedaron ${String(
        abiertos.length,
      )} pendientes sin cerrar.`;
}

/**
 * Lo que se dice justo después de cerrar (T-14).
 *
 * El número va en la frase y no en una advertencia roja aparte: el cierre
 * con cabos sueltos **salió bien**, y es una decisión legítima del bufete.
 * Lo único que el sistema aporta es que no pase inadvertido.
 *
 * Vive acá desde que la cabecera se separó del cuerpo: era una función de
 * datos a texto enterrada en un `.tsx`, donde solo se podía afirmar
 * montando un navegador para leer lo que ya era una cadena.
 */
export function textoDelCierre(pendientesAbiertos: number): string {
  if (pendientesAbiertos === 0) {
    return "El proceso quedó cerrado, y no había ningún pendiente abierto.";
  }

  const cuantos =
    pendientesAbiertos === 1
      ? "1 pendiente sin cerrar"
      : `${String(pendientesAbiertos)} pendientes sin cerrar`;

  return (
    `El proceso quedó cerrado con ${cuantos}. Siguen listados en la pestaña` +
    " de pendientes y se pueden cerrar; lo que ya no se puede es anotar uno" +
    " nuevo."
  );
}

/* ==========================================================================
   T-15 · De dónde viene cada proceso

   `Proceso.cotizacionDeOrigen` llega del cable ya resuelto: la cotización
   que abrió este proceso, con su código al lado. Lo que vive acá es qué
   dice la pantalla con eso.

   **Las tres funciones leen ese campo y ninguna lee `origen`.** El contrato
   garantiza que dicen lo mismo —el `CHECK` de `0008` no admite una fila
   donde discrepen—, y justamente por eso mirar los dos sería tener dos
   guardas para el mismo hecho: quitar cualquiera de las dos no rompería
   nada, y ninguna quedaría verificada. Se mira la que además trae la
   dirección que el enlace necesita.
   ========================================================================== */

/**
 * El distintivo del listado: de qué cotización sale esta fila.
 *
 * Es corto a propósito. Va al lado del título, dentro de una celda que ya
 * compite con el cliente, el tipo, el avance y lo que viene; una frase
 * entera ahí empujaría la tabla y haría desaparecer justamente la columna
 * que justifica la pantalla.
 *
 * El nulo **no es** «no se pudo resolver»: es que el proceso lo abrió una
 * persona y no hay ninguna cotización detrás. Por eso la fila directa no
 * lleva un distintivo apagado que diga «sin cotización» — eso sería gastar
 * ancho en informar de una ausencia que es el caso corriente.
 */
export function etiquetaDeOrigen(proceso: Proceso): string | null {
  const origen = proceso.cotizacionDeOrigen;
  return origen === null ? null : `De ${origen.codigo}`;
}

/**
 * La misma procedencia, dicha entera en el detalle.
 *
 * Es un texto aparte del distintivo y no el mismo con otro envoltorio: en
 * el detalle hay lugar para una oración, y la oración es la que explica de
 * dónde salió un proceso que nadie recuerda haber abierto a mano.
 *
 * **Este nulo es el que decide que no haya botón.** Un proceso directo no
 * tiene cotización, así que un «Ver la cotización» ahí prometería una
 * pantalla que el servidor contestaría con un 404 — y no se dibuja apagado,
 * porque un control apagado sigue siendo la promesa de que existe algo
 * detrás. Es la lección de la unidad B de T-2, la misma que gobierna
 * `accionesDe` en `cotizaciones/ciclo.ts`.
 */
export function textoDeOrigen(proceso: Proceso): string | null {
  const origen = proceso.cotizacionDeOrigen;
  if (origen === null) return null;

  return `Este proceso nace de la cotización «${origen.codigo}».`;
}

/** El rótulo del enlace que sube del proceso a su cotización. */
export const ROTULO_DE_LA_COTIZACION = "Ver la cotización";

/**
 * Los procesos que abrió una cotización, sacados del listado completo.
 *
 * El filtro es **del lado del navegador**, igual que la búsqueda y el filtro
 * por estado de esta misma pantalla: el servidor entrega la cartera entera
 * en una respuesta y el bufete son dos personas. Es lo que evita una ruta
 * nueva, una consulta nueva y un segundo lugar donde se decida qué procesos
 * cuelgan de qué cotización.
 *
 * Compara por **identificador y no por código**: el código es texto de cara
 * a una persona y lo que ata las dos filas es la llave.
 *
 * El arreglo que llega no se toca: puede ser estado de React.
 */
export function procesosDeCotizacion(
  procesos: readonly Proceso[],
  cotizacionId: string,
): Proceso[] {
  return procesos.filter(
    (proceso) => proceso.cotizacionDeOrigen?.id === cotizacionId,
  );
}
