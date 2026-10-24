/**
 * Las reglas de qué es un borrador de cotización aceptable. Puras: ni D1 ni
 * HTTP.
 *
 * ## Lo que este archivo NO valida, y por qué
 *
 * `migrations/0004_cotizaciones.sql` ya rechaza en la base el estado fuera
 * del catálogo, la moneda fuera del catálogo, la incoherencia entre estado y
 * snapshot y toda arista que cruce tenencia. **Nada de eso se repite acá.**
 * Repetirlo no sería defensa en profundidad: sería una segunda copia de la
 * regla que mañana dice otra cosa que la primera, y la que manda es la de la
 * base porque es la única que sobrevive a un script de importación
 * (`docs/diseno.md` §5).
 *
 * Y tampoco se **atrapa** ninguna de esas guardas. La disciplina del proyecto
 * es que la guarda se cuenta y nunca se atrapa: un `try`/`catch` alrededor de
 * un disparador, una llave foránea o un índice único convierte un defecto en
 * una respuesta amable y hace que nadie lo arregle.
 *
 * Lo que sí se valida acá es lo que la base no puede saber: la **forma** de
 * lo que llegó por el cable. La base recibe un `vence_en` ya canónico y no
 * tiene cómo distinguir «la persona escribió el 31 de febrero» de «la persona
 * no puso vencimiento»; eso se decide antes, y acá.
 *
 * ## El vencimiento: dos reglas distintas que parecen una
 *
 * Esta es la excepción que más fácil se lee mal, así que va escrita entera.
 * La lista de arriba **no incluye** «el vencimiento anterior a la fecha»,
 * aunque la base lo rechace, porque lo que este archivo valida es otra cosa:
 *
 *  - **La de la base** es `CHECK (vence_en >= fecha)`. Es estructural, dice
 *    que una vigencia no termina antes de empezar, y compara **momentos**.
 *  - **La de acá** es que no se puede poner un vencimiento en un día que ya
 *    pasó. Es de negocio, y compara el **día** que llegó por el cable contra
 *    hoy.
 *
 * En el alta las dos coinciden por casualidad, porque `fecha` es ahora. En la
 * edición no coinciden, y ahí se ve que son dos: `fecha` es la de creación, y
 * este módulo —que es puro— no la conoce ni la puede conocer. **Medido**: un
 * `PUT` que le pone `2022-01-01` a un borrador abierto en 2021 pasa el
 * `CHECK` sin problema y guarda una cotización ya vencida; sin la regla de
 * acá, nada avisa. Y al revés, en el alta un vencimiento del año pasado
 * **despierta el `CHECK`**, que es un 500 que nadie puede leer en vez de un
 * 422 que dice qué arreglar.
 *
 * El precedente está al lado: `clienteId` se exige acá **teniendo**
 * `cliente_id NOT NULL` en la base, por exactamente el mismo motivo. La regla
 * «no se duplica lo que hace la base» se aplica cuando es la misma regla, no
 * cuando dos reglas distintas se tocan en un caso.
 */

import type {
  DatosDeCotizacion,
  FallaDeValidacion,
  MotivoDeFalla,
} from "../contract";

export type Normalizacion =
  | { ok: true; datos: DatosDeCotizacion }
  | { ok: false; fallas: FallaDeValidacion[] };

/**
 * Lo que la normalización necesita saber y no viene en el cuerpo.
 *
 * Los dos campos existen por la regla del vencimiento pasado, y los dos
 * viajan como parámetro en vez de leerse acá adentro:
 *
 *  - **`hoy` no sale de `new Date()` en este archivo.** Una función que lee
 *    el reloj no es pura y no se puede probar en el borde —«hoy no es
 *    pasado» es justo la aserción que importa— sin esperar a que cambie el
 *    día. Lo pasa quien llama, que es quien ya tiene el momento de la
 *    petición.
 *  - **`venceEnActual`** es `null` en el alta y el valor guardado en la
 *    edición. Es lo que distingue «poner un vencimiento pasado» de «reenviar
 *    el que ya estaba», que son dos cosas distintas y solo la primera es un
 *    error.
 */
export interface ContextoDeCotizacion {
  /** Hoy, como día `AAAA-MM-DD`. */
  readonly hoy: string;
  /** El vencimiento que la cotización ya tenía. `null` en el alta. */
  readonly venceEnActual: string | null;
}

function falla(campo: string, motivo: MotivoDeFalla): FallaDeValidacion {
  return { campo, motivo };
}

function esObjeto(cuerpo: unknown): cuerpo is Record<string, unknown> {
  return typeof cuerpo === "object" && cuerpo !== null && !Array.isArray(cuerpo);
}

/**
 * Un día del calendario, en la forma `AAAA-MM-DD`.
 *
 * Es la misma comprobación que `esDiaValido` en `worker/pendientes/dominio.ts`
 * y por el mismo motivo: `2026-02-31` pasa cualquier expresión regular y no es
 * ningún día; `Date` lo normalizaría a marzo sin decir nada, así que la
 * comprobación es el viaje de ida y vuelta.
 *
 * Se declara de nuevo en vez de importarse del módulo de pendientes, y vale
 * decir por qué: importarla ataría la cotización al dominio de los pendientes
 * —dos módulos que no tienen nada que ver— por una función de cinco líneas.
 * El día que aparezca un tercer vencimiento, la que se mueve a un módulo
 * común es ésta, con los tres llamadores a la vista.
 */
