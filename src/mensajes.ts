/**
 * Un motivo de falla de la API, dicho para quien está mirando la pantalla.
 *
 * El mapa vive en un módulo propio y no dentro de una pantalla porque el
 * vocabulario de fallas es uno solo para toda la API (`worker/contract.ts`),
 * y `MotivoDeFalla` es exhaustivo: el día que el Worker agregue un motivo,
 * este `Record` deja de compilar hasta que alguien escriba qué decirle al
 * usuario. Esa es toda la gracia — que no se pueda agregar un motivo sin
 * texto y descubrirlo en producción como un mensaje en blanco.
 */

import {
  MOTIVOS_DE_FALLA_DEL_MODELO,
  type MotivoDeFalla,
  type MotivoDeFallaDelComprobante,
  type MotivoDeFallaDelModelo,
  type MotivoDeNombreDuplicado,
  type NombreDuplicado,
} from "../worker/contract";

const MENSAJES: Record<MotivoDeFalla, string> = {
  tipo_invalido: "Ese campo no se entendió.",
  nombre_requerido: "El nombre es obligatorio.",
  contacto_requerido:
    "Hace falta al menos un medio de contacto: un teléfono o un correo.",
  correo_invalido: "Ese correo no parece un correo.",
  telefono_invalido: "Un teléfono tiene que llevar al menos un número.",
  documento_incompleto: "El documento va con tipo y número, o sin ninguno.",
  tipo_cliente_desconocido: "Ese tipo de cliente ya no existe.",
  area_requerida: "Hay que elegir el área a la que pertenece.",
  area_desconocida: "Esa área ya no existe.",
  etapa_desconocida:
    "Una de las etapas ya no existe o está repetida. Hay que volver a" +
    " cargar la plantilla.",
  /* Lo comparten el proceso (T-7, I-2) y la cotización (tajada 2, I-1), así
     que la frase no puede nombrar a ninguno de los dos: es el mismo
     argumento que llevó a `texto_requerido` a dejar de hablar de la nota
     cuando el pendiente empezó a compartirlo. */
  cliente_requerido: "Hay que elegir el cliente.",
  cliente_desconocido: "Ese cliente ya no existe.",
  tipo_proceso_requerido: "Hay que elegir el tipo de proceso.",
  tipo_proceso_desconocido: "Ese tipo de proceso ya no existe.",
  responsable_desconocido: "Esa persona ya no está en el bufete.",
  titulo_requerido:
    "El título es obligatorio: es lo que distingue este proceso de otro" +
    " del mismo tipo.",
  etapa_alcanzada_no_se_quita:
    "Una etapa ya cumplida no se puede quitar: es el registro de lo que" +
    " pasó, y lo que se anotó en ella quedaría sin dónde colgar.",
  etapa_alcanzada_no_se_mueve:
    "Una etapa ya cumplida no se puede mover, y no se puede meter un paso" +
    " nuevo por delante de ella. Lo que falta se agrega después.",
  destino_invalido:
    "Hay que elegir si se actualiza la plantilla de este tipo de proceso o" +
    " si se crea un tipo nuevo.",
  plan_vacio:
    "Este proceso no tiene plan todavía: no hay pasos que guardar como" +
    " plantilla.",
  /* `texto_requerido` lo comparten la nota (T-8) y el pendiente (T-9), así
     que la frase no puede nombrar a ninguno de los dos: un «la nota no
     puede ir vacía» debajo del formulario de pendientes es un mensaje que
     habla de otra cosa. */
  texto_requerido:
    "Sin texto no hay nada que guardar: es lo único que se escribe acá, y" +
    " el resto —quién y cuándo— lo pone el sistema.",
  etapa_de_otro_proceso:
    "Esa etapa no es de este proceso. Hay que volver a cargar el proceso.",
  proceso_sin_etapas:
    "Este proceso no tiene ningún paso todavía, y una nota se ancla a la" +
    " etapa donde ocurrió. Hay que agregarle al menos un paso al plan.",
  etapa_con_notas_no_se_quita:
    "Esa etapa tiene notas y no se puede quitar del plan: las notas son el" +
    " registro de lo que pasó y quedarían sin dónde colgar.",
  vencimiento_invalido:
    "Ese vencimiento no es una fecha del calendario. Va como día, mes y" +
    " año de un día que exista.",
  /* Dice que hoy sirve, porque el borde es justo el que la persona va a
     querer: una cotización que se manda y se responde el mismo día es el
     caso corriente. Sin esa media frase, el rechazo se lee como «tiene que
     ser mañana o después» y alguien pone un día de más por las dudas. */
  vencimiento_pasado:
    "Ese vencimiento ya pasó. Hay que poner un día de hoy en adelante, o" +
    " dejarlo en blanco si la cotización no vence.",
  etapa_con_pendientes_no_se_quita:
    "En esa etapa nació un pendiente y no se puede quitar del plan: un" +
    " pendiente guarda dónde apareció, y eso no se cambia de lugar. Cerrarlo" +
    " no alcanza, porque el registro queda igual.",
  /* El tipo sale de un desplegable que la pantalla dibuja del mismo registro
     contra el que el servidor valida, así que la frase sirve igual para «no
     elegiste ninguno» y para «ese no existe»: en los dos casos lo que hay
     que hacer es elegir uno de la lista. */
  tipo_de_modulo_desconocido:
    "Ese no es un tipo de módulo. Hay que elegir uno de la lista.",
  /* No dice «el texto es obligatorio» sino qué pasa si se guarda vacío: lo
     que la persona está por hacer es emitir un título sin nada debajo. */
  contenido_requerido:
    "Un módulo sin texto es un título sin nada debajo. Hay que escribir qué" +
    " dice, o quitarlo.",
  modulo_desconocido:
    "Uno de los módulos ya no es de esta cotización. Hay que volver a" +
    " cargarla.",
  /* Lo comparten los módulos de prosa y las líneas, así que la frase no
     puede nombrar a ninguno de los dos: es el mismo argumento que dejó a
     `texto_requerido` sin nombrar la nota cuando el pendiente empezó a
     compartirlo. */
  orden_incompleto:
    "La lista no coincide con lo que tiene esta cotización. Hay que volver a" +
    " cargarla antes de reordenarla.",
  /* La clase sale de un control que la pantalla dibuja del mismo registro
     contra el que el servidor valida, así que la frase sirve igual para «no
     elegiste ninguna» y para «esa no existe». */
  clase_de_linea_desconocida:
    "Hay que decir si la línea es un honorario o un gasto estimado.",
  /* No dice «el concepto es obligatorio» sino qué pasa sin él: lo que la
     persona está por mandarle al cliente es un monto sin explicación. */
  concepto_requerido:
    "Sin concepto, la línea es un monto que el cliente no sabe por qué está" +
    " pagando. Hay que decir qué se cobra.",
  /* Una sola frase para las cuatro formas de no ser un importe —ausente, no
     numérico, con centavos partidos y negativo— porque desde donde está la
     persona las cuatro son lo mismo y se arreglan igual. */
  monto_invalido:
    "Ese monto no es un importe. Va un número de cero en adelante, sin" +
    " centavos partidos.",
  linea_desconocida:
    "Una de las líneas ya no es de esta cotización. Hay que volver a" +
    " cargarla.",
  /* No dice «la descripción es obligatoria» sino qué pasa sin ella: el
     modelo no adivina de qué se trata el encargo, y lo que la persona
     tiene que hacer es contarlo. */
  descripcion_requerida:
    "Sin una descripción del encargo no hay nada que generar. Con dos" +
    " renglones alcanza: de qué se trata, y lo que el cliente pidió.",
  /* El tipo sale de un control que la pantalla dibuja del mismo registro
     contra el que el servidor valida, así que la frase sirve igual para «no
     elegiste ninguno» y para «ese no existe». Nombra las dos palabras del
     vocabulario porque son las dos cosas que la persona tiene que distinguir:
     plata que salió y plata que entró. */
  tipo_de_movimiento_desconocido:
    "Hay que decir si es un gasto que pagó el bufete o un anticipo que puso" +
    " el cliente.",
  fecha_invalida:
    "Esa fecha no es un día del calendario. Va el día en que la plata se" +
    " movió, con día, mes y año de un día que exista.",
  /* No dice «la fecha no puede ser futura» sino por qué: lo que la persona
     está por cargar todavía no ocurrió, y el sitio de lo que va a ocurrir es
     la cotización. */
  fecha_futura:
    "Esa fecha todavía no llegó. Acá va lo que ya se movió; lo que se" +
    " espera gastar va como gasto estimado en la cotización.",
  /* Una sola frase para el archivo vacío y para el que no es ni PDF ni
     imagen: desde donde está la persona las dos son lo mismo y se arreglan
     eligiendo otro archivo. */
  comprobante_no_admitido:
    "Eso no se puede guardar como comprobante. Va el PDF de la factura o" +
    " una foto del recibo, en JPG o PNG.",
  /* Dice el tope porque un rechazo que no lo dice obliga a adivinarlo
     subiendo, y dice qué hacer con el archivo que ya se tiene. */
  comprobante_demasiado_grande:
    "Ese archivo pasa de 10 MB. Conviene volver a escanearlo con menos" +
    " resolución, o sacar la foto de nuevo.",
};

