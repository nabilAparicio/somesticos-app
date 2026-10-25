-- La arista que faltaba entre las dos mitades del sistema: un proceso puede
-- haber nacido de la línea de una cotización (T-7 de
-- `odd/tasks/cotizaciones.md`).
--
-- `0001` a `0007` ya corrieron y **no se tocan**.
--
-- ## El encargo que `0001` dejó escrito, y que se cumple acá
--
-- `migrations/0001_esquema_inicial.sql`, en su sección «Qué NO está acá y por
-- qué», difirió dos cosas a esta tajada con todas las letras:
--
--   * «`proceso.cotizacion_linea_id` tampoco: apuntaría a `cotizacion_linea`,
--     que no existe todavía. La columna y su llave foránea entran en la
--     tajada 2, junto con la tabla a la que apuntan.»
--   * «I-3 (el proceso nacido de una cotización comparte cliente con ella) no
--     es expresable sin `cotizacion`. Se implementa y se prueba en la
--     tajada 2.»
--
-- `cotizacion_linea` existe desde `0004`. Las dos deudas se pagan en este
-- archivo, y el límite que las vigilaba —la prueba de `test/esquema.spec.ts`
-- que exigía que la columna **no** existiera— cambia de pregunta en vez de
-- borrarse: ahora exige que exista y que apunte adonde debe.
--
-- ## Por qué NO hay reconstrucción de `proceso`
--
-- Era la pregunta cara de esta migración, porque `0005` dejó documentado lo
-- que cuesta una reconstrucción: un `DROP TABLE` se lleva los índices y los
-- disparadores de la tabla, incluidos los que escribió **otra** migración, y
-- hay que recrearlos letra por letra en un archivo que no es el suyo. Sobre
-- `proceso` eso serían dos índices y los cinco disparadores de `0003`
-- —`proceso_tenencia_coherente_al_insertar`, el de `UPDATE`,
-- `proceso_tenant_inmutable` y los dos de coherencia de cierre—.
--
-- No hace falta. Se midió sobre las siete migraciones reales aplicadas, no
-- sobre una reproducción: SQLite admite `ALTER TABLE … ADD COLUMN` con una
-- cláusula `REFERENCES` siempre que el valor por defecto de la columna sea
-- NULL, que es justo el que queremos —un proceso abierto a mano no viene de
-- ninguna línea—. Con `PRAGMA foreign_keys = ON` entra igual. La tabla no se
-- toca, así que **ningún disparador ni índice se pierde**.
--
-- La regla, por si al próximo le sirve: lo que `ADD COLUMN` **no** admite es
-- una columna `PRIMARY KEY` o `UNIQUE`, una `NOT NULL` sin valor por defecto
-- no nulo, un `DEFAULT` que sea una expresión, y una `REFERENCES` con un
-- valor por defecto distinto de NULL. Un `CHECK`, en cambio, sí entra — y lo
-- que eso implica es la sección siguiente.
--
-- ## Y por qué sí hay verificación previa, al revés que en `0004`
--
-- T-1 de esta tajada dejó la regla: **la verificación previa hace falta
-- cuando la guarda cae sobre filas que ya podían existir, nunca cuando la
-- tabla y su guarda nacen juntas.** Acá las dos mitades de esa regla se
-- cumplen a la vez, cada una sobre una guarda distinta, y conviene decirlo
-- porque es la distinción fina que la regla pedía:
--
--   * **El `CHECK` de M-1 la necesita.** Cae sobre `proceso`, que nace en
--     `0001` y lleva filas desde entonces, y una de ellas puede tener
--     `origen = 'cotizacion'` — el `CHECK` de esa columna lo admite desde el
--     primer día aunque ninguna ruta lo escriba. Con la columna nueva en
--     nulo, esa fila pasa a mentir.
--   * **Los disparadores de M-2 y M-3 no la necesitan.** Su condición exige
--     `cotizacion_linea_id` no nulo, y la columna **nace nula en todas las
--     filas**: no existe la fila vieja que pueda violarlos. Una verificación
--     previa ahí sería una consulta que no puede encontrar nada.
--
-- Hay además un motivo que decide, y es el mismo que `0003` argumentó: se
-- midió que `ALTER TABLE … ADD COLUMN … CHECK (…)` **sí revalida las filas
-- existentes** y aborta la migración si alguna no cumple, pero lo hace con
-- `CHECK constraint failed` **a secas, sin el nombre de la restricción**. O
-- sea que sin esta sección la migración se detendría igual, y el operador
-- vería un mensaje que no nombra ni la tabla ni la regla. La tabla temporal
-- con el `CONSTRAINT` nombrado existe exactamente para eso: el nombre es el
-- mensaje de error.
--
-- ## Lo que esta migración NO trae, y por qué
--
--   * **Un disparador de tenencia para la arista nueva.** Sería la segunda
--     guarda del mismo hecho, y dos guardas que resuelven lo mismo se anulan
--     como garantía. El argumento, medido: si el proceso comparte cliente con
--     la cotización (M-2), es *el mismo cliente*;
--     `proceso_tenencia_coherente_al_insertar` de `0003` ata el tenant del
--     proceso al de ese cliente y `cotizacion_tenencia_coherente_al_insertar`
--     de `0004` ata el de la cotización al mismo, así que los dos tenants son
--     el mismo por construcción. Verificado por rechazo: con M-2 puesto y sin
--     ningún disparador de tenencia nuevo, un proceso del bufete vecino
--     apuntando a una línea de acá aborta con el mensaje de I-3.
--   * **Una guarda que exija que la cotización esté `ganada`.** Es una regla
--     distinta de I-3 y no le toca a esta tarea inventarla; además, atarla al
--     orden de las sentencias dentro del `batch` de ganar haría que la base
--     dependiera de cómo el código ordena su escritura.
--   * **Nada de R5.** `cuota` y `movimiento_gasto` siguen sin existir.

