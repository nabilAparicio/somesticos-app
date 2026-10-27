# Tus precios llegan a la cotización, y al agente

## El problema

Las palabras del usuario, que son el criterio:

> «¿Estos precios se le inyectan al agente cuando se hace la cotización
> asistida? Idealmente el agente recibe esto y entiende qué tarifas aplicar
> basado en el contexto de la consulta. También en la vista de cotización
> debe poder verse, para que el usuario sepa sus propios precios en todo
> momento.»

La respuesta a la pregunta es **no**, y medida:

| Dónde | Qué pasa hoy |
|---|---|
| `worker/ia/prompt.ts:92` | Todo lo que el modelo sabe de un trámite es `- {id} · {nombre} ({área})`. **Ni un precio.** |
| `worker/ia/prompt.ts:171` | Y sin embargo se le pide `monto` en centavos enteros. |
| `worker/ia/esquema.ts:310-333` | El `monto` es **obligatorio**: si falta, `monto_invalido` y la línea se descarta. |
| `EditorDeLineas.tsx` | Elegir un trámite no prellena ningún monto. |

O sea: **le pedimos una cifra de dinero a alguien al que no le dijimos cuánto
cobra el bufete.** Lo único que el sistema sí defiende es que el modelo no
sume (§8: la IA rellena campos tipados, el sistema hace la aritmética), pero
el monto de cada línea sale de su imaginación.

La tajada del arancel dejó el catálogo construido y **nadie lo consume**.

## La decisión que define la forma

Pregunta hecha al usuario, con dos bocetos. Su respuesta:

> **El sistema pone el precio.**

El modelo elige **qué** servicio aplica según el contexto de la consulta; el
monto lo pone el sistema desde el catálogo. El modelo solo escribe un monto
libre cuando la línea no corresponde a ningún servicio tarifado.

Es la frontera de §8 corrida un paso. Ya decía «la IA rellena campos
tipados, el sistema hace la aritmética»; ahora el precio de un servicio
conocido deja de ser un campo que la IA rellena y pasa a ser aritmética del
sistema. **Para todo lo que está en el catálogo, un monto alucinado deja de
ser posible** — no porque el modelo se porte bien, sino porque no hay dónde
escribirlo.

## La secuencia, que cambia el orden de todo

Hoy hay **cero** precios del bufete cargados: las 453 filas de
`arancel_renglon` tienen `monto` en `NULL`. Entonces:

- **Al agente viaja solo lo que el bufete ya tarifó**, nunca el monto
  oficial. Inyectar el arancel sería pasarle **mínimos de 2001**, y el modelo
  cotizaría más barato que inventando. El preset es una sugerencia para una
  persona, no una referencia para una máquina.
- Mientras no haya precios cargados, el agente se comporta **exactamente como
  hoy**. La sección del prompt falla cerrada y lo dice, igual que ya hace
  `catalogoDeTramites` con un bufete sin trámites.
- Eso hace que la pantalla de precios no sea un accesorio de esta tajada:
  **es su requisito**. Vale decirlo en voz alta en vez de descubrirlo cuando
  el agente no cambie de comportamiento.

Y una consecuencia de tamaño que se resuelve sola: lo que viaja al prompt no
son 453 renglones, son los que el bufete tarifó. Un bufete de dos personas
tarifa decenas, no cientos. El día que no entren, `modelo.ts:71` ya reserva
`antecedentes` como «el punto de enchufe del corpus» y dice a propósito que
no se escribió una interfaz de recuperación contra un corpus que nadie
definió. Sigue valiendo: **no se escribe hasta que el tamaño la pida.**

## La forma

### La línea sabe de dónde salió su precio

`cotizacion_linea` gana `arancel_renglon_id`, nulo. No reemplaza a
`tipo_proceso_id`: son dos trabajos distintos y conviven.

| Columna | Para qué |
|---|---|
| `tipo_proceso_id` | Qué proceso se abre si la cotización se gana (T-7). |
| `arancel_renglon_id` | De dónde salió el precio. |

Con eso, una línea tarifada deja rastro: dentro de un año se puede saber que
esos B/.1,800 salieron del precio del bufete para tal servicio y no del dedo
de alguien. Y el **snapshot lo congela con lo demás**: `snapshot.ts` ya copia
el monto y el nombre del trámite resuelto para no tener que volver al
catálogo, y esto entra por la misma puerta y por la misma razón.

### El editor de líneas muestra tus precios mientras cotizás

Elegir un servicio tarifado prellena **concepto y monto**, editable encima —
el mismo trato que la pantalla de precios le da al arancel: el sistema sabe
cuánto cuesta y lo propone.

Y lo que el usuario pidió explícitamente, que es más que prellenar: **tus
precios visibles mientras armás la cotización**, para no tener que acordarte
ni ir a otra pantalla a mirar. Un panel o un buscador al lado de las líneas,
con los servicios que tarifaste y su precio.

