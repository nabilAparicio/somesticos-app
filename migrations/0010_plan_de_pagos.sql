-- El plan de pagos (T-11 de `odd/tasks/cotizaciones.md`). Segunda tabla de
-- R5, la rebanada del dinero.
--
-- `0001` a `0009` ya corrieron y **no se tocan**.
--
-- ===========================================================================
-- La decisión que esta migración cierra: de qué cuelga una cuota
-- ===========================================================================
--
-- `docs/diseno.md` §11, punto 3, estaba abierto y bloqueaba esta tarea.
-- `0009` lo dejó escrito con todas las letras y por eso no pudo traer ni la
-- tabla ni sus verbos. La decisión tomada es la **opción (c)** de
-- `odd/tasks/cotizaciones.md`: la cuota cuelga de **la cotización o del
-- proceso**, con `CHECK` de exclusividad — exactamente uno de `proceso_id` o
-- `cotizacion_id`.
--
-- Las tres razones, escritas acá porque es donde el modelo queda fijado:
--
--   1. **Es el mismo patrón que esta tabla ya usa dos veces**, para
--      monto/porcentaje y para vencimiento/hito. Una tercera exclusividad no
--      agrega una forma nueva de razonar sobre la fila: agrega una instancia
--      más de la que ya hay, y las tres se prueban igual, por rechazo.
--   2. **La cotización ya es el nivel de agrupación cuando existe.** Una
--      cotización que abre dos procesos es un encargo que el cliente firmó
--      entero, y el plan es de ese encargo. No hay que inventar ningún nivel
--      nuevo: el que hace falta ya está, y colgar de él es gratis.
--   3. **Cubre el proceso suelto sin un caso especial.** El cliente
--      consolidado con un trámite simple no tiene cotización, y el usuario
--      dijo que esos existen. Con la opción (b) ese proceso se quedaba sin
--      plan; acá cuelga del proceso y no hay una sola rama que lo distinga.
--
-- **El costo, dicho y no escondido:** «¿cuánto debe este cliente?» une dos
-- consultas, la de sus cotizaciones y la de sus procesos sueltos. Es un costo
-- real y es el más barato de los tres que había sobre la mesa, porque **el
-- cliente es el ancestro común de las dos**: `cotizacion.cliente_id` (I-1) y
-- `proceso.cliente_id` (I-2) son `NOT NULL` desde `0001` y `0004`, así que la
-- unión siempre se puede escribir y nunca se queda sin filas por un padre
-- ausente. Esa consulta no es de esta tarea y no se escribe acá.
--
-- La opción (d) —un nivel de agrupación nuevo por encima— quedó descartada en
-- el plan y no se revisita: sería una entidad que el bufete no nombra, contra
-- la regla del propio usuario de «llamemos proceso a todo», y vacía de
-- sentido en el caso mayoritario, que es una cotización con un proceso.
--
-- ===========================================================================
-- `cuota` es un cronograma, nunca un enum de modalidades
-- ===========================================================================
--
-- `docs/diseno.md` §6, «Plan de pagos»:
--
--   * un solo pago  → una cuota;
--   * 50/50         → dos cuotas, una a la firma y otra contra hito;
--   * mensual       → N cuotas.
--
-- No hay columna `modalidad` y no puede haberla. Con un enum de tres valores,
-- cada forma de cobro nueva —«30% ahora, 30% contra demanda, 40% contra
-- sentencia»— cuesta una migración para agregar un valor, y el sistema pasa a
-- tener **dos fuentes de verdad sobre la misma cosa**: el enum dice qué forma
-- es y las filas dicen qué se cobra. El día que se contradigan, nadie sabe
-- cuál manda. Es exactamente el defecto del saldo almacenado de `0009`, una
-- tabla más arriba y con otra piel.
--
-- Un cronograma de filas expresa las tres formas de hoy y las que inventen
-- después **sin agregar un valor a ninguna parte**. La forma de cobro no es
-- un dato: es qué filas existen — la misma frase que `0009` escribió para las
-- dos mecánicas del gasto.
--
-- ===========================================================================
-- Las tres exclusividades, y por qué van en la base
-- ===========================================================================
--
-- | Exclusividad                     | Sin ella                                  |
-- |----------------------------------|-------------------------------------------|
-- | `proceso_id` xor `cotizacion_id` | una cuota de dos planes, o de ninguno     |
-- | `monto` xor `porcentaje`         | **un total ambiguo que nadie detecta**    |
-- | `vence_en` xor `hito`            | una cuota que no se sabe cuándo se cobra  |
--
-- La del medio es la que `docs/diseno.md` §6 argumenta entera, y conviene
-- repetirla: una cuota con monto **y** porcentaje es un total ambiguo que
-- nadie detecta hasta que las cifras no cierran, que es meses después y
-- delante del cliente. No hay ninguna lectura razonable de «1 000 dólares y
-- además el 50 %», y el sistema no tiene cómo elegir cuál de los dos quiso
-- decir quien lo cargó.
--
-- **Las tres van como `CHECK` nombrado y no como disparador**, por el mismo
-- criterio que `la_vigencia_no_termina_antes_de_empezar` de `0004` y
-- `la_llave_del_comprobante_la_fabrica_el_sistema` de `0009`: comparan
-- **columnas de la misma fila**, que es lo único que un `CHECK` puede hacer y
-- exactamente lo que estas tres piden. Un disparador acá sería maquinaria de
-- más para decir lo mismo con un mensaje peor.
--
-- ## `IS NOT` y no `<>`, aunque acá los dos anden
--
-- Las tres se escriben `(a IS NULL) IS NOT (b IS NULL)`. **Acá `<>` también
-- sería correcto**, y vale decir por qué en vez de dejarlo implícito:
-- `x IS NULL` devuelve 0 o 1 y **nunca NULL**, así que la comparación nunca
-- evalúa a NULL y el `CHECK` nunca pasa por la puerta de atrás que la regla 3
-- de la tajada existe para cerrar. Se escribe `IS NOT` igual, por el motivo
-- que `0009` ya dejó escrito para los disparadores de inmutabilidad: ésta y
-- aquéllas son la misma regla, y escribirla de dos formas según si el caso
-- concreto se salva sola es peor que cualquiera de las dos.
--
-- ===========================================================================
-- El porcentaje: unidad, rango, y de qué es porcentaje
-- ===========================================================================
--
-- ## La unidad son **puntos básicos**: enteros, 1 bp = 0,01 %
--
-- `50` y `0,5` conviviendo para decir lo mismo son el mismo defecto que un
-- total guardado: dos representaciones de un número, y ningún lugar donde
-- diga cuál es la verdadera. Así que la unidad se fija acá, una sola vez, y
-- la base la impone.
--
-- Son **puntos básicos** y no por puntos porcentuales enteros, por un caso
-- que el bufete tiene hoy: partir unos honorarios en tres da 33,33 / 33,33 /
-- 33,34, y con porcentajes enteros eso no se puede escribir. Con puntos
-- básicos es 3333 / 3333 / 3334 y cierra exacto.
--
-- Y son **enteros** por la restricción 5 de la tajada, con la trampa que T-1
-- midió: **`INTEGER` en SQLite es afinidad, no tipo**. Un `33.33` entra tal
-- cual en una columna `INTEGER`, porque no se puede convertir sin pérdida.
-- `typeof(porcentaje) = 'integer'` es lo único que lo impide, igual que con
-- `monto`.
--
-- La unidad es la misma elección que los centavos, por la misma razón y con
-- la misma forma: la centésima parte de la unidad que la persona escribe,
-- guardada como entero. La conversión de lo que se teclea a la unidad que se
-- guarda es de la pantalla, que es la que sabe en qué unidad se tecleó.
--
-- ## El rango es `1 .. 10000`, los dos extremos incluidos
--
-- **Cero no entra**, y acá esta tabla se aparta de `movimiento_gasto`, que sí
-- admite `monto = 0`. La diferencia no es de gusto: un movimiento registra
-- **algo que pasó**, y un movimiento de cero no mueve nada y no corrompe
-- nada; una cuota es **una obligación que el cliente lee y firma**, y una
-- línea de cero en ese documento es un renglón que promete un cobro que no
-- existe. Lo mismo vale para `monto`, y por eso acá es `> 0` y allá es
-- `>= 0`.
--
-- **Más de 10000 tampoco**, porque una sola cuota de más del 100 % de algo no
-- es un cronograma, es un error de tecleo. Lo que este `CHECK` **no** puede
-- es exigir que la suma de los porcentajes de un plan dé 10000: eso compara
-- filas distintas y un `CHECK` sólo ve la suya. Esa suma **se deriva y se
-- muestra, y no se guarda** — ver la sección de abajo.
--
-- ## De qué es porcentaje: la respuesta **no es la misma** en los dos casos
--
-- Y por eso se dice en vez de esconderse.
--
--   * **Cuando la cuota cuelga de una cotización**, el porcentaje es del
--     **total de esa cotización** —honorarios más gastos estimados—, que es
--     lo que `totalesDe` deriva de sus líneas y lo que el cliente ve como el
--     número grande del documento. Hay base, es una sola, y está definida.
--   * **Cuando la cuota cuelga de un proceso, no hay base.** Un proceso no
--     tiene total: tiene movimientos de gasto real, que son plata de terceros
--     y no honorarios, y si nació de una cotización el total está en aquélla
--     y no en él. Un proceso suelto —`origen = 'directo'`— no tiene
--     absolutamente ningún número del que ser porcentaje.
--
-- Como la respuesta no es la misma, la base la impone: **una cuota porcentual
-- sólo puede colgar de una cotización**. Es la cuarta restricción de abajo, y
-- es la única de las cuatro que no estaba en el boceto de §6 — está porque la
-- pregunta «¿porcentaje de qué?» tiene respuesta en un caso y no tiene en el
-- otro, y una fila que no se puede contestar no tiene por qué poder existir.
--
-- Dicho al derecho: **una cuota de un proceso lleva monto, siempre.** No es
-- una limitación del plan de pagos del proceso suelto; es que ahí no hay de
-- qué sacar un porcentaje, y escribir `50 %` sería escribir la mitad de algo
-- que nadie sabe qué es.
--
-- ===========================================================================
-- Lo que esta migración NO trae, y por qué
-- ===========================================================================
--
--   * **Ninguna columna con el total del plan.** Es I-7 otra vez, con la
--     tercera piel: `0004` se negó a guardar el total de una cotización,
--     `0009` se negó a guardar el saldo de un proceso, y acá se niega el total
--     del plan. El argumento es el mismo las tres veces —un total almacenado
--     es un total que algún día no coincide con sus filas— y la
--     implementación también: **no se declara la columna**. No hay `total`, no
--     hay `suma`, no hay `importe_del_plan` ni `porcentaje_asignado`, y
--     tampoco los hay en `cotizacion` ni en `proceso`. Si no existe dónde
--     guardarlo, nadie lo puede guardar. La ausencia tiene su aserción en
--     `test/cuotas-api.spec.ts`, porque una ausencia sin su prueba no es una
--     decisión: es una omisión que el próximo completa.
--   * **`pagada_en`.** El boceto de §6 la lista y acá no está, y es
--     deliberado. Una cuota es **el plan**; registrar que se cobró es un
--     hecho de plata que entró, y este sistema no tiene todavía dónde vive esa
--     plata: `movimiento_gasto` es desembolso y anticipo de gastos, no
--     honorarios cobrados. Decidir si el cobro es una columna acá o una tabla
--     propia es una decisión que no es de esta tarea, y §2 pone cuentas por
--     cobrar y estado de cuenta formal fuera de la tajada. Declarar la columna
--     sin la ruta que la escriba sería una columna muerta —y escribir la ruta
--     sería tomar la decisión de cobro acá adentro—, así que no va ninguna de
--     las dos. El hueco queda limpio: la migración que traiga el cobro trae la
--     columna y su verbo juntos.
--   * **Una columna `orden`.** El cronograma se lee en el orden en que se
--     escribió —`creada_en` y después `rowid`—, que es el orden en que el
--     abogado dicta un plan. Una columna de orden sólo paga si hay una ruta
--     que reordene, y reordenar no es de esta unidad: sin ella, `orden` y
--     `creada_en` producen exactamente la misma lectura y la columna sería la
--     segunda forma de decir lo mismo. Es el mismo criterio con el que `0009`
--     no trajo un `PUT` sobre un movimiento.
--   * **El ITBMS.** Es T-12 y sigue bloqueado por su propia verificación. No
--     hay una sola línea de aritmética de impuestos en este archivo ni en el
--     código que lo acompaña.
--
-- ===========================================================================
-- M-1 · La bitácora, reconstruida para los dos verbos de la cuota
-- ===========================================================================
--
-- **La quinta reconstrucción de esta tabla**, por el motivo de siempre:
-- SQLite no tiene `ALTER TABLE … ADD CONSTRAINT`, así que ampliar un `CHECK`
-- cuesta tabla nueva, copia, borrado y renombre, y el `DROP TABLE` se lleva el
-- índice y los tres disparadores que cuelgan de ella.
--
-- ## Los dos verbos
--
-- | Verbo           | Qué pregunta contesta                     |
-- |-----------------|-------------------------------------------|
-- | `cuota_agregada`| ¿quién puso esta cuota en el plan?        |
-- | `cuota_quitada` | ¿quién la sacó?                           |
--
-- Son dos y no uno porque las dos preguntas son distintas, que es para lo que
-- existe un vocabulario cerrado. Y son dos y no tres porque **editar una
-- cuota no es de esta unidad**: se quita y se vuelve a poner, que para un
-- plan de tres renglones es la misma operación con un clic más y sin ninguna
-- regla nueva. La ausencia del verbo es cómo se dice eso, igual que `0009`
-- dijo con la ausencia de un `PUT` que un movimiento no se corrige.
--
-- **Van con prefijo** —y no `agregada` pelada— por la regla que este
-- vocabulario ya tenía escrita: pelados van los hechos propios de la entidad,
-- prefijados los de algo que *cuelga* de ella. Una cuota cuelga igual que una
-- nota de su proceso y que una línea de su cotización.
--
-- ## El `CHECK` de `entidad` no se toca, y ahora sí se sabe a cuál atribuir
--
-- `0009` dejó escrito por qué estos dos verbos no podían entrar entonces: la
-- red `AccionesSinDuenio` de `worker/bitacora/vocabulario.ts` exige **dueño**,
-- y la decisión abierta era literalmente de qué cuelga una cuota, así que no
-- había entidad a la que atribuirlos. Esa decisión está tomada arriba, y la
-- respuesta que da es la que resuelve la atribución: **una cuota cuelga de un
-- proceso o de una cotización, y las dos ya son entidades registradas**.
--
-- Así que los dos verbos se atribuyen **a las dos**, y el hecho se registra
-- contra la que de verdad lleva esa cuota. No hay entidad `cuota` y no hace
-- falta: una cuota no tiene pantalla propia ni dirección propia, se lee dentro
-- del plan de su dueño, y darle entidad partiría en dos la respuesta a «¿qué
-- pasó con esta cotización?», que es la pregunta que el índice
-- `(entidad, entidad_id, ocurrido_en)` existe para contestar de una. Es
-- exactamente el argumento que `0009` usó para los cinco del gasto.
--
-- Un verbo atribuido a dos entidades **no es nuevo en este vocabulario**:
-- `creado` y `editado` ya lo están a cinco. Lo que el vocabulario cierra es
-- qué le puede pasar a cada entidad, no que cada verbo sea de una sola.
--
-- ## El costo, pagado a la vista por quinta vez
--
-- | Objeto                                    | Lo escribió |
-- |-------------------------------------------|-------------|
-- | `bitacora_entidad` (índice)               | `0002`      |
-- | `bitacora_no_se_actualiza`                | `0002`      |
-- | `bitacora_no_se_borra`                    | `0002`      |
-- | `bitacora_tenencia_coherente_al_insertar` | `0003`      |
--
-- Se copian **letra por letra** desde sus declaraciones originales, no desde
-- `0009`. La prueba que lo vigila —«los disparadores de la bitácora son los
-- mismos que escribieron 0002 y 0003», en `test/bitacora-api.spec.ts`— lee
-- `0002` y `0003` de `TEST_MIGRATIONS` y los compara normalizados contra
-- `sqlite_master`, así que una reconstrucción que ablande un `RAISE`, cambie
-- un `WHEN` o escriba `<>` donde iba `IS NOT` se pone roja venga de donde
-- venga.

