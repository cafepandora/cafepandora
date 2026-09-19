-- Ejecuta esto en el SQL Editor de Supabase.
-- Crea una tercera tarifa de precios ("web"), independiente de "normal" y
-- "distribuidor" — la usa solo la página pública de pedidos. Arranca con
-- una copia de los precios normales, para que no quede en $0; ajústalos
-- luego en Configuración → Precios de la página web.

INSERT INTO precios_cafe (lote, presentacion, tipo_cliente, precio, ts)
SELECT lote, presentacion, 'web', precio, extract(epoch from now()) * 1000
FROM precios_cafe
WHERE tipo_cliente = 'normal'
ON CONFLICT (lote, presentacion, tipo_cliente) DO NOTHING;
