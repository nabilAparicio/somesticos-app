# crm-procesos — Tajada 1: CRM usable

**Creado:** 22 de octubre de 2026
**Estado:** en curso — T-1 a T-7 cerradas
**Diseño de referencia:** `docs/diseno.md` (fuente de verdad)

---

## Objetivo

Que el bufete pueda abrir la aplicación y contestar, sin ayuda de nadie, **en qué va cada proceso
de cada cliente y qué falta**. Al cerrar esta tajada el sistema se usa de verdad, aunque todavía
no exista ninguna cotización.

## Problema

Hoy no hay forma rápida de responder esa pregunta. El seguimiento vive en la cabeza de dos
personas y en conversaciones sueltas, y los cabos sueltos — un documento que falta, un trámite que
hay que pedir — se pierden al avanzar de etapa.

## Por qué esta tajada va primero

El generador con IA es la parte más vistosa y la más fácil de empezar, y por eso es la trampa.
Si esta mitad funciona y la IA nunca llega, el bufete igual ganó. Si llega la IA y esto no existe,
hay documentos sueltos y el cuello de botella intacto — que es exactamente el error de
`app-agentes-legales`, repetido en chico.

## Alcance autorizado

**Entra:** esqueleto Workers + D1, acceso de las dos personas, base visual responsiva, clientes
con tipo, áreas y tipos de proceso con sus plantillas de etapas editables, procesos creados
directamente con plan de trabajo editable paso a paso, guardar un plan ajustado como plantilla,
notas ancladas a etapa, pendientes con responsable, bitácora.

**No entra:** cotizaciones, módulos, generador con IA, gastos, cuotas, R2. Todo eso es tajada 2 en
adelante y no se adelanta "ya que estamos".

## Restricciones

- Las ocho invariantes de `docs/diseno.md` §5 se implementan como restricciones de base, no como
  validación de aplicación.
- `tenant_id` en toda tabla desde la primera migración, con una sola fila. Sin maquinaria
  multi-tenant.
- Autoría por `usuario_id`, nunca nombre en texto.
- Capa de presentación según `docs/diseno.md` §9: sin tamaños fijos, grid y flexbox, consultas de
  contenedor.
- Vocabulario: **proceso**, nunca caso.

## Puntos abiertos y por qué no bloquean

Los cinco puntos sin decidir de `docs/diseno.md` §11 se revisaron contra estas tareas. Ninguno
bloquea:

| Punto | Por qué no bloquea |
|---|---|
| Beneficiario vs. pagador | Sería una columna nullable sobre tablas sin datos. Migración trivial. |
| Corpus de cotizaciones previas | Tajada 3. |
| Propiedad del plan de pagos | Tajada 2. |
| ITBMS | Tajada 2. No se escribe aritmética de impuestos acá. |
| Moneda | El campo existe; el valor es USD hasta que alguien diga otra cosa. |

---

## Verificación

Runner: **Vitest 4 con `@cloudflare/vitest-plugin`** (el paquete se llamaba
`@cloudflare/vitest-pool-workers` hasta la versión 1; verificado en la documentación de Cloudflare
el 22-oct-2026). Las pruebas corren dentro del runtime de Workers, con acceso directo al binding
de D1. Las migraciones se cargan en las pruebas con `readD1Migrations()` y `applyD1Migrations()`.

Comandos de cada tarea:

```
pnpm typecheck
pnpm test
pnpm lint
```

`pnpm test:e2e` se suma a partir de T-4, que es la tarea que instala Playwright. Los tres
comandos de arriba existen desde T-1: un plan que exige un comando que ninguna tarea provee es
un plan que falla en la primera tarea.

**Política test-first:** las invariantes y las reglas de dominio tienen prueba en ROJO antes de la
implementación. Una invariante se prueba demostrando que la base **rechaza** la escritura
inválida, no que la acepta cuando es válida.

**Revisión:** receipt-driven development está **encendida** (`on`, decidida por global, verificado
el 22-oct-2026). Cada commit de unidad de trabajo se evalúa con `gentle-ai review assess` y se
registra acá el resultado: concedida, declinada, pasiva, bajo presupuesto, ya revisada o no
disponible.

---

## Tareas

Cada tarea cierra con al menos un commit de unidad de trabajo en la rama de la funcionalidad,
con sus pruebas y documentación al lado, en Conventional Commits. El identificador es estable: no
se renumera.

- [x] **T-1 · Esqueleto Workers + D1.** `wrangler.jsonc` con binding de D1, Worker de entrada,
      SPA con Vite, configuración de Vitest con `cloudflareTest()`, y un endpoint de salud con su
      prueba. **Incluye el linter y el typecheck**: los tres comandos de §Verificación existen y
      corren desde esta tarea, o el resto del plan exige algo que nadie instaló.
      *Criterio: `pnpm typecheck`, `pnpm test` y `pnpm lint` corren en verde.
      Ruta: delegada (múltiples archivos de configuración interdependientes). Forecast ~300.*

- [x] **T-2 · Esquema inicial y migración.** Tablas `tenant`, `usuario`, `tipo_cliente`,
      `cliente`, `area`, `tipo_proceso`, `etapa_plantilla`, `proceso`, `proceso_etapa`, `nota`,
      `pendiente`, `bitacora`. Invariantes I-2, I-6 y I-8 como restricciones. `CHECK`
      en vez de `ENUM`, montos en centavos enteros.
      **I-3 no entra acá:** exige que el cliente de un proceso coincida con el de su cotización,
      y en esta tajada no existe `cotizacion`. Se implementa y se prueba en la tajada 2, junto
      con la tabla que la hace expresable.
      *Criterio: existe una prueba por invariante implementada que demuestra el rechazo.
      Ruta: delegada. Forecast ~400.*

- [x] **T-3 · Acceso e identidad.** Cloudflare Access delante de la aplicación; resolución de la
      identidad de Access contra la tabla `usuario`. Sin registro propio, sin contraseñas.
      *Criterio: una petición sin identidad válida no llega al dominio. Ruta: delegada.
      Forecast ~200.*

