# cotizaciones — Tajada 2: el generador de propuestas

**Creado:** 24 de octubre de 2026
**Estado:** **R1, R2 y R3 cerradas** (T-1 a T-7). R4 en marcha: T-8 hecha, falta T-9. Revisiones RDD **desactivadas** la noche del 24 de octubre a pedido del usuario, para avanzar sin frenar en cada puerta de consentimiento; se reactivan y se revisa la rama entera. La tajada 1 está construida y empujada; falta desplegarla
(T-16 allá).
**Diseño de referencia:** `docs/diseno.md` §8 (el generador), §6 (modelo de datos), §5 (invariantes)
**Tajada anterior:** `odd/tasks/crm-procesos.md`

---

## Objetivo

El segundo de los dos cuellos de botella que el usuario nombró el primer día: **crear
cotizaciones**. Que el abogado describa el encargo en una frase y salga una propuesta completa,
editable, que se congela al emitirse y se guarda para siempre.

## Problema

Hoy el bufete cotiza cada encargo desde cero. Cada propuesta se escribe a mano, se parece a la
anterior pero no igual, y cuando alguien pregunta «¿cuánto cobramos por una visa de trabajo?» la
respuesta está en una carpeta que hay que abrir una por una.

La tajada 1 resolvió saber **en qué anda** cada cliente. Ésta resuelve **cuánto le cobramos y por
qué**, y cierra el círculo: una cotización ganada abre los procesos que la tajada 1 ya sabe
seguir.

## Por qué esta tajada va segunda y no primera

Porque una cotización que no desemboca en nada es un documento suelto, y documentos sueltos es lo
que el bufete ya tiene. Con el seguimiento construido, emitir una cotización y ganarla **abre
procesos reales en un sistema que los sabe llevar**. El orden importa.

## Alcance autorizado

**Entra:** cotización con módulos de prosa y líneas estructuradas, ciclo de vida completo con
snapshot inmutable, duplicar, salida imprimible, apertura de procesos desde una cotización
ganada, el generador asistido por IA, el plan de pagos y los gastos reales con sus comprobantes.

**No entra:** facturación, conciliación bancaria, cuentas por cobrar, estado de cuenta formal,
recordatorios automáticos de cobro, editor visual de plantillas, portal del cliente. Todo eso
sigue fuera, igual que en la tajada 1 (`docs/diseno.md` §2).

El saldo de gastos que el sistema muestre es **informativo, no verdad contable**.

## La barandilla, que no se negocia

> **El modelo no suma. Nunca.**

La IA decide qué módulos entran, en qué orden, y escribe la prosa. En lo estructurado **rellena
campos tipados y el sistema hace la aritmética**. No puede inventar un tipo de módulo que no
existe ni agregar un campo.

Si pudiera, las cotizaciones dejarían de ser comparables entre sí, los totales dejarían de cerrar,
y el snapshot congelado guardaría una forma distinta cada vez. En seis meses nadie podría
contestar «¿cuánto cobramos en promedio por una visa de trabajo?», porque cada cotización habría
guardado el honorario en otro lugar.

## Restricciones heredadas de la tajada 1

Se listan porque son las que un escritor nuevo no adivina:

1. **Los invariantes viven en la base**, no en la aplicación. Se prueban **por rechazo**, nunca
   por aceptación.
2. **Las guardas se cuentan, nunca se atrapan.** Prohibido envolver el error de un disparador,
   una llave foránea o un índice en un `try/catch` que lo disfrace de respuesta amable.
3. **`IS NOT` y nunca `<>`** contra una subconsulta o contra algo que pueda ser nulo. Nos mordió
   cuatro veces.
4. **Una mutación nueva no puede escribirse sin su entrada de bitácora**: `worker/db/base.ts`
   retiró la capacidad, no pide disciplina. El vocabulario tiene **tres mitades acopladas** — el
   `CHECK` de la migración, la unión de `worker/contract.ts` y el `Record` de `src/bitacora.ts`.
5. **Montos en enteros de centavos.** Nunca coma flotante. La tajada 1 no tuvo ni uno; ésta es
   toda dinero.
6. **Nunca calcular el valor esperado de una prueba con la misma función que se prueba.** Es lo
   que dejó invisible seis tajadas el defecto de las fechas.
7. **Presentación responsiva** sin tamaños fijos, con mínimos y máximos, grid y flexbox.

## Las tres decisiones abiertas, y qué tarea bloquea cada una

