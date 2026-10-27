# El catálogo de módulos se configura, y le enseña a la IA

## El problema

Las palabras del usuario, que son el criterio:

> «Cada módulo de cotización debe ser editable, y al estar apoyados en la IA,
> una descripción o un prompt para su construcción. Así ayudamos a la IA a
> entender el propósito de cada módulo. E igual que los precios, le damos como
> preset los módulos ya configurados.»

Hoy los seis tipos de módulo de prosa están escritos en el código, cerrados, y
**el rótulo es todo lo que el sistema sabe de ellos**. Eso tiene dos
consecuencias, y la segunda es la que duele:

1. El abogado no puede agregar un módulo propio ni renombrar uno. Agregar un
   tipo es un despliegue.
2. **La IA tampoco sabe para qué sirve cada módulo.** `worker/ia/prompt.ts:238`
   le pasa al modelo la lista `alcance · Alcance`, `supuestos · Supuestos`, y
   nada más. El modelo deduce el propósito del nombre. Que a veces acierta.

La segunda es la razón de ser de esta tajada. La primera es la que la hace
posible: un campo de descripción tiene que vivir en algún lado, y ese lado es
una fila.

## Lo que se midió antes de decidir

La decisión que esta tajada revierte está escrita en `docs/diseno.md:379`:

> «El catálogo de tipos de módulo vive **como registro tipado en código**, no
> como configuración editable en pantalla. Agregar un tipo nuevo es un
> despliegue, no un CRUD de plantillas.»

Y el argumento con que se justifica está en `docs/diseno.md:258`: detrás de un
tipo de módulo *«hay código — un renderizador y un esquema»*, a diferencia del
tipo de cliente, que es sólo una etiqueta y por eso sí vive en tabla.

**Ese argumento no se cumple.** Medido:

| Hecho | Dónde |
|---|---|
| La hoja dibuja los seis idénticos: `<h2>{rotulo}</h2><p>{contenido}</p>` | `src/pantallas/cotizaciones/HojaDeCotizacion.tsx:239` |
| El prompt recorre el catálogo; no sabe qué es «alcance» | `worker/ia/prompt.ts:238` |
| El editor dibuja un `<select>` del catálogo, sin rama por tipo | `src/pantallas/cotizaciones/EditorDeModulos.tsx:108` |
| El validador sólo verifica pertenencia | `worker/cotizaciones/modulos.ts:201` |
| **Ninguno** de los seis disparadores de `cotizacion_modulo` nombra `tipo` | `0004:419,548,562` · `0006:439,448,456` |

No hay renderizador por tipo ni esquema por tipo. Los seis difieren
**únicamente en el rótulo**, que es la definición exacta de «etiqueta» con la
que `docs/diseno.md:258` mandó al tipo de cliente a una tabla de catálogo. Así
que esto no es contradecir el documento: es aplicarle su propio criterio al
caso que había clasificado mal. §8 y §6 se corrigen en T-2.

Lo que **sí** era cierto de aquel párrafo es el costo —«para dos personas, ese
editor es un mes de trabajo»— y por eso esta tajada no construye un editor de
plantillas de documento. Construye una tabla de catálogo con cuatro campos.

### Lo que la base ya tiene a favor

- **Un solo tenant**, con id fijo sembrado en `0001:254`. Los seis presets se
  siembran **en la migración**, no en un script como el arancel: son seis filas
  escritas a mano, no 453 extraídas de un PDF, y la migración las necesita
  presentes para que el backfill de la tajada 2 sea un `JOIN` y no una
  adivinanza.
- **El snapshot ya separa la clave del rótulo.** `snapshot.ts:118` lo dice con
  todas las letras: «`tipo` es la clave … `rotulo` es el encabezado que la
  persona leyó». Las 6 cotizaciones emitidas de la base local ya guardan su
  rótulo congelado, así que renombrar una plantilla mañana **no toca** ningún
  documento emitido. Ese problema ya estaba resuelto antes de que existiera.

### Lo que esta tajada cuesta de verdad

- **La bitácora se reconstruye.** SQLite no tiene `ALTER TABLE … ADD
  CONSTRAINT`, así que agregar `modulo_plantilla` a `EntidadRegistrada` obliga a
  reconstruir la tabla entera y a re-crear su índice y sus tres disparadores
  letra por letra. Es la séptima vez: `0002:205`, `0005:139`, `0006:121`,
  `0009:158`, `0010:294`, `0012:148`. Hay forma establecida y una prueba que la
  compara contra `sqlite_master`; no se inventa nada.
  **Los verbos no cuestan nada**: `creado`, `editado`, `dado_de_baja` y
  `reactivado` ya están en el `CHECK` de `accion` (`0012:132`). Se agrega la
  entidad, no el vocabulario.
