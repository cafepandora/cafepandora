-- Datos históricos de la versión anterior (Netlify), adaptados al esquema nuevo.
-- Ejecuta esto en el SQL Editor de Supabase DESPUÉS de haber corrido migration.sql.
--
-- Notas de la conversión (para que sepas qué se ajustó):
-- 1) El estado antiguo "entregado" no existe en el modelo nuevo (que solo
--    distingue Pagado/Pendiente). Se importó como "Pendiente" por seguridad
--    contable — si esas ventas ya estaban cobradas, entra a Ventas y cámbialas
--    a "Pagado" con un clic.
-- 2) Cuando una venta antigua tenía VARIOS productos distintos en un solo
--    pedido (ej. lavado + honey en la misma venta), no se puede reducir a un
--    solo lote/presentación, así que esas quedan con lote vacío pero con el
--    detalle completo guardado en la columna "items" (se ve igual en la
--    lista de Ventas, solo que no suman en el desglose "Ventas por lote" del
--    Resumen).
-- 3) El valor de cada venta se tomó del campo "valor" original (el total real
--    cobrado), no de la suma de los subtotales de cada ítem — en varias
--    ventas antiguas esos dos números no coinciden exactamente.
-- 4) "Media libra" se renombró a "Media lb" para que calce con las opciones
--    de presentación de la app nueva.

INSERT INTO "gastos" (usuario, concepto, monto, categoria, estado, ts) VALUES
('Juan', 'Trabajadores subida de maquina', 100000, 'Mano de obra', 'Pagado', 1788710041553),
('Juan', 'Transporte Tostadora', 450000, 'Transporte', 'Pagado', 1788710064017),
('Inés', 'Aportes parafiscales', 1168650, 'Servicios', 'Pagado', 1788710184871),
('Inés', 'Internet', 130000, 'Servicios', 'Pagado', 1788710195254),
('Inés', 'Agua', 35000, 'Servicios', 'Pagado', 1788710207274),
('Juan', 'Accesorios tostadora', 280000, 'Otro', 'Pagado', 1788710238704),
('Inés', 'Red Vital', 186000, 'Servicios', 'Pagado', 1788710272667),
('Juan', 'Almuerzos', 69000, 'Otro', 'Pagado', 1788722297926),
('Juan', 'Café don Leo', 791000, 'Café verde', 'Pagado', 1788949900643),
('Joaquín', 'Comida gato', 112000, 'Otro', 'Pagado', 1788950998541),
('Joaquín', 'Revisión tecnimecanica', 368600, 'Otro', 'Pagado', 1788951045413),
('Joaquín', 'Súper paris queso huevos', 102000, 'Otro', 'Pagado', 1788951107417),
('Inés', 'Súper Paris', 108900, 'Otro', 'Pagado', 1789310882737),
('Juan', 'D1', 109800, 'Otro', 'Pagado', 1789325604062),
('Juan', 'Cafe pasilla Diana', 182000, 'Café verde', 'Pagado', 1789527837122),
('Juan', 'Vuelo Joaquín', 490000, 'Transporte', 'Pagado', 1789527866627),
('Juan', 'Almuerzos', 54000, 'Servicios', 'Pagado', 1789528284296);