CREATE TABLE bitacora_nueva (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenant (id),
  entidad     TEXT NOT NULL CHECK (entidad IN ('area', 'cliente', 'cotizacion', 'proceso', 'tipo_cliente', 'tipo_proceso')),
  entidad_id  TEXT NOT NULL,
  accion      TEXT NOT NULL CHECK (accion IN ('anticipo_quitado', 'anticipo_registrado', 'borrado', 'cerrado', 'comprobante_adjuntado', 'creado', 'cuota_agregada', 'cuota_quitada', 'dado_de_baja', 'duplicado', 'editado', 'emitido', 'etapa_alcanzada', 'ganado', 'gasto_quitado', 'gasto_registrado', 'linea_agregada', 'linea_editada', 'linea_quitada', 'lineas_reordenadas', 'modulo_agregado', 'modulo_editado', 'modulo_quitado', 'modulos_reordenados', 'nota_agregada', 'pendiente_abierto', 'pendiente_cerrado', 'perdido', 'plan_editado', 'plantilla_editada', 'plantilla_guardada', 'reabierto', 'reactivado')),
  usuario_id  TEXT NOT NULL REFERENCES usuario (id),
  ocurrido_en TEXT NOT NULL CHECK (ocurrido_en IS strftime('%Y-%m-%dT%H:%M:%fZ', ocurrido_en)),
  detalle     TEXT
);

