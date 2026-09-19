-- Ejecuta esto en el SQL Editor de Supabase de tu proyecto YA EXISTENTE.
-- No toca ventas, gastos, clientes, inventario ni finca — solo reestructura
-- la tabla de tarifas de maquila. Cualquier precio que ya hubieras puesto en
-- Empaque, Molienda o Selección se pierde (quedan en $0, listos para que los
-- vuelvas a poner desde la pestaña Configuración). Trilla y Tostión NO se
-- tocan, conservan el precio que ya tengan.

ALTER TABLE maquila_tarifas RENAME COLUMN precio_por_kg TO precio;
ALTER TABLE maquila_tarifas ADD COLUMN IF NOT EXISTS presentacion text;
ALTER TABLE maquila_tarifas DROP CONSTRAINT IF EXISTS maquila_tarifas_servicio_key;

-- Ya no se usa "Selección" con este nuevo esquema.
DELETE FROM maquila_tarifas WHERE servicio = 'Selección';

-- Empaque y Molienda pasan de una sola fila "por kg" a 4 filas, una por presentación.
DELETE FROM maquila_tarifas WHERE servicio IN ('Empaque', 'Molienda');

INSERT INTO maquila_tarifas (servicio, presentacion, precio, ts) VALUES
	('Empaque', 'Media lb', 0, extract(epoch from now()) * 1000),
	('Empaque', 'Libra', 0, extract(epoch from now()) * 1000),
	('Empaque', 'Kilo', 0, extract(epoch from now()) * 1000),
	('Empaque', 'Cuarterón', 0, extract(epoch from now()) * 1000),
	('Molienda', 'Media lb', 0, extract(epoch from now()) * 1000),
	('Molienda', 'Libra', 0, extract(epoch from now()) * 1000),
	('Molienda', 'Kilo', 0, extract(epoch from now()) * 1000),
	('Molienda', 'Cuarterón', 0, extract(epoch from now()) * 1000),
	('Bolsas', 'Media lb', 0, extract(epoch from now()) * 1000),
	('Bolsas', 'Libra', 0, extract(epoch from now()) * 1000),
	('Bolsas', 'Kilo', 0, extract(epoch from now()) * 1000),
	('Bolsas', 'Cuarterón', 0, extract(epoch from now()) * 1000);
