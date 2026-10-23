/**
 * Las reglas de qué es una nota aceptable. Puras: ni D1 ni HTTP.
 *
 * Acá vive solo lo que se puede decidir mirando el cuerpo de la petición:
 * que el texto diga algo, y que la etapa —si vino— sea texto. Lo que exige
 * consultar la base —que esa etapa sea de este proceso, cuál es la vigente—
 * vive en el repositorio, que es quien sabe de filas.
 *
 * **Autor y momento no se leen del cuerpo.** Los pone el servidor con la
 * identidad de Access y el reloj. Leerlos sería dejar firmar a nombre de
 * otro y fechar un hecho cuando convenga, sobre una fila que después no se
 * puede corregir: una nota es inmutable por disparador desde T-2.
 */

import type {
  DatosDeNota,
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
 * El texto de la nota.
 *
 * Se recortan **los bordes y nada más**: adentro los saltos de línea son del
 * autor. Una nota se escribe con viñetas y renglones y así se tiene que
 * leer después (`.nota__texto` la dibuja con `white-space: pre-wrap`).
 */
export function normalizarNota(cuerpo: unknown): Normalizacion<DatosDeNota> {
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

  // La etapa es opcional: sin ella, el repositorio ancla en la vigente.
  const etapa = cuerpo.procesoEtapaId;
  let procesoEtapaId: string | null = null;
  if (etapa !== undefined && etapa !== null) {
    if (typeof etapa !== "string") {
      fallas.push(falla("procesoEtapaId", "tipo_invalido"));
    } else {
      const limpio = etapa.trim();
      procesoEtapaId = limpio === "" ? null : limpio;
    }
  }

  if (fallas.length > 0) return { ok: false, fallas };

  return { ok: true, datos: { texto, procesoEtapaId } };
}
