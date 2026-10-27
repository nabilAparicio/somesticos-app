# El detalle del proceso se lee de un vistazo y se trabaja sin miedo

## El problema

Las palabras del usuario, que son el criterio:

> «Es donde el usuario pasará la mayor parte del tiempo analizando procesos,
> pero actualmente es incómodo de ver y gestionar.»

Dos revisiones `better-interface` de `/procesos/:id` (cabecera y armazón; luego
el contenido de cada pestaña) llegan a la misma conclusión: **la pantalla pone
en primer plano los formularios y las explicaciones, cuando el uso diario es
leer el estado y ejecutar una acción.** A 1440×900 la cabecera ocupa ~686 px y
el contenido de la pestaña empieza en y≈776, fuera de la vista. Además hay
**cinco acciones irreversibles o destructivas que se ejecutan con un solo
clic**.

Esta funcionalidad **absorbe la T-3 pendiente de
`odd/tasks/ui-procesos-en-pestanas.md`** («El resto dentro de su pestaña, y el
aire»): la etapa vigente que no se distingue, «Avanzar» sepultado debajo de
«Guardar plan», la columna de 770 px y el exceso de cajas de ayuda. Todos esos
puntos están confirmados acá y repartidos en las tareas de abajo.

## Decisiones previas que se respetan

- **Ver y editar van juntos en Trabajo** (`ui-procesos-en-pestanas.md` §«Ver y
  editar van juntos, por decisión del usuario»). La revisión propuso un modo
  lectura con un conmutador «Editar plan»; **se descarta** porque contradice esa
  decisión. Lo que sí se corrige es la jerarquía dentro de la lista única.
- **«Marcar cumplida» se niega mientras haya cambios sin guardar** (la guarda de
  T-2). La confirmación nueva se agrega delante de esa guarda, sin reemplazarla.
- **Alcance:** `src/` y sus pruebas. No se tocan el worker, el contrato, la base
  ni las migraciones. Si algún dato de la columna lateral no llega hoy en los
  GET existentes, no se agrega: se queda fuera.

## Los hallazgos, consolidados

Severidad según `better-interface`. Los marcados ⚑ son disparadores de
escalamiento (HIGH apenas se confirman).

