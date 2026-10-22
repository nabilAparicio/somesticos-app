# Sistema del bufete — documento de diseño

**Fecha de decisión:** 22 de octubre de 2026
**Estado:** diseño acordado. Nada implementado todavía.

Este documento es la fuente de verdad. Cuando el código y este documento discrepen, gana el
documento y la discrepancia es un hallazgo, no una licencia.

Lo que está sin decidir se escribe como sin decidir. El silencio y la certeza no se ven igual.

---

## 1. Qué resuelve

Dos cuellos de botella del trabajo diario del bufete, y nada más:

1. **Manejo de clientes y seguimiento del estado de sus procesos.** Hoy no hay una forma rápida
   de contestar "¿en qué va el asunto de este cliente y qué falta?".
2. **Generación de cotizaciones y propuestas.** Hoy se arman a mano, cada una desde cero.

### Por qué este documento existe

El intento anterior (`app-agentes-legales`) construyó primero la parte más difícil del dominio:
un motor de cómputo de plazos con suite dorada, un centinela de corpus normativo, diecisiete
informes de investigación y un esquema auditado en nueve fases. Su propio README dice que corre
"entero en local, con data dummy" y que "no hay ningún dato de cliente real".

El diagnóstico, en palabras del usuario, es que se abordó el problema desde el final hacia el
inicio. Este sistema invierte el orden: primero lo que se usa todos los días.

El trabajo anterior no se tira. `packages/core-deadlines` es TypeScript sin dependencias
(`"dependencies": {}`, criterio de aceptación CA-7.1.1) y es portable a Cloudflare Workers sin
cambios el día que haga falta. Hoy no hace falta.

---

## 2. Alcance

### Entra

- Clientes.
- Procesos, con etapas definidas por el bufete, notas y pendientes.
- Cotizaciones con generación asistida por IA, editables y congeladas al emitirse.
- Registro de honorarios, cuotas y gastos.

### No entra

Esto se escribe explícitamente para que no sorprenda dentro de tres meses:

- Cómputo automático de plazos procesales.
- Facturación, conciliación bancaria, cuentas por cobrar, estado de cuenta formal.
- Recordatorios automáticos de cobro.
- Editor visual de plantillas.
- Multi-tenant operativo (ver §7).
- Portal para clientes. Se quiere a futuro; la única regla que obliga desde hoy está en §6.

El saldo de gastos que el sistema muestra es **informativo, no verdad contable**. El día que el
bufete quiera contabilidad de verdad, se agrega encima sin tocar nada de lo de acá.

---

## 3. Lenguaje ubicuo

| Término | Significado |
|---|---|
| **Proceso** | Todo trabajo que hace un abogado. No se usa "caso", "demanda", "trámite" ni "expediente". Decisión del usuario: todo el trabajo de un abogado es un proceso. |
| **Área** | La rama del derecho: familia, migración, civil, penal. Agrupa tipos de proceso. |
| **Tipo de proceso** | La clase de trabajo dentro de un área: visa de trabajo, visa de pensionado, compraventa, divorcio de mutuo acuerdo. Es entidad de primera clase: del lado cotización es el ítem que se cobra, del lado seguimiento define qué etapas trae por defecto. Es **granular**: una visa de pensionado y una de trabajo son tipos distintos, porque sus pasos son distintos. |
| **Etapa** | Un paso del plan de trabajo de un proceso. El bufete define el plan; no está atado a etapas procesales legales. |
| **Nota** | Un hecho. Fechado, anclado a la etapa donde ocurrió, con autor. Inmutable. Es la bitácora. |
| **Pendiente** | Un cabo suelto. Abierto o cerrado, con autor y responsable. Cruza etapas sin que nadie lo copie a mano. |
| **Cotización** | La propuesta al cliente. Se congela al emitirse. |
| **Módulo** | Una sección de la cotización. Sale de un catálogo cerrado de tipos. |
| **Cuota** | Un cobro programado dentro del plan de pagos. |

