/**
 * El ruteo de la SPA, resuelto a mano y sin librería.
 *
 * T-4 lo dejó anotado: dos rutas sin parámetros no justifican traer un router
 * con su modelo de datos. T-5 agrega las primeras rutas con parámetro y la
 * respuesta sigue siendo la misma, pero ya no es gratis: un `switch` sobre
 * `location.pathname` con un identificador en el medio tiene modos de falla
 * reales —`/clientes/nuevo` cayendo en la rama del parámetro, la barra final,
 * el porcentaje mal escrito— y por eso esto es una función pura con pruebas y
 * no cuatro `if` sueltos dentro del componente.
 *
 * El módulo es deliberadamente **sin DOM**: no toca `window` ni `history`. Eso
 * vive en `src/navegacion.ts`. Así esto se prueba en el mismo runner que el
 * resto del proyecto, sin montar un navegador para comparar cadenas.
 */

/**
 * Las cuatro partes del detalle de un proceso.
 *
 * Vive acá y no en la carpeta de la pantalla porque es parte de la ruta:
 * `src/ruteo.ts` es el módulo que no depende de nadie, y la tira de pestañas
 * de la pantalla importa de acá y no al revés. Dar vuelta esa flecha haría
 * que el ruteo —que se prueba sin DOM— dependiera de un `.tsx`.
 */
export type PestanaDeProceso =
  | "trabajo"
  | "pendientes"
  | "dinero"
  | "historial";

