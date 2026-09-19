-- Ejecuta esto en el SQL Editor de Supabase.
-- Agrega el seguimiento de fermentación en caneca (Honey/Natural) a cosechas:
-- cuándo empezó, cuántas horas se va a dejar, y si ya se mandó la alerta de
-- WhatsApp para no repetirla.

ALTER TABLE "cosechas" ADD COLUMN IF NOT EXISTS "fermentacion_inicio" bigint;
ALTER TABLE "cosechas" ADD COLUMN IF NOT EXISTS "fermentacion_horas" numeric;
ALTER TABLE "cosechas" ADD COLUMN IF NOT EXISTS "fermentacion_alertado" boolean DEFAULT false;
