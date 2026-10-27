/**
 * El adaptador de Anthropic: la única pieza del sistema que conoce la forma
 * de la API de un proveedor de modelos.
 *
 * Todo lo de acá es sustituible. `worker/ia/modelo.ts` no importa ni una
 * cadena de este archivo salvo la fábrica, y el día que el bufete quiera otro
 * proveedor se escribe un archivo al lado y se agrega una entrada en
 * `PROVEEDORES`.
 *
 * ## Por qué `fetch` crudo y no `@anthropic-ai/sdk`
 *
 * Es una decisión que hay que mirar, no un descuido:
 *
 *  1. **Es el precedente de este proyecto.** `worker/acceso/claves.ts` habla
 *     con el endpoint de certificados de Cloudflare por `fetch` con un `Pedir`
 *     inyectable, y las pruebas de ese archivo son las que este adaptador
 *     copia.
 *  2. **Es una dependencia nueva en el bundle de un Worker** para un solo
 *     `POST`, y agregar dependencias es una decisión del usuario, no del
 *     escritor.
 *  3. **La superficie es exactamente una llamada.** Lo que un SDK aporta
 *     —reintentos, streaming, tipos de error— o no hace falta todavía, o es
 *     justo lo que `ModeloDeLenguaje` esconde para que se pueda cambiar.
 *
 * Si se prefiere el SDK, el cambio es este archivo entero y nada más. Eso es
 * lo que la costura está comprando.
 *
 * ## Lo que esta petición NO manda, y por qué importa
 *
 * Verificado contra la referencia de la API de Claude (octubre de 2026):
 *
 *  - **Ni `temperature`, ni `top_p`, ni `top_k`.** En Opus 5 el muestreo fue
 *    removido y mandarlo devuelve **400**. Un adaptador escrito de memoria
 *    pone `temperature: 0` «para que sea determinista» y rompe en el primer
 *    despliegue.
 *  - **Ni `thinking`, ni `budget_tokens`.** En Opus 5 el razonamiento está
 *    encendido por defecto y `budget_tokens` devuelve **400**.
 *  - **Ningún turno de asistente precargado.** El *prefill* fue removido y
 *    devuelve **400**; forzar «respondé sólo JSON» con un `{` precargado,
 *    que es el truco clásico, ya no existe. Por eso el esquema es estricto
 *    con lo que vuelve: es la única garantía que queda, y es nuestra.
 *
 * Que el cuerpo tenga exactamente cuatro claves está afirmado en la prueba, y
 * esa aserción es deliberada: es lo que rompe si alguien agrega un parámetro
 * que el modelo por defecto rechaza.
 */

import { validarTextoDePropuesta, type PropuestaDelModelo } from "./esquema";
import { fallar, type ModeloDeLenguaje, type Pedir, type PeticionDeCompletado, type ResultadoDelModelo } from "./modelo";

/** Documentado por Anthropic; no cambia por despliegue, así que es constante. */
export const URL_DE_MENSAJES = "https://api.anthropic.com/v1/messages";

/** La versión de la API va en una cabecera y es parte del contrato. */
export const VERSION_DE_LA_API = "2023-06-01";

/** `docs/diseno.md` §8: «Modelo por defecto: `claude-opus-5`». */
export const MODELO_POR_DEFECTO = "claude-opus-5";

/**
 * Techo de salida sin streaming.
 *
 * Dieciséis mil deja holgura para una propuesta larga —seis módulos de prosa
 * y una docena de líneas— y se queda por debajo del tiempo de espera de una
 * petición sin streaming. Un techo bajo no ahorra nada: corta el JSON a la
 * mitad y la corrida se pierde entera.
 */
export const MAXIMO_DE_TOKENS_POR_DEFECTO = 16000;

const pedirConFetch: Pedir = (url, init) => fetch(url, init);

interface BloqueDeTexto {
  type: string;
  text?: unknown;
}

/**
 * El texto de la respuesta, juntando los bloques de texto en orden.
 *
 * Se juntan y no se toma el primero porque el proveedor puede partir la salida
 * en varios bloques, y quedarse con uno daría un JSON cortado que el esquema
 * reportaría como `salida_no_es_json` — un motivo que acusaría al modelo de
 * algo que hizo el adaptador. Los bloques que no son de texto —el de
 * razonamiento, que en Opus 5 viene siempre y por defecto vacío— se saltean.
 */
function textoDe(cuerpo: unknown): string | null {
  if (typeof cuerpo !== "object" || cuerpo === null) return null;

  const bloques = (cuerpo as { content?: unknown }).content;
  if (!Array.isArray(bloques)) return null;

  let texto = "";
  for (const bloque of bloques as BloqueDeTexto[]) {
    if (bloque.type === "text" && typeof bloque.text === "string") {
      texto += bloque.text;
    }
  }

  return texto === "" ? null : texto;
}

function razonDeCorte(cuerpo: unknown): string | null {
  if (typeof cuerpo !== "object" || cuerpo === null) return null;
  const razon = (cuerpo as { stop_reason?: unknown }).stop_reason;
  return typeof razon === "string" ? razon : null;
}

