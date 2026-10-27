-- Un módulo apunta a su plantilla, no a una cadena
-- (T-5 de `odd/tasks/plantillas-de-modulo.md`).
--
-- `0001` a `0016` ya corrieron y **no se tocan**.
--
-- ## Lo que esta migración cierra
--
-- `0016` puso las seis plantillas en una tabla y les dio rótulo editable y
-- descripción. Lo que dejó sin tocar, a propósito y con todas las letras
-- (`0016:51`), es `cotizacion_modulo.tipo`: una cadena cerrada por el `CHECK`
-- `el_tipo_de_modulo_es_del_catalogo_cerrado` de `0004:218`. O sea que hoy el
-- catálogo de módulos vive en dos lugares que **no están atados por la
-- base**: la tabla, donde se pueden agregar claves, y el `CHECK`, donde no.
--
-- Eso tiene una consecuencia concreta y es la que agenda esta tajada: un
-- botón «crear plantilla» sobre `0016` habría creado una plantilla
-- **inservible**. La fila nacería bien y el primer módulo de ese tipo en una
-- cotización lo rechazaría el `CHECK` de `0004`. Una pantalla que ofrece
-- crear algo que después no se puede usar es peor que una pantalla sin el
-- botón, así que T-7 —el alta— no puede entrar antes que esta migración.
--
-- La referencia hace tres cosas que el `CHECK` no hacía:
--
--   1. **Una clave inventada no llega a existir.** Hoy lo que lo impide son
--      el `CHECK` y la unión `TipoDeModulo` de `worker/contract.ts`: una
--      decisión escrita dos veces y atada por tres pruebas bidireccionales
--      (T-3). La llave foránea es más fuerte que las tres juntas, y por eso
--      T-6 puede borrar la unión.
--   2. **Una plantilla que un módulo usa no se puede perder.** El disparador
--      `modulo_plantilla_no_se_borra` de `0016` ya lo impedía por arriba; la
--      referencia lo impide también por abajo, y las dos rutas importan
--      porque la de arriba se escribió en un archivo que mañana se puede
--      editar.
--   3. **El catálogo deja de tener dos fuentes.** Agregar una plantilla pasa
--      a ser una fila y nada más. Es lo que T-7 necesita.
--
-- ## Esta es la primera reconstrucción de tabla de este proyecto que mueve
-- ## datos de verdad
--
-- Y conviene decirlo antes de nada, porque cambia qué hay que verificar. Las
-- siete reconstrucciones anteriores —`0002:205`, `0005:139`, `0006:121`,
-- `0009:158`, `0010:294`, `0012:148`, `0016:148`— son todas de `bitacora` y
-- todas copian las columnas **derecho**:
--
--     INSERT INTO bitacora_nueva (…) SELECT id, tenant_id, … FROM bitacora;
--
-- Una copia así no puede perder una fila sin que el `INSERT` muera: no hay
-- predicado que la descarte. Acá el relleno es un `JOIN`, y **un `JOIN` que
-- no encuentra nada no grita, devuelve nada** —es la frase que `0011:100`
-- dejó escrita al pagar este mismo precio—. Las 54 filas vivas de 11
-- cotizaciones, 6 de ellas emitidas, se mapean por `(tenant_id, clave)`, y un
-- relleno que perdiera una fila dejaría una cotización emitida con un módulo
-- menos: un documento que ya se mandó al cliente y que después de esto se
-- imprimiría distinto. No hay vuelta atrás de eso, porque la columna que
-- decía el tipo ya no existiría.
--
-- Por eso esta migración verifica **antes** del `DROP` y **después** del
-- relleno, y las dos verificaciones abortan. La sección M-0 explica el
-- mecanismo y por qué se eligió ése.
--
-- ## El backfill es un `JOIN`, y nunca un `CASE`
--
-- La alternativa que se rechaza, dicha para que no se vuelva a proponer: un
--
--     CASE m.tipo WHEN 'alcance' THEN '9f2c4a10-…-9a02' WHEN … END
--
-- con los seis identificadores literales de la siembra de `0016:519`. Es más
-- corto y es peor por dos motivos que no son de estilo:
--
--   * **Un `CASE` sin rama devuelve NULL en silencio.** Con `plantilla_id
--     NOT NULL` eso muere, sí — pero muere en la fila 37 de un `INSERT` de 54
--     y con el mensaje `NOT NULL constraint failed`, que no nombra ni la
--     clave que faltaba ni el bufete. El `JOIN` no llega a producir la fila, y
--     la verificación previa de M-0 la nombra antes de que nada se destruya.
--   * **Un `CASE` no mira el bufete.** Los identificadores de `0016` son los
--     de un tenant. El día que haya un segundo bufete con sus propias seis
--     plantillas —que es el supuesto de I-8, no una hipótesis— el `CASE` le
--     ataría sus módulos a las plantillas del primero. El `JOIN` lleva
--     `p.tenant_id = m.tenant_id` y no puede cometer ese error.
--
-- ## Y SÍ se pierde el `CHECK`, que es el punto
--
-- Después de esto no hay ninguna lista cerrada de claves en la base: lo que
-- cierra el juego es qué filas tiene `modulo_plantilla`. Eso es exactamente
-- lo que T-7 necesita y exactamente lo que `docs/diseno.md` §5 pide que se
-- piense dos veces, así que vale decir qué sobrevive de la garantía del
-- `CHECK`:
--
--   * «En dos años conviven `clausulas`, `cláusulas` y `clauses`» era el
--     riesgo (`worker/cotizaciones/modulos.ts`). Sigue impedido, y por una
--     guarda más fuerte: el único `modulo_plantilla_clave_unica` de `0016`
--     admite las tres claves pero sólo una vez cada una, y un módulo sólo
--     puede apuntar a una fila que exista. El `CHECK` prohibía claves nuevas;
--     el único prohíbe claves **repetidas**, que es el defecto real.
--   * Lo que de verdad se pierde es que la lista sea de seis. Esa decisión la
--     toma el bufete desde T-7, que es el pedido del usuario.
--
-- `TipoDeModulo` **sobrevive esta migración** como el tipo de la clave, y es
-- deliberado: su muerte es T-6 y es el único cambio de ese día. El día que se
-- pierde una red del compilador conviene que no haya nada más que culpar.

