-- Ejecuta esto en el SQL Editor de Supabase.
--
-- "Margen estimado por lote" (Resumen) restaba un solo costo fijo por
-- kilo tostado: Tostión (`costos_margen.costo_tostion_kg`). Juan pidió
-- poder agregar otros costos que también se reparten por kg tostado (ej.
-- gas) sin que cada uno necesite su propia columna nueva cada vez.
--
-- `costos_por_kg` (jsonb) guarda una lista de { nombre, costoPorKg } —
-- Tostión pasa a ser una fila más de esa lista, ya no un caso especial
-- aparte. El cálculo de margen ahora suma el costoPorKg de TODA la lista
-- y multiplica por los kilos tostados de cada lote (antes solo
-- multiplicaba por el costo de Tostión).
--
-- Esta migración agrega la columna nueva y, si ya había un costo de
-- Tostión configurado, lo convierte en la primera fila de la lista (para
-- no perderlo) — `costo_tostion_kg` (la columna vieja) se queda en la
-- tabla sin usarse, no se borra, por si hace falta consultarla después.
-- Segura de correr más de una vez.

ALTER TABLE costos_margen ADD COLUMN IF NOT EXISTS costos_por_kg jsonb;

UPDATE costos_margen
SET costos_por_kg = jsonb_build_array(jsonb_build_object('nombre', 'Tostión', 'costoPorKg', costo_tostion_kg))
WHERE id = 1 AND costos_por_kg IS NULL AND costo_tostion_kg IS NOT NULL AND costo_tostion_kg > 0;

UPDATE costos_margen
SET costos_por_kg = '[]'::jsonb
WHERE id = 1 AND costos_por_kg IS NULL;
