/**
 * Shapes exchanged over the HTTP API. Compiles both in the Worker project and
 * in the browser project.
 *
 * Casi todo acá son tipos. Las únicas constantes son las dos de T-17
 * (`LIMITE_DE_BITACORA_POR_DEFECTO` y `TECHO_DEL_LIMITE_DE_BITACORA`), y
 * están acá por la misma razón por la que están los tipos: son **acuerdo
 * entre las dos mitades**, no detalle de una. El servidor acota con el techo
 * y la pantalla necesita el mismo número para no prometer un «ver más» que
 * el servidor no va a servir. Dos copias del número serían dos números el
 * día que uno cambie.
 */

export interface HealthReport {
  status: "ok" | "degraded";
  d1: "ok" | "error";
  timestamp: string;
}

/**
 * Quién entró. Lo que viaja es el `usuario_id` de la tabla `usuario`, nunca el
 * token de Access: es la llave que las invariantes de autoría necesitan.
 */
export interface IdentidadActual {
  usuarioId: string;
  email: string;
  nombre: string;
}

/** Cuerpo de toda respuesta de la puerta que no deja pasar. */
export interface AccesoDenegado {
  error: "acceso_denegado";
  motivo: string;
}

/* ==========================================================================
   Clientes (T-5)
   ========================================================================== */

/**
 * Una fila del catálogo `tipo_cliente`.
 *
 * Viaja con `activo` en vez de omitir los dados de baja: un cliente viejo
 * puede tener un tipo que ya no se ofrece, y la pantalla de edición necesita
 * poder nombrarlo sin ofrecerlo a los demás (`docs/diseno.md` §6, "Tipos de
 * cliente").
 */
export interface TipoCliente {
  id: string;
  nombre: string;
  activo: boolean;
}

/**
 * Un cliente tal como lo lee la pantalla.
 *
 * Casi todo es `null`able, y eso es el diseño y no un descuido: el alta pide
 * nombre y un medio de contacto, y nada más (`docs/diseno.md` §5). Un
 * formulario completo convertiría I-1 e I-2 en un bloqueo para cotizarle a un
 * prospecto, que es justo el momento en que se cotiza.
 *
 * `tipoClienteNombre` y `creadoPorNombre` se resuelven **en lectura**: lo que
 * se guarda es la llave (§6, "Autoría"). Si una persona cambia de apellido,
 * cuatrocientas filas no quedan firmadas con un nombre que ya no existe.
 */
export interface Cliente {
  id: string;
  tipoClienteId: string | null;
  tipoClienteNombre: string | null;
  nombre: string;
  documentoTipo: string | null;
  documentoNumero: string | null;
  representanteLegal: string | null;
  email: string | null;
  telefono: string | null;
  notas: string | null;
  creadoPor: string;
  creadoPorNombre: string | null;
  creadoEn: string;
}

/** Lo que el formulario manda al crear o editar. Ya normalizado. */
export interface DatosDeCliente {
  nombre: string;
  tipoClienteId: string | null;
  documentoTipo: string | null;
  documentoNumero: string | null;
  representanteLegal: string | null;
  email: string | null;
  telefono: string | null;
  notas: string | null;
}

export type MotivoDeFalla =
  /** Un campo vino con algo que no es texto ni `null`. */
  | "tipo_invalido"
  /** Sin nombre no hay cliente. Es la única columna obligatoria del esquema. */
  | "nombre_requerido"
  /** Ni correo ni teléfono utilizables: el cliente quedaría incontactable. */
  | "contacto_requerido"
  | "correo_invalido"
  | "telefono_invalido"
  /** Tipo de documento sin número, o número sin tipo. */
  | "documento_incompleto"
  /** El `tipoClienteId` no es una fila del catálogo de ESTE tenant. */
  | "tipo_cliente_desconocido"
  /* --- Catálogos (T-6). Un solo vocabulario de fallas para toda la API:
     dos uniones paralelas obligarían a dos `Resultado`, dos `pedir` y dos
     mapas de mensajes para decir lo mismo. --- */
  /** Un tipo de proceso sin área. El área no es opcional. */
  | "area_requerida"
  /** El `areaId` no es una fila de `area` de ESTE tenant. */
  | "area_desconocida"
  /** Un id de etapa que no pertenece a la plantilla que se está guardando. */
  | "etapa_desconocida"
  /* --- Procesos (T-7) --- */
  /**
   * Todo proceso está ligado a un cliente (I-2), y toda cotización también
   * (I-1). `docs/diseno.md` §5.
   *
   * Lo comparten las dos entidades y por eso su frase en `src/mensajes.ts` no
   * nombra a ninguna, igual que `texto_requerido` desde que la nota y el
   * pendiente lo comparten: un «hay que elegir el cliente del proceso»
   * debajo del formulario de una cotización habla de otra cosa.
   */
  | "cliente_requerido"
  /** El `clienteId` no es una fila de `cliente` de ESTE tenant. */
  | "cliente_desconocido"
  /** Un proceso sin tipo no se puede sembrar desde ninguna plantilla. */
  | "tipo_proceso_requerido"
  /** El `tipoProcesoId` no es una fila de `tipo_proceso` de ESTE tenant. */
  | "tipo_proceso_desconocido"
  /** El `responsableId` no es un `usuario` de ESTE tenant. */
  | "responsable_desconocido"
  /** Sin título, el listado no distingue dos procesos del mismo tipo. */
  | "titulo_requerido"
  /**
   * El plan enviado no incluye una etapa que ya está alcanzada.
   *
   * Las notas se anclan a la etapa donde ocurrieron y son inmutables por
   * disparador (I-6): borrar una etapa cumplida dejaría notas huérfanas o
   * reescribiría la historia.
   */
  | "etapa_alcanzada_no_se_quita"
  /**
   * El plan enviado mueve una etapa alcanzada, o mete un paso por delante de
   * una. Lo cumplido va primero y en el orden en que se cumplió: un plan que
   * promete un paso *antes* de algo que ya pasó no se puede dibujar separado
   * en cumplido y pendiente, que es lo que la pantalla tiene que mostrar.
   */
  | "etapa_alcanzada_no_se_mueve"
  /* --- Guardar el plan como plantilla (T-11) --- */
  /**
   * El destino no es ninguno de los dos: actualizar la plantilla del tipo al
   * que pertenece el proceso, o crear un tipo nuevo con este plan.
   */
  | "destino_invalido"
  /**
   * Un proceso sin etapas no tiene plan que guardar. Guardarlo igual
   * **vaciaría** la plantilla del tipo —`reemplazarEtapas` reemplaza— y el
   * próximo proceso nacería sin pasos sin que nadie lo pidiera.
   */
  | "plan_vacio"
  /* --- Abrir procesos desde una cotización ganada (tajada 2, T-13) --- */
  /**
   * La lista de procesos por abrir llegó vacía.
   *
   * **No es un no-op silencioso, y por eso se rechaza.** Abrir cero procesos
   * no escribe nada y sin embargo dejaría una entrada de bitácora por cada
   * proceso que no nació —o ninguna, que es peor: una petición de escritura
   * contestada con 201 sin que exista nada nuevo—. El sitio de «no abrir
   * ninguno» es no apretar el botón, y la pantalla lo apaga; esto es la red
   * de abajo para el cuerpo armado a mano.
   */
  | "sin_procesos_que_abrir"
  /* --- Notas (T-8) --- */
  /**
   * Una nota sin texto no es una nota. Es lo único que una persona escribe
   * acá, y el resto —autor, momento, etapa— lo pone el sistema.
   */
  | "texto_requerido"
  /**
   * La etapa elegida no es del plan de ESTE proceso.
   *
   * Es un motivo propio y no `etapa_desconocida` porque lo que se está
   * guardando no es un plan sino un hecho: el mensaje útil es «esa etapa no
   * es de este proceso», no «volvé a cargar la plantilla».
   */
  | "etapa_de_otro_proceso"
  /**
   * El proceso no tiene ninguna etapa, y `nota.proceso_etapa_id` es
   * `NOT NULL`: no hay de dónde colgar la nota. El servidor no inventa una
   * etapa para resolverlo — inventarla metería en el plan de trabajo un paso
   * que nadie decidió.
   */
  | "proceso_sin_etapas"
  /**
   * Se intentó quitar del plan una etapa pendiente que tiene notas.
   *
   * Es el encargo que T-7 dejó escrito para T-8, que es la tarea que crea la
   * dependencia. La guarda **cuenta** las notas antes de escribir; no atrapa
   * el error de la llave foránea para disfrazarlo. La falla viaja con
   * `cuantos` para que la pantalla pueda decir cuántas lo impiden.
   */
  | "etapa_con_notas_no_se_quita"
  /* --- Pendientes (T-9) --- */
  /**
   * `venceEn` no es una fecha `AAAA-MM-DD` real.
   *
   * «Real» incluye que el día exista: `2026-02-31` tiene la forma correcta y
   * no es ningún día. Un vencimiento que la base acepta y nadie puede
   * alcanzar es peor que no tener vencimiento.
   */
  | "vencimiento_invalido"
  /**
   * Se intentó **poner** un vencimiento en un día que ya pasó (tajada 2).
   *
   * **No es una copia del `CHECK` de la base, y la distinción importa.** El
   * `CHECK (vence_en >= fecha)` de `migrations/0004_cotizaciones.sql` es
   * estructural y compara momentos: dice que una vigencia no termina antes
   * de empezar. Éste es de negocio y compara el día que llegó por el cable
   * contra hoy. En el alta coinciden por casualidad —`fecha` es ahora—; en
   * la edición **no**, porque `fecha` es la de creación. Medido: un `PUT`
   * que le pone `2022-01-01` a un borrador abierto en 2021 pasa el `CHECK`
   * y guarda una cotización ya vencida sin que nada avise. El dominio no
   * puede expresar la regla de la base aunque quisiera: no conoce `fecha`.
   *
   * Y es el mismo motivo por el que `cliente_requerido` existe teniendo
   * `cliente_id NOT NULL` detrás: convertir un 500 que nadie puede leer en
   * un 422 que dice qué arreglar.
   *
   * Solo se rechaza el vencimiento **nuevo**. Reenviar el que la cotización
   * ya tenía no es ponerlo, y rechazarlo bloquearía la edición de un
   * borrador viejo por un campo que la persona no tocó.
   */
  | "vencimiento_pasado"
  /**
   * Se intentó quitar del plan la etapa donde nació un pendiente.
   *
   * **Vale esté el pendiente abierto o cerrado**, y ahí está la decisión de
   * T-9: `pendiente.proceso_etapa_id` es `NOT NULL` y significa «donde
   * nació». Quitar esa etapa obligaría a dejarlo huérfano —que la base no
   * permite— o a reanclarlo a otra, que es falsificar dónde nació. Un
   * pendiente cerrado sigue siendo el registro de un cabo suelto que existió
   * en ese paso.
   *
   * No se traslada el argumento de T-8 tal cual: una nota *pertenece* a su
   * etapa y un pendiente solo *nació* ahí. Lo que se traslada es la
   * disciplina — se **cuentan** los dependientes y se rechaza; no se atrapa
   * el error de la llave foránea para disfrazarlo.
   */
  | "etapa_con_pendientes_no_se_quita"
  /* --- Módulos de prosa de una cotización (tajada 2, T-2 C) --- */
  /**
   * El `tipo` no es ninguno del catálogo cerrado de `TipoDeModulo`.
   *
   * **Cubre también el tipo ausente, y ahí está la decisión.** El precedente
   * de al lado parte en dos el mismo caso —`cliente_requerido` y
   * `cliente_desconocido`— y acá no se copia, porque las dos situaciones no
   * son distinguibles desde donde está la persona: el tipo sale de un
   * desplegable que la pantalla dibuja **del mismo registro** contra el que
   * el servidor valida, así que «no mandaste ninguno» y «mandaste uno
   * inventado» son el mismo defecto y se arreglan con la misma frase. El
   * `clienteId`, en cambio, es un identificador que puede quedar viejo entre
   * que el formulario cargó y se envió: ahí «elegí uno» y «ese ya no existe»
   * son dos cosas que pasan por motivos distintos.
   *
   * Y no es una copia del `CHECK` de la base: el `CHECK` convierte el tipo
   * inventado en un 500 que nadie puede leer; esto lo convierte en un 422
   * que dice qué arreglar. Las dos mitades siguen existiendo, y
   * `test/modulos-api.spec.ts` falla si se separan.
   */
  | "tipo_de_modulo_desconocido"
  /**
   * Un módulo de prosa sin contenido.
   *
   * Es motivo propio y no `texto_requerido`, que la nota y el pendiente
   * comparten, porque la frase que a ellos les sirve —«es lo único que se
   * escribe acá, y el resto lo pone el sistema»— acá es falsa: en un módulo
   * la persona también elige el tipo. Lo que hay que decirle es otra cosa:
   * un módulo vacío es un título sin nada debajo, y eso es lo que va a salir
   * impreso.
   */
  | "contenido_requerido"
  /**
   * El reordenamiento nombra un módulo que no es de esta cotización.
   *
   * Es el equivalente de `etapa_de_otro_proceso` para los módulos, y por el
   * mismo motivo que aquél no es `etapa_desconocida`: lo que falla no es un
   * catálogo mal cargado sino una lista que quedó vieja.
   */
  | "modulo_desconocido"
  /* --- Líneas de honorarios y gastos estimados (tajada 2, T-3 A) --- */
  /**
   * La `clase` no es ninguna del catálogo cerrado de `ClaseDeLinea`.
   *
   * **Cubre también la clase ausente**, por el mismo argumento que
   * `tipo_de_modulo_desconocido` escribe entero: la clase sale de un control
   * que la pantalla dibuja **del mismo registro** contra el que el servidor
   * valida, así que «no mandaste ninguna» y «mandaste una inventada» son el
   * mismo defecto y se arreglan con la misma frase.
   */
  | "clase_de_linea_desconocida"
  /**
   * Una línea sin concepto.
   *
   * Es motivo propio y no `contenido_requerido`, que es del módulo de prosa,
   * porque lo que falta es otra cosa y la frase útil es otra: un módulo vacío
   * es un título sin nada debajo; una línea sin concepto es un monto que el
   * cliente no sabe por qué está pagando. Y tampoco es `texto_requerido`: ahí
   * el texto es lo único que la persona escribe, y en una línea escribe
   * además el monto.
   */
  | "concepto_requerido"
  /**
   * El `monto` no es un número entero de centavos de cero en adelante.
   *
   * **Es un solo motivo para cuatro situaciones** —ausente, no numérico, con
   * parte decimal y negativo— y la decisión es la misma que la de
   * `tipo_de_modulo_desconocido`: desde donde está la persona las cuatro son
   * «eso no es un importe», y la corrección es la misma. Partirlo en cuatro
   * daría cuatro frases que mandan a hacer lo mismo.
   *
   * Y no es una copia del `CHECK (typeof(monto) = 'integer' AND monto >= 0)`
   * de `migrations/0004_cotizaciones.sql`, por el mismo argumento con el que
   * `cliente_requerido` existe teniendo `cliente_id NOT NULL` detrás: el
   * `CHECK` convierte un 1500.5 en un 500 que nadie puede leer; esto lo
   * convierte en un 422 que dice qué arreglar. Las dos mitades siguen
   * existiendo, y la de la base es la que sobrevive a un script de
   * importación (§5).
   *
   * Lo que esta validación **sí** garantiza y el `CHECK` no puede: que la
   * ruta no convierta a coma flotante en el camino. Lo que no pasa por acá no
   * llega a la base como número.
   */
  | "monto_invalido"
  /**
   * El reordenamiento nombra una línea que no es de esta cotización.
   *
   * El gemelo de `modulo_desconocido`, y por el mismo motivo que aquél no es
   * `etapa_desconocida`: lo que falla no es un catálogo mal cargado sino una
   * lista que quedó vieja.
   */
  | "linea_desconocida"
  /**
   * El reordenamiento no nombra **cada** fila exactamente una vez.
   *
   * Lo comparten los módulos de prosa (T-2 C) y las líneas (T-3 A), así que
   * la frase no puede nombrar a ninguno de los dos: es el mismo argumento
   * que llevó a `texto_requerido` a dejar de hablar de la nota cuando el
   * pendiente empezó a compartirlo.
   *
   * El cuerpo es la lista completa en su orden nuevo, no un movimiento: el
   * servidor asigna el `orden` como la posición en ese arreglo. Una lista a
   * la que le falta una fila dejaría las demás con el orden viejo mezcladas
   * entre las nuevas, y una que repite una pediría dos posiciones para la
   * misma fila. Las dos son la misma causa —la pantalla tiene una copia
   * vieja— y se arreglan igual.
   */
  | "orden_incompleto"
  /* --- El generador (tajada 2, T-9) --- */
  /**
   * El encargo llegó sin descripción en prosa, o con puros espacios.
   *
   * Es motivo propio y no `texto_requerido`, aunque los dos digan «escribí
   * algo», por el mismo argumento con el que `concepto_requerido` no es
   * `contenido_requerido`: lo que falta es otra cosa y la frase útil es
   * otra. Sin texto en una nota no hay nada que guardar; sin descripción del
   * encargo no hay nada que **generar**, y lo que la persona tiene que
   * entender es que el modelo no adivina de qué se trata el caso.
   *
   * Se comprueba sobre el recorte, por lo mismo que el contenido de un
   * módulo: tres saltos de línea no describen ningún encargo.
   */
  | "descripcion_requerida"
  /* --- Gastos reales y comprobantes (tajada 2, T-10) --- */
  /**
   * El `tipo` no es ninguno del vocabulario cerrado de `TipoDeMovimiento`.
   *
   * **Cubre también el tipo ausente**, por el mismo argumento que escriben
   * `tipo_de_modulo_desconocido` y `clase_de_linea_desconocida`: sale de un
   * control que la pantalla dibuja **del mismo registro** contra el que el
   * servidor valida, así que «no mandaste ninguno» y «mandaste uno inventado»
   * son el mismo defecto y se arreglan con la misma frase.
   *
   * Es motivo propio y no `clase_de_linea_desconocida` aunque las dos
   * separen dos familias de dinero: una decide cómo **se cobra** un renglón
   * de la propuesta y la otra de qué lado del saldo cae una plata que ya se
   * movió. Compartir el motivo haría que la frase tuviera que nombrar las
   * cuatro palabras para no mentir en ninguno de los dos sitios.
   */
  | "tipo_de_movimiento_desconocido"
  /**
   * La fecha del movimiento no es un día del calendario.
   *
   * Es motivo propio y no `vencimiento_invalido`, aunque la comprobación sea
   * la misma: aquél habla de hasta cuándo vale una propuesta y éste del día
   * en que la plata se movió. La frase de uno debajo del otro campo manda a
   * corregir algo que nadie tocó.
   */
  | "fecha_invalida"
  /**
   * La fecha del movimiento está en el futuro.
   *
   * Se separa de `fecha_invalida` por el mismo criterio que separa
   * `vencimiento_pasado` de `vencimiento_invalido`: **la corrección es
   * distinta**. Una pide escribir un día que exista; ésta pide decir cuándo
   * pasó de verdad. Un gasto que todavía no ocurrió no es un gasto: es un
   * presupuesto, y para eso está la línea de clase `gasto_estimado`.
   *
   * El día se mide **en Panamá** y no en UTC, por lo que
   * `worker/db/momentos.ts` explica: desde las 19:00 locales el día UTC ya es
   * el siguiente, así que cargar un gasto de hoy a las ocho de la noche daría
   * este rechazo por un gasto que acaba de ocurrir.
   */
  | "fecha_futura"
  /**
   * Lo que se subió como comprobante no es un PDF ni una imagen, o está
   * vacío.
   *
   * **Es un solo motivo para las dos situaciones**, por el mismo criterio que
   * `monto_invalido` usa para cuatro: desde donde está la persona las dos son
   * «eso no es un comprobante» y la corrección es la misma, elegir otro
   * archivo. Partirlo daría dos frases que mandan a hacer lo mismo.
   *
   * Es un **422 y no un 502**: esto lo hizo mal quien subió y lo puede
   * arreglar. Los dos motivos de `MotivoDeFallaDelComprobante` son del
   * almacén, no del usuario, y por eso viven en otra unión.
   */
  | "comprobante_no_admitido"
  /**
   * El comprobante pasa del tope.
   *
   * Se separa del anterior porque **la corrección es distinta**, que es el
   * mismo criterio que separa `fecha_futura` de `fecha_invalida`: ahí hay que
   * elegir otro archivo, acá hay que achicar el que se tiene. La frase dice
   * cuál es el tope, porque un rechazo que no lo dice obliga a adivinarlo
   * subiendo.
   */
  | "comprobante_demasiado_grande"
  /* --- El plan de pagos (tajada 2, T-11) --- */
  /**
   * Una cuota con monto **y** porcentaje, o sin ninguno de los dos.
   *
   * **Es un solo motivo para las dos situaciones**, al revés que
   * `fecha_invalida`/`fecha_futura` y por el criterio que las separa: ahí la
   * corrección era distinta, acá es la misma. Con los dos puestos hay que
   * sacar uno; sin ninguno hay que poner uno; en los dos casos la frase que
   * sirve es «exactamente uno», y partirlo daría dos textos que mandan a
   * hacer lo mismo.
   *
   * El invariante vive en la base, en
   * `la_cuota_lleva_monto_o_porcentaje_y_nunca_los_dos`. Este motivo es la
   * mitad amable: lo que la pantalla contesta antes de llegar al `CHECK`.
   */
  | "monto_o_porcentaje"
  /**
   * Una cuota con fecha de vencimiento **y** hito, o sin ninguno de los dos.
   *
   * La hermana de la anterior, con el mismo argumento de un solo motivo. El
   * `CHECK` es `la_cuota_vence_en_una_fecha_o_contra_un_hito_y_nunca_las_dos`.
   */
  | "vencimiento_o_hito"
  /**
   * El porcentaje no es un entero de puntos básicos entre 1 y 10000.
   *
   * Es motivo propio y no `monto_invalido`, aunque la comprobación se le
   * parezca: aquél habla de un importe en centavos y éste de una fracción del
   * total, y la frase de uno debajo del otro campo manda a corregir algo que
   * nadie tocó. Cubre las cuatro formas de equivocarse —no numérico, cero,
   * más de 100 % y con decimales que la unidad no admite— por el mismo
   * criterio con el que `monto_invalido` cubre cuatro.
   */
  | "porcentaje_invalido"
  /**
   * Una cuota porcentual colgada de un proceso.
   *
   * **Un porcentaje necesita una base, y un proceso no tiene ninguna.** El
   * total vive en la cotización; un proceso tiene gastos reales, que son
   * plata de terceros, y uno suelto no tiene absolutamente ningún número del
   * que ser porcentaje. Dicho al derecho: una cuota de un proceso lleva
   * monto, siempre.
   *
   * El invariante vive en la base, en
   * `un_porcentaje_sin_cotizacion_no_tiene_de_que_ser_porcentaje`. Es la
   * única de las cuatro restricciones de `cuota` que no estaba en el boceto
   * de `docs/diseno.md` §6, y está porque la pregunta «¿porcentaje de qué?»
   * tiene respuesta en un caso y no la tiene en el otro.
   */
  | "porcentaje_sin_cotizacion";