Acá rige la misma regla que la tajada anterior, y no se renegocia: **ninguna
comparación con el monto oficial, ningún aviso.** Si editás el prellenado a
la mitad, no pasa nada y nadie te dice nada.

### El agente recibe el catálogo tarifado

Tres cambios encadenados, y el tercero es el que cuesta:

1. **El prompt** gana una sección con los servicios tarifados del bufete y su
   precio, construida como `catalogoDeTramites`: **falla cerrada** cuando
   está vacía y lo dice, en vez de omitir la sección y dejar al modelo libre
   de inventar.
2. **El modelo elige y no tarifa.** Cuando una línea nombra un servicio del
   catálogo, devuelve su identificador y **no** el monto.
3. **El esquema de salida cambia**, y esto no es cosmético:
   `worker/ia/esquema.ts:310-333` hoy exige `monto` y rechaza la línea entera
   con `monto_invalido` si falta. Pasa a ser: **o un servicio tarifado sin
   monto, o un monto sin servicio tarifado; nunca las dos, nunca ninguna.**
   Un modelo que mande las dos está contradiciéndose sobre quién pone el
   precio, y eso se rechaza con un motivo propio, no se resuelve eligiendo
   uno en silencio.
4. **El sistema tarifa** al componer la propuesta, leyendo el precio del
   catálogo. El modelo nunca toca ese número.

## Alcance autorizado

Entra: la columna y su congelado, el editor de líneas con los precios a la
vista, y el camino completo de la IA (prompt, esquema de salida, generador).

**No entra**: las reglas por cuantía auto-calculadas —siguen siendo texto,
por lo mismo que en la tajada anterior—; recuperación sobre un corpus; y
tocar la aritmética de totales, que `totalesDe` ya resuelve y nadie va a
mover acá.

## Las tareas

### T-1 · La línea sabe de dónde salió su precio

- [x] Migración: `cotizacion_linea.arancel_renglon_id`, nulo, con su clave
      foránea y el filtro por `tenant_id` que usa todo el esquema.
- [x] El snapshot lo congela, por la misma razón que congela el monto.
- [x] Una línea que nombra un renglón **sin precio del bufete** es un error
      de programa, no un caso: el catálogo ofrece lo tarifado.
- [x] Un `rubro` nunca puede ser el origen de un precio: la base ya lo
      prohíbe en su tabla y acá tampoco se acepta.

### T-2 · El editor muestra tus precios

- [x] Elegir un servicio tarifado prellena concepto y monto, editable.
- [x] Los precios del bufete, visibles y buscables mientras se arma la
      cotización.
- [x] Ninguna comparación con el monto oficial. Se prueba, no se promete.

### T-3 · El agente elige y el sistema tarifa

- [ ] El prompt lleva los servicios tarifados, fallando cerrada si no hay.
- [ ] El esquema de salida: servicio tarifado **xor** monto. Motivo de
      rechazo propio para el modelo que manda los dos.
- [ ] El generador pone el precio desde el catálogo.
- [ ] Una prueba que **el modelo no puede cambiar un precio del catálogo**,
      ni mandando un monto, ni mandando los dos campos.

## Criterios de aceptación

1. Con el catálogo vacío, el agente se comporta igual que hoy y lo dice.
2. Con servicios tarifados, el agente los elige por contexto y **el monto de
   esas líneas sale del catálogo**, no del modelo.
3. Al armar una cotización a mano, tus precios están a la vista y prellenan.
4. En ninguna de esas pantallas aparece el monto oficial ni una comparación.
5. El snapshot de una cotización emitida dice de dónde salió cada precio.
6. `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e` en verde.

## Verificación

`pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm test:e2e`

Prueba primero en las tres: el esquema de salida y el generador son lógica
pura con pruebas unitarias; el editor y el prellenado se miden de punta a
punta.

### T-2 bis · Todos los precios son precios

Corrección del usuario sobre T-2, vista en la pantalla, y la primera frase
deshace un error conceptual mío:

> «Siempre debemos mostrar todos los precios, hayan sido modificados por mí o
> sean los preestablecidos. Los preestablecidos son eso, preestablecidos:
> siempre pueden ser editables, pero **son la norma hasta que se editen, no
> son una subcategoría**. El panel "Tus precios" desaparece y el dropdown que
> los lista pasa a tener una barra de búsqueda, y las opciones el monto al
> lado, y un botón que diga "listar todos". Esto abre un modal que me permite
> ver todos en una vista más expandida, y con un indicativo visual si es
> preestablecido o editado, algo sutil, una marca, un asterisco. Y aquí los
> distintos inputs deben tener un label: no me queda claro qué hace cada uno.»

