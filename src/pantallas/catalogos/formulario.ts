/**
 * Los borradores de los formularios de catálogo y sus reglas, sin React y
 * sin DOM.
 *
 * Misma frontera que estableció T-5: las tres transformaciones que no son de
 * presentación —fila → borrador, borrador → petición, borrador → fallas— se
 * equivocan en silencio si viven dentro del componente, así que viven acá,
 * donde se prueban sin montar un navegador.
 *
 * **Esta validación no autoriza nada.** La que manda es la del Worker
 * (`worker/catalogos/dominio.ts`), que es la que la base respalda. Esta
 * existe para avisar antes de mandar. Son dos copias de la misma regla a
 * propósito, y cada una tiene sus propias pruebas: aflojar una tiene que
 * matar sus pruebas y no las de la otra.
 */

import type {
  Area,
  BorradoBloqueado,
  DatosDeCatalogo,
  DatosDeTipoProceso,
  Dependencia,
  FallaDeValidacion,
  TipoProceso,
} from "../../../worker/contract";

export interface BorradorDeCatalogo {
  nombre: string;
  activo: boolean;
}

export interface BorradorDeTipoProceso {
  areaId: string;
  nombre: string;
  descripcion: string;
  activo: boolean;
}

/**
 * Nace vigente: un catálogo recién creado tiene que poder elegirse sin un
 * segundo paso. Dar de baja es una decisión posterior y explícita.
 */
export const BORRADOR_DE_CATALOGO_VACIO: BorradorDeCatalogo = {
  nombre: "",
  activo: true,
};

export const BORRADOR_DE_TIPO_VACIO: BorradorDeTipoProceso = {
  areaId: "",
  nombre: "",
  descripcion: "",
  activo: true,
};

function recortar(valor: string): string | null {
  const limpio = valor.trim();
  return limpio === "" ? null : limpio;
}

// ---------------------------------------------------------------------------
// `area` y `tipo_cliente`
// ---------------------------------------------------------------------------

export function borradorDeCatalogo(fila: {
  readonly nombre: string;
  readonly activo: boolean;
}): BorradorDeCatalogo {
  return { nombre: fila.nombre, activo: fila.activo };
}

export function aPeticionDeCatalogo(
  borrador: BorradorDeCatalogo,
): DatosDeCatalogo {
  return { nombre: borrador.nombre.trim(), activo: borrador.activo };
}

export function validarCatalogo(
  borrador: BorradorDeCatalogo,
): FallaDeValidacion[] {
  return borrador.nombre.trim() === ""
    ? [{ campo: "nombre", motivo: "nombre_requerido" }]
    : [];
}

// ---------------------------------------------------------------------------
// `tipo_proceso`
// ---------------------------------------------------------------------------

export function borradorDeTipoProceso(
  tipo: TipoProceso,
): BorradorDeTipoProceso {
  return {
    areaId: tipo.areaId,
    nombre: tipo.nombre,
    descripcion: tipo.descripcion ?? "",
    activo: tipo.activo,
  };
}

export function aPeticionDeTipoProceso(
  borrador: BorradorDeTipoProceso,
): DatosDeTipoProceso {
  return {
    areaId: borrador.areaId.trim(),
    nombre: borrador.nombre.trim(),
    // Lo vacío vuelve a ser `null`, no `""`: un `""` guardado es una
    // descripción que existe y está en blanco, y después nada distingue «no
    // la escribimos» de «no tiene».
    descripcion: recortar(borrador.descripcion),
    activo: borrador.activo,
  };
}

/**
 * Devuelve **todas** las fallas, no la primera: un formulario que corrige de
 * a un error por envío es el que hace que nadie cargue nada.
 */
export function validarTipoProceso(
  borrador: BorradorDeTipoProceso,
): FallaDeValidacion[] {
  const fallas: FallaDeValidacion[] = [];

  if (borrador.nombre.trim() === "") {
    fallas.push({ campo: "nombre", motivo: "nombre_requerido" });
  }
  if (borrador.areaId.trim() === "") {
    fallas.push({ campo: "areaId", motivo: "area_requerida" });
  }

  return fallas;
}

/**
 * Las áreas que el desplegable puede ofrecer.
 *
 * Las dadas de baja no se ofrecen, **salvo la que el tipo ya tiene**. Sin esa
 * excepción, abrir a editar un tipo viejo y guardar sin tocar nada le
 * cambiaría el área sin que nadie lo pidiera, que es la peor clase de cambio.
 * Es la misma regla que `tiposSeleccionables` en T-5.
 */
export function areasSeleccionables(
  areas: readonly Area[],
  seleccionadaId: string,
): Area[] {
  return areas.filter((area) => area.activo || area.id === seleccionadaId);
}

// ---------------------------------------------------------------------------
// El bloqueo del borrado
// ---------------------------------------------------------------------------

/**
 * Cómo se nombra cada clase de dependiente, en singular y en plural.
 *
 * El `Record` es exhaustivo sobre `EntidadDependiente`: el día que el Worker
 * cuente una dependencia nueva, esto deja de compilar en vez de imprimir
 * `undefined` en la cara del usuario.
 */
const DEPENDIENTES: Record<Dependencia["entidad"], readonly [string, string]> =
  {
    tipo_proceso: ["tipo de proceso", "tipos de proceso"],
    etapa_plantilla: ["etapa de plantilla", "etapas de plantilla"],
    proceso: ["proceso", "procesos"],
    cliente: ["cliente", "clientes"],
  };

function enumerar(partes: readonly string[]): string {
  if (partes.length <= 1) return partes[0] ?? "";
  return `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
}

/**
 * Qué impide borrar, cuántos son, y qué hacer en vez de borrar.
 *
 * La última frase no es cortesía: el 409 no puede ser una pared sin puerta.
 * Para un catálogo lo normal es dar de baja, que saca la fila de lo elegible
 * sin invalidar lo que ya la referencia.
 */
export function mensajeDeBloqueo(
  bloqueo: BorradoBloqueado | null,
  nombre: string,
): string {
  // `null` es el 409 que no es de borrado. No debería llegar acá —el único
  // 409 de los catálogos es el de dependientes— pero decirlo en el tipo es
  // más barato que una aserción que mañana sea mentira.
  if (bloqueo === null) return `No se puede borrar «${nombre}».`;

  const partes = bloqueo.dependencias.map(({ entidad, cuantos }) => {
    const [singular, plural] = DEPENDIENTES[entidad];
    return `${String(cuantos)} ${cuantos === 1 ? singular : plural}`;
  });

  return (
    `No se puede borrar «${nombre}»: tiene ${enumerar(partes)}.` +
    " Se puede dar de baja: deja de ofrecerse para lo nuevo y sigue siendo" +
    " válida para lo ya guardado."
  );
}