Los términos de dominio quedan **en español en el código**, porque es el lenguaje con el que habla
el bufete. Traducirlos a `case` o `matter` rompe la correspondencia entre el código y la
conversación real.

---

## 4. El flujo central

```
cliente ──> cotización ──> (ganada) ──> proceso (1..N)
   │                                       │
   └───────────────────────────────────────┘
        (un proceso también puede nacer directo)
```

Una cotización puede cubrir **varios tipos de proceso**. Ejemplo real del bufete: un cliente que
quiere una visa de trabajo y a la vez la gestión de una compraventa. Ambas viajan en la misma
cotización, y al ganarse se separan en dos procesos independientes, cada uno con su pipeline, sus
notas y sus pendientes.

Un proceso **también puede crearse sin cotización**, para procesos simples de clientes
consolidados que no piden propuesta previa.

### Sembrar, no referenciar

Cuando una cotización se gana, sus valores se **copian** al proceso. No se referencian.

La razón es concreta: si mañana se renegocia, referenciar obligaría a elegir entre corromper la
propuesta histórica o mentir sobre lo que se está cobrando hoy. Copiando, la cotización queda
congelada como la propuesta que efectivamente se hizo, y el proceso evoluciona aparte.

**El proceso es el dueño de la economía viva**: sus honorarios, sus cuotas, sus gastos reales y su
saldo. La cotización, cuando existe, lo siembra.

---

## 5. Invariantes

Se implementan como restricciones de base de datos, no como validación de aplicación. Si viven
solo en el código, el primer script de importación mete un huérfano.

| # | Invariante |
|---|---|
| **I-1** | Toda cotización está ligada a un cliente. `cliente_id NOT NULL`. |
| **I-2** | Todo proceso está ligado a un cliente. `cliente_id NOT NULL`. |
| **I-3** | Un proceso nacido de una cotización tiene el mismo cliente que ella. Nunca divergen. |
| **I-4** | Una cotización emitida no se edita. Solo en borrador se edita; después se duplica. |
| **I-5** | El snapshot de una cotización emitida se escribe una sola vez y no se reescribe jamás. |
| **I-6** | Toda nota, todo pendiente y toda entrada de bitácora tienen autor. |
| **I-7** | El saldo de gastos nunca se almacena. Siempre se deriva. |
| **I-8** | Toda tabla lleva `tenant_id` y ninguna consulta se escribe sin filtrar por él (ver §7). Incluye las tablas hijas: el listado de §6 lo omite por brevedad, pero la columna va en todas. |

**Consecuencia práctica de I-1 e I-2:** el alta de cliente pide lo mínimo — nombre y un medio de
contacto — y todo lo demás es opcional. Si exigiera un formulario completo, el invariante
impediría cotizarle a un prospecto, que es justo el momento en que se cotiza.

---

## 6. Modelo de datos

Motor: **Cloudflare D1** (SQLite). Notas de portabilidad respecto al diseño Postgres de Pro-wall:

- No hay `ENUM` nativo. Los valores cerrados se imponen con `CHECK`.
- No hay `JSONB`. El JSON se guarda como `TEXT` y se consulta con las funciones JSON de SQLite.
- Las llaves foráneas se aplican; D1 ofrece `PRAGMA defer_foreign_keys` para suspenderlas durante
  migraciones.
- Montos: enteros en centavos. Nunca punto flotante.

### Tablas

**Base**

- `tenant` — `id`, `nombre`. Una sola fila por ahora.
- `usuario` — `id`, `tenant_id`, `nombre`, `email`, `activo`.
- `tipo_cliente` — `id`, `tenant_id`, `nombre`, `activo`.
- `cliente` — `id`, `tenant_id`, `tipo_cliente_id`, `nombre`, `documento_tipo`,
  `documento_numero`, `representante_legal`, `email`, `telefono`, `notas`, `creado_por`,
  `creado_en`.
- `area` — `id`, `tenant_id`, `nombre`, `activo`. Familia, migración, civil, penal.
- `tipo_proceso` — `id`, `tenant_id`, `area_id`, `nombre`, `descripcion`, `activo`.
- `etapa_plantilla` — `id`, `tipo_proceso_id`, `nombre`, `orden`. El plan por defecto.

