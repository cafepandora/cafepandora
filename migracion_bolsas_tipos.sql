-- Ejecuta esto en el SQL Editor de Supabase, DESPUÉS de haber corrido
-- migracion_maquila_presentaciones.sql. Reemplaza el servicio genérico
-- "Bolsas" por dos servicios separados: "Bolsas Negras" y "Bolsas Ziploc",
-- cada uno con su propio precio por Media lb / Libra / Kilo / Cuarterón.

DELETE FROM maquila_tarifas WHERE servicio = 'Bolsas';

INSERT INTO maquila_tarifas (servicio, presentacion, precio, ts) VALUES
	('Bolsas Negras', 'Media lb', 0, extract(epoch from now()) * 1000),
	('Bolsas Negras', 'Libra', 0, extract(epoch from now()) * 1000),
	('Bolsas Negras', 'Kilo', 0, extract(epoch from now()) * 1000),
	('Bolsas Negras', 'Cuarterón', 0, extract(epoch from now()) * 1000),
	('Bolsas Ziploc', 'Media lb', 0, extract(epoch from now()) * 1000),
	('Bolsas Ziploc', 'Libra', 0, extract(epoch from now()) * 1000),
	('Bolsas Ziploc', 'Kilo', 0, extract(epoch from now()) * 1000),
	('Bolsas Ziploc', 'Cuarterón', 0, extract(epoch from now()) * 1000);
