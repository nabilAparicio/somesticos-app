# Las pestañas del proceso

## El problema

`src/pantallas/procesos/DetalleDeProceso.tsx` son **1656 líneas y trece
secciones en un solo scroll**: pendientes, estado del proceso, cumplido, lo
que falta, plan de trabajo, guardar como plantilla, anotar un pendiente,
pendientes cerrados, gastos y anticipos, línea de tiempo, bitácora y anotar.

Las palabras del usuario, que son el criterio:

> «Dentro de la vista de procesos veo como información general del cliente y
> luego secciones como estado del proceso, plan de trabajo, pendientes,
> gastos y anticipo, etc. Lo lógico sería agrupar por tabs; ahorita es
> difícil **ver y configurar** porque todo es como una gran lista grande.»

«Ver **y** configurar». Son dos trabajos distintos metidos en la misma lista,
y hoy el editor del plan está a la misma altura visual que «lo que falta».

## La restricción que decide la forma

`docs/diseno.md` §6: **«los pendientes abiertos viven arriba del proceso,
contados y a la vista»**. Un pendiente que hay que ir a buscar no cumple su
única función.

Por eso esto **no** es «pestañas para todo». Es **una cabecera fija más
pestañas para el cuerpo**: el contador de pendientes y la etapa vigente nunca
quedan detrás de un clic.

## La forma

### La cabecera, siempre visible

Título, cliente, tipo, estado y responsable en una tira de datos —hoy
«Estado del proceso» es una sección entera—, el contador de pendientes con
los vencidos marcados, la etapa vigente y el enlace a la cotización de
origen. Identidad y alarma en tres segundos.

### Cuatro pestañas, cada una con su ruta

| Pestaña | Ruta | Qué lleva |
|---|---|---|
| Trabajo | `/procesos/{id}` | El plan: los pasos con su estado, marcar cumplida, agregar, borrar, reordenar, renombrar, guardar como plantilla |
| Pendientes | `/procesos/{id}/pendientes` | Los abiertos en detalle, anotar uno, los cerrados |
| Dinero | `/procesos/{id}/dinero` | Saldo, movimientos, comprobantes (`PanelDeGastos`, que ya vive aparte) |
| Historial | `/procesos/{id}/historial` | Línea de tiempo, notas, bitácora |

**La pestaña va en la URL y no en estado local.** Si fuera estado local no se
podría mandar el enlace a la parte de plata de un expediente, recargar
devolvería al principio y el botón de atrás no funcionaría. `src/ruteo.ts` ya
tiene la unión de rutas tipada; es una variante más de `{ nombre: "proceso" }`.

### Ver y editar van juntos, por decisión del usuario

> «Es algo que pasa seguido y por ende debe estar integrado en el avance.»

Agregar o borrar un paso ocurre **mientras el expediente corre** —el juez
pide algo que nadie previó—, así que separar «Avance» de «Plan» en dos
pestañas obligaría a cambiar de lugar justo en el medio del trabajo. Se
descartó esa variante de cinco pestañas por eso.

La consecuencia es la simplificación más grande de la pantalla: hoy las
etapas se dibujan **tres veces** —«Cumplido», «Lo que falta» y «Plan de
trabajo» son las mismas filas de `proceso_etapa`—, y pasan a ser **una sola
lista** donde cada paso muestra su estado y se edita en el lugar.

### El conflicto entre el borrador del plan y avanzar. No es de gusto

`POST /api/procesos/{id}/avanzar` marca alcanzada **la próxima pendiente**, o
sea que **depende del orden**. El editor del plan, en cambio, trabaja sobre
un borrador y recién lo persiste con `PUT /api/procesos/{id}/etapas`, que
reemplaza el plan entero (`sinGuardar` en el componente compara el borrador
contra lo guardado).

Juntar las dos cosas en una lista sin más abriría esto: reordenás los pasos,
todavía no guardaste, marcás cumplida, y el servidor avanza **el paso que
estaba antes en esa posición**. No es una molestia de interfaz, es marcar
cumplido lo que no se hizo.

Por eso **«marcar cumplida» se niega mientras haya cambios sin guardar, y
dice por qué**. Se prueba por rechazo.

## Las tareas

