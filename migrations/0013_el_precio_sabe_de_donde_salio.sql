-- La línea sabe de dónde salió su precio (T-1 de
-- `odd/tasks/precios-en-la-cotizacion.md`).
--
-- Fuente de verdad: el documento de la tajada —«la decisión que define la
-- forma»: **el sistema pone el precio**— y `docs/diseno.md` §5 (los
-- invariantes viven en la base, no en la buena intención) y §8 (la IA rellena
-- campos tipados y el sistema hace la aritmética).
--
-- `0001` a `0012` ya corrieron y **no se tocan**.
--
-- ## El problema que esta columna cierra
--
-- `0012` dejó el catálogo construido —453 renglones del Acuerdo No 49 de 2001
-- y una columna `monto` que es el precio del bufete— y **nadie lo consume**.
-- Una línea de cotización guarda su monto y nada más, así que dentro de un año
-- no hay forma de saber si esos B/.1,800 salieron del precio que el bufete
-- fijó para un servicio o del dedo de alguien a las once de la noche.
--
-- ## Dos columnas, dos trabajos, y ninguna reemplaza a la otra
--
-- | Columna              | Para qué sirve                                      |
-- |----------------------|-----------------------------------------------------|
-- | `tipo_proceso_id`    | Qué proceso se abre si la cotización se gana (T-7). |
-- | `arancel_renglon_id` | De dónde salió el precio.                           |
--
-- Es la pregunta que esta migración tiene que contestar primero, porque las
-- dos columnas son nullable, apuntan a un catálogo y cuelgan de la misma
-- fila: parecen la misma cosa escrita dos veces. No lo son, y el caso que lo
-- demuestra es corriente en las dos direcciones. Un renglón del arancel
-- —«Visitantes Temporales (por persona)»— **no es** un `tipo_proceso`: el
-- bufete tarifa servicios que no abren trámite —una consulta, un estudio de
-- título— y abre trámites que no están en el acuerdo. Y una línea puede
-- llevar las dos: el precio sale del catálogo y el trámite se abre al ganar.
-- Fusionarlas obligaría a elegir cuál de los dos trabajos se pierde.
--
-- ## Lo que esta migración NO trae
--
--   * **Ningún relleno de la columna nueva.** Y no es que no se pudo: no hay
--     nada que rellenar, medido y no supuesto. El catálogo nació en `0012`,
--     que es **posterior a todas** las líneas que existen, y los 453
--     renglones tienen `monto` en nulo —ningún bufete fijó un precio
--     todavía—. O sea que no hay una sola línea viva de la que se pueda decir
--     de qué renglón salió su monto, y escribir un `UPDATE … SET
--     arancel_renglon_id = (SELECT …)` que adivinara por el texto del
--     concepto sería **fabricar procedencia**, que es lo contrario de lo que
--     la columna existe para guardar. Las líneas de hoy se quedan en nulo, y
--     el nulo dice la verdad: nadie sabe de dónde salió ese precio.
--   * **Ninguna ruta que escriba la columna.** T-2 abre el prellenado en el
--     editor de líneas y T-3 el camino de la IA. Hoy lo único que la escribe
--     es SQL directo, y es a propósito que la guarda de más abajo esté puesta
--     **antes** que el primer escritor: una guarda que llega después del
--     camino que tenía que vigilar llega a limpiar, no a impedir.
--   * **Ninguna comparación con `monto_oficial`.** La regla de la tajada
--     anterior no se renegocia: el monto oficial es una cita y el monto del
--     bufete es lo que el bufete cobra; nada en el sistema los compara ni
--     avisa. Acá eso es estructura por omisión — esta migración no escribe una
--     sola línea que lea `monto_oficial`.
--   * **Ninguna guarda que impida borrarle el precio a un renglón que una
--     línea ya nombra.** `fijarMonto(tenant, id, null)` existe y es legítimo
--     —el bufete puede dejar de tarifar un servicio—, y después de eso una
--     línea viva queda apuntando a un renglón sin precio. **No es un agujero
--     en lo que la tajada promete y conviene decir por qué:** el documento
--     emitido no se mueve, porque el snapshot ya congeló el concepto y el
--     monto; y la línea viva sigue teniendo su monto, que es `NOT NULL`. Lo
--     único observable es que una escritura posterior sobre esa línea
--     —editarla, o duplicar la cotización— se niega en la guarda de abajo. Es
--     la dirección correcta para un invariante de programa, y el día que el
--     bufete necesite otra cosa, esa decisión es de la tarea que abra el
--     camino de escritura, no de esta.
--   * **Ninguna reconstrucción de `bitacora`.** No nace ninguna entidad: el
--     hecho sigue siendo de la cotización —`linea_editada`, que está en el
--     vocabulario desde `0005`— y una línea de cotización ya está cubierta.
--     Esta migración no toca esa tabla ni su `CHECK`.
--
-- ## Agregar una columna no es editar una cotización congelada
--
-- Vale decirlo porque es la primera pregunta que se hace quien lee `0006`:
-- los seis disparadores de la congelación están sobre `INSERT`, `UPDATE` y
-- `DELETE` **de filas**, y `ALTER TABLE … ADD COLUMN` es DDL — no escribe
-- ninguna fila y no dispara nada. Las líneas de las cotizaciones ya emitidas
-- reciben la columna en nulo sin que ninguna guarda se evalúe, y después de
-- eso siguen siendo intocables: `cotizacion_linea_no_cambia_en_una_congelada`
-- aborta cualquier `UPDATE` sobre ellas, columna nueva incluida. Verificado
-- con una prueba de rechazo en `test/arancel-linea.spec.ts`, en vez de
-- supuesto a partir de la forma del `WHEN`.