/**
 * `cuantos` solo lo traen los motivos que cuentan dependientes antes de
 * rechazar. Un rechazo que dice «tiene notas» obliga a ir a contarlas; con
 * el número, la frase es accionable de una. El parámetro es opcional para
 * que los motivos que no cuentan nada sigan llamándose igual.
 */
export function mensajeDeFalla(
  motivo: MotivoDeFalla,
  cuantos?: number,
): string {
  if (cuantos === undefined) return MENSAJES[motivo];

  if (motivo === "etapa_con_notas_no_se_quita") {
    return (
      `Esa etapa tiene ${String(cuantos)} ${
        cuantos === 1 ? "nota" : "notas"
      } y no se puede quitar del plan: las notas son el registro de lo que` +
      " pasó y quedarían sin dónde colgar."
    );
  }

  if (motivo === "etapa_con_pendientes_no_se_quita") {
    return (
      `En esa etapa ${
        cuantos === 1 ? "nació 1 pendiente" : `nacieron ${String(cuantos)} pendientes`
      } y no se puede quitar del plan: un pendiente guarda dónde apareció, y` +
      " eso no se cambia de lugar. Cerrarlo no alcanza, porque el registro" +
      " queda igual."
    );
  }

  return MENSAJES[motivo];
}

/* ==========================================================================
   El nombre de catálogo ya tomado (T-12)

   El 409 que `migrations/0003_tenencia_y_unicidad.sql` dejó pendiente de
   contestar bien. Vive acá por lo mismo que el `Record` de arriba: el
   vocabulario de fallas con nombre es uno solo para toda la API, y los dos
   `Record` de esta sección son exhaustivos, así que un motivo o una entidad
   nuevos no compilan hasta que alguien escriba qué decirle a la persona.
   ========================================================================== */

