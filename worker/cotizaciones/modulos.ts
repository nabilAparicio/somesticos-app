/**
 * El catálogo de tipos de módulo de prosa, y las reglas de qué es un módulo
 * aceptable. Puras: ni D1 ni HTTP.
 *
 * ## Por qué el catálogo está en código y no en una tabla
 *
 * `docs/diseno.md` §8 lo fija sin vueltas: «el catálogo de tipos de módulo
 * vive como registro tipado en código, no como configuración editable en
 * pantalla. Agregar un tipo nuevo es un despliegue, no un CRUD de
 * plantillas». Es el mismo criterio que ya decidió el vocabulario de la
 * bitácora —catálogo en la base cuando el valor es sólo una etiqueta, en
 * código cuando hay código detrás— y acá hay código detrás de cada tipo: un
 * rótulo, un lugar en el orden en que se sugieren y, desde T-9, un prompt.
 * Un tipo sin esas tres cosas no significa nada, así que no puede nacer de un
 * formulario.
 *
 * ## Las dos mitades acopladas
 *
 * El `CHECK` de `cotizacion_modulo.tipo` en
 * `migrations/0004_cotizaciones.sql` y este registro son **una sola decisión
 * escrita dos veces**, exactamente como el vocabulario de la bitácora:
 *
 *  - El **`CHECK`** es el que sobrevive al primer script de importación
 *    (§5). Sin él, en dos años conviven `clausulas`, `cláusulas` y `clauses`
 *    y la pregunta «¿qué solemos excluir?» no se contesta más.
 *  - El **registro** es el que le da rótulo y orden a cada tipo, el que la
 *    pantalla dibuja en su desplegable y el que, en T-9, impide que el
 *    modelo invente un tipo que no existe. Esa es la barandilla de §8.
 *
 * Si se separan, la pantalla ofrece un tipo que la base rechaza con un 500
 * que nadie puede leer. `test/modulos-api.spec.ts` las compara y falla.
 *
 * ## Por qué el registro tiene dos campos y no tres
 *
 * Por tipo hacen falta el identificador, el rótulo legible y el orden en que
 * se sugieren. Los dos primeros son campos; **el tercero es la posición en el
 * arreglo**, y no una columna `orden: 1, 2, 3…`. Una columna sería un segundo
 * lugar donde decir lo mismo que el arreglo ya dice, y el día que los dos no
 * coincidan gana el que alguien mire primero. Un campo de más en un registro
 * tipado es un campo que alguien llena con basura.
 *
 * Y no hay un cuarto campo, que es la parte que importa dejar dicha:
 *
 *  - **No hay `descripcion`.** El rótulo es lo que la persona lee en el
 *    desplegable, y un segundo texto explicativo sería copia de la
 *    documentación con vida propia.
 *  - **No hay `plantilla` ni texto por defecto.** Un módulo precargado con
 *    prosa genérica es prosa genérica que alguien va a emitir sin leer.
 *  - **No hay `obligatorio`.** Qué módulos lleva una cotización lo decide
 *    quien la escribe —y en T-9, el modelo—, no el catálogo: una cotización
 *    de consulta simple no lleva antecedentes y eso no es un error.
 *  - **No hay prompt.** Es de T-9, y entra cuando exista el sitio que lo use.
 */

import type {
  DatosDeModulo,
  FallaDeValidacion,
  MotivoDeFalla,
  TipoDeModulo,
} from "../contract";

/**
 * Los seis tipos, **en el orden en que se sugieren**.
 *
 * El orden es el de lectura de una propuesta y no el alfabético: de dónde
 * viene el encargo, qué se va a hacer, qué queda afuera, sobre qué se apoya
 * el precio, bajo qué condiciones, y el cierre dirigido al cliente. Es el
 * orden en que la pantalla ofrece agregar y, en T-9, el orden en que el
 * generador arma el borrador cuando no tiene motivo para otro. No es el orden
 * de ninguna cotización concreta: ése lo decide quien la escribe, módulo por
 * módulo, y vive en la columna `orden` de cada fila.
 *
 * `as const satisfies` y no una anotación, por lo mismo que
 * `ACCIONES_POR_ENTIDAD`: así las cadenas conservan sus literales —y
 * `rotuloDeTipo` puede devolver el tipo estrecho— pero el compilador sigue
 * exigiendo que cada `tipo` sea uno de la unión. Un tipo inventado acá no
 * compila.
 */
export const CATALOGO_DE_MODULOS = [
  { tipo: "antecedentes", rotulo: "Antecedentes" },
  { tipo: "alcance", rotulo: "Alcance" },
  { tipo: "exclusiones", rotulo: "Exclusiones" },
  { tipo: "supuestos", rotulo: "Supuestos" },
  { tipo: "clausulas", rotulo: "Cláusulas" },
  { tipo: "nota_cliente", rotulo: "Nota al cliente" },
] as const satisfies readonly { tipo: TipoDeModulo; rotulo: string }[];

/**
 * La red que impide que un tipo de la unión se quede sin entrada.
 *
 * El `satisfies` de arriba cierra una dirección: no se puede rotular un tipo
 * que no está en `TipoDeModulo`. Esto cierra la otra: si alguien agrega un
 * tipo a la unión y no lo pone en el catálogo, `Exclude<…>` deja de ser
 * `never` y la asignación de abajo **no compila**. Es el mismo mecanismo que
 * `AccionesSinDuenio` en `worker/bitacora/vocabulario.ts`.
 *
 * Sin esto, un tipo nuevo compilaría, la base lo aceptaría —si alguien se
 * acordó del `CHECK`— y la pantalla lo dibujaría sin rótulo.
 */
export type TiposSinRotulo = Exclude<
  TipoDeModulo,
  (typeof CATALOGO_DE_MODULOS)[number]["tipo"]