export interface FallaDeValidacion {
  campo: string;
  motivo: MotivoDeFalla;
  /**
   * Cuántos dependientes impiden la operación.
   *
   * Solo lo traen los motivos que **cuentan** antes de rechazar —hoy
   * `etapa_con_notas_no_se_quita`—, y existe porque un rechazo que dice
   * «tiene notas» obliga a ir a buscar cuántas. Es la misma información que
   * T-6 pone en `Dependencia` para el 409 del borrado de catálogos; acá
   * viaja dentro de la falla porque la operación es el `PUT` del plan
   * entero, que ya tiene su vocabulario de fallas por etapa.
   */
  cuantos?: number;
}

export interface DatosInvalidos {
  error: "datos_invalidos";
  fallas: FallaDeValidacion[];
}

export interface RespuestaDeCliente {
  cliente: Cliente;
}

export interface RespuestaDeClientes {
  clientes: Cliente[];
}

export interface RespuestaDeTiposCliente {
  tipos: TipoCliente[];
}

/* ==========================================================================
   Catálogos del bufete (T-6)

   `area`, `tipo_proceso`, `etapa_plantilla` y `tipo_cliente` son datos del
   bufete, no configuración de desarrollador: se crean, se editan y se borran
   desde la aplicación (`docs/diseno.md` §6, «Las plantillas son del bufete,
   no del sistema»). `tipo_cliente` entra acá porque T-5 lo dejó sin forma de
   poblarse.

   Los cuatro llevan la misma marca `activo` que `tipo_cliente` estrenó en
   T-5, y por la misma razón: dar de baja saca la fila de lo *elegible* sin
   invalidar lo ya guardado. Viaja marcada, no omitida.
   ========================================================================== */

/** Una rama del derecho: familia, migración, civil, penal. */
export interface Area {
  id: string;
  nombre: string;
  activo: boolean;
}

/**
 * Un tipo de proceso dentro de su área, tan granular como haga falta: una
 * visa de trabajo y una de pensionado son tipos distintos (`docs/diseno.md`
 * §6). `areaNombre` se resuelve en lectura, igual que el autor de un cliente.
 */
export interface TipoProceso {
  id: string;
  areaId: string;
  areaNombre: string | null;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
}

/**
 * Un paso del plan por defecto de un tipo de proceso.
 *
 * No lleva `activo`: una etapa de plantilla que sobra se quita, porque nada
 * cuelga de ella. Y su nombre es **texto de cara al cliente** (§6, «Una
 * consecuencia futura que obliga hoy»).
 */
export interface EtapaPlantilla {
  id: string;
  nombre: string;
  orden: number;
}

/** Lo que el formulario manda para un `area` o un `tipo_cliente`. */
export interface DatosDeCatalogo {
  nombre: string;
  activo: boolean;
}

export interface DatosDeTipoProceso {
  areaId: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
}

/** Una etapa en el envío: sin `id` es nueva, con `id` es la que ya existía. */
export interface DatosDeEtapa {
  id: string | null;
  nombre: string;
}

/**
 * Qué impide borrar una fila de catálogo, y cuántos son.
 *
 * La política de borrado de T-6: se puede borrar lo que no tiene
 * dependientes; lo que los tiene se da de baja. El choque contra la llave
 * foránea —que T-2 dejó en `NO ACTION` a propósito— nunca sale como un 500
 * ni como un error de SQL crudo: se cuenta antes y se contesta esto con 409.
 */
export type EntidadDependiente =
  | "tipo_proceso"
  | "etapa_plantilla"
  | "proceso"
  | "cliente";

export interface Dependencia {
  entidad: EntidadDependiente;
  cuantos: number;
}

/**
 * Las tres tablas de catálogo que se administran desde la aplicación.
 *
 * Se nombra una sola vez porque los dos 409 de los catálogos —el borrado
 * bloqueado de T-6 y el nombre tomado de T-12— hablan del mismo conjunto, y
 * dos listas paralelas son dos listas que se desincronizan.
 */
export type EntidadDeCatalogo = "area" | "tipo_proceso" | "tipo_cliente";

export interface BorradoBloqueado {
  error: "tiene_dependientes";
  entidad: EntidadDeCatalogo;
  dependencias: Dependencia[];
}

/**
 * Qué clase de choque de nombre fue.
 *
 * Son **dos** motivos y no uno, y la diferencia no es cosmética: es la única
 * parte de esta respuesta que cambia qué tiene que hacer quien la recibe.
 * Con la fila vigente, lo que corresponde es elegir otro nombre. Con la fila
 * dada de baja, lo que corresponde es **reactivar la que está** —es la
 * decisión que `migrations/0003_tenencia_y_unicidad.sql` ya tomó al dejar el
 * índice sin `WHERE activo = 1`— y un «ya existe» a secas obligaría a
 * adivinar cuál de las dos salidas es la buena.
 */
export type MotivoDeNombreDuplicado =
  | "nombre_duplicado"
  | "nombre_duplicado_de_baja";

/**
 * El nombre de catálogo que ya está tomado dentro de este tenant.
 *
 * `0003` creó los tres índices únicos y dejó escrito que la API era de la
 * unidad siguiente: hasta T-12 un nombre repetido llegaba a la base y volvía
 * como 500. Ahora se consulta antes y se contesta esto con 409.
 *
 * **La guarda es la consulta previa, no un `try/catch` sobre el error del
 * índice.** Es la misma regla que T-6 fijó para el borrado con dependientes,
 * y por el mismo motivo: con un `catch` que traduzca el error de SQLite a un
 * 409, aflojar o borrar el índice no rompería ninguna prueba y la guarda
 * quedaría inverificable. El índice es el respaldo que no debería dispararse
 * nunca, y que siga vivo lo prueba `test/esquema.spec.ts`.
 *
 * `nombre` es el de la fila que ya está. Hoy es idéntico al que se mandó
 * —la comparación es exacta, sin `COLLATE NOCASE`— pero viaja igual para que
 * el mensaje cite lo que hay guardado y no lo que se tipeó, que es lo que
 * seguiría siendo cierto el día que haya una columna normalizada.
 */
export interface NombreDuplicado {
  error: MotivoDeNombreDuplicado;
  entidad: EntidadDeCatalogo;
  nombre: string;
}

export interface RespuestaDeAreas {
  areas: Area[];
}

export interface RespuestaDeArea {
  area: Area;
}

export interface RespuestaDeTiposProceso {
  tipos: TipoProceso[];
}

export interface RespuestaDeTipoProceso {
  tipo: TipoProceso;
}

export interface RespuestaDeTipoCliente {
  tipo: TipoCliente;
}

export interface RespuestaDeEtapas {
  etapas: EtapaPlantilla[];
}

/* ==========================================================================
   Procesos y su plan de trabajo (T-7)

   Un **proceso** es todo trabajo que hace un abogado (`docs/diseno.md` §3).
   Nunca «caso».

   Dos cosas del modelo que esta sección hace visibles en el cable:

    - **La plantilla siembra, el proceso manda.** Las etapas se copian de
      `etapa_plantilla` al crear el proceso; desde ahí el proceso es dueño de
      su plan y editar la plantilla no lo toca (§6, «Etapas»).
    - **`proceso_etapa` es la lista ordenada completa**, no un puntero a la
      etapa vigente. Las de `alcanzadaEn` nulo son exactamente lo que falta, y
      «lo que viene» es la mitad del valor de la pantalla.
   ========================================================================== */

/**
 * De dónde nació el proceso.
 *
 * Los dos valores están implementados desde T-7 de la tajada 2: `directo` es
 * el alta a mano y `cotizacion` es el que abrió una cotización ganada. **No
 * es una etiqueta suelta**: desde
 * `migrations/0011_el_proceso_cuelga_de_la_cotizacion.sql` la base exige que
 * diga lo mismo que `proceso.cotizacion_id`, así que un `cotizacion` sin
 * cotización —o un `directo` con una— es una fila que no se puede escribir.
 *
 * **De qué cuelga el proceso cambió en T-13, y el cambio es de modelo.**
 * Hasta `0010` la columna era `cotizacion_linea_id` y el proceso colgaba de
 * una línea. Eso imponía desde la estructura una decisión que es del bufete:
 * **la línea es una unidad de facturación y el proceso es una unidad de
 * trabajo**, y no tienen por qué ser la misma cosa. Constituir una sociedad
 * y registrarla se cotizan aparte porque se tarifan aparte; que sean uno o
 * dos expedientes no se sigue de eso, y lo decide quien hace el trabajo.
 * Ahora el proceso cuelga de la cotización, que es lo que el cliente firmó.
 *
 * **Lo que viaja sigue siendo `Proceso.cotizacionDeOrigen` y no el
 * identificador suelto**, por la medición de T-15 que no cambió con la
 * arista: con sólo el id, cada renglón del listado costaría una lectura más
 * para llegar al código que la persona quiere leer. Lo que se simplificó es
 * el camino para resolverlo: antes había que saltar de la línea a la
 * cotización, y ahora la columna ya es la cotización.
 */
export type OrigenDeProceso = "cotizacion" | "directo";

/**
 * La cotización de la que nace un proceso, resuelta en lectura (T-15).
 *
 * **Un objeto y no dos campos sueltos**, al revés que `clienteId` con
 * `clienteNombre` y que `tipoProcesoId` con `tipoProcesoNombre`, y la
 * diferencia es qué significa el nulo en cada caso. Allá el nombre en nulo
 * quiere decir «la fila está pero no se pudo resolver» —cruzó la frontera
 * del tenant—, y el identificador sigue siendo verdad. Acá el nulo quiere
 * decir **que no hay cotización**, que es una cosa sola: con dos campos
 * nullables el cable admitiría cuatro combinaciones de las que sólo dos son
 * legales, y la pantalla tendría que elegir a cuál de los dos creerle para
 * decidir si dibuja el enlace.
 *
 * Lo que se conserva del criterio de al lado es lo importante: **cada
 * identificador viaja con su texto resuelto**. El `id` es para armar la
 * dirección y el `codigo` es para escribirlo en la frase; un id sin su
 * texto obliga a una segunda lectura por renglón, y en un listado eso es
 * una lectura por fila.
 */