| # | Sev | Pestaña | Hallazgo | Mitigación | Tarea |
|---|---|---|---|---|---|
| H1 ⚑ | HIGH | Trabajo | «Avanzar a «X»» escribe un hecho irreversible con un clic; el aviso «No se puede deshacer» aparece después del botón (`PanelDeTrabajo.tsx:370-386`) | `<dialog>` nativo con `showModal()`, como `cotizaciones/ClienteNuevo.tsx:148`: «¿Marcar cumplida «X»?» · `Marcar cumplida` / `Cancelar` | T-1 |
| H2 ⚑ | HIGH | Pendientes | «Cerrar» un pendiente actúa con un clic y no tiene ningún aviso (`PanelDePendientes.tsx:131-139`) | El mismo diálogo · `Marcar resuelto` / `Cancelar` | T-1 |
| H3 ⚑ | HIGH | Dinero | «Quitar» borra el movimiento **y su comprobante** con un clic (`PanelDeGastos.tsx:524`) | El diálogo: «¿Quitar «Timbres fiscales» (86.00)? También se borra su comprobante.» · `Quitar movimiento` / `Cancelar` | T-1 |
| H4 ⚑ | HIGH | Pendientes | `.pendiente--cerrado { opacity: .75 }` deja la firma en 3.54:1, por debajo de AA (`formulario.css:484-487`) | Quitar `opacity`; marcar el cierre con el borde existente y una `.etiqueta` «Cerrado» | T-1 |
| H5 | HIGH | Trabajo | En un proceso cerrado se pueden editar las etapas y agregar nuevas, pero «Guardar plan» está desactivado sin explicación (`PanelDeTrabajo.tsx:225-239, 313-329`) | Con `terminado`, nombres como texto y sin formulario de alta | T-1 |
| S1 | MED | Todas | Las acciones destructivas tienen el mismo `.boton--tenue` que las neutras (`formulario.css:125-129`) | Token `--color-peligro` y modificador `.boton--peligro` para Quitar | T-1 |
| P1 | MED | Pendientes | El botón «Cerrar» de cada fila no tiene nombre accesible y se confunde con «Cerrar el proceso» | «Marcar resuelto» y ``aria-label={`Marcar resuelto «${texto}»`}`` | T-1 |
| A1 | MED | Cabecera | La cabecera ocupa ~686 px; nada de la pestaña se ve al entrar (`CabeceraDeProceso.tsx:98-238`) | Banda de resumen de ~200 px: título, estado, pendientes, «Lo que viene», progreso y acciones | T-2 |
| A2 | MED | Cabecera | `.pestanas` es `static`; al cambiar de pestaña hay que volver a recorrer la página (`layout.css:919-922`) | Banda y pestañas `position: sticky` dentro de `.esqueleto__contenido`, con `scroll-padding-block-start` | T-2 |
| A3 | MED | Cabecera | «Cerrar el proceso», que casi no se usa, es el control más visible; «Avanzar» queda en y≈1347 | «Avanzar» en la banda junto a «Lo que viene»; «Cerrar el proceso» secundario | T-2 |
| A4 | MED | Cabecera | El estado es el último dato de la segunda columna (`CabeceraDeProceso.tsx:185-203`) | Etiqueta de estado y contador de pendientes al principio de la banda | T-2 |
| A5 | MED | Todas | `document.title` es «Bufete» en todos los procesos y pestañas (WCAG 2.4.2) | `${pestaña} · ${título} · Bufete` | T-2 |
| A6 | MED | Todas | La columna usa 770 de ~2000 px a 1440 (deuda de T-3) | Dos columnas en `@container armazon (min-width: 64rem)`: trabajo + datos de consulta | T-2 |
| T1 | MED | Trabajo | La etapa vigente se ve igual que las que faltan | `plantilla__etapa--vigente` con la `.etiqueta` «En curso», borde de acento y «Avanzar» en esa fila | T-3 |
| T2 | MED | Trabajo | El chip «Cumplida el …» en la misma fila desalinea los campos | El chip en su propio renglón, o una columna final de ancho fijo | T-3 |
| T3 | MED | Trabajo | A 320 px, ↑/↓/Quitar se parten en dos renglones | Agruparlos en `.plantilla__acciones` sin cortes internos | T-3 |
| T4 | MED | Trabajo | «Guardar como plantilla» ocupa ~350 px fijos | Dentro de un `<details>` | T-3 |
| T5 | LOW | Trabajo | «Guardar plan» relleno aunque no haya cambios | Mostrarlo sólo con `sinGuardar` | T-3 |
| W1 | MED | Todas | Entre 2 y 4 `<Aviso>` siempre abiertos por pestaña | Una línea de ayuda con `aria-describedby` y un «¿Cómo funciona?» en `<details>` por pestaña | T-3…T-6 |
| S2 | MED | Pend/Din/Hist | Formulario expandido de 400–500 px que casi siempre está ocioso | Botón «+ Acción» que lo abre en el lugar y lleva el foco al primer campo | T-4…T-6 |
| P2 | MED | Pendientes | El formulario parte la lista: abiertos → formulario → cerrados | Abiertos → «Cerrados (N)» en `<details>` → formulario detrás de «+ Anotar pendiente» | T-4 |
| P3 | MED | Pendientes | «Vence el 28 oct» se ve igual aunque sea mañana | «Vence mañana» / «Vence en 3 días» y el estilo `pendiente--por-vencer` (≤ 2 días) | T-4 |
| P4 | LOW | Pendientes | La acción de la fila parece parte de la fecha | La acción al final de la fila (`Fila alinear="entre"`) | T-4 |
| D1 | MED | Dinero | Cada movimiento es una tarjeta de ~100 px; seis ocupan ~600 px | Una fila por movimiento: fecha · concepto y firma · comprobante · monto alineado a la derecha | T-5 |
| D2 | MED | Dinero | Los montos no llevan moneda («407.00») | Formato con moneda **local a procesos**; `montoLegible` (cotizaciones) no se toca | T-5 |
| D3 | MED | Dinero | El aviso legal va antes que la cifra del saldo | Banda Adelantado · Gastado · Saldo arriba; el aviso en una línea tenue | T-5 |
| D4 | LOW | Dinero | Los montos de las filas no se alinean con los totales | El mismo padding en `.suma`, o una tabla | T-5 |
| D5 | LOW | Dinero | `<ol>` numera movimientos sin que el número signifique algo | `<ul>` | T-5 |
| R1 | MED | Historial | Notas a ~150 caracteres por línea (`formulario.css:395-417`) | `max-inline-size: 72ch` (también en las prosas de Pendientes) | T-6 |
| R2 | MED | Historial | Para anotar hay que bajar más allá de toda la bitácora | El formulario de nota arriba y la bitácora al final | T-6 |
| R3 | MED | Historial | La línea de etapas va de lo viejo a lo nuevo y la bitácora al revés; la fecha de etapa no tiene rótulo | Un mismo orden (lo más nuevo primero) y «Alcanzada el …» | T-6 |
| R4 | LOW | Historial | Las fechas van en `<p>` | `<time dateTime>` | T-6 |
| S3 | LOW | Todas | «Consultando…» sin región viva | `role="status"` y nombrar lo que se carga | T-6 |
| S4 | LOW | Todas | `.boton:disabled { cursor: progress }` también en ↑/↓ desactivados (`formulario.css:131-134`) | `progress` sólo con `aria-busy`; el cursor normal para `:disabled` | T-1 |