-- Las filas se **copian** y no se descartan, por el mismo argumento de `0002`
-- que `0005`, `0006` y `0009` ya repitieron: un registro de auditoría no
-- empieza borrando evidencia, y como el vocabulario nuevo es un superconjunto
-- del viejo, ninguna fila existente puede violar el `CHECK` ampliado.
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
CREATE TRIGGER bitacora_tenencia_coherente_al_insertar
BEFORE INSERT ON bitacora
WHEN NEW.tenant_id IS NOT NULL
 AND ((NEW.usuario_id IS NOT NULL
        AND (SELECT tenant_id FROM usuario WHERE id = NEW.usuario_id) IS NOT NEW.tenant_id))
BEGIN
  SELECT RAISE(ABORT, 'tenencia cruzada: bitacora debe compartir tenant_id con las filas que referencia');
END;

-- ===========================================================================
-- M-2 · `cuota`
-- ===========================================================================
--
-- Diez columnas, las mismas que `movimiento_gasto`, y cuatro restricciones
-- nombradas que comparan columnas de la propia fila.
--
-- ## Las dos llaves foráneas son las dos nullables, y eso es la decisión
--
-- `proceso_id` y `cotizacion_id` son **las dos** nullables, y la que impide
-- que eso signifique «cualquier cosa» es la primera restricción de abajo:
-- exactamente una tiene que estar. Sin ella, una fila con las dos nulas sería
-- una cuota que no es de nadie, y una con las dos puestas sería una cuota en
-- dos planes a la vez, cobrada dos veces o ninguna según quién la lea.
--
-- ## `vence_en` guarda el fin del día en Panamá
--
-- Igual que `cotizacion.vence_en` y que `movimiento_gasto.fecha`, y por el
-- mismo motivo: el bufete está en UTC−5, y un día guardado como medianoche
-- UTC se lee como el día anterior desde las siete de la tarde. Lo produce
-- `finDelDiaEnPanama` en `worker/db/momentos.ts`, y se lee de vuelta con
-- `diaEnPanama`, que es la misma conversión dada vuelta.
--
-- El `CHECK` de ida y vuelta por `strftime` va escrito con `IS` y nunca con
-- `=`, por la razón de siempre: un `CHECK` que evalúa a NULL **pasa**, y
-- `strftime` devuelve NULL ante una cadena que no es un momento. Acá la
-- columna **sí** es nullable —una cuota contra hito no tiene fecha—, así que
-- esto no es precaución para el futuro: con `=`, `vence_en IS NULL` haría que
-- la comparación diera NULL y cualquier basura entraría por esa puerta el día
-- que alguien escribiera una cadena en vez de un nulo.
--
-- ## `hito` no puede estar en blanco, y ésa no es una restricción cosmética
--
-- Un `hito` de cadena vacía **satisface la tercera exclusividad** —no es
-- nulo— y no dice absolutamente nada. O sea: sin esta restricción, la
-- exclusividad de vencimiento/hito se puede derrotar escribiendo `''`, y la
-- fila resultante es exactamente la que esa exclusividad existe para impedir:
-- una cuota de la que no se sabe cuándo se cobra. Por eso va en la base y no
-- sólo en la validación de la API. `concepto` no lo lleva —y `0009` tampoco se
-- lo puso al suyo— porque un concepto en blanco es feo pero no derrota
-- ninguna otra restricción.