- [x] **T-1 · El esqueleto.** La ruta con pestaña en `src/ruteo.ts`, la
      navegación accesible entre las cuatro, la cabecera fija, y los cuatro
      paneles extraídos a sus propios archivos **sin cambiar el contenido de
      ninguna sección**. El primer paso tiene que ser verificable: si algo se
      ve distinto, es un error.
- [x] **T-2 · La pestaña Trabajo, y la frontera entre cabecera y cuerpo.**
      Fundir «Cumplido», «Lo que falta» y «Plan de trabajo» en una sola lista,
      con la guarda de avanzar-con-cambios-sin-guardar probada por rechazo.
      Más las dos cosas que se vieron recorriendo T-1 con datos reales y que
      viven en la misma zona de la pantalla, así no se la toca dos veces:
      «Estado del proceso» deja de ser una sección huérfana entre la cabecera
      y la tira, y la tira deja de pesar menos que el ruido que la rodea.
- [ ] **T-3 · El resto dentro de su pestaña, y el aire.** Pendientes, Dinero
      e Historial revisados ahora que cada uno tiene su propio espacio. Más
      las otras dos de la recorrida de T-1: la columna de contenido usa 770 de
      2000 píxeles y deja medio lado vacío —se nota sobre todo en la lista de
      gastos—, y hay demasiadas cajas de ayuda siempre abiertas: en Dinero son
      cuatro antes de llegar a lo que uno fue a ver. Los textos son buenos; el
      problema es que están todos desplegados a la vez.

## Alcance autorizado

`src/` y sus pruebas (`test/`, `e2e/`). **No se toca el worker, ni el
contrato, ni la base, ni las migraciones**: esto es reparto y presentación.
Si alguna tarea pareciera necesitar una ruta nueva del API, es señal de que
se está colando otra cosa adentro.

## Criterios de aceptación

- Los pendientes abiertos y la etapa vigente se ven **sin apretar nada**.
- Cada pestaña es un enlace compartible y el botón de atrás funciona.
- `DetalleDeProceso.tsx` deja de ser un archivo de 1656 líneas; cada pestaña
  tiene su archivo y su lógica en `.ts` puro, como el resto del front.
- Los cinco comandos en 0: `typecheck`, `test`, `lint`, `build`, `test:e2e`.

## Progreso

### T-1 · El esqueleto — hecho, sin commitear

**Ruta: delegada** (escritor acotado). Disparador: el reparto toca once
archivos del front y dos de prueba, muy por encima del umbral de dos
archivos no triviales.

**Los cinco comandos en 0.** `pnpm typecheck`, `pnpm lint` y `pnpm build`
sin salida de error; `pnpm test` **2152 unitarias** en 41 archivos (base
2146, +6); `pnpm test:e2e` **404 de punta a punta** (base 377, +27).

#### Lo que se decidió, y por qué

**La pestaña por defecto es un valor explícito, no una ausencia.**
`Ruta` pasó a ser `{ nombre: "proceso"; id; pestana: PestanaDeProceso }`
con `"trabajo"` como uno de los cuatro valores. Con `null` por defecto,
cada lugar que lee la pestaña —la tira que marca la activa, el armador que
despacha, el que arma el enlace— tendría que volver a decidir qué
significa esa ausencia, y tres decisiones del mismo hecho son tres que
pueden discrepar. Con el valor explícito, el único que sabe que «trabajo»
se escribe sin segmento es el par `resolverRuta`/`enlaceDe`, y la prueba de
ida y vuelta los ata.

**`/procesos/{id}/trabajo` no existe**: cae en «desconocida», igual que
`/procesos/{id}/cualquier-cosa`, que es lo que ya hacía `resolverProcesos`
con lo que no reconoce. Cada pantalla tiene una dirección y nada más; dos
para lo mismo es la que alguien copia y la que después nadie mantiene.

**La tira es un `<nav>` de enlaces con `aria-current="page"`, no el patrón
`tablist`.** `role="tab"` promete que el contenido cambia en la misma
página y que las flechas recorren las pestañas; acá cada una es una
dirección con su historial, así que sería una promesa falsa. Se prueba por
rechazo: `[role="tablist"]`, `[role="tab"]` y `[role="tabpanel"]` cuentan
cero —con `.count()` y no con `toHaveCount(0)`, que reintenta y por eso no
puede probar un «nunca»— después de comprobar que la tira está dibujada.
La abierta se distingue por **tres cosas a la vez**: barra, peso y tinta.

