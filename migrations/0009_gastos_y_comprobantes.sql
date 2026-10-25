-- Los gastos reales del proceso y sus comprobantes (T-10 de
-- `odd/tasks/cotizaciones.md`). Abre R5, la rebanada del dinero.
--
-- `0001` a `0008` ya corrieron y **no se tocan**.
--
-- ## I-7 es el corazón de esta migración, y se cumple por ausencia
--
-- > **El saldo de gastos nunca se almacena. Siempre se deriva**
-- > (`Σ anticipos − Σ gastos`). `docs/diseno.md` §5.
--
-- Un invariante que dice «esto no se guarda» no se implementa con una
-- restricción: se implementa **no declarando la columna**. En `movimiento_gasto`
-- no hay `saldo`, no hay `acumulado`, no hay `total_a_la_fecha`, y tampoco los
-- hay en `proceso` ni en ninguna otra tabla de esta base. Si no existe dónde
-- guardarlo, nadie lo puede guardar, y la familia entera de errores de saldo
-- desactualizado y reconciliación deja de existir — no porque se resuelva,
-- sino porque no hay nada que mantener sincronizado.
--
-- Es exactamente el mismo argumento que `0004` escribió para los totales de la
-- cotización —«un total almacenado es un total que algún día no coincide con
-- sus líneas»— y por eso se escribe igual: la ausencia se declara, y hay una
-- prueba que recorre el esquema vivo y falla si alguna columna de cualquier
-- tabla se llama como un saldo (`test/gastos-api.spec.ts`). Una ausencia sin
-- su aserción no es una decisión: es una omisión que el próximo completa.
--
-- ## Las dos mecánicas del bufete salen de esta tabla sin una sola rama
--
-- `docs/diseno.md` §6, «Gastos»:
--
-- | Mecánica                       | Filas               | Lectura del saldo              |
-- |--------------------------------|---------------------|--------------------------------|
-- | Reembolso contra factura       | sólo `gasto`        | negativo: eso debe el cliente  |
-- | Anticipo con sobrante a favor  | `anticipo` + `gasto`| positivo: eso le sobra         |
--
-- La mecánica **no es un dato**: es qué filas existen. No hay columna que la
-- nombre, ni `CHECK` que la restrinja, ni hace falta ninguna rama para
-- distinguirlas, porque el reembolso puro es el caso en que `Σ anticipos` vale
-- cero y la resta sigue siendo la misma resta. Una columna `mecanica` sería un
-- segundo lugar donde decir lo que las filas ya dicen, y el día que las dos se
-- contradigan nadie sabría cuál es la verdadera — el mismo defecto que el
-- saldo almacenado, una tabla más arriba.
--
-- ## Lo que esta migración NO trae, y por qué
--
--   * **`cuota`, el plan de pagos.** Es T-11 y sigue **bloqueada por una
--     decisión abierta**: a quién pertenece el plan (`docs/diseno.md` §11,
--     punto 3). `test/esquema.spec.ts` conserva el mojón que vigila que nadie
--     la adelante.
--   * **Los verbos de bitácora de T-11.** `0006` reconstruyó esta tabla
--     llevándose por adelantado los tres verbos de T-5 y dejó escrito el
--     criterio con el que se puede: los verbos de una tarea futura entran si
--     **ya se sabe de qué entidad son**, porque la red `AccionesSinDuenio` de
--     `worker/bitacora/vocabulario.ts` exige dueño y no emisor. Los de T-11 no
--     cumplen esa condición, y no por falta de ganas: la decisión abierta es
--     literalmente **de qué cuelga una cuota** —del proceso, de la cotización
--     o de cualquiera de los dos con un `CHECK` de exclusividad—, así que no
--     hay entidad a la que atribuirlos. Es la misma línea que `0006` ya había
--     trazado con estas palabras: «los verbos de R5 no entran, porque esas
--     tareas están bloqueadas por decisiones abiertas y ni siquiera se sabe
--     todavía qué entidad los va a llevar». Para los gastos esa condición **sí**
--     se cumple hoy —`movimiento_gasto.proceso_id`, §6— y por eso entran los
--     cinco de abajo; para las cuotas no, y adelantarlos obligaría a elegir la
--     entidad acá, que es justo la decisión que no es de esta tarea.
--   * **El ITBMS.** Es T-12 y está bloqueado por su propia verificación.
--   * **Una columna que diga si el movimiento ya se le facturó al cliente.**
--     Facturación está fuera de la tajada (`docs/diseno.md` §2).

