-- Un precio es una cifra, no una cifra que alguien tecleó
-- (T-2 bis de `odd/tasks/precios-en-la-cotizacion.md`).
--
-- `0001` a `0014` ya corrieron y **no se tocan**.
--
-- ## Esto relaja un invariante a propósito, y el motivo es del usuario
--
-- `0013` escribió la guarda como «una línea sólo puede salir de un renglón con
-- **monto del bufete**». Sobre esa regla, T-2 construyó el catálogo que la
-- cotización ofrece: los renglones con precio propio, 7 de 453 en la base de
-- desarrollo. Al verlo en pantalla, el usuario corrigió el supuesto entero:
--
--   > «Siempre debemos mostrar todos los precios, hayan sido modificados por mí
--   > o sean los preestablecidos. Los preestablecidos son eso, preestablecidos:
--   > siempre pueden ser editables, pero **son la norma hasta que se editen, no
--   > son una subcategoría**.»
--
-- Y tiene razón contra el propio sistema, no sólo contra su gusto: la pantalla
-- de precios **ya** muestra `monto_oficial` como el valor del campo cuando el
-- bufete no escribió el suyo —`precioALaVista`, en
-- `src/pantallas/catalogos/precios.ts`, es de la tajada anterior—. O sea que
-- había **dos criterios distintos para la misma pregunta** en dos pantallas del
-- mismo sistema: para los precios, un renglón sin editar tiene precio; para la
-- cotización, no existía.
--
-- Así que la guarda pasa a exigir **una cifra**, de cualquiera de las dos
-- columnas:
--
--     COALESCE(NEW→r.monto, r.monto_oficial) IS NULL  →  se rechaza
--
-- ## Qué sigue rechazado, que es lo que hace que la guarda siga valiendo algo
--
-- Medido contra la base local de desarrollo, con los 453 renglones sembrados:
--
--   | Clase            | Filas | Con cifra | ¿Puede ser origen? |
--   |------------------|-------|-----------|--------------------|
--   | `monto`          |  282  |    282    | sí                 |
--   | `regla`          |   97  |      0    | no, hasta que el bufete le escriba un monto |
--   | `rubro`          |   74  |      0    | **nunca**          |
--
-- Los 74 rubros quedan afuera por donde ya quedaban: el `CHECK`
-- `un_rubro_no_lleva_precio` de `0012` les prohíbe el `monto`, y la siembra no
-- les pone `monto_oficial` porque el acuerdo los imprime sin ningún valor —son
-- encabezados—. Las 97 reglas por cuantía quedan afuera mientras no tengan
-- número: el acuerdo las imprimió como un porcentaje por tramos, y la tajada
-- anterior decidió a propósito que el bufete pueda escribirles un monto al lado
-- del texto. En cuanto se lo escriba, pasan a ser origen; es la misma puerta que
-- ya tenían en la pantalla de precios.
--
-- Esto sigue siendo **un** disparador por operación y no dos, por el argumento
-- que `0013` dejó escrito: un segundo que dijera lo del rubro sería la segunda
-- guarda para el mismo hecho, y neutralizar cualquiera de las dos dejaría a la
-- otra atrapando el caso sin que ninguna prueba se pusiera roja.
--
-- ## Lo que esto NO es: una comparación
--
-- Vale decirlo porque es la primera lectura posible de un `COALESCE` entre el
-- precio del bufete y el del acuerdo. No se compara nada: el `COALESCE` elige
-- **cuál de los dos existe**, nunca cuál es mayor. La regla de
-- `odd/tasks/arancel-de-honorarios.md` no se renegocia —«el sistema sugiere, no
-- juzga»— y en esta migración eso es estructura por omisión: no hay un solo
-- operador de orden entre las dos columnas, y no puede haberlo, porque lo que la
-- guarda pregunta es si hay número y no cuánto vale.
--
-- Y lo otro que no es: un permiso para que el monto de la línea salga de
-- `monto_oficial`. La línea guarda **el importe que llegó** —`repositorio.ts` no
-- lee el catálogo, y hay una prueba con el importe distinto a propósito—. Esta
-- guarda decide de qué renglones se puede decir «de acá salió el precio», no
-- cuánto cobra la línea.
--
-- ## El costo conocido: recrear un disparador lo manda al frente
--
-- `0013` lo dejó medido y `0014` lo pagó una vez: SQLite encola cada disparador
-- nuevo al frente de la lista de su tabla, así que el último creado es el primero
-- que corre, y el orden es **oficialmente indefinido**. Acá se recrean los dos
-- del origen del precio —el del `INSERT` y el del `UPDATE`—, y conviene decir por
-- qué esta vez no cambia ningún mensaje observable:
--
--   * el del `UPDATE` ya estaba al frente de su lista: `0014` lo recreó por
--     última vez y nada lo movió después. Vuelve a quedar donde estaba;
--   * el del `INSERT` también: `0013` lo creó **después** de los dos de tenencia
--     en el mismo archivo, así que ya corría primero entre los `BEFORE INSERT`
--     de `cotizacion_linea`.
--
-- La red que lo vigila no hubo que escribirla: la prueba «`cotizacion_linea`
-- lleva exactamente sus disparadores» de `test/esquema-cotizaciones.spec.ts`
-- compara la lista contra `sqlite_master` de forma exacta, así que un `DROP` sin
-- su `CREATE` se pone rojo acá y no en producción. Y los nombres no cambian: un
-- nombre nuevo habría obligado a tocar esa lista, que es exactamente la clase de
-- cambio que esconde un disparador caído.