- **`TipoDeModulo` muere, pero no en esta tajada.** La unión de
  `worker/contract.ts:1540` sobrevive la tajada 1 entera: las seis claves
  siguen cerradas por el `CHECK` de `0004:218`, y lo único que se muda a la base
  es el **rótulo y la descripción**. La unión muere en la tajada 2, cuando
  `cotizacion_modulo.tipo` pase a ser una referencia. Decirlo así no es
  cobardía: es que el día que se pierda la red del compilador conviene que sea
  el único cambio del día.

## La forma

Una tabla `modulo_plantilla` con la misma asimetría que `arancel_renglon`, que
es la que el usuario pidió por su nombre («igual que los precios»):

| Columna | Qué es |
|---|---|
| `clave` | El identificador estable que la IA copia tal cual y que el snapshot congela. **Inmutable.** |
| `rotulo_oficial`, `descripcion_oficial` | El preset. Protegido por disparador, igual que lo que el Acuerdo imprime. |
| `rotulo`, `descripcion` | Lo del bufete. Editable, nullable: **NULL significa «uso el preset»**, y es cómo se vuelve atrás. |
| `orden` | La posición sugerida en la cotización. |
| `activo` | Se da de baja; **no se borra**. |

`COALESCE(rotulo, rotulo_oficial)` es el rótulo vigente, con la misma forma que
`0015` le dio al precio. Y dos invariantes que van en la base y no en las
buenas intenciones:

- Toda plantilla tiene rótulo vigente: `COALESCE(rotulo, rotulo_oficial) IS NOT NULL`.
- **Toda plantilla tiene descripción vigente.** No es opcional y ahí está la
  tajada entera: una plantilla sin descripción es una plantilla que la IA va a
  usar mal, que es exactamente el defecto que vinimos a arreglar.

Y lo que la pantalla hace con eso es lo que `Precios.tsx` ya hace con un monto:
un solo valor por campo —nunca una comparación al lado—, con una marca
discreta cuando el bufete lo cambió y un modo de volver al preset.
`precios.ts:238` ya tiene el vocabulario (`OrigenDelPrecio`) y `:131` la marca.

### Los seis presets

Las descripciones se escriben acá para que se puedan discutir antes de ser una
migración. Son lo que la IA va a leer:

| Clave | Rótulo | Descripción |
|---|---|---|
| `antecedentes` | Antecedentes | Qué pasó antes de la consulta: los hechos que el cliente relató, las fechas que importan y el estado actual del asunto. Sin opinión jurídica y sin anticipar resultados. |
| `alcance` | Alcance | Qué trabajo asume el bufete: las gestiones concretas, ante qué entidades, y qué recibe el cliente al terminar. Con plazos cuando se puedan sostener. |
| `exclusiones` | Exclusiones | Qué no está incluido y el cliente podría suponer que sí: trámites conexos, instancias posteriores, gastos de terceros, representación en otra jurisdicción. |
| `supuestos` | Supuestos | De qué depende esta propuesta: documentación que el cliente debe aportar, hechos que se dan por ciertos, y plazos de terceros fuera del control del bufete. Si un supuesto no se cumple, el alcance y el precio cambian. |
| `clausulas` | Cláusulas | Las condiciones de la contratación: forma y momento de pago, vigencia de la oferta, causales de terminación, y qué pasa con lo pagado si el encargo se interrumpe. |
| `nota_cliente` | Nota al cliente | Un mensaje breve y directo al cliente, sin jerga, sobre por qué esta propuesta responde a lo que pidió. No repite el alcance. |

### Lo que la IA recibe

`worker/ia/prompt.ts:238` pasa de

```
- alcance · Alcance
```

a

```
- alcance · Alcance · Qué trabajo asume el bufete: las gestiones concretas, …
```

Seis descripciones son unos 800 caracteres contra los 30.304 que ya pesa la
sección del arancel. El costo es ruido; el beneficio es que el modelo deje de
deducir el propósito del nombre. **Se mide antes y después, no se estima.**

## Alcance autorizado

### Tajada 1 — esta

Entra: la tabla con sus presets y sus disparadores, la reconstrucción de la
bitácora, las rutas de lectura y edición, la pantalla en catálogos, la baja y
la reactivación, que el rótulo vigente salga de la base en toda la aplicación,
y la descripción inyectada al prompt.

**No entra**: crear plantillas nuevas, borrar una plantilla, y tocar
`cotizacion_modulo`. El editor de la cotización sigue ofreciendo exactamente
las plantillas activas de las seis claves que el `CHECK` de `0004` ya permite.

