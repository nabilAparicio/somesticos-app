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

### Tajada 2 — agendada

La pidió el usuario al mirar la pantalla terminada: «No veo la opción de crear
un módulo, sólo editar y dar de baja.» Es correcto y era el plan, y conviene
dejar escrito por qué no podía estar antes.

**Medido en la base local, no supuesto.** `modulo_plantilla` ya no tiene
límite de claves; `cotizacion_modulo` sí lo tiene:

```
tipo  CHECK (tipo IN ('alcance', 'exclusiones', 'antecedentes',
                      'supuestos', 'clausulas', 'nota_cliente'))
```

Un botón «crear» sobre la tajada 1 habría creado una plantilla **inservible**:
la fila nacería bien, y el primer módulo de ese tipo en una cotización lo
rechazaría la base. Una pantalla que ofrece crear algo que después no se puede
usar es peor que una pantalla sin el botón.

El verbo `creado` ya está en el `CHECK` de `accion` (`0012:132`), así que
**esta tajada no necesita migración de bitácora**.

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

- [x] **Lo que T-1 dejó debiendo, y es lo primero de esta tarea.**
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
- [x] `worker/plantillas/{rutas,dominio,repositorio}.ts` con la forma de
      `worker/arancel/`: `GET` de la colección, `PUT` del renglón, y la baja.
      Registradas en `worker/index.ts` **antes** de la bitácora o después según
      lo que el subruta `/bitacora` exija, como ya resolvió el arancel.
- [x] `src/api/plantillas.ts` y la pantalla `/catalogos/modulos`, con la
      disciplina de `Precios.tsx`: un valor por campo, marca discreta de
      editado, y volver al preset vaciando el campo.
- [x] `docs/diseno.md` §8 `### El catálogo` (:377) y §6 (:258) corregidos: se
      dice qué se revirtió y por qué, con la medición de arriba. **Un documento
      de diseño que sigue afirmando lo contrario de lo que hace el código es
      peor que no tenerlo.**

**Ruta: delegada.** Es la regla de escritura con margen: nueve archivos.

### T-3 · El rótulo deja de vivir en el código

- [x] El rótulo vigente sale de la base en toda la aplicación: el editor de
      módulos, la hoja, el detalle, y el `detalle` de la bitácora que
      `repositorio.ts:1747` arma con `rotuloDeTipo`.
- [x] Los rótulos escritos a mano en `worker/cotizaciones/modulos.ts:80`
      quedan con **exactamente un uso**: la semilla de la migración. Si queda
      un segundo, son dos fuentes y una se va a quedar vieja.
      **Queda un segundo, y es `worker/ia/prompt.ts:238`**, que está fuera de
      la superficie de esta tarea porque es T-4. Está dicho en el código, al
      lado de la constante, y las dos fuentes quedan atadas por una prueba
      bidireccional contra `rotulo_oficial`. Se cierra con T-4.
- [x] La red del compilador que se pierde (`TiposSinRotulo`, `:126`) se
      reemplaza por una prueba que lee las claves de `modulo_plantilla` y las
      enfrenta a `TIPOS_DE_MODULO` **en los dos sentidos**, que es la forma que
      `test/modulos-api.spec.ts:77` ya usa contra el `CHECK`. La red no se
      pierde: cambia de lugar.
- [x] El snapshot sigue congelando el rótulo vigente al emitir, y las 6
      cotizaciones emitidas de la base local siguen mostrando el suyo. Se
      prueba contra esas filas, no contra una sembrada.

**Ruta: delegada.**

### T-4 · La IA recibe el propósito de cada módulo

- [x] `worker/ia/prompt.ts` inyecta `clave · rótulo · descripción` leyendo la
      base, y **falla cerrado** si no hay ninguna plantilla activa, con la
      misma regla que el catálogo de servicios ya aplica.
- [x] El tamaño del prompt medido antes y después, en caracteres, anotado acá.
- [x] `tipo_de_modulo_desconocido` sigue siendo el motivo cuando el modelo
      nombra una clave que no está en la lista inyectada, y la frase no cambia:
      lo que cambió es de dónde sale la lista.

**Ruta: inline.** Es un archivo y el cambio está entendido.

### T-5 · Un módulo apunta a su plantilla, no a una cadena

- [x] `migrations/0017_…` reconstruye `cotizacion_modulo`: `tipo TEXT CHECK(…)`
      pasa a `plantilla_id TEXT NOT NULL REFERENCES modulo_plantilla (id)`.
      La forma es la que `0012:112-200` ya usó siete veces sobre `bitacora`,
      pero **acá hay un backfill de verdad**: las 54 filas vivas se mapean por
      `JOIN` entre el `tipo` viejo y la `clave` de la plantilla. Cero filas sin
      plantilla, verificado antes del `DROP` y no después.
- [x] Se re-crean letra por letra el índice `cotizacion_modulo_orden_unico` y
      los **seis** disparadores: tres de `0004` (:419, :548, :562) y tres de
      `0006` (:439, :448, :456). Ninguno nombra `tipo`, así que ninguno cambia
      de texto — pero perder uno en el `DROP` es el defecto silencioso que esta
      forma de migración existe para evitar.
- [x] **Y un séptimo que el enunciado no pedía**, decidido al escribirlo:
      `cotizacion_modulo_tenencia_coherente_al_actualizar`. `0004:300` dejó
      escrito por qué esta tabla no lo llevaba —las dos únicas columnas que
      miraría son inmutables— y esta migración le quita la premisa, porque
      `plantilla_id` es una tercera columna mutable que cruza tablas. El
      argumento entero está en el progreso.
- [x] **Una arista nueva de tenencia.** `plantilla_id` cruza tablas, así que
      entra a `cotizacion_modulo_tenencia_coherente_al_insertar`. La tabla de
      siete aristas de `0004:300` pasa a ocho, y se dice ahí.
- [x] El lado de TypeScript lee la plantilla en vez de la cadena. `TipoDeModulo`
      **sobrevive esta tarea** como el tipo de la clave: su muerte es T-6.
- [x] El snapshot sigue congelando clave y rótulo vigente, y las 6 cotizaciones
      emitidas siguen mostrando el suyo. Se mide antes y después mutando la
      fuente viva en el medio, como ya hizo T-3: con presets idénticos los dos
      caminos son indistinguibles y la prueba no probaría nada.
- [x] Sondas hostiles: un módulo apuntando a una plantilla de otro bufete, y
      uno apuntando a una plantilla inexistente.

**Ruta: delegada.**

### T-6 · Muere `TipoDeModulo`, y es el único cambio del día

- [x] Se van la unión de `worker/contract.ts`, `TIPOS_DE_MODULO`,
      `esTipoDeModulo` y `TiposFueraDeLaLista`. La clave pasa a ser una cadena
      validada contra el catálogo inyectado, que es lo que `validarModulo` ya
      hace desde T-4 con `clavesOfrecidas`.
      **Y el enunciado tenía un hueco que hubo que cerrar**: `clavesOfrecidas`
      es del camino del modelo, no del cable. La ruta de módulos validaba con
      `esTipoDeModulo`, así que borrarlo sin reemplazo degradaba un 422 a un
      500. Está medido en el progreso.
- [x] Las tres pruebas bidireccionales que enfrentan `TIPOS_DE_MODULO` a
      `modulo_plantilla` se van con ella: ya no hay dos listas que comparar.
      **Lo que las reemplaza es la llave foránea de T-5**, que es más fuerte
      que las tres: una clave inventada no llega a existir. Se fue **una
      cuarta** que el enunciado no contaba, y era forzoso: la que afirmaba que
      la lista no repitiera claves.
- [x] Nada más entra en este commit. Es deliberado: el día que se pierde una
      red del compilador conviene que no haya nada más que culpar.

**Ruta: delegada.**

### T-7 · Una plantilla nueva nace desde catálogos

- [x] `POST /api/plantillas-modulo` con la clave **derivada del rótulo** y no
      tecleada: el abogado nombra «Observaciones del cliente» y el sistema
      acuña `observaciones_del_cliente`. Única por bufete, e inmutable desde
      que nace — el disparador de T-1 ya lo impide.
- [x] El verbo `creado` entra a `ACCIONES_POR_ENTIDAD`. **Sin migración**: ya
      está en el `CHECK` de `accion`.
- [x] Choque de claves resuelto y dicho: dos rótulos que acuñan la misma clave
      no pueden ser un 500 de la base. **Son dos 422 y no uno**, con motivos y
      frases distintas: el choque y el rótulo que no acuña nada son dos
      problemas con dos salidas distintas.
- [x] La pantalla gana el alta, con la descripción **obligatoria** desde el
      formulario: es lo que la IA va a leer, y una plantilla nueva no tiene
      preset debajo que la cubra.
- [x] La plantilla nueva se ofrece en el editor de la cotización **y llega al
      prompt**. Se prueba de punta a punta: crear, usar en una cotización, y
      ver su descripción en el encargo al modelo.

**Ruta: delegada.**

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

Forecast original de la tajada 1: ~1.000 líneas propias. **Medido tras T-2:
6.874 insertadas en dos de las cuatro tareas** (`7c340aa` +1.399, `41cfffb`
+5.475). El forecast estaba mal por un factor de siete, y el motivo es
identificable y no una sorpresa: se estimaron líneas de código, y este
repositorio escribe alrededor de tres líneas de comentario y de prueba por
cada una de código —de las 5.475 de T-2, 2.969 son pruebas y 201 documentación—.
Queda anotado acá para que el forecast de la tajada 2 se haga sobre la
medición y no sobre la intuición.

Rama propia con un commit por tarea. Empujar y mezclar a `main` siguen siendo
decisión del usuario.

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

### T-2 cerrada

**Archivos.** Nuevos: `worker/plantillas/dominio.ts` (315), `repositorio.ts`
(279) y `rutas.ts` (230); `src/api/plantillas.ts` (139);
`src/pantallas/catalogos/plantillas.ts` (476) y `PlantillasDeModulo.tsx` (466);
`test/plantillas-dominio.spec.ts` (417), `plantillas-rutas.spec.ts` (525),
`plantillas-api.spec.ts` (680) y `plantillas-ui.spec.ts` (566);
`e2e/plantillas.spec.ts` (780). Modificados: 469 líneas agregadas y 52
quitadas en `worker/contract.ts` (+150), `src/estilos/layout.css` (+105),
`docs/diseno.md` (+65), `worker/bitacora/rutas.ts` (+62/−52),
`src/ruteo.ts` (+46), `worker/index.ts` (+35),
`src/pantallas/catalogos/Catalogos.tsx` (+32) y `e2e/navegacion.spec.ts` (+11).

**La deuda de T-1, cerrada y medida.** El `case` de `modulo_plantilla` en
`existeLaFila` ya llama a `puertos.plantillas.obtener(…)`, el puerto viaja
desde `worker/index.ts`, y **las 32 líneas del comentario provisorio se
borraron** junto con el párrafo del encabezado que anunciaba la octava
dirección sin contestar. Medido al revés: con el `return false` de T-1 puesto
de nuevo, `test/plantillas-api.spec.ts` da **6 fallando de 25** —la dirección
que contesta 200, las cuatro que leen la historia de una escritura, y la que
cuenta que un 409 no deja entrada—. Con el puerto, 25 pasando.

**RED observado donde hay regla que proteger.** Quitando la normalización de
`textoEditable` —el `trim()` y el vacío a NULL—,
`test/plantillas-dominio.spec.ts` da **7 fallando de 46**: las tres formas de
vacío por cada uno de los dos campos, más el recorte. Restaurada, 46 pasando.
Es la regla que carga con la tajada, así que es la que tiene la mutación
medida.