-- ===========================================================================
-- M-1 · La bitácora, reconstruida para los cinco verbos del gasto
-- ===========================================================================
--
-- La cuarta reconstrucción de esta tabla, por el motivo de siempre: SQLite no
-- tiene `ALTER TABLE … ADD CONSTRAINT`, así que ampliar un `CHECK` cuesta
-- tabla nueva, copia, borrado y renombre, y el `DROP TABLE` se lleva el índice
-- y los tres disparadores que cuelgan de ella.
--
-- ## Los cinco verbos, y por qué son cinco y no dos
--
-- | Verbo                   | Qué pregunta contesta                          |
-- |-------------------------|------------------------------------------------|
-- | `gasto_registrado`      | ¿quién cargó este desembolso?                  |
-- | `anticipo_registrado`   | ¿quién registró la plata que entró del cliente?|
-- | `gasto_quitado`         | ¿quién sacó este desembolso de la cuenta?      |
-- | `anticipo_quitado`      | ¿quién sacó este ingreso de la cuenta?         |
-- | `comprobante_adjuntado` | ¿quién subió el papel, y cuándo?               |
--
-- **El gasto y el anticipo llevan verbos distintos aunque compartan tabla**, y
-- eso no contradice la sección de arriba: lo que sale sin ramas de la misma
-- tabla es la **aritmética**, no la historia. Un `movimiento_registrado` que a
-- veces significa plata que sale y a veces plata que entra convertiría «¿quién
-- metió este anticipo?» en una pregunta que hay que contestar leyendo el
-- `detalle` y adivinando de qué lado está — exactamente lo que `0005` rechazó
-- cuando decidió no reusar los verbos de módulo para las líneas. Y mueven el
-- saldo en direcciones opuestas, que es la distinción más cara de perder de
-- todo este archivo.
--
-- **Van con prefijo** —y no `registrado` pelado— por la regla que este
-- vocabulario ya tenía escrita: pelados van los hechos propios de la entidad,
-- prefijados los de algo que *cuelga* de ella. Un movimiento cuelga del
-- proceso igual que una nota, y `nota_agregada` es el precedente exacto.
--
-- **`comprobante_adjuntado` sirve también para el reemplazo**, y no hay un
-- verbo aparte: desde donde está la persona, volver a subir el papel es
-- adjuntarlo, y la llave del objeto es la misma —ver M-2—, así que no hay un
-- segundo comprobante del que hablar. Lo que sí hay es una segunda entrada en
-- la historia, que es lo que contesta «¿cuándo cambió el papel?».
--
-- **No hay verbo de comprobante quitado.** El comprobante no se saca solo: se
-- va con el movimiento, y ese hecho ya lo cuenta `gasto_quitado` o
-- `anticipo_quitado`.
--
-- ## El `CHECK` de `entidad` no se toca
--
-- Los cinco son hechos **del proceso**, que ya es una entidad registrada. Un
-- movimiento no tiene pantalla propia ni dirección propia: se lee dentro de la
-- cuenta de su proceso, igual que una nota dentro de su línea de tiempo.
-- Darle entidad propia partiría en dos la respuesta a «¿qué pasó con este
-- proceso?», que es la pregunta que el índice `(entidad, entidad_id,
-- ocurrido_en)` existe para contestar de una.
--
-- ## El costo, pagado a la vista por cuarta vez
--
-- | Objeto                                    | Lo escribió |
-- |-------------------------------------------|-------------|
-- | `bitacora_entidad` (índice)               | `0002`      |
-- | `bitacora_no_se_actualiza`                | `0002`      |
-- | `bitacora_no_se_borra`                    | `0002`      |
-- | `bitacora_tenencia_coherente_al_insertar` | `0003`      |
--
-- Se copian **letra por letra** desde sus declaraciones originales, no desde
-- `0006`. La prueba que lo vigila —«los disparadores de la bitácora son los
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
  accion      TEXT NOT NULL CHECK (accion IN ('anticipo_quitado', 'anticipo_registrado', 'borrado', 'cerrado', 'comprobante_adjuntado', 'creado', 'dado_de_baja', 'duplicado', 'editado', 'emitido', 'etapa_alcanzada', 'ganado', 'gasto_quitado', 'gasto_registrado', 'linea_agregada', 'linea_editada', 'linea_quitada', 'lineas_reordenadas', 'modulo_agregado', 'modulo_editado', 'modulo_quitado', 'modulos_reordenados', 'nota_agregada', 'pendiente_abierto', 'pendiente_cerrado', 'perdido', 'plan_editado', 'plantilla_editada', 'plantilla_guardada', 'reabierto', 'reactivado')),
  usuario_id  TEXT NOT NULL REFERENCES usuario (id),
  ocurrido_en TEXT NOT NULL CHECK (ocurrido_en IS strftime('%Y-%m-%dT%H:%M:%fZ', ocurrido_en)),
  detalle     TEXT
);