-- ===========================================================================
-- M-0 · Verificar antes de destruir
-- ===========================================================================
--
-- ## El mecanismo, y por qué éste y no otro
--
-- SQLite no deja usar `RAISE` fuera de un disparador, así que una migración
-- no tiene forma directa de decir «parate». Las tres formas que sí hay:
--
--   | Forma                                   | Por qué no, o por qué sí            |
--   |-----------------------------------------|-------------------------------------|
--   | Un disparador que haga `RAISE(ABORT, …)` | Habría que crearlo y borrarlo, y mientras exista **cuelga de la tabla que se está reconstruyendo**: el `DROP TABLE` se lo lleva, y si se cuelga de la tabla nueva dispara durante el relleno. Un objeto que hay que recordar borrar en una migración que ya tiene siete objetos que recordar recrear. |
--   | Un `INSERT` imposible sin restricción nombrada | Aborta, pero el mensaje es el de la restricción anónima y el operador tiene que adivinar qué pasó. |
--   | **Una tabla temporal con un `CHECK` nombrado** | Es la que se usa. |
--
-- Se elige la tercera, y el motivo principal es que **el nombre de la
-- restricción es el mensaje de error**: SQLite reporta
-- `CHECK constraint failed: <nombre>`, así que quien lo pise lee qué regla se
-- rompió sin abrir el archivo. Es la forma que `0003:97` introdujo y que
-- `0008:111` y `0011:117` ya repitieron, y usar la misma acá no es inercia:
-- una migración que inventa su propio mecanismo de aborto obliga a leerlo
-- antes de confiar en él.
--
-- La forma es: se crea una tabla cuyo `CHECK` exige `ok = 1`, y se le intenta
-- insertar un `0` **solo si la consulta que busca filas malas encuentra
-- alguna**. Si no encuentra nada, el `INSERT` no inserta ninguna fila y la
-- migración sigue sin enterarse; si encuentra, el `CHECK` revienta y la
-- migración se detiene.
--
-- Las tablas se borran al final de su propio bloque. Si el `CHECK` aborta no
-- llegan a borrarse, pero tampoco quedan: `applyD1Migrations` y
-- `wrangler d1 migrations apply` mandan el archivo como un `batch`, que en D1
-- es una transacción, y la migración entera vuelve atrás.
--
-- ## Medido, y con un hallazgo que no se adivina
--
-- Se fabricó el estado que M-0 vigila sobre una **copia de la base local con
-- sus 54 filas de verdad**: se soltó `modulo_plantilla_no_se_borra` y se borró
-- la plantilla de `clausulas`, dejando 7 módulos sin plantilla. Y se aplicó
-- esta migración por los dos caminos:
--
--   | Corredor                                      | Qué pasó |
--   |-----------------------------------------------|----------|
--   | `wrangler d1 execute --local --file` (D1)     | Aborta en M-0 con `CHECK constraint failed: hay_modulos_cuyo_tipo_no_tiene_plantilla_en_su_bufete`, y la base queda **intacta**: 54 filas, columna `tipo` puesta, sin `plantilla_id`, sin andamios, los 6 disparadores originales. |
--   | `sqlite3 … ".read"`                           | Aborta en M-0 **y sigue**: el `DROP TABLE` se ejecuta igual y quedan 47 filas. Se pierden 7. |
--
-- **La guarda sólo protege dentro de una transacción**, y los dos corredores
-- de D1 lo son; `sqlite3 .read` no, porque ejecuta sentencia por sentencia y
-- cada una confirma sola. No hay nada que se pueda escribir dentro de un
-- archivo de SQL que detenga a un corredor que no vuelve atrás — así que
-- queda dicho acá, que es el único lugar donde quien vaya a aplicar esto a
-- mano lo va a leer: **esta migración se aplica con el corredor de D1, no con
-- `sqlite3 .read`.**
--
-- El consuelo de esa fila mala, y es lo que justifica la segunda
-- verificación: en la corrida de `sqlite3` el segundo `CHECK` **también
-- disparó** —`el_relleno_de_cotizacion_modulo_perdio_o_duplico_filas`— antes
-- del `DROP`. O sea que la pérdida quedó nombrada dos veces y en el registro,
-- en vez de ser 7 filas que nadie cuenta.
--
-- ## Dos verificaciones y ninguna sobra
--
-- La primera mira los datos viejos y la segunda mira el resultado del
-- relleno. Son dos preguntas distintas y la segunda es la que de verdad no se
-- puede omitir:
--
--   1. «¿Hay algún `tipo` sin plantilla en su bufete?» —antes de tocar nada.
--   2. «¿La tabla nueva tiene exactamente las filas que tenía la vieja?»
--      —después del `INSERT` y **antes** del `DROP`.
--
-- La segunda no es la primera dicha de otra forma. La primera razona sobre lo
-- que el relleno *debería* encontrar; la segunda cuenta lo que *encontró*, y
-- atrapa además el caso que la primera no puede ver: un `JOIN` que trae una
-- fila **de más**. Hoy eso no puede pasar, porque
-- `modulo_plantilla_clave_unica` impide dos plantillas con la misma clave en
-- el mismo bufete — pero «hoy no puede pasar» es exactamente lo que se creía
-- de la fila cruzada que `0003:50` encontró, y contar dos números cuesta seis
-- líneas.

