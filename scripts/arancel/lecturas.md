# Lecturas del Acuerdo No 49 de 2001

Lo que sigue son **lecturas**, no correcciones. El Acuerdo No 49 de 24 de
abril de 2001 tiene erratas que rompen la aritmética y erratas que solo
rompen la ortografía, y las dos clases se transcriben a `arancel.json`
exactamente como están impresas. Esta es la libreta aparte: qué dice el
documento, por qué no puede ser lo que dice, qué es lo que casi seguro quiso
decir, y qué renglón de la extracción queda afectado.

El criterio y la razón de que exista esta libreta: el arancel es una **cita**
de un acuerdo publicado por el Órgano Judicial. Un monto corregido en la
siembra es una cita falsificada, y dentro de un año nadie podrá distinguir
qué salió del papel y qué salió de la buena intención de quien corrió el
script. La corrección, cuando el bufete la quiera, se escribe en su propia
columna de `monto`, que es editable; `monto_oficial` sigue diciendo lo que
dice el acuerdo.

Los renglones se nombran por su `orden` en `scripts/arancel/arancel.json`,
que es el orden del documento, porque el `numeral` del acuerdo se repite —ver
la lectura 13—.

Lo que **no** es una errata, y por eso no está acá: `B/.2.000.00` con punto
de separador de miles. Ese número es dos mil balboas sin ninguna ambigüedad y
el parseo lo lee así, con la regla posicional documentada en `parseo.mjs` y
probada en `test/arancel-api.spec.ts`. Leer un número con el separador que
trae no es corregirlo.

---

## 1. `0.0085%` en Estudios de Títulos es casi seguro `0.85%`

**Dice** (renglón `orden` 149, `ESTUDIOS DE TÍTULOS`, numeral `2.e`):

> Para operaciones cuyo valor sea mayor de B/.100,000.00 sin pasar de
> B/250,000.00 un honorario convencional mayor de B/.1,000.00 sin que exceda
> del **0.0085%**.

**No puede ser.** El 0.0085% de B/.250,000 son B/.21.25. El propio renglón
fija un piso de B/.1,000, o sea que el techo quedaría cincuenta veces por
debajo del piso y el tramo no tendría ningún valor admisible. Y el tramo
anterior —`2.d`, hasta B/.100,000— cobra «1% del valor de operación», que en
B/.100,000 son B/.1,000: el tramo siguiente no puede bajar de 1% a 0.0085%
sin que la tarifa se derrumbe tres órdenes de magnitud a mitad de tabla.

**Casi seguro dice `0.85%`.** Con 0.85%, el techo en B/.250,000 son B/.2,125,
que queda por encima del piso de mil y continúa la progresión decreciente
—2%, 1½%, 1%, 0.85%— que los tramos anteriores venían dibujando.

**Afecta** `orden` 149. `reglaOficial` dice `0.0085%`.

## 2. `0.0075%` en el tramo siguiente, por lo mismo

**Dice** (`orden` 150, numeral `2.f`): «sin pasar de B/.1,000.000.00 un
horario convencional mayor de B/.1,000.00 sin que exceda del **0.0075%**».

**No puede ser,** por el mismo argumento: el 0.0075% de un millón son B/.75,
por debajo de su propio piso de mil.

**Casi seguro dice `0.75%`** —B/.7,500 en un millón—, que es el paso siguiente
de la misma progresión.

**Afecta** `orden` 150.

## 3. `0.0065%` en el tramo abierto, por lo mismo

**Dice** (`orden` 151, numeral `2.g`): «un honorario convencional sobre un
mínimo equivalente al **0.0065%** pero siempre con mínimo de B/.1,875.00 de
la operación».

**No puede ser.** Sobre un millón, el 0.0065% son B/.65; el piso declarado es
B/.1,875, que recién se alcanzaría con una operación de veintiocho millones.

**Casi seguro dice `0.65%`.** Y entonces el piso de B/.1,875 cuadra: con
0.65% el porcentaje alcanza el mínimo alrededor de B/.288,000 y lo supera
desde ahí, que es cómo funciona un piso. Las lecturas 1, 2 y 3 son la misma
errata repetida —dos ceros de más— en tres renglones consecutivos.

## 4. `11/2` es `1½%`

**Dice** (`orden` 147, numeral `2.c`): «un honorario convencional mayor de
B/.450.00 sin que exceda del **11/2** del valor de la operación».

**No puede ser.** `11/2` no es un porcentaje ni una fracción legible: no lleva
el signo `%` y, leído como once medios, daría 5.5 veces el valor de la
operación.

