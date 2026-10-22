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
  | { nombre: "desconocida"; ruta: string };

/** El segmento literal del alta. No puede ser el identificador de nadie. */
const NUEVO = "nuevo";
const EDITAR = "editar";

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

export function resolverRuta(pathname: string): Ruta {
  const segmentos = segmentosDe(pathname);
  const desconocida: Ruta = { nombre: "desconocida", ruta: pathname };

  if (segmentos.length === 0) return { nombre: "inicio" };
  if (segmentos.length === 1 && segmentos[0] === "banco-de-pruebas") {
    return { nombre: "banco-de-pruebas" };
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
    case "desconocida":
      return ruta.ruta;
  }
}
