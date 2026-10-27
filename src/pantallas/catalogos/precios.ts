/**
 * La lógica de las dos pantallas del arancel de honorarios (T-3 de
 * `odd/tasks/arancel-de-honorarios.md`), sin React y sin DOM.
 *
 * Misma frontera que el resto de los módulos de pantalla de este proyecto: lo
 * que se puede probar como función se escribe como función y vive en un
 * `.ts`, para que corra en el mismo corredor que la API en vez de exigir un
 * navegador para comparar cadenas. Lo que queda en los dos `.tsx` es el
 * dibujo. Lo que **solo** se puede ver dibujado —que ninguna fila renderice
 * dos cifras, que el enlace aterrice en el renglón, que la nota de
 * procedencia esté arriba— vive en `e2e/precios.spec.ts`.
 *
 * ## Un módulo para dos pantallas, y por qué
 *
 * `Precios.tsx` y `Arancel.tsx` son dos pantallas separadas a propósito, pero
 * deciden lo mismo sobre los mismos datos: qué renglón acepta un precio, qué
 * renglón coincide con lo que alguien buscó, y cómo se deletrea el ancla que
 * lleva de una a la otra. Esa última es la que obliga: el `href` lo escribe
 * la pantalla de precios y el `id` del `<tr>` lo escribe la del arancel, así
 * que dos literales serían un enlace que apunta a un identificador que nadie
 * escribe. Con una función, no hay lugar donde puedan discrepar.
 *
 * ## El corazón de la tajada: `precioALaVista` devuelve uno, nunca dos
 *
 * El Acuerdo No 49 de 2001 es una tarifa **mínima** de hace veinticinco años.
 * La primera versión del diseño ponía su monto al lado del del bufete y
 * avisaba cuando el propio quedaba por debajo. El usuario lo corrigió con
 * todas las letras:
 *
 * > «En lugar de siempre al lado, un tipo hipervínculo que te permita ver la
 * > tabla. Así no se siente que el sistema juzga tus precios, sino que el
 * > sistema sabe cuánto cuesta y te lo sugiere.»
 *
 * De ahí sale la forma de `PrecioALaVista`: **un** `centavos`, un `origen`
 * que dice de quién es ese número, y **ningún campo donde quepa el monto
 * oficial**. El tipo es la mitad del criterio de aceptación 4; la otra mitad
 * la mide el punta a punta sobre el dibujo.
 *
 * ## La conversión de dinero no se reimplementa
 *
 * `montoEditable` y `centavosDesdeTexto` viven en
 * `src/pantallas/cotizaciones/lineas.ts` y están probadas por los dos lados,
 * ida y vuelta, en `test/lineas-ui.spec.ts`. Se importan y no se copian: una
 * segunda conversión de dinero en este proyecto sería la que se desincroniza
 * sin que nadie lo note, y el precio de un servicio legal no es el lugar
 * donde descubrirlo.
 *
 * ## `llevaPrecio` sí es una segunda copia, y queda dicho por qué
 *
 * «Un rubro no lleva precio» tiene **tres** mitades en este proyecto: el
 * `CHECK un_rubro_no_lleva_precio` de
 * `migrations/0012_arancel_de_honorarios.sql`, que es la que manda;
 * `puedeLlevarPrecio` en `worker/arancel/dominio.ts`, que es la que deja
 * contestar un 409 `rubro_sin_precio` en vez de caerse; y ésta, que es la que
 * **evita dibujarle un campo de monto a un título**. Es la misma relación que
 * `catalogos/formulario.ts` tiene con `worker/catalogos/dominio.ts`: la
 * pantalla avisa antes de mandar, y la que respalda es la base.
 *
 * Importar la del Worker habría sido mejor —la flecha del proyecto va `src/` →
 * `worker/` y hay precedente: `cotizaciones/lineas.ts` importa de
 * `worker/cotizaciones/lineas.ts`— pero cuesta listar
 * `worker/arancel/dominio.ts` en el `include` de `tsconfig.app.json`, que es
 * un archivo fuera de la superficie autorizada de T-3. El módulo califica
 * para esa lista: lo único que importa son tipos de `worker/contract.ts`, que
 * se borran al compilar. Queda anotado como lo primero que hay que hacer la
 * próxima vez que ese `tsconfig` se abra por otro motivo.
 */

import type {
  CategoriaDelArancel,
  RenglonDelArancel,
} from "../../../worker/contract";
/*
 * `plano` y nada más. El orden alfabético de `ORDEN_ES` se fue con
 * `serviciosSeleccionables`: lo que el selector y la vista expandida muestran es
 * **el orden del acuerdo**, que es el orden en que alguien que conoce el
 * documento busca un servicio. Reordenarlo por rótulo mezclaría categorías.
 */
import { plano } from "../../formatos";
import { centavosDesdeTexto, montoEditable } from "../cotizaciones/lineas";
import { enlaceDe } from "../../ruteo";

