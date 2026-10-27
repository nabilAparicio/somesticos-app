/**
 * El editor de líneas de honorarios y gastos estimados, sin React y sin DOM.
 *
 * Es el hermano de `./modulos.ts` una tabla más abajo y tiene su misma
 * anatomía: una lista que se agrega, se edita, se quita y se reordena, con
 * todas las decisiones acá afuera para que se prueben en el corredor del
 * Worker y el `.tsx` no decida nada. Lo que agrega, y que la prosa no tenía,
 * es **dinero**, y con el dinero vienen las dos cosas que este archivo
 * existe para sostener.
 *
 * ## 1. La pantalla no suma. Nunca.
 *
 * Es la barandilla de la tajada, y acá se cumple **por omisión**: no hay un
 * solo `+` sobre dinero en este archivo. `totalesDe` vive en
 * `worker/cotizaciones/lineas.ts` y las cinco rutas devuelven la lista
 * **junto con** sus totales en el mismo cuerpo (`RespuestaDeLineas`), así
 * que lo que la pantalla hace con los subtotales y el total es
 * **mostrarlos**.
 *
 * La tentación tiene nombre y conviene dejarlo escrito para el que venga: un
 * preview del total mientras se teclea el monto, para ahorrar un viaje.
 * Costaría una segunda aritmética en un segundo lenguaje, y el día que las
 * dos discrepen por un centavo nadie va a saber cuál de los dos números es
 * el de la cotización. Una petición de más es más barata que eso.
 *
 * `familiasDeLineas` es la prueba de que se cumple: recibe los totales y los
 * reparte, y `test/lineas-ui.spec.ts` le pasa unos que **no** coinciden con
 * la suma de las líneas y exige que salgan los que llegaron.
 *
 * ## 2. La conversión entre centavos y lo que una persona escribe
 *
 * Restricción 5: los montos son **centavos enteros** de punta a punta — la
 * base lo sostiene con `CHECK (typeof(monto) = 'integer' AND monto >= 0)`,
 * el contrato lo dice y el Worker lo exige con `Number.isSafeInteger`. Nadie
 * en el sistema escribe un monto con coma **excepto este archivo**, que es
 * la frontera donde el importe se vuelve legible y vuelve.
 *
 * Son dos funciones y una sola conversión: `montoEditable` hace el trabajo
 * —partir los centavos en dólares y resto, sin una sola división de coma
 * flotante sobre el valor— y `montoLegible` agrupa los miles sobre el texto
 * que aquélla devolvió. Agrupar es una transformación de cadena y no de
 * dinero.
 *
 * **Punto decimal y coma de miles**, que es como se escribe el dólar en
 * Panamá. La coma **nunca** es decimal al leer: aceptar las dos cosas vuelve
 * ambiguo `1,234` —mil doscientos treinta y cuatro, o uno con veintitrés—, y
 * una adivinanza ahí manda al cliente un importe mil veces más grande. Se
 * rechaza y se dice qué arreglar.
 *
 * No se usa `Intl.NumberFormat`: una conversión escrita a mano sobre enteros
 * se puede probar por los bordes contra valores escritos a mano, que es lo
 * que la restricción 6 pide, y no depende de qué versión de ICU tenga
 * enfrente el navegador o el corredor.
 *
 * ## El catálogo se importa, no se copia
 *
 * `CATALOGO_DE_CLASES` vive en `worker/cotizaciones/lineas.ts` y es la mitad
 * acoplada del `CHECK` de `migrations/0004_cotizaciones.sql`. Una tercera
 * copia en `src/` sería el mismo defecto que ya se evitó dos veces: la
 * pantalla ofrecería una clase que la base rechaza con un 500 que nadie
 * puede leer.
 *
 * Cruzar la frontera está permitido por la misma razón que lo está para
 * `worker/db/momentos.ts` y `worker/cotizaciones/modulos.ts`, y la condición
 * real **no es «sin dependencias» sino «ninguna importación en tiempo de
 * ejecución»**: ese módulo sólo importa tipos de `worker/contract.ts`, que
 * se borran al compilar, así que no arrastra ni D1 ni HTTP al bundle del
 * navegador. La flecha del proyecto va `src/` → `worker/` y nunca al revés.
 * Está listado en `tsconfig.app.json`, que es `composite` y los enumera uno
 * por uno.
 *
 * **Lo que sí se deja del otro lado es `totalesDe`**, que vive en ese mismo
 * archivo y se podría importar igual de barato. No se importa a propósito:
 * tenerla a mano es la forma más fácil de que mañana alguien sume en la
 * pantalla sin darse cuenta de que estaba prohibido.
 *
 * ## Esta validación no autoriza nada
 *
 * `normalizarBorradorDeLinea` es **la segunda copia** de las reglas de
 * `normalizarLinea` del Worker. La que manda es la del servidor; ésta existe
 * para avisar antes de mandar. Son dos copias a propósito, con pruebas
 * propias cada una: aflojar una tiene que matar sus pruebas y no las de la
 * otra.
 *
 * Todo devuelve copias. Esto es estado de React: mutarlo es el defecto que
 * no se ve hasta que una pantalla deja de redibujarse.
 */

import type {
  ClaseDeLinea,
  DatosDeLineaConOrigen,
  FallaDeValidacion,
  LineaDeCotizacion,
  MotivoDeFalla,
  TipoProceso,
  TotalesDeCotizacion,
} from "../../../worker/contract";
import {
  CATALOGO_DE_CLASES,
  ROTULO_DEL_ITBMS,
  esClaseDeLinea,
  rotuloDeClase,
} from "../../../worker/cotizaciones/lineas";
import { ORDEN_ES, VACIO } from "../../formatos";
import { enlaceDe } from "../../ruteo";

export { CATALOGO_DE_CLASES, rotuloDeClase };
export { mensajeDeFalla } from "../../mensajes";

/**
 * Los dos que se comparten con el editor de prosa **tal cual**, en vez de
 * escribirse de nuevo.
 *
 * `mismoOrden` compara dos listas de identificadores y `mensajeDeExcepcion`
 * saca el texto de un error que no llegó como `Resultado`: ninguno de los
 * dos sabe nada de módulos, así que una segunda copia acá serían dos
 * definiciones de lo mismo y la que se relaje primero lo haría sin que nadie
 * lo note. Lo que **no** se comparte es `exigeRecarga`, que sí nombra su
 * tabla, ni `podarBorradores` ni `ordenDe`, que están tipados contra el
 * módulo de prosa y volverlos genéricos pide tocar `./modulos.ts`, que está
 * fuera de la superficie de esta unidad.
 */
export { mensajeDeExcepcion, mismoOrden } from "./modulos";

/* ==========================================================================
   La conversión centavos ↔ pantalla. Acá, y en ningún otro lado.
   ========================================================================== */

/** Lo que este archivo acepta como importe guardado. */
function esImporte(centavos: number): boolean {
  return Number.isSafeInteger(centavos) && centavos >= 0;
}

