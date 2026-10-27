/**
 * Las reglas de qué se puede escribir de un renglón del arancel, y de cómo se
 * lee la tabla. Puras: ni D1 ni HTTP.
 *
 * ## La frontera que este archivo custodia
 *
 * El arancel tiene dos clases de dato en la misma fila, y toda la tajada
 * depende de no confundirlas:
 *
 *  - **La cita.** `categoria`, `numeral`, `concepto`, `orden`, `clase`,
 *    `montoOficial` y `reglaOficial` son la transcripción del **Acuerdo No 49
 *    de 24 de abril de 2001**. No son datos nuestros: son lo que dice un
 *    documento publicado. Un `UPDATE` que los cambie no es una corrección, es
 *    una cita falsificada.
 *  - **La decisión del bufete.** `monto`, y nada más.
 *
 * `CAMPOS_CITADOS` es esa frontera escrita una vez. La **otra** mitad vive en
 * el disparador `arancel_renglon_citado_no_se_edita` de
 * `migrations/0012_arancel_de_honorarios.sql`, y las dos existen a propósito,
 * por el mismo reparto que el vocabulario de la bitácora:
 *
 *  - El **disparador** es el que sobrevive al primer script de importación
 *    (`docs/diseno.md` §5), y esta tabla **va a** recibir scripts: la siembra
 *    es uno.
 *  - Esta lista es la que deja **contestar** en vez de caerse. Sin ella, un
 *    cuerpo con `montoOficial` moriría en la base y saldría como un 500 de
 *    SQLite crudo; un 500 no es una negativa, es una caída, y la pantalla no
 *    puede decir nada útil sobre ella.
 *
 * `test/arancel-dominio.spec.ts` compara la lista contra las siete columnas,
 * exacta y no por contención, para que agregar una columna citada obligue a
 * decidir si la API también la defiende.
 *
 * ## Lo que no está acá
 *
 * Nada que exija consultar: que el renglón exista en este bufete, y que el
 * renglón sea o no un rubro, se resuelve contra la fila guardada y por eso
 * vive en el repositorio. Lo que acá se decide es **sobre el cuerpo**, que es
 * todo lo que se puede decidir sin leer nada.
 */

import type {
  CategoriaDelArancel,
  ClaseDeRenglonDelArancel,
  FallaDeValidacion,
  NotaDelArancel,
  RenglonDelArancel,
} from "../contract";

/**
 * Los nombres —**del cable**, no de las columnas— que nombran una cita.
 *
 * Son los del cable porque quien recibe la negativa está mirando el cuerpo
 * que mandó, no el esquema. Van en orden alfabético para que la respuesta sea
 * determinista: un arreglo cuyo orden dependa del orden de las claves del
 * JSON entrante haría que la misma negativa se viera distinta según cómo se
 * armó la petición, y eso no se puede probar exacto.
 */
export const CAMPOS_CITADOS = [
  "categoria",
  "clase",
  "concepto",
  "montoOficial",
  "numeral",
  "orden",
  "reglaOficial",
] as const;

/**
 * Lo que puede salir de mirar el cuerpo de una edición.
 *
 * `citado` es una variante propia y no un `invalido` con otro motivo, y la
 * diferencia es la que importa: un 422 dice «arreglá el dato y volvé a
 * mandar», y acá no hay dato que arreglar — ese campo no se escribe nunca.
 * Aplastarlos en uno dejaría a la pantalla prometiendo un reintento que no
 * puede funcionar.
 */
export type RevisionDeMonto =
  | { estado: "ok"; monto: number | null }
  | { estado: "citado"; campos: string[] }
  | { estado: "invalido"; fallas: FallaDeValidacion[] };

function esObjeto(cuerpo: unknown): cuerpo is Record<string, unknown> {
  return typeof cuerpo === "object" && cuerpo !== null && !Array.isArray(cuerpo);
}

/**
 * Qué campos citados trae el cuerpo.
 *
 * Se mira si la **clave vino**, no si trae un valor que valga: un
 * `{ "montoOficial": null }` es igual de inadmisible que un
 * `{ "montoOficial": 1 }`, porque las dos peticiones vienen de un cliente que
 * cree que puede escribir esa columna. Decirle «te lo acepté» a la primera
 * sería enseñarle que la escritura funcionó.
 */
function citadosEn(cuerpo: Record<string, unknown>): string[] {
  return CAMPOS_CITADOS.filter((campo) =>
    Object.prototype.hasOwnProperty.call(cuerpo, campo),
  );
}

/**
 * El cuerpo de `PUT /api/arancel/{id}`, revisado.
 *
 * Tres decisiones que vale dejar escritas:
 *
 *  - **La cita manda sobre el importe.** Un cuerpo con `montoOficial` y un
 *    `monto` negativo contesta `citado` y no `invalido`: si contestara por el
 *    importe, quien lo mandó arreglaría el número y volvería a intentar
 *    creyendo que así entra.
 *  - **Ausente y nulo son lo mismo, y los dos son «sin precio propio»**, que
 *    no es cero. Un cero es una decisión del bufete —«esto no lo cobramos»— y
 *    un nulo es la falta de decisión, que es lo que hace que la pantalla
 *    muestre la sugerencia del acuerdo como valor de arranque.
 *  - **Un monto que llega como texto es una falla y no un `Number(valor)`.**
 *    Convertir en silencio es cómo entra un cero: `Number("")` es 0 y
 *    `Number("1,200")` es NaN. Lo que manda otra cosa es la pantalla, y hay
 *    que verlo.
 */
