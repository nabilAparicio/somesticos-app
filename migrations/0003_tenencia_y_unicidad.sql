-- Unicidad de nombre por tenant, coherencia de tenencia entre padres e hijos,
-- e inmutabilidad de las columnas que atan una fila a su bufete
-- (T-12 y T-13 de `odd/tasks/crm-procesos.md`).
--
-- T-13 agrega tres cosas a lo que T-12 dejó, y por eso se edita este archivo
-- en vez de abrir un `0004`: la migración **todavía no se aplicó a ninguna
-- base real** —`wrangler.jsonc` tiene el `database_id` en el marcador de
-- ceros— y las tres pertenecen al mismo archivo que las restricciones que
-- protegen. Separarlas en otra migración dejaría una ventana en la que la
-- regla existe a medias, que es justo lo que estas tres cosas vienen a
-- cerrar.
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
-- M-0 · La base a la que se aplica esto ya tiene que cumplir (T-13, H-2)
-- ---------------------------------------------------------------------------
--
-- Todo lo que sigue a esta sección vigila **escrituras futuras**. Nada de
-- ello mira una sola fila de las que ya están. `CREATE UNIQUE INDEX` es la
-- única excepción —aborta si encuentra duplicados—, y es justamente la
-- excepción que esconde el problema: como los tres índices sí revisan, es
-- fácil suponer que los disparadores también. No revisan nada.
--
-- La consecuencia, sobre una base que ya tuviera una fila cruzada: la fila
-- sobrevive a la migración, queda **viva e inmodificable** —cualquier
-- `UPDATE` la hace chocar contra el disparador que la habría rechazado al
-- nacer— y nadie se entera hasta que alguien intenta tocarla. Hoy es
-- teórico porque la base real todavía no existe. Resolverlo *antes* de
-- aprovisionarla es gratis; después, no.
--
-- ## Por qué una tabla temporal con un `CHECK` imposible
--
-- SQLite no deja usar `RAISE` fuera de un disparador, así que una migración
-- no tiene forma directa de decir «parate». Lo que sí tiene es una
-- restricción que no se puede satisfacer: se crea una tabla cuyo `CHECK`
-- exige `ok = 1`, y se le intenta insertar un `0` **solo si la consulta que
-- busca filas malas encuentra alguna**. Si no encuentra nada, el `INSERT`
-- no inserta ninguna fila y la migración sigue sin enterarse; si encuentra,
-- el `CHECK` revienta y la migración se detiene.
--
-- Tres tablas y no una, cada una con su restricción **nombrada**: SQLite
-- reporta `CHECK constraint failed: <nombre de la restricción>`, así que el
-- nombre es el mensaje de error. Con una sola tabla el operador vería
-- `CHECK constraint failed: ok = 1` y tendría que adivinar cuál de las tres
-- familias de reglas falló. Es la misma economía que la sección «un
-- disparador por (tabla, operación)» resuelve al revés, y por el mismo
-- criterio: ahí el mensaje único alcanza porque nombra tabla y regla; acá
-- no alcanzaría porque no nombraría ninguna de las dos.
--
-- Las tablas se borran al final de su propio bloque. Si el `CHECK` aborta
-- no llegan a borrarse, pero tampoco quedan: `applyD1Migrations` y
-- `wrangler d1 migrations apply` mandan el archivo como un `batch`, que en
-- D1 es una transacción, y la migración entera vuelve atrás. Verificado en
-- `test/esquema.spec.ts`, que lo comprueba desarmando `0003`, ensuciando la
-- base y pidiéndole al corredor real que la aplique de nuevo.
--
-- Y por eso esta sección va **primera**: si algún día el archivo se
-- aplicara sin transacción, abortar antes de crear nada es la diferencia
-- entre una migración que no entró y media migración puesta.
--
-- Las consultas van como `OR EXISTS (…)` encadenados y no como un `UNION
-- ALL` dentro de un solo `EXISTS`, que era lo primero que se escribió: D1
-- corta los `SELECT` compuestos mucho antes que el SQLite de escritorio y
-- devuelve `too many terms in compound SELECT` con ocho términos. La forma
-- encadenada además se lee mejor, porque cada tabla queda en su línea.

