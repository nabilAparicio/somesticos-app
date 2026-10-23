/**
 * Las reglas de qué es un pendiente aceptable. Puras: ni D1 ni HTTP.
 *
 * Acá vive solo lo que se puede decidir mirando el cuerpo de la petición:
 * que el texto diga algo y que el vencimiento sea un día que exista. Lo que
 * exige consultar la base —que el responsable sea del bufete, cuál es la
 * etapa vigente— vive en el repositorio, que es quien sabe de filas.
 *
 * **Autor, momento y etapa no se leen del cuerpo.** Los pone el servidor con
 * la identidad de Access, el reloj y el plan. Leer el autor sería dejar
 * firmar a nombre de otro (I-6); leer la etapa sería dejar afirmar que el
 * cabo suelto apareció antes de que nadie lo viera.
 */

import type {
  DatosDePendiente,
  FallaDeValidacion,
  MotivoDeFalla,
} from "../contract";

export type Normalizacion<T> =
  | { ok: true; datos: T }
  | { ok: false; fallas: FallaDeValidacion[] };

function falla(campo: string, motivo: MotivoDeFalla): FallaDeValidacion {
  return { campo, motivo };
}

function esObjeto(cuerpo: unknown): cuerpo is Record<string, unknown> {
  return typeof cuerpo === "object" && cuerpo !== null && !Array.isArray(cuerpo);
}

/**
 * Un día del calendario, en la forma `AAAA-MM-DD`.
 *
 * Se comprueba la forma **y que el día exista**: `2026-02-31` pasa cualquier
 * expresión regular y no es ningún día. `Date` lo normalizaría a marzo sin
 * decir nada, así que la comprobación es el viaje de ida y vuelta — si lo
 * que sale no es lo que entró, el día no existía.
 *
 * Esta función se repite, declarada, en `src/pantallas/procesos/pendientes.ts`:
 * la que manda es ésta, y la de allá avisa antes de mandar.
 */
export function esDiaValido(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;

  const momento = new Date(`${valor}T00:00:00.000Z`);
  if (Number.isNaN(momento.getTime())) return false;

  return momento.toISOString().slice(0, 10) === valor;
}

/**
 * El texto, el responsable y el vencimiento de un pendiente.
 *
 * Del texto se recortan **los bordes y nada más**: adentro los saltos de
 * línea son de quien escribe, igual que en una nota. Un pendiente se anota
 * con viñetas —«falta: el apostillado, la traducción»— y así se tiene que
 * leer después.
 */
export function normalizarPendiente(
  cuerpo: unknown,
): Normalizacion<DatosDePendiente> {
  if (!esObjeto(cuerpo)) {
    return { ok: false, fallas: [falla("texto", "tipo_invalido")] };
  }

  const fallas: FallaDeValidacion[] = [];

  const crudo = cuerpo.texto;
  let texto = "";
  if (crudo === undefined || crudo === null) {
    fallas.push(falla("texto", "texto_requerido"));
  } else if (typeof crudo !== "string") {
    fallas.push(falla("texto", "tipo_invalido"));
  } else {
    texto = crudo.trim();
    if (texto === "") fallas.push(falla("texto", "texto_requerido"));
  }

  // El responsable es opcional: el esquema lo deja nulo y §5 no lo lista
  // como invariante. Exigirlo acá sería una regla sin respaldo en la base,
  // que es justo lo que `docs/diseno.md` §5 critica. Lo que sí se hace es
  // mostrarlo distinto: un pendiente que nadie tiene es el que se pierde.
  const quien = cuerpo.responsableId;
  let responsableId: string | null = null;
  if (quien !== undefined && quien !== null) {
    if (typeof quien !== "string") {
      fallas.push(falla("responsableId", "tipo_invalido"));
    } else {
      const limpio = quien.trim();
      responsableId = limpio === "" ? null : limpio;
    }
  }

  const fecha = cuerpo.venceEn;
  let venceEn: string | null = null;
  if (fecha !== undefined && fecha !== null) {
    if (typeof fecha !== "string") {
      fallas.push(falla("venceEn", "tipo_invalido"));
    } else {
      const limpio = fecha.trim();
      if (limpio === "") {
        venceEn = null;
      } else if (!esDiaValido(limpio)) {
        fallas.push(falla("venceEn", "vencimiento_invalido"));
      } else {
        venceEn = limpio;
      }
    }
  }

  if (fallas.length > 0) return { ok: false, fallas };

  return { ok: true, datos: { texto, responsableId, venceEn } };
}
