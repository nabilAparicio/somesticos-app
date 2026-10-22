-- Esquema inicial del CRM de procesos (tajada 1 de `odd/tasks/crm-procesos.md`).
--
-- Fuente de verdad: `docs/diseno.md` §5 (invariantes) y §6 (modelo de datos).
-- Las invariantes viven acá como restricciones de base, no como validación de
-- aplicación: si vivieran solo en el código, el primer script de importación
-- mete un huérfano.
--
-- Convenciones, decididas una vez y aplicadas en todas las tablas:
--
--   * Identificadores: `TEXT` con UUID v4. SQLite no tiene `gen_random_uuid()`,
--     así que la llave se genera en código (`worker/db/ids.ts`) y viaja en el
--     `INSERT`. Por eso ninguna columna `id` tiene `DEFAULT`.
--   * Momentos: `TEXT` con ISO 8601 en UTC, la forma exacta que produce
--     `Date.prototype.toISOString()` (`worker/db/momentos.ts`). Cada columna de
--     momento lo verifica con un `CHECK` de ida y vuelta —
--     `col IS strftime('%Y-%m-%dT%H:%M:%fZ', col)` — para que la base no
--     dependa de que la aplicación se porte bien. La ida y vuelta rechaza a la
--     vez lo que no es fecha (`strftime` devuelve NULL) y lo que es fecha pero
--     no en esta forma ('2026-10-22' vuelve como
--     '2026-10-22T00:00:00.000Z' y no coincide). Se usa `IS` y no `=` porque
--     un `CHECK` que evalúa a NULL *pasa*, y con `=` cualquier basura pasaría.
--     Un `GLOB` con la plantilla completa sería lo obvio, pero D1 lo rechaza
--     con "LIKE or GLOB pattern too complex" (verificado el 22-oct-2026).
--   * Valores cerrados: `CHECK`, no `ENUM`. SQLite no tiene enums.
--   * Booleanos: `INTEGER` restringido a 0/1.
--   * Montos: enteros en centavos. En esta tajada todavía no aparece ninguno.
--   * Vocabulario en español: es el idioma con el que habla el bufete
--     (`docs/diseno.md` §3).
--
-- Qué NO está acá y por qué:
--
--   * `cotizacion`, `cotizacion_modulo`, `cotizacion_linea`, `cuota` y
--     `movimiento_gasto` son de la tajada 2. No se adelantan.
--   * `proceso.cotizacion_linea_id` tampoco: apuntaría a `cotizacion_linea`,
--     que no existe todavía. La columna y su llave foránea entran en la
--     tajada 2, junto con la tabla a la que apuntan.
--   * I-3 (el proceso nacido de una cotización comparte cliente con ella) no es
--     expresable sin `cotizacion`. Se implementa y se prueba en la tajada 2.
--   * El borrado en cascada no se define acá. Las llaves foráneas quedan en
--     `NO ACTION`, que es lo que bloquea borrar un padre con hijos; la política
--     de borrado de plantillas y procesos es comportamiento de T-6 y T-7.

-- ---------------------------------------------------------------------------
-- Base
-- ---------------------------------------------------------------------------

-- Una sola fila por ahora (`docs/diseno.md` §7: columna sí, maquinaria no).
-- No lleva `tenant_id` porque es el tenant.
CREATE TABLE tenant (
  id     TEXT PRIMARY KEY,
  nombre TEXT NOT NULL
);

CREATE TABLE usuario (
  id        TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenant (id),
  nombre    TEXT NOT NULL,
  email     TEXT NOT NULL,
  activo    INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1))
);

CREATE UNIQUE INDEX usuario_email_unico ON usuario (tenant_id, email);

-- Catálogo, no `CHECK`: detrás de un tipo de cliente no hay código que
-- ramifique, es una etiqueta. Agregar "ONG" tiene que ser una fila, no un
-- despliegue (`docs/diseno.md` §6, "Tipos de cliente").
CREATE TABLE tipo_cliente (
  id        TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenant (id),
  nombre    TEXT NOT NULL,
  activo    INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1))
);