**Cotización**

- `cotizacion` — `id`, `tenant_id`, `cliente_id` NOT NULL, `codigo`, `estado`
  (`borrador|emitida|ganada|perdida`), `fecha`, `vence_en`, `moneda`, `snapshot` TEXT,
  `duplicada_de_id`, `creada_por`, `creada_en`.
- `cotizacion_modulo` — `id`, `cotizacion_id`, `tipo`, `orden`, `contenido` TEXT.
- `cotizacion_linea` — `id`, `cotizacion_id`, `tipo_proceso_id`, `clase`
  (`honorario|gasto_estimado`), `concepto`, `monto`, `orden`.

**Proceso**

- `proceso` — `id`, `tenant_id`, `cliente_id` NOT NULL, `tipo_proceso_id`, `cotizacion_linea_id`
  (nullable), `origen` (`cotizacion|directo`), `titulo`, `estado`, `responsable_id`, `abierto_en`,
  `cerrado_en`.
- `proceso_etapa` — `id`, `proceso_id`, `nombre`, `orden`, `alcanzada_en`. Copiadas de la
  plantilla al crear el proceso, para que cambiar la plantilla no reescriba la historia.
- `nota` — `id`, `proceso_id`, `proceso_etapa_id`, `texto`, `autor_id`, `creada_en`.
- `pendiente` — `id`, `proceso_id`, `proceso_etapa_id` (donde nació), `texto`, `autor_id`,
  `responsable_id`, `vence_en`, `cerrado_en`, `cerrado_por`.

**Dinero**

- `cuota` — `id`, `proceso_id`, `concepto`, `monto`, `porcentaje`, `vence_en`, `hito`,
  `pagada_en`. Dos `CHECK` de exclusividad: exactamente uno de `monto` o `porcentaje`, y
  exactamente uno de `vence_en` o `hito`. Sin esas restricciones, una cuota con monto **y**
  porcentaje es un total ambiguo que nadie detecta hasta que las cifras no cierran.
- `movimiento_gasto` — `id`, `proceso_id`, `fecha`, `concepto`, `monto`,
  `tipo` (`gasto|anticipo`), `comprobante_key` (objeto en R2), `usuario_id`.

**Auditoría**

- `bitacora` — `id`, `tenant_id`, `entidad`, `entidad_id`, `accion`, `usuario_id`, `ocurrido_en`,
  `detalle`.

### Etapas: plantilla y plan de trabajo

Las etapas cumplen **dos funciones a la vez**, y esa dualidad es intencional:

1. **Seguimiento.** Dónde está el proceso hoy.
2. **Plan de trabajo.** Qué viene después. El abogado abre un proceso y ve lo que tiene por
   delante, no solo dónde quedó.

De ahí sale la forma: `proceso_etapa` es la **lista ordenada completa** del plan, no un puntero a
la etapa vigente. Las ya cumplidas llevan `alcanzada_en`; las que tienen `alcanzada_en` nulo son
exactamente lo que falta. El "qué viene" no se calcula ni se configura aparte: se lee.

**La plantilla siembra, el proceso manda.** `etapa_plantilla` da el punto de partida por tipo de
proceso. Al crear el proceso, esas etapas se **copian** a `proceso_etapa`. Desde ese momento el
proceso es dueño de su plan: el usuario puede agregar etapas, quitarlas y reordenarlas sin que
nada de eso toque la plantilla ni los demás procesos.

Esto es necesario, no un lujo. Una visa de pensionado y una de trabajo no tienen los mismos pasos,
y aun dentro de un mismo tipo aparecen casos que piden un paso extra. Una plantilla rígida obliga
a inventar un tipo de proceso nuevo cada vez que un caso se sale del molde, y en seis meses el
catálogo tiene ochenta tipos que son variantes de doce.