**Fuera de alcance, anotado:** en Historial, una sola corriente que mezcle notas
y eventos con filtros por tipo. Es una vista nueva, no presentación, y se decide
después de ver T-6.

## Las tareas

Ruta y verificación por tarea. Los cinco comandos son los de siempre:
`npm run typecheck`, `npm test`, `npm run lint`, `npm run build`,
`npm run test:e2e`. Primero se observa RED en la prueba de comportamiento
(`test/` con vitest, `e2e/procesos.spec.ts`) y después se implementa.

- [x] **T-1 · Nada irreversible con un solo clic, y lo cerrado se lee.** H1–H5,
      S1, P1, S4. Un componente `Confirmacion` sobre el `<dialog>` nativo (el
      patrón de `ClienteNuevo.tsx`), reutilizado en las tres acciones; el token
      de peligro; el plan en solo lectura en un proceso cerrado.
      *RED:* «Cancelar» no dispara ninguna petición y confirmar dispara
      exactamente una; un proceso cerrado no muestra campos de etapa.
      *Ruta:* delegada (≥ 3 paneles + CSS + componente nuevo). *~350 líneas.*
- [ ] **T-2 · La banda de resumen y el armazón de trabajo.** A1–A6. La banda
      compacta y fija con las pestañas; «Avanzar» (con la confirmación de T-1)
      junto a «Lo que viene»; el título del documento; dos columnas a ≥ 64rem
      con los datos de consulta que ya llegan en el GET del detalle.
      *RED:* e2e de que la primera fila de la pestaña está dentro de la vista a
      1440×900 y de que `document.title` cambia con la pestaña.
      *Ruta:* delegada (cabecera, detalle, layout.css). *~400 líneas.*
- [ ] **T-3 · Trabajo: la lista dice dónde está el proceso.** T1–T5 y W1 de
      Trabajo. Sigue siendo **una sola lista editable en el lugar**.
      *RED:* la fila vigente lleva «En curso» y «Avanzar»; «Guardar plan» no
      aparece sin cambios. *Ruta:* delegada. *~250 líneas.*
- [ ] **T-4 · Pendientes: ordenados por urgencia.** P2–P4, S2, W1 y el ancho de
      72ch en las prosas. El vencimiento relativo va en `.ts` puro, con pruebas.
      *RED:* vitest de `venceEn(fecha, hoy)`; e2e del orden abiertos →
      cerrados → «+ Anotar». *Ruta:* delegada. *~250 líneas.*
- [ ] **T-5 · Dinero: el saldo primero, los movimientos en filas.** D1–D5, S2 y
      W1. El formato con moneda vive en `src/pantallas/procesos/gastos.ts`.
      *RED:* vitest del formato con moneda; e2e de que el saldo es lo primero en
      la pestaña. *Ruta:* delegada. Moneda: `$` (ver Decisiones tomadas).
      *~350 líneas.*
- [ ] **T-6 · Historial: anotar arriba, un solo orden.** R1–R4, S2, S3 y W1.
      *RED:* e2e de que el formulario de nota va antes de la bitácora y de que
      la línea de tiempo va de lo más nuevo a lo más viejo. *Ruta:* delegada.
      *~250 líneas.*

## Criterios de aceptación

- A 1440×900, el estado, la etapa vigente, «Avanzar» y la primera fila de la
  pestaña activa se ven **sin hacer scroll**.
- Ninguna acción irreversible o destructiva se ejecuta sin confirmación; cancelar
  no escribe nada en la bitácora.
- Todo el texto cumple AA (≥ 4.5:1), incluido lo cerrado.
- Un proceso cerrado no ofrece ningún control que no pueda guardar.
- Cada pestaña es más corta que hoy con los mismos datos semilla
  (`d1000000-…0001`), medido en una captura de página completa.
- Los cinco comandos en 0.

## Restricciones de ejecución

- **Worktree:** `../app-cotizador-worktrees/procesos-comodidad`, rama
  `feat/procesos-comodidad`, creada desde `feat/r1-fundacion` (806a5b9). El
  checkout principal lo está usando otra sesión en `feat/plantillas-de-modulo`.
- **Superficies que se cruzan con otras ramas:** `src/estilos/layout.css` lo
  tocan también `feat/plantillas-de-modulo` y `feat/inicio-tablero`. Se
  minimizan los cambios ahí y se agrupan en un bloque propio. Ninguna tarea toca
  `worker/`, `worker/contract.ts` ni migraciones (la 0017 ya está tomada).