-- La identificación no se modela por tipo: va el par genérico
-- `documento_tipo`/`documento_numero`. Cédula, RUC, pasaporte y el registro de
-- una fundación son todos lo mismo.
--
-- Casi todo es nullable a propósito: I-1 e I-2 solo sirven si dar de alta un
-- prospecto cuesta un nombre y un teléfono.
CREATE TABLE cliente (
  id                  TEXT PRIMARY KEY,
  tenant_id           TEXT NOT NULL REFERENCES tenant (id),
  tipo_cliente_id     TEXT REFERENCES tipo_cliente (id),
  nombre              TEXT NOT NULL,
  documento_tipo      TEXT,
  documento_numero    TEXT,
  representante_legal TEXT,
  email               TEXT,
  telefono            TEXT,
  notas               TEXT,
  creado_por          TEXT NOT NULL REFERENCES usuario (id),
  creado_en           TEXT NOT NULL CHECK (creado_en IS strftime('%Y-%m-%dT%H:%M:%fZ', creado_en))
);

CREATE INDEX cliente_tenant ON cliente (tenant_id, nombre);

CREATE TABLE area (
  id        TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenant (id),
  nombre    TEXT NOT NULL,
  activo    INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1))
);

CREATE TABLE tipo_proceso (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenant (id),
  area_id     TEXT NOT NULL REFERENCES area (id),
  nombre      TEXT NOT NULL,
  descripcion TEXT,
  activo      INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1))
);

CREATE INDEX tipo_proceso_area ON tipo_proceso (area_id, nombre);

-- El plan por defecto de un tipo de proceso. Siembra `proceso_etapa` al crear
-- un proceso; no queda vinculada a él (`docs/diseno.md` §6, "Etapas").
--
-- `orden` no lleva índice único: T-7 reordena etapas, y en SQLite un
-- `UPDATE ... SET orden = orden + 1` viola un único transitoriamente fila por
-- fila. La unicidad del orden es decisión de T-6/T-7, no de la migración.
CREATE TABLE etapa_plantilla (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenant (id),
  tipo_proceso_id TEXT NOT NULL REFERENCES tipo_proceso (id),
  nombre          TEXT NOT NULL,
  orden           INTEGER NOT NULL
);

CREATE INDEX etapa_plantilla_tipo ON etapa_plantilla (tipo_proceso_id, orden);

-- ---------------------------------------------------------------------------
-- Proceso
-- ---------------------------------------------------------------------------

-- `cliente_id NOT NULL` es I-2.
--
-- `estado`: el diseño nombra la columna pero no enumera sus valores. Se cierra
-- en el par mínimo que el modelo ya exige, porque `cerrado_en` existe.
CREATE TABLE proceso (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenant (id),
  cliente_id      TEXT NOT NULL REFERENCES cliente (id),
  tipo_proceso_id TEXT NOT NULL REFERENCES tipo_proceso (id),
  origen          TEXT NOT NULL CHECK (origen IN ('cotizacion', 'directo')),
  titulo          TEXT NOT NULL,
  estado          TEXT NOT NULL DEFAULT 'abierto'
                    CHECK (estado IN ('abierto', 'cerrado')),
  responsable_id  TEXT REFERENCES usuario (id),
  abierto_en      TEXT NOT NULL CHECK (abierto_en IS strftime('%Y-%m-%dT%H:%M:%fZ', abierto_en)),
  cerrado_en      TEXT CHECK (cerrado_en IS strftime('%Y-%m-%dT%H:%M:%fZ', cerrado_en))
);

CREATE INDEX proceso_cliente ON proceso (cliente_id);
CREATE INDEX proceso_tenant_estado ON proceso (tenant_id, estado);

-- La lista ordenada COMPLETA del plan de trabajo, no un puntero a la etapa
-- vigente: las que tienen `alcanzada_en` nulo son exactamente lo que falta.
CREATE TABLE proceso_etapa (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL REFERENCES tenant (id),
  proceso_id   TEXT NOT NULL REFERENCES proceso (id),
  nombre       TEXT NOT NULL,
  orden        INTEGER NOT NULL,
  alcanzada_en TEXT CHECK (alcanzada_en IS strftime('%Y-%m-%dT%H:%M:%fZ', alcanzada_en))
);

CREATE INDEX proceso_etapa_proceso ON proceso_etapa (proceso_id, orden);

