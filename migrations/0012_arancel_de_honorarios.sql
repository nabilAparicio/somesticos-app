-- El arancel de honorarios, sembrado y editable (T-2 de
-- `odd/tasks/arancel-de-honorarios.md`).
--
-- Fuente de verdad del dato: **Acuerdo No 49 de 24 de abril de 2001**, Sala
-- Cuarta de Negocios Generales de la Corte Suprema de Justicia de Panamá, que
-- aprueba la *Tarifa de Honorarios Profesionales Mínimos de los Abogados en
-- la República de Panamá*. El PDF está en el repositorio
-- (`docs/fuentes/acuerdo-49-2001-tarifa-abogados.pdf`), T-1 lo extrajo a
-- `scripts/arancel/arancel.json` con `pnpm arancel:extraer`, y las erratas
-- del documento están anotadas una por una en `scripts/arancel/lecturas.md`.
--
-- `0001` a `0011` ya corrieron y **no se tocan**.
--
-- ## El problema que esta tabla cierra
--
-- Hoy no hay dónde guardar un precio, en ningún lado: `tipo_proceso` no tiene
-- una sola columna de dinero y `cotizacion_linea.monto` es un número suelto
-- que se tipea a mano en cada cotización. El bufete no tiene en ninguna parte
-- la respuesta a «¿cuánto cobramos nosotros por una visa de pensionado?».
--
-- ## Dos montos guardados, y la asimetría es la tabla entera
--
-- | Columna         | Quién la escribe        | Se puede editar                  |
-- |-----------------|-------------------------|----------------------------------|
-- | `monto_oficial` | La siembra, del Acuerdo | **No.** Es una cita, no un dato. |
-- | `monto`         | El bufete               | Sí. Es lo que el bufete cobra.   |
--
-- Lo mismo vale para `categoria`, `numeral`, `concepto`, `orden`, `clase` y
-- `regla_oficial`: son **la transcripción de un documento publicado**, no
-- datos nuestros. Un `UPDATE` que los cambie no es una corrección: es una
-- cita falsificada, y dentro de dos años nadie va a poder saber de dónde
-- salió cada sugerencia. El disparador de más abajo es lo que lo impide, y es
-- a propósito que lo impida **la base y no la buena intención**
-- (`docs/diseno.md` §5: una regla que solo vive en el código es la que el
-- primer script de importación se salta).
--
-- ## Lo que esta migración NO trae
--
--   * **Ninguna fila.** La siembra es `scripts/arancel/sembrar.mjs`, que lee
--     `scripts/arancel/arancel.json` y corre con `pnpm arancel:sembrar`. Una
--     migración de 453 `INSERT` sería 140 kB de datos dentro del esquema, sin
--     forma de volver a correrla cuando la extracción mejore y sin el control
--     de divergencia que la siembra sí hace.
--   * **Ninguna aritmética de tramos.** Las 97 reglas por cuantía —«25% de
--     menor cuantía», «B/.2,000.00 más el 35% de lo que se obtenga»— se
--     guardan como **texto** en `regla_oficial` y no se auto-calculan, por
--     dos razones de evidencia: la cuantía no es un dato que la cotización
--     pida hoy, y varias de esas reglas son justamente las que tienen las
--     erratas (lecturas 1 a 3 de `lecturas.md`). Auto-calcular una tarifa
--     progresiva a partir de un texto con erratas es la clase de aritmética
--     que nadie revisa hasta que sale mal en una cotización.
--   * **Ningún vínculo con `tipo_proceso` ni con `cotizacion_linea`.**
--     Prellenar la línea de una cotización con el precio del arancel es la
--     tajada siguiente y está dicho en el alcance: toca `EditorDeLineas`, el
--     congelado del snapshot y la propuesta de la IA.
--   * **Ninguna columna de moneda.** `cotizacion.moneda` es un `CHECK`
--     cerrado en `'USD'` y el arancel está en balboas, que están a la par por
--     ley desde 1904. Una columna de moneda acá sería una decisión de otra
--     tajada disfrazada de columna.

