/**
 * Las reglas de qué es una fila de catálogo aceptable. Puras: ni D1 ni HTTP.
 *
 * Los cuatro catálogos de T-6 comparten casi todo, y lo que los separa es
 * poco: un `area` y un `tipo_cliente` son un nombre y una marca de vigencia;
 * un `tipo_proceso` agrega el área de la que cuelga y una descripción; una
 * `etapa_plantilla` es un nombre dentro de una lista ordenada.
 *
 * La única regla de contenido es que **el nombre signifique algo**. No se
 * exige que sea único: el esquema no lo respalda con un índice, y una regla
 * que solo vive en el código es la que el primer script de importación se
 * salta (`docs/diseno.md` §5). Si algún día hace falta, es una migración, no
 * un `if`.
 *
 * Lo que sí se valida contra la base —que el área exista en este tenant, que
 * una etapa pertenezca a esta plantilla— no puede vivir acá, porque exige
 * consultar. Vive en el repositorio, que es quien sabe de filas.
 */

import type {
  DatosDeCatalogo,
  DatosDeEtapa,
  DatosDeTipoProceso,
  FallaDeValidacion,
  MotivoDeFalla,
} from "../contract";

export type Normalizacion<T> =
  | { ok: true; datos: T }
  | { ok: false; fallas: FallaDeValidacion[] };

function falla(campo: string, motivo: MotivoDeFalla): FallaDeValidacion {
  return { campo, motivo };
}

/** Texto recortado, o `null` si no quedó nada. Nunca cadena vacía. */
function recortar(valor: string): string | null {
  const limpio = valor.trim();
  return limpio === "" ? null : limpio;
}

function esObjeto(cuerpo: unknown): cuerpo is Record<string, unknown> {
  return typeof cuerpo === "object" && cuerpo !== null && !Array.isArray(cuerpo);
}

/**
 * Un campo de texto opcional del cuerpo.
 *
 * `undefined` y `null` son «no vino»; cualquier otra cosa que no sea texto es
 * una falla, no un `String(valor)` silencioso.
 */
function texto(
  crudo: Record<string, unknown>,
  campo: string,
  fallas: FallaDeValidacion[],
): string | null {
  const valor = crudo[campo];
  if (valor === undefined || valor === null) return null;
  if (typeof valor !== "string") {
    fallas.push(falla(campo, "tipo_invalido"));
    return null;
  }
  return recortar(valor);
}

/**
 * La marca de vigencia.
 *
 * Ausente significa **vigente**, y eso es deliberado: el `PUT` manda el juego
 * completo de campos (la decisión de T-5, `PUT` y no `PATCH`), y un alta sin
 * `activo` tiene que nacer elegible o el catálogo exigiría dos pasos para
 * servir de algo.
 */
function vigencia(
  crudo: Record<string, unknown>,
  fallas: FallaDeValidacion[],
): boolean {
  const valor = crudo.activo;
  if (valor === undefined || valor === null) return true;
  if (typeof valor !== "boolean") {
    fallas.push(falla("activo", "tipo_invalido"));
    return true;
  }
  return valor;
}

/** `area` y `tipo_cliente`: un nombre y una marca. */
export function normalizarCatalogo(
  cuerpo: unknown,
): Normalizacion<DatosDeCatalogo> {
  if (!esObjeto(cuerpo)) {
    return { ok: false, fallas: [falla("nombre", "tipo_invalido")] };
  }

  const fallas: FallaDeValidacion[] = [];
  const nombre = texto(cuerpo, "nombre", fallas);
  const activo = vigencia(cuerpo, fallas);

  if (nombre === null && !fallas.some((f) => f.campo === "nombre")) {
    fallas.push(falla("nombre", "nombre_requerido"));
  }

  if (fallas.length > 0) return { ok: false, fallas };

  return { ok: true, datos: { nombre: nombre ?? "", activo } };
}

