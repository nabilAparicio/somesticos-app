/**
 * Las rutas HTTP del plan de pagos. Traduce peticiones a llamadas del puerto
 * y resultados a respuestas; no decide ninguna regla de negocio y no hace una
 * sola suma.
 *
 *   GET    /api/cotizaciones/{id}/cuotas         el plan y lo que suma
 *   POST   /api/cotizaciones/{id}/cuotas         agrega una cuota
 *   DELETE /api/cotizaciones/{id}/cuotas/{cid}   la saca del plan
 *   GET    /api/procesos/{id}/cuotas             ídem, para un trámite suelto
 *   POST   /api/procesos/{id}/cuotas
 *   DELETE /api/procesos/{id}/cuotas/{cid}
 *
 * ## Dos familias de dirección, una sola decisión
 *
 * Son dos prefijos porque una cuota cuelga de una cotización **o** de un
 * proceso —la decisión (c) de `migrations/0010_plan_de_pagos.sql`— y lo que
 * las distingue es la dirección y nada más. De ahí sale la propiedad que
 * importa: **de qué cuelga una cuota no viaja en el cuerpo**, así que la
 * exclusividad no es algo que el cliente pueda violar ni intentándolo. Es el
 * mismo reparto con el que la identidad de quien escribe sale de la puerta de
 * Access y nunca del cuerpo (I-6).
 *
 * Cuelgan de su dueño y no de `/api/cuotas` por lo mismo que las notas y los
 * movimientos: una cuota no existe fuera de su plan, y el 404 del dueño ajeno
 * protege el plan entero sin un segundo filtro.
 *
 * **Y nada más.** No hay `PUT` sobre una cuota: corregir el concepto o el
 * monto de una ya cargada no es de esta unidad, y la ausencia del verbo es
 * cómo se dice eso sin inventar una ruta que después haya que mantener. Lo
 * que sí se puede hoy es sacarla y volver a ponerla, que para un plan de
 * tres renglones es la misma operación con un clic más y sin ninguna regla
 * nueva que escribir. Es la misma decisión que T-10 tomó con los
 * movimientos, y es también por lo que el vocabulario tiene dos verbos y no
 * tres.
 *
 * ## El plan de una cotización **no se congela al emitir**
 *
 * Y esto es una decisión, no un olvido. Los módulos y las líneas sí: I-4 e
 * I-5 cierran la escritura en cuanto la cotización se emite
 * (`migrations/0006_emitir_y_congelar.sql`), porque son el documento. Las
 * cuotas **no entran al snapshot**, así que agregar o quitar una no toca ni
 * puede tocar lo que quedó congelado — el documento de hace seis meses sigue
 * siendo idéntico a sí mismo, que es el criterio 3 de aceptación de la
 * tajada.
 *
 * Y hay un motivo de negocio que lo decide: es justo cuando una cotización se
 * **gana** que el plan de pagos se termina de acomodar. Cerrar la escritura
 * al emitir dejaría el plan de toda cotización ganada imposible de cargar,
 * que es exactamente el caso mayoritario.
 *
 * ## La base del porcentaje se resuelve acá, y por eso esta capa lee líneas
 *
 * Un porcentaje es del total de la cotización, y ese total es
 * `totalesDe(listarLineas(…))`. Se resuelve en esta capa y viaja hacia abajo
 * dentro de `DuenioDelPlan`, para que el adaptador de D1 no tenga que saber
 * de dónde salió y para que la aritmética siga viviendo en un solo sitio.
 *
 * Las líneas se piden por el **mismo puerto** que usa la pantalla de líneas
 * —`ServicioDeCotizaciones.listarLineas`— y no por una segunda copia de la
 * consulta, igual que la bitácora comprueba la existencia de una cotización
 * por el puerto y no por una consulta propia.
 *
 * Para un proceso la base es `null`, y ése es el otro lado de la misma
 * decisión: un proceso no tiene total, así que una cuota suya no puede ser
 * porcentual —lo rechaza esta capa con `porcentaje_sin_cotizacion` y lo
 * rechaza la base con su `CHECK`— y su plan se lee sin base.
 *
 * ## Los códigos que esta capa elige, y por qué
 *
 *  - **404** para una cotización, un proceso o una cuota de otro tenant,
 *    igual que todas las rutas desde T-5: un 403 confirmaría que ese
 *    identificador existe.
 *  - **422** para un cuerpo que no se acepta, con **todas** las fallas y no
 *    la primera.
 *  - **201** en el alta, con el plan entero —cuotas y total— en el cuerpo.
 *    **Sin `location`**: una cuota no tiene `GET` propio, y fabricar una
 *    dirección sería prometer uno que no existe.
 *  - **200** al quitar, también con el plan entero: la operación cambia lo
 *    que la pantalla tiene que dibujar, y el total que vuelve es el de estas
 *    cuotas y no el de las de antes.
 *
 * Todo esto corre **después** de la puerta de Access.
 */

