/**
 * La salida imprimible, del lado de los datos (T-6).
 *
 * Sin DOM y sin React, por lo mismo que `presentacion.ts` y `ciclo.ts`: son
 * funciones de datos a texto, y adentro de un `.tsx` sólo se pueden probar
 * levantando un navegador para leer lo que ya era una cadena.
 *
 * ## Lo único que no se negocia
 *
 * > **La hoja renderiza el documento congelado, y nunca las tablas vivas.**
 *
 * Y acá eso no es una recomendación escrita en un comentario: **es el tipo**.
 * Todo lo que este archivo exporta trabaja sobre `DocumentoCongelado`, que
 * es lo que devuelve `GET /api/cotizaciones/{id}/documento`, y ninguna de
 * sus funciones acepta un `Cotizacion`, un `ModuloDeCotizacion` ni un
 * `LineaDeCotizacion`. Pasarle a `HojaDeCotizacion` lo que el detalle ya
 * tiene en pantalla no compila.
 *
 * Esa es la diferencia entre una regla y una barandilla. Si una cotización
 * emitida en marzo se imprimiera distinta en septiembre porque al cliente le
 * cambiaron el nombre, T-4 entero —la emisión, el snapshot, los cinco
 * disparadores de `0006`— sería decoración.
 *
 * ## Y la aritmética tampoco
 *
 * `totales` llega **dentro del documento** y se muestra tal cual. No hay una
 * sola suma en este archivo, y no la hay por un motivo más fuerte que la
 * barandilla de la tajada: el total que el cliente vio es un hecho
 * histórico. Recalcularlo desde las líneas congeladas el día que `totalesDe`
 * cambie —el ITBMS de T-12, un redondeo— daría un número que nadie le
 * prometió a nadie.
 *
 * Los subtotales salen del mismo sitio, y `familiasDelDocumento` es el único
 * lugar donde las líneas y los totales se tocan.
 */

import type {
  ClaseDeLinea,
  DocumentoCongelado,
  LineaCongelada,
  TotalesDeCotizacion,
} from "../../../worker/contract";
import { CATALOGO_DE_CLASES } from "../../../worker/cotizaciones/lineas";
import { VACIO, diaLegible, fechaLegible } from "../../formatos";
import type { Resultado } from "../../api/peticiones";
import { AVISO_DEL_TOTAL, AVISO_GASTO_APROXIMADO } from "./lineas";

export { AVISO_DEL_TOTAL, AVISO_GASTO_APROXIMADO };

/* ==========================================================================
   Qué se puede imprimir, y qué se dice cuando no
   ========================================================================== */

/**
 * El motivo del 409 de `GET /documento`. Se escribe acá y no se importa del
 * contrato porque allá es el valor de un campo de una interfaz y no una
 * constante: `CotizacionSinDocumento["error"]` lo cierra por tipo, que es
 * lo que la anotación de abajo hace valer.
 */
export const MOTIVO_SIN_DOCUMENTO = "cotizacion_sin_documento";

/**
 * Lo que la hoja dice sobre un borrador, y por qué la decisión fue ésta.
 *
 * **Un borrador no se imprime, ni siquiera rotulado como borrador.** Se
 * evaluó la otra salida —una vista previa de las tablas vivas con una marca
 * de agua que sobreviva a la fotocopia— y se descartó por tres motivos, en
 * orden de peso:
 *
 *  1. **El que decide: la vista previa rompería la barandilla de arriba.**
 *     Para dibujarse tendría que entrarle a `HojaDeCotizacion` un juego de
 *     datos vivos, y entonces el componente que renderiza el documento
 *     congelado pasaría a aceptar las dos formas. El día que alguien agregue
 *     un campo, el camino congelado empieza a leer un valor vivo y no hay
 *     tipo que lo frene. Hoy no compila, que es una garantía de otra
 *     naturaleza que un rótulo.
 *  2. **El riesgo que la marca de agua mitiga pero no quita.** Una hoja
 *     impresa que parece la propuesta y no lo es circula igual: se escanea,
 *     se reenvía, se archiva. La marca sobrevive a la fotocopia; no
 *     sobrevive a que alguien la lea por encima.
 *  3. **La necesidad que supuestamente cubría ya está cubierta.** Ver cómo
 *     va a quedar antes de congelar es exactamente lo que el detalle
 *     muestra: los módulos de prosa primero y las líneas con sus totales
 *     después, que es el orden del documento y está elegido así a
 *     propósito.
 *
 * Lo que queda es decirlo bien. La frase nombra **qué falta** —emitir—, y no
 * se queda en «no se puede»: una puerta cerrada sin decir cuál está abierta
 * se lee como un callejón, que es el mismo criterio de `confirmacionDeEmitir`.
 */