CREATE TABLE verificacion_previa_m1 (
  ok INTEGER NOT NULL
     CONSTRAINT la_base_ya_tiene_nombres_de_catalogo_repetidos CHECK (ok = 1)
);

INSERT INTO verificacion_previa_m1 (ok)
SELECT 0 WHERE
     EXISTS (SELECT 1 FROM area         GROUP BY tenant_id, nombre          HAVING count(*) > 1)
  OR EXISTS (SELECT 1 FROM tipo_cliente GROUP BY tenant_id, nombre          HAVING count(*) > 1)
  OR EXISTS (SELECT 1 FROM tipo_proceso GROUP BY tenant_id, area_id, nombre HAVING count(*) > 1);

DROP TABLE verificacion_previa_m1;

-- Las diecisiete aristas de la tabla de M-2 y M-3, en el mismo orden y con
-- la misma forma que los disparadores que las vigilan de acá en adelante.
-- La guardia de NULL va **solo** en las cuatro columnas que el esquema
-- declara nullable —`cliente.tipo_cliente_id`, `proceso.responsable_id`,
-- `pendiente.responsable_id` y `pendiente.cerrado_por`—: sin ella una fila
-- legítima con la columna vacía daría subconsulta NULL, `IS NOT` verdadero
-- y la migración se detendría por nada. En las columnas `NOT NULL` la
-- guardia sobra, y acá sí sobra de verdad: el segundo motivo que la pone en
-- los disparadores —no tapar el error real de una columna ausente— no
-- aplica a una consulta que solo lee.
CREATE TABLE verificacion_previa_tenencia (
  ok INTEGER NOT NULL
     CONSTRAINT la_base_ya_tiene_filas_que_referencian_a_otro_bufete CHECK (ok = 1)
);

INSERT INTO verificacion_previa_tenencia (ok)
SELECT 0 WHERE
     EXISTS (
       SELECT 1 FROM cliente c
        WHERE (c.tipo_cliente_id IS NOT NULL
                AND (SELECT tenant_id FROM tipo_cliente WHERE id = c.tipo_cliente_id) IS NOT c.tenant_id)
           OR (SELECT tenant_id FROM usuario WHERE id = c.creado_por) IS NOT c.tenant_id)
  OR EXISTS (
       SELECT 1 FROM tipo_proceso t
        WHERE (SELECT tenant_id FROM area WHERE id = t.area_id) IS NOT t.tenant_id)
  OR EXISTS (
       SELECT 1 FROM etapa_plantilla e
        WHERE (SELECT tenant_id FROM tipo_proceso WHERE id = e.tipo_proceso_id) IS NOT e.tenant_id)
  OR EXISTS (
       SELECT 1 FROM proceso p
        WHERE (SELECT tenant_id FROM cliente WHERE id = p.cliente_id) IS NOT p.tenant_id
           OR (SELECT tenant_id FROM tipo_proceso WHERE id = p.tipo_proceso_id) IS NOT p.tenant_id
           OR (p.responsable_id IS NOT NULL
                AND (SELECT tenant_id FROM usuario WHERE id = p.responsable_id) IS NOT p.tenant_id))
  OR EXISTS (
       SELECT 1 FROM proceso_etapa pe
        WHERE (SELECT tenant_id FROM proceso WHERE id = pe.proceso_id) IS NOT pe.tenant_id)
  OR EXISTS (
       SELECT 1 FROM nota n
        WHERE (SELECT tenant_id FROM proceso WHERE id = n.proceso_id) IS NOT n.tenant_id
           OR (SELECT tenant_id FROM proceso_etapa WHERE id = n.proceso_etapa_id) IS NOT n.tenant_id
           OR (SELECT tenant_id FROM usuario WHERE id = n.autor_id) IS NOT n.tenant_id)
  OR EXISTS (
       SELECT 1 FROM pendiente pd
        WHERE (SELECT tenant_id FROM proceso WHERE id = pd.proceso_id) IS NOT pd.tenant_id
           OR (SELECT tenant_id FROM proceso_etapa WHERE id = pd.proceso_etapa_id) IS NOT pd.tenant_id
           OR (SELECT tenant_id FROM usuario WHERE id = pd.autor_id) IS NOT pd.tenant_id
           OR (pd.responsable_id IS NOT NULL
                AND (SELECT tenant_id FROM usuario WHERE id = pd.responsable_id) IS NOT pd.tenant_id)
           OR (pd.cerrado_por IS NOT NULL
                AND (SELECT tenant_id FROM usuario WHERE id = pd.cerrado_por) IS NOT pd.tenant_id))
  OR EXISTS (
       SELECT 1 FROM bitacora b
        WHERE (SELECT tenant_id FROM usuario WHERE id = b.usuario_id) IS NOT b.tenant_id);

