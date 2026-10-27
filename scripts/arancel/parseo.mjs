/**
 * El parseo del Acuerdo No 49 de 2001 —la Tarifa de Honorarios Profesionales
 * Mínimos de los Abogados en la República de Panamá— a renglones de datos.
 *
 * Esto es la parte **pura**: entra el volcado de texto del PDF y salen
 * registros. La cáscara de entrada/salida —correr `pdftotext`, escribir el
 * JSON— vive en `extraer.mjs`. La separación no es ornamental: el parseo es
 * lo único que tiene decisiones discutibles, y las decisiones discutibles se
 * prueban. `test/arancel-api.spec.ts` ejerce este módulo sin PDF.
 *
 * ## Lo que el documento es, y por qué cuesta
 *
 * El PDF es una tabla de dos columnas maquetada a mano en 2001: a la
 * izquierda el concepto, a la derecha el monto. `pdftotext -layout` conserva
 * las columnas como posiciones de caracteres, así que la columna del monto se
 * puede recuperar; lo que no conserva es ninguna estructura. De ahí que casi
 * todo acá sea geometría de texto: en qué columna empieza el valor, qué
 * fragmento de línea es concepto y qué fragmento es valor, y cuándo una línea
 * es la continuación de la anterior.
 *
 * Y el documento, además, está mal escrito en varios renglones: montos con
 * punto de miles, montos con `B/,`, montos partidos en dos líneas, «horarios»
 * por «honorarios», «11/2» por 1½%. **Nada de eso se corrige acá.** El
 * criterio de la tajada es que lo que dice el papel se transcribe como está y
 * la lectura se anota aparte, en `lecturas.md`. Parsear `B/.2.000.00` como
 * dos mil balboas no es corregir: es leer el número que está impreso con el
 * punto usado de separador de miles, que es lo que ese renglón dice.
 */

// ---------------------------------------------------------------------------
// El sigilo del balboa
// ---------------------------------------------------------------------------
//
// El documento escribe el balboa de cinco formas distintas, todas presentes y
// todas medidas en el volcado: `B/.500.00`, `B/. 750.00` (con espacio),
// `B/,2,000.00` (coma en vez de punto), `B/350.00` (sin nada) y `B/.` solo,
// con el número en la línea siguiente. Un sigilo que no acepte las cinco deja
// renglones afuera en silencio, que es el único resultado inaceptable.
const SIGILO = String.raw`B\s*\/\s*[.,]?`;
const SIGILO_GLOBAL = new RegExp(SIGILO, "g");

/**
 * Un valor que es **solo** un monto: el sigilo, los dígitos con sus
 * separadores, y nada más que un punto o una coma de cierre.
 *
 * El «y nada más» es deliberado y es la frontera entre `montoOficial` y
 * `reglaOficial`. `B/.150.00 p/h` lleva un monto legible, pero es por hora:
 * guardarlo como monto fijo escondería la unidad, y una tarifa por hora
 * sembrada como precio cerrado es un error que nadie descubre hasta que sale
 * en una cotización. Lo mismo con `B/.250.00 más el 25%`, `B/.500.00 salvo
 * convenio` o `B/.300.00 a B/,3,000.00`. Todos esos van completos al texto de
 * la regla, sin monto, igual que los porcentajes.
 */
const MONTO_SOLO = new RegExp(String.raw`^${SIGILO}\s*\d[\d.,\s]*\d\s*[.,]?$`);

/**
 * Lo que puede **empezar** un valor en la columna derecha.
 *
 * Sirve para decidir dónde parte una línea entre concepto y valor, así que
 * tiene que reconocer las formas que de hecho encabezan esa columna: un monto
 * (`B/…`), un porcentaje o cifra suelta (`25%`, `1,000.00 más`, `3.5%`), un
 * «según convenio», un «tarifa plena» y un «el 25%».
 */
const EMPIEZA_VALOR = new RegExp(
  String.raw`^(?:${SIGILO}|seg[úu]n\b|tarifa\s+plena|el\s+\d|\d)`,
  "i",
);

