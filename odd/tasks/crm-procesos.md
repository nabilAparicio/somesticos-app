# crm-procesos — Tajada 1: CRM usable

**Creado:** 22 de octubre de 2026
**Estado:** en curso — T-1 y T-2 cerradas
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

- [ ] **T-4 · Base visual responsiva.** Tokens, esqueleto de página en grid, componentes de
      layout, consultas de contenedor, tope de ancho en `ch` para prosa, contenedor de tabla con
      scroll propio. Sin un solo ancho fijo que no sea de un ícono.
      *Criterio: la página no scrollea en horizontal en ningún ancho entre 320px y 2560px,
      verificado con una prueba de Playwright que recorre un juego de viewports y afirma
      `scrollWidth <= clientWidth` en el documento. El criterio sin runner no es un criterio.
      Esta tarea instala Playwright y agrega `pnpm test:e2e`.
      Ruta: delegada. Forecast ~350.*

- [ ] **T-5 · Clientes.** Alta mínima (nombre y un contacto), tipo desde catálogo, par genérico
      `documento_tipo`/`documento_numero`, `representante_legal` según tipo, listado, detalle,
      edición.
      *Criterio: se puede dar de alta un prospecto con nombre y teléfono solamente.
      Ruta: delegada. Forecast ~400.*

- [ ] **T-6 · Áreas, tipos de proceso y plantillas.** CRUD de `area`, de `tipo_proceso` dentro de
      su área, y de la `etapa_plantilla` ordenada. Las plantillas las crea, edita y borra el
      bufete; no hay plantillas de fábrica intocables. La pantalla de edición dice explícitamente
      que editar la plantilla no altera los procesos ya abiertos.
      *Ruta: delegada. Forecast ~450.*

- [ ] **T-7 · Procesos y su plan de trabajo.** Crear directo (`origen = directo`), listar por
      cliente y global, detalle, avanzar de etapa. Las etapas se **copian** de la plantilla al
      crear el proceso. Sobre el proceso ya creado: agregar, quitar y reordenar etapas. Quitar
      solo aplica a etapas pendientes; una etapa alcanzada no se borra. La vista separa lo
      cumplido de lo que falta, porque "lo que viene" es la mitad del valor.
      *Criterios: cambiar una plantilla no altera ningún proceso ya abierto; un proceso con
      plantilla aplicada admite pasos nuevos sin tocar la plantilla; e intentar borrar una etapa
      ya alcanzada se RECHAZA, con prueba que lo demuestre. Ruta: delegada. Forecast ~600.*

- [ ] **T-11 · Guardar como plantilla.** Desde un proceso cuyo plan se ajustó a mano, crear una
      plantilla nueva con esos pasos, o actualizar una existente. Copia de `proceso_etapa` hacia
      `etapa_plantilla`.
      *Ruta: inline (un camino mecánico sobre tablas que T-6 y T-7 ya dejaron listas).
      Forecast ~150.*

- [ ] **T-8 · Notas.** Crear ancladas a la etapa vigente, con autor y fecha. Línea de tiempo del
      proceso. Inmutables.
      *Ruta: delegada. Forecast ~250.*

- [ ] **T-9 · Pendientes.** Crear con autor y responsable, cerrar con registro de quién y cuándo.
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
| T-3 | (este commit) | Rojo observado: 26 fallas por `manejar is not a function`. Después: typecheck 0 · test **98/98**, exit 0 · lint 0. Verificación del orquestador: los tres códigos de salida, más inspección propia del bundle construido. | Pendiente de evaluar |
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

T-4: base visual responsiva, con la prueba de Playwright que recorre viewports.
