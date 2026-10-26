-- El proceso cuelga de la cotización, no de la línea (T-13 de
-- `odd/tasks/cotizaciones.md`).
--
-- `0001` a `0010` ya corrieron y **no se tocan**.
--
-- ## Qué estaba mal, y no era un defecto de código
--
-- `0008` puso `proceso.cotizacion_linea_id`, y con esa columna el sistema
-- **impone desde la estructura** una decisión que es del bufete: que cada
-- línea cotizada sea un expediente. El usuario lo dijo mirando la aplicación
-- andando, y su ejemplo es el argumento entero: constituir una sociedad y
-- registrarla se cotizan aparte porque se tarifan aparte, y para el bufete
-- pueden ser un solo trámite con un paso de más.
--
-- **La línea es una unidad de facturación; el proceso es una unidad de
-- trabajo.** Que se parezcan en el caso mayoritario —una línea, un trámite—
-- no las hace la misma cosa, y una llave foránea que las ata deja al bufete
-- sin manera de decir lo contrario. La arista correcta es la de arriba: el
-- proceso cuelga de la **cotización**, que es lo que el cliente firmó, y
-- cuántos expedientes salgan de ella lo decide quien hace el trabajo.
--
-- Esta migración mueve la arista y nada más. **El comportamiento observable
-- no cambia**: ganar una cotización sigue abriendo exactamente los mismos
-- procesos que abría ayer, uno por cada línea con `tipo_proceso_id`. Que la
-- apertura deje de ser una derivación y pase a ser una propuesta que el
-- bufete confirma es la otra mitad de T-13, y va aparte: mezclar el cambio
-- de modelo con el cambio de flujo dejaría un commit donde no se puede
-- distinguir cuál de los dos rompió qué.
--
-- ## Por qué NO hay reconstrucción de `proceso`, y el hallazgo que lo decide
--
-- Es la misma pregunta cara que `0008` contestó, y acá volvía con una vuelta
-- de tuerca que parecía cerrar el camino. `0005` dejó documentado lo que
-- cuesta una reconstrucción —un `DROP TABLE` se lleva los índices y los
-- disparadores de la tabla, incluidos los que escribió **otra** migración, y
-- hay que recrearlos letra por letra en un archivo que no es el suyo—, y
-- sobre `proceso` hoy eso serían sus tres índices propios y **siete**
-- disparadores: los cinco de `0003` y los dos de `0008`.
--
-- La vuelta de tuerca es ésta: `ALTER TABLE … DROP COLUMN` se niega cuando la
-- columna aparece en un `CHECK` de la tabla, y `cotizacion_linea_id` aparece
-- en uno —`el_origen_y_la_linea_dicen_lo_mismo`, de `0008`—. Parecía
-- condenarnos a reconstruir.
--
-- **No. Y la distinción que lo salva merece quedar escrita, porque no es
-- obvia y la próxima vez va a volver:** ese `CHECK` entró como restricción
-- **de columna**, dentro del `ADD COLUMN` que creó `cotizacion_linea_id`, y
-- una restricción de columna **se va con su columna**. Lo que bloquea el
-- `DROP COLUMN` es un `CHECK` **de tabla** que la nombre, que es otra cosa
-- aunque se escriba con la misma palabra.
--
-- Medido sobre el esquema real migrado, no sobre una reproducción —la regla
-- que `0007` nos dejó después de que una sonda sobre una tabla de dos
-- columnas nos mintiera—: con los siete procesos de la base local, dos de
-- cotización y cinco directos, la secuencia de abajo entra con salida 0 y la
-- DDL resultante de `proceso` queda sin la columna **y sin su restricción**.
-- La tabla nunca se suelta, así que los dos índices ajenos a esta arista y
-- los siete disparadores siguen donde estaban; el único índice que se pierde
-- es el de la arista vieja, y se pierde porque lo borramos a mano.
--
-- ## El orden de los pasos es la guarda, y conviene leerlo antes de moverlo
--
-- Hay dos `CHECK` en juego —el viejo de `0008` y el nuevo de M-5— y los dos
-- obligan a que `origen` y la columna de procedencia digan lo mismo. Eso
-- tiene dos consecuencias que explican por qué esto son nueve pasos y no
-- tres:
--
--   * **Las dos columnas se mueven siempre en la misma sentencia.** Un
--     `UPDATE` que vaciara la línea sin bajar `origen` —o al revés— deja la
--     fila mintiendo en el instante intermedio, y el `CHECK` se evalúa por
--     fila al terminar la sentencia, no al terminar la transacción. Pasa en
--     M-3 y vuelve a pasar en M-6.
--   * **`ADD COLUMN … CHECK` revalida las filas existentes** y aborta la
--     migración si alguna no cumple. `0008` lo midió y lo dejó escrito. Por
--     eso M-5 sólo puede entrar después de que M-3 haya dejado cero filas con
--     `origen = 'cotizacion'`: la columna nueva nace nula en todas, y con una
--     sola fila diciendo todavía «vengo de una cotización» el `ALTER` se
--     caería. El enlace se guarda antes, en M-2, y se devuelve después, en
--     M-6.