**Dos decisiones que se separaron del enunciado, con su motivo.**

1. **El rechazo del vaciado sin preset es un 409 y no un 422.** El enunciado
   pedía 422 con motivo propio. Se eligió 409 por el criterio que el propio
   contrato tiene escrito en `RenglonCitado`: «422 dice *entendí el cuerpo y
   los datos no me sirven*; esto es *el cuerpo está perfecto y lo que no
   admite la escritura es el estado de la fila*». Una cadena vacía es un valor
   impecable —en cinco de las seis filas significa «volver al original»— y lo
   que la rechaza es que esa fila no tiene piso debajo: es la forma exacta de
   `rubro_sin_precio`. El efecto práctico, además, es que la frase vive en
   `src/api/plantillas.ts` junto a la del arancel y no hay que tocar el
   `Record<MotivoDeFalla, string>` de `src/mensajes.ts`. Dos motivos nuevos,
   los dos 409: `plantilla_inmutable` (clave y preset, los tres campos en un
   solo motivo porque `campos` ya dice cuál fue) y `plantilla_sin_preset`.
2. **La baja y la reactivación van por el mismo `PUT`**, no por ruta propia.
   Es lo que los tres catálogos de T-6 ya hacen, y lo que decide no es la
   simetría: `accionDeEdicion` existe exactamente para esto —mira cómo quedó
   `activo` respecto de cómo estaba y elige entre los tres verbos— y con rutas
   propias habría que emitir el verbo a mano en cada una.

**Dos defectos encontrados manejando la pantalla, no leyéndola.**

1. **Editar un campo marcaba los dos.** El `PUT` manda el juego completo, así
   que cambiar el rótulo mandaba también la descripción, y la descripción que
   nadie tocó llegaba como texto del bufete. Medido en el navegador: **2
   marcas en vez de 1** tras cambiar el rótulo de «Alcance». Es un defecto y
   no una sutileza —la marca diría «lo editó el bufete» sobre algo que nadie
   editó, y la copia dejaría de seguir al preestablecido el día que una
   migración lo mejore—. Arreglado en `propioParaGuardar`: escribir exactamente
   lo que ya se ve, sobre un campo que todavía usa el preestablecido, viaja
   como NULL. Ahí esta pantalla se separa a propósito de la de precios, que sí
   deja adoptar la sugerencia; el argumento completo está al lado de la
   función.
2. **La consulta de contenedor no se aplicaba.** `@container` estaba declarada
   sobre `.plantilla-modulo`, que es su propio contenedor, y una consulta no
   puede dar estilo al elemento que la declaró. Medido: a 1400px, con la
   sección midiendo 1033px, el relleno computado seguía siendo **12px** en vez
   del de `--espacio-l`. Arreglado con `.plantilla-modulo__cuerpo`, que es el
   mismo reparto que `.tarjeta` ya tenía con `.tarjeta__cuerpo`. Con el
   arreglo: **26px a 1400px, 12px a 768px y a 320px**. Hay una prueba de punta
   a punta que compara los dos rellenos, porque el defecto no rompía nada
   visible.

**La pantalla, manejada a mano contra la base local** (API real, no
interceptada), en `http://localhost:5174/catalogos/modulos`:

| Qué se midió | Resultado |
|---|---|
| Bloques dibujados | **6**, con las seis claves en el orden de la propuesta |
| Controles por bloque | **1 `input` + 1 `textarea`**, nunca un tercero |
| Marcas en la pantalla limpia | **0**; leyenda no dibujada |
| Tras editar sólo el rótulo de «Alcance» | **1** marca, sobre el `<h2>`; **0** sobre la descripción; leyenda presente |
| Tras vaciar el campo y guardar | **0** marcas, `<h2>` de vuelta en «Alcance», campo con «Alcance», leyenda ida |
| Desborde a 1400px | `scrollWidth` 1400 = `clientWidth` 1400 |
| Desborde a 320px | `scrollWidth` 320 = `clientWidth` 320 |
| Ancho de la sección / del campo | 1033 / 979 px a 1400; 273 / 247 px a 320 |

El cajón de navegación aparece fuera del ancho a 320px —`left: -256..0`—, y es
el del armazón, estacionado ahí a propósito: no produce scroll, que es lo que
`medirDesborde` mide.

**Verificación.** `pnpm lint`: sin hallazgos. `pnpm typecheck`: 0 errores.
`pnpm test`: **54 archivos, 2.688 pruebas, todas pasando** (desde 50 y 2.545:
+4 archivos y +143 pruebas). `pnpm test:e2e`: **532 pasando** en 1,1 min
(desde 509: +23, que son las del archivo nuevo) —`e2e/catalogos.spec.ts` no
necesitó tocarse, y `e2e/sin-scroll-horizontal.spec.ts` pasó sin repetirse—.
`e2e/navegacion.spec.ts` **sí** se tocó, y era obligatorio: su
`Record<Ruta["nombre"], Destino>` es exhaustivo, así que la ruta nueva no
compila hasta que alguien diga bajo qué sección vive. Vive bajo `/catalogos`,
como las dos del arancel.

**Dos archivos fuera de la superficie autorizada, y se dicen.** La lista de
superficies no los incluía y los dos son forzados por redes del propio
proyecto, no por alcance:

- `src/App.tsx`, **2 líneas** (un `import` y un `case`). `pantallaDe` es el
  único despachador de rutas del proyecto, así que sin esa línea la ruta
  resuelve y no se dibuja nada. No rompe el `typecheck` —la función no declara
  tipo de retorno, así que el `case` faltante solo ensancha el inferido a
  `| undefined`— y por eso el único que lo habría visto es el punta a punta.
- `test/tsconfig.json`, **1 línea** de `include`. El proyecto es `composite`,
  así que importar `src/pantallas/catalogos/plantillas.ts` desde
  `test/plantillas-ui.spec.ts` sin listarlo falla con TS6307. Es la misma
  entrada que `precios.ts` tiene arriba, con el mismo argumento.

**Lo que no se tocó, y se midió**: `worker/cotizaciones/*`, `worker/ia/*` y
`src/pantallas/cotizaciones/*` siguen intactos —el editor de la cotización
sigue leyendo sus rótulos del registro del código, que es T-3— y
`src/mensajes.ts` tampoco, por la decisión 1 de arriba.

**Lo que esta tarea no entregó y conviene anotar**: la pantalla **no dibuja la
bitácora** de una plantilla, aunque la dirección ya conteste. Los catálogos de
T-6 sí tienen ese despliegue por fila, y acá no se construyó porque el
enunciado de la pantalla no lo pedía y porque la primera entrada de esta
entidad la escribe esta misma tarea. La dirección funciona y tiene prueba, así
que cuando se quiera es una fila de tabla, no un camino nuevo.

**Siguiente paso**: T-3, que saca el rótulo del código.

### T-3 cerrada

**Archivos.** Ninguno nuevo. Modificados, 17: `worker/cotizaciones/modulos.ts`
(+237/−244 contando el encabezado reescrito), `worker/cotizaciones/repositorio.ts`
(+95), `worker/cotizaciones/snapshot.ts` (+42), `worker/contract.ts` (+68),
`worker/index.ts` (+31), `worker/plantillas/repositorio.ts` (+23),
`src/pantallas/cotizaciones/modulos.ts` (+144),
`src/pantallas/cotizaciones/EditorDeModulos.tsx` (+88), cinco de prueba y tres
de punta a punta. **1.340 insertadas, 244 quitadas.**

**La decisión que el enunciado pedía decidir: el rótulo no viaja en el cable.**
Las dos opciones eran que la pantalla pidiera `GET /api/plantillas-modulo` o
que `ModuloDeCotizacion` llevara el rótulo resuelto. Se eligió la primera, y
lo que la decidió no fue la estética sino que **el editor tiene que pedir el
catálogo de todas formas**: su desplegable ofrece las plantillas *activas*, y
eso no se puede deducir de los módulos que la cotización ya tiene. Con el
catálogo en la mano, un `rotulo` por módulo sería la misma cadena repetida una
vez por fila —cinco módulos traerían cinco copias de seis rótulos— y dos de
esas copias podrían discrepar dentro de una sola respuesta.

El comentario de `contract.ts:1551` **se reescribió igual**, y eso es lo que
importa: su conclusión sobrevive y su argumento no. Decía que el rótulo «sale
del registro tipado, que la pantalla importa igual que lo importa el
servidor», y ese registro ya no tiene rótulos. Ahora dice el motivo que se
sostiene, y cierra con la regla entera en una línea: **lo vivo se resuelve, lo
emitido se copia.**

**La segunda fuente que sobrevive, y por qué.** El enunciado pedía que los
rótulos escritos a mano quedaran con un solo uso. Quedaron con dos, y el
segundo es `worker/ia/prompt.ts:238` —`CATALOGO_DE_MODULOS`—, que esta tarea
**no puede tocar**: es la línea que T-4 pone a leer la base, con la medición
del prompt antes y después que es su entrega. Cambiarla desde acá habría
dejado media tarea hecha sin la prueba que la mide. Lo que se hizo en su lugar:

1. Se apagaron los cinco consumidores que importaban. `rotuloDeTipo` y el
   `Map` que lo sostenía **no existen más**.
2. La constante quedó documentada con su único consumidor nombrado y su fecha
   de muerte: el día que T-4 entre, se borra.
3. Las dos fuentes quedaron **atadas por prueba**, en los dos sentidos, contra
   los `rotulo_oficial` de `modulo_plantilla`. Renombrar un preset en una
   migración y olvidarse del código pone la suite en rojo.

**La red del compilador, mudada y medida.** `TiposSinRotulo` se borró: probaba
que todo tipo tenía rótulo, y eso no se prueba con un tipo cuando el rótulo es
una fila. Lo reemplazan tres pruebas en `test/modulos-api.spec.ts` que leen
`modulo_plantilla` y la enfrentan a `TIPOS_DE_MODULO`. Lo que **no** se mudó es
la pertenencia a la unión `TipoDeModulo`, que nunca tuvo que ver con el
rótulo: sigue siendo cosa del compilador, renombrada a `TiposFueraDeLaLista`.

Medido con las dos mutaciones, que son los dos sentidos de la red:

| Mutación | Resultado |
|---|---|
| Séptima clave en `TipoDeModulo` y en `TIPOS_DE_MODULO`, sin fila | **3 fallando de 54**: el `CHECK`, «cada clave tiene su plantilla» y el orden |
| Una fila de más en la lectura de `modulo_plantilla` | **3 fallando de 54**: «cada plantilla tiene su clave», el orden y el preset del código |

El `typecheck` **no** nota la séptima clave, y es el punto: por eso la red
tenía que cambiar de mecanismo y no de nombre.

**RED donde hay regla que proteger.** Tres mutaciones más, sobre las tres
reglas que carga la tarea:

| Mutación | Resultado |
|---|---|
| `rotulosPorClave` devuelve `rotuloOficial` —o sea, ignora el renombre del bufete— | **2 fallando de 119** en `modulos-api` + `emitir-api` + `plantillas-api`: el `detalle` de la bitácora y el rótulo congelado |
| `rotuloDeModulo` devuelve el preset en vez del vigente | **1 fallando de 48** en `modulos-ui` |
| `opcionesParaModulo` = `opcionesParaNuevo` —se cae la plantilla de baja— | **2 fallando de 48** en `modulos-ui` |

Las tres restauradas: 119, 48 y 48 pasando.

