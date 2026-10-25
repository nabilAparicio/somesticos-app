/**
 * Las rutas HTTP de los gastos reales de un proceso. Traduce peticiones a
 * llamadas del puerto y resultados a respuestas; no decide ninguna regla de
 * negocio y no hace una sola suma.
 *
 *   GET    /api/procesos/{id}/gastos                      la cuenta y su saldo
 *   POST   /api/procesos/{id}/gastos                      registra un movimiento
 *   DELETE /api/procesos/{id}/gastos/{mid}                lo saca de la cuenta
 *   GET    /api/procesos/{id}/gastos/{mid}/comprobante    trae el papel
 *   PUT    /api/procesos/{id}/gastos/{mid}/comprobante    sube o reemplaza el papel
 *
 * **Y nada más.** No hay `PUT` sobre un movimiento: corregir el monto o el
 * concepto de uno ya cargado no es de esta unidad, y la ausencia del verbo es
 * cómo se dice eso sin inventar una ruta que después haya que mantener. Lo
 * que sí se puede hoy es sacarlo y volver a cargarlo, que para una cuenta de
 * cinco movimientos es la misma operación con más clics y sin ninguna regla
 * nueva que escribir.
 *
 * Cuelgan del **proceso** y no de `/api/gastos` por lo mismo que las notas y
 * los pendientes: un movimiento no existe fuera de su proceso, y el 404 del
 * proceso ajeno protege la cuenta entera sin un segundo filtro.
 *
 * Todo esto corre **después** de la puerta de Access: la identidad llega
 * resuelta como argumento. Quién registró el movimiento sale de ahí y nunca
 * del cuerpo (I-6).
 *
 * ## Los códigos que esta capa elige, y por qué
 *
 *  - **404** para un proceso o un movimiento de otro tenant, igual que todas
 *    las rutas desde T-5: un 403 confirmaría que ese identificador existe.
 *  - **422** para un cuerpo que no se acepta, **incluido el archivo que no es
 *    un comprobante y el que pasa del tope**. Eso lo hizo mal quien subió y
 *    lo puede arreglar: es una falla de validación como cualquier otra, no
 *    una del almacén.
 *  - **502** cuando el almacén no está configurado o no contestó. No es un
 *    defecto nuestro ni de quien está mirando, y **no 503**, que ya está
 *    tomado por la puerta de Access. Ver `ComprobanteNoDisponible`.
 *  - **201** en el alta, con la cuenta entera —movimientos y saldo— en el
 *    cuerpo. **Sin `location`**: un movimiento no tiene `GET` propio, y
 *    fabricar una dirección sería prometer uno que no existe.
 *  - **200** al adjuntar y al quitar, también con la cuenta entera: las dos
 *    operaciones cambian lo que la pantalla tiene que dibujar, y el saldo que
 *    vuelve es el de estos movimientos y no el de los de antes.
 *
 * ## El orden de las dos escrituras no se decide acá
 *
 * Que el objeto se escriba antes que la fila que lo nombra, y se borre
 * después que la fila que lo nombraba, es la regla del repositorio y está
 * explicada allá. Acá se ejecuta, y se ejecuta en ese orden.
 */

import type {
  ComprobanteNoDisponible,
  DatosInvalidos,
  FallaDeValidacion,
  MotivoDeFallaDelComprobante,
  RespuestaDeGastos,
} from "../contract";
import type { Identidad } from "../acceso/identidad";
import { hoyEnPanama } from "../db/momentos";
import type { ServicioDeProcesos } from "../procesos/repositorio";
import {
  esTipoDeComprobante,
  llaveDeComprobante,
  normalizarMovimiento,
  TOPE_DEL_COMPROBANTE,
} from "./dominio";
import type {
  AlmacenDeComprobantes,
  MovimientoConSuLlave,
  ServicioDeGastos,
} from "./repositorio";

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

function almacenCaido(motivo: MotivoDeFallaDelComprobante): Response {
  const cuerpo: ComprobanteNoDisponible = {
    error: "comprobante_no_disponible",
    motivo,
  };
  return json(cuerpo, { status: 502 });
}

function noPermitido(permitidos: string): Response {
  return json(
    { error: "method_not_allowed" },
    { status: 405, headers: { allow: permitidos, ...SIN_CACHE } },
  );
}

function cuentaJson(cuenta: RespuestaDeGastos, estado: number): Response {
  return json(cuenta, { status: estado });
}