-- ===========================================================================
-- M-0 · Antes de nada: que ningún proceso pierda su origen en el camino
-- ===========================================================================
--
-- La forma es la de `0003` y `0008`: una tabla con un `CHECK` imposible de
-- satisfacer y un `INSERT` que sólo mete una fila si la consulta encuentra
-- algo malo. SQLite no deja usar `RAISE` fuera de un disparador, así que una
-- restricción que no se puede cumplir es la única manera que una migración
-- tiene de decir «parate». El nombre de la restricción es el mensaje de
-- error, y por eso es largo: es lo único que el operador va a leer.
--
-- Va **primera**, por el mismo motivo que allá: si algún día el archivo se
-- aplicara sin transacción, abortar antes de tocar nada es la diferencia
-- entre una migración que no entró y media migración puesta.
--
-- ## Y acá hace falta de verdad, no es ceremonia
--
-- La regla que T-1 dejó escrita —la verificación previa hace falta cuando la
-- guarda cae sobre filas que ya podían existir— se cumple, pero lo que la
-- hace imprescindible es más concreto y es propio de esta migración: **el
-- relleno de M-2 resuelve la cotización con un `JOIN`, y un `JOIN` que no
-- encuentra nada no grita, devuelve nada.**
--
-- Un proceso colgado de una línea huérfana —o de una línea cuya cotización no
-- exista, que es una base reparada a mano o una restauración a medias— no
-- traería fila a la tabla de enlace. M-3 lo pasaría a `directo` como a todos
-- los demás, M-6 no lo encontraría para devolverlo, y el proceso terminaría
-- la migración **diciendo que lo abrieron a mano**. Sin error, sin aviso, sin
-- forma de reconstruirlo después: la columna que sabía de dónde venía ya no
-- existe. Eso es lo que esta sección impide.
--
-- La consulta es, deliberadamente, **el complemento exacto del `JOIN` de
-- M-2**: mismas tablas, mismas condiciones, incluido el filtro de tenencia
-- en el salto de la línea a la cotización. Tiene que ser el mismo o no sirve
-- de nada — una verificación previa más floja que el relleno que vigila deja
-- pasar exactamente las filas que el relleno va a perder.
CREATE TABLE verificacion_previa_enlace (
  ok INTEGER NOT NULL
     CONSTRAINT hay_procesos_colgados_de_una_linea_que_no_lleva_a_ninguna_cotizacion CHECK (ok = 1)
);

INSERT INTO verificacion_previa_enlace (ok)
SELECT 0 WHERE
  EXISTS (SELECT 1 FROM proceso p
           WHERE p.cotizacion_linea_id IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM cotizacion_linea l
                               JOIN cotizacion q ON q.id = l.cotizacion_id
                                                AND q.tenant_id = l.tenant_id
                              WHERE l.id = p.cotizacion_linea_id));

DROP TABLE verificacion_previa_enlace;