**La plantilla dada de baja: decidido, y las dos mitades probadas.** Una
plantilla de baja **no se ofrece** para un módulo nuevo ni en el desplegable de
los otros módulos, y **sí aparece, marcada «(de baja)» y al final**, en el
desplegable del módulo que ya la usa. La asimetría es el criterio: se conserva
poder nombrar lo que ya está escrito, no poder volver a elegirlo.

Sin esa segunda mitad el defecto es concreto y no estético: un
`<select value="alcance">` cuya lista no tiene `alcance` **no queda vacío,
queda en la primera opción**, así que la pantalla afirmaría que ese módulo es
de antecedentes — y como el formulario manda el juego completo, el primer
«Guardar» hecho para corregir una coma le cambiaría el tipo al módulo. Eso es
perder un dato.

Y **el servidor no la rechaza**, que es la decisión menos obvia: rechazar una
clave de baja en el `PUT` dejaría congelado todo módulo cuya plantilla se
retiró —nadie podría corregirle una coma— y habría exigido un `MotivoDeFalla`
nuevo, o sea `src/mensajes.ts`, que está fuera de la superficie. Lo que impide
elegirla de nuevo es qué ofrece el desplegable, no la validación.

**Manejado a mano contra la base local** (API real, no interceptada), en
`http://localhost:5174`, con «Alcance» renombrado a «Qué vamos a hacer» desde
`/catalogos/modulos`:

| Qué se midió | Resultado |
|---|---|
| `/catalogos/modulos` tras guardar | `<h2>` «Qué vamos a hacer» con **1** marca de editado |
| Editor de `COT-2026-0011` (borrador), etiquetas de los 5 módulos | «Texto del módulo 2: **Qué vamos a hacer**»; las otras cuatro con su preset |
| Desplegable del alta | 7 opciones, con «Qué vamos a hacer» en el lugar 2 |
| Hoja de `COT-2026-0003` (emitida), encabezados | Antecedentes · **Alcance** · Exclusiones · Supuestos · Cláusulas |
| «Qué vamos a hacer» en el HTML de la hoja emitida | **ausente** |
| Con «Alcance» dado de baja, desplegable del alta | 6 opciones, sin «Alcance» ni marcada ni sin marcar |
| Con «Alcance» dado de baja, desplegable del módulo 2 | 8 opciones, la última «**Qué vamos a hacer (de baja)**», y `value = "alcance"` |
| Con «Alcance» dado de baja, desplegable del módulo 1 | 6 opciones: la retirada no está |

**Las 6 cotizaciones emitidas de la base local, medidas antes y después.**
Las **33** entradas congeladas de sus snapshots —5+6+5+6+6+5— idénticas letra
por letra, y los seis `length(snapshot)` iguales al byte: 4.432 · 4.052 ·
4.206 · 6.814 · 6.528 · 5.174. Es la medición contra esas filas y no contra
una sembrada, y se tomó con el rótulo del bufete **puesto** en el medio, que
es la única forma de que distinga algo.

La base local quedó restaurada: las seis plantillas con `rotulo` y
`descripcion` en NULL y `activo = 1`. Lo que **no** se puede restaurar son las
**4 entradas de bitácora** que ese manejo escribió —`editado`,
`dado_de_baja`, `reactivado`, `editado`—, y no es un descuido: la bitácora es
inmutable por diseño y su razón de ser es justamente que lo que pasó quede
escrito.

**Dos cosas que no se tocaron, a propósito.** La hoja imprimible no cambió una
línea: ya leía el rótulo del snapshot, así que T-3 la alcanzó por abajo —en
`congelar`— y no por arriba. Y hay una prueba nueva de punta a punta que afirma
que **no pide** `/api/plantillas-modulo`: ir a buscar el rótulo de hoy sería
imprimir el nombre de hoy sobre el papel de marzo.

**Tres archivos fuera de la superficie autorizada, y se dicen.** Los tres son
bancos de punta a punta que ya montaban el editor de módulos y contestan la API
entera desde un predicado, así que la lectura nueva del catálogo caía en su 404
de reserva y el editor mostraba su aviso de lectura fallida:
`e2e/generar.spec.ts` (+36), `e2e/precios-en-cotizacion.spec.ts` (+36) y
`e2e/plan.spec.ts` (+44). La adición es la misma en los tres: la fixture de las
seis plantillas y su rama. No hay forma de evitarlo —con el rótulo fuera del
código, **cualquier** diseño obliga a que esos bancos lo sirvan—, y por eso no
se intentó un camino degradado: un editor que dibujara claves crudas cuando el
catálogo no contesta es una pantalla que miente sobre lo que sabe.

Queda además una referencia desactualizada que esta tarea no puede corregir:
`worker/ia/esquema.ts:230,276` nombra `TiposSinRotulo` en dos comentarios. Es
`worker/ia/*`, o sea T-4.

**Verificación.** `pnpm lint`: sin hallazgos. `pnpm typecheck`: 0 errores.
`pnpm test`: **54 archivos, 2.706 pruebas, todas pasando** (desde 2.688: +18,
sin archivos nuevos). `pnpm test:e2e`: **535 pasando** en 1,1 min (desde 532:
+3) —`e2e/sin-scroll-horizontal.spec.ts` pasó sin necesidad de repetirlo—.

**Siguiente paso**: T-4, que le inyecta al prompt la descripción de cada
módulo y, con eso, borra `CATALOGO_DE_MODULOS`.

### T-4 cerrada, y con ella la tajada 1

**Archivos.** Ninguno nuevo. Modificados, 11: `worker/ia/prompt.ts`
(+145/−21), `worker/ia/esquema.ts` (+64/−8), `worker/cotizaciones/rutas.ts`
(+54/−5), `worker/ia/generador.ts` (+27/−5), `worker/cotizaciones/modulos.ts`
(+18/−39, que es el único que pierde líneas netas y es por la constante
borrada), `worker/ia/modelo.ts` (+14), `worker/ia/anthropic.ts` (+9/−4),
`worker/index.ts` (+9/−3), `test/generador-api.spec.ts` (+486/−18),
`test/ia-modelo.spec.ts` (+121/−11) y `test/modulos-api.spec.ts` (+10/−51).
**957 insertadas, 165 quitadas** sin contar este documento. Ninguno de punta a
punta: el cambio es del servidor y los bancos no lo ven.

**El prompt, medido antes y después contra la base local.** No estimado: se
leyeron `modulo_plantilla`, `tipo_proceso` y `arancel_renglon` de la base local
—6 plantillas activas, 4 trámites vigentes, 282 renglones con cifra— y se armó
el prompt con las dos versiones del código en la misma corrida, extrayendo la
sección de módulos por su encabezado con el mismo código en las dos pasadas:

| Qué | Antes | Después | Diferencia |
|---|---|---|---|
| Sección «Tipos de módulo» | **494** | **1.599** | **+1.105** |
| Prompt completo | **33.747** | **34.852** | **+1.105** |
| Prompt sin la sección del arancel | 3.443 | 4.548 | +1.105 |
| Sección del arancel sola | 30.304 | 30.304 | 0 |

Y el +1.105 descompuesto, que es lo que hace que el número se pueda auditar:
**974** de las seis descripciones —exactamente lo que T-1 midió como
almacenado, así que ninguna se recortó ni se reescribió en el camino—, **18**
de los seis separadores ` · ` nuevos, y **113** del encabezado de la sección,
que pasó de 69 a 182 caracteres porque ahora dice que la descripción está ahí y
para qué sirve. 974 + 18 + 113 = 1.105.

El documento había estimado «unos 800» para las descripciones; lo medido como
almacenado fue 974 (T-1) y lo que la sección crece de verdad es 1.105. **El
costo frente a los 30.304 del arancel es 3,6 %**, y el orden de magnitud que la
decisión asumía no cambia.

Una nota sobre los números de referencia: este documento citaba 33.499 y 3.195,
medidos en la tajada de precios. El «antes» de hoy es 33.747 y 3.443, +248. Esos
248 **no están en lo que T-4 toca**: la sección de módulos medía 494 en las dos
mediciones y la del arancel 30.304 en las dos, y todo el resto del prompt es
texto fijo, así que la diferencia vive en la sección de trámites —la base local
tiene hoy 4 trámites vigentes, 284 caracteres de líneas—. El antes y el después
de arriba se tomaron en la misma corrida contra la misma base, así que el
+1.105 no depende de eso.

**`CATALOGO_DE_MODULOS` borrado, y la segunda fuente cerrada.** La constante no
existe más, y con ella se fueron las dos pruebas de `test/modulos-api.spec.ts`
que ataban las dos fuentes —escritas en T-3 con su fecha de muerte puesta: «el
día que T-4 la deje sin consumidores, la constante y estas dos pruebas se
borran juntas»—. Lo que **no** se tocó es la red de claves: las tres pruebas que
enfrentan `TIPOS_DE_MODULO` a `modulo_plantilla` en los dos sentidos siguen
ahí, porque la pertenencia a la unión nunca tuvo que ver con el rótulo.

Medido: de los seis rótulos escritos a mano no queda **ningún** consumidor en
código. Quedan tres apariciones de los literales en el repositorio y las tres
son datos, no fuentes: la siembra de `0016`, los bancos de prueba, y
`scripts/semilla-demo.sql` —que ver abajo—.

**La decisión que el enunciado no pedía decidir y había que decidir: el esquema
también cambia de fuente.** El enunciado pedía inyectarle la descripción al
prompt. Pero `validarModulo` cerraba el juego de tipos con `esTipoDeModulo`
sobre la constante del código, y eso dejaba un hueco concreto: **una plantilla
dada de baja seguía siendo un tipo que el modelo podía proponer**, porque su
clave sigue en `TipoDeModulo`, en `TIPOS_DE_MODULO` y en el `CHECK` de `0004`.
El editor no la ofrece (T-3) y la pantalla la marca «(de baja)», así que el
generador habría escrito módulos nacidos retirados.

Así que `CatalogosOfrecidos` recibe un tercer catálogo —`modulos`— con la misma
forma y la misma falla cerrada que `tiposDeProceso` y `servicios`, y
`validarModulo` tiene **dos comprobaciones y un solo motivo**: `esTipoDeModulo`
es la que estrecha el tipo —sin ella el `return` necesitaría un `as` sobre un
valor que viene del cable— y `clavesOfrecidas.includes` es la que dice qué está
vigente. La primera muere con `TipoDeModulo` en la tajada 2; la segunda es la
que lleva la regla. El motivo y su frase no cambiaron: lo que cambió es de
dónde sale la lista, que es exactamente lo que el enunciado pedía.

**La falla cerrada tiene la forma del catálogo de servicios, no la de los
trámites**, y la diferencia importa: un catálogo de trámites vacío deja
`tipoProcesoId` en `null`; uno de módulos vacío deja la propuesta **sin
módulos**. Es la respuesta correcta igual —un bufete que retiró sus seis
plantillas no tiene módulos que ofrecer— y hay una prueba que lo afirma por el
lado que importa: con el catálogo vacío, una propuesta de puras líneas pasa. Sin
ella, «falla cerrada» podría estar implementada como «falla», que es otra cosa.

**Los tres comentarios desactualizados, corregidos.** `esquema.ts:107` decía
«ninguno de los seis de `CATALOGO_DE_MODULOS`» y ahora describe la lista
inyectada, con las tres situaciones que el motivo cubre. `esquema.ts:230` y
`:276` nombraban `TiposSinRotulo`, que T-3 borró: la primera cita ahora
`TiposFueraDeLaLista`, que es la red viva, y la segunda —que cuenta la forma
equivocada que el proyecto usaba— conserva el nombre histórico **diciendo que
es el histórico y cuándo se renombró**, porque el párrafo habla de lo que esas
tres redes decían antes de T-8 y reescribirle el nombre volvería la anécdota
incomprensible.

