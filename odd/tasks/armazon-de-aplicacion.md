# El armazón se comporta como una aplicación

## El problema

Las palabras del usuario, que son el criterio:

> «Necesito que en pantallas grandes esté centrado, y que el sidebar se
> comporte como tal: colapsando y creciendo y aplicando un overlay a lo otro.
> Aparte, no veo el usuario logueado ni una forma de cerrar sesión. El sidebar
> no hace scroll con el resto de la página, igual que la top bar.»

Cuatro reclamos, y los cuatro son el mismo defecto de fondo: **el armazón de
`src/layout/Esqueleto.tsx` es un documento, no una aplicación.**

Evidencia, medida y no supuesta:

| Reclamo | Por qué pasa hoy |
|---|---|
| No está centrado | `--tope-contenido: 82rem` vive en `.esqueleto__contenido` (`src/estilos/layout.css`), no en el armazón. El armazón crece hasta el borde del monitor y el contenido queda pegado a la izquierda. |
| El lateral no colapsa | No existe el estado. Ni botón, ni velo, ni nada: `.esqueleto__navegacion` es una pista de grid y siempre está. |
| Encabezado y lateral scrollean | No hay un solo `position: sticky` ni `fixed` en todo `layout.css`. Las tres áreas están en flujo de página y la página entera scrollea como un documento. |
| No se ve quién entró ni cómo salir | El encabezado es marca + lema y nada más. `GET /api/yo` ya existe (`worker/index.ts:208`) y lo consume **una** pantalla, `src/pantallas/Inicio.tsx:32`, como línea de diagnóstico que se pierde al navegar. |

## La restricción que decide la forma

`docs/diseno.md` §9 reparte las herramientas y no se negocia:

- **grid** para el esqueleto, que es bidimensional;
- **flexbox** para franjas unidimensionales;
- **consultas de contenedor antes que de viewport**;
- **nada de tamaños fijos**: topes, mínimos y `clamp()`.

Eso descarta la salida fácil. Un `position: fixed` con `padding-top` calculado
a mano en el contenido es exactamente la medida fija que §9 prohíbe, y se
rompe el día que el encabezado envuelve en dos renglones.

**La forma que sí respeta §9: el armazón mide `100svh` y el scroll se mueve
hacia adentro.** El encabezado y el lateral no se fijan: siguen siendo pistas
de una rejilla que no scrollea, y la única región con `overflow-y: auto` es el
contenido. Nadie calcula la altura de nada.

## La forma

### El armazón, centrado y quieto

```
grid-template-areas:
  "encabezado encabezado"      filas: auto
  "navegacion contenido"              minmax(0, 1fr)   ← el resto
block-size: 100svh
max-inline-size: var(--tope-armazon)
margin-inline: auto                   ← el centrado
```

El tope va en el **armazón**, no en el contenido: eso es lo que centra la
aplicación entera —encabezado, lateral y contenido como un bloque— en vez de
centrar una columna debajo de un encabezado que sigue estirado.

### El lateral: columna en ancho, cajón con velo en angosto

Decisión del usuario, tomada sobre dos bocetos:

- **≥ 48rem**: el lateral es columna del grid y está **abierto por defecto**.
  El botón lo colapsa para ganarle ancho a una tabla. Sin velo: hay lugar
  para los dos, y tapar la tabla que alguien está leyendo no es un servicio.
- **< 48rem**: el lateral es un cajón fuera de pantalla, **cerrado por
  defecto**, que se abre **encima** del contenido con un velo. Se cierra con
  el velo, con `Escape` y con el propio botón.

Las secciones no tienen iconos —son rótulos de texto— así que «colapsado» en
ancho es la columna ausente y no un rail de iconos. Inventar un set de
iconos para que el rail exista sería traer una dependencia visual nueva
dentro de una tajada de layout.

**El overlay es overlay de verdad, no de pintura.** Con el cajón abierto en
angosto, el contenido y el encabezado reciben `inert`: el velo no deja pasar
el clic *y* el teclado tampoco entra. Un velo que solo oscurece deja el foco
tabulando por debajo.