-- ===========================================================================
-- M-1 · La guarda del `INSERT` pide una cifra
-- ===========================================================================
--
-- El `EXISTS` se conserva letra por letra en su forma —y no se «simplifica» a
-- `NOT EXISTS`— por el argumento de `0013`: con un identificador que no apunta a
-- ninguna fila, `NOT EXISTS` daría verdadero y el rechazo hablaría del precio
-- cuando el defecto real es una llave que no apunta a nada. El renglón
-- inexistente y el del bufete vecino siguen muriendo en el disparador de
-- tenencia, y eso tiene prueba propia en `test/arancel-linea.spec.ts`.
--
-- El mensaje cambia porque la regla cambió: decir «monto del bufete» después de
-- esta migración mandaría a buscar un precio propio que no hace falta.

DROP TRIGGER IF EXISTS cotizacion_linea_el_origen_del_precio_tiene_precio_al_insertar;

CREATE TRIGGER cotizacion_linea_el_origen_del_precio_tiene_precio_al_insertar
BEFORE INSERT ON cotizacion_linea
WHEN NEW.arancel_renglon_id IS NOT NULL
 AND EXISTS (SELECT 1 FROM arancel_renglon r
              WHERE r.id = NEW.arancel_renglon_id
                AND COALESCE(r.monto, r.monto_oficial) IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'origen del precio: una línea sólo puede salir de un renglón que tiene una cifra, propia o del acuerdo, y un rubro nunca la tiene');
END;

-- ===========================================================================
-- M-2 · La del `UPDATE` pide una cifra, y **sigue mirando el cambio**
-- ===========================================================================
--
-- `NEW.arancel_renglon_id IS NOT OLD.arancel_renglon_id` se conserva, y no es
-- copiar por inercia: es el acotamiento entero de
-- `0014_la_guarda_del_origen_mira_el_cambio.sql`, y volver a quitarlo
-- reintroduciría su defecto —un borrador que deja de aceptar **cualquier**
-- escritura porque alguien vació un precio en otra pantalla, sin forma de salir,
-- porque la pantalla que causó el bloqueo no es la que falla—.
--
-- Relajar la condición de la cifra **no reduce** la superficie de ese defecto, y
-- vale decir por qué no: un renglón de clase `regla` no tiene `monto_oficial`, así
-- que vaciarle el `monto` lo deja sin ninguna cifra y la secuencia de `0014`
-- sigue siendo alcanzable, letra por letra. Lo único que cambió es cuántas filas
-- pueden llegar a ese estado. La prueba que lo mide —«dejar un servicio sin cifra
-- no congela la línea que ya salió de él», en `test/arancel-linea.spec.ts`—
-- cambió de fila por eso mismo: sobre un renglón con cita de 2001 ya no mediría
-- nada, porque la guarda no llegaría a dispararse.

DROP TRIGGER IF EXISTS cotizacion_linea_el_origen_del_precio_tiene_precio_al_actualizar;

CREATE TRIGGER cotizacion_linea_el_origen_del_precio_tiene_precio_al_actualizar
BEFORE UPDATE ON cotizacion_linea
WHEN NEW.arancel_renglon_id IS NOT NULL
 AND NEW.arancel_renglon_id IS NOT OLD.arancel_renglon_id
 AND EXISTS (SELECT 1 FROM arancel_renglon r
              WHERE r.id = NEW.arancel_renglon_id
                AND COALESCE(r.monto, r.monto_oficial) IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'origen del precio: una línea sólo puede salir de un renglón que tiene una cifra, propia o del acuerdo, y un rubro nunca la tiene');
END;
