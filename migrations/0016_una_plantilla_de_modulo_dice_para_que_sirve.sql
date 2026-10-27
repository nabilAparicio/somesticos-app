-- Una plantilla de módulo dice para qué sirve, y la IA lo lee
-- (T-1 de `odd/tasks/plantillas-de-modulo.md`).
--
-- `0001` a `0015` ya corrieron y **no se tocan**.
--
-- ## El problema que esta tabla cierra, y no es el que parece
--
-- Los seis tipos de módulo de prosa están escritos en el código desde `0004`,
-- y **el rótulo es todo lo que el sistema sabe de ellos**
-- (`worker/cotizaciones/modulos.ts`, `CATALOGO_DE_MODULOS`). Eso tiene dos
-- consecuencias y la segunda es la que duele:
--
--   1. El abogado no puede renombrar un módulo. Agregar un tipo es un
--      despliegue.
--   2. **La IA tampoco sabe para qué sirve cada módulo.**
--      `worker/ia/prompt.ts:238` le pasa al modelo la lista
--      `alcance · Alcance`, `supuestos · Supuestos`, y nada más. El modelo
--      deduce el propósito del nombre. Que a veces acierta.
--
-- La segunda es la razón de ser de esta migración. La primera es la que la
-- hace posible: un campo de descripción tiene que vivir en algún lado, y ese
-- lado es una fila.
--
-- ## Esto revierte una decisión de `docs/diseno.md`, con la medición a la vista
--
-- `docs/diseno.md:379` dice que «el catálogo de tipos de módulo vive **como
-- registro tipado en código**, no como configuración editable en pantalla», y
-- `:258` lo justifica así: detrás de un tipo de módulo *«hay código — un
-- renderizador y un esquema»*, a diferencia del tipo de cliente, que es sólo
-- una etiqueta y por eso sí vive en tabla.
--
-- **Ese argumento no se cumple.** Medido, archivo por archivo:
--
--   | Hecho                                                              | Dónde                        |
--   |--------------------------------------------------------------------|------------------------------|
--   | La hoja dibuja los seis idénticos: `<h2>{rotulo}</h2><p>{…}</p>`   | `HojaDeCotizacion.tsx:239`   |
--   | El prompt recorre el catálogo; no sabe qué es «alcance»             | `worker/ia/prompt.ts:238`    |
--   | El editor dibuja un `<select>` del catálogo, sin rama por tipo       | `EditorDeModulos.tsx:108`    |
--   | El validador sólo verifica pertenencia                               | `cotizaciones/modulos.ts:201`|
--   | **Ninguno** de los seis disparadores de `cotizacion_modulo` nombra `tipo` | `0004:419,548,562` · `0006:439,448,456` |
--
-- No hay renderizador por tipo ni esquema por tipo: los seis difieren
-- **únicamente en el rótulo**, que es la definición exacta de «etiqueta» con
-- la que `docs/diseno.md:258` mandó al tipo de cliente a una tabla de
-- catálogo. Así que esto no contradice el documento: le aplica su propio
-- criterio al caso que había clasificado mal. §8 y §6 se corrigen en T-2 del
-- documento de la tajada, que es donde está la pantalla que los desmiente.
--
-- ## Lo que esta migración NO trae, y es deliberado
--
--   * **Ningún cambio en `cotizacion_modulo`.** La columna `tipo` sigue
--     siendo texto cerrado por el `CHECK` de `0004:218`, y la unión
--     `TipoDeModulo` de `worker/contract.ts:1540` sobrevive la tajada 1
--     entera. Lo único que se muda a la base es el **rótulo y la
--     descripción**. `tipo` pasa a ser una referencia en la tajada 2, con su
--     reconstrucción de tabla, su backfill y sus seis disparadores
--     re-creados; el día que se pierda la red del compilador conviene que sea
--     el único cambio del día.
--   * **Ninguna ruta.** T-2 abre la lectura y la edición. Acá está la tabla y
--     están las guardas, que es lo que tiene que existir antes de que haya
--     una ruta que las necesite.
--   * **Ningún verbo nuevo en la bitácora.** `editado`, `dado_de_baja` y
--     `reactivado` ya están en el `CHECK` de `accion` desde `0002`. Se agrega
--     la entidad, no el vocabulario.
--
-- ## Y SÍ trae las seis filas, al revés que `0012`
--
-- El arancel se siembra con un script (`scripts/arancel/sembrar.mjs`) y acá
-- las seis filas van dentro de la migración. No es inconsistencia: son dos
-- casos distintos y la diferencia es medible. Allá son **453 renglones
-- extraídos de un PDF**, o 140 kB de datos dentro del esquema, sin forma de
-- volver a correrlos cuando la extracción mejore. Acá son **seis filas
-- escritas a mano**, y el backfill de la tajada 2 las necesita presentes para
-- que sea un `JOIN` y no una adivinanza: una migración que dependa de que
-- alguien se haya acordado de correr un script es una migración que falla en
-- la base de otro.