### Un solo estado, y el umbral se consulta una vez

El estado es un booleano, «¿se está mostrando la navegación?», y se lee
igual en los dos modos. Lo que cambia es el valor inicial: abierto en ancho,
cerrado en angosto.

JavaScript **no puede** consultar una `@container`. Así que el umbral se lee
con `matchMedia` —y es el único lugar de todo el sistema donde el viewport
decide algo— porque el comportamiento modal (el valor inicial, `Escape`,
`inert`) necesita saber el modo y no hay otra forma. **Toda la adaptación
visual se queda en `@container armazon`**, como está hoy.

### Quién entró y cómo salir

El encabezado gana, al final de la franja, el nombre de quien entró y
**Salir**.

«Salir» es un enlace a `/cdn-cgi/access/logout`, **relativo al dominio de la
aplicación**, y no código propio: la autenticación es Cloudflare Access
(`docs/diseno.md` §7 y §9) y no hay sesión nuestra que cerrar. Verificado en
la documentación de Cloudflare (Access · Session Management): tanto
`<dominio-de-la-app>/cdn-cgi/access/logout` como el del team sirven, y el de
la aplicación es el que borra la cookie del dominio propio, así que la salida
se siente inmediata. No hay ruta nueva en el Worker porque la atiende el
borde, no nosotros.

La identidad pasa a un cliente propio, `src/api/identidad.ts`, sobre el
`pedir` de `src/api/peticiones.ts`. Hoy `Inicio.tsx` hace `fetch("/api/yo")`
a mano, por fuera del cliente que maneja 403 y 503. Y la línea de diagnóstico
de `Inicio.tsx` **se va**: con la identidad en el armazón, permanente y en
toda pantalla, repetirla en la portada es decir dos veces lo mismo y peor.

## Alcance autorizado

Entra: `src/layout/Esqueleto.tsx`, `src/estilos/layout.css`,
`src/estilos/tokens.css`, `src/estilos/impresion.css`, `src/api/identidad.ts`
(nuevo), `src/pantallas/Inicio.tsx`, y las pruebas de los tres.

No entra: el Worker (ya expone todo lo que hace falta), el set de iconos, el
tema oscuro, y el `X-Requested-With: XMLHttpRequest` que haría que Access
devuelva 401 en vez de redirigir cuando la sesión vence — eso es deuda
anotada abajo, no esta tajada.

## Las tareas

### T-1 · El armazón no scrollea y se centra

- [x] `--tope-armazon` en `tokens.css`, como tope y no como ancho.
- [x] `.esqueleto`: `block-size: 100svh`, filas `auto` + `minmax(0, 1fr)`,
      `max-inline-size` + `margin-inline: auto`.
- [x] `.esqueleto__contenido`: única región con `overflow-y: auto` y
      `overscroll-behavior` contenido.
- [x] `.esqueleto__navegacion`: `overflow-y: auto` propio, porque la lista de
      secciones va a crecer y el lateral ya no puede empujar la página.
- [x] `@media print`: el armazón vuelve a `block` con altura y desbordamiento
      libres. `impresion.css` ya pone `display: block`; le falta soltar la
      altura, y sin eso la hoja de `HojaDeCotizacion` sale de una página.
- [x] Verificar que los `thead` pegajosos de `.tabla` sigan pegándose —ahora
      al techo de la región de contenido, que es lo que corresponde.

Ruta: **delegada** (tres archivos no triviales, uno de ellos acoplado al
otro).

### T-2 · El lateral colapsa, crece y tapa

- [x] Botón de alternar en el encabezado, con `aria-expanded` y
      `aria-controls` sobre el `<nav>`.
- [x] El estado y el umbral vivos; `Escape` e `inert` solo en modo cajón.
- [x] Velo: elemento propio, oculto por `@container` en ancho, así que en
      ancho no hay clic posible que cerrar.