/* ==========================================================================
   Los textos. Están acá y no dentro de los `.tsx` para que se puedan afirmar
   en una prueba en vez de quedar enterrados en un componente.
   ========================================================================== */

/**
 * La marca de que el número a la vista todavía es la sugerencia del acuerdo
 * y no una decisión del bufete.
 *
 * **Una palabra en minúscula y apagada, y eso es todo lo que puede ser.** No
 * es un aviso, no es un tono de error y no nombra el acuerdo: nombrar el
 * acuerdo encima del precio propio sería la advertencia permanente que el
 * usuario pidió sacar. Lo único que tiene que decir es que ese número lo
 * puso el sistema y no el bufete, para que nadie lo lea como una decisión que
 * ya se tomó.
 */
export const MARCA_SUGERIDO = "sugerido";

/**
 * El rótulo del enlace a la tabla del arancel.
 *
 * **Ofrece, no advierte.** «Ver el mínimo legal» o «Comparar con el arancel»
 * dicen que hay algo que revisar; esto dice que hay algo que consultar, que
 * es lo que de verdad hay. Es el rótulo que el documento de la tajada
 * escribió textualmente.
 */
export const ROTULO_DE_PROCEDENCIA = "de dónde sale este precio";

/**
 * Cómo se borra un precio propio, dicho una vez arriba de la tabla y no en
 * cada una de las 453 filas.
 *
 * Hace falta decirlo porque un campo vacío que **guarda un nulo** no es
 * obvio, y es la única forma de volver a la sugerencia después de haber
 * decidido un precio. La alternativa era un segundo botón por fila, o sea
 * cuatrocientos cincuenta y tres botones más para una operación que casi
 * nadie va a hacer.
 */
export const AYUDA_DEL_PRECIO_PROPIO =
  "El punto separa los centavos: 1500.75. La coma, si se usa, es de los" +
  " miles. Dejar el campo vacío y guardar quita el precio propio del" +
  " servicio y vuelve a dejar a la vista el valor que el sistema sugiere.";

/** El encabezado de la nota de procedencia, en la tabla del arancel. */
export const TITULO_DE_PROCEDENCIA = "De dónde salen estos valores";

/**
 * La nota de procedencia, párrafo por párrafo.
 *
 * **Vive en la tabla del arancel y no encima del precio del bufete**, y ésa
 * es la decisión entera: éste es el lugar al que alguien llegó justamente a
 * preguntar de dónde sale un número, así que es donde la respuesta sirve.
 * Puesta al lado del precio propio sería una advertencia permanente sobre una
 * decisión que ya tomó el abogado.
 *
 * Vive en `src/` y no en la base, y es decisión escrita de T-2: de qué
 * acuerdo salen los valores, de qué fecha y que son mínimos de 2001 es texto
 * de cara al usuario, y en esta aplicación eso vive junto a `src/mensajes.ts`
 * y `src/bitacora.ts`. Como fila habría que protegerla con su propio
 * disparador y sembrarla; como constante del contrato sería una tercera copia
 * del mismo literal que ya está en `scripts/arancel/arancel.json` y en el
 * encabezado de la migración.
 *
 * El tercer párrafo es el que no se puede omitir: sin él, un número de 2001
 * se lee como el precio de hoy.
 */
export const NOTA_DE_PROCEDENCIA: readonly string[] = [
  "Los valores de esta tabla son la transcripción del Acuerdo No 49 del 24" +
    " de abril de 2001 de la Sala Cuarta de Negocios Generales de la Corte" +
    " Suprema de Justicia, que aprueba la Tarifa de Honorarios Profesionales" +
    " Mínimos de los Abogados en la República de Panamá.",
  "Es una tarifa mínima y no una lista de precios: el propio acuerdo admite" +
    " que se pacten honorarios superiores. Los montos son de 2001 y nunca se" +
    " indexaron.",
  "Lo que el bufete cobra es decisión del bufete, se escribe en la pantalla" +
    " de precios y es lo único que se usa en una cotización. Esta tabla se" +
    " guarda para poder consultarla: se lee, no se edita.",
];

/* ==========================================================================
   El precio a la vista
   ========================================================================== */

/**
 * De quién es el número que la fila muestra.
 *
 *  - `bufete`: lo decidió el bufete. **Un cero entra acá**, y la distinción
 *    no es sutileza: cero es «esto no lo cobramos» y es una decisión, así que
 *    no se le puede poner encima la sugerencia del acuerdo.
 *  - `sugerido`: todavía no hay precio propio y lo que se ve es el valor que
 *    el sistema sugiere. El sistema sabe cuánto cuesta; que lo diga.
 *  - `sin_precio`: no hay nada que mostrar. Son los rubros —los 74
 *    encabezados que el acuerdo imprime sin valor— y las reglas por cuantía
 *    todavía sin precio propio, que no tienen monto que sugerir porque el
 *    acuerdo las imprimió como un porcentaje y no como un número.
 */