import type {
  DatosInvalidos,
  FallaDeValidacion,
  PlanDePagos,
} from "../contract";
import type { ServicioDeCotizaciones } from "../cotizaciones/repositorio";
import type { RegimenDeImpuesto } from "../cotizaciones/lineas";
import { totalesDe } from "../cotizaciones/lineas";
import type { ServicioDeProcesos } from "../procesos/repositorio";
import { normalizarCuota } from "./dominio";
import type { DuenioDelPlan, ServicioDeCuotas, TipoDeDuenio } from "./repositorio";

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

function noPermitido(permitidos: string): Response {
  return json(
    { error: "method_not_allowed" },
    { status: 405, headers: { allow: permitidos, ...SIN_CACHE } },
  );
}

function planJson(plan: PlanDePagos, estado: number): Response {
  return json(plan, { status: estado });
}

/**
 * Los segmentos de la ruta, sin la barra final.
 *
 * No se filtran los vacíos: `/api/procesos//cuotas` tiene que caer en
 * «desconocida» y no en «el plan del proceso de identificador vacío».
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
 * Qué colección de la API corresponde a cada dueño.
 *
 * Registro y no `if`, por lo mismo que los dos de
 * `worker/cuotas/repositorio.ts`: un dueño nuevo no compila hasta que alguien
 * diga bajo qué dirección vive su plan.
 */
const COLECCION_DEL_DUENIO: Record<TipoDeDuenio, string> = {
  cotizacion: "cotizaciones",
  proceso: "procesos",
};

function tipoDeDuenioDe(coleccion: string): TipoDeDuenio | null {
  for (const tipo of Object.keys(COLECCION_DEL_DUENIO) as TipoDeDuenio[]) {
    if (COLECCION_DEL_DUENIO[tipo] === coleccion) return tipo;
  }
  return null;
}

/**
 * Devuelve `null` cuando la ruta no es de cuotas, para que quien llama siga
 * buscando y termine en su propio 404.
 *
 * Recibe **tres** puertos: el de cotizaciones y el de procesos para
 * comprobar que el dueño existe en este bufete —la existencia manda sobre la
 * validación del cuerpo, decisión de T-5—, y el de cuotas para las filas. El
 * de cotizaciones sirve además para la base del porcentaje, que sale de sus
 * líneas.
 */
export async function rutasDeCuotas(
  request: Request,
  url: URL,
  tenantId: string,
  cotizaciones: ServicioDeCotizaciones,
  procesos: ServicioDeProcesos,
  cuotas: ServicioDeCuotas,
  /**
   * El régimen de ITBMS del bufete (T-12). El mismo objeto que recibe
   * `rutasDeCotizaciones` en la misma petición, porque la base del
   * porcentaje **es** el total de esa cotización y tiene que ser el mismo
   * número que la pantalla de líneas acaba de mostrar.
   */
  impuesto: RegimenDeImpuesto,
): Promise<Response | null> {
  const segmentos = segmentosDe(url.pathname);
  if (segmentos[0] !== "api") return null;
  if (segmentos[3] !== "cuotas") return null;

  const tipo = tipoDeDuenioDe(segmentos[1]);
  if (tipo === null) return null;

  // Cuatro segmentos es la colección; cinco es una cuota. Cualquier otra cosa
  // no es ninguna ruta.
  const esColeccion = segmentos.length === 4;
  const esCuota = segmentos.length === 5;
  if (!esColeccion && !esCuota) return null;

  const duenioId = decodificar(segmentos[2]);
  if (duenioId === null) return noEncontrado();

  if (esColeccion && request.method !== "GET" && request.method !== "POST") {
    return noPermitido("GET, POST");
  }
  if (esCuota && request.method !== "DELETE") {
    // Acá vive, dicho en un código de estado, que una cuota no se edita en
    // esta unidad y que no tiene `GET` propio. No es un `catch` ni una
    // validación: es que el verbo no existe.
    return noPermitido("DELETE");
  }

  const duenio = await resolverDuenio(
    tipo,
    duenioId,
    tenantId,
    cotizaciones,
    procesos,
    impuesto,
  );
  if (duenio === null) return noEncontrado();

  if (esColeccion) {
    if (request.method === "GET") {
      return planJson(await cuotas.plan(tenantId, duenio), 200);
    }

    let leido: unknown;
    try {
      leido = await request.json();
    } catch {
      // 400 y no 422: 422 dice «entendí el cuerpo y no me sirve»; esto es «no
      // pude ni leerlo».
      return json({ error: "cuerpo_invalido" }, { status: 400 });
    }

    // **El contexto sale de la dirección**, que es lo que vuelve imposible
    // mandar un porcentaje colgado de un proceso aunque se quiera.
    const normalizado = normalizarCuota(leido, {
      cuelgaDeCotizacion: tipo === "cotizacion",
    });
    if (!normalizado.ok) return invalido(normalizado.fallas);

    return planJson(await cuotas.agregar(tenantId, duenio, normalizado.datos), 201);
  }

  const cuotaId = decodificar(segmentos[4]);
  if (cuotaId === null) return noEncontrado();

  // La existencia de la cuota **dentro de este plan y este bufete** se
  // comprueba acá, y de ella sale todo lo demás. Una cuota del vecino, o del
  // plan de al lado, es un 404 antes de borrar nada.
  const cuota = await cuotas.obtener(tenantId, duenio, cuotaId);
  if (cuota === null) return noEncontrado();

  return planJson(await cuotas.quitar(tenantId, duenio, cuota), 200);
}