- [x] **T-4 · Base visual responsiva.** Tokens, esqueleto de página en grid, componentes de
      layout, consultas de contenedor, tope de ancho en `ch` para prosa, contenedor de tabla con
      scroll propio. Sin un solo ancho fijo que no sea de un ícono.
      *Criterio: la página no scrollea en horizontal en ningún ancho entre 320px y 2560px,
      verificado con una prueba de Playwright que recorre un juego de viewports y afirma
      `scrollWidth <= clientWidth` en el documento. El criterio sin runner no es un criterio.
      Esta tarea instala Playwright y agrega `pnpm test:e2e`.
      Ruta: delegada. Forecast ~350.*

- [x] **T-5 · Clientes.** Alta mínima (nombre y un contacto), tipo desde catálogo, par genérico
      `documento_tipo`/`documento_numero`, `representante_legal` según tipo, listado, detalle,
      edición.
      *Criterio: se puede dar de alta un prospecto con nombre y teléfono solamente.
      Ruta: delegada. Forecast ~400.*

- [x] **T-6 · Áreas, tipos de proceso y plantillas.** CRUD de `area`, de `tipo_proceso` dentro de
      su área, y de la `etapa_plantilla` ordenada. Las plantillas las crea, edita y borra el
      bufete; no hay plantillas de fábrica intocables. La pantalla de edición dice explícitamente
      que editar la plantilla no altera los procesos ya abiertos.
      *Ruta: delegada. Forecast ~450.*

- [x] **T-7 · Procesos y su plan de trabajo.** Crear directo (`origen = directo`), listar por
      cliente y global, detalle, avanzar de etapa. Las etapas se **copian** de la plantilla al
      crear el proceso. Sobre el proceso ya creado: agregar, quitar y reordenar etapas. Quitar
      solo aplica a etapas pendientes; una etapa alcanzada no se borra. La vista separa lo
      cumplido de lo que falta, porque "lo que viene" es la mitad del valor.
      *Criterios: cambiar una plantilla no altera ningún proceso ya abierto; un proceso con
      plantilla aplicada admite pasos nuevos sin tocar la plantilla; e intentar borrar una etapa
      ya alcanzada se RECHAZA, con prueba que lo demuestre. Ruta: delegada. Forecast ~600.*

- [x] **T-11 · Guardar como plantilla.** Desde un proceso cuyo plan se ajustó a mano, crear una
      plantilla nueva con esos pasos, o actualizar una existente. Copia de `proceso_etapa` hacia
      `etapa_plantilla`.
      *Ruta: **delegada**, corregida sobre la estimación original de inline. Con pruebas de rechazo,
      contrapesos que releen y mutaciones, toca worker, front y dos archivos de prueba: el
      disparador de escritor se cumple. Forecast real ~400.*

- [x] **T-8 · Notas.** Crear ancladas a la etapa vigente, con autor y fecha. Línea de tiempo del
      proceso. Inmutables.
      *Ruta: delegada. Forecast ~250.*

- [x] **T-9 · Pendientes.** Crear con autor y responsable, cerrar con registro de quién y cuándo.
      Bloque de pendientes abiertos, contado, en la cabecera del proceso. No bloquean el avance de
      etapa.
      *Criterio: un pendiente abierto en la etapa 1 sigue visible y abierto en la etapa 4 sin que
      nadie lo copie. Ruta: delegada. Forecast ~300.*

- [ ] **T-10 · Bitácora.** Registro de acciones con autor, entidad y momento.
      *Ruta: delegada. Forecast ~200.*

---

## Criterios de aceptación de la tajada

1. Las dos personas entran con su identidad y todo lo que escriben queda firmado.
2. Se da de alta un cliente con datos mínimos y se le abre un proceso sin cotización previa.
3. El proceso avanza de etapa, la línea de tiempo muestra qué pasó en cada una, y la vista
   separa lo cumplido de lo que falta.
4. A un proceso con plantilla aplicada se le agregan y quitan pasos sin tocar la plantilla, y un
   plan ajustado a mano se guarda como plantilla nueva.
5. Un pendiente abierto sobrevive los cambios de etapa y se ve sin buscarlo.
6. La interfaz se usa sin scroll horizontal entre 320px y 2560px.
7. Las invariantes se prueban por rechazo, no por aceptación.

---

## Entrega

**Forecast:** ~3600 líneas autoradas (altas más bajas, archivos generados excluidos).

Eso excede con holgura el presupuesto de entrega de ~400 líneas por rebanada, así que la tajada se
reparte. Límites propuestos:

| Rebanada | Tareas | Forecast |
|---|---|---|
| R1 · Fundación | T-1, T-2 | ~700 |
| R2 · Entrada y piel | T-3, T-4 | ~550 |
| R3 · Clientes | T-5 | ~400 |
| R4 · Áreas, tipos y plantillas | T-6 | ~450 |
| R5 · Procesos y plan de trabajo | T-7, T-11 | ~750 |
| R6 · Notas, pendientes y bitácora | T-8, T-9, T-10 | ~750 |

**Estrategia de entrega:** `ask-on-risk` (por defecto).
**Estrategia de encadenado:** `stacked-to-main`, decidida el 22-oct-2026. Cada rebanada entra a
`main` cuando está lista, en su propia rama. No se encadenan rebanadas sobre una rama larga: son
dos personas, nadie más depende de `main`, y cada rebanada sirve por sí sola. El costo de
rebasar en cascada solo se justifica con un equipo al que no conviene moverle el piso.

Empujar al remoto, abrir pull requests y hacer merge siguen siendo decisiones del usuario.

---

## Progreso

Rama: `feat/r1-fundacion`. Ninguna tarea de código empezada.