/**
 * Cómo se nombra cada catálogo dentro de la frase.
 *
 * El fragmento viene armado con su artículo y la concordancia hecha —«un
 * área llamada», «un tipo de cliente llamado»— porque componerlo a pedazos
 * exigiría cargar el género de cada entidad para ganar nada.
 *
 * El tipo de proceso dice «en esa área» y los otros dos no: es el único cuya
 * unicidad lleva el área en la llave. Sin esa aclaración, el mensaje haría
 * pensar que el nombre está tomado en todo el bufete, cuando «Traspaso» en
 * Civil y «Traspaso» en Migración conviven a propósito.
 */
const CATALOGOS: Record<NombreDuplicado["entidad"], string> = {
  area: "un área llamada",
  tipo_cliente: "un tipo de cliente llamado",
  tipo_proceso: "un tipo de proceso en esa área, llamado",
};

/**
 * Las dos frases, y lo que las separa: **la salida que ofrecen**.
 *
 * Con la fila vigente, la única salida es otro nombre. Con la fila dada de
 * baja, la salida es reactivar la que está, y decir «elegí otro nombre»
 * sería mandar a crear justamente la segunda fila que el índice sin
 * `WHERE activo = 1` existe para impedir: el día que alguien reactivara la
 * primera, el catálogo quedaría partido en dos con historia colgando de cada
 * mitad, y unirlas ya no sería posible.
 *
 * Ninguna de las dos es una pared sin puerta, que es el criterio que T-6
 * fijó para el otro 409 de los catálogos.
 */