**No se creó `src/layout/Pestanas.tsx`.** Hoy hay un solo consumidor, y una
primitiva reusable con un consumidor es una interfaz inventada contra un
segundo caso que todavía no puede contradecirla. Lo que sí salió a un `.ts`
puro es `src/pantallas/procesos/pestanas.ts`: las cuatro entradas con su
clave y su rótulo, probadas contra el resolvedor.

**Todo el estado quedó en el armador, y los cuatro paneles no tienen
ninguno.** La regla —el estado vive donde está el dato— da ese resultado
dos veces: lo que se carga del servidor es dato del proceso y no de la
pestaña (la cabecera cuenta los pendientes, así que ni siquiera es de un
panel solo), y **lo que una persona escribió y no se guardó también**. El
criterio de T-8 y T-9 es que un borrador se vacía sólo si el servidor lo
guardó, porque perder el texto por un 403 sería perderlo de verdad; un clic
en otra pestaña no puede ser la excepción. Lo que un panel necesita avisar
—que el plan avanzó y hay que recontar— es una devolución explícita, no un
estado global. El `sello` de la bitácora vive arriba por lo mismo: el hecho
que hay que registrar lo produce casi siempre otra pestaña.

**La `key` de `DetalleDeProceso` es el identificador y no la pestaña.** Si
incluyera la pestaña, cada clic volvería a montar, volvería a pedir las
cuatro lecturas, pondría un «Consultando…» en el medio y tiraría el
borrador. La carga sigue siendo una sola y en paralelo, como pide T-1. La
prueba del proceso cerrado lo mide de rebote: cierra en «Trabajo», cambia a
«Pendientes» y el cierre sigue en pie aunque el servidor de la prueba
conteste siempre «abierto».

**El `<h2>Gastos y anticipos</h2>` se conserva bajo la pestaña «Dinero».**
No son dos lugares diciendo lo mismo: «Dinero» es el cajón y «Gastos y
anticipos» es lo que hay adentro. Además el encabezado es el nombre
accesible de la región, el ancla de su `aria-labelledby` y el padre de los
`<h3>` de saldo y movimientos; quitarlo dejaría la región sin nombre y
ataría un componente propio al contenedor que hoy le toca.

#### Lo único que cambió de contenido, y por qué no se pudo evitar

1. **El bloque de pendientes sin ninguno abierto estaba quedando vacío.**
   Medido en pantalla con la base local, no supuesto: la cuenta que lo
   llenaba se fue a la cabecera y quedaba un recuadro con borde y nada
   adentro —justo la duda que §6 manda no tener—. Lleva una línea que dice
   la salida («Ninguno abierto. Si aparece un cabo suelto, se anota acá
   abajo»), que no repite la cuenta de arriba, y una prueba de punta a
   punta que la mide con la lista vacía.
2. **Tres frases decían «acá arriba» o «más abajo» de algo que ahora está
   en otra pestaña.** El aviso de cierre (`textoDelCierre`) y el del
   proceso cerrado en pendientes. Un texto que miente es peor que un texto
   que cambió. Las que seguían siendo ciertas —el pendiente marcado
   «arriba», que sigue arriba dentro de su propia pestaña— no se tocaron.
3. **La cabecera apila con hueco normal y no `holgado`.** Es la diferencia
   entre una sección más y una cabecera; va dentro de «ahora la cabecera
   está arriba».

Fuera de eso, cada renglón está donde estaba, con el mismo texto.
`textoDelCierre` bajó de un `.tsx` a `presentacion.ts` sin cambiar de
forma, y ahora tiene prueba propia.

#### Lo que se decidió NO hacer, y queda anotado

- **No se agregó «Responsable» a la tira de datos**, aunque la descripción
  de la cabecera lo nombra. Hoy el detalle no lo muestra, así que ponerlo
  sería contenido nuevo, y el criterio repetido de T-1 es que nada se vea
  distinto. El dato llega en `proceso.responsableNombre`: es un renglón de
  una línea cuando el coordinador lo quiera.
- **El `<h2>Pendientes</h2>` dentro de la pestaña «Pendientes» quedó como
  estaba.** Es redundante con el rótulo de la tira, pero cambiarlo es
  retocar contenido adentro de un panel, que es T-3 («el resto dentro de su
  pestaña, revisado ahora que cada uno tiene su propio espacio»). No hay
  colisión técnica: la pestaña es un `link` y esto un `heading`.