INSERT INTO "ventas" (usuario, cliente, tipo_cliente, tipo_venta, lote, presentacion, cantidad, items, valor, estado, metodo, ts) VALUES
('Juan', 'Silvia', 'Cliente normal', 'cafe', 'Lavado', 'Libra', 2, '[{"proceso":"Lavado","cantidad":2,"producto":"Café Pandora","subtotal":74000,"presentacion":"Libra"}]', 74000, 'Pendiente', 'Efectivo', 1788707450240),
('Juan', 'Verónica', 'Cliente normal', 'cafe', 'Lavado', 'Libra', 3, '[{"proceso":"Lavado","cantidad":3,"producto":"Café Pandora","subtotal":111000,"presentacion":"Libra"}]', 111000, 'Pagado', 'Transferencia a Inés', 1788709859177),
('Juan', 'Saul', 'Cliente normal', 'cafe', 'Lavado', 'Libra', 2, '[{"proceso":"Lavado","cantidad":2,"producto":"Café Pandora","subtotal":74000,"presentacion":"Libra"}]', 74000, 'Pagado', 'Efectivo', 1788709878944),
('Juan', 'Ernestina', 'Cliente normal', 'cafe', 'Lavado', 'Libra', 3, '[{"proceso":"Lavado","cantidad":3,"producto":"Café Pandora","subtotal":111000,"presentacion":"Libra"}]', 111000, 'Pendiente', '', 1788709899314),
('Juan', 'Daniel médico', 'Distribuidor', 'cafe', 'Lavado', 'Libra', 1, '[{"proceso":"Lavado","cantidad":1,"producto":"Café Pandora","subtotal":35000,"presentacion":"Libra"}]', 35000, 'Pagado', 'Efectivo', 1788709922544),
('Juan', 'Doña Liliana', 'Cliente normal', 'cafe', NULL, NULL, 1, '[{"proceso":"Lavado","cantidad":1,"producto":"Café Pandora","subtotal":37000,"presentacion":"Libra"},{"proceso":"Lavado","cantidad":1,"producto":"Café Pandora","subtotal":20000,"presentacion":"Media lb"}]', 57000, 'Pagado', 'Efectivo', 1788709957537),
('Juan', 'Amanda', 'Cliente normal', 'cafe', 'Lavado', 'Libra', 2, '[{"proceso":"Lavado","cantidad":2,"producto":"Café Pandora","subtotal":74000,"presentacion":"Libra"}]', 74000, 'Pagado', 'Efectivo', 1788709979706),
('Juan', 'Cristina Santa Rosa', 'Cliente normal', 'cafe', NULL, NULL, 1, '[{"proceso":"Lavado","cantidad":2,"producto":"Café Pandora","subtotal":74000,"presentacion":"Libra"},{"proceso":"Lavado","cantidad":3,"producto":"Café Pandora","subtotal":222000,"presentacion":"Kilo"}]', 312000, 'Pagado', 'Efectivo', 1788710141812),
('Juan', 'Katrin', 'Cliente normal', 'cafe', 'Lavado', 'Libra', 2, '[{"proceso":"Lavado","cantidad":2,"producto":"Café Pandora","subtotal":74000,"presentacion":"Libra"}]', 74000, 'Pagado', 'Transferencia a Juan', 1788710426818),
('Juan', 'Pipe plazas', 'Cliente normal', 'cafe', 'Honey', 'Libra', 4, '[{"proceso":"Honey","cantidad":4,"producto":"Café Pandora","subtotal":148000,"presentacion":"Libra"}]', 200000, 'Pagado', 'Transferencia a Juan', 1788722255065),
('Juan', 'Lorena yoga', 'Cliente normal', 'cafe', 'Lavado', 'Libra', 1, '[{"proceso":"Lavado","cantidad":1,"producto":"Café Pandora","subtotal":37000,"presentacion":"Libra"}]', 37000, 'Pagado', 'Efectivo', 1788784583647),
('Juan', 'Gabriel', 'Cliente normal', 'cafe', 'Lavado', 'Libra', 25, '[{"proceso":"Lavado","cantidad":25,"producto":"Café Pandora","subtotal":925000,"presentacion":"Libra"}]', 925000, 'Pendiente', '', 1788784674033),
('Joaquín', 'Gabriel Maya', 'Cliente normal', 'cafe', 'Lavado', 'Libra', 25, '[{"proceso":"Lavado","cantidad":25,"producto":"Castillo","subtotal":925000,"presentacion":"Libra"}]', 925000, 'Pendiente', '', 1788809256508),
('Joaquín', 'Hugo Contreras', 'Cliente normal', 'cafe', NULL, NULL, 1, '[{"proceso":"Lavado","cantidad":1,"producto":"Café Pandora","subtotal":20000,"presentacion":"Media lb"},{"proceso":"Natural","cantidad":7,"producto":"Café Pandora","subtotal":140000,"presentacion":"Media lb"}]', 386000, 'Pagado', 'Transferencia a Juan', 1788809438227),
('Juan', 'Vane Roldán', 'Cliente normal', 'cafe', NULL, NULL, 1, '[{"proceso":"Lavado","cantidad":1,"producto":"Café Pandora","subtotal":37000,"presentacion":"Libra"},{"proceso":"Honey","cantidad":1,"producto":"Café Pandora","subtotal":37000,"presentacion":"Libra"},{"proceso":"Exótico","cantidad":1,"producto":"Café Pandora","subtotal":20000,"presentacion":"Media lb"}]', 122000, 'Pagado', 'Efectivo', 1788818396757),
('Juan', 'Camila odontologa', 'Cliente normal', 'cafe', 'Lavado', 'Libra', 1, '[{"proceso":"Lavado","cantidad":1,"producto":"Café Pandora","subtotal":37000,"presentacion":"Libra"}]', 37000, 'Pendiente', '', 1788819483272),
('Joaquín', 'Gloria G', 'Cliente normal', 'cafe', 'Honey', 'Libra', 1, '[{"proceso":"Honey","cantidad":1,"producto":"Café Pandora","subtotal":37000,"presentacion":"Libra"}]', 50000, 'Pagado', 'Efectivo', 1788949818962),
('Juan', 'Don Nicolás', 'Cliente normal', 'cafe', 'Lavado', 'Libra', 1, '[{"proceso":"Lavado","cantidad":1,"producto":"Café Pandora","subtotal":37000,"presentacion":"Libra"}]', 37000, 'Pagado', 'Transferencia a Juan', 1789031665990),
('Juan', 'Catalina peluquería', 'Cliente normal', 'cafe', 'Lavado', 'Libra', 1, '[{"proceso":"Lavado","cantidad":1,"producto":"Café Pandora","subtotal":37000,"presentacion":"Libra"}]', 37000, 'Pagado', 'Transferencia a Juan', 1789031685816),
('Juan', 'Inmobiliaria escala', 'Cliente normal', 'cafe', 'Lavado', 'Cuarterón', 1, '[{"proceso":"Lavado","cantidad":1,"producto":"Café Pandora","subtotal":185000,"presentacion":"Cuarterón"}]', 185000, 'Pagado', 'Transferencia a Juan', 1789137740446),
('Juan', 'Luis', 'Cliente normal', 'cafe', NULL, NULL, 1, '[{"proceso":"Lavado","cantidad":2,"producto":"Café Pandora","subtotal":148000,"presentacion":"Kilo"},{"proceso":"Honey","cantidad":1,"producto":"Café Pandora","subtotal":37000,"presentacion":"Libra"},{"proceso":"Natural","cantidad":2,"producto":"Café Pandora","subtotal":74000,"presentacion":"Libra"},{"proceso":"Natural","cantidad":1,"producto":"Café Pandora","subtotal":20000,"presentacion":"Media lb"},{"proceso":"Exótico","cantidad":1,"producto":"Café Pandora","subtotal":20000,"presentacion":"Media lb"},{"proceso":"Lavado","cantidad":2,"producto":"Café Pandora","subtotal":40000,"presentacion":"Media lb"}]', 403000, 'Pendiente', '', 1789146223431),
('Juan', 'Daniel montes', 'Distribuidor', 'cafe', 'Lavado', 'Libra', 3, '[{"proceso":"Lavado","cantidad":3,"producto":"Café Pandora","subtotal":105000,"presentacion":"Libra"}]', 105000, 'Pagado', 'Transferencia a Juan', 1789156378245),
('Juan', 'Saúl dosquebradas', 'Cliente normal', 'cafe', 'Lavado', 'Libra', 2, '[{"proceso":"Lavado","cantidad":2,"producto":"Café Pandora","subtotal":74000,"presentacion":"Libra"}]', 74000, 'Pagado', 'Transferencia a Juan', 1789156392317),
('Juan', 'Juan David Mejía', 'Cliente normal', 'cafe', 'Lavado', 'Cuarterón', 2, '[{"proceso":"Lavado","cantidad":2,"producto":"Café Pandora","subtotal":370000,"presentacion":"Cuarterón"}]', 370000, 'Pagado', 'Transferencia a Joaquín', 1789218726624),
('Juan', 'Yerbabuena', 'Distribuidor', 'cafe', NULL, NULL, 1, '[{"proceso":"Lavado","cantidad":2,"producto":"Café Pandora","subtotal":350000,"presentacion":"Cuarterón"},{"proceso":"Lavado","cantidad":6,"producto":"Café Pandora","subtotal":210000,"presentacion":"Libra"}]', 560000, 'Pagado', 'Transferencia a Juan', 1789218789815),
('Juan', 'Doña Liliana', 'Cliente normal', 'cafe', 'Lavado', 'Libra', 1, '[{"proceso":"Lavado","cantidad":1,"producto":"Café Pandora","subtotal":37000,"presentacion":"Libra"}]', 37000, 'Pagado', 'Efectivo', 1789218834778),
('Juan', 'Sobrino Don wilson', 'Cliente normal', 'cafe', 'Lavado', 'Libra', 8, '[{"proceso":"Lavado","cantidad":8,"producto":"Café Pandora","subtotal":296000,"presentacion":"Libra"}]', 296000, 'Pagado', 'Transferencia a Juan', 1789223370649),
('Juan', 'Valentina Jaramillo', 'Cliente normal', 'cafe', 'Lavado', 'Libra', 4, '[{"proceso":"Lavado","cantidad":4,"producto":"Café Pandora","subtotal":148000,"presentacion":"Libra"}]', 156000, 'Pagado', 'Transferencia a Juan', 1789269306190),
('Joaquín', 'Tulia Maya', 'Cliente normal', 'cafe', NULL, NULL, 1, '[]', 210000, 'Pagado', 'Transferencia a Joaquín', 1789303878642),
('Joaquín', 'Wilson Soto', 'Cliente normal', 'cafe', 'Lavado', 'Libra', 2, '[{"proceso":"Lavado","cantidad":2,"producto":"Castillo","subtotal":74000,"presentacion":"Libra"}]', 74000, 'Pagado', 'Transferencia a Joaquín', 1789406214212),
('Joaquín', 'Mona Maya', 'Cliente normal', 'cafe', 'Honey', 'Media lb', 1, '[{"proceso":"Honey","cantidad":1,"producto":"Honey","subtotal":20000,"presentacion":"Media lb"}]', 30000, 'Pagado', 'Transferencia a Joaquín', 1789406299789),
('Joaquín', 'Dora Maya', 'Cliente normal', 'cafe', 'Honey', 'Libra', 7, '[{"proceso":"Honey","cantidad":7,"producto":"Café Pandora","subtotal":259000,"presentacion":"Libra"}]', 351000, 'Pendiente', '', 1789406472062),
('Joaquín', 'Gloria Maya', 'Cliente normal', 'cafe', 'Honey', 'Libra', 12, '[{"proceso":"Honey","cantidad":12,"producto":"Castillo","subtotal":444000,"presentacion":"Libra"}]', 490000, 'Pendiente', '', 1789406550243),
('Juan', 'Victoria Bogotá', 'Cliente normal', 'cafe', 'Lavado', 'Libra', 4, '[{"proceso":"Lavado","cantidad":4,"producto":"Café Pandora","subtotal":148000,"presentacion":"Libra"}]', 148000, 'Pendiente', '', 1789412552322),
('Juan', 'Diana Andahuaylas', 'Cliente normal', 'cafe', NULL, NULL, 1, '[{"proceso":"Lavado","cantidad":2,"producto":"Café Pandora","subtotal":74000,"presentacion":"Libra"},{"proceso":"Honey","cantidad":4,"producto":"Café Pandora","subtotal":148000,"presentacion":"Libra"}]', 212000, 'Pagado', 'Transferencia a Juan', 1789527756078),
('Juan', 'Cartagena', 'Cliente normal', 'cafe', NULL, NULL, 1, '[{"proceso":"Lavado","cantidad":7,"producto":"Café Pandora","subtotal":259000,"presentacion":"Libra"},{"proceso":"Lavado","cantidad":1,"producto":"Café Pandora","subtotal":74000,"presentacion":"Kilo"},{"proceso":"Exótico","cantidad":6,"producto":"Café Pandora","subtotal":120000,"presentacion":"Media lb"}]', 543000, 'Pendiente', 'Transferencia a Juan', 1789528070708),
('Juan', 'Luis novio mamá silvia', 'Cliente normal', 'cafe', 'Lavado', 'Kilo', 1, '[{"proceso":"Lavado","cantidad":1,"producto":"Café Pandora","subtotal":74000,"presentacion":"Kilo"}]', 74000, 'Pagado', 'Transferencia a Juan', 1789528153033);
