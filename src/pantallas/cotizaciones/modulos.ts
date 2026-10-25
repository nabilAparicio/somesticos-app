/**
 * El editor de módulos de prosa, sin React y sin DOM.
 *
 * Es el primo del borrador del plan de un proceso
 * (`src/pantallas/procesos/plan.ts`) y tiene la misma anatomía: una lista
 * que se agrega, se edita, se quita y se reordena, con todas las decisiones
 * acá afuera para que se prueben en el corredor del Worker y el `.tsx` no
 * decida nada.
 *
 * Y tiene **una diferencia que lo cambia todo**: allá el plan entero viaja
 * en un solo `PUT` al guardar; acá cada operación es su propia petición
 * porque la API tiene cuatro rutas de escritura, y las tiene para que la
 * bitácora pueda decir **cuál de las cuatro cosas pasó**
 * (`worker/cotizaciones/rutas.ts`). Un «guardar» que mandara la lista
 * entera aplastaría las cuatro preguntas en un solo hecho.
 *
 * ## El catálogo se importa, no se copia
 *
 * `CATALOGO_DE_MODULOS` vive en `worker/cotizaciones/modulos.ts` y es la
 * mitad acoplada del `CHECK` de `migrations/0004_cotizaciones.sql`. Una
 * tercera copia en `src/` sería el mismo defecto una vez más: la pantalla
 * ofrecería un tipo que la base rechaza con un 500 que nadie puede leer.
 *
 * Cruzar la frontera está permitido por la misma razón que lo está para
 * `worker/db/momentos.ts`: ese módulo **no importa nada en tiempo de
 * ejecución** —sólo tipos de `worker/contract.ts`, que se borran al
 * compilar— así que no arrastra ni D1 ni HTTP al bundle del navegador, y la
 * flecha del proyecto va `src/` → `worker/` y nunca al revés. Está listado
 * en `tsconfig.app.json` por lo mismo que los otros dos.
 *
 * ## Esta validación no autoriza nada
 *
 * `normalizarBorradorDeModulo` es **la segunda copia** de las reglas de
 * `normalizarModulo` del Worker, igual que la del formulario de la
 * cotización lo es de las de `dominio.ts`. La que manda es la del servidor;
 * ésta existe para avisar antes de mandar. Son dos copias a propósito, con
 * pruebas propias cada una: aflojar una tiene que matar sus pruebas y no
 * las de la otra.
 *
 * Todo devuelve copias. Esto es estado de React: mutarlo es el defecto que
 * no se ve hasta que una pantalla deja de redibujarse.
 */

import type {
  DatosDeModulo,
  FallaDeValidacion,
  ModuloDeCotizacion,
  MotivoDeFalla,
  TipoDeModulo,
} from "../../../worker/contract";
import {
  CATALOGO_DE_MODULOS,
  esTipoDeModulo,
  rotuloDeTipo,
} from "../../../worker/cotizaciones/modulos";

export { CATALOGO_DE_MODULOS, rotuloDeTipo };
export { mensajeDeFalla } from "../../mensajes";

/**
 * Lo que se escribe en los dos controles de un módulo.
 *
 * `tipo` es `string` y no `TipoDeModulo` porque el desplegable arranca
 * **vacío** en el alta: tiparlo estrecho obligaría a inventar un séptimo
 * valor para «ninguno todavía», que es exactamente el tipo que el catálogo
 * cerrado existe para impedir.
 */
export interface BorradorDeModulo {
  tipo: string;
  contenido: string;
}

/**
 * El alta arranca **sin tipo elegido**.
 *
 * Un desplegable que arranca en «Antecedentes» es el que hace guardar un
 * módulo de antecedentes donde alguien quería escribir el alcance, por el
 * mismo motivo por el que el cliente de la cotización tampoco viene
 * preelegido.
 */
export const BORRADOR_DE_MODULO_VACIO: BorradorDeModulo = {
  tipo: "",
  contenido: "",
};

/**
 * El texto de ayuda de la sección, acá y no dentro del `.tsx` por lo mismo
 * que `AVISO_PLAN_PROPIO`: así su contenido se puede afirmar en una prueba
 * en vez de quedar enterrado en un componente.
 */
export const AYUDA_DE_MODULOS =
  "Los módulos son la prosa de la propuesta, y el orden en que están acá es" +
  " el orden en que se van a leer. Cada cambio se guarda por su cuenta: no" +
  " hay un botón al final que confirme todo junto.";

/**
 * Lo que se dice cuando el servidor avisó que la lista en pantalla quedó
 * vieja **y la relectura que tenía que arreglarlo tampoco salió**.
 *
 * Es el peor de los estados posibles de esta pantalla y por eso tiene frase
 * propia: lo que se está mirando ya no es lo que hay guardado, y el editor
 * lo sabe. Callarlo —que es lo que hacía la primera versión, descartando en
 * silencio una relectura fallida— deja la lista vieja debajo de un mensaje
 * que dice que está vieja, sin que quien mira tenga cómo saber cuál de las
 * dos cosas creer.
 */
