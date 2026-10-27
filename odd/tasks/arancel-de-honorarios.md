# El arancel de honorarios, sembrado y editable

## El problema

Las palabras del usuario, que son el criterio:

> «Los precios de los servicios deben ser configurables con un preset con
> esto [el arancel del Órgano Judicial]. Pero debe ser configurable: el
> abogado decide cuánto cobra, esto solo serán los presets. Pienso que
> idealmente una tabla similar a la estructura que tiene el documento que te
> pasé, y esta tabla sea editable con los presets siempre presentes, y que
> tenga como un comentario que diga que esos valores están basados en la ley
> x bla bla bla.»

Hoy **no hay dónde guardar un precio, en ningún lado**. Medido, no supuesto:

| Dónde | Qué hay |
|---|---|
| `tipo_proceso` (`migrations/0001:104-112`) | `id, tenant_id, area_id, nombre, descripcion, activo`. Cero columnas de dinero. |
| `cotizacion_linea` (`migrations/0004:249-263`) | `concepto`, `monto` suelto. Sin cantidad, sin precio unitario, sin descuento. |
| `EditorDeLineas.tsx` | Elegir un tipo de proceso **no** prellena el monto. La relación es para abrir el proceso después (T-7), nunca para tarifar. |

O sea que cada monto de cada cotización se tipea a mano, siempre, o lo propone
la IA. Y el bufete no tiene en ninguna parte la respuesta a «¿cuánto cobramos
nosotros por una visa de pensionado?».

## La fuente

**Acuerdo No 49 del 24 de abril de 2001**, Sala Cuarta de Negocios Generales
de la Corte Suprema de Justicia, que aprueba la *Tarifa de Honorarios
Profesionales Mínimos de los Abogados en la República de Panamá*, aprobada a
su vez por la Asamblea General de Abogados del 19 de febrero de 2000.
Publicado por el Órgano Judicial.

Tres hechos de la fuente que el diseño tiene que respetar:

1. **Es un mínimo, no una lista de precios.** El Artículo 1 dice que pactar
   honorarios inferiores es «deslealtad y falta a la ética profesional»,
   salvo amparos de pobreza y patrocinio legal gratuito. Y dice también que
   «es válido todo acuerdo… que fijen honorarios superiores».
2. **Tiene 25 años y nunca se indexó.** Los montos son de 2001. Como preset
   están bien; como precio de 2026, no. El bufete va a editar casi todos
   hacia arriba, y por eso **manda la columna del bufete**, no la oficial.
3. **El PDF oficial tiene erratas que rompen la aritmética.** En Estudios de
   Títulos: «honorario convencional mayor de B/.1,000.00 sin que exceda del
   **0.0085%**». El 0.0085% de B/.250,000 son B/.21, por debajo de su propio
   piso de mil: es casi seguro 0.85%. Hay más —`B/,2,000.00` con coma,
   `B/.2.000.00` con punto de miles, «11/2» por 1½%, «horarios» por
   «honorarios»—. **Ninguna se corrige en silencio**: se transcribe lo que
   dice el documento y la lectura va aparte, anotada.

## La forma

### Una tabla con la estructura del documento

Categoría → numeral → concepto → monto, igual que el papel. Se siembra entera
y **los renglones no se borran**: se desactivan. El preset siempre está.

**Los números reales, medidos por T-1 y no estimados.** Esta sección decía
antes «358 renglones con monto fijo en 22 categorías». Era un `rg` mío sobre
el volcado de texto, y estaba mal en las tres cifras:

| | Lo que decía yo | Lo que hay |
|---|---|---|
| Renglones | 358 | **453** |
| Con monto | 358 | **282** |
| Con regla | 54 | **97** |
| Rubros sin valor | — | **74** |
| Categorías | 22 | **29** (27 con renglones) |

De las 399 apariciones de `B/` dentro del Artículo 4, solo 282 son el precio
de un renglón: 68 son **umbrales de cuantía dentro del concepto** («De
B/.0.01 hasta B/.3,000.00»), 41 están dentro del texto de una regla y 8 en
parágrafos. Contar sigilos de moneda y creer que son precios es exactamente
el error que la extracción automática evita.