**Las plantillas son del bufete, no del sistema.** Se crean, se editan y se borran libremente,
como cualquier otro dato. No son configuración de desarrollador: no hay plantillas "de fábrica"
que el usuario no pueda tocar.

Hay dos caminos para crear una: armarla desde cero, o **guardar como plantilla** el plan de un
proceso que ya se ajustó a mano. El segundo es el que más se va a usar: se abre un proceso, se le
acomodan los pasos sobre la marcha, y cuando queda bien se guarda para la próxima. Es una copia
de `proceso_etapa` hacia `etapa_plantilla`.

**Consecuencia que el usuario tiene que entender:** editar una plantilla **no** altera los
procesos ya abiertos con ella. La plantilla es un punto de partida, no un vínculo vivo. Eso es
deliberado — un proceso en curso no puede cambiar de plan porque alguien editó un molde — pero es
contraintuitivo, así que la interfaz lo dice en el lugar donde se edita la plantilla, no en un
manual que nadie lee.

**Regla derivada:** se puede quitar una etapa **pendiente**; no se puede quitar una **alcanzada**.
Las notas se anclan a la etapa donde ocurrieron y son inmutables (§5, I-6): borrar una etapa ya
cumplida dejaría notas huérfanas o reescribiría la historia, que es justo lo que el modelo
existe para impedir.

### Una consecuencia futura que obliga hoy

Más adelante se quiere exponer al cliente, por un enlace, el estado de su proceso y lo que viene.
Ese portal **no se construye ahora** y está fuera de alcance (§2). Pero una sola cosa de él tiene
que valer desde el primer día:

**Los nombres de etapa son texto de cara al cliente.** Se escriben para que los lea alguien de
afuera del bufete, desde la primera etapa que se cargue.

Es la única parte que sale cara si se difiere. El resto del portal —el enlace con su token, la
ruta pública, la marca de qué se muestra y qué no— se agrega después sin dolor, y si algún día se
expone algo más que las etapas, lo seguro por defecto es ocultarlo. Pero los nombres no: si
durante un año se cargan etapas con jerga interna o abreviaturas de apuro, el día que se abra el
portal hay que renombrarlas a mano en todos los procesos vivos. Esto no cuesta nada hoy y evita
ese trabajo.

### Tipos de cliente

Un cliente puede ser un particular, una empresa, y a futuro otras entidades como una ONG.

El tipo vive en una **tabla de catálogo** (`tipo_cliente`), no en un `CHECK`. La diferencia con el
catálogo de módulos de §8, que sí va en código, es que detrás de un tipo de módulo hay código —
un renderizador y un esquema — mientras que detrás de un tipo de cliente no hay nada que
ramifique: es una etiqueta. Agregar "ONG" tiene que ser una fila, no un despliegue.

La identificación **no se modela por tipo**. Nada de una columna `cedula` y otra `ruc`: va un par
genérico `documento_tipo` y `documento_numero`. Cédula, RUC, pasaporte y el número de registro de
una fundación son todos lo mismo — un documento que identifica a la entidad. Así, el día que
aparezca un tipo nuevo con su propia identificación, el esquema no se toca.

`representante_legal` queda nulo para un particular y se pide para las entidades que actúan a
través de una persona. Es quién firma, y no se confunde con el beneficiario del trámite, que sigue
sin decidir (§11).

### Autoría

Se guarda `usuario_id`, nunca el nombre como texto. El nombre se resuelve en lectura. Si una
persona cambia de apellido, cuatrocientas notas no quedan firmadas con un nombre que ya no existe.

### Notas y pendientes

Son dos objetos distintos, y la diferencia es la razón de ser de esta parte del sistema.

Una **nota** es un hecho que pasó: "el cliente quiere pago diferido por meses". Se lee después, en
la línea de tiempo.

Un **pendiente** es algo que *sigue pasando*: "falta el documento X, pero el proceso inicia". No se
copia de etapa en etapa — sobrevive solo. No bloquea el avance del proceso, pero no se calla hasta
que alguien lo cierre.