**Las tres frases de cómo se usan los módulos se mudaron adentro de la
sección.** «Van en el orden en que se leen» y «no hace falta que estén todos»
son instrucciones sobre una lista: con la lista vacía dirían lo contrario de la
frase que acaba de prohibir nombrar cualquier módulo. Es la única diferencia de
forma con las otras dos secciones del prompt, y tiene su prueba.

**Las mutaciones, que es la evidencia de que las reglas están protegidas.** Cada
una es una regla distinta de esta tarea:

| Mutación | Resultado |
|---|---|
| `validarModulo` ignora la lista inyectada (sólo `esTipoDeModulo`) | **4 fallando de 181** en `ia-modelo` + `generador-api`: el catálogo vacío, la clave no ofrecida, la propuesta descartada y el motivo |
| `comoSeCompone` deja de imprimir la descripción | **6 fallando de 181**: las tres del texto puro y las tres de la base |
| `modulosOfrecidos` no filtra por `activo` | **3 fallando de 63** en `generador-api`: el texto, `tiposDeModuloOfrecidos` y el rechazo |
| `modulosOfrecidos` usa el preset en vez del vigente | **2 fallando de 63**: la descripción y el rótulo del bufete |
| `catalogoDeModulos` devuelve `""` con la lista vacía | **1 fallando de 63**: la que exige la frase, no la ausencia de claves |

Las cinco restauradas: 181, 181, 63, 63 y 63 pasando.

**Lo que se probó contra la base local de la suite, y no sobre una lista
armada a mano.** Las pruebas del prompt son puras y le pasan tres plantillas
—tres y no seis a propósito: una lista parcial es lo que deja afirmar que el
prompt nombra lo que se le dio **y nada más**, y con las seis un generador que
siguiera leyendo una constante pasaría igual—. Lo que sale de `modulo_plantilla`
lo miden cuatro pruebas más, por la ruta, con el rótulo y la descripción
editados por SQL y devueltos a NULL en un `finally`: las seis descripciones
sembradas llegan, la del bufete le gana al preset, el rótulo del bufete le gana
al preset en la misma línea, y una plantilla dada de baja no está en el texto ni
en `tiposDeModuloOfrecidos` —5 claves, no 6— ni pasa si el modelo la nombra
igual.

**Un archivo fuera de la superficie autorizada que no se tocó, y se dice.**
`worker/cotizaciones/lineas.ts:78` cita `CATALOGO_DE_MODULOS` en un comentario
—«`as const satisfies` y no una anotación, por lo mismo que
`CATALOGO_DE_MODULOS`»— y esa constante ya no existe. Es una referencia colgada
de una palabra, está fuera de la superficie de esta tarea, y la referencia
vigente equivalente es `TIPOS_DE_MODULO`, en el mismo archivo. Queda anotada
como lo quedó la de `esquema.ts:230` en T-3.

Y `scripts/semilla-demo.sql` tiene tres `CASE` que mapean clave a rótulo para
armar los snapshots y la bitácora de la demo. **No es una segunda fuente del
rótulo vigente**: es un guion que fabrica datos congelados, que por definición
son copias del rótulo del día en que se emitió, igual que las 33 entradas de
las 6 cotizaciones emitidas. Está fuera de la superficie y no se tocó.

**La base local quedó intacta.** Esta tarea no escribió una sola fila: la
medición del prompt es de lectura, y las escrituras de las pruebas van contra la
base de la suite, no contra la local. Las seis plantillas siguen con `rotulo` y
`descripcion` en NULL y `activo = 1`, y no hay entradas de bitácora nuevas que
no se pudieran deshacer.

**Verificación.** `pnpm lint`: sin hallazgos. `pnpm typecheck`: 0 errores.
`pnpm test`: **54 archivos, 2.724 pruebas, todas pasando** (desde 2.706: +20
nuevas y −2 borradas, sin archivos nuevos). `pnpm test:e2e`: **535 pasando** en
1,1 min —el mismo número que T-3: ningún banco necesitó tocarse, porque el
cambio no cruza el cable—. `e2e/sin-scroll-horizontal.spec.ts` pasó sin
necesidad de repetirlo.

### La tajada 1, cerrada

**Lo que entrega de punta a punta.** El abogado entra a `/catalogos/modulos`,
le cambia el rótulo y la descripción a un módulo, vacía el campo para volver al
preestablecido, o retira una plantilla que no usa. El editor de una cotización
nueva ofrece lo que quedó activo y muestra el rótulo de hoy; la hoja de una
cotización emitida muestra el que se congeló entonces; y **el modelo recibe
para qué sirve cada módulo**, que era la razón de ser de la tajada. Ningún
camino de la aplicación ni de SQL puede borrar una plantilla, editar su preset
ni cambiar su clave, y una plantilla sin descripción vigente no existe: lo
sostienen cuatro disparadores y dos `CHECK`, cada uno con su sonda hostil
medida.

**Los siete criterios de aceptación, todos con su medición.** 1 y 2 en T-2 (la
pantalla manejada a mano, 6 bloques, 1 marca tras editar, 0 tras vaciar); 3 y 4
en T-1 (nueve sondas hostiles con su mensaje exacto, más cuatro contrapesos); 5
en T-4 (494 → 1.599 caracteres de sección, +1.105); 6 en T-3 (las 33 entradas
congeladas y los seis `length(snapshot)` idénticos al byte); 7 en las cuatro.

**Lo medido contra lo pronosticado.** El forecast era ~1.000 líneas propias. Lo
entregado, contado con `git show --numstat` sobre los cuatro commits y este
documento incluido: **9.532 insertadas y 487 quitadas** —`7c340aa` +1.399/−15,
`41cfffb` +5.475/−56, `fb3024b` +1.494/−247, éste +1.164/−169—. El factor de
error es nueve y medio, y el motivo quedó identificado en T-2: se estimaron
líneas de código, y este repositorio escribe alrededor de tres de comentario y
de prueba por cada una de código. El forecast de la tajada 2 se hace sobre esta
medición y no sobre la intuición.

**Lo que la tajada 2 hereda, y en qué orden.**

1. **`cotizacion_modulo.tipo` pasa a `plantilla_id`.** Reconstrucción de la
   tabla con backfill por `JOIN` —posible porque `0016` sembró los seis presets
   en la migración y no en un script—, su índice único y sus seis disparadores
   re-creados letra por letra. El verbo `creado` ya está en el `CHECK` de
   `accion`, así que **no hace falta migración de bitácora**: la séptima
   reconstrucción fue la última de esta familia.
2. **`TipoDeModulo` muere.** Con la referencia puesta, la unión de
   `worker/contract.ts` y `TIPOS_DE_MODULO` dejan de tener trabajo, y con ellas
   `esTipoDeModulo`, `TiposFueraDeLaLista` y las tres pruebas que enfrentan la
   lista a las claves sembradas. En `worker/ia/esquema.ts` eso es concreto y ya
   está anotado al lado del código: de las dos comprobaciones de
   `validarModulo` se cae la primera —la que sólo existe para estrechar el
   tipo— y queda la segunda, que es la que lleva la regla. **Conviene que ése
   sea el único cambio del día**, porque es el día que se pierde la red del
   compilador.
3. **Crear plantillas nuevas**, con clave derivada del rótulo, que es lo que el
   `CHECK` de `0004` hace imposible hoy. Recién ahí `creado` entra al
   vocabulario de bitácora de la entidad, y recién ahí `ServicioDePlantillas`
   estrena un `crear` — el argumento de por qué no lo tiene está escrito en el
   encabezado de `worker/plantillas/repositorio.ts`.

Lo que **no** hereda, porque ya está hecho: la tabla con sus guardas, las rutas,
la pantalla, la baja y la reactivación, el rótulo vigente saliendo de la base en
toda la aplicación, y la descripción llegando al prompt.

Lo que queda anotado como pendiente menor, sin agendar: la pantalla de
`/catalogos/modulos` **no dibuja la bitácora** de una plantilla aunque la
dirección ya conteste y tenga prueba (T-2), y hay dos referencias colgadas en
comentarios fuera de superficie —`worker/cotizaciones/lineas.ts:78` y los `CASE`
de `scripts/semilla-demo.sql`—.

**Empujar la rama, abrir el pull request y mezclar siguen siendo decisión del
usuario.**

### T-5 cerrada

**Archivos.** Uno nuevo —`migrations/0017_un_modulo_apunta_a_su_plantilla.sql`
(607 líneas)— y nueve modificados: `worker/cotizaciones/repositorio.ts` (+121),
`test/esquema-cotizaciones.spec.ts` (+443), `test/modulos-api.spec.ts` (+153),
`test/plantillas-esquema.spec.ts` (+47), `worker/cotizaciones/modulos.ts` (+37),
`worker/plantillas/repositorio.ts` (+30), `worker/contract.ts` (+22),
`worker/ia/esquema.ts` (+21) y `test/emitir-api.spec.ts` (+7). **1.463
insertadas, 113 quitadas.** De los nueve, cinco son sólo comentario que la
migración volvió falso.

**El cable no cambió una letra, y eso es el titular.** `ModuloDeCotizacion.tipo`
sigue siendo la clave, el `GET` y el `PUT` siguen con la misma forma, y por eso
`src/`, `e2e/` y la hoja imprimible **no se tocaron**: la referencia es cómo la
fila guarda el dato, no cómo el resto del sistema lo nombra. El lado de
TypeScript entero son cinco sentencias de SQL en un archivo —una lectura con
`JOIN` y cuatro escrituras que resuelven la clave con una subconsulta—, dicha
una sola vez en `PLANTILLA_DE_LA_CLAVE`.

**RED observado.** Con `0017` puesta y ningún cambio de TypeScript:
`esquema-cotizaciones` + `modulos-api` + `emitir-api` dieron **127 fallando y
156 pasando de 283**, con `table cotizacion_modulo has no column named tipo`.
Después de las cinco sentencias quedaron 52 de 218, todas en `modulos-api` y por
su propio banco. La migración se aplica limpia en el corredor de pruebas, que es
además la prueba de que las dos verificaciones previas no abortan sobre una base
vacía.

**Las 54 filas, medidas antes y después sobre la base local.**

| Qué se midió | Antes | Después |
|---|---|---|
| Filas de `cotizacion_modulo` | 54 | **54** |
| Cotizaciones con módulos | 11 | **11** |
| Cotizaciones con snapshot | 6 | **6** |
| Filas cuya plantilla resuelve en su propio bufete | — | **54** |
| Disparadores sobre la tabla | 6 | **7** |

Y la comparación que de verdad cierra el relleno: el juego de las 54 filas
—`id`, `cotizacion_id`, clave resuelta, `orden` y largo del contenido— con el
**mismo SHA-256** antes y después, `9f933d6e…981efb65`. No es que haya 54 filas:
son las mismas 54. Los seis `tipo` distintos se reparten 11·10·10·9·7·7.

**La verificación previa, probada contra el estado que vigila, y con un hallazgo
que no se adivina.** Se fabricó el caso sobre una copia de la base local con sus
54 filas: se soltó `modulo_plantilla_no_se_borra` y se borró la plantilla de
`clausulas`, dejando 7 módulos sin plantilla. Después se aplicó `0017` por los
dos caminos:

| Corredor | Qué pasó |
|---|---|
| `wrangler d1 execute --local --file` | Aborta con `CHECK constraint failed: hay_modulos_cuyo_tipo_no_tiene_plantilla_en_su_bufete` y la base queda **intacta**: 54 filas, columna `tipo` puesta, sin `plantilla_id`, sin andamios, los 6 disparadores originales |
| `sqlite3 … ".read"` | Aborta **y sigue**: el `DROP TABLE` corre igual y quedan 47 filas. Se pierden 7 |