export interface CotizacionDeOrigen {
  id: string;
  codigo: string;
}

/** Cerrado en el par que el esquema admite. Cerrar un proceso es de T-7+. */
export type EstadoDeProceso = "abierto" | "cerrado";

/**
 * Un paso del plan de trabajo de un proceso.
 *
 * `alcanzadaEn` es el hecho: nulo mientras falte, y el momento exacto una vez
 * cumplida. No se vuelve a nulo nunca — el avance es de una sola dirección.
 *
 * El nombre es **texto de cara al cliente** (§6, «Una consecuencia futura que
 * obliga hoy»), igual que el de la plantilla de la que salió.
 */
export interface EtapaDeProceso {
  id: string;
  nombre: string;
  orden: number;
  alcanzadaEn: string | null;
}

/**
 * Un proceso tal como lo lee la pantalla.
 *
 * Los nombres de cliente, tipo, área y responsable se resuelven **en
 * lectura**: lo que se guarda es la llave (§6, «Autoría»).
 *
 * Los tres derivados del final existen para que el **listado** no tenga que
 * pedir el plan de cada fila para decir en qué va cada proceso. Se calculan
 * de `proceso_etapa`, nunca se almacenan.
 */
export interface Proceso {
  id: string;
  clienteId: string;
  clienteNombre: string | null;
  tipoProcesoId: string;
  tipoProcesoNombre: string | null;
  areaNombre: string | null;
  origen: OrigenDeProceso;
  titulo: string;
  estado: EstadoDeProceso;
  responsableId: string | null;
  responsableNombre: string | null;
  abiertoEn: string;
  cerradoEn: string | null;
  etapasCumplidas: number;
  etapasTotales: number;
  /** El nombre de la próxima pendiente. Nulo si no falta ninguna. */
  etapaVigente: string | null;
  /**
   * La cotización que lo abrió, o nulo si lo abrió una persona (T-15).
   *
   * Nulo **exactamente** cuando `origen` es `directo`: las dos cosas salen
   * de la misma fila y el `CHECK` de `0008` las obliga a decir lo mismo, así
   * que no hay ningún proceso que traiga uno sin el otro.
   *
   * Que estén las dos no es redundancia que la pantalla pueda aprovechar al
   * revés: **lo que decide si hay enlace es este campo y no `origen`**.
   * Colgar el enlace de `origen` y la dirección de acá serían dos guardas
   * resolviendo lo mismo por caminos distintos, y dos guardas así se anulan
   * como garantía — quitar cualquiera de las dos no rompería nada visible.
   */
  cotizacionDeOrigen: CotizacionDeOrigen | null;
}

/** El proceso con su plan entero: lo que pide la pantalla de detalle. */
export interface DetalleDeProceso {
  proceso: Proceso;
  etapas: EtapaDeProceso[];
}

/**
 * Lo que el formulario manda al abrir un proceso. Ya normalizado.
 *
 * No lleva `origen`: en esta tajada solo hay uno y lo pone el servidor. Que
 * el cliente lo eligiera sería ofrecer un camino que no existe.
 */
export interface DatosDeProceso {
  clienteId: string;
  tipoProcesoId: string;
  titulo: string;
  responsableId: string | null;
}

export interface RespuestaDeProcesos {
  procesos: Proceso[];
}

export interface RespuestaDeProceso {
  proceso: Proceso;
}

/** El 409 de avanzar cuando el plan ya no tiene nada por delante. */
export interface SinEtapasPendientes {
  error: "sin_etapas_pendientes";
}

/* ==========================================================================
   Cerrar y reabrir un proceso (T-14)

   El esquema lleva `estado IN ('abierto','cerrado')` y `cerrado_en` desde
   T-2, y hasta T-14 la API no los expuso: un proceso nacía abierto y no
   había cómo terminarlo.

   **El principio: un proceso cerrado conserva su historia y no acepta
   avance.** De ahí sale todo lo demás, y las consecuencias no son
   simétricas:

    - **Avanzar de etapa y editar el plan se rechazan.** Las dos son trabajo
      en curso; si hay trabajo, se reabre primero. Reabrir es reversible y
      deja rastro, que es lo que lo vuelve una guarda y no una pared.
    - **Abrir un pendiente nuevo también se rechaza.** Un pendiente es «algo
      que sigue pasando» que no se calla hasta que alguien lo cierre:
      abrirlo declara trabajo vigente sobre un trámite terminado.
    - **Cerrar un pendiente que quedó abierto sí se puede.** No es avance:
      es terminar de atar lo que el cierre dejó colgando. Si se avisa
      «quedaron tres» y después no se deja cerrarlos, el aviso es una
      denuncia sin salida.
    - **Escribir una nota sí se puede.** La historia no se congela porque el
      trámite terminó: justo ahí aparece el «el cliente volvió preguntando
      por X», y es la válvula que deja que lo anterior esté prohibido sin
      dejar a nadie sin dónde escribirlo.
    - **Guardar el plan como plantilla sí se puede.** Lee el proceso y
      escribe en catálogos; no lo toca.

   `cerrado_en` se llena al cerrar y **vuelve a `NULL` al reabrir**. No
   conserva la fecha del cierre anterior: para eso está la bitácora, que es
   inmutable y sí la guarda. Un proceso abierto con fecha de cierre es un
   dato que miente.
   ========================================================================== */

/**
 * Lo que contestan `cerrar` y `reabrir`: el detalle entero y el número que
 * el cambio de estado obliga a decir.
 *
 * Es el detalle completo y no media respuesta, por lo mismo que el `PUT` del
 * plan y el avance de T-7: el cambio mueve lo que la cabecera muestra, y
 * devolver un pedazo obliga a la pantalla a pedir el resto o a recalcularlo.
 *
 * `pendientesAbiertos` es la mitad de la decisión de T-14 puesta en el
 * cable. **Cerrar con cabos sueltos se permite**: el bufete cierra casos con
 * cabos sueltos y el sistema no está para discutirle. Lo que no puede es
 * dejar que pase inadvertido, así que no es un 409 — es un cierre que sale
 * bien y que informa. Viaja también en la reapertura porque ahí el número
 * cambia de significado y vuelve a ser trabajo por hacer.
 */
export interface CambioDeEstadoDeProceso {
  proceso: Proceso;
  etapas: EtapaDeProceso[];
  /** Cuántos pendientes del proceso siguen sin cerrarse. */
  pendientesAbiertos: number;
}

/**
 * El 409 de pedirle avance a un proceso cerrado.
 *
 * Lo contestan avanzar de etapa, el `PUT` del plan, abrir un pendiente y el
 * segundo cierre. Es 409 y no 422 por lo mismo que `sin_etapas_pendientes`:
 * la petición está bien formada y es el estado el que no la admite.
 *
 * Es **uno solo** para las cuatro y no cuatro motivos distintos porque la
 * respuesta a todas es la misma —reabrir el proceso— y la frase que la
 * pantalla dibuja es la misma. Cuatro motivos serían cuatro formas de decir
 * «está cerrado» y la cuarta terminaría dicha distinto.
 */
export interface ProcesoCerrado {
  error: "proceso_cerrado";
}

/**
 * El 409 de reabrir algo que nunca se cerró.
 *
 * La contraparte exacta del anterior: el error nombra el estado que estorba,
 * no la operación. Y es un rechazo y no un no-op silencioso por lo mismo que
 * el segundo cierre de un pendiente en T-9: una reapertura que no reabrió
 * nada dejaría en la bitácora un hecho que no pasó.
 */
export interface ProcesoAbierto {
  error: "proceso_abierto";
}

/* ==========================================================================
   Guardar el plan de un proceso como plantilla (T-11)

   El camino que el diseño señala como el más usado para crear una plantilla:
   se abre un proceso, se le acomodan los pasos sobre la marcha, y cuando
   queda bien se guarda (`docs/diseno.md` §6, «Etapas: plantilla y plan de
   trabajo»). Es una copia de `proceso_etapa` hacia `etapa_plantilla`.

   **Las etapas no viajan en el cuerpo.** El plan ya está guardado en el
   servidor: mandarlo de vuelta sería dejar que la pantalla decidiera qué se
   copia, y abriría la puerta a guardar como plantilla algo que el proceso no
   tiene. Lo único que viaja es el destino.

   `alcanzadaEn` no aparece por ningún lado, y no es un olvido: una plantilla
   es un plan, y en un plan no hay nada «ya hecho». `etapa_plantilla` no
   tiene esa columna y no debe tenerla.
   ========================================================================== */

/**
 * A dónde va el plan.
 *
 *  - `actualizar`: reemplaza las etapas de la plantilla del tipo al que el
 *    proceso ya pertenece.
 *  - `nuevo`: crea un tipo de proceso nuevo, en un área existente, con este
 *    plan como su plantilla.
 *
 * **El proceso de origen no se reasigna** cuando el destino es un tipo
 * nuevo: sigue apuntando a su tipo viejo. Es la decisión de T-11, y sale de
 * la misma promesa que la pantalla hace — guardar una plantilla no modifica
 * ningún proceso abierto, y el de origen es un proceso abierto.
 */
export type DatosDeGuardadoDePlantilla =
  | { destino: "actualizar" }
  | {
      destino: "nuevo";
      areaId: string;
      nombre: string;
      descripcion: string | null;
    };

/** El tipo de proceso de destino y su plantilla recién escrita. */
export interface PlantillaGuardada {
  tipo: TipoProceso;
  etapas: EtapaPlantilla[];
}

/* ==========================================================================
   Notas y línea de tiempo (T-8)

   Una **nota es un hecho**: fechado, anclado a la etapa donde ocurrió, con
   autor, e inmutable (`docs/diseno.md` §3). No la escribe el sistema, la
   escribe una persona porque quiere dejar dicho algo — «el cliente quiere
   pago diferido por meses». Es distinta de una entrada de `bitacora`, que es
   un hecho *del sistema* y es T-10.

   Tres decisiones que esta sección hace visibles en el cable:

    - **A qué etapa se ancla.** `nota.proceso_etapa_id` es `NOT NULL`, y un
      proceso recién abierto no tiene ninguna etapa alcanzada. Se ancla a la
      **etapa vigente**, que es la misma que el listado ya muestra como «lo
      que viene»: la primera pendiente en el orden del plan. Si no queda
      ninguna pendiente, la última alcanzada. Esa es la etapa en la que el
      trabajo está pasando, que es lo que «anclada a la etapa donde ocurrió»
      quiere decir mientras se escribe.
    - **Quien escribe puede elegir otra**, siempre que sea del mismo proceso.
      Una nota se escribe a veces días después del hecho, y como es inmutable
      el momento de escribirla es la única oportunidad de anclarla bien.
    - **No hay forma de editar ni de borrar.** No existe ni la ruta ni el
      identificador: una nota no tiene dirección propia, se lee como parte de
      la línea de tiempo de su proceso. La base lo sostiene aparte, con los
      dos disparadores de T-2.
   ========================================================================== */

/**
 * Una nota tal como la lee la pantalla.
 *
 * `autorNombre` se resuelve **en lectura**: lo que se guarda es la llave
 * (§6, «Autoría»). Si alguien cambia de apellido, cuatrocientas notas no
 * quedan firmadas con un nombre que ya no existe.
 */
export interface NotaDeProceso {
  id: string;
  procesoEtapaId: string;
  texto: string;
  autorId: string;
  autorNombre: string | null;
  creadaEn: string;
}

/** Las notas de una etapa, en el orden en que se escribieron. */
export interface TramoDeLineaDeTiempo {
  etapa: EtapaDeProceso;
  notas: NotaDeProceso[];
}

/**
 * La línea de tiempo de un proceso: sus notas agrupadas por etapa, en el
 * orden del plan.
 *
 * **Solo vienen las etapas que tienen notas.** La línea de tiempo es el
 * registro de lo que pasó, no una segunda copia del plan: el plan ya está en
 * la pantalla, separado en cumplido y pendiente, y una etapa vacía acá no
 * dice nada que allá no se vea mejor.
 */
export interface LineaDeTiempo {
  tramos: TramoDeLineaDeTiempo[];
}

/**
 * Lo que el formulario manda al anotar. Ya normalizado.
 *
 * No lleva autor ni momento: los pone el servidor con la identidad de Access
 * y el reloj. Que el cliente pudiera mandarlos sería dejar firmar a nombre
 * de otro y fechar un hecho cuando convenga, sobre una fila que después no
 * se puede corregir.
 *
 * `procesoEtapaId` nulo es «la que el servidor elija»: la etapa vigente.
 */
export interface DatosDeNota {
  texto: string;
  procesoEtapaId: string | null;
}

/* ==========================================================================
   Las personas del bufete (T-9)

   El sistema **no da de alta a nadie**: quién entra lo deciden Cloudflare
   Access y la fila en `usuario` (T-3, `docs/diseno.md` §7). Este listado
   existe para una sola cosa: poder **elegir responsable**, que es lo que un
   pendiente necesita y lo que T-7 dejó señalado cuando `responsable_id`
   quedó sin forma de poblarse.

   Por eso solo se lee. Un `POST` acá sería una segunda puerta de entrada al
   bufete, al lado de la que ya existe.
   ========================================================================== */

/**
 * Una persona del bufete.
 *
 * `activo` viaja **marcado y no omitido**, igual que en los catálogos de T-5
 * y T-6: un pendiente viejo puede tener como responsable a alguien que ya no
 * está, y la pantalla necesita poder nombrarlo sin ofrecerlo para uno nuevo.
 *
 * El correo viaja porque es lo que distingue a dos personas que se llaman
 * igual, y porque ya viaja en `/api/yo` desde T-3.
 */
export interface Usuario {
  id: string;
  nombre: string;
  email: string;
  activo: boolean;
}

export interface RespuestaDeUsuarios {
  usuarios: Usuario[];
}

/* ==========================================================================
   Pendientes (T-9)

   Un **pendiente es algo que sigue pasando**: «falta el documento X, pero el
   proceso inicia» (`docs/diseno.md` §3 y §6). Es la razón por la que el
   bufete quiere este sistema.

   Las tres propiedades que lo definen, y que lo separan de una nota:

    1. **No bloquea el avance de etapa.** Es la otra mitad del ejemplo. Un
       proceso con cabos sueltos sigue andando; lo que no hace es olvidarlos.
    2. **Sobrevive el cambio de etapa sin que nadie lo copie.** Nace en una
       etapa —`proceso_etapa_id` dice cuál— y se lee por proceso, nunca por
       etapa. Esa es toda la mecánica: no hay copia porque no hace falta.
    3. **No se calla.** Mientras esté abierto aparece contado arriba del
       proceso, no en una pestaña.

   Y las dos decisiones que T-9 tomó, visibles acá en el cable:

    - **Un pendiente cerrado no se reabre.** No existe la operación. El
      esquema tiene un solo par `cerrado_en`/`cerrado_por`, así que reabrir
      sería ponerlos en nulo: borrar la firma de quien cerró. El proyecto no
      hace eso con `alcanzada_en` ni con una nota, y el caso real —«cerré
      *falta el documento X* y el documento era otro»— se dice mejor con un
      pendiente nuevo que nombre el documento correcto, dejando el cerrado
      como el registro de que se persiguió el equivocado.
    - **La etapa donde nació no se quita del plan**, ni con el pendiente
      cerrado. Ver `etapa_con_pendientes_no_se_quita`.

   **La etapa de nacimiento no se elige.** A diferencia de una nota —que se
   escribe a veces días después del hecho y por eso deja elegir dónde
   anclarla—, un pendiente nace cuando alguien lo escribe. El servidor lo
   ancla a la etapa vigente y no hay campo para discutirlo: elegir otra sería
   afirmar que el cabo suelto apareció antes de que nadie lo viera.
   ========================================================================== */

/**
 * Un pendiente tal como lo lee la pantalla.
 *
 * Los nombres de autor, responsable y de quien cerró se resuelven **en
 * lectura**: lo que se guarda es la llave (`docs/diseno.md` §6, «Autoría»).
 *
 * **Autor y responsable son dos personas distintas**, y no por casualidad:
 * el autor es quien vio el cabo suelto y el responsable quien lo tiene que
 * resolver. La pantalla los dibuja distinto porque confundirlos es perder la
 * mitad del dato.
 *
 * `responsableId` nulo es legítimo —el esquema lo deja nulo y §5 no lo lista
 * como invariante—, pero es el estado en el que un pendiente se pierde, así
 * que la pantalla lo dice en vez de dejar un hueco.
 *
 * `venceEn` es un **día** `AAAA-MM-DD`, no un instante. Un vencimiento de
 * bufete es una fecha del calendario; el instante que guarda la columna es
 * un detalle del repositorio y no se asoma por acá.
 *
 * `cerradoEn` y `cerradoPor` van juntos o no van. Es el `CHECK` del esquema,
 * y existe porque cerrar sin dejar quién cerró es exactamente el agujero que
 * esta tabla tapa.
 */
