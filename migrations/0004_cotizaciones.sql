-- El esquema de la cotización: `cotizacion`, `cotizacion_modulo` y
-- `cotizacion_linea` (T-1 de `odd/tasks/cotizaciones.md`).
--
-- Fuente de verdad: `docs/diseno.md` §5 (invariantes), §6 (modelo de datos) y
-- §8 (el generador, de donde sale el vocabulario de tipos de módulo).
--
-- Es la primera migración de la tajada 2 y la primera que **sólo agrega**:
-- `0001`, `0002` y `0003` no se tocan. Las convenciones son las que `0001`
-- decidió una vez y se aplican igual acá —identificadores TEXT con UUID
-- generado en código, momentos ISO 8601 UTC con el `CHECK` de ida y vuelta
-- por `strftime`, valores cerrados con `CHECK` en vez de `ENUM`, montos en
-- enteros de centavos, vocabulario en español— así que lo que sigue
-- argumenta sólo lo que es nuevo.
--
-- `0001` ya anticipó esta migración en su encabezado: dejó `cotizacion`,
-- `cotizacion_modulo` y `cotizacion_linea` fuera a propósito, y dejó fuera
-- también `proceso.cotizacion_linea_id` para no declarar una llave foránea
-- hacia una tabla inexistente. Esa columna **sigue sin entrar acá**: es de
-- T-7, que es la tarea que abre procesos desde una cotización ganada, y es
-- ahí donde I-3 por fin es expresable.
--
-- ## Lo que NO entra, y en qué tarea entra
--
--   * **I-4** (una emitida no se edita) e **I-5** (el snapshot se escribe una
--     vez y no se reescribe) son de T-4, con sus propios disparadores. Acá
--     está sólo la coherencia estática entre `estado` y `snapshot`, que es
--     otra regla: dice que las dos columnas no se contradicen, no dice quién
--     puede cambiarlas.
--   * **I-3** (el proceso nacido de una cotización comparte cliente con ella)
--     es de T-7, junto con la columna que lo hace expresable.
--   * **I-7** (el saldo nunca se almacena) es de T-10. Lo que esta migración
--     aporta en esa dirección es por omisión y a conciencia: no hay columna
--     de subtotal ni de total en ninguna de las tres tablas. La aritmética se
--     deriva (T-3). `test/esquema-cotizaciones.spec.ts` lo fija leyendo
--     `pragma_table_info`, para que la omisión sea una decisión verificada y
--     no un descuido que mañana alguien "arregla".
--   * `cuota` y `movimiento_gasto` son de R5.
--
-- ## Por qué cada `CHECK` lleva nombre
--
-- `0001` no los nombra y acá sí, por el criterio que `0003` ya había tomado
-- para sus verificaciones previas: SQLite reporta `CHECK constraint failed:
-- <nombre de la restricción>`, así que **el nombre es el mensaje de error**.
-- Sin nombre, el mensaje de un `CHECK` de tabla es apenas el nombre de la
-- tabla, y `cotizacion` tiene dos restricciones de tabla: el operador vería
-- `CHECK constraint failed: cotizacion` y tendría que adivinar cuál de las
-- dos falló. La consecuencia de prueba es la que importa más: con nombre,
-- cada prueba de rechazo afirma **su** regla y no una cadena genérica que
-- cualquier otro `CHECK` haría pasar.