**Los pendientes abiertos viven arriba del proceso, contados y a la vista. Las notas viven en la
línea de tiempo.** Si todo estuviera siempre visible, a las cuarenta notas nada sería visible: la
pantalla se llena, el ojo deja de leer y el documento pendiente se pierde igual que hoy, pero
ahora con una aplicación encima recordando que estaba anotado.

### Gastos

El gasto tiene **dos vidas en dos lugares**:

- El **estimado** vive congelado en la cotización, como una línea de clase `gasto_estimado`,
  visiblemente separada de los honorarios y rotulada como aproximada.
- El **real**, con su comprobante, aparece meses después y vive en el proceso, en
  `movimiento_gasto`.

Si compartieran campo, el día que llega el real o se corrompe la cotización congelada o se pierde
la comparación. Separados, sale gratis el dato que más vale: cuánto se desvía lo que el bufete
estima de lo que termina costando.

**El saldo no se guarda. Es una suma:** `Σ anticipos − Σ gastos`. Derivado, nunca almacenado. Eso
elimina de raíz la familia entera de errores de saldo desactualizado y reconciliación: no existen
porque no hay nada que mantener sincronizado.

Las dos mecánicas de cobro del bufete salen de esa única tabla sin una sola rama condicional:

| Mecánica | Filas | Lectura del saldo |
|---|---|---|
| Reembolso contra factura | solo `gasto` | negativo: eso debe el cliente |
| Anticipo con sobrante a favor | `anticipo` + `gasto` | positivo: eso le sobra al cliente |

Que dos casos de negocio distintos caigan de la misma estructura sin forzarla es la señal de que
el modelo está bien.

### Plan de pagos

Un **cronograma**, nunca un enum de modalidades.

- Un solo pago → una cuota.
- 50/50 → dos cuotas, una a la firma y otra contra hito.
- Mensual → N cuotas.

Cada cuota lleva concepto, monto o porcentaje, y vencimiento o hito disparador. Una estructura
cubre las tres formas que usa el bufete hoy y las que inventen después. Un enum de tres
modalidades pide un `if` nuevo cada vez que aparece un caso raro.

---

## 7. Usuarios y tenencia

Hoy son **dos personas**. Es multi-usuario dentro de un solo bufete, **no** multi-tenant.

La preparación para multi-tenant tiene una versión barata y una trampa:

- **Barato, se hace ahora:** `tenant_id` en toda tabla desde el día uno, con una sola fila por
  defecto, y la regla de que ninguna consulta se escribe sin filtrar por él. Es el mismo
  `empresa_id` que ya existe en Pro-wall.
- **Caro y prematuro, no se hace:** provisioning de tenants, switcher, configuración por tenant,
  aislamiento por fila. Eso no es preparar: es construir algo que nadie pidió.

Columna sí, maquinaria no.

Autenticación: **Cloudflare Access** como puerta de entrada. Pero la tabla `usuario` existe igual,
porque la autoría de notas, pendientes y bitácora necesita una llave foránea real a la que
apuntar.

---

## 8. El generador asistido por IA

### La forma

La cotización es una **lista ordenada de módulos**, cada uno de un tipo que sale de un catálogo
cerrado. La IA decide cuáles entran, en qué orden, y los rellena. Lo que no puede es inventar un
tipo de módulo que no existe.

Los módulos son de dos familias, y la distinción es la barandilla del sistema:

| Familia | Ejemplos | Quién manda |
|---|---|---|
| **Prosa** | alcance, exclusiones, antecedentes, supuestos, cláusulas, nota al cliente | La IA escribe libremente |
| **Estructurado** | líneas de honorarios, gastos estimados, plan de pagos, totales | La IA rellena campos tipados; **el sistema hace la aritmética** |

**El modelo no suma. Nunca.** Es el mismo principio que ya funciona en producción en Pro-wall,
donde el LLM se usa solo para sugerir a partir de documentos y la matemática de precios es
aritmética determinista.