const DUPLICADOS: Record<MotivoDeNombreDuplicado, (hay: string) => string> = {
  nombre_duplicado: (hay) =>
    `Ya hay ${hay}. Dos filas con el mismo nombre parten el catálogo en dos` +
    " y nadie se entera hasta que un listado muestra la misma palabra dos" +
    " veces: hay que elegir otro nombre, o editar la fila que ya está.",
  nombre_duplicado_de_baja: (hay) =>
    `Ya hay ${hay}, y está dada de baja. Lo que corresponde es reactivar esa` +
    " fila desde el listado, donde aparece marcada: crear una segunda con el" +
    " mismo nombre dejaría dos mitades del mismo catálogo, cada una con su" +
    " propia historia colgando.",
};

/** El nombre tomado, dicho para quien está mirando la pantalla. */
export function mensajeDeNombreDuplicado(duplicado: NombreDuplicado): string {
  return DUPLICADOS[duplicado.error](
    `${CATALOGOS[duplicado.entidad]} «${duplicado.nombre}»`,
  );
}

/* ==========================================================================
   El generador que no pudo (T-9)

   La mitad de T-8 que llega hasta la persona. Aquella tarea separó siete
   motivos de falla **con nombre** y dejó dicho que la distinción tenía que
   llegar hasta quien la necesita: una pantalla que dice «error» para los
   siete tira ese trabajo entero.

   Lo que se pierde al aplastarlos es concreto, y es la razón por la que
   cada frase de abajo termina en algo que hacer:

    - el proveedor caído se **reintenta** en un minuto y sale bien;
    - la respuesta truncada pide un encargo **más corto**, porque lo que se
      acabó fue el techo de tokens y no la capacidad del modelo;
    - la petición declinada pide **reescribir** la descripción;
    - la salida que no pasó el esquema no la arregla nadie desde la
      pantalla: se carga el borrador **a mano**, que es el camino que
      siempre estuvo y que sigue estando;
    - los dos de configuración no los arregla nadie del bufete, y decirlo es
      lo que evita que alguien reintente veinte veces una tarde entera.

   El `Record` es **exhaustivo sobre la unión**, igual que el de arriba: el
   día que la costura agregue un motivo, este archivo deja de compilar hasta
   que alguien escriba qué decirle a la persona. Esa es toda la gracia — que
   no se pueda agregar un motivo sin texto y descubrirlo en producción como
   un aviso en blanco.

   Ninguna frase nombra al proveedor, ni al modelo, ni a una variable de
   entorno. Quien lee esto es un abogado: lo que necesita saber es si lo
   suyo se salvó, qué hacer ahora y si vale la pena volver a intentar.
   ========================================================================== */

const FALLAS_DEL_MODELO: Record<MotivoDeFallaDelModelo, string> = {
  /* Los dos de configuración. Dicen «configurar» porque es lo único que los
     arregla, y dicen que no es culpa de quien está mirando para que no se
     quede reintentando. */
  modelo_no_configurado:
    "El generador todavía no está configurado en este despliegue, así que" +
    " no hay a quién preguntarle. Hay que configurar la clave del asistente" +
    " antes de que esto funcione; mientras tanto, la cotización se carga a" +
    " mano desde «Nueva cotización».",
  proveedor_desconocido:
    "El generador está configurado con un asistente que este sistema no" +
    " sabe usar. Hay que configurar uno de los que conoce; mientras tanto," +
    " la cotización se carga a mano desde «Nueva cotización».",
  /* El caído. Es el único que de verdad conviene reintentar enseguida. */
  proveedor_no_disponible:
    "El asistente no contestó. Suele ser pasajero: conviene volver a" +
    " intentar en un minuto, y lo que escribiste sigue acá.",
  /* El cuerpo sin texto. Desde la pantalla se ve igual que el anterior, y
     la acción es la misma; se separan porque al operador le dicen cosas
     distintas y porque la frase no puede mentir sobre qué pasó. */
  respuesta_ininteligible:
    "El asistente contestó algo que no se entendió. Conviene volver a" +
    " intentar; si pasa dos veces seguidas, la cotización se carga a mano.",
  /* El techo de tokens. Es el único cuya salida es cambiar lo que se
     escribió, y por eso es el que más caro sale aplastar con los otros. */
  respuesta_truncada:
    "La respuesta se cortó antes de terminar: el encargo dio para más de lo" +
    " que entra en una sola corrida. Conviene probar con una descripción" +
    " más corta, o partir el encargo en dos cotizaciones.",
  /* La declinada. La salida es reescribir, y no reintentar: el mismo texto
     vuelve a ser declinado. */
  respuesta_rechazada_por_el_proveedor:
    "El asistente declinó este encargo y no lo va a procesar tal como está." +
    " Reintentar con el mismo texto va a dar lo mismo: hay que reescribir la" +
    " descripción, o cargar la cotización a mano.",
  /* La barandilla, vista desde la pantalla. No dice «el esquema rechazó la
     salida»: dice que lo que el asistente propuso no se puede usar y que el
     camino de siempre sigue abierto. Y dice por qué se descartó entero, que
     es lo que evita la pregunta «¿y no podían usar la mitad?». */
  salida_rechazada:
    "El asistente propuso algo que este sistema no puede usar: se salió de" +
    " los módulos y las líneas que una cotización admite, y una propuesta" +
    " así se descarta entera en vez de guardarse a medias. Conviene volver a" +
    " intentar, o cargar la cotización a mano desde «Nueva cotización».",
};