export type OrigenDelPrecio = "bufete" | "sugerido" | "sin_precio";

/**
 * El único precio de una fila.
 *
 * `texto` es lo que va dentro del campo editable, sin agrupar los miles,
 * porque lo que se lee ahí tiene que poder volver a mandarse sin tocar nada
 * —hay una prueba de ida y vuelta en `test/lineas-ui.spec.ts` que lo exige—.
 *
 * **No hay un segundo campo de dinero, y no es un olvido.** Ver el
 * encabezado de este archivo: si alguien agrega acá el monto oficial, la
 * prueba hostil de `test/precios-ui.spec.ts` que recorre los valores del
 * objeto se pone roja.
 */
export interface PrecioALaVista {
  readonly centavos: number | null;
  readonly origen: OrigenDelPrecio;
  readonly texto: string;
}

const SIN_PRECIO: PrecioALaVista = {
  centavos: null,
  origen: "sin_precio",
  texto: "",
};

/**
 * Si el renglón admite precio del bufete.
 *
 * El `rubro` no, y son **74**: los encabezados que el acuerdo imprime sin
 * ningún valor porque solo agrupan a sus hijos —«3. Inmigrantes», «12.
 * Recursos Administrativos»—. La fila con un monto escrito encima de un
 * título es una suma mal hecha esperando a que alguien la haga.
 *
 * El `regla` **sí**, y eso la tajada lo pide con todas las letras: las 97
 * reglas por cuantía se guardan como texto y «el bufete escribe su propio
 * monto al lado si quiere». Prohibirlo dejaría 97 servicios sin ninguna forma
 * de tener precio propio, que es lo contrario del motivo de la tabla.
 *
 * Es la tercera mitad de la regla; las otras dos están en el encabezado de
 * este archivo.
 */
export function llevaPrecio(renglon: RenglonDelArancel): boolean {
  return renglon.clase !== "rubro";
}

/**
 * El precio que la fila muestra, que es **uno**.
 *
 * El orden de las ramas es la regla entera: primero la decisión del bufete,
 * después la sugerencia, y recién después el hueco. Un rubro no llega ni a la
 * primera, porque un encabezado con precio es un dato que no significa nada.
 */
export function precioALaVista(renglon: RenglonDelArancel): PrecioALaVista {
  if (!llevaPrecio(renglon)) return SIN_PRECIO;

  if (renglon.monto !== null) {
    return {
      centavos: renglon.monto,
      origen: "bufete",
      texto: montoEditable(renglon.monto),
    };
  }

  if (renglon.montoOficial !== null) {
    return {
      centavos: renglon.montoOficial,
      origen: "sugerido",
      texto: montoEditable(renglon.montoOficial),
    };
  }

  return SIN_PRECIO;
}

/* ==========================================================================
   El ancla que une las dos pantallas
   ========================================================================== */

/**
 * Cómo se deletrea el renglón `id` como ancla del documento.
 *
 * Se usa en dos puntas —el `id` del `<tr>` en la tabla del arancel y el
 * fragmento del `href` en la pantalla de precios— y por eso es una función y
 * no dos plantillas de texto. El identificador es el `uuid` que puso la base,
 * así que no hay nada que escapar; el prefijo existe para que el ancla no
 * choque con un `id` de otra cosa de la página.
 */
export function anclaDelRenglon(id: string): string {
  return `renglon-${id}`;
}

/**
 * El enlace «de dónde sale este precio», completo.
 *
 * La ruta sale de `enlaceDe` y no de un literal, por lo mismo que en el resto
 * del proyecto: una dirección armada a mano es la que se desincroniza del
 * resolvedor sin que nadie lo note.
 */
export function enlaceAlRenglonDelArancel(id: string): string {
  return `${enlaceDe({ nombre: "arancel" })}#${anclaDelRenglon(id)}`;
}

/* ==========================================================================
   La búsqueda, y el rubro que encabeza lo que encuentra
   ========================================================================== */

/**
 * Qué texto se busca de cada renglón.
 *
 * El concepto propio, **más el del rubro que lo encabeza**. Lo segundo es por
 * cómo está escrito el documento: el acuerdo imprime «3. Inmigrantes» una vez
 * y cuelga de ahí sus letras —«a) Visa de pensionado»— sin repetir la palabra
 * en cada una. Buscar «inmigrantes» y no encontrar la visa de pensionado
 * sería buscar en la mitad del nombre del servicio.
 *
 * Se toma el rubro **inmediatamente anterior** dentro de la categoría. El
 * acuerdo no anida rubros dentro de rubros —T-1 lo midió renglón por
 * renglón—, así que un solo nivel alcanza; el día que apareciera un anidado,
 * esto encontraría de menos y nunca de más.
 */
function textoBuscableDe(
  renglon: RenglonDelArancel,
  rubro: RenglonDelArancel | null,
): string {
  return rubro === null
    ? plano(renglon.concepto)
    : `${plano(rubro.concepto)} ${plano(renglon.concepto)}`;
}