- **`DetalleDeProceso.tsx` quedó en 718 líneas**, no en doscientas. Lo que
  pesa son los nueve manejadores de escritura, que tocan el estado que vive
  acá. Sacarlos pediría un gancho propio, que es un refactor con riesgo
  propio y nadie lo pidió en T-1.

#### Dos renglones fuera de las superficies autorizadas

El escritor tenía una lista de archivos y hubo que salirse de ella en seis
puntos, todos forzados por el cambio de tipo que T-1 ordena y todos
mecánicos. Quedan para que el coordinador los bendiga o los mueva:

| Archivo | Qué | Por qué |
|---|---|---|
| `src/pantallas/procesos/ListaDeProcesos.tsx:183` | `pestana: "trabajo"` | `enlaceDe({nombre:"proceso"})` dejó de compilar sin la pestaña |
| `src/pantallas/clientes/DetalleDeCliente.tsx:274` | ídem | ídem |
| `src/pantallas/cotizaciones/DetalleDeCotizacion.tsx:940` | ídem | ídem |
| `src/pantallas/procesos/FormularioDeProceso.tsx:167` | ídem | ídem |
| `e2e/navegacion.spec.ts:97` | ídem | la muestra de rutas del armazón |
| `test/tsconfig.json` | una línea de `include` | el proyecto es `composite`: un módulo puro sin listar no compila |
| `e2e/gastos.spec.ts:307` | `DETALLE_URL` → `/dinero` | sus 17 pruebas entran al panel de gastos, que ahora vive en esa pestaña |

La alternativa era hacer `pestana` opcional, que es el modelo que T-1
descarta por escrito. Nada de esto toca el worker, el contrato, la base ni
una ruta del API: el alcance de la funcionalidad se respetó.

#### Dos pruebas flojas, dejadas mejor que como se encontraron

Las dos afirmaban que una frase estaba visible **en la página entera**, así
que pasaban con la frase puesta en cualquier parte:

- «el botón de avanzar … avisa que no se deshace»: el aviso ahora se busca
  dentro de la región «Lo que falta», que es donde está el botón. Suelta,
  habría pasado con el botón en una pestaña y la advertencia en otra.
- «la bitácora dice que no hubo relleno retroactivo»: ahora se busca dentro
  de la región «Bitácora». Suelta, habría pasado con la advertencia en la
  línea de tiempo de al lado, que es el registro que **sí** está completo.

#### Las mediciones nuevas

- **Unitarias** (`test/procesos-ui.spec.ts`): las cuatro direcciones ida y
  vuelta; `/procesos/{id}/trabajo` y cuatro terceros segmentos inventados
  en «desconocida»; la tira atada al resolvedor; `textoDelCierre`.
- **De punta a punta** (`e2e/procesos.spec.ts`): las cuatro por URL directa
  con su encabezado propio y los otros tres en cero; el `<h1>` sigue siendo
  el título del proceso en las cuatro; el botón de atrás; la activa
  distinguida por `aria-current`, peso y barra; las cuatro con el tabulador
  en orden; el patrón `tablist` ausente; la tercera parte inventada cayendo
  en «esa página no existe»; **y la que de verdad importa: la cuenta de
  pendientes y la etapa vigente visibles desde las cuatro pestañas, sin
  apretar nada, y arriba de la tira.** Las nueve medidas de §9 se partieron
  en tres bucles, uno por pestaña con contenido hostil propio: una sola ya
  no podría esperar las tres clases de contenido a la vez.

**Pendiente del coordinador:** el commit. El escritor no commiteó nada.

### T-2 · La pestaña Trabajo, y la frontera entre cabecera y cuerpo — hecho, sin commitear

**Ruta: delegada** (escritor acotado). Disparador: toca cinco archivos del
front y dos de prueba, por encima del umbral de dos archivos no triviales, y
la lógica nueva había que leerla antes de escribirla.

**Los cinco comandos en 0.** `pnpm typecheck`, `pnpm lint` y `pnpm build` sin
salida de error; `pnpm test` **2167 unitarias** en 41 archivos (base 2152,
+15); `pnpm test:e2e` **409 de punta a punta** (base 404, +5).

