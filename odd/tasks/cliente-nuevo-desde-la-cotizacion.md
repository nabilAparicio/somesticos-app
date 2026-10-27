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

- [x] Botón junto al selector de cliente, con nombre accesible propio.
- [x] Modal con `<dialog>` nativo, como `ListaDeServicios.tsx`: velo,
      `Escape`, foco que entra y vuelve al botón que lo abrió.
- [x] Nombre, teléfono, correo y tipo. La regla de «uno de los dos
      contactos» dicha **antes** de fallar, no como error.
- [x] `validarBorrador` y `aPeticion` reusados tal cual. Ninguna validación
      nueva.
- [x] Al guardar: el cliente nace, el modal se cierra, **y queda elegido**.
- [x] Lo ya escrito en el alta de cotización sobrevive. Se prueba.
- [x] El error del servidor se ve **dentro del modal**, no detrás de él.

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
- **T-1 cerrada.** Prueba primero: las dos suites se escribieron antes del
  código y fallaron como tenían que fallar —la unitaria por módulo
  inexistente, las diez de punta a punta esperando el botón «Crear un cliente
  nuevo» que todavía no estaba—.

  Lo que se agregó:

  - `src/pantallas/cotizaciones/cliente-nuevo.ts` — la costura pura: los
    cuatro campos del modal, los textos, y `borradorDelClienteNuevo`, que
    completa los cinco campos que el modal no pregunta para que `aPeticion`
    los mande en `null` y no en `""`. **Ninguna validación propia.**
  - `src/pantallas/cotizaciones/ClienteNuevo.tsx` — el `<dialog>`, con la
    misma disciplina ya medida en `ListaDeServicios.tsx`: `onCancel` en vez
    de `onClose` y `useLayoutEffect` en vez de `useEffect`. Lee el catálogo
    de tipos al abrirse, no antes, y sigue sirviendo si esa lectura falla.
  - `FormularioDeCotizacion.tsx` — el botón al lado del selector y el modal
    montado como **hermano** del `<form>`, no como hijo: un formulario
    anidado no es HTML válido. El borrador no se toca al abrir ni al cerrar,
    que es lo que hace que lo tecleado sobreviva.
  - `src/estilos/layout.css` — `.campo__con-accion` (flex que envuelve, sin
    umbral de pantalla) y `.cliente-nuevo`, con las medidas de
    `.lista-de-servicios` y un tope más angosto porque son campos y no tabla.

  Verificación observada: `pnpm lint` limpio · `pnpm typecheck` limpio ·
  `pnpm test` 2491 pruebas en 48 archivos, todas en verde (13 nuevas) ·
  `pnpm test:e2e` 497 en verde (10 nuevas). La inestabilidad conocida de
  `e2e/sin-scroll-horizontal.spec.ts` no apareció en esta corrida.

  Dos cosas del documento que la implementación corrigió:

  1. La ruta del alta es `/cotizaciones/nuevo`, no «nueva».
  2. El desplegable de tipos de cliente obligó a una lectura que el alta de
     cotización no hacía (`GET /api/tipos-cliente`). Vive en el modal y no en
     la pantalla, así que la pantalla de siempre no paga por una puerta que
     la mayoría de las veces no se abre.