**Dice `1½%`,** o sea uno y medio por ciento. El tramo anterior cobra 2% y el
siguiente 1%: 1½% es exactamente el escalón intermedio. La ligadura `½` se
perdió en la composición tipográfica y quedó como `1/2` pegado al `1`.

**Afecta** `orden` 147. `reglaOficial` dice `11/2`.

## 5. `horario` por `honorarios`

**Dice** `un horario convencional` en el `orden` 129 —numeral `1` de
`ELABORACIÓN DE MINUTAS…`— y en el 150 —`2.f` de Estudios de Títulos—, y
`un horarios convencional`, en plural, en el 145 —`2.a`—.

**Es ortografía, no aritmética:** el acuerdo habla en todos sus otros
renglones de «honorario convencional», que es el término del Artículo 1. No
cambia ningún monto. Se deja como está porque el `concepto` y la
`reglaOficial` son citas, y una cita con la ortografía arreglada ya no sirve
para comparar contra el papel.

**Afecta** `orden` 129, 145 y 150.

## 6. `B/.2,00.00` es casi seguro `B/.2,000.00`

**Dice** (`orden` 436, `ACTUACIONES EN NEGOCIOS CRIMINALES`, numeral `4`):
«Ante Autoridades con Jurisdicción en todo el territorio — **B/.2,00.00**».

**Se lee como B/.200.00** y así quedó en `montoOficial` (20000 centavos),
porque la regla posicional no tiene por qué inventar un cero que no está
impreso.

**Casi seguro dice B/.2,000.00.** Sus tres hermanos de la misma lista suben
en escalera —Personerías Municipales B/.500, Fiscalías de Circuito B/.1,000,
Fiscalías Superiores B/.1,500— y la autoridad de jurisdicción nacional
cobrando B/.200 rompería la escalera hacia abajo, por debajo del escalón más
bajo.

**Afecta** `orden` 436: `montoOficial` es 20000.

## 7. `B/.1,000,00` usa coma donde va el punto decimal

**Dice** (`orden` 403, `PROCESO ANTE LA JURISDICCIÓN DE FAMILIA Y MENORES`,
numeral `7`): «Impugnación de Paternidad — **B/.1,000,00**».

**Se lee B/.1,000.00** (100000 centavos) por la regla posicional, y esa
lectura coincide con lo que la sección cobra en sus renglones vecinos
—Filiación, Adopción, Matrimonios de Hecho, todos B/.1,000.00—. O sea que acá
la errata es tipográfica y no cambia el monto; se anota para que nadie la
tome por una grafía distinta de miles.

**Afecta** `orden` 403.

## 8. `B/.200 00` y `B/.400 00`: un espacio donde va el punto decimal

**Dice**, en cuatro renglones de `ASUNTOS DE DERECHO DEL TRABAJO`: `B/.200 00`
(`orden` 172, 178 y 181) y `B/.400 00` (`orden` 189).

**Se leen B/.200.00 y B/.400.00** y coinciden con sus hermanos de sección
—«Para el empleador B/.200.00» aparece también con punto en el renglón 183—.
No cambia ningún monto.

**Afecta** `orden` 172, 178, 181 y 189.

## 9. El monto duplicado de la conciliación judicial

**Dice** (`orden` 193, `ASUNTOS DE DERECHO DEL TRABAJO`, numeral `11`):
«Conciliación judicial mutuo acuerdo(extra judicial)» con **B/.250.00
impreso dos veces**, una debajo de la otra, en la columna del monto.

**Es casi seguro un renglón duplicado en la maqueta** —un B/.250.00 para la
conciliación judicial y otro para la extrajudicial que quedó sin su propio
rótulo—, pero el documento no lo dice y adivinar el rótulo sería inventar un
renglón.

Se transcribe como regla, con el texto `B/.250.00 B/.250.00`, y **no** como
monto fijo, justamente para que no pase por un precio cerrado de B/.250 ni de
B/.500.

**Afecta** `orden` 193: `clase` `regla`, `montoOficial` nulo.

## 10. El monto sin sigilo de la liquidación del régimen matrimonial

**Dice** (`orden` 408, numeral `12`): «Disoluciones y Liquidación de Régimen
Económico Matrimonial — **500.00 más 20% del activo neto**», sin el `B/.`
delante del 500.

**Son B/.500.00:** el acuerdo cotiza todo en balboas y lo dice en su
encabezado. Queda como regla con el texto tal cual, sin sigilo, porque lleva
además el 20% y nunca iba a ser un monto fijo.

**Afecta** `orden` 408.

## 11. El renglón sin monto: Agente Residente del derecho comercial

**Dice** (`orden` 269, `ASUNTOS DE DERECHO COMERCIAL`, numeral `10`): «Agente
Residente (Al año)» y **la columna del monto está vacía**.