| Tarea | Commit | Checks observados | Revisión |
|---|---|---|---|
| — (encuadre: diseño y plan) | `a3997c7` | n/a, sin código | Concedida y acusada. Lineaje `review-5c192d4319c7f42e`, riesgo medio, lente `review-reliability`, **aprobada**, autoridad quemada. 7 hallazgos informativos, no bloqueantes. |
| T-1 | `b4edd18` + `d4b7559` | `pnpm typecheck` verde · `pnpm test` **5/5 en verde** (vitest 4.1.12) · `pnpm lint` verde. Verificación del orquestador: los tres recorridos de nuevo. | Concedida y acusada. Lineaje `review-9959b28b722a5401`, riesgo medio, lente `review-reliability`, **aprobada**, autoridad quemada. 7 hallazgos informativos; 6 corregidos, 1 diferido con razón. |
| T-9 | (este commit) | Rojo observado: 40 fallas de aserción real contra el Worker y el archivo de UI sin cargar. Final: los cinco en 0 · **test 567/567** · **e2e 112/112**. Verificación del orquestador: los cinco códigos de salida más la reproducción propia de la mutación de la propiedad 2 (4 muertas). | Pendiente de evaluar |
| T-8 | `de03ace` | Rojo observado: 38 fallas y el archivo de UI sin cargar. Final: los cinco en 0 · **test 476/476** · **e2e 104/104**. Verificación del orquestador: los cinco códigos de salida más la reproducción propia de la mutación de la guarda de notas (5 muertas, con el error de FK crudo). | Pendiente de evaluar |
| T-11 | `84a3ce9` | Rojo observado: 24 fallas de API y el archivo de UI sin cargar. Final: los cinco en 0 · **test 410/410** · **e2e 98/98**. Verificación del orquestador: los cinco códigos de salida más la reproducción propia de la mutación del plan vacío (2 muertas). | Pendiente de evaluar |
| T-7 | `bff83c5` | Rojo observado: 42 fallas de API y el archivo de UI sin cargar. Final: los cinco en 0 · **test 372/372** · **e2e 94/94**. Verificación del orquestador: los cinco códigos de salida más la reproducción propia de la mutación de la guarda de lo alcanzado (4 muertas). | Pendiente de evaluar |
| T-6 | `326901b` | Rojo observado: 44 fallas de API, el archivo de UI sin cargar y 25 e2e en rojo. Final: los cinco en 0 · **test 287/287** · **e2e 68/68**. Verificación del orquestador: los cinco códigos de salida más la reproducción propia de la mutación de la guarda de borrado (5 muertas, con el error de FK crudo). | Pendiente de evaluar |
| T-5 | `c9f51fc` | Rojo observado: 27 de 35 fallas en la API y el archivo de UI sin cargar. Final: los cinco comandos en 0 · **test 189/189** · **e2e 43/43**. Verificación del orquestador: los cinco códigos de salida más la reproducción propia de la mutación de tenencia (5 muertas). | Pendiente de evaluar |
| T-4 | `3893ccb` | Rojo observado: 10 fallas de e2e sin hoja de estilos. Final: typecheck 0 · test 0 (122/122) · lint 0 · build 0 · **e2e 0 (22/22)**. Verificación del orquestador: los cinco códigos de salida, más la reproducción propia de la mutación B. | **Escalada sin veredicto.** Lineaje `review-9705305831e89372`, riesgo alto, cuatro lentes. Ver abajo. |
| T-3 | `4a9118f` | Rojo observado: 26 fallas por `manejar is not a function`. Final: typecheck 0 · test **122/122**, exit 0 · lint 0. Verificación del orquestador: los tres códigos de salida, inspección propia del bundle, y pruebas de mutación sobre la compuerta de artefacto y sobre la cobertura de `origenRemoto`. | **Aprobada y acusada** tras TRES rondas de corrección. Lineajes `review-4dbfcc0616c91689` → `review-6a5f14d2c564cb45` → `review-155e9995d4c99a7e`, autoridad quemada. 4 hallazgos CRÍTICOS, los 4 reales, los 4 corregidos. |
| T-2 | `eb08588` + `5486347` | Rojo observado primero: 59 fallas por `no such table`. Después: `pnpm typecheck` verde · `pnpm test` **64/64 en verde** · `pnpm lint` verde. Verificación del orquestador: los tres recorridos, más una prueba de mutación propia que confirmó que las pruebas de rechazo muerden. | Concedida y acusada. Lineaje `review-3469d152112ea53a`, riesgo medio, lente `review-reliability`, **aprobada**, autoridad quemada. 6 hallazgos informativos, los 6 reales, los 6 corregidos. |

**T-2** quedó con `migrations/0001_esquema_inicial.sql` (12 tablas, índices, dos triggers de
inmutabilidad de `nota`, semilla de un tenant) y 59 pruebas de rechazo en `test/esquema.spec.ts`.
Rojo observado antes de implementar: 59 fallas por `no such table`. El escritor además corrió una
prueba de mutación borrando restricciones a propósito, y el orquestador repitió una por su cuenta
—aflojar los `CHECK` de fecha hizo fallar exactamente las 4 pruebas de fecha y ninguna otra—,
que es la evidencia de que las pruebas de rechazo muerden y no pasan en el vacío.

Decisiones de T-2 que no estaban en el diseño y quedan asentadas:

- El `CHECK` de formato ISO no se puede escribir con `GLOB`: D1 rechaza el patrón completo con
  `LIKE or GLOB pattern too complex`. Se usa la ida y vuelta `col IS strftime('%Y-%m-%dT%H:%M:%fZ',
  col)`, con `IS` y no `=` **porque un `CHECK` que evalúa a `NULL` pasa en SQLite** y con `=`
  cualquier basura habría entrado.
- `proceso.estado` cerrado en `('abierto','cerrado')`; el diseño nombraba la columna sin enumerar.
- `pendiente.creado_en` agregado: sin él no hay cómo ordenar pendientes por antigüedad.
- `nota.proceso_etapa_id` y `pendiente.proceso_etapa_id` son `NOT NULL`: una nota sin etapa no es
  una nota de este modelo.