-- ===========================================================================
-- M-1 · La bitácora, reconstruida para la entidad de la plantilla
-- ===========================================================================
--
-- **La séptima reconstrucción de esta tabla**, por el motivo de siempre:
-- SQLite no tiene `ALTER TABLE … ADD CONSTRAINT`, así que ampliar un `CHECK`
-- cuesta tabla nueva, copia, borrado y renombre, y el `DROP TABLE` se lleva
-- el índice y los tres disparadores que cuelgan de ella. Las seis anteriores:
-- `0002:205`, `0005:139`, `0006:121`, `0009:158`, `0010:294`, `0012:148`.
--
-- ## Por qué hace falta, dicho sin vueltas
--
-- `worker/db/base.ts` es el único camino de escritura del sistema, y su
-- `mutar(evento, …sentencias)` **exige el hecho como primer parámetro**: una
-- mutación nueva sin su entrada de bitácora no compila. Editar el rótulo o la
-- descripción de una plantilla es una escritura, así que necesita un hecho, y
-- un hecho necesita una entidad del vocabulario. No había ninguna a la que
-- atribuirlo sin mentir:
--
--   * `cotizacion` no: la plantilla es anterior a cualquier cotización y no
--     cuelga de ninguna. Atribuirle el hecho haría que renombrar un módulo
--     apareciera en la historia de las 54 cotizaciones que lo usan.
--   * `tipo_proceso` tampoco: la plantilla no está en esa tabla y la pregunta
--     que contesta la bitácora de un tipo de proceso no es ésta.
--
-- ## Por qué `modulo_plantilla` es entidad propia
--
-- La regla del vocabulario es «un hecho, una entidad», y lo que decide es si
-- la cosa **se lee sola**: una nota se lee dentro de la línea de tiempo de su
-- proceso y por eso no tiene entidad; una cotización se lee sola y por eso sí
-- la tiene. Una plantilla de módulo se lee sola —tiene su fila en la tabla
-- que es la pantalla de T-2, y la pregunta «¿quién le cambió la descripción
-- que la IA está leyendo, y cuándo?» es exactamente la que el bufete va a
-- hacer el día que el modelo empiece a escribir los alcances distinto—.
--
-- ## Los verbos: tres, y la ausencia del cuarto es la decisión
--
-- `editado`, `dado_de_baja` y `reactivado`. Los tres ya están en el `CHECK`
-- de `accion` (`0012:132`), así que la columna no se toca.
--
-- **`creado` no entra**, y no es olvido: no hay ruta que lo escriba hasta la
-- tajada 2 —crear plantillas nuevas está fuera del alcance autorizado de esta
-- tajada, y las seis que existen las escribe esta migración, que no pasa por
-- `mutar`—. Es la misma regla que `0010` aplicó al no darle verbo a la
-- edición de una cuota y que `0012` aplicó a `dado_de_baja` del arancel: la
-- ausencia del verbo es cómo este vocabulario dice que la operación no es de
-- esta unidad. El día que exista la ruta, el verbo entra con ella.
--
-- A diferencia del arancel, `dado_de_baja` y `reactivado` **sí** entran acá,
-- y la diferencia es que la ruta existe: el alcance autorizado de la tajada 1
-- incluye «la baja y la reactivación» con todas las letras, así que el verbo
-- tiene sitio que lo emita.
--
-- ## El costo, pagado a la vista por séptima vez
--
-- | Objeto                                    | Lo escribió |
-- |-------------------------------------------|-------------|
-- | `bitacora_entidad` (índice)               | `0002`      |
-- | `bitacora_no_se_actualiza`                | `0002`      |
-- | `bitacora_no_se_borra`                    | `0002`      |
-- | `bitacora_tenencia_coherente_al_insertar` | `0003`      |
--
-- Se copian **letra por letra** desde sus declaraciones originales. La prueba
-- que lo vigila —«los disparadores de la bitácora son los mismos que
-- escribieron 0002 y 0003», en `test/bitacora-api.spec.ts`— lee `0002` y
-- `0003` de `TEST_MIGRATIONS` y los compara normalizados contra
-- `sqlite_master`, así que una reconstrucción que ablande un `RAISE`, cambie
-- un `WHEN` o escriba `<>` donde iba `IS NOT` se pone roja venga de donde
-- venga.

