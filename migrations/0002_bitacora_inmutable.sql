-- La bitácora: inmutable y con vocabulario cerrado (T-10 de
-- `odd/tasks/crm-procesos.md`).
--
-- `0001_esquema_inicial.sql` ya corrió y **no se toca**. Esta migración hace
-- dos cosas, y las dos son intrínsecas a la función que T-10 construye, no
-- una limpieza aparte:
--
--   1. **La bitácora se vuelve inmutable**, con los mismos dos disparadores
--      que `nota` tiene desde T-2. El argumento es el que esa migración ya
--      escribió, y acá vale más: un registro que la consola de D1 puede
--      reescribir no es un registro. Una nota mal borrada se nota porque
--      alguien la extraña; una entrada de bitácora borrada no la extraña
--      nadie, que es exactamente por qué tiene que ser imposible.
--
--   2. **`entidad` y `accion` pasan a ser vocabularios cerrados**, con
--      `CHECK`, que es la forma que fija `docs/diseno.md` §6 («no hay `ENUM`
--      nativo; los valores cerrados se imponen con `CHECK`») y que T-2 ya
--      usó para `proceso.estado` y `proceso.origen`.
--
-- ## Por qué el `CHECK` y no solo la unión de TypeScript
--
-- La unión existe igual, en `worker/contract.ts`, y hace falta: es la que
-- impide que el único camino de escritura emita una acción inventada y la
-- que deja exigir una frase por acción con un `Record` exhaustivo, como
-- `src/mensajes.ts`. Pero §5 es explícito: una regla que vive solo en el
-- código es la que el primer script de importación se salta. Sin el `CHECK`,
-- en dos años conviven `crear`, `creado`, `create` y `CREAR` y ninguna
-- consulta sirve — y el día que eso pase, la bitácora ya no se puede
-- arreglar, porque sus filas no se editan.
--
-- El criterio del proyecto —catálogo en la base cuando el valor es solo una
-- etiqueta, en código cuando hay código detrás— no elige entre las dos:
-- detrás de `etapa_alcanzada` hay código, así que no es un catálogo editable
-- (agregar un verbo tiene que ser un despliegue, porque sin su frase y sin
-- el sitio que lo emite el verbo no significa nada); y §5 obliga a que la
-- base lo sostenga igual. `test/bitacora-api.spec.ts` compara las dos
-- mitades y falla si se separan.
--
-- ## Por qué se reconstruye la tabla
--
-- SQLite no tiene `ALTER TABLE … ADD CONSTRAINT`. Agregar un `CHECK` a una
-- tabla existente es el procedimiento de reconstrucción de siempre: tabla
-- nueva, copia, borrado, renombre. Las filas se **copian** en vez de
-- descartarse aunque hoy no haya ninguna: si existiera una con una acción
-- fuera del vocabulario, el `INSERT … SELECT` falla y la migración se
-- detiene, que es lo que tiene que pasar. Descartarlas en silencio sería
-- empezar un registro de auditoría borrando evidencia.
--
-- Nada referencia a `bitacora`, así que el borrado y el renombre no tocan
-- ninguna llave foránea ajena y no hace falta `PRAGMA defer_foreign_keys`.
--
-- ## Lo que esta migración NO trae, a propósito
--
-- Las tres pendientes que T-6 y T-11 dejaron señaladas —unicidad de nombre
-- por tenant en `area`, `tipo_cliente` y `tipo_proceso`; que
-- `etapa_plantilla.tenant_id` coincida con el de su tipo; y que
-- `proceso.tipo_proceso_id` y `proceso.cliente_id` sean del mismo tenant que
-- el proceso— son transversales y están agendadas aparte. Mezclarlas acá
-- haría esta migración irrevisable.
--
-- Y no hay **relleno retroactivo**. Lo que pasó antes de T-10 no está en la
-- bitácora. Inventarlo sería escribir hechos que nadie presenció en la única
-- tabla del sistema que existe para no mentir; la pantalla lo dice en vez de
-- disimularlo.

-- ---------------------------------------------------------------------------
-- Reconstrucción con los dos vocabularios cerrados
-- ---------------------------------------------------------------------------

-- `entidad_id` sigue siendo `TEXT` y **no** una llave foránea, a propósito:
-- es polimórfico, y además un área borrada tiene que dejar su entrada en pie.
-- Esa es la mitad de para qué existe un registro de auditoría.
--
-- `usuario_id` sí es llave foránea: es I-6, y `docs/diseno.md` §7 dice por
-- qué la tabla `usuario` existe aunque la autenticación la haga Access —
-- «la autoría de notas, pendientes y bitácora necesita una llave foránea
-- real a la que apuntar». Consecuencia buscada: con una entrada viva no se
-- borra su autor.
CREATE TABLE bitacora_nueva (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenant (id),
  entidad     TEXT NOT NULL CHECK (entidad IN ('area', 'cliente', 'proceso', 'tipo_cliente', 'tipo_proceso')),
  entidad_id  TEXT NOT NULL,
  accion      TEXT NOT NULL CHECK (accion IN ('borrado', 'creado', 'dado_de_baja', 'editado', 'etapa_alcanzada', 'nota_agregada', 'pendiente_abierto', 'pendiente_cerrado', 'plan_editado', 'plantilla_editada', 'plantilla_guardada', 'reactivado')),
  usuario_id  TEXT NOT NULL REFERENCES usuario (id),
  ocurrido_en TEXT NOT NULL CHECK (ocurrido_en IS strftime('%Y-%m-%dT%H:%M:%fZ', ocurrido_en)),
  detalle     TEXT
);

INSERT INTO bitacora_nueva (id, tenant_id, entidad, entidad_id, accion, usuario_id, ocurrido_en, detalle)
SELECT id, tenant_id, entidad, entidad_id, accion, usuario_id, ocurrido_en, detalle FROM bitacora;

DROP TABLE bitacora;

ALTER TABLE bitacora_nueva RENAME TO bitacora;

-- El mismo índice de T-2, recreado con el mismo nombre. Es exactamente la
-- pregunta de las dos pantallas —«¿qué pasó con esto?»— y reconstruir la
-- tabla es justo el momento en que un índice se pierde en silencio.
CREATE INDEX bitacora_entidad ON bitacora (entidad, entidad_id, ocurrido_en);

-- ---------------------------------------------------------------------------
-- La bitácora es inmutable
-- ---------------------------------------------------------------------------
--
-- Los dos disparadores cubren las dos formas de reescribir la historia, y
-- ninguno lleva condición: «reescribir con el mismo valor» sigue siendo
-- reescribir, y una excepción ahí sería la grieta por la que mañana entra un
-- `SET detalle = detalle, usuario_id = …`.
--
-- Consecuencia buscada, la misma que anunció T-2 para `nota` y un escalón
-- más ancha: con una entrada viva tampoco se borran su autor ni su tenant,
-- porque las llaves foráneas quedan en `NO ACTION`. Las pruebas que escriben
-- no pueden limpiar con `DELETE FROM usuario`; se aíslan al revés, con
-- identificadores nuevos por prueba y las dos personas del bufete creadas
-- una sola vez.

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