-- ===========================================================================
-- M-1 · `cotizacion_linea.arancel_renglon_id`
-- ===========================================================================
--
-- Nullable y **sin `DEFAULT`**, que acá no es una preferencia de estilo: con
-- las llaves foráneas encendidas, SQLite sólo acepta un `ADD COLUMN` con
-- cláusula `REFERENCES` si su valor por omisión es NULL. La ausencia de
-- `DEFAULT` es exactamente ese NULL, y poner `DEFAULT NULL` escrito diría lo
-- mismo con una palabra que invita a cambiarla por otra.
--
-- Nullable también por el dato: una línea con monto libre —una consulta, una
-- mensajería, un cobro que no corresponde a ningún servicio tarifado— es el
-- caso corriente y no la excepción, igual que `tipo_proceso_id`.
--
-- `NO ACTION` por omisión, como todo el esquema: un renglón que una línea
-- nombra no se puede borrar. Eso ya era cierto antes de esta columna
-- —`arancel_renglon_no_se_borra` aborta todo `DELETE`, y la salida es
-- `activo = 0`— así que la llave no agrega una prohibición nueva; agrega la
-- que sigue valiendo el día que alguien tire ese disparador.
ALTER TABLE cotizacion_linea ADD COLUMN arancel_renglon_id TEXT REFERENCES arancel_renglon (id);

-- ===========================================================================
-- M-2 · La arista nueva también comparte tenant (I-8)
-- ===========================================================================
--
-- `0004` dejó escrito el deber con todas las letras: «una tabla nueva sin su
-- disparador es exactamente el agujero que esa migración cerró». Vale igual
-- para una **arista** nueva. Sin esto, `UPDATE cotizacion_linea SET
-- arancel_renglon_id = <un renglón del vecino>` pasaría, y la pantalla de una
-- cotización leería el concepto del bufete de al lado — o, peor, el precio del
-- vecino viajaría al prompt de la IA el día que T-3 lo lleve.
--
-- Son las dos operaciones, y por la razón que `0004` argumenta para
-- `tipo_proceso_id`: la columna es **mutable** mientras la cotización sea
-- borrador —cambiar de qué servicio salió un precio es una edición legítima—,
-- así que el disparador de `UPDATE` tiene algo real que vigilar. `cotizacion_`
-- `id` sigue fuera del `WHEN` de `UPDATE` por lo mismo que allá: es inmutable
-- y la cláusula sería código muerto.
--
-- ## El costo: SQLite no tiene `ALTER TRIGGER`
--
-- Ampliar el `WHEN` de un disparador cuesta borrarlo y volver a escribirlo, y
-- eso se paga **a la vista**, igual que las seis reconstrucciones de
-- `bitacora`. Los dos se copian letra por letra desde `0004` y lo único que
-- cambia es la cláusula nueva; el `IS NOT` se copia también, con el argumento
-- de aquel archivo intacto: si la fila padre no existe la subconsulta vale
-- NULL, y con `<>` el `WHEN` daría falso y el disparador no dispararía.
--
-- Es más barato que la reconstrucción de una tabla —un `DROP TRIGGER` se lleva
-- el disparador y nada más: ni índices, ni filas, ni otras guardas— pero la
-- forma de fallar es la misma y la peor: **dejar caído lo que se borró**. La
-- red que lo atrapa ya existe y no hubo que escribirla: la prueba
-- «`cotizacion_linea` lleva exactamente sus disparadores» de
-- `test/esquema-cotizaciones.spec.ts` compara la lista contra `sqlite_master`
-- de forma exacta, así que un `DROP` sin su `CREATE` se pone rojo acá y no en
-- producción.