-- ===========================================================================
-- M-0 · Antes de nada: que la base no tenga ya procesos que dicen mentira
-- ===========================================================================
--
-- La forma es la de `0003`: una tabla con un `CHECK` imposible de satisfacer
-- y un `INSERT` que sólo mete una fila si la consulta encuentra algo malo.
-- SQLite no deja usar `RAISE` fuera de un disparador, así que una restricción
-- que no se puede cumplir es la única manera que una migración tiene de
-- decir «parate».
--
-- Va **primera**, por el mismo motivo que allá: si algún día el archivo se
-- aplicara sin transacción, abortar antes de crear nada es la diferencia
-- entre una migración que no entró y media migración puesta.
--
-- La consulta busca lo único que puede estar mal: un proceso que declara
-- venir de una cotización. Después del `ADD COLUMN` su `cotizacion_linea_id`
-- sería nulo, y el `CHECK` de M-1 lo rechazaría. No se busca el caso espejo
-- —una línea sin origen— porque la columna todavía no existe y ninguna fila
-- puede tenerla.
CREATE TABLE verificacion_previa_origen (
  ok INTEGER NOT NULL
     CONSTRAINT la_base_ya_tiene_procesos_que_dicen_venir_de_una_cotizacion CHECK (ok = 1)
);

INSERT INTO verificacion_previa_origen (ok)
SELECT 0 WHERE
  EXISTS (SELECT 1 FROM proceso WHERE origen = 'cotizacion');

DROP TABLE verificacion_previa_origen;

