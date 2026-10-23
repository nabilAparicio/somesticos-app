/**
 * Shapes exchanged over the HTTP API. Type-only, so it is safe to compile this
 * file both in the Worker project and in the browser project.
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
  | "plan_vacio";

export interface FallaDeValidacion {
  campo: string;
  motivo: MotivoDeFalla;
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

export interface BorradoBloqueado {
  error: "tiene_dependientes";
  entidad: "area" | "tipo_proceso" | "tipo_cliente";
  dependencias: Dependencia[];
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