CREATE TABLE cuota (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant (id),
  proceso_id    TEXT REFERENCES proceso (id),
  cotizacion_id TEXT REFERENCES cotizacion (id),
  concepto      TEXT NOT NULL,
  monto         INTEGER
                  CONSTRAINT el_monto_de_la_cuota_es_centavos_enteros_positivos
                  CHECK (monto IS NULL
                         OR (typeof(monto) = 'integer' AND monto > 0)),
  porcentaje    INTEGER
                  CONSTRAINT el_porcentaje_de_la_cuota_es_puntos_basicos_de_uno_a_diez_mil
                  CHECK (porcentaje IS NULL
                         OR (typeof(porcentaje) = 'integer'
                             AND porcentaje > 0
                             AND porcentaje <= 10000)),
  vence_en      TEXT
                  CONSTRAINT el_vencimiento_de_la_cuota_es_un_momento_canonico
                  CHECK (vence_en IS strftime('%Y-%m-%dT%H:%M:%fZ', vence_en)),
  hito          TEXT
                  CONSTRAINT el_hito_de_la_cuota_no_esta_en_blanco
                  CHECK (hito IS NULL OR trim(hito) IS NOT ''),
  creada_en     TEXT NOT NULL
                  CONSTRAINT la_creacion_de_la_cuota_es_un_momento_canonico
                  CHECK (creada_en IS strftime('%Y-%m-%dT%H:%M:%fZ', creada_en)),

  -- **La decisión (c).** Exactamente uno de los dos padres. Ver el
  -- encabezado: la cotización es el nivel de agrupación cuando existe, y el
  -- proceso suelto queda cubierto sin un caso especial.
  CONSTRAINT la_cuota_cuelga_de_la_cotizacion_o_del_proceso_y_nunca_de_los_dos
  CHECK ((proceso_id IS NULL) IS NOT (cotizacion_id IS NULL)),

  -- **La que `docs/diseno.md` §6 argumenta entera.** Una cuota con monto y
  -- porcentaje es un total ambiguo que nadie detecta hasta que las cifras no
  -- cierran, y una sin ninguno de los dos no cobra nada.
  CONSTRAINT la_cuota_lleva_monto_o_porcentaje_y_nunca_los_dos
  CHECK ((monto IS NULL) IS NOT (porcentaje IS NULL)),

  -- Cuándo se cobra: una fecha del calendario o un hito del trámite, nunca
  -- las dos. «50 % a la firma» es hito; «el saldo al 30 de junio» es fecha.
  -- Con las dos puestas no se sabe cuál dispara el cobro; sin ninguna, la
  -- cuota está en el plan y no se cobra nunca.
  CONSTRAINT la_cuota_vence_en_una_fecha_o_contra_un_hito_y_nunca_las_dos
  CHECK ((vence_en IS NULL) IS NOT (hito IS NULL)),

  -- **La cuarta, que no estaba en el boceto de §6.** Un porcentaje necesita
  -- una base, y la base es el total de la cotización. Un proceso no tiene
  -- total —tiene gastos reales, que son plata de terceros, y si nació de una
  -- cotización el total vive allá—, así que «50 %» colgado de un proceso es
  -- la mitad de algo que nadie sabe qué es. Ver el encabezado: la pregunta
  -- «¿porcentaje de qué?» tiene respuesta en un caso y no la tiene en el
  -- otro, y una fila que no se puede contestar no tiene por qué existir.
  --
  -- Dicho al derecho: **una cuota de un proceso lleva monto, siempre.**
  CONSTRAINT un_porcentaje_sin_cotizacion_no_tiene_de_que_ser_porcentaje
  CHECK (porcentaje IS NULL OR cotizacion_id IS NOT NULL)
);