export function revisarMonto(cuerpo: unknown): RevisionDeMonto {
  if (!esObjeto(cuerpo)) {
    return {
      estado: "invalido",
      fallas: [{ campo: "monto", motivo: "tipo_invalido" }],
    };
  }

  const citados = citadosEn(cuerpo);
  if (citados.length > 0) return { estado: "citado", campos: citados };

  const crudo = cuerpo.monto;
  if (crudo === undefined || crudo === null) {
    return { estado: "ok", monto: null };
  }

  // Centavos enteros, jamás coma flotante. `Number.isInteger` cubre de una
  // vez el no-número, el NaN, el infinito y los centavos partidos.
  if (!Number.isInteger(crudo) || (crudo as number) < 0) {
    return {
      estado: "invalido",
      fallas: [{ campo: "monto", motivo: "monto_invalido" }],
    };
  }

  return { estado: "ok", monto: crudo as number };
}

/**
 * Si una clase de renglón admite precio del bufete.
 *
 * El `rubro` no, y son **74**: los encabezados que el acuerdo imprime sin
 * ningún valor porque solo agrupan a sus hijos —«3. Inmigrantes», «12.
 * Recursos Administrativos»—. Ofrecerle al abogado un campo de monto sobre un
 * título es ofrecerle escribir un dato que no significa nada, y la fila con
 * ese dato escrito es una suma mal hecha esperando a que alguien la haga.
 *
 * El `regla` **sí**, y eso es lo que la tajada pide con todas las letras: las
 * 97 reglas por cuantía se guardan como texto y «el bufete escribe su propio
 * monto al lado si quiere». Prohibirlo dejaría 97 servicios sin ninguna forma
 * de tener precio propio, que es lo contrario del motivo de la tabla.
 */
export function puedeLlevarPrecio(clase: ClaseDeRenglonDelArancel): boolean {
  return clase !== "rubro";
}

/**
 * La categoría de la nota siguiente que **sí** tiene renglones, a partir de
 * la última nota de `prosa`.
 *
 * Devuelve `null` cuando no hay ninguna después.
 */
function anclaDespuesDe(
  notas: NotaDelArancel[],
  prosa: string,
  conRenglones: ReadonlySet<string>,
): string | null {
  let ultima = -1;
  notas.forEach((nota, indice) => {
    if (nota.categoria === prosa) ultima = indice;
  });

  for (const nota of notas.slice(ultima + 1)) {
    if (conRenglones.has(nota.categoria)) return nota.categoria;
  }

  return null;
}

/**
 * La tabla agrupada por categoría, en el orden del documento.
 *
 * Se agrupa en el servidor y no en la pantalla porque el orden de las
 * categorías **es un dato del acuerdo**, y dos pantallas que lo reconstruyan
 * por su cuenta son dos pantallas que algún día lo reconstruyen distinto.
 *
 * `renglones` llega ya ordenado por `orden`, que es el orden del papel, y de
 * ahí sale el orden de las categorías: la primera vez que cada una aparece.
 * Una categoría que el acuerdo retoma más abajo **no abre un grupo nuevo**:
 * se vería dos veces en la tabla y el buscador de T-3 la encontraría partida.
 *
 * ## Las dos secciones que son solo prosa, y cómo se ubican
 *
 * «OTROS ASUNTOS» y «PROCESO DE SEPARACIONES DE BIENES…» no tienen ni un
 * renglón tarifado: el acuerdo las imprime como una frase. Si el orden
 * saliera solo de los renglones, desaparecerían sin que nadie lo note.
 *
 * Entran por sus notas, y su posición sale de una regla: **una categoría de
 * pura prosa va inmediatamente antes de la siguiente categoría que las notas
 * nombren y que sí tenga renglones**; si no hay ninguna después, va al final.
 *
 * Lo que esa regla supone, dicho en vez de callado: que entre la sección de
 * prosa y esa categoría siguiente no haya otra categoría *sin* notas, porque
 * de ésas la secuencia de notas no sabe nada. Para las dos reales se verificó
 * contra el volcado del PDF y las dos quedan en su sitio —«OTROS ASUNTOS» cae
 * entre `ASUNTOS ANTE EL MINISTERIO DE VIVIENDA` y `ASUNTOS DE DERECHO
 * PROCESAL (CIVIL-COMERCIAL)`, y «PROCESO DE SEPARACIONES…» entre `MENORES` y
 * `PROCESOS ESPECIALES SOBRE`—. Si una extracción futura agrega notas a otras
 * categorías, esto se vuelve a medir; la salida definitiva es que la
 * extracción registre la posición de cada nota, y queda anotada como deuda en
 * `odd/tasks/arancel-de-honorarios.md`.
 */
export function agruparPorCategoria(
  renglones: RenglonDelArancel[],
  notas: NotaDelArancel[],
): CategoriaDelArancel[] {
  const orden: string[] = [];
  for (const renglon of renglones) {
    if (!orden.includes(renglon.categoria)) orden.push(renglon.categoria);
  }

  const conRenglones = new Set(orden);

  const soloProsa: string[] = [];
  for (const nota of notas) {
    if (!conRenglones.has(nota.categoria) && !soloProsa.includes(nota.categoria)) {
      soloProsa.push(nota.categoria);
    }
  }

  for (const prosa of soloProsa) {
    const ancla = anclaDespuesDe(notas, prosa, conRenglones);
    const posicion = ancla === null ? -1 : orden.indexOf(ancla);

    if (posicion < 0) orden.push(prosa);
    else orden.splice(posicion, 0, prosa);
  }

  return orden.map((nombre) => ({
    nombre,
    renglones: renglones.filter((renglon) => renglon.categoria === nombre),
    notas: notas.filter((nota) => nota.categoria === nombre),
  }));
}