**El error que esto corrige.** T-2 ofreció en la cotización sólo los
renglones con precio propio —7 de 453 en la base de desarrollo— y dejó los
275 que tienen la cifra del acuerdo afuera, bajo la etiqueta «sugerido». Eso
es **dos criterios distintos para la misma pregunta** en dos pantallas del
mismo sistema: la pantalla de precios muestra la cifra del acuerdo como el
valor del campo, y la cotización la trataba como si no existiera. Y la
palabra «sugerido» hacía exactamente lo que el usuario nombra: convertir en
subcategoría algo que es el valor por defecto.

- [x] **El catálogo ofrecido son los 282 renglones con cifra**: los que el
      bufete editó y los que todavía dicen lo que dice el acuerdo. Los 97 de
      regla por cuantía no entran porque no tienen cifra, y los 74 rubros
      tampoco porque son títulos.
- [x] **Aflojar la guarda de `0013`/`0014`**, que hoy exige `monto` propio.
      Pasa a exigir **una cifra**: `monto` o, en su defecto, `monto_oficial`.
      Es un invariante que se relaja a propósito y con el motivo escrito; la
      validación de la ruta se mueve igual, y sigue rechazando rubros y
      renglones de sólo regla.
- [x] **Se va el panel «Tus precios».** Lo reemplaza el propio selector.
- [x] **El selector pasa a ser buscable**, con el monto al lado de cada
      opción. Un `<select>` nativo no puede: hace falta un combobox de
      verdad, con su rol, su teclado y su `aria-activedescendant`. No se
      compra una librería por esto.
- [x] **Botón «listar todos»** que abre un modal con la vista expandida:
      categoría, concepto y monto, con búsqueda.
- [x] **La marca sutil, y sólo en el modal**: un asterisco —o equivalente—
      que distinga editado de preestablecido, con su leyenda. En el selector
      no va: ahí son todos precios y nada más.
- [x] **Labels visibles en los cinco controles de una línea.** Hoy son
      concepto, clase, monto, trámite y servicio sin un solo rótulo a la
      vista, y no se entiende qué hace cada uno. Es deuda anterior a esta
      tajada y se paga acá porque es donde se vio.
- [x] La palabra «sugerido» sale del vocabulario de la cotización. En la
      pantalla de precios se decide aparte (ver abajo).

**Lo que queda inconsistente y no entra sin que el usuario lo pida.** La
pantalla `/catalogos/precios` sigue marcando «sugerido» al lado del campo.
Por el principio que el usuario acaba de fijar, esa palabra también sobra
ahí, y lo coherente sería el mismo asterisco. No se cambia en esta tarea
porque es una pantalla entregada con sus pruebas y el usuario habló del flujo
de cotización; queda anotado para preguntarlo.

## Entrega

Tres commits de unidad de trabajo en `feat/r1-fundacion`, uno por tarea, más
los de corrección. PR y merge siguen siendo decisión del usuario.

## Progreso

- Documento creado. Ninguna tarea cerrada.
- Próximo paso: T-1, la columna y su congelado.

### T-1 cerrada · la línea sabe de dónde salió su precio

**Qué entró:** `migrations/0013_el_precio_sabe_de_donde_salio.sql`
—`cotizacion_linea.arancel_renglon_id`, la arista nueva en los dos
disparadores de tenencia y la guarda del origen del precio—, la resolución del
concepto del renglón en lectura (`SELECCION_DE_LINEAS`), el congelado en
`congelar` y la copia de la procedencia al duplicar. **Ninguna ruta escribe la
columna todavía**, y es a propósito: el prellenado es T-2 y la propuesta de la
IA es T-3, y la guarda llega antes que su primer escritor.

**Checks observados:** `lint` 0, `typecheck` 0, `test` 0 (2362 en 47 archivos,
eran 2344 en 46), `test:e2e` 0 (452, los mismos). La base local recibió `0013`
sola —su `d1_migrations` sigue vacío, igual que en las dos tajadas
anteriores— y sobrevivió entera: 453 renglones, 57 notas, 8 clientes, 9
procesos, 10 cotizaciones, 49 líneas y 156 asientos de bitácora, con respaldo
`…sqlite.antes-de-0013` al lado.

#### Las dos reglas de la tarea resultaron ser una, y eso cambió la forma

El documento pide dos cosas —«un renglón sin precio del bufete es un error de
programa» y «un `rubro` nunca es el origen de un precio»— y la segunda está
**contenida** en la primera por construcción: `un_rubro_no_lleva_precio`, de
`0012`, hace imposible que un rubro tenga `monto`. Así que hay **un** par de
disparadores y no dos: un segundo que dijera lo del rubro sería la segunda
guarda para el mismo hecho, y neutralizar cualquiera de las dos dejaría a la
otra atrapando el caso sin que ninguna prueba se pusiera roja. Las dos mitades
tienen prueba propia igual, en `test/arancel-linea.spec.ts`.

#### Lo que se descubrió al recorrer el esquema, y que el documento no sabía