export interface PendienteDeProceso {
  id: string;
  /** La etapa donde **nació**. No se mueve ni cuando el proceso avanza. */
  procesoEtapaId: string;
  procesoEtapaNombre: string | null;
  texto: string;
  autorId: string;
  autorNombre: string | null;
  responsableId: string | null;
  responsableNombre: string | null;
  creadoEn: string;
  /** Día `AAAA-MM-DD`, o nulo. */
  venceEn: string | null;
  cerradoEn: string | null;
  cerradoPor: string | null;
  cerradoPorNombre: string | null;
}

/**
 * Los pendientes de un proceso, **abiertos y cerrados en una sola lista**.
 *
 * Vienen juntos y los separa el navegador, al revés que la línea de tiempo
 * de T-8, que llega ya agrupada. La razón es que el reparto abierto/cerrado
 * cambia en cada cierre y la pantalla tiene que poder recontarlo sin pedir
 * nada: el contador de la cabecera es lo que no puede quedar desactualizado.
 *
 * El orden lo pone el servidor: primero los abiertos, dentro de ellos el que
 * vence antes, los sin fecha al final, y después los cerrados.
 */
export interface RespuestaDePendientes {
  pendientes: PendienteDeProceso[];
}

/**
 * Lo que el formulario manda al anotar un pendiente. Ya normalizado.
 *
 * No lleva autor, ni momento, ni etapa: los pone el servidor con la
 * identidad de Access, el reloj y el plan. Que el cliente pudiera mandarlos
 * sería dejar firmar a nombre de otro (I-6) y decidir dónde nació algo que
 * está naciendo ahora.
 */
export interface DatosDePendiente {
  texto: string;
  responsableId: string | null;
  /** Día `AAAA-MM-DD`, o nulo. */
  venceEn: string | null;
}

/**
 * El 409 de cerrar algo que ya estaba cerrado.
 *
 * Es 409 y no 422 por lo mismo que `sin_etapas_pendientes` en T-7: la
 * petición está bien formada y es el estado el que no la admite. Y es un
 * rechazo y no un no-op silencioso porque el segundo cierre **no puede**
 * reescribir la firma del primero.
 */
export interface PendienteYaCerrado {
  error: "pendiente_ya_cerrado";
}

/* ==========================================================================
   La cotización en borrador (tajada 2, T-2)

   Lo que viaja por el cable de `/api/cotizaciones`. El esquema entero vive
   en `migrations/0004_cotizaciones.sql`, y **esta sección es deliberadamente
   más angosta que esa tabla**: lo que la base guarda y lo que la API expone
   no tienen por qué coincidir, y acá la diferencia es el diseño.

   Lo que la tabla tiene y el cable no:

    - **`snapshot`.** Es el documento congelado entero, y lo escribe T-4 al
      emitir. No es un campo de una ficha: quien mira un listado no lo
      necesita, y mandarlo en cada fila haría que el listado pesara lo que
      pesan todos los documentos juntos. Que un borrador no lo tenga ya lo
      dice `estado`, por el `CHECK` de coherencia de T-1.
    - **`tenant_id`.** Nunca viaja, por lo mismo que en todo lo demás: el
      bufete lo decide la puerta, no el cuerpo.

   Y lo que el cable tiene y la tabla no: `clienteNombre` y `creadaPorNombre`,
   resueltos **en lectura** igual que en `Cliente` (§6, «Autoría»).
   ========================================================================== */

/**
 * El ciclo de vida de una cotización, cerrado en los cuatro valores que el
 * `CHECK` de `cotizacion.estado` admite.
 *
 * T-2 escribe uno solo: un borrador nace `borrador` y se queda ahí. Los otros
 * tres existen en el tipo porque una cotización **leída** puede estar en
 * cualquiera de ellos, y porque el 409 de más abajo tiene que poder decir en
 * cuál quedó.
 */
export type EstadoDeCotizacion = "borrador" | "emitida" | "ganada" | "perdida";

/**
 * Una cotización tal como la lee la pantalla.
 *
 * `fecha` y `venceEn` **no tienen la misma forma, y es a propósito**:
 *
 *  - `fecha` es un **momento** ISO 8601 UTC. Es cuándo se abrió el borrador,
 *    lo pone el servidor y nadie lo elige.
 *  - `venceEn` es un **día** `AAAA-MM-DD`, o nulo. Es lo único de los dos que
 *    una persona elige, y lo que elige en un calendario es un día: «vale
 *    hasta el 31». La hora la pone el repositorio al guardar —el final de ese
 *    día— y la vuelve a quitar al leer, así que lo que se manda y lo que se
 *    recibe son la misma cadena. Es la misma forma que `venceEn` de un
 *    pendiente (T-9), que es el otro vencimiento que esta API tiene.
 *
 * `codigo` lo genera el servidor; no es un campo del formulario. Ver
 * `worker/cotizaciones/repositorio.ts`.
 */
export interface Cotizacion {
  id: string;
  /** `COT-<año>-<correlativo>`, único dentro del bufete. Lo pone el servidor. */
  codigo: string;
  estado: EstadoDeCotizacion;
  clienteId: string;
  clienteNombre: string | null;
  /** Momento ISO 8601 UTC: cuándo se abrió. */
  fecha: string;
  /** Día `AAAA-MM-DD`, o nulo. Una cotización puede no vencer. */
  venceEn: string | null;
  moneda: string;
  /** De cuál nació, cuando nació duplicando otra (T-5). */
  duplicadaDeId: string | null;
  creadaPor: string;
  creadaPorNombre: string | null;
  creadaEn: string;
}

/**
 * Lo que el formulario manda al crear o editar un borrador. Ya normalizado.
 *
 * Son **dos campos y no doce**, y la lista corta es el contenido de la
 * decisión: de las doce columnas de `cotizacion`, las otras diez o las pone
 * el servidor (`id`, `codigo`, `fecha`, `creadaPor`, `creadaEn`,
 * `tenant_id`), las fija el esquema (`estado`, `moneda`), o son de otra tarea
 * (`snapshot` es de T-4, `duplicadaDeId` es de T-5). Un campo de más acá
 * sería un camino para imponer desde el cuerpo algo que la API decide.
 */
export interface DatosDeCotizacion {
  clienteId: string;
  /** Día `AAAA-MM-DD`, o nulo. */
  venceEn: string | null;
}

export interface RespuestaDeCotizacion {
  cotizacion: Cotizacion;
}

export interface RespuestaDeCotizaciones {
  cotizaciones: Cotizacion[];
}

/**
 * La respuesta de ganar y de perder (T-5, ampliada por T-7, vaciada por
 * T-13).
 *
 * **Vuelve a ser `RespuestaDeCotizacion` y por un rato dejó de serlo.** T-7
 * le agregó `procesosAbiertos`, el conteo de los trámites que el desenlace
 * abría, con un argumento que era correcto mientras ganar abriera algo: que
 * «no abrió ninguno» y «no sé cuántos abrió» se ven igual desde una pantalla
 * si el campo falta. T-13 le sacó el sujeto a esa frase — **ganar ya no abre
 * nada**, porque el reparto de líneas a expedientes es del bufete y no del
 * sistema, y se decide después, en `POST /api/cotizaciones/{id}/procesos`.
 * Un conteo que valdría cero siempre no es información: es un campo que
 * promete una consecuencia que esta ruta ya no tiene.
 *
 * Sigue siendo un tipo propio y no un alias de `RespuestaDeCotizacion`
 * porque las dos rutas contestan preguntas distintas y el día que el
 * desenlace vuelva a traer algo suyo —la propuesta ya armada, por ejemplo—
 * el sitio donde ponerlo es éste y no el de leer una cotización.
 */
export interface RespuestaDeCierre {
  cotizacion: Cotizacion;
}

/**
 * Un proceso por abrir desde una cotización ganada (T-13).
 *
 * **Son tres campos y no cuatro, y el que falta es la decisión.**
 * `clienteId` no se lee del cuerpo: sale de la cotización, que es I-3 —el
 * proceso nacido de una cotización comparte cliente con ella— y lo sostiene
 * un disparador de `migrations/0011_el_proceso_cuelga_de_la_cotizacion.sql`.
 * Aceptarlo acá sería ofrecer un camino para pedir un proceso de otro
 * cliente y que la base lo abortara con un 500 en vez de que la API no
 * tenga dónde recibirlo.
 *
 * `origen` tampoco viaja, por el mismo criterio con el que `DatosDeProceso`
 * no lo lleva: lo deriva quien escribe la fila, de si hay cotización detrás
 * o no. Un `origen` que llegara del cuerpo sería el camino para marcar como
 * nacido de una cotización algo que no nació de ninguna.
 *
 * No es `Omit<DatosDeProceso, "clienteId">` aunque hoy coincidan campo por
 * campo: el día que el alta a mano gane un campo suyo, ese campo no tiene
 * por qué entrar por esta puerta, y un `Omit` lo metería sin que nadie lo
 * decida.
 */
export interface DatosDeProcesoPorAbrir {
  tipoProcesoId: string;
  titulo: string;
  responsableId: string | null;
}

/**
 * El cuerpo de `POST /api/cotizaciones/{id}/procesos` (T-13).
 *
 * Es un objeto con una lista adentro y **no la lista pelada**, por lo mismo
 * que el reordenamiento de módulos manda `{ orden: [...] }`: un JSON de
 * nivel superior que es un arreglo es el que después nadie sabe versionar.
 *
 * La lista va **en el orden en que el bufete la confirmó**, y los procesos
 * nacen en ese orden. No es cosmética: es el orden en que la pantalla los
 * va a listar debajo de la cotización, y el que alguien reconoce tres meses
 * después.
 */
export interface DatosDeApertura {
  procesos: DatosDeProcesoPorAbrir[];
}

/**
 * Lo que contesta abrir procesos desde una cotización ganada (T-13).
 *
 * **Son identificadores y no procesos enteros, y la lista corta es la
 * decisión.** La pregunta «¿qué procesos tiene esta cotización?» se contesta
 * en un solo lugar —las filas de `proceso` que apuntan a ella, que
 * `GET /api/procesos` entrega con su cotización de origen resuelta— y una
 * respuesta con los procesos completos sería el segundo. La pantalla, al
 * volver de acá, relee esa lista; esto es lo que un 201 le debe a quien
 * pidió, no el camino por el que la pantalla se entera.
 *
 * No hay `location`, y la ausencia tiene el mismo motivo que en ganar:
 * `location` es **una** dirección y acá nacen N. Por eso las direcciones van
 * en el cuerpo, que es donde caben todas.
 */
export interface RespuestaDeApertura {
  /** Los procesos recién nacidos, en el orden en que se pidieron. */
  abiertos: string[];
}

/**
 * El 409 de abrir procesos sobre una cotización que no se ganó (T-13).
 *
 * Es el tercero de la familia, junto a `CotizacionNoEsBorrador` y
 * `CotizacionNoEsEmitida`, y es un tipo propio por la misma razón que
 * aquellos dos son dos: lo que la pantalla tiene que poder decir es
 * distinto. «Todavía no se mandó», «ya se cerró» y «el cliente todavía no
 * aceptó» mandan a hacer tres cosas diferentes, y un motivo genérico
 * obligaría a reconstruir cuál de las tres fue comparando estados.
 *
 * Lleva `estado` por lo mismo que los otros dos: «no está ganada» sin decir
 * en qué quedó obliga a recargar para enterarse, y lo que la persona
 * necesita saber es si falta emitirla, si falta el sí del cliente, o si ya
 * se perdió.
 */
export interface CotizacionNoEsGanada {
  error: "cotizacion_no_es_ganada";
  estado: EstadoDeCotizacion;
}

/**
 * El 409 de editar una cotización que ya salió del borrador.
 *
 * Es 409 y no 422 por lo mismo que `pendiente_ya_cerrado` en T-9: la petición
 * está bien formada y es el estado el que no la admite. Y no es 500: la base
 * no tiene hoy ninguna guarda que lo impida —I-4 es de T-4— así que el
 * `UPDATE` pasaría. Lo que lo frena es esta comprobación, que **cuenta** el
 * estado antes de escribir; no atrapa ningún error de la base, porque no hay
 * ninguno que atrapar.
 *
 * Lleva `estado` porque «ya no es borrador» sin decir en qué quedó obliga a
 * recargar para enterarse, y lo que la persona necesita saber es si alguien
 * la emitió o si ya se ganó.
 */
export interface CotizacionNoEsBorrador {
  error: "cotizacion_no_es_borrador";
  estado: EstadoDeCotizacion;
}

/**
 * El 409 de ganar o perder algo que no está emitido (T-5).
 *
 * Es el espejo del de arriba y son **dos tipos y no uno con el estado
 * esperado adentro**, por la misma razón por la que las rutas de emitir,
 * ganar y perder son tres y no un `PUT` con el estado en el cuerpo: lo que
 * la pantalla tiene que poder decir es «esto todavía no salió» o «esto ya se
 * cerró», y un motivo genérico la obligaría a reconstruir cuál de las dos
 * cosas pasó comparando estados.
 *
 * Cubre las tres formas de no estar emitida, y las tres son casos de
 * negocio reales con dos personas en el bufete:
 *
 *  - `borrador`: alguien todavía no la mandó. **Un borrador no se gana**:
 *    el desenlace es de un documento que salió, y ganar uno que nadie vio
 *    fabricaría un snapshot que nadie leyó. Lo cierra también la base
 *    (`migrations/0007_ciclo_de_vida.sql`, M-1).
 *  - `ganada` o `perdida`: ya se cerró, y el ciclo de vida de
 *    `docs/diseno.md` §8 no tiene vuelta. Para volver a cotizar se duplica.
 *
 * Lleva `estado` por lo mismo que su espejo: «no está emitida» sin decir en
 * qué quedó obliga a recargar para enterarse.
 */
export interface CotizacionNoEsEmitida {
  error: "cotizacion_no_es_emitida";
  estado: EstadoDeCotizacion;
}

/**
 * Los seis tipos de módulo de prosa (T-2 C, `docs/diseno.md` §8).
 *
 * Es la familia de **prosa** de la tabla de §8: la que el modelo escribe
 * libremente. La otra familia —líneas de honorarios, gastos estimados, plan
 * de pagos, totales— no está acá y no es un olvido: es estructurada, vive en
 * `cotizacion_linea` y en `cuota`, y es donde la barandilla manda («el modelo
 * no suma, nunca»).
 *
 * El catálogo es **cerrado y vive en código**, no en una tabla editable:
 * agregar un tipo es un despliegue. El criterio del proyecto —catálogo en la
 * base cuando el valor es sólo una etiqueta, en código cuando hay código
 * detrás— apunta al código, igual que con el vocabulario de la bitácora:
 * detrás de cada tipo hay un rótulo, un lugar en el orden sugerido y, desde
 * T-9, un prompt. Y §5 obliga a que la base lo sostenga igual, así que
 * también está el `CHECK` de `migrations/0004_cotizaciones.sql`.
 *
 * Las dos mitades se mueven juntas o no se mueven:
 * `test/modulos-api.spec.ts` las compara y falla si se separan. El rótulo y
 * el orden sugerido viven en `worker/cotizaciones/modulos.ts`; acá está sólo
 * la unión, que es lo que cruza el cable.
 */
export type TipoDeModulo =
  | "alcance"
  | "exclusiones"
  | "antecedentes"
  | "supuestos"
  | "clausulas"
  | "nota_cliente";

/**
 * Un módulo tal como lo lee la pantalla.
 *
 * **No trae rótulo**, y la ausencia es el diseño: el rótulo sale del registro
 * tipado, que la pantalla importa igual que lo importa el servidor.
 * Mandarlo por el cable sería una segunda copia que el día que alguien
 * cambie un rótulo se queda vieja en las cotizaciones ya cargadas.
 *
 * `orden` es la posición dentro de la cotización y **lo asigna el servidor**,
 * nunca el cuerpo. Se manda de vuelta porque es lo que ordena la lista, y
 * porque la pantalla necesita poder dibujar «subir» y «bajar» sabiendo dónde
 * está cada uno. Los valores son consecutivos desde 0 después de un
 * reordenamiento, pero quitar un módulo deja un hueco: lo que vale es el
 * orden relativo, no el número.
 */
export interface ModuloDeCotizacion {
  id: string;
  tipo: TipoDeModulo;
  orden: number;
  contenido: string;
}

