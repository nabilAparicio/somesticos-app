/**
 * El cliente HTTP de las personas del bufete (T-9).
 *
 * Vive en `src/api/` y no dentro de una pantalla porque no es de ninguna: el
 * equipo se necesita donde haya que **elegir responsable**, y eso ya son dos
 * lugares distintos del modelo —el pendiente y el proceso— sin contar lo que
 * venga. Dos copias de esta función serían dos rutas que se desincronizan.
 *
 * **Solo lectura, y no es un descuido.** El sistema no da de alta a nadie:
 * quién entra lo deciden Cloudflare Access y la fila en `usuario` (T-3). No
 * hay `crearUsuario` porque no hay ruta, y no hay ruta porque sería una
 * segunda puerta al lado de la que ya existe.
 */

import type { RespuestaDeUsuarios, Usuario } from "../../worker/contract";
import { pedir, type Resultado } from "./peticiones";

export async function cargarUsuarios(
  signal: AbortSignal,
): Promise<Resultado<Usuario[]>> {
  const resultado = await pedir<RespuestaDeUsuarios>("/api/usuarios", {
    signal,
  });

  return resultado.estado === "ok"
    ? { estado: "ok", valor: resultado.valor.usuarios }
    : resultado;
}
