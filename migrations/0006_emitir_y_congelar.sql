-- Emitir y congelar: I-4 e I-5 en la base, y el vocabulario del ciclo de
-- vida (T-4, unidad A, de `odd/tasks/cotizaciones.md`).
--
-- Fuente de verdad: `docs/diseno.md` §5 (invariantes **I-4** e **I-5**) y §8
-- («El ciclo de vida»).
--
-- `0001` a `0005` ya corrieron y **no se tocan**. Esta migración trae dos
-- cosas que no se pueden separar, y por eso viajan en el mismo archivo:
--
--   1. **El vocabulario del ciclo de vida**, que obliga a reconstruir
--      `bitacora` por segunda vez.
--   2. **Las ocho guardas de congelación**: I-4 —una emitida no se edita— e
--      I-5 —el snapshot se escribe una vez y no se reescribe—, que `0004`
--      dejó nombradas y pendientes con todas las letras.
--
-- Van juntas porque emitir es **una sola escritura**: el `UPDATE` que pone
-- `estado` y `snapshot` viaja en el mismo `batch` que su entrada de bitácora
-- —`worker/db/base.ts` no permite otra cosa— y esa entrada necesita un verbo
-- que hoy el `CHECK` de `accion` no admite. Una migración sin el verbo deja
-- la guarda sin camino que guardar; una sin las guardas deja el verbo
-- escribiendo sobre un documento que todavía se puede editar.
--
-- ## Lo que esta migración NO trae
--
--   * **Ninguna tabla, ningún índice y ninguna columna nuevos.** `snapshot`
--     existe desde `0004`, nullable y con su `CHECK` de coherencia contra
--     `estado`. Lo único que le faltaba a la base era impedir que se
--     reescriba y que el documento siga siendo editable debajo de él.
--   * **La máquina de estados completa.** `emitida → ganada` y
--     `emitida → perdida` son de T-5, y qué transiciones son legítimas lo
--     decide esa tarea. Acá no se escribe ninguna guarda de transición, y la
--     sección «Por qué no hay guarda de transición» de más abajo explica por
--     qué la única que T-4 podría decidir ya está cerrada sin escribirla.
--   * **El ciclo de la cadena de duplicación**, que `0004` dejó abierto a
--     propósito y que T-5 cierra.
--   * **Un disparador de `DELETE` sobre `cotizacion`.** No hace falta, y la
--     sección «Una cotización emitida es indeleble» de M-4 explica por qué:
--     el efecto ya sale de las guardas que esta migración sí escribe.