// ---------------------------------------------------------------------------
// El numeral impreso
// ---------------------------------------------------------------------------
//
// Las formas que el documento usa, todas medidas: `1.`, `10.`, `3` (sin
// punto), `a)`, `a).`, `d),`, `g) )`, `b.1`, `a.1.`. La letra **exige** o un
// subnúmero propio —`b.1`— o un separador —`a)`—, y nunca va sola, porque si
// se aceptara una letra suelta cualquier renglón de texto corrido que empiece
// con «o de advertencias…» o «y por cada prórroga» se leería como un numeral
// nuevo. Las medidas en cambio sí pueden ir sin separador, y se limitan a dos
// cifras para que `150.00`, `3.5%` o `0.0085%` —que viven en la columna
// derecha— no pasen por numeral.
const NUMERAL =
  /^(\s*)(?:(\d{1,2})|([a-záéíóúñ]))((?:\.\d{1,2})?)(?:\s*([.),]{1,2}))?(?=\s)/i;

/**
 * Las líneas de prosa que no son renglones de tarifa: parágrafos, notas,
 * artículos y el asterisco de pie. Llevan provisiones que importan —el
 * PARÁGRAFO de migración carga B/.200.00 por dependiente— y por eso se
 * guardan en `notas`, pero no son filas de la tabla y meterlas como filas
 * inflaría el conteo de control con renglones que no existen.
 */
