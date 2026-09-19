-- Cuentas de cobro ahora se pueden emitir a nombre de Juan David o de
-- Inés (antes siempre era a nombre de Juan). 'titular' guarda cuál —
-- las filas viejas quedan NULL, el frontend las trata como 'juan'.
ALTER TABLE "cuentas_cobro" ADD COLUMN IF NOT EXISTS "titular" text;