1. **Recrear un disparador lo manda a la cabeza del orden de disparo**, y eso
   cambia qué mensaje recibe una escritura que viola dos reglas a la vez.
   Agregarle la arista nueva a los dos disparadores de tenencia —SQLite no
   tiene `ALTER TRIGGER`— hizo que `UPDATE cotizacion_linea SET tenant_id = …,
   cotizacion_id = …` pasara de morir con «columna inmutable» a morir con
   «tenencia cruzada», que es justo el mensaje que `0004` había elegido
   **contra** el otro y con el argumento escrito. Se arregló recreando también
   los dos disparadores de inmutabilidad, letra por letra, para devolverles la
   precedencia. Queda anotado en la migración que el orden es oficialmente
   indefinido en SQLite y que lo que hay acá es la conservación de una conducta
   observada, con su prueba nombrada.
2. **El snapshot no sube de versión, y el motivo es mejor que un número.**
   `VERSION_DEL_SNAPSHOT` sigue en 1: las dos claves nuevas se escriben
   **siempre**, con `null` cuando no hay procedencia, así que su *ausencia*
   identifica a los documentos congelados antes de esta tajada con más
   precisión —por línea— que un número para el documento entero. Es la misma
   disciplina de `TotalesDeCotizacion.itbms`: ausencia y nulo no son lo mismo.
3. **Del renglón se congela el concepto y nada más.** Ni `monto_oficial` —es la
   cita de 2001 y no entra en lo que el cliente leyó— ni el `monto` del
   catálogo: el prellenado es editable, así que guardar los dos pondría dentro
   del documento un segundo número de dinero cuya única lectura posible es la
   comparación que la tajada anterior prohibió. Hay una prueba que lo exige.
4. **No hubo nada que rellenar, y está medido.** El catálogo nació en `0012`,
   posterior a las 49 líneas que existen, y los 453 renglones tienen `monto` en
   nulo. Adivinar la procedencia por el texto del concepto habría sido fabricar
   el dato que la columna existe para guardar.

#### Deuda que esta tarea deja a la vista

- **Borrarle el precio a un renglón que una línea ya nombra** sigue siendo
  legítimo (`fijarMonto(…, null)`), y deja una línea viva apuntando a un
  renglón sin precio. El documento emitido no se mueve —el snapshot congeló
  concepto y monto— y la línea conserva su `monto`; lo único observable es que
  una escritura posterior sobre esa línea, o duplicar la cotización, se niega
  en la guarda. Hoy es inalcanzable porque nada escribe la columna; la decisión
  de qué contestarle a una persona es de T-2.
- **Cuatro archivos de prueba fuera de la superficie de la tarea** cambiaron
  por obligación mecánica, no por alcance nuevo: la lista exacta de
  disparadores en `test/esquema-cotizaciones.spec.ts` y los tres dobles de
  `LineaDeCotizacion` en `test/lineas-ui.spec.ts`, `test/ciclo-ui.spec.ts` y
  `test/impresion-ui.spec.ts`.

- Próximo paso: T-2, el editor con los precios del bufete a la vista.

### T-2 cerrada · el editor muestra tus precios

**Qué entró.** La ruta de líneas aprende a guardar de dónde salió el precio
—`arancelRenglonId` en el cuerpo, validado antes de llegar a los disparadores de
`0013`/`0014`—, el editor gana un desplegable de servicios tarifados que
prellena concepto y monto, y **un panel con tus precios al lado de las líneas**,
buscable, que es lo que el usuario pidió explícitamente. Ninguna de las dos
mitades muestra el monto oficial, y eso se prueba contando cifras y no buscando
palabras.

**Checks observados, en primer plano:** `lint` limpio, `typecheck` limpio,
`test` **2421 en 47 archivos** (eran 2363 en 47), `test:e2e` **467** (eran 452;
+15 de `e2e/precios-en-cotizacion.spec.ts`).

#### La decisión de forma que la tarea obligó a tomar: dos tipos de línea

`DatosDeLinea` **no** gana el campo. Nace `DatosDeLineaConOrigen extends
DatosDeLinea` en el contrato, y la separación no es comodidad para no tocar
`worker/ia/`: es la frontera que T-3 tiene que mover a conciencia.
`worker/ia/esquema.ts` declara las claves que la salida del modelo admite con un
`satisfies readonly (keyof DatosDeLinea)[]` y una red `DebeSerVacio` que impide
que la unión y la lista se separen, así que meter el campo en `DatosDeLinea`
**obliga** a declararlo allá — o sea, a abrirle la puerta al modelo antes de la
regla del `xor` que T-3 existe para escribir. Hoy hay dos escritores de líneas y
escriben cosas distintas; el día que T-3 mueva esa frontera, los dos tipos se
colapsan en uno y `DatosDeLineaConOrigen` desaparece. Queda escrito en el
contrato para que sea una decisión y no un descubrimiento.

