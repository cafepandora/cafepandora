-- Ejecuta esto en el SQL Editor de Supabase.
-- Historial del precio interno de referencia que publica la Federación
-- Nacional de Cafeteros (café pergamino seco, carga de 125 kg) — lo llena
-- el cron de functions/api/cron/precio-fnc.ts, no se registra a mano.

CREATE TABLE IF NOT EXISTS "precio_cafe_fnc" (
  "fecha" text PRIMARY KEY,       -- 'YYYY-MM-DD', la fecha que publica la Federación (no la del scrape)
  "precio_carga" numeric,         -- precio por carga de 125 kg de pergamino seco
  "bolsa_ny" numeric,             -- bolsa de NY (The Ice), centavos de dólar por libra
  "tasa_cambio" numeric,          -- tasa de cambio COP/USD usada ese día
  "ts" bigint NOT NULL            -- cuándo se guardó este registro (para saber qué tan fresco está)
);
