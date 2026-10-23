-- Unicidad de nombre por tenant y coherencia de tenencia entre padres e hijos
-- (T-12 de `odd/tasks/crm-procesos.md`).
--
-- `0001_esquema_inicial.sql` y `0002_bitacora_inmutable.sql` ya corrieron y
-- **no se tocan**. Esta migración paga la deuda de integridad que T-6, T-9 y
-- T-11 fueron señalando y que ninguna hizo, correctamente, porque el esquema
-- estaba fuera de su superficie.
--
-- ## Ninguna tabla se reconstruye
--
-- La tarea avisaba que agregar una restricción en SQLite suele exigir el
-- procedimiento de reconstrucción de `0002` —tabla nueva, copia, borrado,
-- renombre—. Acá no hace falta, y eso no es suerte: las dos formas que se
-- usan, `CREATE UNIQUE INDEX` y `CREATE TRIGGER`, son objetos que se cuelgan
-- de una tabla existente sin reescribirla. La tercera forma, `CHECK`, es la
-- única que obliga a reconstruir, y es justo la que no sirve para nada de lo
-- que hay acá: un `CHECK` no puede mirar otra fila, y las tres guardas de
-- esta migración son exactamente eso, comparaciones contra la fila padre.
--
-- Consecuencia práctica: no hay `PRAGMA`, no hay `ALTER TABLE`, y ningún
-- índice ni disparador de `0001`/`0002` se pierde en el camino, que era el
-- riesgo real de reconstruir.
--
-- ## Por qué la base y no la aplicación
--
-- El argumento de `docs/diseno.md` §5, el mismo de las otras dos migraciones:
-- una regla que vive solo en el código es la que el primer script de
-- importación se salta. Y para M-3 no es hipotético — está comprobado. La
-- prueba de rechazo de T-11 **tuvo que insertar a mano un `proceso` con
-- nuestro `tenant_id` y el `tipo_proceso_id` del bufete vecino** para poder
-- ejercitarse. Esa fila entraba. Desde esta migración no entra, y la prueba
-- que la insertaba se movió a `test/esquema.spec.ts` convertida en lo que
-- siempre debió ser: la demostración de que la base la rechaza.

-- ---------------------------------------------------------------------------
-- M-1 · Un nombre de catálogo no se repite dentro del mismo tenant
-- ---------------------------------------------------------------------------
--
-- Hoy nada impide dos áreas "Familia". El catálogo partido en dos es el peor
-- de los males silenciosos: cada mitad acumula tipos de proceso y nadie se
-- entera hasta que un listado muestra la misma palabra dos veces.
--
-- Nombre de índice y forma copiados de `usuario_email_unico` (T-2), que es la
-- misma regla para la misma clase de columna.
--
-- Dos decisiones que no son obvias y se toman acá de una vez:
--
--   1. **Comparación exacta, sin `COLLATE NOCASE`.** Lo tentador sería pedir
--      `NOCASE` para que "Familia" y "familia" choquen. No se hace, y no por
--      pereza: el `NOCASE` de SQLite pliega **solo ASCII**, así que
--      "Migración" y "MIGRACIÓN" seguirían siendo dos filas distintas. En un
--      catálogo escrito en español, donde la mitad de los nombres lleva
--      tilde o eñe, eso no es media cobertura: es una falsa sensación de
--      cobertura, que es peor que no tenerla, porque nadie vuelve a mirar.
--      Normalizar de verdad —plegar mayúsculas con Unicode, decidir qué pasa
--      con los acentos, decidir qué pasa con los espacios dobles— es una
--      decisión de producto con su propia columna normalizada, y no se
--      improvisa dentro de una migración de integridad.
--
--   2. **El índice cubre también las filas dadas de baja** (`activo = 0`), es
--      decir, no es un índice parcial con `WHERE activo = 1`. Si "Familia"
--      fue dada de baja, la respuesta correcta a «quiero un área Familia» es
--      **reactivar la que existe**, no crear una segunda fila homónima. Un
--      índice parcial permitiría esa segunda fila, y el día que alguien
--      reactivara la primera el catálogo quedaría partido en dos de todos
--      modos — con la agravante de que ya habría historia colgando de cada
--      mitad, y entonces unirlas sería imposible.
--
-- Lo que esta migración **no** hace, a propósito: la API. Hoy un nombre
-- repetido llega a la base y vuelve como 500, no como 409. Es deuda conocida
-- y es de la unidad de trabajo siguiente. Adelantarla acá mezclaría una
-- migración con un cambio de contrato HTTP y haría las dos irrevisables.

