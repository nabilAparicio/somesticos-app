/**
 * Las **claves** de los tipos de módulo de prosa, y las reglas de qué es un
 * módulo aceptable. Puras: ni D1 ni HTTP.
 *
 * ## El rótulo ya no vive acá (T-3 y T-4 de `odd/tasks/plantillas-de-modulo.md`)
 *
 * Hasta T-2 este archivo era el catálogo entero: la clave **y** el rótulo que
 * la persona lee. Ya no. El rótulo vigente de cada módulo vive en
 * `modulo_plantilla` —`COALESCE(rotulo, rotulo_oficial)`, resuelto una sola
 * vez en `worker/plantillas/`— porque el abogado puede renombrarlo desde
 * `/catalogos/modulos`, y un rótulo escrito en código es un rótulo que ese
 * cambio no alcanza.
 *
 * T-3 apagó cinco de los seis consumidores y dejó `CATALOGO_DE_MODULOS` vivo
 * con uno —el prompt del generador— y su fecha de muerte escrita. **T-4 la
 * borró**: `worker/ia/prompt.ts` lee las plantillas de la base y les pasa al
 * modelo `clave · rótulo · descripción`, así que los seis rótulos escritos a
 * mano tienen hoy un único lugar en todo el repositorio, que es la siembra de
 * `migrations/0016_una_plantilla_de_modulo_dice_para_que_sirve.sql`: un hecho
 * histórico escrito una vez y que nadie vuelve a leer. Renombrar un preset es
 * editar un lugar.
 *
 * El argumento con que §8 mandó este catálogo al código —«hay código detrás de
 * cada tipo: un renderizador y un esquema»— se midió y no se cumplía: los seis
 * se dibujan idénticos y difieren sólo en el rótulo, que es la definición
 * exacta de «etiqueta» con la que el mismo criterio mandó al tipo de cliente a
 * una tabla. `docs/diseno.md` §6 y §8 ya están corregidos (T-2).
 *
 * ## Lo que este archivo dejó de tener en T-6, y qué hay en su lugar
 *
 * **Ya no hay lista.** `TIPOS_DE_MODULO`, `esTipoDeModulo` y la red de tipos
 * `TiposFueraDeLaLista` no existen, y con ellas se fue la unión
 * `TipoDeModulo` de `worker/contract.ts`. La historia de ese catálogo en
 * código fue, en orden: el `CHECK` de `0004` y la lista eran **una sola
 * decisión escrita dos veces** —como el vocabulario de la bitácora—, T-5 borró
 * la mitad del esquema (`0017` cambió la columna por
 * `plantilla_id REFERENCES modulo_plantilla (id)`) y T-6 borró la otra.
 *
 * Lo que el `CHECK` sostenía —«en dos años conviven `clausulas`, `cláusulas` y
 * `clauses` y la pregunta *¿qué solemos excluir?* no se contesta más» (§5)— lo
 * sostiene el único `modulo_plantilla_clave_unica`: admite las tres claves
 * pero una sola vez cada una, y un módulo sólo puede apuntar a una fila que
 * exista. El `CHECK` prohibía claves **nuevas**; el único prohíbe claves
 * **repetidas**, que es el defecto real. Que la lista sea de seis pasa a ser
 * decisión del bufete desde T-7.
 *
 * Y lo que la lista hacía acá —validar lo que entra por el cable— lo hace
 * ahora `normalizarModulo` **contra las claves que le pasan**, que salen de
 * `modulo_plantilla` por el único puerto que la lee. El contrato tiene el
 * balance entero escrito donde vivía la unión; lo que hace falta saber desde
 * acá es que la comparación dejó de ser contra seis literales y pasó a ser
 * contra las filas de un bufete, así que **ya no hay dos listas que se puedan
 * separar**. Eso es lo que se gana. Lo que se pierde es que un
 * `{ tipo: "alcanze" }` escrito en este repositorio ya compila, y se entera
 * una prueba en vez del `typecheck`.
 *
 * Lo que la lista **no** contestaba nunca, y sigue sin contestarse acá:
 * *cuáles están vigentes*. Eso es la columna `activo` de una fila. Al modelo
 * se lo cierra el catálogo de plantillas **activas** que el prompt le declaró
 * —`CatalogosOfrecidos.modulos`—, y a esta función no, a propósito: el
 * encabezado de `clavesDePlantillas`, unas líneas más abajo, argumenta por qué
 * la lista que llega acá incluye las dadas de baja.
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
  PlantillaDeModulo,
} from "../contract";

/**
 * Las claves de un catálogo de plantillas: lo que una clave de módulo se
 * compara contra desde T-6.
 *
 * **Incluye las dadas de baja**, y no es un descuido: es exactamente lo que la
 * unión `TipoDeModulo` decía antes de morir. La unión enumeraba las claves
 * *válidas* y nunca supo nada de vigencia, así que filtrar por `activo` acá no
 * sería mudar la red de lugar sino endurecerla de contrabando — y endurecerla
 * tiene una consecuencia ya medida: T-3 dejó escrito que rechazar una clave
 * retirada deja **congelado todo módulo cuya plantilla se dio de baja**, porque
 * el formulario manda el tipo junto con el texto y nadie podría corregirle una
 * coma. Lo que impide *elegirla de nuevo* es qué ofrece el desplegable, no esta
 * lista.
 *
 * Quien sí filtra por `activo` es `modulosOfrecidos` en
 * `worker/cotizaciones/rutas.ts`, y la pregunta de allá es otra: «¿qué le
 * ofrezco al modelo para que lo escriba desde cero?». La distinción entre
 * *válido* y *seleccionable* la fijó T-5 y acá sólo se respeta.
 *
 * ## Por qué vive en este archivo y no al lado del puerto que lee la tabla
 *
 * Porque **lo usan las dos copias de la validación** —ésta y
 * `normalizarBorradorDeModulo` de `src/pantallas/cotizaciones/modulos.ts`— y
 * una de las dos corre en el navegador. `worker/plantillas/repositorio.ts`
 * arrastra el adaptador de D1 detrás, y `worker/plantillas/dominio.ts`, que es
 * puro, no está en el `include` de `tsconfig.app.json`. Este archivo **sí**
 * está, y por la condición que ese `include` tiene documentada y que esta
 * función cumple: no tiene ninguna importación en tiempo de ejecución, sólo
 * tipos del contrato, que se borran al compilar.
 *
 * Es además el archivo que antes **tenía** el catálogo. Que la lista de seis se
 * haya ido y quede acá la función que deriva la lista de verdad es la forma más
 * corta de decir qué cambió.
 */