/**
 * Lo que el formulario manda al agregar o editar un módulo. Ya normalizado.
 *
 * Son **dos campos y no cuatro**: `id` y `orden` los pone el servidor. Un
 * `orden` que llegara del cuerpo sería el camino para pedirle a la base dos
 * módulos en la misma posición —que el índice único rechazaría con un 500— y
 * para que el generador de T-9 decida un número en vez de una lista.
 */
export interface DatosDeModulo {
  tipo: TipoDeModulo;
  contenido: string;
}

/**
 * Los módulos de una cotización, **en su orden**.
 *
 * Las cuatro operaciones de escritura devuelven la lista entera, igual que
 * los pendientes de T-9: lo que cambió no es un módulo sino el documento, y
 * una respuesta parcial obligaría a la pantalla a recomponer el orden a mano
 * justo después de haberlo cambiado.
 */
export interface RespuestaDeModulos {
  modulos: ModuloDeCotizacion[];
}

/**
 * Las dos clases de línea (T-3 A, `docs/diseno.md` §8).
 *
 * Es la familia **estructurada** de §8, la otra mitad de la tabla: acá el
 * modelo no escribe prosa, rellena campos tipados y **el sistema hace la
 * aritmética**. La barandilla de la tajada vive entera en esta unión y en el
 * hecho de que no haya ninguna columna de total.
 *
 * `honorario` y `gasto_estimado` no son una etiqueta cosmética: la pantalla
 * las muestra separadas y rotula el gasto como aproximado, porque un
 * presupuesto de gasto que se lee como un precio cerrado es una promesa que
 * el bufete no puede cumplir.
 *
 * El catálogo es **cerrado y está en dos mitades acopladas**, exactamente
 * como el de los tipos de módulo: el `CHECK` de `cotizacion_linea.clase` en
 * `migrations/0004_cotizaciones.sql` y el registro tipado de
 * `worker/cotizaciones/lineas.ts`, que es el que pone el rótulo y el orden
 * en que se muestran. `test/lineas-api.spec.ts` las compara y falla si se
 * separan.
 */
export type ClaseDeLinea = "honorario" | "gasto_estimado";

/**
 * Una línea tal como la lee la pantalla.
 *
 * `monto` son **centavos enteros**, nunca una cantidad con coma: es la
 * restricción 5 de la tajada, y la base la sostiene con
 * `CHECK (typeof(monto) = 'integer' AND monto >= 0)` porque en SQLite
 * `INTEGER` es afinidad y no tipo. Lo que cruza el cable es ese mismo entero;
 * convertirlo a dinero legible es de la pantalla.
 *
 * **No trae subtotal ni la línea sabe de totales**: se derivan, y viajan
 * aparte en `TotalesDeCotizacion`.
 *
 * `tipoProcesoId` es opcional y es lo que T-7 va a usar para abrir procesos
 * desde una cotización ganada. Una línea sin trámite —una consulta, una
 * mensajería— es el caso corriente y no la excepción.
 *
 * `tipoProcesoNombre` se resuelve **en lectura**, igual que `clienteNombre`:
 * lo que se guarda es la llave. Viene nulo cuando no hay trámite, y también
 * si la fila apuntada cruzara la frontera del tenant.
 *
 * ## `arancelRenglonId` dice de dónde salió el precio, y no es lo mismo
 *
 * Las dos llaves conviven y hacen trabajos distintos (T-1 de
 * `odd/tasks/precios-en-la-cotizacion.md`): `tipoProcesoId` dice **qué proceso
 * se abre** si la cotización se gana, y `arancelRenglonId` dice **de dónde
 * salió el monto** —de qué renglón tarifado del bufete—. Una línea puede
 * llevar las dos, una sola o ninguna: el bufete tarifa servicios que no abren
 * trámite y abre trámites que el arancel no lista.
 *
 * Nula es el caso corriente y no una falla: una línea con monto libre —una
 * consulta, una mensajería— no sale de ningún renglón. Y el renglón apuntado
 * **tiene precio del bufete, siempre**: la base lo aborta si no
 * (`cotizacion_linea_el_origen_del_precio_tiene_precio_al_insertar`, en
 * `migrations/0013_el_precio_sabe_de_donde_salio.sql`).
 *
 * `arancelConcepto` es el **concepto del renglón**, resuelto en lectura por lo
 * mismo que `tipoProcesoNombre`: lo que se guarda es la llave. No viaja el
 * monto del renglón ni su monto oficial, y eso no es un olvido — el monto que
 * vale es el de la línea, y un segundo número de dinero al lado sería la
 * comparación con el arancel que `odd/tasks/arancel-de-honorarios.md` dejó
 * prohibida.
 */
export interface LineaDeCotizacion {
  id: string;
  clase: ClaseDeLinea;
  concepto: string;
  /** Centavos enteros, cero o más. Nunca coma flotante. */
  monto: number;
  tipoProcesoId: string | null;
  tipoProcesoNombre: string | null;
  arancelRenglonId: string | null;
  arancelConcepto: string | null;
  orden: number;
}

/**
 * Lo que el formulario manda al agregar o editar una línea. Ya normalizado.
 *
 * Son **cuatro campos y no seis**: `id` y `orden` los pone el servidor, por
 * lo mismo que en un módulo. Un `orden` que llegara del cuerpo sería el
 * camino para pedirle a la base dos líneas en la misma posición.
 */
export interface DatosDeLinea {
  clase: ClaseDeLinea;
  concepto: string;
  /** Centavos enteros, cero o más. */
  monto: number;
  tipoProcesoId: string | null;
}

/**
 * Lo que suman las líneas de una cotización. **Derivado, nunca guardado.**
 *
 * Es la barandilla de la tajada escrita como tipo: no hay columna de
 * subtotal ni de total, ni en `cotizacion_linea` ni en `cotizacion`. Si se
 * guardaran, en seis meses habría cotizaciones cuyo total no coincide con la
 * suma de sus líneas y nadie sabría cuál de los dos números es el verdadero.
 *
 * Los tres son **centavos enteros**, y la aritmética que los produce vive en
 * `worker/cotizaciones/lineas.ts`, en una función pura que el servidor y la
 * pantalla importan del mismo lugar. Dos sumas en dos sitios son dos
 * resultados el día que una cambie.
 *
 * El ITBMS no está acá y no es un olvido: es T-12, y está bloqueada por la
 * decisión de cómo se trata el impuesto sobre honorarios frente a gastos
 * reembolsables.
 */
export interface TotalesDeCotizacion {
  /** Σ de las líneas de clase `honorario`, en centavos. */
  honorarios: number;
  /** Σ de las líneas de clase `gasto_estimado`, en centavos. Aproximado. */
  gastosEstimados: number;
  /**
   * El ITBMS sobre los honorarios, en centavos — **o la clave no está**.
   *
   * ## La ausencia significa una sola cosa, y por eso es opcional
   *
   * > El campo está **si y sólo si el bufete factura ITBMS**.
   *
   * No es `number | null` ni un cero: es una clave que aparece o no aparece,
   * y las tres formas no son intercambiables. Un `0` diría «no te cobramos
   * impuesto», que es distinto de «todavía no lo facturamos», y una pantalla
   * que dibujara un renglón de ITBMS en 0,00 le haría creer al cliente lo
   * primero cuando lo que pasa es lo segundo. Por eso **apagado no es cero:
   * es ausencia**, y con el impuesto encendido una cotización sin honorarios
   * sí lleva su renglón en cero, que ahí sí es verdad.
   *
   * ## Y por eso tampoco hace falta subir `VERSION_DEL_SNAPSHOT`
   *
   * Un documento congelado con el impuesto apagado queda con **la misma
   * forma exacta** que los que ya están escritos en la columna `snapshot`,
   * así que `obtenerDocumento` —que hace `JSON.parse(...) as
   * DocumentoCongelado` sin validar, y con razón— no tiene nada nuevo que
   * normalizar. Y uno escrito con el impuesto encendido se describe solo: la
   * clave presente **es** el aviso de que el total la lleva adentro. Un
   * número de versión diría menos que eso —no sabría contestar si *esta*
   * cotización llevó impuesto— y sería el segundo lugar donde decir algo que
   * el campo ya dice.
   *
   * El valor es **centavos enteros y truncado hacia abajo**: el 7 % de
   * 162 345 son 11 364,15 y acá dice 11 364. El residuo no se reparte ni se
   * ajusta contra el total, por lo que `worker/cotizaciones/impuesto.ts`
   * explica entero.
   */
  itbms?: number;
  /**
   * Lo que el cliente paga. En centavos.
   *
   * Con el impuesto apagado es `honorarios + gastosEstimados`. Encendido es
   * `honorarios + itbms + gastosEstimados`: el gasto estimado es plata de
   * terceros que el bufete adelanta, y pasa sin gravar.
   */
  total: number;
}

/**
 * Las líneas de una cotización, **en su orden**, con lo que suman.
 *
 * Las cuatro operaciones de escritura devuelven la lista entera y los totales
 * recalculados, igual que los módulos devuelven la lista entera: lo que
 * cambió no es una línea sino el documento. Y los totales viajan con ella
 * porque **la pantalla no los calcula**: si los sumara por su cuenta, el día
 * que la aritmética cambie habría dos respuestas distintas a la misma
 * pregunta.
 */
export interface RespuestaDeLineas {
  lineas: LineaDeCotizacion[];
  totales: TotalesDeCotizacion;
}

/* ==========================================================================
   El documento congelado, en el cable (tajada 2, T-6)

   Lo que `cotizacion.snapshot` guarda, dicho en el contrato para que la
   pantalla que lo imprime pueda nombrarlo.

   ## Por qué existe una dirección aparte y no un campo más

   La sección de arriba dice que `snapshot` **no viaja** en `Cotizacion`, y
   eso no cambia: el listado seguiría pesando lo que pesan todos los
   documentos juntos, y una ficha de trabajo no lo necesita. Lo que T-6
   agrega no es ese campo sino **otra pregunta**: no «¿cómo está esta
   cotización?» sino «¿qué dice el papel que se mandó?». Son dos lecturas
   con dos tamaños y dos frecuencias, y por eso son dos direcciones.

   Que `GET /api/cotizaciones/{id}` y `GET /api/cotizaciones/{id}/documento`
   puedan contestar cosas distintas sobre la misma cotización **no es una
   incoherencia: es el punto entero de T-4**. La primera lee las tablas
   vivas, donde el nombre del cliente es el de hoy; la segunda lee lo que se
   congeló, donde es el del día que se emitió. Si coincidieran siempre, el
   snapshot no estaría congelando nada.

   ## Estas interfaces son la misma forma que `worker/cotizaciones/snapshot.ts`

   Y son una segunda declaración, que es justo lo que este proyecto evita.
   Está así porque el cable necesita nombrarlas y `snapshot.ts` no puede
   entrar en el programa del navegador: importa `totalesDe` y los dos
   `rotuloDe…` **como valores**, así que listarlo en `tsconfig.app.json`
   arrastraría `congelar()` y su aritmética al bundle — la puerta de atrás
   hacia sumar en el cliente, que es lo único que esta tajada prohíbe de
   plano.

   **Las dos copias no pueden separarse en silencio**, y no por disciplina:
   `EL_DOCUMENTO_DEL_CABLE_ES_EL_SNAPSHOT`, en
   `worker/cotizaciones/repositorio.ts`, es una afirmación de
   asignabilidad en los dos sentidos que deja de compilar si una de las dos
   gana, pierde o renombra un campo. El día que `snapshot.ts` pueda importar
   de acá —basta con que sus dos ayudantes de rótulo se separen de
   `totalesDe`— estas interfaces se borran de allá y la guarda sobra.
   ========================================================================== */

/**
 * El cliente, tal como figuraba en la propuesta.
 *
 * `tipo` es el **nombre** del tipo de cliente y no su identificador: es un
 * catálogo que se edita y se da de baja, así que la llave no contesta nada
 * dentro de seis años. Casi todo es nullable porque casi todo lo es en
 * `cliente`: el alta pide lo mínimo para que se le pueda cotizar a un
 * prospecto.
 */
export interface ClienteCongelado {
  id: string;
  nombre: string;
  tipo: string | null;
  documentoTipo: string | null;
  documentoNumero: string | null;
  representanteLegal: string | null;
  email: string | null;
  telefono: string | null;
}

/**
 * Un módulo de prosa congelado.
 *
 * Lleva `tipo` **y** `rotulo` porque no son lo mismo: `tipo` es la cadena
 * del catálogo cerrado, que un lector automático compara; `rotulo` es el
 * encabezado que la persona leyó, y el catálogo vive en código y se puede
 * renombrar en cualquier despliegue.
 */
export interface ModuloCongelado {
  tipo: TipoDeModulo;
  rotulo: string;
  contenido: string;
}

/**
 * Una línea congelada. `monto` en **centavos enteros**, igual que en todas
 * partes: el documento no cambia de unidad a mitad de camino.
 */
export interface LineaCongelada {
  clase: ClaseDeLinea;
  rotulo: string;
  concepto: string;
  monto: number;
  tipoProcesoId: string | null;
  tipoProceso: string | null;
}

/** Quién la emitió. El nombre puede faltar; el identificador no. */
export interface EmisorCongelado {
  id: string;
  nombre: string | null;
}

/**
 * El documento congelado entero: lo que se le mandó al cliente.
 *
 * **Los `totales` que trae son un hecho histórico y no se recalculan.** Es
 * la única parte de este contrato donde una suma viaja guardada, y la
 * barandilla de la tajada no tiene una excepción acá: esa regla habla de
 * las tablas vivas, donde un total guardado es un total que algún día no
 * coincide con sus líneas. Acá las líneas que lo produjeron están
 * congeladas en el mismo objeto, así que no pueden separarse nunca — y
 * recalcular desde ellas el día que la aritmética cambie daría un número
 * que nadie le prometió a nadie.
 */
export interface DocumentoCongelado {
  version: number;
  /** Momento ISO 8601 UTC en que dejó de ser editable. */
  emitidaEn: string;
  emitidaPor: EmisorCongelado;
  cotizacion: {
    id: string;
    codigo: string;
    /** Momento ISO 8601 UTC: cuándo se abrió el borrador. */
    fecha: string;
    /** Día `AAAA-MM-DD`, o nulo. */
    venceEn: string | null;
    moneda: string;
  };
  cliente: ClienteCongelado;
  modulos: ModuloCongelado[];
  lineas: LineaCongelada[];
  totales: TotalesDeCotizacion;
}

export interface RespuestaDeDocumento {
  documento: DocumentoCongelado;
}

/**
 * El 409 de pedirle el documento a una cotización que todavía no lo tiene.
 *
 * ## Por qué 409 y no 404
 *
 * Porque un 404 contesta la pregunta equivocada. `textoDeProblema` lo dice
 * así: «No existe esa cotización, o no es de este bufete» — y las dos
 * mitades de esa frase son falsas sobre un borrador propio que se está
 * mirando. Quien lo lea va a buscar un problema de datos que no existe. Lo
 * que pasa es otra cosa, y es una que se arregla sola: todavía no se
 * emitió.
 *
 * ## Por qué no lleva el estado adentro
 *
 * Al revés que `CotizacionNoEsBorrador` y `CotizacionNoEsEmitida`, que sí
 * lo llevan. Ahí hace falta porque las dos cubren varios estados y «ya no
 * es borrador» sin decir en cuál quedó obliga a recargar. Acá no hay nada
 * que decir: el `CHECK` `el_borrador_no_tiene_snapshot_y_la_emitida_si` de
 * `migrations/0004_cotizaciones.sql` ata las dos columnas en las dos
 * direcciones, así que **sin documento es exactamente borrador** y un campo
 * `estado` sería un segundo lugar diciendo lo que el nombre del error ya
 * dice.
 *
 * Es además el motivo por el que no se reusa `cotizacion_no_es_emitida`:
 * una ganada y una perdida **no** están emitidas y sin embargo tienen su
 * documento y se imprimen. La condición no es el estado sino la ausencia
 * del documento, y el nombre la dice.
 */
export interface CotizacionSinDocumento {
  error: "cotizacion_sin_documento";
}