export function proveedorAnthropic(
  env: Env,
  pedir: Pedir = pedirConFetch,
): ModeloDeLenguaje {
  return {
    async proponer(
      peticion: PeticionDeCompletado,
    ): Promise<ResultadoDelModelo<PropuestaDelModelo>> {
      // **Falla cerrada, y antes del transporte.** Es la misma precedencia que
      // `autenticar`: sin configuración no hay con qué hablar, y lo que no se
      // puede hacer no se intenta. Que no haya pedido está afirmado en la
      // prueba, porque un `modelo_no_configurado` después de un viaje a la red
      // sería el mismo motivo escondiendo un segundo defecto.
      const clave = env.IA_API_KEY?.trim();
      if (clave === undefined || clave === "") {
        return fallar(
          "modelo_no_configurado",
          "falta IA_API_KEY; se pone con `wrangler secret put IA_API_KEY`",
        );
      }

      const modelo = env.IA_MODELO?.trim();
      const sistema = [
        { type: "text", text: peticion.instrucciones },
        ...(peticion.antecedentes ?? []).map((texto) => ({
          type: "text",
          text: texto,
        })),
      ];

      const cuerpoDelPedido = JSON.stringify({
        model: modelo === undefined || modelo === "" ? MODELO_POR_DEFECTO : modelo,
        max_tokens: peticion.maximoDeTokens ?? MAXIMO_DE_TOKENS_POR_DEFECTO,
        system: sistema,
        messages: [{ role: "user", content: peticion.entrada }],
      });

      // ================================================================
      // El único `try`, y envuelve **exactamente el transporte**.
      //
      // «Las guardas se cuentan, nunca se atrapan» (restricción 2 de la
      // tajada) prohíbe envolver el error de un disparador, una llave foránea
      // o un índice: esas son reglas **nuestras**, y atraparlas disfraza de
      // respuesta amable la violación de un invariante que elegimos sostener.
      //
      // Una llamada de red que falla no es nada de eso. Es un sistema externo
      // informando que no está disponible: no hay invariante violado, no hay
      // nada que disfrazar, y dejar propagar un `TypeError` de `fetch`
      // convertiría «Anthropic tuvo un mal minuto» en un 500 sin motivo que
      // el operador no puede distinguir de un defecto nuestro. Es la misma
      // separación que `rechazo.ts` ya hace entre 403 y 503.
      //
      // Lo que mantiene la distinción honesta es **el alcance**: acá adentro
      // no hay ni una comprobación nuestra. La validación de esquema corre
      // fuera, y por eso `salida_rechazada` no es alcanzable desde un `catch`.
      // ================================================================
      let estado: number;
      let cuerpo: unknown;
      try {
        const respuesta = await pedir(URL_DE_MENSAJES, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": clave,
            "anthropic-version": VERSION_DE_LA_API,
          },
          body: cuerpoDelPedido,
        });
        estado = respuesta.status;
        cuerpo = respuesta.ok ? await respuesta.json() : null;

        if (!respuesta.ok) {
          return fallar(
            "proveedor_no_disponible",
            `el proveedor respondió ${String(estado)}`,
          );
        }
      } catch (error) {
        return fallar(
          "proveedor_no_disponible",
          `no se pudo hablar con el proveedor: ${String(error)}`,
        );
      }

      const corte = razonDeCorte(cuerpo);
      if (corte === "refusal") {
        return fallar(
          "respuesta_rechazada_por_el_proveedor",
          "el proveedor declinó la petición",
        );
      }
      if (corte === "max_tokens") {
        return fallar(
          "respuesta_truncada",
          "la respuesta se cortó por el techo de tokens",
        );
      }

      const texto = textoDe(cuerpo);
      if (texto === null) {
        return fallar(
          "respuesta_ininteligible",
          "la respuesta no trae ningún bloque de texto",
        );
      }

      // Fuera del `try`, a propósito: ver el bloque de arriba.
      const validacion = validarTextoDePropuesta(texto, {
        // **Los tres catálogos que el prompt declaró, no dos.** Desde T-4 los
        // tipos de módulo también llegan declarados, y omitirlo acá dejaría
        // **todos** los módulos rechazados por `tipo_de_modulo_desconocido`:
        // la propuesta entera se caería y el abogado se quedaría sin borrador
        // por un catálogo que el prompt sí había ofrecido.
        modulos: peticion.tiposDeModuloOfrecidos,
        tiposDeProceso: peticion.tiposDeProcesoOfrecidos,
        // Y desde T-3 el monto de una línea tarifada sale de `servicios`, así
        // que omitirlo dejaría toda línea con servicio rechazada por
        // `servicio_no_ofrecido` aunque el prompt la hubiera ofrecido.
        servicios: peticion.serviciosOfrecidos,
      });

      if (!validacion.ok) {
        return fallar(
          "salida_rechazada",
          `la salida del modelo no pasó el esquema (${String(validacion.rechazos.length)})`,
          validacion.rechazos,
        );
      }

      return { ok: true, valor: validacion.propuesta };
    },
  };
}