export type Ruta =
  | { nombre: "inicio" }
  | { nombre: "banco-de-pruebas" }
  | { nombre: "clientes" }
  | { nombre: "cliente-nuevo" }
  | { nombre: "cliente"; id: string }
  | { nombre: "cliente-edicion"; id: string }
  | { nombre: "catalogos" }
  /**
   * Las dos pantallas del arancel de honorarios (T-3 de
   * `odd/tasks/arancel-de-honorarios.md`), y **son dos a propósito**.
   *
   * `precios` es donde el abogado trabaja: un precio por servicio, el del
   * bufete, editable. `arancel` es la cita —el Acuerdo No 49 de 2001
   * completo, de solo lectura— y es a donde lleva el enlace «de dónde sale
   * este precio».
   *
   * La separación es una corrección del usuario convertida en estructura.
   * La primera versión del diseño ponía las dos cifras lado a lado en una
   * sola pantalla: «así no se siente que el sistema juzga tus precios, sino
   * que el sistema sabe cuánto cuesta y te lo sugiere». Dos direcciones es
   * lo que hace imposible que el monto del acuerdo se cuele al lado del
   * precio propio, porque ya no están en la misma pantalla.
   *
   * Ninguna de las dos lleva parámetro. El renglón **no** es un segmento de
   * la ruta sino un fragmento (`#renglon-{id}`), y la diferencia es
   * deliberada: la tabla del arancel se muestra entera siempre —es un
   * documento, no una ficha— y el fragmento es lo que deja aterrizar en un
   * renglón sin inventar una segunda dirección para la misma pantalla. El
   * fragmento lo deletrea `anclaDelRenglon`, en
   * `src/pantallas/catalogos/precios.ts`, y el ruteo no lo conoce.
   */
  | { nombre: "precios" }
  | { nombre: "arancel" }
  /**
   * Los módulos de una cotización, configurables (T-2 de
   * `odd/tasks/plantillas-de-modulo.md`).
   *
   * Va bajo `/catalogos` y no en una raíz propia por el mismo criterio que
   * las dos del arancel: lo que se edita acá es un dato del bufete, como un
   * área o un tipo de proceso, y el menú ya ofrece `/catalogos`. El
   * invariante de `e2e/navegacion.spec.ts` compara la **raíz de sección**,
   * así que queda alcanzable desde el menú sin agregarle un ítem a una
   * navegación de siete.
   *
   * El segmento es `modulos` y no `plantillas`: en este sistema «plantilla»
   * ya está tomada por las etapas de un tipo de proceso, y
   * `/catalogos/plantillas` es la dirección que alguien leería al revés. El
   * nombre de la ruta sí es `plantillas-de-modulo`, porque ahí no hay
   * ambigüedad posible —lleva el sustantivo adentro— y es el que la hace
   * buscable junto al resto de la tajada.
   *
   * No lleva parámetro: los seis módulos se editan en la misma pantalla, que
   * es un catálogo corto y no una ficha por fila.
   */
  | { nombre: "plantillas-de-modulo" }
  | { nombre: "tipos-proceso" }
  | { nombre: "tipo-proceso-nuevo" }
  | { nombre: "tipo-proceso"; id: string }
  | { nombre: "procesos" }
  /**
   * El alta. `clienteId` no nulo es el alta abierta desde el detalle de ese
   * cliente, que llega con el cliente ya elegido: `/clientes/{id}/procesos/
   * nuevo`. Es un segmento de la ruta y no un parámetro de consulta para que
   * la resolución siga siendo una función total sobre el `pathname`, sin un
   * segundo canal del que acordarse.
   */
  | { nombre: "proceso-nuevo"; clienteId: string | null }
  /**
   * El detalle del proceso, con **la pestaña adentro de la ruta**.
   *
   * La pestaña no es estado local y la razón es lo que se pierde si lo
   * fuera: no se podría mandar el enlace a la parte de plata de un
   * expediente, recargar devolvería al principio y el botón de atrás no
   * volvería a la pestaña anterior.
   *
   * **«Trabajo» se escribe como un valor y no como una ausencia**, aunque
   * su dirección no lleve segmento. Si el valor por defecto fuera `null`,
   * cada lugar que lee la pestaña tendría que volver a decidir qué
   * significa esa ausencia —la tira que marca la activa, el armador que
   * despacha al panel, el que arma el enlace—, y tres decisiones del mismo
   * hecho son tres que pueden discrepar. Con el valor explícito, el único
   * que sabe que «trabajo» se escribe sin segmento es el par
   * `resolverRuta`/`enlaceDe`, que la prueba de ida y vuelta ata.
   *
   * Y por eso `/procesos/{id}/trabajo` cae en «desconocida», como cualquier
   * otro tercer segmento que no se reconoce: cada pantalla tiene **una**
   * dirección. Dos direcciones para lo mismo es la que alguien copia y la
   * que después nadie mantiene.
   */
  | { nombre: "proceso"; id: string; pestana: PestanaDeProceso }
  /**
   * Las cuatro pantallas de la cotización (tajada 2, T-2).
   *
   * El alta **no** lleva `clienteId`, al revés que la del proceso. No es un
   * olvido: ese parámetro existe allá porque el detalle del cliente tiene un
   * botón que abre el alta con el cliente ya elegido, y acá ese botón
   * todavía no está. Una ruta que nadie puede alcanzar es una rama de
   * `enlaceDe` que nadie ejerce, y se desincroniza sin que nadie lo note.
   *
   * No hay ruta de emitir, de módulos ni de líneas: son de T-4 y de la
   * unidad C. Lo que no existe tiene que caer en «desconocida» y no en una
   * pantalla en blanco.
   */
  | { nombre: "cotizaciones" }
  | { nombre: "cotizacion-nueva" }
  /**
   * El generador (T-9): el abogado describe el encargo en prosa y sale un
   * borrador.
   *
   * Es una pantalla aparte del alta a mano y no una pestaña suya, y la
   * razón es lo que pasa después de apretar: el alta devuelve en un
   * instante y el generador tarda, puede fallar de siete maneras y lo que
   * se tecleó tiene que sobrevivir a eso. Dos comportamientos tan distintos
   * en un solo componente son dos ramas que hay que recordar en cada
   * cambio.
   *
   * No lleva `clienteId`, por lo mismo que el alta: el botón que lo abriría
   * con el cliente ya elegido no existe, y una ruta que nadie puede
   * alcanzar es una rama de `enlaceDe` que nadie ejerce.
   */
  | { nombre: "cotizacion-generar" }
  | { nombre: "cotizacion"; id: string }
  | { nombre: "cotizacion-edicion"; id: string }
  /**
   * La salida imprimible (T-6): el documento congelado de una cotización,
   * sin controles y con su propia hoja de impresión.
   *
   * Lleva identificador y no es una pantalla aparte del detalle porque es
   * **otra cosa**: el detalle es la ficha de trabajo y lee las tablas
   * vivas; esto es el papel que se le mandó al cliente y lee el snapshot.
   * Con una sola dirección habría que elegir cuál de las dos muestra, y la
   * elegida sería la equivocada la mitad de las veces.
   */
  | { nombre: "cotizacion-hoja"; id: string }
  | { nombre: "desconocida"; ruta: string };

/** El segmento literal del alta. No puede ser el identificador de nadie. */
const NUEVO = "nuevo";
const EDITAR = "editar";

/**
 * El segmento de la salida imprimible (T-6). Va al lado de `EDITAR` porque
 * es el otro tercer segmento que una cotización tiene, y no puede ser el
 * identificador de nadie por lo mismo que aquél.
 */
