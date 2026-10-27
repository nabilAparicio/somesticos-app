/**
 * Lo que el tablero de Inicio decide sin React: cómo se agrupan los
 * pendientes, qué se dice de cada cotización y cómo se nombran los números
 * del mes. Lo prueba `test/inicio-ui.spec.ts`.
 *
 * ## «Hoy» es el de Panamá, y lo pone el servidor
 *
 * La respuesta trae `hoy` (`hoyEnPanama` en el Worker) y todo se compara
 * contra ese día. Es la misma convención de `estaVencido` en los pendientes
 * de un proceso: días `AAAA-MM-DD`, que ordenan alfabéticamente igual que
 * cronológicamente, y vencer «el 22» quiere decir que el 22 todavía cuenta.
 * Usar el `hoy` de la respuesta en vez de leer el reloj acá es lo que hace
 * que la pantalla y los números del servidor hablen del mismo día.
 */

import type {
  Cotizacion,
  CotizacionDelInicio,
  EstadoDeCotizacion,
  PendienteDelInicio,
} from "../../../worker/contract";
import { VACIO, diaLegible } from "../../formatos";
import { enlaceDe } from "../../ruteo";
import { estadoLegible } from "../cotizaciones/presentacion";

/** Los cuatro estados en el orden del ciclo de vida. El de los indicadores. */
export const ESTADOS = [
  "borrador",
  "emitida",
  "ganada",
  "perdida",
] as const satisfies readonly EstadoDeCotizacion[];

/**
 * La etiqueta de un estado, **la misma de la pantalla de cotizaciones**.
 * `estadoLegible` recibe una cotización entera y solo lee `estado`; acá no
 * hay cotización, hay un estado, y se le pasa eso.
 */
export function etiquetaDeEstado(estado: EstadoDeCotizacion): string {
  return estadoLegible({ estado } as Cotizacion);
}

// --- Pendientes ------------------------------------------------------------

export type ClaveDeGrupo = "vencidos" | "hoy" | "proximos" | "despues";

export interface GrupoDePendientes {
  clave: ClaveDeGrupo;
  titulo: string;
  pendientes: PendienteDelInicio[];
}

const TITULOS: Record<ClaveDeGrupo, string> = {
  vencidos: "Vencidos",
  hoy: "Vencen hoy",
  proximos: "Próximos 7 días",
  despues: "Más adelante o sin fecha",
};

/** El día `AAAA-MM-DD` que cae `dias` después. */
function sumarDias(dia: string, dias: number): string {
  const fecha = new Date(`${dia}T12:00:00.000Z`);
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return fecha.toISOString().slice(0, 10);
}

function grupoDe(venceEn: string | null, hoy: string): ClaveDeGrupo {
  if (venceEn === null) return "despues";
  if (venceEn < hoy) return "vencidos";
  if (venceEn === hoy) return "hoy";
  return venceEn <= sumarDias(hoy, 7) ? "proximos" : "despues";
}

/**
 * Vencidos, hoy, los próximos siete días, y **lo que queda después**.
 *
 * El cuarto grupo no es decoración: un pendiente sin fecha o con fecha
 * lejana sigue siendo mío y sigue abierto, y un tablero que lo esconde
 * porque no urge es un tablero que se calla. Los grupos vacíos no se
 * devuelven. El orden dentro de cada grupo es el del servidor.
 */
export function agruparPendientes(
  pendientes: readonly PendienteDelInicio[],
  hoy: string,
): GrupoDePendientes[] {
  const claves: ClaveDeGrupo[] = ["vencidos", "hoy", "proximos", "despues"];
  return claves.flatMap((clave) => {
    const suyos = pendientes.filter((p) => grupoDe(p.venceEn, hoy) === clave);
    return suyos.length === 0
      ? []
      : [{ clave, titulo: TITULOS[clave], pendientes: suyos }];
  });
}

export function enlaceDePendiente(pendiente: PendienteDelInicio): string {
  return enlaceDe({
    nombre: "proceso",
    id: pendiente.procesoId,
    pestana: "pendientes",
  });
}

// --- Cotizaciones por atender ----------------------------------------------

/** Por qué esta cotización está en la lista, dicho en una frase corta. */
export function vencimientoDeCotizacion(
  cotizacion: CotizacionDelInicio,
  hoy: string,
): string {
  if (cotizacion.venceEn === null) {
    return cotizacion.estado === "borrador" ? "Sin emitir" : "No vence";
  }
  if (cotizacion.venceEn < hoy) {
    return `Venció el ${diaLegible(cotizacion.venceEn)}`;
  }
  if (cotizacion.venceEn === hoy) return "Vence hoy";
  return `Vence el ${diaLegible(cotizacion.venceEn)}`;
}

export function enlaceDeCotizacion(cotizacion: CotizacionDelInicio): string {
  return enlaceDe({ nombre: "cotizacion", id: cotizacion.id });
}

// --- Números ---------------------------------------------------------------

/** La tasa de cierre en por ciento entero; nula es un guion, no un 0 %. */
export function tasaLegible(tasa: number | null): string {
  return tasa === null ? VACIO : `${String(Math.round(tasa * 100))} %`;
}

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

/**
 * El mes de los indicadores, «octubre de 2026». Escrito a mano y no con
 * `Intl`, para que no cambie de ortografía entre un navegador y otro.
 */
export function mesLargo(mes: string): string {
  const [anio, numero] = mes.split("-");
  return `${MESES[Number(numero) - 1] ?? mes} de ${anio}`;
}