CREATE UNIQUE INDEX area_nombre_unico ON area (tenant_id, nombre);

CREATE UNIQUE INDEX tipo_cliente_nombre_unico ON tipo_cliente (tenant_id, nombre);

-- `tipo_proceso` lleva el área en la llave: "Traspaso" en Civil y "Traspaso"
-- en Migración son dos trámites distintos y el bufete los nombra igual. El
-- índice sustituye con ventaja al `tipo_proceso_area` de `0001`, que indexaba
-- `(area_id, nombre)` sin el tenant y sin unicidad; ese se deja en pie porque
-- borrarlo no es gratis (otras consultas lo usan) y porque quitar índices no
-- es el trabajo de esta migración.
CREATE UNIQUE INDEX tipo_proceso_nombre_unico ON tipo_proceso (tenant_id, area_id, nombre);

-- ---------------------------------------------------------------------------
-- M-2 y M-3 · Toda arista que cruza tablas comparte tenant
-- ---------------------------------------------------------------------------
--
-- ## Por qué la familia completa y no las dos guardas que pedía el plan
--
-- El plan nombraba dos agujeros: `etapa_plantilla` contra su `tipo_proceso`
-- (M-2) y `proceso` contra su `cliente` y su `tipo_proceso` (M-3). Taparlos
-- solos no sirve. El defecto que M-3 denuncia —«una fila cruzada entre
-- bufetes es expresable en la base»— no es una propiedad de `proceso`: es una
-- propiedad de **toda llave foránea que apunta a una fila con `tenant_id` sin
-- llevar el tenant en la llave**. Dejar `cliente.creado_por`,
-- `proceso.responsable_id` o `bitacora.usuario_id` fuera sería tapar tres
-- puertas de una casa con ocho y declararla cerrada.
--
-- Así que se cubren las ocho tablas que tienen al menos una arista de esa
-- clase. `usuario`, `area` y `tipo_cliente` no llevan disparador porque sus
-- únicas llaves foráneas apuntan a `tenant`, que es el tenant: ahí no hay
-- nada que comparar.
--
-- | Tabla             | Referencias que deben compartir tenant                        |
-- |-------------------|---------------------------------------------------------------|
-- | `cliente`         | `tipo_cliente_id`, `creado_por`                               |
-- | `tipo_proceso`    | `area_id`                                                     |
-- | `etapa_plantilla` | `tipo_proceso_id`  ← M-2                                      |
-- | `proceso`         | `cliente_id`, `tipo_proceso_id`  ← M-3; más `responsable_id`  |
-- | `proceso_etapa`   | `proceso_id`                                                  |
-- | `nota`            | `proceso_id`, `proceso_etapa_id`, `autor_id`                  |
-- | `pendiente`       | `proceso_id`, `proceso_etapa_id`, `autor_id`,                 |
-- |                   | `responsable_id`, `cerrado_por`                               |
-- | `bitacora`        | `usuario_id`                                                  |
--
-- ## La regla extra de `nota` y `pendiente`
--
-- T-2 la señaló y T-9 la confirmó: que `proceso_etapa_id` sea del mismo
-- tenant **no alcanza**. La etapa tiene que ser una etapa **del mismo
-- proceso** que la nota o el pendiente. Es una regla distinta y más fuerte, y
-- sin ella una nota del proceso A puede colgar de una etapa del proceso B
-- dentro del mismo bufete: la línea de tiempo de los dos procesos queda mal y
-- la nota, siendo inmutable, no se puede mover. Va en el mismo disparador.
--
-- ## Por qué `IS NOT` y nunca `<>`
--
-- Es la misma trampa de NULL que `0001` documenta para los `CHECK` de fecha,
-- y acá es la más fácil de pisar de toda la tarea. Si la fila padre no
-- existe, la subconsulta no devuelve ninguna fila y vale NULL. Con `<>`, la
-- comparación evalúa a NULL, el `WHEN` da falso y **el disparador no
-- dispara**. Con `IS NOT`, NULL contra un `tenant_id` real es verdadero y el
-- disparador aborta, que es lo correcto: una referencia a un padre que no
-- existe es justamente el caso que no queremos dejar pasar. Que la llave
-- foránea también lo rechace no vuelve redundante al disparador — vuelve
-- redundante a una de las dos guardas, y la que se puede apagar con un
-- `PRAGMA` es la llave foránea, no el disparador.
--
-- ## Por qué cada condición lleva su guardia de NULL delante
--
-- Dos motivos distintos, y el segundo se descubrió al correr las pruebas:
--
--   1. **Corrección.** Una fila legítima con `responsable_id` nulo daría
--      subconsulta NULL, `IS NOT` verdadero, y el disparador abortaría una
--      escritura perfectamente válida. Sin la guardia, toda columna nullable
--      pasaría a ser obligatoria.
--
--   2. **Para no tapar el error verdadero.** En SQLite un `BEFORE INSERT` se
--      evalúa **antes** que `NOT NULL` y antes que las llaves foráneas.
--      Entonces una fila a la que le falta `tenant_id` —o `cliente_id`, o
--      `autor_id`— haría saltar primero el disparador, y el mensaje diría
--      «tenencia cruzada» cuando el defecto real es una columna ausente.
--      Verificado contra `test/esquema.spec.ts`, donde I-8 e I-6 exigen el
--      mensaje de `NOT NULL` por su nombre. Por eso la guardia va también en
--      las columnas declaradas `NOT NULL`, incluido `NEW.tenant_id` al
--      frente de todo: sin tenant no hay tenencia que comparar, y esa fila
--      ya la rechaza quien corresponde.
--
-- Lo que **no** se puede preservar, y es la contrapartida buscada de usar
-- `IS NOT`: una referencia a un padre inexistente ahora muere con el mensaje
-- del disparador y no con `FOREIGN KEY constraint failed`. Es el precio de
-- que el disparador llegue primero, y se paga de buena gana — la guarda que
-- se puede apagar con un `PRAGMA` es la llave foránea.
--
-- ## Un disparador por (tabla, operación), y catorce en total
--
-- Todas las condiciones de una tabla van combinadas con `OR` en el mismo
-- `WHEN`, con un solo `RAISE(ABORT, …)`. La alternativa —un disparador por
-- arista— daría cuarenta objetos para la misma regla, cuarenta nombres que
-- mantener y cuarenta oportunidades de que uno se pierda en la próxima
-- reconstrucción de tabla.
--
-- El costo es real y se asume a conciencia: **el mensaje único no dice qué
-- arista falló**. Quien depure una fila rechazada sabrá que `pendiente` tiene
-- una referencia cruzada, no cuál de las cinco. Se acepta porque el mensaje
-- sí nombra la tabla y la regla, que es lo que hace falta para saber qué
-- mirar, y porque la alternativa barata —componer el mensaje con `CASE`—
-- metería treinta líneas de ramas dentro de un `RAISE` para un dato que se
-- obtiene en diez segundos leyendo la fila que se intentó escribir.
--
-- ## `nota` y `bitacora` solo llevan disparador de `INSERT`
--
-- Verificado contra las dos migraciones anteriores: `nota_no_se_actualiza`
-- (`0001`) y `bitacora_no_se_actualiza` (`0002`) son `BEFORE UPDATE` sin
-- condición, y abortan toda actualización. Un segundo disparador de `UPDATE`
-- acá sería código muerto por construcción: no hay `UPDATE` que llegue a
-- evaluarlo. Las dos tablas sí llevan el de `INSERT`, que es la única
-- escritura que admiten.
--
-- No hay disparadores de `DELETE` en ninguna tabla: borrar una fila no puede
-- crear una incoherencia de tenencia, y las llaves foráneas en `NO ACTION` ya
-- impiden dejar huérfanos.

