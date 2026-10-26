-- Semilla de demostración: datos para mirar la aplicación, no datos de
-- producción.
--
-- Se aplica **sobre la base local ya migrada**, encima de lo que la semilla
-- de la tajada 1 dejó: el bufete, los dos usuarios, los tres tipos de
-- cliente, las cuatro áreas, los cuatro tipos de proceso, las catorce etapas
-- de plantilla, los ocho clientes y las cincuenta y siete entradas de
-- bitácora que ya están escritas. Nada de eso se vuelve a insertar.
--
--   DB=$(fd -e sqlite . .wrangler/state/v3/d1/miniflare-D1DatabaseObject)
--   cp "$DB" "$DB.antes-de-la-semilla"   # el camino de vuelta
--   sqlite3 "$DB" "PRAGMA foreign_keys = ON;" ".read scripts/semilla-demo.sql"
--
-- Sin `BEGIN`/`COMMIT` a propósito: así el mismo archivo sirve para
-- `wrangler d1 execute --local --file`, que rechaza las transacciones
-- explícitas. El precio es que un fallo a mitad de camino deja la base a
-- medias, y por eso la copia de arriba no es opcional.
--
-- Lo que agrega es el relleno que a esa base le falta para que las pantallas
-- tengan algo adentro: siete procesos con sus etapas, notas y pendientes;
-- cinco cotizaciones en los cuatro estados, con una cadena de duplicación;
-- módulos de prosa con texto de propuesta de verdad; líneas de honorarios y
-- gastos estimados; movimientos de gasto y anticipos sobre dos procesos; dos
-- planes de pago —uno con el residuo del 99,99 % a la vista—; y las entradas
-- de bitácora de todo eso.
--
-- ## Se corre una sola vez, y lo comprueba
--
-- La bitácora es inmutable por disparador: `bitacora_no_se_borra` impide
-- limpiar lo que esta semilla escribe, así que no puede ser idempotente sin
-- mentir. En vez de fingirlo, la primera sentencia **aborta** si la base ya
-- tiene procesos o cotizaciones, con la misma forma que usan las
-- verificaciones previas de las migraciones: una tabla temporal con un
-- `CHECK` nombrado, para que el mensaje diga qué pasó.
--
-- Para volver a empezar: borrar el `.sqlite` de Miniflare y volver a correr
-- `wrangler d1 migrations apply app-cotizador --local` y la semilla de la
-- tajada 1.
--
-- ## Lo que el esquema obliga, y que esta semilla respeta
--
--   * **Tenencia.** Toda arista comparte `tenant_id`; hay un disparador por
--     tabla que lo verifica.
--   * **Momentos canónicos.** `AAAA-MM-DDTHH:MM:SS.sssZ` y nada más, por el
--     `CHECK` de ida y vuelta con `strftime`.
--   * **Días contra momentos.** `cotizacion.vence_en`, `cuota.vence_en`,
--     `pendiente.vence_en` y `movimiento_gasto.fecha` guardan el **fin del
--     día en Panamá** del día que la pantalla muestra
--     (`worker/db/momentos.ts`): el 20 de agosto se guarda como
--     `2026-08-21T04:59:59.999Z`. Escribir medianoche ahí haría que el
--     detalle mostrara el día anterior.
--   * **Montos en centavos enteros**, con `typeof(monto) = 'integer'`.
--   * **Coherencia estado/snapshot.** Un borrador no tiene snapshot; una
--     emitida, una ganada y una perdida sí.
--   * **El ciclo de vida.** Sólo borrador→emitida, emitida→ganada y
--     emitida→perdida.
--   * **La congelación.** Una cotización que no es borrador no admite que le
--     entren, cambien ni salgan módulos y líneas. Por eso **las tres
--     congeladas se siembran como borrador, se les cuelga todo, y recién
--     entonces se emiten**: no hay otro orden posible, y es exactamente el
--     que sigue `emitir` en `worker/cotizaciones/repositorio.ts`.
--   * **`el_origen_y_la_linea_dicen_lo_mismo`.** Los dos procesos nacidos de
--     la cotización ganada llevan `origen = 'cotizacion'` **y**
--     `cotizacion_linea_id`; los otros cinco llevan `origen = 'directo'` y la
--     columna en nulo.
--   * **I-3.** Esos dos procesos comparten cliente con su cotización.
--   * **Las cuatro exclusividades de `cuota`.** Cuelga de la cotización o del
--     proceso; lleva monto o porcentaje; vence en fecha o contra un hito; y
--     el porcentaje sólo existe si hay cotización de la que ser porcentaje.
--
-- ## El snapshot se calcula, no se transcribe
--
-- `cotizacion.snapshot` tiene la forma exacta de `SnapshotDeCotizacion`
-- (`worker/cotizaciones/snapshot.ts`). Acá se arma con `json_object` leyendo
-- los módulos y las líneas que se acaban de insertar, en vez de escribirlo a
-- mano: un snapshot transcrito es un segundo lugar donde vive la prosa, y el
-- día que alguien corrija un párrafo arriba el documento congelado diría otra
-- cosa. Los totales salen de la misma suma que `totalesDe`, y **no llevan
-- `itbms`**: el interruptor del bufete está apagado (no hay `ITBMS_ACTIVO` en
-- `wrangler.jsonc`), y apagado es ausencia de la clave, no un cero.

-- ===========================================================================
-- Verificación previa: esto se corre una sola vez
-- ===========================================================================

CREATE TABLE verificacion_previa_semilla_demo (
  ok INTEGER NOT NULL
     CONSTRAINT la_base_ya_tiene_procesos_o_cotizaciones_la_semilla_ya_se_corrio
     CHECK (ok = 1)
);

INSERT INTO verificacion_previa_semilla_demo (ok)
SELECT 0 WHERE
     EXISTS (SELECT 1 FROM proceso)
  OR EXISTS (SELECT 1 FROM cotizacion);

DROP TABLE verificacion_previa_semilla_demo;

-- ===========================================================================
-- La plantilla que faltaba
-- ===========================================================================
--
-- «Pensión alimenticia» es el único tipo de proceso sin plan por defecto, y
-- se nota: el proceso de M. E. Quintero nació vacío y su bitácora tiene un
-- `plan_editado` el mismo día. Acá se le escribe la plantilla para que el
-- siguiente nazca con etapas.