Si la IA pudiera inventar campos o secciones estructurales, las cotizaciones dejarían de ser
comparables entre sí, los totales dejarían de cerrar y el snapshot congelado guardaría una forma
distinta cada vez. En seis meses nadie podría contestar "¿cuánto cobramos en promedio por una visa
de trabajo?", porque cada cotización habría guardado el honorario en otro lugar.

### El catálogo

El catálogo de tipos de módulo vive **como registro tipado en código**, no como configuración
editable en pantalla. Agregar un tipo nuevo es un despliegue, no un CRUD de plantillas. Para dos
personas, ese editor es un mes de trabajo que nadie pidió.

### La entrada

El abogado describe el asunto en prosa — "divorcio de mutuo acuerdo, hay bienes, el cliente pide
pago diferido" — y el generador arma la propuesta con sus servicios y honorarios. Después se
edita a mano.

Como base de referencia, el bufete va a aportar **cotizaciones previas**. Su formato y volumen
están sin decidir (§11), y de eso depende si se usan como catálogo sembrado de servicios y
honorarios típicos, como ejemplos en el prompt, o ambos.

### La costura

El acceso al modelo pasa por **una sola interfaz** con una única operación de completado. El
proveedor se resuelve por configuración y la salida se valida contra esquema antes de tocar nada.
Nada del resto del sistema sabe que existe un LLM.

Modelo por defecto: `claude-opus-5`.

### El ciclo de vida

```
borrador  ──editable──>  emitida  ──>  ganada | perdida
                            │
                            └── duplicar ──> nuevo borrador
```

Al pasar de borrador a emitida se escribe el **snapshot** en la misma transacción: una copia
completa e inmutable de la cotización tal como se le mandó al cliente. Cualquier escritura
posterior que difiera es un error, no una actualización. Eso es "que la guarde para siempre".

Si hay que cambiar algo después de emitida, se **duplica**: nace un borrador nuevo atado por
`duplicada_de_id`. La historia no se reescribe.

### La salida

No hay librería de PDF. La cotización se renderiza como **HTML** y se imprime desde el navegador,
con exportación a DOCX cuando haga falta. Es lo que hace Pro-wall hoy y cruza a Workers sin
problemas.

---

## 9. Arquitectura y despliegue

Todo en Cloudflare.

| Pieza | Elección |
|---|---|
| Front | React + Vite, SPA sobre Workers Static Assets |
| API | Un Worker |
| Base | D1 |
| Archivos | R2 (comprobantes de gasto) |
| Auth | Cloudflare Access |
| IA | API de Anthropic detrás de la costura de §8 |

La separación es hacia adentro: el dominio no sabe que existen D1 ni HTTP. Los adaptadores conocen
al dominio, no al revés.

### Capa de presentación

La interfaz es **responsiva en todo lo que se pueda**, y eso se consigue no peleando contra el
navegador: el layout fluye por defecto, y el trabajo es ponerle límites, no medidas.

**Nada de tamaños fijos.** Se trabaja con `min-width`, `max-width` y `clamp()`. Un ancho fijo se
justifica solo cuando el contenido realmente tiene uno — un ícono, un logo — y en ningún otro
caso. Lo mismo con las alturas: que las defina el contenido.

**Grid y flexbox, cada uno en lo suyo.** Grid para el esqueleto de la pantalla, que es
bidimensional. Flexbox para acomodar el contenido dentro de una franja, que es unidimensional.
Confundirlos es la fuente de la mitad de los layouts que se rompen al cambiar de tamaño.

**Que la rejilla reflúya sola.** Patrones como `repeat(auto-fit, minmax(…, 1fr))` reacomodan las
columnas según el espacio disponible sin un solo breakpoint. Mientras menos puntos de quiebre
escritos a mano, menos tamaños intermedios en los que nadie probó.

**Consultas de contenedor antes que de viewport.** Varios componentes de este sistema se
renderizan en anchos muy distintos: la lista de módulos de una cotización, las tarjetas de
proceso, el bloque de pendientes. Lo que tienen que mirar para adaptarse es **su propio espacio**,
no el tamaño de la ventana.

**El texto se mide en `ch`.** Las columnas de prosa — alcance, cláusulas, notas — llevan tope de
ancho por legibilidad, no por diseño.