/* ==========================================================================
   El generador asistido por IA, en el cable (tajada 2, T-9)

   `docs/diseno.md` §8 «La entrada»: el abogado describe el encargo en prosa
   y sale un borrador con sus módulos y sus líneas, que después se edita a
   mano.

   **Lo que viaja hacia el servidor es prosa y un cliente, y nada más.** No
   hay un campo para el modelo, ni para la temperatura, ni para el número de
   módulos: cualquiera de los tres sería una decisión del despliegue puesta
   en manos del navegador. El proveedor se resuelve por configuración (§8,
   «La costura») y nada de lo que la pantalla manda lo puede cambiar.

   **Lo que viaja de vuelta es la cotización, y nunca la propuesta cruda.**
   `PropuestaDelModelo` no sale de `worker/ia/`: lo que la pantalla recibe es
   un borrador ya guardado, con su código de servidor y sus filas. Devolver
   la propuesta abriría el camino a una pantalla que la dibuja sin que exista
   en la base, y entonces lo que se ve y lo que se guardó serían dos cosas.
   ========================================================================== */

/**
 * Lo que la pantalla del generador manda. Ya normalizado.
 *
 * Son los dos campos del alta a mano **más la prosa**: generar un borrador
 * es crear uno, no una operación aparte, así que el cliente sigue siendo
 * obligatorio (I-1) y el vencimiento sigue siendo opcional.
 */
export interface DatosDeGeneracion {
  clienteId: string;
  /** Día `AAAA-MM-DD`, o nulo. */
  venceEn: string | null;
  /** El encargo en prosa, ya recortado y no vacío. */
  descripcion: string;
}

/**
 * Por qué no se pudo generar. **Siete motivos y no uno**, y la lista es el
 * contenido de la decisión.
 *
 * T-8 los separó en `worker/ia/modelo.ts` y vivían ahí; se mudaron acá en
 * T-9 porque dejaron de ser internos: **viajan por el cable**. Una pantalla
 * que dijera «error» para los siete tiraría el trabajo de separarlos, y lo
 * que se pierde es concreto — las cosas que hay que hacer son distintas:
 *
 *  - el proveedor caído se **reintenta** en un minuto;
 *  - la respuesta truncada pide un encargo **más corto**, porque lo que
 *    falló es el techo de tokens y no el modelo;
 *  - la petición declinada pide **reescribir** la descripción;
 *  - la salida que no pasó el esquema no la arregla quien mira la pantalla:
 *    se carga el borrador **a mano**, que es el camino que siempre estuvo;
 *  - los dos de configuración no los arregla nadie del bufete, y decirlo es
 *    lo que evita que alguien reintente veinte veces.
 *
 * `worker/ia/modelo.ts` lo reexporta para que la costura siga siendo el
 * único archivo que el resto del Worker mira, y para no tener dos uniones
 * paralelas que mañana digan cosas distintas.
 */
export type MotivoDeFallaDelModelo =
  /** No hay `IA_API_KEY`. Falla cerrada **antes de tocar la red**. */
  | "modelo_no_configurado"
  /** `IA_PROVEEDOR` nombra algo que no está implementado. */
  | "proveedor_desconocido"
  /** El proveedor no contestó, o contestó con un estado que no es 2xx. */
  | "proveedor_no_disponible"
  /** Contestó 200 con un cuerpo del que no se puede sacar ni un texto. */
  | "respuesta_ininteligible"
  /** Se cortó por `max_tokens`: no terminó, no se equivocó. */
  | "respuesta_truncada"
  /** El proveedor declinó la petición. */
  | "respuesta_rechazada_por_el_proveedor"
  /** **Contestó, y lo que contestó no pasa el esquema.** La barandilla. */
  | "salida_rechazada";

/**
 * Los siete, en ejecución, para poder recorrerlos.
 *
 * Hace falta porque una unión de TypeScript no existe en ejecución y hay dos
 * sitios que necesitan recorrerla: el `Record` exhaustivo de textos de
 * `src/mensajes.ts` ya lo cierra el compilador, pero el **guardián** de
 * abajo necesita una lista de verdad — lo que llega por el cable es una
 * cadena cualquiera hasta que alguien la comprueba.
 */
export const MOTIVOS_DE_FALLA_DEL_MODELO = [
  "modelo_no_configurado",
  "proveedor_desconocido",
  "proveedor_no_disponible",
  "respuesta_ininteligible",
  "respuesta_truncada",
  "respuesta_rechazada_por_el_proveedor",
  "salida_rechazada",
] as const satisfies readonly MotivoDeFallaDelModelo[];

/**
 * La red que impide que un motivo de la unión se quede fuera de la lista.
 *
 * El `satisfies` de arriba cierra una dirección: no se puede listar un
 * motivo que la unión no tiene. Esto cierra la otra: si alguien agrega un
 * motivo y no lo pone acá, `Exclude<…>` deja de ser `never`, la restricción
 * `T extends never` no se satisface y **el `typecheck` se cae con TS2344**
 * nombrando el motivo que falta.
 *
 * Es la forma que T-8 dejó medida en `worker/ia/esquema.ts`, y **no** la que
 * había antes en el proyecto: `export const X: Exclusion[] = []` compila
 * para cualquier `T`, porque un arreglo vacío es asignable a todo.
 *
 * Sin esta red, un motivo nuevo tendría su texto —el `Record` de
 * `src/mensajes.ts` lo exige— y sin embargo `esMotivoDeFallaDelModelo`
 * contestaría `false` sobre él: la pantalla caería en el camino de reserva
 * para un motivo que sí conoce, y nadie se enteraría.
 */
type DebeSerVacio<T extends never> = T;

export type MotivosDelModeloSinListar = DebeSerVacio<
  Exclude<MotivoDeFallaDelModelo, (typeof MOTIVOS_DE_FALLA_DEL_MODELO)[number]>
>;

const MOTIVOS: ReadonlySet<string> = new Set(MOTIVOS_DE_FALLA_DEL_MODELO);

/**
 * Si lo que llegó por el cable es uno de los motivos que esta versión
 * conoce.
 *
 * Existe porque el cuerpo de un 502 es `unknown` hasta que alguien lo mire:
 * un servidor más nuevo que la pantalla —o un proxy que inventa un cuerpo—
 * mandaría una cadena que no está en la unión, y convertirla con un `as`
 * daría un `undefined` detrás de un tipo que promete un texto.
 */
export function esMotivoDeFallaDelModelo(
  valor: unknown,
): valor is MotivoDeFallaDelModelo {
  return typeof valor === "string" && MOTIVOS.has(valor);
}

/**
 * El 502 del generador.
 *
 * **502 y no 500**, porque no es un defecto nuestro: lo que no entregó es un
 * sistema de arriba. Y **no 503**, que ya está tomado por la puerta de
 * Access (`AccesoDenegado`) y que `src/api/peticiones.ts` mapea a
 * `sin_acceso`: un 503 acá se leería como «la sesión no se reconoció», que
 * es falso y manda a hacer algo que no arregla nada.
 *
 * `motivo` viaja y `detalle` **no**. El detalle de `FallaDelModelo` es para
 * el operador —puede nombrar `IA_API_KEY` o el estado HTTP que devolvió el
 * proveedor— y quien mira la pantalla no tiene nada que hacer con eso.
 */
export interface GeneracionFallida {
  error: "generacion_fallida";
  motivo: MotivoDeFallaDelModelo;
}

/* ==========================================================================
   Gastos reales y comprobantes (tajada 2, T-10)

   La otra de las dos vidas del gasto (`docs/diseno.md` §6, «Gastos»): el
   **estimado** vive congelado en la cotización como una línea de clase
   `gasto_estimado`, y el **real**, con su comprobante, aparece meses después
   y vive en el proceso. Separados sale gratis el dato que más vale: cuánto se
   desvía lo que el bufete estima de lo que termina costando.

   Las dos cosas que esta sección hace visibles en el cable, y que son las dos
   decisiones de la tarea:

    - **El saldo viaja derivado y nunca almacenado** (I-7). `SaldoDeGastos` es
      lo que sale de `saldoDe` en ese mismo momento, no una columna leída. No
      hay forma de mandarlo: no está en `DatosDeMovimiento`.
    - **La llave del comprobante no viaja.** El cable lleva
      `tieneComprobante`, un booleano. Quien sube no elige dónde se guarda, y
      quien mira no necesita saberlo: ver `llaveDeComprobante` en
      `worker/gastos/dominio.ts`.
   ========================================================================== */

/**
 * De qué lado del saldo cae un movimiento.
 *
 * Dos valores y no tres, y de ellos salen **las dos mecánicas de cobro del
 * bufete sin una sola rama** (`docs/diseno.md` §6): el reembolso contra
 * factura es el proceso que sólo tiene filas `gasto`, y el anticipo con
 * sobrante a favor es el que tiene de los dos. La mecánica no es un dato: es
 * qué filas existen.
 *
 * El vocabulario está cerrado por los dos lados, igual que el de la bitácora:
 * `TIPOS_DE_MOVIMIENTO` en `worker/gastos/dominio.ts` cierra lo que la API
 * acepta, y el `CHECK` de `migrations/0009_gastos_y_comprobantes.sql` cierra
 * lo que la base acepta, que es lo único que sobrevive a un script de
 * importación (§5).
 */
export type TipoDeMovimiento = "gasto" | "anticipo";

/**
 * Un movimiento tal como lo lee la pantalla.
 *
 * `fecha` es el **día en que la plata se movió**, en `AAAA-MM-DD` y en el
 * calendario de Panamá; `registradoEn` es el momento en que se escribió la
 * fila. Son dos cosas distintas a propósito: la factura de la mensajería es
 * del mes pasado y se carga hoy, y con una sola columna o el saldo se ordena
 * por el día en que alguien tuvo tiempo, o se pierde cuándo entró el dato.
 *
 * `monto` son **centavos enteros y siempre positivos**: el signo lo lleva
 * `tipo`, nunca el número. Un `gasto` de −500 y un `anticipo` de 500 dirían
 * lo mismo de dos maneras.
 *
 * `usuarioNombre` se resuelve **en lectura**, igual que en todo lo demás: lo
 * que se guarda es la llave (§6, «Autoría»). Puede venir nulo si la fila de
 * `usuario` cruzara la frontera del tenant.
 *
 * `tieneComprobante` y no la llave: ver el encabezado de la sección.
 */
export interface MovimientoDeGasto {
  id: string;
  /** El día en que la plata se movió, `AAAA-MM-DD` en Panamá. */
  fecha: string;
  concepto: string;
  /** Centavos enteros, siempre positivos. El signo lo lleva `tipo`. */
  monto: number;
  tipo: TipoDeMovimiento;
  /** Si hay un papel subido. La dirección del objeto no sale del servidor. */
  tieneComprobante: boolean;
  usuarioId: string;
  usuarioNombre: string | null;
  registradoEn: string;
}

/**
 * La cuenta del proceso, **derivada en el momento de leerla** (I-7).
 *
 * `docs/diseno.md` §5: «El saldo de gastos nunca se almacena. Siempre se
 * deriva.» No hay columna de saldo en ninguna tabla de esta base, y esta
 * forma es lo que sale de `saldoDe` sobre los movimientos que se acaban de
 * leer. Los tres números son centavos enteros.
 *
 * `anticipos` y `gastos` viajan además del `saldo` porque sin ellos el número
 * no se puede auditar desde la pantalla: un saldo de −20 000 no dice si es un
 * reembolso de veinte mil o un anticipo de ochenta mil contra cien mil de
 * gastos, y esas dos situaciones se conversan distinto con el cliente.
 *
 * **Es informativo, no verdad contable**, y está en el alcance autorizado de
 * la tajada con todas las letras: facturación, conciliación bancaria, cuentas
 * por cobrar y estado de cuenta formal quedan fuera (§2).
 */
export interface SaldoDeGastos {
  /** `Σ` de los movimientos de tipo `anticipo`. */
  anticipos: number;
  /** `Σ` de los movimientos de tipo `gasto`. */
  gastos: number;
  /**
   * `anticipos − gastos`. Negativo es lo que el cliente debe; positivo, lo
   * que le sobra a favor.
   */
  saldo: number;
}

/**
 * La cuenta entera de un proceso: sus movimientos y lo que suman.
 *
 * Los dos viajan juntos y en la misma respuesta, no en dos rutas, porque son
 * el mismo hecho mirado de dos maneras: el saldo **es** la suma de esos
 * movimientos y de ningunos otros. Pedirlos por separado abriría la ventana
 * en la que la pantalla muestra una lista y un total que no le corresponde.
 */
export interface RespuestaDeGastos {
  /** Del movimiento más viejo al más nuevo: una cuenta se lee hacia adelante. */
  movimientos: MovimientoDeGasto[];
  saldo: SaldoDeGastos;
}

/** Lo que el alta de un movimiento acepta. No hay saldo, y no puede haberlo. */
export interface DatosDeMovimiento {
  tipo: TipoDeMovimiento;
  concepto: string;
  /** Centavos enteros, de cero en adelante. */
  monto: number;
  /** El día en que la plata se movió, `AAAA-MM-DD`. */
  fecha: string;
}

/**
 * Por qué no se pudo guardar o traer el comprobante.
 *
 * Es una unión propia y no `MotivoDeFallaDelModelo`: son dos sistemas de
 * arriba distintos, y una unión compartida obligaría a que la pantalla del
 * generador tuviera texto para un almacén de objetos que no usa.
 *
 * **Los dos son del almacén y ninguno es del usuario.** Lo que el usuario
 * puede hacer mal —un archivo que no es un comprobante, uno demasiado
 * grande— es un 422 con su `MotivoDeFalla`, igual que cualquier otro cuerpo
 * que no se acepta.
 */
export type MotivoDeFallaDelComprobante =
  /**
   * No hay binding de almacén en este despliegue. Falla cerrada **antes de
   * tocar nada**, que es el equivalente exacto de `modelo_no_configurado` en
   * la costura con el modelo y de `acceso_no_configurado` en la puerta: un
   * despliegue sin almacén sigue sirviendo todo lo demás, incluido registrar
   * gastos y leer el saldo. Lo único que no se puede es adjuntar el papel.
   */
  | "almacen_no_configurado"
  /** El almacén está configurado y la operación no se pudo completar. */
  | "almacen_no_disponible";

/**
 * El 502 del comprobante.
 *
 * **502 y no 500**, por lo mismo que `GeneracionFallida`: no es un defecto
 * nuestro, lo que no entregó es un sistema de arriba. Y **no 503**, que ya
 * está tomado por la puerta de Access y que `src/api/peticiones.ts` mapea a
 * `sin_acceso`: un 503 acá se leería como «la sesión no se reconoció», que es
 * falso y manda a hacer algo que no arregla nada.
 *
 * **Deuda declarada para la unidad B:** `src/api/peticiones.ts` ya trata el
 * 502, pero sólo reconoce los motivos del modelo; un
 * `comprobante_no_disponible` cae hoy en su texto de reserva —«respuesta
 * inesperada: HTTP 502»—. No rompe nada porque ninguna pantalla llama todavía
 * a estas rutas, y cerrarlo pide tocar ese archivo, que está fuera de la
 * superficie de esta unidad. Es el mismo tipo de deuda que T-2 A dejó escrita
 * con el `CONFLICTOS` no exhaustivo.
 */
export interface ComprobanteNoDisponible {
  error: "comprobante_no_disponible";
  motivo: MotivoDeFallaDelComprobante;
}

/* ==========================================================================
   El plan de pagos (tajada 2, T-11)

   Un **cronograma**, nunca un enum de modalidades (`docs/diseno.md` §6): un
   pago es una cuota, 50/50 son dos, mensual son N. No hay ningún tipo acá que
   nombre una forma de cobro, y esa ausencia es la decisión: con un enum, cada
   forma nueva cuesta una migración y el sistema pasa a tener dos fuentes de
   verdad —el enum y las filas— que algún día se contradicen.

   Las tres cosas que esta sección hace visibles en el cable:

    - **De qué cuelga una cuota no viaja en el cuerpo.** Lo dice la dirección:
      `/api/cotizaciones/{id}/cuotas` o `/api/procesos/{id}/cuotas`. Por eso
      `DatosDeCuota` no tiene `procesoId` ni `cotizacionId`, y la exclusividad
      de la decisión (c) no se puede violar desde el cliente ni siquiera
      intentándolo. Es el mismo reparto con el que la identidad de quien
      escribe sale de la puerta y nunca del cuerpo (I-6).
    - **El total del plan viaja derivado y nunca almacenado.** Es I-7 con la
      tercera piel —`0004` se negó a guardar el total de una cotización,
      `0009` el saldo de un proceso—, y se implementa igual: no hay columna, y
      `PlanDePagos.total` es lo que sale de `planDe` en ese mismo momento. No
      hay forma de mandarlo: no está en `DatosDeCuota`.
    - **El importe de una cuota porcentual lo aplica el servidor.** La
      pantalla recibe el número ya resuelto y no lo recalcula, por el
      precedente de T-3 con `totalesDe` y de T-10 con `saldoDe`: con la
      aritmética a mano del lado del navegador, la prueba de que la pantalla
      **muestra** y no calcula sería imposible de escribir.
   ========================================================================== */