#### La validación mira el **cambio**, y es la lección de `0014` repetida arriba

`0014` acotó el disparador de `UPDATE` al cambio de la referencia porque la
forma anterior dejaba el borrador inescribible en cuanto alguien vaciaba un
precio en otra pantalla. Una validación de ruta que preguntara «¿este renglón
tiene precio?» en **cada** escritura reintroduce ese defecto por encima de la
guarda arreglada, y encima desde la pantalla que no causó el problema. Así que
`validarOrigenDelPrecio` recibe la referencia que la línea ya tenía y no valida
nada cuando no cambia. Hay una prueba con el nombre de ese defecto: «una línea
cuyo renglón se quedó sin precio se sigue pudiendo editar».

Los motivos son dos y el reparto está argumentado: `arancel_renglon_desconocido`
cubre el inventado **y el del bufete vecino** —desde acá son el mismo hecho— y
`arancel_renglon_sin_precio` cubre el renglón sin tarifar **y el rubro**, que
también son el mismo hecho por el `CHECK un_rubro_no_lleva_precio` de `0012`. Es
el mismo criterio con el que `0013` escribió un disparador y no dos.

#### El monto sigue viajando, y hay una prueba con el importe distinto a propósito

Una referencia registra **de dónde salió el precio**, no cuánto vale. El
servidor guarda el importe que llegó y no vuelve a mirar el catálogo: el
prellenado es una propuesta y editarla encima es legítimo y esperado. «El sistema
pone el precio» es la regla de T-3 **para el modelo**, no para una persona
tecleando. La prueba manda 99.900 sobre un servicio tarifado a 40.000 — si los
dos números fueran iguales, un servidor que pisara el importe pasaría sin que
nada lo notara.

#### Dos cosas que el navegador desmintió, y las dos cambiaron el código

1. **«El rubro de más arriba» atribuía mal, y el rótulo mentía.** El panel decía
   **«Inversionista · Naturalizaciones»**. Es falso: en migración el acuerdo
   imprime el rubro `3.b` «Inversionista» con sus hijos `b.1` y `b.2`, y después
   sigue con `4` «Naturalizaciones», que es **hermano del rubro**. Tomar el
   último rubro visto adopta todo lo que venga hasta el final de la categoría.
   Un rótulo que falta obliga a mirar el documento; uno que miente manda a
   cotizar otro servicio. La regla nueva —`cuelgaDelRubro`— exige que el numeral
   lo demuestre: que sea el mismo (los 5 renglones que el acuerdo imprime sin
   numerar y heredan el del padre), que extienda el del rubro (`3` → `3.a`) o
   que extienda su último tramo, porque las letras reinician bajo cada padre
   (`3.b` → `b.1`). Medido sobre `scripts/arancel/arancel.json`: **147 renglones
   quedan adoptados** y los no adoptados son exactamente los hermanos de nivel
   superior. Falla hacia el hueco, que es la dirección correcta.
2. **El prellenado proponía un fragmento.** El primer diseño escribía el
   concepto del renglón a secas, con el argumento de que el rubro es un recurso
   del desplegable y no prosa del documento. El navegador lo desmintió en la
   primera prueba a mano: el servicio «primer año» prellenaba una línea que
   decía «primer año», que es la definición misma de `concepto_requerido` —un
   monto que el cliente no sabe por qué paga—. Y no es un borde: son esos mismos
   **147 renglones**, con «Reconsideración», «Apelación», «Persona Natural»,
   «Elaboración» y «Revisión» entre ellos. Ahora se propone el rótulo completo,
   que además hace que lo que se elige sea exactamente lo que se escribe.

#### Lo demás que se midió a mano, con seis precios sembrados en la D1 local

- **A 1440px**: panel de 384px al lado de una columna de 630px, `position:
  sticky`, fila típica de 39px, cero desborde horizontal, **cero** elementos con
  `role="alert"`.
- **A 390px**: el panel baja —343px, el mismo ancho que la columna—, deja de ser
  pegajoso y el buscador sigue estando. Cero desborde.
- **Contra la D1 de verdad**, por `fetch`: el alta con `arancelRenglonId` guarda
  310.000 centavos sobre un servicio tarifado a 250.000 y resuelve
  `arancelConcepto` en lectura; el rubro y el renglón sin tarifar vuelven 422
  `arancel_renglon_sin_precio`, y el inventado 422
  `arancel_renglon_desconocido`. **Ninguno es un 500.**
- **El monto oficial no aparece**: lo único que casaba con una cita era `500.00`
  dentro de `USD 2,500.00`, que es el precio del bufete.

#### Lo que el contenedor de consulta costó, y por qué no es una `@media`