DROP TABLE verificacion_previa_tenencia;

-- La regla padre-hijo, que es más fuerte que la de tenencia y por eso va
-- aparte: las dos filas pueden ser del mismo bufete y la referencia seguir
-- siendo incoherente.
CREATE TABLE verificacion_previa_etapa (
  ok INTEGER NOT NULL
     CONSTRAINT la_base_ya_tiene_hijos_colgados_de_la_etapa_de_otro_proceso CHECK (ok = 1)
);

INSERT INTO verificacion_previa_etapa (ok)
SELECT 0 WHERE
     EXISTS (
       SELECT 1 FROM nota n
        WHERE (SELECT proceso_id FROM proceso_etapa WHERE id = n.proceso_etapa_id) IS NOT n.proceso_id)
  OR EXISTS (
       SELECT 1 FROM pendiente pd
        WHERE (SELECT proceso_id FROM proceso_etapa WHERE id = pd.proceso_etapa_id) IS NOT pd.proceso_id);

DROP TABLE verificacion_previa_etapa;

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
-- Lo que esta migración **no** hace, a propósito: la API. Adelantarla acá
-- mezclaría una migración con un cambio de contrato HTTP y haría las dos
-- irrevisables. Se hizo en la unidad de trabajo siguiente de T-12, y **ya
-- está hecha**: un nombre repetido contesta 409 por los dos caminos de
-- escritura, con la consulta previa que `worker/catalogos/repositorio.ts`
-- argumenta. Este índice es el respaldo que no debería dispararse nunca.
--
-- Importa que esto quede dicho y no como deuda abierta: un comentario que
-- declara pendiente algo ya resuelto invita a «arreglarlo» envolviendo el
-- error del índice en un `try/catch`, que es justo lo que el repositorio
-- prohíbe y lo que volvería la guarda inverificable.

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
-- ## Un disparador por (tabla, operación), y trece en total
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
--
-- ## `proceso_etapa` tampoco lleva el de `UPDATE`, y esto lo decidió T-13
--
-- T-12 sí se lo había puesto. Se quita porque la sección de inmutabilidad de
-- más abajo vuelve inmutables **las dos únicas columnas que ese disparador
-- miraba**: `tenant_id` y `proceso_id`. Si ninguna de las dos puede cambiar,
-- la pareja que el `INSERT` ya verificó coherente sigue siendo la misma para
-- siempre, y su condición no puede dar verdadero nunca. Es el mismo criterio
-- con el que `nota` y `bitacora` no lo llevan: un disparador que no puede
-- disparar no es defensa en profundidad, es una prueba que nadie puede
-- escribir y un lector que se confunde.
--
-- Importa qué **no** cambia al quitarlo: `UPDATE proceso_etapa SET proceso_id
-- = <cualquier otro>` sigue muriendo, y con un mensaje más exacto que el de
-- antes — «una etapa no se muda de proceso» en vez de «tenencia cruzada»,
-- que además era falso cuando el otro proceso era del mismo bufete. Ése fue
-- exactamente el agujero que la revisión de T-12 encontró.

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