/**
 * Los centavos guardados, en la unidad que la persona lee y vuelve a
 * escribir: `150000` → `"1500.00"`.
 *
 * **Sin agrupar**, porque esto es lo que va dentro del campo de texto: lo
 * que se lee ahí tiene que ser exactamente lo que se puede volver a mandar
 * sin tocar nada, y `centavosDesdeTexto` tiene que poder leerlo de vuelta.
 * Hay una prueba de ida y vuelta que lo exige.
 *
 * La división es `Math.floor(centavos / 100)` sobre un entero seguro, así
 * que el cociente y el resto son exactos: ningún valor intermedio es una
 * fracción que se pueda perder. Lo que **no** se hace es `(c / 100)
 * .toFixed(2)`, que convierte el importe a coma flotante en el camino.
 *
 * Un valor que no es un importe —negativo, fraccionario, `NaN`— devuelve el
 * hueco y no un número inventado. No debería llegar nunca —el contrato y el
 * `CHECK` lo impiden— y justamente por eso, si llega, lo correcto es decir
 * que no se sabe y no dibujar un importe falso debajo de un rótulo de
 * dinero.
 */
export function montoEditable(centavos: number): string {
  if (!esImporte(centavos)) return VACIO;

  const enteros = Math.floor(centavos / 100);
  const resto = centavos % 100;

  return `${String(enteros)}.${String(resto).padStart(2, "0")}`;
}

/**
 * Los dígitos de la parte entera, de a tres y de derecha a izquierda.
 *
 * Un bucle y no la expresión regular con `lookahead` que suele usarse para
 * esto: lo que hace es lo mismo y se lee sin desarmarla.
 */
function agruparMiles(digitos: string): string {
  const grupos: string[] = [];
  let resto = digitos;

  while (resto.length > 3) {
    grupos.unshift(resto.slice(-3));
    resto = resto.slice(0, -3);
  }
  grupos.unshift(resto);

  return grupos.join(",");
}

/**
 * El importe como se muestra: `123456789` → `"1,234,567.89"`.
 *
 * Se apoya en `montoEditable` en vez de volver a partir los centavos: la
 * conversión está escrita una sola vez, y esto es una transformación de la
 * cadena que aquélla devolvió.
 */
export function montoLegible(centavos: number): string {
  const editable = montoEditable(centavos);
  if (editable === VACIO) return VACIO;

  const corte = editable.indexOf(".");
  return `${agruparMiles(editable.slice(0, corte))}${editable.slice(corte)}`;
}

/**
 * El importe con la moneda de la cotización delante.
 *
 * La moneda viaja como código —`USD`— y no se traduce a símbolo: `$` es
 * ambiguo en una región donde conviven el dólar y varios pesos, y lo que la
 * cotización guarda es el código.
 *
 * Sobre un hueco **no** se antepone nada: «USD —» promete una cifra que no
 * existe.
 */
export function importeLegible(centavos: number, moneda: string): string {
  const legible = montoLegible(centavos);
  return legible === VACIO ? VACIO : `${moneda} ${legible}`;
}

export type Conversion =
  | { ok: true; centavos: number }
  | { ok: false };

/**
 * La forma de un importe tecleado.
 *
 *  - La parte entera es **o** una tirada de dígitos **o** grupos de tres
 *    separados por coma. Las dos alternativas y no una sola con la coma
 *    opcional en cualquier lado: así `1,23,456` queda afuera, que es lo que
 *    pasa cuando alguien pega un importe de otro formato.
 *  - Los decimales son uno o dos. Tres es un centavo partido, que no existe:
 *    aceptarlo redondeando metería una decisión aritmética en la pantalla.
 *  - No hay signo. Un monto negativo no es un descuento, es una línea que la
 *    base rechaza con `monto >= 0`.
 */
const FORMA_DEL_IMPORTE = /^(\d+|\d{1,3}(?:,\d{3})+)(?:\.(\d{1,2}))?$/;

/**
 * De lo que una persona escribió a centavos enteros, o a que no se pudo.
 *
 * `Number.isSafeInteger` en los dos escalones —la parte entera y el
 * resultado— y no sólo en el último: por encima de 2^53 los enteros dejan de
 * ser distinguibles entre sí, así que un importe de ese tamaño ya no es el
 * número que alguien quiso escribir, y multiplicarlo por cien antes de
 * mirarlo perdería la evidencia. Es el mismo borde que `normalizarLinea`
 * defiende del otro lado del cable, defendido acá **antes** de mandarlo.
 *
 * No dice **por qué** no se pudo. Las cinco formas de fallar —vacío, no
 * numérico, con el centavo partido, negativo, demasiado grande— se arreglan
 * todas igual desde donde está la persona, y el vocabulario de fallas tiene
 * un solo motivo para las cuatro primeras (`monto_invalido`). Devolver un
 * detalle que nadie va a mostrar sería inventar una rama sin uso.
 */
export function centavosDesdeTexto(texto: string): Conversion {
  const partes = FORMA_DEL_IMPORTE.exec(texto.trim());
  if (partes === null) return { ok: false };

  const enteros = Number(partes[1].replaceAll(",", ""));
  if (!Number.isSafeInteger(enteros)) return { ok: false };

  // `padEnd` y no `padStart`: en «12.5» el decimal que falta es el de la
  // derecha, porque son doce con cincuenta y no doce con cinco.
  const resto = Number((partes[2] ?? "").padEnd(2, "0"));

  const centavos = enteros * 100 + resto;
  if (!Number.isSafeInteger(centavos)) return { ok: false };

  return { ok: true, centavos };
}

/* ==========================================================================
   Los textos de la sección
   ========================================================================== */

/**
 * El aviso de que la cifra del gasto va a cambiar.
 *
 * Vive acá y no dentro del `.tsx` por lo mismo que `AYUDA_DE_MODULOS`: así
 * su contenido se puede afirmar en una prueba en vez de quedar enterrado en
 * un componente.
 *
 * Y **no es letra chica**. Es un aviso dibujado dentro de la familia, encima
 * de su subtotal, porque lo que dice es la diferencia entre las dos mitades
 * del documento: el honorario es lo que el bufete cobra y es una cifra
 * cerrada; el gasto estimado es plata de terceros que todavía no se sabe
 * cuánto va a ser. El cliente tiene que saberlo **antes** de firmar, no
 * cuando llegue la factura.
 */
export const AVISO_GASTO_APROXIMADO =
  "Los gastos estimados no son honorarios: es plata de terceros —tasas," +
  " timbres, trámites— que el encargo va a costar y que el bufete adelanta" +
  " o traslada tal cual. La cifra de acá abajo es aproximada y va a cambiar" +
  " según lo que cobre cada entidad el día del trámite.";

/** Lo que se dice del total, que lleva la parte aproximada adentro. */
export const AVISO_DEL_TOTAL =
  "El total incluye los gastos estimados, así que también es aproximado:" +
  " lo cerrado son los honorarios.";