const HOJA = "hoja";

/** La raíz de las pantallas de catálogo (T-6) y sus subsecciones. */
const CATALOGOS = "catalogos";
const TIPOS_PROCESO = "tipos-proceso";

/**
 * Las dos subsecciones del arancel (T-3 de
 * `odd/tasks/arancel-de-honorarios.md`).
 *
 * Van bajo `/catalogos` y no en una raíz propia porque un precio de servicio
 * es un dato del bufete como un área o un tipo de proceso, y porque el menú
 * ya ofrece `/catalogos`: el invariante de `e2e/navegacion.spec.ts` compara
 * la **raíz de sección**, así que las dos quedan alcanzables desde el menú
 * sin agregarle un sexto ítem a una navegación de siete.
 */
const PRECIOS = "precios";
const ARANCEL = "arancel";

/**
 * La subsección de las plantillas de módulo (T-2 de
 * `odd/tasks/plantillas-de-modulo.md`).
 *
 * `modulos` y no `plantillas`: «plantilla» ya nombra las etapas de un tipo de
 * proceso en este sistema, y una dirección ambigua es la que alguien lee al
 * revés. La API usa el nombre completo —`/api/plantillas-modulo`— porque ahí
 * convive con la colección de la bitácora y hace falta desambiguar; en la
 * barra de direcciones, bajo `/catalogos`, «módulos» ya no se confunde con
 * nada.
 */
const MODULOS = "modulos";

/** La raíz de las pantallas de proceso (T-7). */
const PROCESOS = "procesos";

/**
 * Las tres pestañas que llevan segmento propio.
 *
 * «Trabajo» no está en la lista, y ésa es toda la regla: es la que se abre
 * en `/procesos/{id}`, así que no tiene segmento que reconocer ni que
 * escribir.
 *
 * **La clave de la pestaña y su segmento son el mismo literal a
 * propósito.** Una tabla de ida y otra de vuelta serían dos tablas que hay
 * que acordarse de mantener iguales; con un solo literal, `enlaceDe` lo
 * escribe y `pestanaDe` lo reconoce sin que exista un lugar donde puedan
 * discrepar.
 */
const PESTANAS_CON_SEGMENTO = [
  "pendientes",
  "dinero",
  "historial",
] as const satisfies readonly PestanaDeProceso[];

/** El tercer segmento de un proceso, si es una pestaña y no cualquier cosa. */
function pestanaDe(segmento: string): PestanaDeProceso | null {
  return PESTANAS_CON_SEGMENTO.find((clave) => clave === segmento) ?? null;
}

/** La raíz de las pantallas de cotización (tajada 2, T-2). */
const COTIZACIONES = "cotizaciones";

/**
 * El segmento del generador (T-9). Va al lado de `NUEVO` porque ocupa su
 * misma posición y por el mismo motivo: no puede ser el identificador de
 * nadie. Es el mismo literal que reconoce `worker/cotizaciones/rutas.ts`.
 */
const GENERAR = "generar";

/**
 * Los segmentos de la ruta, sin la barra final.
 *
 * Los vacíos **no** se filtran: `/clientes//editar` tiene que ser una ruta
 * desconocida, no "el cliente de identificador vacío". Filtrarlos es el atajo
 * que convierte una URL rota en una pantalla que parece funcionar.
 */
function segmentosDe(pathname: string): string[] {
  const sinBarraFinal = pathname.replace(/\/+$/, "");
  return sinBarraFinal.split("/").slice(1);
}

function identificador(segmento: string): string | null {
  // `generar` está acá por lo mismo que `nuevo`: es un literal que ocupa la
  // posición del identificador, así que `/cotizaciones/generar/editar` tiene
  // que caer en «desconocida» y no en «la edición de la cotización llamada
  // generar».
  if (segmento === "" || segmento === NUEVO || segmento === GENERAR) {
    return null;
  }
  try {
    const valor = decodeURIComponent(segmento);
    return valor === "" ? null : valor;
  } catch {
    // `decodeURIComponent` tira con un porcentaje mal escrito ("%ZZ"), que es
    // lo que llega cuando alguien edita la barra de direcciones a mano.
    return null;
  }
}

/**
 * Las tres pantallas de catálogo. Se resuelven aparte y no con tres `if` más
 * dentro de `resolverRuta` porque el árbol de clientes ya ocupa esa función
 * entera, y dos árboles de profundidad tres en un solo cuerpo es donde un
 * `return` cae en la rama equivocada sin que se note.
 */
