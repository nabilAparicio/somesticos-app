-- La bitácora, reconstruida para admitir los verbos de las líneas (T-3,
-- unidad A, de `odd/tasks/cotizaciones.md`).
--
-- `0001`, `0002`, `0003` y `0004` ya corrieron y **no se tocan**. Este
-- archivo existe por eso: es la cuarta ampliación del vocabulario de la
-- bitácora y la primera que no entra editando `0002`.
--
-- ## Por qué este archivo existe
--
-- `0002_bitacora_inmutable.sql` fue editado tres veces —T-14 agregó `cerrado`
-- y `reabierto`, T-2 A agregó `cotizacion` al `CHECK` de `entidad`, y T-2 C
-- agregó los cuatro verbos de módulo— y en su tercera vez dejó escrito el
-- tope con todas las letras:
--
--   «**Y acá se termina.** No hay cuarta: tres es el tope […] Si hace falta
--   uno más antes del primer despliegue, va en una migración nueva que
--   reconstruya `bitacora` y **que se lleve los tres disparadores con su
--   comentario diciendo de dónde vino cada uno**, con el costo pagado a la
--   vista.»
--
-- T-3 necesita cuatro verbos más —`linea_agregada`, `linea_editada`,
-- `linea_quitada` y `lineas_reordenadas`—, así que **le toca la
-- reconstrucción**. No se vuelve a discutir si convenía editar `0002`: eso
-- ya se decidió, y lo que esta migración hace es cumplir el trato.
--
-- ## El costo que `0002` anticipó, pagado a la vista
--
-- SQLite no tiene `ALTER TABLE … ADD CONSTRAINT`, así que ampliar un `CHECK`
-- obliga al procedimiento de siempre: tabla nueva, copia, borrado, renombre.
-- Y un `DROP TABLE bitacora` **se lleva todo lo que cuelga de ella**: su
-- índice y sus tres disparadores. Los tres se recrean acá, y el comentario
-- de cada uno dice de dónde vino:
--
-- | Objeto                                    | Lo escribió |
-- |-------------------------------------------|-------------|
-- | `bitacora_entidad` (índice)               | `0002`      |
-- | `bitacora_no_se_actualiza`                | `0002`      |
-- | `bitacora_no_se_borra`                    | `0002`      |
-- | `bitacora_tenencia_coherente_al_insertar` | `0003`      |
--
-- El tercer disparador es el caro, y es exactamente el costo que `0002`
-- nombró: **queda declarado en un archivo distinto del que lo escribió**.
-- Quien lea `0003` ve ahí una guarda de tenencia que en la base ya no es la
-- fila de `sqlite_master` que ese archivo creó, sino la que crea ésta.
--
-- ## Y por qué no hay una nota en `0003` apuntando acá
--
-- Se evaluó y se descartó, por tres razones:
--
--  1. **`0003` ya corrió**, y el permiso para editar una migración aplicada
--     era una excepción acotada a `0002` que su propio texto declaró
--     terminada. Invocarla de nuevo para poner un comentario sería gastar la
--     excepción en lo que menos la necesita.
--  2. **Una nota en prosa no se verifica.** El riesgo real no es que alguien
--     lea `0003` y se confunda un rato: es que una reconstrucción pierda o
--     cambie una guarda en silencio. Eso lo cierra una prueba, no un
--     comentario, y la prueba está escrita —ver la sección siguiente—.
--  3. **El rastro ya existe en los dos sentidos.** Este archivo nombra a
--     `0003` arriba, y quien busque `bitacora_tenencia_coherente_al_insertar`
--     en el repositorio lo encuentra en los dos lugares a la vez. Una nota
--     sería una tercera copia del mismo dato, con vida propia.
--
-- ## La prueba que faltaba, y que ahora sí cubre esto
--
-- `test/bitacora-api.spec.ts` ya vigilaba la lista de disparadores, pero
-- **comparaba nombres**: una reconstrucción que recreara
-- `bitacora_tenencia_coherente_al_insertar` con el `WHEN` cambiado, con el
-- `RAISE` ablandado o con `<>` en vez de `IS NOT` pasaba entera sin que nada
-- se pusiera rojo. Mudar una guarda de archivo es barato; mudarla y que se
-- deforme en el camino es el agujero.
--
-- Lo que lo cierra es la prueba «los disparadores de la bitácora son los
-- mismos que escribieron `0002` y `0003`», que lee las **declaraciones
-- originales** de esos dos archivos desde `TEST_MIGRATIONS` y las compara,
-- normalizadas, contra lo que hoy hay en `sqlite_master`. No es tautológica:
-- lo esperado sale de los archivos que esta migración **no** puede tocar.
--
-- ## Lo que esto le cuesta a quien ya corrió la aplicación en local
--
-- **Al revés que `0004`, esta migración arregla el estado local en vez de
-- dejarlo a medias**, y eso desactualiza el último párrafo de `0002`.
--
-- Ese párrafo decía que un D1 local ya migrado se quedaba con el `CHECK` de
-- `entidad` sin `'cotizacion'` y el de `accion` sin los verbos de módulo
-- —porque D1 no vuelve a correr una migración registrada aunque su archivo
-- cambie—, y mandaba a borrar `.wrangler/state/v3/d1`. Eso **era** cierto
-- mientras la ampliación viajara editando `0002`. Ya no: `0005` es un
-- archivo nuevo, así que D1 la aplica sí o sí, y lo primero que hace es
-- reconstruir `bitacora` con las dos listas completas. Cualquier base local
-- —recién creada o registrada hace semanas— termina con el mismo `CHECK`.
--
-- No se corrige allá porque `0002` no se toca; queda dicho acá, que es el
-- archivo que lo volvió falso. El borrado del estado local ya no hace falta
-- por este motivo.
--
-- ## Lo que esta migración NO trae
--
-- Ninguna tabla, ningún índice y ninguna columna nuevos. `cotizacion_linea`
-- ya existe desde `0004`, con su `CHECK` de clase, su `CHECK` de centavos
-- enteros, su índice único de orden y sus cuatro disparadores. T-3 no toca
-- el esquema de las líneas: lo único que le faltaba a la base era poder
-- registrar lo que les pasa.

