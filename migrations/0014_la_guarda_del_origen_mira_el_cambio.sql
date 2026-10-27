-- La guarda del origen del precio mira el **cambio**, no la fila entera
-- (corrección de `0013`, T-1 de `odd/tasks/precios-en-la-cotizacion.md`).
--
-- `0001` a `0013` ya corrieron y **no se tocan**.
--
-- ## El defecto, encontrado probando la base a mano
--
-- `0013` dejó la guarda del `UPDATE` escrita así:
--
--     WHEN NEW.arancel_renglon_id IS NOT NULL
--      AND EXISTS (SELECT 1 FROM arancel_renglon r
--                   WHERE r.id = NEW.arancel_renglon_id AND r.monto IS NULL)
--
-- Esa condición no mira el cambio: mira el estado de la fila **después** de
-- cualquier escritura. Y como `fijarMonto(…, null)` puede quitarle el precio
-- a un renglón que una línea ya nombra, la secuencia completa es alcanzable:
--
--   1. la línea apunta a un renglón tarifado — permitido, y correcto;
--   2. alguien vacía el precio de ese renglón en la pantalla de precios —
--      permitido, y también correcto: el bufete puede dejar de tarifar un
--      servicio;
--   3. a partir de ahí **la línea no se puede volver a escribir**. Ninguna
--      escritura, ni siquiera corregirle una falta de ortografía al
--      concepto, que no tiene absolutamente nada que ver con el precio.
--
-- Medido contra la base local antes de escribir esto: con el renglón sin
-- precio, `UPDATE cotizacion_linea SET concepto = 'editado a mano'` muere con
-- «origen del precio: una línea sólo puede salir de un renglón con monto del
-- bufete». El monto de la línea seguía intacto (B/.1,950.00) y una cotización
-- emitida no se movía —las líneas de una emitida ya no se escriben desde
-- `0006`—, así que lo único que se rompe es **un borrador, y se rompe
-- entero**: queda congelado por algo que pasó en otra pantalla.
--
-- Un borrador que deja de aceptar escrituras es peor que el invariante que la
-- guarda defiende, porque la persona no tiene forma de salir: la pantalla que
-- causó el bloqueo no es la que falla.
--
-- ## Qué invariante había que defender, exactamente
--
-- «Una línea sólo puede **salir** de un renglón con precio del bufete». Es un
-- invariante sobre el **acto de tomar el precio**, y no sobre la fila para
-- siempre. Que el bufete deje de tarifar ese servicio mañana no vuelve falso
-- que ayer el precio salió de ahí: es exactamente el mismo razonamiento por
-- el que `snapshot.ts` congela el monto en vez de volver a buscarlo, y por el
-- que `monto_oficial` es una cita y no un valor vivo.
--
-- Así que la guarda se acota al cambio con `IS NOT OLD...`, que en SQLite
-- compara seguro contra nulo en las dos direcciones. Queda:
--
--   - poner o cambiar la referencia hacia un renglón sin precio → se rechaza,
--     que es el invariante entero;
--   - escribir cualquier otra columna de una línea cuya referencia ya era
--     válida cuando se puso → se permite;
--   - quitar la referencia (`NEW` nulo) → se permite, y ya se permitía.
--
-- El disparador de `INSERT` de `0013` **no se toca**: ahí toda escritura es
-- por definición un «poner», y su `WHEN` ya es el correcto.
--
-- ## Lo que recrear un disparador cuesta acá, y por qué igual se paga
--
-- `0013` dejó anotado que SQLite encola cada disparador nuevo al frente de la
-- lista de su tabla, así que el último creado corre primero, y que por eso
-- hubo que recrear los de inmutabilidad para devolverles la precedencia sobre
-- los de tenencia. Esta migración recrea **uno solo** y lo manda al frente.
--
-- No hay conflicto de mensajes que cuidar: esta guarda es la única que habla
-- del origen del precio, y las escrituras que podrían violar dos reglas a la
-- vez —tenencia e inmutabilidad— no tocan `arancel_renglon_id`, así que su
-- `WHEN` acotado ya no dispara en esos casos. El orden de los otros cuatro no
-- se altera porque no se recrean.

DROP TRIGGER IF EXISTS cotizacion_linea_el_origen_del_precio_tiene_precio_al_actualizar;

CREATE TRIGGER cotizacion_linea_el_origen_del_precio_tiene_precio_al_actualizar
BEFORE UPDATE ON cotizacion_linea
WHEN NEW.arancel_renglon_id IS NOT NULL
 AND NEW.arancel_renglon_id IS NOT OLD.arancel_renglon_id
 AND EXISTS (SELECT 1 FROM arancel_renglon r
              WHERE r.id = NEW.arancel_renglon_id AND r.monto IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'origen del precio: una línea sólo puede salir de un renglón con monto del bufete, y un rubro nunca lo tiene');
END;