/**
 * Comprueba que el dueño existe en este bufete y resuelve su base.
 *
 * Devuelve `null` cuando no existe o es de otro tenant, que acá son lo mismo
 * a propósito: los dos puertos filtran por `tenant_id`, así que un
 * identificador del vecino se comporta igual que uno inventado y el 404 no
 * confirma nada.
 *
 * **La base es el total de la cotización, y para un proceso es `null`.** Ésa
 * es la respuesta a «¿porcentaje de qué?», y no es la misma en los dos casos:
 * una cotización tiene un total —honorarios más gastos estimados, lo que
 * `totalesDe` deriva de sus líneas y el cliente lee como el número grande del
 * documento—; un proceso no tiene ninguno. Tiene gastos reales, que son plata
 * de terceros y no honorarios, y si nació de una cotización el total vive
 * allá y no en él.
 *
 * El total se lee **cada vez**, sobre las líneas de ese momento, y no se
 * guarda: si la cotización todavía es borrador y alguien agrega una línea, el
 * importe de la cuota del 50 % cambia con ella, que es lo que «el 50 % del
 * total» quiere decir. Una base congelada al cargar la cuota sería un total
 * almacenado con otro nombre.
 *
 * ## La base **incluye el ITBMS** cuando el bufete lo factura (T-12)
 *
 * Es la decisión que esta tarea tenía que tomar y dejar escrita, porque es de
 * las que nadie nota hasta que un cliente reclama: con el impuesto encendido,
 * una cuota del 50 % pasa a cobrar la mitad del total **con impuesto**.
 *
 * Corresponde, y por dos razones:
 *
 *  1. **Una cuota no reparte los honorarios del bufete: reparte lo que el
 *     cliente debe.** Lo que debe es el número grande del papel, ITBMS
 *     incluido. Si la base lo excluyera, un plan del 100 % sumaría menos que
 *     la factura y la última cuota no cerraría nunca — el cliente pagaría el
 *     plan entero y seguiría debiendo el impuesto.
 *  2. **«¿Porcentaje de qué?» ya tiene dos respuestas y no puede tener
 *     tres.** T-11 midió que son dos —cuelga de cotización, hay base; cuelga
 *     de proceso, no hay— y le costó una restricción de base de datos
 *     (`un_porcentaje_sin_cotizacion_no_tiene_de_que_ser_porcentaje`). Partir
 *     la base en «con impuesto» y «sin impuesto» agregaría una tercera, y la
 *     tercera respuesta a una pregunta que ya costó una migración es la que
 *     nadie se acuerda de mirar.
 *
 * Con el interruptor apagado —el despliegue de hoy— esto no cambia un
 * centavo, que es justamente lo que permitió decidirlo ahora. Está medido en
 * `test/impuesto-api.spec.ts`: la misma cuota del 50 % sobre la misma
 * cotización cobra dos importes distintos según la posición del interruptor.
 */
async function resolverDuenio(
  tipo: TipoDeDuenio,
  id: string,
  tenantId: string,
  cotizaciones: ServicioDeCotizaciones,
  procesos: ServicioDeProcesos,
  impuesto: RegimenDeImpuesto,
): Promise<DuenioDelPlan | null> {
  if (tipo === "proceso") {
    if ((await procesos.obtener(tenantId, id)) === null) return null;
    return { tipo, id, base: null };
  }

  if ((await cotizaciones.obtener(tenantId, id)) === null) return null;

  const lineas = await cotizaciones.listarLineas(tenantId, id);
  return { tipo, id, base: totalesDe(lineas, impuesto).total };
}