**La guarda sólo protege dentro de una transacción**, y los dos corredores de D1
lo son; `sqlite3 .read` no, porque cada sentencia confirma sola. No hay nada que
se pueda escribir dentro de un archivo de SQL que detenga a un corredor que no
vuelve atrás, así que queda dicho en el encabezado de la migración, que es el
único lugar donde quien la aplique a mano lo va a leer. El consuelo, y es lo que
justifica la **segunda** verificación: en la corrida de `sqlite3` el segundo
`CHECK` también disparó antes del `DROP`, así que la pérdida quedó nombrada dos
veces y en el registro en vez de ser 7 filas que nadie cuenta.

**Un disparador de más, y la decisión es la que el enunciado no pedía.** El
enunciado pedía re-crear seis y agregarle una arista al de tenencia al
`INSERT`. Se re-crearon los seis y **se agregó un séptimo**,
`cotizacion_modulo_tenencia_coherente_al_actualizar`, porque `0004:300` había
dejado escrito con todas las letras por qué esta tabla no lo llevaba —«las dos
únicas columnas que ese disparador miraría», `tenant_id` y `cotizacion_id`, son
inmutables, así que la condición no puede dar verdadero nunca— y **esta
migración le quita la premisa**: `plantilla_id` es una tercera columna que ese
disparador mira y es mutable, porque `editarModulo` la escribe cada vez que
alguien cambia el tipo de un módulo en un borrador. Sin él, `UPDATE
cotizacion_modulo SET plantilla_id = <la del vecino>` sobre un borrador sólo lo
rechazaría la llave foránea — que no mira el bufete, así que la plantilla del
vecino existe y no lo rechazaría en absoluto. La forma copiada es la de
`cotizacion_linea_tenencia_coherente_al_actualizar`, que existe «únicamente por
`tipo_proceso_id`» por este mismo motivo.

**Las cuatro sondas hostiles, con su mensaje exacto.** Corridas a mano sobre una
copia de la base local con sus 54 filas, con un segundo bufete sembrado y su
propia plantilla de clave `alcance` —el caso que importa, porque las seis son
presets y los dos bufetes las tienen iguales—:

| Sonda | Resultado |
|---|---|
| `INSERT` apuntando a la plantilla del vecino | `tenencia cruzada: cotizacion_modulo debe compartir tenant_id con las filas que referencia` |
| `INSERT` apuntando a una plantilla inexistente | el **mismo** mensaje, y es el punto del `IS NOT` |
| `UPDATE` moviendo un módulo a la plantilla del vecino | el mismo mensaje, desde el disparador nuevo |
| `UPDATE` moviéndolo a una plantilla inexistente | el mismo mensaje |

Las 54 filas intactas después de las cuatro, y los dos contrapesos al lado: un
`INSERT` con la plantilla propia entra y resuelve a su clave (55 filas), y un
`UPDATE` a **otra plantilla propia** pasa — que es la operación que
`editarModulo` necesita y que un disparador invertido habría congelado.

**Que la plantilla inexistente conteste «tenencia cruzada» y no `FOREIGN KEY
constraint failed` es la medición que prueba el operador**, y corrige lo que se
habría escrito de memoria: un `BEFORE INSERT` corre antes que las llaves
foráneas, y con la plantilla ausente la subconsulta del `WHEN` vale NULL, así que
`NULL IS NOT <tenant real>` es verdadero y aborta ahí. Con `<>` el mensaje pasa a
`FOREIGN KEY constraint failed` —el rechazo se muda a la guarda que un `PRAGMA`
apaga— y los dos casos del vecino siguen abortando, porque ahí ninguno de los dos
lados es nulo.

**Las sondas no dejaron residuo en la base del usuario**, y es la diferencia con
T-3: se corrieron sobre copias. El bufete vecino y su plantilla habrían sido
indelebles —`modulo_plantilla_no_se_borra` prohíbe el `DELETE` y la llave foránea
vuelve indeleble a su tenant—, así que sembrarlos en la base de demostración
habría dejado un segundo bufete para siempre. La base local quedó con 1 bufete, 6
plantillas con `rotulo` y `descripcion` en NULL y `activo = 1`, y 54 módulos.

**El snapshot, medido mutando la fuente viva en el medio.** Con «Alcance»
renombrado a «Qué vamos a hacer» desde la base y la migración puesta:

| Qué se midió | Resultado |
|---|---|
| Entradas congeladas de los 6 snapshots | **33** (5+6+5+6+6+5), idénticas letra por letra a las de T-3 |
| `length(snapshot)` de las 6 | **4.432 · 4.052 · 4.206 · 6.814 · 6.528 · 5.174**, iguales al byte |
| «Qué vamos a hacer» en algún snapshot | **ausente** |
| `rotuloVigente` de `alcance` por la API real | «**Qué vamos a hacer**», con su marca de editado |
| Encabezados del documento de `COT-2026-0003` (emitida) por la API real | Antecedentes · **Alcance** · Exclusiones · Supuestos · Cláusulas |
| «Qué vamos a hacer» en ese documento | **ausente** |

La mutación en el medio es lo que hace que la medición distinga algo: con los
seis presets intactos, el camino que resuelve y el que copia devuelven lo mismo y
la prueba no probaría nada. Es el motivo que T-3 encontró y acá vale igual.

**Mutaciones, donde hay regla que proteger.**

| Mutación | Resultado |
|---|---|
| Se borra `cotizacion_modulo_tenencia_coherente_al_actualizar` | **4 fallando de 255**: las dos sondas de `UPDATE`, la lista exacta de disparadores y el inventario de `0017` |
| Se le quita la arista de `plantilla_id` al disparador de `INSERT` | **3 fallando de 255** |
| `IS NOT` → `<>` en las dos aristas de plantilla | **3 fallando de 255**, y son exactamente las tres de plantilla inexistente |
| Se pierde un disparador copiado (`no_sale_de_una_congelada`) | **4 fallando de 2.736** |
| `PLANTILLA_DE_LA_CLAVE` ignora el `tenant_id` | **32 fallando de 2.736** |
| El `JOIN` del relleno pierde `p.tenant_id = m.tenant_id` | **1 fallando de 202**, y es la aserción de texto |

La última es la honesta de la tabla: sobre la base vacía del corredor de pruebas
no hay comportamiento que la note, así que lo único que la atrapa es una prueba
que lee el archivo de la migración. Por eso esa prueba existe y por eso además
afirma que el relleno **no** tiene un `CASE` — que es la alternativa rechazada,
fijada para que no se vuelva a proponer: una rama que falta devuelve NULL con un
mensaje que no nombra la clave, y un `CASE` **no mira el bufete**.

Y una que **no** tiene prueba, dicho en vez de descubierto: el `tenant_id`
repetido en el `JOIN` de lectura. Quitándolo, la suite entera queda en verde,
porque la fila incoherente que atraparía no se puede fabricar —el `WHERE` ya
filtra y los dos disparadores de tenencia impiden el cruce—. Queda por lo que
pasaría el día que alguien ablande un disparador, y porque el filtro repetido en
la unión es la regla de ese archivo. Está escrito al lado de la consulta.

**Tres referencias fuera de la superficie autorizada, y no se tocaron.** Las
tres afirman que «`cotizacion_modulo.tipo` sigue cerrado por el `CHECK` de
`0004`», que esta migración volvió falso:

- `scripts/semilla-demo.sql:137,152,167,185,200` — **y acá no es un comentario
  sino SQL**: cinco `INSERT INTO cotizacion_modulo (… tipo …)` que sobre una base
  nueva ya fallan. Sobre la base local no es alcanzable —el script aborta si la
  base ya tiene cotizaciones, y las tiene— pero la semilla de demostración queda
  **inservible para una base limpia** hasta que se corrija.
- `worker/plantillas/rutas.ts:17` y `worker/bitacora/vocabulario.ts:295` —
  comentarios que explican por qué no hay `POST` ni verbo `creado`. El argumento
  cambió de forma: el techo ya no es el `CHECK` sino que falta la ruta. Las dos
  las toca T-7, que es la que abre el alta.

Los cinco comentarios **dentro** de la superficie que decían lo mismo sí se
corrigieron: `worker/contract.ts`, `worker/cotizaciones/modulos.ts`,
`worker/plantillas/repositorio.ts`, `worker/ia/esquema.ts` y
`test/emitir-api.spec.ts`.

**Verificación.** `pnpm lint`: sin hallazgos. `pnpm typecheck`: 0 errores.
`pnpm test`: **54 archivos, 2.736 pruebas, todas pasando** (desde 2.724: +12, sin
archivos nuevos). `pnpm test:e2e`: **535 pasando** en 1,2 min y otra vez en 2,0
min, sin cambios en `e2e/` ni en `src/` —`e2e/sin-scroll-horizontal.spec.ts` pasó
sin necesidad de repetirlo—.

**Una corrida intermedia de `test:e2e` dio 389 fallando, y no era del cambio.**
Se deja anotado porque el número asusta y la causa es del entorno: el servidor
de desarrollo que la configuración reutiliza
(`reuseExistingServer`) estaba escuchando sólo en `[::1]:5174`, así que
Playwright no lo encontró en `127.0.0.1:5174` y levantó el suyo; esa corrida fue
pegada a la anterior y las dos se pisaron en el puerto. Los fallos eran todos
`toHaveCount` sobre una página que no se servía. La corrida inmediatamente
siguiente, sin tocar nada, dio los 535. El servidor del usuario quedó vivo y
contestando.

**Siguiente paso**: T-6, que se lleva `TipoDeModulo` y es el único cambio de ese
día. Lo que la habilita es la llave foránea de esta tarea.

### T-6 cerrada

**Archivos.** Ninguno nuevo. Modificados, 13: `test/modulos-api.spec.ts`
(+150/−111), `worker/cotizaciones/modulos.ts` (+107/−107, que es casi todo
encabezado reescrito), `worker/contract.ts` (+92/−52),
`worker/cotizaciones/rutas.ts` (+48/−9), `src/pantallas/cotizaciones/modulos.ts`
(+51/−19), `test/modulos-ui.spec.ts` (+44/−4), `worker/ia/esquema.ts` (+42/−39),
`worker/cotizaciones/repositorio.ts` (+20/−8),
`src/pantallas/cotizaciones/EditorDeModulos.tsx` (+13/−2),
`worker/cotizaciones/snapshot.ts` (+9/−4), `test/ia-modelo.spec.ts` (+6/−4),
`worker/ia/prompt.ts` (+5/−3) y `test/generador-api.spec.ts` (+3/−2). **590
insertadas y 364 quitadas** sin contar este documento. Ninguno de punta a
punta: el cable no cambió.

**El hueco del enunciado, encontrado antes de escribir y dicho acá porque
cambia la tarea.** El enunciado decía que la clave pasa a estar «validada
contra el catálogo inyectado, que es lo que `validarModulo` ya hace desde T-4
con `clavesOfrecidas`». Es cierto **del camino del modelo y de ningún otro**:
`clavesOfrecidas` vive en `worker/ia/esquema.ts`. El cable de módulos no pasa
por ahí — `POST` y `PUT /api/cotizaciones/{id}/modulos` validan con
`normalizarModulo`, que cerraba el juego con `esTipoDeModulo`.