/**
 * Los renglones que coinciden con `consulta`, con sus rubros.
 *
 * Dos reglas, y las dos salen de que el rubro es un encabezado y no un
 * servicio:
 *
 *  - un rubro **nunca** es un resultado por sí mismo. Un encabezado solo es
 *    un título sin lo que titulaba;
 *  - un rubro sobrevive si sobrevivió al menos uno de los renglones que
 *    encabeza, y ahí va **delante** de ellos, como en el documento.
 *
 * Con la consulta vacía devuelve el arreglo tal como vino: la tabla entera,
 * en el orden del acuerdo.
 */
function filtrarRenglones(
  renglones: readonly RenglonDelArancel[],
  consulta: string,
): RenglonDelArancel[] {
  const buscado = plano(consulta.trim());
  if (buscado === "") return [...renglones];

  const resultado: RenglonDelArancel[] = [];
  let rubro: RenglonDelArancel | null = null;
  let rubroPuesto = false;

  for (const renglon of renglones) {
    if (renglon.clase === "rubro") {
      rubro = renglon;
      rubroPuesto = false;
      continue;
    }

    if (!textoBuscableDe(renglon, rubro).includes(buscado)) continue;

    if (rubro !== null && !rubroPuesto) {
      resultado.push(rubro);
      rubroPuesto = true;
    }
    resultado.push(renglon);
  }

  return resultado;
}

/* ==========================================================================
   Los servicios que la cotización puede ofrecer (T-2 de
   `odd/tasks/precios-en-la-cotizacion.md`, corregido por T-2 bis)

   Esta sección no es de las dos pantallas del arancel: es lo que el editor de
   líneas de una cotización necesita saber del catálogo. Vive acá y no en
   `src/pantallas/cotizaciones/lineas.ts` por pertenencia —lo que contesta es
   una pregunta sobre el arancel, y el buscador que usa es el que esta pantalla
   ya tenía escrito y probado— y porque la flecha de importación no se puede
   invertir: este archivo ya importa la conversión de dinero de allá.

   ## La corrección de T-2 bis, que cambia de qué se trata esta sección

   T-2 ofreció **los renglones con precio propio**: 7 de 453 en la base de
   desarrollo, y los 275 que todavía dicen lo que dice el acuerdo quedaron
   afuera. El usuario lo corrigió al verlo:

     > «Siempre debemos mostrar todos los precios, hayan sido modificados por mí
     > o sean los preestablecidos. Los preestablecidos son eso, preestablecidos:
     > siempre pueden ser editables, pero **son la norma hasta que se editen, no
     > son una subcategoría**.»

   Y tenía razón contra el propio sistema: `precioALaVista`, treinta líneas más
   arriba, **ya** muestra el preestablecido como el valor del campo en la
   pantalla de precios. Eran dos criterios distintos para la misma pregunta en
   dos pantallas del mismo sistema.

   Así que lo ofrecible son los renglones **con una cifra**, de donde sea que
   venga. Medido sobre la base local: **282 de 453**. Quedan afuera las 97
   reglas por cuantía sin ningún número y los 74 rubros, que son encabezados.

   ## Sigue habiendo una sola cifra por servicio, y eso no se renegocia

   `ServicioOfrecible` tiene **un** `monto`, y no tiene dónde poner un segundo
   número. Es la misma decisión que `PrecioALaVista` tomó para la pantalla de
   precios: dos cifras de dinero al lado sólo se pueden leer como la comparación
   que `odd/tasks/arancel-de-honorarios.md` prohibió. Lo que T-2 bis agrega es
   `editado`, que **no es un número**: dice de cuál de los dos orígenes salió la
   única cifra, nunca cómo se mide contra el otro.
   ========================================================================== */

/**
 * Un servicio que la cotización puede ofrecer: **uno que tiene una cifra**.
 *
 * `monto` es `number` y no `number | null`, y ésa es la definición entera de
 * esta lista: un renglón sin ninguna cifra no es ofrecible, porque no hay
 * número que proponer y porque la base rechaza la línea que lo nombrara
 * —`cotizacion_linea_el_origen_del_precio_tiene_precio_al_insertar`, relajado
 * en `migrations/0015_un_precio_es_una_cifra.sql`—. Los 74 rubros se caen por
 * el mismo filtro y sin nombrarlos: el acuerdo los imprime sin valor y el
 * `CHECK un_rubro_no_lleva_precio` les prohíbe el propio.
 *
 * `editado` dice si la cifra la escribió el bufete. **No es una categoría del
 * servicio y no cambia lo que se puede hacer con él**: los dos se ofrecen
 * igual, los dos prellenan igual y los dos son editables encima. Existe para
 * una marca sutil —un asterisco— que sólo se dibuja en la vista expandida, con
 * su leyenda. Es la palabra del usuario: «un indicativo visual si es
 * preestablecido o editado, algo sutil».
 *
 * `rubro` es el concepto del encabezado que agrupa al servicio, cuando el
 * numeral demuestra que cuelga de él. Hace falta porque el acuerdo imprime «3.
 * Inmigrantes» una vez y cuelga de ahí sus letras sin repetir la palabra, y
 * porque **muchos renglones del acuerdo tienen un concepto que es un fragmento**
 * —«primer año», «Reconsideración», «Persona Natural»— que solo significa algo
 * debajo de su encabezado.
 *
 * `rotulo` es el nombre completo, y es un campo y no una función suelta porque
 * lo usan tres cosas que no pueden decidir distinto: el buscador del selector,
 * la vista expandida y el concepto que el prellenado propone. Lo escribe
 * `serviciosOfrecibles`, que es el único constructor, con `rotuloDeServicio`,
 * que sigue siendo la única definición de cómo se arma.
 */