### Tajada 2 — después, documentada acá y no agendada

`cotizacion_modulo.tipo` pasa a `plantilla_id` —reconstrucción de la tabla con
backfill de las 54 filas vivas, su índice único y sus seis disparadores
re-creados—, `TipoDeModulo` desaparece, y recién ahí se pueden crear
plantillas nuevas con clave derivada del rótulo. El verbo `creado` ya está en
el `CHECK` de `accion`, así que **la tajada 2 no necesita migración de
bitácora**.

## Las tareas

### T-1 · La plantilla existe, trae su descripción, y nadie la borra

- [x] `migrations/0016_…` crea `modulo_plantilla` con las siete columnas, el
      único `(tenant_id, clave)`, y **sin** único en `orden` —por el mismo
      argumento que `0001` le aplicó a `etapa_plantilla`: reordenar
      incrementando viola el único fila por fila y SQLite no difiere
      restricciones—.
- [x] Los dos `CHECK` de vigencia: rótulo vigente y descripción vigente, los
      dos con `COALESCE` y la forma de `0015`.
- [x] Disparadores: `tenant` inmutable, `clave` inmutable, el preset no se
      edita, y la fila no se borra. Los cuatro con la forma de los de
      `arancel_renglon` (`0012:462,501,516`).
- [x] Los seis presets sembrados en la migración, con las descripciones de
      arriba y `clave` igual al `tipo` que `0004:218` ya permite.
- [x] `bitacora` reconstruida con `modulo_plantilla` en el `CHECK` de
      `entidad`, copiando las filas y re-creando el índice y los tres
      disparadores letra por letra. Ningún verbo nuevo.
- [x] **Y la mitad de TypeScript en la misma tarea, no en T-2**:
      `modulo_plantilla` entra a `EntidadRegistrada` (`contract.ts:2501`) y a
      los dos `satisfies Record<EntidadRegistrada, …>`
      (`bitacora/rutas.ts:85`, `bitacora/vocabulario.ts:279`) con los verbos
      `editado`, `dado_de_baja`, `reactivado`. No es prolijidad: la prueba de
      `test/bitacora-api.spec.ts:1598` lee el `CHECK` de `sqlite_master` y lo
      enfrenta a `ENTIDADES_REGISTRADAS`, así que partir el par deja la suite
      en rojo entre una tarea y la otra.
      **`creado` no entra**: no hay ruta que lo escriba hasta la tajada 2, y
      la ausencia del verbo es cómo este vocabulario dice que la operación no
      es de esta unidad (`vocabulario.ts:240` lo argumenta para la cuota).
      `src/bitacora.ts` **no se toca**: su `VERBOS_DE_BITACORA` está indexado
      por acción, no por entidad, y no hay acción nueva.
- [x] Sondas hostiles contra cada guarda, corridas a mano contra la base
      local: editar un `*_oficial`, cambiar la clave, borrar una fila, dejar
      una plantilla sin descripción vigente, mudar el tenant.

**Ruta: delegada.** Una migración de este tamaño con sus sondas es un escritor
acotado; el disparador es la regla de escritura y la de preparación.

### T-2 · El rótulo y la descripción se editan desde catálogos

- [ ] **Lo que T-1 dejó debiendo, y es lo primero de esta tarea.**
      `existeLaFila` de `worker/bitacora/rutas.ts` es un `switch` exhaustivo, y
      agregar `modulo_plantilla` al vocabulario obligó a darle un `case`
      **antes** de que exista el puerto que lo contesta. Quedó devolviendo
      `false`, así que `/api/plantillas-modulo/{id}/bitacora` contesta 404 para
      una fila que sí existe. Es un defecto conocido y acotado —hoy nadie llama
      esa dirección y no hay una sola entrada de esta entidad—, y se cierra
      reemplazando esa línea por `puertos.plantillas.obtener(…)` al abrir el
      repositorio, más el parámetro nuevo en `worker/index.ts`. **No se dejó en
      `true`** a propósito: contestar 200 con una lista vacía confirmaría un
      identificador ajeno, que es la fuga que ese archivo niega.
- [ ] `worker/plantillas/{rutas,dominio,repositorio}.ts` con la forma de
      `worker/arancel/`: `GET` de la colección, `PUT` del renglón, y la baja.
      Registradas en `worker/index.ts` **antes** de la bitácora o después según
      lo que el subruta `/bitacora` exija, como ya resolvió el arancel.