-- `autor_id NOT NULL` es I-6. Se guarda el usuario, nunca el nombre en texto:
-- si alguien cambia de apellido, cuatrocientas notas no quedan firmadas con un
-- nombre que ya no existe (`docs/diseno.md` §6, "Autoría").
CREATE TABLE nota (
  id               TEXT PRIMARY KEY,
  tenant_id        TEXT NOT NULL REFERENCES tenant (id),
  proceso_id       TEXT NOT NULL REFERENCES proceso (id),
  proceso_etapa_id TEXT NOT NULL REFERENCES proceso_etapa (id),
  texto            TEXT NOT NULL,
  autor_id         TEXT NOT NULL REFERENCES usuario (id),
  creada_en        TEXT NOT NULL CHECK (creada_en IS strftime('%Y-%m-%dT%H:%M:%fZ', creada_en))
);

CREATE INDEX nota_proceso ON nota (proceso_id, creada_en);

-- Un pendiente no se copia de etapa en etapa: nace en una y sobrevive solo.
-- `cerrado_en` y `cerrado_por` van juntos o no van: cerrar sin dejar quién
-- cerró es exactamente el agujero que esta tabla existe para tapar.
CREATE TABLE pendiente (
  id               TEXT PRIMARY KEY,
  tenant_id        TEXT NOT NULL REFERENCES tenant (id),
  proceso_id       TEXT NOT NULL REFERENCES proceso (id),
  proceso_etapa_id TEXT NOT NULL REFERENCES proceso_etapa (id),
  texto            TEXT NOT NULL,
  autor_id         TEXT NOT NULL REFERENCES usuario (id),
  responsable_id   TEXT REFERENCES usuario (id),
  creado_en        TEXT NOT NULL CHECK (creado_en IS strftime('%Y-%m-%dT%H:%M:%fZ', creado_en)),
  vence_en         TEXT CHECK (vence_en IS strftime('%Y-%m-%dT%H:%M:%fZ', vence_en)),
  cerrado_en       TEXT CHECK (cerrado_en IS strftime('%Y-%m-%dT%H:%M:%fZ', cerrado_en)),
  cerrado_por      TEXT REFERENCES usuario (id),
  CHECK ((cerrado_en IS NULL) = (cerrado_por IS NULL))
);

CREATE INDEX pendiente_abierto ON pendiente (proceso_id, cerrado_en);

-- ---------------------------------------------------------------------------
-- Auditoría
-- ---------------------------------------------------------------------------

-- `usuario_id NOT NULL` es I-6.
CREATE TABLE bitacora (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenant (id),
  entidad     TEXT NOT NULL,
  entidad_id  TEXT NOT NULL,
  accion      TEXT NOT NULL,
  usuario_id  TEXT NOT NULL REFERENCES usuario (id),
  ocurrido_en TEXT NOT NULL CHECK (ocurrido_en IS strftime('%Y-%m-%dT%H:%M:%fZ', ocurrido_en)),
  detalle     TEXT
);

CREATE INDEX bitacora_entidad ON bitacora (entidad, entidad_id, ocurrido_en);

-- ---------------------------------------------------------------------------
-- Las notas son inmutables (`docs/diseno.md` §3 y §6)
-- ---------------------------------------------------------------------------
--
-- Va en la base y no en la aplicación por la misma razón que las invariantes:
-- una nota es el registro de un hecho, y un registro que la consola de D1
-- puede reescribir no es un registro. Los dos disparadores cubren las dos
-- formas de reescribir la historia.
--
-- Consecuencia buscada: tampoco se puede borrar un proceso con notas, porque
-- las llaves foráneas quedan en `NO ACTION` y el `DELETE` del hijo nunca llega
-- a ejecutarse.

CREATE TRIGGER nota_no_se_actualiza
BEFORE UPDATE ON nota
BEGIN
  SELECT RAISE(ABORT, 'nota inmutable: una nota no se actualiza');
END;

CREATE TRIGGER nota_no_se_borra
BEFORE DELETE ON nota
BEGIN
  SELECT RAISE(ABORT, 'nota inmutable: una nota no se borra');
END;

-- ---------------------------------------------------------------------------
-- Semilla
-- ---------------------------------------------------------------------------
--
-- Una sola fila, y nada más. El identificador es el mismo que exporta
-- `worker/db/ids.ts` como `TENANT_UNICO_ID`.

INSERT INTO tenant (id, nombre)
VALUES ('ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'Bufete');