export function esDiaValido(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;

  const momento = new Date(`${valor}T00:00:00.000Z`);
  if (Number.isNaN(momento.getTime())) return false;

  return momento.toISOString().slice(0, 10) === valor;
}

/**
 * Si ese día ya pasó **y es uno nuevo**.
 *
 * Las dos mitades hacen falta y ninguna sobra:
 *
 *  - **`dia < hoy`** y no `<=`: hoy no es pasado. Una cotización que se manda
 *    y se responde el mismo día es el caso corriente, y es también el que el
 *    repositorio protege guardando el vencimiento al final del día.
 *  - **`dia !== venceEnActual`**: reenviar el vencimiento que la cotización
 *    ya tenía no es ponerle uno. El formulario manda el juego completo de
 *    campos —`PUT` y no `PATCH`, decisión de T-5—, así que quien abre un
 *    borrador viejo para corregirle el cliente reenvía su vencimiento
 *    vencido sin tocarlo; rechazarlo ahí bloquearía una edición que no tiene
 *    nada que ver con el vencimiento y obligaría a cambiar un campo que
 *    nadie quiso cambiar. Que un borrador viejo quede vencido es un hecho,
 *    no una edición. Que no se pueda **emitir** así es de T-4, que es donde
 *    el vencimiento vuelve a importar.
 *
 * La comparación es de texto y eso es correcto por construcción, no por
 * casualidad: `esDiaValido` ya corrió, así que las dos cadenas están en
 * `AAAA-MM-DD`, que es de ancho fijo y donde el orden lexicográfico y el
 * cronológico son el mismo. Es el mismo argumento con el que
 * `migrations/0004_cotizaciones.sql` compara `vence_en` con `fecha`.
 */
function esPasado(dia: string, contexto: ContextoDeCotizacion): boolean {
  if (dia === contexto.venceEnActual) return false;
  return dia < contexto.hoy;
}

/**
 * De un cuerpo JSON cualquiera a los datos de un borrador, o a la lista de
 * por qué no.
 *
 * Devuelve **todas** las fallas y no la primera, igual que el alta de un
 * cliente: un formulario que corrige de a un error por envío es el formulario
 * que nadie usa.
 *
 * Los campos que la API no deja elegir —`codigo`, `estado`, `moneda`,
 * `snapshot`, `duplicadaDeId`— **se ignoran en silencio** en vez de
 * rechazarse. No es laxitud: ninguna pantalla los manda, así que un 422 no le
 * hablaría a nadie, y lo que de verdad importa —que no se puedan imponer— lo
 * garantiza que esta función no los copia a la salida. El `INSERT` escribe lo
 * que `DatosDeCotizacion` trae, y eso no los incluye.
 */
export function normalizarCotizacion(
  cuerpo: unknown,
  contexto: ContextoDeCotizacion,
): Normalizacion {
  if (!esObjeto(cuerpo)) {
    return { ok: false, fallas: [falla("clienteId", "tipo_invalido")] };
  }

  const fallas: FallaDeValidacion[] = [];

  // El cliente es I-1 y la columna es `NOT NULL`. Lo que la base no puede
  // distinguir es «no vino» de «vino en blanco», y las dos son la misma
  // omisión desde el formulario.
  const quien = cuerpo.clienteId;
  let clienteId = "";
  if (quien === undefined || quien === null) {
    fallas.push(falla("clienteId", "cliente_requerido"));
  } else if (typeof quien !== "string") {
    fallas.push(falla("clienteId", "tipo_invalido"));
  } else {
    clienteId = quien.trim();
    if (clienteId === "") fallas.push(falla("clienteId", "cliente_requerido"));
  }

  // El vencimiento es opcional —una cotización que no vence es el caso
  // mayoritario, y la columna es nullable— pero si viene tiene que ser un día
  // que exista. La cadena vacía se lee como «sin vencimiento» y no como una
  // falla: es lo que manda un campo de fecha que la persona dejó en blanco
  // después de haber escrito algo.
  const cuando = cuerpo.venceEn;
  let venceEn: string | null = null;
  if (cuando !== undefined && cuando !== null) {
    if (typeof cuando !== "string") {
      fallas.push(falla("venceEn", "tipo_invalido"));
    } else {
      const limpio = cuando.trim();
      if (limpio === "") {
        venceEn = null;
      } else if (!esDiaValido(limpio)) {
        // Un momento ISO completo cae acá, y tiene que caer: el cable lleva
        // días. Aceptar las dos formas haría que dos clientes de esta API
        // guardaran vencimientos distintos para la misma intención.
        fallas.push(falla("venceEn", "vencimiento_invalido"));
      } else if (esPasado(limpio, contexto)) {
        fallas.push(falla("venceEn", "vencimiento_pasado"));
      } else {
        venceEn = limpio;
      }
    }
  }

  if (fallas.length > 0) return { ok: false, fallas };

  return { ok: true, datos: { clienteId, venceEn } };
}