**No es un rubro de agrupación:** no tiene hijos, y el acuerdo sí cotiza el
agente residente en otras dos secciones —B/.200.00 al año en la Autoridad
Marítima (`orden` 59) y B/.300.00 al año en el fideicomiso (`orden` 291)—.
Parece una omisión de la composición.

No se le pone monto. Queda con `clase` `rubro` y `montoOficial` nulo, que es
lo que el papel dice: nada.

**Afecta** `orden` 269.

## 12. La numeración del Ministerio de Vivienda está corrida

**Dice**: «1. Confección de Arrendamiento / 2. a) Habitacional B/. 50.00 /
3. b) Comercial B/.100.00 / 4. Solicitudes de desahucio…».

**Está corrida.** Los dos sub-renglones del arrendamiento llevan a la vez una
medida propia —`2.`, `3.`— y su letra —`a)`, `b)`—, y por eso toda la sección
queda con un numeral de más: el último renglón es el 17 cuando hay quince
conceptos.

Se transcribe tal cual: numeral `2` con concepto `a) Habitacional` y numeral
`3` con concepto `b) Comercial`.

**Afecta** `orden` 327, 328 y 329.

## 13. Los numerales del acuerdo se repiten, y no se renumeran

No es una errata aritmética, pero es la primera cosa que sorprende al mirar
`arancel.json`: **31 renglones comparten su numeral con otro de la misma
categoría**. Tres causas, todas del documento:

1. Las letras de tercer nivel vuelven a empezar en cada padre. El acuerdo
   escribe `a.1`, `a.2`, `b.1` sin repetir arriba la medida, así que `b.1` es
   el primer sub-renglón de la letra `b` del 23 y también el de la letra `b`
   del 25 —`ASUNTOS DE DERECHO DEL TRABAJO`—. El numeral se guarda tal como
   está impreso, que es lo que la tajada pide.
2. Hay secciones numeradas dos veces. En `ACTUACIONES EN NEGOCIOS CRIMINALES`
   el acuerdo tiene dos bloques `5.` —«DEFENSA EN NEGOCIOS CRIMINALES» y
   «QUERELLAS Y ACCIONES PENALES DE LAS VÍCTIMAS DEL DELITO»— y vuelve a
   numerar desde 1 dentro de cada bloque.
3. Los renglones que el documento imprime **sin numerar** heredan el numeral
   de su padre, que es el único que el papel pone: «y por cada prórroga»
   (`orden` 2) cuelga del `1` de migración, «Elaboración» y «Revisión»
   (`orden` 78 y 79) del `3` de contratos administrativos.

Por eso la clave de un renglón es `orden`, no `numeral`. T-2 lo tiene que
respetar: la restricción de unicidad va sobre `(tenant_id, orden)`, nunca
sobre el numeral.

## 14. Lo que la maqueta no deja reconstruir, y queda dicho

Dos renglones de `ASUNTOS DE DERECHO PROCESAL (CIVIL-COMERCIAL)` quedaron
peor de lo que están en el papel, y es honesto decirlo acá en vez de taparlo:

- **`orden` 371** (numeral `7.1.b`): el papel dice «De 20,001.00 en adelante —
  10%» dentro de una celda de tabla que `pdftotext -layout` desarma en el
  orden equivocado. Quedó `concepto` «De adelante» y `reglaOficial`
  «20,001.00 en 10%». El 10% está, el tramo está, el orden de las palabras
  no.
- **`orden` 390** (numeral `8.3.4`) y sus seis hijos `8.3.4.a`…`8.3.4.f`: el
  «4. Amparo de Garantías y Acciones de Inconstitucionalidad» es hermano del
  3 y no su hijo, pero el volcado lo indenta cuatro columnas a la derecha del
  3 y la jerarquía se lee mal. El numeral correcto sería `8.4`. Lo mismo, en
  menor grado, con `orden` 72 (`6.7`, que debería ser `7`).

Ninguno de los dos afecta un monto. Se dejan anotados para que la pantalla de
T-3 no los presente como si fueran fieles al papel.

## 15. Erratas de ortografía que no tocan ningún monto

Se transcriben tal cual, por lo mismo que la lectura 5:

| `orden` | Dice | Debería decir |
|---|---|---|
| 116 | `Representantes o Consejales y suplentes` | `Concejales` |
| 358 | `Declarativos, acertivos` | `asertivos` |
| 422 | `Suspención de la Patria Potestad` | `Suspensión` |
| 137 | `) De B/.100,001.00 hasta B/.150,000.00` | el acuerdo imprime `g) )`, con un paréntesis de más |