-- ===========================================================================
-- M-1 · La bitácora, reconstruida para la entidad del renglón
-- ===========================================================================
--
-- **La sexta reconstrucción de esta tabla**, por el motivo de siempre: SQLite
-- no tiene `ALTER TABLE … ADD CONSTRAINT`, así que ampliar un `CHECK` cuesta
-- tabla nueva, copia, borrado y renombre, y el `DROP TABLE` se lleva el
-- índice y los tres disparadores que cuelgan de ella.
--
-- ## Por qué hace falta, dicho sin vueltas
--
-- `worker/db/base.ts` es el único camino de escritura del sistema, y su
-- `mutar(evento, …sentencias)` **exige el hecho como primer parámetro**: una
-- mutación nueva sin su entrada de bitácora no compila. El precio del bufete
-- es una escritura, así que necesita un hecho, y un hecho necesita una
-- entidad del vocabulario. No había ninguna a la que atribuirlo sin mentir:
--
--   * `tipo_proceso` no: el precio no está en esa tabla y la pregunta que
--     contesta la bitácora de un tipo de proceso no es ésta.
--   * `cotizacion` tampoco: el arancel es anterior a cualquier cotización y
--     no cuelga de ninguna.
--
-- ## Por qué `arancel_renglon` es entidad propia y no un hecho de otra
--
-- La regla del vocabulario es «un hecho, una entidad», y lo que decide es si
-- la cosa **se lee sola**: una nota se lee dentro de la línea de tiempo de su
-- proceso y por eso no tiene entidad; una cotización se lee sola y por eso sí
-- la tiene. Un renglón del arancel se lee solo —tiene su fila en una tabla
-- que es la pantalla entera de T-3, y la pregunta «¿quién le puso este precio
-- a esto, y cuándo?» es exactamente la que el bufete va a hacer el día que un
-- precio no cuadre con lo que recuerda—. Así que entidad propia, y con ella
-- la dirección `/api/arancel/{id}/bitacora` sale gratis por
-- `worker/bitacora/rutas.ts`.
--
-- ## El `CHECK` de `accion` **no se toca**, y eso es una decisión
--
-- El único verbo que esta entidad admite es `editado`, que ya está en el
-- vocabulario desde `0002`. No se agrega un `precio_editado` propio por la
-- regla que el vocabulario ya tiene escrita: los verbos son verbos y no pares
-- entidad+verbo, porque la entidad ya viaja en su columna. «Itzel editó
-- «Visitantes Temporales (por persona)»» ya está bien dicho, y
-- `src/bitacora.ts` no necesita una frase nueva.
--
-- Tampoco entran `dado_de_baja` ni `reactivado`, aunque la tabla tenga
-- `activo`: T-2 **no abre ninguna ruta** que escriba esa columna, y un verbo
-- sin sitio que lo emita es una entrada del vocabulario que no significa
-- nada. El día que alguien necesite retirar un renglón, el verbo entra con su
-- ruta.
--
-- ## El costo, pagado a la vista por sexta vez
--
-- | Objeto                                    | Lo escribió |
-- |-------------------------------------------|-------------|
-- | `bitacora_entidad` (índice)               | `0002`      |
-- | `bitacora_no_se_actualiza`                | `0002`      |
-- | `bitacora_no_se_borra`                    | `0002`      |
-- | `bitacora_tenencia_coherente_al_insertar` | `0003`      |
--
-- Se copian **letra por letra** desde sus declaraciones originales. La prueba
-- que lo vigila —«los disparadores de la bitácora son los mismos que
-- escribieron 0002 y 0003», en `test/bitacora-api.spec.ts`— lee `0002` y
-- `0003` de `TEST_MIGRATIONS` y los compara normalizados contra
-- `sqlite_master`, así que una reconstrucción que ablande un `RAISE`, cambie
-- un `WHEN` o escriba `<>` donde iba `IS NOT` se pone roja venga de donde
-- venga.

CREATE TABLE bitacora_nueva (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenant (id),
  entidad     TEXT NOT NULL CHECK (entidad IN ('arancel_renglon', 'area', 'cliente', 'cotizacion', 'proceso', 'tipo_cliente', 'tipo_proceso')),
  entidad_id  TEXT NOT NULL,
  accion      TEXT NOT NULL CHECK (accion IN ('anticipo_quitado', 'anticipo_registrado', 'borrado', 'cerrado', 'comprobante_adjuntado', 'creado', 'cuota_agregada', 'cuota_quitada', 'dado_de_baja', 'duplicado', 'editado', 'emitido', 'etapa_alcanzada', 'ganado', 'gasto_quitado', 'gasto_registrado', 'linea_agregada', 'linea_editada', 'linea_quitada', 'lineas_reordenadas', 'modulo_agregado', 'modulo_editado', 'modulo_quitado', 'modulos_reordenados', 'nota_agregada', 'pendiente_abierto', 'pendiente_cerrado', 'perdido', 'plan_editado', 'plantilla_editada', 'plantilla_guardada', 'reabierto', 'reactivado')),
  usuario_id  TEXT NOT NULL REFERENCES usuario (id),
  ocurrido_en TEXT NOT NULL CHECK (ocurrido_en IS strftime('%Y-%m-%dT%H:%M:%fZ', ocurrido_en)),
  detalle     TEXT
);