-- ===========================================================================
-- M-1 · La bitácora, reconstruida para los verbos del ciclo de vida
-- ===========================================================================
--
-- `0005` reconstruyó esta tabla hace un commit para los cuatro verbos de las
-- líneas, y le toca de nuevo: SQLite no tiene `ALTER TABLE … ADD CONSTRAINT`,
-- así que ampliar un `CHECK` sigue costando tabla nueva, copia, borrado y
-- renombre, y el `DROP TABLE` sigue llevándose el índice y los tres
-- disparadores que cuelgan de ella.
--
-- ## Por qué la reconstrucción se lleva también los verbos de T-5
--
-- T-4 necesita **uno** —`emitido`—. T-5 necesita **tres** más —`ganado`,
-- `perdido` y `duplicado`—. Con una reconstrucción por tarea, la misma tabla
-- se copiaría dos veces en dos commits seguidos para agregar cuatro cadenas.
--
-- Los tres de T-5 **no son especulación**: están escritos en el plan de la
-- tajada, en la tarea que sigue a ésta —«T-5 · Ganada, perdida, duplicada»— y
-- en el ciclo de vida de `docs/diseno.md` §8, que es el mismo dibujo del que
-- sale `emitido`. La línea se traza ahí y no más allá: los verbos de R5 —los
-- gastos reales, el plan de pagos— **no entran**, porque esas tareas están
-- bloqueadas por decisiones abiertas y ni siquiera se sabe todavía qué
-- entidad los va a llevar.
--
-- Y se verificó que se puede antes de aceptarlo, que es lo que lo distingue
-- de una corazonada. La red `AccionesSinDuenio` de
-- `worker/bitacora/vocabulario.ts` exige que **todo verbo tenga dueño**, no
-- que tenga quien lo emita: un verbo atribuido a `cotizacion` y todavía sin
-- sitio que lo escriba compila. Lo que sí exige una entrada por verbo es el
-- `Record<AccionDeBitacora, string>` de `src/bitacora.ts`, y los cuatro la
-- tienen. Si la red hubiera sido «todo verbo tiene emisor», esto no se podía
-- y había que reconstruir una vez por tarea; no es el caso, y queda medido.
--
-- ## El costo, pagado a la vista otra vez
--
-- Los cuatro objetos que cuelgan de `bitacora` se recrean acá, **letra por
-- letra**, y el comentario de cada uno dice de dónde vino:
--
-- | Objeto                                    | Lo escribió |
-- |-------------------------------------------|-------------|
-- | `bitacora_entidad` (índice)               | `0002`      |
-- | `bitacora_no_se_actualiza`                | `0002`      |
-- | `bitacora_no_se_borra`                    | `0002`      |
-- | `bitacora_tenencia_coherente_al_insertar` | `0003`      |
--
-- Esto ya no es una novedad: `0005` lo hizo primero y escribió por qué no
-- deja una nota en `0003`. Lo que sí es nuevo es que la mudanza ahora pasa
-- por **dos** archivos intermedios, y eso no afloja la vigilancia porque la
-- prueba que la sostiene no compara contra el archivo anterior sino contra
-- las **declaraciones originales**: «los disparadores de la bitácora son los
-- mismos que escribieron 0002 y 0003», en `test/bitacora-api.spec.ts`, lee
-- `0002` y `0003` de `TEST_MIGRATIONS` y los compara, normalizados, contra
-- `sqlite_master`. Una reconstrucción que ablande un `RAISE`, cambie un
-- `WHEN` o escriba `<>` donde iba `IS NOT` se pone roja, venga de `0005`, de
-- ésta o de la séptima. Verificado después de esta migración, no supuesto.
--
-- ## El `CHECK` de `entidad` no se toca
--
-- Emitir, ganar, perder y duplicar son hechos **de la cotización**, que ya es
-- una entidad registrada desde `0005`. No nace ninguna entidad nueva.

CREATE TABLE bitacora_nueva (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenant (id),
  entidad     TEXT NOT NULL CHECK (entidad IN ('area', 'cliente', 'cotizacion', 'proceso', 'tipo_cliente', 'tipo_proceso')),
  entidad_id  TEXT NOT NULL,
  accion      TEXT NOT NULL CHECK (accion IN ('borrado', 'cerrado', 'creado', 'dado_de_baja', 'duplicado', 'editado', 'emitido', 'etapa_alcanzada', 'ganado', 'linea_agregada', 'linea_editada', 'linea_quitada', 'lineas_reordenadas', 'modulo_agregado', 'modulo_editado', 'modulo_quitado', 'modulos_reordenados', 'nota_agregada', 'pendiente_abierto', 'pendiente_cerrado', 'perdido', 'plan_editado', 'plantilla_editada', 'plantilla_guardada', 'reabierto', 'reactivado')),
  usuario_id  TEXT NOT NULL REFERENCES usuario (id),
  ocurrido_en TEXT NOT NULL CHECK (ocurrido_en IS strftime('%Y-%m-%dT%H:%M:%fZ', ocurrido_en)),
  detalle     TEXT
);

