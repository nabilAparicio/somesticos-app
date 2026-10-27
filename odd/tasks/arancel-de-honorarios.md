# El arancel de honorarios, sembrado y editable

## El problema

Las palabras del usuario, que son el criterio:

> «Los precios de los servicios deben ser configurables con un preset con
> esto [el arancel del Órgano Judicial]. Pero debe ser configurable: el
> abogado decide cuánto cobra, esto solo serán los presets. Pienso que
> idealmente una tabla similar a la estructura que tiene el documento que te
> pasé, y esta tabla sea editable con los presets siempre presentes, y que
> tenga como un comentario que diga que esos valores están basados en la ley
> x bla bla bla.»

Hoy **no hay dónde guardar un precio, en ningún lado**. Medido, no supuesto:

| Dónde | Qué hay |
|---|---|
| `tipo_proceso` (`migrations/0001:104-112`) | `id, tenant_id, area_id, nombre, descripcion, activo`. Cero columnas de dinero. |
| `cotizacion_linea` (`migrations/0004:249-263`) | `concepto`, `monto` suelto. Sin cantidad, sin precio unitario, sin descuento. |
| `EditorDeLineas.tsx` | Elegir un tipo de proceso **no** prellena el monto. La relación es para abrir el proceso después (T-7), nunca para tarifar. |

O sea que cada monto de cada cotización se tipea a mano, siempre, o lo propone
la IA. Y el bufete no tiene en ninguna parte la respuesta a «¿cuánto cobramos
nosotros por una visa de pensionado?».

## La fuente

**Acuerdo No 49 del 24 de abril de 2001**, Sala Cuarta de Negocios Generales
de la Corte Suprema de Justicia, que aprueba la *Tarifa de Honorarios
Profesionales Mínimos de los Abogados en la República de Panamá*, aprobada a
su vez por la Asamblea General de Abogados del 19 de febrero de 2000.
Publicado por el Órgano Judicial.

Tres hechos de la fuente que el diseño tiene que respetar:

1. **Es un mínimo, no una lista de precios.** El Artículo 1 dice que pactar
   honorarios inferiores es «deslealtad y falta a la ética profesional»,
   salvo amparos de pobreza y patrocinio legal gratuito. Y dice también que
   «es válido todo acuerdo… que fijen honorarios superiores».
2. **Tiene 25 años y nunca se indexó.** Los montos son de 2001. Como preset
   están bien; como precio de 2026, no. El bufete va a editar casi todos
   hacia arriba, y por eso **manda la columna del bufete**, no la oficial.
3. **El PDF oficial tiene erratas que rompen la aritmética.** En Estudios de
   Títulos: «honorario convencional mayor de B/.1,000.00 sin que exceda del
   **0.0085%**». El 0.0085% de B/.250,000 son B/.21, por debajo de su propio
   piso de mil: es casi seguro 0.85%. Hay más —`B/,2,000.00` con coma,
   `B/.2.000.00` con punto de miles, «11/2» por 1½%, «horarios» por
   «honorarios»—. **Ninguna se corrige en silencio**: se transcribe lo que
   dice el documento y la lectura va aparte, anotada.

## La forma

### Una tabla con la estructura del documento

Categoría → numeral → concepto → monto, igual que el papel. Se siembra entera
—son 358 renglones con monto fijo repartidos en 22 categorías— y **los
renglones no se borran**: se desactivan. El preset siempre está.

### Dos montos guardados, uno solo a la vista

| Columna | Quién la escribe | Se puede editar |
|---|---|---|
| `monto_oficial` | La siembra, desde el Acuerdo | **No.** Es una cita, no un dato nuestro. |
| `monto` | El bufete | Sí. Es lo que el bufete cobra. |

Las dos se guardan. **Una sola se muestra: la del bufete.**

Y acá hay una corrección del usuario sobre la primera versión de este
documento, que vale escribir porque cambia de qué se trata la pantalla:

> «¿No sabés qué? Esperá: mejor, en lugar de siempre al lado, un tipo
> hipervínculo que te permita ver la tabla. Así no se siente que el sistema
> juzga tus precios, sino que el sistema sabe cuánto cuesta y te lo sugiere.»