- [ ] `src/api/plantillas.ts` y la pantalla `/catalogos/modulos`, con la
      disciplina de `Precios.tsx`: un valor por campo, marca discreta de
      editado, y volver al preset vaciando el campo.
- [ ] `docs/diseno.md` §8 `### El catálogo` (:377) y §6 (:258) corregidos: se
      dice qué se revirtió y por qué, con la medición de arriba. **Un documento
      de diseño que sigue afirmando lo contrario de lo que hace el código es
      peor que no tenerlo.**

**Ruta: delegada.** Es la regla de escritura con margen: nueve archivos.

### T-3 · El rótulo deja de vivir en el código

- [ ] El rótulo vigente sale de la base en toda la aplicación: el editor de
      módulos, la hoja, el detalle, y el `detalle` de la bitácora que
      `repositorio.ts:1747` arma con `rotuloDeTipo`.
- [ ] Los rótulos escritos a mano en `worker/cotizaciones/modulos.ts:80`
      quedan con **exactamente un uso**: la semilla de la migración. Si queda
      un segundo, son dos fuentes y una se va a quedar vieja.
- [ ] La red del compilador que se pierde (`TiposSinRotulo`, `:126`) se
      reemplaza por una prueba que lee las claves de `modulo_plantilla` y las
      enfrenta a `TIPOS_DE_MODULO` **en los dos sentidos**, que es la forma que
      `test/modulos-api.spec.ts:77` ya usa contra el `CHECK`. La red no se
      pierde: cambia de lugar.
- [ ] El snapshot sigue congelando el rótulo vigente al emitir, y las 6
      cotizaciones emitidas de la base local siguen mostrando el suyo. Se
      prueba contra esas filas, no contra una sembrada.

**Ruta: delegada.**

### T-4 · La IA recibe el propósito de cada módulo

- [ ] `worker/ia/prompt.ts` inyecta `clave · rótulo · descripción` leyendo la
      base, y **falla cerrado** si no hay ninguna plantilla activa, con la
      misma regla que el catálogo de servicios ya aplica.
- [ ] El tamaño del prompt medido antes y después, en caracteres, anotado acá.
- [ ] `tipo_de_modulo_desconocido` sigue siendo el motivo cuando el modelo
      nombra una clave que no está en la lista inyectada, y la frase no cambia:
      lo que cambió es de dónde sale la lista.

**Ruta: inline.** Es un archivo y el cambio está entendido.

## Criterios de aceptación

1. Desde `/catalogos/modulos` se cambia el rótulo y la descripción de un
   módulo, y el cambio se ve en el editor de una cotización nueva.
2. Vaciar el campo vuelve al preset, y el preset sigue siendo el original.
3. Ningún camino de la aplicación ni de SQL puede borrar una plantilla ni
   editar su preset ni su clave.
4. Una plantilla sin descripción vigente no existe.
5. La descripción de cada módulo llega al prompt, medido en caracteres.
6. Las 6 cotizaciones emitidas de la base local siguen mostrando su rótulo
   congelado, intacto.
7. `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e` en verde.

## Verificación

`pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm test:e2e`

Prueba primero donde haya RED que valga: la lógica de resolución del rótulo y
la de la descripción son puras; las guardas de SQL se prueban con sondas que
tienen que fallar; la pantalla y el prompt se miden.

## Entrega

Forecast de la tajada 1: **~1.000 líneas propias** (migración ~350, worker
~250, pantalla ~250, pruebas ~150+). Rama propia con un commit por tarea.
Empujar y mezclar a `main` siguen siendo decisión del usuario.

## Progreso

- Documento creado. Secuencia elegida por el usuario: dos tajadas, ésta
  primero.

### T-1 cerrada

**Archivos.** `migrations/0016_una_plantilla_de_modulo_dice_para_que_sirve.sql`
(561 líneas) y `test/plantillas-esquema.spec.ts` (631 líneas), nuevos, más 104
líneas en `worker/contract.ts`, `worker/bitacora/vocabulario.ts` y
`worker/bitacora/rutas.ts`. `src/bitacora.ts` no se tocó, como estaba previsto.

**RED observado antes de la migración.** `npx vitest run
test/plantillas-esquema.spec.ts` sobre el esquema sin `0016`: **25 fallando, 4
pasando** de 29. El error era siempre el mismo —`D1_ERROR: no such table:
modulo_plantilla`— salvo en la lista de disparadores, que comparaba `[]` contra
los cuatro nombres. Las 4 que pasaban no tocan la tabla: las dos que leen el
`CHECK` de `bitacora` buscando verbos que ya estaban, la que exige que ninguna
entidad inventada entre, y la que afirma que no hay único sobre `orden` —que
sobre cero índices pasa por vacuidad, y es por eso que no se la cuenta como
prueba de nada hasta que la tabla existe—. Con la migración: **29 pasando**.