const PROSA = /^(?:PAR[ÁA]GRAFO|Par[áa]grafo|NOTA|Nota|ART[IÍ]CULO|\*|\(Los\b)/;

/**
 * Un valor que quedó a medias al final de su línea: el conector o el sigilo
 * suelto con los que el documento parte un valor en dos renglones.
 */
const VALOR_COLGANDO = new RegExp(
  String.raw`(?:\s(?:y|o|ó|m[áa]s|a|de|con)|${SIGILO})\s*$`,
  "i",
);

/** Tolerancia, en columnas, para decidir si un fragmento cae en la columna del valor. */
const TOLERANCIA_COLUMNA = 6;

/**
 * Tolerancia, en columnas, para decidir si dos numerales están al mismo
 * nivel de anidamiento. El documento no indenta parejo —dentro de RECURSOS
 * EXTRAORDINARIOS hay hermanos en la columna 2 y en la 3— así que una
 * comparación exacta los leería como padre e hijo.
 */
const TOLERANCIA_NIVEL = 1;

// ---------------------------------------------------------------------------
// Montos
// ---------------------------------------------------------------------------

/**
 * Si un texto de valor es un monto fijo y nada más.
 */
export function esMontoPlano(texto) {
  return MONTO_SOLO.test(String(texto).trim());
}

/**
 * El monto de un valor, en **centavos enteros**, o `null` si el valor no es
 * un monto fijo.
 *
 * ## La regla de desambiguación, que es el corazón de todo esto
 *
 * El documento usa el punto y la coma como separador de miles de forma
 * intercambiable, a veces en el mismo número: están medidos `B/.1,500.00`,
 * `B/.2.000.00`, `B/,2,000.00`, `B/.250.001.00` y `B/.2,000.000.00`. No hay
 * forma de saber por el separador qué es qué, así que mirar el separador es
 * el camino equivocado. La regla es **posicional**:
 *
 *   El último grupo de dígitos, si tiene exactamente dos cifras y no es el
 *   único grupo, son los centavos. Todos los grupos anteriores se concatenan
 *   y forman los balboas, sin importar si el separador que los dividía era
 *   un punto o una coma.
 *
 * Por qué se sostiene: el documento escribe **todos** sus montos con dos
 * decimales, y ningún grupo de miles tiene dos cifras (los miles van de tres
 * en tres). O sea que un grupo final de dos cifras solo puede ser centavos, y
 * un grupo final de tres solo puede ser miles. Verificado sobre las formas
 * del documento:
 *
 *   `B/.2.000.00`     → [2, 000, 00]    → 2000.00  → 200000 centavos
 *   `B/.1,500.00`     → [1, 500, 00]    → 1500.00  → 150000 centavos
 *   `B/,10,000.00`    → [10, 000, 00]   → 10000.00 → 1000000 centavos
 *   `B/.250.001.00`   → [250, 001, 00]  → 250001.00
 *   `B/.2,000.000.00` → [2, 000, 000, 00] → 2000000.00
 *   `B/350.00`        → [350, 00]       → 350.00
 *   `B/.200 00`       → [200, 00]       → 200.00   (el espacio es una errata)
 *   `B/.0.01`         → [0, 01]         → 0.01
 *
 * Y el caso límite que la regla cubre sin decir nada: un monto sin decimales
 * —`B/.1,000`— cae en [1, 000], último grupo de tres cifras, o sea mil, no
 * uno con cero centavos.
 *
 * Centavos enteros, nunca coma flotante: es la misma regla que sostiene
 * `cotizacion_linea.monto` con su `CHECK (typeof(monto) = 'integer')`, y acá
 * nace el dato que mañana entra ahí.
 */
export function montoEnCentavos(texto) {
  if (!esMontoPlano(texto)) return null;

  const grupos = String(texto).replace(SIGILO_GLOBAL, " ").match(/\d+/g);
  if (grupos === null) return null;

  const ultimo = grupos[grupos.length - 1];
  const hayCentavos = grupos.length > 1 && ultimo.length === 2;
  const balboas = hayCentavos ? grupos.slice(0, -1).join("") : grupos.join("");
  const centavos = hayCentavos ? ultimo : "00";

  return Number(balboas) * 100 + Number(centavos);
}

// ---------------------------------------------------------------------------
// Geometría de la línea
// ---------------------------------------------------------------------------

/**
 * Los campos de una línea: los trozos de texto separados por dos o más
 * espacios, con la columna en la que empieza cada uno.
 *
 * Dos espacios es el umbral porque `pdftotext -layout` reproduce el espacio
 * entre columnas con espacios, y un espacio suelto siempre es separación de
 * palabras.
 */
export function camposDeLinea(linea) {
  const campos = [];
  const patron = /\S(?:.*?\S)?(?=\s{2,}|$)/g;

  for (const hallazgo of linea.matchAll(patron)) {
    campos.push({ columna: hallazgo.index, texto: hallazgo[0] });
  }

  return campos;
}

/**
 * Parte el resto de una línea —lo que queda después del numeral— en concepto
 * y valor.
 *
 * ## Por qué se busca de derecha a izquierda
 *
 * Varios renglones nombran montos **dentro** del concepto, porque el concepto
 * es un tramo de cuantía: «De cuantía inferior a B/.10,000.00 → 10% sobre el
 * valor» o «De B/.0.01 hasta B/.3,000.00 → B/.200.00». Si se tomara el primer
 * monto de la línea, el tramo se leería como el precio. El valor es el campo
 * de más a la derecha que **empieza** una expresión de valor, y de ahí al
 * final de la línea.
 *
 * Encontrado el campo de más a la derecha, el corte se **estira hacia la
 * izquierda** mientras el campo anterior también empiece un valor. Hace falta
 * porque el documento parte sus montos entre campos: «B/.    1,000.00   ó»
 * son tres campos y el valor son los tres, no el último.
 *
 * ## Y por qué hay un segundo intento dentro del último campo
 *
 * Cuando el concepto es largo, la maqueta de 2001 lo deja pegado a la columna
 * del monto con un solo espacio: «…de Fábrica, de Comercio. De B/.500.00». Ahí
 * no hay dos espacios que partir, así que se busca un valor al final del
 * último campo. La condición de que el valor **termine la línea** es la que
 * separa ese caso de la prosa de ESTUDIOS DE TÍTULOS, donde los montos están
 * en medio de la oración —«…no sea mayor de B/.10,000.00 un horarios
 * convencional…»— y cortar ahí partiría la oración al medio inventando un
 * precio que el documento no cotiza en ninguna columna.
 *
 * @param columnaConocida columna del valor ya observada en esta categoría, si
 *   se conoce. Rescata las líneas justificadas, donde el documento separó las
 *   palabras del concepto con varios espacios y pegó el porcentaje a la
 *   última palabra: «…de Derechos Laborales 15% de lo».
 */
export function partirValor(resto, columnaConocida = null) {
  const campos = camposDeLinea(resto);

  for (let i = campos.length - 1; i >= 0; i -= 1) {
    if (!EMPIEZA_VALOR.test(campos[i].texto)) continue;

    let inicio = i;
    while (inicio > 0 && EMPIEZA_VALOR.test(campos[inicio - 1].texto)) {
      inicio -= 1;
    }

    return {
      concepto: campos
        .slice(0, inicio)
        .map((campo) => campo.texto)
        .join(" "),
      valor: campos
        .slice(inicio)
        .map((campo) => campo.texto)
        .join(" "),
      columna: campos[inicio].columna,
    };
  }

  const alFinal = cortarAlFinalDeLaLinea(campos);
  if (alFinal !== null) return alFinal;

  if (columnaConocida !== null) {
    const enColumna = cortarEnColumna(resto, columnaConocida);
    if (enColumna !== null) return enColumna;
  }

  return { concepto: resto.trim(), valor: "", columna: null };
}

/**
 * Busca un valor que cierre la línea dentro del último campo: un monto suelto
 * o un «según convenio». Solo cuenta si de ahí al final no queda nada más,
 * porque esa es la firma de la columna derecha pegada al concepto.
 */
function cortarAlFinalDeLaLinea(campos) {
  const ultimo = campos[campos.length - 1];
  if (ultimo === undefined) return null;

  const candidatos = [...ultimo.texto.matchAll(/B\s*\/|seg[úu]n\s+convenio/gi)];

  for (let i = candidatos.length - 1; i >= 0; i -= 1) {
    const corte = candidatos[i].index;
    if (corte === 0) continue;

    const cola = ultimo.texto.slice(corte).trim();
    if (!esMontoPlano(cola) && !/^seg[úu]n\s+convenio[.,]?$/i.test(cola)) {
      continue;
    }

    return {
      concepto: campos
        .slice(0, -1)
        .map((campo) => campo.texto)
        .join(" ")
        .concat(" ", ultimo.texto.slice(0, corte))
        .trim(),
      valor: cola,
      columna: ultimo.columna + corte,
      pegadoAlConcepto: true,
    };
  }

  return null;
}

/**
 * Corta una línea en la columna del valor ya conocida, pero solo si ahí
 * empieza de verdad una expresión de valor. Sin esa comprobación, cortar por
 * columna partiría palabras del concepto al medio.
 */
function cortarEnColumna(resto, columnaConocida) {
  for (const hallazgo of resto.matchAll(/\S+/g)) {
    const cerca =
      Math.abs(hallazgo.index - columnaConocida) <= TOLERANCIA_COLUMNA;
    if (!cerca) continue;
    if (!EMPIEZA_VALOR.test(resto.slice(hallazgo.index))) continue;

    return {
      concepto: resto.slice(0, hallazgo.index).trim(),
      valor: resto.slice(hallazgo.index).trim(),
      columna: hallazgo.index,
    };
  }

  return null;
}

/**
 * Si una línea es un encabezado de categoría.
 *
 * El documento no marca las secciones de ninguna forma legible por máquina:
 * lo único que las distingue es que van en mayúsculas y centradas. Por eso la
 * prueba es «no tiene ni una minúscula», más las exclusiones que hacen falta
 * para que un renglón de tarifa en mayúsculas —`1. PROCESO EJECUTIVO`— o un
 * artículo no pasen por encabezado.
 */
export function esEncabezadoDeCategoria(linea) {
  const texto = linea.trim();

  if (texto === "") return false;
  if (!/[A-ZÁÉÍÓÚÑ]/.test(texto)) return false;
  if (/[a-záéíóúñ]/.test(texto)) return false;
  if (/B\s*\//.test(texto)) return false;
  if (PROSA.test(texto)) return false;
  if (numeralDeLinea(linea) !== null) return false;

  return true;
}

/**
 * El numeral impreso al principio de una línea, con su columna y el resto de
 * la línea, o `null` si la línea no empieza con numeral.
 */
export function numeralDeLinea(linea) {
  const hallazgo = NUMERAL.exec(linea);
  if (hallazgo === null) return null;

  const [completo, sangria, medida, letra, sub, separador] = hallazgo;
  const esLetra = letra !== undefined;

  // Una letra sin subnúmero ni separador es una palabra, no un numeral.
  if (esLetra && sub === "" && separador === undefined) return null;

  return {
    token: `${medida ?? letra}${sub}`,
    // Un numeral con punto propio —`b.1`, `a.2`— ya viene jerarquizado desde
    // el papel y se guarda tal cual; uno suelto hereda el prefijo del padre.
    anidado: sub !== "",
    esLetra,
    columna: sangria.length,
    resto: linea.slice(completo.length),
  };
}

/**
 * Une los fragmentos de un texto partido por la maqueta: colapsa espacios y
 * pega las palabras cortadas con guion al final de línea —`organización no-`
 * + `gubernamental`— sin meterles un espacio.
 */
export function unirFragmentos(fragmentos) {
  let texto = "";

  for (const fragmento of fragmentos) {
    const limpio = fragmento.replace(/\s+/g, " ").trim();
    if (limpio === "") continue;
    if (texto === "") {
      texto = limpio;
      continue;
    }
    texto = texto.endsWith("-") ? `${texto}${limpio}` : `${texto} ${limpio}`;
  }

  return texto;
}

// ---------------------------------------------------------------------------
// La extracción completa
// ---------------------------------------------------------------------------

/** Dónde empieza y dónde termina la tarifa dentro del acuerdo. */
const ABRE_TARIFA = /ARTICULO\s*4/;
const CIERRA_TARIFA = /ART[IÍ]CULO\s*5/;

/**
 * Recorre el volcado y devuelve los renglones del arancel.
 *
 * El recorrido es de una sola pasada por categoría, con una pila de
 * anidamiento para armar el numeral y una memoria de la columna del valor
 * para repartir las líneas de continuación. Nada se descarta en silencio: la
 * línea que no encaja en ninguna forma conocida sale en `sinClasificar`.
 */
export function extraerArancel(textoCrudo) {
  const lineas = recortarAlaTarifa(textoCrudo);

  const registros = [];
  const notas = [];
  const sinClasificar = [];

  let categoria = null;
  let encabezadoAbierto = false;
  let fragmentosDeEncabezado = [];
  let actual = null;
  let ultimaFueNota = false;
  let pila = [];
  let columnaDeLaCategoria = null;

  const cerrarEncabezado = () => {
    if (!encabezadoAbierto) return;
    categoria = normalizarCategoria(fragmentosDeEncabezado);
    fragmentosDeEncabezado = [];
    encabezadoAbierto = false;
    actual = null;
    pila = [];
    columnaDeLaCategoria = null;
  };

  const abrirRegistro = (concepto, valor, numeral, columnaNumeral) => {
    actual = {
      categoria: categoria ?? "",
      numeral,
      fragmentosConcepto: [concepto],
      fragmentosValor: [valor],
      columnaValor: null,
      columnaNumeral,
    };
    registros.push(actual);
    return actual;
  };

  for (const { numero, linea } of lineas) {
    if (linea.trim() === "") continue;

    if (esEncabezadoDeCategoria(linea)) {
      if (!encabezadoAbierto) fragmentosDeEncabezado = [];
      fragmentosDeEncabezado.push(linea);
      encabezadoAbierto = true;
      ultimaFueNota = false;
      continue;
    }
    cerrarEncabezado();

    if (PROSA.test(linea.trim())) {
      notas.push({ categoria: categoria ?? "", texto: linea.trim() });
      ultimaFueNota = true;
      continue;
    }

    const numeral = numeralDeLinea(linea);

    if (numeral !== null) {
      // `partirValor` trabaja en coordenadas del resto de la línea, así que
      // la columna conocida —que está en coordenadas de la línea completa—
      // se traslada restándole el prefijo que el numeral ocupó.
      const prefijo = linea.length - numeral.resto.length;
      const partido = partirValor(
        numeral.resto,
        columnaDeLaCategoria === null ? null : columnaDeLaCategoria - prefijo,
      );
      const registro = abrirRegistro(
        partido.concepto,
        partido.valor,
        numeralJerarquico(pila, numeral, registros),
        numeral.columna,
      );
      registro.columnaValor =
        partido.columna === null ? null : partido.columna + prefijo;
      registro.pegadoAlConcepto = partido.pegadoAlConcepto === true;
      if (registro.columnaValor !== null) {
        columnaDeLaCategoria = registro.columnaValor;
      }
      apilar(pila, numeral, registro.numeral);
      ultimaFueNota = false;
      continue;
    }

    if (actual === null) {
      notas.push({ categoria: categoria ?? "", texto: linea.trim() });
      ultimaFueNota = true;
      continue;
    }

    const reparto = repartirContinuacion(linea, actual, columnaDeLaCategoria);

    // Un renglón sin numeral pero con concepto propio y monto propio es una
    // fila que el documento imprimió sin numerar: «y por cada prórroga
    // B/.300.00» bajo el 1 de migración, «Elaboración» y «Revisión» bajo los
    // contratos administrativos. Son tarifas distintas y se pierden si se
    // pegan al renglón de arriba, así que nacen como registro propio y
    // heredan el numeral del padre, que es el único que el papel imprime.
    //
    // Salvo que el valor del renglón abierto venga colgando: un valor que
    // termina en «y», en «ó» o en el sigilo solo —«B/.250.00 y», «B/.
    // 1,000.00 ó», «B/.»— sigue abajo, y entonces lo de esta línea es su
    // continuación y no una fila nueva.
    const colgando = VALOR_COLGANDO.test(actual.fragmentosValor.join(" "));

    if (!colgando && reparto.concepto !== "" && EMPIEZA_VALOR.test(reparto.valor)) {
      const registro = abrirRegistro(
        reparto.concepto,
        reparto.valor,
        actual.numeral,
        actual.columnaNumeral,
      );
      registro.columnaValor = reparto.columnaValor;
      ultimaFueNota = false;
      continue;
    }

    // Prosa que cuelga de la sección y no del renglón: va a la misma altura
    // que el numeral o más a la izquierda, no trae valor, y por eso no puede
    // ser el envoltorio de un concepto —esos van siempre más indentados—.
    const esProsaDeSeccion =
      reparto.valor === "" &&
      (ultimaFueNota ||
        (actual.fragmentosValor.join("") !== "" &&
          leadingEspacios(linea) <= actual.columnaNumeral));

    if (esProsaDeSeccion) {
      notas.push({ categoria: categoria ?? "", texto: linea.trim() });
      ultimaFueNota = true;
      continue;
    }

    if (reparto.concepto === "" && reparto.valor === "") {
      sinClasificar.push({ linea: numero, texto: linea });
      continue;
    }

    if (reparto.concepto !== "") actual.fragmentosConcepto.push(reparto.concepto);
    if (reparto.valor !== "") actual.fragmentosValor.push(reparto.valor);
    ultimaFueNota = false;
  }
  cerrarEncabezado();

  return { registros: terminarRegistros(registros), notas, sinClasificar };
}

/** Las líneas del acuerdo que están dentro de la tarifa, numeradas. */
function recortarAlaTarifa(textoCrudo) {
  const todas = textoCrudo.split("\n");
  const desde = todas.findIndex((linea) => ABRE_TARIFA.test(linea));
  const hasta = todas.findIndex((linea) => CIERRA_TARIFA.test(linea));

  if (desde === -1 || hasta === -1 || hasta <= desde) {
    throw new Error(
      "El volcado no contiene el ARTICULO 4 y el ARTÍCULO 5 que delimitan la " +
        "tarifa. O el PDF no es el Acuerdo No 49, o `pdftotext` cambió de " +
        "salida: no se extrae nada a medias.",
    );
  }

  return todas
    .slice(desde + 1, hasta)
    .map((linea, i) => ({ numero: desde + 2 + i, linea }));
}

/** Los espacios con los que abre una línea. */
function leadingEspacios(linea) {
  return linea.length - linea.trimStart().length;
}

/**
 * Reparte una línea de continuación entre el concepto y el valor del renglón
 * abierto, usando la columna del valor como frontera.
 */
function repartirContinuacion(linea, actual, columnaDeLaCategoria) {
  const frontera = actual.columnaValor ?? columnaDeLaCategoria;
  const campos = camposDeLinea(linea);

  if (frontera === null) {
    return {
      concepto: campos.map((campo) => campo.texto).join(" "),
      valor: "",
      columnaValor: null,
    };
  }

  const izquierda = [];
  const derecha = [];
  let columnaValor = null;

  for (const campo of campos) {
    if (campo.columna >= frontera - TOLERANCIA_COLUMNA) {
      derecha.push(campo.texto);
      columnaValor ??= campo.columna;
    } else {
      izquierda.push(campo.texto);
    }
  }

  return {
    concepto: izquierda.join(" "),
    valor: derecha.join(" "),
    columnaValor,
  };
}

/**
 * El numeral de un renglón, compuesto con el de su padre.
 *
 * Un numeral que el papel ya imprime con punto —`b.1`, `a.2`— se guarda tal
 * cual, porque el documento ya lo jerarquizó. Una letra suelta —`a)` bajo el
 * 3— se compone con la medida del padre y da `3.a`, que es como se lee el
 * documento en voz alta. Y una medida anidada —el `1.` dentro de `2. PROCESO
 * ORDINARIO`— se compone igual y da `2.1`, porque si no colisionaría con el
 * `1.` de primer nivel de la misma sección.
 */
function numeralJerarquico(pila, numeral, registros) {
  if (numeral.anidado) return numeral.token;

  const padre = padreDe(pila, numeral, registros);
  return padre === null ? numeral.token : `${padre}.${numeral.token}`;
}

function padreDe(pila, numeral, registros) {
  while (pila.length > 0 && esHermanoOMasProfundo(pila[pila.length - 1], numeral)) {
    pila.pop();
  }

  if (pila.length > 0) return pila[pila.length - 1].numeral;

  // Una letra siempre es hija de una medida: si la indentación del volcado no
  // alcanzó a mostrarlo —pasa en la sección de minutas, donde las letras
  // quedaron a la izquierda de su propio padre— se busca la última medida de
  // la categoría.
  if (!numeral.esLetra) return null;

  for (let i = registros.length - 1; i >= 0; i -= 1) {
    if (/^\d+$/.test(registros[i].numeral)) return registros[i].numeral;
  }

  return null;
}

/**
 * Si el tope de la pila está al mismo nivel que el numeral entrante o más
 * profundo, o sea si hay que sacarlo antes de buscarle padre.
 *
 * La comparación de columnas, con su tolerancia, es la regla general. La
 * segunda mitad existe porque el documento **nunca** anida una letra dentro
 * de otra letra —el tercer nivel lo escribe `b.1`, no `b.a`— y la indentación
 * del volcado no siempre lo refleja: en el recurso de casación, `a).` quedó
 * en la columna 9 y su hermano `b).` en la 11, que leído por columnas haría
 * de `b` un hijo de `a`.
 */
function esHermanoOMasProfundo(tope, numeral) {
  if (tope.columna >= numeral.columna - TOLERANCIA_NIVEL) return true;
  return tope.esLetra && numeral.esLetra;
}

function apilar(pila, numeral, compuesto) {
  pila.push({
    columna: numeral.columna,
    esLetra: numeral.esLetra,
    numeral: compuesto,
  });
}

/**
 * La categoría, con sus líneas unidas y la puntuación de cierre afuera.
 *
 * La limpieza es por fragmento y no solo al final porque la categoría de
 * migración viene en dos líneas y los dos puntos quedan en medio:
 * `ASUNTOS ADMINISTRATIVOS:` más `(MIGRACIÓN)`.
 */
export function normalizarCategoria(fragmentos) {
  const limpios = fragmentos.map((fragmento) =>
    fragmento.replace(/\s*[:.;]\s*$/, ""),
  );

  return unirFragmentos(limpios);
}

/**
 * Cierra los registros: une los fragmentos, clasifica y numera el orden del
 * documento.
 *
 * `clase` dice de qué forma es el renglón, y hace falta porque hay tres y no
 * dos: el monto fijo, la regla en texto, y el **rubro** —un numeral que el
 * documento imprime sin valor porque solo agrupa a sus hijos, como «3.
 * Inmigrantes» o «12. Recursos Administrativos»—. Sin esa tercera clase, un
 * rubro se vería igual que un renglón cuyo monto se perdió al parsear, y la
 * diferencia es justamente lo que el conteo de control tiene que poder ver.
 *
 * El último caso es el de ESTUDIOS DE TÍTULOS y los procesos especiales: ahí
 * el documento **no separa** el concepto de la tarifa, escribe las dos cosas
 * en una sola oración corrida —«un honorario convencional mayor de
 * B/.1,000.00 sin que exceda del 0.0085%»— y no hay columna derecha que
 * partir. Cuando un renglón sin columna nombra un monto, un porcentaje o un
 * «según convenio», la regla oficial es la oración completa tal como está
 * impresa, y el concepto queda igual, porque el papel no los distingue. Es
 * justo donde viven las erratas que la tajada manda transcribir sin tocar:
 * meterlas en `concepto` y dejar `reglaOficial` vacío las esconderÍa.
 */
function terminarRegistros(crudos) {
  return crudos.map((crudo, i) => {
    const devuelto = devolverMontoPegado(crudo);
    const concepto = unirFragmentos(devuelto.fragmentosConcepto);
    const valor = unirFragmentos(devuelto.fragmentosValor);
    const enLaOracion = valor === "" && TARIFA_EN_PROSA.test(concepto);
    const texto = enLaOracion ? concepto : valor;
    const montoOficial = montoEnCentavos(texto);

    return {
      categoria: crudo.categoria,
      numeral: crudo.numeral,
      concepto,
      clase: texto === "" ? "rubro" : montoOficial === null ? "regla" : "monto",
      montoOficial,
      reglaOficial: montoOficial === null && texto !== "" ? texto : null,
      orden: i + 1,
    };
  });
}

/**
 * Deshace el corte cuando el monto estaba pegado al concepto y el concepto
 * resultó ser, él mismo, una regla con porcentaje.
 *
 * El caso que lo motiva es el f) de ESTUDIOS DE TÍTULOS: «Para operaciones
 * cuyo valor sea superior de B/.250,000.00 sin pasar de B/.1,000.000.00 un
 * horario convencional mayor de B/.1,000.00 sin que exceda del 0.0075%». La
 * primera línea termina en `B/.1,000.000.00`, o sea en la posición donde en
 * cualquier otra sección estaría el monto, pero ahí es el techo del tramo y
 * la oración sigue abajo. Lo mismo con «Pago por consignación 20% de la
 * cuantía, con un mínimo de B/.300.00».
 *
 * La señal es el porcentaje: si lo que quedó como concepto tiene un `%`, el
 * renglón no cotiza un monto fijo, cotiza una regla, y el monto que se
 * extrajo era parte de la oración. Se devuelve al concepto y el renglón pasa
 * a ser regla con el texto completo, que es lo que el papel dice. Un tramo en
 * balboas sin porcentaje —«Con cuantía hasta B/.50.000.00 → B/.3,000.00»— no
 * entra acá, porque ahí sí hay dos cosas distintas.
 */
function devolverMontoPegado(crudo) {
  if (crudo.pegadoAlConcepto !== true) return crudo;

  const concepto = unirFragmentos(crudo.fragmentosConcepto);
  if (!/\d\s*%/.test(concepto)) return crudo;

  return {
    ...crudo,
    fragmentosConcepto: [
      crudo.fragmentosConcepto[0],
      crudo.fragmentosValor.join(" "),
      ...crudo.fragmentosConcepto.slice(1),
    ],
    fragmentosValor: [],
  };
}

/** Lo que delata una tarifa escrita dentro de la oración del concepto. */
const TARIFA_EN_PROSA = new RegExp(
  String.raw`${SIGILO}\s*\d|\d\s*%|seg[úu]n\s+convenio`,
  "i",
);

/**
 * El conteo de control: lo que hay que poder comparar contra el papel sin
 * abrir el JSON. Si esto no cuadra, la siembra de T-2 no se corre.
 */
export function contarArancel(registros) {
  const porCategoria = new Map();

  for (const registro of registros) {
    const cuenta = porCategoria.get(registro.categoria) ?? {
      total: 0,
      conMonto: 0,
      conRegla: 0,
      rubros: 0,
    };
    cuenta.total += 1;
    if (registro.clase === "monto") cuenta.conMonto += 1;
    if (registro.clase === "regla") cuenta.conRegla += 1;
    if (registro.clase === "rubro") cuenta.rubros += 1;
    porCategoria.set(registro.categoria, cuenta);
  }

  return {
    total: registros.length,
    conMonto: registros.filter((r) => r.clase === "monto").length,
    conRegla: registros.filter((r) => r.clase === "regla").length,
    rubros: registros.filter((r) => r.clase === "rubro").length,
    categorias: porCategoria.size,
    porCategoria: Object.fromEntries(porCategoria),
  };
}
