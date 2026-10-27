# Tus precios llegan a la cotización, y al agente

## El problema

Las palabras del usuario, que son el criterio:

> «¿Estos precios se le inyectan al agente cuando se hace la cotización
> asistida? Idealmente el agente recibe esto y entiende qué tarifas aplicar
> basado en el contexto de la consulta. También en la vista de cotización
> debe poder verse, para que el usuario sepa sus propios precios en todo
> momento.»

La respuesta a la pregunta es **no**, y medida:

| Dónde | Qué pasa hoy |
|---|---|
| `worker/ia/prompt.ts:92` | Todo lo que el modelo sabe de un trámite es `- {id} · {nombre} ({área})`. **Ni un precio.** |
| `worker/ia/prompt.ts:171` | Y sin embargo se le pide `monto` en centavos enteros. |
| `worker/ia/esquema.ts:310-333` | El `monto` es **obligatorio**: si falta, `monto_invalido` y la línea se descarta. |
| `EditorDeLineas.tsx` | Elegir un trámite no prellena ningún monto. |

O sea: **le pedimos una cifra de dinero a alguien al que no le dijimos cuánto
cobra el bufete.** Lo único que el sistema sí defiende es que el modelo no
sume (§8: la IA rellena campos tipados, el sistema hace la aritmética), pero
el monto de cada línea sale de su imaginación.

La tajada del arancel dejó el catálogo construido y **nadie lo consume**.

## La decisión que define la forma

Pregunta hecha al usuario, con dos bocetos. Su respuesta:

> **El sistema pone el precio.**

El modelo elige **qué** servicio aplica según el contexto de la consulta; el
monto lo pone el sistema desde el catálogo. El modelo solo escribe un monto
libre cuando la línea no corresponde a ningún servicio tarifado.

Es la frontera de §8 corrida un paso. Ya decía «la IA rellena campos
tipados, el sistema hace la aritmética»; ahora el precio de un servicio
conocido deja de ser un campo que la IA rellena y pasa a ser aritmética del
sistema. **Para todo lo que está en el catálogo, un monto alucinado deja de
ser posible** — no porque el modelo se porte bien, sino porque no hay dónde
escribirlo.

## La secuencia, que cambia el orden de todo

Hoy hay **cero** precios del bufete cargados: las 453 filas de
`arancel_renglon` tienen `monto` en `NULL`. Entonces:

- **Al agente viaja solo lo que el bufete ya tarifó**, nunca el monto
  oficial. Inyectar el arancel sería pasarle **mínimos de 2001**, y el modelo
  cotizaría más barato que inventando. El preset es una sugerencia para una
  persona, no una referencia para una máquina.
- Mientras no haya precios cargados, el agente se comporta **exactamente como
  hoy**. La sección del prompt falla cerrada y lo dice, igual que ya hace
  `catalogoDeTramites` con un bufete sin trámites.
- Eso hace que la pantalla de precios no sea un accesorio de esta tajada:
  **es su requisito**. Vale decirlo en voz alta en vez de descubrirlo cuando
  el agente no cambie de comportamiento.

Y una consecuencia de tamaño que se resuelve sola: lo que viaja al prompt no
son 453 renglones, son los que el bufete tarifó. Un bufete de dos personas
tarifa decenas, no cientos. El día que no entren, `modelo.ts:71` ya reserva
`antecedentes` como «el punto de enchufe del corpus» y dice a propósito que
no se escribió una interfaz de recuperación contra un corpus que nadie
definió. Sigue valiendo: **no se escribe hasta que el tamaño la pida.**

## La forma

### La línea sabe de dónde salió su precio

`cotizacion_linea` gana `arancel_renglon_id`, nulo. No reemplaza a
`tipo_proceso_id`: son dos trabajos distintos y conviven.

| Columna | Para qué |
|---|---|
| `tipo_proceso_id` | Qué proceso se abre si la cotización se gana (T-7). |
| `arancel_renglon_id` | De dónde salió el precio. |

Con eso, una línea tarifada deja rastro: dentro de un año se puede saber que
esos B/.1,800 salieron del precio del bufete para tal servicio y no del dedo
de alguien. Y el **snapshot lo congela con lo demás**: `snapshot.ts` ya copia
el monto y el nombre del trámite resuelto para no tener que volver al
catálogo, y esto entra por la misma puerta y por la misma razón.

### El editor de líneas muestra tus precios mientras cotizás

