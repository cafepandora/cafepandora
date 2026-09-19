-- Ejecuta esto en el SQL Editor de Supabase DESPUÉS de migracion_trazabilidad.sql.
-- Agrega el peso real del café verde después de trillar. Sin este dato no se
-- puede calcular el rendimiento real pergamino -> verde de tu finca; solo
-- quedaría el factor genérico.

ALTER TABLE cosechas ADD COLUMN IF NOT EXISTS kilos_verde_real double precision;
ALTER TABLE compras_pergamino ADD COLUMN IF NOT EXISTS kilos_verde_real double precision;