**Las tablas scrollean solas.** Las líneas de una cotización y los listados son tabulares y son lo
más difícil de hacer responsivo. Scrollean dentro de su propio contenedor; la página nunca
scrollea en horizontal.

**La excepción, declarada:** la cotización imprimible de §8 apunta a una hoja física y sí tiene
medidas fijas. La aplicación es fluida y la hoja de impresión no, y no tienen por qué pelearse:
son dos hojas de estilo con dos objetivos distintos.

### Qué se toma de Pro-wall y qué no

**Se toma:** el snapshot congelado escrito en la misma transacción que el cambio de estado; el
versionado por duplicación en lugar de mutación; el LLM confinado a una costura angosta que nunca
toca la aritmética; la salida HTML imprimible; el front sobre Workers Static Assets, que ya está
en producción ahí.

**No se toma:** la explosión `receta → insumo → margen → BOM`. Esa es la mayor parte de la
complejidad de Pro-wall y existe porque cotiza materiales. Una cotización legal es servicios por
honorario. Ahí está la mayor parte del "más simple". Tampoco se toma Laravel con Postgres en
Dokploy: en Cloudflare eso es Workers con D1.

---

## 10. Procedencia

Cada decisión de este documento sale de una de tres fuentes, y conviene distinguirlas:

- **Dicho por el bufete:** el pipeline definido a mano, las notas por etapa, los dos usuarios, la
  autoría en todo, el responsable del pendiente, una cotización con varios tipos de proceso, el
  proceso sin cotización, el invariante del cliente, el vocabulario "proceso", honorarios contra
  gastos reembolsables, las tres modalidades de pago, el alcance CRM y no contable, la plantilla
  de módulos, que el cliente lleva tipo y los tipos crecen con el tiempo, que la interfaz sea
  responsiva sin tamaños fijos, que las etapas varíen por tipo de proceso y el usuario pueda
  agregarlas y quitarlas siempre, la doble función de seguimiento y plan de trabajo, y el portal
  del cliente como intención futura.
- **Verificado en código:** todo lo que dice §9 sobre Pro-wall, y que `core-deadlines` no tiene
  dependencias.
- **Propuesto en el diseño:** la separación nota/pendiente, el saldo derivado, el cronograma de
  cuotas, la copia al sembrar, `usuario_id` en vez de nombre, `tenant_id` sin maquinaria, las dos
  familias de módulos, el tipo de cliente como tabla de catálogo, el par genérico
  `documento_tipo`/`documento_numero`, el `area` como nivel de agrupación sobre los tipos de
  proceso, y la regla de no borrar etapas ya alcanzadas. Todas fueron aceptadas en la
  conversación del 22 de octubre de 2026.

---

## 11. Sin decidir

1. **Beneficiario distinto del pagador.** Cuando una empresa contrata al bufete para la visa de
   trabajo de un empleado, el cliente que paga y la persona beneficiaria no son la misma. Falta
   decidir si se modela un beneficiario aparte o si siempre se registra a nombre de quien paga.
2. **Formato y volumen del corpus de cotizaciones previas.** De eso depende si se usan como
   catálogo sembrado, como ejemplos en el prompt, o ambos.
3. **A quién pertenece el plan de pagos.** En el modelo de §6 las cuotas cuelgan del proceso,
   porque un proceso puede existir sin cotización. Pero cuando una cotización genera dos procesos,
   el cliente normalmente paga un solo plan por todo el encargo. Falta decidir si el plan se
   reparte entre los procesos o si existe un nivel de agrupación por encima.
4. **ITBMS.** Falta verificar el tratamiento del impuesto panameño sobre honorarios frente a
   gastos reembolsables antes de implementar cualquier cálculo. No se asume nada.
5. **Moneda.** El sistema lleva el campo; falta confirmar si alguna vez se cotiza fuera de USD.

Resuelto el 22-oct-2026: el cliente lleva tipo (particular, empresa, y a futuro otras entidades).
Ver §6.