export const AYUDA_DE_LINEAS =
  "Cada línea es un concepto con su importe, y el orden en que están acá es" +
  " el orden en que se van a leer. Los importes se escriben en la moneda de" +
  " la cotización, con punto para los centavos. Cada cambio se guarda por su" +
  " cuenta: no hay un botón al final que confirme todo junto.";

/** Lo que se dice donde estarían los controles, sobre algo que ya se mandó. */
export const AVISO_LINEAS_CONGELADAS =
  "Las líneas de esta cotización se pueden leer pero no cambiar: son el" +
  " registro de lo que el cliente ya tiene.";

/**
 * Lo que se dice cuando el servidor avisó que la lista en pantalla quedó
 * vieja **y la relectura que tenía que arreglarlo tampoco salió**.
 *
 * Es el gemelo de `AVISO_SIN_RELECTURA` del editor de prosa y no se comparte
 * con él a propósito: acá lo que quedó viejo son importes, y mirar un total
 * que ya no es el guardado es peor que mirar un párrafo desactualizado. La
 * frase lo dice con todas las letras.
 */
export const AVISO_SIN_RELECTURA_DE_LINEAS =
  "Lo que está en pantalla ya no es lo que hay guardado y no se pudieron" +
  " volver a leer las líneas. Hasta que se relean, los importes y los" +
  " totales que se ven son de antes: no conviene guiarse por ellos.";

/* ==========================================================================
   Las dos familias
   ========================================================================== */

/**
 * Cómo se muestra cada clase. **Exhaustivo** sobre `ClaseDeLinea`: el día
 * que el catálogo del Worker tenga una tercera, esto deja de compilar hasta
 * que alguien diga de qué total sale su subtotal.
 *
 * Es **un solo registro y no tres paralelos**, por el mismo argumento que
 * `worker/cotizaciones/lineas.ts` usa para no meter una bandera `aproximado`
 * al lado del rótulo: tres tablas que dicen cosas de la misma clase son tres
 * lugares que mañana dicen cosas distintas.
 *
 * Y por eso `aviso` es `string | null` en vez de una bandera: **el texto
 * es** la marca. Un `aproximado: true` al lado de un aviso que dice lo mismo
 * permitiría que uno de los dos cambiara sin el otro; así, si el aviso no
 * está, la familia no es aproximada, y no hay forma de que se contradigan.
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

const COMO_SE_MUESTRA: Record<
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

/** Una de las dos mitades del documento, lista para dibujar. */
export interface FamiliaDeLineas {
  readonly clase: ClaseDeLinea;
  readonly rotulo: string;
  readonly lineas: readonly LineaDeCotizacion[];
  /** **Del servidor.** Nunca la suma de `lineas`. En centavos. */
  readonly subtotal: number;
  readonly rotuloDelSubtotal: string;
  /** El aviso de que la cifra va a cambiar, o `null` si es cerrada. */
  readonly aviso: string | null;
  /** Derivado de `aviso`, para que no puedan decir cosas distintas. */
  readonly aproximado: boolean;
}

/** Los tres en cero, para antes de que llegue la primera respuesta. */
export const TOTALES_EN_CERO: TotalesDeCotizacion = {
  honorarios: 0,
  gastosEstimados: 0,
  total: 0,
};

/**
 * Reparte las líneas en sus dos familias, **en el orden del catálogo**.
 *
 * Primero lo que cobra el bufete y después lo que el encargo va a costar en
 * trámites de terceros. Es el orden en que se lee una propuesta, y el
 * catálogo del Worker lo fija ahí y no acá.
 *
 * **El subtotal sale de `totales` y jamás de las líneas.** Es la barandilla,
 * y `familiasDeLineas` es el único sitio de la pantalla donde las dos cosas
 * se tocan: si alguien cambiara esto por una suma, lo notaría la prueba que
 * le pasa unos totales que no coinciden.
 *
 * `editable` decide si una familia sin líneas se dibuja igual. Sobre un
 * borrador sí, porque es donde se agregan y una sección que no aparece hasta
 * tener su primera línea esconde la mitad del documento; sobre lo que ya
 * salió del borrador no, porque ahí no hay nada que agregar y una sección
 * vacía con su subtotal en cero es ruido sobre un documento que el cliente
 * ya tiene. Está acá y no en el `.tsx` porque es una decisión, y el `.tsx`
 * no decide.
 */
export function familiasDeLineas(
  lineas: readonly LineaDeCotizacion[],
  totales: TotalesDeCotizacion,
  editable: boolean,
): FamiliaDeLineas[] {
  const familias: FamiliaDeLineas[] = [];

  for (const entrada of CATALOGO_DE_CLASES) {
    const suyas = lineas.filter((una) => una.clase === entrada.clase);
    if (suyas.length === 0 && !editable) continue;

    const como = COMO_SE_MUESTRA[entrada.clase];

    familias.push({
      clase: entrada.clase,
      rotulo: entrada.rotulo,
      lineas: suyas,
      subtotal: totales[como.campoDelSubtotal],
      rotuloDelSubtotal: como.rotuloDelSubtotal,
      aviso: como.aviso,
      aproximado: como.aviso !== null,
    });
  }

  return familias;
}

/* --------------------------------------------------------------------------
   El renglón del ITBMS (T-12)
   -------------------------------------------------------------------------- */

/** El impuesto, listo para dibujar. */
export interface RenglonDelImpuesto {
  readonly rotulo: string;
  /** **Del servidor.** En centavos. */
  readonly importe: number;
}

/**
 * El renglón del impuesto, o `null` si no va ninguno.
 *
 * ## La regla es de una sola pieza, y es la que importa
 *
 * > El renglón aparece **si y sólo si `totales.itbms` está**.
 *
 * No «si es mayor que cero», y acá está la decisión de T-12 que se ve en
 * pantalla. Un renglón de ITBMS que dice 0,00 le hace creer al cliente que no
 * se le cobra impuesto; lo que pasa mientras el interruptor esté apagado es
 * otra cosa muy distinta —**el bufete todavía no lo factura**— y las dos
 * lecturas llevan a conversaciones opuestas con el contador del cliente.
 *
 * Por eso apagado no es cero: es **ausencia**. El contrato lo sostiene con un
 * campo opcional y no con un número que valga cero, así que esta función no
 * tiene que adivinar nada — mira si la clave está.
 *
 * Y el otro lado de la misma regla: con el impuesto **encendido**, una
 * cotización que sólo tiene gastos estimados sí lleva su renglón, en cero.
 * Ahí el cero es verdad —el bufete factura ITBMS, y sobre esta propuesta son
 * cero porque no hay honorarios— y esconderlo volvería ambigua la ausencia.
 *
 * ## Y acá no se suma, igual que en todo este archivo
 *
 * El importe llega del servidor dentro de `totales`. La tentación de
 * calcularlo —son tres caracteres, `× 7 / 100`— es exactamente la misma que
 * la del total y se rechaza por lo mismo: una segunda aritmética del impuesto
 * en un segundo lenguaje, y el día que discrepen por un centavo nadie sabe
 * cuál de los dos números es el de la cotización.
 *
 * Sirve a las dos pantallas —el editor y la hoja imprimible— porque el
 * documento congelado trae sus totales con la misma forma. Que sea **una
 * sola** función es lo que impide que el borrador y el papel decidan distinto
 * cuándo hay impuesto.
 */