export interface ServicioOfrecible {
  readonly id: string;
  readonly concepto: string;
  readonly rubro: string | null;
  /** El nombre completo: el rubro delante del concepto, cuando hay rubro. */
  readonly rotulo: string;
  readonly categoria: string;
  /** La única cifra del servicio, en centavos enteros. */
  readonly monto: number;
  /** Si esa cifra la escribió el bufete. `false` es un preestablecido. */
  readonly editado: boolean;
}

/**
 * Si el numeral de `renglon` **demuestra** que cuelga de `rubro`.
 *
 * ## Por qué hace falta demostrarlo, y no alcanza «el rubro de más arriba»
 *
 * Defecto medido en el navegador con los 453 renglones de verdad, antes de
 * escribir esta función: el panel de la cotización decía **«Inversionista ·
 * Naturalizaciones»**. Y es falso. En «ASUNTOS ADMINISTRATIVOS (MIGRACIÓN)» el
 * acuerdo imprime el rubro `3.b` «Inversionista» con sus dos hijos `b.1` y
 * `b.2`, y después sigue con `4` «Naturalizaciones», que es **hermano del
 * rubro y no hijo**. Tomar el último rubro visto adopta a todo lo que venga
 * después hasta el final de la categoría.
 *
 * Un rótulo que miente es peor que uno que falta: el que falta obliga a mirar
 * el documento, y el que miente manda a cotizar el servicio equivocado.
 *
 * ## La regla, medida sobre `scripts/arancel/arancel.json`
 *
 * El numeral cuelga del rubro cuando:
 *
 *  - **es el mismo** —son los renglones que el acuerdo imprime sin numerar y
 *    heredan el del padre, la lectura de T-1: `3` «Contratos Administrativos»
 *    con sus `3` «Elaboración» y `3` «Revisión»—; **5 renglones**;
 *  - **extiende el del rubro**: `3` → `3.a`;
 *  - **extiende su último tramo**, porque las letras reinician bajo cada
 *    padre: `3.b` → `b.1`, `b.2`.
 *
 * Medido sobre los 453: **142 renglones** quedan adoptados y 237 no, y los no
 * adoptados son los hermanos de nivel superior que venían después de un rubro.
 * La regla **falla hacia el hueco**: ante la duda no atribuye, que es la
 * dirección correcta para un dato que se le muestra a alguien que está
 * poniéndole precio a su trabajo.
 */
function cuelgaDelRubro(
  renglon: RenglonDelArancel,
  rubro: RenglonDelArancel,
): boolean {
  const propio = renglon.numeral.trim();
  const padre = rubro.numeral.trim();
  if (propio === padre) return true;
  if (propio.startsWith(`${padre}.`)) return true;

  const tramos = padre.split(".");
  const ultimo = tramos[tramos.length - 1];
  return ultimo !== padre && propio.startsWith(`${ultimo}.`);
}

/**
 * Los servicios que la cotización puede ofrecer, **en el orden del documento**.
 *
 * No se reordenan ni se reagrupan: vienen del servidor en el orden del acuerdo,
 * que es el orden en que alguien que conoce el documento los busca. Quien los
 * agrupa para la vista expandida es `serviciosPorCategoria`; acá sólo se filtra
 * y se resuelve el rubro.
 *
 * El filtro es **`monto ?? montoOficial`**, que es la corrección de T-2 bis. El
 * `??` elige cuál de los dos existe y jamás cuál es mayor: no hay un operador de
 * orden en esta función, y no puede haberlo —el sistema sugiere, no juzga—.
 *
 * El rubro candidato es el **inmediatamente anterior dentro de la categoría**
 * —el acuerdo no anida rubros dentro de rubros, y T-1 lo midió renglón por
 * renglón— y se le atribuye el servicio sólo si `cuelgaDelRubro` lo demuestra.
 */