- [x] Transición con `prefers-reduced-motion: reduce` respetado.
- [x] **El menú se queda en el DOM cuando está cerrado**, escondido por
      `transform`. `e2e/navegacion.spec.ts` lee `.navegacion__lista a` con
      `toBeAttached()`: renderizarlo condicionalmente mataría las tres
      pruebas del invariante «toda pantalla es alcanzable desde el menú».

Ruta: **delegada**, junto con T-1: mismos archivos.

### T-3 · Quién entró y cómo salir

- [x] `src/api/identidad.ts` con `cargarIdentidad(signal)` sobre `pedir`.
- [x] El encabezado muestra nombre (y correo como título) y **Salir** a
      `/cdn-cgi/access/logout`.
- [x] Sin identidad reconocida, lo dice en vez de quedar en blanco: la puerta
      puede estar mal configurada y eso tiene que verse.
- [x] Se va la línea de diagnóstico de `src/pantallas/Inicio.tsx`.

Ruta: **delegada** (archivo nuevo + dos editados).

## Criterios de aceptación

1. A 1440px el armazón está centrado y no pegado al borde izquierdo.
2. Scrolleando una lista larga, el encabezado y el lateral no se mueven.
3. En ancho, el botón saca y devuelve la columna del lateral.
4. En angosto, el cajón se abre sobre el contenido con velo, y se cierra con
   el velo, con `Escape` y con el botón.
5. El nombre de quien entró se ve en toda pantalla, y «Salir» lleva a
   `/cdn-cgi/access/logout`.
6. La hoja imprimible sigue saliendo completa.
7. `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e` en verde.

## Verificación

`pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm test:e2e`

Política de prueba primero: aplica a T-3, que tiene lógica corriible
(`cargarIdentidad`, y el armazón renderizado desde `e2e/`). T-1 y T-2 son
layout: el RED corriible es de punta a punta —medir posición y visibilidad en
el navegador— y va por ahí, no por unitarias que afirmarían sobre clases CSS
sin dibujar nada.

## Entrega

Forecast: ~600 líneas autoradas (el CSS de este proyecto lleva su
documentación adentro). Pasa el presupuesto de ~400.

Estrategia elegida: **`exception-ok`**, con el motivo escrito. La rama
`feat/r1-fundacion` ya es una rama larga del usuario con tajadas acumuladas
(T-1, T-2, T-13 B de otras tajadas); abrir una cadena de PRs acá cambiaría su
forma de trabajar en el medio de un arreglo de layout. Se entregan **tres
commits de unidad de trabajo** en la rama, uno por tarea. El PR y el merge
siguen siendo decisión del usuario, y si al abrirlo quiere partirlo, los tres
commits ya están partidos por tarea.

## Progreso

- **T-1 cerrada.** `--tope-armazon: 88rem` en `tokens.css`; el armazón pasa a
  `block-size: 100svh` con filas `auto` + `minmax(0, 1fr)`, tope y
  `margin-inline: auto`; el contenido es la única región con `overflow-y`, y
  el lateral tiene el suyo. El `padding` de página dejó de vivir en el
  armazón y se reparte por región: con una región que scrollea adentro, un
  `padding` en el armazón mete la barra de scroll hacia adentro y deja una
  franja muerta abajo. En `@media print` el armazón suelta altura, tope y
  desbordamiento, medido con `emulateMedia`: la hoja pasa a 2274px sobre una
  ventana de 700px y nada queda recortado.
- Pruebas: `e2e/armazon.spec.ts`, escrito antes que el CSS y visto en rojo
  (17 de 19 fallando con el armazón viejo).
- **Lo que la tarea dio por cierto y no lo era: el `thead` pegajoso.** La
  casilla decía «verificar que sigan pegándose, ahora al techo de la región
  de contenido». Medido en el navegador: no se pegan, y **tampoco se pegaban
  antes**. El scrollport más cercano no es `.esqueleto__contenido` sino
  `.tabla-contenedor`, porque su `overflow-x: auto` hace que el eje vertical
  pase a `auto` solo; y ese contenedor no tiene tope de alto, así que nunca
  scrollea en vertical. La regla no cambió —hace falta igual para el scroll
  horizontal de la tabla, y empieza a pegar sola el día que una tabla reciba
  un tope de alto— y el hallazgo quedó escrito al lado de ella en
  `layout.css`.