export const AVISO_SIN_DOCUMENTO =
  "Esta cotización es un borrador y todavía no tiene documento que" +
  " imprimir. Lo que se imprime es lo que se le mandó al cliente, congelado" +
  " el día que se emitió, y un borrador no se mandó: lo que hay es un texto" +
  " que todavía se está escribiendo. Para ver cómo va quedando está la" +
  " ficha, donde la prosa va primero y los importes después, que es el" +
  " orden del documento. La hoja aparece cuando se emite.";

/**
 * El problema de la hoja, dicho para quien está mirando la pantalla.
 *
 * Existe por una razón concreta: `textoDeProblema` resuelve los 409 contra
 * el mapa `CONFLICTOS` de `src/api/peticiones.ts`, y un motivo que no está
 * en ese mapa cae en el texto de reserva, que habla de **un borrado que
 * nadie pidió**. Le pasó tres veces seguidas a esta tajada —está anotado
 * ahí mismo—, y `cotizacion_sin_documento` sería la cuarta.
 *
 * Se resuelve acá y no agregándolo a aquel mapa porque la frase es de esta
 * pantalla: el aviso no dice «hay un conflicto», dice qué es un borrador y
 * qué hacer con él. Lo que queda en el mapa compartido son los motivos cuya
 * explicación no depende de dónde se chocó.
 *
 * Todo lo demás —404, 403, red caída— se delega tal cual: de dónde vino el
 * problema no cambia qué tiene que leer quien está mirando.
 */
export function textoDeProblemaDeLaHoja(
  resultado: Resultado<unknown>,
  textoGeneral: (resultado: Resultado<unknown>) => string,
): string {
  if (
    resultado.estado === "conflicto" &&
    resultado.motivo === MOTIVO_SIN_DOCUMENTO
  ) {
    return AVISO_SIN_DOCUMENTO;
  }

  return textoGeneral(resultado);
}

/** Si el problema es el borrador, que es el único que no es un fallo. */
export function esBorradorSinDocumento(
  resultado: Resultado<unknown>,
): boolean {
  return (
    resultado.estado === "conflicto" &&
    resultado.motivo === MOTIVO_SIN_DOCUMENTO
  );
}

/* ==========================================================================
   Los rótulos de la pantalla

   Están acá y no escritos adentro del `.tsx` para que las pruebas puedan
   nombrarlos sin copiar la cadena: una prueba que compara contra un literal
   que ella misma escribió pasa el día que el componente diga otra cosa.
   ========================================================================== */

export const ROTULO_DE_IMPRIMIR = "Imprimir";
export const ROTULO_DE_VOLVER = "Volver a la cotización";

/** El encabezado de la franja de controles, que no se imprime. */
export const AYUDA_DE_LA_HOJA =
  "Esto es el documento tal como se congeló al emitirlo. Lo que se vea acá" +
  " es lo que sale por la impresora: los controles de esta franja no se" +
  " imprimen.";

/* ==========================================================================
   Las dos familias, congeladas
   ========================================================================== */

/**
 * Cómo se muestra cada clase **en el documento**.
 *
 * Es el gemelo de `COMO_SE_MUESTRA` en `./lineas.ts`, y es deliberadamente
 * una segunda tabla y no una importación: aquélla es privada de aquel
 * módulo y trabaja sobre `LineaDeCotizacion`, que es la forma viva. Lo que
 * las ata no es la disciplina sino dos cosas que sí se ejercen:
 *
 *  1. **El `Record` es exhaustivo** sobre `ClaseDeLinea`, igual que el otro:
 *     el día que el catálogo del Worker tenga una tercera clase, los dos
 *     dejan de compilar hasta que alguien diga de qué total sale su
 *     subtotal. Es el mismo mecanismo por el que `ESTADOS` en
 *     `presentacion.ts` y `ACCIONES_POR_ESTADO` en `ciclo.ts` conviven
 *     siendo dos registros sobre la misma unión.
 *  2. **Una prueba los compara campo por campo** —ver
 *     `test/impresion-ui.spec.ts`—, así que un rótulo que cambie de un lado
 *     y no del otro muere ahí.
 *
 * `aviso` es `string | null` y no una bandera `aproximado`, por el mismo
 * argumento que allá: **el texto es** la marca, y una bandera al lado
 * permitiría que uno de los dos cambiara sin el otro.
 */