CREATE TRIGGER cliente_tenencia_coherente_al_insertar
BEFORE INSERT ON cliente
WHEN NEW.tenant_id IS NOT NULL
 AND ((NEW.tipo_cliente_id IS NOT NULL
        AND (SELECT tenant_id FROM tipo_cliente WHERE id = NEW.tipo_cliente_id) IS NOT NEW.tenant_id)
   OR (NEW.creado_por IS NOT NULL
        AND (SELECT tenant_id FROM usuario WHERE id = NEW.creado_por) IS NOT NEW.tenant_id))
BEGIN
  SELECT RAISE(ABORT, 'tenencia cruzada: cliente debe compartir tenant_id con las filas que referencia');
END;

CREATE TRIGGER cliente_tenencia_coherente_al_actualizar
BEFORE UPDATE ON cliente
WHEN NEW.tenant_id IS NOT NULL
 AND ((NEW.tipo_cliente_id IS NOT NULL
        AND (SELECT tenant_id FROM tipo_cliente WHERE id = NEW.tipo_cliente_id) IS NOT NEW.tenant_id)
   OR (NEW.creado_por IS NOT NULL
        AND (SELECT tenant_id FROM usuario WHERE id = NEW.creado_por) IS NOT NEW.tenant_id))
BEGIN
  SELECT RAISE(ABORT, 'tenencia cruzada: cliente debe compartir tenant_id con las filas que referencia');
