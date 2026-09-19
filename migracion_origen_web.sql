-- Ejecuta esto en el SQL Editor de Supabase.
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS origen_web boolean NOT NULL DEFAULT false;
