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
- [ ] **T-2 · La pestaña Trabajo.** Fundir «Cumplido», «Lo que falta» y «Plan
      de trabajo» en una sola lista, con la guarda de avanzar-con-cambios-sin-
      guardar probada por rechazo.
- [ ] **T-3 · El resto dentro de su pestaña.** Pendientes, Dinero e Historial
      revisados ahora que cada uno tiene su propio espacio.

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