END;

CREATE TRIGGER tipo_proceso_tenencia_coherente_al_insertar
BEFORE INSERT ON tipo_proceso
WHEN NEW.tenant_id IS NOT NULL
 AND ((NEW.area_id IS NOT NULL
        AND (SELECT tenant_id FROM area WHERE id = NEW.area_id) IS NOT NEW.tenant_id))
BEGIN
  SELECT RAISE(ABORT, 'tenencia cruzada: tipo_proceso debe compartir tenant_id con las filas que referencia');
END;

CREATE TRIGGER tipo_proceso_tenencia_coherente_al_actualizar
BEFORE UPDATE ON tipo_proceso
WHEN NEW.tenant_id IS NOT NULL
 AND ((NEW.area_id IS NOT NULL
        AND (SELECT tenant_id FROM area WHERE id = NEW.area_id) IS NOT NEW.tenant_id))
BEGIN
  SELECT RAISE(ABORT, 'tenencia cruzada: tipo_proceso debe compartir tenant_id con las filas que referencia');
END;

-- M-2. Hoy lo sostiene el código, porque toda escritura pasa por
-- `reemplazarEtapas`, que verifica el tipo antes. Eso es exactamente lo que
-- §5 llama una regla sin respaldo: vale hasta el primer camino de escritura
-- que no pase por ahí.
CREATE TRIGGER etapa_plantilla_tenencia_coherente_al_insertar
BEFORE INSERT ON etapa_plantilla
WHEN NEW.tenant_id IS NOT NULL
 AND ((NEW.tipo_proceso_id IS NOT NULL
        AND (SELECT tenant_id FROM tipo_proceso WHERE id = NEW.tipo_proceso_id) IS NOT NEW.tenant_id))
BEGIN
  SELECT RAISE(ABORT, 'tenencia cruzada: etapa_plantilla debe compartir tenant_id con las filas que referencia');
END;

CREATE TRIGGER etapa_plantilla_tenencia_coherente_al_actualizar
BEFORE UPDATE ON etapa_plantilla
WHEN NEW.tenant_id IS NOT NULL
 AND ((NEW.tipo_proceso_id IS NOT NULL
        AND (SELECT tenant_id FROM tipo_proceso WHERE id = NEW.tipo_proceso_id) IS NOT NEW.tenant_id))
BEGIN
  SELECT RAISE(ABORT, 'tenencia cruzada: etapa_plantilla debe compartir tenant_id con las filas que referencia');
END;