-- Dos índices y no uno, porque son dos padres y cada plan se lee por el suyo.
-- Los dos llevan `tenant_id` adelante porque I-8 dice que ninguna consulta se
-- escribe sin filtrar por él, así que ésa es la primera columna de todas las
-- que estos índices van a servir. Y los dos cierran con `creada_en`, que es
-- el orden en que el cronograma se lee: el orden en que se escribió.
CREATE INDEX cuota_proceso ON cuota (tenant_id, proceso_id, creada_en);

CREATE INDEX cuota_cotizacion ON cuota (tenant_id, cotizacion_id, creada_en);

-- ===========================================================================
-- M-3 · Toda arista que cruza tablas comparte tenant
-- ===========================================================================
--
-- La familia de `0003`, `0004` y `0009`, extendida a la tabla nueva. No es
-- opcional: una tabla nueva sin su disparador es exactamente el agujero que
-- `0003` cerró. Las aristas son dos, `proceso_id` y `cotizacion_id`, y no hay
-- tercera porque **`cuota` no tiene `usuario_id`** — ver abajo.
--
-- No hace falta verificación previa, por la regla que T-1 dejó escrita: la
-- tabla y sus guardas nacen en el mismo archivo transaccional, así que no
-- existe la fila vieja que pueda violarlas.
--
-- ## `IS NOT` y nunca `<>`
--
-- Si la fila padre no existe, la subconsulta no devuelve ninguna fila y vale
-- NULL. Con `<>` la comparación evalúa a NULL, el `WHEN` da falso y **el
-- disparador no dispara**; con `IS NOT`, NULL contra un `tenant_id` real es
-- verdadero y aborta. Que la llave foránea también lo rechace no vuelve
-- redundante al disparador: vuelve redundante a la llave foránea, que es la
-- que se puede apagar con un `PRAGMA`.
--
-- ## Acá la guarda de NULL **es la guarda**, y no sólo el mensaje
--
-- Es la diferencia que separa este disparador de todos sus hermanos, y vale
-- decirla con todas las letras. En `0003`, `0004` y `0009` las columnas de la
-- arista son `NOT NULL`, así que `NEW.col IS NOT NULL` está por un motivo de
-- mensaje: evitar que el disparador tape el error verdadero de la columna
-- ausente, porque `BEFORE INSERT` corre antes que `NOT NULL`.
--
-- **Acá las dos son nullables a propósito**, y exactamente una viene nula en
-- toda fila legítima. Sin `NEW.proceso_id IS NOT NULL` delante, la subconsulta
-- `(SELECT tenant_id FROM proceso WHERE id = NULL)` devuelve NULL, y
-- `NULL IS NOT 't1'` es **verdadero**: el disparador abortaría toda cuota de
-- cotización, y toda cuota de proceso por la otra mitad. O sea que acá la
-- guarda no mejora un mensaje: es lo único que deja pasar las filas buenas, y
-- quitarla rompe la tabla entera en vez de empeorar un texto.
--
-- `NEW.tenant_id IS NOT NULL` al frente sigue estando por el motivo de
-- siempre: sin tenant no hay tenencia que comparar.
--
-- ## No hay `usuario_id`, y por eso no hay tercera arista
--
-- `movimiento_gasto` lleva uno porque un desembolso es de alguien: quién puso
-- la plata es parte del dato. Una cuota no: es un renglón del documento que
-- el bufete le propone al cliente, y lo firma el bufete, no una persona. Quién
-- la cargó está en la bitácora, que es donde §6 pone la autoría cuando no es
-- parte del dato. Una columna de más acá sería un autor que ninguna pantalla
-- muestra y que nadie puede corregir.
--
-- ## No hay disparador de `UPDATE`, y esta vez no queda ninguna arista
--
-- `0009` dejó el criterio escrito: una cláusula que apunta a una columna
-- inmutable es código muerto —«una cláusula que no se puede alcanzar no es
-- defensa en profundidad: es una prueba que nadie puede escribir y un lector
-- que se confunde»—. Allá quedaba `usuario_id`, que sí es mutable, y por eso
-- el disparador de `UPDATE` existía con una sola arista.
--
-- Acá **las dos aristas son inmutables** (M-4) y no hay `usuario_id`, así que
-- el disparador de `UPDATE` se quedaría sin una sola cláusula alcanzable. No
-- se escribe. `UPDATE … SET proceso_id = <otro>` muere igual, y con el mensaje
-- más exacto de los dos: el de la mudanza.
--
-- No hay disparador de `DELETE`: borrar una fila no puede crear una
-- incoherencia de tenencia.