-- ===========================================================================
-- M-1 · La columna, su llave foránea y la coherencia con `origen`
-- ===========================================================================
--
-- Nullable, y es el caso mayoritario: la mitad de los procesos del bufete se
-- abren a mano, sin cotización delante. `0004` ya lo había anticipado al
-- declarar `cotizacion_linea.tipo_proceso_id` nullable, «una línea sin tipo
-- de proceso es un cobro que no abre trámite».
--
-- La llave foránea queda en `NO ACTION`, como todas: borrar una línea que ya
-- abrió un proceso no se puede, y eso es lo que se busca. Es una arista más
-- de las que hacen indeleble a una cotización que salió — las de `0006`
-- impedían tocar las líneas de una congelada, y ésta agrega que tampoco se
-- borra una línea que tiene un trámite colgado.
--
-- ## El `CHECK`: `origen` y la línea dicen lo mismo, o la fila miente
--
-- `origen` existe desde `0001` con `('cotizacion', 'directo')` y hasta hoy
-- no tenía con qué contrastarse: cualquiera de los dos valores era creíble
-- porque no había otra columna que lo contradijera. Con la arista puesta sí
-- la hay, y las dos combinaciones incoherentes son filas que mienten:
--
--   * `origen = 'cotizacion'` con la línea en nulo dice «vengo de una
--     cotización» y no sabe de cuál.
--   * `origen = 'directo'` con una línea dice «me abrieron a mano» y tiene
--     el recibo de lo contrario.
--
-- Va como `CHECK` y no como disparador, al revés que M-2 y M-3, y la
-- diferencia no es de gusto: esto compara **dos columnas de la misma fila**,
-- que es exactamente la forma de
-- `el_borrador_no_tiene_snapshot_y_la_emitida_si` en `0004`. Un disparador
-- costaría dos declaraciones —`INSERT` y `UPDATE`— para decir lo que una
-- expresión dice en una, y las dos podrían separarse.
--
-- ## El `IS` del medio: acá elige el mensaje, no guarda nada. Medido.
--
-- La primera versión de este comentario decía que el `IS` era load-bearing
-- «porque `cotizacion_linea_id` es nullable». **Es falso, y la mutación lo
-- demostró**: cambiarlo por `=` no mata ninguna prueba. El motivo es que
-- ninguno de los dos lados puede dar NULL. `origen` es `NOT NULL`, así que
-- `origen = 'cotizacion'` vale 0 o 1; y `cotizacion_linea_id IS NOT NULL`
-- vale 0 o 1 **siempre**, justamente porque `IS NOT NULL` es el operador que
-- nunca devuelve NULL. Que la columna sea nullable no hace nullable a la
-- expresión que pregunta si lo es.
--
-- Se escribe `IS` igual, y por el mismo argumento que `0004` dejó para
-- `el_borrador_no_tiene_snapshot_y_la_emitida_si`, que es literalmente esta
-- misma forma: la regla del proyecto es una sola, y la distancia entre «no
-- se puede escribir la prueba» y «la regla es correcta» es donde se esconden
-- los defectos. El día que alguien copie esta línea a una tabla donde una de
-- las dos mitades sí pueda ser NULL, el `=` dejaría pasar la fila
-- incoherente sin que nada avise.
--
-- Queda dicho con la distinción que `0005` y `0006` ya habían asentado: el
-- mismo operador es **la guarda** en los disparadores de M-2 —ahí la
-- subconsulta sí devuelve NULL y hay una prueba que lo mata— y apenas **el
-- mensaje** acá. Cuál de las dos cosas es depende de la expresión y no de la
-- regla.
--
-- `origen = 'cotizacion'` se escribe con `=` por lo mismo: es la comparación
-- de una columna `NOT NULL` contra un literal, no contra una subconsulta.
ALTER TABLE proceso ADD COLUMN cotizacion_linea_id TEXT
  REFERENCES cotizacion_linea (id)
  CONSTRAINT el_origen_y_la_linea_dicen_lo_mismo
  CHECK ((origen = 'cotizacion') IS (cotizacion_linea_id IS NOT NULL));

-- «¿Qué procesos abrió esta cotización?» es la pregunta que la pantalla de
-- una ganada va a hacer, y la que M-3 hace en cada cambio de cliente. Sin el
-- índice las dos recorren `proceso` entera.
CREATE INDEX proceso_cotizacion_linea ON proceso (cotizacion_linea_id);

