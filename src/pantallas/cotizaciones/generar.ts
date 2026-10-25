/**
 * El borrador de la pantalla del generador y sus reglas, sin React y sin
 * DOM (T-9).
 *
 * Es el hermano de `src/pantallas/cotizaciones/formulario.ts` con un campo
 * más, y el campo más es el que importa: **la prosa del abogado**. Las dos
 * transformaciones que se equivocan en silencio adentro de un componente son
 * las mismas que allá —lo vacío vuelve a ser `null` y no `""`, y qué falta
 * antes de molestar al servidor— y acá hay una tercera razón para sacarlas:
 * lo que esta pantalla manda cuesta plata y treinta segundos, así que un
 * envío que el servidor va a rechazar igual se paga dos veces.
 *
 * **Esta validación no autoriza nada.** La que manda es la del Worker
 * —`worker/cotizaciones/dominio.ts` para el cliente y el vencimiento,
 * `worker/ia/generador.ts` para la descripción—, que es la que la base y los
 * invariantes respaldan. Ésta existe para avisar antes de mandar. Son dos
 * copias de las mismas reglas a propósito, y cada una tiene sus propias
 * pruebas: aflojar una tiene que matar sus pruebas y no las de la otra.
 *
 * ## Lo que este módulo NO vuelve a declarar
 *
 * El vencimiento y el cliente son **exactamente** los del alta a mano, así
 * que sus reglas se importan de `./formulario` en vez de copiarse. Un
 * segundo `esDiaValido` acá sería la cuarta copia de la misma función en el
 * proyecto, y lo que la diferencia de las tres que ya existen —que ninguna
 * puede importar de las otras sin dar vuelta una flecha— no se aplica entre
 * dos archivos de la misma carpeta.
 *
 * ## Lo que NO vive acá
 *
 * **Que la descripción sobreviva a una falla del modelo.** Eso no es una
 * regla sino un estado de componente: es el `useState` que no se limpia, y
 * se prueba en `e2e/generar.spec.ts` sobre la pantalla dibujada. Afirmarlo
 * acá sería afirmar sobre la mitad que no se rompe.
 */

import type { DatosDeGeneracion, FallaDeValidacion } from "../../../worker/contract";
import {
  validarBorrador,
  type ContextoDelBorrador,
} from "./formulario";

export interface BorradorDeGeneracion {
  clienteId: string;
  /** Lo que escribe el `<input type="date">`: `AAAA-MM-DD` o vacío. */
  venceEn: string;
  /** La prosa del abogado, tal como la tecleó. Sin recortar todavía. */
  descripcion: string;
}

/**
 * La pantalla arranca **vacía en los tres campos**.
 *
 * Sin cliente elegido, por lo mismo que el alta a mano: un desplegable que
 * arranca con el primero de la lista es el que hace cotizarle al cliente
 * equivocado sin que nadie haya elegido nada.
 *
 * Y sin descripción de ejemplo precargada, que es la tentación de esta
 * pantalla en particular. Un texto de muestra adentro del campo es un texto
 * que alguien manda sin leer, y lo que sale es una cotización sobre el caso
 * de otro.
 */
export const BORRADOR_DE_GENERACION_VACIO: BorradorDeGeneracion = {
  clienteId: "",
  venceEn: "",
  descripcion: "",
};

/**
 * Lo que viaja por el cable.
 *
 * La descripción se recorta acá y **no** en el componente: el Worker la va a
 * recortar igual, y que las dos mitades hagan lo mismo es lo que permite
 * afirmar que lo que se manda es lo que se validó. Un recorte sólo del lado
 * del servidor haría que la validación previa midiera un texto y el envío
 * llevara otro.
 */
export function aPeticionDeGeneracion(
  borrador: BorradorDeGeneracion,
): DatosDeGeneracion {
  const venceEn = borrador.venceEn.trim();

  return {
    clienteId: borrador.clienteId.trim(),
    venceEn: venceEn === "" ? null : venceEn,
    descripcion: borrador.descripcion.trim(),
  };
}

/**
 * Lo que falta o no se entiende, antes de mandarlo.
 *
 * Devuelve **todas** las fallas y no la primera, igual que el Worker y que
 * todos los formularios del proyecto: uno que corrige de a un error por
 * envío es el formulario que nadie usa.
 *
 * El cliente y el vencimiento los juzga `validarBorrador`, que es la misma
 * función que usa el alta a mano. La descripción es lo único propio, y su
 * comprobación es sobre el **recorte**: tres saltos de línea no describen
 * ningún encargo, y es el mismo criterio con el que un módulo de prosa en
 * blanco es un título sin nada debajo.
 */
export function validarBorradorDeGeneracion(
  borrador: BorradorDeGeneracion,
  contexto: ContextoDelBorrador,
): FallaDeValidacion[] {
  const fallas = validarBorrador(
    { clienteId: borrador.clienteId, venceEn: borrador.venceEn },
    contexto,
  );

  if (aPeticionDeGeneracion(borrador).descripcion === "") {
    fallas.push({ campo: "descripcion", motivo: "descripcion_requerida" });
  }

  return fallas;
}