La primera versión ponía las dos columnas lado a lado, y de paso proponía
avisar cuando el precio del bufete quedara por debajo del mínimo. Eso
convierte la pantalla en **una auditoría**: cada vez que el abogado mira su
precio, el sistema le está mostrando la vara con la que lo mide. El Artículo
1 existe y dice lo que dice, pero **no es trabajo de esta aplicación
vigilarlo**; el abogado sabe en qué país ejerce.

Entonces el sujeto cambia. El sistema no mide: **sabe cuánto cuesta y lo
sugiere.** En concreto:

- un precio a la vista por servicio, **el del bufete**, que arranca siendo la
  sugerencia del arancel y se edita encima;
- al lado, un **enlace discreto** —«de dónde sale este precio»— que abre la
  tabla del arancel, completa y de solo lectura, en la estructura del
  documento;
- **ninguna comparación en línea, ningún aviso de «estás por debajo»,
  ninguna marca de color sobre el precio propio.**

El valor oficial se sigue guardando inmutable, y no es ceremonia: es lo que
hace que el enlace tenga qué mostrar y que dentro de dos años se pueda saber
de dónde salió cada sugerencia. Pero se guarda para consultarlo, no para
confrontarlo.

### Las 54 reglas que no son un monto

Los procesos civiles y comerciales no tarifan un monto sino un **porcentaje
por tramos sobre la cuantía** («25% de menor cuantía», «B/.2,000.00 más el
35% de lo que se obtenga»). Esas no se auto-calculan en esta tajada, por dos
razones y las dos son de evidencia: la cuantía no es un dato que la cotización
pida hoy, y varias de esas reglas son justamente las que tienen las erratas.
Se guardan como **texto de la regla oficial**, sin monto, y el bufete escribe
su propio monto al lado si quiere. Auto-calcular una tarifa progresiva a
partir de un texto con erratas es la clase de aritmética que nadie va a
revisar hasta que salga mal en una cotización.

### La nota de procedencia

Visible, pero **en la tabla del arancel, no encima del precio del bufete**:
de qué acuerdo salen los valores, de qué fecha, y que son mínimos de 2001.
Ese es el lugar donde alguien fue a preguntar de dónde sale un número, así
que es donde la respuesta sirve. Puesta al lado del precio propio sería una
advertencia permanente sobre una decisión que ya tomó el abogado.

## Alcance autorizado

Entra: la extracción del PDF a datos sembrados, la migración de la tabla, la
API de lectura y edición, y la pantalla del catálogo dentro de Catálogos.

**No entra en esta tajada** —y se dice para que no se cuele—: prellenar la
línea de una cotización con el precio del arancel. Es el paso siguiente y
obvio, pero es otra tajada: toca `EditorDeLineas`, el congelado del snapshot
y la propuesta de la IA, que hoy sugiere montos sin ver ningún precio.
Tampoco entran las reglas por cuantía auto-calculadas ni el cambio de
moneda (`cotizacion.moneda` es un `CHECK` cerrado en `'USD'`).

## Las tareas

### T-1 · Sacar el arancel del PDF sin inventar nada

- [x] Script de extracción reproducible, con el PDF como entrada y datos
      estructurados como salida. No se transcribe a mano: 358 montos
      copiados a ojo es una errata nuestra encima de las del documento.
- [x] Cada renglón lleva categoría, numeral tal como aparece, concepto,
      monto en centavos enteros, y —cuando no hay monto— el texto de la
      regla.
- [x] Las erratas del documento se transcriben **como están** y se anota
      aparte la lectura, con el renglón que la motiva. Ninguna corrección
      silenciosa.
- [x] Un conteo de control contra el PDF: cuántos renglones, cuántos con
      monto, cuántos con regla. Si no cuadra, no se sigue.

### T-2 · La tabla

- [ ] Migración con `monto_oficial` inmutable y `monto` del bufete,
      centavos enteros con el `CHECK (typeof(...) = 'integer')` que usa todo
      el esquema, `tenant_id`, `activo`, y el orden del documento.