-- Las filas se **copian** y no se descartan, por el mismo argumento de `0002`
-- que `0005`, `0006`, `0009` y `0010` ya repitieron: un registro de auditoría
-- no empieza borrando evidencia, y como el vocabulario nuevo es un
-- superconjunto del viejo, ninguna fila existente puede violar el `CHECK`
-- ampliado.
INSERT INTO bitacora_nueva (id, tenant_id, entidad, entidad_id, accion, usuario_id, ocurrido_en, detalle)
SELECT id, tenant_id, entidad, entidad_id, accion, usuario_id, ocurrido_en, detalle FROM bitacora;

DROP TABLE bitacora;

ALTER TABLE bitacora_nueva RENAME TO bitacora;

-- ---------------------------------------------------------------------------
-- Lo que el `DROP TABLE` se llevó, recreado de donde vino
-- ---------------------------------------------------------------------------

-- Viene de `0002`, que lo heredó de T-2: es la consulta de las pantallas
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
-- M-2 · `arancel_renglon`
-- ===========================================================================
--
-- Un renglón por fila del papel: categoría → numeral → concepto → valor,
-- igual que el acuerdo. Son **453**, medidos y no estimados: 282 con monto
-- fijo, 97 con regla en texto y 74 rubros.
--
-- ## `tenant_id`, igual que todas (I-8)
--
-- La tabla lleva `tenant_id` y **toda** consulta filtra por él, incluidas las
-- que buscan por llave primaria: un UUID ajeno sigue siendo un UUID. Que el
-- arancel sea el mismo documento para los dos bufetes no cambia nada —lo que
-- es propio de cada uno es la columna `monto`, que es el motivo de la tabla—.
--
-- ## La clave es `(tenant_id, orden)`, **nunca el numeral**
--
-- Esto es lo primero que sorprende al mirar `arancel.json`, y es la trampa
-- que T-1 midió para que T-2 no la pise: **el acuerdo repite numerales**.
-- Medido sobre los 453 renglones: **44 renglones en 15 grupos** comparten
-- numeral con otro de su misma categoría. Tres causas, todas del documento
-- (lectura 13 de `scripts/arancel/lecturas.md`):
--
--   1. **Las letras de tercer nivel reinician bajo cada padre.** El acuerdo
--      escribe `a.1`, `a.2`, `b.1` sin repetir arriba la medida, así que
--      `b.1` es el primer sub-renglón de la letra `b` del 23 y también el de
--      la letra `b` del 25 —`ASUNTOS DE DERECHO DEL TRABAJO`—.
--   2. **Hay secciones numeradas dos veces.** En
--      `ACTUACIONES EN NEGOCIOS CRIMINALES` el acuerdo tiene dos bloques `5.`
--      —«DEFENSA EN NEGOCIOS CRIMINALES» y «QUERELLAS Y ACCIONES PENALES DE
--      LAS VÍCTIMAS DEL DELITO»— y vuelve a numerar desde 1 dentro de cada
--      bloque.
--   3. **Los renglones sin numerar heredan el numeral del padre**, que es el
--      único que el papel pone: «y por cada prórroga» (`orden` 2) cuelga del
--      `1` de migración.
--
-- Un `UNIQUE (tenant_id, categoria, numeral)` haría dos cosas, y la segunda
-- es la peor: **haría fallar la siembra**, y **haría parecer que el acuerdo
-- está mal numerado cuando el que está mal es nuestro supuesto**. El numeral
-- se guarda tal como está impreso porque es parte de la cita; lo que
-- identifica un renglón es su posición en el documento.
--
-- Nota de medición, porque el documento de la tajada dice otra cosa: el
-- recuento ahí anotado es «31 renglones comparten numeral». Lo medido sobre
-- `arancel.json` es **44 renglones en 15 grupos**, o 29 si se cuentan solo
-- las repeticiones por encima de la primera de cada grupo. Ninguna de las dos
-- lecturas da 31. La conclusión no cambia —y se refuerza—, pero el número sí,
-- y se deja escrito el medido.
--
-- ## Los tres `clase`, y qué trae cada uno
--
-- | `clase` | `monto_oficial` | `regla_oficial` | `monto` del bufete |
-- |---------|-----------------|-----------------|--------------------|
-- | `monto` | obligatorio     | nulo            | **sí**             |
-- | `regla` | nulo            | obligatorio     | **sí**             |
-- | `rubro` | nulo            | nulo            | **no**             |
--
-- Las tres filas de esa tabla son restricciones nombradas más abajo, y las
-- dos decisiones que piden defensa son éstas:
--
--   * **Un `regla` SÍ puede llevar `monto` del bufete.** Es lo que la tajada
--     pide con todas las letras: las reglas por cuantía se guardan como texto
--     «y el bufete escribe su propio monto al lado si quiere». Prohibirlo
--     dejaría 97 servicios sin ninguna forma de tener precio propio, que es
--     exactamente lo contrario del motivo de esta tabla.
--   * **Un `rubro` NO puede llevar ninguno de los tres.** Son los 74
--     encabezados que el acuerdo imprime sin valor porque solo agrupan a sus
--     hijos —«3. Inmigrantes», «12. Recursos Administrativos»—. Ofrecerle al
--     abogado un campo de precio sobre un título es ofrecerle que escriba un
--     dato que no significa nada, y la fila con ese dato escrito es una suma
--     mal hecha esperando a que alguien la haga.
--
-- ## `monto_oficial` y `monto` son **centavos enteros**, y la trampa
--
-- La misma de `0004`: en SQLite `INTEGER` es una **afinidad**, no un tipo. Un
-- 1500.5 no se puede convertir a entero sin pérdida, así que la columna lo
-- guarda tal cual, como real, y la declaración no impide nada. Verificado.
-- `typeof(x) = 'integer'` es lo único que lo impide de verdad, y no estorba a
-- nadie: un '2000' que llegue como texto sí se convierte sin pérdida y entra
-- como entero.
--
-- Las dos son nullable, y por razones distintas: `monto_oficial` es nulo en
-- los 171 renglones que el acuerdo imprime sin precio —las 97 reglas y los 74
-- rubros—, y `monto` es nulo mientras el bufete no haya decidido su propio
-- precio, que al principio son los 453. **Nulo no es cero**: un cero es una
-- decisión del bufete —«esto no lo cobramos»— y un nulo es la ausencia de
-- decisión, que es lo que hace que la pantalla de T-3 muestre la sugerencia
-- del acuerdo como valor de arranque en vez de un campo vacío.
--
-- ## `activo`: un renglón se desactiva, no se borra
--
-- La tajada lo pide así —«los renglones no se borran: se desactivan. El
-- preset siempre está»— y acá eso es estructura: `arancel_renglon_no_se_borra`
-- aborta todo `DELETE`, y la salida es `activo = 0`.
--
-- **Hoy no hay ninguna ruta que escriba esa columna**, y se dice en vez de
-- suponerse: T-2 abre lectura y la edición del `monto`, nada más. Quien la
-- escribe es la siembra, al insertar; el día que un acuerdo nuevo derogue un
-- renglón, lo escribirá una migración o la ruta que esa tarea necesite. Una
-- ruta construida hoy para nadie sería código sin prueba de uso.
CREATE TABLE arancel_renglon (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenant (id),
  orden         INTEGER NOT NULL
                  CONSTRAINT el_orden_es_la_posicion_en_el_documento
                  CHECK (typeof(orden) = 'integer' AND orden >= 1),
  categoria     TEXT NOT NULL,
  numeral       TEXT NOT NULL,
  concepto      TEXT NOT NULL,
  clase         TEXT NOT NULL
                  CONSTRAINT la_clase_del_renglon_es_una_de_las_tres
                  CHECK (clase IN ('monto', 'regla', 'rubro')),
  monto_oficial INTEGER
                  CONSTRAINT el_monto_oficial_es_centavos_enteros_no_negativos
                  CHECK (monto_oficial IS NULL
                         OR (typeof(monto_oficial) = 'integer'
                             AND monto_oficial >= 0)),
  regla_oficial TEXT,
  monto         INTEGER
                  CONSTRAINT el_monto_del_bufete_es_centavos_enteros_no_negativos
                  CHECK (monto IS NULL
                         OR (typeof(monto) = 'integer' AND monto >= 0)),
  activo        INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),

  -- El encabezado no tiene precio. Va **aparte** del `CHECK` de coherencia de
  -- abajo y no adentro, aunque las dos miren `clase`, porque son dos hechos
  -- distintos y el mensaje de rechazo tiene que distinguirlos: éste lo
  -- dispara una pantalla que le ofreció un campo de monto a un título, y el
  -- otro una siembra que trajo un renglón mal clasificado. Con un solo
  -- `CHECK`, SQLite diría el mismo nombre para los dos y habría que adivinar
  -- cuál fue — el argumento que `0004` dejó escrito para nombrarlos todos.
  CONSTRAINT un_rubro_no_lleva_precio
  CHECK (clase IS NOT 'rubro' OR monto IS NULL),

  -- Lo que cada clase promete traer del acuerdo. El `CASE` cubre los tres
  -- valores y **nada más**: cerrar el vocabulario es trabajo de
  -- `la_clase_del_renglon_es_una_de_las_tres`, y repetirlo acá con un `ELSE 0`
  -- serían dos guardas para el mismo hecho — neutralizar cualquiera de las
  -- dos dejaría a la otra atrapando el caso y ninguna prueba se pondría roja.
  -- Con el `CASE` sin `ELSE`, una `clase` inventada da NULL y pasa por acá,
  -- que es correcto: la que la rechaza es la otra.
  CONSTRAINT el_renglon_trae_lo_que_su_clase_promete
  CHECK (CASE clase
           WHEN 'monto' THEN monto_oficial IS NOT NULL AND regla_oficial IS NULL
           WHEN 'regla' THEN monto_oficial IS NULL AND regla_oficial IS NOT NULL
           WHEN 'rubro' THEN monto_oficial IS NULL AND regla_oficial IS NULL
         END)
);