Y hay una tercera clase que yo no había previsto: el **rubro**, un numeral
que el documento imprime sin ningún valor porque es el encabezado de sus
hijos («3. Inmigrantes», «12. Recursos Administrativos»). Son 74. No llevan
precio editable, y T-2 tiene que saberlo o le va a ofrecer al abogado un
campo de monto sobre un título.

### Dos montos guardados, uno solo a la vista

| Columna | Quién la escribe | Se puede editar |
|---|---|---|
| `monto_oficial` | La siembra, desde el Acuerdo | **No.** Es una cita, no un dato nuestro. |
| `monto` | El bufete | Sí. Es lo que el bufete cobra. |

Las dos se guardan. **Una sola se muestra: la del bufete.**

Y acá hay una corrección del usuario sobre la primera versión de este
documento, que vale escribir porque cambia de qué se trata la pantalla:

> «¿No sabés qué? Esperá: mejor, en lugar de siempre al lado, un tipo
> hipervínculo que te permita ver la tabla. Así no se siente que el sistema
> juzga tus precios, sino que el sistema sabe cuánto cuesta y te lo sugiere.»

La primera versión ponía las dos columnas lado a lado, y de paso proponía
avisar cuando el precio del bufete quedara por debajo del mínimo. Eso
convierte la pantalla en **una auditoría**: cada vez que el abogado mira su
precio, el sistema le está mostrando la vara con la que lo mide. El Artículo
1 existe y dice lo que dice, pero **no es trabajo de esta aplicación
vigilarlo**; el abogado sabe en qué país ejerce.

Entonces el sujeto cambia. El sistema no mide: **sabe cuánto cuesta y lo
sugiere.** En concreto:

- un precio a la vista por servicio, **el del bufete**, que arranca siendo la
  sugerencia del arancel y se edita encima;
- al lado, un **enlace discreto** —«de dónde sale este precio»— que abre la
  tabla del arancel, completa y de solo lectura, en la estructura del
  documento;
- **ninguna comparación en línea, ningún aviso de «estás por debajo»,
  ninguna marca de color sobre el precio propio.**

El valor oficial se sigue guardando inmutable, y no es ceremonia: es lo que
hace que el enlace tenga qué mostrar y que dentro de dos años se pueda saber
de dónde salió cada sugerencia. Pero se guarda para consultarlo, no para
confrontarlo.

### Las 97 reglas que no son un monto

Los procesos civiles y comerciales no tarifan un monto sino un **porcentaje
por tramos sobre la cuantía** («25% de menor cuantía», «B/.2,000.00 más el
35% de lo que se obtenga»). Esas no se auto-calculan en esta tajada, por dos
razones y las dos son de evidencia: la cuantía no es un dato que la cotización
pida hoy, y varias de esas reglas son justamente las que tienen las erratas.
Se guardan como **texto de la regla oficial**, sin monto, y el bufete escribe
su propio monto al lado si quiere. Auto-calcular una tarifa progresiva a
partir de un texto con erratas es la clase de aritmética que nadie va a
revisar hasta que salga mal en una cotización.

### La nota de procedencia

Visible, pero **en la tabla del arancel, no encima del precio del bufete**:
de qué acuerdo salen los valores, de qué fecha, y que son mínimos de 2001.
Ese es el lugar donde alguien fue a preguntar de dónde sale un número, así
que es donde la respuesta sirve. Puesta al lado del precio propio sería una
advertencia permanente sobre una decisión que ya tomó el abogado.

## Alcance autorizado

Entra: la extracción del PDF a datos sembrados, la migración de la tabla, la
API de lectura y edición, y la pantalla del catálogo dentro de Catálogos.

**No entra en esta tajada** —y se dice para que no se cuele—: prellenar la
línea de una cotización con el precio del arancel. Es el paso siguiente y
obvio, pero es otra tajada: toca `EditorDeLineas`, el congelado del snapshot
y la propuesta de la IA, que hoy sugiere montos sin ver ningún precio.
Tampoco entran las reglas por cuantía auto-calculadas ni el cambio de
moneda (`cotizacion.moneda` es un `CHECK` cerrado en `'USD'`).