export function serviciosOfrecibles(
  categorias: readonly CategoriaDelArancel[],
): ServicioOfrecible[] {
  const servicios: ServicioOfrecible[] = [];

  for (const categoria of categorias) {
    let rubro: RenglonDelArancel | null = null;

    for (const renglon of categoria.renglones) {
      if (renglon.clase === "rubro") {
        rubro = renglon;
        continue;
      }

      const cifra = renglon.monto ?? renglon.montoOficial;
      if (cifra === null) continue;

      const suyo = rubro !== null && cuelgaDelRubro(renglon, rubro);
      const encabezado = suyo && rubro !== null ? rubro.concepto : null;

      servicios.push({
        id: renglon.id,
        concepto: renglon.concepto,
        rubro: encabezado,
        rotulo: rotuloDeServicio({
          concepto: renglon.concepto,
          rubro: encabezado,
        }),
        categoria: categoria.nombre,
        monto: cifra,
        editado: renglon.monto !== null,
      });
    }
  }

  return servicios;
}

/**
 * Cómo se nombra un servicio donde hay que distinguirlo de otro.
 *
 * El rubro delante y el concepto detrás, separados por un punto medio. **No es
 * el concepto que va a la línea**: lo que el cliente lee en la propuesta es
 * «Visa de pensionado o jubilado», y «Inmigrantes · Visa de pensionado o
 * jubilado» es la forma que un desplegable necesita para no ser ambiguo. Las
 * dos cosas son distintas y por eso son dos funciones.
 */
export function rotuloDeServicio(partes: {
  readonly concepto: string;
  readonly rubro: string | null;
}): string {
  return partes.rubro === null
    ? partes.concepto
    : `${partes.rubro} · ${partes.concepto}`;
}

/**
 * Los servicios que coinciden con `consulta`.
 *
 * Busca sobre el concepto **y sobre el rubro que lo encabeza**, que es la misma
 * regla que `filtrarRenglones`: buscar «inmigrantes» y no encontrar la visa de
 * pensionado sería buscar en la mitad del nombre del servicio. Con la consulta
 * vacía devuelve todo, en el orden en que llegó.
 */
export function serviciosQueCoinciden(
  servicios: readonly ServicioOfrecible[],
  consulta: string,
): ServicioOfrecible[] {
  const buscado = plano(consulta.trim());
  if (buscado === "") return [...servicios];

  return servicios.filter((servicio) =>
    plano(servicio.rotulo).includes(buscado),
  );
}

/**
 * Cómo se nombra al servicio que la línea tiene y no se pudo nombrar.
 *
 * `arancelConcepto` llega nulo si la fila apuntada cruzara la frontera del
 * tenant. Aun así el control necesita un texto: poner el identificador crudo
 * sería un UUID dentro de un campo, y dejarlo vacío diría que la línea no tiene
 * procedencia cuando sí la tiene. Es el mismo recurso que `TRAMITE_SIN_NOMBRE`.
 */
export const SERVICIO_SIN_NOMBRE = "El servicio que la línea ya tenía";

/**
 * Qué texto muestra el selector cuando la línea ya tiene un servicio elegido.
 *
 * ## Lo que esta función reemplaza, y por qué es menos código y no más
 *
 * T-2 tenía acá `serviciosSeleccionables`, que **inyectaba** en el desplegable
 * el servicio que la línea ya tenía aunque el catálogo no lo trajera. Esa
 * inyección existía por un defecto que es exclusivo del `<select>`: un
 * `<select>` controlado cuyo valor no corresponde a ninguna opción cae en la
 * primera, así que quien mira lee «Ninguno» sobre una línea que sí tiene
 * procedencia y, si toca el control creyendo que confirma, la borra.
 *
 * **Un combobox no tiene ese defecto**: lo que se ve es el texto del campo, y
 * ese texto lo escribe esta función. Así que la opción fantasma desaparece de la
 * lista —donde no podía elegirse para nada útil, porque de un servicio sin cifra
 * no hay número que proponer— y lo que queda es un nombre a la vista.
 *
 * Las tres ramas:
 *
 *  1. nada elegido → el campo está vacío y es un buscador;
 *  2. elegido y en el catálogo → su rótulo completo, que es lo que se eligió;
 *  3. elegido y **fuera** del catálogo → lo que la lectura resolvió del renglón,
 *     o la frase de reserva. Es alcanzable sin que nadie se equivoque: el bufete
 *     puede borrarle el precio a una regla por cuantía que una línea ya nombra.
 *
 * El nombre de la tercera rama es el concepto **sin rubro**, porque lo único que
 * se sabe de él es lo que la lectura trajo: el renglón pudo dejar de estar en la
 * lista, así que no hay de dónde sacar el encabezado que lo agrupaba.
 */
export function textoDelServicioElegido(
  servicios: readonly ServicioOfrecible[],
  elegido: string,
  conceptoDeLaLinea: string | null,
): string {
  if (elegido === "") return "";

  const servicio = servicios.find((uno) => uno.id === elegido);
  if (servicio !== undefined) return servicio.rotulo;

  return conceptoDeLaLinea ?? SERVICIO_SIN_NOMBRE;
}

