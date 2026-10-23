/**
 * Las rutas HTTP de las notas de un proceso. Traduce peticiones a llamadas
 * del puerto y resultados a respuestas; no decide ninguna regla de negocio.
 *
 *   GET  /api/procesos/{id}/notas   la línea de tiempo del proceso
 *   POST /api/procesos/{id}/notas   anota un hecho
 *
 * **Y nada más. No hay `PUT`, ni `PATCH`, ni `DELETE`, ni dirección propia
 * de una nota.** Una nota es inmutable (`docs/diseno.md` §3 y §5, I-6) y la
 * base lo sostiene con los dos disparadores de T-2. Acá la inmutabilidad es
 * la **ausencia del camino**: los métodos de escritura contestan 405 y
 * `/api/procesos/{id}/notas/{notaId}` no es ninguna ruta, así que cae en el
 * 404 general. Una nota no se direcciona sola porque solo se lee como parte
 * de la línea de tiempo de su proceso; darle una URL propia sería estrenar
 * la superficie sobre la que mañana alguien cuelga un `DELETE`.
 *
 * Cuelgan del **proceso** y no de `/api/notas` por lo mismo: la nota no
 * existe fuera de su proceso, y el 404 del proceso ajeno protege la línea de
 * tiempo entera sin un segundo filtro.
 *
 * Todo esto corre **después** de la puerta de Access: la identidad llega
 * resuelta como argumento, no como algo que este archivo tenga que ir a
 * buscar. El autor de la nota sale de ahí y nunca del cuerpo (I-6).
 *
 * Los códigos que esta capa elige, y por qué:
 *
 *  - **404** para un proceso de otro tenant, igual que T-5, T-6 y T-7: un
 *    403 confirmaría que ese identificador existe.
 *  - **422** para un cuerpo que no se acepta, incluida la etapa que no es de
 *    este proceso y el proceso que todavía no tiene plan.
 *  - **201** en el alta, con la línea de tiempo entera en el cuerpo. **Sin
 *    `location`**: no hay recurso al que apuntar, y fabricar uno sería
 *    prometer un `GET` que no existe.
 */

import type {
  DatosInvalidos,
  FallaDeValidacion,
  LineaDeTiempo,
} from "../contract";
import type { Identidad } from "../acceso/identidad";
import type { ServicioDeProcesos } from "../procesos/repositorio";
import { normalizarNota } from "./dominio";
import type { ServicioDeNotas } from "./repositorio";

const SIN_CACHE = { "cache-control": "no-store" } as const;

function json(cuerpo: unknown, init?: ResponseInit): Response {
  const respuesta = Response.json(cuerpo, init);
  respuesta.headers.set("cache-control", "no-store");
  return respuesta;
}

function invalido(fallas: FallaDeValidacion[]): Response {
  const cuerpo: DatosInvalidos = { error: "datos_invalidos", fallas };
  return json(cuerpo, { status: 422 });
}

function noEncontrado(): Response {
  return json({ error: "not_found" }, { status: 404 });
}

/**
 * Los segmentos de la ruta, sin la barra final.
 *
 * No se filtran los vacíos: `/api/procesos//notas` tiene que caer en
 * «desconocida» y no en «las notas del proceso de identificador vacío».
 */
function segmentosDe(pathname: string): string[] {
  return pathname.replace(/\/+$/, "").split("/").slice(1);
}

function decodificar(segmento: string): string | null {
  if (segmento === "") return null;
  try {
    const valor = decodeURIComponent(segmento);
    return valor === "" ? null : valor;
  } catch {
    // `decodeURIComponent` tira con un porcentaje mal escrito ("%ZZ"), que
    // es lo que llega cuando alguien edita la barra de direcciones a mano.
    return null;
  }
}

/**
 * Devuelve `null` cuando la ruta no es de notas, para que quien llama siga
 * buscando y termine en su propio 404.
 *
 * Recibe **dos** puertos: el de procesos solo para comprobar que el proceso
 * existe en este tenant —la existencia manda sobre la validación del cuerpo,
 * decisión de T-5— y el de notas para lo demás.
 */
export async function rutasDeNotas(
  request: Request,
  url: URL,
  identidad: Identidad,
  tenantId: string,
  procesos: ServicioDeProcesos,
  notas: ServicioDeNotas,
): Promise<Response | null> {
  const segmentos = segmentosDe(url.pathname);
  if (segmentos[0] !== "api") return null;
  if (segmentos[1] !== "procesos") return null;
  if (segmentos.length !== 4) return null;
  if (segmentos[3] !== "notas") return null;

  const procesoId = decodificar(segmentos[2]);
  if (procesoId === null) return noEncontrado();

  if (request.method !== "GET" && request.method !== "POST") {
    // Acá vive, dicho en un código de estado, que una nota no se edita ni se
    // borra. No es un `catch` ni una validación: es que el verbo no existe.
    return json(
      { error: "method_not_allowed" },
      { status: 405, headers: { allow: "GET, POST", ...SIN_CACHE } },
    );
  }

  if ((await procesos.obtener(tenantId, procesoId)) === null) {
    return noEncontrado();
  }

  if (request.method === "GET") {
    const cuerpo: LineaDeTiempo = await notas.lineaDeTiempo(
      tenantId,
      procesoId,
    );
    return json(cuerpo);
  }

  let leido: unknown;
  try {
    leido = await request.json();
  } catch {
    // 400 y no 422: 422 dice «entendí el cuerpo y no me sirve»; esto es «no
    // pude ni leerlo».
    return json({ error: "cuerpo_invalido" }, { status: 400 });
  }

  const normalizado = normalizarNota(leido);
  if (!normalizado.ok) return invalido(normalizado.fallas);

  // El autor sale de la identidad de Access, nunca del cuerpo (I-6).
  const resultado = await notas.crear(
    tenantId,
    procesoId,
    identidad.usuarioId,
    normalizado.datos,
  );
  if (resultado.estado === "invalido") return invalido(resultado.fallas);

  return json(resultado.linea, { status: 201 });
}