-- ===========================================================================
-- M-1 · Soltar lo que mira a la columna vieja
-- ===========================================================================
--
-- Los tres disparadores y el índice nombran `cotizacion_linea_id`, y mientras
-- lo nombren el `DROP COLUMN` de M-4 se niega. Se borran acá y se vuelven a
-- escribir en M-8, ya directos.
--
-- Los dos de `proceso` y el de `cotizacion` se van juntos y no de a uno
-- porque son **las dos mitades del mismo invariante**: `0008` argumentó que
-- un invariante que una sentencia sobre la otra tabla puede romper no está en
-- la base, está a medias. Dejarlos desparejos en el medio del archivo sería
-- justamente eso, y aunque el archivo viaje como una transacción, el que lea
-- esto después tiene que ver las dos mitades moverse a la par.
--
-- Los cinco disparadores de `0003` **no se tocan**: ninguno nombra la columna
-- y la tabla nunca se suelta, así que sobreviven sin que este archivo tenga
-- que saber cómo estaban escritos. Es exactamente el costo que la
-- reconstrucción habría cobrado.
DROP TRIGGER proceso_comparte_cliente_con_su_cotizacion_al_insertar;
DROP TRIGGER proceso_comparte_cliente_con_su_cotizacion_al_actualizar;
DROP TRIGGER cotizacion_no_se_lleva_el_cliente_de_sus_procesos;

DROP INDEX proceso_cotizacion_linea;

-- ===========================================================================
-- M-2 · El enlace resuelto, guardado antes de borrar nada
-- ===========================================================================
--
-- La columna vieja sabe de qué línea viene el proceso; la nueva quiere saber
-- de qué cotización. El salto es el `JOIN` de siempre, y hay que darlo
-- **antes** de que la columna vieja desaparezca: después no hay desde dónde.
--
-- Una tabla de andamio y no una subconsulta dentro del `UPDATE` final, porque
-- entre el momento de leer y el de escribir hay un `DROP COLUMN` en el medio.
-- Se borra sola en M-7, igual que la de M-0.
--
-- El filtro de tenencia va en el salto de la línea a la cotización por la
-- misma precaución que el `JOIN` de `0008` argumentaba y que `SELECCION` en
-- `worker/procesos/repositorio.ts` sigue: una línea que cruzara la frontera
-- no debe traer la cotización del bufete vecino, debe **no traer nada**. Acá
-- no traer nada significa que M-0 ya abortó la migración, que es lo que
-- corresponde: ese proceso no se puede mudar sin inventarle un origen.
CREATE TABLE enlace_de_procesos (
  proceso_id TEXT NOT NULL PRIMARY KEY,
  cotizacion_id TEXT NOT NULL
);

INSERT INTO enlace_de_procesos (proceso_id, cotizacion_id)
SELECT p.id, q.id
  FROM proceso p
  JOIN cotizacion_linea l ON l.id = p.cotizacion_linea_id
  JOIN cotizacion q ON q.id = l.cotizacion_id AND q.tenant_id = l.tenant_id
 WHERE p.cotizacion_linea_id IS NOT NULL;

-- ===========================================================================
-- M-3 · Bajar todos los procesos a `directo`, momentáneamente
-- ===========================================================================
--
-- Es el paso que deja a `ADD COLUMN … CHECK` poder entrar en M-5, y las dos
-- columnas se mueven **en la misma sentencia** porque el `CHECK` viejo de
-- `0008` sigue puesto y las obliga a decir lo mismo: vaciar la línea dejando
-- `origen = 'cotizacion'` aborta, y bajar `origen` dejando la línea también.
-- No hay orden de dos sentencias que funcione; hay una sentencia.
--
-- Que esto sea una mentira transitoria —durante tres sentencias los dos
-- procesos de la base local dicen que los abrieron a mano— es tolerable por
-- una sola razón: el archivo viaja como un `batch`, que en D1 es una
-- transacción, tanto por `applyD1Migrations` como por `wrangler d1 migrations
-- apply`. Nadie lee ese estado. El enlace verdadero ya está guardado en M-2 y
-- vuelve en M-6.
UPDATE proceso
   SET origen = 'directo', cotizacion_linea_id = NULL
 WHERE cotizacion_linea_id IS NOT NULL;