CREATE TRIGGER cuota_tenencia_coherente_al_insertar
BEFORE INSERT ON cuota
WHEN NEW.tenant_id IS NOT NULL
 AND ((NEW.proceso_id IS NOT NULL
        AND (SELECT tenant_id FROM proceso WHERE id = NEW.proceso_id) IS NOT NEW.tenant_id)
   OR (NEW.cotizacion_id IS NOT NULL
        AND (SELECT tenant_id FROM cotizacion WHERE id = NEW.cotizacion_id) IS NOT NEW.tenant_id))
BEGIN
  SELECT RAISE(ABORT, 'tenencia cruzada: cuota debe compartir tenant_id con las filas que referencia');
END;

-- ===========================================================================
-- M-4 · Una fila no cambia de bufete, y una cuota no se muda de plan
-- ===========================================================================
--
-- La familia de M-4 de `0003`, por la razón que aquel archivo argumenta: los
-- disparadores de tenencia viven en la escritura del hijo, y **mutar el padre
-- los derrota a todos**. Mover una fila de bufete es, por definición,
-- fabricar la fila cruzada que M-3 existe para impedir.
--
-- Los dos padres son inmutables, y cada uno tiene además su motivo propio:
--
--   * **Un `UPDATE` sobre `proceso_id` o `cotizacion_id` cambia dos planes a
--     la vez** sin tocar un solo monto. Como el total del plan no está
--     guardado en ninguna parte, no hay ninguna fila que quede inconsistente y
--     avise: los dos cronogramas simplemente pasan a decir otra cosa. Es el
--     mismo argumento con el que `0009` volvió inmutable
--     `movimiento_gasto.proceso_id` y `0004`
--     `cotizacion_linea.cotizacion_id`.
--   * **Y hay uno que es sólo de acá:** mover una cuota de una cotización a un
--     proceso dejaría contradicha la cuarta restricción de M-2 si esa cuota
--     era porcentual. La fila moriría igual, pero con un mensaje sobre el
--     porcentaje en vez de sobre la mudanza, que es un mensaje que no nombra
--     lo que alguien hizo. Peor todavía al revés: mover una cuota de monto de
--     un proceso a una cotización pasa todas las restricciones y es, aun así,
--     plata que cambió de documento sin que nadie lo registre.
--
-- Lo que **queda mutable a propósito**: `concepto`, `monto`, `porcentaje`,
-- `vence_en` y `hito`. Corregir un monto mal tecleado es una edición legítima
-- y una inmutabilidad escrita de más la cerraría. Las cuatro restricciones de
-- M-2 se vuelven a evaluar en cada `UPDATE`, así que una corrección no puede
-- fabricar una fila ambigua por la puerta de atrás.
--
-- ## `IS NOT` y nunca `<>`, y acá —como en los diecisiete de `0003`, `0004`
-- ## y `0009`— nadie lo comprueba
--
-- Es el punto ciego heredado que `0004` documentó entero y decidió no cubrir.
-- Con una diferencia real que conviene anotar: **acá las dos columnas sí son
-- nullables**, así que `UPDATE … SET cotizacion_id = NULL` no muere por
-- `NOT NULL` sino por la primera restricción de M-2, y el operador sigue sin
-- decidir nada porque `NULL IS NOT <texto>` y `NULL <> <texto>` sólo difieren
-- en si el disparador llega a hablar antes que el `CHECK`. Lo único que
-- cambia es cuál de los dos mensajes llega. Se escribe `IS NOT` porque éstos
-- y aquéllos son la misma regla.

CREATE TRIGGER cuota_tenant_inmutable
BEFORE UPDATE ON cuota
WHEN NEW.tenant_id IS NOT OLD.tenant_id
BEGIN
  SELECT RAISE(ABORT, 'columna inmutable: cuota.tenant_id no se reasigna; una fila no cambia de bufete');
END;

CREATE TRIGGER cuota_proceso_inmutable
BEFORE UPDATE ON cuota
WHEN NEW.proceso_id IS NOT OLD.proceso_id
BEGIN
  SELECT RAISE(ABORT, 'columna inmutable: cuota.proceso_id no se reasigna; una cuota no se muda de plan y mudarla cambiaría dos cronogramas a la vez');
END;

CREATE TRIGGER cuota_cotizacion_inmutable
BEFORE UPDATE ON cuota
WHEN NEW.cotizacion_id IS NOT OLD.cotizacion_id
BEGIN
  SELECT RAISE(ABORT, 'columna inmutable: cuota.cotizacion_id no se reasigna; una cuota no se muda de plan y mudarla cambiaría dos cronogramas a la vez');
END;