export function clavesDePlantillas(
  plantillas: readonly PlantillaDeModulo[],
): string[] {
  return plantillas.map((una) => una.clave);
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
 *
 * ## Las claves llegan por parámetro, y eso es T-6
 *
 * Hasta T-5 esta función cerraba el juego con `esTipoDeModulo`, o sea con seis
 * literales de este archivo. Ahora recibe las claves del bufete y sigue
 * pura: ni D1 ni HTTP, igual que antes, y las pruebas del dominio le pasan la
 * lista que quieren probar. Quien la lee es la ruta, que para eso ya tiene el
 * puerto de plantillas en la mano.
 *
 * **Falla cerrada con la lista vacía**, por la misma regla que
 * `CatalogosOfrecidos`: sin claves conocidas ningún módulo pasa. No es un
 * estado alcanzable hoy —`modulo_plantilla_no_se_borra` impide que un bufete
 * se quede sin filas— y la alternativa sería que una lectura fallida del
 * catálogo se tradujera en «todo vale», que es la peor de las dos.
 */
export function normalizarModulo(
  cuerpo: unknown,
  /**
   * Las claves de `modulo_plantilla` de este bufete, **activas y de baja**.
   * Las dos, y el motivo está en `clavesDePlantillas`.
   */
  clavesConocidas: readonly string[],
): NormalizacionDeModulo {
  if (!esObjeto(cuerpo)) {
    return { ok: false, fallas: [falla("tipo", "tipo_de_modulo_desconocido")] };
  }

  const fallas: FallaDeValidacion[] = [];

  // Ausente, en blanco e inventado caen en el mismo motivo: el tipo sale de
  // un desplegable que la pantalla dibuja de la misma tabla contra la que se
  // compara acá, así que las tres situaciones son el mismo defecto desde donde
  // está la persona.
  //
  // El `typeof` no es una segunda guarda y no se cuenta como una: `includes`
  // sobre `readonly string[]` no acepta un `unknown`, así que la comprobación
  // de cadena es lo que deja hacer la de pertenencia. Y es además lo que
  // estrecha `tipo` a `string` para el `return` de abajo, que es por lo que esa
  // salida **no lleva un `as`** — el estrechamiento sale de la misma condición
  // que la pertenencia y no de una afirmación sobre un valor que viene del
  // cable. Es la forma que `validarModulo` ya usa en `worker/ia/esquema.ts`.
  const tipo = cuerpo.tipo;
  const tipoConocido =
    typeof tipo === "string" && clavesConocidas.includes(tipo);
  if (!tipoConocido) {
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

  // `tipoConocido` otra vez, y acá no promete nada: `fallas.length > 0` ya dio
  // el veredicto arriba, así que esta rama es inalcanzable. Lo que hace es
  // construir — es la condición bajo la cual `tipo` está estrechado a `string`.
  // El mismo reparto que `validarModulo` deja escrito para su propia salida.
  if (!tipoConocido) return { ok: false, fallas };

  return { ok: true, datos: { tipo, contenido } };
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
