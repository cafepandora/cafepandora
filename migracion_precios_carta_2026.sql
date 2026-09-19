-- Ejecuta esto en el SQL Editor de Supabase.
-- Pone los precios reales de tu "Lista de precios 2026" en la tarifa "web"
-- (la que ve cualquiera en la página pública). Honey y Natural solo se
-- venden en Media libra por ahora, así que las demás presentaciones quedan
-- en $0 — la página ya las oculta solas cuando el precio es $0.

UPDATE precios_cafe SET precio = 22000  WHERE tipo_cliente = 'web' AND lote = 'Lavado' AND presentacion = 'Media lb';
UPDATE precios_cafe SET precio = 39000  WHERE tipo_cliente = 'web' AND lote = 'Lavado' AND presentacion = 'Libra';
UPDATE precios_cafe SET precio = 77000  WHERE tipo_cliente = 'web' AND lote = 'Lavado' AND presentacion = 'Kilo';
UPDATE precios_cafe SET precio = 190000 WHERE tipo_cliente = 'web' AND lote = 'Lavado' AND presentacion = 'Cuarterón';

UPDATE precios_cafe SET precio = 30000  WHERE tipo_cliente = 'web' AND lote = 'Honey' AND presentacion = 'Media lb';
UPDATE precios_cafe SET precio = 0      WHERE tipo_cliente = 'web' AND lote = 'Honey' AND presentacion IN ('Libra', 'Kilo', 'Cuarterón');

UPDATE precios_cafe SET precio = 32000  WHERE tipo_cliente = 'web' AND lote = 'Natural' AND presentacion = 'Media lb';
UPDATE precios_cafe SET precio = 0      WHERE tipo_cliente = 'web' AND lote = 'Natural' AND presentacion IN ('Libra', 'Kilo', 'Cuarterón');

-- Exóticos son de disponibilidad limitada y precio variable ($35.000-$40.000,
-- "preguntar por disponibilidad") — no encajan en un catálogo de autoservicio,
-- así que se ocultan de la página pública dejándolos en $0. Los sigues
-- vendiendo desde la app interna como siempre, con el valor a mano.
UPDATE precios_cafe SET precio = 0 WHERE tipo_cliente = 'web' AND lote = 'Exotico';