/* --------------------------------------------------------------------------
   La vista expandida: «listar todos»
   -------------------------------------------------------------------------- */

/** Una categoría del acuerdo con los servicios ofrecibles que tiene. */
export interface GrupoDeServicios {
  readonly categoria: string;
  readonly servicios: readonly ServicioOfrecible[];
}

/**
 * Los servicios agrupados por categoría, **en el orden en que llegaron**.
 *
 * Es lo que la vista expandida necesita y el selector no: en una lista de
 * doscientos ochenta y dos renglones, la categoría del acuerdo es lo que deja
 * recorrerla con el ojo. En el selector no va, porque ahí lo que hay es una
 * lista corta de resultados de una búsqueda.
 *
 * No se reordena nada: `serviciosOfrecibles` ya los devuelve en el orden del
 * documento, y una pantalla que recompusiera ese orden sería una segunda versión
 * del acuerdo. Las categorías salen en el orden de su primera aparición, que es
 * el mismo, y una categoría sin ningún servicio ofrecible no sale.
 */
export function serviciosPorCategoria(
  servicios: readonly ServicioOfrecible[],
): GrupoDeServicios[] {
  /* El acumulador es mutable y el tipo que sale es de sólo lectura: así se
     arma de una pasada sin un `as` que le quite el `readonly` a nadie. */
  const grupos: { categoria: string; servicios: ServicioOfrecible[] }[] = [];

  for (const servicio of servicios) {
    const ultimo = grupos[grupos.length - 1];

    if (ultimo !== undefined && ultimo.categoria === servicio.categoria) {
      ultimo.servicios.push(servicio);
      continue;
    }

    grupos.push({ categoria: servicio.categoria, servicios: [servicio] });
  }

  return grupos;
}

/**
 * La marca sutil de que la cifra la escribió el bufete.
 *
 * **Un asterisco, y eso es todo lo que puede ser.** Es la palabra del usuario
 * —«algo sutil, una marca, un asterisco»— y es deliberadamente lo contrario de
 * un aviso: no es un color, no es un ícono de alerta y no dice nada de si el
 * número está bien. Dice **de cuál de dos orígenes salió**, que es un hecho, no
 * un juicio.
 *
 * Y va **sólo en la vista expandida**. En el selector no: ahí son todos precios
 * y nada más, que es lo que el usuario pidió con todas las letras.
 */
export const MARCA_DE_EDITADO = "*";

/**
 * Qué significa el asterisco, dicho una vez debajo de la lista.
 *
 * Tiene que estar porque una marca sin leyenda es un signo que obliga a
 * adivinar. Y tiene que decir **sólo** eso: no nombra el acuerdo, no nombra
 * ningún mínimo y no sugiere que haya algo que revisar. Las dos palabras son las
 * del usuario: editado y preestablecido.
 */
export const LEYENDA_DE_LA_MARCA =
  "El asterisco marca los precios que el bufete editó. Los demás son los" +
  " preestablecidos, y se usan igual: elegirlos escribe su monto en la línea y" +
  " el monto se edita encima.";

/** El nombre accesible de la marca, para quien no ve el asterisco. */
export const MARCA_DE_EDITADO_LEIDA = "precio editado por el bufete";

/* ==========================================================================
   Los grupos de la pantalla de precios
   ========================================================================== */

/** Una fila de la pantalla de precios: el renglón, su precio y si lo acepta. */
export interface FilaDePrecio {
  readonly renglon: RenglonDelArancel;
  readonly precio: PrecioALaVista;
  readonly llevaPrecio: boolean;
}

/** Una categoría del acuerdo con sus filas de precio. */
export interface GrupoDePrecios {
  readonly categoria: string;
  readonly filas: readonly FilaDePrecio[];
}

/**
 * La pantalla de precios, agrupada como el documento y filtrada.
 *
 * **Las categorías no se reordenan.** Vienen agrupadas y ordenadas del
 * servidor, porque el orden de las categorías es un dato del acuerdo; una
 * pantalla que lo recompusiera por su cuenta sería una segunda versión del
 * documento, y la que se desincronice primero lo hace sin que nadie lo note.
 *
 * Las categorías que llegan sin renglones **se caen acá y no en la tabla del
 * arancel**. Son las dos que el acuerdo imprime solo como prosa —«OTROS
 * ASUNTOS» y «PROCESO DE SEPARACIONES DE BIENES…»—: en la tabla tienen que
 * verse porque son parte del documento, y acá no hay nada que tarifar en
 * ellas.
 */
export function gruposDePrecios(
  categorias: readonly CategoriaDelArancel[],
  consulta: string,
): GrupoDePrecios[] {
  const grupos: GrupoDePrecios[] = [];

  for (const categoria of categorias) {
    const renglones = filtrarRenglones(categoria.renglones, consulta);
    if (renglones.length === 0) continue;

    grupos.push({
      categoria: categoria.nombre,
      filas: renglones.map((renglon) => ({
        renglon,
        precio: precioALaVista(renglon),
        llevaPrecio: llevaPrecio(renglon),
      })),
    });
  }

  return grupos;
}