CREATE TABLE bitacora_nueva (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenant (id),
  entidad     TEXT NOT NULL CHECK (entidad IN ('arancel_renglon', 'area', 'cliente', 'cotizacion', 'modulo_plantilla', 'proceso', 'tipo_cliente', 'tipo_proceso')),
  entidad_id  TEXT NOT NULL,
  accion      TEXT NOT NULL CHECK (accion IN ('anticipo_quitado', 'anticipo_registrado', 'borrado', 'cerrado', 'comprobante_adjuntado', 'creado', 'cuota_agregada', 'cuota_quitada', 'dado_de_baja', 'duplicado', 'editado', 'emitido', 'etapa_alcanzada', 'ganado', 'gasto_quitado', 'gasto_registrado', 'linea_agregada', 'linea_editada', 'linea_quitada', 'lineas_reordenadas', 'modulo_agregado', 'modulo_editado', 'modulo_quitado', 'modulos_reordenados', 'nota_agregada', 'pendiente_abierto', 'pendiente_cerrado', 'perdido', 'plan_editado', 'plantilla_editada', 'plantilla_guardada', 'reabierto', 'reactivado')),
  usuario_id  TEXT NOT NULL REFERENCES usuario (id),
  ocurrido_en TEXT NOT NULL CHECK (ocurrido_en IS strftime('%Y-%m-%dT%H:%M:%fZ', ocurrido_en)),
  detalle     TEXT
);

-- Las filas se **copian** y no se descartan, por el mismo argumento de `0002`
-- que `0005`, `0006`, `0009`, `0010` y `0012` ya repitieron: un registro de
-- auditoría no empieza borrando evidencia, y como el vocabulario nuevo es un
-- superconjunto del viejo, ninguna fila existente puede violar el `CHECK`
-- ampliado.
INSERT INTO bitacora_nueva (id, tenant_id, entidad, entidad_id, accion, usuario_id, ocurrido_en, detalle)
SELECT id, tenant_id, entidad, entidad_id, accion, usuario_id, ocurrido_en, detalle FROM bitacora;

DROP TABLE bitacora;

ALTER TABLE bitacora_nueva RENAME TO bitacora;

-- ---------------------------------------------------------------------------
-- Lo que el `DROP TABLE` se llevó, recreado de donde vino
-- ---------------------------------------------------------------------------

-- Viene de `0002`, que lo heredó de T-2: es la consulta de las pantallas
-- —«¿qué pasó con esto?»— y reconstruir la tabla es justo el momento en que
-- un índice se pierde en silencio.
CREATE INDEX bitacora_entidad ON bitacora (entidad, entidad_id, ocurrido_en);

-- Los dos de inmutabilidad vienen de `0002`. Van **sin condición**, como
-- allá: «reescribir con el mismo valor» sigue siendo reescribir, y una
-- excepción ahí sería la grieta por la que mañana entra un
-- `SET detalle = detalle, usuario_id = …`.
CREATE TRIGGER bitacora_no_se_actualiza
BEFORE UPDATE ON bitacora
BEGIN
  SELECT RAISE(ABORT, 'bitacora inmutable: una entrada no se actualiza');
END;

CREATE TRIGGER bitacora_no_se_borra
BEFORE DELETE ON bitacora
BEGIN
  SELECT RAISE(ABORT, 'bitacora inmutable: una entrada no se borra');
END;

