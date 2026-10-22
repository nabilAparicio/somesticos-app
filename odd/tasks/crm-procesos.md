# crm-procesos — Tajada 1: CRM usable

**Creado:** 22 de octubre de 2026
**Estado:** sin empezar
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

- [ ] **T-1 · Esqueleto Workers + D1.** `wrangler.jsonc` con binding de D1, Worker de entrada,
      SPA con Vite, configuración de Vitest con `cloudflareTest()`, y un endpoint de salud con su
      prueba. **Incluye el linter y el typecheck**: los tres comandos de §Verificación existen y
      corren desde esta tarea, o el resto del plan exige algo que nadie instaló.
      *Criterio: `pnpm typecheck`, `pnpm test` y `pnpm lint` corren en verde.
      Ruta: delegada (múltiples archivos de configuración interdependientes). Forecast ~300.*

- [ ] **T-2 · Esquema inicial y migración.** Tablas `tenant`, `usuario`, `tipo_cliente`,
      `cliente`, `area`, `tipo_proceso`, `etapa_plantilla`, `proceso`, `proceso_etapa`, `nota`,
      `pendiente`, `bitacora`. Invariantes I-1, I-2, I-6 y I-8 como restricciones. `CHECK`
      en vez de `ENUM`, montos en centavos enteros.
      **I-3 no entra acá:** exige que el cliente de un proceso coincida con el de su cotización,
      y en esta tajada no existe `cotizacion`. Se implementa y se prueba en la tajada 2, junto
      con la tabla que la hace expresable.
      *Criterio: existe una prueba por invariante implementada que demuestra el rechazo.
      Ruta: delegada. Forecast ~400.*

- [ ] **T-3 · Acceso e identidad.** Cloudflare Access delante de la aplicación; resolución de la
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
| T-1 | — | — | — |

Los siete hallazgos de esa revisión se verificaron uno por uno, resultaron todos reales y se
corrigieron en el commit siguiente: I-3 no expresable en esta tajada, I-8 sin `tenant_id` en las
tablas hijas, criterio responsivo sin runner, `cuota` sin `CHECK` de exclusividad, regla de etapa
alcanzada sin prueba de rechazo, `pnpm lint` sin tarea que lo provea, y este mismo "próximo paso"
contradiciendo una decisión ya tomada.

## Próximo paso

T-1: esqueleto Workers + D1 con los tres comandos de verificación funcionando.