-- Las filas se **copian** y no se descartan, por el mismo argumento de `0002`
-- que `0005` y `0006` ya repitieron: un registro de auditoría no empieza
-- borrando evidencia, y como el vocabulario nuevo es un superconjunto del
-- viejo, ninguna fila existente puede violar el `CHECK` ampliado.
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
-- M-2 · `movimiento_gasto`
-- ===========================================================================
--
-- La tabla del gasto **real**, que es la otra de las dos vidas del gasto
-- (`docs/diseno.md` §6, «Gastos»): el estimado vive congelado en la cotización
-- como una línea de clase `gasto_estimado`, y el real aparece meses después y
-- vive en el proceso. Si compartieran campo, el día que llega el real o se
-- corrompe la cotización congelada o se pierde la comparación; separados sale
-- gratis el dato que más vale, que es cuánto se desvía lo que el bufete estima
-- de lo que termina costando.
--
-- ## `fecha` y `registrado_en` son dos momentos distintos, y los dos hacen falta
--
-- `fecha` es el día en que la plata se movió, y lo elige la persona: la factura
-- de la mensajería es del mes pasado y se carga hoy. `registrado_en` es cuándo
-- se escribió la fila, y lo pone el sistema. Con una sola columna, o el saldo
-- se ordena por el día en que alguien tuvo tiempo de cargarlo, o se pierde para
-- siempre cuándo entró el dato — y la segunda es la que contesta «¿esto estaba
-- cargado cuando cerramos el mes?».
--
-- Las dos van en la forma canónica de `0001`, con el `CHECK` de ida y vuelta
-- por `strftime` escrito con `IS` y nunca con `=`: un `CHECK` que evalúa a NULL
-- **pasa**, y `strftime` devuelve NULL ante una cadena que no es un momento.
-- El día que alguien haga nullable una de las dos columnas, el `=` dejaría
-- entrar cualquier cosa sin que nada avise.
--
-- `fecha` guarda el **fin del día en Panamá** —lo que produce
-- `finDelDiaEnPanama` en `worker/db/momentos.ts`— por el mismo motivo que
-- `cotizacion.vence_en`: el bufete está en UTC−5, y un día guardado como
-- medianoche UTC se lee como el día anterior desde las siete de la tarde.
--
-- ## `monto`: centavos enteros, y el `CHECK` que de verdad lo impide
--
-- Restricción 5 de la tajada. Y la trampa que T-1 midió y dejó escrita:
-- **`INTEGER` en SQLite es afinidad, no tipo**. Un 1500.5 no se puede convertir
-- a entero sin pérdida, así que la columna lo guarda tal cual, como real, y la
-- declaración sola no impide nada. `typeof(monto) = 'integer'` es lo único que
-- lo impide, y no estorba: un '2000' que llegue como texto se convierte sin
-- pérdida y entra como entero.
--
-- **`monto >= 0` y no `> 0`**, y vale decir por qué: el signo **no está en el
-- monto**, está en `tipo`. Un movimiento con monto negativo sería un segundo
-- lugar donde decir de qué lado va la plata, y entonces un `gasto` de −500
-- querría decir lo mismo que un `anticipo` de 500 escrito al revés. Se admite
-- el cero —un movimiento de cero no mueve nada y no corrompe nada— en vez de
-- inventar una restricción más cuyo único efecto sería rechazar una fila
-- inocua.
--
-- ## `tipo`: el vocabulario cerrado del que sale todo lo demás
--
-- Dos valores, cerrados con `CHECK` porque en SQLite no hay `ENUM` (§6). **Es
-- una de dos mitades acopladas**, igual que el catálogo de tipos de módulo y
-- el vocabulario de bitácora: la otra es `TIPOS_DE_MOVIMIENTO` en
-- `worker/gastos/dominio.ts`. El `CHECK` es el que sobrevive al primer script
-- de importación (§5); la lista en código es la que cierra lo que la API
-- acepta y la que elige el verbo de bitácora sin una rama. Si se separan, la
-- API acepta un tipo que la base rechaza con un 500 que nadie puede leer.
-- `test/gastos-api.spec.ts` las compara en los dos sentidos y falla.
--
-- ## `comprobante_key`: la llave la fabrica el sistema, y la base lo exige
--
-- La columna guarda la dirección de un objeto en R2 (`docs/diseno.md` §6).
-- Nullable, y es el caso mayoritario al nacer: el movimiento se carga cuando
-- se sabe el monto, y el papel se escanea después.
--
-- **Una llave que elige quien sube es una llave que puede pisar otra o salirse
-- de su bufete.** Dos movimientos con la misma llave son un comprobante que
-- tapa al otro sin que nadie se entere; una llave con `../` o con el
-- identificador de otro tenant adelante es una fuga de un bufete a otro por el
-- único almacén que no tiene `tenant_id` en una columna. Por eso la llave es
-- **derivada**, no elegida: `comprobantes/{tenant_id}/{proceso_id}/{id}`, toda
-- ella de columnas que el cliente no controla.
--
-- Y por eso el `CHECK` la compara en vez de confiar en que el código la
-- fabrique bien. La forma es la de `el_borrador_no_tiene_snapshot_y_la_emitida_si`
-- de `0004`: compara **columnas de la misma fila**, que es lo único que un
-- `CHECK` puede hacer, y eso alcanza porque la llave no depende de ninguna
-- otra tabla. Con esto:
--
--   * dos filas no pueden compartir llave, porque `id` es la clave primaria —
--     y por eso **no** hay un índice único sobre `comprobante_key`, que sería
--     la segunda guarda del mismo hecho y las dos se anularían como garantía;
--   * ninguna llave puede nombrar otro bufete, porque el prefijo es el
--     `tenant_id` de la propia fila, que además es inmutable (M-5);
--   * y el barrido que algún día busque objetos huérfanos en R2 se puede
--     escribir, porque la dirección de cada comprobante es deducible de su fila.
--
-- **El `IS` del medio es la guarda y no el mensaje**, al revés que en el
-- `CHECK` de `0008`. En SQLite una columna `TEXT PRIMARY KEY` **admite NULL**
-- —es el comportamiento heredado de las tablas con rowid— y con `id` nulo la
-- concatenación entera da NULL: con `=` la comparación evaluaría a NULL, el
-- `CHECK` **pasaría**, y entraría una fila con una llave que nadie fabricó.
-- Con `IS`, NULL contra un texto da falso y la fila se rechaza. Está medido por
-- rechazo en `test/gastos-api.spec.ts`, no supuesto.
--
-- ## Y lo que no está: ninguna columna de saldo
--
-- Ver el encabezado. No hay `saldo`, ni `acumulado`, ni `total_a_la_fecha`, y
-- la ausencia tiene su prueba.