De los cinco puntos sin decidir de `docs/diseno.md` §11, tres caen en esta tajada. **Ninguno
bloquea el arranque**, y cada uno está anclado a la tarea que no puede empezar sin él:

| Punto abierto | Bloquea | Puede esperar hasta |
|---|---|---|
| Formato y volumen del **corpus de cotizaciones previas** | T-8 (la costura con el modelo) | Antes de escribir el primer prompt |
| **A quién pertenece el plan de pagos** | T-11 (`cuota`) | Antes de la migración del dinero |
| Tratamiento del **ITBMS** | T-12 (totales con impuesto) | Antes de escribir una sola línea de aritmética de impuestos |

El del plan de pagos es el único que es **modelo de datos**, así que equivocarse cuesta una
migración. Los otros dos se pueden ir aclarando mientras se construye.

### El ITBMS, investigado el 25 de octubre de 2026 — supuesto, no verdad fiscal

Se investigó para destrabar T-12. **Esto no es asesoría tributaria y tiene que validarlo la
contadora del bufete antes de que una cotización salga con un impuesto calculado.**

Lo que se encontró:

1. **La tarifa general es 7%**, vigente desde el 1 de julio de 2010 por el artículo 76 de la Ley
   8 de 2010. Confirmado contra la [DGI](https://dgi.mef.gob.pa/itbms/Generalidades), que es
   fuente primaria.
2. **Los servicios profesionales —asesoría legal, contabilidad, ingeniería— están gravados al
   7%.** Fuentes secundarias coincidentes; la página de generalidades de la DGI **no** los nombra
   explícitamente, así que este punto está apoyado en terceros y no en fuente primaria.
3. **El reembolso de gastos no se grava.** También fuente secundaria. Es el punto que más
   necesita validación, porque es el que decide la aritmética.

**La aritmética que se deriva de eso, si la contadora lo confirma:**

```
total = Σ honorarios  +  ITBMS(Σ honorarios)  +  Σ gastos estimados
```

El ITBMS cae **sólo sobre los honorarios**. Los gastos estimados son plata de terceros que el
bufete adelanta y le cobra al cliente, y pasan sin impuesto.

**Y acá hay una confirmación que vale la pena anotar:** esa regla cae exactamente sobre la
separación que T-3 ya construyó. La clase `honorario|gasto_estimado` no se eligió pensando en
impuestos —se eligió porque el cliente lee las dos familias distinto— y resulta ser la misma
línea que divide lo gravado de lo que no. Cuando dos razones independientes piden el mismo corte,
el corte suele estar bien puesto.

**Lo que T-12 no puede hacer todavía:** ninguna cotización emitida puede llevar un total con
impuesto hasta que esto esté validado. Si se construye antes, que sea detrás de un interruptor
apagado, y que el snapshot de una emitida sin ITBMS siga siendo correcto para siempre — es un
hecho histórico y no se recalcula.

### El plan de pagos, planteado para decidirlo

El boceto de §6 pone `cuota.proceso_id`. §11 dice que falta decidir. Las opciones reales:

- **(a) Cuelga del proceso.** Un proceso sin cotización puede tener plan. Pero una cotización que
  genera dos procesos obliga a **partir en dos un plan que el cliente firmó entero**, y «50% a la
  firma» se vuelve ambiguo: ¿se cobra una vez o dos?
- **(b) Cuelga de la cotización.** El plan es del encargo, que es lo que se firmó. Pero un proceso
  sin cotización —cliente consolidado, trámite simple— se queda sin plan de pagos, y el usuario
  dijo explícitamente que esos existen.
- **(c) Cuelga de cualquiera de los dos, con `CHECK` de exclusividad.** Exactamente uno de
  `proceso_id` o `cotizacion_id`. **Es la recomendación**, por tres razones: es el mismo patrón
  que `cuota` ya usa dos veces para monto/porcentaje y vencimiento/hito; la cotización **ya es**
  el nivel de agrupación cuando existe, así que no hay que inventar ninguno; y cubre el proceso
  suelto sin un caso especial. El costo es que «¿cuánto debe este cliente?» une dos consultas —
  y el cliente es el ancestro común de las dos.
- **(d) Un nivel de agrupación nuevo por encima.** Conceptualmente prolijo y **descartado**:
  sería una entidad que el bufete no nombra, contra la regla que el propio usuario puso —«llamemos
  proceso a todo»— y vacía de sentido en el caso mayoritario, que es una cotización con un
  proceso.

---

## Tareas

Las dos primeras rebanadas no dependen de ninguna decisión abierta.

### R1 · La cotización a mano

- [x] **T-1 · El esquema de la cotización.** Migración con `cotizacion`, `cotizacion_modulo` y
      `cotizacion_linea`, con la misma disciplina que `0001`: `tenant_id` en todas, momentos
      con el `CHECK` de ida y vuelta por `strftime` usando `IS` y no `=`, vocabularios cerrados
      con `CHECK`, montos en centavos enteros. I-1 (`cliente_id NOT NULL`) va en la base.

      Los disparadores de coherencia de tenencia y de inmutabilidad de `tenant_id` de T-13 de la
      tajada anterior **tienen que extenderse a las tres tablas nuevas**. No son opcionales: una
      tabla nueva sin su disparador es exactamente el agujero que esa tarea cerró. ~~Y la
      verificación previa de la sección M-0 también.~~ — **esto era falso**, ver «Lo que T-1
      corrigió de este plan» abajo.

      *Criterio: por cada restricción, una prueba que demuestre que la base rechaza. Forecast ~450.*
      **Real: 530 líneas de migración y 1262 de pruebas, 118 pruebas nuevas.** El forecast se
      quedó corto por un factor de cuatro, y lo que lo explica es la auditoría en dos dimensiones
      del punto 2 de abajo: una prueba por cláusula y otra por operador, y son diez cláusulas.

- [x] **T-2 · La cotización en borrador y sus módulos de prosa.** El catálogo de tipos de módulo
      **como registro tipado en código**, no como configuración editable: agregar un tipo es un
      despliegue. Alta, edición, reordenamiento y borrado de módulos dentro de un borrador.
      *Forecast original ~400; real estimado ~1500.*

      **El plan tenía un hueco y esta tarea lo cierra.** Las tres tareas de R1 hablaban de «un
      borrador» y ninguna lo creaba: T-1 fue esquema puro, y no había una sola línea de API que
      insertara en `cotizacion`. Tal como estaba escrito, R1 terminaba sin que se pudiera escribir
      una cotización, que es el criterio 1 de aceptación de la tajada. El alta del borrador se
      pliega acá en vez de inventar una tarea que no sirve sola.

      Se parte en tres unidades de trabajo, una por commit:

      - [x] **A · La API del borrador.** Alta, listado, detalle y edición, más el registro de
            `cotizacion` en el vocabulario de bitácora.
      - [x] **B · Las pantallas del borrador.**
      - [x] **C · Los módulos de prosa**, las dos capas (C1 la API, C2 la pantalla).

      **Lo que C hereda de T-1 y no puede ignorar:** el índice único sobre
      `(cotizacion_id, orden)` impide reordenar incrementando en su lugar. El reordenamiento de
      etapas de la tajada 1 **no resuelve** ese problema, lo esquiva: `proceso_etapa.orden`
      deliberadamente no lleva índice único. C tiene que reescribir el tramo en una sola
      transacción —borrar e insertar, o pasar por un rango disjunto—. Está escrito en
      `migrations/0004_cotizaciones.sql`.

      **Y la otra mitad acoplada:** el `CHECK` del vocabulario de tipos de módulo en la migración
      y el registro tipado en código de C tienen que moverse juntos. Si se separan, el sistema
      rechaza un tipo que la pantalla ofrece.

- [x] **T-3 · Líneas de honorarios y gastos estimados.** La clase (`honorario|gasto_estimado`)
      separa las dos familias y la pantalla las muestra separadas y rotula el gasto como
      aproximado. **La aritmética es del sistema**: subtotales y total se derivan, no se guardan.
      *Forecast ~450.*

### R2 · El ciclo de vida

- [x] **T-4 · Emitir, y congelar.** `borrador → emitida`, con el snapshot escrito **en la misma
      transacción**. I-4 (una emitida no se edita) e I-5 (el snapshot se escribe una vez y no se
      reescribe) van en la base, con disparadores, no en el código. *Forecast ~400.*

- [x] **T-5 · Ganada, perdida, duplicada.** El resto del ciclo. Duplicar nace un borrador atado
      por `duplicada_de_id`; **la historia no se reescribe**. *Forecast ~300.*

      **La deuda que T-1 le dejó resultó estar medida mal, y T-5 la cerró mejor.** El ciclo
      de duplicación no era alcanzable por `INSERT` —lo frena el disparador de tenencia de
      `0004`, no la clave foránea— sino sólo por `UPDATE`. La guarda es la **inmutabilidad** de
      `duplicada_de_id`, que cierra ciclos de cualquier longitud. Ver «Una medición de este plan
      resultó falsa» abajo.

- [x] **T-6 · La salida imprimible.** HTML que se imprime desde el navegador, con hoja de
      impresión propia. Sin librería de PDF. DOCX queda para cuando alguien lo pida de verdad.
      *Forecast ~350.*

### R3 · Donde las dos mitades se tocan

- [x] **T-7 · De cotización ganada a procesos.** Una cotización ganada abre un proceso por cada
      línea que lleve `tipo_proceso_id`, sembrando su plan desde la plantilla igual que T-7 de la
      tajada anterior. **I-3 por fin es expresable** —el proceso nacido de una cotización comparte
      cliente con ella— y va a la base como disparador, no como validación.

      Es la tarea que cierra el flujo central del sistema y la más valiosa de la tajada.
      *Forecast ~450.*

### R4 · El generador

- [x] **T-8 · La costura con el modelo.** Una sola interfaz con una única operación de completado,
      proveedor por configuración, **salida validada contra esquema antes de tocar nada**. Nada
      del resto del sistema sabe que existe un LLM. Modelo por defecto `claude-opus-5`.
      *Bloqueada por la decisión del corpus. Forecast ~400.*

- [ ] **T-9 · Generar desde una descripción.** El abogado escribe el encargo en prosa y sale un
      borrador con sus módulos y sus líneas. Lo que el modelo devuelve se valida contra el
      catálogo tipado y **todo lo aritmético se recalcula del lado del sistema**. *Forecast ~450.*

### R5 · El dinero

- [ ] **T-10 · Gastos reales y comprobantes.** `movimiento_gasto` con R2 para el comprobante.
      **I-7: el saldo nunca se almacena, siempre se deriva** (`Σ anticipos − Σ gastos`). Las dos
      mecánicas del bufete —reembolso contra factura y anticipo con sobrante— salen de la misma
      tabla sin una sola rama condicional. *Forecast ~450.*

- [ ] **T-11 · El plan de pagos.** `cuota` como cronograma, nunca un enum de modalidades: un pago
      es una cuota, 50/50 son dos, mensual son N. Los dos `CHECK` de exclusividad —exactamente uno
      de `monto` o `porcentaje`, exactamente uno de `vence_en` o `hito`—. **Bloqueada por la
      decisión de a quién pertenece el plan.** *Forecast ~400.*

- [ ] **T-12 · Totales e impuesto.** **Bloqueada por la decisión del ITBMS**, y no se escribe una
      línea de aritmética de impuestos hasta verificar su tratamiento sobre honorarios frente a
      gastos reembolsables. *Forecast ~250.*

## Criterios de aceptación de la tajada

1. Se escribe una cotización a mano, con módulos y líneas, y se la ve como la va a ver el cliente.
2. Se emite, y a partir de ahí no se puede editar: hay que duplicar.
3. El snapshot de una emitida es idéntico seis meses después.
4. Una cotización ganada abre sus procesos, con el mismo cliente y con su plan de trabajo sembrado.
5. El abogado describe un encargo en prosa y sale un borrador razonable que después edita.
6. Los totales los calcula el sistema y nunca el modelo.
7. Los invariantes se prueban por rechazo, no por aceptación.

## Entrega

**Forecast:** ~4750 líneas autoradas. Excede con holgura el presupuesto de ~400 por rebanada, así
que se reparte igual que la tajada 1.

| Rebanada | Tareas | Forecast |
|---|---|---|
| R1 · La cotización a mano | T-1, T-2, T-3 | ~1300 |
| R2 · El ciclo de vida | T-4, T-5, T-6 | ~1050 |
| R3 · Cotización a procesos | T-7 | ~450 |
| R4 · El generador | T-8, T-9 | ~850 |
| R5 · El dinero | T-10, T-11, T-12 | ~1100 |

**Estrategia de entrega:** `ask-on-risk`.
**Estrategia de encadenado:** `stacked-to-main`, la misma de la tajada 1 y por la misma razón: son
dos personas, nadie más depende de `main`, y cada rebanada sirve por sí sola.

## Verificación

Los cinco comandos de siempre, y **se juzgan por código de salida, nunca por la pantalla**:

```
pnpm typecheck
pnpm test
pnpm lint
pnpm build
pnpm test:e2e
```

Punto de partida: `ffafb61`, **841 pruebas unitarias y 145 de punta a punta**, los cinco en 0.

## Progreso

| Tarea | Commit | Checks observados | Revisión |
|---|---|---|---|
| T-1 · El esquema de la cotización | `9383fc1` | `typecheck` 0, `test` 0 (959), `lint` 0, `build` 0 | aprobada, lineaje `review-a1dbf4335a5f0866`, riesgo medio, lente de fiabilidad, sin hallazgos bloqueantes |
| T-2 A · La API del borrador | `976525d`, `ba16c23`, `9470d3f` | `typecheck` 0, `test` 0 (1022), `lint` 0, `build` 0 | aprobada ×2, lineajes `review-0d20d7f0bd3bad1e` y `review-6dd79b52500aa28a`, sin bloqueantes; `9470d3f` quedó `under_budget` |
| T-2 B · Las pantallas del borrador | `9cd32ef`, `89a71a4` | `typecheck` 0, `test` 0 (1079), `lint` 0, `build` 0, `test:e2e` 0 (186) | aprobada, lineaje `review-1e5f1e3ce2f54aa7`, sin bloqueantes; `89a71a4` quedó `under_budget` |
| T-2 C1 · La API de los módulos | `b16491a`, `61ebb41` | `typecheck` 0, `test` 0 (1132), `lint` 0, `build` 0 | aprobada, lineaje `review-9963052a67c4ea2d`, sin bloqueantes |
| T-2 C2 · El editor de módulos | `af086c7`, `b84be59` | `typecheck` 0, `test` 0 (1169), `lint` 0, `build` 0, `test:e2e` 0 (212) | aprobada, lineaje `review-ae94e1f1c8ca1465`, sin bloqueantes |
| T-3 A · La API de las líneas | `cde7871` | `typecheck` 0, `test` 0 (1248), `lint` 0, `build` 0 | RDD apagada; **dejó `test:e2e` en rojo**, ver abajo |
| T-3 B · La pantalla de las líneas | `3ec3fd1` | `typecheck` 0, `test` 0 (1358), `lint` 0, `build` 0, `test:e2e` 0 (237) | RDD apagada |
| T-4 A · Emitir y congelar | `5d12016` | `typecheck` 0, `test` 0 (1427), `lint` 0, `build` 0, `test:e2e` 0 (237) | RDD apagada |
| T-5 A · Ganar, perder, duplicar | `91b234d` | `typecheck` 0, `test` 0 (1504), `lint` 0, `build` 0, `test:e2e` 0 (237) | RDD apagada |
| T-4 y T-5 B · El ciclo en pantalla | `ceba06a` | `typecheck` 0, `test` 0 (1533), `lint` 0, `build` 0, `test:e2e` 0 (266) | RDD apagada |
| T-6 · La salida imprimible | `ed0c4a0` | `typecheck` 0, `test` 0 (1575), `lint` 0, `build` 0, `test:e2e` 0 (290) | RDD apagada |
| T-7 · De ganada a procesos | `8607370` | `typecheck` 0, `test` 0 (1610), `lint` 0, `build` 0, `test:e2e` 0 (290) | RDD apagada |
| T-8 · La costura con el modelo | `a78ae1d` | `typecheck` 0, `test` 0 (1710), `lint` 0, `build` 0, `test:e2e` 0 (290) | RDD apagada |

### Lo que T-1 corrigió de este plan

1. **La verificación previa M-0 no se extiende, y no es opcional omitirla.** El plan pedía
   extenderla a las tablas nuevas. Es código muerto: M-0 existe en `0003` porque esa migración
   puso disparadores sobre tablas nacidas en `0001`, que podían llegar ya con filas cruzadas.
   En `0004` las tres tablas nacen en el mismo archivo transaccional que sus disparadores. Y hay
   un segundo motivo que lo cierra: la verificación **ni siquiera se puede escribir**, porque
   tendría que consultar una tabla que en ese punto del archivo todavía no existe.
   **Regla para el próximo:** la verificación previa hace falta cuando la guarda cae sobre filas
   que ya podían existir, nunca cuando la tabla y su guarda nacen juntas.

2. **La cobertura de `IS NOT` se mide por arista, no por tabla.** Una mutación que cambia las dos
   líneas de una arista y mata una prueba da por cubierto un operador que lo está en una arista
   de once. Las once cláusulas de tenencia se auditaron en **dos dimensiones** —existe la
   cláusula, y está cubierto su operador— y faltaban tres cláusulas y ocho operadores.

3. **`INTEGER` en SQLite es afinidad, no tipo.** Un `1500.5` entra tal cual en una columna
   `INTEGER`. La restricción de centavos enteros sólo es real con `typeof(monto) = 'integer'`.

4. **La guarda `NEW.col IS NOT NULL` va también en las columnas `NOT NULL`**, y ahí está por el
   segundo motivo: evitar que el disparador tape el error verdadero de la columna ausente, porque
   `BEFORE INSERT` corre antes que `NOT NULL`. Lo que sobra en las `NOT NULL` es la guarda dentro
   de la consulta de M-0, que sólo lee. Son dos cosas distintas y el plan las había confundido.

### Lo que T-2 A dejó escrito, y le toca a quien siga

1. **El bufete está en Panamá, UTC−5, y el servidor calculaba el día en UTC.** Desde las 19:00
   locales el día UTC ya es mañana: elegir la fecha de hoy devolvía `422 vencimiento_pasado`.
   `HORAS_DE_PANAMA` vive ahora **una sola vez**, en `worker/db/momentos.ts`, que es un módulo
   del Worker **sin dependencias** y por eso puede cruzar la frontera: el Worker no puede
   importar de `src/` sin dar vuelta la flecha del proyecto. Ese archivo tiene como regla
   permanente **no importar nada**, porque un `import` ahí se lo lleva el bundle del navegador.
   **La unidad B:** el `min` del `<input type="date">` se calcula con el día de Panamá, y tiene
   que ser `min(hoy, vencimiento guardado)` — si no, un borrador viejo no puede mostrar su
   propio valor en el control.

2. **`src/api/peticiones.ts` tiene un `CONFLICTOS` que no es exhaustivo**, y
   `cotizacion_no_es_borrador` no tiene entrada. Hoy caería en el texto de reserva, que habla de
   un borrado que nadie pidió. No rompe nada porque ninguna pantalla llama todavía a esa ruta.
   **Es de la unidad B.**

3. **El residuo de la carrera perdida.** Cuando el `UPDATE` guardado pierde la carrera contra una
   emisión, la entrada de bitácora viaja igual en el mismo `batch` —así lo exige `mutar`, y es lo
   que impide escribir sin registrar—, así que queda un «editó» de una edición que no ocurrió.
   Es un hecho de más en el registro contra un documento emitido corrompido en silencio: de los
   dos males, el menor. Está probado que son exactamente dos filas. Cerrarlo del todo pide que
   `mutar` admita un registro condicional, y eso es `worker/db/base.ts`.

4. **Un D1 local ya migrado no re-aplica `0002`.** Quien haya corrido la aplicación en local
   antes del 24 de octubre de 2026 tiene el `CHECK` de `entidad` viejo y recibe 500 en toda alta
   de cotización. Se arregla con `rm -rf .wrangler/state/v3/d1`. Caduca con el primer despliegue,
   igual que el permiso para editar esa migración.

### Deuda que T-2 B encontró en la tajada 1

1. **`e2e/procesos.spec.ts:1338` es inestable y además puede pasar sin probar nada.** Usa
   `expect.poll` con el tope por defecto de 5 s para cubrir la cadena entera *clic en «Avanzar
   a …» → `POST` de avance → respuesta → re-pedido de `/bitacora`*, sin sincronizar el paso del
   medio; con seis trabajadores en paralelo la cadena no entra y falla con `Received: 0`. Y el
   `page.on("request")` se registra **después** del `goto`, así que si el pedido inicial de
   bitácora aterriza antes de engancharse el escucha, la prueba pasa **sin haber medido el
   re-pedido**. Los dos modos de falla, en la misma prueba.

2. **`esSeccionActiva` en `src/layout/Esqueleto.tsx` no tiene ninguna prueba.** Se vio al escribir
   el invariante de navegación. No se movió el archivo para dárselas: probar la constante en vez
   del menú dibujado habría sido más débil que la prueba de punta a punta que se escribió.

3. **El `estado` que viaja en el 409 no llega a la pantalla.** `Resultado.conflicto` conserva
   `motivo`, `bloqueo` y `duplicado`, y ninguno es ése, así que la frase genérica no puede nombrar
   en qué quedó la cotización y manda a recargar igual. Mitigado donde sí se sabe: el formulario
   de edición lee el estado antes de dibujarse. Cerrarlo pide un tercer campo en `Resultado`,
   contra el comentario que explica por qué son dos.

### Una regla de método que faltaba, y el commit que la costó

**Todo cambio en `src/mensajes.ts` o `src/bitacora.ts` exige el suite de punta a punta completo,
aunque la unidad no toque una sola pantalla.** Son texto que las pantallas afirman.

Sale de un error concreto. A T-3 A se le dijo «no corras `test:e2e`, esta unidad no toca
pantallas». Cambió la frase de `orden_incompleto` —de «los módulos de esta cotización» a «lo que
tiene esta cotización», porque las líneas pasaron a compartir el motivo— y la prueba de punta a
punta de módulos seguía afirmando el texto viejo. **`cde7871` quedó con el suite en rojo durante
un commit entero**, y lo encontró el escritor siguiente, no la verificación.

El conteo de ese commit no mentía: declaraba cuatro comandos y los cuatro estaban en 0. Lo que
faltaba era el quinto, y faltaba porque alguien decidió que no aplicaba.

### Tres lecciones de prueba que esta tajada encontró, cada vez con otra piel

1. **Una aserción que reintenta no puede demostrar un «nunca».** `toHaveCount(0)` tolera la
   ventana transitoria que se quiere prohibir; para un «nunca» va `.count()`, que lee el instante.
2. **Un doble de servidor que devuelve lo mismo que se envió no distingue nada.** No separa una
   pantalla que redibuja la respuesta de una que conserva lo tecleado.
3. **Dos guardas que resuelven lo mismo por caminos distintos se anulan como garantía:** quitar
   cualquiera no mata ninguna prueba. Hay que medir las combinaciones y dejar exactamente una.
   Es la variante de la lección de T-2 C2, donde en cambio eran cuatro declaraciones que no
   hacían nada.

Y una de método: **una mutación sobreviviente obliga a revisar primero si la mutación fue la
correcta**, no a concluir que falta cobertura. Mover una llamada en vez de borrarla puede no
cambiar el comportamiento.

### Una medición de este plan resultó falsa, y la lección vale más que la corrección

El plan decía, **como hecho medido**, que la cadena de duplicación admite ciclos: que
`INSERT … id='a', duplicada_de_id='a'` entra porque SQLite valida la clave foránea después de
insertar la fila.

**No entra.** Esa sonda corrió sobre una tabla de dos columnas con sólo la clave foránea. El
esquema real tiene delante `cotizacion_tenencia_coherente_al_insertar`, de `0004`: en
`BEFORE INSERT` la fila todavía no existe, la subconsulta de tenant devuelve `NULL`, y
`NULL IS NOT 't1'` aborta. Verificado también con `PRAGMA foreign_keys = OFF`.

> **Una sonda sobre una reproducción simplificada mide la reproducción, no el sistema.**

La corrección mejoró el resultado. Generalizado: **por `INSERT` no se puede cerrar un ciclo de
ninguna longitud**, porque la fila apuntada tiene que existir ya y el padre es siempre más viejo
que el hijo. El agujero era entero del `UPDATE`, así que la guarda correcta no es un `CHECK`
—redundante de un lado, insuficiente del otro— sino la **inmutabilidad** de `duplicada_de_id`.
Un grafo que sólo crece por las hojas y nunca se reescribe es un bosque: recorrerlo termina
siempre, y no hace falta tope de profundidad ni detección de ciclos.

### Tres redes de tipos que no atrapaban nada

T-8 encontró, midiendo sobre los archivos reales, que el idioma

```ts
type AccionesSinDuenio = Exclude<AccionDeBitacora, …>;
export const TODAS_LAS_ACCIONES_TIENEN_DUENIO: AccionesSinDuenio[] = [];
```

**no detecta nada**, porque `const x: T[] = []` compila para cualquier `T`: un arreglo vacío es
asignable a todo. Afecta a tres declaraciones —la del vocabulario de bitácora, que viene de la
tajada 1, y las de los catálogos de módulos y de clases de línea— que llevaban ocho tareas
pasando por redes.

Verificar esto costó tres intentos, y los dos primeros son la lección:

| Mutación | Qué pasó |
|---|---|
| Sacar un verbo de `ACCIONES_POR_ENTIDAD` | murió el typecheck, **por otra razón**: el literal dejaba de ser asignable a la unión |
| Agregar un verbo huérfano a la unión | murió, **pero el error venía del `Record` de frases** de `src/bitacora.ts` |
| Darle **frase pero no dueño** | `typecheck` **exit 0**. Ahí quedó demostrado |

O sea que lo cubierto lo cubría otra cosa, y lo que la red prometía estaba descubierto. La forma
que sí falla es `type DebeSerVacio<T extends never> = T`.

> **Una mutación que muere no prueba la guarda que uno cree, hasta verificar por qué murió.**

### Deuda registrada, no cerrada

**Los quince disparadores de inmutabilidad tienen su `IS NOT` sin cobertura** —los diez de `0003`
(T-13) y los cinco de `0004`—. Mutar `IS NOT` → `<>` en cualquiera de ellos no mata ninguna
prueba. **No es un agujero de integridad**, y se midió: el único camino que distingue los dos
operadores es poner la columna en NULL, y ahí aborta `NOT NULL`; la fila queda intacta en las
cuatro combinaciones. Lo único que cambia es cuál de los dos mensajes de error llega.

Se decidió **no** escribir quince pruebas de mensaje y dejarlo documentado en la migración, con
la distinción que de verdad importa: en los disparadores de **tenencia** el `IS NOT` **es** la
guarda, y ahí sí está cubierto arista por arista; en los de **inmutabilidad** sólo elige el
mensaje.

## Próximo paso

**T-1, el esquema de la cotización.** No depende de ninguna decisión abierta.

Y en paralelo, lo que destraba el resto: el **corpus de cotizaciones previas** (para T-8), la
decisión del **plan de pagos** (para T-11, recomendación **(c)** arriba) y el **ITBMS** (para
T-12).

---

## T-13 · El proceso cuelga de la cotización, no de la línea

**Decidido el 26 de octubre de 2026, por el usuario, mirando la aplicación andando.**
Corrige un error de modelo de T-7.

### El error

T-7 abre **un proceso por cada línea con `tipo_proceso_id`**, y `proceso.cotizacion_linea_id`
apunta a la línea. Eso **impone desde la estructura** una decisión que es del bufete.

Palabras del usuario, que son el criterio:

> «Los procesos no deben ir ligados a la línea sino a la cotización. Las líneas pueden compartir
> un mismo proceso o simplemente no hacerlo. Por ejemplo crear una sociedad anónima puede ser
> sólo crearla, o crearla y registrarla: desde el sistema serían 2 procesos, pero para el bufete
> es lo mismo, es un solo proceso que luego tiene un paso extra. Es algo ambiguo pero que debe
> quedar a criterio del bufete.»

**La línea es una unidad de facturación; el proceso es una unidad de trabajo.** No tienen por qué
ser lo mismo. Constituir y registrar se cobran aparte porque se tarifan aparte; que sean uno o
dos expedientes no se sigue de eso.

### Qué cambia

- `proceso.cotizacion_linea_id` → **`proceso.cotizacion_id`**. Migración.
- I-3 se simplifica: hoy va por la línea hasta la cotización; pasa a ser directo.
- La apertura automática deja de ser una derivación y pasa a ser **una propuesta**.

### La decisión del usuario: opción (b), proponer y confirmar

Al marcar ganada, el sistema **propone** los procesos que infiere de los trámites de las líneas y
los muestra **antes de crear nada**. El bufete saca uno, fusiona dos, cambia un tipo o agrega
otro. Recién entonces nacen.

Se descartó la opción (a) —abrir y que el bufete ajuste después— por el propio ejemplo de la
sociedad anónima: el sistema infiere dos y el bufete quiere uno, así que nacería un expediente
que hay que borrar, y borrar un proceso arrastra bitácora. **La ambigüedad se resuelve antes de
que haya algo que deshacer.**

### Lo que ya existe y no hay que construir

Los pasos de un proceso **ya son editables**: `PUT /api/procesos/{id}/etapas` reemplaza el plan
entero. «Un proceso con un paso extra» es algo que el bufete ya puede armar hoy. Lo que faltaba
era que el sistema no le impusiera la partición antes.

### Alcance medido

Una migración y siete archivos. **No se toca** nada de cotizaciones, módulos, líneas, el
congelado, el generador ni el dinero.

### El caso que lo destapó

`COT-2026-0007`, generada con la IA: nueve líneas, **ninguna con trámite**, cero procesos
abiertos. Y el modelo **no se equivocó** — el catálogo del bufete ofrecía cuatro trámites y
ninguno era «divorcio», así que dejó las líneas sin trámite en vez de forzar uno que mintiera.
El defecto no era del modelo ni del código: era que el sistema no deja abrir un proceso cuyo
trámite todavía no existía cuando se cotizó.