-- La consulta es, deliberadamente, **el complemento exacto del `JOIN` de
-- M-2**: mismas tablas, mismas condiciones, incluido el filtro de tenencia en
-- el salto del módulo a la plantilla. Tiene que ser el mismo o no sirve de
-- nada — una verificación previa más floja que el relleno que vigila deja
-- pasar exactamente las filas que el relleno va a perder. Es la misma
-- disciplina que `0011:113` dejó escrita, por el mismo motivo y sobre el
-- mismo riesgo.
--
-- `NOT EXISTS` y no `LEFT JOIN … WHERE p.id IS NULL`: las dos dicen lo mismo
-- y la primera se lee como la pregunta que es.
CREATE TABLE verificacion_previa_plantilla (
  ok INTEGER NOT NULL
     CONSTRAINT hay_modulos_cuyo_tipo_no_tiene_plantilla_en_su_bufete CHECK (ok = 1)
);

INSERT INTO verificacion_previa_plantilla (ok)
SELECT 0 WHERE
  EXISTS (SELECT 1 FROM cotizacion_modulo m
           WHERE NOT EXISTS (SELECT 1 FROM modulo_plantilla p
                              WHERE p.tenant_id = m.tenant_id
                                AND p.clave = m.tipo));

DROP TABLE verificacion_previa_plantilla;