export function renglonDelImpuesto(
  totales: TotalesDeCotizacion,
): RenglonDelImpuesto | null {
  if (totales.itbms === undefined) return null;
  return { rotulo: ROTULO_DEL_ITBMS, importe: totales.itbms };
}

/**
 * Si hay alguna línea de gasto, que es lo que vuelve aproximado al total.
 *
 * Mira **la clase de las líneas y no el subtotal**: un gasto de cero
 * centavos —una tasa que todavía no se sabe cuánto es— sigue siendo un
 * gasto, y el total que lo incluye sigue llevando una cifra incierta
 * adentro. Con el subtotal, el aviso desaparecería justo en el caso donde
 * más incierta está la cifra.
 */
export function hayGastoEstimado(
  lineas: readonly LineaDeCotizacion[],
): boolean {
  return lineas.some((una) => una.clase === "gasto_estimado");
}

/* ==========================================================================
   El desplegable de trámites

   Una línea puede llevar el tipo de proceso que abriría si la cotización se
   gana, y es lo que T-7 va a leer para abrir los procesos. Es **opcional**:
   una consulta o una mensajería no abre ninguno, y ése es el caso corriente.

   Esta sección es la copia de `clientesSeleccionables` del formulario de la
   cotización, y existe por el mismo defecto medido allá: con un `<select>`
   controlado cuyo valor no corresponde a ninguna opción, el navegador cae en
   la primera —acá, «Ninguno»— mientras el estado de React conserva el
   identificador. Quien mira lee «Ninguno» sobre una línea que sí tiene
   trámite, y si toca el control creyendo que confirma, lo borra.

   Acá hay además una segunda forma de llegar al mismo agujero que el
   formulario no tenía: **un tipo de proceso dado de baja**. El catálogo trae
   `activo`, los inactivos no se ofrecen para una línea nueva, y una línea
   vieja que apunta a uno seguiría sin opción que la represente.
   ========================================================================== */

/** Una opción del desplegable: lo único que el control necesita. */
export interface OpcionDeTramite {
  readonly id: string;
  readonly nombre: string;
}

/** El trámite que la línea ya tiene. `null` cuando no lleva ninguno. */
export interface TramiteDeLaLinea {
  readonly id: string;
  readonly nombre: string | null;
}

/**
 * Cómo se nombra al trámite que la línea tiene y no se pudo nombrar.
 *
 * `tipoProcesoNombre` llega nulo si la fila apuntada cruzara la frontera del
 * tenant. Aun así la opción necesita un texto: poner el identificador crudo
 * sería una fila de UUID en un desplegable, y dejarlo vacío sería la misma
 * mentira que esta sección arregla. Es el mismo recurso que
 * `CLIENTE_SIN_NOMBRE`.
 */
const TRAMITE_SIN_NOMBRE = "El trámite que la línea ya tenía";

/** El trámite de una línea guardada, o `null` si no lleva. */
export function tramiteDeLaLinea(
  linea: LineaDeCotizacion,
): TramiteDeLaLinea | null {
  return linea.tipoProcesoId === null
    ? null
    : { id: linea.tipoProcesoId, nombre: linea.tipoProcesoNombre };
}

/**
 * Las opciones del desplegable, ordenadas por nombre.
 *
 * **Los inactivos no se ofrecen**, porque dar de baja un tipo de proceso es
 * decir que no se abren más; y **el trámite que la línea ya tiene va
 * siempre**, esté activo o no, esté o no en la lista. Las dos reglas juntas
 * son lo que hace que el control diga la verdad en los dos casos: no ofrece
 * lo que ya no se usa, y no borra en silencio lo que ya estaba elegido.
 *
 * El orden se arma acá y no en el componente para que sea afirmable sin
 * montar un navegador, que es la regla del proyecto para todo lo que no sea
 * dibujo.
 */
export function tramitesSeleccionables(
  tipos: readonly TipoProceso[],
  actual: TramiteDeLaLinea | null,
): OpcionDeTramite[] {
  const opciones: OpcionDeTramite[] = tipos
    .filter((tipo) => tipo.activo)
    .map((tipo) => ({ id: tipo.id, nombre: tipo.nombre }));

  if (actual !== null && !opciones.some((opcion) => opcion.id === actual.id)) {
    opciones.push({
      id: actual.id,
      nombre: actual.nombre ?? TRAMITE_SIN_NOMBRE,
    });
  }

  return opciones.sort((a, b) => ORDEN_ES.compare(a.nombre, b.nombre));
}

/**
 * El pie del desplegable cuando el catálogo de trámites no se pudo traer.
 *
 * Se muestra **siempre que haya problema**, y no sólo cuando el desplegable
 * quedó vacío, por la misma trampa que el del formulario: con el trámite de
 * la línea inyectado, el desplegable ya no está vacío, así que un aviso
 * condicionado a «no hay opciones» desaparecería justo en el caso en que
 * hace falta.
 *
 * **Que el catálogo no cargue no impide escribir una línea**, y eso es lo
 * que la frase dice: el trámite es opcional, así que lo que se pierde es
 * poder elegir uno, no poder cotizar.
 */
export function avisoDeTramites(problema: string | null): string | null {
  if (problema === null) return null;

  return (
    `${problema} El trámite es opcional, así que las líneas se pueden` +
    " escribir igual: lo único que no se puede ahora es elegir uno nuevo."
  );
}

/* ==========================================================================
   El orden de la lista
   ========================================================================== */

/**
 * Copia ordenada por `orden`. El arreglo que llega no se toca.
 *
 * El servidor ya las devuelve en orden, así que esto parece de más — y no lo
 * es, por lo mismo que en el editor de prosa: lo que la pantalla reparte en
 * familias es la posición del arreglo, y el día que una respuesta llegue
 * mezclada por cualquier motivo, mover una línea movería otra.
 *
 * Quitar una línea deja un hueco en `orden`, así que lo que se compara es el
 * número y nunca la distancia entre dos: lo que vale es el orden relativo.
 */
export function lineasOrdenadas(
  lineas: readonly LineaDeCotizacion[],
): LineaDeCotizacion[] {
  return [...lineas].sort((a, b) => a.orden - b.orden);
}

/**
 * La posición de la línea de la misma clase que está `direccion` más allá,
 * o `-1` si la de `desde` es la del borde de su familia.
 *
 * Salta las de la otra clase, que es lo que hace que el movimiento visible
 * sea el que se manda.
 */
