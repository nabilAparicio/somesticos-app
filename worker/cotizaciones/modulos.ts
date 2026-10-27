/**
 * Las **claves** de los tipos de módulo de prosa, y las reglas de qué es un
 * módulo aceptable. Puras: ni D1 ni HTTP.
 *
 * ## El rótulo ya no vive acá (T-3 de `odd/tasks/plantillas-de-modulo.md`)
 *
 * Hasta T-2 este archivo era el catálogo entero: la clave **y** el rótulo que
 * la persona lee. Ya no. El rótulo vigente de cada módulo vive en
 * `modulo_plantilla` —`COALESCE(rotulo, rotulo_oficial)`, resuelto una sola
 * vez en `worker/plantillas/`— porque el abogado puede renombrarlo desde
 * `/catalogos/modulos`, y un rótulo escrito en código es un rótulo que ese
 * cambio no alcanza.
 *
 * El argumento con que §8 mandó este catálogo al código —«hay código detrás de
 * cada tipo: un renderizador y un esquema»— se midió y no se cumplía: los seis
 * se dibujan idénticos y difieren sólo en el rótulo, que es la definición
 * exacta de «etiqueta» con la que el mismo criterio mandó al tipo de cliente a
 * una tabla. `docs/diseno.md` §6 y §8 ya están corregidos (T-2).
 *
 * ## Lo que sí sigue acá, y por qué
 *
 * **La lista cerrada de claves.** El `CHECK` de `cotizacion_modulo.tipo` en
 * `migrations/0004_cotizaciones.sql` y `TIPOS_DE_MODULO` siguen siendo **una
 * sola decisión escrita dos veces**, exactamente como el vocabulario de la
 * bitácora:
 *
 *  - El **`CHECK`** es el que sobrevive al primer script de importación
 *    (§5). Sin él, en dos años conviven `clausulas`, `cláusulas` y `clauses`
 *    y la pregunta «¿qué solemos excluir?» no se contesta más.
 *  - La **lista** es la que valida lo que entra por el cable y la que impide
 *    que el generador invente una clave que no existe.
 *
 * Si se separan, la pantalla ofrece una clave que la base rechaza con un 500
 * que nadie puede leer. `test/modulos-api.spec.ts` las compara y falla.
 *
 * La clave muere en la tajada 2, cuando `cotizacion_modulo.tipo` pase a ser
 * una referencia a `modulo_plantilla.id`. Hasta entonces el `CHECK` manda y
 * esta lista es su mitad en TypeScript.
 *
 * ## Lo que este archivo ya no contesta
 *
 * **«¿Cómo se llama este módulo?»** Esa pregunta se le hace a la base. En el
 * servidor la contesta `ServicioDePlantillas.listar`, y en la pantalla el
 * `GET /api/plantillas-modulo` que el editor ya pide. No hay acá ninguna
 * función que devuelva un rótulo: tenerla sería ofrecer una respuesta vieja
 * por un camino más corto.
 */

import type {
  DatosDeModulo,
  FallaDeValidacion,
  MotivoDeFalla,
  TipoDeModulo,
} from "../contract";

/**
 * Las seis claves, **en el orden en que se sugieren**.
 *
 * El orden es el de lectura de una propuesta y no el alfabético: de dónde
 * viene el encargo, qué se va a hacer, qué queda afuera, sobre qué se apoya
 * el precio, bajo qué condiciones, y el cierre dirigido al cliente. Es el
 * mismo orden que `0016` sembró en la columna `orden` de `modulo_plantilla`,
 * que es la que hoy ordena el desplegable; acá queda porque una lista sin
 * orden invita a reordenarla, y reordenarla no significaría nada.
 *
 * **No hay rótulo**, y la ausencia es el cambio de T-3. Tampoco hay columna
 * `orden`: el orden **es** la posición del arreglo, y una columna sería un
 * segundo lugar donde decir lo mismo.
 *
 * `as const satisfies` y no una anotación, por lo mismo que
 * `ACCIONES_POR_ENTIDAD`: así las cadenas conservan sus literales —y la red de
 * abajo puede excluirlas de la unión— pero el compilador sigue exigiendo que
 * cada una sea un miembro de `TipoDeModulo`. Una clave inventada acá no
 * compila.
 */
export const TIPOS_DE_MODULO = [
  "antecedentes",
  "alcance",
  "exclusiones",
  "supuestos",
  "clausulas",
  "nota_cliente",
] as const satisfies readonly TipoDeModulo[];