/**
 * Los segmentos de la ruta, sin la barra final.
 *
 * No se filtran los vacíos: `/api/procesos//gastos` tiene que caer en
 * «desconocida» y no en «los gastos del proceso de identificador vacío».
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

/**
 * Devuelve `null` cuando la ruta no es de gastos, para que quien llama siga
 * buscando y termine en su propio 404.
 *
 * Recibe **tres** puertos: el de procesos sólo para comprobar que el proceso
 * existe en este tenant —la existencia manda sobre la validación del cuerpo,
 * decisión de T-5—, el de gastos para las filas y el almacén para los
 * papeles.
 */
export async function rutasDeGastos(
  request: Request,
  url: URL,
  identidad: Identidad,
  tenantId: string,
  procesos: ServicioDeProcesos,
  gastos: ServicioDeGastos,
  comprobantes: AlmacenDeComprobantes,
): Promise<Response | null> {
  const segmentos = segmentosDe(url.pathname);
  if (segmentos[0] !== "api") return null;
  if (segmentos[1] !== "procesos") return null;
  if (segmentos[3] !== "gastos") return null;

  // Cuatro segmentos es la colección; cinco es un movimiento; seis es su
  // comprobante. Cualquier otra cosa no es ninguna ruta.
  const esColeccion = segmentos.length === 4;
  const esMovimiento = segmentos.length === 5;
  const esComprobante = segmentos.length === 6 && segmentos[5] === "comprobante";
  if (!esColeccion && !esMovimiento && !esComprobante) return null;

  const procesoId = decodificar(segmentos[2]);
  if (procesoId === null) return noEncontrado();

  if (esColeccion && request.method !== "GET" && request.method !== "POST") {
    return noPermitido("GET, POST");
  }
  if (esMovimiento && request.method !== "DELETE") {
    // Acá vive, dicho en un código de estado, que un movimiento no se edita
    // en esta unidad y que no tiene `GET` propio. No es un `catch` ni una
    // validación: es que el verbo no existe.
    return noPermitido("DELETE");
  }
  if (esComprobante && request.method !== "GET" && request.method !== "PUT") {
    return noPermitido("GET, PUT");
  }

  if ((await procesos.obtener(tenantId, procesoId)) === null) {
    return noEncontrado();
  }

  if (esColeccion) {
    if (request.method === "GET") {
      return cuentaJson(await gastos.cuenta(tenantId, procesoId), 200);
    }

    let leido: unknown;
    try {
      leido = await request.json();
    } catch {
      // 400 y no 422: 422 dice «entendí el cuerpo y no me sirve»; esto es «no
      // pude ni leerlo».
      return json({ error: "cuerpo_invalido" }, { status: 400 });
    }

    // El día de hoy se mide **en Panamá** y no en UTC: desde las siete de la
    // tarde locales el día UTC ya es el siguiente, y cargar un gasto de hoy
    // daría `fecha_futura` por un gasto que acaba de ocurrir. Es el mismo
    // defecto que T-2 A encontró con los vencimientos.
    const normalizado = normalizarMovimiento(leido, {
      hoy: hoyEnPanama(new Date()),
    });
    if (!normalizado.ok) return invalido(normalizado.fallas);

    // Quién lo registró sale de la identidad de Access, nunca del cuerpo
    // (I-6).
    return cuentaJson(
      await gastos.registrar(
        tenantId,
        procesoId,
        identidad.usuarioId,
        normalizado.datos,
      ),
      201,
    );
  }

  const movimientoId = decodificar(segmentos[4]);
  if (movimientoId === null) return noEncontrado();

  // La existencia del movimiento **dentro de este proceso y este bufete** se
  // comprueba una vez, acá, y de ella sale todo lo demás. Un movimiento del
  // vecino es un 404 antes de mirar el cuerpo.
  const movimiento = await gastos.obtener(tenantId, procesoId, movimientoId);
  if (movimiento === null) return noEncontrado();

  if (esMovimiento) return quitar(tenantId, procesoId, movimiento, gastos, comprobantes);

  if (request.method === "GET") {
    return traerComprobante(movimiento, comprobantes);
  }

  return adjuntarComprobante(
    request,
    tenantId,
    procesoId,
    movimiento,
    gastos,
    comprobantes,
  );
}

/**
 * Trae el papel.
 *
 * **La llave no viaja ni de ida ni de vuelta**: se reconstruye de la fila, y
 * lo que el cliente nombró fue el movimiento. Un 404 cuando la fila no tiene
 * comprobante y otro cuando el objeto no está en el almacén: desde donde está
 * quien pide, las dos son «acá no hay papel», y distinguirlas en el cable
 * diría cuál de los dos lados se rompió sin que nadie pueda hacer nada con
 * esa información.
 */