#### La pregunta que había que contestar: qué se permite sobre un paso cumplido

**Renombrar sí; mover y quitar no.** Es la regla de antes y no se tocó: la
fusión no es ocasión para cambiar qué se permite.

Y **las dos vistas de T-1 no se contradecían**, aunque lo pareciera.
«Cumplido» era el registro dibujado —un `<span>` con la fecha—, no un editor
que prohibiera renombrar; el único editor que había, «Plan de trabajo», ya
mostraba las cumplidas con su campo de texto editable y sin los botones de
orden ni de quitar. Las tres fuentes dicen lo mismo: `quitarPaso` y
`moverPaso` se niegan sobre un paso alcanzado, `renombrarPaso` lo permite con
un comentario que explica por qué —el nombre es texto de cara al cliente y
corregir una errata no borra el hecho ni deja una nota huérfana—, y
`AVISO_PLAN_PROPIO` dice «no se quitan ni se mueven» sin nombrar el nombre.
Lo que la regla protege es **la existencia y el lugar** del paso, no su
redacción. La lista única conserva eso exacto.

#### La guarda de avanzar, que es la parte que no es de gusto

`POST /avanzar` marca alcanzada la próxima pendiente **del plan guardado**;
el editor trabaja sobre un borrador que recién se persiste con `PUT /etapas`.
Con las dos cosas en una lista, «reordeno, no guardo, avanzo» hacía que el
servidor firmara como cumplida la etapa que estaba antes en esa posición: un
hecho falso, con fecha, y sin deshacer.

`avanceDelPlan` en `plan.ts` devuelve de **una sola lectura** el rótulo, si
el botón se puede apretar y el motivo cuando no. Una lectura y no tres,
porque el botón y la explicación no pueden discrepar.

- El rótulo nombra la próxima etapa **del plan guardado**, nunca la primera
  del borrador: es la que el servidor va a marcar de verdad.
- Los cambios sin guardar ganan incluso sobre «nada por avanzar». Quien acaba
  de agregar un paso ve algo por delante en la lista; decir «nada por
  avanzar» y callar sería cierto del plan guardado y falso de lo que tiene a
  la vista.
- El proceso cerrado apaga **sin motivo propio**: `avisoDeProcesoCerrado` ya
  está dibujado arriba y nombra las tres prohibiciones y las dos salidas.
- «Trabajando» apaga en silencio: dura lo que dura una petición, y un cartel
  que aparece y desaparece solo es ruido.

**Esta guarda no tiene gemela en el servidor, y es la única del proyecto que
no la tiene.** No es un olvido: el borrador existe sólo en el navegador, así
que no hay nada que el worker pueda mirar para saber que lo que la persona ve
no es lo que él tiene.

**Probada por rechazo, y verificada por mutación.** Quitando el brazo
`sinGuardar` de `avanceDelPlan` mueren dos unitarias («con cambios sin
guardar NO se puede, y dice por qué» y «los cambios sin guardar ganan incluso
sobre nada por avanzar») y la de punta a punta «reordenar sin guardar niega
avanzar, y guardar lo devuelve». Se midió corriendo las dos suites con el
brazo borrado.

#### El caso simétrico, que resultó ser un defecto de verdad

Avanzar y después tocar el plan no tiene riesgo: avanzar ya escribió, y
`asentar` reemplaza el borrador con lo que el servidor contestó. Con la
guarda puesta ese reemplazo además es inofensivo por construcción —sólo se
llega con el borrador y lo guardado ya iguales—.

**Pero cerrar y reabrir pasaban por el mismo `asentar`, y ésos no guardan una
sola etapa.** Alguien editando la lista que apretara «Cerrar el proceso»
perdía el borrador entero, en silencio. Es la regla de T-8 y T-9 al revés: un
borrador se vacía **sólo si el servidor lo guardó**. Se partió en
`asentarSinTocarElBorrador`, que asienta el proceso y deja el plan en paz, y
tiene prueba propia de punta a punta. Era un defecto previo a T-2; la lista
única lo volvió visible, porque lo que desaparecía pasó a ser toda la lista
que la persona tenía delante.

#### «Estado del proceso» deja de ser una sección huérfana