-- El orden del documento es único dentro del bufete, y es la clave real de un
-- renglón. **Es también de lo que depende la idempotencia de la siembra**:
-- `INSERT … ON CONFLICT (tenant_id, orden) DO NOTHING` es toda la historia, y
-- sin este índice ese `ON CONFLICT` no tiene sobre qué resolver y la segunda
-- corrida duplicaría los 453 renglones.
--
-- A diferencia de `cotizacion_linea` (`0004`), acá el único no cuesta nada:
-- **el orden del acuerdo no se reordena**. No hay pantalla que mueva un
-- renglón, y el disparador de más abajo prohíbe cambiar `orden`, así que el
-- `UPDATE … SET orden = orden + 1` que allá obligaba a reescribir el tramo
-- entero acá no existe ni puede existir.
CREATE UNIQUE INDEX arancel_renglon_orden_unico
  ON arancel_renglon (tenant_id, orden);

-- La consulta de la pantalla de T-3: la tabla entera agrupada por categoría y
-- en el orden del documento. `(tenant_id, categoria, orden)` la contesta sin
-- ordenamiento temporal; con solo el único de arriba, agrupar 453 renglones
-- en 29 categorías costaría un `TEMP B-TREE`.
CREATE INDEX arancel_renglon_categoria
  ON arancel_renglon (tenant_id, categoria, orden);