-- ===========================================================================
-- M-1 · La tabla, con la referencia en lugar de la cadena
-- ===========================================================================
--
-- Las otras cinco columnas se copian **letra por letra** de `0004:213`, con
-- sus llaves foráneas incluidas. Lo único que cambia es la cuarta.
--
-- ## `plantilla_id TEXT NOT NULL REFERENCES modulo_plantilla (id)`
--
-- `NOT NULL` y no nullable: un módulo sin plantilla es un módulo sin
-- encabezado, o sea un `<h2>` vacío en la hoja de la cotización. No hay caso
-- legítimo que lo necesite, y dejarlo nullable habría convertido el defecto
-- silencioso que esta migración existe para evitar —perder la clave de una
-- fila— en un estado que la base admite.
--
-- Referencia a `id` y no a `(tenant_id, clave)`, aunque la segunda es la que
-- el relleno usa y la que la aplicación consulta. El motivo es que `clave` es
-- **inmutable por disparador** (`modulo_plantilla_clave_inmutable`, `0016:419`)
-- pero sólo por disparador, mientras que `id` es la llave primaria y cambiarla
-- es cambiar de fila. Una referencia a la clave habría atado la integridad de
-- 54 filas a que ese disparador siga existiendo; atada a `id`, el disparador
-- es defensa en profundidad y no el único piso.
--
-- ## No lleva índice, y hay que decir por qué
--
-- `cotizacion_modulo (plantilla_id)` no existe, al revés de lo que una
-- columna de llave foránea suele llevar. Dos motivos, los dos medidos y no
-- supuestos:
--
--   * **Ninguna consulta va en esa dirección.** El `JOIN` de lectura
--     (`worker/cotizaciones/repositorio.ts`, `leerModulos`) va del módulo a la
--     plantilla por `modulo_plantilla.id`, que es su llave primaria. Nadie
--     pregunta «qué módulos usan esta plantilla».
--   * **No hay `DELETE` que lo necesite.** El índice en la columna hija es lo
--     que evita el barrido completo cuando SQLite verifica un borrado del
--     padre, y acá el borrado del padre **no existe**:
--     `modulo_plantilla_no_se_borra` (`0016:459`) aborta todo `DELETE` sobre
--     la tabla. El escaneo que el índice ahorraría es el de una operación
--     prohibida.
--
-- El día que T-7 haga que una plantilla propia se pueda borrar de verdad —no
-- está en su alcance, y por eso no se adelanta el índice acá— esto se vuelve
-- a mirar. Queda dicho para que sea una decisión y no un olvido.
CREATE TABLE cotizacion_modulo_nueva (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant (id),
  cotizacion_id TEXT NOT NULL REFERENCES cotizacion (id),
  plantilla_id  TEXT NOT NULL REFERENCES modulo_plantilla (id),
  orden         INTEGER NOT NULL,
  contenido     TEXT NOT NULL
);

-- ===========================================================================
-- M-2 · El relleno
-- ===========================================================================
--
-- El `JOIN` lleva `p.tenant_id = m.tenant_id` **y no sólo** `p.clave =
-- m.tipo`. Sin ese término, con dos bufetes que tienen las mismas seis claves
-- —que es el caso, porque las seis son presets— el `JOIN` devolvería dos
-- filas por módulo y cada módulo quedaría atado a una plantilla elegida por
-- el motor. La verificación de M-3 lo atraparía contando; el término hace que
-- no pase.
--
-- `id`, `orden` y `contenido` se copian tal cual. El `orden` **no se
-- recompacta**, por el mismo argumento que `quitarModulo` ya tenía escrito:
-- lo que vale es el orden relativo, el único es por cotización, y renumerar
-- acá cambiaría silenciosamente el documento de 11 cotizaciones para que un
-- número quedara bonito. Los `id` tampoco se renuevan: son los que la
-- bitácora ya nombra.
--
-- ## Lo que hace que este `INSERT` sea posible, y conviene saberlo
--
-- 6 de las 11 cotizaciones están emitidas, y `0006:439` puso tres
-- disparadores para que un módulo no entre, no cambie y no salga de una
-- cotización congelada. **Ninguno de los tres estorba acá**, y no por
-- casualidad: cuelgan de `cotizacion_modulo`, no de
-- `cotizacion_modulo_nueva`, y un disparador es de la tabla que nombra. Esa
-- es la propiedad que hace que la forma «tabla nueva, copia, borrado,
-- renombre» funcione sobre una tabla con guardas, y es también la que la
-- vuelve peligrosa: los disparadores no se re-crean solos, y la única cosa que
-- recuerda que existían es M-4.
--
-- Y el `DROP TABLE` de M-4 **no dispara**
-- `cotizacion_modulo_no_sale_de_una_congelada`: en SQLite un `DROP TABLE` no
-- ejecuta los disparadores de `DELETE` de la tabla que borra. Es la misma
-- propiedad de la que dependen las siete reconstrucciones de `bitacora`, que
-- conviven con `bitacora_no_se_borra` desde `0002`. Se dice acá porque es la
-- diferencia entre esta migración y una que no se puede aplicar, y porque las
-- 54 filas que atraviesan ese `DROP` están en documentos emitidos.
--
-- ## Medido sobre la base local, antes y después
--
-- | Qué se midió                                         | Antes | Después |
-- |------------------------------------------------------|-------|---------|
-- | Filas de `cotizacion_modulo`                         | 54    | **54**  |
-- | Cotizaciones con módulos                             | 11    | **11**  |
-- | Cotizaciones con snapshot (emitidas)                 | 6     | **6**   |
-- | Filas cuya plantilla resuelve en su propio bufete     | —     | **54**  |
-- | Disparadores sobre la tabla                           | 6     | **7**   |
--
-- Y la comparación que de verdad cierra el relleno: el juego de las 54 filas
-- —`id`, `cotizacion_id`, clave resuelta, `orden` y largo del contenido—
-- **idéntico al byte**, mismo SHA-256 antes y después
-- (`9f933d6e…981efb65`). No es que haya 54 filas: son las mismas 54.
INSERT INTO cotizacion_modulo_nueva (id, tenant_id, cotizacion_id, plantilla_id, orden, contenido)
SELECT m.id, m.tenant_id, m.cotizacion_id, p.id, m.orden, m.contenido
  FROM cotizacion_modulo m
  JOIN modulo_plantilla p ON p.tenant_id = m.tenant_id
                         AND p.clave = m.tipo;