/**
 * La red que impide que un miembro de la unión se quede fuera de la lista.
 *
 * Es lo que queda de `TiposSinRotulo`, y lo que queda **no es lo mismo**: esa
 * red probaba que todo tipo tenía rótulo, y eso ya no se puede probar con un
 * tipo porque el rótulo es una fila. Lo prueba ahora
 * `test/modulos-api.spec.ts`, leyendo las claves de `modulo_plantilla` y
 * enfrentándolas a esta lista **en los dos sentidos** —una clave sin fila y
 * una fila sin clave son dos defectos distintos y los dos rompen—. La red no
 * se perdió: cambió de lugar y de mecanismo.
 *
 * Lo que sigue siendo cuestión de tipos es la pertenencia, que nunca tuvo que
 * ver con el rótulo. El `satisfies` de arriba cierra una dirección: no se
 * puede listar una clave que no está en `TipoDeModulo`. Esto cierra la otra:
 * si alguien agrega un miembro a la unión y no lo pone en la lista,
 * `Exclude<…>` deja de ser `never`, la restricción `T extends never` de
 * `DebeSerVacio` no se satisface y **el `typecheck` se cae con TS2344**
 * nombrando la clave suelta. Sin esto, un miembro nuevo compilaría, nada lo
 * validaría —`esTipoDeModulo` se construye de esta lista— y la prueba de la
 * base tampoco lo notaría: compara filas contra la lista, y a la lista no le
 * faltaría nada.
 *
 * ## La forma que había acá no servía, y hay que no volver a escribirla
 *
 * Hasta T-8 la red era `export const TODOS_LOS_TIPOS_TIENEN_ROTULO:
 * TiposSinRotulo[] = []`, y el comentario afirmaba que esa asignación no
 * compilaba cuando la exclusión dejaba de ser `never`. **Era falso.** Un
 * arreglo vacío es asignable a `T[]` para cualquier `T`, así que
 * `const x: "resumen_ejecutivo"[] = []` compila igual que
 * `const x: never[] = []`. Se midió con la mutación correcta —agregar
 * `"resumen_ejecutivo"` a `TipoDeModulo` y **ningún** otro cambio— y
 * `pnpm typecheck` salió 0. La misma corrección está en `lineas.ts` y en
 * `worker/bitacora/vocabulario.ts`.
 */
type DebeSerVacio<T extends never> = T;

export type TiposFueraDeLaLista = DebeSerVacio<
  Exclude<TipoDeModulo, (typeof TIPOS_DE_MODULO)[number]>
>;

/**
 * Los rótulos escritos a mano, con **un solo consumidor** y fecha de muerte.
 *
 * Estos seis rótulos son hoy la segunda copia de lo que `0016` sembró en
 * `rotulo_oficial`, y una segunda copia es una copia que se queda vieja. T-3
 * apagó a los cinco consumidores que importaban —el editor, la hoja, el
 * detalle y el `detalle` de la bitácora leen `modulo_plantilla`, y el snapshot
 * congela lo que leyó—, y **queda uno**:
 *
 *  > `worker/ia/prompt.ts:238`, que arma la lista `clave · rótulo` que el
 *  > modelo recibe.
 *
 * Se queda porque esa línea es de **T-4**, que le inyecta al prompt
 * `clave · rótulo · descripción` leído de la base: ponerla a leer la base es
 * exactamente esa tarea, y cambiar el prompt desde acá dejaría la mitad del
 * trabajo hecho sin la prueba que lo mide —T-4 mide el tamaño del prompt antes
 * y después—. Mientras siga viva, lo que sostiene que no se desincronice no es
 * la buena intención: `test/modulos-api.spec.ts` compara estos rótulos contra
 * los `rotulo_oficial` de `modulo_plantilla` **en los dos sentidos**, así que
 * renombrar un preset en una migración y olvidarse de acá pone la suite en
 * rojo.
 *
 * **El día que T-4 entre, esta constante se borra.** No queda nada que la use,
 * y entonces los rótulos escritos a mano tienen un único lugar en todo el
 * repositorio: la siembra de `0016`, que es un hecho histórico escrito una vez
 * y que nadie vuelve a leer.
 */
export const CATALOGO_DE_MODULOS = [
  { tipo: "antecedentes", rotulo: "Antecedentes" },
  { tipo: "alcance", rotulo: "Alcance" },
  { tipo: "exclusiones", rotulo: "Exclusiones" },
  { tipo: "supuestos", rotulo: "Supuestos" },
  { tipo: "clausulas", rotulo: "Cláusulas" },
  { tipo: "nota_cliente", rotulo: "Nota al cliente" },
] as const satisfies readonly { tipo: TipoDeModulo; rotulo: string }[];

const CLAVES = new Set<string>(TIPOS_DE_MODULO);

/** Si una cadena cualquiera es una de las seis claves. */
export function esTipoDeModulo(valor: unknown): valor is TipoDeModulo {
  return typeof valor === "string" && CLAVES.has(valor);
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