export const AVISO_SIN_RELECTURA =
  "Lo que está en pantalla ya no es lo que hay guardado y no se pudo volver" +
  " a leer la lista. Hasta que se relea, lo que se ve es de antes: conviene" +
  " no guiarse por el orden ni por lo que falta.";

/**
 * El texto de un error que **no** llegó como `Resultado`.
 *
 * `pedir` convierte en `Resultado` todo lo que sabe que puede pasar, pero
 * tiene un `await` sin red: el `respuesta.json()` del camino feliz. Un 200
 * con un cuerpo que no es JSON —un proxy que se mete en el medio, un
 * reinicio del servidor a mitad de la respuesta— hace que la promesa
 * **rechace**, y ninguna rama del editor pasa por ahí.
 *
 * Vive acá y no dentro del componente para que se pueda probar sin montar
 * un navegador, y espeja a `llamar` en `src/api/peticiones.ts`, que resuelve
 * lo mismo para el fallo de red.
 */
export function mensajeDeExcepcion(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Lo que se dice donde estarían los controles, sobre algo que ya se mandó. */
export const AVISO_MODULOS_CONGELADOS =
  "Los módulos de esta cotización se pueden leer pero no cambiar: son el" +
  " registro de lo que el cliente ya tiene.";

/**
 * Copia ordenada por `orden`. El arreglo que llega no se toca.
 *
 * El servidor ya los devuelve en orden, así que esto parece de más — y no
 * lo es: lo que la pantalla dibuja es la posición del arreglo, y el día que
 * una respuesta llegue mezclada por cualquier motivo, el editor movería un
 * módulo creyendo que mueve otro. Ordenar acá cuesta nada y hace que la
 * posición y el campo `orden` no puedan contradecirse.
 *
 * Quitar un módulo deja un hueco en `orden`, así que lo que se compara es
 * el número y nunca la distancia entre dos: lo que vale es el orden
 * relativo.
 */
export function modulosOrdenados(
  modulos: readonly ModuloDeCotizacion[],
): ModuloDeCotizacion[] {
  return [...modulos].sort((a, b) => a.orden - b.orden);
}

/**
 * Mueve un módulo un lugar arriba (`-1`) o abajo (`1`).
 *
 * Se niega fuera de los bordes, y esa guarda no es decorativa: sin ella,
 * subir el primero calcula el índice -1 y el intercambio deja la lista con
 * un hueco. Es el mismo borde que `moverPaso` defiende en el plan de un
 * proceso.
 *
 * Acá **no hay la tercera negativa** que sí tiene el plan —la de no meter
 * un paso pendiente delante de uno ya cumplido—, porque un módulo no tiene
 * historia: ninguno de los seis tipos es un hecho ocurrido, y el orden de
 * la prosa lo decide entero quien la escribe. Lo que sí hay es que todo
 * esto corre sólo sobre un borrador, y de eso se ocupa la pantalla.
 */
export function moverModulo(
  lista: readonly ModuloDeCotizacion[],
  indice: number,
  direccion: -1 | 1,
): ModuloDeCotizacion[] {
  const destino = indice + direccion;

  if (indice < 0 || indice >= lista.length) return [...lista];
  if (destino < 0 || destino >= lista.length) return [...lista];

  const movida = [...lista];
  [movida[indice], movida[destino]] = [movida[destino], movida[indice]];
  return movida;
}

/**
 * Los identificadores **en la posición del arreglo**, que es lo que viaja en
 * el `PUT` de la colección.
 *
 * Lee la posición y nunca el campo `orden`: el movimiento ya ocurrió en el
 * arreglo y todavía no en la base, así que el `orden` que cada módulo trae
 * es el viejo. Mandar ése sería mandar la lista sin mover.
 */
export function ordenDe(lista: readonly ModuloDeCotizacion[]): string[] {
  return lista.map((modulo) => modulo.id);
}

/**
 * Si dos listas de identificadores dicen lo mismo.
 *
 * Sirve para no mandar un `PUT` que ya se sabe que no cambia nada. El
 * servidor también lo corta —`reordenarModulos` se niega a registrar un
 * movimiento que no movió nada, porque una entrada de bitácora inventada es
 * peor que una petición de más—, así que esto no protege ningún invariante:
 * ahorra el viaje, y nada más.
 *
 * La **longitud se compara primero** y no es redundante: sin eso, una lista
 * que perdió su último módulo porque alguien lo quitó desde otra pestaña
 * coincidiría posición por posición con el prefijo de la otra y se leería
 * como «no cambió nada».
 */
export function mismoOrden(
  uno: readonly string[],
  otro: readonly string[],
): boolean {
  if (uno.length !== otro.length) return false;
  return uno.every((id, indice) => id === otro[indice]);
}

/** De un módulo guardado a lo que se edita en pantalla. */
export function borradorDesdeModulo(
  modulo: ModuloDeCotizacion,
): BorradorDeModulo {
  return { tipo: modulo.tipo, contenido: modulo.contenido };
}

export type ModuloNormalizado =
  | { ok: true; datos: DatosDeModulo }
  | { ok: false; fallas: FallaDeValidacion[] };

function falla(campo: string, motivo: MotivoDeFalla): FallaDeValidacion {
  return { campo, motivo };
}

/**
 * Del borrador a lo que se manda, o a la lista de por qué no.
 *
 * Devuelve **todas** las fallas y no la primera, igual que su gemela del
 * Worker: un formulario que corrige de a un error por envío es el
 * formulario que nadie usa.
 *
 * Ausente, en blanco e inventado caen en el mismo motivo por lo mismo que
 * allá: el tipo sale de un desplegable dibujado con este mismo catálogo, así
 * que las tres situaciones son el mismo defecto desde donde está la persona.
 */
export function normalizarBorradorDeModulo(
  borrador: BorradorDeModulo,
): ModuloNormalizado {
  const fallas: FallaDeValidacion[] = [];

  const tipo = borrador.tipo;
  if (!esTipoDeModulo(tipo)) {
    fallas.push(falla("tipo", "tipo_de_modulo_desconocido"));
  }

  // Se recorta al guardar, y por eso la comprobación es sobre el recorte: un
  // módulo con tres saltos de línea y nada más es un título sin nada debajo.
  const contenido = borrador.contenido.trim();
  if (contenido === "") {
    fallas.push(falla("contenido", "contenido_requerido"));
  }

  if (fallas.length > 0) return { ok: false, fallas };

  return { ok: true, datos: { tipo: tipo as TipoDeModulo, contenido } };
}

/**
 * Si el borrador dice algo distinto de lo que está guardado.
 *
 * El contenido se compara **recortado** porque recortado es como se va a
 * guardar: sin eso, apoyar la barra espaciadora deja el botón de guardar
 * encendido sobre una petición que no cambiaría una sola letra.
 */
export function hayCambioEnModulo(
  modulo: ModuloDeCotizacion,
  borrador: BorradorDeModulo,
): boolean {
  return (
    borrador.tipo !== modulo.tipo ||
    borrador.contenido.trim() !== modulo.contenido
  );
}

/** Los borradores abiertos, indexados por el módulo al que pertenecen. */
export type BorradoresAbiertos = Readonly<Record<string, BorradorDeModulo>>;

/**
 * Se queda con los borradores de los módulos que siguen existiendo.
 *
 * Después de cada escritura el servidor devuelve la lista entera, y puede
 * traer uno menos: el que se acaba de quitar, o el que quitó alguien desde
 * otra pestaña. Sin podar, su texto a medio escribir queda colgado en
 * memoria para siempre y, peor, reaparecería si el mismo identificador
 * volviera a la lista.
 *
 * Lo que **no** hace es tirar los borradores de los demás. Reordenar no
 * toca el contenido de nadie, y perder lo que alguien estaba escribiendo en
 * otro módulo por haber apretado una flecha sería pérdida de trabajo.
 */
export function podarBorradores(
  abiertos: BorradoresAbiertos,
  modulos: readonly ModuloDeCotizacion[],
): BorradoresAbiertos {
  const vivos = new Set(modulos.map((modulo) => modulo.id));

  return Object.fromEntries(
    Object.entries(abiertos).filter(([id]) => vivos.has(id)),
  );
}

/**
 * Los motivos que la persona **no puede arreglar escribiendo**, porque lo
 * que está mal es la lista que tiene en pantalla.
 *
 * Los dos dicen lo mismo desde dos lados: `orden_incompleto` es «la lista
 * que mandaste no son los módulos de esta cotización» y `modulo_desconocido`
 * es «ese de ahí ya no es de acá». En los dos casos lo que hay en pantalla
 * es mentira, y reintentar con lo mismo vuelve a fallar: lo útil es volver a
 * leer la lista del servidor, y eso es lo que la pantalla hace con esto.
 */
const OBLIGAN_A_RECARGAR: readonly MotivoDeFalla[] = [
  "orden_incompleto",
  "modulo_desconocido",
];

export function exigeRecarga(fallas: readonly FallaDeValidacion[]): boolean {
  return fallas.some((una) => OBLIGAN_A_RECARGAR.includes(una.motivo));
}