-- **Éste viene de `0003`**, y es el que paga el costo que el encabezado
-- explica: queda declarado acá aunque lo haya escrito aquel archivo. Se copia
-- letra por letra, `IS NOT` incluido —con `<>`, un padre inexistente se
-- escurre y el rechazo queda en manos de una llave foránea que un `PRAGMA`
-- apaga—, y `entidad_id` sigue sin compararse con nada por la razón que
-- `0003` escribe: es polimórfico, y pedirle tenencia obligaría a resolver la
-- entidad dentro del disparador.
CREATE TRIGGER bitacora_tenencia_coherente_al_insertar
BEFORE INSERT ON bitacora
WHEN NEW.tenant_id IS NOT NULL
 AND ((NEW.usuario_id IS NOT NULL
        AND (SELECT tenant_id FROM usuario WHERE id = NEW.usuario_id) IS NOT NEW.tenant_id))
BEGIN
  SELECT RAISE(ABORT, 'tenencia cruzada: bitacora debe compartir tenant_id con las filas que referencia');
END;

-- ===========================================================================
-- M-2 · `modulo_plantilla`
-- ===========================================================================
--
-- La misma asimetría que `arancel_renglon`, que es la que el usuario pidió
-- por su nombre —«igual que los precios, le damos como preset los módulos ya
-- configurados»—:
--
-- | Columna                                | Quién la escribe | Se puede editar                           |
-- |----------------------------------------|------------------|-------------------------------------------|
-- | `clave`                                | Esta migración   | **No.** El snapshot la congela.           |
-- | `rotulo_oficial`, `descripcion_oficial`| Esta migración   | **No.** Es el piso al que se vuelve.      |
-- | `rotulo`, `descripcion`                | El bufete        | Sí. Es lo que esta tajada construye.      |
-- | `orden`                                | El bufete        | Sí. T-2 reordena.                         |
-- | `activo`                               | El bufete        | Sí. Se da de baja; no se borra.           |
--
-- ## `rotulo` y `descripcion` son nullable, y el NULL significa algo
--
-- **NULL es «uso el preset»**, y es cómo se vuelve atrás: vaciar el campo en
-- la pantalla devuelve el original, que es el criterio de aceptación 2 de la
-- tajada. No hace falta una columna «¿editado?» ni guardar una copia: la
-- presencia del valor **es** la respuesta, igual que `arancel_renglon.monto`
-- frente a `monto_oficial`. Una columna booleana al lado sería un segundo
-- hecho sobre lo mismo, y los dos se desincronizan en el primer `UPDATE` que
-- se olvide de uno.
--
-- `COALESCE(rotulo, rotulo_oficial)` es el rótulo vigente, con la misma forma
-- que `0015` le dio al precio. Y **no es una comparación**: el `COALESCE`
-- elige cuál de los dos existe, nunca cuál es mejor. No hay un solo operador
-- de orden entre las dos columnas, y no puede haberlo.
--
-- ## `tenant_id`, igual que todas (I-8)
--
-- La tabla lleva `tenant_id` y **toda** consulta filtra por él, incluidas las
-- que buscan por llave primaria: un UUID ajeno sigue siendo un UUID. Que los
-- seis presets sean los mismos para los dos bufetes no cambia nada: lo que es
-- propio de cada uno son `rotulo` y `descripcion`, que son el motivo de la
-- tabla.
--
-- ## `UNIQUE (tenant_id, clave)`, y **sin** único en `orden`
--
-- La clave identifica la plantilla dentro del bufete: es lo que la IA copia
-- tal cual, lo que el snapshot congela y lo que `cotizacion_modulo.tipo`
-- guarda hoy como texto. Dos plantillas con la misma clave dejarían al
-- `JOIN` de la tajada 2 eligiendo una de las dos.
--
-- `orden` **no lleva índice único**, y es el mismo argumento que `0001:118`
-- le aplicó a `etapa_plantilla` palabra por palabra: *«`orden` no lleva
-- índice único: T-7 reordena etapas, y en SQLite un
-- `UPDATE … SET orden = orden + 1` viola un único transitoriamente fila por
-- fila»*. SQLite no difiere restricciones hasta el final de la sentencia, así
-- que el único haría imposible el reordenamiento que T-2 necesita. Es la
-- diferencia con `arancel_renglon`, que **sí** lo lleva (`0012:351`) por el
-- motivo que allá está escrito: el orden del Acuerdo no se reordena, y un
-- disparador prohíbe cambiarlo. Acá se reordena, así que no hay único y no
-- hay disparador sobre `orden`.
--
-- Lo que el único de `orden` habría dado —que no haya dos plantillas en la
-- misma posición— no se pierde del todo: no hay ninguna consulta que dependa
-- de que el orden sea único, porque la lista se ordena por `orden` y dos
-- empates se resuelven de forma estable en la lectura. Un empate es un
-- defecto cosmético; un reordenamiento imposible es una pantalla que no
-- funciona.
--
-- ## `activo`: una plantilla se retira, no se borra
--
-- `modulo_plantilla_no_se_borra` aborta todo `DELETE`, y la salida es
-- `activo = 0`. Y acá el argumento es más fuerte que en el arancel: una
-- plantilla borrada deja **huérfanos los módulos de las cotizaciones vivas**.
-- Hoy `cotizacion_modulo.tipo` es texto, así que el daño sería un desplegable
-- que no puede mostrar lo que la fila dice; después de la tajada 2, con la
-- referencia puesta, sería una llave foránea rota. Prohibirlo ahora es lo
-- que deja que la tajada 2 no tenga que arreglarlo.
CREATE TABLE modulo_plantilla (
  id                  TEXT PRIMARY KEY,
  tenant_id           TEXT NOT NULL REFERENCES tenant (id),

  -- El identificador estable. Es `TEXT` y no un entero porque es lo que la IA
  -- escribe en su respuesta y lo que `cotizacion_modulo.tipo` ya guarda: un
  -- entero obligaría a traducir en los dos sentidos y a que el modelo
  -- adivinara un número.
  clave               TEXT NOT NULL,

  -- El preset. Los dos son nullable porque la tajada 2 va a permitir crear
  -- plantillas propias, que no tienen preset debajo: lo que la base exige no
  -- es que exista el preset, sino que exista **el valor vigente**, y eso lo
  -- dicen los dos `CHECK` de más abajo.
  rotulo_oficial      TEXT,
  descripcion_oficial TEXT,

  -- Lo del bufete. NULL es «uso el preset».
  rotulo              TEXT,
  descripcion         TEXT,

  -- La posición sugerida en la cotización. `typeof` y no sólo la declaración,
  -- por la trampa que `0004` y `0012` ya dejaron medida: en SQLite `INTEGER`
  -- es una **afinidad**, no un tipo, y un 1.5 que no se puede convertir sin
  -- pérdida se guarda tal cual como real.
  orden               INTEGER NOT NULL
                        CONSTRAINT el_orden_de_la_plantilla_es_un_entero_positivo
                        CHECK (typeof(orden) = 'integer' AND orden >= 1),

  activo              INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),

  -- ## Los dos `CHECK` de vigencia, con la forma de `0015`
  --
  -- Van **separados** y no juntos en uno, por el argumento que `0012:315`
  -- dejó escrito para `un_rubro_no_lleva_precio`: son dos hechos distintos y
  -- el mensaje de rechazo tiene que distinguirlos. Con un solo `CHECK`,
  -- SQLite diría el mismo nombre para los dos y habría que adivinar cuál
  -- faltaba — y el que falta casi siempre va a ser la descripción, porque es
  -- la columna nueva.
  --
  -- Toda plantilla tiene rótulo vigente. Sin esto, una plantilla sin ningún
  -- rótulo se dibujaría con un `<h2>` vacío en la hoja de la cotización.
  CONSTRAINT la_plantilla_tiene_rotulo_vigente
  CHECK (COALESCE(rotulo, rotulo_oficial) IS NOT NULL),

  -- **Y toda plantilla tiene descripción vigente**, que no es opcional y ahí
  -- está la tajada entera: una plantilla sin descripción es una plantilla que
  -- la IA va a usar mal, que es exactamente el defecto que vinimos a
  -- arreglar. Que esté en la base y no en un `if` es `docs/diseno.md` §5: una
  -- regla que solo vive en el código es la que el primer script de
  -- importación se salta, y esta tabla **va a** recibir scripts — la siembra
  -- de más abajo es uno.
  CONSTRAINT la_plantilla_tiene_descripcion_vigente
  CHECK (COALESCE(descripcion, descripcion_oficial) IS NOT NULL)
);