-- ===========================================================================
-- M-4 · Soltar la columna vieja
-- ===========================================================================
--
-- Acá es donde el hallazgo del encabezado se cobra: entra sin reconstruir la
-- tabla porque `el_origen_y_la_linea_dicen_lo_mismo` era una restricción **de
-- columna** y se va con ella. La llave foránea hacia `cotizacion_linea` se va
-- por lo mismo.
--
-- Lo que esto le devuelve al bufete, dicho una vez: una línea cotizada vuelve
-- a poder borrarse de un borrador aunque la cotización ya haya abierto
-- trámites. `0008` la había vuelto indeleble como efecto lateral de la
-- arista, y era una consecuencia del modelo equivocado, no una regla que
-- alguien hubiera querido. Lo que sí sigue indeleble es lo que `0006`
-- protege: las líneas de una cotización que salió del borrador, que es la
-- guarda que de verdad existe para eso.
ALTER TABLE proceso DROP COLUMN cotizacion_linea_id;

-- ===========================================================================
-- M-5 · La columna nueva, su llave foránea y la coherencia con `origen`
-- ===========================================================================
--
-- Nullable, y sigue siendo el caso mayoritario: cinco de los siete procesos
-- de la base local se abrieron a mano, sin cotización delante.
--
-- La llave foránea queda en `NO ACTION`, como todas: una cotización que ya
-- abrió procesos no se borra. Es la misma arista que `0008` tenía contra la
-- línea, subida un nivel, y subirla la mejora — lo que no se puede borrar
-- ahora es el documento que el cliente firmó, que es lo que de verdad no debe
-- desaparecer mientras haya trabajo colgando de él.
--
-- El `CHECK` es el de `0008` con la columna cambiada, y su argumento se
-- conserva entero porque no dependía de cuál fuera la columna:
--
--   * `origen = 'cotizacion'` con la cotización en nulo dice «vengo de una
--     cotización» y no sabe de cuál.
--   * `origen = 'directo'` con una cotización dice «me abrieron a mano» y
--     tiene el recibo de lo contrario.
--
-- Va como `CHECK` y no como disparador porque compara **dos columnas de la
-- misma fila**, que es la forma de `el_borrador_no_tiene_snapshot_y_la_
-- emitida_si` en `0004`: un disparador costaría dos declaraciones para decir
-- lo que una expresión dice en una, y las dos podrían separarse.
--
-- El `IS` del medio **elige el mensaje y no guarda nada**, igual que allá y
-- por el mismo motivo medido: ninguno de los dos lados puede dar NULL —
-- `origen` es `NOT NULL`, y `IS NOT NULL` es justamente el operador que nunca
-- devuelve NULL—. Se escribe `IS` igual, porque la regla del proyecto es una
-- sola y el día que alguien copie esta línea a una tabla donde una de las dos
-- mitades sí pueda ser NULL, el `=` dejaría pasar la fila incoherente sin que
-- nada avise.
--
-- Y entra sin abortar justamente porque M-3 dejó cero filas con
-- `origen = 'cotizacion'`. Si alguien mueve este `ALTER` más arriba, la
-- migración se cae con «CHECK constraint failed» a secas —sin nombrar la
-- restricción, lo midió `0008`— sobre una base que ya tiene la columna vieja
-- vacía. Eso es el orden siendo la guarda.
ALTER TABLE proceso ADD COLUMN cotizacion_id TEXT
  REFERENCES cotizacion (id)
  CONSTRAINT el_origen_y_la_cotizacion_dicen_lo_mismo
  CHECK ((origen = 'cotizacion') IS (cotizacion_id IS NOT NULL));

-- ===========================================================================
-- M-6 · Devolverle su origen a los que lo tenían
-- ===========================================================================
--
-- Las dos columnas se mueven en la misma sentencia por el mismo motivo que en
-- M-3, ahora contra el `CHECK` nuevo: escribir `cotizacion_id` dejando
-- `origen = 'directo'` aborta, y subir `origen` dejando la cotización en nulo
-- también.
--
-- El `WHERE` recorta por la tabla de enlace y no por `origen`, que después de
-- M-3 no distingue nada: los siete procesos dicen `directo` y sólo
-- `enlace_de_procesos` sabe cuáles dos mentían.
UPDATE proceso
   SET origen = 'cotizacion',
       cotizacion_id = (SELECT e.cotizacion_id FROM enlace_de_procesos e
                         WHERE e.proceso_id = proceso.id)
 WHERE id IN (SELECT e.proceso_id FROM enlace_de_procesos e);