- **T-2 cerrada.** El lateral es columna en ancho —abierta por defecto, y el
  botón saca la pista entera del grid— y cajón con velo en angosto, cerrado
  por defecto, que se cierra con el velo, con `Escape` y con el botón. El
  cajón cerrado se queda en el árbol, corrido con `transform` y fuera de
  alcance con `visibility` y `pointer-events`: `e2e/navegacion.spec.ts` sigue
  en verde. Los tokens nuevos —`--color-velo`, `--z-velo`, `--z-cajon`,
  `--sombra-cajon`— van en `tokens.css` para que no quede ningún `z-index`
  suelto adentro de una regla.
- **El `inert` va en el contenido y no en el encabezado, y es una corrección
  a lo escrito arriba.** «El contenido y el encabezado reciben `inert`» no se
  puede cumplir junto con «se cierra con el propio botón»: un encabezado
  inerte es un botón que no puede cerrar lo que abrió, ni con el mouse ni con
  el teclado. La salida es geométrica y no una excepción: el cajón y el velo
  se posicionan contra el **área de contenido de la rejilla**
  (`grid-area: contenido` más `position: absolute`), así que el encabezado
  queda afuera del velo por construcción. El overlay sigue siendo overlay de
  verdad —el foco no entra al contenido—, y la barra de arriba es lo único
  del armazón que nunca se apaga. Cuando T-3 ponga «Salir» en el encabezado,
  ese enlace va a quedar alcanzable con el cajón abierto; es la consecuencia
  de esta decisión y queda anotada.
- **Dos cosas que el escritor encontró al medir.** Primera: `margin-inline:
  auto` sobre un ítem de grid cancela el `justify-self: stretch` implícito, y
  la región de contenido pasó a medirse por su contenido (649px donde tenían
  que ser 1312). No está, y el porqué quedó escrito en `layout.css`. Segunda:
  el botón no lleva la clase `.boton`, porque `e2e/cotizaciones.spec.ts`
  cuenta `header button.boton` para medir la barra de acciones de una
  cotización y el control del armazón no es una acción de pantalla —con
  `.boton` puesto, quince pruebas de esa suite se caían—.
- La lista de secciones pasa a ser vertical en los dos modos: dentro de un
  cajón de 17rem, una franja que envuelve mete tres rótulos en un renglón y
  dos en el siguiente.
- **T-3 cerrada.** `src/api/identidad.ts` con `cargarIdentidad(signal)` sobre
  `pedir`, y el encabezado con el nombre, el correo y **Salir** a
  `/cdn-cgi/access/logout` —un `<a href>` relativo, con el porqué escrito al
  lado para que nadie lo convierta en un `fetch`: lo que Access contesta es
  una redirección, y una redirección dentro de un `fetch` no saca a nadie de
  ninguna parte—. La línea de diagnóstico de `Inicio.tsx` se fue entera, con
  su `fetch` a mano y su estado. Y en `@media print` nada cambió ni hizo
  falta: `impresion.css` ya apaga `.esqueleto__encabezado`, y medido con
  `emulateMedia` el grupo de identidad queda en 0x0 adentro de un
  `display: none`.
- Pruebas: `test/identidad-ui.spec.ts` (ocho unitarias sobre las ramas de
  `Resultado`) y `e2e/identidad.spec.ts` (nueve de punta a punta sobre el
  dibujo), escritas antes y vistas en rojo: la unitaria no compilaba —no
  existía el módulo— y las nueve de punta a punta fallaban todas.
- **El correo no puede ir sólo en el `title`.** Un `title` aparece al pasar
  el mouse por encima, y no hay mouse en un teléfono ni navegando con
  teclado; los lectores de pantalla tampoco lo anuncian de forma confiable.
  Así que el correo viaja dos veces: en el `title` para quien apunta, y en un
  `<span class="oculto-visualmente">` para todos los demás. La utilidad se
  reusa de `formulario.css` en vez de copiarse.