-- La clave es lo único por lo que se busca una plantilla fuera de la pantalla
-- de catálogos: el `JOIN` de la tajada 2 y la validación de lo que la IA
-- devuelve preguntan por clave, no por identificador.
CREATE UNIQUE INDEX modulo_plantilla_clave_unica
  ON modulo_plantilla (tenant_id, clave);

-- La consulta de las dos pantallas: las plantillas activas del bufete en el
-- orden sugerido. Con sólo el único de arriba, ordenar por `orden` costaría un
-- `TEMP B-TREE` — con seis filas no se nota, y el índice está igual porque lo
-- que no se nota con seis se nota con el primero que agregue veinte.
CREATE INDEX modulo_plantilla_orden
  ON modulo_plantilla (tenant_id, activo, orden);

-- ===========================================================================
-- M-3 · Las cuatro guardas
-- ===========================================================================
--
-- Las cuatro van **separadas** y no juntas en una, por la misma decisión que
-- `0006` dejó escrita para `cotizacion` y `0012` repitió para el arancel: son
-- cuatro hechos distintos, y juntarlos haría que neutralizar uno dejara al
-- otro atrapando el caso, con lo que ninguna de las guardas quedaría
-- verificable.
--
-- ## `IS NOT` y nunca `<>`, y acá está load-bearing en tres columnas
--
-- `rotulo_oficial` y `descripcion_oficial` son nullable, y una plantilla
-- creada por el bufete en la tajada 2 va a tener las dos en nulo. Con `<>`,
-- un `UPDATE modulo_plantilla SET descripcion_oficial = NULL WHERE …` sobre
-- un preset daría una comparación NULL, el `WHEN` daría falso y **la
-- escritura pasaría**: el piso al que se vuelve desaparecería sin un solo
-- error, y «volver al preset» dejaría de significar nada. Y al revés, poner
-- un `rotulo_oficial` donde había nulo también pasaría, y una plantilla del
-- bufete se convertiría en un preset de la nada. Es el peor agujero que esta
-- tarea podía dejar y lo abre un solo carácter, igual que el de
-- `cotizacion.snapshot` en `0006` y el de `monto_oficial` en `0012`. Con
-- prueba de rechazo por cada columna nullable, en los dos sentidos
-- (`test/plantillas-esquema.spec.ts`).
--
-- `clave` es la tercera: es `NOT NULL`, así que `<>` se comportaría igual,
-- pero se escribe `IS NOT` por el mismo argumento de consistencia que `0003`
-- dejó escrito para sus catorce y `0004` para sus quince — la regla es una
-- sola, y escribirla de dos formas según la línea es peor que cualquiera de
-- las dos.
--
-- ## Ninguna lleva excepción por igualdad, y eso sí es una decisión
--
-- `IS NOT` ya deja pasar el `UPDATE` que reescribe el mismo valor, y eso hace
-- falta: la ruta de T-2 va a escribir con `SET rotulo = ?, descripcion = ?`
-- solamente, pero una siembra futura o una migración pueden pasar la fila
-- entera. Lo que no pasa es un valor **distinto**, que es el hecho que esto
-- prohíbe.