-- ===========================================================================
-- M-7 · Levantar el andamio y poner el índice
-- ===========================================================================
--
-- La tabla de enlace se borra en el mismo archivo que la creó, igual que la
-- de M-0: una tabla de andamio viva en producción es exactamente la clase de
-- resto que nadie se anima a borrar seis meses después.
--
-- «¿Qué procesos abrió esta cotización?» es la pregunta que la pantalla de
-- una ganada hace, y la que el disparador de M-8 hace en cada cambio de
-- cliente. Sin el índice las dos recorren `proceso` entera. Es el mismo
-- índice que `0008` tenía sobre la columna vieja, con el nombre corrido a la
-- columna nueva.
DROP TABLE enlace_de_procesos;

CREATE INDEX proceso_cotizacion ON proceso (cotizacion_id);

-- ===========================================================================
-- M-8 · I-3, ahora directo, que era el punto de la tarea
-- ===========================================================================
--
-- `docs/diseno.md` §5. El invariante no cambió —un proceso nacido de una
-- cotización tiene el mismo cliente que ella— pero **el camino para
-- comprobarlo sí**, y eso es lo que T-13 vino a arreglar. `0008` tenía que
-- dar dos saltos, de la línea a la cotización y de ahí al cliente, porque la
-- tabla guardaba la línea. Ahora es un salto. La regla que estaba escrita de
-- través ahora se lee de frente, y un invariante que se lee de frente es uno
-- que el próximo no va a malinterpretar.
--
-- Siguen siendo tres disparadores y no uno, y las razones son las de `0008`
-- sin una coma de cambio:
--
--   * **`INSERT` y `UPDATE` sobre `proceso` son escrituras distintas y cada
--     una tiene su agujero propio.** Sin el de `UPDATE`, un proceso nace bien
--     y después se muda de cliente con una sentencia; `proceso.cliente_id` es
--     mutable.
--   * **El tercero vigila el otro lado de la arista.** `UPDATE cotizacion SET
--     cliente_id = …` sobre una cotización que ya abrió procesos los deja
--     apuntando a un cliente que ya no es el suyo, y los dos primeros no se
--     enteran porque sólo corren cuando se escribe `proceso`.
--
-- Por qué disparador y no `CHECK`, al revés que M-5: un `CHECK` no puede
-- consultar otra tabla.
--
-- ## La guarda de nulo va primero, y hace falta de verdad
--
-- `NEW.cotizacion_id IS NOT NULL` es lo que deja pasar al proceso abierto a
-- mano, que es el caso mayoritario. Sin ella la subconsulta devolvería NULL,
-- `IS NOT NEW.cliente_id` daría verdadero y **ningún proceso directo podría
-- abrirse**.
--
-- ## `IS NOT` contra la subconsulta, y acá sigue siendo la guarda
--
-- La distinción que `0005`, `0006` y `0008` fueron asentando: el mismo
-- `IS NOT` es la guarda sobre algo que puede ser nulo y apenas el mensaje
-- sobre una columna `NOT NULL`. Ésta es del primer tipo, y el motivo
-- sobrevive al cambio de arista aunque ahora sea **un** salto y no dos: la
-- subconsulta devuelve NULL cuando la cotización no existe —una base reparada
-- a mano, una restauración a medias—, y `NULL IS NOT 'c1'` da verdadero y la
-- fila se rechaza. Con `<>` evaluaría a NULL, el `WHEN` daría falso y el
-- proceso entraría colgado de una cotización fantasma, con el rechazo en
-- manos de una llave foránea que un `PRAGMA` apaga.
--
-- Lo que el salto de menos sí se lleva es un modo de falla: ya no existe el
-- caso «la línea existe pero su cotización no». Quedaba uno de los dos, y es
-- el que la prueba por rechazo mata.
--
-- ## El filtro de tenencia se conserva, y **no es una guarda**. Medido.
--
-- `0008` lo escribía en el `JOIN` con la precaución de siempre: una
-- cotización que cruzara la frontera no debe traer el cliente del bufete
-- vecino, debe no traer nada. Se conserva por esa misma razón de forma, pero
-- la regla del proyecto obliga a decir qué prueba muere al quitarlo, y la
-- respuesta es **ninguna**.
--
-- Se midió con la mutación: borrado `AND q.tenant_id = NEW.tenant_id` de los
-- dos disparadores, las 191 pruebas de `test/esquema-cotizaciones.spec.ts`
-- siguen verdes, la del proceso del vecino incluida. El motivo es que la
-- comparación de abajo ya rechaza ese caso por su cuenta: la subconsulta sin
-- filtro encuentra la cotización de acá, devuelve **nuestro** cliente, y
-- `nuestro IS NOT el del vecino` aborta igual, con el mismo mensaje.
--
-- Y la fila donde el filtro sería la única guarda **no se puede construir**:
-- haría falta un proceso del bufete B cuyo `cliente_id` fuera el cliente de
-- una cotización del bufete A, y eso lo impiden `proceso_tenencia_coherente_
-- al_insertar` de `0003` y `cotizacion_tenencia_coherente_al_insertar` de
-- `0004`, que atan cada fila al tenant de su cliente — un cliente tiene un
-- solo tenant. Sobre datos coherentes la cláusula es inalcanzable.
--
-- Queda escrita igual, con el mismo criterio con el que `0008` dejó el `IS`
-- de su `CHECK` siendo apenas el mensaje: la defensa vale contra una base ya
-- corrompida, donde esas dos guardas de tenencia ya fallaron. Lo que no vale
-- es llamarla guarda. Es la misma distinción que la tajada viene asentando
-- desde `0005`, aplicada esta vez a una cláusula entera y no a un operador.