-- ===========================================================================
-- M-3 · Contar las dos tablas, todavía con las dos vivas
-- ===========================================================================
--
-- La única ventana en la que esta pregunta se puede contestar es ésta: entre
-- el `INSERT` y el `DROP`. Después, la tabla vieja no existe y el número con
-- el que habría que comparar tampoco.
--
-- `IS NOT` y no `<>`, por la regla de siempre: los dos `count(*)` son enteros
-- y nunca nulos, así que acá las dos formas se comportan igual y el operador
-- sólo mantiene la consistencia. Es el mismo argumento que `0004:500` dejó
-- escrito para sus cinco disparadores de inmutabilidad —la regla es una sola,
-- y escribirla de dos formas según la línea es peor que cualquiera de las
-- dos—.
CREATE TABLE verificacion_del_relleno (
  ok INTEGER NOT NULL
     CONSTRAINT el_relleno_de_cotizacion_modulo_perdio_o_duplico_filas CHECK (ok = 1)
);

INSERT INTO verificacion_del_relleno (ok)
SELECT 0 WHERE (SELECT count(*) FROM cotizacion_modulo_nueva)
            IS NOT (SELECT count(*) FROM cotizacion_modulo);

DROP TABLE verificacion_del_relleno;

-- ===========================================================================
-- M-4 · El cambio, y todo lo que el `DROP TABLE` se lleva
-- ===========================================================================

DROP TABLE cotizacion_modulo;

ALTER TABLE cotizacion_modulo_nueva RENAME TO cotizacion_modulo;

-- ---------------------------------------------------------------------------
-- Lo que el `DROP TABLE` se llevó, recreado de donde vino
-- ---------------------------------------------------------------------------
--
-- | Objeto                                            | Lo escribió |
-- |---------------------------------------------------|-------------|
-- | `cotizacion_modulo_orden_unico` (índice)          | `0004:283`  |
-- | `cotizacion_modulo_tenencia_coherente_al_insertar` | `0004:419`  |
-- | `cotizacion_modulo_tenant_inmutable`              | `0004:548`  |
-- | `cotizacion_modulo_cotizacion_inmutable`          | `0004:562`  |
-- | `cotizacion_modulo_no_entra_en_una_congelada`     | `0006:439`  |
-- | `cotizacion_modulo_no_cambia_en_una_congelada`    | `0006:448`  |
-- | `cotizacion_modulo_no_sale_de_una_congelada`      | `0006:456`  |
--
-- Siete objetos de dos archivos que esta migración no escribió, y **ninguno
-- de los siete nombra `tipo`**. Eso es lo que hace que seis de ellos se
-- copien letra por letra sin pensarlos de nuevo, y es también por lo que
-- perder uno sería invisible: la suite no se pondría roja por el texto de un
-- `WHEN`, se pondría roja por una prueba que cuenta nombres. Esa prueba existe
-- —«`cotizacion_modulo` lleva exactamente sus disparadores», en
-- `test/esquema-cotizaciones.spec.ts:2424`, con la lista **exacta** y no por
-- `toContain`— y es la red de esta sección.
--
-- El que **sí** cambia es el primero, y la sección que sigue es suya.

-- Viene de `0004:283`, y su encabezado explica el costo que se eligió pagar:
-- dos módulos en la posición 3 es una cotización cuyo orden de lectura
-- depende de qué devuelva el motor, y el snapshot congelaría uno de los dos
-- órdenes al azar. A cambio, reordenar no se puede hacer incrementando
-- columnas en su lugar — y `reordenarModulos` ya está escrito con esa
-- disciplina.
CREATE UNIQUE INDEX cotizacion_modulo_orden_unico
  ON cotizacion_modulo (cotizacion_id, orden);