- [ ] Un disparador que impida modificar `monto_oficial` después de la
      siembra, igual que los de `0006_emitir_y_congelar.sql`: si es una cita,
      la base lo sostiene y no la buena intención.
- [ ] La siembra, idempotente.

### T-3 · La pantalla

Son **dos**, y la separación es la corrección del usuario hecha estructura.

- [ ] **Los precios del bufete.** Un precio por servicio, el del bufete,
      editable. Nada de la columna oficial acá: ni al lado, ni abajo, ni en
      un color.
- [ ] **El enlace.** Discreto, junto al precio, con un rótulo que ofrezca en
      vez de advertir —«de dónde sale este precio»— y que lleve a la tabla
      del arancel, al renglón que corresponde.
- [ ] **La tabla del arancel**, de solo lectura, agrupada por categoría como
      el documento, con la nota de procedencia arriba.
- [ ] Buscar por concepto: 358 renglones sin buscador no se usan.
- [ ] Un servicio sin precio propio **muestra la sugerencia del arancel como
      valor de arranque**, no un campo vacío ni un cero. El sistema sabe
      cuánto cuesta; que lo diga.

## Criterios de aceptación

1. La tabla del arancel trae los 358 renglones del Acuerdo, agrupados como
   el documento, y dice de dónde salen.
2. El monto oficial no se puede editar, ni por la API.
3. El monto del bufete se edita y es **el único que se ve** en la pantalla de
   precios; arranca con la sugerencia del arancel.
4. Desde el precio de un servicio se llega al arancel con un clic, y **en
   ningún lugar de esa pantalla aparece el monto oficial ni una comparación
   con él**. Esto se prueba, no se promete.
5. `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e` en verde.

## Verificación

`pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm test:e2e`

Prueba primero donde hay lógica corrible: el parseo del arancel (montos con
coma, con punto de miles, partidos en dos renglones) y la regla de
inmutabilidad del monto oficial.

## Entrega

Tres commits de unidad de trabajo en `feat/r1-fundacion`, uno por tarea. PR y
merge siguen siendo decisión del usuario.

## Progreso

- Documento creado. Ninguna tarea cerrada.
- **T-1 cerrada.** `pnpm arancel:extraer` lee
  `docs/fuentes/acuerdo-49-2001-tarifa-abogados.pdf` con `pdftotext -layout`
  y escribe `scripts/arancel/arancel.json`. El parseo puro vive en
  `scripts/arancel/parseo.mjs` y lo ejercen 58 pruebas en
  `test/arancel-api.spec.ts`. Las lecturas de las erratas, numeradas, en
  `scripts/arancel/lecturas.md`.
- **Los números de este documento estaban mal, y los medidos son otros.**
  No son 358 montos ni 54 reglas ni 22 categorías: son **453 renglones en 29
  categorías** —27 con renglones, 2 con solo prosa—, de los cuales **282
  llevan monto fijo**, **97 llevan regla en texto** y **74 son rubros** que
  el acuerdo imprime sin valor porque solo agrupan a sus hijos. Las 358
  tarifas estimadas eran un conteo de apariciones del sigilo `B/` sobre el
  volcado: de las 399 que hay dentro del Artículo 4, 282 son el valor de un
  renglón, 41 están dentro de un texto de regla, 68 dentro de un concepto
  —son topes de cuantía, «De B/.0.01 hasta B/.3,000.00»— y 8 en los
  parágrafos. La suma cuadra exacto y es el control que el script corre.
- **`sinClasificar` quedó vacío**: ninguna línea del Artículo 4 se descartó.
- Hay dos cosas que el criterio de aceptación 1 tiene que corregir cuando se
  reescriba: los renglones son 453, no 358, y la clave de un renglón es
  `orden`, no `numeral` —el acuerdo repite numerales en 31 renglones, ver la
  lectura 13—.
- Próximo paso: T-2, la tabla. Con `clase` en la mano, la siembra puede
  distinguir el rubro del renglón cotizado y no darle a un encabezado una
  columna de precio editable.