## Las tareas

### T-1 · Sacar el arancel del PDF sin inventar nada

- [x] Script de extracción reproducible, con el PDF como entrada y datos
      estructurados como salida. No se transcribe a mano: 453 montos
      copiados a ojo es una errata nuestra encima de las del documento.
- [x] Cada renglón lleva categoría, numeral tal como aparece, concepto,
      monto en centavos enteros, y —cuando no hay monto— el texto de la
      regla.
- [x] Las erratas del documento se transcriben **como están** y se anota
      aparte la lectura, con el renglón que la motiva. Ninguna corrección
      silenciosa.
- [x] Un conteo de control contra el PDF: cuántos renglones, cuántos con
      monto, cuántos con regla. Si no cuadra, no se sigue.

### T-2 · La tabla

- [x] Migración con `monto_oficial` inmutable y `monto` del bufete,
      centavos enteros con el `CHECK (typeof(...) = 'integer')` que usa todo
      el esquema, `tenant_id`, `activo`, y el orden del documento.
- [x] Un disparador que impida modificar `monto_oficial` después de la
      siembra, igual que los de `0006_emitir_y_congelar.sql`: si es una cita,
      la base lo sostiene y no la buena intención.
- [x] **La clave es `(tenant_id, orden)`, nunca el numeral.** T-1 lo midió:
      44 renglones, en 15 grupos, comparten numeral con otro de su misma
      categoría —29 si se cuentan solo las repeticiones más allá de la
      primera—, por tres
      razones del documento —las letras reinician bajo cada padre,
      «ACTUACIONES EN NEGOCIOS CRIMINALES» tiene dos secciones numeradas `5.`,
      y los renglones sin numerar heredan el del padre—. Un `UNIQUE` sobre el
      numeral hace fallar la siembra, y peor: hace *parecer* que el acuerdo
      está mal numerado cuando el que está mal es nuestro supuesto.
- [x] **Los tres `clase` del dato se respetan**: `monto` lleva precio
      editable, `regla` lleva texto y precio editable opcional, y **`rubro` no
      lleva precio** —son los 74 encabezados que el acuerdo imprime sin valor.
- [x] Las dos secciones que son **solo una frase en prosa** y ningún renglón
      —«OTROS ASUNTOS» (todo lo no listado a B/.150 la hora) y «PROCESO DE
      SEPARACIONES DE BIENES…» («la misma tarifa de la sección 2»)— tienen
      que sobrevivir a la siembra, o desaparecen del arancel sin que nadie
      lo note.
- [x] La siembra, idempotente, desde `scripts/arancel/arancel.json`.

### T-3 · La pantalla

Son **dos**, y la separación es la corrección del usuario hecha estructura.

- [x] **Los precios del bufete.** Un precio por servicio, el del bufete,
      editable. Nada de la columna oficial acá: ni al lado, ni abajo, ni en
      un color.
- [x] **El enlace.** Discreto, junto al precio, con un rótulo que ofrezca en
      vez de advertir —«de dónde sale este precio»— y que lleve a la tabla
      del arancel, al renglón que corresponde.
- [x] **La tabla del arancel**, de solo lectura, agrupada por categoría como
      el documento, con la nota de procedencia arriba.
- [x] Buscar por concepto: 453 renglones sin buscador no se usan.
- [x] Un servicio sin precio propio **muestra la sugerencia del arancel como
      valor de arranque**, no un campo vacío ni un cero. El sistema sabe
      cuánto cuesta; que lo diga.

## Criterios de aceptación

1. La tabla del arancel trae los 453 renglones del Acuerdo, agrupados como
   el documento, y dice de dónde salen.
2. El monto oficial no se puede editar, ni por la API.
3. El monto del bufete se edita y es **el único que se ve** en la pantalla de
   precios; arranca con la sugerencia del arancel.
4. Desde el precio de un servicio se llega al arancel con un clic, y **en
   ningún lugar de esa pantalla aparece el monto oficial ni una comparación
   con él**. Esto se prueba, no se promete.
5. `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e` en verde.

