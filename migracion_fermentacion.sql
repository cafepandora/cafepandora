-- Ejecuta esto en el SQL Editor de Supabase.
-- Agrega el seguimiento de fermentación en caneca (Honey/Natural) a cosechas:
-- cuándo empezó, cuándo se planea sacarla, y si ya se mandó la alerta de
-- WhatsApp para no repetirla.

ALTER TABLE "cosechas" ADD COLUMN IF NOT EXISTS "fermentacion_inicio" bigint;
ALTER TABLE "cosechas" ADD COLUMN IF NOT EXISTS "fermentacion_fin" bigint;
ALTER TABLE "cosechas" ADD COLUMN IF NOT EXISTS "fermentacion_alertado" boolean DEFAULT false;