-- Se copia el mensaje de los catorce de `0003` letra por letra: una fila no
-- cambia de bufete, y el texto es el mismo para que una búsqueda por «columna
-- inmutable» los encuentre todos. Va **aparte** de la guarda del preset, y no
-- es olvido: son dos hechos distintos —«una fila no cambia de bufete» vale en
-- todas las tablas, y «el preset no se edita» es de ésta—.
CREATE TRIGGER modulo_plantilla_tenant_inmutable
BEFORE UPDATE ON modulo_plantilla
WHEN NEW.tenant_id IS NOT OLD.tenant_id
BEGIN
  SELECT RAISE(ABORT, 'columna inmutable: modulo_plantilla.tenant_id no se reasigna; una fila no cambia de bufete');
END;

-- **La clave es inmutable**, y va sola porque el motivo es suyo y no del
-- preset: la clave no es un dato de presentación sino el identificador que
-- viaja fuera de esta tabla. El snapshot la congela al emitir
-- —`worker/cotizaciones/snapshot.ts:118` lo dice con todas las letras:
-- «`tipo` es la clave … `rotulo` es el encabezado que la persona leyó»— y la
-- IA la copia tal cual en su respuesta. Cambiarla deja las cotizaciones
-- emitidas apuntando a una clave que ya no existe y al modelo escribiendo una
-- que el editor no ofrece, y el rechazo saldría del `CHECK` de `0004` en el
-- peor momento: al guardar un módulo.
--
-- Renombrar **sí** se puede, y es la tajada: lo que se renombra es el
-- `rotulo`, que es lo que la persona lee. Eso es justamente lo que la
-- separación clave/rótulo compra, y es lo que hace que renombrar una
-- plantilla mañana **no toque** ningún documento emitido.
CREATE TRIGGER modulo_plantilla_clave_inmutable
BEFORE UPDATE ON modulo_plantilla
WHEN NEW.clave IS NOT OLD.clave
BEGIN
  SELECT RAISE(ABORT, 'plantilla de módulo: la clave no se edita; es lo que el snapshot congela y lo que la IA copia');