- Sin `ON DELETE CASCADE` en ninguna FK. La política de borrado es comportamiento de T-6 y T-7.
- Sin índice único sobre `orden`: T-7 reordena etapas y en SQLite un `UPDATE orden = orden + 1`
  viola un único transitoriamente, fila por fila.
- `UNIQUE (tenant_id, email)` en `usuario`, que T-3 va a usar para resolver la identidad de Access.
- Dos pruebas de frontera verifican que las cinco tablas de la tajada 2 **no** existen y que
  `proceso` no tiene `cotizacion_linea_id`, para que el límite no se erosione sin que nadie lo note.

Señalado por el escritor para más adelante, no hecho: un `CHECK` de que el cliente tenga al menos
un medio de contacto (es regla del formulario de alta, T-5), y un trigger que verifique que
`nota.proceso_etapa_id` pertenezca al mismo proceso que la nota (candidato para T-8).

Hallazgos de la revisión de T-2 y qué se hizo con cada uno:

| Hallazgo | Resolución |
|---|---|
| El control positivo era vacuo: `resolves.toBeTruthy()` solo probaba que no tiró | Corregido: ahora afirma `meta.changes === 1` y relee la fila. |
| `env` se importaba de dos módulos distintos (`cloudflare:workers` y `cloudflare:test`) | Unificado en `cloudflare:workers`; de `cloudflare:test` solo viene `applyD1Migrations`. |
| El plan decía que T-2 implementaba I-1, y I-1 no es expresable sin `cotizacion` | Corregido en el plan. Era un error del documento, no del código. |
| Las pruebas de fecha solo rechazaban errores evidentes | **El mejor hallazgo.** Se agregaron 5 fechas *reales* en forma no canónica: sin milisegundos, con desfase `+00:00`, con espacio en vez de `T`, sin zona, y el mismo instante en otra zona. Las cinco se rechazan. |
| El `CHECK` de cierre de `pendiente` no tenía contrapeso | Agregada la prueba de que un cierre completo sí entra: sin ella, un `CHECK` que rechazara *todo* cierre habría pasado desapercibido. |
| `UNIQUE (tenant_id, email)` sin prueba de rechazo | Agregada. |

Durante esa corrección el orquestador casi reporta verde un `typecheck` que fallaba, por filtrar
la salida en vez de mirar el código de salida. Queda como regla: **los comandos de verificación
se juzgan por su código de salida**, no por lo que se ve en pantalla.

Primer intento de revisión de T-1 (lineaje `review-74dd041a1c7aed53`) murió en
`lens_context_budget_exceeded`: 19.659 líneas cambiadas no entraban en el presupuesto de la
lente. No se creó autoridad, así que no hubo nada que abandonar. Se resolvió sacando el archivo
generado del control de versiones (ver arriba), lo que bajó el candidato a 3.402 líneas y el
riesgo de alto a medio.

Hallazgos de la revisión de T-1 y qué se hizo con cada uno:

| Hallazgo | Resolución |
|---|---|
| La SPA ignoraba el status de la respuesta | Corregido: 200 y 503 son respuestas válidas con cuerpo; cualquier otra es falla de transporte y no se parsea como reporte. |
| La rama `degraded`/503 no tenía prueba | Corregido: prueba con inyección de falla en el binding. |
| La rama 404 no tenía prueba | Corregido. |
| Aserción de timestamp débil, falta la de cabecera | Corregido: ida y vuelta por `toISOString` y cercanía a ahora, más `cache-control`. |
| El handler se invocaba fuera de banda | Corregido salvo en la prueba de falla inyectada, donde es la única vía; queda comentado por qué. |
| `typecheck` dependía de un generado no versionado | Corregido: `typecheck` y `build` generan los tipos ellos mismos. El hallazgo apuntaba a una decisión tomada minutos antes y tenía razón. |
| `src/` sin cobertura de pruebas | **Diferido a T-4** con razón: la SPA actual es un andamio de tres líneas sin estilos, y T-4 instala Playwright. |

Versiones fijadas en T-1: `vitest` 4.1.12, `@cloudflare/vitest-plugin` 1.4.7, `wrangler` 4.152.0,
`vite` 8.3.5, `react` 19.3.1, `typescript` 5.9.3, `eslint` 10.13.0.

**`worker/worker-configuration.d.ts` no se versiona.** Son 16.268 líneas que genera
`wrangler types`. Se regenera byte por byte idéntico (verificado), así que no aporta ninguna
historia revisable, y en cambio hacía que el candidato de T-1 excediera el presupuesto de
contexto de la lente: la revisión se volvía imposible, no difícil. Está en `.gitignore` y lo
produce un `postinstall`, así que un clon limpio lo tiene antes del primer `typecheck`.

**T-3** puso la puerta de Access delante de todo `/api/` menos salud. Lo que quedó asentado:

- La vía de desarrollo local **no es una variable de entorno con una guarda**: `import.meta.env.DEV`
  es una constante de compilación, así que en el artefacto desplegable la función queda reducida a
  `return null;` y la lectura de `ACCESO_DEV_EMAIL` **no existe**. Verificado sobre
  `dist/app_cotizador/index.js` por el escritor y de nuevo, por separado, por el orquestador. No hay
  secreto que pueda encender código que no está en el bundle.
- **503 para configuración ausente o certificados caídos, 403 para todo lo demás.** Los dos cierran
  la puerta; separarlos es para el operador, porque un 403 uniforme haría que un despliegue a medias
  se viera igual que un intruso.
- **El 404 va después de la puerta.** Una ruta inexistente responde 403 hasta que el llamante prueba
  quién es, para que la API no se pueda enumerar desde afuera.
- Correos comparados en minúsculas; `usuario.email` debe guardarse así. Queda pendiente un
  `CHECK (email = lower(email))` para la tarea que traiga administración de usuarios.
- Sin caché propio de claves: se usa el de la red (`cf.cacheTtl: 300`) y no un `Map` en estado
  global del Worker, que sobrevive entre peticiones de distintos usuarios y después nadie sabe
  invalidar.
