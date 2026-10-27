# Un lead entra y se le cotiza sin salir de la pantalla

## El problema

Las palabras del usuario, que son el criterio:

> «Acá, al crear nueva cotización, debo ser capaz de crear un nuevo cliente.
> Imaginá un lead recién creado: requiere esto, una identidad rápida. Puede
> ser a través de un modal.»

Hoy el alta de cotización ofrece un `<select>` con los clientes que ya
existen y nada más. Si el que llamó no está en la lista —que es el caso
normal de un lead— hay que irse a `/clientes/nuevo`, cargarlo, y volver. Y al
volver, **lo que se había escrito en el alta de cotización no está**: la
pantalla se desmontó.

O sea que el camino más frecuente del negocio —entra un interesado nuevo y se
le cotiza— es el único que obliga a abandonar la pantalla a mitad de camino.

## La regla ya existe y no se inventa otra

`src/pantallas/clientes/formulario.ts:108` lo dice con todas las letras:

> «El criterio de T-5: nombre y UN medio de contacto. Nada más es exigible.»

`validarBorrador` ya exige exactamente eso: `nombre` no vacío, y un correo
con forma de correo **o** un teléfono con algún dígito. Documento,
representante legal, tipo y notas son opcionales desde que nacieron.

Entonces el modal **no define un cliente más pobre**: muestra los campos que
alcanzan para que el cliente exista, con la misma función de validación, el
mismo `aPeticion` y la misma ruta. Un cliente creado desde acá es un cliente
igual a cualquier otro, con los campos que todavía nadie sabe. Eso se dice en
la pantalla, para que nadie crea que creó algo de segunda.

**Reusar `validarBorrador` no es ahorro de tipeo: es la única forma de que
las dos puertas no se desincronicen.** Una segunda validación escrita a mano
acá sería la que acepta un cliente que la pantalla completa rechaza.

## La forma

Al lado del selector de cliente, un botón que abre un modal con:

- **Nombre**, obligatorio.
- **Teléfono** y **correo**: uno de los dos alcanza, y el modal lo dice
  antes de que alguien lo descubra fallando.
- **Tipo de cliente**, opcional, porque ya lo es.

Al guardar, el cliente nace **y queda elegido en la cotización**. Ese es el
punto entero: si hay que ir a buscarlo a la lista, no se ahorró nada.

Y lo que ya estaba escrito en el alta —el vencimiento, si lo puso— **sigue
ahí**. El modal no puede desmontar ni reiniciar el formulario que lo abrió;
si lo hace, cambió un viaje de ida y vuelta por una pérdida silenciosa, que
es peor.

El resto de la ficha se completa después, desde la pantalla del cliente. El
modal lo dice en una línea.

## Alcance autorizado

Entra: el botón, el modal, la creación, la selección automática, y sus
pruebas.

**No entra**: cambiar el formulario completo de `/clientes/nuevo`, tocar la
validación, ni agregar campos nuevos a `cliente`. Tampoco buscar duplicados
—«¿este cliente ya existe?»— que es un problema real pero es otro, y
resolverlo a medias acá sería peor que no resolverlo.

## Las tareas

### T-1 · Un cliente nace desde el alta de cotización

- [ ] Botón junto al selector de cliente, con nombre accesible propio.
- [ ] Modal con `<dialog>` nativo, como `ListaDeServicios.tsx`: velo,
      `Escape`, foco que entra y vuelve al botón que lo abrió.
- [ ] Nombre, teléfono, correo y tipo. La regla de «uno de los dos
      contactos» dicha **antes** de fallar, no como error.
- [ ] `validarBorrador` y `aPeticion` reusados tal cual. Ninguna validación
      nueva.
- [ ] Al guardar: el cliente nace, el modal se cierra, **y queda elegido**.
- [ ] Lo ya escrito en el alta de cotización sobrevive. Se prueba.
- [ ] El error del servidor se ve **dentro del modal**, no detrás de él.

## Criterios de aceptación

1. Desde el alta de cotización se crea un cliente sin navegar a otra ruta.
2. El cliente recién creado queda seleccionado, sin buscarlo.
3. Lo escrito antes de abrir el modal sigue escrito después de cerrarlo.
4. Un nombre sin ningún contacto no pasa, y lo dice en el modal.
5. `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e` en verde.

## Verificación

`pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm test:e2e`

Prueba primero: la lógica del borrador es pura y ya tiene pruebas que se
extienden; el modal y la selección automática se miden de punta a punta.

## Progreso

- Documento creado. Ninguna tarea cerrada.