END;

-- **La guarda del preset.** Las dos columnas que esta migración escribe como
-- valor de fábrica, y lo que queda afuera es exactamente lo que el bufete
-- decide: `rotulo`, `descripcion`, `orden` y `activo`.
--
-- El motivo es de una línea: **el preset es el piso al que se vuelve**. Si se
-- puede editar, «volver al preset» no significa nada, porque el preset sería
-- lo último que alguien escribió. El criterio de aceptación 2 de la tajada
-- pide que vaciar el campo devuelva *el original*, y ésta es la mitad de la
-- base de esa promesa; la otra es el 409 que T-2 va a contestar para que la
-- pantalla pueda explicar qué pasó, en vez de que un `UPDATE` muera acá y
-- salga como un 500 de SQLite crudo.
--
-- `id` no está en la lista, y vale decir por qué: es la llave primaria y
-- cambiarla es cambiar de fila, no editar ésta. `orden` tampoco, y ésa es la
-- diferencia con `arancel_renglon_citado_no_se_edita`, que sí lo congela: el
-- orden del Acuerdo es parte de la cita y no se reordena; el de las
-- plantillas es una sugerencia del bufete y T-2 lo reordena.
CREATE TRIGGER modulo_plantilla_preset_no_se_edita
BEFORE UPDATE ON modulo_plantilla
WHEN NEW.rotulo_oficial IS NOT OLD.rotulo_oficial
  OR NEW.descripcion_oficial IS NOT OLD.descripcion_oficial
BEGIN
  SELECT RAISE(ABORT, 'plantilla de módulo: el preset no se edita; lo editable es el rótulo y la descripción del bufete');
END;

-- Una plantilla no se borra: se retira con `activo = 0`. El mensaje dice la
-- salida porque un `RAISE` que solo prohíbe deja a quien lo pisa sin saber
-- qué hacer.
--
-- Y acá el `DELETE` es peor que en el arancel: una plantilla borrada deja sin
-- rótulo los módulos de las cotizaciones que la usan. Las 54 filas vivas de
-- `cotizacion_modulo` guardan la clave como texto, así que el borrado no
-- rebota en ninguna llave foránea — rebota en esto.
CREATE TRIGGER modulo_plantilla_no_se_borra
BEFORE DELETE ON modulo_plantilla
BEGIN
  SELECT RAISE(ABORT, 'plantilla de módulo: una plantilla no se borra; se retira con activo = 0');
END;