- Prueba de mutación sobre 6 invariantes de seguridad (no verificar firma, ignorar `aud`, ignorar
  `exp`, ignorar `activo = 0`, no filtrar por `tenant_id`, aceptar cualquier `alg`): las 6 detectadas.

Los cuatro CRÍTICOS de T-3 y qué se hizo con cada uno:

| Hallazgo | Resolución |
|---|---|
| La vía de desarrollo se consultaba antes de todo, y **ninguna prueba ejercía la forma de producción**: la suite probaba que la vía funciona y nunca que está ausente | Pasó a dependencia inyectable, se movió detrás de la guarda de configuración, y hay pruebas que corren el camino desplegado. |
| El helper `entorno()` esparcía el `env` real, **heredando el `ACCESO_DEV_EMAIL` de `.dev.vars`** — el archivo que este mismo plan manda crear. En una máquina con ese archivo, casi toda la batería de rechazos observaba otro motivo. La suite dependía de estado local sin versionar. | `entorno()` anula la variable explícitamente, con una prueba que lo vigila. |
| La compuerta de artefacto buscaba `env.ACCESO_DEV_EMAIL`, atada a un identificador que el empaquetador renombra; una desestructuración la evadía. Y **nada probaba que la compuerta fallara alguna vez**. | Busca el nombre del binding, que no se puede renombrar. Detección en módulo puro, con cinco formas de regresión probadas y dos casos limpios. |
| `origenRemoto`, el default de producción de la única dependencia no inyectada, **no tenía una sola línea probada**: cada petición desplegada pasaba por ahí. | Seam de pedido y 11 pruebas: la URL (incluido el dominio con barra final, que es como viene del tablero), el caché de red, el filtro de JWK y siete formas de falla. |

Nota de proceso: cada corrección cambia el candidato, lo que obliga a enmendar el commit y ejecutar
`gentle-ai review recover --disposition=scope_changed` hacia un lineaje sucesor que vuelve a
revisar. El validador dirigido falló una vez con `provider_capture_result_refused` —defecto del
proveedor, no del código: `mutation_outcome: not_started`— y se recuperó relanzando el mismo slot
reofrecido, que es la vía documentada.

**T-4** dejó la base visual y, con ella, el hallazgo más instructivo de la tajada.

El escritor verificó su propia prueba por mutación y descubrió que **era vacua**. Al quitarle el
`min(…, 100%)` de adentro del `minmax()` de la rejilla —la regla que evita que una columna fuerce
scroll horizontal— las 22 pruebas seguían pasando. La causa: el mínimo más grande del banco era
`18rem` = 288px, y la columna de contenido a 320px mide exactamente 288px. **La regla defensiva
nunca llegaba a actuar.** Agregó una rejilla de mínimo `24rem`, que a 320px no entra, y una
aserción que exige que el banco contenga una rejilla con mínimo ≥22rem. Con eso la mutación mata
3 pruebas. El orquestador la reprodujo por separado: 19 de 22, exit 1.

**Una regla defensiva solo está probada si el contenido la fuerza a actuar.** Es la misma lección
que vienen dando las tres revisiones de T-3, en otra forma.

Decisiones de T-4 que quedan asentadas:

- **El banco de pruebas se defiende solo.** Hay un test que verifica que siga siendo hostil: ≥9
  columnas, celdas de ≥60 caracteres, un token sin espacios de ≥60, ≥9 tarjetas y una rejilla con
  mínimo ≥22rem. El día que alguien acorte el texto "para que se vea mejor", el criterio no se
  vuelve vacuo en silencio.
- **Nada de `overflow-x: hidden` en `html`/`body`.** Haría pasar el criterio escondiendo el
  defecto y dejando contenido inalcanzable. Está escrito como comentario en `base.css` para que
  nadie lo "arregle" así.
- **Un solo punto de cambio en todo el sistema** (48rem), y es consulta de contenedor, no
  `@media`. Los viewports 767/768/769 se prueban a ambos lados del umbral.
- **Sin router.** Dos rutas, ninguna con parámetros: `location.pathname` más un `switch`, con
  `popstate` para que el botón de atrás funcione. Traer una librería ahora es elegir su modelo de
  datos antes de saber qué pantallas van a existir.
- El contenedor de consulta del armazón vive en `#root` y no en `.esqueleto`, porque un elemento
  no puede consultarse a sí mismo.

Diferido con razón: **la lógica de `Inicio` sigue sin prueba unitaria.** T-4 cubrió el layout de
punta a punta, que era su alcance. La cobertura de `src/` que T-1 había diferido acá pasa a T-5,
que es cuando aparece la primera pantalla con lógica propia.

### Agujero abierto por T-5, CERRADO en T-6: no había cómo poblar `tipo_cliente`

La migración no siembra filas y no existe pantalla de administración del catálogo, así que **en
una instalación limpia el desplegable de tipo de cliente sale vacío para siempre**. La API de
lectura está; falta el CRUD. No es un defecto de T-5: excede su alcance y habría empujado la
rebanada por encima de su presupuesto. **Entra en T-6**, junto a las áreas y los tipos de proceso,
que son exactamente el mismo problema de catálogo.

### T-9: las tres propiedades del pendiente, probadas por mutación

La razón de ser del sistema, y cada propiedad con prueba que muere al romperla:

| Propiedad | Mutación | Muertas |
|---|---|---|
| Sobrevive el cambio de etapa sin que nadie lo copie | filtrar la lista por etapa no alcanzada | **4** |
| No bloquea el avance de etapa | que avanzar rechace si hay pendientes abiertos | **3** |
| La etapa de nacimiento no se quita | la guarda de conteo devuelve vacío | **2**, con FK crudo |

La primera la reprodujo el orquestador por separado. **Filtrar la lista por proceso y no por
etapa es toda la mecánica** de que el pendiente sobreviva sin copias — una línea de SQL sostiene
la propiedad que el bufete más necesita.