-- M-3, la que estaba comprobada: la fila cruzada que la prueba de T-11
-- tenía que insertar a mano para poder ejercitarse.
CREATE TRIGGER proceso_tenencia_coherente_al_insertar
BEFORE INSERT ON proceso
WHEN NEW.tenant_id IS NOT NULL
 AND ((NEW.cliente_id IS NOT NULL
        AND (SELECT tenant_id FROM cliente WHERE id = NEW.cliente_id) IS NOT NEW.tenant_id)
   OR (NEW.tipo_proceso_id IS NOT NULL
        AND (SELECT tenant_id FROM tipo_proceso WHERE id = NEW.tipo_proceso_id) IS NOT NEW.tenant_id)
   OR (NEW.responsable_id IS NOT NULL
        AND (SELECT tenant_id FROM usuario WHERE id = NEW.responsable_id) IS NOT NEW.tenant_id))
BEGIN
  SELECT RAISE(ABORT, 'tenencia cruzada: proceso debe compartir tenant_id con las filas que referencia');
END;

CREATE TRIGGER proceso_tenencia_coherente_al_actualizar
BEFORE UPDATE ON proceso
WHEN NEW.tenant_id IS NOT NULL
 AND ((NEW.cliente_id IS NOT NULL
        AND (SELECT tenant_id FROM cliente WHERE id = NEW.cliente_id) IS NOT NEW.tenant_id)
   OR (NEW.tipo_proceso_id IS NOT NULL
        AND (SELECT tenant_id FROM tipo_proceso WHERE id = NEW.tipo_proceso_id) IS NOT NEW.tenant_id)
   OR (NEW.responsable_id IS NOT NULL
        AND (SELECT tenant_id FROM usuario WHERE id = NEW.responsable_id) IS NOT NEW.tenant_id))
BEGIN
  SELECT RAISE(ABORT, 'tenencia cruzada: proceso debe compartir tenant_id con las filas que referencia');
END;

CREATE TRIGGER proceso_etapa_tenencia_coherente_al_insertar
BEFORE INSERT ON proceso_etapa
WHEN NEW.tenant_id IS NOT NULL
 AND ((NEW.proceso_id IS NOT NULL
        AND (SELECT tenant_id FROM proceso WHERE id = NEW.proceso_id) IS NOT NEW.tenant_id))
BEGIN
  SELECT RAISE(ABORT, 'tenencia cruzada: proceso_etapa debe compartir tenant_id con las filas que referencia');
END;

CREATE TRIGGER proceso_etapa_tenencia_coherente_al_actualizar
BEFORE UPDATE ON proceso_etapa
WHEN NEW.tenant_id IS NOT NULL
 AND ((NEW.proceso_id IS NOT NULL
        AND (SELECT tenant_id FROM proceso WHERE id = NEW.proceso_id) IS NOT NEW.tenant_id))
BEGIN
  SELECT RAISE(ABORT, 'tenencia cruzada: proceso_etapa debe compartir tenant_id con las filas que referencia');
END;

-- La última condición no es de tenencia sino la regla padre-hijo que T-2
-- señaló: la etapa tiene que ser una etapa del mismo proceso que la nota.
-- Sin ella, una nota del proceso A cuelga de una etapa del proceso B dentro
-- del mismo bufete, y siendo inmutable no se puede mover después.
CREATE TRIGGER nota_tenencia_coherente_al_insertar
BEFORE INSERT ON nota
WHEN NEW.tenant_id IS NOT NULL
 AND ((NEW.proceso_id IS NOT NULL
        AND (SELECT tenant_id FROM proceso WHERE id = NEW.proceso_id) IS NOT NEW.tenant_id)
   OR (NEW.proceso_etapa_id IS NOT NULL
        AND (SELECT tenant_id FROM proceso_etapa WHERE id = NEW.proceso_etapa_id) IS NOT NEW.tenant_id)
   OR (NEW.autor_id IS NOT NULL
        AND (SELECT tenant_id FROM usuario WHERE id = NEW.autor_id) IS NOT NEW.tenant_id)
   OR (NEW.proceso_id IS NOT NULL AND NEW.proceso_etapa_id IS NOT NULL
        AND (SELECT proceso_id FROM proceso_etapa WHERE id = NEW.proceso_etapa_id) IS NOT NEW.proceso_id))
BEGIN
  SELECT RAISE(ABORT, 'tenencia cruzada: nota debe compartir tenant_id con las filas que referencia, y su etapa debe ser del mismo proceso');
END;