- **La base local es de verdad:** la bitácora es inmutable. Las pruebas manuales
  usan los procesos semilla `d1000000-…0001` (con datos) y `…0004` (cerrado), y
  cada clic que escribe deja una entrada permanente.

## Entrega

Pronóstico: ~1850 líneas en seis tareas, por encima del presupuesto de ~400 por
PR. Estrategia `ask-on-risk`: antes del commit que cruce el presupuesto se
pregunta una vez por la cadena (`stacked-to-main` o `feature-branch-chain`).
Cada tarea cierra con su commit convencional en la rama.

## Decisiones tomadas

1. **Moneda de los montos en Dinero: `$`.** El usuario: «en Panamá son
   indiferentes, puedes utilizar $ por convención general, pero las 3 son
   aceptables». Formato: `$1,000.00` (prefijo `$`, separador de miles `,`,
   dos decimales), en `src/pantallas/procesos/gastos.ts`. T-5 queda
   desbloqueada.

## Progreso

### T-1 — hecha

- **Ruta:** delegada a un escritor (disparador: tres paneles + CSS +
  componente nuevo). Superficie ampliada con autorización del usuario a
  `e2e/gastos.spec.ts`, donde vive la prueba de «Quitar».
- **Decisiones:**
  - `ClienteNuevo.tsx` no existe en esta rama (vive en otra); el patrón de
    `<dialog>` + `showModal()` se tomó de `cotizaciones/ListaDeServicios.tsx`,
    que es el mismo idioma con la misma disciplina documentada.
  - El componente va en `src/layout/Confirmacion.tsx`, junto a `Aviso`; sus
    estilos en `formulario.css` (no en `layout.css`, que comparten otras
    ramas).
  - El foco arranca en «Cancelar»: un `Enter` de más no firma un hecho.
    `Escape` y el velo cancelan; al cancelar el foco vuelve al botón.
  - «Marcar cumplida» y «Marcar resuelto» usan el botón primario (son
    irreversibles, no destructivas); `boton--peligro` queda para «Quitar
    movimiento» y para los «Quitar» de fila (texto rojo sobre `boton--tenue`).
  - `--color-peligro: #a3261b`: 6.76:1 sobre `--color-fondo`, 7.37:1 sobre
    `--color-superficie`, 5.94:1 sobre `--color-acento-tenue`.
  - Con el proceso cerrado se dibuja el **borrador** como texto
    (`.plantilla__nombre`) y se conserva «Hay cambios sin guardar», para que
    un cambio a medio hacer no desaparezca; reabrir lo devuelve al campo.
  - El aviso «No se puede deshacer» se mudó del pie del botón al cuerpo de la
    pregunta; `AVISO_PENDIENTE_NO_SE_REABRE` dice «Marcarlo resuelto».
  - H3: el título es «¿Quitar «concepto» (monto)?» y «También se borra su
    comprobante.» va en el cuerpo, sólo si el movimiento lo tiene.
  - S4: `cursor: not-allowed` en `:disabled`, `progress` sólo con
    `aria-busy="true"` (puesto en «Guardar plan» y «Anotar pendiente»).
- **RED observado:**
  - `e2e/procesos.spec.ts`, describe «nada irreversible con un solo clic»,
    4 de 4 en rojo: no aparece el `dialog` «¿Marcar cumplida «…»?»; no existe
    el botón «Marcar resuelto «…»»; no hay `.etiqueta` «Cerrado»; el nombre de
    etapa no está como texto en un proceso cerrado.
  - `e2e/gastos.spec.ts`, describe «quitar un movimiento», 2 de 2 en rojo con
    el panel de antes (no aparece el `dialog` «¿Quitar «…» (575.39)?»), y la
    prueba de «sacar un movimiento» actualizada también en rojo.
- **GREEN:** `e2e/procesos.spec.ts` + `e2e/gastos.spec.ts` 127/127.
- **Checks:** typecheck 0 · `pnpm test` 47 archivos / 2478 pruebas · lint 0 ·
  build 0 · `test:e2e` 492 pasan, 1 falla ajena:
  `e2e/armazon.spec.ts:475` «el velo cierra el cajón» (timeout). Falla igual
  con el código fuente de `806a5b9` sin T-1, en paralelo y con la máquina
  cargada; sola, y en serie con poca carga, pasa (20/20). No es de T-1.
- **Entorno:** el 5174 de `playwright.config.ts` lo ocupaba el checkout
  principal; las corridas usaron una copia de la configuración en el
  scratchpad con el puerto 5194, sin tocar la del repositorio.
- **Próximo paso:** T-2.