### T-9 decidió: un pendiente cerrado no se reabre, y la etapa de nacimiento no se quita

**(a) No se reabre.** El esquema tiene un solo par `cerrado_en`/`cerrado_por`: reabrir es ponerlos
en nulo, o sea borrar la firma de quién cerró y cuándo. Es lo mismo que el proyecto no hace con
`alcanzada_en` ni con una nota.

Y el argumento de producto es mejor que el técnico: el caso real —"cerré *falta el documento X* y
el documento era otro"— **no se dice reabriendo**, se dice con un pendiente nuevo. Reabrir dejaría
el texto viejo afirmando algo falso; un pendiente nuevo nombra el documento correcto y el cerrado
queda como registro de que se persiguió el equivocado. Vive como **ausencia del camino** —no hay
ruta, no hay función, no hay botón—, no como una guarda aflojable, y la pantalla lo avisa antes
de apretar. El segundo cierre no es un no-op: es 409.

**(b) La etapa de nacimiento no se quita, esté el pendiente abierto o cerrado.** No trasladó el
argumento de T-8 —correctamente, porque una nota *pertenece* a su etapa y un pendiente solo
*nació* ahí—. El que vale es otro: `proceso_etapa_id` significa "dónde nació", y quitarlo deja dos
salidas, huérfano (imposible) o reanclado (falsificar el nacimiento). **Lo que se protege es el
nacimiento, no la vigencia**, y por eso vale también para los cerrados.

### Tres detalles de T-9 que vale no perder

- **Huso de Panamá, no del servidor.** "Vencido" se decide por **día** con UTC−5 fijo: un
  pendiente que vence el 22 no aparece vencido a las siete de la tarde del 22. Y `diaLegible`
  formatea en UTC, porque convertir un `AAAA-MM-DD` con `new Date` y formatearlo con huso local
  lo corre un día hacia atrás.
- **Lo vencido no se marca solo con color.** La paleta no tiene rojo y agregarlo por un estado
  sería decidir media identidad visual de paso. Se usa el fondo de acento existente más borde y
  negrita, y sobre todo **la marca acompaña una frase**: "Venció el …" en vez de "Vence el …".
  Un estado que solo existe como color no existe para todo el mundo.
- **La etapa de nacimiento no se elige**, a diferencia de la nota. Un pendiente nace cuando
  alguien lo escribe; elegir otra sería afirmar que el cabo suelto apareció antes de que nadie
  lo viera.

### T-8 decidió: la nota se ancla a la etapa vigente, y quien escribe puede cambiarla

Por defecto va a **la primera pendiente en el orden del plan**, que es la misma definición que
T-7 usa para "lo que viene". En un proceso recién abierto eso es su primer paso, que es
exactamente donde el trabajo está pasando cuando alguien escribe. "Anclada a la etapa donde
ocurrió" significa, mientras se escribe, la etapa **en curso** — no la última cumplida, que es
donde el trabajo ya no está.

Dos colas resueltas:

- **Sin pendientes** (todo cumplido): la última alcanzada.
- **Sin ninguna etapa**: se rechaza con 422 `proceso_sin_etapas`. El servidor **no inventa un
  paso**, porque inventarlo metería en el plan de trabajo algo que nadie decidió, y el plan es lo
  que el abogado lee para saber qué falta.

Y quien escribe **puede elegir otra etapa del mismo proceso**: una nota se escribe a veces días
después del hecho y, como es inmutable, el momento de escribirla es la única oportunidad de
anclarla donde de verdad ocurrió.

### El encargo de T-7, cumplido

T-7 dejó abierto a propósito el agujero de borrar una etapa pendiente con notas, con dueño
asignado. T-8 lo tapó con la misma disciplina: cuenta los dependientes y rechaza con 422
`etapa_con_notas_no_se_quita` diciendo **cuántas** notas lo impiden. Al aflojar la guarda mueren
5 pruebas y mueren con `FOREIGN KEY constraint failed` crudo — reproducido por el orquestador.

`FallaDeValidacion` ganó un `cuantos?: number` para que el mensaje diga cuántas son sin que la
pantalla tenga que ir a contarlas.

### La trampa de T-4 volvió, y esta vez agarró al escritor

T-8 puso en el banco de e2e un token "sin espacios" para forzar el ajuste de línea… **con
guiones**. Quitó el `overflow-wrap` del texto de la nota y **las 104 pruebas siguieron pasando**:
el guion es un punto de corte natural, el navegador partía el token solo, y la regla defensiva
nunca llegaba a actuar.

Con un token sin guiones apareció el segundo hallazgo: la regla local **seguía siendo inmatable**,
porque el `break-word` global del `body` ya hacía el trabajo. Quitando las dos mueren 4 pruebas
responsivas.

La conclusión que aplicó es la correcta y vale escribirla: **quitó la regla local redundante** en
vez de dejarla. Una regla que ninguna prueba puede matar no es una defensa, es decoración.

### Nota para T-9 y T-10 sobre la limpieza entre pruebas

El disparador `nota_no_se_borra` **no tiene condición**: una nota no se borra nunca, tampoco desde
la limpieza de una prueba. Y con las llaves foráneas en `NO ACTION`, con una nota viva tampoco se
borran su etapa, su proceso, su cliente, su autor ni su tenant. Es la consecuencia buscada que
anuncia el comentario de la migración, comprobada de frente: las pruebas de notas **no pueden
hacer un solo `DELETE`** y se aíslan al revés, con identificadores nuevos por prueba.

No es una cuarta migración: el comportamiento es el correcto. Pero conviene saberlo antes de
escribir la limpieza de T-9 o T-10 y estrellarse contra él.

### T-11 decidió: guardar como tipo nuevo NO reasigna el proceso de origen

El proceso sigue apuntando a su tipo viejo. El argumento es el que importa:

1. Reasignarlo rompería **la promesa que la misma pantalla acaba de hacer** —"guardar no modifica
   ningún proceso abierto"— justo en el caso donde nadie lo esperaría.