/**
 * El campo de `TotalesDeCotizacion` del que sale el subtotal de una familia.
 *
 * **Ni `total` ni `itbms`**, y la exclusión no es defensiva: es lo que el
 * tipo tiene para decir. Una familia es un grupo de líneas y su subtotal es
 * lo que esas líneas suman; `total` es de las dos familias juntas, y el
 * ITBMS **no es una familia de líneas** — nadie lo escribió en ninguna fila,
 * no se puede agregar, editar ni quitar, y no tiene un encabezado del que
 * colgar renglones.
 *
 * Escrito como `Exclude<…>` y no como la unión literal a mano, para que el
 * día que el contrato gane un campo de subtotal nuevo —una tercera clase de
 * línea— éste lo acepte solo, y el día que gane otro que tampoco sea un
 * subtotal, alguien tenga que venir a decirlo acá.
 */
type CampoDeSubtotal = Exclude<keyof TotalesDeCotizacion, "total" | "itbms">;

const COMO_SE_IMPRIME: Record<
  ClaseDeLinea,
  {
    readonly campoDelSubtotal: CampoDeSubtotal;
    readonly rotuloDelSubtotal: string;
    readonly aviso: string | null;
  }
> = {
  honorario: {
    campoDelSubtotal: "honorarios",
    rotuloDelSubtotal: "Subtotal",
    aviso: null,
  },
  gasto_estimado: {
    campoDelSubtotal: "gastosEstimados",
    rotuloDelSubtotal: "Subtotal aproximado",
    aviso: AVISO_GASTO_APROXIMADO,
  },
};

/** Una de las dos mitades del documento, lista para imprimir. */
export interface FamiliaCongelada {
  readonly clase: ClaseDeLinea;
  readonly rotulo: string;
  readonly lineas: readonly LineaCongelada[];
  /** **Del documento.** Nunca la suma de `lineas`. En centavos. */
  readonly subtotal: number;
  readonly rotuloDelSubtotal: string;
  /** El aviso de que la cifra va a cambiar, o `null` si es cerrada. */
  readonly aviso: string | null;
  /** Derivado de `aviso`, para que no puedan decir cosas distintas. */
  readonly aproximado: boolean;
}

/**
 * Reparte las líneas congeladas en sus dos familias, **en el orden del
 * catálogo**: primero lo que cobra el bufete y después lo que el encargo va
 * a costar en trámites de terceros.
 *
 * **Una familia sin líneas no se dibuja.** Es lo contrario de lo que hace el
 * editor sobre un borrador, y por el mismo motivo que allá lo hace al revés:
 * allá la sección vacía es donde se agrega la primera línea, y acá no hay
 * nada que agregar. Una sección «Gastos estimados» con su subtotal en cero
 * sobre un documento que el cliente ya tiene es ruido que además invita a
 * preguntar qué gasto falta.
 *
 * **El subtotal sale de `documento.totales` y jamás de las líneas.** Es la
 * barandilla, y éste es el único sitio de la hoja donde las dos cosas se
 * tocan.
 */
export function familiasDelDocumento(
  documento: DocumentoCongelado,
): FamiliaCongelada[] {
  const familias: FamiliaCongelada[] = [];

  for (const entrada of CATALOGO_DE_CLASES) {
    const suyas = documento.lineas.filter(
      (una) => una.clase === entrada.clase,
    );
    if (suyas.length === 0) continue;

    const como = COMO_SE_IMPRIME[entrada.clase];

    familias.push({
      clase: entrada.clase,
      rotulo: entrada.rotulo,
      lineas: suyas,
      subtotal: documento.totales[como.campoDelSubtotal],
      rotuloDelSubtotal: como.rotuloDelSubtotal,
      aviso: como.aviso,
      aproximado: como.aviso !== null,
    });
  }

  return familias;
}

/**
 * Si el documento lleva alguna línea de gasto, que es lo que vuelve
 * aproximado al total.
 *
 * Mira **la clase de las líneas y no el subtotal**, igual que
 * `hayGastoEstimado` sobre las vivas: un gasto de cero centavos —una tasa
 * que no se sabía cuánto iba a ser— sigue siendo un gasto, y el total que
 * lo incluye sigue llevando una cifra incierta adentro. Con el subtotal, el
 * aviso desaparecería justo donde más incierta está la cifra.
 */
export function hayGastoEnElDocumento(documento: DocumentoCongelado): boolean {
  return documento.lineas.some((una) => una.clase === "gasto_estimado");
}

/* ==========================================================================
   Los encabezados del documento
   ========================================================================== */