-- ===========================================================================
-- M-3 · `arancel_nota`: las secciones que son solo prosa
-- ===========================================================================
--
-- `arancel.json` trae **57 notas** además de los 453 renglones: parágrafos,
-- notas al pie y aclaraciones que el acuerdo imprime dentro de una categoría
-- sin que sean un renglón tarifado. Son parte del documento y de lo que un
-- renglón significa —«PARÁGRAFO: En todo trámite se cargarán B/.200.00 por
-- cada dependiente» cambia el precio de las 24 filas de migración— así que
-- perderlas es perder arancel.
--
-- Y **dos categorías del acuerdo existen solo como prosa**, sin un solo
-- renglón en `registros`:
--
--   * `OTROS ASUNTOS` — todo lo no listado, a B/.150.00 la hora.
--   * `PROCESO DE SEPARACIONES DE BIENES, AISLADOS O ACCESORIOS A CUALQUIERA
--     DE LOS QUE TRATA LA SECCIÓN ANTERIOR` — «la misma tarifa de la sección
--     2 (PROCESO ORDINARIO)».
--
-- Si la siembra solo cargara `registros`, esas dos desaparecerían del arancel
-- sin que nadie lo note. Acá sobreviven, y la lectura de `GET /api/arancel`
-- las devuelve como categorías con `renglones: []` y sus notas, que es la
-- única forma de que se vean.
--
-- ## Por qué una segunda tabla y no una columna ni una `clase` más
--
-- Las tres salidas estaban sobre la mesa y las otras dos cuestan más:
--
--   * **Una columna `notas` en `arancel_renglon`** no puede existir: una nota
--     pertenece a la **categoría**, no a un renglón, y las dos categorías de
--     prosa no tienen ningún renglón donde colgarla. Habría que inventar una
--     fila de renglón para sostener la columna, que es la opción siguiente
--     con un disfraz.
--   * **Una cuarta `clase`** —`nota`— metería 57 filas sin numeral, sin
--     concepto y sin valor en la tabla de precios, y entonces **cada**
--     consulta y cada pantalla tendría que filtrarlas. El `CHECK` de
--     coherencia de clase se volvería un cuarto caso que no promete nada, y
--     el `UNIQUE (tenant_id, orden)` tendría que elegir entre compartir
--     numeración con los renglones o llevar la propia. Una clase que todos
--     los lectores excluyen no es una clase: es otra tabla mal puesta.
--
-- Una tabla propia dice lo que son —texto citado de una sección, en el orden
-- del documento— y nadie que lea precios tropieza con ellas.
--
-- ## Inmutable entera, sin excepción
--
-- No tiene columna editable: es cita y nada más. Por eso sus dos disparadores
-- van **sin condición**, como los de `bitacora`, y por eso **no lleva un
-- `arancel_nota_tenant_inmutable`**: con un `BEFORE UPDATE` que aborta todo,
-- un segundo disparador de `UPDATE` sobre esta tabla sería código muerto —el
-- primero corre igual y aborta antes—, y un disparador que no puede fallar es
-- un disparador que ninguna prueba sostiene.
CREATE TABLE arancel_nota (
  id        TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenant (id),
  orden     INTEGER NOT NULL
              CONSTRAINT el_orden_de_la_nota_es_su_posicion_en_el_documento
              CHECK (typeof(orden) = 'integer' AND orden >= 1),
  categoria TEXT NOT NULL,
  texto     TEXT NOT NULL
);