## Verificación

`pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm test:e2e`

Prueba primero donde hay lógica corrible: el parseo del arancel (montos con
coma, con punto de miles, partidos en dos renglones) y la regla de
inmutabilidad del monto oficial.

## Entrega

Tres commits de unidad de trabajo en `feat/r1-fundacion`, uno por tarea. PR y
merge siguen siendo decisión del usuario.

## Progreso

- Documento creado. Ninguna tarea cerrada.
- **T-1 cerrada.** `pnpm arancel:extraer` lee
  `docs/fuentes/acuerdo-49-2001-tarifa-abogados.pdf` con `pdftotext -layout`
  y escribe `scripts/arancel/arancel.json`. El parseo puro vive en
  `scripts/arancel/parseo.mjs` y lo ejercen 58 pruebas en
  `test/arancel-api.spec.ts`. Las lecturas de las erratas, numeradas, en
  `scripts/arancel/lecturas.md`.
- **Los números de este documento estaban mal, y los medidos son otros.**
  No son 358 montos ni 54 reglas ni 22 categorías: son **453 renglones en 29
  categorías** —27 con renglones, 2 con solo prosa—, de los cuales **282
  llevan monto fijo**, **97 llevan regla en texto** y **74 son rubros** que
  el acuerdo imprime sin valor porque solo agrupan a sus hijos. Las 358
  tarifas estimadas eran un conteo de apariciones del sigilo `B/` sobre el
  volcado: de las 399 que hay dentro del Artículo 4, 282 son el valor de un
  renglón, 41 están dentro de un texto de regla, 68 dentro de un concepto
  —son topes de cuantía, «De B/.0.01 hasta B/.3,000.00»— y 8 en los
  parágrafos. La suma cuadra exacto y es el control que el script corre.
- **`sinClasificar` quedó vacío**: ninguna línea del Artículo 4 se descartó.
- Hay dos cosas que el criterio de aceptación 1 tiene que corregir cuando se
  reescriba: los renglones son 453, no 358, y la clave de un renglón es
  `orden`, no `numeral` —el acuerdo repite numerales en 44 renglones, ver la
  lectura 13—.
- **T-2 cerrada.** `migrations/0012_arancel_de_honorarios.sql` trae
  `arancel_renglon` y `arancel_nota`, la API vive en `worker/arancel/`
  (`dominio.ts` puro, `repositorio.ts` sobre D1, `rutas.ts` HTTP), el cliente
  del navegador en `src/api/arancel.ts`, y la siembra en
  `scripts/arancel/sembrar.mjs` (`pnpm arancel:sembrar`). Corrida contra una
  D1 local: **453 renglones y 57 notas**, 282 con monto, 97 con regla, 74
  rubros, 0 montos no enteros. La segunda corrida deja la base idéntica y un
  `monto` puesto a mano sobrevive. 72 pruebas nuevas en
  `test/arancel-dominio.spec.ts` (27) y `test/arancel-rutas.spec.ts` (45).
- **Las tres trampas que T-1 midió, y qué se hizo con cada una.**
  - *El numeral no es clave.* El `UNIQUE` va sobre `(tenant_id, orden)` y hay
    una prueba que inserta **dos renglones con el numeral `5`** en
    `ACTUACIONES EN NEGOCIOS CRIMINALES`: si alguien agrega un índice único
    sobre el numeral, se pone roja.
  - *El rubro no lleva precio.* `CHECK un_rubro_no_lleva_precio` en la base,
    `puedeLlevarPrecio` en el dominio, y un **409 `rubro_sin_precio`** en la
    API. El nulo sí se acepta sobre un rubro: borrar lo que no hay es un
    no-op, no un conflicto.
  - *Las dos secciones de pura prosa sobreviven.* Van a `arancel_nota`, y
    `GET /api/arancel` las devuelve como categorías con `renglones: []`. Son
    **29 categorías** en la respuesta: 27 con renglones y 2 de prosa.