function resolverCatalogos(segmentos: string[], pathname: string): Ruta {
  const desconocida: Ruta = { nombre: "desconocida", ruta: pathname };

  if (segmentos.length === 1) return { nombre: "catalogos" };

  /*
   * Las dos del arancel se resuelven antes y solo con dos segmentos. Un
   * tercero tiene que caer en «desconocida»: el renglón viaja como
   * fragmento y no como segmento, así que `/catalogos/arancel/{id}` no es
   * una dirección de nada.
   */
  if (segmentos[1] === PRECIOS) {
    return segmentos.length === 2 ? { nombre: "precios" } : desconocida;
  }
  if (segmentos[1] === ARANCEL) {
    return segmentos.length === 2 ? { nombre: "arancel" } : desconocida;
  }
  /*
   * Los módulos, con el mismo corte: la pantalla edita los seis a la vez, así
   * que `/catalogos/modulos/{algo}` no es la dirección de nada.
   */
  if (segmentos[1] === MODULOS) {
    return segmentos.length === 2
      ? { nombre: "plantillas-de-modulo" }
      : desconocida;
  }

  if (segmentos[1] !== TIPOS_PROCESO) return desconocida;
  if (segmentos.length === 2) return { nombre: "tipos-proceso" };
  if (segmentos.length !== 3) return desconocida;
  if (segmentos[2] === NUEVO) return { nombre: "tipo-proceso-nuevo" };

  const id = identificador(segmentos[2]);
  return id === null ? desconocida : { nombre: "tipo-proceso", id };
}

/**
 * Las tres pantallas de proceso. Aparte, por la misma razón que las de
 * catálogo: un tercer árbol dentro de `resolverRuta` es donde un `return` cae
 * en la rama equivocada sin que se note.
 *
 * La rama de tres segmentos es la de las pestañas del detalle. Un segmento
 * que no es ninguna de ellas cae en «desconocida», que es el mismo criterio
 * con el que `/cotizaciones/{id}/modulos` no resuelve a una pantalla vacía:
 * lo que no existe tiene que decirse, no dibujarse en blanco.
 */
function resolverProcesos(segmentos: string[], pathname: string): Ruta {
  const desconocida: Ruta = { nombre: "desconocida", ruta: pathname };

  if (segmentos.length === 1) return { nombre: "procesos" };

  if (segmentos.length === 2) {
    if (segmentos[1] === NUEVO) {
      return { nombre: "proceso-nuevo", clienteId: null };
    }

    const id = identificador(segmentos[1]);
    return id === null
      ? desconocida
      : { nombre: "proceso", id, pestana: "trabajo" };
  }

  if (segmentos.length === 3) {
    const id = identificador(segmentos[1]);
    if (id === null) return desconocida;

    const pestana = pestanaDe(segmentos[2]);
    if (pestana !== null) return { nombre: "proceso", id, pestana };
  }

  return desconocida;
}

/**
 * Las cuatro pantallas de cotización. Aparte, por la misma razón que las de
 * catálogo y las de proceso: un cuarto árbol dentro de `resolverRuta` es
 * donde un `return` cae en la rama equivocada sin que se note.
 *
 * Es el árbol de clientes, con una diferencia: acá **no** hay una rama de
 * cuatro segmentos. `/cotizaciones/{id}/modulos` y `/cotizaciones/{id}/
 * emitir` tienen que caer en «desconocida» mientras no existan, que es lo
 * contrario de resolver a una pantalla vacía.
 */
function resolverCotizaciones(segmentos: string[], pathname: string): Ruta {
  const desconocida: Ruta = { nombre: "desconocida", ruta: pathname };

  if (segmentos.length === 1) return { nombre: "cotizaciones" };

  if (segmentos.length === 2) {
    if (segmentos[1] === NUEVO) return { nombre: "cotizacion-nueva" };
    if (segmentos[1] === GENERAR) return { nombre: "cotizacion-generar" };

    const id = identificador(segmentos[1]);
    return id === null ? desconocida : { nombre: "cotizacion", id };
  }

  if (segmentos.length === 3) {
    const id = identificador(segmentos[1]);
    if (id === null) return desconocida;

    if (segmentos[2] === EDITAR) return { nombre: "cotizacion-edicion", id };
    if (segmentos[2] === HOJA) return { nombre: "cotizacion-hoja", id };
  }

  return desconocida;
}

