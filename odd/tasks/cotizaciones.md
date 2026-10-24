# cotizaciones — Tajada 2: el generador de propuestas

**Creado:** 24 de octubre de 2026
**Estado:** R1 en curso, T-1 cerrada. La tajada 1 está construida y empujada; falta desplegarla
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

- [ ] **T-2 · Módulos de prosa.** El catálogo de tipos de módulo **como registro tipado en
      código**, no como configuración editable: agregar un tipo es un despliegue. Alta, edición,
      reordenamiento y borrado de módulos dentro de un borrador. *Forecast ~400.*

- [ ] **T-3 · Líneas de honorarios y gastos estimados.** La clase (`honorario|gasto_estimado`)
      separa las dos familias y la pantalla las muestra separadas y rotula el gasto como
      aproximado. **La aritmética es del sistema**: subtotales y total se derivan, no se guardan.
      *Forecast ~450.*

### R2 · El ciclo de vida

- [ ] **T-4 · Emitir, y congelar.** `borrador → emitida`, con el snapshot escrito **en la misma
      transacción**. I-4 (una emitida no se edita) e I-5 (el snapshot se escribe una vez y no se
      reescribe) van en la base, con disparadores, no en el código. *Forecast ~400.*

- [ ] **T-5 · Ganada, perdida, duplicada.** El resto del ciclo. Duplicar nace un borrador atado
      por `duplicada_de_id`; **la historia no se reescribe**. *Forecast ~300.*

      **Hereda de T-1 un agujero que T-1 no cerró a propósito: la cadena de duplicación admite
      ciclos.** La llave foránea de `duplicada_de_id` no impide que una cotización se declare
      duplicada de sí misma, ni que dos se apunten entre sí. Medido en una sonda `sqlite3`, no
      razonado: `INSERT … id='a', duplicada_de_id='a'` **entra** —SQLite valida la clave foránea
      después de insertar la fila, que es justamente lo que hace posible el patrón
      autorreferencial—, y `a → b → a` por dos `UPDATE` también **entra**.

      No es un agujero de tenencia ni de dinero: es de recorrido. Cualquier pantalla que suba por
      la cadena buscando el original —y T-5 va a tener una— gira para siempre. **La decisión de
      cómo cerrarlo es de T-5**, porque depende de si la cadena se recorre entera o un solo salto:
      un `CHECK (duplicada_de_id IS NOT id)` tapa el caso de uno, pero no el ciclo de dos, que
      necesita un disparador o un tope de profundidad en el recorrido.

- [ ] **T-6 · La salida imprimible.** HTML que se imprime desde el navegador, con hoja de
      impresión propia. Sin librería de PDF. DOCX queda para cuando alguien lo pida de verdad.
      *Forecast ~350.*

### R3 · Donde las dos mitades se tocan

- [ ] **T-7 · De cotización ganada a procesos.** Una cotización ganada abre un proceso por cada
      línea que lleve `tipo_proceso_id`, sembrando su plan desde la plantilla igual que T-7 de la
      tajada anterior. **I-3 por fin es expresable** —el proceso nacido de una cotización comparte
      cliente con ella— y va a la base como disparador, no como validación.

      Es la tarea que cierra el flujo central del sistema y la más valiosa de la tajada.
      *Forecast ~450.*

### R4 · El generador

- [ ] **T-8 · La costura con el modelo.** Una sola interfaz con una única operación de completado,
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