-- ---------------------------------------------------------------------------
-- M-0 · Por qué esta migración NO lleva verificación previa
-- ---------------------------------------------------------------------------
--
-- `0003` abre con cuatro verificaciones previas, y el plan de la tajada pedía
-- extenderlas acá. No se extienden, y el motivo vale escribirlo porque el
-- próximo que agregue una tabla tiene que saber cuándo sí hacen falta.
--
-- La verificación previa de `0003` existe porque esa migración **cuelga
-- disparadores de tablas que nacieron en `0001`**. Entre `0001` y `0003`
-- transcurre tiempo real en el que una fila cruzada puede entrar, y los
-- disparadores no miran nada de lo ya escrito: esa fila sobreviviría a la
-- migración y quedaría viva e inmodificable.
--
-- Acá no hay tal ventana. Las tres tablas **nacen en el mismo archivo que sus
-- disparadores**, y el archivo entero viaja como un `batch` —que en D1 es una
-- transacción— tanto por `applyD1Migrations` como por `wrangler d1 migrations
-- apply`. Entre el `CREATE TABLE` y el `CREATE TRIGGER` no hay ningún
-- instante en que una conexión ajena pueda escribir una fila: o entran los
-- dos, o no entra ninguno. Que el archivo es atómico no se supone: las
-- pruebas H-2 de `test/esquema.spec.ts` lo comprueban sobre `0003`,
-- ensuciando la base y afirmando que la migración abortada no deja ni medio
-- esquema puesto.
--
-- Y hay un segundo motivo, más duro que el de economía: **la verificación
-- previa acá no se puede escribir**. En `0003` va primera, antes de crear
-- nada, justamente para abortar antes de dejar media migración. La
-- equivalente acá tendría que consultar `cotizacion` en un punto del archivo
-- en que `cotizacion` todavía no existe, y la migración moriría con «no such
-- table: cotizacion» — un fallo real por una comprobación vacía. Ponerla
-- después de los `CREATE TABLE` tampoco sirve: consultaría tablas recién
-- creadas, que están vacías por construcción.
--
-- **La regla, para la próxima tabla:** la verificación previa hace falta
-- cuando la migración pone una guarda sobre filas que **ya podían existir**
-- —una tabla de una migración anterior, o un `CHECK` nuevo sobre una columna
-- vieja—. No hace falta cuando la tabla y su guarda nacen juntas.

-- ---------------------------------------------------------------------------
-- La cotización
-- ---------------------------------------------------------------------------
--
-- `cliente_id NOT NULL` es **I-1**, y va en la base por el argumento de §5:
-- una regla que vive sólo en el código es la que el primer script de
-- importación se salta.
--
-- `estado` no lleva `DEFAULT`, a diferencia de `proceso.estado` en `0001`.
-- No hay nada que ganar: toda escritura de una cotización pasa por el
-- repositorio, que conoce el estado, y sin `DEFAULT` omitir la columna muere
-- con `NOT NULL constraint failed: cotizacion.estado`, que nombra el defecto
-- real. Verificado que ese mensaje es el que llega y no el de la coherencia
-- de snapshot: en SQLite `NOT NULL` se evalúa **antes** que los `CHECK` de
-- tabla, al revés de lo que pasa con los disparadores `BEFORE INSERT`.
--
-- `moneda` es un vocabulario cerrado a una sola moneda, y es deliberado:
-- agregar una moneda es un despliegue, exactamente el mismo criterio que
-- `docs/diseno.md` §8 fija para el catálogo de tipos de módulo. Cerrarlo hoy
-- cuesta una línea; abrirlo el día que haga falta cuesta esa misma línea más
-- la conversación sobre tasas de cambio, que es la que de verdad hay que
-- tener antes de guardar dos monedas en la misma tabla.
--
-- `snapshot` guarda el documento congelado como TEXT. Nullable porque un
-- borrador no tiene ninguno; la regla que lo ata al estado está más abajo.
--
-- `duplicada_de_id` es la autorreferencia de T-5: duplicar no reescribe la
-- historia, nace un borrador nuevo atado al original. El disparador de
-- tenencia verifica que las dos sean del mismo bufete; que además compartan
-- cliente no se exige acá, y no por olvido — duplicar una cotización para
-- otro cliente es un caso legítimo y frecuente, y es decisión de T-5 si se
-- permite o no desde la pantalla.
CREATE TABLE cotizacion (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenant (id),
  cliente_id      TEXT NOT NULL REFERENCES cliente (id),
  codigo          TEXT NOT NULL,
  estado          TEXT NOT NULL
                    CONSTRAINT el_estado_de_la_cotizacion_es_del_ciclo_de_vida
                    CHECK (estado IN ('borrador', 'emitida', 'ganada', 'perdida')),
  fecha           TEXT NOT NULL
                    CONSTRAINT la_fecha_de_la_cotizacion_es_un_momento_canonico
                    CHECK (fecha IS strftime('%Y-%m-%dT%H:%M:%fZ', fecha)),
  vence_en        TEXT
                    CONSTRAINT el_vencimiento_de_la_cotizacion_es_un_momento_canonico
                    CHECK (vence_en IS strftime('%Y-%m-%dT%H:%M:%fZ', vence_en)),
  moneda          TEXT NOT NULL DEFAULT 'USD'
                    CONSTRAINT la_moneda_de_la_cotizacion_es_del_catalogo_cerrado
                    CHECK (moneda IN ('USD')),
  snapshot        TEXT,
  duplicada_de_id TEXT REFERENCES cotizacion (id),
  creada_por      TEXT NOT NULL REFERENCES usuario (id),
  creada_en       TEXT NOT NULL
                    CONSTRAINT la_creacion_de_la_cotizacion_es_un_momento_canonico
                    CHECK (creada_en IS strftime('%Y-%m-%dT%H:%M:%fZ', creada_en)),

  -- Una cotización puede no vencer —`vence_en` nulo es el caso mayoritario—,
  -- pero si vence no puede hacerlo antes de existir. La comparación es de
  -- texto y eso es correcto por construcción, no por casualidad: el `CHECK`
  -- de ida y vuelta de arriba garantiza que las dos columnas están en la
  -- forma canónica de ancho fijo, donde el orden lexicográfico y el
  -- cronológico son el mismo. Si ese `CHECK` se aflojara, éste dejaría de
  -- valer en silencio.
  CONSTRAINT la_vigencia_no_termina_antes_de_empezar
  CHECK (vence_en IS NULL OR vence_en >= fecha),

  -- La coherencia entre el estado y el snapshot, en las dos direcciones a la
  -- vez: un borrador no tiene snapshot, y una emitida, ganada o perdida sí.
  -- Es la misma forma de M-5 en `0003`.
  --
  -- `IS` y nunca `=`, por la razón de siempre: un `CHECK` que evalúa a NULL
  -- **pasa**. Acá la trampa es menos vistosa que en otros lados y conviene
  -- decirlo con todas las letras: `estado` es `NOT NULL` y `NOT NULL` corre
  -- antes que el `CHECK`, así que hoy no existe la fila que distinga una
  -- forma de la otra y ninguna prueba puede morir por cambiar el operador.
  -- Se escribe `IS` igual porque la distancia entre "no se puede escribir la
  -- prueba" y "la regla es correcta" es exactamente donde se esconden los
  -- defectos: el día que alguien le ponga un `DEFAULT` a `estado`, o lo haga
  -- nullable, o copie esta línea a una tabla donde la columna sí lo sea, el
  -- `=` dejaría pasar la fila incoherente sin que nada avise.
  --
  -- Lo que esta regla **no** dice, y es de T-4: quién puede cambiar el
  -- estado, y que el snapshot no se reescriba (I-5). Acá sólo se exige que
  -- las dos columnas no se contradigan.
  CONSTRAINT el_borrador_no_tiene_snapshot_y_la_emitida_si
  CHECK ((estado = 'borrador') IS (snapshot IS NULL))
);