O sea que borrar la lista sin reemplazarla **habría degradado un 422 a un
500**, y no es una hipótesis: `PLANTILLA_DE_LA_CLAVE` resuelve a NULL y la
columna es `NOT NULL`, así que `{"tipo": "garantias"}` habría muerto con
`NOT NULL constraint failed: cotizacion_modulo.plantilla_id`. El encabezado de
esa subconsulta decía con todas las letras por qué eso estaba bien —«
`normalizarModulo` ya rechaza con 422 cualquier cadena que no sea del
catálogo»— y el día de T-6 esa frase se volvía falsa. La prueba que lo atrapa
existía y es «rechaza un tipo que no está en el catálogo»: **no es una de las
tres bidireccionales**, así que dejarla caer no estaba autorizado.

Lo que se hizo: `normalizarModulo` recibe las claves por parámetro y la ruta
las lee del puerto de plantillas que `rutasDeCotizaciones` **ya tenía en la
mano** desde T-4. `worker/index.ts` no se tocó. Lo mismo del otro lado:
`normalizarBorradorDeModulo` las recibe del catálogo que el editor ya carga.

**El balance, dicho sin adornos, y es lo que el enunciado pedía juzgar.** No es
«genuinamente más fuerte» ni «sólo distinto»:

| | Antes | Después |
|---|---|---|
| Literal inventado en el código | **no compila** | compila; lo atrapa una prueba o un 422 |
| Cadena inventada por el cable | 422, contra seis literales | 422, contra las filas del bufete |
| Clave del modelo | 422 + `clavesOfrecidas` | `clavesOfrecidas`, sola |
| Clave sin fila en la base | imposible por `CHECK` (T-5 lo borró) | imposible por llave foránea |
| Las guardas y la base, desincronizadas | **posible**, y por eso había tres pruebas | imposible: miran la misma tabla |

**Más fuerte en tiempo de ejecución, más débil en tiempo de compilación, y las
dos cosas a la vez.** La ganancia real no es una guarda más: es que las tres
miran la misma fuente, que es justo lo que las tres pruebas bidireccionales
vigilaban. La pérdida real es una sola y concreta: `{ tipo: "alcanze" }`
escrito en este repositorio ya compila. Está escrito donde vivía la unión
(`worker/contract.ts`), sin pintarlo de ganancia, porque es el precio de que
T-7 pueda agregar una plantilla sin un despliegue.

**Una cuarta prueba se fue, y no estaba en el enunciado.** «No se repite
ninguna clave en la lista» no comparaba nada con la base, así que no era una de
las tres — pero su sujeto era la lista. Se fue con ella, y lo que contesta hoy
esa pregunta es el único `modulo_plantilla_clave_unica` de `0016`, que tiene su
prueba en `test/plantillas-esquema.spec.ts`. Queda dicho en el archivo.

**Dónde quedó `clavesDePlantillas`, y es una decisión forzada por el
`typecheck`.** La función que deriva las claves de un catálogo tiene que ser
importable **por las dos copias de la validación**, y una corre en el
navegador. El hogar natural era `worker/plantillas/dominio.ts` —puro, sin D1—
y no sirve: no está en el `include` de `tsconfig.app.json`, y agregarlo es
tocar un archivo fuera de la superficie (TS6307, medido). Vive en
`worker/cotizaciones/modulos.ts`, que **sí** está listado y por la condición
que ese `include` documenta y esta función cumple: ninguna importación en
tiempo de ejecución. Es además el archivo que antes tenía el catálogo.

**Y la lista incluye las dadas de baja, que es la decisión que más fácil se
rompía.** La unión enumeraba las claves *válidas* y nunca supo nada de
`activo`, así que filtrar por `activo` al mudar la red habría sido endurecerla
de contrabando — y el costo está medido desde T-3: rechazar una clave retirada
deja **congelado todo módulo cuya plantilla se dio de baja**, porque el
formulario manda el tipo junto con el texto y nadie podría corregirle una coma.
Se le escribió prueba propia por el cable, que es la que faltaba:
«una plantilla dada de baja sigue siendo una clave que se puede guardar».

**Las mutaciones. No hay RED porque no hay comportamiento nuevo**, así que la
evidencia es qué se rompe al apagar la guarda que ahora carga el peso:

| Mutación | Resultado |
|---|---|
| `normalizarModulo` ignora las claves que recibe | **3 fallando de 177** en `modulos-api` + `cotizaciones-api` + `generador-api`: la del cable, la de la lista parcial y la de la lista vacía |
| `validarModulo` ignora `clavesOfrecidas` | **10 fallando de 181** en `ia-modelo` + `generador-api` |
| `normalizarBorradorDeModulo` ignora las claves | **2 fallando de 49** en `modulos-ui` |
| `clavesDePlantillas` filtra por `activo` | **1 fallando de 52**, y es exactamente la de la plantilla retirada |

Las cuatro restauradas: 177, 181, 49 y 52 pasando. La segunda es la que mide el
cambio de T-6 mejor que ninguna: **T-4 la había medido en 4 de 181**, y hoy son
10 — porque `esTipoDeModulo` ya no está atajando la mitad de los casos. Era la
comprobación que «no llevaba la regla», y los seis fallos de más son la prueba
de que eso era cierto.

Y el motivo **no cambió de frase**, que era la condición explícita: los nombres
de las diez que fallan lo dicen —«el motivo es `tipo_de_modulo_desconocido`,
igual que con una clave inventada», «sin catálogo declarado, cualquier tipo de
módulo se rechaza»—.

**Lo que se corrigió porque esta tarea lo volvió falso, y nada más.** Cinco
comentarios cuyo argumento apoyaba en la lista o en el `CHECK` de `0004`:
`worker/cotizaciones/repositorio.ts` y `src/pantallas/cotizaciones/modulos.ts`
—los dos justificaban la reserva `?? tipo` con «la siembra cubre las seis
claves del `CHECK`», y hoy lo que la vuelve inalcanzable es que el `tipo`
**sale** de `modulo_plantilla.clave` por el `JOIN`—, `worker/ia/prompt.ts`,
`test/ia-modelo.spec.ts` y `test/generador-api.spec.ts`.

**Tres referencias colgadas fuera de la superficie, y no se tocaron.** Las tres
nombran `TIPOS_DE_MODULO` o el `CHECK` de `0004` en un comentario:
`worker/ia/modelo.ts:83`, `worker/cotizaciones/lineas.ts:142` y
`worker/plantillas/rutas.ts:17` —ésta última ya estaba anotada por T-5—. Son
palabras en comentarios, la referencia vigente equivalente es evidente en los
tres, y están fuera del alcance autorizado de esta tarea igual que la de
`lineas.ts:78` que T-4 dejó anotada.

**Pendiente menor, encontrado y no hecho.** `worker/plantillas/dominio.ts`
cumple la condición documentada del `include` de `tsconfig.app.json` —no tiene
importaciones en tiempo de ejecución— y agregarlo dejaría que las pantallas
importen de ahí sin pasar por un re-export. Es `tsconfig.app.json`, o sea fuera
de la superficie, y no urge: el re-export de hoy tiene una sola línea y su
motivo escrito.

**La base local quedó intacta.** Esta tarea no escribió una fila: no hay
medición manual contra la base del usuario porque no hay comportamiento nuevo
que mirar, y la única escritura de las pruebas —dar de baja `alcance`— va
contra la base de la suite y vuelve en un `finally`. Las seis plantillas siguen
con `rotulo` y `descripcion` en NULL y `activo = 1`, y no hay entradas de
bitácora nuevas.

**Un descuido propio, encontrado midiendo y corregido.** La prueba nueva de la
plantilla retirada dejaba `activo = 0` puesto para las demás: el
almacenamiento de esta suite está aislado por archivo y no por prueba, y esta
tabla la siembra la migración, así que el `beforeEach` no la toca. Medido sin
el `finally`: **32 fallando de 101**, ninguno un defecto del código. Con el
`finally`, y volviendo a medir la mutación que esa prueba vigila: **1 de 52**,
que es el número que de verdad informa. Queda escrito al lado de la prueba,
porque el mismo `finally` lo tiene la prueba del rótulo propio por el mismo
motivo.

**Verificación.** `pnpm lint`: sin hallazgos. `pnpm typecheck`: 0 errores.
`pnpm test`: **54 archivos, 2.736 pruebas, todas pasando** —el mismo número que
T-5, y la coincidencia es casual: −4 borradas (las tres bidireccionales y la de
las claves repetidas) y +4 nuevas (dos del dominio, una del catálogo vacío en
la pantalla y la de la plantilla retirada por el cable)—. `pnpm test:e2e`:
**535 pasando** en una corrida, y **534 + 1 fallando** en varias otras.

**El fallo de punta a punta no es de este cambio, y se midió en vez de
suponerse.** Es `e2e/armazon.spec.ts:475` «el velo cierra el cajón», que
apareció en tres corridas de seis. Sale solo —20 de 20 en su archivo— y, lo
decisivo: **se guardó este trabajo y se corrió la suite entera sobre `baf1f1d`
limpio, y falla exactamente igual**. Es un parpadeo preexistente del cajón de
navegación, que esta tarea no toca: no se modificó ni un archivo de
`src/layout/`. Hubo además una corrida de **97 pasando** con fallos en masa de
`toHaveCount`, que es el choque de puerto ya documentado en T-5 —el servidor
del usuario escucha en `[::1]:5174` y `reuseExistingServer` lo busca en
`127.0.0.1`— por venir pegada a la anterior.

**Un escritor concurrente en el árbol de trabajo, dicho porque se vio.** A
mitad de la verificación apareció `src/pantallas/procesos/PanelDeGastos.tsx`
modificado, de otra tarea (`procesos-comodidad.md`), y **rompía el
`typecheck`**: importa `src/layout/Confirmacion`, que todavía no existe. No es
de esta tarea y no entra en este commit —que se hace por ruta explícita— y la
verificación se tomó con ese archivo fuera del medio, con su diff respaldado
antes de tocarlo.

**Siguiente paso**: T-7, el alta de plantillas, que es lo que esta tarea y
`0017` habilitan. Entra con el verbo `creado` en `ACCIONES_POR_ENTIDAD` y sin
migración.

### T-7 cerrada, y con ella la tajada 2 y la unidad entera

**Archivos.** Ninguno nuevo. Modificados, 19: `test/plantillas-api.spec.ts`
(+403/−4), `e2e/plantillas.spec.ts` (+357), `test/plantillas-ui.spec.ts`
(+305/−1), `test/plantillas-dominio.spec.ts` (+299),
`src/pantallas/catalogos/plantillas.ts` (+256/−14),
`worker/plantillas/dominio.ts` (+233),
`src/pantallas/catalogos/PlantillasDeModulo.tsx` (+229/−1),
`test/plantillas-rutas.spec.ts` (+182/−10),
`worker/plantillas/repositorio.ts` (+140/−12), `worker/contract.ts` (+122/−12),
`test/generador-api.spec.ts` (+116), `worker/plantillas/rutas.ts` (+107/−23),
`src/api/plantillas.ts` (+53/−10), `test/modulos-api.spec.ts` (+50),
`src/mensajes.ts` (+34), `src/estilos/layout.css` (+33),
`worker/cotizaciones/lineas.ts` (+27/−13), `worker/bitacora/vocabulario.ts`
(+22/−12) y `worker/ia/modelo.ts` (+14/−6). **2.982 insertadas y 118
quitadas** sin contar este documento. **Ningún archivo fuera de la superficie
autorizada**, que es la primera tarea de la unidad en la que eso pasa.

**La regla de acuñación, decidida y con sus bordes.** Cuatro pasos en este
orden, y el primero es el que decide:

1. **NFD y tirar las marcas combinantes.** Sin él, `Cláusulas` acuña
   `cl_usulas`: la `á` no es `[a-z0-9]`, cae en el separador y parte la palabra
   al medio. Descompuesta es una `a` seguida de un acento, así que tirar el
   acento deja la letra. Vale igual para la eñe —`Año fiscal` da `ano_fiscal`,
   artefacto conocido y aceptado: la clave es interna y el rótulo es lo que la
   persona lee— y para la diéresis.
2. **Minúsculas**, porque dos rótulos que difieren sólo en mayúsculas son el
   mismo módulo escrito dos veces y el único tiene que verlo.
3. **Toda corrida de lo que no es `[a-z0-9]` es un separador, uno solo.**
   `Gastos / Tasas` tiene tres caracteres en el medio y una sola junta.
4. **Los separadores de los extremos se van.** `¡¿Qué?!` acuña `que`.

Y el tope **al final**, 40 caracteres: cortar antes de juntar las corridas
dejaría el corte dependiendo de cuántos espacios había. Cuarenta y no veinte
porque `observaciones_del_cliente` —el ejemplo del usuario— tiene 25, y un tope
de veinte habría cortado justo el caso que la tarea existe para servir. El
corte es **al carácter y no a la palabra**, porque cortar en el último `_`
dejaría sin clave a un rótulo que es una sola palabra de más de 40 letras, que
es justo el caso que el tope tiene que resolver; lo que sí se quita es el
separador que el corte pudo dejar al final. El tope **no** es un `CHECK` de la
base, a propósito: así subirlo mañana no es una migración, y lo que la base
sostiene es la unicidad, que es la regla que de verdad no se puede violar.

Tiene **19 pruebas propias** en `test/plantillas-dominio.spec.ts`, y la última
es la hostil del conjunto: **acuñar lo acuñado no cambia nada**. No es una
curiosidad, es la propiedad que hace que la clave sea estable, y se rompe en
cuanto el tope corta en un lugar que depende de lo ya cortado o un separador
sobrevive en un extremo.

**Los dos 422, y por qué son dos.** El enunciado pedía que el choque no fuera
un 500. Lo que había que decidir es si el otro caso —el rótulo que no acuña
nada— es el mismo problema, y no lo es:

| Caso | Motivo | Qué pide la frase |
|---|---|---|
| `«»`, `---`, emoji, acentos sueltos | `rotulo_sin_clave` | una letra o un número |
| `Alcance`, `¡Alcance!`, una retirada | `clave_de_modulo_tomada` | otro rótulo, y mirar la lista |
| rótulo en blanco | `rotulo_requerido` | escribir algo |
| descripción en blanco | `descripcion_de_modulo_requerida` | que la IA va a leer eso |

Los cuatro motivos entran a `MotivoDeFalla` y por lo tanto a `src/mensajes.ts`,
cuyo `Record` es exhaustivo. **Ahí está la diferencia con T-2**, que ruteó su
redacción alrededor de ese archivo: T-2 eligió dos 409 porque la cadena vacía
que rechazaba era un valor impecable y lo que no admitía la escritura era el
estado de la fila —la forma de `rubro_sin_precio`—, y eso dejó sus frases en
`src/api/plantillas.ts`. Acá es lo contrario y por eso el reparto cambia: **hay
un dato que arreglar y es el rótulo**, que es el campo que la persona está
escribiendo. 422 con motivo, y la frase vive en `src/mensajes.ts` junto a las
otras treinta y nueve. Los dos 409 de T-2 siguen donde estaban, y el único que
se tocó fue el texto de `plantilla_inmutable`: decía «ese dato no se edita» y
ahora dice «no lo escribe el bufete», porque el mismo cuerpo lo contesta el
`PUT` y el `POST`.

`descripcion_requerida` **no se reusó** aunque exista, y es el criterio de
`texto_requerido` leído al revés: aquél dejó de nombrar la nota cuando el
pendiente empezó a compartirlo, para que una frase sirviera a dos. Acá las dos
frases **tienen** que decir cosas distintas —una habla del encargo que la IA
redacta, la otra de lo que la IA lee para redactarlo— porque las consecuencias
son distintas.

**El choque incluye las dadas de baja, y eso se midió con una mutación.**
`modulo_plantilla_clave_unica` no mira `activo`, así que una clave retirada
sigue tomada — y tiene que seguir tomada, porque desde `0017` los módulos de
las cotizaciones vivas la referencian por llave foránea. Medido agregándole
`AND activo = 1` a la comprobación: **1 fallando de 41** en
`test/plantillas-api.spec.ts`, y el error exacto es
`D1_ERROR: UNIQUE constraint failed: modulo_plantilla.tenant_id,
modulo_plantilla.clave`. O sea el 500 que el enunciado pedía no dejar llegar al
usuario, atrapado por una prueba.

Queda una carrera y se dice en vez de resolverse: dos altas simultáneas de la
misma clave pasan las dos por la comprobación y el único mata la segunda. Es el
mismo reparto que `nombreTomado` tiene en los catálogos desde T-12 —el índice
es el piso, la consulta es la mitad amable que permite contestar— y resolverlo
con un `INSERT … ON CONFLICT` sería atrapar el error de la base para
disfrazarlo, que es lo que este proyecto no hace.

**El verbo `creado`, y por qué no hubo octava reconstrucción de `bitacora`.**
Entró con una línea en `ACCIONES_POR_ENTIDAD`. La suposición obvia al leer que
un verbo nuevo entra al vocabulario es que hace falta una migración, y es
falsa: `creado` ya estaba en el `CHECK` de `accion` desde `0012:132` —lo
pusieron los catálogos y la cotización— y `modulo_plantilla` ya estaba en el
`CHECK` de `entidad` desde `0016`. **Lo que lo prueba es una prueba que ya
existía y no se tocó**: `test/bitacora-api.spec.ts` lee el `CHECK` de `accion`
de `sqlite_master` y lo enfrenta a `ACCIONES_DE_BITACORA`, que se **deriva** de
`ACCIONES_POR_ENTIDAD`; como `creado` ya estaba en el conjunto derivado,
agregarlo a esta entidad no lo cambió. Se dice en los tres lugares donde
alguien va a suponer lo contrario: el vocabulario, el contrato y el
repositorio. `migrations/` no se tocó, y es la única tarea de las siete que no
lo hizo ni lo necesitó.

**El tercer origen del texto, que el enunciado pedía resolver sin ramas ad
hoc.** `OrigenDelTexto` tenía dos variantes y T-2 argumentó que no podía haber
una tercera. Tenía razón con lo que existía entonces —las seis sembradas tienen
preset en las dos columnas— y la premisa se la quita esta tarea: una plantilla
propia nace con `rotulo_oficial` y `descripcion_oficial` en NULL. Entra
`sin_preestablecido`, que es exactamente lo que `OrigenDelPrecio` ya tenía con
`sin_precio`, y la pantalla cambia en tres cosas:

1. **No lleva marca.** El asterisco dice «el bufete escribió esto encima del
   preestablecido», y acá no hay nada encima de lo cual escribir. Marcarla sería
   afirmar una excepción sobre algo que no tiene norma.
2. **No enciende la leyenda, y ése era un defecto a punto de entrar.**
   `hayEditadas` miraba `rotulo !== null`, y el rótulo de una plantilla propia
   nunca es nulo: la leyenda del asterisco se habría dibujado sin que hubiera un
   solo asterisco en la página. Ahora pregunta por el **origen**, así que la
   leyenda y la marca salen de la misma función y no pueden discrepar.
3. **Lleva su distintivo**, `Sin preestablecido`, que dice lo mecánico que
   importa: vaciar un campo no la devuelve a nada. Hace falta porque la ayuda de
   arriba afirma que vaciar vuelve al preestablecido, y en esa fila es falso.

Medido apagando la tercera rama de `origenDe`: **2 fallando de 61** en
`plantillas-ui` y **1 de 40** en `e2e/plantillas.spec.ts` —«el módulo creado
aparece al final, con su clave y sin marca»—.

**Y el 409 que T-2 construyó sin poder ejercerlo, ejercido.**
`plantilla_sin_preset` y `camposQueQuedarianVacios` eran un contrato honesto
sobre una fila que no existía. Ahora existe: vaciar la descripción de una
plantilla propia contesta 409 con `campos: ["descripcion"]`, la fila queda
intacta, y la pantalla lo avisa antes de mandar. Las dos mitades tienen prueba,
una contra D1 y otra en el navegador.

**Dónde va el formulario, que el enunciado dejó a decidir.** Al final de la
lista y **siempre abierto**. Las tres opciones y lo que las descarta:

- **Detrás de un desplegable, no**: la queja del usuario es literalmente que no
  veía la opción, y esconderla detrás de un control que hay que abrir es cómo
  vuelve a no verse. El costo de tenerla abierta son dos campos vacíos al pie.
- **Arriba, tampoco**: a esta pantalla se entra a leer y a corregir lo que ya
  está; el alta primero empuja abajo el catálogo que se vino a buscar.
- **Al final, sí**, y no lo decide el descarte de los otros dos: lo decide que
  `orden = MAX(orden) + 1`, así que **el módulo nuevo aparece justamente ahí**,
  donde estaba el formulario que lo creó. Es además lo que los dos catálogos
  planos de T-6 ya hacen con su fila de alta.

Lo que cuesta, dicho: con veinte módulos el alta queda veinte bloques abajo.
Hoy son siete y el encabezado es navegable; el día que sean veinte lo que hace
falta no es mover el formulario sino que la lista se pueda recorrer, que es otra
tarea. Hay una prueba de punta a punta que compara las dos posiciones en el
dibujo, así que moverlo arriba se pone rojo.

**Ninguno de los dos campos lleva marca de opcionalidad**, y es la regla de
`FormularioDeCliente.tsx:4` aplicada al derecho: se marca lo opcional en la
etiqueta, y acá no hay nada opcional. Que los dos sean obligatorios lo dice el
párrafo de la sección —junto con que el identificador sale del rótulo y no se
cambia— **antes** de que alguien falle, y el botón está apagado hasta que los
dos tengan texto. Medido apagando la obligatoriedad de la descripción en el
servidor: **6 fallando de 150**, y el detalle importa —el alta contestó **201 y
escribió la fila**, no un 500: el `CHECK` de la base **no** atrapa este caso
porque una cadena vacía no es nula, así que la guarda de la API es lo único que
hay entre un campo en blanco y una plantilla que la IA va a usar mal.

**La pantalla no previsualiza la clave, y es una decisión.** Habría sido el
mejor acompañamiento para el motivo del choque —«se va a identificar como
`observaciones_del_cliente`»— y no se hizo por dos razones que se suman:

1. **Una acuñación duplicada no puede diferir en nada.** Una validación
   duplicada puede ser más laxa que la del servidor sin mentir —es lo que
   `catalogos/formulario.ts` hace—, pero una previsualización que no coincida
   carácter por carácter con lo que el servidor va a acuñar es una pantalla que
   promete un identificador que no es el que va a quedar.
2. **El hogar común no existe hoy.** `worker/plantillas/dominio.ts` cumple la
   condición documentada del `include` de `tsconfig.app.json` —ninguna
   importación en tiempo de ejecución— pero no está listado, así que importarlo
   desde una pantalla falla con TS6307. Es el mismo pendiente que T-6 dejó
   anotado, y ese archivo está fuera de la superficie de esta tarea.

Lo que la pantalla hace en su lugar: **dibuja la clave ya acuñada** debajo del
rótulo de cada módulo —incluido el nuevo, en cuanto existe— y el motivo del
choque manda a mirar esa lista, diciendo que el módulo que choca puede estar
dado de baja y seguir ahí. Si mañana `dominio.ts` entra al `include`, la
previsualización es diez líneas.