-- ===========================================================================
-- M-5 · La arista nueva: la tabla de siete de `0004:300` pasa a ocho
-- ===========================================================================
--
-- `0004:300` enumeró las aristas que cruzan tablas y tienen que compartir
-- bufete. Eran siete:
--
--   | Tabla               | Referencias que deben compartir tenant        |
--   |---------------------|-----------------------------------------------|
--   | `cotizacion`        | `cliente_id`, `duplicada_de_id`, `creada_por` |
--   | `cotizacion_modulo` | `cotizacion_id`                               |
--   | `cotizacion_linea`  | `cotizacion_id`, `tipo_proceso_id`            |
--
-- **Son ocho**: `cotizacion_modulo` gana `plantilla_id`. (Y `0013` ya había
-- agregado `arancel_renglon_id` a `cotizacion_linea`, así que el inventario
-- vivo es de nueve; acá se cuenta contra la tabla de `0004` porque es la que
-- esta migración reescribe.)
--
-- ## Y la llave foránea **no** alcanza, que es el punto de toda esta sección
--
-- `plantilla_id REFERENCES modulo_plantilla (id)` ya impide apuntar a una
-- fila inexistente. No impide apuntar a la plantilla **del bufete vecino**,
-- que existe. Y aunque lo impidiera, no serviría: `0004:300` lo dejó escrito
-- de una vez para todas —«que la llave foránea también lo rechace no vuelve
-- redundante al disparador: vuelve redundante a la llave foránea, que es la
-- que se puede apagar con un `PRAGMA`»— y `0003:50` ya había medido la
-- consecuencia sobre una base real. Esta es la primera arista de tenencia que
-- este proyecto agrega **sobre una tabla de catálogo compartida**, o sea donde
-- los dos bufetes tienen filas con la misma `clave`: el error de apuntar a la
-- plantilla ajena no es una mano torpe tecleando un UUID, es un `JOIN` al que
-- se le olvidó el `tenant_id`. Por eso la guarda va en la base.
--
-- `IS NOT` y nunca `<>`, y acá es la guarda y no el mensaje: si la plantilla
-- no existe, la subconsulta no devuelve ninguna fila y vale NULL. Con `<>` la
-- comparación evalúa a NULL, el `WHEN` da falso y **el disparador no
-- dispara**; con `IS NOT`, NULL contra un `tenant_id` real es verdadero y
-- aborta, que es lo correcto. Sin eso, el rechazo de una plantilla inexistente
-- queda en manos de la llave foránea — la que el `PRAGMA` apaga.
--
-- La guardia `NEW.plantilla_id IS NOT NULL` va aunque la columna sea
-- `NOT NULL`, por el segundo de los dos motivos que `0004:300` distingue: en
-- SQLite un `BEFORE INSERT` se evalúa **antes** que `NOT NULL`, así que una
-- fila sin plantilla haría saltar primero este disparador y el mensaje diría
-- «tenencia cruzada» cuando el defecto real es una columna ausente. La
-- guardia hace que el disparador se calle y que el error lo reporte quien
-- corresponde.
--
-- El mensaje se copia letra por letra del de `0004`, con su costo asumido:
-- nombra la tabla y la regla, y no cuál de las dos aristas falló.
--
-- ## Las cuatro sondas, con su mensaje exacto
--
-- Corridas a mano sobre una copia de la base local con sus 54 filas de verdad,
-- con un segundo bufete sembrado y su propia plantilla de clave `alcance`
-- —que es el caso que importa, porque las seis son presets—:
--
--   | Sonda                                                   | Resultado |
--   |---------------------------------------------------------|-----------|
--   | `INSERT` apuntando a la plantilla del vecino            | `tenencia cruzada: cotizacion_modulo debe compartir tenant_id con las filas que referencia` |
--   | `INSERT` apuntando a una plantilla inexistente          | el **mismo** mensaje, y es el punto del `IS NOT` |
--   | `UPDATE` moviendo un módulo a la plantilla del vecino   | el mismo mensaje, desde el disparador de `UPDATE` |
--   | `UPDATE` moviéndolo a una plantilla inexistente         | el mismo mensaje |
--
-- Las 54 filas intactas después de las cuatro, y los dos contrapesos al lado:
-- un `INSERT` con la plantilla propia entra y resuelve a su clave (55 filas),
-- y un `UPDATE` a **otra plantilla propia** pasa — que es la operación que
-- `editarModulo` necesita y que un disparador invertido habría congelado.
--
-- **Que la plantilla inexistente dé «tenencia cruzada» y no
-- `FOREIGN KEY constraint failed` es la medición que prueba el operador.** Con
-- `<>` en lugar de `IS NOT`, medido cambiando las dos líneas: el mensaje pasa
-- a ser `FOREIGN KEY constraint failed` en los dos casos de plantilla
-- inexistente —o sea, el rechazo se muda a la llave foránea, la que un
-- `PRAGMA` apaga— y los dos casos del vecino siguen abortando, porque ahí
-- ninguno de los dos lados es nulo. Tres pruebas se ponen rojas y son
-- exactamente esas tres.
CREATE TRIGGER cotizacion_modulo_tenencia_coherente_al_insertar
BEFORE INSERT ON cotizacion_modulo
WHEN NEW.tenant_id IS NOT NULL
 AND ((NEW.cotizacion_id IS NOT NULL
        AND (SELECT tenant_id FROM cotizacion WHERE id = NEW.cotizacion_id) IS NOT NEW.tenant_id)
   OR (NEW.plantilla_id IS NOT NULL
        AND (SELECT tenant_id FROM modulo_plantilla WHERE id = NEW.plantilla_id) IS NOT NEW.tenant_id))