Lo que decide si el panel cabe al lado es el hueco real de la sección, que no es
el ancho de la ventana: el detalle vive dentro del armazón, con su propia
columna. Con una `@media (min-width: 64rem)` el panel se pondría al lado a
1024px de ventana aunque la columna midiera cuatrocientos píxeles. Y el
contenedor se declara en la **sección** y no en la rejilla, porque una
`@container` no puede mirar al elemento que la establece, sólo a sus
descendientes: con `container` puesto en `.lineas-con-precios`, la regla de dos
pistas no se aplicaba nunca —medido, con el panel quedándose debajo a 1920px—.

#### Dos archivos de prueba fuera de la superficie de la tarea

Por obligación mecánica y no por alcance nuevo, que es el mismo precio que pagó
T-1 con cuatro:

- **`src/mensajes.ts`**: el `Record<MotivoDeFalla, string>` es exhaustivo a
  propósito, así que los dos motivos nuevos no compilan hasta tener su frase.
- **`e2e/cotizaciones.spec.ts`**: sus siete dobles de línea no traían las claves
  que la API escribe siempre, y los dos cuerpos esperados de escritura tampoco.
  El primero no era cosmético: con `arancelRenglonId` en `undefined`,
  `hayCambioEnLinea` comparaba `null` contra `undefined` y dejaba el botón
  «Guardar» encendido sobre una línea sin cambios. El doble tiene que decir lo
  mismo que la API.

#### Deuda que T-2 deja a la vista

- **El buscador de la pantalla de precios atribuye el rubro sin demostrarlo.**
  `filtrarRenglones` toma el rubro inmediatamente anterior, igual que hacía el
  panel antes de esta corrección, así que buscar «inversionista» ahí también
  encuentra «Naturalizaciones». Es sobre-coincidencia y no un rótulo falso —el
  dibujo de esa pantalla no muestra el rubro—, así que no rompe nada visible.
  `cuelgaDelRubro` ya está escrita y medida al lado; aplicarla ahí cambia los
  resultados de búsqueda de una pantalla entregada y de sus pruebas, que están
  fuera de la superficie de esta tarea.
- **El panel no tiene un botón «usar este precio».** Lo que hay es el
  desplegable del formulario, que es donde se elige, y el panel es consulta. Un
  botón por fila sería un segundo camino de escritura para lo mismo.
- **`e2e/cotizaciones.spec.ts` contesta 404 a `GET /api/arancel`**, así que en
  esa suite el panel se dibuja con su aviso neutro de «no se pudieron traer tus
  precios». Es deliberado que ese aviso **no** sea de error: un `role="alert"`
  por un panel de consulta que no cargó rompería los seis `getByRole("alert")`
  sin acotar de esa suite, y antes que eso, interrumpiría la lectura de la
  pantalla entera para avisar de algo que no impide cotizar.
- **La base local quedó exactamente como se encontró**, y está medido: 453
  renglones con **0 precios**, 49 líneas con **0 orígenes**, 57 notas, 8
  clientes, 10 cotizaciones, 9 procesos y 156 asientos de bitácora. Los seis
  precios de desarrollo se pusieron en nulo y la línea de prueba se borró
  restaurando el respaldo que se tomó antes de sembrar: la entrada de bitácora
  que esa prueba dejó no se puede borrar —`0002_bitacora_inmutable.sql` lo
  prohíbe— y restaurar el archivo era la única forma de no dejarla.

- Próximo paso: T-3, el agente elige y el sistema tarifa. El prompt, el esquema
  de salida con su `xor` y el generador. `DatosDeLineaConOrigen` y
  `CLAVES_DE_LINEA` son las dos puntas que esa tarea tiene que unir.

### T-2 bis cerrada · todos los precios son precios

**Qué entró.** `migrations/0015_un_precio_es_una_cifra.sql` afloja la guarda del
origen del precio de «tiene el monto del bufete» a **tiene una cifra**
—`COALESCE(monto, monto_oficial)`—, y `validarOrigenDelPrecio` se mueve igual.
En la pantalla desaparece el panel «Tus precios» y el desplegable de servicios
se convierte en un **combobox buscable** (`SelectorDeServicio.tsx`) con el monto
al lado de cada opción y un botón «Listar todos» que abre una **vista
expandida** (`ListaDeServicios.tsx`, un `<dialog>` nativo) con búsqueda, las
categorías del acuerdo y la marca sutil. Y los cinco controles de una línea
tienen por fin un rótulo a la vista.

**Checks observados, en primer plano:** `lint` limpio, `typecheck` limpio,
`test` **2445 en 47 archivos** (eran 2421 en 47), `test:e2e` **484** (eran 467;
la suite de esta tajada pasó de 15 a 32 pruebas).

#### El error conceptual que esto deshace, dicho de una vez