-- Las filas se **copian** y no se descartan, por el mismo argumento de `0002`
-- que `0005` ya repitió: un registro de auditoría no empieza borrando
-- evidencia, y como el vocabulario nuevo es un superconjunto del viejo,
-- ninguna fila existente puede violar el `CHECK` ampliado.
INSERT INTO bitacora_nueva (id, tenant_id, entidad, entidad_id, accion, usuario_id, ocurrido_en, detalle)
SELECT id, tenant_id, entidad, entidad_id, accion, usuario_id, ocurrido_en, detalle FROM bitacora;

DROP TABLE bitacora;

ALTER TABLE bitacora_nueva RENAME TO bitacora;

-- ---------------------------------------------------------------------------
-- Lo que el `DROP TABLE` se llevó, recreado de donde vino
-- ---------------------------------------------------------------------------

-- Viene de `0002`, que lo heredó de T-2: es la consulta de las dos pantallas
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
--
-- `bitacora` no lleva disparador de `UPDATE` ni de `DELETE` de tenencia, y
-- tampoco los llevaba antes: `bitacora_no_se_actualiza` y
-- `bitacora_no_se_borra` abortan las dos escrituras sin condición, así que
-- cualquier otro sería código que no puede llegar a evaluarse.
CREATE TRIGGER bitacora_tenencia_coherente_al_insertar
BEFORE INSERT ON bitacora
WHEN NEW.tenant_id IS NOT NULL
 AND ((NEW.usuario_id IS NOT NULL
        AND (SELECT tenant_id FROM usuario WHERE id = NEW.usuario_id) IS NOT NEW.tenant_id))
BEGIN
  SELECT RAISE(ABORT, 'tenencia cruzada: bitacora debe compartir tenant_id con las filas que referencia');
END;

-- ===========================================================================
-- M-2 · I-4 · Una cotización emitida no se edita
-- ===========================================================================
--
-- `docs/diseno.md` §5: «Una cotización emitida no se edita. Solo en borrador
-- se edita; después se duplica.» Hasta hoy eso lo sostenía sólo la
-- aplicación —`SOBRE_UN_BORRADOR` en `worker/cotizaciones/repositorio.ts`— y
-- §5 abre diciendo exactamente por qué no alcanza: «si viven solo en el
-- código, el primer script de importación mete un huérfano».
--
-- ## La forma: contenido y estado son dos cosas distintas
--
-- La lectura literal —«una emitida no cambia nunca»— **es falsa y rompería
-- la tarea siguiente**: `emitida → ganada` y `emitida → perdida` son
-- transiciones legítimas del ciclo de vida de §8, y las escribe T-5 con un
-- `UPDATE` sobre esta misma tabla. Un disparador que abortara toda
-- actualización de una emitida dejaría el ciclo de vida sin su segunda
-- mitad.
--
-- Entonces la guarda compara **columna por columna**, y la regla se dice en
-- una línea: *de una cotización que ya no es borrador puede cambiar su
-- estado, y nada más de lo que el cliente leyó*.
--
-- Las columnas se parten en tres grupos y cada una está en exactamente uno:
--
--  1. **El contenido, que se congela.** `id`, `cliente_id`, `codigo`,
--     `fecha`, `vence_en`, `moneda`, `duplicada_de_id`, `creada_por` y
--     `creada_en`. Son las nueve que este disparador vigila. Que `codigo` o
--     `creada_por` no sean «contenido» en el sentido de la prosa no las deja
--     afuera: son lo que el documento dice de sí mismo, y cambiarlas después
--     de mandarlo es reescribir un papel que ya salió.
--  2. **El ciclo de vida, que sigue vivo.** `estado` y `snapshot`. `estado`
--     es lo que T-5 mueve; `snapshot` tiene su propia regla, I-5, en M-3.
--     **Están afuera de este `WHEN` a propósito**, y no por olvido.
--  3. **`tenant_id`, que ya tiene dueño.** `cotizacion_tenant_inmutable`, de
--     `0004`, la vuelve inmutable en **todos** los estados, que es más fuerte
--     que lo que esta guarda pediría. Meterla acá sería una segunda guarda
--     para el mismo hecho, y entonces ninguna de las dos sería verificable:
--     neutralizar cualquiera de las dos dejaría a la otra atrapando el caso y
--     ninguna prueba se pondría roja. Se mide por combinaciones y se deja
--     una, que es lo que T-3 B aprendió a los golpes.
--
-- ## `IS NOT` y nunca `<>`, y acá **sí** está cubierto
--
-- Dos de las nueve columnas son nullable —`vence_en` y `duplicada_de_id`— y
-- ahí el operador **es** la guarda, no el mensaje: con `<>`, un
-- `UPDATE … SET vence_en = NULL` sobre una emitida da una comparación NULL,
-- el `WHEN` da falso y **la escritura pasa**. Una cotización emitida que
-- pierde su vencimiento es un documento congelado que cambió. Esto es lo
-- contrario de los cinco disparadores de inmutabilidad de `0004`, donde el
-- operador sólo elegía el mensaje y por eso se dejó sin cobertura: acá hay
-- una prueba por cada una de las dos columnas nullable, y matan la mutación.
--
-- `OLD.estado IS NOT 'borrador'` es el otro caso, el de siempre: `estado` es
-- `NOT NULL` y `OLD` sale de una fila guardada, así que `<>` se comportaría
-- igual. Se escribe `IS NOT` por el mismo argumento de consistencia que
-- `0004` dejó escrito para sus quince: la regla es una sola y escribirla de
-- dos formas según la línea es peor que cualquiera de las dos.
--
-- ## Por qué no hay guarda de transición
--
-- La única transición que T-4 podría prohibir por su cuenta es la vuelta
-- atrás, `emitida → borrador`: descongelar. **Ya está cerrada sin escribir
-- nada**, por dos reglas que existen y que se combinan:
--
--   * `UPDATE … SET estado = 'borrador'` a secas muere en el `CHECK`
--     `el_borrador_no_tiene_snapshot_y_la_emitida_si` de `0004` —un borrador
--     con snapshot es incoherente—.
--   * `UPDATE … SET estado = 'borrador', snapshot = NULL` muere en M-3, que
--     es justo lo que hace que su `IS NOT` sea load-bearing.
--
-- Los dos caminos están probados por rechazo. Un tercer disparador que
-- dijera lo mismo sería la tercera guarda para el mismo hecho, y volvería no
-- verificables a las otras dos.