BEGIN
  SELECT RAISE(ABORT, 'tenencia cruzada: cotizacion_modulo debe compartir tenant_id con las filas que referencia');
END;

-- ---------------------------------------------------------------------------
-- Y un disparador que `0004` no tenía: el de `UPDATE`
-- ---------------------------------------------------------------------------
--
-- **Esto es lo único que esta migración agrega al inventario de disparadores,
-- y el motivo es que la ausencia anterior tenía un argumento que esta
-- migración acaba de falsificar.**
--
-- `0004:300` explica con todas las letras por qué `cotizacion_modulo` era la
-- única de las tres tablas sin disparador de tenencia al `UPDATE`:
--
--   > «`cotizacion_modulo` **no lleva** el de `UPDATE` […]: la sección de
--   > inmutabilidad de más abajo vuelve inmutables **las dos únicas columnas
--   > que ese disparador miraría**, `tenant_id` y `cotizacion_id`. Si ninguna
--   > de las dos puede cambiar, la pareja que el `INSERT` ya verificó
--   > coherente sigue siéndolo para siempre y la condición no puede dar
--   > verdadero nunca. Un disparador que no puede disparar no es defensa en
--   > profundidad: es una prueba que nadie puede escribir y un lector que se
--   > confunde.»
--
-- El argumento es correcto y su premisa ya no se cumple. `plantilla_id` es
-- una tercera columna que ese disparador mira, y **es mutable**:
-- `editarModulo` la escribe cada vez que alguien cambia el tipo de un módulo
-- en un borrador, que es una edición corriente y no una excepción. O sea que
-- la condición sí puede dar verdadero, y el camino es concreto:
--
--     UPDATE cotizacion_modulo SET plantilla_id = <la del vecino> WHERE …
--
-- sobre un borrador. Sin este disparador, lo único que lo rechaza es la llave
-- foránea — y la llave foránea no mira el bufete, así que no lo rechaza en
-- absoluto: la plantilla del vecino existe. Es el agujero exacto que `0003`
-- cerró con su familia de catorce.
--
-- La forma es la de `cotizacion_linea_tenencia_coherente_al_actualizar`
-- (`0004:445`), que existe «únicamente por `tipo_proceso_id`» por este mismo
-- motivo: una arista que cruza tablas y es mutable. El paralelo es exacto, y
-- que la columna análoga sea nullable allá y `NOT NULL` acá no cambia nada de
-- la regla.
--
-- ## Y `cotizacion_id` **no** entra en este `WHEN`
--
-- Es la misma decisión que `0004` tomó para `cotizacion_linea`: para que esa
-- cláusula diera verdadero habría que cambiar `cotizacion_id` o `tenant_id`,
-- y las dos siguen inmutables por los dos disparadores de más abajo, que esta
-- migración re-crea sin tocar. Ponerla sería el adorno que `0004` le quitó a
-- `cotizacion_modulo` entero y que `0003` le había quitado a `proceso_etapa`.
--
-- Lo que **no** se pierde al dejarla afuera: `UPDATE cotizacion_modulo SET
-- cotizacion_id = <cualquier otra>` sigue muriendo, y con el mensaje más
-- exacto de los dos — «un módulo no se muda de cotización» en vez de
-- «tenencia cruzada», que además sería falso cuando la otra cotización es del
-- mismo bufete.
--
-- ## Lo que este disparador comparte evento con, y por qué no se prueba el
-- ## mensaje de la carrera
--
-- `cotizacion_modulo_no_cambia_en_una_congelada` también es `BEFORE UPDATE`
-- sobre esta tabla, así que un `UPDATE` que mueva un módulo de una cotización
-- **emitida** a la plantilla del vecino tiene dos disparadores queriendo
-- abortar a la vez, y el orden de disparo entre disparadores del mismo evento
-- **no está definido en SQLite**. La sonda se escribe sobre un borrador, que
-- es donde sólo uno puede hablar. Es la misma disciplina que
-- `test/esquema-cotizaciones.spec.ts:1047` ya dejó escrita para el caso
-- equivalente.
CREATE TRIGGER cotizacion_modulo_tenencia_coherente_al_actualizar
BEFORE UPDATE ON cotizacion_modulo
WHEN NEW.tenant_id IS NOT NULL
 AND (NEW.plantilla_id IS NOT NULL
       AND (SELECT tenant_id FROM modulo_plantilla WHERE id = NEW.plantilla_id) IS NOT NEW.tenant_id)