-- ===========================================================================
-- M-2 · I-3 · El proceso nacido de una cotización comparte cliente con ella
-- ===========================================================================
--
-- `docs/diseno.md` §5. Es el invariante que `0001` no pudo escribir y la
-- restricción 1 de la tajada: **vive en la base, como disparador, no como
-- validación de aplicación.** Si viviera sólo en el código, el primer script
-- de importación mete un proceso del cliente equivocado colgado de una
-- cotización, y eso no se nota hasta que alguien factura.
--
-- Por qué disparador y no `CHECK`, al revés que M-1: un `CHECK` no puede
-- consultar otra tabla, y esto compara el cliente del proceso contra el de
-- la cotización a la que pertenece su línea. Son dos saltos.
--
-- ## Son dos y no uno, y no son dos guardas del mismo hecho
--
-- `INSERT` y `UPDATE` son escrituras distintas y cada una tiene su agujero
-- propio: sin el de `UPDATE`, un proceso nace bien y después se muda de
-- cliente con una sentencia. Es la misma economía de `0003` y `0004`, donde
-- la familia de tenencia lleva las dos salvo cuando la segunda no puede
-- evaluarse nunca. Acá sí puede: `proceso.cliente_id` es mutable.
--
-- ## La guarda de nulo va primero, y hace falta de verdad
--
-- `NEW.cotizacion_linea_id IS NOT NULL` es lo que deja pasar al proceso
-- abierto a mano, que es el caso mayoritario. Sin ella, la subconsulta
-- devolvería NULL, `IS NOT NEW.cliente_id` daría verdadero y **ningún
-- proceso directo podría abrirse**.
--
-- ## `IS NOT` contra la subconsulta, y acá es la guarda y no el mensaje
--
-- `0005` y `0006` dejaron escrita la distinción: el mismo `IS NOT` es la
-- guarda sobre algo que puede ser nulo y apenas el mensaje sobre una columna
-- `NOT NULL`. Ésta es del primer tipo, y por partida doble. La subconsulta
-- devuelve NULL cuando la línea no existe, o cuando existe pero su
-- cotización no —una base reparada a mano, una restauración a medias—, y en
-- los dos casos `NULL IS NOT 'c1'` da verdadero y la fila se rechaza. Con
-- `<>` evaluaría a NULL, el `WHEN` daría falso y el proceso entraría colgado
-- de una línea fantasma, con el rechazo en manos de una llave foránea que un
-- `PRAGMA` apaga.
--
-- Se escribe como subconsulta comparada y no como `EXISTS`, al revés que las
-- seis de `0006`, y la diferencia es la que aquella migración argumentó: allá
-- el problema era un `DELETE` sobre una fila huérfana, donde abortar
-- convertía un dato corrupto en un dato inmortal. Acá no hay `DELETE` y el
-- padre ausente **sí** tiene que abortar: un proceso que dice venir de una
-- línea que no existe es exactamente la fila que este disparador no debe
-- dejar nacer.
--
-- El `JOIN` repite el filtro de tenencia en su `ON` por la misma precaución
-- que `SELECCION` en `worker/procesos/repositorio.ts`: una línea que cruzara
-- la frontera no debe traer el cliente del bufete vecino, debe no traer
-- nada — y no traer nada acá significa rechazar.

CREATE TRIGGER proceso_comparte_cliente_con_su_cotizacion_al_insertar
BEFORE INSERT ON proceso
WHEN NEW.cotizacion_linea_id IS NOT NULL
 AND (SELECT q.cliente_id FROM cotizacion_linea l
        JOIN cotizacion q ON q.id = l.cotizacion_id AND q.tenant_id = l.tenant_id
       WHERE l.id = NEW.cotizacion_linea_id) IS NOT NEW.cliente_id
BEGIN
  SELECT RAISE(ABORT, 'I-3: el proceso nacido de una cotización comparte cliente con ella');
END;