CREATE TABLE movimiento_gasto (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenant (id),
  proceso_id      TEXT NOT NULL REFERENCES proceso (id),
  fecha           TEXT NOT NULL
                    CONSTRAINT la_fecha_del_movimiento_es_un_momento_canonico
                    CHECK (fecha IS strftime('%Y-%m-%dT%H:%M:%fZ', fecha)),
  concepto        TEXT NOT NULL,
  monto           INTEGER NOT NULL
                    CONSTRAINT el_monto_del_movimiento_es_centavos_enteros_no_negativos
                    CHECK (typeof(monto) = 'integer' AND monto >= 0),
  tipo            TEXT NOT NULL
                    CONSTRAINT el_tipo_del_movimiento_separa_gasto_de_anticipo
                    CHECK (tipo IN ('gasto', 'anticipo')),
  comprobante_key TEXT,
  usuario_id      TEXT NOT NULL REFERENCES usuario (id),
  registrado_en   TEXT NOT NULL
                    CONSTRAINT el_registro_del_movimiento_es_un_momento_canonico
                    CHECK (registrado_en IS strftime('%Y-%m-%dT%H:%M:%fZ', registrado_en)),

  CONSTRAINT la_llave_del_comprobante_la_fabrica_el_sistema
  CHECK (comprobante_key IS NULL
         OR comprobante_key IS ('comprobantes/' || tenant_id || '/' || proceso_id || '/' || id))
);

