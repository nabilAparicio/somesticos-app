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

import type {
  MotivoDeFalla,
  MotivoDeNombreDuplicado,
  NombreDuplicado,
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
  cliente_requerido: "Hay que elegir el cliente del proceso.",
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
  etapa_con_pendientes_no_se_quita:
    "En esa etapa nació un pendiente y no se puede quitar del plan: un" +
    " pendiente guarda dónde apareció, y eso no se cambia de lugar. Cerrarlo" +
    " no alcanza, porque el registro queda igual.",
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