>;

/** El uso que hace valer la red de arriba. Tiene que poder ser `never`. */
export const TODOS_LOS_TIPOS_TIENEN_ROTULO: TiposSinRotulo[] = [];

/**
 * Sólo los identificadores, en el mismo orden.
 *
 * Se deriva del catálogo en vez de escribirse de nuevo, igual que
 * `ACCIONES_DE_BITACORA`: una segunda lista a mano es la que se
 * desincroniza. Es la que `test/modulos-api.spec.ts` compara contra el
 * `CHECK` de la base.
 */
export const TIPOS_DE_MODULO: readonly TipoDeModulo[] =
  CATALOGO_DE_MODULOS.map((entrada) => entrada.tipo);

const ROTULOS = new Map<string, string>(
  CATALOGO_DE_MODULOS.map((entrada) => [entrada.tipo, entrada.rotulo]),
);

/**
 * El rótulo de un tipo, para una persona.
 *
 * Es total sobre la unión —el `Map` se construye del mismo catálogo que la
 * red de arriba vigila— así que no hay rama de reserva: una que devolviera
 * el identificador crudo escondería justamente el caso que
 * `TODOS_LOS_TIPOS_TIENEN_ROTULO` existe para romper en el `typecheck`.
 */
export function rotuloDeTipo(tipo: TipoDeModulo): string {
  return ROTULOS.get(tipo) as string;
}

/** Si una cadena cualquiera es uno de los seis tipos. */
export function esTipoDeModulo(valor: unknown): valor is TipoDeModulo {
  return typeof valor === "string" && ROTULOS.has(valor);
}

export type NormalizacionDeModulo =
  | { ok: true; datos: DatosDeModulo }
  | { ok: false; fallas: FallaDeValidacion[] };

export type NormalizacionDeOrden =
  | { ok: true; orden: string[] }
  | { ok: false; fallas: FallaDeValidacion[] };

function falla(campo: string, motivo: MotivoDeFalla): FallaDeValidacion {
  return { campo, motivo };
}

function esObjeto(cuerpo: unknown): cuerpo is Record<string, unknown> {
  return typeof cuerpo === "object" && cuerpo !== null && !Array.isArray(cuerpo);
}

/**
 * De un cuerpo JSON cualquiera a los datos de un módulo, o a la lista de por
 * qué no.
 *
 * Devuelve **todas** las fallas y no la primera, igual que el alta de una
 * cotización: un formulario que corrige de a un error por envío es el
 * formulario que nadie usa.
 *
 * `orden` **se ignora en silencio** si viene, igual que `codigo` y `estado`
 * en el alta de la cotización: ninguna pantalla lo manda, así que un 422 no
 * le hablaría a nadie, y lo que de verdad importa —que no se pueda imponer—
 * lo garantiza que esta función no lo copia a la salida. El `orden` lo asigna
 * el servidor, siempre.
 */
export function normalizarModulo(cuerpo: unknown): NormalizacionDeModulo {
  if (!esObjeto(cuerpo)) {
    return { ok: false, fallas: [falla("tipo", "tipo_de_modulo_desconocido")] };
  }

  const fallas: FallaDeValidacion[] = [];

  // Ausente, en blanco e inventado caen en el mismo motivo: el tipo sale de
  // un desplegable que la pantalla dibuja del mismo registro, así que las
  // tres situaciones son el mismo defecto desde donde está la persona.
  const tipo = cuerpo.tipo;
  if (!esTipoDeModulo(tipo)) {
    fallas.push(falla("tipo", "tipo_de_modulo_desconocido"));
  }

  // Se recorta al guardar, y por eso la comprobación es sobre el recorte: un
  // módulo con tres saltos de línea y nada más es un título sin nada debajo.
  const crudo = cuerpo.contenido;
  let contenido = "";
  if (crudo === undefined || crudo === null) {
    fallas.push(falla("contenido", "contenido_requerido"));
  } else if (typeof crudo !== "string") {
    fallas.push(falla("contenido", "tipo_invalido"));
  } else {
    contenido = crudo.trim();
    if (contenido === "") {
      fallas.push(falla("contenido", "contenido_requerido"));
    }
  }

  if (fallas.length > 0) return { ok: false, fallas };

  return { ok: true, datos: { tipo: tipo as TipoDeModulo, contenido } };
}

/**
 * De un cuerpo JSON cualquiera a la lista de identificadores en su orden
 * nuevo, o a por qué no.
 *
 * Acá sólo se comprueba la **forma**: que sea un arreglo de cadenas no
 * vacías. Que esos identificadores sean exactamente los módulos de esta
 * cotización lo decide el repositorio, que es el único que los conoce — la
 * misma frontera que `etapa_desconocida` en el plan de un proceso.
 *
 * El cuerpo es `{ orden: [...] }` y no el arreglo pelado para que mañana se
 * le pueda agregar un campo sin cambiar la forma del cuerpo, y porque un
 * JSON de nivel superior que es un arreglo es el que después nadie sabe
 * versionar.
 */
export function normalizarOrdenDeModulos(
  cuerpo: unknown,
): NormalizacionDeOrden {
  if (!esObjeto(cuerpo) || !Array.isArray(cuerpo.orden)) {
    return { ok: false, fallas: [falla("orden", "tipo_invalido")] };
  }

  const fallas: FallaDeValidacion[] = [];
  const orden: string[] = [];

  cuerpo.orden.forEach((valor: unknown, indice) => {
    if (typeof valor !== "string" || valor.trim() === "") {
      fallas.push(falla(`orden-${String(indice)}`, "tipo_invalido"));
      return;
    }
    orden.push(valor);
  });

  if (fallas.length > 0) return { ok: false, fallas };

  return { ok: true, orden };
}