2. `tipo_proceso_id` es cómo el listado, los filtros y la futura bitácora clasifican trabajo **ya
   ocurrido**. Mover el proceso a un tipo recién inventado reescribe lo que el listado dice del
   pasado.
3. Si "actualizar" nunca reasigna y "nuevo" sí, las dos mitades de la misma función se comportan
   distinto, y esa asimetría es la que hace que alguien guarde esperando una cosa y obtenga otra.

Queda dicho en pantalla, probado por relectura y documentado en el código. Reasignar un proceso
puede existir más adelante, pero como acción propia y visible.

### Tercera migración señalada, esta vez por T-11

`proceso.tipo_proceso_id` es una llave foránea **que no incluye el tenant**, así que una fila
cruzada entre bufetes es expresable en la base: un proceso de un tenant apuntando al tipo de
otro. Hoy lo sostiene el código. La prueba de rechazo correspondiente tuvo que **insertar esa
fila cruzada a mano** para poder ejercitarse, lo cual es la confirmación de que la base la
permite.

Se suma a las dos que ya había señalado T-6. Las tres son llaves foráneas compuestas o triggers,
o sea una migración, y conviene hacerlas juntas:

1. Unicidad de nombre en `area`, `tipo_cliente` y `tipo_proceso` por tenant.
2. Que `etapa_plantilla.tenant_id` coincida con el de su `tipo_proceso`.
3. Que `proceso.tipo_proceso_id` y `proceso.cliente_id` pertenezcan al mismo tenant que el proceso.

### T-7 decidió: el avance de etapa es de una sola dirección

No se puede desandar una etapa alcanzada. La razón no es rigidez: **si `alcanzada_en` pudiera
volver a nulo, quitar una etapa cumplida sería legal en dos pasos** —desandar y después quitar— y
la guarda tendría una puerta trasera. La regla dejaría de ser una regla. Además `alcanzada_en` es
el registro de un hecho, igual que una nota.

Está cerrado **por construcción y no por omisión**: el `UPDATE` del plan no menciona
`alcanzada_en`. Hay una prueba que manda `alcanzadaEn: null` explícito en el JSON y verifica
releyendo que la marca sobrevive. Contrapartida asumida: un clic accidental es irreversible, así
que el botón nombra la etapa concreta y la pantalla dice que no se puede deshacer.

Frontera declarada: **renombrar una etapa cumplida sí se permite.** Los nombres son texto de cara
al cliente y corregir una errata no borra el hecho ni deja notas huérfanas.

### La guarda resultó ser más amplia de lo que pedía el plan

El plan decía "no se quita una etapa alcanzada". T-7 encontró que eso no alcanza: **lo alcanzado
tampoco se mueve de lugar.** Sin esa parte, un paso pendiente podía insertarse delante de algo ya
cumplido, y la vista "cumplido / lo que falta" dejaba de poder dibujarse como dos listas.

Y tiene contrapeso explícito —reordenar, agregar y quitar **entre pendientes** sí funciona— para
que una guarda que congelara el plan entero no pasara desapercibida como si fuera correcta.

### Tres mutaciones, y una lección de proceso

Guarda de lo alcanzado: mueren 4, y mueren mostrando el plan ya mutilado, o sea que el borrado
**se consumaba**. Filtro de tenencia: mueren 14, ninguna de catálogos ni de clientes. Copia de la
guarda en el navegador: mueren 3, **solo** las de UI.

La de proceso: `lint` dio 1 en la primera pasada completa por un carácter invisible en un
comentario de e2e. La pasada anterior había corrido antes de que ese archivo existiera. Es
exactamente el caso que la regla del código de salida existe para atrapar.

### La política de borrado, que T-2 había delegado

T-2 dejó las llaves foráneas en `NO ACTION` y escribió que la política de borrado la definían T-6
y T-7. Quedó así: **se borra solo lo que no tiene dependientes; lo demás se da de baja.**

El `DELETE` cuenta los dependientes antes y, si hay, contesta **409** con la entidad y cuántos de
cada cosa cuelgan, que la pantalla convierte en "No se puede borrar «Migración»: tiene 2 tipos de
proceso. Se puede dar de baja…". Nunca sale un 500 ni SQL crudo.

Y hay una decisión fina adentro que vale subrayar: **no se atrapa el error de llave foránea para
disfrazarlo de 409.** Era lo tentador y habría arruinado la prueba — con ese `catch`, aflojar la
guarda de conteo no rompería nada y la guarda quedaría sin verificar. La guarda es el conteo, y
se la ve fallar: al aflojarla mueren 5 pruebas y lo hacen con `FOREIGN KEY constraint failed`
crudo, que es exactamente lo que la tarea pedía evitar. Reproducido por el orquestador.

El 409 tampoco es una pared sin puerta: hay prueba de que vaciar la plantilla desbloquea el
borrado del tipo. Y dar de baja es coherente con T-5: no seleccionable, pero sigue siendo válido
para lo ya guardado.

### Dos migraciones que T-6 señala y no hizo

Las reporta en vez de hacerlas, porque tocar el esquema estaba fuera de su superficie:

1. **Falta unicidad de nombre**: `(tenant_id, nombre)` en `area` y `tipo_cliente`, y
   `(tenant_id, area_id, nombre)` en `tipo_proceso`. Hoy nada impide dos áreas "Familia". No la
   puso en la aplicación a propósito: una regla sin respaldo en la base es justo lo que §5
   critica, porque el primer script de importación se la salta.
2. **Nada obliga a que `etapa_plantilla.tenant_id` coincida con el de su `tipo_proceso`.** Hoy lo
   sostiene el código, porque toda escritura pasa por una función que verifica el tipo antes. Un
   `CHECK` no lo expresa; pide un trigger, el mismo candidato que el de `nota.proceso_etapa_id`
   que ya había señalado T-2.

### Trampa de Playwright encontrada en T-6

