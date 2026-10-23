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
  /** Todo proceso está ligado a un cliente. Es I-2 (`docs/diseno.md` §5). */
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
  | "etapa_con_pendientes_no_se_quita";

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
 * `cotizacion` existe en el `CHECK` de la tabla pero **no está implementado**
 * en esta tajada: apuntaría a `cotizacion_linea`, que es de la tajada 2. Todo
 * lo que se crea hoy nace `directo`.
 */
export type OrigenDeProceso = "cotizacion" | "directo";

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
  | "proceso";

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
  | "pendiente_cerrado";

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