-- La consulta de la cuenta de un proceso: todos sus movimientos, en el orden
-- en que la plata se movió. Lleva `tenant_id` adelante porque I-8 dice que
-- ninguna consulta se escribe sin filtrar por él, así que ésa es la primera
-- columna de todas las que este índice va a servir. Sin él, cada lectura del
-- saldo recorre la tabla entera — y el saldo se lee cada vez que alguien abre
-- el proceso, justamente porque no está guardado.
CREATE INDEX movimiento_gasto_proceso
  ON movimiento_gasto (tenant_id, proceso_id, fecha);

-- ===========================================================================
-- M-3 · Toda arista que cruza tablas comparte tenant
-- ===========================================================================
--
-- La familia de `0003` y `0004`, extendida a la tabla nueva. No es opcional:
-- una tabla nueva sin su disparador es exactamente el agujero que `0003`
-- cerró. Las aristas son dos: `proceso_id` y `usuario_id`.
--
-- No hace falta verificación previa, por la regla que T-1 dejó escrita: la
-- tabla y sus guardas nacen en el mismo archivo transaccional, así que no
-- existe la fila vieja que pueda violarlas. Y la verificación ni siquiera se
-- podría escribir, porque consultaría una tabla que en ese punto del archivo
-- todavía no existe.
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
-- ## La guardia de NULL va en las dos columnas aunque las dos sean `NOT NULL`
--
-- No es por corrección —ninguna de las dos es nullable— sino para **no tapar
-- el error verdadero**: en SQLite un `BEFORE INSERT` corre antes que
-- `NOT NULL`, así que una fila a la que le falta `proceso_id` haría saltar
-- primero el disparador y el mensaje diría «tenencia cruzada» cuando el
-- defecto real es una columna ausente. Por eso va también en `NEW.tenant_id`,
-- al frente de todo: sin tenant no hay tenencia que comparar.
--
-- ## El de `UPDATE` lleva una sola arista, y es `usuario_id`
--
-- `proceso_id` **no está en su `WHEN`**, y es la misma decisión que `0004`
-- tomó con `cotizacion_linea.cotizacion_id`: M-4 la vuelve inmutable, así que
-- para que esa cláusula diera verdadero habría que cambiar una columna que no
-- se puede cambiar. Una cláusula que no se puede alcanzar no es defensa en
-- profundidad: es una prueba que nadie puede escribir y un lector que se
-- confunde. Lo que se pierde al quitarla no es nada —`UPDATE … SET
-- proceso_id = <otro>` sigue muriendo, y con el mensaje más exacto de los dos.
--
-- `usuario_id` **sí** está, y por el criterio opuesto: no es inmutable, así
-- que una sentencia puede reasignar el movimiento a otra persona y la
-- pregunta de tenencia vuelve a ser real. Que ninguna ruta de la API escriba
-- esa columna no la vuelve inalcanzable: la base también la escriben las
-- importaciones y la consola de D1, que es la razón entera por la que los
-- invariantes viven acá (§5).
--
-- No hay disparador de `DELETE`: borrar una fila no puede crear una
-- incoherencia de tenencia.

CREATE TRIGGER movimiento_gasto_tenencia_coherente_al_insertar
BEFORE INSERT ON movimiento_gasto
WHEN NEW.tenant_id IS NOT NULL
 AND ((NEW.proceso_id IS NOT NULL
        AND (SELECT tenant_id FROM proceso WHERE id = NEW.proceso_id) IS NOT NEW.tenant_id)
   OR (NEW.usuario_id IS NOT NULL
        AND (SELECT tenant_id FROM usuario WHERE id = NEW.usuario_id) IS NOT NEW.tenant_id))