INSERT INTO etapa_plantilla (id, tenant_id, tipo_proceso_id, nombre, orden) VALUES
 ('4b000000-0000-4000-8000-000000000001', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', '4e87b250-3a19-4c76-85d0-9f12e6a07c48', 'Consulta inicial',               0),
 ('4b000000-0000-4000-8000-000000000002', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', '4e87b250-3a19-4c76-85d0-9f12e6a07c48', 'Demanda presentada',             1),
 ('4b000000-0000-4000-8000-000000000003', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', '4e87b250-3a19-4c76-85d0-9f12e6a07c48', 'Notificación al demandado',      2),
 ('4b000000-0000-4000-8000-000000000004', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', '4e87b250-3a19-4c76-85d0-9f12e6a07c48', 'Audiencia de conciliación',      3),
 ('4b000000-0000-4000-8000-000000000005', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', '4e87b250-3a19-4c76-85d0-9f12e6a07c48', 'Sentencia',                      4);

-- ===========================================================================
-- Cotizaciones: nacen todas como borrador
-- ===========================================================================
--
-- Las tres que terminan congeladas también. Es el único orden que el esquema
-- deja: `cotizacion_modulo_no_entra_en_una_congelada` y su gemelo de líneas
-- rechazan el `INSERT` si la cotización ya dejó de ser borrador.

INSERT INTO cotizacion (id, tenant_id, cliente_id, codigo, estado, fecha, vence_en, moneda, snapshot, duplicada_de_id, creada_por, creada_en) VALUES
 ('b5000000-0000-4000-8000-000000000001', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'c1000000-0000-4000-8000-000000000002', 'COT-2026-0001', 'borrador', '2026-07-21T13:20:00.000Z', '2026-08-21T04:59:59.999Z', 'USD', NULL, NULL,                                   '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-07-21T13:20:00.000Z'),
 ('b5000000-0000-4000-8000-000000000002', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'c1000000-0000-4000-8000-000000000005', 'COT-2026-0002', 'borrador', '2026-08-26T14:40:00.000Z', '2026-09-26T04:59:59.999Z', 'USD', NULL, NULL,                                   'b28d7e13-5c46-4a92-9f03-7d61e4a8c5b2', '2026-08-26T14:40:00.000Z'),
 ('b5000000-0000-4000-8000-000000000003', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'c1000000-0000-4000-8000-000000000004', 'COT-2026-0003', 'borrador', '2026-09-15T14:05:00.000Z', '2026-11-15T04:59:59.999Z', 'USD', NULL, NULL,                                   '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-09-15T14:05:00.000Z'),
 ('b5000000-0000-4000-8000-000000000004', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'c1000000-0000-4000-8000-000000000005', 'COT-2026-0004', 'borrador', '2026-10-19T15:10:00.000Z', NULL,                        'USD', NULL, 'b5000000-0000-4000-8000-000000000002', 'b28d7e13-5c46-4a92-9f03-7d61e4a8c5b2', '2026-10-19T15:10:00.000Z'),
 ('b5000000-0000-4000-8000-000000000005', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'c1000000-0000-4000-8000-000000000007', 'COT-2026-0005', 'borrador', '2026-10-22T14:00:00.000Z', '2026-11-21T04:59:59.999Z', 'USD', NULL, NULL,                                   '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-10-22T14:00:00.000Z');

-- ---------------------------------------------------------------------------
-- Los módulos de prosa
-- ---------------------------------------------------------------------------

-- COT-2026-0001 · Inversiones Casco Viejo, S.A. · dos compraventas
INSERT INTO cotizacion_modulo (id, tenant_id, cotizacion_id, tipo, orden, contenido) VALUES
 ('96000000-0000-4000-8000-000000000101', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'b5000000-0000-4000-8000-000000000001', 'antecedentes', 0,
  'Inversiones Casco Viejo, S.A. nos solicitó el acompañamiento legal para la adquisición de dos inmuebles en la ciudad de Panamá: la finca 30145, correspondiente al lote 14 de Punta Pacífica, y la finca 28870, un local comercial en Avenida B del Casco Antiguo. Las dos operaciones se negociaron por separado con vendedores distintos, pero la sociedad compradora es la misma y el cierre se quiere coordinado, de modo que esta propuesta las trata como un solo encargo.'),
 ('96000000-0000-4000-8000-000000000102', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'b5000000-0000-4000-8000-000000000001', 'alcance', 1,
  'Para cada una de las dos fincas el bufete asume: el estudio registral de títulos de los últimos diez años, con revisión de gravámenes, hipotecas, servidumbres y limitaciones de dominio; la redacción y negociación del contrato de promesa de compraventa; la confección de la minuta de la escritura pública de compraventa y su protocolización ante notaría; la gestión de los paz y salvo municipal, de ANATI y del IDAAN; y el seguimiento de la inscripción en el Registro Público hasta la entrega del certificado con la nueva titularidad a nombre de la sociedad.

Se incluyen además dos reuniones de cierre con la contraparte por cada finca y la coordinación con el banco acreedor si la compra se financia.'),
 ('96000000-0000-4000-8000-000000000103', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'b5000000-0000-4000-8000-000000000001', 'exclusiones', 2,
  'No se incluyen en esta propuesta: el avalúo de los inmuebles; la tramitación de permisos de construcción, remodelación u ocupación; la defensa en procesos judiciales o administrativos que surjan de la operación; la gestión del impuesto de transferencia de bienes inmuebles, que por ley corresponde al vendedor; ni la constitución de sociedades o fideicomisos nuevos para alojar los activos. Cualquiera de estos trabajos se cotiza aparte.'),
 ('96000000-0000-4000-8000-000000000104', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'b5000000-0000-4000-8000-000000000001', 'supuestos', 3,
  'Esta propuesta parte de que las dos fincas están libres de gravámenes y de litigios pendientes, de que los vendedores cuentan con los paz y salvo al día, y de que la sociedad compradora está inscrita y con su agente residente vigente. Si el estudio de títulos revela una hipoteca, un embargo o una sucesión sin liquidar, el trabajo de saneamiento se presupuesta aparte y se avisa antes de empezarlo.'),
 ('96000000-0000-4000-8000-000000000105', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'b5000000-0000-4000-8000-000000000001', 'clausulas', 4,
  'Honorarios en dólares de los Estados Unidos de América, moneda de curso legal en la República de Panamá. Los gastos de registro, notaría y certificaciones son estimados y se liquidan contra comprobante: lo que exceda del estimado se factura al costo y lo que sobre se devuelve. Esta propuesta tiene una vigencia de treinta días calendario contados desde su fecha de emisión. La aceptación se formaliza con la firma del contrato de servicios profesionales y el pago de la primera cuota.');

-- COT-2026-0002 · Hans-Peter Müller · compraventa en Coronado (la que se perdió)
INSERT INTO cotizacion_modulo (id, tenant_id, cotizacion_id, tipo, orden, contenido) VALUES
 ('96000000-0000-4000-8000-000000000201', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'b5000000-0000-4000-8000-000000000002', 'antecedentes', 0,
  'El señor Hans-Peter Müller, de nacionalidad alemana y con trámite de residencia por jubilación en curso en este mismo bufete, nos consultó por la compra del apartamento 12-B del PH Playa Serena, en Coronado, provincia de Panamá Oeste. La operación se negocia directamente con el promotor y el precio acordado es de US$ 285 000,00.'),
 ('96000000-0000-4000-8000-000000000202', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'b5000000-0000-4000-8000-000000000002', 'alcance', 1,
  'El bufete asume el estudio registral de la finca y de su régimen de propiedad horizontal, con revisión del reglamento de copropiedad y de las cuotas de mantenimiento pendientes; la revisión y negociación del contrato de promesa de compraventa ofrecido por el promotor; la confección de la minuta de la escritura pública y su protocolización; la obtención de los paz y salvo de la administración del PH, del municipio y del IDAAN; y el seguimiento de la inscripción en el Registro Público hasta la entrega del certificado de propiedad.'),
 ('96000000-0000-4000-8000-000000000203', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'b5000000-0000-4000-8000-000000000002', 'exclusiones', 2,
  'Quedan fuera: el avalúo del inmueble; la inspección técnica de la obra; la gestión de financiamiento hipotecario y su escritura de constitución; el trámite de traspaso de los servicios de agua y electricidad; y cualquier reclamo ante la Dirección de Protección al Consumidor por vicios de construcción.'),
 ('96000000-0000-4000-8000-000000000204', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'b5000000-0000-4000-8000-000000000002', 'supuestos', 3,
  'Se asume que el PH Playa Serena está debidamente incorporado al régimen de propiedad horizontal y que la finca matriz está libre de hipoteca del promotor, o que el promotor obtendrá la cancelación parcial antes del cierre. Se asume también que el comprador cuenta con una cuenta bancaria local para el pago, o que el pago se hará por transferencia internacional con el sustento de origen de fondos que el banco exija.'),
 ('96000000-0000-4000-8000-000000000205', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'b5000000-0000-4000-8000-000000000002', 'clausulas', 4,
  'Honorarios en dólares de los Estados Unidos de América. Los gastos de notaría, registro y certificaciones son estimados y se liquidan contra comprobante. Esta propuesta tiene una vigencia de treinta días calendario. La aceptación se formaliza con la firma del contrato de servicios profesionales y el pago del cincuenta por ciento de los honorarios.'),
 ('96000000-0000-4000-8000-000000000206', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'b5000000-0000-4000-8000-000000000002', 'nota_cliente', 5,
  'Señor Müller: como su trámite de residencia por jubilación ya está en curso con nosotros, la compra del apartamento no lo afecta ni lo acelera, pero sí conviene que la escritura quede inscrita antes de la cita en Migración, porque el certificado de propiedad sirve como comprobante de arraigo. Si decide avanzar, avísenos con dos semanas de anticipación para coordinar el estudio de títulos.');

-- COT-2026-0003 · Agropecuaria Chiriquí, S.A. · tres visas de trabajo (emitida)
INSERT INTO cotizacion_modulo (id, tenant_id, cotizacion_id, tipo, orden, contenido) VALUES
 ('96000000-0000-4000-8000-000000000301', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'b5000000-0000-4000-8000-000000000003', 'antecedentes', 0,
  'Agropecuaria Chiriquí, S.A. contrató a tres técnicos agrícolas extranjeros para su finca de Boquete y necesita regularizar su permanencia en el país antes del inicio de la zafra. La empresa ya tramitó con este bufete el permiso de un cuarto técnico, de nacionalidad británica, que se encuentra en etapa de presentación ante Migración, y pidió una propuesta para los tres restantes.'),
 ('96000000-0000-4000-8000-000000000302', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'b5000000-0000-4000-8000-000000000003', 'alcance', 1,
  'Por cada uno de los tres solicitantes el bufete asume: la revisión de la documentación de origen y la indicación de qué debe venir apostillado y traducido por traductor público autorizado; la confección y el refrendo del contrato de trabajo ante el Ministerio de Trabajo y Desarrollo Laboral; la confección del poder y la solicitud ante el Servicio Nacional de Migración; el acompañamiento a la cita de registro biométrico; el seguimiento de la resolución; y el retiro y entrega del carné de residente.

Se incluye además la verificación del porcentaje de trabajadores extranjeros de la planilla, para confirmar que las tres contrataciones caben dentro del diez por ciento que la ley permite.'),
 ('96000000-0000-4000-8000-000000000303', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'b5000000-0000-4000-8000-000000000003', 'exclusiones', 2,
  'No se incluyen: la obtención de los antecedentes penales del país de origen ni su apostilla, que corresponde gestionar a cada solicitante; la traducción pública de los documentos, que se contrata directamente con el traductor y se paga al costo; el carné de salud panameño; ni la tramitación de permisos para dependientes o familiares, que se cotiza por separado a razón de un permiso por persona.'),
 ('96000000-0000-4000-8000-000000000304', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'b5000000-0000-4000-8000-000000000003', 'supuestos', 3,
  'Esta propuesta asume que los tres solicitantes se encuentran en el país con estatus migratorio regular al momento de presentar la solicitud, que la empresa está al día con la Caja de Seguro Social y con la Dirección General de Ingresos, y que la planilla admite las tres contrataciones dentro del porcentaje legal de personal extranjero. Si alguno de los tres estuviera fuera de estatus, el trámite cambia de categoría y la propuesta se rehace.'),
 ('96000000-0000-4000-8000-000000000305', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'b5000000-0000-4000-8000-000000000003', 'clausulas', 4,
  'Honorarios en dólares de los Estados Unidos de América. Las tasas del Servicio Nacional de Migración y los costos de carné son estimados oficiales vigentes a la fecha de esta propuesta y se liquidan contra comprobante; un ajuste de tarifas de la autoridad se traslada al costo. Esta propuesta tiene una vigencia de sesenta días calendario. El plan de pagos acordado consta al pie y se factura por cuota vencida.');

-- COT-2026-0004 · Hans-Peter Müller · la copia de COT-2026-0002, con la tarifa revisada
--
-- Los módulos se copian tal cual, que es lo que hace `duplicar`: la prosa de
-- la propuesta no cambia, lo que cambia es el honorario.
INSERT INTO cotizacion_modulo (id, tenant_id, cotizacion_id, tipo, orden, contenido) VALUES
 ('96000000-0000-4000-8000-000000000401', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'b5000000-0000-4000-8000-000000000004', 'antecedentes', 0,
  'El señor Hans-Peter Müller, de nacionalidad alemana y con trámite de residencia por jubilación en curso en este mismo bufete, nos consultó por la compra del apartamento 12-B del PH Playa Serena, en Coronado, provincia de Panamá Oeste. La operación se negocia directamente con el promotor y el precio acordado es de US$ 285 000,00.'),
 ('96000000-0000-4000-8000-000000000402', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'b5000000-0000-4000-8000-000000000004', 'alcance', 1,
  'El bufete asume el estudio registral de la finca y de su régimen de propiedad horizontal, con revisión del reglamento de copropiedad y de las cuotas de mantenimiento pendientes; la revisión y negociación del contrato de promesa de compraventa ofrecido por el promotor; la confección de la minuta de la escritura pública y su protocolización; la obtención de los paz y salvo de la administración del PH, del municipio y del IDAAN; y el seguimiento de la inscripción en el Registro Público hasta la entrega del certificado de propiedad.'),
 ('96000000-0000-4000-8000-000000000403', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'b5000000-0000-4000-8000-000000000004', 'exclusiones', 2,
  'Quedan fuera: el avalúo del inmueble; la inspección técnica de la obra; la gestión de financiamiento hipotecario y su escritura de constitución; el trámite de traspaso de los servicios de agua y electricidad; y cualquier reclamo ante la Dirección de Protección al Consumidor por vicios de construcción.'),
 ('96000000-0000-4000-8000-000000000404', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'b5000000-0000-4000-8000-000000000004', 'supuestos', 3,
  'Se asume que el PH Playa Serena está debidamente incorporado al régimen de propiedad horizontal y que la finca matriz está libre de hipoteca del promotor, o que el promotor obtendrá la cancelación parcial antes del cierre. Se asume también que el comprador cuenta con una cuenta bancaria local para el pago, o que el pago se hará por transferencia internacional con el sustento de origen de fondos que el banco exija.'),
 ('96000000-0000-4000-8000-000000000405', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'b5000000-0000-4000-8000-000000000004', 'clausulas', 4,
  'Honorarios en dólares de los Estados Unidos de América. Los gastos de notaría, registro y certificaciones son estimados y se liquidan contra comprobante. Esta propuesta tiene una vigencia de treinta días calendario. La aceptación se formaliza con la firma del contrato de servicios profesionales y el pago del cincuenta por ciento de los honorarios.'),
 ('96000000-0000-4000-8000-000000000406', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'b5000000-0000-4000-8000-000000000004', 'nota_cliente', 5,
  'Señor Müller: retomamos la propuesta de agosto con el honorario revisado, que es lo único que cambia. El alcance es el mismo y los gastos de notaría y registro siguen siendo los oficiales. Quedamos a la espera de su confirmación para coordinar el estudio de títulos con el promotor.');

-- COT-2026-0005 · Fundación Manglar Vivo · el borrador que el pendiente abierto pide
INSERT INTO cotizacion_modulo (id, tenant_id, cotizacion_id, tipo, orden, contenido) VALUES
 ('96000000-0000-4000-8000-000000000501', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'b5000000-0000-4000-8000-000000000005', 'antecedentes', 0,
  'La Fundación Manglar Vivo, organización sin fines de lucro dedicada a la restauración de humedales en la bahía de Panamá, recibió a una bióloga de nacionalidad neerlandesa para un programa de voluntariado de dos años y necesita regularizar su permanencia. La fundación nos pidió una propuesta con tarifa social.'),
 ('96000000-0000-4000-8000-000000000502', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'b5000000-0000-4000-8000-000000000005', 'alcance', 1,
  'El bufete asume la revisión de la documentación de origen y la indicación de qué debe venir apostillado; la confección del contrato de trabajo y su refrendo ante el Ministerio de Trabajo y Desarrollo Laboral; la solicitud de permiso de residencia y trabajo ante el Servicio Nacional de Migración; el acompañamiento a la cita de registro biométrico; y el retiro y entrega del carné de residente.'),
 ('96000000-0000-4000-8000-000000000503', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'b5000000-0000-4000-8000-000000000005', 'exclusiones', 2,
  'No se incluyen los antecedentes penales del país de origen ni su apostilla, la traducción pública de los documentos, el carné de salud panameño, ni la renovación del permiso al vencimiento del primer año.'),
 ('96000000-0000-4000-8000-000000000504', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'b5000000-0000-4000-8000-000000000005', 'nota_cliente', 3,
  'El honorario de esta propuesta es la tarifa que el bufete aplica a organizaciones sin fines de lucro inscritas, y está por debajo de la tarifa corriente para este mismo trámite. Las tasas del Servicio Nacional de Migración no admiten rebaja y van al costo.');

-- ---------------------------------------------------------------------------
-- Las líneas: honorarios y gastos estimados
-- ---------------------------------------------------------------------------
--
-- Montos en centavos. Las líneas de honorario que llevan `tipo_proceso_id`
-- son las que T-7 convierte en procesos cuando la cotización se gana; las de
-- gasto estimado nunca lo llevan.

-- COT-2026-0001 · honorarios 6 300,00 · gastos estimados 1 125,00 · total 7 425,00
INSERT INTO cotizacion_linea (id, tenant_id, cotizacion_id, tipo_proceso_id, clase, concepto, monto, orden) VALUES
 ('87000000-0000-4000-8000-000000000101', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'b5000000-0000-4000-8000-000000000001', '9c13d748-0e62-4b85-a37f-28d61c90e4b3', 'honorario',      'Compraventa de la finca 30145 — Lote 14, Punta Pacífica',      350000, 0),
 ('87000000-0000-4000-8000-000000000102', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'b5000000-0000-4000-8000-000000000001', '9c13d748-0e62-4b85-a37f-28d61c90e4b3', 'honorario',      'Compraventa de la finca 28870 — local comercial, Avenida B',   280000, 1),
 ('87000000-0000-4000-8000-000000000103', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'b5000000-0000-4000-8000-000000000001', NULL,                                   'gasto_estimado', 'Derechos de inscripción en el Registro Público (dos fincas)',   54000, 2),
 ('87000000-0000-4000-8000-000000000104', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'b5000000-0000-4000-8000-000000000001', NULL,                                   'gasto_estimado', 'Protocolización ante notaría pública (dos escrituras)',         36000, 3),
 ('87000000-0000-4000-8000-000000000105', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'b5000000-0000-4000-8000-000000000001', NULL,                                   'gasto_estimado', 'Certificaciones de finca, paz y salvo municipal y de ANATI',    22500, 4);

-- COT-2026-0002 · honorarios 2 500,00 · gastos estimados 645,00 · total 3 145,00
INSERT INTO cotizacion_linea (id, tenant_id, cotizacion_id, tipo_proceso_id, clase, concepto, monto, orden) VALUES
 ('87000000-0000-4000-8000-000000000201', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'b5000000-0000-4000-8000-000000000002', '9c13d748-0e62-4b85-a37f-28d61c90e4b3', 'honorario',      'Compraventa del apartamento 12-B, PH Playa Serena, Coronado',  250000, 0),
 ('87000000-0000-4000-8000-000000000202', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'b5000000-0000-4000-8000-000000000002', NULL,                                   'gasto_estimado', 'Protocolización ante notaría pública',                          18000, 1),
 ('87000000-0000-4000-8000-000000000203', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'b5000000-0000-4000-8000-000000000002', NULL,                                   'gasto_estimado', 'Derechos de inscripción en el Registro Público',                32000, 2),
 ('87000000-0000-4000-8000-000000000204', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'b5000000-0000-4000-8000-000000000002', NULL,                                   'gasto_estimado', 'Certificación de finca y paz y salvos (ANATI, IDAAN, municipio)', 14500, 3);

-- COT-2026-0003 · honorarios 4 500,00 · gastos estimados 3 180,00 · total 7 680,00
INSERT INTO cotizacion_linea (id, tenant_id, cotizacion_id, tipo_proceso_id, clase, concepto, monto, orden) VALUES
 ('87000000-0000-4000-8000-000000000301', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'b5000000-0000-4000-8000-000000000003', '35f8c072-9b41-4d6a-8e25-0c73a1f6b584', 'honorario',      'Permiso de residencia y trabajo — tres técnicos agrícolas',    360000, 0),
 ('87000000-0000-4000-8000-000000000302', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'b5000000-0000-4000-8000-000000000003', NULL,                                   'honorario',      'Refrendo de los tres contratos de trabajo ante el MITRADEL',    90000, 1),
 ('87000000-0000-4000-8000-000000000303', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'b5000000-0000-4000-8000-000000000003', NULL,                                   'gasto_estimado', 'Tasas del Servicio Nacional de Migración (tres solicitantes)', 240000, 2),
 ('87000000-0000-4000-8000-000000000304', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'b5000000-0000-4000-8000-000000000003', NULL,                                   'gasto_estimado', 'Carné de residente y certificaciones (tres solicitantes)',      45000, 3),
 ('87000000-0000-4000-8000-000000000305', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'b5000000-0000-4000-8000-000000000003', NULL,                                   'gasto_estimado', 'Autenticación y apostilla de documentos de origen',             33000, 4);

-- COT-2026-0004 · el honorario revisado de 2 500,00 a 1 950,00
INSERT INTO cotizacion_linea (id, tenant_id, cotizacion_id, tipo_proceso_id, clase, concepto, monto, orden) VALUES
 ('87000000-0000-4000-8000-000000000401', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'b5000000-0000-4000-8000-000000000004', '9c13d748-0e62-4b85-a37f-28d61c90e4b3', 'honorario',      'Compraventa del apartamento 12-B, PH Playa Serena, Coronado',  195000, 0),
 ('87000000-0000-4000-8000-000000000402', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'b5000000-0000-4000-8000-000000000004', NULL,                                   'gasto_estimado', 'Protocolización ante notaría pública',                          18000, 1),
 ('87000000-0000-4000-8000-000000000403', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'b5000000-0000-4000-8000-000000000004', NULL,                                   'gasto_estimado', 'Derechos de inscripción en el Registro Público',                32000, 2),
 ('87000000-0000-4000-8000-000000000404', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'b5000000-0000-4000-8000-000000000004', NULL,                                   'gasto_estimado', 'Certificación de finca y paz y salvos (ANATI, IDAAN, municipio)', 14500, 3);

-- COT-2026-0005 · tarifa de organización sin fines de lucro
INSERT INTO cotizacion_linea (id, tenant_id, cotizacion_id, tipo_proceso_id, clase, concepto, monto, orden) VALUES
 ('87000000-0000-4000-8000-000000000501', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'b5000000-0000-4000-8000-000000000005', '35f8c072-9b41-4d6a-8e25-0c73a1f6b584', 'honorario',      'Permiso de residencia y trabajo — una voluntaria (tarifa ONG)', 85000, 0),
 ('87000000-0000-4000-8000-000000000502', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'b5000000-0000-4000-8000-000000000005', NULL,                                   'gasto_estimado', 'Tasas del Servicio Nacional de Migración',                      80000, 1),
 ('87000000-0000-4000-8000-000000000503', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'b5000000-0000-4000-8000-000000000005', NULL,                                   'gasto_estimado', 'Carné de residente y certificaciones',                          15000, 2);

-- ===========================================================================
-- Emitir: el snapshot se arma leyendo lo que acaba de quedar escrito
-- ===========================================================================
--
-- Tres `UPDATE` con la misma forma. Cada uno pasa el borrador a `emitida` y
-- escribe el documento congelado en la misma sentencia, que es lo que hace
-- que `el_borrador_no_tiene_snapshot_y_la_emitida_si` no se viole en ningún
-- instante intermedio.
--
-- `venceEn` va como **día** y no como momento, porque así lo expone la API
-- (`Cotizacion.venceEn` en `worker/contract.ts`) y así lo congela
-- `congelar`. Es el mismo día que `vence_en` guarda como fin del día en
-- Panamá.

UPDATE cotizacion
   SET estado = 'emitida',
       snapshot = (
         SELECT json_object(
           'version', 1,
           'emitidaEn', '2026-07-21T15:00:00.000Z',
           'emitidaPor', json_object('id', u.id, 'nombre', u.nombre),
           'cotizacion', json_object(
             'id', q.id, 'codigo', q.codigo, 'fecha', q.fecha,
             'venceEn', '2026-08-20', 'moneda', q.moneda),
           'cliente', json_object(
             'id', c.id, 'nombre', c.nombre, 'tipo', tc.nombre,
             'documentoTipo', c.documento_tipo,
             'documentoNumero', c.documento_numero,
             'representanteLegal', c.representante_legal,
             'email', c.email, 'telefono', c.telefono),
           'modulos', (
             SELECT json_group_array(json_object(
                      'tipo', m.tipo,
                      'rotulo', CASE m.tipo
                                  WHEN 'antecedentes'  THEN 'Antecedentes'
                                  WHEN 'alcance'       THEN 'Alcance'
                                  WHEN 'exclusiones'   THEN 'Exclusiones'
                                  WHEN 'supuestos'     THEN 'Supuestos'
                                  WHEN 'clausulas'     THEN 'Cláusulas'
                                  WHEN 'nota_cliente'  THEN 'Nota al cliente'
                                END,
                      'contenido', m.contenido))
               FROM (SELECT tipo, contenido FROM cotizacion_modulo
                      WHERE cotizacion_id = q.id ORDER BY orden) m),
           'lineas', (
             SELECT json_group_array(json_object(
                      'clase', l.clase,
                      'rotulo', CASE l.clase
                                  WHEN 'honorario'      THEN 'Honorarios'
                                  WHEN 'gasto_estimado' THEN 'Gastos estimados'
                                END,
                      'concepto', l.concepto,
                      'monto', l.monto,
                      'tipoProcesoId', l.tipo_proceso_id,
                      'tipoProceso', l.tipo_proceso))
               FROM (SELECT cl.clase, cl.concepto, cl.monto, cl.tipo_proceso_id,
                            tp.nombre AS tipo_proceso
                       FROM cotizacion_linea cl
                       LEFT JOIN tipo_proceso tp ON tp.id = cl.tipo_proceso_id
                      WHERE cl.cotizacion_id = q.id ORDER BY cl.orden) l),
           'totales', json_object(
             'honorarios', (SELECT COALESCE(SUM(monto), 0) FROM cotizacion_linea
                             WHERE cotizacion_id = q.id AND clase = 'honorario'),
             'gastosEstimados', (SELECT COALESCE(SUM(monto), 0) FROM cotizacion_linea
                                  WHERE cotizacion_id = q.id AND clase = 'gasto_estimado'),
             'total', (SELECT COALESCE(SUM(monto), 0) FROM cotizacion_linea
                        WHERE cotizacion_id = q.id))
         )
           FROM cotizacion q
           JOIN cliente c ON c.id = q.cliente_id
           JOIN usuario u ON u.id = '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44'
           LEFT JOIN tipo_cliente tc ON tc.id = c.tipo_cliente_id
          WHERE q.id = 'b5000000-0000-4000-8000-000000000001'
       )
 WHERE id = 'b5000000-0000-4000-8000-000000000001';

UPDATE cotizacion
   SET estado = 'emitida',
       snapshot = (
         SELECT json_object(
           'version', 1,
           'emitidaEn', '2026-08-26T16:00:00.000Z',
           'emitidaPor', json_object('id', u.id, 'nombre', u.nombre),
           'cotizacion', json_object(
             'id', q.id, 'codigo', q.codigo, 'fecha', q.fecha,
             'venceEn', '2026-09-25', 'moneda', q.moneda),
           'cliente', json_object(
             'id', c.id, 'nombre', c.nombre, 'tipo', tc.nombre,
             'documentoTipo', c.documento_tipo,
             'documentoNumero', c.documento_numero,
             'representanteLegal', c.representante_legal,
             'email', c.email, 'telefono', c.telefono),
           'modulos', (
             SELECT json_group_array(json_object(
                      'tipo', m.tipo,
                      'rotulo', CASE m.tipo
                                  WHEN 'antecedentes'  THEN 'Antecedentes'
                                  WHEN 'alcance'       THEN 'Alcance'
                                  WHEN 'exclusiones'   THEN 'Exclusiones'
                                  WHEN 'supuestos'     THEN 'Supuestos'
                                  WHEN 'clausulas'     THEN 'Cláusulas'
                                  WHEN 'nota_cliente'  THEN 'Nota al cliente'
                                END,
                      'contenido', m.contenido))
               FROM (SELECT tipo, contenido FROM cotizacion_modulo
                      WHERE cotizacion_id = q.id ORDER BY orden) m),
           'lineas', (
             SELECT json_group_array(json_object(
                      'clase', l.clase,
                      'rotulo', CASE l.clase
                                  WHEN 'honorario'      THEN 'Honorarios'
                                  WHEN 'gasto_estimado' THEN 'Gastos estimados'
                                END,
                      'concepto', l.concepto,
                      'monto', l.monto,
                      'tipoProcesoId', l.tipo_proceso_id,
                      'tipoProceso', l.tipo_proceso))
               FROM (SELECT cl.clase, cl.concepto, cl.monto, cl.tipo_proceso_id,
                            tp.nombre AS tipo_proceso
                       FROM cotizacion_linea cl
                       LEFT JOIN tipo_proceso tp ON tp.id = cl.tipo_proceso_id
                      WHERE cl.cotizacion_id = q.id ORDER BY cl.orden) l),
           'totales', json_object(
             'honorarios', (SELECT COALESCE(SUM(monto), 0) FROM cotizacion_linea
                             WHERE cotizacion_id = q.id AND clase = 'honorario'),
             'gastosEstimados', (SELECT COALESCE(SUM(monto), 0) FROM cotizacion_linea
                                  WHERE cotizacion_id = q.id AND clase = 'gasto_estimado'),
             'total', (SELECT COALESCE(SUM(monto), 0) FROM cotizacion_linea
                        WHERE cotizacion_id = q.id))
         )
           FROM cotizacion q
           JOIN cliente c ON c.id = q.cliente_id
           JOIN usuario u ON u.id = 'b28d7e13-5c46-4a92-9f03-7d61e4a8c5b2'
           LEFT JOIN tipo_cliente tc ON tc.id = c.tipo_cliente_id
          WHERE q.id = 'b5000000-0000-4000-8000-000000000002'
       )
 WHERE id = 'b5000000-0000-4000-8000-000000000002';

UPDATE cotizacion
   SET estado = 'emitida',
       snapshot = (
         SELECT json_object(
           'version', 1,
           'emitidaEn', '2026-09-15T16:30:00.000Z',
           'emitidaPor', json_object('id', u.id, 'nombre', u.nombre),
           'cotizacion', json_object(
             'id', q.id, 'codigo', q.codigo, 'fecha', q.fecha,
             'venceEn', '2026-11-14', 'moneda', q.moneda),
           'cliente', json_object(
             'id', c.id, 'nombre', c.nombre, 'tipo', tc.nombre,
             'documentoTipo', c.documento_tipo,
             'documentoNumero', c.documento_numero,
             'representanteLegal', c.representante_legal,
             'email', c.email, 'telefono', c.telefono),
           'modulos', (
             SELECT json_group_array(json_object(
                      'tipo', m.tipo,
                      'rotulo', CASE m.tipo
                                  WHEN 'antecedentes'  THEN 'Antecedentes'
                                  WHEN 'alcance'       THEN 'Alcance'
                                  WHEN 'exclusiones'   THEN 'Exclusiones'
                                  WHEN 'supuestos'     THEN 'Supuestos'
                                  WHEN 'clausulas'     THEN 'Cláusulas'
                                  WHEN 'nota_cliente'  THEN 'Nota al cliente'
                                END,
                      'contenido', m.contenido))
               FROM (SELECT tipo, contenido FROM cotizacion_modulo
                      WHERE cotizacion_id = q.id ORDER BY orden) m),
           'lineas', (
             SELECT json_group_array(json_object(
                      'clase', l.clase,
                      'rotulo', CASE l.clase
                                  WHEN 'honorario'      THEN 'Honorarios'
                                  WHEN 'gasto_estimado' THEN 'Gastos estimados'
                                END,
                      'concepto', l.concepto,
                      'monto', l.monto,
                      'tipoProcesoId', l.tipo_proceso_id,
                      'tipoProceso', l.tipo_proceso))
               FROM (SELECT cl.clase, cl.concepto, cl.monto, cl.tipo_proceso_id,
                            tp.nombre AS tipo_proceso
                       FROM cotizacion_linea cl
                       LEFT JOIN tipo_proceso tp ON tp.id = cl.tipo_proceso_id
                      WHERE cl.cotizacion_id = q.id ORDER BY cl.orden) l),
           'totales', json_object(
             'honorarios', (SELECT COALESCE(SUM(monto), 0) FROM cotizacion_linea
                             WHERE cotizacion_id = q.id AND clase = 'honorario'),
             'gastosEstimados', (SELECT COALESCE(SUM(monto), 0) FROM cotizacion_linea
                                  WHERE cotizacion_id = q.id AND clase = 'gasto_estimado'),
             'total', (SELECT COALESCE(SUM(monto), 0) FROM cotizacion_linea
                        WHERE cotizacion_id = q.id))
         )
           FROM cotizacion q
           JOIN cliente c ON c.id = q.cliente_id
           JOIN usuario u ON u.id = '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44'
           LEFT JOIN tipo_cliente tc ON tc.id = c.tipo_cliente_id
          WHERE q.id = 'b5000000-0000-4000-8000-000000000003'
       )
 WHERE id = 'b5000000-0000-4000-8000-000000000003';

-- Ganar y perder. El snapshot no se toca —si se tocara,
-- `cotizacion_snapshot_se_escribe_una_sola_vez` abortaría— y `estado` no está
-- entre las columnas que `cotizacion_emitida_no_se_edita` congela, que es
-- justamente lo que deja que una emitida siga su ciclo.

UPDATE cotizacion SET estado = 'ganada'
 WHERE id = 'b5000000-0000-4000-8000-000000000001';

UPDATE cotizacion SET estado = 'perdida'
 WHERE id = 'b5000000-0000-4000-8000-000000000002';

-- ===========================================================================
-- Procesos
-- ===========================================================================
--
-- Los seis primeros son los que la bitácora de la tajada 1 ya narra: sus
-- identificadores, sus títulos y sus fechas salen de esas entradas, que no se
-- pueden reescribir. El séptimo es nuevo y nace de la segunda línea de la
-- cotización ganada.

INSERT INTO proceso (id, tenant_id, cliente_id, tipo_proceso_id, origen, titulo, estado, responsable_id, abierto_en, cerrado_en, cotizacion_linea_id) VALUES
 ('d1000000-0000-4000-8000-000000000001', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'c1000000-0000-4000-8000-000000000004', '35f8c072-9b41-4d6a-8e25-0c73a1f6b584', 'directo',    'Visa de trabajo — J. Whitfield (Agropecuaria Chiriquí)',   'abierto', '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-08-04T14:00:00.000Z', NULL,                       NULL),
 ('d1000000-0000-4000-8000-000000000002', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'c1000000-0000-4000-8000-000000000005', '7a2e6b19-c834-4d05-9d71-6e48b05c3a27', 'directo',    'Visa de pensionado — H. Müller',                          'abierto', 'b28d7e13-5c46-4a92-9f03-7d61e4a8c5b2', '2026-08-27T15:30:00.000Z', NULL,                       NULL),
 ('d1000000-0000-4000-8000-000000000003', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'c1000000-0000-4000-8000-000000000002', '9c13d748-0e62-4b85-a37f-28d61c90e4b3', 'cotizacion', 'Compraventa — Lote 14, Punta Pacífica',                    'abierto', '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-07-22T13:40:00.000Z', NULL,                       '87000000-0000-4000-8000-000000000101'),
 ('d1000000-0000-4000-8000-000000000004', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'c1000000-0000-4000-8000-000000000006', '9c13d748-0e62-4b85-a37f-28d61c90e4b3', 'directo',    'Compraventa — Casa en Villa Lucre',                       'cerrado', 'b28d7e13-5c46-4a92-9f03-7d61e4a8c5b2', '2026-07-03T14:10:00.000Z', '2026-09-18T21:05:00.000Z', NULL),
 ('d1000000-0000-4000-8000-000000000005', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'c1000000-0000-4000-8000-000000000001', '4e87b250-3a19-4c76-85d0-9f12e6a07c48', 'directo',    'Pensión alimenticia — M. E. Quintero',                    'abierto', 'b28d7e13-5c46-4a92-9f03-7d61e4a8c5b2', '2026-07-15T16:00:00.000Z', NULL,                       NULL),
 ('d1000000-0000-4000-8000-000000000006', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'c1000000-0000-4000-8000-000000000007', '35f8c072-9b41-4d6a-8e25-0c73a1f6b584', 'directo',    'Visa de trabajo — voluntaria holandesa (Manglar Vivo)',    'abierto', '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-10-01T14:25:00.000Z', NULL,                       NULL),
 ('d1000000-0000-4000-8000-000000000007', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'c1000000-0000-4000-8000-000000000002', '9c13d748-0e62-4b85-a37f-28d61c90e4b3', 'cotizacion', 'Compraventa — Local comercial, Avenida B',                 'abierto', 'b28d7e13-5c46-4a92-9f03-7d61e4a8c5b2', '2026-07-22T13:45:00.000Z', NULL,                       '87000000-0000-4000-8000-000000000102');

-- ---------------------------------------------------------------------------
-- Etapas: el plan completo, con `alcanzada_en` nulo en lo que falta
-- ---------------------------------------------------------------------------

-- Proceso 1 · Visa de trabajo · tres de seis etapas alcanzadas
INSERT INTO proceso_etapa (id, tenant_id, proceso_id, nombre, orden, alcanzada_en) VALUES
 ('e2000000-0000-4000-8000-000000000101', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000001', 'Consulta inicial',               0, '2026-08-04T14:00:00.000Z'),
 ('e2000000-0000-4000-8000-000000000102', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000001', 'Recolección de documentos',      1, '2026-08-19T20:30:00.000Z'),
 ('e2000000-0000-4000-8000-000000000103', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000001', 'Contrato de trabajo refrendado', 2, '2026-09-11T16:45:00.000Z'),
 ('e2000000-0000-4000-8000-000000000104', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000001', 'Presentación ante Migración',    3, NULL),
 ('e2000000-0000-4000-8000-000000000105', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000001', 'Resolución',                     4, NULL),
 ('e2000000-0000-4000-8000-000000000106', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000001', 'Entrega del carné',              5, NULL);

-- Proceso 2 · Visa de pensionado · la etapa 2 la agregó el `plan_editado` del 2 de septiembre
INSERT INTO proceso_etapa (id, tenant_id, proceso_id, nombre, orden, alcanzada_en) VALUES
 ('e2000000-0000-4000-8000-000000000201', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000002', 'Consulta inicial',                   0, '2026-08-27T15:30:00.000Z'),
 ('e2000000-0000-4000-8000-000000000202', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000002', 'Certificación de renta vitalicia',   1, NULL),
 ('e2000000-0000-4000-8000-000000000203', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000002', 'Apostilla y traducción pública',     2, NULL),
 ('e2000000-0000-4000-8000-000000000204', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000002', 'Presentación ante Migración',        3, NULL),
 ('e2000000-0000-4000-8000-000000000205', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000002', 'Resolución',                         4, NULL);

-- Proceso 3 · Compraventa Punta Pacífica · falta la inscripción
INSERT INTO proceso_etapa (id, tenant_id, proceso_id, nombre, orden, alcanzada_en) VALUES
 ('e2000000-0000-4000-8000-000000000301', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000003', 'Revisión de títulos',        0, '2026-07-22T13:40:00.000Z'),
 ('e2000000-0000-4000-8000-000000000302', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000003', 'Promesa de compraventa',     1, '2026-08-13T19:20:00.000Z'),
 ('e2000000-0000-4000-8000-000000000303', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000003', 'Escritura pública',          2, '2026-10-07T18:00:00.000Z'),
 ('e2000000-0000-4000-8000-000000000304', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000003', 'Inscripción en el Registro', 3, NULL);

-- Proceso 4 · Compraventa Villa Lucre · completo y cerrado
INSERT INTO proceso_etapa (id, tenant_id, proceso_id, nombre, orden, alcanzada_en) VALUES
 ('e2000000-0000-4000-8000-000000000401', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000004', 'Revisión de títulos',        0, '2026-07-03T14:10:00.000Z'),
 ('e2000000-0000-4000-8000-000000000402', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000004', 'Promesa de compraventa',     1, '2026-07-24T15:55:00.000Z'),
 ('e2000000-0000-4000-8000-000000000403', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000004', 'Escritura pública',          2, '2026-08-28T17:30:00.000Z'),
 ('e2000000-0000-4000-8000-000000000404', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000004', 'Inscripción en el Registro', 3, '2026-09-18T20:50:00.000Z');

-- Proceso 5 · Pensión alimenticia · las etapas las puso el `plan_editado`, porque el tipo no tenía plantilla
INSERT INTO proceso_etapa (id, tenant_id, proceso_id, nombre, orden, alcanzada_en) VALUES
 ('e2000000-0000-4000-8000-000000000501', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000005', 'Consulta inicial',           0, '2026-07-15T16:10:00.000Z'),
 ('e2000000-0000-4000-8000-000000000502', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000005', 'Demanda presentada',         1, '2026-08-06T15:10:00.000Z'),
 ('e2000000-0000-4000-8000-000000000503', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000005', 'Notificación al demandado',  2, '2026-09-24T19:35:00.000Z'),
 ('e2000000-0000-4000-8000-000000000504', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000005', 'Audiencia de conciliación',  3, NULL),
 ('e2000000-0000-4000-8000-000000000505', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000005', 'Sentencia',                  4, NULL);

-- Proceso 6 · Manglar Vivo · recién abierto
INSERT INTO proceso_etapa (id, tenant_id, proceso_id, nombre, orden, alcanzada_en) VALUES
 ('e2000000-0000-4000-8000-000000000601', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000006', 'Consulta inicial',               0, '2026-10-01T14:25:00.000Z'),
 ('e2000000-0000-4000-8000-000000000602', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000006', 'Recolección de documentos',      1, NULL),
 ('e2000000-0000-4000-8000-000000000603', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000006', 'Contrato de trabajo refrendado', 2, NULL),
 ('e2000000-0000-4000-8000-000000000604', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000006', 'Presentación ante Migración',    3, NULL),
 ('e2000000-0000-4000-8000-000000000605', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000006', 'Resolución',                     4, NULL),
 ('e2000000-0000-4000-8000-000000000606', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000006', 'Entrega del carné',              5, NULL);

-- Proceso 7 · Compraventa Avenida B · el otro que abrió la cotización ganada
INSERT INTO proceso_etapa (id, tenant_id, proceso_id, nombre, orden, alcanzada_en) VALUES
 ('e2000000-0000-4000-8000-000000000701', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000007', 'Revisión de títulos',        0, '2026-07-22T13:45:00.000Z'),
 ('e2000000-0000-4000-8000-000000000702', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000007', 'Promesa de compraventa',     1, '2026-09-03T15:10:00.000Z'),
 ('e2000000-0000-4000-8000-000000000703', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000007', 'Escritura pública',          2, NULL),
 ('e2000000-0000-4000-8000-000000000704', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000007', 'Inscripción en el Registro', 3, NULL);

-- ---------------------------------------------------------------------------
-- Notas: inmutables, firmadas y colgadas de la etapa en que pasaron
-- ---------------------------------------------------------------------------

INSERT INTO nota (id, tenant_id, proceso_id, proceso_etapa_id, texto, autor_id, creada_en) VALUES
 ('f3000000-0000-4000-8000-000000000101', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000101',
  'Reunión con Elvia Caballero (Agropecuaria Chiriquí) y el señor Whitfield. La empresa lo contrata como jefe de campo para la finca de Boquete, contrato por dos años. Se le explicó que el permiso sale por contrato laboral y que hay que verificar el porcentaje de extranjeros en planilla antes de presentar. Planilla actual: 84 nacionales y 3 extranjeros, así que cabe.',
  '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-08-04T15:10:00.000Z'),
 ('f3000000-0000-4000-8000-000000000102', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000102',
  'Llegaron el pasaporte vigente, los antecedentes penales del Reino Unido apostillados y la copia del contrato firmado. Falta el carné de salud panameño: se le indicó al Centro de Salud de Betania, que da cita en la semana.',
  '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-08-12T18:25:00.000Z'),
 ('f3000000-0000-4000-8000-000000000103', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000103',
  'Contrato refrendado hoy en el MITRADEL, sede de David. Queda listo para presentar en Migración. Se pidió cita por el sistema en línea.',
  '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-09-11T16:50:00.000Z'),
 ('f3000000-0000-4000-8000-000000000104', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000103',
  'La cita en el Servicio Nacional de Migración quedó para el 28 de octubre a las 9:00 a. m., oficina central de Calidonia. Hay que confirmarle a Whitfield que vaya con el pasaporte original y cuatro fotos tamaño carné.',
  '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-10-09T14:05:00.000Z'),

 ('f3000000-0000-4000-8000-000000000201', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000201',
  'El señor Müller cobra una pensión del sistema alemán de 2 100 euros mensuales, por encima del mínimo de mil dólares que exige la categoría. Se le explicó que la certificación tiene que venir apostillada y traducida por traductor público autorizado, y que eso suele tardar entre cuatro y seis semanas desde Alemania.',
  'b28d7e13-5c46-4a92-9f03-7d61e4a8c5b2', '2026-09-02T15:40:00.000Z'),

 ('f3000000-0000-4000-8000-000000000301', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000003', 'e2000000-0000-4000-8000-000000000301',
  'Estudio de títulos de la finca 30145 cerrado. Diez años limpios: un solo traspaso en 2019, sin hipotecas ni embargos inscritos. Hay una servidumbre de acueducto a favor del IDAAN que no afecta el uso del lote. Se le informó a la compradora y no objetó.',
  '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-07-22T14:30:00.000Z'),
 ('f3000000-0000-4000-8000-000000000302', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000003', 'e2000000-0000-4000-8000-000000000302',
  'Promesa de compraventa firmada por las dos partes. Precio: US$ 420 000,00, con abono del diez por ciento a la firma y el saldo contra escritura. Plazo de cierre: sesenta días.',
  '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-08-13T19:25:00.000Z'),
 ('f3000000-0000-4000-8000-000000000303', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000003', 'e2000000-0000-4000-8000-000000000303',
  'Escritura 4 812 otorgada hoy ante la Notaría Quinta del Circuito de Panamá. Entró al Registro Público el mismo día. Tiempo estimado de inscripción: quince días hábiles.',
  '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-10-07T18:10:00.000Z'),

 ('f3000000-0000-4000-8000-000000000401', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000004', 'e2000000-0000-4000-8000-000000000404',
  'Finca inscrita a nombre de Ana Lucía Bermúdez Castillo. Se retiró el certificado del Registro Público y se le entregó en físico junto con la copia de la escritura. Operación cerrada.',
  'b28d7e13-5c46-4a92-9f03-7d61e4a8c5b2', '2026-09-18T20:55:00.000Z'),
 ('f3000000-0000-4000-8000-000000000402', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000004', 'e2000000-0000-4000-8000-000000000404',
  'La cliente llamó para pedir una copia adicional del certificado de propiedad, que el banco le pidió para un refinanciamiento. Se le indicó que la puede sacar directamente en el Registro Público y cuánto cuesta.',
  'b28d7e13-5c46-4a92-9f03-7d61e4a8c5b2', '2026-10-14T19:20:00.000Z'),

 ('f3000000-0000-4000-8000-000000000501', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000005', 'e2000000-0000-4000-8000-000000000501',
  'La señora Quintero solicita pensión alimenticia para dos menores de 9 y 6 años. El padre reside en Panamá Oeste y trabaja en una empresa privada, lo que facilita el descuento directo de planilla. Se le explicó el procedimiento ante el Juzgado de Niñez y Adolescencia y los documentos que hay que acompañar.',
  'b28d7e13-5c46-4a92-9f03-7d61e4a8c5b2', '2026-07-15T16:30:00.000Z'),
 ('f3000000-0000-4000-8000-000000000502', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000005', 'e2000000-0000-4000-8000-000000000502',
  'Demanda presentada en el Juzgado Segundo de Niñez y Adolescencia del Primer Circuito Judicial de Panamá. Se pidió pensión provisional mientras se tramita la definitiva.',
  'b28d7e13-5c46-4a92-9f03-7d61e4a8c5b2', '2026-08-06T15:15:00.000Z'),
 ('f3000000-0000-4000-8000-000000000503', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000005', 'e2000000-0000-4000-8000-000000000503',
  'Demandado notificado personalmente en su lugar de trabajo. Tiene cinco días hábiles para contestar. El juzgado fijó pensión provisional de US$ 350,00 mensuales.',
  'b28d7e13-5c46-4a92-9f03-7d61e4a8c5b2', '2026-09-24T19:40:00.000Z'),

 ('f3000000-0000-4000-8000-000000000601', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000006', 'e2000000-0000-4000-8000-000000000601',
  'Teresa Icaza, de la Fundación Manglar Vivo, explicó que la voluntaria es bióloga marina neerlandesa y viene por un programa de dos años con estipendio. Se le adelantó que el permiso correcto es el de contrato laboral y no el de voluntariado, porque hay remuneración de por medio. Falta decidir la tarifa y mandarles la propuesta.',
  '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-10-01T14:50:00.000Z'),

 ('f3000000-0000-4000-8000-000000000701', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000007', 'e2000000-0000-4000-8000-000000000701',
  'Estudio de títulos de la finca 28870 cerrado. El inmueble está en el conjunto monumental histórico del Casco Antiguo, así que cualquier obra futura necesita visto bueno de la Dirección Nacional de Patrimonio Histórico. Se le advirtió a la compradora por escrito.',
  'b28d7e13-5c46-4a92-9f03-7d61e4a8c5b2', '2026-07-22T14:40:00.000Z'),
 ('f3000000-0000-4000-8000-000000000702', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000007', 'e2000000-0000-4000-8000-000000000702',
  'Promesa firmada. Precio: US$ 198 000,00. El vendedor pidió noventa días para desocupar el local, que hoy está arrendado a una cafetería; se pactó cláusula penal por cada día de retraso en la entrega.',
  'b28d7e13-5c46-4a92-9f03-7d61e4a8c5b2', '2026-09-03T15:20:00.000Z');

-- ---------------------------------------------------------------------------
-- Pendientes: `cerrado_en` y `cerrado_por` van juntos o no van
-- ---------------------------------------------------------------------------

INSERT INTO pendiente (id, tenant_id, proceso_id, proceso_etapa_id, texto, autor_id, responsable_id, creado_en, vence_en, cerrado_en, cerrado_por) VALUES
 ('a4000000-0000-4000-8000-000000000101', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000102',
  'Recordarle el carné de salud panameño', '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44',
  '2026-08-12T18:30:00.000Z', '2026-08-19T04:59:59.999Z', '2026-08-19T20:29:00.000Z', 'b28d7e13-5c46-4a92-9f03-7d61e4a8c5b2'),
 ('a4000000-0000-4000-8000-000000000102', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000103',
  'Confirmarle a Whitfield la cita en Migración del 28 de octubre', '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44',
  '2026-10-09T14:10:00.000Z', '2026-10-28T04:59:59.999Z', NULL, NULL),

 ('a4000000-0000-4000-8000-000000000201', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000202',
  'Pedirle a Müller la certificación de renta apostillada', 'b28d7e13-5c46-4a92-9f03-7d61e4a8c5b2', 'b28d7e13-5c46-4a92-9f03-7d61e4a8c5b2',
  '2026-09-02T15:45:00.000Z', '2026-11-01T04:59:59.999Z', NULL, NULL),

 ('a4000000-0000-4000-8000-000000000301', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000003', 'e2000000-0000-4000-8000-000000000304',
  'Retirar la escritura inscrita del Registro Público', '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44',
  '2026-10-07T18:15:00.000Z', '2026-11-08T04:59:59.999Z', NULL, NULL),

 ('a4000000-0000-4000-8000-000000000401', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000004', 'e2000000-0000-4000-8000-000000000403',
  'Pagar el ITBI antes de inscribir', 'b28d7e13-5c46-4a92-9f03-7d61e4a8c5b2', 'b28d7e13-5c46-4a92-9f03-7d61e4a8c5b2',
  '2026-08-28T17:35:00.000Z', '2026-09-06T04:59:59.999Z', '2026-09-04T16:20:00.000Z', 'b28d7e13-5c46-4a92-9f03-7d61e4a8c5b2'),
 ('a4000000-0000-4000-8000-000000000402', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000004', 'e2000000-0000-4000-8000-000000000404',
  'Archivar el expediente físico', 'b28d7e13-5c46-4a92-9f03-7d61e4a8c5b2', NULL,
  '2026-09-18T21:00:00.000Z', NULL, NULL, NULL),

 ('a4000000-0000-4000-8000-000000000501', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000005', 'e2000000-0000-4000-8000-000000000504',
  'Pedir fecha de audiencia en el juzgado', 'b28d7e13-5c46-4a92-9f03-7d61e4a8c5b2', 'b28d7e13-5c46-4a92-9f03-7d61e4a8c5b2',
  '2026-09-24T19:45:00.000Z', '2026-10-31T04:59:59.999Z', NULL, NULL),

 ('a4000000-0000-4000-8000-000000000601', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000006', 'e2000000-0000-4000-8000-000000000601',
  'Decidir la tarifa para Manglar Vivo y mandar la cotización', '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44',
  '2026-10-01T14:55:00.000Z', '2026-10-25T04:59:59.999Z', NULL, NULL),

 ('a4000000-0000-4000-8000-000000000701', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000007', 'e2000000-0000-4000-8000-000000000703',
  'Pedir el paz y salvo de ANATI de la finca 28870', 'b28d7e13-5c46-4a92-9f03-7d61e4a8c5b2', 'b28d7e13-5c46-4a92-9f03-7d61e4a8c5b2',
  '2026-09-03T15:25:00.000Z', '2026-11-15T04:59:59.999Z', NULL, NULL);

-- ===========================================================================
-- Gastos reales y anticipos
-- ===========================================================================
--
-- Dos procesos, y los dos lados del saldo a propósito: en el de Punta
-- Pacífica el bufete cobró de más y le debe al cliente; en el de la visa de
-- trabajo adelantó de más y el cliente le debe. `fecha` es el fin del día en
-- Panamá del día del gasto; `registrado_en` es el momento en que se cargó.
--
-- `comprobante_key` queda en nulo en todos menos uno, y el que lo lleva usa
-- la forma exacta que exige `la_llave_del_comprobante_la_fabrica_el_sistema`:
-- `comprobantes/<tenant_id>/<proceso_id>/<id>`.

INSERT INTO movimiento_gasto (id, tenant_id, proceso_id, fecha, concepto, monto, tipo, comprobante_key, usuario_id, registrado_en) VALUES
 ('78000000-0000-4000-8000-000000000101', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000001', '2026-08-06T04:59:59.999Z', 'Anticipo para tasas de Migración',                  50000, 'anticipo', NULL, '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-08-05T15:00:00.000Z'),
 ('78000000-0000-4000-8000-000000000102', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000001', '2026-08-14T04:59:59.999Z', 'Carné de salud — Centro de Salud de Betania',        1500, 'gasto',    NULL, '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-08-13T16:20:00.000Z'),
 ('78000000-0000-4000-8000-000000000103', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000001', '2026-09-13T04:59:59.999Z', 'Autenticación del contrato ante el MITRADEL',        4000, 'gasto',    NULL, '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-09-12T15:40:00.000Z'),
 ('78000000-0000-4000-8000-000000000104', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000001', '2026-10-10T04:59:59.999Z', 'Tasa del Servicio Nacional de Migración',           80000, 'gasto',    NULL, '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-10-09T14:20:00.000Z'),

 ('78000000-0000-4000-8000-000000000301', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000003', '2026-07-24T04:59:59.999Z', 'Anticipo recibido para gastos de registro',        100000, 'anticipo', NULL, '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-07-23T14:10:00.000Z'),
 ('78000000-0000-4000-8000-000000000302', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000003', '2026-08-15T04:59:59.999Z', 'Certificación de la finca 30145 en el Registro',     3200, 'gasto',    NULL, '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-08-14T15:05:00.000Z'),
 ('78000000-0000-4000-8000-000000000303', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000003', '2026-08-15T04:59:59.999Z', 'Paz y salvo municipal de Panamá',                   2500, 'gasto',    NULL, '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-08-14T15:08:00.000Z'),
 ('78000000-0000-4000-8000-000000000304', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000003', '2026-10-09T04:59:59.999Z', 'Protocolización ante la Notaría Quinta',            18000, 'gasto',    NULL, '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-10-08T16:30:00.000Z'),
 ('78000000-0000-4000-8000-000000000305', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000003', '2026-10-10T04:59:59.999Z', 'Derechos de inscripción en el Registro Público',    27000, 'gasto',
  'comprobantes/ead2d071-2ff7-4461-bf95-941c1e90d6d8/d1000000-0000-4000-8000-000000000003/78000000-0000-4000-8000-000000000305',
  '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-10-09T15:00:00.000Z'),
 ('78000000-0000-4000-8000-000000000306', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000003', '2026-10-15T04:59:59.999Z', 'Timbres fiscales de la escritura',                   8600, 'gasto',    NULL, '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-10-14T18:40:00.000Z');

-- ===========================================================================
-- Planes de pago
-- ===========================================================================
--
-- Tres formas distintas, para que la pantalla muestre las tres:
--
--  1. **Porcentaje contra hito**, colgado de la cotización ganada. Tres
--     cuotas del 33,33 % —3 333 puntos básicos cada una— que suman **99,99 %
--     y no 100 %**. El residuo está a la vista a propósito: el porcentaje se
--     trunca hacia abajo y el sistema no lo reparte ni lo redondea por su
--     cuenta.
--  2. **Monto fijo contra fecha**, colgado de la cotización emitida.
--  3. **Monto fijo contra hito**, colgado de un proceso sin cotización. Ahí
--     el porcentaje no se puede usar: no hay total del que ser porcentaje, y
--     `un_porcentaje_sin_cotizacion_no_tiene_de_que_ser_porcentaje` lo
--     rechaza.

INSERT INTO cuota (id, tenant_id, proceso_id, cotizacion_id, concepto, monto, porcentaje, vence_en, hito, creada_en) VALUES
 ('69000000-0000-4000-8000-000000000101', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', NULL, 'b5000000-0000-4000-8000-000000000001', 'Primera cuota',  NULL, 3333, NULL, 'A la firma del contrato de servicios',              '2026-07-22T13:35:00.000Z'),
 ('69000000-0000-4000-8000-000000000102', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', NULL, 'b5000000-0000-4000-8000-000000000001', 'Segunda cuota',  NULL, 3333, NULL, 'A la firma de la primera escritura pública',        '2026-07-22T13:36:00.000Z'),
 ('69000000-0000-4000-8000-000000000103', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', NULL, 'b5000000-0000-4000-8000-000000000001', 'Tercera cuota',  NULL, 3333, NULL, 'A la inscripción de las dos fincas en el Registro', '2026-07-22T13:37:00.000Z'),

 ('69000000-0000-4000-8000-000000000201', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', NULL, 'b5000000-0000-4000-8000-000000000003', 'Anticipo a la aceptación',                384000, NULL, '2026-10-01T04:59:59.999Z', NULL, '2026-09-15T16:40:00.000Z'),
 ('69000000-0000-4000-8000-000000000202', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', NULL, 'b5000000-0000-4000-8000-000000000003', 'Saldo contra entrega de los tres carnés', 384000, NULL, '2026-12-16T04:59:59.999Z', NULL, '2026-09-15T16:42:00.000Z'),

 ('69000000-0000-4000-8000-000000000301', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000002', NULL, 'Anticipo de honorarios',                   60000, NULL, NULL, 'A la firma del contrato de servicios',          '2026-09-02T15:50:00.000Z'),
 ('69000000-0000-4000-8000-000000000302', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'd1000000-0000-4000-8000-000000000002', NULL, 'Saldo de honorarios',                      60000, NULL, NULL, 'A la entrega de la resolución de Migración',    '2026-09-02T15:52:00.000Z');

-- ===========================================================================
-- Bitácora
-- ===========================================================================
--
-- Las cincuenta y siete entradas que ya estaban narran los seis primeros
-- procesos y los ocho clientes; no se tocan, porque no se pueden tocar. Lo
-- que sigue es lo que les faltaba a esas filas y lo que las nuevas traen
-- consigo.
--
-- El `detalle` sigue la convención del código: el código de la cotización
-- para sus hechos propios, el rótulo del módulo para los suyos, y el concepto
-- recortado a ochenta caracteres para líneas, gastos y cuotas.

-- La plantilla que se le escribió a «Pensión alimenticia»
INSERT INTO bitacora (id, tenant_id, entidad, entidad_id, accion, usuario_id, ocurrido_en, detalle) VALUES
 ('5a000000-0000-4000-8000-000000000001', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'tipo_proceso', '4e87b250-3a19-4c76-85d0-9f12e6a07c48', 'plantilla_editada', 'b28d7e13-5c46-4a92-9f03-7d61e4a8c5b2', '2026-10-23T14:00:00.000Z', 'Pensión alimenticia');

-- La etapa que el proceso de pensión alcanzó cuando se le escribió el plan
INSERT INTO bitacora (id, tenant_id, entidad, entidad_id, accion, usuario_id, ocurrido_en, detalle) VALUES
 ('5a000000-0000-4000-8000-000000000002', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'proceso', 'd1000000-0000-4000-8000-000000000005', 'etapa_alcanzada', 'b28d7e13-5c46-4a92-9f03-7d61e4a8c5b2', '2026-07-15T16:10:00.000Z', 'Consulta inicial');

-- El séptimo proceso, el que abrió la segunda línea de la cotización ganada
INSERT INTO bitacora (id, tenant_id, entidad, entidad_id, accion, usuario_id, ocurrido_en, detalle) VALUES
 ('5a000000-0000-4000-8000-000000000011', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'proceso', 'd1000000-0000-4000-8000-000000000007', 'creado',            'b28d7e13-5c46-4a92-9f03-7d61e4a8c5b2', '2026-07-22T13:45:00.000Z', 'Compraventa — Local comercial, Avenida B'),
 ('5a000000-0000-4000-8000-000000000012', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'proceso', 'd1000000-0000-4000-8000-000000000007', 'etapa_alcanzada',   'b28d7e13-5c46-4a92-9f03-7d61e4a8c5b2', '2026-07-22T13:45:00.000Z', 'Revisión de títulos'),
 ('5a000000-0000-4000-8000-000000000013', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'proceso', 'd1000000-0000-4000-8000-000000000007', 'nota_agregada',     'b28d7e13-5c46-4a92-9f03-7d61e4a8c5b2', '2026-07-22T14:40:00.000Z', 'Revisión de títulos'),
 ('5a000000-0000-4000-8000-000000000014', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'proceso', 'd1000000-0000-4000-8000-000000000007', 'etapa_alcanzada',   'b28d7e13-5c46-4a92-9f03-7d61e4a8c5b2', '2026-09-03T15:10:00.000Z', 'Promesa de compraventa'),
 ('5a000000-0000-4000-8000-000000000015', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'proceso', 'd1000000-0000-4000-8000-000000000007', 'nota_agregada',     'b28d7e13-5c46-4a92-9f03-7d61e4a8c5b2', '2026-09-03T15:20:00.000Z', 'Promesa de compraventa'),
 ('5a000000-0000-4000-8000-000000000016', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'proceso', 'd1000000-0000-4000-8000-000000000007', 'pendiente_abierto', 'b28d7e13-5c46-4a92-9f03-7d61e4a8c5b2', '2026-09-03T15:25:00.000Z', 'Pedir el paz y salvo de ANATI de la finca 28870');

-- COT-2026-0001 · el alta, la prosa, las líneas, la emisión y la victoria
INSERT INTO bitacora (id, tenant_id, entidad, entidad_id, accion, usuario_id, ocurrido_en, detalle) VALUES
 ('5a000000-0000-4000-8000-000000000101', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'cotizacion', 'b5000000-0000-4000-8000-000000000001', 'creado',          '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-07-21T13:20:00.000Z', 'COT-2026-0001'),
 ('5a000000-0000-4000-8000-000000000102', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'cotizacion', 'b5000000-0000-4000-8000-000000000001', 'modulo_agregado', '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-07-21T13:22:00.000Z', 'Antecedentes'),
 ('5a000000-0000-4000-8000-000000000103', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'cotizacion', 'b5000000-0000-4000-8000-000000000001', 'modulo_agregado', '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-07-21T13:25:00.000Z', 'Alcance'),
 ('5a000000-0000-4000-8000-000000000104', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'cotizacion', 'b5000000-0000-4000-8000-000000000001', 'modulo_agregado', '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-07-21T13:28:00.000Z', 'Exclusiones'),
 ('5a000000-0000-4000-8000-000000000105', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'cotizacion', 'b5000000-0000-4000-8000-000000000001', 'modulo_agregado', '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-07-21T13:31:00.000Z', 'Supuestos'),
 ('5a000000-0000-4000-8000-000000000106', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'cotizacion', 'b5000000-0000-4000-8000-000000000001', 'modulo_agregado', '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-07-21T13:34:00.000Z', 'Cláusulas'),
 ('5a000000-0000-4000-8000-000000000107', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'cotizacion', 'b5000000-0000-4000-8000-000000000001', 'linea_agregada',  '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-07-21T13:40:00.000Z', 'Compraventa de la finca 30145 — Lote 14, Punta Pacífica'),
 ('5a000000-0000-4000-8000-000000000108', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'cotizacion', 'b5000000-0000-4000-8000-000000000001', 'linea_agregada',  '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-07-21T13:42:00.000Z', 'Compraventa de la finca 28870 — local comercial, Avenida B'),
 ('5a000000-0000-4000-8000-000000000109', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'cotizacion', 'b5000000-0000-4000-8000-000000000001', 'linea_agregada',  '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-07-21T13:45:00.000Z', 'Derechos de inscripción en el Registro Público (dos fincas)'),
 ('5a000000-0000-4000-8000-00000000010a', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'cotizacion', 'b5000000-0000-4000-8000-000000000001', 'linea_agregada',  '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-07-21T13:47:00.000Z', 'Protocolización ante notaría pública (dos escrituras)'),
 ('5a000000-0000-4000-8000-00000000010b', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'cotizacion', 'b5000000-0000-4000-8000-000000000001', 'linea_agregada',  '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-07-21T13:50:00.000Z', 'Certificaciones de finca, paz y salvo municipal y de ANATI'),
 ('5a000000-0000-4000-8000-00000000010c', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'cotizacion', 'b5000000-0000-4000-8000-000000000001', 'emitido',         '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-07-21T15:00:00.000Z', 'COT-2026-0001'),
 ('5a000000-0000-4000-8000-00000000010d', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'cotizacion', 'b5000000-0000-4000-8000-000000000001', 'ganado',          '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-07-22T13:30:00.000Z', 'COT-2026-0001'),
 ('5a000000-0000-4000-8000-00000000010e', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'cotizacion', 'b5000000-0000-4000-8000-000000000001', 'cuota_agregada',  '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-07-22T13:35:00.000Z', 'Primera cuota'),
 ('5a000000-0000-4000-8000-00000000010f', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'cotizacion', 'b5000000-0000-4000-8000-000000000001', 'cuota_agregada',  '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-07-22T13:36:00.000Z', 'Segunda cuota'),
 ('5a000000-0000-4000-8000-000000000110', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'cotizacion', 'b5000000-0000-4000-8000-000000000001', 'cuota_agregada',  '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-07-22T13:37:00.000Z', 'Tercera cuota');

-- COT-2026-0002 · la que se perdió
INSERT INTO bitacora (id, tenant_id, entidad, entidad_id, accion, usuario_id, ocurrido_en, detalle) VALUES
 ('5a000000-0000-4000-8000-000000000201', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'cotizacion', 'b5000000-0000-4000-8000-000000000002', 'creado',          'b28d7e13-5c46-4a92-9f03-7d61e4a8c5b2', '2026-08-26T14:40:00.000Z', 'COT-2026-0002'),
 ('5a000000-0000-4000-8000-000000000202', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'cotizacion', 'b5000000-0000-4000-8000-000000000002', 'modulo_agregado', 'b28d7e13-5c46-4a92-9f03-7d61e4a8c5b2', '2026-08-26T14:44:00.000Z', 'Antecedentes'),
 ('5a000000-0000-4000-8000-000000000203', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'cotizacion', 'b5000000-0000-4000-8000-000000000002', 'modulo_agregado', 'b28d7e13-5c46-4a92-9f03-7d61e4a8c5b2', '2026-08-26T14:48:00.000Z', 'Alcance'),
 ('5a000000-0000-4000-8000-000000000204', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'cotizacion', 'b5000000-0000-4000-8000-000000000002', 'modulo_agregado', 'b28d7e13-5c46-4a92-9f03-7d61e4a8c5b2', '2026-08-26T14:52:00.000Z', 'Exclusiones'),
 ('5a000000-0000-4000-8000-000000000205', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'cotizacion', 'b5000000-0000-4000-8000-000000000002', 'modulo_agregado', 'b28d7e13-5c46-4a92-9f03-7d61e4a8c5b2', '2026-08-26T14:56:00.000Z', 'Supuestos'),
 ('5a000000-0000-4000-8000-000000000206', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'cotizacion', 'b5000000-0000-4000-8000-000000000002', 'modulo_agregado', 'b28d7e13-5c46-4a92-9f03-7d61e4a8c5b2', '2026-08-26T15:00:00.000Z', 'Cláusulas'),
 ('5a000000-0000-4000-8000-000000000207', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'cotizacion', 'b5000000-0000-4000-8000-000000000002', 'modulo_agregado', 'b28d7e13-5c46-4a92-9f03-7d61e4a8c5b2', '2026-08-26T15:05:00.000Z', 'Nota al cliente'),
 ('5a000000-0000-4000-8000-000000000208', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'cotizacion', 'b5000000-0000-4000-8000-000000000002', 'linea_agregada',  'b28d7e13-5c46-4a92-9f03-7d61e4a8c5b2', '2026-08-26T15:12:00.000Z', 'Compraventa del apartamento 12-B, PH Playa Serena, Coronado'),
 ('5a000000-0000-4000-8000-000000000209', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'cotizacion', 'b5000000-0000-4000-8000-000000000002', 'linea_agregada',  'b28d7e13-5c46-4a92-9f03-7d61e4a8c5b2', '2026-08-26T15:15:00.000Z', 'Protocolización ante notaría pública'),
 ('5a000000-0000-4000-8000-00000000020a', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'cotizacion', 'b5000000-0000-4000-8000-000000000002', 'linea_agregada',  'b28d7e13-5c46-4a92-9f03-7d61e4a8c5b2', '2026-08-26T15:18:00.000Z', 'Derechos de inscripción en el Registro Público'),
 ('5a000000-0000-4000-8000-00000000020b', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'cotizacion', 'b5000000-0000-4000-8000-000000000002', 'linea_agregada',  'b28d7e13-5c46-4a92-9f03-7d61e4a8c5b2', '2026-08-26T15:21:00.000Z', 'Certificación de finca y paz y salvos (ANATI, IDAAN, municipio)'),
 ('5a000000-0000-4000-8000-00000000020c', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'cotizacion', 'b5000000-0000-4000-8000-000000000002', 'emitido',         'b28d7e13-5c46-4a92-9f03-7d61e4a8c5b2', '2026-08-26T16:00:00.000Z', 'COT-2026-0002'),
 ('5a000000-0000-4000-8000-00000000020d', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'cotizacion', 'b5000000-0000-4000-8000-000000000002', 'perdido',         'b28d7e13-5c46-4a92-9f03-7d61e4a8c5b2', '2026-09-21T14:20:00.000Z', 'COT-2026-0002');

-- COT-2026-0003 · la que está esperando respuesta
INSERT INTO bitacora (id, tenant_id, entidad, entidad_id, accion, usuario_id, ocurrido_en, detalle) VALUES
 ('5a000000-0000-4000-8000-000000000301', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'cotizacion', 'b5000000-0000-4000-8000-000000000003', 'creado',          '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-09-15T14:05:00.000Z', 'COT-2026-0003'),
 ('5a000000-0000-4000-8000-000000000302', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'cotizacion', 'b5000000-0000-4000-8000-000000000003', 'modulo_agregado', '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-09-15T14:10:00.000Z', 'Antecedentes'),
 ('5a000000-0000-4000-8000-000000000303', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'cotizacion', 'b5000000-0000-4000-8000-000000000003', 'modulo_agregado', '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-09-15T14:18:00.000Z', 'Alcance'),
 ('5a000000-0000-4000-8000-000000000304', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'cotizacion', 'b5000000-0000-4000-8000-000000000003', 'modulo_agregado', '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-09-15T14:25:00.000Z', 'Exclusiones'),
 ('5a000000-0000-4000-8000-000000000305', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'cotizacion', 'b5000000-0000-4000-8000-000000000003', 'modulo_agregado', '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-09-15T14:32:00.000Z', 'Supuestos'),
 ('5a000000-0000-4000-8000-000000000306', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'cotizacion', 'b5000000-0000-4000-8000-000000000003', 'modulo_agregado', '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-09-15T14:40:00.000Z', 'Cláusulas'),
 ('5a000000-0000-4000-8000-000000000307', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'cotizacion', 'b5000000-0000-4000-8000-000000000003', 'linea_agregada',  '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-09-15T15:02:00.000Z', 'Permiso de residencia y trabajo — tres técnicos agrícolas'),
 ('5a000000-0000-4000-8000-000000000308', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'cotizacion', 'b5000000-0000-4000-8000-000000000003', 'linea_agregada',  '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-09-15T15:06:00.000Z', 'Refrendo de los tres contratos de trabajo ante el MITRADEL'),
 ('5a000000-0000-4000-8000-000000000309', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'cotizacion', 'b5000000-0000-4000-8000-000000000003', 'linea_agregada',  '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-09-15T15:10:00.000Z', 'Tasas del Servicio Nacional de Migración (tres solicitantes)'),
 ('5a000000-0000-4000-8000-00000000030a', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'cotizacion', 'b5000000-0000-4000-8000-000000000003', 'linea_agregada',  '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-09-15T15:14:00.000Z', 'Carné de residente y certificaciones (tres solicitantes)'),
 ('5a000000-0000-4000-8000-00000000030b', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'cotizacion', 'b5000000-0000-4000-8000-000000000003', 'linea_agregada',  '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-09-15T15:18:00.000Z', 'Autenticación y apostilla de documentos de origen'),
 ('5a000000-0000-4000-8000-00000000030c', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'cotizacion', 'b5000000-0000-4000-8000-000000000003', 'emitido',         '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-09-15T16:30:00.000Z', 'COT-2026-0003'),
 ('5a000000-0000-4000-8000-00000000030d', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'cotizacion', 'b5000000-0000-4000-8000-000000000003', 'cuota_agregada',  '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-09-15T16:40:00.000Z', 'Anticipo a la aceptación'),
 ('5a000000-0000-4000-8000-00000000030e', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'cotizacion', 'b5000000-0000-4000-8000-000000000003', 'cuota_agregada',  '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-09-15T16:42:00.000Z', 'Saldo contra entrega de los tres carnés');

-- COT-2026-0004 · la copia de la perdida, con el honorario revisado
INSERT INTO bitacora (id, tenant_id, entidad, entidad_id, accion, usuario_id, ocurrido_en, detalle) VALUES
 ('5a000000-0000-4000-8000-000000000401', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'cotizacion', 'b5000000-0000-4000-8000-000000000004', 'duplicado',    'b28d7e13-5c46-4a92-9f03-7d61e4a8c5b2', '2026-10-19T15:10:00.000Z', 'COT-2026-0002'),
 ('5a000000-0000-4000-8000-000000000402', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'cotizacion', 'b5000000-0000-4000-8000-000000000004', 'linea_editada', 'b28d7e13-5c46-4a92-9f03-7d61e4a8c5b2', '2026-10-19T15:25:00.000Z', 'Compraventa del apartamento 12-B, PH Playa Serena, Coronado'),
 ('5a000000-0000-4000-8000-000000000403', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'cotizacion', 'b5000000-0000-4000-8000-000000000004', 'modulo_editado', 'b28d7e13-5c46-4a92-9f03-7d61e4a8c5b2', '2026-10-19T15:30:00.000Z', 'Nota al cliente');

-- COT-2026-0005 · el borrador de Manglar Vivo
INSERT INTO bitacora (id, tenant_id, entidad, entidad_id, accion, usuario_id, ocurrido_en, detalle) VALUES
 ('5a000000-0000-4000-8000-000000000501', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'cotizacion', 'b5000000-0000-4000-8000-000000000005', 'creado',          '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-10-22T14:00:00.000Z', 'COT-2026-0005'),
 ('5a000000-0000-4000-8000-000000000502', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'cotizacion', 'b5000000-0000-4000-8000-000000000005', 'modulo_agregado', '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-10-22T14:06:00.000Z', 'Antecedentes'),
 ('5a000000-0000-4000-8000-000000000503', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'cotizacion', 'b5000000-0000-4000-8000-000000000005', 'modulo_agregado', '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-10-22T14:12:00.000Z', 'Alcance'),
 ('5a000000-0000-4000-8000-000000000504', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'cotizacion', 'b5000000-0000-4000-8000-000000000005', 'modulo_agregado', '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-10-22T14:17:00.000Z', 'Exclusiones'),
 ('5a000000-0000-4000-8000-000000000505', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'cotizacion', 'b5000000-0000-4000-8000-000000000005', 'modulo_agregado', '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-10-22T14:22:00.000Z', 'Nota al cliente'),
 ('5a000000-0000-4000-8000-000000000506', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'cotizacion', 'b5000000-0000-4000-8000-000000000005', 'linea_agregada',  '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-10-22T14:30:00.000Z', 'Permiso de residencia y trabajo — una voluntaria (tarifa ONG)'),
 ('5a000000-0000-4000-8000-000000000507', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'cotizacion', 'b5000000-0000-4000-8000-000000000005', 'linea_agregada',  '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-10-22T14:34:00.000Z', 'Tasas del Servicio Nacional de Migración'),
 ('5a000000-0000-4000-8000-000000000508', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'cotizacion', 'b5000000-0000-4000-8000-000000000005', 'linea_agregada',  '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-10-22T14:38:00.000Z', 'Carné de residente y certificaciones');

-- Los movimientos de gasto y las cuotas de proceso
INSERT INTO bitacora (id, tenant_id, entidad, entidad_id, accion, usuario_id, ocurrido_en, detalle) VALUES
 ('5a000000-0000-4000-8000-000000000601', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'proceso', 'd1000000-0000-4000-8000-000000000001', 'anticipo_registrado',   '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-08-05T15:00:00.000Z', 'Anticipo para tasas de Migración'),
 ('5a000000-0000-4000-8000-000000000602', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'proceso', 'd1000000-0000-4000-8000-000000000001', 'gasto_registrado',      '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-08-13T16:20:00.000Z', 'Carné de salud — Centro de Salud de Betania'),
 ('5a000000-0000-4000-8000-000000000603', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'proceso', 'd1000000-0000-4000-8000-000000000001', 'gasto_registrado',      '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-09-12T15:40:00.000Z', 'Autenticación del contrato ante el MITRADEL'),
 ('5a000000-0000-4000-8000-000000000604', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'proceso', 'd1000000-0000-4000-8000-000000000001', 'gasto_registrado',      '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-10-09T14:20:00.000Z', 'Tasa del Servicio Nacional de Migración'),
 ('5a000000-0000-4000-8000-000000000605', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'proceso', 'd1000000-0000-4000-8000-000000000003', 'anticipo_registrado',   '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-07-23T14:10:00.000Z', 'Anticipo recibido para gastos de registro'),
 ('5a000000-0000-4000-8000-000000000606', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'proceso', 'd1000000-0000-4000-8000-000000000003', 'gasto_registrado',      '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-08-14T15:05:00.000Z', 'Certificación de la finca 30145 en el Registro'),
 ('5a000000-0000-4000-8000-000000000607', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'proceso', 'd1000000-0000-4000-8000-000000000003', 'gasto_registrado',      '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-08-14T15:08:00.000Z', 'Paz y salvo municipal de Panamá'),
 ('5a000000-0000-4000-8000-000000000608', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'proceso', 'd1000000-0000-4000-8000-000000000003', 'gasto_registrado',      '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-10-08T16:30:00.000Z', 'Protocolización ante la Notaría Quinta'),
 ('5a000000-0000-4000-8000-000000000609', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'proceso', 'd1000000-0000-4000-8000-000000000003', 'gasto_registrado',      '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-10-09T15:00:00.000Z', 'Derechos de inscripción en el Registro Público'),
 ('5a000000-0000-4000-8000-00000000060a', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'proceso', 'd1000000-0000-4000-8000-000000000003', 'comprobante_adjuntado', '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-10-09T15:05:00.000Z', 'Derechos de inscripción en el Registro Público'),
 ('5a000000-0000-4000-8000-00000000060b', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'proceso', 'd1000000-0000-4000-8000-000000000003', 'gasto_registrado',      '6f1a4c20-9b3e-4d51-8a77-2c0e5f8b1d44', '2026-10-14T18:40:00.000Z', 'Timbres fiscales de la escritura'),
 ('5a000000-0000-4000-8000-00000000060c', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'proceso', 'd1000000-0000-4000-8000-000000000002', 'cuota_agregada',        'b28d7e13-5c46-4a92-9f03-7d61e4a8c5b2', '2026-09-02T15:50:00.000Z', 'Anticipo de honorarios'),
 ('5a000000-0000-4000-8000-00000000060d', 'ead2d071-2ff7-4461-bf95-941c1e90d6d8', 'proceso', 'd1000000-0000-4000-8000-000000000002', 'cuota_agregada',        'b28d7e13-5c46-4a92-9f03-7d61e4a8c5b2', '2026-09-02T15:52:00.000Z', 'Saldo de honorarios');