-- ===========================================================================
-- M-4 · Los seis presets
-- ===========================================================================
--
-- Hay **un solo tenant**, con el id que `0001:254` siembra y que
-- `worker/db/ids.ts` exporta como `TENANT_UNICO_ID`. Se escribe el literal
-- porque una migración no importa código.
--
-- ## Las claves son las seis que `0004:218` ya permite
--
-- Exactamente las seis, ni una más: `cotizacion_modulo.tipo` sigue cerrado
-- por aquel `CHECK` durante toda esta tajada, así que una clave sembrada que
-- él no admita sería una plantilla que el editor ofrece y la base rechaza al
-- guardar. Hay una prueba que lo compara **en los dos sentidos** contra el
-- `CHECK` leído de `sqlite_master`, que es la forma que
-- `test/modulos-api.spec.ts` ya usaba.
--
-- ## El `orden` es el de lectura de una propuesta, no el alfabético
--
-- De dónde viene el encargo, qué se va a hacer, qué queda afuera, sobre qué
-- se apoya el precio, bajo qué condiciones, y el cierre dirigido al cliente.
-- Es el mismo de `CATALOGO_DE_MODULOS` en `worker/cotizaciones/modulos.ts`, y
-- los rótulos son los mismos seis literales. **Eso es una duplicación con
-- fecha de vencimiento**: T-3 deja esos rótulos con exactamente un uso, esta
-- siembra, y hasta entonces hay dos fuentes y una se va a quedar vieja. Se
-- dice acá para que sea una deuda anotada y no un hallazgo.
--
-- ## Los identificadores son literales fijos, y por qué
--
-- SQLite no tiene `gen_random_uuid()`, así que una siembra en SQL no puede
-- inventar la llave: o se escribe, o no hay fila. Y que estén escritos es lo
-- que hace la siembra **determinista y reproducible** — el mismo id en la
-- base local, en la de pruebas y en producción —, que es lo que deja que el
-- backfill de la tajada 2 y cualquier prueba hablen de la misma fila.
--
-- Comparten prefijo a propósito: en una consulta de bitácora o en un registro,
-- un identificador de este bloque se reconoce de un vistazo. Y **nada los
-- deriva**: no hay código que calcule el séptimo. Lo que identifica una
-- plantilla dentro del bufete es `clave`, y para eso está su único.
--
-- ## Las descripciones son lo que la IA va a leer
--
-- Se discutieron antes de ser una migración —están en la sección «Los seis
-- presets» de `odd/tasks/plantillas-de-modulo.md`— y acá van **verbatim**.
-- Son unos 800 caracteres contra los 30.304 que ya pesa la sección del
-- arancel en el prompt: el costo es ruido y el beneficio es que el modelo
-- deje de deducir el propósito del nombre. T-4 lo mide antes y después, en
-- caracteres, y lo anota.
--
-- `rotulo` y `descripcion` van en NULL en las seis: el bufete no ha decidido
-- nada todavía, y **nulo no es vacío** — un nulo es la ausencia de decisión,
-- que es lo que hace que la pantalla de T-2 muestre el preset como valor de
-- arranque en vez de un campo en blanco.

INSERT INTO modulo_plantilla (id, tenant_id, clave, rotulo_oficial, descripcion_oficial, rotulo, descripcion, orden, activo)
VALUES
  ('9f2c4a10-7b31-4d6e-8a52-0c1e5b7d9a01',
   'ead2d071-2ff7-4461-bf95-941c1e90d6d8',
   'antecedentes',
   'Antecedentes',
   'Qué pasó antes de la consulta: los hechos que el cliente relató, las fechas que importan y el estado actual del asunto. Sin opinión jurídica y sin anticipar resultados.',
   NULL, NULL, 1, 1),

  ('9f2c4a10-7b31-4d6e-8a52-0c1e5b7d9a02',
   'ead2d071-2ff7-4461-bf95-941c1e90d6d8',
   'alcance',
   'Alcance',
   'Qué trabajo asume el bufete: las gestiones concretas, ante qué entidades, y qué recibe el cliente al terminar. Con plazos cuando se puedan sostener.',
   NULL, NULL, 2, 1),

  ('9f2c4a10-7b31-4d6e-8a52-0c1e5b7d9a03',
   'ead2d071-2ff7-4461-bf95-941c1e90d6d8',
   'exclusiones',
   'Exclusiones',
   'Qué no está incluido y el cliente podría suponer que sí: trámites conexos, instancias posteriores, gastos de terceros, representación en otra jurisdicción.',
   NULL, NULL, 3, 1),

  ('9f2c4a10-7b31-4d6e-8a52-0c1e5b7d9a04',
   'ead2d071-2ff7-4461-bf95-941c1e90d6d8',
   'supuestos',
   'Supuestos',
   'De qué depende esta propuesta: documentación que el cliente debe aportar, hechos que se dan por ciertos, y plazos de terceros fuera del control del bufete. Si un supuesto no se cumple, el alcance y el precio cambian.',
   NULL, NULL, 4, 1),

  ('9f2c4a10-7b31-4d6e-8a52-0c1e5b7d9a05',
   'ead2d071-2ff7-4461-bf95-941c1e90d6d8',
   'clausulas',
   'Cláusulas',
   'Las condiciones de la contratación: forma y momento de pago, vigencia de la oferta, causales de terminación, y qué pasa con lo pagado si el encargo se interrumpe.',
   NULL, NULL, 5, 1),

  ('9f2c4a10-7b31-4d6e-8a52-0c1e5b7d9a06',
   'ead2d071-2ff7-4461-bf95-941c1e90d6d8',
   'nota_cliente',
   'Nota al cliente',
   'Un mensaje breve y directo al cliente, sin jerga, sobre por qué esta propuesta responde a lo que pidió. No repite el alcance.',
   NULL, NULL, 6, 1);