T-2 ofreció en la cotización **los renglones con precio propio** —7 de 453 en la
base de desarrollo— y dejó afuera los 275 que todavía dicen lo que dice el
acuerdo. Eso era **dos criterios distintos para la misma pregunta en dos
pantallas del mismo sistema**: `precioALaVista` ya mostraba la cifra
preestablecida como el valor del campo en `/catalogos/precios`, y la cotización
la trataba como si no existiera. Las palabras del usuario —«son la norma hasta
que se editen, no son una subcategoría»— no son una preferencia de dibujo: son
la corrección de un supuesto que el propio sistema ya contradecía.

Medido contra la D1 local, con los 453 renglones sembrados: **282 ofrecibles**
(282 con `monto_oficial`, 7 de ellos editados por el bufete), **97 reglas por
cuantía sin ninguna cifra** y **74 rubros**. Los dos últimos grupos siguen
rechazados, y el rechazo se midió contra la base de verdad por `fetch`: el rubro
y la regla sin cifra vuelven **422 `arancel_renglon_sin_precio`**, el
identificador inventado **422 `arancel_renglon_desconocido`**, y el renglón con
sólo la cifra del acuerdo **201**, con el importe que se mandó —123.456
centavos— y no el del catálogo —50.000—. Ninguno es un 500.

#### El motivo conserva su nombre, y eso es deuda anotada

`arancel_renglon_sin_precio` ahora significa «sin **ninguna** cifra». Renombrarlo
obligaría a tocar `src/mensajes.ts`, cuyo `Record<MotivoDeFalla, string>` es
exhaustivo a propósito, y ese archivo está fuera de la superficie autorizada de
esta corrección. La frase que la persona lee sigue sirviendo —«ese servicio no
tiene precio, ponele uno»—, y el desajuste queda escrito en `worker/contract.ts`.

#### Por qué un `<dialog>` nativo y no el velo a mano de `Esqueleto.tsx`

El precedente de la casa escribe su overlay a mano por una razón que acá **no se
cumple**: el cajón de navegación tiene que ser **no modal** por encima de las
48rem y dejar vivo el encabezado, porque ahí está el botón que lo cierra. Esta
vista es modal siempre, y el elemento nativo da las cuatro cosas como conducta
del navegador: el velo (`::backdrop`, con el mismo `--color-velo` del cajón —
medido: `rgba(29, 27, 23, 0.45)`), la inercia de todo lo de atrás —más fuerte
que `inert` sobre `<main>`, porque incluye el encabezado—, `Escape` sin escucha
global, y el foco movido adentro y devuelto al abridor. Y una quinta de layout:
vive en la capa superior, así que **no necesita un `z-index`** y no hubo que
inventar un tercer número en `tokens.css`.

#### Tres defectos que sólo aparecieron con el navegador enfrente

1. **El `<dialog>` se cerraba solo en el mismo cuadro en que se abría.** Con
   `<StrictMode>`, React corre el efecto, su limpieza y el efecto otra vez; la
   limpieza llamaba `close()`, `close()` dispara el evento `close`, y el
   `onClose` que avisaba arriba desmontaba el modal. En pantalla se veía como
   que «Listar todos» no hacía nada. El arreglo es `onCancel` —que sólo lo
   dispara un gesto de cierre— más `showModal()` sólo sobre un diálogo cerrado.
2. **Con `useEffect`, el foco no volvía: quedaba en el `<body>`.** React corre la
   limpieza de un efecto **pasivo** después de sacar el nodo del documento, y un
   `close()` sobre un `<dialog>` ya desprendido no devuelve el foco a nadie. Con
   `useLayoutEffect` la limpieza corre dentro de la fase de mutación, con el nodo
   en su lugar. Medido leyendo el elemento activo: `BODY` → `BUTTON "Listar
   todos"`.
3. **La lista de opciones caía media pantalla más abajo del campo.** Dos veces,
   y las dos formas equivocadas parecen razonables: anclada a
   `.selector-de-servicio` el `100%` era el del bloque entero —rótulo, campo,
   botón y ayuda— y las opciones salían debajo del párrafo de ayuda; anclada a
   `.selector-de-servicio__caja`, que en un hueco angosto baja el botón a su
   propio renglón, quedaban **165px** de aire. El ancla tiene que envolver **al
   campo y nada más**, y por eso existe `.selector-de-servicio__ancla`. Medido
   después: 4px.

#### Lo demás que se midió a mano, contra los 282 servicios de verdad

- **A 1440px**: sección de 1040px, rejilla de cuatro pistas de 237px, cero
  desborde horizontal, cero `role="alert"`, los cinco rótulos a la vista. El
  campo del selector medía **129px** con una base de 8rem —el marcador de
  posición cortado en «Buscar un ser»— así que la base subió a 12rem y el
  `flex-wrap` baja el botón a su renglón: **248px**.
- **A 390px**: una sola pista —la `@container lineas (max-width: 30rem)`—, campo
  de 224px, lista pegada al campo, cero desborde.