BEGIN
  SELECT RAISE(ABORT, 'tenencia cruzada: movimiento_gasto debe compartir tenant_id con las filas que referencia');
END;

-- Sólo `usuario_id`. Ver arriba: la cláusula de `proceso_id` sería código
-- muerto, porque esa columna es inmutable.
CREATE TRIGGER movimiento_gasto_tenencia_coherente_al_actualizar
BEFORE UPDATE ON movimiento_gasto
WHEN NEW.tenant_id IS NOT NULL
 AND ((NEW.usuario_id IS NOT NULL
        AND (SELECT tenant_id FROM usuario WHERE id = NEW.usuario_id) IS NOT NEW.tenant_id))
BEGIN
  SELECT RAISE(ABORT, 'tenencia cruzada: movimiento_gasto debe compartir tenant_id con las filas que referencia');
END;

-- ===========================================================================
-- M-4 · Una fila no cambia de bufete, y un movimiento no se muda de proceso
-- ===========================================================================
--
-- La familia de M-4 de `0003`, por la razón que aquel archivo argumenta: los
-- disparadores de tenencia viven en la escritura del hijo, y **mutar el padre
-- los derrota a todos**. Mover una fila de bufete es, por definición, fabricar
-- la fila cruzada que M-3 existe para impedir.
--
-- `proceso_id` inmutable tiene además un motivo propio y caro: la cuenta de un
-- proceso es la suma de sus movimientos, y un `UPDATE … SET proceso_id = <otro>`
-- **cambia dos saldos a la vez** sin tocar un solo monto. Como el saldo no está
-- guardado en ninguna parte, no hay ninguna fila que quede inconsistente y
-- avise: los dos números simplemente pasan a decir otra cosa, y nadie tiene
-- contra qué compararlos. Es el mismo argumento con el que `0004` volvió
-- inmutable `cotizacion_linea.cotizacion_id`, y acá pesa más porque lo que se
-- mueve es plata.
--
-- Y hay un tercer efecto, el del comprobante: la llave lleva el `proceso_id`
-- adentro, así que mudar la fila dejaría el `CHECK` de M-2 contradicho — la
-- fila moriría igual, pero con un mensaje sobre la llave en vez de sobre la
-- mudanza, que es un mensaje que no nombra lo que alguien hizo.
--
-- Lo que **queda mutable a propósito**: `fecha`, `concepto`, `monto`, `tipo`,
-- `comprobante_key` y `usuario_id`. Corregir un monto mal tecleado es una
-- edición legítima y una inmutabilidad escrita de más la cerraría.
--
-- ## `IS NOT` y nunca `<>`, y acá —como en los quince de `0003` y `0004`—
-- ## nadie lo comprueba
--
-- Es el punto ciego heredado que `0004` documentó entero y decidió no cubrir:
-- para que los dos operadores se comporten distinto, uno de los lados tiene
-- que ser NULL; `OLD` nunca lo es, y `UPDATE … SET <columna> = NULL` muere
-- igual por `NOT NULL`. Lo único que cambia es cuál de los dos mensajes llega.
-- Se escribe `IS NOT` porque éstos y aquellos quince son la misma regla, y
-- escribirla de dos formas según la tabla es peor que cualquiera de las dos.

CREATE TRIGGER movimiento_gasto_tenant_inmutable
BEFORE UPDATE ON movimiento_gasto
WHEN NEW.tenant_id IS NOT OLD.tenant_id
BEGIN
  SELECT RAISE(ABORT, 'columna inmutable: movimiento_gasto.tenant_id no se reasigna; una fila no cambia de bufete');
END;

CREATE TRIGGER movimiento_gasto_proceso_inmutable
BEFORE UPDATE ON movimiento_gasto
WHEN NEW.proceso_id IS NOT OLD.proceso_id
BEGIN
  SELECT RAISE(ABORT, 'columna inmutable: movimiento_gasto.proceso_id no se reasigna; un movimiento no se muda de proceso y mudarlo cambiaría dos cuentas a la vez');
END;