/** `tipo_proceso`: lo anterior más el área y la descripción. */
export function normalizarTipoProceso(
  cuerpo: unknown,
): Normalizacion<DatosDeTipoProceso> {
  if (!esObjeto(cuerpo)) {
    return { ok: false, fallas: [falla("nombre", "tipo_invalido")] };
  }

  const fallas: FallaDeValidacion[] = [];
  const nombre = texto(cuerpo, "nombre", fallas);
  const areaId = texto(cuerpo, "areaId", fallas);
  const descripcion = texto(cuerpo, "descripcion", fallas);
  const activo = vigencia(cuerpo, fallas);

  if (nombre === null && !fallas.some((f) => f.campo === "nombre")) {
    fallas.push(falla("nombre", "nombre_requerido"));
  }
  if (areaId === null && !fallas.some((f) => f.campo === "areaId")) {
    fallas.push(falla("areaId", "area_requerida"));
  }

  if (fallas.length > 0) return { ok: false, fallas };

  return {
    ok: true,
    datos: { areaId: areaId ?? "", nombre: nombre ?? "", descripcion, activo },
  };
}

/**
 * La plantilla entera, en el orden en que llega.
 *
 * El envío es la lista completa y no una operación («agregá», «subí»), por
 * la misma razón por la que T-5 eligió `PUT` sobre `PATCH`: la pantalla
 * siempre conoce el plan completo, y mandarlo entero hace que agregar,
 * quitar, renombrar y reordenar sean una sola escritura atómica en vez de
 * cuatro caminos con cuatro formas de dejar la plantilla a medias.
 *
 * El **orden es la posición en el arreglo**. No viaja un número de orden que
 * el cliente pueda contradecir: `etapa_plantilla.orden` no tiene índice único
 * (T-2 lo dejó así a propósito), así que si el cliente lo eligiera, dos
 * etapas con el mismo `orden` entrarían sin que nada se quejara y el
 * `ORDER BY` quedaría arbitrario.
 */
export function normalizarEtapas(
  cuerpo: unknown,
): Normalizacion<DatosDeEtapa[]> {
  if (!esObjeto(cuerpo) || !Array.isArray(cuerpo.etapas)) {
    return { ok: false, fallas: [falla("etapas", "tipo_invalido")] };
  }

  const fallas: FallaDeValidacion[] = [];
  const etapas: DatosDeEtapa[] = [];
  const vistos = new Set<string>();

  cuerpo.etapas.forEach((cruda: unknown, indice: number) => {
    const campo = `etapa-${String(indice)}`;

    if (!esObjeto(cruda)) {
      fallas.push(falla(campo, "tipo_invalido"));
      return;
    }

    const crudoNombre = cruda.nombre;
    const crudoId = cruda.id;

    if (typeof crudoNombre !== "string") {
      fallas.push(falla(campo, "tipo_invalido"));
      return;
    }
    if (
      crudoId !== undefined &&
      crudoId !== null &&
      typeof crudoId !== "string"
    ) {
      fallas.push(falla(campo, "tipo_invalido"));
      return;
    }

    const nombre = recortar(crudoNombre);
    if (nombre === null) {
      fallas.push(falla(campo, "nombre_requerido"));
      return;
    }

    const id = typeof crudoId === "string" ? recortar(crudoId) : null;

    // La misma etapa dos veces en la lista es una plantilla que no se puede
    // guardar: las dos escrituras caen sobre la misma fila, la última gana y
    // el plan releído tiene un paso menos del que se pidió. Callarlo sería
    // perder un paso en silencio.
    if (id !== null && vistos.has(id)) {
      fallas.push(falla(campo, "etapa_desconocida"));
      return;
    }
    if (id !== null) vistos.add(id);

    etapas.push({ id, nombre });
  });

  if (fallas.length > 0) return { ok: false, fallas };

  return { ok: true, datos: etapas };
}