- **La vista expandida**: a 1440px mide 1024×848 centrada y la tabla no
  scrollea; a 390px mide 350×804 y la tabla scrollea dentro de su contenedor,
  que es lo que §9 pide. **282 filas, 7 marcas** —exactamente los 7 precios que
  el bufete editó— y **24 categorías** con algún servicio ofrecible.
- **La regla de una sola cifra, contada sobre las 282 filas de verdad**: máximo
  **una** cifra de dinero por fila en sus `<td>`, cero filas con dos. Es lo que
  el concepto en `<th scope="row">` hace posible: el acuerdo imprime importes
  **dentro** de un concepto —«De B/.0.01 hasta B/.3,000.00»— que tienen que
  verse y no son el precio de la fila.
- **El teclado, de punta a punta y sin mouse**: tabular al campo, escribir
  «pensionado», `ArrowDown` —`aria-activedescendant` apunta a la opción sin
  mover el foco— y `Enter` prellena concepto y monto.

#### Los rótulos a la vista conviven con los `aria-label`, y no es duplicación

El nombre accesible de un control de línea guardada lleva el puesto de la línea
dentro de su familia —«Concepto de la línea 2 de Honorarios»— porque en una
página con seis líneas hay seis controles de concepto y un lector de pantalla los
anuncia uno detrás del otro. El rótulo a la vista no lo necesita: la fila se ve.
Cada rótulo es **prefijo** de su nombre accesible, que es lo que pide el criterio
«rótulo en el nombre» de WCAG 2.5.3, y además es lo que mantiene en verde los
`getByLabel` de `e2e/cotizaciones.spec.ts`, que está fuera de esta superficie.

#### Lo que el combobox hizo desaparecer

`serviciosSeleccionables` **se fue**, y con ella la opción fantasma que inyectaba
el servicio que la línea ya tenía aunque el catálogo no lo trajera. Esa inyección
existía por un defecto exclusivo del `<select>`: con un valor que no corresponde
a ninguna opción, el navegador cae en la primera. Un combobox muestra el texto
que le den, así que la reemplaza `textoDelServicioElegido`, que es menos código y
dice la verdad en los tres casos.

#### Deuda que T-2 bis deja a la vista

- **El aviso del catálogo se dibujaba una vez por línea.** Estaba dentro del
  selector, y una cotización con seis líneas lo repetía seis veces; peor, rompía
  la prueba «el gasto estimado dice que es aproximado» de
  `e2e/cotizaciones.spec.ts` —cuya suite contesta 404 a `GET /api/arancel`—, que
  busca **el** aviso de una familia y encontraba cuatro. Ahora se dice una sola
  vez arriba, al lado del de trámites.
- **A 390px, el botón «Elegir» de la vista expandida queda fuera del hueco** y
  hay que scrollear la tabla 41px para alcanzarlo. Es la respuesta de §9 para una
  tabla angosta y el `.tabla-contenedor` de la casa ya la implementa, pero es la
  acción principal de esa fila: si molesta, la salida es apilar las celdas bajo
  `@container tabla`, que es una decisión de dibujo sobre una pantalla entregada.
- **`/catalogos/precios` sigue diciendo «sugerido»**, y sigue siendo la pregunta
  abierta de más arriba. Lo que esta tarea garantiza es que la palabra no está en
  el vocabulario de la cotización, y hay una prueba que recorre los textos
  buscándola.
- **La base local quedó exactamente como se encontró**, y está medido: 453
  renglones con **7 precios del bufete** —282 con cifra—, 49 líneas con **1
  origen**, 10 cotizaciones, 8 clientes, 9 procesos, 57 notas del arancel y 157
  asientos de bitácora. Se tomó el respaldo `…sqlite.antes-de-0015` antes de
  tocarla, las cuatro líneas que escribieron las pruebas contra la D1 de verdad
  se deshicieron restaurándolo, y después se le aplicó `0015` sola —su
  `d1_migrations` sigue vacío, igual que en las tres tajadas anteriores—.
  **El documento decía «0 orígenes» y son 1**: la línea «Visa de Turista
  Pensionado» de un borrador quedó de la prueba a mano de T-2.
- **El `GET /api/tipos-proceso` de la D1 local contesta 500 en el servidor de
  desarrollo**, con un «fetch failed» de `undici` por debajo. Es anterior a esta
  tarea y no la toca —la suite de punta a punta intercepta la API—, pero conviene
  anotarlo porque ensucia cualquier prueba a mano sobre esa pantalla.

- Próximo paso: T-3, el agente elige y el sistema tarifa. El prompt, el esquema
  de salida con su `xor` y el generador. `DatosDeLineaConOrigen` y
  `CLAVES_DE_LINEA` siguen siendo las dos puntas que esa tarea tiene que unir, y
  ahora el catálogo que viaje al modelo son **282 servicios y no 7**, que es un
  tamaño distinto para la decisión de `modelo.ts:71` sobre la recuperación.