-- ---------------------------------------------------------------------------
-- M-4 · Una fila no cambia de bufete, y una etapa no se muda de proceso
-- ---------------------------------------------------------------------------
--
-- La revisión de T-12 encontró el agujero y lo describió como un caso: un
-- `UPDATE proceso_etapa SET proceso_id = <otro proceso del mismo bufete>`
-- pasaba limpio y arrastraba a un proceso ajeno todas las notas colgadas de
-- esa etapa, que por inmutables no se pueden mover después. T-13 cierra la
-- clase entera, porque el caso es apenas su ejemplo más vistoso:
--
--   **Los trece disparadores de arriba viven en la escritura del hijo.
--   Mutar el padre los derrota a todos.**
--
-- Dos ejemplos que lo dejan claro, y el segundo no lo cubría ni de lejos el
-- primero:
--
--   * `UPDATE proceso_etapa SET proceso_id = …` escribe sobre la etapa, que
--     sí tiene disparador, pero el disparador solo comparaba `tenant_id` y
--     los dos procesos eran del mismo bufete.
--   * `UPDATE area SET tenant_id = <vecino>` deja **todos** los
--     `tipo_proceso` de esa área cruzados de un plumazo, y no se entera
--     nadie: `area` no tiene ningún disparador, y el de `tipo_proceso` solo
--     corre cuando se escribe `tipo_proceso`.
--
-- ## La regla, y por qué es tan barata
--
-- **Una fila no cambia de bufete.** Mover una fila de bufete es, por
-- definición, fabricar la fila cruzada que esta migración entera existe para
-- impedir; no hay un caso legítimo que quede afuera. Y no cuesta nada:
-- verificado con el compilador y con una búsqueda sobre todo el repositorio,
-- **ninguna escritura del código asigna `tenant_id` en un `UPDATE`**. Los
-- seis `UPDATE` del worker escriben columnas de datos y filtran por
-- `tenant_id` en el `WHERE`, que es lo contrario de reasignarlo.
--
-- **Una etapa no se muda de proceso**, por lo mismo: `proceso_etapa.proceso_id`
-- es lo que ata la etapa a su línea de tiempo, y nada lo reescribe —
-- `reemplazarEtapas` inserta, actualiza nombre y orden, o borra, pero nunca
-- recuelga.
--
-- ## Un disparador propio por tabla, y no una condición más en los de arriba
--
-- La alternativa era agregarle `OR NEW.tenant_id IS NOT OLD.tenant_id` a los
-- seis `…_al_actualizar` que ya existían. Se descarta por tres razones:
--
--   1. **No alcanzaría.** `area`, `tipo_cliente` y `usuario` no tienen
--      ningún disparador donde colgar la condición, y son justamente las
--      tres del segundo ejemplo de arriba. Habría que crearlos igual, así
--      que la economía era aparente.
--   2. **Es otra regla.** Las de arriba comparan una fila con su padre; ésta
--      compara una fila consigo misma antes y después. Mezclarlas obligaría
--      a un mensaje que no dijera ninguna de las dos cosas.
--   3. **El mensaje es la mitad del valor.** Quien pise esto de madrugada
--      lee `columna inmutable: area.tenant_id no se reasigna`, que nombra la
--      tabla, la columna y la regla. Un `tenencia cruzada: area …` lo
--      mandaría a buscar el padre equivocado.
--
-- `nota` y `bitacora` no llevan ninguno, por el mismo argumento verificado
-- de la sección anterior: `nota_no_se_actualiza` (`0001`) y
-- `bitacora_no_se_actualiza` (`0002`) son `BEFORE UPDATE` **sin condición** y
-- abortan toda actualización, así que ahí un disparador de inmutabilidad
-- sería código muerto por construcción. `test/esquema.spec.ts` lo comprueba
-- en vez de suponerlo: intenta mudarlas y afirma que mueren con el mensaje
-- de la guarda que sí las cubre.
--
-- `IS NOT` y nunca `<>`, por la razón de siempre. Acá la trampa es más
-- esquiva que en los disparadores de tenencia: con `<>`, un `UPDATE` que
-- pusiera `tenant_id` en NULL daría una comparación NULL, la guarda no
-- dispararía, y el error que llegaría sería el de `NOT NULL` — correcto por
-- casualidad. Con `IS NOT` la guarda dispara y dice la verdad.