function vecinaDeLaFamilia(
  lista: readonly LineaDeCotizacion[],
  desde: number,
  clase: ClaseDeLinea,
  direccion: -1 | 1,
): number {
  for (
    let posicion = desde + direccion;
    posicion >= 0 && posicion < lista.length;
    posicion += direccion
  ) {
    if (lista[posicion].clase === clase) return posicion;
  }

  return -1;
}

/**
 * Mueve una línea un lugar arriba (`-1`) o abajo (`1`) **dentro de su
 * familia**.
 *
 * ## Por qué no se pudo copiar `moverModulo`
 *
 * Los módulos se dibujan en una sola lista, así que mover es intercambiar
 * con el vecino del arreglo. Las líneas se dibujan en **dos**, pero el
 * `orden` que la base guarda es **uno solo para las dos familias** —el
 * índice único de `0004` es sobre `(cotizacion_id, orden)` y no sabe nada de
 * clases—. Intercambiar con el vecino del arreglo movería dos familias de un
 * botón que decía mover una: en `[honorario, gasto, honorario]`, bajar el
 * gasto subiría el segundo honorario.
 *
 * Así que el intercambio es con el **vecino de la misma clase**, saltándose
 * lo que haya en el medio. El resultado es un arreglo nuevo cuya posición es
 * el `orden` que se va a mandar, y el orden relativo de la otra familia
 * queda exactamente como estaba.
 *
 * Se recibe el identificador y no el índice —al revés que `moverModulo`—
 * porque lo que la pantalla tiene a mano es la posición **dentro de la
 * familia**, y traducirla a la global en el `.tsx` sería hacerlo decidir.
 *
 * Se niega en los dos bordes de la familia y sobre un identificador que no
 * está en la lista. Esa última guarda no es decorativa: sin ella, un
 * `findIndex` que no encuentra devuelve -1 y el intercambio escribe en
 * `movida[-1]`, que agrega una propiedad al arreglo y deja la lista con un
 * hueco silencioso.
 */
export function moverLinea(
  lista: readonly LineaDeCotizacion[],
  id: string,
  direccion: -1 | 1,
): LineaDeCotizacion[] {
  const indice = lista.findIndex((una) => una.id === id);
  if (indice === -1) return [...lista];

  const destino = vecinaDeLaFamilia(
    lista,
    indice,
    lista[indice].clase,
    direccion,
  );
  if (destino === -1) return [...lista];

  const movida = [...lista];
  [movida[indice], movida[destino]] = [movida[destino], movida[indice]];
  return movida;
}

/**
 * Los identificadores **en la posición del arreglo**, que es lo que viaja en
 * el `PUT` de la colección.
 *
 * Lee la posición y nunca el campo `orden`: el movimiento ya ocurrió en el
 * arreglo y todavía no en la base, así que el `orden` que cada línea trae es
 * el viejo. Mandar ése sería mandar la lista sin mover.
 */
export function ordenDeLineas(
  lista: readonly LineaDeCotizacion[],
): string[] {
  return lista.map((una) => una.id);
}

/* ==========================================================================
   El borrador de cada línea
   ========================================================================== */

/**
 * Lo que se escribe en los cinco controles de una línea.
 *
 * Los cinco son `string` y ninguno está tipado estrecho, y cada uno por su
 * motivo:
 *
 *  - `clase` arranca **vacía**, así que tiparla `ClaseDeLinea` obligaría a
 *    inventar una tercera clase para «ninguna todavía», que es justo lo que
 *    el catálogo cerrado existe para impedir. Es el mismo argumento que
 *    `BorradorDeModulo.tipo`.
 *  - `monto` es texto porque **lo que hay en el campo es texto**, y a veces
 *    texto que todavía no es un número: tiparlo `number` obligaría a
 *    convertir en cada tecla y a decidir qué hacer con «1.» a mitad de
 *    escribir.
 *  - `tipoProcesoId` usa la cadena vacía para «ninguno» porque eso es lo que
 *    vale un `<option value="">`. La traducción a `null` la hace
 *    `normalizarBorradorDeLinea`, que es la frontera.
 *  - `arancelRenglonId` es lo mismo un control más abajo: de qué servicio
 *    del bufete salió el precio de esta línea (T-2 de
 *    `odd/tasks/precios-en-la-cotizacion.md`). Cadena vacía es «ninguno», y
 *    entonces el monto es libre.
 */
export interface BorradorDeLinea {
  clase: string;
  concepto: string;
  monto: string;
  tipoProcesoId: string;
  arancelRenglonId: string;
}

/**
 * El alta arranca **sin clase, sin monto, sin trámite y sin servicio**.
 *
 * Un desplegable que arranca en «Honorarios» es el que hace guardar un
 * honorario donde alguien quería anotar una tasa de migración; y un campo
 * de monto preescrito en «0.00» es un importe que se puede mandar sin
 * haberlo pensado. Es la misma razón por la que el cliente de la cotización
 * tampoco viene preelegido.
 *
 * Y tampoco viene preelegido un servicio del arancel, aunque el bufete tenga
 * uno solo con cifra: eso prellenaría concepto y monto sin que nadie lo pidiera,
 * y dejaría una línea diciendo que su precio salió de un servicio que quien la
 * escribió nunca eligió.
 */
export const BORRADOR_DE_LINEA_VACIO: BorradorDeLinea = {
  clase: "",
  concepto: "",
  monto: "",
  tipoProcesoId: "",
  arancelRenglonId: "",
};

/** De una línea guardada a lo que se edita en pantalla. */
export function borradorDesdeLinea(linea: LineaDeCotizacion): BorradorDeLinea {
  return {
    clase: linea.clase,
    concepto: linea.concepto,
    monto: montoEditable(linea.monto),
    tipoProcesoId: linea.tipoProcesoId ?? "",
    arancelRenglonId: linea.arancelRenglonId ?? "",
  };
}

/** El trámite elegido, o la ausencia dicha como la entiende el Worker. */
function tramiteDe(borrador: BorradorDeLinea): string | null {
  const elegido = borrador.tipoProcesoId.trim();
  return elegido === "" ? null : elegido;
}

/** El servicio elegido, o la ausencia dicha como la entiende el Worker. */
function origenDe(borrador: BorradorDeLinea): string | null {
  const elegido = borrador.arancelRenglonId.trim();
  return elegido === "" ? null : elegido;
}

export type LineaNormalizada =
  | { ok: true; datos: DatosDeLineaConOrigen }
  | { ok: false; fallas: FallaDeValidacion[] };

function falla(campo: string, motivo: MotivoDeFalla): FallaDeValidacion {
  return { campo, motivo };
}