DROP TRIGGER cotizacion_linea_tenencia_coherente_al_insertar;

CREATE TRIGGER cotizacion_linea_tenencia_coherente_al_insertar
BEFORE INSERT ON cotizacion_linea
WHEN NEW.tenant_id IS NOT NULL
 AND ((NEW.cotizacion_id IS NOT NULL
        AND (SELECT tenant_id FROM cotizacion WHERE id = NEW.cotizacion_id) IS NOT NEW.tenant_id)
   OR (NEW.tipo_proceso_id IS NOT NULL
        AND (SELECT tenant_id FROM tipo_proceso WHERE id = NEW.tipo_proceso_id) IS NOT NEW.tenant_id)
   OR (NEW.arancel_renglon_id IS NOT NULL
        AND (SELECT tenant_id FROM arancel_renglon WHERE id = NEW.arancel_renglon_id) IS NOT NEW.tenant_id))
BEGIN
  SELECT RAISE(ABORT, 'tenencia cruzada: cotizacion_linea debe compartir tenant_id con las filas que referencia');
END;

DROP TRIGGER cotizacion_linea_tenencia_coherente_al_actualizar;

-- Sólo las dos columnas mutables que cruzan tablas. Ver arriba: la cláusula
-- de `cotizacion_id` sería código muerto, porque esa columna es inmutable.
CREATE TRIGGER cotizacion_linea_tenencia_coherente_al_actualizar
BEFORE UPDATE ON cotizacion_linea
WHEN NEW.tenant_id IS NOT NULL
 AND ((NEW.tipo_proceso_id IS NOT NULL
        AND (SELECT tenant_id FROM tipo_proceso WHERE id = NEW.tipo_proceso_id) IS NOT NEW.tenant_id)
   OR (NEW.arancel_renglon_id IS NOT NULL
        AND (SELECT tenant_id FROM arancel_renglon WHERE id = NEW.arancel_renglon_id) IS NOT NEW.tenant_id))
BEGIN
  SELECT RAISE(ABORT, 'tenencia cruzada: cotizacion_linea debe compartir tenant_id con las filas que referencia');
END;

-- ---------------------------------------------------------------------------
-- El precio de recrear: dos disparadores más, y por qué no es ceremonia
-- ---------------------------------------------------------------------------
--
-- **Recrear un disparador lo manda a la cabeza del orden de disparo**, y eso
-- cambia qué mensaje recibe una escritura que viola dos reglas a la vez.
-- Medido, no supuesto: con sólo las dos recreaciones de arriba, la prueba
-- «`cotizacion_linea` rechaza mudarse, aun con su cotización repuntada» de
-- `test/esquema-cotizaciones.spec.ts` —un `UPDATE` que cambia `tenant_id` **y**
-- `cotizacion_id` de un solo saque— pasó de morir con «columna inmutable» a
-- morir con «tenencia cruzada». SQLite encola cada disparador nuevo al frente
-- de la lista de su tabla, así que el último creado es el primero que corre.
--
-- Y el mensaje que se perdía es justo el que `0004` eligió a conciencia. Su
-- comentario lo dice con todas las letras: «sigue muriendo, y con el mensaje
-- más exacto de los dos — "una línea no se muda de cotización" en vez de
-- "tenencia cruzada", que además sería falso cuando la otra cotización es del
-- mismo bufete». Dejarlo roto habría sido cambiar una decisión ajena sin
-- decirlo, y «arreglar» la prueba para que acepte los dos mensajes habría sido
-- aflojar la única red que lo mide.
--
-- Así que los dos disparadores de inmutabilidad de `cotizacion_linea` se
-- recrean **letra por letra** desde `0004`, después de los de tenencia, para
-- devolverles la precedencia que tenían. No se toca ninguno de los tres de
-- `0006`: pasan a correr después de estos cuatro, y eso no cambia ningún
-- mensaje observable —sus condiciones no se solapan con éstas sobre ninguna
-- escritura que el sistema produzca—, lo cual queda medido por la suite
-- entera y no afirmado acá.
--
-- Lo que esta sección deja escrito para quien agregue la próxima arista: en
-- SQLite el orden de disparo es **oficialmente indefinido**, así que esto no
-- es una garantía sino la conservación de una conducta observada. La red que
-- la vigila es la prueba nombrada arriba, y es la que hay que mirar cuando
-- este archivo tenga un hermano.