- **Lo que la tarea dio por cierto y no lo era: `test/tsconfig.json`.** El
  alcance de T-3 nombraba `src/api/identidad.ts` y sus pruebas, y no que una
  prueba en `test/` que importe un módulo de `src` **tiene que listarlo** en
  el `include` de ese proyecto `composite`: sin eso el `typecheck` falla con
  TS6307 y ninguna otra cosa lo arregla. Se agregó la línea, al lado de
  `src/api/peticiones.ts`, que entró por lo mismo en su momento.
- **Dos cosas que el escritor encontró al medir.** Primera, y costó
  diecinueve pruebas: el grupo de identidad nació `flex: 0 0 auto` —copiado
  del botón de secciones— y con el encogimiento prohibido conservaba su ancho
  de contenido entero, así que a 320px la página volvía a scrollear en
  horizontal y se caían las diecinueve pruebas de ese criterio repartidas en
  siete suites. Pasó a `flex: 0 1 auto` con `min-width: 0`. Segunda: el
  mínimo del rótulo de identidad es **el ancho del rótulo de carga**, 11ch
  medidos en el navegador, y no un número cómodo: con un mínimo menor el
  grupo se angostaba al resolverse la identidad y «Salir» se corría de lugar
  mientras alguien lo estaba apuntando.
- **El aviso de rechazo es el único que puede hacer crecer la franja.** Al
  nombre se le recorta con elipsis —el entero sigue en el árbol y en el
  `title`—, pero al motivo no: «Sin identidad reconocida (acceso_no_conf…»
  pierde justamente la parte que dice qué hay que arreglar. El estado normal
  no salta nunca; el anormal se ve entero.
### Verificación de control, corrida aparte de los escritores

`pnpm lint` limpio · `pnpm typecheck` limpio · `pnpm test` 2175 en 42
archivos · `pnpm test:e2e` **437 en verde, dos corridas completas seguidas**.

La primera corrida completa falló una: `e2e/procesos.spec.ts:839`,
«reordenar dos pendientes…», con el plan leído como arreglo vacío. **No era
una regresión de esta tajada**, y se comprobó en vez de suponerse: la prueba
pasa 8 de 8 en aislamiento, y leyendo el código la causa es unívoca —
`planDibujado` usa `evaluateAll`, que no reintenta, y esa única llamada no
tenía ninguna espera entre el `goto` y la aserción, al revés que las otras
dos del mismo archivo. Arreglada con `expect.poll` en el commit `0dbdfb4`,
aparte de esta tajada porque no es de esta tajada.

Mirado además a mano en el navegador, medido y no supuesto: a 1920 el
armazón mide 1408px con 256px de cada lado; el botón lleva el contenido de
1092px a 1312px y el lateral a `x: -16`; a 390 el cajón abre sobre el
contenido, el velo tapa, el `<main>` queda `inert` y «Salir» sigue
alcanzable; cero desborde horizontal.

Un aviso para el que venga a medir esto a mano con un navegador en segundo
plano: **ahí `requestAnimationFrame` corre a ~1 fps**, así que una
transición de 0.18s parece tardar un segundo y el cajón parece no abrirse.
No es el cajón, es el instrumento. La medición que vale es la de la suite de
Playwright, que corre con su propio navegador.

- Próximo paso: las tres tareas están cerradas. Queda la deuda anotada abajo,
  que es de la puerta y no del armazón.

## Deuda que esta tajada deja anotada

- **Sesión vencida en una SPA.** La documentación de Access dice que mandando
  `X-Requested-With: XMLHttpRequest` en las peticiones, una sesión vencida
  devuelve `401` en vez de redirigir al login dentro del `fetch`. Hoy
  `src/api/peticiones.ts` no lo manda, así que una sesión vencida se ve como
  un error raro y no como «volvé a entrar». No entra acá porque es la puerta
  y no el armazón.
- **Iconos.** El día que las secciones tengan iconos, el lateral colapsado en
  ancho puede ser un rail en vez de desaparecer, que es mejor.