CREATE TRIGGER usuario_tenant_inmutable
BEFORE UPDATE ON usuario
WHEN NEW.tenant_id IS NOT OLD.tenant_id
BEGIN
  SELECT RAISE(ABORT, 'columna inmutable: usuario.tenant_id no se reasigna; una fila no cambia de bufete');
END;

CREATE TRIGGER tipo_cliente_tenant_inmutable
BEFORE UPDATE ON tipo_cliente
WHEN NEW.tenant_id IS NOT OLD.tenant_id
BEGIN
  SELECT RAISE(ABORT, 'columna inmutable: tipo_cliente.tenant_id no se reasigna; una fila no cambia de bufete');
END;

CREATE TRIGGER cliente_tenant_inmutable
BEFORE UPDATE ON cliente
WHEN NEW.tenant_id IS NOT OLD.tenant_id
BEGIN
  SELECT RAISE(ABORT, 'columna inmutable: cliente.tenant_id no se reasigna; una fila no cambia de bufete');
END;

CREATE TRIGGER area_tenant_inmutable
BEFORE UPDATE ON area
WHEN NEW.tenant_id IS NOT OLD.tenant_id
BEGIN
  SELECT RAISE(ABORT, 'columna inmutable: area.tenant_id no se reasigna; una fila no cambia de bufete');
END;

CREATE TRIGGER tipo_proceso_tenant_inmutable
BEFORE UPDATE ON tipo_proceso
WHEN NEW.tenant_id IS NOT OLD.tenant_id
BEGIN
  SELECT RAISE(ABORT, 'columna inmutable: tipo_proceso.tenant_id no se reasigna; una fila no cambia de bufete');
END;

CREATE TRIGGER etapa_plantilla_tenant_inmutable
BEFORE UPDATE ON etapa_plantilla
WHEN NEW.tenant_id IS NOT OLD.tenant_id
BEGIN
  SELECT RAISE(ABORT, 'columna inmutable: etapa_plantilla.tenant_id no se reasigna; una fila no cambia de bufete');
END;

CREATE TRIGGER proceso_tenant_inmutable
BEFORE UPDATE ON proceso
WHEN NEW.tenant_id IS NOT OLD.tenant_id
BEGIN
  SELECT RAISE(ABORT, 'columna inmutable: proceso.tenant_id no se reasigna; una fila no cambia de bufete');
END;

CREATE TRIGGER proceso_etapa_tenant_inmutable
BEFORE UPDATE ON proceso_etapa
WHEN NEW.tenant_id IS NOT OLD.tenant_id
BEGIN
  SELECT RAISE(ABORT, 'columna inmutable: proceso_etapa.tenant_id no se reasigna; una fila no cambia de bufete');
END;

CREATE TRIGGER pendiente_tenant_inmutable
BEFORE UPDATE ON pendiente
WHEN NEW.tenant_id IS NOT OLD.tenant_id
BEGIN
  SELECT RAISE(ABORT, 'columna inmutable: pendiente.tenant_id no se reasigna; una fila no cambia de bufete');
END;

-- El caso que la revisión encontró, y el único que no es sobre `tenant_id`:
-- la etapa es lo que ata una nota a su lugar en la línea de tiempo, y la
-- nota es inmutable. Recolgar la etapa reescribe la historia de dos
-- procesos a la vez y no hay vuelta atrás.
CREATE TRIGGER proceso_etapa_proceso_inmutable
BEFORE UPDATE ON proceso_etapa
WHEN NEW.proceso_id IS NOT OLD.proceso_id
BEGIN
  SELECT RAISE(ABORT, 'columna inmutable: proceso_etapa.proceso_id no se reasigna; una etapa no se muda de proceso');
END;