-- ---------------------------------------------------------------------------
-- Reconstrucción con el vocabulario de `accion` ampliado
-- ---------------------------------------------------------------------------
--
-- La tabla es la de `0002`, letra por letra, con cuatro cadenas más en el
-- `CHECK` de `accion`. El de `entidad` **no se toca**: una línea no es una
-- entidad registrada, sus hechos son hechos de la cotización dentro de la
-- que se lee, igual que los de un módulo.
--
-- Las filas se **copian** y no se descartan, por el mismo argumento que
-- escribió `0002`: si existiera una con una acción fuera del vocabulario, el
-- `INSERT … SELECT` falla y la migración se detiene, que es lo que tiene que
-- pasar. Un registro de auditoría no empieza borrando evidencia. Y como el
-- vocabulario nuevo es un superconjunto del viejo, ninguna fila existente
-- puede violar el `CHECK` ampliado: la copia sólo falla si alguien metió a
-- mano algo que nunca fue válido.
--
-- Nada referencia a `bitacora`, así que el borrado y el renombre no tocan
-- ninguna llave foránea ajena y no hace falta `PRAGMA defer_foreign_keys`.
CREATE TABLE bitacora_nueva (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenant (id),
  entidad     TEXT NOT NULL CHECK (entidad IN ('area', 'cliente', 'cotizacion', 'proceso', 'tipo_cliente', 'tipo_proceso')),
  entidad_id  TEXT NOT NULL,
  accion      TEXT NOT NULL CHECK (accion IN ('borrado', 'cerrado', 'creado', 'dado_de_baja', 'editado', 'etapa_alcanzada', 'linea_agregada', 'linea_editada', 'linea_quitada', 'lineas_reordenadas', 'modulo_agregado', 'modulo_editado', 'modulo_quitado', 'modulos_reordenados', 'nota_agregada', 'pendiente_abierto', 'pendiente_cerrado', 'plan_editado', 'plantilla_editada', 'plantilla_guardada', 'reabierto', 'reactivado')),
  usuario_id  TEXT NOT NULL REFERENCES usuario (id),
  ocurrido_en TEXT NOT NULL CHECK (ocurrido_en IS strftime('%Y-%m-%dT%H:%M:%fZ', ocurrido_en)),
  detalle     TEXT
);

INSERT INTO bitacora_nueva (id, tenant_id, entidad, entidad_id, accion, usuario_id, ocurrido_en, detalle)
SELECT id, tenant_id, entidad, entidad_id, accion, usuario_id, ocurrido_en, detalle FROM bitacora;

DROP TABLE bitacora;

ALTER TABLE bitacora_nueva RENAME TO bitacora;

-- ---------------------------------------------------------------------------
-- Lo que el `DROP TABLE` se llevó, recreado de donde vino
-- ---------------------------------------------------------------------------

-- Viene de `0002`, que lo heredó de T-2: es la consulta de las dos pantallas
-- —«¿qué pasó con esto?»— y reconstruir la tabla es justo el momento en que
-- un índice se pierde en silencio.
CREATE INDEX bitacora_entidad ON bitacora (entidad, entidad_id, ocurrido_en);

-- Los dos de inmutabilidad vienen de `0002`. Van **sin condición**, como
-- allá: «reescribir con el mismo valor» sigue siendo reescribir, y una
-- excepción ahí sería la grieta por la que mañana entra un
-- `SET detalle = detalle, usuario_id = …`.
CREATE TRIGGER bitacora_no_se_actualiza
BEFORE UPDATE ON bitacora
BEGIN
  SELECT RAISE(ABORT, 'bitacora inmutable: una entrada no se actualiza');
END;

CREATE TRIGGER bitacora_no_se_borra
BEFORE DELETE ON bitacora
BEGIN
  SELECT RAISE(ABORT, 'bitacora inmutable: una entrada no se borra');
END;

-- **Éste viene de `0003`**, y es el que paga el costo que el encabezado
-- explica: queda declarado acá aunque lo haya escrito aquel archivo. Se copia
-- letra por letra, `IS NOT` incluido —con `<>`, un padre inexistente se
-- escurre y el rechazo queda en manos de una llave foránea que un `PRAGMA`
-- apaga—, y `entidad_id` sigue sin compararse con nada por la razón que
-- `0003` escribe: es polimórfico, y pedirle tenencia obligaría a resolver la
-- entidad dentro del disparador.
--
-- `bitacora` no lleva disparador de `UPDATE` ni de `DELETE` de tenencia, y
-- tampoco los llevaba antes: `bitacora_no_se_actualiza` y
-- `bitacora_no_se_borra` abortan las dos escrituras sin condición, así que
-- cualquier otro sería código que no puede llegar a evaluarse.
CREATE TRIGGER bitacora_tenencia_coherente_al_insertar
BEFORE INSERT ON bitacora
WHEN NEW.tenant_id IS NOT NULL
 AND ((NEW.usuario_id IS NOT NULL
        AND (SELECT tenant_id FROM usuario WHERE id = NEW.usuario_id) IS NOT NEW.tenant_id))
BEGIN
  SELECT RAISE(ABORT, 'tenencia cruzada: bitacora debe compartir tenant_id con las filas que referencia');
END;