export function resolverRuta(pathname: string): Ruta {
  const segmentos = segmentosDe(pathname);
  const desconocida: Ruta = { nombre: "desconocida", ruta: pathname };

  if (segmentos.length === 0) return { nombre: "inicio" };
  if (segmentos.length === 1 && segmentos[0] === "banco-de-pruebas") {
    return { nombre: "banco-de-pruebas" };
  }

  if (segmentos[0] === CATALOGOS) return resolverCatalogos(segmentos, pathname);
  if (segmentos[0] === PROCESOS) return resolverProcesos(segmentos, pathname);
  if (segmentos[0] === COTIZACIONES) {
    return resolverCotizaciones(segmentos, pathname);
  }

  if (segmentos[0] !== "clientes") return desconocida;

  if (segmentos.length === 1) return { nombre: "clientes" };

  if (segmentos.length === 2) {
    if (segmentos[1] === NUEVO) return { nombre: "cliente-nuevo" };

    const id = identificador(segmentos[1]);
    return id === null ? desconocida : { nombre: "cliente", id };
  }

  if (segmentos.length === 3 && segmentos[2] === EDITAR) {
    const id = identificador(segmentos[1]);
    return id === null ? desconocida : { nombre: "cliente-edicion", id };
  }

  // El alta de un proceso con el cliente ya elegido.
  if (
    segmentos.length === 4 &&
    segmentos[2] === PROCESOS &&
    segmentos[3] === NUEVO
  ) {
    const id = identificador(segmentos[1]);
    return id === null
      ? desconocida
      : { nombre: "proceso-nuevo", clienteId: id };
  }

  return desconocida;
}

/**
 * La vuelta de `resolverRuta`. Existe para que ningún `href` se escriba a
 * mano en un componente: una ruta armada con una plantilla de texto es la que
 * se olvida de escapar el identificador y la que se desincroniza del
 * resolvedor sin que nadie lo note. La prueba de ida y vuelta las ata.
 */
export function enlaceDe(ruta: Ruta): string {
  switch (ruta.nombre) {
    case "inicio":
      return "/";
    case "banco-de-pruebas":
      return "/banco-de-pruebas";
    case "clientes":
      return "/clientes";
    case "cliente-nuevo":
      return `/clientes/${NUEVO}`;
    case "cliente":
      return `/clientes/${encodeURIComponent(ruta.id)}`;
    case "cliente-edicion":
      return `/clientes/${encodeURIComponent(ruta.id)}/${EDITAR}`;
    case "catalogos":
      return `/${CATALOGOS}`;
    case "precios":
      return `/${CATALOGOS}/${PRECIOS}`;
    case "arancel":
      return `/${CATALOGOS}/${ARANCEL}`;
    case "plantillas-de-modulo":
      return `/${CATALOGOS}/${MODULOS}`;
    case "tipos-proceso":
      return `/${CATALOGOS}/${TIPOS_PROCESO}`;
    case "tipo-proceso-nuevo":
      return `/${CATALOGOS}/${TIPOS_PROCESO}/${NUEVO}`;
    case "tipo-proceso":
      return `/${CATALOGOS}/${TIPOS_PROCESO}/${encodeURIComponent(ruta.id)}`;
    case "procesos":
      return `/${PROCESOS}`;
    case "proceso-nuevo":
      return ruta.clienteId === null
        ? `/${PROCESOS}/${NUEVO}`
        : `/clientes/${encodeURIComponent(ruta.clienteId)}/${PROCESOS}/${NUEVO}`;
    case "proceso": {
      const detalle = `/${PROCESOS}/${encodeURIComponent(ruta.id)}`;
      // «Trabajo» es la dirección a secas. El segmento no se escribe ni
      // aunque el valor exista: es el único lugar del programa que sabe
      // cómo se deletrea el defecto.
      return ruta.pestana === "trabajo"
        ? detalle
        : `${detalle}/${ruta.pestana}`;
    }
    case "cotizaciones":
      return `/${COTIZACIONES}`;
    case "cotizacion-nueva":
      return `/${COTIZACIONES}/${NUEVO}`;
    case "cotizacion-generar":
      return `/${COTIZACIONES}/${GENERAR}`;
    case "cotizacion":
      return `/${COTIZACIONES}/${encodeURIComponent(ruta.id)}`;
    case "cotizacion-edicion":
      return `/${COTIZACIONES}/${encodeURIComponent(ruta.id)}/${EDITAR}`;
    case "cotizacion-hoja":
      return `/${COTIZACIONES}/${encodeURIComponent(ruta.id)}/${HOJA}`;
    case "desconocida":
      return ruta.ruta;
  }
}
