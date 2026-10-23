/**
 * Las reglas de qué es un proceso aceptable. Puras: ni D1 ni HTTP.
 *
 * Acá vive solo lo que se puede decidir mirando el cuerpo de la petición: que
 * el cliente venga, que el tipo venga, que el título diga algo. Lo que exige
 * consultar la base —que ese cliente sea de este tenant, que esa etapa sea de
 * este proceso, que esa etapa no esté alcanzada— vive en el repositorio, que
 * es quien sabe de filas.
 *
 * **El plan de trabajo se normaliza con `normalizarEtapas` de los catálogos,
 * no con una copia.** La forma del envío es la misma lista ordenada de pasos
 * con nombre —`DatosDeEtapa`, que ya vive en el contrato compartido— y la
 * regla también: el orden es la posición en el arreglo y no un número que el
 * cliente mande. Dos copias de esa función serían dos definiciones de «el
 * orden es la posición», y la que se relaje primero deja de avisar.
 */

import { normalizarEtapas } from "../catalogos/dominio";
import type { Normalizacion } from "../catalogos/dominio";
import type {
  DatosDeGuardadoDePlantilla,
  DatosDeProceso,
  FallaDeValidacion,
  MotivoDeFalla,
} from "../contract";

export type { Normalizacion };
export { normalizarEtapas };

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
 * El alta de un proceso.
 *
 * `origen` **no se lee del cuerpo**: en esta tajada solo existe `directo`, y
 * lo pone el repositorio. Leerlo sería ofrecer un camino —`cotizacion`— que
 * apunta a una tabla de la tajada 2 que todavía no existe.
 *
 * `responsableId` es opcional: un proceso puede abrirse antes de decidir
 * quién lo lleva, y exigirlo convertiría un dato administrativo en un
 * bloqueo para registrar el trabajo.
 */
export function normalizarProceso(
  cuerpo: unknown,
): Normalizacion<DatosDeProceso> {
  if (!esObjeto(cuerpo)) {
    return { ok: false, fallas: [falla("titulo", "tipo_invalido")] };
  }

  const fallas: FallaDeValidacion[] = [];
  const clienteId = texto(cuerpo, "clienteId", fallas);
  const tipoProcesoId = texto(cuerpo, "tipoProcesoId", fallas);
  const titulo = texto(cuerpo, "titulo", fallas);
  const responsableId = texto(cuerpo, "responsableId", fallas);

  // I-2: todo proceso está ligado a un cliente. La base lo exige con
  // `cliente_id NOT NULL`; esto es para que la respuesta diga cuál es el
  // campo que falta en vez de reventar contra la restricción.
  if (clienteId === null && !fallas.some((f) => f.campo === "clienteId")) {
    fallas.push(falla("clienteId", "cliente_requerido"));
  }
  if (
    tipoProcesoId === null &&
    !fallas.some((f) => f.campo === "tipoProcesoId")
  ) {
    fallas.push(falla("tipoProcesoId", "tipo_proceso_requerido"));
  }
  if (titulo === null && !fallas.some((f) => f.campo === "titulo")) {
    fallas.push(falla("titulo", "titulo_requerido"));
  }

  if (fallas.length > 0) return { ok: false, fallas };

  return {
    ok: true,
    datos: {
      clienteId: clienteId ?? "",
      tipoProcesoId: tipoProcesoId ?? "",
      titulo: titulo ?? "",
      responsableId,
    },
  };
}

/**
 * El cuerpo de «guardar el plan como plantilla» (T-11).
 *
 * **Las etapas no se leen del cuerpo.** El plan ya está guardado; lo lee el
 * repositorio. Aceptarlas acá sería dejar que la pantalla eligiera qué se
 * copia, y permitiría guardar como plantilla algo que el proceso no tiene.
 *
 * El destino se cierra en los dos valores que existen y nada más: un tercero
 * silencioso elegiría uno por defecto, y el que elija va a ser el que
 * escribe sobre algo.
 *
 * Para el tipo nuevo no se lee `activo`: nace vigente, por la misma razón
 * que un catálogo recién creado en T-6 —tener que darlo de alta en un
 * segundo paso convertiría el atajo en dos trámites.
 */
export function normalizarGuardadoDePlantilla(
  cuerpo: unknown,
): Normalizacion<DatosDeGuardadoDePlantilla> {
  if (!esObjeto(cuerpo)) {
    return { ok: false, fallas: [falla("destino", "tipo_invalido")] };
  }

  const destino = cuerpo.destino;
  if (destino === "actualizar") return { ok: true, datos: { destino } };
  if (destino !== "nuevo") {
    return { ok: false, fallas: [falla("destino", "destino_invalido")] };
  }

  const fallas: FallaDeValidacion[] = [];
  const areaId = texto(cuerpo, "areaId", fallas);
  const nombre = texto(cuerpo, "nombre", fallas);
  const descripcion = texto(cuerpo, "descripcion", fallas);

  if (nombre === null && !fallas.some((f) => f.campo === "nombre")) {
    fallas.push(falla("nombre", "nombre_requerido"));
  }
  if (areaId === null && !fallas.some((f) => f.campo === "areaId")) {
    fallas.push(falla("areaId", "area_requerida"));
  }

  if (fallas.length > 0) return { ok: false, fallas };

  return {
    ok: true,
    datos: {
      destino,
      areaId: areaId ?? "",
      nombre: nombre ?? "",
      descripcion,
    },
  };
}