/**
 * Del borrador a lo que se manda, o a la lista de por qué no.
 *
 * Devuelve **todas** las fallas y no la primera, igual que su gemela del
 * Worker: un formulario que corrige de a un error por envío es el formulario
 * que nadie usa, y acá importa más que en la prosa porque una línea tiene
 * tres campos que se pueden equivocar a la vez.
 *
 * El **trámite no se valida**: que el identificador exista y sea de este
 * bufete lo decide el repositorio, que es el único que lo puede saber. Lo
 * único que esta función hace con él es traducir el `""` del desplegable al
 * `null` del contrato — mandarlo como cadena vacía sería un `tipo_invalido`
 * del Worker por un campo que la persona dejó deliberadamente en blanco.
 *
 * **El servicio del catálogo tampoco**, y por lo mismo elevado un escalón: que el
 * renglón exista, sea de este bufete y **tenga precio del bufete** son tres
 * cosas que sólo el repositorio puede contestar, y las contesta con dos motivos
 * propios. Y hay algo más que esta función no hace y conviene que esté
 * escrito: **no vuelve a mirar el catálogo para corregir el monto.** El
 * prellenado es una propuesta y editarla encima es legítimo, así que lo que
 * viaja es el importe que quedó en el campo.
 */
export function normalizarBorradorDeLinea(
  borrador: BorradorDeLinea,
): LineaNormalizada {
  const fallas: FallaDeValidacion[] = [];

  const clase = borrador.clase;
  if (!esClaseDeLinea(clase)) {
    fallas.push(falla("clase", "clase_de_linea_desconocida"));
  }

  // Se recorta al guardar, y por eso la comprobación es sobre el recorte: un
  // concepto de tres espacios es un monto sin explicación.
  const concepto = borrador.concepto.trim();
  if (concepto === "") fallas.push(falla("concepto", "concepto_requerido"));

  const monto = centavosDesdeTexto(borrador.monto);
  if (!monto.ok) fallas.push(falla("monto", "monto_invalido"));

  if (fallas.length > 0) return { ok: false, fallas };

  return {
    ok: true,
    datos: {
      clase: clase as ClaseDeLinea,
      concepto,
      monto: monto.ok ? monto.centavos : 0,
      tipoProcesoId: tramiteDe(borrador),
      arancelRenglonId: origenDe(borrador),
    },
  };
}

/**
 * Si el borrador dice algo distinto de lo que está guardado.
 *
 * El concepto se compara **recortado** porque recortado es como se va a
 * guardar: sin eso, apoyar la barra espaciadora deja el botón de guardar
 * encendido sobre una petición que no cambiaría una sola letra.
 *
 * El monto se compara **en centavos y no como texto**, que es lo que esta
 * función agrega sobre `hayCambioEnModulo`: «1500» y «1500.00» son el mismo
 * importe escrito de dos formas, y un «Guardar» encendido sobre eso manda
 * una petición estéril y deja a quien mira creyendo que tiene trabajo sin
 * guardar.
 *
 * Un monto que **no se puede leer** sí es un cambio, y a propósito: lo que
 * hay en el campo no es lo guardado, y el botón tiene que aparecer para que
 * el intento de guardar sea el que explique por qué no se puede. Esconderlo
 * dejaría a la persona mirando un campo con un error y sin nada que apretar.
 */
export function hayCambioEnLinea(
  linea: LineaDeCotizacion,
  borrador: BorradorDeLinea,
): boolean {
  if (borrador.clase !== linea.clase) return true;
  if (borrador.concepto.trim() !== linea.concepto) return true;
  if (tramiteDe(borrador) !== linea.tipoProcesoId) return true;
  if (origenDe(borrador) !== linea.arancelRenglonId) return true;

  const monto = centavosDesdeTexto(borrador.monto);
  return !monto.ok || monto.centavos !== linea.monto;
}

/** Los borradores abiertos, indexados por la línea a la que pertenecen. */
export type BorradoresDeLinea = Readonly<Record<string, BorradorDeLinea>>;

/**
 * Se queda con los borradores de las líneas que siguen existiendo.
 *
 * Después de cada escritura el servidor devuelve la lista entera, y puede
 * traer una menos: la que se acaba de quitar, o la que quitó alguien desde
 * otra pestaña. Sin podar, su importe a medio escribir queda colgado en
 * memoria para siempre y, peor, reaparecería si el mismo identificador
 * volviera a la lista.
 *
 * Lo que **no** hace es tirar los borradores de las demás. Reordenar no toca
 * lo que nadie escribió, y perder un importe a medio teclear por haber
 * apretado una flecha sería pérdida de trabajo ajeno.
 */
export function podarBorradoresDeLinea(
  abiertos: BorradoresDeLinea,
  lineas: readonly LineaDeCotizacion[],
): BorradoresDeLinea {
  const vivas = new Set(lineas.map((una) => una.id));

  return Object.fromEntries(
    Object.entries(abiertos).filter(([id]) => vivas.has(id)),
  );
}

/**
 * Los motivos que la persona **no puede arreglar escribiendo**, porque lo
 * que está mal es la lista que tiene en pantalla.
 *
 * Los dos dicen lo mismo desde dos lados: `orden_incompleto` es «la lista
 * que mandaste no son las líneas de esta cotización» y `linea_desconocida`
 * es «esa de ahí ya no es de acá». En los dos casos lo que hay en pantalla
 * es mentira, y reintentar con lo mismo vuelve a fallar: lo útil es volver a
 * leer la lista del servidor, y eso es lo que la pantalla hace con esto.
 *
 * Lo que sí se arregla escribiendo —un monto mal puesto, un concepto en
 * blanco— **no** entra: tirar lo que alguien tiene a medio escribir para
 * releer una lista que no cambió es perder trabajo para no ganar nada.
 */
const OBLIGAN_A_RECARGAR: readonly MotivoDeFalla[] = [
  "orden_incompleto",
  "linea_desconocida",
];

export function exigeRecarga(fallas: readonly FallaDeValidacion[]): boolean {
  return fallas.some((una) => OBLIGAN_A_RECARGAR.includes(una.motivo));
}

/* ==========================================================================
   Los precios del bufete, dentro de la cotización (T-2 de
   `odd/tasks/precios-en-la-cotizacion.md`, rehecho por T-2 bis)

   Lo que el usuario pidió, visto en la pantalla y corregido:

     > «Siempre debemos mostrar todos los precios, hayan sido modificados por mí
     > o sean los preestablecidos. … El panel "Tus precios" desaparece y el
     > dropdown que los lista pasa a tener una barra de búsqueda, y las opciones
     > el monto al lado, y un botón que diga "listar todos".»

   Así que acá ya no hay un panel. Hay **un control**, y es el mismo control el
   que hace las dos cosas que antes hacían dos: buscar un precio para mirarlo y
   elegirlo para que prellene. Un panel al lado era una segunda lista de lo
   mismo, y el usuario la sacó.

   **La regla de la tajada anterior sigue sin renegociarse: una sola cifra de
   dinero por servicio.** Lo que cambió es cuál: la del bufete si la editó, y la
   preestablecida si no. Ninguna comparación entre las dos, ningún aviso, ningún
   color. Es estructura y no disciplina: `ServicioOfrecible`, en
   `src/pantallas/catalogos/precios.ts`, no tiene dónde poner un segundo número.
   ========================================================================== */