- **El número de numerales repetidos de este documento estaba mal.** Dice «31
  renglones comparten su numeral con otro de la misma categoría», y ninguna
  lectura de `arancel.json` da 31. Lo medido: **44 renglones en 15 grupos**, o
  **29** si se cuentan solo las repeticiones por encima de la primera de cada
  grupo. La conclusión no cambia y se refuerza; el número sí, y el medido
  queda escrito en el encabezado de la migración y en la prueba.
- **La inmutabilidad de la cita tiene dos mitades, y las dos están probadas.**
  El disparador `arancel_renglon_citado_no_se_edita` aborta el `UPDATE` de los
  siete campos citados —`categoria`, `numeral`, `concepto`, `orden`, `clase`,
  `monto_oficial`, `regla_oficial`—, y la API se niega antes con un **409
  `renglon_citado`** que nombra los campos. Las dos hacen falta: sin la de la
  API, un cuerpo con `montoOficial` saldría como un 500 de SQLite crudo, que
  no es una negativa sino una caída; sin la de la base, la cita quedaría
  sostenida por un `if`. El criterio de aceptación 2 queda cumplido con ambas.
- **La bitácora se reconstruyó por sexta vez, y no era evitable.**
  `worker/db/base.ts` es el único camino de escritura y su `mutar` exige el
  hecho como primer parámetro, así que el precio del bufete necesitaba una
  entidad del vocabulario. No había ninguna a la que atribuirlo sin mentir, de
  modo que entró `arancel_renglon` con un solo verbo, `editado`, que ya tenía
  frase. Costo: el `CHECK` de `entidad` obliga a copiar la tabla, y la entidad
  nueva obligó a tocar **dos archivos fuera de la superficie autorizada de
  T-2** —`worker/bitacora/vocabulario.ts` y `worker/bitacora/rutas.ts`—, los
  dos forzados por el compilador desde el cambio en `worker/contract.ts`:
  `ACCIONES_POR_ENTIDAD` es un `satisfies Record<EntidadRegistrada, …>` y
  `COLECCION_POR_ENTIDAD` y `existeLaFila` son exhaustivos a propósito. De
  yapa queda `GET /api/arancel/{id}/bitacora`.
- **La nota de procedencia no viaja por la API, y es decisión de T-2.** De qué
  acuerdo salen los valores, de qué fecha y que son mínimos de 2001 es
  **texto de cara al usuario**, y en esta aplicación eso vive en `src/`
  —`src/mensajes.ts`, `src/bitacora.ts`— y no en la base. Meterlo como fila
  obligaría a protegerlo con su propio disparador y a sembrarlo; meterlo como
  constante del contrato sería una tercera copia del mismo literal que ya está
  en `arancel.json` y en el encabezado de la migración. T-3 escribe la frase
  donde la frase se lee: arriba de la tabla del arancel.
- **Deuda que T-2 deja escrita, fuera de su alcance.**
  - *La posición exacta de una nota en el documento no está en los datos.*
    `arancel.json` guarda el orden de las notas entre sí, pero no dónde cae
    cada una respecto de los renglones. `agruparPorCategoria` ubica las dos
    categorías de prosa con una regla —van inmediatamente antes de la
    siguiente categoría que las notas nombren y que sí tenga renglones— que se
    **verificó contra el volcado del PDF** para las dos reales: «OTROS
    ASUNTOS» cae entre `ASUNTOS ANTE EL MINISTERIO DE VIVIENDA` y `ASUNTOS DE
    DERECHO PROCESAL (CIVIL-COMERCIAL)` (líneas 992, 1031 y 1035 del volcado),
    y «PROCESO DE SEPARACIONES…» entre `MENORES` y `PROCESOS ESPECIALES SOBRE`
    (1168, 1181 y 1184). La salida definitiva es que la extracción registre la
    posición de cada nota, y es tarea de T-1 si alguien vuelve a correrla.
  - *`activo` no tiene ruta que lo escriba.* La columna existe y el disparador
    `arancel_renglon_no_se_borra` hace de `activo = 0` la única salida, pero
    T-2 abre lectura y la edición del `monto`, nada más. Hoy la escribe la
    siembra al insertar; el día que un acuerdo nuevo derogue un renglón, la
    ruta entra con los verbos `dado_de_baja` y `reactivado`, que ya tienen
    frase en `src/bitacora.ts`.
  - *Los dos 409 nuevos no están en `CONFLICTOS` de `src/api/peticiones.ts`.*
    Sus frases viven en `textoDeProblemaDelArancel`, dentro de
    `src/api/arancel.ts`, para que no cayeran en el texto de reserva que habla
    de un borrado que nadie pidió —la sin razón que esta tajada ya pagó tres
    veces—. Mudarlas al mapa compartido es parte del `MotivoDeConflicto` que
    ese archivo ya tiene anotado como pendiente.