/**
 * Por qué no se pudo generar, dicho para quien está mirando la pantalla.
 *
 * Es total sobre la unión —el `Record` es exhaustivo y el compilador lo
 * exige— así que no hay rama de reserva: una que devolviera «no se pudo
 * generar» escondería justamente el motivo que T-8 separó para que se
 * pudiera decir.
 */
export function mensajeDeFallaDelModelo(
  motivo: MotivoDeFallaDelModelo,
): string {
  return FALLAS_DEL_MODELO[motivo];
}

/**
 * Los siete textos, para poder compararlos entre sí.
 *
 * Existe porque hay una cosa que el `Record` exhaustivo **no** puede exigir:
 * que dos motivos no digan lo mismo. Un `Record` con la misma frase repetida
 * compila perfecto, y el resultado es la pantalla que T-8 quería evitar —la
 * que aplasta la distinción— con la apariencia de tenerla resuelta.
 * `test/generar-ui.spec.ts` compara el conjunto contra la lista y falla si
 * dos coinciden.
 */
export const TEXTOS_DE_FALLA_DEL_MODELO: readonly string[] =
  MOTIVOS_DE_FALLA_DEL_MODELO.map(mensajeDeFallaDelModelo);

/* ==========================================================================
   El comprobante que no se pudo guardar ni traer (T-10)

   La mitad del almacén de objetos que llega hasta la persona. Vive acá por lo
   mismo que los dos `Record` de arriba, y es exhaustivo igual: el día que la
   costura con el almacén agregue un motivo, este archivo deja de compilar
   hasta que alguien escriba qué decirle a quien está mirando.

   Las dos frases terminan en algo que hacer y ninguna nombra un binding, una
   variable de entorno ni un bucket. Quien lee esto es un abogado: lo que
   necesita saber es si el movimiento se guardó —se guardó, y es lo primero
   que dicen las dos— y si vale la pena volver a intentar.
   ========================================================================== */

const FALLAS_DEL_COMPROBANTE: Record<MotivoDeFallaDelComprobante, string> = {
  /* El despliegue sin almacén. Dice «configurar» porque es lo único que lo
     arregla, y dice que el movimiento quedó guardado para que nadie lo
     vuelva a cargar creyendo que se perdió. */
  almacen_no_configurado:
    "El movimiento quedó guardado, pero este despliegue todavía no tiene" +
    " dónde archivar los comprobantes, así que el papel no se subió. Hay que" +
    " configurarlo antes de que esto funcione; mientras tanto, el" +
    " comprobante se guarda donde se guarda hoy.",
  /* El almacén caído. Es el único que conviene reintentar enseguida. */
  almacen_no_disponible:
    "El movimiento quedó guardado y el comprobante no se pudo archivar." +
    " Suele ser pasajero: conviene volver a subir el papel en un minuto.",
};

/**
 * Por qué no se pudo con el comprobante, dicho para quien mira la pantalla.
 *
 * Es total sobre la unión —el `Record` es exhaustivo y el compilador lo
 * exige— así que no hay rama de reserva: una que devolviera «no se pudo»
 * aplastaría la distinción entre lo que hay que configurar y lo que hay que
 * reintentar, que es justamente la que evita que alguien reintente veinte
 * veces una tarde entera.
 */
export function mensajeDeFallaDelComprobante(
  motivo: MotivoDeFallaDelComprobante,
): string {
  return FALLAS_DEL_COMPROBANTE[motivo];
}