-- El código es único **por tenant**, con la misma forma y el mismo criterio
-- que los tres índices de M-1 en `0003`: comparación exacta, sin
-- `COLLATE NOCASE`. No es pereza — el `NOCASE` de SQLite pliega sólo ASCII,
-- así que daría una falsa sensación de cobertura, que es peor que no tenerla
-- porque nadie vuelve a mirar. Y el índice no es parcial: cubre también las
-- perdidas y las duplicadas, porque un código reutilizado es exactamente lo
-- que impide contestar «¿qué le cotizamos a este cliente en marzo?».
CREATE UNIQUE INDEX cotizacion_codigo_unico ON cotizacion (tenant_id, codigo);

CREATE INDEX cotizacion_cliente ON cotizacion (cliente_id);
CREATE INDEX cotizacion_tenant_estado ON cotizacion (tenant_id, estado);

-- ---------------------------------------------------------------------------
-- Los módulos de prosa
-- ---------------------------------------------------------------------------
--
-- Los seis tipos de prosa que nombra `docs/diseno.md` §8. El vocabulario va
-- cerrado con `CHECK` por el mismo argumento que la barandilla de la tajada:
-- si la IA pudiera inventar un tipo, las cotizaciones dejarían de ser
-- comparables entre sí y el snapshot guardaría una forma distinta cada vez.
--
-- **Este `CHECK` es una de dos mitades acopladas.** La otra es el registro
-- tipado en código que construye T-2 —§8 es explícito en que el catálogo vive
-- en código y no como configuración editable: agregar un tipo es un
-- despliegue—. Las dos listas tienen que decir lo mismo, y separarlas es la
-- misma trampa que el vocabulario de bitácora, que en la tajada 1 quedó
-- repartido en tres mitades: el `CHECK` de `0002`, la unión de
-- `worker/contract.ts` y el `Record` de `src/bitacora.ts`. Ahí la solución
-- que funcionó fue una prueba que lee el `CHECK` de `sqlite_master` y exige
-- que las listas coincidan **en los dos sentidos**; T-2 hereda ese deber al
-- escribir su mitad.
--
-- Las familias estructuradas de §8 —líneas, plan de pagos, totales— no son
-- tipos de módulo: viven en `cotizacion_linea`, en `cuota` y en aritmética
-- derivada. Mezclarlas acá sería devolverle al modelo la posibilidad de
-- escribir un total en prosa.
CREATE TABLE cotizacion_modulo (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant (id),
  cotizacion_id TEXT NOT NULL REFERENCES cotizacion (id),
  tipo          TEXT NOT NULL
                  CONSTRAINT el_tipo_de_modulo_es_del_catalogo_cerrado
                  CHECK (tipo IN ('alcance', 'exclusiones', 'antecedentes',
                                  'supuestos', 'clausulas', 'nota_cliente')),
  orden         INTEGER NOT NULL,
  contenido     TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- Las líneas de honorarios y gastos estimados
-- ---------------------------------------------------------------------------
--
-- `tipo_proceso_id` es nullable y es lo que T-7 usa para abrir procesos desde
-- una cotización ganada: una línea sin tipo de proceso es un cobro que no
-- abre trámite —una consulta, un gasto de mensajería— y es el caso corriente,
-- no la excepción.
--
-- `clase` separa las dos familias que la pantalla muestra aparte y rotula
-- distinto: un gasto estimado es aproximado y se dice.
--
-- `monto` son **centavos enteros, jamás coma flotante** (restricción 5 de la
-- tajada). Y acá hay una trampa de SQLite que la declaración sola no tapa:
-- `INTEGER` es una **afinidad**, no un tipo. Un 1500.5 no se puede convertir
-- a entero sin pérdida, así que la columna lo guarda tal cual, como real, y
-- la declaración no impide nada. Verificado. `typeof(monto) = 'integer'` es
-- lo único que lo impide de verdad, y no estorba a nadie: un '2000' que
-- llegue como texto sí se convierte sin pérdida y entra como entero.
--
-- No hay columna de subtotal ni de total, ni acá ni en `cotizacion`: la
-- aritmética la deriva T-3. Un total almacenado es un total que algún día no
-- coincide con sus líneas, y la pregunta «¿cuánto cobramos en promedio por
-- una visa de trabajo?» se contesta mal para siempre.
CREATE TABLE cotizacion_linea (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenant (id),
  cotizacion_id   TEXT NOT NULL REFERENCES cotizacion (id),
  tipo_proceso_id TEXT REFERENCES tipo_proceso (id),
  clase           TEXT NOT NULL
                    CONSTRAINT la_clase_de_la_linea_separa_honorario_de_gasto
                    CHECK (clase IN ('honorario', 'gasto_estimado')),
  concepto        TEXT NOT NULL,
  monto           INTEGER NOT NULL
                    CONSTRAINT el_monto_es_centavos_enteros_no_negativos
                    CHECK (typeof(monto) = 'integer' AND monto >= 0),
  orden           INTEGER NOT NULL
);

-- ---------------------------------------------------------------------------
-- El orden es único dentro de cada cotización
-- ---------------------------------------------------------------------------
--
-- Dos módulos en la posición 3 es una cotización cuyo orden de lectura
-- depende de qué devuelva el motor, y el snapshot congelaría uno de los dos
-- órdenes al azar.
--
-- **Esto es lo contrario de lo que decidió `0001` para `etapa_plantilla`, y
-- la diferencia es deliberada.** Allá el `orden` no lleva índice único porque
-- reordenar con `UPDATE … SET orden = orden + 1` viola el único
-- transitoriamente, fila por fila, y SQLite no tiene restricciones únicas
-- diferibles. Acá se paga ese costo a cambio de la garantía, y se paga con
-- los ojos abiertos: **T-2 y T-3 no pueden reordenar incrementando columnas
-- en su lugar.** Tienen que reescribir el tramo afectado en una sola
-- transacción —borrar e insertar, o pasar por un rango temporal que no
-- choque—, que es la misma forma que `reemplazarEtapas` ya usa para las
-- etapas de un proceso. Es una línea más de código en dos tareas, contra una
-- cotización que puede salir mal ordenada sin que nadie se entere.
CREATE UNIQUE INDEX cotizacion_modulo_orden_unico
  ON cotizacion_modulo (cotizacion_id, orden);

CREATE UNIQUE INDEX cotizacion_linea_orden_unico
  ON cotizacion_linea (cotizacion_id, orden);

-- ---------------------------------------------------------------------------
-- Toda arista que cruza tablas comparte tenant
-- ---------------------------------------------------------------------------
--
-- La familia de M-2/M-3 de `0003`, extendida a las tres tablas nuevas. No es
-- opcional: una tabla nueva sin su disparador es exactamente el agujero que
-- esa migración cerró. Las aristas son siete:
--
-- | Tabla               | Referencias que deben compartir tenant            |
-- |---------------------|---------------------------------------------------|
-- | `cotizacion`        | `cliente_id`, `duplicada_de_id`, `creada_por`      |
-- | `cotizacion_modulo` | `cotizacion_id`                                    |
-- | `cotizacion_linea`  | `cotizacion_id`, `tipo_proceso_id`                 |
--
-- Las siete se vigilan al `INSERT`. Al `UPDATE` se vigilan sólo las cuatro
-- que una escritura posterior puede volver incoherentes; las otras tres
-- cuelgan de columnas inmutables y la sección «Qué tabla lleva el disparador
-- de `UPDATE` y cuál no», más abajo, dice cuáles y por qué.
--
-- La forma es la misma de `0003`, hasta en el detalle: un disparador por par
-- (tabla, operación), todas las condiciones de una tabla combinadas con `OR`
-- en el mismo `WHEN`, un solo `RAISE(ABORT, …)`, y el costo asumido de que el
-- mensaje nombre la tabla y la regla pero no cuál de las aristas falló.
--
-- ## `IS NOT` y nunca `<>`
--
-- Si la fila padre no existe, la subconsulta no devuelve ninguna fila y vale
-- NULL. Con `<>` la comparación evalúa a NULL, el `WHEN` da falso y **el
-- disparador no dispara**; con `IS NOT`, NULL contra un `tenant_id` real es
-- verdadero y aborta, que es lo correcto. Que la llave foránea también lo
-- rechace no vuelve redundante al disparador: vuelve redundante a la llave
-- foránea, que es la que se puede apagar con un `PRAGMA`.
--
-- ## La guardia de NULL va en **todas** las columnas, no sólo en las nullable
--
-- Son dos motivos distintos y conviene no confundirlos, porque invertirlos
-- produce exactamente el defecto que se quiere evitar:
--
--   1. **Corrección**, y esto sí es sólo de las nullable. Una línea legítima
--      sin `tipo_proceso_id`, o una cotización que no duplica a ninguna,
--      darían subconsulta NULL, `IS NOT` verdadero y el disparador abortaría
--      una escritura perfectamente válida. Sin la guardia, toda columna
--      nullable pasaría a ser obligatoria.
--
--   2. **Para no tapar el error verdadero**, y esto es justamente de las
--      `NOT NULL`. En SQLite un `BEFORE INSERT` se evalúa **antes** que
--      `NOT NULL` y antes que las llaves foráneas. Entonces una fila a la que
--      le falta `cliente_id` haría saltar primero el disparador, y el mensaje
--      diría «tenencia cruzada» cuando el defecto real es una columna
--      ausente. La guardia hace que el disparador se calle y que el error lo
--      reporte quien corresponde. Por eso va también en `NEW.tenant_id`, al
--      frente de todo: sin tenant no hay tenencia que comparar.
--
-- Es la misma conclusión de `0003` y se verifica igual, con las pruebas que
-- exigen el mensaje de `NOT NULL` por su nombre para `cotizacion.cliente_id`
-- y para el `tenant_id` de las tres tablas. Quitar la guardia de una columna
-- `NOT NULL` no cierra ningún agujero —la fila muere igual— y sólo cambia el
-- mensaje por uno que miente.
--
-- ## Qué tabla lleva el disparador de `UPDATE` y cuál no
--
-- `cotizacion_modulo` **no lleva** el de `UPDATE`, por el mismo argumento con
-- el que `0003` se lo quitó a `proceso_etapa`: la sección de inmutabilidad de
-- más abajo vuelve inmutables **las dos únicas columnas que ese disparador
-- miraría**, `tenant_id` y `cotizacion_id`. Si ninguna de las dos puede
-- cambiar, la pareja que el `INSERT` ya verificó coherente sigue siéndolo
-- para siempre y la condición no puede dar verdadero nunca. Un disparador que
-- no puede disparar no es defensa en profundidad: es una prueba que nadie
-- puede escribir y un lector que se confunde.
--
-- `cotizacion_linea` **sí lo lleva, y únicamente por `tipo_proceso_id`.** Esa
-- es la diferencia entera con `cotizacion_modulo`: `tipo_proceso_id` es
-- mutable —cambiar a qué trámite corresponde una línea es una edición
-- legítima de un borrador— y es una arista que cruza tablas, así que ahí el
-- disparador tiene algo real que vigilar.
--
-- Su otra arista, `cotizacion_id`, **no está en el `WHEN` de `UPDATE`**, y es
-- la misma decisión que dejó a `cotizacion_modulo` sin disparador: para que
-- esa cláusula diera verdadero habría que cambiar `cotizacion_id` o
-- `tenant_id`, y las dos son inmutables por la sección de más abajo; el
-- `tenant_id` del padre también lo es, y la llave foránea en `NO ACTION`
-- impide borrarlo. No queda ningún camino de escritura que la alcance.
--
-- Medido y no supuesto, que es lo que distingue esta decisión de una
-- corazonada: con la cláusula puesta, un `UPDATE` que mueve una línea a la
-- cotización del vecino muere con `columna inmutable` y nunca con `tenencia
-- cruzada`, y neutralizarla no mata ninguna prueba. Dejarla habría hecho que
-- esta migración se contradijera a sí misma —el disparador entero fuera en
-- una tabla, la cláusula equivalente dentro en la otra— y habría repetido el
-- adorno que T-13 le quitó a `proceso_etapa` en `0003`.
--
-- Lo que **no** se pierde al quitarla: `UPDATE cotizacion_linea SET
-- cotizacion_id = <cualquier otra>` sigue muriendo, y con el mensaje más
-- exacto de los dos — «una línea no se muda de cotización» en vez de
-- «tenencia cruzada», que además sería falso cuando la otra cotización es
-- del mismo bufete.
--
-- `cotizacion` también lo lleva: `cliente_id`, `duplicada_de_id` y
-- `creada_por` son todas mutables.
--
-- No hay disparadores de `DELETE` en ninguna tabla, por lo mismo que en
-- `0003`: borrar una fila no puede crear una incoherencia de tenencia, y las
-- llaves foráneas en `NO ACTION` ya impiden dejar huérfanos.

CREATE TRIGGER cotizacion_tenencia_coherente_al_insertar
BEFORE INSERT ON cotizacion
WHEN NEW.tenant_id IS NOT NULL
 AND ((NEW.cliente_id IS NOT NULL
        AND (SELECT tenant_id FROM cliente WHERE id = NEW.cliente_id) IS NOT NEW.tenant_id)
   OR (NEW.duplicada_de_id IS NOT NULL
        AND (SELECT tenant_id FROM cotizacion WHERE id = NEW.duplicada_de_id) IS NOT NEW.tenant_id)
   OR (NEW.creada_por IS NOT NULL
        AND (SELECT tenant_id FROM usuario WHERE id = NEW.creada_por) IS NOT NEW.tenant_id))
BEGIN
  SELECT RAISE(ABORT, 'tenencia cruzada: cotizacion debe compartir tenant_id con las filas que referencia');
END;

CREATE TRIGGER cotizacion_tenencia_coherente_al_actualizar
BEFORE UPDATE ON cotizacion
WHEN NEW.tenant_id IS NOT NULL
 AND ((NEW.cliente_id IS NOT NULL
        AND (SELECT tenant_id FROM cliente WHERE id = NEW.cliente_id) IS NOT NEW.tenant_id)
   OR (NEW.duplicada_de_id IS NOT NULL
        AND (SELECT tenant_id FROM cotizacion WHERE id = NEW.duplicada_de_id) IS NOT NEW.tenant_id)
   OR (NEW.creada_por IS NOT NULL
        AND (SELECT tenant_id FROM usuario WHERE id = NEW.creada_por) IS NOT NEW.tenant_id))
BEGIN
  SELECT RAISE(ABORT, 'tenencia cruzada: cotizacion debe compartir tenant_id con las filas que referencia');
END;

CREATE TRIGGER cotizacion_modulo_tenencia_coherente_al_insertar
BEFORE INSERT ON cotizacion_modulo
WHEN NEW.tenant_id IS NOT NULL
 AND ((NEW.cotizacion_id IS NOT NULL
        AND (SELECT tenant_id FROM cotizacion WHERE id = NEW.cotizacion_id) IS NOT NEW.tenant_id))
BEGIN
  SELECT RAISE(ABORT, 'tenencia cruzada: cotizacion_modulo debe compartir tenant_id con las filas que referencia');
END;

CREATE TRIGGER cotizacion_linea_tenencia_coherente_al_insertar
BEFORE INSERT ON cotizacion_linea
WHEN NEW.tenant_id IS NOT NULL
 AND ((NEW.cotizacion_id IS NOT NULL
        AND (SELECT tenant_id FROM cotizacion WHERE id = NEW.cotizacion_id) IS NOT NEW.tenant_id)
   OR (NEW.tipo_proceso_id IS NOT NULL
        AND (SELECT tenant_id FROM tipo_proceso WHERE id = NEW.tipo_proceso_id) IS NOT NEW.tenant_id))
BEGIN
  SELECT RAISE(ABORT, 'tenencia cruzada: cotizacion_linea debe compartir tenant_id con las filas que referencia');
END;

-- Sólo `tipo_proceso_id`. Ver arriba: la cláusula de `cotizacion_id` sería
-- código muerto, porque esa columna es inmutable.
CREATE TRIGGER cotizacion_linea_tenencia_coherente_al_actualizar
BEFORE UPDATE ON cotizacion_linea
WHEN NEW.tenant_id IS NOT NULL
 AND ((NEW.tipo_proceso_id IS NOT NULL
        AND (SELECT tenant_id FROM tipo_proceso WHERE id = NEW.tipo_proceso_id) IS NOT NEW.tenant_id))
BEGIN
  SELECT RAISE(ABORT, 'tenencia cruzada: cotizacion_linea debe compartir tenant_id con las filas que referencia');
END;

-- ---------------------------------------------------------------------------
-- Una fila no cambia de bufete, y un hijo no se muda de cotización
-- ---------------------------------------------------------------------------
--
-- La familia de M-4 de `0003`, por la razón que esa migración argumenta y que
-- vale igual acá: **los disparadores de tenencia viven en la escritura del
-- hijo, y mutar el padre los derrota a todos.** Mover una fila de bufete es,
-- por definición, fabricar la fila cruzada que la sección anterior existe
-- para impedir, y no hay un caso legítimo que quede afuera.
--
-- ## El disparador de `cotizacion_id` inmutable, y por qué sí
--
-- `0003` lo puso sobre `proceso_etapa.proceso_id` porque un hijo que se muda
-- de padre reescribe la historia de dos procesos a la vez y las notas, siendo
-- inmutables, no se pueden mover de vuelta. Acá el mismo criterio da el mismo
-- resultado, y por un motivo todavía más fuerte:
--
--   **La guarda de I-4 —una cotización emitida no se edita— vive en la
--   escritura de `cotizacion`, y la escribe T-4.** Recolgar un módulo o una
--   línea cambia el contenido de una cotización **sin escribir una sola
--   columna suya**, así que ese disparador ni se entera. Un `UPDATE
--   cotizacion_linea SET cotizacion_id = <una emitida>` le agregaría un
--   honorario a una propuesta que el cliente ya recibió, y el snapshot
--   guardado diría otra cosa que las líneas vivas. No hay vuelta atrás: el
--   documento ya salió.
--
-- Y no cuesta nada, por la misma verificación que hizo `0003`: ninguna
-- escritura legítima reasigna `cotizacion_id`. Reordenar cambia `orden`;
-- duplicar (T-5) **inserta filas nuevas** atadas por `duplicada_de_id`, que
-- es justamente el mecanismo que existe para no reescribir la historia.
--
-- El `orden`, en cambio, queda mutable a propósito: T-2 y T-3 reordenan, y
-- una inmutabilidad escrita de más ahí les cerraría la puerta.
--
-- ## Un disparador propio por tabla y por columna
--
-- No se agregan como condiciones a los de tenencia, por las tres razones de
-- `0003`: no alcanzaría (`cotizacion_modulo` no tiene disparador de `UPDATE`
-- donde colgarla, y no lo tiene justamente porque esta sección existe), es
-- otra regla —ésta compara una fila consigo misma antes y después, no con su
-- padre—, y el mensaje es la mitad del valor.
--
-- ## `IS NOT` y nunca `<>`, y acá —sólo acá— nadie lo comprueba
--
-- `0003` ya explica el mecanismo: con `<>`, un `UPDATE` que pusiera la
-- columna en NULL daría una comparación NULL, la guarda no dispararía, y el
-- error que llegaría sería el de `NOT NULL`. Lo que no dice, y es lo que hay
-- que saber antes de tocar estas cinco líneas, es que **esa elección no está
-- cubierta por ninguna prueba**. Medido: cambiar `IS NOT` por `<>` en los
-- cinco disparadores de inmutabilidad de esta migración, uno por uno, deja
-- las 118 pruebas del archivo en verde. En los cinco. No es un olvido ni una
-- prueba que alguien se debe: es una cobertura que se decidió no escribir, y
-- el porqué es el resto de esta sección.
--
-- **La integridad no depende del operador.** Para que las dos formas se
-- comporten distinto, uno de los dos lados tiene que ser NULL, y `OLD` nunca
-- lo es —la fila existe y la columna es `NOT NULL`—. Queda un solo camino,
-- `UPDATE … SET <columna> = NULL`, y ahí aborta `NOT NULL` igual. Verificado
-- en las dos ramas y para los dos valores: con `IS NOT` y con `<>`, mover la
-- fila a otro bufete muere con `columna inmutable`, y ponerle NULL muere con
-- uno de los dos mensajes; la fila queda intacta en los cuatro casos.
-- **Ninguna escritura pasa con ninguno de los dos operadores.** Lo único que
-- cambia es cuál de los dos mensajes de error llega, y trece pruebas para
-- fijar eso no valen lo que cuestan.
--
-- **El punto ciego es heredado, no nuevo.** Los diez disparadores de
-- inmutabilidad de `0003` —los nueve de `tenant_id` y el de
-- `proceso_etapa.proceso_id`— tienen exactamente el mismo, desde T-13: la
-- misma mutación sobre cualquiera de ellos tampoco mata nada. Estos cinco
-- copian el patrón con su punto ciego incluido, y se deja dicho acá para que
-- el próximo que lo descubra no lo crea una regresión de la tajada 2 ni
-- salga a escribir quince pruebas de mensaje.
--
-- **Y acá la regla se invierte, que es lo que de verdad no se adivina.** En
-- los disparadores de tenencia el `IS NOT` es la guarda: sin él, un padre
-- inexistente se escurre y el rechazo queda en manos de una llave foránea
-- que un `PRAGMA` apaga. Acá no guarda nada, sólo elige el mensaje — y por
-- el mismo argumento con el que la guardia de NULL va en las columnas
-- `NOT NULL` de los disparadores de tenencia (no tapar el defecto real),
-- `NOT NULL constraint failed: cotizacion_linea.tenant_id` es
-- discutiblemente el **mejor** de los dos: nombra la columna y el defecto
-- verdadero, que es un NULL en una columna que no lo admite, en vez de
-- hablar de una mudanza de bufete que nadie intentó.
--
-- Se escribe `IS NOT` igual, y la razón no es que sea mejor: es que estos
-- cinco disparadores y los diez de `0003` son la misma regla, y escribirla
-- de dos formas distintas según la tabla es peor que cualquiera de las dos
-- formas. Si algún día se cambia, se cambian los quince a la vez y con su
-- prueba de mensaje cada uno. Mientras tanto, que quede dicho que la
-- consistencia es el argumento, y no una cobertura que no existe.

CREATE TRIGGER cotizacion_tenant_inmutable
BEFORE UPDATE ON cotizacion
WHEN NEW.tenant_id IS NOT OLD.tenant_id
BEGIN
  SELECT RAISE(ABORT, 'columna inmutable: cotizacion.tenant_id no se reasigna; una fila no cambia de bufete');
END;

CREATE TRIGGER cotizacion_modulo_tenant_inmutable
BEFORE UPDATE ON cotizacion_modulo
WHEN NEW.tenant_id IS NOT OLD.tenant_id
BEGIN
  SELECT RAISE(ABORT, 'columna inmutable: cotizacion_modulo.tenant_id no se reasigna; una fila no cambia de bufete');
END;

CREATE TRIGGER cotizacion_linea_tenant_inmutable
BEFORE UPDATE ON cotizacion_linea
WHEN NEW.tenant_id IS NOT OLD.tenant_id
BEGIN
  SELECT RAISE(ABORT, 'columna inmutable: cotizacion_linea.tenant_id no se reasigna; una fila no cambia de bufete');
END;

CREATE TRIGGER cotizacion_modulo_cotizacion_inmutable
BEFORE UPDATE ON cotizacion_modulo
WHEN NEW.cotizacion_id IS NOT OLD.cotizacion_id
BEGIN
  SELECT RAISE(ABORT, 'columna inmutable: cotizacion_modulo.cotizacion_id no se reasigna; un módulo no se muda de cotización');
END;

CREATE TRIGGER cotizacion_linea_cotizacion_inmutable
BEFORE UPDATE ON cotizacion_linea
WHEN NEW.cotizacion_id IS NOT OLD.cotizacion_id
BEGIN
  SELECT RAISE(ABORT, 'columna inmutable: cotizacion_linea.cotizacion_id no se reasigna; una línea no se muda de cotización');
END;