async function traerComprobante(
  movimiento: MovimientoConSuLlave,
  comprobantes: AlmacenDeComprobantes,
): Promise<Response> {
  if (movimiento.comprobanteKey === null) return noEncontrado();

  const leido = await comprobantes.leer(movimiento.comprobanteKey);
  if (!leido.ok) return almacenCaido(leido.motivo);
  if (leido.valor === null) return noEncontrado();

  return new Response(leido.valor.cuerpo, {
    headers: {
      "content-type": leido.valor.tipoDeContenido,
      // Se descarga en vez de dibujarse dentro de la aplicación. Un PDF
      // servido en línea desde el mismo origen es un documento que el
      // navegador ejecuta con los permisos de la aplicación, y lo que hay
      // adentro lo subió alguien.
      "content-disposition": "attachment",
      // Un comprobante no cambia nunca —la llave es la del movimiento y el
      // reemplazo escribe otro objeto distinto— pero el `no-store` es la
      // regla de toda esta API, y una excepción acá sería un papel de un
      // bufete quedándose en una caché intermedia.
      ...SIN_CACHE,
    },
  });
}

/**
 * Sube el papel, o reemplaza el que estaba.
 *
 * **El objeto se escribe antes que la fila que lo nombra.** Si la segunda
 * mitad falla queda un objeto que nadie nombra, que es basura; al revés
 * quedaría una fila que promete un comprobante que no está, que es una fila
 * que miente. La regla entera está en `worker/gastos/repositorio.ts`.
 *
 * Reemplazar **no deja huérfano**: la llave se deriva de la fila y la fila no
 * cambió, así que el objeto nuevo se escribe encima del viejo. No hay un
 * segundo objeto que olvidar, y por eso no hay un borrado previo que pueda
 * fallar a la mitad.
 */
async function adjuntarComprobante(
  request: Request,
  tenantId: string,
  procesoId: string,
  movimiento: MovimientoConSuLlave,
  gastos: ServicioDeGastos,
  comprobantes: AlmacenDeComprobantes,
): Promise<Response> {
  const tipoDeContenido = request.headers.get("content-type");
  if (!esTipoDeComprobante(tipoDeContenido)) {
    return invalido([
      { campo: "comprobante", motivo: "comprobante_no_admitido" },
    ]);
  }

  const cuerpo = await request.arrayBuffer();

  // El tope se mide sobre lo que de verdad llegó y no sobre `content-length`,
  // que lo escribe quien manda. Un cuerpo vacío cae en el mismo motivo que un
  // tipo no admitido: desde donde está la persona, «eso no es un comprobante»
  // es la misma frase y la corrección es la misma.
  if (cuerpo.byteLength === 0) {
    return invalido([
      { campo: "comprobante", motivo: "comprobante_no_admitido" },
    ]);
  }
  if (cuerpo.byteLength > TOPE_DEL_COMPROBANTE) {
    return invalido([
      { campo: "comprobante", motivo: "comprobante_demasiado_grande" },
    ]);
  }

  // La llave la fabrica el servidor con los identificadores que el cliente no
  // controla. Ver `llaveDeComprobante`, y el `CHECK` de la migración que
  // exige esta misma forma del lado de la base.
  const llave = llaveDeComprobante(tenantId, procesoId, movimiento.id);

  const guardado = await comprobantes.guardar(
    llave,
    cuerpo,
    // Ya pasó `esTipoDeComprobante`, que sólo acepta tres valores y rechaza
    // el nulo.
    (tipoDeContenido as string).split(";")[0].trim().toLowerCase(),
  );
  if (!guardado.ok) return almacenCaido(guardado.motivo);

  return cuentaJson(
    await gastos.adjuntarComprobante(tenantId, procesoId, movimiento, llave),
    200,
  );
}

/**
 * Saca el movimiento de la cuenta, y su papel del almacén.
 *
 * **La fila se borra antes que el objeto**, por la regla del repositorio: si
 * el borrado del objeto falla queda basura que un barrido puede encontrar
 * —la llave es determinística—, y al revés quedaría una fila apuntando a un
 * papel que ya no está.
 *
 * Que el objeto no se haya podido borrar **no se le cuenta a quien pidió**, y
 * es la única asimetría de este archivo: el movimiento ya salió de la cuenta,
 * que es lo que la persona pidió y lo que cambió el saldo. Un 502 ahí diría
 * «no se pudo» sobre una operación que sí se hizo, y mandaría a reintentar un
 * borrado que ya no tiene fila que borrar.
 */
async function quitar(
  tenantId: string,
  procesoId: string,
  movimiento: MovimientoConSuLlave,
  gastos: ServicioDeGastos,
  comprobantes: AlmacenDeComprobantes,
): Promise<Response> {
  const cuenta = await gastos.quitar(tenantId, procesoId, movimiento);

  if (movimiento.comprobanteKey !== null) {
    await comprobantes.borrar(movimiento.comprobanteKey);
  }

  return cuentaJson(cuenta, 200);
}