`page.route("**/api/**")` **también intercepta los módulos que sirve Vite en desarrollo** cuando
el proyecto tiene un directorio `src/api/`. Devolverle JSON en lugar de un módulo deja la página
en blanco **sin un solo error en consola**. Fue la causa de las 25 fallas iniciales de e2e. Queda
resuelto con un predicado sobre `url.pathname` y un comentario que explica la trampa.

### Decisiones de T-5 que quedan asentadas

- **`PUT`, no `PATCH`.** El formulario manda siempre el juego completo. Con `PATCH` hay que
  distinguir "no mandé el campo" de "lo quiero vacío", que es la ambigüedad por la que vaciar un
  dato nunca termina de funcionar.
- **404 y no 403 para recursos de otro tenant**, y en el `PUT` **la existencia se comprueba antes
  de validar el cuerpo**: si no, un cuerpo inválido contra un id ajeno contestaría 422, y ese 422
  ya confirma que el id existe.
- **Lo válido y lo seleccionable son cosas distintas.** Un `tipo_cliente_id` es válido si existe
  en el tenant, sin exigir `activo = 1`; si se exigiera, dar de baja un tipo dejaría sin poder
  guardar a todos sus clientes y editar un teléfono fallaría con un error incomprensible. Qué se
  puede *elegir* lo decide la pantalla; qué es *válido* lo decide el servidor.
- **Teléfono: al menos un dígito, sin validar formato.** Los números llegan de mil formas y un
  falso rechazo cuesta el prospecto. Lo que sí atrapa es "no sé" escrito en el campo, que deja un
  cliente incontactable con apariencia de contactable.
- **El catálogo que no carga no bloquea el alta.** El tipo es opcional; bloquear por él
  convertiría un campo prescindible en requisito.
- **Dos copias de la validación, declaradas como tales**: la del navegador avisa, la del servidor
  autoriza. La mutación 3 comprueba que cada copia tiene cobertura propia — aflojar la del
  navegador mata exactamente una prueba, la de UI.
- `representante_legal` quedó opcional siempre: `tipo_cliente` es un catálogo de etiquetas sin
  ninguna marca que distinga una persona de una entidad. Exigirlo por tipo pide una columna nueva,
  o sea una migración.

Tres pruebas de mutación, todas revertidas y verificadas: aflojar el contacto obligatorio mata 3;
romper el filtro de tenencia mata 5; aflojar la validación del navegador mata 1. Ninguna mató
pruebas ajenas.

También quedó sin registrar en `bitacora` el alta y la edición de clientes, a propósito: T-10
cablea el registro en un solo lugar, y esparcirlo ahora obligaría a deshacerlo.

### La revisión de T-4 escaló y quedó sin veredicto

Primera revisión de cuatro lentes del proyecto (`risk`, `resilience`, `readability`,
`reliability`). Las cuatro se admitieron. El resultado fue `state: escalated` y, al consultar la
continuación, un `stop` con `native_stop_required` **sin transición ofrecida y sin exponer qué
escaló**.

`gentle-ai review inspect-authority` reporta el almacén sano: `complete: true`, `valid: true`, un
borde de recuperación válido, cero anomalías, cero diagnósticos de entrada y `sanctioned_exits`
vacío. No hay autoridad corrupta que reparar; sencillamente no hay camino de vuelta ni forma de
leer los hallazgos.

Consecuencias, declaradas para que nadie las descubra después:

- **El código de T-4 no está en duda por esto.** Los cinco comandos pasan por código de salida y
  la mutación de la rejilla se reprodujo de forma independiente. Una revisión nunca autorizó ni
  bloqueó la entrega: eso siempre fue política ordinaria del repositorio.
- **T-4 queda sin recibo de revisión.** No se finge uno. Si alguna vez hace falta, se pide una
  revisión nueva sobre un candidato nuevo.
- Se consultó al usuario si reportar el aparente defecto del proveedor. Eligió **continuar sin
  reportar**, así que no se tocó GitHub. Tampoco se ejecutó la invocación de rechazo del
  proveedor: el contrato manda fallar cerrado cuando el contexto de continuación es ambiguo, y
  acá lo era, porque ese candidato ya había pasado el consentimiento.
- Error propio que conviene no repetir: las cuatro lentes deben lanzarse **concurrentes y en el
  orden del proveedor**. El primer intento perdió la cuarta por un bucle mal escrito y hubo que
  relanzarla sola, bastante después. Se desconoce si el escalonamiento influyó en el escalado.

### Pasos de tablero pendientes de un humano

Access no se configura desde acá. Falta, en Cloudflare Zero Trust: crear la aplicación self-hosted
sobre el dominio desplegado, agregarle una política *Allow* con los correos de las dos personas,
copiar el AUD tag y el dominio del team a `ACCESO_TEAM_DOMAIN` y `ACCESO_AUD` en `wrangler.jsonc`,
e **insertar las filas en `usuario` con esos mismos correos en minúsculas**: sin fila no entra
nadie, aunque Access lo apruebe. Para desarrollo local, un `.dev.vars` con `ACCESO_DEV_EMAIL`.

### Cabos sueltos conocidos

- **`database_id` en `wrangler.jsonc` es un placeholder** (`00000000-…`). No hay base D1
  provisionada; Miniflare lo ignora en local y las pruebas pasan igual. Hay que reemplazarlo por
  el identificador real antes del primer despliegue, y mientras tanto nada que dependa de D1
  remota funciona.

Los siete hallazgos de esa revisión se verificaron uno por uno, resultaron todos reales y se
corrigieron en el commit siguiente: I-3 no expresable en esta tajada, I-8 sin `tenant_id` en las
tablas hijas, criterio responsivo sin runner, `cuota` sin `CHECK` de exclusividad, regla de etapa
alcanzada sin prueba de rechazo, `pnpm lint` sin tarea que lo provea, y este mismo "próximo paso"
contradiciendo una decisión ya tomada.

## Próximo paso

T-10: bitácora. La última de la tajada.