BEGIN
  SELECT RAISE(ABORT, 'tenencia cruzada: cotizacion_modulo debe compartir tenant_id con las filas que referencia');
END;

-- ===========================================================================
-- M-6 · Los cinco que no cambian una letra
-- ===========================================================================
--
-- Se copian **letra por letra** de sus declaraciones originales. Ninguno
-- nombra `tipo` ni `plantilla_id`, así que no hay nada que decidir acá — y
-- eso es justamente lo que hace que esta sección sea la peligrosa: no hay
-- ninguna decisión que obligue a leerla, y una omisión no se nota mirando el
-- diff. Lo que la nota es la prueba que cuenta los siete nombres.

-- Los dos de inmutabilidad vienen de `0004:548` y `0004:562`. Su encabezado
-- deja dicho que el `IS NOT` acá **no guarda nada y sólo elige el mensaje**
-- —`OLD` nunca es nulo, y `SET <columna> = NULL` muere igual en `NOT NULL`— y
-- que se escribe así por consistencia con los quince de la misma familia. Se
-- copia con ese argumento incluido: ablandarlo acá sería escribir la regla de
-- dos formas según la migración.
CREATE TRIGGER cotizacion_modulo_tenant_inmutable
BEFORE UPDATE ON cotizacion_modulo
WHEN NEW.tenant_id IS NOT OLD.tenant_id
BEGIN
  SELECT RAISE(ABORT, 'columna inmutable: cotizacion_modulo.tenant_id no se reasigna; una fila no cambia de bufete');
END;

CREATE TRIGGER cotizacion_modulo_cotizacion_inmutable
BEFORE UPDATE ON cotizacion_modulo
WHEN NEW.cotizacion_id IS NOT OLD.cotizacion_id
BEGIN
  SELECT RAISE(ABORT, 'columna inmutable: cotizacion_modulo.cotizacion_id no se reasigna; un módulo no se muda de cotización');
END;

-- Los tres de la cotización congelada vienen de `0006:439`, `:448` y `:456`,
-- que son I-4 en la tabla hija: uno por par (tabla, operación). El `EXISTS`
-- es deliberado y no un `IS NOT` sobre una subconsulta, y `0006:400` deja el
-- argumento escrito: con la otra forma, una fila cuyo padre no existe queda
-- **viva e inmodificable**, y una guarda que convierte un dato corrupto en un
-- dato inmortal le quita a quien repara la base la única herramienta que
-- tenía.
--
-- En el del `INSERT`, el `c.estado IS NOT 'borrador'` de adentro compara una
-- columna `NOT NULL` de una fila que existe, así que ahí el operador tampoco
-- guarda nada y sólo mantiene la consistencia. Las tres se escriben igual para
-- que la regla se lea una sola vez.
CREATE TRIGGER cotizacion_modulo_no_entra_en_una_congelada
BEFORE INSERT ON cotizacion_modulo
WHEN NEW.cotizacion_id IS NOT NULL
 AND EXISTS (SELECT 1 FROM cotizacion c
              WHERE c.id = NEW.cotizacion_id AND c.estado IS NOT 'borrador')
BEGIN
  SELECT RAISE(ABORT, 'cotizacion congelada: no se agrega un módulo a una cotización que ya no es borrador');
END;

CREATE TRIGGER cotizacion_modulo_no_cambia_en_una_congelada
BEFORE UPDATE ON cotizacion_modulo
WHEN EXISTS (SELECT 1 FROM cotizacion c
              WHERE c.id = OLD.cotizacion_id AND c.estado IS NOT 'borrador')
BEGIN
  SELECT RAISE(ABORT, 'cotizacion congelada: no se cambia un módulo de una cotización que ya no es borrador');
END;

CREATE TRIGGER cotizacion_modulo_no_sale_de_una_congelada
BEFORE DELETE ON cotizacion_modulo
WHEN EXISTS (SELECT 1 FROM cotizacion c
              WHERE c.id = OLD.cotizacion_id AND c.estado IS NOT 'borrador')
BEGIN
  SELECT RAISE(ABORT, 'cotizacion congelada: no se quita un módulo de una cotización que ya no es borrador');
END;