CREATE TRIGGER cotizacion_emitida_no_se_edita
BEFORE UPDATE ON cotizacion
WHEN OLD.estado IS NOT 'borrador'
 AND (NEW.id IS NOT OLD.id
   OR NEW.cliente_id IS NOT OLD.cliente_id
   OR NEW.codigo IS NOT OLD.codigo
   OR NEW.fecha IS NOT OLD.fecha
   OR NEW.vence_en IS NOT OLD.vence_en
   OR NEW.moneda IS NOT OLD.moneda
   OR NEW.duplicada_de_id IS NOT OLD.duplicada_de_id
   OR NEW.creada_por IS NOT OLD.creada_por
   OR NEW.creada_en IS NOT OLD.creada_en)
BEGIN
  SELECT RAISE(ABORT, 'cotizacion congelada: una cotización que ya no es borrador no se edita; hay que duplicarla');
END;

-- ===========================================================================
-- M-3 · I-5 · El snapshot se escribe una vez y no se reescribe jamás
-- ===========================================================================
--
-- `docs/diseno.md` §5 y §8: «Cualquier escritura posterior que difiera es un
-- error, no una actualización. Eso es "que la guarde para siempre"».
--
-- La guarda tiene dos mitades y las dos hacen falta:
--
--   * `OLD.snapshot IS NOT NULL` es lo que deja pasar **la** escritura: la
--     que lo pone por primera vez, cuando la cotización todavía era un
--     borrador y la columna estaba en nulo. Sin esta mitad no se podría
--     emitir nada.
--   * `NEW.snapshot IS NOT OLD.snapshot` es lo que lo congela después.
--
-- **No lleva excepción por igualdad**, al revés de lo que podría parecer:
-- `IS NOT` ya deja pasar el `UPDATE` que reescribe el mismo texto, y eso es
-- deliberado y distinto de `bitacora_no_se_actualiza`, que aborta sin
-- condición. La diferencia está en cómo se escribe cada tabla: T-5 va a
-- cambiar `estado` con un `UPDATE` sobre esta fila, y ese `UPDATE` lleva la
-- fila entera, snapshot incluido. Una guarda sin condición abortaría ganar y
-- perder.
--
-- ## `IS NOT` y nunca `<>`: acá es donde más se nota
--
-- Con `<>`, `NEW.snapshot <> OLD.snapshot` con `NEW.snapshot = NULL` evalúa a
-- NULL, el `WHEN` da falso y el disparador no dispara. Entonces
-- `UPDATE cotizacion SET estado = 'borrador', snapshot = NULL` **pasa**: el
-- `CHECK` de coherencia de `0004` la ve consistente —borrador sin snapshot—
-- y la cotización emitida vuelve a ser un borrador editable **habiendo
-- perdido el documento que se le mandó al cliente**. Es el peor agujero que
-- esta tarea podía dejar, y lo abre un solo carácter. Medido, y con su
-- prueba de rechazo.