/** Cuántas filas quedaron a la vista, para el conteo de la búsqueda. */
export function cuantasFilas(grupos: readonly GrupoDePrecios[]): number {
  return grupos.reduce((total, grupo) => total + grupo.filas.length, 0);
}

/** Cuántos renglones trae la tabla entera, filtre o no la búsqueda. */
export function cuantosRenglones(
  categorias: readonly CategoriaDelArancel[],
): number {
  return categorias.reduce(
    (total, categoria) => total + categoria.renglones.length,
    0,
  );
}

/* ==========================================================================
   La tabla del arancel, filtrada
   ========================================================================== */

/**
 * El documento con la búsqueda aplicada sobre los conceptos.
 *
 * Con la consulta vacía devuelve **todo**, las dos categorías de pura prosa
 * incluidas: es el documento completo y así se tiene que poder leer. Con una
 * consulta se cae lo que no coincide, y con eso se caen también esas dos, que
 * no tienen ningún renglón que pueda coincidir; dejarlas sería dejar un
 * encabezado suelto en medio de un resultado de búsqueda.
 *
 * Las notas de una categoría que sobrevive **se conservan enteras**. Son
 * parágrafos que cambian el precio de todas las filas de su categoría y no de
 * una, así que recortarlas junto con las filas diría de menos sobre las que
 * quedaron.
 */
export function categoriasFiltradas(
  categorias: readonly CategoriaDelArancel[],
  consulta: string,
): CategoriaDelArancel[] {
  if (plano(consulta.trim()) === "") return [...categorias];

  const resultado: CategoriaDelArancel[] = [];

  for (const categoria of categorias) {
    const renglones = filtrarRenglones(categoria.renglones, consulta);
    if (renglones.length === 0) continue;

    resultado.push({ ...categoria, renglones });
  }

  return resultado;
}

/* ==========================================================================
   El precio que el bufete escribe
   ========================================================================== */

/**
 * Lo tecleado, convertido a lo que `fijarMontoDelArancel` manda.
 *
 * El campo vacío **no es un cero**: es un nulo, y el nulo borra el precio
 * propio y devuelve la sugerencia a la vista. Un cero es una decisión del
 * bufete —«esto no lo cobramos»— y tiene que poder guardarse como tal.
 */
export type PrecioEscrito =
  | { readonly ok: true; readonly monto: number | null }
  | { readonly ok: false };

export function montoParaGuardar(texto: string): PrecioEscrito {
  if (texto.trim() === "") return { ok: true, monto: null };

  const conversion = centavosDesdeTexto(texto);
  return conversion.ok ? { ok: true, monto: conversion.centavos } : { ok: false };
}

/**
 * Si lo tecleado cambia **lo que el bufete guardó**.
 *
 * Se compara contra `renglon.monto` y no contra el precio a la vista, y la
 * diferencia es la que hace que adoptar la sugerencia sea posible: en una
 * fila sin precio propio el campo muestra el valor sugerido, y guardarlo
 * convierte una referencia en una decisión del bufete. Eso es un cambio y el
 * botón tiene que poder apretarse.
 *
 * Lo que no es un cambio es borrar lo que no hay: un campo vacío sobre un
 * renglón sin precio propio sería un `PUT` que no cambia nada y un asiento de
 * bitácora de algo que no pasó.
 *
 * Lo que no se puede convertir tampoco es un cambio **que se pueda guardar**,
 * así que devuelve `false` y el botón queda apagado. El aviso de que lo
 * tecleado no es un importe lo da la pantalla aparte.
 */
export function hayCambioDePrecio(
  renglon: RenglonDelArancel,
  texto: string,
): boolean {
  const escrito = montoParaGuardar(texto);
  return escrito.ok && escrito.monto !== renglon.monto;
}

/** Los borradores de la pantalla de precios, por identificador de renglón. */
export type BorradoresDePrecio = Readonly<Record<string, string>>;

/**
 * Los borradores sin el de `id`, en una copia nueva.
 *
 * Es una función y no un `delete` adentro del componente por dos razones. La
 * primera es que el mapa **es estado de React** y mutarlo en el lugar sería
 * un cambio que no vuelve a renderizar. La segunda es que tirar el borrador
 * después de guardar es una decisión con consecuencia visible —es lo que hace
 * desaparecer el botón de guardar y lo que deja a la vista el valor que
 * contestó el servidor en vez del texto viejo— y acá tiene prueba.
 */
export function sinBorrador(
  borradores: BorradoresDePrecio,
  id: string,
): BorradoresDePrecio {
  const resto: Record<string, string> = {};

  for (const [clave, texto] of Object.entries(borradores)) {
    if (clave !== id) resto[clave] = texto;
  }

  return resto;
}