CREATE TRIGGER proceso_comparte_cliente_con_su_cotizacion_al_insertar
BEFORE INSERT ON proceso
WHEN NEW.cotizacion_id IS NOT NULL
 AND (SELECT q.cliente_id FROM cotizacion q
       WHERE q.id = NEW.cotizacion_id AND q.tenant_id = NEW.tenant_id)
     IS NOT NEW.cliente_id
BEGIN
  SELECT RAISE(ABORT, 'I-3: el proceso nacido de una cotización comparte cliente con ella');
END;

CREATE TRIGGER proceso_comparte_cliente_con_su_cotizacion_al_actualizar
BEFORE UPDATE ON proceso
WHEN NEW.cotizacion_id IS NOT NULL
 AND (SELECT q.cliente_id FROM cotizacion q
       WHERE q.id = NEW.cotizacion_id AND q.tenant_id = NEW.tenant_id)
     IS NOT NEW.cliente_id
BEGIN
  SELECT RAISE(ABORT, 'I-3: el proceso nacido de una cotización comparte cliente con ella');
END;

-- El tercero pierde el `JOIN` por la línea y se queda con el `EXISTS` sobre
-- `proceso` directo, que era el objeto de la tarea: antes había que ir de la
-- cotización a sus líneas y de ahí a los procesos de cada una.
--
-- El recorte `NEW.cliente_id IS NOT OLD.cliente_id` se conserva con su
-- argumento: sin él, todo `UPDATE` sobre una cotización con procesos —ganar
-- incluido, que escribe la fila entera— pagaría el recorrido del `EXISTS`. Y
-- la condición de adentro compara contra el cliente **nuevo**, no contra el
-- viejo: lo que se prohíbe no es mover el cliente, es dejar procesos que no
-- lo acompañen. Mover los dos a la vez, el día que alguien escriba esa
-- operación, pasa por donde debe.
--
-- `EXISTS` y no una subconsulta comparada, al revés que los dos de arriba:
-- acá la pregunta es «¿hay alguno que quede desalineado?» sobre un conjunto,
-- no «¿el padre de esta fila es el correcto?» sobre una fila. El `IS NOT` se
-- conserva adentro, comparando la columna, que es donde la regla del proyecto
-- lo pide.
CREATE TRIGGER cotizacion_no_se_lleva_el_cliente_de_sus_procesos
BEFORE UPDATE ON cotizacion
WHEN NEW.cliente_id IS NOT OLD.cliente_id
 AND EXISTS (SELECT 1 FROM proceso p
              WHERE p.cotizacion_id = OLD.id AND p.cliente_id IS NOT NEW.cliente_id)
BEGIN
  SELECT RAISE(ABORT, 'I-3: no se le cambia el cliente a una cotización que ya abrió procesos');
END;