/**
 * Una cuota del cronograma, tal como la lee la pantalla.
 *
 * ## `monto` y `porcentaje`: exactamente uno, y el tipo no lo puede decir
 *
 * Los dos son `number | null` y exactamente uno viene nulo. Una unión
 * discriminada —`{ monto: number } | { porcentaje: number }`— lo diría mejor
 * en el tipo, y **no se usa a propósito**: lo que llega del cable se valida
 * contra la base, que es donde vive el invariante
 * (`la_cuota_lleva_monto_o_porcentaje_y_nunca_los_dos`), y una unión acá
 * obligaría a la pantalla a estrechar con un `in` que el compilador no puede
 * verificar contra ninguna fila real. Dos formas de decir el mismo
 * invariante, y la de la base es la que sobrevive a un script de importación
 * (`docs/diseno.md` §5).
 *
 * ## `porcentaje` son **puntos básicos**: enteros, 1 bp = 0,01 %
 *
 * Fijado una sola vez, acá y en el `CHECK` de la migración. `50` y `0,5`
 * conviviendo para decir lo mismo son el mismo defecto que un total guardado:
 * dos representaciones de un número y ningún lugar donde diga cuál manda.
 * Son puntos básicos y no puntos porcentuales enteros por un caso que el
 * bufete tiene hoy: partir unos honorarios en tres da 33,33 / 33,33 / 33,34,
 * que en puntos básicos es 3333 / 3333 / 3334 y cierra exacto.
 *
 * ## `importe`: lo que esa cuota cobra, en centavos, **derivado**
 *
 * Con `monto`, es el monto. Con `porcentaje`, es el porcentaje aplicado al
 * **total de la cotización** de la que cuelga esa cuota. Lo calcula el
 * servidor con `importeDe` y nunca se guarda en ninguna columna.
 *
 * Es `null` en un solo caso: una cuota porcentual sin base. La base lo
 * impide con
 * `un_porcentaje_sin_cotizacion_no_tiene_de_que_ser_porcentaje`, así que una
 * fila así no se puede escribir por la API — pero un script de importación
 * sí la podría meter, y entonces lo que la pantalla tiene que mostrar es «no
 * se puede saber» y no un cero que se lee como «no cobra nada». Las dos
 * guardas no se anulan porque **no resuelven lo mismo**: una decide qué filas
 * existen, la otra qué se lee de una que existe igual.
 *
 * ## `venceEn` es un día de Panamá, `hito` es una frase, y exactamente uno
 *
 * `venceEn` llega en `AAAA-MM-DD` y en el calendario de Panamá —se guarda
 * como el fin de ese día en UTC y se lee de vuelta con la conversión
 * inversa—; `hito` es texto libre y corto, lo que dispara el cobro: «a la
 * firma», «contra presentación de la demanda».
 */
export interface Cuota {
  id: string;
  concepto: string;
  /** Centavos enteros y siempre positivos. Nulo si la cuota es porcentual. */
  monto: number | null;
  /** Puntos básicos, de 1 a 10000. Nulo si la cuota lleva monto. */
  porcentaje: number | null;
  /** El día en que vence, `AAAA-MM-DD` en Panamá. Nulo si va contra hito. */
  venceEn: string | null;
  /** Qué dispara el cobro. Nulo si la cuota vence en una fecha. */
  hito: string | null;
  /** Centavos enteros. Derivado, nunca almacenado. Ver arriba. */
  importe: number | null;
  /** Cuándo se escribió la fila. El cronograma se lee en este orden. */
  creadaEn: string;
}

/**
 * El plan entero: sus cuotas y lo que suman.
 *
 * Los dos viajan juntos y en la misma respuesta, no en dos rutas, por lo
 * mismo que la cuenta de gastos: son el mismo hecho mirado de dos maneras.
 * El total **es** la suma de esas cuotas y de ningunas otras, y pedirlos por
 * separado abriría la ventana en la que la pantalla muestra un cronograma y
 * un total que no le corresponde.
 *
 * ## `total` es derivado, y esa palabra tiene un significado exacto acá
 *
 * No hay columna `total` en `cuota`, ni en `cotizacion`, ni en `proceso`, ni
 * en ninguna tabla de esta base. `test/cuotas-api.spec.ts` recorre el esquema
 * vivo y falla si aparece una. Es I-7 con la tercera piel y el mismo
 * argumento de las dos anteriores: un total almacenado es un total que algún
 * día no coincide con sus filas, y nadie sabe cuál de los dos números es el
 * verdadero.
 *
 * ## `base` viaja, y por qué hace falta que viaje
 *
 * Es el total de la cotización contra el que se aplicaron los porcentajes, o
 * `null` cuando el plan es de un proceso y no hay ninguno. Sin él, un plan de
 * «50 % y 50 %» mostraría dos importes que la persona no puede auditar: no
 * tendría contra qué comprobar que la mitad es la mitad. Es el mismo motivo
 * por el que `SaldoDeGastos` manda `anticipos` y `gastos` además del saldo.
 *
 * ## Y lo que `total` **no** es
 *
 * No es lo que el cliente va a pagar: el ITBMS es T-12 y no hay una sola
 * línea de aritmética de impuestos en este sistema todavía. Tampoco es una
 * cuenta por cobrar: que una cuota esté en el plan no dice que se haya
 * cobrado, y registrar el cobro está fuera de la tajada (`docs/diseno.md`
 * §2).
 */
export interface PlanDePagos {
  /** De la más vieja a la más nueva: un cronograma se lee hacia adelante. */
  cuotas: Cuota[];
  /**
   * `Σ` de los importes, en centavos enteros. Derivado, nunca almacenado.
   *
   * Las cuotas cuyo importe no se puede saber no suman: ver `Cuota.importe`.
   */
  total: number;
  /**
   * El total de la cotización contra el que se aplican los porcentajes, en
   * centavos. `null` cuando el plan es de un proceso, que no tiene base.
   */
  base: number | null;
}

/**
 * Lo que el alta de una cuota acepta.
 *
 * **No hay total y no puede haberlo**, igual que `DatosDeMovimiento` no tiene
 * saldo. Y no hay `procesoId` ni `cotizacionId`: de qué cuelga la cuota lo
 * dice la dirección, no el cuerpo, así que la exclusividad de la decisión (c)
 * no es algo que el cliente pueda violar.
 */
export interface DatosDeCuota {
  concepto: string;
  /** Centavos enteros positivos, o `null` si la cuota es porcentual. */
  monto: number | null;
  /** Puntos básicos de 1 a 10000, o `null` si la cuota lleva monto. */
  porcentaje: number | null;
  /** `AAAA-MM-DD`, o `null` si la cuota va contra hito. */
  venceEn: string | null;
  /** Qué dispara el cobro, o `null` si la cuota vence en una fecha. */
  hito: string | null;
}

/* ==========================================================================
   Bitácora (T-10)

   Quién hizo qué, sobre qué, y cuándo. Es el otro registro del sistema, y
   no se confunde con una nota: **una nota es intención y la escribe una
   persona; una entrada de bitácora es un hecho del sistema y la escribe el
   sistema** (`docs/diseno.md` §3 y §6).

   La granularidad la decidió el usuario: **eventos, no cambios campo por
   campo**. Una entrada dice «el 3 de marzo Itzel movió este proceso a
   Demanda presentada». No hay valor anterior ni valor posterior, y eso no
   es una versión recortada de otra cosa: es lo que contesta el 95 % de los
   «¿quién hizo esto?» sin pagar hoy por el resto.

   Tres cosas que esta sección hace visibles en el cable:

    - **El vocabulario es cerrado por los dos lados.** Las uniones de abajo
      cierran lo que el código puede emitir; el `CHECK` de
      `migrations/0002_bitacora_inmutable.sql` cierra lo que la base acepta,
      que es lo único que sobrevive a un script de importación (§5). Las dos
      mitades tienen una prueba que falla si se separan.
    - **Un hecho, una entidad.** Un proceso que nace para un cliente es un
      hecho del proceso. Duplicarlo bajo el cliente haría que el mismo 3 de
      marzo apareciera dos veces.
    - **No hay relleno retroactivo.** Lo que pasó antes de T-10 no está en
      la bitácora, y la pantalla lo dice en vez de disimularlo con una lista
      vacía que se lee como «acá no pasó nada».
   ========================================================================== */

/** Sobre qué se registra un hecho. Es el `entidad` de la tabla. */
export type EntidadRegistrada =
  | "cliente"
  | "area"
  | "tipo_cliente"
  | "tipo_proceso"
  /**
   * El proceso concentra también los hechos de sus notas y sus pendientes.
   * No tienen entidad propia porque no tienen pantalla propia: una nota se
   * lee dentro de la línea de tiempo de su proceso, y un pendiente dentro
   * de su lista. Darles entidad sería partir en tres la respuesta a «¿qué
   * pasó con este proceso?».
   */
  | "proceso"
  /**
   * La cotización (tajada 2, T-2). Entidad propia y no un hecho del cliente,
   * por la regla de «un hecho, una entidad» aplicada al revés que en las
   * notas: una cotización **sí** tiene pantalla propia y se lee sola, así que
   * su historia es suya. Colgarla del cliente haría que la ficha de un
   * cliente con treinta cotizaciones contestara «¿quién tocó esta ficha?» con
   * trescientos hechos que no son de la ficha.
   *
   * Sus módulos y sus líneas no tienen entidad propia, por lo mismo que las
   * notas respecto del proceso: se leen dentro de ella.
   */
  | "cotizacion"
  /**
   * Un renglón del arancel de honorarios (T-2 de
   * `odd/tasks/arancel-de-honorarios.md`).
   *
   * Entidad propia, y la regla que lo decide es la de siempre —«un hecho, una
   * entidad», resuelta por si la cosa **se lee sola**—. Un renglón del
   * arancel se lee solo: tiene su fila en la tabla que es la pantalla entera
   * del arancel, y la pregunta «¿quién le puso este precio a esto, y cuándo?»
   * es exactamente la que el bufete va a hacer el día que un precio no cuadre
   * con lo que recuerda. Colgarla de `tipo_proceso` sería mentir —el precio
   * no está en esa tabla— y de `cotizacion` también: el arancel es anterior a
   * cualquier cotización y no cuelga de ninguna.
   *
   * El único verbo que admite es `editado`, y es a propósito: lo editable de
   * un renglón es **el monto del bufete**. Los siete campos citados del
   * Acuerdo los congela un disparador
   * (`migrations/0012_arancel_de_honorarios.sql`), y `activo` no tiene hoy
   * ninguna ruta que lo escriba, así que `dado_de_baja` y `reactivado` no
   * entran: un verbo sin sitio que lo emita es una entrada del vocabulario
   * que no significa nada.
   */
  | "arancel_renglon";

/**
 * Qué pasó. El vocabulario cerrado de `accion`.
 *
 * Son verbos y no pares entidad+verbo (`cliente_creado`, `area_creada`, …)
 * porque la entidad ya viaja en su columna: juntarlos multiplicaría el
 * vocabulario por cinco y dejaría el `CHECK` y el `Record` de frases con
 * cuarenta entradas que dicen cinco cosas.
 *
 * Qué acción admite cada entidad lo cierra `ACCIONES_POR_ENTIDAD` en
 * `worker/bitacora/vocabulario.ts`: `cliente` con `etapa_alcanzada` no
 * compila.
 */