- **La base local de desarrollo quedó con el arancel puesto.** Su
  `d1_migrations` estaba vacío —viene de antes del seguimiento de
  migraciones—, así que `migrations apply` no corre sobre ella; se le aplicó
  `0012` sola y se la sembró. Los 154 asientos de bitácora y los datos de
  prueba (8 clientes, 9 procesos, 10 cotizaciones) sobrevivieron intactos a la
  reconstrucción de la tabla.
- Próximo paso: T-3, las dos pantallas. `GET /api/arancel` ya entrega la tabla
  agrupada como el documento, y `src/api/arancel.ts` ya tiene las dos
  funciones que esas pantallas necesitan.

- **T-3 cerrada.** Dos pantallas —`/catalogos/precios` y
  `/catalogos/arancel`— con un solo módulo de lógica pura detrás,
  `src/pantallas/catalogos/precios.ts`, ejercido por 39 pruebas en
  `test/precios-ui.spec.ts`. El dibujo lo miden 14 pruebas nuevas en
  `e2e/precios.spec.ts`. Las dos entran a `Catalogos.tsx` con enlace propio y
  a `PANTALLAS` de `e2e/navegacion.spec.ts` como `bajo: "/catalogos"`.
- **El criterio de aceptación 4 se prueba estructuralmente, no por texto.**
  `e2e/precios.spec.ts` cuenta las cifras de dinero que cada fila renderiza
  **en sus `<td>`** y exige que no pase de una. El concepto y el texto de la
  regla van en `<th scope="row">`, y eso no es semántica de tabla sino lo que
  hace posible la cuenta: la cita trae importes adentro —«De B/.0.01 hasta
  B/.3,000.00», «B/.2,000.00 más el 35%»— que tienen que verse y no son el
  precio de la fila. Medido a mano contra los **453 renglones de verdad** de
  la D1 local: **máximo una cifra por fila**, 379 filas con campo de precio y
  **74 sin ninguno** —exactamente los 74 rubros que midió T-1—. Dos pruebas
  más lo atacan por otros dos flancos: que el monto del acuerdo de un
  servicio que ya tiene precio propio no aparezca en **ningún** lugar de la
  pantalla, y que no aparezca ninguna de las palabras con las que un precio
  se mide contra otro —«mínimo», «oficial», «debajo», «acuerdo», «arancel»—.
- **Lo que no se hizo, y es la corrección del usuario sostenida.** Ni columna
  oficial, ni «mínimo: X», ni aviso de estar por debajo, ni color sobre el
  precio propio. La única marca es la palabra «sugerido», apagada y en
  minúscula, que se cae en cuanto el bufete decide. El lugar de la nota de
  procedencia es la tabla del arancel, arriba, y `e2e/precios.spec.ts` afirma
  esa posición como **orden en el documento** (`compareDocumentPosition`) y
  no como coordenada, porque la coordenada cambia con el ancho y el orden no.
- **El renglón viaja como fragmento, no como segmento.** `/catalogos/arancel`
  no lleva parámetro: la tabla se muestra entera siempre —es un documento, no
  una ficha— y el aterrizaje es `#renglon-{id}`, deletreado una sola vez por
  `anclaDelRenglon` para que el `href` de una pantalla y el `id` del `<tr>` de
  la otra no puedan discrepar. El salto lo hace `Arancel.tsx`, porque
  `navegarA` empuja con `pushState` y `pushState` no salta a un fragmento.
  Medido a mano: desde el renglón 300 de 453, el clic deja la fila en el
  centro de la ventana y marcada.