CREATE TRIGGER cotizacion_snapshot_se_escribe_una_sola_vez
BEFORE UPDATE ON cotizacion
WHEN OLD.snapshot IS NOT NULL
 AND NEW.snapshot IS NOT OLD.snapshot
BEGIN
  SELECT RAISE(ABORT, 'snapshot inmutable: el snapshot de una cotización se escribe una sola vez y no se reescribe');
END;

-- ===========================================================================
-- M-4 · I-4 también cubre las tablas hijas
-- ===========================================================================
--
-- **Una cotización emitida cuyos módulos o líneas se pueden cambiar no está
-- congelada.** Agregar un honorario, reescribir una cláusula o borrar una
-- línea cambia el documento **sin tocar una sola columna de `cotizacion`**,
-- así que M-2 ni se entera, y el snapshot guardado pasa a decir otra cosa que
-- las filas vivas. No hay vuelta atrás: el documento ya salió.
--
-- Es exactamente el razonamiento con el que `0004` puso
-- `cotizacion_modulo_cotizacion_inmutable`, escrito en esa migración con
-- todas las letras: «La guarda de I-4 vive en la escritura de `cotizacion`,
-- y la escribe T-4. Recolgar un módulo o una línea cambia el contenido de una
-- cotización sin escribir una sola columna suya». Aquella cerró la mudanza;
-- ésta cierra las otras tres.
--
-- ## Seis disparadores, y por qué no son dos
--
-- Un disparador de SQLite es por par (tabla, operación), así que las tres
-- operaciones de las dos tablas son seis declaraciones. No hay forma de
-- escribirlo más corto sin perder el mensaje, que es la mitad del valor:
-- «no se agrega», «no se cambia» y «no se saca» mandan a la persona a tres
-- lugares distintos.
--
-- ## `DELETE` también, y es el que menos parece hacer falta
--
-- `0004` no tiene ningún disparador de `DELETE` y dice por qué: borrar no
-- puede crear una incoherencia de tenencia. Acá la regla es otra y la
-- conclusión se invierte: **quitar una línea de una propuesta emitida es la
-- forma más barata de cambiarla**. Un `DELETE` que se lleve el honorario más
-- caro deja una cotización que el cliente aceptó cobrando menos, y el
-- snapshot como única prueba de lo que decía. Sin esta mitad, I-4 estaría a
-- dos tercios.
--
-- ## Una cotización emitida es indeleble, y eso es lo que se quiso
--
-- La consecuencia no es un efecto secundario de las tres guardas de arriba:
-- es la regla que faltaba decir. Sus hijas no se pueden borrar —I-4— y ella
-- no se puede borrar mientras tenga hijas colgando, porque sus llaves
-- foráneas están en `NO ACTION`. Las dos cosas juntas significan que **una
-- propuesta que salió para un cliente no se borra desde ningún lado**: ni
-- por la API, que no tiene ruta de borrado, ni a mano desde la consola de
-- D1. Es exactamente lo que `bitacora` hace desde `0002`, y por el mismo
-- motivo: lo que el bufete necesita poder hacer es **demostrar qué
-- prometió**, y una propuesta que se puede hacer desaparecer no demuestra
-- nada.
--
-- Por eso no hay un disparador de `DELETE` sobre `cotizacion`: sería una
-- cuarta guarda para un efecto que estas tres ya producen, y volvería no
-- verificable a cualquiera de ellas.
--
-- **Cerrar esta puerta no tiene vuelta.** Una fila emitida con hijas no se
-- puede sacar de la base sin otra migración que tire estos disparadores, y
-- esa migración sería el día en que el bufete decidió que su archivo admite
-- purgas. Mientras no exista esa decisión, lo emitido se queda.
--
-- Lo primero que esto rompe, y es la señal más barata de que la guarda
-- existe de verdad, es la limpieza de las pruebas: `test/modulos-api.spec.ts`
-- y `test/lineas-api.spec.ts` abrían su `beforeEach` con un `DELETE FROM
-- cotizacion_modulo` sin filtro, y desde esta migración eso aborta. Las dos
-- pasaron a borrar sólo lo que sigue en borrador y a sembrar su código con
-- el identificador pegado, porque lo que sobrevive ya ocupa el código fijo.
--
-- ## `NEW` en el alta, `OLD` en las otras dos
--
-- En el `INSERT` lo que se mira es a qué cotización quiere entrar la fila:
-- `NEW.cotizacion_id`. En el `UPDATE` y en el `DELETE` se mira de cuál es:
-- `OLD.cotizacion_id`. Y en el `UPDATE` **no se mira `NEW`**, que sería la
-- mudanza hacia una emitida: esa la aborta `cotizacion_modulo_cotizacion_`
-- `inmutable` de `0004`, en todos los estados y con un mensaje más exacto.
-- Mirarla acá también sería la segunda guarda para el mismo hecho, y
-- volvería no verificables a las dos.
--
-- ## La guardia de NULL, y dónde sí y dónde no
--
-- En el `INSERT` va `NEW.cotizacion_id IS NOT NULL`, por el segundo motivo de
-- `0004`: un `BEFORE INSERT` corre **antes** que `NOT NULL`, así que una fila
-- a la que le falta la columna haría saltar este disparador y el mensaje
-- hablaría de una cotización congelada cuando el defecto real es una columna
-- ausente. En el `UPDATE` y en el `DELETE` **no va**, y tampoco es un olvido:
-- `OLD` sale de una fila guardada en una columna `NOT NULL`, así que la
-- condición no puede dar falso nunca, y una cláusula que no puede evaluarse
-- es el adorno que `0003` y `0004` ya se sacaron dos veces de encima.
--
-- ## `EXISTS` en vez de comparar la subconsulta
--
-- **Léase entero antes de «simplificar» estas tres líneas.** La regla del
-- proyecto —restricción 3 de la tajada, «`IS NOT` y nunca `<>` contra una
-- subconsulta o contra algo que pueda ser nulo»— es correcta y acá se
-- cumple, pero **no es completa**: dice qué operador usar y no dice qué
-- hacer con el NULL que la subconsulta devuelve cuando no hay fila. Sobre un
-- `DELETE`, esas dos cosas no son la misma pregunta, y confundirlas produce
-- el defecto que esta sección existe para impedir.
--
-- Escrito como `(SELECT estado FROM cotizacion WHERE id = OLD.cotizacion_id)
-- IS NOT 'borrador'`, una fila **huérfana** —padre borrado— da subconsulta
-- NULL, `IS NOT 'borrador'` verdadero, y el disparador aborta su borrado.
-- La fila queda **indeleble para siempre**, y no por ser parte de un
-- documento emitido sino por estar rota. Una guarda que convierte un dato
-- corrupto en un dato inmortal no protege nada: le quita a quien repara la
-- base la única herramienta que tenía.
--
-- `EXISTS (SELECT 1 … AND c.estado IS NOT 'borrador')` conserva el operador
-- donde la regla lo pide —adentro, comparando la columna— y no tiene esa
-- rama: sin fila padre no hay nada que exista, el `WHEN` da falso y el
-- rechazo queda en manos de quien corresponda. Las tres se escriben igual
-- para que la regla se lea una sola vez.
--
-- Las dos formas se comportan distinto sólo cuando el padre **no existe**:
--
--   * En el `INSERT` las dos formas dan igual, porque una fila que entra
--     apuntando a una cotización inexistente ya muere en
--     `cotizacion_modulo_tenencia_coherente_al_insertar`, que es de `0004` y
--     corre con la misma condición. Se escribe `EXISTS` igual, para que las
--     tres digan la regla de una sola manera.
--   * En el `UPDATE` y en el `DELETE` es donde la diferencia muerde, y es la
--     que esta sección acaba de argumentar.
--
-- Y queda dicho lo que esa elección **no** tiene: una prueba. Hoy el
-- huérfano no se puede fabricar, y está medido en vez de supuesto — en el
-- runtime de las pruebas `PRAGMA foreign_keys` vale 1 y borrar una
-- cotización con un módulo vivo muere con `FOREIGN KEY constraint failed`.
-- O sea que las dos formas se comportan igual con los datos que este sistema
-- sabe producir, y `EXISTS` está por lo que pasaría el día que las llaves
-- foráneas no estén —un `PRAGMA` apagado, una restauración a mano—, que es
-- el mismo día para el que `0003` eligió su `IS NOT`. No se escribe una
-- prueba que no se puede escribir.
--
-- `c.estado IS NOT 'borrador'` adentro del `EXISTS` compara una columna
-- `NOT NULL` de una fila que existe, así que **ahí** el operador no guarda
-- nada y sólo mantiene la consistencia, igual que en M-2. Es la otra mitad
-- de la distinción que esta migración deja escrita: el mismo `IS NOT` es la
-- guarda sobre una columna nullable y apenas el mensaje sobre una
-- `NOT NULL`, y cuál de las dos cosas es depende de la columna y no de la
-- regla.

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