DROP TRIGGER cotizacion_linea_tenant_inmutable;

CREATE TRIGGER cotizacion_linea_tenant_inmutable
BEFORE UPDATE ON cotizacion_linea
WHEN NEW.tenant_id IS NOT OLD.tenant_id
BEGIN
  SELECT RAISE(ABORT, 'columna inmutable: cotizacion_linea.tenant_id no se reasigna; una fila no cambia de bufete');
END;

DROP TRIGGER cotizacion_linea_cotizacion_inmutable;

CREATE TRIGGER cotizacion_linea_cotizacion_inmutable
BEFORE UPDATE ON cotizacion_linea
WHEN NEW.cotizacion_id IS NOT OLD.cotizacion_id
BEGIN
  SELECT RAISE(ABORT, 'columna inmutable: cotizacion_linea.cotizacion_id no se reasigna; una línea no se muda de cotización');
END;

-- ===========================================================================
-- M-3 · El origen de un precio tiene precio
-- ===========================================================================
--
-- La regla, en una línea: *una línea sólo puede decir que su precio salió de
-- un renglón que tiene precio del bufete*.
--
-- La tarea pide dos cosas que resultan ser **una**, y conviene mostrar el
-- paso porque de ahí sale la forma del disparador:
--
--   1. «Una línea que nombra un renglón **sin precio del bufete** es un error
--      de programa, no un caso: el catálogo ofrece lo tarifado.»
--   2. «Un **`rubro`** nunca puede ser el origen de un precio: la base ya lo
--      prohíbe en su tabla y acá tampoco se acepta.»
--
-- (2) está contenida en (1) **por construcción y no por casualidad**:
-- `un_rubro_no_lleva_precio`, en `0012`, hace imposible que una fila de clase
-- `rubro` tenga `monto`. O sea que «el renglón tiene precio» ya excluye a los
-- 74 encabezados del acuerdo, siempre, sin nombrarlos.
--
-- ## Por qué es **un** disparador por operación y no dos
--
-- Un segundo disparador que dijera «un rubro no puede ser el origen» sería la
-- segunda guarda para el mismo hecho, que es el defecto que este esquema lleva
-- cuatro migraciones negándose a crear: **neutralizar cualquiera de las dos
-- dejaría a la otra atrapando el caso, y ninguna prueba se pondría roja.**
-- Está medido y no supuesto —`test/arancel-linea.spec.ts` prueba el rubro y el
-- renglón sin tarifar por separado, y los dos mueren en esta guarda—.
--
-- El costo se paga en el mensaje: el rechazo de un rubro y el de un renglón
-- sin tarifar dicen lo mismo. Se asume a cambio de que la regla sea
-- verificable, y el `RAISE` nombra las dos mitades para que quien lo pise
-- sepa en cuál cayó. Es el reparto contrario al que `0012` eligió para sus dos
-- `CHECK` de clase, y la diferencia es exactamente que allá los dos hechos son
-- independientes —una pantalla que ofreció un campo de monto a un título y una
-- siembra que trajo un renglón mal clasificado— y acá uno implica al otro.
--
-- ## Por qué un disparador y no un `CHECK`
--
-- No hay elección: la condición mira **otra tabla**, y un `CHECK` de SQLite no
-- puede contener una subconsulta —la declaración se rechaza al crearla—. El
-- disparador es además el patrón de la casa para esto, y la casa ya argumentó
-- por qué la regla no puede vivir en un `if`: `docs/diseno.md` §5 dice que una
-- regla que sólo vive en el código es la que el primer script de importación se
-- salta, y esta columna **va a** recibir escrituras en lote — la propuesta de
-- la IA de T-3 escribe todas las líneas de una cotización de un saque.
--
-- ## `EXISTS` y no `NOT EXISTS`, y es la decisión que más cuesta ver
--
-- La forma natural sería «el renglón tiene que existir y tener monto», o sea
-- `NOT EXISTS (… AND r.monto IS NOT NULL)`. **Está mal**, por el mismo
-- razonamiento que `0006` dejó escrito para sus seis guardas de congelación:
-- esa forma tiene una rama que no se quiso. Con un identificador que **no
-- apunta a ninguna fila**, `NOT EXISTS` da verdadero y el rechazo saldría como
-- «origen del precio» cuando el defecto real es una llave que no apunta a
-- nada. El mensaje mandaría a buscar un precio que falta en vez de una fila
-- que falta.
--
-- `EXISTS (… AND r.monto IS NULL)` dispara **sólo cuando la fila existe y no
-- tiene precio**, que es el hecho que esta guarda vigila. El renglón
-- inexistente y el del bufete vecino quedan en manos de quien ya los atrapa:
-- el disparador de tenencia de M-2 —cuya subconsulta vale NULL sin fila padre,
-- y por eso aborta— y la llave foránea detrás de él. Las dos rutas tienen
-- prueba propia en `test/arancel-linea.spec.ts`, y esa prueba es justamente la
-- que se pondría roja si alguien «simplificara» esto a `NOT EXISTS`.
--
-- El filtro por `tenant_id` **no va** adentro de este `EXISTS`, y es la otra
-- mitad del mismo reparto: con él, un renglón ajeno moriría acá además de en
-- M-2, y entonces ninguna de las dos guardas sería verificable. Acá se
-- pregunta una sola cosa —si la fila tiene precio— y la frontera entre bufetes
-- la vigila el disparador que existe para eso.
--
-- ## Lo que esta guarda no mira: `activo`
--
-- Un renglón desactivado **sí** puede ser el origen de un precio, y es
-- deliberado. `activo = 0` es el retiro de una cita del acuerdo, no la
-- ausencia de un precio: la línea que se escribió cuando el servicio estaba
-- vigente sigue teniendo su procedencia, y el documento ya emitido no se mueve.
-- Si un renglón retirado puede volver a **elegirse** es una pregunta del
-- selector, y el selector es T-2. Hoy, además, ninguna ruta escribe esa
-- columna (`0012` lo dice y sigue siendo cierto), así que una cláusula acá
-- sería una regla sin forma de llegar a importar.
--
-- ## Las dos operaciones, y por qué el `DELETE` no está
--
-- `INSERT` y `UPDATE`: la columna es mutable mientras la cotización sea
-- borrador, así que sin la mitad de `UPDATE` la guarda se saltaría en dos
-- escrituras —una línea limpia y después un `SET arancel_renglon_id = …`—.
-- No hay disparador de `DELETE` por lo mismo que en `0003` y `0004`: borrar
-- una fila no puede crear la incoherencia que esto prohíbe.

CREATE TRIGGER cotizacion_linea_el_origen_del_precio_tiene_precio_al_insertar
BEFORE INSERT ON cotizacion_linea
WHEN NEW.arancel_renglon_id IS NOT NULL
 AND EXISTS (SELECT 1 FROM arancel_renglon r
              WHERE r.id = NEW.arancel_renglon_id AND r.monto IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'origen del precio: una línea sólo puede salir de un renglón con monto del bufete, y un rubro nunca lo tiene');
END;

CREATE TRIGGER cotizacion_linea_el_origen_del_precio_tiene_precio_al_actualizar
BEFORE UPDATE ON cotizacion_linea
WHEN NEW.arancel_renglon_id IS NOT NULL
 AND EXISTS (SELECT 1 FROM arancel_renglon r
              WHERE r.id = NEW.arancel_renglon_id AND r.monto IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'origen del precio: una línea sólo puede salir de un renglón con monto del bufete, y un rubro nunca lo tiene');
END;