La `<section>` con su `<h2>` desapareció: cerrar un proceso es **una acción
de la cabecera**, no una parte del expediente que se pueda visitar. El botón
subió al lado del `<h1>`, en una `Fila` que envuelve sola cuando el título es
largo.

El texto de ayuda pasó de tres renglones a **uno**, y no se perdió nada: de
las dos frases que decía, la que hay que leer *antes* de apretar es que el
cierre se deshace reabriendo y que las dos cosas quedan firmadas; la otra
—que los pendientes abiertos no lo impiden y que la respuesta dice cuántos
son— ya la dice `textoDelCierre` justo después de cerrar, con el número de
verdad y sólo cuando es cierta.

Y va **atada al botón por `aria-describedby`**, no sólo puesta cerca. Sin la
sección que los envolvía, la cercanía era lo único que los unía, y eso es
exactamente la flojedad que T-1 arregló en dos pruebas. La de punta a punta
lo mide con `toHaveAccessibleDescription`, que es un ancla más fuerte que la
región que se fue.

**La medición que reemplaza a la región**, y que es la que de verdad importa:
ningún `<h2>` queda por encima de la tira de pestañas. Un encabezado de
segundo nivel arriba de la navegación grita más que ella, y eso —no la
sección en sí— era el problema. La prueba recorre todos los `<h2>` de la
página y compara su `y` con el de la tira; vuelve a fallar el día que alguien
meta otra sección ahí arriba.

#### La tira pesa lo que vale

Tres declaraciones sobre `.pestanas__item`, de los tokens que ya existían:
`font-size: var(--texto-l)`, `font-weight: var(--peso-medio)` y la barra de
2px a 3px con `--espacio-xs`/`--espacio-s` de aire. **Las tres se pueden
matar**: la prueba mide, sobre una pestaña **cerrada** —medir la abierta
escondería que las cerradas siguieran siendo letra chica—, que el rótulo sea
más grande que el `font-size` del `body`, más pesado que 400, y que la barra
tenga al menos 3px. Borrar cualquiera de las tres mata su aserción y no las
otras dos.

Sigue siendo un `<nav>` de enlaces con `aria-current="page"`; no se tocó nada
del patrón, y las pruebas de T-1 —`tablist` ausente, tabulador en orden, la
abierta distinguida por barra, peso y tinta— siguen verdes sin cambios.

#### Dos cosas más que apareció mirando la aplicación con datos reales

Las 2167 unitarias y las 409 de punta a punta no veían ninguna de las dos.

1. **El aviso del proceso cerrado se dibujaba dos veces.** El mismo texto, en
   la cabecera y dentro de «Plan de trabajo». Ya pasaba en T-1, pero con la
   sección «Estado del proceso» en el medio costaba notarlo; con el cierre
   subido al título quedaron los dos carteles idénticos a dos dedos uno del
   otro. Se quitó el del panel: la cabecera lo dice en las cuatro pestañas, y
   el de `PanelDePendientes` **no** se tocó porque es un texto distinto y
   local («no se le anotan pendientes nuevos»).
2. **«No queda ninguna etapa por delante. Si falta trabajo, se agrega un paso
   nuevo acá abajo» le salía a un proceso cerrado**, donde agregar un paso no
   se puede. Una puerta prometida y cerrada es peor que no decir nada. Ahora
   se calla con el proceso cerrado, donde el aviso del cierre ya explica qué
   se puede y qué no.

#### Lo que se decidió, y por qué

**«Avanzar» dejó de ser `boton--primario`.** Juntos en la misma sección, dos
botones oscuros pegados no destacan: destacan los dos, que es lo mismo que
ninguno. El realce se lo queda «Guardar plan», que es el envío de la sección
—la regla que el resto del proyecto ya sigue, uno por formulario—, y avanzar
queda del lado de «Cerrar el proceso», que es plano siendo la acción más
consecuente de la pantalla. Un cambio de estado que no se deshace no tiene
por qué ser además el botón que más llama.

**El orden dentro de la sección es lista → agregar → guardar → avanzar.** Es
el orden del trabajo, y pone la salida antes que la puerta cerrada: el botón
que destraba la guarda se lee antes que el que la guarda apaga.

**El número de paso lo pone el navegador.** La lista sigue siendo un `<ol>`
porque el orden **es** el dato; no hay un `<span>` con el índice al lado, que
sería una segunda numeración que puede discrepar de la primera.