- **Tres cosas que se midieron en el navegador y cambiaron el dibujo.**
  - *El enlace apilado hacía la tabla el doble de alta.* Con el rótulo debajo
    del campo, cada fila medía unos 140px a 1440px y «de dónde sale este
    precio» se partía en dos renglones: más de sesenta mil píxeles de alto
    para una tabla que se recorre buscando una fila. En la misma franja que
    el campo, la fila típica bajó a **95px**.
  - *El campo prometía un párrafo.* `.campo__control` hereda
    `inline-size: 100%`, así que el campo de «500.00» medía la celda entera.
    Tope de `12ch` dentro de `.precio`.
  - *La ayuda del buscador no tenía tope.* Se envolvió en `Prosa` (§9).
- **El `rubro` no lleva campo y la `regla` sí.** Es la misma regla que el
  `CHECK un_rubro_no_lleva_precio` de la migración y `puedeLlevarPrecio` de
  `worker/arancel/dominio.ts`, y ahora tiene una **tercera mitad** en `src/`.
  La importación del Worker habría sido mejor —hay precedente:
  `cotizaciones/lineas.ts` importa de `worker/cotizaciones/lineas.ts`— pero
  cuesta listar `worker/arancel/dominio.ts` en el `include` de
  `tsconfig.app.json`, que está fuera de la superficie autorizada de T-3. El
  módulo califica para esa lista: lo único que importa son tipos de
  `worker/contract.ts`, que se borran al compilar. Queda anotado en el
  encabezado de `src/pantallas/catalogos/precios.ts`.
- **Deuda que T-3 deja escrita, fuera de su alcance.**
  - *El campo vacío borra el precio propio, y eso se explica con un párrafo.*
    No hay un botón «volver a la sugerencia» por fila: serían 453 botones más
    para una operación que casi nadie va a hacer. La ayuda arriba de la tabla
    lo dice, y `montoParaGuardar("")` lo convierte en el nulo que
    `fijarMontoDelArancel` manda.
  - *La búsqueda de la pantalla de precios y la del arancel comparten regla y
    no caja.* Son dos `<input type="search">` con su propio estado. Juntarlas
    en un componente es una refactorización, no un defecto.
  - *El criterio de aceptación 1 sigue diciendo 358 renglones.* T-1 ya dejó
    anotado que son 453 y que la clave es `orden` y no `numeral`. T-3 no
    reescribe los criterios: los cumple sobre los 453 que hay.
- **Verificación de T-3, corrida en primer plano.** `pnpm lint`: limpio.
  `pnpm typecheck`: limpio. `pnpm test`: **2344 pruebas en 46 archivos**
  (2305 en 45 antes; +39 de `precios-ui`). `pnpm test:e2e`: **452** (438
  antes; +14 de `precios`). Ninguna prueba previa se tocó salvo `PANTALLAS`
  de `e2e/navegacion.spec.ts`, que **no compila** hasta que una variante
  nueva de `Ruta` declara bajo qué sección vive.

- **Corrección posterior: la marca de esta pantalla cambió de signo.** Donde
  arriba dice «la única marca es la palabra "sugerido", apagada y en
  minúscula, que se cae en cuanto el bufete decide», hoy hay un asterisco
  apagado sobre la fila que el bufete **sí** editó, con su leyenda arriba de
  las tablas. Es el mismo literal que dibuja la vista expandida de la
  cotización, y el motivo es la frase con la que el usuario corrigió T-2 de
  `odd/tasks/precios-en-la-cotizacion.md`: «los preestablecidos son eso,
  preestablecidos: son la norma hasta que se editen, no son una
  subcategoría». Marcar el valor por defecto lo convierte en un estado menor.
  **La corrección de T-3 queda intacta y es lo que esto sostiene**: la marca
  sigue sin ser una comparación y sin ser un aviso —no es un color, no nombra
  el acuerdo, no dice que haya nada que revisar—, y las tres pruebas del
  criterio de aceptación 4 siguen verdes sin tocarse. El detalle, con sus
  medidas, está en «T-2 ter cerrada» de
  `odd/tasks/precios-en-la-cotizacion.md`.