export type AccionDeBitacora =
  /** Nació la fila. `detalle` lleva su nombre o su título. */
  | "creado"
  /** Cambió la ficha. Qué cambió no se guarda: es un evento, no un diff. */
  | "editado"
  /**
   * `activo` pasó a 0. Es acción propia y no `editado` porque dejar de
   * ofrecer un área es un hecho del bufete, y esconderlo adentro de «editó»
   * lo vuelve invisible justo cuando alguien pregunta por qué desapareció
   * de un desplegable.
   */
  | "dado_de_baja"
  /** `activo` volvió a 1. La contraparte, por simetría. */
  | "reactivado"
  /** La fila se fue. La entrada se queda: para eso existe. */
  | "borrado"
  /** Se guardaron las etapas de la plantilla de un tipo de proceso. */
  | "plantilla_editada"
  /** Se guardó el plan de trabajo de un proceso. */
  | "plan_editado"
  /** Se marcó alcanzada la próxima etapa. `detalle` dice cuál. */
  | "etapa_alcanzada"
  /**
   * El trámite terminó (T-14). `detalle` lleva el título del proceso.
   *
   * Va pelado y no como `proceso_cerrado` por la misma regla que `creado`:
   * la entidad ya viaja en su columna, y solo llevan prefijo los hechos de
   * algo que *cuelga* del proceso —`plan_editado`, `pendiente_cerrado`—.
   * Si el nacimiento de un proceso es `creado`, su cierre es `cerrado`.
   */
  | "cerrado"
  /**
   * Volvió a estar en curso. La contraparte, por simetría.
   *
   * Es un hecho propio y no un `editado`: reabrir borra `cerrado_en` de la
   * fila, y esta entrada es lo único que conserva que aquel cierre existió
   * y cuándo. Esconderlo dentro de «editó» perdería el dato entero.
   */
  | "reabierto"
  /** El plan de un proceso se copió a una plantilla (T-11). */
  | "plantilla_guardada"
  /** Alguien anotó un hecho. `detalle` dice en qué etapa quedó anclado. */
  | "nota_agregada"
  /** Apareció un cabo suelto. */
  | "pendiente_abierto"
  /** Se cerró. Quién y cuándo ya viven en la fila; esto lo pone en la historia. */
  | "pendiente_cerrado"
  /**
   * Entró un módulo de prosa en una cotización (T-2 C). `detalle` lleva el
   * rótulo de su tipo.
   *
   * Los cuatro verbos de módulo van **con prefijo**, al revés que `creado` y
   * `cerrado`, por la regla que este vocabulario ya tenía escrita: pelados
   * van los hechos propios de la entidad, prefijados los de algo que *cuelga*
   * de ella. Un módulo cuelga de su cotización igual que una nota cuelga de
   * su proceso, y por eso `nota_agregada` es el precedente exacto.
   *
   * Son cuatro y no uno porque las cuatro preguntas son distintas: «¿quién
   * metió esta cláusula?», «¿quién la cambió?», «¿quién la sacó?» y «¿quién
   * movió el alcance al final?». Un solo `modulos_editados` las contestaría
   * las cuatro con la misma línea, que es exactamente lo que el vocabulario
   * cerrado existe para impedir.
   */
  | "modulo_agregado"
  /** Cambió el tipo o el texto de un módulo. `detalle` lleva su rótulo. */
  | "modulo_editado"
  /**
   * Un módulo salió de la cotización. `detalle` lleva su rótulo.
   *
   * Es `modulo_quitado` y no `modulo_borrado` aunque la fila sí se borre: el
   * `borrado` pelado es el de una entidad que tenía existencia propia y
   * pantalla propia, y un módulo nunca la tuvo. Lo que la persona hizo fue
   * sacarlo de una lista, y es lo que la bitácora tiene que decir.
   */
  | "modulo_quitado"
  /**
   * Cambió el orden de los módulos. Va **sin `detalle`**, igual que
   * `plan_editado`: lo que se movió es la lista entera, y nombrar uno solo de
   * los módulos diría menos que no nombrar ninguno.
   *
   * Va en plural porque reordenar es un hecho de la colección y no de cada
   * fila que cambió de número: una entrada por módulo movido llenaría la
   * historia de ruido para contar una sola decisión.
   */
  | "modulos_reordenados"
  /**
   * Entró una línea de honorario o de gasto estimado (T-3 A). `detalle` lleva
   * su concepto, recortado.
   *
   * Los cuatro verbos de línea van **con prefijo** por la misma regla que los
   * de módulo: pelados van los hechos propios de la entidad, prefijados los
   * de algo que *cuelga* de ella. Una línea cuelga de su cotización.
   *
   * **El `detalle` es el concepto y no el rótulo de la clase**, que es donde
   * se separan de los verbos de módulo. En un módulo lo que identifica la
   * fila de cara a una persona es su tipo —hay a lo sumo un «Alcance»—; en
   * una línea hay seis honorarios y lo único que los distingue es lo que
   * dice cada uno. Un «agregó la línea «Honorarios»» repetido seis veces no
   * contesta «¿quién metió esto?», que es para lo que existe la bitácora.
   *
   * **Y nunca el monto.** `detalle` es el nombre de cara al usuario de lo que
   * el hecho señala, no una segunda copia del dato: el monto vive en su
   * columna, y copiarlo acá sería guardar un diff disfrazado de pista en la
   * única tabla que no se puede corregir.
   */
  | "linea_agregada"
  /** Cambió la clase, el concepto, el monto o el trámite de una línea. */
  | "linea_editada"
  /**
   * Una línea salió de la cotización. `detalle` lleva su concepto.
   *
   * Es `linea_quitada` y no `linea_borrada` por lo mismo que
   * `modulo_quitado`: el `borrado` pelado es el de una entidad que tenía
   * existencia propia y pantalla propia, y una línea nunca la tuvo.
   */
  | "linea_quitada"
  /**
   * Cambió el orden de las líneas. Va **sin `detalle`**, igual que
   * `modulos_reordenados` y `plan_editado`: lo que se movió es la lista.
   */
  | "lineas_reordenadas"
  /**
   * La cotización se emitió y quedó congelada (T-4). `detalle` lleva su
   * código, igual que `creado` y `editado`.
   *
   * Va **pelado** y no `cotizacion_emitida`, por la regla de siempre: la
   * entidad ya viaja en su columna, y sólo llevan prefijo los hechos de algo
   * que *cuelga* de ella. Es el mismo caso que `cerrado` para el proceso.
   *
   * Es el verbo más caro del vocabulario y conviene decir por qué: es el
   * único hecho del sistema que **no tiene vuelta atrás**. A partir de él la
   * base deja de aceptar escrituras sobre la cotización y sobre sus módulos
   * y sus líneas (I-4 e I-5, `migrations/0006_emitir_y_congelar.sql`), así
   * que esta entrada es el borde entre un documento que se edita y uno que
   * sólo se duplica.
   */
  | "emitido"
  /* --- Los tres de T-5, que esta migración se lleva por adelantado ---
   *
   * `migrations/0006_emitir_y_congelar.sql` amplía el `CHECK` de `accion` una
   * sola vez para los cuatro verbos del ciclo de vida, en vez de reconstruir
   * `bitacora` otra vez dentro de dos commits. No son especulación: los tres
   * están escritos en el plan de la tajada y en el ciclo de vida de
   * `docs/diseno.md` §8. **Su lógica es de T-5**; lo que entra acá es el
   * vocabulario y su frase, que es lo que un verbo significa. */
  /** El cliente aceptó. `detalle` lleva el código de la cotización. */
  | "ganado"
  /** El cliente no aceptó, o la propuesta venció sin respuesta. */
  | "perdido"
  /**
   * Nació un borrador nuevo copiando esta cotización, atado por
   * `duplicada_de_id`. La historia no se reescribe: el hecho es de la
   * cotización que se copió.
   */
  | "duplicado"
  /* --- Los cinco del gasto real (tajada 2, T-10) ---
   *
   * Son hechos **del proceso**: un movimiento se lee dentro de la cuenta de
   * su proceso, igual que una nota dentro de su línea de tiempo, así que van
   * **con prefijo** por la regla de siempre —pelados los hechos propios de la
   * entidad, prefijados los de algo que cuelga de ella—.
   *
   * **El gasto y el anticipo llevan verbos distintos aunque compartan
   * tabla.** Lo que sale sin ramas de la misma tabla es la aritmética, no la
   * historia: un `movimiento_registrado` que a veces significa plata que sale
   * y a veces plata que entra convertiría «¿quién metió este anticipo?» en
   * una pregunta que hay que contestar leyendo el `detalle` y adivinando de
   * qué lado está. Es la misma decisión con la que las líneas no reusaron los
   * verbos de módulo, y acá pesa más: los dos mueven el saldo en direcciones
   * opuestas.
   *
   * `detalle` lleva el **concepto** del movimiento, recortado, y nunca el
   * monto: `detalle` es el nombre de cara al usuario de lo que el hecho
   * señala, no una segunda copia del dato. El monto vive en su columna, y
   * copiarlo acá sería guardar un diff disfrazado de pista en la única tabla
   * que no se puede corregir. */
  /** Se cargó un desembolso del bufete por cuenta del cliente. */
  | "gasto_registrado"
  /** Entró plata del cliente a cuenta de gastos futuros. */
  | "anticipo_registrado"
  /** Salió un desembolso de la cuenta del proceso. */
  | "gasto_quitado"
  /** Salió un ingreso de la cuenta del proceso. */
  | "anticipo_quitado"
  /**
   * Se subió el papel de un movimiento. `detalle` lleva su concepto.
   *
   * **Sirve también para el reemplazo, y no hay un verbo aparte**: desde
   * donde está la persona, volver a subir el papel es adjuntarlo, y la llave
   * del objeto es la misma —se deriva de la fila—, así que no hay un segundo
   * comprobante del que hablar. Lo que sí queda es una segunda entrada en la
   * historia, que es lo que contesta «¿cuándo cambió el papel?».
   *
   * **Y no hay verbo de comprobante quitado**: el comprobante no se saca
   * solo, se va con el movimiento, y ese hecho ya lo cuentan `gasto_quitado`
   * y `anticipo_quitado`.
   */
  | "comprobante_adjuntado"
  /* --- Los dos del plan de pagos (tajada 2, T-11) ---
   *
   * Son hechos **de la cotización o del proceso**, según de cuál cuelgue esa
   * cuota, y están atribuidos a las dos en `ACCIONES_POR_ENTIDAD`. Es la
   * primera consecuencia visible de la decisión (c) de
   * `migrations/0010_plan_de_pagos.sql`: hasta que esa decisión no estuvo
   * tomada, estos dos verbos no podían entrar al vocabulario porque no había
   * entidad a la que atribuirlos, y `0009` lo dejó escrito.
   *
   * No hay entidad `cuota` y no hace falta: una cuota no tiene pantalla ni
   * dirección propia, se lee dentro del plan de su dueño, y darle entidad
   * partiría en dos la respuesta a «¿qué pasó con esta cotización?». Es el
   * mismo argumento que dejó los cinco del gasto colgando del proceso.
   *
   * Que un verbo esté atribuido a dos entidades no es nuevo: `creado` y
   * `editado` lo están a cinco. Lo que el vocabulario cierra es qué le puede
   * pasar a cada entidad, no que cada verbo sea de una sola.
   *
   * Van **con prefijo** por la regla de siempre, y `detalle` lleva el
   * **concepto** de la cuota —nunca el monto ni el porcentaje—, por lo mismo
   * que las líneas y los movimientos: en un plan de cuatro renglones lo único
   * que los distingue es lo que dice cada uno, y el importe vive en su
   * columna.
   *
   * Son **dos y no tres**: editar una cuota no es de esta unidad. Se quita y
   * se vuelve a poner, que para un plan de tres renglones es la misma
   * operación con un clic más y sin ninguna regla nueva. La ausencia del
   * verbo es cómo se dice eso, igual que la ausencia de un `PUT` dijo que un
   * movimiento no se corrige. */
  /** Entró una cuota en el plan de pagos. `detalle` lleva su concepto. */
  | "cuota_agregada"
  /**
   * Salió del plan. Es `cuota_quitada` y no `cuota_borrada` por lo mismo que
   * `linea_quitada`: el `borrado` pelado es el de una entidad que tenía
   * existencia y pantalla propias, y una cuota nunca las tuvo.
   */
  | "cuota_quitada";

/**
 * Una entrada tal como la lee la pantalla.
 *
 * `usuarioNombre` se resuelve **en lectura**, igual que en todo lo demás: lo
 * que se guarda es la llave (§6, «Autoría»). Puede venir nulo si la fila de
 * `usuario` cruzara la frontera del tenant, y la pantalla lo dice en vez de
 * dejar un hueco.
 *
 * No hay `id` de la cosa tocada más allá de `entidadId`, y no hay enlace: la
 * entrada se lee **dentro** de la pantalla de su entidad, así que ya se sabe
 * de qué se está hablando.
 */
export interface EntradaDeBitacora {
  id: string;
  entidad: EntidadRegistrada;
  entidadId: string;
  accion: AccionDeBitacora;
  usuarioId: string;
  usuarioNombre: string | null;
  ocurridoEn: string;
  /** Corto y opcional: el nombre de lo que el hecho señala. Nunca un diff. */
  detalle: string | null;
}

/**
 * Cuántos hechos trae una página de bitácora cuando nadie pide otra cosa.
 *
 * Veinte es una pantalla. La bitácora contesta «¿qué pasó últimamente?» y esa
 * pregunta se agota en los últimos hechos: en una sucesión de tres años, lo
 * de la semana pasada importa y lo de la primera semana es arqueología. Un
 * número más alto no contestaría mejor la pregunta; haría más larga la
 * pantalla. Y el sitio más apretado donde esto se dibuja —la historia
 * desplegada dentro de una fila de la tabla de catálogos— no aguanta mucho
 * más sin tapar la tabla que la contiene.
 */
export const LIMITE_DE_BITACORA_POR_DEFECTO = 20;

/**
 * Lo más que el servidor sirve de una, pida lo que pida la dirección.
 *
 * Existe para que `?limite=100000` no sea una consulta sin fondo: el límite
 * que llega por la URL lo escribe cualquiera, y una ruta que lo obedece sin
 * mirar es una forma de pedirle a D1 que serialice la tabla entera.
 *
 * Quinientos y no cien: el conjunto más grande que este sistema puede
 * producir de una sola entidad es del orden de unos cientos de hechos —una
 * sucesión larga medida en el proyecto da ~400—, y el techo tiene que quedar
 * **por encima** de eso para que «ver más antiguos» pueda llegar hasta el
 * final. Un techo que corta antes convierte el control en una promesa que no
 * se puede cumplir. A ~214 bytes por fila, 500 son unos 107 kB: una
 * respuesta grande, no una desmedida, y solo la pide quien insistió con el
 * botón hasta el fondo.
 */
export const TECHO_DEL_LIMITE_DE_BITACORA = 500;

/**
 * La bitácora de una entidad, **del hecho más nuevo al más viejo**.
 *
 * Al revés que la línea de tiempo de T-8, y la diferencia no es de gusto: la
 * línea de tiempo son **notas**, que son una narración y se leen hacia
 * adelante. La bitácora es **auditoría**, y sus preguntas —«¿qué pasó
 * últimamente?», «¿quién tocó esto?», «¿cuándo se cerró?»— se contestan
 * empezando por lo último. T-17 corrigió el orden al notar que las dos
 * cosas se habían dibujado iguales siendo distintas.
 *
 * El índice `(entidad, entidad_id, ocurrido_en)` sirve el recorrido
 * invertido sin ordenar nada —`EXPLAIN QUERY PLAN` no muestra b-tree
 * temporal, y `test/bitacora-api.spec.ts` lo comprueba—, así que el esquema
 * no cambió.
 *
 * `entradas` es **una página**: a lo sumo el `limite` pedido, siempre los
 * más recientes. `total` es cuántos hechos tiene la entidad, y por eso no se
 * puede deducir de `entradas.length`: sin él, la pantalla no puede decir
 * cuántos está escondiendo y «ver más» sería un botón que no informa.
 */
export interface RespuestaDeBitacora {
  entradas: EntradaDeBitacora[];
  /** Cuántos hechos hay en total, no cuántos trae esta página. */
  total: number;
}

/* ===========================================================================
   El arancel de honorarios (T-2 de `odd/tasks/arancel-de-honorarios.md`)
   ===========================================================================

   La tabla del **Acuerdo No 49 de 24 de abril de 2001** —Tarifa de Honorarios
   Profesionales Mínimos de los Abogados en la República de Panamá, aprobada
   por la Sala Cuarta de Negocios Generales de la Corte Suprema— sembrada
   entera y con una sola columna editable: la del bufete.

   Las dos cosas que el nombre de cada campo tiene que dejar claras, porque de
   eso depende que una pantalla no las confunda:

    - `montoOficial` y `reglaOficial` son **una cita**. Se leen, no se
      escriben. Lo sostiene un disparador en la base y una negativa explícita
      en la API, y las dos tienen prueba.
    - `monto` es **lo que el bufete cobra**, y es el único que la pantalla de
      precios muestra. Nulo significa «todavía no decidieron», que no es lo
      mismo que cero —«esto no lo cobramos»—: con nulo, T-3 muestra la
      sugerencia del acuerdo como valor de arranque.
   ========================================================================== */

/**
 * Qué clase de renglón imprimió el acuerdo. Son tres y están medidas:
 * **282** con monto fijo, **97** con regla en texto y **74** rubros.
 *
 * El `rubro` es el que sorprende y el que T-2 tiene que conocer: un numeral
 * que el documento imprime **sin ningún valor** porque es el encabezado de
 * sus hijos —«3. Inmigrantes», «12. Recursos Administrativos»—. No lleva
 * precio editable, ni oficial ni del bufete, y ofrecerle un campo de monto a
 * un título es ofrecerle escribir un dato que no significa nada.
 */
export type ClaseDeRenglonDelArancel = "monto" | "regla" | "rubro";

/**
 * Un renglón del arancel tal como lo ve el navegador.
 *
 * `orden` es **la posición en el documento**, y es la clave real de un
 * renglón: el acuerdo repite numerales —44 renglones en 15 grupos comparten
 * numeral con otro de su misma categoría, ver la lectura 13 de
 * `scripts/arancel/lecturas.md`— así que `numeral` identifica tan poco como
 * un título de capítulo.
 *
 * Los dos montos van en **centavos enteros**, jamás coma flotante.
 */
export interface RenglonDelArancel {
  id: string;
  orden: number;
  categoria: string;
  /** Tal como está impreso. Se repite, y por eso no es clave de nada. */
  numeral: string;
  concepto: string;
  clase: ClaseDeRenglonDelArancel;
  /** La cita: centavos enteros, o nulo donde el acuerdo no imprimió precio. */
  montoOficial: number | null;
  /** La cita, cuando la tarifa es un porcentaje por tramos y no un número. */
  reglaOficial: string | null;
  /** Lo que el bufete cobra. Nulo es «todavía no decidieron», no cero. */
  monto: number | null;
  activo: boolean;
}

/**
 * Una nota del acuerdo: un parágrafo, una nota al pie, una aclaración.
 *
 * Pertenece a la **categoría** y no a un renglón, y eso es lo que la hace una
 * fila aparte: «PARÁGRAFO: En todo trámite se cargarán B/.200.00 por cada
 * dependiente» cambia el precio de las 24 filas de migración, no de una.
 *
 * Son también lo único que queda de las **dos secciones que el acuerdo
 * imprime solo como prosa** —«OTROS ASUNTOS» y «PROCESO DE SEPARACIONES DE
 * BIENES…»—, que no tienen ni un renglón tarifado.
 */
export interface NotaDelArancel {
  id: string;
  /** Su posición entre las notas del documento. */
  orden: number;
  categoria: string;
  texto: string;
}

/**
 * Una categoría del acuerdo con lo que lleva adentro.
 *
 * Se agrupa **en el servidor** y no en la pantalla por una razón concreta: el
 * orden de las categorías sale del orden del documento, y dos pantallas que
 * lo reconstruyan por su cuenta son dos pantallas que algún día lo
 * reconstruyen distinto. `renglones` puede venir **vacío**, y no es un error:
 * así se ven las dos secciones de pura prosa.
 */
export interface CategoriaDelArancel {
  nombre: string;
  renglones: RenglonDelArancel[];
  notas: NotaDelArancel[];
}

/** `GET /api/arancel`: la tabla entera, en el orden del documento. */
export interface RespuestaDelArancel {
  categorias: CategoriaDelArancel[];
}

/** `PUT /api/arancel/{id}`: el renglón releído después de guardar. */
export interface RespuestaDeRenglonDelArancel {
  renglon: RenglonDelArancel;
}

/**
 * El 409 de intentar escribir una cita.
 *
 * Es un **409 y no un 422** por la distinción que esta API ya usa: 422 dice
 * «entendí el cuerpo y los datos no me sirven»; esto es «el cuerpo está
 * perfecto y lo que no admite la escritura es el estado de la fila» — y el
 * estado, acá, es que esos campos son la transcripción de un documento
 * publicado. Es la misma familia que `cotizacion_no_es_borrador`: lo que
 * salió del borrador no se edita porque es el registro de lo que se mandó.
 *
 * `campos` viaja para que la pantalla pueda nombrar cuál fue. Son los nombres
 * del **cable**, no los de las columnas: quien lee este error está mirando el
 * cuerpo que mandó.
 */
export interface RenglonCitado {
  error: "renglon_citado";
  campos: string[];
}

/**
 * El 409 de ponerle precio a un encabezado.
 *
 * También 409 y no 422 por lo mismo: el monto puede ser un importe
 * impecable; lo que no admite precio es **la fila**, porque es uno de los 74
 * rubros que el acuerdo imprime sin valor.
 */
export interface RubroSinPrecio {
  error: "rubro_sin_precio";
}
