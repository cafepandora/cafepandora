-- Transferencia directa entre socios (Juan/Inés/Joaquín, en cualquier orden),
-- categoría "Transferencia entre cuentas" en Gastos. Reutiliza pagado_por
-- (quién transfiere) y agrega a quién llega la plata.
ALTER TABLE "gastos" ADD COLUMN IF NOT EXISTS "transferido_a" text;
