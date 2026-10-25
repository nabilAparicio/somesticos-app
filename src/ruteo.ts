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

export type Ruta =
  | { nombre: "inicio" }
  | { nombre: "banco-de-pruebas" }
  | { nombre: "clientes" }
  | { nombre: "cliente-nuevo" }
  | { nombre: "cliente"; id: string }
  | { nombre: "cliente-edicion"; id: string }
  | { nombre: "catalogos" }
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
  | { nombre: "proceso"; id: string }
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

/** La raíz de las pantallas de catálogo (T-6) y su única subsección. */
const CATALOGOS = "catalogos";
const TIPOS_PROCESO = "tipos-proceso";

/** La raíz de las pantallas de proceso (T-7). */
const PROCESOS = "procesos";

/** La raíz de las pantallas de cotización (tajada 2, T-2). */
const COTIZACIONES = "cotizaciones";

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
  if (segmento === "" || segmento === NUEVO) return null;
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
 */
function resolverProcesos(segmentos: string[], pathname: string): Ruta {
  const desconocida: Ruta = { nombre: "desconocida", ruta: pathname };

  if (segmentos.length === 1) return { nombre: "procesos" };
  if (segmentos.length !== 2) return desconocida;
  if (segmentos[1] === NUEVO) {
    return { nombre: "proceso-nuevo", clienteId: null };
  }

  const id = identificador(segmentos[1]);
  return id === null ? desconocida : { nombre: "proceso", id };
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
    case "proceso":
      return `/${PROCESOS}/${encodeURIComponent(ruta.id)}`;
    case "cotizaciones":
      return `/${COTIZACIONES}`;
    case "cotizacion-nueva":
      return `/${COTIZACIONES}/${NUEVO}`;
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