-- Lo mismo que el de los renglones, y por lo mismo: es sobre esto que
-- resuelve el `ON CONFLICT` de la siembra.
CREATE UNIQUE INDEX arancel_nota_orden_unico
  ON arancel_nota (tenant_id, orden);

CREATE INDEX arancel_nota_categoria
  ON arancel_nota (tenant_id, categoria, orden);

-- ===========================================================================
-- M-4 · Las guardas de la cita
-- ===========================================================================
--
-- El criterio de aceptación 2 de la tajada dice «el monto oficial no se puede
-- editar, ni por la API». Son dos mitades y las dos existen a propósito:
--
--   * **La API se niega** y lo dice con un 409 `renglon_citado`
--     (`worker/arancel/rutas.ts`), para que la pantalla pueda explicar qué
--     pasó. Sin esa mitad, un cuerpo con `montoOficial` moriría en el
--     disparador y saldría como un 500 de SQLite crudo, que no es una
--     negativa sino una caída.
--   * **La base aborta**, acá abajo. Sin esta mitad, la cita quedaría
--     sostenida por un `if` — y `docs/diseno.md` §5 dice sin vueltas que una
--     regla que solo vive en el código es la que el primer script de
--     importación se salta. Esta tabla **va a** recibir scripts: la siembra
--     es uno.
--
-- Las dos tienen prueba propia (`test/arancel-rutas.spec.ts`), y eso importa:
-- neutralizar cualquiera de las dos pone algo rojo.

