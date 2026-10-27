# El selector de cliente busca

## El problema

Las palabras del usuario, que son el criterio:

> «Ese dropdown hay que mejorarlo con un buscador y scroll infinito. ¿Qué
> pasará cuando haya 50 clientes o 100 clientes?»

La primera mitad es cierta y urgente: un `<select>` nativo con 100 opciones
se recorre a ojo, no se busca. El cliente es el campo obligatorio de la
cotización —I-1— y es lo primero que se toca en la pantalla.

## La segunda mitad, medida antes de construirla

El scroll infinito **no entra**, y la razón es un dato, no una opinión:

| Hecho | Dónde |
|---|---|
| `GET /api/clientes` no tiene `LIMIT`, `OFFSET` ni cursor: devuelve todo | `worker/clientes/rutas.ts`, `repositorio.ts` |
| La pantalla pide la lista entera una vez y la guarda en memoria | `FormularioDeCotizacion.tsx:118` |
| 8 clientes pesan 751 bytes de datos: ~94 bytes cada uno | medido en la base local |

A 100 clientes eso son **9,4 KB**; a 1.000, **94 KB**. Y lo decisivo:
**scrollear de a poco un arreglo que ya está entero en memoria no ahorra
nada** —ni red, ni tiempo de carga, ni memoria—, solo agrega código que
después hay que mantener. El scroll infinito sirve para **no traer** filas, y
eso exige que el servidor pagine. Hoy no pagina.

**Cuál es el disparador de verdad.** El día que la respuesta de
`/api/clientes` se mida como un problema, el arreglo es `LIMIT` más cursor en
la ruta y que el combobox pida de a tandas. La forma de la pantalla no
cambia, así que lo que se construye hoy no se tira: se le cambia de dónde
saca las opciones. Se escribe cuando el número lo pida, no antes.

## La forma: el combobox que ya existe

`src/pantallas/cotizaciones/SelectorDeServicio.tsx` ya es un combobox
buscable, con teclado completo, que hoy corre sobre **282 servicios** en esta
misma pantalla. Doscientos ochenta y dos es más que los cien que preocupan.

Así que esto **no es un componente nuevo**: es sacarle a ése la parte que no
es del arancel y usarlo para las dos cosas. Dos selectores con la misma forma
en la misma pantalla, y una sola implementación del teclado, del `role`, del
`aria-activedescendant` y de la lista vacía.

Si separarlo ensucia más de lo que ahorra, la salida honesta es un segundo
componente que **comparta la lógica pura** —el filtrado y la aritmética de la
opción activa, que ya viven en módulos aparte— y no copiarla. Lo que no se
acepta es un tercer teclado escrito a mano.

## Alcance autorizado

Entra: el selector de cliente de la pantalla de alta y de edición de
cotización, y la reutilización del combobox.

**No entra**: paginación en el servidor, scroll infinito, detección de
duplicados, y tocar el selector de servicio más allá de lo que la
reutilización exija.

## Las tareas

### T-1 · El cliente se busca, no se recorre

- [ ] El `<select>` de cliente pasa a combobox buscable, con el monto de
      teclado completo que el de servicio ya tiene: flechas, Enter, Escape,
      `aria-activedescendant`, y foco visible.
- [ ] Una sola implementación del comportamiento. Si hay dos componentes,
      comparten la lógica pura; no se copia el teclado.
- [ ] El botón de **cliente nuevo** sigue al lado y sigue funcionando: la
      tajada anterior lo puso ahí y no se pierde.
- [ ] Sin clientes, el combobox lo dice y manda al botón, como ya hace hoy
      el texto de ayuda.
- [ ] Elegir con el teclado deja el cliente elegido de verdad, y la
      cotización se puede guardar sin tocar el mouse.

## Criterios de aceptación

1. Escribir filtra la lista de clientes.
2. Se elige con teclado de punta a punta, sin mouse.
3. El botón de cliente nuevo sigue creando y dejando elegido.
4. No hay una segunda implementación del teclado del combobox.
5. `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e` en verde.

## Verificación

`pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm test:e2e`

## Progreso

- Documento creado. Ninguna tarea cerrada.