CREATE TRIGGER cotizacion_linea_no_entra_en_una_congelada
BEFORE INSERT ON cotizacion_linea
WHEN NEW.cotizacion_id IS NOT NULL
 AND EXISTS (SELECT 1 FROM cotizacion c
              WHERE c.id = NEW.cotizacion_id AND c.estado IS NOT 'borrador')
BEGIN
  SELECT RAISE(ABORT, 'cotizacion congelada: no se agrega una línea a una cotización que ya no es borrador');
END;

CREATE TRIGGER cotizacion_linea_no_cambia_en_una_congelada
BEFORE UPDATE ON cotizacion_linea
WHEN EXISTS (SELECT 1 FROM cotizacion c
              WHERE c.id = OLD.cotizacion_id AND c.estado IS NOT 'borrador')
BEGIN
  SELECT RAISE(ABORT, 'cotizacion congelada: no se cambia una línea de una cotización que ya no es borrador');
END;

CREATE TRIGGER cotizacion_linea_no_sale_de_una_congelada
BEFORE DELETE ON cotizacion_linea
WHEN EXISTS (SELECT 1 FROM cotizacion c
              WHERE c.id = OLD.cotizacion_id AND c.estado IS NOT 'borrador')
BEGIN
  SELECT RAISE(ABORT, 'cotizacion congelada: no se quita una línea de una cotización que ya no es borrador');
END;