CREATE TRIGGER proceso_comparte_cliente_con_su_cotizacion_al_actualizar
BEFORE UPDATE ON proceso
WHEN NEW.cotizacion_linea_id IS NOT NULL
 AND (SELECT q.cliente_id FROM cotizacion_linea l
        JOIN cotizacion q ON q.id = l.cotizacion_id AND q.tenant_id = l.tenant_id
       WHERE l.id = NEW.cotizacion_linea_id) IS NOT NEW.cliente_id
BEGIN
  SELECT RAISE(ABORT, 'I-3: el proceso nacido de una cotización comparte cliente con ella');
END;

-- ===========================================================================
-- M-3 · I-3 también se puede romper desde el otro lado de la arista
-- ===========================================================================
--
-- Los dos disparadores de M-2 vigilan las escrituras sobre `proceso`. Un
-- invariante que una sentencia sobre la **otra** tabla puede romper no está
-- en la base: está a medias.
--
-- El agujero está medido y es concreto: `UPDATE cotizacion SET cliente_id = …`
-- sobre una cotización que ya abrió procesos los deja apuntando a un cliente
-- que ya no es el suyo, sin que M-2 se entere — M-2 sólo corre cuando se
-- escribe `proceso`.
--
-- ## Por qué no es redundante con `cotizacion_emitida_no_se_edita`
--
-- Ésa es la pregunta que había que contestar antes de escribir una línea,
-- porque aquel disparador de `0006` ya vigila `cliente_id` entre sus nueve
-- columnas. **Se midieron las combinaciones**, que es lo que la tajada
-- aprendió a hacer después de encontrar cuatro veces dos guardas tapando el
-- mismo hecho:
--
-- | Estado de la cotización | `cotizacion_emitida_no_se_edita` | Esta guarda |
-- |-------------------------|----------------------------------|-------------|
-- | `borrador`              | **no corre** (su `WHEN` lo excluye) | corre      |
-- | emitida, ganada, perdida | corre                            | corre       |
--
-- O sea que hay exactamente una fila donde esta guarda es la única: el
-- **borrador** con procesos colgados. Quitando este disparador, ese `UPDATE`
-- entra — medido—, y con él puesto aborta. Por eso su prueba tiene que usar
-- un borrador: sobre cualquier otro estado la mataría el disparador de
-- `0006` y no estaría probando nada.
--
-- Que un proceso cuelgue de la línea de un borrador no es un estado que la
-- API sepa producir —`ganar` es la única puerta, y para entonces la
-- cotización es `ganada`—. Se cierra igual, por la razón de siempre: los
-- invariantes viven en la base porque la base también la escriben las
-- importaciones y la consola de D1.
--
-- ## El recorte del `WHEN`
--
-- `NEW.cliente_id IS NOT OLD.cliente_id` primero: sin él, todo `UPDATE` sobre
-- una cotización con procesos —ganar incluido, que escribe la fila entera—
-- pagaría el recorrido del `EXISTS`. Y la condición de adentro compara
-- contra el cliente **nuevo**, no contra el viejo: lo que se prohíbe no es
-- mover el cliente, es dejar procesos que no lo acompañen. Mover los dos a la
-- vez, el día que alguien escriba esa operación, pasa por donde debe.
--
-- `EXISTS` y no una subconsulta comparada, al revés que M-2: acá la pregunta
-- es «¿hay alguno que quede desalineado?» sobre un conjunto, no «¿el padre
-- de esta fila es el correcto?» sobre una fila. El `IS NOT` se conserva
-- adentro, comparando la columna, que es donde la regla del proyecto lo pide.

CREATE TRIGGER cotizacion_no_se_lleva_el_cliente_de_sus_procesos
BEFORE UPDATE ON cotizacion
WHEN NEW.cliente_id IS NOT OLD.cliente_id
 AND EXISTS (SELECT 1 FROM proceso p
               JOIN cotizacion_linea l ON l.id = p.cotizacion_linea_id
              WHERE l.cotizacion_id = OLD.id AND p.cliente_id IS NOT NEW.cliente_id)
BEGIN
  SELECT RAISE(ABORT, 'I-3: no se le cambia el cliente a una cotización que ya abrió procesos');
END;