**El RED observado, por capa, y dónde no hubo.**

| Capa | RED | GREEN |
|---|---|---|
| `plantillas-dominio` (acuñación + revisión del alta) | **25 fallando de 71**, todas `acunarClave is not a function` / `revisarAltaDePlantilla is not a function` | 71 |
| `plantillas-rutas` (el `POST` y sus códigos) | **10 fallando de 38** | 38 |
| `plantillas-ui` (el tercer origen y el borrador del alta) | **16 fallando de 60** | 61 |

Las tres son las capas que llevan reglas nuevas, y en las tres la prueba se
escribió antes. `plantillas-api`, `modulos-api` y `generador-api` se escribieron
**después** de la implementación y se dice: son integraciones de reglas ya
probadas arriba, y lo que las vuelve algo más que confirmación son las
mutaciones medidas —la del `activo = 1` en la comprobación de la clave y la de
la descripción obligatoria— que es la evidencia de que muerden.

**La plantilla recién creada llega al prompt, medido.** El último eslabón, y el
que justifica la unidad entera: una plantilla de la que la IA nunca oye hablar
es una etiqueta. Se creó **por la API** y no por SQL —sembrarla a mano
saltearía la acuñación, que es la mitad nueva— y después se armó el prompt por
el camino real del generador:

| Qué | Antes | Después | Diferencia |
|---|---|---|---|
| Sección «Tipos de módulo» | **1.600** | **1.743** | **+143** |
| Prompt completo | 4.921 | 5.064 | +143 |
| Claves ofrecidas al modelo | 6 | 7 | +1 |

El +143 se descompone entero, que es lo que lo hace auditable: la línea
`- observaciones_del_cliente · Observaciones del cliente · <descripción>` mide
**142** caracteres y su salto de línea **1**. La sección crece exactamente lo
que mide la línea nueva, ni un carácter más.

Los totales de esa tabla son de la base de la suite, cuyo arancel casi no tiene
filas; la medición que se puede comparar con T-4 es la línea. Con la plantilla
que quedó en la base local —197 caracteres de descripción— la línea mide
**256** con su salto, así que sobre los **34.852** que T-4 midió el prompt pasa
a **35.108**: **+0,73 %**. Ese último número es derivado de la medición de T-4
más el largo exacto de la línea, no re-medido, y queda dicho así.

**La aplicación manejada a mano contra la base local** (API real, no
interceptada), en `http://localhost:5174`:

| Qué se midió | Resultado |
|---|---|
| Bloques y formulario en `/catalogos/modulos` | **6** bloques, formulario presente, botón apagado, 0 marcas, sin leyenda |
| El formulario está después del último bloque | sí, medido por `getBoundingClientRect` |
| Relleno del alta a 1400px | **26px** (el de `--espacio-l`): la consulta de contenedor se aplica |
| `«»` + descripción → Agregar | **«De ese rótulo no sale ningún identificador…»**, `aria-invalid`, lo tecleado sigue ahí, **6** bloques |
| `¡Alcance!` + descripción → Agregar | **«Ese rótulo produce el mismo identificador que un módulo que ya existe…»**, 6 bloques |
| «Observaciones del cliente» → Agregar | **7** bloques, clave `observaciones_del_cliente`, **último**, `orden = 7` |
| Marcas en el módulo nuevo / en la página | **0 / 0**; leyenda **no** dibujada |
| Distintivo del módulo nuevo | **«Sin preestablecido»** |
| El formulario después de crear | los dos campos vacíos, botón apagado, sin avisos |
| Fila en la base | `rotulo_oficial` y `descripcion_oficial` **NULL**, `activo = 1`, descripción de **197** caracteres |
| Bitácora de la fila nueva | **una** entrada, `creado`, detalle «Observaciones del cliente» |
| Desplegable del alta de módulo en `COT-2026-0011` | **7** opciones, con «Observaciones del cliente» |
| Módulo agregado y guardado | «Tipo del módulo 6: Observaciones del cliente» |
| La fila en `cotizacion_modulo` | `plantilla_id` apuntando por `JOIN` a `observaciones_del_cliente` |

**Lo que quedó en la base local del usuario, y no se puede deshacer.** Se dice
entero porque es permanente por diseño:

- **La plantilla `observaciones_del_cliente`**, `orden = 7`, activa, con su
  rótulo «Observaciones del cliente» y una descripción de 197 caracteres. No se
  puede borrar: `modulo_plantilla_no_se_borra` aborta todo `DELETE`. Se eligió
  un módulo que el bufete plausiblemente quiere en vez de un nombre de prueba,
  justamente porque la fila se queda. Si no la quieren, la salida es
  `activo = 0` desde la misma pantalla.
- **Una entrada de bitácora `creado`** de esa plantilla, y **un sexto módulo**
  en `COT-2026-0011` —un borrador— con su contenido de prueba y tres entradas
  más de la cotización. La bitácora es inmutable por diseño; el módulo se puede
  quitar desde el editor, y quitarlo deja su propia entrada.
- Las dos sondas de 422 **no escribieron nada**, y se midió: 6 bloques antes y
  después de cada una.
- Nada más. Las seis plantillas sembradas siguen con `rotulo` y `descripcion`
  en NULL y `activo = 1`.

**Verificación.** `pnpm lint`: sin hallazgos. `pnpm typecheck`: 0 errores.
`pnpm test`: **54 archivos, 2.807 pruebas, todas pasando** (desde 2.736: +71,
sin archivos nuevos). `pnpm test:e2e`: **552 pasando** en 1,5 min (desde 535:
+17, las del alta). En esta corrida `e2e/armazon.spec.ts:475` **no** parpadeó y
no hubo choque de puerto, así que no hizo falta repetir.

**Lo medido contra lo pronosticado.** La tajada 1 cerró con 9.532 insertadas
contra un forecast de ~1.000, y dejó escrito que el de la tajada 2 se hiciera
sobre la medición: unas 2.400 líneas por tarea grande, con tres de comentario y
de prueba por cada una de código. T-7 entregó **2.982 insertadas y 118
quitadas** sin este documento, o **3.100 líneas propias**, y el reparto explica
el número sin excusarlo: de las 2.982, **1.712 son pruebas** (`plantillas-api`
403, `e2e/plantillas` 357, `plantillas-ui` 305, `plantillas-dominio` 299,
`plantillas-rutas` 182, `generador-api` 116, `modulos-api` 50) y **1.270 son
código con su argumentación**. El forecast de la tajada 2 acertó el orden de
magnitud por primera vez en la unidad.

Está muy por encima de las ~400 líneas que la heurística de planificación
sugiere por tarea, y conviene decir por qué no se partió: el enunciado de T-7
es **una** operación —una plantilla nace— y sus cinco piezas no son
independientes. La acuñación sin la ruta no se puede ejercer, la ruta sin los
dos 422 es la que deja llegar un `UNIQUE constraint failed` al usuario, y la
pantalla sin el tercer origen dibuja una leyenda sin asterisco. Partirla habría
dejado commits que no se pueden verificar por separado, que es lo que el
tamaño de la tajada 1 ya enseñó a no hacer.

### La tajada 2, cerrada

**Lo que entrega de punta a punta.** El abogado entra a `/catalogos/modulos`,
**agrega un módulo propio** con su rótulo y su descripción, y el sistema le
acuña un identificador estable que nadie va a tener que tipear ni corregir.
Abre una cotización el mismo día, elige ese módulo del desplegable, escribe su
texto, y cuando le pide una propuesta al asistente, el modelo recibe para qué
sirve ese módulo con las palabras del bufete. Si el rótulo choca con otro o no
produce ningún identificador, lee una frase que dice qué pasó y qué hacer, en
vez de un error de SQLite. Y lo que creó no se puede borrar ni perder: se
retira con `activo = 0` y los módulos que ya lo usan siguen nombrándolo.

**Los siete criterios de aceptación, todos con su medición.** Son los de la
unidad entera, y la tajada 2 no los cambió sino que los extendió a las filas
que antes no existían:

1. **Rótulo y descripción editables desde `/catalogos/modulos`, visibles en el
   editor** — T-2 (pantalla manejada a mano: 6 bloques, 1 marca tras editar) y
   T-3 (editor de `COT-2026-0011`, «Qué vamos a hacer» en el módulo 2).
2. **Vaciar vuelve al preset, y el preset sigue siendo el original** — T-2 (0
   marcas tras vaciar) y T-1 (nueve sondas hostiles). T-7 agrega la mitad que
   faltaba: en una plantilla **sin** preset, vaciar es un 409 y la pantalla lo
   avisa antes, medido contra D1 y en el navegador.
3. **Ningún camino borra una plantilla ni edita su preset ni su clave** — T-1
   (las nueve sondas con su mensaje exacto). T-7 lo extiende al alta: un cuerpo
   que trae `rotuloOficial` es 409 `plantilla_inmutable`, con prueba.
4. **Una plantilla sin descripción vigente no existe** — T-1 (los dos `CHECK`).
   T-7 cierra el camino que la habría creado: 422 antes del `CHECK`, y la
   mutación mostró que el `CHECK` **no** cubre la cadena vacía.
5. **La descripción de cada módulo llega al prompt, medido en caracteres** —
   T-4 (494 → 1.599, +1.105 sobre la base local). T-7: la plantilla creada
   agrega su línea exacta, 1.600 → 1.743, +143 descompuesto en 142 + 1.
6. **Las 6 cotizaciones emitidas siguen mostrando su rótulo congelado** — T-3
   (33 entradas idénticas, seis `length(snapshot)` iguales al byte) y T-5 (la
   medición repetida mutando la fuente viva en el medio).
7. **Las cuatro verificaciones en verde** — en las siete tareas; hoy 2.807
   pruebas y 552 de punta a punta.

**Lo medido contra lo pronosticado, en la unidad entera.** Tajada 1: 9.532
insertadas contra un forecast de ~1.000. Tajada 2: **5.462 insertadas y 636
quitadas**, contadas con `git show --numstat` —`fea57bd` +1.659/−113,
`baf1f1d` +49/−37, `ca5fddc` +772/−368, y éste +2.982/−118 más este
documento—, contra un forecast hecho sobre la medición de la tajada 1.
**Alrededor de 15.000 líneas insertadas** en siete commits para la unidad
entera, y el motivo sigue siendo el mismo y sigue siendo
identificable: este repositorio escribe alrededor de tres líneas de comentario
y de prueba por cada una de código, y T-7 lo midió fila por fila —1.712 de
2.982 son pruebas—.

**Lo que no entró y queda anotado, sin agendar.** Ninguno bloquea nada:

- La pantalla de `/catalogos/modulos` **no dibuja la bitácora** de una
  plantilla, aunque la dirección contesta y tiene prueba desde T-2. Hoy la
  primera entrada de esta entidad ya existe, así que el despliegue por fila que
  los catálogos de T-6 tienen vale más que antes. Es una fila de tabla, no un
  camino nuevo.
- **Reordenar las plantillas.** `0016` dejó `orden` editable y sin único
  justamente para eso, y el repositorio dice qué falta: la sentencia, no un
  cambio de esquema. Hoy el módulo nuevo nace último y no se puede mover.
- **`worker/plantillas/dominio.ts` en el `include` de `tsconfig.app.json`.**
  Cumple la condición documentada y agregarlo habilitaría la previsualización
  de la clave en el formulario, que es la única cosa que esta tarea quiso hacer
  y no pudo.
- **La previsualización de la clave**, que depende del punto anterior.

**Empujar la rama, abrir el pull request y mezclar siguen siendo decisión del
usuario.**