/**
 * El servicio del catálogo del que salió el precio de una línea guardada.
 *
 * `concepto` es `arancelConcepto`, resuelto en lectura por el Worker, y viene
 * nulo si la fila apuntada cruzara la frontera del tenant — igual que
 * `tipoProcesoNombre`.
 */
export interface ServicioDeLaLinea {
  readonly id: string;
  readonly concepto: string | null;
}

/** De dónde salió el precio de una línea guardada, o `null` si de nadie. */
export function servicioDeLaLinea(
  linea: LineaDeCotizacion,
): ServicioDeLaLinea | null {
  return linea.arancelRenglonId === null
    ? null
    : { id: linea.arancelRenglonId, concepto: linea.arancelConcepto };
}

/**
 * Elegir un servicio del catálogo: **concepto, monto y de dónde salió**.
 *
 * El parámetro es estructural y no `ServicioTarifado` a propósito: ese tipo
 * vive en `src/pantallas/catalogos/precios.ts`, que **importa de este archivo**
 * la conversión de dinero. Pedirlo por su nombre crearía una importación
 * circular en tiempo de ejecución entre dos módulos que hoy tienen la flecha en
 * un solo sentido; pedir los tres campos que hacen falta deja el grafo como
 * estaba y `ServicioTarifado` sigue siendo asignable sin un solo `as`.
 *
 * ## Qué pisa y qué no, que es la decisión entera
 *
 * **Pisa concepto y monto**, incluso lo que ya estuviera escrito: elegir un
 * servicio del catálogo es pedirle al sistema lo que sabe de ese servicio, y un
 * prellenado que respetara el texto viejo dejaría una línea cuyo concepto dice
 * una cosa y cuya procedencia dice otra — justamente el dato que la columna
 * existe para que no pase.
 *
 * **No toca la clase ni el trámite.** Si la línea es un honorario o un gasto de
 * terceros, y qué proceso abre si la cotización se gana, son dos decisiones que
 * el arancel no contesta: el acuerdo tarifa servicios, no decide quién cobra.
 *
 * ## El concepto que se propone es el **rótulo completo**, y eso se midió
 *
 * La primera versión proponía el concepto del renglón a secas, con el argumento
 * de que el rubro es un recurso del desplegable y no prosa del documento.
 * **Estaba mal, y el navegador lo mostró en la primera prueba a mano**: el
 * servicio «primer año» prellenó una línea de cotización que decía
 * «primer año», que es exactamente la definición de `concepto_requerido` —un
 * monto que el cliente no sabe por qué está pagando—.
 *
 * No es un caso de borde: **147 de los 453 renglones del acuerdo cuelgan de un
 * rubro**, medido sobre `scripts/arancel/arancel.json`, y entre ellos están
 * «Reconsideración», «Apelación», «Persona Natural», «Elaboración» y
 * «Revisión». El documento los imprime así porque su encabezado está una línea
 * más arriba; una cotización no tiene ese encabezado.
 *
 * Con el rótulo, además, lo que se elige es lo que se escribe: el desplegable
 * dice «Inversionista · primer año» y el campo queda con esa misma frase. Para
 * los servicios sin rubro el rótulo **es** el concepto, así que no cambia nada.
 * Y sigue siendo editable, que es el punto.
 */
export function prellenarDesdeServicio(
  borrador: BorradorDeLinea,
  servicio: {
    readonly id: string;
    /** El nombre completo del servicio: el rubro delante, si tiene. */
    readonly rotulo: string;
    /** Centavos enteros. */
    readonly monto: number;
  },
): BorradorDeLinea {
  return {
    ...borrador,
    concepto: servicio.rotulo,
    monto: montoEditable(servicio.monto),
    arancelRenglonId: servicio.id,
  };
}

/**
 * Desvincular el servicio: la línea vuelve a tener **monto libre**.
 *
 * **No borra el concepto ni el monto**, y es la mitad de la decisión que esta
 * función existe para sostener: lo que se quita es la procedencia, no la cifra.
 * La base admite el nulo en `arancel_renglon_id` justamente porque una línea
 * con monto libre es el caso corriente, y tirar el importe que alguien ya
 * aceptó —o el concepto que ya corrigió— sería perder trabajo ajeno por haber
 * tocado un desplegable.
 */
export function sinServicioTarifado(borrador: BorradorDeLinea): BorradorDeLinea {
  return { ...borrador, arancelRenglonId: "" };
}

/**
 * Qué queda en el borrador cuando alguien mueve el desplegable de servicios.
 *
 * Son **tres** ramas y no dos, y la tercera es la que no se ve venir:
 *
 *  1. el hueco —`""`, que es lo que deja el campo del selector vaciado—
 *     desvincula y deja el monto libre;
 *  2. un servicio del catálogo prellena concepto y monto;
 *  3. un identificador que **el catálogo no trae** se vincula sin prellenar
 *     nada.
 *
 * La tercera ya **no es alcanzable desde la pantalla**, y queda igual con el
 * motivo escrito. Lo era en T-2, porque el desplegable inyectaba el servicio que
 * la línea ya tenía aunque hubiera dejado de estar tarifado; el selector de T-2
 * bis no inyecta nada —muestra el nombre en el campo, que es
 * `textoDelServicioElegido`— así que lo único que esta función recibe es `""` o
 * un identificador de la lista. Se conserva porque es **la dirección segura**
 * para un llamador que pase un identificador que la lista no tiene: conservar la
 * procedencia y no prellenar. Desvincular en silencio borraría un dato que la
 * línea sí tiene, y prellenar es imposible —de un servicio sin cifra no hay
 * número que proponer—. La prueba afirma la dirección, no el camino.
 *
 * Que esta decisión viva acá y no en el `.tsx` es la regla del archivo: elegir
 * cuál de las tres ramas aplica es decidir, y el `.tsx` no decide.
 */
export function conServicioElegido(
  borrador: BorradorDeLinea,
  elegido: string,
  servicios: readonly {
    readonly id: string;
    readonly rotulo: string;
    readonly monto: number;
  }[],
): BorradorDeLinea {
  if (elegido.trim() === "") return sinServicioTarifado(borrador);

  const servicio = servicios.find((uno) => uno.id === elegido);
  if (servicio === undefined) {
    return { ...borrador, arancelRenglonId: elegido };
  }

  return prellenarDesdeServicio(borrador, servicio);
}