CREATE TRIGGER pendiente_tenencia_coherente_al_insertar
BEFORE INSERT ON pendiente
WHEN NEW.tenant_id IS NOT NULL
 AND ((NEW.proceso_id IS NOT NULL
        AND (SELECT tenant_id FROM proceso WHERE id = NEW.proceso_id) IS NOT NEW.tenant_id)
   OR (NEW.proceso_etapa_id IS NOT NULL
        AND (SELECT tenant_id FROM proceso_etapa WHERE id = NEW.proceso_etapa_id) IS NOT NEW.tenant_id)
   OR (NEW.autor_id IS NOT NULL
        AND (SELECT tenant_id FROM usuario WHERE id = NEW.autor_id) IS NOT NEW.tenant_id)
   OR (NEW.responsable_id IS NOT NULL
        AND (SELECT tenant_id FROM usuario WHERE id = NEW.responsable_id) IS NOT NEW.tenant_id)
   OR (NEW.cerrado_por IS NOT NULL
        AND (SELECT tenant_id FROM usuario WHERE id = NEW.cerrado_por) IS NOT NEW.tenant_id)
   OR (NEW.proceso_id IS NOT NULL AND NEW.proceso_etapa_id IS NOT NULL
        AND (SELECT proceso_id FROM proceso_etapa WHERE id = NEW.proceso_etapa_id) IS NOT NEW.proceso_id))
BEGIN
  SELECT RAISE(ABORT, 'tenencia cruzada: pendiente debe compartir tenant_id con las filas que referencia, y su etapa debe ser del mismo proceso');
END;

-- `pendiente` sí lleva el de `UPDATE`: no es inmutable, se cierra. Y cerrar
-- es justo la escritura que estrena `cerrado_por`, la arista que más fácil
-- quedaría sin mirar.
CREATE TRIGGER pendiente_tenencia_coherente_al_actualizar
BEFORE UPDATE ON pendiente
WHEN NEW.tenant_id IS NOT NULL
 AND ((NEW.proceso_id IS NOT NULL
        AND (SELECT tenant_id FROM proceso WHERE id = NEW.proceso_id) IS NOT NEW.tenant_id)
   OR (NEW.proceso_etapa_id IS NOT NULL
        AND (SELECT tenant_id FROM proceso_etapa WHERE id = NEW.proceso_etapa_id) IS NOT NEW.tenant_id)
   OR (NEW.autor_id IS NOT NULL
        AND (SELECT tenant_id FROM usuario WHERE id = NEW.autor_id) IS NOT NEW.tenant_id)
   OR (NEW.responsable_id IS NOT NULL
        AND (SELECT tenant_id FROM usuario WHERE id = NEW.responsable_id) IS NOT NEW.tenant_id)
   OR (NEW.cerrado_por IS NOT NULL
        AND (SELECT tenant_id FROM usuario WHERE id = NEW.cerrado_por) IS NOT NEW.tenant_id)
   OR (NEW.proceso_id IS NOT NULL AND NEW.proceso_etapa_id IS NOT NULL
        AND (SELECT proceso_id FROM proceso_etapa WHERE id = NEW.proceso_etapa_id) IS NOT NEW.proceso_id))
BEGIN
  SELECT RAISE(ABORT, 'tenencia cruzada: pendiente debe compartir tenant_id con las filas que referencia, y su etapa debe ser del mismo proceso');
END;

-- `entidad_id` no se compara con nada: `0002` explica por qué no es llave
-- foránea —es polimórfico, y un área borrada tiene que dejar su entrada en
-- pie—. Pedirle tenencia obligaría a resolver la entidad en el disparador y
-- a romper justamente esa propiedad.
CREATE TRIGGER bitacora_tenencia_coherente_al_insertar
BEFORE INSERT ON bitacora
WHEN NEW.tenant_id IS NOT NULL
 AND ((NEW.usuario_id IS NOT NULL
        AND (SELECT tenant_id FROM usuario WHERE id = NEW.usuario_id) IS NOT NEW.tenant_id))
BEGIN
  SELECT RAISE(ABORT, 'tenencia cruzada: bitacora debe compartir tenant_id con las filas que referencia');
END;