**Siembra medida contra la base local.** Las seis filas, en el orden del
documento, con `rotulo`/`descripcion` en NULL y `activo = 1`. Largo de cada
`descripcion_oficial`, en caracteres: antecedentes 168, alcance 148,
exclusiones 155, supuestos 216, cláusulas 162, nota al cliente 125. **Total:
974.** El documento estimaba «unos 800»; lo medido es 974, y el orden de
magnitud frente a los 30.304 de la sección del arancel no cambia. T-4 mide el
prompt antes y después.

**Reconstrucción de la bitácora.** Séptima. Las **158** entradas de la base
local y las **11** cotizaciones siguen ahí después del `DROP TABLE`; el índice
y los tres disparadores quedaron recreados y `test/bitacora-api.spec.ts` pasó
**sin tocarse**, incluidas las dos pruebas que comparan el `CHECK` de `entidad`
contra `ENTIDADES_REGISTRADAS` y las definiciones de los disparadores contra lo
que escribieron `0002` y `0003`.

**Las sondas hostiles, a mano, con el mensaje exacto que dio cada una.**
`npx wrangler d1 execute app-cotizador --local --command …`:

| Sonda | Qué contestó |
|---|---|
| `UPDATE … SET rotulo_oficial = 'Otro rotulo'` | `plantilla de módulo: el preset no se edita; lo editable es el rótulo y la descripción del bufete: SQLITE_CONSTRAINT_TRIGGER` |
| `UPDATE … SET descripcion_oficial = 'Otra descripcion'` | el mismo |
| `UPDATE … SET descripcion_oficial = NULL` | el mismo — **es el caso que `<>` dejaría pasar** |
| `UPDATE … SET clave = 'alcance_nuevo'` | `plantilla de módulo: la clave no se edita; es lo que el snapshot congela y lo que la IA copia: SQLITE_CONSTRAINT_TRIGGER` |
| `DELETE FROM modulo_plantilla` | `plantilla de módulo: una plantilla no se borra; se retira con activo = 0: SQLITE_CONSTRAINT_TRIGGER` |
| `UPDATE … SET tenant_id = <otro>` | `columna inmutable: modulo_plantilla.tenant_id no se reasigna; una fila no cambia de bufete: SQLITE_CONSTRAINT_TRIGGER` |
| `INSERT` sin descripción vigente | `CHECK constraint failed: la_plantilla_tiene_descripcion_vigente: SQLITE_CONSTRAINT_CHECK` |
| `INSERT` sin rótulo vigente | `CHECK constraint failed: la_plantilla_tiene_rotulo_vigente: SQLITE_CONSTRAINT_CHECK` |
| `INSERT` con una clave repetida | `UNIQUE constraint failed: modulo_plantilla.tenant_id, modulo_plantilla.clave: SQLITE_CONSTRAINT_UNIQUE` |

**Y los contrapesos, también a mano**, porque una guarda que rechazara todo
habría pasado las nueve de arriba: escribir `rotulo` y `descripcion` del
bufete, vaciarlos y ver volver el preset (`COALESCE` devolvió «Alcance»),
`activo = 0` y `activo = 1`, y —el que importa— **`UPDATE modulo_plantilla SET
orden = orden + 1` sobre las seis filas en una sola sentencia**, que es
exactamente la escritura que un único sobre `orden` habría hecho imposible. Las
cuatro pasaron. La base local quedó restaurada al estado sembrado.

**Verificación.** `pnpm lint`: sin hallazgos. `pnpm typecheck`: 0 errores.
`pnpm test`: **50 archivos, 2.545 pruebas, todas pasando**. `pnpm test:e2e`:
**509 pasando** en 1,4 min —`e2e/sin-scroll-horizontal.spec.ts` incluido, sin
necesidad de repetirlo—.

**Lo que quedó debiendo, anotado como primera tarea de T-2**: el `case` de
`modulo_plantilla` en `existeLaFila` devuelve `false` porque el puerto no
existe todavía, así que la dirección de bitácora de una plantilla contesta 404.
Está argumentado al lado del `case` y en la lista de T-2.

**Lo que no se tocó y se midió**: `src/bitacora.ts`, `cotizacion_modulo`, la
unión `TipoDeModulo` y los rótulos de `worker/cotizaciones/modulos.ts` —que
ahora tienen dos fuentes, la del código y la de la siembra, y es T-3 la que
deja una sola—.

**Siguiente paso**: T-2, empezando por cerrar el 404 de arriba.