**`marcaDeCumplida` devuelve `null` y no una cadena vacía.** La ausencia de
marca es el estado pendiente, y un nulo obliga a quien dibuja a decidir qué
hace con él; una cadena vacía llega hasta la pantalla como un hueco sin que
nadie se entere. Del nulo cuelgan **las dos** mitades del renglón —el rótulo
con la fecha y la ausencia de los botones—: preguntar dos veces serían dos
guardas del mismo hecho.

**El banco de pruebas de punta a punta ahora guarda de verdad.** Hasta T-1 ni
`PUT /etapas` ni `POST /avanzar` estaban contestados: los dos caían en el 404
del final, así que ninguna prueba podía mirar qué pasa después de guardar.
La secuencia que demuestra T-2 lo necesita, porque el conflicto es
exactamente entre lo que la pantalla tiene y lo que el servidor guardó.

#### Lo que se decidió NO hacer, y queda anotado

- **`agregarPaso` sigue agregando al final.** «Un paso en el medio» se
  consigue agregándolo y subiéndolo, que es lo que la prueba de punta a punta
  hace y lo que la regla de T-7 permite: el final es el único lugar donde un
  paso nuevo no se mete delante de algo que ya pasó. Inventar un
  insertar-en-posición habría contradicho esa decisión escrita sin que nadie
  lo pidiera.
- **«Etapa nueva» y «Agregar etapa» siguen activos con el proceso cerrado.**
  Sólo tocan el borrador, y «Guardar plan» está apagado, así que no se puede
  escribir nada; pero es un control vivo sobre algo que no se va a poder
  guardar. Viene de T-7, no lo empeoró T-2, y apagarlo es contenido adentro
  de un panel.

#### Pendiente del coordinador: CSS muerto fuera de las superficies

Al fundir las tres listas, cuatro reglas de `src/estilos/formulario.css`
quedaron **sin un solo consumidor**: `.plan` (304), `.plan__paso` (313),
`.plan__nombre` (325) y `.plan__paso--cumplido` (336), más los modificadores
`.plan--cumplido` y `.plan--pendiente` que sólo existían en el `.tsx`. La
lista única usa `.plantilla` / `.plantilla__etapa` /
`.plantilla__etapa--cumplida`, que siguen vivas —las dos primeras también en
`catalogos/FormularioDeTipoDeProceso.tsx`—.

**No se borraron porque `formulario.css` no estaba en las superficies
autorizadas**, y porque no es un borrado mecánico: dos comentarios de ese
mismo archivo usan `.plan__nombre` como punto de referencia para explicar
otras decisiones (líneas 631 y 714), así que quitarlo obliga a reescribirlos.
Queda para el coordinador.

#### Las mediciones nuevas

- **Unitarias** (`test/procesos-ui.spec.ts`, +15): `marcaDeCumplida` con sus
  dos finales; `hayCambiosSinGuardar` con las cuatro formas de ensuciar el
  borrador, con el espacio que el servidor recorta igual —que **no** cuenta
  como cambio— y contra unas etapas que llegan desordenadas; y las ocho de
  `avanceDelPlan`, incluidas las dos que mueren si se quita la guarda.
- **De punta a punta** (`e2e/procesos.spec.ts`, +5): la lista única con sus
  cuatro pasos en orden y los dos encabezados que dejaron de existir; la
  secuencia completa de la guarda —se puede, se reordena, se niega diciendo
  por qué, se guarda, vuelve, y lo que se marca cumplido es **la que se
  movió**—; agregar un paso en el medio, guardarlo y **recargar** para ver
  que quedó; el borrador que sobrevive a cerrar el proceso; la tira medida
  contra el texto corriente; y el cierre en la cabecera con su descripción
  accesible y sin ningún `<h2>` por encima de la tira.
- **Las que cambiaron de camino, sin aflojarse**: «el detalle separa lo
  cumplido de lo que falta» pasó a ser «el plan es UNA lista en orden»; el
  aviso de «no se deshace» se busca ahora en la región «Plan de trabajo» en
  vez de «Lo que falta», y sigue siendo una región y no la página; y el cero
  de T-15 espera por «Plan de trabajo» en vez de por «Cumplido».

**Pendiente del coordinador:** el commit. El escritor no commiteó nada.