/* --------------------------------------------------------------------------
   Los rótulos de los cinco controles de una línea (T-2 bis)

   «Y aquí los distintos inputs deben tener un label: no me queda claro qué hace
   cada uno.» Es deuda anterior a esta tajada —los cinco controles de una línea
   guardada nunca tuvieron un rótulo a la vista— y se paga acá porque es donde se
   vio.

   Los rótulos viven en este archivo y no dentro del `.tsx` por lo mismo que
   todos los textos de la pantalla: así se pueden afirmar en una prueba en vez de
   quedar enterrados en un componente. Y son **un solo registro** y no cinco
   constantes sueltas, para que el alta y la fila guardada no puedan rotular
   distinto el mismo campo, que es exactamente lo que vuelve ilegible una
   pantalla con dos formularios del mismo dato.
   -------------------------------------------------------------------------- */

/**
 * Cómo se llama cada control de una línea, a la vista.
 *
 * Palabras cortas: en una fila angosta, los cinco rótulos se apilan con sus
 * controles, y un rótulo de cuatro palabras ocupa dos renglones por campo. Lo
 * que tiene que decir cada uno es **qué dato va ahí**, y para eso alcanza una
 * palabra. El detalle va en la ayuda de abajo, que es donde hay lugar.
 *
 * **No reemplazan al `aria-label` de una fila guardada**, y conviene dejarlo
 * escrito porque parece una duplicación: el nombre accesible de esos controles
 * lleva además el puesto de la línea dentro de su familia —«Concepto de la línea
 * 2 de Honorarios»— porque en una página con seis líneas hay seis controles de
 * concepto y un lector de pantalla los anuncia uno detrás del otro. El rótulo a
 * la vista no lo necesita: la fila se ve. Cada rótulo es **prefijo** de su
 * nombre accesible, que es lo que pide el criterio «rótulo en el nombre» de
 * WCAG 2.5.3, así que las dos cosas no se contradicen.
 */
export const ROTULOS_DE_LA_LINEA = {
  concepto: "Concepto",
  clase: "Clase",
  monto: "Importe",
  tramite: "Trámite",
  servicio: "Servicio",
} as const;

/* --------------------------------------------------------------------------
   Los textos del selector de servicio
   -------------------------------------------------------------------------- */

/** Lo que se dice debajo del selector de servicio. */
export const AYUDA_DEL_SERVICIO =
  "Escribí para buscar entre los precios del bufete. Elegir uno escribe el" +
  " concepto y el monto en la línea, y el monto se edita encima sin que eso" +
  " cambie nada en el catálogo. Para desvincularlo, vaciá el campo.";

/** El botón que abre la vista expandida. Las palabras son las del usuario. */
export const ROTULO_DE_LISTAR_TODOS = "Listar todos";

/** El encabezado de la vista expandida. */
export const TITULO_DE_LA_LISTA = "Los precios del bufete";

/**
 * Qué es la vista expandida y qué se hace con ella.
 *
 * No nombra el acuerdo, ni ningún mínimo, ni dice que haya nada que revisar: lo
 * único que separa una fila de otra ahí es quién escribió la cifra, y eso lo
 * cuenta `LEYENDA_DE_LA_MARCA`.
 */
export const AYUDA_DE_LA_LISTA =
  "Todos los servicios con precio, por categoría. Elegir uno lo escribe en la" +
  " línea y cierra esta vista.";

/** El buscador de la vista expandida. */
export const ROTULO_DE_LA_BUSQUEDA = "Buscar un servicio";

/**
 * El selector cuando el catálogo no trae un solo servicio con cifra.
 *
 * Ya no es el caso de todo el mundo —desde T-2 bis lo ofrecible son los 282
 * renglones con cifra, y una instalación sembrada los tiene todos—, así que lo
 * que esto dice ahora es que el catálogo está **vacío**: nadie corrió la
 * siembra, o la lectura trajo cero categorías. Una caja en blanco no dice nada;
 * esto dice qué pasó y adónde ir.
 */
export const SIN_SERVICIOS_OFRECIBLES =
  "El catálogo de precios está vacío: no hay ningún servicio con monto para" +
  " ofrecer acá. Los precios se ven y se editan en la pantalla de precios del" +
  " bufete.";

/** Lo que se dice cuando la búsqueda del selector no encuentra nada. */
export function sinCoincidencias(consulta: string): string {
  return `Ningún servicio coincide con «${consulta}».`;
}

/**
 * La dirección de la pantalla de precios del bufete.
 *
 * Sale de `enlaceDe` y no de un literal, por lo mismo que en el resto del
 * proyecto: una dirección armada a mano es la que se desincroniza del
 * resolvedor sin que nadie lo note.
 */
export function enlaceALosPrecios(): string {
  return enlaceDe({ nombre: "precios" });
}

/**
 * El pie del selector cuando el catálogo del bufete no se pudo traer.
 *
 * Es el gemelo de `avisoDeTramites` y tiene su misma forma por su mismo
 * argumento: el selector es una ayuda para no tener que acordarse de un número,
 * no un requisito para cotizar, así que lo que se pierde es el prellenado y no
 * la cotización. La frase lo dice con todas las letras.
 *
 * **Y el aviso no es de error**, que es una decisión del dibujo y no de este
 * texto: un `role="alert"` por un control de consulta que no cargó interrumpiría
 * la lectura de la pantalla entera para avisar de algo que no bloquea nada, y
 * además rompería los seis `getByRole("alert")` sin acotar de
 * `e2e/cotizaciones.spec.ts`, cuya suite contesta 404 a `GET /api/arancel`.
 */
export function avisoDePrecios(problema: string | null): string | null {
  if (problema === null) return null;

  return (
    `${problema} Los precios son una ayuda y no un requisito: las líneas se` +
    " pueden escribir igual, con el concepto y el monto a mano."
  );
}

/* --------------------------------------------------------------------------
   El teclado del selector
   -------------------------------------------------------------------------- */

/**
 * Qué opción queda activa al mover las flechas, **sin tocar el DOM**.
 *
 * Vive acá y no dentro del componente por la regla del archivo: elegir cuál es
 * la siguiente es una decisión, y una decisión que se puede equivocar en los dos
 * bordes es justamente la que conviene tener probada sin navegador.
 *
 * Tres reglas, y las tres salen del patrón de combobox que el navegador no
 * regala:
 *
 *  - **sin opciones no hay activa**, y el resultado es `-1`. Es el caso de una
 *    búsqueda sin resultados, y sin esto `Enter` elegiría la opción número cero
 *    de una lista vacía;
 *  - **desde ninguna activa**, bajar lleva a la primera y subir a la última. Es
 *    lo que hace que abrir la lista y apretar ↑ sirva para algo;
 *  - **da la vuelta en los dos extremos**. Una lista que se queda trabada en la
 *    última opción obliga a contar cuántas veces hay que subir.
 */
export function moverOpcionActiva(
  activa: number,
  cuantas: number,
  direccion: -1 | 1,
): number {
  if (cuantas === 0) return -1;
  if (activa < 0 || activa >= cuantas) return direccion === 1 ? 0 : cuantas - 1;

  return (activa + direccion + cuantas) % cuantas;
}
