-- Ejecuta esto en el SQL Editor de Supabase.
--
-- Costos internos editables, usados SOLO para calcular "Margen estimado
-- por lote" en Resumen — aparte de las tarifas de Maquila (lo que le
-- cobras a un cliente de maquila por tostar/empacar puede ser distinto
-- de lo que te cuesta a ti hacerlo con tu propio café). Una sola fila
-- (id fijo 1, se sobreescribe con upsert, no se acumula histórico).
CREATE TABLE IF NOT EXISTS "costos_margen" (
  "id" integer PRIMARY KEY DEFAULT 1,
  "costo_tostion_kg" numeric NOT NULL DEFAULT 0,
  "costo_bolsa_media_lb" numeric NOT NULL DEFAULT 0,
  "costo_bolsa_libra" numeric NOT NULL DEFAULT 0,
  "costo_bolsa_kilo" numeric NOT NULL DEFAULT 0,
  "costo_bolsa_cuarteron" numeric NOT NULL DEFAULT 0,
  "ts" bigint NOT NULL,
  CONSTRAINT "costos_margen_una_fila" CHECK ("id" = 1)
);
