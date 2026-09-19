-- Ejecuta esto en el SQL Editor de Supabase. Crea la tabla de precios de
-- café (antes estaban fijos en el código) y la carga con tus precios reales
-- de Lavado. Para Honey, Natural y Exóticos dejé valores de referencia
-- (marcados abajo) — ajústalos tú mismo desde Configuración → Precios de
-- café en la app, no hace falta volver a tocar código.

CREATE TABLE "precios_cafe" (
	"id" serial PRIMARY KEY,
	"lote" text NOT NULL,
	"presentacion" text NOT NULL,
	"tipo_cliente" text NOT NULL, -- 'normal' o 'distribuidor'
	"precio" integer DEFAULT 0 NOT NULL,
	"ts" bigint NOT NULL,
	UNIQUE ("lote", "presentacion", "tipo_cliente")
);

-- ===== LAVADO — tus precios reales =====
INSERT INTO precios_cafe (lote, presentacion, tipo_cliente, precio, ts) VALUES
	('Lavado', 'Libra', 'normal', 37000, extract(epoch from now())*1000),
	('Lavado', 'Media lb', 'normal', 20000, extract(epoch from now())*1000),
	('Lavado', 'Kilo', 'normal', 74000, extract(epoch from now())*1000),
	('Lavado', 'Cuarterón', 'normal', 185000, extract(epoch from now())*1000),
	('Lavado', 'Libra', 'distribuidor', 35000, extract(epoch from now())*1000),
	('Lavado', 'Cuarterón', 'distribuidor', 175000, extract(epoch from now())*1000),
	-- Estos dos no me los diste: los dejé calculados igual que el patrón de
	-- Lavado normal (Kilo = 2x Libra). Ajústalos si no son correctos.
	('Lavado', 'Media lb', 'distribuidor', 18000, extract(epoch from now())*1000),
	('Lavado', 'Kilo', 'distribuidor', 70000, extract(epoch from now())*1000);

-- ===== HONEY — valores de referencia, revísalos =====
INSERT INTO precios_cafe (lote, presentacion, tipo_cliente, precio, ts) VALUES
	('Honey', 'Libra', 'normal', 50000, extract(epoch from now())*1000),
	('Honey', 'Media lb', 'normal', 25000, extract(epoch from now())*1000),
	('Honey', 'Kilo', 'normal', 100000, extract(epoch from now())*1000),
	('Honey', 'Cuarterón', 'normal', 250000, extract(epoch from now())*1000),
	('Honey', 'Libra', 'distribuidor', 50000, extract(epoch from now())*1000),
	('Honey', 'Media lb', 'distribuidor', 25000, extract(epoch from now())*1000),
	('Honey', 'Kilo', 'distribuidor', 100000, extract(epoch from now())*1000),
	('Honey', 'Cuarterón', 'distribuidor', 250000, extract(epoch from now())*1000);

-- ===== NATURAL — valores de referencia, revísalos =====
INSERT INTO precios_cafe (lote, presentacion, tipo_cliente, precio, ts) VALUES
	('Natural', 'Libra', 'normal', 52000, extract(epoch from now())*1000),
	('Natural', 'Media lb', 'normal', 26000, extract(epoch from now())*1000),
	('Natural', 'Kilo', 'normal', 104000, extract(epoch from now())*1000),
	('Natural', 'Cuarterón', 'normal', 260000, extract(epoch from now())*1000),
	('Natural', 'Libra', 'distribuidor', 52000, extract(epoch from now())*1000),
	('Natural', 'Media lb', 'distribuidor', 26000, extract(epoch from now())*1000),
	('Natural', 'Kilo', 'distribuidor', 104000, extract(epoch from now())*1000),
	('Natural', 'Cuarterón', 'distribuidor', 260000, extract(epoch from now())*1000);

-- ===== EXÓTICO — tú dijiste que varía por lote ($35.000, $40.000 o
-- $45.000), así que dejé $40.000 (el intermedio) solo como punto de
-- partida en Media lb. Corrígelo cada vez que vendas según el exótico
-- específico — para eso el campo "Valor" de la línea siempre es editable.
INSERT INTO precios_cafe (lote, presentacion, tipo_cliente, precio, ts) VALUES
	('Exotico', 'Media lb', 'normal', 40000, extract(epoch from now())*1000),
	('Exotico', 'Libra', 'normal', 80000, extract(epoch from now())*1000),
	('Exotico', 'Kilo', 'normal', 160000, extract(epoch from now())*1000),
	('Exotico', 'Cuarterón', 'normal', 400000, extract(epoch from now())*1000),
	('Exotico', 'Media lb', 'distribuidor', 40000, extract(epoch from now())*1000),
	('Exotico', 'Libra', 'distribuidor', 80000, extract(epoch from now())*1000),
	('Exotico', 'Kilo', 'distribuidor', 160000, extract(epoch from now())*1000),
	('Exotico', 'Cuarterón', 'distribuidor', 400000, extract(epoch from now())*1000);