Elegir un servicio tarifado prellena **concepto y monto**, editable encima —
el mismo trato que la pantalla de precios le da al arancel: el sistema sabe
cuánto cuesta y lo propone.

Y lo que el usuario pidió explícitamente, que es más que prellenar: **tus
precios visibles mientras armás la cotización**, para no tener que acordarte
ni ir a otra pantalla a mirar. Un panel o un buscador al lado de las líneas,
con los servicios que tarifaste y su precio.

Acá rige la misma regla que la tajada anterior, y no se renegocia: **ninguna
comparación con el monto oficial, ningún aviso.** Si editás el prellenado a
la mitad, no pasa nada y nadie te dice nada.

### El agente recibe el catálogo tarifado

Tres cambios encadenados, y el tercero es el que cuesta:

1. **El prompt** gana una sección con los servicios tarifados del bufete y su
   precio, construida como `catalogoDeTramites`: **falla cerrada** cuando
   está vacía y lo dice, en vez de omitir la sección y dejar al modelo libre
   de inventar.
2. **El modelo elige y no tarifa.** Cuando una línea nombra un servicio del
   catálogo, devuelve su identificador y **no** el monto.
3. **El esquema de salida cambia**, y esto no es cosmético:
   `worker/ia/esquema.ts:310-333` hoy exige `monto` y rechaza la línea entera
   con `monto_invalido` si falta. Pasa a ser: **o un servicio tarifado sin
   monto, o un monto sin servicio tarifado; nunca las dos, nunca ninguna.**
   Un modelo que mande las dos está contradiciéndose sobre quién pone el
   precio, y eso se rechaza con un motivo propio, no se resuelve eligiendo
   uno en silencio.
4. **El sistema tarifa** al componer la propuesta, leyendo el precio del
   catálogo. El modelo nunca toca ese número.

## Alcance autorizado

Entra: la columna y su congelado, el editor de líneas con los precios a la
vista, y el camino completo de la IA (prompt, esquema de salida, generador).

**No entra**: las reglas por cuantía auto-calculadas —siguen siendo texto,
por lo mismo que en la tajada anterior—; recuperación sobre un corpus; y
tocar la aritmética de totales, que `totalesDe` ya resuelve y nadie va a
mover acá.

## Las tareas

### T-1 · La línea sabe de dónde salió su precio

- [ ] Migración: `cotizacion_linea.arancel_renglon_id`, nulo, con su clave
      foránea y el filtro por `tenant_id` que usa todo el esquema.
- [ ] El snapshot lo congela, por la misma razón que congela el monto.
- [ ] Una línea que nombra un renglón **sin precio del bufete** es un error
      de programa, no un caso: el catálogo ofrece lo tarifado.
- [ ] Un `rubro` nunca puede ser el origen de un precio: la base ya lo
      prohíbe en su tabla y acá tampoco se acepta.

### T-2 · El editor muestra tus precios

- [ ] Elegir un servicio tarifado prellena concepto y monto, editable.
- [ ] Los precios del bufete, visibles y buscables mientras se arma la
      cotización.
- [ ] Ninguna comparación con el monto oficial. Se prueba, no se promete.

### T-3 · El agente elige y el sistema tarifa

- [ ] El prompt lleva los servicios tarifados, fallando cerrada si no hay.
- [ ] El esquema de salida: servicio tarifado **xor** monto. Motivo de
      rechazo propio para el modelo que manda los dos.
- [ ] El generador pone el precio desde el catálogo.
- [ ] Una prueba que **el modelo no puede cambiar un precio del catálogo**,
      ni mandando un monto, ni mandando los dos campos.

## Criterios de aceptación

1. Con el catálogo vacío, el agente se comporta igual que hoy y lo dice.
2. Con servicios tarifados, el agente los elige por contexto y **el monto de
   esas líneas sale del catálogo**, no del modelo.
3. Al armar una cotización a mano, tus precios están a la vista y prellenan.
4. En ninguna de esas pantallas aparece el monto oficial ni una comparación.
5. El snapshot de una cotización emitida dice de dónde salió cada precio.
6. `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e` en verde.

## Verificación

`pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm test:e2e`

Prueba primero en las tres: el esquema de salida y el generador son lógica
pura con pruebas unitarias; el editor y el prellenado se miden de punta a
punta.

## Entrega

Tres commits de unidad de trabajo en `feat/r1-fundacion`, uno por tarea. PR y
merge siguen siendo decisión del usuario.

## Progreso

- Documento creado. Ninguna tarea cerrada.
- Próximo paso: T-1, la columna y su congelado.