-- `tenant_id` va **aparte** de la guarda de la cita, y no es olvido: es la
-- misma decisión que `0006` dejó escrita para `cotizacion`. Son dos hechos
-- distintos —«una fila no cambia de bufete» vale en todos los casos, y «lo
-- que el acuerdo imprime no se edita» es de esta tabla— y juntarlos haría que
-- neutralizar uno dejara al otro atrapando el caso, con lo que ninguna de las
-- dos guardas quedaría verificable.
--
-- Se copia el mensaje de los catorce de `0003` letra por letra: una fila no
-- cambia de bufete, y el texto es el mismo para que una búsqueda por
-- «columna inmutable» los encuentre todos.
CREATE TRIGGER arancel_renglon_tenant_inmutable
BEFORE UPDATE ON arancel_renglon
WHEN NEW.tenant_id IS NOT OLD.tenant_id
BEGIN
  SELECT RAISE(ABORT, 'columna inmutable: arancel_renglon.tenant_id no se reasigna; una fila no cambia de bufete');
END;

-- **La guarda de la cita.** Siete columnas, que son las siete que el Acuerdo
-- imprime. Lo que queda afuera es exactamente lo que el bufete decide:
-- `monto` y `activo`.
--
-- `id` tampoco está en la lista, y vale decir por qué: es la llave primaria y
-- cambiarla es cambiar de fila, no editar ésta. Las siete de abajo son las
-- que un `UPDATE` plausible tocaría creyendo corregir algo.
--
-- ## `IS NOT` y nunca `<>`, y acá está load-bearing en tres columnas
--
-- `monto_oficial` y `regla_oficial` son nullable, y `monto_oficial` lo es en
-- 171 de los 453 renglones. Con `<>`, un
-- `UPDATE arancel_renglon SET monto_oficial = NULL WHERE …` sobre un renglón
-- con precio daría una comparación NULL, el `WHEN` daría falso y **la
-- escritura pasaría**: el precio oficial de una visa se borraría y el enlace
-- «de dónde sale este precio» de T-3 se quedaría sin nada que mostrar, sin
-- ningún error. Y al revés, poner un `regla_oficial` donde había nulo también
-- pasaría. Es el peor agujero que esta tarea podía dejar y lo abre un solo
-- carácter, igual que el de `cotizacion.snapshot` en `0006`. Medido, y con
-- prueba de rechazo por cada columna nullable.
--
-- `clase` es la tercera: es `NOT NULL`, así que `<>` se comportaría igual,
-- pero se escribe `IS NOT` por el mismo argumento de consistencia que `0004`
-- dejó escrito para sus quince — la regla es una sola, y escribirla de dos
-- formas según la línea es peor que cualquiera de las dos.
--
-- ## No lleva excepción por igualdad, y eso sí es una decisión
--
-- `IS NOT` ya deja pasar el `UPDATE` que reescribe el mismo valor, y eso hace
-- falta: la ruta de edición escribe con `SET monto = ?` solamente, pero una
-- siembra futura o una migración pueden pasar la fila entera. Lo que no pasa
-- es un valor **distinto**, que es el hecho que esto prohíbe.
CREATE TRIGGER arancel_renglon_citado_no_se_edita
BEFORE UPDATE ON arancel_renglon
WHEN NEW.orden IS NOT OLD.orden
  OR NEW.categoria IS NOT OLD.categoria
  OR NEW.numeral IS NOT OLD.numeral
  OR NEW.concepto IS NOT OLD.concepto
  OR NEW.clase IS NOT OLD.clase
  OR NEW.monto_oficial IS NOT OLD.monto_oficial
  OR NEW.regla_oficial IS NOT OLD.regla_oficial
BEGIN
  SELECT RAISE(ABORT, 'arancel citado: lo que el Acuerdo imprime no se edita; lo editable es el monto del bufete');
END;

-- Un renglón del acuerdo no se borra: se desactiva. El mensaje dice la salida
-- porque un `RAISE` que solo prohíbe deja a quien lo pisa sin saber qué hacer.
CREATE TRIGGER arancel_renglon_no_se_borra
BEFORE DELETE ON arancel_renglon
BEGIN
  SELECT RAISE(ABORT, 'arancel citado: un renglón del Acuerdo no se borra; se desactiva con activo = 0');
END;

-- Las notas no tienen nada editable, así que las dos van sin condición.
CREATE TRIGGER arancel_nota_no_se_actualiza
BEFORE UPDATE ON arancel_nota
BEGIN
  SELECT RAISE(ABORT, 'arancel citado: una nota del Acuerdo no se actualiza');
END;

CREATE TRIGGER arancel_nota_no_se_borra
BEFORE DELETE ON arancel_nota
BEGIN
  SELECT RAISE(ABORT, 'arancel citado: una nota del Acuerdo no se borra');
END;