/** Una línea de la ficha del cliente o de la cotización. */
export interface DatoDelDocumento {
  readonly rotulo: string;
  readonly valor: string;
}

/**
 * El documento, que se arma juntando lo que no es nulo.
 *
 * **Un campo vacío no se dibuja**, y acá eso es al revés de lo que hace el
 * resto de la aplicación, donde un hueco se dice con `VACIO`. La diferencia
 * es de quién lee: en la ficha el hueco es información para el bufete —ese
 * cliente no tiene correo cargado—, y en el documento es una fila en blanco
 * al lado de un rótulo, sobre datos que el cliente ya conoce de memoria. Se
 * lee como un defecto de la hoja y no como un dato que falta.
 */
function conValor(
  rotulo: string,
  valor: string | null,
): DatoDelDocumento | null {
  const limpio = valor?.trim() ?? "";
  return limpio === "" ? null : { rotulo, valor: limpio };
}

/**
 * La ficha del cliente, tal como figuraba en la propuesta.
 *
 * El documento va **adentro de una sola línea** y no en dos: «RUC
 * 155123456-2-2024» es como se escribe y como se lee, y partirlo en dos
 * filas obliga a juntarlo con la vista. Las cuatro combinaciones del par
 * están contempladas porque las cuatro existen en `cliente`: la base no
 * exige ninguno de los dos, y el `documento_incompleto` del formulario
 * cierra el alta por la pantalla pero no las filas que ya estaban.
 */
export function datosDelCliente(
  documento: DocumentoCongelado,
): DatoDelDocumento[] {
  const { cliente } = documento;

  const documentoLegal =
    cliente.documentoTipo !== null && cliente.documentoNumero !== null
      ? `${cliente.documentoTipo} ${cliente.documentoNumero}`
      : (cliente.documentoNumero ?? cliente.documentoTipo);

  return [
    conValor("Tipo", cliente.tipo),
    conValor("Documento", documentoLegal),
    conValor("Representante legal", cliente.representanteLegal),
    conValor("Correo", cliente.email),
    conValor("Teléfono", cliente.telefono),
  ].filter((dato): dato is DatoDelDocumento => dato !== null);
}

/**
 * Los datos de la propuesta: cuándo salió y hasta cuándo vale.
 *
 * **La fecha que encabeza el documento es `emitidaEn` y no `fecha`**, y no
 * son lo mismo: `fecha` es cuándo se abrió el borrador, que puede ser
 * semanas antes y es un dato interno del bufete. Lo que el cliente tiene
 * delante es de cuándo es el papel, o sea cuándo se emitió.
 *
 * El vencimiento sigue el criterio de `vencimientoDe`: sin vencimiento no se
 * dibuja un guion sino «No vence», porque acá lo que se sabe es que no
 * vence, y sobre una propuesta eso es justo lo que el cliente necesita
 * saber.
 */
export function datosDeLaPropuesta(
  documento: DocumentoCongelado,
): DatoDelDocumento[] {
  return [
    { rotulo: "Propuesta", valor: documento.cotizacion.codigo },
    { rotulo: "Emitida", valor: fechaLegible(documento.emitidaEn) },
    {
      rotulo: "Vigencia",
      valor:
        documento.cotizacion.venceEn === null
          ? "No vence"
          : `Hasta el ${diaLegible(documento.cotizacion.venceEn)}`,
    },
  ];
}

/**
 * El pie: quién la emitió y cuándo.
 *
 * El nombre puede faltar —el identificador no— y ahí se dice el hueco con
 * `VACIO` y no se omite la frase entera, al revés que en la ficha del
 * cliente. La diferencia es que acá lo que falta no es un dato opcional
 * sino el nombre de una persona que sí firmó: callarlo dejaría el documento
 * sin decir que fue emitido por alguien.
 */
export function pieDelDocumento(documento: DocumentoCongelado): string {
  const quien = documento.emitidaPor.nombre ?? VACIO;
  return `Emitida por ${quien} el ${fechaLegible(documento.emitidaEn)}.`;
}

/**
 * El título de la pestaña del navegador, que es **el nombre del archivo que
 * propone el diálogo de impresión**.
 *
 * No es cosmética: «Imprimir a PDF» usa el `document.title` para nombrar el
 * archivo, así que sin esto el papel del bufete se guardaría como «Bufete»
 * o como el título del armazón. Con el código adentro, el PDF que alguien
 * archive se llama como la propuesta.
 */
export function tituloDeLaHoja(documento: DocumentoCongelado): string {
  return `${documento.cotizacion.codigo} · ${documento.cliente.nombre}`;
}
