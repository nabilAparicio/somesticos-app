/**
 * Lo que el tablero de Inicio decide sin React: cómo se agrupan los
 * pendientes, qué se dice de cada cotización y la geometría de los dos
 * gráficos. Lo prueba `test/inicio-ui.spec.ts`.
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
  CuentaPorEstado,
  EstadoDeCotizacion,
  MesDelInicio,
  PendienteDelInicio,
} from "../../../worker/contract";
import { VACIO, diaLegible } from "../../formatos";
import { enlaceDe } from "../../ruteo";
import { estadoLegible } from "../cotizaciones/presentacion";

/** Los cuatro estados en el orden del ciclo de vida. El de toda leyenda. */
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
  ["ene", "enero"],
  ["feb", "febrero"],
  ["mar", "marzo"],
  ["abr", "abril"],
  ["may", "mayo"],
  ["jun", "junio"],
  ["jul", "julio"],
  ["ago", "agosto"],
  ["sep", "septiembre"],
  ["oct", "octubre"],
  ["nov", "noviembre"],
  ["dic", "diciembre"],
] as const;

function partesDe(mes: string): { anio: string; nombres: readonly string[] } {
  const [anio, numero] = mes.split("-");
  return { anio, nombres: MESES[Number(numero) - 1] ?? [mes, mes] };
}

/**
 * El mes del eje: tres letras. Escritas a mano y no con `Intl`, porque
 * según el motor `Intl` dice «oct» o «oct.», y el eje no puede cambiar de
 * ortografía entre un navegador y otro.
 */
export function mesCorto(mes: string): string {
  return partesDe(mes).nombres[0];
}

export function mesLargo(mes: string): string {
  const { anio, nombres } = partesDe(mes);
  return `${nombres[1]} de ${anio}`;
}

// --- Geometría de los gráficos ---------------------------------------------

/**
 * Las marcas del eje: de cero a un tope redondo, con paso 1, 2 o 5 por una
 * potencia de diez, y no más de cinco intervalos. Sin datos el eje va de 0
 * a 1: un eje de 0 a 0 no tiene dónde dibujar nada.
 */
export function marcasDelEje(maximo: number): number[] {
  const tope = Math.max(1, maximo);
  let paso = 1;
  for (let potencia = 1; ; potencia *= 10) {
    const elegido = [1, 2, 5]
      .map((m) => m * potencia)
      .find((candidato) => Math.ceil(tope / candidato) <= 5);
    if (elegido !== undefined) {
      paso = elegido;
      break;
    }
  }
  const intervalos = Math.ceil(tope / paso);
  return Array.from({ length: intervalos + 1 }, (_, i) => i * paso);
}

export interface Lienzo {
  ancho: number;
  alto: number;
}

export interface BarraDeLaSerie {
  mes: string;
  estado: EstadoDeCotizacion;
  valor: number;
  x: number;
  y: number;
  ancho: number;
  alto: number;
}

/** El tope de grosor de una barra: nunca llena su hueco. */
const GROSOR_MAXIMO = 24;
/** El hueco de superficie entre barras vecinas del mismo mes. */
const SEPARACION = 2;

/**
 * Columnas agrupadas: un grupo por mes y, dentro, una barra por estado en
 * el orden de `ESTADOS`. Agrupadas y no apiladas porque los cuatro números
 * son de naturaleza distinta —un borrador abierto y una cotización ganada
 * no se suman— y apilarlos dibujaría un total que no significa nada.
 *
 * Las coordenadas son las del área de trazado: `y` crece hacia abajo y la
 * línea base es `lienzo.alto`.
 */
export function barrasDeLaSerie(
  serie: readonly MesDelInicio[],
  lienzo: Lienzo,
): BarraDeLaSerie[] {
  if (serie.length === 0) return [];

  const maximo = Math.max(0, ...serie.flatMap((m) => ESTADOS.map((e) => m[e])));
  const marcas = marcasDelEje(maximo);
  const tope = marcas[marcas.length - 1];

  const hueco = lienzo.ancho / serie.length;
  // Un tercio del hueco queda de aire entre meses.
  const grosor = Math.min(
    GROSOR_MAXIMO,
    (hueco * (2 / 3) - SEPARACION * (ESTADOS.length - 1)) / ESTADOS.length,
  );
  const anchoDelGrupo =
    grosor * ESTADOS.length + SEPARACION * (ESTADOS.length - 1);

  return serie.flatMap((mes, i) => {
    const inicio = i * hueco + (hueco - anchoDelGrupo) / 2;
    return ESTADOS.map((estado, j) => {
      const valor = mes[estado];
      const alto = (valor / tope) * lienzo.alto;
      return {
        mes: mes.mes,
        estado,
        valor,
        x: inicio + j * (grosor + SEPARACION),
        y: lienzo.alto - alto,
        ancho: grosor,
        alto,
      };
    });
  });
}

export interface BarraDeLaDistribucion {
  estado: EstadoDeCotizacion;
  valor: number;
  largo: number;
}

/**
 * Barras horizontales, una por estado. La más larga llena `ancho`; sin
 * ninguna cotización todas miden cero en vez de dividir por cero.
 */
export function barrasDeLaDistribucion(
  cuenta: CuentaPorEstado,
  ancho: number,
): BarraDeLaDistribucion[] {
  const maximo = Math.max(...ESTADOS.map((e) => cuenta[e]));
  return ESTADOS.map((estado) => ({
    estado,
    valor: cuenta[estado],
    largo: maximo === 0 ? 0 : (cuenta[estado] / maximo) * ancho,
  }));
}

export function descripcionDeLaSerie(serie: readonly MesDelInicio[]): string {
  if (serie.length === 0) return "Cotizaciones por estado: sin meses.";
  return (
    `Cotizaciones por estado de ${mesLargo(serie[0].mes)}` +
    ` a ${mesLargo(serie[serie.length - 1].mes)}.`
  );
}

export function descripcionDeLaDistribucion(cuenta: CuentaPorEstado): string {
  const partes = ESTADOS.map(
    (estado) => `${etiquetaDeEstado(estado)} ${String(cuenta[estado])}`,
  );
  return `Cotizaciones por estado hoy: ${partes.join(", ")}.`;
}
