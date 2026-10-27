/**
 * Las rutas HTTP del arancel de honorarios. Traduce peticiones a llamadas del
 * puerto y resultados a respuestas; no decide ninguna regla de negocio.
 *
 *   GET /api/arancel          la tabla entera, agrupada como el documento
 *   PUT /api/arancel/{id}     el precio del bufete, y nada más
 *
 * **No hay `POST` ni `DELETE`, y la ausencia es la decisión.** Los renglones
 * no nacen por la API —los siembra `scripts/arancel/sembrar.mjs` desde la
 * extracción del PDF oficial— y no se borran: se desactivan. Un alta por HTTP
 * sería la forma de meter un renglón que el acuerdo no dice, y entonces
 * `monto_oficial` dejaría de ser la cita de nada.
 *
 * Los códigos que esta capa elige, y por qué:
 *
 *  - **404** para lo que es de otro bufete, igual que en todo lo demás: un
 *    403 confirmaría que ese identificador existe.
 *  - **422** para un monto que no es un importe. Es el único 422 de esta
 *    ruta, porque es el único campo que se puede escribir mal.
 *  - **409 `renglon_citado`** para el cuerpo que pretende escribir una cita.
 *    409 y no 422 por la distinción que esta API ya usa: 422 dice «entendí el
 *    cuerpo y el dato no me sirve», y acá **no hay dato que arreglar**. Es la
 *    misma familia que `cotizacion_no_es_borrador`: lo que no admite la
 *    escritura es el estado de la fila, y el estado es que esos campos son la
 *    transcripción de un documento publicado.
 *  - **409 `rubro_sin_precio`** para ponerle precio a un encabezado, por lo
 *    mismo: el importe puede ser impecable; lo que no lleva precio es la
 *    fila.
 *  - **405** con `allow:` para el verbo que no corresponde, y es distinto en
 *    la colección —solo `GET`— que en el renglón —solo `PUT`—.
 *
 * En el `PUT`, la existencia se comprueba **antes** de revisar el cuerpo
 * (decisión de T-5): si no, un cuerpo inválido contra un id ajeno contestaría
 * 422 o 409, y cualquiera de los dos ya confirma que el id existe.
 */

import type {
  DatosInvalidos,
  FallaDeValidacion,
  RenglonCitado,
  RespuestaDeRenglonDelArancel,
  RespuestaDelArancel,
  RubroSinPrecio,
} from "../contract";
import { agruparPorCategoria, revisarMonto } from "./dominio";
import type { ServicioDeArancel } from "./repositorio";

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

function metodoNoPermitido(permitidos: string): Response {
  return json(
    { error: "method_not_allowed" },
    { status: 405, headers: { allow: permitidos, ...SIN_CACHE } },
  );
}

type CuerpoLeido =
  | { ok: true; valor: unknown }
  | { ok: false; respuesta: Response };

async function leerCuerpo(request: Request): Promise<CuerpoLeido> {
  try {
    return { ok: true, valor: await request.json() };
  } catch {
    // 400 y no 422: 422 dice «entendí el cuerpo y no me sirve»; esto es «no
    // pude ni leerlo».
    return {
      ok: false,
      respuesta: json({ error: "cuerpo_invalido" }, { status: 400 }),
    };
  }
}

/**
 * Los segmentos de la ruta, sin la barra final.
 *
 * No se filtran los vacíos: `/api/arancel//x` tiene que caer en
 * «desconocida» y no en «el renglón de identificador vacío».
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
    // `decodeURIComponent` tira con un porcentaje mal escrito ("%ZZ"), que es
    // lo que llega cuando alguien edita la barra de direcciones a mano.
    return null;
  }
}

async function manejarRenglon(
  request: Request,
  tenantId: string,
  id: string,
  servicio: ServicioDeArancel,
): Promise<Response> {
  if (request.method !== "PUT") return metodoNoPermitido("PUT");

  const leido = await leerCuerpo(request);
  if (!leido.ok) return leido.respuesta;

  // Primero la existencia dentro del bufete, después el cuerpo.
  if ((await servicio.obtener(tenantId, id)) === null) return noEncontrado();

  const revision = revisarMonto(leido.valor);

  if (revision.estado === "citado") {
    // La negativa que pide el criterio de aceptación 2 de la tajada: «el
    // monto oficial no se puede editar, **ni por la API**». No se descarta el
    // campo en silencio con un 200, que es lo que le enseñaría a la pantalla
    // que la escritura funcionó.
    const cuerpo: RenglonCitado = {
      error: "renglon_citado",
      campos: revision.campos,
    };
    return json(cuerpo, { status: 409 });
  }

  if (revision.estado === "invalido") return invalido(revision.fallas);

  const resultado = await servicio.fijarMonto(tenantId, id, revision.monto);
  if (resultado.estado === "no_encontrado") return noEncontrado();

  if (resultado.estado === "rubro") {
    const cuerpo: RubroSinPrecio = { error: "rubro_sin_precio" };
    return json(cuerpo, { status: 409 });
  }

  const cuerpo: RespuestaDeRenglonDelArancel = { renglon: resultado.renglon };
  return json(cuerpo);
}

/**
 * Devuelve `null` cuando la ruta no es del arancel, para que quien llama siga
 * buscando y termine en su propio 404.
 *
 * `segmentos.length === 4` devuelve `null` a propósito: ahí vive
 * `/api/arancel/{id}/bitacora`, que es de `rutasDeBitacora`. Es el mismo
 * reparto que los catálogos y las cotizaciones ya tenían, y el orden en
 * `worker/index.ts` no cambia qué contesta cada una — pero deja escrito que
 * esta ruta **no** se queda con su subruta.
 */
export function rutasDeArancel(
  request: Request,
  url: URL,
  tenantId: string,
  servicio: ServicioDeArancel,
): Promise<Response | null> {
  const segmentos = segmentosDe(url.pathname);
  if (segmentos[0] !== "api") return Promise.resolve(null);
  if (segmentos[1] !== "arancel") return Promise.resolve(null);

  if (segmentos.length === 2) {
    if (request.method !== "GET") {
      return Promise.resolve(metodoNoPermitido("GET"));
    }

    return servicio.leer(tenantId).then((arancel) => {
      const cuerpo: RespuestaDelArancel = {
        categorias: agruparPorCategoria(arancel.renglones, arancel.notas),
      };
      return json(cuerpo);
    });
  }

  if (segmentos.length !== 3) return Promise.resolve(null);

  const id = decodificar(segmentos[2]);
  if (id === null) return Promise.resolve(noEncontrado());

  return manejarRenglon(request, tenantId, id, servicio);
}
